'use strict';
// Room 04 - Scene & Visual Room (UI).
// Loaded before app.js. Helpers from app.js (state, esc, badge, action, api, refresh, toast, saveForm,
// date, money, render) and from intelligence.js (intelConnectors, intelMeter) are used only inside functions.

let sceneContentId = '', sceneShot = null, scenePoll = null;
const SCENE_PURPOSE = {hook: 'Hook', context: 'Context', explain: 'Explain', example: 'Example', evidence: 'Evidence', turn: 'Turn', recap: 'Recap', close: 'Close', 'call-to-action': 'Call to action'};
const SCENE_JOB = {queued: ['Queued', 'orange'], running: ['Running', 'orange'], completed: ['Done', 'green'], failed: ['Failed', 'gray'], interrupted: ['Interrupted · cost unknown', 'orange'], stale: ['Stale', 'gray'], blocked_quota: ['Hourly cap reached', 'orange'], blocked_budget: ['Over budget', 'orange'], quality_failed: ['Blocked by checks', 'orange'], usage_unknown: ['Usage unknown', 'orange'], budget_violation: ['Over token limit', 'orange']};
// What was already fixed before the owner sees the plan: shots Claude's continuity review redrew, and the
// continuity the program mended.
// The video's art direction (atelier shots design to it) and how the designs went.
const sceneDirection = plan => {
  const d = plan.direction;
  if (!d) return '';
  const swatch = color => `<span class="swatch-chip">${esc(color)}</span>`;
  return `<details class="scene-warnings"><summary>Art direction · ${esc(d.read.slice(0, 80))}${d.read.length > 80 ? '…' : ''}</summary><ul class="intel-list"><li><b>Feel:</b> ${esc(d.read)}</li><li><b>Dials:</b> variety ${d.dials.variance}/10 · motion ${d.dials.motion}/10 · density ${d.dials.density}/10</li><li><b>Palette:</b> ${['canvas', 'ink', 'accent', 'support'].map(key => `${key} ${swatch(d.palette[key])}`).join(' ')}</li><li><b>Type:</b> ${esc(d.fonts.display)} / ${esc(d.fonts.body)} · <b>Motion:</b> ${esc(d.motion)}</li>${d.signature ? `<li><b>Signature:</b> ${esc(d.signature)}</li>` : ''}${d.avoid.length ? `<li><b>Avoid:</b> ${esc(d.avoid.join('; '))}</li>` : ''}${plan.compose ? `<li><b>Designed by Claude:</b> ${plan.compose.designed} of ${plan.compose.shots} atelier shots (${plan.compose.tokens.toLocaleString()} tokens)${plan.compose.notes.length ? ` · ${esc(plan.compose.notes.join(' '))}` : ''}</li>` : ''}</ul></details>`;
};
const sceneFixes = plan => {
  const fixed = [...(plan.review?.changes || []).map(item => `<li><b>${esc(item.label)}</b> redrawn by Claude's continuity review: ${esc(item.reason)}</li>`), ...(plan.continuity || []).map(item => `<li><b>${esc(item.label)}</b> ${esc(item.fix)} (fixed by the program)</li>`)];
  return (fixed.length ? `<details class="scene-warnings"><summary>${fixed.length} fixed before you saw it</summary><ul class="intel-list">${fixed.join('')}</ul></details>` : '') + (plan.review?.notes?.length ? `<p class="inline-warning">${esc(plan.review.notes.join(' '))}</p>` : '');
};
const sceneJobBadge = status => { const [label, color] = SCENE_JOB[status] || [status, 'gray']; return badge(label, color); };
// Where a plan's tokens went: what Claude read, its thinking before it answers, and the answer (estimated).
const sceneTokenSplit = job => {
  const t = job.quality?.tokens;
  if (t) return ` (read ${t.read.toLocaleString()} · thought about ${t.thinking.toLocaleString()} · answered about ${t.answer.toLocaleString()})`;
  return Number.isSafeInteger(job.usage?.prompt) && Number.isSafeInteger(job.usage?.completion) ? ` (read ${job.usage.prompt.toLocaleString()} · wrote ${job.usage.completion.toLocaleString()}, thinking and answer together)` : '';
};
const SCENE_PROVIDER = {pexels: 'Pexels', pixabay: 'Pixabay', openai: 'OpenAI'};
const sceneProvider = value => SCENE_PROVIDER[value] || value;
const sceneClock = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const sceneSeconds = seconds => `${Number(seconds).toFixed(1)} s`;
function scenePerson() { try { return localStorage.getItem('control-room-person') || ''; } catch { return ''; } }
function sceneRemember(name) { try { if (name) localStorage.setItem('control-room-person', name); } catch { /* storage is optional */ } }
const scenePersonField = (label = 'Your name', name = 'person') => `<label>${label}<input name="${name}" required minlength="2" maxlength="80" autocomplete="name" value="${esc(scenePerson())}"></label>`;
function sceneContent(id = sceneContentId) { return state.scenes?.contents.find(item => item.contentId === id) || null; }
function sceneLatest(content) { return content?.manifests.find(item => item.latest) || null; }
function sceneShots(manifest) { return manifest ? manifest.plan.scenes.flatMap(scene => scene.shots.map(shot => ({...shot, scene}))) : []; }
function sceneAsset(content, id) { return content.assets.find(item => item.id === id) || null; }
function sceneActiveJobs(content, shotId = null) { return content.jobs.filter(job => ['queued', 'running'].includes(job.status) && (!shotId || job.shotId === shotId)); }
function sceneBusy() {
  const contents = state?.scenes?.contents || [];
  return contents.some(content => content.planJobs.some(job => ['queued', 'running'].includes(job.status)) || sceneActiveJobs(content).length);
}
function sceneSpec(content) { const found = typeof styleRevisionById === 'function' ? styleRevisionById(content.inputs.style.revisionId) : null; return found?.revision.spec || null; }
function sceneNarration(manifest, scene) { return manifest.plan.sentences.slice(scene.sentenceStart - 1, scene.sentenceEnd).map(item => item.text).join(' '); }
function sceneConnectorOptions(provider, optional = false) {
  const items = intelConnectors(provider);
  return `${items.map(item => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('')}${optional || !items.length ? `<option value="">${optional ? 'Do not use' : 'No tested connector'}</option>` : ''}`;
}
function sceneConnectorRef(id) { const connector = state.connectors.find(item => item.id === id); return connector ? {id: connector.id, revision: connector.revision} : null; }

