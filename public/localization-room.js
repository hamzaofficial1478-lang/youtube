'use strict';
// Room 06 - Captions & Localization (L01): one edition per extra language of the family, adapted from the locked
// primary video (its approved master): narration, on-screen words and package, side by side with the source, checked
// and approved by name. Captions of the primary video live in Room 05. Loaded before app.js; helpers from app.js and
// render-room.js are used only inside functions.

const ED_JOB = {queued: 'Waiting to start', running: 'Claude is adapting', completed: 'Adapted', failed: 'Failed', interrupted: 'Interrupted', quality_failed: 'Claude’s answer was unusable', blocked_budget: 'Over the monthly token limit', stale: 'Out of date'};
const ED_PROBLEM = ['failed', 'interrupted', 'quality_failed', 'blocked_budget'];
function edFor(contentId) { return (state.localization?.contents || []).find(item => item.contentId === contentId) || null; }
function edEdition(key) { const [contentId, locale] = String(key).split('|'); return {item: edFor(contentId), edition: edFor(contentId)?.editions.find(entry => entry.locale === locale), contentId, locale}; }

function localizationRoomView(family) {
  const hero = `<section class="voice-hero"><div><span class="stage-kicker">ROOM 06 · CAPTIONS & LOCALIZATION</span><h2>Language editions</h2><p>Each of this family's other languages gets its own edition of a finished video: the narration, every word on screen and the package, adapted for that market (not translated word for word), side by side with the original. Numbers, names and facts stay; each sentence stays about as long to say, so the picture can be reused. You approve each language by name. Captions of the main video live in Room 05.</p></div></section>`;
  if (family.locales.length < 2) return `${hero}<section class="production-card"><h3>One language</h3><p>This family makes videos in ${esc(family.primaryLocale)} only. Add languages to the family in Studio to make editions.</p></section>`;
  const contents = (state.localization?.contents || []).filter(item => item.familyId === family.id);
  if (!contents.length) return `${hero}<section class="production-card"><h3>No finished video yet</h3><p>Editions start from a locked video: approve its final master in Room 10 first.</p></section>`;
  if (!contents.some(item => item.contentId === renderContentId)) renderContentId = contents[0].contentId;
  const item = contents.find(entry => entry.contentId === renderContentId);
  const picker = contents.length > 1 ? `<div class="production-toolbar"><div><label for="render-content">Script</label><select id="render-content">${contents.map(entry => `<option value="${entry.contentId}" ${entry.contentId === item.contentId ? 'selected' : ''}>${esc(entry.title)}</option>`).join('')}</select></div></div>` : '';
  if (!item.ready) return `${hero}${picker}<section class="production-card"><h3>Not ready for editions</h3><p class="inline-warning">${esc(item.blockers.join(' '))}</p>${item.blockers.some(text => /Room 10/.test(text)) ? '<div class="card-actions"><button class="secondary" data-production-room="render">Open Room 10</button></div>' : ''}</section>`;
  const s = item.source;
  const source = `<section class="production-card"><div class="production-card-head"><div><span class="micro-label">ADAPTED FROM · ${esc(item.primaryLocale)}</span><h2>${esc(item.title)}</h2></div>${badge('Master approved', 'green')}</div>
    <p class="hint">${s.sentences} narration sentence${s.sentences === 1 ? '' : 's'} · ${s.visible} on-screen text${s.visible === 1 ? '' : 's'}${s.package ? ' · title, description, tags and thumbnail words' : ''}${s.designed ? ` · ${s.designed} designed shot${s.designed === 1 ? '' : 's'} with words inside the design (shown as in the main video unless redesigned)` : ''}.</p></section>`;
  return hero + picker + source + item.editions.map(edition => editionCard(item, edition)).join('');
}

