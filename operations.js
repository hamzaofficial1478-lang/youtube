'use strict';
// A03, the operations report (0.59). Phase 06 of the build plan: "measure 14-day reliability, quota, render capacity,
// cost and language review load; validate each channel over its own 90-100 day period". Read-only: it counts what the
// rooms already record (each job and how it ended, usage rows, render times, named approvals, publications) over a
// window of days, and says where a number is unknown. Nothing here starts, retries or changes anything.
const DAY = 86400000;
const WINDOWS = [7, 14, 30, 90];

// Every kind of work the program runs, by the table that records it.
const WORK = [
  ['jobs', 'Script writing'], ['research_jobs', 'Research briefs'], ['competitor_scans', 'Competitor scans'], ['competitor_analyses', 'Competitor analyses'],
  ['trend_scans', 'Trend scans'], ['trend_topics', 'Topic ideas'], ['niche_discoveries', 'Niche discovery'], ['niche_evaluations', 'Niche go/no-go'], ['niche_reads', 'Screenshot reads'],
  ['style_studies', 'Style studies'], ['voice_direction_jobs', 'Voice direction'], ['voice_jobs', 'Narrations'], ['scene_plan_jobs', 'Scene plans'],
  ['visual_jobs', 'Pictures, footage and drawings'], ['score_jobs', 'Music scores'], ['audio_jobs', 'Music and sound effects'], ['render_jobs', 'Renders'],
  ['sound_imports', 'Sound library imports'], ['frame_scans', 'Frame scans'], ['package_jobs', 'Packages'], ['edition_jobs', 'Language adaptations'], ['edition_narrations', 'Language narrations'], ['publications', 'Uploads'],
  // Each answer asked of Claude or ChatGPT inside a room (plans, pictures, reviews, research): one that never came back is a problem.
  ['intelligence_usage', 'AI answers inside rooms'],
];
// How a recorded status counts. A job that was retried, interrupted or ended with an unknown charge is a problem even
// when a later attempt worked; one stopped by the owner's own limits is counted apart.
const DONE = new Set(['completed', 'partial', 'settled', 'processed', 'uploaded', 'scheduled', 'published', 'validated', 'studied', 'released', 'done']);
const PROBLEM = new Set(['failed', 'interrupted', 'unknown', 'quality_failed', 'usage_unknown', 'kept_private', 'retried', 'error']);
const LIMITED = new Set(['blocked_budget', 'blocked_quota']);
const OPEN = new Set(['queued', 'running', 'reserved', 'pending', 'uploading', 'processing']);
const outcome = status => (DONE.has(status) ? 'done' : PROBLEM.has(status) ? 'problem' : LIMITED.has(status) ? 'limited' : OPEN.has(status) ? 'open' : 'setAside');
const json = text => { try { return JSON.parse(text); } catch { return null; } };

