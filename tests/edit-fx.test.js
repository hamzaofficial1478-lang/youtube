'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const Fx = require('../edit-fx');
const B = require('../editing-brain');
const M = require('../music');

const hasFFmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], {stdio: 'ignore'}); return true; } catch { return false; } })();
const fps = 30;
// Three clips of one scene: a held calm shot, a hit, a sad line (seconds 0-4, 4-7, 7-11).
const clips = [
  {id: 'c1', shotId: 's1', sceneId: 'a', purpose: 'context', mediaType: 'video', start: 0, frames: 120},
  {id: 'c2', shotId: 's2', sceneId: 'a', purpose: 'context', mediaType: 'video', start: 120, frames: 90},
  {id: 'c3', shotId: 's3', sceneId: 'b', purpose: 'turn', mediaType: 'video', start: 210, frames: 120},
];
const words = [
  {text: 'The', start: 0.2, end: 0.4}, {text: 'quiet', start: 0.4, end: 0.8}, {text: 'village', start: 0.8, end: 1.3},
  {text: 'Then', start: 4.2, end: 4.5}, {text: 'he', start: 4.5, end: 4.6}, {text: 'struck', start: 4.7, end: 5.1}, {text: 'hard', start: 5.1, end: 5.5},
  {text: 'Everything', start: 7.2, end: 7.8}, {text: 'was', start: 7.8, end: 8}, {text: 'lost', start: 8.1, end: 8.6},
];
const sentences = [{n: 1, text: 'The quiet village.', startSeconds: 0, endSeconds: 4}, {n: 2, text: 'Then he struck hard.', startSeconds: 4, endSeconds: 7}, {n: 3, text: 'Everything was lost.', startSeconds: 7, endSeconds: 11}];
const delivery = {lines: [{n: 1, emotion: 'calm', energy: 2}, {n: 2, emotion: 'dramatic', energy: 5}, {n: 3, emotion: 'sad', energy: 2}]};
const place = (grammar, extra = {}) => Fx.placeEffects({clips, fps, words, sentences, delivery, grammarOf: () => grammar, camera: () => 'still', meaningsOf: M.meaningsOf, ...extra});

test('0.109: each engine edits by its own grammar and by the feeling of the line', () => {
  const anime = place('atelier/anime'), board = place('handdrawn'), pixel = place('atelier/pixel');
  const kinds = (result, id) => (result.fx[id] || []).map(effect => effect.kind);
  // The hit: an anime edit throws an impact frame and a shake on "struck"; the whiteboard teacher stays quiet.
  assert.ok(kinds(anime, 'c2').includes('impact') && kinds(anime, 'c2').includes('shake'), JSON.stringify(anime.fx.c2));
  const hit = anime.fx.c2.find(effect => effect.kind === 'impact');
  assert.ok(Math.abs(hit.at - (4.7 - 4 - 0.04)) < 0.01, 'on the word, timed from the clip start');
  assert.match(hit.reason, /"struck"/);
  assert.ok(!kinds(board, 'c2').some(kind => ['impact', 'shake', 'flash', 'glitch'].includes(kind)), JSON.stringify(board.fx.c2));
  // The sad line: a cold colour mood and a vignette, never a hit.
  assert.deepEqual(anime.fx.c3.filter(effect => effect.kind === 'grade').map(effect => effect.grade), ['cold']);
  assert.ok(kinds(anime, 'c3').includes('vignette'));
  // The cinema bars go to the dramatic hit or the turn, and only once in an 11 s video (one per 90 s).
  assert.equal(Object.values(anime.fx).flat().filter(effect => effect.kind === 'letterbox').length, 1);
  assert.ok(kinds(anime, 'c2').includes('letterbox') || kinds(anime, 'c3').includes('letterbox'));
  // A held shot whose drawing keeps a still camera gets a slow push; pixel art never zooms.
  assert.ok(kinds(anime, 'c1').includes('push') && kinds(board, 'c1').includes('push'));
  assert.ok(!Object.values(pixel.fx).flat().some(effect => ['push', 'punch'].includes(effect.kind)));
  // A drawing that moves its own camera is not pushed over.
  assert.ok(!kinds(place('atelier/anime', {camera: () => 'push-in'}), 'c1').includes('push'));
  // Every placed effect passes the strict check of its clip.
  for (const [id, list] of Object.entries(anime.fx)) for (const effect of list) Fx.checkEffect(effect, clips.find(clip => clip.id === id).frames / fps);
  // Deterministic.
  assert.deepEqual(place('atelier/anime'), anime);
});