// ---------------------------------------------------------------- room view
function sceneRoomView(family) {
  const contents = (state.scenes?.contents || []).filter(item => item.familyId === family.id);
  if (!contents.length) return `<section class="voice-hero"><div><span class="stage-kicker">ROOM 04 · SCENES & VISUALS</span><h2>Scene & Visual Room</h2><p>Turns an approved script and its approved narration into scenes and shots, then finds one rights-recorded visual per shot from stock libraries or AI.</p></div></section><div class="production-empty"><span class="empty-icon">▣</span><h2>No approved script yet</h2><p>Approve a script in Content Studio, approve its narration in the Voice Room and assign a style to ${esc(family.name)}. Then plan its scenes here.</p><a class="button secondary" href="#studio">Open Content Studio</a></div>`;
  if (!contents.some(item => item.contentId === sceneContentId)) sceneContentId = contents[0].contentId;
  const content = sceneContent(), manifest = sceneLatest(content), usage = state.scenes.usage[family.id], quota = state.scenes.quota;
  const shots = sceneShots(manifest), filled = shots.filter(shot => content.selections[shot.id]).length;
  const ready = content.inputs.ready;
  const picker = contents.length > 1 ? `<div class="production-toolbar scene-toolbar"><div><label for="scene-content">Approved script</label><select id="scene-content">${contents.map(item => `<option value="${item.contentId}" ${item.contentId === content.contentId ? 'selected' : ''}>${esc(item.title)} · v${item.contentRevision}</option>`).join('')}</select></div></div>` : '';
  return `<section class="voice-hero"><div><span class="stage-kicker">ROOM 04 · SCENES & VISUALS</span><h2>Scene & Visual Room</h2><p>Plan scenes from the approved narration, then pick one rights-recorded visual per shot from Pexels, Pixabay or AI images. Nothing is bought or used until you approve it.</p></div><div class="voice-health"><span class="health-light ${content.handoff.ready ? 'ready' : ''}"></span><strong>${content.handoff.ready ? 'Visuals approved' : ready ? 'Inputs ready' : 'Setup required'}</strong><small>${esc(content.handoff.ready ? `${content.handoff.shots} shots handed to editing` : ready ? 'Script, narration and style are locked' : content.inputs.blockers[0])}</small></div></section>
    ${picker}
    <div class="production-kpis"><div><span>Scenes</span><strong>${manifest ? manifest.sceneCount : '—'}</strong><small>${manifest ? `${sceneClock(manifest.narrationSeconds)} narration` : 'No plan yet'}</small></div><div><span>Shots with a visual</span><strong>${manifest ? `${filled}/${shots.length}` : '—'}</strong><small>${manifest ? `${Math.round(filled / Math.max(1, shots.length) * 100)}% of shots ready` : ''}</small></div><div><span>AI images ${esc(usage.period)}</span><strong>${money(usage.settledCents + usage.reservedCents)}</strong><small>of ${money(usage.budgetCents)} budget · ${usage.images} image${usage.images === 1 ? '' : 's'}</small></div><div><span>Stock requests this hour</span><strong>${quota.pexels.used + quota.pixabay.used}</strong><small>Pexels ${quota.pexels.used}/${quota.pexels.cap} · Pixabay ${quota.pixabay.used}/${quota.pixabay.cap}</small></div></div>
    <div class="scene-cards">${sceneInputsCard(content)}${manifest ? sceneBatchCard(content, manifest, family) + sceneApprovalCard(content, manifest) : ''}</div>
    ${manifest ? scenePlanCard(content, manifest) : sceneEmptyPlan(content)}`;
}

function sceneInputsCard(content) {
  const inputs = content.inputs, row = (ok, title, detail) => `<div class="handoff-record"><span>${ok ? '✓' : '○'}</span><div><strong>${title}</strong><p>${detail}</p></div></div>`;
  const planJobs = content.planJobs.map(job => `<div class="history-row"><span class="job-dot ${['queued', 'running'].includes(job.status) ? 'queued' : job.status === 'completed' ? 'completed' : ''}"></span><div><strong>${sceneJobBadge(job.status)} Claude plan · ${esc(date(job.createdAt))}</strong><small>Attempt ${job.attempts}/3${job.usage?.total ? ` · ${job.usage.total.toLocaleString()} tokens${sceneTokenSplit(job)}` : ''}${job.error ? ` · ${esc(job.error)}` : ''}</small></div>${['failed', 'interrupted', 'quality_failed', 'blocked_budget', 'usage_unknown', 'stale'].includes(job.status) && job.attempts < 3 ? action('Retry deliberately', 'scene-plan-retry', job.id, 'text-button') : ''}</div>`).join('');
  return `<section class="production-card"><div class="production-card-head"><div><span class="micro-label">INPUTS & GATE</span><h2>Locked inputs</h2></div>${badge(inputs.ready ? 'Ready' : 'Blocked', inputs.ready ? 'green' : 'gray')}</div>
    ${row(content.contentState === 'approved', `Approved script v${content.contentRevision}`, esc(content.title))}
    ${row(inputs.voice.ready, 'Approved narration', inputs.voice.ready ? `${sceneClock(inputs.voice.durationSeconds)} · timing source for every scene` : esc(inputs.voice.blocker || 'Approve a narration in the Voice Room.'))}
    ${row(inputs.style.ready, inputs.style.ready ? `${esc(inputs.style.name)} r${inputs.style.revision}` : 'Family style', inputs.style.ready ? `Sources: ${esc(inputs.sources.map(styleLabel).join(', '))}` : esc(inputs.style.blocker || 'Assign a style in Room 03.'))}
    <div class="card-actions">${inputs.ready ? action('Split narration (free)', 'scene-plan-rules', content.contentId, 'secondary') + action('Plan with Claude', 'scene-plan-claude', content.contentId, 'primary') : ''}</div>
    ${planJobs ? `<div class="history-list">${planJobs}</div>` : ''}</section>`;
}
function sceneEmptyPlan(content) {
  return `<section class="production-card"><div class="production-empty compact"><h3>No scene plan yet</h3><p>${content.inputs.ready ? 'Start with the free narration split (whole sentences grouped to the style\'s scene length) or ask Claude to direct scenes and shots. You can edit every scene and shot afterwards.' : esc(content.inputs.blockers.join(' '))}</p></div></section>`;
}

