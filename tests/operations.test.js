'use strict';
// A03 (0.59): the operations report counts what the rooms recorded over a window of days. It changes nothing.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {DatabaseSync} = require('node:sqlite');
const {report} = require('../operations');

const at = new Date('2026-11-20T12:00:00Z'), ago = days => new Date(at - days * 86400000).toISOString();

test('reliability, render capacity, what was used, language review load and each channel\'s 90-100 days', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE families(id TEXT, name_key TEXT, payload TEXT);
    CREATE TABLE render_jobs(id TEXT, family_id TEXT, preset TEXT, status TEXT, result TEXT, error TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE visual_jobs(id TEXT, family_id TEXT, status TEXT, error TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE intelligence_usage(job_id TEXT, family_id TEXT, kind TEXT, status TEXT, reserved_tokens INTEGER, total_tokens INTEGER, created_at TEXT, updated_at TEXT);
    CREATE TABLE voice_usage(job_id TEXT, family_id TEXT, status TEXT, settled_characters INTEGER, estimated_cost_cents INTEGER, created_at TEXT);
    CREATE TABLE data_usage(id TEXT, provider TEXT, status TEXT, reserved_units INTEGER, used_units INTEGER, created_at TEXT);
    CREATE TABLE edition_revisions(id TEXT, content_id TEXT, locale TEXT, revision INTEGER, created_at TEXT);
    CREATE TABLE edition_approvals(id TEXT, revision_id TEXT, locale TEXT, created_at TEXT);
    CREATE TABLE publications(id TEXT, family_id TEXT, status TEXT, visibility TEXT, locale TEXT, created_at TEXT, updated_at TEXT);`);
  db.prepare('INSERT INTO families VALUES(?,?,?)').run('f1', 'coffee', JSON.stringify({name: 'Coffee Stories'}));
  const render = (id, preset, status, days, renderSeconds, video, error = null) => db.prepare('INSERT INTO render_jobs VALUES(?,?,?,?,?,?,?,?)').run(id, 'f1', preset, status, JSON.stringify({renderSeconds, preset: {label: preset === 'master' ? 'Master 1080p' : 'Preview 720p'}, video: {probe: {durationSeconds: video}}}), error, ago(days), ago(days));
  render('r1', 'proxy720', 'completed', 2, 300, 60);
  render('r2', 'master', 'completed', 1, 600, 60);
  render('r3', 'proxy720', 'failed', 3, 0, 0, 'FFmpeg stopped at the hook segment');
  render('r4', 'proxy720', 'completed', 20, 100, 60);
  for (const [k, status] of ['completed', 'completed', 'completed', 'interrupted'].entries()) db.prepare('INSERT INTO visual_jobs VALUES(?,?,?,?,?,?)').run(`v${k}`, 'f1', status, null, ago(1), ago(1));
  const usage = (id, kind, status, reserved, total) => db.prepare('INSERT INTO intelligence_usage VALUES(?,?,?,?,?,?,?,?)').run(id, 'f1', kind, status, reserved, total, ago(1), ago(1));
  usage('u1', 'picture', 'settled', 30000, 9000); usage('u2', 'picture', 'unknown', 30000, null); usage('u3', 'scene_plan', 'settled', 100000, 50000); usage('u4', 'picture', 'reserved', 30000, null);
  db.prepare('INSERT INTO voice_usage VALUES(?,?,?,?,?,?)').run('n1', 'f1', 'settled', 1000, 30, ago(2));
  db.prepare('INSERT INTO data_usage VALUES(?,?,?,?,?,?)').run('d1', 'youtube', 'settled', 101, 101, ago(2));
  db.prepare('INSERT INTO data_usage VALUES(?,?,?,?,?,?)').run('d2', 'youtube', 'unknown', 2, null, ago(2));
  const edition = (id, locale, revision, approved) => { db.prepare('INSERT INTO edition_revisions VALUES(?,?,?,?,?)').run(id, 'c1', locale, revision, ago(3)); if (approved) db.prepare('INSERT INTO edition_approvals VALUES(?,?,?,?)').run(`a-${id}`, id, locale, ago(2)); };
  edition('e1', 'es-ES', 1, true); edition('e2', 'es-ES', 2, false); edition('e3', 'fr-FR', 1, false);
  const publication = (id, status, days) => db.prepare('INSERT INTO publications VALUES(?,?,?,?,?,?,?)').run(id, 'f1', status, status === 'published' ? JSON.stringify({privacyStatus: 'public', observedAt: ago(days)}) : null, 'en-US', ago(days + 1), ago(days));
  publication('p1', 'published', 95); publication('p2', 'published', 2); publication('p3', 'failed', 1);

  const r = report(db, {days: 14, at, quota: {youtube: {used: 101, cap: 10000, unit: 'units today'}}});
  const row = table => r.work.find(item => item.table === table);
  assert.deepEqual([row('render_jobs').done, row('render_jobs').problem, row('render_jobs').reliability], [2, 1, 2 / 3], 'the render of 20 days ago is outside the window');
  assert.deepEqual([row('visual_jobs').done, row('visual_jobs').problem], [3, 1]);
  assert.deepEqual([row('intelligence_usage').done, row('intelligence_usage').problem, row('intelligence_usage').open], [2, 1, 1], 'an AI answer that never came back is a problem; one under way is open');
  assert.equal(row('publications').problem, 1);
  assert.ok(r.problems.some(item => item.work === 'Renders' && /FFmpeg stopped/.test(item.error)));
  assert.equal(r.reliability.problems, 4);
  // Render capacity, by kind of render.
  const proxy = r.renders.find(item => item.preset === 'proxy720'), master = r.renders.find(item => item.preset === 'master');
  assert.deepEqual([proxy.renders, proxy.perVideoMinute, proxy.videoMinutesPerHour], [1, 300, 12]);
  assert.deepEqual([master.label, master.videoMinutesPerHour], ['Master 1080p', 6]);
  // What was used: tokens with unknown charges counted apart, known paid spend, data units, per family.
  const picture = r.usage.tokens.find(item => item.kind === 'picture');
  assert.deepEqual([picture.tokens, picture.unknown, picture.unknownReserved], [9000, 1, 30000]);
  assert.equal(r.usage.cents, 30);
  assert.deepEqual(r.usage.data, [{provider: 'youtube', units: 103, unknown: 1, requests: 2}], 'an unknown request counts what was reserved for it');
  assert.deepEqual(r.usage.families, [{family: 'Coffee Stories', tokens: 59000, cents: 30}]);
  assert.equal(r.quota.youtube.cap, 10000);
  // Language review load: named reviews in the window and adapted words still waiting.
  assert.deepEqual(r.languages, [{locale: 'es-ES', reviews: 1, waiting: 1}, {locale: 'fr-FR', reviews: 0, waiting: 1}]);
  // Each channel from its first public video.
  assert.deepEqual(r.channels, [{family: 'Coffee Stories', published: 2, uploads: 3, failed: 1, firstPublic: ago(95), daysLive: 95, validation: 'period complete'}]);
  // Other windows; an unknown one falls back to 14 days.
  assert.equal(report(db, {days: 30, at}).renders.find(item => item.preset === 'proxy720').renders, 2);
  assert.equal(report(db, {days: 5, at}).days, 14);
});

test('the program serves the report on its real tables', async t => {
  const {createApp} = require('../server');
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'operations-')), protector = {transform: (op, input) => Buffer.from([...input].reverse())};
  const app = createApp({dataFile: path.join(workspace, 'control-room.sqlite'), worker: false, protector});
  t.after(async () => { await new Promise(resolve => app.server.close(resolve)); fs.rmSync(workspace, {recursive: true, force: true}); });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const r = await (await fetch(`${base}/api/operations?days=30`)).json();
  assert.equal(r.days, 30);
  assert.equal(r.reliability.rate, null, 'nothing finished yet');
  assert.ok(r.work.length === 0 && r.renders.length === 0 && r.channels.length === 0);
  assert.ok(r.quota.youtube && r.quota.youtubeUploads, 'today\'s limits come with it');
  assert.equal((await (await fetch(`${base}/api/operations?days=abc`)).json()).days, 14);
});
