'use strict';
// The sound library (0.60). Owner decision 2026-10-23: music and sound effects come from free libraries, not paid
// generation. Neither the Pexels nor the Pixabay API offers audio (their documentation lists photos and videos
// only), and Pixabay forbids systematic mass downloads, so the owner downloads tracks and effects by hand (Pixabay
// Music and Sound Effects, the YouTube Audio Library, their own) into a folder and the program imports the folder:
// every file is checked, measured once (length, loudness, peak), tagged from its name and folders, and kept once by
// its SHA-256 in the data folder with its source and licence. Scores pick tracks from it and the effect slots are
// filled from it (music.js). Local and free: nothing here calls a network.
const fs = require('node:fs');
const path = require('node:path');
const {createHash, randomUUID} = require('node:crypto');
const {InputError} = require('./store');
const {analyzeAudio} = require('./voice');

const requireValue = (ok, message, status = 400) => { if (!ok) throw new InputError(message, status); };
const now = () => new Date().toISOString();
const object = value => { requireValue(value && typeof value === 'object' && !Array.isArray(value), 'Request must be a JSON object.'); return value; };
const person = value => { requireValue(typeof value === 'string' && value.trim().length >= 2 && value.trim().length <= 80, 'Enter your name (2-80 characters).'); return value.trim(); };
const clean = (value, max) => String(value ?? '').replace(/[\x00-\x1F\x7F<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const finite = value => (Number.isFinite(value) ? Math.round(value * 100) / 100 : null);
const AUDIO = /\.(mp3|wav|ogg|m4a|flac|aac|opus)$/i;
const MIME = {'.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac'};
const MAX_FILES = 10000, MAX_BYTES = 60 * 1024 * 1024;
const SOURCES = Object.freeze({
  pixabay: {label: 'Pixabay Music or Sound Effects', licence: 'Pixabay Content License: free for commercial use, no attribution required.'},
  'youtube-audio-library': {label: 'YouTube Audio Library', licence: 'YouTube Audio Library: free for your YouTube videos; tracks marked "attribution required" need their credit line in the description.'},
  own: {label: 'My own or bought', licence: 'Made or licensed by the owner for commercial use.'},
  other: {label: 'Another free library', licence: null},
});
// Words in file and folder names that say nothing about the sound.
const NOISE = new Set('mp3 wav ogg m4a flac aac opus pixabay audio music sound sounds effect effects sfx free royalty the and for with from new final mix version edit original copy track song songs full download downloads users user library youtube studio'.split(' '));

// Tags from the file's name and the folders under the import folder ("Music/Calm/soft-piano-123.mp3": calm, soft, piano).
function tagsFrom(file, root) {
  const rel = path.relative(root, file).replace(AUDIO, '');
  return [...new Set(rel.toLowerCase().split(/[^a-z]+/).filter(word => word.length > 2 && !NOISE.has(word)))].slice(0, 20);
}
const titleFrom = file => path.basename(file).replace(AUDIO, '').replace(/[-_]+/g, ' ').replace(/\s+\d{3,}$/, '').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Untitled';
// Music or an effect: the import's choice, else a folder named so, else the length (25 s and longer is music).
function kindOf(file, root, seconds, rule = 'auto') {
  if (rule === 'music' || rule === 'sfx') return rule;
  const folders = path.relative(root, path.dirname(file)).toLowerCase();
  if (/(^|[\\/])(sfx|sound[ _-]?effects?|effects?|foley)([\\/]|$)/.test(folders)) return 'sfx';
  if (/(^|[\\/])(music|songs?|tracks?|bgm)([\\/]|$)/.test(folders)) return 'music';
  return seconds >= 25 ? 'music' : 'sfx';
}
function listAudio(folder) {
  const files = [], stack = [folder];
  while (stack.length && files.length < MAX_FILES) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, {withFileTypes: true}); } catch { continue; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && AUDIO.test(entry.name) && files.length < MAX_FILES) files.push(full);
    }
  }
  return files.sort();
}
const sha256File = file => new Promise((resolve, reject) => { const h = createHash('sha256'); fs.createReadStream(file).on('data', chunk => h.update(chunk)).on('error', reject).on('end', () => resolve(h.digest('hex'))); });

