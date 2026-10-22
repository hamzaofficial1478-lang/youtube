'use strict';
// A02: backups and restore. Every test works in its own temporary data folder with a real SQLite file.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {Store} = require('../store');
const {Backups} = require('../backup');

function workspace(t) {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-test-')), dataFile = path.join(dataRoot, 'control-room.sqlite');
  // Databases close before the folder goes (Windows keeps open files).
  const stores = [];
  t.after(() => { for (const store of stores) { try { store.close(); } catch { /* closed by the test */ } } fs.rmSync(dataRoot, {recursive: true, force: true}); });
  const write = (rel, text) => { const file = path.join(dataRoot, ...rel.split('/')); fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, text); };
  write('voice-artifacts/a.wav', 'narration one');
  write('renders/r1/video.mp4', 'a render');
  write('renders/r1/.incoming-x.png', 'half written');
  write('server.log', 'today\'s log');
  return {dataRoot, dataFile, write, open: () => { const store = new Store(dataFile, {artifactRoot: dataRoot}); stores.push(store); return store; }, read: rel => fs.readFileSync(path.join(dataRoot, ...rel.split('/')), 'utf8')};
}
const family = store => store.saveFamily({name: 'Money Stories', tier: 'A', countries: ['United States'], audience: 'Curious adults who like money history told as stories.', niche: 'Origins of money', locales: ['en-US'], timezone: 'Asia/Karachi', monthlyBudget: 50, cadence: 2, format: 'long-form'});

test('a backup holds a consistent database and every work file once; the next backup copies only what changed', async t => {
  const ws = workspace(t), store = ws.open();
  let clock = new Date('2026-10-22T10:00:00Z');
  const backups = new Backups(store, {dataRoot: ws.dataRoot, dataFile: ws.dataFile, clock: () => clock});
  family(store);
  const first = await backups.create({by: 'Owner'});
  assert.deepEqual([first.files, first.reason], [2, 'manual'], 'logs, half-written files and the live database files are not copied');
  assert.equal(first.newBytes, 'narration one'.length + 'a render'.length);
  const folder = path.join(ws.dataRoot, 'backups'), set = JSON.parse(fs.readFileSync(path.join(folder, 'sets', `${first.id}.json`), 'utf8'));
  assert.deepEqual(set.files.map(file => file.path).sort(), ['renders/r1/video.mp4', 'voice-artifacts/a.wav']);
  ws.write('renders/r1/video.mp4', 'a longer render');
  clock = new Date('2026-10-22T11:00:00Z');
  const second = await backups.create({by: 'Owner'});
  assert.equal(second.newBytes, 'a longer render'.length, 'only the changed file is copied again');
  const verified = await backups.verify(second.id);
  assert.deepEqual([verified.ok, verified.files], [true, 2]);
  // A damaged stored file is found.
  const blob = path.join(folder, 'files', set.files[0].sha.slice(0, 2), set.files[0].sha);
  fs.writeFileSync(blob, 'damaged');
  const bad = await backups.verify(first.id);
  assert.equal(bad.ok, false);
  assert.match(bad.problems[0], /changed inside the backup/);
  await assert.rejects(backups.requestRestore(first.id, {by: 'Owner', confirmed: true}), /did not pass its check/);
  assert.equal(backups.state().sets[0].verified.ok, true);
  await assert.rejects(backups.create({by: 'x'}), /2-80 characters/);
});

test('a restore waits for the next start, sets the current work aside, and brings the database and files back', async t => {
  const ws = workspace(t);
  let store = ws.open();
  const backups = new Backups(store, {dataRoot: ws.dataRoot, dataFile: ws.dataFile});
  const kept = family(store);
  const set = await backups.create({by: 'Owner'});
  // Work after the backup: a new family, a changed and a new file.
  store.saveFamily({name: 'Later Family', tier: 'B', countries: ['United Kingdom'], audience: 'People who like short science stories told simply.', niche: 'Science shorts', locales: ['en-GB'], timezone: 'Europe/London', monthlyBudget: 20, cadence: 1, format: 'long-form'});
  ws.write('voice-artifacts/a.wav', 'narration changed');
  ws.write('voice-artifacts/b.wav', 'narration two');
  await assert.rejects(backups.requestRestore(set.id, {by: 'Owner'}), /Confirm/);
  const asked = await backups.requestRestore(set.id, {by: 'Owner', confirmed: true});
  assert.match(asked.message, /start it again/);
  assert.equal(backups.state().pendingRestore.backupId, set.id);
  backups.cancelRestore();
  assert.equal(backups.state().pendingRestore, null);
  await backups.requestRestore(set.id, {by: 'Owner', confirmed: true});
  store.close();
  // The next start.
  const result = Backups.applyPendingRestore({dataRoot: ws.dataRoot, dataFile: ws.dataFile});
  assert.deepEqual([result.ok, result.restored, result.unchanged], [true, 1, 1]);
  store = ws.open();
  assert.deepEqual(store.families().map(item => item.name), [kept.name], 'the database is the backup\'s');
  assert.equal(ws.read('voice-artifacts/a.wav'), 'narration one');
  assert.equal(ws.read('voice-artifacts/b.wav'), 'narration two', 'newer files stay where they are');
  assert.equal(fs.readFileSync(path.join(result.setAside, 'files', 'voice-artifacts', 'a.wav'), 'utf8'), 'narration changed', 'every replaced file is set aside first');
  assert.ok(fs.existsSync(path.join(result.setAside, 'control-room.sqlite')), 'so is the database it replaced');
  assert.equal(new Backups(store, {dataRoot: ws.dataRoot, dataFile: ws.dataFile}).state().lastRestore.ok, true);
  assert.equal(Backups.applyPendingRestore({dataRoot: ws.dataRoot, dataFile: ws.dataFile}), null, 'nothing waits any more');
});

