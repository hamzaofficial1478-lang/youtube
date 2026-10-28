'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {claudeMessage, isClaudeMessages} = require('./fake-claude');
const {Store} = require('../store');
const {ConnectorSlots} = require('../connectors');
const {StyleLibrary} = require('../style');
const {QuotaLedger} = require('../intel-sources');
const {NicheFactory, ideaInput, momentumOf, risingOf, validateRead} = require('../niche-factory');

const protector = {transform: (operation, input) => Buffer.from([...input].reverse())};
const KEYS = {nexlev: 'nexlev-fixture-key-0123456789', youtube: 'youtube-fixture-key-0123456789', claude: 'claude-fixture-key-0123456789abcdef'};
const json = (body, status = 200) => new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}});
const DAY = 86400000;
const ago = days => new Date(Date.now() - days * DAY).toISOString();
const vid = n => `vid${String(n).padStart(8, '0')}`;
const CH = ['UCaaaaaaaaaaaaaaaaaaaaaa', 'UCbbbbbbbbbbbbbbbbbbbbbb', 'UCcccccccccccccccccccccc', 'UCdddddddddddddddddddddd'];
// A 1x1 PNG, enough for the type check.
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
const pngUrl = bytes => `data:image/png;base64,${bytes.toString('base64')}`;

