'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const M = require('../music');
const A = require('../audio');
const R = require('../render');

test('a score keeps ordered cues inside the narration, never names an artist, and repairs Claude leniently', () => {
  const cue = (start, end, extra = {}) => ({start, end, mood: 'curious', energy: 3, prompt: 'Light pizzicato strings and soft marimba, 96 BPM, curious', entry: 'fade', exit: 'fade', ...extra});
  const score = M.validate({summary: 'Two moods.', cues: [cue(0, 20), cue(24, 70)]}, 60);
  assert.deepEqual(score.cues.map(item => [item.id, item.start, item.end]), [['cue001', 0, 20], ['cue002', 24, 60]], 'the gap is deliberate silence; the end is clamped');
  assert.throws(() => M.validate({cues: [cue(0, 20), cue(15, 40)]}, 60), /overlap/);
  assert.throws(() => M.validate({cues: [cue(0, 2)]}, 60), /at least 3 s/);
  assert.throws(() => M.validate({cues: [cue(0, 20, {prompt: 'Epic trailer music in the style of Hans Zimmer'})]}, 60), /names an artist/);
  assert.throws(() => M.validate({cues: [cue(0, 20, {energy: 9})]}, 60), /energy/);
  const warnings = [];
  const repaired = M.validate({cues: [cue(0, 20), cue(15, 40), cue(40, 41), cue(41, 55, {entry: 'boom'})]}, 60, {lenient: true, warn: message => warnings.push(message)});
  assert.deepEqual(repaired.cues.map(item => [item.start, item.end, item.entry]), [[0, 20, 'fade'], [20, 40, 'fade'], [41, 55, 'fade']]);
  assert.equal(warnings.length, 3);
  // The free score covers the whole narration with one cue per story section.
  const scenes = [{purpose: 'hook', startSeconds: 0, durationSeconds: 9}, {purpose: 'explain', startSeconds: 9, durationSeconds: 30}, {purpose: 'turn', startSeconds: 39, durationSeconds: 20}, {purpose: 'close', startSeconds: 59, durationSeconds: 14}];
  const free = M.rulesScore({scenes, durationSeconds: 73, moods: ['warm', 'playful'], niche: 'money history'});
  assert.equal(free.cues[0].start, 0);
  assert.equal(free.cues.at(-1).end, 73);
  assert.ok(free.cues.every((item, k) => k === 0 || item.start === free.cues[k - 1].end), 'no accidental gaps');
  assert.ok(free.cues.every(item => /no vocals/.test(item.prompt) && /money history/.test(item.prompt)));
  // Measured scene times are not round: back-to-back scenes at 17.518/17.519 s are not an overlap.
  const measured = M.rulesScore({scenes: [['hook', 0, 3.922], ['example', 3.922, 5.491], ['evidence', 9.413, 8.105], ['explain', 17.519, 9.936], ['explain', 27.454, 7.321], ['close', 34.776, 4.706]].map(([purpose, startSeconds, durationSeconds]) => ({purpose, startSeconds, durationSeconds})), durationSeconds: 39.48});
  assert.equal(measured.cues.length, 2);
  assert.ok(measured.cues.every((item, k) => k === 0 || item.start === measured.cues[k - 1].end) && measured.cues[1].end === 39.48);
  const request = M.musicRequest(score.cues[0]);
  assert.deepEqual([request.music_length_ms, request.force_instrumental, request.model_id], [21500, true, 'music_v2_5'], 'a fading exit gets 1.5 s more music to fade into');
});

