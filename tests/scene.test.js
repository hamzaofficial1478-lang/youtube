'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const {Store} = require('../store');
const {ConnectorSlots} = require('../connectors');
const {StyleLibrary} = require('../style');
const {QuotaLedger} = require('../intel-sources');
const VS = require('../visual-sources');
const {SceneRoom, splitSentences, timeSentences, keywords} = require('../scene-room');
const {createApp} = require('../server');

const hasFFmpeg = (() => { try { execFileSync('ffprobe', ['-version'], {stdio: 'ignore'}); execFileSync('ffmpeg', ['-version'], {stdio: 'ignore'}); return true; } catch { return false; } })();
const skip = hasFFmpeg ? false : 'FFmpeg/ffprobe are not installed on this machine';
const protector = {transform: (operation, input) => Buffer.from([...input].reverse())};
const KEYS = {pexels: 'pexels-fixture-key-0123456789', pixabay: 'pixabay-fixture-key-0123456789', openai: 'openai-fixture-key-0123456789abcdef', hermes: 'hermes-fixture-key-0123456789abcdef'};
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json', ...headers}});
const media = {};
function mediaFixtures() {
  if (media.png || !hasFFmpeg) return media;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scene-media-'));
  const make = (name, args) => { const file = path.join(dir, name); execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args, '-y', file]); return fs.readFileSync(file); };
  media.png = make('still.png', ['-f', 'lavfi', '-i', 'color=c=0x336699:s=1536x1024', '-frames:v', '1']);
  media.jpg = make('photo.jpg', ['-f', 'lavfi', '-i', 'testsrc=size=1920x1280', '-frames:v', '1']);
  media.preview = make('preview.jpg', ['-f', 'lavfi', '-i', 'color=c=0x996633:s=320x200', '-frames:v', '1']);
  media.mp4 = make('clip.mp4', ['-f', 'lavfi', '-i', 'testsrc=size=1920x1080:rate=30', '-t', '3', '-c:v', 'mpeg4', '-q:v', '8']);
  fs.rmSync(dir, {recursive: true, force: true});
  return media;
}

// 60 sentences of 12 words in 4 paragraphs: a valid long-form script.
const hook = 'Every coin in your pocket began as a quiet promise between strangers.';
const sentence = n => `Traders in market ${n} kept careful clay records of every promise made.`;
const script = [0, 1, 2, 3].map(p => (p === 0 ? [hook] : []).concat(Array.from({length: p === 0 ? 14 : 15}, (_, i) => sentence(p * 15 + i + 1))).join(' ')).join('\n\n');

function blueprintPlan(sentenceCount, extra = {}) {
  const scenes = [];
  for (let start = 1; start <= sentenceCount; start += 2) {
    const end = Math.min(sentenceCount, start + 1);
    scenes.push({sentenceStart: start, sentenceEnd: end, purpose: start === 1 ? 'hook' : 'explain', direction: 'Show the record keeping clearly.', onScreenText: start === 1 ? 'A promise' : '',
      shots: [{source: 'stock-video', query: 'clay tablet market', prompt: '', motion: 'static', notes: ''}, {source: 'stock-image', query: 'ancient market', prompt: '', motion: 'ken-burns', notes: ''}]});
  }
  return {summary: 'Two shots per pair of sentences, stock first.', scenes, ...extra};
}

