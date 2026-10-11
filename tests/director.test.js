'use strict';
// P06i: the story director's map is repaired into full coverage with only available engines and the designed-shot
// budget, sliced per plan part, and the finished mix is measured (one engine too long, engines on every shot).
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../director');

const engines = ['stickman', 'handdrawn', 'motion', 'atelier'];

test('the map covers every sentence once, keeps only available engines and spends the designed-shot budget in order', () => {
  const warnings = [];
  const map = D.validateMap({structure: 'Cold open, two chapters, payoff.', direction: {read: 'x'},
    chapters: [{title: 'The hook', sentenceStart: 1, sentenceEnd: 4, job: 'hook', home: 'stickman', rehook: 'A bolt splits the frame'}, {title: 'How', sentenceStart: 7, sentenceEnd: 10, job: 'odd', home: 'laser'}],
    beats: [{sentenceStart: 1, sentenceEnd: 2, engine: 'atelier', why: 'the thesis lands'}, {sentenceStart: 3, sentenceEnd: 5, engine: 'atelier'}, {sentenceStart: 8, sentenceEnd: 12, engine: 'montage'}]},
  {first: 1, last: 10, engines, primary: 'stickman', designedShots: 1, warn: message => warnings.push(message)});
  assert.deepEqual(map.chapters.map(item => [item.sentenceStart, item.sentenceEnd, item.job, item.home]), [[1, 6, 'hook', 'stickman'], [7, 10, 'explain', 'stickman']]);
  assert.equal(map.chapters[0].rehook, 'A bolt splits the frame');
  assert.deepEqual(map.beats.map(item => [item.sentenceStart, item.sentenceEnd, item.engine]), [[1, 2, 'atelier'], [3, 7, 'motion'], [8, 10, 'stickman']]);
  assert.match(warnings.join(' '), /over the budget of 1 designed shots[\s\S]*"montage" is not available/);
  assert.deepEqual(map.direction, {read: 'x'});
  assert.equal(D.validateMap({structure: 'no beats'}, {first: 1, last: 3, engines, primary: 'stickman'}), null);
  // A plan part reads only its own chapters and beats.
  assert.deepEqual(D.slice(map, 8, 10).beats.map(item => item.sentenceStart), [8]);
  assert.deepEqual(D.slice(map, 3, 7).chapters.map(item => item.title), ['The hook', 'How']);
});

test('the director reads the doctrine, the available engines and the budget; atelier recipes only when atelier is available', () => {
  const input = {style: {name: 'Story Mix', engine: 'stickman', mix: true, engines, designedShots: 18}, sentences: [{n: 1, seconds: 3, text: 'Hello.'}]};
  const [system] = D.mapMessages(input);
  assert.match(system.content, /STORY DIRECTOR[\s\S]*RHYTHM for long videos[\s\S]*story mix: no engine leads[\s\S]*At most 18 atelier beats/);
  assert.match(system.content, /ATELIER SHOTS/);
  assert.doesNotMatch(D.mapMessages({...input, style: {...input.style, engines: ['stickman', 'motion']}})[0].content, /ATELIER SHOTS|atelier beats/);
  assert.deepEqual(D.availableEngines({sources: ['generated-graphics'], frames: false}), ['stickman', 'handdrawn', 'motion']);
  assert.deepEqual(D.availableEngines({sources: ['stock-video']}), ['montage']);
  assert.equal(D.designedBudget(540, 2), 18);
});

test('the mix is measured for free: a long stretch in one engine and engines changing on every shot are named, short videos are left alone', () => {
  let at = 0;
  const shot = (engine, seconds, k) => { const item = {label: `S${String(k).padStart(2, '0')}`, startSeconds: at, durationSeconds: seconds, source: engine === 'montage' ? 'stock-video' : 'generated-graphics', ...(engine === 'atelier' ? {frame: {html: '<div></div>'}} : engine === 'montage' ? {} : {sketch: {engine}})}; at += seconds; return item; };
  const shots = [shot('stickman', 30, 1), shot('handdrawn', 120, 2), ...Array.from({length: 8}, (_, k) => shot(k % 2 ? 'motion' : 'atelier', 2.5, k + 3)), shot('stickman', 40, 11)];
  const mix = D.measureMix([{shots}], {primary: 'stickman', seconds: at});
  assert.deepEqual(Object.keys(mix.engines).sort(), ['atelier', 'handdrawn', 'motion', 'stickman']);
  assert.deepEqual([mix.longestRun.engine, mix.longestRun.seconds], ['handdrawn', 120]);
  assert.match(mix.notes.join(' '), /S02-S02: 120 s in handdrawn[\s\S]*changes \d+ times in 20 s/);
  at = 0;
  assert.deepEqual(D.measureMix([{shots: [shot('stickman', 100, 1), shot('motion', 20, 2)]}], {primary: 'stickman', seconds: 120}).notes, [], 'a two-minute video is measured but not judged');
});

test('the director builds the story\'s world first: its era and rules, a cast dressed for it and a kit for what the vocabulary lacks', () => {
  const input = {style: {name: 'Story Mix', engine: 'stickman', mix: true, engines, designedShots: 4}, sentences: [{n: 1, seconds: 3, text: 'Ten thousand years ago, a hunter left his cave.'}], competitorGuidance: [{technique: 'cold open on the danger'}]};
  const [system, user] = D.mapMessages(input);
  assert.match(system.content, /WORLD: build the story's own world[\s\S]*NICHE: the competitor guidance[\s\S]*"outfit": [^"]*\|kit:<id>[\s\S]*WORLD KIT[\s\S]*"world": \{"era": one of \["prehistoric"/);
  assert.match(user.content, /cold open on the danger/, 'the director reads the niche guidance');
  const warnings = [];
  const map = D.validateMap({structure: 'A hunt in three acts.', world: {era: 'prehistoric', place: 'a river valley in the ice age', rules: ['No metal; tools are stone, wood and bone', 'People live in caves']},
    cast: [{id: 'c1', name: 'Ugg', role: 'hunter', look: {hair: 'messy', facial: 'beard', outfit: 'kit:fur'}}, {id: 'c2', name: 'Ama', look: {outfit: 'kit:nothing'}}],
    kit: [{id: 'fur', kind: 'outfit', name: 'fur tunic', shapes: [{path: 'M30 0 L70 0 L72 110 L28 110 Z', fill: '#9C6B3F'}]}, {id: 'mammoth', kind: 'prop', shapes: [{circle: [50, 50, 40], fill: '#8B5A3C'}]}],
    chapters: [{title: 'The hunt', sentenceStart: 1, sentenceEnd: 1, job: 'hook', home: 'handdrawn'}], beats: [{sentenceStart: 1, sentenceEnd: 1, engine: 'handdrawn', why: 'the valley'}]},
  {first: 1, last: 1, engines, primary: 'stickman', warn: message => warnings.push(message)});
  assert.deepEqual(map.world, {era: 'prehistoric', place: 'a river valley in the ice age', rules: ['No metal; tools are stone, wood and bone', 'People live in caves']});
  assert.deepEqual(Object.keys(map.kit), ['fur', 'mammoth']);
  assert.deepEqual(map.cast.map(item => item.look.outfit), ['kit:fur', 'none'], 'a costume that was not designed falls back, named');
  assert.match(warnings.join(' '), /Cast: Character 2 outfit/);
  assert.deepEqual(D.validateWorld({era: 'jurassic'}), {era: 'modern', place: '', rules: []});
});