test('sound effects follow the drawn shots at the chosen density, one at a time', () => {
  const sketch = {engine: 'stickman', transition: 'whip-left', elements: [{kind: 'text', style: 'stamp'}, {kind: 'fx', effect: 'burst'}, {kind: 'prop', prop: 'coin', enter: 'pop'}, {kind: 'fx', effect: 'cross'}]};
  const clip = {label: 'S01A', start: 2, seconds: 3, sketch, times: {elements: [{t0: 0.5}, {t0: 0.6}, {t0: 1.5}, {t0: 2.4}]}};
  assert.deepEqual(M.sfxEvents({clips: [clip], density: 'none'}), []);
  assert.deepEqual(M.sfxEvents({clips: [clip], density: 'subtle'}).map(item => item.kind), ['whoosh', 'stamp', 'wrong'], 'subtle keeps the openings, stamps and verdicts');
  const accent = M.sfxEvents({clips: [clip], density: 'accent'});
  assert.deepEqual(accent.map(item => [item.kind, item.seconds]), [['whoosh', 1.95], ['stamp', 2.64], ['wrong', 4.4]], 'the burst 0.04 s after the stamp gives way to it');
  assert.deepEqual(M.sfxEvents({clips: [clip], density: 'rich'}).map(item => item.kind), ['whoosh', 'stamp', 'cash', 'wrong']);
  assert.match(accent[1].reason, /stamp text in S01A/);
  assert.match(M.sfxRequest('pop', 'handdrawn').text, /hand-made/);
  // The audio settings carry the music and effects with bounds.
  assert.throws(() => A.settings({music: {enabled: true}}), /score/);
  assert.throws(() => A.settings({music: {levelLufs: -5}}), /-40 to -14/);
  assert.equal(A.mixes(A.settings({sfx: {enabled: true, density: 'none'}})), false);
  assert.equal(A.mixes(A.settings({sfx: {enabled: true}})), true);
});

test('real FFmpeg mixes music under the voice and effects on top, for every ducking choice', {skip: !R.resolveExecutable('ffmpeg') && 'FFmpeg is not installed'}, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mix-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const make = (name, source, seconds) => R.run('ffmpeg', ['-hide_banner', '-nostdin', '-f', 'lavfi', '-i', source, '-t', String(seconds), '-y', path.join(dir, name)]);
  await make('voice.wav', 'sine=frequency=300:sample_rate=48000', 8);
  await make('music.wav', 'sine=frequency=110:sample_rate=44100', 6.5);
  await make('hit.wav', 'anoisesrc=d=0.4:c=pink', 0.4);
  for (const duck of ['off', 'light', 'strong']) {
    const graph = M.mixGraph({music: [{start: 1, end: 6, entry: 'fade', exit: 'fade', measuredLufs: -20}], sfx: [{seconds: 2.5, measuredPeakDb: -6}], settings: {music: {...A.MUSIC_DEFAULTS, enabled: true, duck}, sfx: A.SFX_DEFAULTS}});
    fs.writeFileSync(path.join(dir, 'graph.txt'), graph);
    const out = path.join(dir, `mix-${duck}.wav`);
    await R.run('ffmpeg', ['-hide_banner', '-nostdin', '-i', 'voice.wav', '-i', 'music.wav', '-i', 'hit.wav', '-filter_complex_script', 'graph.txt', '-map', '[out]', '-ar', '48000', '-c:a', 'pcm_s24le', '-y', out], {cwd: dir});
    const probe = JSON.parse((await R.run('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', out])).stdout).streams[0];
    assert.equal(Math.round(Number(probe.duration) * 10) / 10, 8, `${duck}: the mix lasts exactly as long as the voice`);
    assert.equal(probe.channels, 2);
  }
});

