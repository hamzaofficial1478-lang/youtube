'use strict';
// Room 05 - Editing Room: the editing brain's edit, the critic, owner changes and the edit render (P06 UI), and since
// 0.54 a timeline editor with every track, an inspector for each drawn element, frame previews and typed commands.
// Loaded after render-room.js and before app.js. Helpers from app.js (state, esc, badge, action, api, refresh,
// toast, saveForm, date, render) and render-room.js (renderPerson, renderRemember, renderNameField, renderClock)
// are used only inside functions.

const EDIT_SEVERITY = {critical: ['Critical', 'orange'], suggestion: ['Suggestion', 'gray'], nitpick: ['Polish', 'gray']};
const EDIT_VERDICT = {strong: 'green', acceptable: 'green', revise: 'orange', fail: 'orange'};
const EDIT_MOVE_NAMES = {'push-in': 'Push in', 'pull-out': 'Pull out', 'pan-right': 'Pan right', 'pan-left': 'Pan left', 'push-detail': 'Detail punch-in', static: 'Static'};
const EDIT_TEMPLATE_NAMES = {'scene-text': 'On-screen text', 'title-card': 'Title card', stat: 'Stat reveal', date: 'Date stamp', quote: 'Quote card', 'bar-chart': 'Bar chart', 'line-chart': 'Line chart', timeline: 'Timeline', list: 'List build', comparison: 'Comparison', flow: 'Process diagram'};
// How each animated (canvas) graphic keeps its data: one entry per line.
const EDIT_CANVAS_FORMAT = {'bar-chart': 'One bar per line: label = value (3-9 bars, one unit), e.g. Grain = 34%', 'line-chart': 'One point per line: label = value (3-12 points), e.g. 1970 = 60%', timeline: 'One event per line: year = event (3-7), e.g. 600 BC = First stamped coins', list: 'One item per line (3-6 items)', comparison: 'Two lines, one per side: Name: short detail', flow: 'One step per line, in order (3-6 steps)'};
const editSeconds = (frames, fps) => (frames / fps).toFixed(1);
function editFor(contentId) { return (state.editing?.contents || []).find(item => item.contentId === contentId) || null; }
const editSkill = item => item.skill ? `<span class="chip ${item.skillApproved ? 'green' : 'gray'}" title="${item.skillApproved ? 'You approved this skill' : 'This skill is still a draft on the Skills page'}">${esc(item.skill)}</span>` : '<span class="chip gray">your choice</span>';

// The card shown in Room 05 between the inputs and the proxy renders.
function editCard(content, engineReady) {
  const inputs = content.inputs, room = editFor(content.contentId), edit = room?.edit;
  const intro = '<p class="hint">The editing brain cuts on the measured pauses in the narration, varies shot lengths in a breathing pattern, gives every still a purposeful camera move, keeps transitions for structural moments, and proposes motion graphics where the narration says a number, a date or a quote. Every decision carries its reason, and the critic flags anything boring, lazy or amateur.</p>';
  if (!inputs.ready) return `<section class="production-card"><div class="production-card-head"><div><span class="micro-label">EDITING BRAIN</span><h2>Edit decisions</h2></div>${badge('Waiting for inputs', 'gray')}</div>${intro}<p class="muted">The edit starts when the approved board, narration and style above are ready.</p></section>`;
  if (!edit) return `<section class="production-card"><div class="production-card-head"><div><span class="micro-label">EDITING BRAIN</span><h2>Edit decisions</h2></div>${badge('No edit yet', 'gray')}</div>${intro}<div class="card-actions">${action('Draft the edit', 'tl-generate', content.contentId, 'primary')}</div><p class="hint">Local and free: it measures the narration with FFmpeg and plans the edit on this computer.</p></section>`;
  const tl = edit.timeline, critique = edit.critique, stats = critique.stats, fps = tl.fps;
  const stale = room.current === false;
  const active = content.renders.some(job => ['queued', 'running'].includes(job.status));
  const head = `<div class="production-card-head"><div><span class="micro-label">EDITING BRAIN · EDIT r${edit.revision} · ${edit.actor === 'brain' ? 'drafted by the brain' : `changed by ${esc(edit.createdBy)}`} · ${esc(date(edit.createdAt))}</span><h2>Edit decisions</h2></div><div class="row-end">${badge(`Slideshow risk ${critique.slideshow.score} · ${critique.slideshow.verdict}`, EDIT_VERDICT[critique.slideshow.verdict] || 'gray')}${critique.counts.critical ? badge(`${critique.counts.critical} critical`, 'orange') : ''}${stale ? badge('Out of date', 'gray') : ''}</div></div>`;
  const timing = edit.timing ? `${edit.timing.method === 'pause-aligned' ? `Cuts follow the narration's measured pauses (${edit.timing.matched} of ${edit.timing.boundaries} sentence breaks found)` : 'Cuts use the word-count estimate'}. ${esc(edit.timing.note || '')}` : '';
  const facts = `<dl class="style-facts edit-facts"><div><dt>Clips</dt><dd>${stats.clips} · average ${stats.averageShotSeconds} s · ${stats.cutsPerMinute} cuts/min</dd></div><div><dt>Footage</dt><dd>${Math.round(stats.videoShare * 100)}% moving clips · ${Math.round(stats.stillShare * 100)}% stills with camera moves</dd></div><div><dt>Transitions</dt><dd>${esc(stats.transitionTypes.join(', '))} · ${stats.softTransitions} soft</dd></div><div><dt>Longest hold</dt><dd>${Number(stats.longestUnchangedSeconds).toFixed(1)} s without a change</dd></div><div><dt>Graphics</dt><dd>${stats.graphicsAccepted} on screen · ${stats.graphicsProposed} proposed</dd></div><div><dt>Timing</dt><dd>${timing}</dd></div></dl>`;
  const actions = `<div class="card-actions edit-actions">${!stale && engineReady && !active ? action('Render this edit', 'tl-render', edit.id, 'primary') : ''}${!stale && edit.revision > 1 ? action('Undo last change', 'tl-undo', edit.id, 'secondary') : ''}${action(stale ? 'Draft a new edit' : 'Draft a fresh edit', 'tl-generate', content.contentId, stale ? 'primary' : 'secondary')}${!engineReady ? '<span class="muted">Check and pin FFmpeg to render.</span>' : ''}</div>`;
  return `<section class="production-card edit-card">${head}${stale ? `<p class="inline-warning">${esc(room.staleReason || 'The inputs changed.')}</p>` : ''}${tlEditor(content, edit, stale)}${facts}${actions}
    ${editFindings(edit, stale)}${editGraphics(tl, stale)}${editCaptions(edit, stale)}${editClips(tl, stale)}${editCraft(room)}${editHistory(room)}</section>`;
}
// Captions (P07): the rail the render burns in, and the SRT file for YouTube's own player.
function captionLine(group) {
  let index = 0;
  return group.lines.map(line => line.split(' ').map(word => { const out = index === group.emphasis ? `<mark>${esc(word)}</mark>` : esc(word); index++; return out; }).join(' ')).join(' <span class="muted">/</span> ');
}
function editCaptions(edit, stale) {
  const captions = edit.timeline.captions;
  if (!captions) return '<h3 class="intel-subhead">Captions</h3><p class="hint">This edit was drafted before captions existed. Draft a fresh edit to add them.</p>';
  const vertical = edit.timeline.format === 'shorts', groups = captions.groups, edited = groups.filter(group => group.edited).length;
  const toggle = stale ? '' : captions.enabled ? action('Switch captions off', 'tl-captions', 'off', 'secondary') : action('Switch captions on', 'tl-captions', 'on', 'primary');
  return `<h3 class="intel-subhead">Captions · ${captions.enabled ? 'burned into the render' : 'off'} · ${groups.length} captions</h3>
    <p class="hint">${esc(captions.note)} ${vertical ? 'On this vertical video the captions sit above the Shorts buttons and step aside while a full-screen graphic shows its own text.' : 'They sit in the bottom band; graphics stay above it.'} At most one word per caption is lifted in the accent colour: figures and words like "never" or "only", and never in two captions in a row.</p>
    <div class="card-actions">${toggle}<a class="button secondary" href="/api/edit-revisions/${esc(edit.id)}/captions.srt" download>Download SRT for YouTube</a><a class="button secondary" href="/api/edit-revisions/${esc(edit.id)}/captions.vtt" download>Download WebVTT</a></div>
    <details class="scene-history"><summary>Read and correct the captions (${groups.length}${edited ? `, ${edited} corrected by hand` : ''})</summary><div class="history-list caption-list">${groups.map(group => `<div class="history-row"><span class="muted">${renderClock(group.start)}</span><span>${captionLine(group)}${group.edited ? ' <span class="muted">· corrected</span>' : ''}</span>${stale ? '' : action('Correct', 'tl-caption', group.id, 'secondary')}</div>`).join('')}</div></details>`;
}

