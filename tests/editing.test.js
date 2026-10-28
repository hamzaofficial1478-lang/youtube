'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {createHash, randomUUID} = require('node:crypto');
const {Store} = require('../store');
const {StyleLibrary} = require('../style');
const {QuotaLedger} = require('../intel-sources');
const VS = require('../visual-sources');
const {SceneRoom, splitSentences, timeSentences} = require('../scene-room');
const {RenderRoom} = require('../render-room');
const {FrameScanner} = require('../frame-scan');
const {PackagingRoom} = require('../packaging-room');
const {ConnectorSlots} = require('../connectors');
const {EditingRoom} = require('../editing-room');
const {LocalizationRoom} = require('../localization-room');
const {SkillsEngine} = require('../skills');
const B = require('../editing-brain');
const T = require('../transitions');
const Cap = require('../captions');
const R = require('../render');
const {createApp} = require('../server');

const hasFFmpeg = (() => { try { execFileSync('ffprobe', ['-version'], {stdio: 'ignore'}); execFileSync('ffmpeg', ['-version'], {stdio: 'ignore'}); return true; } catch { return false; } })();
const skip = hasFFmpeg ? false : 'FFmpeg/ffprobe are not installed on this machine';
const sha = buffer => createHash('sha256').update(buffer).digest('hex');
const ffmpeg = args => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', ...args]);

// A documentary-montage style as the brain sees it.
const SPEC = {
  name: 'Documentary Montage', canvas: {frameRate: 30},
  pacing: {shotMinSeconds: 3, shotMaxSeconds: 8, hookShotMaxSeconds: 2.5, maxStaticHoldSeconds: 8},
  transitions: {allowed: ['cut', 'crossfade', 'dip-to-black'], default: 'cut', maxDurationMs: 700},
  motion: {cameraMoves: ['static', 'ken-burns', 'pan', 'zoom'], intensity: 35},
  typography: {headingFont: 'Georgia', bodyFont: 'Arial', maxWordsOnScreen: 8, minTextHeightPercent: 4},
  palette: {background: '#0E0E0E', primary: '#F2EEE6', accent: '#C9A227'}, qc: {maxFrozenSeconds: 6, maxBlackSeconds: 1},
};
const TEXTS = ['In 1347 a ship docked in Messina.', 'Within months, 60% of the city was gone.', 'Nobody knew why.', 'Doctors wrote that "the air itself had turned to poison" in their reports.', 'But the real cause was hiding in plain sight.', 'Rats carried fleas, and fleas carried the plague.', 'By 1351 the plague had crossed Europe.', 'Today we know the bacterium by name.'];
function fixture({videoE = 2} = {}) {
  let t = 0;
  const sentences = TEXTS.map((text, index) => { const words = text.split(' ').length; const item = {n: index + 1, text, words, startSeconds: Math.round(t * 1000) / 1000, durationSeconds: words * 0.42}; t += words * 0.42; return item; });
  const scenes = [
    {id: 'sc1', label: 'S01', purpose: 'hook', onScreenText: '1347: the ship', sentenceStart: 1, sentenceEnd: 2, shots: [{id: 'a', label: 'S01A', motion: 'ken-burns'}, {id: 'b', label: 'S01B', motion: 'ken-burns'}]},
    {id: 'sc2', label: 'S02', purpose: 'evidence', onScreenText: '', sentenceStart: 3, sentenceEnd: 4, shots: [{id: 'c', label: 'S02A', motion: 'ken-burns'}, {id: 'd', label: 'S02B', motion: 'zoom'}]},
    {id: 'sc3', label: 'S03', purpose: 'turn', onScreenText: 'The hidden *cause*', sentenceStart: 5, sentenceEnd: 6, shots: [{id: 'e', label: 'S03A', motion: 'ken-burns'}, {id: 'f', label: 'S03B', motion: 'ken-burns'}]},
    {id: 'sc4', label: 'S04', purpose: 'close', onScreenText: '', sentenceStart: 7, sentenceEnd: 8, shots: [{id: 'g', label: 'S04A', motion: 'ken-burns'}]},
  ];
  const assets = {a: {assetId: 'A', mediaType: 'image'}, b: {assetId: 'B', mediaType: 'video', clipSeconds: 10}, c: {assetId: 'C', mediaType: 'image'}, d: {assetId: 'D', mediaType: 'image'}, e: {assetId: 'E', mediaType: 'video', clipSeconds: videoE}, f: {assetId: 'F', mediaType: 'image'}, g: {assetId: 'G', mediaType: 'image'}};
  return {sentences, scenes, assets, narrationSeconds: Math.round(t * 1000) / 1000};
}

test('narration pauses move the estimated sentence starts onto the real breaks', () => {
  assert.deepEqual(B.pausesFromSilence('[silencedetect @ x] silence_start: 2.51\n[silencedetect @ x] silence_end: 2.93 | silence_duration: 0.42\n[silencedetect @ x] silence_start: -0.01\n'), [{start: 2.51, end: 2.93}]);
  const {sentences, narrationSeconds} = fixture();
  const pauses = sentences.slice(1).map(item => ({start: item.startSeconds + 0.1, end: item.startSeconds + 0.45}));
  const aligned = B.alignSentences(sentences, pauses, narrationSeconds);
  assert.equal(aligned.method, 'pause-aligned');
  assert.equal(aligned.matched, sentences.length - 1);
  aligned.sentences.slice(1).forEach((item, index) => assert.ok(Math.abs(item.startSeconds - (sentences[index + 1].startSeconds + 0.37)) < 0.01, `sentence ${index + 2} lands just before its first word`));
  assert.ok(Math.abs(aligned.sentences.reduce((sum, item) => sum + item.durationSeconds, 0) - narrationSeconds) < 0.01);
  const none = B.alignSentences(sentences, [], narrationSeconds);
  assert.equal(none.method, 'word-share');
  assert.deepEqual(none.sentences.map(item => item.startSeconds), sentences.map(item => item.startSeconds));
});

test('a long narration stays on the voice: sentence ends beat comma pauses and an early drift never carries on', () => {
  // 60 sentences; years and numbers take longer to say than their word count, so a word-share estimate drifts
  // seconds ahead (the live 8-minute run drifted up to 6 s from 2:03). Commas leave short pauses as decoys.
  const texts = Array.from({length: 60}, (_, k) => (k < 30 ? `In ${1950 + k}, about ${20000 + k * 7} people waited ${k + 3}.` : k % 2 ? 'The signal travels fast, and it never stops.' : 'Here is the part most people never hear.'));
  const sentences = texts.map((text, k) => ({n: k + 1, text, words: text.split(' ').length}));
  let at = 0;
  const truth = [], pauses = [];
  for (const [k, item] of sentences.entries()) {
    truth.push(at);
    const speak = item.text.length * 0.06 + (item.text.match(/\d/g) || []).length * 0.12;
    const commas = (item.text.match(/,/g) || []).length;
    for (let c = 1; c <= commas; c++) pauses.push({start: at + speak * c / (commas + 1), end: at + speak * c / (commas + 1) + 0.45});
    at += speak + commas * 0.45;
    if (k < sentences.length - 1) { pauses.push({start: at, end: at + 0.9}); at += 0.9; }
  }
  const total = sentences.reduce((sum, item) => sum + item.words, 0);
  let elapsed = 0;
  for (const item of sentences) { item.startSeconds = elapsed; item.durationSeconds = at * item.words / total; elapsed += item.durationSeconds; }
  const aligned = B.alignSentences(sentences, pauses.sort((x, y) => x.start - y.start), at);
  assert.equal(aligned.matched, 59);
  aligned.sentences.forEach((item, k) => assert.ok(Math.abs(item.startSeconds - Math.max(0, truth[k] - 0.08)) < 0.02, `sentence ${k + 1} starts on its voice (${item.startSeconds} vs ${truth[k]})`));
  assert.ok(Math.max(...sentences.map((item, k) => Math.abs(item.startSeconds - truth[k]))) > 3, 'the word-share estimate itself drifts by seconds');
});

test('the auto edit is frame-exact, deterministic and explains every decision', () => {
  const {sentences, scenes, assets, narrationSeconds} = fixture();
  const input = {fps: 30, narrationSeconds, sentences, scenes, assets, spec: SPEC};
  const edit = B.autoEdit(input);
  assert.deepEqual(B.autoEdit(input), edit, 'same inputs, same edit');
  assert.equal(edit.totalFrames, Math.round(narrationSeconds * 30));
  assert.equal(edit.clips.reduce((sum, clip) => sum + clip.frames, 0), edit.totalFrames);
  assert.ok(edit.clips.every(clip => clip.reason.length > 10), 'every clip says why it is there');
  // Hook: the first shot stays inside the style's hook limit.
  assert.ok(edit.clips[0].frames <= 2.5 * 30);
  // Scenes start on their first sentence, so picture and narration stay locked.
  for (const scene of edit.scenes.slice(1)) assert.equal(scene.startFrame, Math.round(sentences[scene.sentenceStart - 1].startSeconds * 30));
  // Cuts inside a scene land on a sentence break when one is near (and never make a shot too short).
  const starts = new Set(sentences.map(item => Math.round(item.startSeconds * 30)));
  const snapped = edit.clips.filter(clip => /sentence break/.test(clip.reason));
  assert.ok(snapped.length >= 1);
  assert.ok(snapped.every(clip => starts.has(clip.start)));
  // Neighbouring stills never repeat a camera move; heroes exist; the close pulls out or holds.
  const stills = edit.clips.filter(clip => clip.mediaType === 'image');
  for (let k = 1; k < edit.clips.length; k++) if (edit.clips[k].move && edit.clips[k - 1].move) assert.notEqual(edit.clips[k].move.kind, edit.clips[k - 1].move.kind);
  assert.ok(stills.every(clip => B.MOVES.includes(clip.move.kind) && clip.moveReason));
  assert.ok(edit.clips.some(clip => clip.hero));
  // Joins: hard cuts inside scenes, a crossfade into the turn, never two soft transitions in a row.
  edit.joins.forEach((join, index) => { if (edit.clips[index].sceneId === edit.clips[index + 1].sceneId) assert.equal(join.type, 'cut'); });
  const intoTurn = edit.clips.findIndex(clip => clip.sceneId === 'sc3') - 1;
  assert.equal(edit.joins[intoTurn].type, 'crossfade');
  assert.ok(edit.joins.every((join, index) => !index || join.type === 'cut' || edit.joins[index - 1].type === 'cut'));
  // Video clips: a long clip skips its settling start; a short clip is flagged rather than silently frozen.
  assert.ok(edit.clips.find(clip => clip.shotId === 'b').inSeconds > 0);
  assert.ok(edit.clips.find(clip => clip.shotId === 'e').freezeSeconds > 0);
  // Graphics: plan text accepted, the turn becomes a title card with the owner's accent, numbers and quotes proposed.
  const byTemplate = template => edit.graphics.filter(item => item.template === template);
  assert.equal(byTemplate('scene-text')[0].status, 'accepted');
  assert.equal(byTemplate('scene-text')[0].start, 0, 'hook text is on screen at once');
  assert.deepEqual([byTemplate('title-card')[0].lines[0], byTemplate('title-card')[0].accent, byTemplate('title-card')[0].accentSource], ['The hidden cause', 'cause', 'owner marker']);
  assert.equal(byTemplate('stat')[0].lines[0], '60%');
  assert.equal(byTemplate('stat')[0].status, 'proposed');
  assert.equal(byTemplate('quote')[0].lines[0], 'the air itself had turned to poison');
  assert.ok(edit.graphics.every((item, index) => !index || item.start >= edit.graphics[index - 1].start + edit.graphics[index - 1].frames), 'one graphic at a time');
  assert.ok(edit.markers.some(marker => marker.kind === 're-hook'));
  // "Static" planned for a video shot does not freeze the still that filled it; a long static still gets a gentle push.
  const filled = structuredClone(scenes);
  filled[3].shots[0] = {...filled[3].shots[0], motion: 'static', source: 'stock-video'};
  const moved = B.autoEdit({...input, scenes: filled});
  assert.notEqual(moved.clips.find(clip => clip.shotId === 'g').move.kind, 'static');
  filled[3].shots[0].source = 'stock-image';
  const gentle = B.autoEdit({...input, scenes: filled, spec: {...SPEC, qc: {...SPEC.qc, maxFrozenSeconds: 3}}}).clips.find(clip => clip.shotId === 'g');
  assert.equal(gentle.move.kind, 'push-in');
  assert.match(gentle.moveReason, /reads as frozen/);
  assert.equal(B.autoEdit({...input, scenes: filled}).clips.find(clip => clip.shotId === 'g').move.kind, 'static', 'a short planned static hold stays static');
});