test('the voice-over carve: under the voice the music gives up its speech band and keeps its bass', {skip: !R.resolveExecutable('ffmpeg') && 'FFmpeg is not installed'}, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carve-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  // The voice: a loud 2.5 kHz tone (lavfi's sine starts at 1/8, so volume 4 is 0.5) from 3 s on; the music: pink noise all the way through (seeded: unseeded noise differs every run and made this test flaky).
  await R.run('ffmpeg', ['-hide_banner', '-nostdin', '-f', 'lavfi', '-i', 'sine=f=2500:d=8:sample_rate=48000,volume=4,afade=t=in:st=3:d=0.01', '-y', path.join(dir, 'voice.wav')]);
  await R.run('ffmpeg', ['-hide_banner', '-nostdin', '-f', 'lavfi', '-i', 'anoisesrc=d=8:c=pink:a=0.4:r=48000:seed=7', '-y', path.join(dir, 'music.wav')]);
  const graph = M.mixGraph({music: [{start: 0, end: 8, entry: 'cut', exit: 'cut', measuredLufs: -20}], sfx: [], settings: {music: {...A.MUSIC_DEFAULTS, enabled: true, duck: 'medium'}, sfx: A.SFX_DEFAULTS}});
  assert.match(graph, /acrossover=split=300 4000/);
  fs.writeFileSync(path.join(dir, 'graph.txt'), graph);
  await R.run('ffmpeg', ['-hide_banner', '-nostdin', '-i', 'voice.wav', '-i', 'music.wav', '-filter_complex_script', 'graph.txt', '-map', '[out]', '-y', 'mix.wav'], {cwd: dir});
  // The music's level in one band before the voice (0.5-2.5 s) and under it (4-7.5 s); the voice is outside both bands.
  const level = async (from, to, band) => Number(/RMS level dB: (-?[\d.]+)/.exec((await R.run('ffmpeg', ['-hide_banner', '-nostdin', '-i', 'mix.wav', '-af', `atrim=${from}:${to},${band},astats=measure_overall=RMS_level:measure_perchannel=none`, '-f', 'null', '-'], {cwd: dir})).stderr)[1]);
  const drop = async band => (await level(0.5, 2.5, band)) - (await level(4, 7.5, band));
  const bass = await drop('lowpass=f=150,lowpass=f=150,lowpass=f=150'), speech = await drop('highpass=f=500,highpass=f=500,lowpass=f=1000,lowpass=f=1000,lowpass=f=1000');
  assert.ok(speech >= 6, `the speech band makes room (${speech.toFixed(1)} dB)`);
  assert.ok(speech - bass >= 3, `the bass stays (${bass.toFixed(1)} dB against ${speech.toFixed(1)} dB)`);
});

// 0.90 (owner report 2026-11-04: music and effects could not be heard). The old carve pushed the music about 20 dB
// under a normal voice. Now the dip under the voice is a few dB, it grows from light to strong, and the music between
// lines plays at its level.
test('0.90: under a normal voice the music dips a few dB, not twenty', {skip: !R.resolveExecutable('ffmpeg') && 'FFmpeg is not installed'}, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dip-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  // The voice: a 1 kHz tone at about -16 LUFS (lavfi's sine starts at 1/8) from 3 s on; the music: pink noise. The level is read with 1 kHz notched out.
  await R.run('ffmpeg', ['-hide_banner', '-nostdin', '-f', 'lavfi', '-i', 'sine=f=1000:d=8:sample_rate=48000,volume=1.94,afade=t=in:st=3:d=0.01', '-y', path.join(dir, 'voice.wav')]);
  await R.run('ffmpeg', ['-hide_banner', '-nostdin', '-f', 'lavfi', '-i', 'anoisesrc=d=8:c=pink:a=0.2:r=48000', '-y', path.join(dir, 'music.wav')]);
  const notch = Array(4).fill('bandreject=f=1000:width_type=q:w=1').join(',');
  const dips = {};
  for (const duck of ['light', 'medium', 'strong']) {
    fs.writeFileSync(path.join(dir, 'graph.txt'), M.mixGraph({music: [{start: 0, end: 8, entry: 'cut', exit: 'cut', measuredLufs: -20}], sfx: [], settings: {music: {...A.MUSIC_DEFAULTS, enabled: true, duck}, sfx: A.SFX_DEFAULTS}, voiceLufs: -16, targetLufs: -16}));
    await R.run('ffmpeg', ['-hide_banner', '-nostdin', '-i', 'voice.wav', '-i', 'music.wav', '-filter_complex_script', 'graph.txt', '-map', '[out]', '-y', 'mix.wav'], {cwd: dir});
    const level = async (from, to) => Number(/RMS level dB: (-?[\d.]+)/.exec((await R.run('ffmpeg', ['-hide_banner', '-nostdin', '-i', 'mix.wav', '-af', `atrim=${from}:${to},${notch},astats=measure_overall=RMS_level:measure_perchannel=none`, '-f', 'null', '-'], {cwd: dir})).stderr)[1]);
    dips[duck] = (await level(0.5, 2.5)) - (await level(4, 7.5));
  }
  assert.ok(dips.medium >= 2 && dips.medium <= 10, `medium dips ${dips.medium.toFixed(1)} dB`);
  assert.ok(dips.light < dips.medium && dips.medium < dips.strong, `light ${dips.light.toFixed(1)}, medium ${dips.medium.toFixed(1)}, strong ${dips.strong.toFixed(1)} dB`);
  assert.ok(dips.strong <= 16, `even strong leaves the music audible (${dips.strong.toFixed(1)} dB)`);
  // The levels follow the voice's real loudness: a narration kept at -20 LUFS gets music 4 dB lower than at -16.
  const gains = voiceLufs => M.mixGains({music: [{measuredLufs: -20}], settings: {music: {levelLufs: -22}, sfx: {levelDb: -12}}, voiceLufs, targetLufs: -16}).music[0];
  assert.equal(gains(-16) - gains(-20), 4);
});

