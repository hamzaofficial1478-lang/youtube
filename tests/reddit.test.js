'use strict';
// 0.57: Reddit through the owner's own app, as a source of topic signals in Trending topics. No test leaves this PC.
const test = require('node:test');
const assert = require('node:assert/strict');
const {claudeMessage, isClaudeMessages, promptOf} = require('./fake-claude');
const {Store} = require('../store');
const {ConnectorSlots} = require('../connectors');
const {QuotaLedger} = require('../intel-sources');
const {TrendScanner} = require('../trends');
const {RedditClient, subredditList} = require('../reddit');

const protector = {transform: (op, input) => Buffer.from([...input].reverse())};
const json = (body, status = 200) => new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}});
const APP = {clientId: 'abcDEF1234567890', secret: 'secret-0123456789abcdef', username: 'owner_name'};
const child = (id, title, score, extra = {}) => ({kind: 't3', data: {id, title, subreddit: 'AskHistorians', score, num_comments: Math.round(score / 10), created_utc: 1792500000, permalink: `/r/AskHistorians/comments/${id}/x/`, over_18: false, ...extra}});
function reddit({claude = null, status = 200} = {}) {
  const calls = [];
  const fetch = async (url, options = {}) => {
    const target = new URL(String(url));
    calls.push({url: target.toString(), method: options.method || 'GET', headers: options.headers, body: options.body, redirect: options.redirect});
    if (isClaudeMessages(url)) return claudeMessage(typeof claude === 'function' ? claude(JSON.parse(options.body)) : claude, {input_tokens: 3000, output_tokens: 1500});
    assert.equal(options.redirect, 'error');
    assert.match(options.headers['User-Agent'], /^windows:youtube-control-room:0\.57 \(by \/u\/owner_name\)$/);
    if (target.toString() === 'https://www.reddit.com/api/v1/access_token') {
      assert.equal(options.headers.Authorization, `Basic ${Buffer.from(`${APP.clientId}:${APP.secret}`).toString('base64')}`);
      assert.equal(options.body, 'grant_type=client_credentials');
      return status === 401 ? json({error: 'invalid_grant'}, 401) : json({access_token: 'app-token-0123456789', token_type: 'bearer', expires_in: 86400, scope: '*'});
    }
    if (target.origin === 'https://oauth.reddit.com') {
      assert.equal(options.headers.Authorization, 'Bearer app-token-0123456789');
      const q = target.searchParams.get('q');
      return json({data: {children: q === 'coffee history' ? [child('a1', 'Why did coffeehouses scare kings?', 900), child('a2', 'NSFW thread', 5000, {over_18: true}), child('a3', 'How did coffee reach Europe?', 400)] : [child('a3', 'How did coffee reach Europe?', 400), child('b1', 'Was coffee ever banned?', 1200)]}});
    }
    throw new Error(`Unexpected request to ${url}`);
  };
  return {fetch, calls};
}

test('the Reddit client signs in as the owner\'s app, searches top posts and drops adult posts', async () => {
  const net = reddit(), client = new RedditClient(APP, net.fetch);
  const posts = await client.search('coffee history', {subreddits: ['AskHistorians', 'history'], days: 30, limit: 10});
  assert.deepEqual(posts.map(item => item.id), ['a1', 'a3'], 'the adult post is dropped');
  assert.deepEqual([posts[0].url, posts[0].score, posts[0].comments, posts[0].subreddit], ['https://www.reddit.com/r/AskHistorians/comments/a1/x/', 900, 90, 'AskHistorians']);
  const search = new URL(net.calls[1].url);
  assert.equal(search.pathname, '/r/AskHistorians+history/search');
  assert.deepEqual([search.searchParams.get('sort'), search.searchParams.get('t'), search.searchParams.get('restrict_sr')], ['top', 'month', '1']);
  await client.search('coffee bans', {days: 7});
  assert.equal(net.calls.filter(call => call.url.endsWith('/access_token')).length, 1, 'the app token is reused');
  assert.equal(client.requests, 3);
  await assert.rejects(new RedditClient(APP, reddit({status: 401}).fetch).search('x'), /rejected the app ID or secret/);
  assert.throws(() => new RedditClient({...APP, secret: ''}), /app ID and secret are missing/);
  assert.deepEqual(subredditList(['r/AskHistorians', '/r/history', 'history']), ['AskHistorians', 'history']);
  assert.throws(() => subredditList(['not valid!']), /subreddit name/);
});

