'use strict';
const test = require('node:test');
const {claudeMessage, isClaudeMessages} = require('./fake-claude');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {Store} = require('../store');
const {ConnectorSlots} = require('../connectors');
const {StyleLibrary} = require('../style');
const {
  NexLevClient, QuotaLedger, normVideo, normChannel, transcriptText, count, durationSeconds, copiedPhrases, firstArray, youtubePeriod,
} = require('../intel-sources');
const {CompetitorIntelligence, validateBlueprint} = require('../competitor-intel');
const {NicheFactory, scoreRatings, decisionFor} = require('../niche-factory');
const {createApp} = require('../server');

const protector = {transform: (operation, input) => Buffer.from([...input].reverse())};
const KEYS = {nexlev: 'nexlev-fixture-key-0123456789', youtube: 'youtube-fixture-key-0123456789', claude: 'claude-fixture-key-0123456789abcdef'};
const json = (body, status = 200) => new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}});
const words = (count, prefix) => Array.from({length: count}, (_, index) => `${prefix}${index + 1}`).join(' ');
const hook = 'Every coin in your pocket began as a promise between strangers.';
const script = [`${hook} ${words(150, 'opening')}`, words(160, 'development'), words(160, 'example'), words(168, 'payoff')].join('\n\n');
const vid = n => `vid${String(n).padStart(8, '0')}`;
const channelIds = ['UCaaaaaaaaaaaaaaaaaaaaaa', 'UCbbbbbbbbbbbbbbbbbbbbbb', 'UCcccccccccccccccccccccc'];
const TRANSCRIPT = 'Long before banks existed people needed a way to trust a stranger they would never meet again so they invented tokens and tallies that recorded every promise';

// One fake network for NexLev, YouTube and Claude. Every call is recorded.
function fakeNetwork({claudeContent = null, claudeUsage = {prompt_tokens: 3000, completion_tokens: 1500, total_tokens: 4500}, nexlevStatus = 200} = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const target = new URL(String(url));
    calls.push({origin: target.origin, path: target.pathname, query: Object.fromEntries(target.searchParams), headers: options.headers || {}, body: options.body ? JSON.parse(options.body) : null, method: options.method || 'GET'});
    if (target.origin === 'https://prod.dashboard.nexlev.io') {
      assert.equal(options.headers['x-api-key'], KEYS.nexlev);
      assert.equal(options.redirect, 'error');
      if (nexlevStatus !== 200) return json({error: 'nope'}, nexlevStatus);
      const id = target.searchParams.get('id') || JSON.parse(options.body || '{}').channelId;
      const index = Math.max(0, channelIds.indexOf(id));
      switch (target.pathname) {
        case '/api/external/channels/about': return json({channelId: target.searchParams.get('forUsername') ? channelIds[2] : id, title: `Channel ${index + 1}`, subscriberCount: '1.2M'});
        case '/api/external/channels/videos': return json({videos: Array.from({length: 6}, (_, n) => ({videoId: vid(index * 10 + n), title: `Ancient money story number ${index}-${n}`, publishedAt: new Date(Date.UTC(2026, 8, 1 + n * 4)).toISOString(), lengthSeconds: n === 5 ? 50 : 600 + n * 30, viewCount: String(10000 * (n + 1))}))});
        case '/api/external/channels/outliers': return json({data: {outliers: [{videoId: vid(index * 10 + 2), title: `Ancient money story number ${index}-2`, outlierScore: '4.5', views: '1.1M', duration: 'PT12M30S'}]}});
        case '/api/external/videos/bulk-transcript': return json({data: JSON.parse(options.body).videoIds.map(videoId => ({videoId, transcript: [{text: TRANSCRIPT}, {text: 'and every tally told a story'}]}))});
        case '/api/external/niche-overview/analyze': return json({data: {niche: 'Economic history explainers', summary: 'Story-led channels about how money began.', targetAudience: 'Curious adults', competition: 'medium'}});
        case '/api/external/similar-channels/search': return json({channels: [{channelId: channelIds[1], name: 'Barter Lab', subscribers: 250000}, {channelId: channelIds[2], name: 'Coin Origins', subscribers: '80K'}]});
        case '/api/external/similar-thumbnails/search': return json({results: [{videoId: vid(90), title: 'The first coins ever minted', channelId: channelIds[2], channelTitle: 'Coin Origins', views: 54000}]});
        case '/api/external/analytics/channel-analytics': return json({subscribers: 250000, monthlyViews: '1,200,000', estimatedMonthlyRevenue: 3400, rpm: 2.8});
        default: return json({error: 'unknown'}, 404);
      }
    }
    if (target.origin === 'https://www.googleapis.com') {
      assert.equal(options.headers['x-goog-api-key'], KEYS.youtube);
      if (target.pathname === '/youtube/v3/channels') {
        const ref = target.searchParams.get('id') || target.searchParams.get('forHandle') || target.searchParams.get('forUsername');
        const id = channelIds.includes(ref) ? ref : ['@CoinOrigins', 'CoinOrigins'].includes(ref) ? channelIds[2] : channelIds[1];
        return json({items: [{id, snippet: {title: `YouTube title for ${id.slice(0, 6)}`, customUrl: '@fixture', country: 'US', publishedAt: '2019-01-01T00:00:00Z'}, statistics: {viewCount: '9000000', subscriberCount: '120000', videoCount: '210'}, contentDetails: {relatedPlaylists: {uploads: `UU${id.slice(2)}`}}}]});
      }
      if (target.pathname === '/youtube/v3/playlistItems') return json({items: [{contentDetails: {videoId: vid(70)}}, {contentDetails: {videoId: vid(71)}}]});
      if (target.pathname === '/youtube/v3/videos') return json({items: [{id: vid(70), snippet: {title: 'YouTube raw title A', publishedAt: '2026-09-20T10:00:00Z'}, contentDetails: {duration: 'PT9M5S', caption: 'false', definition: 'hd'}, statistics: {viewCount: '5000'}}, {id: vid(71), snippet: {title: 'YouTube raw title B', publishedAt: '2026-09-25T10:00:00Z'}, contentDetails: {duration: 'PT45S'}, statistics: {}}]});
      return json({}, 404);
    }
    if (target.origin === 'https://api.anthropic.com') {
      if (target.pathname === '/v1/capabilities') return json({auth: {type: 'bearer', required: true}, features: {chat_completions: true}});
      if (target.pathname === '/v1/toolsets') return json([]);
      if (isClaudeMessages(url)) {
        const body = JSON.parse(options.body), content = typeof claudeContent === 'function' ? claudeContent(body) : claudeContent;
        return claudeMessage(content, {input_tokens: claudeUsage.prompt_tokens, output_tokens: claudeUsage.completion_tokens});
      }
    }
    throw new Error(`Unexpected request to ${url}`);
  };
  return {fetch: fetchImpl, calls};
}