function editionCard(item, edition) {
  const latest = edition.latest, job = edition.jobs[0], busy = job && ['queued', 'running'].includes(job.status), connection = readyClaudeConnection(), key = `${item.contentId}|${edition.locale}`;
  const status = latest?.approval?.current ? badge('Approved', 'green') : latest?.approval ? badge('Approval out of date', 'gray') : latest ? badge(edition.sourceChanged ? 'Main video changed' : latest.checks.passed ? 'Ready to approve' : 'Needs fixes', latest.checks.passed && !edition.sourceChanged ? 'orange' : 'gray') : badge('Not started', 'gray');
  const jobLine = job ? `<p class="${ED_PROBLEM.includes(job.status) ? 'inline-warning' : 'hint'}"><b>${esc(ED_JOB[job.status] || job.status)}</b>${job.parts > 1 ? ` · part ${Math.min(job.partsDone + (busy ? 1 : 0), job.parts)} of ${job.parts}` : ''}${job.error ? `: ${esc(job.error)}` : ''}${job.usage?.total ? ` · ${job.usage.total.toLocaleString('en-US')} tokens` : ''}</p>${ED_PROBLEM.includes(job.status) && job.attempts < 3 ? action(job.partsDone ? 'Retry (finished parts are kept)' : 'Retry', 'edition-retry', job.id, 'secondary') : ''}` : '';
  const changed = edition.sourceChanged ? `<p class="inline-warning">The main video's words changed after r${latest.revision}. Ask Claude again: only the changed sentences and words are adapted, the rest keeps its approved wording.</p>` : '';
  const actions = `<div class="card-actions">${!busy && connection ? action(latest ? 'Ask Claude to adapt again' : `Ask Claude to adapt into ${esc(edition.language)}`, 'edition-draft', key, latest && !edition.sourceChanged ? 'secondary' : 'primary') : ''}${!busy && !connection ? '<a class="button secondary" href="#connections">Set up Claude to adapt</a>' : ''}${!busy ? action(latest ? 'Edit' : 'Write it myself', 'edition-edit', key, 'secondary') : ''}${latest && !latest.approval?.current && !edition.sourceChanged && latest.checks.passed ? action('Approve this language', 'edition-approve', latest.id, 'primary') : ''}${latest ? `<a class="button secondary" href="/api/edition-revisions/${esc(latest.id)}/export" download>Download text</a>` : ''}</div>`;
  const approval = latest?.approval ? `<div class="handoff-rule"><strong>${latest.approval.current ? 'Approved' : 'Approval out of date'} · by ${esc(latest.approval.approvedBy)} · ${esc(date(latest.approval.at))}</strong><p>${esc(latest.approval.notes || 'No notes.')}</p>${latest.approval.current ? '' : `<p class="inline-warning">${esc(latest.approval.staleReason)}</p>`}</div>` : '';
  return `<section class="production-card"><div class="production-card-head"><div><span class="micro-label">${esc(edition.locale)}${latest ? ` · r${latest.revision} · ${esc(latest.actor === 'claude' ? 'Claude adaptation' : `edited by ${latest.createdBy}`)}` : ''}</span><h2>${esc(edition.language)}</h2></div>${status}</div>${jobLine}${changed}${actions}${approval}${latest ? editionView(latest) : ''}</section>`;
}

