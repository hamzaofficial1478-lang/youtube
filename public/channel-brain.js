'use strict';
// 0.110 - The channel brain on the channel page (owner request 2026-11-18): the niche brief, the owner's files and
// reference pictures with how each is used, the creative director (ask anything, with Claude, ChatGPT or both), the
// memory, the playbook that leads the channel's jobs once approved, and matching the style of a video link.
// Loaded before app.js; helpers from app.js (state, esc, badge, action, api, refresh, toast, date, render) and
// render-room.js (renderPerson) are used only inside functions.

const BRAIN_ROLE_NAMES = {character: 'Character', place: 'Place', style: 'Look to follow', object: 'Object', other: 'Other'};
const BRAIN_FIELDS = [
  ['about', 'What the niche is about', 'For example: real survival situations told minute by minute: a raft at sea, a winter in Alaska, a flooded ship. One survivor, the clock running.', 6],
  ['promise', 'What every video gives the viewer', 'The feeling and the payoff: "you live the days with them and learn what really keeps a person alive".', 3],
  ['difference', 'How this channel is different from its competitors', 'Competitors use stick figures and zombie attacks; we use one realistic recurring survivor, real places and real survival science.', 4],
  ['ideas', 'Your ideas for the channel', 'Series, situations, structures, anything you already have in mind.', 6],
  ['titles', 'Example titles (one a line)', 'Six Survivors. One Damaged Raft. No Land in Sight.', 4],
  ['avoid', 'Never do', 'Zombies, gore, stick figures, fake facts.', 3],
];
const brainOf = familyId => (state.channelBrain?.families || []).find(item => item.familyId === familyId) || null;
const brainTeam = () => ({claude: !!state.ai?.team?.claude, chatgpt: !!state.ai?.team?.chatgpt});
const brainGemini = () => (state.connectors || []).find(item => item.provider === 'gemini' && item.test?.status === 'passed' && !item.busy) || null;
const brainName = () => (typeof renderPerson === 'function' && renderPerson()) || 'Owner';
const brainLive = familyId => (state.live || []).filter(item => item.room === 'channel' && item.familyId === familyId);

// The step on the channel page's road.
function brainStep(family) {
  const brain = brainOf(family.id), brief = brain?.brief;
  const parts = [brief ? 'niche brief written' : null, brain?.files.length ? `${brain.files.length} file(s)` : null, brain?.images.length ? `${brain.images.length} reference picture(s)` : null, brain?.playbooks.some(item => item.status === 'approved') ? 'playbook approved' : null].filter(Boolean);
  return ['Channel brain', parts.length ? parts.join(' · ') : 'Tell the program what the niche is, how you want to be different, your ideas and files, and attach reference pictures (like your main character).', !!brief, 'brain'];
}

function brainAiButtons(command, id, labelOf) {
  const team = brainTeam(), out = [];
  if (team.claude) out.push(action(labelOf('Claude'), command, `${id}|claude`, 'secondary'));
  if (team.chatgpt) out.push(action(labelOf('ChatGPT'), command, `${id}|chatgpt`, 'secondary'));
  return out.length ? out.join('') : '<span class="hint">Connect and test Claude or ChatGPT in Connections first.</span>';
}

function brainBriefView(family, brain) {
  const brief = brain?.brief;
  if (!brief) return `<p class="hint">Nothing written yet. The writers, the storyboard, the painter and the editor all read this, so a few honest lines here change every video.</p>${action('Write the niche brief', 'brain-brief', family.id, 'primary')}`;
  const rows = BRAIN_FIELDS.filter(([key]) => (Array.isArray(brief[key]) ? brief[key].length : brief[key])).map(([key, label]) => `<div><dt>${esc(label)}</dt><dd>${esc(Array.isArray(brief[key]) ? brief[key].join(' · ') : brief[key])}</dd></div>`).join('');
  return `<dl class="style-facts brain-facts">${rows}</dl><p class="hint">r${brief.revision} · ${esc(brief.updatedBy)} · ${esc(date(brief.updatedAt))}</p>${action('Edit the niche brief', 'brain-brief', family.id, 'secondary')}`;
}

