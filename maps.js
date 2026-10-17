'use strict';
// P06q Maps: country shapes for the drawn engines' map tool. Natural Earth's 1:110m admin-0 countries (public domain),
// through the world-atlas package (ISC, pinned 2.0.2), decoded once from TopoJSON into [lon, lat] rings. This module
// resolves country names, fits a view and lists what a map element needs; drawn-engine.js draws it (window.DMAP).

const fs = require('node:fs');

const FILE = require.resolve('world-atlas/countries-110m.json');
const VERSION = 'world-atlas@2.0.2/countries-110m';
// Named views: [west, south, east, north] in degrees.
const VIEWS = Object.freeze({
  world: [-180, -58, 180, 84], europe: [-25, 34, 45, 71], asia: [25, -10, 150, 60], africa: [-20, -36, 55, 38], 'middle-east': [24, 10, 64, 43],
  'north-america': [-170, 5, -50, 75], 'south-america': [-85, -57, -32, 14], oceania: [110, -48, 180, 0], 'east-asia': [95, 15, 150, 55], 'south-asia': [60, 4, 100, 38],
});
const norm = value => String(value).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
// Everyday names for the data's own names (historic names map to today's country that holds the place).
const ALIASES = Object.freeze({
  'United States of America': ['us', 'usa', 'unitedstates', 'america', 'theunitedstates', 'theus'], 'United Kingdom': ['uk', 'britain', 'greatbritain', 'england', 'scotland', 'wales', 'theuk'],
  'Dem. Rep. Congo': ['drc', 'drcongo', 'democraticrepublicofthecongo', 'democraticrepublicofcongo', 'congokinshasa', 'zaire'], Congo: ['republicofthecongo', 'congobrazzaville'],
  'Czechia': ['czechrepublic'], "Côte d'Ivoire": ['ivorycoast'], Macedonia: ['northmacedonia'], 'Bosnia and Herz.': ['bosnia', 'bosniaandherzegovina'], 'Central African Rep.': ['centralafricanrepublic', 'car'],
  'Dominican Rep.': ['dominicanrepublic'], 'S. Sudan': ['southsudan'], 'W. Sahara': ['westernsahara'], 'Eq. Guinea': ['equatorialguinea'], 'Solomon Is.': ['solomonislands'], 'Falkland Is.': ['falklandislands', 'falklands'],
  eSwatini: ['swaziland', 'eswatini'], Myanmar: ['burma'], Iran: ['persia'], Netherlands: ['holland', 'thenetherlands'], Thailand: ['siam'], 'Sri Lanka': ['ceylon'], 'Timor-Leste': ['easttimor'],
  'N. Cyprus': ['northerncyprus'], 'South Korea': ['korea', 'republicofkorea'], 'North Korea': ['dprk'], 'United Arab Emirates': ['uae', 'emirates'], Turkey: ['turkiye'], Russia: ['russianfederation'],
  China: ['prc', 'peoplesrepublicofchina'], Taiwan: ['roc', 'republicofchina'], Vietnam: ['vietnam', 'viet'], Laos: ['laopdr'], Gambia: ['thegambia'], Bahamas: ['thebahamas'], Philippines: ['thephilippines'],
});

