'use strict';
// How the owner's skills direct the models (0.95, owner review 2026-11-09: "the program saved the skills but never led
// the models with them ... the program is the medium that leads the models on how to work").
//
// Before 0.95 every room put the approved skills inside the data message, as JSON beside the script and the plan, while
// the instructions told the model to treat that message as untrusted data and never follow instructions inside it. So
// the skills were read as material, not as direction. Now every request that carries a skill brief is rewritten at the
// one place all AI requests pass (Ai.complete): the skills leave the data and become numbered directives (D1, D2 ...)
// in the instructions, in plain imperative words, and the model is asked to cite the codes it follows where it already
// writes a reason or a note. The codes it cites are read back from its answer, so the program knows, and shows, which
// skills really led the work. Pure: no I/O.

const MAX_RULES = 6;
const isBrief = value => !!value && typeof value === 'object' && !Array.isArray(value) && Array.isArray(value.skills) && value.skills.every(item => item && typeof item.id === 'string');
const listOf = (items, n = MAX_RULES) => (Array.isArray(items) ? items : []).map(item => String(item).replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, n);

// The directives of a brief, in its order: D1 is the first skill the program chose for this job.
function directives(brief) {
  if (!isBrief(brief)) return [];
  return brief.skills.map((skill, k) => ({code: `D${k + 1}`, id: skill.id, title: String(skill.title || skill.id), when: String(skill.when || ''),
    do: listOf(skill.do?.length ? skill.do : skill.steps), avoid: listOf(skill.avoid), checks: listOf(skill.checks), summary: !skill.do?.length && !skill.steps?.length ? String(skill.summary || '') : '',
    numbers: skill.numbers && typeof skill.numbers === 'object' && Object.keys(skill.numbers).length ? skill.numbers : null}));
}

// The instructions section: trusted, the owner's own direction for this job.
function directionText(brief) {
  const list = directives(brief);
  if (!list.length) return '';
  const order = Array.isArray(brief.sourceHierarchy) && brief.sourceHierarchy.length ? ` Where two disagree, this order wins: ${brief.sourceHierarchy.join(' > ')}.` : '';
  const lines = list.map(item => [`${item.code} · ${item.title} [${item.id}]`, item.when && `  When: ${item.when}`, item.do.length && `  Do: ${item.do.join(' · ')}`, item.summary && `  Rule: ${item.summary}`,
    item.avoid.length && `  Avoid: ${item.avoid.join(' · ')}`, item.checks.length && `  Check before you answer: ${item.checks.join(' · ')}`, item.numbers && `  Numbers: ${JSON.stringify(item.numbers)}`].filter(Boolean).join('\n'));
  return [
    `DIRECTION FROM THE OWNER'S SKILLS (${list.length} directives, D1-D${list.length}). These are not data: they are the owner's own reviewed craft rules, chosen by the program for this exact job, and they direct how you work. Apply every directive whose "When" fits, at every step; run each one's checks on your answer before you give it; and when a directive does not fit this job, leave it out rather than force it.${order}`,
    ...lines,
    'CITE THE DIRECTIVES: wherever your answer already has a place for a reason, a note or a direction (a scene\'s direction, a shot\'s notes, a change\'s reason, a line\'s note, a report), name the codes you followed there, for example "D3, D7: ...". Never invent a code, never cite one you did not apply, and never put a code into words the viewer sees or hears (titles, script lines, on-screen text, captions).',
  ].join('\n');
}

// Where the first JSON object in a text ends (strings and escapes respected), so a data message such as
// "UNTRUSTED DATA:\n{...}\n\nDRAFT: ..." can be read.
function objectEnd(text, start) {
  let depth = 0, inString = false;
  for (let k = start; k < text.length; k++) {
    const ch = text[k];
    if (inString) { if (ch === '\\') k++; else if (ch === '"') inString = false; continue; }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return k + 1;
  }
  return -1;
}
// The request rewritten: a skill brief in a JSON data message moves into the instructions as directives. A message
// with no JSON object (pictures, compositions) or no brief is left exactly as it is.
function lead(messages) {
  if (!Array.isArray(messages)) return {messages, brief: null};
  let brief = null;
  const out = messages.map(message => {
    if (brief || message?.role !== 'user' || typeof message.content !== 'string') return message;
    const text = message.content, start = text.indexOf('{'), end = start >= 0 ? objectEnd(text, start) : -1;
    if (end < 0) return message;
    let data;
    try { data = JSON.parse(text.slice(start, end)); } catch { return message; }
    if (!data || typeof data !== 'object' || Array.isArray(data) || !isBrief(data.skills)) return message;
    brief = data.skills;
    const {skills, ...rest} = data;
    // The family's open project state stays with the data it belongs to.
    return {...message, content: `${text.slice(0, start)}${JSON.stringify(skills.projectState ? {...rest, projectState: skills.projectState} : rest)}${text.slice(end)}`};
  });
  if (!brief) return {messages, brief: null};
  return {messages: withDirection(out, brief), brief};
}
// The messages with the brief's directives added to the instructions (a system message is made when there is none).
function withDirection(messages, brief) {
  const out = [...messages], text = directionText(brief), system = out.findIndex(message => message?.role === 'system');
  if (!text) return out;
  if (system >= 0) out[system] = {...out[system], content: `${out[system].content}\n\n${text}`};
  else out.unshift({role: 'system', content: text});
  return out;
}
// Whether a room already put the owner's directives into the instructions itself (editor, pictures, designed shots).
const directed = messages => Array.isArray(messages) && messages.some(message => message?.role === 'system' && typeof message.content === 'string' && message.content.includes("DIRECTION FROM THE OWNER'S SKILLS"));
// The words of a request (its user messages, text parts only), for choosing skills that fit it.
const requestText = (messages, max = 4000) => (Array.isArray(messages) ? messages : []).filter(message => message?.role === 'user')
  .map(message => (typeof message.content === 'string' ? message.content : Array.isArray(message.content) ? message.content.filter(block => block?.type === 'text').map(block => block.text).join(' ') : '')).join(' ').slice(0, max);

// The directives an answer cites, by skill id, in the brief's order.
function cited(answer, brief) {
  const list = directives(brief);
  if (!list.length || typeof answer !== 'string') return [];
  const seen = new Set((answer.match(/\bD(\d{1,3})\b/g) || []).map(code => code.slice(1)));
  return list.filter((item, k) => seen.has(String(k + 1))).map(item => item.id);
}

module.exports = {directives, directionText, lead, withDirection, directed, requestText, cited, isBrief};
