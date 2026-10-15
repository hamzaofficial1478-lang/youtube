'use strict';
// P06d: the drawing engine in the local browser. Every word of the vocabulary draws, frames are pure functions
// of time (identical when drawn again), and a shot never sits still.
const test = require('node:test');
const assert = require('node:assert/strict');
const {MotionRenderer, findBrowser} = require('../motion');
const Sk = require('../sketch');

const browser = findBrowser();
const base = {template: 'sketch-scene', palette: {bg: '#FFFFFF', ink: '#1F1F1F', accent: '#E0753E'}, fonts: {heading: 'Arial', body: 'Arial', hand: 'Segoe Print'}, width: 320, height: 180, fps: 30, duration: 3};
const frame = (renderer, sketch, t, extra = {}) => renderer.frame({...base, ...extra, data: {...Sk.validate(sketch, {primary: extra.primary || 'stickman'}), times: extra.times || null}, t});

test('the drawing engine draws every prop, set, pose, expression, look and effect, identically every time', {skip: browser ? false : 'No Edge or Chrome on this machine'}, async () => {
  const renderer = new MotionRenderer({browser});
  try {
    await renderer.start();
    const still = {set: 'park', camera: 'still', elements: [{kind: 'figure', pose: 'stand', x: 0.3}, {kind: 'prop', prop: 'sun', x: 0.75, y: 0.3}]};
    const first = await frame(renderer, still, 1.0);
    // The engine covers the whole vocabulary that Claude is offered, and nothing more.
    const catalog = await renderer.evaluate('DRAWN.catalog()');
    assert.deepEqual(catalog.props, [...Sk.PROPS].sort());
    assert.deepEqual(catalog.sets, [...Sk.SETS].sort());
    assert.deepEqual(catalog.poses, [...Sk.POSES].sort());
    assert.deepEqual(catalog.expressions, [...Sk.EXPRESSIONS].sort());
    assert.ok(first.equals(await frame(renderer, still, 1.0)), 'a frame is a pure function of time');
    assert.ok(!first.equals(await frame(renderer, still, 1.5)), 'nothing sits still: the sun turns and the figure breathes');
    assert.ok(!first.equals(await frame(renderer, {...still, engine: 'motion'}, 1.0)), 'each engine has its own finish');
    // A character in the shot from its start is on the first frame, so the room never shows empty before them.
    const room = {set: 'home', camera: 'still', transition: 'cut', elements: [{kind: 'prop', prop: 'tree', x: 0.85}]};
    assert.ok(!(await frame(renderer, {...room, elements: [...room.elements, {kind: 'figure', pose: 'stand', x: 0.4}]}, 0.02)).equals(await frame(renderer, room, 0.02)), 'the character arrives with the shot');
    // An effect placed on the same spot as words (a burst behind a number) stays with them when the layout moves them.
    const spot = {set: 'abstract', camera: 'still', elements: [{kind: 'prop', prop: 'calendar', x: 0.3, y: 0.5, size: 'xl'}, {kind: 'fx', effect: 'burst', x: 0.66, y: 0.3, size: 'l'}, {kind: 'text', style: 'counter', text: '4,000,000', x: 0.66, y: 0.3, size: 'xl'}]};
    const tied = {...spot, elements: spot.elements.map((item, k) => (k === 1 ? {...item, on: 3} : item))};
    assert.ok((await frame(renderer, spot, 2.5)).equals(await frame(renderer, tied, 2.5)), 'the burst follows the number');
    // A face is never covered: a prop placed on a character's head moves off it.
    await frame(renderer, {set: 'street', camera: 'still', elements: [{kind: 'figure', pose: 'stand', x: 0.5, y: 0.8, size: 'xl'}, {kind: 'prop', prop: 'target', x: 0.5, y: 0.3}]}, 1.0);
    const {est} = await renderer.evaluate('DRAWN.layout()'), [hx, hy, hr] = est[0].head, box = est[1].box;
    assert.ok(box[2] < hx - hr || box[0] > hx + hr || box[3] < hy - hr || box[1] > hy + hr, 'the prop clears the face');
    // Everything draws without an error, mid-entrance and settled.
    for (let k = 0; k < Sk.PROPS.length; k += 12) await frame(renderer, {elements: Sk.PROPS.slice(k, k + 12).map((prop, i) => ({kind: 'prop', prop, x: 0.1 + (i % 6) * 0.16, y: i < 6 ? 0.3 : 0.7, size: 's', label: prop}))}, 0.2);
    for (const set of Sk.SETS) await frame(renderer, {set, mood: Sk.MOODS[Sk.SETS.indexOf(set) % Sk.MOODS.length], elements: [{kind: 'figure', pose: 'talk', x: 0.4}]}, 1.2);
    for (let k = 0; k < Sk.POSES.length; k += 10) await frame(renderer, {elements: Sk.POSES.slice(k, k + 10).map((pose, i) => ({kind: 'figure', pose, x: 0.1 + (i % 5) * 0.2, y: i < 5 ? 0.42 : 0.82, size: 's', holds: i === 3 ? 'coin' : undefined, then: [{at: 'x', x: 0.5}]}))}, 1.4);
    for (let k = 0; k < Sk.EXPRESSIONS.length; k += 6) await frame(renderer, {elements: Sk.EXPRESSIONS.slice(k, k + 6).map((expression, i) => ({kind: 'figure', expression, emote: Sk.EMOTES[(k + i) % Sk.EMOTES.length], x: 0.1 + i * 0.16, size: 's'}))}, 1.1);
    const looks = Object.entries(Sk.LOOK).flatMap(([key, values]) => values.map(value => ({[key]: value})));
    for (let k = 0; k < looks.length; k += 12) await frame(renderer, {elements: looks.slice(k, k + 12).map((look, i) => ({kind: 'figure', look, x: 0.08 + (i % 6) * 0.17, y: i < 6 ? 0.42 : 0.82, size: 's', facing: i % 2 ? 'left' : 'right'}))}, 1, {primary: 'stickman'});
    for (let k = 0; k < Sk.FX.length; k += 6) await frame(renderer, {elements: [{kind: 'prop', prop: 'brain', x: 0.5, y: 0.45}, ...Sk.FX.slice(k, k + 6).map(effect => ({kind: 'fx', effect, on: 1, value: 70}))]}, 0.4);
    for (const style of Sk.TEXT_STYLES) await frame(renderer, {transition: Sk.TRANSITIONS[Sk.TEXT_STYLES.indexOf(style) % Sk.TRANSITIONS.length], camera: Sk.CAMERAS[Sk.TEXT_STYLES.indexOf(style) % Sk.CAMERAS.length], focus: [{x: 0.6, y: 0.4, zoom: 1.6}], elements: [{kind: 'figure', pose: 'point', x: 0.25}, {kind: 'text', text: '1,250 people', style}, {kind: 'arrow', from: 1, to: [0.8, 0.5], label: 'here'}, {kind: 'bubble', text: 'Wait, what?', on: 1, x: 0.4, y: 0.25}]}, 0.15);
    for (const engine of ['handdrawn', 'motion']) await frame(renderer, {engine, set: 'lab', elements: [{kind: 'figure', pose: 'think', look: {outfit: 'lab-coat'}}, {kind: 'prop', prop: 'flask'}]}, 0.5, {primary: engine, palette: engine === 'motion' ? {bg: '#101418', ink: '#F2F4F5', accent: '#37C2A0'} : base.palette});
  } finally {
    await renderer.close();
  }
});