let world = null;
const round = n => Math.round(n * 100) / 100;
// Decodes the TopoJSON once: {names, countries: {name: [[ring, ...holes], ...]}, meta: {name: {box, main, point}}}.
function load() {
  if (world) return world;
  const topo = JSON.parse(fs.readFileSync(FILE, 'utf8')), [sx, sy] = topo.transform.scale, [tx, ty] = topo.transform.translate;
  const arcs = topo.arcs.map(arc => { let x = 0, y = 0; return arc.map(([dx, dy]) => { x += dx; y += dy; return [round(x * sx + tx), round(y * sy + ty)]; }); });
  // A ring that crosses the date line (Russia, Fiji) is unwrapped so its longitudes run on past 180; the page also draws
  // it shifted by 360. A ring around the pole (Antarctica) cannot be drawn flat and is left out.
  const ring = list => {
    const pts = list.flatMap((k, n) => { const a = k < 0 ? arcs[~k].slice().reverse() : arcs[k]; return n ? a.slice(1) : a; });
    let shift = 0, jumps = 0;
    return pts.map(([x, y], k) => { if (k) { const d = x + shift - (pts[k - 1][0] + shift); if (d > 180) { shift -= 360; jumps++; } else if (d < -180) { shift += 360; jumps++; } } return [round(x + shift), y]; }).concat(jumps % 2 ? [null] : []);
  };
  const countries = {}, meta = {}, lookup = new Map();
  for (const g of topo.objects.countries.geometries) {
    const name = g.properties.name, polys = (g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : []).map(poly => poly.map(ring)).filter(poly => !poly[0].includes(null)).map(poly => poly.filter(r => !r.includes(null)));
    if (!polys.length) continue;
    countries[name] = polys;
    // The main shape (largest area) and the parts near it decide where the country is; far territories (French Guiana,
    // Alaska, Svalbard) are drawn but never pull a fitted view across the world.
    const area = r => Math.abs(r.reduce((sum, [x, y], k) => { const [x2, y2] = r[(k + 1) % r.length]; return sum + x * y2 - x2 * y; }, 0)) / 2;
    const boxOf = r => [Math.min(...r.map(p => p[0])), Math.min(...r.map(p => p[1])), Math.max(...r.map(p => p[0])), Math.max(...r.map(p => p[1]))];
    const main = polys.map(p => p[0]).reduce((a, b) => (area(b) > area(a) ? b : a)), mb = boxOf(main);
    const near = polys.map(p => boxOf(p[0])).filter(b => (b[0] + b[2]) / 2 > mb[0] - 15 && (b[0] + b[2]) / 2 < mb[2] + 15 && (b[1] + b[3]) / 2 > mb[1] - 15 && (b[1] + b[3]) / 2 < mb[3] + 15);
    const box = [Math.min(...near.map(b => b[0])), Math.min(...near.map(b => b[1])), Math.max(...near.map(b => b[2])), Math.max(...near.map(b => b[3]))];
    // The label point: the main shape's centroid (area-weighted).
    let cx = 0, cy = 0, a2 = 0;
    main.forEach(([x, y], k) => { const [x2, y2] = main[(k + 1) % main.length], f = x * y2 - x2 * y; a2 += f; cx += (x + x2) * f; cy += (y + y2) * f; });
    meta[name] = {box, point: a2 ? [round(cx / (3 * a2)), round(cy / (3 * a2))] : [round((mb[0] + mb[2]) / 2), round((mb[1] + mb[3]) / 2)]};
    lookup.set(norm(name), name);
  }
  for (const [name, list] of Object.entries(ALIASES)) if (countries[name]) for (const alias of list) lookup.set(alias, name);
  world = {names: Object.keys(countries).sort(), countries, meta, lookup};
  return world;
}

// The data's own name for a country ("USA" -> "United States of America"), or null.
const country = value => load().lookup.get(norm(value)) || null;
// A place: a country name (its label point) or [lon, lat]. Returns [lon, lat] or null.
function place(value) {
  if (Array.isArray(value) && value.length === 2 && value.every(Number.isFinite) && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 85) return value.map(round);
  const name = typeof value === 'string' ? country(value) : null;
  return name ? load().meta[name].point : null;
}
// The view a map shows: a named view, or a box around everything it names with room around it.
function fit(names, points = []) {
  const {meta} = load(), boxes = names.map(name => meta[name].box).concat(points.map(([x, y]) => [x, y, x, y]));
  if (!boxes.length) return [...VIEWS.world];
  let [w, s, e, n] = [Math.min(...boxes.map(b => b[0])), Math.min(...boxes.map(b => b[1])), Math.max(...boxes.map(b => b[2])), Math.max(...boxes.map(b => b[3]))];
  const padX = Math.max(6, (e - w) * 0.16), padY = Math.max(4, (n - s) * 0.2);
  [w, s, e, n] = [w - padX, s - padY, e + padX, n + padY];
  if (e - w < 22) { const c = (w + e) / 2; [w, e] = [c - 11, c + 11]; }
  if (n - s < 14) { const c = (s + n) / 2; [s, n] = [c - 7, c + 7]; }
  return [Math.max(-200, w), Math.max(-60, s), Math.min(200, e), Math.min(84, n)].map(round);
}
// What the drawing page needs: every country's rings (about 130 KB of JSON).
let page = null;
const pageData = () => (page ??= JSON.stringify({version: VERSION, countries: load().countries}));

module.exports = {VERSION, VIEWS, load, country, place, fit, pageData, names: () => load().names};