function setup(t, network, familyExtra = {}) {
  const store = new Store(':memory:');
  t.after(() => store.close());
  const connectors = new ConnectorSlots(store, protector, network.fetch);
  const make = provider => {
    const slot = connectors.save({name: `${provider} fixture`, provider, notes: '', key: KEYS[provider]});
    const row = connectors.row(slot.id), payload = JSON.parse(row.payload);
    payload.test = {status: 'passed', at: new Date().toISOString(), message: 'fixture'};
    store.db.prepare('UPDATE connectors SET payload=? WHERE id=?').run(JSON.stringify(payload), slot.id);
    return {id: slot.id, revision: slot.revision};
  };
  const ids = {nexlev: make('nexlev'), youtube: make('youtube'), claude: make('claude')};
  const styles = new StyleLibrary(store), quota = new QuotaLedger(store);
  const intel = new CompetitorIntelligence(store, connectors, quota, styles);
  const niches = new NicheFactory(store, connectors, quota, styles);
  const family = store.saveFamily({name: 'Money History', tier: 'A', countries: ['United States'], audience: 'Curious adults who like money history told as stories.', niche: 'Origins of money', locales: ['en-US'], timezone: 'Asia/Karachi', monthlyBudget: 50, cadence: 2, format: 'long-form', monthlyTokenLimit: 500000, scriptTokenLimit: 8000, researchTokenLimit: 8000,
    competitors: [channelIds[0], 'https://www.youtube.com/channel/' + channelIds[1], 'https://www.youtube.com/user/CoinOrigins'], ...familyExtra});
  return {store, connectors, styles, quota, intel, niches, family, ids};
}
function blueprint(extra = {}) {
  return {
    summary: 'Three story-led money channels win with concrete openings and clear chronology; the gap is practical takeaways.',
    channels: [{ref: 'C1', positioning: 'Narrative economic history with archival texture.', strengths: ['Strong openings'], gaps: ['Few practical lessons']}],
    script: {hookPatterns: ['Open on a small object and ask who first trusted it'], structure: ['Hook object', 'Origin', 'Turning point', 'Modern echo'], pacing: 'Brisk first minute, then measured explanation.', callToAction: 'Invite viewers to spot the pattern in their own wallet.'},
    voice: {tone: 'Warm, curious storyteller', emotion: 'warm', pace: 'measured', energy: 55, delivery: ['Slow down on dates and numbers']},
    editing: {observations: ['Long holds on archival stills with slow moves'], recommendedStyleKey: 'documentary-montage', adjustments: [{setting: 'pacing.shotMaxSeconds', value: 9, reason: 'Allow longer holds on archival stills.'}, {setting: 'audio.musicMoods', value: ['curious', 'warm'], reason: 'Lighter tone than competitors.'}, {setting: 'motion.intensity', value: 400, reason: 'Deliberately invalid to test skipping.'}]},
    visuals: {observations: ['Maps and close-ups of coins carry the story'], recommendedSources: ['stock-video', 'maps-and-diagrams', 'ai-image']},
    packaging: {titlePatterns: ['Question about an everyday object'], thumbnailNotes: ['One object, high contrast, two words']},
    adopt: [{area: 'script', pattern: 'Open on a tangible object before the history', refs: ['C1', 'T1']}, {area: 'visuals', pattern: 'Use maps to show trade routes', refs: ['V1']}],
    original: [{area: 'script', contribution: 'End each episode with a practical money habit'}, {area: 'voice', contribution: 'A warmer, conversational narrator'}, {area: 'editing', contribution: 'Recurring animated ledger graphic'}, {area: 'packaging', contribution: 'Thumbnails show the modern object, not the ancient one'}, {area: 'visuals', contribution: 'AI-reconstructed marketplaces, clearly disclosed'}],
    avoid: [{pattern: 'Overlong cold opens', reason: 'Viewers wait too long for the promise.'}],
    opportunities: [{opportunity: 'Nobody connects ancient money to modern budgeting', refs: ['C1', 'C2']}],
    confidence: {level: 'medium', rationale: 'Three channels with transcripts and outliers.'},
    uncertainties: ['Outlier scores are third-party estimates.'],
    ...extra,
  };
}

test('tolerant normalization keeps unknown values unknown and the copy guard finds shared wording', () => {
  assert.equal(count('1.2M'), 1200000);
  assert.equal(count('12,345'), 12345);
  assert.equal(count('about a lot'), null);
  assert.equal(durationSeconds('PT1H2M3S'), 3723);
  assert.equal(durationSeconds('12:30'), 750);
  assert.equal(durationSeconds('soon'), null);
  const video = normVideo({id: {videoId: vid(1)}, snippet: {title: '  Hello\u0007 world  ', publishedAt: '2026-01-02T00:00:00Z'}, viewCount: '2K', outlier_multiplier: '3.25x', thumbnails: [{url: 'https://img.example/x.jpg'}]});
  assert.deepEqual([video.videoId, video.title, video.views, video.outlierScore, video.thumbnailUrl], [vid(1), 'Hello world', 2000, 3.25, 'https://img.example/x.jpg']);
  assert.equal(normVideo({videoId: 'not-a-video-id', title: 'x'}), null);
  assert.equal(normVideo({videoId: vid(2), thumbnail: 'http://insecure.example/x.jpg'}).thumbnailUrl, null);
  assert.equal(normChannel({id: 'UC123'}), null);
  assert.equal(normChannel({channel_id: channelIds[0], name: 'Name', subs: '3.4K'}).subscribers, 3400);
  assert.equal(transcriptText({transcript: [{text: 'one'}, 'two', {content: 'three'}]}), 'one two three');
  assert.deepEqual(firstArray({data: {result: {items: [1, 2]}}}), [1, 2]);
  assert.deepEqual(copiedPhrases(['They invented tokens and tallies that recorded every promise today'], [TRANSCRIPT]).length > 0, true);
  assert.deepEqual(copiedPhrases(['A completely original sentence about early trade networks'], [TRANSCRIPT]), []);
});

