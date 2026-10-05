'use strict';
// Skills Engine page.
// Loaded before app.js. Helpers from app.js (state, esc, badge, action, api, refresh, toast,
// saveForm, date, render, activeFamilies, $) are used only inside functions.
//
// One dialog (#skill-dialog) is reused for every form; skillFields() builds the fields per mode.
// The page CSP forbids inline style attributes, so nothing here sets one.

let skillSearch = '', skillRoom = '', skillTask = '', skillOrigin = '', skillStatus = '', skillTag = '';
let skillOpen = '', skillFamily = '', skillTab = 'library';

const SKILL_STATUS = {draft: ['Draft · needs review', 'orange'], approved: ['Approved · in use', 'green'], retired: ['Retired', 'gray'], superseded: ['Superseded', 'gray']};
const SKILL_ORIGIN = {builtin: ['Builtin', 'gray'], owner: ['Owner', 'green'], learned: ['Learned', 'orange']};
const skillStatusBadge = value => { const [label, colour] = SKILL_STATUS[value] || [value, 'gray']; return badge(label, colour); };
const skillOriginBadge = value => { const [label, colour] = SKILL_ORIGIN[value] || [value, 'gray']; return badge(label, colour); };
const skillTitle = value => String(value || '').replace(/[-.]/g, ' ');
function skillPerson() { try { return localStorage.getItem('control-room-person') || ''; } catch { return ''; } }
const skillNameField = (name, label = 'Your name') => `<label>${label}<input name="${name}" required minlength="2" maxlength="80" autocomplete="name" value="${esc(skillPerson())}"></label>`;
const skillList = items => (items && items.length ? `<ul class="skill-rules">${items.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : '');
function skillNumbers(numbers) {
  const keys = Object.keys(numbers || {});
  if (!keys.length) return '';
  const show = value => (typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value));
  return `<dl class="style-facts">${keys.map(key => `<div><dt>${esc(skillTitle(key))}</dt><dd class="mono-wrap">${esc(show(numbers[key]))}</dd></div>`).join('')}</dl>`;
}

function skillsAll() { return state?.skills?.skills || []; }
function skillById(id) { return skillsAll().find(item => item.id === id); }
function skillRevisionById(id) {
  for (const skill of skillsAll()) {
    const revision = skill.revisions.find(item => item.id === id);
    if (revision) return {skill, revision};
  }
  return null;
}
// The rule that decides what the rooms actually use: the approved revision, or nothing.
function skillRuntimeCount() { return skillsAll().filter(item => item.approved).length; }

function skillsFiltered() {
  const needle = skillSearch.trim().toLowerCase();
  return skillsAll().filter(skill => {
    const current = skill.approved || skill.latest;
    if (!current) return false;
    if (skillRoom && !current.skill.rooms.includes(skillRoom)) return false;
    if (skillTask && !current.skill.tasks.includes(skillTask)) return false;
    if (skillOrigin && skill.origin !== skillOrigin) return false;
    if (skillStatus && skill.status !== skillStatus) return false;
    if (skillTag && !current.skill.tags.includes(skillTag)) return false;
    if (!needle) return true;
    const haystack = [skill.id, current.skill.title, current.skill.when, current.skill.summary, current.skill.tags.join(' '), current.skill.source].join(' ').toLowerCase();
    return haystack.includes(needle);
  });
}

function skillsView() {
  const skills = state?.skills;
  if (!skills) return heading('Skills', 'Loading the skill library.');
  const counts = skills.counts, approved = skillRuntimeCount();
  const hero = `<section class="voice-hero"><div><span class="stage-kicker">SKILLS ENGINE · REVIEWED OPERATING KNOWLEDGE</span><h2>Skills</h2><p>Every skill extracted from your main-brain documents (Precision OS, the YT Empire Builders library and the CB YT AI Mastery bundle) and from the editing research lives here, in our own words. They all start as <b>drafts</b>: a skill changes how a room works only after you approve that exact revision. What the program learns from its own reviews arrives as a proposal in the Lessons queue, never as a silent edit. Skills marked <b>pin to a family</b> are channel or niche profiles: they reach only a family you pin them to.</p></div>
    <div class="voice-health"><span class="health-light ${approved ? 'ready' : ''}"></span><strong>${approved ? `${approved} skill${approved === 1 ? '' : 's'} in use` : 'Nothing approved yet'}</strong><small>${approved ? `of ${counts.total} in the library` : `${counts.total} drafts waiting for review`}</small></div></section>`;
  const tally = `<div class="production-context skill-tally"><span>${counts.total} skills</span><span>${counts.approved} approved</span><span>${counts.draft} draft</span><span>${counts.retired} retired</span><span>${counts.builtin} builtin</span><span>${counts.owner} owner</span><span>${counts.learned} learned</span><span>${counts.lessonsProposed} lesson${counts.lessonsProposed === 1 ? '' : 's'} waiting</span></div>`;
  const tabs = [['library', 'Library'], ['lessons', `Lessons${counts.lessonsProposed ? ` (${counts.lessonsProposed})` : ''}`], ['usage', 'Usage'], ['state', 'Project state'], ['rules', 'Built-in numbers']];
  const rail = `<div class="production-toolbar skill-tabs">${tabs.map(([id, label]) => `<button class="button ${skillTab === id ? 'primary' : 'secondary'}" data-skill-tab="${id}">${esc(label)}</button>`).join('')}<div class="row-end">${action('+ Add my own skill', 'skill-new', '', 'primary')}${action('Import pack', 'skill-import', '', 'secondary')}<a class="button secondary" href="/api/skills/export" target="_blank" rel="noopener">Export approved ↗</a></div></div>`;
  const body = skillTab === 'lessons' ? skillLessonsPanel() : skillTab === 'usage' ? skillUsagePanel() : skillTab === 'state' ? skillProjectStatePanel() : skillTab === 'rules' ? skillRulesPanel() : skillLibraryPanel();
  return heading('Skills', 'The reusable operating knowledge of this program: what to do, what to avoid, and the exact numbers each room applies.') + hero + tally + rail + body;
}

function skillLibraryPanel() {
  const vocabulary = state.skills.vocabulary;
  const tags = [...new Set(skillsAll().flatMap(skill => (skill.approved || skill.latest)?.skill.tags || []))].sort();
  const option = (value, label, selected) => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`;
  const filters = `<div class="production-toolbar skill-filters">
    <div><label for="skill-search">Search</label><input id="skill-search" type="search" maxlength="80" placeholder="hook, thumbnail, loudness…" value="${esc(skillSearch)}"></div>
    <div><label for="skill-room">Room</label><select id="skill-room">${option('', 'Every room', skillRoom)}${vocabulary.rooms.map(room => option(room, skillTitle(room), skillRoom)).join('')}</select></div>
    <div><label for="skill-task">Applies at</label><select id="skill-task">${option('', 'Every task', skillTask)}${vocabulary.tasks.map(task => option(task, task, skillTask)).join('')}</select></div>
    <div><label for="skill-origin">Origin</label><select id="skill-origin">${option('', 'Any origin', skillOrigin)}${vocabulary.origins.map(item => option(item, skillTitle(item), skillOrigin)).join('')}</select></div>
    <div><label for="skill-status">Status</label><select id="skill-status">${option('', 'Any status', skillStatus)}${['draft', 'approved', 'retired'].map(item => option(item, SKILL_STATUS[item][0], skillStatus)).join('')}</select></div>
    <div><label for="skill-tag">Tag</label><select id="skill-tag">${option('', 'Any tag', skillTag)}${tags.map(tag => option(tag, tag, skillTag)).join('')}</select></div></div>`;
  const found = skillsFiltered();
  if (!found.length) return `${filters}<div class="production-empty"><span class="empty-icon">✦</span><h2>No skill matches these filters</h2><p>Clear the search or pick a different room.</p></div>`;
  return `${filters}<p class="hint">${found.length} of ${skillsAll().length} skills${skillSearch || skillRoom || skillTask || skillOrigin || skillStatus || skillTag ? ' match these filters' : ''}. Open one to read its rules and approve it.</p><div class="skill-grid">${found.map(skillCard).join('')}</div>`;
}

