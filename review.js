'use strict';
// P09 Review & QC: one timecoded issue list and an aligned read of a render, built only from evidence the
// rooms already keep (render QC, the editor's critic, the caption checks, file checksums). Pure: no I/O, clock
// or randomness. It approves nothing; the style-proof verdict on the render stays the one human approval.
const Cap = require('./captions');

const SCHEMA = 'ytprod.review/1';
const SEVERITY = {critical: 0, suggestion: 1, nitpick: 2};
// The critic sums these caption checks up; the review lists them caption by caption with a time instead.
const CRITIC_CAPTION_SUMMARIES = new Set(['captions-edited', 'captions-fast']);
const CHECK_FIX = {
  'black frames': 'Change the shot or its hold so the picture never goes dark where the edit did not plan it.',
  'frozen picture': 'Shorten the hold or give the still a camera move.',
  'unplanned cuts': 'Move the clip’s start point so its window stays inside one shot.',
  'audio/video alignment': 'Render again. If it repeats, check the narration file in the Voice Room.',
};
const CAPTION_FIX = {
  'caption-words': 'Draft a fresh edit so the captions are rebuilt from the narration.',
  'caption-overlap': 'Draft a fresh edit so the captions are rebuilt from the narration.',
  'caption-edited': 'Play this moment and check the corrected words still match what is said, or reset the caption.',
  'caption-too-fast': 'Shorten the caption’s wording, or slow that phrase in the narration.',
  'caption-too-long': 'Split the thought into a shorter caption.',
};
// Kept honest on the page: what this review does not measure.
const NOT_CHECKED = [
  'Text-safe areas are kept by the fixed graphic layouts (captions have their own band); they are not measured in pixels.',
  'Facts, rights and how the narration sounds need your own judgement; nothing here approves them.',
  'Word times inside a caption are estimated from the narration’s pauses, not measured.',
];