function report(db, {days = 14, at = new Date(), quota = null} = {}) {
  if (!WINDOWS.includes(days)) days = 14;
  const since = new Date(at - days * DAY).toISOString(), tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
  const columns = table => new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name));
  const families = new Map(tables.has('families') ? db.prepare('SELECT id, payload FROM families').all().map(row => [row.id, json(row.payload)?.name || 'A family']) : []);

  // Reliability: how every kind of work ended.
  const problems = [];
  const work = WORK.filter(([table]) => tables.has(table)).map(([table, label]) => {
    const counts = {done: 0, problem: 0, limited: 0, open: 0, setAside: 0}, statuses = {};
    for (const row of db.prepare(`SELECT status, COUNT(*) AS n FROM ${table} WHERE created_at >= ? GROUP BY status`).all(since)) { counts[outcome(row.status)] += row.n; statuses[row.status] = row.n; }
    if (counts.problem) {
      const has = columns(table);
      for (const row of db.prepare(`SELECT status, ${has.has('error') ? 'error' : 'NULL AS error'}, ${has.has('updated_at') ? 'updated_at' : 'created_at'} AS at FROM ${table} WHERE created_at >= ? AND status IN (${[...PROBLEM].map(() => '?').join(',')}) ORDER BY at DESC LIMIT 5`).all(since, ...PROBLEM))
        problems.push({work: label, status: row.status, at: row.at, error: String(json(row.error)?.message || row.error || '').slice(0, 240) || null});
    }
    const finished = counts.done + counts.problem;
    return {table, label, ...counts, statuses, reliability: finished ? counts.done / finished : null};
  }).filter(item => Object.keys(item.statuses).length);
  const sum = key => work.reduce((n, item) => n + item[key], 0), finished = sum('done') + sum('problem');
  problems.sort((a, b) => String(b.at).localeCompare(String(a.at)));

  // Render capacity: how long rendering took per minute of finished video, by kind of render.
  const capacity = {};
  if (tables.has('render_jobs')) for (const row of db.prepare("SELECT preset, result FROM render_jobs WHERE status='completed' AND created_at >= ?").all(since)) {
    const result = json(row.result), seconds = Number(result?.renderSeconds), video = Number(result?.video?.probe?.durationSeconds);
    if (!(seconds > 0 && video > 0)) continue;
    const item = capacity[row.preset] ||= {preset: row.preset, label: result.preset?.label || row.preset, renders: 0, renderSeconds: 0, videoSeconds: 0};
    item.renders++; item.renderSeconds += seconds; item.videoSeconds += video;
  }
  const renders = Object.values(capacity).map(item => ({...item, perVideoMinute: item.renderSeconds / (item.videoSeconds / 60), videoMinutesPerHour: 60 * item.videoSeconds / item.renderSeconds}));

  // What was used: AI tokens (a subscription has no price per token here), paid characters, music and pictures in
  // cents, and research data units. An unknown charge is counted apart, with what was reserved for it as its limit.
  const tokens = {}, byFamily = {}, family = id => (byFamily[id || 'none'] ||= {family: families.get(id) || (id ? 'A deleted family' : 'No family'), tokens: 0, cents: 0});
  for (const table of ['llm_usage', 'research_usage', 'intelligence_usage'].filter(name => tables.has(name)))
    for (const row of db.prepare(`SELECT family_id, kind, status, total_tokens, reserved_tokens FROM ${table} WHERE created_at >= ? AND status IN ('settled','unknown')`).all(since)) {
      const item = tokens[row.kind] ||= {kind: row.kind, jobs: 0, tokens: 0, unknown: 0, unknownReserved: 0};
      item.jobs++;
      if (row.status === 'settled') { item.tokens += row.total_tokens || 0; family(row.family_id).tokens += row.total_tokens || 0; } else { item.unknown++; item.unknownReserved += row.reserved_tokens || 0; }
    }
  const paid = {voice: {characters: 0, cents: 0, unknown: 0}, audio: {units: 0, cents: 0, unknown: 0}, pictures: {cents: 0, unknown: 0}};
  if (tables.has('voice_usage')) for (const row of db.prepare("SELECT family_id, status, settled_characters, estimated_cost_cents FROM voice_usage WHERE created_at >= ? AND status IN ('settled','unknown')").all(since)) {
    if (row.status === 'unknown') { paid.voice.unknown++; continue; }
    paid.voice.characters += row.settled_characters || 0; paid.voice.cents += row.estimated_cost_cents || 0; family(row.family_id).cents += row.estimated_cost_cents || 0;
  }
  if (tables.has('audio_usage')) for (const row of db.prepare("SELECT family_id, status, units, cents FROM audio_usage WHERE created_at >= ? AND status IN ('settled','unknown')").all(since)) {
    if (row.status === 'unknown') { paid.audio.unknown++; continue; }
    paid.audio.units += row.units || 0; paid.audio.cents += row.cents || 0; family(row.family_id).cents += row.cents || 0;
  }
  if (tables.has('visual_usage')) for (const row of db.prepare("SELECT family_id, status, settled_cents FROM visual_usage WHERE created_at >= ? AND status IN ('settled','unknown')").all(since)) {
    if (row.status === 'unknown') { paid.pictures.unknown++; continue; }
    paid.pictures.cents += row.settled_cents || 0; family(row.family_id).cents += row.settled_cents || 0;
  }
  const data = tables.has('data_usage') ? db.prepare("SELECT provider, SUM(CASE WHEN status='unknown' THEN reserved_units ELSE used_units END) AS units, SUM(status='unknown') AS unknown, COUNT(*) AS requests FROM data_usage WHERE created_at >= ? AND status IN ('settled','unknown') GROUP BY provider ORDER BY provider").all(since).map(row => ({provider: row.provider, units: row.units || 0, unknown: row.unknown || 0, requests: row.requests})) : [];

  // Language review load: the named reviews of each language in the window, and adapted words still waiting for one.
  const languages = {}, lang = locale => (languages[locale] ||= {locale, reviews: 0, waiting: 0});
  for (const table of ['edition_approvals', 'edition_narration_approvals', 'edition_releases'].filter(name => tables.has(name)))
    for (const row of db.prepare(`SELECT locale, COUNT(*) AS n FROM ${table} WHERE created_at >= ? GROUP BY locale`).all(since)) lang(row.locale).reviews += row.n;
  if (tables.has('edition_revisions') && tables.has('edition_approvals'))
    for (const row of db.prepare('SELECT r.locale, COUNT(*) AS n FROM edition_revisions r WHERE r.revision = (SELECT MAX(x.revision) FROM edition_revisions x WHERE x.content_id = r.content_id AND x.locale = r.locale) AND NOT EXISTS (SELECT 1 FROM edition_approvals a WHERE a.revision_id = r.id) GROUP BY r.locale').all()) lang(row.locale).waiting += row.n;

  // Each channel over its own 90-100 days: counted from its first video seen public.
  const channels = [];
  if (tables.has('publications')) for (const [id, name] of families) {
    const rows = db.prepare('SELECT status, visibility, updated_at, locale FROM publications WHERE family_id=?').all(id);
    if (!rows.length) continue;
    const public_ = rows.filter(row => row.status === 'published').map(row => json(row.visibility)?.observedAt || row.updated_at).sort();
    const daysLive = public_.length ? Math.floor((at - new Date(public_[0])) / DAY) : 0;
    channels.push({family: name, published: public_.length, uploads: rows.length, failed: rows.filter(row => PROBLEM.has(row.status)).length, firstPublic: public_[0] || null, daysLive, validation: !public_.length ? 'not started' : daysLive >= 90 ? 'period complete' : 'running'});
  }

  return {
    days, since, at: at.toISOString(),
    reliability: {done: sum('done'), problems: sum('problem'), limited: sum('limited'), open: sum('open'), setAside: sum('setAside'), rate: finished ? sum('done') / finished : null},
    work, problems: problems.slice(0, 12), renders,
    usage: {tokens: Object.values(tokens).sort((a, b) => b.tokens - a.tokens), paid, cents: paid.voice.cents + paid.audio.cents + paid.pictures.cents, data, families: Object.values(byFamily).sort((a, b) => b.tokens - a.tokens)},
    quota, languages: Object.values(languages).sort((a, b) => a.locale.localeCompare(b.locale)), channels,
  };
}

module.exports = {report, outcome, WINDOWS, WORK};
