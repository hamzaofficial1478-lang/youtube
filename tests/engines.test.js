'use strict';
// P06d/0.21: the editing engines are described to Claude with their strengths, risks and how they usually mix.
// 0.37 (owner decision 2026-10-18): a style on one engine uses only that engine; the Story Mix uses every engine.
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../engines');
const {LAUNCH_PROFILES} = require('../style');
const spec = key => LAUNCH_PROFILES.find(item => item.key === key).spec;

test('a style on one engine uses only that engine; the story mix and atelier use every engine', () => {
  assert.deepEqual(LAUNCH_PROFILES.map(item => E.primaryEngine(item.spec)), ['stickman', 'handdrawn', 'stickman', 'atelier', 'montage', 'cinema']);
  assert.deepEqual(E.engineScope(spec('cinematic-hybrid')), {mix: false, drawn: [], footage: true, frames: false, films: []}, 'cinematic: footage only, nothing drawn');
  assert.deepEqual(E.engineScope(spec('stickman-sketch-explainer')), {mix: false, drawn: ['stickman'], footage: false, frames: false, films: []});
  assert.deepEqual(E.engineScope(spec('hand-drawn-canvas')), {mix: false, drawn: ['handdrawn'], footage: false, frames: false, films: []});
  assert.deepEqual(E.engineScope(spec('documentary-montage')), {mix: false, drawn: ['motion'], footage: true, frames: false, films: []}, 'documentary: its footage and its drawn looks');
  assert.deepEqual(E.engineScope(spec('story-mix')), {mix: true, drawn: ['stickman', 'handdrawn', 'motion'], footage: true, frames: true, films: []});
  assert.deepEqual(E.drawEngines('stickman'), ['stickman', 'handdrawn', 'motion'], 'the main look leads');
  assert.deepEqual(E.drawEngines('handdrawn'), ['handdrawn', 'stickman', 'motion']);
  assert.deepEqual(E.drawEngines('montage'), ['stickman', 'handdrawn', 'motion']);
  for (const text of [...E.COMBINATIONS, ...Object.values(E.ENGINES).flatMap(item => [item.strengths, item.risks])]) assert.doesNotMatch(text, /\bnever\b|owner rule/i, 'advice, not a rule');
});

test('a one-engine style plans its own drawn shots only; documentary keeps its footage; the mix reasons about engines', () => {
  const owned = {...spec('stickman-sketch-explainer'), visuals: {...spec('stickman-sketch-explainer').visuals, sources: ['ai-image', 'generated-graphics'], primarySource: 'ai-image'}};
  const planned = E.plannerSources(owned, ['ai-image', 'generated-graphics']);
  assert.deepEqual([planned.engine, planned.sources, planned.primarySource], ['stickman', ['generated-graphics'], 'generated-graphics'], 'no footage or AI images in a stickman video');
  assert.deepEqual(E.plannerSources(spec('documentary-montage'), ['stock-video', 'generated-graphics']).primarySource, 'stock-video');
  const guide = E.promptGuide('stickman');
  assert.match(guide, /ENGINE\. This video uses one engine: Stickman animation \(sketch\.engine "stickman"\)\..*use nothing from the other engines and no footage/);
  assert.match(guide, /MOTION GRAPHICS are a layer of every engine, not an engine of their own/);
  assert.doesNotMatch(guide, /- handdrawn: best for|What usually happens when engines mix/, 'a stickman video is not offered other engines');
  const doc = E.promptGuide('montage', {design: 'mix', sources: ['generated-graphics']});
  assert.match(doc, /one engine: the Documentary engine - its drawn shots/);
  assert.doesNotMatch(doc, /Footage shots \(stock or image sources\)/, 'no footage without a footage source');
  const mix = E.promptGuide('stickman', {mix: true});
  assert.match(mix, /story mix: no engine leads/);
  assert.match(mix, /- handdrawn: best for [\s\S]*watch out:/);
  assert.match(mix, /What usually happens when engines mix \(weigh it, do not follow it blindly\)/);
  assert.doesNotMatch(mix, /Never use/);
});