test('NexLev client uses the fixed origin and header key, maps errors and never retries', async () => {
  const network = fakeNetwork();
  const client = new NexLevClient(KEYS.nexlev, network.fetch);
  await client.channelOutliers(channelIds[0], 60, 2);
  await client.similarChannels(channelIds[0], 'all', 1);
  assert.equal(client.requests, 2);
  assert.deepEqual(network.calls[0].query, {id: channelIds[0], maxVideos: '60', minOutlierThreshold: '2'});
  assert.deepEqual(network.calls[1].body, {channelId: channelIds[0], channelType: 'all', level: 1});
  assert.ok(network.calls.every(call => call.origin === 'https://prod.dashboard.nexlev.io' && !JSON.stringify(call.query).includes(KEYS.nexlev)));
  await assert.rejects(new NexLevClient(KEYS.nexlev, fakeNetwork({nexlevStatus: 401}).fetch).channelAbout(channelIds[0]), /rejected the API key/);
  const limited = fakeNetwork({nexlevStatus: 429});
  await assert.rejects(new NexLevClient(KEYS.nexlev, limited.fetch).channelAbout(channelIds[0]), /quota/);
  assert.equal(limited.calls.length, 1);
  const huge = async () => new Response('x'.repeat(10), {headers: {'content-length': String(5_000_000)}});
  await assert.rejects(new NexLevClient(KEYS.nexlev, huge).channelAbout(channelIds[0]), /too large/);
  assert.throws(() => new NexLevClient('short', network.fetch), /key is missing or invalid/);
});

test('quota ledger reserves before calls, blocks over-cap work and settles actual use', t => {
  const store = new Store(':memory:');
  t.after(() => store.close());
  const quota = new QuotaLedger(store);
  quota.saveSettings({revision: 0, nexlevMonthlyRequestCap: 10, youtubeDailyUnitCap: 5});
  assert.throws(() => quota.saveSettings({revision: 0, nexlevMonthlyRequestCap: 10, youtubeDailyUnitCap: 5}), /another tab/);
  assert.deepEqual(store.transaction(() => quota.reserve('job-1', {nexlev: 8, youtube: 3})), {ok: true});
  assert.equal(store.transaction(() => quota.reserve('job-2', {nexlev: 3})).ok, false);
  quota.settle('job-1', {nexlev: 5, youtube: 0});
  assert.equal(quota.summary().nexlev.used, 5);
  assert.equal(quota.summary().youtube.used, 0);
  assert.equal(store.transaction(() => quota.reserve('job-2', {nexlev: 3})).ok, true);
  quota.markUnknown('job-2');
  assert.equal(quota.summary().nexlev.used, 8, 'unknown outcomes stay counted');
  assert.match(youtubePeriod(), /^\d{4}-\d{2}-\d{2}$/);
});

test('competitor scan collects NexLev data, keeps YouTube data display-only and purges it after 30 days', async t => {
  const network = fakeNetwork();
  const {store, intel, family, ids, quota} = setup(t, network);
  assert.throws(() => intel.queueScan(family.id, {familyRevision: family.revision, requestedBy: 'Owner'}), /at least one tested data connector/);
  const scan = intel.queueScan(family.id, {familyRevision: family.revision, requestedBy: 'Owner', nexlevConnector: ids.nexlev, youtubeConnector: ids.youtube});
  assert.deepEqual(scan.scope.plannedUnits, {youtube: 9, nexlev: 9});
  assert.throws(() => intel.queueScan(family.id, {familyRevision: family.revision, requestedBy: 'Owner', nexlevConnector: ids.nexlev}), /already queued or running/);
  const done = await intel.processNextScan();
  assert.equal(done.status, 'completed');
  assert.equal(done.result.channels.length, 3);
  const first = done.result.channels[0];
  assert.equal(first.nexlev.videos.length, 6);
  assert.equal(first.nexlev.outliers[0].outlierScore, 4.5);
  assert.equal(first.nexlev.transcripts.length, 2);
  assert.ok(first.nexlev.transcripts[0].wordsPerMinute > 0);
  assert.equal(first.stats.source, 'nexlev', 'statistics never come from YouTube API data without approval');
  assert.equal(first.stats.videosAnalyzed, 6);
  assert.equal(first.youtube.videos[0].title, 'YouTube raw title A');
  assert.equal(done.result.channels[2].channelId, channelIds[2], '/user/ links resolve through YouTube');
  assert.equal(quota.summary().nexlev.used, 9);
  assert.equal(quota.summary().youtube.used, 9);
  assert.ok(done.youtubeExpiresAt > new Date(Date.now() + 29 * 86400000).toISOString());
  assert.equal(intel.purgeExpiredYouTubeData(new Date(Date.now() + 31 * 86400000)), 1);
  const purged = intel.publicScan(intel.scanRow(scan.id));
  assert.ok(purged.youtubePurgedAt);
  assert.deepEqual(purged.result.channels[0].youtube, {purged: true});
  assert.equal(purged.result.channels[0].nexlev.videos.length, 6, 'NexLev data is kept');
  // Display-only craft view: multiples over the channel median of recent uploads, never over YouTube data.
  const shown = intel.state().families[family.id].scans[0].result.channels[0];
  assert.equal(shown.craft.enough, true);
  assert.ok(shown.craft.median > 0);
  const views = first.nexlev.videos.map(video => video.views).sort((a, b) => a - b);
  assert.equal(shown.craft.median, Math.round((views[2] + views[3]) / 2), 'the median comes from recent uploads only');
  const top = first.nexlev.videos.reduce((best, video) => (video.views > best.views ? video : best));
  assert.equal(shown.craft.videos.find(item => item.videoId === top.videoId).multiple, Math.round(top.views / ((views[2] + views[3]) / 2) * 100) / 100);
  assert.ok(shown.craft.videos.every(item => 'formula' in item));
  assert.equal(shown.youtube.purged, true, 'YouTube data stays purged in the craft view');
  assert.equal(intel.purgeExpiredYouTubeData(new Date(Date.now() + 40 * 86400000)), 0);
  assert.ok(store.state().events.some(item => /Competitor scan completed/.test(item.message)));
});

