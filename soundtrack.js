'use strict';
// P08c - Room 07 music and sound effects. The owner confirms the ElevenLabs plan covers commercial use, sets the
// monthly limits, then (each on a click): Claude scores the video as music supervisor (or the free rule score),
// ElevenLabs generates every music cue and the family's sound-effect library, each admitted against the limits
// first and never retried by itself. Scores are immutable revisions tied to one approved narration; generated
// files are immutable, checksummed and measured (loudness, peak) so the mix can set their levels. The render
// mixes them under the voice (music.js); the Room 08 listening review stays the approval.
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID, createHash} = require('node:crypto');
const {InputError} = require('./store');
const {AiError, messageTokenUpperBound} = require('./writer');
const {Ai} = require('./ai');
const {connectorCurrent, connectorReference} = require('./intel-sources');
const {analyzeAudio} = require('./voice');
const M = require('./music');
const Sk = require('./sketch');
const E = require('./engines');
const R = require('./render');

const requireValue = (ok, message, status = 400) => { if (!ok) throw new InputError(message, status); };
const now = () => new Date().toISOString();
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const object = (value, label = 'Request') => { requireValue(value && typeof value === 'object' && !Array.isArray(value), `${label} must be a JSON object.`); return value; };
const person = (value, label = 'Your name') => { requireValue(typeof value === 'string' && value.trim().length >= 2 && value.trim().length <= 80, `Enter ${label.toLowerCase()} (2-80 characters).`); return value.trim(); };
const number = (value, min, max, label) => { requireValue(typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max, `${label} must be a number from ${min} to ${max}.`); return value; };
const MAX_AUDIO_BYTES = 60 * 1024 * 1024;
const MUSIC_MODELS = Object.freeze(['music_v1', 'music_v2', 'music_v2_5']);
const SETTINGS_DEFAULTS = Object.freeze({musicModel: 'music_v2_5', monthlyMusicSeconds: 3600, monthlySfx: 300, centsPerMusicMinute: 30, centsPerSfx: 3, rights: null});

// ElevenLabs music and sound effects: fixed origin, header-only key, bounded download.
class ElevenLabsAudioClient {
  constructor(key, fetchImpl = fetch) { this.key = key; this.fetch = fetchImpl; }
  async generate(kind, body, onRequest) {
    const url = kind === 'music' ? 'https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128' : 'https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128';
    let response;
    try { onRequest(); response = await this.fetch(url, {method: 'POST', headers: {'xi-api-key': this.key, 'Content-Type': 'application/json', Accept: 'audio/mpeg'}, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(kind === 'music' ? 900000 : 180000)}); } catch { throw new InputError('The ElevenLabs request failed or timed out after it started. Its billing outcome is unknown.', 502); }
    if (!response.ok) { await response.body?.cancel(); throw new InputError(`ElevenLabs returned HTTP ${response.status}. Its billing outcome may be unknown.`, 502); }
    const reader = response.body?.getReader(), chunks = [];
    if (!reader) throw new InputError('ElevenLabs returned no audio.', 502);
    let bytes = 0;
    while (true) { const {done, value} = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > MAX_AUDIO_BYTES) { await reader.cancel(); throw new InputError('The generated audio exceeded the 60 MB safety limit.', 502); } chunks.push(Buffer.from(value)); }
    if (bytes < 256) throw new InputError('ElevenLabs returned an empty or incomplete file.', 502);
    return {audio: Buffer.concat(chunks, bytes), requestId: response.headers.get('song-id') || response.headers.get('request-id') || response.headers.get('x-request-id') || null};
  }
}

