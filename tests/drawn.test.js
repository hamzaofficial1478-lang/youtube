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
    assert.equal((await at('motion', 0.6)).hand, null, 'the hand belongs to the stickman and hand-drawn engines, not motion graphics');
  } finally {
    await renderer.close();
  }
});

test('stickman looks: whiteboard, storybook, doodle and illustrated each draw differently; a chapter card covers the frame', {skip: browser ? false : 'No Edge or Chrome on this machine'}, async () => {
  const renderer = new MotionRenderer({browser});
  try {
    await renderer.start();
    const scene = {set: 'street', camera: 'still', transition: 'cut', elements: [{kind: 'figure', pose: 'point', x: 0.35, look: {color: 'red'}}, {kind: 'prop', prop: 'coin', x: 0.75, y: 0.4}]};
    const looks = {};
    for (const look of ['classic', 'whiteboard', 'storybook', 'doodle', 'illustrated', 'chronicle']) looks[look] = await frame(renderer, scene, 2.8, {drawing: {look, hand: false}});
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

test('hand-drawn: whiteboard animation - annotations, faces on things, dashed connectors and drawn people', {skip: browser ? false : 'No Edge or Chrome on this machine'}, async () => {
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
    // More hand-drawn tools (research 2026-10-16): a keyword in a corner, a comparison divider, a head to think inside.
    const base = await at(shot([truck]));
    for (const extra of [{kind: 'text', style: 'keyword', text: 'Dream', x: 0.1}, {kind: 'text', style: 'versus', text: 'vs'}, {kind: 'prop', prop: 'head', x: 0.7, size: 'xl'}]) assert.ok(!base.equals(await at(shot([truck, extra]))), `${extra.style || extra.prop} draws`);
    const checked = Sk.validate(shot([{...truck, face: true}, {kind: 'arrow', from: 1, to: [0.9, 0.5], dashed: true}]), {primary: 'handdrawn'});
    assert.deepEqual([checked.elements[0].face, checked.elements[1].dashed], [true, true]);
    // The whiteboard looks (owner references 2026-10-16) each draw their own way, and the hand draws when asked.
    const board = shot([person, truck]), boards = {};
    for (const look of ['cartoon', 'marker', 'pencil', 'framed', 'dry-erase']) boards[look] = await frame(renderer, board, 2.6, {primary: 'handdrawn', drawing: {look: 'classic', hand: false, board: look}});
    const list = Object.values(boards);
    assert.ok(list.every((png, k) => list.every((other, j) => j === k || !png.equals(other))), 'every whiteboard look has its own finish');
    assert.ok(boards.cartoon.equals(await at(board)), 'no setting is the colour cartoon look');
    await frame(renderer, board, 0.5, {primary: 'handdrawn', drawing: {look: 'classic', hand: true}});
    assert.ok((await renderer.evaluate('DRAWN.layout()')).hand, 'the hand draws in the hand-drawn engine too');
  } finally {
    await renderer.close();
  }
});

test('every camera move, shot opening, effect and mood changes the picture (vocabulary of 0.32)', {skip: browser ? false : 'No Edge or Chrome on this machine'}, async () => {
  const renderer = new MotionRenderer({browser});
  try {
    await renderer.start();
    const shot = {set: 'office', camera: 'still', transition: 'cut', elements: [{kind: 'figure', pose: 'talk', x: 0.35}, {kind: 'prop', prop: 'laptop', x: 0.7, y: 0.6}]};
    const still = await frame(renderer, shot, 2.2), opening = await frame(renderer, shot, 0.1);
    for (const camera of Sk.CAMERAS.filter(name => name !== 'still')) assert.ok(!still.equals(await frame(renderer, {...shot, camera}, 2.2)), `camera ${camera}`);
    for (const transition of Sk.TRANSITIONS.filter(name => name !== 'cut')) assert.ok(!opening.equals(await frame(renderer, {...shot, transition}, 0.1)), `opening ${transition}`);
    // A glitch flickers early in its life; every other effect shows half a second in.
    for (const effect of Sk.FX.filter(name => name !== 'progress')) { const t = effect === 'glitch' ? 0.2 : 0.5; assert.ok(!(await frame(renderer, shot, t)).equals(await frame(renderer, {...shot, elements: [...shot.elements, {kind: 'fx', effect, on: 2}]}, t)), `effect ${effect}`); }
    for (const mood of Sk.MOODS.filter(name => name !== 'normal')) assert.ok(!still.equals(await frame(renderer, {...shot, mood}, 2.2)), `mood ${mood}`);
    const faces = new Set();
    for (const expression of Sk.EXPRESSIONS) faces.add((await frame(renderer, {set: 'none', camera: 'still', elements: [{kind: 'figure', expression, emote: 'none', x: 0.5, size: 'xl'}]}, 1.5)).toString('base64'));
    assert.ok(faces.size >= Sk.EXPRESSIONS.length - 2, `${faces.size} different faces for ${Sk.EXPRESSIONS.length} expressions`);
  } finally {
    await renderer.close();
  }
});

test('a cut to the same place keeps the place on screen under the drawing hand; a new place is drawn in', {skip: browser ? false : 'No Edge or Chrome on this machine'}, async () => {
  const shot = set => ({engine: 'handdrawn', set, camera: 'still', transition: 'cut', elements: [{kind: 'figure', pose: 'talk', x: 0.4}]});
  const shots = [{label: 'A', sceneId: 's1', sketch: shot('street')}, {label: 'B', sceneId: 's2', sketch: shot('street')}, {label: 'C', sceneId: 's2', sketch: shot('office')}];
  Sk.carry(shots);
  assert.deepEqual(shots.map(item => item.sketch.holdSet === true), [false, true, false]);
  assert.equal(Sk.validate(shots[1].sketch, {primary: 'handdrawn'}).holdSet, true);
  const renderer = new MotionRenderer({browser});
  try {
    await renderer.start();
    const hand = {primary: 'handdrawn', drawing: {look: 'classic', hand: true}};
    const fresh = await frame(renderer, shot('street'), 0.05, hand), held = await frame(renderer, shots[1].sketch, 0.05, hand);
    assert.ok(!fresh.equals(held), 'the held street is already there on the first frames');
    assert.ok((await frame(renderer, shot('street'), 1.5, hand)).equals(await frame(renderer, shots[1].sketch, 1.5, hand)), 'once drawn, both look the same');
  } finally {
    await renderer.close();
  }
});

test('a picture is traced by the hand line by line, then coloured in, in each whiteboard look', {skip: browser ? false : 'No Edge or Chrome on this machine'}, async () => {
  const O = '#1E1E1E', art = {viewBox: [600, 400], paths: [
    {d: 'M60 330 Q300 300 540 330 L540 360 Q300 390 60 360 Z', fill: '#C9A77C', stroke: O, width: 4}, {d: 'M190 140 L410 140 L390 320 Q300 340 210 320 Z', fill: '#FFFFFF', stroke: O, width: 4},
    {d: 'M200 170 L400 170 L392 230 L208 230 Z', fill: '#E5484D', stroke: O, width: 3}, {d: 'M410 170 C480 170 480 270 400 270', fill: 'none', stroke: O, width: 10},
    {d: 'M250 110 C230 80 270 60 250 30', fill: 'none', stroke: '#8A96A3', width: 5}, {d: 'M215 240 L240 240 L232 310 Q222 312 214 306 Z', fill: '#E6E6E6'}]};
  const shot = board => ({engine: 'handdrawn', ...(board ? {board} : {}), set: 'none', camera: 'still', transition: 'cut', elements: [{kind: 'picture', describe: 'A cup of coffee on a table', x: 0.5, y: 0.48, art}]});
  const renderer = new MotionRenderer({browser});
  try {
    await renderer.start();
    const hand = {primary: 'handdrawn', drawing: {look: 'classic', hand: true}};
    await frame(renderer, shot(), 1.0, hand);
    // The pen is reported in frame pixels (320 wide), the layout in the 1920-wide drawing space.
    const mid = await renderer.evaluate('DRAWN.layout()'), box = mid.est[0].box.map(value => value * 320 / 1920);
    assert.ok(mid.tip && mid.tip[0] >= box[0] - 2 && mid.tip[0] <= box[2] + 2 && mid.tip[1] >= box[1] - 2 && mid.tip[1] <= box[3] + 2, 'the pen is on the picture while it is traced');
    // The hand traces for at most 45% of the shot (3 s here), each shape's colour right behind it.
    const early = await frame(renderer, shot(), 0.4, hand), lines = await frame(renderer, shot(), 0.9, hand), done = await frame(renderer, shot(), 2.6, hand);
    assert.ok(!early.equals(lines) && !lines.equals(done), 'more lines, then colour');
    assert.ok(done.equals(await frame(renderer, shot(), 2.9, hand)), 'finished well before the shot ends');
    const looks = {};
    for (const board of ['cartoon', 'marker', 'pencil', 'dry-erase']) looks[board] = await frame(renderer, shot(board), 4.0, hand);
    const all = Object.values(looks);
    assert.ok(all.every((png, k) => all.every((other, j) => j === k || !png.equals(other))), 'each whiteboard look shows the picture its own way');
    assert.ok(looks.pencil.equals(await frame(renderer, shot(), 4.0, {primary: 'handdrawn', drawing: {look: 'classic', hand: true, board: 'pencil'}})), 'a shot\'s own look is the same as the style\'s look');
  } finally {
    await renderer.close();
  }
});

test('Mix: a shot draws in its own look; a style set to mix draws the classic look and the colour cartoon board by default; a motion picture builds in', {skip: browser ? false : 'No Edge or Chrome on this machine'}, async () => {
  const renderer = new MotionRenderer({browser});
  try {
    await renderer.start();
    const shot = extra => ({engine: 'stickman', set: 'street', camera: 'still', transition: 'cut', elements: [{kind: 'figure', pose: 'point', x: 0.35}, {kind: 'prop', prop: 'coin', x: 0.75, y: 0.4}], ...extra});
    const mix = {drawing: {look: 'mix', hand: false}};
    assert.ok((await frame(renderer, shot({look: 'storybook'}), 2.8, mix)).equals(await frame(renderer, shot(), 2.8, {drawing: {look: 'storybook', hand: false}})), 'the shot\'s own look');
    assert.ok((await frame(renderer, shot(), 2.8, mix)).equals(await frame(renderer, shot(), 2.8, {drawing: {look: 'classic', hand: false}})), 'no look of its own: classic');
    const hand = {engine: 'handdrawn', set: 'none', camera: 'still', transition: 'cut', elements: [{kind: 'prop', prop: 'truck', x: 0.4, size: 'l'}]};
    assert.ok((await frame(renderer, hand, 2.6, {primary: 'handdrawn', drawing: {look: 'classic', hand: false, board: 'mix'}})).equals(await frame(renderer, hand, 2.6, {primary: 'handdrawn', drawing: {look: 'classic', hand: false, board: 'cartoon'}})));
    const art = {viewBox: [600, 400], paths: Array.from({length: 8}, (_, k) => ({d: `M${40 + k * 60} 300 L${80 + k * 60} 120 L${120 + k * 60} 300 Z`, fill: ['#3E7BFA', '#E0753E'][k % 2]}))};
    const flat = {engine: 'motion', set: 'none', camera: 'still', transition: 'cut', elements: [{kind: 'picture', describe: 'Eight flat shapes in a row', x: 0.5, y: 0.5, art}]};
    const frames = [];
    for (const t of [0.2, 0.7, 2.9]) frames.push(await frame(renderer, flat, t, {primary: 'motion'}));
    assert.ok(!frames[0].equals(frames[1]) && !frames[1].equals(frames[2]), 'shapes build in one after another');
    assert.equal((await renderer.evaluate('DRAWN.layout()')).tip, null, 'no pen in motion design');
  } finally {
    await renderer.close();
  }
});

test('motion engine v2: every design draws its own way; charts, timelines and networks build on their words; people are flat design', {skip: browser ? false : 'No Edge or Chrome on this machine'}, async () => {
  const renderer = new MotionRenderer({browser});
  try {
    await renderer.start();
    const motion = {primary: 'motion', palette: {bg: '#16193A', ink: '#F4F1EA', accent: '#F2A541'}};
    const shot = (design, elements) => ({engine: 'motion', design, set: 'none', camera: 'still', transition: 'cut', elements});
    const scene = [{kind: 'text', style: 'title', text: 'Coffee'}, {kind: 'prop', prop: 'cup', x: 0.5, y: 0.55, size: 'l'}];
    const designs = [];
    for (const design of ['vector', 'infographic', 'kinetic', 'collage', 'data']) designs.push(await frame(renderer, shot(design, scene), 2, motion));
    assert.ok(designs.every((png, k) => designs.every((other, j) => j === k || !png.equals(other))), 'each design has its own backdrop and finish');
    assert.ok(designs[0].equals(await frame(renderer, shot(undefined, scene), 2, {...motion, drawing: {look: 'classic', hand: false, design: 'vector'}})), 'the style\'s design when the shot names none');
    for (const element of [
      {kind: 'chart', type: 'bar', values: [1, 3, 5], labels: ['a', 'b', 'c'], title: 'Bars'},
      {kind: 'chart', type: 'line', values: [1, 4, 2, 6]}, {kind: 'chart', type: 'area', values: [2, 3, 5]},
      {kind: 'chart', type: 'pie', values: [10, 30, 60], labels: ['x', 'y', 'z']}, {kind: 'chart', type: 'donut', values: [62]}, {kind: 'chart', type: 'rating', values: [4]},
      {kind: 'timeline', events: [{label: 'Start', when: '1990'}, {label: 'Now', when: '2025'}], now: 1},
      {kind: 'network', nodes: [{label: 'A', icon: 'coin'}, {label: 'B'}, {label: 'C'}], links: [[1, 2], [2, 3]]},
      {kind: 'text', style: 'statement', text: 'Only *ten cents* reach the farmer'}, {kind: 'text', style: 'poster', text: 'BILLIONS'},
    ]) {
      const early = await frame(renderer, shot('data', [element]), 0.35, motion), late = await frame(renderer, shot('data', [element]), 2.8, motion);
      assert.ok(!early.equals(late), `${element.type || element.style || element.kind} builds over time`);
    }
    const person = [{kind: 'figure', pose: 'stand', x: 0.5, size: 'l'}];
    assert.ok(!(await frame(renderer, shot('vector', person), 1.5, motion)).equals(await frame(renderer, {...shot('vector', person), engine: 'stickman'}, 1.5, motion)), 'a motion person is not a stick figure');
  } finally {
    await renderer.close();
  }
});

test('a drawing browser that is restarted (a stall during a render) draws again on the same renderer', {skip: browser ? false : 'No Edge or Chrome on this machine'}, async t => {
  const renderer = new MotionRenderer({browser}), out = require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'restart-'));
  t.after(() => require('node:fs').rmSync(out, {recursive: true, force: true}));
  const draw = () => renderer.render({...base, data: {...Sk.validate({set: 'none', elements: [{kind: 'prop', prop: 'truck'}]}, {primary: 'stickman'}), times: null}, duration: 0.2, fps: 10, outDir: out});
  try {
    await renderer.start();
    assert.equal((await draw()).frames, 2);
    await renderer.close(); await renderer.start();
    assert.equal((await draw()).frames, 2, 'the restarted browser gets the drawing code again');
  } finally {
    await renderer.close();
  }
});