function fakeNetwork({hermesPlan = null, hermesUsage = {prompt_tokens: 9000, completion_tokens: 4000, total_tokens: 13000}, openaiStatus = 200, failChat = false} = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const target = new URL(String(url));
    calls.push({host: target.host, path: target.pathname, query: Object.fromEntries(target.searchParams), headers: options.headers || {}, body: options.body ? JSON.parse(options.body) : null, redirect: options.redirect});
    if (target.origin === 'https://api.pexels.com') {
      assert.equal(options.headers.Authorization, KEYS.pexels);
      if (target.pathname === '/v1/search') return json({photos: [
        {id: 101, width: 6000, height: 4000, url: 'https://www.pexels.com/photo/clay-101/', photographer: 'Ana', photographer_url: 'https://www.pexels.com/@ana', alt: 'Clay tablet on a table', src: {original: 'https://images.pexels.com/photos/101/original.jpeg', medium: 'https://images.pexels.com/photos/101/medium.jpeg'}},
        {id: 102, width: 10, height: 10, url: 'https://www.pexels.com/photo/x/', photographer: 'Bad', src: {original: 'https://evil.example/x.jpg', medium: 'https://evil.example/m.jpg'}},
      ]}, 200, {'x-ratelimit-remaining': '199'});
      if (target.pathname === '/v1/videos/search') return json({videos: [{id: 201, width: 3840, height: 2160, url: 'https://www.pexels.com/video/market-scene-201/', duration: 3, image: 'https://images.pexels.com/videos/201/preview.jpeg', user: {name: 'Ben', url: 'https://www.pexels.com/@ben'},
        video_files: [{link: 'https://videos.pexels.com/video-files/201/sd.mp4', width: 640, height: 360, file_type: 'video/mp4'}, {link: 'https://videos.pexels.com/video-files/201/hd.mp4', width: 1920, height: 1080, file_type: 'video/mp4'}, {link: 'https://videos.pexels.com/video-files/201/uhd.mp4', width: 3840, height: 2160, file_type: 'video/mp4'}]}]});
    }
    if (target.origin === 'https://pixabay.com' && target.pathname.startsWith('/api/')) {
      assert.equal(target.searchParams.get('key'), KEYS.pixabay);
      return json({hits: [{id: 301, pageURL: 'https://pixabay.com/photos/coins-301/', tags: 'coins, old, money', webformatURL: 'https://pixabay.com/get/301_640.jpg', largeImageURL: 'https://pixabay.com/get/301_1280.jpg', imageWidth: 4000, imageHeight: 2600, user: 'carol', user_id: 7}]});
    }
    if (['images.pexels.com', 'videos.pexels.com', 'pixabay.com'].includes(target.host)) {
      const fixtures = mediaFixtures();
      const body = target.pathname.endsWith('.mp4') ? fixtures.mp4 : /medium|preview|_640/.test(target.pathname) ? fixtures.preview : fixtures.jpg;
      return new Response(body, {status: 200, headers: {'content-length': String(body.length)}});
    }
    if (target.origin === 'https://api.openai.com') {
      assert.equal(options.headers.Authorization, `Bearer ${KEYS.openai}`);
      if (target.pathname === '/v1/models') return json({data: []});
      if (openaiStatus !== 200) return json({error: {message: 'nope'}}, openaiStatus);
      return json({created: 1, data: [{b64_json: mediaFixtures().png.toString('base64'), revised_prompt: 'A blue field'}], usage: {input_tokens: 20, output_tokens: 1000, total_tokens: 1020}}, 200, {'x-request-id': 'req_fixture'});
    }
    if (target.origin === 'http://127.0.0.1:8642') {
      if (target.pathname === '/v1/capabilities') return json({auth: {type: 'bearer', required: true}, features: {chat_completions: true}});
      if (target.pathname === '/v1/toolsets') return json([]);
      if (target.pathname === '/v1/chat/completions') {
        if (failChat) throw new Error('socket hang up');
        const body = JSON.parse(options.body), input = JSON.parse(body.messages[1].content);
        const plan = typeof hermesPlan === 'function' ? hermesPlan(input) : hermesPlan;
        return json({choices: [{message: {content: typeof plan === 'string' ? plan : JSON.stringify(plan)}}], usage: hermesUsage});
      }
    }
    throw new Error(`Unexpected request to ${url}`);
  };
  return {fetch: fetchImpl, calls};
}