function skillCard(skill) {
  const current = skill.approved || skill.latest, open = skillOpen === skill.id;
  const spec = current.skill;
  const head = `<div class="production-card-head"><div><span class="micro-label">${esc(spec.rooms.map(skillTitle).join(' · ').toUpperCase())} · ${esc(spec.kind)}${spec.pinOnly ? ' · PIN TO A FAMILY' : ''}</span><h2>${esc(spec.title)}</h2><code class="skill-id">${esc(skill.id)}</code></div><div class="row-end">${skillOriginBadge(skill.origin)}${skillStatusBadge(skill.status)}</div></div>`;
  if (!open) {
    return `<section class="production-card skill-card">${head}<p class="skill-when">${esc(spec.when)}</p><p>${esc(spec.summary)}</p><div class="card-actions">${action('Open', 'skill-open', skill.id, 'secondary')}${skill.status === 'draft' ? action('Review & approve', 'skill-approve', current.id, 'primary') : ''}</div></section>`;
  }
  const bindings = (state.skills.bindings || []).filter(item => item.skillId === skill.id);
  const pins = bindings.length ? `<div class="handoff-rule"><strong>Owner bindings</strong>${bindings.map(item => `<p>${item.mode === 'pin' ? 'Pinned to' : 'Blocked for'} <code>${esc(item.taskKey)}</code>${item.familyId ? ` · ${esc(state.families.find(family => family.id === item.familyId)?.name || 'one family')}` : ' · every family'} · ${esc(item.note)} ${action('Remove', 'skill-unbind', item.id, 'text-button danger')}</p>`).join('')}</div>` : '';
  const effect = skill.approved ? `<p class="hint">Used in ${(state.skills.usage || []).filter(item => item.skillIds.includes(skill.id)).length} recorded job(s).</p>` : '';
  return `<section class="production-card skill-card open">${head}
    <p class="skill-when">${esc(spec.when)}</p><p>${esc(spec.summary)}</p>
    ${spec.steps.length ? `<h3>Steps</h3><ol class="skill-rules">${spec.steps.map(step => `<li>${esc(step)}</li>`).join('')}</ol>` : ''}
    ${spec.do.length ? `<h3>Do</h3>${skillList(spec.do)}` : ''}
    ${spec.avoid.length ? `<h3>Avoid</h3>${skillList(spec.avoid)}` : ''}
    ${Object.keys(spec.numbers).length ? `<h3>Numbers</h3>${skillNumbers(spec.numbers)}` : ''}
    ${spec.checks.length ? `<h3>Checks</h3>${skillList(spec.checks)}` : ''}
    ${Object.keys(spec.inputs || {}).length ? `<h3>Inputs</h3>${skillNumbers(spec.inputs)}` : ''}
    <dl class="style-facts"><div><dt>Applies at</dt><dd class="mono-wrap">${esc(spec.tasks.join(', '))}${spec.pinOnly ? ' (only where pinned)' : ''}</dd></div><div><dt>Tags</dt><dd>${esc(spec.tags.join(', ') || '—')}</dd></div><div><dt>Priority</dt><dd>${spec.priority}</dd></div><div><dt>Source</dt><dd>${esc(spec.source)}</dd></div></dl>
    ${pins}${effect}
    <details class="scene-history"><summary>${skill.revisions.length} revision${skill.revisions.length === 1 ? '' : 's'}</summary>${skill.revisions.slice().reverse().map(item => `<div class="handoff-record"><span>r${item.revision}</span><div><strong>${skillStatusBadge(item.status)} ${esc(item.changeNote)}</strong><p>${esc(item.createdBy)} · ${esc(date(item.createdAt))}${item.lessonId ? ' · from a reviewed lesson' : ''}${item.review ? ` · approved by ${esc(item.review.approvedBy)}` : ''}${item.retirement ? ` · retired: ${esc(item.retirement.reason)}` : ''}</p>${item.status === 'draft' ? `<div class="card-actions">${action('Review & approve', 'skill-approve', item.id, 'primary')}</div>` : ''}${item.status === 'approved' ? `<div class="card-actions">${action('Retire', 'skill-retire', item.id, 'text-button danger')}</div>` : ''}</div></div>`).join('')}</details>
    <div class="card-actions">${action('Close', 'skill-open', '', 'secondary')}${action('Propose a change', 'skill-edit', skill.id, 'secondary')}${action('Pin or block', 'skill-bind', skill.id, 'secondary')}</div></section>`;
}

