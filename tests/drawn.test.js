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
    for (const look of ['classic', 'whiteboard', 'storybook', 'doodle', 'illustrated']) looks[look] = await frame(renderer, scene, 2.8, {drawing: {look, hand: false}});
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