function setup(t, network = fakeNetwork(), {format = 'long-form', withVoice = true, withStyle = true} = {}) {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scene-room-'));
  const store = new Store(':memory:', {artifactRoot: dataRoot});
  t.after(() => { store.close(); fs.rmSync(dataRoot, {recursive: true, force: true}); });
  const connectors = new ConnectorSlots(store, protector, network.fetch);
  const make = provider => {
    const slot = connectors.save({name: `${provider} fixture`, provider, notes: '', key: KEYS[provider]});
    const row = connectors.row(slot.id), payload = JSON.parse(row.payload);
    payload.test = {status: 'passed', at: new Date().toISOString(), message: 'fixture'};
    store.db.prepare('UPDATE connectors SET payload=? WHERE id=?').run(JSON.stringify(payload), slot.id);
    return {id: slot.id, revision: slot.revision};
  };
  const ids = {pexels: make('pexels'), pixabay: make('pixabay'), openai: make('openai'), hermes: make('hermes')};
  const styles = new StyleLibrary(store), quota = new QuotaLedger(store);
  const family = store.saveFamily({name: 'Money History', tier: 'A', countries: ['United States'], audience: 'Curious adults who like money history told as stories.', niche: 'Origins of money', locales: ['en-US'], timezone: 'Asia/Karachi', monthlyBudget: 50, cadence: 2, format, monthlyTokenLimit: 500000, scriptTokenLimit: 8000, researchTokenLimit: 8000, competitors: ['@CoinOrigins']});
  let content = store.saveContent({familyId: family.id, title: 'How promises became money', kind: 'fiction', angle: 'Follow invented market towns as they learn to record trust.', hook, script, sources: [], rightsConfirmed: true});
  store.reviewContent(content.id, {revision: content.revision, action: 'submit'});
  content = store.reviewContent(content.id, {revision: content.revision, action: 'approve'});
  let approval = null;
  if (withStyle) {
    const montage = styles.profiles().find(item => item.key === 'documentary-montage').revisions.at(-1);
    styles.approveRevision(montage.id, {approvedBy: 'Owner', notes: 'Fixture.', confirmations: {specReviewed: true, rightsReviewed: true, originalityReviewed: true}});
    styles.assign(family.id, {familyRevision: store.family(family.id).revision, assignedBy: 'Owner', reason: 'Stock and AI visuals suit this family.', revisionId: montage.id, expectedAssignmentId: null});
  }
  const narrate = (seconds = 270) => {
    const profile = store.voiceProfiles().filter(item => item.familyId === family.id).at(-1) || store.saveVoiceProfile(family.id, {revision: 0, familyRevision: store.family(family.id).revision, name: 'Narrator', connectorId: ids.openai.id, connectorRevision: ids.openai.revision, provider: 'openai', model: 'gpt-4o-mini-tts', voiceId: 'alloy', voiceVersion: 'current', ownershipBasis: 'provider_stock_voice', rightsHolder: 'Provider catalog', consentConfirmed: true, commercialUseConfirmed: true, evidenceReference: 'Terms reviewed by the owner.', termsReviewedAt: '2026-09-19', pace: 1, energy: 55, emotion: 'warm', pauseScale: 1, emphasis: 50, instructions: 'Warm delivery.', lexicon: [], monthlyCharacterLimit: 1000000, maxCharactersPerAudition: 20000, priceCentsPerMillionCharacters: 1500});
    const job = store.queueVoiceAudition(content.id, {contentRevision: content.revision, profileId: profile.id, profileRevision: profile.revision, connectorId: ids.openai.id, connectorRevision: ids.openai.revision});
    const claimed = store.claimVoiceAudition();
    const relativePath = `voice-artifacts/${job.id}.wav`, bytes = Buffer.alloc(32000, seconds % 7);
    fs.mkdirSync(path.join(dataRoot, 'voice-artifacts'), {recursive: true});
    fs.writeFileSync(path.join(dataRoot, relativePath), bytes);
    const audition = store.completeVoiceAudition(job.id, {artifact: {relativePath, sha256: createHash('sha256').update(bytes).digest('hex'), sizeBytes: bytes.length, mime: 'audio/wav'}, analysis: {passed: true, durationSeconds: seconds, silenceRatio: 0.05, checks: []}, provider: {requestIds: [], model: 'gpt-4o-mini-tts', voiceId: 'alloy', voiceVersion: 'current'}, settledCharacters: claimed.scope.characterCount});
    approval = store.selectVoiceAudition(audition.id, {approvedBy: 'Owner', comparisonNotes: 'Compared the complete narration for pacing and clarity.', intelligibilityConfirmed: true});
    return approval;
  };
  if (withVoice) narrate();
  const room = new SceneRoom(store, connectors, quota, styles, {dataRoot});
  return {store, connectors, styles, quota, room, family, content, ids, network, dataRoot, narrate};
}
const latestManifest = (room, contentId) => room.state().contents.find(item => item.contentId === contentId).manifests.find(item => item.latest);
const approvePlan = (room, manifest) => room.reviewManifest(manifest.id, {decision: 'approve', reviewer: 'Owner', notes: '', confirmations: {coverageReviewed: true, directionReviewed: true}});
const shots = manifest => manifest.plan.scenes.flatMap(scene => scene.shots);
async function drain(room) { for (let i = 0; i < 200; i++) { const busy = room.db.prepare("SELECT 1 FROM visual_jobs WHERE status='queued'").get(); if (!busy) return; await room.processNextVisual(); } }

test('sentences, word-share timing and keywords handle punctuation, short fragments and other scripts', () => {
  const sentences = splitSentences('Money began as trust. In the U.S. it changed! Did it? Yes.\n\nNew paragraph without a stop', 'en-US');
  assert.deepEqual(sentences.map(item => item.text), ['Money began as trust.', 'In the U.S. it changed!', 'Did it? Yes.', 'New paragraph without a stop']);
  const urdu = splitSentences('پیسہ اعتماد سے شروع ہوا۔ کیا یہ سچ ہے؟ ہاں یہ سچ ہے۔', 'ur-PK');
  assert.equal(urdu.length, 3);
  const timed = timeSentences([{n: 1, text: 'a b', words: 2}, {n: 2, text: 'c d e f', words: 4}], 12);
  assert.deepEqual(timed.map(item => [item.startSeconds, item.durationSeconds]), [[0, 4], [4, 8]]);
  assert.equal(keywords('Traders kept careful clay records. Clay records kept trust between traders.', 'en-US'), 'traders clay records');
  assert.equal(keywords('the a of', 'en-US', 'Origins of money'), 'origins of money');
});

