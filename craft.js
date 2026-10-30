'use strict';
// YouTube craft checks: hooks, title and thumbnail pairing, chapters, Shorts spans, outliers and
// retention exports. Pure and deterministic: no clock, network or randomness.
// Ported from youtube-agent-skill by Jake Schincariol (MIT, revision a2feb21, licence in
// vendor/youtube-agent-skill): hookscore.py, title.py, chapters.py, swipe.py and retention.py. The
// Shorts rules restate yt-shorts/SKILL.md. The scorers read English only. A low score is a reason to
// look again; a high score is never a promise (the upstream measurement says the same).
const HOOK_DATA = require('./vendor/youtube-agent-skill/hooks.json');

const FORMULAS = Object.freeze(HOOK_DATA.hooks.map(item => Object.freeze({
  id: item.id, name: item.name, shape: item.shape, example: item.example, failsWhen: item.fails_when,
  patterns: item.match.map(pattern => new RegExp(pattern, 'i')),
})));
const HOOK_RULES = Object.freeze([...HOOK_DATA.rules]);
const isEnglish = locale => !locale || /^en(?:-|$)/i.test(String(locale));
const round = (value, places = 2) => Math.round(value * 10 ** places) / 10 ** places;
const clamp100 = value => Math.max(0, Math.min(100, value));
const hits = (pattern, value) => (String(value).match(pattern) || []).length;

// ---------------------------------------------------------------- hooks (hookscore.py)

