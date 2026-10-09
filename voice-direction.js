'use strict';
// P08b - The voice director. On a click, Claude marks how every sentence of an approved script is performed
// (delivery.js), inside a token reservation and never retried by itself. Directions are immutable revisions
// tied to one script revision; the owner can change any line, which makes a new revision. The Voice Room
// performs the newest direction when the owner chooses it for an audition.
const {randomUUID, createHash} = require('node:crypto');
const {InputError} = require('./store');
const {AiError, messageTokenUpperBound} = require('./writer');
const {Ai} = require('./ai');
const {connectorCurrent, connectorReference} = require('./intel-sources');
const D = require('./delivery');
const {splitSentences} = require('./scene-room');

const requireValue = (ok, message, status = 400) => { if (!ok) throw new InputError(message, status); };
const now = () => new Date().toISOString();
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const object = (value, label = 'Request') => { requireValue(value && typeof value === 'object' && !Array.isArray(value), `${label} must be a JSON object.`); return value; };
const person = (value, label = 'Your name') => { requireValue(typeof value === 'string' && value.trim().length >= 2 && value.trim().length <= 80, `Enter ${label.toLowerCase()} (2-80 characters).`); return value.trim(); };
// About 60 answer tokens per directed sentence, with room for the summary.
const answerTokens = count => Math.min(64000, 1200 + count * 60);