function build({render, result = null, integrity = [], edit = null, findings: editFindings = [], cues = null, urls = {}}) {
  const blockers = [], items = [];
  const block = (code, message, repair = null) => blockers.push({code, message, repair});
  const verdict = render.review || null;
  if (render.status !== 'completed' || !result) {
    block('not-rendered', 'This render has no finished output to review.');
    return {schema: SCHEMA, renderId: render.id, status: 'blocked', verdict, verdictStale: false, blockers, findings: [], counts: count([]), checks: [], timeline: null, sheets: null, notChecked: NOT_CHECKED};
  }
  const toEditing = {room: 'editing', label: 'Open the Editing Room'};
  if (!render.current) block('out-of-date', 'The script, narration, visuals or edit changed after this render. Render the current edit and review that one.', toEditing);
  for (const item of integrity.filter(entry => !entry.ok)) block('file-changed', `The ${item.kind} file of this render is missing or changed. Render again.`, toEditing);
  const decode = result.qc.find(check => check.name === 'full decode');
  if (!decode) block('checks-missing', 'This render was made before the full-decode and audio/video checks existed. Render it again (local, no cost).', toEditing);
  else if (!decode.passed) block('decode-failed', `The video does not decode cleanly (${decode.detail}). Render again.`, toEditing);

  const fps = edit?.fps || result.preset?.fps || 30;
  const clipAt = seconds => (edit ? edit.clips.filter(clip => clip.start / edit.fps <= seconds + 0.001).at(-1) || null : null);
  const clipRepair = clip => (clip ? {room: 'editing', command: 'tl-clip', id: clip.id, label: `Change ${clip.label}`} : toEditing);
  // 1. Render checks that failed, one entry per measured moment.
  for (const check of result.qc.filter(item => !item.passed && item.name !== 'full decode')) {
    const audio = /^audio /.test(check.name);
    const spans = check.spans?.length ? check.spans.slice(0, 6) : [null];
    for (const span of spans) {
      const clip = span ? clipAt(span.start) : null;
      items.push({severity: 'critical', source: 'render', code: check.name, at: span ? span.start : null, until: span ? span.end : null, label: clip?.label || null,
        message: span ? `${capital(check.name)} ${span.end !== null && span.end > span.start + 0.01 ? `from ${span.start.toFixed(1)} to ${span.end.toFixed(1)} s` : `at ${span.start.toFixed(1)} s`}.` : `${capital(check.name)}: ${check.detail}.`,
        fix: audio ? 'Adjust the narration levels in the Audio Room and render again.' : CHECK_FIX[check.name] || 'Render again. If it repeats, keep the render manifest for diagnosis.',
        repair: audio ? {room: 'audio', command: 'audio-settings', label: 'Open the Audio Room'} : span ? clipRepair(clip) : toEditing});
    }
  }
  // 2. The editor's critic, with its own fixes (the review never repeats the caption summaries).
  editFindings.forEach((item, index) => {
    if (item.code.startsWith('caption-') || CRITIC_CAPTION_SUMMARIES.has(item.code)) return;
    const at = Number.isFinite(item.at) ? item.at / fps : null, clip = item.clipId ? edit?.clips.find(entry => entry.id === item.clipId) : null;
    items.push({severity: item.severity, source: 'editor', code: item.code, at, until: null, label: clip?.label || null, message: item.message, fix: item.fix || null, skill: item.skill || null,
      repair: item.op ? {room: 'editing', command: 'tl-fix', id: String(index), label: 'Apply the fix'} : clip ? clipRepair(clip) : item.graphicId ? {room: 'editing', command: 'tl-graphic', id: item.graphicId, label: 'Change the graphic'} : toEditing});
  });
  // 3. Captions, caption by caption; with the narration's sentences the check also proves every word is shown once.
  if (edit?.captions?.enabled) {
    const groups = new Map(edit.captions.groups.map(group => [group.id, group]));
    for (const issue of Cap.lintCaptions(edit.captions, cues ? {sentences: cues} : {})) {
      const group = groups.get(issue.groupId);
      items.push({severity: issue.severity, source: 'captions', code: issue.kind, at: group ? group.start : null, until: group ? group.end : null, label: group ? `“${group.text}”` : null, message: issue.message, fix: CAPTION_FIX[issue.kind] || null,
        repair: group ? {room: 'editing', command: 'tl-caption', id: group.id, label: 'Correct the caption'} : toEditing});
    }
  }
  items.sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity) || SEVERITY[a.severity] - SEVERITY[b.severity]);

  // 4. The aligned read: per narration sentence, what is said, shown as captions, cut and put on screen.
  const sheet = result.sheet;
  // A moment belongs to the last sentence that started before it, so pauses between sentences lose nothing.
  const rowOf = seconds => Math.max(0, cues.findLastIndex(cue => cue.start <= seconds + 0.001));
  const timeline = edit && cues ? cues.map((cue, index) => {
    const within = seconds => rowOf(seconds) === index;
    const clips = edit.clips.filter(clip => clip.start / edit.fps < cue.end - 0.001 && (clip.start + clip.frames) / edit.fps > cue.start + 0.001);
    const middle = cue.start + Math.min(1, (cue.end - cue.start) / 2);
    return {n: cue.n, start: cue.start, end: cue.end, text: cue.text,
      captions: edit.captions?.enabled ? edit.captions.groups.filter(group => within((group.start + group.end) / 2)).map(group => ({id: group.id, text: group.text, edited: !!group.edited})) : [],
      clips: clips.map(clip => ({id: clip.id, label: clip.label, mediaType: clip.mediaType})),
      cuts: edit.clips.filter(clip => clip.start / edit.fps > cue.start + 0.05 && clip.start / edit.fps < cue.end - 0.05).length,
      graphics: edit.graphics.filter(item => item.status === 'accepted' && item.start / edit.fps < cue.end && (item.start + item.frames) / edit.fps > cue.start).map(item => ({id: item.id, template: item.template, text: item.title || item.lines?.[0] || ''})),
      tile: sheet?.everySeconds ? Math.min(sheet.frames - 1, Math.round(middle / sheet.everySeconds)) : null,
      issues: items.filter(item => item.at !== null && within(item.at)).length};
  }) : null;

  const status = blockers.length ? 'blocked' : !verdict ? 'awaiting-verdict' : verdict.decision === 'passed' ? 'approved' : 'changes-requested';
  return {schema: SCHEMA, renderId: render.id, status, verdict, verdictStale: !!(blockers.length && verdict?.decision === 'passed'), blockers, findings: items, counts: count(items),
    checks: result.qc.map(({name, passed, detail}) => ({name, passed, detail})),
    timeline, sheets: {overview: sheet ? {...sheet, url: urls.sheet || null} : null, hook: result.hook ? {...result.hook, url: urls.hook || null} : null}, notChecked: NOT_CHECKED};
}
const capital = value => value.charAt(0).toUpperCase() + value.slice(1);
function count(items) {
  const counts = {critical: 0, suggestion: 0, nitpick: 0};
  for (const item of items) counts[item.severity] += 1;
  return counts;
}

module.exports = {SCHEMA, NOT_CHECKED, build};