test('stickman: the drawing hand is an option - it draws one thing at a time, writes words left to right and leaves when done', {skip: browser ? false : 'No Edge or Chrome on this machine'}, async () => {
  const renderer = new MotionRenderer({browser});
  try {
    await renderer.start();
    const shot = engine => ({engine, set: 'none', camera: 'still', transition: 'cut', elements: [{kind: 'prop', prop: 'house', x: 0.3, y: 0.55}, {kind: 'text', style: 'title', text: 'Home sweet home', x: 0.65, y: 0.3}]});
    const at = async (engine, t, drawing = {look: 'classic', hand: true}) => { await frame(renderer, shot(engine), t, {primary: engine, drawing}); return renderer.evaluate('DRAWN.layout()'); };
    const drawing = await at('stickman', 0.3);
    assert.ok(drawing.tip && drawing.tip[0] < 160 && drawing.hand.lift === 0, 'the pen is on the house while it is drawn');
    // One pen: the title waits for the house, then is written left to right along its line.
    const [early, late] = [(await at('stickman', 1.1)).tip, (await at('stickman', 1.5)).tip];
    assert.ok(early[0] < late[0] && Math.abs(early[1] - late[1]) < 12 && Math.abs(early[1] - 0.3 * 180) < 14, 'the title is written left to right along its line');
    const leaving = (await at('stickman', 2.1)).hand;
    assert.ok(leaving && leaving.lift > 0 && leaving.at[0] > late[0], 'the hand lifts and leaves the frame when the drawing is done');
    assert.equal((await at('stickman', 2.9)).hand, null, 'no hand once it has left');
    assert.equal((await at('stickman', 0.6, null)).hand, null, 'without the option the stickman engine draws as before');
    assert.equal((await at('handdrawn', 0.6)).hand, null, 'the hand belongs to the stickman engine');
  } finally {
    await renderer.close();
  }
});

