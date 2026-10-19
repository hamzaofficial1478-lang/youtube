'use strict';
// P06c/P06d Drawn scenes: the closed vocabulary of a drawn shot for the stickman, hand-drawn and motion-graphics
// engines (engines.js). A shot is a built set, a cast of characters acting the line (look, pose, expression,
// emote, held prop, moves), animated props, the motion layer (kinetic text, effects), camera and a transition.
// Elements arrive on the narrator's words ("at"). Claude writes shots in this vocabulary; the free fallback
// builds one from the narration. Pure: no I/O. The drawing itself is drawn-engine.js, in the local browser.

const E = require('./engines');
const Il = require('./illustrate');
const Kit = require('./kit');
const Maps = require('./maps');

const POSES = Object.freeze(['stand', 'talk', 'point', 'present', 'think', 'shock', 'cheer', 'facepalm', 'shrug', 'cross-arms', 'hands-hips', 'wave', 'walk', 'run', 'sit', 'type', 'hold', 'carry', 'phone', 'read', 'beg', 'fall', 'lie', 'sneak', 'dance', 'fist', 'cower', 'scratch-head', 'clap', 'thumbs-up', 'stop', 'jump', 'sleep', 'fight', 'reach', 'push', 'pull', 'throw', 'kneel', 'lean']);
const EXPRESSIONS = Object.freeze(['neutral', 'happy', 'grin', 'laugh', 'excited', 'sad', 'cry', 'angry', 'rage', 'scared', 'shocked', 'surprised', 'worried', 'nervous', 'smug', 'suspicious', 'confused', 'thinking', 'sleepy', 'dead', 'love', 'starstruck', 'evil', 'disgusted', 'determined', 'bored',
  'panic', 'terrified', 'furious', 'exhausted', 'embarrassed', 'proud', 'skeptical', 'hopeful', 'awkward', 'relieved', 'curious', 'amazed', 'jealous', 'guilty', 'sick', 'dizzy', 'focused', 'shy', 'mischievous']);