test('stock and AI adapters use fixed origins, header keys, allowlisted media hosts and never retry', async () => {
  const network = fakeNetwork();
  const pexels = new VS.PexelsClient(KEYS.pexels, network.fetch);
  const photos = await pexels.search({capabilityId: 'pexels-photo', query: 'clay tablet', format: 'long-form', perPage: 12});
  assert.equal(photos.candidates.length, 1, 'a candidate with a non-allowlisted media host is dropped');
  assert.equal(photos.candidates[0].downloadUrl, 'https://images.pexels.com/photos/101/original.jpeg');
  assert.equal(photos.rateLimit.remaining, 199);
  assert.deepEqual(network.calls[0].query, {query: 'clay tablet', orientation: 'landscape', per_page: '12'});
  assert.equal(network.calls[0].redirect, 'error');
  const videos = await pexels.search({capabilityId: 'pexels-video', query: 'market', format: 'long-form', perPage: 5});
  assert.equal(videos.candidates[0].downloadUrl, 'https://videos.pexels.com/video-files/201/hd.mp4', 'smallest MP4 at or above 1080p');
  const portrait = await new VS.PixabayClient(KEYS.pixabay, network.fetch).search({capabilityId: 'pixabay-photo', query: 'coins', format: 'shorts', perPage: 3, locale: 'ur-PK'});
  assert.equal(portrait.candidates[0].authorUrl, 'https://pixabay.com/users/carol-7/');
  const pixabayCall = network.calls.at(-1);
  assert.equal(pixabayCall.query.orientation, 'vertical');
  assert.equal(pixabayCall.query.lang, 'en', 'unsupported languages fall back to English');
  assert.equal(pixabayCall.query.safesearch, 'true');
  await assert.rejects(new VS.PexelsClient(KEYS.pexels, async () => json({}, 429)).search({capabilityId: 'pexels-photo', query: 'x'}), /rate limit/);
  await assert.rejects(new VS.PexelsClient(KEYS.pexels, async () => json({}, 401)).search({capabilityId: 'pexels-photo', query: 'x'}), /rejected the API key/);
  assert.equal(VS.validImageModel('gpt-image-2.5-flare-2026-09-08'), true);
  assert.equal(VS.validImageModel('dall-e-3'), false);
  assert.equal(VS.mediaUrl('https://images.pexels.com.evil.example/x.jpg'), null);
  assert.equal(VS.mediaUrl('http://images.pexels.com/x.jpg'), null);
  assert.deepEqual(VS.executableSources(['ai-video', 'stock-video', 'maps-and-diagrams', 'ai-image']), ['stock-video', 'ai-image']);
});

test('downloads refuse other hosts, oversize or mislabelled files; ffprobe evidence and thumbnails are real', {skip}, async t => {
  const fixtures = mediaFixtures(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scene-dl-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const serve = (body, extra = {}) => async () => Object.assign(new Response(body, {status: 200}), extra);
  await assert.rejects(VS.downloadTo(serve(fixtures.jpg), 'https://evil.example/a.jpg', path.join(dir, 'a'), {maxBytes: 1e7, accept: ['image/jpeg']}), /not an allowed/);
  const redirected = async () => { const response = new Response(fixtures.jpg); Object.defineProperty(response, 'url', {value: 'https://evil.example/b.jpg'}); return response; };
  await assert.rejects(VS.downloadTo(redirected, 'https://images.pexels.com/b.jpg', path.join(dir, 'b'), {maxBytes: 1e7, accept: ['image/jpeg']}), /redirected outside/);
  await assert.rejects(VS.downloadTo(serve(fixtures.jpg), 'https://images.pexels.com/c.jpg', path.join(dir, 'c'), {maxBytes: 100, accept: ['image/jpeg']}), /larger than/);
  assert.equal(fs.existsSync(path.join(dir, 'c')), false, 'a partial file is removed');
  await assert.rejects(VS.downloadTo(serve(Buffer.from('<html>not an image</html>')), 'https://images.pexels.com/d.jpg', path.join(dir, 'd'), {maxBytes: 1e7, accept: ['image/jpeg']}), /not an accepted/);
  const saved = await VS.downloadTo(serve(fixtures.mp4), 'https://videos.pexels.com/e.mp4', path.join(dir, 'e.mp4'), {maxBytes: 1e8, accept: ['video/mp4']});
  assert.equal(saved.sha256, createHash('sha256').update(fixtures.mp4).digest('hex'));
  const probe = await VS.probeMedia(path.join(dir, 'e.mp4'));
  assert.equal(probe.kind, 'video');
  assert.deepEqual([probe.width, probe.height], [1920, 1080]);
  assert.ok(Math.abs(probe.durationSeconds - 3) < 0.2);
  fs.writeFileSync(path.join(dir, 'f.png'), fixtures.png);
  assert.deepEqual(await VS.probeMedia(path.join(dir, 'f.png')).then(item => [item.kind, item.width, item.height]), ['image', 1536, 1024]);
  await VS.makeThumbnail(path.join(dir, 'e.mp4'), path.join(dir, 'thumbs', 'e.jpg'), {video: true, at: 1});
  assert.ok(fs.statSync(path.join(dir, 'thumbs', 'e.jpg')).size > 100);
  const openai = await new VS.OpenAIImageClient(KEYS.openai, fakeNetwork().fetch).generate({model: 'gpt-image-2', prompt: 'A blue field of clay tablets', size: '1536x1024', quality: 'low', outputFormat: 'png'});
  assert.equal(openai.mime, 'image/png');
  assert.equal(openai.requestId, 'req_fixture');
  await assert.rejects(new VS.OpenAIImageClient(KEYS.openai, async () => json({data: [{b64_json: Buffer.from('not an image at all, just text that is long enough to pass the length check..................................................').toString('base64')}]})).generate({model: 'gpt-image-2', prompt: 'x'.repeat(20), size: '1536x1024', quality: 'low', outputFormat: 'png'}), /not a PNG or JPEG/);
});

test('inputs gate planning; the free narration split covers every sentence within the style limits and is immutable', t => {
  const blocked = setup(t, fakeNetwork(), {withVoice: false});
  const inputs = blocked.room.inputs(blocked.content);
  assert.equal(inputs.ready, false);
  assert.match(inputs.blockers.join(' '), /narration/i);
  assert.throws(() => blocked.room.createPlan(blocked.content.id, {mode: 'rules', requestedBy: 'Owner', contentRevision: blocked.content.revision}), /narration/i);

  const {room, content, store} = setup(t);
  assert.throws(() => room.createPlan(content.id, {mode: 'rules', requestedBy: 'Owner', contentRevision: content.revision + 1}), /another tab/);
  const {manifest} = room.createPlan(content.id, {mode: 'rules', requestedBy: 'Owner', contentRevision: content.revision});
  assert.equal(manifest.revision, 1);
  assert.deepEqual(manifest.issues, []);
  const scenes = manifest.plan.scenes;
  assert.equal(scenes[0].sentenceStart, 1);
  assert.equal(scenes.at(-1).sentenceEnd, manifest.plan.sentences.length);
  scenes.slice(1).forEach((scene, index) => assert.equal(scene.sentenceStart, scenes[index].sentenceEnd + 1));
  assert.ok(Math.abs(scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0) - 270) < 0.05);
  for (const scene of scenes) {
    assert.ok(scene.durationSeconds >= 2.5 && scene.durationSeconds <= 15, `${scene.label} ${scene.durationSeconds}`);
    for (const shot of scene.shots) { assert.ok(shot.durationSeconds >= 3 && shot.durationSeconds <= 8); assert.equal(shot.source, 'stock-video'); assert.ok(shot.query.length >= 2); }
  }
  assert.equal(scenes[0].purpose, 'hook');
  assert.throws(() => store.db.prepare('UPDATE scene_manifests SET payload=? WHERE id=?').run('{}', manifest.id), /immutable/);
  assert.throws(() => store.db.prepare('DELETE FROM scene_manifests WHERE id=?').run(manifest.id), /cannot be deleted/);
  assert.throws(() => approvePlan(room, {...manifest, id: manifest.id}) && approvePlan(room, manifest), /already has a decision/);
});