test('0.36: maps colour in on their words, countries get faces, crowds and history people draw, words never sit on words, charts make room', {skip: browser ? false : 'No Edge or Chrome on this machine'}, async () => {
  const renderer = new MotionRenderer({browser});
  try {
    await renderer.start();
    const view = {kind: 'map', view: 'europe'};
    const lit = {...view, areas: [{countries: ['France'], label: 'France', at: 'France'}]};
    const cue = {elements: [{t0: null, t1: null, then: [1.5]}]};
    const plain = await frame(renderer, {set: 'none', camera: 'still', elements: [view]}, 1.0);
    assert.ok(plain.equals(await frame(renderer, {set: 'none', camera: 'still', elements: [lit]}, 1.0, {times: cue})), 'a country is not coloured before its word');
    const coloured = await frame(renderer, {set: 'none', camera: 'still', elements: [lit]}, 2.6, {times: cue});
    assert.ok(!coloured.equals(await frame(renderer, {set: 'none', camera: 'still', elements: [view]}, 2.6)), 'then it colours in');
    const face = {...lit, areas: [{...lit.areas[0], face: 'angry'}]};
    assert.ok(!coloured.equals(await frame(renderer, {set: 'none', camera: 'still', elements: [face]}, 2.6, {times: cue})), 'a country with a face reacts');
    // Routes, the date line and every engine draw without an error.
    for (const primary of ['stickman', 'handdrawn', 'motion']) await frame(renderer, {set: 'none', elements: [{kind: 'map', areas: [{countries: ['Russia', 'Japan']}], routes: [{from: 'China', to: 'USA', label: 'Trade'}], view: 'world'}]}, 2.5, {primary});
    // A crowd fills the street; the history cartoon draws its people with a big head.
    const street = {set: 'street', camera: 'still', elements: [{kind: 'prop', prop: 'sign', x: 0.85, y: 0.3, size: 's'}]};
    assert.ok(!(await frame(renderer, street, 1.5)).equals(await frame(renderer, {...street, elements: [...street.elements, {kind: 'crowd', count: 12, pose: 'cheer', headwear: 'spiked-helmet', colors: ['blue'], banner: 'Home by Christmas'}]}, 1.5)));
    const general = {set: 'room', camera: 'still', elements: [{kind: 'figure', pose: 'point', x: 0.4, look: {headwear: 'bicorne', outfit: 'officer', facial: 'handlebar', color: 'blue'}}]};
    assert.ok(!(await frame(renderer, {...general, engine: 'motion', design: 'cartoon'}, 1.5, {primary: 'motion'})).equals(await frame(renderer, general, 1.5, {drawing: {look: 'classic', hand: false}})), 'the cartoon documentary draws its own people');
    // Places of the past draw, and the painted story has its own finish.
    for (const set of ['throne', 'castle', 'chamber', 'harbor', 'market', 'village', 'battlefield']) await frame(renderer, {set, camera: 'still', elements: [{kind: 'fx', effect: 'dust'}]}, 1.0);
    assert.ok(!(await frame(renderer, {...general, set: 'throne', engine: 'motion', design: 'painted'}, 1.5, {primary: 'motion'})).equals(await frame(renderer, {...general, set: 'throne', engine: 'motion', design: 'cartoon'}, 1.5, {primary: 'motion'})));
    // A later text on the same spot replaces the earlier one instead of sitting on it.
    const words = (texts, t0s) => [{set: 'none', camera: 'still', elements: texts.map(text => ({kind: 'text', style: 'title', text, x: 0.5, y: 0.2}))}, {elements: t0s.map(t0 => ({t0, t1: null, then: []}))}];
    const [both, bothTimes] = words(['Bake what sells', 'Throw nothing away'], [0.2, 1.5]), [one, oneTimes] = words(['Throw nothing away'], [1.5]);
    assert.ok((await frame(renderer, both, 2.5, {times: bothTimes})).equals(await frame(renderer, one, 2.5, {times: oneTimes})));
    // A chart under a headline moves down to make room for it.
    await frame(renderer, {set: 'abstract', camera: 'still', elements: [{kind: 'text', style: 'counter', text: '$300,000', x: 0.5, y: 0.12, size: 'l'}, {kind: 'chart', type: 'bar', values: [100, 300], x: 0.5, y: 0.4, size: 'xl'}]}, 2.5, {primary: 'motion'});
    const {est} = await renderer.evaluate('DRAWN.layout()');
    assert.ok(est[1].box[1] >= est[0].box[3], 'the chart starts below the number');
  } finally {
    await renderer.close();
  }
});