test('the transition brain: one primary between related scenes, an accent for a new topic or the turn, drawn moves never doubled', () => {
  const {sentences, scenes, assets, narrationSeconds} = fixture();
  const joinInto = (edit, id) => edit.joins[edit.clips.findIndex(clip => clip.sceneId === id) - 1];
  const withPurposes = purposes => scenes.map((scene, k) => ({...scene, purpose: purposes[k]}));
  // Medium energy (Story Mix): push between related scenes, zoom for the turn; the hook still ends on a cut.
  const story = {...SPEC, transitions: {allowed: ['cut', 'crossfade', 'push', 'slide', 'zoom'], maxDurationMs: 600}, motion: {...SPEC.motion, intensity: 60}};
  const related = B.autoEdit({fps: 30, narrationSeconds, sentences, scenes: withPurposes(['hook', 'context', 'explain', 'close']), assets, spec: story});
  assert.equal(joinInto(related, 'sc2').type, 'cut');
  assert.deepEqual([joinInto(related, 'sc3').type, joinInto(related, 'sc3').frames], ['push-left', 12]);
  assert.match(joinInto(related, 'sc3').reason, /Related scenes share the primary transition \(medium energy: push-left/);
  const turn = B.autoEdit({fps: 30, narrationSeconds, sentences, scenes: withPurposes(['hook', 'context', 'turn', 'close']), assets, spec: story});
  assert.equal(joinInto(turn, 'sc3').type, 'zoom-in');
  // Calm (hand-drawn): crossfades between related scenes, a wipe at a change of topic.
  const calm = {...SPEC, transitions: {allowed: ['cut', 'crossfade', 'dip-to-black', 'wipe'], maxDurationMs: 600}, motion: {...SPEC.motion, intensity: 20}};
  assert.deepEqual([joinInto(B.autoEdit({fps: 30, narrationSeconds, sentences, scenes: withPurposes(['hook', 'context', 'explain', 'close']), assets, spec: calm}), 'sc3').type], ['crossfade']);
  assert.equal(joinInto(B.autoEdit({fps: 30, narrationSeconds, sentences, scenes: withPurposes(['hook', 'context', 'example', 'close']), assets, spec: calm}), 'sc3').type, 'wipe-left');
  // A drawing that opens with its own move is the transition: the edit cuts into it.
  const drawn = B.autoEdit({fps: 30, narrationSeconds, sentences, scenes: withPurposes(['hook', 'context', 'explain', 'close']), assets: {...assets, e: {...assets.e, sketch: {transition: 'ink'}}}, spec: story});
  assert.match(joinInto(drawn, 'sc3').reason, /opens with its own ink move/);
  // The render draws each transition with its FFmpeg xfade.
  const files = Object.fromEntries(related.clips.map(clip => [clip.id, `${clip.id}.src`]));
  const plan = R.planTimeline({timeline: related, files, narration: {file: 'n.wav', durationSeconds: narrationSeconds}, format: 'long-form', workDir: '/w', outFile: '/w/o.mp4', graphics: false});
  assert.match(plan.final.args.join(' '), /xfade=transition=slideleft:duration=0\.4/);
});

test('the critic names the boring, lazy and amateur choices with a fix', () => {
  const {sentences, scenes, assets, narrationSeconds} = fixture();
  const edit = B.autoEdit({fps: 30, narrationSeconds, sentences, scenes, assets, spec: SPEC});
  const review = B.critique(edit, SPEC);
  const codes = review.findings.map(item => item.code);
  assert.ok(codes.includes('clip-freeze'), 'a clip shorter than its hold is a critical finding');
  assert.equal(review.findings.find(item => item.code === 'clip-freeze').severity, 'critical');
  assert.ok(codes.includes('hook-static'), 'opening on a still when the hook scene has motion');
  assert.deepEqual(review.findings.find(item => item.code === 'hook-static').op, {type: 'reorder', sceneId: 'sc1', clipId: 'cl_b', toIndex: 0});
  assert.ok(review.findings.every(item => item.fix && item.skill !== undefined));
  assert.ok(['strong', 'acceptable', 'revise', 'fail'].includes(review.slideshow.verdict));
  // A slideshow of equal static stills fails outright.
  const flat = structuredClone(edit);
  const per = Math.floor(flat.totalFrames / flat.clips.length);
  flat.clips.forEach((clip, index) => { clip.mediaType = 'image'; clip.assetId = `X${index}`; clip.start = index * per; clip.frames = index === flat.clips.length - 1 ? flat.totalFrames - index * per : per; clip.move = {kind: 'static', amount: 0}; clip.hero = false; delete clip.freezeSeconds; });
  flat.graphics = [];
  const bad = B.critique(flat, {...SPEC, qc: {...SPEC.qc, maxFrozenSeconds: 2}});
  assert.ok(bad.slideshow.score > review.slideshow.score);
  assert.ok(bad.findings.some(item => item.code === 'static-too-long' && item.severity === 'critical'));
  assert.ok(bad.findings.some(item => item.code === 'equal-holds'));
  // The brain fixes what it can by itself, says what it did, and leaves the rest listed.
  const {timeline: fixed, fixed: done} = B.autoFix(edit, SPEC);
  assert.ok(done.some(item => item.code === 'hook-static'));
  const after = B.critique(fixed, SPEC).findings;
  assert.equal(after.some(item => item.code === 'hook-static'), false);
  assert.ok(after.some(item => item.code === 'clip-freeze'), 'a too-short clip needs a new visual, so it stays listed');
  assert.match(fixed.clips.find(clip => clip.id === 'cl_b').reason, /^Changed by the editing brain: /);
  assert.deepEqual(B.autoFix(fixed, SPEC).fixed, [], 'nothing is fixed twice');
  // Transitions are a creative choice (owner review 2026-10-16): a transition on every change is flagged for the
  // owner with a one-click fix, but the brain never removes chosen transitions by itself, and variety is not a fault.
  const soft = structuredClone(fixed);
  soft.joins = soft.joins.map((join, k) => ({...join, type: ['crossfade', 'iris-open', 'whip-pan', 'flash'][k % 4], frames: 6}));
  const calmer = B.autoFix(soft, SPEC);
  assert.equal(calmer.fixed.some(item => item.code.startsWith('transition-')), false);
  assert.deepEqual(calmer.timeline.joins.map(join => join.type), soft.joins.map(join => join.type));
  const listed = B.critique(soft, SPEC).findings;
  assert.ok(listed.some(item => item.code === 'transition-overuse' && item.op?.transition === 'cut'));
  assert.equal(listed.some(item => item.code === 'transition-variety'), false);
});

test("Claude chooses each scene's transition from the whole catalogue; the brain decides only where it did not", () => {
  const {sentences, scenes, assets, narrationSeconds} = fixture();
  const joinInto = (edit, id) => edit.joins[edit.clips.findIndex(clip => clip.sceneId === id) - 1];
  const all = {...SPEC, transitions: {allowed: ['cut', ...Object.keys(T.CATALOG)], default: 'cut', maxDurationMs: 800}, motion: {...SPEC.motion, intensity: 60}};
  const chosen = {sc2: 'iris-open', sc3: 'glitch', sc4: 'dip-to-black'};
  const edit = B.autoEdit({fps: 30, narrationSeconds, sentences, scenes: scenes.map(scene => ({...scene, ...(chosen[scene.id] ? {transition: chosen[scene.id]} : {})})), assets, spec: all});
  for (const [id, name] of Object.entries(chosen)) {
    const join = joinInto(edit, id);
    assert.equal(join.type, name, `${id} keeps Claude's ${name}, even after the hook and next to another transition`);
    assert.ok(join.frames >= 2 && join.frames <= Math.round(T.secondsOf(name) * 30));
    assert.match(join.reason, new RegExp(`The scene plan chose ${name} here`));
  }
  assert.equal(B.validateTimeline(edit), true);
  // A choice the style does not allow, or a cut, is respected the same way: the brain decides only the first.
  const narrow = {...all, transitions: {...all.transitions, allowed: ['cut', 'crossfade']}};
  const other = B.autoEdit({fps: 30, narrationSeconds, sentences, scenes: scenes.map(scene => ({...scene, ...(scene.id === 'sc3' ? {transition: 'pixelize'} : scene.id === 'sc4' ? {transition: 'cut'} : {})})), assets, spec: narrow});
  assert.equal(joinInto(other, 'sc3').type === 'pixelize', false);
  assert.match(joinInto(other, 'sc4').reason, /The scene plan cuts/);
  // Older names still work, and every name maps to a drawable FFmpeg transition.
  assert.equal(T.xfadeOf('push'), 'slideleft');
  assert.ok(T.NAMES.every(name => /^[a-z]+$/.test(T.xfadeOf(name))));
  assert.ok(B.TRANSITIONS.length > 40);
  assert.match(T.guide(['cut', 'wipe', 'flash']), /^wipe-left \(.*\); flash \(/);
});

test('owner edits are checked before anything changes, and scene repair touches one scene', () => {
  const {sentences, scenes, assets, narrationSeconds} = fixture({videoE: 9});
  const edit = B.autoEdit({fps: 30, narrationSeconds, sentences, scenes, assets, spec: SPEC});
  const before = JSON.stringify(edit);
  const first = edit.clips[0], second = edit.clips[1];
  const held = B.applyOp(edit, {type: 'set-hold', clipId: first.id, seconds: 2}, {spec: SPEC}).timeline;
  assert.equal(held.clips[0].frames, 60);
  assert.equal(held.clips[1].start, 60);
  assert.equal(held.clips[1].frames, first.frames + second.frames - 60);
  assert.equal(JSON.stringify(edit), before, 'the source edit is never mutated');
  assert.throws(() => B.applyOp(edit, {type: 'set-hold', clipId: edit.clips.at(-1).id, seconds: 2}, {spec: SPEC}), /last clip/);
  assert.throws(() => B.applyOp(edit, {type: 'set-hold', clipId: first.id, seconds: 0.1}, {spec: SPEC}), /half a second/);
  assert.throws(() => B.applyOp(edit, {type: 'set-transition', clipId: first.id, transition: 'morph'}, {spec: SPEC}), /Choose a transition/);
  assert.throws(() => B.applyOp(edit, {type: 'set-transition', clipId: first.id, transition: 'dip-to-black'}, {spec: {...SPEC, transitions: {...SPEC.transitions, allowed: ['cut', 'crossfade']}}}), /does not allow/);
  const faded = B.applyOp(edit, {type: 'set-transition', clipId: first.id, transition: 'crossfade', seconds: 0.5}, {spec: SPEC}).timeline;
  assert.deepEqual([faded.joins[0].type, faded.joins[0].frames], ['crossfade', 15]);
  assert.throws(() => B.applyOp(edit, {type: 'set-move', clipId: 'cl_b', kind: 'pan-left'}, {spec: SPEC}), /stills/);
  assert.equal(B.applyOp(edit, {type: 'set-move', clipId: first.id, kind: 'static'}, {spec: SPEC}).timeline.clips[0].move.kind, 'static');
  assert.throws(() => B.applyOp(edit, {type: 'set-in', clipId: 'cl_b', seconds: 9.9}, {spec: SPEC}), /in-point/);
  const stat = edit.graphics.find(item => item.template === 'stat');
  const accepted = B.applyOp(edit, {type: 'set-graphic', graphicId: stat.id, status: 'accepted', lines: ['60%', 'of Messina'], seconds: 3}, {spec: SPEC}).timeline;
  assert.deepEqual(accepted.graphics.find(item => item.id === stat.id).lines, ['60%', 'of Messina']);
  const reordered = B.applyOp(edit, {type: 'reorder', sceneId: 'sc1', clipId: 'cl_b', toIndex: 0}, {spec: SPEC}).timeline;
  assert.deepEqual(reordered.clips.slice(0, 2).map(clip => [clip.id, clip.start, clip.frames]), [['cl_b', 0, first.frames], ['cl_a', first.frames, second.frames]], 'the pictures move, the cuts stay on the sentence breaks');
  assert.throws(() => B.applyOp(edit, {type: 'reorder', sceneId: 'sc2', clipId: 'cl_b', toIndex: 0}, {spec: SPEC}), /own scene/);
  assert.throws(() => B.applyOp(edit, {type: 'teleport'}, {spec: SPEC}), /Choose one of/);
  // Single-scene repair: a new take of S02 changes only S02's clips.
  const fresh = B.autoEdit({fps: 30, narrationSeconds, sentences, scenes, assets, spec: SPEC, variants: {sc2: 1}});
  const repaired = B.spliceScene(accepted, fresh, 'sc2');
  assert.notDeepEqual(repaired.clips.filter(clip => clip.sceneId === 'sc2'), accepted.clips.filter(clip => clip.sceneId === 'sc2'));
  assert.deepEqual(repaired.clips.filter(clip => clip.sceneId !== 'sc2'), accepted.clips.filter(clip => clip.sceneId !== 'sc2'));
  assert.deepEqual(repaired.graphics, accepted.graphics, "the owner's graphics decisions survive the repair");
  assert.equal(repaired.scenes.find(scene => scene.id === 'sc2').variant, 1);
});

test('graphics become one ASS layer: eased entrances, the title-card accent, accepted graphics only', () => {
  const {sentences, scenes, assets, narrationSeconds} = fixture();
  const edit = B.autoEdit({fps: 30, narrationSeconds, sentences, scenes, assets, spec: SPEC});
  const ass = B.graphicsAss(edit, SPEC);
  assert.match(ass, /PlayResX: 1920/);
  assert.match(ass, /The hidden \{\\c&H27A2C9&\}cause\{\\c&HE6EEF2&\}/, 'one accent word in the style accent colour');
  assert.equal((ass.match(/,Card,/g) || []).length, 7, 'title card: five eased entrance steps, a hold and a fade');
  const graphicLines = ass.split('\n').filter(line => line.startsWith('Dialogue:') && !line.includes(',Caption,'));
  assert.doesNotMatch(graphicLines.join('\n'), /60%/, 'proposed graphics are not drawn until accepted');
  assert.match(ass, /Dialogue: 5,[^\n]*,Caption,[^\n]*\{\\c&H27A2C9&\}60%/, 'the caption rail carries the narration and lifts the figure in the accent colour');
  const none = structuredClone(edit);
  none.graphics.forEach(item => { item.status = 'rejected'; });
  assert.ok(B.graphicsAss(none, SPEC).split('\n').filter(line => line.startsWith('Dialogue:')).every(line => line.includes(',Caption,')), 'with every graphic rejected only captions remain');
  none.captions.enabled = false;
  assert.equal(B.graphicsAss(none, SPEC), null);
  // Render plan: runs of hard cuts become chunks; the crossfade offset keeps the narration length.
  const files = Object.fromEntries(edit.clips.map(clip => [clip.id, `${clip.id}.src`]));
  const plan = R.planTimeline({timeline: edit, files, narration: {file: 'n.wav', durationSeconds: narrationSeconds}, format: 'long-form', workDir: '/w', outFile: '/w/o.mp4', graphics: true});
  assert.equal(plan.chunks.length, 2);
  assert.equal(plan.chunks.reduce((sum, chunk) => sum + chunk.frames, 0) - plan.transition.frames, plan.totalFrames);
  assert.match(plan.final.args.join(' '), /ass=graphics\.ass,fade=t=out/);
  assert.match(plan.segments[0].args.join(' '), /zoompan=z='1\+[\d.]+\*\(\(on\/\d+\)\*\(on\/\d+\)\*\(3-2\*\(on\/\d+\)\)\)'/, 'eased push-in');
  // Every segment is converted to one colour profile, so joined chunks never change format mid-stream.
  for (const segment of plan.segments) {
    assert.match(segment.args.join(' '), /out_range=tv:out_color_matrix=bt709/);
    assert.match(segment.args.join(' '), /setparams=range=tv:colorspace=bt709/);
    assert.match(segment.args.join(' '), /-color_range tv -colorspace bt709/);
  }
});

// ---------------------------------------------------------------- the room, end to end with real FFmpeg

const hook = 'Every coin in your pocket began as a quiet promise.';
const script = [
  `${hook} In 1347 two villages traded salt for grain. Nobody carried coins. They carved small marks on clay tokens to remember who owed what.`,
  'Each token was a promise you could hold. By the end of that winter, 60% of all trades used tokens. A temple scribe wrote that "a mark kept is a debt repaid" in his ledger.',
  'Over time the tokens became smaller and easier to carry. People trusted the mark more than the clay itself. That trust is still inside every coin you spend today, and it started with a simple promise.',
].join('\n\n');

function setup(t, {seconds = 36, locales = ['en-US']} = {}) {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'editing-room-'));
  const store = new Store(':memory:', {artifactRoot: dataRoot});
  t.after(() => { store.close(); fs.rmSync(dataRoot, {recursive: true, force: true}); });
  const skills = new SkillsEngine(store, {root: path.join(__dirname, '..')}).attach();
  const styles = new StyleLibrary(store), quota = new QuotaLedger(store);
  const family = store.saveFamily({name: 'Money Stories', tier: 'A', countries: ['United States'], audience: 'Curious adults who like money history told as stories.', niche: 'Origins of money', locales, timezone: 'Asia/Karachi', monthlyBudget: 50, cadence: 2, format: 'shorts', monthlyTokenLimit: 200000, scriptTokenLimit: 4000, researchTokenLimit: 4000});
  let content = store.saveContent({familyId: family.id, title: 'The first promise', kind: 'fiction', angle: 'Invented villages show how trust became money.', hook, script, sources: [], rightsConfirmed: true});
  store.reviewContent(content.id, {revision: content.revision, action: 'submit'});
  content = store.reviewContent(content.id, {revision: content.revision, action: 'approve'});
  const montage = styles.profiles().find(item => item.key === 'documentary-montage').revisions.at(-1);
  styles.approveRevision(montage.id, {approvedBy: 'Owner', notes: 'Fixture.', confirmations: {specReviewed: true, rightsReviewed: true, originalityReviewed: true}});
  styles.assign(family.id, {familyRevision: store.family(family.id).revision, assignedBy: 'Owner', reason: 'Stock and AI visuals suit this family.', revisionId: montage.id, expectedAssignmentId: null});
  store.db.prepare('INSERT INTO connectors(id,name_key,payload,secret) VALUES(?,?,?,?)').run('openai-1', 'openai-1', JSON.stringify({name: 'openai-1', provider: 'openai', revision: 1, test: {status: 'passed', at: new Date().toISOString()}}), Buffer.from('x'));
  const profile = store.saveVoiceProfile(family.id, {revision: 0, familyRevision: store.family(family.id).revision, name: 'Narrator', connectorId: 'openai-1', connectorRevision: 1, provider: 'openai', model: 'gpt-4o-mini-tts', voiceId: 'alloy', voiceVersion: 'current', ownershipBasis: 'provider_stock_voice', rightsHolder: 'Provider catalog', consentConfirmed: true, commercialUseConfirmed: true, evidenceReference: 'Terms reviewed by the owner.', termsReviewedAt: '2026-09-19', pace: 1, energy: 55, emotion: 'warm', pauseScale: 1, emphasis: 50, instructions: 'Warm delivery.', lexicon: [], monthlyCharacterLimit: 1000000, maxCharactersPerAudition: 20000, priceCentsPerMillionCharacters: 1500});
  const job = store.queueVoiceAudition(content.id, {contentRevision: content.revision, profileId: profile.id, profileRevision: profile.revision, connectorId: 'openai-1', connectorRevision: 1});
  const claimed = store.claimVoiceAudition();
  // Narration with real pauses 0.35 s after each word-share estimate, like a speaker taking a breath.
  const estimated = timeSentences(splitSentences(content.script), seconds);
  const silences = estimated.slice(1).map(item => `between(t,${(item.startSeconds + 0.05).toFixed(2)},${(item.startSeconds + 0.4).toFixed(2)})`).join('+');
  const relativePath = `voice-artifacts/${job.id}.wav`, wav = path.join(dataRoot, relativePath);
  fs.mkdirSync(path.dirname(wav), {recursive: true});
  ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=44100', '-t', String(seconds), '-af', `volume=enable='${silences}':volume=0`, '-c:a', 'pcm_s16le', '-y', wav]);
  const bytes = fs.readFileSync(wav);
  const audition = store.completeVoiceAudition(job.id, {artifact: {relativePath, sha256: sha(bytes), sizeBytes: bytes.length, mime: 'audio/wav'}, analysis: {passed: true, durationSeconds: seconds, silenceRatio: 0, checks: []}, provider: {requestIds: [], model: 'gpt-4o-mini-tts', voiceId: 'alloy', voiceVersion: 'current'}, settledCharacters: claimed.scope.characterCount});
  store.selectVoiceAudition(audition.id, {approvedBy: 'Owner', comparisonNotes: 'Compared the complete narration for pacing and clarity.', intelligibilityConfirmed: true});
  const scenes = new SceneRoom(store, null, quota, styles, {dataRoot});
  const renders = new RenderRoom(store, styles, scenes, {dataRoot, ffmpeg: 'ffmpeg', ffprobe: 'ffprobe'});
  const editing = new EditingRoom(store, styles, scenes, renders, {ffmpeg: 'ffmpeg'});
  return {dataRoot, store, skills, styles, scenes, renders, editing, family, content, estimated};
}
async function approvedBoard({dataRoot, store, scenes, content, twoShotClip = false}) {
  let {manifest} = scenes.createPlan(content.id, {mode: 'rules', requestedBy: 'Owner', contentRevision: content.revision});
  const third = manifest.plan.scenes[2];
  manifest = scenes.editManifest(manifest.id, {op: 'update-scene', sceneId: third.id, purpose: 'turn', onScreenText: 'The *mark* mattered', createdBy: 'Owner', expectedRevision: manifest.revision});
  scenes.reviewManifest(manifest.id, {decision: 'approve', reviewer: 'Owner', confirmations: {coverageReviewed: true, directionReviewed: true}});
  const media = path.join(dataRoot, 'fixture-media');
  fs.mkdirSync(media, {recursive: true});
  ffmpeg(['-f', 'lavfi', '-i', 'testsrc=size=1080x1920', '-frames:v', '1', '-y', path.join(media, 'still.jpg')]);
  ffmpeg(['-f', 'lavfi', '-i', 'smptebars=size=1080x1920', '-frames:v', '1', '-y', path.join(media, 'still2.jpg')]);
  if (twoShotClip) ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30:duration=4', '-f', 'lavfi', '-i', 'mandelbrot=size=1080x1920:rate=30', '-filter_complex', '[1:v]trim=duration=8,setpts=PTS-STARTPTS,format=yuv420p[b];[0:v]format=yuv420p[a];[a][b]concat=n=2:v=1:a=0', '-c:v', 'mpeg4', '-q:v', '10', '-y', path.join(media, 'clip.mp4')]);
  else ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30', '-t', '12', '-c:v', 'mpeg4', '-q:v', '10', '-y', path.join(media, 'clip.mp4')]);
  const shots = manifest.plan.scenes.flatMap(scene => scene.shots);
  for (const [index, shot] of shots.entries()) {
    const kind = index % 3 === 1 ? 'clip' : 'still', name = kind === 'clip' ? 'clip.mp4' : index % 2 ? 'still2.jpg' : 'still.jpg', id = randomUUID();
    const relative = `visual-assets/${content.familyId}/${content.id}/${id}${path.extname(name)}`, file = path.join(dataRoot, relative);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.copyFileSync(path.join(media, name), file);
    const bytes = fs.readFileSync(file), probe = await VS.probeMedia(file), still = kind === 'still';
    store.db.prepare('INSERT INTO visual_assets(id,family_id,content_id,shot_id,origin,capability,source_job_id,candidate_id,media_type,relative_path,thumb_path,sha256,size_bytes,mime,probe,rights,created_by,created_at) VALUES(?,?,?,?,?,?,?,NULL,?,?,NULL,?,?,?,?,?,?,?)')
      .run(id, content.familyId, content.id, shot.id, 'stock', JSON.stringify(VS.capability(still ? 'pexels-photo' : 'pexels-video')), 'fixture', still ? 'image' : 'video', relative, sha(bytes), bytes.length, still ? 'image/jpeg' : 'video/mp4', JSON.stringify(probe), JSON.stringify({basis: 'stock-license', license: VS.CAPABILITIES['pexels-photo'].rights, synthetic: false, disclosure: 'none'}), 'Owner', new Date().toISOString());
    scenes.select({manifestId: manifest.id, shotId: shot.id, assetId: id, selectedBy: 'Owner'});
  }
  return {manifest, approval: await scenes.approveVisuals(manifest.id, {approvedBy: 'Owner', confirmations: {rightsReviewed: true, sequenceReviewed: true, warningsAccepted: true}})};
}