function editionView(rev) {
  const p = rev.payload, src = rev.source, byN = new Map(p.sentences.map(entry => [entry.n, entry.text])), byId = new Map(p.visible.map(entry => [entry.id, entry.text]));
  const flagged = new Map(), general = [];
  for (const issue of rev.checks.issues) { const key = issue.n ? `n${issue.n}` : issue.id || null; if (key) flagged.set(key, [...(flagged.get(key) || []), issue]); else general.push(issue); }
  const note = issues => (issues || []).map(issue => `<p class="${issue.severity === 'critical' ? 'inline-warning' : 'hint'}">${esc(issue.message)}</p>`).join('');
  const sentences = src.sentences.map(entry => `<tr><td>${entry.n}</td><td>${esc(entry.text)}</td><td>${esc(byN.get(entry.n) || '—')}${note(flagged.get(`n${entry.n}`))}</td></tr>`).join('');
  const visible = src.visible.map(entry => `<tr><td>${esc(entry.where)}</td><td>${esc(entry.source)}</td><td>${esc(byId.get(entry.id) || '—')}${note(flagged.get(entry.id))}</td></tr>`).join('');
  const pkg = p.package ? `<dl class="style-facts"><div><dt>Title</dt><dd>${esc(p.package.title)}</dd></div>${p.package.thumbnail ? `<div><dt>Thumbnail words</dt><dd>${esc(p.package.thumbnail.text)}${p.package.thumbnail.accent ? ` (accent: ${esc(p.package.thumbnail.accent)})` : ''}</dd></div>` : ''}<div><dt>Tags</dt><dd>${esc(p.package.tags.join(', ') || '—')}</dd></div><div><dt>Description</dt><dd>${esc(p.package.description)}</dd></div></dl>` : '';
  const counts = rev.checks.issues.reduce((sum, issue) => ({...sum, [issue.severity]: (sum[issue.severity] || 0) + 1}), {});
  return `${general.length ? note(general) : ''}<p class="hint">${rev.checks.passed ? 'No critical findings.' : `${counts.critical} critical finding${counts.critical === 1 ? '' : 's'} to fix before approval.`}${counts.suggestion ? ` ${counts.suggestion} suggestion${counts.suggestion === 1 ? '' : 's'} to read.` : ''}${p.notes ? ` Notes: ${esc(p.notes)}` : ''}</p>
    <details class="scene-history" ${rev.checks.passed ? '' : 'open'}><summary>Narration · ${src.sentences.length} sentences</summary><table class="data-table edition-table"><thead><tr><th>#</th><th>Original</th><th>${esc(rev.language)}</th></tr></thead><tbody>${sentences}</tbody></table></details>
    ${src.visible.length ? `<details class="scene-history"><summary>On-screen words · ${src.visible.length}</summary><table class="data-table"><thead><tr><th>Where</th><th>Original</th><th>${esc(rev.language)}</th></tr></thead><tbody>${visible}</tbody></table></details>` : ''}
    ${pkg ? `<details class="scene-history"><summary>Package</summary>${pkg}</details>` : ''}`;
}

function editionEditBody(rev, item, edition) {
  // After the main video changed, only lines whose original is unchanged keep their earlier wording.
  const src = rev && !edition.sourceChanged ? rev.source : item.source.full, p = rev?.payload || {sentences: [], visible: [], package: null}, old = rev?.source;
  const byN = new Map(p.sentences.filter(entry => old?.sentences.find(line => line.n === entry.n)?.text === src.sentences.find(line => line.n === entry.n)?.text).map(entry => [entry.n, entry.text]));
  const byId = new Map(p.visible.filter(entry => old?.visible.find(line => line.id === entry.id)?.source === src.visible.find(line => line.id === entry.id)?.source).map(entry => [entry.id, entry.text]));
  return `<p class="hint">Write what a native presenter of ${esc(edition.language)} would say. Keep every number, name and fact; keep each sentence about as long to say as the original.</p><div class="form-grid">${renderNameField()}<label class="full">Note<input name="note" maxlength="300" placeholder="What you changed"></label></div>
    <h4>Narration</h4>${src.sentences.map(entry => `<label class="full">${entry.n}. ${esc(entry.text)}<textarea name="s${entry.n}" rows="2" maxlength="600">${esc(byN.get(entry.n) || '')}</textarea></label>`).join('')}
    ${src.visible.length ? `<h4>On-screen words</h4>${src.visible.map((entry, k) => `<label class="full">${esc(entry.where)}: ${esc(entry.source)}<input name="v${k}" maxlength="${entry.limit}" value="${esc(byId.get(entry.id) || '')}"></label>`).join('')}` : ''}
    ${src.package ? `<h4>Package</h4><label class="full">Title<input name="title" maxlength="100" value="${esc(p.package?.title || '')}"></label><label class="full">Description<textarea name="description" rows="4" maxlength="5000">${esc(p.package?.description || '')}</textarea></label><label class="full">Tags (comma separated)<input name="tags" value="${esc((p.package?.tags || []).join(', '))}"></label>${src.package.thumbnail ? `<label class="full">Thumbnail words (original: ${esc(src.package.thumbnail.text)})<input name="thumbText" maxlength="40" value="${esc(p.package?.thumbnail?.text || '')}"></label><label class="full">Accent word<input name="thumbAccent" maxlength="40" value="${esc(p.package?.thumbnail?.accent || '')}"></label>` : ''}` : ''}`;
}

