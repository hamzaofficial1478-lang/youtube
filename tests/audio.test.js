'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const A = require('../audio');
const R = require('../render');

const report = overrides => JSON.stringify({input_i: '-16.05', input_tp: '-2.10', input_lra: '1.10', input_thresh: '-26.05', target_offset: '0.05', ...overrides});
const stream = {codec_name: 'aac', duration: '5.00', channels: 2, sample_rate: '48000'};

test('audio settings accept only bounded narration controls and preserve the input', () => {
  assert.deepEqual(A.settings({}), A.DEFAULTS);
  for (const bad of [null, [], {mode: 'music'}, {schema: 'future'}, {targetLufs: '-16'}, {targetLufs: Infinity}, {truePeakDb: 0}, {targetLufs: -25}, {file: '../x.wav'}, {filter: 'amovie=http://example.com'}]) assert.throws(() => A.settings(bad));
  const input = {mode: 'source', targetLufs: -17.24};
  assert.equal(A.settings(input).targetLufs, -17.2);
  assert.equal(input.targetLufs, -17.24);
});

test('two-pass audio uses finite measured input and never edits the narration clock', () => {
  const measured = A.measurement(report());
  assert.match(A.loudnorm(A.DEFAULTS, measured), /measured_I=-16.05.*linear=true/);
  const args = A.finishArgs('approved.wav', 'finished.wav', A.DEFAULTS, measured);
  assert.equal(args[args.indexOf('-ac') + 1], '2');
  assert.equal(args[args.indexOf('-ar') + 1], '48000');
  assert.ok(!args.some(arg => /silenceremove|atempo|atrim|afade/.test(arg)));
  assert.ok(!A.finishArgs('in', 'out', {mode: 'source'}, measured).join(' ').includes('loudnorm'));
  assert.throws(() => A.loudnorm(A.DEFAULTS, A.measurement(report({input_i: '-inf'}))), /could not be measured/);
  assert.throws(() => A.measurement('missing'), /no loudness/);
});

test('encoded audio QC fails closed on silent, clipped, malformed, short or wrong-layout output', () => {
  const qc = (stderr = report(), info = stream, config = A.DEFAULTS) => A.qc({stderr, stream: info, expectedSeconds: 5, config});
  assert.equal(qc().passed, true);
  assert.equal(qc(report({input_tp: '0.2'})).passed, false);
  assert.equal(qc(report({input_i: '-inf', input_tp: '-inf'})).passed, false);
  assert.equal(qc(report({input_i: ''})).passed, false);
  assert.equal(qc(report({input_i: '-21'})).passed, false);
  assert.equal(qc(report({input_i: '-21'}), stream, {mode: 'source'}).passed, true);
  assert.equal(qc(report(), {...stream, duration: '4.8'}).passed, false);
  assert.equal(qc(report(), {...stream, channels: 1}).passed, false);
  assert.equal(qc(report(), {...stream, sample_rate: '44100'}).passed, false);
  const silence = qc('silence_start: 1\nsilence_end: 4\n' + report());
  assert.equal(silence.silenceRatio, 0.6);
  assert.equal(silence.passed, false);
  assert.equal(qc('silence_start: 2\n' + report()).silenceRatio, 0.6, 'trailing silence is counted');
});

test('real FFmpeg finishes mono narration deterministically and detects full silence', {skip: !R.resolveExecutable('ffmpeg') || !R.resolveExecutable('ffprobe')}, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audio-finish-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const source = path.join(dir, 'source.wav');
  await R.run('ffmpeg', ['-hide_banner', '-nostdin', '-f', 'lavfi', '-i', 'sine=frequency=500:duration=5:sample_rate=44100', '-af', 'volume=0.1', '-y', source]);
  const sourceHash = R.fileSha256(source);
  const measured = A.measurement((await R.run('ffmpeg', A.analysisArgs(source, A.DEFAULTS, {source: true}))).stderr);
  const hashes = [];
  for (const name of ['one', 'two']) {
    const wav = path.join(dir, `${name}.wav`), encoded = path.join(dir, `${name}.m4a`);
    await R.run('ffmpeg', A.finishArgs(source, wav, A.DEFAULTS, measured));
    hashes.push(R.fileSha256(wav));
    await R.run('ffmpeg', ['-hide_banner', '-nostdin', '-i', wav, '-c:a', 'aac', '-b:a', '128k', '-y', encoded]);
    const parsed = JSON.parse((await R.run('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', encoded])).stdout);
    const qc = A.qc({stderr: (await R.run('ffmpeg', A.analysisArgs(encoded, A.DEFAULTS))).stderr, stream: parsed.streams[0], expectedSeconds: 5, config: A.DEFAULTS});
    assert.equal(qc.passed, true, JSON.stringify(qc));
  }
  assert.equal(hashes[0], hashes[1]);
  assert.equal(R.fileSha256(source), sourceHash);
  const silent = path.join(dir, 'silence.wav');
  await R.run('ffmpeg', ['-hide_banner', '-nostdin', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '5', '-y', silent]);
  const empty = A.measurement((await R.run('ffmpeg', A.analysisArgs(silent, A.DEFAULTS))).stderr);
  assert.equal(empty.integratedLufs, null);
  assert.throws(() => A.finishArgs(silent, path.join(dir, 'invalid.wav'), A.DEFAULTS, empty), /could not be measured/);
});
