'use strict';
// R05c - Style studies: the program learns a look from a reference (the rules are in study.js). The owner starts a
// study with a path on this PC: a video file, one screenshot or a folder of screenshots. The pinned FFmpeg samples
// frames into contact sheets and, for a video, measures the cut rhythm (local, free); the sheets' main colours are
// measured too. Claude reads the sheets once per click, inside a token reservation from the family budget, never
// retried by itself; the answer is checked strictly (study.validate); the owner approves it by name; only then
// can it become a style draft in the Style Library, which is reviewed and approved there as usual.
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {InputError} = require('./store');
const R = require('./render');
const St = require('./study');
const {connectorReference, connectorCurrent} = require('./intel-sources');

const requireValue = (ok, message, status = 400) => { if (!ok) throw new InputError(message, status); };
const now = () => new Date().toISOString();
const object = value => requireValue(value && typeof value === 'object' && !Array.isArray(value), 'Expected an object.');
const text = (value, label, min, max) => { const v = String(value ?? '').trim(); requireValue(v.length >= min && v.length <= max, `${label} must be ${min}-${max} characters.`); return v; };
const person = (value, label = 'Your name') => text(value, label, 2, 80);
const IMAGE = /\.(jpe?g|png|webp|bmp)$/i, VIDEO = /\.(mp4|mov|mkv|webm|avi|m4v)$/i;
const MAX_IMAGES = 12, FRAMES = 18, PER_SHEET = 9, COLS = 3, TILE = {w: 512, h: 288};
// Reservation per study: the sheets, the prompt and the answer.
const TOKENS_PER_SHEET = 1700, PROMPT_TOKENS = 4000, ANSWER_TOKENS = 6000;
const tokensFor = sheets => sheets * TOKENS_PER_SHEET + PROMPT_TOKENS + ANSWER_TOKENS;
const round = (value, places = 1) => Math.round(value * 10 ** places) / 10 ** places;
const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];

// Frame times for a video: evenly through it, away from the very start and end.
const frameTimes = duration => Array.from({length: FRAMES}, (_, k) => round(duration * (0.03 + 0.94 * k / (FRAMES - 1)), 2));
// FFmpeg arguments for one contact sheet from up to nine inputs (each `-ss t -i file`, or an image), three across.
function sheetArgs(inputs, out) {
  const n = inputs.length, rows = Math.ceil(n / COLS);
  const scale = inputs.map((_, k) => `[${k}:v]scale=${TILE.w}:${TILE.h}:force_original_aspect_ratio=decrease,pad=${TILE.w}:${TILE.h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,format=yuvj420p[v${k}]`);
  const layout = inputs.map((_, k) => `${(k % COLS) * TILE.w}_${Math.floor(k / COLS) * TILE.h}`).join('|');
  const stack = n === 1 ? '[v0]null[out]' : `${inputs.map((_, k) => `[v${k}]`).join('')}xstack=inputs=${n}:layout=${layout}:fill=black[out]`;
  return {args: ['-hide_banner', '-nostdin', '-loglevel', 'error', ...inputs.flatMap(item => (item.t !== undefined ? ['-ss', String(item.t), '-i', item.file] : ['-i', item.file])), '-filter_complex', `${scale.join(';')};${stack}`, '-map', '[out]', '-frames:v', '1', '-q:v', '3', '-y', out], rows};
}
// The main colours of the sheets: every sheet shrunk to 48 pixels across, colours rounded, the most common kept.
function mainColours(rgb, keep = 6) {
  const counts = new Map();
  for (let k = 0; k + 2 < rgb.length; k += 3) { const key = [rgb[k], rgb[k + 1], rgb[k + 2]].map(v => Math.min(255, Math.round(v / 32) * 32)); const hex = '#' + key.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase(); counts.set(hex, (counts.get(hex) || 0) + 1); }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, keep).map(([hex]) => hex);
}
// Shot lengths from the cut times: the median and the middle half.
function rhythm(cuts, duration) {
  const edges = [0, ...cuts.filter(t => t > 0 && t < duration), duration], shots = edges.slice(1).map((t, k) => t - edges[k]).filter(s => s >= 0.2).sort((a, b) => a - b);
  if (!shots.length) return {shots: 0};
  return {shots: shots.length, medianShotSeconds: round(quantile(shots, 0.5)), p25ShotSeconds: round(quantile(shots, 0.25)), p75ShotSeconds: round(quantile(shots, 0.75))};
}

