'use strict';
// P06d/0.21: the editing engines are described to Claude with their strengths, risks and how they usually mix;
// Claude decides per video and per shot. Nothing is forbidden in code; the style's own sources are the limit.
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../engines');
const {LAUNCH_PROFILES} = require('../style');
const spec = key => LAUNCH_PROFILES.find(item => item.key === key).spec;

test('every drawing engine may draw a shot in any video; the style sets the main look', () => {
  assert.deepEqual(LAUNCH_PROFILES.map(item => E.primaryEngine(item.spec)), ['stickman', 'handdrawn', 'motion', 'stickman', 'atelier', 'montage', 'montage']);
  assert.deepEqual(E.drawEngines('stickman'), ['stickman', 'handdrawn', 'motion'], 'the main look leads');
  assert.deepEqual(E.drawEngines('handdrawn'), ['handdrawn', 'stickman', 'motion']);
  assert.deepEqual(E.drawEngines('montage'), ['stickman', 'handdrawn', 'motion']);
  for (const text of [...E.COMBINATIONS, ...Object.values(E.ENGINES).flatMap(item => [item.strengths, item.risks])]) assert.doesNotMatch(text, /\bnever\b|owner rule/i, 'advice, not a rule');
});

test('the planner offers exactly the style\'s sources and asks Claude to reason about mixing', () => {
  const owned = {...spec('stickman-sketch-explainer'), visuals: {...spec('stickman-sketch-explainer').visuals, sources: ['ai-image', 'generated-graphics'], primarySource: 'ai-image'}};
  assert.deepEqual(E.plannerSources(owned, ['ai-image', 'generated-graphics']), {engine: 'stickman', sources: ['ai-image', 'generated-graphics'], primarySource: 'generated-graphics'});
  assert.deepEqual(E.plannerSources(spec('documentary-montage'), ['stock-video', 'generated-graphics']).primarySource, 'stock-video');
  const guide = E.promptGuide('stickman');
  assert.match(guide, /main look is Stickman animation \(stickman\)\. You decide, shot by shot/);
  assert.match(guide, /- handdrawn: best for [\s\S]*watch out:/);
  assert.match(guide, /What usually happens when engines mix \(weigh it, do not follow it blindly\)/);
  assert.match(guide, /say why in its notes/);
  assert.doesNotMatch(guide, /Never use/);
});

test('a stickman look briefs the planner in its own way, only where stick figures lead or mix', () => {
  assert.match(E.promptGuide('stickman', {look: 'storybook'}), /STICKMAN LOOK: storybook\. .*chapter/);
  assert.match(E.promptGuide('handdrawn', {mix: true, look: 'doodle'}), /STICKMAN LOOK: doodle\. .*visual gag/);
  assert.doesNotMatch(E.promptGuide('stickman', {look: 'classic'}), /STICKMAN LOOK/);
  assert.doesNotMatch(E.promptGuide('motion', {look: 'whiteboard'}), /STICKMAN LOOK/, 'a motion-graphics video is not told how its stick-figure guests look');
  assert.deepEqual(Object.keys(E.LOOKS), ['classic', 'whiteboard', 'storybook', 'doodle']);
});

test('a style learned from an approved study briefs the planner in its own words', () => {
  assert.match(E.promptGuide('handdrawn', {brief: 'Hold each drawing while its notes arrive.'}), /LEARNED LOOK \(from an approved style study; use the techniques, never copy a channel\): Hold each drawing/);
  assert.doesNotMatch(E.promptGuide('handdrawn'), /LEARNED LOOK/);
});