test('handles without a YouTube connector produce a partial scan; over-cap scans are blocked before any call', async t => {
  const network = fakeNetwork();
  const {intel, family, ids, quota, store} = setup(t, network, {competitors: [channelIds[0], '@NeedsYouTube']});
  intel.queueScan(family.id, {familyRevision: family.revision, requestedBy: 'Owner', nexlevConnector: ids.nexlev});
  const partial = await intel.processNextScan();
  assert.equal(partial.status, 'partial');
  assert.match(partial.result.channels[1].errors.join(' '), /needs a tested YouTube connector/);
  quota.saveSettings({revision: 0, nexlevMonthlyRequestCap: 3, youtubeDailyUnitCap: 0});
  const updated = store.family(family.id);
  intel.queueScan(family.id, {familyRevision: updated.revision, requestedBy: 'Owner', nexlevConnector: ids.nexlev});
  const before = network.calls.length;
  assert.equal(await intel.processNextScan(), null);
  assert.equal(network.calls.length, before, 'no provider call after a quota block');
  assert.equal(intel.state().families[family.id].scans[0].status, 'blocked_quota');
});

test('Claude blueprint is validated, reviewed by a human and then drives style, voice and script guidance', async t => {
  const network = fakeNetwork({claudeContent: blueprint()});
  const {store, intel, family, ids, styles} = setup(t, network);
  intel.saveNote(family.id, {competitorKey: `channel_id:${channelIds[0].toLowerCase()}`, expectedRevision: 0, createdBy: 'Owner', editingStyle: 'Slow pans over archival maps with a ledger motif.', voice: 'Deep, calm narrator.'});
  intel.queueScan(family.id, {familyRevision: family.revision, requestedBy: 'Owner', nexlevConnector: ids.nexlev, youtubeConnector: ids.youtube});
  const scan = await intel.processNextScan();
  const queued = intel.queueAnalysis(family.id, {familyRevision: family.revision, scanId: scan.id, connector: ids.claude, requestedBy: 'Owner'});
  assert.equal(queued.status, 'queued');
  assert.ok(Object.keys(queued.refs).includes('N1'));
  const prompt = await (async () => { await intel.processNextAnalysis(); return network.calls.find(call => call.path === '/v1/messages').body; })();
  const userData = JSON.parse(prompt.messages[0].content.replace('UNTRUSTED COMPETITOR DATA:\n', ''));
  assert.equal(JSON.stringify(userData).includes('YouTube raw title'), false, 'YouTube API data is not sent to Claude without derived-use approval');
  assert.match(prompt.system, /at most 30%/);
  const analysis = intel.publicAnalysis(intel.analysisRow(queued.id));
  assert.equal(analysis.status, 'completed');
  assert.equal(analysis.quality.referenceSharePercent, 29);
  assert.equal(store.usageSummary(family.id).settledTokens, 4500, 'analysis tokens count against the family monthly limit');

  assert.equal(intel.scriptGuidance(family.id), null, 'guidance waits for human approval');
  assert.throws(() => intel.review(queued.id, {decision: 'approve', reviewer: 'Owner', confirmations: {techniquesNotCopied: true, balanceAccepted: true}}), /reviewed every recommendation/);
  intel.review(queued.id, {decision: 'approve', reviewer: 'Owner', confirmations: {techniquesNotCopied: true, balanceAccepted: true, recommendationsReviewed: true}});
  const guidance = intel.scriptGuidance(family.id);
  assert.deepEqual(guidance.hookPatterns, ['Open on a small object and ask who first trusted it']);
  assert.equal(intel.voiceDirection(family.id).pace, 1);

  const content = store.saveContent({familyId: family.id, title: 'Who trusted the first coin?', kind: 'fiction', angle: 'An invented market day shows why tokens needed trust.', hook, script, sources: [], rightsConfirmed: true});
  const job = store.queueScriptJob(content.id, {revision: content.revision, connectorId: ids.claude.id, connectorRevision: ids.claude.revision});
  assert.match(job.type, new RegExp(`:g${queued.id}$`));
  assert.equal(JSON.parse(job.input).promptInput.guidance.analysisId, queued.id);

  const draft = intel.createStyleDraft(queued.id, {createdBy: 'Owner'});
  assert.equal(draft.revision.status, 'draft');
  assert.deepEqual(draft.applied.map(item => item.setting), ['pacing.shotMaxSeconds', 'audio.musicMoods']);
  assert.equal(draft.skipped[0].setting, 'motion.intensity');
  const created = styles.profiles().find(item => item.id === draft.revision.profileId);
  assert.equal(created.origin, 'derived');
  assert.equal(created.revisions[0].spec.pacing.shotMaxSeconds, 9);
  assert.equal(created.revisions[0].spec.originality.referenceSharePercent, 29);
  assert.equal(intel.publicAnalysis(intel.analysisRow(queued.id)).applied[0].kind, 'style_draft');

  const changed = store.saveFamily({...store.family(family.id), countries: ['United States'], monthlyBudget: 50, monthlyTokenLimit: 500000, scriptTokenLimit: 8000, researchTokenLimit: 8000, locales: ['en-US'], competitors: [channelIds[0]], revision: store.family(family.id).revision}, family.id);
  assert.equal(changed.competitors.length, 1);
  assert.equal(intel.currentBlueprint(family.id).outdated, true);
  assert.equal(intel.scriptGuidance(family.id), null, 'an outdated blueprint no longer steers scripts');
});

