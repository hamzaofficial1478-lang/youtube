'use strict';
// 0.115 (owner request 2026-11-23): Muse clips may speak the narration or keep their natural sound, and Fish Audio's
// voice library is searched for a narrator like the competitors' (their voice is described, never cloned).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Mu = require('../muse');
const A = require('../audio');
const M = require('../music');
const R = require('../render');
const S = require('../style');
const V = require('../voice-match');
const {Store} = require('../store');

test('muse.js: the clip speaks its own words with the narrator voice, keeps only ambience, or stays silent', () => {
  const base = {shot: {label: 'S01A', prompt: 'Wide shot: a raft drifts on a grey sea under low clouds.', motion: 'static', durationSeconds: 8}, words: 'The sea had no mercy that night.'};
  const speaking = Mu.direction({...base, sound: 'muse', speech: {words: 'The sea had no mercy', voice: 'deep calm male documentary narrator', delivery: 'grave, slow, a pause before "mercy"', craft: 'Land the last word of a line, then breathe.', lessons: 'Low, unhurried delivery with long pauses before reveals.'}});
  assert.match(speaking.text, /Spoken in this clip, word for word and nothing else: "The sea had no mercy"/);
  assert.match(speaking.text, /Voice: deep calm male documentary narrator; this line grave, slow/);
  // 0.116: the voice is led by the channel's voice skills and what the watched competitors' narration teaches.
  assert.match(speaking.text, /Voice craft \(the channel's voice skills\): Land the last word/);
  assert.match(speaking.text, /How the niche's best narrators deliver \(techniques only; never imitate their voice\): Low, unhurried/);
  assert.match(speaking.text, /No music/);
  assert.doesNotMatch(speaking.text, /No speech/);
  assert.equal(speaking.sound, 'muse');
  assert.equal(speaking.speech.words, 'The sea had no mercy');
  assert.match(Mu.direction({...base, sound: 'ambience'}).text, /only the natural sound of this place/);
  const silent = Mu.direction(base);
  assert.match(silent.text, /No speech or music needed/);
  assert.equal(silent.sound, 'narrator');
  // Muse asked to speak with no words for the shot falls back to the silent clip.
  assert.match(Mu.direction({...base, sound: 'muse', speech: {words: ''}}).text, /No speech or music needed/);
});

test('0.116: Muse speaks only in a video made from Muse clips; a video that mixes Muse with its engine keeps the narrator', () => {
  assert.equal(Mu.soundOf({sources: ['ai-video']}), 'muse', 'a video made from Muse clips speaks with Muse by default');
  assert.equal(Mu.soundOf({sources: ['ai-video'], museSound: 'narrator'}), 'narrator', 'unless the owner chose the narrator');
  assert.equal(Mu.soundOf({sources: ['ai-video'], museSound: 'ambience'}), 'ambience');
  assert.equal(Mu.soundOf({sources: ['generated-graphics', 'ai-video'], museSound: 'muse'}), 'narrator', 'a mixed video keeps one narrator');
  assert.equal(Mu.soundOf({sources: ['generated-graphics', 'ai-video'], museSound: 'ambience'}), 'ambience');
  assert.equal(Mu.soundOf({sources: ['generated-graphics']}), 'narrator');
  const doc = structuredClone(S.LAUNCH_PROFILES.find(item => item.spec.renderer.adapter === 'ffmpeg-montage').spec);
  doc.visuals = {...doc.visuals, sources: ['generated-graphics', 'ai-video'], primarySource: 'generated-graphics', aiDisclosure: 'always-disclose', museSound: 'muse'};
  assert.throws(() => S.validateStyleSpec(doc), /Muse can speak only in a video where every shot is a Muse clip/);
  doc.visuals = {...doc.visuals, sources: ['ai-video'], primarySource: 'ai-video'};
  assert.equal(S.validateStyleSpec(doc).visuals.museSound, 'muse');
});

test('0.116: Muse is an option of every engine; the planner keeps its clips and is told where Muse serves', () => {
  const E = require('../engines');
  for (const adapter of ['ffmpeg-sketch', 'canvas-frames', 'atelier', 'ffmpeg-montage', 'story-mix']) {
    const spec = structuredClone(S.LAUNCH_PROFILES.find(item => item.spec.renderer.adapter === adapter).spec);
    spec.visuals.sources = [...spec.visuals.sources.filter(source => source !== 'ai-video'), 'ai-video'];
    const planner = E.plannerSources(spec, spec.visuals.sources);
    assert.ok(planner.sources.includes('ai-video'), `${adapter} keeps its Muse clips`);
    assert.ok(planner.sources.includes('generated-graphics'), `${adapter} keeps its own engine`);
  }
  const stick = String(E.promptGuide('stickman', {sources: ['generated-graphics', 'ai-video']}));
  assert.match(stick, /except the AI video \(Muse\) shots placed as the WHERE MUSE line says/);
  assert.doesNotMatch(String(E.promptGuide('stickman', {sources: ['generated-graphics']})), /WHERE MUSE/);
  assert.match(String(E.promptGuide('atelier', {sources: ['generated-graphics', 'ai-video']})), /live action \(a Muse shot/);
  assert.match(Mu.MIX_LINE, /^WHERE MUSE, WHERE THE ENGINE/);
});

test('style and audio settings: what is heard over a Muse clip is checked', () => {
  assert.deepEqual(S.MUSE_SOUNDS, ['narrator', 'ambience', 'muse']);
  assert.deepEqual(A.settings({clipSound: {mode: 'voice', levelDb: 0}}).clipSound, {mode: 'voice', levelDb: 0});
  assert.deepEqual(A.settings({clipSound: {mode: 'ambience'}}).clipSound, {mode: 'ambience', levelDb: -14});
  assert.throws(() => A.settings({clipSound: {mode: 'loud'}}), /Clip sound must be one of/);
  assert.throws(() => A.settings({clipSound: {mode: 'voice', extra: 1}}), /Unsupported clip sound/);
  assert.equal(A.mixes({clipSound: {mode: 'ambience', levelDb: -14}}), true);
  assert.equal(A.mixes({clipSound: {mode: 'off', levelDb: -14}}), false);
});

test('music.js: Muse speaking mutes the narration over its clip; ambience is laid under the voice', () => {
  const clips = [{start: 2, seconds: 3, inSeconds: 0.5}];
  const settings = {music: {...A.MUSIC_DEFAULTS}, sfx: A.SFX_DEFAULTS};
  const voice = M.mixGraph({clips, settings: {...settings, clipSound: {mode: 'voice', levelDb: 0}}});
  assert.match(voice, /volume='if\(between\(t,2,5\),0,1\)':eval=frame\[nar\]/);
  assert.match(voice, /\[1:a\]aformat=sample_rates=48000:channel_layouts=stereo,atrim=0\.5:3\.5,/);
  assert.match(voice, /\[nar\]\[c0\]amix=inputs=2:normalize=0:duration=first,asplit=3\[voice\]\[key\]\[level\]/);
  const ambience = M.mixGraph({clips, settings: {...settings, clipSound: {mode: 'ambience', levelDb: -14}}});
  assert.doesNotMatch(ambience, /eval=frame/);
  assert.match(ambience, /volume=-14dB,adelay=2000\|2000\[c0\]/);
  assert.match(ambience, /\[voice\]\[c0\]amix=inputs=2/);
  // 0.116: a clip slowed to fill its shot plays its sound slowed alike (it takes seconds x speed of its file).
  assert.match(M.mixGraph({clips: [{start: 2, seconds: 5, inSeconds: 1, speed: 0.8}], settings: {...settings, clipSound: {mode: 'voice', levelDb: 0}}}), /atrim=1:5,asetpts=PTS-STARTPTS,atempo=0\.8,/);
  assert.doesNotMatch(voice, /atempo/, 'a clip at its own speed is not stretched');
  // Off: the clip's sound is not used at all.
  assert.doesNotMatch(M.mixGraph({clips, settings: {...settings, clipSound: {mode: 'off'}}}), /\[c0\]/);
});

test('real FFmpeg: over a speaking Muse clip the narration steps aside and the clip is heard', {skip: !R.resolveExecutable('ffmpeg') && 'FFmpeg is not installed'}, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'muse-voice-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  // The narration is a 1 kHz tone for 8 s; the clip speaks a 400 Hz tone, placed from 2 s to 5 s.
  await R.run('ffmpeg', ['-hide_banner', '-nostdin', '-f', 'lavfi', '-i', 'sine=f=1000:d=8:sample_rate=48000', '-y', path.join(dir, 'voice.wav')]);
  await R.run('ffmpeg', ['-hide_banner', '-nostdin', '-f', 'lavfi', '-i', 'sine=f=400:d=4:sample_rate=48000', '-y', path.join(dir, 'clip.wav')]);
  fs.writeFileSync(path.join(dir, 'graph.txt'), M.mixGraph({clips: [{start: 2, seconds: 3, inSeconds: 0}], settings: {music: {...A.MUSIC_DEFAULTS}, sfx: A.SFX_DEFAULTS, clipSound: {mode: 'voice', levelDb: 0}}}));
  await R.run('ffmpeg', ['-hide_banner', '-nostdin', '-i', 'voice.wav', '-i', 'clip.wav', '-filter_complex_script', 'graph.txt', '-map', '[out]', '-y', 'mix.wav'], {cwd: dir});
  const level = async (from, to, band) => Number(/RMS level dB: (-?[\d.]+|-inf)/.exec((await R.run('ffmpeg', ['-hide_banner', '-nostdin', '-i', 'mix.wav', '-af', `atrim=${from}:${to},${band},astats=measure_overall=RMS_level:measure_perchannel=none`, '-f', 'null', '-'], {cwd: dir})).stderr)[1].replace('-inf', '-200'));
  const narrationBand = 'bandpass=f=1000:width_type=q:w=8', clipBand = 'bandpass=f=400:width_type=q:w=8';
  // A plain sine is about -23 dB RMS; the narration band during the clip holds only the 400 Hz tone's leak (about -47).
  const before = await level(0.5, 1.5, narrationBand), during = await level(2.5, 4.5, narrationBand), clip = await level(2.5, 4.5, clipBand), after = await level(5.5, 7.5, narrationBand);
  assert.ok(before > -26, `the narration plays before the clip (${before})`);
  assert.ok(during < before - 20, `the narration steps aside while the clip speaks (${during})`);
  assert.ok(clip > -26, `the clip is heard (${clip})`);
  assert.ok(after > -26, `the narration comes back after the clip (${after})`);
});

const ITEMS = [
  {_id: 'voiceDeep01', title: 'Deep Documentary Narrator', description: 'calm deep male voice for history documentaries', tags: ['deep', 'male', 'documentary'], languages: ['en'], licensed: true, task_count: 90000, like_count: 300, state: 'trained', author: {nickname: 'fish'}, samples: [{title: 'Sample', text: 'In the year 1520...', audio: 'https://cdn.fish.audio/samples/deep.mp3'}]},
  {_id: 'voiceGirl02', title: 'Bright Young Female', description: 'energetic female voice', tags: ['female', 'energetic'], languages: ['en'], licensed: false, task_count: 500, state: 'trained', samples: [{audio: 'https://cdn.fish.audio/samples/bright.mp3'}]},
  {_id: 'voiceEvil03', title: 'Elsewhere', description: 'sample on another host', tags: ['deep'], languages: ['en'], licensed: false, task_count: 10, state: 'trained', samples: [{audio: 'https://evil.example.com/x.mp3'}]},
  {_id: 'bad id!', title: 'Broken'},
  {_id: 'voiceTrain04', title: 'Still training', state: 'training'},
];

test('voice-match.js: library voices are read safely and ranked against the description', () => {
  assert.equal(V.voiceOf(ITEMS[3]), null, 'an unsafe id is dropped');
  assert.equal(V.voiceOf(ITEMS[4]), null, 'a voice still training is dropped');
  assert.equal(V.voiceOf(ITEMS[2]).samples.length, 0, 'samples only from Fish Audio\'s own https hosts');
  assert.equal(V.voiceOf(ITEMS[0]).page, 'https://fish.audio/m/voiceDeep01');
  assert.equal(V.fishHost('https://cdn.fish.audio/a.mp3'), true);
  assert.equal(V.fishHost('http://cdn.fish.audio/a.mp3'), false);
  assert.equal(V.fishHost('https://fish.audio.evil.com/a.mp3'), false);
  const want = V.readMatch('Here: {"description": "a calm, deep male documentary narrator", "gender": "male", "age": "mature", "pace": "measured", "queries": ["deep documentary narrator", "calm history storyteller"], "tags": ["deep", "Calm", "two words"], "why": "competitors use one"}');
  assert.deepEqual(want.tags, ['deep', 'calm']);
  assert.equal(want.gender, 'male');
  assert.throws(() => V.readMatch('{"description": "x", "queries": []}'), /no search words/);
  assert.throws(() => V.readMatch('no json'), /did not answer with a voice description/);
  const ranked = V.rank(ITEMS.map(V.voiceOf).filter(Boolean), want);
  assert.equal(ranked[0].id, 'voiceDeep01');
  assert.ok(ranked.findIndex(item => item.id === 'voiceGirl02') > 0, 'the other gender ranks lower');
  // The casting prompt never asks for a person or a competitor's own voice, and carries the studies as data.
  const messages = V.matchMessages({family: {niche: 'History'}, lessons: {channels: ['Rival']}, guidance: null});
  assert.match(messages[0].content, /never a specific real person/);
  assert.match(messages[1].content, /^UNTRUSTED CONTROL ROOM DATA:/);
  // Without an AI the studies' own words make the search.
  const plain = V.plainMatch({family: {niche: 'Ancient history'}, lessons: {studies: [{subjects: {voice: {verdict: 'A deep, calm male narrator, slow and grave.', steps: []}}}]}});
  assert.equal(plain.gender, 'male');
  assert.equal(plain.pace, 'slow');
  assert.ok(plain.tags.includes('deep') && plain.tags.includes('calm'));
});

test('VoiceMatcher: searches Fish Audio with the key in the header, licensed voices by default, and remembers the pick', async t => {
  const store = new Store(':memory:');
  t.after(() => store.close());
  const family = store.saveFamily({name: 'Old Worlds', tier: 'A', countries: ['United States'], audience: 'Adults who like ancient history told as stories.', niche: 'Ancient history stories', locales: ['en-US'], timezone: 'Asia/Karachi', monthlyBudget: 50, cadence: 2, format: 'long-form', monthlyTokenLimit: 900000, scriptTokenLimit: 8000, researchTokenLimit: 8000, competitors: ['https://www.youtube.com/@RivalHistory']});
  const KEY = 'fish-key-0123456789abcdef', calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({url: String(url), options});
    if (String(url).startsWith('https://api.fish.audio/model')) return new Response(JSON.stringify({total: ITEMS.length, items: ITEMS}), {headers: {'content-type': 'application/json'}});
    if (String(url) === 'https://cdn.fish.audio/samples/deep.mp3') return new Response(Buffer.from('ID3fake'), {headers: {'content-type': 'audio/mpeg'}});
    return new Response('no', {status: 404});
  };
  const connectors = {list: () => [{id: 'fish', provider: 'fish-audio', hasKey: true, test: {status: 'passed'}}], key: () => KEY};
  const matcher = new V.VoiceMatcher(store, {connectors, lessons: () => ({channels: ['RivalHistory'], studies: [{subjects: {voice: {verdict: 'Deep calm male narrator', steps: []}}}]}), fetch: fetchImpl});
  await assert.rejects(matcher.find(family.id, {requestedBy: 'x'}), /2-80 characters/);
  const match = await matcher.find(family.id, {requestedBy: 'Owner'});
  const searches = calls.filter(call => call.url.startsWith('https://api.fish.audio/model'));
  assert.ok(searches.length >= 2);
  for (const call of searches) {
    assert.equal(call.options.headers.Authorization, `Bearer ${KEY}`);
    assert.equal(call.options.redirect, 'error');
    assert.match(call.url, /licensed=true/);
    assert.match(call.url, /language=en/);
    assert.doesNotMatch(call.url, new RegExp(KEY));
  }
  assert.equal(match.source, 'program');
  assert.deepEqual(match.wanted.studied, ['RivalHistory']);
  assert.equal(match.candidates[0].id, 'voiceDeep01');
  assert.equal(match.candidates.filter(item => item.id === 'voiceDeep01').length, 1, 'one entry per voice');
  assert.equal(match.candidates[0].samples[0].src, `/api/voice-matches/${match.id}/sample/0/0`, 'the page plays samples through the program');
  const sample = await matcher.sample(match.id, 0, 0);
  assert.equal(sample.type, 'audio/mpeg');
  await assert.rejects(matcher.sample(match.id, 0, 5), /not available/);
  assert.throws(() => matcher.choose(match.id, {voiceId: 'nope'}), /Choose one of the voices found/);
  assert.deepEqual(matcher.choose(match.id, {voiceId: 'voiceDeep01'}), {voiceId: 'voiceDeep01', title: 'Deep Documentary Narrator', page: 'https://fish.audio/m/voiceDeep01', licensed: true});
  // The chosen voice in words leads Muse when the clips speak.
  assert.match(store.chosenVoice(family.id), /like the "Deep Documentary Narrator" voice/);
  assert.match(store.narratorVoice(family.id), /Deep Documentary Narrator/);
  // Community voices only when asked.
  calls.length = 0;
  await matcher.find(family.id, {requestedBy: 'Owner', community: true});
  assert.ok(calls.every(call => !/licensed=true/.test(call.url)));
  // No tested Fish Audio connection: nothing is searched.
  const without = new V.VoiceMatcher(store, {connectors: {list: () => [], key: () => null}, fetch: fetchImpl});
  await assert.rejects(without.find(family.id, {requestedBy: 'Owner'}), /Connect Fish Audio/);
  // A refused key is named and the key never appears in the message.
  const refused = new V.VoiceMatcher(store, {connectors, fetch: async () => new Response('', {status: 401})});
  await assert.rejects(refused.find(family.id, {requestedBy: 'Owner'}), error => /refused the API key/.test(error.message) && !error.message.includes(KEY));
});

test('VoiceMatcher: with an AI the voice is described inside the channel\'s reservation and its words make the search', async t => {
  const store = new Store(':memory:');
  t.after(() => store.close());
  const family = store.saveFamily({name: 'Old Worlds', tier: 'A', countries: ['United States'], audience: 'Adults who like ancient history told as stories.', niche: 'Ancient history stories', locales: ['en-US'], timezone: 'Asia/Karachi', monthlyBudget: 50, cadence: 2, format: 'long-form', monthlyTokenLimit: 900000, scriptTokenLimit: 8000, researchTokenLimit: 8000, competitors: ['https://www.youtube.com/@RivalHistory']});
  const asked = [], titles = [];
  const brain = {call: async (fam, request) => { asked.push(request); return {content: JSON.stringify({description: 'Warm British storyteller', gender: 'any', pace: 'measured', queries: ['warm british storyteller'], tags: ['warm']}), provider: 'chatgpt'}; }};
  let down = true;
  const fetchImpl = async url => { if (down) return new Response('', {status: 503}); titles.push(new URL(url).searchParams.get('title')); return new Response(JSON.stringify({items: ITEMS.slice(0, 2)}), {headers: {'content-type': 'application/json'}}); };
  const matcher = new V.VoiceMatcher(store, {connectors: {list: () => [{id: 'fish', provider: 'fish-audio', hasKey: true, test: {status: 'passed'}}], key: () => 'fish-key-0123456789abcdef'}, brain, fetch: fetchImpl});
  // Review finding 5: Fish fails after the AI answered; the description is kept and searched again without the AI.
  await assert.rejects(matcher.find(family.id, {requestedBy: 'Owner', ai: 'chatgpt'}), /answered HTTP 503/);
  const kept = matcher.state()[0];
  assert.deepEqual([kept.wanted.description, kept.candidates.length, asked.length], ['Warm British storyteller', 0, 1]);
  down = false;
  const match = await matcher.find(family.id, {requestedBy: 'Owner', ai: 'again', again: kept.id});
  assert.equal(asked.length, 1, 'the AI is not asked twice');
  assert.equal(match.id, kept.id);
  assert.ok(match.candidates.length > 0);
  await assert.rejects(matcher.find(family.id, {requestedBy: 'Owner', ai: 'again', again: kept.id}), /found nothing can be searched again/);
  assert.equal(asked[0].kind, 'voice_match');
  assert.equal(asked[0].ai, 'chatgpt');
  assert.equal(asked[0].maxTokens, V.MATCH_TOKENS);
  assert.equal(match.source, 'chatgpt');
  assert.ok(titles.includes('warm british storyteller'));
  assert.equal(match.state === undefined, true);
  assert.equal(matcher.state()[0].id, match.id);
});

test('editing-room.js: the edit takes the clip sound the style chose; only clips made to speak replace the narrator', () => {
  const {EditingRoom} = require('../editing-room');
  const pick = EditingRoom.clipSoundFor, all = ['ai-video'];
  const inputs = (museSound, sources = all) => ({spec: {visuals: {sources, museSound}}, assets: {s1: {sound: 'speech'}, s2: {sound: 'natural'}, s3: {}}});
  assert.deepEqual(pick(inputs(undefined)).setting, {mode: 'voice', levelDb: 0}, 'a video made from Muse clips speaks with Muse by default');
  // Review finding 1: a clip made before Muse was asked to speak keeps the narrator over it, and the note says so.
  assert.match(pick(inputs('muse')).note, /Muse speaks in its 1 clip .*1 clip was made before Muse was asked to speak, so the narrator speaks over it/);
  assert.deepEqual(pick(inputs('ambience')).setting, {mode: 'ambience', levelDb: -14});
  assert.match(pick(inputs('ambience')).note, /natural sound under the narrator in 1 clip/);
  assert.equal(pick(inputs('narrator')), null);
  assert.equal(pick(inputs('muse', ['generated-graphics', 'ai-video'])), null, 'a mixed video never lets Muse speak');
  assert.equal(pick({spec: {visuals: {sources: all}}, assets: {s1: {sound: 'natural'}}}), null, 'no clip made to speak: the narrator speaks');
  const timeline = {fps: 30, clips: [{id: 'c1', label: 'S01A', shotId: 's1', start: 60, frames: 90, inSeconds: 0.5, speed: 0.85}, {id: 'c2', label: 'S01B', shotId: 's2', start: 150, frames: 30}, {id: 'c3', shotId: 's3', start: 180, frames: 30}]};
  const assets = {s1: {sound: 'speech', sha256: 'a'.repeat(64), relativePath: 'x.mp4'}, s2: {sound: 'natural', sha256: 'b'.repeat(64), relativePath: 'y.mp4'}, s3: {}};
  assert.deepEqual(EditingRoom.prototype.clipSounds({assets}, timeline, 'voice'), [{clipId: 'c1', label: 'S01A', start: 2, seconds: 3, inSeconds: 0.5, speed: 0.85, sha256: 'a'.repeat(64), relativePath: 'x.mp4'}]);
  assert.deepEqual(EditingRoom.prototype.clipSounds({assets}, timeline, 'ambience').map(item => item.clipId), ['c2'], 'ambience never lays a speaking clip under the narrator');
});
