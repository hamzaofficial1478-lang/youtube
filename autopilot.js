'use strict';
// Y03 rules for unattended publishing (pure). The blueprint's gate (page 25): "at least ten consecutive reviewed
// editions for a specific format with no material factual, rights, language or destination error; a successful
// recovery drill; known per-pack cost; and no unresolved account/access issue ... New niches, new voices, changed
// providers or materially different templates return to sampling and review." Only publishing becomes unattended:
// every video it takes was already approved by name in Rooms 06-10.
const {InputError} = require('./store');
const G = require('./publishing');

const NEEDED = 10;
const DAYS = Object.freeze(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
const INCIDENTS = Object.freeze({factual: 'factual', rights: 'rights', language: 'language', destination: 'destination'});
const problem = message => { throw new InputError(message, 400); };

// What made a video: a change of any of these is a new recipe whose count starts again.
const recipeKey = ({format, niche, style, voice}) => JSON.stringify({format, niche: String(niche || '').trim().toLowerCase(), style: style || null, voice: voice || null});

// The gate, from the family's records. `history` is newest first: {status, current (same recipe as now), incident}.
function gate({history, recovered, unknownCharges, accessIssues, cost}) {
  let streak = 0, stop = null;
  for (const item of history) {
    if (!item.current) { stop = 'a video before it used another niche, voice, provider or style, so the count starts at that change'; break; }
    if (item.incident) { stop = `a ${item.incident.kind} error was reported on a video`; break; }
    if (item.status === 'failed') { stop = 'an upload failed on YouTube'; break; }
    if (item.status === 'kept_private') { stop = 'YouTube kept a scheduled video private'; break; }
    if (item.status === 'published') streak++;
  }
  const checks = [
    {key: 'streak', label: `${NEEDED} reviewed videos in a row`, passed: streak >= NEEDED, detail: `${streak} of ${NEEDED} consecutive reviewed videos went public without a reported error${stop ? ` (the count stops where ${stop})` : ''}.`},
    {key: 'recovery', label: 'A recovery drill', passed: recovered > 0, detail: recovered ? `${recovered} upload${recovered === 1 ? ' was' : 's were'} stopped and then recovered without a second copy.` : 'No recovery yet: stop the program during a private upload, start it again and resume the upload (or reconcile it).'},
    {key: 'cost', label: 'Known cost per video', passed: unknownCharges === 0 && cost.videos > 0, detail: unknownCharges ? `${unknownCharges} charge${unknownCharges === 1 ? ' has' : 's have'} an unknown outcome (an interrupted paid request): settle or review ${unknownCharges === 1 ? 'it' : 'them'} first.` : cost.videos ? `About ${cost.voiceCents ? `$${(cost.voiceCents / 100 / cost.videos).toFixed(2)} of narration and ` : ''}${Math.round(cost.tokens / cost.videos).toLocaleString('en-US')} Claude tokens per published video; every charge is known.` : 'No published video to measure yet.'},
    {key: 'access', label: 'No account or access problem', passed: !accessIssues.length, detail: accessIssues.length ? accessIssues.join(' ') : 'Every connected channel and the Google client are in order, and no upload outcome is open.'},
  ];
  return {passed: checks.every(check => check.passed), streak, needed: NEEDED, checks};
}

// The rules the owner sets for a family. Unattended publishing only ever uses these.
function validatePolicy(input) {
  if (!input || typeof input !== 'object') problem('Send the publishing rules.');
  const level = input.level === 'unattended' ? 'unattended' : input.level === 'review' ? 'review' : problem('Choose review before publishing or unattended publishing.');
  const timeZone = String(input.timeZone || '');
  try { new Intl.DateTimeFormat('en-US', {timeZone}); } catch { problem(`${timeZone || 'That'} is not a time zone name (for example America/New_York).`); }
  const windows = Array.isArray(input.windows) ? input.windows : problem('Give at least one publication window.');
  if (!windows.length || windows.length > 21) problem('Give 1-21 publication windows.');
  const clean = windows.map(item => {
    const day = Number(item?.day), time = String(item?.time || '');
    if (!Number.isInteger(day) || day < 0 || day > 6 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) problem('Each window is a weekday and a time such as Tue 18:00.');
    return {day, time};
  });
  if (new Set(clean.map(item => `${item.day} ${item.time}`)).size !== clean.length) problem('Each window may appear once.');
  const whole = (value, min, max, label) => { const number = Number(value); if (!Number.isInteger(number) || number < min || number > max) problem(`${label} must be a whole number from ${min} to ${max}.`); return number; };
  if (typeof input.madeForKids !== 'boolean') problem('Say whether this family\'s videos are made for kids (YouTube requires it).');
  if (!Object.hasOwn(G.CATEGORIES, String(input.categoryId))) problem('Choose a YouTube category.');
  return {level, timeZone, windows: clean.sort((a, b) => a.day - b.day || a.time.localeCompare(b.time)), madeForKids: input.madeForKids, categoryId: String(input.categoryId),
    minLeadHours: whole(input.minLeadHours, 1, 336, 'The lead time in hours'), maxPerDay: whole(input.maxPerDay, 1, 20, 'Uploads per day'), maxPerWeek: whole(input.maxPerWeek, 1, 100, 'Publications per week')};
}

// The first window at or after `after` (ms) that no other video of the same channel takes (an hour apart).
function nextWindow({windows, timeZone, after, taken = []}) {
  const dayFormat = new Intl.DateTimeFormat('en-US', {timeZone, weekday: 'short'}), dateFormat = new Intl.DateTimeFormat('en-CA', {timeZone, year: 'numeric', month: '2-digit', day: '2-digit'});
  for (let k = 0; k < 36; k++) {
    const at = new Date(after + k * 86400000), weekday = DAYS.indexOf(dayFormat.format(at)), date = dateFormat.format(at);
    for (const window of windows.filter(item => item.day === weekday)) {
      let iso;
      try { iso = G.zonedToUtc(`${date}T${window.time}`, timeZone); } catch { continue; }
      const ms = Date.parse(iso);
      if (ms >= after && !taken.some(other => Math.abs(other - ms) < 3600000)) return iso;
    }
  }
  return null;
}
const windowText = windows => windows.map(item => `${DAYS[item.day]} ${item.time}`).join(', ');

module.exports = {NEEDED, DAYS, INCIDENTS, recipeKey, gate, validatePolicy, nextWindow, windowText};