test('stickman looks: whiteboard, storybook and doodle each draw differently; a chapter card covers the frame', {skip: browser ? false : 'No Edge or Chrome on this machine'}, async () => {
  const renderer = new MotionRenderer({browser});
  try {
    await renderer.start();
    const scene = {set: 'street', camera: 'still', transition: 'cut', elements: [{kind: 'figure', pose: 'point', x: 0.35, look: {color: 'red'}}, {kind: 'prop', prop: 'coin', x: 0.75, y: 0.4}]};
    const looks = {};
    for (const look of ['classic', 'whiteboard', 'storybook', 'doodle']) looks[look] = await frame(renderer, scene, 2.8, {drawing: {look, hand: false}});
    const all = Object.values(looks);
    assert.ok(all.every((png, k) => all.every((other, j) => j === k || !png.equals(other))), 'every look has its own finish');
    assert.ok(looks.classic.equals(await frame(renderer, scene, 2.8)), 'no setting is the classic look');
    // Storybook figures have bean bodies under bigger heads.
    await frame(renderer, scene, 2.8, {drawing: {look: 'storybook', hand: false}});
    const bean = (await renderer.evaluate('DRAWN.layout()')).est[0];
    await frame(renderer, scene, 2.8);
    assert.ok(bean.head[2] >= (await renderer.evaluate('DRAWN.layout()')).est[0].head[2]);
    const card = {set: 'street', camera: 'still', elements: [{kind: 'text', style: 'chapter', text: 'Level 1: The Runner'}]};
    assert.ok(!(await frame(renderer, card, 1, {drawing: {look: 'storybook', hand: false}})).equals(await frame(renderer, {...card, elements: [{...card.elements[0], style: 'title'}]}, 1, {drawing: {look: 'storybook', hand: false}})));
  } finally {
    await renderer.close();
  }
});

test('hand-drawn: an illustrated explainer - annotations, faces on things, dashed connectors and cartoon people', {skip: browser ? false : 'No Edge or Chrome on this machine'}, async () => {
  const renderer = new MotionRenderer({browser});
  try {
    await renderer.start();
    const shot = elements => ({engine: 'handdrawn', set: 'none', camera: 'still', transition: 'cut', elements});
    const truck = {kind: 'prop', prop: 'truck', x: 0.35, y: 0.55, size: 'l'};
    const at = sketch => frame(renderer, sketch, 2.6, {primary: 'handdrawn'});
    const plain = await at(shot([truck]));
    assert.ok(!plain.equals(await at(shot([{...truck, face: true}]))), 'a cute face on the truck');
    assert.ok(!plain.equals(await at(shot([{...truck, label: '8,000 miles'}]))), 'a handwritten label with its arrow');
    const notes = [];
    for (const style of ['title', 'sticky', 'tag', 'callout']) notes.push(await at(shot([truck, {kind: 'text', style, text: '$3,000 - $6,000', x: 0.75, y: 0.4}])));
    assert.ok(notes.every((png, k) => notes.every((other, j) => j === k || !png.equals(other))), 'sticky note, price tag and callout each have their own shape');
    const link = dashed => shot([truck, {...truck, x: 0.8}, {kind: 'arrow', from: 1, to: 2, ...(dashed ? {dashed: true} : {})}]);
    assert.ok(!(await at(link(false))).equals(await at(link(true))), 'a dashed connector');
    const person = {kind: 'figure', pose: 'present', x: 0.4, look: {outfit: 'suit', color: 'blue'}};
    assert.ok(!(await at(shot([person]))).equals(await frame(renderer, {...shot([person]), engine: 'stickman'}, 2.6)), 'people are drawn as cartoon people, not stick figures');
    const checked = Sk.validate(shot([{...truck, face: true}, {kind: 'arrow', from: 1, to: [0.9, 0.5], dashed: true}]), {primary: 'handdrawn'});
    assert.deepEqual([checked.elements[0].face, checked.elements[1].dashed], [true, true]);
  } finally {
    await renderer.close();
  }
});