test('the Editing Room drafts, revises, repairs and renders an edit with a human verdict', {skip}, async t => {
  const env = setup(t);
  const {editing, renders, scenes, store, skills, content, family, dataRoot} = env;
  await assert.rejects(editing.generate(content.id, {requestedBy: 'Owner', visualApprovalId: 'none'}), /Approve the visuals|Create and approve a scene plan/);
  const {approval} = await approvedBoard(env);
  await assert.rejects(editing.generate(content.id, {requestedBy: 'Owner', visualApprovalId: 'stale'}), /visual approval changed/);
  // An approved editing skill is recorded with the edit it informed.
  const skill = skills.skills().find(item => item.id === 'editing.transition-grammar');
  skills.approveRevision(skill.latest.id, {approvedBy: 'Owner', notes: 'Reviewed.', confirmations: {wordingReviewed: true, numbersReviewed: true, scopeReviewed: true}});

  const r1 = await editing.generate(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id});
  assert.equal(r1.revision, 1);
  assert.equal(r1.actor, 'brain');
  assert.equal(r1.timing.method, 'pause-aligned', 'cuts follow the measured pauses');
  assert.ok(r1.timing.matched >= 3);
  assert.equal(r1.timeline.clips.reduce((sum, clip) => sum + clip.frames, 0), r1.timeline.totalFrames);
  assert.ok(r1.skills.some(item => item.id === 'editing.transition-grammar'));
  assert.ok(r1.timeline.joins.some(join => join.skill === 'editing.transition-grammar' && join.skillApproved === true));
  assert.equal(skills.usage().find(item => item.jobId === r1.id).taskKey, 'editing.plan');
  const title = r1.timeline.graphics.find(item => item.template === 'title-card');
  assert.deepEqual([title.lines[0], title.accent], ['The mark mattered', 'mark']);
  const stat = r1.timeline.graphics.find(item => item.template === 'stat');
  assert.equal(stat.lines[0], '60%');
  assert.throws(() => store.db.prepare('UPDATE edit_revisions SET note=? WHERE id=?').run('x', r1.id), /immutable/);
  // Captions (P07): every narrated word once, on the measured pauses, with an SRT sidecar for YouTube.
  assert.equal(r1.timeline.captions.enabled, true);
  assert.deepEqual(Cap.lintCaptions(r1.timeline.captions, {sentences: editing.inputs(store.content(content.id)).payload.sentences}).filter(item => item.severity === 'critical'), []);
  assert.ok(r1.timeline.captions.groups.every(group => group.words.length <= 4), 'a Shorts family gets short captions');
  const srt = editing.captionsFile(r1.id);
  assert.match(srt.text, /^1\n00:00:0\d,\d{3} --> /);
  assert.match(srt.filename, /^The-first-promise-r1\.srt$/);
  // YouTube craft: sentence cues follow the measured pauses; chapters and Shorts spans only exist for long-form.
  const room = editing.state().contents.find(item => item.contentId === content.id);
  assert.deepEqual(room.craft, {chapters: null, shorts: null}, 'a Shorts family gets no chapters or Shorts-inside-Shorts');
  const cues = editing.cues(editing.inputs(store.content(content.id)));
  assert.equal(cues[0].start, 0);
  assert.ok(cues.slice(1).some(cue => cue.gap > 0.3), 'measured pauses become chapter-boundary evidence');
  const csv = ['Video position (%),Absolute audience retention (%)', ...Array.from({length: 11}, (_, i) => `${i * 10},${100 - i * 2 - (i >= 6 ? 15 : 0)}`)].join('\n');
  const retention = editing.retention(content.id, {csv});
  const cliff = retention.cliffs[0];
  assert.equal(cliff.from, 50);
  assert.equal(cliff.atSeconds, 18, 'percent positions map onto the 36 s narration');
  assert.ok(cliff.said && cues.some(cue => cue.start <= 22 && cue.end >= 14 && cliff.said.includes(cue.text.slice(0, 20))), 'each cliff names what the narration said there');
  assert.throws(() => editing.retention(content.id, {csv: 'position,retention\n1,2\n3,4'}), /at least 8 data points/);

  // Owner edits with conflict protection; undo restores the earlier edit exactly.
  const still = r1.timeline.clips.find(clip => clip.mediaType === 'image');
  const r2 = editing.applyOps(r1.id, {editedBy: 'Owner', ops: [{type: 'set-graphic', graphicId: stat.id, status: 'accepted'}, {type: 'set-move', clipId: still.id, kind: still.move.kind === 'pull-out' ? 'push-in' : 'pull-out'}]});
  assert.equal(r2.revision, 2);
  assert.equal(r2.timeline.graphics.find(item => item.id === stat.id).status, 'accepted');
  assert.throws(() => editing.applyOps(r1.id, {editedBy: 'Owner', ops: [{type: 'set-hero', clipId: still.id, hero: true}]}), /This edit changed \(now r2\)/);
  assert.throws(() => editing.applyOps(r2.id, {editedBy: 'Owner', ops: [{type: 'set-move', clipId: 'nope', kind: 'static'}]}), /not in this edit/);
  assert.equal(editing.state().contents.find(item => item.contentId === content.id).edit.revision, 2, 'a refused edit creates no revision');
  let r3 = editing.undo(r2.id, {editedBy: 'Owner'});
  assert.equal(r3.payloadHash, r1.payloadHash);
  // A caption correction is an ordinary owner revision: both sidecars carry the corrected words and undo restores them.
  const firstCaption = r3.timeline.captions.groups[0];
  const corrected = editing.applyOps(r3.id, {editedBy: 'Owner', ops: [{type: 'set-caption', groupId: firstCaption.id, text: 'Corrected *words*'}]});
  assert.deepEqual([corrected.timeline.captions.groups[0].start, corrected.timeline.captions.groups[0].end], [firstCaption.start, firstCaption.end]);
  assert.ok(corrected.findings.some(item => item.code === 'captions-edited'));
  const vtt = editing.captionsFile(corrected.id, 'vtt');
  assert.match(vtt.text, /^WEBVTT\n\n1\n00:00:00\.000 --> 00:00:0\d\.\d{3}\nCorrected words\n/);
  assert.match(vtt.filename, /^The-first-promise-r4\.vtt$/);
  assert.match(editing.captionsFile(corrected.id).text, /^1\n00:00:00,000 --> 00:00:0\d,\d{3}\nCorrected words\n/);
  r3 = editing.undo(corrected.id, {editedBy: 'Owner'});
  assert.equal(r3.payloadHash, r1.payloadHash);
  // Single-scene repair.
  const sceneId = r3.timeline.scenes[1].id;
  const r4 = editing.applyOps(r3.id, {editedBy: 'Owner', ops: [{type: 'regenerate-scene', sceneId}]});
  assert.equal(r4.timeline.scenes[1].variant, 1);
  assert.deepEqual(r4.timeline.clips.filter(clip => clip.sceneId !== sceneId), r3.timeline.clips.filter(clip => clip.sceneId !== sceneId));
  let r5 = editing.applyOps(r4.id, {editedBy: 'Owner', ops: [{type: 'set-graphic', graphicId: stat.id, status: 'accepted'}]});
  // Apply the critic's hook fix so the edit opens on a moving clip: a chunk that mixes clip and still
  // segments must still join without losing frames (regression: mixed colour ranges once dropped a chunk).
  const mixed = r5.timeline.scenes.map(scene => r5.timeline.clips.filter(clip => clip.sceneId === scene.id)).find(clips => clips.findIndex(clip => clip.mediaType === 'video') > 0);
  assert.ok(mixed, 'the fixture has a scene where a clip follows a still');
  const moving = mixed.find(clip => clip.mediaType === 'video');
  r5 = editing.applyOps(r5.id, {editedBy: 'Owner', ops: [{type: 'reorder', sceneId: moving.sceneId, clipId: moving.id, toIndex: 0}]});
  assert.equal(r5.timeline.clips.find(clip => clip.sceneId === moving.sceneId).id, moving.id);
  assert.equal(r5.timeline.audio, undefined, 'existing edits keep their original audio behavior until an owner chooses settings');
  assert.throws(() => editing.applyOps(r5.id, {editedBy: 'Owner', ops: [{type: 'set-audio', settings: {truePeakDb: 1}}]}), /truePeakDb/);
  const beforeAudio = r5;
  r5 = editing.applyOps(r5.id, {editedBy: 'Owner', ops: [{type: 'set-audio', settings: {mode: 'normalize', targetLufs: -16, truePeakDb: -2}}]});
  assert.equal(r5.revision, beforeAudio.revision + 1);
  assert.deepEqual(r5.timeline.captions, beforeAudio.timeline.captions);
  assert.deepEqual(r5.timeline.clips, beforeAudio.timeline.clips);
  assert.throws(() => editing.applyOps(beforeAudio.id, {editedBy: 'Owner', ops: [{type: 'set-audio', settings: {mode: 'source'}}]}), /changed/);

  // Rendering the edit needs the pinned build; the render follows the edit's own decisions.
  await assert.rejects(Promise.resolve().then(() => renders.queueRender(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id, editRevisionId: r5.id})), /readiness check/);
  const report = await renders.checkReadiness({requestedBy: 'Owner'});
  assert.equal(report.passed, true, JSON.stringify(report.issues));
  assert.equal(report.filters.ass, true);
  renders.pin({readinessId: report.id, pinnedBy: 'Owner', reason: 'Reviewed build for the edit render.'});
  assert.throws(() => renders.queueRender(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id, editRevisionId: r4.id}), /newer revision/);
  const queued = renders.queueRender(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id, editRevisionId: r5.id});
  assert.equal(queued.scope.edit.revision, r5.revision);
  const done = await renders.processNext();
  assert.equal(done?.status, 'completed', JSON.stringify(renders.publicJob(renders.row(queued.id)).error));
  const result = JSON.parse(renders.row(queued.id).result);
  assert.deepEqual([result.video.probe.width, result.video.probe.height], [360, 640]);
  assert.equal(result.qc.find(item => item.name === 'duration').passed, true, JSON.stringify(result.qc));
  assert.equal(result.video.probe.frames ?? Math.round(result.video.probe.durationSeconds * 30), Math.round(36 * 30), 'every frame of the narration is in the render');
  assert.equal(result.qc.find(item => item.name === 'black frames').passed, true, 'the title card and the fade-out are planned, not defects');
  assert.equal(result.qc.find(item => item.name === 'unplanned cuts').passed, true, JSON.stringify(result.qc));
  // P09: the whole render decodes, sound and picture line up, and the hook gets a dense sheet of its own.
  assert.equal(result.qc.find(item => item.name === 'full decode').passed, true, JSON.stringify(result.qc));
  assert.equal(result.qc.find(item => item.name === 'audio/video alignment').passed, true, JSON.stringify(result.qc));
  assert.equal(result.qc.some(item => item.name === 'audio clipping'), false, 'a finished narration has its own true-peak check');
  assert.deepEqual([result.hook.everySeconds, result.hook.frames, result.hook.seconds, result.hook.cols, result.hook.rows, result.hook.tileWidth], [0.5, 10, 5, 5, 2, 120]);
  assert.deepEqual([result.sheet.cols, result.sheet.tileWidth], [8, 120]);
  assert.equal(renders.file(queued.id, 'hook').mime, 'image/jpeg');
  const manifest = JSON.parse(fs.readFileSync(path.join(dataRoot, result.manifest.relativePath), 'utf8'));
  assert.equal(manifest.inputs.edit.revisionId, r5.id);
  const burned = JSON.parse(renders.row(queued.id).scope).edit.graphicsAss;
  assert.match(burned, /,Caption,/, 'the render burned the caption rail in');
  assert.equal(manifest.inputs.edit.graphicsSha256, createHash('sha256').update(burned).digest('hex'), 'the manifest records the exact subtitle layer, captions included');
  assert.match(manifest.inputs.edit.graphicsSha256, /^[a-f0-9]{64}$/);
  assert.ok(manifest.commands.some(command => command.step.startsWith('join chunk-')));
  assert.equal(result.audioQc.passed, true, JSON.stringify(result.audioQc));
  assert.equal(manifest.audio.settings.targetLufs, -16);
  assert.equal(manifest.audio.artifact.sha256, result.audio.sha256);
  assert.ok(manifest.commands.some(command => command.step === 'verify encoded audio'));
  assert.equal(renders.file(queued.id, 'audio').mime, 'audio/wav');
  assert.ok(manifest.commands.every(command => !command.args.join(' ').includes(dataRoot)), 'command plans do not leak local paths');
  // Same edit, same build: byte-identical render.
  const again = renders.queueRender(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id, editRevisionId: r5.id});
  await renders.processNext();
  assert.equal(JSON.parse(renders.row(again.id).result).video.sha256, result.video.sha256);
  // P09 Review & QC: one timecoded list with repair links, and the narration aligned with captions, clips and frames.
  const qcReport = renders.qcReport(queued.id);
  assert.equal(qcReport.status, 'awaiting-verdict', JSON.stringify(qcReport.blockers));
  assert.deepEqual(qcReport.timeline.map(row => row.n), editing.cues(editing.inputs(store.content(content.id))).map(cue => cue.n));
  assert.deepEqual(qcReport.timeline.flatMap(row => row.captions.map(caption => caption.id)), r5.timeline.captions.groups.map(group => group.id), 'every caption sits in exactly one sentence row');
  assert.ok(qcReport.timeline.every(row => row.clips.length >= 1 && Number.isInteger(row.tile)));
  assert.ok(qcReport.findings.every(item => item.repair?.room && (item.at === null || Number.isFinite(item.at))));
  assert.equal(qcReport.findings.some(item => item.code === 'captions-fast'), false, 'caption summaries become caption-by-caption entries');
  assert.equal(qcReport.sheets.hook.url, `/api/renders/${queued.id}/hook`);
  // The verdict on the rendered edit is its approval; critical findings must be accepted explicitly.
  const criticals = queued.scope.edit.criticals;
  const confirmations = {watchedFully: true, styleMatches: true, syncReviewed: true, qcAccepted: true, audioReviewed: true};
  assert.throws(() => renders.review(queued.id, {decision: 'pass', reviewer: 'Owner', confirmations: {...confirmations, audioReviewed: false}}), /listened/);
  if (criticals) assert.throws(() => renders.review(queued.id, {decision: 'pass', reviewer: 'Owner', confirmations}), /critical finding/);
  assert.throws(() => renders.review(queued.id, {decision: 'pass', reviewer: 'Owner', confirmations: {...confirmations, watchedFully: false, flaggedReviewed: true, critiqueAccepted: true}}), /watched the whole proxy/, 'without a frame scan the owner watches it all');
  // P09b Claude frame scan (a stand-in Claude): sheets cut from the real render, one answer per six sheets, findings in the review.
  store.db.prepare('INSERT INTO connectors(id,name_key,payload,secret) VALUES(?,?,?,?)').run('claude-1', 'claude-1', JSON.stringify({name: 'claude-1', provider: 'claude-code', revision: 1, test: {status: 'passed', at: new Date().toISOString()}}), null);
  const asked = [];
  const scanner = new FrameScanner(store, renders, new ConnectorSlots(store, {transform: (op, input) => input}), {complete: async ({task, messages}) => {
    const blocks = messages[1].content, first = blocks[0].text.match(/^F\d+/m)[0];
    asked.push({task, images: blocks.filter(block => block.type === 'image').length, notes: blocks[0].text});
    return {content: JSON.stringify({findings: asked.length === 1 ? [{frame: first, severity: 'critical', kind: 'picture', what: 'The opening frame is a flat test pattern.', fix: 'Replace the first shot.'}] : []}), usage: {promptTokens: 9000, completionTokens: 300, totalTokens: 9300}, model: 'claude-opus-5-5', provider: 'claude-code'};
  }});
  renders.frameScanner = scanner;
  assert.throws(() => scanner.queue(queued.id, {connector: {id: 'claude-1', revision: 2}, requestedBy: 'Owner'}), /missing, changed or not tested/);
  const scan = scanner.queue(queued.id, {connector: {id: 'claude-1', revision: 1}, requestedBy: 'Owner'});
  assert.throws(() => scanner.queue(queued.id, {connector: {id: 'claude-1', revision: 1}, requestedBy: 'Owner'}), /already scanning/);
  const scanned = await scanner.processNext();
  assert.equal(scanned?.status, 'completed', JSON.stringify(scanner.publicScan(scanner.row(scan.id)).error));
  assert.equal(asked.length, scanned.batches.total);
  assert.ok(asked.every(call => call.task === 'review' && call.images >= 1));
  assert.match(asked[0].notes, /F1 at 0:00\.0: narration: "[^"]+"; .*shot /);
  assert.equal(scanned.sheets.length, Math.ceil(scanned.frames / 16));
  assert.deepEqual([scanned.geometry.width, scanned.geometry.height], [740, 1300], 'vertical tiles for a Short');
  assert.match(scanner.sheetFile(scan.id, 1), /sheet-001\.jpg$/);
  assert.throws(() => scanner.queue(queued.id, {connector: {id: 'claude-1', revision: 1}, requestedBy: 'Owner'}), /already scanned/);
  const scanUsage = store.db.prepare('SELECT * FROM intelligence_usage WHERE job_id=?').get(scan.id);
  assert.deepEqual([scanUsage.kind, scanUsage.status, scanUsage.total_tokens], ['frame_scan', 'settled', 9300 * asked.length]);
  const withScan = renders.qcReport(queued.id), flagged = withScan.findings.find(item => item.source === 'claude');
  assert.deepEqual([flagged.severity, flagged.at, flagged.repair.command, flagged.frame.scanId], ['critical', 0, 'tl-clip', scan.id]);
  assert.equal(withScan.scan.complete, true);
  const renderedFile = renders.file(queued.id, 'video').file, original = fs.readFileSync(renderedFile), changed = Buffer.from(original);
  changed[changed.length - 1] ^= 1;
  fs.writeFileSync(renderedFile, changed);
  assert.throws(() => renders.file(queued.id, 'video'), /missing or changed/);
  assert.deepEqual(renders.qcReport(queued.id).blockers.map(item => item.code), ['file-changed']);
  assert.throws(() => renders.review(queued.id, {decision: 'pass', reviewer: 'Owner', confirmations: {...confirmations, critiqueAccepted: true}}), /missing or changed/);
  fs.writeFileSync(renderedFile, original);
  // After the scan, checking every flagged moment stands in for watching it all (the owner's choice, recorded).
  const passed = renders.review(queued.id, {decision: 'pass', reviewer: 'Owner', confirmations: {...confirmations, watchedFully: false, flaggedReviewed: true, critiqueAccepted: true}});
  assert.equal(passed.review.decision, 'passed');
  assert.equal(passed.current, true);
  assert.deepEqual([passed.review.confirmations.flaggedReviewed, passed.review.confirmations.watchedFully], [true, false]);
  assert.deepEqual(passed.review.report.counts, withScan.counts, 'the verdict records what the review showed');
  assert.equal(renders.qcReport(queued.id).status, 'approved');
  // A newer edit makes the rendered one out of date.
  const waiting = renders.queueRender(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id, editRevisionId: r5.id});
  editing.applyOps(r5.id, {editedBy: 'Owner', ops: [{type: 'set-hero', clipId: still.id, hero: true}]});
  assert.equal(await renders.processNext(), null);
  assert.equal(renders.row(waiting.id).status, 'stale', 'a superseded queued edit does not consume rendering time');
  assert.equal(renders.publicJob(renders.row(again.id)).current, false);
  const staleReport = renders.qcReport(queued.id);
  assert.deepEqual([staleReport.status, staleReport.verdictStale, staleReport.blockers[0].code], ['blocked', true, 'out-of-date'], 'a newer edit invalidates the approved review');
  assert.throws(() => renders.review(again.id, {decision: 'pass', reviewer: 'Owner', confirmations: {...confirmations, critiqueAccepted: true}}), /changed after this render/);
  // A changed visual board makes the edit itself out of date: no more edits, no render.
  const latest = editing.state().contents.find(item => item.contentId === content.id).edit;
  const scope = JSON.parse(renders.row(queued.id).scope);
  scenes.select({manifestId: approval.manifestId, shotId: scope.shots[1].shotId, assetId: scope.shots[0].assetId, selectedBy: 'Owner'});
  assert.equal(editing.state().contents.find(item => item.contentId === content.id).current, false);
  assert.throws(() => editing.applyOps(latest.id, {editedBy: 'Owner', ops: [{type: 'set-hero', clipId: still.id, hero: false}]}), /Approve the visuals|changed after this edit/);
  assert.equal(family.id, store.family(family.id).id);
});

