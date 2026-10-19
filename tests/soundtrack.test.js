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
  // The voice: a 2.5 kHz tone from 3 s on; the music: pink noise all the way through.
  await R.run('ffmpeg', ['-hide_banner', '-nostdin', '-f', 'lavfi', '-i', 'sine=f=2500:d=8:sample_rate=48000,volume=0.5,afade=t=in:st=3:d=0.01', '-y', path.join(dir, 'voice.wav')]);
  await R.run('ffmpeg', ['-hide_banner', '-nostdin', '-f', 'lavfi', '-i', 'anoisesrc=d=8:c=pink:a=0.4:r=48000', '-y', path.join(dir, 'music.wav')]);
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

// 0.41: an effect's hit lands on its moment (video-use: start the file its attack earlier).
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
