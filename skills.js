'use strict';
// Skills Engine - the program's reusable operating knowledge.
//
// Every skill is a reviewed, revisioned record. Builtin skills are seeded as DRAFTS from the
// packs in skills/ and docs/research/editing-brain/; nothing is used at runtime until a named
// human approval exists. Lessons learned from the program's own reviews are proposals only:
// approving one writes a new DRAFT revision that still needs the normal skill approval.
// See docs/SKILLS-ENGINE.md for the boundary and docs/SKILLS-ENGINE-PLAN.md for the brief.

const fs = require('node:fs');
const path = require('node:path');
const {randomUUID, createHash} = require('node:crypto');

class SkillError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const need = (ok, message, status) => { if (!ok) throw new SkillError(message, status); };
const now = () => new Date().toISOString();

// ---------------------------------------------------------------- vocabulary

// Where a skill applies. Task keys are the real-time injection points used by the rooms.
const TASK_KEYS = Object.freeze([
  'niche.discover', 'niche.evaluate', 'competitors.scan', 'competitors.blueprint', 'research.brief',
  'ideas.titles', 'script.candidate', 'script.hooks', 'script.review', 'voice.direction',
  'scene.plan', 'visuals.prompt', 'visuals.stock-query', 'editing.plan', 'editing.review',
  'motion.template', 'captions.segment', 'audio.mix', 'qc.review', 'packaging.title',
  'packaging.thumbnail', 'packaging.seo', 'branding.identity', 'localization.check', 'analytics.review',
]);
const KINDS = Object.freeze(['principle', 'procedure', 'checklist', 'ruleset', 'formula', 'template', 'algorithm']);
const ORIGINS = Object.freeze(['builtin', 'owner', 'learned']);
const STATUSES = Object.freeze(['draft', 'approved', 'superseded', 'retired']);
const PROJECT_STATE_CATEGORIES = Object.freeze(['locked', 'active', 'open', 'rejected']);

// Rooms are the human-facing grouping. ROOM_TASKS gives a skill its default task bindings when
// the skill itself does not name tasks (the 160 editing-brain drafts do not).
const ROOM_TASKS = Object.freeze({
  general: TASK_KEYS, os: TASK_KEYS, library: TASK_KEYS,
  learning: Object.freeze(['script.review', 'editing.review', 'qc.review', 'analytics.review']),
  strategy: Object.freeze(['niche.discover', 'niche.evaluate', 'ideas.titles', 'packaging.title']),
  niche: Object.freeze(['niche.discover', 'niche.evaluate']),
  competitors: Object.freeze(['competitors.scan', 'competitors.blueprint']),
  research: Object.freeze(['research.brief']),
  ideas: Object.freeze(['ideas.titles', 'packaging.title']),
  hooks: Object.freeze(['script.hooks', 'script.candidate']),
  script: Object.freeze(['script.candidate', 'script.review']),
  voice: Object.freeze(['voice.direction']),
  scene: Object.freeze(['scene.plan', 'visuals.prompt', 'visuals.stock-query']),
  visuals: Object.freeze(['visuals.prompt', 'visuals.stock-query', 'scene.plan']),
  motion: Object.freeze(['motion.template', 'editing.plan']),
  editing: Object.freeze(['editing.plan', 'editing.review']),
  timeline: Object.freeze(['editing.plan']),
  captions: Object.freeze(['captions.segment']),
  audio: Object.freeze(['audio.mix']),
  qc: Object.freeze(['qc.review', 'script.review', 'editing.review']),
  packaging: Object.freeze(['packaging.title', 'packaging.thumbnail', 'packaging.seo']),
  seo: Object.freeze(['packaging.seo']),
  branding: Object.freeze(['branding.identity']),
  localization: Object.freeze(['localization.check']),
  analytics: Object.freeze(['analytics.review']),
});
const ROOMS = Object.freeze(Object.keys(ROOM_TASKS));

// Precision OS section 4. Prompt assembly states this order so a generic best practice can never
// outrank the owner's own instruction.
const SOURCE_HIERARCHY = Object.freeze([
  'owner instruction in this request', 'recorded owner correction', 'approved decision',
  'owner-supplied source material', 'project context', 'cited research evidence',
  'general knowledge', 'assumption (label it)',
]);

// ---------------------------------------------------------------- validation