// A stock clip that hides its own cut (claude-video scene detection): measured once, avoided by the brain,
// flagged by the critic when the owner forces the window across it, and caught in the render itself.
test('hidden cuts inside stock clips are measured, avoided, flagged and caught in the render', {skip}, async t => {
  const env = setup(t);
  const {editing, renders, store, content} = env;
  const {approval} = await approvedBoard({...env, twoShotClip: true});
  const report = await renders.checkReadiness({requestedBy: 'Owner'});
  assert.equal(report.passed, true, JSON.stringify(report.issues));
  renders.pin({readinessId: report.id, pinnedBy: 'Owner', reason: 'Reviewed build for the hidden-cut check.'});
  const r1 = await editing.generate(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id});
  const videos = r1.timeline.clips.filter(clip => clip.mediaType === 'video');
  assert.ok(videos.length >= 1);
  for (const clip of videos) {
    assert.deepEqual(clip.sourceCuts, [4], 'the 4 s cut inside the stock clip was measured');
    const span = clip.frames / r1.timeline.fps * clip.speed;
    assert.ok(clip.inSeconds >= 4 || clip.inSeconds + span <= 4, `${clip.label} plays ${clip.inSeconds}-${clip.inSeconds + span} s, across the hidden cut`);
  }
  assert.ok(videos.some(clip => /changes shot at 4\.00 s/.test(clip.trimReason)), 'the decision says why the in-point moved');
  assert.equal(r1.findings.some(item => item.code === 'hidden-cut'), false);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM media_analyses').get().n, 1, 'one file, measured once');
  // The owner forces a window across the cut: the critic names it and offers the clean in-point.
  const target = videos[0], hold = target.frames / r1.timeline.fps;
  const r2 = editing.applyOps(r1.id, {editedBy: 'Owner', ops: [{type: 'set-in', clipId: target.id, seconds: Math.max(0, Math.round((4 - hold / 2) * 100) / 100)}]});
  const flagged = r2.findings.find(item => item.code === 'hidden-cut' && item.clipId === target.id);
  assert.ok(flagged, 'the critic flags the hidden cut');
  assert.equal(flagged.op.type, 'set-in');
  assert.ok(flagged.op.seconds >= 4);
  // The render of the forced edit measures the cut where the edit planned none.
  renders.queueRender(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id, editRevisionId: r2.id});
  const done = await renders.processNext();
  assert.equal(done?.status, 'completed');
  const qc = JSON.parse(renders.row(done.id).result).qc.find(item => item.name === 'unplanned cuts');
  assert.equal(qc.passed, false, 'the render check catches the hidden cut');
  assert.match(qc.detail, new RegExp(target.label));
  // Applying the critic's fix gives a clean render again.
  const r3 = editing.applyOps(r2.id, {editedBy: 'Owner', ops: [flagged.op]});
  assert.equal(r3.findings.some(item => item.code === 'hidden-cut'), false);
  renders.queueRender(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id, editRevisionId: r3.id});
  const clean = await renders.processNext();
  assert.equal(JSON.parse(renders.row(clean.id).result).qc.find(item => item.name === 'unplanned cuts').passed, true);
});

test('repeated owner corrections in two edits of a family raise one lesson, never a silent change', {skip}, async t => {
  const env = setup(t, {seconds: 30});
  const {editing, skills, content} = env;
  const {approval} = await approvedBoard(env);
  const r1 = await editing.generate(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id});
  const soft = r1.timeline.joins.findIndex(join => join.type !== 'cut');
  const clipId = r1.timeline.clips[Math.max(0, soft)].id;
  editing.applyOps(r1.id, {editedBy: 'Owner', ops: [{type: 'set-transition', clipId, transition: 'cut'}]});
  assert.equal(skills.lessons().length, 0, 'one correction is not a pattern');
  // A second edit of the same family (another approved scope) with the same correction.
  const other = editing.timelineRow(r1.timelineId);
  const twinId = randomUUID();
  editing.db.prepare('INSERT INTO edit_timelines(id,family_id,content_id,visual_approval_id,scope,scope_hash,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)').run(twinId, other.family_id, other.content_id, other.visual_approval_id, other.scope, 'twin-scope', 'Owner', new Date().toISOString());
  editing.db.prepare("INSERT INTO edit_revisions(id,timeline_id,revision,parent_id,actor,payload,payload_hash,critique,ops,receipt,note,created_by,created_at) VALUES(?,?,1,NULL,'owner','{}','x','{}',?,'{}','twin','Owner',?)").run(randomUUID(), twinId, JSON.stringify([{type: 'set-transition', clipId, transition: 'cut'}]), new Date().toISOString());
  const latest = editing.state().contents.find(item => item.contentId === content.id).edit;
  editing.applyOps(latest.id, {editedBy: 'Owner', ops: [{type: 'set-transition', clipId, transition: 'cut'}]});
  const lessons = skills.lessons();
  assert.equal(lessons.length, 1);
  assert.equal(lessons[0].skillId, 'editing.transition-grammar');
  assert.equal(lessons[0].status, 'proposed');
  assert.match(lessons[0].finding, /2 different edits/);
  assert.equal(skills.state().counts.approved, 0, 'a lesson never changes a skill by itself');
});

test('Room 09 packages an approved video: thumbnails from the board, honest checks, a Claude draft and an approval that goes stale', {skip}, async t => {
  const env = setup(t);
  const {editing, renders, store, content, scenes, dataRoot} = env;
  const {approval} = await approvedBoard(env);
  const readiness = await renders.checkReadiness({requestedBy: 'Owner'});
  assert.equal(readiness.filters.vignette && readiness.filters.eq, true, 'thumbnails need eq and vignette');
  renders.pin({readinessId: readiness.id, pinnedBy: 'Owner', reason: 'Reviewed build for packaging.'});
  const edit = await editing.generate(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id});
  const queued = renders.queueRender(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id, editRevisionId: edit.id});
  await renders.processNext();
  store.db.prepare('INSERT INTO connectors(id,name_key,payload,secret) VALUES(?,?,?,?)').run('claude-1', 'claude-1', JSON.stringify({name: 'claude-1', provider: 'claude-code', revision: 1, test: {status: 'passed', at: new Date().toISOString()}}), null);
  const asked = [];
  const room = new PackagingRoom(store, scenes, renders, editing, new ConnectorSlots(store, {transform: (op, input) => input}), {complete: async ({task, messages, maxTokens}) => {
    const input = JSON.parse(messages[1].content);
    asked.push({task, maxTokens, input});
    return {content: JSON.stringify({titles: ['Why 1347 changed money', 'The clay mark that became a coin', 'How two villages invented trust', 'Salt, grain and a promise', 'What a token remembered'].map(text => ({text, why: 'formula'})),
      thumbnails: input.shots.slice(0, 3).map((shot, k) => ({text: ['ONE MARK', 'WHO OWED', 'KEPT'][k], accent: ['MARK', 'OWED', 'KEPT'][k], shot: shot.label, at: shot.media === 'video' ? 1 : 0, layout: 'left', concept: 'One clear focal point.'})),
      description: 'Two villages, one winter, and the first record of trust.', tags: ['money history', 'clay tokens']}), usage: {promptTokens: 4000, completionTokens: 900, totalTokens: 4900}, model: 'claude-opus-5-5', provider: 'claude-code'};
  }}, {dataRoot});
  // A free start: three thumbnail variants drawn locally at 1280x720 from the approved shots.
  const p1 = await room.startFromScript(content.id, {requestedBy: 'Owner'});
  assert.deepEqual([p1.revision, p1.actor, p1.payload.thumbnails.length], [1, 'rules', 3]);
  for (const image of Object.values(p1.images)) {
    assert.deepEqual([image.width, image.height], [1280, 720]);
    assert.ok(image.sizeBytes < 2 * 1024 * 1024 && fs.existsSync(path.join(dataRoot, image.relativePath)));
  }
  assert.throws(() => room.approve(p1.id, {approvedBy: 'Owner', confirmations: {}}), /Room 08/, 'a package belongs to a video approved in Room 08');
  // The owner's edit: a figure the script never says is critical on the chosen title.
  const pkg = {...p1.payload, titles: [{text: 'Why 1347 changed money forever'}, {text: 'The 99 marks that built trust'}], chosenTitle: 't2',
    thumbnails: p1.payload.thumbnails.map((thumb, k) => ({...thumb, text: ['ONE MARK', 'WHO OWED', 'KEPT'][k], accent: k === 0 ? 'MARK' : ''}))};
  const p2 = await room.save(content.id, {createdBy: 'Owner', expectedRevision: 1, package: pkg});
  assert.deepEqual(p2.checks.issues.filter(item => item.severity === 'critical').map(item => item.code), ['unsupported-figure']);
  assert.notEqual(p2.images.k1.relativePath, p1.images.k1.relativePath, 'new words, new thumbnail');
  await assert.rejects(room.save(content.id, {createdBy: 'Owner', expectedRevision: 1, package: pkg}), /changed \(now r2\)/);
  await assert.rejects(room.save(content.id, {createdBy: 'Owner', expectedRevision: 2, package: pkg}), /Nothing changed/);
  assert.throws(() => store.db.prepare('UPDATE package_revisions SET note=? WHERE id=?').run('x', p2.id), /immutable/);
  renders.review(queued.id, {decision: 'pass', reviewer: 'Owner', confirmations: {watchedFully: true, styleMatches: true, syncReviewed: true, qcAccepted: true, critiqueAccepted: true, audioReviewed: true}});
  assert.throws(() => room.approve(p2.id, {approvedBy: 'Owner', confirmations: {}}), /critical package checks/);
  const p3 = await room.save(content.id, {createdBy: 'Owner', expectedRevision: 2, package: {...pkg, chosenTitle: 't1'}});
  assert.equal(p3.checks.passed, true, JSON.stringify(p3.checks.issues));
  assert.equal(p3.images.k1.relativePath, p2.images.k1.relativePath, 'unchanged thumbnails are not drawn again');
  assert.throws(() => room.approve(p3.id, {approvedBy: 'Owner', confirmations: {titleHonest: true, disclosureReviewed: true, creditsReviewed: true}}), /phone size/);
  const approved = room.approve(p3.id, {approvedBy: 'Owner', confirmations: {titleHonest: true, thumbnailChecked: true, disclosureReviewed: true, creditsReviewed: true}});
  assert.deepEqual([approved.approval.current, approved.approval.renderId], [true, queued.id]);
  const exported = room.exportText(p3.id);
  assert.match(exported.text, /^TITLE\nWhy 1347 changed money forever\n\nDESCRIPTION\n/);
  assert.match(exported.text, /Visual credits:\nS01A: /);
  assert.match(exported.filename, /-package-r3\.txt$/);
  // Claude's draft: a new revision built from the script and the board; the earlier approval goes stale.
  room.queueDraft(content.id, {requestedBy: 'Owner', connector: {id: 'claude-1', revision: 1}});
  assert.throws(() => room.queueDraft(content.id, {requestedBy: 'Owner', connector: {id: 'claude-1', revision: 1}}), /already drafting/);
  const p4 = await room.processNext();
  assert.deepEqual([p4.revision, p4.actor, p4.payload.titles.length, asked[0].task], [4, 'claude', 5, 'packaging']);
  assert.equal(asked[0].input.video.script, store.content(content.id).script);
  assert.ok(asked[0].input.shots.every(shot => shot.label && shot.media));
  assert.equal(store.db.prepare("SELECT status, total_tokens FROM intelligence_usage WHERE kind='packaging'").get().total_tokens, 4900);
  const stale = room.publicRevision(room.revisionRow(p3.id)).approval;
  assert.deepEqual([stale.current, stale.staleReason], [false, 'A newer package revision was saved.']);
  // A changed thumbnail file is caught.
  const thumbFile = room.thumbnailFile(p4.id, 'k1');
  fs.appendFileSync(thumbFile, 'x');
  assert.throws(() => room.thumbnailFile(p4.id, 'k1'), /missing or changed/);
  assert.equal(room.state().contents.find(item => item.contentId === content.id).latest.revision, 4);
});

