'use strict';
// P06d/0.21: the editing engines are described to Claude with their strengths, risks and how they usually mix.
// 0.37 (owner decision 2026-10-18): a style on one engine uses only that engine; the Story Mix uses every engine.
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../engines');
const {LAUNCH_PROFILES} = require('../style');
const spec = key => LAUNCH_PROFILES.find(item => item.key === key).spec;

test('a style on one engine uses only that engine; the story mix and atelier use every engine', () => {
  assert.deepEqual(LAUNCH_PROFILES.map(item => E.primaryEngine(item.spec)), ['stickman', 'handdrawn', 'stickman', 'atelier', 'montage', 'montage']);
  assert.deepEqual(E.engineScope(spec('stickman-sketch-explainer')), {mix: false, drawn: ['stickman'], footage: false, frames: false});
  assert.deepEqual(E.engineScope(spec('hand-drawn-canvas')), {mix: false, drawn: ['handdrawn'], footage: false, frames: false});
  assert.deepEqual(E.engineScope(spec('documentary-montage')), {mix: false, drawn: ['motion'], footage: true, frames: false}, 'documentary: its footage and its drawn looks');
  assert.deepEqual(E.engineScope(spec('story-mix')), {mix: true, drawn: ['stickman', 'handdrawn', 'motion'], footage: true, frames: true});
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