test('Hermes scene director: structural failures are blocked, timing issues stay on a draft, tokens are reserved and settled', async t => {
  let mode = 'broken';
  const network = fakeNetwork({hermesPlan: input => {
    const count = input.sentences.length;
    if (mode === 'broken') return {summary: 'x', scenes: [{sentenceStart: 2, sentenceEnd: count, purpose: 'hook', direction: '', onScreenText: '', shots: [{source: 'stock-video', query: 'market', prompt: '', motion: 'static', notes: ''}]}]};
    if (mode === 'competitor') return blueprintPlan(count, {scenes: blueprintPlan(count).scenes.map((scene, index) => index === 3 ? {...scene, shots: [{...scene.shots[0], query: 'coinorigins market'}, scene.shots[1]]} : scene)});
    return blueprintPlan(count);
  }});
  const {room, content, ids, store, family} = setup(t, network);
  assert.throws(() => room.createPlan(content.id, {mode: 'hermes', requestedBy: 'Owner', contentRevision: content.revision}), /Hermes/);
  const queued = room.createPlan(content.id, {mode: 'hermes', requestedBy: 'Owner', contentRevision: content.revision, connector: ids.hermes});
  assert.throws(() => room.createPlan(content.id, {mode: 'hermes', requestedBy: 'Owner', contentRevision: content.revision, connector: ids.hermes}), /already being prepared/);
  await room.processNextPlan();
  let job = room.publicPlanJob(room.planJobRow(queued.job.id));
  assert.equal(job.status, 'quality_failed');
  assert.match(job.quality.issues[0], /must start at sentence 1/);
  assert.equal(job.usage.status, 'settled');
  assert.equal(store.usageSummary(family.id).settledTokens, 13000);
  const chat = network.calls.find(call => call.path === '/v1/chat/completions');
  const sent = JSON.parse(chat.body.messages[1].content);
  assert.equal(sent.style.sources.includes('maps-and-diagrams'), false, 'only executable sources are offered');
  assert.ok(chat.body.max_tokens >= 600);

  mode = 'competitor';
  room.retryPlan(job.id, {});
  await room.processNextPlan();
  job = room.publicPlanJob(room.planJobRow(queued.job.id));
  assert.equal(job.status, 'completed');
  assert.equal(job.attempts, 2);
  const draft = latestManifest(room, content.id);
  assert.equal(draft.source, 'hermes');
  assert.match(draft.issues.join(' '), /names a competitor \("coinorigins"\)/);
  assert.throws(() => approvePlan(room, draft), /Resolve the plan issues/);

  mode = 'good';
  const second = room.createPlan(content.id, {mode: 'hermes', requestedBy: 'Owner', contentRevision: content.revision, connector: ids.hermes});
  await room.processNextPlan();
  const clean = latestManifest(room, content.id);
  assert.equal(clean.revision, 2);
  assert.deepEqual(clean.issues, []);
  assert.throws(() => room.reviewManifest(clean.id, {decision: 'approve', reviewer: 'Owner', confirmations: {coverageReviewed: true}}), /original/);
  assert.equal(approvePlan(room, clean).status, 'approved');
  assert.equal(room.publicPlanJob(room.planJobRow(second.job.id)).manifestId, clean.id);

  const failing = setup(t, fakeNetwork({failChat: true}));
  const failed = failing.room.createPlan(failing.content.id, {mode: 'hermes', requestedBy: 'Owner', contentRevision: failing.content.revision, connector: failing.ids.hermes});
  await failing.room.processNextPlan();
  const interrupted = failing.room.publicPlanJob(failing.room.planJobRow(failed.job.id));
  assert.equal(interrupted.status, 'interrupted');
  assert.equal(interrupted.usage.status, 'unknown');
  assert.throws(() => failing.room.retryPlan(failed.job.id, {}), /Confirm the deliberate retry/);
  assert.equal(failing.room.retryPlan(failed.job.id, {confirmInterrupted: true}).status, 'queued');
});

