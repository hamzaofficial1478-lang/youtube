'use strict';
// P07 Captions: word timing inside the narration's measured pauses, caption groups, scarce emphasis,
// the burned-in ASS rail and the SRT sidecar. Pure and deterministic: no I/O, clock or randomness.
// Doctrine (skills): captions.voice-grouping and captions.rail-and-emphasis (HyperFrames),
// captions.keep-out-band, editing.caption-spec, timeline.auto-caption-segmentation, timeline.caption-qc-rules.

const SCHEMA = 'ytprod.captions/1';
const METHOD = 'estimated';
const SKILL = Object.freeze({grouping: 'captions.voice-grouping', rail: 'captions.rail-and-emphasis', keepOut: 'captions.keep-out-band', qc: 'timeline.caption-qc-rules', spec: 'editing.caption-spec'});
// Long-form is a subtitle rail (one or two lines of up to 42 characters); Shorts use short punchy groups
// sized by how fast the words come.
const LIMITS = Object.freeze({
  'long-form': Object.freeze({maxWords: 12, lineChars: 42, maxLines: 2, maxSeconds: 4.5}),
  shorts: Object.freeze({maxWords: 4, lineChars: 22, maxLines: 2, maxSeconds: 2.0}),
});
const PAUSE_BREAK = 0.18, LEAD_IN = 0.08, TAIL = 0.6, GAP_BEFORE_NEXT = 0.05, MIN_GROUP = 0.5, MAX_CPS = 20, MAX_CUE = 7;
const SENTENCE_END = /[.!?…]["'”’)\]]*$/;
const CLAUSE_END = /[,;:—–]["'”’)\]]*$/;
const WEAK_WORDS = /^(a|an|the|of|to|in|on|at|for|with|by|from|and|or|but|as|that|its|their|his|her|our|your|my|is|was|are|were|about|into|onto|over|under|than|like|between|through|without|within|across|toward|towards|upon|who|which|whose|did|do|does|has|have|had|will|would|can|could|should|be|been|being|this|these|those|than|so|if|when|while|because)$/i;
const EMPHASIS_WORDS = /^(never|nobody|nothing|none|only|zero|no|not|cannot|can't|won't|didn't|doesn't|isn't|wasn't)$/i;
const round = (value, places = 3) => Math.round(value * 10 ** places) / 10 ** places;
const bare = token => token.replace(/^[^\p{L}\p{N}$]+|[^\p{L}\p{N}%]+$/gu, '');

// Spoken weight of a word: letters, with digits and symbols counted the way they are said aloud.
function weight(token) {
  const letters = (token.match(/\p{L}/gu) || []).length, digits = (token.match(/\p{N}/gu) || []).length;
  return 1 + letters + digits * 2.2 + (token.includes('%') ? 6 : 0) + (token.includes('$') ? 5 : 0);
}

// Times every word. Each sentence window is measured (cuts sit on real pauses); inside it words share the
// speaking time by spoken weight, and each pause measured inside the sentence is anchored at the clause
// break nearest its time (or the nearest word break), so commas and breaths split the words correctly.
function wordTimings({sentences, pauses = [], narrationSeconds}) {
  const words = [];
  sentences.forEach((sentence, index) => {
    const tokens = String(sentence.text).match(/\S+/g) || [];
    if (!tokens.length) return;
    const windowStart = sentence.startSeconds;
    const windowEnd = index < sentences.length - 1 ? sentences[index + 1].startSeconds : narrationSeconds;
    const lead = pauses.find(pause => pause.start <= windowStart + 0.05 && pause.end > windowStart && pause.end < windowEnd - 0.2);
    const speechStart = lead ? lead.end : windowStart;
    const tail = pauses.find(item => item.start > speechStart + 0.2 && item.start < windowEnd && item.end >= windowEnd - 0.15);
    const speechEnd = tail ? tail.start : windowEnd;
    const inner = pauses.filter(item => item.start > speechStart + 0.1 && item.end < speechEnd - 0.1);
    const weights = tokens.map(weight), total = weights.reduce((sum, value) => sum + value, 0);
    const speaking = Math.max(0.05, speechEnd - speechStart - inner.reduce((sum, item) => sum + item.end - item.start, 0));
    // Boundary b sits after token b-1; its estimated time ignores the pauses before it.
    const cumulative = [0];
    weights.forEach(value => cumulative.push(cumulative[cumulative.length - 1] + value));
    const anchors = [];
    let used = 0, silenceBefore = 0;
    for (const item of inner) {
      let best = null;
      for (let b = used + 1; b < tokens.length; b++) {
        const estimate = speechStart + silenceBefore + cumulative[b] / total * speaking;
        const distance = Math.abs(estimate - item.start), clause = CLAUSE_END.test(tokens[b - 1]);
        // A clause break within 0.8 s wins over a closer plain word break.
        const score = distance - (clause && distance <= 0.8 ? 10 : 0);
        if (!best || score < best.score) best = {b, score};
      }
      if (best) { anchors.push({b: best.b, start: item.start, end: item.end}); used = best.b; }
      silenceBefore += item.end - item.start;
    }
    const cuts = [{b: 0, at: speechStart}, ...anchors.flatMap(anchor => [{b: anchor.b, at: anchor.start, close: true}, {b: anchor.b, at: anchor.end}]), {b: tokens.length, at: speechEnd, close: true}];
    for (let k = 0; k + 1 < cuts.length; k += 2) {
      const from = cuts[k], to = cuts[k + 1], span = cumulative[to.b] - cumulative[from.b] || 1;
      for (let i = from.b; i < to.b; i++) {
        const start = from.at + (cumulative[i] - cumulative[from.b]) / span * (to.at - from.at);
        const end = from.at + (cumulative[i + 1] - cumulative[from.b]) / span * (to.at - from.at);
        words.push({text: tokens[i], start: round(start), end: round(end), sentence: sentence.n ?? index + 1});
      }
    }
  });
  return words;
}

function lineBreak(text, lineChars) {
  if (text.length <= lineChars) return [text];
  const words = text.split(' ');
  let best = null;
  for (let k = 1; k < words.length; k++) {
    const a = words.slice(0, k).join(' '), b = words.slice(k).join(' ');
    const cost = Math.max(a.length, b.length) - (CLAUSE_END.test(words[k - 1]) ? 4 : 0) + (k === 1 || k === words.length - 1 ? 6 : 0) + (WEAK_WORDS.test(words[k - 1]) ? 8 : 0);
    if (!best || cost < best.cost) best = {cost, lines: [a, b]};
  }
  return best.lines;
}
function emphasisScore(word, firstInSentence, english) {
  const token = bare(word);
  if (/\p{N}/u.test(token)) return 3;
  if (english && EMPHASIS_WORDS.test(token)) return 2;
  if (!firstInSentence && token.length >= 3 && /^\p{Lu}/u.test(token) && english) return 1;
  return 0;
}

// Splits one phrase into the fewest captions that fit the limits, choosing the cut points that keep the
// captions even in length; ending a caption on a weak word or leaving a single word alone costs extra.
function splitPhrase(phrase, {maxWords, maxChars, maxSeconds, english}) {
  const n = phrase.length, text = (a, b) => phrase.slice(a, b).map(word => word.text).join(' ');
  // Characters and time are hard limits; the word cap may stretch by one word ("60% of the city") at a cost,
  // which beats ending a caption on a weak word.
  const fits = (a, b) => b - a <= maxWords + 1 && text(a, b).length <= maxChars && phrase[b - 1].end - phrase[a].start <= maxSeconds + 1e-9;
  if (n <= maxWords && fits(0, n)) return [phrase];
  const total = text(0, n).length;
  for (let k = 2; k <= n; k++) {
    const target = total / k, cost = Array.from({length: k + 1}, () => new Array(n + 1).fill(Infinity)), from = Array.from({length: k + 1}, () => new Array(n + 1).fill(-1));
    cost[0][0] = 0;
    for (let j = 1; j <= k; j++) for (let b = j; b <= n; b++) for (let a = j - 1; a < b; a++) {
      if (cost[j - 1][a] === Infinity || !fits(a, b)) continue;
      const c = cost[j - 1][a] + (text(a, b).length - target) ** 2 + (b < n && english && WEAK_WORDS.test(phrase[b - 1].text) ? 400 : 0) + (b - a === 1 ? 200 : 0) + (b - a > maxWords ? 250 : 0);
      if (c < cost[j][b]) { cost[j][b] = c; from[j][b] = a; }
    }
    if (cost[k][n] === Infinity) continue;
    const chunks = [];
    for (let j = k, b = n; j > 0; b = from[j][b], j--) chunks.unshift(phrase.slice(from[j][b], b));
    return chunks;
  }
  return phrase.map(word => [word]);
}

// Groups words into caption cues. Phrases end where the voice breaks (a sentence end, a pause of 0.18 s or
// more, a clause break); a phrase over the format's word, character or time limit (Shorts also by speaking
// rate) is split into the fewest, most even captions, never ending one on a weak word like "the" or "did".
function buildCaptions({sentences, pauses = [], narrationSeconds, format = 'long-form', locale = 'en'}) {
  const limits = LIMITS[format] || LIMITS['long-form'], english = !locale || /^en(?:-|$)/i.test(locale);
  const words = wordTimings({sentences, pauses, narrationSeconds});
  const rate = new Map();
  for (const word of words) { const item = rate.get(word.sentence) || {n: 0, from: word.start, to: word.end}; item.n++; item.to = word.end; rate.set(word.sentence, item); }
  const cap = sentence => {
    if (format !== 'shorts') return limits.maxWords;
    const item = rate.get(sentence), wps = item.n / Math.max(0.2, item.to - item.from);
    return wps > 3.5 ? 2 : wps > 2.5 ? 3 : limits.maxWords;
  };
  const phrases = [];
  let current = [];
  words.forEach((word, index) => {
    current.push(word);
    const next = words[index + 1];
    if (!next || next.sentence !== word.sentence || SENTENCE_END.test(word.text) || next.start - word.end >= PAUSE_BREAK || (CLAUSE_END.test(word.text) && current.length >= 2)) { phrases.push(current); current = []; }
  });
  const raw = phrases.flatMap(phrase => splitPhrase(phrase, {maxWords: cap(phrase[0].sentence), maxChars: limits.lineChars * limits.maxLines, maxSeconds: limits.maxSeconds, english}));
  // A lone word or a flash under half a second joins a neighbour from its own sentence when the limits allow.
  const fits = list => list.length <= cap(list[0].sentence) + 1 && list.map(item => item.text).join(' ').length <= limits.lineChars * limits.maxLines;
  for (let k = 0; k < raw.length; k++) {
    const group = raw[k], short = group.length === 1 || group[group.length - 1].end - group[0].start < MIN_GROUP;
    if (!short) continue;
    const previous = raw[k - 1], next = raw[k + 1];
    // Never across a measured pause or a clause break: those are where the voice itself breaks.
    const joins = (a, b) => a && b && a[0].sentence === b[0].sentence && b[0].start - a[a.length - 1].end < PAUSE_BREAK && !SENTENCE_END.test(a[a.length - 1].text) && !CLAUSE_END.test(a[a.length - 1].text) && fits([...a, ...b]);
    if (joins(previous, group)) { raw.splice(k - 1, 2, [...previous, ...group]); k -= 2; }
    else if (joins(group, next)) { raw.splice(k, 2, [...group, ...next]); k -= 1; }
  }
  const groups = raw.map((list, k) => ({id: `cg${String(k + 1).padStart(3, '0')}`, words: list.map(item => ({text: item.text, start: item.start, end: item.end})), sentence: list[0].sentence}));
  groups.forEach((group, k) => {
    const first = group.words[0], last = group.words[group.words.length - 1], next = groups[k + 1];
    const nextIn = next ? Math.max(0, next.words[0].start - LEAD_IN) : narrationSeconds;
    group.start = round(Math.max(0, first.start - LEAD_IN, k ? groups[k - 1].end : 0));
    group.end = round(Math.max(group.start + 0.1, Math.min(last.end + TAIL, nextIn - GAP_BEFORE_NEXT, narrationSeconds)));
    if (group.end - group.start < MIN_GROUP) group.end = round(Math.min(Math.max(group.end, group.start + MIN_GROUP), nextIn - GAP_BEFORE_NEXT, narrationSeconds));
    group.text = group.words.map(word => word.text).join(' ');
    group.lines = lineBreak(group.text, limits.lineChars);
  });
  // Emphasis is scarce: at most one word per group, never in two groups in a row (skill captions.rail-and-emphasis).
  let previousHad = false, previousSentence = null;
  for (const group of groups) {
    const firstInSentence = group.sentence !== previousSentence;
    const scored = group.words.map((word, index) => ({index, score: emphasisScore(word.text, firstInSentence && index === 0, english)})).sort((a, b) => b.score - a.score || a.index - b.index)[0];
    group.emphasis = !previousHad && scored && scored.score >= 2 ? scored.index : null;
    previousHad = group.emphasis !== null;
    previousSentence = group.sentence;
  }
  return {schema: SCHEMA, method: METHOD, enabled: true, format, groups: groups.map(({sentence, ...group}) => group), note: pauses.length ? 'Sentence starts and clause pauses are measured in the narration; word times inside a phrase are estimated by spoken length.' : 'No pauses were measured, so word times are estimated from word lengths only.', skill: SKILL.grouping};
}

// While a full-frame designed graphic holds text on a vertical frame, the caption rail clears (the
// HyperFrames rail hands off to the peak graphic). Horizontal graphics keep out of the caption band instead.
function clearWindows(timeline, clearTemplates) {
  if (timeline.format !== 'shorts') return [];
  return timeline.graphics.filter(item => item.status === 'accepted' && clearTemplates.includes(item.template)).map(item => ({start: item.start / timeline.fps, end: (item.start + item.frames) / timeline.fps, graphicId: item.id, template: item.template}));
}
function visibleGroups(captions, clears) {
  return captions.groups.filter(group => { const middle = (group.start + group.end) / 2; return !clears.some(window => middle >= window.start && middle < window.end); });
}

// ---------------------------------------------------------------- outputs

const assTime = value => { const cs = Math.max(0, Math.round(value * 100)); return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, '0')}:${String(Math.floor(cs / 100) % 60).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`; };
const assText = value => String(value).replace(/\\/g, '').replace(/[{}]/g, '');
const assInline = hex => `&H${(/^#?([0-9a-f]{6})$/i.exec(String(hex || ''))?.[1] || 'FFD23F').replace(/^(..)(..)(..)$/, '$3$2$1').toUpperCase()}&`;
// The caption style and events for the graphics ASS script (same 1920x1080 / 1080x1920 script space).
function assParts(timeline, spec, clearTemplates) {
  const captions = timeline.captions;
  if (!captions?.enabled) return {styles: [], events: [], hidden: 0};
  const vertical = timeline.format === 'shorts', M = vertical ? 96 : 144;
  const font = ((spec.typography || {}).bodyFont || 'Arial').replace(/,/g, ' ');
  const accent = assInline((spec.palette || {}).accent || '#FFD23F'), white = '&HFFFFFF&';
  const style = `Style: Caption,${font},${vertical ? 80 : 50},&H00FFFFFF,&H00FFFFFF,&H00101010,&H96000000,-1,0,0,0,100,100,0,0,1,${vertical ? 5 : 3},1,2,${M},${M},${vertical ? 620 : 62},1`;
  const clears = clearWindows(timeline, clearTemplates), shown = visibleGroups(captions, clears);
  const events = shown.map((group, k) => {
    const before = k ? group.start - shown[k - 1].end : group.start, after = k + 1 < shown.length ? shown[k + 1].start - group.end : Infinity;
    const fade = `{\\fad(${before > 0.3 ? 150 : 0},${after > 0.3 ? 150 : 0})}`;
    let index = 0;
    const lines = group.lines.map(line => line.split(' ').map(word => { const styled = index === group.emphasis ? `{\\c${accent}}${assText(word)}{\\c${white}}` : assText(word); index++; return styled; }).join(' '));
    return `Dialogue: 5,${assTime(group.start)},${assTime(group.end)},Caption,,0,0,0,,${fade}${lines.join('\\N')}`;
  });
  return {styles: [style], events, hidden: captions.groups.length - shown.length};
}
const srtTime = value => { const ms = Math.max(0, Math.round(value * 1000)); return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
// The SRT and WebVTT sidecars carry every group (platform players draw them, so nothing clears).
function srt(captions) {
  return captions.groups.map((group, k) => `${k + 1}\n${srtTime(group.start)} --> ${srtTime(group.end)}\n${group.lines.join('\n')}\n`).join('\n');
}
const vttText = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function vtt(captions) {
  return `WEBVTT\n\n${captions.groups.map((group, k) => `${k + 1}\n${srtTime(group.start).replace(',', '.')} --> ${srtTime(group.end).replace(',', '.')}\n${group.lines.map(vttText).join('\n')}\n`).join('\n')}`;
}

// ---------------------------------------------------------------- owner corrections

// The owner corrects what one caption says (a spelling, a figure written as digits). Timing never moves:
// it follows the narration. The group keeps the narration's own words, so a reset restores them, and
// *word* marks the one word lifted in the accent colour.
function editCaption(captions, {groupId, text, reset = false} = {}) {
  const problem = message => { throw Object.assign(new Error(message), {status: 400}); };
  const group = captions.groups.find(item => item.id === groupId);
  if (!group) problem('That caption is not in this edit.');
  const limits = LIMITS[captions.format] || LIMITS['long-form'];
  if (reset === true) {
    if (!group.edited) problem('This caption already shows the narration\'s words.');
    group.text = group.words.map(word => word.text).join(' ');
    group.lines = lineBreak(group.text, limits.lineChars);
    group.emphasis = group.originalEmphasis ?? null;
    delete group.edited; delete group.originalEmphasis;
    return group;
  }
  if (typeof text !== 'string') problem('Write the caption text.');
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) problem('A caption needs at least one word. Switch captions off instead of emptying one.');
  if (/[\x00-\x1F\x7F{}\\]|-->/.test(text)) problem('Caption text cannot contain control characters, braces, backslashes or "-->".');
  // Punctuation may sit outside the asterisks: *months*, or "*never*".
  const MARK = /^([^\p{L}\p{N}*]*)\*([^*]+)\*([^\p{L}\p{N}*]*)$/u;
  const marked = tokens.map((token, index) => (MARK.test(token) ? index : -1)).filter(index => index >= 0);
  if (marked.length > 1) problem('Mark at most one word with *asterisks*.');
  const clean = tokens.map(token => token.replace(MARK, '$1$2$3')).join(' ');
  if (clean.includes('*')) problem('Use *asterisks* only around one whole word.');
  if (clean.length > limits.lineChars * limits.maxLines) problem(`A caption holds at most ${limits.lineChars * limits.maxLines} characters on two lines.`);
  const emphasis = marked.length ? marked[0] : null;
  if (clean === group.text && emphasis === group.emphasis) problem('Nothing changed.');
  if (!group.edited) group.originalEmphasis = group.emphasis;
  group.text = clean;
  group.lines = lineBreak(clean, limits.lineChars);
  group.emphasis = emphasis;
  group.edited = true;
  return group;
}

// ---------------------------------------------------------------- checks

const normalise = value => (String(value).match(/\S+/g) || []).map(token => bare(token).toLowerCase()).filter(Boolean);
function lintCaptions(captions, {sentences = null} = {}) {
  const limits = LIMITS[captions.format] || LIMITS['long-form'], issues = [];
  const add = (severity, kind, groupId, message) => issues.push({severity, kind, groupId, message});
  captions.groups.forEach((group, k) => {
    const seconds = group.end - group.start, chars = group.lines.join(' ').length;
    if (k && group.start < captions.groups[k - 1].end) add('critical', 'caption-overlap', group.id, `Caption ${k + 1} starts before caption ${k} ends.`);
    if (seconds > MAX_CUE) add('suggestion', 'caption-too-long', group.id, `Caption ${k + 1} stays ${seconds.toFixed(1)} s (keep under ${MAX_CUE} s).`);
    if (seconds > 0 && chars / seconds > MAX_CPS) add('suggestion', 'caption-too-fast', group.id, `Caption ${k + 1} needs ${(chars / seconds).toFixed(0)} characters a second (keep under ${MAX_CPS}).`);
    if (group.lines.length > limits.maxLines) add('suggestion', 'caption-lines', group.id, `Caption ${k + 1} has ${group.lines.length} lines (at most ${limits.maxLines}).`);
    if (group.lines.some(line => line.length > limits.lineChars + 8)) add('suggestion', 'caption-line-length', group.id, `Caption ${k + 1} has a line over ${limits.lineChars} characters.`);
    if (group.edited) add('nitpick', 'caption-edited', group.id, `Caption ${k + 1} was corrected by hand and no longer matches the narration word for word.`);
  });
  if (sentences) {
    const spoken = normalise(sentences.map(item => item.text).join(' ')), shown = normalise(captions.groups.map(group => group.words.map(word => word.text).join(' ')).join(' '));
    if (spoken.join(' ') !== shown.join(' ')) add('critical', 'caption-words', null, 'The captions do not carry every narrated word exactly once.');
  }
  return issues;
}
function validateCaptions(captions, narrationSeconds) {
  const problems = [];
  if (captions.schema !== SCHEMA) problems.push('Unknown caption schema.');
  if (typeof captions.enabled !== 'boolean') problems.push('Captions must be on or off.');
  let previous = 0;
  for (const group of captions.groups || []) {
    if (!(group.start >= previous - 1e-6 && group.end > group.start && group.end <= narrationSeconds + 1e-6)) { problems.push(`Caption ${group.id} is outside the narration or overlaps the one before.`); break; }
    previous = group.end;
  }
  return problems;
}

module.exports = {SCHEMA, METHOD, SKILL, LIMITS, wordTimings, buildCaptions, clearWindows, visibleGroups, assParts, srt, vtt, editCaption, lintCaptions, validateCaptions};