function editionFormPayload(form, src) {
  const value = name => form.elements[name]?.value?.trim() ?? '';
  return {sentences: src.sentences.map(entry => ({n: entry.n, text: value(`s${entry.n}`)})).filter(entry => entry.text), visible: src.visible.map((entry, k) => ({id: entry.id, text: value(`v${k}`)})).filter(entry => entry.text),
    ...(src.package ? {package: {title: value('title'), description: value('description'), tags: value('tags').split(',').map(tag => tag.trim()).filter(Boolean), thumbnail: src.package.thumbnail ? {text: value('thumbText'), accent: value('thumbAccent')} : null}} : {})};
}

function editionAction(command, id) {
  if (command === 'edition-draft') {
    const {item, edition, contentId, locale} = edEdition(id), connection = readyClaudeConnection();
    if (!connection) return toast('Set up and test a Claude connection first.', true);
    const again = edition.latest && !edition.sourceChanged;
    return renderDialog('edition-draft', `Adapt into ${edition.language}`, 'CLAUDE · USES TOKENS OR YOUR PLAN ALLOWANCE', `<p class="hint">Claude adapts the narration (${item.source.sentences} sentences), the on-screen words and the package of "${esc(item.title)}" for ${esc(edition.language)} viewers. ${edition.sourceChanged ? 'Only what changed in the main video is asked; approved wording of unchanged sentences is kept. ' : again ? 'Everything is adapted again from the start. ' : ''}Tokens are reserved first; nothing is retried by itself. The result becomes a new revision for you to check.</p><div class="form-grid">${renderNameField()}</div><p class="hint">Connection: ${esc(connection.name)}</p>`, 'Ask Claude', {contentId, locale, connector: {id: connection.id, revision: connection.revision}});
  }
  if (command === 'edition-retry') return renderDialog('edition-retry', 'Retry the adaptation', 'CLAUDE · DELIBERATE RETRY', `<p class="hint">Finished parts are kept and not paid for again.</p><div class="form-grid">${renderNameField()}</div><label class="checkbox-label"><input type="checkbox" name="confirmInterrupted">I understand an interrupted attempt may already have used tokens.</label>`, 'Retry', {jobId: id});
  if (command === 'edition-edit') {
    const {item, edition, contentId, locale} = edEdition(id);
    return renderDialog('edition-save', edition.latest ? `Edit ${edition.language} r${edition.latest.revision}` : `Write the ${edition.language} edition`, 'OWNER EDIT · NEW REVISION', editionEditBody(edition.latest, item, edition), 'Save edition', {contentId, locale, expectedRevision: edition.latest?.revision || 0});
  }
  if (command === 'edition-approve') return renderDialog('edition-approve', 'Approve this language edition', 'HUMAN APPROVAL · YOUR NAME IS RECORDED', `<p class="hint">The approval goes out of date by itself when the main video's words change. Nothing is narrated or published yet.</p><div class="form-grid">${renderNameField()}<label class="full">Notes<input name="notes" maxlength="2000"></label></div>
    <label class="checkbox-label"><input type="checkbox" name="meaningReviewed">A speaker of this language read the whole narration, and it says what the main video says.</label>
    <label class="checkbox-label"><input type="checkbox" name="factsChecked">Names, numbers, dates and units are right for this market.</label>
    <label class="checkbox-label"><input type="checkbox" name="visibleChecked">Every on-screen word reads naturally and fits.</label>
    <label class="checkbox-label"><input type="checkbox" name="packageHonest">The title and thumbnail words promise only what the video shows.</label>`, 'Approve', {revisionId: id});
  return toast('Unknown action.', true);
}