const EMOTES = Object.freeze(['none', 'sweat', 'tears', 'anger', 'sparkle', 'zzz', 'hearts', 'question', 'exclamation', 'idea', 'dizzy', 'steam', 'music', 'cash', 'shine']);
const LOOK = Object.freeze({
  body: ['stick', 'creature', 'robot'],
  hair: ['none', 'short', 'messy', 'spiky', 'curly', 'long', 'bun', 'ponytail', 'mohawk', 'afro', 'bald', 'side-part', 'bob', 'pigtails'],
  hairColor: ['black', 'brown', 'blonde', 'ginger', 'grey', 'white', 'red', 'blue', 'pink', 'purple', 'green'],
  headwear: ['none', 'cap', 'beanie', 'fedora', 'top-hat', 'hard-hat', 'crown', 'chef-hat', 'graduation', 'cowboy', 'helmet', 'headband', 'party-hat', 'hood', 'beret', 'police-cap', 'wizard', 'tricorn', 'bicorne', 'bowler', 'peaked-cap', 'spiked-helmet', 'turban', 'laurel'],
  eyewear: ['none', 'glasses', 'sunglasses', 'monocle', 'eyepatch', 'goggles'],
  facial: ['none', 'mustache', 'beard', 'stubble', 'goatee', 'handlebar'],
  outfit: ['none', 'tie', 'bowtie', 'scarf', 'cape', 'lab-coat', 'suit', 'apron', 'vest', 'backpack', 'badge', 'dress', 'hoodie', 'uniform', 'officer', 'armor', 'robe'],
  mark: ['none', 'bandage', 'scar', 'freckles', 'blush'],
  color: ['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'black', 'white', 'grey', 'brown', 'gold', 'teal'],
});
const DEFAULT_LOOK = Object.freeze({body: 'stick', hair: 'messy', hairColor: 'brown', headwear: 'none', eyewear: 'none', facial: 'none', outfit: 'none', mark: 'none', color: 'blue'});
const PROPS = Object.freeze([
  'sun', 'moon', 'star', 'cloud', 'storm', 'rain', 'snow', 'bolt', 'rainbow', 'tree', 'palm', 'flower', 'mountain', 'volcano', 'waves', 'fire', 'drop', 'planet', 'globe', 'sand', 'thermometer',
  'house', 'city', 'building', 'castle', 'car', 'bus', 'truck', 'plane', 'rocket', 'ship', 'galleon', 'bike',
  'coin', 'money', 'moneybag', 'card', 'piggy-bank', 'briefcase', 'chart', 'chart-up', 'chart-down', 'pie-chart', 'gold', 'diamond', 'calculator',
  'laptop', 'phone', 'monitor', 'tv', 'camera', 'robot', 'battery', 'wifi', 'gear', 'lightbulb', 'magnet', 'atom', 'dna', 'microscope', 'flask', 'satellite',
  'brain', 'head', 'heart', 'eye', 'tooth', 'bone', 'pill', 'syringe', 'virus', 'skull',
  'book', 'paper', 'letter', 'newspaper', 'clock', 'hourglass', 'calendar', 'alarm', 'key', 'lock', 'gift', 'trophy', 'medal', 'flag', 'sign', 'map', 'magnifier', 'bomb', 'trash', 'box', 'bag', 'cup', 'burger', 'pizza', 'apple', 'toilet', 'bed', 'chair', 'desk', 'door', 'window', 'ladder', 'hammer', 'wrench', 'pencil', 'megaphone', 'bell', 'target', 'shield', 'sword', 'crown', 'balloon', 'candle', 'glass',
  'question', 'exclamation', 'check', 'cross', 'dollar', 'percent', 'plus', 'minus', 'arrow-up', 'arrow-down', 'warning', 'no-sign',
]);
// 0.37: places of the past (owner review 2026-10-18: a king belongs in a throne room or a castle, not a room with a TV).
const SETS = Object.freeze(['none', 'room', 'office', 'home', 'bedroom', 'kitchen', 'classroom', 'lab', 'hospital', 'bank', 'shop', 'street', 'city', 'road', 'park', 'nature', 'mountains', 'desert', 'beach', 'ocean', 'night', 'space', 'storm', 'stage', 'abstract',
  'throne', 'castle', 'chamber', 'harbor', 'market', 'village', 'battlefield']);
const MOODS = Object.freeze(['normal', 'tense', 'happy', 'dark', 'dream', 'danger', 'cold', 'money', 'warm', 'sunset', 'night', 'mystery', 'calm', 'hope', 'retro']);
const CAMERAS = Object.freeze(['still', 'push', 'pull', 'drift', 'punch', 'shake', 'pan-left', 'pan-right', 'tilt-up', 'tilt-down', 'crash-zoom', 'dolly-in', 'handheld', 'ken-burns']);
const TRANSITIONS = Object.freeze(['cut', 'whip-left', 'whip-right', 'whip-up', 'whip-down', 'zoom', 'zoom-out', 'pop', 'ink', 'glitch', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'drop', 'iris', 'flash', 'shake']);
const ENTERS = Object.freeze(['auto', 'pop', 'slide', 'drop', 'draw', 'fade', 'grow', 'mask', 'swing', 'blur', 'rise', 'land', 'none']);
// 0.38 motion layer (owner request 2026-10-18; research/motion-graphics-references.md "Motion layer animation"):
// how words animate in, which depth layer a thing lives on, the shot's texture, and map styles.
const TEXT_ANIMS = Object.freeze(['auto', 'rise', 'letters', 'typewriter', 'wipe', 'slam', 'track', 'glitch', 'blur', 'focus', 'redact']);
const LAYERS = Object.freeze(['back', 'mid', 'front']);
const TEXTURES = Object.freeze(['none', 'grain', 'film', 'paper', 'grid', 'vhs', 'duotone', 'leak']);
const MAP_STYLES = Object.freeze(['auto', 'atlas', 'satellite', 'paper', 'night']);
// 0.39: film looks (engines.js FILMS) and the evidence tools' document kinds.
const FILMS = Object.freeze(Object.keys(E.FILMS));
const DOCS = Object.freeze(['newspaper', 'letter', 'report', 'post']);
// A word's colour (0.41, owner review 2026-10-19: a pale white poster behind a crowd - "why white when you have the
// choice of more appealing colours"): the style's accent or ink, or a named colour. Claude chooses it for the word's role.
const WORD_COLORS = Object.freeze(['accent', 'ink', 'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'black', 'white', 'grey', 'brown', 'gold', 'teal']);
const TEXT_STYLES = Object.freeze(['title', 'note', 'number', 'counter', 'stamp', 'highlight', 'pop', 'label', 'headline', 'chapter', 'sticky', 'tag', 'callout', 'keyword', 'versus', 'statement', 'poster']);
const FX = Object.freeze(['burst', 'speedlines', 'flash', 'shake', 'punch', 'confetti', 'smoke', 'sparkles', 'circle', 'underline', 'cross', 'check', 'spotlight', 'money-rain', 'rain', 'snow', 'hearts', 'glow', 'shockwave', 'glitch', 'scan', 'pulse', 'ink-splat', 'progress', 'stars', 'impact', 'lightning', 'explosion', 'fire', 'dust', 'wind', 'spiral', 'crack']);
// Near-miss expression names Claude uses (live 0.25 run: "curious"), drawn as the closest real face.
const FACE_NEAR = Object.freeze({wondering: 'curious', serious: 'focused', puzzled: 'confused', afraid: 'scared', anxious: 'nervous', impressed: 'amazed', astonished: 'shocked', horrified: 'terrified', joyful: 'happy', cheerful: 'happy', delighted: 'happy', calm: 'relieved', frustrated: 'angry', mad: 'furious', upset: 'sad', tired: 'exhausted', ashamed: 'guilty', envious: 'jealous', nauseous: 'sick', scheming: 'mischievous', bashful: 'shy', hopeless: 'sad', overwhelmed: 'panic'});
const FX_NEAR = Object.freeze({highlight: 'circle', sparkle: 'sparkles', star: 'stars', heart: 'hearts', boom: 'impact', pow: 'impact', bang: 'impact', bolt: 'lightning', thunder: 'lightning', flames: 'fire', flame: 'fire', puff: 'dust', breeze: 'wind', swirl: 'spiral', hypno: 'spiral', cracks: 'crack', zoom: 'punch', money: 'money-rain', splat: 'ink-splat', wave: 'shockwave', ring: 'circle', tick: 'check', 'x': 'cross'});
const PROP_MOTIONS = Object.freeze(['auto', 'spin', 'pulse', 'float', 'shake', 'bounce', 'swing', 'none']);
const SIZES = Object.freeze(['s', 'm', 'l', 'xl']);
// The cast has no creative limit: as many characters as the script needs (40 is only a sanity bound).
const MAX_ELEMENTS = 12, MAX_CAST = 40, MAX_THEN = 3, MAX_FOCUS = 3;
// The drawing engine's version: drawings made by an older engine are drawn again by "Draw all scenes".
const VERSION = 'drawn-scene/24';
// 0.33: a shot may carry one picture Claude draws for it (illustrate.js), and its own whiteboard look.
const MAX_PICTURES = 1;
const BOARDS = Object.freeze(Object.keys(E.BOARDS));
// 0.34: a stickman shot's own look, for videos that mix the stickman looks.
const STICK_LOOKS = Object.freeze(Object.keys(E.LOOKS));
// 0.35: a motion shot's own design, charts that build on the words, and timelines.
const DESIGNS = Object.freeze(Object.keys(E.DESIGNS));
const CHART_TYPES = Object.freeze(['bar', 'line', 'area', 'pie', 'donut', 'rating', 'units']);
const MAX_SERIES = 8, MAX_EVENTS = 6;
// 0.36: maps (countries, routes, pins on real geography, maps.js) and crowds (an army, a nation, a protest).
const MAP_VIEWS = Object.freeze(['fit', ...Object.keys(Maps.VIEWS)]);
const MAX_AREAS = 8, MAX_ROUTES = 4, MAX_PINS = 6, MAX_CROWD = 24;
const CROWD_POSES = Object.freeze(['stand', 'cheer', 'fist', 'shock', 'wave', 'walk', 'run', 'talk', 'cower', 'clap', 'fight']);

// Common near-misses map onto the library instead of failing a whole plan.
const PROP_SYNONYMS = Object.freeze({
  cash: 'money', bill: 'money', banknote: 'money', 'dollar-bill': 'money', computer: 'laptop', pc: 'monitor', screen: 'monitor', mobile: 'phone', smartphone: 'phone', cellphone: 'phone',
  document: 'paper', file: 'paper', contract: 'paper', note: 'paper', envelope: 'letter', mail: 'letter', email: 'letter', airplane: 'plane', aeroplane: 'plane', jet: 'plane', boat: 'ship',
  earth: 'globe', world: 'globe', 'sailing-ship': 'galleon', 'tall-ship': 'galleon', caravel: 'galleon', carrack: 'galleon', sailship: 'galleon', lightning: 'bolt', thunder: 'storm', idea: 'lightbulb', bulb: 'lightbulb', 'money-bag': 'moneybag', sack: 'moneybag', 'credit-card': 'card', graph: 'chart-up',
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

// A world-kit reference ("kit:<id>") of the right kind, or null (kit.js).
const kitRefOf = kits => (value, kind) => (typeof value === 'string' && value.startsWith('kit:') && kits[value.slice(4)]?.kind === kind ? value : null);
function lookOf(raw, c, label, kitRef = () => null) {
  if (raw === undefined || raw === null) return {...DEFAULT_LOOK};
  if (typeof raw !== 'object' || Array.isArray(raw)) return c.problem(`${label} look must be an object.`, {...DEFAULT_LOOK});
  return Object.fromEntries(Object.entries(LOOK).map(([key, list]) => [key, (key === 'outfit' && kitRef(raw[key], 'outfit')) || c.pick(raw[key], list, `${label} ${key}`, DEFAULT_LOOK[key])]));
}

function validateCast(raw, options = {}) {
  if (raw === undefined || raw === null) return [];
  const c = checker(options), kitRef = kitRefOf(options.kit || {});
  if (!Array.isArray(raw)) return c.problem('The cast must be a list of characters.', []);
  const seen = new Set();
  return raw.slice(0, MAX_CAST).map((item, k) => {
    const label = `Character ${k + 1}`;
    if (!item || typeof item !== 'object') return c.problem(`${label} must be an object.`, null);
    const id = clean(item.id, 12).toLowerCase().replace(/[^a-z0-9-]/g, '') || `c${k + 1}`;
    if (seen.has(id)) return c.problem(`${label} repeats the id ${id}.`, null);
    seen.add(id);
    return {id, name: clean(item.name, 24) || `Character ${k + 1}`, role: clean(item.role, 60), look: lookOf(item.look, c, label, kitRef)};
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
function validate(raw, {primary = 'stickman', cast = [], lenient = false, warn = () => {}, kit = null, engines: allowed = null, films = null} = {}) {
  const c = checker({lenient, warn});
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('A drawn scene must be an object.');
  // The video's world kit, and the kit a stored drawing already carries (checked again).
  const kits = {...Kit.embedded(raw.kit), ...(kit || {})}, kitRef = kitRefOf(kits);
  if (!Array.isArray(raw.elements) || !raw.elements.length) fail(`A drawn scene needs 1-${MAX_ELEMENTS} elements.`);
  if (raw.elements.length > MAX_ELEMENTS) c.problem(`A drawn scene needs 1-${MAX_ELEMENTS} elements.`);
  // The engines this video may draw with (0.37: a style on one engine allows only that engine).
  const engines = allowed?.length ? allowed : E.drawEngines(primary);
  const engine = raw.engine === undefined ? engines[0] : engines.includes(raw.engine) ? raw.engine : c.problem(`Engine must be one of: ${engines.join(', ')}.`, engines[0]);
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
    const layer = item.layer === undefined || item.layer === 'mid' ? null : c.pick(item.layer, LAYERS, `${label} layer`, null);
    const base = {accent: item.accent === true, ...(clean(item.label, 24) ? {label: clean(item.label, 24)} : {}), ...timing(item, label), ...(layer && layer !== 'mid' ? {layer} : {})};
    if (item.kind === 'figure') {
      let who = clean(item.who, 12).toLowerCase() || undefined;
      if (who && !castMap.has(who)) who = c.problem(`${label} names ${who}, who is not in the cast.`, undefined);
      const look = who ? castMap.get(who).look : lookOf(item.look, c, label, kitRef);
      const holds = item.holds ? kitRef(item.holds, 'prop') || propName(item.holds) : undefined;
      const face = (value, where) => { const near = lenient && FACE_NEAR[value]; if (near) warn(`${where} "${value}" is drawn as "${near}".`); return c.pick(near || value, EXPRESSIONS, where, 'neutral'); };
      const then = (Array.isArray(item.then) ? item.then : []).slice(0, MAX_THEN).map((step, s) => {
        const at = phrase(step?.at);
        if (!step || typeof step !== 'object' || !at) return c.problem(`${label} change ${s + 1} needs "at" (the words it happens on).`, null);
        return {at, ...(step.pose !== undefined ? {pose: c.pick(step.pose, POSES, `${label} change pose`, 'stand')} : {}), ...(step.expression !== undefined ? {expression: face(step.expression, `${label} change expression`)} : {}),
          ...(step.emote !== undefined ? {emote: c.pick(step.emote, EMOTES, `${label} change emote`, 'none')} : {}), ...(step.x !== undefined ? {x: c.coord(step.x, `${label} change x`, 0.06, 0.94, 0.5)} : {}),
          ...(step.facing !== undefined ? {facing: c.pick(step.facing, ['left', 'right'], `${label} change facing`, 'right')} : {})};
      }).filter(Boolean);
      elements.push({kind: 'figure', ...(who ? {who} : {}), look, pose: c.pick(item.pose, POSES, `${label} pose`, 'stand'), expression: face(item.expression, `${label} expression`), emote: c.pick(item.emote, EMOTES, `${label} emote`, 'none'),
        ...(holds ? {holds: PROPS.includes(holds) || kitRef(holds, 'prop') ? holds : c.problem(`${label} holds must be one of the props.`, undefined)} : {}),
        x: c.coord(item.x, `${label} x`, 0.1, 0.9, 0.3), y: c.coord(item.y, `${label} y`, 0.4, 0.84, 0.8), size: c.pick(item.size, SIZES, `${label} size`, 'm'), facing: c.pick(item.facing, ['left', 'right'], `${label} facing`, 'right'), then, ...base});
      if (elements.at(-1).holds === undefined) delete elements.at(-1).holds;
      return;
    }
    if (item.kind === 'prop') {
      const prop = kitRef(item.prop, 'prop') || propName(item.prop);
      if (!PROPS.includes(prop) && !kitRef(prop, 'prop')) { if (!lenient) fail(`${label} prop must be one of: ${PROPS.join(', ')}.`); warn(`${label}: "${clean(item.prop, 30)}" is not in the prop library, so it was left out.`); return; }
      elements.push({kind: 'prop', prop, x: c.coord(item.x, `${label} x`, 0.05, 0.95, 0.65), y: c.coord(item.y, `${label} y`, 0.08, 0.84, 0.45), size: c.pick(item.size, SIZES, `${label} size`, 'm'), motion: c.pick(item.motion, PROP_MOTIONS, `${label} motion`, 'auto'), ...(item.face === true ? {face: true} : {}), ...base});
      return;
    }
    if (item.kind === 'text') {
      // A kinetic statement is a whole sentence (key words between *stars*); other words stay short.
      const value = clean(item.text, item.style === 'statement' ? 90 : 48);
      if (!value) { c.problem(`${label} needs text.`); return; }
      const style = c.pick(item.style, TEXT_STYLES, `${label} style`, 'title'), centred = ['statement', 'poster'].includes(style);
      const animate = item.animate === undefined || item.animate === 'auto' ? null : c.pick(item.animate, TEXT_ANIMS, `${label} animate`, null);
      const color = item.color === undefined || item.color === null || item.color === '' ? null : c.pick(String(item.color).toLowerCase(), WORD_COLORS, `${label} colour`, null);
      elements.push({kind: 'text', text: value, style, x: c.coord(item.x, `${label} x`, 0.05, 0.95, 0.5), y: c.coord(item.y, `${label} y`, 0.06, 0.8, centred ? 0.45 : 0.16), size: c.pick(item.size, SIZES, `${label} size`, 'm'), ...(animate && animate !== 'auto' ? {animate} : {}), ...(color ? {color} : {}), ...base});
      return;
    }
    if (item.kind === 'arrow') {
      const from = ref(item.from, `${label} from`), to = ref(item.to, `${label} to`);
      if (from === null || to === null || from === undefined || to === undefined) { if (!lenient) fail(`${label} needs from and to points.`); warn(`${label} needs from and to points, so it was left out.`); return; }
      elements.push({kind: 'arrow', from, to, ...(item.dashed === true ? {dashed: true} : {}), ...base});
      return;
    }
    if (item.kind === 'bubble') {
      const value = clean(item.text, 48);
      if (!value) { c.problem(`${label} needs text.`); return; }
      const on = item.on === undefined ? undefined : ref(item.on, `${label} on`);
      elements.push({kind: 'bubble', text: value, x: c.coord(item.x, `${label} x`, 0.1, 0.9, 0.5), y: c.coord(item.y, `${label} y`, 0.08, 0.7, 0.25), thought: item.thought === true, ...(Number.isInteger(on) ? {on} : {}), ...base});
      return;
    }
    if (item.kind === 'chart') {
      const values = (Array.isArray(item.values) ? item.values : []).slice(0, MAX_SERIES).map(Number).filter(Number.isFinite);
      if (!values.length) { if (!lenient) fail(`${label} needs "values": 1-${MAX_SERIES} numbers.`); warn(`${label}: a chart without numbers was left out.`); return; }
      const type = c.pick(item.type, CHART_TYPES, `${label} chart type`, 'bar');
      // A unit chart is [part, whole] ("1 in 10" is [1, 10]; the whole defaults to 100).
      if (type === 'units') { const whole = values[1] ?? 100; if (values[0] < 0 || whole < values[0] || whole > 1e12) c.problem(`${label} unit chart needs [part, whole] with 0 <= part <= whole.`); values.splice(0, values.length, Math.max(0, values[0]), Math.max(values[0], Math.min(1e12, whole))); }
      const labels = (Array.isArray(item.labels) ? item.labels : []).slice(0, values.length).map(value => clean(value, 14));
      elements.push({kind: 'chart', type, values: type === 'rating' ? [Math.min(5, Math.max(0, values[0]))] : ['pie', 'donut'].includes(type) ? values.map(value => Math.max(0, value)) : values,
        ...(labels.some(Boolean) ? {labels} : {}), ...(clean(item.title, 40) ? {title: clean(item.title, 40)} : {}), ...(clean(item.unit, 6) ? {unit: clean(item.unit, 6)} : {}),
        ...(Number.isInteger(item.highlight) && item.highlight >= 0 && item.highlight < values.length ? {highlight: item.highlight} : {}), ...(type === 'units' && item.icon === 'person' ? {icon: 'person'} : {}),
        x: c.coord(item.x, `${label} x`, 0.15, 0.85, 0.5), y: c.coord(item.y, `${label} y`, 0.2, 0.75, 0.48), size: c.pick(item.size, SIZES, `${label} size`, 'l'), ...base});
      return;
    }
    if (item.kind === 'timeline') {
      const events = (Array.isArray(item.events) ? item.events : []).slice(0, MAX_EVENTS).map(event => (event && typeof event === 'object' && clean(event.label, 18) ? {label: clean(event.label, 18), ...(clean(event.when, 10) ? {when: clean(event.when, 10)} : {})} : null)).filter(Boolean);
      if (events.length < 2) { if (!lenient) fail(`${label} needs 2-${MAX_EVENTS} events with a label.`); warn(`${label}: a timeline needs two events or more, so it was left out.`); return; }
      elements.push({kind: 'timeline', events, ...(Number.isInteger(item.now) && item.now >= 0 && item.now < events.length ? {now: item.now} : {}), y: c.coord(item.y, `${label} y`, 0.25, 0.75, 0.5), ...base});
      return;
    }
    if (item.kind === 'network') {
      const nodes = (Array.isArray(item.nodes) ? item.nodes : []).slice(0, MAX_EVENTS).map(node => (node && typeof node === 'object' && clean(node.label, 18) ? {label: clean(node.label, 18), ...(node.icon && (PROPS.includes(propName(node.icon)) || kitRef(node.icon, 'prop')) ? {icon: kitRef(node.icon, 'prop') || propName(node.icon)} : {})} : null)).filter(Boolean);
      if (nodes.length < 2) { if (!lenient) fail(`${label} needs 2-${MAX_EVENTS} nodes with a label.`); warn(`${label}: a network needs two nodes or more, so it was left out.`); return; }
      const links = (Array.isArray(item.links) ? item.links : []).slice(0, 12).filter(pair => Array.isArray(pair) && pair.length === 2 && pair.every(n => Number.isInteger(n) && n >= 1 && n <= nodes.length) && pair[0] !== pair[1]);
      elements.push({kind: 'network', nodes, links, x: c.coord(item.x, `${label} x`, 0.2, 0.8, 0.5), y: c.coord(item.y, `${label} y`, 0.25, 0.7, 0.46), size: c.pick(item.size, SIZES, `${label} size`, 'l'), ...base});
      return;
    }
    if (item.kind === 'crowd') {
      const colors = (Array.isArray(item.colors) ? item.colors : [item.colors]).filter(Boolean).slice(0, 3).map(color => c.pick(color, LOOK.color, `${label} colour`, null)).filter(Boolean);
      const banner = clean(item.banner, 24);
      elements.push({kind: 'crowd', count: Math.round(Math.min(MAX_CROWD, Math.max(3, Number(item.count) || 9))), pose: c.pick(item.pose, CROWD_POSES, `${label} pose`, 'stand'), expression: c.pick((lenient && FACE_NEAR[item.expression]) || item.expression, EXPRESSIONS, `${label} expression`, 'neutral'),
        ...(colors.length ? {colors} : {}), headwear: c.pick(item.headwear, LOOK.headwear, `${label} headwear`, 'none'), ...(banner ? {banner} : {}),
        x: c.coord(item.x, `${label} x`, 0.15, 0.85, 0.5), y: c.coord(item.y, `${label} y`, 0.55, 0.9, 0.82), width: c.coord(item.width, `${label} width`, 0.2, 1, 0.6), size: c.pick(item.size, ['s', 'm'], `${label} size`, 's'), facing: c.pick(item.facing, ['left', 'right'], `${label} facing`, 'right'), ...base});
      return;
    }
    if (item.kind === 'map') {
      if (elements.some(el => el.kind === 'map')) { if (!lenient) fail('A shot holds one map.'); warn(`${label}: a shot holds one map; the extra one was left out.`); return; }
      // A map that was checked before (stored in a plan, drawn again at render) carries its steps and fitted view:
      // read them back as areas, routes and pins in the same order, so checking twice gives the same map.
      if (Array.isArray(item.steps) && !item.areas && !item.routes && !item.pins) {
        const of = type => item.steps.filter(step => step?.type === type);
        item = {...item, areas: of('area'), routes: of('route'), pins: of('pin')};
      }
      const where = (value, what) => { const at = Maps.place(value); if (!at) c.problem(`${what}: "${clean(Array.isArray(value) ? value.join(', ') : value, 40)}" is not a country on the map (or [longitude, latitude]).`); return at; };
      const steps = [], named = [], points = [];
      (Array.isArray(item.areas) ? item.areas : []).slice(0, MAX_AREAS).forEach((area, k) => {
        const names = (Array.isArray(area?.countries) ? area.countries : [area?.countries ?? area?.country]).filter(Boolean).slice(0, 20);
        const countries = [...new Set(names.map(name => Maps.country(name) || c.problem(`${label} area ${k + 1}: "${clean(name, 40)}" is not a country on the map (today's countries).`, null)).filter(Boolean))];
        if (!countries.length) return;
        named.push(...countries);
        steps.push({type: 'area', countries, ...(clean(area.label, 24) ? {label: clean(area.label, 24)} : {}), color: c.pick(area.color, LOOK.color, `${label} area colour`, ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'teal', 'pink'][k % 8]),
          ...(area.face ? {face: c.pick((lenient && FACE_NEAR[area.face]) || area.face, EXPRESSIONS, `${label} area face`, 'neutral')} : {}), ...(area.zoom === true ? {zoom: true} : {}), ...(phrase(area.at) ? {at: phrase(area.at)} : {})});
      });
      (Array.isArray(item.routes) ? item.routes : []).slice(0, MAX_ROUTES).forEach((route, k) => {
        const from = where(route?.from, `${label} route ${k + 1} from`), to = where(route?.to, `${label} route ${k + 1} to`);
        if (!from || !to) return;
        points.push(from, to);
        const icon = route.icon ? propName(route.icon) : null;
        steps.push({type: 'route', from, to, ...(clean(route.label, 24) ? {label: clean(route.label, 24)} : {}), ...(icon && PROPS.includes(icon) ? {icon} : icon ? c.problem(`${label} route ${k + 1} icon must be one of the props.`, {}) : {}), ...(phrase(route.at) ? {at: phrase(route.at)} : {})});
      });
      (Array.isArray(item.pins) ? item.pins : []).slice(0, MAX_PINS).forEach((pin, k) => {
        const at = where(pin?.place, `${label} pin ${k + 1}`);
        if (!at) return;
        points.push(at);
        steps.push({type: 'pin', place: at, ...(clean(pin.label, 24) ? {label: clean(pin.label, 24)} : {}), ...(pin.zoom === true ? {zoom: true} : {}), ...(phrase(pin.at) ? {at: phrase(pin.at)} : {})});
      });
      const box = Array.isArray(item.view) && item.view.length === 4 && item.view.every(Number.isFinite) && item.view[2] > item.view[0] && item.view[3] > item.view[1] ? [Math.max(-200, item.view[0]), Math.max(-60, item.view[1]), Math.min(200, item.view[2]), Math.min(84, item.view[3])] : null;
      const view = box ? 'box' : c.pick(item.view, MAP_VIEWS, `${label} view`, 'fit');
      if (!steps.length && view === 'fit') { if (!lenient) fail(`${label} needs countries, routes or pins, or a view.`); warn(`${label}: a map with nothing on it was left out.`); return; }
      const mapStyle = item.style === undefined || item.style === 'auto' ? null : c.pick(item.style, MAP_STYLES, `${label} style`, null);
      elements.push({kind: 'map', view: box || (view === 'fit' ? Maps.fit(named, points) : [...Maps.VIEWS[view]]), steps, ...(mapStyle && mapStyle !== 'auto' ? {style: mapStyle} : {}), x: c.coord(item.x, `${label} x`, 0.15, 0.85, 0.5), y: c.coord(item.y, `${label} y`, 0.2, 0.75, 0.48), size: c.pick(item.size, SIZES, `${label} size`, 'xl'), ...base});
      return;
    }
    if (item.kind === 'picture') {
      const describe = clean(item.describe ?? item.prompt, Il.LIMITS.describe);
      if (!describe || describe.length < 10) { if (!lenient) fail(`${label} needs "describe": what the picture shows (10-${Il.LIMITS.describe} characters).`); warn(`${label}: a picture without a description was left out.`); return; }
      if (elements.filter(el => el.kind === 'picture').length >= MAX_PICTURES) { if (!lenient) fail(`A shot holds at most ${MAX_PICTURES} picture.`); warn(`${label}: a shot holds one picture; the extra one was left out.`); return; }
      // The drawing itself comes from the illustrator (or a stored plan) and is checked again every time.
      let art;
      if (item.art !== undefined) { const checked = Il.validateArt(item.art, {outlines: false}); art = checked.art; if (!art) { if (!lenient) fail(`${label} picture: ${checked.issues[0]}`); warn(`${label}: its picture did not pass its checks (${checked.issues[0]}), so it will be drawn again.`); } }
      elements.push({kind: 'picture', describe, x: c.coord(item.x, `${label} x`, 0.15, 0.85, 0.5), y: c.coord(item.y, `${label} y`, 0.2, 0.75, 0.46), size: c.pick(item.size, SIZES, `${label} size`, 'l'), ...(art ? {art} : {}), ...base});
      return;
    }
    // 0.39 evidence and measuring tools: the words and numbers are the narration's own.
    if (item.kind === 'quote') {
      const words = clean(item.text, 140);
      if (!words) { if (!lenient) fail(`${label} needs the quoted words.`); warn(`${label}: a quote without words was left out.`); return; }
      let who = clean(item.who, 12).toLowerCase() || undefined;
      if (who && !castMap.has(who)) who = c.problem(`${label} names ${who}, who is not in the cast.`, undefined);
      elements.push({kind: 'quote', text: words, ...(clean(item.name, 24) ? {name: clean(item.name, 24)} : {}), ...(who ? {who} : {}), look: who ? castMap.get(who).look : lookOf(item.look, c, label, kitRef),
        expression: c.pick((lenient && FACE_NEAR[item.expression]) || item.expression, EXPRESSIONS, `${label} expression`, 'neutral'), ...(clean(item.source, 40) ? {source: clean(item.source, 40)} : {}),
        x: c.coord(item.x, `${label} x`, 0.15, 0.85, 0.5), y: c.coord(item.y, `${label} y`, 0.2, 0.75, 0.45), size: c.pick(item.size, SIZES, `${label} size`, 'l'), ...base});
      return;
    }
    if (item.kind === 'document') {
      const headline = clean(item.headline, 70), line = clean(item.line, 90);
      if (!headline && !line) { if (!lenient) fail(`${label} needs a headline or a line.`); warn(`${label}: a document without a headline or a line was left out.`); return; }
      elements.push({kind: 'document', doc: c.pick(item.doc, DOCS, `${label} document`, 'report'), ...(clean(item.source, 30) ? {source: clean(item.source, 30)} : {}), ...(headline ? {headline} : {}), ...(line ? {line} : {}),
        x: c.coord(item.x, `${label} x`, 0.15, 0.85, 0.5), y: c.coord(item.y, `${label} y`, 0.2, 0.75, 0.46), size: c.pick(item.size, SIZES, `${label} size`, 'm'), ...base});
      return;
    }
    if (item.kind === 'gauge') {
      const value = Number(item.value), steps = item.steps === undefined || item.steps === null ? null : Math.round(Number(item.steps));
      if (!Number.isFinite(value)) { if (!lenient) fail(`${label} needs a "value" (a number the narration says).`); warn(`${label}: a dial without a value was left out.`); return; }
      if (steps !== null && !(steps >= 2 && steps <= 12)) { if (!lenient) fail(`${label} steps must be 2-12.`); warn(`${label}: a list dial needs 2-12 steps, so it was left out.`); return; }
      const min = Number.isFinite(Number(item.min)) ? Number(item.min) : 0, max = Number.isFinite(Number(item.max)) && Number(item.max) > min ? Number(item.max) : Math.max(100, min + 1);
      elements.push({kind: 'gauge', value: steps ? Math.min(steps, Math.max(1, Math.round(value))) : value, ...(steps ? {steps} : {min, max}), ...(clean(item.unit, 6) ? {unit: clean(item.unit, 6)} : {}),
        x: c.coord(item.x, `${label} x`, 0.15, 0.85, 0.5), y: c.coord(item.y, `${label} y`, 0.2, 0.75, 0.46), size: c.pick(item.size, SIZES, `${label} size`, 'm'), ...base});
      return;
    }
    if (item.kind === 'loupe') {
      const on = ref(item.on, `${label} on`);
      if (on === null || on === undefined || on === k + 1) { if (!lenient) fail(`${label} needs "on": the element number or [x, y] it magnifies.`); warn(`${label}: a loupe without a spot to magnify was left out.`); return; }
      elements.push({kind: 'loupe', on, zoom: Math.round(Math.min(4, Math.max(1.5, Number(item.zoom) || 2.5)) * 10) / 10, x: c.coord(item.x, `${label} x`, 0.12, 0.88, 0.76), y: c.coord(item.y, `${label} y`, 0.15, 0.78, 0.36), size: c.pick(item.size, SIZES, `${label} size`, 'm'), ...base});
      return;
    }
    if (item.kind === 'ruler') {
      const from = ref(item.from, `${label} from`), to = ref(item.to, `${label} to`);
      if (from === null || to === null || from === undefined || to === undefined) { if (!lenient) fail(`${label} needs from and to points.`); warn(`${label} needs from and to points, so it was left out.`); return; }
      elements.push({kind: 'ruler', from, to, ...(clean(item.value, 20) ? {value: clean(item.value, 20)} : {}), ...base});
      return;
    }
    if (item.kind === 'fx') {
      // A near-miss name keeps Claude's intent (named in the warnings); an owner edit must use the real name.
      const near = lenient && FX_NEAR[item.effect];
      if (near) warn(`${label} effect "${item.effect}" is drawn as "${near}".`);
      const effect = c.pick(near || item.effect, FX, `${label} effect`, null);
      if (!effect) { if (!lenient) fail(`${label} needs an effect: ${FX.join(', ')}.`); return; }
      const on = item.on === undefined ? undefined : ref(item.on, `${label} on`);
      elements.push({kind: 'fx', effect, ...(Number.isInteger(on) ? {on} : {}), x: c.coord(item.x, `${label} x`, 0.03, 0.97, 0.5), y: c.coord(item.y, `${label} y`, 0.05, 0.84, 0.45), size: c.pick(item.size, SIZES, `${label} size`, 'm'),
        ...(effect === 'progress' ? {value: Math.round(Math.min(100, Math.max(0, Number(item.value) || 0)))} : {}), ...base});
      return;
    }
    c.problem(`${label} kind must be figure, prop, text, arrow, bubble, picture, chart, timeline, network, map, crowd, quote, document, gauge, loupe, ruler or fx.`);
  });
  if (!elements.length) fail('A drawn scene needs at least one element the engine can draw.');
  const focus = (Array.isArray(raw.focus) ? raw.focus : []).slice(0, MAX_FOCUS).map((item, k) => (item && typeof item === 'object' ? {...(phrase(item.at) ? {at: phrase(item.at)} : {}), x: c.coord(item.x, `Focus ${k + 1} x`, 0.1, 0.9, 0.5), y: c.coord(item.y, `Focus ${k + 1} y`, 0.1, 0.9, 0.5), zoom: Math.round(Math.min(2.5, Math.max(1, Number(item.zoom) || 1.4)) * 100) / 100} : c.problem(`Focus ${k + 1} must be an object.`, null))).filter(Boolean);
  const set = kitRef(raw.set, 'set') || c.pick(raw.set, SETS, 'Set', 'none');
  const used = [set, ...elements.flatMap(item => [item.prop, item.holds, item.look?.outfit])].filter(value => typeof value === 'string' && value.startsWith('kit:'));
  const carried = Object.fromEntries([...new Set(used)].map(ref => [ref.slice(4), kits[ref.slice(4)]]));
  return {...(used.length ? {kit: carried} : {}), engine, set, ...(raw.board !== undefined ? {board: c.pick(raw.board, BOARDS, 'Whiteboard look', 'cartoon')} : {}), ...(raw.look !== undefined ? {look: c.pick(raw.look, STICK_LOOKS, 'Stickman look', 'classic')} : {}), ...(raw.design !== undefined ? {design: c.pick(raw.design, DESIGNS, 'Motion design', 'vector')} : {}), ...(raw.holdSet === true ? {holdSet: true} : {}), ...(raw.texture !== undefined && raw.texture !== 'none' ? {texture: c.pick(raw.texture, TEXTURES, 'Texture', 'none')} : {}), ...(raw.film !== undefined && raw.film !== null ? (film => (film ? {film} : {}))(raw.film === 'none' ? 'none' : (films || FILMS).includes(raw.film) ? raw.film : c.problem(FILMS.includes(raw.film) ? `The film look ${raw.film} is not this style's.` : `Film look must be one of: ${FILMS.join(', ')}.`, null)) : {}), mood: c.pick(raw.mood, MOODS, 'Mood', 'normal'), camera: c.pick(raw.camera, CAMERAS, 'Camera', 'push'), transition: c.pick(raw.transition, TRANSITIONS, 'Transition', 'cut'), ...(focus.length ? {focus} : {}), elements};
}

// A scene's setting: the place and feeling its drawn shots share unless a shot names another.
function validateSetting(raw, {strict = false, kit = null} = {}) {
  const c = checker({lenient: !strict});
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return c.problem('A setting must be an object with a set and a mood.', {set: 'none', mood: 'normal'});
  return {set: kitRefOf(kit || {})(raw.set, 'set') || c.pick(raw.set, SETS, 'Setting set', 'none'), mood: c.pick(raw.mood, MOODS, 'Setting mood', 'normal')};
}

// World notes (P06j, owner review 2026-10-11: "the sailor was under water"): plain physics and the story's era.
// People on the ocean set stand on the sea floor, which is right only for diving; modern things do not exist in a
// prehistoric, ancient or medieval story unless the line itself is about today. Notes for the owner and the
// continuity review; worldMend moves people who were left under water to the beach (the sea surface).
const DIVING = /\b(dive[sd]?|diving|divers?|underwater|under water|scuba|snorkel\w*|sea ?floor|seabed|ocean floor|submarine|coral|reefs?|swim\w*|deep sea)\b/i;
const NOWADAYS = /\b(today|nowadays|these days|modern|now)\b/i;
const OLD_ERAS = ['prehistoric', 'ancient', 'medieval', 'early-modern'];
// A place of today in a story of the past becomes that world's place (0.37: the pepper demo's king stood in a room
// with a TV and a floor lamp).
const PAST_PLACE = Object.freeze({room: 'chamber', home: 'chamber', bedroom: 'chamber', kitchen: 'chamber', office: 'chamber', classroom: 'chamber', lab: 'chamber', hospital: 'chamber', bank: 'chamber', shop: 'market', street: 'village', city: 'village', road: 'village'});
const MODERN = Object.freeze({props: ['ship', 'car', 'bus', 'truck', 'plane', 'rocket', 'bike', 'card', 'calculator', 'laptop', 'phone', 'monitor', 'tv', 'camera', 'robot', 'battery', 'wifi', 'lightbulb', 'microscope', 'satellite', 'syringe', 'pill', 'newspaper', 'alarm', 'burger', 'pizza', 'megaphone', 'toilet', 'chart', 'chart-up', 'chart-down', 'pie-chart'],
  outfits: ['tie', 'bowtie', 'lab-coat', 'suit', 'backpack', 'badge', 'hoodie', 'uniform'], sets: Object.keys(PAST_PLACE)});
const underWater = item => item.sketch?.set === 'ocean' && item.sketch.elements.some(el => el.kind === 'figure') && !DIVING.test(`${item.words || ''} ${item.notes || ''}`);
function worldNotes(drawn, world = null) {
  const notes = [];
  for (const item of drawn) {
    if (!item.sketch) continue;
    if (underWater(item)) notes.push(`${item.label}: people stand on the sea floor here (the ocean set is under water); put them on beach or storm with ship and waves props, or on a kit set, unless the line is about diving.`);
    if (!OLD_ERAS.includes(world?.era) || NOWADAYS.test(item.words || '')) continue;
    const els = item.sketch.elements;
    const odd = [...new Set([...els.flatMap(el => [el.prop, el.holds]).filter(name => MODERN.props.includes(name)), ...els.map(el => el.look?.outfit).filter(name => MODERN.outfits.includes(name)), ...(MODERN.sets.includes(item.sketch.set) ? [`the ${item.sketch.set} set`] : [])])];
    if (odd.length) notes.push(`${item.label}: ${odd.join(', ')} ${odd.length === 1 ? 'does' : 'do'} not exist in a ${world.era} story; draw what that world has (or a kit item).`);
  }
  return notes;
}
function worldMend(drawn, world = null) {
  const fixes = drawn.filter(underWater).map(item => { item.sketch.set = 'beach'; return {label: item.label, fix: 'People stood on the sea floor (the ocean set is under water), so the shot moved to the beach, at the sea surface.'}; });
  if (OLD_ERAS.includes(world?.era)) for (const item of drawn) {
    const was = item.sketch?.set, now = PAST_PLACE[was];
    if (!now || NOWADAYS.test(item.words || '')) continue;
    item.sketch.set = now;
    fixes.push({label: item.label, fix: `The ${was} set is a place of today, so this ${world.era} story moved it to the ${now}.`});
  }
  return fixes;
}

// Continuity notes across neighbouring drawn shots: a change of place inside one scene, and a character who
// jumps to the other side of the screen and turns round without walking there. Warnings for the owner and
// the continuity review; the drawing itself is never changed here.
// Words that take a story to each place: a shot may change place when its own words (or its notes) go there.
const PLACE_WORDS = Object.freeze({room: ['room'], office: ['office', 'desk', 'boss', 'meeting'], home: ['home', 'house', 'sofa', 'couch'], bedroom: ['bed', 'bedroom', 'sleep', 'asleep'],
  kitchen: ['kitchen', 'cook', 'fridge', 'oven', 'meal'], classroom: ['class', 'classroom', 'school', 'teacher', 'student', 'lesson'], lab: ['lab', 'laboratory', 'experiment', 'scientist'],
  hospital: ['hospital', 'doctor', 'nurse', 'patient'], bank: ['bank', 'loan', 'vault', 'savings'], shop: ['shop', 'store', 'buy', 'customer'], street: ['street', 'sidewalk', 'corner'],
  city: ['city', 'town', 'building', 'downtown'], road: ['road', 'car', 'drive', 'highway', 'traffic'], park: ['park', 'bench', 'playground'], nature: ['nature', 'tree', 'forest', 'field', 'grass', 'wild'],
  mountains: ['mountain', 'hill', 'peak', 'climb'], desert: ['desert', 'dune', 'sand'], beach: ['beach', 'sand', 'shore', 'coast', 'sea'], ocean: ['ocean', 'sea', 'ship', 'boat', 'wave', 'underwater'],
  night: ['night', 'midnight', 'moon'], space: ['space', 'planet', 'earth', 'orbit', 'satellite'], storm: ['storm', 'lightning', 'thunder', 'rain', 'cloud', 'bolt'], stage: ['stage', 'show', 'audience', 'crowd'],
  throne: ['king', 'queen', 'throne', 'court', 'emperor', 'empress', 'sultan', 'palace'], castle: ['castle', 'fortress', 'fort', 'kingdom', 'empire', 'walls'], chamber: ['chamber', 'study', 'hall', 'room'],
  harbor: ['harbor', 'harbour', 'port', 'dock', 'ship', 'ships', 'fleet', 'sail'], market: ['market', 'bazaar', 'merchant', 'trade', 'trader', 'sell', 'buy', 'spice'], village: ['village', 'town', 'peasant', 'farm', 'farmer'],
  battlefield: ['battle', 'war', 'army', 'armies', 'soldier', 'soldiers', 'fight', 'invade', 'invasion']});
// Continuity between neighbouring drawn shots of one scene: [{kind, shot, previous, figure?, message}].
// shots: [{label, sceneId, sketch, words?, notes?}] in order. A graphic beat in another engine or on an abstract
// backdrop is a deliberate insert, not a change of place; a change of place the shot's words or notes go to is
// the story moving.
function continuityIssues(shots, cast = []) {
  const issues = [], name = id => cast.find(item => item.id === id)?.name || id;
  const goesThere = (shot, set) => { const said = tokens(`${shot.words || ''} ${shot.notes || ''}`); return [set, ...(PLACE_WORDS[set] || [])].some(word => said.some(token => sameWord(token, word))); };
  for (let k = 1; k < shots.length; k++) {
    const a = shots[k - 1], b = shots[k];
    if (!a.sketch || !b.sketch || a.sceneId !== b.sceneId) continue;
    const insert = a.sketch.engine !== b.sketch.engine || [a.sketch.set, b.sketch.set].includes('abstract');
    if (!insert && a.sketch.set !== 'none' && b.sketch.set !== 'none' && a.sketch.set !== b.sketch.set && !goesThere(b, b.sketch.set)) issues.push({kind: 'place', shot: b, previous: a, message: `${b.label} moves from the ${a.sketch.set} to the ${b.sketch.set} inside one scene; keep the place unless the words move.`});
    for (const fig of b.sketch.elements.filter(el => el.kind === 'figure' && el.who)) {
      const before = a.sketch.elements.find(el => el.kind === 'figure' && el.who === fig.who);
      if (before && (before.x < 0.5) !== (fig.x < 0.5) && before.facing !== fig.facing) issues.push({kind: 'side', shot: b, previous: a, figure: fig, before, message: `${name(fig.who)} jumps to the other side of the screen and turns round between ${a.label} and ${b.label}.`});
    }
  }
  return issues;
}
const continuity = (shots, cast = []) => continuityIssues(shots, cast).map(issue => issue.message);
// Fixes what continuity finds, in order (a fixed shot is the next shot's neighbour): the place stays the scene's
// place, and a character who changes sides keeps facing the same way (screen direction holds). Changes the
// given sketches; returns [{label, fix}]. Used on Claude's and the free plans, never on the owner's own edits.
function mend(shots, cast = []) {
  const fixes = [], name = id => cast.find(item => item.id === id)?.name || id;
  for (let k = 1; k < shots.length; k++) {
    for (const issue of continuityIssues(shots.slice(k - 1, k + 1), cast)) {
      if (issue.kind === 'place') { fixes.push({label: issue.shot.label, fix: `Kept the ${issue.previous.sketch.set}: its words do not move the story to the ${issue.shot.sketch.set}.`}); issue.shot.sketch.set = issue.previous.sketch.set; }
      else { issue.figure.facing = issue.before.facing; fixes.push({label: issue.shot.label, fix: `${name(issue.figure.who)} keeps facing ${issue.before.facing} after changing sides, so the direction on screen holds.`}); }
    }
    fixes.push(...carryOne(shots[k - 1], shots[k], name));
  }
  // Two characters with nothing between them on the ground stand together: far apart they stay small at the
  // edges with dead space in the middle.
  for (const shot of shots) {
    const figs = shot.sketch?.elements.filter(el => el.kind === 'figure') || [];
    if (figs.length !== 2) continue;
    const [a, b] = [...figs].sort((p, q) => p.x - q.x), gap = b.x - a.x;
    if (gap <= 0.5 || shot.sketch.elements.some(el => !['figure', 'fx'].includes(el.kind) && (el.x ?? 0.5) > a.x + 0.08 && (el.x ?? 0.5) < b.x - 0.08 && (el.y ?? 0.5) > 0.5)) continue;
    const mid = (a.x + b.x) / 2, k = 0.4 / gap, move = x => round3(mid + (x - mid) * k);
    for (const fig of figs) { fig.x = move(fig.x); for (const step of fig.then || []) if (step.x !== undefined) step.x = move(step.x); }
    fixes.push({label: shot.label, fix: `${name(a.who)} and ${name(b.who)} stand closer together, so they fill the frame.`});
  }
  return fixes;
}
// A character already on screen in the shot before stays there from the first frame, not popping in again.
function carryOne(a, b, name) {
  if (!a?.sketch || !b?.sketch || a.sceneId !== b.sceneId) return [];
  const fixes = [];
  for (const fig of b.sketch.elements.filter(el => el.kind === 'figure' && el.who && (el.at || !['auto', 'none'].includes(el.enter || 'auto')))) {
    if (!a.sketch.elements.some(el => el.kind === 'figure' && el.who === fig.who)) continue;
    delete fig.at; fig.enter = 'none';
    fixes.push({label: b.label, fix: `${name(fig.who)} stays on screen from ${a.label} instead of appearing again.`});
  }
  return fixes;
}
// Only the carry (never a change of place or position), for drawings of an existing plan at render time.
// A shot in the same place as the shot before keeps that place on screen from its first frame (holdSet): the pen
// only draws a new place, so a cut on the same street never flashes white (demo review 2026-10-16).
function carry(shots, cast = []) {
  const name = id => cast.find(item => item.id === id)?.name || id;
  shots.forEach((shot, k) => { if (k && shot.sketch && shots[k - 1].sketch && shot.sketch.set !== 'none' && shot.sketch.set === shots[k - 1].sketch.set) shot.sketch.holdSet = true; });
  return shots.flatMap((shot, k) => (k ? carryOne(shots[k - 1], shot, name) : []));
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
  const elements = sketch.elements.map(el => ({t0: at(el.at), t1: el.until ? findPhrase(list, el.until, cursor)?.seconds ?? null : null, then: (el.then || el.steps || []).map(step => at(step.at))}));
  return {elements, focus: (sketch.focus || []).map(item => at(item.at))};
}

// ---------------------------------------------------------------- the free fallback

// Free planner (audit 2026-10-19): a year is a date, not a count; many people are a crowd; nothing named takes turns.
const YEAR = /^(1[0-9]{3}|20[0-9]{2}|21[0-9]{2})$/;
const PEOPLE = /\b(employees|workers|people|investors|soldiers|army|armies|crowds?|citizens|voters|customers|traders|shareholders|population)\b/;
const FALLBACK_PROPS = ['lightbulb', 'question', 'magnifier', 'target', 'key'];
const PROP_WORDS = [
  ['ship', /\b(ships?|boats?|fleet|voyages?)\b/], ['shield', /\b(insur\w*|protect\w*)\b/], ['pie-chart', /\b(shares?|pieces?|split\w*|portions?)\b/], ['crown', /\b(king|queen|emperor|royal)\b/], ['sword', /\b(army|armies|soldiers?|war)\b/],
  ['bolt', /\b(lightning|bolt|strikes?|striking|flash|spark|electric\w*)\b/], ['storm', /\b(storm|thunder\w*|clouds?)\b/], ['sun', /\b(sun|sunlight|solar)\b/], ['fire', /\b(fire|burn\w*|flames?|hot|hotter|heat)\b/],
  ['moneybag', /\b(rich|wealth\w*|fortune|million\w*|billion\w*)\b/], ['money', /\b(money|cash|dollars?|salary|income|paid|pay)\b/], ['coin', /\b(coins?|price|cost\w*|cheap|save\w*)\b/], ['chart-down', /\b(fall\w*|drop\w*|crash\w*|loss\w*|lose|wipe\w*|ruin\w*)\b/], ['chart-up', /\b(grow\w*|increase\w*|rise|rising|profit\w*)\b/],
  ['laptop', /\b(computer|laptop|online|internet|website\w*|hack\w*)\b/], ['phone', /\b(phone|app|apps|text\w*|call\w*)\b/], ['brain', /\b(brain|mind|think\w*|smart|memory|learn\w*)\b/],
  ['heart', /\b(heart|love\w*|alive)\b/], ['skull', /\b(death|dead|die\w*|deadly|kill\w*|poison\w*)\b/], ['lock', /\b(secret\w*|private|hidden|lock\w*)\b/], ['key', /\b(key|unlock\w*|access)\b/],
  ['globe', /\b(earth|world|globe|planet|countries)\b/], ['clock', /\b(seconds?|minutes?|hours?|time|clock)\b/], ['calendar', /\b(days?|weeks?|months?|years?)\b/], ['book', /\b(book|story|history|read\w*)\b/],
  ['city', /\b(city|cities|town)\b/], ['house', /\b(house|home)\b/], ['tree', /\b(trees?|forest|wood)\b/], ['sand', /\b(sand|desert|beach|dune)\b/], ['glass', /\b(glass|crystal)\b/],
  ['waves', /\b(sound|hear|noise|loud|shock wave|echo|ocean|sea|seas)\b/], ['thermometer', /\b(degrees?|temperature)\b/], ['magnifier', /\b(search\w*|find|discover\w*|investigat\w*)\b/], ['lightbulb', /\b(idea|because|reason|explain\w*|means|trick)\b/],
  ['trophy', /\b(win\w*|best|champion\w*|advantage\w*)\b/], ['warning', /\b(danger\w*|warning|risk\w*|careful)\b/], ['pill', /\b(medicine|pills?|drug\w*|doctor\w*|health)\b/], ['car', /\b(car|cars|drive|driving|traffic)\b/],
].filter(([prop]) => PROPS.includes(prop));
const SET_WORDS = [['throne', /\b(king|queen|emperor|empress|throne|sultan|royal)\b/], ['battlefield', /\b(battle\w*|armies|army|soldiers?|invad\w*|war)\b/], ['storm', /\b(lost at sea|sank|sink\w*|shipwreck\w*|wreck\w*)\b/], ['harbor', /\b(harbou?r|port|fleet|sail\w*|voyages?|ships?|sailors?|sea)\b/], ['market', /\b(market|bazaar|merchants?|spices?)\b/], ['castle', /\b(castle|fortress|kingdom|empire)\b/],
  ['lab', /\b(science|scientist\w*|experiment\w*|lab|chemical\w*|atoms?)\b/], ['bank', /\b(bank\w*|money|loan\w*|debt|invest\w*)\b/], ['office', /\b(job|work\w*|boss|office|company|business)\b/],
  ['space', /\b(space|planet\w*|stars?|galaxy|universe|orbit)\b/], ['storm', /\b(storm|thunder\w*|lightning)\b/], ['ocean', /\b(underwater|under water|diving|divers?|seabed|sea floor|coral|fish)\b/], ['city', /\b(city|cities|street\w*|town)\b/],
  ['hospital', /\b(doctor\w*|hospital|disease|virus|sick)\b/], ['classroom', /\b(school|teacher|student\w*|learn\w*|class)\b/], ['nature', /\b(nature|forest|trees?|animal\w*)\b/], ['desert', /\b(desert|sand|dune)\b/], ['home', /\b(home|house|family)\b/]];
const POSE_WORDS = [['shock', /\b(hotter|explode\w*|blinding|kill\w*|danger\w*|melt\w*|split|insane|crazy)\b|!/], ['think', /\b(why|how|what|wonder|imagine|count)\b|\?/], ['point', /\b(this|that|here|there|look|next|every)\b/], ['walk', /\b(creep\w*|walk\w*|travel\w*|move\w*|steps?)\b/], ['cheer', /\b(win\w*|best|success\w*|finally)\b/], ['type', /\b(computer|website\w*|online|hack\w*|type)\b/]];
const MOOD_EXPRESSION = {shock: 'shocked', think: 'thinking', point: 'excited', walk: 'determined', cheer: 'excited', type: 'determined', talk: 'happy', stand: 'neutral'};

// A deliberate, honest scene from the shot's narration: a set, the narrator character acting the line, up to two
// props it mentions (alive on their own), its number as a counter, and a motion accent on a hook.
// Countries a line names, as said and as the map knows them. Short names (US, UK) are skipped: they read as words.
function countriesIn(narration) {
  const words = String(narration).match(/[A-Za-zÀ-ſ'.-]+/g) || [], found = [];
  for (let k = 0; k < words.length; k++) {
    for (const n of [3, 2, 1]) {
      const said = words.slice(k, k + n).join(' ').replace(/[.']+$/, '').replace(/'s$/, '');
      if (n === 1 && said.length < 4) continue;
      if (!/^[A-Z]/.test(said)) continue;
      const name = Maps.country(said);
      if (name && !found.some(item => item.name === name)) { found.push({name, said}); k += n - 1; break; }
    }
  }
  return found;
}
function fromText(narration, {onScreenText = '', shotIndex = 0, purpose = 'explain', primary = 'stickman', cast = [], setting = null} = {}) {
  const lower = ` ${String(narration).toLowerCase()} `;
  const props = [...new Set(PROP_WORDS.filter(([, pattern]) => pattern.test(lower)).map(([prop]) => prop))].slice(0, 2);
  // Nothing named: a hook gets an exclamation, other lines take turns so neighbouring shots differ (audit 2026-10-19:
  // one light bulb on shot after shot).
  if (!props.length) props.push(purpose === 'hook' ? 'exclamation' : FALLBACK_PROPS[shotIndex % FALLBACK_PROPS.length]);
  const pose = POSE_WORDS.find(([, pattern]) => pattern.test(lower))?.[0] || (shotIndex % 2 ? 'point' : 'talk');
  // The number a line is about: an amount before a year (a year is a date, not a quantity to count up to).
  const numbers = (String(narration).match(/\b\d[\d,.]*%?/g) || []).map(raw => raw.replace(/[.,]+$/, '')), amount = numbers.find(raw => !YEAR.test(raw)), year = numbers.find(raw => YEAR.test(raw));
  const left = shotIndex % 2 === 1, turn = /^\s*(but|however|yet|instead)\b/i.test(narration);
  const engine = E.drawEngines(primary)[0] || 'motion', who = cast[0]?.id;
  // A line that names countries gets a map (0.36): each colours in as it is said, a character points at it.
  const named = countriesIn(narration).slice(0, 4);
  if (named.length) {
    return validate({engine, set: 'none', camera: 'push', transition: shotIndex === 0 && purpose !== 'hook' ? 'whip-left' : 'cut', elements: [
      {kind: 'map', areas: named.map(({name, said}) => ({countries: [name], label: said, at: said})), size: 'xl'},
      ...(engine !== 'motion' || cast.length ? [{kind: 'figure', ...(who ? {who} : {}), pose: 'point', expression: MOOD_EXPRESSION[pose] || 'neutral', x: 0.12, y: 0.86, size: 'm'}] : []),
    ]}, {primary, cast});
  }
  const elements = [];
  // Many people (employees, an army, investors) are a crowd behind the speaker.
  if (PEOPLE.test(lower)) elements.push({kind: 'crowd', count: 9, pose: /\b(army|armies|soldiers?|war)\b/.test(lower) ? 'fist' : 'stand', x: left ? 0.3 : 0.68, y: 0.84, width: 0.5});
  if (engine !== 'motion' || cast.length) elements.push({kind: 'figure', ...(who ? {who} : {}), pose, expression: turn ? 'worried' : MOOD_EXPRESSION[pose] || 'neutral', x: left ? 0.72 : 0.27, y: 0.8, size: 'l', facing: left ? 'left' : 'right'});
  // The words come right after the speaker, so a drawing hand writes the number the line is about first.
  const words = clean(onScreenText, 40) || amount || year || '';
  if (words) elements.push({kind: 'text', text: words, x: 0.5, y: 0.15, size: !onScreenText && (amount || year) ? 'l' : 'm', style: onScreenText ? 'title' : amount ? 'counter' : year ? 'number' : 'title', accent: true});
  const lift = elements.some(el => el.kind === 'crowd') ? 0.12 : 0;
  props.forEach((prop, k) => elements.push({kind: 'prop', prop, x: left ? 0.3 + k * 0.2 : 0.6 + k * 0.2, y: (k ? 0.56 : 0.42) - lift, size: k ? 'm' : 'l', accent: k === 0}));
  const first = elements.findIndex(el => el.kind === 'prop');
  if (purpose === 'hook') elements.splice(first, 0, {kind: 'fx', effect: 'burst', on: first + 2});
  // Every engine's drawn shots stand in a place the words name (0.37 documentary looks draw places at full strength).
  const set = setting?.set || SET_WORDS.find(([, pattern]) => pattern.test(lower))?.[0] || (engine === 'motion' ? 'abstract' : 'none');
  return validate({engine, set, ...(setting?.mood ? {mood: setting.mood} : turn ? {mood: 'tense'} : {}), camera: purpose === 'hook' || turn ? 'punch' : shotIndex % 2 ? 'drift' : 'push', transition: shotIndex === 0 && purpose !== 'hook' ? 'whip-left' : 'cut', elements}, {primary, cast});
}

// ---------------------------------------------------------------- Claude's guide

const list = values => values.join('|');
function promptGuide(primary = 'stickman', {pictures = false, looks = false, boards = false, designs = false, engines: allowed = null} = {}) {
  const engines = allowed?.length ? allowed : E.drawEngines(primary);
  return [
    'DRAWN SHOTS (source "generated-graphics"): the program animates them from your description. You are the director, the character designer and the motion designer.',
    'Return a top-level "cast": every character the script needs (one, ten or more; the same characters return across the whole video): [{"id": "c1", "name": up to 24 chars, "role": up to 60 chars, "look": {' + Object.entries(LOOK).map(([key, values]) => `"${key}": ${list(values)}`).join(', ') + '}}].',
    'Design looks that tell the viewer who someone is at a glance: the narrator or "you" (an everyman), experts (glasses, lab-coat), rich people (suit, top-hat), workers (hard-hat), villains or a problem personified (body "creature": a dark blob with red eyes), machines (body "robot"). Give every character a distinct hair, colour or accessory. Never copy a real person or another channel\'s characters.',
    'Each scene may give a "setting": {"set", "mood"} - the place and feeling of that part of the story. Its drawn shots stay there unless their own sketch names another set.',
    'For each drawn shot return "cue": the first words spoken when this shot starts (the picture changes on them), and "sketch":',
    `{"engine": ${list(engines)}, "set": ${list(SETS)}, "mood": ${list(MOODS)}, "camera": ${list(CAMERAS)}, "transition": ${list(TRANSITIONS)}, "focus"?: [{"at": words, "x": 0-1, "y": 0-1, "zoom": 1-2.5}] (max ${MAX_FOCUS}), "elements": [1-${MAX_ELEMENTS}, back to front]}`,
    'Sets that are easy to misread: ocean is under water (light rays, seaweed, the sea floor), for divers and sea life; ships, sailors and the sea surface go on beach (sky, sea and sand) or storm with ship and waves props. space is outer space, night is a city at night, abstract and none are plain backdrops.',
    ...(looks ? [`A stickman shot of a video that mixes the stickman looks names its look: "look": ${list(STICK_LOOKS)}.`] : []),
    ...(boards ? [`A hand-drawn shot of a video that mixes the whiteboard looks names its look: "board": ${list(BOARDS)}.`] : []),
    ...(designs ? [`A documentary drawn shot (engine "motion") of a video that mixes the documentary looks names its look: "design": ${list(DESIGNS)}.`] : []),
    'Places of the past: throne (a throne room), castle (a castle above its land, for a kingdom or an empire), chamber (a stone room with a candle and a tapestry), harbor (a port with ships), market (stalls under awnings), village (cottages and a path), battlefield (a field with smoke and banners). Never put a TV, a lamp, a laptop or a car in a story set before electricity.',
    'Every element may have "at" (the exact words from this shot\'s narration it appears on), "until" (words it leaves on) and "enter": ' + list(ENTERS) + ' (mask: revealed through a growing circle; swing: swings in; blur: focuses in from a blur; rise: rises into place; land: arrives a little oversized and soft and settles to its size).',
    `MOTION LAYER: a text may "animate": ${list(TEXT_ANIMS)} (rise: words rise from a mask line; letters: letter by letter; typewriter: typed with a cursor; wipe: a highlighter bar sweeps and reveals; slam: lands hard with motion trails and a shake; track: a cinematic title whose letters close in; glitch: breaks up, then settles; blur: a focus pull; focus: a statement whose key words stay while the rest dims; redact: black bars lift off the words one by one, key words last). Any element may sit on a "layer": back (moves slower with the camera and goes soft) or front (moves faster) for 2.5D depth. A shot may carry a "texture": ${list(TEXTURES)} (film grain, an old film, paper, grid paper, VHS lines, a two-colour archive tint, warm light leaks).`,
    `- {"kind": "figure", "who": cast id, "pose": ${list(POSES)}, "expression": ${list(EXPRESSIONS)}, "emote": ${list(EMOTES)}, "holds"?: a prop, "x": 0-1, "y": feet 0.4-0.84 (ground 0.8), "size": s|m|l|xl, "facing": left|right, "then"?: [{"at": words, "pose"?, "expression"?, "emote"?, "x"? (walks there), "facing"?}] (max ${MAX_THEN}), "label"?}`,
    `- {"kind": "prop", "prop": ${list(PROPS)}, "x", "y": centre, "size": s|m|l|xl, "motion": ${list(PROP_MOTIONS)} (auto = its own life: the sun turns, coins spin, fire flickers, clocks tick), "label"?, "accent"?, "face"?: true (a cute face on the object)}`,
    `- {"kind": "text", "text": up to 48 chars, "style": ${list(TEXT_STYLES)} (counter counts up to the number in the text; stamp slams; highlight sweeps a marker; pop pops word by word; chapter is a full-frame card that opens a chapter or a level, e.g. "Level 2: The Shot Caller"; sticky is a sticky note, tag a price tag on a string, callout an arrow-shaped tag - for figures, costs and short facts; keyword is one big hand-lettered word in a top corner that names the beat; versus is a divider down the frame for comparing two things, its text in the middle circle, e.g. "VS"; the prop head is a head in profile to put a thought or a scene inside), "x", "y", "size", "color"?: ${list(WORD_COLORS)} (see WORD COLOUR), "accent"?}`,
    `- {"kind": "fx", "effect": ${list(FX)}, "on"?: element number it targets (circle, cross, check, glow, burst, sparkles, spotlight, underline, scan, impact, lightning, explosion, fire, dust, spiral, crack), "x"?, "y"?, "size"?, "value"?: 0-100 for progress}`,
    ...(pictures ? [`- {"kind": "picture", "describe": what the picture shows (10-${Il.LIMITS.describe} characters: the subject, what happens, the place, the feeling; no words in it), "x"?: centre 0.15-0.85, "y"?: centre 0.2-0.75, "size"?: s|m|l|xl (l), "at"?} - a detailed illustration drawn for this shot by an illustrator and traced by the hand (PAID: see PICTURES; at most ${MAX_PICTURES} per shot). Other elements (labels, arrows, words, effects, characters) may sit around it.`] : []),
    `- {"kind": "chart", "type": ${list(CHART_TYPES)}, "values": 1-${MAX_SERIES} numbers, "labels"?: one short label per value, "title"?: what it shows, "unit"?: e.g. "$", "%", "M", "highlight"?: the index of the value that matters, "x"?, "y"?, "size"?, "at"?} - builds on its words (bars grow, a line draws, a pie sweeps, stars fill: rating is one value 0-5; units is a unit chart of identical marks with the part lit: values [part, whole], e.g. [1, 100] for "the top 1%", "icon": "person" for people). Use only numbers the narration says; never invent data.`,
    `- {"kind": "timeline", "events": 2-${MAX_EVENTS} [{"label": up to 18 chars, "when"?: a year or date}], "now"?: the index of the current event, "y"?, "at"?} - a bar with a medallion for each event, drawn left to right.`,
    '- A text with style "statement" is a whole sentence of up to 90 characters (key words between *stars* light up): kinetic type that builds word by word; give it the frame or most of it. Style "poster" is one or two giant words across the frame; list it before a picture or figure so it sits behind them.',
    `- {"kind": "network", "nodes": 2-${MAX_EVENTS} [{"label": up to 18 chars, "icon"?: a prop}], "links": [[node number, node number], ...] (numbers start at 1), "x"?, "y"?, "size"?, "at"?} - who is connected to whom: nodes appear, then the links draw with a flow along them.`,
    `- {"kind": "quote", "text": the quoted words, up to 140 chars (key words between *stars*), "name"?: who said it (up to 24), "who"?: cast id (their portrait), "expression"?, "source"?: where it was said (up to 40), "x"?, "y"?, "size"?, "at"?} - a quote card with the speaker's portrait; only words the narration quotes or attributes.`,
    `- {"kind": "document", "doc": ${list(DOCS)}, "source"?: the paper, file or account the narration names (up to 30; never a real outlet's logo), "headline"?: up to 70 chars, "line"?: the one line that matters (up to 90; it lights up), "x"?, "y"?, "size"?, "at"?} - evidence on screen; its words come from the narration.`,
    '- {"kind": "gauge", "value": a number, "min"?, "max"?, "unit"?, "label"?, "steps"?: 2-12 (then value is the position, e.g. item 3 of 7), "x"?, "y"?, "size"?, "at"?} - a dial whose needle swings to a reading, or the position in a list.   - {"kind": "ruler", "from": element number or [x, y], "to": ..., "value"?: the measured reading, e.g. "3.4 km", "label"?, "at"?} - a measured line that grows from A to B while its reading counts up and lands.',
    '- {"kind": "loupe", "on": element number or [x, y] (the spot), "zoom"?: 1.5-4, "x"?, "y"?: where the lens sits, "size"?, "label"?, "at"?} - a lens that shows that spot magnified with a leader to it (two scales at once); it reads what is drawn, so give it a spot with detail.',
    `- {"kind": "map", "style"?: ${list(MAP_STYLES)} (atlas: black land on grid paper with small-caps labels), "areas"?: [{"countries": [names], "label"?, "color"?, "face"?: an expression (the country becomes a character), "zoom"?: true (the map camera flies to it on its words), "at"?}] (max ${MAX_AREAS}; an empire or an alliance is one area made of today's countries), "routes"?: [{"from": a country or [longitude, latitude], "to": ..., "label"?, "icon"?: a prop that travels along it (galleon, plane, car, truck, ship), "at"?}] (max ${MAX_ROUTES}: a march, a trade route, an invasion arrow), "pins"?: [{"place": a country or [longitude, latitude], "label", "zoom"?: true, "at"?}] (max ${MAX_PINS}, pins pulse), "view"?: ${list(MAP_VIEWS)} (fit = around what it names), "size"?: xl fills the frame (default), "at"?} - a real map: countries colour in on their words, arrows sweep, pins drop. Country names are today's.`,
    `- {"kind": "crowd", "count": 3-${MAX_CROWD}, "pose"?: ${list(CROWD_POSES)}, "expression"?, "colors"?: up to 3 colours (an army's uniform), "headwear"?: one for all, "banner"?: a sign held up (up to 24 chars), "x"?, "y"?: ground, "width"?: 0.2-1 of the frame, "size"?: s|m, "facing"?} - a nation, an army, voters, a mob.`,
    '- {"kind": "arrow", "from": [x, y] or element number, "to": [x, y] or element number, "label"?, "dashed"?: true (a connector between related things)}   - {"kind": "bubble", "text": up to 48 chars, "on": figure element number, "thought"?: true, "x", "y"}',
    'BUILD EVERY SHOT LIKE A SCENE, not a slide: (1) a set that says where we are ("none" only for a clean punch-in beat); (2) characters acting the line with a pose, an expression and, when it fits, an emote or a held prop; (3) the props the line names; (4) the motion layer: one or two effects or kinetic words tied to words with "at" (burst behind a big claim, counter for a number, cross on a myth and check on the truth, speedlines for speed, shake or punch on a shock, spotlight on a secret); (5) beats: things arrive on their words, "then" changes a pose, expression or position mid-shot, "until" removes something; (6) camera and focus to steer the eye.',
    'SCRIPT MATCH: every shot shows exactly what its own words say, at the moment they are said: the right subject, the right action, the right emotion. Never show something before it is said or after the narration has moved on, and never cut to an unrelated picture or metaphor.',
    'CONTINUITY: plan the world first. Each part of the story has one place that matches what the narration describes; shots stay in it while the narration stays there and change place only when the words move. Keep each character on the same side of the screen and facing the same way across neighbouring shots unless they move; keep introduced props while they are still discussed; return to an earlier place when the story returns to its topic. A new place or a new layout needs a reason in the words.',
    'VOICE: a sentence may carry the narrator voice "delivery" (emotion, energy 1-5, pace). Let the expressions of the characters, the mood, the camera and the beat speed follow it: excited lines get punchy pops and bright faces, sad lines slow pushes and sad faces, tense lines worried faces and a tense mood, a whisper a close, quiet frame.',
    'PACING: match the genre. Energetic explainers and listicles change the picture every 1.5-3 seconds (a new shot or a new beat) and use whip, zoom and pop openings at section changes; calm or serious topics hold longer with slow pushes. Never let a frame sit still: every shot has something that moves.',
    ...(engines.includes('motion') ? ['MOTION SHOTS (engine motion): one hero element at size xl and the number or word big (size l or xl), filling the frame; no empty half-frame.'] : []),
    'WORD COLOUR: words are designed, not typed. Give every word a colour for its role and for what lies behind it (text "color"): the key word, number or verdict in the accent or a strong warm colour (gold, yellow, orange, red) so it is the first thing the eye reads; supporting words in the ink; a big poster word behind people in a rich colour from the scene, never a pale ghost. Check the place behind the word: light colours on dark or busy places, dark colours on light ones (the program edges every word for contrast, but a pale word on a bright sky still reads weak). Keep two or three word colours per shot, taken from the video\'s palette and the scene\'s light, and keep the same colour for the same idea across the video.',
    'COMPOSITION: feet on the ground line (y 0.8); short titles and labels in the top third (statements, quotes, documents, charts and maps may hold the centre); keep the bottom 18% clear for captions; never cover a face with text; characters are the subject: m or larger, a lone character l or xl, s only when smallness is the point (a tiny person under a huge storm); use size xl and focus zoom for reaction close-ups; alternate left/right/centre layouts and sets, never the same composition twice in a row; at most 3-4 things arriving at once. Words on screen come from the narration.',
    'Example: {"source": "generated-graphics", "query": "", "prompt": "", "motion": "static", "notes": "", "cue": "a single bolt", "sketch": {"engine": "stickman", "set": "storm", "mood": "tense", "camera": "push", "transition": "cut", "elements": [{"kind": "figure", "who": "c1", "pose": "cower", "expression": "scared", "emote": "sweat", "x": 0.28, "y": 0.8, "size": "l", "facing": "right", "then": [{"at": "hotter", "pose": "shock", "expression": "shocked"}]}, {"kind": "prop", "prop": "bolt", "x": 0.62, "y": 0.4, "size": "xl", "at": "bolt", "enter": "drop"}, {"kind": "fx", "effect": "flash", "at": "bolt"}, {"kind": "prop", "prop": "sun", "x": 0.85, "y": 0.22, "size": "m", "at": "sun"}, {"kind": "text", "text": "5x hotter", "style": "stamp", "x": 0.5, "y": 0.14, "at": "five times", "accent": true}]}}',
  ].join('\n');
}

module.exports = {TEXT_ANIMS, LAYERS, TEXTURES, MAP_STYLES, FILMS, DOCS, MAP_VIEWS, CROWD_POSES, MAX_PICTURES, BOARDS, STICK_LOOKS, DESIGNS, CHART_TYPES, worldNotes, worldMend, VERSION, POSES, EXPRESSIONS, EMOTES, LOOK, DEFAULT_LOOK, PROPS, SETS, MOODS, CAMERAS, TRANSITIONS, ENTERS, TEXT_STYLES, WORD_COLORS, FX, PROP_MOTIONS, SIZES, MAX_ELEMENTS, MAX_CAST, validate, validateCast, validateSetting, continuity, mend, carry, timing, matchPhrase, fromText, promptGuide};
