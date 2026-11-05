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
  if (!edit) return `<section class="production-card"><div class="production-card-head"><div><span class="micro-label">EDITING BRAIN</span><h2>Edit decisions</h2></div>${badge('No edit yet', 'gray')}</div>${intro}<p class="hint">Press "Draft the edit" in step 1 above. Local and free: it measures the narration with FFmpeg and plans the edit on this computer.</p></section>`;
  const tl = edit.timeline, critique = edit.critique, stats = critique.stats, fps = tl.fps;
  const stale = room.current === false;
  const active = content.renders.some(job => ['queued', 'running'].includes(job.status));
  const head = `<div class="production-card-head"><div><span class="micro-label">EDITING BRAIN · EDIT r${edit.revision} · ${edit.actor === 'brain' ? 'drafted by the brain' : `changed by ${esc(edit.createdBy)}`} · ${esc(date(edit.createdAt))}</span><h2>Edit decisions</h2></div><div class="row-end">${badge(`Slideshow risk ${critique.slideshow.score} · ${critique.slideshow.verdict}`, EDIT_VERDICT[critique.slideshow.verdict] || 'gray')}${critique.counts.critical ? badge(`${critique.counts.critical} critical`, 'orange') : ''}${stale ? badge('Out of date', 'gray') : ''}</div></div>`;
  const timing = edit.timing ? `${edit.timing.method === 'pause-aligned' ? `Cuts follow the narration's measured pauses (${edit.timing.matched} of ${edit.timing.boundaries} sentence breaks found)` : 'Cuts use the word-count estimate'}. ${esc(edit.timing.note || '')}` : '';
  const facts = `<dl class="style-facts edit-facts"><div><dt>Clips</dt><dd>${stats.clips} · average ${stats.averageShotSeconds} s · ${stats.cutsPerMinute} cuts/min</dd></div><div><dt>Footage</dt><dd>${Math.round(stats.videoShare * 100)}% moving clips · ${Math.round(stats.stillShare * 100)}% stills with camera moves</dd></div><div><dt>Transitions</dt><dd>${esc(stats.transitionTypes.join(', '))} · ${stats.softTransitions} soft</dd></div><div><dt>Longest hold</dt><dd>${Number(stats.longestUnchangedSeconds).toFixed(1)} s without a change</dd></div><div><dt>Graphics</dt><dd>${stats.graphicsAccepted} on screen · ${stats.graphicsProposed} proposed</dd></div><div><dt>Timing</dt><dd>${timing}</dd></div></dl>`;
  const actions = `<div class="card-actions edit-actions">${!stale && edit.revision > 1 ? action('Undo last change', 'tl-undo', edit.id, 'secondary') : ''}${action(stale ? 'Draft a new edit' : 'Draft a fresh edit', 'tl-generate', content.contentId, stale ? 'primary' : 'secondary')}</div>`;
  return `<section class="production-card edit-card">${head}${stale ? `<p class="inline-warning">${esc(room.staleReason || 'The inputs changed.')}</p>` : ''}${tlEditor(content, edit, stale)}${editHow(edit)}${facts}${actions}
    ${editFindings(edit, stale)}${editGraphics(tl, stale)}${editCaptions(edit, stale)}${editClips(tl, stale)}${editCraft(room)}${editHistory(room)}</section>`;
}
// The road from the approved inputs to a reviewed render (0.83, owner review 2026-11-03: "no clear option where to start
// the render or the edit"): four boxes as in Room 04, each with the one button for its job.
function editRoad(content, engineReady) {
  if (!content.inputs.ready) return '';
  const room = editFor(content.contentId), edit = room?.edit, stale = room?.current === false, live = !!edit && !stale;
  const running = content.renders.find(job => ['queued', 'running'].includes(job.status));
  const rendered = live ? content.renders.find(job => job.status === 'completed' && job.scope?.edit?.revisionId === edit.id) : null;
  const link = (label, id) => `<button type="button" class="road-link" data-action="tl-goto" data-id="${id}">${label}</button>`;
  const room07 = '<button type="button" class="button secondary" data-production-room="audio">Audio Room →</button><button type="button" class="button primary" data-production-room="qc">Review & QC →</button>';
  const steps = [
    {title: 'Draft the edit', done: live, text: !edit ? 'The editing brain cuts the video from your approved storyboard and narration: a program on this PC, free, no AI.' : stale ? 'The storyboard, narration or style changed after this edit: draft a new one.' : `Edit r${edit.revision}, ${edit.actor === 'brain' ? 'made by the editing brain' : `changed by ${esc(edit.createdBy)}`}: ${edit.timeline.clips.length} clips. ${link('Who made it, and how ↓', 'edit-how')}`,
      buttons: live ? '' : action(stale ? 'Draft a new edit' : 'Draft the edit', 'tl-generate', content.contentId, 'primary')},
    // 0.92 (owner question 2026-11-05: "while a video renders, should the buttons stop me?"): no. A render works on the
    // revision it started from, so editing goes on: changes make a new revision and the render carries on.
    {title: 'Watch it and change it', done: !!rendered, text: live ? `${running && running.scope?.edit?.revisionId && running.scope.edit.revisionId !== edit.id ? `<b>r${running.scope.edit.revision} is rendering; you are changing r${edit.revision}.</b> ` : running?.status === 'running' ? `<b>r${edit.revision} is rendering. You can keep changing it:</b> your changes make a new revision and this render carries on. Render the new one when you are done; unchanged shots are copied, not drawn again. ` : running ? `<b>A render of r${edit.revision} is waiting to start.</b> A change now makes it out of date; render again after your changes. ` : ''}Press Play to watch the edit as it is now, before any render. Click a clip on the timeline to change it, or tell Claude what to change.` : 'After the edit is drafted.', buttons: live ? action('▶ Play the edit', 'tl-goto-player', '', 'primary') : ''},
    {title: 'Render the video', done: !!rendered, text: running ? `Rendering now: ${esc(running.progress?.stage || 'waiting for the render worker')}. ${link('See it ↓', 'render-latest')}` : rendered ? `Rendered at ${renderSizeName(rendered)}. ${link('Watch it ↓', 'render-latest')}` : !engineReady ? 'Check and pin FFmpeg first (Render engine, below).' : 'FFmpeg makes the video file on this PC, free: 360p is quickest, 1440p sharpest.',
      buttons: live && engineReady && !running ? action(rendered ? 'Render again' : 'Render this edit', 'tl-render', edit.id, rendered ? 'secondary' : 'primary') : ''},
    // 0.86: a draft already carries the library's music and effects when the program could add them.
    {title: edit?.timeline?.audio?.music?.enabled || edit?.timeline?.audio?.sfx?.enabled ? 'Check the music, then review' : 'Add music, then review', done: false, text: edit?.timeline?.audio?.music?.enabled || edit?.timeline?.audio?.sfx?.enabled ? `The program added ${[edit.timeline.audio.music?.enabled ? 'music' : '', edit.timeline.audio.sfx?.enabled ? 'sound effects' : ''].filter(Boolean).join(' and ')} from your sound library when it drafted this edit; listen in the render and change them in Room 07 if needed. Room 08 then checks the render and you approve it.` : 'Room 07 adds music and sound effects and levels the narration (a new edit to render). Room 08 then checks the render and you approve it.', buttons: rendered ? room07 : ''},
  ];
  const next = steps.findIndex(step => !step.done), stateOf = k => (steps[k].done ? 'done' : k === next ? 'now' : 'later');
  return `<section class="production-card scene-road edit-road"><div class="production-card-head"><div><span class="micro-label">WHAT HAPPENS NEXT</span><h2>From the approved storyboard to a finished video</h2></div><span class="road-count">${steps.filter(step => step.done).length} of ${steps.length} done</span></div>
    <ol class="road-steps">${steps.map((step, k) => `<li class="road-step ${stateOf(k)}"><div class="road-top"><span class="road-mark">${step.done ? '✓' : k + 1}</span><strong>${step.title}</strong><span class="road-state">${{done: 'Done', now: 'Next', later: 'Later'}[stateOf(k)]}</span></div><p class="road-text">${step.text}</p>${step.buttons ? `<div class="road-actions">${step.buttons}</div>` : ''}</li>`).join('')}</ol></section>`;
}
// Who makes the edit (owner question 2026-11-03: "which do that?").
function editHow(edit) {
  const fixed = edit.autoFixes?.length || 0;
  return `<details class="scene-history edit-how" id="edit-how" data-keep-open="edit-how"><summary>Who made this edit, and how</summary><ul class="intel-list">
    <li><b>The editing brain</b>, a program on this PC (free, no AI), made every decision: where each cut lands (on the narrator's pauses and cue words), how long each shot holds, each still's camera move, every transition and the graphics where the script says a number, a date or a quote. Its reason for each clip is in the inspector and the clip list below.</li>
    <li><b>The critic</b> then checks it for slideshow risk, long holds and lazy repeats${fixed ? `; the brain fixed ${fixed} of those itself` : ''}. What is left needs your taste or new visuals.</li>
    <li><b>Drawn shots</b> are drawn by the drawing engine of Room 04, timed to the narrator's words, in your style and looks.</li>
    <li><b>You</b> change anything: click a clip on the timeline and change it in the inspector, or type what you want and ${state.ai?.team?.claude || !state.ai?.team?.chatgpt ? 'Claude' : 'ChatGPT'} proposes the changes (this uses tokens; nothing changes until you apply them).</li>
    ${edit.carried ? `<li><b>Your changes</b> from the earlier edit (r${edit.carried.from.revision}) came along: ${edit.carried.kept} kept${edit.carried.left.length ? `; not carried (${edit.carried.left.length}): ${esc(edit.carried.left.join('; '))}` : ''}.</li>` : ''}
    <li><b>Music and sound effects</b> ${edit.autoAudio ? `were added by the program when it drafted this edit: ${esc(edit.autoAudio.join('; '))}.` : 'come from Room 07 (Levels and mix).'} Change them in the timeline's Audio row or by asking the editor.</li>
    <li><b>FFmpeg</b> makes the video file when you press Render.</li></ul></details>`;
}
// Captions (P07): the rail the render burns in, and the SRT file for YouTube's own player.
function captionLine(group) {
  let index = 0;
  return group.lines.map(line => line.split(' ').map(word => { const out = index === group.emphasis ? `<mark>${esc(word)}</mark>` : esc(word); index++; return out; }).join(' ')).join(' <span class="muted">/</span> ');
}
// 0.88 (owner review 2026-11-04: "the sections that are expanded make a mess, make them dropdowns"): each section of the
// edit is folded under its title; it stays open or closed as the owner left it (render's foldStates).
const editFold = (title, body) => `<details class="edit-fold"><summary><span class="intel-subhead">${title}</span></summary><div class="edit-fold-body">${body}</div></details>`;
function editCaptions(edit, stale) {
  const captions = edit.timeline.captions;
  if (!captions) return '<h3 class="intel-subhead">Captions</h3><p class="hint">This edit was drafted before captions existed. Draft a fresh edit to add them.</p>';
  const vertical = edit.timeline.format === 'shorts', groups = captions.groups, edited = groups.filter(group => group.edited).length;
  const toggle = stale ? '' : captions.enabled ? action('Switch captions off', 'tl-captions', 'off', 'secondary') : action('Switch captions on', 'tl-captions', 'on', 'primary');
  return editFold(`Captions · ${captions.enabled ? 'burned into the render' : 'off'} · ${groups.length} captions`, `
    <p class="hint">${esc(captions.note)} ${vertical ? 'On this vertical video the captions sit above the Shorts buttons and step aside while a full-screen graphic shows its own text.' : 'They sit in the bottom band; graphics stay above it.'} At most one word per caption is lifted in the accent colour: figures and words like "never" or "only", and never in two captions in a row.</p>
    <div class="card-actions">${toggle}<a class="button secondary" href="/api/edit-revisions/${esc(edit.id)}/captions.srt" download>Download SRT for YouTube</a><a class="button secondary" href="/api/edit-revisions/${esc(edit.id)}/captions.vtt" download>Download WebVTT</a></div>
    <details class="scene-history"><summary>Read and correct the captions (${groups.length}${edited ? `, ${edited} corrected by hand` : ''})</summary><div class="history-list caption-list">${groups.map(group => `<div class="history-row"><span class="muted">${renderClock(group.start)}</span><span>${captionLine(group)}${group.edited ? ' <span class="muted">· corrected</span>' : ''}</span>${stale ? '' : action('Correct', 'tl-caption', group.id, 'secondary')}</div>`).join('')}</div></details>`);
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
  return editFold(`YouTube craft · drafts for you, never published`, `${chapterBlock}${shortBlock}${retention}`);
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
  if (!findings.length) return `${editAutoFixes(edit)}${editFold(`Editor's critique`, `<p class="muted">Nothing left to fix. The edit follows every rule the critic checks.</p>`)}`;
  return `${editAutoFixes(edit)}${editFold(`Editor's critique · ${findings.length} finding${findings.length === 1 ? '' : 's'} left`, `<p class="hint">What is left needs new visuals, a new narration or your taste, so the brain did not change it by itself.</p><div class="edit-findings">${findings.map((item, index) => {
    const [label, color] = EDIT_SEVERITY[item.severity] || [item.severity, 'gray'];
    return `<div class="edit-finding ${esc(item.severity)}"><div>${badge(label, color)} ${editSkill(item)}</div><p><b>${esc(item.message)}</b><br>${esc(item.fix)}${item.route === 'script' ? ' <span class="muted">(fix it in the script)</span>' : ''}</p>${item.op && !stale ? action('Apply this fix', 'tl-fix', String(index), 'secondary') : ''}</div>`;
  }).join('')}</div>`)}`;
}