// 0.41: an effect's hit lands on its moment (video-use: start the file its attack earlier).
test('0.60 library tracks fit their cues by mood, energy and length; effects fill their slots by name', () => {
  const track = (letter, title, tags, seconds) => ({id: letter.repeat(64), title, tags, seconds});
  const tracks = [track('a', 'Epic cinematic trailer', ['epic', 'cinematic', 'trailer'], 150), track('b', 'Calm piano', ['calm', 'piano'], 200), track('c', 'Mystery documentary', ['mystery', 'documentary'], 40), track('d', 'Happy ukulele', ['happy', 'ukulele'], 120)];
  const cues = [{start: 0, end: 20, mood: 'punchy', energy: 4, prompt: 'drums'}, {start: 20, end: 80, mood: 'curious', energy: 3, prompt: 'pizzicato'}, {start: 80, end: 110, mood: 'warm', energy: 2, prompt: 'reflective'}, {start: 110, end: 140, mood: 'warm', energy: 2, prompt: 'reflective'}];
  const assigned = M.assignTracks(cues, tracks);
  assert.deepEqual(assigned.map(cue => cue.track[0]), ['a', 'c', 'b', 'd'], 'by mood; never the same track twice in a row');
  assert.deepEqual(M.assignTracks([{...cues[0], track: 'd'.repeat(64)}], tracks)[0].track[0], 'd', 'a chosen track stays');
  assert.deepEqual(M.assignTracks(cues, []), cues, 'no library, nothing changes');
  assert.deepEqual(M.catalogue(tracks, {moods: ['curious'], limit: 2}).map(item => [item.ref, item.title]), [['T1', 'Mystery documentary'], ['T2', 'Calm piano']]);
  const sfx = [{id: '1'.repeat(64), title: 'whoosh 6316', tags: ['whoosh'], seconds: 1.2}, {id: '2'.repeat(64), title: 'long whoosh ambience', tags: ['whoosh'], seconds: 20}, {id: '3'.repeat(64), title: 'cash register', tags: ['cash', 'register'], seconds: 1.5}];
  const picked = M.pickEffects(sfx);
  assert.deepEqual([picked.whoosh.id[0], picked.cash.id[0], picked.thunder], ['1', '3', null], 'the short file that says it, nothing for a slot without one');
  assert.equal(M.pickEffects(sfx, {whoosh: '2'.repeat(64)}).whoosh.id[0], '2', 'the owner\'s pick wins');
  // A cue keeps its track and in-point; a bad track is refused for the owner, dropped with a warning for Claude.
  const score = M.validate({cues: [{start: 0, end: 10, mood: 'calm', energy: 2, prompt: 'soft piano under the voice', entry: 'fade', exit: 'fade', track: 'a'.repeat(64), offset: 4}]}, 30);
  assert.deepEqual([score.cues[0].track[0], score.cues[0].offset], ['a', 4]);
  assert.throws(() => M.validate({cues: [{...score.cues[0], track: 'T3'}]}, 30), /track must be a sound from the library/);
  const warnings = [];
  assert.equal(M.validate({cues: [{...score.cues[0], track: 'T3'}]}, 30, {lenient: true, warn: message => warnings.push(message)}).cues[0].track, undefined);
  assert.equal(warnings.length, 1);
  assert.match(M.mixGraph({music: [{start: 2, end: 12, entry: 'fade', exit: 'fade', measuredLufs: -14, offset: 4}], settings: {music: {levelLufs: -26, duck: 'off', fadeSeconds: 1}, sfx: {levelDb: -12}}}), /atrim=4:14,/, 'the music starts at its in-point');
});

