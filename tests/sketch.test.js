'use strict';
// P06c drawn scenes: the closed vocabulary, the free fallback from the narration, and the guide Claude reads.
const test = require('node:test');
const assert = require('node:assert/strict');
const Sk = require('../sketch');

test('a drawn scene uses the closed vocabulary; positions stay inside the frame and above the captions', () => {
  const scene = Sk.validate({elements: [{kind: 'figure', pose: 'shock', x: 1.4, y: 0.99}, {kind: 'prop', prop: 'bolt', accent: true, label: 'Lightning {bold}'}, {kind: 'text', text: '  5x  hotter <b> ', style: 'title'}, {kind: 'arrow', from: [0.1, 0.5], to: [0.4, 0.5]}, {kind: 'bubble', text: 'Why later?', thought: true}]});
  assert.deepEqual([scene.background, scene.camera], ['paper', 'push'], 'defaults');
  assert.deepEqual([scene.elements[0].x, scene.elements[0].y, scene.elements[0].size, scene.elements[0].facing], [0.92, 0.8, 'm', 'right'], 'clamped into the frame, feet above the caption band');
  assert.equal(scene.elements[1].label, 'Lightning bold', 'braces never reach the drawing');
  assert.equal(scene.elements[2].text, '5x hotter b', 'markup and spacing are cleaned');
  assert.equal(scene.elements[4].thought, true);
  for (const [raw, pattern] of [
    [{elements: []}, /1-8 elements/], [{elements: Array(9).fill({kind: 'prop', prop: 'sun'})}, /1-8 elements/], [{elements: [{kind: 'prop', prop: 'dragon'}]}, /prop must be one of/],
    [{elements: [{kind: 'figure', pose: 'dance'}]}, /pose must be one of/], [{elements: [{kind: 'video'}]}, /kind must be/], [{elements: [{kind: 'text', text: ''}]}, /needs text/],
    [{elements: [{kind: 'arrow', from: [0.1]}]}, /needs from and to/], [{background: 'neon', elements: [{kind: 'prop', prop: 'sun'}]}, /Background must be/], [[], /must be an object/],
  ]) assert.throws(() => Sk.validate(raw), pattern);
});

test('the free fallback draws what the narration says: a reacting figure, the props it mentions, its number', () => {
  const hot = Sk.fromText('A single bolt of lightning is five times hotter than the surface of the sun.');
  assert.deepEqual(hot.elements.map(item => item.kind === 'figure' ? `figure:${item.pose}` : item.kind === 'prop' ? item.prop : `text:${item.text}`), ['figure:shock', 'bolt', 'sun']);
  const count = Sk.fromText('Right now, lightning is striking about 45 times every second.', {shotIndex: 1});
  assert.equal(count.elements[0].facing, 'left', 'every other shot mirrors the layout');
  assert.deepEqual(count.elements.at(-1), {kind: 'text', text: '45', x: 0.5, y: 0.16, size: 'l', style: 'number', accent: true});
  assert.equal(Sk.fromText('A quiet morning.', {onScreenText: 'The calm before'}).elements.at(-1).text, 'The calm before', 'the plan\'s on-screen text wins');
  assert.equal(Sk.fromText('Nothing to see.', {purpose: 'hook'}).elements[1].prop, 'exclamation', 'a hook without a prop gets an exclamation');
  assert.deepEqual(Sk.fromText('A single bolt of lightning.'), Sk.fromText('A single bolt of lightning.'), 'deterministic');
});

test('Claude reads the whole vocabulary and the layout rules', () => {
  const guide = Sk.promptGuide();
  for (const word of [...Sk.POSES, ...Sk.PROPS]) assert.ok(guide.includes(word), word);
  assert.match(guide, /bottom fifth of the frame clear for captions/);
  assert.match(guide, /Never write text the narration does not support/);
  assert.match(Sk.VERSION, /^drawn-scene\/\d+$/);
});