// NexLev: CH[1] posts often with big recent views, CH[2] posted once lately, CH[3] went quiet 4 months ago.
const RECENT = {
  [CH[0]]: [[5, 40000], [20, 30000], [200, 900000]],
  [CH[1]]: [[2, 250000], [9, 180000], [30, 120000], [60, 90000]],
  [CH[2]]: [[10, 70000], [150, 400000]],
  [CH[3]]: [[120, 2000000], [130, 1500000]],
};
function network({claude = null} = {}) {
  const calls = [];
  const fetch = async (url, options = {}) => {
    const target = new URL(String(url));
    const body = options.body ? JSON.parse(options.body) : {};
    calls.push({path: target.pathname, query: Object.fromEntries(target.searchParams), body});
    if (target.origin === 'https://prod.dashboard.nexlev.io') {
      const id = target.searchParams.get('id') || body.channelId;
      switch (target.pathname) {
        case '/api/external/niche-overview/analyze': return json({data: {niche: 'Stoic self-improvement', competition: 'medium'}});
        case '/api/external/similar-channels/search': return json({channels: [{channelId: CH[1], name: 'Daily Stoa', subscribers: 90000}, {channelId: CH[2], name: 'Old Wisdom', subscribers: 300000}, {channelId: CH[3], name: 'Quiet Giant', subscribers: 2000000}]});
        case '/api/external/similar-thumbnails/search': return json({results: [{videoId: vid(90), title: 'Marcus Aurelius on a bad morning', channelId: CH[1], channelTitle: 'Daily Stoa', views: 54000}]});
        case '/api/external/analytics/channel-analytics': return json({subscribers: 90000, monthlyViews: '600,000'});
        case '/api/external/channels/videos': return json({videos: (RECENT[id] || []).map(([days, views], n) => ({videoId: vid(CH.indexOf(id) * 10 + n), title: `Recent stoic video ${n} of ${id.slice(0, 4)}`, publishedAt: ago(days), viewCount: String(views)}))});
        default: return json({error: 'unknown'}, 404);
      }
    }
    if (target.origin === 'https://www.googleapis.com' && target.pathname === '/youtube/v3/videos') return json({items: target.searchParams.get('id').split(',').map(id => ({id, snippet: {channelId: CH[0], channelTitle: 'Seed From Video'}}))});
    if (isClaudeMessages(url)) return claudeMessage(typeof claude === 'function' ? claude(body) : claude, {input_tokens: 3000, output_tokens: 1500});
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
  const ids = {nexlev: make('nexlev'), youtube: make('youtube'), claude: make('claude')};
  const shotDir = fs.mkdtempSync(path.join(os.tmpdir(), 'control-room-shots-'));
  t.after(() => fs.rmSync(shotDir, {recursive: true, force: true}));
  const niches = new NicheFactory(store, connectors, new QuotaLedger(store), new StyleLibrary(store), undefined, {shotDir});
  return {store, niches, ids, shotDir};
}
const readAnswer = (extra = {}) => JSON.stringify({
  seen: {platform: 'YouTube', kind: 'channel', summary: 'A channel page of stoic explainers with three videos over a million views.'},
  channels: [{name: 'Daily Stoa', handle: '@DailyStoa', subscribers: '90K'}, {name: 'Unnamed', handle: 'not a handle', subscribers: null}],
  videos: [{title: 'Marcus Aurelius on a bad morning', views: '1.2M views', channel: 'Daily Stoa'}],
  patterns: ['Titles name one emperor and one everyday problem.'],
  niche: {title: 'Stoic habits for hard days', description: 'Short practical stoic lessons, each tied to one everyday problem.', audience: 'Adults under pressure at work', keywords: ['stoic habits', 'marcus aurelius morning'], formats: ['long-form']},
  whyItWorks: ['One concrete problem per video.'], questions: ['Is the topic supply deep enough for 100 videos?'],
  ...extra,
});

test('recent growth: active channels rank by the views their last-90-day videos gained', () => {
  const at = Date.parse('2026-10-21T00:00:00Z'), video = (days, views) => ({videoId: vid(days), title: `t${days}`, publishedAt: new Date(at - days * DAY).toISOString(), views});
  const busy = momentumOf([video(2, 250000), video(9, 180000), video(30, null), video(200, 9)], at);
  assert.deepEqual([busy.uploads, busy.views, busy.medianViews, busy.best.views, busy.lowerBound], [3, 430000, 215000, 250000, false]);
  assert.equal(momentumOf([video(2, 5), video(3, 5)], at).lowerBound, true, 'every listed video is recent: the counts are a lower bound');
  const channels = [{ref: 'C1', momentum: {uploads: 1, views: 9e9}}, {ref: 'C2', momentum: {uploads: 2, views: 10}}, {ref: 'C3', momentum: {uploads: 4, views: 99}}, {ref: 'C4'}];
  assert.deepEqual(risingOf(channels), ['C3', 'C2'], 'one upload is not active; unchecked channels are skipped');
  assert.equal(risingOf(Array.from({length: 14}, (_, n) => ({ref: `C${n}`, momentum: {uploads: 3, views: n}}))).length, 10);
});

test('pasted links: video links of every form are kept once; other links are refused', () => {
  const base = {title: 'Stoic habits', description: 'Short practical stoic lessons for hard days.', formats: ['long-form']};
  const idea = ideaInput({...base, seedVideos: ['https://www.youtube.com/watch?v=abcdefghijk&t=30', 'https://youtu.be/abcdefghijk', 'https://youtube.com/shorts/ABCDEFGHIJK?feature=share', 'https://www.youtube.com/watch?feature=x&v=zyxwvutsrqp']});
  assert.deepEqual(idea.seedVideos.map(item => item.videoId), ['abcdefghijk', 'ABCDEFGHIJK', 'zyxwvutsrqp']);
  assert.throws(() => ideaInput({...base, seedVideos: ['https://www.youtube.com/@DailyStoa']}), /not a YouTube video link/);
  assert.throws(() => ideaInput({...base, seedVideos: ['https://evil.example/watch?v=abcdefghijk']}), /not a YouTube video link/);
  assert.throws(() => ideaInput({...base, seedVideos: Array.from({length: 11}, (_, n) => `https://youtu.be/${String(n).padStart(11, 'a')}`)}), /at most 10/);
});

test('discovery follows a video link to its channel and keeps about ten channels that grew lately', async t => {
  const net = network(), {niches, ids} = setup(t, net);
  const idea = niches.saveIdea({title: 'Stoic habits', description: 'Short practical stoic lessons for hard days.', formats: ['long-form'], keywords: ['stoic habits'], seedVideos: ['https://youtu.be/abcdefghijk'], createdBy: 'Owner'});
  assert.throws(() => niches.queueDiscovery(idea.id, {ideaRevision: idea.revision, requestedBy: 'Owner', nexlevConnector: ids.nexlev}), /video links need a tested YouTube connector/);
  const queued = niches.queueDiscovery(idea.id, {ideaRevision: idea.revision, requestedBy: 'Owner', nexlevConnector: ids.nexlev, youtubeConnector: ids.youtube});
  assert.deepEqual(queued.scope.plannedUnits, {nexlev: 2 + 1 + 3 + 12, youtube: 1});
  const discovery = await niches.processNextDiscovery();
  assert.equal(discovery.status, 'completed');
  assert.equal(discovery.result.seeds[0].input.value, CH[0]);
  assert.equal(discovery.result.seeds[0].input.fromVideo, 'abcdefghijk');
  assert.equal(net.calls.filter(call => call.path === '/youtube/v3/videos').length, 1);
  const byId = Object.fromEntries(discovery.result.channels.map(channel => [channel.channelId, channel]));
  assert.ok(byId[CH[0]], 'the seed channel is a candidate too');
  assert.deepEqual(discovery.result.rising, [byId[CH[1]].ref, byId[CH[0]].ref], 'CH[1] gained the most; one recent upload (CH[2]) or none (CH[3]) is not rising');
  assert.equal(byId[CH[1]].momentum.views, 640000);
  assert.equal(byId[CH[3]].momentum.uploads, 0);
  assert.equal(discovery.result.usage.youtube, 1);
});

test('the go/no-go answer studies the viewers, what rising competitors miss and how we win', async t => {
  let asked = null;
  const answer = refs => ({
    summary: 'Practical stoicism has steady demand; rising channels skip the everyday practice.', positioning: 'One stoic habit per hard moment.',
    ratings: Object.fromEntries(['audienceDemand', 'differentiation', 'episodeSupply', 'productionFeasibility', 'languageMarketFit'].map(key => [key, {rating: 4, rationale: 'Grounded in the rising channels.', refs: [refs.rising]}])),
    hardFilters: Object.fromEntries(['rights', 'evidence', 'suitability', 'cost', 'originality'].map(key => [key, {pass: true, note: 'Fine for stock and AI visuals.'}])),
    episodeIdeas: Array.from({length: 20}, (_, n) => `Habit ${n + 1}: ${['anger', 'fear', 'grief', 'envy', 'sloth', 'pride', 'worry', 'regret', 'shame', 'doubt', 'boredom', 'jealousy', 'panic', 'impatience', 'resentment', 'loneliness', 'greed', 'hurry', 'blame', 'despair'][n]} at work`),
    reasonsToReject: ['Many quote channels already.', 'Easy to sound preachy.', 'Hard to show with stock footage.'],
    recommendedCompetitors: [refs.rising], recommendedStyleKey: 'documentary-montage',
    familyDraft: {name: 'Stoic Habits', audience: 'Adults under pressure at work.', niche: 'Practical stoicism for hard days', countries: ['United States'], format: 'long-form'},
    confidence: {level: 'medium', rationale: 'Two rising channels measured.'}, uncertainties: [],
    audience: {who: 'Adults under pressure who want calm without religion.', wants: ['One practice to try tonight'], pains: ['Quote lists with no practice'], staysFor: ['A real day shown step by step'], leavesWhen: ['Slow intros']},
    gaps: [{gap: 'Rising channels list quotes but never show a practice.', refs: [refs.rising], howWeFill: 'Each video walks through one practice in a real day.'}, {gap: 'Nobody covers stoicism at work.', refs: ['IDEA'], howWeFill: 'Office situations in every episode.'}, {gap: 'No series structure.', refs: [refs.rising], howWeFill: 'A 30-day habit series.'}],
    howWeWin: 'Practice over quotes: every video ends with one habit shown in a real day.',
    competitorNotes: [{ref: refs.rising, strength: 'Posts twice a week.', weakness: 'Quote lists only.'}],
    monetization: ['Journal sponsors fit this audience.', 'A printed 30-day stoic habit workbook.'],
    markets: [{language: 'English', strength: 'high', why: 'The largest audience for this topic and strong advertisers.'}, {language: 'Spanish', strength: 'medium', why: 'Fewer channels cover it, a growing audience.'}],
    countryTiers: [{tier: 1, countries: ['United States', 'United Kingdom'], why: 'High ad rates and a curious adult audience.'}],
    ages: {core: '25-44', also: '45-54', why: 'Adults with jobs and money questions watch practical history.'},
    viral: {chance: 'medium', why: 'Surprising origins travel well, but the topic is calm.', triggers: ['A surprising first line'], risks: ['A slow opening']},
    ...refs.extra,
  });
  let current = null;
  const net = network({claude: body => { asked = body; return JSON.stringify(current); }}), {niches, ids} = setup(t, net);
  const idea = niches.saveIdea({title: 'Stoic habits', description: 'Short practical stoic lessons for hard days.', formats: ['long-form'], keywords: ['stoic habits'], seedChannels: [CH[0]], createdBy: 'Owner'});
  niches.queueDiscovery(idea.id, {ideaRevision: idea.revision, requestedBy: 'Owner', nexlevConnector: ids.nexlev});
  const discovery = await niches.processNextDiscovery();
  const rising = discovery.result.rising[0];
  current = answer({rising});
  const job = niches.queueEvaluation(idea.id, {ideaRevision: idea.revision, discoveryId: discovery.id, connector: ids.claude, requestedBy: 'Owner'});
  await niches.processNextEvaluation();
  const done = niches.publicEvaluation(niches.evaluationRow(job.id));
  assert.equal(done.status, 'completed');
  assert.equal(done.decision, 'strong');
  assert.equal(done.result.gaps.length, 3);
  assert.match(done.result.howWeWin, /Practice over quotes/);
  // Version 3 (2026-10-22): languages, country tiers, ages and the chance to spread, as Claude's estimates.
  assert.deepEqual([done.result.markets[0].language, done.result.countryTiers[0].tier, done.result.ages.core, done.result.viral.chance], ['English', 1, '25-44', 'medium']);
  assert.match(JSON.stringify(asked), /markets: 1-6 languages this niche would do best in/);
  assert.match(JSON.stringify(asked), /rising lists the discovered channels/);
  assert.match(JSON.stringify(asked), /viewsOnThoseVideos/);
  // A gap citing a channel that was never discovered, or a note about one, is refused.
  for (const extra of [{gaps: [...current.gaps.slice(0, 2), {gap: 'Invented gap from nowhere at all.', refs: ['C99'], howWeFill: 'Something nice.'}]}, {competitorNotes: [{ref: 'C99', strength: 'Fast.', weakness: 'Slow.'}]}]) {
    current = answer({rising, extra});
    const again = niches.queueEvaluation(idea.id, {ideaRevision: idea.revision, discoveryId: discovery.id, connector: ids.claude, requestedBy: 'Owner'});
    await niches.processNextEvaluation();
    assert.equal(niches.publicEvaluation(niches.evaluationRow(again.id)).status, 'quality_failed');
  }
});

test('a screenshot is checked, kept in the data folder and read by Claude as an image', async t => {
  let asked = null;
  const net = network({claude: body => { asked = body; return readAnswer(); }}), {niches, ids, store, shotDir} = setup(t, net);
  assert.throws(() => niches.queueRead({image: 'data:image/gif;base64,R0lGOD', connector: ids.claude, requestedBy: 'Owner'}), /PNG, JPEG or WebP/);
  assert.throws(() => niches.queueRead({image: pngUrl(Buffer.from('not a png at all '.repeat(10))), connector: ids.claude, requestedBy: 'Owner'}), /image type/);
  assert.throws(() => niches.queueRead({image: pngUrl(Buffer.concat([PNG, Buffer.alloc(4 * 1024 * 1024)])), connector: ids.claude, requestedBy: 'Owner'}), /smaller than 4 MB/);
  const queued = niches.queueRead({image: pngUrl(PNG), note: 'Found this on Instagram', connector: ids.claude, requestedBy: 'Owner'});
  assert.equal(queued.image.bytes, PNG.length);
  assert.deepEqual(fs.readdirSync(shotDir), [`${queued.image.sha256}.png`]);
  const read = await niches.processNextRead();
  assert.equal(read.status, 'completed');
  const image = asked.messages[0].content.find(block => block.type === 'image');
  assert.equal(image.source.media_type, 'image/png');
  assert.equal(image.source.data, PNG.toString('base64'));
  assert.match(JSON.stringify(asked.messages[0].content), /Found this on Instagram/);
  assert.deepEqual(read.result.channels.map(item => item.handle), ['@DailyStoa', null], 'a non-handle is dropped, not trusted');
  assert.equal(read.result.niche.keywords.length, 2);
  assert.equal(store.db.prepare("SELECT kind, status FROM intelligence_usage WHERE job_id=?").get(read.id).kind, 'niche_read');
  assert.equal(niches.tokenSummary().settled, 4500, 'reads count against the Niche Factory monthly limit');
  assert.throws(() => validateRead(JSON.parse(readAnswer({niche: {...JSON.parse(readAnswer()).niche, formats: ['podcast']}}))), /unknown format/);
});
