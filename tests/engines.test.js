'use strict';
// P06d: the editing engines work together in fixed roles, and pairs that clash are refused with a reason.
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../engines');
const {LAUNCH_PROFILES} = require('../style');
const spec = key => LAUNCH_PROFILES.find(item => item.key === key).spec;

test('each style has a primary engine and partners; clashing pairs are never offered', () => {
  assert.deepEqual(LAUNCH_PROFILES.map(item => E.primaryEngine(item.spec)), ['stickman', 'handdrawn', 'motion', 'montage', 'montage']);
  assert.deepEqual(E.drawEngines('stickman'), ['stickman', 'motion'], 'motion graphics work inside stick-figure videos');
  assert.deepEqual(E.drawEngines('handdrawn'), ['handdrawn', 'motion'], 'and inside hand-drawn videos');
  assert.deepEqual(E.drawEngines('montage'), ['motion', 'handdrawn'], 'a documentary draws motion and hand-drawn cutaways');
  assert.deepEqual(E.drawEngines('motion'), ['motion', 'stickman']);
  assert.match(E.PAIRS.handdrawn.stickman.no, /owner rule/, 'the owner\'s rule: stick figures never join a hand-drawn video');
  assert.ok(E.PAIRS.stickman.handdrawn.no && E.PAIRS.montage.stickman.no && E.PAIRS.stickman.montage.no);
  for (const [primary, pairs] of Object.entries(E.PAIRS)) for (const [partner, pair] of Object.entries(pairs)) assert.ok(!!pair.role !== !!pair.no, `${primary}+${partner} is either a role or a refusal`);
  assert.equal(E.shotEngine('stickman', 'handdrawn'), 'stickman', 'a refused engine falls back to the primary');
  assert.equal(E.shotEngine('montage', 'handdrawn'), 'handdrawn');
});

test('the planner offers only the sources the primary engine pairs with, and says why it left one out', () => {
  const owned = {...spec('stickman-sketch-explainer'), visuals: {...spec('stickman-sketch-explainer').visuals, sources: ['ai-image', 'generated-graphics'], primarySource: 'ai-image'}};
  const stick = E.plannerSources(owned, ['ai-image', 'generated-graphics']);
  assert.deepEqual([stick.engine, stick.sources, stick.primarySource], ['stickman', ['generated-graphics'], 'generated-graphics'], 'an older Stickman revision still plans drawings first');
  assert.deepEqual(stick.dropped.map(item => item.source), ['ai-image']);
  assert.match(stick.dropped[0].reason, /break the look/);
  const doc = E.plannerSources(spec('documentary-montage'), ['stock-video', 'stock-image', 'ai-image', 'generated-graphics']);
  assert.deepEqual([doc.sources, doc.primarySource, doc.dropped], [['stock-video', 'stock-image', 'ai-image', 'generated-graphics'], 'stock-video', []]);
  const guide = E.promptGuide('stickman');
  assert.match(guide, /Partner motion: The motion layer inside every stick scene/);
  assert.match(guide, /Never use handdrawn here/);
  assert.match(guide, /Never use montage here/);
});