// YouTube craft drafts (youtube-agent-skill): chapters, Shorts spans and the retention reader. Nothing here publishes.
const CRAFT_BAND = {strong: 'green', workable: 'orange', weak: 'gray'};
function editCraft(room) {
  const craft = room.craft;
  if (!craft) return '';
  const {chapters, shorts} = craft;
  const chapterBlock = chapters ? `<details class="scene-history craft-chapters"><summary>YouTube chapters · draft · ${chapters.valid ? `${chapters.chapters.length} chapters, valid` : 'not valid yet'}</summary>${chapters.problems.length ? `<ul class="craft-issues">${chapters.problems.map(problem => `<li>✕ ${esc(problem)}</li>`).join('')}</ul>` : ''}${chapters.chapters.length ? `<pre>${esc(chapters.text)}</pre><p class="hint">Boundaries come from the narration's pauses, the change of topic words across them and the board's scenes. The titles are topic words: rewrite each one before pasting it under the video. YouTube needs 0:00 first, at least 3 chapters and 10 seconds each.</p>` : ''}</details>` : '';
  const shortBlock = shorts?.applicable ? `<details class="scene-history"><summary>Shorts inside this video · ${shorts.candidates.length} candidate${shorts.candidates.length === 1 ? '' : 's'}</summary>${shorts.candidates.length ? `<div class="craft-shorts">${shorts.candidates.map((item, index) => `<div class="craft-short"><div class="card-top"><b>${index + 1}. ${renderClock(item.start)}–${renderClock(item.end)} · ${item.seconds} s</b>${badge(`Opening line ${item.hook.verdict} · ${item.hook.band}`, CRAFT_BAND[item.hook.band] || 'gray')}</div><p>“${esc(item.firstLine)}”</p><p class="hint">Turn: “${esc(item.turnLine)}”${item.lastLine !== item.turnLine ? `<br>Ends: “${esc(item.lastLine)}”` : ' (it also ends the Short)'}</p><p class="hint">${esc(item.why.join(' '))}</p></div>`).join('')}</div><ul class="hint">${shorts.writing.map(line => `<li>${esc(line)}</li>`).join('')}</ul>` : '<p class="hint">No 20-55 second span opens on a complete thought, turns and ends on a line.</p>'}</details>` : shorts ? `<p class="hint">${esc(shorts.reason)}</p>` : '';
  const retention = `<details class="scene-history"><summary>Read a YouTube retention export</summary><p class="hint">Once this video is live: YouTube Studio → Analytics → the video → Engagement → Audience retention → download as CSV, then paste it here. You get the hook leak, the cliffs (with what the narration said at each) and the slide, ending in one fix.</p><textarea id="retention-${esc(room.contentId)}" rows="4" maxlength="200000" aria-label="Retention CSV" placeholder="Video position (%),Absolute audience retention (%)"></textarea><div class="card-actions">${action('Read the export', 'tl-retention', room.contentId, 'secondary')}</div><div id="retention-out-${esc(room.contentId)}" aria-live="polite"></div></details>`;
  return `<h3 class="intel-subhead">YouTube craft · drafts for you, never published</h3>${chapterBlock}${shortBlock}${retention}`;
}
function retentionView(result) {
  const where = cliff => (cliff.atSeconds !== null ? renderClock(cliff.atSeconds) : `position ${cliff.from}`);
  return `<div class="craft"><div class="card-top"><strong>Hook leak ${result.hookLeak}% · ${esc(result.verdict)}</strong>${badge(`${result.points} points · ${result.start}% → ${result.end}%`, 'gray')}</div>
    <p><b>One fix:</b> ${esc(result.fix)}</p>
    ${result.cliffs.length ? `<ul class="craft-issues">${result.cliffs.map(cliff => `<li>−${cliff.lost}% at ${where(cliff)}${cliff.said ? ` · “${esc(cliff.said)}”` : ''}</li>`).join('')}</ul>` : '<p class="hint">No drop steeper than 0.8%: the loss is all slide, not moments.</p>'}
    <p class="hint">Slide ${result.slide}% per ${result.axis === 'percent' ? 'percent of the video' : 'second'} across the middle. A steady slide is pacing: cut the middle rather than rewriting it.</p></div>`;
}


// What the brain already fixed in its draft, so the owner sees it and can change it back.
function editAutoFixes(edit) {
  const fixed = edit.autoFixes || [];
  return fixed.length ? `<details class="scene-warnings"><summary>Fixed automatically by the editing brain · ${fixed.length}</summary><ul class="intel-list">${fixed.map(item => `<li><b>${esc(item.message)}</b> ${esc(item.fix)}</li>`).join('')}</ul><p class="hint">Each change is already in the edit; change any clip back if you prefer it.</p></details>` : '';
}
function editFindings(edit, stale) {
  const findings = edit.findings || [];
  if (!findings.length) return `${editAutoFixes(edit)}<h3 class="intel-subhead">Editor's critique</h3><p class="muted">Nothing left to fix. The edit follows every rule the critic checks.</p>`;
  return `${editAutoFixes(edit)}<h3 class="intel-subhead">Editor's critique · ${findings.length} finding${findings.length === 1 ? '' : 's'} left</h3><p class="hint">What is left needs new visuals, a new narration or your taste, so the brain did not change it by itself.</p><div class="edit-findings">${findings.map((item, index) => {
    const [label, color] = EDIT_SEVERITY[item.severity] || [item.severity, 'gray'];
    return `<div class="edit-finding ${esc(item.severity)}"><div>${badge(label, color)} ${editSkill(item)}</div><p><b>${esc(item.message)}</b><br>${esc(item.fix)}${item.route === 'script' ? ' <span class="muted">(fix it in the script)</span>' : ''}</p>${item.op && !stale ? action('Apply this fix', 'tl-fix', String(index), 'secondary') : ''}</div>`;
  }).join('')}</div>`;
}

function editGraphics(tl, stale) {
  const add = stale ? '' : `<div class="card-actions">${action('+ Add a graphic', 'tl-graphic-add', '', 'secondary')}</div>`;
  if (!tl.graphics.length) return `<h3 class="intel-subhead">Motion graphics</h3><p class="muted">The narration has no number, date, quote, list or chapter text that needs a graphic.</p>${add}`;
  const statusBadge = status => badge(status === 'accepted' ? 'On screen' : status === 'rejected' ? 'Rejected' : 'Proposed', status === 'accepted' ? 'green' : status === 'rejected' ? 'gray' : 'orange');
  return `<h3 class="intel-subhead">Motion graphics · only accepted graphics are rendered</h3><div class="history-list">${tl.graphics.map(item => `<div class="history-row edit-graphic-row"><span class="job-dot ${item.status === 'accepted' ? 'completed' : ''}"></span><div><strong>${esc(EDIT_TEMPLATE_NAMES[item.template] || item.template)} · ${renderClock(item.start / tl.fps)} · ${editSeconds(item.frames, tl.fps)} s ${statusBadge(item.status)} ${editSkill(item)}</strong><small>“${esc(item.lines.join(' / '))}”${item.accent ? ` · accent: ${esc(item.accent)}${item.accentSource ? ` (${esc(item.accentSource)})` : ''}` : ''}<br>${esc(item.reason)}</small>${stale ? '' : `<div class="card-actions">${item.status !== 'accepted' ? action('Accept', 'tl-graphic-accept', item.id, 'text-button') : ''}${item.status !== 'rejected' ? action('Reject', 'tl-graphic-reject', item.id, 'text-button danger') : ''}${action('Edit', 'tl-graphic', item.id, 'text-button')}</div>`}</div></div>`).join('')}</div>${add}`;
}