function object(value, label) {
  need(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object.`);
  return value;
}
function text(value, label, min, max) {
  need(typeof value === 'string', `${label} must be text.`);
  const result = value.trim();
  need(result.length >= min && result.length <= max, `${label} must contain ${min}-${max} characters.`);
  need(!/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(result), `${label} contains unsupported control characters.`);
  return result;
}
function choice(value, allowed, label) { need(allowed.includes(value), `Choose a valid ${label}.`); return value; }
function integer(value, min, max, label) {
  need(Number.isSafeInteger(value) && value >= min && value <= max, `${label} must be a whole number from ${min} to ${max}.`);
  return value;
}
function list(value, label, min, max, itemMin, itemMax) {
  need(Array.isArray(value), `${label} must be a list.`);
  need(value.length >= min && value.length <= max, `${label} needs ${min}-${max} entries.`);
  const result = value.map((item, index) => text(item, `${label} entry ${index + 1}`, itemMin, itemMax));
  need(new Set(result.map(item => item.toLowerCase())).size === result.length, `${label} entries must be unique.`);
  return result;
}
// numbers and inputs hold reference values, not prose: a string, a number, a boolean, or a small
// JSON structure such as a range or a per-style table. The research packs rely on those shapes,
// so the type is preserved rather than flattened to text.
function jsonValue(value, label, maxBytes, depth = 0) {
  need(depth <= 4, `${label} is nested too deeply.`);
  if (typeof value === 'string') return text(value, label, 1, maxBytes);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') { need(Number.isFinite(value), `${label} must be a finite number.`); return value; }
  if (Array.isArray(value)) {
    need(value.length >= 1 && value.length <= 40, `${label} must hold 1-40 entries.`);
    return value.map((item, index) => jsonValue(item, `${label} entry ${index + 1}`, maxBytes, depth + 1));
  }
  object(value, label);
  const keys = Object.keys(value);
  need(keys.length >= 1 && keys.length <= 40, `${label} must hold 1-40 entries.`);
  const out = {};
  for (const key of keys) out[text(key, `${label} key`, 1, 80)] = jsonValue(value[key], `${label} value for ${key}`, maxBytes, depth + 1);
  return out;
}
function valueMap(value, label, maxKeys, maxBytes) {
  if (value === undefined || value === null) return {};
  object(value, label);
  const keys = Object.keys(value);
  need(keys.length <= maxKeys, `${label} may hold at most ${maxKeys} entries.`);
  const out = {};
  for (const key of keys) {
    const name = text(key, `${label} key`, 1, 80);
    out[name] = jsonValue(value[key], `${label} value for ${name}`, maxBytes);
    need(Buffer.byteLength(JSON.stringify(out[name]), 'utf8') <= maxBytes, `${label} value for ${name} is larger than ${maxBytes} bytes.`);
  }
  return out;
}
function tagList(value) {
  const tags = list(value ?? [], 'Tags', 0, 20, 2, 40);
  for (const tag of tags) need(/^[a-z0-9][a-z0-9-]*$/.test(tag), `Tag "${tag}" must use lowercase letters, numbers and hyphens.`);
  return tags;
}

// A skill is only usable if it tells a room something concrete to do.
function validateSkill(input) {
  object(input, 'Skill');
  const id = text(input.id, 'Skill ID', 5, 80);
  need(/^[a-z][a-z0-9]*\.[a-z0-9][a-z0-9-]*$/.test(id), 'Skill ID must look like area.kebab-name, for example hooks.universal-3-hook.');
  const rooms = list(input.rooms, 'Rooms', 1, 10, 2, 40).map(room => choice(room, ROOMS, 'room'));
  const declared = input.tasks === undefined || input.tasks === null
    ? []
    : list(input.tasks, 'Task keys', 0, TASK_KEYS.length, 4, 40).map(task => choice(task, TASK_KEYS, 'task key'));
  const tasks = declared.length ? declared : [...new Set(rooms.flatMap(room => ROOM_TASKS[room]))];
  const skill = {
    id,
    title: text(input.title, 'Title', 3, 120),
    rooms, tasks,
    kind: choice(input.kind, KINDS, 'skill kind'),
    when: text(input.when, 'When it applies', 10, 400),
    summary: text(input.summary, 'Summary', 10, 1500),
    inputs: valueMap(input.inputs, 'Inputs', 20, 600),
    steps: list(input.steps ?? [], 'Steps', 0, 40, 3, 1200),
    do: list(input.do ?? [], 'Do rules', 0, 40, 3, 1200),
    avoid: list(input.avoid ?? [], 'Avoid rules', 0, 40, 3, 1200),
    numbers: valueMap(input.numbers, 'Numbers', 40, 2048),
    checks: list(input.checks ?? [], 'Checks', 0, 40, 3, 1200),
    tags: tagList(input.tags),
    source: text(input.source, 'Source note', 3, 600),
    priority: integer(input.priority ?? 0, 0, 100, 'Priority'),
  };
  // A pin-only skill (a channel or niche profile) never applies by default; it reaches a brief only
  // where the owner pins it, usually to one family. Absent means false, so older payload hashes hold.
  need(input.pinOnly === undefined || typeof input.pinOnly === 'boolean', 'Pin-only must be true or false.');
  if (input.pinOnly) skill.pinOnly = true;
  need(skill.steps.length + skill.do.length + skill.avoid.length + skill.checks.length > 0,
    'A skill needs at least one step, do rule, avoid rule or check so a room can act on it.');
  return skill;
}
const skillHash = skill => createHash('sha256').update(JSON.stringify(skill)).digest('hex');
// How a skill could be better (0.41, after anthropics/skills skill-creator: skills that give reasons generalise, rigid
// capitals do not, lean skills leave room in the brief). Advice for the owner's review, never a gate.
function skillQuality(skill) {
  const notes = [], size = Buffer.byteLength(JSON.stringify(skill));
  // A bare instruction (one sentence, no reason, no contrast) is flagged; an explanation in any form is not.
  const reasoned = /\b(because|so that|so |since|otherwise|which|means|makes|keeps|shows|reads|without|when|not |instead|than|why)\b/i.test(skill.summary) || (skill.summary.match(/[.!?](\s|$)/g) || []).length >= 2;
  if (!reasoned) notes.push('Say why it matters: a rule with its reason is applied well beyond the cases it names.');
  const rigid = (JSON.stringify([skill.do, skill.avoid, skill.steps, skill.checks, skill.summary]).match(/\b(MUST|NEVER|ALWAYS|DO NOT|DON'T)\b/g) || []).length;
  if (rigid >= 2) notes.push(`${rigid} rules in capitals (MUST, NEVER): explain the reason instead, so the rule is understood rather than obeyed narrowly.`);
  if (size > 2500) notes.push(`Long (${size.toLocaleString('en-US')} bytes): it takes a big share of a planning brief; move detail out or split it.`);
  if (skill.when.length < 25) notes.push('Say more exactly when it applies, so it is used in the right moments.');
  if (!skill.do.length && !skill.steps.length && !skill.checks.length) notes.push('Add what to do, not only what to avoid.');
  return notes;
}
const person = (value, label) => text(value, label, 2, 80);
const reason = (value, label = 'Reason') => text(value, label, 8, 1000);

// ---------------------------------------------------------------- deterministic rules
// Numbers the rooms apply in code instead of asking a model to remember them (plan section 4.3).

const BANNED_PHRASES = Object.freeze(['stay tuned', 'in this video', 'delve', 'dive into', 'in the age of', 'the world watched', 'it was a moment', 'the truth is', 'in the end']);
const CAPTION_LIMITS = Object.freeze({maxCharsPerLine: 42, maxCharsPerSecond: 20, maxSeconds: 7, maxLines: 2});
const TITLE_LIMITS = Object.freeze({minChars: 50, maxChars: 70});
const LOUDNESS_TARGET = Object.freeze({lufs: -14, lufsTolerance: 1, truePeakDbtp: -1.5});

const words = value => (String(value || '').match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || []).length;

// One visual per 10-15 spoken words (library 4.1); 12 is the midpoint the rooms default to.
function imageCount(wordTotal, wordsPerImage = 12) {
  integer(wordTotal, 0, 5000000, 'Word count');
  need(Number.isFinite(wordsPerImage) && wordsPerImage >= 5 && wordsPerImage <= 40, 'Words per image must be 5-40.');
  return wordTotal === 0 ? 0 : Math.max(1, Math.round(wordTotal / wordsPerImage));
}
// Precision OS section 21: 12 minutes at one visual every 5 s is 144 beats, so the math must match.
function beatCount(seconds, secondsPerVisual) {
  need(Number.isFinite(seconds) && seconds >= 0 && seconds <= 86400, 'Duration must be 0-86400 seconds.');
  need(Number.isFinite(secondsPerVisual) && secondsPerVisual > 0 && secondsPerVisual <= 120, 'Seconds per visual must be above 0 and at most 120.');
  return seconds === 0 ? 0 : Math.max(1, Math.round(seconds / secondsPerVisual));
}
// Owner's title-card prompt: hold = max(1.2, 0.35 + words/3.2) seconds.
function textDwellSeconds(wordTotal) {
  integer(wordTotal, 0, 10000, 'Word count');
  return Math.round(Math.max(1.2, 0.35 + wordTotal / 3.2) * 1000) / 1000;
}
function captionIssues(cue) {
  object(cue, 'Caption cue');
  const lines = list(cue.lines, 'Caption lines', 1, 4, 1, 400);
  const seconds = cue.seconds;
  need(Number.isFinite(seconds) && seconds > 0 && seconds <= 600, 'Caption duration must be above 0 and at most 600 seconds.');
  const issues = [], characters = lines.join(' ').length;
  if (lines.length > CAPTION_LIMITS.maxLines) issues.push(`A cue may use at most ${CAPTION_LIMITS.maxLines} lines; this one uses ${lines.length}.`);
  for (const line of lines) {
    if (line.length > CAPTION_LIMITS.maxCharsPerLine) issues.push(`Line "${line.slice(0, 20)}..." is ${line.length} characters; the limit is ${CAPTION_LIMITS.maxCharsPerLine}.`);
  }
  if (seconds > CAPTION_LIMITS.maxSeconds) issues.push(`A cue may stay on screen for at most ${CAPTION_LIMITS.maxSeconds} seconds; this one holds ${seconds}.`);
  const rate = characters / seconds;
  if (rate > CAPTION_LIMITS.maxCharsPerSecond) issues.push(`Reading rate is ${rate.toFixed(1)} characters per second; the limit is ${CAPTION_LIMITS.maxCharsPerSecond}.`);
  return issues;
}
function bannedPhraseIssues(value) {
  const haystack = String(value || '').toLowerCase();
  return BANNED_PHRASES.filter(phrase => haystack.includes(phrase)).map(phrase => `Remove the banned filler phrase "${phrase}".`);
}
function titleIssues(value) {
  const title = text(value, 'Title', 1, 400), issues = [];
  if (title.length < TITLE_LIMITS.minChars || title.length > TITLE_LIMITS.maxChars) {
    issues.push(`Titles should be ${TITLE_LIMITS.minChars}-${TITLE_LIMITS.maxChars} characters for click-through; this one is ${title.length}.`);
  }
  return [...issues, ...bannedPhraseIssues(title)];
}
// Library golden rule: never leave a raw [PLACEHOLDER] in anything that goes out.
function placeholderIssues(value) {
  const found = [...new Set(String(value || '').match(/\[[A-Z][A-Z0-9 _/.,'-]{2,60}\]/g) || [])];
  return found.map(item => `Replace the raw placeholder ${item} before this output is used.`);
}
// Library 3.9: every sentence stays under 25 words so narration keeps its punch.
function sentenceLengthIssues(value, maxWords = 25) {
  const sentences = String(value || '').split(/(?<=[.!?])\s+/).map(item => item.trim()).filter(Boolean);
  return sentences.filter(sentence => words(sentence) > maxWords)
    .map(sentence => `Sentence "${sentence.slice(0, 40)}..." runs ${words(sentence)} words; split it at ${maxWords} or fewer.`);
}
function loudnessIssues(measured) {
  object(measured, 'Loudness measurement');
  need(Number.isFinite(measured.lufs), 'Integrated loudness must be a number in LUFS.');
  need(Number.isFinite(measured.truePeakDbtp), 'True peak must be a number in dBTP.');
  const issues = [];
  if (Math.abs(measured.lufs - LOUDNESS_TARGET.lufs) > LOUDNESS_TARGET.lufsTolerance) {
    issues.push(`Integrated loudness is ${measured.lufs} LUFS; target ${LOUDNESS_TARGET.lufs} +/- ${LOUDNESS_TARGET.lufsTolerance}.`);
  }
  if (measured.truePeakDbtp > LOUDNESS_TARGET.truePeakDbtp) {
    issues.push(`True peak is ${measured.truePeakDbtp} dBTP; keep it at or below ${LOUDNESS_TARGET.truePeakDbtp}.`);
  }
  return issues;
}
// Mastery bundle: narration runs 150-170 words a minute at documentary pace; 155 is the default.
function wordsForMinutes(minutes, wordsPerMinute = 155) {
  need(Number.isFinite(minutes) && minutes >= 0 && minutes <= 1440, 'Duration must be 0-1440 minutes.');
  need(Number.isFinite(wordsPerMinute) && wordsPerMinute >= 90 && wordsPerMinute <= 220, 'Words per minute must be 90-220.');
  return Math.round(minutes * wordsPerMinute);
}
// An outline's sections must add up to their chapter and the chapters to the target, exactly.
// Shape: {target, chapters: [{title, words, sections: [{title, words}]}]} or {target, sections: [...]}.
function wordAllocationIssues(outline) {
  object(outline, 'Outline');
  integer(outline.target, 1, 500000, 'Target word count');
  const count = (item, label) => { integer(item?.words, 1, 500000, `${label} word count`); return item.words; };
  const sum = (items, label) => items.reduce((total, item, index) => total + count(item, `${label} ${index + 1}`), 0);
  const issues = [];
  if (Array.isArray(outline.chapters)) {
    need(outline.chapters.length >= 1 && outline.chapters.length <= 200, 'An outline needs 1-200 chapters.');
    outline.chapters.forEach((chapter, index) => {
      const own = count(chapter, `Chapter ${index + 1}`);
      if (Array.isArray(chapter.sections) && chapter.sections.length) {
        const inner = sum(chapter.sections, `Chapter ${index + 1} section`);
        if (inner !== own) issues.push(`Chapter ${index + 1} sections add up to ${inner} words, not the chapter's ${own}.`);
      }
    });
    const total = sum(outline.chapters, 'Chapter');
    if (total !== outline.target) issues.push(`Chapters add up to ${total} words, not the target ${outline.target}.`);
  } else {
    need(Array.isArray(outline.sections) && outline.sections.length >= 1 && outline.sections.length <= 400, 'An outline needs chapters or 1-400 sections.');
    const total = sum(outline.sections, 'Section');
    if (total !== outline.target) issues.push(`Sections add up to ${total} words, not the target ${outline.target}.`);
  }
  return issues;
}
// Per-style paragraph tiers from the mastery bundle. A null count means "ask the owner first".
const PARAGRAPH_IMAGE_TIERS = Object.freeze({
  standard: Object.freeze([{upTo: 100, count: 3}, {upTo: Infinity, count: 6}]),
  'oil-sketch': Object.freeze([{upTo: 99, count: 3}, {upTo: 200, count: 5}, {upTo: Infinity, count: 15}]),
  renaissance: Object.freeze([{upTo: 99, count: 5}, {upTo: 200, count: null}, {upTo: Infinity, count: 15}]),
});
function paragraphImageCount(wordTotal, style = 'standard') {
  integer(wordTotal, 0, 100000, 'Word count');
  need(Object.hasOwn(PARAGRAPH_IMAGE_TIERS, style), `Choose a paragraph tier style: ${Object.keys(PARAGRAPH_IMAGE_TIERS).join(', ')}.`);
  if (wordTotal === 0) return 0;
  return PARAGRAPH_IMAGE_TIERS[style].find(tier => wordTotal <= tier.upTo).count;
}
// Zero-decision assembly: every image holds narration length / image count seconds.
function imageIntervalSeconds(narrationSeconds, imagesTotal) {
  need(Number.isFinite(narrationSeconds) && narrationSeconds > 0 && narrationSeconds <= 86400, 'Narration length must be above 0 and at most 86400 seconds.');
  integer(imagesTotal, 1, 20000, 'Image count');
  return Math.round(narrationSeconds / imagesTotal * 1000) / 1000;
}
// Inauthentic-content defence: titles must not all wear one structure. Flags an opening (first two
// words) used more than twice in a row, or by more than a quarter of a list of eight or more.
function titleVariationIssues(titles) {
  const list = (Array.isArray(titles) ? titles : []).map(item => text(item, 'Title', 1, 400));
  need(list.length >= 1 && list.length <= 1000, 'Give 1-1000 titles.');
  const opening = title => (title.toLowerCase().match(/[\p{L}\p{N}']+/gu) || []).slice(0, 2).join(' ');
  const issues = [], counts = new Map();
  let run = 1;
  list.forEach((title, index) => {
    const key = opening(title);
    counts.set(key, (counts.get(key) || 0) + 1);
    run = index && key === opening(list[index - 1]) ? run + 1 : 1;
    if (run === 3) issues.push(`Three titles in a row open with "${key}"; vary the opening.`);
  });
  if (list.length >= 8) {
    for (const [key, used] of counts) {
      if (used / list.length > 0.25) issues.push(`"${key}" opens ${used} of ${list.length} titles; keep any one opening to a quarter or less.`);
    }
  }
  return issues;
}
const RULES = Object.freeze({
  imageCount, beatCount, textDwellSeconds, captionIssues, titleIssues, bannedPhraseIssues,
  placeholderIssues, sentenceLengthIssues, loudnessIssues, words,
  wordsForMinutes, wordAllocationIssues, paragraphImageCount, imageIntervalSeconds, titleVariationIssues,
  limits: Object.freeze({caption: CAPTION_LIMITS, title: TITLE_LIMITS, loudness: LOUDNESS_TARGET, bannedPhrases: BANNED_PHRASES}),
});

// ---------------------------------------------------------------- seed packs

const PACK_FILES = Object.freeze([
  {file: 'skills/precision-os.json', label: 'Precision AI Operating System'},
  {file: 'skills/prompt-library.json', label: 'YT Empire Builders Prompt Library'},
  {file: 'skills/mastery-bundle.json', label: 'CB YT AI Mastery Prompts Bundle'},
  {file: 'skills/youtube-agent.json', label: 'youtube-agent-skill (MIT): hooks, packaging, chapters, Shorts, retention'},
  {file: 'skills/hyperframes.json', label: 'HyperFrames (Apache-2.0): story, motion, captions and mix doctrine'},
  {file: 'skills/claude-video.json', label: 'claude-video (MIT): video evidence, frame budgets, clean stock windows, engine discipline'},
  {file: 'skills/motion-craft.json', label: 'motionmaxxing (Apache-2.0): measured motion, word timing, script cues, machine-look check'},
  {file: 'skills/film-craft.json', label: 'lemo-opuscar (MIT): directing, sound, colour by role, evidence grammar, signature moves'},
  {file: 'skills/channel-grammar.json', label: 'Channel study 2026-10-18: hooks, visual systems, receipts, maps, pacing, narration modes, profiles'},
  {file: 'skills/studio-craft.json', label: 'Studio craft 2026-10-19 (p5.brush, video-use, Remotion, Remotion skills, watch-video, caption-ai, video toolkit, skill-creator)'},
  {file: 'skills/retention-craft.json', label: 'Retention craft 2026-10-21 (owner screenshots: Kallaway script structure, HOOK/VALUE/SOLUTION/CTA, Paul Hilse prompts 1-5; viewer model)'},
  {file: 'skills/whiteboard-craft.json', label: 'whiteboard-animation-vi (CC0): line order, colour after line, brush lanes, the hand, pictures that draw well'},
  {file: 'skills/anime-craft.json', label: 'html-anime (MIT): the anime sequence, drawing budgets, twos, the expensive shot, camera, cel paint, colour scripts, the colour-dip cut'},
  {file: 'skills/youtube-growth.json', label: 'claude-youtube (MIT): hooks, retention scripting, packaging and SEO, Shorts, ideas, strategy, competitors, analytics, monetisation, channel types'},
  {file: 'docs/research/editing-brain/om-creative.json', label: 'Editing brain - creative decisions'},
  {file: 'docs/research/editing-brain/om-meta.json', label: 'Editing brain - orchestration and review'},
  {file: 'docs/research/editing-brain/motion.json', label: 'Editing brain - motion graphics'},
  {file: 'docs/research/editing-brain/timeline.json', label: 'Editing brain - timeline and render'},
]);
function loadPacks(root = __dirname) {
  const skills = [], seen = new Map();
  for (const pack of PACK_FILES) {
    const full = path.join(root, pack.file);
    let raw;
    try { raw = JSON.parse(fs.readFileSync(full, 'utf8')); }
    catch (error) { throw new SkillError(`Skill pack ${pack.file} could not be read: ${error.message}`, 500); }
    need(Array.isArray(raw) && raw.length > 0, `Skill pack ${pack.file} must be a non-empty JSON array.`, 500);
    raw.forEach((entry, index) => {
      let skill;
      try { skill = validateSkill(entry); }
      catch (error) { throw new SkillError(`Skill pack ${pack.file} entry ${index + 1} is invalid: ${error.message}`, 500); }
      need(!seen.has(skill.id), `Skill pack ${pack.file} repeats skill ID ${skill.id} (first seen in ${seen.get(skill.id)}).`, 500);
      seen.set(skill.id, pack.file);
      skills.push({skill, pack: pack.label});
    });
  }
  return skills;
}

// ---------------------------------------------------------------- engine

// How much of a Claude prompt one skill brief may occupy. messageTokenUpperBound counts bytes as
// an upper bound on tokens, so this is a byte budget taken out of the family's job token limit.
const BRIEF_BYTE_BUDGET = 1800;
// Rooms whose Claude answers are large get a larger share for skills (0.39): the scene planner and the story director
// read many craft rules; the rest keep the default.
const TASK_BRIEF_BYTES = Object.freeze({'scene.plan': 9000, 'voice.direction': 3000, 'motion.template': 3000, 'visuals.prompt': 2500});
const ORIGIN_RANK = Object.freeze({owner: 2, learned: 1, builtin: 0});

class SkillsEngine {
  constructor(store, {root = __dirname, seed = true} = {}) {
    this.store = store;
    this.db = store.db;
    this.root = root;
    this.migrate();
    if (seed) this.seedBuiltinPacks();
  }

  migrate() {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS skills(id TEXT PRIMARY KEY, origin TEXT NOT NULL, pack TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS skill_revisions(id TEXT PRIMARY KEY, skill_id TEXT NOT NULL REFERENCES skills(id), revision INTEGER NOT NULL, status TEXT NOT NULL, payload TEXT NOT NULL, payload_hash TEXT NOT NULL, change_note TEXT NOT NULL, lesson_id TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, review TEXT, retirement TEXT, UNIQUE(skill_id,revision));
        CREATE TRIGGER IF NOT EXISTS skill_revisions_immutable BEFORE UPDATE OF skill_id,revision,payload,payload_hash,change_note,lesson_id,created_by,created_at ON skill_revisions
          BEGIN SELECT RAISE(ABORT,'Skill revisions are immutable; create a new revision instead.'); END;
        CREATE TRIGGER IF NOT EXISTS skill_revisions_keep BEFORE DELETE ON skill_revisions
          BEGIN SELECT RAISE(ABORT,'Skill revisions are retained for provenance and cannot be deleted.'); END;
        CREATE TABLE IF NOT EXISTS skill_bindings(id TEXT PRIMARY KEY, skill_id TEXT NOT NULL REFERENCES skills(id), family_id TEXT REFERENCES families(id), task_key TEXT NOT NULL, mode TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE UNIQUE INDEX IF NOT EXISTS skill_binding_unique ON skill_bindings(skill_id, task_key, IFNULL(family_id,''));
        CREATE TABLE IF NOT EXISTS skill_usage(id TEXT PRIMARY KEY, job_id TEXT NOT NULL, family_id TEXT, room TEXT NOT NULL, task_key TEXT NOT NULL, revision_ids TEXT NOT NULL, skill_ids TEXT NOT NULL, injected_bytes INTEGER NOT NULL, dropped INTEGER NOT NULL DEFAULT 0, outcome TEXT, created_at TEXT NOT NULL, UNIQUE(job_id, task_key));
        CREATE TABLE IF NOT EXISTS skill_lessons(id TEXT PRIMARY KEY, family_id TEXT REFERENCES families(id), skill_id TEXT REFERENCES skills(id), task_key TEXT NOT NULL, source TEXT NOT NULL, source_ref TEXT NOT NULL, evidence TEXT NOT NULL, finding TEXT NOT NULL, proposal TEXT NOT NULL, status TEXT NOT NULL, review TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(source, source_ref, task_key));
        CREATE TABLE IF NOT EXISTS family_project_state(id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id), category TEXT NOT NULL, item TEXT NOT NULL, note TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, ended_at TEXT, ended_reason TEXT);
        CREATE INDEX IF NOT EXISTS skill_usage_task ON skill_usage(task_key, created_at);
        CREATE INDEX IF NOT EXISTS family_project_state_open ON family_project_state(family_id, category) WHERE ended_at IS NULL;
      `);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  // Builtin packs arrive as drafts. Re-running is safe: an approved skill is never silently replaced by a pack edit.
  // Since 0.71 a builtin skill whose pack entry was updated gets it as a new draft revision, unless the owner wrote the
  // newest revision; the approved revision stays in use until the update is approved. An update marks itself by extending
  // the skill's source note, so older stored payloads that differ only in normalisation never flood the owner with drafts.
  seedBuiltinPacks() {
    const packs = loadPacks(this.root);
    return this.store.transaction(() => {
      let created = 0, updated = 0;
      for (const {skill, pack} of packs) {
        const existing = this.db.prepare('SELECT origin FROM skills WHERE id=?').get(skill.id);
        if (existing) {
          const latest = this.latestRevisionRow(skill.id), hash = skillHash(skill);
          if (existing.origin !== 'builtin' || latest.created_by !== 'Builtin skill pack' || JSON.parse(latest.payload).source === skill.source || this.db.prepare('SELECT 1 FROM skill_revisions WHERE skill_id=? AND payload_hash=?').get(skill.id, hash)) continue;
          this.db.prepare('INSERT INTO skill_revisions(id,skill_id,revision,status,payload,payload_hash,change_note,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
            .run(randomUUID(), skill.id, latest.revision + 1, 'draft', JSON.stringify(skill), hash, `Updated in ${pack}. Review the change; the approved revision stays in use until this one is approved.`, 'Builtin skill pack', now());
          updated++;
          continue;
        }
        const at = now();
        this.db.prepare('INSERT INTO skills(id,origin,pack,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(skill.id, 'builtin', pack, 'Builtin skill pack', at, at);
        this.db.prepare('INSERT INTO skill_revisions(id,skill_id,revision,status,payload,payload_hash,change_note,created_by,created_at) VALUES(?,?,1,?,?,?,?,?,?)')
          .run(randomUUID(), skill.id, 'draft', JSON.stringify(skill), skillHash(skill), `Seeded from ${pack}. Review the wording and numbers before runtime use.`, 'Builtin skill pack', at);
        created++;
      }
      if (created) this.store.event(`Seeded ${created} builtin skill draft${created === 1 ? '' : 's'} for review`);
      if (updated) this.store.event(`${updated} builtin skill${updated === 1 ? '' : 's'} updated as draft${updated === 1 ? '' : 's'} for review`);
      return created;
    });
  }

  // ------------------------------------------------------------ reads
  revisionRow(id) {
    const row = this.db.prepare('SELECT r.*, s.origin, s.pack FROM skill_revisions r JOIN skills s ON s.id=r.skill_id WHERE r.id=?').get(id);
    need(row, 'Skill revision not found.', 404);
    return row;
  }
  publicRevision(row) {
    return {
      id: row.id, skillId: row.skill_id, revision: row.revision, status: row.status, origin: row.origin, pack: row.pack,
      skill: JSON.parse(row.payload), payloadHash: row.payload_hash, changeNote: row.change_note, lessonId: row.lesson_id, quality: skillQuality(JSON.parse(row.payload)),
      createdBy: row.created_by, createdAt: row.created_at,
      review: row.review ? JSON.parse(row.review) : null, retirement: row.retirement ? JSON.parse(row.retirement) : null,
    };
  }
  revision(id) { return this.publicRevision(this.revisionRow(id)); }
  skillRow(id) {
    const row = this.db.prepare('SELECT * FROM skills WHERE id=?').get(text(id, 'Skill ID', 5, 80));
    need(row, 'Skill not found.', 404);
    return row;
  }
  latestRevisionRow(skillId) { return this.db.prepare('SELECT * FROM skill_revisions WHERE skill_id=? ORDER BY revision DESC LIMIT 1').get(skillId); }
  approvedRevisionRow(skillId) { return this.db.prepare("SELECT * FROM skill_revisions WHERE skill_id=? AND status='approved' ORDER BY revision DESC LIMIT 1").get(skillId); }

  skills() {
    const revisions = this.db.prepare('SELECT r.*, s.origin, s.pack FROM skill_revisions r JOIN skills s ON s.id=r.skill_id ORDER BY r.skill_id, r.revision').all();
    const bySkill = new Map();
    for (const row of revisions) {
      if (!bySkill.has(row.skill_id)) bySkill.set(row.skill_id, []);
      bySkill.get(row.skill_id).push(this.publicRevision(row));
    }
    return this.db.prepare('SELECT * FROM skills ORDER BY id').all().map(row => {
      const all = bySkill.get(row.id) || [];
      const approved = all.find(item => item.status === 'approved') || null;
      const latest = all.at(-1) || null;
      return {
        id: row.id, origin: row.origin, pack: row.pack, createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at,
        revisions: all, latest, approved,
        title: (approved || latest)?.skill.title || row.id,
        rooms: (approved || latest)?.skill.rooms || [],
        tasks: (approved || latest)?.skill.tasks || [],
        tags: (approved || latest)?.skill.tags || [],
        status: approved ? 'approved' : latest?.status === 'retired' ? 'retired' : 'draft',
      };
    });
  }

  bindings(familyId = null) {
    const rows = familyId === null
      ? this.db.prepare('SELECT * FROM skill_bindings ORDER BY created_at').all()
      : this.db.prepare('SELECT * FROM skill_bindings WHERE family_id IS NULL OR family_id=? ORDER BY created_at').all(familyId);
    return rows.map(row => ({id: row.id, skillId: row.skill_id, familyId: row.family_id, taskKey: row.task_key, mode: row.mode, position: row.position, note: row.note, createdBy: row.created_by, createdAt: row.created_at}));
  }
  usage(limit = 100) {
    return this.db.prepare('SELECT * FROM skill_usage ORDER BY created_at DESC, rowid DESC LIMIT ?').all(integer(limit, 1, 500, 'Limit'))
      .map(row => ({id: row.id, jobId: row.job_id, familyId: row.family_id, room: row.room, taskKey: row.task_key, skillIds: JSON.parse(row.skill_ids), revisionIds: JSON.parse(row.revision_ids), injectedBytes: row.injected_bytes, dropped: row.dropped, outcome: row.outcome, createdAt: row.created_at}));
  }
  lessons(status = null) {
    const rows = status
      ? this.db.prepare('SELECT * FROM skill_lessons WHERE status=? ORDER BY created_at DESC').all(choice(status, ['proposed', 'approved', 'rejected'], 'lesson status'))
      : this.db.prepare('SELECT * FROM skill_lessons ORDER BY created_at DESC LIMIT 200').all();
    return rows.map(row => ({
      id: row.id, familyId: row.family_id, skillId: row.skill_id, taskKey: row.task_key, source: row.source, sourceRef: row.source_ref,
      evidence: JSON.parse(row.evidence), finding: row.finding, proposal: JSON.parse(row.proposal), status: row.status,
      review: row.review ? JSON.parse(row.review) : null, createdAt: row.created_at, updatedAt: row.updated_at,
    }));
  }
  projectState(familyId = null) {
    const rows = familyId
      ? this.db.prepare('SELECT * FROM family_project_state WHERE family_id=? ORDER BY created_at DESC').all(familyId)
      : this.db.prepare('SELECT * FROM family_project_state ORDER BY created_at DESC LIMIT 200').all();
    return rows.map(row => ({id: row.id, familyId: row.family_id, category: row.category, item: row.item, note: row.note, createdBy: row.created_by, createdAt: row.created_at, endedAt: row.ended_at, endedReason: row.ended_reason}));
  }

  state() {
    const skills = this.skills();
    const counts = {total: skills.length, approved: 0, draft: 0, retired: 0, builtin: 0, owner: 0, learned: 0};
    for (const skill of skills) { counts[skill.status]++; counts[skill.origin]++; }
    const lessons = this.lessons();
    return {
      counts: {...counts, lessonsProposed: lessons.filter(item => item.status === 'proposed').length},
      vocabulary: {rooms: ROOMS, tasks: TASK_KEYS, kinds: KINDS, origins: ORIGINS, statuses: STATUSES, roomTasks: ROOM_TASKS, projectStateCategories: PROJECT_STATE_CATEGORIES},
      sourceHierarchy: SOURCE_HIERARCHY, briefByteBudget: BRIEF_BYTE_BUDGET, rules: RULES.limits,
      skills, bindings: this.bindings(), lessons, usage: this.usage(50), projectState: this.projectState(),
      packs: PACK_FILES.map(pack => pack.label),
    };
  }

  // ------------------------------------------------------------ authoring
  saveOwnerSkill(input) {
    object(input, 'Request');
    const createdBy = person(input.createdBy, 'Your name');
    const changeNote = reason(input.changeNote, 'Change note');
    const skill = validateSkill(input.skill);
    return this.store.transaction(() => {
      const existing = this.db.prepare('SELECT * FROM skills WHERE id=?').get(skill.id);
      const at = now();
      if (existing) return this.appendRevision(skill, {createdBy, changeNote, at});
      this.db.prepare('INSERT INTO skills(id,origin,pack,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(skill.id, 'owner', null, createdBy, at, at);
      const id = randomUUID();
      this.db.prepare('INSERT INTO skill_revisions(id,skill_id,revision,status,payload,payload_hash,change_note,created_by,created_at) VALUES(?,?,1,?,?,?,?,?,?)')
        .run(id, skill.id, 'draft', JSON.stringify(skill), skillHash(skill), changeNote, createdBy, at);
      this.store.event(`Created owner skill draft: ${skill.title}`);
      return this.revision(id);
    });
  }

  // A new revision never edits an approved one; the approved revision keeps serving runtime
  // until the new draft is approved in its own right.
  appendRevision(skill, {createdBy, changeNote, at = now(), lessonId = null}) {
    const latest = this.latestRevisionRow(skill.id);
    need(latest, 'Skill not found.', 404);
    const hash = skillHash(skill);
    need(hash !== latest.payload_hash, 'This revision is identical to the latest one. Change something, or keep the current revision.', 409);
    const id = randomUUID();
    this.db.prepare('INSERT INTO skill_revisions(id,skill_id,revision,status,payload,payload_hash,change_note,lesson_id,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(id, skill.id, latest.revision + 1, 'draft', JSON.stringify(skill), hash, changeNote, lessonId, createdBy, at);
    this.db.prepare('UPDATE skills SET updated_at=? WHERE id=?').run(at, skill.id);
    this.store.event(`Created skill revision: ${skill.title} r${latest.revision + 1} (draft)`);
    return this.revision(id);
  }

  createRevision(skillId, input) {
    object(input, 'Request');
    const createdBy = person(input.createdBy, 'Your name');
    const changeNote = reason(input.changeNote, 'Change note');
    const skill = validateSkill(input.skill);
    return this.store.transaction(() => {
      const row = this.skillRow(skillId);
      need(skill.id === row.id, 'A revision cannot change the skill ID. Create a separate skill instead.');
      return this.appendRevision(skill, {createdBy, changeNote});
    });
  }

  approveRevision(id, input) {
    object(input, 'Request');
    const approvedBy = person(input.approvedBy, 'Reviewer name');
    const notes = text(input.notes || '', 'Review notes', 0, 2000);
    const confirmations = object(input.confirmations, 'Review confirmations');
    for (const [key, label] of [
      ['wordingReviewed', 'wording is ours and copies no passage from a source document or a competitor'],
      ['numbersReviewed', 'numbers, limits and checks are correct for this program'],
      ['scopeReviewed', 'rooms and task bindings are the right places for this skill'],
    ]) need(confirmations[key] === true, `Confirm that the ${label}.`);
    return this.store.transaction(() => {
      const row = this.revisionRow(id);
      need(row.status === 'draft', `Only draft revisions can be approved; r${row.revision} is ${row.status}.`, 409);
      const review = {approvedBy, approvedAt: now(), notes, confirmations: {wordingReviewed: true, numbersReviewed: true, scopeReviewed: true}};
      // Only one revision of a skill serves runtime: approving a newer one supersedes the older.
      this.db.prepare("UPDATE skill_revisions SET status='superseded' WHERE skill_id=? AND id<>? AND status='approved'").run(row.skill_id, id);
      this.db.prepare("UPDATE skill_revisions SET status='approved', review=? WHERE id=? AND status='draft'").run(JSON.stringify(review), id);
      this.db.prepare('UPDATE skills SET updated_at=? WHERE id=?').run(now(), row.skill_id);
      this.store.event(`Approved skill: ${JSON.parse(row.payload).title} r${row.revision} by ${approvedBy}`);
      return this.revision(id);
    });
  }

  // Approve a whole pack in one review (0.39, owner review 2026-10-18: 349 drafts were never approved one by one, so no
  // skill ever reached a video). The reviewer names the exact draft revisions shown on screen; if any of them changed
  // since, nothing is approved. Each revision still gets its own named approval record.
  approvePack(input) {
    object(input, 'Request');
    const approvedBy = person(input.approvedBy, 'Reviewer name');
    const notes = text(input.notes || '', 'Review notes', 0, 2000);
    const confirmations = object(input.confirmations, 'Review confirmations');
    for (const [key, label] of [
      ['wordingReviewed', 'wording is ours and copies no passage from a source document or a competitor'],
      ['numbersReviewed', 'numbers, limits and checks are correct for this program'],
      ['scopeReviewed', 'rooms and task bindings are the right places for these skills'],
    ]) need(confirmations[key] === true, `Confirm that the ${label}.`);
    const pack = text(input.pack, 'Pack', 3, 200);
    need(Array.isArray(input.revisionIds) && input.revisionIds.length >= 1 && input.revisionIds.length <= 500, 'Name the 1-500 draft revisions you reviewed.');
    const ids = [...new Set(input.revisionIds.map(id => text(id, 'Revision ID', 10, 64)))];
    return this.store.transaction(() => {
      const rows = ids.map(id => this.revisionRow(id));
      for (const row of rows) {
        need(row.pack === pack, `Skill ${row.skill_id} is not in the pack "${pack}".`, 409);
        need(row.status === 'draft' && this.latestRevisionRow(row.skill_id).id === row.id, `Skill ${row.skill_id} changed since you opened the pack. Reload and review it again.`, 409);
      }
      const at = now();
      for (const row of rows) {
        const review = {approvedBy, approvedAt: at, notes, pack, confirmations: {wordingReviewed: true, numbersReviewed: true, scopeReviewed: true}};
        this.db.prepare("UPDATE skill_revisions SET status='superseded' WHERE skill_id=? AND id<>? AND status='approved'").run(row.skill_id, row.id);
        this.db.prepare("UPDATE skill_revisions SET status='approved', review=? WHERE id=? AND status='draft'").run(JSON.stringify(review), row.id);
        this.db.prepare('UPDATE skills SET updated_at=? WHERE id=?').run(at, row.skill_id);
      }
      this.store.event(`Approved ${rows.length} skill${rows.length === 1 ? '' : 's'} of the pack "${pack}" by ${approvedBy}`);
      return {approved: rows.length, pack};
    });
  }

  retireRevision(id, input) {
    object(input, 'Request');
    const retiredBy = person(input.retiredBy, 'Your name');
    const why = reason(input.reason);
    return this.store.transaction(() => {
      const row = this.revisionRow(id);
      need(row.status !== 'retired', 'This revision is already retired.', 409);
      this.db.prepare("UPDATE skill_revisions SET status='retired', retirement=? WHERE id=?").run(JSON.stringify({retiredBy, retiredAt: now(), reason: why}), id);
      this.db.prepare('UPDATE skills SET updated_at=? WHERE id=?').run(now(), row.skill_id);
      this.store.event(`Retired skill: ${JSON.parse(row.payload).title} r${row.revision}`);
      return this.revision(id);
    });
  }

  // Import a pack of skills as drafts. A duplicate ID becomes a new revision, never an overwrite.
  importPack(input) {
    object(input, 'Request');
    const createdBy = person(input.createdBy, 'Your name');
    const changeNote = reason(input.changeNote, 'Change note');
    const origin = choice(input.origin ?? 'owner', ['owner', 'learned'], 'import origin');
    need(Array.isArray(input.skills) && input.skills.length >= 1 && input.skills.length <= 500, 'An import holds 1-500 skills.');
    const skills = input.skills.map(entry => validateSkill(entry));
    need(new Set(skills.map(item => item.id)).size === skills.length, 'The import repeats a skill ID.');
    return this.store.transaction(() => {
      const created = [], revised = [], unchanged = [];
      for (const skill of skills) {
        const existing = this.db.prepare('SELECT * FROM skills WHERE id=?').get(skill.id);
        const at = now();
        if (!existing) {
          this.db.prepare('INSERT INTO skills(id,origin,pack,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(skill.id, origin, 'Imported pack', createdBy, at, at);
          this.db.prepare('INSERT INTO skill_revisions(id,skill_id,revision,status,payload,payload_hash,change_note,created_by,created_at) VALUES(?,?,1,?,?,?,?,?,?)')
            .run(randomUUID(), skill.id, 'draft', JSON.stringify(skill), skillHash(skill), changeNote, createdBy, at);
          created.push(skill.id);
          continue;
        }
        if (this.latestRevisionRow(skill.id).payload_hash === skillHash(skill)) { unchanged.push(skill.id); continue; }
        this.appendRevision(skill, {createdBy, changeNote, at});
        revised.push(skill.id);
      }
      this.store.event(`Imported skills: ${created.length} new, ${revised.length} new revision(s), ${unchanged.length} unchanged`);
      return {created, revised, unchanged};
    });
  }
  exportPack({status = 'approved'} = {}) {
    choice(status, ['approved', 'latest'], 'export status');
    return this.skills().map(skill => (status === 'approved' ? skill.approved : skill.latest)).filter(Boolean)
      .map(revision => ({...revision.skill, origin: revision.origin, revisionId: revision.id, revisionNumber: revision.revision, revisionStatus: revision.status}));
  }

  // ------------------------------------------------------------ bindings (owner pins and blocks)
  bind(input) {
    object(input, 'Request');
    const createdBy = person(input.createdBy, 'Your name');
    const note = reason(input.note, 'Note');
    const mode = choice(input.mode, ['pin', 'block'], 'binding mode');
    const taskKey = choice(input.taskKey, TASK_KEYS, 'task key');
    const position = integer(input.position ?? 0, 0, 100, 'Position');
    return this.store.transaction(() => {
      const skill = this.skillRow(input.skillId);
      const familyId = input.familyId ? this.store.family(input.familyId).id : null;
      const existing = this.db.prepare("SELECT id FROM skill_bindings WHERE skill_id=? AND task_key=? AND IFNULL(family_id,'')=?").get(skill.id, taskKey, familyId || '');
      const id = existing?.id || randomUUID();
      if (existing) this.db.prepare('UPDATE skill_bindings SET mode=?,position=?,note=?,created_by=?,created_at=? WHERE id=?').run(mode, position, note, createdBy, now(), id);
      else this.db.prepare('INSERT INTO skill_bindings(id,skill_id,family_id,task_key,mode,position,note,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id, skill.id, familyId, taskKey, mode, position, note, createdBy, now());
      this.store.event(`${mode === 'pin' ? 'Pinned' : 'Blocked'} skill ${skill.id} for ${taskKey}${familyId ? ' (one family)' : ''}`);
      return this.bindings().find(item => item.id === id);
    });
  }
  unbind(id, input) {
    object(input, 'Request');
    person(input.removedBy, 'Your name');
    return this.store.transaction(() => {
      const row = this.db.prepare('SELECT * FROM skill_bindings WHERE id=?').get(text(id, 'Binding ID', 10, 64));
      need(row, 'Skill binding not found.', 404);
      this.db.prepare('DELETE FROM skill_bindings WHERE id=?').run(row.id);
      this.store.event(`Removed the skill ${row.mode} for ${row.skill_id} on ${row.task_key}`);
      return {removed: row.id};
    });
  }

  // ------------------------------------------------------------ project state (Precision OS 32)
  recordProjectState(familyId, input) {
    object(input, 'Request');
    const createdBy = person(input.createdBy, 'Your name');
    const category = choice(input.category, PROJECT_STATE_CATEGORIES, 'project state category');
    const item = text(input.item, 'Item', 4, 300);
    const note = text(input.note || '', 'Note', 0, 1000);
    return this.store.transaction(() => {
      const family = this.store.family(familyId);
      const id = randomUUID();
      this.db.prepare('INSERT INTO family_project_state(id,family_id,category,item,note,created_by,created_at) VALUES(?,?,?,?,?,?,?)').run(id, family.id, category, item, note, createdBy, now());
      this.store.event(`Recorded ${category.toUpperCase()} project state for ${family.name}: ${item}`);
      return this.projectState(family.id).find(row => row.id === id);
    });
  }
  endProjectState(id, input) {
    object(input, 'Request');
    person(input.endedBy, 'Your name');
    const why = reason(input.reason);
    return this.store.transaction(() => {
      const row = this.db.prepare('SELECT * FROM family_project_state WHERE id=?').get(text(id, 'Project state ID', 10, 64));
      need(row && !row.ended_at, 'Open project state entry not found.', 404);
      this.db.prepare('UPDATE family_project_state SET ended_at=?, ended_reason=? WHERE id=?').run(now(), why, row.id);
      return this.projectState(row.family_id).find(item => item.id === row.id);
    });
  }

  // ------------------------------------------------------------ runtime selection
  // Approved revisions only. Owner and learned skills outrank builtin; a family pin lifts a skill
  // to the front, a family or global block removes it entirely.
  select(taskKey, {familyId = null} = {}) {
    choice(taskKey, TASK_KEYS, 'task key');
    const bindings = this.bindings(familyId).filter(item => item.taskKey === taskKey && (item.familyId === null || item.familyId === familyId));
    const blocked = new Set(bindings.filter(item => item.mode === 'block').map(item => item.skillId));
    const pins = new Map(bindings.filter(item => item.mode === 'pin' && !blocked.has(item.skillId)).map(item => [item.skillId, item.position]));
    const rows = this.db.prepare("SELECT r.*, s.origin FROM skill_revisions r JOIN skills s ON s.id=r.skill_id WHERE r.status='approved'").all();
    const selected = [];
    for (const row of rows) {
      if (blocked.has(row.skill_id)) continue;
      const skill = JSON.parse(row.payload);
      const pinned = pins.has(row.skill_id);
      if (!pinned && (skill.pinOnly || !skill.tasks.includes(taskKey))) continue;
      selected.push({revisionId: row.id, revision: row.revision, origin: row.origin, pinned, pinPosition: pinned ? pins.get(row.skill_id) : 0, skill});
    }
    selected.sort((left, right) =>
      Number(right.pinned) - Number(left.pinned)
      || left.pinPosition - right.pinPosition
      || ORIGIN_RANK[right.origin] - ORIGIN_RANK[left.origin]
      || right.skill.priority - left.skill.priority
      || left.skill.id.localeCompare(right.skill.id));
    return selected;
  }

  // The compact brief that goes into a Claude system prompt. A skill that does not fit the byte
  // budget is dropped whole and counted, never trimmed mid-rule.
  brief(taskKey, {familyId = null, byteBudget = TASK_BRIEF_BYTES[taskKey] || BRIEF_BYTE_BUDGET} = {}) {
    integer(byteBudget, 200, 20000, 'Brief byte budget');
    const selected = this.select(taskKey, {familyId});
    const entries = [], revisionIds = [], skillIds = [];
    let used = 0, dropped = 0;
    for (const item of selected) {
      const entry = {id: item.skill.id, title: item.skill.title, when: item.skill.when};
      // The rules, not the prose. A skill without do rules sends its steps instead, and one with neither its summary
      // (0.71: 75 such skills reached prompts with only their avoid list and checks).
      if (!item.skill.do.length && !item.skill.steps.length) entry.summary = item.skill.summary;
      for (const key of ['do', ...(item.skill.do.length ? [] : ['steps']), 'avoid', 'checks']) if (item.skill[key].length) entry[key] = item.skill[key];
      if (Object.keys(item.skill.numbers).length) entry.numbers = item.skill.numbers;
      const size = Buffer.byteLength(JSON.stringify(entry), 'utf8');
      if (used + size > byteBudget) { dropped++; continue; }
      used += size;
      entries.push(entry);
      revisionIds.push(item.revisionId);
      skillIds.push(item.skill.id);
    }
    return {
      taskKey, familyId, sourceHierarchy: SOURCE_HIERARCHY, skills: entries,
      projectState: familyId ? this.openProjectState(familyId) : null,
      revisionIds, skillIds, injectedBytes: used, dropped, available: selected.length, byteBudget,
    };
  }
  openProjectState(familyId) {
    const open = this.projectState(familyId).filter(row => !row.endedAt);
    const grouped = {};
    for (const category of PROJECT_STATE_CATEGORIES) {
      const items = open.filter(row => row.category === category).map(row => row.item);
      if (items.length) grouped[category] = items;
    }
    return Object.keys(grouped).length ? grouped : null;
  }

  // What goes into a prompt: the brief without the bookkeeping fields. null when there is nothing
  // approved to say, so an unreviewed library never silently changes a prompt.
  promptBrief(taskKey, options = {}) {
    const brief = this.brief(taskKey, options);
    if (!brief.skills.length && !brief.projectState) return null;
    const prompt = {sourceHierarchy: brief.sourceHierarchy, skills: brief.skills};
    if (brief.projectState) prompt.projectState = brief.projectState;
    return {...brief, prompt};
  }

  recordUsage({jobId, familyId = null, room, taskKey, brief, outcome = null}) {
    object(brief, 'Skill brief');
    const id = randomUUID();
    this.db.prepare('INSERT INTO skill_usage(id,job_id,family_id,room,task_key,revision_ids,skill_ids,injected_bytes,dropped,outcome,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(job_id,task_key) DO NOTHING')
      .run(id, text(jobId, 'Job ID', 1, 80), familyId, text(room, 'Room', 2, 40), choice(taskKey, TASK_KEYS, 'task key'),
        JSON.stringify(brief.revisionIds), JSON.stringify(brief.skillIds), brief.injectedBytes, brief.dropped, outcome, now());
    return id;
  }
  settleUsage(jobId, outcome) {
    this.db.prepare('UPDATE skill_usage SET outcome=? WHERE job_id=?').run(text(outcome, 'Outcome', 2, 200), text(jobId, 'Job ID', 1, 80));
  }

  // ------------------------------------------------------------ learning loop
  // Capture is rule-based and additive: it records what the program's own review already found.
  // It never edits a skill. A repeat capture for the same source reference is ignored, and a
  // finding the owner already rejected for that family is not proposed again.
  capture(input) {
    object(input, 'Lesson candidate');
    const source = text(input.source, 'Lesson source', 3, 60);
    const sourceRef = text(input.sourceRef, 'Lesson source reference', 1, 120);
    const taskKey = choice(input.taskKey, TASK_KEYS, 'task key');
    const finding = text(input.finding, 'Finding', 10, 2000);
    const evidence = list(input.evidence ?? [], 'Evidence references', 0, 20, 1, 300);
    const proposal = object(input.proposal, 'Proposal');
    const kind = choice(proposal.kind, ['add-do', 'add-avoid', 'add-check', 'set-number', 'new-skill'], 'proposal kind');
    const value = text(proposal.value, 'Proposal value', 4, 1200);
    const numberKey = kind === 'set-number' ? text(proposal.numberKey, 'Number key', 1, 80) : null;
    const skillId = input.skillId ? this.skillRow(input.skillId).id : null;
    need(kind === 'new-skill' || skillId, 'Name the skill this lesson would change, or propose a new skill.');
    const draft = kind === 'new-skill' ? validateSkill(proposal.skill) : null;
    const familyId = input.familyId ? this.store.family(input.familyId).id : null;
    if (familyId && this.projectState(familyId).some(row => row.category === 'rejected' && !row.endedAt && row.item.toLowerCase() === finding.toLowerCase())) return null;
    const existing = this.db.prepare('SELECT id FROM skill_lessons WHERE source=? AND source_ref=? AND task_key=?').get(source, sourceRef, taskKey);
    if (existing) return this.lessons().find(row => row.id === existing.id);
    const id = randomUUID(), at = now();
    this.db.prepare('INSERT INTO skill_lessons(id,family_id,skill_id,task_key,source,source_ref,evidence,finding,proposal,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, familyId, skillId, taskKey, source, sourceRef, JSON.stringify(evidence), finding,
        JSON.stringify({kind, value, numberKey, skill: draft}), 'proposed', at, at);
    this.store.event(`Recorded a skill lesson candidate from ${source} for review`);
    return this.lessons().find(row => row.id === id);
  }

  // Approving a lesson writes a new DRAFT revision (or a new learned draft skill). The draft still
  // needs the normal skill approval, so no lesson reaches runtime on a single decision.
  reviewLesson(id, input) {
    object(input, 'Request');
    const reviewedBy = person(input.reviewedBy, 'Reviewer name');
    const action = choice(input.action, ['approve', 'reject'], 'lesson decision');
    const why = reason(input.reason);
    return this.store.transaction(() => {
      const row = this.db.prepare('SELECT * FROM skill_lessons WHERE id=?').get(text(id, 'Lesson ID', 10, 64));
      need(row && row.status === 'proposed', 'Proposed lesson not found.', 404);
      const review = {reviewedBy, reviewedAt: now(), action, reason: why};
      const proposal = JSON.parse(row.proposal);
      if (action === 'reject') {
        this.db.prepare("UPDATE skill_lessons SET status='rejected', review=?, updated_at=? WHERE id=?").run(JSON.stringify(review), now(), row.id);
        if (row.family_id) {
          this.db.prepare('INSERT INTO family_project_state(id,family_id,category,item,note,created_by,created_at) VALUES(?,?,?,?,?,?,?)')
            .run(randomUUID(), row.family_id, 'rejected', row.finding, `Rejected skill lesson: ${why}`, reviewedBy, now());
        }
        this.store.event('Rejected a skill lesson candidate');
        return {lesson: this.lessons().find(item => item.id === row.id), revision: null};
      }
      let revision;
      if (proposal.kind === 'new-skill') {
        const skill = validateSkill(proposal.skill), at = now();
        need(!this.db.prepare('SELECT id FROM skills WHERE id=?').get(skill.id), 'A skill with that ID already exists; propose a revision of it instead.', 409);
        this.db.prepare('INSERT INTO skills(id,origin,pack,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(skill.id, 'learned', "Learned from the program's own reviews", reviewedBy, at, at);
        const revisionId = randomUUID();
        this.db.prepare('INSERT INTO skill_revisions(id,skill_id,revision,status,payload,payload_hash,change_note,lesson_id,created_by,created_at) VALUES(?,?,1,?,?,?,?,?,?,?)')
          .run(revisionId, skill.id, 'draft', JSON.stringify(skill), skillHash(skill), `From lesson: ${why}`, row.id, reviewedBy, at);
        revision = this.revision(revisionId);
      } else {
        need(row.skill_id, 'This lesson does not name a skill to change.');
        const latest = this.latestRevisionRow(row.skill_id);
        need(latest, 'Skill not found.', 404);
        const skill = JSON.parse(latest.payload);
        if (proposal.kind === 'set-number') skill.numbers = {...skill.numbers, [proposal.numberKey]: proposal.value};
        else {
          const field = {'add-do': 'do', 'add-avoid': 'avoid', 'add-check': 'checks'}[proposal.kind];
          need(!skill[field].some(entry => entry.toLowerCase() === proposal.value.toLowerCase()), 'That rule is already in the skill.', 409);
          skill[field] = [...skill[field], proposal.value];
        }
        revision = this.appendRevision(validateSkill(skill), {createdBy: reviewedBy, changeNote: `From lesson: ${why}`, lessonId: row.id});
      }
      this.db.prepare("UPDATE skill_lessons SET status='approved', review=?, updated_at=? WHERE id=?").run(JSON.stringify({...review, revisionId: revision.id}), now(), row.id);
      this.store.event(`Approved a skill lesson into draft revision ${revision.skillId} r${revision.revision}`);
      return {lesson: this.lessons().find(item => item.id === row.id), revision};
    });
  }

  // Did a skill help? Counted from recorded outcomes, never assumed.
  effect(skillId) {
    const id = this.skillRow(skillId).id;
    const rows = this.db.prepare('SELECT * FROM skill_usage ORDER BY created_at').all().filter(row => JSON.parse(row.skill_ids).includes(id));
    const outcomes = {};
    for (const row of rows) {
      const outcome = row.outcome || 'unknown';
      outcomes[outcome] = (outcomes[outcome] || 0) + 1;
    }
    return {skillId: id, uses: rows.length, outcomes};
  }

  // Attach the runtime to the store so the prompt-building rooms can reach it, the same way the
  // competitor blueprint attaches its script guidance.
  attach() {
    this.store.skillRuntime = {
      brief: (taskKey, familyId) => this.promptBrief(taskKey, {familyId}),
      recordUsage: args => this.recordUsage(args),
      // The approved skills that apply to a task, for rooms that follow skills in code rather than in a prompt.
      approved: (taskKey, familyId) => this.select(taskKey, {familyId}).map(item => ({id: item.skill.id, revisionId: item.revisionId})),
      settleUsage: (jobId, outcome) => { try { this.settleUsage(jobId, outcome); } catch { /* an outcome label is bookkeeping; it must not fail a job */ } },
      // Capture is best-effort bookkeeping around a real review decision: a malformed candidate
      // must never roll back the review that produced it.
      capture: input => { try { return this.capture(input); } catch { return null; } },
    };
    return this;
  }
}

module.exports = {
  SkillsEngine, SkillError, validateSkill, skillHash, skillQuality, loadPacks, PACK_FILES,
  TASK_KEYS, ROOMS, ROOM_TASKS, KINDS, ORIGINS, STATUSES, PROJECT_STATE_CATEGORIES,
  SOURCE_HIERARCHY, BRIEF_BYTE_BUDGET, TASK_BRIEF_BYTES, RULES,
};
