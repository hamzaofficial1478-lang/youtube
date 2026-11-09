'use strict';
// Skills from a folder or a .zip (0.96, owner 2026-11-09: "when someone adds a skills folder, zip or anything, the
// program keeps the important data, throws out the unnecessary data by itself, reads those skills for the models and
// assigns them to whichever model needs them").
//
// Pure: nothing here writes a file or runs anything. An archive is read in memory; only text a model can use is kept
// (a skill's SKILL.md and its Markdown references, plain text notes, and JSON packs already in our skill format). Code,
// pictures, sound, fonts, nested archives, dependency folders, licences and system files are dropped with the reason.
// Each kept document is split by its sections into small skills (a model is directed by a few rules at a time), and
// every skill is assigned to the jobs its words are about, so the skill engine hands it to the model of that job.
const zlib = require('node:zlib');

const LIMITS = Object.freeze({entries: 5000, archiveBytes: 40 * 1024 * 1024, fileBytes: 2 * 1024 * 1024, keptBytes: 12 * 1024 * 1024, skills: 500, perDocument: 40, items: 8});

// ------------------------------------------------------------------ reading a .zip in memory
const u16 = (b, o) => b.readUInt16LE(o), u32 = (b, o) => b.readUInt32LE(o);
function cleanPath(name) {
  const parts = String(name).replace(/\\/g, '/').split('/').filter(part => part && part !== '.');
  return parts.includes('..') ? null : parts.join('/');
}
// Entries of a zip: {path, size, data} for the files `wanted(path, size)` accepts, {path, size, dropped} for the rest.
function readZip(buffer, wanted = () => true) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) throw new Error('This is not a .zip file.');
  if (buffer.length > LIMITS.archiveBytes) throw new Error(`The .zip is larger than ${LIMITS.archiveBytes / 1024 / 1024} MB.`);
  let end = -1;
  for (let k = buffer.length - 22; k >= Math.max(0, buffer.length - 22 - 65535); k--) if (u32(buffer, k) === 0x06054b50) { end = k; break; }
  if (end < 0) throw new Error('This is not a .zip file (its directory was not found).');
  const count = u16(buffer, end + 10), size = u32(buffer, end + 12), start = u32(buffer, end + 16);
  if (count === 0xffff || start === 0xffffffff || size === 0xffffffff) throw new Error('Very large .zip files (ZIP64) are not supported. Unzip it and add the folder instead.');
  if (count > LIMITS.entries) throw new Error(`The .zip holds more than ${LIMITS.entries} files.`);
  if (start + size > buffer.length) throw new Error('The .zip is damaged (its directory points outside the file).');
  const out = [];
  for (let k = 0, at = start; k < count; k++) {
    if (at + 46 > buffer.length || u32(buffer, at) !== 0x02014b50) throw new Error('The .zip is damaged (a directory entry is broken).');
    const flags = u16(buffer, at + 8), method = u16(buffer, at + 10), packed = u32(buffer, at + 20), unpacked = u32(buffer, at + 24);
    const nameLength = u16(buffer, at + 28), extra = u16(buffer, at + 30), comment = u16(buffer, at + 32), local = u32(buffer, at + 42);
    const raw = buffer.subarray(at + 46, at + 46 + nameLength), name = flags & 0x800 ? raw.toString('utf8') : raw.toString('latin1');
    at += 46 + nameLength + extra + comment;
    if (name.endsWith('/')) continue;
    const path = cleanPath(name);
    if (!path) { out.push({path: name, size: unpacked, dropped: 'a path that leaves the folder'}); continue; }
    if (flags & 1) { out.push({path, size: unpacked, dropped: 'encrypted'}); continue; }
    const why = wanted(path, unpacked);
    if (why !== true) { out.push({path, size: unpacked, dropped: why || 'not needed by the models'}); continue; }
    if (local + 30 > buffer.length || u32(buffer, local) !== 0x04034b50) { out.push({path, size: unpacked, dropped: 'damaged in the .zip'}); continue; }
    const from = local + 30 + u16(buffer, local + 26) + u16(buffer, local + 28), body = buffer.subarray(from, from + packed);
    try {
      const data = method === 0 ? Buffer.from(body) : method === 8 ? zlib.inflateRawSync(body, {maxOutputLength: LIMITS.fileBytes}) : null;
      if (!data) out.push({path, size: unpacked, dropped: 'packed in a way this reader does not open'});
      else out.push({path, size: data.length, data});
    } catch { out.push({path, size: unpacked, dropped: `larger than ${LIMITS.fileBytes / 1024 / 1024} MB, or damaged`}); }
  }
  return out;
}