test('blueprints that break the 30/70 rule, cite unknown evidence or copy wording never reach review', async t => {
  const refs = new Map([['C1', 'C1'], ['C2', 'C2'], ['V1', 'C1'], ['T1', 'C1']]), context = {refs, channelRefs: new Set(['C1', 'C2']), styleKeys: new Set(['documentary-montage'])};
  assert.ok(validateBlueprint(blueprint(), context));
  assert.throws(() => validateBlueprint(blueprint({adopt: [...blueprint().adopt, {area: 'voice', pattern: 'Copy the calm narrator', refs: ['C1']}]}), context), /owner rule allows at most 30%/);
  assert.throws(() => validateBlueprint(blueprint({opportunities: [{opportunity: 'Unknown evidence', refs: ['V99']}]}), context), /not supplied/);
  assert.throws(() => validateBlueprint(blueprint({editing: {...blueprint().editing, recommendedStyleKey: 'secret-style'}}), context), /not in the Style Library/);
  assert.throws(() => validateBlueprint(blueprint({editing: {...blueprint().editing, adjustments: [{setting: 'renderer.adapter', value: 'x', reason: 'Not allowed here.'}]}}), context), /unsupported style setting/);
  assert.throws(() => validateBlueprint(blueprint({confidence: {level: 'high', rationale: 'Only one channel cited.'}, opportunities: [{opportunity: 'Single source', refs: ['C1']}]}), context), /two competitor channels/);

  const copying = fakeNetwork({claudeContent: blueprint({summary: 'They invented tokens and tallies that recorded every promise, and so should we.'})});
  const {intel, family, ids} = setup(t, copying);
  intel.queueScan(family.id, {familyRevision: family.revision, requestedBy: 'Owner', nexlevConnector: ids.nexlev, youtubeConnector: ids.youtube});
  const scan = await intel.processNextScan();
  const queued = intel.queueAnalysis(family.id, {familyRevision: family.revision, scanId: scan.id, connector: ids.claude, requestedBy: 'Owner'});
  await intel.processNextAnalysis();
  const blocked = intel.publicAnalysis(intel.analysisRow(queued.id));
  assert.equal(blocked.status, 'quality_failed');
  assert.match(blocked.quality.issues[0], /repeats competitor wording/);
  assert.throws(() => intel.review(queued.id, {decision: 'approve', reviewer: 'Owner', confirmations: {techniquesNotCopied: true, balanceAccepted: true, recommendationsReviewed: true}}), /copy guard/);
});

test('interrupted scans and analyses are never replayed silently', async t => {
  const network = fakeNetwork({claudeContent: blueprint()});
  const {store, connectors, styles, quota, intel, family, ids} = setup(t, network);
  const scan = intel.queueScan(family.id, {familyRevision: family.revision, requestedBy: 'Owner', nexlevConnector: ids.nexlev});
  intel.claimScan();
  const restarted = new CompetitorIntelligence(store, connectors, quota, styles);
  assert.equal(restarted.publicScan(restarted.scanRow(scan.id)).status, 'interrupted');
  assert.throws(() => restarted.retryScan(scan.id, {}), /Confirm the deliberate retry/);
  assert.equal(restarted.retryScan(scan.id, {confirmInterrupted: true}).attempts, 2);
  const result = await restarted.processNextScan();
  assert.equal(result.status, 'completed');
  const analysis = restarted.queueAnalysis(family.id, {familyRevision: family.revision, scanId: scan.id, connector: ids.claude, requestedBy: 'Owner'});
  restarted.claimAnalysis();
  const again = new CompetitorIntelligence(store, connectors, quota, styles);
  assert.equal(again.publicAnalysis(again.analysisRow(analysis.id)).status, 'interrupted');
  assert.equal(store.usageSummary(family.id).reservedTokens, 40000, 'unknown token use stays reserved');
  assert.throws(() => again.retryAnalysis(analysis.id, {}), /Confirm the deliberate retry/);
  again.retryAnalysis(analysis.id, {confirmInterrupted: true});
  await again.processNextAnalysis();
  assert.equal(again.publicAnalysis(again.analysisRow(analysis.id)).status, 'completed');
  assert.equal(store.usageSummary(family.id).reservedTokens, 40000, 'the interrupted attempt is still counted separately');
});