function scenePlanCard(content, manifest) {
  const statusColor = {approved: 'green', draft: 'orange', rejected: 'gray', superseded: 'gray'}[manifest.status] || 'gray';
  const history = content.manifests.map(item => `<li><b>r${item.revision}</b> ${esc(item.status)} · ${esc(item.source)} · ${esc(item.changeNote)} · ${esc(item.createdBy)} · ${esc(date(item.createdAt))}${item.review ? ` · ${esc(item.review.decision)} by ${esc(item.review.reviewer)}` : ''}</li>`).join('');
  const actions = [
    manifest.scope.current && manifest.status === 'draft' ? action('Review plan', 'scene-review', manifest.id, 'primary') : '',
    !manifest.scope.current && manifest.contentRevision === content.contentRevision ? action('Refresh for current narration and style', 'scene-refresh', manifest.id, 'primary') : '',
    action('Visual settings', 'scene-settings', content.familyId, 'secondary'),
  ].join('');
  return `<section class="production-card"><div class="production-card-head"><div><span class="micro-label">SCENE PLAN · REVISION ${manifest.revision}</span><h2>${esc(content.title)}</h2></div><div class="row-end">${badge(manifest.status === 'approved' ? 'Plan approved' : manifest.status, statusColor)}${badge(manifest.source === 'claude' ? 'Claude' : manifest.source === 'hermes' ? 'Earlier AI planner' : manifest.source === 'rules' ? 'Narration split' : 'Edited')}</div></div>
    ${!manifest.scope.current ? `<p class="inline-warning">${esc(manifest.scope.issues.join(' '))}</p>` : ''}
    ${manifest.issues.length ? `<div class="checks"><strong>Fix before approval</strong><ul>${manifest.issues.map(item => `<li>${esc(item)}</li>`).join('')}</ul></div>` : ''}
    ${manifest.warnings.length ? `<details class="scene-warnings"><summary>${manifest.warnings.length} warning${manifest.warnings.length === 1 ? '' : 's'}</summary><ul class="intel-list">${manifest.warnings.map(item => `<li>${esc(item)}</li>`).join('')}</ul></details>` : ''}
    ${sceneDirection(manifest.plan)}${sceneFixes(manifest.plan)}
    ${manifest.plan.summary ? `<p class="muted">${esc(manifest.plan.summary)}</p>` : ''}
    ${manifest.plan.cast?.length ? `<p class="muted"><strong>Cast:</strong> ${manifest.plan.cast.map(member => esc(`${member.name}${member.role ? ` (${member.role})` : ''}`)).join(' · ')}</p>` : ''}
    <p class="hint">${esc(manifest.plan.timing.note)} Every edit creates a new revision; untouched shots keep their IDs and visuals.</p>
    <div class="card-actions">${actions}</div>
    <details class="scene-history"><summary>Revision history (${content.manifests.length})</summary><ul class="intel-list">${history}</ul></details>
    <div class="scene-board">${manifest.plan.scenes.map(scene => sceneRow(content, manifest, scene)).join('')}</div></section>`;
}
function sceneRow(content, manifest, scene) {
  const editable = manifest.scope.current;
  const last = manifest.plan.scenes.at(-1).id === scene.id;
  return `<article class="scene-row"><div class="scene-head"><span class="room-number">${esc(scene.label)}</span><div><strong>${esc(SCENE_PURPOSE[scene.purpose] || scene.purpose)} · ${sceneClock(scene.startSeconds)}–${sceneClock(scene.startSeconds + scene.durationSeconds)}</strong><small>${sceneSeconds(scene.durationSeconds)} · sentence${scene.sentenceStart === scene.sentenceEnd ? ` ${scene.sentenceStart}` : `s ${scene.sentenceStart}–${scene.sentenceEnd}`} · ${scene.shots.length} shot${scene.shots.length === 1 ? '' : 's'}</small></div>
      ${editable ? `<div class="scene-tools">${action('Edit', 'scene-edit', scene.id, 'text-button')}${scene.sentenceEnd > scene.sentenceStart ? action('Split', 'scene-split', scene.id, 'text-button') : ''}${!last ? action('Merge next', 'scene-merge', scene.id, 'text-button') : ''}${scene.shots.length < 8 ? action('+ Shot', 'scene-add-shot', scene.id, 'text-button') : ''}</div>` : ''}</div>
    <p class="scene-narration">${esc(sceneNarration(manifest, scene))}</p>
    ${scene.direction || scene.onScreenText ? `<p class="scene-direction">${scene.direction ? `<span>Direction:</span> ${esc(scene.direction)} ` : ''}${scene.onScreenText ? `<span>On screen:</span> “${esc(scene.onScreenText)}”` : ''}</p>` : ''}
    <div class="shot-grid">${scene.shots.map(shot => sceneShotCard(content, manifest, scene, shot)).join('')}</div></article>`;
}
function sceneShotCard(content, manifest, scene, shot) {
  const selection = content.selections[shot.id], asset = selection && sceneAsset(content, selection.assetId);
  const jobs = content.jobs.filter(job => job.shotId === shot.id), active = jobs.find(job => ['queued', 'running'].includes(job.status));
  const failed = !active && jobs.find(job => ['failed', 'interrupted', 'blocked_quota', 'blocked_budget', 'stale'].includes(job.status) && job.updatedAt >= (selection?.selectedAt || ''));
  const count = content.candidateCounts[shot.id] || 0, editable = manifest.scope.current;
  const media = asset?.thumb ? `<img src="${esc(asset.thumb)}" alt="Selected visual for ${esc(shot.label)}" loading="lazy">` : `<span class="shot-empty">${active ? (active.kind === 'search' ? 'Searching…' : active.kind === 'import' ? 'Downloading…' : active.kind === 'draw' ? 'Drawing…' : 'Generating…') : 'No visual yet'}</span>`;
  return `<div class="shot-card ${asset ? 'filled' : ''}"><div class="shot-media">${media}${asset ? `<span class="shot-origin">${asset.origin === 'ai' ? 'AI' : asset.origin === 'drawn' ? 'Drawn' : esc(asset.provider)}</span>` : ''}</div>
    <div class="shot-body"><div class="card-top"><strong>${esc(shot.label)}</strong><small>${sceneSeconds(shot.durationSeconds)}</small></div>
      <small class="shot-source">${esc(styleLabel(shot.source))} · ${esc(styleLabel(shot.motion))}</small>
      <p class="shot-brief">${esc(shot.source === 'ai-image' ? shot.prompt : shot.source === 'generated-graphics' ? (shot.frame ? sceneFrameSummary(shot.frame) : sceneSketchSummary(shot.sketch, manifest.plan.cast)) : shot.query)}</p>${shot.cue ? `<small class="muted">Starts on “${esc(shot.cue)}”</small>` : ''}
      ${failed ? `<p class="inline-warning">${esc(failed.error || failed.status)}</p>` : ''}
      <div class="shot-actions">${editable ? action(asset ? 'Change' : 'Find visual', 'scene-shot-open', shot.id, asset ? 'secondary' : 'primary') + action('Edit', 'scene-shot-edit', shot.id, 'text-button') + (scene.shots.length > 1 ? action('Remove', 'scene-shot-remove', shot.id, 'text-button danger') : '') : ''}${count ? `<small class="muted">${count} result${count === 1 ? '' : 's'}</small>` : ''}</div></div></div>`;
}

