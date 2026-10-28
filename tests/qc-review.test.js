'use strict';
// P09 Review & QC: the consolidated review (review.js) and the render checks it relies on, with failing fixtures.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const R = require('../render');
const B = require('../editing-brain');
const Review = require('../review');

const hasFFmpeg = (() => { try { execFileSync('ffprobe', ['-version'], {stdio: 'ignore'}); execFileSync('ffmpeg', ['-version'], {stdio: 'ignore'}); return true; } catch { return false; } })();

const SENTENCES = [
  {n: 1, text: 'In 1347 a ship docked in Messina.', startSeconds: 0, durationSeconds: 3.2},
  {n: 2, text: 'Within months, 60% of the city was gone, and nobody knew why.', startSeconds: 3.2, durationSeconds: 4.7},
  {n: 3, text: 'Nobody.', startSeconds: 7.9, durationSeconds: 1.1},
];
const PAUSES = [{start: 2.9, end: 3.28}, {start: 4.4, end: 4.7}, {start: 6.3, end: 6.5}, {start: 7.6, end: 7.98}];
const SPEC = {name: 'Documentary Montage', canvas: {frameRate: 30}, pacing: {shotMinSeconds: 3, shotMaxSeconds: 8, hookShotMaxSeconds: 2.5, maxStaticHoldSeconds: 8}, transitions: {allowed: ['cut', 'crossfade'], default: 'cut', maxDurationMs: 700}, motion: {cameraMoves: ['static', 'ken-burns'], intensity: 35}, typography: {headingFont: 'Georgia', bodyFont: 'Arial', maxWordsOnScreen: 8, minTextHeightPercent: 4}, palette: {background: '#0E0E0E', primary: '#F2EEE6', accent: '#C9A227'}, qc: {maxFrozenSeconds: 6, maxBlackSeconds: 1}};
const scenes = [{id: 'sc1', label: 'S01', purpose: 'hook', onScreenText: '', sentenceStart: 1, sentenceEnd: 3, shots: [{id: 'a', label: 'S01A', motion: 'ken-burns'}, {id: 'b', label: 'S01B', motion: 'ken-burns'}]}];
const assets = {a: {assetId: 'x1', mediaType: 'image', clipSeconds: null}, b: {assetId: 'x2', mediaType: 'video', clipSeconds: 20}};
const timeline = B.autoEdit({fps: 30, narrationSeconds: 9, sentences: SENTENCES, scenes, assets, spec: SPEC, pauses: PAUSES});
const cues = SENTENCES.map(item => ({n: item.n, start: item.startSeconds, end: item.startSeconds + item.durationSeconds, text: item.text}));
const passing = ['full decode', 'audio/video alignment', 'duration', 'frame', 'narration audio', 'black frames', 'frozen picture'].map(name => ({name, passed: true, detail: 'ok'}));
const result = (qc = passing) => ({qc, preset: {fps: 30}, sheet: {everySeconds: 2, frames: 5, cols: 5, rows: 1}, hook: {everySeconds: 0.5, frames: 10}});
const render = (extra = {}) => ({id: 'r1', status: 'completed', current: true, review: null, ...extra});

test('render checks: one decode error line fails, and sound must start and end with the picture', () => {
  assert.deepEqual(R.decodeCheck({stderr: ''}), {name: 'full decode', passed: true, detail: 'every video frame and audio packet decoded without an error'});
  const broken = R.decodeCheck({stderr: '[h264 @ 0x1] Invalid NAL unit size (17560 > 16521).\n[in#0] stream 1: partial file\n'});
  assert.equal(broken.passed, false);
  assert.match(broken.detail, /^2 decode errors: \[h264 @ 0x1\] Invalid NAL unit size/);
  assert.equal(R.decodeCheck({stderr: '', failed: true}).passed, false, 'a non-zero exit fails even without error lines');
  const streams = (audio = {}) => [{codec_type: 'video', start_time: '0.000000', duration: '40.000000'}, {codec_type: 'audio', start_time: '0.000000', duration: '40.000000', ...audio}];
  assert.equal(R.avAlignment(streams(), 30).passed, true);
  assert.equal(R.avAlignment(streams({start_time: '0.020000', duration: '40.021333'}), 30).passed, true, 'within one frame');
  const late = R.avAlignment(streams({start_time: '0.478000', duration: '40.021333'}), 30);
  assert.deepEqual([late.passed, late.detail], [false, 'audio starts +478 ms and ends +21 ms against the picture (limit 33 ms)']);
  assert.equal(R.avAlignment(streams({duration: '38.9'}), 30).passed, false, 'audio that ends early drifts');
  assert.equal(R.avAlignment(streams({duration: 'N/A'}), 30).passed, false, 'an unmeasured length never passes');
  assert.equal(R.avAlignment([{codec_type: 'video'}], 30).detail, 'no audio stream');
  assert.deepEqual(R.sheetGeometry({width: 1224, height: 148}, 5, 1), {cols: 5, rows: 1, width: 1224, height: 148, tileWidth: 240, tileHeight: 140});
});