test('a stickman look briefs the planner in its own way, only where stick figures lead or mix', () => {
  assert.match(E.promptGuide('stickman', {look: 'storybook'}), /STICKMAN LOOK: storybook\. .*chapter/);
  assert.match(E.promptGuide('handdrawn', {mix: true, look: 'doodle'}), /STICKMAN LOOK: doodle\. .*visual gag/);
  assert.doesNotMatch(E.promptGuide('stickman', {look: 'classic'}), /STICKMAN LOOK/);
  assert.doesNotMatch(E.promptGuide('motion', {look: 'whiteboard'}), /STICKMAN LOOK/, 'a motion-graphics video is not told how its stick-figure guests look');
  assert.deepEqual(Object.keys(E.LOOKS), ['classic', 'whiteboard', 'storybook', 'illustrated', 'doodle'], 'the history cartoon is a documentary look since 0.37');
});

test('the hand-drawn engine is whiteboard animation with its own looks; taste is Claude\'s, never a rule', () => {
  assert.deepEqual(Object.keys(E.BOARDS), ['cartoon', 'marker', 'pencil', 'framed', 'dry-erase']);
  assert.match(E.promptGuide('handdrawn', {board: 'dry-erase'}), /WHITEBOARD LOOK: /);
  assert.doesNotMatch(E.promptGuide('stickman', {board: 'dry-erase'}), /WHITEBOARD LOOK/, 'a stickman video is not told about whiteboard looks');
  for (const engine of ['stickman', 'handdrawn', 'motion']) assert.match(E.promptGuide(engine), /TASTE: references are ideas, never rules/);
});

test('a style learned from an approved study briefs the planner in its own words', () => {
  assert.match(E.promptGuide('handdrawn', {brief: 'Hold each drawing while its notes arrive.'}), /LEARNED LOOK \(from an approved style study; use the techniques, never copy a channel\): Hold each drawing/);
  assert.doesNotMatch(E.promptGuide('handdrawn'), /LEARNED LOOK/);
});

test('Mix: an engine with several looks can use all of them in one video, chosen per scene for a reason', () => {
  const stick = E.promptGuide('stickman', {look: 'mix'}), board = E.promptGuide('handdrawn', {board: 'mix'});
  assert.match(stick, /STICKMAN LOOKS \(mix\): .*sketch\.look.*classic \(classic cartoon\).*doodle \(doodle\).*never a different look on every shot/);
  assert.match(board, /WHITEBOARD LOOKS \(mix\): .*sketch\.board.*dry-erase \(dry-erase markers\)/);
  assert.doesNotMatch(E.promptGuide('stickman', {look: 'storybook'}), /\(mix\)/);
  assert.doesNotMatch(E.promptGuide('motion', {look: 'mix', board: 'mix'}), /\(mix\)/, 'a motion-graphics video is not told about other engines\' looks');
});

test('documentary looks brief the planner, and their mix only where documentary leads or mixes', () => {
  assert.deepEqual(Object.keys(E.DESIGNS), ['cartoon', 'painted', 'vector', 'infographic', 'kinetic', 'collage', 'data']);
  assert.match(E.promptGuide('montage', {design: 'data'}), /DOCUMENTARY LOOK: data desk\. .*Use only numbers the narration says/);
  assert.match(E.promptGuide('montage', {design: 'cartoon'}), /DOCUMENTARY LOOK: cartoon documentary\. A comic history cartoon/);
  assert.match(E.promptGuide('montage', {design: 'footage', sources: ['generated-graphics']}), /DOCUMENTARY LOOK: footage with motion graphics\..*Footage is not connected on this PC/);
  assert.match(E.promptGuide('montage', {design: 'mix', sources: ['stock-video', 'generated-graphics']}), /DOCUMENTARY LOOKS \(mix\): .*sketch\.design.*painted \(painted story\).*Footage shots \(stock or image sources\)/);
  assert.doesNotMatch(E.promptGuide('stickman', {design: 'mix'}), /DOCUMENTARY LOOK/, 'a stickman video is not told about documentary looks');
  assert.match(E.promptGuide('motion', {mix: true, design: 'kinetic'}), /DOCUMENTARY LOOK: kinetic type/);
});

