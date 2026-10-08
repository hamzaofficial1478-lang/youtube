'use strict';
// P06c Drawn scenes: the closed vocabulary of a drawn shot (stick figures, props, labels, arrows, speech
// bubbles) for the Stickman Sketch Explainer, Hand-drawn Canvas and Motion Graphics styles. Claude writes a
// scene in this vocabulary; the free fallback builds one from the narration's own words. Pure: no I/O. The
// drawing itself is motion-templates.js ('sketch-scene'), stroke by stroke in the local browser.

const POSES = Object.freeze(['stand', 'point', 'think', 'shock', 'cheer', 'walk', 'run', 'sit', 'wave', 'shrug']);
const PROPS = Object.freeze(['sun', 'cloud', 'storm', 'bolt', 'tree', 'house', 'city', 'mountain', 'ground', 'globe', 'clock', 'thermometer', 'heart', 'coin', 'money', 'book', 'lightbulb', 'question', 'exclamation', 'flag', 'chart', 'magnifier', 'sand', 'glass', 'waves']);
const SIZES = Object.freeze(['s', 'm', 'l']), BACKGROUNDS = Object.freeze(['paper', 'board', 'plain']), CAMERAS = Object.freeze(['still', 'push', 'drift']);
const TEXT_STYLES = Object.freeze(['title', 'note', 'number']);
const MAX_ELEMENTS = 8;
// The drawing engine's version: drawings made by an older engine are drawn again by "Draw all scenes".
const VERSION = 'drawn-scene/4';
const fail = message => { throw Object.assign(new Error(message), {status: 400}); };
const clean = (value, max) => String(value ?? '').replace(/[\x00-\x1F\x7F{}\\<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
// Positions are fractions of the frame; content stays above the caption band and inside the safe margins.
const coord = (value, label, min, max) => { const n = Number(value); if (!Number.isFinite(n)) fail(`${label} must be a number between 0 and 1.`); return Math.round(Math.min(max, Math.max(min, n)) * 1000) / 1000; };
const pick = (value, list, label, fallback) => { if (value === undefined || value === null || value === '') return fallback; if (!list.includes(value)) fail(`${label} must be one of: ${list.join(', ')}.`); return value; };

function validate(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('A drawn scene must be an object.');
  if (!Array.isArray(raw.elements) || !raw.elements.length || raw.elements.length > MAX_ELEMENTS) fail(`A drawn scene needs 1-${MAX_ELEMENTS} elements.`);
  const elements = raw.elements.map((item, k) => {
    const label = `Element ${k + 1}`;
    if (!item || typeof item !== 'object') fail(`${label} must be an object.`);
    const base = {accent: item.accent === true, ...(clean(item.label, 24) ? {label: clean(item.label, 24)} : {})};
    if (item.kind === 'figure') return {kind: 'figure', pose: pick(item.pose, POSES, `${label} pose`, 'stand'), x: coord(item.x ?? 0.3, `${label} x`, 0.08, 0.92), y: coord(item.y ?? 0.78, `${label} y`, 0.35, 0.8), size: pick(item.size, SIZES, `${label} size`, 'm'), facing: pick(item.facing, ['left', 'right'], `${label} facing`, 'right'), ...base};
    if (item.kind === 'prop') return {kind: 'prop', prop: pick(item.prop, PROPS, `${label} prop`, null) || fail(`${label} needs a prop.`), x: coord(item.x ?? 0.65, `${label} x`, 0.06, 0.94), y: coord(item.y ?? 0.45, `${label} y`, 0.1, 0.8), size: pick(item.size, SIZES, `${label} size`, 'm'), ...base};
    if (item.kind === 'text') { const value = clean(item.text, 40); if (!value) fail(`${label} needs text.`); return {kind: 'text', text: value, x: coord(item.x ?? 0.5, `${label} x`, 0.06, 0.94), y: coord(item.y ?? 0.18, `${label} y`, 0.08, 0.78), size: pick(item.size, SIZES, `${label} size`, 'm'), style: pick(item.style, TEXT_STYLES, `${label} style`, 'note'), accent: item.accent === true}; }
    if (item.kind === 'arrow') {
      if (!Array.isArray(item.from) || !Array.isArray(item.to)) fail(`${label} needs from and to points.`);
      return {kind: 'arrow', from: [coord(item.from[0], `${label} from x`, 0.04, 0.96), coord(item.from[1], `${label} from y`, 0.06, 0.8)], to: [coord(item.to[0], `${label} to x`, 0.04, 0.96), coord(item.to[1], `${label} to y`, 0.06, 0.8)], ...base};
    }
    if (item.kind === 'bubble') { const value = clean(item.text, 40); if (!value) fail(`${label} needs text.`); return {kind: 'bubble', text: value, x: coord(item.x ?? 0.5, `${label} x`, 0.1, 0.9), y: coord(item.y ?? 0.25, `${label} y`, 0.1, 0.7), thought: item.thought === true, accent: item.accent === true}; }
    return fail(`${label} kind must be figure, prop, text, arrow or bubble.`);
  });
  return {background: pick(raw.background, BACKGROUNDS, 'Background', 'paper'), camera: pick(raw.camera, CAMERAS, 'Camera', 'push'), elements};
}

// ---------------------------------------------------------------- the free fallback

const PROP_WORDS = [
  ['bolt', /\b(lightning|bolt|strike|strikes|striking|flash|spark|electric\w*)\b/], ['storm', /\b(storm|thunder\w*|rain|clouds?)\b/], ['sun', /\b(sun|sunlight|solar)\b/],
  ['thermometer', /\b(hot|hotter|heat|heats|degrees?|temperature|warm\w*)\b/], ['tree', /\b(trees?|forest|wood)\b/], ['heart', /\b(heart|love|alive)\b/],
  ['sand', /\b(sand|desert|beach|dune)\b/], ['glass', /\b(glass|crystal)\b/], ['globe', /\b(earth|world|globe|planet|equator|countries)\b/],
  ['clock', /\b(seconds?|minutes?|hours?|time|clock|day|days|years?)\b/], ['coin', /\b(coins?|money|price|cost|pay|cash)\b/], ['book', /\b(book|story|history|read)\b/],
  ['waves', /\b(sound|hear|noise|loud|shock wave|echo)\b/], ['city', /\b(city|cities|building|town)\b/], ['mountain', /\b(mountain|hill|peak)\b/],
  ['house', /\b(house|home)\b/], ['chart', /\b(million|billion|percent|%|statistics?|data|number)\b/], ['magnifier', /\b(search|find|look|discover\w*)\b/],
  ['lightbulb', /\b(idea|because|reason|explain\w*|means)\b/], ['flag', /\b(country|nation|flag)\b/], ['ground', /\b(ground|land|floor)\b/],
];
const POSE_WORDS = [['shock', /\b(hotter|explode\w*|blinding|stop|kill\w*|danger\w*|melt\w*|split)\b|!/], ['think', /\b(why|how|what|wonder|imagine|count)\b|\?/], ['point', /\b(this|that|here|there|look|next|every)\b/], ['walk', /\b(creep\w*|walk\w*|travel\w*|move\w*|steps?)\b/], ['cheer', /\b(win\w*|best|success\w*|finally)\b/]];

// A simple, honest scene from the shot's narration: one figure reacting, up to two props it mentions, and the
// scene's on-screen text (or a figure from the narration) as a label.
function fromText(narration, {onScreenText = '', shotIndex = 0, purpose = 'explain'} = {}) {
  const lower = ` ${String(narration).toLowerCase()} `;
  const props = PROP_WORDS.filter(([, pattern]) => pattern.test(lower)).map(([prop]) => prop);
  const chosen = [...new Set(props)].slice(shotIndex % 2 ? 1 : 0).slice(0, 2);
  if (!chosen.length) chosen.push(purpose === 'hook' ? 'exclamation' : 'lightbulb');
  const pose = POSE_WORDS.find(([, pattern]) => pattern.test(lower))?.[0] || (shotIndex % 2 ? 'point' : 'stand');
  const left = shotIndex % 2 === 1, number = String(narration).match(/\b\d[\d,.]*%?/)?.[0];
  const elements = [{kind: 'figure', pose, x: left ? 0.72 : 0.26, y: 0.78, size: 'm', facing: left ? 'left' : 'right'}];
  chosen.forEach((prop, k) => elements.push({kind: 'prop', prop, x: left ? 0.28 + k * 0.2 : 0.62 + k * 0.2, y: k ? 0.5 : 0.4, size: k ? 's' : 'm', accent: k === 0}));
  const words = clean(onScreenText, 40) || (number ? number : '');
  if (words) elements.push({kind: 'text', text: words, x: 0.5, y: 0.16, size: number && !onScreenText ? 'l' : 'm', style: number && !onScreenText ? 'number' : 'title', accent: true});
  return validate({background: 'paper', camera: shotIndex % 2 ? 'drift' : 'push', elements});
}

// The vocabulary as Claude reads it in the scene-planning prompt.
const promptGuide = () => [
  'For a generated-graphics shot also return "sketch": a drawn scene for the drawing engine, in this vocabulary only:',
  `{"background": ${BACKGROUNDS.map(item => `"${item}"`).join('|')}, "camera": ${CAMERAS.map(item => `"${item}"`).join('|')}, "elements": [up to ${MAX_ELEMENTS}, drawn in order]}`,
  `- {"kind": "figure", "pose": ${POSES.join('|')}, "x": 0-1, "y": feet 0.35-0.8, "size": s|m|l, "facing": left|right, "label"?: up to 24 chars, "accent"?: true}`,
  `- {"kind": "prop", "prop": ${PROPS.join('|')}, "x", "y": centre 0-1, "size": s|m|l, "label"?, "accent"?}`,
  '- {"kind": "text", "text": up to 40 chars, "x", "y", "size", "style": title|note|number, "accent"?}',
  '- {"kind": "arrow", "from": [x, y], "to": [x, y], "label"?}  - {"kind": "bubble", "text": up to 40 chars, "x", "y", "thought"?: true}',
  'Use one background for the whole video ("paper" unless the style is dark); change it only when the place or mood changes.',
  'Keep one clear idea per shot: a stick figure acting out the sentence, one or two props it mentions, at most one short label or number from the narration. Keep the bottom fifth of the frame clear for captions. Never write text the narration does not support.',
].join('\n');

module.exports = {VERSION, POSES, PROPS, SIZES, BACKGROUNDS, CAMERAS, MAX_ELEMENTS, validate, fromText, promptGuide};
