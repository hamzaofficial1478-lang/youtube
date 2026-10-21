'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {claudeMessage, isClaudeMessages} = require('./fake-claude');
const {Store} = require('../store');
const {ConnectorSlots} = require('../connectors');
const {QuotaLedger} = require('../intel-sources');
const {TrendScanner, plannedUnits} = require('../trends');

const protector = {transform: (operation, input) => Buffer.from([...input].reverse())};
const KEYS = {youtube: 'youtube-fixture-key-0123456789', claude: 'claude-fixture-key-0123456789abcdef'};
const json = (body, status = 200) => new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}});
const vid = n => `vid${String(n).padStart(8, '0')}`;
const CH = ['UCaaaaaaaaaaaaaaaaaaaaaa', 'UCbbbbbbbbbbbbbbbbbbbbbb'];

// YouTube answers: each keyword finds three videos; vid(2) is found by both keywords. The channel answer
// lists channels in the opposite order to the request, so pairing by position would mix them up.
function network({claude = null, searchStatus = 200} = {}) {
  const calls = [];
  const fetch = async (url, options = {}) => {
    const target = new URL(String(url));
    calls.push({path: target.pathname, query: Object.fromEntries(target.searchParams)});
    if (target.origin === 'https://www.googleapis.com') {
      assert.equal(options.headers['x-goog-api-key'], KEYS.youtube);
      if (target.pathname === '/youtube/v3/search') {
        if (searchStatus !== 200) return json({error: 'quota'}, searchStatus);
        const base = target.searchParams.get('q') === 'stoicism' ? 1 : 2;
        return json({items: [0, 1, 2].map(n => ({id: {videoId: vid(base + n)}, snippet: {title: `Trending stoic lesson ${base + n} for a hard week`, channelId: CH[(base + n) % 2], channelTitle: `Channel ${(base + n) % 2}`, publishedAt: '2026-10-18T10:00:00Z'}}))});
      }
      if (target.pathname === '/youtube/v3/videos') return json({items: target.searchParams.get('id').split(',').map(id => ({id, statistics: {viewCount: String(Number(id.slice(3)) * 10000), likeCount: '50', commentCount: '7'}, contentDetails: {duration: id === vid(4) ? 'PT50S' : 'PT14M2S'}}))});
      if (target.pathname === '/youtube/v3/channels') return json({items: target.searchParams.get('id').split(',').reverse().map(id => ({id, snippet: {title: `Real ${id.slice(0, 4)}`, customUrl: '@x'}, statistics: id === CH[0] ? {subscriberCount: '2400', videoCount: '31'} : {hiddenSubscriberCount: true, videoCount: '400'}}))});
    }
    if (isClaudeMessages(url)) return claudeMessage(typeof claude === 'function' ? claude(JSON.parse(options.body)) : claude, {input_tokens: 4000, output_tokens: 2000});
    throw new Error(`Unexpected request to ${url}`);
  };
  return {fetch, calls};
}
function setup(t, net) {
  const store = new Store(':memory:');
  t.after(() => store.close());
  const connectors = new ConnectorSlots(store, protector, net.fetch);
  const make = provider => {
    const slot = connectors.save({name: `${provider} fixture`, provider, notes: '', key: KEYS[provider]});
    const payload = JSON.parse(connectors.row(slot.id).payload);
    payload.test = {status: 'passed', at: new Date().toISOString(), message: 'fixture'};
    store.db.prepare('UPDATE connectors SET payload=? WHERE id=?').run(JSON.stringify(payload), slot.id);
    return {id: slot.id, revision: slot.revision};
  };
  const ids = {youtube: make('youtube'), claude: make('claude')}, quota = new QuotaLedger(store);
  const trends = new TrendScanner(store, connectors, quota);
  const family = store.saveFamily({name: 'Stoic Lessons', tier: 'A', countries: ['United States'], audience: 'Adults who want calm, practical philosophy.', niche: 'Practical stoicism', locales: ['en-US'], timezone: 'Asia/Karachi', monthlyBudget: 50, cadence: 2, format: 'long-form', monthlyTokenLimit: 500000, scriptTokenLimit: 8000, researchTokenLimit: 8000});
  return {store, trends, quota, ids, family};
}
const topicAnswer = (count, extra = {}) => JSON.stringify({
  summary: 'Short, practical stoic routines for hard weeks lead the last seven days.',
  themes: [{name: 'Stoic routines', why: 'Most viewed videos promise a routine for a hard week.', refs: ['T1', 'T2']}],
  topics: Array.from({length: count}, (_, n) => ({title: ['Why Marcus Aurelius wrote at night', 'The two-minute evening review', 'What Seneca did with anger', 'A stoic morning in five steps', 'How Epictetus handled insults', 'The dichotomy of control at work', 'Stoic journaling for beginners', 'Memento mori without the gloom'][n], promise: 'You will leave with one practice you can try tonight.', whyClick: 'It names one concrete practice instead of a vague mindset.', hook: 'He ruled an empire, and every night he wrote three lines to himself.', angle: 'Shows the practice with a real day, not quotes alone.', format: 'long-form', refs: ['T1'], confidence: 'medium'})),
  avoid: ['Quote compilations with no practice.'],
  ...extra,
});

