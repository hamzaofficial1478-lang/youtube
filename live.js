'use strict';
// Live progress (0.77, owner review 2026-10-31: "the blind things make the user confused, thinking whether the work is
// really in progress or stuck"). What each running AI job is doing right now: its step, when it last showed a sign of
// life, how much of the answer has arrived and the newest words of it. Kept in memory only: it is a view of work in
// progress, never a record, so a restart simply starts it again with the job.
const jobs = new Map();
const PREVIEW = 1500;

// wait: what a quiet stretch means for this job (a local voice reads a whole part before it answers).
// who: the AI doing the work; stoppable: the page offers Stop (0.81); limit: the step's time limit in seconds.
// plan (0.101, owner 2026-11-10: "a step by step progress that gets marked when each step is finished"): the names of
// every step in order, so the page lists them all and ticks each as it finishes.
function start(id, {room, label, steps = 1, contentId = null, familyId = null, wait = null, who = null, stoppable = false, plan = null}) {
  const at = Date.now();
  jobs.set(id, {id, room, label, contentId, familyId, wait, who, stoppable, steps, step: 1, stepLabel: label, startedAt: at, stepAt: at, at, chars: 0, total: 0, expected: null, limit: null, thinking: false, preview: '', plan: Array.isArray(plan) ? plan : null, times: [], sub: null, board: null});
}
// A new step starts with an empty preview; expected is the rough answer length in characters, for the bar.
function step(id, index, stepLabel, {expected = null, steps, limit = null} = {}) {
  const job = jobs.get(id);
  if (!job) return;
  // How long each finished step took (a step kept from an earlier run passes in no time).
  const at = Date.now();
  if (index > job.step) { job.times[job.step - 1] = Math.round((at - job.stepAt) / 1000); for (let k = job.step + 1; k < index; k++) job.times[k - 1] = 0; }
  Object.assign(job, {step: index, stepLabel, stepAt: at, at, chars: 0, expected, limit, thinking: false, preview: '', sub: null}, steps ? {steps} : {});
}
// How far the step is (0.101): done of total units (pictures, designed shots, review parts), the one being made now and
// the ones finished, so each is marked as it is done.
function progress(id, {done, total, unit = '', current = null, finished = []} = {}) {
  const job = jobs.get(id);
  if (job) { job.sub = {done, total, unit, current, finished: finished.slice(-60)}; job.at = Date.now(); }
}
// The scenes planned so far (0.101, owner: "it still shows No scene plan yet while it is drawing the scenes"): the
// storyboard is saved whole at the end, so the page shows these meanwhile.
function board(id, scenes) { const job = jobs.get(id); if (job) job.board = Array.isArray(scenes) ? scenes : null; }
// Called as the answer streams in: text is the newest piece of the answer; any call is a sign of life.
function tick(id, {text = '', thinking = false} = {}) {
  const job = jobs.get(id);
  if (!job) return;
  job.at = Date.now();
  if (thinking) job.thinking = true;
  if (text) { job.thinking = false; job.chars += text.length; job.total += text.length; job.preview = (job.preview + text).slice(-PREVIEW); }
}
// What the step is doing now (for example "picture 3 of 9"), without starting a new step.
// wait (0.100): what this part of the step is doing while no words can arrive (a painting, a check that answers in one
// go); a note without it goes back to the job's own.
function note(id, text, wait) { const job = jobs.get(id); if (job) { job.stepLabel = text; job.at = Date.now(); job.chars = 0; job.preview = ''; if (!('baseWait' in job)) job.baseWait = job.wait; job.wait = wait || job.baseWait; } }
// onProgress for ai.complete: the room passes this and the job's live entry follows the answer.
const follow = id => update => tick(id, update || {});
function end(id) { jobs.delete(id); }
function list() {
  const at = Date.now();
  return [...jobs.values()].map(job => ({id: job.id, room: job.room, label: job.label, contentId: job.contentId, familyId: job.familyId, step: job.step, steps: job.steps, stepLabel: job.stepLabel,
    seconds: Math.round((at - job.startedAt) / 1000), stepSeconds: Math.round((at - job.stepAt) / 1000), quietSeconds: Math.round((at - job.at) / 1000),
    chars: job.chars, expected: job.expected, thinking: job.thinking, preview: job.preview, wait: job.wait, who: job.who, stoppable: job.stoppable, limit: job.limit,
    plan: job.plan, times: job.times, sub: job.sub, board: job.board}));
}

module.exports = {start, step, note, progress, board, tick, follow, end, list};
