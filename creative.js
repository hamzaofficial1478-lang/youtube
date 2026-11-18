'use strict';
// 0.110 (owner request 2026-11-18): the channel's own brain. The owner explains the niche (what it is about, what the
// channel promises, how it differs, their ideas and example titles, files and reference pictures), and the program's
// models think with it: the creative director answers any question about the channel, finds how the channel stands out
// from its competitors (a playbook that, approved by name, leads every job as pinned skills), and Gemini matches the
// style of a video link to one of the program's engines. Pure: prompts, checks and context only; no I/O.
const W = require('./watch');

const clip = (value, max) => { const s = String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ').trim(); return s.length > max ? `${s.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : s; };
const list = (value, max, each) => (Array.isArray(value) ? value.map(item => clip(item, each)).filter(Boolean).slice(0, max) : []);
const problem = message => { throw Object.assign(new Error(message), {status: 400}); };

// ---------------------------------------------------------------- the niche brief
const BRIEF_LIMITS = Object.freeze({about: 3000, promise: 2000, difference: 3000, ideas: 8000, avoid: 2000});
const ROLES = Object.freeze({character: 'a recurring character: drawn, painted or generated the same in every video', place: 'a place the stories return to', style: 'the look to follow (colour, medium, light)', object: 'an object or prop that recurs', other: 'anything else the owner wants used'});
function validateBrief(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) problem('Send the niche brief as an object.');
  const out = {};
  for (const [key, max] of Object.entries(BRIEF_LIMITS)) {
    const value = input[key] === undefined || input[key] === null ? '' : String(input[key]);
    if (value.length > max) problem(`${key[0].toUpperCase()}${key.slice(1)} is longer than ${max} characters.`);
    out[key] = value.replace(/\r\n/g, '\n').trim();
  }
  const titles = Array.isArray(input.titles) ? input.titles : String(input.titles || '').split('\n');
  out.titles = titles.map(item => clip(item, 140)).filter(Boolean);
  if (out.titles.length > 40) problem('Give at most 40 example titles.');
  if (![out.about, out.promise, out.difference, out.ideas, ...out.titles].some(Boolean)) problem('Write at least what the niche is about, or an idea, or one example title.');
  return out;
}

// What every job receives about the channel: the brief, the owner's files (trimmed to fit), the reference pictures with
// their usage and description, the approved playbook and the memory the owner kept. Sized to a byte budget so it never
// crowds out the job's own data; the brief and the references always fit first.
function context({brief = null, files = [], images = [], playbook = null, memory = [], idea = null}, {bytes = 16000} = {}) {
  const out = {};
  const kept = brief ? Object.entries(brief).filter(([, value]) => (Array.isArray(value) ? value.length : value)) : [];
  if (kept.length) out.brief = Object.fromEntries(kept);
  if (images.length) out.references = images.map(image => ({id: image.id, label: image.label, role: image.role, usage: image.usage, ...(image.description ? {description: image.description} : {})}));
  if (playbook) out.playbook = {summary: playbook.summary, signature: playbook.signature, avoid: playbook.avoid};
  if (memory.length) out.memory = memory.slice(-12).map(item => clip(item, 400));
  if (idea && (idea.thoughts || idea.files?.length)) out.idea = {...(idea.thoughts ? {thoughts: idea.thoughts} : {})};
  let left = bytes - Buffer.byteLength(JSON.stringify(out));
  // The owner's files share what is left: this video's idea files first, then the channel's.
  const pack = (items, into) => {
    const kept = [];
    for (const file of items) {
      if (left < 400) break;
      const room = Math.min(file.text.length, Math.max(300, Math.floor(left / Math.max(1, items.length - kept.length)) - 120));
      const text = file.text.length > room ? `${file.text.slice(0, room)} …[the rest of the file is left out]` : file.text;
      kept.push({name: file.name, text});
      left -= Buffer.byteLength(text) + 80;
    }
    if (kept.length) into(kept);
  };
  if (idea?.files?.length) pack(idea.files, kept => { out.idea = {...(out.idea || {}), files: kept}; });
  if (files.length) pack(files, kept => { out.files = kept; });
  return Object.keys(out).length ? out : null;
}
// The line every planner and writer gets with the brain's data.
const BRAIN_LINE = 'CHANNEL BRAIN (data: CHANNEL): the owner\'s own description of this channel. brief.about is what the niche is about, brief.promise what every video gives the viewer, brief.difference how this channel must differ from its competitors, brief.ideas the owner\'s ideas, brief.titles example titles in the channel\'s voice, brief.avoid what never to do; files are the owner\'s notes; references are pictures the owner attached, each with its role and how to use it (a character reference is that character in every video: same face, hair, clothes and build unless the story changes them); playbook is the approved way this channel stands out; memory is what the owner asked the program to remember. Follow it: it outranks your habits and the competitors\' patterns.';
// The planners (story director and shot planner) cast the owner's reference characters by their picture id.
const CAST_LINE = 'REFERENCE CHARACTERS: CHANNEL.references with role "character" are the owner\'s own recurring characters. When the story has such a person, put them in the cast with "ref": that reference id, a fitting name, and the look closest to its description and usage (hair, outfit, colours); keep them the same in every shot unless the words change them. Never invent a different hero when the owner gave one. A reference with role "place", "object" or "style" guides those places, objects and the look.';
const IDEA_LINE = 'OWNER IDEA (data: content.idea, and the owner\'s idea files in CHANNEL.idea.files): the owner\'s own idea and thoughts for THIS video. It is the backbone of the video: build the title, angle, hook and story on it, keep every point the owner makes, in their order of importance, and only correct a point that is factually wrong (say so in uncertainties). Add what makes it stronger; never replace it with a different idea.';