function skillLessonsPanel() {
  const lessons = state.skills.lessons || [];
  const proposed = lessons.filter(item => item.status === 'proposed');
  const intro = `<section class="production-card"><div class="production-card-head"><div><span class="micro-label">LEARNING LOOP</span><h2>What the program learned from its own work</h2></div>${badge(`${proposed.length} waiting`, proposed.length ? 'orange' : 'green')}</div>
    <p>When the quality gate blocks a script, a scene plan is rejected or a style proof asks for changes, the finding is recorded here as a <b>proposal</b>. Approving one writes a new <b>draft</b> revision of the skill it would change, and that draft still needs its own approval before any room uses it. Nothing here changes a skill on its own.</p></section>`;
  if (!lessons.length) return `${intro}<div class="production-empty"><span class="empty-icon">✦</span><h2>No lessons yet</h2><p>Lessons appear after the program's own reviews find something: a blocked script, a rejected scene plan, or a style proof returned for changes.</p></div>`;
  return intro + `<div class="skill-grid">${lessons.map(lesson => {
    const skill = lesson.skillId ? skillById(lesson.skillId) : null;
    const target = lesson.proposal.kind === 'new-skill' ? `a new skill <code>${esc(lesson.proposal.skill.id)}</code>` : `<code>${esc(lesson.skillId)}</code>${skill ? ` · ${esc((skill.approved || skill.latest).skill.title)}` : ''}`;
    const family = state.families.find(item => item.id === lesson.familyId);
    return `<section class="production-card"><div class="production-card-head"><div><span class="micro-label">${esc(lesson.source.toUpperCase())} · ${esc(lesson.taskKey)}</span><h2>${esc(lesson.finding)}</h2></div>${badge(lesson.status === 'proposed' ? 'Proposed' : lesson.status === 'approved' ? 'Approved into a draft' : 'Rejected', lesson.status === 'proposed' ? 'orange' : lesson.status === 'approved' ? 'green' : 'gray')}</div>
      <dl class="style-facts"><div><dt>Would change</dt><dd>${target}</dd></div><div><dt>Proposal</dt><dd>${esc(lesson.proposal.kind)}${lesson.proposal.numberKey ? ` · ${esc(lesson.proposal.numberKey)}` : ''}</dd></div><div><dt>Family</dt><dd>${esc(family?.name || 'every family')}</dd></div><div><dt>Seen</dt><dd>${esc(date(lesson.createdAt))}</dd></div></dl>
      <div class="handoff-rule"><strong>Proposed rule</strong><p>${esc(lesson.proposal.value)}</p></div>
      ${lesson.evidence.length ? `<h3>Evidence</h3>${skillList(lesson.evidence)}` : ''}
      ${lesson.review ? `<p class="hint">${esc(lesson.review.action === 'approve' ? 'Approved' : 'Rejected')} by ${esc(lesson.review.reviewedBy)} · ${esc(date(lesson.review.reviewedAt))} · ${esc(lesson.review.reason)}</p>` : ''}
      ${lesson.status === 'proposed' ? `<div class="card-actions">${action('Approve into a draft', 'skill-lesson-approve', lesson.id, 'primary')}${action('Reject', 'skill-lesson-reject', lesson.id, 'text-button danger')}</div>` : ''}</section>`;
  }).join('')}</div>`;
}