function brainFilesView(family, brain) {
  const rows = (brain?.files || []).map(file => `<div class="brain-row"><div><strong>${esc(file.name)}</strong> <span class="muted">${file.kind.toUpperCase()} · ${file.words.toLocaleString('en-US')} words</span><p class="hint">${esc(file.opening)}…</p></div>${action('Remove', 'brain-file-remove', file.id, 'text-button')}</div>`).join('');
  return `${rows || '<p class="hint">No files yet. Attach notes, research, a niche plan or scripts you like: the program reads the words (PDF, Word .docx or text), never runs anything in them.</p>'}<label class="button secondary file-button">Attach a PDF, Word or text file<input type="file" class="brain-file-input" data-family="${esc(family.id)}" accept=".pdf,.docx,.txt,.md,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden></label>`;
}

function brainImagesView(family, brain) {
  const cards = (brain?.images || []).map(image => `<article class="brain-image"><img src="/api/brain-images/${esc(image.id)}" alt="${esc(image.label)}" loading="lazy"><div><strong>${esc(image.label)}</strong> ${badge(BRAIN_ROLE_NAMES[image.role] || image.role, image.role === 'character' ? 'green' : 'gray')}<p><span class="micro-label">USE</span> ${esc(image.usage)}</p>${image.description ? `<details><summary>What the program sees${image.describedBy ? ` (${esc(image.describedBy)})` : ''}</summary><p>${esc(image.description)}</p></details>` : `<p class="hint">Not described yet: the writers and planners read the description; the painter gets the picture itself.</p>${brainAiButtons('brain-image-describe', image.id, who => `Describe with ${who}`)}`}<p class="row-end">${action('Edit', 'brain-image-edit', image.id, 'text-button')}${action('Remove', 'brain-image-remove', image.id, 'text-button')}</p></div></article>`).join('');
  return `<p class="hint">A character picture (a turnaround or a sheet of expressions is best) is attached to every painting of that character, so the same person appears in every scene. Places, objects and a look to follow guide the planners and painters too.</p><div class="brain-images">${cards}</div>${action('+ Add a reference picture', 'brain-image-add', family.id, 'secondary')}`;
}

function brainAnswer(ask) {
  if (ask.status === 'failed') return `<div class="inline-warning">${esc(ask.provider === 'chatgpt' ? 'ChatGPT' : 'Claude')} could not answer: ${esc(ask.error || '')}</div>`;
  if (!ask.answer) return '';
  const a = ask.answer;
  return `<div class="brain-answer"><p><strong>${esc(ask.provider === 'chatgpt' ? 'ChatGPT' : 'Claude')}:</strong> ${esc(a.summary)}</p><ol>${a.points.map(point => `<li><strong>${esc(point.point)}</strong>${point.why ? `<br><span class="muted">Why:</span> ${esc(point.why)}` : ''}${point.how ? `<br><span class="muted">How:</span> ${esc(point.how)}` : ''}</li>`).join('')}</ol>${a.titles.length ? `<p><span class="micro-label">TITLES</span></p><ul>${a.titles.map(title => `<li>${esc(title)}</li>`).join('')}</ul>` : ''}${a.keep ? `<p class="row-end"><span class="hint">To remember: ${esc(a.keep)}</span>${action(ask.kept ? 'Forget it' : 'Keep in memory', ask.kept ? 'brain-forget' : 'brain-keep', ask.id, ask.kept ? 'text-button' : 'secondary')}</p>` : ''}</div>`;
}

