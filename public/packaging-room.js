'use strict';
// Room 09 - Packaging (P10): title, thumbnail, description, chapter, tag and disclosure variants for an approved
// video; every save is a new revision, thumbnails are drawn locally from the approved visuals, and the named
// approval holds only while the script, the Room 08 approval and the package stay the same. Nothing is published.
// Loaded before app.js; helpers from app.js, render-room.js and review-room.js are used only inside functions.

const PKG_SEVERITY = {critical: ['Critical', 'gray'], suggestion: ['Suggestion', 'orange'], nitpick: ['Polish', 'gray']};
const PKG_JOB = {queued: 'Waiting to start', running: 'Claude is drafting', completed: 'Drafted', failed: 'Failed', interrupted: 'Interrupted', quality_failed: 'Claude’s draft was unusable', blocked_budget: 'Over the monthly token limit', stale: 'Out of date'};
function pkgFor(contentId) { return (state.packaging?.contents || []).find(item => item.contentId === contentId) || null; }

function packagingRoomView(family) {
  const contents = (state.packaging?.contents || []).filter(item => item.familyId === family.id);
  const hero = `<section class="voice-hero"><div><span class="stage-kicker">ROOM 09 · PACKAGING</span><h2>Packaging</h2><p>The title asks, the thumbnail intensifies, the video answers. Draft title and thumbnail variants with Claude or write your own, then judge each thumbnail at phone size. Every figure must come from the script, and the description carries chapters, the AI note and the visual credits. Approve one package for the video you approved in Room 08. Nothing is uploaded: you paste it into YouTube Studio yourself.</p></div>${badge('Drafts use Claude · thumbnails local', 'green')}</section>`;
  if (!contents.length) return `${hero}<section class="production-card"><h3>No approved script yet</h3><p>Approve a script, its narration and its visuals first.</p></section>`;
  if (!contents.some(item => item.contentId === renderContentId)) renderContentId = contents[0].contentId;
  const item = contents.find(entry => entry.contentId === renderContentId), latest = item.latest;
  const picker = contents.length > 1 ? `<div class="production-toolbar"><div><label for="render-content">Script</label><select id="render-content">${contents.map(entry => `<option value="${entry.contentId}" ${entry.contentId === item.contentId ? 'selected' : ''}>${esc(entry.title)}</option>`).join('')}</select></div></div>` : '';
  if (!item.ready) return `${hero}${picker}<section class="production-card"><h3>Not ready to package</h3><p class="inline-warning">${esc(item.blockers.join(' '))}</p></section>`;
  const job = item.jobs[0], busy = job && ['queued', 'running'].includes(job.status), connection = readyClaudeConnection();
  const jobLine = job ? `<p class="${['failed', 'interrupted', 'quality_failed', 'blocked_budget'].includes(job.status) ? 'inline-warning' : 'hint'}"><b>${esc(PKG_JOB[job.status] || job.status)}</b>${job.error ? `: ${esc(job.error)}` : ''}${job.usage?.total ? ` · ${job.usage.total.toLocaleString('en-US')} tokens` : ''}</p>${['failed', 'interrupted', 'quality_failed', 'blocked_budget'].includes(job.status) && job.attempts < 3 ? action('Retry the draft', 'pkg-retry', job.id, 'secondary') : ''}` : '';
  const render = item.approvedRender ? `Video: the render approved in Room 08 by ${esc(item.approvedRender.reviewer)}.` : 'No approved render yet: you can draft now, and approve the package after Room 08 approves the video.';
  const controls = `<section class="production-card"><div class="production-card-head"><div><span class="micro-label">${latest ? `PACKAGE r${latest.revision}` : 'NO PACKAGE YET'}</span><h2>${esc(item.title)}</h2></div>${latest?.approval?.current ? badge('Approved', 'green') : latest?.approval ? badge('Approval out of date', 'gray') : latest ? badge(latest.checks.passed ? 'Ready to approve' : 'Needs fixes', latest.checks.passed ? 'orange' : 'gray') : badge('Not started', 'gray')}</div>
    <p class="hint">${render}</p>${jobLine}
    <div class="card-actions">${!busy && connection ? action(latest ? 'Ask Claude for a new draft' : 'Ask Claude for a package', 'pkg-draft', item.contentId, latest ? 'secondary' : 'primary') : ''}${!busy && !connection ? '<a class="button secondary" href="#connections">Set up Claude to draft</a>' : ''}${!latest ? action('Start from the script (free)', 'pkg-start', item.contentId, 'secondary') : ''}${latest ? action('Edit package', 'pkg-edit', item.contentId, 'primary') : ''}${latest && !latest.approval?.current ? action('Approve package', 'pkg-approve', latest.id, 'secondary') : ''}${latest ? `<a class="button secondary" href="/api/package-revisions/${esc(latest.id)}/export.txt" download>Download for YouTube Studio</a>` : ''}</div></section>`;
  return hero + picker + controls + (latest ? pkgView(latest, item) : '') + (item.history.length > 1 ? `<section class="production-card"><details class="scene-history"><summary>${item.history.length} package revisions</summary><div class="history-list">${item.history.map(entry => `<div class="history-row"><span class="job-dot completed"></span><div><strong>r${entry.revision} · ${esc(entry.actor === 'claude' ? 'Claude draft' : entry.actor === 'rules' ? 'from the script' : entry.createdBy)} · ${esc(date(entry.createdAt))}</strong><small>${esc(entry.note)}</small></div></div>`).join('')}</div></details></section>` : '');
}

