'use strict';
// A02 - Backups and restore (Phase 06, 2026-10-22). Protects the owner's work before real production starts.
// A backup is one consistent snapshot of the database (SQLite VACUUM INTO) and every file of the data folder. Files
// are stored once by their SHA-256 (backups/files/aa/<sha>), so a second backup only copies what changed; each backup
// keeps a manifest of what it holds (path, size, SHA-256). A restore never happens under a running program: it is
// requested, and done at the next start before the database opens. The current database and every file it replaces
// are first set aside (backups/before-restore/<time>); files newer than the backup stay where they are.
const fs = require('node:fs');
const path = require('node:path');
const {createHash, randomBytes} = require('node:crypto');
const {DatabaseSync} = require('node:sqlite');
const {InputError} = require('./store');

const DEFAULTS = Object.freeze({auto: true, everyHours: 24, keep: 14, folder: null});
// Logs, launcher notes and the restore files describe this run, not the owner's work.
const SKIP = new Set(['backups', 'server.log', 'server-error.log', 'launcher-process.json', 'restore-request.json', 'restore-result.json', 'backup-settings.json']);
const MARGIN = 1024 ** 3; // a backup leaves at least 1 GB free on its drive
const requireValue = (ok, message, status = 400) => { if (!ok) throw new InputError(message, status); };
const readJson = file => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
const writeJson = (file, value) => { const temp = `${file}.${randomBytes(4).toString('hex')}.tmp`; fs.writeFileSync(temp, JSON.stringify(value, null, 1)); fs.renameSync(temp, file); };
const stamp = date => date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const freeBytes = dir => { try { const info = fs.statfsSync(dir); return info.bavail * info.bsize; } catch { return null; } };
// Streamed, so a long render never blocks the program while it is hashed.
const hashFile = file => new Promise((resolve, reject) => { const hash = createHash('sha256'); fs.createReadStream(file).on('data', chunk => hash.update(chunk)).on('error', reject).on('end', () => resolve(hash.digest('hex'))); });
const hashSync = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const integrity = file => { const db = new DatabaseSync(file, {readOnly: true}); try { return db.prepare('PRAGMA integrity_check').get().integrity_check; } finally { db.close(); } };
// Copy through a temporary name, so a stop never leaves half a file under the real name.
const copyAtomic = (from, to) => { fs.mkdirSync(path.dirname(to), {recursive: true}); const temp = `${to}.${randomBytes(4).toString('hex')}.tmp`; fs.copyFileSync(from, temp); fs.renameSync(temp, to); };

function walk(root, rel, skip, out = []) {
  for (const entry of fs.readdirSync(path.join(root, rel), {withFileTypes: true})) {
    const child = rel ? `${rel}/${entry.name}` : entry.name;
    // Names starting with a dot are files still being written (.incoming-*); SQLite's own files are snapshotted.
    if ((!rel && skip.has(entry.name)) || entry.name.startsWith('.') || entry.name.endsWith('.tmp')) continue;
    if (entry.isDirectory()) walk(root, child, skip, out);
    else if (entry.isFile()) out.push(child);
  }
  return out;
}