// What an atelier shot (designed by Claude) shows, in words: "Atelier · dataviz-countup · the number · 3 beats".
function sceneFrameSummary(frame) {
  return ['Atelier', frame.blueprint !== 'compose' ? `${frame.blueprint} (${frame.posture})` : 'composed freely', frame.focal, `${frame.beats.length} beat${frame.beats.length === 1 ? '' : 's'}`, frame.html ? 'designed' : 'not designed yet: drawn from its words'].filter(Boolean).join(' · ');
}
// What a drawn shot shows, in words: "Stickman · storm set · Max (scared, cower) · bolt · “5x hotter” · flash".
function sceneSketchSummary(sketch, cast = []) {
  if (!sketch) return 'Drawn from the narration';
  const name = item => cast.find(member => member.id === item.who)?.name || 'figure';
  const parts = sketch.elements.map(item => item.kind === 'figure' ? `${name(item)} (${item.expression || 'neutral'}, ${item.pose})` : item.kind === 'prop' ? item.prop : item.kind === 'arrow' ? 'arrow' : item.kind === 'fx' ? item.effect : `“${item.text}”`);
  return [sketch.engine ? styleLabel(sketch.engine) : null, sketch.set && sketch.set !== 'none' ? `${sketch.set} set` : null, ...parts].filter(Boolean).join(' · ');
}
function sceneBatchCard(content, manifest, family) {
  const settings = state.scenes.settings[family.id], shots = sceneShots(manifest);
  const stockEmpty = shots.filter(shot => shot.source.startsWith('stock-') && !content.selections[shot.id]).length;
  const aiEmpty = shots.filter(shot => shot.source === 'ai-image' && !content.selections[shot.id]).length;
  const drawn = shots.filter(shot => shot.source === 'generated-graphics').length, drawnEmpty = shots.filter(shot => shot.source === 'generated-graphics' && !content.selections[shot.id]).length;
  const withResults = shots.filter(shot => !content.selections[shot.id] && content.candidateCounts[shot.id]).length;
  const active = sceneActiveJobs(content).length;
  return `<section class="production-card"><div class="production-card-head"><div><span class="micro-label">FILL THE BOARD</span><h2>Batch sourcing</h2></div>${active ? badge(`${active} job${active === 1 ? '' : 's'} running`, 'orange') : ''}</div>
    <p class="hint">Batch actions only touch shots without a visual. You still review every shot and approve the whole board.</p>
    <div class="batch-list">
      <div><strong>${stockEmpty} stock shot${stockEmpty === 1 ? '' : 's'} empty</strong><small>One search each with your first tested stock library (${esc(settings.stockOrder.join(' → '))}).</small>${manifest.scope.current && stockEmpty ? action('Search all', 'scene-search-all', manifest.id, 'secondary') : ''}</div>
      <div><strong>${withResults} empty shot${withResults === 1 ? '' : 's'} with results</strong><small>Downloads the top result for each, with its license evidence.</small>${manifest.scope.current && withResults ? action('Use top results', 'scene-pick-top', manifest.id, 'secondary') : ''}</div>
      ${drawn ? `<div><strong>${drawnEmpty} of ${drawn} drawn shot${drawn === 1 ? '' : 's'} to draw</strong><small>The program draws each shot's figures, props and labels itself, stroke by stroke. Free and local; a changed drawing is drawn again.</small>${manifest.scope.current ? action('Draw all scenes', 'scene-draw-all', manifest.id, 'primary') : ''}</div>` : ''}
      <div><strong>${aiEmpty} AI shot${aiEmpty === 1 ? '' : 's'} empty</strong><small>${manifest.status === 'approved' ? `About ${money(aiEmpty * settings.priceCents[settings.imageQuality])} at ${esc(settings.imageQuality)} quality.` : 'Approve the plan before spending on AI images.'}</small>${manifest.scope.current && aiEmpty && manifest.status === 'approved' ? action('Generate all', 'scene-generate-all', manifest.id, 'secondary') : ''}</div>
    </div></section>`;
}
function sceneApprovalCard(content, manifest) {
  const shots = sceneShots(manifest), filled = shots.filter(shot => content.selections[shot.id]).length;
  const current = content.approvals.find(item => item.status === 'approved'), last = content.approvals[0];
  const canApprove = manifest.status === 'approved' && manifest.scope.current && filled === shots.length;
  return `<section class="production-card"><div class="production-card-head"><div><span class="micro-label">OUTPUT HANDOFF</span><h2>Visual approval</h2></div>${badge(content.handoff.ready ? 'Ready for editing' : 'Blocked', content.handoff.ready ? 'green' : 'gray')}</div>
    <div class="cap-row"><div><strong>${filled} of ${shots.length} shots filled</strong><small>${manifest.status === 'approved' ? 'Plan approved' : 'Approve the plan first'}</small></div><div class="cap-meter">${intelMeter(filled, shots.length || 1, false)}</div></div>
    ${current ? `<div class="handoff-rule"><strong>Approved by ${esc(current.approvedBy)} · ${esc(date(current.approvedAt))}</strong><p>${current.snapshot.shots.length} shots locked by checksum${current.snapshot.disclosureRequired ? ' · AI disclosure required when publishing' : ''}${current.snapshot.warnings.length ? ` · ${current.snapshot.warnings.length} accepted warning(s)` : ''}.</p></div>` : last ? `<p class="inline-warning">Last approval ${esc(last.status)}: ${esc(last.endReason || '')}</p>` : ''}
    ${!content.handoff.ready ? `<p class="muted">${esc(content.handoff.blocker)}</p>` : ''}
    <div class="card-actions">${canApprove && !content.handoff.ready ? action('Approve visuals', 'scene-approve', manifest.id, 'primary') : ''}${current ? action('Revoke', 'scene-revoke', current.id, 'text-button danger') : ''}</div></section>`;
}

// ---------------------------------------------------------------- generic dialog
function sceneDialog(kind, title, kicker, body, submitLabel, data = {}) {
  const form = document.getElementById('scene-form');
  form.reset();
  form.dataset.kind = kind;
  form.dataset.payload = JSON.stringify(data);
  document.getElementById('scene-heading').textContent = title;
  document.getElementById('scene-kicker').textContent = kicker;
  document.getElementById('scene-body').innerHTML = body;
  form.querySelector('.form-error').hidden = true;
  form.querySelector('[type=submit]').textContent = submitLabel;
  document.getElementById('scene-dialog').showModal();
}
function sceneFind(shotId) {
  const content = sceneContent(), manifest = sceneLatest(content);
  for (const scene of manifest.plan.scenes) { const shot = scene.shots.find(item => item.id === shotId); if (shot) return {content, manifest, scene, shot}; }
  return {content, manifest, scene: manifest.plan.scenes.find(item => item.id === shotId) || null, shot: null};
}

function sceneAction(command, id, button) {
  const content = sceneContent(), manifest = sceneLatest(content);
  const nameAndNote = `<div class="form-grid">${scenePersonField()}<label>Change note <span class="hint">Optional</span><input name="note" maxlength="300"></label></div>`;
  if (command === 'scene-plan-rules') return sceneDialog('plan-rules', 'Split the narration into scenes', 'FREE · NO PROVIDER CALL', `<p class="hint">Groups whole sentences toward the middle of the style's scene length, sets shots from its shot limits and fills search words from the narration. You can edit everything afterwards.</p><div class="form-grid">${scenePersonField()}</div>`, 'Create plan', {contentId: id});
  if (command === 'scene-plan-claude') {
    const settings = state.scenes.settings[content.familyId];
    return sceneDialog('plan-claude', 'Ask Claude to direct the scenes', 'CLAUDE · TOKEN BUDGET', `<p class="hint">Claude reads the numbered narration sentences, the style limits and any approved competitor technique guidance, and returns scenes and shots. Reserves up to ${settings.plannerTokenLimit.toLocaleString()} tokens from the family's monthly limit. Plans that break the style's limits are saved as drafts with issues to fix.</p><div class="form-grid"><label>Claude connector<select name="connector">${sceneConnectorOptions('ai')}</select></label>${scenePersonField()}</div>`, 'Ask Claude', {contentId: id});
  }
  if (command === 'scene-plan-retry' || command === 'scene-job-retry') {
    const job = command === 'scene-plan-retry' ? content.planJobs.find(item => item.id === id) : content.jobs.find(item => item.id === id);
    const unknown = job?.status === 'interrupted';
    if (unknown && !confirm('The last attempt was interrupted, so the provider may already have charged it. Deliberately retry?')) return;
    if (button) button.disabled = true;
    return api(command === 'scene-plan-retry' ? `/api/scene-plan-jobs/${id}/retry` : `/api/visual-jobs/${id}/retry`, {confirmInterrupted: unknown}).then(refresh).then(() => { toast('Deliberately requeued.'); if (sceneShot) sceneShotRender(); }).catch(error => toast(error.message, true)).finally(() => { if (button) button.disabled = false; });
  }
  if (command === 'scene-settings') {
    const settings = state.scenes.settings[id], quota = state.scenes.quota.settings;
    return sceneDialog('settings', 'Visual settings', 'BUDGETS AND PROVIDERS', `<div class="form-grid">
      <label>Monthly AI image budget (USD)<input name="budget" type="number" min="0" max="10000" step="0.01" required value="${(settings.monthlyBudgetCents / 100).toFixed(2)}"></label>
      <label>OpenAI image model<select name="imageModel">${state.scenes.imageModels.map(model => `<option ${model === settings.imageModel ? 'selected' : ''}>${esc(model)}</option>`).join('')}</select></label>
      <label>Default quality<select name="imageQuality">${['low', 'medium', 'high'].map(item => `<option ${item === settings.imageQuality ? 'selected' : ''}>${item}</option>`).join('')}</select></label>
      <label>Image format<select name="imageFormat">${['png', 'jpeg'].map(item => `<option ${item === settings.imageFormat ? 'selected' : ''}>${item}</option>`).join('')}</select></label>
      <label>Price per low image (cents)<input name="low" type="number" min="0" max="10000" step="0.01" required value="${settings.priceCents.low}"></label>
      <label>Price per medium image (cents)<input name="medium" type="number" min="0" max="10000" step="0.01" required value="${settings.priceCents.medium}"></label>
      <label>Price per high image (cents)<input name="high" type="number" min="0" max="10000" step="0.01" required value="${settings.priceCents.high}"></label>
      <label>Stock library order<select name="stockOrder"><option value="pexels,pixabay" ${settings.stockOrder[0] === 'pexels' ? 'selected' : ''}>Pexels first, then Pixabay</option><option value="pixabay,pexels" ${settings.stockOrder[0] === 'pixabay' ? 'selected' : ''}>Pixabay first, then Pexels</option></select></label>
      <label>Results per search<input name="perSearch" type="number" min="3" max="30" required value="${settings.perSearch}"></label>
      <label>Scene planner token limit<input name="plannerTokenLimit" type="number" min="8000" max="120000" step="1000" required value="${settings.plannerTokenLimit}"></label>
      <label class="check"><input name="continuityReview" type="checkbox" ${settings.continuityReview !== false ? 'checked' : ''}> Continuity review: Claude checks every drawn shot against its own words and its neighbours, and redraws what does not fit (one more answer per part)</label>
      <label>Continuity review token limit (per answer)<input name="reviewTokenLimit" type="number" min="20000" max="200000" step="1000" required value="${settings.reviewTokenLimit || 70000}"></label>
      <label class="check"><input name="composeFrames" type="checkbox" ${settings.composeFrames !== false ? 'checked' : ''}> Atelier shots: Claude designs the shots the plan marks as atelier (kinetic type, numbers, diagrams, metaphors), one answer per shot, each reserved on its own</label>
      <label>Atelier shot token limit (per shot)<input name="composeTokenLimit" type="number" min="12000" max="150000" step="1000" required value="${settings.composeTokenLimit || 40000}"></label>
      <label>Pexels requests per hour<input name="pexelsCap" type="number" min="0" max="200" required value="${quota.pexelsHourlyRequestCap}"><span class="hint">Pexels allows 200/hour by default.</span></label>
      <label>Pixabay requests per hour<input name="pixabayCap" type="number" min="0" max="6000" required value="${quota.pixabayHourlyRequestCap}"><span class="hint">Pixabay allows 100 per minute.</span></label>
    </div><p class="hint">Prices are your own estimates for the chosen model; check current OpenAI pricing. The budget is reserved before every image and an interrupted image stays counted.</p>`, 'Save settings', {familyId: id, revision: settings.revision, quotaRevision: quota.revision});
  }
  if (command === 'scene-review') {
    return sceneDialog('review', `Review plan revision ${manifest.revision}`, 'HUMAN APPROVAL GATE', `<div class="form-grid"><label>Decision<select name="decision"><option value="approve">Approve</option><option value="reject">Reject</option></select></label>${scenePersonField('Reviewer name')}<label class="full">Notes <span class="hint">Required when rejecting</span><input name="notes" maxlength="2000"></label></div>
      <label class="checkbox-label"><input type="checkbox" name="coverageReviewed">Every sentence is covered once, in order, and the scene purposes make sense.</label>
      <label class="checkbox-label"><input type="checkbox" name="directionReviewed">The search words and prompts are original and avoid real people, brands, logos and competitor names.</label>`, 'Record decision', {id});
  }
  if (command === 'scene-refresh') return sceneDialog('edit', 'Refresh for the current narration and style', 'NEW REVISION', `<p class="hint">Keeps every scene and shot ID (and their visuals), recalculates timing from the current approved narration and re-checks the plan against the current family style.</p>${nameAndNote}`, 'Create revision', {manifestId: id, op: 'refresh-scope'});
  if (command === 'scene-edit') {
    const {scene} = sceneFind(id);
    return sceneDialog('edit', `Edit ${scene.label}`, 'NEW REVISION', `<div class="form-grid"><label>Purpose<select name="purpose">${state.scenes.purposes.map(item => `<option value="${item}" ${item === scene.purpose ? 'selected' : ''}>${esc(SCENE_PURPOSE[item] || item)}</option>`).join('')}</select></label><label>On-screen text <span class="hint">Optional, short</span><input name="onScreenText" maxlength="140" value="${esc(scene.onScreenText)}"></label><label class="full">Direction<textarea name="direction" rows="3" maxlength="600">${esc(scene.direction)}</textarea></label></div>${nameAndNote}`, 'Save as new revision', {manifestId: manifest.id, op: 'update-scene', sceneId: id});
  }
  if (command === 'scene-split') {
    const {scene} = sceneFind(id), options = manifest.plan.sentences.slice(scene.sentenceStart, scene.sentenceEnd);
    return sceneDialog('edit', `Split ${scene.label}`, 'NEW REVISION', `<label>New scene starts at<select name="atSentence">${options.map(item => `<option value="${item.n}">Sentence ${item.n}: ${esc(item.text.slice(0, 90))}</option>`).join('')}</select></label>${nameAndNote}`, 'Split scene', {manifestId: manifest.id, op: 'split-scene', sceneId: id});
  }
  if (command === 'scene-merge') { const {scene} = sceneFind(id); return sceneDialog('edit', `Merge ${scene.label} with the next scene`, 'NEW REVISION', `<p class="hint">Both scenes' shots are kept (up to 8). Remove extra shots afterwards if the plan reports them as too short.</p>${nameAndNote}`, 'Merge scenes', {manifestId: manifest.id, op: 'merge-next', sceneId: id}); }
  if (command === 'scene-add-shot') { const {scene} = sceneFind(id); return sceneDialog('edit', `Add a shot to ${scene.label}`, 'NEW REVISION', `<p class="hint">The new shot copies the last shot's source and search words. Shots split the scene time evenly.</p>${nameAndNote}`, 'Add shot', {manifestId: manifest.id, op: 'add-shot', sceneId: id}); }
  if (command === 'scene-shot-remove') { const {shot} = sceneFind(id); return sceneDialog('edit', `Remove ${shot.label}`, 'NEW REVISION', `<p class="hint">The other shots keep their IDs and visuals.</p>${nameAndNote}`, 'Remove shot', {manifestId: manifest.id, op: 'remove-shot', shotId: id}); }
  if (command === 'scene-shot-edit') {
    const {shot} = sceneFind(id), spec = sceneSpec(content), moves = spec?.motion.cameraMoves || [shot.motion];
    return sceneDialog('edit', `Edit ${shot.label}`, 'NEW REVISION', `<div class="form-grid"><label>Visual source<select name="source">${content.inputs.sources.map(item => `<option value="${item}" ${item === shot.source ? 'selected' : ''}>${esc(styleLabel(item))}</option>`).join('')}</select></label><label>Camera move<select name="motion">${moves.map(item => `<option value="${item}" ${item === shot.motion ? 'selected' : ''}>${esc(styleLabel(item))}</option>`).join('')}</select></label>
      <label class="full">Stock search words<input name="query" maxlength="100" value="${esc(shot.query)}"></label><label class="full">AI image prompt<textarea name="prompt" rows="3" maxlength="1500">${esc(shot.prompt)}</textarea></label><label class="full">Notes<input name="notes" maxlength="500" value="${esc(shot.notes)}"></label></div>
      ${Object.entries(state.scenes.notExecutable).filter(([source]) => spec?.visuals.sources.includes(source)).map(([source, reason]) => `<p class="hint">${esc(styleLabel(source))}: ${esc(reason)}</p>`).join('')}${nameAndNote}`, 'Save as new revision', {manifestId: manifest.id, op: 'update-shot', shotId: id});
  }
  if (command === 'scene-search-all') {
    const pexels = intelConnectors('pexels'), pixabay = intelConnectors('pixabay');
    return sceneDialog('search-all', 'Search stock for every empty shot', 'FREE API · HOURLY CAPS', `<div class="form-grid"><label>Pexels connector<select name="pexels">${sceneConnectorOptions('pexels', true)}</select></label><label>Pixabay connector<select name="pixabay">${sceneConnectorOptions('pixabay', true)}</select></label>${scenePersonField()}</div>${!pexels.length && !pixabay.length ? '<p class="inline-warning">Add and test a Pexels or Pixabay connector in Connections first.</p>' : ''}<p class="hint">One request per shot, counted against your hourly caps. Identical searches within 24 hours reuse cached results.</p>`, 'Search', {manifestId: id});
  }
  if (command === 'scene-draw-all') { if (button) button.disabled = true; return api(`/api/scene-manifests/${id}/draw-all`, {requestedBy: scenePerson() || 'Owner'}).then(result => { toast(`${result.queued} scene${result.queued === 1 ? '' : 's'} queued for drawing.`); return refresh(); }).catch(error => toast(error.message, true)).finally(() => { if (button) button.disabled = false; }); }
  if (command === 'scene-pick-top') return sceneDialog('pick-top', 'Use the top result for every empty shot', 'DOWNLOAD WITH LICENSE EVIDENCE', `<p class="hint">Downloads the first result of each shot's latest search. You can change any shot before approving the board.</p><div class="form-grid">${scenePersonField()}</div>`, 'Download', {manifestId: id});
  if (command === 'scene-generate-all') {
    const settings = state.scenes.settings[content.familyId], usage = state.scenes.usage[content.familyId];
    const count = sceneShots(manifest).filter(shot => shot.source === 'ai-image' && !content.selections[shot.id]).length;
    return sceneDialog('generate-all', `Generate ${count} AI image${count === 1 ? '' : 's'}`, 'PAID · BUDGET ADMISSION', `<div class="form-grid"><label>OpenAI connector<select name="connector">${sceneConnectorOptions('openai')}</select></label><label>Quality<select name="quality">${['low', 'medium', 'high'].map(item => `<option value="${item}" ${item === settings.imageQuality ? 'selected' : ''}>${item} · ${money(settings.priceCents[item])} each</option>`).join('')}</select></label>${scenePersonField()}</div>
      <p class="note">${esc(settings.imageModel)} · ${money(usage.remainingCents)} left of the ${money(usage.budgetCents)} monthly budget. Every image is synthetic media and follows the style's disclosure policy.</p>
      <label class="checkbox-label"><input type="checkbox" name="costConfirmed">I confirm the estimated cost for these images.</label>`, 'Generate', {manifestId: id});
  }
  if (command === 'scene-approve') {
    return reach(`/api/scene-manifests/${id}/board`).then(response => response.json()).then(board => {
      if (board.error) throw new Error(board.error);
      const disclose = board.aiPolicy === 'review-per-asset' && board.ai.length;
      sceneDialog('approve', 'Approve the visual board', 'HUMAN APPROVAL GATE', `${board.blockers.length ? `<div class="checks"><strong>Blocked</strong>${intelList(board.blockers)}</div>` : ''}
        ${board.warnings.length ? `<div class="checks"><strong>${board.warnings.length} warning${board.warnings.length === 1 ? '' : 's'}</strong>${intelList(board.warnings)}</div><label class="checkbox-label"><input type="checkbox" name="warningsAccepted">I accept these warnings for this video.</label>` : ''}
        <label class="checkbox-label"><input type="checkbox" name="rightsReviewed">I reviewed every visual's license and source, and none misuses identifiable people, trademarks or logos.</label>
        <label class="checkbox-label"><input type="checkbox" name="sequenceReviewed">I reviewed the visuals in narration order and they support what is said.</label>
        ${board.ai.length ? `<label class="checkbox-label"><input type="checkbox" name="disclosureReviewed">I reviewed the AI disclosure for the ${board.ai.length} AI image${board.ai.length === 1 ? '' : 's'}${board.aiPolicy === 'always-disclose' ? ' (this style always discloses)' : ''}.</label>` : ''}
        ${disclose ? `<div class="disclosure-grid">${board.ai.map(item => `<label>${esc(item.label)}<select name="disclose-${esc(item.assetId)}"><option value="disclose">Disclose as synthetic</option><option value="not-required">Not realistic, no disclosure</option></select></label>`).join('')}</div>` : ''}
        <div class="form-grid">${scenePersonField('Approver name')}<label>Notes<input name="notes" maxlength="2000"></label></div>`, 'Approve visuals', {manifestId: id, ai: disclose ? board.ai.map(item => item.assetId) : []});
    }).catch(error => toast(error.message, true));
  }
  if (command === 'scene-revoke') return sceneDialog('revoke', 'Revoke the visual approval', 'HANDOFF', `<div class="form-grid">${scenePersonField()}<label>Reason<input name="reason" required minlength="8" maxlength="1000"></label></div>`, 'Revoke', {id});
  if (command === 'scene-shot-open') return sceneShotOpen(id);
  return toast('Unknown action.', true);
}