test('edits create new revisions that keep stable shot IDs; refresh follows a new narration', t => {
  const {room, content, narrate} = setup(t);
  const {manifest} = room.createPlan(content.id, {mode: 'rules', requestedBy: 'Owner', contentRevision: content.revision});
  const first = manifest.plan.scenes[0], shot = first.shots[0];
  assert.throws(() => room.editManifest(manifest.id, {op: 'update-shot', shotId: shot.id, source: 'ai-video', createdBy: 'Owner', expectedRevision: 1}), /does not allow/);
  const edited = room.editManifest(manifest.id, {op: 'update-shot', shotId: shot.id, source: 'ai-image', prompt: 'An original painting of a busy clay-tablet market at dawn', motion: 'ken-burns', createdBy: 'Owner', expectedRevision: 1});
  assert.equal(edited.revision, 2);
  assert.equal(edited.parentId, manifest.id);
  assert.equal(shots(edited)[0].id, shot.id);
  assert.equal(shots(edited)[0].source, 'ai-image');
  assert.deepEqual(shots(edited).slice(1).map(item => item.id), shots(manifest).slice(1).map(item => item.id));
  assert.throws(() => room.editManifest(manifest.id, {op: 'update-scene', sceneId: first.id, direction: 'x', createdBy: 'Owner', expectedRevision: 1}), /latest plan revision/);
  const split = room.editManifest(edited.id, {op: 'split-scene', sceneId: first.id, atSentence: first.sentenceStart + 1, createdBy: 'Owner', expectedRevision: 2});
  assert.equal(split.plan.scenes.length, manifest.plan.scenes.length + 1);
  assert.equal(split.plan.scenes[0].id, first.id);
  const merged = room.editManifest(split.id, {op: 'merge-next', sceneId: first.id, createdBy: 'Owner', expectedRevision: 3});
  assert.equal(merged.plan.scenes.length, manifest.plan.scenes.length);
  const tooLong = room.editManifest(merged.id, {op: 'update-scene', sceneId: first.id, onScreenText: 'one two three four five six seven eight nine', createdBy: 'Owner', expectedRevision: 4});
  assert.match(tooLong.issues.join(' '), /on-screen text has 9 words/);

  narrate(300);
  const stale = latestManifest(room, content.id);
  assert.equal(stale.scope.current, false);
  assert.match(stale.scope.issues[0], /different narration/);
  assert.throws(() => room.editManifest(stale.id, {op: 'update-scene', sceneId: first.id, direction: 'x', createdBy: 'Owner', expectedRevision: 5}), /Refresh for current narration/);
  const refreshed = room.editManifest(stale.id, {op: 'refresh-scope', createdBy: 'Owner', expectedRevision: 5});
  assert.equal(refreshed.scope.current, true);
  assert.equal(refreshed.narrationSeconds, 300);
  assert.deepEqual(shots(refreshed).map(item => item.id), shots(stale).map(item => item.id));
});