function pkgView(rev, item) {
  const p = rev.payload, checks = rev.checks;
  const issues = checks.issues.length ? `<div class="qc-issues">${checks.issues.map(issue => { const [label, tone] = PKG_SEVERITY[issue.severity] || [issue.severity, 'gray']; return `<div class="qc-issue pkg-issue"><div>${badge(label, tone)}</div><div><p>${esc(issue.message)}</p></div><div></div></div>`; }).join('')}</div>` : '<p class="muted">Every package check passed.</p>';
  const titles = `<div class="history-list">${p.titles.map(title => `<div class="history-row"><span class="job-dot ${title.id === p.chosenTitle ? 'completed' : ''}"></span><div><strong>${esc(title.text)}${title.id === p.chosenTitle ? ' · chosen' : ''}</strong><small>${title.text.length} characters${title.why ? ` · ${esc(title.why)}` : ''}</small></div></div>`).join('')}</div>`;
  const thumbs = `<div class="pkg-thumbs">${p.thumbnails.map(thumb => { const image = rev.images[thumb.id]; return `<div class="pkg-thumb ${thumb.id === p.chosenThumbnail ? 'chosen' : ''}"><div class="card-top"><b>Thumbnail ${thumb.id.slice(1)}${thumb.id === p.chosenThumbnail ? ' · chosen' : ''}</b><span class="muted">${esc(thumb.shot)}${thumb.at ? ` at ${thumb.at} s` : ''} · ${esc(thumb.layout)}</span></div>${image ? `<img class="pkg-full" src="${esc(image.url)}" alt="Thumbnail ${thumb.id.slice(1)}"><div class="pkg-phone"><img src="${esc(image.url)}" alt="Thumbnail ${thumb.id.slice(1)} at phone size"><span class="hint">At phone size: does it still read?<br><a href="${esc(image.url)}" download="thumbnail-${thumb.id.slice(1)}.jpg">Download 1280×720 JPEG</a></span></div>` : '<p class="inline-warning">Not drawn.</p>'}<p><b>${esc(thumb.text || '(no words)')}</b></p>${thumb.concept ? `<p class="hint">${esc(thumb.concept)}</p>` : ''}</div>`; }).join('')}</div>`;
  const approval = rev.approval ? `<div class="handoff-rule"><strong>${rev.approval.current ? 'Approved' : 'Approval out of date'} · ${esc(rev.approval.approvedBy)} · ${esc(date(rev.approval.at))}</strong><p>${esc(rev.approval.staleReason || rev.approval.notes || 'No notes.')}</p></div>` : '';
  return `<section class="production-card"><div class="production-card-head"><div><span class="micro-label">CHECKS</span><h2>${checks.passed ? 'Ready for your review' : 'Fix the critical checks before approval'}</h2></div>${checks.lint?.score !== null && checks.lint?.score !== undefined ? badge(`Title craft ${checks.lint.score}`, checks.lint.score >= 70 ? 'green' : 'orange') : ''}</div>${issues}${approval}</section>
    <section class="production-card"><div class="production-card-head"><div><span class="micro-label">TITLES</span><h2>The title asks</h2></div></div>${titles}</section>
    <section class="production-card"><div class="production-card-head"><div><span class="micro-label">THUMBNAILS · 1280×720</span><h2>The thumbnail intensifies</h2></div></div>${thumbs}</section>
    <section class="production-card"><div class="production-card-head"><div><span class="micro-label">DESCRIPTION AS IT WILL BE PASTED</span><h2>Description, chapters, note and credits</h2></div>${badge(`${checks.description.length} / 5000`, checks.description.length > 5000 ? 'gray' : 'green')}</div><pre class="pkg-description">${esc(checks.description)}</pre>
      <dl class="style-facts"><div><dt>Tags</dt><dd>${esc(p.tags.join(', ') || 'none')}</dd></div><div><dt>Altered or synthetic content</dt><dd>${p.disclosure.synthetic ? 'Yes: tick YouTube’s label' : 'No'}</dd></div><div><dt>Chapters</dt><dd>${p.chapters.length || 'none'}</dd></div><div><dt>Credits</dt><dd>${checks.credits.length} visual${checks.credits.length === 1 ? '' : 's'}</dd></div></dl></section>`;
}

