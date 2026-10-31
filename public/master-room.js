'use strict';
// Room 10 - Render & Recovery (P11): the final master, made only from the preview approved in Room 08 and its
// approved package, checked for YouTube's upload format and against that preview, resumable from its checked
// parts, and approved by name. Loaded before app.js; helpers from app.js and render-room.js are used inside functions.

const MASTER_BLOCKING = ['full decode', 'audio/video alignment', 'duration', 'frame', 'narration audio', 'delivery format', 'matches the approved preview'];

function masterRoomView(family) {
  const contents = state.renders.contents.filter(item => item.familyId === family.id);
  const hero = `<section class="voice-hero"><div><span class="stage-kicker">ROOM 10 · RENDER & RECOVERY</span><h2>Final master</h2><p>The video you upload: rendered at full quality (1080p, YouTube's recommended format) from exactly the preview you approved in Room 08, with its approved package. If the program stops while it renders, the parts it already finished are checked and reused. You approve the master by name as the last step.</p></div></section>`;
  if (!contents.length) return `${hero}<section class="production-card"><h3>Nothing to master yet</h3><p>Render and approve a preview in Room 08, then approve its package in Room 09.</p></section>`;
  if (!contents.some(item => item.contentId === renderContentId)) renderContentId = contents[0].contentId;
  const content = contents.find(item => item.contentId === renderContentId);
  const picker = contents.length > 1 ? `<div class="production-toolbar"><div><label for="render-content">Script</label><select id="render-content">${contents.map(item => `<option value="${item.contentId}" ${item.contentId === content.contentId ? 'selected' : ''}>${esc(item.title)}</option>`).join('')}</select></div></div>` : '';
  return hero + picker + masterGateCard(content) + (content.masters.length ? content.masters.map((job, k) => masterCard(job, k === 0)).join('') : '');
}

function masterGateCard(content) {
  const from = content.masterFrom || {}, preview = content.renders.find(job => job.id === from.previewId), active = [...content.renders, ...content.masters].some(job => ['queued', 'running'].includes(job.status));
  const row = (ok, title, detail) => `<div class="handoff-record"><span>${ok ? '✓' : '○'}</span><div><strong>${title}</strong><p>${detail}</p></div></div>`;
  const pin = state.renders.pin, ready = !!(preview && from.packageApproval && pin && state.renders.pinMatchesLatest);
  return `<section class="production-card"><div class="production-card-head"><div><span class="micro-label">MADE FROM</span><h2>${esc(content.title)}</h2></div>${badge(ready ? 'Ready to render the master' : 'Not ready yet', ready ? 'green' : 'gray')}</div>
    ${row(!!preview, 'Approved preview (Room 08)', preview ? `Approved by ${esc(preview.review?.reviewer || '')} · ${esc(date(preview.review?.at || preview.createdAt))} · ${esc(preview.scope.styleName)} r${preview.scope.styleRevision}` : 'Render the edit and approve it in Room 08 (Review & QC).')}
    ${row(!!from.packageApproval, 'Approved package (Room 09)', from.packageApproval ? `Package r${from.packageApproval.revision} approved by ${esc(from.packageApproval.approvedBy)}` : 'Approve the title, thumbnail and description for the approved preview in Room 09.')}
    ${row(!!pin && state.renders.pinMatchesLatest, 'Pinned FFmpeg build', pin ? `FFmpeg ${esc(pin.version)} · the master uses the same build as the preview` : 'Check and pin FFmpeg in Room 05.')}
    <div class="card-actions">${ready && !active ? action('Render the final master', 'master-start', preview.id, 'primary') : ''}${!preview ? `<button class="secondary" data-production-room="qc">Open Room 08</button>` : !from.packageApproval ? `<button class="secondary" data-production-room="packaging">Open Room 09</button>` : ''}</div>
    <p class="hint">Rendering is local and free. A long video can take a long time at full quality; you can close the page, and if the PC restarts, retrying continues from the finished parts.</p></section>`;
}