test('real files: a damaged or truncated video fails the full decode, a shifted soundtrack fails alignment', {skip: hasFFmpeg ? false : 'FFmpeg/ffprobe are not installed on this machine'}, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-review-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const good = path.join(dir, 'good.mp4');
  execFileSync('ffmpeg', ['-hide_banner', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', '-y', good]);
  const decode = async file => R.decodeCheck(await R.run('ffmpeg', R.decodeArgs(file)).catch(error => ({stderr: error.stderr, failed: true})));
  assert.equal((await decode(good)).passed, true);
  const bytes = fs.readFileSync(good);
  fs.writeFileSync(path.join(dir, 'truncated.mp4'), bytes.subarray(0, Math.floor(bytes.length * 0.6)));
  const damaged = Buffer.from(bytes);
  for (let i = Math.floor(bytes.length * 0.5); i < Math.floor(bytes.length * 0.5) + 2000; i++) damaged[i] = (i * 7) & 255;
  fs.writeFileSync(path.join(dir, 'damaged.mp4'), damaged);
  assert.equal((await decode(path.join(dir, 'truncated.mp4'))).passed, false, 'a truncated tail');
  assert.equal((await decode(path.join(dir, 'damaged.mp4'))).passed, false, 'damaged bytes in the middle');
  const shifted = path.join(dir, 'shifted.mp4');
  execFileSync('ffmpeg', ['-hide_banner', '-v', 'error', '-i', good, '-itsoffset', '0.5', '-i', good, '-map', '0:v', '-map', '1:a', '-c', 'copy', '-y', shifted]);
  const probe = file => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', file]).toString()).streams;
  assert.equal(R.avAlignment(probe(good), 30).passed, true);
  assert.equal(R.avAlignment(probe(shifted), 30).passed, false);
});

test('blockers come first and cannot be accepted: out of date, changed files, no decode proof', () => {
  assert.equal(Review.build({render: render({status: 'failed'})}).status, 'blocked');
  const stale = Review.build({render: render({current: false, review: {decision: 'passed'}}), result: result(), edit: timeline, cues});
  assert.deepEqual([stale.status, stale.verdictStale, stale.blockers.map(item => item.code)], ['blocked', true, ['out-of-date']]);
  assert.deepEqual(Review.build({render: render(), result: result(), integrity: [{kind: 'video', ok: true}, {kind: 'hook', ok: false}]}).blockers.map(item => item.message), ['The hook file of this render is missing or changed. Render again.']);
  assert.equal(Review.build({render: render(), result: result(passing.slice(1))}).blockers[0].code, 'checks-missing', 'a render from before 0.16 must be rendered again');
  const failedDecode = [{name: 'full decode', passed: false, detail: '1 decode error: x'}, ...passing.slice(1)];
  assert.equal(Review.build({render: render(), result: result(failedDecode)}).blockers[0].code, 'decode-failed');
  assert.equal(Review.build({render: render(), result: result()}).status, 'awaiting-verdict');
  assert.equal(Review.build({render: render({review: {decision: 'passed'}}), result: result()}).status, 'approved');
  assert.equal(Review.build({render: render({review: {decision: 'changes_requested'}}), result: result()}).status, 'changes-requested');
});

test('one timecoded list: failed checks per moment, the critic with its fixes, captions one by one, each with a repair', () => {
  const clip = timeline.clips[1];
  const qc = passing.map(item => item.name === 'black frames' ? {...item, passed: false, spans: [{start: clip.start / 30 + 0.2, end: clip.start / 30 + 1.7}]} : item);
  qc.push({name: 'audio loudness', passed: false, detail: '-30 LUFS'});
  const captions = structuredClone(timeline.captions);
  captions.groups[1].edited = true;
  captions.groups[2].words.shift();
  const edit = {...timeline, captions};
  const findings = [
    {severity: 'suggestion', code: 'static-hold', message: 'A long still.', fix: 'Add a move.', clipId: timeline.clips[0].id, at: 0, op: {type: 'set-move', clipId: timeline.clips[0].id, kind: 'push-in'}},
    {severity: 'nitpick', code: 'captions-fast', message: 'Summary.', fix: 'x'},
    {severity: 'suggestion', code: 'late-payoff', message: 'No payoff.', fix: 'Move it.'},
  ];
  const report = Review.build({render: render(), result: result(qc), edit, findings, cues, urls: {sheet: '/s', hook: '/h'}});
  assert.deepEqual(report.blockers, []);
  const dark = report.findings.find(item => item.code === 'black frames');
  assert.deepEqual([dark.severity, dark.source, dark.label, dark.repair], ['critical', 'render', clip.label, {room: 'editing', command: 'tl-clip', id: clip.id, label: `Change ${clip.label}`}]);
  assert.match(dark.message, /^Black frames from \d+\.\d to \d+\.\d s\.$/);
  assert.deepEqual(report.findings.find(item => item.code === 'audio loudness').repair, {room: 'audio', command: 'audio-settings', label: 'Open the Audio Room'});
  assert.deepEqual(report.findings.find(item => item.code === 'static-hold').repair, {room: 'editing', command: 'tl-fix', id: '0', label: 'Apply the fix'});
  assert.equal(report.findings.some(item => item.code === 'captions-fast'), false, 'the critic summary is replaced by caption-by-caption entries');
  const corrected = report.findings.find(item => item.code === 'caption-edited');
  assert.deepEqual([corrected.at, corrected.repair.command, corrected.repair.id], [captions.groups[1].start, 'tl-caption', captions.groups[1].id]);
  assert.equal(report.findings.find(item => item.code === 'caption-words').severity, 'critical', 'with the narration sentences the review proves every word is captioned once');
  // Captions faster than reading speed share one cause, the voice: one item with every moment, sent to the Voice Room.
  const rushed = structuredClone(captions);
  for (const group of rushed.groups.slice(0, 3)) group.end = group.start + 0.4;
  const fastReport = Review.build({render: render(), result: result(passing), edit: {...timeline, captions: rushed}, findings: [], urls: {}});
  const fast = fastReport.findings.filter(item => item.code === 'caption-too-fast');
  assert.equal(fast.length, 1);
  assert.equal(fast[0].moments.length, 3);
  assert.deepEqual([fast[0].label, fast[0].repair], ['3 captions', {room: 'voice', label: 'Open the Voice Room'}]);
  assert.match(fast[0].fix, /cannot be slower than the voice/);
  assert.deepEqual(report.counts, {critical: report.findings.filter(item => item.severity === 'critical').length, suggestion: 2, nitpick: 1});
  const timed = report.findings.filter(item => item.at !== null).map(item => item.at);
  assert.deepEqual(timed, [...timed].sort((a, b) => a - b), 'sorted by time, untimed last');
  assert.equal(report.findings.at(-1).at, null);
  // The aligned read: every caption in one sentence row, the clips and cuts under each sentence, a contact-sheet tile.
  assert.deepEqual(report.timeline.map(row => row.n), [1, 2, 3]);
  assert.deepEqual(report.timeline.flatMap(row => row.captions.map(item => item.id)), captions.groups.map(group => group.id));
  assert.equal(report.timeline[1].captions.find(item => item.id === captions.groups[1].id).edited, true);
  assert.ok(report.timeline.every(row => row.clips.length >= 1));
  assert.equal(report.timeline.reduce((sum, row) => sum + row.cuts, 0) <= timeline.clips.length - 1, true);
  assert.deepEqual(report.timeline.map(row => row.tile), [1, 2, 4]);
  assert.equal(report.timeline.reduce((sum, row) => sum + row.issues, 0), report.findings.filter(item => item.at !== null).length);
  assert.deepEqual([report.sheets.overview.url, report.sheets.hook.url], ['/s', '/h']);
  assert.ok(report.notChecked.length >= 3, 'the page says what the review does not measure');
});