function brainDirectorView(family, brain) {
  const team = brainTeam(), asks = brain?.asks || [], memory = asks.filter(ask => ask.kept && ask.answer?.keep);
  // Answers of one question (both AIs) sit together, newest question first.
  const groups = [];
  for (const ask of asks) { const last = groups.at(-1); if (last && last.question === ask.question && Math.abs(new Date(last.items[0].createdAt) - new Date(ask.createdAt)) < 3600000) last.items.push(ask); else groups.push({question: ask.question, items: [ask]}); }
  const buttons = [team.claude ? action('Ask Claude', 'brain-ask', `${family.id}|claude`, 'primary') : '', team.chatgpt ? action('Ask ChatGPT', 'brain-ask', `${family.id}|chatgpt`, 'secondary') : '', team.claude && team.chatgpt ? action('Ask both (ChatGPT challenges Claude)', 'brain-ask', `${family.id}|both`, 'secondary') : ''].join('');
  return `<p class="hint">Ask anything about this channel, any time: new ideas, how to be different from the competitors, which survival situations to cover next, a title, a scene, a sound. It reads your brief, files, pictures, memory and everything the program learned from the competitors' videos.</p>
    <label class="full">Your question<textarea id="brain-question-${esc(family.id)}" rows="3" maxlength="4000" placeholder="Every competitor uses stick figures and zombies. What can we do in each video that none of them does?"></textarea></label>
    <p class="card-actions">${buttons || '<span class="hint">Connect and test Claude or ChatGPT in Connections first.</span>'}</p>
    ${memory.length ? `<details open><summary><strong>Memory (${memory.length})</strong> <span class="muted">every job of this channel reads these</span></summary><ul>${memory.map(ask => `<li>${esc(ask.answer.keep)} ${action('Forget', 'brain-forget', ask.id, 'text-button')}</li>`).join('')}</ul></details>` : ''}
    ${groups.map((group, k) => `<details ${k ? '' : 'open'}><summary><strong>${esc(group.question.slice(0, 140))}</strong> <span class="muted">${esc(date(group.items[0].createdAt))}</span></summary>${[...group.items].reverse().map(brainAnswer).join('')}</details>`).join('')}`;
}