class Backups {
  // busy(): true while work that writes many files runs (a render); automatic backups wait for it.
  constructor(store, {dataRoot, dataFile, busy = () => false, free = freeBytes, clock = () => new Date()} = {}) {
    this.store = store;
    this.dataRoot = dataRoot;
    this.dataFile = dataFile;
    this.busy = busy;
    this.free = free;
    this.clock = clock;
    this.running = null;
    this.listed = null; // the backup list as the page shows it, read again after every change
    const base = path.basename(dataFile);
    this.skip = new Set([...SKIP, base, `${base}-wal`, `${base}-shm`, `${base}-journal`]);
  }
  settings() { return {...DEFAULTS, ...(readJson(path.join(this.dataRoot, 'backup-settings.json')) || {})}; }
  saveSettings(input) {
    requireValue(input && typeof input === 'object' && !Array.isArray(input), 'Send the backup settings.');
    requireValue(typeof input.auto === 'boolean', 'Choose whether backups run by themselves.');
    requireValue(Number.isSafeInteger(input.everyHours) && input.everyHours >= 1 && input.everyHours <= 168, 'Back up every 1-168 hours.');
    requireValue(Number.isSafeInteger(input.keep) && input.keep >= 1 && input.keep <= 90, 'Keep 1-90 automatic backups.');
    let folder = null;
    if (input.folder) {
      requireValue(typeof input.folder === 'string' && input.folder.length <= 260 && path.isAbsolute(input.folder), 'The backup folder must be a full path, for example E:\\ControlRoomBackups.');
      folder = path.resolve(input.folder);
      requireValue(!folder.toLowerCase().startsWith(path.resolve(this.dataRoot).toLowerCase() + path.sep) && folder.toLowerCase() !== path.resolve(this.dataRoot).toLowerCase(), 'Choose a folder outside the program\'s data folder (or leave it empty for the default).');
      requireValue(fs.existsSync(folder) && fs.statSync(folder).isDirectory(), 'That folder does not exist. Create it first (an external drive is best).');
      try { const probe = path.join(folder, `.control-room-${randomBytes(4).toString('hex')}`); fs.writeFileSync(probe, 'ok'); fs.rmSync(probe); } catch { throw new InputError('The program cannot write to that folder.'); }
    }
    const settings = {auto: input.auto, everyHours: input.everyHours, keep: input.keep, folder};
    writeJson(path.join(this.dataRoot, 'backup-settings.json'), settings);
    this.listed = null;
    this.store.event(`Backup settings: ${settings.auto ? `every ${settings.everyHours} h, keep ${settings.keep}` : 'automatic backups off'}${folder ? `, in ${folder}` : ''}`);
    return settings;
  }
  folder() { return this.settings().folder || path.join(this.dataRoot, 'backups'); }
  blob(folder, sha) { return path.join(folder, 'files', sha.slice(0, 2), sha); }
  sets(folder = this.folder()) {
    let names = [];
    try { names = fs.readdirSync(path.join(folder, 'sets')).filter(name => /^[0-9TZ]+-[0-9a-f]{4}\.json$/.test(name)); } catch { /* none yet */ }
    return names.map(name => readJson(path.join(folder, 'sets', name))).filter(Boolean).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  // One backup. Files whose size and time match the last backup keep their known SHA-256 (like rsync's quick check);
  // the rest are hashed. Refused when its drive would keep less than 1 GB free.
  async create({by, reason = 'manual'} = {}) {
    requireValue(typeof by === 'string' && by.trim().length >= 2 && by.trim().length <= 80, 'Your name must contain 2-80 characters.');
    requireValue(!this.running, 'A backup is already running.', 409);
    const folder = this.folder(), at = this.clock(), id = `${stamp(at)}-${randomBytes(2).toString('hex')}`;
    this.running = {id, done: 0, total: 0, startedAt: at.toISOString()};
    try {
      fs.mkdirSync(path.join(folder, 'sets'), {recursive: true});
      const indexFile = path.join(folder, 'index.json'), index = readJson(indexFile) || {}, files = walk(this.dataRoot, '', this.skip), entries = [];
      this.running.total = files.length;
      for (const rel of files) {
        const file = path.join(this.dataRoot, rel), info = fs.statSync(file), known = index[rel];
        const sha = known && known.size === info.size && known.mtimeMs === info.mtimeMs ? known.sha : await hashFile(file);
        entries.push({path: rel, size: info.size, sha, mtimeMs: info.mtimeMs});
        this.running.done++;
      }
      const fresh = [...new Map(entries.filter(entry => !fs.existsSync(this.blob(folder, entry.sha))).map(entry => [entry.sha, entry])).values()];
      const newBytes = fresh.reduce((sum, entry) => sum + entry.size, 0), dbBytes = fs.statSync(this.dataFile).size, free = this.free(folder);
      requireValue(free === null || free >= newBytes + dbBytes + MARGIN, `Not enough free space for this backup: it needs about ${Math.ceil((newBytes + dbBytes) / 1024 ** 2)} MB and keeps 1 GB free, but the drive has ${Math.floor(free / 1024 ** 2)} MB. Free some space or choose another backup folder.`, 507);
      // The database as one consistent snapshot, taken by SQLite itself while the program keeps running.
      const dbFile = path.join(folder, 'sets', `${id}.sqlite`);
      this.store.db.exec(`VACUUM INTO '${dbFile.replace(/'/g, "''")}'`);
      for (const entry of fresh) copyAtomic(path.join(this.dataRoot, entry.path), this.blob(folder, entry.sha));
      const manifest = {id, createdAt: at.toISOString(), createdBy: by.trim(), reason, database: {file: `${id}.sqlite`, size: fs.statSync(dbFile).size, sha: await hashFile(dbFile)},
        files: entries.map(({path: rel, size, sha}) => ({path: rel, size, sha})), totalBytes: entries.reduce((sum, entry) => sum + entry.size, 0), newBytes};
      writeJson(path.join(folder, 'sets', `${id}.json`), manifest);
      writeJson(indexFile, Object.fromEntries(entries.map(entry => [entry.path, {size: entry.size, mtimeMs: entry.mtimeMs, sha: entry.sha}])));
      this.prune(folder);
      this.listed = null;
      this.store.event(`Backup ${id}: ${entries.length} files, ${Math.ceil(newBytes / 1024 ** 2)} MB new (${reason === 'auto' ? 'automatic' : `by ${by.trim()}`})`);
      return this.publicSet(manifest);
    } finally { this.running = null; }
  }
  // Automatic backups beyond the number to keep are removed (backups made by hand stay), then every stored file no
  // remaining backup needs.
  prune(folder = this.folder()) {
    const keep = this.settings().keep, all = this.sets(folder);
    for (const set of all.filter(item => item.reason === 'auto').slice(keep)) for (const ext of ['json', 'sqlite', 'verified.json']) fs.rmSync(path.join(folder, 'sets', `${set.id}.${ext}`), {force: true});
    const needed = new Set(this.sets(folder).flatMap(set => set.files.map(file => file.sha)));
    let root;
    try { root = fs.readdirSync(path.join(folder, 'files')); } catch { return; }
    for (const dir of root) for (const name of fs.readdirSync(path.join(folder, 'files', dir))) if (!needed.has(name)) fs.rmSync(path.join(folder, 'files', dir, name), {force: true});
  }
  // Every stored file is read again and compared with its SHA-256, and the database snapshot is checked by SQLite.
  async verify(id) {
    const folder = this.folder(), set = this.set(folder, id), problems = [];
    const dbFile = path.join(folder, 'sets', set.database.file);
    if (!fs.existsSync(dbFile) || await hashFile(dbFile) !== set.database.sha) problems.push('The database snapshot is missing or changed.');
    else { const result = integrity(dbFile); if (result !== 'ok') problems.push(`The database snapshot failed SQLite's integrity check (${String(result).slice(0, 120)}).`); }
    for (const sha of new Set(set.files.map(file => file.sha))) {
      const blob = this.blob(folder, sha), name = set.files.find(file => file.sha === sha).path;
      if (!fs.existsSync(blob)) problems.push(`${name} is missing from the backup.`);
      else if (await hashFile(blob) !== sha) problems.push(`${name} changed inside the backup.`);
      if (problems.length >= 20) break;
    }
    const result = {ok: !problems.length, checkedAt: this.clock().toISOString(), files: set.files.length, problems};
    writeJson(path.join(folder, 'sets', `${id}.verified.json`), result);
    this.listed = null;
    return result;
  }
  set(folder, id) {
    requireValue(typeof id === 'string' && /^[0-9TZ]+-[0-9a-f]{4}$/.test(id), 'Choose a backup from the list.');
    const set = readJson(path.join(folder, 'sets', `${id}.json`));
    requireValue(set, 'That backup was not found.', 404);
    return set;
  }
  // The restore is checked now and done at the next start (restore-request.json), before the database opens.
  async requestRestore(id, {by, confirmed} = {}) {
    requireValue(typeof by === 'string' && by.trim().length >= 2, 'Your name must contain 2-80 characters.');
    requireValue(confirmed === true, 'Confirm that the program goes back to this backup and that later work is set aside.');
    const folder = this.folder(), set = this.set(folder, id), check = await this.verify(id);
    requireValue(check.ok, `This backup did not pass its check, so it cannot be restored: ${check.problems[0]}`, 409);
    writeJson(path.join(this.dataRoot, 'restore-request.json'), {backupId: set.id, folder, requestedBy: by.trim(), requestedAt: this.clock().toISOString()});
    this.store.event(`Restore of backup ${set.id} requested by ${by.trim()}; it happens when the program starts again`);
    return {requested: set.id, message: 'Close the program (Stop Control Room) and start it again. The restore happens while it starts.'};
  }
  cancelRestore() {
    const file = path.join(this.dataRoot, 'restore-request.json');
    requireValue(fs.existsSync(file), 'No restore is waiting.', 404);
    fs.rmSync(file);
    this.store.event('The waiting restore was cancelled');
    return {cancelled: true};
  }
  // Called once at start-up, before the database opens. Returns what happened (also written to restore-result.json).
  static applyPendingRestore({dataRoot, dataFile, clock = () => new Date()}) {
    const requestFile = path.join(dataRoot, 'restore-request.json'), request = readJson(requestFile);
    if (!request) return null;
    const at = clock(), resultFile = path.join(dataRoot, 'restore-result.json'), done = result => { writeJson(resultFile, {...result, backupId: request.backupId, at: at.toISOString(), requestedBy: request.requestedBy}); fs.rmSync(requestFile, {force: true}); return result; };
    const folder = request.folder, set = readJson(path.join(folder, 'sets', `${request.backupId}.json`));
    // The manifest lives on the backup drive: every name it gives must stay inside the backup and the data folder.
    const inside = rel => typeof rel === 'string' && rel && !path.isAbsolute(rel) && !rel.split(/[\\/]/).some(part => part === '..' || part === '') && path.resolve(dataRoot, rel).startsWith(path.resolve(dataRoot) + path.sep);
    if (!/^[0-9TZ]+-[0-9a-f]{4}$/.test(String(request.backupId)) || !set || !/^[0-9TZ]+-[0-9a-f]{4}\.sqlite$/.test(String(set.database?.file)) || !Array.isArray(set.files) || set.files.some(file => !inside(file?.path) || !/^[0-9a-f]{64}$/.test(String(file?.sha)))) return done({ok: false, reason: 'The backup\'s list of files is not valid (a name points outside the data folder), so nothing was restored.'});
    const snapshot = path.join(folder, 'sets', set.database.file);
    if (!fs.existsSync(snapshot) || hashSync(snapshot) !== set.database.sha || integrity(snapshot) !== 'ok') return done({ok: false, reason: 'The backup was missing or changed when the program started, so nothing was restored.'});
    const missing = set.files.find(file => !fs.existsSync(path.join(folder, 'files', file.sha.slice(0, 2), file.sha)));
    if (missing) return done({ok: false, reason: `${missing.path} is missing from the backup, so nothing was restored.`});
    // Everything replaced is set aside first.
    const aside = path.join(folder, 'before-restore', stamp(at));
    fs.mkdirSync(aside, {recursive: true});
    for (const suffix of ['', '-wal', '-shm']) if (fs.existsSync(dataFile + suffix)) { fs.copyFileSync(dataFile + suffix, path.join(aside, path.basename(dataFile) + suffix)); fs.rmSync(dataFile + suffix); }
    copyAtomic(snapshot, dataFile);
    let restored = 0, unchanged = 0;
    for (const file of set.files) {
      const target = path.join(dataRoot, ...file.path.split('/')), blob = path.join(folder, 'files', file.sha.slice(0, 2), file.sha);
      if (fs.existsSync(target) && fs.statSync(target).size === file.size && hashSync(target) === file.sha) { unchanged++; continue; }
      if (fs.existsSync(target)) copyAtomic(target, path.join(aside, 'files', ...file.path.split('/')));
      copyAtomic(blob, target);
      restored++;
    }
    return done({ok: true, restored, unchanged, setAside: aside});
  }
  // Runs from the program's timer: a backup when the newest is older than the setting and nothing big is running.
  async autoTick() {
    const settings = this.settings();
    if (!settings.auto || this.running || this.busy()) return null;
    const newest = this.sets()[0];
    if (newest && this.clock() - new Date(newest.createdAt) < settings.everyHours * 3600 * 1000) return null;
    return this.create({by: 'Automatic backup', reason: 'auto'});
  }
  publicSet(set) {
    const verified = readJson(path.join(this.folder(), 'sets', `${set.id}.verified.json`));
    return {id: set.id, createdAt: set.createdAt, createdBy: set.createdBy, reason: set.reason, files: set.files.length, totalBytes: set.totalBytes, newBytes: set.newBytes, databaseBytes: set.database.size, verified};
  }
  state() {
    const folder = this.folder();
    if (this.listed?.folder !== folder) this.listed = {folder, sets: this.sets(folder).map(set => this.publicSet(set))};
    return {settings: this.settings(), folder, sets: this.listed.sets, running: this.running, freeBackupBytes: this.free(folder), freeDataBytes: this.free(this.dataRoot),
      pendingRestore: readJson(path.join(this.dataRoot, 'restore-request.json')), lastRestore: readJson(path.join(this.dataRoot, 'restore-result.json'))};
  }
}

module.exports = {Backups, DEFAULTS, MARGIN};