document.getElementById('scene-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget, kind = form.dataset.kind, data = JSON.parse(form.dataset.payload || '{}');
  const value = name => form.elements[name]?.value ?? '', checked = name => !!form.elements[name]?.checked, person = value('person');
  sceneRemember(person);
  let message = null;
  saveForm(form, async () => {
    const content = sceneContent();
    if (kind === 'plan-rules') { await api(`/api/content/${data.contentId}/scene-plans`, {mode: 'rules', requestedBy: person, contentRevision: content.contentRevision}); message = 'Scene plan created. Review the scenes, then approve the plan.'; return; }
    if (kind === 'plan-claude') { await api(`/api/content/${data.contentId}/scene-plans`, {mode: 'claude', requestedBy: person, contentRevision: content.contentRevision, connector: sceneConnectorRef(value('connector'))}); message = 'Claude scene plan queued.'; return; }
    if (kind === 'settings') {
      const cents = Math.round(Number(value('budget')) * 100);
      await api(`/api/families/${data.familyId}/visual-settings`, {revision: data.revision, monthlyBudgetCents: cents, imageModel: value('imageModel'), imageQuality: value('imageQuality'), imageFormat: value('imageFormat'), priceCents: {low: Number(value('low')), medium: Number(value('medium')), high: Number(value('high'))}, stockOrder: value('stockOrder').split(','), perSearch: Number(value('perSearch')), plannerTokenLimit: Number(value('plannerTokenLimit')), continuityReview: !!form.elements.continuityReview?.checked, reviewTokenLimit: Number(value('reviewTokenLimit')), composeFrames: !!form.elements.composeFrames?.checked, composeTokenLimit: Number(value('composeTokenLimit'))});
      await api('/api/quota-settings', {revision: data.quotaRevision, pexelsHourlyRequestCap: Number(value('pexelsCap')), pixabayHourlyRequestCap: Number(value('pixabayCap'))});
      return;
    }
    if (kind === 'review') { await api(`/api/scene-manifests/${data.id}/review`, {decision: value('decision'), reviewer: person, notes: value('notes'), confirmations: {coverageReviewed: checked('coverageReviewed'), directionReviewed: checked('directionReviewed')}}); return; }
    if (kind === 'edit') {
      const manifest = sceneLatest(content), body = {op: data.op, createdBy: person, note: value('note'), expectedRevision: manifest.revision};
      if (data.sceneId) body.sceneId = data.sceneId;
      if (data.shotId) body.shotId = data.shotId;
      if (data.op === 'update-scene') Object.assign(body, {purpose: value('purpose'), direction: value('direction'), onScreenText: value('onScreenText')});
      if (data.op === 'update-shot') Object.assign(body, {source: value('source'), motion: value('motion'), query: value('query'), prompt: value('prompt'), notes: value('notes')});
      if (data.op === 'split-scene') body.atSentence = Number(value('atSentence'));
      const created = await api(`/api/scene-manifests/${data.manifestId}/revisions`, body);
      message = created.issues.length ? `Saved revision ${created.revision} with ${created.issues.length} issue(s) to fix before approval.` : `Saved revision ${created.revision}.`;
      return;
    }
    if (kind === 'search-all') { const result = await api(`/api/scene-manifests/${data.manifestId}/search-all`, {requestedBy: person, connectors: {pexels: sceneConnectorRef(value('pexels')), pixabay: sceneConnectorRef(value('pixabay'))}}); message = `${result.queued} searches queued.`; return; }
    if (kind === 'pick-top') { const result = await api(`/api/scene-manifests/${data.manifestId}/pick-top`, {requestedBy: person}); message = `${result.queued} downloads queued.`; return; }
    if (kind === 'generate-all') { const result = await api(`/api/scene-manifests/${data.manifestId}/generate-all`, {requestedBy: person, connector: sceneConnectorRef(value('connector')), quality: value('quality'), costConfirmed: checked('costConfirmed')}); message = `${result.queued} images queued (about ${money(result.estimatedCents)}).`; return; }
    if (kind === 'approve') {
      const disclosures = Object.fromEntries(data.ai.map(assetId => [assetId, value(`disclose-${assetId}`)]));
      await api(`/api/scene-manifests/${data.manifestId}/visual-approval`, {approvedBy: person, notes: value('notes'), disclosures, confirmations: {rightsReviewed: checked('rightsReviewed'), sequenceReviewed: checked('sequenceReviewed'), warningsAccepted: checked('warningsAccepted'), disclosureReviewed: checked('disclosureReviewed')}});
      message = 'Visuals approved and handed to the Editing Room.';
      return;
    }
    if (kind === 'revoke') { await api(`/api/visual-approvals/${data.id}/revoke`, {by: person, reason: value('reason')}); return; }
    throw new Error('Unknown form.');
  }, () => message);
});