test('0.39 film looks: a style may print every drawn shot in one look or let Claude choose; shots may name one only then', () => {
  const {validateStyleSpec, DRAWING_FILMS} = require('../style');
  const base = spec('documentary-montage');
  assert.deepEqual(DRAWING_FILMS, ['none', 'choose', ...Object.keys(E.FILMS)]);
  assert.equal(validateStyleSpec({...base, drawing: {...base.drawing, film: 'silent'}}).drawing.film, 'silent');
  assert.equal('film' in validateStyleSpec({...base, drawing: {...base.drawing, film: 'none'}}).drawing, false, 'none is the engine\'s own finish');
  assert.throws(() => validateStyleSpec({...base, drawing: {...base.drawing, film: 'oil'}}), /film look/);
  assert.equal(E.engineScope({...base, drawing: {...base.drawing, film: 'choose'}}).films, null, 'any look when the style has one or Claude chooses');
  assert.deepEqual(E.engineScope(base).films, []);
  assert.match(E.promptGuide('montage', {design: 'mix', film: 'woodcut'}), /FILM LOOK: woodcut print[\s\S]*change of register/);
  assert.doesNotMatch(E.promptGuide('montage', {design: 'mix'}), /FILM LOOK/);
  assert.match(E.MOTION_LAYER, /a loupe that magnifies a spot/);
});

// 0.40: the Cinematic engine - real footage cut with film grammar and graded as one film; it draws nothing.
test('the Cinematic engine plans footage only, with shot grammar and one grade for the video', () => {
  const cinema = spec('cinematic-hybrid');
  assert.deepEqual(E.plannerSources(cinema, ['stock-video', 'stock-image', 'ai-image', 'generated-graphics']).sources, ['stock-video', 'stock-image', 'ai-image'], 'no drawn shots');
  assert.equal(E.plannerSources(cinema, ['stock-video', 'generated-graphics']).primarySource, 'stock-video');
  const guide = E.promptGuide('cinema', {grade: 'choose'});
  for (const line of ['CINEMATIC ENGINE', 'SHOT GRAMMAR', 'CONTINUITY', 'RHYTHM', 'TITLES', 'TASTE']) assert.match(guide, new RegExp(line));
  for (const key of Object.keys(E.GRADES)) assert.match(guide, new RegExp(`${key} \\(`), `the grade ${key} is offered`);
  assert.match(guide, /"grade" field/);
  assert.doesNotMatch(guide, /MOTION GRAPHICS|sketch|STICKMAN|FILM LOOK/, 'no drawing vocabulary in a footage engine');
  assert.match(E.promptGuide('cinema', {grade: 'noir'}), /GRADE: black and white\. /);
  assert.doesNotMatch(E.promptGuide('cinema', {grade: 'noir'}), /"grade" field/, 'a fixed grade is not chosen again');
});