test('a Reddit scan in Trending topics: the owner\'s app, its own hourly allowance, 30 days, and topic ideas that never retell a post', async t => {
  const store = new Store(':memory:');
  t.after(() => store.close());
  const asked = [];
  const net = reddit({claude: body => { asked.push(promptOf(body) + body.system); return JSON.stringify({summary: 'People keep asking how coffee spread and why rulers feared it.', themes: [{name: 'Banned coffee', why: 'The most voted posts ask about bans.', refs: ['R1']}],
    topics: Array.from({length: 5}, (_, n) => ({title: ['The king who banned coffee', 'How coffee crossed the sea', 'Coffeehouses that scared rulers', 'The goat legend, checked', 'Why London loved coffee'][n], promise: 'You will know the real story behind it.', whyClick: 'It answers the question people keep asking.', hook: 'In 1675 a king tried to close every coffeehouse in England.', angle: 'The documents behind the legend.', format: 'long-form', refs: ['R1'], confidence: 'medium'})), avoid: ['Retelling one poster\'s family story.']}); }});
  const connectors = new ConnectorSlots(store, protector, net.fetch);
  assert.throws(() => connectors.save({name: 'Reddit', provider: 'reddit', key: APP.secret, clientId: APP.clientId}), /Reddit username/);
  const slot = connectors.save({name: 'My Reddit app', provider: 'reddit', key: APP.secret, clientId: APP.clientId, username: APP.username});
  const tested = await connectors.test(slot.id, slot.revision);
  assert.equal(tested.connector.test.status, 'passed');
  assert.match(tested.result.message, /Reddit accepted your app and returned 2 post\(s\)/);
  const claude = connectors.save({name: 'Claude', provider: 'claude', key: 'claude-fixture-key-0123456789abcdef'});
  const claudePayload = JSON.parse(connectors.row(claude.id).payload);
  store.db.prepare('UPDATE connectors SET payload=? WHERE id=?').run(JSON.stringify({...claudePayload, test: {status: 'passed', at: new Date().toISOString()}}), claude.id);
  const quota = new QuotaLedger(store), trends = new TrendScanner(store, connectors, quota);
  const family = store.saveFamily({name: 'Coffee Stories', tier: 'A', countries: ['United States'], audience: 'Curious adults who like short history documentaries.', niche: 'The hidden history of everyday things', locales: ['en-US'], timezone: 'Asia/Karachi', monthlyBudget: 50, cadence: 2, format: 'long-form', monthlyTokenLimit: 500000});
  const ref = {id: tested.connector.id, revision: tested.connector.revision};
  assert.throws(() => trends.queueScan({source: 'reddit', keywords: ['coffee history'], subreddits: ['bad name!'], days: 30, perKeyword: 10, connector: ref, requestedBy: 'Owner'}), /subreddit name/);
  const queued = trends.queueScan({source: 'reddit', keywords: ['coffee history', 'coffee bans'], subreddits: ['AskHistorians'], days: 30, perKeyword: 10, connector: ref, requestedBy: 'Owner'});
  assert.deepEqual(queued.scope.plannedUnits, {reddit: 3});
  const done = await trends.processNextScan();
  assert.equal(done.status, 'completed');
  assert.deepEqual(done.result.posts.map(item => [item.ref, item.id, item.keywords]), [['R1', 'b1', ['K2']], ['R2', 'a1', ['K1']], ['R3', 'a3', ['K1', 'K2']]], 'most voted first, one row per post');
  assert.equal(quota.summary().reddit.used, 3);
  assert.ok(done.expiresAt, 'kept 30 days');
  // Reddit posts are signals: topic ideas need no YouTube approval, and the prompt forbids retelling posts.
  const job = trends.queueTopics(done.id, {familyId: family.id, count: 5, connector: {id: claude.id, revision: claude.revision}, requestedBy: 'Owner'});
  const ideas = await trends.processNextTopics();
  assert.equal(ideas.status, 'completed', JSON.stringify(trends.publicTopics(trends.topicRow(job.id)).error));
  assert.equal(ideas.result.topics.length, 5);
  assert.match(asked[0], /UNTRUSTED REDDIT DATA[\s\S]*never retell one post's story, never copy its words, never name or quote its author/);
  assert.doesNotMatch(asked[0], /owner_name/, 'the owner\'s username never reaches Claude');
  // After 30 days the posts are deleted and the ideas lose their input.
  assert.equal(trends.purgeExpired(new Date(Date.now() + 31 * 86400000)), 1);
  assert.equal(trends.publicScan(trends.scanRow(done.id)).result.posts, undefined);
});