function editClips(tl, stale) {
  const join = index => tl.joins[index];
  const rows = tl.clips.map((clip, index) => {
    const what = clip.mediaType === 'video' ? `${clip.speed < 1 ? `slowed to ${Math.round(clip.speed * 100)}%` : 'clip'}${clip.inSeconds ? ` from ${clip.inSeconds} s` : ''}` : (EDIT_MOVE_NAMES[clip.move?.kind] || 'still');
    const after = index < tl.joins.length && join(index).type !== 'cut' ? ` → ${esc(join(index).type)} ${editSeconds(join(index).frames, tl.fps)} s` : '';
    return `<tr><td><b>${esc(clip.label)}</b>${clip.hero ? ' ★' : ''}</td><td>${renderClock(clip.start / tl.fps)}</td><td>${editSeconds(clip.frames, tl.fps)} s</td><td>${esc(what)}${after}</td><td>${esc(clip.reason)} ${esc(clip.moveReason || clip.trimReason || '')}</td><td>${stale ? '' : action('Change', 'tl-clip', clip.id, 'text-button')}</td></tr>`;
  }).join('');
  const sceneButtons = stale ? '' : `<div class="card-actions edit-scenes"><span class="muted">Redo one scene (the rest of the edit stays as it is):</span>${tl.scenes.map(scene => action(`${esc(scene.label)} · ${esc(scene.purpose)}`, 'tl-regen', scene.id, 'text-button')).join('')}</div>`;
  return `<details class="scene-history edit-decisions"><summary>Every cut and its reason (${tl.clips.length} clips)</summary><div class="edit-table"><table class="data-table"><thead><tr><th>Clip</th><th>At</th><th>Hold</th><th>Move</th><th>Why</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>${sceneButtons}</details>`;
}

function editHistory(room) {
  if (!room.history || room.history.length < 2) return '';
  return `<details class="scene-history"><summary>${room.history.length} revisions</summary><div class="history-list">${room.history.map(item => `<div class="history-row"><span class="job-dot ${item.latest ? 'completed' : ''}"></span><div><strong>r${item.revision} · ${item.actor === 'brain' ? 'editing brain' : esc(item.createdBy)} · ${esc(date(item.createdAt))}</strong><small>${esc(item.note)} · slideshow risk ${item.critique.slideshow.score} · ${item.critique.counts.critical} critical, ${item.critique.counts.suggestion} suggestions</small></div></div>`).join('')}</div></details>`;
}

