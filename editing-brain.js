'use strict';
// P06 - The editing brain: a deterministic editor that turns an approved visual board, the measured
// narration and the family style into an edit with a written reason for every decision, then critiques
// that edit the way a senior editor would. Pure functions only: no I/O, no clock, no randomness, so the
// same inputs always give the same edit and every decision can be re-derived and tested.
//
// The rules restate the research in docs/research/editing-brain/ (OpenMontage's editing and review
// brain, the palmier/capcut/lossless-cut timeline rules, flick and hand-drawn motion design). Every rule
// names the skill it comes from, so the Skills page shows which approved skills the edit followed.
const {createHash} = require('node:crypto');
const Cap = require('./captions');
const Audio = require('./audio');

const SCHEMA = 'ytprod.edit/1';
const round = (value, places = 3) => Math.round(value * 10 ** places) / 10 ** places;
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
const seconds = (frames, fps) => round(frames / fps, 3);
const clock = value => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
const shortHash = value => createHash('sha256').update(String(value)).digest('hex').slice(0, 8);

// ---------------------------------------------------------------- rule tables (with their skills)

// Emotional register per scene purpose. It sets motion amplitude, the hero bonus and transition length.
const PURPOSE_REGISTER = Object.freeze({
  hook: 'urgent', context: 'reverent', explain: 'reverent', example: 'wry', evidence: 'elegiac',
  turn: 'dreamlike', recap: 'reverent', close: 'elegiac', 'call-to-action': 'wry',
});
const REGISTER_MOTION = Object.freeze({urgent: 1.25, wry: 1.1, dreamlike: 1, reverent: 0.9, elegiac: 0.8});
// Breathing pattern: long, medium, short, short, very long. Equal holds read as a slideshow.
const BREATH = Object.freeze([1.25, 1, 0.8, 0.85, 1.4]);
const HERO_WEIGHT = 1.35, HOOK_OPEN_WEIGHT = 0.6, SNAP_WINDOW_SECONDS = 0.6;
const MOVES = Object.freeze(['push-in', 'pull-out', 'pan-right', 'pan-left', 'push-detail', 'static']);
const MOVE_REASONS = Object.freeze({
  'push-in': 'a slow push-in draws the eye to the subject',
  'pull-out': 'a pull-out reveals the context around the subject',
  'pan-right': 'a pan travels across the frame, left to right',
  'pan-left': 'a pan travels across the frame, right to left',
  'push-detail': 'a punch-in to a detail keeps a long hold alive',
  static: 'planned as a static hold',
});
const TRANSITIONS = Object.freeze(['cut', 'crossfade', 'dip-to-black']);
// Text templates are drawn by libass (graphicsAss); canvas templates by motion.js in a headless browser.
const CANVAS_TEMPLATES = Object.freeze(['bar-chart', 'line-chart', 'timeline', 'list', 'comparison', 'flow']);
const GRAPHIC_TEMPLATES = Object.freeze(['scene-text', 'title-card', 'stat', 'date', 'quote', ...CANVAS_TEMPLATES]);
// On a vertical frame these full-screen graphics carry their own text where the caption rail sits, so the
// rail clears while they hold (skill captions.keep-out-band); horizontal graphics stay above the band.
const CAPTION_CLEARS = Object.freeze(['title-card', 'quote', ...CANVAS_TEMPLATES]);
const GRAPHIC_PRIORITY = Object.freeze({'scene-text': 0, 'title-card': 0, timeline: 1, 'bar-chart': 1, 'line-chart': 1, list: 1, comparison: 1, flow: 1, quote: 1, stat: 2, date: 3});
// Which skill each rule restates. Findings and decisions cite these IDs.
const SKILL = Object.freeze({
  rhythm: 'doc.montage-beat-math', breathing: 'editing.change-cadence', onTheWord: 'editing.visual-on-the-word',
  transitions: 'editing.transition-grammar', stills: 'editing.still-image-motion', easing: 'motion.easing-curves',
  trim: 'editing.trim-to-the-moment', hook: 'editing.opening-hook-construction', interrupts: 'editing.pattern-interrupt-schedule',
  retention: 'editing.retention-curve-defense', adjacency: 'editing.adjacent-diversity', slideshow: 'review.slideshow-risk-score',
  tells: 'review.boring-lazy-amateur-tells', graphics: 'motion.graphic-type-selector', stat: 'motion.stat-reveal',
  quote: 'motion.quote-card', titleCard: 'motion.title-cards-canvas', dwell: 'editing.text-dwell-formula',
  chart: 'motion.chart-build', timeline: 'motion.timeline-build', list: 'motion.list-build', comparison: 'motion.comparison-split', diagram: 'motion.diagram-build',
  endings: 'editing.cut-justification-and-endings',
});

// ---------------------------------------------------------------- narration timing

// Parses FFmpeg silencedetect output into pause spans (seconds).
function pausesFromSilence(stderr) {
  const starts = [...String(stderr).matchAll(/silence_start:\s*(-?[\d.]+)/g)].map(match => Math.max(0, Number(match[1])));
  const ends = [...String(stderr).matchAll(/silence_end:\s*([\d.]+)/g)].map(match => Number(match[1]));
  return starts.map((start, index) => ({start: round(start), end: round(ends[index] ?? start)})).filter(span => span.end > span.start);
}
// Moves each word-share sentence start onto the real pause before it, so cuts land as the next sentence
// begins (skill editing.visual-on-the-word). A boundary with no pause nearby keeps its estimate.
function alignSentences(sentences, pauses, narrationSeconds) {
  const aligned = sentences.map(item => ({...item}));
  let matched = 0;
  const used = new Set();
  for (let index = 1; index < aligned.length; index++) {
    const estimate = aligned[index].startSeconds;
    const window = Math.max(0.8, 0.25 * aligned[index - 1].durationSeconds);
    let best = null;
    pauses.forEach((pause, key) => {
      if (used.has(key)) return;
      const cut = Math.max(pause.start, pause.end - 0.08), distance = Math.abs(cut - estimate);
      if (distance <= window && (!best || distance < best.distance)) best = {key, cut, distance};
    });
    const floor = aligned[index - 1].startSeconds + 0.2;
    if (best && best.cut > floor && best.cut < narrationSeconds - 0.2) { aligned[index].startSeconds = round(best.cut); used.add(best.key); matched++; }
    else aligned[index].startSeconds = round(Math.max(estimate, floor));
  }
  aligned.forEach((item, index) => { item.durationSeconds = round((index < aligned.length - 1 ? aligned[index + 1].startSeconds : narrationSeconds) - item.startSeconds); });
  return {sentences: aligned, matched, boundaries: Math.max(0, aligned.length - 1), method: matched ? 'pause-aligned' : 'word-share'};
}

// ---------------------------------------------------------------- stock clip windows

// The first measured source cut strictly inside the window [from, from + span] (seconds), or undefined.
const cutInside = (cuts, from, span) => (cuts || []).find(cut => cut > from + 0.04 && cut < from + span - 0.04);
// Keeps a clip's window inside one shot: the preferred in-point when its window is clean, otherwise the
// longest single shot that fits, entered a little after its start. With no shot long enough, the preferred
// window stays and the critic names the hidden cut.
function cleanWindow(length, span, cuts, preferred) {
  const hidden = cutInside(cuts, preferred, span);
  if (hidden === undefined) return {inSeconds: preferred, moved: false};
  const edges = [0, ...cuts.filter(cut => cut > 0.04 && cut < length - 0.04), length];
  let best = null;
  for (let k = 0; k + 1 < edges.length; k++) {
    const room = edges[k + 1] - edges[k];
    if (room >= span + 0.08 && (!best || room > best.room)) best = {from: edges[k], room};
  }
  if (!best) return {inSeconds: preferred, moved: false};
  return {inSeconds: round(best.from + 0.04 + Math.min(0.5, (best.room - span - 0.08) * 0.25), 2), moved: true, cut: hidden};
}

// ---------------------------------------------------------------- allocation

// Splits `total` frames across weights, keeping each part inside [lo, hi] where possible, summing exactly.
function allocate(total, weights, lo, hi) {
  const n = weights.length;
  lo = Math.min(lo, Math.floor(total / n));
  hi = Math.max(hi, Math.ceil(total / n));
  const fixed = new Array(n).fill(null);
  for (let pass = 0; pass <= n; pass++) {
    const free = fixed.map((value, index) => (value === null ? index : -1)).filter(index => index >= 0);
    if (!free.length) break;
    const remaining = total - fixed.reduce((sum, value) => sum + (value || 0), 0);
    const weightSum = free.reduce((sum, index) => sum + weights[index], 0);
    let changed = false;
    for (const index of free) {
      const share = remaining * weights[index] / weightSum;
      if (share < lo) { fixed[index] = lo; changed = true; } else if (share > hi) { fixed[index] = hi; changed = true; }
    }
    if (!changed) { for (const index of free) fixed[index] = remaining * weights[index] / weightSum; break; }
  }
  // Largest remainder keeps the integer frames summing to the total.
  const floors = fixed.map(value => Math.floor(value));
  let short = total - floors.reduce((sum, value) => sum + value, 0);
  const order = fixed.map((value, index) => ({index, rest: value - Math.floor(value)})).sort((a, b) => b.rest - a.rest || a.index - b.index);
  for (let k = 0; short > 0; k = (k + 1) % n, short--) floors[order[k].index]++;
  return floors;
}

// ---------------------------------------------------------------- the auto edit

// A planned move only binds a still when the shot was planned as an image: "static" on a shot planned as
// video describes the clip, not the still that later filled it.
function allowedMoves(spec, planned, source) {
  if (planned === 'static' && source && !String(source).endsWith('image')) planned = 'ken-burns';
  const style = new Set(spec.motion.cameraMoves || []);
  const styleMoves = new Set();
  if (style.has('ken-burns')) ['push-in', 'pull-out', 'pan-right', 'pan-left', 'push-detail'].forEach(move => styleMoves.add(move));
  if (style.has('zoom')) ['push-in', 'pull-out', 'push-detail'].forEach(move => styleMoves.add(move));
  if (style.has('pan')) ['pan-right', 'pan-left'].forEach(move => styleMoves.add(move));
  if (style.has('static')) styleMoves.add('static');
  const plan = planned === 'static' ? ['static'] : planned === 'zoom' ? ['push-in', 'pull-out', 'push-detail'] : planned === 'pan' ? ['pan-right', 'pan-left'] : MOVES;
  const result = plan.filter(move => styleMoves.has(move));
  return result.length ? result : (styleMoves.size ? [...styleMoves] : ['static']);
}