test('a restore whose backup changed in the meantime does nothing; a full drive refuses a backup; automatic backups are kept to the setting', async t => {
  const ws = workspace(t), store = ws.open();
  let clock = new Date('2026-10-22T10:00:00Z'), busy = false;
  const backups = new Backups(store, {dataRoot: ws.dataRoot, dataFile: ws.dataFile, clock: () => clock, busy: () => busy});
  const set = await backups.create({by: 'Owner'});
  await backups.requestRestore(set.id, {by: 'Owner', confirmed: true});
  fs.appendFileSync(path.join(ws.dataRoot, 'backups', 'sets', `${set.id}.sqlite`), 'x');
  const before = fs.readFileSync(ws.dataFile);
  const result = Backups.applyPendingRestore({dataRoot: ws.dataRoot, dataFile: ws.dataFile});
  assert.equal(result.ok, false);
  assert.match(result.reason, /missing or changed/);
  assert.deepEqual(fs.readFileSync(ws.dataFile), before, 'the live database was not touched');
  // Not enough room.
  const full = new Backups(store, {dataRoot: ws.dataRoot, dataFile: ws.dataFile, free: () => 50 * 1024 ** 2});
  await assert.rejects(full.create({by: 'Owner'}), /Not enough free space/);
  // Automatic backups: only when due and nothing big is running; old ones go, kept files go with them.
  backups.saveSettings({auto: true, everyHours: 24, keep: 2, folder: null});
  assert.equal(await backups.autoTick(), null, 'the hand-made backup is less than a day old');
  for (const [k, text] of ['one', 'two', 'three'].entries()) {
    clock = new Date(Date.UTC(2026, 9, 23 + k, 10));
    ws.write('renders/r1/video.mp4', `render ${text}`);
    busy = true;
    assert.equal(await backups.autoTick(), null, 'it waits while a render runs');
    busy = false;
    assert.equal((await backups.autoTick()).reason, 'auto');
  }
  const sets = backups.sets();
  assert.deepEqual(sets.map(item => item.reason), ['auto', 'auto', 'manual'], 'two automatic backups are kept, the hand-made one stays');
  const stored = fs.readdirSync(path.join(ws.dataRoot, 'backups', 'files')).flatMap(dir => fs.readdirSync(path.join(ws.dataRoot, 'backups', 'files', dir)));
  assert.equal(stored.length, new Set(sets.flatMap(item => item.files.map(file => file.sha))).size, 'stored files no backup needs are removed');
  assert.throws(() => backups.saveSettings({auto: true, everyHours: 0, keep: 2}), /1-168 hours/);
  assert.throws(() => backups.saveSettings({auto: true, everyHours: 24, keep: 2, folder: 'relative\\path'}), /full path/);
  assert.throws(() => backups.saveSettings({auto: true, everyHours: 24, keep: 2, folder: path.join(ws.dataRoot, 'inside')}), /outside the program's data folder/);
  assert.throws(() => backups.saveSettings({auto: true, everyHours: 24, keep: 2, folder: path.join(os.tmpdir(), 'no-such-folder-xyz')}), /does not exist/);
});

test('through the program: a backup from the page, a restore at the next start, and renders refused on a nearly full drive', async t => {
  const {createApp} = require('../server');
  const {RenderRoom} = require('../render-room');
  const protector = {transform: (op, input) => Buffer.from([...input].reverse())};
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-http-')), dataFile = path.join(workspace, 'control-room.sqlite');
  let run = null;
  // The program closes before its folder goes (Windows keeps open files).
  t.after(async () => { if (run) await new Promise(resolve => run.app.server.close(resolve)); fs.rmSync(workspace, {recursive: true, force: true}); });
  const start = async () => { const app = createApp({dataFile, worker: false, protector}); await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve)); const base = `http://127.0.0.1:${app.server.address().port}`, token = (await (await fetch(`${base}/api/state`)).json()).token; return {app, base, post: (route, body) => fetch(base + route, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Local-Token': token}, body: JSON.stringify(body)})}; };
  const stop = app => new Promise(resolve => app.server.close(resolve));
  run = await start();
  family(run.app.store);
  const made = await (await run.post('/api/backups', {requestedBy: 'Owner'})).json();
  assert.match(made.id, /^\d{8}T\d{6}Z-[0-9a-f]{4}$/);
  run.app.store.saveFamily({name: 'Later Family', tier: 'B', countries: ['United Kingdom'], audience: 'People who like short science stories told simply.', niche: 'Science shorts', locales: ['en-GB'], timezone: 'Europe/London', monthlyBudget: 20, cadence: 1, format: 'long-form'});
  assert.equal((await run.post(`/api/backups/${made.id}/restore`, {requestedBy: 'Owner', confirmed: true})).status, 200);
  const state = await (await fetch(`${run.base}/api/state`)).json();
  assert.equal(state.backups.pendingRestore.backupId, made.id);
  assert.equal(state.backups.sets[0].verified.ok, true, 'a backup is checked before a restore is accepted');
  await stop(run.app);
  run = await start();
  assert.deepEqual(run.app.store.families().map(item => item.name), ['Money Stories'], 'the next start restored the backup');
  assert.equal((await (await fetch(`${run.base}/api/state`)).json()).backups.lastRestore.ok, true);
  // Disk pressure: every render path checks the drive first.
  const room = Object.assign(Object.create(RenderRoom.prototype), {dataRoot: workspace, free: () => 300 * 1024 ** 2});
  assert.throws(() => room.diskCheck(), /only 300 MB free; a render needs at least 2 GB/);
  room.free = () => 5 * 1024 ** 3;
  assert.doesNotThrow(() => room.diskCheck());
});
