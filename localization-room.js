'use strict';
// L01 language editions (Room 06): after the primary video's final master is approved, each of the family's other
// languages gets an edition: the narration script, every word on screen and the package, adapted by Claude on the
// owner's click (inside a token reservation) or written by the owner. Revisions are immutable per language; an
// approval is named and goes stale when the primary video's words change. Items whose source did not change keep their
// approved wording. L02: each language's narrator speaks the approved words (on a click, inside the family's voice
// characters), and the approved edit's scenes are measured in that voice. Nothing is rendered or published here (L03).
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID, createHash} = require('node:crypto');
const V = require('./voice');
const B = require('./editing-brain');
const F = require('./fonts');
const L = require('./localize');
const R = require('./render');
const {splitSentences} = require('./scene-room');
const {AiError, jsonText} = require('./ai');
const {InputError} = require('./store');
const {messageTokenUpperBound} = require('./writer');
const {connectorReference, connectorCurrent} = require('./intel-sources');
const {requireValue, now, object, person, text} = R;

const PART_SENTENCES = 150, MAX_ANSWER = 16000;
// Checks that prove an edition file is sound and in the upload format; they can never be accepted away.
const EDITION_BLOCKING = ['full decode', 'audio/video alignment', 'duration', 'frame', 'narration audio', 'delivery format'];
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
// The answer room one packet needs: about 2 characters a token for adapted text and JSON, plus a margin.
const answerTokens = messages => Math.min(MAX_ANSWER, Math.ceil(Buffer.byteLength(messages[1].content, 'utf8') / 2) + 2000);

// Sentences numbered like the scene plan (the whole script at once), each with the paragraph it sits in.
function sentencesOf(script, locale) {
  const paragraphs = String(script).split(/\n\s*\n/).map(item => item.replace(/\s+/g, ' ').trim()).filter(Boolean);
  let p = 0, at = 0;
  return splitSentences(script, locale).map(item => {
    const head = item.text.slice(0, 24);
    let index = paragraphs[p]?.indexOf(head, at) ?? -1;
    while (index < 0 && p < paragraphs.length - 1) { p++; at = 0; index = paragraphs[p].indexOf(head); }
    at = Math.max(at, index + 1);
    return {n: item.n, paragraph: p, text: item.text};
  });
}