// P11: the final master is made only from the preview approved in Room 08 (with its package), checked for YouTube's
// upload format and against that preview frame by frame, approved by name, and goes out of date when its package
// changes; a master that stops half way continues from its checked parts and gives the same file.
test('Room 10 renders the final master from the approved preview, checks it, resumes from verified parts and is approved by name', {skip}, async t => {
  const env = setup(t, {seconds: 20});
  const {editing, renders, store, content, scenes, dataRoot} = env;
  const {approval} = await approvedBoard(env);
  const readiness = await renders.checkReadiness({requestedBy: 'Owner'});
  renders.pin({readinessId: readiness.id, pinnedBy: 'Owner', reason: 'Reviewed build for the master.'});
  const edit = await editing.generate(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id});
  const preview = renders.queueRender(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id, editRevisionId: edit.id});
  await renders.processNext();
  const room = new PackagingRoom(store, scenes, renders, editing, new ConnectorSlots(store, {transform: (op, input) => input}), {complete: async () => { throw new Error('not used'); }}, {dataRoot});
  renders.packaging = room;
  assert.throws(() => renders.queueMaster(preview.id, {requestedBy: 'Owner'}), /Room 08/, 'the master is made only from an approved preview');
  renders.review(preview.id, {decision: 'pass', reviewer: 'Owner', confirmations: {watchedFully: true, styleMatches: true, syncReviewed: true, qcAccepted: true, critiqueAccepted: true, audioReviewed: true}});
  const pkg = await room.startFromScript(content.id, {requestedBy: 'Owner'});
  const approvedPackage = room.approve(pkg.id, {approvedBy: 'Owner', confirmations: {titleHonest: true, thumbnailChecked: true, disclosureReviewed: true, creditsReviewed: true}});
  assert.equal(approvedPackage.approval.current, true);

  const queued = renders.queueMaster(preview.id, {requestedBy: 'Owner'});
  assert.equal(queued.preset, 'master');
  assert.throws(() => renders.queueMaster(preview.id, {requestedBy: 'Owner'}), /already queued/);
  const done = await renders.processNext();
  assert.equal(done.status, 'completed', JSON.stringify(renders.publicJob(renders.row(queued.id)).error));
  const result = JSON.parse(renders.row(queued.id).result);
  assert.deepEqual([result.preset.name, result.video.probe.width, result.video.probe.height], ['master', 1080, 1920]);
  const check = name => result.qc.find(item => item.name === name);
  assert.equal(check('delivery format').passed, true, check('delivery format').detail);
  assert.equal(check('matches the approved preview').passed, true, check('matches the approved preview').detail);
  assert.ok(check('matches the approved preview').mean > 0.9);
  assert.equal(fs.existsSync(path.join(dataRoot, 'renders', '.work', queued.id)), false, 'a finished master leaves no work files');
  assert.equal(renders.stagesOf(queued.id), 0, 'and no kept parts');
  // The master lives in Room 10, not among the previews of Room 05 and Room 08.
  const roomState = renders.state().contents.find(item => item.contentId === content.id);
  assert.deepEqual([roomState.renders.every(job => job.preset === 'proxy'), roomState.masters[0].id, roomState.masterFrom.previewId], [true, queued.id, preview.id]);

  // The owner's decision, by name, on the real master.
  assert.throws(() => renders.approveMaster(queued.id, {approvedBy: 'Owner', confirmations: {spotChecked: true, listened: true}}), /title and thumbnail/);
  const approvedMaster = renders.approveMaster(queued.id, {approvedBy: 'Owner', notes: 'Ready to upload.', confirmations: {spotChecked: true, listened: true, packageMatches: true, qcAccepted: true}});
  assert.deepEqual([approvedMaster.master.approval.current, approvedMaster.master.approval.approvedBy], [true, 'Owner']);
  assert.throws(() => renders.approveMaster(queued.id, {approvedBy: 'Owner', confirmations: {spotChecked: true, listened: true, packageMatches: true}}), /already approved/);
  assert.throws(() => store.db.prepare('UPDATE master_approvals SET notes=?').run('x'), /immutable/);
  // A new package revision makes the approved master out of date.
  await room.save(content.id, {createdBy: 'Owner', expectedRevision: pkg.revision, package: {...pkg.payload, tags: [...pkg.payload.tags, 'clay tokens']}});
  const stale = renders.publicJob(renders.row(queued.id)).master;
  assert.deepEqual([stale.current, stale.approval.current], [false, false]);
  assert.match(stale.approval.staleReason, /package/i);

  // Recovery: a master that fails half way keeps its checked parts; one that was running when the program stopped is
  // marked interrupted with its parts kept; the retry reuses them and makes the same file.
  const latest = room.latestRow(content.id);
  room.approve(latest.id, {approvedBy: 'Owner', confirmations: {titleHonest: true, thumbnailChecked: true, disclosureReviewed: true, creditsReviewed: true}});
  const second = renders.queueMaster(preview.id, {requestedBy: 'Owner'});
  const record = renders.stageRecord.bind(renders);
  let recorded = 0;
  renders.stageRecord = (...args) => { record(...args); if (++recorded === 2) throw new Error('simulated power cut'); };
  assert.equal(await renders.processNext(), null);
  renders.stageRecord = record;
  assert.equal(renders.row(second.id).status, 'failed');
  assert.equal(renders.stagesOf(second.id), 2, 'the finished parts are kept');
  assert.ok(fs.existsSync(path.join(dataRoot, 'renders', '.work', second.id)), 'with their files');
  store.db.prepare("UPDATE render_jobs SET status='running' WHERE id=?").run(second.id);
  renders.recoverInterrupted();
  assert.equal(renders.row(second.id).status, 'interrupted');
  assert.match(renders.row(second.id).error, /finished parts are kept/);
  assert.ok(fs.existsSync(path.join(dataRoot, 'renders', '.work', second.id)), 'an interrupted master keeps its work after a restart');
  // A kept part whose file changed is never reused: it is made again.
  const kept = store.db.prepare('SELECT file FROM render_stages WHERE job_id=? ORDER BY created_at').all(second.id);
  fs.appendFileSync(path.join(dataRoot, 'renders', '.work', second.id, kept[0].file), 'x');
  renders.retry(second.id, {requestedBy: 'Owner'});
  const resumed = await renders.processNext();
  assert.equal(resumed.status, 'completed', JSON.stringify(renders.publicJob(renders.row(second.id)).error));
  const secondResult = JSON.parse(renders.row(second.id).result);
  assert.equal(secondResult.logs.filter(item => /^reused /.test(item.step)).length, 1, 'only the unchanged part was reused');
  assert.equal(secondResult.video.sha256, result.video.sha256, 'a resumed master is byte for byte the master made in one go');
  const approvedSecond = renders.approveMaster(second.id, {approvedBy: 'Owner', confirmations: {spotChecked: true, listened: true, packageMatches: true, qcAccepted: true}});
  assert.equal(approvedSecond.master.approval.current, true);
  assert.match(renders.publicJob(renders.row(queued.id)).master.approval.staleReason, /newer master/, 'the newer approved master supersedes the older');
});

test('L03: a language edition renders from the approved master on its own voice, retimed scene by scene, and is released by name', {skip}, async t => {
  const env = setup(t, {seconds: 20, locales: ['en-US', 'es-419']});
  const {editing, renders, store, content, scenes, dataRoot, family} = env;
  const {approval} = await approvedBoard(env);
  const readiness = await renders.checkReadiness({requestedBy: 'Owner'});
  renders.pin({readinessId: readiness.id, pinnedBy: 'Owner', reason: 'Reviewed build for the master.'});
  const edit = await editing.generate(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id});
  const preview = renders.queueRender(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id, editRevisionId: edit.id});
  await renders.processNext();
  renders.review(preview.id, {decision: 'pass', reviewer: 'Owner', confirmations: {watchedFully: true, styleMatches: true, syncReviewed: true, qcAccepted: true, critiqueAccepted: true, audioReviewed: true}});
  const packaging = new PackagingRoom(store, scenes, renders, editing, new ConnectorSlots(store, {transform: (op, input) => input}), {complete: async () => { throw new Error('not used'); }}, {dataRoot});
  renders.packaging = packaging;
  const started = await packaging.startFromScript(content.id, {requestedBy: 'Owner'});
  const pkg = await packaging.save(content.id, {createdBy: 'Owner', expectedRevision: started.revision, package: {...started.payload, thumbnails: started.payload.thumbnails.map((thumb, k) => k === 0 ? {...thumb, text: 'THE FIRST PROMISE', accent: 'PROMISE'} : thumb)}});
  packaging.approve(pkg.id, {approvedBy: 'Owner', confirmations: {titleHonest: true, thumbnailChecked: true, disclosureReviewed: true, creditsReviewed: true}});
  renders.queueMaster(preview.id, {requestedBy: 'Owner'});
  const master = await renders.processNext();
  renders.approveMaster(master.id, {approvedBy: 'Owner', confirmations: {spotChecked: true, listened: true, packageMatches: true, qcAccepted: true}});

  // L01 and L02 for Spanish: a fixture adaptation, and a stand-in OpenAI voice that returns real audio (no word times,
  // so the scene timing is estimated and says so).
  store.db.prepare('INSERT INTO connectors(id,name_key,payload,secret) VALUES(?,?,?,?)').run('claude', 'claude', JSON.stringify({name: 'claude', provider: 'claude-code', revision: 1, test: {status: 'passed', at: new Date().toISOString()}}), null);
  let spoken = 0;
  const connectors = {row: id => store.db.prepare('SELECT * FROM connectors WHERE id=?').get(id), key: () => 'fixture-key', fetch: async (url, options) => {
    const words = JSON.parse(options.body).input.split(/\s+/).filter(Boolean).length, file = path.join(dataRoot, `tts-${++spoken}.wav`);
    ffmpeg(['-f', 'lavfi', '-i', `sine=frequency=262:sample_rate=44100:duration=${words * 0.3}`, '-af', 'volume=0.5', '-c:a', 'pcm_s16le', '-y', file]);
    return new Response(fs.readFileSync(file), {status: 200, headers: {'content-type': 'audio/wav'}});
  }};
  const ai = {complete: async ({messages}) => { const packet = JSON.parse(messages[1].content); return {content: JSON.stringify({sentences: packet.sentences.map(item => ({n: item.n, text: `ES ${item.text.replace(/[A-Za-z]+/g, 'palabra')}`})), visible: packet.visible.map(item => ({id: item.id, text: `ES ${item.text}`.slice(0, item.maxLength)})), package: {title: 'La primera promesa', description: 'Cómo la confianza se volvió dinero.', tags: ['historia'], thumbnail: {text: 'LA PRIMERA PROMESA', accent: 'PROMESA'}}, notes: ''}), usage: {promptTokens: 500, completionTokens: 300, totalTokens: 800}, model: 'fixture'}; }};
  const room = new LocalizationRoom(store, renders, packaging, connectors, ai, {dataRoot, ffmpeg: 'ffmpeg', ffprobe: 'ffprobe'});
  renders.localization = room;
  room.queueDraft(content.id, {requestedBy: 'Owner', locale: 'es-419', connector: {id: 'claude', revision: 1}});
  const words = await room.processNext();
  assert.ok(words.payload.visible.some(item => item.id.startsWith('g:')), 'the edit\'s graphics have words to adapt');
  await assert.rejects(room.queueEditionRender(content.id, {requestedBy: 'Owner', locale: 'es-419'}), /narration first/);
  room.approve(words.id, {approvedBy: 'Owner', confirmations: {meaningReviewed: true, factsChecked: true, visibleChecked: true, packageHonest: true}});
  room.saveVoice(family.id, {createdBy: 'Owner', locale: 'es-419', expectedRevision: 0, languageConfirmed: true});
  const asked = room.queueNarration(content.id, {requestedBy: 'Owner', locale: 'es-419'});
  const narration = await room.processNextNarration();
  assert.equal(narration.status, 'completed', narration.error);
  assert.equal(narration.sync.method, 'estimated');
  room.approveNarration(asked.id, {approvedBy: 'Owner', confirmations: {listened: true, pronunciation: true, syncReviewed: true, syncAccepted: true}});

  // L03: the edition renders like a master, from the master's recipe with the edition's voice, words and timing.
  const queued = await room.queueEditionRender(content.id, {requestedBy: 'Owner', locale: 'es-419'});
  assert.equal(queued.preset, 'edition');
  const scope = JSON.parse(renders.row(queued.id).scope), tl = scope.edit.timeline, original = JSON.parse(renders.row(master.id).scope).edit.timeline;
  assert.equal(tl.totalFrames, narration.sync.scenes.at(-1).endFrame);
  assert.deepEqual(tl.scenes.map(scene => scene.startFrame), narration.sync.scenes.map(scene => scene.startFrame), 'every scene starts on its words in this language');
  assert.equal(tl.clips.length, original.clips.length);
  tl.clips.forEach((clip, k) => { if (k) assert.equal(clip.start, tl.clips[k - 1].start + tl.clips[k - 1].frames); });
  const accepted = tl.graphics.filter(item => item.status === 'accepted');
  assert.ok(accepted.length && accepted.every(item => [item.title, ...(item.lines || [])].every(line => !/\p{L}{2}/u.test(line || '') || line.startsWith('ES '))), 'graphics speak Spanish');
  assert.ok(tl.captions.groups.flatMap(group => group.words).every(word => word.start <= scope.narration.durationSeconds + 0.05), 'captions follow the Spanish voice');
  assert.match(tl.captions.groups[0].words.map(word => word.text).join(' '), /^ES palabra/);
  assert.deepEqual([scope.edition.thumbnail.text, scope.edition.thumbnail.width, scope.edition.thumbnail.height], ['LA PRIMERA PROMESA', 1280, 720]);
  const done = await renders.processNext();
  assert.equal(done.status, 'completed', JSON.stringify(renders.row(queued.id).error));
  const result = JSON.parse(renders.row(queued.id).result), check = name => result.qc.find(item => item.name === name);
  assert.equal(check('delivery format').passed, true, check('delivery format').detail);
  assert.equal(check('duration').passed, true, check('duration').detail);
  assert.equal(check('matches the approved preview'), undefined, 'an edition has no preview of its own to match');
  assert.ok(Math.abs(result.video.probe.durationSeconds - scope.narration.durationSeconds) < 0.2);
  // Editions stay out of the previews and masters of Rooms 05, 08 and 10.
  const roomState = renders.state().contents.find(item => item.contentId === content.id);
  assert.deepEqual([roomState.renders.every(job => job.preset === 'proxy'), roomState.masters.every(job => job.preset === 'master')], [true, true]);
  const listed = room.state().contents[0].editions[0].renders[0];
  assert.deepEqual([listed.id, listed.standing, listed.thumbnailUrl], [queued.id, true, `/api/edition-renders/${queued.id}/thumbnail`]);
  assert.ok(fs.existsSync(room.editionThumbnailFile(queued.id)));

  // The release decision, by name; it goes out of date when the Spanish words change.
  assert.throws(() => room.approveEditionRender(queued.id, {approvedBy: 'Owner', confirmations: {watched: true, listened: true}}), /title, description and thumbnail/);
  const released = room.approveEditionRender(queued.id, {approvedBy: 'Owner', confirmations: {watched: true, listened: true, packageMatches: true, qcAccepted: true}});
  assert.equal(released.release.current, true);
  assert.equal(room.currentRelease(content.id, 'es-419').renderId, queued.id);
  assert.throws(() => store.db.prepare('UPDATE edition_releases SET notes=?').run('x'), /immutable/);
  room.save(content.id, {createdBy: 'Owner', locale: 'es-419', expectedRevision: words.revision, edition: {...words.payload, package: {...words.payload.package, title: 'La promesa original'}}});
  assert.equal(room.currentRelease(content.id, 'es-419'), null);
  assert.match(room.publicEditionRender(renders.row(queued.id)).release.staleReason, /words, the narration or the master changed/);
});

test('HTTP edit routes need the local token and expose the room in state', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'editing-http-'));
  const {server} = createApp({dataFile: path.join(dir, 'workspace.sqlite'), worker: false, protector: {transform: (op, input) => Buffer.from([...input].reverse())}, voiceOptions: {ffmpeg: 'missing-ffmpeg-for-test', ffprobe: 'missing-ffprobe-for-test'}});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(() => { fs.rmSync(dir, {recursive: true, force: true}); resolve(); }); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const state = await (await fetch(`${base}/api/state`)).json();
  assert.equal(state.editing.brain, 'ytprod.edit/1');
  assert.deepEqual(state.editing.contents, []);
  assert.equal((await fetch(`${base}/editing-room.js`)).status, 200);
  const send = (url, body, token = state.token) => fetch(base + url, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Local-Token': token}, body: JSON.stringify(body)});
  const id = '00000000-0000-0000-0000-000000000000';
  assert.equal((await send(`/api/content/${id}/edits`, {requestedBy: 'Owner'}, 'bad')).status, 403);
  assert.equal((await send(`/api/content/${id}/edits`, {requestedBy: 'Owner', visualApprovalId: 'x'})).status, 404);
  assert.equal((await send(`/api/edit-revisions/${id}/ops`, {editedBy: 'Owner', ops: [{type: 'set-hero'}]})).status, 404);
  assert.equal((await send(`/api/edit-revisions/${id}/undo`, {editedBy: 'Owner'})).status, 404);
  for (const kind of ['srt', 'vtt']) assert.equal((await fetch(`${base}/api/edit-revisions/${id}/captions.${kind}`)).status, 404);
});

// ---------------------------------------------------------------- P06b animated (canvas) graphics

const {MotionRenderer, inspectBrowser, findBrowser} = require('../motion');
const noBrowser = findBrowser() ? false : 'No Chromium browser (Edge or Chrome) on this machine';
const FILLER = 'This is a calm filler line about the distant past and its people.';
function proposalsFor(texts, spec = SPEC) {
  const all = [...texts, FILLER, FILLER, FILLER, FILLER, FILLER];
  let t = 0;
  const sentences = all.map((text, index) => { const words = text.split(' ').length; const item = {n: index + 1, text, words, startSeconds: t, durationSeconds: Math.max(2.5, words * 0.45)}; t += item.durationSeconds; return item; });
  const shot = id => ({id, label: id.toUpperCase(), motion: 'ken-burns', source: 'stock-image'});
  const scenes = [{id: 's1', label: 'S01', purpose: 'explain', onScreenText: '', sentenceStart: 1, sentenceEnd: texts.length, shots: [shot('a'), shot('b')]}, {id: 's2', label: 'S02', purpose: 'close', onScreenText: '', sentenceStart: texts.length + 1, sentenceEnd: all.length, shots: [shot('c'), shot('d'), shot('e')]}];
  const assets = Object.fromEntries('abcde'.split('').map(id => [id, {assetId: id, mediaType: 'image'}]));
  return B.autoEdit({fps: 30, narrationSeconds: t, sentences, scenes, assets, spec});
}