// ------------------------------------------------------------ actions and forms
function editDialog(kind, title, kicker, body, submitLabel, data = {}) {
  const form = document.getElementById('edit-form');
  form.reset();
  form.dataset.kind = kind;
  form.dataset.payload = JSON.stringify(data);
  document.getElementById('edit-heading').textContent = title;
  document.getElementById('edit-kicker').textContent = kicker;
  document.getElementById('edit-body').innerHTML = body;
  form.querySelector('.form-error').hidden = true;
  form.querySelector('[type=submit]').textContent = submitLabel;
  document.getElementById('edit-dialog').showModal();
}
function editContext() {
  const content = state.renders.contents.find(item => item.contentId === renderContentId);
  const room = content ? editFor(content.contentId) : null;
  return {content, room, edit: room?.edit || null};
}
async function editSend(edit, ops, note) {
  const person = renderPerson() || 'Owner';
  await api(`/api/edit-revisions/${edit.id}/ops`, {editedBy: person, ops, ...(note ? {note} : {})});
}
const TL_COMMANDS = new Set(['tl-step', 'tl-frame', 'tl-ask', 'tl-apply', 'tl-discard', 'tl-json', 'tl-save-drawing', 'tl-reset-drawing', 'tl-discard-drawing', 'tl-el-up', 'tl-el-down', 'tl-el-remove', 'tl-el-add']);
function editAction(command, id, button) {
  if (TL_COMMANDS.has(command)) return tlAction(command, id, button);
  const {content, edit} = editContext();
  if (command === 'tl-generate') return editDialog('generate', 'Draft the edit', 'EDITING BRAIN · LOCAL · NO COST', `<p class="hint">Measures the pauses in the approved narration, then cuts, times and moves every shot with a reason, proposes graphics and runs the critic. ${edit ? 'Your earlier edit stays in the history; this makes a new revision from scratch.' : ''}</p><div class="form-grid">${renderNameField()}</div>`, 'Draft the edit', {contentId: id, visualApprovalId: content.inputs.visualApprovalId});
  if (command === 'tl-retention') {
    const out = document.getElementById(`retention-out-${id}`), csv = document.getElementById(`retention-${id}`)?.value || '';
    if (button) button.disabled = true;
    return api(`/api/content/${id}/retention`, {csv}).then(result => { out.innerHTML = retentionView(result); }).catch(error => toast(error.message, true)).finally(() => { if (button) button.disabled = false; });
  }
  if (!edit) return toast('Draft an edit first.', true);
  const tl = edit.timeline;
  const run = (ops, message) => { if (button) button.disabled = true; return editSend(edit, ops).then(refresh).then(() => toast(message)).catch(error => toast(error.message, true)).finally(() => { if (button) button.disabled = false; }); };
  if (command === 'tl-graphic-accept') return run([{type: 'set-graphic', graphicId: id, status: 'accepted'}], 'Graphic accepted.');
  if (command === 'tl-graphic-reject') return run([{type: 'set-graphic', graphicId: id, status: 'rejected'}], 'Graphic rejected.');
  if (command === 'tl-captions') return run([{type: 'set-captions', enabled: id === 'on'}], id === 'on' ? 'Captions switched on.' : 'Captions switched off.');
  if (command === 'tl-fix') { const finding = edit.findings[Number(id)]; return finding?.op ? run([finding.op], 'Fix applied.') : toast('That finding has no automatic fix.', true); }
  if (command === 'tl-regen') { const scene = tl.scenes.find(item => item.id === id); return run([{type: 'regenerate-scene', sceneId: id}], `${scene?.label || 'Scene'} redone.`); }
  if (command === 'tl-undo') { if (button) button.disabled = true; return api(`/api/edit-revisions/${id}/undo`, {editedBy: renderPerson() || 'Owner'}).then(refresh).then(() => toast('Last change undone.')).catch(error => toast(error.message, true)).finally(() => { if (button) button.disabled = false; }); }
  if (command === 'tl-render') {
    const criticals = edit.critique.counts.critical;
    return editDialog('render', 'Render this edit', 'LOCAL RENDER · NO COST', `<p class="hint">Renders edit r${edit.revision} at proxy resolution with your pinned FFmpeg: ${tl.clips.length} clips with their own holds and camera moves, ${edit.critique.stats.softTransitions} soft transitions, ${edit.critique.stats.graphicsAccepted} graphics and a fade-out ending. Then it runs the technical QC.</p>${criticals ? `<p class="inline-warning">The critic still has ${criticals} critical finding${criticals === 1 ? '' : 's'}. You can render to look at it, but the style-proof verdict will ask you to accept ${criticals === 1 ? 'it' : 'them'}.</p>` : ''}<div class="form-grid">${renderNameField()}<label>Preview size<select name="resolution"><option value="360">360p (fast)</option><option value="720">720p (sharper, slower)</option></select></label></div>`, 'Render edit', {contentId: content.contentId, visualApprovalId: content.inputs.visualApprovalId, editRevisionId: edit.id});
  }
  if (command === 'tl-clip') {
    const index = tl.clips.findIndex(item => item.id === id), clip = tl.clips[index];
    if (!clip) return toast('That clip is no longer in this edit.', true);
    const join = tl.joins[index], last = index === tl.clips.length - 1, transitions = state.editing.transitions;
    const scene = tl.scenes.find(item => item.id === clip.sceneId), members = tl.clips.filter(item => item.sceneId === clip.sceneId);
    const body = `<p class="hint"><b>${esc(clip.label)}</b> · ${renderClock(clip.start / tl.fps)} · ${esc(clip.reason)} ${esc(clip.moveReason || clip.trimReason || '')}</p><div class="form-grid">
      ${last ? '' : `<label>Hold (seconds)<input name="hold" type="number" step="0.01" min="0.5" value="${(clip.frames / tl.fps).toFixed(2)}"><span class="hint">Moves the cut after this clip; the next clip absorbs the change.</span></label>`}
      ${clip.mediaType === 'image' ? `<label>Camera move<select name="move">${state.editing.moves.map(move => `<option value="${move}" ${clip.move?.kind === move ? 'selected' : ''}>${esc(EDIT_MOVE_NAMES[move] || move)}</option>`).join('')}</select></label>` : `<label>Start the clip at (seconds)<input name="in" type="number" step="0.05" min="0" value="${clip.inSeconds}"></label>`}
      ${last ? '' : `<label>Transition after it<select name="transition">${(transitions.includes(join.type) ? transitions : [join.type, ...transitions]).map(type => `<option value="${type}" ${join.type === type ? 'selected' : ''}>${esc(type)}</option>`).join('')}</select></label><label>Transition length (seconds)<input name="transitionSeconds" type="number" step="0.01" min="0.1" value="${join.type === 'cut' ? '0.60' : (join.frames / tl.fps).toFixed(2)}"></label>`}
      ${members.length > 1 ? `<label>Position in ${esc(scene.label)}<select name="position">${members.map((item, k) => `<option value="${k}" ${item.id === clip.id ? 'selected' : ''}>${k + 1}</option>`).join('')}</select></label>` : ''}
      </div><label class="checkbox-label"><input type="checkbox" name="hero" ${clip.hero ? 'checked' : ''}>Hero shot (the brain holds heroes longer when it redoes the scene).</label>`;
    return editDialog('clip', `Change ${clip.label}`, 'OWNER EDIT · NEW REVISION', body, 'Save change', {clipId: clip.id, revisionId: edit.id});
  }
  if (command === 'tl-graphic-add') {
    const options = Object.entries(EDIT_TEMPLATE_NAMES).map(([key, label]) => `<option value="${key}">${esc(label)}${Object.hasOwn(EDIT_CANVAS_FORMAT, key) ? ' (animated)' : ''}</option>`).join('');
    const body = `<p class="hint">Add a graphic the brain did not propose. It goes on screen at once and may not overlap another graphic. Animated graphics are drawn in your local browser at render time.</p><div class="form-grid">
      <label>Graphic<select name="template">${options}</select></label><label>Starts at (seconds)<input name="start" type="number" step="0.01" min="0" max="${(tl.totalFrames / tl.fps).toFixed(2)}" value="0.00" required></label>
      <label>On screen (seconds)<input name="seconds" type="number" step="0.01" min="0.8" value="5.00" required></label><label>Accent word (title cards)<input name="accent" maxlength="30"></label>
      <label class="full">Title (animated graphics, optional)<input name="title" maxlength="80"></label>
      <label class="full">Text or data<textarea name="lines" rows="6" maxlength="1500" required></textarea><span class="hint">${Object.entries(EDIT_CANVAS_FORMAT).map(([key, format]) => `${esc(EDIT_TEMPLATE_NAMES[key])}: ${esc(format)}`).join('<br>')}<br>Text graphics: 1-3 lines.</span></label></div>`;
    return editDialog('graphic-add', 'Add a graphic', 'OWNER EDIT · NEW REVISION', body, 'Add graphic', {revisionId: edit.id});
  }
  if (command === 'tl-caption') {
    const group = tl.captions?.groups.find(item => item.id === id);
    if (!group) return toast('That caption is no longer in this edit.', true);
    const marked = group.text.split(' ').map((word, index) => (index === group.emphasis ? `*${word}*` : word)).join(' ');
    const body = `<p class="hint">Shown ${renderClock(group.start)}–${renderClock(group.end)}. The narration says: “${esc(group.words.map(word => word.text).join(' '))}” Fix the spelling or write a figure as digits; the timing stays with the narration. Put *asterisks* around one word to lift it in the accent colour.</p><div class="form-grid"><label class="full">Caption<input name="caption" maxlength="200" value="${esc(marked)}"></label>${group.edited ? '<label class="full checkbox-label"><input type="checkbox" name="reset">Go back to the narration’s own words</label>' : ''}</div>`;
    return editDialog('caption', `Caption at ${renderClock(group.start)}`, 'OWNER EDIT · NEW REVISION', body, 'Save caption', {groupId: group.id, revisionId: edit.id});
  }
  if (command === 'tl-graphic') {
    const item = tl.graphics.find(graphic => graphic.id === id);
    if (!item) return toast('That graphic is no longer in this edit.', true);
    const canvas = Object.hasOwn(EDIT_CANVAS_FORMAT, item.template);
    const body = `<p class="hint">${esc(item.reason)}</p><div class="form-grid">${canvas ? `<label class="full">Title (optional)<input name="title" maxlength="80" value="${esc(item.title || '')}"></label>` : ''}<label class="full">${canvas ? 'Data' : 'Text (one line per row, at most 3)'}<textarea name="lines" rows="${canvas ? 7 : 3}" maxlength="1500">${esc(item.lines.join('\n'))}</textarea>${canvas ? `<span class="hint">${esc(EDIT_CANVAS_FORMAT[item.template])}. Every number must come from the script or a cited source.</span>` : ''}</label>
      ${item.template === 'title-card' ? `<label>Accent word<input name="accent" maxlength="30" value="${esc(item.accent || '')}"><span class="hint">Exactly one word is drawn in the accent colour.</span></label>` : ''}
      <label>On screen (seconds)<input name="seconds" type="number" step="0.01" min="0.8" value="${(item.frames / tl.fps).toFixed(2)}"></label>
      <label>Status<select name="status">${['accepted', 'proposed', 'rejected'].map(status => `<option value="${status}" ${item.status === status ? 'selected' : ''}>${status === 'accepted' ? 'On screen' : status === 'proposed' ? 'Proposed' : 'Rejected'}</option>`).join('')}</select></label></div>`;
    return editDialog('graphic', `${EDIT_TEMPLATE_NAMES[item.template] || 'Graphic'} at ${renderClock(item.start / tl.fps)}`, 'OWNER EDIT · NEW REVISION', body, 'Save graphic', {graphicId: item.id, template: item.template, revisionId: edit.id});
  }
  return toast('Unknown action.', true);
}
document.getElementById('edit-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget, kind = form.dataset.kind, data = JSON.parse(form.dataset.payload || '{}');
  const value = name => form.elements[name]?.value ?? '', person = value('person') || renderPerson() || 'Owner';
  if (value('person')) renderRemember(value('person'));
  let message = null;
  saveForm(form, async () => {
    if (kind === 'generate') { const edit = await api(`/api/content/${data.contentId}/edits`, {requestedBy: person, visualApprovalId: data.visualApprovalId}); message = `Edit r${edit.revision} drafted: ${edit.critique.counts.critical} critical, ${edit.critique.counts.suggestion} suggestions.`; return; }
    if (kind === 'render') { await api(`/api/content/${data.contentId}/renders`, {requestedBy: person, visualApprovalId: data.visualApprovalId, editRevisionId: data.editRevisionId, resolution: Number(value('resolution') || 360)}); message = 'Edit render queued.'; return; }
    const {edit} = editContext();
    if (!edit || edit.id !== data.revisionId) throw new Error('The edit changed while this form was open. Close it and try again.');
    const tl = edit.timeline, ops = [];
    if (kind === 'clip') {
      const index = tl.clips.findIndex(item => item.id === data.clipId), clip = tl.clips[index], join = tl.joins[index];
      // Only fields the owner actually changed become operations (compare with the value the form opened with).
      const changed = name => form.elements[name] && form.elements[name].value !== form.elements[name].defaultValue;
      if (changed('hold')) ops.push({type: 'set-hold', clipId: clip.id, seconds: Number(value('hold'))});
      if (form.elements.move && value('move') !== clip.move?.kind) ops.push({type: 'set-move', clipId: clip.id, kind: value('move')});
      if (changed('in')) ops.push({type: 'set-in', clipId: clip.id, seconds: Number(value('in'))});
      if (form.elements.transition) {
        const type = value('transition'), seconds = Number(value('transitionSeconds'));
        if (type !== join.type || (type !== 'cut' && changed('transitionSeconds'))) ops.push({type: 'set-transition', clipId: clip.id, transition: type, ...(type === 'cut' ? {} : {seconds})});
      }
      if (form.elements.position) { const members = tl.clips.filter(item => item.sceneId === clip.sceneId), to = Number(value('position')); if (members[to]?.id !== clip.id) ops.push({type: 'reorder', sceneId: clip.sceneId, clipId: clip.id, toIndex: to}); }
      if (form.elements.hero.checked !== !!clip.hero) ops.push({type: 'set-hero', clipId: clip.id, hero: form.elements.hero.checked});
    } else if (kind === 'caption') {
      if (form.elements.reset?.checked) ops.push({type: 'set-caption', groupId: data.groupId, reset: true});
      else if (form.elements.caption.value !== form.elements.caption.defaultValue) ops.push({type: 'set-caption', groupId: data.groupId, text: value('caption')});
    } else if (kind === 'audio') {
      const musicOn = !!form.elements.musicEnabled?.checked && !!data.scoreId;
      ops.push({type: 'set-audio', settings: {mode: value('audioMode'), targetLufs: Number(value('targetLufs')), truePeakDb: Number(value('truePeakDb')),
        music: {enabled: musicOn, levelLufs: Number(value('musicLevel')), duck: value('musicDuck'), fadeSeconds: Number(value('musicFade')), scoreId: musicOn ? data.scoreId : null},
        sfx: {enabled: !!form.elements.sfxEnabled?.checked, density: value('sfxDensity'), levelDb: Number(value('sfxLevel'))}}});
    } else if (kind === 'graphic-add') {
      ops.push({type: 'add-graphic', template: value('template'), startSeconds: Number(value('start')), seconds: Number(value('seconds')), title: value('title'), accent: value('accent') || undefined, lines: value('lines').split('\n').map(line => line.trim()).filter(Boolean)});
    } else if (kind === 'graphic') {
      const item = tl.graphics.find(graphic => graphic.id === data.graphicId);
      const lines = value('lines').split('\n').map(line => line.trim()).filter(Boolean);
      const op = {type: 'set-graphic', graphicId: item.id};
      if (lines.join('\n') !== item.lines.join('\n') || (form.elements.accent && value('accent') !== (item.accent || ''))) { op.lines = lines; if (form.elements.accent && value('accent')) op.accent = value('accent'); }
      if (form.elements.title && value('title') !== (item.title || '')) op.title = value('title');
      if (form.elements.seconds.value !== form.elements.seconds.defaultValue) op.seconds = Number(value('seconds'));
      if (value('status') !== item.status) op.status = value('status');
      if (Object.keys(op).length > 2) ops.push(op);
    }
    if (!ops.length) { message = 'Nothing changed.'; return; }
    await editSend(edit, ops);
    message = `Saved as a new revision (${ops.length} change${ops.length === 1 ? '' : 's'}).`;
  }, () => message);
});

