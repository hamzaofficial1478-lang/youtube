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
  return `<section class="production-card"><div class="production-card-head"><div><span class="micro-label">${esc(edition.locale)}${latest ? ` · r${latest.revision} · ${esc(latest.actor === 'claude' ? 'Claude adaptation' : `edited by ${latest.createdBy}`)}` : ''}</span><h2>${esc(edition.language)}</h2></div>${status}</div>${jobLine}${changed}${actions}${approval}${latest ? editionView(latest) : ''}${narrationSection(item, edition)}${editionVideoSection(item, edition)}</section>`;
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
  if (['edition-voice', 'edition-narrate', 'edition-narration-retry', 'edition-narration-approve'].includes(command)) return editionNarrationAction(command, id);
  if (['edition-render', 'edition-release'].includes(command)) return editionVideoAction(command, id);
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

// L02: the language's narrator reads the approved words; the approved edit's scenes are measured in that voice.
const NR_STATUS = {queued: 'Waiting to start', running: 'Being narrated', completed: 'Narrated', failed: 'Failed', interrupted: 'Interrupted', validation_failed: 'Failed the audio checks', blocked_budget: 'Over the monthly voice limit', stale: 'Out of date'};
const NR_SCENE = {same: ['Same length', 'green'], retime: ['Retimed', 'gray'], long: ['Much longer', 'orange'], short: ['Much shorter', 'orange']};
function narrationSection(item, edition) {
  const key = `${item.contentId}|${edition.locale}`, approved = edition.latest?.approval?.current, voice = edition.voice, job = edition.narrations[0];
  const head = '<span class="micro-label">NARRATION</span>';
  if (!approved) return `<div class="handoff-rule">${head}<p>Approve this language's words first; then its narrator reads them and the scenes are timed to that voice.</p></div>`;
  if (!item.primaryVoice) return `<div class="handoff-rule">${head}<p>Set up the main narrator in the Voice Room first: this language's narrator uses its connection and rights.</p><div class="card-actions"><button class="secondary" data-production-room="voice">Open the Voice Room</button></div></div>`;
  const busy = job && ['queued', 'running'].includes(job.status), chars = edition.scriptCharacters;
  const voiceLine = voice ? `<p>Narrator: <b>${esc(voice.voiceId)}</b> · ${esc(voice.model)}${voice.current ? '' : ' · <span class="inline-warning">its connection changed or is not tested</span>'}</p>` : '<p>No narrator chosen for this language yet.</p>';
  const actions = `<div class="card-actions">${action(voice ? 'Change narrator' : 'Choose the narrator', 'edition-voice', key, voice ? 'secondary' : 'primary')}${voice?.current && item.hasEdit && !busy ? action(job ? 'Narrate again' : `Narrate (${chars.toLocaleString('en-US')} characters)`, 'edition-narrate', key, job ? 'secondary' : 'primary') : ''}</div>`;
  const warn = item.hasEdit ? '' : '<p class="inline-warning">The approved master was not made from an edit, so its scenes cannot be retimed.</p>';
  const standing = edition.narrations.find(entry => entry.approval?.current);
  const older = standing && standing.id !== job?.id ? `<p class="hint"><b>Approved narration:</b> attempt ${standing.attempts}, by ${esc(standing.approval.approvedBy)} · ${esc(date(standing.approval.at))}. The newest attempt below is not approved.</p>` : '';
  return `<div class="handoff-rule">${head}${voiceLine}${warn}${actions}${older}${job ? narrationView(job) : ''}</div>`;
}
function narrationView(job) {
  const line = `<p class="${['failed', 'interrupted', 'validation_failed', 'blocked_budget', 'stale'].includes(job.status) ? 'inline-warning' : 'hint'}"><b>${esc(NR_STATUS[job.status] || job.status)}</b> · attempt ${job.attempts} of 3 · ${job.characters.toLocaleString('en-US')} characters${job.error ? `: ${esc(job.error)}` : ''}</p>`;
  const retry = ['failed', 'interrupted', 'validation_failed', 'blocked_budget'].includes(job.status) && job.attempts < 3 && job.current ? action('Retry', 'edition-narration-retry', job.id, 'secondary') : '';
  if (!job.analysis) return line + retry;
  const a = job.analysis, sync = job.sync, approval = job.approval;
  const checks = `<div class="qc-checks">${a.checks.map(check => `<span class="${check.passed ? 'pass' : 'fail'}" title="${esc(check.detail)}">${check.passed ? '✓' : '!'} ${esc(check.name.replace('_', ' '))}</span>`).join('')}</div>`;
  const facts = `<p class="hint">${a.durationSeconds.toFixed(1)} s${a.pace ? ` · ${a.pace.wpm} words a minute` : ''} · word times ${a.timing === 'measured' ? 'measured by the voice service' : 'estimated'}</p>`;
  const scenes = sync ? `<details class="scene-history" ${sync.counts.outside ? 'open' : ''}><summary>Scene timing · ${sync.counts.same} same, ${sync.counts.retime} retimed, ${sync.counts.outside} outside the natural range · scene changes within ${sync.maxDrift.toFixed(2)} s of their words</summary>
    <table class="data-table sync-table"><thead><tr><th>Scene</th><th>Original</th><th>This language</th><th>Change</th></tr></thead><tbody>${sync.scenes.map(scene => { const [label, tone] = NR_SCENE[scene.status]; return `<tr><td>${esc(scene.label)}</td><td>${(scene.primary.end - scene.primary.start).toFixed(1)} s</td><td>${(scene.edition.end - scene.edition.start).toFixed(1)} s</td><td>${badge(label, tone)}</td></tr>`; }).join('')}</tbody></table>
    ${sync.issues.map(issue => `<p class="${issue.severity === 'critical' ? 'inline-warning' : 'hint'}">${esc(issue.message)}</p>`).join('')}<p class="hint">The picture follows the voice: each scene is retimed to its new length (the voice is never sped up). Whole video: ${sync.primarySeconds.toFixed(1)} s in the original, ${sync.seconds.toFixed(1)} s in this language.</p></details>` : '';
  const decision = approval ? `<p><b>${approval.current ? 'Approved' : 'Approval out of date'}</b> · by ${esc(approval.approvedBy)} · ${esc(date(approval.at))}${approval.current ? '' : ` · <span class="inline-warning">${esc(approval.staleReason)}</span>`}</p>`
    : job.status === 'completed' && job.current && sync?.passed ? `<div class="card-actions">${action('Approve this narration', 'edition-narration-approve', job.id, 'primary')}</div>` : '';
  return `${line}<audio controls preload="metadata" src="${esc(job.audioUrl)}"></audio>${facts}${checks}${scenes}${decision}`;
}
function editionNarrationAction(command, id) {
  if (command === 'edition-voice') {
    const {item, edition, locale} = edEdition(id), voice = edition.voice, primary = item.primaryVoice;
    return renderDialog('edition-voice', `${edition.language} narrator`, 'VOICE · RECORDED BY NAME', `<p class="hint">The narrator uses the main narrator's connection, rights and delivery (${esc(primary.provider)}). ElevenLabs' multilingual models (for example eleven_multilingual_v2 or eleven_v3) speak ${esc(edition.language)} with the same voice; you can also give a voice ID from your ElevenLabs voice library that is made for this language.</p>
      <div class="form-grid">${renderNameField()}<label>Voice ID<input name="voiceId" maxlength="128" value="${esc(voice?.voiceId || primary.voiceId)}"></label><label>Model<input name="model" maxlength="128" value="${esc(voice?.model || primary.model)}"></label></div>
      <label class="checkbox-label"><input type="checkbox" name="languageConfirmed">This voice may narrate in ${esc(edition.language)} for commercial use (provider terms or the voice owner's licence).</label>`, 'Save narrator', {familyId: item.familyId, locale, expectedRevision: voice?.revision || 0});
  }
  if (command === 'edition-narrate') {
    const {item, edition, contentId, locale} = edEdition(id), chars = edition.scriptCharacters, price = item.primaryVoice.priceCentsPerMillionCharacters;
    return renderDialog('edition-narrate', `Narrate the ${edition.language} edition`, 'VOICE SERVICE · PAID', `<p class="hint">${esc(edition.voice.voiceId)} reads the approved ${esc(edition.language)} words (${chars.toLocaleString('en-US')} characters${price ? `, about $${(chars * price / 1e8).toFixed(2)} at your recorded price` : ''}). The characters count against the family's monthly voice limit. Nothing is retried by itself; at most 3 paid narrations for these words and this voice. Then every scene of the approved edit is measured in this voice.</p><div class="form-grid">${renderNameField()}</div>`, 'Narrate', {contentId, locale});
  }
  if (command === 'edition-narration-retry') return renderDialog('edition-narration-retry', 'Retry the narration', 'VOICE SERVICE · DELIBERATE RETRY', `<div class="form-grid">${renderNameField()}</div><label class="checkbox-label"><input type="checkbox" name="confirmInterrupted">I understand a stopped attempt may already have been charged.</label>`, 'Retry', {id});
  if (command === 'edition-narration-approve') {
    const job = (state.localization?.contents || []).flatMap(item => item.editions.flatMap(edition => edition.narrations)).find(entry => entry.id === id), outside = job?.sync?.counts.outside || 0;
    return renderDialog('edition-narration-approve', 'Approve this narration', 'HUMAN APPROVAL · YOUR NAME IS RECORDED', `<p class="hint">The approval goes out of date by itself when the words, the narrator or the approved master change.</p><div class="form-grid">${renderNameField()}<label class="full">Notes<input name="notes" maxlength="2000"></label></div>
      <label class="checkbox-label"><input type="checkbox" name="listened">A speaker of this language listened to the whole narration.</label>
      <label class="checkbox-label"><input type="checkbox" name="pronunciation">Names, numbers and places are pronounced right.</label>
      <label class="checkbox-label"><input type="checkbox" name="syncReviewed">I read the scene timing list.</label>
      ${outside ? `<label class="checkbox-label"><input type="checkbox" name="syncAccepted">I accept the ${outside === 1 ? 'scene that changes' : `${outside} scenes that change`} length beyond the natural range.</label>` : ''}`, 'Approve', {id});
  }
  return toast('Unknown action.', true);
}