test('animated graphics come only from the script, validate line by line and follow the style finish', () => {
  // Data parsing: labels, values, one unit per chart, years before Christ, two-sided comparisons.
  assert.deepEqual(B.canvasData('bar-chart', 'Trades', ['Salt = 18%', 'Grain = 34%', 'Tokens = 60%']).items.map(item => [item.label, item.value, item.suffix]), [['Salt', 18, '%'], ['Grain', 34, '%'], ['Tokens', 60, '%']]);
  assert.deepEqual(B.canvasData('bar-chart', '', ['A = $1,200.50', 'B = $3', 'C = $40']).items[0], {label: 'A', value: 1200.5, prefix: '$', suffix: '', decimals: 2});
  assert.throws(() => B.canvasData('bar-chart', '', ['Salt = 18%', 'Grain = 34 people', 'Tokens = 60%']), /same unit/);
  assert.throws(() => B.canvasData('bar-chart', '', ['Salt 18%', 'a = 1', 'b = 2']), /label = value/);
  assert.throws(() => B.canvasData('timeline', '', ['1347 = a', '1351 = b']), /3-7 lines/);
  assert.deepEqual(B.canvasData('timeline', '', ['3200 BC = Tokens', '600 BC = Coins', '1024 = Paper']).items.map(item => [item.year, item.display]), [[-3200, '3200 BC'], [-600, '600 BC'], [1024, '1024']]);
  assert.deepEqual(B.canvasData('comparison', '', ['Clay token: kept by a temple', 'Coin']).items, [{label: 'Clay token', detail: 'kept by a temple'}, {label: 'Coin', detail: ''}]);
  // Proposals, one detector at a time.
  const lines = (texts, template) => proposalsFor(texts).graphics.find(item => item.template === template)?.lines;
  assert.deepEqual(lines(['Salt made up 18% of trades, grain 34% and tokens 60%.'], 'bar-chart'), ['Salt = 18%', 'grain = 34%', 'tokens = 60%']);
  assert.deepEqual(lines(['By 1900 cash was 80% of payments, by 1970 it was 60% and by 2020 just 20%.'], 'line-chart'), ['1900 = 80%', '1970 = 60%', '2020 = 20%']);
  assert.deepEqual(lines(['In 3200 BC clay tokens recorded debts.', 'By 600 BC stamped coins appeared in Lydia.', 'In 1024 China printed the first paper money.'], 'timeline').map(line => line.split(' = ')[0]), ['3200 BC', '600 BC', '1024']);
  assert.deepEqual(lines(['There are three reasons it worked: trust, records and portability.'], 'list'), ['trust', 'records', 'portability']);
  assert.equal(lines(['First, anyone could check the mark.', 'Second, temples kept the records safe.', 'Third, a token could travel between villages.'], 'list').length, 3);
  assert.deepEqual(lines(['Clay tokens versus metal coins tell the story.'], 'comparison'), ['Clay tokens', 'metal coins']);
  assert.deepEqual(lines(['A debt leads to a mark, which turns into a token that becomes money.'], 'flow'), ['A debt', 'a mark', 'a token', 'money']);
  const timeline = proposalsFor(['In 3200 BC clay tokens recorded debts.', 'By 600 BC stamped coins appeared in Lydia.', 'In 1024 China printed the first paper money.']);
  assert.ok(!timeline.graphics.some(item => item.template === 'date'), 'a timeline replaces the single date stamps of its scene');
  const chart = timeline.graphics.find(item => item.template === 'timeline');
  assert.deepEqual([chart.status, chart.renderer, chart.finish, chart.origin], ['proposed', 'canvas', 'clean', 'brain']);
  assert.match(chart.reason, /Check each event/);
  assert.equal(proposalsFor(['In 3200 BC clay tokens recorded debts.', 'By 600 BC stamped coins appeared in Lydia.', 'In 1024 China printed the first paper money.'], {...SPEC, renderer: {adapter: 'ffmpeg-sketch'}}).graphics.find(item => item.template === 'timeline').finish, 'hand-drawn');
  assert.equal(proposalsFor(['Salt made up 18% of trades, salt 34% and salt 60%.']).graphics.some(item => item.template === 'bar-chart'), false, 'repeated labels are not a chart');
  // Owner edits of a canvas graphic are validated; text graphics stay on the ASS layer only.
  const accepted = B.applyOp(timeline, {type: 'set-graphic', graphicId: chart.id, status: 'accepted', title: 'From clay to coin'}, {spec: SPEC}).timeline;
  assert.equal(accepted.graphics.find(item => item.id === chart.id).title, 'From clay to coin');
  assert.throws(() => B.applyOp(timeline, {type: 'set-graphic', graphicId: chart.id, lines: ['1347 = only one']}, {spec: SPEC}), /3-7 lines/);
  assert.equal(B.graphicsAss({...accepted, captions: {...accepted.captions, enabled: false}}, SPEC), null, 'canvas graphics are not drawn by libass');
  assert.equal(B.critique(accepted, SPEC).stats.graphicsAccepted, 1);
  // Adding a graphic: validated, accepted at once, never overlapping another.
  const added = B.applyOp(accepted, {type: 'add-graphic', template: 'flow', startSeconds: 12, seconds: 4, title: 'How it spread', lines: ['A port', 'A ship', 'A city']}, {spec: SPEC}).timeline;
  const flow = added.graphics.find(item => item.origin === 'owner');
  assert.deepEqual([flow.id, flow.status, flow.renderer, flow.start, flow.frames], ['gr_owner_1', 'accepted', 'canvas', 360, 120]);
  assert.throws(() => B.applyOp(added, {type: 'add-graphic', template: 'quote', startSeconds: 13, seconds: 2, lines: ['A clash']}, {spec: SPEC}), /overlap the flow/);
  assert.throws(() => B.applyOp(added, {type: 'add-graphic', template: 'map', startSeconds: 25, seconds: 2, lines: ['x']}, {spec: SPEC}), /Choose a graphic/);
  assert.throws(() => B.applyOp(added, {type: 'add-graphic', template: 'list', startSeconds: 25, seconds: 2, lines: ['only one']}, {spec: SPEC}), /3-6 lines/);
  // Render plan: canvas clips are inputs after the narration and are overlaid at their start time.
  const files = Object.fromEntries(added.clips.map(clip => [clip.id, `${clip.id}.src`]));
  const plan = R.planTimeline({timeline: added, files, narration: {file: 'n.wav', durationSeconds: added.narrationSeconds}, format: 'long-form', workDir: '/w', outFile: '/w/o.mp4', overlays: [{file: 'graphic-1.mov', start: 360, frames: 120}]});
  const args = plan.final.args.join(' ');
  assert.match(args, /-i n\.wav -i graphic-1\.mov/);
  assert.match(args, /setpts=PTS-STARTPTS\+12\/TB,format=rgba\[g0\];\[[a-z0-9]+\]\[g0\]overlay=x=0:y=0:eof_action=pass:enable='between\(t,12,16\)'/);
  assert.equal(plan.overlays, 1);
});

test('the canvas renderer draws identical frames every time, at the requested size', {skip: noBrowser}, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const report = await inspectBrowser();
  assert.equal(report.passed, true, JSON.stringify(report.issues));
  assert.match(report.sha256, /^[a-f0-9]{64}$/);
  const graphic = {template: 'flow', data: B.canvasData('flow', 'How a promise became money', ['A debt', 'A mark', 'A token', 'Money']), palette: {bg: '#0E0E0E', ink: '#F2EEE6', accent: '#C9A227'}, fonts: {heading: 'Georgia', body: 'Arial', hand: 'Segoe Print'}, finish: 'hand-drawn', width: 320, height: 180, fps: 10, duration: 2};
  const renderer = await new MotionRenderer().start();
  const {port, profile} = renderer;
  let first, second;
  try {
    first = await renderer.render({...graphic, outDir: path.join(dir, 'a')});
    second = await renderer.render({...graphic, outDir: path.join(dir, 'b')});
    await assert.rejects(renderer.frame({...graphic, template: 'no-such-template', t: 0}), /Motion template error/);
  } finally { await renderer.close(); }
  // Regression: Edge may relaunch itself, so killing the spawned launcher once left headless browsers running.
  await assert.rejects(fetch(`http://127.0.0.1:${port}/json/version`), 'the browser itself is closed, not only the launcher');
  assert.equal(fs.existsSync(profile), false, 'the throwaway profile is removed');
  assert.equal(first.frames, 20);
  assert.equal(first.sha256, second.sha256, 'same graphic, same pixels');
  const png = fs.readFileSync(path.join(dir, 'a', 'f00019.png'));
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [320, 180]);
  assert.notEqual(fs.readFileSync(path.join(dir, 'a', 'f00000.png')).equals(png), true, 'the graphic animates');
});

test('an edit with an animated timeline renders through the local browser and FFmpeg, identically twice', {skip: skip || noBrowser}, async t => {
  const env = setup(t, {seconds: 30});
  const {editing, renders, content, dataRoot} = env;
  const {approval} = await approvedBoard(env);
  const r1 = await editing.generate(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id});
  const fps = r1.timeline.fps, startSeconds = 6;
  const clashing = r1.timeline.graphics.filter(item => item.status === 'accepted' && item.start / fps < startSeconds + 5 && (item.start + item.frames) / fps > startSeconds);
  const r2 = editing.applyOps(r1.id, {editedBy: 'Owner', ops: [
    ...clashing.map(item => ({type: 'set-graphic', graphicId: item.id, status: 'rejected'})),
    {type: 'add-graphic', template: 'timeline', startSeconds, seconds: 5, title: 'From clay to coin', lines: ['3200 BC = Clay tokens', '600 BC = First coins', '1024 = Paper money']},
  ]});
  const report = await renders.checkReadiness({requestedBy: 'Owner'});
  assert.equal(report.passed, true, JSON.stringify(report.issues));
  assert.equal(report.motion.passed, true, JSON.stringify(report.motion.issues));
  renders.pin({readinessId: report.id, pinnedBy: 'Owner', reason: 'Reviewed build for the animated graphics.'});
  const queued = renders.queueRender(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id, editRevisionId: r2.id});
  const done = await renders.processNext();
  assert.equal(done?.status, 'completed', JSON.stringify(renders.publicJob(renders.row(queued.id)).error));
  const result = JSON.parse(renders.row(queued.id).result);
  assert.equal(result.qc.find(item => item.name === 'duration').passed, true, JSON.stringify(result.qc));
  assert.equal(result.qc.find(item => item.name === 'black frames').passed, true, JSON.stringify(result.qc));
  const manifest = JSON.parse(fs.readFileSync(path.join(dataRoot, result.manifest.relativePath), 'utf8'));
  assert.equal(manifest.inputs.edit.canvas.graphics.length, 1);
  assert.equal(manifest.inputs.edit.canvas.graphics[0].template, 'timeline');
  assert.match(manifest.inputs.edit.canvas.graphics[0].framesSha256, /^[a-f0-9]{64}$/);
  assert.ok(manifest.commands.every(command => !command.args.join(' ').includes(dataRoot)), 'command plans do not leak local paths');
  // A frame inside the timeline window shows the graphic's dark panel, not the bright test footage.
  const video = path.join(dataRoot, result.video.relativePath), still = path.join(dataRoot, 'panel.png');
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', String(startSeconds + 4), '-i', video, '-frames:v', '1', '-vf', 'scale=1:1:flags=area,format=gray', '-f', 'rawvideo', '-y', still]);
  const luma = fs.readFileSync(still)[0];
  assert.ok(luma < 70, `the timeline panel is on screen (average luma ${luma})`);
  const again = renders.queueRender(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id, editRevisionId: r2.id});
  await renders.processNext();
  assert.equal(JSON.parse(renders.row(again.id).result).video.sha256, result.video.sha256, 'same edit, same browser and build: byte-identical');
});

test('a stock clip window stays inside one shot when the clip hides a cut', () => {
  // 12 s clip with cuts at 4 s and 6 s; a 3 s window from the in-point 2 s crosses the 4 s cut.
  const moved = B.cleanWindow(12, 3, [4, 6], 2);
  assert.equal(moved.moved, true);
  assert.equal(moved.cut, 4);
  assert.ok(moved.inSeconds >= 6 && moved.inSeconds + 3 <= 12, 'the longest single shot (6-12 s) is used');
  assert.deepEqual(B.cleanWindow(12, 3, [8], 1), {inSeconds: 1, moved: false}, 'a clean default window stays');
  assert.deepEqual(B.cleanWindow(5, 4, [2.5], 0.5), {inSeconds: 0.5, moved: false}, 'no shot is long enough: the critic will name the cut');
});

test('a planned cue cuts on its word, and a drawn shot plays from its first frame', () => {
  const {sentences, scenes, assets, narrationSeconds} = fixture();
  const cued = scenes.map(scene => (scene.id === 'sc2' ? {...scene, shots: [scene.shots[0], {...scene.shots[1], cue: 'the air itself', source: 'generated-graphics'}]} : scene));
  const timeline = B.autoEdit({fps: 30, narrationSeconds, sentences, scenes: cued, assets: {...assets, d: {assetId: 'D', mediaType: 'video', clipSeconds: 20}}, spec: SPEC, pauses: []});
  const clip = timeline.clips.find(item => item.shotId === 'd');
  const word = require('../sketch').matchPhrase(Cap.wordTimings({sentences, pauses: [], narrationSeconds}), 'the air itself');
  assert.equal(clip.start, Math.round(word.seconds * 30) - 2, 'the cut lands two frames ahead of the cue word');
  assert.match(clip.reason, /Cut on "the air itself"/);
  assert.equal(clip.skill, 'editing.visual-on-the-word');
  assert.deepEqual([clip.inSeconds, clip.speed], [0, 1]);
  assert.match(clip.trimReason, /Drawn for this exact hold/);
  const plain = B.autoEdit({fps: 30, narrationSeconds, sentences, scenes, assets, spec: SPEC, pauses: []});
  assert.notEqual(plain.clips.find(item => item.shotId === 'd').start, clip.start, 'without a cue the breathing pattern decides');
});