function skillUsagePanel() {
  const usage = state.skills.usage || [];
  const intro = `<section class="production-card"><div class="production-card-head"><div><span class="micro-label">RUNTIME LOG</span><h2>Where skills were actually used</h2></div>${badge(`${usage.length} recorded`, usage.length ? 'green' : 'gray')}</div>
    <p>Every job that received a skill brief is recorded with the exact revisions that were injected and how much of the prompt they used. The brief is capped at ${state.skills.briefByteBudget} bytes of the family's job token limit; anything that does not fit is dropped whole and counted, never trimmed mid-rule.</p></section>`;
  if (!usage.length) return `${intro}<div class="production-empty"><span class="empty-icon">✦</span><h2>No recorded use yet</h2><p>Approve a skill, then queue a Hermes script or a daily research brief. The injected revisions appear here.</p></div>`;
  return intro + `<section class="production-card"><table class="skill-table"><thead><tr><th>When</th><th>Room</th><th>Applied at</th><th>Skills</th><th>Bytes</th><th>Dropped</th><th>Outcome</th></tr></thead><tbody>${usage.map(item => `<tr><td>${esc(date(item.createdAt))}</td><td>${esc(item.room)}</td><td><code>${esc(item.taskKey)}</code></td><td>${item.skillIds.map(id => `<code>${esc(id)}</code>`).join(' ')}</td><td>${item.injectedBytes}</td><td>${item.dropped || '—'}</td><td>${esc(item.outcome || 'pending')}</td></tr>`).join('')}</tbody></table></section>`;
}