function evaluation(extra = {}) {
  const rating = (value, refs = ['IDEA']) => ({rating: value, rationale: 'Grounded in the supplied discovery data.', refs});
  return {
    summary: 'Story-led money history has steady demand and room for a practical, modern angle.',
    positioning: 'Ancient money stories that end with one modern money habit.',
    ratings: {audienceDemand: rating(4, ['S1', 'A1']), differentiation: rating(4, ['C1']), episodeSupply: rating(5), productionFeasibility: rating(3, ['K1']), languageMarketFit: rating(4)},
    hardFilters: {rights: {pass: true, note: 'Stock and AI visuals with licences.'}, evidence: {pass: true, note: 'Two seeds and keyword data.'}, suitability: {pass: true, note: 'Advertiser friendly.'}, cost: {pass: true, note: 'Montage style is affordable.'}, originality: {pass: true, note: 'Distinct modern angle.'}},
    episodeIdeas: Array.from({length: 20}, (_, index) => `Episode ${index + 1}: ${['salt', 'shells', 'grain', 'cattle', 'beads', 'tally sticks', 'clay tokens', 'silver rings', 'bronze knives', 'cowries', 'paper notes', 'gold coins', 'banknotes', 'cheques', 'credit', 'ledgers', 'merchants', 'temples', 'debts', 'interest'][index]} as early money`),
    reasonsToReject: ['Crowded by large history channels.', 'Archival footage licensing can be costly.', 'Topic supply may repeat after a year.'],
    recommendedCompetitors: ['C1', 'C2'],
    recommendedStyleKey: 'documentary-montage',
    familyDraft: {name: 'Money Before Money', audience: 'Curious adults who enjoy history and personal finance.', niche: 'Origins of money with modern lessons', countries: ['United States', 'Canada'], format: 'long-form'},
    confidence: {level: 'medium', rationale: 'Discovery covered two seeds and one keyword.'},
    uncertainties: ['NexLev revenue figures are estimates.'],
    audience: {who: 'Curious adults who like money stories with a practical point.', wants: ['A clear origin story'], pains: ['Dry lectures'], staysFor: ['A modern habit at the end'], leavesWhen: ['Long intros']},
    gaps: [{gap: 'Nobody ends with a habit viewers can use today.', refs: ['C1'], howWeFill: 'Every episode closes on one modern money habit.'}, {gap: 'Few use maps to show where money travelled.', refs: ['K1'], howWeFill: 'Animated trade-route maps.'}, {gap: 'Little about everyday people, mostly kings.', refs: ['IDEA'], howWeFill: 'Stories told through ordinary traders.'}],
    howWeWin: 'Ancient money stories told through ordinary people, each ending with one habit to use today.',
    competitorNotes: [{ref: 'C1', strength: 'Strong openings.', weakness: 'No practical takeaway.'}],
    monetization: ['Budgeting app sponsors that fit a practical audience.', 'A printable money-history timeline.'],
    markets: [{language: 'English', strength: 'high', why: 'The largest audience for this topic and strong advertisers.'}, {language: 'Spanish', strength: 'medium', why: 'Fewer channels cover it, a growing audience.'}],
    countryTiers: [{tier: 1, countries: ['United States', 'United Kingdom'], why: 'High ad rates and a curious adult audience.'}],
    ages: {core: '25-44', also: '45-54', why: 'Adults with jobs and money questions watch practical history.'},
    viral: {chance: 'medium', why: 'Surprising origins travel well, but the topic is calm.', triggers: ['A surprising first line'], risks: ['A slow opening']},
    ...extra,
  };
}

test('Niche Factory: owner ideas, NexLev discovery, rubric score in code, hard filters and family link', async t => {
  const network = fakeNetwork({claudeContent: evaluation()});
  const {store, niches, ids} = setup(t, network);
  assert.throws(() => niches.saveIdea({title: 'x', description: 'short', formats: ['long-form'], createdBy: 'Owner'}), /Niche title/);
  const idea = niches.saveIdea({title: 'Origins of money', description: 'Story-led explainers about how money began and what it teaches today.', audience: 'Curious adults', countries: ['United States'], formats: ['long-form'], keywords: ['history of money'], seedChannels: [channelIds[0]], createdBy: 'Owner'});
  assert.throws(() => niches.queueDiscovery(idea.id, {ideaRevision: idea.revision, requestedBy: 'Owner'}), /NexLev/);
  const queued = niches.queueDiscovery(idea.id, {ideaRevision: idea.revision, requestedBy: 'Owner', nexlevConnector: ids.nexlev});
  assert.deepEqual(queued.scope.plannedUnits, {nexlev: 18, youtube: 0}, '2 per seed, 1 per keyword, 3 estimates and 12 recent-growth checks');
  const discovery = await niches.processNextDiscovery();
  assert.equal(discovery.status, 'completed');
  assert.equal(discovery.result.seeds[0].overview.niche, 'Economic history explainers');
  assert.deepEqual(discovery.result.channels.map(item => item.channelId), [channelIds[2], channelIds[1], channelIds[0]], 'channels found by several routes rank first; the seed itself is a candidate');
  assert.equal(discovery.result.rising.length, 3, 'every channel uploaded twice or more in the last 90 days');
  assert.equal(discovery.result.channels[0].momentum.uploads, 6);
  assert.equal(discovery.result.analytics[0].estimatedMonthlyRevenue, 3400);
  assert.equal(discovery.result.analytics[0].label, 'NexLev estimate');
  assert.equal(discovery.result.keywords[0].videos[0].title, 'The first coins ever minted');

  const job = niches.queueEvaluation(idea.id, {ideaRevision: idea.revision, discoveryId: discovery.id, connector: ids.claude, requestedBy: 'Owner'});
  await niches.processNextEvaluation();
  const evaluated = niches.publicEvaluation(niches.evaluationRow(job.id));
  assert.equal(evaluated.status, 'completed');
  assert.equal(evaluated.score, 81, 'blueprint example 4,4,5,3,4 scores 81/100');
  assert.equal(evaluated.decision, 'strong');
  assert.deepEqual(evaluated.result.recommendedCompetitorChannels.map(item => item.channelId), [channelIds[2], channelIds[1]]);
  assert.equal(niches.tokenSummary().settled, 4500);
  assert.throws(() => niches.linkFamily(job.id, {familyId: 'x'.repeat(36)}), /Approve the niche/);
  assert.throws(() => niches.review(job.id, {decision: 'approve', reviewer: 'Owner', confirmations: {evidenceReviewed: true}}), /estimates/);
  niches.review(job.id, {decision: 'approve', reviewer: 'Owner', confirmations: {evidenceReviewed: true, estimatesUnderstood: true}});
  const family = store.saveFamily({name: 'Money Before Money', tier: 'A', countries: ['United States'], audience: 'Curious adults who enjoy history and personal finance.', locales: ['en-US'], timezone: 'Asia/Karachi', monthlyBudget: 0, cadence: 2, format: 'long-form'});
  assert.equal(niches.linkFamily(job.id, {familyId: family.id}).review.familyId, family.id);
  assert.throws(() => niches.review(job.id, {decision: 'reject', reviewer: 'Owner', notes: 'Changed my mind later.'}), /locked/);
  assert.equal(scoreRatings({audienceDemand: {rating: 5}, differentiation: {rating: 5}, episodeSupply: {rating: 5}, productionFeasibility: {rating: 5}, languageMarketFit: {rating: 5}}), 100);
  assert.equal(decisionFor(95, {rights: {pass: false}, evidence: {pass: true}, suitability: {pass: true}, cost: {pass: true}, originality: {pass: true}}), 'do_not_produce');
});