test('an effect with a build before its hit starts that much earlier, at most two seconds', () => {
  const M = require('../music');
  assert.equal(M.attackOf('[silencedetect @ 0] silence_start: 0\n[silencedetect @ 0] silence_end: 0.355 | silence_duration: 0.355'), 0.355);
  assert.equal(M.attackOf('[silencedetect @ 0] silence_start: 1.2\n silence_end: 1.5'), 0, 'quiet later in the file is not an attack');
  assert.equal(M.attackOf(''), 0);
  assert.match(M.attackArgs('fx.mp3', -1.5).join(' '), /silencedetect=noise=-31.5dB:d=0.002/);
  const graph = attack => M.mixGraph({sfx: [{seconds: 2, measuredPeakDb: -1, attackSeconds: attack}], settings: {music: {levelLufs: -30, fadeSeconds: 1}, sfx: {levelDb: -6}}});
  assert.match(graph(0.35), /adelay=1650\|1650/);
  assert.match(graph(5), /adelay=0\|0/, 'a long riser starts at most two seconds early, never before zero');
  assert.match(graph(undefined), /adelay=2000\|2000/);
});

// 0.71 (owner request 2026-10-30): the approved competitor study's music lessons reach the music supervisor.
test('the music supervisor hears what the approved competitor study learned about music and sound', () => {
  const {musicLessons} = require('../competitor-intel'), {SoundtrackRoom} = require('../soundtrack');
  const blueprint = {editing: {observations: ['Fast cuts every two seconds in the hook.', 'Low piano score under the narration, silence before each reveal.'], adjustments: [{setting: 'audio.musicMoods', value: ['tense', 'curious'], reason: 'Both channels keep a tense, curious bed.'}, {setting: 'pacing.shotMaxSeconds', value: 6, reason: 'Shots stay short.'}]},
    adopt: [{area: 'editing', pattern: 'A short riser sound before every number reveal.', refs: ['C1']}], original: [{area: 'editing', contribution: 'Our own warm ambient bed instead of their piano.'}, {area: 'script', contribution: 'One story per video.'}],
    avoid: [{pattern: 'Loud trailer drums under speech', reason: 'It buries the voice.'}]};
  const lessons = musicLessons(blueprint, {learnedFrom: ['@MoneyMap']});
  assert.deepEqual(lessons.settings, [{setting: 'audio.musicMoods', value: ['tense', 'curious'], reason: 'Both channels keep a tense, curious bed.'}], 'only audio settings');
  assert.deepEqual([lessons.observations.length, lessons.learned.length, lessons.original.length, lessons.avoid.length, lessons.learnedFrom[0]], [1, 1, 1, 1, '@MoneyMap']);
  assert.match(lessons.rule, /never copy a track/);
  assert.equal(musicLessons({editing: {observations: ['Fast cuts.'], adjustments: []}, adopt: [], original: [], avoid: []}), null, 'nothing about sound, no guidance');
  const inputs = {family: {id: 'f1', niche: 'Money', audience: 'Adults', format: 'long-form'}, spec: {name: 'Style', audio: {musicMoods: ['calm']}}, engine: 'stickman', durationSeconds: 60, content: {title: 'Coins'}, voice: {},
    manifest: {plan: {scenes: [{label: 'S1', purpose: 'hook', startSeconds: 0, durationSeconds: 60, direction: 'Open.'}], sentences: [{n: 1, startSeconds: 0, text: 'Coins changed everything.'}]}}};
  const input = SoundtrackRoom.prototype.promptInput.call({store: {}, scenes: {competitorIntel: {musicGuidance: id => (id === 'f1' ? {analysisId: 'a1', ...lessons} : null)}}}, inputs);
  assert.equal(input.competitorGuidance.analysisId, 'a1');
  assert.match(M.messages(input)[0].content, /competitorGuidance/);
  assert.equal(SoundtrackRoom.prototype.promptInput.call({store: {}, scenes: {}}, inputs).competitorGuidance, undefined, 'no study, no guidance');
});

