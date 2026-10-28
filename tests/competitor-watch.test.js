'use strict';
// 0.57: the competitor watch. Scheduled scans of a family's competitors and the keywords of their hit videos.
const test = require('node:test');
const assert = require('node:assert/strict');
const {Store} = require('../store');
const {ConnectorSlots} = require('../connectors');
const {QuotaLedger} = require('../intel-sources');
const {StyleLibrary} = require('../style');
const {CompetitorIntelligence, hitKeywords} = require('../competitor-intel');

const protector = {transform: (op, input) => Buffer.from([...input].reverse())};
const video = (id, title, views, extra = {}) => ({videoId: id, title, views, publishedAt: '2026-10-01T00:00:00Z', durationSeconds: 600, ...extra});

test('hit videos are the ones at twice their channel\'s usual views; their recurring phrases become keywords', () => {
  const channel = (ref, hits) => ({ref, nexlev: {videos: [video(`${ref}1`, 'Daily vlog part one', 1000), video(`${ref}2`, 'Daily vlog part two', 1100), video(`${ref}3`, 'Daily vlog part three', 900), video(`${ref}4`, 'Daily vlog part four', 1000), ...hits]}});
  const result = hitKeywords([
    channel('C1', [video('h1', 'Why coffee was banned in Mecca', 9000), video('h2', 'The coffee ban nobody remembers', 4000)]),
    channel('C2', [video('h3', 'When kings banned coffee houses', 3000)]),
  ]);
  assert.deepEqual(result.hits.map(hit => hit.title), ['Why coffee was banned in Mecca', 'The coffee ban nobody remembers', 'When kings banned coffee houses']);
  assert.equal(result.keywords[0].keyword, 'coffee');
  assert.ok(result.keywords.some(item => item.keyword === 'banned coffee' || item.keyword === 'coffee banned' || item.keyword === 'banned'), JSON.stringify(result.keywords));
  assert.ok(!result.keywords.some(item => item.keyword.includes('vlog')), 'ordinary videos give no keywords');
  // YouTube data counts only with the owner's recorded derived-use approval.
  const youtubeOnly = [{ref: 'C1', youtube: {videos: [video('y1', 'Coffee secrets', 100), video('y2', 'Coffee facts', 100), video('y3', 'Coffee myths', 100), video('y4', 'Coffee story', 100), video('y5', 'The coffee empire', 900)]}}];
  assert.equal(hitKeywords(youtubeOnly).hits.length, 0);
  assert.equal(hitKeywords(youtubeOnly, {youtubeApproved: true}).hits[0].title, 'The coffee empire');
});

test('the watch scans on its schedule, waits while a scan runs, and a failed start waits a day', t => {
  const store = new Store(':memory:');
  t.after(() => store.close());
  const connectors = new ConnectorSlots(store, protector, async () => { throw new Error('no network'); });
  const nexlev = connectors.save({name: 'NexLev', provider: 'nexlev', key: 'nexlev-fixture-key-0123456789'});
  const passed = id => { const payload = JSON.parse(connectors.row(id).payload); store.db.prepare('UPDATE connectors SET payload=? WHERE id=?').run(JSON.stringify({...payload, test: {status: 'passed', at: new Date().toISOString()}}), id); return {id, revision: payload.revision}; };
  const ref = passed(nexlev.id);
  const intel = new CompetitorIntelligence(store, connectors, new QuotaLedger(store), new StyleLibrary(store));
  const family = store.saveFamily({name: 'Coffee Stories', tier: 'A', countries: ['United States'], audience: 'Curious adults who like short history documentaries.', niche: 'Everyday history', locales: ['en-US'], timezone: 'Asia/Karachi', monthlyBudget: 50, cadence: 2, format: 'long-form', competitors: ['@CoffeeHistory', '@BeanStories']});
  assert.throws(() => intel.saveWatch(family.id, {revision: 0, enabled: true, everyDays: 7, setBy: 'Owner'}), /at least one tested data connection/);
  const watch = intel.saveWatch(family.id, {revision: 0, enabled: true, everyDays: 7, nexlevConnector: ref, setBy: 'Owner'});
  assert.deepEqual([watch.enabled, watch.everyDays, watch.revision], [true, 7, 1]);
  const day0 = new Date('2026-11-01T10:00:00Z');
  const first = intel.watchTick(day0);
  assert.equal(first.length, 1, 'no scan yet: one is queued');
  const scan = store.db.prepare('SELECT * FROM competitor_scans').get();
  assert.equal(scan.created_by, 'Competitor watch');
  assert.deepEqual(intel.watchTick(day0), [], 'not while a scan is queued');
  // The scan finished: nothing until the week is over.
  store.db.prepare("UPDATE competitor_scans SET status='completed', result=?, created_at=? WHERE id=?").run(JSON.stringify({retrievedAt: day0.toISOString(), channels: [], usage: {youtube: 0, nexlev: 2}}), day0.toISOString(), scan.id);
  assert.deepEqual(intel.watchTick(new Date('2026-11-05T10:00:00Z')), []);
  assert.equal(intel.watchTick(new Date('2026-11-08T11:00:00Z')).length, 1, 'a week later the next scan is queued');
  // A connection that changed: the start fails, the reason is shown, and it waits a day before trying again.
  store.db.prepare("UPDATE competitor_scans SET status='completed', created_at=? WHERE status='queued'").run('2026-11-08T11:00:00Z');
  const payload = JSON.parse(connectors.row(nexlev.id).payload);
  store.db.prepare('UPDATE connectors SET payload=? WHERE id=?').run(JSON.stringify({...payload, test: {status: 'failed'}}), nexlev.id);
  assert.deepEqual(intel.watchTick(new Date('2026-11-16T12:00:00Z')), []);
  assert.match(intel.watch(family.id).lastNote, /scheduled scan could not start/);
  assert.deepEqual(intel.watchTick(new Date('2026-11-16T20:00:00Z')), [], 'no retry within a day');
  // Switched off, it does nothing.
  intel.saveWatch(family.id, {revision: intel.watch(family.id).revision, enabled: false, setBy: 'Owner'});
  assert.deepEqual(intel.watchTick(new Date('2026-12-30T12:00:00Z')), []);
  assert.equal(intel.state().families[family.id].watch.enabled, false);
});
