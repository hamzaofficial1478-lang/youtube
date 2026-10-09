'use strict';
// Room 05 - Editing Room: the editing brain's edit, the critic, owner changes and the edit render (P06 UI).
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
  return `<section class="production-card edit-card">${head}${stale ? `<p class="inline-warning">${esc(room.staleReason || 'The inputs changed.')}</p>` : ''}${editStrip(tl)}${facts}${actions}
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


// SVG strip: clips (stills light, clips dark, heroes outlined), soft transitions, graphics, retention markers.
function editStrip(tl) {
  const W = 1000, total = tl.totalFrames, x = frame => (frame / total * W).toFixed(2), fps = tl.fps;
  const clips = tl.clips.map(clip => `<rect class="edit-clip ${clip.mediaType === 'video' ? 'video' : 'still'}${clip.hero ? ' hero' : ''}" x="${x(clip.start)}" y="18" width="${Math.max(1, clip.frames / total * W - 1).toFixed(2)}" height="30" rx="3" data-action="tl-clip" data-id="${esc(clip.id)}"><title>${esc(clip.label)} · ${editSeconds(clip.frames, fps)} s · ${clip.mediaType === 'video' ? 'clip' : esc(EDIT_MOVE_NAMES[clip.move?.kind] || 'still')}${clip.hero ? ' · hero' : ''}</title></rect>`).join('');
  const joins = tl.joins.map((join, index) => join.type === 'cut' ? '' : `<path class="edit-join" d="M ${x(tl.clips[index + 1].start)} 12 l -5 -8 h 10 z"><title>${esc(join.type)} · ${editSeconds(join.frames, fps)} s</title></path>`).join('');
  const graphics = tl.graphics.map(item => `<rect class="edit-graphic ${esc(item.status)}" x="${x(item.start)}" y="54" width="${Math.max(2, item.frames / total * W).toFixed(2)}" height="10" rx="2" data-action="tl-graphic" data-id="${esc(item.id)}"><title>${esc(EDIT_TEMPLATE_NAMES[item.template] || item.template)} · ${esc(item.status)} · ${esc(item.lines.join(' '))}</title></rect>`).join('');
  const scenes = tl.scenes.map(scene => `<line class="edit-scene" x1="${x(scene.startFrame)}" x2="${x(scene.startFrame)}" y1="14" y2="70"></line>`).join('');
  const markers = tl.markers.map(marker => `<circle class="edit-marker" cx="${x(marker.frame)}" cy="76" r="3"><title>${esc(marker.note)}</title></circle>`).join('');
  return `<div class="edit-strip"><svg viewBox="0 0 ${W} 82" role="img" aria-label="Edit timeline: ${tl.clips.length} clips over ${renderClock(tl.narrationSeconds)}">${scenes}${clips}${joins}${graphics}${markers}</svg><div class="edit-legend"><span class="still">Still with camera move</span><span class="video">Moving clip</span><span class="hero">Hero shot</span><span class="graphic">Graphic</span><span class="marker">Retention marker</span><small>Click a clip or graphic to change it.</small></div></div>`;
}

function editFindings(edit, stale) {
  const findings = edit.findings || [];
  if (!findings.length) return '<h3 class="intel-subhead">Editor\'s critique</h3><p class="muted">No findings. The edit follows every rule the critic checks.</p>';
  return `<h3 class="intel-subhead">Editor's critique · ${findings.length} finding${findings.length === 1 ? '' : 's'}</h3><div class="edit-findings">${findings.map((item, index) => {
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
function editAction(command, id, button) {
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
    return editDialog('render', 'Render this edit', 'LOCAL RENDER · NO COST', `<p class="hint">Renders edit r${edit.revision} at proxy resolution with your pinned FFmpeg: ${tl.clips.length} clips with their own holds and camera moves, ${edit.critique.stats.softTransitions} soft transitions, ${edit.critique.stats.graphicsAccepted} graphics and a fade-out ending. Then it runs the technical QC.</p>${criticals ? `<p class="inline-warning">The critic still has ${criticals} critical finding${criticals === 1 ? '' : 's'}. You can render to look at it, but the style-proof verdict will ask you to accept ${criticals === 1 ? 'it' : 'them'}.</p>` : ''}<div class="form-grid">${renderNameField()}</div>`, 'Render edit', {contentId: content.contentId, visualApprovalId: content.inputs.visualApprovalId, editRevisionId: edit.id});
  }
  if (command === 'tl-clip') {
    const index = tl.clips.findIndex(item => item.id === id), clip = tl.clips[index];
    if (!clip) return toast('That clip is no longer in this edit.', true);
    const join = tl.joins[index], last = index === tl.clips.length - 1, transitions = state.editing.transitions;
    const scene = tl.scenes.find(item => item.id === clip.sceneId), members = tl.clips.filter(item => item.sceneId === clip.sceneId);
    const body = `<p class="hint"><b>${esc(clip.label)}</b> · ${renderClock(clip.start / tl.fps)} · ${esc(clip.reason)} ${esc(clip.moveReason || clip.trimReason || '')}</p><div class="form-grid">
      ${last ? '' : `<label>Hold (seconds)<input name="hold" type="number" step="0.01" min="0.5" value="${(clip.frames / tl.fps).toFixed(2)}"><span class="hint">Moves the cut after this clip; the next clip absorbs the change.</span></label>`}
      ${clip.mediaType === 'image' ? `<label>Camera move<select name="move">${state.editing.moves.map(move => `<option value="${move}" ${clip.move?.kind === move ? 'selected' : ''}>${esc(EDIT_MOVE_NAMES[move] || move)}</option>`).join('')}</select></label>` : `<label>Start the clip at (seconds)<input name="in" type="number" step="0.05" min="0" value="${clip.inSeconds}"></label>`}
      ${last ? '' : `<label>Transition after it<select name="transition">${transitions.map(type => `<option value="${type}" ${join.type === type ? 'selected' : ''}>${esc(type)}</option>`).join('')}</select></label><label>Transition length (seconds)<input name="transitionSeconds" type="number" step="0.01" min="0.1" value="${join.type === 'cut' ? '0.60' : (join.frames / tl.fps).toFixed(2)}"></label>`}
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
    if (kind === 'render') { await api(`/api/content/${data.contentId}/renders`, {requestedBy: person, visualApprovalId: data.visualApprovalId, editRevisionId: data.editRevisionId}); message = 'Edit render queued.'; return; }
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