// 0.87 (owner request 2026-11-04: "fetch the sfx and music as per the video and script, matching its tone"):
// what is drawn is heard, a new place is heard once, and the story's world colours the music.
test('0.87: story sounds follow the drawings and places, the world colours the music, a missing story sound never blocks', () => {
  const sketch = (set, elements = []) => ({set, engine: 'stickman', camera: 'still', elements});
  const shots = [sketch('cave', [{kind: 'prop', prop: 'campfire'}, {kind: 'figure', pose: 'walk'}]), sketch('cave', [{kind: 'prop', prop: 'mammoth'}]), sketch('prehistoric', [{kind: 'crowd', count: 6}])];
  assert.deepEqual(M.neededEffects(shots, {density: 'accent'}), ['animal', 'crowd', 'fire', 'wind']);
  assert.deepEqual(M.neededEffects(shots, {density: 'none'}), []);
  const clips = shots.map((item, k) => ({label: `S0${k + 1}A`, start: k * 4, seconds: 4, sketch: item, times: null}));
  const events = M.sfxEvents({clips, density: 'accent'});
  assert.deepEqual(events.filter(item => /arriving/.test(item.reason)).map(item => item.kind), ['fire', 'wind'], 'the cave is heard once, then the open land');
  assert.ok(events.some(item => item.kind === 'animal' && /mammoth/.test(item.reason)));
  for (const kind of M.STORY_SFX) assert.ok(M.SFX[kind] && M.EFFECT_WORDS[kind]?.length, kind);
  const free = M.rulesScore({scenes: [{purpose: 'hook', startSeconds: 0, durationSeconds: 30}, {purpose: 'turn', startSeconds: 30, durationSeconds: 30}], durationSeconds: 60, moods: ['warm'], niche: 'stone age money', era: 'prehistoric'});
  assert.ok(free.cues.every(cue => /tribal/.test(cue.prompt)), free.cues[0].prompt);
  // The render leaves out a story sound the library lacks; the others are still required.
  const {SoundtrackRoom} = require('../soundtrack');
  const asset = {probe: {peakDb: -3}};
  const fakeRoom = {settings: () => ({source: 'library'}), library: () => [{kind: 'pop', asset}, {kind: 'fire', asset: null}, {kind: 'animal', asset: null}, {kind: 'wind', asset}, {kind: 'crowd', asset: null}], fileOf: () => ({relativePath: 'sound-library/x.mp3', sha256: 'x'})};
  const timeline = {fps: 30, captions: {groups: []}, clips: clips.map((clip, k) => ({id: `c${k}`, label: clip.label, start: clip.start * 30, frames: 120}))};
  const out = SoundtrackRoom.prototype.soundtrackFor.call(fakeRoom, {content: {id: 'v', familyId: 'f'}, timeline, config: {sfx: {enabled: true, density: 'accent'}}, drawings: Object.fromEntries(shots.map((item, k) => [`c${k}`, {sketch: item}]))});
  assert.deepEqual(out.skipped.sort(), ['animal', 'crowd', 'fire']);
  assert.ok(out.sfx.length && out.sfx.every(item => ['wind', 'pop'].includes(item.kind)), JSON.stringify(out.sfx.map(item => item.kind)));
  // 0.90: each story sound names its thing on screen, Freesound is searched for it, and the render plays the sound found
  // for that thing (a mammoth's trumpet, not any animal); the owner's pick for the slot still wins.
  assert.deepEqual(M.storySubjects(shots, {density: 'accent'}), [{kind: 'fire', subject: 'campfire'}, {kind: 'fire', subject: 'cave'}, {kind: 'animal', subject: 'mammoth'}, {kind: 'wind', subject: 'prehistoric'}, {kind: 'crowd', subject: 'crowd'}].sort((a, b) => (a.subject < b.subject ? -1 : 1)));
  assert.deepEqual(M.storySubjects(shots, {density: 'none'}), []);
  assert.equal(events.find(item => item.kind === 'animal').subject, 'mammoth');
  assert.equal(events.find(item => item.kind === 'pop')?.subject, undefined, 'only story sounds name a thing');
  const trumpet = {id: 'a'.repeat(64), kind: 'sfx', tags: ['animal', 'mammoth', 'elephant', 'trumpet'], title: 'elephant trumpet', seconds: 2};
  assert.equal(M.subjectEffect([trumpet, {...trumpet, id: 'b'.repeat(64), tags: ['animal', 'roar']}], 'animal', 'mammoth').id, trumpet.id);
  const withOwn = {...fakeRoom, sounds: {tracks: () => [trumpet]}, soundAsset: id => ({id, probe: {peakDb: -6}, library: {}}), settings: () => ({source: 'library', sfxPicks: {}})};
  const own = SoundtrackRoom.prototype.soundtrackFor.call(withOwn, {content: {id: 'v', familyId: 'f'}, timeline, config: {sfx: {enabled: true, density: 'accent'}}, drawings: Object.fromEntries(shots.map((item, k) => [`c${k}`, {sketch: item}]))});
  assert.ok(own.sfx.some(item => item.kind === 'animal' && item.measuredPeakDb === -6), 'the mammoth plays its own sound though the animal slot is empty');
  assert.ok(!own.skipped.includes('animal'));
  const picked = SoundtrackRoom.prototype.soundtrackFor.call({...withOwn, settings: () => ({source: 'library', sfxPicks: {animal: 'c'.repeat(64)}}), library: () => [{kind: 'pop', asset}, {kind: 'animal', asset}, {kind: 'wind', asset}]}, {content: {id: 'v', familyId: 'f'}, timeline, config: {sfx: {enabled: true, density: 'accent'}}, drawings: Object.fromEntries(shots.map((item, k) => [`c${k}`, {sketch: item}]))});
  assert.ok(picked.sfx.some(item => item.kind === 'animal' && item.measuredPeakDb === -3), 'the owner\'s pick for the slot wins');
});

