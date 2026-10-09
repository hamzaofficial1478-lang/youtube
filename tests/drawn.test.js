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
