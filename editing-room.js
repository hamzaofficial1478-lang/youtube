'use strict';
// P06 - Editing Room. The editing brain (editing-brain.js) drafts an edit from the approved board, the
// measured narration and the family style; this room keeps every edit as an immutable revision, lets the
// owner change decisions with conflict protection, repairs one scene at a time, and hands an edit to the
// pinned renderer. A human style-proof verdict on the rendered edit is its approval (render-room.js).
const fs = require('node:fs');
const {randomUUID, createHash} = require('node:crypto');
const {InputError} = require('./store');
const B = require('./editing-brain');
const R = require('./render');
const C = require('./craft');
const Cap = require('./captions');
const Audio = require('./audio');
const Sk = require('./sketch');
const E = require('./engines');

const requireValue = (ok, message, status = 400) => { if (!ok) throw new InputError(message, status); };
const now = () => new Date().toISOString();
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const ANALYSIS_VERSION = 'silencedetect -35dB 0.18s v1';
const CUTS_VERSION = `scene>${R.SCENE_CUT_THRESHOLD} v1`;
const OVERRIDE_SKILL = {'set-transition': 'editing.transition-grammar', 'set-move': 'editing.still-image-motion', 'set-hold': 'editing.change-cadence', 'set-graphic': 'motion.graphic-type-selector', reorder: 'editing.opening-hook-construction'};
const OVERRIDE_REPEAT = 2;

function object(value, label = 'Request') { requireValue(value && typeof value === 'object' && !Array.isArray(value), `${label} must be a JSON object.`); return value; }
function text(value, label, min, max) {
  requireValue(typeof value === 'string', `${label} must be text.`);
  const result = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ').trim();
  requireValue(result.length >= min && result.length <= max, `${label} must contain ${min}-${max} characters.`);
  return result;
}
const person = (value, label = 'Your name') => text(value, label, 2, 80);