// The edit form: every field of the package, saved as one new revision.
function pkgEditBody(rev, item) {
  const p = rev.payload, titleRows = Array.from({length: 8}, (_, k) => p.titles[k] || {id: `t${k + 1}`, text: '', why: ''});
  const thumbRows = Array.from({length: 4}, (_, k) => p.thumbnails[k] || {id: `k${k + 1}`, text: '', accent: '', shot: '', at: 0, layout: 'left', concept: ''});
  const shotOptions = selected => `<option value="">(unused)</option>${item.shots.map(shot => `<option value="${esc(shot.label)}" ${shot.label === selected ? 'selected' : ''}>${esc(shot.label)} · ${esc(shot.mediaType)}${shot.purpose ? ` · ${esc(shot.purpose)}` : ''}</option>`).join('')}`;
  return `<p class="hint">Saving makes package r${rev.revision + 1} and redraws changed thumbnails locally. Thumbnail words: 1-3, not taken from the title; one may be the accent.</p>
    <h3 class="intel-subhead">Titles (chosen one marked)</h3><div class="pkg-form-rows">${titleRows.map((title, k) => `<label class="pkg-radio"><input type="radio" name="chosenTitle" value="${k}" ${title.id === p.chosenTitle ? 'checked' : ''} aria-label="Choose title ${k + 1}"><input name="title${k}" maxlength="100" value="${esc(title.text)}" placeholder="Title variant ${k + 1}"></label>`).join('')}</div>
    <h3 class="intel-subhead">Thumbnails</h3><div class="pkg-form-rows">${thumbRows.map((thumb, k) => `<div class="pkg-thumb-row"><label class="pkg-radio"><input type="radio" name="chosenThumbnail" value="${k}" ${thumb.id === p.chosenThumbnail ? 'checked' : ''} aria-label="Choose thumbnail ${k + 1}">${k + 1}</label>
      <label>Words<input name="thumbText${k}" maxlength="28" value="${esc(thumb.text)}"></label><label>Accent word<input name="thumbAccent${k}" maxlength="28" value="${esc(thumb.accent)}"></label>
      <label>Shot<select name="thumbShot${k}">${shotOptions(thumb.shot)}</select></label><label>Seconds into the clip<input name="thumbAt${k}" type="number" min="0" max="600" step="0.1" value="${thumb.at}"></label>
      <label>Words sit<select name="thumbLayout${k}">${['left', 'right', 'bottom'].map(layout => `<option value="${layout}" ${layout === thumb.layout ? 'selected' : ''}>${layout}</option>`).join('')}</select></label>
      <label class="full">Concept<input name="thumbConcept${k}" maxlength="300" value="${esc(thumb.concept)}"></label></div>`).join('')}</div>
    <div class="form-grid"><label class="full">Description (chapters, the AI note and credits are added below it)<textarea name="description" rows="6" maxlength="3500">${esc(p.description)}</textarea></label>
      <label class="full">Tags (comma separated)<input name="tags" maxlength="500" value="${esc(p.tags.join(', '))}"></label>
      ${p.chapters.map((chapter, k) => `<label>Chapter at ${renderClock(chapter.at)}<input name="chapter${k}" maxlength="60" value="${esc(chapter.title)}"></label>`).join('')}
      <label class="full checkbox-label"><input type="checkbox" name="synthetic" ${p.disclosure.synthetic ? 'checked' : ''}>Tick YouTube’s “altered or synthetic content” label for this video</label>
      <label class="full">AI note in the description<input name="aiNote" maxlength="500" value="${esc(p.disclosure.note)}"></label>
      ${renderNameField()}<label>What changed<input name="note" maxlength="300" placeholder="e.g. Sharper title, new thumbnail shot"></label></div>`;
}
function pkgFormPayload(form, rev) {
  const value = name => form.elements[name]?.value ?? '';
  const titleSlots = Array.from({length: 8}, (_, k) => value(`title${k}`).trim()), chosenTitle = Number(value('chosenTitle'));
  const titles = titleSlots.map((text, k) => ({k, text})).filter(item => item.text);
  const thumbSlots = Array.from({length: 4}, (_, k) => ({k, text: value(`thumbText${k}`).trim(), accent: value(`thumbAccent${k}`).trim(), shot: value(`thumbShot${k}`), at: Number(value(`thumbAt${k}`) || 0), layout: value(`thumbLayout${k}`), concept: value(`thumbConcept${k}`).trim()})).filter(item => item.shot);
  const chosenThumbnail = Number(value('chosenThumbnail'));
  return {titles: titles.map(item => ({text: item.text, why: rev.payload.titles[item.k]?.text === item.text ? rev.payload.titles[item.k].why : ''})), chosenTitle: `t${Math.max(1, titles.findIndex(item => item.k === chosenTitle) + 1)}`,
    thumbnails: thumbSlots.map(({k, ...thumb}) => thumb), chosenThumbnail: `k${Math.max(1, thumbSlots.findIndex(item => item.k === chosenThumbnail) + 1)}`,
    description: value('description'), tags: value('tags').split(',').map(tag => tag.trim()).filter(Boolean),
    chapterTitles: rev.payload.chapters.map((_, k) => value(`chapter${k}`).trim()), disclosure: {synthetic: !!form.elements.synthetic?.checked, note: value('aiNote').trim()}};
}