class StyleStudies {
  constructor(store, styles, connectors, ai, renders, {studyDir = null} = {}) {
    Object.assign(this, {store, db: store.db, styles, connectors, ai, renders});
    this.studyDir = studyDir || path.join(store.artifactRoot || require('node:os').tmpdir(), 'studies');
    this.db.exec(`CREATE TABLE IF NOT EXISTS style_studies(id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id), title TEXT NOT NULL, channel TEXT, link TEXT, notes TEXT, source TEXT NOT NULL,
      status TEXT NOT NULL, connector TEXT NOT NULL, measured TEXT, sheets INTEGER, result TEXT, warnings TEXT, review TEXT, applied TEXT, error TEXT, attempts INTEGER NOT NULL DEFAULT 0, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`);
    // A study that was running when the program stopped may already have been charged: it waits for a confirmed retry.
    for (const row of this.db.prepare("SELECT id FROM style_studies WHERE status='running'").all()) {
      this.db.prepare("UPDATE style_studies SET status='interrupted', error='The program stopped while Claude was studying. Claude may have used tokens; retry only if you want to.', updated_at=? WHERE id=?").run(now(), row.id);
      this.db.prepare("UPDATE intelligence_usage SET status='unknown', updated_at=? WHERE job_id=? AND status='reserved'").run(now(), row.id);
    }
  }
  row(id) { const row = this.db.prepare('SELECT * FROM style_studies WHERE id=?').get(id); requireValue(row, 'Style study not found.', 404); return row; }

  // The owner's reference: a video file, one image or a folder of images on this PC. Nothing is read beyond it.
  static sourceOf(input) {
    const raw = String(input ?? '').trim().replace(/^"(.*)"$/, '$1');
    requireValue(raw.length >= 3 && raw.length <= 400, 'Paste the path of a video file, a screenshot or a folder of screenshots on this PC.');
    let stat;
    try { stat = fs.statSync(raw); } catch { requireValue(false, 'That path does not exist on this PC.'); }
    if (stat.isDirectory()) {
      const images = fs.readdirSync(raw).filter(name => IMAGE.test(name)).sort().slice(0, MAX_IMAGES).map(name => path.join(raw, name));
      requireValue(images.length, 'That folder has no screenshots (jpg, png, webp or bmp).');
      return {kind: 'images', path: raw, files: images};
    }
    if (IMAGE.test(raw)) return {kind: 'images', path: raw, files: [raw]};
    requireValue(VIDEO.test(raw), 'Use a video file (mp4, mov, mkv, webm, avi, m4v), a screenshot or a folder of screenshots.');
    requireValue(stat.size > 0, 'That video file is empty.');
    return {kind: 'video', path: raw, files: [raw]};
  }

