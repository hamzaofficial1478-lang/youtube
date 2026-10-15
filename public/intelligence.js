'use strict';
// R05 Competitor Intelligence and R06 Niche Factory (UI).
// Loaded before app.js; app.js helpers (state, esc, badge, action, api, refresh, toast,
// saveForm, date, localeName, heading, empty, familyDialog) are only used inside functions.

let competitorFamily = '', selectedAnalysis = '', selectedIdea = '', pendingPicks = {};

const INTEL_STATUS = {
  queued: ['Queued', 'orange'], running: ['Running', 'orange'], completed: ['Completed', 'green'], partial: ['Partial data', 'orange'], failed: ['Failed', 'gray'],
  interrupted: ['Interrupted · usage unknown', 'orange'], stale: ['Stale', 'gray'], blocked_quota: ['Blocked by data cap', 'orange'], blocked_budget: ['Blocked by token limit', 'orange'],
  quality_failed: ['Blocked by checks', 'orange'], usage_unknown: ['Usage unknown', 'orange'], budget_violation: ['Over token limit', 'orange'],
  studied: ['Ready to review', 'orange'], approved: ['Approved', 'green'], rejected: ['Rejected', 'gray'],
};
function intelStatus(status) { const [label, color] = INTEL_STATUS[status] || [status, 'gray']; return badge(label, color); }
// provider 'ai' means either Claude connection; the subscription one has no stored key.
function intelConnectors(provider) { return state.connectors.filter(item => (provider === 'ai' ? ['claude', 'claude-code'].includes(item.provider) : item.provider === provider) && (item.hasKey || item.provider === 'claude-code') && !item.busy && item.test?.status === 'passed'); }
function intelNumber(value) { return value === null || value === undefined ? '—' : Number(value).toLocaleString('en-US'); }
function intelDuration(seconds) { if (!Number.isFinite(seconds)) return '—'; const m = Math.floor(seconds / 60), s = Math.round(seconds % 60); return m ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`; }
// Spend meters warn near the cap; rating meters (warnHigh=false) never do.
function intelMeter(used, cap, warnHigh = true) { const pct = cap ? Math.min(100, Math.round(used / cap * 100)) : 100; return `<div class="meter"><span class="meter-fill ${warnHigh && pct >= 90 ? 'hot' : ''}" data-width="${pct}"></span></div>`; }
function intelApplyMeters(root = document) { root.querySelectorAll('[data-swatch]').forEach(element => { element.style.background = element.dataset.swatch; }); root.querySelectorAll('[data-width]').forEach(element => { const value = Number(element.dataset.width); if (Number.isFinite(value)) element.style.width = `${Math.max(0, Math.min(100, value))}%`; }); }
function intelList(items) { return items.length ? `<ul class="intel-list">${items.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : '<p class="muted">None recorded.</p>'; }
function intelBusy() {
  const intel = state?.intelligence;
  if (!intel) return false;
  const active = item => ['queued', 'running'].includes(item.status);
  return Object.values(intel.competitors.families).some(family => family.scans.some(active) || family.analyses.some(active)) || intel.niches.discoveries.some(active) || intel.niches.evaluations.some(active);
}
function competitorLabel(item) { return item.kind === 'username' ? `/user/${item.value}` : item.value; }
const competitorKeyOf = item => `${item.kind}:${item.value.toLowerCase()}`;
// Owner picks per competitor link (what to learn from it). Unsaved changes live here until "Save blend".
function picksFor(familyId) { return pendingPicks[familyId] || state.intelligence.competitors.families[familyId].picks.picks; }
function picksChanged(familyId) {
  if (!pendingPicks[familyId]) return 0;
  const saved = state.intelligence.competitors.families[familyId].picks.picks, next = pendingPicks[familyId];
  return [...new Set([...Object.keys(saved), ...Object.keys(next)])].filter(key => JSON.stringify(saved[key] || []) !== JSON.stringify(next[key] || [])).length;
}
function blendRecipe(family, names) {
  const traits = state.intelligence.competitors.traits, picks = picksFor(family.id);
  return `<div class="blend-recipe">${Object.entries(traits).map(([trait, info]) => {
    const from = family.competitors.filter(item => (picks[competitorKeyOf(item)] || []).includes(trait)).map(item => names.get(competitorKeyOf(item)));
    return `<div class="blend-slot ${from.length ? '' : 'own'}"><b>${esc(info.label)}</b><span>${from.length ? `Learn from ${esc(from.join(' + '))}` : '100% your own'}</span><small>→ ${esc(info.route)}</small></div>`;
  }).join('')}</div>`;
}

// ---------------------------------------------------------------- shared pieces
function dataCapsCard() {
  const quota = state.intelligence.competitors.quota;
  const row = (label, provider, connectors) => `<div class="cap-row"><div><strong>${label}</strong><small>${connectors.length ? `${connectors.length} tested connector${connectors.length === 1 ? '' : 's'}` : 'No tested connector — add one in Connections'}</small></div><div class="cap-meter">${intelMeter(quota[provider].used, quota[provider].cap)}<small>${intelNumber(quota[provider].used)} / ${intelNumber(quota[provider].cap)} ${esc(quota[provider].unit)}</small></div></div>`;
  return `<section class="production-card"><div class="production-card-head"><div><span class="micro-label">DATA SOURCES & CAPS</span><h2>Research data budget</h2></div>${action('Edit caps', 'intel-caps', '', 'secondary')}</div>
    ${row('NexLev research API', 'nexlev', intelConnectors('nexlev'))}${row('YouTube public data', 'youtube', intelConnectors('youtube'))}
    <div class="cap-row"><div><strong>Claude</strong><small>${intelConnectors('ai').length ? 'Connected and tested' : 'Set up and test Claude in Connections'}</small></div><div>${badge(intelConnectors('ai').length ? 'Ready' : 'Not ready', intelConnectors('ai').length ? 'green' : 'gray')}</div></div>
    <p class="hint">Caps are reserved before any request and settled with the real count. YouTube data about other channels is display-only and deleted after 30 days, per YouTube's developer policies.</p></section>`;
}

// ---------------------------------------------------------------- Competitor intelligence view
function competitorsView() {
  const families = state.families.filter(item => !item.archived);
  if (!families.length) return heading('Competitor intelligence', 'Learn techniques from each family\'s competitor channels.') + `<section class="panel">${empty('Create a channel family first.', 'Each family keeps its own 3-10 competitor channels.', action('+ Create a family', 'new-family', '', 'primary'))}</section>`;
  if (!families.some(item => item.id === competitorFamily)) competitorFamily = (families.find(item => item.competitors.length) || families[0]).id;
  const family = families.find(item => item.id === competitorFamily), data = state.intelligence.competitors.families[family.id];
  const latestScan = data.scans.find(scan => scan.result?.channels?.[0]?.nexlev !== undefined || scan.result?.channels?.some(channel => channel.youtube)) || null;
  const notesByKey = new Map();
  for (const note of data.notes) notesByKey.set(note.competitorKey, note);
  const traits = state.intelligence.competitors.traits, picks = picksFor(family.id), names = new Map();
  for (const item of family.competitors) {
    const channel = latestScan?.result?.channels?.find(entry => entry.competitorKey === competitorKeyOf(item));
    names.set(competitorKeyOf(item), channel?.nexlev?.about?.title || (channel?.youtube && !channel.youtube.purged ? channel.youtube.title : null) || competitorLabel(item));
  }
  const changes = picksChanged(family.id);
  const rows = family.competitors.map(item => {
    const key = competitorKeyOf(item), channel = latestScan?.result?.channels?.find(entry => entry.competitorKey === key), note = notesByKey.get(key), stats = channel?.stats;
    const name = channel?.nexlev?.about?.title || (channel?.youtube && !channel.youtube.purged ? channel.youtube.title : null) || competitorLabel(item);
    return `<article class="competitor-row">
      <div class="competitor-main"><span class="room-number">${esc(channel?.ref || '—')}</span><div><strong><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(name)}</a></strong><small>${esc(competitorLabel(item))}${channel ? ` · ${esc(channel.status)}` : ' · not scanned yet'}</small></div></div>
      <div class="competitor-stats">${stats ? `<span><b>${intelDuration(stats.medianDurationSeconds)}</b>median length</span><span><b>${stats.uploadsPerWeek ?? '—'}</b>uploads/week</span><span><b>${stats.shortsShare ?? '—'}%</b>Shorts</span><span><b>${stats.wordsPerMinute ?? '—'}</b>words/min</span><span><b>${stats.topOutlierScore ? `${stats.topOutlierScore}×` : '—'}</b>top outlier</span>` : '<span class="muted">Statistics appear after a scan with NexLev data.</span>'}</div>
      <div class="competitor-notes">${note ? `<small>Observations r${note.revision} · ${esc(note.createdBy)}</small><p>${esc([note.editingStyle, note.voice, note.visuals].filter(Boolean).join(' · ').slice(0, 160))}</p>` : '<small class="muted">No observations yet</small>'}${action(note ? 'Update observations' : 'Add observations', 'intel-note', key, 'text-button')}</div>
      <div class="keep-row"><span>Keep from this channel</span>${Object.entries(traits).map(([trait, info]) => { const on = (picks[key] || []).includes(trait); return `<button type="button" class="keep-chip ${on ? 'on' : ''}" data-keep="${esc(key)}" data-trait="${trait}" aria-pressed="${on}">${on ? '✓ ' : ''}${esc(info.label)}</button>`; }).join('')}</div>
      ${channel?.errors?.length ? `<p class="inline-warning">${esc(channel.errors.join(' · '))}</p>` : ''}
    </article>`;
  }).join('');
  const scanRows = data.scans.map(scan => `<div class="history-row ${scan.status === 'completed' ? 'active' : ''}"><span class="job-dot ${['queued', 'running'].includes(scan.status) ? 'queued' : scan.status === 'completed' ? 'completed' : ''}"></span><div><strong>${intelStatus(scan.status)} ${esc(date(scan.createdAt))}</strong><small>${scan.result ? `${scan.result.usage.nexlev} NexLev request${scan.result.usage.nexlev === 1 ? '' : 's'} · ${scan.result.usage.youtube} YouTube unit${scan.result.usage.youtube === 1 ? '' : 's'}` : `Planned: ${scan.scope.plannedUnits.nexlev} NexLev · ${scan.scope.plannedUnits.youtube} YouTube`} · attempt ${scan.attempts}/3 · by ${esc(scan.createdBy)}${scan.youtubePurgedAt ? ' · YouTube data deleted after 30 days' : scan.youtubeExpiresAt ? ` · YouTube data kept until ${esc(date(scan.youtubeExpiresAt))}` : ''}${scan.error ? ` · ${esc(scan.error)}` : ''}</small></div>${['failed', 'interrupted', 'blocked_quota', 'stale'].includes(scan.status) && scan.attempts < 3 ? action('Retry deliberately', 'intel-scan-retry', scan.id, 'text-button') : ''}</div>`).join('') || '<p class="muted">No scans yet. A scan only runs when you start it.</p>';
  const analyses = data.analyses;
  if (!analyses.some(item => item.id === selectedAnalysis)) selectedAnalysis = (analyses.find(item => item.id === data.current?.id) || analyses[0])?.id || '';
  const analysis = analyses.find(item => item.id === selectedAnalysis);
  return heading('Competitor intelligence', 'Study each family\'s 3-10 competitors to learn techniques — at most 30% reference patterns, at least 70% original work. Nothing changes your channels until you approve it.', action('Scan settings', 'intel-settings', family.id, 'secondary'))
    + `<div class="production-toolbar"><div><label for="competitor-family">Channel family</label><select id="competitor-family">${families.map(item => `<option value="${item.id}" ${item.id === family.id ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select></div><div class="production-context"><span>${family.competitors.length} competitor${family.competitors.length === 1 ? '' : 's'}</span><span>${esc(localeName(family.primaryLocale))}</span><span>${esc(family.format)}</span>${data.guidanceActive ? '<span class="good">Script guidance active</span>' : ''}</div></div>`
    + `<div class="intel-grid"><div>
      <section class="production-card"><div class="production-card-head"><div><span class="micro-label">STEP 1 · YOUR COMPETITORS</span><h2>Competitor channels</h2></div><div class="row-end">${changes ? action('Discard', 'intel-picks-discard', family.id, 'text-button') + action(`Save blend (${changes} change${changes === 1 ? '' : 's'})`, 'intel-picks-save', family.id, 'primary') : ''}${action('Edit family list', 'edit-family', family.id, 'secondary')}</div></div>
        ${family.competitors.length < 3 ? `<p class="inline-warning">Add ${family.competitors.length ? `${3 - family.competitors.length} more` : '3-10'} competitor channel${family.competitors.length === 2 ? '' : 's'} for a reliable comparison.</p>` : ''}
        ${rows || '<p class="muted">No competitors listed for this family yet.</p>'}
        <p class="hint">Your own observations (editing style, voice, visuals, thumbnails) are the strongest evidence: no API watches the videos for you.</p>
        ${family.competitors.length ? `<h3 class="intel-subhead">Your blend recipe ${data.picks.revision ? `<small class="muted">saved r${data.picks.revision} by ${esc(data.picks.createdBy)}</small>` : '<small class="muted">nothing picked yet: Claude learns from every channel</small>'}</h3>${blendRecipe(family, names)}<p class="hint">Pick what you like on each link; several picks per link are fine. Each area learns only from the channels you picked for it, keeps at most 30% reference, and areas without picks stay 100% your own. Saving new picks makes an approved blueprint outdated until you analyze again.</p>` : ''}</section>
      <section class="production-card"><div class="production-card-head"><div><span class="micro-label">STEP 2 · COLLECT DATA</span><h2>Competitor scans</h2></div>${action('Run scan', 'intel-scan', family.id, 'primary')}</div><div class="history-list">${scanRows}</div>${latestScan ? scanDetail(latestScan) : ''}</section>
      <section class="production-card"><div class="production-card-head"><div><span class="micro-label">STEP 3 · CLAUDE BLUEPRINT</span><h2>Learn, then differentiate</h2></div>${action('Analyze latest scan', 'intel-analyze', family.id, 'primary')}</div>
        ${analyses.length ? `<div class="chip-row analysis-tabs">${analyses.map(item => `<button type="button" class="button ${item.id === selectedAnalysis ? 'primary' : 'secondary'}" data-select-analysis="${esc(item.id)}">${esc(date(item.createdAt))} · ${esc((INTEL_STATUS[item.status] || [item.status])[0])}${item.review ? ` · ${esc(item.review.decision)}` : ''}</button>`).join('')}</div>` : '<p class="muted">Run a scan, then ask Claude for a blueprint. It must pass the 30/70 rule and the copy guard before you can review it.</p>'}
        ${analysis ? blueprintView(analysis, family, data) : ''}</section>
      ${studiesCard(family)}
    </div><div>${dataCapsCard()}${guidanceCard(family, data)}</div></div>`;
}

// R05c: the program learns a look from a reference (a video file or screenshots on this PC).
function studiesCard(family) {
  const studies = (state.styleStudies?.studies || []).filter(item => item.familyId === family.id);
  return `<section class="production-card"><div class="production-card-head"><div><span class="micro-label">LEARN A LOOK · CLAUDE STUDIES A REFERENCE</span><h2>Style studies</h2></div>${action('Study a reference', 'intel-study', family.id, 'primary')}</div>
    <p class="hint">Point the program at a video file or screenshots of a video whose look you like, for example a competitor's. FFmpeg measures its cut rhythm and colours on this PC; Claude reads the frames and maps the look onto our engines. It learns techniques only (at most 30%), never a channel's identity, and changes nothing until you approve it and make a style draft.</p>
    ${studies.map(studyView).join('') || '<p class="muted">No studies yet.</p>'}</section>`;
}
function studyView(item) {
  const study = item.study, measured = item.measured, swatch = colour => `<span class="swatch" data-swatch="${esc(colour)}" title="${esc(colour)}"></span>`;
  const retry = ['failed', 'interrupted', 'quality_failed', 'blocked_budget', 'stale'].includes(item.status) && item.attempts < 3;
  return `<article class="study-row">
    <div class="production-card-head"><div><strong>${esc(item.title)}</strong> ${intelStatus(item.status)}<small class="muted"> · ${item.source.kind === 'video' ? 'video file' : `${item.source.files} screenshot${item.source.files === 1 ? '' : 's'}`} · ${esc(item.createdBy)} · ${esc(date(item.createdAt))}${item.usage?.total ? ` · ${intelNumber(item.usage.total)} tokens` : ''}</small></div>
      <div class="row-end">${retry ? action('Retry', 'intel-study-retry', item.id) : ''}${item.status === 'studied' ? action('Review', 'intel-study-review', item.id, 'primary') : ''}${item.status === 'approved' ? action('Create style draft', 'intel-study-draft', item.id, 'primary') : ''}</div></div>
    ${item.error ? `<p class="inline-warning">${esc(item.error)}</p>` : ''}
    ${measured ? `<p class="hint">Measured on this PC: ${measured.shots ? `${measured.shots} shots, median ${measured.medianShotSeconds} s (middle half ${measured.p25ShotSeconds}-${measured.p75ShotSeconds} s)` : 'screenshots, no timing'}${measured.colours?.length ? ` · main colours ${measured.colours.map(swatch).join('')}` : ''}</p>` : ''}
    ${item.sheets ? `<div class="study-sheets">${Array.from({length: item.sheets}, (_, k) => `<img class="contact-sheet" src="/api/style-studies/${esc(item.id)}/sheets/${k + 1}" alt="Contact sheet ${k + 1} of ${esc(item.title)}" loading="lazy">`).join('')}</div>` : ''}
    ${study ? `<p>${esc(study.summary)}</p>
      <dl class="style-facts"><div><dt>Engine</dt><dd>${esc(study.engine)}${study.look ? ` · ${esc(study.look)} look` : ''}</dd></div><div><dt>Palette</dt><dd>${['background', 'primary', 'accent', 'text'].map(key => swatch(study.palette[key])).join('')}</dd></div><div><dt>Shots</dt><dd>${study.pacing.shotMinSeconds}-${study.pacing.shotMaxSeconds} s · ${esc(study.transitions.join(', '))}</dd></div>
        <div><dt>People</dt><dd>${esc(study.characters)}</dd></div><div><dt>Places</dt><dd>${esc(study.places)}</dd></div><div><dt>Words</dt><dd>${esc(study.words)}</dd></div><div><dt>Camera</dt><dd>${esc(study.camera)}</dd></div></dl>
      <h4 class="intel-subhead">Techniques to learn (the 30%)</h4>${intelList(study.learn)}<h4 class="intel-subhead">Our own (the 70%)</h4>${intelList(study.ours)}<h4 class="intel-subhead">Never copy</h4>${intelList(study.avoid)}
      <h4 class="intel-subhead">Planning brief for Claude</h4><p>${esc(study.brief)}</p>${item.warnings.length ? `<p class="hint">${esc(item.warnings.join(' '))}</p>` : ''}` : ''}
    ${item.review ? `<p class="hint">${item.review.decision === 'approved' ? 'Approved' : 'Rejected'} by ${esc(item.review.reviewer)}${item.review.reason ? `: ${esc(item.review.reason)}` : ''}.</p>` : ''}
    ${item.applied.map(entry => `<p class="hint">Style draft created by ${esc(entry.by)} (applied ${esc(entry.applied.join(', ') || 'nothing')}${entry.skipped.length ? `; skipped ${esc(entry.skipped.map(s => s.change).join(', '))}` : ''}). Review and approve it in Production panel → Style Library.</p>`).join('')}
  </article>`;
}

function scanDetail(scan) {
  const channels = scan.result.channels;
  return `<details class="scan-detail"><summary>Latest scan data · ${esc(date(scan.result.retrievedAt))}</summary>${channels.map(channel => {
    const videos = channel.nexlev ? [...(channel.nexlev.outliers || []), ...(channel.nexlev.videos || [])] : [];
    const unique = [...new Map(videos.map(video => [video.videoId, video])).values()].slice(0, 8);
    return `<div class="scan-channel"><h4>${esc(channel.ref)} · ${esc(channel.nexlev?.about?.title || channel.input.value)}</h4>
      ${unique.length ? `<table class="data-table"><thead><tr><th>NexLev video</th><th>Length</th><th>Views</th><th>Outlier</th><th title="Views divided by this channel's median of recent uploads (needs 4 or more videos)">× median</th><th title="The hook formula the title uses (21-formula classifier)">Title formula</th></tr></thead><tbody>${unique.map(video => { const craft = channel.craft?.videos.find(item => item.videoId === video.videoId); return `<tr><td>${esc(video.title || video.videoId)}</td><td>${intelDuration(video.durationSeconds)}</td><td>${intelNumber(video.views)}</td><td>${video.outlierScore ? `${video.outlierScore}×` : '—'}</td><td>${craft?.multiple != null ? `${craft.multiple}×` : '—'}</td><td>${esc(craft?.formula || '—')}</td></tr>`; }).join('')}</tbody></table>${channel.craft && !channel.craft.enough ? '<p class="hint">Fewer than 4 recent videos, so no channel median: a median of one or two videos is noise.</p>' : channel.craft ? `<p class="hint">Channel median ${intelNumber(channel.craft.median)} views over recent uploads. Study the videos far above it, not the biggest numbers.</p>` : ''}` : '<p class="muted">No NexLev video data.</p>'}
      ${(channel.nexlev?.transcripts || []).map(item => `<div class="transcript"><small>${esc(item.ref)} · ${item.wordsPerMinute ?? '—'} words/min · ${intelNumber(item.wordCount)} words</small><p>${esc(item.hookExcerpt)}…</p></div>`).join('')}
      ${channel.youtube && !channel.youtube.purged ? `<details><summary>YouTube public data (display only)</summary><p class="hint">${esc(channel.youtube.title || '')} · ${intelNumber(channel.youtube.subscriberCount === null ? null : Number(channel.youtube.subscriberCount))} subscribers · ${intelNumber(Number(channel.youtube.videoCount))} videos. Shown for reference only; it is not scored or sent to Claude without YouTube's derived-use approval.</p>${channel.youtube.videos.slice(0, 6).map(video => `<small class="yt-row">${esc(video.title)} · ${intelDuration(video.durationSeconds)} · ${video.views ? intelNumber(Number(video.views)) : '—'} views</small>`).join('')}</details>` : channel.youtube?.purged ? '<p class="hint">YouTube data for this scan was deleted after 30 days.</p>' : ''}
    </div>`;
  }).join('')}</details>`;
}

function blueprintView(analysis, family, data) {
  const head = `<div class="blueprint-head"><div>${intelStatus(analysis.status)} ${analysis.review ? badge(`Review: ${analysis.review.decision}`, analysis.review.decision === 'approved' ? 'green' : 'gray') : ''} ${analysis.usage?.total ? badge(`${intelNumber(analysis.usage.total)} tokens`) : ''}</div><small>Attempt ${analysis.attempts}/3 · by ${esc(analysis.createdBy)}${analysis.error ? ` · ${esc(analysis.error)}` : ''}</small></div>`;
  const retry = ['failed', 'interrupted', 'quality_failed', 'blocked_budget', 'usage_unknown', 'stale'].includes(analysis.status) && analysis.attempts < 3 ? action('Retry deliberately', 'intel-analysis-retry', analysis.id, 'secondary') : '';
  if (!analysis.result) return `${head}${analysis.quality?.issues?.length ? `<div class="checks">${intelList(analysis.quality.issues)}</div>` : ''}${retry}`;
  const bp = analysis.result, share = analysis.quality?.referenceSharePercent ?? 0;
  const section = (title, body) => `<div class="bp-section"><span class="micro-label">${title}</span>${body}</div>`;
  const reviewed = analysis.review?.decision === 'approved';
  const actions = `<div class="card-actions">${analysis.status === 'completed' && !analysis.review ? action('Review blueprint', 'intel-review', analysis.id, 'primary') : ''}${reviewed ? action('Revoke approval', 'intel-revoke', analysis.id, 'text-button danger') : ''}${reviewed ? action('Create style draft', 'intel-style-draft', analysis.id, 'secondary') : ''}${reviewed && data.voiceDirection?.analysisId === analysis.id ? action('Use voice direction', 'intel-voice', family.id, 'secondary') : ''}${retry}</div>`;
  return `${head}
    ${analysis.quality && !analysis.quality.passed ? `<div class="checks"><strong>Blocked:</strong>${intelList(analysis.quality.issues)}</div>` : ''}
    <p class="bp-summary">${esc(bp.summary)}</p>
    ${analysis.blend ? `<div class="blend-recipe compact">${Object.entries(state.intelligence.competitors.traits).map(([trait, info]) => { const from = analysis.blend.areaSources[info.area] || []; return `<div class="blend-slot ${from.length ? '' : 'own'}"><b>${esc(info.label)}</b><span>${from.length ? `From ${esc(from.join(' + '))}` : '100% own'}</span>${analysis.quality?.areaShares ? `<small>${analysis.quality.areaShares[info.area]}% reference</small>` : ''}</div>`; }).join('')}</div>` : ''}
    <div class="share-bar" aria-label="Reference versus original share"><span class="share-ref" data-width="${share}">${share}% reference</span><span class="share-own">${100 - share}% original</span></div>
    <div class="bp-grid">
      ${section('Adopt (reference, ≤30%)', `<ul class="intel-list">${bp.adopt.map(item => `<li><b>${esc(item.area)}</b> · ${esc(item.pattern)} <small>${esc(item.refs.join(', '))}</small></li>`).join('')}</ul>`)}
      ${section('Original (≥70%)', `<ul class="intel-list">${bp.original.map(item => `<li><b>${esc(item.area)}</b> · ${esc(item.contribution)}</li>`).join('')}</ul>`)}
      ${section('Script', `<p><b>Hooks:</b> ${esc(bp.script.hookPatterns.join(' · '))}</p><p><b>Structure:</b> ${esc(bp.script.structure.join(' → '))}</p><p><b>Pacing:</b> ${esc(bp.script.pacing)}</p><p><b>Call to action:</b> ${esc(bp.script.callToAction)}</p>`)}
      ${section('Voice-over', `<p>${esc(bp.voice.tone)} · ${esc(bp.voice.emotion)} · ${esc(bp.voice.pace)} pace · energy ${bp.voice.energy}</p>${intelList(bp.voice.delivery)}`)}
      ${section('Editing style', `<p>Recommended: <b>${esc((state.styles.profiles.find(item => item.key === bp.editing.recommendedStyleKey) || {}).name || bp.editing.recommendedStyleKey)}</b></p>${intelList(bp.editing.observations)}${bp.editing.adjustments.length ? `<p><b>Proposed adjustments:</b></p><ul class="intel-list">${bp.editing.adjustments.map(item => `<li><code>${esc(item.setting)}</code> → ${esc(JSON.stringify(item.value))} · ${esc(item.reason)}</li>`).join('')}</ul>` : ''}`)}
      ${section('Visuals', `${intelList(bp.visuals.observations)}<p><b>Sources:</b> ${esc(bp.visuals.recommendedSources.join(', '))}</p>`)}
      ${section('Packaging', `<p><b>Titles:</b> ${esc(bp.packaging.titlePatterns.join(' · '))}</p><p><b>Thumbnails:</b> ${esc(bp.packaging.thumbnailNotes.join(' · '))}</p>`)}
      ${section('Opportunities', `<ul class="intel-list">${bp.opportunities.map(item => `<li>${esc(item.opportunity)} <small>${esc(item.refs.join(', '))}</small></li>`).join('')}</ul>`)}
      ${section('Avoid', bp.avoid.length ? `<ul class="intel-list">${bp.avoid.map(item => `<li>${esc(item.pattern)} — ${esc(item.reason)}</li>`).join('')}</ul>` : '<p class="muted">Nothing listed.</p>')}
      ${section('Competitor positioning', `<ul class="intel-list">${bp.channels.map(item => `<li><b>${esc(item.ref)}</b> ${esc(item.positioning)}</li>`).join('')}</ul>`)}
      ${section(`Confidence · ${esc(bp.confidence.level)}`, `<p>${esc(bp.confidence.rationale)}</p>${intelList(bp.uncertainties)}`)}
    </div>
    ${analysis.applied.length ? `<div class="handoff-rule"><strong>Applied</strong>${analysis.applied.map(item => `<p>Style draft created by ${esc(item.by)} · ${esc(date(item.at))} · ${item.applied.length} adjustment(s) applied${item.skipped.length ? `, ${item.skipped.length} skipped (${esc(item.skipped.map(skip => skip.setting).join(', '))})` : ''}. Review it in Production panel → Style Library.</p>`).join('')}</div>` : ''}
    ${actions}`;
}

function guidanceCard(family, data) {
  const current = data.current;
  return `<section class="production-card"><div class="production-card-head"><div><span class="micro-label">WHAT IT CHANGES</span><h2>Approved guidance</h2></div>${badge(current ? (current.outdated ? 'Outdated' : 'Active') : 'None yet', current && !current.outdated ? 'green' : 'gray')}</div>
    <div class="handoff-record"><span>${data.guidanceActive ? '✓' : '○'}</span><div><strong>Claude script guidance</strong><p>${data.guidanceActive ? 'New Claude script candidates for this family include the approved hook, structure, pacing and avoid list as technique guidance.' : 'Starts after you approve a blueprint for the current competitor list.'}</p></div></div>
    <div class="handoff-record"><span>${data.voiceDirection ? '✓' : '○'}</span><div><strong>Narrator direction</strong><p>${data.voiceDirection ? `${esc(data.voiceDirection.emotion)} · pace ${data.voiceDirection.pace} · energy ${data.voiceDirection.energy}. Applied only when you save a narrator profile.` : 'Available after approval.'}</p></div></div>
    <div class="handoff-record"><span>○</span><div><strong>Editing style</strong><p>"Create style draft" makes a new draft in the Style Library. You still review, approve and assign it.</p></div></div>
    <div class="handoff-record"><span>${data.packagingBrief ? '✓' : '○'}</span><div><strong>Packaging brief</strong><p>${data.packagingBrief ? `${esc(data.packagingBrief.thumbnailNotes.slice(0, 2).join(' · '))}. Saved for the Packaging Room.` : 'Thumbnail and title lessons, saved for the Packaging Room after approval.'}</p></div></div>
    <div class="handoff-record"><span>${current && !current.outdated ? '✓' : '○'}</span><div><strong>Scene planner guidance</strong><p>${current && !current.outdated ? 'Claude scene plans use the approved visual and editing techniques.' : 'Starts after approval.'}</p></div></div>
    ${current?.outdated ? `<p class="inline-warning">${esc(current.outdatedReason || 'The competitor list changed after this approval.')} Run a new scan and analysis.</p>` : ''}</section>`;
}

// ---------------------------------------------------------------- Niche Factory view
function nichesView() {
  const niches = state.intelligence.niches, ideas = niches.ideas;
  const active = ideas.filter(item => item.status === 'active');
  if (!ideas.some(item => item.id === selectedIdea)) selectedIdea = active[0]?.id || ideas[0]?.id || '';
  const latest = (list, ideaId) => list.find(item => item.ideaId === ideaId);
  const cards = ideas.map(idea => {
    const discovery = latest(niches.discoveries, idea.id), evaluation = latest(niches.evaluations, idea.id);
    return `<article class="niche-card ${idea.id === selectedIdea ? 'selected' : ''} ${idea.status === 'archived' ? 'archived' : ''}">
      <div class="card-top"><span class="micro-label">${esc(idea.formats.join(' + '))}${idea.status === 'archived' ? ' · archived' : ''}</span>${evaluation?.score !== null && evaluation?.score !== undefined ? `<span class="score-pill ${esc(evaluation.decision)}">${evaluation.score}</span>` : ''}</div>
      <h3>${esc(idea.title)}</h3><p>${esc(idea.description.slice(0, 180))}</p>
      <div class="chip-row">${idea.keywords.map(item => `<span class="chip">${esc(item)}</span>`).join('')}${idea.seedChannels.map(item => `<span class="chip green">${esc(competitorLabel(item))}</span>`).join('')}</div>
      <small>${discovery ? `Discovery: ${esc((INTEL_STATUS[discovery.status] || [discovery.status])[0])}` : 'No discovery yet'} · ${evaluation ? `Evaluation: ${esc((INTEL_STATUS[evaluation.status] || [evaluation.status])[0])}${evaluation.decision ? ` · ${esc(evaluation.decision.replaceAll('_', ' '))}` : ''}${evaluation.review ? ` · ${esc(evaluation.review.decision)}` : ''}` : 'not evaluated'}</small>
      <div class="card-actions">${action('Open', 'niche-open', idea.id, 'text-button')}${action('Edit', 'niche-edit', idea.id, 'text-button')}${action(idea.status === 'archived' ? 'Restore' : 'Archive', 'niche-archive', idea.id, 'text-button danger')}</div></article>`;
  }).join('');
  const idea = ideas.find(item => item.id === selectedIdea);
  const used = niches.tokens;
  return heading('Niche Factory', 'Your own niche ideas plus NexLev discovery, scored with the blueprint rubric. Hard filters always win over the score, and you decide what becomes a family.', action('+ New niche idea', 'niche-new', '', 'primary'))
    + `<div class="production-kpis"><div><span>Active ideas</span><strong>${active.length}</strong><small>${ideas.length - active.length} archived</small></div><div><span>NexLev this month</span><strong>${intelNumber(niches.quota.nexlev.used)}</strong><small>of ${intelNumber(niches.quota.nexlev.cap)} requests</small></div><div><span>Niche tokens ${esc(used.period)}</span><strong>${intelNumber(used.settled + used.reserved)}</strong><small>of ${intelNumber(used.limit)}</small></div><div><span>Shortlisted / approved</span><strong>${niches.evaluations.filter(item => ['shortlisted', 'approved'].includes(item.review?.decision)).length}</strong><small>${niches.evaluations.filter(item => item.review?.familyId).length} became families</small></div></div>`
    + `<div class="intel-grid"><div>${idea ? nicheDetail(idea, niches) : `<section class="production-card">${empty('Add your first niche idea.', 'Describe the idea, add 1-5 keywords and optional seed channels. Discovery uses NexLev; evaluation uses Claude.', action('+ New niche idea', 'niche-new', '', 'primary'))}</section>`}</div>
      <div><section class="production-card"><div class="production-card-head"><div><span class="micro-label">YOUR IDEAS</span><h2>Niche ideas</h2></div>${action('Settings', 'niche-settings', '', 'secondary')}</div><div class="niche-list">${cards || '<p class="muted">No ideas yet.</p>'}</div></section>${dataCapsCard()}</div></div>`;
}

function nicheDetail(idea, niches) {
  const discovery = niches.discoveries.find(item => item.ideaId === idea.id), evaluation = niches.evaluations.find(item => item.ideaId === idea.id);
  const disc = discovery?.result && discovery.result.channels ? discovery.result : null;
  const discoveryBody = !discovery ? '<p class="muted">No discovery yet. It uses NexLev only when you start it.</p>' : `<div class="history-row"><span class="job-dot ${['queued', 'running'].includes(discovery.status) ? 'queued' : discovery.status === 'completed' ? 'completed' : ''}"></span><div><strong>${intelStatus(discovery.status)} ${esc(date(discovery.createdAt))}</strong><small>${discovery.result?.usage ? `${discovery.result.usage.nexlev} NexLev request(s)` : `Planned ${discovery.scope.plannedUnits.nexlev} NexLev request(s)`} · attempt ${discovery.attempts}/3${discovery.error ? ` · ${esc(discovery.error)}` : ''}</small></div>${['failed', 'interrupted', 'blocked_quota', 'stale'].includes(discovery.status) && discovery.attempts < 3 ? action('Retry deliberately', 'niche-discovery-retry', discovery.id, 'text-button') : ''}</div>
    ${disc ? `${disc.seeds.map(seed => `<div class="bp-section"><span class="micro-label">${esc(seed.ref)} · niche overview of ${esc(competitorLabel(seed.input))}</span>${seed.overview ? `<dl class="style-facts">${Object.entries(seed.overview).map(([key, value]) => `<div><dt>${esc(key)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>` : `<p class="muted">${esc(seed.errors.join(' ') || 'No overview returned.')}</p>`}</div>`).join('')}
      ${disc.channels.length ? `<table class="data-table"><thead><tr><th>Ref</th><th>Channel</th><th>Subscribers</th><th>Found via</th></tr></thead><tbody>${disc.channels.slice(0, 15).map(channel => `<tr><td>${esc(channel.ref)}</td><td><a href="https://www.youtube.com/channel/${esc(channel.channelId)}" target="_blank" rel="noopener noreferrer">${esc(channel.title || channel.channelId)}</a></td><td>${intelNumber(channel.subscribers)}</td><td>${esc(channel.sources.join(', '))}</td></tr>`).join('')}</tbody></table>` : ''}
      ${disc.keywords.map(item => `<div class="bp-section"><span class="micro-label">${esc(item.ref)} · "${esc(item.keyword)}"</span>${item.videos.length ? `<ul class="intel-list">${item.videos.slice(0, 6).map(video => `<li>${esc(video.title || video.videoId)} <small>${esc(video.channelTitle || '')} · ${intelNumber(video.views)} views</small></li>`).join('')}</ul>` : `<p class="muted">${esc(item.error || 'No results.')}</p>`}</div>`).join('')}
      ${disc.analytics.length ? `<table class="data-table"><thead><tr><th>Ref</th><th>Channel</th><th>Monthly views</th><th>Est. monthly revenue</th><th>RPM</th></tr></thead><tbody>${disc.analytics.map(item => `<tr><td>${esc(item.ref)}</td><td>${esc(item.channelRef)}</td><td>${intelNumber(item.monthlyViews)}</td><td>${item.estimatedMonthlyRevenue === null ? '—' : `$${intelNumber(item.estimatedMonthlyRevenue)}`}</td><td>${item.rpm ?? '—'}</td></tr>`).join('')}</tbody></table><p class="hint">Revenue and RPM are NexLev estimates for other people's channels — not facts and not a forecast for yours.</p>` : ''}` : ''}`;
  return `<section class="production-card"><div class="production-card-head"><div><span class="micro-label">NICHE IDEA · r${idea.revision}</span><h2>${esc(idea.title)}</h2></div><div class="row-end">${idea.status === 'active' ? action('Run discovery', 'niche-discover', idea.id, 'secondary') + action('Evaluate with Claude', 'niche-evaluate', idea.id, 'primary') : ''}</div></div>
      <p>${esc(idea.description)}</p><p class="muted">${esc([idea.audience, idea.countries.join(', ')].filter(Boolean).join(' · '))}</p>
      <h3 class="intel-subhead">Discovery</h3>${discoveryBody}
      <h3 class="intel-subhead">Evaluation</h3>${evaluation ? evaluationView(evaluation, niches) : '<p class="muted">No evaluation yet. Claude scores the idea with the rubric; the program computes the score.</p>'}
    </section>`;
}

function evaluationView(evaluation, niches) {
  const head = `<div class="blueprint-head"><div>${intelStatus(evaluation.status)} ${evaluation.review ? badge(`Review: ${evaluation.review.decision}`, evaluation.review.decision === 'approved' ? 'green' : 'gray') : ''} ${evaluation.usage?.total ? badge(`${intelNumber(evaluation.usage.total)} tokens`) : ''}</div><small>Attempt ${evaluation.attempts}/3${evaluation.error ? ` · ${esc(evaluation.error)}` : ''}</small></div>`;
  const retry = ['failed', 'interrupted', 'quality_failed', 'blocked_budget', 'usage_unknown', 'stale'].includes(evaluation.status) && evaluation.attempts < 3 ? action('Retry deliberately', 'niche-evaluation-retry', evaluation.id, 'secondary') : '';
  if (!evaluation.result) return `${head}${evaluation.quality?.issues?.length ? `<div class="checks">${intelList(evaluation.quality.issues)}</div>` : ''}${retry}`;
  const result = evaluation.result;
  const rubric = niches.rubric.map(item => {
    const rating = result.ratings[item.key];
    return `<div class="rubric-row"><div><strong>${esc(item.label)}</strong><small>${item.weight}% weight · ${esc(rating.refs.join(', '))}</small></div><div class="rubric-bar">${intelMeter(rating.rating, 5, false)}<b>${rating.rating}/5</b></div><p>${esc(rating.rationale)}</p></div>`;
  }).join('');
  const filters = niches.hardFilters.map(key => `<span class="${result.hardFilters[key].pass ? 'pass' : 'fail'}" title="${esc(result.hardFilters[key].note)}">${result.hardFilters[key].pass ? '✓' : '✕'} ${esc(key)}</span>`).join('');
  const reviewActions = evaluation.status === 'completed' && !evaluation.review?.familyId ? `${evaluation.review?.decision !== 'approved' ? action('Review niche', 'niche-review', evaluation.id, 'primary') : ''}${evaluation.review?.decision === 'approved' ? action('Create family from niche', 'niche-family', evaluation.id, 'primary') : ''}` : '';
  return `${head}
    ${evaluation.quality && !evaluation.quality.passed ? `<div class="checks"><strong>Blocked:</strong>${intelList(evaluation.quality.issues)}</div>` : ''}
    <div class="score-panel"><div class="score-dial ${esc(evaluation.decision)}"><b>${evaluation.score}</b><small>/100</small></div><div><strong class="decision-label">${esc(evaluation.decision.replaceAll('_', ' '))}</strong><p>${esc(result.positioning)}</p><small class="muted">The score is a decision aid computed by the program from the five ratings, not a probability. A failed hard filter always means "do not produce".</small></div></div>
    <div class="qc-checks">${filters}</div>
    ${rubric}
    <div class="bp-grid">
      <div class="bp-section"><span class="micro-label">20 episode ideas</span><ol class="episode-list">${result.episodeIdeas.map(item => `<li>${esc(item)}</li>`).join('')}</ol></div>
      <div class="bp-section"><span class="micro-label">Reasons to reject</span>${intelList(result.reasonsToReject)}<span class="micro-label">Recommended competitors</span>${result.recommendedCompetitorChannels?.length ? `<ul class="intel-list">${result.recommendedCompetitorChannels.map(item => `<li><a href="https://www.youtube.com/channel/${esc(item.channelId)}" target="_blank" rel="noopener noreferrer">${esc(item.title || item.channelId)}</a></li>`).join('')}</ul>` : '<p class="muted">None.</p>'}<span class="micro-label">Suggested style</span><p>${esc((state.styles.profiles.find(item => item.key === result.recommendedStyleKey) || {}).name || result.recommendedStyleKey)}</p><span class="micro-label">Family draft</span><p>${esc(result.familyDraft.name)} · ${esc(result.familyDraft.format)} · ${esc(result.familyDraft.countries.join(', '))}</p></div>
    </div>
    <p class="muted">${esc(result.summary)} · Confidence ${esc(result.confidence.level)}: ${esc(result.confidence.rationale)}</p>
    ${evaluation.review?.familyId ? `<div class="handoff-rule"><strong>Family created</strong><p>${esc(state.families.find(item => item.id === evaluation.review.familyId)?.name || 'Linked family')} was created from this niche.</p></div>` : ''}
    <div class="card-actions">${reviewActions}${retry}</div>`;
}

// ---------------------------------------------------------------- one dialog for every intelligence action
function intelDialog(kind, title, kicker, body, submitLabel, data = {}) {
  const form = document.getElementById('intel-form');
  form.reset();
  form.dataset.kind = kind;
  form.dataset.payload = JSON.stringify(data);
  document.getElementById('intel-heading').textContent = title;
  document.getElementById('intel-kicker').textContent = kicker;
  document.getElementById('intel-body').innerHTML = body;
  form.querySelector('.form-error').hidden = true;
  form.querySelector('[type=submit]').textContent = submitLabel;
  document.getElementById('intel-dialog').showModal();
}
function connectorSelect(name, provider, label, optional) {
  const items = intelConnectors(provider);
  // A tested connector is preselected; optional sources can still be switched off.
  return `<label>${label}<select name="${name}">${items.map(item => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('')}${optional || !items.length ? `<option value="">${optional ? 'Do not use' : 'No tested connector'}</option>` : ''}</select>${!items.length ? `<span class="hint">No tested ${esc(provider)} connector yet. Add and test one in Connections.</span>` : ''}</label>`;
}
function connectorPayload(form, name) {
  const id = form.elements[name]?.value;
  if (!id) return null;
  const connector = state.connectors.find(item => item.id === id);
  return connector ? {id: connector.id, revision: connector.revision} : null;
}
const nameField = (label = 'Your name', name = 'person') => `<label>${label}<input name="${name}" required minlength="2" maxlength="80" autocomplete="name"></label>`;

function intelAction(command, id, button) {
  const family = state.families.find(item => item.id === id);
  const familyData = family && state.intelligence.competitors.families[family.id];
  if (command === 'intel-picks-discard') { delete pendingPicks[id]; render(); return; }
  if (command === 'intel-picks-save') {
    const saved = state.intelligence.competitors.families[id].picks;
    return intelDialog('picks', 'Save your blend picks', 'WHAT TO LEARN FROM EACH CHANNEL', `<p class="hint">Saves revision ${saved.revision + 1} of the picks for ${esc(family.name)}. The next analysis learns each area only from the channels you picked for it. An approved blueprint made with the old picks stops steering your rooms until you approve a new one.</p><div class="form-grid">${nameField()}</div>`, 'Save blend', {familyId: id, expectedRevision: saved.revision});
  }
  if (command === 'intel-caps') {
    const quota = state.intelligence.competitors.quota.settings;
    return intelDialog('caps', 'Research data caps', 'SPEND LIMITS FOR OUTSIDE DATA', `<div class="form-grid"><label>NexLev requests per month<input name="nexlev" type="number" min="0" max="100000" step="1" required value="${quota.nexlevMonthlyRequestCap}"><span class="hint">Your NexLev plan has its own monthly allowance; keep this at or below it.</span></label><label>YouTube units per day<input name="youtube" type="number" min="0" max="10000" step="1" required value="${quota.youtubeDailyUnitCap}"><span class="hint">Google's default project quota is 10,000 units/day.</span></label></div>`, 'Save caps', {revision: quota.revision});
  }
  if (command === 'intel-settings') {
    const settings = familyData.settings, derived = settings.youtubeDerivedUse || {};
    return intelDialog('settings', `Scan settings · ${family.name}`, 'COMPETITOR INTELLIGENCE', `<div class="form-grid">
      <label>Recent videos per channel<input name="recentVideos" type="number" min="10" max="50" required value="${settings.recentVideos}"></label>
      <label>Transcripts per channel<input name="transcriptsPerChannel" type="number" min="0" max="5" required value="${settings.transcriptsPerChannel}"><span class="hint">Read through NexLev to learn structure and pacing. Never reused as wording.</span></label>
      <label>Analysis token limit<input name="analysisTokenLimit" type="number" min="8000" max="120000" step="1000" required value="${settings.analysisTokenLimit}"><span class="hint">Reserved from the family's monthly token limit for each analysis.</span></label>
      <label class="checkbox-label"><input type="checkbox" name="useOutliers" ${settings.useOutliers ? 'checked' : ''}>Find outlier videos (1 extra NexLev request per channel)</label>
      <fieldset class="editor-section full"><legend>YouTube derived-data approval</legend><p class="hint">By default YouTube API data about other channels is shown but never scored or sent to Claude. Only tick this if YouTube has approved your project for derived metrics.</p>
        <label class="checkbox-label"><input type="checkbox" name="derivedApproved" ${derived.approved ? 'checked' : ''}>YouTube approved this project for derived metrics</label>
        <div class="form-grid"><label>Approval date<input name="derivedOn" type="date" value="${esc(derived.approvedOn || '')}"></label><label>Approval reference<input name="derivedReference" maxlength="300" value="${esc(derived.reference || '')}"></label>${nameField('Confirmed by', 'derivedBy')}</div></fieldset>
    </div>`, 'Save settings', {familyId: family.id, revision: settings.revision});
  }
  if (command === 'intel-note') {
    const familyId = competitorFamily, f = state.families.find(item => item.id === familyId), notes = state.intelligence.competitors.families[familyId].notes.filter(item => item.competitorKey === id), latest = notes.at(-1) || {};
    const competitor = f.competitors.find(item => competitorKeyOf(item) === id);
    const area = (name, label, hint) => `<label class="full">${label}<textarea name="${name}" rows="2" maxlength="1500" placeholder="${esc(hint)}">${esc(latest[name] || '')}</textarea></label>`;
    return intelDialog('note', `Observations · ${competitorLabel(competitor)}`, 'YOUR OWN EVIDENCE', `<p class="hint">Watch a few of their videos and note what you see. Describe techniques in your own words; these notes go to Claude and become part of the copy guard.</p><div class="form-grid">
      ${area('editingStyle', 'Editing style', 'Cut rhythm, transitions, motion, on-screen text…')}${area('voice', 'Voice-over', 'Tone, pace, accent, energy…')}${area('visuals', 'Visuals', 'Stock, AI, maps, characters…')}${area('thumbnails', 'Thumbnails and titles', 'Colours, faces, text, promise…')}${area('script', 'Script and structure', 'Hook style, chapters, payoff, CTA…')}${area('strengths', 'Strengths', 'What they do well')}${area('weaknesses', 'Weaknesses and gaps', 'What viewers miss or complain about')}${nameField()}</div>`, 'Save observations', {familyId, competitorKey: id, expectedRevision: latest.revision || 0});
  }
  if (command === 'intel-scan') {
    const settings = familyData.settings, n = family.competitors.length;
    return intelDialog('scan', `Scan ${n} competitor${n === 1 ? '' : 's'} · ${family.name}`, 'EXPLICIT DATA REQUEST', `<div class="form-grid">${connectorSelect('nexlev', 'nexlev', 'NexLev connector', true)}${connectorSelect('youtube', 'youtube', 'YouTube public research', true)}</div>
      <p class="note">Planned at most ${n * (1 + (settings.useOutliers ? 1 : 0) + (settings.transcriptsPerChannel ? 1 : 0))} NexLev requests and ${n * 3} YouTube units, reserved against your caps before anything is sent. No automatic retries.</p><div class="form-grid">${nameField()}</div>`, 'Run scan', {familyId: family.id, familyRevision: family.revision});
  }
  if (command === 'intel-analyze') {
    const scan = familyData.scans.find(item => ['completed', 'partial'].includes(item.status));
    if (!scan) return toast('Run a scan that completes before asking Claude for a blueprint.', true);
    return intelDialog('analyze', `Blueprint · ${family.name}`, 'CLAUDE · TECHNIQUES, NOT COPIES', `<p class="hint">Uses the scan from ${esc(date(scan.createdAt))} and your saved observations. Reserves up to ${intelNumber(familyData.settings.analysisTokenLimit)} tokens from the family's monthly limit.</p><div class="form-grid">${connectorSelect('claude', 'ai', 'Claude connection', false)}${nameField()}</div>`, 'Ask Claude', {familyId: family.id, familyRevision: family.revision, scanId: scan.id});
  }
  if (command === 'intel-review' || command === 'intel-revoke') {
    const revoke = command === 'intel-revoke';
    return intelDialog('review', revoke ? 'Revoke blueprint approval' : 'Review competitor blueprint', 'HUMAN APPROVAL GATE', `${revoke ? '' : `<div class="form-grid"><label>Decision<select name="decision"><option value="approve">Approve</option><option value="reject">Reject</option></select></label></div>
      <label class="checkbox-label"><input type="checkbox" name="techniquesNotCopied">It learns techniques and copies no wording, footage, thumbnails or channel identity.</label>
      <label class="checkbox-label"><input type="checkbox" name="balanceAccepted">The 30% reference / 70% original balance is acceptable for this family.</label>
      <label class="checkbox-label"><input type="checkbox" name="recommendationsReviewed">I reviewed every recommendation and its evidence references.</label>`}
      <div class="form-grid">${nameField('Reviewer name', 'person')}<label>${revoke ? 'Reason' : 'Notes'}<input name="notes" maxlength="2000" ${revoke ? 'required minlength="8"' : ''}></label></div>`, revoke ? 'Revoke approval' : 'Record decision', {id, revoke});
  }
  if (command === 'intel-study') return intelDialog('study', `Study a reference · ${family.name}`, 'LEARN A LOOK · TECHNIQUES, NOT COPIES', `<div class="form-grid">
      <label class="full">Path on this PC<input name="path" required maxlength="400" placeholder="C:\\Users\\you\\Videos\\reference.mp4"><span class="hint">A video file (mp4, mov, mkv, webm), one screenshot, or a folder of up to 12 screenshots. In File Explorer: hold Shift, right-click the file or folder, choose "Copy as path", then paste here. Nothing is uploaded or downloaded.</span></label>
      <label>Reference title<input name="title" required minlength="2" maxlength="160"></label><label>Channel <span class="hint">optional</span><input name="channel" maxlength="80"></label>
      <label class="full">Link <span class="hint">optional, kept for your record only</span><input name="link" maxlength="300" placeholder="https://www.youtube.com/watch?v=…"></label>
      <label class="full">What you like about it <span class="hint">optional</span><textarea name="notes" rows="2" maxlength="1500"></textarea></label>
      ${connectorSelect('claude', 'ai', 'Claude connection')}${nameField()}</div>
      <p class="note">Reserves about 13,000-16,000 tokens from this family's monthly limit before anything is sent. Claude is asked once; no automatic retries.</p>`, 'Study it', {familyId: family.id});
  if (command === 'intel-study-retry') { const item = state.styleStudies.studies.find(entry => entry.id === id); return intelDialog('study-retry', 'Retry the study', 'CLAUDE · ONE MORE ATTEMPT', `<p class="hint">Attempt ${item.attempts + 1} of 3.</p>${item.status === 'interrupted' ? '<label class="checkbox-label"><input type="checkbox" name="confirmInterrupted">The last attempt was interrupted and may have used tokens. Retry anyway.</label>' : ''}`, 'Retry', {id}); }
  if (command === 'intel-study-review') return intelDialog('study-review', 'Review the style study', 'HUMAN APPROVAL GATE', `<div class="form-grid"><label>Decision<select name="decision"><option value="approved">Approve</option><option value="rejected">Reject</option></select></label></div>
      <label class="checkbox-label"><input type="checkbox" name="techniquesOnly">It learns techniques only: no channel identity, characters, mascots, drawings or wording.</label>
      <label class="checkbox-label"><input type="checkbox" name="balance">The 30% reference / 70% our own balance is acceptable.</label>
      <label class="checkbox-label"><input type="checkbox" name="reviewed">I read the whole study, including the planning brief.</label>
      <div class="form-grid">${nameField('Reviewer name', 'person')}<label>Reason <span class="hint">needed to reject</span><input name="reason" maxlength="500"></label></div>`, 'Record decision', {id});
  if (command === 'intel-study-draft') return intelDialog('study-draft', 'Create a style draft from the study', 'STYLE LIBRARY', '<p class="hint">Starts from the launch style the study maps onto and applies its palette, shot lengths, transitions, look and planning brief (changes that do not pass the Style Library checks are skipped and listed). It is saved as a new draft that you still review, approve and assign in the Style Library.</p><div class="form-grid">' + nameField() + '</div>', 'Create draft', {id});
  if (command === 'intel-style-draft') return intelDialog('style-draft', 'Create a style draft', 'STYLE LIBRARY', '<p class="hint">Copies the recommended style\'s latest approved revision, applies the proposed adjustments that pass validation, and saves it as a new draft. You still approve and assign it in Production panel → Style Library.</p><div class="form-grid">' + nameField() + '</div>', 'Create draft', {id});
  if (command === 'intel-voice') {
    const direction = familyData?.voiceDirection;
    if (!direction) return toast('Approve a blueprint first.', true);
    productionFamily = family.id; productionRoom = 'voice'; location.hash = 'production';
    setTimeout(() => {
      voiceProfileDialog(family);
      const form = document.getElementById('voice-profile-form');
      if (!document.getElementById('voice-profile-dialog').open) return;
      form.elements.emotion.value = direction.emotion; form.elements.pace.value = direction.pace; form.elements.energy.value = direction.energy;
      form.elements.instructions.value = direction.instructions;
      toast('Narrator form prefilled from the approved blueprint. Review the rights fields and save to create a new profile revision.');
    }, 60);
    return;
  }
  if (command === 'intel-scan-retry' || command === 'intel-analysis-retry' || command === 'niche-discovery-retry' || command === 'niche-evaluation-retry') {
    const urls = {'intel-scan-retry': `/api/competitor-scans/${id}/retry`, 'intel-analysis-retry': `/api/competitor-analyses/${id}/retry`, 'niche-discovery-retry': `/api/niche-discoveries/${id}/retry`, 'niche-evaluation-retry': `/api/niche-evaluations/${id}/retry`};
    const find = [...Object.values(state.intelligence.competitors.families).flatMap(item => [...item.scans, ...item.analyses]), ...state.intelligence.niches.discoveries, ...state.intelligence.niches.evaluations].find(item => item.id === id);
    const unknown = find?.status === 'interrupted' || find?.usage?.status === 'unknown' || Object.values(find?.usage || {}).some(item => item?.status === 'unknown');
    if (unknown && !confirm('The last attempt was interrupted, so provider usage may already have been charged. Deliberately retry?')) return;
    button.disabled = true;
    return api(urls[command], {confirmInterrupted: unknown}).then(refresh).then(() => toast('Deliberately requeued.')).catch(error => toast(error.message, true)).finally(() => { button.disabled = false; });
  }
  // Niche Factory
  if (command === 'niche-new' || command === 'niche-edit') {
    const idea = state.intelligence.niches.ideas.find(item => item.id === id) || {title: '', description: '', audience: '', countries: [], formats: ['long-form'], keywords: [], seedChannels: [], notes: ''};
    return intelDialog('idea', idea.id ? 'Edit niche idea' : 'New niche idea', 'YOUR NICHE IDEA', `<div class="form-grid">
      <label class="full">Niche title<input name="title" required minlength="3" maxlength="120" value="${esc(idea.title)}" placeholder="e.g. Stone Age money"></label>
      <label class="full">Description<textarea name="description" required minlength="10" maxlength="2000" rows="3" placeholder="What the channel explains and why it is different">${esc(idea.description)}</textarea></label>
      <label class="full">Audience<input name="audience" maxlength="1000" value="${esc(idea.audience)}"></label>
      <label>Target countries <span class="hint">Comma-separated</span><input name="countries" value="${esc(idea.countries.join(', '))}"></label>
      <div><span class="field-label">Formats</span><div class="check-grid"><label class="check-chip"><input type="checkbox" name="formats" value="long-form" ${idea.formats.includes('long-form') ? 'checked' : ''}> Long-form</label><label class="check-chip"><input type="checkbox" name="formats" value="shorts" ${idea.formats.includes('shorts') ? 'checked' : ''}> Shorts</label></div></div>
      <label class="full">Search keywords <span class="hint">Up to 5, comma-separated. The first 3 are searched in NexLev.</span><input name="keywords" value="${esc(idea.keywords.join(', '))}"></label>
      <label class="full">Seed channels <span class="hint">Up to 5 channels that represent the niche: @handle, UC… ID or channel link (one per line).</span><textarea name="seedChannels" rows="2">${esc(idea.seedChannels.map(item => item.url).join('\n'))}</textarea></label>
      <label class="full">Notes<textarea name="notes" maxlength="2000" rows="2">${esc(idea.notes)}</textarea></label>${nameField()}</div>`, 'Save idea', {id: idea.id || null, revision: idea.revision || null});
  }
  if (command === 'niche-open') { selectedIdea = id; render(); document.querySelector('.intel-grid')?.scrollIntoView({block: 'start'}); return; }
  if (command === 'niche-archive') {
    const idea = state.intelligence.niches.ideas.find(item => item.id === id);
    button.disabled = true;
    return api(`/api/niche-ideas/${id}/archive`, {revision: idea.revision, archived: idea.status !== 'archived'}).then(refresh).catch(error => toast(error.message, true)).finally(() => { button.disabled = false; });
  }
  if (command === 'niche-settings') {
    const settings = state.intelligence.niches.settings;
    return intelDialog('niche-settings', 'Niche Factory settings', 'GLOBAL LIMITS', `<div class="form-grid">
      <label>Monthly token limit<input name="monthlyTokenLimit" type="number" min="0" max="5000000" required value="${settings.monthlyTokenLimit}"></label>
      <label>Tokens per evaluation<input name="evaluationTokenLimit" type="number" min="8000" max="80000" step="1000" required value="${settings.evaluationTokenLimit}"></label>
      <label>Similar-channel depth<select name="similarLevel"><option value="1" ${settings.similarLevel === 1 ? 'selected' : ''}>1 (direct)</option><option value="2" ${settings.similarLevel === 2 ? 'selected' : ''}>2 (wider)</option></select></label>
      <label>Results per keyword<input name="keywordResults" type="number" min="10" max="50" required value="${settings.keywordResults}"></label>
      <label>Channels to estimate<input name="analyticsTopChannels" type="number" min="0" max="5" required value="${settings.analyticsTopChannels}"><span class="hint">1 NexLev request each.</span></label></div>`, 'Save settings', {revision: settings.revision});
  }
  if (command === 'niche-discover') {
    const idea = state.intelligence.niches.ideas.find(item => item.id === id), settings = state.intelligence.niches.settings;
    const planned = idea.seedChannels.length * 2 + Math.min(3, idea.keywords.length) + settings.analyticsTopChannels + idea.seedChannels.filter(item => item.kind === 'username').length;
    return intelDialog('discover', `Discover · ${idea.title}`, 'EXPLICIT NEXLEV REQUEST', `<div class="form-grid">${connectorSelect('nexlev', 'nexlev', 'NexLev connector', false)}${connectorSelect('youtube', 'youtube', 'YouTube (only to resolve @handles)', true)}</div><p class="note">Planned at most ${planned} NexLev request${planned === 1 ? '' : 's'}: niche overview and similar channels per seed, one search per keyword, and analytics estimates for the top channels.</p><div class="form-grid">${nameField()}</div>`, 'Run discovery', {ideaId: idea.id, ideaRevision: idea.revision});
  }
  if (command === 'niche-evaluate') {
    const idea = state.intelligence.niches.ideas.find(item => item.id === id), discovery = state.intelligence.niches.discoveries.find(item => item.ideaId === id && ['completed', 'partial'].includes(item.status) && item.ideaRevision === idea.revision);
    return intelDialog('evaluate', `Evaluate · ${idea.title}`, 'CLAUDE · RUBRIC', `<p class="hint">${discovery ? `Uses the discovery from ${esc(date(discovery.createdAt))}.` : 'No current discovery: Claude will judge your idea text alone, so confidence will be low.'} Reserves up to ${intelNumber(state.intelligence.niches.settings.evaluationTokenLimit)} tokens.</p><div class="form-grid">${connectorSelect('claude', 'ai', 'Claude connection', false)}${nameField()}</div>`, 'Ask Claude', {ideaId: idea.id, ideaRevision: idea.revision, discoveryId: discovery?.id || null});
  }
  if (command === 'niche-review') {
    return intelDialog('niche-review', 'Review niche', 'HUMAN DECISION', `<div class="form-grid"><label>Decision<select name="decision"><option value="shortlist">Shortlist</option><option value="approve">Approve for a family</option><option value="reject">Reject</option></select></label>${nameField('Reviewer name')}<label class="full">Notes <span class="hint">Required when rejecting.</span><input name="notes" maxlength="2000"></label></div>
      <label class="checkbox-label"><input type="checkbox" name="evidenceReviewed">I reviewed the evidence behind every rating (needed to approve).</label>
      <label class="checkbox-label"><input type="checkbox" name="estimatesUnderstood">I understand NexLev figures are estimates, not guaranteed results (needed to approve).</label>`, 'Record decision', {id});
  }
  if (command === 'niche-family') {
    const evaluation = state.intelligence.niches.evaluations.find(item => item.id === id), draft = evaluation.result.familyDraft;
    familyDialog();
    const form = document.getElementById('family-form');
    form.dataset.nicheEvaluationId = id;
    form.elements.name.value = draft.name; form.elements.audience.value = draft.audience; form.elements.niche.value = `${draft.niche}\n${evaluation.result.positioning}`.slice(0, 1000);
    form.elements.countries.value = draft.countries.join(', '); form.elements.format.value = draft.format;
    form.elements.competitors.value = (evaluation.result.recommendedCompetitorChannels || []).map(item => `https://www.youtube.com/channel/${item.channelId}`).join('\n');
    toast('Family form prefilled from the approved niche. Check every field before saving.');
    return;
  }
  return toast('Unknown action.', true);
}

document.getElementById('intel-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget, kind = form.dataset.kind, data = JSON.parse(form.dataset.payload || '{}');
  const value = name => form.elements[name]?.value;
  const checked = name => !!form.elements[name]?.checked;
  const number = name => Number(value(name));
  let message = null;
  saveForm(form, async () => {
    if (kind === 'picks') { const result = await api(`/api/families/${data.familyId}/competitor-picks`, {expectedRevision: data.expectedRevision, createdBy: value('person'), picks: pendingPicks[data.familyId] || {}}); delete pendingPicks[data.familyId]; return result; }
    if (kind === 'caps') return api('/api/quota-settings', {revision: data.revision, nexlevMonthlyRequestCap: number('nexlev'), youtubeDailyUnitCap: number('youtube')});
    if (kind === 'settings') return api(`/api/families/${data.familyId}/competitor-settings`, {revision: data.revision, recentVideos: number('recentVideos'), transcriptsPerChannel: number('transcriptsPerChannel'), analysisTokenLimit: number('analysisTokenLimit'), useOutliers: checked('useOutliers'), youtubeDerivedUse: checked('derivedApproved') ? {approved: true, approvedOn: value('derivedOn'), reference: value('derivedReference'), confirmedBy: value('derivedBy')} : {approved: false}});
    if (kind === 'note') return api(`/api/families/${data.familyId}/competitor-notes`, {competitorKey: data.competitorKey, expectedRevision: data.expectedRevision, createdBy: value('person'), editingStyle: value('editingStyle'), voice: value('voice'), visuals: value('visuals'), thumbnails: value('thumbnails'), script: value('script'), strengths: value('strengths'), weaknesses: value('weaknesses')});
    if (kind === 'scan') return api(`/api/families/${data.familyId}/competitor-scans`, {familyRevision: data.familyRevision, requestedBy: value('person'), nexlevConnector: connectorPayload(form, 'nexlev'), youtubeConnector: connectorPayload(form, 'youtube')});
    if (kind === 'analyze') { const analysis = await api(`/api/families/${data.familyId}/competitor-analyses`, {familyRevision: data.familyRevision, scanId: data.scanId, connector: connectorPayload(form, 'claude'), requestedBy: value('person')}); selectedAnalysis = analysis.id; return analysis; }
    if (kind === 'review') return api(`/api/competitor-analyses/${data.id}/review`, data.revoke ? {decision: 'reject', reviewer: value('person'), notes: value('notes')} : {decision: value('decision'), reviewer: value('person'), notes: value('notes'), confirmations: {techniquesNotCopied: checked('techniquesNotCopied'), balanceAccepted: checked('balanceAccepted'), recommendationsReviewed: checked('recommendationsReviewed')}});
    if (kind === 'study') return api(`/api/families/${data.familyId}/style-studies`, {path: value('path'), title: value('title'), channel: value('channel') || undefined, link: value('link') || undefined, notes: value('notes') || undefined, connector: connectorPayload(form, 'claude'), createdBy: value('person')});
    if (kind === 'study-retry') return api(`/api/style-studies/${data.id}/retry`, {confirmInterrupted: checked('confirmInterrupted')});
    if (kind === 'study-review') return api(`/api/style-studies/${data.id}/review`, {decision: value('decision'), reviewer: value('person'), techniquesOnly: checked('techniquesOnly'), balance: checked('balance'), reviewed: checked('reviewed'), ...(value('reason') ? {reason: value('reason')} : {})});
    if (kind === 'study-draft') { const result = await api(`/api/style-studies/${data.id}/style-draft`, {createdBy: value('person')}); message = `Style draft "${result.revision.spec.name}" created in the Style Library.${result.skipped.length ? ` ${result.skipped.length} change(s) skipped.` : ''}`; return result; }
    if (kind === 'style-draft') { const result = await api(`/api/competitor-analyses/${data.id}/style-draft`, {createdBy: value('person')}); message = `Style draft "${result.revision.spec.name}" created in the Style Library.${result.skipped.length ? ` ${result.skipped.length} adjustment(s) were skipped by validation.` : ''}`; return result; }
    if (kind === 'idea') {
      const list = (name, separator) => value(name).split(separator).map(item => item.trim()).filter(Boolean);
      const body = {title: value('title'), description: value('description'), audience: value('audience'), countries: list('countries', ','), formats: [...form.querySelectorAll('input[name="formats"]:checked')].map(input => input.value), keywords: list('keywords', ','), seedChannels: list('seedChannels', /[\s,]+/), notes: value('notes'), createdBy: value('person')};
      const idea = data.id ? await api(`/api/niche-ideas/${data.id}`, {...body, revision: data.revision}, 'PUT') : await api('/api/niche-ideas', body);
      selectedIdea = idea.id; return idea;
    }
    if (kind === 'niche-settings') return api('/api/niche-settings', {revision: data.revision, monthlyTokenLimit: number('monthlyTokenLimit'), evaluationTokenLimit: number('evaluationTokenLimit'), similarLevel: number('similarLevel'), keywordResults: number('keywordResults'), analyticsTopChannels: number('analyticsTopChannels')});
    if (kind === 'discover') return api(`/api/niche-ideas/${data.ideaId}/discoveries`, {ideaRevision: data.ideaRevision, requestedBy: value('person'), nexlevConnector: connectorPayload(form, 'nexlev'), youtubeConnector: connectorPayload(form, 'youtube')});
    if (kind === 'evaluate') return api(`/api/niche-ideas/${data.ideaId}/evaluations`, {ideaRevision: data.ideaRevision, discoveryId: data.discoveryId, connector: connectorPayload(form, 'claude'), requestedBy: value('person')});
    if (kind === 'niche-review') return api(`/api/niche-evaluations/${data.id}/review`, {decision: value('decision'), reviewer: value('person'), notes: value('notes'), confirmations: {evidenceReviewed: checked('evidenceReviewed'), estimatesUnderstood: checked('estimatesUnderstood')}});
    throw new Error('Unknown form.');
  }, () => message);
});
document.addEventListener('change', event => { if (event.target.id === 'competitor-family') { competitorFamily = event.target.value; selectedAnalysis = ''; render(); } });
document.addEventListener('click', event => {
  const tab = event.target.closest('[data-select-analysis]');
  if (tab) { selectedAnalysis = tab.dataset.selectAnalysis; render(); return; }
  const chip = event.target.closest('[data-keep]');
  if (chip) {
    const familyId = competitorFamily, next = structuredClone(picksFor(familyId)), key = chip.dataset.keep, trait = chip.dataset.trait;
    const list = new Set(next[key] || []);
    if (list.has(trait)) list.delete(trait); else list.add(trait);
    const order = Object.keys(state.intelligence.competitors.traits);
    if (list.size) next[key] = order.filter(item => list.has(item)); else delete next[key];
    pendingPicks[familyId] = next;
    render();
  }
});
