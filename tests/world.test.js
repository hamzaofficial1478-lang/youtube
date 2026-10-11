'use strict';
// P06j: each story gets its own world. The world kit (kit.js) designs what the drawing vocabulary lacks, drawings
// reference it and carry it, plain physics and the story's era are checked, and every engine draws kit items.
const test = require('node:test');
const assert = require('node:assert/strict');
const Kit = require('../kit');
const Sk = require('../sketch');
const {MotionRenderer, findBrowser} = require('../motion');

const stoneAge = () => Kit.validateKit([
  {id: 'cave', kind: 'set', name: 'cave mouth', shapes: [{rect: [0, 0, 160, 72.5], fill: '#F2C894'}, {path: 'M0 72.5 L0 0 L160 0 L160 72.5 L132 72.5 C130 40 118 18 100 14 C82 10 66 16 58 30 C50 44 46 60 44 72.5 Z', fill: '#7A6552'}, {path: 'M0 72.5 L160 72.5 L160 90 L0 90 Z', fill: '#A88B6A'}]},
  {id: 'mammoth', kind: 'prop', name: 'woolly mammoth', shapes: [{path: 'M14 70 C10 40 30 22 56 24 C78 26 90 40 88 62 L86 88 L76 88 L74 70 L36 70 L34 88 L24 88 Z', fill: '#8B5A3C'}, {path: 'M80 34 C94 36 98 56 92 74'}, {circle: [74, 36, 2.5], fill: '#222222'}]},
  {id: 'spear', kind: 'prop', name: 'stone spear', shapes: [{line: [50, 95, 50, 18]}, {path: 'M50 5 L57 20 L50 26 L43 20 Z', fill: '#9A9A9A'}]},
  {id: 'fur', kind: 'outfit', name: 'fur tunic', shapes: [{path: 'M30 0 L70 0 L76 112 L66 104 L58 116 L50 106 L42 116 L34 104 L24 112 Z', fill: '#9C6B3F'}]},
]);

test('a kit item is designed once as simple shapes, checked into points and never run as code', () => {
  const warnings = [];
  const kit = Kit.validateKit([
    {id: 'Steam Train', kind: 'prop', name: 'steam train', shapes: [{rect: [10, 40, 70, 30], fill: '#aa3322'}, {path: 'M80 40 c5 -5 10 -5 15 -10'}, {path: 'M10 10 A5 5 0 0 1 20 10'}]},
    {id: 'script', kind: 'prop', shapes: [{path: '<script>alert(1)</script>'}]},
    {id: 'hat', kind: 'headwear', shapes: [{circle: [1, 1, 1]}]},
    {id: 'far', kind: 'prop', shapes: [{line: [0, 0, 900, 900]}]},
  ], {warn: message => warnings.push(message)});
  assert.deepEqual(Object.keys(kit), ['steamtrain']);
  assert.deepEqual(kit.steamtrain.shapes[0].pts.slice(0, 2), [[-0.4, -0.1], [0.3, -0.1]], 'a prop is centred in its box');
  assert.equal(kit.steamtrain.shapes[0].fill, '#AA3322');
  assert.deepEqual(kit.steamtrain.shapes[1].pts.at(-1), [0.45, -0.2], 'relative curves end where they should');
  assert.match(warnings.join(' '), /arcs are drawn as straight lines[\s\S]*script.*no shapes[\s\S]*hat.*a prop, a set or an outfit[\s\S]*far.*no shapes/);
  assert.equal(JSON.stringify(Kit.summary(kit)), JSON.stringify([{ref: 'kit:steamtrain', kind: 'prop', name: 'steam train'}]), 'planners read names, not shapes');
});

