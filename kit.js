'use strict';
// P06j - The world kit (owner request 2026-10-11: scenes and characters built for each story - a stone-age script
// gets stone-age people and places, a train is a train). The drawing vocabulary is fixed; a kit item is something a
// story needs that it lacks (a steam train, a mammoth, a cave, a fur tunic), designed once per video by the story
// director as simple shapes on a small grid. Parsed and checked here into point lists - nothing Claude writes is
// ever run as code - and drawn by every engine in its own finish. Pure: no I/O.

const KINDS = Object.freeze(['prop', 'set', 'outfit']);
// The design grid of each kind. A prop is an object centred in its box; a set is the whole 16:9 frame with the
// ground line at y 72.5 (as every drawn set); an outfit is a garment on the torso: x 0-100 across the body (50 =
// its middle, the shoulders at about 30 and 70), y 0 at the neck, 100 at the hips, up to 160 for a robe or a tunic.
const GRID = Object.freeze({prop: [100, 100], set: [160, 90], outfit: [100, 160]});
const MAX_ITEMS = 16, MAX_SHAPES = 40, MAX_POINTS = 900, MAX_PATH = 4000;
const HEX = /^#[0-9a-f]{6}$/i;
const round3 = n => Math.round(n * 1000) / 1000;
const clean = (value, max) => String(value ?? '').replace(/[\x00-\x1F\x7F{}\\<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// An SVG path (M L H V C S Q T Z, absolute or relative) as polylines; an arc becomes a line to its end.
function flattenPath(d, warn = () => {}) {
  const tokens = String(d).slice(0, MAX_PATH).match(/[MLHVCSQTAZmlhvcsqtaz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) || [];
  const lines = [];
  let k = 0, cmd = null, x = 0, y = 0, sx = 0, sy = 0, cx = null, cy = null, line = null, arcNoted = false;
  const num = () => Number(tokens[k++]);
  const has = n => tokens.slice(k, k + n).length === n && tokens.slice(k, k + n).every(token => !/[a-z]/i.test(token));
  const to = (nx, ny) => { line.pts.push([nx, ny]); x = nx; y = ny; };
  const curve = (points, steps) => {
    for (let s = 1; s <= steps; s++) {
      const t = s / steps, u = 1 - t;
      const [p0, p1, p2, p3] = points;
      to(...(p3 ? [u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0], u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1]]
        : [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]));
    }
  };
  while (k < tokens.length) {
    if (/[a-z]/i.test(tokens[k])) cmd = tokens[k++];
    else if (!cmd) { k++; continue; }
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), ox = rel ? x : 0, oy = rel ? y : 0;
    if (C === 'Z') { if (line) { line.closed = true; x = sx; y = sy; } line = null; cmd = null; continue; }
    if (C === 'M') { if (!has(2)) break; const nx = ox + num(), ny = oy + num(); line = {pts: [[nx, ny]], closed: false}; lines.push(line); x = sx = nx; y = sy = ny; cmd = rel ? 'l' : 'L'; cx = cy = null; continue; }
    if (!line) { line = {pts: [[x, y]], closed: false}; lines.push(line); }
    if (C === 'L') { if (!has(2)) break; to(ox + num(), oy + num()); cx = cy = null; }
    else if (C === 'H') { if (!has(1)) break; to(ox + num(), y); cx = cy = null; }
    else if (C === 'V') { if (!has(1)) break; to(x, oy + num()); cx = cy = null; }
    else if (C === 'C') { if (!has(6)) break; const p1 = [ox + num(), oy + num()], p2 = [ox + num(), oy + num()], p3 = [ox + num(), oy + num()]; curve([[x, y], p1, p2, p3], 10); [cx, cy] = p2; }
    else if (C === 'S') { if (!has(4)) break; const p1 = cx === null ? [x, y] : [2 * x - cx, 2 * y - cy], p2 = [ox + num(), oy + num()], p3 = [ox + num(), oy + num()]; curve([[x, y], p1, p2, p3], 10); [cx, cy] = p2; }
    else if (C === 'Q') { if (!has(4)) break; const p1 = [ox + num(), oy + num()], p2 = [ox + num(), oy + num()]; curve([[x, y], p1, p2], 8); [cx, cy] = p1; }
    else if (C === 'T') { if (!has(2)) break; const p1 = cx === null ? [x, y] : [2 * x - cx, 2 * y - cy], p2 = [ox + num(), oy + num()]; curve([[x, y], p1, p2], 8); [cx, cy] = p1; }
    else if (C === 'A') { if (!has(7)) break; k += 5; if (!arcNoted) { warn('arcs are drawn as straight lines'); arcNoted = true; } to(ox + num(), oy + num()); cx = cy = null; }
    else k++;
  }
  return lines.filter(item => item.pts.length >= 2 && item.pts.every(([px, py]) => Number.isFinite(px) && Number.isFinite(py)));
}