function editGraphics(tl, stale) {
  const add = stale ? '' : `<div class="card-actions">${action('+ Add a graphic', 'tl-graphic-add', '', 'secondary')}</div>`;
  if (!tl.graphics.length) return editFold(`Motion graphics`, `<p class="muted">The narration has no number, date, quote, list or chapter text that needs a graphic.</p>${add}`);
  const statusBadge = status => badge(status === 'accepted' ? 'On screen' : status === 'rejected' ? 'Rejected' : 'Proposed', status === 'accepted' ? 'green' : status === 'rejected' ? 'gray' : 'orange');
  return editFold(`Motion graphics · only accepted graphics are rendered`, `<div class="history-list">${tl.graphics.map(item => `<div class="history-row edit-graphic-row"><span class="job-dot ${item.status === 'accepted' ? 'completed' : ''}"></span><div><strong>${esc(EDIT_TEMPLATE_NAMES[item.template] || item.template)} · ${renderClock(item.start / tl.fps)} · ${editSeconds(item.frames, tl.fps)} s ${statusBadge(item.status)} ${editSkill(item)}</strong><small>“${esc(item.lines.join(' / '))}”${item.accent ? ` · accent: ${esc(item.accent)}${item.accentSource ? ` (${esc(item.accentSource)})` : ''}` : ''}<br>${esc(item.reason)}</small>${stale ? '' : `<div class="card-actions">${item.status !== 'accepted' ? action('Accept', 'tl-graphic-accept', item.id, 'text-button') : ''}${item.status !== 'rejected' ? action('Reject', 'tl-graphic-reject', item.id, 'text-button danger') : ''}${action('Edit', 'tl-graphic', item.id, 'text-button')}</div>`}</div></div>`).join('')}</div>${add}`);
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
  return api(`/api/edit-revisions/${edit.id}/ops`, {editedBy: person, ops, ...(note ? {note} : {})});
}
const TL_COMMANDS = new Set(['tl-step', 'tl-goto', 'tl-play', 'tl-pause', 'tl-stop', 'tl-play-retry', 'tl-goto-player', 'tl-ask', 'tl-polish', 'tl-apply', 'tl-discard', 'tl-json', 'tl-save-drawing', 'tl-reset-drawing', 'tl-discard-drawing', 'tl-el-up', 'tl-el-down', 'tl-el-remove', 'tl-el-add']);
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
    return editDialog('render', 'Render this edit', 'LOCAL RENDER · NO COST', `<p class="hint">Renders edit r${edit.revision} with your pinned FFmpeg, on this PC and free: ${tl.clips.length} clips with their own holds and camera moves, ${edit.critique.stats.softTransitions} soft transitions, ${edit.critique.stats.graphicsAccepted} graphics and a fade-out ending. Then it runs the technical QC.</p>${criticals ? `<p class="inline-warning">The critic still has ${criticals} critical finding${criticals === 1 ? '' : 's'}. You can render to look at it, but the style-proof verdict will ask you to accept ${criticals === 1 ? 'it' : 'them'}.</p>` : ''}<div class="form-grid">${renderNameField()}${renderSizeField()}</div>`, 'Render edit', {contentId: content.contentId, visualApprovalId: content.inputs.visualApprovalId, editRevisionId: edit.id});
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
const TL = {rev: null, zoom: 1, at: 0, sel: null, drawings: null, loading: false, drafts: {}, command: '', scope: 'clip', proposal: null, busy: false};
const TL_ROWS = [['ruler', 'Time', 22], ['scenes', 'Scenes', 22], ['picture', 'Picture', 34], ['joins', 'Transitions', 20], ['beats', 'Drawing beats', 22], ['graphics', 'Graphics', 18], ['captions', 'Captions', 18], ['voice', 'Narration', 12], ['music', 'Music', 20], ['sfx', 'Sound effects', 20]];
const TL_SHOT_KEYS = ['type', 'set', 'mood', 'camera', 'transition', 'film', 'texture', 'look', 'board', 'design'];
const TL_ADD = {text: {kind: 'text', text: 'New words', style: 'title'}, figure: {kind: 'figure', pose: 'stand', expression: 'happy'}, prop: {kind: 'prop', prop: 'coin'}, fx: {kind: 'fx', effect: 'sparkle'}, arrow: {kind: 'arrow', from: [0.3, 0.6], to: [0.6, 0.4]}, bubble: {kind: 'bubble', text: 'Words', of: 0}};
const tlSeconds = (frames, fps) => frames / fps;
const tlClock = seconds => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;
function tlClipAt(tl, seconds) { const frame = Math.round(seconds * tl.fps); return tl.clips.find(clip => frame >= clip.start && frame < clip.start + clip.frames) || tl.clips.at(-1); }
function tlSketch(clipId) { return TL.drafts[clipId] || TL.drawings?.clips?.[clipId]?.sketch || null; }
function tlLoad(edit) {
  if (TL.rev !== edit.id) { TL.rev = edit.id; TL.drawings = null; TL.drafts = {}; TL.proposal = null; if (TL.sel && !edit.timeline.clips.some(clip => clip.id === TL.sel.clipId)) TL.sel = null; }
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
  // 0.88: narration, music and sound effects each have their own row; a click shows what plays there.
  const [vy, vh] = rows.voice, tracks = TL.drawings?.audio || {music: [], sfx: []};
  out.push(`<rect class="tl-voice" x="0" y="${vy}" width="${x(total)}" height="${vh}" rx="2"><title>Narration</title></rect>`);
  const [my, mh] = rows.music;
  if (tracks.music.length) tracks.music.forEach((cue, k) => out.push(`<rect class="tl-music${sel('music', String(k))}" x="${x(cue.start)}" y="${my}" width="${Math.max(2, (cue.end - cue.start) * pps - 1).toFixed(1)}" height="${mh}" rx="3" data-sel="music" data-id="${k}"><title>${esc(cue.mood)}${cue.title ? ` · ${esc(cue.title)}` : ''}</title></rect>${(cue.end - cue.start) * pps > 60 ? `<text class="tl-label" x="${(Number(x(cue.start)) + 4).toFixed(1)}" y="${my + mh - 6}">${esc(cue.mood)}</text>` : ''}`));
  else out.push(`<text class="tl-label muted" x="4" y="${my + mh - 6}">${tracks.musicOn ? 'music on, its score is not ready yet' : 'no music in this edit'}</text>`);
  const [fy, fh] = rows.sfx;
  if (tracks.sfx.length) tracks.sfx.forEach((hit, k) => out.push(`<rect class="tl-sfx${hit.sound ? '' : ' missing'}${sel('sfx', String(k))}" x="${(hit.seconds * pps - 3).toFixed(1)}" y="${fy + 3}" width="6" height="${fh - 6}" rx="2" data-sel="sfx" data-id="${k}" data-at="${hit.seconds.toFixed(2)}"><title>${esc(hit.kind)} · ${esc(hit.reason)}${hit.sound ? ` · ${esc(hit.sound)}` : ' · no sound in the library yet'}</title></rect>`));
  else out.push(`<text class="tl-label muted" x="4" y="${fy + fh - 6}">${tracks.sfxOn ? 'effects on, but no drawn moment earns one' : 'no sound effects in this edit'}</text>`);
  out.push(`<line class="tl-playhead" data-tl-playhead x1="${x(TL.at)}" x2="${x(TL.at)}" y1="0" y2="${H}"></line>`);
  const labels = TL_ROWS.map(([key, label]) => `<text class="tl-row-label" x="6" y="${rows[key][0] + rows[key][1] / 2 + 4}">${label}</text>`).join('');
  return `<div class="tl-board"><svg class="tl-labels" width="92" height="${H}" viewBox="0 0 92 ${H}" aria-hidden="true">${labels}</svg><div class="tl-scroll"><svg class="tl-svg" data-tl-svg data-pps="${pps}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Edit timeline">${out.join('')}</svg></div></div>`;
}
function tlEditor(content, edit, stale) {
  tlLoad(edit);
  if (!stale) playLoad(edit);
  // 0.85: one button per connected AI (owner question 2026-11-04: "why there is no button of ask gpt?").
  const tl = edit.timeline, clip = tlClipAt(tl, TL.at), team = state.ai?.team || {}, ais = [['claude', 'Claude'], ['chatgpt', 'ChatGPT']].filter(([key]) => team[key]), who = ais.map(([, name]) => name).join(' or ') || null;
  const askButtons = ais.map(([key, name], k) => action(TL.busy === key ? `${name} is reading the edit…` : `Ask ${name}`, 'tl-ask', key, k ? 'secondary' : 'primary')).join('');
  // 0.88: the whole edit polished by the AI in one request, with the approved editing skills and the competitor lessons.
  const polishRow = ais.length ? `<div class="tl-polish"><strong>Make the whole edit richer</strong><div class="card-actions">${ais.map(([key, name], k) => action(TL.busy === `polish:${key}` ? `${name} is polishing the edit…` : `Polish with ${name}`, 'tl-polish', key, k ? 'secondary' : 'primary')).join('')}</div><p class="hint">One request reads the whole edit and proposes the changes it needs (more for a longer video): transitions for each scene change, camera life, word animations and colours, effects where a line lands, and drawings that match their words and the story's world. It uses your approved editing skills and the competitor lessons, and tokens from the channel's limit. Anything typed in the box above is added to the request. You see every change before applying it.</p></div>` : '';
  // 0.83: a viewer on top with Play, Pause and Stop, the inspector beside it, the timeline below, as in an editing program.
  const toolbar = `<div class="tl-toolbar"><span class="micro-label">TIMELINE</span><label class="tl-zoom">Zoom <input type="range" min="1" max="16" step="1" value="${TL.zoom}" data-tl="zoom" aria-label="Zoom the timeline"></label><small class="muted">Click any item to inspect and change it; click the time ruler to move the playhead.</small></div>`;
  const legend = '<div class="tl-legend"><span class="drawn">Drawn shot</span><span class="edited">Drawing changed in this edit</span><span class="still">Still</span><span class="video">Footage</span><span class="soft">Transition</span><span class="beat">Drawing beat (an element arriving)</span><span class="graphic">Graphic</span><span class="caption">Caption</span></div>';
  const viewer = stale ? '<div class="tl-viewer"><p class="inline-warning">This edit is out of date, so it cannot play. Draft a new edit.</p></div>' : playViewer(edit, content);
  const commandBox = stale ? '' : `<div class="tl-command"><h4>Tell the editor what to change</h4><textarea data-tl="command" rows="3" maxlength="2000" placeholder="For example: make the title in ${esc(clip.label)} slam in gold, add a sparkle when he says &quot;gold&quot;, and use a whip pan after it.">${esc(TL.command)}</textarea>
    <div class="tl-command-row"><label><input type="radio" name="tl-scope" value="clip" data-tl="scope" ${TL.scope === 'clip' ? 'checked' : ''}> The selected clip (${esc((TL.sel?.clipId && tl.clips.find(item => item.id === TL.sel.clipId)?.label) || clip.label)})</label><label><input type="radio" name="tl-scope" value="edit" data-tl="scope" ${TL.scope === 'edit' ? 'checked' : ''}> The whole edit</label>${who ? askButtons : '<span class="muted">Connect Claude or ChatGPT first (Connections).</span>'}</div>
    ${polishRow}<p class="hint">${who ? `Name the shots (for example S18C). Ask for drawings, words, timing, transitions, captions, music, sound effects, or a shot drawn again. Nothing changes until you apply.` : ''}</p>${tlProposal()}</div>`;
  return `<div class="tl-editor" data-tl-root id="tl-player"><div class="tl-panels">${viewer}<div class="tl-inspector">${tlInspector(edit, stale)}</div></div>${toolbar}${tlTracks(tl, stale)}${legend}${commandBox}</div>`;
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
    <p class="hint">Changes show in the player above as you make them; saving makes a new revision.</p><div class="card-actions">${dirty ? action('Save drawing (new revision)', 'tl-save-drawing', clip.id, 'primary') + action('Discard changes', 'tl-discard-drawing', clip.id, 'secondary') : ''}${edited && !dirty ? action('Back to the board’s drawing', 'tl-reset-drawing', clip.id, 'text-button danger') : ''}</div>`}`;
}
function tlInspector(edit, stale) {
  const tl = edit.timeline, sel = TL.sel;
  if (!sel) return '<h4>Inspector</h4><p class="hint">Click a clip, a transition, a drawing beat, a graphic or a caption on the timeline. Everything the edit does there is listed here and can be changed.</p>';
  if (sel.kind === 'graphic') { const item = tl.graphics.find(graphic => graphic.id === sel.id); return item ? `<h4>${esc(EDIT_TEMPLATE_NAMES[item.template] || item.template)} · ${renderClock(item.start / tl.fps)} · ${(item.frames / tl.fps).toFixed(2)} s</h4><p>“${esc(item.lines.join(' / '))}” · ${esc(item.status)}</p><p class="hint">${esc(item.reason)}</p>${stale ? '' : `<div class="card-actions">${action('Edit graphic', 'tl-graphic', item.id, 'secondary')}${item.status !== 'accepted' ? action('Accept', 'tl-graphic-accept', item.id, 'text-button') : ''}${item.status !== 'rejected' ? action('Reject', 'tl-graphic-reject', item.id, 'text-button danger') : ''}</div>`}` : ''; }
  // 0.88: a music cue or a sound effect: what it is, why it is there, and where to change it.
  if (sel.kind === 'music' || sel.kind === 'sfx') {
    const tracks = TL.drawings?.audio || {music: [], sfx: []}, item = (sel.kind === 'music' ? tracks.music : tracks.sfx)[Number(sel.id)];
    if (!item) return '';
    const change = stale ? '' : `<div class="card-actions">${action('Levels and mix', 'audio-settings', edit.id, 'secondary')}<span class="hint">Or ask the editor below (for example: "softer music", "more sound effects").</span></div>`;
    return sel.kind === 'music' ? `<h4>Music · ${tlClock(item.start)}–${tlClock(item.end)}</h4><dl class="style-facts"><div><dt>Mood</dt><dd>${esc(item.mood)} · energy ${esc(item.energy)} of 5</dd></div><div><dt>Track</dt><dd>${esc(item.title || 'not chosen yet')}</dd></div></dl>${change}`
      : `<h4>Sound effect · ${tlClock(item.seconds)}</h4><dl class="style-facts"><div><dt>Sound</dt><dd>${esc(item.kind)}${item.story ? ' (a story sound)' : ''}</dd></div><div><dt>Why here</dt><dd>${esc(item.reason)}</dd></div><div><dt>From the library</dt><dd>${item.sound ? esc(item.sound) : item.story ? 'none yet: Freesound fetches it when connected; until then this moment stays quiet' : 'none yet: add one in the sound library (Freesound fills it when connected)'}</dd></div><div><dt>Density</dt><dd>${esc(tracks.density)}: ${{subtle: 'only the big moments', accent: 'the main moments (each place, each object that makes a sound)', rich: 'every drawn moment (each thing that appears, each place, each word that lands)'}[tracks.density] || ''}</dd></div></dl>${change}`;
  }
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
  if (command === 'tl-step') { playHalt(); TL.at = Math.min(Math.max(0, TL.at + Number(id) / tl.fps), (tl.totalFrames - 1) / tl.fps); return render(); }
  if (command === 'tl-play') return playStart();
  if (command === 'tl-pause') return playPause();
  if (command === 'tl-stop') { playHalt(); TL.at = 0; return render(); }
  if (command === 'tl-play-retry') { PLAY.error = null; PLAY.rev = null; return render(); }
  if (command === 'tl-goto') { const el = document.getElementById(id); if (el?.tagName === 'DETAILS') el.open = true; el?.scrollIntoView({behavior: 'smooth', block: 'start'}); return; }
  if (command === 'tl-goto-player') { document.getElementById('tl-player')?.scrollIntoView({behavior: 'smooth', block: 'start'}); return playStart(); }
  if (command === 'tl-el-up' || command === 'tl-el-down') return restructure(draft => { const i = Number(id), j = command === 'tl-el-up' ? i - 1 : i + 1; [draft.elements[i], draft.elements[j]] = [draft.elements[j], draft.elements[i]]; });
  if (command === 'tl-el-remove') return restructure(draft => { draft.elements.splice(Number(id), 1); });
  if (command === 'tl-el-add') { const kind = document.querySelector('[data-tl="add-kind"]')?.value || 'text'; return restructure(draft => { draft.elements.push(structuredClone(TL_ADD[kind])); TL.sel = {kind: 'element', id: clipId, clipId, index: draft.elements.length - 1}; }); }
  if (command === 'tl-json') { try { TL.drafts[clipId] = JSON.parse(document.querySelector('[data-tl-whole]').value); render(); } catch { toast('That JSON is not valid.', true); } return; }
  if (command === 'tl-discard-drawing') { delete TL.drafts[id]; return render(); }
  if (command === 'tl-discard') { TL.proposal = null; return render(); }
  const busy = run => { if (button) button.disabled = true; return run().catch(error => toast(error.message, true)).finally(() => { if (button) button.disabled = false; }); };
  if (command === 'tl-save-drawing' || command === 'tl-reset-drawing') return busy(async () => { await editSend(edit, [{type: 'set-drawing', clipId: id, sketch: command === 'tl-save-drawing' ? TL.drafts[id] : null}]); delete TL.drafts[id]; await refresh(); toast(command === 'tl-save-drawing' ? 'Drawing saved as a new revision.' : 'Back to the board’s drawing.'); });
  if (command === 'tl-polish') {
    if (TL.busy) return toast('The editor is still reading the edit.', true);
    const key = ['claude', 'chatgpt'].includes(id) ? id : 'claude';
    TL.busy = `polish:${key}`; render();
    return api(`/api/edit-revisions/${edit.id}/command`, {requestedBy: renderPerson() || 'Owner', polish: true, ai: key, ...(TL.command.trim() ? {text: TL.command.trim()} : {})}).then(result => { TL.proposal = result; }).catch(error => toast(error.message, true)).finally(() => { TL.busy = false; render(); });
  }
  if (command === 'tl-ask') {
    const text = TL.command.trim();
    if (text.length < 3) return toast('Write what to change first.', true);
    const focus = TL.scope === 'clip' ? (TL.sel?.clipId || tlClipAt(tl, TL.at).id) : null;
    if (TL.busy) return toast('The editor is still reading the edit.', true);
    TL.busy = ['claude', 'chatgpt'].includes(id) ? id : 'claude'; render();
    return api(`/api/edit-revisions/${edit.id}/command`, {requestedBy: renderPerson() || 'Owner', text, ai: TL.busy, ...(focus ? {clipId: focus} : {})}).then(result => { TL.proposal = result; }).catch(error => toast(error.message, true)).finally(() => { TL.busy = false; render(); });
  }
  if (command === 'tl-apply') { const p = TL.proposal; return busy(async () => { const saved = await editSend(edit, p.ops, `Command: ${TL.command.trim().slice(0, 250)}`); TL.proposal = null; TL.command = ''; await refresh();
    // 0.91: shots drawn again go to Room 04; the owner is told what happens next.
    const redraw = saved?.redraw, changed = p.ops.filter(op => op.type !== 'redraw-shot').length;
    toast(redraw ? `${changed ? `${changed} change${changed === 1 ? '' : 's'} applied. ` : ''}Room 04 is drawing ${redraw.labels.join(', ')} again. When it is done: draw them, approve the visuals, then press Fresh draft here (your changes come along).` : `${p.ops.length} change${p.ops.length === 1 ? '' : 's'} applied as a new revision.`); }); }
  return toast('Unknown action.', true);
}
// ------------------------------------------------------------ the live player (0.83, owner request 2026-11-03)
// "Like other editing software: check the timeline edit, make changes, then render." The edit plays in this page with
// no render: drawn shots are drawn by the render's own engine (/engine.js, the same files the render's browser runs)
// from the same drawing, words and timings, stills and footage get their camera moves, soft joins dissolve, captions
// show plainly, and the narration is the clock. A paused frame of a drawn shot is the frame the render draws.
const PLAY = {rev: null, data: null, loading: false, error: null, engine: null, audio: null, playing: false, silent: false, t0: 0, raf: 0, setupFor: null, media: {}, drafts: {}, snap: null, snapFor: null, video: null};
const playTotal = () => (PLAY.data ? PLAY.data.totalFrames / PLAY.data.fps : 0);
const playSize = data => (data?.vertical ? [540, 960] : [960, 540]);
function playEngine() {
  return PLAY.engine ??= new Promise((resolve, reject) => {
    // The engine draws on #stage (outside the page's redrawn area); each frame is copied onto the visible screen.
    if (!document.getElementById('stage')) document.body.appendChild(Object.assign(document.createElement('canvas'), {id: 'stage', hidden: true}));
    const script = Object.assign(document.createElement('script'), {src: '/engine.js'});
    script.onload = () => resolve();
    script.onerror = () => { PLAY.engine = null; reject(new Error('The drawing engine did not load. Restart the program and try again.')); };
    document.head.appendChild(script);
  });
}
function playLoad(edit) {
  if (PLAY.rev === edit.id && (PLAY.data || PLAY.loading || PLAY.error)) return;
  playHalt();
  Object.assign(PLAY, {rev: edit.id, data: null, error: null, loading: true, setupFor: null, drafts: {}, snap: null, snapFor: null});
  Promise.all([playEngine(), api(`/api/edit-revisions/${edit.id}/player`, null, 'GET')]).then(async ([, data]) => {
    if (PLAY.rev !== data.revisionId) return;
    // Painted pictures are decoded before a layout needs their size, as in the render.
    window.DIMG = window.DIMG || {};
    await Promise.all([...new Set(data.clips.flatMap(clip => clip.images || []))].filter(key => !window.DIMG[key]).map(key => new Promise(done => { const image = new Image(); image.onload = done; image.onerror = done; image.src = `/api/art/${key}`; window.DIMG[key] = image; })));
    await Promise.all([data.fonts.heading, data.fonts.body, data.fonts.hand].map(name => document.fonts.load(`40px "${name}"`).catch(() => null)));
    if (PLAY.rev !== data.revisionId) return;
    PLAY.data = data;
    playSoundsLoad(data.audio);
    PLAY.audio = new Audio(data.narration);
    PLAY.audio.preload = 'auto';
    PLAY.audio.addEventListener('ended', () => { if (PLAY.playing) playPause(); });
  }).catch(error => { PLAY.error = error.message; }).finally(() => { PLAY.loading = false; render(); });
}
function playClipAt(t) {
  const clips = PLAY.data.clips, frame = Math.floor(t * PLAY.data.fps + 1e-6);
  const k = clips.findIndex(clip => frame >= clip.start && frame < clip.start + clip.frames);
  return k < 0 ? (frame < 0 ? 0 : clips.length - 1) : k;
}
// One unsaved drawing from the inspector, checked by the program (strictly, like a save) before it is drawn.
function playDraft(clip) {
  const draft = TL.drafts[clip.id];
  if (!draft) return null;
  const json = JSON.stringify(draft), entry = PLAY.drafts[clip.id] ||= {};
  if (entry.want !== json) { entry.want = json; if (!entry.busy) playDraftFetch(clip.id); }
  return entry;
}
function playDraftFetch(clipId) {
  const entry = PLAY.drafts[clipId], asked = entry.want, rev = PLAY.rev;
  entry.busy = true;
  api(`/api/edit-revisions/${rev}/player-clip`, {clipId, sketch: JSON.parse(asked)}).then(result => { entry.json = asked; entry.data = result; entry.error = null; })
    .catch(error => { entry.json = asked; entry.error = error.message; })
    .finally(() => { entry.busy = false; if (PLAY.rev !== rev) return; if (entry.want !== entry.json) playDraftFetch(clipId); else if (!PLAY.playing) playDraw(TL.at); });
}
function playMedia(clip) {
  let el = PLAY.media[clip.id];
  if (el) return el;
  el = clip.kind === 'still' ? new Image() : Object.assign(document.createElement('video'), {muted: true, playsInline: true, preload: 'auto'});
  // A still or a seek that arrives later redraws the paused frame.
  for (const name of clip.kind === 'still' ? ['load'] : ['loadeddata', 'seeked']) el.addEventListener(name, () => { if (!PLAY.playing) playDraw(TL.at); });
  el.src = clip.src;
  return (PLAY.media[clip.id] = el);
}
// The render's eased camera move (R.easedZoompan) on a picture that covers the frame.
function playCover(c, el, W, H, move, p) {
  const iw = el.videoWidth || el.naturalWidth, ih = el.videoHeight || el.naturalHeight;
  c.fillStyle = '#111'; c.fillRect(0, 0, W, H);
  if (!iw || !ih) return;
  const e = p * p * (3 - 2 * p), a = move?.amount || 0;
  let z = 1, fx = 0.5, fy = 0.5;
  if (move?.kind === 'push-in') z = 1 + a * e; else if (move?.kind === 'pull-out') z = 1 + a - a * e;
  else if (move?.kind === 'pan-right') { z = 1 + a; fx = e; } else if (move?.kind === 'pan-left') { z = 1 + a; fx = 1 - e; } else if (move?.kind === 'push-detail') { z = 1 + a * e; fy = 0.38; }
  const s = Math.max(W / iw, H / ih) * z, dw = iw * s, dh = ih * s;
  c.drawImage(el, (W - dw) * fx, (H - dh) * fy, dw, dh);
}
function playClip(c, clip, local, W, H) {
  const data = PLAY.data, hold = clip.frames / data.fps;
  if (clip.kind === 'drawn') {
    const entry = playDraft(clip), source = entry?.data || clip;
    if (PLAY.setupFor !== source) { window.MOTION.setup({template: 'sketch-scene', data: source.data, palette: data.palette, fonts: data.fonts, finish: 'clean', drawing: data.drawing, vertical: data.vertical, width: W, height: H, fps: data.fps, duration: source.duration}); PLAY.setupFor = source; }
    try { window.MOTION.renderFrame(Math.max(0, Math.min(local, source.duration - 0.1))); c.drawImage(document.getElementById('stage'), 0, 0, W, H); }
    catch (error) { c.fillStyle = '#2b2b2b'; c.fillRect(0, 0, W, H); c.fillStyle = '#fff'; c.font = '16px sans-serif'; c.fillText(`${clip.label}: ${error.message}`.slice(0, 90), 16, H / 2); }
    if (entry?.error && entry.json === entry.want) { c.fillStyle = 'rgba(142,59,40,.92)'; c.fillRect(0, H - 34, W, 34); c.fillStyle = '#fff'; c.font = '600 14px sans-serif'; c.fillText(`Not drawn yet: ${entry.error}`.slice(0, 110), 12, H - 12); }
    return;
  }
  const el = playMedia(clip), p = Math.max(0, Math.min(1, local / hold));
  if (clip.kind !== 'still') {
    const want = (clip.inSeconds || 0) + Math.max(0, local) * (clip.speed || 1);
    if (PLAY.playing) {
      if (PLAY.video !== el) { PLAY.video?.pause(); PLAY.video = el; el.playbackRate = clip.speed || 1; el.currentTime = want; }
      if (el.paused) el.play().catch(() => {});
      if (Math.abs(el.currentTime - want) > 0.3) el.currentTime = want;
    } else if (el.readyState >= 1 && Math.abs(el.currentTime - want) > 0.5 / data.fps) el.currentTime = want;
  }
  playCover(c, el, W, H, clip.kind === 'still' ? clip.move : null, p);
}
function playCaption(c, t, W, H) {
  const group = PLAY.data.captions?.find(item => t >= item.start && t < item.end);
  if (!group) return;
  const size = Math.round((PLAY.data.vertical ? W : H) * 0.058);
  c.font = `700 ${size}px "${PLAY.data.fonts.body}", "Segoe UI", Arial, sans-serif`; c.textAlign = 'center'; c.lineJoin = 'round';
  c.lineWidth = size * 0.2; c.strokeStyle = 'rgba(0,0,0,.85)'; c.fillStyle = '#fff';
  const base = H * (PLAY.data.vertical ? 0.74 : 0.9);
  group.lines.forEach((line, i) => { const y = base - (group.lines.length - 1 - i) * size * 1.2; c.strokeText(line, W / 2, y); c.fillText(line, W / 2, y); });
  c.textAlign = 'start';
}
function playDraw(t) {
  const data = PLAY.data, screen = document.querySelector('[data-tl-canvas]');
  if (!data || !screen) return;
  const c = screen.getContext('2d'), [W, H] = [screen.width, screen.height], k = playClipAt(t), clip = data.clips[k], local = t - clip.start / data.fps;
  playClip(c, clip, local, W, H);
  // A soft join dissolves from the last frame of the clip before (the render blends the two exactly).
  const join = k > 0 ? data.joins[k - 1] : null, span = join && join.type !== 'cut' ? join.frames / data.fps : 0;
  if (span && local < span && PLAY.snapFor === data.clips[k - 1].id) { c.globalAlpha = 1 - local / span; c.drawImage(PLAY.snap, 0, 0, W, H); c.globalAlpha = 1; }
  const next = data.joins[k];
  if (next && next.type !== 'cut' && clip.frames / data.fps - local < 0.6) {
    PLAY.snap ||= document.createElement('canvas');
    if (PLAY.snap.width !== W || PLAY.snap.height !== H) Object.assign(PLAY.snap, {width: W, height: H});
    PLAY.snap.getContext('2d').drawImage(screen, 0, 0); PLAY.snapFor = clip.id;
  }
  playCaption(c, t, W, H);
  playTicker(t, clip);
}
// The playhead, the clock and the timeline's scroll follow the picture without redrawing the page.
function playTicker(t, clip) {
  const line = document.querySelector('[data-tl-playhead]'), svg = document.querySelector('[data-tl-svg]');
  if (line && svg) {
    const x = t * Number(svg.dataset.pps); line.setAttribute('x1', x.toFixed(1)); line.setAttribute('x2', x.toFixed(1));
    const scroller = svg.closest('.tl-scroll');
    if (PLAY.playing && scroller && (x < scroller.scrollLeft || x > scroller.scrollLeft + scroller.clientWidth - 40)) scroller.scrollLeft = tlScroll = Math.max(0, x - 80);
  }
  const clock = document.querySelector('[data-tl-clock]');
  if (clock) clock.textContent = `${tlClock(t)} / ${tlClock(playTotal())} · ${clip.label}`;
}
function playTick() {
  if (!PLAY.playing) return;
  // Leaving the room (or an edit going out of date) stops the sound with the picture.
  if (!document.querySelector('[data-tl-canvas]')) { playHalt(); return; }
  const t = PLAY.silent ? (performance.now() - PLAY.t0) / 1000 : PLAY.audio.currentTime;
  if (t >= playTotal() - 0.5 / PLAY.data.fps) { TL.at = Math.max(0, playTotal() - 1 / PLAY.data.fps); playPause(); return; }
  TL.at = t;
  playDraw(t);
  playSounds(t);
  PLAY.raf = requestAnimationFrame(playTick);
}
// 0.90 (owner report 2026-11-04: "the music and sound effects are added but I cannot hear them"): the player played
// only the narration. Music cues play from their in-point with their fades, a little quieter while the narrator speaks
// (the edit's ducking), and effects fire on their moments, at the render's levels (the render also evens out the
// narration and carves the music under it, so the final mix sounds a little cleaner).
function playSoundsLoad(audio) {
  playSoundsStop();
  PLAY.sounds = {note: audio?.note || '', dip: Math.pow(10, -(audio?.dipDb || 0) / 20), speech: audio?.speech || [],
    music: (audio?.music || []).map(cue => { const el = new Audio(cue.src); el.preload = 'auto'; el.loop = !!cue.loop; return {cue, el}; }),
    sfx: (audio?.sfx || []).map(hit => ({hit})), bank: {}, last: null};
  for (const {hit} of PLAY.sounds.sfx) if (!PLAY.sounds.bank[hit.src]) { const el = new Audio(hit.src); el.preload = 'auto'; PLAY.sounds.bank[hit.src] = el; }
}
function playSoundsStop() {
  for (const {el} of PLAY.sounds?.music || []) el.pause();
  for (const el of Object.values(PLAY.sounds?.bank || {})) el.pause();
  if (PLAY.sounds) PLAY.sounds.last = null;
}
function playSounds(t) {
  const S = PLAY.sounds;
  if (!S || PLAY.silent) return;
  const speaking = S.speech.some(([a, b]) => t >= a - 0.05 && t < b + 0.2);
  for (const item of S.music) {
    const {cue, el} = item;
    if (t < cue.start || t >= cue.end) { if (!el.paused) el.pause(); continue; }
    const into = t - cue.start, fade = Math.min(1, cue.fadeIn > 0 ? into / cue.fadeIn : 1, cue.fadeOut > 0 ? (cue.end - t) / cue.fadeOut : 1);
    // The dip follows the voice smoothly, as the render's compressor does.
    item.duck = (item.duck ?? 1) + ((speaking ? S.dip : 1) - (item.duck ?? 1)) * 0.15;
    el.volume = Math.max(0, Math.min(1, cue.volume * fade * item.duck));
    const want = cue.offset + into, length = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null;
    if (el.paused && !(length && !cue.loop && want >= length - 0.05)) {
      try { el.currentTime = cue.loop && length ? want % length : want; } catch { /* not loaded yet; it starts from where it can */ }
      el.play().catch(() => {});
    }
  }
  // Effects whose moment passed since the last frame fire once (a seek or a start never fires the ones before it).
  if (S.last !== null && t > S.last) for (const {hit} of S.sfx) if (hit.at > S.last && hit.at <= t) {
    const base = S.bank[hit.src], el = base.paused ? base : base.cloneNode();
    el.volume = Math.max(0, Math.min(1, hit.volume));
    try { el.currentTime = 0; } catch { /* plays from the start anyway */ }
    el.play().catch(() => {});
  }
  S.last = t;
}
function playStart() {
  if (!PLAY.data || PLAY.playing) return;
  if (TL.at >= playTotal() - 0.1) TL.at = 0;
  document.querySelector('[data-tl-video]')?.pause();
  Object.assign(PLAY, {playing: true, silent: false, t0: performance.now() - TL.at * 1000});
  PLAY.audio.currentTime = TL.at;
  // Without sound (no narration file, or the browser refuses) the picture still plays on the clock.
  PLAY.audio.play().catch(() => { PLAY.silent = true; PLAY.t0 = performance.now() - TL.at * 1000; });
  PLAY.raf = requestAnimationFrame(playTick);
  render();
}
// Stops the sound and the footage; render() is left to the caller.
function playHalt() {
  if (PLAY.playing && !PLAY.silent && PLAY.audio) TL.at = PLAY.audio.currentTime;
  PLAY.playing = false; cancelAnimationFrame(PLAY.raf);
  PLAY.audio?.pause(); PLAY.video?.pause(); PLAY.video = null;
  playSoundsStop();
}
function playPause() { playHalt(); render(); }
function playSeek(t) {
  TL.at = Math.min(Math.max(0, t), Math.max(0, playTotal() - 1 / (PLAY.data?.fps || 30)));
  if (!PLAY.playing) return;
  PLAY.t0 = performance.now() - TL.at * 1000;
  if (!PLAY.silent) PLAY.audio.currentTime = TL.at;
  playSoundsStop(); // music finds its place again on the next frame; effects before the new spot stay quiet
}
function playViewer(edit, content) {
  const data = PLAY.data, [W, H] = playSize(data || {vertical: edit.timeline.format === 'shorts'}), total = edit.timeline.totalFrames / edit.timeline.fps, clip = tlClipAt(edit.timeline, TL.at);
  const status = PLAY.error ? `<div class="tl-screen-note bad"><p>${esc(PLAY.error)}</p>${action('Try again', 'tl-play-retry', '', 'secondary')}</div>` : !data ? '<div class="tl-screen-note"><p>Loading the drawing engine and the pictures…</p></div>' : '';
  const transport = `<div class="tl-transport">${action('■ Stop', 'tl-stop', '', 'secondary')}${PLAY.playing ? action('❚❚ Pause', 'tl-pause', '', 'primary') : action('▶ Play', 'tl-play', '', 'primary')}${action('◀ 1 frame', 'tl-step', '-1', 'text-button')}${action('1 frame ▶', 'tl-step', '1', 'text-button')}<span class="tl-clock" data-tl-clock>${tlClock(TL.at)} / ${tlClock(total)} · ${esc(clip.label)}</span></div>`;
  const video = tlRender(content);
  const rendered = video ? `<details class="tl-rendered" data-keep-open="tl-rendered"><summary>The rendered video (r${video.scope.edit.revision}${video.scope.edit.revisionId === edit.id ? '' : ', an earlier revision'} · ${renderSizeName(video)})</summary><video class="tl-video" data-tl-video src="/api/renders/${esc(video.id)}/video" controls preload="metadata"></video><p class="hint">The finished file, with music and the caption look. Playing it moves the playhead too.</p></details>` : '';
  return `<div class="tl-viewer"><div class="tl-screen ${data?.vertical || edit.timeline.format === 'shorts' ? 'vertical' : ''}"><canvas data-tl-canvas width="${W}" height="${H}" aria-label="The edit at the playhead"></canvas>${status}</div>${transport}
    <p class="hint">Live, with the narration, music and sound effects. Space plays and pauses.${PLAY.sounds?.note ? ` ${esc(PLAY.sounds.note)}` : ''}</p>${rendered}</div>`;
}
// Clicks on the timeline: select an item and move the playhead there; the ruler only moves the playhead.
document.addEventListener('click', event => {
  const svg = event.target.closest?.('[data-tl-svg]');
  if (!svg) return;
  const {edit} = editContext();
  if (!edit) return;
  const tl = edit.timeline, pps = Number(svg.dataset.pps), item = event.target.closest('[data-sel]'), box = svg.getBoundingClientRect();
  // A drawing beat puts the playhead on its own moment (just after the element arrives); anything else where clicked.
  playSeek(Math.min(Math.max(0, item?.dataset.at ? Number(item.dataset.at) : (event.clientX - box.left) / pps), (tl.totalFrames - 1) / tl.fps));
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
  if (target.dataset.tlPath) { const {edit} = editContext(); if (edit) { tlSet(edit, target.dataset.tlPath, target); if (!PLAY.playing) playDraw(TL.at); } }
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
  // A redrawn page has a blank screen until the next frame: a paused player draws its frame again at once.
  if (PLAY.data && !PLAY.playing && document.querySelector('[data-tl-canvas]')) playDraw(TL.at);
  const video = document.querySelector('[data-tl-video]');
  if (video && TL.at > 0) video.addEventListener('loadedmetadata', () => { video.currentTime = Math.min(TL.at, video.duration); }, {once: true});
}
// Space plays and pauses while the player is on screen (not while typing in a field).
document.addEventListener('keydown', event => {
  if (event.code !== 'Space' || event.repeat || !PLAY.data || !document.querySelector('[data-tl-canvas]') || event.target.closest?.('input, textarea, select, button, [contenteditable]')) return;
  event.preventDefault();
  if (PLAY.playing) playPause(); else playStart();
});