test('0.38 motion layer: words animate in their own ways, textures, depth layers and map moves draw and change the frame', {skip: browser ? false : 'No Edge or Chrome on this machine'}, async () => {
  const renderer = new MotionRenderer({browser});
  try {
    await renderer.start();
    const title = animate => ({engine: 'motion', design: 'kinetic', set: 'none', camera: 'still', transition: 'cut', elements: [{kind: 'text', style: 'title', text: 'The spice that built empires', ...(animate ? {animate} : {})}]});
    const settled = {};
    for (const animate of ['rise', 'letters', 'typewriter', 'wipe', 'slam', 'track', 'glitch', 'blur']) {
      const early = await frame(renderer, title(animate), 0.15, {primary: 'motion'});
      settled[animate] = await frame(renderer, title(animate), 2.5, {primary: 'motion'});
      assert.ok(!early.equals(settled[animate]), `${animate} moves`);
      assert.ok(settled[animate].equals(await frame(renderer, title(animate), 2.5, {primary: 'motion'})), `${animate} is a pure function of time`);
    }
    assert.ok(settled.rise.equals(settled.blur) && settled.rise.equals(settled.slam), 'once in, the words rest in the same place');
    const focus = {engine: 'motion', design: 'kinetic', set: 'none', camera: 'still', elements: [{kind: 'text', style: 'statement', text: 'Pepper was worth *more than gold*', animate: 'focus'}]};
    assert.ok(!(await frame(renderer, focus, 1.2, {primary: 'motion'})).equals(await frame(renderer, focus, 3, {primary: 'motion'})), 'the word focus dims the rest after the build');
    // A starred span lights every word in it.
    const span = text => ({engine: 'motion', design: 'kinetic', set: 'none', camera: 'still', elements: [{kind: 'text', style: 'statement', text}]});
    assert.ok((await frame(renderer, span('Pepper was worth *more than gold*'), 2.5, {primary: 'motion'})).equals(await frame(renderer, span('Pepper was worth *more* *than* *gold*'), 2.5, {primary: 'motion'})));
    // Textures lie over the finished frame; film grain moves with time.
    const place = texture => ({set: 'village', camera: 'still', ...(texture ? {texture} : {}), elements: [{kind: 'figure', pose: 'stand', x: 0.4}]});
    const plain = await frame(renderer, place(null), 1.5);
    for (const texture of ['grain', 'film', 'paper', 'grid', 'vhs', 'duotone', 'leak']) assert.ok(!plain.equals(await frame(renderer, place(texture), 1.5)), texture);
    assert.ok(!(await frame(renderer, place('grain'), 1.5)).equals(await frame(renderer, place('grain'), 1.55)), 'grain moves');
    // Depth: with a moving camera the back layer sits elsewhere than the middle one.
    const depth = layer => ({set: 'none', camera: 'dolly-in', elements: [{kind: 'prop', prop: 'tree', x: 0.25, y: 0.5, size: 'l', ...(layer ? {layer} : {})}]});
    assert.ok(!(await frame(renderer, depth('back'), 2.8)).equals(await frame(renderer, depth(null), 2.8)));
    assert.ok(!(await frame(renderer, depth('front'), 2.8)).equals(await frame(renderer, depth(null), 2.8)));
    // New entrances.
    for (const enter of ['mask', 'swing', 'blur', 'rise']) assert.ok(!(await frame(renderer, {set: 'none', camera: 'still', elements: [{kind: 'prop', prop: 'globe', size: 'l', enter}]}, 0.2)).equals(await frame(renderer, {set: 'none', camera: 'still', elements: [{kind: 'prop', prop: 'globe', size: 'l', enter}]}, 1.5)), enter);
    // Maps: the camera flies to a country on its word; a traveller rides a route; a pin pulses; styles differ.
    const nepal = zoom => ({set: 'none', camera: 'still', elements: [{kind: 'map', areas: [{countries: ['Nepal'], ...(zoom ? {zoom: true} : {})}], pins: [{place: 'India', label: 'India'}]}]});
    assert.ok(!(await frame(renderer, nepal(true), 3.2)).equals(await frame(renderer, nepal(false), 3.2)), 'the map camera flew to Nepal');
    const route = icon => ({set: 'none', camera: 'still', elements: [{kind: 'map', view: 'world', routes: [{from: 'Portugal', to: 'India', ...(icon ? {icon} : {})}]}]});
    assert.ok(!(await frame(renderer, route('galleon'), 1.6)).equals(await frame(renderer, route(null), 1.6)), 'a traveller rides the route');
    const pin = {set: 'none', camera: 'still', elements: [{kind: 'map', view: 'europe', pins: [{place: 'France', label: 'Paris'}]}]};
    assert.ok(!(await frame(renderer, pin, 2.4)).equals(await frame(renderer, pin, 2.9)), 'pins pulse');
    for (const style of ['atlas', 'satellite', 'paper', 'night']) assert.ok(!(await frame(renderer, {set: 'none', camera: 'still', elements: [{kind: 'map', view: 'europe', style}]}, 2)).equals(await frame(renderer, {set: 'none', camera: 'still', elements: [{kind: 'map', view: 'europe'}]}, 2)), style);
  } finally {
    await renderer.close();
  }
});