// ---------------------------------------------------------------- the creative director
const DIRECTOR = 'You are the creative director of this YouTube channel: a showrunner who must make it the best channel in its niche. You think like the viewer, a story editor and a strategist at once. Work only from the data: the owner\'s CHANNEL brain (niche brief, ideas, files, reference pictures, playbook, memory), what the program learned from the competitors (LEARNED: the approved roadmap and the studies of watched videos, and the competitor blueprint) and the channel\'s own videos so far. Be concrete: name scenes, situations, structures, visual and sound ideas, titles and tests the owner can use, never generic advice such as "be engaging". Push for what the competitors are NOT doing and what makes this channel unmistakable. Learn techniques from competitors, never copy their wording, characters, signature looks or recurring jokes; at least 70% of every idea is the channel\'s own. Never name a competitor channel in a title.';
function askMessages({question, data, partner = null, skills = null}) {
  const system = [DIRECTOR,
    'Answer the owner\'s QUESTION. Return JSON only: {"summary": one to three plain sentences, "points": [3-10 of {"point": the idea or answer, "why": why it works for this audience and niche, "how": exactly how the program or the owner does it}], "titles": [0-10 video titles when the question is about ideas or titles], "keep": one sentence the program should remember from this answer, or ""}.',
    ...(partner ? ['PARTNER ANSWER (data): another AI answered first. Challenge it: keep what is strong, fix what is weak, generic or copied, and add what it missed. Your answer replaces it, so it must be complete on its own.'] : []),
  ].join('\n');
  return [{role: 'system', content: system}, {role: 'user', content: `UNTRUSTED CONTROL ROOM DATA:\n${JSON.stringify({QUESTION: clip(question, 4000), ...data, ...(partner ? {PARTNER_ANSWER: partner} : {}), ...(skills ? {skills} : {})})}`}];
}
function readAnswer(raw) {
  const value = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
  if (!value || typeof value !== 'object') problem('The AI did not answer with the creative director\'s JSON. Ask again.');
  const points = (Array.isArray(value.points) ? value.points : []).map(item => ({point: clip(item?.point, 600), why: clip(item?.why, 600), how: clip(item?.how, 800)})).filter(item => item.point).slice(0, 12);
  if (!points.length && !clip(value.summary, 10)) problem('The AI answered without any point. Ask again in other words.');
  return {summary: clip(value.summary, 1200), points, titles: list(value.titles, 12, 140), keep: clip(value.keep, 400)};
}