  create(familyId, input) {
    object(input);
    const family = this.store.family(familyId), by = person(input.createdBy);
    const title = text(input.title, 'Reference title', 2, 160), channel = input.channel ? text(input.channel, 'Channel', 2, 80) : null;
    const link = input.link ? text(input.link, 'Link', 8, 300) : null, notes = input.notes ? text(input.notes, 'Notes', 0, 1500) : null;
    if (link) requireValue(/^https?:\/\//i.test(link), 'The link must start with http:// or https://. It is kept for your record; nothing is downloaded from it.');
    const source = StyleStudies.sourceOf(input.path);
    const connector = this.connectors ? connectorReference(this.connectors, input.connector, 'ai', 'Claude', true) : input.connector;
    const id = randomUUID(), at = now();
    this.db.prepare("INSERT INTO style_studies(id,family_id,title,channel,link,notes,source,status,connector,attempts,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'queued',?,0,?,?,?)")
      .run(id, family.id, title, channel, link, notes, JSON.stringify(source), JSON.stringify(connector), by, at, at);
    this.store.event(`${by} asked Claude to study the look of "${title}" for ${family.name}`);
    return this.publicStudy(this.row(id));
  }

  retry(id, input) {
    object(input);
    return this.store.transaction(() => {
      const row = this.row(id);
      requireValue(['failed', 'interrupted', 'quality_failed', 'blocked_budget', 'stale'].includes(row.status), `A ${row.status} study cannot be retried.`, 409);
      requireValue(row.attempts < 3, 'This study already used 3 attempts. Start a new one.', 409);
      if (row.status === 'interrupted') requireValue(input.confirmInterrupted === true, 'The last attempt was interrupted and Claude may have used tokens. Confirm the deliberate retry.', 409);
      if (this.db.prepare('SELECT 1 FROM intelligence_usage WHERE job_id=?').get(id)) this.db.prepare('UPDATE intelligence_usage SET job_id=? WHERE job_id=?').run(`${id}:attempt${row.attempts}`, id);
      this.db.prepare("UPDATE style_studies SET status='queued', error=NULL, updated_at=? WHERE id=?").run(now(), id);
      return this.publicStudy(this.row(id));
    });
  }

  // One study at a time: reserve, make the sheets, ask Claude, check, settle.
  claim() {
    return this.store.transaction(() => {
      const row = this.db.prepare("SELECT * FROM style_studies WHERE status='queued' ORDER BY created_at, rowid LIMIT 1").get();
      if (!row) return null;
      const at = now(), family = this.store.family(row.family_id), source = JSON.parse(row.source), connector = JSON.parse(row.connector);
      const stop = (status, error) => { this.db.prepare('UPDATE style_studies SET status=?, error=?, updated_at=? WHERE id=?').run(status, error, at, row.id); return null; };
      if (this.connectors && !connectorCurrent(this.connectors, connector, 'ai')) return stop('stale', 'The Claude connection changed or is not tested. Nothing was sent.');
      const sheets = source.kind === 'video' ? Math.ceil(FRAMES / PER_SHEET) : Math.ceil(source.files.length / PER_SHEET), reserve = tokensFor(sheets), summary = this.store.usageSummary(family.id);
      if (summary.settledTokens + summary.reservedTokens + reserve > family.tokenBudget.monthlyLimit) return stop('blocked_budget', `The family monthly token limit cannot reserve this study (${reserve.toLocaleString('en-US')} tokens). Raise it or wait for next month.`);
      this.db.prepare("INSERT INTO intelligence_usage(job_id,family_id,kind,period_month,status,reserved_tokens,created_at,updated_at) VALUES(?,?,'style_study',?,'reserved',?,?,?)").run(row.id, family.id, this.store.tokenPeriod(family), reserve, at, at);
      this.db.prepare("UPDATE style_studies SET status='running', attempts=attempts+1, updated_at=? WHERE id=?").run(at, row.id);
      return {...row, source, connector, reserve};
    });
  }

  // Contact sheets and measurements, made with the pinned FFmpeg (local, free) and kept with the study.
  async prepare(job) {
    const pin = this.renders.pinCheck();
    requireValue(pin.ok, pin.reason || 'Pin an FFmpeg build in the Render Room first.', 409);
    const {ffmpeg, ffprobe} = pin.paths, dir = path.join(this.studyDir, job.id);
    fs.rmSync(dir, {recursive: true, force: true});
    fs.mkdirSync(dir, {recursive: true});
    let inputs, measured = null;
    if (job.source.kind === 'video') {
      const probe = await R.run(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', job.source.path], {timeout: 60000});
      const duration = Number(String(probe.stdout).trim());
      requireValue(duration > 1, 'FFmpeg could not read that video file.', 422);
      const times = frameTimes(duration);
      inputs = times.map(t => ({file: job.source.path, t}));
      const cuts = await R.sceneCuts(ffmpeg, job.source.path, {timeout: Math.max(180000, Math.round(duration * 600))});
      measured = {durationSeconds: round(duration), ...rhythm(cuts, duration)};
    } else inputs = job.source.files.map(file => ({file}));
    const sheets = [];
    for (let k = 0; k * PER_SHEET < inputs.length; k++) {
      const part = inputs.slice(k * PER_SHEET, (k + 1) * PER_SHEET), file = path.join(dir, `sheet-${k + 1}.jpg`), {args} = sheetArgs(part, file);
      await R.run(ffmpeg, args, {timeout: 180000});
      requireValue(fs.existsSync(file), 'FFmpeg did not make the contact sheet. Nothing was sent to Claude.', 502);
      sheets.push({file, times: part.map(item => item.t).filter(t => t !== undefined)});
    }
    // Main colours across the sheets.
    const rgb = [];
    for (const [k, sheet] of sheets.entries()) {
      const raw = path.join(dir, `colours-${k + 1}.rgb`);
      await R.run(ffmpeg, ['-hide_banner', '-nostdin', '-loglevel', 'error', '-i', sheet.file, '-vf', 'scale=48:-1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-y', raw], {timeout: 60000});
      rgb.push(...fs.readFileSync(raw));
    }
    measured = {...(measured || {}), colours: mainColours(rgb)};
    return {sheets, measured};
  }

  async processNext() {
    const job = this.claim();
    if (!job) return null;
    const at = () => now();
    let started = false;
    try {
      const {sheets, measured} = await this.prepare(job);
      this.db.prepare('UPDATE style_studies SET measured=?, sheets=?, updated_at=? WHERE id=?').run(JSON.stringify(measured), sheets.length, at(), job.id);
      const messages = St.messages({title: job.title, channel: job.channel, notes: job.notes, measured, sheets: sheets.map(sheet => ({times: sheet.times, data: fs.readFileSync(sheet.file).toString('base64')}))});
      started = true;
      const reply = await this.ai.complete({connectorId: job.connector.id, task: 'review', messages, maxTokens: ANSWER_TOKENS});
      const usage = {prompt: reply.usage?.promptTokens ?? null, completion: reply.usage?.completionTokens ?? null, total: reply.usage?.totalTokens ?? null};
      this.settle(job.id, usage);
      let raw;
      try { raw = JSON.parse(String(reply.content).slice(String(reply.content).indexOf('{'), String(reply.content).lastIndexOf('}') + 1)); } catch { raw = null; }
      try {
        const {study, warnings} = St.validate(raw, {title: job.title, channel: job.channel, notes: job.notes, measured});
        this.db.prepare("UPDATE style_studies SET status='studied', result=?, warnings=?, error=NULL, updated_at=? WHERE id=?").run(JSON.stringify(study), JSON.stringify(warnings), at(), job.id);
        this.store.event(`Claude studied the look of "${job.title}": ${study.engine}${study.look ? ` (${study.look})` : ''}, ready for review`);
      } catch (error) {
        this.db.prepare("UPDATE style_studies SET status='quality_failed', error=?, warnings=?, updated_at=? WHERE id=?").run(error.message, JSON.stringify(error.warnings || []), at(), job.id);
      }
    } catch (error) {
      const message = error.message || String(error);
      this.db.prepare('UPDATE intelligence_usage SET status=?, reserved_tokens=CASE WHEN ? THEN reserved_tokens ELSE 0 END, updated_at=? WHERE job_id=?').run(started ? 'unknown' : 'released', started ? 1 : 0, at(), job.id);
      this.db.prepare("UPDATE style_studies SET status=?, error=?, updated_at=? WHERE id=?").run(started ? 'interrupted' : 'failed', message, at(), job.id);
    }
    return this.publicStudy(this.row(job.id));
  }
  settle(id, usage) {
    const valid = Number.isSafeInteger(usage.total);
    this.db.prepare('UPDATE intelligence_usage SET status=?, prompt_tokens=?, completion_tokens=?, total_tokens=?, updated_at=? WHERE job_id=?').run(valid ? 'settled' : 'unknown', usage.prompt, usage.completion, usage.total, now(), id);
  }

  // The owner's decision, by name. Approval confirms the study learns techniques only, keeps the 30/70 balance and
  // was read in full; a rejection says why.
  review(id, input) {
    object(input);
    const reviewer = person(input.reviewer), decision = input.decision;
    requireValue(['approved', 'rejected'].includes(decision), 'Choose approve or reject.');
    return this.store.transaction(() => {
      const row = this.row(id);
      requireValue(['studied', 'approved', 'rejected'].includes(row.status), 'Only a finished study can be reviewed.', 409);
      if (decision === 'approved') requireValue(input.techniquesOnly === true && input.balance === true && input.reviewed === true, 'Confirm that it learns techniques only (no channel identity, characters or wording), that the 30/70 balance is acceptable and that you read the whole study.');
      const reason = decision === 'rejected' ? text(input.reason, 'Reason', 8, 500) : null;
      const review = {decision, reviewer, at: now(), ...(reason ? {reason} : {})};
      this.db.prepare('UPDATE style_studies SET status=?, review=?, updated_at=? WHERE id=?').run(decision, JSON.stringify(review), review.at, id);
      this.store.event(`${reviewer} ${decision} the style study of "${row.title}"`);
      return this.publicStudy(this.row(id));
    });
  }

  // An approved study becomes a new style draft: the launch style it maps onto, with its palette, rhythm,
  // transitions, look and planning brief. The draft is reviewed and approved in the Style Library like any other.
  styleDraft(id, input) {
    object(input);
    const createdBy = person(input.createdBy), row = this.row(id);
    requireValue(row.status === 'approved', 'Approve this study before turning it into a style draft.', 409);
    const study = JSON.parse(row.result), family = this.store.family(row.family_id), key = St.baseStyleKey(study);
    const profile = this.styles.profiles().find(item => item.key === key);
    requireValue(profile, 'The style this study maps onto is no longer in the library.', 409);
    const base = [...profile.revisions].reverse().find(item => item.status === 'approved') || profile.revisions.at(-1);
    const taken = new Set(this.styles.profiles().map(item => item.name.toLowerCase())), baseName = `${profile.name} · learned · ${family.name}`.slice(0, 56);
    let name = baseName, suffix = 2;
    while (taken.has(name.toLowerCase())) name = `${baseName} ${suffix++}`.slice(0, 60);
    const {validateStyleSpec} = require('./style');
    const {spec, applied, skipped} = St.draftSpec(study, base.spec, {validateStyleSpec, name});
    const review = JSON.parse(row.review);
    const revision = this.styles.createProfile({spec, createdBy, baseRevisionId: base.id, changeNote: `Draft from approved style study ${id.slice(0, 8)} (reviewed by ${review.reviewer}). Applied: ${applied.join(', ') || 'nothing'}${skipped.length ? `; skipped: ${skipped.map(item => item.change).join(', ')}` : ''}.`});
    const log = row.applied ? JSON.parse(row.applied) : [];
    log.push({kind: 'style_draft', at: now(), by: createdBy, revisionId: revision.id, profileKey: revision.profileKey, applied, skipped});
    this.db.prepare('UPDATE style_studies SET applied=?, updated_at=? WHERE id=?').run(JSON.stringify(log), now(), id);
    return {revision, applied, skipped};
  }

  sheetFile(id, n) {
    const row = this.row(id), index = Number(n);
    requireValue(Number.isSafeInteger(index) && index >= 1 && index <= (row.sheets || 0), 'Sheet not found.', 404);
    const file = path.join(this.studyDir, id, `sheet-${index}.jpg`);
    requireValue(fs.existsSync(file), 'Sheet not found.', 404);
    return file;
  }
  publicStudy(row) {
    const usage = this.db.prepare('SELECT * FROM intelligence_usage WHERE job_id=?').get(row.id), source = JSON.parse(row.source);
    return {id: row.id, familyId: row.family_id, title: row.title, channel: row.channel, link: row.link, notes: row.notes, source: {kind: source.kind, path: source.path, files: source.files.length},
      status: row.status, error: row.error, attempts: row.attempts, measured: row.measured ? JSON.parse(row.measured) : null, sheets: row.sheets || 0,
      study: row.result ? JSON.parse(row.result) : null, warnings: row.warnings ? JSON.parse(row.warnings) : [], review: row.review ? JSON.parse(row.review) : null,
      applied: row.applied ? JSON.parse(row.applied) : [], createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at,
      usage: usage ? {status: usage.status, reserved: usage.reserved_tokens, total: usage.total_tokens} : null};
  }
  state() {
    return {studies: this.db.prepare('SELECT * FROM style_studies ORDER BY created_at DESC, rowid DESC LIMIT 60').all().map(row => this.publicStudy(row)), engines: St.ENGINES, looks: St.LOOKS};
  }
}

module.exports = {StyleStudies, frameTimes, sheetArgs, mainColours, rhythm, tokensFor, MAX_IMAGES, FRAMES};
