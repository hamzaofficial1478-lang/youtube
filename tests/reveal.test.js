'use strict';
// 0.67: the sketch reveal (drawn-reveal.js, a port of whiteboard-animation-vi): lines in a sensible order, then
// colours brushed in, the subject first, every pixel coloured when the brush passes it; pure and repeatable.
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../drawn-reveal');
const {MotionRenderer, findBrowser} = require('../motion');
const Sk = require('../sketch');

// A small picture: a light-blue sky touching the border, a red disc with a black outline in the middle, a row of
// black "letters" near the bottom and white paper in the bottom strip.
function picture(w = 240, h = 160) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let c = y > h * 0.9 ? [255, 255, 255] : [170, 210, 240];
    const r = Math.hypot(x - w * 0.4, y - h * 0.42);
    if (r < h * 0.22) c = [214, 64, 52]; else if (r < h * 0.22 + 3) c = [20, 20, 20];
    if (y > h * 0.76 && y < h * 0.84 && x > w * 0.15 && x < w * 0.85 && x % 7 < 5) c = [20, 20, 20];
    px.set([...c, 255], (y * w + x) * 4);
  }
  return {px, w, h};
}

test('the sketch reveal plans lines, then colours, subject first, the same way every time', () => {
  const {px, w, h} = picture(), plan = R.plan(px, w, h), again = R.plan(px, w, h);
  assert.ok(Buffer.from(plan.structure).equals(Buffer.from(again.structure)) && Buffer.from(plan.contact.buffer).equals(Buffer.from(again.contact.buffer)), 'the same picture gives the same plan');
  assert.ok(plan.cells > 10 && plan.strokes.length > 3 && plan.inkEnd === 0.45);
  const at = (x, y) => y * w + x;
  // Lines only where the picture has lines; the white paper is never drawn or coloured.
  assert.notEqual(plan.structure[at(Math.round(w * 0.4 + h * 0.22 + 1), Math.round(h * 0.42))], 255, 'the outline is ink');
  assert.equal(plan.structure[at(Math.round(w * 0.4), Math.round(h * 0.42))], 255, 'the disc inside is not ink');
  assert.equal(plan.contact[at(5, h - 3)], Infinity, 'white paper is left to the board');
  // The subject (the disc, away from the border) is coloured before the sky that touches the border.
  assert.ok(plan.subject, 'the disc is the subject');
  assert.ok(plan.contact[at(Math.round(w * 0.4), Math.round(h * 0.42))] < plan.contact[at(5, 5)], 'subject first');
  // Lettering is written left to right.
  const row = Math.round(h * 0.8), letters = [];
  for (let x = Math.round(w * 0.16); x < w * 0.84; x++) if (plan.structure[at(x, row)] !== 255) letters.push(plan.structure[at(x, row)]);
  assert.ok(letters.length > 20 && letters[0] < letters.at(-1), 'the row is drawn from left to right');
  // Frames: nothing at the start, every line and no colour at the end of the ink, the whole picture at the end.
  const out = new Uint8ClampedArray(w * h * 4), alpha = q => { R.frame(plan, q, out); let n = 0; for (let i = 3; i < out.length; i += 4) n += out[i] ? 1 : 0; return n; };
  assert.ok(alpha(0) <= plan.edge ** 2, 'at the start only the first cell of a line');
  const inkCount = [...plan.structure].filter(v => v !== 255).length;
  assert.equal(alpha(0.45), inkCount, 'all the lines, no colour yet');
  R.frame(plan, 1, out);
  for (const i of [at(Math.round(w * 0.4), Math.round(h * 0.42)), at(5, 5)]) assert.deepEqual([...out.slice(i * 4, i * 4 + 4)], [...plan.src.slice(i * 4, i * 4 + 4)], 'the finished frame is the picture');
  assert.equal(out[at(5, h - 3) * 4 + 3], 0, 'paper stays clear');
  // A pixel is coloured when the brush is there: at its contact time the pen is within a brush width of it.
  const pixel = at(Math.round(w * 0.4), Math.round(h * 0.42)), q = 0.45 + plan.contact[pixel] * 0.55, pen = R.pen(plan, q);
  assert.ok(Math.hypot(pen.x - w * 0.4, pen.y - h * 0.42) <= plan.brush, 'the brush is at the pixel it colours');
  assert.equal(pen.lift, 0, 'the pen is on the paper while it colours');
  assert.match(pen.colour, /^#[0-9A-F]{6}$/);
  assert.equal(R.pen(plan, 1), null, 'no pen after the reveal');
});

test('the drawing engine draws a painted picture on the whiteboard, line and colour, under the hand', {skip: findBrowser() ? false : 'No Edge or Chrome on this machine'}, async () => {
  const renderer = new MotionRenderer({browser: findBrowser()});
  try {
    await renderer.start();
    const base = {template: 'sketch-scene', palette: {bg: '#FFFFFF', ink: '#1F1F1F', accent: '#E0753E'}, fonts: {heading: 'Arial', body: 'Arial', hand: 'Segoe Print'}, width: 320, height: 180, fps: 30, duration: 4};
    await renderer.frame({...base, data: {...Sk.validate({engine: 'handdrawn', elements: [{kind: 'text', style: 'title', text: 'Hi'}]}, {primary: 'handdrawn'}), times: null}, t: 0});
    const png = await renderer.evaluate(`(() => { const c = document.createElement('canvas'); c.width = 240; c.height = 160; const x = c.getContext('2d'); x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, 240, 160); x.fillStyle = '#D6403A'; x.strokeStyle = '#141414'; x.lineWidth = 5; x.beginPath(); x.arc(120, 80, 50, 0, 7); x.fill(); x.stroke(); return c.toDataURL('image/png'); })()`);
    const sha = 'b'.repeat(64), images = {[sha]: png};
    const sketch = Sk.validate({engine: 'handdrawn', camera: 'still', elements: [{kind: 'picture', describe: 'A red ball on the board', image: sha, size: 'l'}]}, {primary: 'handdrawn', lenient: true});
    const at = t => renderer.frame({...base, images, drawing: {hand: true}, data: {...sketch, times: null}, t});
    const early = await at(0.6), late = await at(1.9), done = await at(3.8);
    assert.ok(!early.equals(late) && !late.equals(done), 'the picture is drawn over time');
    assert.ok(late.equals(await at(1.9)), 'a frame is a pure function of time');
    assert.ok(done.equals(await at(3.9)), 'the finished picture holds');
  } finally { await renderer.close(); }
});