test('0.109: an effect is checked strictly, and the editor operations add and remove them', () => {
  assert.throws(() => Fx.checkEffect({kind: 'explode'}, 3), /Effects are/);
  assert.throws(() => Fx.checkEffect({kind: 'shake', at: 3.5}, 3), /inside the clip/);
  assert.throws(() => Fx.checkEffect({kind: 'grade', at: 0, grade: 'rainbow'}, 3), /Colour moods/);
  assert.throws(() => Fx.checkEffect({kind: 'flash', at: 0, amount: 4}, 3), /0.1 to 1/);
  assert.equal(Fx.checkEffect({kind: 'flash', at: 1}, 3).amount, 0.8);
  const timeline = {schema: 'ytprod.edit/1', fps, format: 'long-form', totalFrames: 330, narrationSeconds: 11, scenes: [], graphics: [], markers: [],
    clips: clips.map(clip => ({...clip, label: clip.id.toUpperCase(), assetId: 'a', clipSeconds: null, inSeconds: 0, speed: 1, move: null, hero: false, part: null})),
    joins: [{type: 'cut', frames: 0}, {type: 'cut', frames: 0}], ending: {fadeOutFrames: 0}};
  const added = B.applyOp(timeline, {type: 'add-fx', clipId: 'c2', kind: 'shake', at: 0.7, amount: 0.9}).timeline;
  assert.deepEqual(added.clips[1].fx.map(effect => [effect.kind, effect.at, effect.amount]), [['shake', 0.7, 0.9]]);
  assert.throws(() => B.applyOp(timeline, {type: 'add-fx', clipId: 'c2', kind: 'shake', at: 9}), /inside the clip/);
  const graded = B.applyOp(B.applyOp(added, {type: 'add-fx', clipId: 'c2', kind: 'grade', grade: 'cold'}).timeline, {type: 'add-fx', clipId: 'c2', kind: 'grade', grade: 'danger'}).timeline;
  assert.deepEqual(graded.clips[1].fx.filter(effect => effect.kind === 'grade').map(effect => effect.grade), ['danger'], 'one colour mood a clip');
  assert.equal(B.applyOp(graded, {type: 'remove-fx', clipId: 'c2', kind: 'shake'}).timeline.clips[1].fx.length, 1);
  assert.equal(B.applyOp(graded, {type: 'remove-fx', clipId: 'c2'}).timeline.clips[1].fx, undefined);
  assert.throws(() => B.applyOp(timeline, {type: 'remove-fx', clipId: 'c1'}), /no .*effect to remove/);
  // A shorter hold drops the effects that no longer fit their clip.
  const shorter = B.applyOp(B.applyOp(timeline, {type: 'add-fx', clipId: 'c1', kind: 'flash', at: 3.5}).timeline, {type: 'set-hold', clipId: 'c1', seconds: 2}).timeline;
  assert.equal(shorter.clips[0].fx, undefined);
  // A bad effect stored in a timeline is caught by its check.
  assert.throws(() => B.validateTimeline({...timeline, clips: timeline.clips.map((clip, k) => (k ? clip : {...clip, fx: [{kind: 'shake', at: 99}]}))}), /inside the clip/);
});

test('0.109: the prompt names every effect and the grammar of the engines in the video', () => {
  const lines = Fx.promptLines(['atelier/anime', 'stickman']).join('\n');
  for (const kind of Fx.KINDS) assert.match(lines, new RegExp(`\\b${kind} \\(`));
  assert.match(lines, /EDITING GRAMMAR of Anime \(HTML render\)/);
  assert.match(lines, /EDITING GRAMMAR of Stickman/);
  assert.match(lines, /FEELING FIRST/);
});

test('0.109: the effects render through FFmpeg and keep BT.709 TV range', {skip: hasFFmpeg ? false : 'FFmpeg is not installed'}, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fx-')), out = path.join(dir, 'fx.mp4');
  const effects = [{kind: 'push', at: 0, until: 2, amount: 0.6}, {kind: 'punch', at: 0.3, amount: 1}, {kind: 'shake', at: 0.8, amount: 1}, {kind: 'flash', at: 1.1, amount: 1}, {kind: 'impact', at: 1.4, amount: 1}, {kind: 'glitch', at: 1.5, amount: 0.8}, {kind: 'grade', at: 0, grade: 'cold', amount: 0.8}, {kind: 'vignette', at: 0, amount: 0.7}, {kind: 'letterbox', at: 1.6, until: 2, amount: 0.7}];
  for (const pixel of [false, true]) {
    const chain = `format=yuv420p,setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709,${Fx.filters(effects.filter(effect => !pixel || effect.kind !== 'grade'), {width: 320, height: 180, fps, frames: 60, pixel})}format=yuv420p`;
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `testsrc2=size=320x180:rate=${fps}:duration=2`, '-vf', chain, '-frames:v', '60', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-y', out]);
    const probe = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=width,height,nb_read_frames,color_range,color_space', '-of', 'json', out]).toString();
    const stream = JSON.parse(probe).streams[0];
    assert.deepEqual([stream.width, stream.height, Number(stream.nb_read_frames), stream.color_range, stream.color_space], [320, 180, 60, 'tv', 'bt709'], pixel ? 'pixel' : 'smooth');
  }
  assert.equal(Fx.filters([], {width: 320, height: 180, fps, frames: 60}), '', 'no effects, no filters');
  fs.rmSync(dir, {recursive: true, force: true});
});