const HOOK_FILLER = new Set('basically actually literally just really very so kind sort like guys hey welcome today video subscribe channel'.split(' '));
const HOOK_VAGUE = new Set('amazing incredible insane crazy huge massive game changer secret powerful ultimate best revolutionary mind blowing unbelievable'.split(' '));
const CONCRETE = /\b(\d[\d,.]*\s?(%|k|m|x|s|m|h)?|\$\d|\d+\s?(second|minute|hour|day|week|month|year)s?)\b/gi;
const YOU = /\b(you|your|you're|youre|yourself)\b/gi;
const STAKE = /\b(lose|lost|wasting|waste|quit|fail|broke|cost|risk|before|stop|never|die|dying|dead)\b/gi;
const CURIOSITY = /\b(why|how|what|which|until|before|but|nobody|almost|except|reason|actually)\b/gi;
const hookWords = value => String(value).toLowerCase().match(/[a-z0-9'%$.]+/g) || [];
const tokens = value => String(value).trim().split(/\s+/).filter(Boolean);

const HOOK_PROPERTIES = Object.freeze({
  specificity(t) {
    const w = hookWords(t);
    if (!w.length) return 0;
    let s = 34 + hits(CONCRETE, t) * 22 - w.filter(x => HOOK_VAGUE.has(x)).length * 16 - w.filter(x => HOOK_FILLER.has(x)).length * 5;
    // Capitalised words after the first read as named things.
    s += Math.min(18, 6 * tokens(t).slice(1).filter(x => /^\p{Lu}/u.test(x)).length);
    return clamp100(s);
  },
  address: t => clamp100(26 + hits(YOU, t) * 20 + (hits(YOU, tokens(t).slice(0, 6).join(' ')) ? 30 : 0)),
  stakes: t => clamp100(22 + hits(STAKE, t) * 26 + (hits(CONCRETE, t) ? 14 : 0)),
  // A hook that answers itself has no gap left.
  curiosity: t => clamp100(24 + hits(CURIOSITY, t) * 17 + (String(t).trim().endsWith('?') ? 18 : 0) - (/\b(because|so that|which means)\b/i.test(t) ? 18 : 0)),
  brevity(t) {
    const n = hookWords(t).length;
    if (!n) return 0;
    // 9-24 words is what a spoken hook fits inside ten seconds at about 150 words a minute.
    if (n >= 9 && n <= 24) return 100;
    return n < 9 ? Math.max(30, 100 - (9 - n) * 11) : Math.max(10, 100 - (n - 24) * 7);
  },
});
const HOOK_FIX = Object.freeze({
  specificity: 'Swap one adjective for a number, a name or a date.',
  address: 'Say "you" in the first six words.',
  stakes: 'Name what it costs the viewer to keep doing it the current way.',
  curiosity: 'Cut the half of the sentence that answers itself.',
  brevity: 'Use 9 to 24 words. Read it out loud and stop where the breath runs out.',
});
const hookBand = verdict => (verdict >= 72 ? 'strong' : verdict >= 55 ? 'workable' : 'weak');

function classifyFormula(text) {
  let best = null, matched = 0;
  for (const formula of FORMULAS) {
    const n = formula.patterns.filter(pattern => pattern.test(text)).length;
    if (n > matched) { best = formula; matched = n; }
  }
  return best ? {id: best.id, name: best.name, matched} : null;
}

function scoreHook(text, {locale = 'en'} = {}) {
  const hook = String(text || '').trim();
  if (!isEnglish(locale)) return {applicable: false, reason: 'The hook scorer reads English only.'};
  if (!hook) return {applicable: false, reason: 'There is no hook to score.'};
  const properties = Object.fromEntries(Object.entries(HOOK_PROPERTIES).map(([name, fn]) => [name, fn(hook)]));
  const values = Object.values(properties);
  // 60% the mean and 40% the weakest: a hook leaks at its dead property, and averaging hides that.
  const verdict = Math.round(0.6 * values.reduce((sum, value) => sum + value, 0) / values.length + 0.4 * Math.min(...values));
  const weakest = Object.keys(properties).reduce((low, name) => (properties[name] < properties[low] ? name : low));
  const formula = classifyFormula(hook);
  return {applicable: true, properties, verdict, band: hookBand(verdict), formula, weakest, fix: HOOK_FIX[weakest], why: hookReasons(hook), words: hookWords(hook).length,
    note: formula ? null : 'No hook formula matched. That is usually a summary, not a hook.'};
}
// What each number read in the hook line, in plain words (owner review 2026-10-30: the scores looked random). Each
// score starts from a base (Specific 34, "you" 26, Stakes 22, Open question 24) and rises with what it finds.
function hookReasons(hook) {
  const found = pattern => [...new Set((String(hook).match(pattern) || []).map(item => item.trim().toLowerCase()))], n = hookWords(hook).length;
  const names = tokens(hook).slice(1).filter(word => /^\p{Lu}/u.test(word)).map(word => word.replace(/[^\p{L}\p{N}'-]+$/u, '')), figures = found(CONCRETE), you = found(YOU), stakes = found(STAKE), open = found(CURIOSITY);
  return {
    specificity: figures.length || names.length ? `Found ${[...figures, ...names].slice(0, 4).join(', ')}.` : 'No number, name or date in the hook, so it stays at the base score.',
    address: you.length ? `Says ${you.join(', ')}${hits(YOU, tokens(hook).slice(0, 6).join(' ')) ? ' in the first six words' : ', but not in the first six words'}.` : 'Never says "you", so it stays at the base score.',
    stakes: stakes.length ? `Names what is at stake: ${stakes.join(', ')}.` : 'No word for what the viewer loses or risks, so it stays at the base score.',
    curiosity: open.length || hook.endsWith('?') ? `Opens a question${open.length ? ` (${open.join(', ')})` : ''}${hook.endsWith('?') ? ' and ends with a question mark' : ''}.` : 'Leaves no question open, so it stays at the base score.',
    brevity: `${n} word${n === 1 ? '' : 's'}; a spoken hook fits 9 to 24 words (about ten seconds).`,
  };
}

// ---------------------------------------------------------------- title + thumbnail (title.py)

const TITLE_LIMITS = Object.freeze({desktop: 60, mobile: 40, hard: 100, thumbnailWords: 4});
const TITLE_VAGUE = new Set('amazing incredible insane crazy huge massive ultimate best powerful secret revolutionary mindblowing epic perfect complete everything'.split(' '));
const TITLE_STOP = new Set('the a an of for to in on and or is are with your you my i this that it how what why'.split(' '));
const titleWords = value => String(value).toLowerCase().match(/[a-z0-9']+/g) || [];
const shouting = word => word.length > 2 && /\p{L}/u.test(word) && word === word.toUpperCase() && word !== word.toLowerCase();

// The pairing is the unit: a thumbnail that repeats the title wastes half the click surface.
function lintPackaging({title, thumbnailText = '', locale = 'en'} = {}) {
  const t = String(title || '').trim(), n = [...t].length, issues = [], good = [];
  const issue = (code, message) => issues.push({code, message});
  if (n > TITLE_LIMITS.hard) issue('length', `${n} characters. YouTube's hard limit is ${TITLE_LIMITS.hard}.`);
  else if (n > TITLE_LIMITS.desktop) issue('length', `${n} characters. Desktop search cuts near ${TITLE_LIMITS.desktop}.`);
  else good.push(`${n} characters, inside the ${TITLE_LIMITS.desktop}-character desktop cut.`);
  if (n > TITLE_LIMITS.mobile) {
    const head = t.slice(0, TITLE_LIMITS.mobile).replace(/\s+\S*$/, '');
    issue('mobile', `A mobile feed shows about "${head}…". Check that the subject survives.`);
  }
  if (!isEnglish(locale)) return {applicable: false, chars: n, score: null, issues, good, reason: 'Only length is checked outside English.'};
  const caps = tokens(t).filter(shouting);
  if (caps.length > 2) issue('shouting', `${caps.length} all-caps words. Two is the ceiling before it reads as spam.`);
  else if (caps.length) good.push(`${caps.length} all-caps word${caps.length === 1 ? '' : 's'} for emphasis.`);
  const vague = [...new Set(titleWords(t).filter(word => TITLE_VAGUE.has(word)))].sort();
  if (vague.length) issue('vague', `${vague.join(', ')}: swap for a number, a name or a date.`);
  const numbers = t.match(/\d[\d,.]*%?/g) || [];
  if (numbers.length) good.push(`Carries a concrete figure (${numbers.slice(0, 3).join(', ')}).`);
  else issue('no-number', 'No number, date or name. That is the most reliable single fix.');
  if (t.endsWith('?')) good.push('Open question in the title.');
  if (!titleWords(t).slice(0, 3).some(word => !TITLE_STOP.has(word))) issue('front-load', 'The first three words are all filler. Move the subject forward.');
  const thumb = String(thumbnailText || '').trim();
  if (thumb) {
    const titleSet = new Set(titleWords(t).filter(word => !TITLE_STOP.has(word)));
    const shared = [...new Set(titleWords(thumb).filter(word => !TITLE_STOP.has(word) && titleSet.has(word)))].sort();
    if (shared.length) issue('duplicate', `The thumbnail repeats the title on ${shared.join(', ')}. The thumbnail should say what the title does not.`);
    else good.push('Thumbnail and title carry different words.');
    const count = titleWords(thumb).length;
    if (count > TITLE_LIMITS.thumbnailWords) issue('thumb-length', `${count} words on the thumbnail. Three is the ceiling at feed size.`);
  }
  return {applicable: true, chars: n, score: clamp100(100 - 14 * issues.length + 4 * good.length), issues, good, formula: classifyFormula(t)};
}

// ---------------------------------------------------------------- chapters (chapters.py)

const CHAPTER_STOP = new Set(('the a an of for to in on and or is are was were be been with this that it as at by from you your i my we our they them he she but so if then than there here what which who how when where why not no yes do does did just really very like about into over out up down can could will would should have has had get got make made go going went one two ' +
  'every most many much more less still even never always once since until also only first last their these those each other some such same back long well thing things people because without within whom').split(' '));
const CHAPTER_EDGE = 3;
const CHAPTER_MIN_SECONDS = 10;
const keywords = value => [...new Set((String(value).toLowerCase().match(/[a-z']{4,}/g) || []).filter(word => !CHAPTER_STOP.has(word)))];
function clock(seconds) {
  const t = Math.floor(seconds), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

// cues: [{start, end, text, gap?, sceneStart?, paragraphStart?}] in seconds. Boundaries are scored by the
// pause before them and how much the vocabulary changes across them (upstream weights); a scene start adds a
// point and a paragraph break of the approved script adds 1.5, because the writer's own sections are the
// best evidence. The first and last three sentences are never a break: with so little text on one side the
// vocabulary always looks new. The titles are topic words for the owner to rewrite, not finished names.
function chapterize(cues, {target = 7} = {}) {
  if (!Array.isArray(cues) || cues.length < 6) return {valid: false, chapters: [], text: '', problems: ['Too few sentences to chapter (6 or more are needed).']};
  const duration = cues[cues.length - 1].end, candidates = [];
  for (let i = CHAPTER_EDGE; i <= cues.length - CHAPTER_EDGE; i++) {
    const gap = cues[i].gap ?? Math.max(0, cues[i].start - cues[i - 1].end);
    const before = new Set(keywords(cues.slice(Math.max(0, i - 12), i).map(cue => cue.text).join(' ')));
    const after = new Set(keywords(cues.slice(i, i + 12).map(cue => cue.text).join(' ')));
    const union = new Set([...before, ...after]), shared = [...before].filter(word => after.has(word)).length;
    const shift = union.size ? 1 - shared / union.size : 0;
    candidates.push({score: gap * 1.6 + shift * 3.2 + (cues[i].sceneStart ? 1 : 0) + (cues[i].paragraphStart ? 1.5 : 0), start: cues[i].start});
  }
  candidates.sort((a, b) => b.score - a.score || a.start - b.start);
  const picked = [0];
  for (const {start} of candidates) {
    if (picked.length >= target) break;
    if (picked.every(at => Math.abs(start - at) >= CHAPTER_MIN_SECONDS) && duration - start >= CHAPTER_MIN_SECONDS) picked.push(start);
  }
  picked.sort((a, b) => a - b);
  const chapters = picked.map((start, index) => {
    const end = index + 1 < picked.length ? picked[index + 1] : duration;
    const text = cues.filter(cue => cue.start >= start && cue.start < end).map(cue => cue.text).join(' ').toLowerCase();
    const count = word => text.split(word).length - 1;
    const title = keywords(text).map((word, order) => ({word, order, n: count(word)})).sort((a, b) => b.n - a.n || a.order - b.order).slice(0, 3)
      .map(item => item.word[0].toUpperCase() + item.word.slice(1)).join(' ') || 'Section';
    return {start: round(start), label: clock(start), title, seconds: round(end - start)};
  });
  const problems = [];
  if (chapters.length < 3) problems.push('YouTube needs at least 3 chapters.');
  if (chapters[0]?.start !== 0) problems.push('The first chapter must start at 0:00.');
  if (chapters.some(item => item.seconds < CHAPTER_MIN_SECONDS)) problems.push('Every chapter must be at least 10 seconds long.');
  return {valid: !problems.length, chapters, problems, text: chapters.map(item => `${item.label} ${item.title}`).join('\n')};
}

// ---------------------------------------------------------------- Shorts spans (yt-shorts)

// A Short is a moment that survives without the video around it: it opens on a complete thought,
// has a turn (a claim, then something that complicates or proves it) and ends on a line.
const LEANS_BACK = /^(and|but|so|or|because|also|then|plus|which|this|that|these|those|it|its|it's|they|them|he|she|his|her|their|here|there|however|still|yet|now|again|since then|after that|by then|as a result|even so|instead|meanwhile|later|within (?:a|an|the) [a-z]+ (?:years?|months?|days?|weeks?|decades?))\b/i;
const COMPLICATES = /\b(but|however|instead|until|except|actually|yet|unless|despite|although|turns out|the catch|the problem)\b/i;
const PROVES = /\b(for example|for instance|here's why|that's why|which means|in fact|the result|study|studies|data|proof|\d)/i;
const ENDS_ON_A_LINE = /[.!?…]["'”’)\]]*$/;

function findShorts(cues, {min = 20, max = 55, limit = 5, locale = 'en'} = {}) {
  if (!isEnglish(locale)) return {applicable: false, reason: 'The Shorts finder reads English only.', candidates: []};
  const spans = [];
  for (let i = 0; i < cues.length; i++) {
    const first = cues[i].text.trim();
    if (LEANS_BACK.test(first) || tokens(first).length < 4) continue;
    const hook = scoreHook(first, {locale});
    let best = null;
    for (let j = i + 1; j < cues.length && cues[j].end - cues[i].start <= max; j++) {
      const seconds = cues[j].end - cues[i].start, last = cues[j].text.trim();
      if (seconds < min || !ENDS_ON_A_LINE.test(last) || tokens(last).length < 4) continue;
      const body = cues.slice(i + 1, j + 1);
      const turn = body.find(cue => COMPLICATES.test(cue.text)) || null, proof = body.find(cue => PROVES.test(cue.text)) || null;
      if (!turn && !proof) continue;
      const score = Math.round(hook.verdict + (turn ? 15 : 0) + (proof ? 10 : 0) - Math.abs(seconds - 38) * 0.5);
      if (!best || score > best.score) best = {start: round(cues[i].start), end: round(cues[j].end), seconds: round(seconds, 1), score, firstLine: first, lastLine: last, turnLine: (turn || proof).text.trim(),
        hook: {verdict: hook.verdict, band: hook.band, formula: hook.formula?.name || null, fix: hook.fix},
        why: [turn ? 'Has a turn that complicates the opening claim.' : null, proof ? 'Backs the claim with an example or a figure.' : null, `${round(seconds, 1)} s fits the 20-55 s window.`].filter(Boolean)};
    }
    if (best) spans.push(best);
  }
  spans.sort((a, b) => b.score - a.score || a.start - b.start);
  const candidates = [];
  for (const span of spans) {
    if (candidates.length >= limit) break;
    if (candidates.every(other => span.end <= other.start || span.start >= other.end)) candidates.push(span);
  }
  return {applicable: true, candidates, writing: ['Write a new first line: the long video\'s line assumes context a Shorts viewer lacks. Score it before use.', 'Put on-screen text in the first two seconds, using different words from the spoken line.', 'Plan a loop point: the last line sets up what the first line answers.', 'Check the vertical crop: note what a 9:16 frame cuts from each 16:9 shot.']};
}

// ---------------------------------------------------------------- outliers (swipe.py)

const median = values => {
  const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2);
  return sorted.length ? (sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2) : 0;
};
// Raw views rank channel size, not ideas: each video is scored as a multiple of its own channel's
// median, which needs at least four videos per channel to mean anything. baseline is the sample the
// median comes from (recent uploads); a list of known outliers would inflate it.
function outlierMultiples(videos, {baseline = videos} = {}) {
  const views = baseline.map(video => Number(video.views)).filter(Number.isFinite);
  if (views.length < 4) return {median: null, enough: false, videos: videos.map(video => ({videoId: video.videoId, multiple: null, formula: classifyFormula(video.title || '')?.name || null}))};
  const med = median(views);
  return {median: Math.round(med), enough: true, videos: videos.map(video => ({videoId: video.videoId, multiple: med && Number.isFinite(Number(video.views)) ? round(Number(video.views) / med) : null, formula: classifyFormula(video.title || '')?.name || null}))};
}

// ---------------------------------------------------------------- retention export (retention.py)

function csvFields(line) {
  const fields = [];
  let field = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) { if (ch === '"' && line[i + 1] === '"') { field += '"'; i++; } else if (ch === '"') quoted = false; else field += ch; }
    else if (ch === '"') quoted = true;
    else if (ch === ',') { fields.push(field); field = ''; }
    else field += ch;
  }
  fields.push(field);
  return fields;
}
// Reads a YouTube Studio audience-retention CSV (a position and a percentage still watching) and
// separates the three problems: the hook leak (first 30 s), cliffs (steep single drops) and the slide
// (steady bleed across the middle). cues map each cliff to what the narration said there.
function analyseRetention(csvText, {durationSeconds = null, cues = []} = {}) {
  const rows = [];
  for (const line of String(csvText || '').replace(/^﻿/, '').split(/\r?\n/)) {
    const values = csvFields(line).map(field => field.trim().replace(/[%,]/g, '')).filter(Boolean).map(Number).filter(Number.isFinite);
    if (values.length >= 2) rows.push([values[0], values[1]]);
  }
  if (rows.length < 8) return {ok: false, reason: 'Could not read at least 8 data points. Export "Audience retention" from YouTube Studio as CSV.'};
  const xs = rows.map(row => row[0]), ys = rows.map(row => row[1]);
  const percentAxis = Math.max(...xs) <= 100.5, duration = Number(durationSeconds) > 0 ? Number(durationSeconds) : null;
  const at = x => (percentAxis ? (duration ? x / 100 * duration : null) : x);
  const start = ys[0] || 100;
  const cutoff = !percentAxis ? 30 : duration ? 30 / duration * 100 : 10;
  const opening = rows.filter(([x]) => x <= cutoff).map(([, y]) => y);
  const hookLeak = round(start - (opening.length ? Math.min(...opening) : start));
  const drops = [];
  for (let i = 1; i < rows.length; i++) {
    const lost = ys[i - 1] - ys[i], span = xs[i] - xs[i - 1] || 1;
    drops.push({rate: lost / span, from: xs[i - 1], to: xs[i], lost});
  }
  const byRate = [...drops].sort((a, b) => b.rate - a.rate);
  const said = seconds => (seconds === null ? null : cues.filter(cue => cue.start <= seconds + 4 && cue.end >= seconds - 4).map(cue => cue.text).join(' ').slice(0, 140) || null);
  const cliffs = byRate.slice(0, 5).filter(drop => drop.lost > 0.8).map(drop => {
    const seconds = at(drop.from);
    return {from: round(drop.from), to: round(drop.to), lost: round(drop.lost), atSeconds: seconds === null ? null : round(seconds, 1), said: said(seconds)};
  });
  const middle = drops.filter(drop => drop.from > cutoff).map(drop => drop.rate);
  const slide = middle.length ? round(middle.reduce((sum, value) => sum + value, 0) / middle.length, 3) : 0;
  const verdict = hookLeak < 25 ? 'healthy' : hookLeak < 40 ? 'leaking' : 'severe';
  // An audit ends in ONE fix: the biggest problem first.
  const fix = hookLeak >= 25 ? `Fix the opening first: ${hookLeak}% left in the first 30 seconds (under 25 is healthy). Rewrite the first line before anything else.`
    : cliffs.length ? `Look at ${cliffs[0].atSeconds !== null ? clock(cliffs[0].atSeconds) : `position ${cliffs[0].from}`}: ${cliffs[0].lost}% left at once${cliffs[0].said ? ` while the narration said "${cliffs[0].said}"` : ''}. Cut or tighten that moment.`
      : 'The loss is a steady slide, which is pacing, not content. Cut the middle; do not rewrite it.';
  return {ok: true, points: rows.length, axis: percentAxis ? 'percent' : 'seconds', start, end: ys[ys.length - 1], hookLeak, verdict, cliffs, slide, fix};
}

// ---------------------------------------------------------------- the family's writing voice

// Words the channel never uses are enforced; its own phrases, audience person and refused claims go to
// the writer as instructions because no regex can verify them.
function neverWordsUsed(text, voice) {
  const words = voice?.neverWords || [];
  const source = String(text || '');
  return words.filter(word => new RegExp(`(?<![\\p{L}\\p{N}])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu').test(source));
}

module.exports = {FORMULAS, HOOK_RULES, TITLE_LIMITS, CHAPTER_MIN_SECONDS, scoreHook, classifyFormula, lintPackaging, chapterize, clock, findShorts, outlierMultiples, analyseRetention, neverWordsUsed, median};