test('a trend scan searches each keyword once, matches videos and channels by ID and keeps YouTube numbers as given', async t => {
  const net = network(), {trends, quota, ids} = setup(t, net);
  assert.equal(plannedUnits(2, 5), 202);
  assert.throws(() => trends.queueScan({keywords: ['stoicism'], days: 31, perKeyword: 5, connector: ids.youtube, requestedBy: 'Owner'}), /Days to look back/);
  assert.throws(() => trends.queueScan({keywords: ['stoicism', 'Stoicism'], days: 7, perKeyword: 5, connector: ids.youtube, requestedBy: 'Owner'}), /once/);
  assert.throws(() => trends.queueScan({keywords: Array.from({length: 21}, (_, n) => `keyword ${n}`), days: 7, perKeyword: 5, connector: ids.youtube, requestedBy: 'Owner'}), /daily cap of 2,000/);
  const queued = trends.queueScan({keywords: ['stoicism', 'marcus aurelius'], days: 7, perKeyword: 5, duration: 'long', connector: ids.youtube, requestedBy: 'Owner'});
  assert.equal(queued.scope.plannedUnits.youtube, 202);
  const scan = await trends.processNextScan();
  assert.equal(scan.status, 'completed');
  const searches = net.calls.filter(call => call.path === '/youtube/v3/search');
  assert.equal(searches.length, 2);
  assert.equal(searches[0].query.order, 'viewCount');
  assert.equal(searches[0].query.videoDuration, 'long');
  assert.ok(Date.parse(searches[0].query.publishedAfter) < Date.now() - 6.9 * 86400000);
  assert.equal(scan.result.usage.youtube, 202);
  assert.equal(quota.summary().youtube.used, 202);
  // vid(2) found twice is listed once with both keywords; the list is sorted by views.
  assert.deepEqual(scan.result.videos.map(video => video.videoId), [vid(4), vid(3), vid(2), vid(1)]);
  assert.deepEqual(scan.result.videos.find(video => video.videoId === vid(2)).keywords, ['K1', 'K2']);
  assert.equal(scan.result.videos[0].views, 40000);
  assert.equal(scan.result.videos[0].durationSeconds, 50);
  assert.equal(scan.result.channels[CH[0]].subscribers, 2400);
  assert.equal(scan.result.channels[CH[1]].subscribers, null, 'hidden subscriber counts stay unknown');
  assert.equal(scan.result.channels[CH[1]].title, `Real ${CH[1].slice(0, 4)}`);
  assert.ok(Date.parse(scan.expiresAt) - Date.parse(scan.result.retrievedAt) === 30 * 86400000);
});

test('a refused search stops the scan, and the 30-day purge keeps only the keywords', async t => {
  const net = network({searchStatus: 403}), {trends, ids, store} = setup(t, net);
  trends.queueScan({keywords: ['stoicism', 'marcus aurelius', 'seneca'], days: 7, perKeyword: 5, connector: ids.youtube, requestedBy: 'Owner'});
  const failed = (await trends.processNextScan()) || trends.state().scans[0];
  assert.equal(failed.status, 'failed');
  assert.equal(net.calls.length, 1, 'no further searches after the first refusal');
  assert.match(failed.result.keywords[1].error, /stopped/);
  assert.equal(failed.result.usage.youtube, 100);
  const again = trends.retryScan(failed.id, {});
  assert.equal(again.attempts, 2);
  // A finished scan older than 30 days loses its YouTube data on the next state read.
  const ok = network(), second = setup(t, ok);
  second.trends.queueScan({keywords: ['stoicism'], days: 7, perKeyword: 5, connector: second.ids.youtube, requestedBy: 'Owner'});
  const scan = await second.trends.processNextScan();
  second.store.db.prepare('UPDATE trend_scans SET youtube_expires_at=? WHERE id=?').run(new Date(Date.now() - 1000).toISOString(), scan.id);
  const purged = second.trends.state().scans[0];
  assert.equal(purged.result.purged, true);
  assert.equal(purged.result.videos, undefined);
  assert.deepEqual(purged.result.keywords.map(item => item.keyword), ['stoicism']);
  assert.ok(purged.purgedAt);
  assert.ok(store);
});

