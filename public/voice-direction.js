'use strict';
// Voice Room: Claude's voice direction (P08b). Claude marks how every sentence is performed (emotion, energy,
// pace, pause, stressed words); the owner can change any line, which makes a new revision; auditions perform the
// newest direction.
function vdFor(contentId) { return state.voiceDirection?.contents.find(item => item.contentId === contentId)?.latest || null; }
function vdJob(contentId) { return state.voiceDirection?.jobs.find(item => item.contentId === contentId) || null; }
// The arc in a few words: the emotions the narrator moves through, most used first.
function vdArc(direction) {
  const counts = new Map();
  for (const line of direction.lines) counts.set(line.emotion, (counts.get(line.emotion) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([emotion, count]) => `${emotion} ×${count}`).join(' · ');
}
function voiceDirectionBlock(content) {
  const direction = vdFor(content.id), job = vdJob(content.id), busy = job && ['queued', 'running'].includes(job.status);
  const failed = job && !busy && ['failed', 'interrupted', 'quality_failed', 'blocked_budget', 'stale'].includes(job.status) && (!direction || job.createdAt > direction.createdAt);
  return `<div class="vd-block">${direction ? badge(`Voice direction r${direction.revision}`, 'green') : badge(busy ? 'Claude is directing the voice' : 'No voice direction', busy ? 'orange' : 'gray')}${direction ? `<small class="muted">${esc(vdArc(direction))}</small>` : ''}${failed ? `<small class="inline-warning">${esc(job.error || job.status)}</small>${action('Retry', 'vd-retry', job.id, 'text-button')}` : ''}${busy ? '' : action(direction ? 'Direct again' : 'Direct the voice', 'vd-direct', content.id, 'secondary')}${direction ? action('Open direction', 'vd-open', content.id, 'text-button') : ''}</div>`;
}
function vdEditBody(direction) {
  const options = (list, value) => list.map(item => `<option ${String(item) === String(value) ? 'selected' : ''}>${esc(item)}</option>`).join('');
  return `${direction.summary ? `<p class="hint">${esc(direction.summary)}</p>` : ''}${direction.warnings?.length ? `<p class="inline-warning">${esc(direction.warnings.slice(0, 3).join(' '))}</p>` : ''}<div class="vd-lines">${direction.lines.map(line => `<div class="vd-line"><p><strong>${line.n}.</strong> ${esc(direction.sentences[line.n - 1]?.text || '')}</p><div class="form-grid">
    <label>Emotion<select name="emotion-${line.n}">${options(state.voiceDirection.emotions, line.emotion)}</select></label>
    <label>Energy<select name="energy-${line.n}">${options([1, 2, 3, 4, 5], line.energy)}</select></label>
    <label>Pace<select name="pace-${line.n}">${options(state.voiceDirection.paces, line.pace)}</select></label>
    <label>Pause after<select name="pause-${line.n}">${options(state.voiceDirection.pauses, line.pause)}</select></label>
    <label class="full">Stressed words<input name="emphasis-${line.n}" value="${esc(line.emphasis.join(', '))}" maxlength="120"></label></div>${line.note ? `<small class="muted">${esc(line.note)}</small>` : ''}</div>`).join('')}</div><div class="form-grid">${renderNameField()}<label class="full">Change note<input name="note" maxlength="200"></label></div>`;
}
// Only the lines the owner changed go to the server; it checks the whole direction again.
function vdChanges(form, direction) {
  const value = name => form.elements[name]?.value ?? '';
  return direction.lines.map(line => ({n: line.n, emotion: value(`emotion-${line.n}`), energy: Number(value(`energy-${line.n}`)), pace: value(`pace-${line.n}`), pause: value(`pause-${line.n}`), emphasis: value(`emphasis-${line.n}`).split(',').map(word => word.trim()).filter(Boolean)}))
    .filter((line, k) => { const before = direction.lines[k]; return line.emotion !== before.emotion || line.energy !== before.energy || line.pace !== before.pace || line.pause !== before.pause || line.emphasis.join('|') !== before.emphasis.join('|'); });
}
function vdAction(command, id) {
  if (command === 'vd-direct') {
    const connection = readyClaudeConnection();
    if (!connection) return toast('Set up and test a Claude connection first.', true);
    return renderDialog('vd-direct', 'Ask Claude to direct the voice', 'CLAUDE · USES TOKENS OR YOUR PLAN ALLOWANCE', `<p class="hint">Claude reads the approved script, the audience, the style and any competitor voice techniques, and marks how every sentence is performed: emotion, energy, pace, pauses and stressed words, so the story rises and falls. Tokens are reserved first; nothing is retried by itself. Auditions then perform the newest direction, and the scene planner follows it.</p><div class="form-grid">${renderNameField()}</div>`, 'Ask Claude', {contentId: id, connector: {id: connection.id, revision: connection.revision}});
  }
  if (command === 'vd-retry') return renderDialog('vd-retry', 'Retry the voice direction', 'CLAUDE · DELIBERATE RETRY', `<div class="form-grid">${renderNameField()}</div><label class="checkbox-label"><input type="checkbox" name="confirmInterrupted">I understand an interrupted attempt may already have used tokens.</label>`, 'Retry', {jobId: id});
  if (command === 'vd-open') {
    const direction = vdFor(id);
    if (!direction) return toast('Ask Claude to direct the voice first.', true);
    return renderDialog('vd-save', `Voice direction r${direction.revision}`, 'OWNER EDIT · NEW REVISION', vdEditBody(direction), 'Save changes', {contentId: id, directionId: direction.id, expectedRevision: direction.revision});
  }
  return toast('Unknown action.', true);
}
