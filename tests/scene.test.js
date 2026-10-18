'use strict';
const test = require('node:test');
const {claudeMessage, claudeStream, isClaudeMessages} = require('./fake-claude');
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
const {SceneRoom, splitSentences, timeSentences, keywords, planMessages} = require('../scene-room');
const {RenderRoom} = require('../render-room');
const {findBrowser} = require('../motion');
const Sk = require('../sketch');
const Cap = require('../captions');
const {createApp} = require('../server');

const hasFFmpeg = (() => { try { execFileSync('ffprobe', ['-version'], {stdio: 'ignore'}); execFileSync('ffmpeg', ['-version'], {stdio: 'ignore'}); return true; } catch { return false; } })();
const skip = hasFFmpeg ? false : 'FFmpeg/ffprobe are not installed on this machine';
const protector = {transform: (operation, input) => Buffer.from([...input].reverse())};
const KEYS = {pexels: 'pexels-fixture-key-0123456789', pixabay: 'pixabay-fixture-key-0123456789', openai: 'openai-fixture-key-0123456789abcdef', claude: 'claude-fixture-key-0123456789abcdef'};
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

function fakeNetwork({claudePlan = null, claudeUsage = {prompt_tokens: 9000, completion_tokens: 4000, total_tokens: 13000}, openaiStatus = 200, failChat = false} = {}) {
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
    if (target.origin === 'https://api.anthropic.com') {
      if (target.pathname === '/v1/capabilities') return json({auth: {type: 'bearer', required: true}, features: {chat_completions: true}});
      if (target.pathname === '/v1/toolsets') return json([]);
      if (isClaudeMessages(url)) {
        if (failChat) throw new Error('socket hang up');
        // The frame worker's request is a JSON packet followed by recipe text; it arrives as {raw}.
        const body = JSON.parse(options.body), input = (() => { try { return JSON.parse(body.messages[0].content); } catch { return {raw: body.messages[0].content, system: body.system}; } })();
        const plan = typeof claudePlan === 'function' ? claudePlan(input) : claudePlan;
        return (body.stream ? claudeStream : claudeMessage)(plan, {input_tokens: claudeUsage.prompt_tokens, output_tokens: claudeUsage.completion_tokens});
      }
    }
    throw new Error(`Unexpected request to ${url}`);
  };
  return {fetch: fetchImpl, calls};
}