// 0.62 (owner request 2026-10-28): a mix may use only the looks the owner ticks, inside the same engine.
test('Mix of ticked looks: the style keeps them, the planner sees only them, shots stay inside them', () => {
  const {validateStyleSpec} = require('../style'), Sk = require('../sketch');
  const stick = spec('stickman-sketch-explainer'), hand = spec('hand-drawn-canvas'), doc = spec('documentary-montage');
  const ticked = validateStyleSpec({...structuredClone(stick), drawing: {look: 'mix', hand: false, looks: ['doodle', 'classic', 'storybook'], film: 'choose', films: ['sepia', 'noir']}});
  assert.deepEqual(ticked.drawing.looks, ['classic', 'storybook', 'doodle'], 'kept in the engine\'s own order');
  assert.deepEqual(ticked.drawing.films, ['noir', 'sepia']);
  assert.equal(validateStyleSpec({...structuredClone(stick), drawing: {look: 'mix', hand: false, looks: []}}).drawing.looks, undefined, 'nothing ticked: every look, as before');
  assert.throws(() => validateStyleSpec({...structuredClone(stick), drawing: {look: 'classic', hand: false, looks: ['classic', 'doodle']}}), /only when the stickman look is "mix"/);
  assert.throws(() => validateStyleSpec({...structuredClone(stick), drawing: {look: 'mix', hand: false, looks: ['classic']}}), /at least 2/);
  assert.throws(() => validateStyleSpec({...structuredClone(stick), drawing: {look: 'mix', hand: false, looks: ['classic', 'chronicle']}}), /stickman looks to mix/);
  assert.throws(() => validateStyleSpec({...structuredClone(hand), drawing: {look: 'classic', hand: true, board: 'mix', boards: ['marker', 'marker']}}), /once/);
  const docTicked = validateStyleSpec({...structuredClone(doc), drawing: {...doc.drawing, design: 'mix', designs: ['painted', 'cartoon']}});
  assert.deepEqual(docTicked.drawing.designs, ['cartoon', 'painted']);
  // The engine scope carries them; without ticks its shape is unchanged.
  assert.deepEqual(E.engineScope(ticked), {mix: false, drawn: ['stickman'], footage: false, frames: false, films: ['noir', 'sepia'], looks: ['classic', 'storybook', 'doodle']});
  assert.deepEqual(E.engineScope(docTicked).designs, ['cartoon', 'painted']);
  // The planner is told only the ticked looks.
  const guide = E.promptGuide('stickman', {look: 'mix', looks: ticked.drawing.looks, film: 'choose', films: ticked.drawing.films});
  assert.match(guide, /STICKMAN LOOKS \(mix\): this video mixes only the stickman looks the owner ticked/);
  assert.match(guide, /classic \(classic cartoon\).*storybook.*doodle \(doodle\)/);
  assert.doesNotMatch(guide, /whiteboard \(|illustrated \(/, 'unticked looks are not offered');
  assert.match(guide, /only from the film looks the owner ticked\): noir .*sepia /);
  assert.doesNotMatch(guide, /silent \(/);
  const docGuide = E.promptGuide('montage', {design: 'mix', designs: ['cartoon', 'painted'], sources: ['generated-graphics']});
  assert.match(docGuide, /DOCUMENTARY LOOKS \(mix\): this video mixes only the documentary looks the owner ticked/);
  assert.doesNotMatch(docGuide, /vector \(|data \(/);
  assert.match(E.promptGuide('stickman', {look: 'mix'}), /this video uses every stickman look/, 'nothing ticked: every look, as before');
  assert.match(Sk.promptGuide('stickman', {looks: ['classic', 'doodle']}), /names its look: "look": classic\|doodle\./);
  // A shot's own look: Claude's plan is repaired to the first ticked look with a named warning; an owner edit is refused.
  const warnings = [], shot = look => ({engine: 'stickman', set: 'none', mood: 'normal', camera: 'still', look, elements: [{kind: 'text', text: 'Fire changed everything'}]});
  assert.equal(Sk.validate(shot('whiteboard'), {lenient: true, warn: message => warnings.push(message), looks: ticked.drawing.looks}).look, 'classic');
  assert.match(warnings.join(' '), /Stickman look must be one of: classic, storybook, doodle/);
  assert.equal(Sk.validate(shot('doodle'), {looks: ticked.drawing.looks}).look, 'doodle');
  assert.throws(() => Sk.validate(shot('whiteboard'), {looks: ticked.drawing.looks}), /Stickman look must be one of: classic, storybook, doodle/);
  assert.equal(Sk.validate(shot('whiteboard'), {}).look, 'whiteboard', 'without ticks every look stays allowed');
});