test('Niche evaluations: a failed hard filter blocks approval; duplicate or copied episode ideas are rejected', async t => {
  const ideaOnly = {ratings: Object.fromEntries(Object.entries(evaluation().ratings).map(([key, value]) => [key, {...value, refs: ['IDEA']}])), recommendedCompetitors: [], competitorNotes: [], gaps: evaluation().gaps.map(item => ({...item, refs: ['IDEA']}))};
  const failing = fakeNetwork({claudeContent: evaluation({...ideaOnly, hardFilters: {...evaluation().hardFilters, rights: {pass: false, note: 'Relies on copyrighted film clips.'}}})});
  const {niches, ids} = setup(t, failing);
  const idea = niches.saveIdea({title: 'Movie money moments', description: 'Explaining money scenes from famous films and shows.', formats: ['long-form'], keywords: ['movie money scenes'], createdBy: 'Owner'});
  const job = niches.queueEvaluation(idea.id, {ideaRevision: idea.revision, connector: ids.claude, requestedBy: 'Owner'});
  await niches.processNextEvaluation();
  const result = niches.publicEvaluation(niches.evaluationRow(job.id));
  assert.equal(result.decision, 'do_not_produce');
  assert.throws(() => niches.review(job.id, {decision: 'approve', reviewer: 'Owner', confirmations: {evidenceReviewed: true, estimatesUnderstood: true}}), /hard filter failed/);
  assert.equal(niches.review(job.id, {decision: 'reject', reviewer: 'Owner', notes: 'Rights risk is too high.'}).review.decision, 'rejected');

  const dupes = fakeNetwork({claudeContent: evaluation({...ideaOnly, episodeIdeas: Array.from({length: 20}, () => 'Why salt was the first money')})});
  const second = setup(t, dupes);
  const other = second.niches.saveIdea({title: 'Salt economy', description: 'How salt shaped trade and taxes across empires.', formats: ['long-form'], keywords: ['salt trade'], createdBy: 'Owner'});
  const dupJob = second.niches.queueEvaluation(other.id, {ideaRevision: other.revision, connector: second.ids.claude, requestedBy: 'Owner'});
  await second.niches.processNextEvaluation();
  const dup = second.niches.publicEvaluation(second.niches.evaluationRow(dupJob.id));
  assert.equal(dup.status, 'quality_failed');
  assert.match(dup.quality.issues[0], /near-duplicate/);
});

test('HTTP routes for intelligence require the local token and expose state', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'control-room-intel-'));
  const {server} = createApp({dataFile: path.join(dir, 'workspace.sqlite'), worker: false, protector, providerFetch: fakeNetwork().fetch, voiceOptions: {ffmpeg: 'missing-ffmpeg', ffprobe: 'missing-ffprobe'}});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(() => { fs.rmSync(dir, {recursive: true, force: true}); resolve(); }); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const state = await (await fetch(`${base}/api/state`)).json();
  assert.deepEqual(Object.keys(state.intelligence), ['competitors', 'niches', 'trends']);
  assert.ok(state.connectorProviders.nexlev);
  assert.equal((await fetch(`${base}/intelligence.js`)).status, 200);
  const send = (url, body, token = state.token) => fetch(base + url, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Local-Token': token}, body: JSON.stringify(body)});
  assert.equal((await send('/api/quota-settings', {revision: 0, nexlevMonthlyRequestCap: 100, youtubeDailyUnitCap: 500}, 'bad')).status, 403);
  assert.equal((await send('/api/quota-settings', {revision: 0, nexlevMonthlyRequestCap: 100, youtubeDailyUnitCap: 500})).status, 200);
  const idea = await send('/api/niche-ideas', {title: 'Origins of money', description: 'Story-led explainers about how money began.', formats: ['long-form'], keywords: ['money history'], createdBy: 'Owner'});
  assert.equal(idea.status, 200);
  const created = await idea.json();
  const discovery = await send(`/api/niche-ideas/${created.id}/discoveries`, {ideaRevision: created.revision, requestedBy: 'Owner'});
  assert.equal(discovery.status, 400);
  assert.match((await discovery.json()).error, /NexLev/);
});

test('0.65 read in one go: finer subjects per channel, and one click scans then asks Claude for the blueprint', async t => {
  const original = (area, count) => Array.from({length: count}, (_, index) => ({area, contribution: `Our own ${area} idea number ${index + 1} for this family`}));
  const network = fakeNetwork({claudeContent: blueprint({adopt: [{area: 'editing', pattern: 'Cut on the beat of each list item', refs: ['C1']}], original: [...original('script', 3), ...original('visuals', 3), ...original('editing', 3), ...original('voice', 1), ...original('packaging', 1)]})});
  const {intel, family, ids} = setup(t, network);
  const a = `channel_id:${channelIds[0].toLowerCase()}`;
  const saved = intel.savePicks(family.id, {expectedRevision: 0, createdBy: 'Owner', picks: {[a]: ['captions', 'pacing', 'look', 'hooks']}});
  assert.deepEqual(saved.picks[a], ['hooks', 'pacing', 'captions', 'look'], 'subjects keep their fixed order');
  assert.throws(() => intel.queueScan(family.id, {familyRevision: family.revision, requestedBy: 'Owner', nexlevConnector: ids.nexlev, claudeConnector: {id: ids.claude.id, revision: ids.claude.revision + 7}}), /Claude connector is missing, changed or not tested/);
  const scan = intel.queueScan(family.id, {familyRevision: family.revision, requestedBy: 'Owner', nexlevConnector: ids.nexlev, claudeConnector: ids.claude});
  assert.deepEqual(scan.scope.then, {id: ids.claude.id, revision: ids.claude.revision});
  await intel.processNextScan();
  // The scan's end queued Claude's analysis by itself, inside its own token reservation.
  const queued = intel.state().families[family.id].analyses[0];
  assert.ok(queued && queued.scanId === scan.id && queued.createdBy === 'Owner', JSON.stringify(intel.state().families[family.id].analyses));
  assert.deepEqual(queued.blend.areaSources, {script: ['C1'], voice: [], editing: ['C1'], visuals: ['C1'], packaging: []}, 'a channel counts once per area, however many subjects');
  await intel.processNextAnalysis();
  const sent = JSON.parse(network.calls.find(call => call.path === '/v1/messages').body.messages[0].content.replace('UNTRUSTED COMPETITOR DATA:\n', ''));
  assert.deepEqual(sent.channels.find(item => item.ref === 'C1').ownerWantsToLearn, ['Hooks and openings', 'Pacing and cuts', 'Captions and on-screen words', 'Colours and look'], 'Claude hears each subject the owner liked');
  assert.equal(intel.publicAnalysis(intel.analysisRow(queued.id)).status, 'completed');
});