test('stock search, 24-hour cache, quota caps, import with license evidence, AI generation with budget, approval and handoff', {skip}, async t => {
  const network = fakeNetwork();
  const {room, content, ids, store, quota, family, narrate} = setup(t, network);
  let {manifest} = room.createPlan(content.id, {mode: 'rules', requestedBy: 'Owner', contentRevision: content.revision});
  manifest = room.editManifest(manifest.id, {op: 'update-shot', shotId: shots(manifest)[1].id, source: 'ai-image', prompt: 'An original illustration of clay tokens on a wooden table, no text', motion: 'ken-burns', createdBy: 'Owner', expectedRevision: 1});
  const [videoShot, aiShot] = shots(manifest);

  room.queueSearch({manifestId: manifest.id, shotId: videoShot.id, capabilityId: 'pexels-video', connector: ids.pexels, requestedBy: 'Owner'});
  assert.throws(() => room.queueSearch({manifestId: manifest.id, shotId: videoShot.id, capabilityId: 'pexels-video', connector: ids.pexels, requestedBy: 'Owner'}), /already queued/);
  await drain(room);
  let candidates = room.candidates(content.id, videoShot.id);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].license.name, 'Pexels License');
  assert.ok(candidates[0].preview.startsWith('/api/visual-candidates/'));
  assert.equal(room.candidatePreview(candidates[0].id).mime, 'image/jpeg');
  assert.equal(quota.summary().pexels.used, 1);
  const searches = () => network.calls.filter(call => call.host === 'api.pexels.com').length;
  const before = searches();
  room.queueSearch({manifestId: manifest.id, shotId: videoShot.id, capabilityId: 'pexels-video', connector: ids.pexels, requestedBy: 'Owner'});
  await drain(room);
  assert.equal(searches(), before, 'an identical search within 24 hours is served from the cache');
  assert.equal(quota.summary().pexels.used, 1);

  quota.saveSettings({revision: quota.settings().revision, pexelsHourlyRequestCap: 1});
  const blocked = room.queueSearch({manifestId: manifest.id, shotId: videoShot.id, capabilityId: 'pexels-video', query: 'different words', connector: ids.pexels, requestedBy: 'Owner'});
  await drain(room);
  assert.equal(room.publicJob(room.jobRow(blocked.id)).status, 'blocked_quota');
  assert.throws(() => room.queueSearchAll(manifest.id, {connectors: {pexels: ids.pexels}, requestedBy: 'Owner'}), /would pass the Pexels cap/);
  quota.saveSettings({revision: quota.settings().revision, pexelsHourlyRequestCap: 150});

  room.queueImport(candidates[0].id, {manifestId: manifest.id, shotId: videoShot.id, requestedBy: 'Owner'});
  await drain(room);
  const state = () => room.state().contents.find(item => item.contentId === content.id);
  const imported = state().assets[0];
  assert.equal(imported.origin, 'stock');
  assert.equal(imported.mediaType, 'video');
  assert.equal(imported.rights.license.name, 'Pexels License');
  assert.equal(imported.rights.author, 'Ben');
  assert.equal(imported.rights.synthetic, false);
  assert.equal(imported.sha256, createHash('sha256').update(mediaFixtures().mp4).digest('hex'));
  assert.ok(imported.thumb);
  assert.equal(state().selections[videoShot.id].assetId, imported.id);
  assert.throws(() => store.db.prepare("UPDATE visual_assets SET sha256='x' WHERE id=?").run(imported.id), /immutable/);

  assert.throws(() => room.queueGenerate({manifestId: manifest.id, shotId: aiShot.id, connector: ids.openai, costConfirmed: true, requestedBy: 'Owner'}), /Approve this plan revision/);
  approvePlan(room, manifest);
  assert.throws(() => room.queueGenerate({manifestId: manifest.id, shotId: aiShot.id, connector: ids.openai, requestedBy: 'Owner'}), /Confirm the estimated cost/);
  assert.throws(() => room.queueGenerate({manifestId: manifest.id, shotId: aiShot.id, connector: ids.openai, costConfirmed: true, prompt: 'Market scene in the style of a famous painter', requestedBy: 'Owner'}), /own words/);
  room.saveSettings(family.id, {...room.settings(family.id), monthlyBudgetCents: 5, revision: room.settings(family.id).revision});
  assert.throws(() => room.queueGenerate({manifestId: manifest.id, shotId: aiShot.id, connector: ids.openai, costConfirmed: true, quality: 'medium', requestedBy: 'Owner'}), /does not fit the remaining monthly AI image budget/);
  const generated = room.queueGenerate({manifestId: manifest.id, shotId: aiShot.id, connector: ids.openai, costConfirmed: true, quality: 'low', requestedBy: 'Owner'});
  await drain(room);
  assert.equal(room.publicJob(room.jobRow(generated.id)).status, 'completed');
  const ai = state().assets.find(item => item.origin === 'ai');
  assert.equal(ai.rights.synthetic, true);
  assert.equal(ai.rights.disclosure, 'required', 'Documentary Montage always discloses AI media');
  assert.equal(ai.rights.model, 'gpt-image-2.5-flare');
  assert.equal(state().selections[aiShot.id].assetId, ai.id, 'a generated image fills an empty shot');
  assert.deepEqual([room.usage(family.id).settledCents, room.usage(family.id).remainingCents], [3, 2]);
  const openaiCall = network.calls.find(call => call.path === '/v1/images/generations');
  assert.deepEqual([openaiCall.body.size, openaiCall.body.quality, openaiCall.body.n], ['1536x1024', 'low', 1]);

  await assert.rejects(room.approveVisuals(manifest.id, {approvedBy: 'Owner', confirmations: {rightsReviewed: true, sequenceReviewed: true}}), /has no visual/);
  // Fill the remaining shots from a reused asset to reach a complete board.
  for (const shot of shots(manifest).slice(2)) room.select({manifestId: manifest.id, shotId: shot.id, assetId: imported.id, selectedBy: 'Owner'});
  await assert.rejects(room.approveVisuals(manifest.id, {approvedBy: 'Owner', confirmations: {rightsReviewed: true, sequenceReviewed: true}}), /Accept the listed warnings/);
  await assert.rejects(room.approveVisuals(manifest.id, {approvedBy: 'Owner', confirmations: {rightsReviewed: true, sequenceReviewed: true, warningsAccepted: true}}), /disclosure decisions/);
  const approval = await room.approveVisuals(manifest.id, {approvedBy: 'Owner', confirmations: {rightsReviewed: true, sequenceReviewed: true, warningsAccepted: true, disclosureReviewed: true}});
  assert.equal(approval.snapshot.disclosureRequired, true);
  assert.ok(approval.snapshot.warnings.some(item => /clip lasts 3.0 s/.test(item)));
  let handoff = room.handoff(content.id);
  assert.equal(handoff.ready, true);
  assert.equal(handoff.aiImages, 1);

  room.select({manifestId: manifest.id, shotId: shots(manifest)[2].id, assetId: ai.id, selectedBy: 'Owner'});
  handoff = room.handoff(content.id);
  assert.equal(handoff.ready, false);
  assert.equal(room.publicApproval(store.db.prepare('SELECT * FROM visual_approvals WHERE id=?').get(approval.id)).status, 'stale');
  assert.ok(store.productionInvalidations().some(item => item.stage === 'visuals' && item.approvalId === approval.id));

  narrate(280);
  assert.match(room.handoff(content.id).blocker, /Approve the visuals|different narration/);
  assert.throws(() => room.queueSearch({manifestId: manifest.id, shotId: videoShot.id, capabilityId: 'pexels-video', connector: ids.pexels, requestedBy: 'Owner'}), /different narration/);

  const purged = room.purgeExpired(new Date(Date.now() + 2 * 86400000));
  assert.ok(purged >= 1);
  assert.deepEqual(room.candidates(content.id, videoShot.id), []);
});