// ---------------------------------------------------------------- shot sourcing dialog
function sceneShotOpen(shotId) {
  const {content, manifest, scene, shot} = sceneFind(shotId);
  if (!shot) return toast('Shot not found. Reload.', true);
  sceneShot = {shotId, manifestId: manifest.id, contentId: content.contentId};
  const settings = state.scenes.settings[content.familyId];
  const caps = state.scenes.capabilities.filter(cap => cap.kind === 'search' && intelConnectors(cap.provider).length);
  const preferred = shot.source === 'stock-video' ? 'video' : 'photo';
  const order = settings.stockOrder.map(provider => `${provider}-${preferred}`);
  caps.sort((a, b) => (order.indexOf(a.id) + 1 || 9) - (order.indexOf(b.id) + 1 || 9));
  const openai = intelConnectors('openai');
  document.getElementById('shot-heading').textContent = `${shot.label} · ${styleLabel(shot.source)} · ${sceneSeconds(shot.durationSeconds)}`;
  document.getElementById('shot-body').innerHTML = `<p class="scene-narration">${esc(sceneNarration(manifest, scene))}</p>
    <div id="shot-selected"></div>
    <div class="shot-panels">
      <section class="shot-panel"><h3>Stock search</h3>${caps.length ? `<div class="form-grid"><label>Library<select id="shot-cap">${caps.map(cap => `<option value="${cap.id}">${esc(cap.name)}</option>`).join('')}</select></label><label>Search words<input id="shot-query" maxlength="100" value="${esc(shot.query)}"></label></div><div class="card-actions"><button type="button" class="button primary" data-scene-act="search">Search</button></div><p class="hint">Results and previews are kept for 24 hours. The chosen file is downloaded with its license, author and source page.</p>` : '<p class="inline-warning">Add and test a Pexels or Pixabay connector in Connections.</p>'}</section>
      <section class="shot-panel"><h3>AI image</h3>${manifest.status !== 'approved' ? '<p class="inline-warning">Approve the plan revision before spending on AI images.</p>' : !openai.length ? '<p class="inline-warning">Add and test an OpenAI connector in Connections.</p>' : `<label>Prompt<textarea id="shot-prompt" rows="4" maxlength="1500">${esc(shot.prompt || `Original illustration for a ${sceneSpec(content)?.name.toLowerCase() || 'documentary'} video, no text, no logos, no real people: ${sceneNarration(manifest, scene).slice(0, 300)}`)}</textarea></label><div class="form-grid"><label>Quality<select id="shot-quality">${['low', 'medium', 'high'].map(item => `<option value="${item}" ${item === settings.imageQuality ? 'selected' : ''}>${item} · ${money(settings.priceCents[item])}</option>`).join('')}</select></label><label>OpenAI connector<select id="shot-openai">${sceneConnectorOptions('openai')}</select></label></div><label class="checkbox-label"><input type="checkbox" id="shot-cost">I confirm the estimated cost (${esc(settings.imageModel)}).</label>${shot.source !== 'ai-image' ? '<label class="checkbox-label"><input type="checkbox" id="shot-exception">Use an AI image although this shot is planned for stock.</label>' : ''}<div class="card-actions"><button type="button" class="button primary" data-scene-act="generate">Generate</button></div>`}</section>
    </div>
    <label class="shot-person">Your name <input id="shot-person" maxlength="80" autocomplete="name" value="${esc(scenePerson())}"></label>
    <div id="shot-jobs"></div>
    <h3 class="intel-subhead">Search results</h3><div id="shot-results" class="candidate-grid"><p class="muted">Loading…</p></div>
    <h3 class="intel-subhead">Visuals already downloaded for this script</h3><div id="shot-gallery" class="candidate-grid"></div>`;
  document.getElementById('shot-dialog').showModal();
  sceneShotRender();
}
async function sceneShotRender() {
  if (!sceneShot) return;
  const content = sceneContent(sceneShot.contentId), manifest = sceneLatest(content);
  if (!content || !manifest || manifest.id !== sceneShot.manifestId) { document.getElementById('shot-selected').innerHTML = '<p class="inline-warning">The plan changed. Close this window and open the shot again.</p>'; return; }
  const selection = content.selections[sceneShot.shotId], asset = selection && sceneAsset(content, selection.assetId);
  document.getElementById('shot-selected').innerHTML = asset ? `<div class="selected-asset">${asset.thumb ? `<img src="${esc(asset.thumb)}" alt="Selected visual">` : ''}<div><strong>Selected: ${asset.origin === 'ai' ? `AI image · ${esc(asset.rights.model)}` : `${esc(sceneProvider(asset.provider))} ${esc(asset.mediaType)}`}</strong><small>${asset.probe.width}×${asset.probe.height}${asset.probe.durationSeconds ? ` · ${sceneSeconds(asset.probe.durationSeconds)}` : ''} · ${esc(asset.rights.license.name)}${asset.rights.author ? ` · ${esc(asset.rights.author)}` : ''} · ${esc(asset.sha256.slice(0, 12))}</small>${asset.rights.pageUrl ? `<a href="${esc(asset.rights.pageUrl)}" target="_blank" rel="noopener noreferrer">Source page ↗</a>` : ''}${asset.rights.synthetic ? '<small class="muted">Synthetic media · disclosure decided at approval</small>' : ''}</div><button type="button" class="button text-button danger" data-scene-act="clear">Clear</button></div>` : '<p class="muted">No visual selected for this shot yet.</p>';
  const jobs = content.jobs.filter(job => job.shotId === sceneShot.shotId).slice(0, 6);
  document.getElementById('shot-jobs').innerHTML = jobs.length ? `<div class="history-list">${jobs.map(job => `<div class="history-row"><span class="job-dot ${['queued', 'running'].includes(job.status) ? 'queued' : job.status === 'completed' ? 'completed' : ''}"></span><div><strong>${sceneJobBadge(job.status)} ${esc(job.kind)} · ${esc(job.capabilityId)}</strong><small>${esc(date(job.createdAt))} · attempt ${job.attempts}/3${job.result?.cached ? ' · from 24-hour cache' : ''}${job.error ? ` · ${esc(job.error)}` : ''}</small></div>${['failed', 'interrupted', 'blocked_quota', 'blocked_budget', 'stale'].includes(job.status) && job.attempts < 3 ? `<button type="button" class="button text-button" data-scene-act="retry" data-id="${esc(job.id)}">Retry deliberately</button>` : ''}</div>`).join('')}</div>` : '';
  try {
    const response = await reach(`/api/scene-candidates?contentId=${encodeURIComponent(sceneShot.contentId)}&shotId=${encodeURIComponent(sceneShot.shotId)}`);
    const candidates = await response.json();
    if (!response.ok) throw new Error(candidates.error);
    document.getElementById('shot-results').innerHTML = candidates.length ? candidates.map(item => `<div class="candidate">${item.preview ? `<img src="${esc(item.preview)}" alt="${esc(item.title)}" loading="lazy">` : '<span class="shot-empty">No preview</span>'}<div><strong>${esc(item.title)}</strong><small>${esc(item.providerName)} · ${item.width && item.height ? `${item.width}×${item.height}` : 'size unknown'}${item.durationSeconds ? ` · ${sceneSeconds(item.durationSeconds)}` : ''}</small><small>${item.author ? `by ${esc(item.author)} · ` : ''}<a href="${esc(item.license.url)}" target="_blank" rel="noopener noreferrer">${esc(item.license.name)}</a>${item.pageUrl ? ` · <a href="${esc(item.pageUrl)}" target="_blank" rel="noopener noreferrer">Source ↗</a>` : ''}</small><small class="muted">“${esc(item.query)}” · #${item.rank}</small></div><button type="button" class="button secondary" data-scene-act="import" data-id="${esc(item.id)}">Use this</button></div>`).join('') : '<p class="muted">No results yet. Search a stock library above.</p>';
  } catch (error) {
    document.getElementById('shot-results').innerHTML = `<p class="inline-warning">${esc(error.message || 'Could not load results.')}</p>`;
  }
  const gallery = content.assets.filter(item => item.id !== selection?.assetId).slice(0, 24);
  document.getElementById('shot-gallery').innerHTML = gallery.length ? gallery.map(item => `<div class="candidate compact">${item.thumb ? `<img src="${esc(item.thumb)}" alt="Visual ${esc(item.id.slice(0, 8))}" loading="lazy">` : '<span class="shot-empty">No thumbnail</span>'}<div><strong>${item.origin === 'ai' ? 'AI image' : `${esc(sceneProvider(item.provider))} ${esc(item.mediaType)}`}</strong><small>${item.probe.width}×${item.probe.height}${item.probe.durationSeconds ? ` · ${sceneSeconds(item.probe.durationSeconds)}` : ''}</small></div><button type="button" class="button text-button" data-scene-act="use" data-id="${esc(item.id)}">Use for this shot</button></div>`).join('') : '<p class="muted">Nothing downloaded yet.</p>';
  scenePollStart();
}
function scenePollStart() {
  clearInterval(scenePoll);
  const content = sceneContent(sceneShot?.contentId);
  if (!sceneShot || !content || !sceneActiveJobs(content, sceneShot.shotId).length) return;
  scenePoll = setInterval(async () => {
    if (!document.getElementById('shot-dialog').open) { clearInterval(scenePoll); return; }
    try { await refresh(); } catch { return; }
    const current = sceneContent(sceneShot.contentId);
    if (!current || !sceneActiveJobs(current, sceneShot.shotId).length) { clearInterval(scenePoll); sceneShotRender(); }
  }, 1500);
}
document.getElementById('shot-dialog').addEventListener('close', () => { clearInterval(scenePoll); sceneShot = null; refresh().catch(() => {}); });
document.getElementById('shot-dialog').addEventListener('click', async event => {
  const button = event.target.closest('[data-scene-act]');
  if (!button || !sceneShot) return;
  const act = button.dataset.sceneAct, person = document.getElementById('shot-person').value.trim();
  sceneRemember(person);
  const base = {manifestId: sceneShot.manifestId, shotId: sceneShot.shotId};
  button.disabled = true;
  try {
    if (act === 'search') {
      const cap = document.getElementById('shot-cap').value, provider = state.scenes.capabilities.find(item => item.id === cap).provider;
      await api('/api/scene-shots/search', {...base, capabilityId: cap, query: document.getElementById('shot-query').value, connector: sceneConnectorRef(intelConnectors(provider)[0]?.id), requestedBy: person});
      toast('Search queued.');
    } else if (act === 'generate') {
      await api('/api/scene-shots/generate', {...base, prompt: document.getElementById('shot-prompt').value, quality: document.getElementById('shot-quality').value, connector: sceneConnectorRef(document.getElementById('shot-openai').value), costConfirmed: document.getElementById('shot-cost').checked, allowSourceChange: !!document.getElementById('shot-exception')?.checked, requestedBy: person});
      toast('Image generation queued.');
    } else if (act === 'import') {
      await api(`/api/visual-candidates/${button.dataset.id}/import`, {...base, requestedBy: person});
      toast('Downloading with license evidence…');
    } else if (act === 'use') {
      await api('/api/scene-shots/select', {...base, assetId: button.dataset.id, selectedBy: person});
      toast('Visual selected for this shot.');
    } else if (act === 'clear') {
      await api('/api/scene-shots/select', {...base, assetId: null, selectedBy: person});
    } else if (act === 'retry') {
      const content = sceneContent(sceneShot.contentId), job = content.jobs.find(item => item.id === button.dataset.id), unknown = job?.status === 'interrupted';
      if (unknown && !confirm('The last attempt was interrupted, so it may already have been charged. Deliberately retry?')) return;
      await api(`/api/visual-jobs/${button.dataset.id}/retry`, {confirmInterrupted: unknown});
    }
    await refresh();
    sceneShotRender();
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
  }
});
document.addEventListener('change', event => { if (event.target.id === 'scene-content') { sceneContentId = event.target.value; render(); } });
