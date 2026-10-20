'use strict';
// P10 Packaging Room (Room 09): reviewable title, thumbnail, description, chapter, tag and disclosure variants for
// one approved video. Revisions are immutable; thumbnails are drawn locally from the approved visuals with the
// pinned FFmpeg; Claude drafts only on an owner's click, inside a token reservation. Approval is named and
// becomes stale when the script, the reviewed render or the package changes. Nothing is published.
const fs = require('node:fs');
const F = require('./fonts');
const path = require('node:path');
const {randomUUID, createHash} = require('node:crypto');
const R = require('./render');
const P = require('./packaging');
const {AiError, jsonText} = require('./ai');
const {InputError} = require('./store');
const {messageTokenUpperBound} = require('./writer');
const {connectorReference, connectorCurrent} = require('./intel-sources');
const {requireValue, now, object, person, text} = R;

const ANSWER_TOKENS = 6000, MAX_SHOTS_IN_PROMPT = 150;
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');

class PackagingRoom {
  constructor(store, scenes, renders, editing, connectors, ai, {dataRoot} = {}) {
    Object.assign(this, {store, db: store.db, scenes, renders, editing, connectors, ai, busy: false});
    this.dataRoot = dataRoot || renders.dataRoot;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS package_revisions(id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id), content_id TEXT NOT NULL REFERENCES content(id), revision INTEGER NOT NULL, content_revision INTEGER NOT NULL, parent_id TEXT, actor TEXT NOT NULL, payload TEXT NOT NULL, payload_hash TEXT NOT NULL, images TEXT NOT NULL, checks TEXT NOT NULL, note TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(content_id, revision));
      CREATE TRIGGER IF NOT EXISTS package_revisions_immutable BEFORE UPDATE ON package_revisions BEGIN SELECT RAISE(ABORT, 'Package revisions are immutable.'); END;
      CREATE TABLE IF NOT EXISTS package_approvals(id TEXT PRIMARY KEY, revision_id TEXT NOT NULL REFERENCES package_revisions(id), content_id TEXT NOT NULL, content_revision INTEGER NOT NULL, render_id TEXT NOT NULL, approved_by TEXT NOT NULL, notes TEXT NOT NULL, confirmations TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS package_jobs(id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id), content_id TEXT NOT NULL, status TEXT NOT NULL, scope TEXT NOT NULL, revision_id TEXT, error TEXT, attempts INTEGER NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    `);
    for (const row of this.db.prepare("SELECT id FROM package_jobs WHERE status='running'").all()) {
      this.db.prepare("UPDATE package_jobs SET status='interrupted', error='The program stopped while Claude was drafting. Token use is unknown; retry deliberately.', updated_at=? WHERE id=?").run(now(), row.id);
      this.db.prepare("UPDATE intelligence_usage SET status='unknown', updated_at=? WHERE job_id=? AND status='reserved'").run(now(), row.id);
    }
  }

  // ------------------------------------------------------------ inputs
  // Everything a package is made from: the approved script, the approved board's shots and their rights,
  // the draft chapters of the current edit, the voice's ownership and the render the owner approved in Room 08.
  inputs(contentId) {
    const content = this.store.content(contentId), family = this.store.family(content.familyId), blockers = [];
    if (content.state !== 'approved') blockers.push('Approve the script first.');
    const visual = this.scenes.handoff(contentId);
    let shots = [], spec = null;
    if (visual.ready) {
      const approval = this.db.prepare('SELECT * FROM visual_approvals WHERE id=?').get(visual.approvalId), snapshot = JSON.parse(approval.snapshot);
      const manifest = this.scenes.manifestRow(visual.manifestId), payload = JSON.parse(manifest.payload);
      spec = JSON.parse(this.renders.styles.revisionRow(manifest.style_revision_id).spec);
      const planned = new Map(payload.scenes.flatMap(scene => scene.shots.map(shot => [shot.id, {shot, scene}])));
      shots = snapshot.shots.map(item => {
        const asset = this.scenes.assetRow(item.assetId), probe = JSON.parse(asset.probe), plan = planned.get(item.shotId);
        return {label: item.label, shotId: item.shotId, assetId: asset.id, origin: asset.origin, mediaType: asset.media_type, relativePath: asset.relative_path, sha256: asset.sha256, durationSeconds: probe.durationSeconds || null,
          rights: JSON.parse(asset.rights), purpose: plan?.scene.purpose || '', direction: String(plan?.scene.direction || '').slice(0, 160), onScreenText: plan?.scene.onScreenText || ''};
      });
    } else blockers.push(visual.blocker || 'Approve the visuals in Room 04.');
    // Draft chapters come from the current edit (pauses and topic shifts); the owner retitles them.
    let chapters = [];
    try { const edit = this.editing.inputs(content); if (edit.ready && family.format === 'long-form') { const draft = this.editing.craft(edit).chapters; if (draft?.valid) chapters = draft.chapters.map(item => ({at: item.start, title: item.title})); } } catch { chapters = []; }
    const approvedRender = this.approvedRender(contentId);
    const voice = this.store.voiceProfiles(family.id).at(-1)?.rights?.ownershipBasis || null;
    return {content, family, shots, spec, chapters, approvedRender, voice, blockers, ready: !blockers.length};
  }
  // The newest render the owner approved in Room 08 that is still current (the package's video).
  approvedRender(contentId) {
    for (const row of this.db.prepare("SELECT id FROM render_jobs WHERE content_id=? AND status='completed' AND review IS NOT NULL ORDER BY created_at DESC, rowid DESC").all(contentId)) {
      const report = this.renders.qcReport(row.id);
      if (report.status === 'approved') return {id: row.id, reviewer: report.verdict.reviewer, at: report.verdict.at};
    }
    return null;
  }

  // ------------------------------------------------------------ revisions
  latestRow(contentId) { return this.db.prepare('SELECT * FROM package_revisions WHERE content_id=? ORDER BY revision DESC LIMIT 1').get(contentId) || null; }
  revisionRow(id) { const row = this.db.prepare('SELECT * FROM package_revisions WHERE id=?').get(id); requireValue(row, 'Package revision not found.', 404); return row; }
  // Thumbnails are content-addressed: the same shot, frame, words and layout give the same file, drawn once.
  async drawThumbnails(payload, inputs) {
    const readiness = this.renders.latestReadiness(), pin = this.renders.pinCheck();
    requireValue(pin.ok, `Thumbnails are drawn with the pinned FFmpeg. ${pin.reason}`, 409);
    requireValue(['ass', 'eq', 'vignette'].every(name => readiness?.filters?.[name] === true), 'Thumbnails need the FFmpeg "ass", "eq" and "vignette" filters. Run the readiness check again (Room 05) and pin the build.', 409);
    const dir = path.join(this.dataRoot, 'packaging', inputs.family.id, inputs.content.id), images = {};
    fs.mkdirSync(dir, {recursive: true});
    for (const thumb of payload.thumbnails) {
      const shot = inputs.shots.find(item => item.label === thumb.shot), video = shot.mediaType === 'video';
      const at = video ? Math.min(thumb.at, Math.max(0, (shot.durationSeconds || 1) - 0.1)) : 0;
      const ass = P.thumbnailAss({text: thumb.text, accent: thumb.accent, layout: thumb.layout, font: F.resolve(inputs.spec?.typography?.headingFont || 'Arial'), accentColour: inputs.spec?.palette?.accent});
      const specHash = hash({asset: shot.sha256, at, ass, ffmpeg: pin.pin.ffmpegSha256}), file = path.join(dir, `${specHash.slice(0, 32)}.jpg`);
      if (!fs.existsSync(file)) {
        const source = this.renders.localFile(shot.relativePath);
        requireValue(fs.existsSync(source) && R.fileSha256(source) === shot.sha256, `${shot.label}: the approved visual file is missing or changed.`, 409);
        const work = fs.mkdtempSync(path.join(dir, '.draw-'));
        try {
          fs.writeFileSync(path.join(work, 'thumb.ass'), ass);
          await R.run(pin.paths.ffmpeg, P.thumbnailArgs({input: source, at, video, ass: 'thumb.ass', output: 'thumb.jpg'}), {cwd: work, timeout: 60000});
          fs.renameSync(path.join(work, 'thumb.jpg'), file);
        } finally { fs.rmSync(work, {recursive: true, force: true}); }
      }
      const probe = JSON.parse((await R.run(pin.paths.ffprobe, ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'json', file], {timeout: 30000})).stdout).streams[0];
      images[thumb.id] = {relativePath: path.relative(this.dataRoot, file).replaceAll('\\', '/'), sha256: R.fileSha256(file), sizeBytes: fs.statSync(file).size, width: probe.width, height: probe.height};
    }
    return images;
  }
  async insertRevision({inputs, payload, actor, note, createdBy, expectedRevision = null}) {
    const images = await this.drawThumbnails(payload, inputs);
    return this.store.transaction(() => {
      const latest = this.latestRow(inputs.content.id), content = this.store.content(inputs.content.id);
      requireValue(content.revision === inputs.content.revision, 'The script changed while the package was being prepared. Reload and try again.', 409);
      if (expectedRevision !== null) requireValue((latest?.revision || 0) === expectedRevision, `This package changed (now r${latest?.revision || 0}). Reload before saving.`, 409);
      const checks = P.checkPackage(payload, {script: content.script, locale: inputs.family.primaryLocale, writingVoice: inputs.family.writingVoice, assets: inputs.shots.map(shot => ({id: shot.assetId, label: shot.label, origin: shot.origin, rights: shot.rights})), voice: inputs.voice, actor, images});
      const id = randomUUID(), revision = (latest?.revision || 0) + 1;
      this.db.prepare('INSERT INTO package_revisions(id,family_id,content_id,revision,content_revision,parent_id,actor,payload,payload_hash,images,checks,note,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(id, inputs.family.id, content.id, revision, content.revision, latest?.id || null, actor, JSON.stringify(payload), hash(payload), JSON.stringify(images), JSON.stringify(checks), note, createdBy, now());
      this.store.event(`Package r${revision} for "${content.title}" (${actor === 'claude' ? 'Claude draft' : actor === 'rules' ? 'started from the script' : `edited by ${createdBy}`})`);
      return this.publicRevision(this.revisionRow(id));
    });
  }
  // A free start: the working title, three thumbnail variants on the hook, a turn and the closing shot, the
  // draft chapters and the disclosure the visuals call for. The owner writes the words.
  async startFromScript(contentId, input) {
    object(input);
    const by = person(input.requestedBy), inputs = this.inputs(contentId);
    requireValue(inputs.ready, inputs.blockers[0], 409);
    const pick = purposes => inputs.shots.find(shot => purposes.includes(shot.purpose)) || inputs.shots[0];
    const chosen = [pick(['hook']), pick(['turn', 'evidence', 'example']), inputs.shots.at(-1)];
    const synthetic = inputs.shots.some(shot => shot.rights?.disclosure === 'required');
    const usesAi = inputs.shots.some(shot => shot.origin === 'ai') || !!inputs.voice;
    const payload = P.normalise({titles: [{text: inputs.content.title, why: 'The working title of the approved script.'}],
      thumbnails: chosen.map((shot, k) => ({text: '', shot: shot.label, at: shot.mediaType === 'video' ? Math.min(1, (shot.durationSeconds || 1) / 2) : 0, layout: ['left', 'right', 'bottom'][k], concept: shot.direction})),
      description: inputs.content.angle, tags: [], disclosure: {synthetic, note: usesAi ? 'Researched and written by this channel. AI tools helped with visuals and narration.' : ''}}, {shots: inputs.shots, chapters: inputs.chapters});
    return this.insertRevision({inputs, payload, actor: 'rules', note: 'Started from the approved script', createdBy: by});
  }
  async save(contentId, input) {
    object(input);
    const by = person(input.createdBy), inputs = this.inputs(contentId);
    requireValue(inputs.ready, inputs.blockers[0], 409);
    requireValue(Number.isSafeInteger(input.expectedRevision), 'Reload the package before saving.', 409);
    let payload;
    try { payload = P.normalise(input.package, {shots: inputs.shots, chapters: inputs.chapters}); } catch (error) { throw new InputError(error.message, 400); }
    const latest = this.latestRow(contentId);
    requireValue((latest?.revision || 0) === input.expectedRevision, `This package changed (now r${latest?.revision || 0}). Reload before saving.`, 409);
    requireValue(!latest || hash(payload) !== latest.payload_hash, 'Nothing changed.', 400);
    return this.insertRevision({inputs, payload, actor: 'owner', note: text(input.note || 'Owner edit', 'Note', 1, 300), createdBy: by, expectedRevision: input.expectedRevision});
  }

  // ------------------------------------------------------------ Claude drafts
  promptInput(inputs) {
    const shots = inputs.shots.length > MAX_SHOTS_IN_PROMPT ? Array.from({length: MAX_SHOTS_IN_PROMPT}, (_, k) => inputs.shots[Math.floor(k * inputs.shots.length / MAX_SHOTS_IN_PROMPT)]) : inputs.shots;
    const skills = this.store.skillRuntime?.brief('packaging.title', inputs.family.id) || null;
    return {family: {name: inputs.family.name, niche: inputs.family.niche, audience: inputs.family.audience, locale: inputs.family.primaryLocale, format: inputs.family.format, ...(inputs.family.writingVoice ? {writingVoice: inputs.family.writingVoice} : {})},
      video: {title: inputs.content.title, angle: inputs.content.angle, hook: inputs.content.hook, script: inputs.content.script},
      chapters: inputs.chapters.map(item => ({at: item.at, draftTitle: item.title})),
      shots: shots.map(shot => ({label: shot.label, media: shot.mediaType, ...(shot.durationSeconds ? {seconds: Math.round(shot.durationSeconds)} : {}), purpose: shot.purpose, direction: shot.direction, ...(shot.onScreenText ? {onScreenText: shot.onScreenText} : {})})),
      ...(skills ? {skills: skills.prompt} : {})};
  }
  queueDraft(contentId, input) {
    object(input);
    const by = person(input.requestedBy), inputs = this.inputs(contentId);
    requireValue(inputs.ready, inputs.blockers[0], 409);
    const connector = connectorReference(this.connectors, input.connector, 'ai', 'Claude', true);
    return this.store.transaction(() => {
      requireValue(!this.db.prepare("SELECT 1 FROM package_jobs WHERE content_id=? AND status IN ('queued','running')").get(contentId), 'Claude is already drafting this package.', 409);
      const promptInput = this.promptInput(inputs), tokenLimit = messageTokenUpperBound(P.packageMessages(promptInput)) + ANSWER_TOKENS;
      const id = randomUUID(), at = now();
      this.db.prepare("INSERT INTO package_jobs(id,family_id,content_id,status,scope,attempts,created_by,created_at,updated_at) VALUES(?,?,?,'queued',?,0,?,?,?)").run(id, inputs.family.id, contentId, JSON.stringify({contentRevision: inputs.content.revision, connector, promptInput, tokenLimit}), by, at, at);
      this.store.event(`Queued a Claude package draft for "${inputs.content.title}"`);
      return this.publicJob(this.jobRow(id));
    });
  }
  jobRow(id) { const row = this.db.prepare('SELECT * FROM package_jobs WHERE id=?').get(id); requireValue(row, 'Package job not found.', 404); return row; }
  publicJob(row) { const usage = this.db.prepare('SELECT * FROM intelligence_usage WHERE job_id=?').get(row.id); return {id: row.id, contentId: row.content_id, status: row.status, error: row.error, attempts: row.attempts, revisionId: row.revision_id, createdBy: row.created_by, createdAt: row.created_at, usage: usage ? {status: usage.status, total: usage.total_tokens, reserved: usage.reserved_tokens} : null}; }
  retryDraft(id, input) {
    object(input);
    return this.store.transaction(() => {
      const row = this.jobRow(id);
      requireValue(['failed', 'interrupted', 'quality_failed', 'blocked_budget', 'stale'].includes(row.status), `A ${row.status} draft cannot be retried.`, 409);
      requireValue(row.attempts < 3, 'This draft already used 3 attempts. Ask for a new one.', 409);
      if (row.status === 'interrupted') requireValue(input.confirmInterrupted === true, 'The last attempt was interrupted and Claude may have used tokens. Confirm the deliberate retry.', 409);
      if (this.db.prepare('SELECT 1 FROM intelligence_usage WHERE job_id=?').get(id)) this.db.prepare('UPDATE intelligence_usage SET job_id=? WHERE job_id=?').run(`${id}:attempt${row.attempts}`, id);
      this.db.prepare("UPDATE package_jobs SET status='queued', error=NULL, updated_at=? WHERE id=?").run(now(), id);
      return this.publicJob(this.jobRow(id));
    });
  }
  claim() {
    return this.store.transaction(() => {
      const row = this.db.prepare("SELECT * FROM package_jobs WHERE status='queued' ORDER BY created_at, rowid LIMIT 1").get();
      if (!row) return null;
      const scope = JSON.parse(row.scope), family = this.store.family(row.family_id), at = now();
      const stop = (status, error) => { this.db.prepare('UPDATE package_jobs SET status=?, error=?, updated_at=? WHERE id=?').run(status, error, at, row.id); return null; };
      if (this.store.content(row.content_id).revision !== scope.contentRevision) return stop('stale', 'The script changed before Claude started. Nothing was sent.');
      if (!connectorCurrent(this.connectors, scope.connector, 'ai')) return stop('stale', 'The Claude connection changed or is not tested. Nothing was sent.');
      const summary = this.store.usageSummary(family.id);
      if (summary.settledTokens + summary.reservedTokens + scope.tokenLimit > family.tokenBudget.monthlyLimit) return stop('blocked_budget', 'The family monthly token limit cannot reserve this draft. Raise it or wait for next month.');
      this.db.prepare("INSERT INTO intelligence_usage(job_id,family_id,kind,period_month,status,reserved_tokens,created_at,updated_at) VALUES(?,?,'packaging',?,'reserved',?,?,?)").run(row.id, family.id, this.store.tokenPeriod(family), scope.tokenLimit, at, at);
      this.db.prepare("UPDATE package_jobs SET status='running', attempts=attempts+1, updated_at=? WHERE id=?").run(at, row.id);
      return {...row, scope};
    });
  }
  async processNext() {
    if (this.busy) return null;
    const job = this.claim();
    if (!job) return null;
    this.busy = true;
    let started = false, usage = null;
    const settle = (status, at) => this.db.prepare('UPDATE intelligence_usage SET status=?, prompt_tokens=?, completion_tokens=?, total_tokens=?, updated_at=? WHERE job_id=?').run(status, usage?.promptTokens ?? null, usage?.completionTokens ?? null, usage?.totalTokens ?? null, at, job.id);
    try {
      const reply = await this.ai.complete({connectorId: job.scope.connector.id, task: 'packaging', messages: P.packageMessages(job.scope.promptInput), maxTokens: ANSWER_TOKENS, onStart: () => { started = true; }});
      usage = reply.usage;
      const inputs = this.inputs(job.content_id);
      if (inputs.content.revision !== job.scope.contentRevision || !inputs.ready) throw Object.assign(new AiError('The script or board changed while Claude was drafting. The draft was not saved.'), {quality: true, stale: true});
      let payload;
      try { payload = P.parseDraft(JSON.parse(jsonText(reply.content)), {shots: inputs.shots, chapters: inputs.chapters}); } catch (error) { throw Object.assign(new AiError(`Claude's package was not usable: ${error.message}`), {quality: true}); }
      payload.disclosure = {synthetic: inputs.shots.some(shot => shot.rights?.disclosure === 'required'), note: inputs.shots.some(shot => shot.origin === 'ai') || inputs.voice ? 'Researched and written by this channel. AI tools helped with visuals and narration.' : ''};
      const revision = await this.insertRevision({inputs, payload, actor: 'claude', note: `Claude draft (${reply.model})`, createdBy: job.created_by});
      this.store.transaction(() => { const at = now(); settle(Number.isSafeInteger(usage?.totalTokens) ? 'settled' : 'unknown', at); this.db.prepare("UPDATE package_jobs SET status='completed', revision_id=?, updated_at=? WHERE id=?").run(revision.id, at, job.id); });
      return revision;
    } catch (error) {
      this.store.transaction(() => {
        const at = now(), message = error instanceof AiError || error instanceof InputError ? error.message : 'The package draft failed.';
        if (error.quality || usage) { settle(Number.isSafeInteger(usage?.totalTokens) ? 'settled' : 'unknown', at); this.db.prepare('UPDATE package_jobs SET status=?, error=?, updated_at=? WHERE id=?').run(error.stale ? 'stale' : 'quality_failed', message, at, job.id); return; }
        this.db.prepare('UPDATE package_jobs SET status=?, error=?, updated_at=? WHERE id=?').run(started ? 'interrupted' : 'failed', message, at, job.id);
        this.db.prepare('UPDATE intelligence_usage SET status=?, reserved_tokens=CASE WHEN ? THEN reserved_tokens ELSE 0 END, updated_at=? WHERE job_id=?').run(started ? 'unknown' : 'released', started ? 1 : 0, at, job.id);
      });
      return null;
    } finally {
      this.busy = false;
    }
  }

  // ------------------------------------------------------------ approval and files
  approve(revisionId, input) {
    object(input);
    const by = person(input.approvedBy, 'Your name');
    return this.store.transaction(() => {
      const row = this.revisionRow(revisionId), latest = this.latestRow(row.content_id), content = this.store.content(row.content_id), checks = JSON.parse(row.checks);
      requireValue(latest.id === row.id, `A newer package revision exists (r${latest.revision}). Approve that one.`, 409);
      requireValue(content.state === 'approved' && content.revision === row.content_revision, 'The script changed after this package. Make a new revision.', 409);
      const render = this.approvedRender(row.content_id);
      requireValue(render, 'Approve the render in Room 08 (Review & QC) first. The package belongs to an approved video.', 409);
      requireValue(checks.passed, `Fix the critical package checks first: ${checks.issues.find(item => item.severity === 'critical')?.message}`, 409);
      for (const image of Object.values(JSON.parse(row.images))) { const file = this.renders.localFile(image.relativePath); requireValue(fs.existsSync(file) && R.fileSha256(file) === image.sha256, 'A thumbnail file is missing or changed. Save the package again.', 409); }
      const c = object(input.confirmations, 'Confirmations');
      for (const [key, message] of [['titleHonest', 'Confirm that the chosen title is paid off by the video.'], ['thumbnailChecked', 'Confirm that you judged the chosen thumbnail at phone size and it promises nothing the video does not show.'], ['disclosureReviewed', 'Confirm that the altered or synthetic content choice and the AI note are right for this video.'], ['creditsReviewed', 'Confirm that the visual credits are complete.']]) requireValue(c[key] === true, message);
      const id = randomUUID();
      this.db.prepare('INSERT INTO package_approvals(id,revision_id,content_id,content_revision,render_id,approved_by,notes,confirmations,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(id, row.id, row.content_id, row.content_revision, render.id, by, text(input.notes || '', 'Notes', 0, 2000), JSON.stringify({titleHonest: true, thumbnailChecked: true, disclosureReviewed: true, creditsReviewed: true}), now());
      this.store.event(`Package r${row.revision} for "${content.title}" approved by ${by}`);
      return this.publicRevision(row);
    });
  }
  // An approval holds while it is the newest package, its script revision and its approved render are current.
  approvalFor(row) {
    const approval = this.db.prepare('SELECT * FROM package_approvals WHERE revision_id=? ORDER BY created_at DESC LIMIT 1').get(row.id);
    if (!approval) return null;
    const latest = this.latestRow(row.content_id), content = this.store.content(row.content_id), render = this.approvedRender(row.content_id);
    const reason = latest.id !== row.id ? 'A newer package revision was saved.' : content.revision !== approval.content_revision || content.state !== 'approved' ? 'The script changed.' : render?.id !== approval.render_id ? 'The approved render changed or is no longer approved.' : null;
    return {id: approval.id, approvedBy: approval.approved_by, notes: approval.notes, at: approval.created_at, renderId: approval.render_id, current: !reason, staleReason: reason};
  }
  // The package approval that stands now for a script (P11 attaches the final master to it): the newest revision's
  // approval while it is current.
  currentApproval(contentId) {
    const latest = this.latestRow(contentId), approval = latest ? this.approvalFor(latest) : null;
    return approval?.current ? {id: approval.id, revision: latest.revision, renderId: approval.renderId, approvedBy: approval.approvedBy, at: approval.at} : null;
  }
  thumbnailFile(revisionId, thumbId) {
    const images = JSON.parse(this.revisionRow(revisionId).images), image = images[thumbId];
    requireValue(image, 'Thumbnail not found.', 404);
    const file = this.renders.localFile(image.relativePath);
    requireValue(fs.existsSync(file) && R.fileSha256(file) === image.sha256, 'The thumbnail file is missing or changed.', 409);
    return file;
  }
  // What the owner pastes into YouTube Studio by hand; nothing is uploaded.
  exportText(revisionId) {
    const row = this.revisionRow(revisionId), payload = JSON.parse(row.payload), checks = JSON.parse(row.checks), content = this.store.content(row.content_id);
    const title = payload.titles.find(item => item.id === payload.chosenTitle).text;
    return {filename: `${content.title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || 'package'}-package-r${row.revision}.txt`,
      text: [`TITLE\n${title}`, `DESCRIPTION\n${checks.description}`, `TAGS\n${payload.tags.join(', ')}`, `ALTERED OR SYNTHETIC CONTENT (YouTube Studio checkbox)\n${payload.disclosure.synthetic ? 'Yes' : 'No'}`, `THUMBNAIL\nUpload thumbnail ${payload.chosenThumbnail.slice(1)} (the downloaded 1280x720 JPEG).`].join('\n\n') + '\n'};
  }
  publicRevision(row) {
    const payload = JSON.parse(row.payload), images = JSON.parse(row.images);
    return {id: row.id, contentId: row.content_id, revision: row.revision, contentRevision: row.content_revision, actor: row.actor, note: row.note, createdBy: row.created_by, createdAt: row.created_at, payload, checks: JSON.parse(row.checks),
      images: Object.fromEntries(Object.entries(images).map(([key, image]) => [key, {...image, url: `/api/package-revisions/${row.id}/thumbnails/${key}`}])), approval: this.approvalFor(row)};
  }
  state() {
    const contents = this.store.contents().filter(content => content.state === 'approved' || this.db.prepare('SELECT 1 FROM package_revisions WHERE content_id=? LIMIT 1').get(content.id));
    return {
      busy: !!this.db.prepare("SELECT 1 FROM package_jobs WHERE status IN ('queued','running') LIMIT 1").get(),
      contents: contents.map(content => {
        const inputs = (() => { try { return this.inputs(content.id); } catch (error) { return {ready: false, blockers: [error.message], shots: [], chapters: [], approvedRender: null}; } })();
        const latest = this.latestRow(content.id);
        return {contentId: content.id, familyId: content.familyId, title: content.title, ready: inputs.ready, blockers: inputs.blockers, approvedRender: inputs.approvedRender,
          shots: inputs.shots.map(shot => ({label: shot.label, mediaType: shot.mediaType, durationSeconds: shot.durationSeconds, purpose: shot.purpose})), chapters: inputs.chapters,
          latest: latest ? this.publicRevision(latest) : null,
          history: this.db.prepare('SELECT id, revision, actor, note, created_by, created_at FROM package_revisions WHERE content_id=? ORDER BY revision DESC LIMIT 20').all(content.id).map(item => ({id: item.id, revision: item.revision, actor: item.actor, note: item.note, createdBy: item.created_by, createdAt: item.created_at})),
          jobs: this.db.prepare('SELECT * FROM package_jobs WHERE content_id=? ORDER BY created_at DESC, rowid DESC LIMIT 5').all(content.id).map(row => this.publicJob(row))};
      }),
    };
  }
}

module.exports = {PackagingRoom};
