'use strict';
// 0.74: list pages delete the ticked rows or the whole list, and export them as CSV, Word or PDF.
const test = require('node:test');
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const {Store} = require('../store');
const {ListManager} = require('../manage');
const {createApp} = require('../server');

const familyInput = {name: 'Money Stories', tier: 'A', countries: ['United States'], audience: 'Young adults who want plain money explanations.', niche: 'Personal finance stories', locales: ['en-US'], timezone: 'Asia/Karachi', monthlyBudget: 0, cadence: 2, format: 'long-form'};
const at = '2026-10-30T10:00:00.000Z';
function scan(store, {status = 'completed', title = 'How rent ate my pay'} = {}) {
  const id = randomUUID(), result = {retrievedAt: at, keywords: [{ref: 'K1', keyword: 'rent', count: 1}], videos: [{ref: 'T1', videoId: 'abcdefghijk', title, channelId: 'UCaaaaaaaaaaaaaaaaaaaaaa', channelTitle: 'Small', publishedAt: at, keywords: ['K1'], views: 900}], channels: {UCaaaaaaaaaaaaaaaaaaaaaa: {title: 'Small', subscribers: 1200}}, errors: [], usage: {youtube: 102}};
  store.db.prepare('INSERT INTO trend_scans(id,status,scope,result,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id, status, JSON.stringify({keywords: ['rent'], days: 7, perKeyword: 5}), JSON.stringify(result), 'Owner', at, at);
  return id;
}

test('the ticked rows or the whole list are deleted; work in progress, finished videos and usage records stay', async t => {
  const app = createApp({dataFile: ':memory:', worker: false, protector: {transform: (operation, input) => input}});
  t.after(() => app.store.close());
  const store = app.store, family = store.saveFamily(familyInput);
  const lists = new ListManager(store, {pdf: async html => Buffer.from(`%PDF-1.7 ${html.length}`)});
  // Trend scans: a scan takes its topic ideas with it; a running scan is kept; the token usage of its ideas stays.
  const done = scan(store), other = scan(store, {title: '=HYPERLINK("http://x")'}), running = scan(store, {status: 'running'});
  const topic = randomUUID();
  store.db.prepare("INSERT INTO trend_topics(id,scan_id,family_id,status,scope,result,created_by,created_at,updated_at) VALUES(?,?,?,'completed','{}',?,?,?,?)").run(topic, done, family.id, JSON.stringify({summary: 'Rent and pay', topics: [{title: 'Why rent eats your pay', hook: 'Half your pay is gone before you eat.', promise: 'p', whyClick: 'w', angle: 'a', format: 'long-form', confidence: 'high'}]}), 'Owner', at, at);
  store.db.prepare("INSERT INTO intelligence_usage(job_id,family_id,kind,period_month,status,reserved_tokens,total_tokens,created_at,updated_at) VALUES(?,?,'trend_topics','2026-10','settled',16000,900,?,?)").run(topic, family.id, at, at);
  assert.throws(() => lists.delete('trend-scans', {ids: [done]}), /Confirm/);
  assert.throws(() => lists.delete('trend-scans', {ids: ['nope'], confirm: true}), /no longer exist/);
  const removed = lists.delete('trend-scans', {ids: [done, running], confirm: true});
  assert.equal(removed.deleted, 1);
  assert.deepEqual(removed.kept.map(item => item.id), [running]);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM trend_topics').get().n, 0, 'the scan\'s topic ideas went with it');
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM intelligence_usage').get().n, 1, 'the usage record stays');
  // Exports: CSV opens in Excel (byte-order mark) and a title can never run as a formula; Word is a .docx; PDF is printed.
  const csv = await lists.export('trend-scans', {ids: [other], format: 'csv'});
  const text = csv.data.toString('utf8');
  assert.equal(text.charCodeAt(0), 0xfeff);
  assert.match(text, /'=HYPERLINK\(""http:\/\/x""\)/);
  assert.match(text, /at most 30 days/);
  assert.match(csv.name, /^trend-scans-\d{4}-\d\d-\d\d\.csv$/);
  const docx = await lists.export('trend-scans', {all: true, format: 'docx'});
  assert.equal(docx.data.subarray(0, 2).toString(), 'PK');
  const pdf = await lists.export('trend-scans', {all: true, format: 'pdf'});
  assert.match(pdf.data.toString(), /^%PDF/);
  await assert.rejects(lists.export('trend-scans', {all: true, format: 'xls'}), /PDF, Word or CSV/);
  await assert.rejects(new ListManager(store).export('trend-scans', {all: true, format: 'pdf'}), /Edge or Google Chrome/);
  // Drafts: a draft with only script work leaves every list, its AI usage stays; a draft that became a video stays.
  const plain = store.saveContent({familyId: family.id, kind: 'factual', title: 'A draft nobody needs', angle: '', hook: '', script: '', sources: [], rightsConfirmed: false});
  const video = store.saveContent({familyId: family.id, kind: 'factual', title: 'A draft that became a video', angle: '', hook: '', script: '', sources: [], rightsConfirmed: false});
  store.db.prepare("INSERT INTO production_invalidations(id,family_id,content_id,stage,reason,created_at) VALUES(?,?,?,'voice','test',?)").run(randomUUID(), family.id, video.id, at);
  const drafts = await lists.export('content', {all: true, format: 'csv'});
  assert.match(drafts.data.toString(), /A draft nobody needs/);
  const result = lists.delete('content', {ids: [plain.id, video.id], confirm: true});
  assert.equal(result.deleted, 1);
  assert.match(result.kept[0].reason, /already became a video/);
  assert.deepEqual(store.contents().map(c => c.id), [video.id]);
  assert.ok(store.content(plain.id).removedAt, 'the record stays for its usage history');
});

test('the list routes need the page\'s token and return the file as a download', async t => {
  const app = createApp({dataFile: ':memory:', worker: false, protector: {transform: (operation, input) => input}});
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => app.server.close(resolve)));
  const root = `http://127.0.0.1:${app.server.address().port}`, {token} = await (await fetch(`${root}/api/state`)).json();
  const id = scan(app.store);
  const post = (route, body, key = token) => fetch(root + route, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Local-Token': key}, body: JSON.stringify(body)});
  assert.equal((await post('/api/manage/trend-scans/delete', {ids: [id], confirm: true}, 'wrong')).status, 403);
  const file = await post('/api/manage/trend-scans/export', {ids: [id], format: 'docx'});
  assert.equal(file.status, 200);
  assert.match(file.headers.get('content-disposition'), /attachment; filename="trend-scans-.*\.docx"/);
  assert.equal(Buffer.from(await file.arrayBuffer()).subarray(0, 2).toString(), 'PK');
  assert.equal((await post('/api/manage/unknown/delete', {all: true, confirm: true})).status, 404);
  const deleted = await (await post('/api/manage/trend-scans/delete', {ids: [id], confirm: true})).json();
  assert.equal(deleted.deleted, 1);
});