const ring = (cx, cy, rx, ry, n = 28) => Array.from({length: n + 1}, (_, s) => [cx + rx * Math.cos(s / n * Math.PI * 2), cy + ry * Math.sin(s / n * Math.PI * 2)]);
const numbers = (value, n) => (Array.isArray(value) && value.length === n && value.every(item => Number.isFinite(Number(item))) ? value.map(Number) : null);

// One shape as polylines in grid units: {path}, {circle: [cx, cy, r]}, {ellipse: [cx, cy, rx, ry]},
// {rect: [x, y, w, h]}, {line: [x1, y1, x2, y2]} or {points: [[x, y], ...]} (closed when "closed" is true).
function shapeLines(shape, warn) {
  if (typeof shape.path === 'string') return flattenPath(shape.path, warn);
  let v;
  if ((v = numbers(shape.circle, 3))) return [{pts: ring(v[0], v[1], v[2], v[2]), closed: true}];
  if ((v = numbers(shape.ellipse, 4))) return [{pts: ring(v[0], v[1], v[2], v[3]), closed: true}];
  if ((v = numbers(shape.rect, 4))) return [{pts: [[v[0], v[1]], [v[0] + v[2], v[1]], [v[0] + v[2], v[1] + v[3]], [v[0], v[1] + v[3]], [v[0], v[1]]], closed: true}];
  if ((v = numbers(shape.line, 4))) return [{pts: [[v[0], v[1]], [v[2], v[3]]], closed: false}];
  if (Array.isArray(shape.points)) { const pts = shape.points.map(point => numbers(point, 2)).filter(Boolean); return pts.length >= 2 ? [{pts, closed: shape.closed === true}] : []; }
  return [];
}

// validateKit(raw, {warn}): {id: {kind, name, shapes: [{pts, fill?, closed}]}} with points in the kind's unit
// space - prop: -0.5..0.5 around the box centre; set: 0..1 of the frame; outfit: u -0.5..0.5 across the torso,
// v 0 (neck) .. 1 (hips) .. 1.6. Unknown kinds, empty items and points far off the grid are dropped and named.
function validateKit(raw, {warn = () => {}} = {}) {
  if (!Array.isArray(raw)) return {};
  const kit = {};
  for (const [n, item] of raw.slice(0, MAX_ITEMS).entries()) {
    const label = `Kit item ${n + 1}`;
    if (!item || typeof item !== 'object') { warn(`${label} is not an object, so it was left out.`); continue; }
    const id = clean(item.id, 24).toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!id || kit[id]) { warn(`${label} needs a new id (letters, digits and dashes), so it was left out.`); continue; }
    if (!KINDS.includes(item.kind)) { warn(`${label} (${id}) must be a prop, a set or an outfit, so it was left out.`); continue; }
    const [gw, gh] = GRID[item.kind], shapes = [];
    let points = 0;
    for (const shape of (Array.isArray(item.shapes) ? item.shapes : []).slice(0, MAX_SHAPES)) {
      if (!shape || typeof shape !== 'object') continue;
      const fill = HEX.test(String(shape.fill || '')) ? String(shape.fill).toUpperCase() : null;
      for (const line of shapeLines(shape, message => warn(`${label} (${id}): ${message}.`))) {
        if (points + line.pts.length > MAX_POINTS) break;
        // A point far outside the grid is a mistake; points a little outside are kept (a tail, a horn).
        if (line.pts.some(([x, y]) => x < -gw * 0.25 || x > gw * 1.25 || y < -gh * 0.25 || y > gh * 1.25)) continue;
        points += line.pts.length;
        const closed = line.closed || shape.closed === true;
        const pts = line.pts.map(([x, y]) => (item.kind === 'set' ? [x / gw, y / gh] : item.kind === 'prop' ? [x / gw - 0.5, y / gh - 0.5] : [(x - 50) / 100, y / 100]).map(round3));
        if (closed && (pts[0][0] !== pts.at(-1)[0] || pts[0][1] !== pts.at(-1)[1])) pts.push([...pts[0]]);
        shapes.push({pts, closed, ...(fill && closed ? {fill} : {})});
      }
    }
    if (!shapes.length) { warn(`${label} (${id}) has no shapes that can be drawn, so it was left out.`); continue; }
    kit[id] = {kind: item.kind, name: clean(item.name, 40) || id, shapes};
  }
  return kit;
}