// ------------------------------------------------------------ the timeline editor (0.54)
// Owner request 2026-10-22: the Editing Room works like an editing program. Every track is shown (scenes, picture,
// transitions, the drawing beats of drawn shots, graphics, captions, audio); clicking selects; the inspector shows and
// changes everything about the selection (each drawn element's words, animation, entrance, effect, timing, colour,
// position; the shot's set, mood, camera, film and texture); any moment previews as a frame; the rendered preview plays
// in step with the playhead; and the owner can type what to change for Claude to propose. Every change is a new
// revision, checked like any other.
const TL = {rev: null, zoom: 1, at: 0, sel: null, drawings: null, loading: false, drafts: {}, frame: null, command: '', scope: 'clip', proposal: null, busy: false};
const TL_ROWS = [['ruler', 'Time', 22], ['scenes', 'Scenes', 22], ['picture', 'Picture', 34], ['joins', 'Transitions', 20], ['beats', 'Drawing beats', 22], ['graphics', 'Graphics', 18], ['captions', 'Captions', 18], ['audio', 'Audio', 18]];
const TL_SHOT_KEYS = ['type', 'set', 'mood', 'camera', 'transition', 'film', 'texture', 'look', 'board', 'design'];
const TL_ADD = {text: {kind: 'text', text: 'New words', style: 'title'}, figure: {kind: 'figure', pose: 'stand', expression: 'happy'}, prop: {kind: 'prop', prop: 'coin'}, fx: {kind: 'fx', effect: 'sparkle'}, arrow: {kind: 'arrow', from: [0.3, 0.6], to: [0.6, 0.4]}, bubble: {kind: 'bubble', text: 'Words', of: 0}};
const tlSeconds = (frames, fps) => frames / fps;
const tlClock = seconds => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;
function tlClipAt(tl, seconds) { const frame = Math.round(seconds * tl.fps); return tl.clips.find(clip => frame >= clip.start && frame < clip.start + clip.frames) || tl.clips.at(-1); }
function tlSketch(clipId) { return TL.drafts[clipId] || TL.drawings?.clips?.[clipId]?.sketch || null; }
function tlLoad(edit) {
  if (TL.rev !== edit.id) { TL.rev = edit.id; TL.drawings = null; TL.drafts = {}; TL.proposal = null; TL.frame = null; if (TL.sel && !edit.timeline.clips.some(clip => clip.id === TL.sel.clipId)) TL.sel = null; }
  if (TL.drawings || TL.loading) return;
  TL.loading = true;
  api(`/api/edit-revisions/${edit.id}/drawings`, null, 'GET').then(result => { if (TL.rev === result.revisionId) TL.drawings = result; }).catch(error => { TL.drawings = {revisionId: edit.id, clips: {}, vocab: {}, error: error.message}; }).finally(() => { TL.loading = false; render(); });
}
function tlRender(content) {
  // The newest finished render of this edit (or of an earlier revision), played in step with the playhead.
  return (content.renders || []).filter(job => job.status === 'completed' && job.scope?.edit).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .sort((a, b) => (b.scope.edit.revisionId === TL.rev) - (a.scope.edit.revisionId === TL.rev))[0] || null;
}
function tlTracks(tl, stale) {
  const total = tlSeconds(tl.totalFrames, tl.fps), pps = Math.max(900 / total, 4) * TL.zoom, W = Math.ceil(total * pps) + 2, x = seconds => (seconds * pps).toFixed(1);
  let y = 0;
  const rows = Object.fromEntries(TL_ROWS.map(([key, , h]) => { const row = [y, h]; y += h + 4; return [key, row]; })), H = y;
  const sel = (kind, id) => (TL.sel?.kind === kind && TL.sel?.id === id ? ' sel' : '');
  const out = [];
  const [ry] = rows.ruler, step = [1, 2, 5, 10, 15, 30, 60, 120, 300].find(value => value * pps >= 60) || 600;
  for (let s = 0; s <= total; s += step) out.push(`<line class="tl-tick" x1="${x(s)}" x2="${x(s)}" y1="${ry + 14}" y2="${ry + 22}"></line><text class="tl-time" x="${x(s) + 3}" y="${ry + 11}">${esc(renderClock(s))}</text>`);
  const [sy, sh] = rows.scenes;
  tl.scenes.forEach((scene, k) => { const end = k + 1 < tl.scenes.length ? tl.scenes[k + 1].startFrame : tl.totalFrames, w = (end - scene.startFrame) / tl.fps * pps; out.push(`<rect class="tl-scene" x="${x(scene.startFrame / tl.fps)}" y="${sy}" width="${Math.max(1, w - 1).toFixed(1)}" height="${sh}" rx="3"></rect>${w > 50 ? `<text class="tl-label" x="${x(scene.startFrame / tl.fps) + 4}" y="${sy + 15}">${esc(`${scene.label} · ${scene.purpose}`.slice(0, Math.floor(w / 6.5)))}</text>` : ''}`); });
  const [py, ph] = rows.picture, drawn = TL.drawings?.clips || {};
  tl.clips.forEach(clip => {
    const kind = drawn[clip.id]?.designed ? 'designed' : drawn[clip.id] ? 'drawn' : clip.mediaType === 'image' ? 'still' : 'video', w = clip.frames / tl.fps * pps;
    out.push(`<rect class="tl-clip ${kind}${tl.drawings?.[clip.id] ? ' edited' : ''}${clip.hero ? ' hero' : ''}${sel('clip', clip.id)}" x="${x(clip.start / tl.fps)}" y="${py}" width="${Math.max(1, w - 1).toFixed(1)}" height="${ph}" rx="3" data-sel="clip" data-id="${esc(clip.id)}"><title>${esc(clip.label)} · ${(clip.frames / tl.fps).toFixed(2)} s · ${kind}</title></rect>${w > 34 ? `<text class="tl-label on" x="${x(clip.start / tl.fps) + 4}" y="${py + 21}">${esc(clip.label)}</text>` : ''}`);
  });
  const [jy, jh] = rows.joins;
  tl.joins.forEach((join, k) => {
    const at = tl.clips[k + 1].start / tl.fps, id = tl.clips[k].id;
    out.push(join.type === 'cut' ? `<rect class="tl-join cut${sel('join', id)}" x="${(at * pps - 3).toFixed(1)}" y="${jy + 4}" width="6" height="${jh - 8}" data-sel="join" data-id="${esc(id)}"><title>Cut after ${esc(tl.clips[k].label)}</title></rect>`
      : `<rect class="tl-join soft${sel('join', id)}" x="${(at * pps - join.frames / tl.fps * pps / 2).toFixed(1)}" y="${jy}" width="${Math.max(6, join.frames / tl.fps * pps).toFixed(1)}" height="${jh}" rx="4" data-sel="join" data-id="${esc(id)}"><title>${esc(join.type)} · ${(join.frames / tl.fps).toFixed(2)} s after ${esc(tl.clips[k].label)}</title></rect>`);
  });
  const [by, bh] = rows.beats;
  tl.clips.forEach(clip => {
    const entry = drawn[clip.id], sketch = tlSketch(clip.id);
    if (!sketch) return;
    sketch.elements.forEach((el, i) => {
      const t0 = entry?.times?.[i], at = clip.start / tl.fps + (Number.isFinite(t0) ? t0 : 0) + i * 0.0001;
      out.push(`<circle class="tl-beat ${esc(el.kind)}${TL.sel?.kind === 'element' && TL.sel.id === clip.id && TL.sel.index === i ? ' sel' : ''}" cx="${x(at)}" cy="${by + bh / 2 + (i % 3 - 1) * 5}" r="4" data-sel="element" data-id="${esc(clip.id)}" data-index="${i}" data-at="${Math.min(at + 0.02, (clip.start + clip.frames - 1) / tl.fps).toFixed(3)}"><title>${esc(clip.label)} · ${esc(el.kind)}${el.text ? ` "${esc(String(el.text).slice(0, 40))}"` : ''}${el.animate ? ` · ${esc(el.animate)}` : ''}${el.effect ? ` · ${esc(el.effect)}` : ''}${el.at ? ` · on "${esc(el.at)}"` : ''}</title></circle>`);
    });
  });
  const [gy, gh] = rows.graphics;
  tl.graphics.forEach(item => out.push(`<rect class="tl-graphic ${esc(item.status)}${sel('graphic', item.id)}" x="${x(item.start / tl.fps)}" y="${gy}" width="${Math.max(3, item.frames / tl.fps * pps).toFixed(1)}" height="${gh}" rx="3" data-sel="graphic" data-id="${esc(item.id)}"><title>${esc(EDIT_TEMPLATE_NAMES[item.template] || item.template)} · ${esc(item.status)} · ${esc(item.lines.join(' '))}</title></rect>`));
  const [cy, ch] = rows.captions;
  (tl.captions?.groups || []).forEach(group => out.push(`<rect class="tl-caption${tl.captions.enabled ? '' : ' off'}${group.edited ? ' edited' : ''}${sel('caption', group.id)}" x="${x(group.start)}" y="${cy}" width="${Math.max(2, (group.end - group.start) * pps - 1).toFixed(1)}" height="${ch}" rx="2" data-sel="caption" data-id="${esc(group.id)}"><title>${esc(group.text)}</title></rect>`));
  const [ay, ah] = rows.audio, audio = tl.audio || {};
  out.push(`<rect class="tl-voice" x="0" y="${ay}" width="${x(total)}" height="${ah / 2 - 1}" rx="2"><title>Narration</title></rect>`);
  if (audio.music?.enabled) out.push(`<rect class="tl-music" x="0" y="${ay + ah / 2}" width="${x(total)}" height="${ah / 2}" rx="2"><title>Music under the voice</title></rect>`);
  if (audio.sfx?.enabled) out.push(`<text class="tl-label" x="4" y="${ay + ah - 2}">sound effects on the drawn moments (${esc(audio.sfx.density || '')})</text>`);
  out.push(`<line class="tl-playhead" data-tl-playhead x1="${x(TL.at)}" x2="${x(TL.at)}" y1="0" y2="${H}"></line>`);
  const labels = TL_ROWS.map(([key, label]) => `<text class="tl-row-label" x="6" y="${rows[key][0] + rows[key][1] / 2 + 4}">${label}</text>`).join('');
  return `<div class="tl-board"><svg class="tl-labels" width="92" height="${H}" viewBox="0 0 92 ${H}" aria-hidden="true">${labels}</svg><div class="tl-scroll"><svg class="tl-svg" data-tl-svg data-pps="${pps}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Edit timeline">${out.join('')}</svg></div></div>`;
}
function tlEditor(content, edit, stale) {
  tlLoad(edit);
  const tl = edit.timeline, video = tlRender(content), clip = tlClipAt(tl, TL.at), team = state.ai?.team || {}, who = team.claude ? 'Claude' : team.chatgpt ? 'ChatGPT' : null;
  const toolbar = `<div class="tl-toolbar"><span class="micro-label">TIMELINE EDITOR</span><label class="tl-zoom">Zoom <input type="range" min="1" max="16" step="1" value="${TL.zoom}" data-tl="zoom" aria-label="Zoom the timeline"></label><span class="tl-clock">${tlClock(TL.at)} · ${esc(clip.label)}</span>${action('◀ 1 frame', 'tl-step', '-1', 'text-button')}${action('1 frame ▶', 'tl-step', '1', 'text-button')}${action('Preview this frame', 'tl-frame', '', 'secondary')}</div>`;
  const legend = '<div class="tl-legend"><span class="drawn">Drawn shot</span><span class="edited">Drawing changed in this edit</span><span class="still">Still</span><span class="video">Footage</span><span class="soft">Transition</span><span class="beat">Drawing beat (an element arriving)</span><span class="graphic">Graphic</span><span class="caption">Caption</span><small>Click any item to inspect and change it; click the time ruler to move the playhead.</small></div>';
  const player = video ? `<video class="tl-video" data-tl-video src="/api/renders/${esc(video.id)}/video" controls preload="metadata"></video><p class="hint">${video.scope.edit.revisionId === edit.id ? `The render of this revision (r${edit.revision}).` : `The newest render is of r${video.scope.edit.revision}; render again to see later changes.`} Playing moves the playhead; clicking the timeline moves the video.</p>` : '<p class="hint">Render this edit to watch it here in step with the timeline. Until then, preview single frames.</p>';
  const frame = TL.frame ? `<figure class="tl-frame"><img alt="Frame of ${esc(TL.frame.label)} at ${TL.frame.at.toFixed(2)} s" src="data:image/png;base64,${TL.frame.png}"><figcaption>${esc(TL.frame.label)} at ${TL.frame.at.toFixed(2)} s${TL.frame.draft ? ' · unsaved drawing' : ''}${TL.frame.note ? ` · ${esc(TL.frame.note)}` : ''}</figcaption></figure>` : '<p class="hint">No frame yet: move the playhead and press "Preview this frame". Drawn shots are drawn exactly as the render draws them; captions and graphics are added at render.</p>';
  const commandBox = stale ? '' : `<div class="tl-command"><h4>Tell the editor what to change</h4><textarea data-tl="command" rows="3" maxlength="2000" placeholder="For example: make the title in ${esc(clip.label)} slam in gold, add a sparkle when he says &quot;gold&quot;, and use a whip pan after it.">${esc(TL.command)}</textarea>
    <div class="tl-command-row"><label><input type="radio" name="tl-scope" value="clip" data-tl="scope" ${TL.scope === 'clip' ? 'checked' : ''}> The selected clip (${esc((TL.sel?.clipId && tl.clips.find(item => item.id === TL.sel.clipId)?.label) || clip.label)})</label><label><input type="radio" name="tl-scope" value="edit" data-tl="scope" ${TL.scope === 'edit' ? 'checked' : ''}> The whole edit</label>${who ? action(TL.busy ? `${who} is reading the edit…` : `Ask ${who}`, 'tl-ask', '', 'primary') : '<span class="muted">Connect Claude or ChatGPT first (Connections).</span>'}</div>
    <p class="hint">${who ? `${who} proposes the changes; the program checks each one and nothing changes until you apply them. One request uses tokens from the family's monthly limit.` : ''}</p>${tlProposal()}</div>`;
  return `<div class="tl-editor" data-tl-root>${toolbar}${tlTracks(tl, stale)}${legend}<div class="tl-panels"><div class="tl-preview">${player}${frame}</div><div class="tl-inspector">${tlInspector(edit, stale)}</div></div>${commandBox}</div>`;
}
function tlProposal() {
  const p = TL.proposal;
  if (!p) return '';
  return `<div class="tl-proposal"><p><b>${esc(p.provider === 'chatgpt' ? 'ChatGPT' : 'Claude')}:</b> ${esc(p.explain || '')}</p><ol>${p.steps.map(step => `<li class="${step.ok ? 'ok' : 'bad'}">${step.ok ? '✓' : '✕'} ${esc(step.summary)}${step.error ? `<br><small>Not possible: ${esc(step.error)}</small>` : ''}${step.warnings ? `<br><small>Repaired: ${esc(step.warnings.join(' · '))}</small>` : ''}</li>`).join('')}</ol>
    <div class="card-actions">${p.ops.length ? action(`Apply ${p.ops.length} change${p.ops.length === 1 ? '' : 's'}`, 'tl-apply', '', 'primary') : ''}${action('Discard', 'tl-discard', '', 'secondary')}<span class="muted">${p.usage?.totalTokens ? `${p.usage.totalTokens.toLocaleString()} tokens` : ''}</span></div></div>`;
}
// One field of a drawing: a list where the vocabulary has one, a number, a tick, words, or JSON for anything nested.
function tlField(path, key, value, vocab) {
  const name = `${path}.${key}`, list = vocab[key] || (key === 'expression' ? vocab.expression : null);
  if (list && (typeof value === 'string' || value === undefined)) return `<label>${esc(key)}<select data-tl-path="${esc(name)}"><option value="">—</option>${list.map(item => `<option ${item === value ? 'selected' : ''}>${esc(item)}</option>`).join('')}</select></label>`;
  if (typeof value === 'boolean') return `<label class="checkbox-label"><input type="checkbox" data-tl-path="${esc(name)}" ${value ? 'checked' : ''}>${esc(key)}</label>`;
  if (typeof value === 'number') return `<label>${esc(key)}<input type="number" step="any" data-tl-path="${esc(name)}" value="${value}"></label>`;
  if (value && typeof value === 'object') return `<label class="full">${esc(key)} <span class="hint">(JSON)</span><textarea rows="2" data-tl-path="${esc(name)}" data-tl-json>${esc(JSON.stringify(value))}</textarea></label>`;
  return `<label>${esc(key)}<input data-tl-path="${esc(name)}" value="${esc(value ?? '')}" maxlength="400"></label>`;
}
function tlDrawing(clip, entry, stale) {
  const sketch = tlSketch(clip.id), vocab = TL.drawings.vocab || {}, dirty = !!TL.drafts[clip.id], edited = !!entry.edited;
  const shot = TL_SHOT_KEYS.filter(key => key in sketch || ['set', 'mood', 'camera', 'film', 'texture', 'transition'].includes(key) || (key === 'look' && sketch.engine === 'stickman') || (key === 'board' && sketch.engine === 'handdrawn') || (key === 'design' && sketch.engine === 'motion'));
  const rows = sketch.elements.map((el, i) => {
    const t0 = entry.times?.[i], open = TL.sel?.kind === 'element' && TL.sel.index === i;
    const what = el.text ? `"${String(el.text).slice(0, 40)}"` : el.pose ? `${el.pose}${el.expression ? `, ${el.expression}` : ''}` : el.prop || el.effect || el.describe?.slice(0, 40) || '';
    const fields = Object.entries(el).filter(([key]) => key !== 'kind').map(([key, value]) => tlField(`el.${i}`, key, value, vocab)).join('');
    const missing = ['at', 'animate', 'enter', 'color'].filter(key => !(key in el) && (key !== 'animate' || ['text'].includes(el.kind))).map(key => tlField(`el.${i}`, key, undefined, vocab)).join('');
    return `<details class="tl-element" ${open ? 'open' : ''}><summary><b>${i + 1}. ${esc(el.kind)}</b> ${esc(what)} <span class="muted">${Number.isFinite(t0) ? `· at ${t0.toFixed(2)} s` : el.at ? '· word not found' : '· from the start'}${el.at ? ` on "${esc(el.at)}"` : ''}${el.animate ? ` · ${esc(el.animate)}` : ''}${el.enter ? ` · enters ${esc(el.enter)}` : ''}</span></summary>
      <div class="form-grid tl-fields">${fields}${missing}</div>${stale ? '' : `<div class="card-actions">${i ? action('Move up', 'tl-el-up', String(i), 'text-button') : ''}${i < sketch.elements.length - 1 ? action('Move down', 'tl-el-down', String(i), 'text-button') : ''}${action('Remove', 'tl-el-remove', String(i), 'text-button danger')}</div>`}</details>`;
  }).join('');
  return `<h4>Drawing of ${esc(clip.label)} ${edited ? badge('Changed in this edit', 'orange') : badge('From the board', 'gray')} ${dirty ? badge('Unsaved', 'orange') : ''}</h4><p class="hint">Words: “${esc(entry.words || '')}”. An element arrives on its "at" words; "until" ends it; "then" changes it later.</p>
    <div class="form-grid tl-fields">${shot.map(key => tlField('shot', key, sketch[key], vocab)).join('')}</div>${rows}
    ${stale ? '' : `<div class="card-actions tl-add"><select data-tl="add-kind" aria-label="Element to add">${Object.keys(TL_ADD).map(kind => `<option>${kind}</option>`).join('')}</select>${action('+ Add element', 'tl-el-add', '', 'secondary')}</div>
    <details class="tl-json"><summary>The whole drawing as JSON (every field)</summary><textarea rows="12" data-tl-whole>${esc(JSON.stringify(sketch, null, 1))}</textarea><div class="card-actions">${action('Use this JSON', 'tl-json', '', 'secondary')}</div></details>
    <div class="card-actions">${action('Preview at the playhead', 'tl-frame', '', 'secondary')}${dirty ? action('Save drawing (new revision)', 'tl-save-drawing', clip.id, 'primary') + action('Discard changes', 'tl-discard-drawing', clip.id, 'secondary') : ''}${edited && !dirty ? action('Back to the board’s drawing', 'tl-reset-drawing', clip.id, 'text-button danger') : ''}</div>`}`;
}
function tlInspector(edit, stale) {
  const tl = edit.timeline, sel = TL.sel;
  if (!sel) return '<h4>Inspector</h4><p class="hint">Click a clip, a transition, a drawing beat, a graphic or a caption on the timeline. Everything the edit does there is listed here and can be changed.</p>';
  if (sel.kind === 'graphic') { const item = tl.graphics.find(graphic => graphic.id === sel.id); return item ? `<h4>${esc(EDIT_TEMPLATE_NAMES[item.template] || item.template)} · ${renderClock(item.start / tl.fps)} · ${(item.frames / tl.fps).toFixed(2)} s</h4><p>“${esc(item.lines.join(' / '))}” · ${esc(item.status)}</p><p class="hint">${esc(item.reason)}</p>${stale ? '' : `<div class="card-actions">${action('Edit graphic', 'tl-graphic', item.id, 'secondary')}${item.status !== 'accepted' ? action('Accept', 'tl-graphic-accept', item.id, 'text-button') : ''}${item.status !== 'rejected' ? action('Reject', 'tl-graphic-reject', item.id, 'text-button danger') : ''}</div>`}` : ''; }
  if (sel.kind === 'caption') { const group = tl.captions?.groups.find(item => item.id === sel.id); return group ? `<h4>Caption · ${tlClock(group.start)}–${tlClock(group.end)}</h4><p>${captionLine(group)}</p><p class="hint">Captions follow the narration; their timing never moves.</p>${stale ? '' : `<div class="card-actions">${action('Correct caption', 'tl-caption', group.id, 'secondary')}</div>`}` : ''; }
  const index = tl.clips.findIndex(item => item.id === sel.clipId), clip = tl.clips[index];
  if (!clip) return '';
  const join = tl.joins[index], kind = TL.drawings?.clips?.[clip.id] ? 'drawn shot' : clip.mediaType === 'image' ? 'still' : 'footage';
  const facts = `<h4>${esc(clip.label)} · ${esc(kind)} · ${tlClock(clip.start / tl.fps)} · ${(clip.frames / tl.fps).toFixed(2)} s${clip.hero ? ' · hero' : ''}</h4>
    <dl class="style-facts"><div><dt>Why here</dt><dd>${esc(clip.reason)}</dd></div>${clip.mediaType === 'image' && kind === 'still' ? `<div><dt>Camera</dt><dd>${esc(EDIT_MOVE_NAMES[clip.move?.kind] || clip.move?.kind || 'static')} · ${esc(clip.moveReason || '')}</dd></div>` : ''}${kind === 'footage' ? `<div><dt>Source</dt><dd>from ${clip.inSeconds} s at ${Math.round(clip.speed * 100)}% · ${esc(clip.trimReason || '')}</dd></div>` : ''}
    <div><dt>Transition after</dt><dd>${join ? `${esc(join.type)}${join.type === 'cut' ? '' : ` · ${(join.frames / tl.fps).toFixed(2)} s`} · ${esc(join.reason || '')}` : 'the end of the video'}</dd></div></dl>
    ${stale ? '' : `<div class="card-actions">${action('Change timing, move and transition', 'tl-clip', clip.id, 'secondary')}</div>`}`;
  const entry = TL.drawings?.clips?.[clip.id];
  if (!entry) return facts + (TL.loading ? '<p class="muted">Loading the drawings…</p>' : '');
  if (entry.designed) return `${facts}<p class="hint">A designed frame (atelier): redesign it in Room 04.</p>`;
  return facts + tlDrawing(clip, entry, stale);
}
// Field edits change the unsaved drawing in place (no redraw, so typing keeps its place).
function tlSet(edit, path, input) {
  const clipId = TL.sel?.clipId, base = tlSketch(clipId);
  if (!clipId || !base) return;
  const draft = TL.drafts[clipId] || structuredClone(base), [scope, a, b] = path.split('.'), target = scope === 'shot' ? draft : draft.elements[Number(a)], key = scope === 'shot' ? a : b;
  let value = input.type === 'checkbox' ? input.checked : input.type === 'number' ? (input.value === '' ? undefined : Number(input.value)) : input.value;
  if (input.dataset.tlJson !== undefined) { try { value = input.value.trim() ? JSON.parse(input.value) : undefined; input.classList.remove('invalid'); } catch { input.classList.add('invalid'); return; } }
  if (value === '' || value === undefined) delete target[key]; else target[key] = value;
  TL.drafts[clipId] = draft;
}
function tlAction(command, id, button) {
  const {content, edit} = editContext();
  if (!edit) return;
  const tl = edit.timeline, clipId = TL.sel?.clipId;
  const restructure = change => { const draft = TL.drafts[clipId] || structuredClone(tlSketch(clipId)); change(draft); TL.drafts[clipId] = draft; render(); };
  if (command === 'tl-step') { TL.at = Math.min(Math.max(0, TL.at + Number(id) / tl.fps), (tl.totalFrames - 1) / tl.fps); return render(); }
  if (command === 'tl-el-up' || command === 'tl-el-down') return restructure(draft => { const i = Number(id), j = command === 'tl-el-up' ? i - 1 : i + 1; [draft.elements[i], draft.elements[j]] = [draft.elements[j], draft.elements[i]]; });
  if (command === 'tl-el-remove') return restructure(draft => { draft.elements.splice(Number(id), 1); });
  if (command === 'tl-el-add') { const kind = document.querySelector('[data-tl="add-kind"]')?.value || 'text'; return restructure(draft => { draft.elements.push(structuredClone(TL_ADD[kind])); TL.sel = {kind: 'element', id: clipId, clipId, index: draft.elements.length - 1}; }); }
  if (command === 'tl-json') { try { TL.drafts[clipId] = JSON.parse(document.querySelector('[data-tl-whole]').value); render(); } catch { toast('That JSON is not valid.', true); } return; }
  if (command === 'tl-discard-drawing') { delete TL.drafts[id]; return render(); }
  if (command === 'tl-discard') { TL.proposal = null; return render(); }
  const busy = run => { if (button) button.disabled = true; return run().catch(error => toast(error.message, true)).finally(() => { if (button) button.disabled = false; }); };
  if (command === 'tl-save-drawing' || command === 'tl-reset-drawing') return busy(async () => { await editSend(edit, [{type: 'set-drawing', clipId: id, sketch: command === 'tl-save-drawing' ? TL.drafts[id] : null}]); delete TL.drafts[id]; await refresh(); toast(command === 'tl-save-drawing' ? 'Drawing saved as a new revision.' : 'Back to the board’s drawing.'); });
  if (command === 'tl-frame') {
    const clip = tlClipAt(tl, TL.at), at = Math.max(0, TL.at - clip.start / tl.fps), draft = TL.drafts[clip.id];
    return busy(async () => { const result = await api(`/api/edit-revisions/${edit.id}/frame`, {clipId: clip.id, at: Math.min(at, clip.frames / tl.fps), ...(draft ? {sketch: draft} : {})}); TL.frame = {...result, label: clip.label, draft: !!draft}; render(); });
  }
  if (command === 'tl-ask') {
    const text = TL.command.trim();
    if (text.length < 3) return toast('Write what to change first.', true);
    const focus = TL.scope === 'clip' ? (TL.sel?.clipId || tlClipAt(tl, TL.at).id) : null;
    TL.busy = true; render();
    return api(`/api/edit-revisions/${edit.id}/command`, {requestedBy: renderPerson() || 'Owner', text, ...(focus ? {clipId: focus} : {})}).then(result => { TL.proposal = result; }).catch(error => toast(error.message, true)).finally(() => { TL.busy = false; render(); });
  }
  if (command === 'tl-apply') { const p = TL.proposal; return busy(async () => { await editSend(edit, p.ops, `Command: ${TL.command.trim().slice(0, 250)}`); TL.proposal = null; TL.command = ''; await refresh(); toast(`${p.ops.length} change${p.ops.length === 1 ? '' : 's'} applied as a new revision.`); }); }
  return toast('Unknown action.', true);
}
// Clicks on the timeline: select an item and move the playhead there; the ruler only moves the playhead.
document.addEventListener('click', event => {
  const svg = event.target.closest?.('[data-tl-svg]');
  if (!svg) return;
  const {edit} = editContext();
  if (!edit) return;
  const tl = edit.timeline, pps = Number(svg.dataset.pps), item = event.target.closest('[data-sel]'), box = svg.getBoundingClientRect();
  // A drawing beat puts the playhead on its own moment (just after the element arrives); anything else where clicked.
  TL.at = Math.min(Math.max(0, item?.dataset.at ? Number(item.dataset.at) : (event.clientX - box.left) / pps), (tl.totalFrames - 1) / tl.fps);
  if (item) {
    const kind = item.dataset.sel, id = item.dataset.id;
    TL.sel = kind === 'element' ? {kind, id, clipId: id, index: Number(item.dataset.index)} : kind === 'clip' || kind === 'join' ? {kind, id, clipId: id} : {kind, id};
  }
  const video = document.querySelector('[data-tl-video]');
  if (video && Number.isFinite(video.duration)) video.currentTime = Math.min(TL.at, video.duration);
  render();
});
document.addEventListener('input', event => {
  const target = event.target;
  if (!target.closest?.('[data-tl-root]')) return;
  if (target.dataset.tl === 'zoom') { TL.zoom = Number(target.value); return render(); }
  if (target.dataset.tl === 'command') { TL.command = target.value; return; }
  if (target.dataset.tlPath) { const {edit} = editContext(); if (edit) tlSet(edit, target.dataset.tlPath, target); }
});
document.addEventListener('change', event => {
  const target = event.target;
  if (!target.closest?.('[data-tl-root]')) return;
  if (target.dataset.tl === 'scope') { TL.scope = target.value; return; }
  if (target.dataset.tlPath) { const {edit} = editContext(); if (edit) { tlSet(edit, target.dataset.tlPath, target); render(); } }
});
// The rendered preview drives the playhead while it plays (the line moves; nothing else is redrawn).
document.addEventListener('timeupdate', event => {
  if (!event.target.matches?.('[data-tl-video]')) return;
  TL.at = event.target.currentTime;
  const line = document.querySelector('[data-tl-playhead]'), svg = document.querySelector('[data-tl-svg]');
  if (line && svg) { const x = (TL.at * Number(svg.dataset.pps)).toFixed(1); line.setAttribute('x1', x); line.setAttribute('x2', x); }
}, true);
// After every redraw: the timeline keeps its scroll position and the player its moment.
let tlScroll = 0;
document.addEventListener('scroll', event => { if (event.target.classList?.contains('tl-scroll')) tlScroll = event.target.scrollLeft; }, true);
function tlAfterRender() {
  const scroller = document.querySelector('.tl-scroll');
  if (scroller) scroller.scrollLeft = tlScroll;
  const video = document.querySelector('[data-tl-video]');
  if (video && TL.at > 0) video.addEventListener('loadedmetadata', () => { video.currentTime = Math.min(TL.at, video.duration); }, {once: true});
}