test('an interrupted AI generation keeps its reservation counted and needs a confirmed retry', {skip}, async t => {
  const network = fakeNetwork({openaiStatus: 500});
  const {room, content, ids, family} = setup(t, network);
  let {manifest} = room.createPlan(content.id, {mode: 'rules', requestedBy: 'Owner', contentRevision: content.revision});
  manifest = room.editManifest(manifest.id, {op: 'update-shot', shotId: shots(manifest)[0].id, source: 'ai-image', prompt: 'An original illustration of a quiet harbour market', motion: 'ken-burns', createdBy: 'Owner', expectedRevision: 1});
  approvePlan(room, manifest);
  const job = room.queueGenerate({manifestId: manifest.id, shotId: shots(manifest)[0].id, connector: ids.openai, costConfirmed: true, requestedBy: 'Owner'});
  await drain(room);
  const failed = room.publicJob(room.jobRow(job.id));
  assert.equal(failed.status, 'interrupted');
  assert.equal(failed.usage.status, 'unknown');
  assert.equal(room.usage(family.id).reservedCents, 6);
  assert.throws(() => room.retryJob(job.id, {}), /Confirm the deliberate retry/);
  assert.equal(room.retryJob(job.id, {confirmInterrupted: true}).status, 'queued');
  assert.equal(room.usage(family.id).reservedCents, 6, 'the unknown first attempt stays counted');
});

test('HTTP routes need the local token and serve the scene state, previews and thumbnails', {skip}, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scene-http-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const {server, sceneRoom} = createApp({dataFile: path.join(dir, 'workspace.sqlite'), worker: false, protector, providerFetch: fakeNetwork().fetch, voiceOptions: {ffmpeg: 'missing-ffmpeg', ffprobe: 'missing-ffprobe'}});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const state = await (await fetch(`${base}/api/state`)).json();
  assert.ok(state.scenes);
  assert.ok(state.scenes.capabilities.some(item => item.id === 'openai-image'));
  assert.equal((await fetch(`${base}/scene-room.js`)).status, 200);
  assert.ok(state.connectorProviders.pexels && state.connectorProviders.pixabay);
  assert.equal((await fetch(`${base}/api/visual-assets/00000000-0000-0000-0000-000000000000/thumb`)).status, 404);
  const send = (url, body, token = state.token) => fetch(base + url, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Local-Token': token}, body: JSON.stringify(body)});
  assert.equal((await send('/api/scene-shots/search', {}, 'bad')).status, 403);
  assert.equal((await send('/api/scene-shots/search', {requestedBy: 'Owner', capabilityId: 'pexels-photo', connector: {id: 'x', revision: 1}})).status, 409);
  assert.ok(sceneRoom);
});