function brainPlaybookView(family, brain) {
  const list = brain?.playbooks || [], latest = list[0], approved = list.find(item => item.status === 'approved');
  const show = item => {
    const p = item.payload, block = (title, items) => (items?.length ? `<p><span class="micro-label">${title}</span></p><ul>${items.map(value => `<li>${esc(value)}</li>`).join('')}</ul>` : '');
    return `<p>${esc(p.summary)}</p>${block('WHAT THE COMPETITORS ALL DO', p.competitorsDo)}${block('WHAT NOBODY SERVES', p.whiteSpace)}${Object.keys(p.signature || {}).length ? `<p><span class="micro-label">OUR SIGNATURE</span></p><dl class="style-facts">${Object.entries(p.signature).map(([key, value]) => `<div><dt>${esc(key)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>` : ''}${Object.entries(p.rules || {}).map(([key, rules]) => block(`RULES · ${key.toUpperCase()}`, rules)).join('')}${block('NEVER', p.avoid)}${block('EXPERIMENTS', (p.experiments || []).map(item => `${item.idea} (test: ${item.test})`))}${block('SERIES IDEAS', (p.series || []).map(item => `${item.title}: ${item.premise}`))}`;
  };
  const head = approved ? `<p>${badge(`Approved r${approved.revision}`, 'green')} <span class="hint">It leads this channel's script, storyboard, editing, sound and packaging jobs as pinned skills, by ${esc(approved.review?.reviewer || '')}.</span></p>` : '<p class="hint">The creative director studies your brief, ideas, pictures and what the program learned from the competitors, then writes how this channel stands out: what everyone does, what nobody serves, your signature, and rules for every job. Approved by your name, it leads every job of this channel.</p>';
  const ready = latest?.status === 'ready' ? `<div class="brain-answer"><p>${badge(`Playbook r${latest.revision} waits for your review`, 'orange')}</p>${show(latest)}<p class="card-actions">${action('Review and approve', 'brain-playbook-review', latest.id, 'primary')}</p></div>` : '';
  return `${head}${ready}${approved ? `<details><summary>Read the approved playbook r${approved.revision}</summary>${show(approved)}</details>` : ''}<p class="card-actions">${brainAiButtons('brain-playbook', family.id, who => `${approved ? 'Write a new playbook' : 'Write the playbook'} with ${who}`)}</p>`;
}

function brainMatchView(family, brain) {
  const gemini = brainGemini(), matches = brain?.matches || [];
  const row = match => {
    if (match.status !== 'done') return `<div class="inline-warning">${esc(match.url)}: ${esc(match.error || match.status)}</div>`;
    const r = match.result;
    return `<div class="brain-answer"><p><strong>${esc(r.engineName)}</strong>${r.look ? ` · ${esc(r.look)}` : ''} · pictures ${esc(r.pictureType)} · scenes ${esc({all: 'all painted', mix: '60/40 mix', free: 'free'}[r.paint] || r.paint)} · ${Math.round(r.confidence * 100)}% sure <span class="muted">${esc(match.url)}</span></p><ul>${r.why.map(item => `<li>${esc(item)}</li>`).join('')}</ul>${r.aiVideo?.why ? `<p class="hint">AI video: ${r.aiVideo.fits ? 'would suit this style' : 'not needed'} (${esc(r.aiVideo.why)})</p>` : ''}${r.missing?.length ? `<p class="hint">Not in our engines yet: ${esc(r.missing.join('; '))}</p>` : ''}<p class="card-actions">${action(`Use the ${esc(r.engineName)} engine for this channel`, 'brain-use-match', match.id, 'primary')}</p></div>`;
  };
  return `<p class="hint">Paste a YouTube video whose style you want to adopt. Gemini watches it from the link (nothing is downloaded) and the program picks the engine and look that make that style best; you then confirm it in the style window. Techniques only, never their characters or look.</p>
    <div class="form-grid"><label class="full">Video link<input id="brain-match-url-${esc(family.id)}" type="url" placeholder="https://www.youtube.com/watch?v=..."></label></div>
    <p class="card-actions">${gemini ? action('Match the style with Gemini', 'brain-match', family.id, 'secondary') : '<span class="hint">Connect Gemini (a free key from Google AI Studio) in Connections first.</span>'}</p>${matches.map(row).join('')}`;
}

function channelBrainPanel(family) {
  const brain = brainOf(family.id), live = brainLive(family.id);
  const learned = brain?.learned || {};
  const sources = [learned.roadmap ? 'the approved competitor roadmap' : null, learned.studies ? `${learned.studies} watched competitor video(s)` : null, learned.blueprint ? 'the competitor blueprint' : null].filter(Boolean);
  return `<section class="panel" id="channel-brain"><div class="panel-header"><h2>Channel brain</h2>${badge(brain?.brief ? 'Brief written' : 'Not written yet', brain?.brief ? 'green' : 'gray')}</div><div class="panel-body">
    <p class="hint">Everything here reaches the script writers, the storyboard, the painter and the editor of every video of ${esc(family.name)}. ${sources.length ? `The creative director also reads ${esc(sources.join(', '))}.` : 'Watch competitor videos on the Competitors page and the creative director reads those studies too.'}</p>
    ${live.map(item => (typeof liveBlock === 'function' ? liveBlock(item) : `<p class="hint">${esc(item.label)}…</p>`)).join('')}
    <details open data-keep-open><summary><strong>Niche brief</strong></summary>${brainBriefView(family, brain)}</details>
    <details ${brain?.files.length ? '' : 'open'}><summary><strong>Files (${brain?.files.length || 0})</strong></summary>${brainFilesView(family, brain)}</details>
    <details open><summary><strong>Reference pictures (${brain?.images.length || 0})</strong></summary>${brainImagesView(family, brain)}</details>
    <details open><summary><strong>Ask the creative director</strong></summary>${brainDirectorView(family, brain)}</details>
    <details><summary><strong>How this channel stands out (playbook)</strong></summary>${brainPlaybookView(family, brain)}</details>
    <details><summary><strong>Adopt the style of a video</strong></summary>${brainMatchView(family, brain)}</details>
  </div></section>`;
}

// A draft's own idea and idea files (Content Studio), with an attach button while it is a draft.
function ideaFold(content, archived) {
  const files = (state.channelBrain?.videoFiles || []).filter(file => file.contentId === content.id);
  if (!content.idea && !files.length && (archived || content.state !== 'draft')) return '';
  const key = `idea-${content.id}`;
  return `<details class="scenes" data-keep-open="${esc(key)}" ${typeof keepOpen !== 'undefined' && keepOpen.has(key) ? 'open' : ''}><summary>Your idea${files.length ? ` · ${files.length} file(s)` : ''}</summary>${content.idea ? `<p>${esc(content.idea)}</p>` : '<p class="hint">No idea written yet: Edit draft to add your idea and thoughts; the writers build the script on it.</p>'}${files.map(file => `<div class="brain-row"><div><strong>${esc(file.name)}</strong> <span class="muted">${file.words.toLocaleString('en-US')} words</span></div>${content.state === 'draft' && !archived ? action('Remove', 'brain-file-remove', file.id, 'text-button') : ''}</div>`).join('')}${content.state === 'draft' && !archived ? `<label class="button secondary file-button">Attach an idea file<input type="file" class="brain-file-input" data-family="${esc(content.familyId)}" data-content="${esc(content.id)}" accept=".pdf,.docx,.txt,.md,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden></label>` : ''}</details>`;
}

// ------------------------------------------------------------------ the window for the brief, pictures and reviews
function brainDialog(kind, title, body, submit, data) {
  const form = document.getElementById('brain-form');
  form.reset();
  form.dataset.kind = kind;
  form.dataset.payload = JSON.stringify(data || {});
  document.getElementById('brain-heading').textContent = title;
  document.getElementById('brain-body').innerHTML = body;
  form.querySelector('.form-error').hidden = true;
  form.querySelector('[type=submit]').textContent = submit;
  document.getElementById('brain-dialog').showModal();
}
const brainNameField = label => `<label>${label}<input name="person" required minlength="2" maxlength="80" value="${esc(brainName() === 'Owner' ? '' : brainName())}"></label>`;
const brainRoleSelect = value => `<label>What it is<select name="role">${Object.entries(BRAIN_ROLE_NAMES).map(([key, label]) => `<option value="${key}" ${key === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>`;
const brainDescribeSelect = () => { const team = brainTeam(); return `<label>Describe it now with<select name="describe"><option value="">Later</option>${team.claude ? '<option value="claude" selected>Claude</option>' : ''}${team.chatgpt ? `<option value="chatgpt" ${team.claude ? '' : 'selected'}>ChatGPT</option>` : ''}</select><span class="hint">The AI looks at the picture once and writes what it shows, so the writers and planners know your character.</span></label>`; };
const brainFindImage = id => (state.channelBrain?.families || []).flatMap(item => item.images).find(image => image.id === id);

async function brainAction(command, id, button) {
  const [first, ai] = String(id).split('|');
  const run = async (work, done) => {
    if (button) button.disabled = true;
    try { const result = await work(); await refresh(); if (done) toast(typeof done === 'function' ? done(result) : done); return result; }
    catch (error) { toast(error.message, true); await refresh().catch(() => {}); }
    finally { if (button) button.disabled = false; }
  };
  if (command === 'brain-brief') {
    const brief = brainOf(first)?.brief || {};
    return brainDialog('brief', 'Niche brief', `<div class="form-grid">${BRAIN_FIELDS.map(([key, label, hint, rows]) => `<label class="full">${esc(label)}<textarea name="${key}" rows="${rows}" placeholder="${esc(hint)}">${esc(Array.isArray(brief[key]) ? brief[key].join('\n') : brief[key] || '')}</textarea></label>`).join('')}${brainNameField('Your name')}</div>`, 'Save the brief', {familyId: first});
  }
  if (command === 'brain-image-add') return brainDialog('image', 'Add a reference picture', `<div class="form-grid"><label class="full">Picture (PNG, JPEG or WebP, up to 10 MB)<input type="file" name="file" accept="image/png,image/jpeg,image/webp" required></label><label>Name<input name="label" required minlength="2" maxlength="60" placeholder="The survivor"></label>${brainRoleSelect('character')}<label class="full">How to use it in the videos<textarea name="usage" rows="3" required minlength="4" maxlength="1000" placeholder="The survivor of every video: same face, hair and clothes in every scene; the satchel always with him."></textarea></label>${brainDescribeSelect()}${brainNameField('Your name')}</div>`, 'Add the picture', {familyId: first});
  if (command === 'brain-image-edit') {
    const image = brainFindImage(first);
    if (!image) return toast('That picture is no longer here.', true);
    return brainDialog('image-edit', `Edit "${image.label}"`, `<div class="form-grid"><label>Name<input name="label" required minlength="2" maxlength="60" value="${esc(image.label)}"></label>${brainRoleSelect(image.role)}<label class="full">How to use it<textarea name="usage" rows="3" required minlength="4" maxlength="1000">${esc(image.usage)}</textarea></label><label class="full">What the program sees (you may correct it)<textarea name="description" rows="5" maxlength="3000">${esc(image.description || '')}</textarea></label>${brainNameField('Your name')}</div>`, 'Save', {id: first});
  }
  if (command === 'brain-image-remove') { if (!confirm('Remove this reference picture? Videos already painted keep their pictures.')) return; return run(() => api(`/api/brain-images/${first}/remove`, {removedBy: brainName()}), 'Picture removed.'); }
  if (command === 'brain-image-describe') return run(() => api(`/api/brain-images/${first}/describe`, {ai, requestedBy: brainName()}), 'Described. The writers and planners now know this picture.');
  if (command === 'brain-file-remove') { if (!confirm('Remove this file from the channel brain?')) return; return run(() => api(`/api/brain-files/${first}/remove`, {removedBy: brainName()}), 'File removed.'); }
  if (command === 'brain-ask') {
    const question = document.getElementById(`brain-question-${first}`)?.value.trim() || '';
    if (question.length < 4) return toast('Write your question first.', true);
    toast(ai === 'both' ? 'Claude answers first, then ChatGPT challenges it. This takes a minute or two.' : 'Thinking about your question…');
    return run(() => api(`/api/families/${first}/brain/ask`, {question, ai, requestedBy: brainName()}), 'Answered. Keep what the program should remember.');
  }
  if (command === 'brain-keep' || command === 'brain-forget') return run(() => api(`/api/creative-asks/${first}/keep`, {kept: command === 'brain-keep', keptBy: brainName()}), command === 'brain-keep' ? 'Kept: every job of this channel reads it now.' : 'Taken out of the memory.');
  if (command === 'brain-playbook') { toast('The creative director is writing the playbook. This can take a few minutes.'); return run(() => api(`/api/families/${first}/brain/playbook`, {ai, requestedBy: brainName()}), 'The playbook is ready for your review.'); }
  if (command === 'brain-playbook-review') return brainDialog('playbook', 'Review the playbook', `<div class="form-grid"><label>Decision<select name="decision"><option value="approve">Approve: it leads this channel's jobs</option><option value="reject">Reject</option></select></label>${brainNameField('Reviewer name')}<label class="full">Reason (when rejecting)<input name="reason" maxlength="600"></label><label class="checkbox-label full"><input type="checkbox" name="read">I read the whole playbook</label><label class="checkbox-label full"><input type="checkbox" name="own">It keeps the channel original: techniques only from competitors, never their words, characters or look</label><label class="checkbox-label full"><input type="checkbox" name="leads">These rules should lead the script, storyboard, editing, sound and packaging jobs of this channel</label></div>`, 'Save the decision', {id: first});
  if (command === 'brain-match') {
    const url = document.getElementById(`brain-match-url-${first}`)?.value.trim() || '', gemini = brainGemini();
    if (!url) return toast('Paste a YouTube link first.', true);
    if (!gemini) return toast('Connect Gemini in Connections first.', true);
    toast('Gemini is watching the video. This takes a minute or two.');
    return run(() => api(`/api/families/${first}/brain/match`, {url, connector: {id: gemini.id, revision: gemini.revision}, requestedBy: brainName()}), result => (result.status === 'done' ? `Best fit: ${result.result.engineName}.` : `Gemini could not match it: ${result.error}`));
  }
  if (command === 'brain-use-match') {
    const match = (state.channelBrain?.families || []).flatMap(item => item.matches.map(entry => ({...entry, familyId: item.familyId}))).find(entry => entry.id === first);
    if (!match || typeof familyStyleDialog !== 'function') return toast('That match is no longer here.', true);
    return familyStyleDialog(match.familyId, {engine: match.result.engine, look: match.result.look, pictureType: match.result.pictureType});
  }
}

document.addEventListener('change', async event => {
  const input = event.target.closest?.('.brain-file-input');
  if (!input) return;
  const file = input.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { input.value = ''; return toast('The file is larger than 10 MB.', true); }
  try {
    const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1] || ''); reader.onerror = () => reject(new Error('The file could not be opened.')); reader.readAsDataURL(file); });
    toast(`Reading ${file.name}…`);
    const saved = await api('/api/brain-files', {familyId: input.dataset.family, contentId: input.dataset.content || undefined, name: file.name, data, addedBy: brainName()});
    await refresh();
    toast(`${saved.name}: ${saved.words.toLocaleString('en-US')} words read.`);
  } catch (error) { toast(error.message, true); }
  finally { input.value = ''; }
});