function pkgAction(command, id, button) {
  const item = pkgFor(renderContentId), rev = item?.latest;
  if (command === 'pkg-start') { if (button) button.disabled = true; return api(`/api/content/${id}/package/start`, {requestedBy: renderPerson() || 'Owner'}).then(refresh).then(() => toast('Package r1 started from the script. Write the words next.')).catch(error => toast(error.message, true)).finally(() => { if (button) button.disabled = false; }); }
  if (command === 'pkg-draft') {
    const connection = readyClaudeConnection();
    if (!connection) return toast('Set up and test a Claude connection first.', true);
    return renderDialog('pkg-draft', 'Ask Claude for a package', 'CLAUDE · USES TOKENS OR YOUR PLAN ALLOWANCE', `<p class="hint">Claude reads the approved script, the draft chapters and the shots on the approved board, and drafts 5 titles, 3 thumbnails that differ on purpose, a description, chapter titles and tags. Tokens are reserved first; nothing is retried by itself. The draft becomes a new package revision for you to edit.</p><div class="form-grid">${renderNameField()}</div><p class="hint">Connection: ${esc(connection.name)}</p>`, 'Ask Claude', {contentId: id, connector: {id: connection.id, revision: connection.revision}});
  }
  if (command === 'pkg-retry') return renderDialog('pkg-retry', 'Retry the package draft', 'CLAUDE · DELIBERATE RETRY', `<div class="form-grid">${renderNameField()}</div><label class="checkbox-label"><input type="checkbox" name="confirmInterrupted">I understand an interrupted attempt may already have used tokens.</label>`, 'Retry', {jobId: id});
  if (!rev) return toast('Start a package first.', true);
  if (command === 'pkg-edit') return renderDialog('pkg-save', `Edit package r${rev.revision}`, 'OWNER EDIT · NEW REVISION', pkgEditBody(rev, item), 'Save package', {contentId: item.contentId, expectedRevision: rev.revision});
  if (command === 'pkg-approve') return renderDialog('pkg-approve', `Approve package r${rev.revision}`, 'HUMAN APPROVAL', `<p class="hint">The package belongs to the video approved in Room 08. It goes out of date if the script, that approval or the package changes. Nothing is published.</p><div class="form-grid">${renderNameField()}<label class="full">Notes<input name="notes" maxlength="2000"></label></div>
    <label class="checkbox-label"><input type="checkbox" name="titleHonest">The chosen title is paid off by the video.</label>
    <label class="checkbox-label"><input type="checkbox" name="thumbnailChecked">I judged the chosen thumbnail at phone size, and it promises nothing the video does not show.</label>
    <label class="checkbox-label"><input type="checkbox" name="disclosureReviewed">The altered-or-synthetic choice and the AI note are right for this video.</label>
    <label class="checkbox-label"><input type="checkbox" name="creditsReviewed">The visual credits are complete.</label>`, 'Approve', {revisionId: rev.id});
  return toast('Unknown action.', true);
}