test('documentary partners: drawn documentary shots are drawn again at render time on the narrator\'s words', {skip: skip || noBrowser}, async t => {
  const env = setup(t, {seconds: 20});
  const {editing, renders, scenes, store, content, dataRoot} = env;
  let {manifest} = scenes.createPlan(content.id, {mode: 'rules', requestedBy: 'Owner', contentRevision: content.revision});
  const targets = manifest.plan.scenes.slice(1, 3).map(scene => scene.shots[0]);
  for (const [k, shot] of targets.entries()) {
    manifest = scenes.editManifest(manifest.id, {op: 'update-shot', shotId: shot.id, source: 'generated-graphics', createdBy: 'Owner', expectedRevision: manifest.revision,
      sketch: {engine: 'motion', design: k ? 'data' : 'cartoon', set: 'none', elements: [{kind: 'prop', prop: k ? 'pie-chart' : 'map', x: 0.5, y: 0.45, size: 'xl'}, {kind: 'text', text: k ? '1 in 4' : 'Trade routes', style: k ? 'counter' : 'title', x: 0.5, y: 0.15}]}});
  }
  assert.ok(manifest.warnings.some(item => /leaves the main montage look without a reason/.test(item)), 'a drawn cutaway in a documentary asks for its reason');
  scenes.reviewManifest(manifest.id, {decision: 'approve', reviewer: 'Owner', confirmations: {coverageReviewed: true, directionReviewed: true}});
  // Drawn previews first, then stock stills for the rest of the board.
  assert.equal(scenes.queueDrawAll(manifest.id, {requestedBy: 'Owner'}).queued, 2);
  for (let k = 0; k < 2; k++) assert.equal((await scenes.processNextVisual())?.status, 'completed');
  const media = path.join(dataRoot, 'fixture-media');
  fs.mkdirSync(media, {recursive: true});
  ffmpeg(['-f', 'lavfi', '-i', 'testsrc=size=1080x1920', '-frames:v', '1', '-y', path.join(media, 'still.jpg')]);
  for (const shot of manifest.plan.scenes.flatMap(scene => scene.shots).filter(item => item.source !== 'generated-graphics')) {
    const id = randomUUID(), relative = `visual-assets/${content.familyId}/${content.id}/${id}.jpg`, file = path.join(dataRoot, relative);
    fs.mkdirSync(path.dirname(file), {recursive: true}); fs.copyFileSync(path.join(media, 'still.jpg'), file);
    const bytes = fs.readFileSync(file), probe = await VS.probeMedia(file);
    store.db.prepare('INSERT INTO visual_assets(id,family_id,content_id,shot_id,origin,capability,source_job_id,candidate_id,media_type,relative_path,thumb_path,sha256,size_bytes,mime,probe,rights,created_by,created_at) VALUES(?,?,?,?,?,?,?,NULL,?,?,NULL,?,?,?,?,?,?,?)')
      .run(id, content.familyId, content.id, shot.id, 'stock', JSON.stringify(VS.capability('pexels-photo')), 'fixture', 'image', relative, sha(bytes), bytes.length, 'image/jpeg', JSON.stringify(probe), JSON.stringify({basis: 'stock-license', license: VS.CAPABILITIES['pexels-photo'].rights, synthetic: false, disclosure: 'none'}), 'Owner', new Date().toISOString());
    scenes.select({manifestId: manifest.id, shotId: shot.id, assetId: id, selectedBy: 'Owner'});
  }
  const approval = await scenes.approveVisuals(manifest.id, {approvedBy: 'Owner', confirmations: {rightsReviewed: true, sequenceReviewed: true, warningsAccepted: true}});
  const edit = await editing.generate(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id});
  const drawnClips = edit.timeline.clips.filter(clip => targets.some(shot => shot.id === clip.shotId));
  assert.ok(drawnClips.every(clip => clip.inSeconds === 0 && /Drawn for this exact hold/.test(clip.trimReason)));
  const report = await renders.checkReadiness({requestedBy: 'Owner'});
  renders.pin({readinessId: report.id, pinnedBy: 'Owner', reason: 'Reviewed build for drawn cutaways.'});
  const queued = renders.queueRender(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id, editRevisionId: edit.id});
  // A browser that stalls once while a shot is drawn is restarted and the shot drawn again; the render goes on.
  const render = MotionRenderer.prototype.render;
  let stalls = 0;
  MotionRenderer.prototype.render = function (...args) { if (args[0]?.template === 'sketch-scene' && !stalls++) throw new Error('The browser did not answer Page.captureScreenshot in time.'); return render.apply(this, args); };
  let done;
  try { done = await renders.processNext(); } finally { MotionRenderer.prototype.render = render; }
  assert.equal(stalls, 3, 'one stall, then both drawn shots');
  assert.equal(done?.status, 'completed', JSON.stringify(renders.publicJob(renders.row(queued.id)).error));
  const result = JSON.parse(renders.row(queued.id).result);
  assert.ok(result.qc.every(check => check.passed || check.name === 'clipping'), JSON.stringify(result.qc.filter(check => !check.passed)));
  const record = JSON.parse(fs.readFileSync(path.join(dataRoot, result.manifest.relativePath), 'utf8'));
  assert.deepEqual(record.inputs.edit.drawn.clips.map(item => item.clipId).sort(), drawnClips.map(clip => clip.id).sort());
  assert.equal(record.inputs.edit.drawn.engine, require('../sketch').VERSION);
  // Inside a drawn cutaway the frame is the dark documentary page, not the bright test still.
  const clip = drawnClips[0], video = path.join(dataRoot, result.video.relativePath), still = path.join(dataRoot, 'drawn.png');
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', String((clip.start + clip.frames / 2) / edit.timeline.fps), '-i', video, '-frames:v', '1', '-vf', 'scale=1:1:flags=area,format=gray', '-f', 'rawvideo', '-y', still]);
  assert.ok(fs.readFileSync(still)[0] < 90, `the drawn cutaway is on screen (average luma ${fs.readFileSync(still)[0]})`);  // P08c: the family's sound effects land on the drawn moments (the counter ticks, the title whooshes in).
  const {room, eleven} = soundtrackRoom(env);
  room.saveSettings(content.familyId, {...SOUND_SETTINGS, revision: 0, commercialUseConfirmed: true});
  room.queueLibrary(content.familyId, {requestedBy: 'Owner', connector: eleven, costConfirmed: true});
  for (let k = 0; k < 20; k++) await room.processNextAudio();
  const withSfx = editing.applyOps(edit.id, {editedBy: 'Owner', ops: [{type: 'set-audio', settings: {sfx: {enabled: true, density: 'rich', levelDb: -12}}}]});
  const again = renders.queueRender(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id, editRevisionId: withSfx.id});
  const placed = JSON.parse(renders.row(again.id).scope).edit.soundtrack.sfx;
  assert.ok(placed.some(item => item.kind === 'tick') && placed.some(item => item.kind === 'pop'), JSON.stringify(placed.map(item => item.kind)));
  assert.ok(placed.every(item => drawnClips.some(clip => item.seconds >= clip.start / edit.timeline.fps - 0.1 && item.seconds < (clip.start + clip.frames) / edit.timeline.fps)), 'effects only on the drawn shots');
  assert.equal((await renders.processNext())?.status, 'completed', JSON.stringify(renders.publicJob(renders.row(again.id)).error));
  const sfxResult = JSON.parse(renders.row(again.id).result);
  assert.equal(sfxResult.audioQc.passed, true, JSON.stringify(sfxResult.audioQc));
  assert.equal(JSON.parse(fs.readFileSync(path.join(dataRoot, sfxResult.manifest.relativePath), 'utf8')).audio.mix.sfx.length, placed.length);
});

// ---------------------------------------------------------------- 0.54 full control in the Editing Room
// A board with two drawn shots (stickman drawings inside the documentary) and stock stills for the rest.
async function drawnBoard({dataRoot, store, scenes, content}) {
  let {manifest} = scenes.createPlan(content.id, {mode: 'rules', requestedBy: 'Owner', contentRevision: content.revision});
  const targets = manifest.plan.scenes.slice(1, 3).map(scene => scene.shots[0]);
  for (const [k, shot] of targets.entries()) {
    manifest = scenes.editManifest(manifest.id, {op: 'update-shot', shotId: shot.id, source: 'generated-graphics', createdBy: 'Owner', expectedRevision: manifest.revision,
      sketch: {engine: 'motion', design: 'data', set: 'none', elements: [{kind: 'prop', prop: k ? 'pie-chart' : 'map', x: 0.5, y: 0.45, size: 'xl'}, {kind: 'text', text: k ? '1 in 4' : 'Trade routes', style: k ? 'counter' : 'title', x: 0.5, y: 0.15}]}});
  }
  scenes.reviewManifest(manifest.id, {decision: 'approve', reviewer: 'Owner', confirmations: {coverageReviewed: true, directionReviewed: true}});
  scenes.queueDrawAll(manifest.id, {requestedBy: 'Owner'});
  for (let k = 0; k < 2; k++) assert.equal((await scenes.processNextVisual())?.status, 'completed');
  const media = path.join(dataRoot, 'fixture-media');
  fs.mkdirSync(media, {recursive: true});
  ffmpeg(['-f', 'lavfi', '-i', 'testsrc=size=1080x1920', '-frames:v', '1', '-y', path.join(media, 'still.jpg')]);
  for (const shot of manifest.plan.scenes.flatMap(scene => scene.shots).filter(item => item.source !== 'generated-graphics')) {
    const id = randomUUID(), relative = `visual-assets/${content.familyId}/${content.id}/${id}.jpg`, file = path.join(dataRoot, relative);
    fs.mkdirSync(path.dirname(file), {recursive: true}); fs.copyFileSync(path.join(media, 'still.jpg'), file);
    const bytes = fs.readFileSync(file), probe = await VS.probeMedia(file);
    store.db.prepare('INSERT INTO visual_assets(id,family_id,content_id,shot_id,origin,capability,source_job_id,candidate_id,media_type,relative_path,thumb_path,sha256,size_bytes,mime,probe,rights,created_by,created_at) VALUES(?,?,?,?,?,?,?,NULL,?,?,NULL,?,?,?,?,?,?,?)')
      .run(id, content.familyId, content.id, shot.id, 'stock', JSON.stringify(VS.capability('pexels-photo')), 'fixture', 'image', relative, sha(bytes), bytes.length, 'image/jpeg', JSON.stringify(probe), JSON.stringify({basis: 'stock-license', license: VS.CAPABILITIES['pexels-photo'].rights, synthetic: false, disclosure: 'none'}), 'Owner', new Date().toISOString());
    scenes.select({manifestId: manifest.id, shotId: shot.id, assetId: id, selectedBy: 'Owner'});
  }
  const approval = await scenes.approveVisuals(manifest.id, {approvedBy: 'Owner', confirmations: {rightsReviewed: true, sequenceReviewed: true, warningsAccepted: true}});
  return {approval, targets};
}

test('full control (0.54): every drawn shot is shown and changed inside the edit, any moment previews as a frame, typed commands become checked operations', {skip: skip || noBrowser}, async t => {
  const env = setup(t, {seconds: 20});
  const {editing, scenes, store, content, renders} = env;
  const {approval, targets} = await drawnBoard(env);
  const edit = await editing.generate(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id});
  const report = await renders.checkReadiness({requestedBy: 'Owner'});
  renders.pin({readinessId: report.id, pinnedBy: 'Owner', reason: 'Reviewed build for the full-control test.'});
  const drawnClip = edit.timeline.clips.find(clip => clip.shotId === targets[0].id), stockClip = edit.timeline.clips.find(clip => !targets.some(shot => shot.id === clip.shotId));
  // The inspector's view: each drawn shot's drawing, when its elements arrive and the vocabulary.
  const view = editing.drawings(edit.id);
  assert.deepEqual(Object.keys(view.clips).sort(), edit.timeline.clips.filter(clip => targets.some(shot => shot.id === clip.shotId)).map(clip => clip.id).sort());
  assert.equal(view.clips[drawnClip.id].sketch.elements[1].text, 'Trade routes');
  assert.equal(view.clips[drawnClip.id].edited, false);
  assert.equal(view.clips[drawnClip.id].times.length, 2);
  assert.ok(view.vocab.animate.includes('slam') && view.vocab.effect.length > 20 && view.vocab.kinds.includes('text'));
  // The owner changes the title's animation and colour: strict checks, a new revision, the render draws the change.
  const changed = structuredClone(view.clips[drawnClip.id].sketch);
  changed.elements[1] = {...changed.elements[1], animate: 'slam', color: 'red'};
  assert.throws(() => editing.applyOps(edit.id, {editedBy: 'Owner', ops: [{type: 'set-drawing', clipId: drawnClip.id, sketch: {...changed, elements: [{...changed.elements[1], animate: 'wobble-zoom'}]}}]}), /drawing: .*animate/i, 'owner edits are checked strictly');
  assert.throws(() => editing.applyOps(edit.id, {editedBy: 'Owner', ops: [{type: 'set-drawing', clipId: stockClip.id, sketch: changed}]}), /only drawn shots have a drawing/);
  const r2 = editing.applyOps(edit.id, {editedBy: 'Owner', ops: [{type: 'set-drawing', clipId: drawnClip.id, sketch: changed}]});
  assert.equal(r2.revision, 2);
  assert.equal(r2.timeline.drawings[drawnClip.id].elements[1].animate, 'slam');
  assert.equal(editing.drawings(r2.id).clips[drawnClip.id].edited, true);
  const scope = editing.renderScope(r2.id, store.content(content.id));
  assert.deepEqual(scope.drawings[drawnClip.id].sketch.elements[1].color, 'red', 'the render draws the changed drawing');
  assert.equal(editing.drawings(edit.id).clips[drawnClip.id].sketch.elements[1].color, undefined, 'the earlier revision keeps the board\'s drawing');
  // A frame at any moment: drawn exactly like the render, an unsaved drawing too; stock stills from their file.
  const isPng = base64 => Buffer.from(base64, 'base64').subarray(1, 4).toString('latin1') === 'PNG';
  const saved = await editing.frame(r2.id, {clipId: drawnClip.id, at: 1.2});
  assert.ok(isPng(saved.png));
  const unsaved = await editing.frame(r2.id, {clipId: drawnClip.id, at: 1.2, sketch: {...changed, set: 'office'}});
  assert.ok(isPng(unsaved.png) && unsaved.png !== saved.png, 'an unsaved change is previewed before it is saved');
  await assert.rejects(editing.frame(r2.id, {clipId: drawnClip.id, at: 999}), /Pick a moment inside/);
  assert.ok(isPng((await editing.frame(r2.id, {clipId: stockClip.id, at: 0.5})).png));
  // Back to the board's drawing, once.
  const r3 = editing.applyOps(r2.id, {editedBy: 'Owner', ops: [{type: 'set-drawing', clipId: drawnClip.id, sketch: null}]});
  assert.equal(r3.timeline.drawings, undefined);
  assert.throws(() => editing.applyOps(r3.id, {editedBy: 'Owner', ops: [{type: 'set-drawing', clipId: drawnClip.id, sketch: null}]}), /already shows the drawing from the approved board/);
  // A typed command: Claude proposes, the program checks each step, nothing changes until the owner applies.
  const asked = [];
  scenes.ai = {team: () => ({claude: {id: 'claude-1', provider: 'claude-code'}, chatgpt: null}), complete: async ({connectorId, task, messages, maxTokens}) => {
    asked.push({connectorId, task, messages, maxTokens});
    return {content: JSON.stringify({explain: 'A slam on the title and a harder cut.', ops: [
      {type: 'set-element', clipId: drawnClip.id, element: 1, changes: {animate: 'slam', color: 'gold'}},
      {type: 'set-element', clipId: drawnClip.id, element: 1, changes: {size: 'xl'}},
      {type: 'set-transition', clipId: edit.timeline.clips[0].id, transition: 'cut'},
      {type: 'set-hold', clipId: edit.timeline.clips[0].id, seconds: -3},
      {type: 'add-element', clipId: stockClip.id, element: {kind: 'text', text: 'No'}},
      {type: 'teleport'},
    ]}), usage: {promptTokens: 900, completionTokens: 300, totalTokens: 1200}, model: 'claude-opus-5-5', provider: 'claude-code'};
  }};
  const proposal = await editing.command(r3.id, {requestedBy: 'Owner', text: 'Make the Trade routes title slam in gold and bigger, and cut hard after the first shot.', clipId: drawnClip.id});
  assert.equal(asked.length, 1);
  assert.deepEqual([asked[0].connectorId, asked[0].task], ['claude-1', 'editing'], 'the edit is Claude\'s (Opus 5.5) when Claude is on the team');
  assert.match(asked[0].messages[1].content, /INSTRUCTION FROM THE OWNER: Make the Trade routes title slam/);
  assert.match(asked[0].messages[1].content, /DRAWINGS: \{"[^"]+":\{"words"/);
  assert.match(asked[0].messages[0].content, /DRAWING GUIDE:/);
  assert.deepEqual(proposal.steps.map(step => step.ok), [true, true, true, false, false, false]);
  assert.match(proposal.steps[0].summary, /element 2 \(text "Trade routes"\): animate → slam, color → gold/);
  assert.match(proposal.steps[3].error, /half a second|length/);
  assert.match(proposal.steps[4].error, /has no drawing to change/);
  assert.equal(proposal.ops.filter(op => op.type === 'set-drawing').length, 1, 'two changes of one drawing are applied once, in their final form');
  assert.deepEqual(proposal.ops.find(op => op.type === 'set-drawing').sketch.elements[1].size, 'xl');
  assert.equal(editing.latestRow(r3.timelineId).id, r3.id, 'nothing changed yet');
  const usage = store.db.prepare("SELECT status, total_tokens FROM intelligence_usage WHERE kind='edit_command'").all().map(row => ({...row}));
  assert.deepEqual(usage, [{status: 'settled', total_tokens: 1200}]);
  const r4 = editing.applyOps(r3.id, {editedBy: 'Owner', ops: proposal.ops, note: 'Command: slam the title'});
  assert.equal(r4.timeline.drawings[drawnClip.id].elements[1].color, 'gold');
  // An answer that is not operations changes nothing, and its tokens still count.
  scenes.ai.complete = async () => ({content: 'Sure! I made it better.', usage: {promptTokens: 10, completionTokens: 5, totalTokens: 15}, model: 'claude-opus-5-5', provider: 'claude-code'});
  await assert.rejects(editing.command(r4.id, {requestedBy: 'Owner', text: 'Make it better'}), /did not answer with edit operations/);
  assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM intelligence_usage WHERE kind='edit_command' AND status='settled'").get().n, 2);
  await assert.rejects(editing.command(r3.id, {requestedBy: 'Owner', text: 'Anything'}), /newer revision/);
  scenes.ai = {team: () => ({claude: null, chatgpt: null})};
  await assert.rejects(editing.command(r4.id, {requestedBy: 'Owner', text: 'Anything'}), /Connect Claude or ChatGPT/);
});