function skillProjectStatePanel() {
  const families = activeFamilies();
  if (!families.length) return `<div class="production-empty"><span class="empty-icon">✦</span><h2>Create a channel family first</h2><p>Project state is recorded per family and goes into that family's prompts.</p></div>`;
  if (!families.some(item => item.id === skillFamily)) skillFamily = families[0].id;
  const rows = (state.skills.projectState || []).filter(item => item.familyId === skillFamily);
  const groups = state.skills.vocabulary.projectStateCategories;
  const picker = `<div class="production-toolbar"><div><label for="skill-family">Channel family</label><select id="skill-family">${families.map(item => `<option value="${item.id}" ${item.id === skillFamily ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select></div><div class="row-end">${action('+ Record an entry', 'skill-state-new', skillFamily, 'primary')}</div></div>`;
  const intro = `<section class="production-card"><div class="production-card-head"><div><span class="micro-label">PROJECT STATE</span><h2>Locked, active, open, rejected</h2></div>${badge(`${rows.filter(item => !item.endedAt).length} open entries`, 'gray')}</div>
    <p>These four lists stop the program going in circles. Locked decisions are constraints, rejected directions are prohibitions, and both are sent with every prompt for this family. Rejecting a lesson also records it here, so the same idea is not proposed again.</p></section>`;
  const panels = groups.map(category => {
    const items = rows.filter(item => item.category === category);
    return `<section class="production-card"><div class="production-card-head"><div><span class="micro-label">${esc(category.toUpperCase())}</span><h2>${items.filter(item => !item.endedAt).length} open</h2></div></div>
      ${items.length ? items.map(item => `<div class="handoff-record"><span>${item.endedAt ? '○' : '●'}</span><div><strong>${esc(item.item)}</strong><p>${esc(item.note || 'No note.')} · ${esc(item.createdBy)} · ${esc(date(item.createdAt))}${item.endedAt ? ` · closed: ${esc(item.endedReason)}` : ''}</p>${item.endedAt ? '' : `<div class="card-actions">${action('Close this entry', 'skill-state-end', item.id, 'text-button danger')}</div>`}</div></div>`).join('') : '<p class="muted">Nothing recorded.</p>'}</section>`;
  }).join('');
  return picker + intro + `<div class="skill-grid">${panels}</div>`;
}

function skillRulesPanel() {
  const rules = state.skills.rules;
  return `<section class="production-card"><div class="production-card-head"><div><span class="micro-label">DETERMINISTIC RULES</span><h2>Numbers the rooms apply in code</h2></div>${badge('Not left to a model', 'green')}</div>
    <p>These limits are enforced by the program itself, so they cannot drift between runs or be forgotten by a writer. The matching skills explain the reasoning; this is the arithmetic.</p>
    <dl class="style-facts">
      <div><dt>Image count</dt><dd>one visual per 10-15 spoken words, 12 by default</dd></div>
      <div><dt>Beat math</dt><dd>duration ÷ seconds per visual, e.g. 720 s at 5 s = 144 beats</dd></div>
      <div><dt>On-screen text hold</dt><dd>max(1.2, 0.35 + words ÷ 3.2) seconds</dd></div>
      <div><dt>Captions</dt><dd>${rules.caption.maxCharsPerLine} characters a line · ${rules.caption.maxLines} lines · ${rules.caption.maxCharsPerSecond} characters a second · ${rules.caption.maxSeconds} s a cue</dd></div>
      <div><dt>Titles</dt><dd>${rules.title.minChars}-${rules.title.maxChars} characters</dd></div>
      <div><dt>Loudness</dt><dd>${rules.loudness.lufs} LUFS ±${rules.loudness.lufsTolerance} · true peak ≤ ${rules.loudness.truePeakDbtp} dBTP</dd></div>
      <div><dt>Sentence cap</dt><dd>25 words in narration</dd></div>
      <div><dt>Raw placeholders</dt><dd>blocked before a prompt is sent and before an artifact is delivered</dd></div>
    </dl>
    <h3>Banned filler phrases</h3>${skillList(rules.bannedPhrases)}
    <h3>Source-of-truth order sent with every brief</h3><ol class="skill-rules">${(state.skills.sourceHierarchy || []).map(item => `<li>${esc(item)}</li>`).join('')}</ol>
    <h3>Where the library came from</h3>${skillList(state.skills.packs)}
    <p class="hint">The owner's source documents are private course material and stay outside this program's folder. Every skill here is written in our own words.</p></section>`;
}

// ---------------------------------------------------------------- dialog
// One dialog serves every form. `mode` decides the fields and the submit handler.
function skillDialog(mode, context = {}) {
  const form = $('#skill-form');
  form.reset();
  form.querySelector('.form-error').hidden = true;
  form.dataset.mode = mode;
  form.dataset.context = JSON.stringify(context);
  const spec = SKILL_FORMS[mode];
  $('#skill-dialog-eyebrow').textContent = spec.eyebrow;
  $('#skill-dialog-heading').textContent = spec.heading;
  $('#skill-fields').innerHTML = spec.fields(context);
  $('#skill-dialog-submit').textContent = spec.submit;
  $('#skill-dialog-submit').className = `button ${spec.danger ? 'danger' : 'primary'}`;
  $('#skill-dialog').showModal();
}
const skillTextarea = (name, label, {rows = 3, required = false, min = 0, max = 4000, value = '', hint = ''} = {}) =>
  `<label class="full">${label}<textarea name="${name}" rows="${rows}" ${required ? 'required' : ''} ${min ? `minlength="${min}"` : ''} maxlength="${max}">${esc(value)}</textarea>${hint ? `<small>${esc(hint)}</small>` : ''}</label>`;

function skillFormFields(skill) {
  const spec = skill ? (skill.approved || skill.latest).skill : null;
  const vocabulary = state.skills.vocabulary;
  const lines = items => (items || []).join('\n');
  const numbers = spec && Object.keys(spec.numbers).length ? Object.entries(spec.numbers).map(([key, value]) => `${key} = ${typeof value === 'object' ? JSON.stringify(value) : value}`).join('\n') : '';
  return `${skillNameField('createdBy')}
    <label>Skill ID<input name="id" required minlength="5" maxlength="80" pattern="[a-z][a-z0-9]*\\.[a-z0-9][a-z0-9-]*" value="${esc(spec?.id || '')}" ${skill ? 'readonly' : ''} placeholder="hooks.my-own-rule"><small>area.kebab-name, for example hooks.my-own-rule</small></label>
    <label>Title<input name="title" required minlength="3" maxlength="120" value="${esc(spec?.title || '')}"></label>
    <label>Kind<select name="kind" required>${vocabulary.kinds.map(kind => `<option value="${kind}" ${spec?.kind === kind ? 'selected' : ''}>${esc(skillTitle(kind))}</option>`).join('')}</select></label>
    <label>Priority<input name="priority" type="number" min="0" max="100" value="${spec?.priority ?? 50}"><small>Higher wins the limited room in a brief. Your skills already outrank builtin ones.</small></label>
    <label class="full">Rooms<select name="rooms" multiple size="6" required>${vocabulary.rooms.map(room => `<option value="${room}" ${spec?.rooms.includes(room) ? 'selected' : ''}>${esc(skillTitle(room))}</option>`).join('')}</select><small>Hold Ctrl to pick several. Task bindings follow the rooms unless you choose them below.</small></label>
    <label class="full">Applies at (optional)<select name="tasks" multiple size="6">${vocabulary.tasks.map(task => `<option value="${task}" ${spec?.tasks.includes(task) ? 'selected' : ''}>${esc(task)}</option>`).join('')}</select><small>Leave empty to use the rooms' default tasks.</small></label>
    <label class="checkbox-label full"><input name="pinOnly" type="checkbox" ${spec?.pinOnly ? 'checked' : ''}><span>Only where pinned. Use this for a channel or niche profile, so it reaches a family only after you pin it there.</span></label>
    ${skillTextarea('when', 'When it applies', {rows: 2, required: true, min: 10, max: 400, value: spec?.when || '', hint: 'One sentence.'})}
    ${skillTextarea('summary', 'Summary', {rows: 3, required: true, min: 10, max: 1500, value: spec?.summary || ''})}
    ${skillTextarea('steps', 'Steps (one per line)', {rows: 4, value: lines(spec?.steps)})}
    ${skillTextarea('do', 'Do (one per line)', {rows: 3, value: lines(spec?.do)})}
    ${skillTextarea('avoid', 'Avoid (one per line)', {rows: 3, value: lines(spec?.avoid)})}
    ${skillTextarea('numbers', 'Numbers (one per line, name = value)', {rows: 3, value: numbers, hint: 'For example: hook_length = about 20 seconds'})}
    ${skillTextarea('checks', 'Checks (one per line)', {rows: 3, value: lines(spec?.checks)})}
    <label class="full">Tags<input name="tags" maxlength="300" value="${esc((spec?.tags || []).join(', '))}" placeholder="hook, retention"><small>Lowercase words, comma separated.</small></label>
    <label class="full">Source note<input name="source" required minlength="3" maxlength="600" value="${esc(spec?.source || 'Owner instruction')}"></label>
    ${skillTextarea('changeNote', 'Change note', {rows: 2, required: true, min: 8, max: 1000, hint: 'Why this version exists. Kept with the revision.'})}
    <p class="note">A skill needs at least one step, do rule, avoid rule or check. It is saved as a draft and used only after you approve it.</p>`;
}

const SKILL_FORMS = {
  create: {eyebrow: 'OWNER SKILL', heading: 'Add my own skill', submit: 'Save as draft', fields: () => skillFormFields(null)},
  edit: {eyebrow: 'NEW REVISION', heading: 'Propose a change', submit: 'Save as draft revision', fields: context => skillFormFields(skillById(context.skillId))},
  approve: {
    eyebrow: 'HUMAN REVIEW GATE', heading: 'Review and approve this skill', submit: 'Approve this revision',
    fields: context => {
      const found = skillRevisionById(context.revisionId);
      const spec = found?.revision.skill;
      return `${skillNameField('approvedBy', 'Reviewer name')}
        <p class="note full"><b>${esc(spec?.title || 'This skill')}</b> r${found?.revision.revision} · <code>${esc(spec?.id || '')}</code>. Approving makes this exact revision the one the rooms use${found?.skill.approved ? ', and supersedes the revision in use now' : ''}.</p>
        ${skillTextarea('notes', 'Review notes (optional)', {rows: 3, max: 2000})}
        <label class="checkbox-label full"><input name="wordingReviewed" type="checkbox" required><span>The wording is ours and copies no passage from a source document or a competitor.</span></label>
        <label class="checkbox-label full"><input name="numbersReviewed" type="checkbox" required><span>The numbers, limits and checks are correct for this program.</span></label>
        <label class="checkbox-label full"><input name="scopeReviewed" type="checkbox" required><span>The rooms and task bindings are the right places for this skill.</span></label>`;
    },
  },
  retire: {
    eyebrow: 'TAKE OUT OF USE', heading: 'Retire this revision', submit: 'Retire it', danger: true,
    fields: () => `${skillNameField('retiredBy')}${skillTextarea('reason', 'Why it is being retired', {rows: 3, required: true, min: 8, max: 1000})}<p class="note full">The revision stays in the history for provenance, but the rooms stop using it immediately.</p>`,
  },
  bind: {
    eyebrow: 'OWNER OVERRIDE', heading: 'Pin or block this skill', submit: 'Save the binding',
    fields: context => `${skillNameField('createdBy')}
      <label>Mode<select name="mode" required><option value="pin">Pin · always include it here</option><option value="block">Block · never use it here</option></select></label>
      <label>Applies at<select name="taskKey" required>${state.skills.vocabulary.tasks.map(task => `<option value="${task}">${esc(task)}</option>`).join('')}</select></label>
      <label>Channel family<select name="familyId"><option value="">Every family</option>${activeFamilies().map(item => `<option value="${item.id}">${esc(item.name)}</option>`).join('')}</select></label>
      <label>Order<input name="position" type="number" min="0" max="100" value="0"><small>Lower comes first among pinned skills.</small></label>
      ${skillTextarea('note', 'Why', {rows: 2, required: true, min: 8, max: 1000})}
      <p class="note full">Pinning <code>${esc(context.skillId)}</code> includes it even where its own bindings do not reach. Blocking removes it entirely, and a block always beats a pin.</p>`,
  },
  lesson: {
    eyebrow: 'LESSON REVIEW', heading: 'Review this lesson', submit: 'Record the decision',
    fields: context => {
      const lesson = (state.skills.lessons || []).find(item => item.id === context.lessonId);
      return `${skillNameField('reviewedBy', 'Reviewer name')}
        <p class="note full">${esc(lesson?.finding || '')}<br><b>Proposed:</b> ${esc(lesson?.proposal.value || '')}</p>
        <input type="hidden" name="action" value="${esc(context.action)}">
        ${skillTextarea('reason', context.action === 'approve' ? 'Why this becomes a rule' : 'Why this is not a rule', {rows: 3, required: true, min: 8, max: 1000})}
        <p class="note full">${context.action === 'approve' ? 'This writes a new <b>draft</b> revision. You still approve that draft before any room uses it.' : 'The finding is recorded as a rejected direction for this family, so it is not proposed again.'}</p>`;
    },
  },
  state: {
    eyebrow: 'PROJECT STATE', heading: 'Record a project state entry', submit: 'Record it',
    fields: () => `${skillNameField('createdBy')}
      <label>Category<select name="category" required>${state.skills.vocabulary.projectStateCategories.map(item => `<option value="${item}">${esc(item.toUpperCase())}</option>`).join('')}</select></label>
      <label class="full">Entry<input name="item" required minlength="4" maxlength="300" placeholder="Narration stays one calm male voice."></label>
      ${skillTextarea('note', 'Note (optional)', {rows: 2, max: 1000})}
      <p class="note full">Locked entries are constraints and rejected entries are prohibitions. Both are sent with this family's prompts.</p>`,
  },
  stateEnd: {
    eyebrow: 'CLOSE AN ENTRY', heading: 'Close this project state entry', submit: 'Close it', danger: true,
    fields: () => `${skillNameField('endedBy')}${skillTextarea('reason', 'Why it no longer applies', {rows: 3, required: true, min: 8, max: 1000})}`,
  },
  import: {
    eyebrow: 'IMPORT A PACK', heading: 'Import skills from JSON', submit: 'Import as drafts',
    fields: () => `${skillNameField('createdBy')}
      ${skillTextarea('skills', 'Skill pack JSON', {rows: 10, required: true, min: 2, max: 200000, hint: 'A JSON array of skills in the same shape as the export.'})}
      ${skillTextarea('changeNote', 'Change note', {rows: 2, required: true, min: 8, max: 1000})}
      <p class="note full">A new ID becomes a new draft skill. An ID that already exists becomes a new draft revision; nothing is overwritten and no import is approved automatically.</p>`,
  },
};