test('0.39 motion curves are the measured ones: landings ease out, a pop leans only a little past its size, leavings ease in', () => {
  const vm = require('node:vm'), context = {window: {}};
  vm.runInNewContext(require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'drawn-kit.js'), 'utf8'), context);
  const e = context.window.DK.ease, peak = f => Math.max(...Array.from({length: 201}, (_, k) => f(k / 200)));
  for (const name of ['crashIn', 'popOver', 'bounceHard', 'snapSettle', 'softLand', 'whip', 'glide', 'cruise', 'softInOut', 'gentleIn', 'accelExit', 'crashOut']) assert.deepEqual([e[name](0), Math.round(e[name](1) * 1e6) / 1e6], [0, 1], name);
  assert.ok(Math.abs(peak(e.popOver) - 1.077) < 0.01 && Math.abs(peak(e.crashIn) - 1.18) < 0.01, 'overshoots as measured');
  assert.ok(e.snapSettle(0.2) > 0.75 && e.accelExit(0.4) < 0.1, 'a landing does most of its travel at once; a leaving starts slowly');
});

test('0.39 the evidence tools draw, a loupe magnifies, and every film look prints the frame its own way', {skip: browser ? false : 'No Edge or Chrome on this machine'}, async () => {
  const renderer = new MotionRenderer({browser});
  try {
    await renderer.start();
    const motion = {primary: 'motion'}, shot = (elements, extra = {}) => ({engine: 'motion', set: 'none', camera: 'still', transition: 'cut', elements, ...extra});
    const doc = {kind: 'document', doc: 'newspaper', source: 'Evening Herald', headline: 'Bank closes', line: 'savings of 4,000 families', x: 0.35};
    const empty = await frame(renderer, shot([{kind: 'text', style: 'label', text: '.', x: 0.95, y: 0.95}]), 1.6, motion);
    for (const element of [{kind: 'quote', text: 'We never saw it coming', name: 'A banker'}, doc, {kind: 'gauge', value: 72, unit: '%'}, {kind: 'gauge', value: 3, steps: 7},
      {kind: 'ruler', from: [0.2, 0.6], to: [0.8, 0.6], value: '43 km'}, {kind: 'chart', type: 'units', values: [1, 100], icon: 'person'}]) {
      assert.ok(!(await frame(renderer, shot([element]), 1.6, motion)).equals(empty), `${element.kind} draws`);
    }
    const page = await frame(renderer, shot([doc]), 1.8, motion), lens = await frame(renderer, shot([doc, {kind: 'loupe', on: 1, zoom: 2.5, x: 0.78, y: 0.36}]), 1.8, motion);
    assert.ok(!page.equals(lens), 'the loupe adds a magnified view');
    const scene = film => shot([{kind: 'figure', pose: 'point', x: 0.3, y: 0.8, size: 'l'}, {kind: 'prop', prop: 'coin', x: 0.66, y: 0.5, size: 'l', accent: true}, {kind: 'text', style: 'title', text: 'The first bank', x: 0.6, y: 0.15}], {set: 'village', ...(film ? {film} : {})});
    const frames = [await frame(renderer, scene(null), 1.6, motion)];
    for (const film of Sk.FILMS) frames.push(await frame(renderer, scene(film), 1.6, motion));
    assert.ok(frames.every((png, k) => frames.every((other, j) => j === k || !png.equals(other))), 'each film look differs from the plain frame and from the others');
    // The style's film look reaches every shot without the shot naming it; a shot may switch it off.
    const styled = await frame(renderer, scene(null), 1.6, {...motion, drawing: {look: 'classic', hand: false, film: 'blueprint'}});
    assert.ok(styled.equals(frames[1 + Sk.FILMS.indexOf('blueprint')]), 'the style film prints the shot');
    assert.ok((await frame(renderer, scene('none'), 1.6, {...motion, drawing: {look: 'classic', hand: false, film: 'blueprint'}})).equals(frames[0]), 'film "none" keeps the plain frame');
  } finally { await renderer.close(); }
});