// A kit carried inside a validated drawing, checked again (it travels through stored plans and assets): only
// known kinds, bounded shapes of finite points near the unit space, and #RRGGBB fills are kept.
function embedded(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [id, item] of Object.entries(raw).slice(0, MAX_ITEMS)) {
    if (!/^[a-z0-9-]{1,24}$/.test(id) || !item || !KINDS.includes(item.kind) || !Array.isArray(item.shapes)) continue;
    let points = 0;
    const shapes = item.shapes.slice(0, MAX_SHAPES * 4).filter(shape => {
      const ok = shape && Array.isArray(shape.pts) && shape.pts.length >= 2 && (points += shape.pts.length) <= MAX_POINTS
        && shape.pts.every(pt => Array.isArray(pt) && pt.length === 2 && pt.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 2));
      return ok;
    }).map(shape => ({pts: shape.pts.map(([x, y]) => [x, y]), closed: shape.closed === true, ...(HEX.test(String(shape.fill || '')) ? {fill: shape.fill} : {})}));
    if (shapes.length) out[id] = {kind: item.kind, name: clean(item.name, 40) || id, shapes};
  }
  return out;
}

// What a planner needs to know about the kit (no shapes, so it costs few tokens).
const summary = kit => Object.entries(kit || {}).map(([id, item]) => ({ref: `kit:${id}`, kind: item.kind, name: item.name}));

const promptGuide = () => [
  'WORLD KIT: design the things this story needs that the drawing vocabulary lacks - an object (a steam train, a mammoth, a spear), a place (a cave, a train platform, a prehistoric valley) or a costume (a fur tunic, a robe, armour) - as up to 16 kit items, each drawn once and used in every shot that needs it.',
  `A kit item is {"id": short-name, "kind": "prop"|"set"|"outfit", "name": what it is, "shapes": [shape, ...]} with up to ${MAX_SHAPES} shapes; a shape is {"path": SVG path data (M L H V C S Q T Z)} or {"circle": [cx, cy, r]}, {"ellipse": [cx, cy, rx, ry]}, {"rect": [x, y, w, h]}, {"line": [x1, y1, x2, y2]}, {"points": [[x, y], ...], "closed"?: true}, each with an optional "fill": "#RRGGBB" (closed shapes only). Draw like a clean cartoon outline: a few clear shapes, not a photo.`,
  'Grids: a prop on 0-100 x 0-100, the object centred, filling most of the box, its base near y 90 when it stands on the ground. A set on 0-160 x 0-90, the ground line at y 72.5, the sky or ceiling above it, nothing important in the middle (characters stand there). An outfit on 0-100 x 0-160: x across the body (50 is its middle, the shoulders at about 30 and 70; a cape or a wide robe can reach 15-85), y 0 at the neck, 100 at the hips, up to 160 for a robe.',
  'Use a kit item by reference: a prop "kit:<id>", a set "kit:<id>", a cast look\'s outfit "kit:<id>".',
].join('\n');

module.exports = {KINDS, GRID, MAX_ITEMS, flattenPath, validateKit, embedded, summary, promptGuide};

// Self-check: node kit.js
if (require.main === module) {
  const assert = require('node:assert/strict');
  const lines = flattenPath('M10 10 L20 10 l0 10 H5 V5 Z M0 0 C10 0 10 10 20 10 Q30 10 30 0 A5 5 0 0 1 40 0');
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[0].pts.slice(0, 5), [[10, 10], [20, 10], [20, 20], [5, 20], [5, 5]]);
  assert.equal(lines[0].closed, true);
  assert.deepEqual(lines[1].pts.at(-1), [40, 0]);
  const warnings = [];
  const kit = validateKit([{id: 'Steam Train!', kind: 'prop', name: 'steam train', shapes: [{rect: [10, 40, 70, 30], fill: '#aa3322'}, {circle: [25, 75, 8], fill: '#333333'}, {path: 'M80 40 L95 30'}]},
    {id: 'cave', kind: 'set', shapes: [{path: 'M0 72.5 L160 72.5 L160 90 L0 90 Z', fill: '#8a7a66'}]}, {id: 'x', kind: 'hat', shapes: [{circle: [1, 1, 1]}]}, {id: 'empty', kind: 'prop', shapes: [{circle: ['a', 1, 2]}]}],
  {warn: message => warnings.push(message)});
  assert.deepEqual(Object.keys(kit), ['steamtrain', 'cave']);
  assert.deepEqual(kit.steamtrain.shapes[0].pts[0], [-0.4, -0.1]);
  assert.equal(kit.steamtrain.shapes[0].fill, '#AA3322');
  assert.equal(kit.steamtrain.shapes[2].fill, undefined, 'an open line has no fill');
  assert.deepEqual(kit.cave.shapes[0].pts[1], [1, 0.806]);
  assert.equal(warnings.length, 2);
  assert.deepEqual(kit.steamtrain.shapes[0].pts.at(-1), kit.steamtrain.shapes[0].pts[0], 'a closed shape ends where it starts');
  assert.deepEqual(Object.keys(embedded({...kit, bad: {kind: 'prop', shapes: [{pts: [[0, 0], [9, 9]]}]}, 'BAD ID': kit.cave})), ['steamtrain', 'cave']);
  console.log('kit self-check ok');
}