// Turn the textarea and multi-select fields back into the skill schema.
function skillFromForm(form) {
  const lines = name => String(form.elements[name].value || '').split('\n').map(item => item.trim()).filter(Boolean);
  const picked = name => [...form.elements[name].selectedOptions].map(option => option.value);
  const numbers = {};
  for (const line of lines('numbers')) {
    const at = line.indexOf('=');
    if (at < 1) throw new Error(`Write each number as "name = value". Could not read: ${line}`);
    const key = line.slice(0, at).trim(), raw = line.slice(at + 1).trim();
    if (!key || !raw) throw new Error(`Write each number as "name = value". Could not read: ${line}`);
    let value = raw;
    if (/^-?\d+(\.\d+)?$/.test(raw)) value = Number(raw);
    else if (raw === 'true' || raw === 'false') value = raw === 'true';
    else if (/^[[{]/.test(raw)) { try { value = JSON.parse(raw); } catch { value = raw; } }
    numbers[key] = value;
  }
  const tasks = picked('tasks');
  return {
    id: form.elements.id.value.trim(), title: form.elements.title.value.trim(),
    rooms: picked('rooms'), ...(tasks.length ? {tasks} : {}), ...(form.elements.pinOnly.checked ? {pinOnly: true} : {}),
    kind: form.elements.kind.value, when: form.elements.when.value.trim(), summary: form.elements.summary.value.trim(),
    steps: lines('steps'), do: lines('do'), avoid: lines('avoid'), checks: lines('checks'), numbers,
    tags: form.elements.tags.value.split(',').map(item => item.trim().toLowerCase()).filter(Boolean),
    source: form.elements.source.value.trim(), priority: Number(form.elements.priority.value || 0),
  };
}

function skillAction(command, id) {
  if (command === 'skill-open') { skillOpen = skillOpen === id ? '' : id; render(); return; }
  if (command === 'skill-new') return skillDialog('create');
  if (command === 'skill-edit') return skillDialog('edit', {skillId: id});
  if (command === 'skill-approve') return skillDialog('approve', {revisionId: id});
  if (command === 'skill-retire') return skillDialog('retire', {revisionId: id});
  if (command === 'skill-bind') return skillDialog('bind', {skillId: id});
  if (command === 'skill-import') return skillDialog('import');
  if (command === 'skill-state-new') return skillDialog('state', {familyId: id});
  if (command === 'skill-state-end') return skillDialog('stateEnd', {entryId: id});
  if (command === 'skill-lesson-approve') return skillDialog('lesson', {lessonId: id, action: 'approve'});
  if (command === 'skill-lesson-reject') return skillDialog('lesson', {lessonId: id, action: 'reject'});
  if (command === 'skill-unbind') {
    return saveFormless(async () => { await api(`/api/skill-bindings/${id}/remove`, {removedBy: skillPerson() || 'Owner'}); toast('Binding removed.'); });
  }
  return undefined;
}
async function saveFormless(run) { try { await run(); await refresh(); } catch (error) { toast(error.message, true); } }

function skillsBindEvents() {
  const dialog = $('#skill-dialog');
  if (!dialog) return;
  $('#skill-form').addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget, mode = form.dataset.mode, context = JSON.parse(form.dataset.context || '{}');
    const name = form.elements.createdBy || form.elements.approvedBy || form.elements.reviewedBy || form.elements.retiredBy || form.elements.endedBy;
    try { if (name?.value) localStorage.setItem('control-room-person', name.value.trim()); } catch { /* optional */ }
    saveForm(form, async () => {
      if (mode === 'create' || mode === 'edit') {
        const skill = skillFromForm(form), changeNote = form.elements.changeNote.value.trim();
        if (mode === 'edit') await api(`/api/skills/${context.skillId}/revisions`, {createdBy: form.elements.createdBy.value.trim(), changeNote, skill});
        else await api('/api/skills', {createdBy: form.elements.createdBy.value.trim(), changeNote, skill});
        return;
      }
      if (mode === 'approve') {
        await api(`/api/skill-revisions/${context.revisionId}/approve`, {approvedBy: form.elements.approvedBy.value.trim(), notes: form.elements.notes.value.trim(), confirmations: {wordingReviewed: form.elements.wordingReviewed.checked, numbersReviewed: form.elements.numbersReviewed.checked, scopeReviewed: form.elements.scopeReviewed.checked}});
        return;
      }
      if (mode === 'retire') { await api(`/api/skill-revisions/${context.revisionId}/retire`, {retiredBy: form.elements.retiredBy.value.trim(), reason: form.elements.reason.value.trim()}); return; }
      if (mode === 'bind') { await api('/api/skill-bindings', {createdBy: form.elements.createdBy.value.trim(), skillId: context.skillId, mode: form.elements.mode.value, taskKey: form.elements.taskKey.value, familyId: form.elements.familyId.value || null, position: Number(form.elements.position.value || 0), note: form.elements.note.value.trim()}); return; }
      if (mode === 'lesson') { await api(`/api/skill-lessons/${context.lessonId}/review`, {reviewedBy: form.elements.reviewedBy.value.trim(), action: context.action, reason: form.elements.reason.value.trim()}); return; }
      if (mode === 'state') { await api(`/api/families/${context.familyId}/project-state`, {createdBy: form.elements.createdBy.value.trim(), category: form.elements.category.value, item: form.elements.item.value.trim(), note: form.elements.note.value.trim()}); return; }
      if (mode === 'stateEnd') { await api(`/api/project-state/${context.entryId}/end`, {endedBy: form.elements.endedBy.value.trim(), reason: form.elements.reason.value.trim()}); return; }
      if (mode === 'import') {
        let parsed;
        try { parsed = JSON.parse(form.elements.skills.value); } catch { throw new Error('That is not valid JSON. Paste the array exactly as exported.'); }
        const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.skills) ? parsed.skills : null;
        if (!list) throw new Error('The pack must be a JSON array of skills, or an export object with a "skills" array.');
        await api('/api/skills/import', {createdBy: form.elements.createdBy.value.trim(), changeNote: form.elements.changeNote.value.trim(), skills: list});
      }
    }, 'Saved to your local workspace.');
  });
  document.addEventListener('click', event => {
    const tab = event.target.closest('[data-skill-tab]');
    if (tab) { skillTab = tab.dataset.skillTab; render(); }
  });
  document.addEventListener('input', event => {
    if (event.target.id === 'skill-search') { skillSearch = event.target.value; render(); $('#skill-search')?.focus(); }
  });
  document.addEventListener('change', event => {
    const map = {'skill-room': value => { skillRoom = value; }, 'skill-task': value => { skillTask = value; }, 'skill-origin': value => { skillOrigin = value; }, 'skill-status': value => { skillStatus = value; }, 'skill-tag': value => { skillTag = value; }, 'skill-family': value => { skillFamily = value; }};
    const setter = map[event.target.id];
    if (setter) { setter(event.target.value); render(); }
  });
}
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', skillsBindEvents);