function setup(t, network = fakeNetwork(), {format = 'long-form', withVoice = true, withStyle = true, scriptText = script, targetMinutes = null, styleKey = 'documentary-montage', storyMap = true} = {}) {
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
  const ids = {pexels: make('pexels'), pixabay: make('pixabay'), openai: make('openai'), claude: make('claude')};
  const styles = new StyleLibrary(store), quota = new QuotaLedger(store);
  const family = store.saveFamily({name: 'Money History', tier: 'A', countries: ['United States'], audience: 'Curious adults who like money history told as stories.', niche: 'Origins of money', locales: ['en-US'], timezone: 'Asia/Karachi', monthlyBudget: 50, cadence: 2, format, monthlyTokenLimit: 2000000, scriptTokenLimit: 8000, researchTokenLimit: 8000, competitors: ['@CoinOrigins']});
  let content = store.saveContent({familyId: family.id, title: 'How promises became money', kind: 'fiction', angle: 'Follow invented market towns as they learn to record trust.', hook, script: scriptText, targetMinutes, sources: [], rightsConfirmed: true});
  store.reviewContent(content.id, {revision: content.revision, action: 'submit'});
  content = store.reviewContent(content.id, {revision: content.revision, action: 'approve'});
  let approval = null;
  if (withStyle) {
    const montage = styles.profiles().find(item => item.key === styleKey).revisions.at(-1);
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
  // Tests of other features switch the story director off, so their fakes answer only plan parts.
  if (!storyMap) room.saveSettings(family.id, {...room.settings(family.id), storyMap: false, revision: room.settings(family.id).revision});
  return {store, connectors, styles, quota, room, family, content, ids, network, dataRoot, narrate};
}
const latestManifest = (room, contentId) => room.state().contents.find(item => item.contentId === contentId).manifests.find(item => item.latest);
const approvePlan = (room, manifest) => room.reviewManifest(manifest.id, {decision: 'approve', reviewer: 'Owner', notes: '', confirmations: {coverageReviewed: true, directionReviewed: true}});
const shots = manifest => manifest.plan.scenes.flatMap(scene => scene.shots);
async function drain(room) { for (let i = 0; i < 200; i++) { const busy = room.db.prepare("SELECT 1 FROM visual_jobs WHERE status='queued'").get(); if (!busy) return; await room.processNextVisual(); } }

test('a new plan uses only the sources the program can fetch now: no stock shots without a tested stock connection', t => {
  const {store, room, content, ids} = setup(t);
  for (const ref of [ids.pexels, ids.pixabay]) {
    const row = store.db.prepare('SELECT payload FROM connectors WHERE id=?').get(ref.id), payload = JSON.parse(row.payload);
    payload.test = {status: 'failed', at: new Date().toISOString(), message: 'fixture'};
    store.db.prepare('UPDATE connectors SET payload=? WHERE id=?').run(JSON.stringify(payload), ref.id);
  }
  const {manifest} = room.createPlan(content.id, {mode: 'rules', requestedBy: 'Owner', contentRevision: content.revision});
  assert.deepEqual([...new Set(shots(manifest).map(shot => shot.source))], ['ai-image']);
});

test('a long story-mix script meets the story director first: every part follows its slice of the map, the map is paid once and the mix is measured', async t => {
  let broken = true;
  const director = {structure: 'Cold open on a promise, then how the records worked.',
    world: {era: 'ancient', place: 'market towns by a river', rules: ['Records are clay tablets', 'No coins yet']},
    cast: [{id: 'c1', name: 'Trader', role: 'keeps the records', look: {hair: 'curly', outfit: 'kit:robe'}}],
    kit: [{id: 'robe', kind: 'outfit', name: 'wool robe', shapes: [{path: 'M30 0 L70 0 L78 150 L22 150 Z', fill: '#C9A46A'}]}, {id: 'tablet', kind: 'prop', name: 'clay tablet', shapes: [{rect: [20, 15, 60, 70], fill: '#B5835A'}, {line: [30, 30, 70, 30]}]}], direction: {read: 'Clay, ink and trust: a warm record of how strangers learned to keep promises.', dials: {variance: 5, motion: 5, density: 4}, palette: {canvas: '#FFFDF8', ink: '#1F1F1F', accent: '#E0753E', support: '#3A6EA5'}, fonts: {display: 'Bahnschrift', body: 'Segoe UI'}},
    chapters: [{title: 'The promise', sentenceStart: 1, sentenceEnd: 12, job: 'hook', home: 'stickman'}, {title: 'How records worked', sentenceStart: 13, sentenceEnd: 60, job: 'explain', home: 'handdrawn', rehook: 'A clay tablet draws itself'}],
    beats: [{sentenceStart: 1, sentenceEnd: 4, engine: 'stickman', why: 'strangers making a deal'}, {sentenceStart: 5, sentenceEnd: 8, engine: 'motion', why: 'a quick list'}, {sentenceStart: 9, sentenceEnd: 12, engine: 'atelier', why: 'the thesis lands'}, {sentenceStart: 13, sentenceEnd: 60, engine: 'handdrawn', why: 'how it worked'}]};
  const network = fakeNetwork({claudePlan: input => {
    if (input.style?.engines) return director;
    if (!input.sentences) return {report: 'All shots match their words.', changes: []};
    const scenes = [];
    for (let k = 0; k < input.sentences.length; k += 2) {
      const first = input.sentences[k].n, beat = input.map.beats.find(item => item.sentenceStart <= first && item.sentenceEnd >= first);
      const engine = beat.engine === 'atelier' ? 'motion' : beat.engine;
      scenes.push({sentenceStart: first, sentenceEnd: input.sentences[Math.min(k + 1, input.sentences.length - 1)].n, purpose: first === 1 ? 'hook' : 'explain', direction: 'Follow the map.', onScreenText: '',
        shots: [0, 1].map(() => ({source: 'generated-graphics', query: '', prompt: '', motion: 'static', notes: '', sketch: {engine, ...(first === 3 ? {set: 'ocean'} : {}), elements: [{kind: 'prop', prop: 'kit:tablet'}, {kind: 'figure', who: 'c1', x: 0.3}]}}))});
    }
    if (input.part?.index === 2 && broken) { broken = false; scenes.pop(); }
    return {summary: 'Planned from the map.', scenes};
  }});
  const {room, content, ids, narrate} = setup(t, network, {styleKey: 'story-mix', withVoice: false});
  narrate(300);
  const queued = room.createPlan(content.id, {mode: 'claude', requestedBy: 'Owner', contentRevision: content.revision, connector: ids.claude});
  await room.processNextPlan();
  assert.equal(room.publicPlanJob(room.planJobRow(queued.job.id)).status, 'quality_failed');
  room.retryPlan(queued.job.id, {});
  await room.processNextPlan();
  const job = room.publicPlanJob(room.planJobRow(queued.job.id));
  assert.equal(job.status, 'completed', job.error);
  const asks = network.calls.filter(call => call.path === '/v1/messages').map(call => ({system: call.body.system, input: JSON.parse(call.body.messages[0].content)}));
  const maps = asks.filter(item => item.input.style?.engines), parts = asks.filter(item => item.input.part);
  assert.equal(maps.length, 1, 'the map is asked once, before the parts, and kept for the retry');
  assert.match(maps[0].system, /STORY DIRECTOR[\s\S]*story mix: no engine leads[\s\S]*At most 10 atelier beats/);
  assert.equal(asks.indexOf(maps[0]), 0);
  for (const part of parts) {
    const {firstSentence, lastSentence} = part.input.part;
    assert.ok(part.input.map.beats.every(item => item.sentenceEnd >= firstSentence && item.sentenceStart <= lastSentence), 'each part reads only its own beats');
    assert.equal(part.input.direction.read, director.direction.read, 'every part designs inside the one art direction');
    assert.match(part.system, /Follow the video map/);
  }
  const manifest = latestManifest(room, content.id);
  assert.deepEqual(manifest.plan.map.chapters.map(item => [item.title, item.home]), [['The promise', 'stickman'], ['How records worked', 'handdrawn']]);
  assert.deepEqual(Object.keys(manifest.plan.mix.engines).sort(), ['handdrawn', 'motion', 'stickman']);
  assert.ok(manifest.warnings.some(item => /s in handdrawn without a change of engine/.test(item)), 'a long stretch in one engine is named for free');
  // The story's own world: parts read its era, rules, cast and kit (names only) and draw with them; drawings carry
  // the kit items they use; a figure left on the sea floor goes to the beach.
  assert.ok(parts.every(part => part.input.world.era === 'ancient' && part.input.kit.some(item => item.ref === 'kit:tablet') && !JSON.stringify(part.input.kit).includes('pts')));
  assert.equal(parts[0].input.cast[0].look.outfit, 'kit:robe');
  assert.deepEqual([manifest.plan.world.era, Object.keys(manifest.plan.kit).sort()], ['ancient', ['robe', 'tablet']]);
  const first = shots(manifest)[0].sketch;
  assert.deepEqual([first.elements[0].prop, first.elements[1].look.outfit, Object.keys(first.kit).sort()], ['kit:tablet', 'kit:robe', ['robe', 'tablet']]);
  const sea = manifest.plan.scenes.find(scene => scene.sentenceStart === 3);
  assert.equal(sea.shots[0].sketch.set, 'beach');
  assert.ok(manifest.plan.continuity.some(item => item.label === sea.shots[0].label && /sea floor/.test(item.fix)));
});

test('an animated shot a little over the style\'s shot limit is named, a still held too long is an issue', () => {
  const {buildPayload} = require('../scene-room');
  const {LAUNCH_PROFILES} = require('../style');
  const spec = LAUNCH_PROFILES.find(item => item.key === 'story-mix').spec;
  const plan = shot => buildPayload({scenes: [{id: 'sc1', sentenceStart: 1, sentenceEnd: 1, purpose: 'hook', direction: '', onScreenText: '', shots: [{id: 'sh1', query: 'map', prompt: '', motion: 'static', notes: '', ...shot}]}], sentences: [{n: 1, text: 'One sentence that runs on for about seven seconds of narration.', words: 11}], narrationSeconds: 7, spec, terms: []});
  const drawn = plan({source: 'generated-graphics', sketch: {elements: [{kind: 'prop', prop: 'globe'}]}});
  assert.deepEqual(drawn.issues, []);
  assert.ok(drawn.warnings.some(item => /S01A holds 7\.0 s, a little over the style's 6 s shot limit/.test(item)));
  assert.match(plan({source: 'stock-image'}).issues.join(' '), /S01A would hold 7\.0 s, above the style's 6 s shot limit/);
});

test('Claude chooses each scene\'s transition: offered from the style, kept through the plan, unknown names dropped', () => {
  const {aiScenes, buildPayload} = require('../scene-room');
  const input = {family: {}, style: {name: 'S', summary: '', engine: 'stickman', sources: ['generated-graphics'], primarySource: 'generated-graphics', cameraMoves: ['static'], transitions: ['iris-open', 'whip-pan'], sceneSeconds: {min: 1, max: 9}, shotSeconds: {min: 1, max: 6}, maxWordsOnScreen: 6}, narrationSeconds: 10, sentences: []};
  const prompt = planMessages(input)[0].content;
  assert.match(prompt, /"transition"\?: string/);
  assert.match(prompt, /iris-open \(opening on a new world/);
  assert.doesNotMatch(prompt, /pixelize/, 'only the transitions the style allows are offered');
  assert.doesNotMatch(planMessages({...input, style: {...input.style, transitions: []}})[0].content, /how the edit enters it/);
  const scene = transition => ({sentenceStart: 1, sentenceEnd: 1, purpose: 'hook', direction: '', onScreenText: '', ...(transition ? {transition} : {}), shots: [{source: 'generated-graphics', query: '', prompt: '', motion: 'static', notes: ''}]});
  const raw = aiScenes({summary: '', scenes: [scene('iris-open'), scene('spin-3d'), scene('push')]});
  assert.deepEqual(raw.scenes.map(item => item.transition), ['iris-open', undefined, 'push'], 'an unknown name is dropped, never a reason to lose the plan');
  const {LAUNCH_PROFILES} = require('../style');
  const spec = LAUNCH_PROFILES.find(item => item.key === 'story-mix').spec;
  const payload = buildPayload({scenes: [{id: 'sc1', ...scene('push'), shots: [{id: 'sh1', source: 'generated-graphics', query: '', prompt: '', motion: 'static', notes: '', sketch: {elements: [{kind: 'prop', prop: 'globe'}]}}]}], sentences: [{n: 1, text: 'One sentence of narration.', words: 4}], narrationSeconds: 3, spec, terms: []});
  assert.equal(payload.payload.scenes[0].transition, 'push-left', 'older short names are stored by their full name');
});

test('pictures (paid): Claude spends the video\'s picture budget, the illustrator draws each one once, a failed one is asked again, the rest is drawn free', async t => {
  const art = {viewBox: [600, 400], paths: [
    {d: 'M100 300 L500 300 L500 360 L100 360 Z', fill: '#C9A77C', stroke: '#1E1E1E', width: 4}, {d: 'M200 120 L400 120 L380 300 L220 300 Z', fill: '#FFFFFF', stroke: '#1E1E1E', width: 4},
    {d: 'M210 160 L390 160 L384 220 L216 220 Z', fill: '#E5484D', stroke: '#1E1E1E', width: 3}, {d: 'M400 160 C470 160 470 260 390 260', fill: 'none', stroke: '#1E1E1E', width: 10},
    {d: 'M250 100 C230 70 270 50 250 20', fill: 'none', stroke: '#8A96A3', width: 5}, {d: 'M225 230 L245 230 L240 290 L226 288 Z', fill: '#E6E6E6'}]};
  const asked = [];
  const network = fakeNetwork({claudePlan: input => {
    if (input.raw?.startsWith('PICTURE: ')) {
      const packet = JSON.parse(input.raw.slice(9, input.raw.indexOf('\n'))), retry = /FAILED THESE CHECKS/.test(input.raw);
      asked.push(`${packet.picture.slice(0, 12)}${retry ? ':retry' : ''}`);
      assert.equal(packet.look, 'cartoon');
      assert.match(input.raw, /NO text, letters, numbers/);
      if (packet.picture.startsWith('Harbour') && !retry) return 'Here is my idea for the picture.';
      if (packet.picture.startsWith('Broken')) return 'No picture today.';
      return art;
    }
    if (input.scenes) return {report: 'Nothing to change.', changes: []};
    const scenes = [], first = input.sentences[0].n, last = input.sentences.at(-1).n;
    for (let start = first; start <= last; start += 8) scenes.push({sentenceStart: start, sentenceEnd: Math.min(last, start + 7), purpose: start === 1 ? 'hook' : 'explain', direction: '', onScreenText: '', shots: [{source: 'generated-graphics', query: '', prompt: '', motion: 'static', notes: 'A rich place is worth a picture.',
      sketch: {engine: 'handdrawn', elements: [{kind: 'picture', describe: `${start === 1 ? 'Harbour' : 'Market'} at dawn with traders and boats, scene from sentence ${start}`, size: 'l'}, {kind: 'text', style: 'keyword', text: `Part ${start}`}]}}]});
    return {summary: 'Pictures where they count.', cast: [], scenes};
  }});
  const {room, content, ids, store, family, narrate} = setup(t, network, {styleKey: 'hand-drawn-canvas', withVoice: false, storyMap: false});
  narrate(40);
  const queued = room.createPlan(content.id, {mode: 'claude', requestedBy: 'Owner', contentRevision: content.revision, connector: ids.claude});
  await room.processNextPlan();
  const job = room.publicPlanJob(room.planJobRow(queued.job.id));
  assert.equal(job.status, 'completed', job.error);
  const plans = network.calls.filter(call => call.path === '/v1/messages').map(call => call.body.system).filter(text => /You direct the scenes/.test(text));
  assert.ok(plans.every(text => /PICTURES \(paid\): up to \d+ drawn shots/.test(text) && /"kind": "picture"/.test(text)), 'the planner knows the budget and the picture element');
  const manifest = latestManifest(room, content.id), pictured = shots(manifest).filter(shot => shot.sketch?.elements.some(item => item.kind === 'picture'));
  const budget = Math.round(40 / 60 * room.settings(family.id).picturesPerMinute);
  assert.equal(pictured.length, budget, 'the budget holds');
  assert.ok(pictured.every(shot => shot.sketch.elements.find(item => item.kind === 'picture').art.paths.length === art.paths.length), 'every kept picture carries its checked drawing');
  assert.equal(manifest.plan.pictures.drawn, budget);
  assert.ok(manifest.plan.pictures.notes.some(item => /past the video's budget of \d+ pictures; the program draws this shot itself/.test(item)));
  assert.ok(shots(manifest).filter(shot => !pictured.includes(shot)).every(shot => shot.sketch.elements.some(item => item.kind === 'text')), 'a shot past the budget keeps its free drawing');
  assert.ok(asked.includes('Harbour at d') && asked.includes('Harbour at d:retry'), 'a failed picture is asked again once with its findings');
  const rows = store.db.prepare("SELECT status FROM intelligence_usage WHERE kind='picture'").all();
  assert.deepEqual([rows.length, rows.every(row => row.status === 'settled')], [asked.length, true], 'each picture answer is reserved and settled on its own');
  // A retry of the same plan job keeps the pictures already drawn: no new answer, no new tokens.
  const row = room.planJobRow(queued.job.id), before = asked.length;
  const raw = {summary: 'again', cast: [], scenes: manifest.plan.scenes.map(scene => ({...scene, shots: scene.shots.map(shot => ({...shot, sketch: {...shot.sketch, elements: shot.sketch.elements.map(({art: drawn, ...rest}) => rest)}}))}))};
  const again = await room.illustrate({...row, scope: JSON.parse(row.scope)}, raw, () => {});
  assert.equal(asked.length, before, 'kept pictures are not asked for again');
  assert.equal(again.pictures.drawn, budget);
  assert.ok(again.pictures.notes.some(item => /kept from an earlier attempt/.test(item)));
  // The owner upgrades one free shot with a paid picture: only that shot changes, its words stay.
  const free = shots(manifest).find(shot => !pictured.includes(shot)), others = shots(manifest).filter(shot => shot.id !== free.id);
  const picked = room.pictureForShot(manifest.id, {shotId: free.id, describe: 'A quiet harbour at night with lanterns on the boats', size: 'xl', replace: true, requestedBy: 'Owner', connector: ids.claude, expectedRevision: manifest.revision});
  await room.processNextPlan();
  assert.equal(room.publicPlanJob(room.planJobRow(picked.job.id)).status, 'completed');
  assert.equal(room.publicPlanJob(room.planJobRow(picked.job.id)).picture.label, free.label);
  const upgraded = latestManifest(room, content.id), shot = shots(upgraded).find(item => item.id === free.id);
  assert.deepEqual(shot.sketch.elements.map(item => item.kind), ['picture', 'text'], 'the picture replaces the drawings; the words stay');
  assert.ok(shot.sketch.elements[0].art && shot.sketch.elements[0].size === 'xl');
  assert.deepEqual(shots(upgraded).filter(item => item.id !== free.id).map(item => JSON.stringify(item.sketch)), others.map(item => JSON.stringify(item.sketch)), 'every other shot is unchanged');
  assert.equal(upgraded.plan.pictures.drawn, budget + 1);
  // A picture that fails its checks twice changes nothing.
  const broken = room.pictureForShot(upgraded.id, {shotId: free.id, describe: 'Broken picture of a harbour', requestedBy: 'Owner', connector: ids.claude, expectedRevision: upgraded.revision});
  await room.processNextPlan();
  const failed = room.publicPlanJob(room.planJobRow(broken.job.id));
  assert.equal(failed.status, 'quality_failed');
  assert.match(failed.error, /was not drawn .*so the shot keeps its drawing/);
  assert.equal(latestManifest(room, content.id).id, upgraded.id);
  // Switched off, the planner is not offered pictures.
  room.saveSettings(family.id, {...room.settings(family.id), picturesPerMinute: 0, revision: room.settings(family.id).revision});
  const input = {family: {}, style: {name: 'S', summary: '', engine: 'handdrawn', sources: ['generated-graphics'], primarySource: 'generated-graphics', cameraMoves: ['static'], sceneSeconds: {min: 1, max: 9}, shotSeconds: {min: 1, max: 6}, maxWordsOnScreen: 6}, narrationSeconds: 10, sentences: []};
  assert.doesNotMatch(planMessages(input)[0].content, /PICTURES \(paid\)|"kind": "picture"/);
});

test('a plan stopped mid-way marks its picture and frame reservations unknown too, never left reserved', t => {
  const {room, store, content, family} = setup(t);
  const at = new Date().toISOString();
  store.db.prepare("INSERT INTO scene_plan_jobs(id,family_id,content_id,status,scope,attempts,created_by,created_at,updated_at) VALUES('job1',?,?,'running','{}',1,'Owner',?,?)").run(family.id, content.id, at, at);
  for (const key of ['job1', 'job1:picture:S01A:1:1', 'job1:frame:S02A:1:1', 'other']) store.db.prepare("INSERT INTO intelligence_usage(job_id,family_id,kind,period_month,status,reserved_tokens,created_at,updated_at) VALUES(?,?,'picture','2026-10','reserved',1000,?,?)").run(key, family.id, at, at);
  room.recoverInterrupted();
  assert.equal(room.planJobRow('job1').status, 'interrupted');
  assert.deepEqual(store.db.prepare('SELECT job_id, status FROM intelligence_usage ORDER BY job_id').all().map(row => `${row.job_id} ${row.status}`), ['job1 unknown', 'job1:frame:S02A:1:1 unknown', 'job1:picture:S01A:1:1 unknown', 'other reserved']);
});

test('a plan answer cut off because Claude thought too long says so, with the setting that fixes it; plans get up to 64,000 tokens', async t => {
  const network = fakeNetwork({claudePlan: () => '{"summary": "Thinking long', claudeUsage: {prompt_tokens: 20000, completion_tokens: 63500, total_tokens: 83500}});
  const {room, content, ids, family} = setup(t, network, {storyMap: false});
  assert.equal(room.settings(family.id).plannerTokenLimit, 100000);
  const queued = room.createPlan(content.id, {mode: 'claude', requestedBy: 'Owner', contentRevision: content.revision, connector: ids.claude});
  assert.ok(JSON.parse(room.planJobRow(queued.job.id).scope).parts.every(part => part.maxCompletionTokens <= 64000 && part.maxCompletionTokens > 32000));
  await room.processNextPlan();
  const job = room.publicPlanJob(room.planJobRow(queued.job.id));
  assert.equal(job.status, 'quality_failed');
  assert.match(job.error, /Claude ran out of room: it thought for about [\d,]+ tokens and the plan was cut off\. Raise the scene planner token limit/);
});

test('with frame composing switched off, the planner does not read the atelier guide', () => {
  const input = {family: {}, style: {name: 'S', summary: '', engine: 'stickman', sources: ['generated-graphics'], primarySource: 'generated-graphics', cameraMoves: ['static'], sceneSeconds: {min: 1, max: 9}, shotSeconds: {min: 1, max: 6}, maxWordsOnScreen: 6}, narrationSeconds: 10, sentences: []};
  assert.match(planMessages(input)[0].content, /ATELIER SHOTS/);
  assert.doesNotMatch(planMessages({...input, style: {...input.style, frames: false}})[0].content, /ATELIER SHOTS/);
});

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

test('Claude scene director: structural failures are blocked, timing issues stay on a draft, tokens are reserved and settled', async t => {
  let mode = 'broken';
  const network = fakeNetwork({claudePlan: input => {
    const count = input.sentences.length;
    if (mode === 'broken') return {summary: 'x', scenes: [{sentenceStart: 2, sentenceEnd: count, purpose: 'hook', direction: '', onScreenText: '', shots: [{source: 'stock-video', query: 'market', prompt: '', motion: 'static', notes: ''}]}]};
    if (mode === 'competitor') return blueprintPlan(count, {scenes: blueprintPlan(count).scenes.map((scene, index) => index === 3 ? {...scene, shots: [{...scene.shots[0], query: 'coinorigins market'}, scene.shots[1]]} : scene)});
    return blueprintPlan(count);
  }});
  const {room, content, ids, store, family} = setup(t, network);
  assert.throws(() => room.createPlan(content.id, {mode: 'claude', requestedBy: 'Owner', contentRevision: content.revision}), /Claude/);
  const queued = room.createPlan(content.id, {mode: 'claude', requestedBy: 'Owner', contentRevision: content.revision, connector: ids.claude});
  assert.throws(() => room.createPlan(content.id, {mode: 'claude', requestedBy: 'Owner', contentRevision: content.revision, connector: ids.claude}), /already being prepared/);
  await room.processNextPlan();
  let job = room.publicPlanJob(room.planJobRow(queued.job.id));
  assert.equal(job.status, 'quality_failed');
  assert.match(job.quality.issues[0], /must start at sentence 1/);
  assert.equal(job.usage.status, 'settled');
  assert.equal(store.usageSummary(family.id).settledTokens, 13000);
  const chat = network.calls.find(call => call.path === '/v1/messages');
  const sent = JSON.parse(chat.body.messages[0].content);
  assert.equal(sent.style.sources.includes('maps-and-diagrams'), false, 'only executable sources are offered');
  assert.ok(chat.body.max_tokens >= 600);

  mode = 'competitor';
  room.retryPlan(job.id, {});
  await room.processNextPlan();
  job = room.publicPlanJob(room.planJobRow(queued.job.id));
  assert.equal(job.status, 'completed');
  assert.equal(job.attempts, 2);
  // Where the tokens went: what Claude read, and its output split into the answer and its thinking.
  const {read, answer, thinking} = job.quality.tokens;
  assert.deepEqual([read, answer + thinking], [9000, 4000]);
  assert.ok(answer > 0 && answer <= 4000);
  const draft = latestManifest(room, content.id);
  assert.equal(draft.source, 'claude');
  assert.match(draft.issues.join(' '), /names a competitor \("coinorigins"\)/);
  assert.throws(() => approvePlan(room, draft), /Resolve the plan issues/);

  mode = 'good';
  const second = room.createPlan(content.id, {mode: 'claude', requestedBy: 'Owner', contentRevision: content.revision, connector: ids.claude});
  await room.processNextPlan();
  const clean = latestManifest(room, content.id);
  assert.equal(clean.revision, 2);
  assert.deepEqual(clean.issues, []);
  assert.throws(() => room.reviewManifest(clean.id, {decision: 'approve', reviewer: 'Owner', confirmations: {coverageReviewed: true}}), /original/);
  assert.equal(approvePlan(room, clean).status, 'approved');
  assert.equal(room.publicPlanJob(room.planJobRow(second.job.id)).manifestId, clean.id);

  const failing = setup(t, fakeNetwork({failChat: true}));
  const failed = failing.room.createPlan(failing.content.id, {mode: 'claude', requestedBy: 'Owner', contentRevision: failing.content.revision, connector: failing.ids.claude});
  await failing.room.processNextPlan();
  const interrupted = failing.room.publicPlanJob(failing.room.planJobRow(failed.job.id));
  assert.equal(interrupted.status, 'interrupted');
  assert.equal(interrupted.usage.status, 'unknown');
  assert.throws(() => failing.room.retryPlan(failed.job.id, {}), /Confirm the deliberate retry/);
  assert.equal(failing.room.retryPlan(failed.job.id, {confirmInterrupted: true}).status, 'queued');
});

test('a long summary, direction or note from Claude is trimmed at a word and an extra field is dropped, never a reason to lose the plan', async t => {
  const network = fakeNetwork({claudePlan: input => {
    const plan = blueprintPlan(input.sentences.length);
    return {...plan, summary: 'Words that run on and on. '.repeat(30), scenes: plan.scenes.map(scene => ({...scene, direction: 'A direction that keeps going. '.repeat(30), shots: scene.shots.map(shot => ({...shot, notes: 'A note. '.repeat(80), sentenceStart: scene.sentenceStart}))}))};
  }});
  const {room, content, ids} = setup(t, network);
  const queued = room.createPlan(content.id, {mode: 'claude', requestedBy: 'Owner', contentRevision: content.revision, connector: ids.claude});
  await room.processNextPlan();
  assert.equal(room.publicPlanJob(room.planJobRow(queued.job.id)).status, 'completed');
  const {plan} = latestManifest(room, content.id);
  assert.ok(plan.summary.length <= 600 && plan.summary.endsWith('on…'), plan.summary.slice(-20));
  assert.ok(plan.scenes.every(scene => scene.direction.length <= 600 && scene.shots.every(shot => shot.notes.length <= 500 && !('sentenceStart' in shot))));
});

test('a long script is planned in parts: each part covers its own sentences, and a bad part is asked again alone', async t => {
  // A 14-minute draft: 180 sentences in 15 paragraphs, planned in three parts of 60.
  const longScript = Array.from({length: 15}, (_, p) => (p === 0 ? [hook] : []).concat(Array.from({length: p === 0 ? 11 : 12}, (_, i) => sentence(p * 12 + i + 1))).join(' ')).join('\n\n');
  let broken = 2;
  const network = fakeNetwork({claudePlan: input => {
    const first = input.sentences[0].n, last = input.sentences.at(-1).n, scenes = [];
    for (let start = first; start <= last; start += 2) scenes.push({sentenceStart: start, sentenceEnd: Math.min(last, start + 1), purpose: start === 1 ? 'hook' : 'explain', direction: 'Show the record keeping clearly.', onScreenText: '', shots: [{source: 'stock-video', query: 'clay tablet market', prompt: '', motion: 'static', notes: ''}]});
    if (input.part?.index === broken) { broken = null; scenes.pop(); }
    return {summary: `Part ${input.part?.index}`, scenes};
  }});
  const {room, content, ids, store, family} = setup(t, network, {scriptText: longScript, targetMinutes: 14, storyMap: false});
  const queued = room.createPlan(content.id, {mode: 'claude', requestedBy: 'Owner', contentRevision: content.revision, connector: ids.claude});
  assert.deepEqual(queued.job.parts, {total: 3, done: 0});
  await room.processNextPlan();
  let job = room.publicPlanJob(room.planJobRow(queued.job.id));
  assert.equal(job.status, 'quality_failed');
  assert.match(job.error, /Part 2 of 3 must cover sentences 61-120 exactly once/);
  assert.deepEqual(job.parts, {total: 3, done: 1}, 'the good first part is kept');
  const asked = () => network.calls.filter(call => call.path === '/v1/messages').map(call => JSON.parse(call.body.messages[0].content));
  assert.deepEqual(asked().map(item => [item.part.index, item.part.of, item.part.firstSentence, item.part.lastSentence, item.sentences.length]), [[1, 3, 1, 60, 60], [2, 3, 61, 120, 60]]);
  assert.equal(asked()[1].part.before, sentence(60), 'each part sees its neighbouring sentences for continuity');
  assert.match(network.calls.find(call => call.path === '/v1/messages').body.system, /part 1 of 3 of one video/);
  room.retryPlan(job.id, {});
  await room.processNextPlan();
  job = room.publicPlanJob(room.planJobRow(queued.job.id));
  assert.equal(job.status, 'completed', job.error);
  assert.deepEqual(asked().map(item => item.part.index), [1, 2, 2, 3], 'part 1 was not asked (or paid for) again');
  const plan = latestManifest(room, content.id);
  assert.equal(plan.plan.scenes.length, 90);
  assert.deepEqual([plan.plan.scenes[0].sentenceStart, plan.plan.scenes.at(-1).sentenceEnd, plan.plan.scenes[0].purpose], [1, 180, 'hook']);
  assert.equal(store.usageSummary(family.id).settledTokens, 4 * 13000, 'each call is settled once, with the attempt that made it');
});

test('drawn scenes: a cast, shots that start on their words, Claude\'s drawings repaired or named, and the program draws the shot itself', {skip: skip || (findBrowser() ? false : 'No Edge or Chrome on this machine')}, async t => {
  const drawing = n => ({engine: 'stickman', set: 'bank', camera: 'push', elements: [{kind: 'figure', who: 'c1', pose: n % 2 ? 'point' : 'think', expression: 'excited', x: 0.3, y: 0.8}, {kind: 'prop', prop: n === 99 ? 'dragon' : 'coin', x: 0.65, y: 0.4, accent: true}, {kind: 'text', text: `Market ${n}`, style: 'title'}]});
  const network = fakeNetwork({claudePlan: input => {
    // The continuity review reads the drafted shots with their words and redraws the ones that do not match.
    if (input.scenes) return {report: 'S01A now shows Ava reacting to the coin as it is named.', changes: input.scenes.some(scene => scene.label === 'S01') ? [{label: 'S01A', reason: 'Ava reacts on the word.', sketch: {...drawing(1), elements: drawing(1).elements.map(el => (el.kind === 'figure' ? {...el, expression: 'shocked'} : el))}}, {label: 'S99Z', reason: 'Not a shot.'}] : []};
    const scenes = [];
    // Parts of 16 sentences, planned in scenes of up to 8.
    const first = input.sentences[0].n, last = input.sentences.at(-1).n;
    for (let start = first; start <= last; start += 8) {
      const second = start + 4 <= last ? input.sentences.find(item => item.n === start + 1) : null;
      scenes.push({sentenceStart: start, sentenceEnd: Math.min(last, start + 7), purpose: start === 1 ? 'hook' : 'explain', direction: 'Draw the market.', onScreenText: '', shots: (second ? [1, 2] : [1]).map(k => ({source: 'generated-graphics', query: '', prompt: '', motion: 'static', notes: '', ...(k === 2 && second ? {cue: second.text.split(' ').slice(0, 2).join(' ')} : {}), sketch: drawing(start === 9 && k === 2 ? 99 : k)}))});
    }
    return {summary: 'Drawn markets.', cast: [{id: 'c1', name: 'Ava', role: 'the narrator', look: {hair: 'bun', hairColor: 'red', outfit: 'suit'}}], scenes};
  }});
  const {room, content, ids, store, styles, dataRoot, narrate} = setup(t, network, {styleKey: 'stickman-sketch-explainer', withVoice: false, storyMap: false});
  narrate(30);
  // The free planner gives every drawn shot a drawing made from its own narration, acted by a default narrator.
  const {manifest: rules} = room.createPlan(content.id, {mode: 'rules', requestedBy: 'Owner', contentRevision: content.revision});
  const ruleShots = rules.plan.scenes.flatMap(scene => scene.shots);
  assert.ok(ruleShots.length && ruleShots.every(shot => shot.source === 'generated-graphics' && Sk.validate(shot.sketch, {cast: rules.plan.cast}).engine === 'stickman'), 'Stickman draws by default');
  assert.deepEqual([rules.plan.engine, rules.plan.cast.map(item => item.name)], ['stickman', ['Narrator']]);
  // Claude designs the cast once; an unknown prop is left out with a named warning instead of failing the plan.
  const queued = room.createPlan(content.id, {mode: 'claude', requestedBy: 'Owner', contentRevision: content.revision, connector: ids.claude});
  await room.processNextPlan();
  const job = room.publicPlanJob(room.planJobRow(queued.job.id));
  assert.equal(job.status, 'completed', job.error);
  const system = network.calls.find(call => call.path === '/v1/messages').body.system;
  assert.match(system, /ENGINE\. This video uses one engine: Stickman animation[\s\S]*MOTION GRAPHICS are a layer of every engine[\s\S]*BUILD EVERY SHOT LIKE A SCENE/);
  assert.doesNotMatch(system, /What usually happens when engines mix/, 'a stickman video is not offered the other engines (0.37)');
  // The review is a second pass with each shot's own words; its redraws land in the plan with their reasons.
  const reviewCall = network.calls.filter(call => call.path === '/v1/messages').find(call => /continuity supervisor/.test(call.body.system));
  assert.ok(JSON.parse(reviewCall.body.messages[0].content).scenes[0].shots[0].words.length > 0, 'the review sees the words of each shot');
  assert.match(system, /"cast": \[characters\]/);
  let plan = latestManifest(room, content.id);
  assert.deepEqual(plan.plan.cast.map(item => [item.id, item.name, item.look.hair, item.look.outfit]), [['c1', 'Ava', 'bun', 'suit']]);
  assert.equal(plan.plan.scenes[0].shots[0].sketch.elements[0].look.hair, 'bun', 'every shot draws the character with the same look');
  assert.equal(plan.plan.scenes[0].shots[0].sketch.elements[0].expression, 'shocked', 'the review redrew S01A');
  assert.deepEqual(plan.plan.review.changes, [{label: 'S01A', reason: 'Ava reacts on the word.'}]);
  assert.match(plan.plan.review.report, /Ava reacting to the coin/);
  assert.ok(plan.warnings.some(item => /^S02B drawing: Element 2: "dragon" is not in the prop library/.test(item)), plan.warnings.join(' | '));
  assert.deepEqual(plan.plan.scenes[1].shots[1].sketch.elements.map(el => el.kind), ['figure', 'text']);
  // A shot with a cue starts when its words are spoken, not at an even split of the scene.
  const scene = plan.plan.scenes[0], cueShot = scene.shots[1], spoken = Cap.wordTimings({sentences: plan.plan.sentences, pauses: [], narrationSeconds: plan.plan.timing.narrationSeconds});
  assert.ok(cueShot.cue);
  assert.equal(cueShot.startSeconds, Math.round(Sk.matchPhrase(spoken.filter(word => word.start >= scene.startSeconds), cueShot.cue).seconds * 1000) / 1000);
  assert.notEqual(cueShot.startSeconds, Math.round((scene.startSeconds + scene.durationSeconds / 2) * 1000) / 1000);
  // The owner redraws one shot (checked strictly); the others keep theirs.
  const first = plan.plan.scenes[0].shots[0], second = plan.plan.scenes[0].shots[1];
  assert.throws(() => room.editManifest(plan.id, {op: 'update-shot', shotId: first.id, sketch: {elements: [{kind: 'prop', prop: 'dragon'}]}, createdBy: 'Owner', expectedRevision: plan.revision}), /Drawing: Element 1 prop must be one of/);
  plan = room.editManifest(plan.id, {op: 'update-shot', shotId: first.id, sketch: {elements: [{kind: 'figure', who: 'c1', pose: 'cheer'}]}, createdBy: 'Owner', expectedRevision: plan.revision});
  assert.deepEqual([plan.plan.scenes[0].shots[0].sketch.elements[0].pose, plan.plan.scenes[0].shots[0].sketch.elements[0].look.hair], ['cheer', 'bun']);
  assert.deepEqual(plan.plan.scenes[0].shots[1].sketch, second.sketch);
  assert.equal(plan.plan.scenes[0].shots[1].cue, second.cue, 'cues survive an edit');
  plan = approvePlan(room, plan);
  // The program draws a preview of each shot itself: a local video clip, kept with its drawing, selected for the shot.
  const {queued: count} = room.queueDrawAll(plan.id, {requestedBy: 'Owner'});
  assert.equal(count, plan.plan.scenes.flatMap(item => item.shots).length);
  // Drawing is local and free: a browser that stalls once (a busy or waking PC) is tried again on a fresh browser.
  const {MotionRenderer} = require('../motion'), render = MotionRenderer.prototype.render;
  let stalls = 0;
  MotionRenderer.prototype.render = function (...args) { if (!stalls++) throw new Error('The browser did not answer Runtime.evaluate in time.'); return render.apply(this, args); };
  let drawn;
  try { drawn = await room.processNextVisual(); } finally { MotionRenderer.prototype.render = render; }
  assert.equal(stalls, 2);
  assert.equal(drawn?.status, 'completed', JSON.stringify(store.db.prepare("SELECT error FROM visual_jobs WHERE status='failed'").all()));
  const asset = room.assetRow(drawn.result.assetId), probe = JSON.parse(asset.probe), rights = JSON.parse(asset.rights);
  assert.deepEqual([asset.origin, asset.media_type, asset.mime, probe.width, probe.height], ['drawn', 'video', 'video/mp4', 1280, 720]);
  assert.deepEqual([rights.basis, rights.synthetic, rights.disclosure], ['own-drawing', false, 'none']);
  assert.ok(probe.durationSeconds >= plan.plan.scenes[0].shots[0].durationSeconds, 'a drawn clip is never shorter than its shot');
  assert.equal(store.db.prepare('SELECT asset_id FROM visual_selections WHERE content_id=? AND shot_id=?').get(content.id, drawn.shotId).asset_id, asset.id);
  assert.throws(() => room.queueDrawAll(plan.id, {requestedBy: 'Owner'}), /already shows its current drawing, or is being drawn/);
  // Drawn styles render through the montage assembler: the renderer is no longer a blocker.
  const renders = new RenderRoom(store, styles, room, {dataRoot});
  assert.equal(renders.inputs(store.content(content.id)).blockers.some(item => /renderer/.test(item)), false);
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
  const {server, sceneRoom} = createApp({dataFile: path.join(dir, 'workspace.sqlite'), worker: false, protector, providerFetch: fakeNetwork().fetch, voiceOptions: {ffmpeg: 'missing-ffmpeg', ffprobe: 'missing-ffprobe'}});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(() => { fs.rmSync(dir, {recursive: true, force: true}); resolve(); }); }));
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

test('atelier shots: Claude plans an art direction and frames, a frame worker designs each, the program checks it and Room 04 draws it', {skip: skip || (findBrowser() ? false : 'No Edge or Chrome on this machine')}, async t => {
  const good = id => `<template><div id="root" data-composition-id="${id}" data-width="1920" data-height="1080" data-duration="3"><div id="${id}-bg" class="clip" data-start="0" data-duration="30"></div><div id="${id}-hero">45</div><style>#${id}-bg{position:absolute;inset:0;background:#2A3350}#${id}-hero{position:absolute;left:0;right:0;top:30%;text-align:center;font:900 200px Bahnschrift;color:#F7F4EE}</style><script>const tl = gsap.timeline({paused: true}); tl.fromTo('#${id}-hero', {opacity: 0, y: 40}, {opacity: 1, y: 0, duration: 0.5, ease: 'power3.out'}, 0.1); window.__timelines["${id}"] = tl;</script></div></template>`;
  let lastRaw = '', redesignFails = false;
  const asked = [], frame = n => ({blueprint: 'dataviz-countup', posture: 'adapt', focal: 'the number', roles: 'number = foreground subject', beats: [{show: 'the number counts up in the centre'}], motions: ['counting-dynamic-scale', 'not-a-rule'], type: 'evidence', persuasion: 'worked example', beat: `surprise ${n}`});
  const network = fakeNetwork({claudePlan: input => {
    if (input.drawNow) return {report: 'Drew the shots that were not designed.', changes: input.drawNow.map(label => ({label, reason: 'A counter carries the number.', sketch: {engine: 'motion', elements: [{kind: 'text', style: 'counter', text: '45', x: 0.5, y: 0.4}]}}))};
    if (input.raw) {
      const packet = JSON.parse(input.raw.split('\n\n')[0]), retry = input.raw.includes('failed these checks');
      asked.push(`${packet.frameId}${retry ? ':retry' : ''}`);
      lastRaw = input.raw;
      if (packet.frameId === 's01a' && redesignFails) return 'No composition this time.';
      if (packet.frameId === 's01b' && !retry) return '<template><div data-composition-id="s01b"><script>const x = Math.random();</script></div></template>';
      if (packet.frameId === 's02a') return 'Here is a sketch of my idea, not a composition.';
      return good(packet.frameId);
    }
    const all = input.sentences, half = Math.ceil(all.length / 2);
    const scenes = [[all[0].n, all[half - 1].n], [all[half].n, all.at(-1).n]].map(([start, end], k) => ({sentenceStart: start, sentenceEnd: end, purpose: k ? 'explain' : 'hook', direction: 'Make the numbers land.', onScreenText: '',
      shots: [{source: 'generated-graphics', query: '', prompt: '', motion: 'zoom', notes: '', frame: frame(k * 2 + 1)}, k ? {source: 'generated-graphics', query: '', prompt: '', motion: 'zoom', notes: 'A human reaction.', sketch: {engine: 'stickman', set: 'bank', elements: [{kind: 'figure', who: 'c1', pose: 'shock', x: 0.4, y: 0.8}]}} : {source: 'generated-graphics', query: '', prompt: '', motion: 'zoom', notes: '', frame: frame(2)}]}));
    return {summary: 'Numbers that hit.', cast: [{id: 'c1', name: 'Ava', role: 'the viewer', look: {hair: 'bun'}}], scenes,
      direction: {read: 'Money history told plainly, where every number lands like a fact you can hold.', dials: {variance: 4, motion: 5, density: 3}, palette: {canvas: '#10131A', ink: '#F7F4EE', accent: '#E0753E', support: '#3A6EA5'}, fonts: {display: 'Bahnschrift', body: 'Comic Neue'}, motion: 'power3 settles, reveals on the voice', signature: 'one counting ring', avoid: ['purple gradients']}};
  }});
  const {room, content, ids, store, narrate} = setup(t, network, {styleKey: 'atelier', withVoice: false, storyMap: false});
  narrate(40);
  const queued = room.createPlan(content.id, {mode: 'claude', requestedBy: 'Owner', contentRevision: content.revision, connector: ids.claude});
  await room.processNextPlan();
  const job = room.publicPlanJob(room.planJobRow(queued.job.id));
  assert.equal(job.status, 'completed', job.error);
  const system = network.calls.find(call => call.path === '/v1/messages').body.system;
  assert.match(system, /SCENE CRAFT[\s\S]*ATELIER SHOTS[\s\S]*dataviz-countup/, 'the planner reads the scene craft and the atelier catalog');
  // One frame worker answer per atelier shot; a failed check is asked again once with its findings.
  assert.deepEqual(asked.slice(0, 5), ['s01a', 's01b', 's01b:retry', 's02a', 's02a:retry']);
  const manifest = latestManifest(room, content.id), byLabel = Object.fromEntries(shots(manifest).map(shot => [shot.label, shot]));
  assert.equal(manifest.plan.direction.fonts.body, 'Segoe UI', 'a font that is not installed falls back, with a named warning');
  assert.ok(manifest.warnings.some(item => /Comic Neue/.test(item)) && manifest.warnings.some(item => /not-a-rule/.test(item)));
  assert.deepEqual(byLabel.S01A.frame.motions, ['counting-dynamic-scale']);
  assert.match(byLabel.S01A.frame.html, /data-composition-id="s01a"/);
  assert.ok(byLabel.S01B.frame.html, 'fixed on the second answer');
  assert.equal(byLabel.S02A.frame.html, undefined);
  assert.ok(byLabel.S02A.sketch, 'a shot whose design failed is drawn from its words');
  assert.ok(byLabel.S02B.sketch && !byLabel.S02B.frame, 'a drawn shot can sit beside atelier shots');
  const atelierShots = shots(manifest).filter(shot => shot.frame).length;
  assert.deepEqual([manifest.plan.compose.shots, manifest.plan.compose.designed], [atelierShots, atelierShots - 1]);
  assert.ok(manifest.plan.compose.notes.some(item => /^S02A: the composition did not pass its checks/.test(item)));
  const frames = store.db.prepare("SELECT status FROM intelligence_usage WHERE kind='atelier_frame'").all();
  assert.deepEqual([frames.length, frames.every(row => row.status === 'settled')], [asked.length, true], 'each answer is reserved and settled on its own');
  // An owner edit keeps the designed frames, the art direction and the compose report.
  const edited = room.editManifest(manifest.id, {op: 'update-scene', sceneId: manifest.plan.scenes[0].id, direction: 'Open on the number.', createdBy: 'Owner', expectedRevision: manifest.revision});
  assert.equal(shots(edited).filter(shot => shot.frame?.html).length, atelierShots - 1);
  assert.deepEqual([edited.plan.direction, edited.plan.compose], [manifest.plan.direction, manifest.plan.compose]);
  // Room 04 draws the designed shots from their compositions (and the others from their sketches).
  approvePlan(room, edited);
  const drawCount = shots(edited).filter(shot => shot.source === 'generated-graphics').length;
  assert.equal(room.queueDrawAll(edited.id, {requestedBy: 'Owner'}).queued, drawCount);
  for (let k = 0; k < drawCount; k++) assert.equal((await room.processNextVisual())?.status, 'completed');
  const asset = store.db.prepare("SELECT rights, probe FROM visual_assets WHERE origin='drawn' AND shot_id=?").get(byLabel.S01A.id);
  assert.equal(JSON.parse(asset.rights).basis, 'own-composition');
  assert.ok(JSON.parse(asset.probe).durationSeconds > 0.5);
  // Redrawing the same design is skipped.
  assert.throws(() => room.queueDrawAll(edited.id, {requestedBy: 'Owner'}), /already shows its current drawing/);
  // One shot is designed again on its own (one answer, the owner's reason as the brief); every other shot keeps its
  // ID and its design. A redesign that fails its checks keeps the current design.
  const before = latestManifest(room, content.id), target = shots(before).find(shot => shot.label === 'S01A');
  const redesign = reason => room.redesignFrame(before.id, {shotId: target.id, reason, requestedBy: 'Owner', connector: ids.claude, expectedRevision: before.revision});
  assert.throws(() => room.redesignFrame(before.id, {shotId: byLabel.S02B.id, requestedBy: 'Owner', connector: ids.claude, expectedRevision: before.revision}), /Only a designed/);
  redesignFails = true;
  const failed = redesign('Open on the full number.');
  await room.processNextPlan();
  assert.match(room.publicPlanJob(room.planJobRow(failed.job.id)).error, /S01A did not pass its checks, so the shot keeps its current design/);
  assert.equal(latestManifest(room, content.id).id, before.id);
  redesignFails = false;
  const second = redesign('Open on the full number, not an empty field.');
  await room.processNextPlan();
  const secondJob = room.publicPlanJob(room.planJobRow(second.job.id));
  assert.deepEqual([secondJob.status, secondJob.redesign.label, secondJob.redesign.tokens > 0], ['completed', 'S01A', true]);
  const after = latestManifest(room, content.id);
  assert.equal(asked.at(-1), 's01a');
  assert.match(lastRaw, /owner asks for a new design of this shot:\nOpen on the full number, not an empty field\./);
  assert.deepEqual(shots(after).map(shot => shot.id), shots(before).map(shot => shot.id));
  assert.deepEqual(shots(after).filter(shot => shot.label !== 'S01A').map(shot => shot.frame?.html || null), shots(before).filter(shot => shot.label !== 'S01A').map(shot => shot.frame?.html || null));
  assert.ok(shots(after).find(shot => shot.label === 'S01A').frame.html);
  assert.ok(after.plan.compose.tokens > before.plan.compose.tokens, 'the redesign adds its tokens to the report');
  // The owner can drop a design: the shot is then drawn from its words.
  const dropped = room.editManifest(after.id, {op: 'update-shot', shotId: target.id, frame: null, createdBy: 'Owner', expectedRevision: after.revision});
  assert.ok(!shots(dropped).find(shot => shot.id === target.id).frame && shots(dropped).find(shot => shot.id === target.id).sketch);
  // A shot whose design failed (S02A) gets a real drawing from Claude; every other shot keeps its ID and design.
  const undesigned = shots(dropped).filter(shot => shot.frame && !shot.frame.html).map(shot => shot.label);
  assert.deepEqual(undesigned, ['S02A']);
  const redraw = room.redrawUndesigned(dropped.id, {requestedBy: 'Owner', connector: ids.claude, expectedRevision: dropped.revision});
  await room.processNextPlan();
  const redrawn = latestManifest(room, content.id), redrawJob = room.publicPlanJob(room.planJobRow(redraw.job.id));
  assert.deepEqual([redrawJob.status, redrawJob.redraw.count, redrawJob.usage.status], ['completed', 1, 'settled']);
  const s02a = shots(redrawn).find(shot => shot.label === 'S02A');
  assert.ok(!s02a.frame && s02a.sketch.engine === 'motion', 'drawn by Claude, no longer a pending design');
  assert.deepEqual(shots(redrawn).map(shot => shot.id), shots(dropped).map(shot => shot.id));
  assert.deepEqual(shots(redrawn).filter(shot => shot.label !== 'S02A').map(shot => shot.frame?.html || null), shots(dropped).filter(shot => shot.label !== 'S02A').map(shot => shot.frame?.html || null));
  assert.ok(redrawn.plan.review.changes.some(item => item.label === 'S02A'));
  assert.throws(() => room.redrawUndesigned(redrawn.id, {requestedBy: 'Owner', connector: ids.claude, expectedRevision: redrawn.revision}), /Every planned designed shot is designed/);
});