// 0.41 (owner review 2026-10-19 and the study of eight repositories): words carry a chosen colour, natural media
// strokes and washes, motion blur on fast moments, stepped cadence, and zooms that grow the area evenly.
test('0.41 words take their chosen colour, natural media draw, fast moments blur and stepped motion holds frames', {skip: browser ? false : 'No Edge or Chrome on this machine'}, async () => {
  const renderer = new MotionRenderer({browser});
  try {
    await renderer.start();
    const word = color => ({engine: 'stickman', set: 'none', camera: 'still', transition: 'cut', elements: [{kind: 'text', style: 'poster', text: 'ANYONE', x: 0.5, y: 0.45, size: 'xl', ...(color ? {color} : {})}]});
    const gold = await frame(renderer, word('gold'), 1.5), plain = await frame(renderer, word(null), 1.5), red = await frame(renderer, word('red'), 1.5);
    assert.ok(!gold.equals(plain) && !gold.equals(red), 'a word takes the colour Claude chose');
    // Storybook and painted places are washed in, pencil whiteboards drawn in graphite: each finish changes the frame.
    const place = {engine: 'stickman', set: 'market', camera: 'still', transition: 'cut', elements: [{kind: 'figure', pose: 'point', x: 0.3, y: 0.8, size: 'l'}]};
    const classic = await frame(renderer, place, 1.5, {drawing: {look: 'classic', hand: false}}), story = await frame(renderer, place, 1.5, {drawing: {look: 'storybook', hand: false}});
    assert.ok(!classic.equals(story));
    assert.ok((await frame(renderer, place, 1.5, {drawing: {look: 'storybook', hand: false}})).equals(story), 'natural media are seeded: the same frame every time');
    // A fast moment (a sliding rocket) blurs when motion blur is on, and stays the same frame every time.
    const fast = {engine: 'motion', set: 'none', camera: 'still', transition: 'cut', elements: [{kind: 'prop', prop: 'rocket', x: 0.6, y: 0.45, size: 'l', enter: 'slide'}]};
    const motion = {primary: 'motion'}, sharp = await frame(renderer, fast, 0.12, {...motion, drawing: {look: 'classic', hand: false, motionBlur: false}});
    const blurred = await frame(renderer, fast, 0.12, {...motion, drawing: {look: 'classic', hand: false}});
    assert.ok(!blurred.equals(sharp), 'the documentary engine blurs fast moves by default');
    assert.ok((await frame(renderer, fast, 0.12, {...motion, drawing: {look: 'classic', hand: false}})).equals(blurred), 'the blur is the same every time');
    assert.ok((await frame(renderer, fast, 1.5, {...motion, drawing: {look: 'classic', hand: false}})).equals(await frame(renderer, fast, 1.5, {...motion, drawing: {look: 'classic', hand: false, motionBlur: false}})), 'still frames are not blurred');
    // On twos: a drawing holds for two frames.
    const twos = {drawing: {look: 'classic', hand: false, cadence: 'twos'}};
    assert.ok((await frame(renderer, fast, 0.2, {...motion, ...twos})).equals(await frame(renderer, fast, 0.2 + 1 / 30, {...motion, ...twos})), 'the second frame of a pair repeats the first');
  } finally { await renderer.close(); }
});