function masterCard(job, latest) {
  const m = job.master || {}, result = job.result, progress = job.progress;
  const head = `<div class="production-card-head"><div><span class="micro-label">FINAL MASTER · ${esc(date(job.createdAt))}${latest ? '' : ' · EARLIER'}</span><h2>${esc(job.scope.styleName)} r${job.scope.styleRevision}</h2></div>${renderBadge(job.status)}</div>`;
  if (['queued', 'running'].includes(job.status)) {
    return `<section class="production-card">${head}<div class="cap-row"><div><strong>${esc(progress?.stage || 'Waiting for the render worker')}</strong><small>Attempt ${job.attempts}/3 · ${renderAlive(job)}${m.partsKept ? ` · ${m.partsKept} finished part${m.partsKept === 1 ? '' : 's'} checked and kept` : ''}</small></div></div><div class="card-actions">${action('Cancel', 'render-cancel', job.id, 'text-button danger')}</div></section>`;
  }
  if (!result) {
    const retry = ['failed', 'interrupted', 'cancelled', 'stale'].includes(job.status) && job.attempts < 3;
    return `<section class="production-card">${head}<p class="inline-warning">${esc(job.error || 'No output.')}</p>${m.partsKept ? `<p class="hint">${m.partsKept} finished part${m.partsKept === 1 ? ' is' : 's are'} kept with ${m.partsKept === 1 ? 'its checksum' : 'their checksums'}. A retry checks ${m.partsKept === 1 ? 'it' : 'them'} and continues; a part that changed is made again.</p>` : ''}<div class="card-actions">${retry ? action(m.partsKept ? 'Retry from the finished parts' : 'Retry', 'render-retry', job.id, 'primary') : ''}</div></section>`;
  }
  const checks = result.qc.map(check => `<span class="${check.passed ? 'pass' : 'fail'}" title="${esc(check.detail)}">${check.passed ? '✓' : '!'} ${esc(check.name)}</span>`).join('');
  const failed = result.qc.filter(check => !check.passed), blocking = failed.filter(check => MASTER_BLOCKING.includes(check.name));
  const match = result.qc.find(check => check.name === 'matches the approved preview'), delivery = result.qc.find(check => check.name === 'delivery format');
  const size = result.video.sizeBytes >= 1e9 ? `${(result.video.sizeBytes / 1e9).toFixed(2)} GB` : `${(result.video.sizeBytes / 1e6).toFixed(1)} MB`;
  const approval = m.approval;
  const decision = approval
    ? `<div class="handoff-rule"><strong>${approval.current ? 'Approved' : 'Approval out of date'} · by ${esc(approval.approvedBy)} · ${esc(date(approval.at))}</strong><p>${esc(approval.notes || 'No notes.')}</p>${approval.current ? '' : `<p class="inline-warning">${esc(approval.staleReason)}</p>`}</div>`
    : !m.current ? `<p class="inline-warning">${esc(m.staleReason || 'This master is out of date.')}</p>`
    : blocking.length ? `<p class="inline-warning">This master cannot be approved: ${esc(blocking[0].name)} - ${esc(blocking[0].detail)}</p>`
    : `<div class="card-actions">${action('Approve the final master', 'master-approve', job.id, 'primary')}</div>`;
  return `<section class="production-card">${head}
    <div class="render-player"><video controls preload="metadata" src="${esc(result.videoUrl)}"></video><div class="render-facts"><dl class="style-facts"><div><dt>Format</dt><dd>${result.preset.width}×${result.preset.height} · ${result.preset.fps} fps · ${esc(size)}</dd></div><div><dt>Made from</dt><dd>preview approved by ${esc(m.sourceReviewer || '')}${m.packageRevision ? ` · package r${m.packageRevision}` : ''}</dd></div><div><dt>Render time</dt><dd>${esc(renderClock(result.renderSeconds || 0))}</dd></div></dl>
      <div class="qc-checks">${checks}</div>${failed.map(check => `<p class="inline-warning"><b>${esc(check.name)}:</b> ${esc(check.detail)}</p>`).join('')}
      ${delivery ? `<p class="hint"><b>Upload format:</b> ${esc(delivery.detail)}</p>` : ''}${match ? `<p class="hint"><b>Same as the approved preview:</b> ${esc(match.detail)}</p>` : ''}
      <p class="hint"><a href="${esc(result.videoUrl)}" download>Download the master</a> · <a href="${esc(result.manifestUrl)}" target="_blank" rel="noopener">render manifest ↗</a></p></div></div>
    ${decision}</section>`;
}

function masterAction(command, id) {
  const content = state.renders.contents.find(item => item.contentId === renderContentId);
  if (command === 'master-start') {
    return renderDialog('master-start', 'Render the final master', 'LOCAL RENDER · NO COST · FULL QUALITY', `<p class="hint">Renders "${esc(content.title)}" at full quality (${state.families.find(item => item.id === content.familyId)?.format === 'shorts' ? '1080×1920' : '1920×1080'}, H.264 High, AAC 384 kb/s) from exactly the preview approved in Room 08: the same edit, narration, visuals, sound, style and FFmpeg build. Drawn shots are drawn again at full size. Then the master is checked for YouTube's upload format and compared frame by frame with the preview.</p>${renderNameField()}`, 'Render the master', {id});
  }
  if (command === 'master-approve') {
    const job = content.masters.find(item => item.id === id);
    const failed = job.result.qc.filter(check => !check.passed);
    return renderDialog('master-approve', 'Approve the final master', 'HUMAN DECISION · YOUR NAME IS RECORDED', `<p class="hint">This is the video you will upload, with package r${job.master.packageRevision}. The approval goes out of date by itself if the preview approval, the package, the script, the visuals or the edit change.</p><div class="form-grid">${renderNameField()}<label class="full">Notes<textarea name="notes" maxlength="2000" rows="2"></textarea></label></div>
      <label class="checkbox-label"><input type="checkbox" name="spotChecked">I watched the opening, a middle part and the ending of the master at full quality.</label>
      <label class="checkbox-label"><input type="checkbox" name="listened">I listened to the master's sound.</label>
      <label class="checkbox-label"><input type="checkbox" name="packageMatches">The approved title and thumbnail fit this master.</label>
      ${failed.length ? `<label class="checkbox-label"><input type="checkbox" name="qcAccepted">I accept the ${failed.length} remaining check finding${failed.length === 1 ? '' : 's'} listed for this master.</label>` : ''}`, 'Approve master', {id});
  }
  return toast('Unknown action.', true);
}