// The playbook: how this channel stands out, approved by name and then followed by every job as pinned skills.
const PLAYBOOK_RULES = Object.freeze(['script', 'storyboard', 'editing', 'sound', 'packaging']);
function playbookMessages({data, skills = null}) {
  const system = [DIRECTOR,
    'Write the channel\'s PLAYBOOK: how it stands out in its niche and how every job makes that real. Read what the competitors all do (LEARNED, the blueprint), find the white space viewers want that nobody serves, and design the channel\'s signature from the owner\'s brief, ideas and reference pictures.',
    `Return JSON only: {"summary": 2-4 sentences, "competitorsDo": [3-10 patterns the competitors share], "whiteSpace": [3-10 openings nobody serves], "signature": {"story": ..., "character": ..., "visuals": ..., "editing": ..., "sound": ..., "titles": ..., "thumbnails": ...} (one or two sentences each: how a viewer recognises THIS channel), "rules": {${PLAYBOOK_RULES.map(key => `"${key}": [3-10 concrete do-rules]`).join(', ')}}, "avoid": [3-10 things this channel never does, including the competitors' clichés], "experiments": [3-8 of {"idea", "test": how to see in the next videos whether it works}], "series": [3-12 of {"title", "premise"}]}.`,
    'Each rule is something a writer, storyboard artist, editor or sound designer can follow in one job, with numbers where they help.',
  ].join('\n');
  return [{role: 'system', content: system}, {role: 'user', content: `UNTRUSTED CONTROL ROOM DATA:\n${JSON.stringify({...data, ...(skills ? {skills} : {})})}`}];
}
function readPlaybook(raw) {
  const value = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return null; } })() : raw;
  if (!value || typeof value !== 'object') problem('The AI did not answer with the playbook JSON. Ask again.');
  const signature = Object.fromEntries(['story', 'character', 'visuals', 'editing', 'sound', 'titles', 'thumbnails'].map(key => [key, clip(value.signature?.[key], 500)]).filter(([, text]) => text));
  const rules = Object.fromEntries(PLAYBOOK_RULES.map(key => [key, list(value.rules?.[key], 12, 400)]).filter(([, items]) => items.length));
  const out = {summary: clip(value.summary, 1500), competitorsDo: list(value.competitorsDo, 12, 300), whiteSpace: list(value.whiteSpace, 12, 300), signature, rules, avoid: list(value.avoid, 12, 300),
    experiments: (Array.isArray(value.experiments) ? value.experiments : []).map(item => ({idea: clip(item?.idea, 400), test: clip(item?.test, 400)})).filter(item => item.idea).slice(0, 10),
    series: (Array.isArray(value.series) ? value.series : []).map(item => ({title: clip(item?.title, 140), premise: clip(item?.premise, 400)})).filter(item => item.title).slice(0, 12)};
  if (!out.summary || !Object.keys(out.rules).length) problem('The playbook came back without a summary or rules. Ask again.');
  return out;
}
// Each process of an approved playbook becomes a pin-only skill of this channel, led into the jobs of that process.
function playbookSkills(playbook, {familyId, familyName, revision, approvedBy, date}) {
  const tag = String(familyId).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8) || 'family';
  const SIG = {script: ['story', 'character', 'titles'], storyboard: ['character', 'visuals'], editing: ['editing'], sound: ['sound'], packaging: ['titles', 'thumbnails']};
  return Object.entries(playbook.rules).map(([key, rules]) => {
    const spec = W.PROCESSES[key];
    const signature = SIG[key].map(part => playbook.signature[part] && `Signature (${part}): ${playbook.signature[part]}`).filter(Boolean);
    return {
      id: `playbook.f${tag}-${key}`, title: clip(`${familyName}: ${spec.label} (channel playbook)`, 120), rooms: spec.rooms, tasks: spec.tasks, kind: 'procedure',
      when: clip(`Every ${spec.label.toLowerCase()} job for ${familyName}: the way this channel stands out from its competitors.`, 400),
      summary: clip(playbook.summary, 1500).padEnd(10, '.'), do: [...signature, ...rules].slice(0, 40), avoid: playbook.avoid.slice(0, 40), checks: [],
      tags: ['channel-playbook', key], source: clip(`Channel playbook r${revision} for ${familyName}, approved by ${approvedBy} on ${date}.`, 400), priority: 96, pinOnly: true,
    };
  });
}