test('blend picks: each competitor link chooses what to learn, every area learns only from its picks and keeps 30/70', async t => {
  const original = (area, count) => Array.from({length: count}, (_, index) => ({area, contribution: `Our own ${area} idea number ${index + 1} for this family`}));
  const blended = () => blueprint({
    adopt: [{area: 'script', pattern: 'Open on a tangible object before the history', refs: ['C1', 'T1']}, {area: 'visuals', pattern: 'Use maps to show trade routes', refs: ['V1']}, {area: 'editing', pattern: 'Hold archival stills a little longer', refs: ['C2']}],
    original: [...original('script', 3), ...original('visuals', 3), ...original('editing', 3), ...original('voice', 1), ...original('packaging', 1)],
  });
  const network = fakeNetwork({claudeContent: blended()});
  const {intel, family, ids} = setup(t, network);
  const [a, b] = [`channel_id:${channelIds[0].toLowerCase()}`, `channel_id:${channelIds[1].toLowerCase()}`];
  assert.throws(() => intel.savePicks(family.id, {expectedRevision: 0, createdBy: 'Owner', picks: {'handle:@stranger': ['voice']}}), /not in this family/);
  assert.throws(() => intel.savePicks(family.id, {expectedRevision: 0, createdBy: 'Owner', picks: {[a]: ['sparkle']}}), /Choose from: Voice-over, Narration, Hooks and openings/);
  const saved = intel.savePicks(family.id, {expectedRevision: 0, createdBy: 'Owner', picks: {[a]: ['visuals', 'narration'], [b]: ['editing']}});
  assert.equal(saved.revision, 1);
  assert.deepEqual(saved.picks[a], ['narration', 'visuals'], 'traits are stored in a fixed order');
  assert.throws(() => intel.savePicks(family.id, {expectedRevision: 0, createdBy: 'Owner', picks: {}}), /another tab/);

  intel.queueScan(family.id, {familyRevision: family.revision, requestedBy: 'Owner', nexlevConnector: ids.nexlev});
  const scan = await intel.processNextScan();
  const queued = intel.queueAnalysis(family.id, {familyRevision: family.revision, scanId: scan.id, connector: ids.claude, requestedBy: 'Owner'});
  assert.deepEqual(queued.blend.areaSources, {script: ['C1'], voice: [], editing: ['C2'], visuals: ['C1'], packaging: []});
  assert.deepEqual(queued.blend.ownAreas, ['voice', 'packaging']);
  await intel.processNextAnalysis();
  const chat = network.calls.find(call => call.path === '/v1/messages').body;
  assert.match(chat.system, /may only use an area that has picked channels/);
  const sent = JSON.parse(chat.messages[0].content.replace('UNTRUSTED COMPETITOR DATA:\n', ''));
  assert.deepEqual(sent.channels.find(item => item.ref === 'C1').ownerWantsToLearn, ['Narration', 'Visuals']);
  const analysis = intel.publicAnalysis(intel.analysisRow(queued.id));
  assert.equal(analysis.status, 'completed', JSON.stringify(analysis.quality));
  assert.equal(analysis.quality.areaShares.script, 25);
  assert.equal(analysis.quality.areaShares.voice, 0);

  const context = {refs: new Map(Object.entries(queued.refs)), channelRefs: new Set(['C1', 'C2', 'C3']), styleKeys: new Set(['documentary-montage']), blend: queued.blend};
  assert.throws(() => validateBlueprint({...blended(), adopt: [...blended().adopt, {area: 'voice', pattern: 'Use a calm narrator', refs: ['C1']}], original: [...blended().original, ...original('voice', 3)]}, context), /no competitor was picked for that area/);
  assert.throws(() => validateBlueprint({...blended(), adopt: [{area: 'editing', pattern: 'Hold stills longer', refs: ['C1']}]}, context), /C1 for editing, but that channel was not picked/);
  assert.throws(() => validateBlueprint({...blended(), original: [...original('script', 1), ...original('visuals', 3), ...original('editing', 3), ...original('voice', 3)]}, context), /script area adopts 1 pattern\(s\) against 1/);

  intel.review(queued.id, {decision: 'approve', reviewer: 'Owner', confirmations: {techniquesNotCopied: true, balanceAccepted: true, recommendationsReviewed: true}});
  assert.ok(intel.scriptGuidance(family.id));
  assert.deepEqual(intel.packagingBrief(family.id).learnedFrom, []);
  intel.savePicks(family.id, {expectedRevision: 1, createdBy: 'Owner', picks: {[a]: ['voice']}});
  const current = intel.currentBlueprint(family.id);
  assert.equal(current.outdated, true);
  assert.match(current.outdatedReason, /blend picks changed/);
  assert.equal(intel.scriptGuidance(family.id), null);
});