test('drawings use kit items by reference and carry them, so every later check and the render draw the same thing', () => {
  const kit = stoneAge(), warnings = [];
  const cast = Sk.validateCast([{id: 'c1', name: 'Ugg', role: 'hunter', look: {hair: 'messy', facial: 'beard', outfit: 'kit:fur'}}], {lenient: true, kit});
  assert.equal(cast[0].look.outfit, 'kit:fur');
  const drawing = Sk.validate({set: 'kit:cave', elements: [{kind: 'figure', who: 'c1', holds: 'kit:spear'}, {kind: 'prop', prop: 'kit:mammoth'}, {kind: 'prop', prop: 'kit:dinosaur'}]}, {cast, kit, lenient: true, warn: message => warnings.push(message)});
  assert.deepEqual([drawing.set, Object.keys(drawing.kit).sort(), drawing.elements.length], ['kit:cave', ['cave', 'fur', 'mammoth', 'spear'], 2]);
  assert.match(warnings.join(' '), /kit:dinosaur.*left out/);
  // A stored drawing is checked again from the kit it carries (no cast, no video kit at hand).
  const again = Sk.validate(JSON.parse(JSON.stringify(drawing)), {lenient: true});
  assert.deepEqual([again.set, again.elements[0].look.outfit, again.elements[0].holds, again.elements[1].prop], ['kit:cave', 'kit:fur', 'kit:spear', 'kit:mammoth']);
  // The owner's own edit is strict: an unknown kit reference is refused.
  assert.throws(() => Sk.validate({elements: [{kind: 'prop', prop: 'kit:dinosaur'}]}, {kit}), /prop must be one of/);
  assert.deepEqual(Sk.validateSetting({set: 'kit:cave', mood: 'tense'}, {kit}), {set: 'kit:cave', mood: 'tense'});
});

test('plain physics and the story\'s era: people under water only when diving, nothing modern in the stone age', () => {
  const drawn = [
    {label: 'S01A', sketch: {set: 'ocean', elements: [{kind: 'figure'}]}, words: 'Sailors measured the angle of the sun.', notes: ''},
    {label: 'S02A', sketch: {set: 'ocean', elements: [{kind: 'figure'}]}, words: 'The diver swims to the reef.', notes: ''},
    {label: 'S03A', sketch: {set: 'street', elements: [{kind: 'prop', prop: 'phone'}, {kind: 'figure', look: {outfit: 'hoodie'}}]}, words: 'The hunter waits by the fire.'},
    {label: 'S04A', sketch: {set: 'none', elements: [{kind: 'prop', prop: 'phone'}]}, words: 'Today we carry a phone instead.'},
  ];
  const notes = Sk.worldNotes(drawn, {era: 'prehistoric'});
  assert.equal(notes.length, 2);
  assert.match(notes[0], /^S01A: people stand on the sea floor/);
  assert.match(notes[1], /^S03A: phone, hoodie, the street set do not exist in a prehistoric story/);
  assert.deepEqual(Sk.worldNotes(drawn.slice(2), {era: 'modern'}), [], 'a modern story may have phones');
  assert.deepEqual(Sk.worldMend(drawn).map(item => item.label), ['S01A']);
  assert.deepEqual([drawn[0].sketch.set, drawn[1].sketch.set], ['beach', 'ocean'], 'the sailor goes to the sea surface; the diver stays under water');
});

test('every drawing engine draws kit props, sets and costumes in its own finish', {skip: findBrowser() ? false : 'No Edge or Chrome on this machine'}, async t => {
  const renderer = new MotionRenderer();
  t.after(() => renderer.close());
  await renderer.start();
  const kit = stoneAge(), cast = Sk.validateCast([{id: 'c1', name: 'Ugg', look: {outfit: 'kit:fur'}}], {kit});
  const frame = (engine, raw) => renderer.frame({template: 'sketch-scene', data: {...Sk.validate({engine, camera: 'still', ...raw}, {primary: engine, cast, kit}), times: null}, palette: {bg: '#FFFDF8', ink: '#1F1F1F', accent: '#E0753E'}, fonts: {heading: 'Arial', body: 'Arial', hand: 'Segoe Print'}, width: 320, height: 180, fps: 30, duration: 3, t: 2.5});
  for (const engine of ['stickman', 'handdrawn', 'motion']) {
    const empty = await frame(engine, {set: 'none', elements: [{kind: 'figure', x: 0.3}]});
    assert.ok(!(await frame(engine, {set: 'none', elements: [{kind: 'figure', x: 0.3}, {kind: 'prop', prop: 'kit:mammoth', x: 0.7}]})).equals(empty), `${engine}: a kit prop is drawn`);
    assert.ok(!(await frame(engine, {set: 'kit:cave', elements: [{kind: 'figure', x: 0.3}]})).equals(empty), `${engine}: a kit set is drawn`);
    assert.ok(!(await frame(engine, {set: 'none', elements: [{kind: 'figure', who: 'c1', x: 0.3}]})).equals(empty), `${engine}: a kit costume is drawn`);
    assert.ok(!(await frame(engine, {set: 'none', elements: [{kind: 'figure', x: 0.3, holds: 'kit:spear'}]})).equals(empty), `${engine}: a held kit prop is drawn`);
  }
});
