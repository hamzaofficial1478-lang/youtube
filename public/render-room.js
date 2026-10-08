'use strict';
// Room 05 - Editing Room: assembly preview and style proof (P05 UI).
// Loaded before app.js. Helpers from app.js (state, esc, badge, action, api, refresh, toast, saveForm, date, render)
// and intelligence.js (intelMeter, intelList) are used only inside functions.

let renderContentId = '';
const RENDER_STATUS = {queued: ['Queued', 'orange'], running: ['Rendering', 'orange'], completed: ['Rendered', 'green'], failed: ['Failed', 'gray'], cancelled: ['Cancelled', 'gray'], interrupted: ['Interrupted', 'orange'], stale: ['Stale', 'gray']};
const renderBadge = status => { const [label, color] = RENDER_STATUS[status] || [status, 'gray']; return badge(label, color); };
function renderBusy() { const renders = state?.renders; return !!renders && (renders.checking || renders.contents.some(content => content.renders.some(job => ['queued', 'running'].includes(job.status)))); }
function renderPerson() { try { return localStorage.getItem('control-room-person') || ''; } catch { return ''; } }
function renderRemember(name) { try { if (name) localStorage.setItem('control-room-person', name); } catch { /* optional */ } }
const renderNameField = (label = 'Your name') => `<label>${label}<input name="person" required minlength="2" maxlength="80" autocomplete="name" value="${esc(renderPerson())}"></label>`;
const renderClock = seconds => { const t = Math.round(seconds); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

function editingRoomView(family) {
  const renders = state.renders, contents = renders.contents.filter(item => item.familyId === family.id);
  const readiness = renders.readiness, pin = renders.pin;
  const engineReady = !!(readiness?.passed && pin && renders.pinMatchesLatest);
  const hero = `<section class="voice-hero"><div><span class="stage-kicker">ROOM 05 · EDITING</span><h2>Editing Room</h2><p>The editing brain turns the approved visuals and narration into an edit: cuts on the spoken pauses, varied holds, purposeful camera moves, structural transitions and motion graphics where the script needs them, each with its reason. The critic flags boring, lazy or amateur choices. Change anything, render the edit with your pinned FFmpeg and record the style-proof verdict.</p></div><div class="voice-health"><span class="health-light ${engineReady ? 'ready' : ''}"></span><strong>${engineReady ? 'Render engine pinned' : 'Setup required'}</strong><small>${engineReady ? `FFmpeg ${esc(pin.version)} · ${esc(pin.ffmpegSha256.slice(0, 12))}` : readiness ? (readiness.passed ? 'Pin the checked build' : 'Readiness check failed') : 'Run the FFmpeg readiness check'}</small></div></section>`;
  const engine = renderEngineCard(renders);
  if (!contents.length) return `${hero}<div class="scene-cards">${engine}</div><div class="production-empty"><span class="empty-icon">▶</span><h2>No approved script yet</h2><p>Approve a script, its narration and its visual board first. The assembly preview starts from the Room 04 handoff.</p></div>`;
  if (!contents.some(item => item.contentId === renderContentId)) renderContentId = contents[0].contentId;
  const content = contents.find(item => item.contentId === renderContentId);
  const picker = contents.length > 1 ? `<div class="production-toolbar scene-toolbar"><div><label for="render-content">Approved script</label><select id="render-content">${contents.map(item => `<option value="${item.contentId}" ${item.contentId === content.contentId ? 'selected' : ''}>${esc(item.title)} · v${item.contentRevision}</option>`).join('')}</select></div></div>` : '';
  const latest = content.renders[0];
  return `${hero}${picker}<div class="scene-cards">${engine}${renderInputsCard(content, engineReady)}</div>${editCard(content, engineReady)}${latest ? renderDetail(content, latest) : '<section class="production-card"><div class="production-empty compact"><h3>No render yet</h3><p>When the inputs and the render engine are ready, render the edit (or a plain assembly). It runs on this computer and costs nothing.</p></div></section>'}${content.renders.length > 1 ? renderHistory(content) : ''}`;
}

function renderEngineCard(renders) {
  const readiness = renders.readiness, pin = renders.pin;
  const chips = readiness ? `<div class="qc-checks">${renders.requiredFilters.map(name => `<span class="${readiness.filters?.[name] ? 'pass' : 'fail'}">${readiness.filters?.[name] ? '✓' : '!'} ${esc(name)}</span>`).join('')}${renders.requiredEncoders.map(name => `<span class="${readiness.encoders?.[name] ? 'pass' : 'fail'}">${readiness.encoders?.[name] ? '✓' : '!'} ${esc(name)}</span>`).join('')}<span class="${readiness.determinism?.passed ? 'pass' : 'fail'}">${readiness.determinism?.passed ? '✓' : '!'} deterministic</span>${readiness.motion ? `<span class="${readiness.motion.passed ? 'pass' : 'fail'}" title="${esc(readiness.motion.issues?.join(' ') || readiness.motion.path || '')}">${readiness.motion.passed ? '✓' : '!'} animated graphics${readiness.motion.version ? ` (${esc(readiness.motion.version)})` : ''}</span>` : ''}</div>` : '';
  return `<section class="production-card"><div class="production-card-head"><div><span class="micro-label">RENDER ENGINE</span><h2>FFmpeg readiness</h2></div>${badge(readiness ? (readiness.passed ? 'Checks passed' : 'Checks failed') : 'Not checked', readiness?.passed ? 'green' : 'gray')}</div>
    ${readiness ? `<dl class="style-facts"><div><dt>FFmpeg</dt><dd>${esc(readiness.ffmpeg?.version || 'not found')}${readiness.ffmpeg?.sha256 ? ` · ${esc(readiness.ffmpeg.sha256.slice(0, 12))}` : ''}</dd></div><div><dt>ffprobe</dt><dd>${esc(readiness.ffprobe?.version || 'not found')}</dd></div><div><dt>Path</dt><dd class="mono-wrap">${esc(readiness.ffmpeg?.path || '—')}</dd></div><div><dt>Checked</dt><dd>${esc(date(readiness.checkedAt))} by ${esc(readiness.createdBy)}</dd></div></dl>${chips}${readiness.issues.length ? `<div class="checks">${intelList(readiness.issues)}</div>` : ''}` : '<p class="muted">Checks that FFmpeg and ffprobe are installed, have every filter and encoder this renderer uses, and produce byte-identical output for the same fixture.</p>'}
    ${pin ? `<div class="handoff-rule"><strong>Pinned: FFmpeg ${esc(pin.version)} · ${esc(pin.ffmpegSha256.slice(0, 12))}</strong><p>By ${esc(pin.pinnedBy)} · ${esc(date(pin.createdAt))} · ${esc(pin.reason)}${renders.pinMatchesLatest ? '' : ' · <b>the latest check found a different binary</b>'}</p></div>` : ''}
    <div class="card-actions">${action(renders.checking ? 'Checking…' : 'Run readiness check', 'render-check', '', 'secondary')}${readiness?.passed && !renders.pinMatchesLatest ? action('Pin this build', 'render-pin', readiness.id, 'primary') : ''}</div>
    <p class="hint">Rendering is blocked if the FFmpeg or ffprobe file changes after pinning, so an update can never change a video silently. On Windows a full build such as Gyan.FFmpeg (winget install Gyan.FFmpeg) has everything needed.</p></section>`;
}
function renderInputsCard(content, engineReady) {
  const inputs = content.inputs, style = inputs.style, active = content.renders.some(job => ['queued', 'running'].includes(job.status));
  const row = (ok, title, detail) => `<div class="handoff-record"><span>${ok ? '✓' : '○'}</span><div><strong>${title}</strong><p>${detail}</p></div></div>`;
  return `<section class="production-card"><div class="production-card-head"><div><span class="micro-label">INPUTS & GATE</span><h2>${esc(content.title)}</h2></div>${badge(inputs.ready ? 'Ready' : 'Blocked', inputs.ready ? 'green' : 'gray')}</div>
    ${row(!!inputs.visualApprovalId, 'Approved visual board', inputs.visualApprovalId ? `${inputs.shots} shots locked by checksum (Room 04)` : 'Approve the visuals in Room 04.')}
    ${row(inputs.narrationSeconds !== null, 'Approved narration', inputs.narrationSeconds !== null ? `${renderClock(inputs.narrationSeconds)} · sets the video length` : 'Approve a narration in the Voice Room.')}
    ${row(!!style && style.adapter === 'ffmpeg-montage', style ? `${esc(style.name)}` : 'Family style', style ? `${esc(style.adapter)} · ${esc(style.transition)} · ${style.fps} fps` : 'Assign a style in Room 03.')}
    ${inputs.blockers.length ? `<p class="inline-warning">${esc(inputs.blockers.join(' '))}</p>` : ''}
    <div class="card-actions">${inputs.ready && engineReady && !active ? action('Render plain assembly', 'render-start', content.contentId, 'secondary') : ''}${!engineReady && inputs.ready ? '<span class="muted">Check and pin FFmpeg first.</span>' : ''}</div></section>`;
}
function renderDetail(content, job) {
  const result = job.result, progress = job.progress;
  const head = `<div class="production-card-head"><div><span class="micro-label">${job.scope.edit ? `EDIT r${job.scope.edit.revision} RENDER` : 'ASSEMBLY PROXY'} · ${esc(date(job.createdAt))}</span><h2>${esc(job.scope.styleName)} r${job.scope.styleRevision} · ${job.scope.shots} shots · ${renderClock(job.scope.narrationSeconds)}</h2></div><div class="row-end">${renderBadge(job.status)}${!job.current && job.status === 'completed' ? badge('Out of date', 'gray') : ''}${job.review ? badge(job.review.decision === 'passed' ? 'Style proof passed' : 'Changes requested', job.review.decision === 'passed' ? 'green' : 'orange') : ''}</div></div>`;
  if (['queued', 'running'].includes(job.status)) {
    const pct = progress?.total ? Math.round(progress.done / progress.total * 100) : 0;
    return `<section class="production-card">${head}<div class="cap-row"><div><strong>${esc(progress?.stage || 'Waiting for the render worker')}</strong><small>Step ${progress?.done || 0} of ${progress?.total || '—'} · attempt ${job.attempts}/3</small></div><div class="cap-meter">${intelMeter(pct, 100, false)}</div></div><div class="card-actions">${action('Cancel', 'render-cancel', job.id, 'text-button danger')}</div></section>`;
  }
  if (!result) return `<section class="production-card">${head}<p class="inline-warning">${esc(job.error || 'No output.')}</p>${progress?.logs?.length ? `<details class="scene-history"><summary>Last FFmpeg messages</summary>${progress.logs.map(item => `<pre class="render-log">${esc(item.step)}\n${esc(item.stderr || '(no output)')}</pre>`).join('')}</details>` : ''}<div class="card-actions">${job.attempts < 3 ? action('Retry', 'render-retry', job.id, 'secondary') : ''}</div></section>`;
  const qc = result.qc.map(check => `<span class="${check.passed ? 'pass' : 'fail'}" title="${esc(check.detail)}">${check.passed ? '✓' : '!'} ${esc(check.name)}</span>`).join('');
  return `<section class="production-card">${head}
    <div class="render-player"><video controls preload="metadata" src="${esc(result.videoUrl)}"></video><div class="render-facts"><dl class="style-facts"><div><dt>Preset</dt><dd>${esc(result.preset.label)} · ${result.preset.width}×${result.preset.height} · ${result.preset.fps} fps</dd></div><div><dt>Transitions</dt><dd>${esc(result.transition.applied)}${result.transition.frames ? ` · ${result.transition.frames} frames` : ''}</dd></div><div><dt>Rendered</dt><dd>${result.renderSeconds} s · ${(result.video.sizeBytes / 1048576).toFixed(1)} MB</dd></div><div><dt>Checksum</dt><dd class="mono-wrap">${esc(result.video.sha256.slice(0, 24))}…</dd></div><div><dt>FFmpeg</dt><dd>${esc(job.scope.ffmpeg.version)} (pinned)</dd></div></dl>
      <div class="qc-checks">${qc}</div>${result.qc.filter(check => !check.passed).map(check => `<p class="inline-warning"><b>${esc(check.name)}:</b> ${esc(check.detail)}</p>`).join('')}
      <p class="hint">Every command, input checksum and log is in the <a href="${esc(result.manifestUrl)}" target="_blank" rel="noopener">render manifest ↗</a>.</p></div></div>
    ${result.sheetUrl ? `<h3 class="intel-subhead">Contact sheet · one frame every ${result.sheet.everySeconds} s</h3><img class="contact-sheet" src="${esc(result.sheetUrl)}" alt="Contact sheet of the proxy">` : ''}
    ${job.review ? `<div class="handoff-rule"><strong>${job.review.decision === 'passed' ? 'Style proof passed' : 'Changes requested'} by ${esc(job.review.reviewer)} · ${esc(date(job.review.at))}</strong><p>${esc(job.review.notes || 'No notes.')}</p></div>` : `<div class="card-actions">${job.current ? '<button class="primary" data-production-room="qc">Review and record the verdict in Room 08</button>' : '<span class="muted">The visuals or narration changed after this render. Render again to review it.</span>'}</div>`}
  </section>`;
}
function renderHistory(content) {
  return `<section class="production-card"><div class="production-card-head"><div><span class="micro-label">HISTORY</span><h2>Earlier renders</h2></div></div><div class="history-list">${content.renders.slice(1).map(job => `<div class="history-row"><span class="job-dot ${job.status === 'completed' ? 'completed' : ''}"></span><div><strong>${renderBadge(job.status)} ${esc(date(job.createdAt))}</strong><small>${job.scope.shots} shots · attempt ${job.attempts}/3${job.result ? ` · QC ${job.result.qcPassed ? 'passed' : 'found issues'} · ${esc(job.result.video.sha256.slice(0, 12))}` : ''}${job.review ? ` · ${esc(job.review.decision.replaceAll('_', ' '))}` : ''}${job.error ? ` · ${esc(job.error)}` : ''}</small></div>${['failed', 'interrupted', 'cancelled', 'stale'].includes(job.status) && job.attempts < 3 ? action('Retry', 'render-retry', job.id, 'text-button') : ''}</div>`).join('')}</div></section>`;
}

function renderDialog(kind, title, kicker, body, submitLabel, data = {}) {
  const form = document.getElementById('render-form');
  form.reset();
  form.dataset.kind = kind;
  form.dataset.payload = JSON.stringify(data);
  document.getElementById('render-heading').textContent = title;
  document.getElementById('render-kicker').textContent = kicker;
  document.getElementById('render-body').innerHTML = body;
  form.querySelector('.form-error').hidden = true;
  form.querySelector('[type=submit]').textContent = submitLabel;
  document.getElementById('render-dialog').showModal();
}
function renderAction(command, id, button) {
  const content = state.renders.contents.find(item => item.contentId === renderContentId);
  if (command === 'render-check') return renderDialog('check', 'Run the FFmpeg readiness check', 'LOCAL CHECK · NO COST', '<p class="hint">Finds FFmpeg and ffprobe, records their versions and SHA-256, checks every filter and encoder the renderer uses, and renders a 2-second fixture twice to prove the output is byte-identical. Takes a few seconds.</p><div class="form-grid">' + renderNameField() + '</div>', 'Run check');
  if (command === 'render-pin') return renderDialog('pin', 'Pin this FFmpeg build', 'REPRODUCIBLE RENDERS', `<p class="hint">Renders will only run with this exact binary (FFmpeg ${esc(state.renders.readiness.ffmpeg.version)}, ${esc(state.renders.readiness.ffmpeg.sha256.slice(0, 16))}…). If the file changes, rendering stops until you check and pin again.</p><div class="form-grid">${renderNameField()}<label>Why this build<input name="reason" required minlength="8" maxlength="500" placeholder="e.g. Gyan full build installed with winget"></label></div>`, 'Pin build', {readinessId: id});
  if (command === 'render-start') return renderDialog('start', 'Render the assembly proxy', 'LOCAL RENDER · NO COST', `<p class="hint">Renders ${content.inputs.shots} shots at proxy resolution with ${esc(content.inputs.style.name)}: Ken Burns motion on stills, held or trimmed clips, ${esc(content.inputs.style.transition)} transitions and the approved narration. Then it checks length, frame, audio, black and frozen frames and builds a contact sheet.</p><div class="form-grid">${renderNameField()}</div>`, 'Render proxy', {contentId: id, visualApprovalId: content.inputs.visualApprovalId});
  if (command === 'render-cancel' || command === 'render-retry') {
    if (button) button.disabled = true;
    return api(`/api/renders/${id}/${command === 'render-cancel' ? 'cancel' : 'retry'}`, {requestedBy: renderPerson() || 'Owner'}).then(refresh).then(() => toast(command === 'render-cancel' ? 'Render cancelled.' : 'Render requeued.')).catch(error => toast(error.message, true)).finally(() => { if (button) button.disabled = false; });
  }
  return toast('Unknown action.', true);
}
document.getElementById('render-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget, kind = form.dataset.kind, data = JSON.parse(form.dataset.payload || '{}');
  const value = name => form.elements[name]?.value ?? '', checked = name => !!form.elements[name]?.checked, person = value('person');
  renderRemember(person);
  let message = null;
  saveForm(form, async () => {
    if (kind === 'check') { const report = await api('/api/render-readiness', {requestedBy: person}); message = report.passed ? `FFmpeg ${report.ffmpeg.version} passed every check.` : `The check found ${report.issues.length} issue(s).`; return; }
    if (kind === 'pin') { await api('/api/render-pins', {readinessId: data.readinessId, pinnedBy: person, reason: value('reason')}); message = 'Build pinned for rendering.'; return; }
    if (kind === 'start') { await api(`/api/content/${data.contentId}/renders`, {requestedBy: person, visualApprovalId: data.visualApprovalId}); message = 'Proxy render queued.'; return; }
    if (kind === 'review') { await api(`/api/renders/${data.id}/review`, {decision: value('decision'), reviewer: person, notes: value('notes'), confirmations: {watchedFully: checked('watchedFully'), styleMatches: checked('styleMatches'), syncReviewed: checked('syncReviewed'), audioReviewed: checked('audioReviewed'), qcAccepted: checked('qcAccepted'), critiqueAccepted: checked('critiqueAccepted')}}); return; }
    throw new Error('Unknown form.');
  }, () => message);
});
document.addEventListener('change', event => { if (event.target.id === 'render-content') { renderContentId = event.target.value; render(); } });