// 0.91 (owner review 2026-11-04: "almost all the sound effects are pops; no cheers at the moment of joy, nothing at a
// loss, at a groan, at a new idea or the truth"): effects follow what the words mean, people walking on make no sound,
// a small pop only where nothing else sounds; the edit adds and removes effects; the owner's music feel.
test('0.91: sound effects follow the meaning of the words, pops are rare, and the edit adds or removes effects', () => {
  const sketch = elements => ({engine: 'stickman', set: 'prehistoric', camera: 'still', elements});
  const clips = [
    {label: 'S02C', start: 10, seconds: 4, sketch: sketch([{kind: 'figure'}, {kind: 'prop', prop: 'tree'}]), words: [{text: 'Then', start: 0.2}, {text: 'somebody', start: 0.5}, {text: 'wins.', start: 1.1}]},
    {label: 'S09B', start: 14, seconds: 4, sketch: sketch([{kind: 'figure'}, {kind: 'figure'}]), words: [{text: 'Two', start: 0.1}, {text: 'friends', start: 0.4}, {text: 'groan.', start: 0.9}]},
    {label: 'S12A', start: 18, seconds: 4, sketch: sketch([{kind: 'figure'}]), words: [{text: 'They', start: 0.1}, {text: 'lost', start: 0.4}, {text: 'everything.', start: 0.7}]},
    {label: 'S15A', start: 22, seconds: 4, sketch: sketch([{kind: 'prop', prop: 'lightbulb'}]), words: [{text: 'Then', start: 0.1}, {text: 'came', start: 0.3}, {text: 'an', start: 0.5}, {text: 'idea.', start: 0.6}]},
    {label: 'S16A', start: 26, seconds: 4, sketch: sketch([{kind: 'prop', prop: 'tree'}, {kind: 'prop', prop: 'tree'}, {kind: 'figure'}]), words: [{text: 'Nothing', start: 0.1}, {text: 'happened.', start: 0.6}]},
  ];
  const rich = M.sfxEvents({clips, density: 'rich'}), kinds = rich.map(item => item.kind);
  assert.ok(['cheer', 'groan', 'sad', 'ding'].every(kind => kinds.includes(kind)), kinds.join(' '));
  assert.equal(rich.find(item => item.kind === 'cheer').seconds, 11.1, 'the cheer lands on "wins"');
  assert.equal(rich.find(item => item.kind === 'groan').seconds, 14.9);
  assert.ok(kinds.filter(kind => kind === 'pop').length <= 1, `people walking on make no sound; a pop only once a shot (${kinds.join(' ')})`);
  assert.deepEqual(M.sfxEvents({clips, density: 'subtle'}).map(item => item.kind), ['cheer', 'groan', 'sad', 'ding'], 'even few effects keep the moments that matter');
  assert.deepEqual(M.meaningKinds('Two friends groan. The truth is simple. What if?', 'rich'), ['groan', 'boom', 'riser']);
  assert.deepEqual(M.neededEffects([], {density: 'accent', text: 'Somebody wins.'}), ['cheer'], 'Freesound is asked for the meanings the script needs');
  // The edit's own changes: take out every pop, add a gasp, take out the effect nearest a moment.
  const edited = M.applySfxEdits(rich, [{op: 'remove', kind: 'pop'}, {op: 'add', seconds: 20, kind: 'gasp'}, {op: 'remove', seconds: 14.8}]);
  assert.ok(!edited.some(item => item.kind === 'pop' || item.kind === 'groan'));
  assert.equal(edited.find(item => item.kind === 'gasp').reason, 'added in the edit');
  // The owner's music feel: one feel for the whole video, in long cues, searched by its own words.
  const free = M.rulesScore({scenes: [{purpose: 'hook', startSeconds: 0, durationSeconds: 40}, {purpose: 'turn', startSeconds: 40, durationSeconds: 360}], durationSeconds: 400, feel: 'calm but a bit energetic'});
  assert.deepEqual(free.cues.map(cue => [cue.start, cue.end, cue.mood, cue.energy]), [[0, 200, 'calm energetic', 3], [200, 400, 'calm energetic', 3]]);
  assert.match(free.summary, /calm but a bit energetic/);
  assert.equal(require('../sound-online').cueSearch(free.cues[0]).queries[0], 'calm energetic music');
});
