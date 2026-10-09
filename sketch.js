'use strict';
// P06c/P06d Drawn scenes: the closed vocabulary of a drawn shot for the stickman, hand-drawn and motion-graphics
// engines (engines.js). A shot is a built set, a cast of characters acting the line (look, pose, expression,
// emote, held prop, moves), animated props, the motion layer (kinetic text, effects), camera and a transition.
// Elements arrive on the narrator's words ("at"). Claude writes shots in this vocabulary; the free fallback
// builds one from the narration. Pure: no I/O. The drawing itself is drawn-engine.js, in the local browser.

const E = require('./engines');

const POSES = Object.freeze(['stand', 'talk', 'point', 'present', 'think', 'shock', 'cheer', 'facepalm', 'shrug', 'cross-arms', 'hands-hips', 'wave', 'walk', 'run', 'sit', 'type', 'hold', 'carry', 'phone', 'read', 'beg', 'fall', 'lie', 'sneak', 'dance', 'fist', 'cower', 'scratch-head', 'clap', 'thumbs-up', 'stop', 'jump', 'sleep', 'fight', 'reach', 'push', 'pull', 'throw', 'kneel', 'lean']);
const EXPRESSIONS = Object.freeze(['neutral', 'happy', 'grin', 'laugh', 'excited', 'sad', 'cry', 'angry', 'rage', 'scared', 'shocked', 'surprised', 'worried', 'nervous', 'smug', 'suspicious', 'confused', 'thinking', 'sleepy', 'dead', 'love', 'starstruck', 'evil', 'disgusted', 'determined', 'bored']);
const EMOTES = Object.freeze(['none', 'sweat', 'tears', 'anger', 'sparkle', 'zzz', 'hearts', 'question', 'exclamation', 'idea', 'dizzy', 'steam', 'music', 'cash', 'shine']);
const LOOK = Object.freeze({
  body: ['stick', 'creature', 'robot'],
  hair: ['none', 'short', 'messy', 'spiky', 'curly', 'long', 'bun', 'ponytail', 'mohawk', 'afro', 'bald', 'side-part', 'bob', 'pigtails'],
  hairColor: ['black', 'brown', 'blonde', 'ginger', 'grey', 'white', 'red', 'blue', 'pink', 'purple', 'green'],
  headwear: ['none', 'cap', 'beanie', 'fedora', 'top-hat', 'hard-hat', 'crown', 'chef-hat', 'graduation', 'cowboy', 'helmet', 'headband', 'party-hat', 'hood', 'beret', 'police-cap', 'wizard'],
  eyewear: ['none', 'glasses', 'sunglasses', 'monocle', 'eyepatch', 'goggles'],
  facial: ['none', 'mustache', 'beard', 'stubble', 'goatee'],
  outfit: ['none', 'tie', 'bowtie', 'scarf', 'cape', 'lab-coat', 'suit', 'apron', 'vest', 'backpack', 'badge', 'dress', 'hoodie', 'uniform'],
  mark: ['none', 'bandage', 'scar', 'freckles', 'blush'],
  color: ['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'black', 'white', 'grey', 'brown', 'gold', 'teal'],
});
const DEFAULT_LOOK = Object.freeze({body: 'stick', hair: 'messy', hairColor: 'brown', headwear: 'none', eyewear: 'none', facial: 'none', outfit: 'none', mark: 'none', color: 'blue'});
const PROPS = Object.freeze([
  'sun', 'moon', 'star', 'cloud', 'storm', 'rain', 'snow', 'bolt', 'rainbow', 'tree', 'palm', 'flower', 'mountain', 'volcano', 'waves', 'fire', 'drop', 'planet', 'globe', 'sand', 'thermometer',
  'house', 'city', 'building', 'castle', 'car', 'bus', 'truck', 'plane', 'rocket', 'ship', 'bike',
  'coin', 'money', 'moneybag', 'card', 'piggy-bank', 'briefcase', 'chart', 'chart-up', 'chart-down', 'pie-chart', 'gold', 'diamond', 'calculator',
  'laptop', 'phone', 'monitor', 'tv', 'camera', 'robot', 'battery', 'wifi', 'gear', 'lightbulb', 'magnet', 'atom', 'dna', 'microscope', 'flask', 'satellite',
  'brain', 'heart', 'eye', 'tooth', 'bone', 'pill', 'syringe', 'virus', 'skull',
  'book', 'paper', 'letter', 'newspaper', 'clock', 'hourglass', 'calendar', 'alarm', 'key', 'lock', 'gift', 'trophy', 'medal', 'flag', 'sign', 'map', 'magnifier', 'bomb', 'trash', 'box', 'bag', 'cup', 'burger', 'pizza', 'apple', 'toilet', 'bed', 'chair', 'desk', 'door', 'window', 'ladder', 'hammer', 'wrench', 'pencil', 'megaphone', 'bell', 'target', 'shield', 'sword', 'crown', 'balloon', 'candle', 'glass',
  'question', 'exclamation', 'check', 'cross', 'dollar', 'percent', 'plus', 'minus', 'arrow-up', 'arrow-down', 'warning', 'no-sign',
]);
const SETS = Object.freeze(['none', 'room', 'office', 'home', 'bedroom', 'kitchen', 'classroom', 'lab', 'hospital', 'bank', 'shop', 'street', 'city', 'road', 'park', 'nature', 'mountains', 'desert', 'beach', 'ocean', 'night', 'space', 'storm', 'stage', 'abstract']);
const MOODS = Object.freeze(['normal', 'tense', 'happy', 'dark', 'dream', 'danger', 'cold', 'money']);
const CAMERAS = Object.freeze(['still', 'push', 'pull', 'drift', 'punch', 'shake', 'pan-left', 'pan-right']);
const TRANSITIONS = Object.freeze(['cut', 'whip-left', 'whip-right', 'zoom', 'pop', 'ink', 'glitch', 'slide-up']);
const ENTERS = Object.freeze(['auto', 'pop', 'slide', 'drop', 'draw', 'fade', 'grow', 'none']);
const TEXT_STYLES = Object.freeze(['title', 'note', 'number', 'counter', 'stamp', 'highlight', 'pop', 'label', 'headline']);
const FX = Object.freeze(['burst', 'speedlines', 'flash', 'shake', 'punch', 'confetti', 'smoke', 'sparkles', 'circle', 'underline', 'cross', 'check', 'spotlight', 'money-rain', 'rain', 'snow', 'hearts', 'glow', 'shockwave', 'glitch', 'scan', 'pulse', 'ink-splat', 'progress', 'stars']);
const PROP_MOTIONS = Object.freeze(['auto', 'spin', 'pulse', 'float', 'shake', 'bounce', 'swing', 'none']);
const SIZES = Object.freeze(['s', 'm', 'l', 'xl']);
const MAX_ELEMENTS = 12, MAX_CAST = 6, MAX_THEN = 3, MAX_FOCUS = 3;
// The drawing engine's version: drawings made by an older engine are drawn again by "Draw all scenes".
const VERSION = 'drawn-scene/5';

// Common near-misses map onto the library instead of failing a whole plan.
const PROP_SYNONYMS = Object.freeze({
  cash: 'money', bill: 'money', banknote: 'money', 'dollar-bill': 'money', computer: 'laptop', pc: 'monitor', screen: 'monitor', mobile: 'phone', smartphone: 'phone', cellphone: 'phone',
  document: 'paper', file: 'paper', contract: 'paper', note: 'paper', envelope: 'letter', mail: 'letter', email: 'letter', airplane: 'plane', aeroplane: 'plane', jet: 'plane', boat: 'ship',
  earth: 'globe', world: 'globe', lightning: 'bolt', thunder: 'storm', idea: 'lightbulb', bulb: 'lightbulb', 'money-bag': 'moneybag', sack: 'moneybag', 'credit-card': 'card', graph: 'chart-up',
  stats: 'chart', statistics: 'chart', coffee: 'cup', mug: 'cup', tea: 'cup', hamburger: 'burger', chest: 'box', package: 'box', parcel: 'box', crate: 'box', potion: 'flask', poison: 'flask',
  bacteria: 'virus', germ: 'virus', medicine: 'pill', needle: 'syringe', vaccine: 'syringe', 'question-mark': 'question', 'exclamation-mark': 'exclamation', tick: 'check', x: 'cross',
  danger: 'warning', caution: 'warning', forbidden: 'no-sign', banned: 'no-sign', skyscraper: 'building', office: 'building', tower: 'building', home: 'house', automobile: 'car', taxi: 'car',
  wheel: 'gear', cog: 'gear', settings: 'gear', padlock: 'lock', present: 'gift', cup_trophy: 'trophy', award: 'trophy', notebook: 'book', diary: 'book', newspaper_: 'newspaper', watch: 'clock', timer: 'hourglass',
  explosion: 'bomb', dynamite: 'bomb', bin: 'trash', garbage: 'trash', rubbish: 'trash', food: 'burger', fruit: 'apple', bulb_: 'lightbulb', pen: 'pencil', loudspeaker: 'megaphone', speaker: 'megaphone',
  goal: 'target', bullseye: 'target', protection: 'shield', security: 'lock', king: 'crown', queen: 'crown', water: 'drop', ocean: 'waves', sea: 'waves', wave: 'waves', flame: 'fire', fireball: 'fire',
  tv_: 'tv', television: 'tv', cpu: 'gear', ai: 'robot', satellite_: 'satellite', germs: 'virus', heartbeat: 'heart', love: 'heart', mind: 'brain', head: 'brain', death: 'skull', poisoned: 'skull',
  gold_bars: 'gold', 'gold-bar': 'gold', gem: 'diamond', jewel: 'diamond', rich: 'moneybag', bank: 'building', chart_up: 'chart-up', growth: 'chart-up', decline: 'chart-down', loss: 'chart-down', pie: 'pie-chart',
});

const fail = message => { throw Object.assign(new Error(message), {status: 400}); };
const clean = (value, max) => String(value ?? '').replace(/[\x00-\x1F\x7F{}\\<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const round3 = n => Math.round(n * 1000) / 1000;

// A validator that fails on the first problem (strict, for the owner's own edits) or, for Claude's drawings,
// repairs what it can and reports each repair as a warning (lenient), so one unknown word never sinks a plan.
function checker({lenient = false, warn = () => {}} = {}) {
  const problem = (message, fallback) => { if (!lenient) fail(message); warn(message); return fallback; };
  const pick = (value, list, label, fallback) => {
    if (value === undefined || value === null || value === '') return fallback;
    if (list.includes(value)) return value;
    return problem(`${label} must be one of: ${list.join(', ')}.`, fallback);
  };
  const coord = (value, label, min, max, fallback) => {
    if (value === undefined || value === null) return fallback;
    const n = Number(value);
    if (!Number.isFinite(n)) return problem(`${label} must be a number between 0 and 1.`, fallback);
    return round3(Math.min(max, Math.max(min, n)));
  };
  return {problem, pick, coord};
}

function lookOf(raw, c, label) {
  if (raw === undefined || raw === null) return {...DEFAULT_LOOK};
  if (typeof raw !== 'object' || Array.isArray(raw)) return c.problem(`${label} look must be an object.`, {...DEFAULT_LOOK});
  return Object.fromEntries(Object.entries(LOOK).map(([key, list]) => [key, c.pick(raw[key], list, `${label} ${key}`, DEFAULT_LOOK[key])]));
}

function validateCast(raw, options = {}) {
  if (raw === undefined || raw === null) return [];
  const c = checker(options);
  if (!Array.isArray(raw)) return c.problem('The cast must be a list of characters.', []);
  const seen = new Set();
  return raw.slice(0, MAX_CAST).map((item, k) => {
    const label = `Character ${k + 1}`;
    if (!item || typeof item !== 'object') return c.problem(`${label} must be an object.`, null);
    const id = clean(item.id, 12).toLowerCase().replace(/[^a-z0-9-]/g, '') || `c${k + 1}`;
    if (seen.has(id)) return c.problem(`${label} repeats the id ${id}.`, null);
    seen.add(id);
    return {id, name: clean(item.name, 24) || `Character ${k + 1}`, role: clean(item.role, 60), look: lookOf(item.look, c, label)};
  }).filter(Boolean);
}

const phrase = value => clean(value, 40) || undefined;
const propName = value => {
  if (typeof value !== 'string') return value;
  const key = value.trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (PROPS.includes(key)) return key;
  if (PROP_SYNONYMS[key]) return PROP_SYNONYMS[key];
  if (key.endsWith('s') && PROPS.includes(key.slice(0, -1))) return key.slice(0, -1);
  return value;
};

// validate(raw, {primary, cast, lenient, warn}): the normalised drawing. `primary` is the video's primary engine,
// which decides the engines this shot may use; `cast` resolves each figure's `who` into its look.
function validate(raw, {primary = 'stickman', cast = [], lenient = false, warn = () => {}} = {}) {
  const c = checker({lenient, warn});
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('A drawn scene must be an object.');
  if (!Array.isArray(raw.elements) || !raw.elements.length) fail(`A drawn scene needs 1-${MAX_ELEMENTS} elements.`);
  if (raw.elements.length > MAX_ELEMENTS) c.problem(`A drawn scene needs 1-${MAX_ELEMENTS} elements.`);
  const engines = E.drawEngines(primary).length ? E.drawEngines(primary) : ['motion'];
  const engine = raw.engine === undefined ? engines[0] : engines.includes(raw.engine) ? raw.engine : c.problem(`This video draws with ${engines.join(' or ')}, not ${raw.engine}.`, engines[0]);
  const castMap = new Map(cast.map(item => [item.id, item]));
  const count = Math.min(raw.elements.length, MAX_ELEMENTS);
  const ref = (value, label) => {
    if (Array.isArray(value)) return value.length === 2 ? [c.coord(value[0], `${label} x`, 0.03, 0.97, 0.5), c.coord(value[1], `${label} y`, 0.05, 0.84, 0.5)] : c.problem(`${label} must be a point [x, y] or an element number.`, null);
    if (Number.isInteger(value) && value >= 1 && value <= count) return value;
    return c.problem(`${label} must be a point [x, y] or an element number 1-${count}.`, null);
  };
  const timing = (item, label) => ({...(phrase(item.at) ? {at: phrase(item.at)} : {}), ...(phrase(item.until) ? {until: phrase(item.until)} : {}), enter: c.pick(item.enter, ENTERS, `${label} enter`, 'auto')});
  const elements = [];
  raw.elements.slice(0, MAX_ELEMENTS).forEach((item, k) => {
    const label = `Element ${k + 1}`;
    if (!item || typeof item !== 'object') { c.problem(`${label} must be an object.`); return; }
    const base = {accent: item.accent === true, ...(clean(item.label, 24) ? {label: clean(item.label, 24)} : {}), ...timing(item, label)};
    if (item.kind === 'figure') {
      let who = clean(item.who, 12).toLowerCase() || undefined;
      if (who && !castMap.has(who)) who = c.problem(`${label} names ${who}, who is not in the cast.`, undefined);
      const look = who ? castMap.get(who).look : lookOf(item.look, c, label);
      const holds = item.holds ? propName(item.holds) : undefined;
      const then = (Array.isArray(item.then) ? item.then : []).slice(0, MAX_THEN).map((step, s) => {
        const at = phrase(step?.at);
        if (!step || typeof step !== 'object' || !at) return c.problem(`${label} change ${s + 1} needs "at" (the words it happens on).`, null);
        return {at, ...(step.pose !== undefined ? {pose: c.pick(step.pose, POSES, `${label} change pose`, 'stand')} : {}), ...(step.expression !== undefined ? {expression: c.pick(step.expression, EXPRESSIONS, `${label} change expression`, 'neutral')} : {}),
          ...(step.emote !== undefined ? {emote: c.pick(step.emote, EMOTES, `${label} change emote`, 'none')} : {}), ...(step.x !== undefined ? {x: c.coord(step.x, `${label} change x`, 0.06, 0.94, 0.5)} : {}),
          ...(step.facing !== undefined ? {facing: c.pick(step.facing, ['left', 'right'], `${label} change facing`, 'right')} : {})};
      }).filter(Boolean);
      elements.push({kind: 'figure', ...(who ? {who} : {}), look, pose: c.pick(item.pose, POSES, `${label} pose`, 'stand'), expression: c.pick(item.expression, EXPRESSIONS, `${label} expression`, 'neutral'), emote: c.pick(item.emote, EMOTES, `${label} emote`, 'none'),
        ...(holds ? {holds: PROPS.includes(holds) ? holds : c.problem(`${label} holds must be one of the props.`, undefined)} : {}),
        x: c.coord(item.x, `${label} x`, 0.1, 0.9, 0.3), y: c.coord(item.y, `${label} y`, 0.4, 0.84, 0.8), size: c.pick(item.size, SIZES, `${label} size`, 'm'), facing: c.pick(item.facing, ['left', 'right'], `${label} facing`, 'right'), then, ...base});
      if (elements.at(-1).holds === undefined) delete elements.at(-1).holds;
      return;
    }
    if (item.kind === 'prop') {
      const prop = propName(item.prop);
      if (!PROPS.includes(prop)) { if (!lenient) fail(`${label} prop must be one of: ${PROPS.join(', ')}.`); warn(`${label}: "${clean(item.prop, 30)}" is not in the prop library, so it was left out.`); return; }
      elements.push({kind: 'prop', prop, x: c.coord(item.x, `${label} x`, 0.05, 0.95, 0.65), y: c.coord(item.y, `${label} y`, 0.08, 0.84, 0.45), size: c.pick(item.size, SIZES, `${label} size`, 'm'), motion: c.pick(item.motion, PROP_MOTIONS, `${label} motion`, 'auto'), ...base});
      return;
    }
    if (item.kind === 'text') {
      const value = clean(item.text, 48);
      if (!value) { c.problem(`${label} needs text.`); return; }
      elements.push({kind: 'text', text: value, style: c.pick(item.style, TEXT_STYLES, `${label} style`, 'title'), x: c.coord(item.x, `${label} x`, 0.05, 0.95, 0.5), y: c.coord(item.y, `${label} y`, 0.06, 0.8, 0.16), size: c.pick(item.size, SIZES, `${label} size`, 'm'), ...base});
      return;
    }
    if (item.kind === 'arrow') {
      const from = ref(item.from, `${label} from`), to = ref(item.to, `${label} to`);
      if (from === null || to === null || from === undefined || to === undefined) { if (!lenient) fail(`${label} needs from and to points.`); warn(`${label} needs from and to points, so it was left out.`); return; }
      elements.push({kind: 'arrow', from, to, ...base});
      return;
    }
    if (item.kind === 'bubble') {
      const value = clean(item.text, 48);
      if (!value) { c.problem(`${label} needs text.`); return; }
      const on = item.on === undefined ? undefined : ref(item.on, `${label} on`);
      elements.push({kind: 'bubble', text: value, x: c.coord(item.x, `${label} x`, 0.1, 0.9, 0.5), y: c.coord(item.y, `${label} y`, 0.08, 0.7, 0.25), thought: item.thought === true, ...(Number.isInteger(on) ? {on} : {}), ...base});
      return;
    }
    if (item.kind === 'fx') {
      const effect = c.pick(item.effect, FX, `${label} effect`, null);
      if (!effect) { if (!lenient) fail(`${label} needs an effect: ${FX.join(', ')}.`); return; }
      const on = item.on === undefined ? undefined : ref(item.on, `${label} on`);
      elements.push({kind: 'fx', effect, ...(Number.isInteger(on) ? {on} : {}), x: c.coord(item.x, `${label} x`, 0.03, 0.97, 0.5), y: c.coord(item.y, `${label} y`, 0.05, 0.84, 0.45), size: c.pick(item.size, SIZES, `${label} size`, 'm'),
        ...(effect === 'progress' ? {value: Math.round(Math.min(100, Math.max(0, Number(item.value) || 0)))} : {}), ...base});
      return;
    }
    c.problem(`${label} kind must be figure, prop, text, arrow, bubble or fx.`);
  });
  if (!elements.length) fail('A drawn scene needs at least one element the engine can draw.');
  const focus = (Array.isArray(raw.focus) ? raw.focus : []).slice(0, MAX_FOCUS).map((item, k) => (item && typeof item === 'object' ? {...(phrase(item.at) ? {at: phrase(item.at)} : {}), x: c.coord(item.x, `Focus ${k + 1} x`, 0.1, 0.9, 0.5), y: c.coord(item.y, `Focus ${k + 1} y`, 0.1, 0.9, 0.5), zoom: Math.round(Math.min(2.5, Math.max(1, Number(item.zoom) || 1.4)) * 100) / 100} : c.problem(`Focus ${k + 1} must be an object.`, null))).filter(Boolean);
  return {engine, set: c.pick(raw.set, SETS, 'Set', 'none'), mood: c.pick(raw.mood, MOODS, 'Mood', 'normal'), camera: c.pick(raw.camera, CAMERAS, 'Camera', 'push'), transition: c.pick(raw.transition, TRANSITIONS, 'Transition', 'cut'), ...(focus.length ? {focus} : {}), elements};
}

// ---------------------------------------------------------------- timing on the narrator's words

const tokens = value => String(value).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').match(/[\p{L}\p{N}]+/gu) || [];
const sameWord = (a, b) => a === b || a === `${b}s` || b === `${a}s` || (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a)));
// The time (seconds from the clip start) of a phrase among the clip's words, searching forward from `from`.
function findPhrase(words, value, from = 0) {
  const want = String(value).split(/\s+/).map(word => tokens(word).join('')).filter(Boolean);
  if (!want.length) return null;
  for (const start of [from, 0]) {
    for (let k = start; k + want.length <= words.length; k++) if (want.every((token, j) => sameWord(words[k + j].token, token))) return {index: k, seconds: words[k].start};
  }
  return null;
}
// The first time a phrase is spoken among [{text, start}] words: {index, seconds}, or null.
const matchPhrase = (words, value, from = 0) => findPhrase((words || []).map(word => ({token: tokens(word.text).join(''), start: word.start})).filter(word => word.token), value, from);
// Resolves every "at"/"until" of a drawing against the words spoken during its clip: [{text, start}] with
// start in seconds from the clip's first frame. Unmatched cues stay null and the engine staggers them.
function timing(sketch, words) {
  const list = (words || []).map(word => ({token: tokens(word.text).join(''), start: Math.max(0, word.start)})).filter(word => word.token);
  let cursor = 0;
  const at = value => { if (!value) return null; const hit = findPhrase(list, value, cursor); if (!hit) return null; cursor = hit.index; return Math.round(hit.seconds * 1000) / 1000; };
  const elements = sketch.elements.map(el => ({t0: at(el.at), t1: el.until ? findPhrase(list, el.until, cursor)?.seconds ?? null : null, then: (el.then || []).map(step => at(step.at))}));
  return {elements, focus: (sketch.focus || []).map(item => at(item.at))};
}

// ---------------------------------------------------------------- the free fallback

const PROP_WORDS = [
  ['bolt', /\b(lightning|bolt|strikes?|striking|flash|spark|electric\w*)\b/], ['storm', /\b(storm|thunder\w*|clouds?)\b/], ['sun', /\b(sun|sunlight|solar)\b/], ['fire', /\b(fire|burn\w*|flames?|hot|hotter|heat)\b/],
  ['moneybag', /\b(rich|wealth\w*|fortune|million\w*|billion\w*)\b/], ['money', /\b(money|cash|dollars?|salary|income|paid|pay)\b/], ['coin', /\b(coins?|price|cost\w*|cheap|save\w*)\b/], ['chart-up', /\b(grow\w*|increase\w*|rise|rising|profit\w*)\b/],
  ['chart-down', /\b(fall\w*|drop\w*|crash\w*|loss\w*|lose)\b/], ['laptop', /\b(computer|laptop|online|internet|website\w*|hack\w*)\b/], ['phone', /\b(phone|app|apps|text\w*|call\w*)\b/], ['brain', /\b(brain|mind|think\w*|smart|memory|learn\w*)\b/],
  ['heart', /\b(heart|love\w*|alive)\b/], ['skull', /\b(death|dead|die\w*|deadly|kill\w*|poison\w*)\b/], ['lock', /\b(secret\w*|private|hidden|lock\w*)\b/], ['key', /\b(key|unlock\w*|access)\b/],
  ['globe', /\b(earth|world|globe|planet|countries)\b/], ['clock', /\b(seconds?|minutes?|hours?|time|clock)\b/], ['calendar', /\b(days?|weeks?|months?|years?)\b/], ['book', /\b(book|story|history|read\w*)\b/],
  ['city', /\b(city|cities|town)\b/], ['house', /\b(house|home)\b/], ['tree', /\b(trees?|forest|wood)\b/], ['sand', /\b(sand|desert|beach|dune)\b/], ['glass', /\b(glass|crystal)\b/],
  ['waves', /\b(sound|hear|noise|loud|shock wave|echo|ocean|sea)\b/], ['thermometer', /\b(degrees?|temperature)\b/], ['magnifier', /\b(search\w*|find|discover\w*|investigat\w*)\b/], ['lightbulb', /\b(idea|because|reason|explain\w*|means|trick)\b/],
  ['trophy', /\b(win\w*|best|champion\w*|advantage\w*)\b/], ['warning', /\b(danger\w*|warning|risk\w*|careful)\b/], ['pill', /\b(medicine|pills?|drug\w*|doctor\w*|health)\b/], ['car', /\b(car|cars|drive|driving|traffic)\b/],
].filter(([prop]) => PROPS.includes(prop));
const SET_WORDS = [['lab', /\b(science|scientist\w*|experiment\w*|lab|chemical\w*|atoms?)\b/], ['bank', /\b(bank\w*|money|loan\w*|debt|invest\w*)\b/], ['office', /\b(job|work\w*|boss|office|company|business)\b/],
  ['space', /\b(space|planet\w*|stars?|galaxy|universe|orbit)\b/], ['storm', /\b(storm|thunder\w*|lightning)\b/], ['ocean', /\b(ocean|sea|underwater|fish)\b/], ['city', /\b(city|cities|street\w*|town)\b/],
  ['hospital', /\b(doctor\w*|hospital|disease|virus|sick)\b/], ['classroom', /\b(school|teacher|student\w*|learn\w*|class)\b/], ['nature', /\b(nature|forest|trees?|animal\w*)\b/], ['desert', /\b(desert|sand|dune)\b/], ['home', /\b(home|house|family)\b/]];
const POSE_WORDS = [['shock', /\b(hotter|explode\w*|blinding|kill\w*|danger\w*|melt\w*|split|insane|crazy)\b|!/], ['think', /\b(why|how|what|wonder|imagine|count)\b|\?/], ['point', /\b(this|that|here|there|look|next|every)\b/], ['walk', /\b(creep\w*|walk\w*|travel\w*|move\w*|steps?)\b/], ['cheer', /\b(win\w*|best|success\w*|finally)\b/], ['type', /\b(computer|website\w*|online|hack\w*|type)\b/]];
const MOOD_EXPRESSION = {shock: 'shocked', think: 'thinking', point: 'excited', walk: 'determined', cheer: 'excited', type: 'determined', talk: 'happy', stand: 'neutral'};

// A deliberate, honest scene from the shot's narration: a set, the narrator character acting the line, up to two
// props it mentions (alive on their own), its number as a counter, and a motion accent on a hook.
function fromText(narration, {onScreenText = '', shotIndex = 0, purpose = 'explain', primary = 'stickman', cast = []} = {}) {
  const lower = ` ${String(narration).toLowerCase()} `;
  const props = [...new Set(PROP_WORDS.filter(([, pattern]) => pattern.test(lower)).map(([prop]) => prop))].slice(shotIndex % 2 ? 1 : 0).slice(0, 2);
  if (!props.length) props.push(purpose === 'hook' ? 'exclamation' : 'lightbulb');
  const pose = POSE_WORDS.find(([, pattern]) => pattern.test(lower))?.[0] || (shotIndex % 2 ? 'point' : 'talk');
  const left = shotIndex % 2 === 1, number = String(narration).match(/\b\d[\d,.]*%?/)?.[0];
  const engine = E.drawEngines(primary)[0] || 'motion', who = cast[0]?.id;
  const elements = [];
  if (engine !== 'motion' || cast.length) elements.push({kind: 'figure', ...(who ? {who} : {}), pose, expression: MOOD_EXPRESSION[pose] || 'neutral', x: left ? 0.72 : 0.27, y: 0.8, size: 'l', facing: left ? 'left' : 'right'});
  props.forEach((prop, k) => elements.push({kind: 'prop', prop, x: left ? 0.3 + k * 0.2 : 0.6 + k * 0.2, y: k ? 0.56 : 0.42, size: k ? 'm' : 'l', accent: k === 0}));
  const first = elements.findIndex(el => el.kind === 'prop');
  if (purpose === 'hook') elements.splice(first, 0, {kind: 'fx', effect: 'burst', on: first + 2});
  const words = clean(onScreenText, 40) || number || '';
  if (words) elements.push({kind: 'text', text: words, x: 0.5, y: 0.15, size: number && !onScreenText ? 'l' : 'm', style: number && !onScreenText ? 'counter' : 'title', accent: true});
  const set = engine === 'motion' ? 'abstract' : SET_WORDS.find(([, pattern]) => pattern.test(lower))?.[0] || 'none';
  return validate({engine, set, camera: purpose === 'hook' ? 'punch' : shotIndex % 2 ? 'drift' : 'push', transition: shotIndex === 0 && purpose !== 'hook' ? 'whip-left' : 'cut', elements}, {primary, cast});
}

// ---------------------------------------------------------------- Claude's guide

const list = values => values.join('|');
function promptGuide(primary = 'stickman') {
  const engines = E.drawEngines(primary);
  return [
    'DRAWN SHOTS (source "generated-graphics"): the program animates them from your description. You are the director, the character designer and the motion designer.',
    'Return a top-level "cast" (the same characters return across the whole video; 1-6): [{"id": "c1", "name": up to 24 chars, "role": up to 60 chars, "look": {' + Object.entries(LOOK).map(([key, values]) => `"${key}": ${list(values)}`).join(', ') + '}}].',
    'Design looks that tell the viewer who someone is at a glance: the narrator or "you" (an everyman), experts (glasses, lab-coat), rich people (suit, top-hat), workers (hard-hat), villains or a problem personified (body "creature": a dark blob with red eyes), machines (body "robot"). Give every character a distinct hair, colour or accessory. Never copy a real person or another channel\'s characters.',
    'For each drawn shot return "cue": the first words spoken when this shot starts (the picture changes on them), and "sketch":',
    `{"engine": ${list(engines)}, "set": ${list(SETS)}, "mood": ${list(MOODS)}, "camera": ${list(CAMERAS)}, "transition": ${list(TRANSITIONS)}, "focus"?: [{"at": words, "x": 0-1, "y": 0-1, "zoom": 1-2.5}] (max ${MAX_FOCUS}), "elements": [1-${MAX_ELEMENTS}, back to front]}`,
    'Every element may have "at" (the exact words from this shot\'s narration it appears on), "until" (words it leaves on) and "enter": ' + list(ENTERS) + '.',
    `- {"kind": "figure", "who": cast id, "pose": ${list(POSES)}, "expression": ${list(EXPRESSIONS)}, "emote": ${list(EMOTES)}, "holds"?: a prop, "x": 0-1, "y": feet 0.4-0.84 (ground 0.8), "size": s|m|l|xl, "facing": left|right, "then"?: [{"at": words, "pose"?, "expression"?, "emote"?, "x"? (walks there), "facing"?}] (max ${MAX_THEN}), "label"?}`,
    `- {"kind": "prop", "prop": ${list(PROPS)}, "x", "y": centre, "size": s|m|l|xl, "motion": ${list(PROP_MOTIONS)} (auto = its own life: the sun turns, coins spin, fire flickers, clocks tick), "label"?, "accent"?}`,
    `- {"kind": "text", "text": up to 48 chars, "style": ${list(TEXT_STYLES)} (counter counts up to the number in the text; stamp slams; highlight sweeps a marker; pop pops word by word), "x", "y", "size", "accent"?}`,
    `- {"kind": "fx", "effect": ${list(FX)}, "on"?: element number it targets (circle, cross, check, glow, burst, sparkles, spotlight, underline, scan), "x"?, "y"?, "size"?, "value"?: 0-100 for progress}`,
    '- {"kind": "arrow", "from": [x, y] or element number, "to": [x, y] or element number, "label"?}   - {"kind": "bubble", "text": up to 48 chars, "on": figure element number, "thought"?: true, "x", "y"}',
    'BUILD EVERY SHOT LIKE A SCENE, not a slide: (1) a set that says where we are ("none" only for a clean punch-in beat); (2) characters acting the line with a pose, an expression and, when it fits, an emote or a held prop; (3) the props the line names; (4) the motion layer: one or two effects or kinetic words tied to words with "at" (burst behind a big claim, counter for a number, cross on a myth and check on the truth, speedlines for speed, shake or punch on a shock, spotlight on a secret); (5) beats: things arrive on their words, "then" changes a pose, expression or position mid-shot, "until" removes something; (6) camera and focus to steer the eye.',
    'PACING: match the genre. Energetic explainers and listicles change the picture every 1.5-3 seconds (a new shot or a new beat) and use whip, zoom and pop openings at section changes; calm or serious topics hold longer with slow pushes. Never let a frame sit still: every shot has something that moves.',
    'MOTION SHOTS (engine motion): one hero element at size xl and the number or word big (size l or xl), filling the frame; no empty half-frame.',
    'COMPOSITION: feet on the ground line (y 0.8); text in the top third; keep the bottom 18% clear for captions; never cover a face with text; use size xl and focus zoom for reaction close-ups; alternate left/right/centre layouts and sets, never the same composition twice in a row; at most 3-4 things arriving at once. Words on screen come from the narration.',
    'Example: {"source": "generated-graphics", "query": "", "prompt": "", "motion": "static", "notes": "", "cue": "a single bolt", "sketch": {"engine": "stickman", "set": "storm", "mood": "tense", "camera": "push", "transition": "cut", "elements": [{"kind": "figure", "who": "c1", "pose": "cower", "expression": "scared", "emote": "sweat", "x": 0.28, "y": 0.8, "size": "l", "facing": "right", "then": [{"at": "hotter", "pose": "shock", "expression": "shocked"}]}, {"kind": "prop", "prop": "bolt", "x": 0.62, "y": 0.4, "size": "xl", "at": "bolt", "enter": "drop"}, {"kind": "fx", "effect": "flash", "at": "bolt"}, {"kind": "prop", "prop": "sun", "x": 0.85, "y": 0.22, "size": "m", "at": "sun"}, {"kind": "text", "text": "5x hotter", "style": "stamp", "x": 0.5, "y": 0.14, "at": "five times", "accent": true}]}}',
  ].join('\n');
}

module.exports = {VERSION, POSES, EXPRESSIONS, EMOTES, LOOK, DEFAULT_LOOK, PROPS, SETS, MOODS, CAMERAS, TRANSITIONS, ENTERS, TEXT_STYLES, FX, PROP_MOTIONS, SIZES, MAX_ELEMENTS, MAX_CAST, validate, validateCast, timing, matchPhrase, fromText, promptGuide};