// ------------------------------------------------------------------ what is kept and what is thrown out
const CODE = /\.(py|pyc|js|mjs|cjs|ts|tsx|jsx|sh|bash|zsh|ps1|psm1|bat|cmd|exe|dll|so|dylib|bin|rb|go|rs|java|class|jar|c|cc|cpp|h|hpp|cs|php|pl|lua|swift|kt|r|ipynb|wasm|vbs|scpt|applescript|sql)$/i;
const MEDIA = /\.(png|jpe?g|gif|webp|svg|ico|bmp|tiff?|psd|ai|eps|mp3|wav|ogg|flac|m4a|aac|mp4|mov|webm|mkv|avi|ttf|otf|woff2?|eot|pdf|docx?|pptx?|xlsx?|key|numbers|pages)$/i;
const ARCHIVE = /\.(zip|tar|gz|tgz|bz2|xz|7z|rar)$/i;
const CONFIG = /(^|\/)(package(-lock)?\.json|yarn\.lock|pnpm-lock\.yaml|requirements\.txt|pyproject\.toml|setup\.(py|cfg)|Cargo\.(toml|lock)|go\.(mod|sum)|tsconfig\.json|\.eslintrc.*|\.prettierrc.*|Makefile|Dockerfile|docker-compose\.ya?ml|\.gitignore|\.gitattributes|\.npmignore|\.editorconfig|evals?\.json|marketplace\.json|plugin\.json)$/i;
const TEXT = /\.(md|markdown|mdx|txt|text)$/i;
// Why a file is not kept, or true when it is.
function keepFile(path, size = 0) {
  const parts = path.split('/'), base = parts.at(-1);
  if (parts.some(part => part === '__MACOSX' || part === 'node_modules' || part === '.git' || part === 'venv' || part === '.venv' || part === '__pycache__' || part === 'dist' || part === 'build')) return 'a dependency, build or system folder';
  if (parts.some(part => part.startsWith('.') && part !== '.claude') || /^(Thumbs\.db|desktop\.ini)$/i.test(base)) return 'a hidden or system file';
  if (/^(licen[cs]e|copying|notice)(\.(md|txt))?$/i.test(base)) return 'a licence (its name is recorded with the skills)';
  if (/(^|[-_. ])(licen[cs]e|ofl|copying|eula)([-_. ]|$)/i.test(base)) return 'a licence of a font or file inside the folder';
  if (parts.slice(0, -1).some(part => /fonts?$/i.test(part))) return 'part of a font folder';
  if (/^(changelog|contributing|code_of_conduct|security|authors|history)(\.(md|txt))?$/i.test(base)) return 'project housekeeping, not craft';
  if (CODE.test(base)) return 'program code (never run; a model is directed by the skill text, not by scripts)';
  if (MEDIA.test(base)) return 'a picture, sound, video, font or office file';
  if (ARCHIVE.test(base)) return 'an archive inside the archive';
  if (CONFIG.test(path)) return 'a settings or package file';
  if (!TEXT.test(base) && !/\.json$/i.test(base)) return 'not a text file a model can use';
  if (size > LIMITS.fileBytes) return `larger than ${LIMITS.fileBytes / 1024 / 1024} MB`;
  return true;
}
const licenceName = text => {
  const head = String(text).slice(0, 600);
  return /Apache License/i.test(head) ? 'Apache-2.0' : /\bMIT License\b|Permission is hereby granted, free of charge/i.test(head) ? 'MIT' : /GNU AFFERO/i.test(head) ? 'AGPL' : /GNU (LESSER|LIBRARY)/i.test(head) ? 'LGPL' : /GNU GENERAL PUBLIC/i.test(head) ? 'GPL'
    : /Creative Commons|CC BY/i.test(head) ? 'Creative Commons' : /PolyForm Noncommercial/i.test(head) ? 'PolyForm Noncommercial' : /BSD/i.test(head) ? 'BSD' : /proprietary|all rights reserved/i.test(head) ? 'proprietary' : 'a licence (see its file)';
};

