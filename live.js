'use strict';
// Live progress (0.77, owner review 2026-10-31: "the blind things make the user confused, thinking whether the work is
// really in progress or stuck"). What each running AI job is doing right now: its step, when it last showed a sign of
// life, how much of the answer has arrived and the newest words of it. Kept in memory only: it is a view of work in
// progress, never a record, so a restart simply starts it again with the job.
const jobs = new Map();
const PREVIEW = 1500;

function start(id, {room, label, steps = 1, contentId = null, familyId = null}) {
  const at = Date.now();
  jobs.set(id, {id, room, label, contentId, familyId, steps, step: 1, stepLabel: label, startedAt: at, stepAt: at, at, chars: 0, total: 0, expected: null, thinking: false, preview: ''});
}
// A new step starts with an empty preview; expected is the rough answer length in characters, for the bar.
function step(id, index, stepLabel, {expected = null, steps} = {}) {
  const job = jobs.get(id);
  if (!job) return;
  Object.assign(job, {step: index, stepLabel, stepAt: Date.now(), at: Date.now(), chars: 0, expected, thinking: false, preview: ''}, steps ? {steps} : {});
}
// Called as the answer streams in: text is the newest piece of the answer; any call is a sign of life.
function tick(id, {text = '', thinking = false} = {}) {
  const job = jobs.get(id);
  if (!job) return;
  job.at = Date.now();
  if (thinking) job.thinking = true;
  if (text) { job.thinking = false; job.chars += text.length; job.total += text.length; job.preview = (job.preview + text).slice(-PREVIEW); }
}
// What the step is doing now (for example "picture 3 of 9"), without starting a new step.
function note(id, text) { const job = jobs.get(id); if (job) { job.stepLabel = text; job.at = Date.now(); job.chars = 0; job.preview = ''; } }
// onProgress for ai.complete: the room passes this and the job's live entry follows the answer.
const follow = id => update => tick(id, update || {});
function end(id) { jobs.delete(id); }
function list() {
  const at = Date.now();
  return [...jobs.values()].map(job => ({id: job.id, room: job.room, label: job.label, contentId: job.contentId, familyId: job.familyId, step: job.step, steps: job.steps, stepLabel: job.stepLabel,
    seconds: Math.round((at - job.startedAt) / 1000), stepSeconds: Math.round((at - job.stepAt) / 1000), quietSeconds: Math.round((at - job.at) / 1000),
    chars: job.chars, expected: job.expected, thinking: job.thinking, preview: job.preview}));
}

module.exports = {start, step, note, tick, follow, end, list};