// ---------------------------------------------------------------- matching the style of a video link
// The engines the program has, with the looks inside each, as Gemini is told them; its answer is checked against this.
function catalogue({renderers = {}, looks, boards, designs, finishes}) {
  return [
    {engine: 'ffmpeg-sketch', name: 'Stickman', looks},
    {engine: 'canvas-frames', name: 'Hand-drawn (whiteboard)', looks: boards},
    {engine: 'ffmpeg-montage', name: 'Documentary', looks: ['footage', ...designs.filter(item => item !== 'footage')]},
    {engine: 'atelier', name: 'Motion Graphics', looks: finishes},
    {engine: 'cinematic-hybrid', name: 'Cinematic', looks: ['footage']},
    {engine: 'story-mix', name: 'Story Mix', looks: ['mix']},
  ].filter(item => !Object.keys(renderers).length || renderers[item.engine]);
}
function styleMatchPrompt(engines) {
  return [
    'You watch a YouTube video for a video production program. Decide which of the program\'s editing engines would make a video in this video\'s style best, so the owner can adopt the technique (never copy its characters, wording or signature look).',
    `The program's engines and the looks inside each: ${JSON.stringify(engines)}.`,
    'Picture types for the drawing engines: cartoon (drawn), natural (each scene painted realistically by ChatGPT), mix. How scenes are made: all painted, mix (60% painted), free (drawn by the program).',
    'Return JSON only: {"engine": one engine key from the list, "look": one of that engine\'s looks or "mix", "pictureType": "cartoon"|"natural"|"mix", "paint": "all"|"mix"|"free", "confidence": 0 to 1, "why": [3-6 reasons from what you saw], "whatTheyDo": {"visuals": ..., "characters": ..., "editing": ..., "pacing": ..., "text": ..., "sound": ...}, "aiVideo": {"fits": true|false, "why": one sentence: would generated AI video clips (realistic or animated scenes from a video model) suit this style better than the engines?}, "missing": [what this style needs that none of the engines does, or nothing]}.',
  ].join('\n');
}
function readStyleMatch(raw, engines) {
  const text = String(raw || '').replace(/^```(?:json)?\s*|\s*```$/g, '');
  let value = null;
  try { value = JSON.parse(text); } catch { const match = text.match(/\{[\s\S]*\}/); if (match) try { value = JSON.parse(match[0]); } catch { value = null; } }
  if (!value || typeof value !== 'object') problem('Gemini did not answer with the style match. Try again.');
  const engine = engines.find(item => item.engine === value.engine);
  if (!engine) problem(`Gemini named an engine the program does not have (${clip(value.engine, 40)}). Try again.`);
  const look = engine.looks.includes(value.look) || value.look === 'mix' ? value.look : engine.looks[0];
  return {engine: engine.engine, engineName: engine.name, look, pictureType: ['cartoon', 'natural', 'mix'].includes(value.pictureType) ? value.pictureType : 'cartoon', paint: ['all', 'mix', 'free'].includes(value.paint) ? value.paint : 'free',
    confidence: Math.max(0, Math.min(1, Number(value.confidence) || 0)), why: list(value.why, 8, 400),
    whatTheyDo: Object.fromEntries(['visuals', 'characters', 'editing', 'pacing', 'text', 'sound'].map(key => [key, clip(value.whatTheyDo?.[key], 400)]).filter(([, item]) => item)),
    aiVideo: {fits: value.aiVideo?.fits === true, why: clip(value.aiVideo?.why, 400)}, missing: list(value.missing, 6, 300)};
}

module.exports = {CAST_LINE, BRIEF_LIMITS, ROLES, validateBrief, context, BRAIN_LINE, IDEA_LINE, askMessages, readAnswer, PLAYBOOK_RULES, playbookMessages, readPlaybook, playbookSkills, catalogue, styleMatchPrompt, readStyleMatch};