// ------------------------------------------------------------------ Markdown to sections
function frontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return {meta: {}, body: text};
  const meta = {};
  let key = null;
  for (const line of match[1].split(/\r?\n/)) {
    const pair = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (pair) { key = pair[1].toLowerCase(); meta[key] = pair[2].replace(/^["'>|]\s*|["']$/g, '').trim(); }
    else if (key && /^\s+\S/.test(line)) meta[key] = `${meta[key]} ${line.trim()}`.trim();
  }
  return {meta, body: text.slice(match[0].length)};
}
const inline = text => String(text).replace(/<!--[\s\S]*?-->/g, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/<[^>]+>/g, ' ')
  .replace(/(\*\*|__)(.*?)\1/g, '$2').replace(/(^|\W)[*_]([^*_]+)[*_](?=\W|$)/g, '$1$2').replace(/`([^`]*)`/g, '$1').replace(/\s+/g, ' ').trim();
// Sections of a document: {title, depth, items: [{text, numbered}], paragraphs: []}. Code blocks are left out.
function sections(body) {
  const out = [{title: '', depth: 0, items: [], paragraphs: []}];
  let fence = false, paragraph = [], lead = '';
  // lead: the sentence that introduces a list ("Avoid these defaults:"), so its items keep its meaning.
  const flush = () => { if (paragraph.length) { const text = inline(paragraph.join(' ')); if (text) { out.at(-1).paragraphs.push(text); lead = /:$/.test(text) ? text : ''; } paragraph = []; } };
  for (const line of String(body).split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) { flush(); fence = !fence; continue; }
    if (fence) continue;
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) { flush(); lead = ''; out.push({title: inline(heading[2]).replace(/[:#]+$/, ''), depth: heading[1].length, items: [], paragraphs: []}); continue; }
    const item = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (item) { flush(); const text = inline(item[2].replace(/^\[[ xX]\]\s*/, '')); if (text.length >= 3) out.at(-1).items.push({text, numbered: /\d/.test(item[1]), lead}); continue; }
    if (/^\s*\|/.test(line)) {
      flush();
      if (/^\s*\|?[\s:|-]+\|?\s*$/.test(line)) continue;
      const cells = line.split('|').map(cell => inline(cell)).filter(Boolean);
      if (cells.length >= 2) out.at(-1).items.push({text: cells.join(' — '), numbered: false});
      continue;
    }
    if (!line.trim()) { flush(); continue; }
    if (out.at(-1).items.length && !paragraph.length) lead = '';
    if (/^\s{2,}\S/.test(line) && out.at(-1).items.length && !paragraph.length) { const last = out.at(-1).items.at(-1); last.text = `${last.text} ${inline(line)}`; continue; }
    paragraph.push(line.trim());
  }
  flush();
  return out.filter(section => section.items.length || section.paragraphs.length);
}
// Sections that hold no craft for a model.
const HOUSEKEEPING = /^(table of contents|contents|toc|license|licence|install(ation)?|setup|getting started|quick ?start|usage examples?|requirements|dependencies|changelog|credits|acknowledg(e)?ments?|contributing|support|faq|links|references|see also|files?|directory structure|folder structure|project structure)$/i;

// ------------------------------------------------------------------ which jobs a skill is for
// The words of each job. A skill goes to the jobs its own words are about; the skill engine then hands it to the model
// of that job, chosen again for every request by relevance.
const JOB_WORDS = Object.freeze({
  'script.candidate': ['script', 'scripts', 'scripting', 'write', 'writing', 'writer', 'narrative', 'story', 'storytelling', 'outline', 'paragraph', 'sentence', 'retention', 'payoff', 'promise', 'copy', 'copywriting', 'tone'],
  'script.hooks': ['hook', 'hooks', 'opening', 'intro', 'first seconds', 'curiosity', 'open loop'],
  'script.review': ['review', 'critique', 'edit the draft', 'proofread', 'rewrite', 'feedback', 'humanize', 'ai tells'],
  'voice.direction': ['voice', 'voiceover', 'voice-over', 'narration', 'narrator', 'delivery', 'pronunciation', 'emphasis', 'pause', 'pace', 'speaking', 'read aloud', 'emotion'],
  'scene.plan': ['scene', 'scenes', 'storyboard', 'shot', 'shots', 'visual', 'visuals', 'composition', 'framing', 'camera', 'staging', 'character', 'characters', 'background', 'setting', 'b-roll', 'broll'],
  'visuals.prompt': ['image', 'images', 'illustration', 'illustrate', 'drawing', 'draw', 'painting', 'paint', 'picture', 'art', 'artwork', 'style', 'palette', 'colour', 'color', 'lighting', 'prompt'],
  'motion.template': ['motion', 'animation', 'animate', 'animated', 'kinetic', 'typography', 'easing', 'keyframe', 'gsap', 'transition', 'graphic', 'graphics', 'infographic', 'chart', 'layout'],
  'editing.plan': ['edit', 'editing', 'editor', 'cut', 'cuts', 'pacing', 'rhythm', 'timeline', 'transition', 'transitions', 'jump cut', 'zoom', 'punch-in', 'montage', 'beat'],
  'editing.review': ['review the edit', 'rough cut', 'final cut', 'watch back'],
  'captions.segment': ['caption', 'captions', 'subtitle', 'subtitles', 'on-screen text', 'karaoke'],
  'audio.mix': ['music', 'sound', 'sounds', 'sfx', 'audio', 'mix', 'mixing', 'loudness', 'lufs', 'ducking', 'soundtrack', 'foley'],
  'qc.review': ['quality', 'qa', 'check', 'checklist', 'verify', 'validation', 'defects', 'glitch', 'mistakes'],
  'packaging.title': ['title', 'titles', 'headline', 'ctr', 'click'],
  'packaging.thumbnail': ['thumbnail', 'thumbnails'],
  'packaging.seo': ['seo', 'tags', 'description', 'keywords', 'search', 'chapters'],
  'ideas.titles': ['idea', 'ideas', 'topic', 'topics', 'brainstorm', 'trend', 'trending', 'viral'],
  'niche.evaluate': ['niche', 'niches', 'market', 'audience', 'monetization', 'monetisation', 'cpm', 'rpm', 'positioning'],
  'competitors.blueprint': ['competitor', 'competitors', 'benchmark', 'outlier', 'reverse engineer', 'analysis of channels'],
  'research.brief': ['research', 'sources', 'facts', 'fact-check', 'evidence', 'citation', 'citations', 'research brief'],
  'branding.identity': ['brand', 'branding', 'identity', 'logo', 'channel identity'],
  'localization.check': ['translate', 'translation', 'localize', 'localise', 'localization', 'language'],
  'analytics.review': ['analytics', 'metrics', 'watch time', 'retention graph', 'audience retention', 'performance'],
});
const ROOM_OF = task => ({'script.candidate': 'script', 'script.hooks': 'hooks', 'script.review': 'script', 'voice.direction': 'voice', 'scene.plan': 'scene', 'visuals.prompt': 'visuals', 'motion.template': 'motion', 'editing.plan': 'editing', 'editing.review': 'editing',
  'captions.segment': 'captions', 'audio.mix': 'audio', 'qc.review': 'qc', 'packaging.title': 'packaging', 'packaging.thumbnail': 'packaging', 'packaging.seo': 'seo', 'ideas.titles': 'ideas', 'niche.evaluate': 'niche', 'competitors.blueprint': 'competitors',
  'research.brief': 'research', 'branding.identity': 'branding', 'localization.check': 'localization', 'analytics.review': 'analytics'})[task];
const escape = word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PATTERNS = Object.fromEntries(Object.entries(JOB_WORDS).map(([task, words]) => [task, words.map(word => new RegExp(`\\b${escape(word)}\\b`, 'gi'))]));
// The jobs a text is about, best first: the jobs with at least half the hits of the best (title words count three times).
function jobsFor(title, text, fallback = []) {
  const score = Object.fromEntries(Object.entries(PATTERNS).map(([task, patterns]) => [task, patterns.reduce((sum, pattern) => sum + (String(text).match(pattern) || []).length + 3 * (String(title).match(pattern) || []).length, 0)]));
  const best = Math.max(...Object.values(score));
  if (!best) return fallback;
  return Object.entries(score).filter(([, value]) => value >= Math.max(2, best / 2) || value === best).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([task]) => task);
}

// ------------------------------------------------------------------ documents to skills
const slug = value => String(value).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'skill';
const clip = (value, max) => { const text = String(value).trim(); return text.length <= max ? text : `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…`; };
// An avoid-rule starts with it ("Never…", "Don't…"); "Cut on the word, never mid-word" is a do-rule.
const AVOID = /^(avoid|never|don'?t|do not|no\b|stop|without|not\b)/i;
const CHECK_TITLE = /\b(check|checks|checklist|verify|verification|qa|quality check|test|tests|before you (ship|publish|finish|answer)|acceptance|done when)\b/i;
const CHECK_ITEM = /^(check|verify|make sure|ensure|confirm|is |are |does |do |has |have )/i;
// One document (a SKILL.md or a reference) as skills: one per section, at most LIMITS.items rules each.
// A reference file is judged by its own words (its parent's description only says when it applies).
function documentSkills({name, description = '', text, path, source, licence = null, fallbackJobs = [], reference = false}) {
  const {meta, body} = frontmatter(text), title = inline(meta.name || name), about = inline(meta.description || description);
  const list = sections(body).filter(section => !HOUSEKEEPING.test(section.title));
  // Sections deeper than the main level join the section above them, so a skill keeps its sub-points.
  const top = Math.min(...list.map(section => section.depth).filter(depth => depth > 1), 7), grouped = [];
  for (const section of list) {
    if (!grouped.length || section.depth <= top || section.depth === 0) grouped.push({...section, items: [...section.items], paragraphs: [...section.paragraphs]});
    else { const last = grouped.at(-1); last.items.push(...section.items.map(item => ({...item, text: section.title ? `${section.title}: ${item.text}` : item.text}))); last.paragraphs.push(...section.paragraphs); }
  }
  const out = [], docJobs = jobsFor(reference ? title : `${title} ${about}`, body, fallbackJobs);
  for (const section of grouped) {
    const sentences = section.paragraphs.join(' ').split(/(?<=[.!?])\s+(?=[A-Z])/).map(item => item.trim()).filter(item => item.length >= 12);
    const items = section.items.length ? section.items : sentences.slice(0, LIMITS.items).map(item => ({text: item, numbered: false}));
    if (!items.length) continue;
    const heading = section.title || (section.depth === 0 ? 'Overview' : title), summaryText = sentences.slice(0, 3).join(' ') || `${heading}: ${items.slice(0, 2).map(item => item.text).join(' ')}`;
    for (let part = 0; part * LIMITS.items < items.length && out.length < LIMITS.perDocument; part++) {
      const chunk = items.slice(part * LIMITS.items, (part + 1) * LIMITS.items), checksSection = CHECK_TITLE.test(heading);
      const avoids = item => AVOID.test(item.text) || (!!item.lead && AVOID.test(item.lead));
      const avoid = chunk.filter(avoids).map(item => clip(item.text, 1200));
      const checks = chunk.filter(item => !avoids(item) && (checksSection || CHECK_ITEM.test(item.text))).map(item => clip(item.text, 1200));
      const rest = chunk.filter(item => !avoids(item) && !(checksSection || CHECK_ITEM.test(item.text)));
      const numbered = rest.length >= 2 && rest.filter(item => item.numbered).length >= rest.length / 2;
      // A section keeps to its document's jobs (a design skill's sections stay design skills); a document about nothing
      // in particular lets each section find its own.
      const own = jobsFor(heading, chunk.map(item => item.text).join(' ') + ' ' + summaryText, []), shared = own.filter(task => docJobs.includes(task));
      const jobs = docJobs.length ? (shared.length ? shared : docJobs) : own;
      const label = `${heading}${part ? ` (${part + 1})` : ''}`;
      out.push({
        title: clip(title && heading.toLowerCase() !== title.toLowerCase() ? `${title}: ${label}` : label, 120),
        tasks: jobs, rooms: [...new Set(jobs.map(ROOM_OF))], kind: numbered ? 'procedure' : checks.length > rest.length ? 'checklist' : 'principle',
        when: clip(about ? `${about}` : `Work on ${heading.toLowerCase()}`, 400).padEnd(10, '.'),
        summary: clip(summaryText, 1500).padEnd(10, '.'),
        ...(numbered ? {steps: rest.map(item => clip(item.text, 1200))} : {do: rest.map(item => clip(item.text, 1200))}),
        avoid, checks, tags: [...new Set(`${title} ${heading}`.toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length >= 3))].slice(0, 12),
        source: clip(`Imported by the owner from ${source}: ${path}${licence ? ` (licence: ${licence})` : ''}`, 600), priority: 60, path, base: `${slug(title || name)}-${slug(heading)}${part ? `-${part + 1}` : ''}`,
      });
    }
  }
  return out;
}

// The whole import: files [{path, text}] (a folder read by the page, or a zip read here) to skills, with what was kept
// and what was thrown out. validate(skill) is the skill engine's own check, so nothing invalid is offered.
function fromFiles(files, {name = 'skills', dropped = [], validate = skill => skill} = {}) {
  const kept = [], thrown = [...dropped], skills = [], warnings = [], licences = new Set();
  const texts = [];
  for (const file of files) {
    const path = cleanPath(file.path);
    if (!path) { thrown.push({path: String(file.path), why: 'a path that leaves the folder'}); continue; }
    const why = keepFile(path, Buffer.byteLength(String(file.text || '')));
    const base = path.split('/').at(-1);
    if (/^(licen[cs]e|copying)(\.(md|txt))?$/i.test(base)) licences.add(licenceName(file.text));
    if (why !== true) { thrown.push({path, why}); continue; }
    const text = String(file.text || '').replace(/^﻿/, '');
    if (text.includes('\u0000')) { thrown.push({path, why: 'not a text file a model can use'}); continue; }
    if (!text.trim()) { thrown.push({path, why: 'empty'}); continue; }
    texts.push({path, text});
  }
  const licence = licences.size ? [...licences].join(', ') : null;
  const skillDirs = texts.filter(file => /(^|\/)SKILL\.md$/i.test(file.path)).map(file => file.path.replace(/(^|\/)SKILL\.md$/i, '')).sort((a, b) => b.length - a.length);
  const owner = path => skillDirs.find(dir => !dir || path === dir || path.startsWith(`${dir}/`));
  let used = 0;
  for (const file of texts) {
    if (used > LIMITS.keptBytes) { thrown.push({path: file.path, why: `past the ${LIMITS.keptBytes / 1024 / 1024} MB the program keeps from one import`}); continue; }
    if (/\.json$/i.test(file.path)) {
      let data;
      try { data = JSON.parse(file.text); } catch { thrown.push({path: file.path, why: 'JSON that could not be read'}); continue; }
      const list = Array.isArray(data) ? data : Array.isArray(data?.skills) ? data.skills : null;
      if (!list || !list.every(item => item && typeof item === 'object' && typeof item.id === 'string' && typeof item.title === 'string')) { thrown.push({path: file.path, why: 'JSON that is not a skill pack'}); continue; }
      for (const item of list) {
        try { skills.push({...validate(item), path: file.path, ready: true}); } catch (error) { warnings.push(`${file.path}: ${item.id} was left out (${error.message})`); }
      }
      kept.push({path: file.path, bytes: file.text.length, as: 'skill pack'}); used += file.text.length;
      continue;
    }
    const dir = owner(file.path), main = /(^|\/)SKILL\.md$/i.test(file.path);
    // A README beside a SKILL.md says the same thing for people; the SKILL.md is what a model needs.
    if (dir !== undefined && /(^|\/)README\.(md|markdown|txt)$/i.test(file.path) && texts.some(other => other.path === `${dir ? `${dir}/` : ''}SKILL.md`)) { thrown.push({path: file.path, why: 'a read-me for people; its SKILL.md is kept'}); continue; }
    const skillFile = dir !== undefined ? texts.find(other => other.path.toLowerCase() === `${dir ? `${dir}/` : ''}skill.md`) : null;
    const meta = skillFile ? frontmatter(skillFile.text).meta : {};
    const docName = main ? meta.name || dir.split('/').at(-1) || name : `${meta.name || (dir ? dir.split('/').at(-1) : '')}${meta.name || dir ? ' · ' : ''}${file.path.split('/').at(-1).replace(/\.\w+$/, '').replace(/[-_]+/g, ' ')}`;
    const made = documentSkills({name: docName, description: main ? '' : meta.description || '', text: file.text, path: file.path, source: name, licence,
      fallbackJobs: skillFile ? jobsFor(meta.name || '', skillFile.text) : [], reference: !main && !!skillFile});
    if (!made.length) { thrown.push({path: file.path, why: 'no rules a model can follow (only headings, links or code)'}); continue; }
    kept.push({path: file.path, bytes: file.text.length, as: main ? 'skill' : 'reference', skills: made.length}); used += file.text.length;
    skills.push(...made);
  }
  // IDs: <area>.<name>: the area is the first job's area, so the engine's per-area spreading and engine rules apply.
  const ids = new Set(), final = [];
  for (const skill of skills.slice(0, LIMITS.skills)) {
    if (skill.ready) { const {path, ready, ...rest} = skill; if (ids.has(rest.id)) { warnings.push(`${path}: ${rest.id} appears twice; the first is kept`); continue; } ids.add(rest.id); final.push(rest); continue; }
    const area = (skill.tasks[0] || 'general.x').split('.')[0].replace(/[^a-z0-9]/g, '') || 'general';
    let id = `${area}.own-${skill.base}`.slice(0, 80).replace(/-+$/, ''), n = 2;
    while (ids.has(id)) id = `${area}.own-${skill.base}`.slice(0, 76).replace(/-+$/, '') + `-${n++}`;
    ids.add(id);
    const {path, base, ...rest} = skill;
    const candidate = {...rest, id, rooms: rest.rooms.length ? rest.rooms : ['general'], tasks: rest.tasks};
    try { final.push(validate(candidate)); } catch (error) { warnings.push(`${path}: "${skill.title}" was left out (${error.message})`); }
  }
  if (skills.length > LIMITS.skills) warnings.push(`Only the first ${LIMITS.skills} skills are offered from one import.`);
  return {name, skills: final, kept, dropped: thrown, warnings, licence};
}

// A .zip as {path, text} files plus what was thrown out before reading.
function zipFiles(buffer) {
  const files = [], dropped = [];
  for (const entry of readZip(buffer, keepFileOrLicence)) {
    if (entry.dropped) dropped.push({path: entry.path, why: entry.dropped});
    else files.push({path: entry.path, text: entry.data.toString('utf8')});
  }
  // A zip whose files all sit in one top folder is read as that folder.
  const tops = new Set(files.map(file => file.path.split('/')[0]));
  if (tops.size === 1 && files.every(file => file.path.includes('/'))) {
    const top = [...tops][0];
    for (const item of [...files, ...dropped]) if (item.path.startsWith(`${top}/`)) item.path = item.path.slice(top.length + 1);
  }
  return {files, dropped};
}
// Licences are read (only to record their name); everything else follows keepFile.
function keepFileOrLicence(path, size) {
  return /(^|\/)(licen[cs]e|copying)(\.(md|txt))?$/i.test(path) && size <= LIMITS.fileBytes ? true : keepFile(path, size);
}

module.exports = {LIMITS, JOB_WORDS, readZip, zipFiles, keepFile, frontmatter, sections, jobsFor, documentSkills, fromFiles};