class VoiceDirector {
  constructor(store, connectors, {ai = new Ai(connectors), competitorIntel = null, styles = null} = {}) {
    this.store = store; this.db = store.db; this.connectors = connectors; this.ai = ai; this.competitorIntel = competitorIntel; this.styles = styles;
    this.busy = false;
    this.migrate();
    // A job that was running when the program stopped may have reached Claude: its usage stays counted.
    for (const row of this.db.prepare("SELECT id FROM voice_direction_jobs WHERE status='running'").all()) {
      this.db.prepare("UPDATE voice_direction_jobs SET status='interrupted', error='The program stopped while Claude was directing. Claude may have used tokens; retry deliberately.', updated_at=? WHERE id=?").run(now(), row.id);
      this.db.prepare("UPDATE intelligence_usage SET status='unknown', updated_at=? WHERE job_id=? AND status='reserved'").run(now(), row.id);
    }
  }
  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS voice_direction_jobs(id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id), content_id TEXT NOT NULL REFERENCES content(id), status TEXT NOT NULL, scope TEXT NOT NULL, attempts INTEGER NOT NULL, error TEXT, direction_id TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS voice_directions(id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id), content_id TEXT NOT NULL REFERENCES content(id), content_revision INTEGER NOT NULL, revision INTEGER NOT NULL, source TEXT NOT NULL, payload TEXT NOT NULL, payload_hash TEXT NOT NULL, note TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(content_id, revision));
      CREATE TRIGGER IF NOT EXISTS voice_directions_immutable BEFORE UPDATE ON voice_directions BEGIN SELECT RAISE(ABORT, 'Voice directions are immutable; make a new revision instead.'); END;
      CREATE TRIGGER IF NOT EXISTS voice_directions_keep BEFORE DELETE ON voice_directions BEGIN SELECT RAISE(ABORT, 'Voice directions are kept for history.'); END;
    `);
  }

  // ------------------------------------------------------------ inputs
  inputs(contentId) {
    const content = this.store.content(contentId), family = this.store.family(content.familyId), blockers = [];
    if (content.state !== 'approved') blockers.push('Approve the current script revision in Content Studio first.');
    const sentences = splitSentences(content.script, family.primaryLocale).map(({n, text}) => ({n, text}));
    if (!sentences.length) blockers.push('The script has no sentences to direct.');
    return {content, family, sentences, ready: !blockers.length, blockers};
  }
  // Techniques learned from competitors' voice-overs (30/70 rule), when the family has a current blueprint.
  voiceGuidance(familyId) {
    try {
      const current = this.competitorIntel?.currentBlueprint(familyId);
      if (!current || current.outdated) return null;
      const clip = value => String(value).slice(0, 200);
      return {rule: 'Techniques only; at most 30% reference, at least 70% original. Never imitate a person.', observations: (current.result.voice?.observations || []).slice(0, 5).map(clip),
        learnedPatterns: current.result.adopt.filter(item => item.area === 'voice').slice(0, 4).map(item => clip(item.pattern)), originalContributions: current.result.original.filter(item => item.area === 'voice').slice(0, 4).map(item => clip(item.contribution))};
    } catch { return null; }
  }
  promptInput(inputs) {
    const style = this.styles?.handoffs().find(item => item.familyId === inputs.family.id && item.ready);
    const spec = style ? JSON.parse(this.styles.revisionRow(style.revisionId).spec) : null;
    return {family: {niche: inputs.family.niche, audience: inputs.family.audience, format: inputs.family.format, locale: inputs.family.primaryLocale},
      ...(spec ? {style: {name: spec.name, summary: spec.summary, musicMoods: spec.audio.musicMoods, motionIntensity: spec.motion.intensity}} : {}),
      ...(this.voiceGuidance(inputs.family.id) ? {competitorVoice: this.voiceGuidance(inputs.family.id)} : {}),
      title: inputs.content.title, sentences: inputs.sentences};
  }

  // ------------------------------------------------------------ jobs
  queue(contentId, input) {
    object(input);
    const by = person(input.requestedBy), inputs = this.inputs(contentId);
    requireValue(inputs.ready, inputs.blockers[0], 409);
    const connector = connectorReference(this.connectors, input.connector, 'ai', 'Claude', true);
    return this.store.transaction(() => {
      requireValue(!this.db.prepare("SELECT 1 FROM voice_direction_jobs WHERE content_id=? AND status IN ('queued','running')").get(contentId), 'Claude is already directing this narration.', 409);
      const promptInput = this.promptInput(inputs), maxTokens = answerTokens(inputs.sentences.length), tokenLimit = messageTokenUpperBound(D.messages(promptInput)) + maxTokens;
      const id = randomUUID(), at = now();
      this.db.prepare("INSERT INTO voice_direction_jobs(id,family_id,content_id,status,scope,attempts,created_by,created_at,updated_at) VALUES(?,?,?,'queued',?,0,?,?,?)").run(id, inputs.family.id, contentId, JSON.stringify({contentRevision: inputs.content.revision, connector, promptInput, maxTokens, tokenLimit}), by, at, at);
      this.store.event(`Queued Claude voice direction for "${inputs.content.title}"`);
      return this.publicJob(this.jobRow(id));
    });
  }
  jobRow(id) { const row = this.db.prepare('SELECT * FROM voice_direction_jobs WHERE id=?').get(id); requireValue(row, 'Voice direction job not found.', 404); return row; }
  publicJob(row) { const usage = this.db.prepare('SELECT * FROM intelligence_usage WHERE job_id=?').get(row.id); return {id: row.id, contentId: row.content_id, status: row.status, error: row.error, attempts: row.attempts, directionId: row.direction_id, createdBy: row.created_by, createdAt: row.created_at, usage: usage ? {status: usage.status, total: usage.total_tokens, reserved: usage.reserved_tokens} : null}; }
  retry(id, input) {
    object(input);
    return this.store.transaction(() => {
      const row = this.jobRow(id);
      requireValue(['failed', 'interrupted', 'quality_failed', 'blocked_budget', 'stale'].includes(row.status), `A ${row.status} direction cannot be retried.`, 409);
      requireValue(row.attempts < 3, 'This direction already used 3 attempts. Ask for a new one.', 409);
      if (row.status === 'interrupted') requireValue(input.confirmInterrupted === true, 'The last attempt was interrupted and Claude may have used tokens. Confirm the deliberate retry.', 409);
      if (this.db.prepare('SELECT 1 FROM intelligence_usage WHERE job_id=?').get(id)) this.db.prepare('UPDATE intelligence_usage SET job_id=? WHERE job_id=?').run(`${id}:attempt${row.attempts}`, id);
      this.db.prepare("UPDATE voice_direction_jobs SET status='queued', error=NULL, updated_at=? WHERE id=?").run(now(), id);
      return this.publicJob(this.jobRow(id));
    });
  }
  claim() {
    return this.store.transaction(() => {
      const row = this.db.prepare("SELECT * FROM voice_direction_jobs WHERE status='queued' ORDER BY created_at, rowid LIMIT 1").get();
      if (!row) return null;
      const scope = JSON.parse(row.scope), family = this.store.family(row.family_id), at = now();
      const stop = (status, error) => { this.db.prepare('UPDATE voice_direction_jobs SET status=?, error=?, updated_at=? WHERE id=?').run(status, error, at, row.id); return null; };
      if (this.store.content(row.content_id).revision !== scope.contentRevision) return stop('stale', 'The script changed before Claude started. Nothing was sent.');
      if (!connectorCurrent(this.connectors, scope.connector, 'ai')) return stop('stale', 'The Claude connection changed or is not tested. Nothing was sent.');
      const summary = this.store.usageSummary(family.id);
      if (summary.settledTokens + summary.reservedTokens + scope.tokenLimit > family.tokenBudget.monthlyLimit) return stop('blocked_budget', 'The family monthly token limit cannot reserve this direction. Raise it or wait for next month.');
      this.db.prepare("INSERT INTO intelligence_usage(job_id,family_id,kind,period_month,status,reserved_tokens,created_at,updated_at) VALUES(?,?,'voice_direction',?,'reserved',?,?,?)").run(row.id, family.id, this.store.tokenPeriod(family), scope.tokenLimit, at, at);
      this.db.prepare("UPDATE voice_direction_jobs SET status='running', attempts=attempts+1, updated_at=? WHERE id=?").run(at, row.id);
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
      const reply = await this.ai.complete({connectorId: job.scope.connector.id, task: 'voice', messages: D.messages(job.scope.promptInput), maxTokens: job.scope.maxTokens, onStart: () => { started = true; }});
      usage = reply.usage;
      const inputs = this.inputs(job.content_id);
      if (inputs.content.revision !== job.scope.contentRevision || !inputs.ready) throw Object.assign(new AiError('The script changed while Claude was directing. The direction was not saved.'), {quality: true, stale: true});
      let raw;
      try { raw = JSON.parse(reply.content); } catch { const text = String(reply.content), from = text.indexOf('{'), to = text.lastIndexOf('}'); try { raw = JSON.parse(text.slice(from, to + 1)); } catch { raw = null; } }
      if (!raw) throw Object.assign(new AiError('Claude did not return a usable voice direction.'), {quality: true});
      const warnings = [];
      let direction;
      try { direction = D.validate(raw, inputs.sentences, {lenient: true, warn: message => warnings.push(message)}); } catch (error) { throw Object.assign(new AiError(`Claude's direction was not usable: ${error.message}`), {quality: true}); }
      const saved = this.store.transaction(() => {
        const created = this.insert({inputs, direction, warnings, source: 'claude', note: `Claude direction (${reply.model})`, createdBy: job.created_by});
        const at = now();
        settle(Number.isSafeInteger(usage?.totalTokens) ? 'settled' : 'unknown', at);
        this.db.prepare("UPDATE voice_direction_jobs SET status='completed', direction_id=?, updated_at=? WHERE id=?").run(created.id, at, job.id);
        return created;
      });
      return saved;
    } catch (error) {
      this.store.transaction(() => {
        const at = now(), message = error instanceof AiError || error instanceof InputError ? error.message : 'The voice direction failed.';
        if (error.quality || usage) { settle(Number.isSafeInteger(usage?.totalTokens) ? 'settled' : 'unknown', at); this.db.prepare('UPDATE voice_direction_jobs SET status=?, error=?, updated_at=? WHERE id=?').run(error.stale ? 'stale' : 'quality_failed', message, at, job.id); return; }
        this.db.prepare('UPDATE voice_direction_jobs SET status=?, error=?, updated_at=? WHERE id=?').run(started ? 'interrupted' : 'failed', message, at, job.id);
        this.db.prepare('UPDATE intelligence_usage SET status=?, reserved_tokens=CASE WHEN ? THEN reserved_tokens ELSE 0 END, updated_at=? WHERE job_id=?').run(started ? 'unknown' : 'released', started ? 1 : 0, at, job.id);
      });
      return null;
    } finally {
      this.busy = false;
    }
  }

  // ------------------------------------------------------------ revisions
  // Must run inside a transaction.
  insert({inputs, direction, warnings = [], source, note, createdBy}) {
    const latest = this.db.prepare('SELECT revision FROM voice_directions WHERE content_id=? ORDER BY revision DESC LIMIT 1').get(inputs.content.id);
    const payload = {...direction, sentences: inputs.sentences, warnings: warnings.slice(0, 100)}, id = randomUUID(), revision = (latest?.revision || 0) + 1;
    this.db.prepare('INSERT INTO voice_directions(id,family_id,content_id,content_revision,revision,source,payload,payload_hash,note,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, inputs.family.id, inputs.content.id, inputs.content.revision, revision, source, JSON.stringify(payload), hash(payload), note, createdBy, now());
    this.store.event(`Voice direction r${revision} (${source}) for "${inputs.content.title}"`);
    return this.direction(id);
  }
  directionRow(id) { const row = this.db.prepare('SELECT * FROM voice_directions WHERE id=?').get(id); requireValue(row, 'Voice direction not found.', 404); return row; }
  direction(id) {
    const row = this.directionRow(id), payload = JSON.parse(row.payload), content = this.store.content(row.content_id);
    const latest = this.db.prepare('SELECT id FROM voice_directions WHERE content_id=? ORDER BY revision DESC LIMIT 1').get(row.content_id);
    return {id: row.id, contentId: row.content_id, contentRevision: row.content_revision, revision: row.revision, source: row.source, note: row.note, createdBy: row.created_by, createdAt: row.created_at,
      current: content.revision === row.content_revision && latest.id === row.id, ...payload};
  }
  latest(contentId) {
    const content = this.store.content(contentId);
    const row = this.db.prepare('SELECT id FROM voice_directions WHERE content_id=? AND content_revision=? ORDER BY revision DESC LIMIT 1').get(contentId, content.revision);
    return row ? this.direction(row.id) : null;
  }
  // The owner changes lines; the whole direction is checked strictly and saved as a new revision.
  edit(id, input) {
    object(input);
    const editedBy = person(input.editedBy), row = this.directionRow(id), inputs = this.inputs(row.content_id);
    requireValue(inputs.ready, inputs.blockers[0], 409);
    requireValue(Array.isArray(input.lines) && input.lines.length >= 1, 'Change at least one line.');
    return this.store.transaction(() => {
      const current = this.latest(row.content_id);
      requireValue(current && current.id === id && input.expectedRevision === current.revision, 'The direction changed in another tab. Reload before editing.', 409);
      const byN = new Map(current.lines.map(line => [line.n, line]));
      for (const change of input.lines) { object(change, 'Line'); requireValue(byN.has(change.n), `Sentence ${change.n} is not in this script.`); byN.set(change.n, {...byN.get(change.n), ...change}); }
      let direction;
      try { direction = D.validate({summary: current.summary, lines: [...byN.values()]}, inputs.sentences); } catch (error) { throw new InputError(error.message); }
      requireValue(hash(direction.lines) !== hash(current.lines), 'Nothing changed.');
      const note = `Owner edit of ${input.lines.length} line${input.lines.length === 1 ? '' : 's'}${input.note ? `: ${String(input.note).slice(0, 200)}` : ''}`;
      return this.insert({inputs, direction, source: 'owner', note, createdBy: editedBy});
    });
  }
  state() {
    const jobs = this.db.prepare('SELECT * FROM voice_direction_jobs ORDER BY created_at DESC, rowid DESC LIMIT 200').all().map(row => this.publicJob(row));
    const contents = this.store.contents().filter(content => content.state === 'approved').map(content => ({contentId: content.id, latest: this.latest(content.id)}));
    return {emotions: D.EMOTIONS, paces: D.PACES, pauses: D.PAUSES, jobs, contents};
  }
}

module.exports = {VoiceDirector};