function graphicDwellSeconds(textValue) {
  const characters = String(textValue).length, wordsCount = String(textValue).trim().split(/\s+/).filter(Boolean).length;
  return round(Math.max(1.2, characters / 13, 0.35 + wordsCount / 3.2), 2);
}
const STAT_PATTERN = /(?:[$£€]\s?)?\b\d[\d,]*(?:\.\d+)?\s?(?:%|percent\b|per cent\b|million\b|billion\b|trillion\b|thousand\b|hundred\b|km\b|miles?\b|kg\b|tons?\b|tonnes?\b|people\b|soldiers\b|years\b|metres?\b|meters?\b|feet\b|dollars\b|pounds\b)/i;
const YEAR_PATTERN = /\b(?:(\d{1,5})\s?(BCE|BC|CE|AD)|(1[0-9]{3}|20[0-9]{2}))\b/;
const QUOTE_PATTERN = /[“"]([^”"]{12,180})[”"]/;
const STOP = new Set('the a an of and or to in on at for with by from as is was were be been it its this that these those his her their our your my into over under than then'.split(' '));
function labelAfter(sentence, index, length) {
  const rest = sentence.slice(index + length).replace(/^[\s,.;:]+/, '').split(/\s+/).map(word => word.replace(/[^\p{L}\p{N}'-]/gu, '')).filter(Boolean);
  const label = [];
  for (const word of rest) { if (label.length >= 4) break; if (!label.length && STOP.has(word.toLowerCase())) continue; label.push(word); if (/[.,;:!?]$/.test(word)) break; }
  return label.join(' ').slice(0, 40);
}
// Marks the accent word: an owner *word* marker wins, otherwise the last content word (needs review).
function accentOf(textValue) {
  const marked = String(textValue).match(/\*([^*\s]{1,30})\*/);
  const plain = String(textValue).replace(/\*/g, '').trim();
  if (marked) return {text: plain, accent: marked[1], accentSource: 'owner marker'};
  const words = plain.split(/\s+/).filter(Boolean);
  const pick = [...words].reverse().find(word => !STOP.has(word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''))) || words[words.length - 1] || '';
  return {text: plain, accent: pick.replace(/[^\p{L}\p{N}'-]/gu, ''), accentSource: 'last content word'};
}

// ---------------------------------------------------------------- canvas graphic data
// Canvas graphics keep their content as plain lines the owner can edit: "label = value" for charts,
// "year = event" for timelines, one item per line for lists and flows, two sides for a comparison.
function parseValue(textValue) {
  const match = String(textValue).trim().match(/^([$£€])?\s*(-?\d[\d,]*(?:\.\d+)?)\s*(.{0,24})$/);
  if (!match) return null;
  const digits = match[2].replace(/,/g, '');
  return {value: Number(digits), prefix: match[1] || '', suffix: match[3].trim(), decimals: (digits.split('.')[1] || '').length};
}
function parseYear(textValue) {
  const match = String(textValue).trim().match(/^(\d{1,5})\s*(BCE|BC|CE|AD)?$/i);
  if (!match) return null;
  const year = Number(match[1]);
  return {year: /^BC/i.test(match[2] || '') ? -year : year, display: match[2] ? `${match[1]} ${match[2].toUpperCase()}` : match[1]};
}
const CANVAS_LIMITS = Object.freeze({'bar-chart': [3, 9], 'line-chart': [3, 12], timeline: [3, 7], list: [3, 6], comparison: [2, 2], flow: [3, 6]});
// Turns a canvas graphic's lines into the structured data the template draws. Throws on anything invalid.
function canvasData(template, title, lines) {
  const [min, max] = CANVAS_LIMITS[template] || [];
  if (!min) throw opError('Unknown canvas template.');
  if (!Array.isArray(lines) || lines.length < min || lines.length > max) throw opError(`A ${template} needs ${min === max ? min : `${min}-${max}`} lines.`);
  const pair = line => { const at = line.indexOf('='); if (at < 1) throw opError(`Write "${line}" as "label = value".`); return [line.slice(0, at).trim(), line.slice(at + 1).trim()]; };
  let items;
  if (template === 'bar-chart' || template === 'line-chart') {
    items = lines.map(line => { const [label, raw] = pair(line), value = parseValue(raw); if (!label || !value || !Number.isFinite(value.value)) throw opError(`"${line}" needs a label and a number, like "Grain = 34%".`); return {label: label.slice(0, 40), ...value}; });
    if (new Set(items.map(item => item.suffix)).size > 1) throw opError('Every value in one chart needs the same unit.');
  } else if (template === 'timeline') {
    items = lines.map(line => { const [rawYear, label] = pair(line), year = parseYear(rawYear); if (!year || !label) throw opError(`"${line}" needs a year and an event, like "1347 = The ship docks".`); return {...year, label: label.slice(0, 60)}; });
  } else if (template === 'comparison') {
    items = lines.map(line => { const at = line.indexOf(':'); return at > 0 ? {label: line.slice(0, at).trim().slice(0, 40), detail: line.slice(at + 1).trim().slice(0, 90)} : {label: line.trim().slice(0, 40), detail: ''}; });
  } else items = lines.map(line => ({label: String(line).trim().slice(0, 70)}));
  return {title: String(title || '').trim().slice(0, 80), items};
}
// Minimum time on screen for a canvas graphic: build time plus a hold the viewer can read.
function canvasMinimumSeconds(template, count) {
  return {'bar-chart': 4 + 0.15 * count, 'line-chart': 4.2, timeline: 2.2 + 0.6 * count, list: 1.6 + 0.6 * count, comparison: 3.5, flow: 1.8 + 0.6 * count}[template] || 3;
}
const finishFor = spec => (['canvas-frames', 'ffmpeg-sketch'].includes(spec?.renderer?.adapter) || /hand|caveat|marker|print|sketch/i.test(spec?.typography?.headingFont || '') ? 'hand-drawn' : 'clean');

const LIST_INTRO = /\b(?:three|four|five|six|[3-6])\s+(?:reasons|ways|things|steps|signs|rules|lessons|mistakes|habits|questions|ideas|parts|stages)\b[^:]{0,40}:\s*(.+)$/i;
const ORDINAL = /^(?:first|second|third|fourth|fifth|sixth|finally)\b[,:]?\s*/i;
const VERSUS = /((?:[\p{L}\p{N}'-]+\s+){0,2}[\p{L}\p{N}'-]+)\s+(?:versus|vs\.?)\s+((?:[\p{L}\p{N}'-]+\s+){0,2}[\p{L}\p{N}'-]+)/iu;
const CHAIN = /\s+(?:leads? to|led to|causes?|caused|turns? into|turned into|becomes?|became|creates?|created)\s+/i;
const shorten = (textValue, words) => String(textValue).replace(/^[\s,;:]*(?:which|that|and|then|this|it)\s+/i, '').replace(/[,;]?\s*\b(?:which|that|and|then|so)\s*$/i, '').replace(/[.!?,;:]+$/, '').split(/\s+/).filter(Boolean).slice(0, words).join(' ');
// The thing a number belongs to usually comes just before it ("grain 34%", "Salt made up 18%").
const LABEL_SKIP = new Set([...STOP, 'was', 'were', 'is', 'are', 'made', 'up', 'just', 'about', 'only', 'had', 'has', 'have', 'reached', 'fell', 'rose', 'grew', 'dropped', 'nearly', 'almost', 'over', 'under', 'around', 'roughly', 'some', 'cost', 'costs', 'paid', 'took', 'while']);
function labelBefore(sentence, index) {
  const words = sentence.slice(0, index).split(/[,;:.!?()]/).pop().split(/\s+/).map(word => word.replace(/[^\p{L}\p{N}'-]/gu, '')).filter(Boolean).slice(-6);
  let end = words.length - 1;
  while (end >= 0 && LABEL_SKIP.has(words[end].toLowerCase())) end--;
  if (end < 0 || /^\d/.test(words[end])) return '';
  const start = end > 0 && !LABEL_SKIP.has(words[end - 1].toLowerCase()) && !/^\d/.test(words[end - 1]) ? end - 1 : end;
  return words.slice(start, end + 1).join(' ').slice(0, 40);
}
// Scene-level canvas proposals: data comes only from the script itself; the owner checks it before accepting.
function proposeCanvas(scene, span, fps, finish) {
  const out = [], at = value => Math.round(value * fps), sceneEnd = scene.endFrame;
  const fit = (startSeconds, seconds) => { const start = at(startSeconds + 0.25), frames = Math.min(Math.round(seconds * fps), sceneEnd - start); return frames >= Math.round(3 * fps) ? {start, frames} : null; };
  const base = (template, extra) => ({id: `gr_${scene.id}_${template}`, template, sceneId: scene.id, origin: 'brain', status: 'proposed', renderer: 'canvas', finish, accent: null, ...extra});
  // Charts: three or more numbers with the same unit (a line chart when each comes with a year).
  const numbers = [];
  for (const sentence of span) for (const match of sentence.text.matchAll(new RegExp(STAT_PATTERN.source, 'gi'))) {
    const value = parseValue(match[0].replace(/\s?(percent|per cent)\b/i, '%'));
    if (!value || /^\d{4}$/.test(match[0].trim())) continue;
    const year = sentence.text.slice(Math.max(0, match.index - 40), match.index).match(/\b(1[0-9]{3}|20[0-9]{2})\b(?!.*\b(1[0-9]{3}|20[0-9]{2})\b)/);
    numbers.push({...value, label: year ? year[1] : labelBefore(sentence.text, match.index) || labelAfter(sentence.text, match.index, match[0].length), year: year ? year[1] : null, sentence});
  }
  const unit = numbers.length >= 3 ? numbers[0].suffix.toLowerCase() : null;
  const same = unit === null ? [] : numbers.filter(item => item.suffix.toLowerCase() === unit);
  if (same.length >= 3 && same.every(item => item.label) && new Set(same.map(item => item.label.toLowerCase())).size === same.length) {
    const lineChart = same.every(item => item.year);
    const lines = same.slice(0, lineChart ? 12 : 9).map(item => `${item.label} = ${item.prefix}${item.value}${item.suffix ? (item.suffix.length < 3 ? '' : ' ') + item.suffix : ''}`);
    const slot = fit(same[0].sentence.startSeconds, 5.5);
    if (slot) out.push(base(lineChart ? 'line-chart' : 'bar-chart', {...slot, title: '', lines, sentence: same[0].sentence.n, reason: `The scene gives ${same.length} numbers in the same unit: a ${lineChart ? 'line' : 'bar'} chart builds them on screen. The values come from the script; check them and add a title before accepting.`, skill: SKILL.chart}));
  }
  // Timeline: three or more distinct years in the scene.
  const years = [];
  for (const sentence of span) for (const match of sentence.text.matchAll(new RegExp(YEAR_PATTERN.source, 'g'))) {
    const display = match[3] || `${match[1]} ${match[2].toUpperCase()}`;
    if (!years.some(item => item.display === display)) years.push({display, label: (labelAfter(sentence.text, match.index, match[0].length) || shorten(sentence.text, 5)).replace(/(?:\s+(?:in|of|the|a|an|to|for|by|at|on|and|was|were))+$/i, ''), sentence});
  }
  if (years.length >= 3 && !out.some(item => item.template === 'line-chart')) {
    const lines = years.slice(0, 7).map(item => `${item.display} = ${item.label}`);
    const slot = fit(years[0].sentence.startSeconds, clamp(2.2 + 0.7 * lines.length + 1.2, 4, 7));
    if (slot) out.push(base('timeline', {...slot, title: '', lines, sentence: years[0].sentence.n, reason: `The scene names ${years.length} dates: a timeline shows how they relate. Check each event label before accepting.`, skill: SKILL.timeline}));
  }
  // List: "three reasons: a, b and c", or sentences that start First / Second / Third.
  let listItems = null, listSentence = null;
  for (const sentence of span) {
    const match = sentence.text.match(LIST_INTRO);
    if (match) { const items = match[1].split(/,\s*(?:and\s+)?|\s+and\s+/i).map(item => shorten(item, 7)).filter(Boolean); if (items.length >= 3 && items.length <= 6) { listItems = items; listSentence = sentence; break; } }
  }
  if (!listItems) {
    const ordinals = span.filter(sentence => ORDINAL.test(sentence.text));
    if (ordinals.length >= 3) { listItems = ordinals.slice(0, 6).map(sentence => shorten(sentence.text.replace(ORDINAL, ''), 8)); listSentence = ordinals[0]; }
  }
  if (listItems) {
    const slot = fit(listSentence.startSeconds, clamp(1.6 + 0.7 * listItems.length + 1, 3.5, 6));
    if (slot) out.push(base('list', {...slot, title: '', lines: listItems, sentence: listSentence.n, reason: `The narration lists ${listItems.length} points: a list build shows each one as it is spoken.`, skill: SKILL.list}));
  }
  // Comparison: "X versus Y".
  for (const sentence of span) {
    const match = sentence.text.match(VERSUS);
    if (!match) continue;
    const slot = fit(sentence.startSeconds, 4.5);
    const side = value => shorten(value, 4).replace(/\s+(?:tells?|shows?|is|are|was|were|has|have|had|can|could|will|would|does|did|makes?|explains?|reveals?|mean|means|changed?)$/i, '');
    if (slot) out.push(base('comparison', {...slot, title: '', lines: [side(match[1]), side(match[2])], sentence: sentence.n, reason: 'The narration sets two things against each other: a comparison split shows both sides on the same scale.', skill: SKILL.comparison}));
    break;
  }
  // Flow: "A leads to B, which turns into C".
  for (const sentence of span) {
    const parts = sentence.text.split(CHAIN);
    if (parts.length < 3) continue;
    const nodes = parts.slice(0, 6).map((part, index) => (index === 0 ? shorten(part.split(/\s+/).slice(-5).join(' '), 5) : shorten(part, 5))).filter(Boolean);
    const slot = nodes.length >= 3 ? fit(sentence.startSeconds, clamp(1.8 + 0.8 * nodes.length + 1, 4, 7)) : null;
    if (slot) out.push(base('flow', {...slot, title: '', lines: nodes, sentence: sentence.n, reason: `The narration describes a chain of ${nodes.length} steps: a diagram builds it step by step.`, skill: SKILL.diagram}));
    break;
  }
  return out;
}

// Proposes motion graphics where the narration says something footage cannot show (skill
// motion.graphic-type-selector): numbers, dates, quotations, and chapter cards at a turn.
function proposeGraphics({scenes, sentences, fps, totalFrames, spec}) {
  const graphics = [], finish = finishFor(spec);
  const at = value => clamp(Math.round(value * fps), 0, totalFrames - 1);
  for (const scene of scenes) {
    const span = sentences.slice(scene.sentenceStart - 1, scene.sentenceEnd);
    const sceneEnd = scene.endFrame;
    if (scene.onScreenText) {
      const turn = scene.purpose === 'turn';
      const {text: plain, accent, accentSource} = accentOf(scene.onScreenText);
      const dwell = turn ? round(0.75 + Math.max(1.2, 0.35 + plain.split(/\s+/).length / 3.2), 2) : graphicDwellSeconds(plain);
      const start = scene.startFrame + (scene.index === 0 ? 0 : Math.round(0.3 * fps));
      graphics.push({id: `gr_${scene.id}_text`, template: turn ? 'title-card' : 'scene-text', start, frames: Math.max(1, Math.min(Math.round(dwell * fps), sceneEnd - start)),
        lines: [plain], accent: turn ? accent : null, accentSource: turn ? accentSource : null, sentence: scene.sentenceStart, sceneId: scene.id, origin: 'plan', status: 'accepted',
        reason: turn ? `The plan's on-screen text at a turn becomes a chapter title card (owner title-card rules: fade in rising, hold by word count, one accent word).` : 'On-screen text from the approved scene plan, held for its reading time.', skill: turn ? SKILL.titleCard : SKILL.dwell});
    }
    const canvas = proposeCanvas(scene, span, fps, finish);
    graphics.push(...canvas);
    const timelineScene = canvas.some(item => item.template === 'timeline');
    for (const sentence of span) {
      const start = at(sentence.startSeconds + 0.25), room = Math.round(sentence.durationSeconds * fps);
      if (room < Math.round(1.6 * fps)) continue;
      const quote = sentence.text.match(QUOTE_PATTERN);
      if (quote && quote[1].trim().split(/\s+/).length >= 4) {
        const line = quote[1].trim();
        graphics.push({id: `gr_q${sentence.n}`, template: 'quote', start, frames: Math.min(room, Math.round(clamp(graphicDwellSeconds(line), 3, 7) * fps)), lines: [line], accent: null, sentence: sentence.n, sceneId: scene.id, origin: 'brain', status: 'proposed',
          reason: 'The narration quotes someone: a quote card shows the exact words while they are spoken.', skill: SKILL.quote});
        continue;
      }
      const stat = sentence.text.match(STAT_PATTERN);
      if (stat && !/^\d{4}$/.test(stat[0].trim())) {
        const value = stat[0].replace(/\s+/g, ' ').trim(), label = labelAfter(sentence.text, stat.index, stat[0].length);
        graphics.push({id: `gr_s${sentence.n}`, template: 'stat', start, frames: Math.min(room, Math.round(clamp(graphicDwellSeconds(`${value} ${label}`) + 1, 2.5, 5) * fps)), lines: label ? [value, label] : [value], accent: value, sentence: sentence.n, sceneId: scene.id, origin: 'brain', status: 'proposed',
          reason: `"${value}" is a number the viewer should see as well as hear: a stat reveal holds it on screen.`, skill: SKILL.stat});
        continue;
      }
      const year = timelineScene ? null : sentence.text.match(YEAR_PATTERN);
      if (year) {
        const value = year[3] || `${year[1]} ${year[2].toUpperCase()}`;
        graphics.push({id: `gr_d${sentence.n}`, template: 'date', start, frames: Math.min(room, Math.round(3 * fps)), lines: [value], accent: value, sentence: sentence.n, sceneId: scene.id, origin: 'brain', status: 'proposed',
          reason: `A date stamp (${value}) anchors the viewer in time, as documentaries do with location and date titles.`, skill: SKILL.graphics});
      }
    }
  }
  // One graphic at a time: the higher-priority graphic keeps its place (plan text, quotes, stats, dates).
  graphics.sort((a, b) => a.start - b.start || GRAPHIC_PRIORITY[a.template] - GRAPHIC_PRIORITY[b.template]);
  const kept = [];
  for (const graphic of graphics) {
    const clash = kept.find(other => graphic.start < other.start + other.frames && other.start < graphic.start + graphic.frames);
    if (!clash) { kept.push(graphic); continue; }
    if (GRAPHIC_PRIORITY[graphic.template] < GRAPHIC_PRIORITY[clash.template] && clash.origin !== 'plan') { kept.splice(kept.indexOf(clash), 1, graphic); }
  }
  // Text over-reliance: proposed graphics stop at roughly a third of the runtime.
  const cap = Math.round(totalFrames * 0.35);
  let used = kept.filter(item => item.origin === 'plan').reduce((sum, item) => sum + item.frames, 0);
  return kept.sort((a, b) => a.start - b.start).filter(item => {
    if (item.origin === 'plan') return true;
    if (used + item.frames > cap) return false;
    used += item.frames;
    return true;
  });
}

function sceneJoin(previous, next, budget, spec, fps) {
  const allowed = new Set((spec.transitions.allowed || ['cut']).filter(type => TRANSITIONS.includes(type)));
  const maxFrames = Math.round((spec.transitions.maxDurationMs || 0) / 1000 * fps);
  if (next.purpose === 'close' && allowed.has('dip-to-black') && budget.duration >= 60 && budget.left > 0) return {type: 'dip-to-black', frames: Math.min(maxFrames, Math.round(0.8 * fps)), reason: 'A dip to black marks the section break before the close.', skill: SKILL.transitions};
  if (next.purpose === 'turn' && allowed.has('crossfade') && budget.left > 0) return {type: 'crossfade', frames: Math.min(maxFrames, Math.round((next.register === 'dreamlike' ? 0.8 : 0.6) * fps)), reason: 'A crossfade carries the change of direction at the turn.', skill: SKILL.transitions};
  if (previous.purpose !== next.purpose && ['recap', 'close'].includes(next.purpose) && allowed.has('crossfade') && budget.left > 0) return {type: 'crossfade', frames: Math.min(maxFrames, Math.round(0.6 * fps)), reason: 'A crossfade signals the move from the body to the wrap-up.', skill: SKILL.transitions};
  return {type: 'cut', frames: 0, reason: 'A hard cut keeps momentum between scenes; transitions are kept for structural moments.', skill: SKILL.transitions};
}

// The auto edit. `variants` (sceneId -> n) lets single-scene repair produce a different take of one scene.
function autoEdit({fps, narrationSeconds, sentences, scenes, assets, spec, format = 'long-form', variants = {}, pauses = [], locale = 'en'}) {
  const totalFrames = Math.max(1, Math.round(narrationSeconds * fps));
  const {pacing} = spec;
  const minF = Math.max(1, Math.round(pacing.shotMinSeconds * fps)), maxF = Math.max(minF, Math.round(pacing.shotMaxSeconds * fps));
  const sceneRows = scenes.map((scene, index) => {
    const start = index === 0 ? 0 : clamp(Math.round(sentences[scene.sentenceStart - 1].startSeconds * fps), 1, totalFrames - 1);
    return {id: scene.id, label: scene.label, index, purpose: scene.purpose, register: PURPOSE_REGISTER[scene.purpose] || 'reverent', onScreenText: scene.onScreenText || '', direction: scene.direction || '', sentenceStart: scene.sentenceStart, sentenceEnd: scene.sentenceEnd, startFrame: start, shots: scene.shots, variant: variants[scene.id] || 0};
  });
  sceneRows.forEach((scene, index) => { scene.endFrame = index < sceneRows.length - 1 ? sceneRows[index + 1].startFrame : totalFrames; });
  for (const scene of sceneRows) if (scene.endFrame <= scene.startFrame) scene.endFrame = scene.startFrame + 1;
  const heroScenes = new Set(sceneRows.filter(scene => ['evidence', 'turn'].includes(scene.purpose)).map(scene => scene.id));
  const lastShot = sceneRows[sceneRows.length - 1].shots.at(-1).id;
  const clips = [];
  let breath = 0;
  for (const scene of sceneRows) {
    const shots = scene.shots, n = shots.length, sceneFrames = scene.endFrame - scene.startFrame;
    const shift = scene.variant * 2;
    const weights = shots.map((shot, k) => {
      let weight = BREATH[(breath + k + shift) % BREATH.length];
      if ((k === 0 && heroScenes.has(scene.id)) || shot.id === lastShot) weight *= HERO_WEIGHT;
      if (scene.index === 0 && k === 0) weight *= HOOK_OPEN_WEIGHT;
      return weight;
    });
    breath += n;
    let lengths = allocate(sceneFrames, weights, minF, maxF);
    if (scene.index === 0 && n > 1) {
      // The opening shot respects the hook limit (skill editing.opening-hook-construction).
      const hookMax = Math.round(pacing.hookShotMaxSeconds * fps);
      if (lengths[0] > hookMax) { const spare = lengths[0] - hookMax; lengths[0] = hookMax; lengths[1] += spare; }
    }
    // Snap internal cuts to sentence starts inside the scene.
    const boundaries = sentences.slice(scene.sentenceStart, scene.sentenceEnd).map(item => Math.round(item.startSeconds * fps)).filter(frame => frame > scene.startFrame && frame < scene.endFrame);
    const cuts = [];
    let cursor = scene.startFrame;
    for (let k = 0; k < n - 1; k++) { cursor += lengths[k]; cuts.push({frame: cursor, snapped: false}); }
    const window = Math.round(SNAP_WINDOW_SECONDS * fps), floor = Math.round(minF * 0.75);
    const taken = new Set();
    cuts.forEach((cut, k) => {
      const before = k === 0 ? scene.startFrame : cuts[k - 1].frame, after = k === cuts.length - 1 ? scene.endFrame : cuts[k + 1].frame;
      let best = null;
      for (const boundary of boundaries) {
        if (taken.has(boundary) || Math.abs(boundary - cut.frame) > window || boundary - before < floor || after - boundary < floor) continue;
        if (scene.index === 0 && k === 0 && boundary - scene.startFrame > Math.round(pacing.hookShotMaxSeconds * fps)) continue;
        if (!best || Math.abs(boundary - cut.frame) < Math.abs(best - cut.frame)) best = boundary;
      }
      if (best !== null) { cut.frame = best; cut.snapped = true; taken.add(best); }
    });
    const edges = [scene.startFrame, ...cuts.map(cut => cut.frame), scene.endFrame];
    lengths = edges.slice(1).map((edge, k) => edge - edges[k]);
    shots.forEach((shot, k) => {
      const asset = assets[shot.id];
      const hero = (k === 0 && heroScenes.has(scene.id)) || shot.id === lastShot;
      let reason;
      if (k === 0) reason = scene.index === 0 ? 'Opens the video fast: the first shot stays inside the hook limit.' : `Starts scene ${scene.label} on its first sentence.`;
      else reason = cuts[k - 1].snapped ? 'Cut lands on the sentence break, so the picture changes as the new line begins.' : 'Cut placed by the breathing pattern (long, medium, short, short, very long).';
      if (hero) reason += ' Hero shot: held longer.';
      clips.push({id: `cl_${shot.id}`, shotId: shot.id, sceneId: scene.id, assetId: asset.assetId, label: shot.label, mediaType: asset.mediaType, start: edges[k], frames: lengths[k],
        clipSeconds: asset.clipSeconds ?? null, inSeconds: 0, speed: 1, move: null, hero, part: null, reason, ...(Array.isArray(asset.cuts) ? {sourceCuts: asset.cuts} : {}), skill: cuts[k - 1]?.snapped ? SKILL.onTheWord : SKILL.rhythm, planned: shot.motion, plannedSource: shot.source, register: scene.register, purpose: scene.purpose, variant: scene.variant});
    });
  }
  // Break runs of three near-equal holds by rolling an unsnapped cut (skill editing.change-cadence).
  for (let k = 2; k < clips.length; k++) {
    const trio = [clips[k - 2], clips[k - 1], clips[k]];
    if (trio.some(clip => clip.sceneId !== trio[1].sceneId)) continue;
    const lo = Math.min(...trio.map(clip => clip.frames)), hi = Math.max(...trio.map(clip => clip.frames));
    if (hi > lo * 1.03) continue;
    const nudge = Math.max(2, Math.round(trio[1].frames * 0.15));
    if (trio[2].frames - nudge >= Math.round(minF * 0.75)) { trio[1].frames += nudge; trio[2].frames -= nudge; trio[2].start += nudge; trio[1].reason += ' Lengthened to avoid three equal holds.'; trio[1].skill = SKILL.breathing; }
  }
  // Split an over-long still into a wide hold plus a detail punch-in (skill editing.still-image-motion).
  for (let k = clips.length - 1; k >= 0; k--) {
    const clip = clips[k];
    if (clip.mediaType !== 'image' || clip.frames <= Math.round(maxF * 1.15) || clip.frames < 2 * minF) continue;
    const first = Math.round(clip.frames * 0.55);
    const second = {...clip, id: `${clip.id}_b`, start: clip.start + first, frames: clip.frames - first, part: 'detail', hero: false, reason: 'Second part of a long still: a punch-in to a detail so the picture changes within the shot.', skill: SKILL.stills};
    clip.frames = first;
    clip.part = 'wide';
    clip.reason += ' Long hold split into a wide view and a detail punch-in.';
    clips.splice(k + 1, 0, second);
  }
  // Camera moves on stills; trims and speed on clips.
  const intensity = clamp(spec.motion.intensity ?? 35, 0, 100);
  const cycle = ['pan-right', 'push-in', 'pan-left', 'pull-out'];
  let previousMove = null;
  clips.forEach((clip, index) => {
    const hold = clip.frames / fps;
    if (clip.mediaType === 'video') {
      const length = clip.clipSeconds || hold;
      if (length > hold + 0.3) {
        clip.inSeconds = round(Math.min(1, (length - hold) * 0.25), 2);
        clip.trimReason = `Skips the clip's first ${clip.inSeconds.toFixed(2)} s, where stock clips usually settle, and keeps the strongest stretch.`;
      } else if (length < hold) {
        const speed = round(length / hold, 3);
        if (speed >= 0.8) { clip.speed = speed; clip.trimReason = `Slowed to ${Math.round(speed * 100)}% so the clip fills its hold without freezing.`; }
        else { clip.speed = 1; clip.trimReason = `The clip is ${length.toFixed(1)} s for a ${hold.toFixed(1)} s hold; its last frame would freeze.`; clip.freezeSeconds = round(hold - length, 2); }
      } else clip.trimReason = 'Uses the clip from its first frame.';
      // Stock clips often hide their own cuts; keep the window inside one continuous shot.
      if (clip.sourceCuts?.length) {
        const pick = cleanWindow(length, hold * clip.speed, clip.sourceCuts, clip.inSeconds);
        if (pick.moved) clip.trimReason = `The stock clip changes shot at ${pick.cut.toFixed(2)} s, so the edit uses ${pick.inSeconds.toFixed(2)}-${(pick.inSeconds + hold * clip.speed).toFixed(2)} s: one continuous shot, no hidden cut.`;
        clip.inSeconds = pick.inSeconds;
      }
      clip.skillTrim = SKILL.trim;
      previousMove = 'video';
      return;
    }
    const allowed = allowedMoves(spec, clip.planned, clip.plannedSource);
    let preferred;
    // A repaired scene (variant > 0) takes a different route through the move cycle, so the new take looks different.
    if (clip.variant && clip.part !== 'detail') preferred = cycle[(index + clip.variant) % cycle.length];
    else if (clip.part === 'detail') preferred = 'push-detail';
    else if (clip.hero || index === 0) preferred = 'push-in';
    else if (index === clips.length - 1 || clip.purpose === 'close') preferred = 'pull-out';
    else if (index > 0 && clips[index - 1].sceneId !== clip.sceneId && ['context', 'explain'].includes(clip.purpose)) preferred = 'pull-out';
    else preferred = cycle[index % cycle.length];
    const ordered = [preferred, ...cycle.slice(index % cycle.length), ...cycle, 'push-detail', 'static'];
    let kind = ordered.find(move => allowed.includes(move) && move !== previousMove) || ordered.find(move => allowed.includes(move)) || 'static';
    // A static still held past the style's frozen-picture limit reads as a mistake; a gentle push keeps it alive.
    const frozenLimit = spec.qc?.maxFrozenSeconds ?? Infinity, styleMoves = allowedMoves(spec, 'ken-burns');
    let gentle = false;
    if (kind === 'static' && hold > frozenLimit && styleMoves.includes('push-in')) { kind = 'push-in'; gentle = true; }
    const base = 0.04 + 0.16 * intensity / 100;
    const amount = kind === 'static' ? 0 : round(base * (REGISTER_MOTION[clip.register] || 1) * (clip.hero ? 1.2 : 1) * (kind === 'push-detail' ? 1.6 : 1) * (gentle ? 0.5 : 1), 3);
    clip.move = {kind, amount, easing: 'ease-in-out'};
    clip.moveReason = gentle ? `Planned as a static hold, but ${hold.toFixed(1)} s of a still past the style's ${frozenLimit} s limit reads as frozen, so a gentle push-in keeps it alive.` : kind === preferred ? `${MOVE_REASONS[kind]}.` : `${MOVE_REASONS[kind]}, chosen so neighbouring stills never move the same way.`;
    clip.skillMove = SKILL.stills;
    previousMove = kind;
  });
  // Joins: cuts inside scenes, structural transitions between scenes, within a transition budget.
  const duration = narrationSeconds;
  const budget = {duration, left: Math.max(1, Math.floor(duration / 45))};
  const joins = [];
  for (let k = 0; k < clips.length - 1; k++) {
    const a = clips[k], b = clips[k + 1];
    if (a.sceneId === b.sceneId) { joins.push({type: 'cut', frames: 0, reason: 'Hard cut inside a scene.', skill: SKILL.transitions}); continue; }
    const previous = sceneRows.find(scene => scene.id === a.sceneId), next = sceneRows.find(scene => scene.id === b.sceneId);
    let join = previous.index === 0 ? {type: 'cut', frames: 0, reason: 'The hook ends on a hard cut to keep the energy.', skill: SKILL.hook} : sceneJoin(previous, next, budget, spec, fps);
    if (join.type !== 'cut' && joins.length && joins[joins.length - 1].type !== 'cut') join = {type: 'cut', frames: 0, reason: 'Two transitions in a row would look decorative; this one is a hard cut.', skill: SKILL.transitions};
    const shorter = Math.min(a.frames, b.frames);
    if (join.type !== 'cut') join.frames = Math.max(2, Math.min(join.frames, Math.floor(shorter / 3)));
    if (join.type !== 'cut') budget.left--;
    joins.push(join);
  }
  const scenesOut = sceneRows.map(scene => ({id: scene.id, label: scene.label, purpose: scene.purpose, register: scene.register, startFrame: scene.startFrame, endFrame: scene.endFrame, sentenceStart: scene.sentenceStart, sentenceEnd: scene.sentenceEnd, variant: scene.variant}));
  const graphics = proposeGraphics({scenes: sceneRows, sentences, fps, totalFrames, spec});
  const markers = retentionMarkers(sceneRows, fps, totalFrames);
  const timeline = {
    schema: SCHEMA, fps, format, totalFrames, narrationSeconds: round(narrationSeconds),
    scenes: scenesOut,
    clips: clips.map(({planned, plannedSource, register, purpose, variant, ...clip}) => clip),
    joins, graphics, markers,
    ending: {fadeOutFrames: Math.min(Math.round(0.6 * fps), Math.floor(clips[clips.length - 1].frames / 2)), reason: 'The video fades out on its last image instead of freezing.', skill: SKILL.endings},
    // Captions follow the narration, not the clips: owner changes to cuts and graphics never move them.
    captions: Cap.buildCaptions({sentences, pauses, narrationSeconds, format, locale}),
  };
  validateTimeline(timeline);
  return timeline;
}

function retentionMarkers(scenes, fps, totalFrames) {
  const markers = [];
  const add = (kind, frame, note) => { if (frame >= 0 && frame < totalFrames) markers.push({kind, frame, note}); };
  add('hook-end', Math.min(Math.round(30 * fps), totalFrames - 1), 'The hook should be complete by 0:30.');
  const payoff = scenes.find(scene => ['evidence', 'example'].includes(scene.purpose));
  if (payoff) add('first-payoff', payoff.startFrame, `First payoff (${payoff.label}).`);
  scenes.filter(scene => scene.purpose === 'turn').forEach(scene => add('re-hook', scene.startFrame, `Re-hook at the turn (${scene.label}).`));
  return markers.sort((a, b) => a.frame - b.frame);
}

// ---------------------------------------------------------------- invariants

function validateTimeline(timeline) {
  const problems = [];
  if (timeline.schema !== SCHEMA) problems.push('Unknown timeline schema.');
  let expected = 0;
  timeline.clips.forEach((clip, index) => {
    if (clip.start !== expected) problems.push(`Clip ${index + 1} (${clip.label}) starts at frame ${clip.start}, expected ${expected}.`);
    if (!Number.isSafeInteger(clip.frames) || clip.frames < 1) problems.push(`Clip ${index + 1} (${clip.label}) has no length.`);
    if (!(clip.speed > 0 && clip.speed <= 1)) problems.push(`Clip ${index + 1} (${clip.label}) has an invalid speed.`);
    if (clip.mediaType === 'image' && !MOVES.includes(clip.move?.kind)) problems.push(`Clip ${index + 1} (${clip.label}) has no camera move.`);
    expected = clip.start + clip.frames;
  });
  if (expected !== timeline.totalFrames) problems.push(`The clips cover ${expected} frames; the narration needs ${timeline.totalFrames}.`);
  if (timeline.captions) problems.push(...Cap.validateCaptions(timeline.captions, timeline.narrationSeconds));
  if (timeline.joins.length !== timeline.clips.length - 1) problems.push('Every pair of neighbouring clips needs exactly one join.');
  timeline.joins.forEach((join, index) => {
    if (!TRANSITIONS.includes(join.type)) problems.push(`Join ${index + 1} uses an unknown transition.`);
    else if (join.type !== 'cut' && (join.frames < 2 || join.frames > Math.floor(Math.min(timeline.clips[index].frames, timeline.clips[index + 1].frames) / 2))) problems.push(`Join ${index + 1} is too long for its neighbouring clips.`);
  });
  for (const graphic of timeline.graphics) {
    if (!GRAPHIC_TEMPLATES.includes(graphic.template)) problems.push(`Graphic ${graphic.id} uses an unknown template.`);
    if (graphic.start < 0 || graphic.frames < 1 || graphic.start + graphic.frames > timeline.totalFrames) problems.push(`Graphic ${graphic.id} falls outside the video.`);
  }
  if (problems.length) throw Object.assign(new Error(problems[0]), {problems, status: 409});
  return true;
}

// ---------------------------------------------------------------- critique

function finding(severity, code, message, fix, extra = {}) { return {severity, code, message, fix, ...extra}; }

// Scores and findings in the reviewer's vocabulary (skill review.severity-ladder): critical blocks the
// approval unless the owner accepts it, suggestion improves it, nitpick is polish.
function critique(timeline, spec) {
  const fps = timeline.fps, clips = timeline.clips, findings = [];
  const secs = frames => seconds(frames, fps);
  const holds = clips.map(clip => clip.frames / fps);
  const stills = clips.filter(clip => clip.mediaType === 'image');
  const videoShare = clips.length ? clips.filter(clip => clip.mediaType === 'video').length / clips.length : 0;
  const nonCut = timeline.joins.filter(join => join.type !== 'cut');
  const transitionTypes = new Set(timeline.joins.map(join => join.type));
  const accepted = timeline.graphics.filter(graphic => graphic.status === 'accepted');
  // Changes: every cut, plus the start and end of each accepted graphic.
  const changes = [...new Set([0, ...clips.slice(1).map(clip => clip.start), ...accepted.flatMap(graphic => [graphic.start, graphic.start + graphic.frames]), timeline.totalFrames])].sort((a, b) => a - b);
  let longestUnchanged = 0, longestAt = 0;
  for (let k = 1; k < changes.length; k++) if (changes[k] - changes[k - 1] > longestUnchanged) { longestUnchanged = changes[k] - changes[k - 1]; longestAt = changes[k - 1]; }

  // Hook (skill editing.opening-hook-construction).
  const first = clips[0];
  if (first && secs(first.frames) > spec.pacing.hookShotMaxSeconds + 0.05) findings.push(finding('suggestion', 'hook-slow', `The first shot holds ${secs(first.frames).toFixed(1)} s; the style wants the hook's first cut within ${spec.pacing.hookShotMaxSeconds} s.`, 'Shorten the first shot or split the opening scene.', {clipId: first.id, at: 0, skill: SKILL.hook}));
  const openingScene = timeline.scenes[0];
  const openingVideo = clips.find(clip => clip.sceneId === openingScene.id && clip.mediaType === 'video');
  if (first?.mediaType === 'image' && openingVideo) findings.push(finding('suggestion', 'hook-static', 'The video opens on a still although the opening scene has a moving clip.', `Move ${openingVideo.label} to the front of the opening scene, so frame one moves.`, {clipId: openingVideo.id, at: 0, op: {type: 'reorder', sceneId: openingScene.id, clipId: openingVideo.id, toIndex: 0}, skill: SKILL.hook}));
  // Freezes and over-long holds (amateur tells).
  for (const clip of clips) {
    if (clip.freezeSeconds) findings.push(finding('critical', 'clip-freeze', `${clip.label} ends ${clip.freezeSeconds.toFixed(1)} s early and would freeze on its last frame.`, 'Choose a longer clip for this shot in Room 04, or shorten its hold.', {clipId: clip.id, at: clip.start, skill: SKILL.trim}));
    if (clip.mediaType === 'image' && clip.move?.kind === 'static' && secs(clip.frames) > spec.qc.maxFrozenSeconds) findings.push(finding('critical', 'static-too-long', `${clip.label} is a static still for ${secs(clip.frames).toFixed(1)} s; the QC treats more than ${spec.qc.maxFrozenSeconds} s as a frozen picture.`, 'Give it a camera move or split the hold.', {clipId: clip.id, at: clip.start, op: {type: 'set-move', clipId: clip.id, kind: 'push-in'}, skill: SKILL.stills}));
  }
  for (const clip of clips) {
    if (clip.mediaType !== 'video' || !clip.sourceCuts?.length) continue;
    const span = clip.frames / fps * clip.speed, cut = cutInside(clip.sourceCuts, clip.inSeconds, span);
    if (cut === undefined) continue;
    const pick = cleanWindow(clip.clipSeconds || span, span, clip.sourceCuts, clip.inSeconds);
    findings.push(finding('suggestion', 'hidden-cut', `${clip.label}: the stock clip changes to a different shot at ${cut.toFixed(2)} s, inside the part this edit uses; it will look like a glitch.`,
      pick.moved ? `Start the clip at ${pick.inSeconds.toFixed(2)} s, inside one shot.` : 'Shorten the hold, or choose another clip for this shot in Room 04.',
      {clipId: clip.id, at: clip.start, ...(pick.moved ? {op: {type: 'set-in', clipId: clip.id, seconds: pick.inSeconds}} : {}), skill: SKILL.trim}));
  }
  const limit = spec.pacing.maxStaticHoldSeconds || 8;
  if (secs(longestUnchanged) > Math.max(limit, 8)) findings.push(finding('suggestion', 'long-unchanged', `Nothing changes on screen for ${secs(longestUnchanged).toFixed(1)} s from ${clock(longestAt / fps)}.`, 'Add a shot or a graphic in that stretch, or split the hold.', {at: longestAt, skill: SKILL.breathing}));
  // Rhythm (skill editing.change-cadence / review.boring-lazy-amateur-tells).
  for (let k = 2; k < clips.length; k++) {
    const trio = holds.slice(k - 2, k + 1);
    if (Math.max(...trio) <= Math.min(...trio) * 1.03) findings.push(finding('suggestion', 'equal-holds', `${clips[k - 2].label}, ${clips[k - 1].label} and ${clips[k].label} hold the same length (${trio[0].toFixed(1)} s).`, 'Vary one of the three holds by moving a cut.', {clipId: clips[k - 1].id, at: clips[k - 2].start, skill: SKILL.tells}));
  }
  // Adjacency (skill editing.adjacent-diversity).
  for (let k = 1; k < clips.length; k++) {
    const a = clips[k - 1], b = clips[k];
    if (a.assetId === b.assetId && !(a.part === 'wide' && b.part === 'detail')) findings.push(finding('critical', 'repeat-adjacent', `${a.label} and ${b.label} show the same visual back to back.`, 'Pick a different visual for one of them in Room 04.', {clipId: b.id, at: b.start, skill: SKILL.adjacency}));
    if (a.move && b.move && a.move.kind === b.move.kind && a.move.kind !== 'static') findings.push(finding('nitpick', 'same-move', `${a.label} and ${b.label} move the camera the same way (${a.move.kind}).`, 'Change one of the two camera moves.', {clipId: b.id, at: b.start, skill: SKILL.stills}));
  }
  let run = 0;
  clips.forEach((clip, index) => {
    run = clip.mediaType === 'image' ? run + 1 : 0;
    if (run === 5) findings.push(finding('suggestion', 'still-run', `Five stills in a row end at ${clip.label}, with no moving footage between them.`, 'Swap one of them for a stock video clip in Room 04.', {clipId: clip.id, at: clips[index - 4].start, skill: SKILL.tells}));
  });
  // Transitions (skill editing.transition-grammar).
  if (transitionTypes.size > 3) findings.push(finding('suggestion', 'transition-variety', `The edit uses ${transitionTypes.size} transition types; keep to two or three.`, 'Turn the least meaningful transitions into hard cuts.', {skill: SKILL.transitions}));
  if (nonCut.length > Math.max(1, Math.floor(timeline.narrationSeconds / 45)) + 1) findings.push(finding('suggestion', 'transition-overuse', `${nonCut.length} soft transitions in ${clock(timeline.narrationSeconds)} make the edit feel decorative.`, 'Keep soft transitions for section breaks and turns only.', {skill: SKILL.transitions}));
  // Pattern interrupts and retention (skills editing.pattern-interrupt-schedule, editing.retention-curve-defense).
  const treatment = [0, ...clips.slice(1).filter((clip, k) => clip.mediaType !== clips[k].mediaType || clip.sceneId !== clips[k].sceneId || clip.part === 'detail').map(clip => clip.start), ...accepted.map(graphic => graphic.start), ...timeline.joins.map((join, k) => (join.type !== 'cut' ? clips[k + 1].start : null)).filter(value => value !== null)].sort((a, b) => a - b);
  for (let k = 1; k <= treatment.length; k++) {
    const from = treatment[k - 1], to = k < treatment.length ? treatment[k] : timeline.totalFrames;
    if (secs(to - from) > 30) { findings.push(finding('suggestion', 'interrupt-gap', `No change of treatment for ${secs(to - from).toFixed(0)} s from ${clock(from / fps)}: same kind of shot, no graphic, no transition.`, 'Switch between stills and footage there, or accept a proposed graphic.', {at: from, skill: SKILL.interrupts})); break; }
  }
  if (timeline.narrationSeconds > 150 && !timeline.markers.some(marker => marker.kind === 'first-payoff' && marker.frame <= 120 * fps)) findings.push(finding('suggestion', 'late-payoff', 'No evidence or example scene starts before 2:00; viewers leave in the 2:00-3:00 valley without a first payoff.', 'Move a concrete example earlier in the script.', {skill: SKILL.retention, route: 'script'}));
  if (timeline.narrationSeconds > 240 && !timeline.markers.some(marker => marker.kind === 're-hook')) findings.push(finding('suggestion', 'no-rehook', 'The video runs past 4 minutes without a turn scene to re-hook the viewer.', 'Add a turn ("but the stranger part is still ahead") around 2:00 and every 3-4 minutes.', {skill: SKILL.retention, route: 'script'}));
  // Graphics (skills motion.graphic-type-selector, editing.text-dwell-formula).
  for (const graphic of accepted) {
    const text = graphic.lines.join(' '), need = CANVAS_TEMPLATES.includes(graphic.template) ? canvasMinimumSeconds(graphic.template, graphic.lines.length) : graphicDwellSeconds(text);
    if (secs(graphic.frames) + 0.05 < need * 0.85) findings.push(finding('suggestion', 'graphic-short', `The ${graphic.template} "${text.slice(0, 40)}" is on screen ${secs(graphic.frames).toFixed(1)} s; it needs about ${need.toFixed(1)} s to read.`, 'Lengthen it or cut words.', {graphicId: graphic.id, at: graphic.start, skill: SKILL.dwell}));
  }
  // Captions (skills editing.caption-spec, timeline.caption-qc-rules, captions.keep-out-band).
  if (timeline.captions && !timeline.captions.enabled) findings.push(finding('suggestion', 'captions-off', 'Captions are switched off. Most viewers start a video muted, and captions keep them through the opening.', 'Switch the captions back on.', {op: {type: 'set-captions', enabled: true}, skill: Cap.SKILL.spec}));
  if (timeline.captions?.enabled) {
    const issues = Cap.lintCaptions(timeline.captions);
    for (const issue of issues.filter(item => item.severity === 'critical')) findings.push(finding('critical', issue.kind, issue.message, 'Draft a fresh edit so the captions are rebuilt from the narration.', {skill: Cap.SKILL.qc}));
    const fast = issues.filter(item => item.kind === 'caption-too-fast');
    if (fast.length) findings.push(finding('nitpick', 'captions-fast', `${fast.length} caption${fast.length === 1 ? '' : 's'} pass${fast.length === 1 ? 'es' : ''} faster than 20 characters a second (${fast.slice(0, 3).map(item => item.groupId).join(', ')}).`, 'This follows the narration pace; a slower voice pace or fewer words in that phrase fixes it.', {skill: Cap.SKILL.qc}));
    const windows = Cap.clearWindows(timeline, CAPTION_CLEARS);
    if (windows.length) {
      const share = Cap.visibleGroups(timeline.captions, windows).length / Math.max(1, timeline.captions.groups.length);
      if (share < 0.75) findings.push(finding('suggestion', 'captions-cleared', `Full-screen graphics clear the captions for ${Math.round((1 - share) * 100)}% of the narration on this vertical video.`, 'Reject or shorten some full-screen graphics so the words stay readable on mute.', {skill: Cap.SKILL.keepOut}));
    }
  }
  const proposed = timeline.graphics.filter(graphic => graphic.status === 'proposed');
  if (proposed.length) findings.push(finding('nitpick', 'graphics-pending', `${proposed.length} proposed graphic${proposed.length === 1 ? '' : 's'} waiting for your decision; only accepted graphics are rendered.`, 'Accept or reject each proposed graphic.', {skill: SKILL.graphics}));

  // Slideshow risk, lower is better (skill review.slideshow-risk-score), restated for this montage.
  const kinds = stills.map(clip => clip.move?.kind);
  const topMove = kinds.length ? Math.max(...Object.values(kinds.reduce((map, kind) => ({...map, [kind]: (map[kind] || 0) + 1}), {}))) / kinds.length : 0;
  const mean = holds.reduce((sum, value) => sum + value, 0) / Math.max(1, holds.length);
  const spread = Math.sqrt(holds.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, holds.length)) / Math.max(0.001, mean);
  const graphicShare = accepted.reduce((sum, graphic) => sum + graphic.frames, 0) / timeline.totalFrames;
  const dimensions = {
    repetition: round(clamp((topMove - 0.4) / 0.4 * 5, 0, 5), 2),
    motion: round(videoShare >= 0.3 ? 0 : videoShare >= 0.15 ? 2 : stills.every(clip => clip.move?.kind !== 'static') ? 3 : 4.5, 2),
    rhythm: round(spread >= 0.25 ? 0 : spread >= 0.15 ? 2 : 4, 2),
    text: round(graphicShare > 0.6 ? 4 : graphicShare > 0.4 ? 2.5 : graphicShare > 0.2 ? 1 : 0, 2),
    hero: clips.some(clip => clip.hero) ? 0 : 3,
    stillness: round(secs(longestUnchanged) > 15 ? 5 : secs(longestUnchanged) > 10 ? 3 : 0, 2),
  };
  const slideshow = round(Object.values(dimensions).reduce((sum, value) => sum + value, 0) / Object.keys(dimensions).length, 2);
  const verdict = slideshow < 2 ? 'strong' : slideshow < 3 ? 'acceptable' : slideshow < 4 ? 'revise' : 'fail';
  if (verdict === 'fail') findings.push(finding('critical', 'slideshow', `Slideshow risk is ${slideshow} (fail at 4).`, 'Add moving footage, vary the holds and break up long unchanged stretches.', {skill: SKILL.slideshow}));
  else if (verdict === 'revise') findings.push(finding('suggestion', 'slideshow', `Slideshow risk is ${slideshow} (revise between 3 and 4).`, 'More moving footage and more varied holds lower it.', {skill: SKILL.slideshow}));
  const order = {critical: 0, suggestion: 1, nitpick: 2};
  findings.sort((a, b) => order[a.severity] - order[b.severity] || (a.at ?? 0) - (b.at ?? 0));
  return {
    slideshow: {score: slideshow, verdict, dimensions},
    counts: {critical: findings.filter(item => item.severity === 'critical').length, suggestion: findings.filter(item => item.severity === 'suggestion').length, nitpick: findings.filter(item => item.severity === 'nitpick').length},
    findings,
    stats: {clips: clips.length, averageShotSeconds: round(mean, 2), cutsPerMinute: round(Math.max(0, clips.length - 1) / Math.max(1 / 60, timeline.narrationSeconds / 60), 1), videoShare: round(videoShare, 2), stillShare: round(1 - videoShare, 2), softTransitions: nonCut.length, transitionTypes: [...transitionTypes], longestUnchangedSeconds: secs(longestUnchanged), graphicsAccepted: accepted.length, graphicsProposed: proposed.length, holdSpread: round(spread, 2)},
  };
}

// ---------------------------------------------------------------- operations

const OP_TYPES = Object.freeze(['set-hold', 'set-transition', 'set-move', 'set-in', 'set-hero', 'set-graphic', 'add-graphic', 'reorder', 'set-captions', 'set-audio']);
function opError(message) { return Object.assign(new Error(message), {status: 400}); }
function findClip(timeline, id) { const index = timeline.clips.findIndex(clip => clip.id === id); if (index < 0) throw opError('That clip is not in this edit.'); return index; }

// Applies one owner edit to a copy of the timeline and returns {timeline, receipt}. Every op is checked
// fully before anything changes; a failed check changes nothing (skill timeline.operation-contract-and-receipts).
function applyOp(source, op, {spec} = {}) {
  if (!op || typeof op !== 'object' || !OP_TYPES.includes(op.type)) throw opError(`Choose one of: ${OP_TYPES.join(', ')}.`);
  const timeline = structuredClone(source), fps = timeline.fps, receipt = {type: op.type, changed: []};
  const clipFrames = value => { if (!Number.isFinite(value)) throw opError('Give the length in seconds.'); return Math.round(value * fps); };
  if (op.type === 'set-hold') {
    const index = findClip(timeline, op.clipId);
    if (index === timeline.clips.length - 1) throw opError('The last clip always ends with the narration; change the clip before it instead.');
    const clip = timeline.clips[index], next = timeline.clips[index + 1], frames = clipFrames(op.seconds), delta = frames - clip.frames;
    const floor = Math.max(1, Math.round(0.5 * fps));
    if (frames < floor || next.frames - delta < floor) throw opError('Both clips around the cut must keep at least half a second.');
    clip.frames = frames; next.start += delta; next.frames -= delta;
    clip.reason = `Hold set by the owner to ${(frames / fps).toFixed(2)} s.`; clip.skill = null;
    receipt.changed.push(clip.id, next.id);
  } else if (op.type === 'set-transition') {
    const index = findClip(timeline, op.clipId);
    if (index === timeline.clips.length - 1) throw opError('There is no join after the last clip.');
    if (!TRANSITIONS.includes(op.transition)) throw opError(`Choose a transition: ${TRANSITIONS.join(', ')}.`);
    const allowed = new Set([...(spec?.transitions?.allowed || ['cut']), 'cut']);
    if (!allowed.has(op.transition)) throw opError('The family style does not allow that transition.');
    let frames = 0;
    if (op.transition !== 'cut') {
      frames = clipFrames(op.seconds ?? 0.6);
      const most = Math.floor(Math.min(timeline.clips[index].frames, timeline.clips[index + 1].frames) / 2);
      if (frames < 2 || frames > most) throw opError(`That transition must be between ${(2 / fps).toFixed(2)} and ${(most / fps).toFixed(2)} s for these clips.`);
    }
    timeline.joins[index] = {type: op.transition, frames, reason: `Set by the owner.`, skill: null};
    receipt.changed.push(`join-after:${op.clipId}`);
  } else if (op.type === 'set-move') {
    const index = findClip(timeline, op.clipId), clip = timeline.clips[index];
    if (clip.mediaType !== 'image') throw opError('Camera moves apply to stills; clips keep their own motion.');
    if (!MOVES.includes(op.kind)) throw opError(`Choose a camera move: ${MOVES.join(', ')}.`);
    const base = 0.04 + 0.16 * clamp(spec?.motion?.intensity ?? 35, 0, 100) / 100;
    clip.move = {kind: op.kind, amount: op.kind === 'static' ? 0 : round(base * (op.kind === 'push-detail' ? 1.6 : 1), 3), easing: 'ease-in-out'};
    clip.moveReason = 'Camera move set by the owner.';
    receipt.changed.push(clip.id);
  } else if (op.type === 'set-in') {
    const index = findClip(timeline, op.clipId), clip = timeline.clips[index];
    if (clip.mediaType !== 'video') throw opError('Only video clips have an in-point.');
    const value = Number(op.seconds), hold = clip.frames / fps * clip.speed;
    if (!Number.isFinite(value) || value < 0 || (clip.clipSeconds && value + hold > clip.clipSeconds + 0.001)) throw opError(`The in-point must leave ${hold.toFixed(2)} s of the clip to play.`);
    clip.inSeconds = round(value, 2); clip.trimReason = `In-point set by the owner to ${clip.inSeconds.toFixed(2)} s.`;
    receipt.changed.push(clip.id);
  } else if (op.type === 'set-hero') {
    const clip = timeline.clips[findClip(timeline, op.clipId)];
    clip.hero = !!op.hero;
    receipt.changed.push(clip.id);
  } else if (op.type === 'set-graphic') {
    const graphic = timeline.graphics.find(item => item.id === op.graphicId);
    if (!graphic) throw opError('That graphic is not in this edit.');
    if (op.status !== undefined) { if (!['accepted', 'rejected', 'proposed'].includes(op.status)) throw opError('A graphic is accepted, rejected or proposed.'); graphic.status = op.status; }
    const canvas = CANVAS_TEMPLATES.includes(graphic.template);
    if (op.title !== undefined) {
      if (!canvas) throw opError('Only charts, timelines, lists, comparisons and diagrams have a title.');
      graphic.title = String(op.title).replace(/[\x00-\x1F]/g, ' ').trim().slice(0, 80);
    }
    if (op.lines !== undefined) {
      const most = canvas ? 12 : 3;
      if (!Array.isArray(op.lines) || op.lines.length < 1 || op.lines.length > most) throw opError(`This graphic has 1-${most} lines.`);
      graphic.lines = op.lines.map(line => { const value = String(line).replace(/[{}\\]/g, '').replace(/\s+/g, ' ').trim(); if (!value || value.length > 120) throw opError('Each graphic line needs 1-120 characters.'); return value; });
      if (graphic.template === 'title-card') { const {accent, accentSource} = accentOf(graphic.lines.join(' ')); graphic.accent = op.accent ? String(op.accent).slice(0, 30) : accent; graphic.accentSource = op.accent ? 'owner' : accentSource; graphic.lines = graphic.lines.map(line => line.replace(/\*/g, '')); }
    }
    if (op.seconds !== undefined) {
      const frames = clipFrames(op.seconds);
      if (frames < Math.round(0.8 * fps) || graphic.start + frames > timeline.totalFrames) throw opError('A graphic stays at least 0.8 s and ends inside the video.');
      graphic.frames = frames;
    }
    if (canvas) canvasData(graphic.template, graphic.title, graphic.lines);
    receipt.changed.push(graphic.id);
  } else if (op.type === 'add-graphic') {
    // The owner adds a graphic the brain did not propose. It is accepted at once and may not overlap another.
    if (!GRAPHIC_TEMPLATES.includes(op.template)) throw opError(`Choose a graphic: ${GRAPHIC_TEMPLATES.join(', ')}.`);
    const start = clipFrames(op.startSeconds), frames = clipFrames(op.seconds);
    if (start < 0 || frames < Math.round(0.8 * fps) || start + frames > timeline.totalFrames) throw opError('The graphic must start inside the video, stay at least 0.8 s and end before the video ends.');
    const canvas = CANVAS_TEMPLATES.includes(op.template), most = canvas ? 12 : 3;
    if (!Array.isArray(op.lines) || op.lines.length < 1 || op.lines.length > most) throw opError(`This graphic has 1-${most} lines.`);
    const lines = op.lines.map(line => { const value = String(line).replace(/[{}\\]/g, '').replace(/\s+/g, ' ').trim(); if (!value || value.length > 120) throw opError('Each graphic line needs 1-120 characters.'); return value; });
    const title = canvas ? String(op.title || '').replace(/[\x00-\x1F]/g, ' ').trim().slice(0, 80) : '';
    if (canvas) canvasData(op.template, title, lines);
    const clash = timeline.graphics.find(item => item.status === 'accepted' && start < item.start + item.frames && item.start < start + frames);
    if (clash) throw opError(`It would overlap the ${clash.template} at ${(clash.start / fps).toFixed(1)} s; one graphic is on screen at a time.`);
    const number = timeline.graphics.filter(item => item.origin === 'owner').length + 1;
    const accent = op.template === 'title-card' ? accentOf(op.accent ? `${lines.join(' ')} *${op.accent}*` : lines.join(' ')) : null;
    const graphic = {id: `gr_owner_${number}`, template: op.template, start, frames, title, lines: lines.map(line => line.replace(/\*/g, '')), accent: accent ? accent.accent : null, accentSource: accent ? (op.accent ? 'owner' : accent.accentSource) : null,
      sceneId: (timeline.clips.find(clip => start >= clip.start && start < clip.start + clip.frames) || timeline.clips[0]).sceneId, origin: 'owner', status: 'accepted', renderer: canvas ? 'canvas' : 'ass', finish: canvas ? finishFor(spec) : undefined,
      reason: 'Added by the owner.', skill: null};
    timeline.graphics.push(graphic);
    timeline.graphics.sort((a, b) => a.start - b.start);
    receipt.changed.push(graphic.id);
  } else if (op.type === 'reorder') {
    const index = findClip(timeline, op.clipId), clip = timeline.clips[index];
    if (clip.sceneId !== op.sceneId) throw opError('Clips can only be reordered inside their own scene.');
    const members = timeline.clips.map((item, k) => ({item, k})).filter(entry => entry.item.sceneId === op.sceneId);
    if (!Number.isSafeInteger(op.toIndex) || op.toIndex < 0 || op.toIndex >= members.length) throw opError('That position is outside the scene.');
    const lengths = members.map(entry => entry.item.frames);
    const ordered = members.map(entry => entry.item).filter(item => item.id !== clip.id);
    ordered.splice(op.toIndex, 0, clip);
    // Positions keep their lengths (the cuts stay on the sentence breaks); the pictures move.
    let cursor = members[0].item.start;
    ordered.forEach((item, k) => { item.start = cursor; item.frames = lengths[k]; cursor += lengths[k]; });
    members.forEach((entry, k) => { timeline.clips[entry.k] = ordered[k]; });
    clip.reason = `Moved to position ${op.toIndex + 1} in its scene by the owner.`;
    receipt.changed.push(...ordered.map(item => item.id));
  } else if (op.type === 'set-audio') {
    timeline.audio = Audio.settings(op.settings);
    receipt.changed.push('audio');
  } else if (op.type === 'set-captions') {
    if (!timeline.captions) throw opError('This edit was drafted before captions existed. Draft a fresh edit to get captions.');
    if (typeof op.enabled !== 'boolean') throw opError('Captions must be switched on or off.');
    if (timeline.captions.enabled === op.enabled) throw opError(`Captions are already ${op.enabled ? 'on' : 'off'}.`);
    timeline.captions.enabled = op.enabled;
    receipt.changed.push('captions');
  }
  validateTimeline(timeline);
  return {timeline, receipt};
}

// Single-scene repair: take one scene's clips and inner joins from a fresh take and keep everything else
// (other scenes, the owner's graphics decisions, the joins at the scene's edges) exactly as it was.
function spliceScene(current, fresh, sceneId) {
  const timeline = structuredClone(current);
  const range = list => { const first = list.findIndex(clip => clip.sceneId === sceneId); let last = first; while (last + 1 < list.length && list[last + 1].sceneId === sceneId) last++; return [first, last]; };
  const [a0, a1] = range(timeline.clips), [b0, b1] = range(fresh.clips);
  if (a0 < 0 || b0 < 0) throw opError('That scene is not in this edit.');
  if (timeline.clips[a0].start !== fresh.clips[b0].start || timeline.clips[a1].start + timeline.clips[a1].frames !== fresh.clips[b1].start + fresh.clips[b1].frames) throw opError('The scene timing changed; generate a new edit instead.');
  const before = timeline.joins.slice(0, a0), after = timeline.joins.slice(a1);
  timeline.clips.splice(a0, a1 - a0 + 1, ...structuredClone(fresh.clips.slice(b0, b1 + 1)));
  timeline.joins = [...before, ...structuredClone(fresh.joins.slice(b0, b1)), ...after];
  const scene = timeline.scenes.find(item => item.id === sceneId);
  scene.variant = fresh.scenes.find(item => item.id === sceneId).variant;
  // A soft transition at the scene's edge must still fit its new neighbours.
  for (const index of [a0 - 1, a0 + (b1 - b0)]) {
    const join = timeline.joins[index];
    if (!join || join.type === 'cut') continue;
    const most = Math.floor(Math.min(timeline.clips[index].frames, timeline.clips[index + 1].frames) / 2);
    if (join.frames > most) join.frames = Math.max(2, most);
    if (most < 2) timeline.joins[index] = {type: 'cut', frames: 0, reason: 'The repaired scene is too short for the soft transition; it became a hard cut.', skill: SKILL.transitions};
  }
  timeline.ending.fadeOutFrames = Math.min(timeline.ending.fadeOutFrames, Math.floor(timeline.clips[timeline.clips.length - 1].frames / 2));
  validateTimeline(timeline);
  return timeline;
}

// ---------------------------------------------------------------- graphics overlay (ASS for libass)

const assTime = value => { const cs = Math.max(0, Math.round(value * 100)); return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, '0')}:${String(Math.floor(cs / 100) % 60).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`; };
const assColor = (hex, alpha = 0) => { const value = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''))?.[1] || 'FFFFFF'; return `&H${alpha.toString(16).padStart(2, '0').toUpperCase()}${value.slice(4, 6)}${value.slice(2, 4)}${value.slice(0, 2)}`.toUpperCase(); };
const assInline = hex => `&H${(/^#?([0-9a-f]{6})$/i.exec(String(hex || ''))?.[1] || 'FFFFFF').replace(/^(..)(..)(..)$/, '$3$2$1').toUpperCase()}&`;
const assText = value => String(value).replace(/\\/g, '').replace(/[{}]/g, '').replace(/\r?\n/g, '\\N');
const easeOutCubic = value => 1 - (1 - value) ** 3;
// One graphic's entrance as five linear steps that follow easeOutCubic (within about a pixel of the curve),
// then a hold and a fade. `body` is the styled text; `rise` is in script pixels.
function easedEvents({layer, style, start, inSeconds, holdSeconds, outSeconds, x, y, rise, body}) {
  const events = [], steps = 5;
  for (let k = 0; k < steps; k++) {
    const p0 = easeOutCubic(k / steps), p1 = easeOutCubic((k + 1) / steps);
    const a0 = Math.round(255 * (1 - p0)), a1 = Math.round(255 * (1 - p1));
    const t0 = start + inSeconds * k / steps, t1 = start + inSeconds * (k + 1) / steps;
    events.push(`Dialogue: ${layer},${assTime(t0)},${assTime(t1)},${style},,0,0,0,,{\\move(${x},${round(y + rise * (1 - p0), 1)},${x},${round(y + rise * (1 - p1), 1)})\\alpha&H${a0.toString(16).padStart(2, '0').toUpperCase()}&\\t(\\alpha&H${a1.toString(16).padStart(2, '0').toUpperCase()}&)}${body}`);
  }
  const holdStart = start + inSeconds;
  events.push(`Dialogue: ${layer},${assTime(holdStart)},${assTime(holdStart + holdSeconds)},${style},,0,0,0,,{\\pos(${x},${y})}${body}`);
  events.push(`Dialogue: ${layer},${assTime(holdStart + holdSeconds)},${assTime(holdStart + holdSeconds + outSeconds)},${style},,0,0,0,,{\\pos(${x},${y})\\t(\\alpha&HFF&)}${body}`);
  return events;
}
// Builds the ASS script for every accepted graphic. Script coordinates are 1920x1080 (or 1080x1920 for
// Shorts); libass scales them to the render size, so the proxy and the final render share one layout.
function graphicsAss(timeline, spec) {
  const captions = Cap.assParts(timeline, spec, CAPTION_CLEARS);
  const vertical = timeline.format === 'shorts';
  const W = vertical ? 1080 : 1920, H = vertical ? 1920 : 1080, M = vertical ? 96 : 144;
  const palette = spec.palette || {}, type = spec.typography || {};
  const heading = (type.headingFont || 'Arial').replace(/,/g, ' '), body = (type.bodyFont || 'Arial').replace(/,/g, ' ');
  const ink = assColor(palette.primary || '#F4F2EC'), accent = assColor(palette.accent || '#C8FF3D'), bg = assColor(palette.background || '#0B0B0F');
  const inkInline = assInline(palette.primary || '#F4F2EC'), accentInline = assInline(palette.accent || '#C8FF3D');
  const textSize = Math.max(48, Math.round(H * Math.max(4, type.minTextHeightPercent || 4) / 100 * 1.3));
  const styles = [
    `Style: Card,${heading},${vertical ? 112 : 144},${ink},${ink},&H00000000,&H00000000,-1,0,0,0,100,100,-1,0,1,0,0,4,${M},${M},0,1`,
    `Style: Panel,${body},10,${bg},${bg},&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1`,
    `Style: Text,${body},${textSize},${ink},${ink},&H70000000,&H70000000,-1,0,0,0,100,100,0,0,3,14,0,1,${M},${M},0,1`,
    `Style: Stat,${heading},${vertical ? 150 : 190},${accent},${accent},&H90000000,&H90000000,-1,0,0,0,100,100,0,0,1,4,2,5,${M},${M},0,1`,
    `Style: Label,${body},${vertical ? 48 : 52},${ink},${ink},&H90000000,&H90000000,0,0,0,0,100,100,0,0,1,3,1,5,${M},${M},0,1`,
    `Style: Stamp,${body},${vertical ? 40 : 44},${ink},${ink},&H80000000,&H80000000,-1,0,0,0,100,100,1,0,3,10,0,7,${M},${M},0,1`,
    `Style: Quote,${heading},${vertical ? 58 : 64},${ink},${ink},&H00000000,&H00000000,0,-1,0,0,100,100,0,0,1,0,0,5,${M * 2},${M * 2},0,1`,
  ];
  const events = [];
  const fps = timeline.fps;
  for (const graphic of timeline.graphics.filter(item => item.status === 'accepted' && !CANVAS_TEMPLATES.includes(item.template))) {
    const start = graphic.start / fps, total = graphic.frames / fps;
    const lines = graphic.lines.map(assText);
    if (graphic.template === 'title-card') {
      // The owner's title-card rules: fade in rising 40 px over 0.5 s, hold, fade out 0.25 s, one accent word.
      const words = lines.join(' ');
      const accentWord = graphic.accent ? assText(graphic.accent) : null;
      const styled = accentWord && words.includes(accentWord) ? words.replace(accentWord, `{\\c${accentInline}}${accentWord}{\\c${inkInline}}`) : words;
      const inS = Math.min(0.5, total / 3), outS = Math.min(0.25, total / 4), hold = Math.max(0.1, total - inS - outS);
      events.push(`Dialogue: 0,${assTime(start)},${assTime(start + total)},Panel,,0,0,0,,{\\pos(0,0)\\fad(${Math.round(inS * 500)},${Math.round(outS * 1000)})\\p1}m 0 0 l ${W} 0 ${W} ${H} 0 ${H}{\\p0}`);
      events.push(...easedEvents({layer: 1, style: 'Card', start, inSeconds: inS, holdSeconds: hold, outSeconds: outS, x: M, y: H / 2, rise: 40, body: styled}));
    } else if (graphic.template === 'stat') {
      const inS = 0.4, outS = 0.25, hold = Math.max(0.1, total - inS - outS);
      events.push(...easedEvents({layer: 1, style: 'Stat', start, inSeconds: inS, holdSeconds: hold, outSeconds: outS, x: W / 2, y: H * 0.44, rise: 24, body: lines[0]}));
      if (lines[1]) events.push(...easedEvents({layer: 1, style: 'Label', start: start + 0.2, inSeconds: inS, holdSeconds: Math.max(0.1, hold - 0.2), outSeconds: outS, x: W / 2, y: H * 0.44 + (vertical ? 130 : 150), rise: 16, body: lines[1]}));
    } else if (graphic.template === 'date') {
      const inS = 0.35, outS = 0.25, hold = Math.max(0.1, total - inS - outS);
      events.push(...easedEvents({layer: 1, style: 'Stamp', start, inSeconds: inS, holdSeconds: hold, outSeconds: outS, x: M, y: vertical ? 220 : 120, rise: 12, body: `{\\c${accentInline}}▍{\\c${inkInline}}${lines.join(' · ')}`}));
    } else if (graphic.template === 'quote') {
      const inS = 0.45, outS = 0.3, hold = Math.max(0.1, total - inS - outS);
      events.push(`Dialogue: 0,${assTime(start)},${assTime(start + total)},Panel,,0,0,0,,{\\pos(0,0)\\alpha&H60&\\fad(${Math.round(inS * 1000)},${Math.round(outS * 1000)})\\p1}m 0 0 l ${W} 0 ${W} ${H} 0 ${H}{\\p0}`);
      events.push(...easedEvents({layer: 1, style: 'Quote', start, inSeconds: inS, holdSeconds: hold, outSeconds: outS, x: W / 2, y: H / 2, rise: 20, body: `“${lines.join(' ')}”`}));
    } else {
      const inS = 0.35, outS = 0.25, hold = Math.max(0.1, total - inS - outS);
      events.push(...easedEvents({layer: 1, style: 'Text', start, inSeconds: inS, holdSeconds: hold, outSeconds: outS, x: M, y: Math.round(H * (vertical ? 0.3 : 0.8)), rise: 16, body: lines.join('\\N')}));
    }
  }
  // Captions ride on the top layer, above every graphic and canvas overlay.
  events.push(...captions.events);
  if (!events.length) return null;
  return ['[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${W}`, `PlayResY: ${H}`, 'WrapStyle: 0', 'ScaledBorderAndShadow: yes', '',
    '[V4+ Styles]', 'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding', ...styles, ...captions.styles, '',
    '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text', ...events, ''].join('\n');
}

const timelineHash = timeline => createHash('sha256').update(JSON.stringify(timeline)).digest('hex');

module.exports = {
  SCHEMA, PURPOSE_REGISTER, MOVES, TRANSITIONS, GRAPHIC_TEMPLATES, CANVAS_TEMPLATES, OP_TYPES, SKILL, CAPTION_CLEARS,
  canvasData, canvasMinimumSeconds, parseValue, parseYear, finishFor,
  pausesFromSilence, alignSentences, allocate, autoEdit, proposeGraphics, accentOf, critique, applyOp, spliceScene, validateTimeline, cleanWindow,
  graphicsAss, timelineHash, shortHash, graphicDwellSeconds,
};