document.addEventListener('submit', async event => {
  if (event.target.id !== 'brain-form') return;
  event.preventDefault();
  const form = event.target, kind = form.dataset.kind, data = JSON.parse(form.dataset.payload || '{}'), error = form.querySelector('.form-error'), submit = form.querySelector('[type=submit]');
  const value = name => form.elements[name]?.value ?? '', checked = name => !!form.elements[name]?.checked;
  submit.disabled = true; error.hidden = true;
  try {
    const person = value('person').trim();
    if (person) try { localStorage.setItem('control-room-person', person); } catch { /* the name is remembered only for convenience */ }
    let message = 'Saved.';
    if (kind === 'brief') { await api(`/api/families/${data.familyId}/brain/brief`, {about: value('about'), promise: value('promise'), difference: value('difference'), ideas: value('ideas'), titles: value('titles'), avoid: value('avoid'), updatedBy: person}); message = 'Niche brief saved. Every job of this channel reads it from now on.'; }
    if (kind === 'image') {
      const file = form.elements.file.files[0];
      if (!file) throw new Error('Choose the picture.');
      if (file.size > 10 * 1024 * 1024) throw new Error('The picture must be smaller than 10 MB.');
      const image = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('The picture could not be read.')); reader.readAsDataURL(file); });
      submit.textContent = value('describe') ? 'Adding and describing…' : 'Adding…';
      const saved = await api('/api/brain-images', {familyId: data.familyId, image, label: value('label'), role: value('role'), usage: value('usage'), describe: value('describe') || undefined, addedBy: person});
      message = saved.describeError ? `Added, but it could not be described: ${saved.describeError}` : saved.description ? 'Added and described.' : 'Added.';
    }
    if (kind === 'image-edit') { await api(`/api/brain-images/${data.id}/update`, {label: value('label'), role: value('role'), usage: value('usage'), description: value('description'), updatedBy: person}); message = 'Picture updated.'; }
    if (kind === 'playbook') { const result = await api(`/api/creative-playbooks/${data.id}/review`, {decision: value('decision'), reviewer: person, reason: value('reason') || undefined, confirmations: {read: checked('read'), own: checked('own'), leads: checked('leads')}}); message = result.status === 'approved' ? `Approved: ${result.review.skills.length} process(es) now follow the playbook in this channel's jobs.` : 'Playbook rejected.'; }
    document.getElementById('brain-dialog').close();
    await refresh();
    toast(message);
  } catch (e) { error.textContent = e.message; error.hidden = false; }
  finally { submit.disabled = false; }
});