class LocalizationRoom {
  constructor(store, renders, packaging, connectors, ai, {dataRoot = null, ffmpeg = 'ffmpeg', ffprobe = 'ffprobe'} = {}) {
    Object.assign(this, {store, db: store.db, renders, packaging, connectors, ai, busy: false, narrating: false, ffmpeg, ffprobe});
    this.dataRoot = dataRoot || store.artifactRoot || renders?.dataRoot;
    this.voiceDir = path.join(this.dataRoot || '.', 'voice-artifacts');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS edition_revisions(id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id), content_id TEXT NOT NULL REFERENCES content(id), locale TEXT NOT NULL, revision INTEGER NOT NULL, content_revision INTEGER NOT NULL, master_id TEXT NOT NULL, source TEXT NOT NULL, source_hash TEXT NOT NULL, actor TEXT NOT NULL, payload TEXT NOT NULL, payload_hash TEXT NOT NULL, checks TEXT NOT NULL, note TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(content_id, locale, revision));
      CREATE TRIGGER IF NOT EXISTS edition_revisions_immutable BEFORE UPDATE ON edition_revisions BEGIN SELECT RAISE(ABORT, 'Edition revisions are immutable.'); END;
      CREATE TABLE IF NOT EXISTS edition_approvals(id TEXT PRIMARY KEY, revision_id TEXT NOT NULL REFERENCES edition_revisions(id), content_id TEXT NOT NULL, locale TEXT NOT NULL, source_hash TEXT NOT NULL, master_id TEXT NOT NULL, approved_by TEXT NOT NULL, notes TEXT NOT NULL, confirmations TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TRIGGER IF NOT EXISTS edition_approvals_immutable BEFORE UPDATE ON edition_approvals BEGIN SELECT RAISE(ABORT, 'Edition approvals are immutable.'); END;
      CREATE TABLE IF NOT EXISTS edition_voices(id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id), locale TEXT NOT NULL, revision INTEGER NOT NULL, payload TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(family_id, locale, revision));
      CREATE TRIGGER IF NOT EXISTS edition_voices_immutable BEFORE UPDATE ON edition_voices BEGIN SELECT RAISE(ABORT, 'Edition voices are immutable.'); END;
      CREATE TABLE IF NOT EXISTS edition_narrations(id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id), content_id TEXT NOT NULL, locale TEXT NOT NULL, edition_revision_id TEXT NOT NULL REFERENCES edition_revisions(id), voice_id TEXT NOT NULL REFERENCES edition_voices(id), status TEXT NOT NULL, scope TEXT NOT NULL, result TEXT, error TEXT, attempts INTEGER NOT NULL, usage_status TEXT NOT NULL, reserved_characters INTEGER NOT NULL DEFAULT 0, period_month TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS edition_narration_approvals(id TEXT PRIMARY KEY, narration_id TEXT NOT NULL REFERENCES edition_narrations(id), content_id TEXT NOT NULL, locale TEXT NOT NULL, edition_approval_id TEXT NOT NULL, master_id TEXT NOT NULL, approved_by TEXT NOT NULL, notes TEXT NOT NULL, confirmations TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TRIGGER IF NOT EXISTS edition_narration_approvals_immutable BEFORE UPDATE ON edition_narration_approvals BEGIN SELECT RAISE(ABORT, 'Narration approvals are immutable.'); END;
      CREATE TABLE IF NOT EXISTS edition_releases(id TEXT PRIMARY KEY, render_id TEXT NOT NULL, content_id TEXT NOT NULL, locale TEXT NOT NULL, narration_approval_id TEXT NOT NULL, master_id TEXT NOT NULL, approved_by TEXT NOT NULL, notes TEXT NOT NULL, confirmations TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TRIGGER IF NOT EXISTS edition_releases_immutable BEFORE UPDATE ON edition_releases BEGIN SELECT RAISE(ABORT, 'Edition releases are immutable.'); END;
      CREATE TABLE IF NOT EXISTS edition_jobs(id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id), content_id TEXT NOT NULL, locale TEXT NOT NULL, status TEXT NOT NULL, scope TEXT NOT NULL, parts TEXT NOT NULL DEFAULT '{}', revision_id TEXT, error TEXT, attempts INTEGER NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    `);
    for (const row of this.db.prepare("SELECT id FROM edition_jobs WHERE status='running'").all()) {
      this.db.prepare("UPDATE edition_jobs SET status='interrupted', error='The program stopped while Claude was adapting. Finished parts are kept; token use of the open part is unknown. Retry deliberately.', updated_at=? WHERE id=?").run(now(), row.id);
      this.db.prepare("UPDATE intelligence_usage SET status='unknown', updated_at=? WHERE job_id=? AND status='reserved'").run(now(), row.id);
    }
    this.db.prepare("UPDATE edition_narrations SET status='interrupted', usage_status=CASE WHEN usage_status='reserved' THEN 'unknown' ELSE usage_status END, error='The program stopped while the narration was being made. The voice service may have charged for it; retry deliberately.', updated_at=? WHERE status='running'").run(now());
    store.editionVoiceCharacters = (familyId, period) => this.editionVoiceCharacters(familyId, period);
  }

  // ------------------------------------------------------------ inputs
  // The newest final master the owner approved that is still current (localization starts only from a locked master).
  approvedMaster(contentId) {
    for (const row of this.db.prepare("SELECT * FROM render_jobs WHERE content_id=? AND preset='master' AND status='completed' ORDER BY created_at DESC, rowid DESC").all(contentId))
      if (this.renders.masterApproval(row)?.current) return row;
    return null;
  }
  inputs(contentId) {
    const content = this.store.content(contentId), family = this.store.family(content.familyId), blockers = [], targets = family.locales.slice(1);
    if (!targets.length) blockers.push('This family has one language. Add languages to the family (Studio) to make editions.');
    if (content.state !== 'approved') blockers.push('Approve the script first.');
    const master = content.state === 'approved' ? this.approvedMaster(contentId) : null;
    if (!master && content.state === 'approved') blockers.push('Approve the final master in Room 10 first: editions are adapted from the locked primary video.');
    let src = null;
    if (master) {
      const edit = JSON.parse(master.scope).edit, pkgRow = this.packaging.latestRow(contentId);
      const visible = L.visibleTexts({drawings: edit?.drawings || {}, graphics: edit?.timeline?.graphics || [], clips: edit?.timeline?.clips || []});
      src = L.source({sentences: sentencesOf(content.script, family.primaryLocale), visible, pkg: pkgRow ? JSON.parse(pkgRow.payload) : null});
    }
    return {content, family, targets, master, source: src, sourceHash: src ? hash(src) : null, blockers, ready: !blockers.length};
  }
  locale(inputs, value) {
    const locale = text(value, 'Language', 2, 20);
    requireValue(inputs.targets.includes(locale), `${locale} is not one of this family's other languages (${inputs.targets.join(', ') || 'none'}).`, 400);
    return locale;
  }

  // ------------------------------------------------------------ revisions
  latestRow(contentId, locale) { return this.db.prepare('SELECT * FROM edition_revisions WHERE content_id=? AND locale=? ORDER BY revision DESC LIMIT 1').get(contentId, locale) || null; }
  revisionRow(id) { const row = this.db.prepare('SELECT * FROM edition_revisions WHERE id=?').get(id); requireValue(row, 'Edition revision not found.', 404); return row; }
  insertRevision({inputs, locale, payload, actor, note, createdBy, expectedRevision = null}) {
    return this.store.transaction(() => {
      const latest = this.latestRow(inputs.content.id, locale), content = this.store.content(inputs.content.id);
      requireValue(content.revision === inputs.content.revision, 'The script changed while the edition was being prepared. Reload and try again.', 409);
      if (expectedRevision !== null) requireValue((latest?.revision || 0) === expectedRevision, `This edition changed (now r${latest?.revision || 0}). Reload before saving.`, 409);
      const checks = L.check(payload, inputs.source, {locale, sourceLocale: inputs.family.primaryLocale}), id = randomUUID(), revision = (latest?.revision || 0) + 1;
      this.db.prepare('INSERT INTO edition_revisions(id,family_id,content_id,locale,revision,content_revision,master_id,source,source_hash,actor,payload,payload_hash,checks,note,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(id, inputs.family.id, content.id, locale, revision, content.revision, inputs.master.id, JSON.stringify(inputs.source), inputs.sourceHash, actor, JSON.stringify(payload), hash(payload), JSON.stringify(checks), note, createdBy, now());
      this.store.event(`${L.language(locale)} edition r${revision} for "${content.title}" (${actor === 'claude' ? 'Claude adaptation' : `edited by ${createdBy}`})`);
      return this.publicRevision(this.revisionRow(id));
    });
  }
  // The owner's own wording: checked strictly (no unknown items, every limit), saved as the next revision.
  save(contentId, input) {
    object(input);
    const by = person(input.createdBy), inputs = this.inputs(contentId);
    requireValue(inputs.ready, inputs.blockers[0], 409);
    const locale = this.locale(inputs, input.locale);
    requireValue(Number.isSafeInteger(input.expectedRevision), 'Reload the edition before saving.', 409);
    let payload;
    try { payload = L.normalise(object(input.edition, 'Edition'), inputs.source); } catch (error) { throw new InputError(error.message, 400); }
    const latest = this.latestRow(contentId, locale);
    requireValue(!latest || hash(payload) !== latest.payload_hash || latest.source_hash !== inputs.sourceHash, 'Nothing changed.', 400);
    return this.insertRevision({inputs, locale, payload, actor: 'owner', note: text(input.note || 'Owner edit', 'Note', 1, 300), createdBy: by, expectedRevision: input.expectedRevision});
  }

  // ------------------------------------------------------------ Claude adaptations
  // One packet per part of the script (visible words and the package travel with the first). When the primary video
  // changed since the newest revision, unchanged items keep their wording and only the changes are asked.
  packets(inputs, locale) {
    const latest = this.latestRow(inputs.content.id, locale);
    const keep = latest && latest.source_hash !== inputs.sourceHash ? L.carry(JSON.parse(latest.payload), JSON.parse(latest.source), inputs.source) : {sentences: [], visible: [], given: []};
    const asked = inputs.source.sentences.filter(item => !keep.sentences.includes(item.n)), skills = this.store.skillRuntime?.brief('localization.check', inputs.family.id)?.prompt || null;
    const parts = [];
    for (let k = 0; k === 0 || k < asked.length; k += PART_SENTENCES) {
      const chunk = new Set(asked.slice(k, k + PART_SENTENCES).map(item => item.n)), first = k === 0;
      const source = {sentences: inputs.source.sentences.filter(item => chunk.has(item.n)), visible: first ? inputs.source.visible : [], package: first ? inputs.source.package : null};
      parts.push(L.messages({locale, sourceLocale: inputs.family.primaryLocale, family: inputs.family, title: inputs.content.title, source, keep: {visible: keep.visible}, given: first ? keep.given.slice(0, 200) : [], skills}));
    }
    return {parts, keep};
  }
  queueDraft(contentId, input) {
    object(input);
    const by = person(input.requestedBy), inputs = this.inputs(contentId);
    requireValue(inputs.ready, inputs.blockers[0], 409);
    const locale = this.locale(inputs, input.locale), connector = connectorReference(this.connectors, input.connector, 'ai', 'Claude', true);
    return this.store.transaction(() => {
      requireValue(!this.db.prepare("SELECT 1 FROM edition_jobs WHERE content_id=? AND locale=? AND status IN ('queued','running')").get(contentId, locale), `Claude is already adapting the ${L.language(locale)} edition.`, 409);
      const {parts, keep} = this.packets(inputs, locale), tokenLimit = parts.reduce((sum, messages) => sum + messageTokenUpperBound(messages) + answerTokens(messages), 0);
      const id = randomUUID(), at = now();
      this.db.prepare("INSERT INTO edition_jobs(id,family_id,content_id,locale,status,scope,attempts,created_by,created_at,updated_at) VALUES(?,?,?,?,'queued',?,0,?,?,?)")
        .run(id, inputs.family.id, contentId, locale, JSON.stringify({contentRevision: inputs.content.revision, sourceHash: inputs.sourceHash, connector, parts, keep, tokenLimit}), by, at, at);
      const brief = this.store.skillRuntime?.brief('localization.check', inputs.family.id);
      if (brief) this.store.skillRuntime.recordUsage({jobId: id, familyId: inputs.family.id, room: 'localization', taskKey: 'localization.check', brief});
      this.store.event(`Queued Claude's ${L.language(locale)} adaptation of "${inputs.content.title}"${keep.sentences.length ? ` (${keep.sentences.length} unchanged sentences kept)` : ''}`);
      return this.publicJob(this.jobRow(id));
    });
  }
  jobRow(id) { const row = this.db.prepare('SELECT * FROM edition_jobs WHERE id=?').get(id); requireValue(row, 'Edition job not found.', 404); return row; }
  publicJob(row) { const usage = this.db.prepare('SELECT * FROM intelligence_usage WHERE job_id=?').get(row.id), scope = JSON.parse(row.scope); return {id: row.id, contentId: row.content_id, locale: row.locale, status: row.status, error: row.error, attempts: row.attempts, revisionId: row.revision_id, parts: scope.parts.length, partsDone: Object.keys(JSON.parse(row.parts)).length, createdBy: row.created_by, createdAt: row.created_at, usage: usage ? {status: usage.status, total: usage.total_tokens, reserved: usage.reserved_tokens} : null}; }
  retryDraft(id, input) {
    object(input);
    return this.store.transaction(() => {
      const row = this.jobRow(id);
      requireValue(['failed', 'interrupted', 'quality_failed', 'blocked_budget'].includes(row.status), `A ${row.status} adaptation cannot be retried.`, 409);
      requireValue(row.attempts < 3, 'This adaptation already used 3 attempts. Ask for a new one.', 409);
      if (row.status === 'interrupted') requireValue(input.confirmInterrupted === true, 'The last attempt was interrupted and Claude may have used tokens. Confirm the deliberate retry.', 409);
      if (this.db.prepare('SELECT 1 FROM intelligence_usage WHERE job_id=?').get(id)) this.db.prepare('UPDATE intelligence_usage SET job_id=? WHERE job_id=?').run(`${id}:attempt${row.attempts}`, id);
      this.db.prepare("UPDATE edition_jobs SET status='queued', error=NULL, updated_at=? WHERE id=?").run(now(), id);
      return this.publicJob(this.jobRow(id));
    });
  }
  claim() {
    return this.store.transaction(() => {
      const row = this.db.prepare("SELECT * FROM edition_jobs WHERE status='queued' ORDER BY created_at, rowid LIMIT 1").get();
      if (!row) return null;
      const scope = JSON.parse(row.scope), family = this.store.family(row.family_id), at = now(), done = JSON.parse(row.parts);
      const stop = (status, error) => { this.db.prepare('UPDATE edition_jobs SET status=?, error=?, updated_at=? WHERE id=?').run(status, error, at, row.id); return null; };
      const inputs = (() => { try { return this.inputs(row.content_id); } catch { return null; } })();
      if (!inputs?.ready || inputs.content.revision !== scope.contentRevision || inputs.sourceHash !== scope.sourceHash) return stop('stale', 'The primary video changed before Claude started. Nothing was sent.');
      if (!connectorCurrent(this.connectors, scope.connector, 'ai')) return stop('stale', 'The Claude connection changed or is not tested. Nothing was sent.');
      // Only the parts still to answer are reserved (finished parts are kept and never paid twice).
      const reserve = scope.parts.reduce((sum, messages, k) => sum + (done[k] ? 0 : messageTokenUpperBound(messages) + answerTokens(messages)), 0), summary = this.store.usageSummary(family.id);
      if (summary.settledTokens + summary.reservedTokens + reserve > family.tokenBudget.monthlyLimit) return stop('blocked_budget', 'The family monthly token limit cannot reserve this adaptation. Raise it or wait for next month.');
      this.db.prepare("INSERT INTO intelligence_usage(job_id,family_id,kind,period_month,status,reserved_tokens,created_at,updated_at) VALUES(?,?,'localization',?,'reserved',?,?,?)").run(row.id, family.id, this.store.tokenPeriod(family), reserve, at, at);
      this.db.prepare("UPDATE edition_jobs SET status='running', attempts=attempts+1, updated_at=? WHERE id=?").run(at, row.id);
      return {...row, scope, done};
    });
  }
  async processNext() {
    if (this.busy) return null;
    const job = this.claim();
    if (!job) return null;
    this.busy = true;
    let started = false;
    const used = {prompt: 0, completion: 0, total: 0, known: true}, warnings = [];
    const add = usage => { if (!Number.isSafeInteger(usage?.totalTokens)) { used.known = false; return; } used.prompt += usage.promptTokens || 0; used.completion += usage.completionTokens || 0; used.total += usage.totalTokens; };
    const settle = at => this.db.prepare('UPDATE intelligence_usage SET status=?, prompt_tokens=?, completion_tokens=?, total_tokens=?, updated_at=? WHERE job_id=?').run(used.known ? 'settled' : 'unknown', used.prompt, used.completion, used.total, at, job.id);
    let answered = 0;
    try {
      for (const [k, messages] of job.scope.parts.entries()) {
        if (job.done[k]) continue;
        started = false;
        const reply = await this.ai.complete({connectorId: job.scope.connector.id, task: 'localization', messages, maxTokens: answerTokens(messages), onStart: () => { started = true; }});
        add(reply.usage); answered++;
        let answer;
        try { answer = JSON.parse(jsonText(reply.content)); } catch (error) { throw Object.assign(new AiError(`Claude's adaptation (part ${k + 1}) was not JSON: ${error.message}`), {quality: true}); }
        job.done[k] = answer;
        this.db.prepare('UPDATE edition_jobs SET parts=?, updated_at=? WHERE id=?').run(JSON.stringify(job.done), now(), job.id);
      }
      const inputs = this.inputs(job.content_id);
      if (!inputs.ready || inputs.content.revision !== job.scope.contentRevision || inputs.sourceHash !== job.scope.sourceHash) throw Object.assign(new AiError('The primary video changed while Claude was adapting. The edition was not saved.'), {quality: true, stale: true});
      const answers = job.scope.parts.map((_, k) => job.done[k]), given = job.scope.keep.given;
      const raw = {sentences: [...given.filter(item => item.n), ...answers.flatMap(answer => Array.isArray(answer?.sentences) ? answer.sentences : [])],
        visible: [...given.filter(item => item.id), ...(Array.isArray(answers[0]?.visible) ? answers[0].visible : [])], package: answers[0]?.package, notes: answers.map(answer => answer?.notes).filter(Boolean).join(' ')};
      let payload;
      try { payload = L.normalise(raw, inputs.source, {lenient: true, warn: message => warnings.push(message)}); } catch (error) { throw Object.assign(new AiError(`Claude's adaptation was not usable: ${error.message}`), {quality: true}); }
      if (warnings.length) payload.notes = `${payload.notes} [Repaired: ${warnings.slice(0, 5).join(' ')}]`.trim().slice(0, 400);
      const revision = this.insertRevision({inputs, locale: job.locale, payload, actor: 'claude', note: `Claude adaptation${given.length ? ` (${given.length} unchanged items kept)` : ''}`, createdBy: job.created_by});
      this.store.transaction(() => { const at = now(); settle(at); this.db.prepare("UPDATE edition_jobs SET status='completed', revision_id=?, updated_at=? WHERE id=?").run(revision.id, at, job.id); });
      this.store.skillRuntime?.settleUsage(job.id, revision.checks.passed ? 'completed' : 'completed-with-findings');
      return revision;
    } catch (error) {
      this.store.transaction(() => {
        const at = now(), message = error instanceof AiError || error instanceof InputError ? error.message : 'The adaptation failed.';
        if (error.quality) { settle(at); this.db.prepare('UPDATE edition_jobs SET status=?, error=?, updated_at=? WHERE id=?').run(error.stale ? 'stale' : 'quality_failed', message, at, job.id); return; }
        this.db.prepare('UPDATE edition_jobs SET status=?, error=?, updated_at=? WHERE id=?').run(started || answered ? 'interrupted' : 'failed', message, at, job.id);
        if (answered || started) { used.known = used.known && !started; settle(at); }
        else this.db.prepare("UPDATE intelligence_usage SET status='released', reserved_tokens=0, updated_at=? WHERE job_id=?").run(at, job.id);
      });
      return null;
    } finally {
      this.busy = false;
    }
  }

  // ------------------------------------------------------------ L02 edition voices
  // An edition's narrator: the main narrator's connection, rights and delivery, with the voice and model the owner
  // chooses for this language (ElevenLabs' multilingual voices speak many languages with one voice).
  latestVoice(familyId, locale) { return this.db.prepare('SELECT * FROM edition_voices WHERE family_id=? AND locale=? ORDER BY revision DESC LIMIT 1').get(familyId, locale) || null; }
  voiceOf(row) { return row ? {...JSON.parse(row.payload), id: row.id, revision: row.revision, locale: row.locale, createdBy: row.created_by, createdAt: row.created_at} : null; }
  voiceCurrent(voice) { try { this.store.voiceConnector(voice.connectorId, voice.connectorRevision, voice.provider); return true; } catch { return false; } }
  saveVoice(familyId, input) {
    object(input);
    const by = person(input.createdBy), family = this.store.family(familyId), locale = text(input.locale, 'Language', 2, 20);
    requireValue(family.locales.slice(1).includes(locale), `${locale} is not one of this family's other languages.`, 400);
    const primary = this.store.voiceProfiles(familyId).at(-1);
    requireValue(primary, 'Set up the main narrator in the Voice Room (Room 02) first: an edition voice uses its connection and rights.', 409);
    this.store.voiceConnector(primary.connectorId, primary.connectorRevision, primary.provider);
    const id = (value, fallback, label) => { if (value === undefined || value === null || value === '') return fallback; const result = text(value, label, 1, 128); requireValue(/^[A-Za-z0-9_.:-]+$/.test(result), `${label} contains unsupported characters.`); return result; };
    requireValue(input.languageConfirmed === true, `Confirm that this voice may narrate in ${L.language(locale)} for commercial use.`);
    return this.store.transaction(() => {
      const latest = this.latestVoice(familyId, locale);
      requireValue((latest?.revision || 0) === input.expectedRevision, 'This language\'s voice changed in another tab. Reload before saving.', 409);
      const payload = {name: `${primary.name} · ${L.language(locale)}`, connectorId: primary.connectorId, connectorRevision: primary.connectorRevision, provider: primary.provider,
        model: id(input.model, primary.model, 'Voice model'), voiceId: id(input.voiceId, primary.voiceId, 'Voice ID'), voiceVersion: primary.voiceVersion, rights: primary.rights, delivery: primary.delivery,
        maxCharacters: primary.budget.maxCharactersPerAudition, fromProfile: {id: primary.id, revision: primary.revision}, languageConfirmedBy: by};
      const voiceId = randomUUID(), revision = (latest?.revision || 0) + 1;
      this.db.prepare('INSERT INTO edition_voices(id,family_id,locale,revision,payload,created_by,created_at) VALUES(?,?,?,?,?,?,?)').run(voiceId, familyId, locale, revision, JSON.stringify(payload), by, now());
      this.store.event(`${L.language(locale)} narrator for ${family.name}: ${payload.voiceId} (${payload.model}), set by ${by}`);
      return this.voiceOf(this.db.prepare('SELECT * FROM edition_voices WHERE id=?').get(voiceId));
    });
  }

  // ------------------------------------------------------------ L02 edition narration
  timelineOf(master) { return master ? JSON.parse(master.scope).edit?.timeline || null : null; }
  narrationRow(id) { const row = this.db.prepare('SELECT * FROM edition_narrations WHERE id=?').get(id); requireValue(row, 'Edition narration not found.', 404); return row; }
  editionVoiceCharacters(familyId, period) { return this.db.prepare("SELECT COALESCE(SUM(reserved_characters),0) AS total FROM edition_narrations WHERE family_id=? AND period_month=? AND usage_status IN ('reserved','settled','unknown')").get(familyId, period).total; }
  // A narration stands for what it was made from: the language's current approval and its current voice.
  narrationCurrent(row, scope = JSON.parse(row.scope)) {
    try {
      if (this.currentApproval(row.content_id, row.locale)?.id !== scope.editionApprovalId) return false;
      const voice = this.voiceOf(this.latestVoice(row.family_id, row.locale));
      return voice?.id === scope.voice.id && this.voiceCurrent(voice);
    } catch { return false; }
  }
  queueNarration(contentId, input) {
    object(input);
    const by = person(input.requestedBy), inputs = this.inputs(contentId);
    requireValue(inputs.ready, inputs.blockers[0], 409);
    const locale = this.locale(inputs, input.locale), approval = this.currentApproval(contentId, locale);
    requireValue(approval, `Approve the ${L.language(locale)} edition's words first.`, 409);
    requireValue(this.timelineOf(inputs.master), 'The approved master was not made from an edit, so its scenes cannot be retimed. Render the master from an edit (Room 05).', 409);
    const voice = this.voiceOf(this.latestVoice(inputs.family.id, locale));
    requireValue(voice, `Choose the ${L.language(locale)} narrator first.`, 409);
    requireValue(this.voiceCurrent(voice), 'The narrator\'s connection changed or is not tested. Test it in Connections, then set the voice again.', 409);
    const row = this.revisionRow(approval.revisionId), payload = JSON.parse(row.payload), src = JSON.parse(row.source), script = L.script(payload, src);
    requireValue(script.length <= voice.maxCharacters, `This narration has ${script.length} characters, above the voice limit of ${voice.maxCharacters} per narration (Voice Room).`, 409);
    return this.store.transaction(() => {
      requireValue(!this.db.prepare("SELECT 1 FROM edition_narrations WHERE content_id=? AND locale=? AND status IN ('queued','running')").get(contentId, locale), `A ${L.language(locale)} narration is already being made.`, 409);
      const paid = this.db.prepare("SELECT count(*) AS n FROM edition_narrations WHERE content_id=? AND locale=? AND edition_revision_id=? AND voice_id=? AND usage_status IN ('settled','unknown')").get(contentId, locale, row.id, voice.id).n;
      requireValue(paid < 3, 'These words and this voice already had 3 paid narrations.', 409);
      const estimate = L.seconds(script, locale), id = randomUUID(), at = now();
      const scope = {familyId: inputs.family.id, contentId, locale, editionRevisionId: row.id, editionRevision: row.revision, editionApprovalId: approval.id, script, characterCount: script.length,
        voice: {id: voice.id, revision: voice.revision}, connectorId: voice.connectorId, connectorRevision: voice.connectorRevision, provider: voice.provider, model: voice.model, voiceId: voice.voiceId, voiceVersion: voice.voiceVersion,
        delivery: voice.delivery, providerInstructions: voice.delivery.instructions || '', expectedDuration: {min: Math.max(1, estimate * 0.45), max: estimate * 2.1}};
      this.db.prepare("INSERT INTO edition_narrations(id,family_id,content_id,locale,edition_revision_id,voice_id,status,scope,attempts,usage_status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,'queued',?,?,'none',?,?,?)")
        .run(id, inputs.family.id, contentId, locale, row.id, voice.id, JSON.stringify(scope), paid + 1, by, at, at);
      this.store.event(`Queued the ${L.language(locale)} narration of "${inputs.content.title}" (${script.length} characters, attempt ${paid + 1} of 3)`);
      return this.publicNarration(this.narrationRow(id));
    });
  }
  retryNarration(id, input) {
    object(input);
    return this.store.transaction(() => {
      const row = this.narrationRow(id);
      requireValue(['failed', 'interrupted', 'validation_failed', 'blocked_budget'].includes(row.status), `A ${row.status} narration cannot be retried.`, 409);
      if (row.status === 'interrupted' || row.usage_status === 'unknown') requireValue(input.confirmInterrupted === true, 'The last attempt stopped after the voice service was asked; it may have been charged. Confirm the deliberate retry.', 409);
      requireValue(this.narrationCurrent(row), 'The words or the voice changed since this attempt. Make a new narration.', 409);
      const paid = this.db.prepare("SELECT count(*) AS n FROM edition_narrations WHERE content_id=? AND locale=? AND edition_revision_id=? AND voice_id=? AND usage_status IN ('settled','unknown')").get(row.content_id, row.locale, row.edition_revision_id, row.voice_id).n;
      requireValue(paid < 3, 'These words and this voice already had 3 paid narrations.', 409);
      const next = randomUUID(), at = now();
      this.db.prepare("INSERT INTO edition_narrations(id,family_id,content_id,locale,edition_revision_id,voice_id,status,scope,attempts,usage_status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,'queued',?,?,'none',?,?,?)")
        .run(next, row.family_id, row.content_id, row.locale, row.edition_revision_id, row.voice_id, row.scope, paid + 1, person(input.requestedBy || row.created_by), at, at);
      this.db.prepare("UPDATE edition_narrations SET status='retried', updated_at=? WHERE id=?").run(at, id);
      return this.publicNarration(this.narrationRow(next));
    });
  }
  claimNarration() {
    return this.store.transaction(() => {
      const row = this.db.prepare("SELECT * FROM edition_narrations WHERE status='queued' ORDER BY created_at, rowid LIMIT 1").get();
      if (!row) return null;
      const scope = JSON.parse(row.scope), family = this.store.family(row.family_id), at = now();
      if (!this.narrationCurrent(row, scope)) { this.db.prepare("UPDATE edition_narrations SET status='stale', error='The words or the voice changed before the narration started. Nothing was sent.', updated_at=? WHERE id=?").run(at, row.id); return null; }
      // Editions share the family's monthly voice characters with the main narration (Voice Room limit).
      const period = this.store.tokenPeriod(family), limit = this.store.voiceProfiles(family.id).at(-1)?.budget.monthlyCharacterLimit || 0;
      const used = this.db.prepare("SELECT COALESCE(SUM(reserved_characters),0) AS total FROM voice_usage WHERE family_id=? AND period_month=? AND status IN ('reserved','settled','unknown')").get(family.id, period).total + this.editionVoiceCharacters(family.id, period);
      if (used + scope.characterCount > limit) { this.db.prepare("UPDATE edition_narrations SET status='blocked_budget', error='The family monthly voice character limit cannot reserve this narration. Raise it in the Voice Room or wait for next month.', updated_at=? WHERE id=?").run(at, row.id); return null; }
      this.db.prepare("UPDATE edition_narrations SET status='running', usage_status='reserved', reserved_characters=?, period_month=?, updated_at=? WHERE id=?").run(scope.characterCount, period, at, row.id);
      return {...row, scope};
    });
  }
  async processNextNarration() {
    if (this.narrating) return null;
    const job = this.claimNarration();
    if (!job) return null;
    this.narrating = true;
    let started = false, final = null;
    const work = path.join(this.voiceDir, '.working', job.id), s = job.scope;
    try {
      fs.mkdirSync(work, {recursive: true});
      await V.checkTool(this.ffmpeg, 'FFmpeg'); await V.checkTool(this.ffprobe, 'ffprobe');
      const Client = s.provider === 'openai' ? V.OpenAISpeechClient : V.ElevenLabsSpeechClient, client = new Client(this.connectors.key(s.connectorId), this.connectors.fetch);
      const {parts, partWords, requestIds} = await V.speak({client, requests: V.chunkText(s.script, s.provider).map(chunk => ({text: chunk})), scope: s, work, isCurrent: () => this.narrationCurrent(job, s), onRequest: () => { started = true; }});
      const dir = path.join(this.voiceDir, s.familyId, s.contentId);
      fs.mkdirSync(dir, {recursive: true});
      final = path.join(dir, `${s.locale}-${job.id}.wav`);
      const {analysis, bytes} = await V.joinNarration({parts, partWords, final, scope: s, ffmpeg: this.ffmpeg, ffprobe: this.ffprobe});
      const artifact = {relativePath: path.relative(this.dataRoot, final).replaceAll('\\', '/'), sha256: createHash('sha256').update(bytes).digest('hex'), sizeBytes: bytes.length, mime: 'audio/wav'};
      const saved = this.store.transaction(() => {
        const at = now(), current = this.narrationCurrent(job, s);
        const status = !current ? 'stale' : analysis.passed ? 'completed' : 'validation_failed';
        this.db.prepare("UPDATE edition_narrations SET status=?, result=?, error=?, usage_status='settled', updated_at=? WHERE id=?").run(status, JSON.stringify({artifact, analysis, provider: {requestIds, model: s.model, voiceId: s.voiceId}}),
          status === 'stale' ? 'The words or the voice changed while the narration was being made.' : status === 'validation_failed' ? 'The narration failed one or more real-audio checks.' : null, at, job.id);
        this.store.event(`${L.language(s.locale)} narration of content ${s.contentId}: ${status}`);
        return this.publicNarration(this.narrationRow(job.id));
      });
      final = null;
      return saved;
    } catch (error) {
      if (final) fs.rmSync(final, {force: true});
      this.store.transaction(() => this.db.prepare("UPDATE edition_narrations SET status=?, error=?, usage_status=?, reserved_characters=CASE WHEN ? THEN reserved_characters ELSE 0 END, updated_at=? WHERE id=?")
        .run(started ? 'interrupted' : 'failed', error instanceof InputError ? error.message : 'The narration failed.', started ? 'unknown' : 'released', started ? 1 : 0, now(), job.id));
      return null;
    } finally {
      fs.rmSync(work, {recursive: true, force: true});
      this.narrating = false;
    }
  }
  narrationFile(id) {
    const row = this.narrationRow(id), artifact = row.result ? JSON.parse(row.result).artifact : null;
    requireValue(artifact, 'This narration has no audio.', 404);
    const file = path.resolve(this.dataRoot, artifact.relativePath);
    requireValue(file.startsWith(path.resolve(this.dataRoot) + path.sep) && fs.existsSync(file) && R.fileSha256(file) === artifact.sha256, 'The narration file is missing or changed.', 409);
    return {file, size: fs.statSync(file).size, mime: artifact.mime};
  }
  // How the approved edit's scenes land in this narration (computed against the master that is approved now).
  syncFor(row, inputs = null) {
    const result = row.result ? JSON.parse(row.result) : null, master = (inputs || this.inputs(row.content_id)).master, timeline = this.timelineOf(master);
    if (!result || !timeline) return null;
    const edition = this.revisionRow(row.edition_revision_id);
    return {...L.sync({timeline, payload: JSON.parse(edition.payload), src: JSON.parse(edition.source), words: result.analysis.alignment?.words || null, narrationSeconds: result.analysis.durationSeconds, locale: row.locale}), masterId: master.id};
  }
  approveNarration(id, input) {
    object(input);
    const by = person(input.approvedBy, 'Your name');
    return this.store.transaction(() => {
      const row = this.narrationRow(id), scope = JSON.parse(row.scope);
      requireValue(row.status === 'completed', 'Only a finished narration that passed its audio checks can be approved.', 409);
      requireValue(this.narrationCurrent(row, scope), 'The words or the voice changed after this narration. Make a new one.', 409);
      this.narrationFile(id);
      const sync = this.syncFor(row);
      requireValue(sync, 'The approved master has no edit to follow.', 409);
      requireValue(sync.passed, sync.issues.find(item => item.severity === 'critical')?.message, 409);
      const c = object(input.confirmations, 'Confirmations');
      for (const [key, message] of [['listened', `Confirm that a speaker of ${L.language(row.locale)} listened to the whole narration.`], ['pronunciation', 'Confirm that names, numbers and places are pronounced right.'], ['syncReviewed', 'Confirm that you read the scene timing list.']]) requireValue(c[key] === true, message);
      if (sync.counts.outside) requireValue(c.syncAccepted === true, `Accept the ${sync.counts.outside === 1 ? 'scene that changes' : `${sync.counts.outside} scenes that change`} length beyond the natural range, or shorten the wording in the edition first.`);
      const approvalId = randomUUID();
      this.db.prepare('INSERT INTO edition_narration_approvals(id,narration_id,content_id,locale,edition_approval_id,master_id,approved_by,notes,confirmations,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(approvalId, id, row.content_id, row.locale, scope.editionApprovalId, sync.masterId, by, text(input.notes || '', 'Notes', 0, 2000), JSON.stringify({listened: true, pronunciation: true, syncReviewed: true, syncAccepted: c.syncAccepted === true}), now());
      this.store.event(`${L.language(row.locale)} narration of "${this.store.content(row.content_id).title}" approved by ${by}`);
      return this.publicNarration(row);
    });
  }
  // An approval holds while it is the newest for its language, the narration still stands for the approved words
  // and voice, its file is intact and its scenes were timed against the master approved now.
  narrationApproval(row) {
    const approval = this.db.prepare('SELECT * FROM edition_narration_approvals WHERE narration_id=? ORDER BY created_at DESC LIMIT 1').get(row.id);
    if (!approval) return null;
    const newer = this.db.prepare('SELECT 1 FROM edition_narration_approvals WHERE content_id=? AND locale=? AND created_at>? LIMIT 1').get(row.content_id, row.locale, approval.created_at);
    let reason = newer ? 'A newer narration was approved.' : !this.narrationCurrent(row) ? 'The words or the voice changed.' : null;
    if (!reason) { try { this.narrationFile(row.id); } catch (error) { reason = error.message; } }
    if (!reason && this.approvedMaster(row.content_id)?.id !== approval.master_id) reason = 'A different final master is approved now: check the scene timing again.';
    return {id: approval.id, approvedBy: approval.approved_by, notes: approval.notes, at: approval.created_at, current: !reason, staleReason: reason};
  }
  // The narration approval that stands now for one language (L03 renders it).
  currentNarration(contentId, locale) {
    for (const row of this.db.prepare("SELECT * FROM edition_narrations WHERE content_id=? AND locale=? AND status='completed' ORDER BY created_at DESC, rowid DESC").all(contentId, locale)) {
      const approval = this.narrationApproval(row);
      if (approval?.current) return {id: row.id, approvalId: approval.id, approvedBy: approval.approvedBy};
    }
    return null;
  }
  publicNarration(row, inputs = null) {
    const scope = JSON.parse(row.scope), result = row.result ? JSON.parse(row.result) : null;
    const analysis = result ? {durationSeconds: result.analysis.durationSeconds, passed: result.analysis.passed, checks: result.analysis.checks, pace: result.analysis.pace || null, timing: result.analysis.alignment ? 'measured' : 'estimated'} : null;
    return {id: row.id, contentId: row.content_id, locale: row.locale, status: row.status, error: row.error, attempts: row.attempts, editionRevision: scope.editionRevision, voice: {voiceId: scope.voiceId, model: scope.model},
      characters: scope.characterCount, usage: row.usage_status, createdBy: row.created_by, createdAt: row.created_at, current: this.narrationCurrent(row, scope),
      ...(result ? {analysis, audioUrl: `/api/edition-narrations/${row.id}/audio`, sync: (() => { try { return this.syncFor(row, inputs); } catch { return null; } })(), approval: this.narrationApproval(row)} : {})};
  }

  // ------------------------------------------------------------ L03 edition render and release
  // An edition renders like the final master (same pinned FFmpeg, renderer, upload format, checks and recovery), from
  // the approved master's own recipe with the edition's voice, its words on screen, captions on its voice and every
  // scene retimed to that voice. It stands while its narration approval and the master are the ones approved now.
  editionRenderCurrent(row, scope = JSON.parse(row.scope)) {
    try { return this.currentNarration(row.content_id, scope.edition.locale)?.approvalId === scope.edition.narrationApprovalId && this.approvedMaster(row.content_id)?.id === scope.edition.masterId; } catch { return false; }
  }
  // The approved package's chosen thumbnail, drawn again with this language's words (same shot, frame and layout).
  async editionThumbnail(contentId, payload) {
    const row = this.packaging.latestRow(contentId), pkg = row ? JSON.parse(row.payload) : null, chosen = pkg?.thumbnails?.find(item => item.id === pkg.chosenThumbnail), words = payload.package?.thumbnail;
    if (!chosen || !words?.text) return null;
    const images = await this.packaging.drawThumbnails({thumbnails: [{...chosen, text: words.text, accent: words.accent || ''}]}, this.packaging.inputs(contentId));
    return {...images[chosen.id], text: words.text, accent: words.accent || ''};
  }
  async queueEditionRender(contentId, input) {
    object(input);
    const by = person(input.requestedBy), inputs = this.inputs(contentId);
    requireValue(inputs.ready, inputs.blockers[0], 409);
    const locale = this.locale(inputs, input.locale), narration = this.currentNarration(contentId, locale);
    requireValue(narration, `Approve the ${L.language(locale)} narration first.`, 409);
    const nrow = this.narrationRow(narration.id), nscope = JSON.parse(nrow.scope), result = JSON.parse(nrow.result), sync = this.syncFor(nrow, inputs);
    requireValue(sync?.passed, sync?.issues.find(item => item.severity === 'critical')?.message || 'The approved master has no edit to follow.', 409);
    const master = inputs.master, scope = JSON.parse(master.scope), edition = this.revisionRow(nscope.editionRevisionId), payload = JSON.parse(edition.payload);
    const timeline = L.editionTimeline(scope.edit.timeline, sync, {payload, words: result.analysis.alignment?.words || null, narrationSeconds: result.analysis.durationSeconds, locale});
    try { B.validateTimeline(timeline); } catch (error) { throw new InputError(`The ${L.language(locale)} edit could not be retimed: ${error.message}`, 409); }
    const thumbnail = await this.editionThumbnail(contentId, payload);
    const renderScope = {...scope, source: undefined,
      narration: {approvalId: narration.approvalId, relativePath: result.artifact.relativePath, sha256: result.artifact.sha256, durationSeconds: result.analysis.durationSeconds},
      edit: {...scope.edit, timeline, drawings: L.editionDrawings(scope.edit.drawings, payload), graphicsAss: B.graphicsAss(timeline, F.withFonts(scope.style.spec)) || null, soundtrack: L.editionSoundtrack(scope.edit.soundtrack, scope.edit.timeline, sync)},
      edition: {locale, language: L.language(locale), masterId: master.id, editionRevisionId: edition.id, editionRevision: edition.revision, narrationId: nrow.id, narrationApprovalId: narration.approvalId, thumbnail, package: payload.package, sync: {method: sync.method, counts: sync.counts, maxDrift: sync.maxDrift}}};
    return this.store.transaction(() => {
      requireValue(!this.db.prepare("SELECT 1 FROM render_jobs WHERE content_id=? AND status IN ('queued','running')").get(contentId), 'A render for this script is already queued or running.', 409);
      const id = randomUUID(), at = now();
      this.db.prepare("INSERT INTO render_jobs(id,family_id,content_id,visual_approval_id,preset,status,scope,attempts,created_by,created_at,updated_at) VALUES(?,?,?,?,'edition','queued',?,0,?,?,?)").run(id, master.family_id, contentId, master.visual_approval_id, JSON.stringify(renderScope), by, at, at);
      this.store.event(`Queued the ${L.language(locale)} edition of "${inputs.content.title}" (${timeline.clips.length} clips retimed to its voice)`);
      return this.publicEditionRender(this.renders.row(id));
    });
  }
  approveEditionRender(renderId, input) {
    object(input);
    const by = person(input.approvedBy, 'Your name');
    return this.store.transaction(() => {
      const row = this.renders.row(renderId), scope = JSON.parse(row.scope);
      requireValue(row.preset === 'edition' && row.status === 'completed', 'Only a finished language edition can be approved.', 409);
      requireValue(!this.db.prepare('SELECT 1 FROM edition_releases WHERE render_id=?').get(renderId), 'This edition is already approved.', 409);
      requireValue(this.editionRenderCurrent(row, scope), 'The words, the narration or the master changed after this render. Render the edition again.', 409);
      for (const kind of ['video', 'manifest']) this.renders.file(renderId, kind);
      const result = JSON.parse(row.result), blocking = result.qc.filter(check => !check.passed && EDITION_BLOCKING.includes(check.name));
      requireValue(!blocking.length, `The edition cannot be approved: ${blocking[0]?.name} - ${blocking[0]?.detail}`, 409);
      const c = object(input.confirmations, 'Confirmations');
      for (const [key, message] of [['watched', `Confirm that a speaker of ${scope.edition.language} watched the opening, a middle part and the ending at full quality.`], ['listened', 'Confirm that you listened to the sound of this edition.'], ['packageMatches', 'Confirm that the title, description and thumbnail words fit this edition.']]) requireValue(c[key] === true, message);
      if (!result.qcPassed) requireValue(c.qcAccepted === true, 'Accept the remaining check findings listed for this edition, or fix them first.');
      const id = randomUUID();
      this.db.prepare('INSERT INTO edition_releases(id,render_id,content_id,locale,narration_approval_id,master_id,approved_by,notes,confirmations,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(id, renderId, row.content_id, scope.edition.locale, scope.edition.narrationApprovalId, scope.edition.masterId, by, text(input.notes || '', 'Notes', 0, 2000), JSON.stringify({watched: true, listened: true, packageMatches: true, qcAccepted: c.qcAccepted === true}), now());
      this.store.event(`${scope.edition.language} edition of "${this.store.content(row.content_id).title}" approved for release by ${by}`);
      return this.publicEditionRender(row);
    });
  }
  // A release holds while it is the newest for its language, its render still stands and its files are intact.
  editionRelease(row) {
    const approval = this.db.prepare('SELECT * FROM edition_releases WHERE render_id=? ORDER BY created_at DESC LIMIT 1').get(row.id);
    if (!approval) return null;
    const newer = this.db.prepare('SELECT 1 FROM edition_releases WHERE content_id=? AND locale=? AND created_at>? LIMIT 1').get(row.content_id, approval.locale, approval.created_at);
    let reason = newer ? 'A newer edition was approved.' : !this.editionRenderCurrent(row) ? 'The words, the narration or the master changed.' : null;
    if (!reason) { try { this.renders.file(row.id, 'video'); } catch (error) { reason = error.message; } }
    return {id: approval.id, approvedBy: approval.approved_by, notes: approval.notes, at: approval.created_at, current: !reason, staleReason: reason};
  }
  // The released edition of one language (publishing, when it is built, takes this).
  currentRelease(contentId, locale) {
    for (const row of this.db.prepare("SELECT * FROM render_jobs WHERE content_id=? AND preset='edition' AND status='completed' ORDER BY created_at DESC, rowid DESC").all(contentId)) {
      if (JSON.parse(row.scope).edition.locale !== locale) continue;
      const release = this.editionRelease(row);
      if (release?.current) return {renderId: row.id, releaseId: release.id, approvedBy: release.approvedBy};
    }
    return null;
  }
  editionThumbnailFile(renderId) {
    const thumb = JSON.parse(this.renders.row(renderId).scope).edition?.thumbnail;
    requireValue(thumb, 'This edition has no thumbnail.', 404);
    const file = this.renders.localFile(thumb.relativePath);
    requireValue(fs.existsSync(file) && R.fileSha256(file) === thumb.sha256, 'The thumbnail file is missing or changed.', 409);
    return file;
  }
  publicEditionRender(row) {
    const scope = JSON.parse(row.scope);
    return {...this.renders.publicJob(row), locale: scope.edition.locale, editionRevision: scope.edition.editionRevision, sync: scope.edition.sync, standing: this.editionRenderCurrent(row, scope), release: this.editionRelease(row),
      thumbnailUrl: scope.edition.thumbnail ? `/api/edition-renders/${row.id}/thumbnail` : null, package: scope.edition.package};
  }

  // ------------------------------------------------------------ approval
  approve(revisionId, input) {
    object(input);
    const by = person(input.approvedBy, 'Your name');
    return this.store.transaction(() => {
      const row = this.revisionRow(revisionId), latest = this.latestRow(row.content_id, row.locale), inputs = this.inputs(row.content_id), checks = JSON.parse(row.checks);
      requireValue(latest.id === row.id, `A newer ${L.language(row.locale)} revision exists (r${latest.revision}). Approve that one.`, 409);
      requireValue(inputs.ready, inputs.blockers[0], 409);
      requireValue(row.source_hash === inputs.sourceHash, 'The primary video\'s words changed after this edition. Adapt it again (unchanged items are kept).', 409);
      requireValue(checks.passed, `Fix the critical edition checks first: ${checks.issues.find(item => item.severity === 'critical')?.message}`, 409);
      const c = object(input.confirmations, 'Confirmations');
      for (const [key, message] of [['meaningReviewed', 'Confirm that a speaker of this language read the whole narration and it says what the primary video says.'], ['factsChecked', 'Confirm that names, numbers, dates and units are right for this market.'], ['visibleChecked', 'Confirm that every on-screen word reads naturally and fits.'], ['packageHonest', 'Confirm that the title and thumbnail words promise only what the video shows.']]) requireValue(c[key] === true, message);
      const id = randomUUID();
      this.db.prepare('INSERT INTO edition_approvals(id,revision_id,content_id,locale,source_hash,master_id,approved_by,notes,confirmations,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(id, row.id, row.content_id, row.locale, row.source_hash, inputs.master.id, by, text(input.notes || '', 'Notes', 0, 2000), JSON.stringify({meaningReviewed: true, factsChecked: true, visibleChecked: true, packageHonest: true}), now());
      this.store.event(`${L.language(row.locale)} edition r${row.revision} of "${inputs.content.title}" approved by ${by}`);
      return this.publicRevision(row);
    });
  }
  // An approval holds while it is the newest revision for its language, the primary video's words are unchanged and a
  // master is still approved.
  approvalFor(row, inputs = null) {
    const approval = this.db.prepare('SELECT * FROM edition_approvals WHERE revision_id=? ORDER BY created_at DESC LIMIT 1').get(row.id);
    if (!approval) return null;
    const current = inputs || (() => { try { return this.inputs(row.content_id); } catch { return null; } })(), latest = this.latestRow(row.content_id, row.locale);
    const reason = latest.id !== row.id ? 'A newer revision was saved.' : !current?.ready ? (current?.blockers[0] || 'The primary video is no longer approved.') : current.sourceHash !== approval.source_hash ? 'The primary video\'s words changed.' : null;
    return {id: approval.id, approvedBy: approval.approved_by, notes: approval.notes, at: approval.created_at, current: !reason, staleReason: reason};
  }
  // The edition approval that stands now for one language (L02 narrates it).
  currentApproval(contentId, locale) {
    const latest = this.latestRow(contentId, locale), approval = latest ? this.approvalFor(latest) : null;
    return approval?.current ? {id: approval.id, revisionId: latest.id, revision: latest.revision, approvedBy: approval.approvedBy, at: approval.at} : null;
  }
  // The edition's narration script and package text, for L02 and for the owner to copy.
  exportText(revisionId) {
    const row = this.revisionRow(revisionId), payload = JSON.parse(row.payload), src = JSON.parse(row.source), content = this.store.content(row.content_id);
    return {filename: `${content.title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 50) || 'edition'}-${row.locale}-r${row.revision}.txt`,
      text: [`LANGUAGE\n${L.language(row.locale)} (${row.locale})`, `NARRATION\n${L.script(payload, src)}`, ...(payload.package ? [`TITLE\n${payload.package.title}`, `DESCRIPTION\n${payload.package.description}`, `TAGS\n${payload.package.tags.join(', ')}`, ...(payload.package.thumbnail ? [`THUMBNAIL WORDS\n${payload.package.thumbnail.text}`] : [])] : []),
        ...(payload.visible.length ? [`ON-SCREEN WORDS\n${payload.visible.map(item => `${src.visible.find(entry => entry.id === item.id)?.source} -> ${item.text}`).join('\n')}`] : [])].join('\n\n') + '\n'};
  }
  publicRevision(row, inputs = null) {
    return {id: row.id, contentId: row.content_id, locale: row.locale, language: L.language(row.locale), revision: row.revision, contentRevision: row.content_revision, masterId: row.master_id, actor: row.actor, note: row.note, createdBy: row.created_by, createdAt: row.created_at,
      payload: JSON.parse(row.payload), source: JSON.parse(row.source), checks: JSON.parse(row.checks), approval: this.approvalFor(row, inputs)};
  }
  state() {
    const families = new Map(this.store.families().map(family => [family.id, family]));
    const contents = this.store.contents().filter(content => (families.get(content.familyId)?.locales.length || 0) > 1 && (content.state === 'approved' || this.db.prepare('SELECT 1 FROM edition_revisions WHERE content_id=? LIMIT 1').get(content.id)));
    return {
      busy: !!this.db.prepare("SELECT 1 FROM edition_jobs WHERE status IN ('queued','running') UNION ALL SELECT 1 FROM edition_narrations WHERE status IN ('queued','running') UNION ALL SELECT 1 FROM render_jobs WHERE preset='edition' AND status IN ('queued','running') LIMIT 1").get(),
      contents: contents.map(content => {
        const inputs = (() => { try { return this.inputs(content.id); } catch (error) { return {ready: false, blockers: [error.message], targets: [], source: null}; } })();
        return {contentId: content.id, familyId: content.familyId, title: content.title, ready: inputs.ready, blockers: inputs.blockers, masterId: inputs.master?.id || null, primaryLocale: families.get(content.familyId).primaryLocale,
          primaryVoice: (() => { const profile = this.store.voiceProfiles(content.familyId).at(-1); return profile ? {name: profile.name, provider: profile.provider, model: profile.model, voiceId: profile.voiceId, priceCentsPerMillionCharacters: profile.budget.priceCentsPerMillionCharacters} : null; })(), hasEdit: !!this.timelineOf(inputs.master),
          source: inputs.source ? {sentences: inputs.source.sentences.length, visible: inputs.source.visible.length, designed: inputs.source.designed.length, package: !!inputs.source.package, full: inputs.source} : null,
          editions: (inputs.targets || families.get(content.familyId).locales.slice(1)).map(locale => {
            const latest = this.latestRow(content.id, locale);
            const voice = this.voiceOf(this.latestVoice(content.familyId, locale));
            return {locale, language: L.language(locale), latest: latest ? this.publicRevision(latest, inputs.ready ? inputs : null) : null, voice: voice ? {...voice, current: this.voiceCurrent(voice)} : null, scriptCharacters: latest ? L.script(JSON.parse(latest.payload), JSON.parse(latest.source)).length : 0,
              renders: this.db.prepare("SELECT * FROM render_jobs WHERE content_id=? AND preset='edition' ORDER BY created_at DESC, rowid DESC").all(content.id).filter(row => JSON.parse(row.scope).edition.locale === locale).slice(0, 3).map(row => this.publicEditionRender(row)),
              narrations: this.db.prepare("SELECT * FROM edition_narrations WHERE content_id=? AND locale=? AND status!='retried' ORDER BY created_at DESC, rowid DESC LIMIT 3").all(content.id, locale).map(row => this.publicNarration(row, inputs.ready ? inputs : null)), sourceChanged: !!(latest && inputs.sourceHash && latest.source_hash !== inputs.sourceHash),
              history: this.db.prepare('SELECT id, revision, actor, note, created_by, created_at FROM edition_revisions WHERE content_id=? AND locale=? ORDER BY revision DESC LIMIT 10').all(content.id, locale).map(item => ({id: item.id, revision: item.revision, actor: item.actor, note: item.note, createdBy: item.created_by, createdAt: item.created_at})),
              jobs: this.db.prepare('SELECT * FROM edition_jobs WHERE content_id=? AND locale=? ORDER BY created_at DESC, rowid DESC LIMIT 3').all(content.id, locale).map(row => this.publicJob(row))};
          })};
      }),
    };
  }
}

module.exports = {LocalizationRoom, sentencesOf};
