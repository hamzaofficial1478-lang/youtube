'use strict';
// 0.98 (owner 2026-11-10: "if the program gets a network issue and the process fails, it keeps checking the network and
// retries by itself when the connection is good; do not ask me to retry every time").
const test = require('node:test');
const assert = require('node:assert/strict');
const {Store} = require('../store');
const {NetRetry, MAX} = require('../net-retry');

test('jobs that lost the internet are retried through their own room once it is back, a few times, for a day', async t => {
  const store = new Store(':memory:');
  t.after(() => store.close());
  store.db.exec('CREATE TABLE demo_jobs(id TEXT PRIMARY KEY, content_id TEXT, status TEXT, error TEXT, updated_at TEXT)');
  const at = Date.parse('2026-11-10T12:00:00Z'), iso = ms => new Date(ms).toISOString();
  const add = (id, status, error, ms = at - 60000) => store.db.prepare('INSERT INTO demo_jobs VALUES(?,?,?,?,?)').run(id, 'c1', status, error, iso(ms));
  add('net', 'failed', 'ChatGPT could not be reached from this PC (no such host).');
  add('drop', 'interrupted', 'The connection dropped while Claude was answering.');
  add('plan', 'failed', 'Claude says your plan\'s usage limit is reached.');
  add('old', 'failed', 'ChatGPT could not be reached from this PC.', at - 25 * 3600000);
  add('done', 'completed', 'ChatGPT could not be reached from this PC.');
  let online = false;
  const retried = [];
  const retry = new NetRetry(store, {online: async () => online, everyMs: 30000})
    .add('demo', {table: 'demo_jobs', label: 'the demo job', retry: row => { retried.push(row.id); if (row.id === 'drop') throw new Error('The script changed meanwhile.'); store.db.prepare("UPDATE demo_jobs SET status='queued' WHERE id=?").run(row.id); }});
  assert.deepEqual(retry.waiting(at).map(item => [item.jobId, item.tries, item.contentId]), [['net', 0, 'c1'], ['drop', 0, 'c1']], 'only network failures of the last day, not a used-up plan');
  assert.deepEqual(await retry.tick(at), [], 'still offline: nothing is sent');
  assert.deepEqual(await retry.tick(at + 1000), [], 'checked at most every 30 seconds');
  online = true;
  assert.deepEqual(await retry.tick(at + 1000), [], 'not before the next check');
  assert.deepEqual(await retry.tick(at + 31000), [{kind: 'demo', jobId: 'net'}]);
  assert.deepEqual(retried, ['net', 'drop']);
  assert.equal(retry.tries('demo', 'net'), 1);
  assert.equal(retry.tries('demo', 'drop'), MAX, 'a retry the room refuses is not tried again');
  assert.ok(store.db.prepare("SELECT 1 FROM events WHERE message LIKE 'The internet is back: the demo job tried again by the program itself (try 1 of %'").get(), 'logged as done by the program');
  // Failed again for the network: tried again, but never more than MAX times.
  for (let k = 2; k <= MAX + 2; k++) {
    store.db.prepare("UPDATE demo_jobs SET status='failed', updated_at=? WHERE id='net'").run(iso(at + k * 40000));
    await retry.tick(at + k * 40000);
  }
  assert.equal(retry.tries('demo', 'net'), MAX);
  assert.deepEqual(retry.waiting(at + 400000), []);
});

// 0.104 (owner 2026-11-10: "the program did not try by itself"): work a restart cut off is tried again too, and after a
// sleep the hour counts from the wake.
test('work cut off by a restart is tried again, and the hour counts from waking', async t => {
  const store = new Store(':memory:');
  t.after(() => store.close());
  store.db.exec('CREATE TABLE demo_jobs(id TEXT PRIMARY KEY, content_id TEXT, status TEXT, error TEXT, updated_at TEXT)');
  const at = Date.parse('2026-11-10T18:00:00Z'), iso = ms => new Date(ms).toISOString();
  store.db.prepare('INSERT INTO demo_jobs VALUES(?,?,?,?,?)').run('restart', 'c1', 'interrupted', 'The program stopped while Claude was running. Token use is unknown; retry deliberately.', iso(at - 60000));
  store.db.prepare('INSERT INTO demo_jobs VALUES(?,?,?,?,?)').run('slept', 'c1', 'failed', 'ChatGPT could not be reached from this PC.', iso(at - 3 * 3600000));
  const retried = [];
  const retry = new NetRetry(store, {online: async () => true, everyMs: 0}).add('demo', {table: 'demo_jobs', label: 'the demo job', retry: row => { retried.push(row.id); store.db.prepare("UPDATE demo_jobs SET status='queued' WHERE id=?").run(row.id); }});
  assert.deepEqual(retry.waiting(at).map(item => item.jobId), ['restart'], 'the restart is recent; the dropped one is three hours old');
  // The PC slept from ten minutes after the drop until a minute ago: asleep time does not count, so it is still tried.
  retry.sleep = {from: at - 3 * 3600000 + 600000, to: at - 60000};
  assert.deepEqual(retry.waiting(at).map(item => item.jobId).sort(), ['restart', 'slept']);
  assert.equal(require('../net-retry').awakeFor(at - 3 * 3600000, at, retry.sleep), 660000, 'eleven minutes awake since the drop');
  await retry.tick(at);
  assert.deepEqual(retried.sort(), ['restart', 'slept']);
});