test('topic ideas need the recorded YouTube approval, cite the scan, keep titles short and original', async t => {
  let asked = null;
  const net = network({claude: body => { asked = body; return topicAnswer(8); }}), {trends, ids, family, store} = setup(t, net);
  trends.queueScan({keywords: ['stoicism', 'marcus aurelius'], days: 7, perKeyword: 5, connector: ids.youtube, requestedBy: 'Owner'});
  const scan = await trends.processNextScan();
  assert.throws(() => trends.queueTopics(scan.id, {familyId: family.id, count: 8, connector: ids.claude, requestedBy: 'Owner'}), /display-only/);
  assert.throws(() => trends.saveSettings({revision: 0, topicTokenLimit: 16000, youtubeDerivedUse: {approved: true, approvedOn: '2026-10-20', reference: '', confirmedBy: 'Owner'}}), /reference/);
  trends.saveSettings({revision: 0, topicTokenLimit: 16000, youtubeDerivedUse: {approved: true, approvedOn: '2026-10-20', reference: 'Google case 12345', confirmedBy: 'Owner'}});
  const queued = trends.queueTopics(scan.id, {familyId: family.id, count: 8, connector: ids.claude, requestedBy: 'Owner'});
  assert.equal(queued.status, 'queued');
  const done = await trends.processNextTopics();
  assert.equal(done.status, 'completed');
  assert.equal(done.result.topics.length, 8);
  assert.equal(done.refIndex.T1.videoId, vid(4));
  assert.match(asked.system.map ? asked.system.map(block => block.text).join('') : asked.system, /at most 60 characters/);
  assert.match(JSON.stringify(asked.messages), /Trending stoic lesson 4/);
  const usage = store.db.prepare("SELECT * FROM intelligence_usage WHERE job_id=?").get(done.id);
  assert.equal(usage.kind, 'trend_topics');
  assert.equal(usage.family_id, family.id);
  assert.equal(usage.status, 'settled');
});

test('copied trending wording, unknown refs and long titles never reach the page', async t => {
  const answers = [
    topicAnswer(5, {topics: JSON.parse(topicAnswer(5)).topics.map((topic, n) => (n ? topic : {...topic, hook: 'This is the trending stoic lesson 4 for a hard week you need.'}))}),
    topicAnswer(5, {topics: JSON.parse(topicAnswer(5)).topics.map((topic, n) => (n ? topic : {...topic, refs: ['T99']}))}),
    topicAnswer(5, {topics: JSON.parse(topicAnswer(5)).topics.map((topic, n) => (n ? topic : {...topic, title: 'A title that is far too long for a YouTube search result line'}))}),
  ];
  const net = network({claude: () => answers.shift()}), {trends, ids, family} = setup(t, net);
  trends.saveSettings({revision: 0, topicTokenLimit: 16000, youtubeDerivedUse: {approved: true, approvedOn: '2026-10-20', reference: 'Google case 12345', confirmedBy: 'Owner'}});
  trends.queueScan({keywords: ['stoicism', 'marcus aurelius'], days: 7, perKeyword: 5, connector: ids.youtube, requestedBy: 'Owner'});
  const scan = await trends.processNextScan();
  const job = trends.queueTopics(scan.id, {familyId: family.id, count: 5, connector: ids.claude, requestedBy: 'Owner'});
  for (const pattern of [/repeat trending-title wording/, /not supplied/, /at most 60 characters/]) {
    await trends.processNextTopics();
    const row = trends.state().topics.find(item => item.id === job.id);
    assert.equal(row.status, 'quality_failed');
    assert.match(row.error, pattern);
    if (row.attempts < 3) trends.retryTopics(job.id, {});
  }
  assert.throws(() => trends.retryTopics(job.id, {}), /3 paid attempts/);
});