test('0.58 words fit as drawn (capitals, tags, stamps), a chart keeps its size beside a number and shows shares, name chips step aside', {skip: browser ? false : 'No Edge or Chrome on this machine'}, async () => {
  const renderer = new MotionRenderer({browser});
  const box = async (sketch, k, extra = {}) => { await frame(renderer, sketch, 2.5, {primary: 'motion', ...extra}); return (await renderer.evaluate('DRAWN.layout()')).est[k]; };
  try {
    await renderer.start();
    // A keyword is measured in the capitals it is drawn in, so "Stay awake" and "STAY AWAKE" take the same room and stay in the frame.
    const key = text => box({set: 'none', camera: 'push', elements: [{kind: 'text', style: 'keyword', text, x: 0.8, y: 0.3, size: 'l'}]}, 0);
    const [lower, upper] = [await key('Stay awake'), await key('STAY AWAKE')];
    assert.deepEqual(lower.box, upper.box);
    assert.ok(upper.box[2] <= 1920 && upper.box[0] >= 0, JSON.stringify(upper.box));
    // A tag's box holds its paper, not only its letters.
    const tag = await box({set: 'none', camera: 'still', elements: [{kind: 'text', style: 'tag', text: 'London', x: 0.2, y: 0.14}]}, 0);
    assert.ok(tag.box[1] >= 0 && tag.box[3] - tag.box[1] > 2 * (tag.box[2] - tag.box[0]) / 'London'.length, JSON.stringify(tag.box));
    // A big number beside a donut does not squeeze it into the bottom of the frame.
    const donut = {kind: 'chart', type: 'donut', values: [1, 2], labels: ['Brazil', 'Rest of the world'], x: 0.36, y: 0.5, size: 'xl'};
    const alone = await box({set: 'none', camera: 'still', elements: [donut]}, 0), beside = await box({set: 'none', camera: 'still', elements: [donut, {kind: 'text', style: 'number', text: '1/3', x: 0.8, y: 0.48, size: 'xl'}]}, 0);
    assert.ok(beside.box[3] - beside.box[1] > 0.8 * (alone.box[3] - alone.box[1]), `${JSON.stringify(alone.box)} ${JSON.stringify(beside.box)}`);
    assert.equal(Sk.validate({elements: [donut]}, {primary: 'motion'}).elements[0].labels[1], 'Rest of the world');
    assert.equal(Sk.validate({elements: [{...donut, labels: ['Brazil', 'Everyone else in the world']}]}, {primary: 'motion', lenient: true}).elements[0].labels[1], 'Everyone else in', 'cut at a word');
    // A name chip under a keyword moves beside the head.
    const scene = {set: 'none', camera: 'still', elements: [{kind: 'text', style: 'keyword', text: 'The legend', x: 0.15, y: 0.12}, {kind: 'figure', pose: 'stand', x: 0.2, y: 0.8, size: 'xl', label: 'Kaldi, goat herder'}]};
    await frame(renderer, scene, 2.5, {primary: 'motion'});
    const {est} = await renderer.evaluate('DRAWN.layout()'), [hx, hy, hr] = est[1].head;
    assert.ok(est[1].chip && est[1].chip[1] > hy - hr * 1.7, 'the chip left its place under the word');
    assert.ok(Math.abs(est[1].chip[0] - hx) > hr, 'beside the head, not on the face');
  } finally { await renderer.close(); }
});