// ---------------------------------------------------------------- P08c music and sound effects
const {SoundtrackRoom} = require('../soundtrack');
// A soundtrack room with a tested Claude and ElevenLabs connection; the fake ElevenLabs returns real MP3s
// of the requested length (a low tone for music, a short noise for effects).
function soundtrackRoom({store, scenes, renders, editing, dataRoot}, {reply = ''} = {}) {
  const at = new Date().toISOString(), asked = [], generated = [];
  store.db.prepare('INSERT INTO connectors(id,name_key,payload,secret) VALUES(?,?,?,?)').run('claude-1', 'claude-1', JSON.stringify({name: 'claude-1', provider: 'claude-code', revision: 1, test: {status: 'passed', at}}), null);
  store.db.prepare('INSERT INTO connectors(id,name_key,payload,secret) VALUES(?,?,?,?)').run('eleven-1', 'eleven-1', JSON.stringify({name: 'eleven-1', provider: 'elevenlabs', revision: 1, test: {status: 'passed', at}}), Buffer.from('x'));
  const ai = {complete: async ({task, messages, maxTokens, onStart}) => { onStart?.(); asked.push({task, maxTokens, input: JSON.parse(messages[1].content)}); return {content: reply, usage: {promptTokens: 3000, completionTokens: 400, totalTokens: 3400}, model: 'claude-opus-5-5'}; }};
  const clientFor = id => ({generate: async (kind, body, onRequest) => {
    onRequest();
    generated.push({id, kind, body});
    const file = path.join(dataRoot, `generated-${generated.length}.mp3`), seconds = kind === 'music' ? body.music_length_ms / 1000 : body.duration_seconds;
    ffmpeg(['-f', 'lavfi', '-i', kind === 'music' ? 'sine=frequency=110:sample_rate=44100' : 'anoisesrc=c=pink:a=0.6', '-t', String(seconds), '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '128k', '-y', file]);
    return {audio: fs.readFileSync(file), requestId: `req-${generated.length}`};
  }});
  const room = new SoundtrackRoom(store, new ConnectorSlots(store, {transform: (op, input) => input}), scenes, {dataRoot, ai, renders, clientFor});
  editing.soundtrack = room;
  return {room, asked, generated, claude: {id: 'claude-1', revision: 1}, eleven: {id: 'eleven-1', revision: 1}};
}
const SOUND_SETTINGS = {updatedBy: 'Owner', source: 'elevenlabs', musicModel: 'music_v2_5', monthlyMusicSeconds: 120, monthlySfx: 30, centsPerMusicMinute: 30, centsPerSfx: 3};

test('Room 07 scores the video with Claude, generates each cue once inside the limits and mixes it under the voice', {skip}, async t => {
  const env = setup(t);
  const {editing, renders, store, content, family, dataRoot} = env;
  const {approval} = await approvedBoard(env);
  const reply = `Here is the score: ${JSON.stringify({summary: 'A curious open, then warmth as the promise lands.', cues: [
    {start: 0, end: 14, mood: 'curious', energy: 3, prompt: 'Soft marimba and pizzicato strings, 92 BPM, curious and light', entry: 'hit', exit: 'fade', reason: 'The hook.'},
    {start: 16, end: 50, mood: 'warm', energy: 2, prompt: 'Warm felt piano with gentle pads, 80 BPM, reflective', entry: 'fade', exit: 'fade', reason: 'The promise lands dry first.'}]})}`;
  const {room, asked, generated, claude, eleven} = soundtrackRoom(env, {reply});
  // The free score works at once; nothing is generated while the family's source is the sound library (0.60), or
  // before the owner confirms commercial use.
  const free = room.rulesScore(content.id, {requestedBy: 'Owner'});
  assert.deepEqual([free.revision, free.source, free.ready, free.cues[0].start, free.cues.at(-1).end], [1, 'rules', false, 0, 36]);
  assert.throws(() => room.queueMusic(free.id, {requestedBy: 'Owner', connector: eleven, costConfirmed: true}), /sound library/);
  room.saveSettings(family.id, {...SOUND_SETTINGS, revision: 0});
  assert.throws(() => room.queueMusic(free.id, {requestedBy: 'Owner', connector: eleven, costConfirmed: true}), /commercial use/);
  room.saveSettings(family.id, {...SOUND_SETTINGS, revision: 1, commercialUseConfirmed: true});
  assert.throws(() => room.saveSettings(family.id, {...SOUND_SETTINGS, revision: 1, commercialUseConfirmed: true}), /another tab/);
  // Claude scores from the scenes and the narration, inside a token reservation.
  room.queueScore(content.id, {requestedBy: 'Owner', connector: claude});
  assert.throws(() => room.queueScore(content.id, {requestedBy: 'Owner', connector: claude}), /already scoring/);
  const scored = await room.processNextScore();
  assert.deepEqual([scored.revision, scored.source, scored.cues.length, scored.cues[1].end, scored.current], [2, 'claude', 2, 36, true]);
  assert.equal(room.score(free.id).current, false, 'the older score is no longer current');
  assert.equal(asked[0].task, 'scenes');
  assert.equal(asked[0].input.durationSeconds, 36);
  assert.ok(asked[0].input.scenes.length >= 3 && asked[0].input.sentences.length >= 5);
  assert.equal(store.db.prepare("SELECT status FROM intelligence_usage WHERE kind='music_score'").get().status, 'settled');
  assert.throws(() => store.db.prepare('UPDATE scores SET note=? WHERE id=?').run('x', scored.id), /immutable/);
  // Generation needs the cost confirmed, is admitted against the limit and is kept: never generated twice.
  assert.throws(() => room.queueMusic(scored.id, {requestedBy: 'Owner', connector: eleven}), /Confirm the estimated cost/);
  assert.deepEqual(room.queueMusic(scored.id, {requestedBy: 'Owner', connector: eleven, costConfirmed: true}), {queued: 2, estimatedCents: 19});
  for (let k = 0; k < 2; k++) assert.equal((await room.processNextAudio())?.status, 'completed', JSON.stringify(room.state().jobs));
  const ready = room.score(scored.id);
  assert.equal(ready.ready, true);
  assert.equal(room.assetFile(ready.cues[0].asset.id).mime, 'audio/mpeg', 'the listen player gets the checked file');
  assert.ok(ready.cues[0].asset.probe.durationSeconds >= 15 && Number.isFinite(ready.cues[0].asset.probe.loudnessLufs));
  assert.ok(generated.every(item => item.body.force_instrumental === true && /no vocals/.test(item.body.prompt)));
  assert.throws(() => room.queueMusic(scored.id, {requestedBy: 'Owner', connector: eleven, costConfirmed: true}), /already has its music/);
  assert.equal(room.usage(family.id).musicSeconds, 37);
  assert.throws(() => store.db.prepare("UPDATE audio_assets SET key='x'").run(), /immutable/);
  // The sound-effect library stops at the monthly limit and continues after a deliberate retry.
  room.saveSettings(family.id, {...SOUND_SETTINGS, monthlySfx: 19, revision: 2, commercialUseConfirmed: true});
  assert.deepEqual(room.queueLibrary(family.id, {requestedBy: 'Owner', connector: eleven, costConfirmed: true}), {queued: 20, estimatedCents: 60});
  for (let k = 0; k < 20; k++) await room.processNextAudio();
  const blocked = room.state().jobs.filter(job => job.status === 'blocked_budget');
  assert.equal(blocked.length, 1);
  assert.equal(room.library(family.id).filter(item => item.asset).length, 19);
  room.saveSettings(family.id, {...SOUND_SETTINGS, revision: 3, commercialUseConfirmed: true});
  room.retryAudio(blocked[0].id, {});
  assert.equal((await room.processNextAudio())?.status, 'completed');
  assert.equal(room.library(family.id).every(item => item.asset), true);
  // The edit names the score; the render lays the music under the finished voice and checks the encoded mix.
  const edit = await editing.generate(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id});
  assert.throws(() => editing.applyOps(edit.id, {editedBy: 'Owner', ops: [{type: 'set-audio', settings: {music: {enabled: true}}}]}), /score/);
  const mixed = editing.applyOps(edit.id, {editedBy: 'Owner', ops: [{type: 'set-audio', settings: {mode: 'normalize', targetLufs: -16, truePeakDb: -2, music: {enabled: true, levelLufs: -26, duck: 'medium', fadeSeconds: 1.5, scoreId: scored.id}, sfx: {enabled: true, density: 'rich', levelDb: -12}}}]});
  assert.equal(mixed.timeline.audio.music.scoreId, scored.id, 'the edit names its score');
  const report = await renders.checkReadiness({requestedBy: 'Owner'});
  assert.equal(report.filters.sidechaincompress && report.filters.amix && report.filters.adelay, true, 'the mix filters are part of readiness');
  renders.pin({readinessId: report.id, pinnedBy: 'Owner', reason: 'Reviewed build for the music mix.'});
  const queued = renders.queueRender(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id, editRevisionId: mixed.id});
  assert.deepEqual((({music, sfx}) => [music.length, sfx.length])(JSON.parse(renders.row(queued.id).scope).edit.soundtrack), [2, 0], 'no drawn shots: no invented effects');
  const done = await renders.processNext();
  assert.equal(done?.status, 'completed', JSON.stringify(renders.publicJob(renders.row(queued.id)).error));
  const result = JSON.parse(renders.row(queued.id).result);
  assert.equal(result.audioQc.passed, true, JSON.stringify(result.audioQc));
  assert.ok(Math.abs(result.audioQc.integratedLufs - -16) <= 1, `the whole mix is brought back to the target (${result.audioQc.integratedLufs})`);
  const record = JSON.parse(fs.readFileSync(path.join(dataRoot, result.manifest.relativePath), 'utf8'));
  assert.deepEqual(record.audio.mix.music.map(item => item.cueId), ['cue001', 'cue002']);
  assert.ok(record.commands.some(command => command.step === 'mix music and effects'));
  assert.ok(record.commands.every(command => !command.args.join(' ').includes(dataRoot)), 'command plans do not leak local paths');
});

// ---------------------------------------------------------------- 0.60 the sound library
const {SoundLibrary} = require('../sound-library');
test('0.60: music and effects come from the owner\'s sound library: imported once, matched to the story, looped when short, mixed for free', {skip}, async t => {
  const env = setup(t);
  const {editing, renders, store, scenes, content, family, dataRoot} = env;
  const {approval} = await approvedBoard(env);
  // The owner's downloads: music in folders, effects named for what they are, a copy, a silent file and a note.
  const downloads = fs.mkdtempSync(path.join(os.tmpdir(), 'downloads-'));
  t.after(() => fs.rmSync(downloads, {recursive: true, force: true}));
  const make = (rel, source, seconds) => { const file = path.join(downloads, rel); fs.mkdirSync(path.dirname(file), {recursive: true}); ffmpeg(['-f', 'lavfi', '-i', source, '-t', String(seconds), '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '96k', '-y', file]); return file; };
  make('Music/Calm/soft-piano-reflective-116199.mp3', 'sine=frequency=220:sample_rate=44100', 30);
  make('Music/mystery-documentary-curious-550123.mp3', 'sine=frequency=180:sample_rate=44100', 12);
  make('Music/epic-cinematic-trailer-998877.mp3', 'sine=frequency=140:sample_rate=44100', 40);
  const whoosh = make('SFX/whoosh-6316.mp3', 'anoisesrc=c=pink:a=0.6:r=44100', 1);
  fs.copyFileSync(whoosh, path.join(downloads, 'SFX', 'whoosh-copy.mp3'));
  make('SFX/silent-room.mp3', 'anullsrc=r=44100:cl=stereo', 1);
  make('cash-register-ching-551.mp3', 'anoisesrc=c=white:a=0.5:r=44100', 1.5);
  fs.writeFileSync(path.join(downloads, 'readme.txt'), 'not audio');
  const sounds = new SoundLibrary(store, {dataRoot, renders});
  assert.throws(() => sounds.queueImport({requestedBy: 'Owner', folder: 'Music', source: 'pixabay', licenceConfirmed: true}), /full path/);
  assert.throws(() => sounds.queueImport({requestedBy: 'Owner', folder: downloads, source: 'pixabay'}), /Confirm/);
  assert.throws(() => sounds.queueImport({requestedBy: 'Owner', folder: dataRoot, source: 'pixabay', licenceConfirmed: true}), /outside the program's data folder/);
  assert.throws(() => sounds.queueImport({requestedBy: 'Owner', folder: downloads, source: 'other', licence: 'free', licenceConfirmed: true}), /licence/);
  assert.equal(sounds.queueImport({requestedBy: 'Owner', folder: downloads, source: 'pixabay', licenceConfirmed: true}).progress.total, 7, 'audio files only');
  const imported = await sounds.processNextImport();
  assert.deepEqual([imported.status, imported.progress.added, imported.progress.already, imported.progress.failed], ['completed', 5, 1, 1], JSON.stringify(imported.progress));
  assert.match(imported.progress.problems[0], /silent-room/);
  const music = sounds.tracks('music'), effects = sounds.tracks('sfx');
  assert.deepEqual(music.map(item => item.title).sort(), ['epic cinematic trailer', 'mystery documentary curious', 'soft piano reflective']);
  assert.deepEqual(music.find(item => item.title.startsWith('soft')).tags, ['calm', 'soft', 'piano', 'reflective'], 'tags from the folders and the name');
  assert.deepEqual(effects.map(item => item.title).sort(), ['cash register ching', 'whoosh'], 'a short file at the top is an effect');
  assert.ok(fs.existsSync(path.join(dataRoot, 'sound-library', music[0].id.slice(0, 2), `${music[0].id}.mp3`)), 'kept once by its checksum in the data folder');
  assert.ok(music.every(item => Number.isFinite(item.loudnessLufs) && item.licence.startsWith('Pixabay Content License')));
  assert.equal(sounds.list({q: 'piano'}).total, 1);
  sounds.queueImport({requestedBy: 'Owner', folder: downloads, source: 'pixabay', licenceConfirmed: true});
  assert.equal((await sounds.processNextImport()).progress.already, 6, 'importing again adds nothing');

  // The library is the default source: nothing to confirm, nothing to pay, every cue gets a track at once.
  const at = new Date().toISOString(), asked = [];
  store.db.prepare('INSERT INTO connectors(id,name_key,payload,secret) VALUES(?,?,?,?)').run('claude-1', 'claude-1', JSON.stringify({name: 'claude-1', provider: 'claude-code', revision: 1, test: {status: 'passed', at}}), null);
  const ai = {complete: async ({messages, onStart}) => {
    onStart?.();
    const input = JSON.parse(messages[1].content), ref = title => input.library.find(item => item.title.startsWith(title)).ref;
    asked.push({system: messages[0].content, input});
    return {content: JSON.stringify({summary: 'Curious open, then the push.', cues: [
      {start: 0, end: 20, mood: 'curious', energy: 3, prompt: 'Light mystery pulse under the hook', entry: 'hit', exit: 'fade', track: ref('mystery')},
      {start: 20, end: 36, mood: 'punchy', energy: 4, prompt: 'Driving drums for the payoff', entry: 'fade', exit: 'fade', track: 'T99'}]}), usage: {promptTokens: 2000, completionTokens: 300, totalTokens: 2300}, model: 'claude-opus-5-5'};
  }};
  const room = new SoundtrackRoom(store, new ConnectorSlots(store, {transform: (op, input) => input}), scenes, {dataRoot, ai, renders, sounds});
  editing.soundtrack = room;
  assert.equal(room.settings(family.id).source, 'library');
  const free = room.rulesScore(content.id, {requestedBy: 'Owner'});
  assert.equal(free.ready, true);
  assert.ok(free.cues.every(cue => cue.asset.library.source === 'pixabay'));
  assert.throws(() => room.queueMusic(free.id, {requestedBy: 'Owner', connector: {id: 'claude-1', revision: 1}, costConfirmed: true}), /sound library/);
  room.queueScore(content.id, {requestedBy: 'Owner', connector: {id: 'claude-1', revision: 1}});
  const scored = await room.processNextScore();
  assert.ok(scored, JSON.stringify(room.state().contents));
  assert.ok(asked[0].input.library.length === 3 && asked[0].input.library.every(item => /^T\d+$/.test(item.ref) && !item.id), 'Claude sees short refs, not checksums');
  assert.match(asked[0].system, /LIBRARY:/);
  assert.equal(scored.cues[0].asset.library.title, 'mystery documentary curious');
  assert.ok(scored.warnings.some(item => /not in the library/.test(item)) && scored.cues[1].asset, 'an unknown ref gets the best fitting track');
  assert.equal(scored.cues[1].asset.library.title, 'epic cinematic trailer');
  // The effect slots are filled by the sounds' names; the owner can choose another one per slot.
  const slots = room.library(family.id), slot = kind => slots.find(item => item.kind === kind);
  assert.deepEqual([slot('whoosh').asset.key, slot('cash').asset.key, slot('thunder').asset], ['whoosh', 'cash register ching', null]);
  const cash = effects.find(item => item.title.startsWith('cash'));
  const picked = room.chooseEffect(family.id, {chosenBy: 'Owner', kind: 'ding', soundId: cash.id, revision: room.settings(family.id).revision});
  assert.deepEqual([picked.asset.id, picked.chosen], [cash.id, true]);
  assert.throws(() => room.chooseEffect(family.id, {chosenBy: 'Owner', kind: 'ding', soundId: music[0].id, revision: room.settings(family.id).revision}), /sound effect from the library/);
  // The render: the edit names the score, the 12 s track under a 20 s cue loops, and the mix is checked.
  const edit = await editing.generate(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id});
  const mixed = editing.applyOps(edit.id, {editedBy: 'Owner', ops: [{type: 'set-audio', settings: {mode: 'normalize', targetLufs: -16, truePeakDb: -2, music: {enabled: true, levelLufs: -26, duck: 'medium', fadeSeconds: 1.5, scoreId: scored.id}, sfx: {enabled: false, density: 'none', levelDb: -12}}}]});
  const report = await renders.checkReadiness({requestedBy: 'Owner'});
  renders.pin({readinessId: report.id, pinnedBy: 'Owner', reason: 'Reviewed build for the library mix.'});
  const queued = renders.queueRender(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id, editRevisionId: mixed.id});
  const cues = JSON.parse(renders.row(queued.id).scope).edit.soundtrack.music;
  assert.ok(cues.every(cue => cue.relativePath.startsWith('sound-library/')));
  assert.ok(cues[0].trackSeconds < cues[0].end - cues[0].start, 'the first track is shorter than its cue');
  const rendered = await renders.processNext();
  assert.equal(rendered?.status, 'completed', JSON.stringify(renders.publicJob(renders.row(queued.id)).error));
  const result = JSON.parse(renders.row(queued.id).result);
  assert.equal(result.audioQc.passed, true, JSON.stringify(result.audioQc));
  const record = JSON.parse(fs.readFileSync(path.join(dataRoot, result.manifest.relativePath), 'utf8'));
  const mixArgs = record.commands.find(command => command.step === 'mix music and effects').args;
  assert.equal(mixArgs.filter(arg => arg === '-stream_loop').length, 1, 'only the short track loops');
  // A track switched off leaves the score unready, with a plain reason at the next render.
  sounds.update(cues[0].sha256, {updatedBy: 'Owner', enabled: false});
  assert.equal(room.score(scored.id).ready, false);
  assert.throws(() => renders.queueRender(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id, editRevisionId: mixed.id}), /left the sound library or was switched off/);
});