class SoundtrackRoom {
  constructor(store, connectors, sceneRoom, {dataRoot, ai = new Ai(connectors), renders = null, ffmpeg = 'ffmpeg', ffprobe = 'ffprobe', clientFor = null} = {}) {
    Object.assign(this, {store, db: store.db, connectors, scenes: sceneRoom, ai, renders, ffmpeg, ffprobe});
    this.dataRoot = dataRoot || store.artifactRoot || path.join(process.cwd(), 'data');
    this.assetDir = path.join(this.dataRoot, 'audio-assets');
    this.clientFor = clientFor || (connectorId => new ElevenLabsAudioClient(this.connectors.key(connectorId), this.connectors.fetch || fetch));
    this.busy = {score: false, audio: false};
    this.migrate();
    const at = now();
    for (const table of ['score_jobs', 'audio_jobs']) for (const row of this.db.prepare(`SELECT id FROM ${table} WHERE status='running'`).all()) {
      this.db.prepare(`UPDATE ${table} SET status='interrupted', error='The program stopped while this was running. It may have been billed; retry deliberately.', updated_at=? WHERE id=?`).run(at, row.id);
      this.db.prepare("UPDATE intelligence_usage SET status='unknown', updated_at=? WHERE job_id=? AND status='reserved'").run(at, row.id);
      this.db.prepare("UPDATE audio_usage SET status='unknown', updated_at=? WHERE job_id=? AND status='reserved'").run(at, row.id);
    }
  }
  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS soundtrack_settings(family_id TEXT PRIMARY KEY REFERENCES families(id), revision INTEGER NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS scores(id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id), content_id TEXT NOT NULL REFERENCES content(id), voice_approval_id TEXT NOT NULL, revision INTEGER NOT NULL, source TEXT NOT NULL, payload TEXT NOT NULL, payload_hash TEXT NOT NULL, note TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(content_id, revision));
      CREATE TRIGGER IF NOT EXISTS scores_immutable BEFORE UPDATE ON scores BEGIN SELECT RAISE(ABORT, 'Scores are immutable; make a new revision instead.'); END;
      CREATE TRIGGER IF NOT EXISTS scores_keep BEFORE DELETE ON scores BEGIN SELECT RAISE(ABORT, 'Scores are kept for history.'); END;
      CREATE TABLE IF NOT EXISTS score_jobs(id TEXT PRIMARY KEY, family_id TEXT NOT NULL, content_id TEXT NOT NULL, status TEXT NOT NULL, scope TEXT NOT NULL, attempts INTEGER NOT NULL, error TEXT, score_id TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS audio_assets(id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id), kind TEXT NOT NULL, key TEXT NOT NULL, request_hash TEXT NOT NULL, relative_path TEXT NOT NULL, sha256 TEXT NOT NULL, size_bytes INTEGER NOT NULL, probe TEXT NOT NULL, request TEXT NOT NULL, rights TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS audio_assets_request ON audio_assets(family_id, kind, request_hash);
      CREATE TRIGGER IF NOT EXISTS audio_assets_immutable BEFORE UPDATE ON audio_assets BEGIN SELECT RAISE(ABORT, 'Generated audio is immutable.'); END;
      CREATE TABLE IF NOT EXISTS audio_jobs(id TEXT PRIMARY KEY, family_id TEXT NOT NULL, kind TEXT NOT NULL, key TEXT NOT NULL, request_hash TEXT NOT NULL, request TEXT NOT NULL, scope TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL, error TEXT, asset_id TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS audio_usage(job_id TEXT PRIMARY KEY, family_id TEXT NOT NULL, period_month TEXT NOT NULL, kind TEXT NOT NULL, units REAL NOT NULL, cents INTEGER NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    `);
  }
  tools() {
    const pin = this.renders?.pinCheck?.();
    return pin?.ok ? {ffmpeg: pin.paths.ffmpeg, ffprobe: pin.paths.ffprobe} : {ffmpeg: this.ffmpeg, ffprobe: this.ffprobe};
  }

  // ------------------------------------------------------------ settings (per family)
  settings(familyId) {
    const row = this.db.prepare('SELECT * FROM soundtrack_settings WHERE family_id=?').get(familyId);
    return row ? {...SETTINGS_DEFAULTS, ...JSON.parse(row.payload), revision: row.revision} : {...SETTINGS_DEFAULTS, revision: 0};
  }
  saveSettings(familyId, input) {
    object(input);
    const family = this.store.family(familyId), by = person(input.updatedBy);
    requireValue(MUSIC_MODELS.includes(input.musicModel), `Choose a music model: ${MUSIC_MODELS.join(', ')}.`);
    const payload = {musicModel: input.musicModel, monthlyMusicSeconds: number(input.monthlyMusicSeconds, 0, 360000, 'Monthly music seconds'), monthlySfx: number(input.monthlySfx, 0, 100000, 'Monthly sound effects'),
      centsPerMusicMinute: number(input.centsPerMusicMinute, 0, 100000, 'Estimated cents per music minute'), centsPerSfx: number(input.centsPerSfx, 0, 10000, 'Estimated cents per sound effect'),
      rights: input.commercialUseConfirmed === true ? {commercialUseConfirmed: true, confirmedBy: by, confirmedAt: now(), note: String(input.rightsNote || '').slice(0, 300)} : null};
    return this.store.transaction(() => {
      const current = this.settings(family.id);
      requireValue(input.revision === current.revision, 'Soundtrack settings changed in another tab. Reload before saving.', 409);
      this.db.prepare('INSERT INTO soundtrack_settings(family_id,revision,payload,updated_at) VALUES(?,?,?,?) ON CONFLICT(family_id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload,updated_at=excluded.updated_at').run(family.id, current.revision + 1, JSON.stringify(payload), now());
      this.store.event(`Updated soundtrack settings for ${family.name}: ${payload.musicModel}, ${payload.rights ? 'commercial use confirmed' : 'commercial use not confirmed'}`);
      return this.settings(family.id);
    });
  }

  // ------------------------------------------------------------ the score
  scoreInputs(contentId) {
    const content = this.store.content(contentId), family = this.store.family(content.familyId), blockers = [];
    const voice = this.store.voiceHandoffs(family.id).find(item => item.contentId === content.id);
    if (!voice?.ready) blockers.push('Approve the narration in the Voice Room first.');
    const row = this.scenes.latestManifestRow(content.id), manifest = row ? this.scenes.publicManifest(row, {detail: true}) : null;
    if (!manifest || manifest.status !== 'approved' || !manifest.scope.current) blockers.push('Approve the current scene plan in Room 04 first.');
    const inputs = this.scenes.inputs(content);
    return {content, family, voice, manifest, spec: inputs.spec, engine: inputs.engine, durationSeconds: voice?.analysis?.durationSeconds ?? null, ready: !blockers.length, blockers};
  }
  promptInput(inputs) {
    const performed = inputs.voice.auditionId ? this.store.voiceDirectionLines(inputs.voice.auditionId) : null;
    return {family: {niche: inputs.family.niche, audience: inputs.family.audience, format: inputs.family.format},
      style: {name: inputs.spec?.name, musicMoods: inputs.spec?.audio.musicMoods || [], sfxUsage: inputs.spec?.audio.sfxUsage, engine: inputs.engine},
      durationSeconds: Math.round(inputs.durationSeconds * 10) / 10, title: inputs.content.title,
      scenes: inputs.manifest.plan.scenes.map(scene => ({label: scene.label, purpose: scene.purpose, start: scene.startSeconds, end: Math.round((scene.startSeconds + scene.durationSeconds) * 10) / 10, direction: scene.direction, ...(scene.setting ? {setting: scene.setting} : {})})),
      sentences: inputs.manifest.plan.sentences.map(item => ({n: item.n, start: item.startSeconds, text: item.text, ...(performed?.lines[item.n - 1] && performed.sentences[item.n - 1]?.text === item.text ? {delivery: {emotion: performed.lines[item.n - 1].emotion, energy: performed.lines[item.n - 1].energy}} : {})}))};
  }
  rulesScore(contentId, input) {
    object(input);
    const by = person(input.requestedBy), inputs = this.scoreInputs(contentId);
    requireValue(inputs.ready, inputs.blockers[0], 409);
    const score = M.rulesScore({scenes: inputs.manifest.plan.scenes, durationSeconds: inputs.durationSeconds, moods: inputs.spec?.audio.musicMoods || [], niche: inputs.family.niche});
    return this.store.transaction(() => this.insertScore({inputs, score, warnings: [], source: 'rules', note: 'Free score from the story sections', createdBy: by}));
  }
  queueScore(contentId, input) {
    object(input);
    const by = person(input.requestedBy), inputs = this.scoreInputs(contentId);
    requireValue(inputs.ready, inputs.blockers[0], 409);
    const connector = connectorReference(this.connectors, input.connector, 'ai', 'Claude', true);
    return this.store.transaction(() => {
      requireValue(!this.db.prepare("SELECT 1 FROM score_jobs WHERE content_id=? AND status IN ('queued','running')").get(contentId), 'Claude is already scoring this video.', 409);
      const promptInput = this.promptInput(inputs), maxTokens = Math.min(16000, 1500 + inputs.manifest.plan.scenes.length * 120), tokenLimit = messageTokenUpperBound(M.messages(promptInput)) + maxTokens;
      const id = randomUUID(), at = now();
      this.db.prepare("INSERT INTO score_jobs(id,family_id,content_id,status,scope,attempts,created_by,created_at,updated_at) VALUES(?,?,?,'queued',?,0,?,?,?)").run(id, inputs.family.id, contentId, JSON.stringify({contentRevision: inputs.content.revision, voiceApprovalId: inputs.voice.approvalId, connector, promptInput, maxTokens, tokenLimit}), by, at, at);
      this.store.event(`Queued Claude music score for "${inputs.content.title}"`);
      return this.publicScoreJob(this.scoreJobRow(id));
    });
  }
  scoreJobRow(id) { const row = this.db.prepare('SELECT * FROM score_jobs WHERE id=?').get(id); requireValue(row, 'Score job not found.', 404); return row; }
  publicScoreJob(row) { const usage = this.db.prepare('SELECT * FROM intelligence_usage WHERE job_id=?').get(row.id); return {id: row.id, contentId: row.content_id, status: row.status, error: row.error, attempts: row.attempts, scoreId: row.score_id, createdAt: row.created_at, usage: usage ? {status: usage.status, total: usage.total_tokens} : null}; }
  retryScore(id, input) {
    object(input);
    return this.store.transaction(() => {
      const row = this.scoreJobRow(id);
      requireValue(['failed', 'interrupted', 'quality_failed', 'blocked_budget', 'stale'].includes(row.status), `A ${row.status} score cannot be retried.`, 409);
      requireValue(row.attempts < 3, 'This score already used 3 attempts. Ask for a new one.', 409);
      if (row.status === 'interrupted') requireValue(input.confirmInterrupted === true, 'The last attempt was interrupted and Claude may have used tokens. Confirm the deliberate retry.', 409);
      if (this.db.prepare('SELECT 1 FROM intelligence_usage WHERE job_id=?').get(id)) this.db.prepare('UPDATE intelligence_usage SET job_id=? WHERE job_id=?').run(`${id}:attempt${row.attempts}`, id);
      this.db.prepare("UPDATE score_jobs SET status='queued', error=NULL, updated_at=? WHERE id=?").run(now(), id);
      return this.publicScoreJob(this.scoreJobRow(id));
    });
  }
  claimScore() {
    return this.store.transaction(() => {
      const row = this.db.prepare("SELECT * FROM score_jobs WHERE status='queued' ORDER BY created_at, rowid LIMIT 1").get();
      if (!row) return null;
      const scope = JSON.parse(row.scope), family = this.store.family(row.family_id), at = now();
      const stop = (status, error) => { this.db.prepare('UPDATE score_jobs SET status=?, error=?, updated_at=? WHERE id=?').run(status, error, at, row.id); return null; };
      const voice = this.store.voiceHandoffs(family.id).find(item => item.contentId === row.content_id);
      if (this.store.content(row.content_id).revision !== scope.contentRevision || voice?.approvalId !== scope.voiceApprovalId) return stop('stale', 'The script or narration changed before Claude started. Nothing was sent.');
      if (!connectorCurrent(this.connectors, scope.connector, 'ai')) return stop('stale', 'The Claude connection changed or is not tested. Nothing was sent.');
      const summary = this.store.usageSummary(family.id);
      if (summary.settledTokens + summary.reservedTokens + scope.tokenLimit > family.tokenBudget.monthlyLimit) return stop('blocked_budget', 'The family monthly token limit cannot reserve this score. Raise it or wait for next month.');
      this.db.prepare("INSERT INTO intelligence_usage(job_id,family_id,kind,period_month,status,reserved_tokens,created_at,updated_at) VALUES(?,?,'music_score',?,'reserved',?,?,?)").run(row.id, family.id, this.store.tokenPeriod(family), scope.tokenLimit, at, at);
      this.db.prepare("UPDATE score_jobs SET status='running', attempts=attempts+1, updated_at=? WHERE id=?").run(at, row.id);
      return {...row, scope};
    });
  }
  async processNextScore() {
    if (this.busy.score) return null;
    const job = this.claimScore();
    if (!job) return null;
    this.busy.score = true;
    let started = false, usage = null;
    const settle = (status, at) => this.db.prepare('UPDATE intelligence_usage SET status=?, prompt_tokens=?, completion_tokens=?, total_tokens=?, updated_at=? WHERE job_id=?').run(status, usage?.promptTokens ?? null, usage?.completionTokens ?? null, usage?.totalTokens ?? null, at, job.id);
    try {
      const reply = await this.ai.complete({connectorId: job.scope.connector.id, task: 'scenes', messages: M.messages(job.scope.promptInput), maxTokens: job.scope.maxTokens, onStart: () => { started = true; }});
      usage = reply.usage;
      const inputs = this.scoreInputs(job.content_id);
      if (!inputs.ready || inputs.voice.approvalId !== job.scope.voiceApprovalId) throw Object.assign(new AiError('The narration or plan changed while Claude was scoring. The score was not saved.'), {quality: true, stale: true});
      const text = String(reply.content);
      let raw = null;
      try { raw = JSON.parse(text); } catch { try { raw = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); } catch { raw = null; } }
      const warnings = [];
      let score;
      try { score = M.validate(raw, inputs.durationSeconds, {lenient: true, warn: message => warnings.push(message)}); } catch (error) { throw Object.assign(new AiError(`Claude's score was not usable: ${error.message}`), {quality: true}); }
      return this.store.transaction(() => {
        const created = this.insertScore({inputs, score, warnings, source: 'claude', note: `Claude score (${reply.model})`, createdBy: job.created_by}), at = now();
        settle(Number.isSafeInteger(usage?.totalTokens) ? 'settled' : 'unknown', at);
        this.db.prepare("UPDATE score_jobs SET status='completed', score_id=?, updated_at=? WHERE id=?").run(created.id, at, job.id);
        return created;
      });
    } catch (error) {
      this.store.transaction(() => {
        const at = now(), message = error instanceof AiError || error instanceof InputError ? error.message : 'The music score failed.';
        if (error.quality || usage) { settle(Number.isSafeInteger(usage?.totalTokens) ? 'settled' : 'unknown', at); this.db.prepare('UPDATE score_jobs SET status=?, error=?, updated_at=? WHERE id=?').run(error.stale ? 'stale' : 'quality_failed', message, at, job.id); return; }
        this.db.prepare('UPDATE score_jobs SET status=?, error=?, updated_at=? WHERE id=?').run(started ? 'interrupted' : 'failed', message, at, job.id);
        this.db.prepare('UPDATE intelligence_usage SET status=?, reserved_tokens=CASE WHEN ? THEN reserved_tokens ELSE 0 END, updated_at=? WHERE job_id=?').run(started ? 'unknown' : 'released', started ? 1 : 0, at, job.id);
      });
      return null;
    } finally { this.busy.score = false; }
  }
  // Must run inside a transaction.
  insertScore({inputs, score, warnings, source, note, createdBy}) {
    const latest = this.db.prepare('SELECT revision FROM scores WHERE content_id=? ORDER BY revision DESC LIMIT 1').get(inputs.content.id), id = randomUUID(), payload = {...score, durationSeconds: inputs.durationSeconds, warnings: warnings.slice(0, 50)};
    this.db.prepare('INSERT INTO scores(id,family_id,content_id,voice_approval_id,revision,source,payload,payload_hash,note,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, inputs.family.id, inputs.content.id, inputs.voice.approvalId, (latest?.revision || 0) + 1, source, JSON.stringify(payload), hash(payload), note, createdBy, now());
    this.store.event(`Music score r${(latest?.revision || 0) + 1} (${source}) for "${inputs.content.title}": ${score.cues.length} cue(s)`);
    return this.score(id);
  }
  scoreRow(id) { const row = this.db.prepare('SELECT * FROM scores WHERE id=?').get(id); requireValue(row, 'Score not found.', 404); return row; }
  score(id) {
    const row = this.scoreRow(id), payload = JSON.parse(row.payload), settings = this.settings(row.family_id);
    const latest = this.db.prepare('SELECT id FROM scores WHERE content_id=? ORDER BY revision DESC LIMIT 1').get(row.content_id);
    const voice = this.store.voiceHandoffs(row.family_id).find(item => item.contentId === row.content_id);
    const cues = payload.cues.map(cue => { const asset = this.assetFor(row.family_id, 'music', M.musicRequest(cue, {model: settings.musicModel})); return {...cue, asset: asset ? this.publicAsset(asset) : null}; });
    return {id: row.id, contentId: row.content_id, revision: row.revision, source: row.source, note: row.note, createdBy: row.created_by, createdAt: row.created_at, voiceApprovalId: row.voice_approval_id,
      current: latest.id === row.id && voice?.approvalId === row.voice_approval_id, summary: payload.summary, durationSeconds: payload.durationSeconds, warnings: payload.warnings || [], cues, ready: cues.every(cue => cue.asset)};
  }
  latestScore(contentId) { const row = this.db.prepare('SELECT id FROM scores WHERE content_id=? ORDER BY revision DESC LIMIT 1').get(contentId); return row ? this.score(row.id) : null; }
  editScore(id, input) {
    object(input);
    const by = person(input.editedBy), row = this.scoreRow(id), inputs = this.scoreInputs(row.content_id);
    requireValue(inputs.ready, inputs.blockers[0], 409);
    requireValue(Array.isArray(input.cues), 'Send the full list of cues.');
    let score;
    try { score = M.validate({summary: JSON.parse(row.payload).summary, cues: input.cues}, inputs.durationSeconds); } catch (error) { throw new InputError(error.message); }
    return this.store.transaction(() => {
      const latest = this.latestScore(row.content_id);
      requireValue(latest.id === id && input.expectedRevision === latest.revision, 'The score changed in another tab. Reload before editing.', 409);
      requireValue(hash(score.cues.map(({id: cueId, ...cue}) => cue)) !== hash(JSON.parse(row.payload).cues.map(({id: cueId, ...cue}) => cue)), 'Nothing changed.');
      return this.insertScore({inputs, score, warnings: [], source: 'owner', note: `Owner edit${input.note ? `: ${String(input.note).slice(0, 200)}` : ''}`, createdBy: by});
    });
  }

  // ------------------------------------------------------------ generated audio
  assetFor(familyId, kind, request) { return this.db.prepare('SELECT * FROM audio_assets WHERE family_id=? AND kind=? AND request_hash=? ORDER BY created_at DESC LIMIT 1').get(familyId, kind, hash(request)) || null; }
  publicAsset(row) { return {id: row.id, kind: row.kind, key: row.key, probe: JSON.parse(row.probe), sha256: row.sha256, createdAt: row.created_at, url: `/api/audio-assets/${row.id}/audio`}; }
  assetFile(id) {
    const row = this.db.prepare('SELECT * FROM audio_assets WHERE id=?').get(id);
    requireValue(row, 'Audio not found.', 404);
    const file = path.join(this.dataRoot, row.relative_path);
    requireValue(fs.existsSync(file) && R.fileSha256(file) === row.sha256, 'The audio file is missing or changed.', 409);
    return {file, size: fs.statSync(file).size, mime: 'audio/mpeg'};
  }
  generationGate(familyId, input) {
    const settings = this.settings(familyId);
    requireValue(settings.rights?.commercialUseConfirmed, 'Confirm in the soundtrack settings that your ElevenLabs plan covers commercial use of generated music and sound effects.', 409);
    const connector = connectorReference(this.connectors, input.connector, 'elevenlabs', 'ElevenLabs', true);
    return {settings, connector};
  }
  insertAudioJob({familyId, kind, key, request, scope, createdBy}) {
    const id = randomUUID(), at = now();
    this.db.prepare("INSERT INTO audio_jobs(id,family_id,kind,key,request_hash,request,scope,status,attempts,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'queued',0,?,?,?)").run(id, familyId, kind, key, hash(request), JSON.stringify(request), JSON.stringify(scope), createdBy, at, at);
    return id;
  }
  activeAudioJob(familyId, requestHash) { return this.db.prepare("SELECT 1 FROM audio_jobs WHERE family_id=? AND request_hash=? AND status IN ('queued','running')").get(familyId, requestHash); }
  queueMusic(scoreId, input) {
    object(input);
    const by = person(input.requestedBy), row = this.scoreRow(scoreId), {settings, connector} = this.generationGate(row.family_id, input);
    const score = this.score(scoreId);
    requireValue(score.current, 'Generate music for the newest score of the approved narration.', 409);
    const missing = score.cues.filter(cue => !cue.asset);
    requireValue(missing.length, 'Every cue of this score already has its music.', 409);
    const seconds = missing.reduce((sum, cue) => sum + M.musicRequest(cue, {model: settings.musicModel}).music_length_ms / 1000, 0), cents = Math.ceil(seconds / 60 * settings.centsPerMusicMinute);
    requireValue(input.costConfirmed === true, `Confirm the estimated cost: ${Math.round(seconds)} s of music, about ${cents}¢ at your price setting.`, 409);
    return this.store.transaction(() => {
      const ids = [];
      for (const cue of missing) {
        const request = M.musicRequest(cue, {model: settings.musicModel});
        if (this.activeAudioJob(row.family_id, hash(request))) continue;
        ids.push(this.insertAudioJob({familyId: row.family_id, kind: 'music', key: `${row.content_id}:${cue.id}`, request, scope: {connector, scoreId, cueId: cue.id, units: request.music_length_ms / 1000, cents: Math.ceil(request.music_length_ms / 60000 * settings.centsPerMusicMinute)}, createdBy: by}));
      }
      requireValue(ids.length, 'The music for this score is already being generated.', 409);
      this.store.event(`Queued ${ids.length} music cue(s) (about ${cents}¢) for score r${row.revision}`);
      return {queued: ids.length, estimatedCents: cents};
    });
  }
  // The family's sound-effect library, in the flavour of its main engine.
  libraryKinds(familyId) {
    const style = this.scenes.styles?.handoffs().find(item => item.familyId === familyId && item.ready);
    const engine = style ? E.primaryEngine(JSON.parse(this.scenes.styles.revisionRow(style.revisionId).spec)) : 'montage';
    return Object.keys(M.SFX).map(kind => ({kind, engine, request: M.sfxRequest(kind, engine)}));
  }
  library(familyId) { return this.libraryKinds(familyId).map(item => { const asset = this.assetFor(familyId, 'sfx', item.request); return {kind: item.kind, engine: item.engine, prompt: item.request.text, asset: asset ? this.publicAsset(asset) : null, generating: !!this.activeAudioJob(familyId, hash(item.request))}; }); }
  queueLibrary(familyId, input) {
    object(input);
    const by = person(input.requestedBy), {settings, connector} = this.generationGate(familyId, input);
    const kinds = Array.isArray(input.kinds) && input.kinds.length ? input.kinds : Object.keys(M.SFX);
    requireValue(kinds.every(kind => Object.hasOwn(M.SFX, kind)), `Sound effects must be from: ${Object.keys(M.SFX).join(', ')}.`);
    const todo = this.libraryKinds(familyId).filter(item => kinds.includes(item.kind) && !this.assetFor(familyId, 'sfx', item.request) && !this.activeAudioJob(familyId, hash(item.request)));
    requireValue(todo.length, 'Those sound effects are already in the library or being generated.', 409);
    const cents = todo.length * settings.centsPerSfx;
    requireValue(input.costConfirmed === true, `Confirm the estimated cost: ${todo.length} sound effects, about ${cents}¢ at your price setting.`, 409);
    return this.store.transaction(() => {
      for (const item of todo) this.insertAudioJob({familyId, kind: 'sfx', key: item.kind, request: item.request, scope: {connector, units: 1, cents: settings.centsPerSfx}, createdBy: by});
      this.store.event(`Queued ${todo.length} sound effects (about ${cents}¢) for the ${this.store.family(familyId).name} library`);
      return {queued: todo.length, estimatedCents: cents};
    });
  }
  audioJobRow(id) { const row = this.db.prepare('SELECT * FROM audio_jobs WHERE id=?').get(id); requireValue(row, 'Audio job not found.', 404); return row; }
  publicAudioJob(row) { const usage = this.db.prepare('SELECT * FROM audio_usage WHERE job_id=?').get(row.id); return {id: row.id, familyId: row.family_id, kind: row.kind, key: row.key, status: row.status, error: row.error, attempts: row.attempts, assetId: row.asset_id, createdAt: row.created_at, usage: usage ? {status: usage.status, units: usage.units, cents: usage.cents} : null}; }
  retryAudio(id, input) {
    object(input);
    return this.store.transaction(() => {
      const row = this.audioJobRow(id);
      requireValue(['failed', 'interrupted', 'blocked_budget', 'stale'].includes(row.status), `A ${row.status} job cannot be retried.`, 409);
      requireValue(row.attempts < 3, 'This job already used 3 attempts.', 409);
      if (row.status === 'interrupted') requireValue(input.confirmInterrupted === true, 'The last attempt was interrupted and ElevenLabs may have billed it. Confirm the deliberate retry.', 409);
      if (this.db.prepare('SELECT 1 FROM audio_usage WHERE job_id=?').get(id)) this.db.prepare('UPDATE audio_usage SET job_id=? WHERE job_id=?').run(`${id}:attempt${row.attempts}`, id);
      this.db.prepare("UPDATE audio_jobs SET status='queued', error=NULL, updated_at=? WHERE id=?").run(now(), id);
      return this.publicAudioJob(this.audioJobRow(id));
    });
  }
  usage(familyId) {
    const family = this.store.family(familyId), period = this.store.tokenPeriod(family), settings = this.settings(familyId);
    const rows = this.db.prepare("SELECT kind, status, units, cents FROM audio_usage WHERE family_id=? AND period_month=? AND status IN ('reserved','settled','unknown')").all(familyId, period);
    const sum = (kind, key) => rows.filter(row => row.kind === kind).reduce((total, row) => total + row[key], 0);
    return {period, musicSeconds: sum('music', 'units'), sfx: sum('sfx', 'units'), cents: rows.reduce((total, row) => total + row.cents, 0), limits: {musicSeconds: settings.monthlyMusicSeconds, sfx: settings.monthlySfx}};
  }
  claimAudio() {
    return this.store.transaction(() => {
      const row = this.db.prepare("SELECT * FROM audio_jobs WHERE status='queued' ORDER BY created_at, rowid LIMIT 1").get();
      if (!row) return null;
      const scope = JSON.parse(row.scope), at = now(), settings = this.settings(row.family_id);
      const stop = (status, error) => { this.db.prepare('UPDATE audio_jobs SET status=?, error=?, updated_at=? WHERE id=?').run(status, error, at, row.id); return null; };
      if (!connectorCurrent(this.connectors, scope.connector, 'elevenlabs') || !settings.rights?.commercialUseConfirmed) return stop('stale', 'The ElevenLabs connection or the commercial-use confirmation changed. Nothing was sent.');
      const used = this.usage(row.family_id);
      if (row.kind === 'music' && used.musicSeconds + scope.units > settings.monthlyMusicSeconds) return stop('blocked_budget', 'The family monthly music limit cannot admit this cue. Raise it in the soundtrack settings.');
      if (row.kind === 'sfx' && used.sfx + 1 > settings.monthlySfx) return stop('blocked_budget', 'The family monthly sound-effect limit cannot admit this effect. Raise it in the soundtrack settings.');
      this.db.prepare("INSERT INTO audio_usage(job_id,family_id,period_month,kind,units,cents,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'reserved',?,?)").run(row.id, row.family_id, used.period, row.kind, scope.units, scope.cents, at, at);
      this.db.prepare("UPDATE audio_jobs SET status='running', attempts=attempts+1, updated_at=? WHERE id=?").run(at, row.id);
      return {...row, scope, request: JSON.parse(row.request), rights: settings.rights};
    });
  }
  async processNextAudio() {
    if (this.busy.audio) return null;
    const job = this.claimAudio();
    if (!job) return null;
    this.busy.audio = true;
    let started = false, file = null, saved = false;
    try {
      const {audio, requestId} = await this.clientFor(job.scope.connector.id).generate(job.kind, job.request, () => { started = true; });
      const id = randomUUID(), dir = path.join(this.assetDir, job.family_id);
      fs.mkdirSync(dir, {recursive: true});
      file = path.join(dir, `${id}.mp3`);
      fs.writeFileSync(file, audio, {flag: 'wx'});
      const tools = this.tools(), measured = await analyzeAudio(file, {ffmpeg: tools.ffmpeg, ffprobe: tools.ffprobe});
      const expected = job.kind === 'music' ? job.request.music_length_ms / 1000 : job.request.duration_seconds;
      requireValue(measured.durationSeconds >= expected * 0.8 - 0.2, `The generated ${job.kind === 'music' ? 'music' : 'effect'} is ${measured.durationSeconds.toFixed(1)} s; ${expected.toFixed(1)} s were asked for.`, 502);
      requireValue(Number.isFinite(measured.maxVolumeDb) && measured.maxVolumeDb > -45, 'The generated audio is silent.', 502);
      const probe = {durationSeconds: measured.durationSeconds, loudnessLufs: measured.integratedLoudnessLufs, peakDb: measured.maxVolumeDb, sampleRate: measured.sampleRate, channels: measured.channels, codec: measured.codec};
      const rights = {basis: 'elevenlabs-generated', provider: 'elevenlabs', model: job.request.model_id, requestId, commercialUse: job.rights, synthetic: true, note: 'Generated for this channel from the program\'s own prompt; no artist or track named.'};
      const bytes = fs.readFileSync(file);
      this.store.transaction(() => {
        const at = now();
        this.db.prepare('INSERT INTO audio_assets(id,family_id,kind,key,request_hash,relative_path,sha256,size_bytes,probe,request,rights,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(id, job.family_id, job.kind, job.key, job.request_hash, path.relative(this.dataRoot, file).replaceAll('\\', '/'), createHash('sha256').update(bytes).digest('hex'), bytes.length, JSON.stringify(probe), JSON.stringify(job.request), JSON.stringify(rights), job.created_by, at);
        saved = true;
        this.db.prepare("UPDATE audio_usage SET status='settled', updated_at=? WHERE job_id=?").run(at, job.id);
        this.db.prepare("UPDATE audio_jobs SET status='completed', asset_id=?, updated_at=? WHERE id=?").run(id, at, job.id);
      });
      return this.publicAudioJob(this.audioJobRow(job.id));
    } catch (error) {
      if (file && !saved) fs.rmSync(file, {force: true});
      this.store.transaction(() => {
        const at = now();
        this.db.prepare('UPDATE audio_jobs SET status=?, error=?, updated_at=? WHERE id=?').run(started ? 'interrupted' : 'failed', error instanceof InputError ? error.message : `Generation failed: ${String(error.message).slice(0, 200)}`, at, job.id);
        this.db.prepare('UPDATE audio_usage SET status=?, updated_at=? WHERE job_id=?').run(started ? 'unknown' : 'released', at, job.id);
      });
      return null;
    } finally { this.busy.audio = false; }
  }

  // ------------------------------------------------------------ for the render
  // The music and effects an edit's audio settings ask for, with files, times and measured levels. Throws a
  // plain instruction when something is missing; never generates anything by itself.
  soundtrackFor({content, timeline, config, drawings = {}, engine = 'stickman'}) {
    const out = {music: [], sfx: [], events: []};
    if (config.music?.enabled) {
      const score = this.score(config.music.scoreId);
      requireValue(score.contentId === content.id, 'The chosen score belongs to another script.', 409);
      const voice = this.store.voiceHandoffs(content.familyId).find(item => item.contentId === content.id);
      requireValue(voice?.approvalId === score.voiceApprovalId, 'The chosen score was made for an earlier narration. Score the current narration.', 409);
      const missing = score.cues.filter(cue => !cue.asset);
      requireValue(!missing.length, `Generate the music for score r${score.revision} first (${score.cues.length - missing.length} of ${score.cues.length} cues ready).`, 409);
      for (const cue of score.cues) { const row = this.db.prepare('SELECT * FROM audio_assets WHERE id=?').get(cue.asset.id); out.music.push({cueId: cue.id, start: cue.start, end: cue.end, entry: cue.entry, exit: cue.exit, measuredLufs: cue.asset.probe.loudnessLufs, relativePath: row.relative_path, sha256: row.sha256}); }
    }
    if (config.sfx?.enabled && config.sfx.density !== 'none') {
      const words = (timeline.captions?.groups || []).flatMap(group => group.words);
      const clips = timeline.clips.filter(clip => drawings[clip.id]).map(clip => {
        const start = clip.start / timeline.fps, seconds = clip.frames / timeline.fps, sketch = Sk.validate(drawings[clip.id].sketch, {primary: engine, lenient: true});
        return {label: clip.label, start, seconds, sketch, times: Sk.timing(sketch, words.filter(word => word.start >= start - 0.01 && word.start < start + seconds).map(word => ({text: word.text, start: word.start - start})))};
      });
      out.events = M.sfxEvents({clips, density: config.sfx.density, engine});
      const library = new Map(this.library(content.familyId).map(item => [item.kind, item]));
      const missing = [...new Set(out.events.map(event => event.kind))].filter(kind => !library.get(kind)?.asset);
      requireValue(!missing.length, `Generate the sound-effect library first (missing: ${missing.join(', ')}).`, 409);
      for (const event of out.events) { const asset = library.get(event.kind).asset, row = this.db.prepare('SELECT * FROM audio_assets WHERE id=?').get(asset.id); out.sfx.push({...event, measuredPeakDb: asset.probe.peakDb, relativePath: row.relative_path, sha256: row.sha256}); }
    }
    return out;
  }

  state() {
    const families = this.store.families().map(family => ({familyId: family.id, settings: this.settings(family.id), usage: this.usage(family.id), library: this.library(family.id)}));
    const contents = this.store.contents().filter(content => content.state === 'approved').map(content => ({contentId: content.id, score: this.latestScore(content.id), scoreJob: (row => (row ? this.publicScoreJob(row) : null))(this.db.prepare('SELECT * FROM score_jobs WHERE content_id=? ORDER BY created_at DESC, rowid DESC LIMIT 1').get(content.id))}));
    const jobs = this.db.prepare('SELECT * FROM audio_jobs ORDER BY created_at DESC, rowid DESC LIMIT 200').all().map(row => this.publicAudioJob(row));
    return {musicModels: MUSIC_MODELS, sfxKinds: Object.keys(M.SFX), densities: M.DENSITIES, families, contents, jobs};
  }
}

module.exports = {SoundtrackRoom, ElevenLabsAudioClient, SETTINGS_DEFAULTS, MUSIC_MODELS};