// L03: the language's own video, rendered from the approved master's recipe on its voice, and its release decision.
const ER_STATUS = {queued: 'Waiting for the render worker', running: 'Rendering', completed: 'Rendered', failed: 'Failed', interrupted: 'Interrupted', cancelled: 'Cancelled', stale: 'Out of date'};
const ER_BLOCKING = ['full decode', 'audio/video alignment', 'duration', 'frame', 'narration audio', 'delivery format'];
function editionVideoSection(item, edition) {
  const head = '<span class="micro-label">VIDEO</span>', key = `${item.contentId}|${edition.locale}`, job = edition.renders[0];
  if (!edition.narrations.some(entry => entry.approval?.current)) return `<div class="handoff-rule">${head}<p>Approve this language's narration first; then its video is rendered from the approved master on that voice.</p></div>`;
  const busy = job && ['queued', 'running'].includes(job.status), standing = edition.renders.find(entry => entry.release?.current);
  const older = standing && standing.id !== job?.id ? `<p class="hint"><b>Released:</b> the render of ${esc(date(standing.createdAt))}, approved by ${esc(standing.release.approvedBy)}. The newest render below is not approved.</p>` : '';
  const actions = busy ? action('Cancel', 'render-cancel', job.id, 'text-button danger') : action(job ? 'Render again' : `Render the ${esc(edition.language)} video`, 'edition-render', key, job ? 'secondary' : 'primary');
  return `<div class="handoff-rule">${head}${older}<div class="card-actions">${actions}</div>${job ? editionRenderView(job, edition) : ''}</div>`;
}
function editionRenderView(job, edition) {
  const progress = job.progress, line = `<p class="${['failed', 'interrupted', 'cancelled', 'stale'].includes(job.status) ? 'inline-warning' : 'hint'}"><b>${esc(ER_STATUS[job.status] || job.status)}</b>${job.status === 'running' && progress?.stage ? ` · ${esc(progress.stage)}` : ''} · attempt ${job.attempts}/3${job.error ? `: ${esc(job.error)}` : ''}</p>`;
  const retry = ['failed', 'interrupted', 'cancelled', 'stale'].includes(job.status) && job.attempts < 3 && job.standing ? action('Retry from the finished parts', 'render-retry', job.id, 'secondary') : '';
  if (!job.result) return line + retry;
  const r = job.result, failed = r.qc.filter(check => !check.passed), blocking = failed.filter(check => ER_BLOCKING.includes(check.name));
  const checks = `<div class="qc-checks">${r.qc.map(check => `<span class="${check.passed ? 'pass' : 'fail'}" title="${esc(check.detail)}">${check.passed ? '✓' : '!'} ${esc(check.name)}</span>`).join('')}</div>${failed.map(check => `<p class="inline-warning"><b>${esc(check.name)}:</b> ${esc(check.detail)}</p>`).join('')}`;
  const size = r.video.sizeBytes >= 1e9 ? `${(r.video.sizeBytes / 1e9).toFixed(2)} GB` : `${(r.video.sizeBytes / 1e6).toFixed(1)} MB`;
  const pkg = job.package ? `<dl class="style-facts"><div><dt>Title</dt><dd>${esc(job.package.title)}</dd></div><div><dt>Tags</dt><dd>${esc((job.package.tags || []).join(', ') || '—')}</dd></div></dl>` : '';
  const release = job.release
    ? `<p><b>${job.release.current ? 'Released' : 'Release out of date'}</b> · by ${esc(job.release.approvedBy)} · ${esc(date(job.release.at))}${job.release.current ? '' : ` · <span class="inline-warning">${esc(job.release.staleReason)}</span>`}</p>`
    : !job.standing ? '<p class="inline-warning">The words, the narration or the master changed after this render. Render the edition again.</p>'
    : blocking.length ? `<p class="inline-warning">This edition cannot be approved: ${esc(blocking[0].name)} - ${esc(blocking[0].detail)}</p>`
    : `<div class="card-actions">${action('Approve for release', 'edition-release', job.id, 'primary')}</div>`;
  return `${line}<div class="render-player"><video controls preload="metadata" src="${esc(r.videoUrl)}"></video><div class="render-facts"><p class="hint">${r.preset.width}×${r.preset.height} · ${r.preset.fps} fps · ${esc(size)} · ${esc(renderClock(r.renderSeconds || 0))} to render · scenes timed ${job.sync?.method === 'measured' ? 'on the measured words' : 'by estimate'}</p>${checks}
    ${job.thumbnailUrl ? `<img class="pkg-full" alt="${esc(edition.language)} thumbnail" src="${esc(job.thumbnailUrl)}">` : '<p class="hint">No thumbnail words in this edition, so no thumbnail was drawn.</p>'}${pkg}
    <p class="hint"><a href="${esc(r.videoUrl)}" download>Download the video</a>${job.thumbnailUrl ? ` · <a href="${esc(job.thumbnailUrl)}" download>thumbnail</a>` : ''}${edition.latest ? ` · <a href="/api/edition-revisions/${esc(edition.latest.id)}/export" download>title, description and tags</a>` : ''} · <a href="${esc(r.manifestUrl)}" target="_blank" rel="noopener">render manifest ↗</a></p></div></div>${release}`;
}
function editionVideoAction(command, id) {
  if (command === 'edition-render') {
    const {item, edition, contentId, locale} = edEdition(id);
    return renderDialog('edition-render', `Render the ${edition.language} video`, 'LOCAL RENDER · NO COST · FULL QUALITY', `<p class="hint">Renders "${esc(item.title)}" for ${esc(edition.language)} viewers from the approved master's own recipe (the same edit, visuals, music, style and FFmpeg build), with this language's approved narration, its words on screen, captions on its voice and every scene retimed to that voice. The thumbnail is drawn again with this language's words. Then the video is checked for YouTube's upload format.</p>${renderNameField()}`, 'Render', {contentId, locale});
  }
  if (command === 'edition-release') {
    const job = (state.localization?.contents || []).flatMap(entry => entry.editions.flatMap(edition => edition.renders)).find(entry => entry.id === id), failed = job?.result?.qc.filter(check => !check.passed) || [];
    return renderDialog('edition-release', 'Approve this edition for release', 'HUMAN DECISION · YOUR NAME IS RECORDED', `<p class="hint">This is the video, title, description and thumbnail for this language. The approval goes out of date by itself when the words, the narration or the master change. Nothing is published.</p><div class="form-grid">${renderNameField()}<label class="full">Notes<input name="notes" maxlength="2000"></label></div>
      <label class="checkbox-label"><input type="checkbox" name="watched">A speaker of this language watched the opening, a middle part and the ending at full quality.</label>
      <label class="checkbox-label"><input type="checkbox" name="listened">I listened to the sound of this edition.</label>
      <label class="checkbox-label"><input type="checkbox" name="packageMatches">The title, description and thumbnail words fit this edition.</label>
      ${failed.length ? `<label class="checkbox-label"><input type="checkbox" name="qcAccepted">I accept the ${failed.length} remaining check finding${failed.length === 1 ? '' : 's'} listed for this edition.</label>` : ''}`, 'Approve', {id});
  }
  return toast('Unknown action.', true);
}
