'use strict';
// 0.110 - The channel brain (owner request 2026-11-18; prompts and checks in creative.js). Per channel the owner keeps a
// niche brief (what the niche is about, the promise, how the channel differs, ideas, example titles, what to avoid),
// files (PDF, Word, text: read to text on this PC) and reference pictures (a recurring character, a place, a look) with
// how each is used. A short description of each picture, written once by the connected AI on the owner's click, lets
// every text job follow it; the picture itself is attached to every painting of that character. The creative director
// answers any question about the channel (Claude, ChatGPT, or both: the second challenges the first), writes the
// playbook of how the channel stands out (approved by name, it becomes pin-only skills that lead every job of the
// channel), and keeps in memory what the owner asks it to. Gemini matches the style of a video link to an engine.
// Every AI request starts from a click, inside the channel's token reservation (Gemini: its hourly data cap).
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID, createHash} = require('node:crypto');
const {InputError} = require('./store');
const C = require('./creative');
const live = require('./live');
const Documents = require('./documents');
const {GeminiClient, isYouTube, videoId, watchUrl, DEFAULT_MODEL} = require('./gemini');
const {connectorReference} = require('./intel-sources');
const {messageTokenUpperBound} = require('./writer');
const {AiError} = require('./ai');

const requireValue = (ok, message, status = 400) => { if (!ok) throw new InputError(message, status); };
const now = () => new Date().toISOString();
const object = (value, label = 'Request') => requireValue(value && typeof value === 'object' && !Array.isArray(value), `${label} must be a JSON object.`);
const text = (value, label, min, max) => { const v = String(value ?? '').trim(); requireValue(v.length >= min && v.length <= max && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v), `${label} must be ${min}-${max} characters.`); return v; };
const person = (value, label = 'Your name') => text(value, label, 2, 80);
const IMAGES = {
  'image/png': {ext: 'png', magic: bytes => bytes[0] === 0x89 && bytes.toString('latin1', 1, 4) === 'PNG'},
  'image/jpeg': {ext: 'jpg', magic: bytes => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff},
  'image/webp': {ext: 'webp', magic: bytes => bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP'},
};
const MAX_IMAGE = 10 * 1024 * 1024, MAX_FILE_TEXT = 400000, FAMILY_FILES = 30, VIDEO_FILES = 10, IMAGES_MAX = 24;
const DESCRIBE_TOKENS = 4000, ASK_TOKENS = 16000, PLAYBOOK_TOKENS = 32000;
const DESCRIBE = 'You describe a reference picture a YouTube channel owner attached, for the artists and video models that must draw, paint or generate exactly this subject in other scenes. Write 80-220 words in plain English: what it is; for a person: apparent age, build, face shape, eyes, eyebrows, nose, stubble or beard, skin tone, hair (colour, length, cut, parting), every garment with its colour, material and fit, accessories and how they are worn, footwear; for a place or object: shape, materials, colours, details that make it recognisable; then the art style or medium, line work, palette and lighting. If it is a character sheet, say which views and expressions it shows. Never guess who a real person is. Return JSON only: {"description": "..."}.';

function imageInput(value) {
  const match = typeof value === 'string' && value.length <= 15_000_000 && value.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
  requireValue(match, 'Attach a PNG, JPEG or WebP picture.');
  const bytes = Buffer.from(match[2], 'base64'), type = IMAGES[match[1]];
  requireValue(bytes.length >= 32, 'The picture is empty.');
  requireValue(bytes.length <= MAX_IMAGE, 'The picture must be smaller than 10 MB.');
  requireValue(type.magic(bytes), 'The file is not the picture type its name says.');
  return {bytes, mime: match[1], ext: type.ext};
}

class ChannelBrain {
  constructor(store, {connectors, quota = null, ai, skills = null, intel = null, imageDir = null, fetch: fetchImpl = fetch, catalogue = null} = {}) {
    Object.assign(this, {store, db: store.db, connectors, quota, ai, skills, intel, fetch: fetchImpl, catalogue});
    this.imageDir = imageDir || path.join(store.artifactRoot || require('node:os').tmpdir(), 'brain-images');
    this.migrate();
  }
  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS niche_briefs(family_id TEXT PRIMARY KEY, payload TEXT NOT NULL, revision INTEGER NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS brain_files(id TEXT PRIMARY KEY, family_id TEXT NOT NULL, content_id TEXT, name TEXT NOT NULL, kind TEXT NOT NULL, words INTEGER NOT NULL, text TEXT NOT NULL, sha256 TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, removed_at TEXT);
      CREATE TABLE IF NOT EXISTS brain_images(id TEXT PRIMARY KEY, family_id TEXT NOT NULL, sha256 TEXT NOT NULL, mime TEXT NOT NULL, bytes INTEGER NOT NULL, label TEXT NOT NULL, role TEXT NOT NULL, usage TEXT NOT NULL, description TEXT, described_by TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, removed_at TEXT);
      CREATE TABLE IF NOT EXISTS creative_asks(id TEXT PRIMARY KEY, family_id TEXT NOT NULL, kind TEXT NOT NULL, question TEXT NOT NULL, provider TEXT, status TEXT NOT NULL, answer TEXT, usage TEXT, error TEXT, kept INTEGER NOT NULL DEFAULT 0, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS creative_playbooks(id TEXT PRIMARY KEY, family_id TEXT NOT NULL, revision INTEGER NOT NULL, provider TEXT, status TEXT NOT NULL, payload TEXT NOT NULL, usage TEXT, review TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS style_matches(id TEXT PRIMARY KEY, family_id TEXT NOT NULL, url TEXT NOT NULL, status TEXT NOT NULL, result TEXT, error TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL);
    `);
  }
  family(id) { const family = this.store.family(text(id, 'Channel', 10, 64)); requireValue(!family.archived, 'Restore this channel first.', 409); return family; }

  // ------------------------------------------------------------ the niche brief
  brief(familyId) { const row = this.db.prepare('SELECT * FROM niche_briefs WHERE family_id=?').get(familyId); return row ? {...JSON.parse(row.payload), revision: row.revision, updatedBy: row.updated_by, updatedAt: row.updated_at} : null; }
  saveBrief(familyId, input) {
    object(input);
    const by = person(input.updatedBy), family = this.family(familyId), brief = C.validateBrief(input), old = this.brief(family.id);
    this.db.prepare('INSERT INTO niche_briefs(family_id,payload,revision,updated_by,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(family_id) DO UPDATE SET payload=excluded.payload, revision=excluded.revision, updated_by=excluded.updated_by, updated_at=excluded.updated_at')
      .run(family.id, JSON.stringify(brief), (old?.revision || 0) + 1, by, now());
    this.store.event(`${by} ${old ? 'updated' : 'wrote'} the niche brief of ${family.name}`);
    return this.brief(family.id);
  }

  // ------------------------------------------------------------ files (the channel's, or one video's idea files)
  async addFile(input) {
    object(input);
    const by = person(input.addedBy), family = this.family(input.familyId), contentId = input.contentId ? text(input.contentId, 'Video', 10, 64) : null;
    if (contentId) requireValue(this.store.content(contentId).familyId === family.id, 'That video belongs to another channel.', 409);
    const name = text(input.name, 'File name', 1, 200);
    requireValue(typeof input.data === 'string' && /^[A-Za-z0-9+/=]+$/.test(input.data), 'Attach a PDF, Word (.docx) or text file.');
    const data = Buffer.from(input.data, 'base64'), read = await Documents.extractText({name, data});
    const count = this.db.prepare(`SELECT COUNT(*) AS n FROM brain_files WHERE family_id=? AND ${contentId ? 'content_id=?' : 'content_id IS NULL'} AND removed_at IS NULL`).get(...[family.id, ...(contentId ? [contentId] : [])]).n;
    requireValue(count < (contentId ? VIDEO_FILES : FAMILY_FILES), contentId ? `A video keeps at most ${VIDEO_FILES} idea files. Remove one first.` : `A channel keeps at most ${FAMILY_FILES} files. Remove one first.`, 409);
    const id = randomUUID(), body = read.text.slice(0, MAX_FILE_TEXT);
    this.db.prepare('INSERT INTO brain_files(id,family_id,content_id,name,kind,words,text,sha256,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(id, family.id, contentId, name, read.kind, read.words, body, createHash('sha256').update(data).digest('hex'), by, now());
    this.store.event(`${by} attached "${name}" (${read.words} words) to ${contentId ? `the idea of "${this.store.content(contentId).title}"` : `the niche of ${family.name}`}`);
    return this.publicFile(this.db.prepare('SELECT * FROM brain_files WHERE id=?').get(id));
  }
  removeFile(id, input = {}) {
    const by = person(input.removedBy || input.requestedBy || 'Owner'), row = this.db.prepare('SELECT * FROM brain_files WHERE id=? AND removed_at IS NULL').get(id);
    requireValue(row, 'That file was not found.', 404);
    this.db.prepare('UPDATE brain_files SET removed_at=? WHERE id=?').run(now(), id);
    this.store.event(`${by} removed the file "${row.name}"`);
    return {removed: id};
  }
  files(familyId, contentId = null) { return this.db.prepare(`SELECT * FROM brain_files WHERE family_id=? AND ${contentId ? 'content_id=?' : 'content_id IS NULL'} AND removed_at IS NULL ORDER BY created_at, rowid`).all(...[familyId, ...(contentId ? [contentId] : [])]); }
  publicFile(row) { return {id: row.id, familyId: row.family_id, contentId: row.content_id, name: row.name, kind: row.kind, words: row.words, opening: row.text.slice(0, 220), createdBy: row.created_by, createdAt: row.created_at}; }

  // ------------------------------------------------------------ reference pictures
  async addImage(input) {
    object(input);
    const by = person(input.addedBy), family = this.family(input.familyId), image = imageInput(input.image);
    const label = text(input.label, 'Name of the picture', 2, 60), role = input.role || 'character';
    requireValue(Object.hasOwn(C.ROLES, role), `Choose what the picture is: ${Object.keys(C.ROLES).join(', ')}.`);
    const usage = text(input.usage, 'How to use it', 4, 1000);
    requireValue(this.db.prepare('SELECT COUNT(*) AS n FROM brain_images WHERE family_id=? AND removed_at IS NULL').get(family.id).n < IMAGES_MAX, `A channel keeps at most ${IMAGES_MAX} reference pictures. Remove one first.`, 409);
    const sha256 = createHash('sha256').update(image.bytes).digest('hex'), file = path.join(this.imageDir, `${sha256}.${image.ext}`);
    fs.mkdirSync(this.imageDir, {recursive: true});
    if (!fs.existsSync(file)) fs.writeFileSync(file, image.bytes);
    const id = randomUUID(), at = now();
    this.db.prepare('INSERT INTO brain_images(id,family_id,sha256,mime,bytes,label,role,usage,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id, family.id, sha256, image.mime, image.bytes.length, label, role, usage, by, at, at);
    this.store.event(`${by} added the reference picture "${label}" (${role}) to ${family.name}`);
    // Described now when the owner asked for it with the upload (the click is the permission).
    if (input.describe === 'claude' || input.describe === 'chatgpt') {
      try { await this.describeImage(id, {ai: input.describe, requestedBy: by}); }
      catch (error) { return {...this.publicImage(this.imageRow(id)), describeError: error.message}; }
    }
    return this.publicImage(this.imageRow(id));
  }
  imageRow(id) { const row = this.db.prepare('SELECT * FROM brain_images WHERE id=? AND removed_at IS NULL').get(id); requireValue(row, 'That reference picture was not found.', 404); return row; }
  imageFile(id) {
    const row = this.imageRow(id), file = path.join(this.imageDir, `${row.sha256}.${IMAGES[row.mime].ext}`);
    requireValue(fs.existsSync(file), 'The picture file is missing from the data folder.', 404);
    return {file, mime: row.mime, row};
  }
  updateImage(id, input) {
    object(input);
    const by = person(input.updatedBy), row = this.imageRow(id);
    const label = input.label === undefined ? row.label : text(input.label, 'Name of the picture', 2, 60), usage = input.usage === undefined ? row.usage : text(input.usage, 'How to use it', 4, 1000);
    const role = input.role === undefined ? row.role : input.role;
    requireValue(Object.hasOwn(C.ROLES, role), `Choose what the picture is: ${Object.keys(C.ROLES).join(', ')}.`);
    const description = input.description === undefined ? row.description : text(input.description, 'Description', 0, 3000) || null;
    this.db.prepare('UPDATE brain_images SET label=?, role=?, usage=?, description=?, described_by=CASE WHEN ? THEN ? ELSE described_by END, updated_at=? WHERE id=?').run(label, role, usage, description, input.description !== undefined ? 1 : 0, by, now(), id);
    return this.publicImage(this.imageRow(id));
  }
  removeImage(id, input = {}) {
    const by = person(input.removedBy || input.requestedBy || 'Owner'), row = this.imageRow(id);
    this.db.prepare('UPDATE brain_images SET removed_at=? WHERE id=?').run(now(), id);
    this.store.event(`${by} removed the reference picture "${row.label}"`);
    return {removed: id};
  }
  images(familyId) { return this.db.prepare('SELECT * FROM brain_images WHERE family_id=? AND removed_at IS NULL ORDER BY created_at, rowid').all(familyId); }
  publicImage(row) { return {id: row.id, familyId: row.family_id, label: row.label, role: row.role, usage: row.usage, description: row.description, describedBy: row.described_by, sha256: row.sha256, bytes: row.bytes, createdBy: row.created_by, createdAt: row.created_at}; }
  async describeImage(id, input = {}) {
    const by = person(input.requestedBy || 'Owner'), row = this.imageRow(id), family = this.family(row.family_id), {file, mime} = this.imageFile(id);
    const messages = [{role: 'system', content: DESCRIBE}, {role: 'user', content: [{type: 'text', text: `UNTRUSTED OWNER NOTE: the picture is "${row.label}" (${row.role}); the owner uses it this way: ${row.usage}`}, {type: 'image', source: {type: 'base64', media_type: mime, data: fs.readFileSync(file).toString('base64')}}]}];
    const reply = await this.call(family, {ai: input.ai, kind: 'brain_describe', task: 'illustrate', messages, maxTokens: DESCRIBE_TOKENS, extra: 1600});
    let description = '';
    try { description = String(JSON.parse(reply.content).description || '').trim(); } catch { description = ''; }
    if (!description) throw new AiError('The AI did not describe the picture. Try again, or write the description yourself.');
    this.db.prepare('UPDATE brain_images SET description=?, described_by=?, updated_at=? WHERE id=?').run(description.slice(0, 3000), `${reply.who} for ${by}`, now(), id);
    return this.publicImage(this.imageRow(id));
  }

  // ------------------------------------------------------------ what every job receives
  playbookRow(familyId, status = 'approved') { return this.db.prepare('SELECT * FROM creative_playbooks WHERE family_id=? AND status=? ORDER BY revision DESC LIMIT 1').get(familyId, status); }
  memory(familyId) { return this.db.prepare("SELECT answer FROM creative_asks WHERE family_id=? AND kept=1 AND status='answered' ORDER BY created_at").all(familyId).map(row => { const a = JSON.parse(row.answer); return a.keep || a.summary; }).filter(Boolean); }
  context(familyId, {contentId = null, bytes = 16000} = {}) {
    let idea = null;
    if (contentId) {
      let content = null;
      try { content = this.store.content(contentId); } catch { content = null; }
      // The thoughts themselves travel on the draft (content.idea); the brain adds the idea files.
      const files = content ? this.files(familyId, contentId).map(row => ({name: row.name, text: row.text})) : [];
      if (files.length) idea = {files};
    }
    const playbook = this.playbookRow(familyId);
    return C.context({brief: (({revision, updatedBy, updatedAt, ...rest}) => rest)(this.brief(familyId) || {}), files: this.files(familyId).map(row => ({name: row.name, text: row.text})),
      images: this.images(familyId).map(row => this.publicImage(row)), playbook: playbook ? JSON.parse(playbook.payload) : null, memory: this.memory(familyId), idea, competitors: this.learned(familyId)}, {bytes});
  }
  // The reference pictures a cast member points at (sketch cast "ref"), as files to attach to a painting.
  referenceFiles(ids) {
    return [...new Set(ids)].map(id => { try { const {file, row} = this.imageFile(id); return {id, file, label: row.label, description: row.description}; } catch { return null; } }).filter(Boolean);
  }
  // What the program learned from the competitors, for the creative director (approved roadmap, studies, blueprint).
  learned(familyId) {
    const out = {};
    try {
      const roadmap = this.db.prepare("SELECT result FROM competitor_roadmaps WHERE family_id=? AND status='approved' ORDER BY revision DESC LIMIT 1").get(familyId);
      if (roadmap) { const r = JSON.parse(roadmap.result); out.roadmap = {summary: r.summary, processes: (r.processes || []).map(item => ({process: item.process, goal: item.goal, do: (item.do || []).slice(0, 6), beat: (item.beat || []).slice(0, 4)}))}; }
      const studies = this.db.prepare("SELECT channel, title, result FROM competitor_video_watches WHERE family_id=? AND status='watched' AND removed_at IS NULL ORDER BY updated_at DESC LIMIT 8").all(familyId);
      if (studies.length) out.studies = studies.map(row => { const r = JSON.parse(row.result || '{}'); return {channel: row.channel, title: row.title, summary: String(r.summary || '').slice(0, 700), beat: (r.beat || []).slice(0, 4).map(item => `${item.weakness} -> ${item.howWeBeatIt}`)}; });
    } catch { /* the watcher's tables are not in every workspace */ }
    try { const guidance = this.intel?.scriptGuidance?.(familyId); if (guidance) out.blueprint = guidance; } catch { /* no approved blueprint */ }
    return Object.keys(out).length ? out : null;
  }
  directorData(family, bytes) {
    const videos = this.store.contents().filter(item => item.familyId === family.id).slice(0, 30).map(item => ({title: item.title, state: item.state}));
    return {FAMILY: {name: family.name, niche: family.niche, audience: family.audience, format: family.format, locale: family.primaryLocale}, CHANNEL: this.context(family.id, {bytes}), LEARNED: this.learned(family.id), VIDEOS: videos};
  }

  // ------------------------------------------------------------ one AI request inside the channel's reservation
  team(pick) {
    const team = this.ai.team?.(), who = pick === 'chatgpt' ? team?.chatgpt : pick === 'claude' ? team?.claude : team?.claude || team?.chatgpt;
    requireValue(who, `${pick === 'chatgpt' ? 'ChatGPT' : pick === 'claude' ? 'Claude' : 'Claude or ChatGPT'} is not connected. Connect it and test it in Connections first.`, 409);
    return who;
  }
  async call(family, {ai, kind, task, messages, maxTokens, extra = 0, label = null, skillTask = null, skillBrief = null, jobId = null}) {
    const who = this.team(ai), name = who.provider === 'chatgpt' ? 'ChatGPT' : 'Claude', key = `${kind}:${randomUUID()}`;
    const reserve = messageTokenUpperBound(messages) + extra + maxTokens;
    this.store.transaction(() => {
      const summary = this.store.usageSummary(family.id);
      requireValue(summary.settledTokens + summary.reservedTokens + reserve <= family.tokenBudget.monthlyLimit, this.store.budgetMessage ? this.store.budgetMessage(family.id, reserve, 'This request') : 'The channel\'s monthly token limit cannot reserve this request.', 409);
      this.db.prepare("INSERT INTO intelligence_usage(job_id,family_id,kind,period_month,status,reserved_tokens,created_at,updated_at) VALUES(?,?,?,?,'reserved',?,?,?)").run(key, family.id, kind, this.store.tokenPeriod(family), reserve, now(), now());
    });
    const settle = (usage, status) => this.db.prepare('UPDATE intelligence_usage SET status=?, prompt_tokens=?, completion_tokens=?, total_tokens=?, updated_at=? WHERE job_id=?').run(status, usage?.promptTokens ?? null, usage?.completionTokens ?? null, usage?.totalTokens ?? null, now(), key);
    if (label) live.start(key, {room: 'channel', label, familyId: family.id, who: name});
    let reply;
    try { reply = await this.ai.complete({connectorId: who.id, task, messages, maxTokens, ...(label ? {onProgress: live.follow(key)} : {})}); }
    catch (error) { settle(null, error.nothingUsed ? 'released' : 'unknown'); throw error; }
    finally { if (label) live.end(key); }
    settle(reply.usage, Number.isSafeInteger(reply.usage?.totalTokens) ? 'settled' : 'unknown');
    if (skillBrief && skillTask) { this.store.skillRuntime?.recordUsage({jobId: jobId || key, familyId: family.id, room: 'channel', taskKey: skillTask, brief: skillBrief}); this.store.skillRuntime?.recordApplied?.(jobId || key, skillTask, require('./direct').cited(reply.content, skillBrief.prompt)); }
    return {...reply, who: name, provider: who.provider, key};
  }

  // ------------------------------------------------------------ the creative director
  async ask(familyId, input) {
    object(input);
    const by = person(input.requestedBy), family = this.family(familyId), question = text(input.question, 'Your question', 4, 4000), mode = input.ai || 'claude';
    requireValue(['claude', 'chatgpt', 'both'].includes(mode), 'Choose Claude, ChatGPT or both.');
    const team = this.ai.team?.() || {};
    const order = mode === 'both' ? ['claude', 'chatgpt'].filter(key => team[key]) : [mode];
    requireValue(order.length, 'Connect Claude or ChatGPT and test it in Connections first.', 409);
    const data = this.directorData(family, 24000), brief = this.store.skillRuntime?.brief('niche.discover', family.id, {text: `${question} ${family.niche} ${data.CHANNEL?.brief?.about || ''}`}) || null;
    const rows = [];
    let partner = null;
    for (const key of order) {
      const id = randomUUID(), at = now();
      this.db.prepare("INSERT INTO creative_asks(id,family_id,kind,question,provider,status,created_by,created_at,updated_at) VALUES(?,?,'ask',?,?,'running',?,?,?)").run(id, family.id, question, key, by, at, at);
      try {
        const reply = await this.call(family, {ai: key, kind: 'creative_ask', task: 'niche', messages: C.askMessages({question, data, partner, skills: brief?.prompt || null}), maxTokens: ASK_TOKENS, label: `${key === 'chatgpt' ? 'ChatGPT' : 'Claude'} thinks about your question${partner ? ' (and challenges the first answer)' : ''}`, skillTask: 'niche.discover', skillBrief: brief, jobId: id});
        const answer = C.readAnswer(reply.content);
        this.db.prepare("UPDATE creative_asks SET status='answered', answer=?, usage=?, updated_at=? WHERE id=?").run(JSON.stringify(answer), JSON.stringify(reply.usage || null), now(), id);
        partner = answer;
      } catch (error) {
        this.db.prepare("UPDATE creative_asks SET status='failed', error=?, updated_at=? WHERE id=?").run(String(error.message).slice(0, 1200), now(), id);
        if (!rows.length && order.length === 1) throw error;
      }
      rows.push(this.publicAsk(this.db.prepare('SELECT * FROM creative_asks WHERE id=?').get(id)));
    }
    this.store.event(`${by} asked the creative director of ${family.name}: "${question.slice(0, 80)}"`);
    return {asks: rows};
  }
  keep(id, input = {}) {
    const by = person(input.keptBy || input.requestedBy || 'Owner'), row = this.db.prepare("SELECT * FROM creative_asks WHERE id=? AND status='answered'").get(id);
    requireValue(row, 'That answer was not found.', 404);
    this.db.prepare('UPDATE creative_asks SET kept=?, updated_at=? WHERE id=?').run(input.kept === false ? 0 : 1, now(), id);
    this.store.event(`${by} ${input.kept === false ? 'took an answer out of' : 'kept an answer in'} the channel's memory`);
    return this.publicAsk(this.db.prepare('SELECT * FROM creative_asks WHERE id=?').get(id));
  }
  publicAsk(row) { return {id: row.id, familyId: row.family_id, question: row.question, provider: row.provider, status: row.status, answer: row.answer ? JSON.parse(row.answer) : null, error: row.error, kept: !!row.kept, usage: row.usage ? JSON.parse(row.usage) : null, createdBy: row.created_by, createdAt: row.created_at}; }

  async playbook(familyId, input) {
    object(input);
    const by = person(input.requestedBy), family = this.family(familyId);
    const data = this.directorData(family, 30000), brief = this.store.skillRuntime?.brief('niche.discover', family.id, {text: `${family.niche} ${data.CHANNEL?.brief?.about || ''} ${data.CHANNEL?.brief?.difference || ''} stand out differentiate signature`}) || null;
    requireValue(data.CHANNEL || data.LEARNED, 'Write the niche brief first (or watch competitor videos), so the playbook has something to stand on.', 409);
    const id = randomUUID();
    const reply = await this.call(family, {ai: input.ai, kind: 'creative_playbook', task: 'niche', messages: C.playbookMessages({data, skills: brief?.prompt || null}), maxTokens: PLAYBOOK_TOKENS, label: `The creative director writes how ${family.name} stands out`, skillTask: 'niche.discover', skillBrief: brief, jobId: id});
    const payload = C.readPlaybook(reply.content), revision = (this.db.prepare('SELECT MAX(revision) AS r FROM creative_playbooks WHERE family_id=?').get(family.id).r || 0) + 1, at = now();
    this.db.prepare("INSERT INTO creative_playbooks(id,family_id,revision,provider,status,payload,usage,created_by,created_at,updated_at) VALUES(?,?,?,?,'ready',?,?,?,?,?)").run(id, family.id, revision, reply.provider, JSON.stringify(payload), JSON.stringify(reply.usage || null), by, at, at);
    this.store.event(`The creative director wrote playbook r${revision} for ${family.name}; it waits for ${by}'s review`);
    return this.publicPlaybook(this.db.prepare('SELECT * FROM creative_playbooks WHERE id=?').get(id));
  }
  // Approved by name, the playbook becomes one pin-only skill per process, pinned to this channel's jobs of that process.
  reviewPlaybook(id, input) {
    object(input);
    const by = person(input.reviewer, 'Reviewer name'), row = this.db.prepare('SELECT * FROM creative_playbooks WHERE id=?').get(id);
    requireValue(row, 'That playbook was not found.', 404);
    requireValue(row.status === 'ready', `A ${row.status} playbook cannot be reviewed.`, 409);
    const family = this.store.family(row.family_id);
    if (input.decision === 'reject') {
      this.db.prepare("UPDATE creative_playbooks SET status='rejected', review=?, updated_at=? WHERE id=?").run(JSON.stringify({decision: 'rejected', reviewer: by, reason: text(input.reason, 'Reason', 8, 600), at: now()}), now(), id);
      return this.publicPlaybook(this.db.prepare('SELECT * FROM creative_playbooks WHERE id=?').get(id));
    }
    requireValue(input.decision === 'approve', 'Choose approve or reject.');
    const confirmations = input.confirmations || {};
    for (const [key, label] of [['read', 'you read the whole playbook'], ['own', 'it keeps the channel original (techniques only from competitors)'], ['leads', 'these rules should lead this channel\'s jobs']]) requireValue(confirmations[key] === true, `Confirm that ${label}.`);
    requireValue(this.skills, 'The skills engine is not available.', 500);
    const payload = JSON.parse(row.payload), date = now().slice(0, 10);
    const skills = C.playbookSkills(payload, {familyId: family.id, familyName: family.name, revision: row.revision, approvedBy: by, date});
    this.skills.importPack({createdBy: by, changeNote: `Channel playbook r${row.revision} approved for ${family.name}`, origin: 'owner', skills, pack: `Channel playbook: ${family.name}`.slice(0, 120), approve: {approvedBy: by, confirmations: {wordingReviewed: true, numbersReviewed: true, scopeReviewed: true}}});
    const ids = new Set(skills.map(skill => skill.id)), prefix = skills[0]?.id.replace(/-[a-z]+$/, '-') || null;
    for (const skill of skills) for (const taskKey of skill.tasks) this.skills.bind({createdBy: by, note: `Channel playbook r${row.revision}: leads ${family.name}'s jobs`, mode: 'pin', taskKey, skillId: skill.id, familyId: family.id});
    for (const item of prefix ? this.skills.bindings(family.id).filter(entry => entry.familyId === family.id && entry.skillId.startsWith(prefix) && !ids.has(entry.skillId)) : []) this.skills.unbind(item.id, {removedBy: by});
    this.store.transaction(() => {
      this.db.prepare("UPDATE creative_playbooks SET status='superseded', updated_at=? WHERE family_id=? AND status='approved'").run(now(), family.id);
      this.db.prepare("UPDATE creative_playbooks SET status='approved', review=?, updated_at=? WHERE id=?").run(JSON.stringify({decision: 'approved', reviewer: by, at: now(), skills: [...ids]}), now(), id);
    });
    this.store.event(`${by} approved the playbook r${row.revision} of ${family.name}: ${ids.size} skill(s) now lead its jobs`);
    return this.publicPlaybook(this.db.prepare('SELECT * FROM creative_playbooks WHERE id=?').get(id));
  }
  publicPlaybook(row) { return {id: row.id, familyId: row.family_id, revision: row.revision, provider: row.provider, status: row.status, payload: JSON.parse(row.payload), review: row.review ? JSON.parse(row.review) : null, usage: row.usage ? JSON.parse(row.usage) : null, createdBy: row.created_by, createdAt: row.created_at}; }

  // ------------------------------------------------------------ matching the style of a video link (Gemini)
  async matchStyle(familyId, input) {
    object(input);
    const by = person(input.requestedBy), family = this.family(familyId), url = text(input.url, 'Video link', 10, 500);
    requireValue(isYouTube(url) && videoId(url), 'Paste a YouTube video link (Gemini watches YouTube links only; nothing is downloaded).');
    requireValue(this.catalogue, 'The engine list is not available in this workspace.', 500);
    const connector = connectorReference(this.connectors, input.connector, 'gemini', 'Gemini', true), engines = C.catalogue(this.catalogue), id = randomUUID();
    if (this.quota) { const reservation = this.quota.reserve(id, {gemini: 1}); requireValue(reservation.ok, `The Gemini allowance (${reservation.cap} videos an hour) is used up. Wait for the next hour or raise it under Data caps.`, 429); }
    this.db.prepare("INSERT INTO style_matches(id,family_id,url,status,created_by,created_at) VALUES(?,?,?,'running',?,?)").run(id, family.id, url, by, now());
    live.start(id, {room: 'channel', label: 'Gemini watches the video to match its style', familyId: family.id, who: 'Gemini'});
    let started = false;
    try {
      const client = new GeminiClient(this.connectors.key(connector.id), this.fetch);
      started = true;
      const answer = await client.ask({video: {uri: watchUrl(videoId(url))}, prompt: C.styleMatchPrompt(engines), model: DEFAULT_MODEL});
      const result = C.readStyleMatch(answer.text, engines);
      this.quota?.settle(id, {gemini: 1});
      this.db.prepare("UPDATE style_matches SET status='done', result=? WHERE id=?").run(JSON.stringify(result), id);
      this.store.event(`Gemini matched ${url} to the ${result.engineName} engine for ${family.name}`);
    } catch (error) {
      if (started) this.quota?.settle(id, {gemini: 1}); else this.quota?.release(id);
      this.db.prepare("UPDATE style_matches SET status='failed', error=? WHERE id=?").run(String(error.message).slice(0, 1200), id);
    } finally { live.end(id); }
    return this.publicMatch(this.db.prepare('SELECT * FROM style_matches WHERE id=?').get(id));
  }
  publicMatch(row) { return {id: row.id, familyId: row.family_id, url: row.url, status: row.status, result: row.result ? JSON.parse(row.result) : null, error: row.error, createdBy: row.created_by, createdAt: row.created_at}; }

  // ------------------------------------------------------------ what the page shows
  state() {
    const families = this.store.families().filter(family => !family.archived).map(family => ({
      familyId: family.id, brief: this.brief(family.id), files: this.files(family.id).map(row => this.publicFile(row)), images: this.images(family.id).map(row => this.publicImage(row)),
      asks: this.db.prepare('SELECT * FROM creative_asks WHERE family_id=? ORDER BY created_at DESC, rowid DESC LIMIT 30').all(family.id).map(row => this.publicAsk(row)),
      playbooks: this.db.prepare('SELECT * FROM creative_playbooks WHERE family_id=? ORDER BY revision DESC LIMIT 6').all(family.id).map(row => this.publicPlaybook(row)),
      matches: this.db.prepare('SELECT * FROM style_matches WHERE family_id=? ORDER BY created_at DESC, rowid DESC LIMIT 6').all(family.id).map(row => this.publicMatch(row)),
      learned: (() => { const l = this.learned(family.id); return {roadmap: !!l?.roadmap, studies: l?.studies?.length || 0, blueprint: !!l?.blueprint}; })(),
    }));
    const videoFiles = this.db.prepare('SELECT * FROM brain_files WHERE content_id IS NOT NULL AND removed_at IS NULL ORDER BY created_at').all().map(row => this.publicFile(row));
    return {families, videoFiles, roles: C.ROLES};
  }
}

module.exports = {ChannelBrain, imageInput};