class EditingRoom {
  constructor(store, styles, sceneRoom, renderRoom, {ffmpeg = 'ffmpeg'} = {}) {
    this.store = store;
    this.db = store.db;
    this.styles = styles;
    this.scenes = sceneRoom;
    this.renders = renderRoom;
    this.ffmpeg = ffmpeg;
    this.busy = new Set();
    renderRoom.editing = this;
    this.migrate();
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS edit_timelines(id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id), content_id TEXT NOT NULL REFERENCES content(id), visual_approval_id TEXT NOT NULL, scope TEXT NOT NULL, scope_hash TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS edit_timeline_scope ON edit_timelines(content_id, scope_hash);
      CREATE TABLE IF NOT EXISTS edit_revisions(id TEXT PRIMARY KEY, timeline_id TEXT NOT NULL REFERENCES edit_timelines(id), revision INTEGER NOT NULL, parent_id TEXT, actor TEXT NOT NULL, payload TEXT NOT NULL, payload_hash TEXT NOT NULL, critique TEXT NOT NULL, ops TEXT NOT NULL, receipt TEXT NOT NULL, note TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(timeline_id, revision));
      CREATE TRIGGER IF NOT EXISTS edit_revisions_immutable BEFORE UPDATE ON edit_revisions BEGIN SELECT RAISE(ABORT, 'Edit revisions are immutable; make a new revision instead.'); END;
      CREATE TRIGGER IF NOT EXISTS edit_revisions_keep BEFORE DELETE ON edit_revisions BEGIN SELECT RAISE(ABORT, 'Edit revisions are kept for history and cannot be deleted.'); END;
      CREATE TABLE IF NOT EXISTS edit_analyses(id TEXT PRIMARY KEY, narration_sha256 TEXT NOT NULL, version TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(narration_sha256, version));
      CREATE TABLE IF NOT EXISTS media_analyses(sha256 TEXT NOT NULL, version TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(sha256, version));
    `);
  }

  // ------------------------------------------------------------ inputs
  // The same gate as the assembly preview: approved board, approved narration, an executable style.
  inputs(content) {
    const base = this.renders.inputs(content);
    if (!base.ready) return {...base, scope: null};
    const payload = JSON.parse(base.manifestRow.payload), snapshot = JSON.parse(base.approvalRow.snapshot);
    const planned = new Map(payload.scenes.flatMap(scene => scene.shots.map(shot => [shot.id, shot])));
    const assets = {}, files = {};
    for (const item of snapshot.shots) {
      requireValue(planned.has(item.shotId), `${item.label} is missing from the approved plan.`, 409);
      const row = this.scenes.assetRow(item.assetId), probe = JSON.parse(row.probe);
      assets[item.shotId] = {assetId: row.id, mediaType: row.media_type, clipSeconds: row.media_type === 'video' ? probe.durationSeconds || null : null, sha256: row.sha256, relativePath: row.relative_path, origin: row.origin, ...(row.origin === 'drawn' ? (rights => (rights.composition ? {composition: rights.composition} : {sketch: rights.sketch}))(JSON.parse(row.rights)) : {})};
      files[item.shotId] = row.relative_path;
    }
    const styleRow = this.styles.revisionRow(base.manifestRow.style_revision_id);
    const scope = {
      contentRevision: content.revision, visualApprovalId: base.visual.approvalId, manifestId: base.manifestRow.id, manifestRevision: base.manifestRow.revision, manifestHash: base.manifestRow.payload_hash,
      narration: {approvalId: base.voice.approvalId, sha256: base.voice.artifact.sha256, relativePath: base.voice.artifact.relativePath, durationSeconds: base.voice.analysis.durationSeconds, ...(base.voice.analysis.alignment?.words?.length ? {words: base.voice.analysis.alignment.words} : {})},
      style: {revisionId: styleRow.id, revision: styleRow.revision, specHash: styleRow.spec_hash, name: base.spec.name}, format: base.family.format,
    };
    return {...base, payload, snapshot, assets, files, scope, scopeHash: hash(scope), script: content.script};
  }

  // ------------------------------------------------------------ narration analysis (local, cached)
  async pauses(inputs) {
    const sha = inputs.scope.narration.sha256;
    const cached = this.db.prepare('SELECT payload FROM edit_analyses WHERE narration_sha256=? AND version=?').get(sha, ANALYSIS_VERSION);
    if (cached) return JSON.parse(cached.payload);
    const pin = this.renders.pinCheck();
    const ffmpeg = pin.ok ? pin.paths.ffmpeg : R.resolveExecutable(this.ffmpeg);
    let result;
    if (!ffmpeg) result = {pauses: [], measured: false, note: 'FFmpeg was not found, so cuts use the word-count estimate. Install and pin FFmpeg to measure pauses.'};
    else {
      const file = this.renders.localFile(inputs.scope.narration.relativePath);
      requireValue(fs.existsSync(file) && R.fileSha256(file) === sha, 'The approved narration file is missing or changed.', 409);
      try {
        const out = await R.run(ffmpeg, ['-hide_banner', '-nostdin', '-i', file, '-af', 'silencedetect=noise=-35dB:d=0.18', '-f', 'null', '-'], {timeout: Math.max(120000, inputs.scope.narration.durationSeconds * 1000)});
        result = {pauses: B.pausesFromSilence(out.stderr), measured: true, ffmpeg: pin.ok ? `pinned ${pin.pin.version}` : 'unpinned', note: 'Pauses measured in the approved narration with FFmpeg silencedetect.'};
      } catch (error) {
        result = {pauses: [], measured: false, note: `Pause measurement failed (${error.message}); cuts use the word-count estimate.`};
      }
    }
    if (result.measured) this.db.prepare('INSERT OR IGNORE INTO edit_analyses(id,narration_sha256,version,payload,created_at) VALUES(?,?,?,?,?)').run(randomUUID(), sha, ANALYSIS_VERSION, JSON.stringify(result), now());
    return result;
  }
  // Cuts hidden inside each approved stock video clip, measured once per file (assets are immutable, so the
  // SHA-256 is the cache key). Without FFmpeg the clips are used unmeasured, as before.
  async measureCuts(inputs) {
    const pin = this.renders.pinCheck();
    const ffmpeg = pin.ok ? pin.paths.ffmpeg : R.resolveExecutable(this.ffmpeg);
    if (!ffmpeg) return;
    // Drawn clips are drawn by the program (their flashes and wipes are planned), so only stock video is measured.
    for (const asset of Object.values(inputs.assets).filter(item => item.mediaType === 'video' && item.origin !== 'drawn')) {
      if (this.db.prepare('SELECT 1 FROM media_analyses WHERE sha256=? AND version=?').get(asset.sha256, CUTS_VERSION)) continue;
      const file = this.renders.localFile(asset.relativePath);
      requireValue(fs.existsSync(file) && R.fileSha256(file) === asset.sha256, 'An approved visual file is missing or changed.', 409);
      try {
        const cuts = await R.sceneCuts(ffmpeg, file);
        this.db.prepare('INSERT OR IGNORE INTO media_analyses(sha256,version,payload,created_at) VALUES(?,?,?,?)').run(asset.sha256, CUTS_VERSION, JSON.stringify({cuts}), now());
      } catch { /* unmeasured: the brain keeps its default window */ }
    }
  }
  cachedCuts(asset) {
    const row = asset.mediaType === 'video' && asset.origin !== 'drawn' ? this.db.prepare('SELECT payload FROM media_analyses WHERE sha256=? AND version=?').get(asset.sha256, CUTS_VERSION) : null;
    return row ? JSON.parse(row.payload).cuts : undefined;
  }
  brainInput(inputs, analysis, variants = {}) {
    const narrationSeconds = inputs.scope.narration.durationSeconds;
    const alignment = B.alignSentences(inputs.payload.sentences, analysis.pauses, narrationSeconds);
    const assets = Object.fromEntries(Object.entries(inputs.assets).map(([shotId, asset]) => {
      const cuts = this.cachedCuts(asset);
      return [shotId, {assetId: asset.assetId, mediaType: asset.mediaType, clipSeconds: asset.clipSeconds, ...(cuts ? {cuts} : {})}];
    }));
    return {
      alignment,
      edit: {fps: inputs.spec.canvas.frameRate, narrationSeconds, sentences: alignment.sentences, format: inputs.scope.format, spec: inputs.spec, assets, variants, pauses: analysis.pauses || [], locale: inputs.family.primaryLocale, measured: inputs.scope.narration.words || null,
        scenes: inputs.payload.scenes.map(scene => ({id: scene.id, label: scene.label, purpose: scene.purpose, onScreenText: scene.onScreenText, direction: scene.direction, sentenceStart: scene.sentenceStart, sentenceEnd: scene.sentenceEnd, shots: scene.shots.map(shot => ({id: shot.id, label: shot.label, motion: shot.motion, source: shot.source, ...(shot.cue ? {cue: shot.cue} : {})}))}))},
    };
  }
  // Approved skills that apply to editing for this family, recorded with every edit for provenance.
  skillsInForce(familyId) {
    const list = this.store.skillRuntime?.approved?.('editing.plan', familyId) || [];
    const review = this.store.skillRuntime?.approved?.('editing.review', familyId) || [];
    const seen = new Map();
    for (const item of [...list, ...review]) seen.set(item.id, item);
    return [...seen.values()];
  }

  // ------------------------------------------------------------ rows
  timelineRow(id) { const row = this.db.prepare('SELECT * FROM edit_timelines WHERE id=?').get(id); requireValue(row, 'Edit not found.', 404); return row; }
  revisionRow(id) { const row = this.db.prepare('SELECT * FROM edit_revisions WHERE id=?').get(id); requireValue(row, 'Edit revision not found.', 404); return row; }
  latestRow(timelineId) { return this.db.prepare('SELECT * FROM edit_revisions WHERE timeline_id=? ORDER BY revision DESC LIMIT 1').get(timelineId); }
  insertRevision({timeline, payload, parent = null, actor, ops = [], receipt = {}, note, createdBy, meta}) {
    const spec = JSON.parse(this.styles.revisionRow(JSON.parse(timeline.scope).style.revisionId).spec);
    const stored = {...payload, meta};
    const review = B.critique(payload, spec);
    const id = randomUUID(), revision = parent ? parent.revision + 1 : 1;
    this.db.prepare('INSERT INTO edit_revisions(id,timeline_id,revision,parent_id,actor,payload,payload_hash,critique,ops,receipt,note,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, timeline.id, revision, parent?.id || null, actor, JSON.stringify(stored), B.timelineHash(payload), JSON.stringify(review), JSON.stringify(ops), JSON.stringify(receipt), note, createdBy, now());
    return this.revisionRow(id);
  }
  // Whether the edit still matches the approved inputs it was made from.
  currentFor(timelineRow) {
    try {
      const inputs = this.inputs(this.store.content(timelineRow.content_id));
      if (!inputs.ready) return {current: false, reason: inputs.blockers[0]};
      if (inputs.scopeHash !== timelineRow.scope_hash) return {current: false, reason: 'The visuals, narration, script or style changed after this edit. Generate a new edit.'};
      return {current: true, inputs};
    } catch (error) { return {current: false, reason: error.message}; }
  }
  timelinePayload(row) { const payload = JSON.parse(row.payload); const {meta, ...timeline} = payload; return {timeline, meta}; }

  // ------------------------------------------------------------ generate
  async generate(contentId, input) {
    object(input);
    const by = person(input.requestedBy);
    requireValue(!this.busy.has(contentId), 'An edit for this script is already being prepared.', 409);
    const content = this.store.content(contentId), inputs = this.inputs(content);
    requireValue(inputs.ready, inputs.blockers[0], 409);
    requireValue(input.visualApprovalId === inputs.visual.approvalId, 'The visual approval changed. Reload before editing.', 409);
    this.busy.add(contentId);
    try {
      const analysis = await this.pauses(inputs);
      await this.measureCuts(inputs);
      const {alignment, edit} = this.brainInput(inputs, analysis);
      // The brain fixes what its own critic can fix before the owner sees the draft, and lists each fix.
      const {timeline: payload, fixed} = B.autoFix(B.autoEdit(edit), inputs.spec);
      const skills = this.skillsInForce(inputs.family.id);
      const meta = {timing: {method: alignment.method, matched: alignment.matched, boundaries: alignment.boundaries, note: analysis.note}, skills: skills.map(item => ({id: item.id, revisionId: item.revisionId})), brain: B.SCHEMA, ...(fixed.length ? {autoFixes: fixed} : {})};
      return this.store.transaction(() => {
        const fresh = this.inputs(this.store.content(contentId));
        requireValue(fresh.ready && fresh.scopeHash === inputs.scopeHash, 'The inputs changed while the edit was being prepared. Try again.', 409);
        let timeline = this.db.prepare('SELECT * FROM edit_timelines WHERE content_id=? AND scope_hash=?').get(contentId, inputs.scopeHash);
        if (!timeline) {
          const id = randomUUID();
          this.db.prepare('INSERT INTO edit_timelines(id,family_id,content_id,visual_approval_id,scope,scope_hash,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id, inputs.family.id, contentId, inputs.visual.approvalId, JSON.stringify(inputs.scope), inputs.scopeHash, by, now());
          timeline = this.timelineRow(id);
        }
        const parent = this.latestRow(timeline.id) || null;
        const row = this.insertRevision({timeline, payload, parent, actor: 'brain', note: `${parent ? 'Fresh edit from the editing brain (replaces the earlier draft)' : 'First edit from the editing brain'}${fixed.length ? `; it fixed ${fixed.length} of its own finding${fixed.length === 1 ? '' : 's'}` : ''}.`, createdBy: by, meta, ops: [{type: 'auto-edit'}], receipt: {clips: payload.clips.length, graphics: payload.graphics.length}});
        if (skills.length) this.store.skillRuntime?.recordUsage({jobId: row.id, familyId: inputs.family.id, room: 'editing', taskKey: 'editing.plan', brief: {revisionIds: skills.map(item => item.revisionId), skillIds: skills.map(item => item.id), injectedBytes: 0, dropped: 0}});
        this.store.event(`Editing brain drafted edit r${row.revision} for "${content.title}" (${payload.clips.length} clips, ${alignment.method})`);
        return this.publicRevision(row, {detail: true});
      });
    } finally {
      this.busy.delete(contentId);
    }
  }

  // ------------------------------------------------------------ owner edits
  applyOps(revisionId, input) {
    object(input);
    const by = person(input.editedBy);
    requireValue(Array.isArray(input.ops) && input.ops.length >= 1 && input.ops.length <= 20, 'Send 1-20 edit operations.');
    return this.store.transaction(() => {
      const base = this.revisionRow(revisionId), timeline = this.timelineRow(base.timeline_id), latest = this.latestRow(timeline.id);
      requireValue(latest.id === base.id, `This edit changed (now r${latest.revision}). Reload and try again.`, 409);
      const state = this.currentFor(timeline);
      requireValue(state.current, state.reason, 409);
      const spec = state.inputs.spec;
      let {timeline: payload, meta} = this.timelinePayload(base);
      const receipts = [];
      for (const op of input.ops) {
        object(op, 'Edit operation');
        if (op.type === 'regenerate-scene') {
          const scene = payload.scenes.find(item => item.id === op.sceneId);
          requireValue(scene, 'That scene is not in this edit.', 404);
          const analysis = this.cachedPauses(state.inputs);
          const variants = Object.fromEntries(payload.scenes.map(item => [item.id, item.variant || 0]));
          variants[scene.id] = (scene.variant || 0) + 1;
          const fresh = B.autoEdit(this.brainInput(state.inputs, analysis, variants).edit);
          try { payload = B.spliceScene(payload, fresh, scene.id); } catch (error) { throw new InputError(error.message, error.status || 409); }
          receipts.push({type: 'regenerate-scene', changed: payload.clips.filter(clip => clip.sceneId === scene.id).map(clip => clip.id), variant: variants[scene.id]});
          continue;
        }
        try {
          const result = B.applyOp(payload, op, {spec});
          payload = result.timeline;
          receipts.push(result.receipt);
        } catch (error) { throw new InputError(error.message, error.status || 400); }
      }
      const note = input.note ? text(input.note, 'Note', 3, 300) : receipts.map(item => item.type).join(', ');
      const row = this.insertRevision({timeline, payload, parent: base, actor: 'owner', ops: input.ops, receipt: {steps: receipts}, note, createdBy: by, meta});
      this.learnFromOverrides(timeline, input.ops);
      this.store.event(`Edit r${row.revision} saved (${note})`);
      return this.publicRevision(row, {detail: true});
    });
  }
  cachedPauses(inputs) {
    const cached = this.db.prepare('SELECT payload FROM edit_analyses WHERE narration_sha256=? AND version=?').get(inputs.scope.narration.sha256, ANALYSIS_VERSION);
    return cached ? JSON.parse(cached.payload) : {pauses: []};
  }
  undo(revisionId, input) {
    object(input);
    const by = person(input.editedBy);
    return this.store.transaction(() => {
      const latest = this.revisionRow(revisionId), timeline = this.timelineRow(latest.timeline_id);
      requireValue(this.latestRow(timeline.id).id === latest.id, 'Only the newest revision can be undone. Reload first.', 409);
      requireValue(latest.parent_id, 'There is nothing before the first edit.', 409);
      const state = this.currentFor(timeline);
      requireValue(state.current, state.reason, 409);
      const parent = this.revisionRow(latest.parent_id), {timeline: payload, meta} = this.timelinePayload(parent);
      const row = this.insertRevision({timeline, payload, parent: latest, actor: 'owner', ops: [{type: 'undo', of: latest.revision}], receipt: {restored: parent.revision}, note: `Undo r${latest.revision} (back to r${parent.revision}).`, createdBy: by, meta});
      this.store.event(`Edit r${latest.revision} undone`);
      return this.publicRevision(row, {detail: true});
    });
  }
  // The program learns from repeated corrections: when the owner makes the same kind of change in two
  // different edits of one family, a lesson candidate goes to the Skills page for review. It is a proposal only.
  learnFromOverrides(timeline, ops) {
    const signatureOf = op => `${op.type}:${op.transition || op.kind || op.status || (op.type === 'set-hold' ? 'hold' : op.type === 'reorder' ? 'reorder' : '')}`;
    // ponytail: scans the family's owner revisions per save; index the signatures if a family grows past thousands of edits.
    const rows = this.db.prepare("SELECT r.timeline_id, r.ops FROM edit_revisions r JOIN edit_timelines t ON t.id=r.timeline_id WHERE t.family_id=? AND r.actor='owner'").all(timeline.family_id).map(row => ({timelineId: row.timeline_id, signatures: JSON.parse(row.ops).map(signatureOf)}));
    for (const op of ops) {
      const skillId = OVERRIDE_SKILL[op.type];
      const value = op.transition || op.kind || op.status || (op.type === 'set-hold' ? 'hold' : op.type === 'reorder' ? 'reorder' : null);
      if (!skillId || !value) continue;
      const signature = signatureOf(op);
      const timelines = [...new Set(rows.filter(row => row.signatures.includes(signature)).map(row => row.timelineId))];
      if (timelines.length < OVERRIDE_REPEAT) continue;
      const describe = {'set-transition': `changed a transition to "${value}"`, 'set-move': `changed a camera move to "${value}"`, 'set-hold': 'changed shot lengths by hand', 'set-graphic': `marked a proposed graphic as ${value}`, reorder: 'reordered shots inside a scene'}[op.type];
      this.store.skillRuntime?.capture({
        familyId: timeline.family_id, skillId, taskKey: 'editing.plan', source: 'editing-override', sourceRef: `${timeline.family_id}:${signature}`,
        finding: `The owner ${describe} in ${timelines.length} different edits of this family. The editing brain's default may not suit this family.`,
        evidence: timelines.slice(0, 10).map(id => `edit timeline ${id}`),
        proposal: {kind: 'add-do', value: `For this family, prefer the owner's choice: ${describe.replace(/^changed /, '').replace(/^marked /, 'mark ')}.`},
      });
    }
  }

  // ------------------------------------------------------------ render handoff
  // Called by the render room when an edit revision is queued for rendering.
  renderScope(revisionId, content) {
    const row = this.revisionRow(revisionId), timeline = this.timelineRow(row.timeline_id);
    requireValue(timeline.content_id === content.id, 'That edit belongs to another script.', 409);
    requireValue(this.latestRow(timeline.id).id === row.id, 'A newer revision of this edit exists. Render the newest one.', 409);
    const state = this.currentFor(timeline);
    requireValue(state.current, state.reason, 409);
    const {timeline: payload} = this.timelinePayload(row), review = JSON.parse(row.critique);
    if (payload.audio) {
      Audio.settings(payload.audio);
      const readiness = this.renders.latestReadiness();
      requireValue(Audio.REQUIRED_FILTERS.every(name => readiness?.filters?.[name] === true) && readiness?.encoders?.pcm_s24le === true,
        'Audio finishing needs a fresh FFmpeg readiness check and pinned build (Room 05).', 409);
    }
    const ass = B.graphicsAss(payload, state.inputs.spec);
    if (ass) {
      const readiness = this.renders.latestReadiness();
      requireValue(readiness?.filters?.ass === true, 'Graphics need the FFmpeg "ass" filter. Run the readiness check again (Room 05) and pin the build.', 409);
    }
    const canvas = payload.graphics.filter(item => item.status === 'accepted' && B.CANVAS_TEMPLATES.includes(item.template));
    if (canvas.length) {
      const readiness = this.renders.latestReadiness();
      requireValue(readiness?.motion?.passed === true, 'Charts, timelines, lists, comparisons and diagrams are drawn in a local browser. Run the readiness check again (Room 05); it must find Microsoft Edge or Google Chrome.', 409);
      for (const graphic of canvas) { try { B.canvasData(graphic.template, graphic.title, graphic.lines); } catch (error) { throw new InputError(`${graphic.template} at ${(graphic.start / payload.fps).toFixed(1)} s: ${error.message}`, 409); } }
    }
    const files = Object.fromEntries(payload.clips.map(clip => [clip.id, {relativePath: state.inputs.assets[clip.shotId].relativePath, sha256: state.inputs.assets[clip.shotId].sha256}]));
    // Drawn shots (P06d) are drawn again at render time for their exact hold, timed to the narration's words.
    const engine = E.primaryEngine(state.inputs.spec), drawings = {};
    for (const clip of payload.clips.filter(item => state.inputs.assets[item.shotId].origin === 'drawn')) {
      // An atelier shot (P06h) is rendered again from its designed composition, timed onto the real words.
      if (state.inputs.assets[clip.shotId].composition) { drawings[clip.id] = {composition: state.inputs.assets[clip.shotId].composition}; continue; }
      try { Sk.validate(state.inputs.assets[clip.shotId].sketch, {primary: E.ENGINES[engine]?.draws ? engine : 'motion', lenient: true}); } catch (error) { throw new InputError(`${clip.label} drawing: ${error.message} Plan or draw this shot again.`, 409); }
      drawings[clip.id] = {sketch: state.inputs.assets[clip.shotId].sketch};
    }
    // Music and sound effects named by the audio settings (P08c), with their files, times and levels.
    const soundtrack = payload.audio && Audio.mixes(Audio.settings(payload.audio)) ? (() => { requireValue(this.soundtrack, 'Music and sound effects are not available in this program.', 409); return this.soundtrack.soundtrackFor({content, timeline: payload, config: Audio.settings(payload.audio), drawings, engine}); })() : null;
    if (Object.keys(drawings).length) requireValue(this.renders.latestReadiness()?.motion?.passed === true, 'Drawn shots are drawn in a local browser. Run the readiness check again (Room 05); it must find Microsoft Edge or Google Chrome.', 409);
    return {revisionId: row.id, revision: row.revision, timelineId: timeline.id, payloadHash: row.payload_hash, timeline: payload, files, graphicsAss: ass, drawings, engine, ...(soundtrack ? {soundtrack} : {}), criticals: review.counts.critical, critiqueVerdict: review.slideshow.verdict};
  }

  isLatest(revisionId) {
    const row = this.db.prepare('SELECT timeline_id FROM edit_revisions WHERE id=?').get(revisionId);
    return !!row && this.latestRow(row.timeline_id).id === revisionId && this.currentFor(this.timelineRow(row.timeline_id)).current;
  }

  // ------------------------------------------------------------ YouTube craft (youtube-agent-skill)
  // Sentence cues on the narration clock, pause-aligned like the edit itself. gap is the measured pause
  // before a sentence; sceneStart marks the board's sections. Chapters, Shorts and retention read these.
  cues(inputs) {
    const analysis = this.cachedPauses(inputs);
    const {sentences} = B.alignSentences(inputs.payload.sentences, analysis.pauses || [], inputs.scope.narration.durationSeconds);
    const sceneStarts = new Set(inputs.payload.scenes.map(scene => scene.sentenceStart));
    // The writer's own paragraph breaks are the clearest section evidence in an approved script.
    const squash = value => String(value).replace(/\s+/g, ' ').trim();
    const paragraphs = String(inputs.script || '').split(/\n\s*\n/).map(squash).filter(Boolean).map(text => text.slice(0, 40));
    return sentences.map((sentence, index) => {
      const pause = index ? (analysis.pauses || []).find(span => span.start <= sentence.startSeconds + 0.1 && span.end >= sentence.startSeconds - 0.1) : null;
      return {n: sentence.n, start: sentence.startSeconds, end: Math.round((sentence.startSeconds + sentence.durationSeconds) * 100) / 100, text: sentence.text, gap: pause ? pause.end - pause.start : 0,
        sceneStart: index > 0 && sceneStarts.has(sentence.n), paragraphStart: index > 0 && paragraphs.some(start => squash(sentence.text).startsWith(start.slice(0, Math.min(40, squash(sentence.text).length))))};
    });
  }
  // Draft chapters for a long video and Shorts spans inside it. Drafts for the owner, never published.
  craft(inputs) {
    const cues = this.cues(inputs), locale = inputs.family.primaryLocale;
    return {chapters: inputs.scope.format === 'long-form' ? C.chapterize(cues) : null, shorts: inputs.scope.format === 'long-form' ? C.findShorts(cues, {locale}) : null};
  }
  // The SRT or WebVTT sidecar of one edit revision's captions (every group; platform players draw it themselves).
  captionsFile(revisionId, kind = 'srt') {
    const row = this.revisionRow(revisionId), {timeline} = this.timelinePayload(row);
    requireValue(timeline.captions, 'This edit was drafted before captions existed. Draft a fresh edit to get captions.', 404);
    const content = this.store.content(this.timelineRow(row.timeline_id).content_id);
    return {text: kind === 'vtt' ? Cap.vtt(timeline.captions) : Cap.srt(timeline.captions), filename: `${content.title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || 'captions'}-r${row.revision}.${kind === 'vtt' ? 'vtt' : 'srt'}`};
  }
  // Reads a YouTube Studio audience-retention CSV against this script's narration.
  retention(contentId, input) {
    object(input);
    const csv = text(input.csv, 'Retention CSV', 20, 200000);
    const inputs = this.inputs(this.store.content(contentId));
    requireValue(inputs.ready, inputs.blockers?.[0] || 'This script has no approved narration yet.', 409);
    const result = C.analyseRetention(csv, {durationSeconds: inputs.scope.narration.durationSeconds, cues: this.cues(inputs)});
    requireValue(result.ok, result.reason, 422);
    return result;
  }

  // ------------------------------------------------------------ views
  publicRevision(row, {detail = false} = {}) {
    const timelineRow = this.timelineRow(row.timeline_id), latest = this.latestRow(timelineRow.id);
    const payload = JSON.parse(row.payload), review = JSON.parse(row.critique);
    const out = {id: row.id, timelineId: row.timeline_id, contentId: timelineRow.content_id, revision: row.revision, latest: latest.id === row.id, actor: row.actor, note: row.note, createdBy: row.created_by, createdAt: row.created_at, payloadHash: row.payload_hash,
      critique: {slideshow: review.slideshow, counts: review.counts, stats: review.stats}, timing: payload.meta?.timing || null, autoFixes: payload.meta?.autoFixes || []};
    if (!detail) return out;
    const approved = new Set((payload.meta?.skills || []).map(item => item.id));
    const withSkill = item => ({...item, skillApproved: item.skill ? approved.has(item.skill) : null});
    return {...out, timeline: {...payload, meta: undefined, clips: payload.clips.map(withSkill), joins: payload.joins.map(withSkill), graphics: payload.graphics.map(withSkill)}, findings: review.findings.map(withSkill), skills: payload.meta?.skills || [], ops: JSON.parse(row.ops), receipt: JSON.parse(row.receipt)};
  }
  state() {
    const contents = this.store.contents().filter(content => content.state === 'approved' || this.db.prepare('SELECT 1 FROM edit_timelines WHERE content_id=? LIMIT 1').get(content.id));
    return {
      brain: B.SCHEMA, moves: B.MOVES, transitions: B.TRANSITIONS, templates: B.GRAPHIC_TEMPLATES,
      contents: contents.map(content => {
        // Show the edit made from the current approved inputs; fall back to the newest one when the inputs moved on.
        const scopeHash = (() => { try { const inputs = this.inputs(content); return inputs.ready ? inputs.scopeHash : null; } catch { return null; } })();
        const timeline = (scopeHash && this.db.prepare('SELECT * FROM edit_timelines WHERE content_id=? AND scope_hash=?').get(content.id, scopeHash)) || this.db.prepare('SELECT * FROM edit_timelines WHERE content_id=? ORDER BY created_at DESC, rowid DESC LIMIT 1').get(content.id);
        if (!timeline) return {contentId: content.id, familyId: content.familyId, title: content.title, edit: null, history: []};
        const latest = this.latestRow(timeline.id), status = this.currentFor(timeline);
        return {contentId: content.id, familyId: content.familyId, title: content.title, current: status.current, staleReason: status.current ? null : status.reason,
          edit: this.publicRevision(latest, {detail: true}), craft: status.current ? this.craft(status.inputs) : null,
          history: this.db.prepare('SELECT * FROM edit_revisions WHERE timeline_id=? ORDER BY revision DESC LIMIT 30').all(timeline.id).map(row => this.publicRevision(row))};
      }),
    };
  }
}

module.exports = {EditingRoom, ANALYSIS_VERSION};