class SoundLibrary {
  constructor(store, {dataRoot, renders = null, ffmpeg = 'ffmpeg', ffprobe = 'ffprobe', analyze = analyzeAudio} = {}) {
    Object.assign(this, {store, db: store.db, renders, ffmpeg, ffprobe, analyze, busy: false});
    this.dataRoot = dataRoot || store.artifactRoot || path.join(process.cwd(), 'data');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sounds(id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, tags TEXT NOT NULL, seconds REAL NOT NULL, loudness_lufs REAL, peak_db REAL, relative_path TEXT NOT NULL, size_bytes INTEGER NOT NULL, source TEXT NOT NULL, licence TEXT NOT NULL, attribution TEXT, enabled INTEGER NOT NULL, import_id TEXT, original_name TEXT NOT NULL, added_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS sounds_kind ON sounds(kind, enabled);
      CREATE TABLE IF NOT EXISTS sound_imports(id TEXT PRIMARY KEY, folder TEXT NOT NULL, status TEXT NOT NULL, scope TEXT NOT NULL, progress TEXT NOT NULL, error TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    `);
    this.db.prepare("UPDATE sound_imports SET status='interrupted', error='The program stopped during this import. Continue it to import the rest; the files already imported are kept.', updated_at=? WHERE status='running'").run(now());
  }
  tools() { const pin = this.renders?.pinCheck?.(); return pin?.ok ? {ffmpeg: pin.paths.ffmpeg, ffprobe: pin.paths.ffprobe} : {ffmpeg: this.ffmpeg, ffprobe: this.ffprobe}; }

  // ------------------------------------------------------------ import a folder the owner downloaded
  queueImport(input) {
    object(input);
    const by = person(input.requestedBy), folder = String(input.folder || '').trim().replace(/^"(.*)"$/, '$1');
    requireValue(folder && path.isAbsolute(folder), 'Enter the full path of the folder, for example C:\\Users\\you\\Music\\Pixabay.');
    requireValue(fs.existsSync(folder) && fs.statSync(folder).isDirectory(), 'That folder was not found on this PC.');
    const inside = path.relative(path.resolve(this.dataRoot), path.resolve(folder));
    requireValue(inside.startsWith('..') || path.isAbsolute(inside), 'Choose a folder outside the program\'s data folder.');
    requireValue(Object.hasOwn(SOURCES, input.source), `Choose where the sounds come from: ${Object.values(SOURCES).map(item => item.label).join(', ')}.`);
    const licence = input.source === 'other' ? clean(input.licence, 300) : SOURCES[input.source].licence;
    requireValue(licence && licence.length >= 10, 'Write the licence of these sounds (at least 10 characters), for example "CC0, no attribution".');
    requireValue(input.licenceConfirmed === true, 'Confirm that you downloaded these sounds yourself and that their licence allows them in monetized YouTube videos.');
    const kind = ['auto', 'music', 'sfx'].includes(input.kind) ? input.kind : 'auto', total = listAudio(folder).length;
    requireValue(total, 'No audio files (MP3, WAV, OGG, M4A, FLAC, AAC or Opus) were found in that folder.');
    return this.store.transaction(() => {
      requireValue(!this.db.prepare("SELECT 1 FROM sound_imports WHERE status IN ('queued','running')").get(), 'An import is already running. Wait for it to finish.', 409);
      const id = randomUUID(), at = now();
      this.db.prepare("INSERT INTO sound_imports(id,folder,status,scope,progress,error,created_by,created_at,updated_at) VALUES(?,?,'queued',?,?,NULL,?,?,?)")
        .run(id, folder, JSON.stringify({source: input.source, licence, kind, attribution: clean(input.attribution, 300) || null}), JSON.stringify({total, done: 0, added: 0, already: 0, failed: 0, problems: []}), by, at, at);
      this.store.event(`Queued a sound import of ${total} file(s) (${SOURCES[input.source].label}), by ${by}`);
      return this.publicImport(this.importRow(id));
    });
  }
  // An interrupted import continues where it stopped: files already in the library are recognised by their checksum.
  continueImport(id) {
    return this.store.transaction(() => {
      const row = this.importRow(id);
      requireValue(['interrupted', 'failed'].includes(row.status), `A ${row.status} import cannot be continued.`, 409);
      requireValue(!this.db.prepare("SELECT 1 FROM sound_imports WHERE status IN ('queued','running')").get(), 'Another import is running. Wait for it to finish.', 409);
      this.db.prepare("UPDATE sound_imports SET status='queued', error=NULL, updated_at=? WHERE id=?").run(now(), id);
      return this.publicImport(this.importRow(id));
    });
  }
  importRow(id) { const row = this.db.prepare('SELECT * FROM sound_imports WHERE id=?').get(id); requireValue(row, 'Import not found.', 404); return row; }
  publicImport(row) { const scope = JSON.parse(row.scope); return {id: row.id, folder: row.folder, status: row.status, source: scope.source, sourceLabel: SOURCES[scope.source]?.label, kind: scope.kind, progress: JSON.parse(row.progress), error: row.error, createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at}; }
  async processNextImport() {
    if (this.busy) return null;
    const row = this.store.transaction(() => { const next = this.db.prepare("SELECT * FROM sound_imports WHERE status='queued' ORDER BY created_at, rowid LIMIT 1").get(); if (next) this.db.prepare("UPDATE sound_imports SET status='running', updated_at=? WHERE id=?").run(now(), next.id); return next; });
    if (!row) return null;
    this.busy = true;
    const scope = JSON.parse(row.scope), tools = this.tools(), files = listAudio(row.folder), progress = {total: files.length, done: 0, added: 0, already: 0, failed: 0, problems: []};
    const save = () => this.db.prepare('UPDATE sound_imports SET progress=?, updated_at=? WHERE id=?').run(JSON.stringify(progress), now(), row.id);
    try {
      for (const file of files) {
        try {
          const stat = fs.statSync(file);
          requireValue(stat.size <= MAX_BYTES, 'larger than 60 MB');
          requireValue(stat.size >= 512, 'too small to be audio');
          const sha = await sha256File(file);
          if (this.db.prepare('SELECT 1 FROM sounds WHERE id=?').get(sha)) progress.already++;
          else {
            const measured = await this.analyze(file, {ffmpeg: tools.ffmpeg, ffprobe: tools.ffprobe});
            requireValue(measured.durationSeconds >= 0.1, 'no playable audio');
            requireValue(Number.isFinite(measured.maxVolumeDb) && measured.maxVolumeDb > -60, 'silent');
            const ext = path.extname(file).toLowerCase(), relative = `sound-library/${sha.slice(0, 2)}/${sha}${ext}`, target = path.join(this.dataRoot, relative);
            fs.mkdirSync(path.dirname(target), {recursive: true});
            if (!fs.existsSync(target)) fs.copyFileSync(file, target);
            if (await sha256File(target) !== sha) { fs.rmSync(target, {force: true}); throw new InputError('the copy did not match the file'); }
            const at = now();
            this.db.prepare('INSERT INTO sounds(id,kind,title,tags,seconds,loudness_lufs,peak_db,relative_path,size_bytes,source,licence,attribution,enabled,import_id,original_name,added_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?)')
              .run(sha, kindOf(file, row.folder, measured.durationSeconds, scope.kind), titleFrom(file), JSON.stringify(tagsFrom(file, row.folder)), Math.round(measured.durationSeconds * 1000) / 1000, finite(measured.integratedLoudnessLufs), finite(measured.maxVolumeDb), relative, stat.size, scope.source, scope.licence, scope.attribution, row.id, path.basename(file).slice(0, 200), row.created_by, at, at);
            progress.added++;
          }
        } catch (error) { progress.failed++; if (progress.problems.length < 20) progress.problems.push(`${path.basename(file)}: ${clean(error.message, 140)}`); }
        progress.done++;
        save();
      }
      save();
      this.db.prepare("UPDATE sound_imports SET status='completed', updated_at=? WHERE id=?").run(now(), row.id);
      this.store.event(`Sound import finished: ${progress.added} added, ${progress.already} already in the library, ${progress.failed} not usable`);
      return this.publicImport(this.importRow(row.id));
    } catch (error) {
      save();
      this.db.prepare("UPDATE sound_imports SET status='failed', error=?, updated_at=? WHERE id=?").run(clean(error.message, 300) || 'The import failed.', now(), row.id);
      return this.publicImport(this.importRow(row.id));
    } finally { this.busy = false; }
  }

  // ------------------------------------------------------------ the library
  row(id) { const row = this.db.prepare('SELECT * FROM sounds WHERE id=?').get(id); requireValue(row, 'That sound is not in the library.', 404); return row; }
  publicSound(row) { return {id: row.id, kind: row.kind, title: row.title, tags: JSON.parse(row.tags), seconds: row.seconds, loudnessLufs: row.loudness_lufs, peakDb: row.peak_db, source: row.source, sourceLabel: SOURCES[row.source]?.label || row.source, licence: row.licence, attribution: row.attribution, enabled: !!row.enabled, originalName: row.original_name, createdAt: row.created_at, url: `/api/sounds/${row.id}/audio`}; }
  // The enabled sounds of one kind, as the score and the effect picker use them.
  tracks(kind) { return this.db.prepare('SELECT * FROM sounds WHERE kind=? AND enabled=1 ORDER BY id').all(kind).map(row => this.publicSound(row)); }
  list({kind = '', q = '', limit = 200, offset = 0} = {}) {
    const where = [], params = [];
    if (['music', 'sfx'].includes(kind)) { where.push('kind=?'); params.push(kind); }
    for (const word of clean(q, 80).toLowerCase().split(' ').filter(Boolean).slice(0, 5)) { where.push('(lower(title) LIKE ? OR tags LIKE ?)'); params.push(`%${word}%`, `%${word}%`); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '', size = Math.max(1, Math.min(500, Number(limit) || 200)), skip = Math.max(0, Number(offset) || 0);
    return {total: this.db.prepare(`SELECT COUNT(*) AS n FROM sounds ${clause}`).get(...params).n, sounds: this.db.prepare(`SELECT * FROM sounds ${clause} ORDER BY kind, title, id LIMIT ? OFFSET ?`).all(...params, size, skip).map(row => this.publicSound(row))};
  }
  // The owner corrects a sound: its kind, tags, credit line, or leaves it out of every pick.
  update(id, input) {
    object(input);
    const by = person(input.updatedBy), row = this.row(id), change = {};
    if (input.kind !== undefined) { requireValue(['music', 'sfx'].includes(input.kind), 'A sound is music or an effect (sfx).'); change.kind = input.kind; }
    if (input.tags !== undefined) { requireValue(Array.isArray(input.tags) && input.tags.length <= 20, 'Tags are a list of up to 20 words.'); change.tags = JSON.stringify([...new Set(input.tags.map(tag => clean(tag, 30).toLowerCase()).filter(Boolean))]); }
    if (input.attribution !== undefined) change.attribution = clean(input.attribution, 300) || null;
    if (input.enabled !== undefined) change.enabled = input.enabled ? 1 : 0;
    if (input.title !== undefined) { requireValue(clean(input.title, 120).length >= 2, 'A title needs at least 2 characters.'); change.title = clean(input.title, 120); }
    requireValue(Object.keys(change).length, 'Nothing to change.');
    this.db.prepare(`UPDATE sounds SET ${Object.keys(change).map(key => `${key}=?`).join(', ')}, updated_at=? WHERE id=?`).run(...Object.values(change), now(), id);
    this.store.event(`Sound "${row.title}" changed by ${by}: ${Object.keys(change).join(', ')}`);
    return this.publicSound(this.row(id));
  }
  // The file for listening and for the render, checked against its checksum.
  file(id) {
    const row = this.row(id), file = path.join(this.dataRoot, row.relative_path);
    requireValue(fs.existsSync(file) && fs.statSync(file).size === row.size_bytes, 'The sound file is missing or changed.', 409);
    return {file, size: row.size_bytes, mime: MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', relativePath: row.relative_path, sha256: row.id};
  }
  state() {
    const count = kind => this.db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(seconds),0) AS seconds FROM sounds WHERE kind=? AND enabled=1').get(kind);
    const music = count('music'), sfx = count('sfx');
    return {music: music.n, musicSeconds: Math.round(music.seconds), sfx: sfx.n, off: this.db.prepare('SELECT COUNT(*) AS n FROM sounds WHERE enabled=0').get().n,
      sources: Object.entries(SOURCES).map(([id, item]) => ({id, label: item.label, licence: item.licence})),
      imports: this.db.prepare('SELECT * FROM sound_imports ORDER BY created_at DESC, rowid DESC LIMIT 5').all().map(row => this.publicImport(row))};
  }
}

module.exports = {SoundLibrary, SOURCES, tagsFrom, titleFrom, kindOf, listAudio};
