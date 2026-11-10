'use strict';
// Room 04 - Scene & Visual Room (UI).
// Loaded before app.js. Helpers from app.js (state, esc, badge, action, api, refresh, toast, saveForm,
// date, money, render) and from intelligence.js (intelConnectors, intelMeter) are used only inside functions.

let sceneContentId = '', sceneShot = null, scenePoll = null;
const SCENE_PURPOSE = {hook: 'Hook', context: 'Context', explain: 'Explain', example: 'Example', evidence: 'Evidence', turn: 'Turn', recap: 'Recap', close: 'Close', 'call-to-action': 'Call to action'};
const SCENE_JOB = {queued: ['Queued', 'orange'], running: ['Running', 'orange'], paused: ['Paused', 'orange'], cancelled: ['Stopped', 'gray'], completed: ['Done', 'green'], failed: ['Failed', 'gray'], interrupted: ['Interrupted · cost unknown', 'orange'], stale: ['Stale', 'gray'], blocked_quota: ['Hourly cap reached', 'orange'], blocked_budget: ['Over budget', 'orange'], quality_failed: ['Blocked by checks', 'orange'], usage_unknown: ['Usage unknown', 'orange'], budget_violation: ['Over token limit', 'orange']};
// What was already fixed before the owner sees the plan: shots Claude's continuity review redrew, and the
// continuity the program mended.
// The video's art direction (atelier shots design to it) and how the designs went.
const sceneDirection = plan => {
  const d = plan.direction;
  if (!d) return '';
  const swatch = color => `<span class="swatch-chip">${esc(color)}</span>`;
  return `<details class="scene-warnings"><summary>Art direction · ${esc(d.read.slice(0, 80))}${d.read.length > 80 ? '…' : ''}</summary><ul class="intel-list"><li><b>Feel:</b> ${esc(d.read)}</li><li><b>Dials:</b> variety ${d.dials.variance}/10 · motion ${d.dials.motion}/10 · density ${d.dials.density}/10</li><li><b>Palette:</b> ${['canvas', 'ink', 'accent', 'support'].map(key => `${key} ${swatch(d.palette[key])}`).join(' ')}</li><li><b>Type:</b> ${esc(d.fonts.display)} / ${esc(d.fonts.body)} · <b>Motion:</b> ${esc(d.motion)}</li>${d.signature ? `<li><b>Signature:</b> ${esc(d.signature)}</li>` : ''}${d.avoid.length ? `<li><b>Avoid:</b> ${esc(d.avoid.join('; '))}</li>` : ''}${plan.compose ? `<li><b>Designed by Claude:</b> ${plan.compose.designed} of ${plan.compose.shots} atelier shots (${plan.compose.tokens.toLocaleString()} tokens)${plan.compose.notes.length ? ` · ${esc(plan.compose.notes.join(' '))}` : ''}</li>` : ''}</ul></details>`;
};
// The story director's map and how the engines take turns along the video (P06i). The page forbids inline
// styles, so the strip is SVG with presentation attributes.
const SCENE_ENGINE = {stickman: ['Stickman', '#E0753E'], handdrawn: ['Hand-drawn', '#8C6D46'], atelier: ['Motion Graphics (HTML)', '#5B6CFF'], motion: ['Documentary drawing', '#2FB38E'], montage: ['Footage', '#8A8F98']};
const sceneEngine = key => SCENE_ENGINE[key] || [key, '#999999'];
const sceneStory = plan => {
  const mix = plan.mix;
  if (!mix?.runs?.length) return '';
  const total = Math.max(1, mix.runs.at(-1).end), dot = color => `<svg class="mix-dot" viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="5" fill="${color}"/></svg>`;
  const strip = `<svg class="mix-strip" viewBox="0 0 1000 16" preserveAspectRatio="none" role="img" aria-label="Engines along the video">${mix.runs.map(run => `<rect x="${(run.start / total * 1000).toFixed(1)}" y="0" width="${Math.max(1.5, (run.end - run.start) / total * 1000).toFixed(1)}" height="16" fill="${sceneEngine(run.engine)[1]}"><title>${esc(sceneEngine(run.engine)[0])} ${run.start}-${run.end} s</title></rect>`).join('')}${(plan.map?.chapters || []).slice(1).map(chapter => { const at = plan.sentences?.find(item => item.n === chapter.sentenceStart)?.startSeconds; return Number.isFinite(at) ? `<rect x="${(at / total * 1000).toFixed(1)}" y="0" width="3" height="16" fill="#1F1F1F"><title>${esc(chapter.title)}</title></rect>` : ''; }).join('')}</svg>`;
  const shares = Object.entries(mix.engines).sort((a, b) => b[1].seconds - a[1].seconds).map(([key, item]) => `${dot(sceneEngine(key)[1])} ${esc(sceneEngine(key)[0])} ${item.share}%`).join(' · ');
  const chapters = plan.map?.chapters?.length ? `<details class="story-chapters"><summary>The story's chapters (${plan.map.chapters.length})</summary><ol class="intel-list">${plan.map.chapters.map(chapter => `<li><b>${esc(chapter.title)}</b> · ${esc(chapter.job)} · sentences ${chapter.sentenceStart}-${chapter.sentenceEnd} · carried by ${esc(sceneEngine(chapter.home)[0])}${chapter.rehook ? ` · re-hook: ${esc(chapter.rehook)}` : ''}</li>`).join('')}</ol></details>` : '';
  const world = plan.world ? `<p class="hint"><b>World:</b> ${esc(plan.world.era)}${plan.world.place ? ` · ${esc(plan.world.place)}` : ''}${plan.world.rules?.length ? ` · ${plan.world.rules.map(esc).join(' · ')}` : ''}</p>` : '';
  const kit = plan.kit && Object.keys(plan.kit).length ? `<p class="hint"><b>Made for this story:</b> ${Object.values(plan.kit).map(item => `${esc(item.name)} (${esc(item.kind)})`).join(', ')}</p>` : '';
  return `<details class="scene-warnings"><summary>Story & engines · ${Object.keys(mix.engines).length} engine${Object.keys(mix.engines).length === 1 ? '' : 's'}${mix.longestRun ? ` · longest stretch ${Math.round(mix.longestRun.seconds)} s in ${esc(sceneEngine(mix.longestRun.engine)[0])}` : ''}</summary>${strip}<p class="mix-legend">${shares}</p>${plan.map?.structure ? `<p class="hint">${esc(plan.map.structure)}</p>` : ''}${world}${kit}${chapters}</details>`;
};
// Shots planned as designed (atelier) shots that were not designed are drawn from their words until Claude draws them.
const sceneUndesigned = manifest => {
  const count = manifest.plan.scenes.flatMap(scene => scene.shots).filter(shot => shot.source === 'generated-graphics' && shot.frame && !shot.frame.html).length;
  if (!count) return '';
  return `<p class="inline-warning">${count} shot${count === 1 ? '' : 's'} planned as designed shots ${count === 1 ? 'is' : 'are'} not designed (past the budget of designed shots, or the design failed its checks), so ${count === 1 ? 'it is' : 'they are'} drawn from ${count === 1 ? 'its' : 'their'} words. ${manifest.scope.current ? action('Draw them with Claude', 'scene-redraw', manifest.id, 'secondary') : ''}</p>`;
};
const sceneFixes = plan => {
  const fixed = [...(plan.review?.changes || []).map(item => `<li><b>${esc(item.label)}</b> redrawn by Claude's continuity review: ${esc(item.reason)}</li>`), ...(plan.continuity || []).map(item => `<li><b>${esc(item.label)}</b> ${esc(item.fix)} (fixed by the program)</li>`)];
  return (fixed.length ? `<details class="scene-warnings"><summary>${fixed.length} fixed before you saw it</summary><ul class="intel-list">${fixed.join('')}</ul></details>` : '') + (plan.review?.notes?.length ? `<p class="inline-warning">${esc(plan.review.notes.join(' '))}</p>` : '');
};
const sceneJobBadge = status => { const [label, color] = SCENE_JOB[status] || [status, 'gray']; return badge(label, color); };
// Where a plan's tokens went: what Claude read, its thinking before it answers, and the answer (estimated).
const sceneTokenSplit = job => {
  const t = job.quality?.tokens;
  if (t) return ` (read ${t.read.toLocaleString()} · thought about ${t.thinking.toLocaleString()} · answered about ${t.answer.toLocaleString()})`;
  return Number.isSafeInteger(job.usage?.prompt) && Number.isSafeInteger(job.usage?.completion) ? ` (read ${job.usage.prompt.toLocaleString()} · wrote ${job.usage.completion.toLocaleString()}, thinking and answer together)` : '';
};
const SCENE_PROVIDER = {pexels: 'Pexels', pixabay: 'Pixabay', openai: 'OpenAI', wikimedia: 'Wikimedia Commons'};
const sceneProvider = value => SCENE_PROVIDER[value] || value;
const sceneClock = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const sceneSeconds = seconds => `${Number(seconds).toFixed(1)} s`;
// The video's own design an adaptive style asked Claude for (0.64): colours, fonts, pace, energy and captions.
function sceneDesignLine(design) {
  const swatch = hex => `<span class="swatch" data-swatch="${esc(hex)}" title="${esc(hex)}"></span>`;
  const parts = [design.palette ? `Colours ${['background', 'primary', 'accent', 'text'].map(key => swatch(design.palette[key])).join('')}` : '', design.fonts ? `fonts ${esc(design.fonts.heading)} / ${esc(design.fonts.body)}` : '', design.pace ? `shots ${design.pace.shotMinSeconds}-${design.pace.shotMaxSeconds} s (hook ≤ ${design.pace.hookShotMaxSeconds} s)` : '', Number.isInteger(design.energy) ? `energy ${design.energy}` : '', design.captions ? `captions ${esc([design.captions.theme, design.captions.animation].filter(Boolean).join(', '))}${design.captions.highlight ? ', word highlight' : ''}` : ''].filter(Boolean);
  return `<p class="hint design-line"><strong>This video's design (chosen by the AI):</strong> ${parts.join(' · ')}${design.reason ? ` - ${esc(design.reason)}` : ''}</p>`;
}
function scenePerson() { try { return localStorage.getItem('control-room-person') || ''; } catch { return ''; } }
function sceneRemember(name) { try { if (name) localStorage.setItem('control-room-person', name); } catch { /* storage is optional */ } }
const scenePersonField = (label = 'Your name', name = 'person') => `<label>${label}<input name="${name}" required minlength="2" maxlength="80" autocomplete="name" value="${esc(scenePerson())}"></label>`;
function sceneContent(id = sceneContentId) { return state.scenes?.contents.find(item => item.contentId === id) || null; }
function sceneLatest(content) { return content?.manifests.find(item => item.latest) || null; }
function sceneShots(manifest) { return manifest ? manifest.plan.scenes.flatMap(scene => scene.shots.map(shot => ({...shot, scene}))) : []; }
function sceneAsset(content, id) { return content.assets.find(item => item.id === id) || null; }
function sceneActiveJobs(content, shotId = null) { return content.jobs.filter(job => ['queued', 'running'].includes(job.status) && (!shotId || job.shotId === shotId)); }
function sceneBusy() {
  const contents = state?.scenes?.contents || [];
  // 0.94: a storyboard waiting for the internet goes on by itself, so the page keeps looking (it used to stay "Paused"
  // after the program had resumed it, and Resume then said it was running).
  const waiting = job => job.status === 'paused' && job.pause?.waitUntil && Date.parse(job.pause.waitUntil) > Date.now();
  return contents.some(content => content.planJobs.some(job => ['queued', 'running'].includes(job.status) || waiting(job)) || sceneActiveJobs(content).length);
}
function sceneSpec(content) { const found = typeof styleRevisionById === 'function' ? styleRevisionById(content.inputs.style.revisionId) : null; return found?.revision.spec || null; }
function sceneNarration(manifest, scene) { return manifest.plan.sentences.slice(scene.sentenceStart - 1, scene.sentenceEnd).map(item => item.text).join(' '); }
function sceneConnectorOptions(provider, optional = false) {
  const items = intelConnectors(provider);
  return `${items.map(item => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('')}${optional || !items.length ? `<option value="">${optional ? 'Do not use' : 'No tested connector'}</option>` : ''}`;
}
// The connected AIs, one per kind (0.79, owner review 2026-11-02: "Plan with Claude" showed while ChatGPT was connected too).
const sceneAiName = provider => (provider === 'chatgpt' ? 'ChatGPT' : 'Claude');
function sceneAis() { const seen = new Set(); return intelConnectors('ai').filter(item => { const kind = sceneAiName(item.provider); if (seen.has(kind)) return false; seen.add(kind); return true; }).map(item => ({id: item.id, revision: item.revision, provider: item.provider, name: sceneAiName(item.provider)})); }
function sceneConnectorRef(id) { const connector = state.connectors.find(item => item.id === id); return connector ? {id: connector.id, revision: connector.revision} : null; }

// ---------------------------------------------------------------- room view
function sceneRoomView(family) {
  const contents = (state.scenes?.contents || []).filter(item => item.familyId === family.id);
  if (!contents.length) return `<section class="voice-hero"><div><span class="stage-kicker">ROOM 04 · SCENES & VISUALS</span><h2>Scene & Visual Room</h2><p>Turns an approved script and its approved narration into scenes and shots, then finds one rights-recorded visual per shot from stock libraries or AI.</p></div></section><div class="production-empty"><span class="empty-icon">▣</span><h2>No approved script yet</h2><p>Approve a script in Content Studio, approve its narration in the Voice Room and assign a style to ${esc(family.name)}. Then plan its scenes here.</p><a class="button secondary" href="#studio">Open Content Studio</a></div>`;
  if (!contents.some(item => item.contentId === sceneContentId)) sceneContentId = contents[0].contentId;
  const content = sceneContent(), manifest = sceneLatest(content), usage = state.scenes.usage[family.id], quota = state.scenes.quota;
  const shots = sceneShots(manifest), filled = shots.filter(shot => content.selections[shot.id]).length;
  const ready = content.inputs.ready;
  const picker = contents.length > 1 ? `<div class="production-toolbar scene-toolbar"><div><label for="scene-content">Approved script</label><select id="scene-content">${contents.map(item => `<option value="${item.contentId}" ${item.contentId === content.contentId ? 'selected' : ''}>${esc(item.title)} · v${item.contentRevision}</option>`).join('')}</select></div></div>` : '';
  return `<section class="voice-hero"><div><span class="stage-kicker">ROOM 04 · SCENES & VISUALS</span><h2>Scene & Visual Room</h2><p>Plan scenes from the approved narration, then pick one rights-recorded visual per shot from Pexels, Pixabay or AI images. Nothing is bought or used until you approve it.</p></div><div class="voice-health"><span class="health-light ${content.handoff.ready ? 'ready' : ''}"></span><strong>${content.handoff.ready ? 'Visuals approved' : ready ? 'Inputs ready' : 'Setup required'}</strong><small>${esc(content.handoff.ready ? `${content.handoff.shots} shots handed to editing` : ready ? 'Script, narration and style are locked' : content.inputs.blockers[0])}</small></div></section>
    ${picker}
    <div class="production-kpis"><div><span>Scenes</span><strong>${manifest ? manifest.sceneCount : '—'}</strong><small>${manifest ? `${sceneClock(manifest.narrationSeconds)} narration` : 'No plan yet'}</small></div>${sceneShotsTile(content, manifest, shots, filled)}<div><span>This channel's AI images ${esc(usage.period)}</span><strong>${money(usage.settledCents + usage.reservedCents)}</strong><small>of ${money(usage.budgetCents)} budget · ${usage.images} image${usage.images === 1 ? '' : 's'}</small></div><div><span>Stock requests this hour (all channels)</span><strong>${quota.pexels.used + quota.pixabay.used}</strong><small>Pexels ${quota.pexels.used}/${quota.pexels.cap} · Pixabay ${quota.pixabay.used}/${quota.pixabay.cap}</small></div></div>
    ${sceneRoad(content, manifest)}
    <div class="scene-cards">${sceneInputsCard(content)}${manifest ? sceneBatchCard(content, manifest, family) + sceneApprovalCard(content, manifest) : ''}</div>
    ${manifest ? scenePlanCard(content, manifest) : sceneEmptyPlan(content)}`;
}

// What happens next (0.82, owner question 2026-11-02: "now all scenes are drawn, how will the editing proceed? there is no
// approval button or anything that says move to editing"): the five steps from the storyboard to the Editing Room, each
// with its state and the one button that moves it on.
function sceneRoad(content, manifest) {
  if (!content.inputs.ready) return '';
  const d = content.drawing || {total: 0, current: 0, outdated: 0, missing: 0, active: 0}, shots = manifest ? sceneShots(manifest) : [], filled = shots.filter(shot => content.selections[shot.id]).length;
  const longShots = manifest ? manifest.issues.filter(item => SCENE_LONG.test(item)).length : 0, link = (label, id) => `<button type="button" class="road-link" data-action="scene-goto-board" data-id="${id}">${label}</button>`;
  // 0.82.2 (owner sketch 2026-11-03): four boxes, three in the first row and one under the first, each as tall as its
  // row, a state label on top and its buttons at the bottom; links (see the storyboard, the problems) sit in the text.
  const steps = [
    {title: 'The storyboard', done: !!manifest && manifest.source !== 'rules' && !manifest.oldRules, text: manifest ? `Built: revision ${manifest.revision}, ${manifest.sceneCount} scenes, ${manifest.shotCount} shots. ${link('See the storyboard ↓', '')}${manifest.oldRules ? ' <b>Planned with older scene rules</b>: drawing again keeps its old places, clothes and objects.' : ''}` : 'Not built yet: build it with Claude or ChatGPT below.',
      buttons: manifest?.oldRules && manifest.latest && manifest.scope.current ? action('Update to today\'s rules', 'scene-update-rules', manifest.id, 'primary') : ''},
    {title: 'Approve the storyboard', done: manifest?.status === 'approved', text: !manifest ? 'After the storyboard is built.' : manifest.status === 'approved' ? 'Approved.' : !manifest.scope.current ? 'Out of date: refresh it in the plan below.' : manifest.issues.length ? `${manifest.issues.length} problem${manifest.issues.length === 1 ? '' : 's'} to fix first${longShots ? ` (${longShots === 1 ? '1 shot holds' : `${longShots} shots hold`} longer than the video's pace)` : ''}. ${link('Show the problems ↓', 'problems')}` : 'Read it, then approve it.',
      buttons: manifest && manifest.status !== 'approved' && manifest.scope.current ? (manifest.issues.length ? (longShots ? `<span class="road-ask">Fix the long shots with</span>${sceneFixButtons(manifest)}` : '') : action('Review and approve', 'scene-review', manifest.id, 'primary')) : ''},
    {title: 'Draw the scenes', done: d.total > 0 && !d.missing && !d.outdated && !d.active, text: !d.total ? 'Nothing to draw (no drawn shots).' : d.active ? `Drawing now: ${d.current} of ${d.total} done.` : !d.missing && !d.outdated ? `All ${d.total} drawn. Drawing again keeps the same scenes; to change one, use Change with words on its shot.` : `${d.current} of ${d.total} drawn${d.outdated ? `, ${d.outdated} out of date (the drawing was improved)` : ''}. Free, on this PC.`, buttons: manifest ? sceneDrawButton(manifest, d) : ''},
    // The sketch's fourth box: approving the visuals is what hands the board to the Editing Room, so it is one step.
    // 0.86 (owner review 2026-11-04: "Approve visuals" stayed clickable while the scenes were being drawn again): the
    // visuals are approved only once every drawn shot has today's drawing and nothing is being drawn.
    {title: 'Approve the visuals, then edit', done: content.handoff.ready, text: content.handoff.ready ? 'Approved: the Editing Room builds the edit from this board.' : sceneDrawWait(d) || `${filled} of ${shots.length} shots have a visual. Approving them opens the Editing Room.`,
      buttons: content.handoff.ready ? '<button type="button" class="button primary" data-production-room="editing">Go to the Editing Room →</button>' : manifest && manifest.status === 'approved' && manifest.scope.current && filled === shots.length ? (sceneDrawWait(d) ? '<button type="button" class="button primary" disabled>Approve visuals</button>' : action('Approve visuals', 'scene-approve', manifest.id, 'primary')) : ''},
  ];
  const next = steps.findIndex(step => !step.done), state = k => (steps[k].done ? 'done' : k === next ? 'now' : 'later');
  // 0.86: two storyboards kept side by side until the owner chooses.
  const c = content.compare, choiceBox = c ? `<div class="road-choice"><strong>Two storyboards of this script</strong><p>The new one is revision ${c.fresh.revision} (${c.fresh.scenes} scenes, ${c.fresh.shots} shots); you kept revision ${c.earlier.revision} (${c.earlier.scenes} scenes, ${c.earlier.shots} shots). Choose which one the video uses. Until you choose, the new one is the plan.</p>
    <div class="card-actions">${action('Use the new one', 'scene-choose', `${c.jobId}|new`, 'secondary')}${c.mergeable ? action(`Go back to revision ${c.earlier.revision}`, 'scene-choose', `${c.jobId}|previous`, 'secondary') + sceneAis().map((ai, k) => action(`Merge the best of both with ${ai.name}`, 'scene-choose', `${c.jobId}|merge|${ai.id}`, k ? 'secondary' : 'primary')).join('') : '<span class="hint">The kept storyboard was made for another revision of the script or narration, so only the new one can be used.</span>'}</div>
    <p class="hint">Going back or merging makes a new revision; every shot keeps its drawing, so only shots that changed are drawn again. Merging asks the AI once which version of each stretch of the script shows the words better (it uses tokens).</p></div>` : '';
  return `<section class="production-card scene-road"><div class="production-card-head"><div><span class="micro-label">WHAT HAPPENS NEXT</span><h2>From storyboard to editing</h2></div><span class="road-count">${steps.filter(step => step.done).length} of ${steps.length} done</span></div>${choiceBox}
    <ol class="road-steps">${steps.map((step, k) => `<li class="road-step ${state(k)}"><div class="road-top"><span class="road-mark">${step.done ? '✓' : k + 1}</span><strong>${step.title}</strong><span class="road-state">${{done: 'Done', now: 'Next', later: 'Later'}[state(k)]}</span></div><p class="road-text">${step.text}</p>${step.buttons ? `<div class="road-actions">${step.buttons}</div>` : ''}</li>`).join('')}</ol></section>`;
}
// Why the visuals cannot be approved yet: drawing now, or drawn shots without today's drawing (null when ready).
const sceneDrawWait = d => (d.active ? `Wait for the drawing: ${d.current} of ${d.total} drawn. The visuals can be approved once every scene is drawn.` : d.missing || d.outdated ? `${d.missing + d.outdated} drawn shot${d.missing + d.outdated === 1 ? '' : 's'} still to draw in step 3; the visuals can be approved after that.` : null);
// The drawing step's one button (0.82.1: it lives only in the road): Stop while drawing, Draw the remaining, or again.
const sceneDrawButton = (manifest, d) => (!manifest.scope.current || !d.total ? '' : d.active ? action('Stop drawing', 'scene-draw-stop', manifest.id, 'secondary stop-button') : d.missing || d.outdated ? action(d.missing + d.outdated === d.total && !d.outdated ? `Draw all ${d.total}` : `Draw the remaining ${d.missing + d.outdated}`, 'scene-draw-all', manifest.id, 'primary') : action('Draw them all again', 'scene-draw-again', manifest.id, 'text-button'));
const SCENE_LONG = /^S\d+[A-Z] would hold [\d.]+ s, above the style's [\d.]+ s shot limit/;
const sceneFixButtons = manifest => sceneAis().map(ai => action(ai.name, 'scene-fix-long', `${manifest.id}|${ai.id}`, 'primary')).join('');
// Labels like S33A in a problem jump to their scene on the board.
const sceneLinked = text => esc(text).replace(/\b(S\d{2,})([A-H])?\b/g, (match, scene) => `<button type="button" class="scene-jump" data-action="scene-goto" data-id="${scene}">${match}</button>`);
function sceneInputsCard(content) {
  const busy = content.planJobs.find(job => ['queued', 'running'].includes(job.status) && !job.picture && !job.redesign && !job.redraw);
  // 0.82 (owner review 2026-11-02): once a storyboard is built the buttons say so.
  const latest = sceneLatest(content), built = latest && latest.source !== 'rules' ? latest : null;
  const inputs = content.inputs, row = (ok, title, detail) => `<div class="handoff-record"><span>${ok ? '✓' : '○'}</span><div><strong>${title}</strong><p>${detail}</p></div></div>`;
  // 0.80 (owner request 2026-11-02): the newest job shows; earlier ones fold away with "Clear them".
  // 0.81: the row says when the storyboard was asked for and when it last ran (a retry hours later showed only the
  // first time), and a paused one says what it keeps and offers Resume.
  const when = job => (job.updatedAt && new Date(job.updatedAt) - new Date(job.createdAt) > 60000 ? `asked ${esc(date(job.createdAt))} · last run ${esc(date(job.updatedAt))}` : esc(date(job.createdAt)));
  const planRow = job => `<div class="history-row"><span class="job-dot ${['queued', 'running'].includes(job.status) ? 'queued' : job.status === 'completed' ? 'completed' : ''}"></span><div><strong>${sceneJobBadge(job.status)} ${job.picture ? `Paid picture for ${esc(job.picture.label)}` : job.redesign ? `Redesign ${esc(job.redesign.label)}` : job.redraw ? sceneRedrawName(job.redraw) : `Storyboard by ${sceneAiName(job.provider)}`} · ${when(job)}</strong>${job.status === 'paused' ? scenePaused(content, job) : ''}${drawingFor(job) ? `<p class="busy-note">Drawing its scenes now: ${d.current} of ${d.total} drawn. Stop it in step 3 above.</p>` : ''}<small>Attempt ${job.attempts}/3${job.picture?.tokens ? ` · ${job.picture.tokens.toLocaleString()} tokens` : job.redesign?.tokens ? ` · ${job.redesign.tokens.toLocaleString()} tokens` : job.usage?.total ? ` · ${job.usage.total.toLocaleString()} tokens${sceneTokenSplit(job)}` : ''}${job.error ? ` · ${esc(job.error)}` : ''}${job.quality?.warnings?.length ? ` · ${esc(job.quality.warnings[0])}` : ''}</small></div><span class="row-end">${['failed', 'interrupted', 'quality_failed', 'blocked_budget', 'usage_unknown', 'stale', 'budget_violation'].includes(job.status) && job.attempts < 3 ? action('Retry deliberately', 'scene-plan-retry', job.id, 'text-button') : ''}${sceneSwitch(content, job)}${job.status === 'blocked_budget' ? action('Raise the channel\'s limit', 'edit-family', content.familyId, 'text-button') : ''}${job.status === 'queued' ? action('Stop', 'scene-plan-stop', job.id, 'text-button danger') : ''}</span></div>`;
  // The job whose plan is being drawn is still in progress (0.86): its row shows the drawing and Clear leaves it.
  const d = content.drawing || {active: 0}, drawingFor = job => d.active > 0 && job.manifestId && job.manifestId === latest?.id;
  const [newest, ...earlier] = content.planJobs, finished = content.planJobs.filter(job => !['queued', 'running', 'paused'].includes(job.status) && !drawingFor(job)).length;
  // Kept open while the page refreshes (0.81: the list closed by itself every 1.5 s while a job ran).
  const fold = `plan-jobs-${content.contentId}`;
  const planJobs = newest ? `${planRow(newest)}${earlier.length ? `<details class="earlier-jobs" data-keep-open="${esc(fold)}" ${keepOpen.has(fold) ? 'open' : ''}><summary>Earlier attempts (${earlier.length})</summary>${earlier.map(planRow).join('')}</details>` : ''}${finished ? `<div class="list-tools"><span class="hint">${finished} finished job${finished === 1 ? '' : 's'} in this list</span>${action('Clear them', 'scene-plan-clear', content.contentId, 'text-button danger')}</div>` : ''}` : '';
  // 0.93 (owner review 2026-11-05: "the Locked inputs tab takes space and is plain"): the script, narration and style
  // fold into one line; the storyboard buttons and their progress stay in view.
  const inputsKey = `scene-inputs-${content.contentId}`;
  return `<section class="production-card"><div class="production-card-head"><div><span class="micro-label">STORYBOARD</span><h2>Build the storyboard</h2></div>${badge(inputs.ready ? 'Inputs ready' : 'Blocked', inputs.ready ? 'green' : 'gray')}</div>
    <details class="sound-fold" data-keep-open="${esc(inputsKey)}" ${keepOpen.has(inputsKey) || !inputs.ready ? 'open' : ''}><summary>Locked inputs: script v${content.contentRevision}, narration ${inputs.voice.ready ? sceneClock(inputs.voice.durationSeconds) : 'missing'}, ${inputs.style.ready ? esc(inputs.style.name) : 'no style'}</summary><div class="st-library">
    ${row(content.contentState === 'approved', `Approved script v${content.contentRevision}`, esc(content.title))}
    ${row(inputs.voice.ready, 'Approved narration', inputs.voice.ready ? `${sceneClock(inputs.voice.durationSeconds)} · timing source for every scene` : esc(inputs.voice.blocker || 'Approve a narration in the Voice Room.'))}
    ${row(inputs.style.ready, inputs.style.ready ? `${esc(inputs.style.name)} r${inputs.style.revision}` : 'Family style', inputs.style.ready ? `Sources: ${esc(inputs.sources.map(styleLabel).join(', '))}${sceneDrawing(inputs.style.drawing, content.familyId)}` : esc(inputs.style.blocker || 'Assign a style in Room 03.'))}</div></details>
    ${sceneHowMade(inputs.style, busy ? sceneAiName(busy.provider) : null)}${typeof skillsUsedFold === 'function' ? skillsUsedFold(content.contentId, ['scene.plan', 'motion.template', 'visuals.prompt'], 'Skills used for this storyboard') : ''}
    ${busy ? `<p class="busy-note"><strong>${esc(sceneAiName(busy.provider))} is ${busy.status === 'queued' ? 'about to build' : 'building'} this script's storyboard now.</strong> Its button is off until it finishes. ${sceneAis().length > 1 ? `The other AI's button still works: it asks first, then builds a second storyboard after this one.` : ''} Stop it below if you want to keep your tokens.</p>` : ''}
    ${built ? `<p class="built-note"><strong>The storyboard is built:</strong> revision ${built.revision}, ${built.sceneCount} scenes, ${built.shotCount} shots. Building it again makes a new revision; this one stays in the history.</p>` : ''}
    <div class="card-actions">${inputs.ready ? action('Rough free draft (test only)', 'scene-plan-rules', content.contentId, 'secondary') + sceneAis().map(ai => busy && sceneAiName(busy.provider) === ai.name ? `<button type="button" class="button primary" disabled title="${esc(ai.name)} is building this storyboard now">${esc(ai.name)} is building…</button>` : action(built ? `Build again with ${ai.name}` : `Storyboard with ${ai.name}`, 'scene-plan-claude', `${content.contentId}|${ai.id}`, built ? 'secondary' : 'primary')).join('') : ''}${inputs.ready && !sceneAis().length ? '<span class="muted">Connect and test Claude or ChatGPT in Connections to build the storyboard.</span>' : ''}</div>
    ${typeof liveFor === 'function' ? liveFor(content.contentId, 'scene').map(item => liveBlock(item, {actions: item.stoppable ? `<div class="live-actions">${action('Stop', 'scene-plan-stop', item.id, 'secondary stop-button')}<span class="hint">Stops ${esc(item.who || 'the AI')} at once. Everything finished is kept; Resume goes on from there.</span></div>` : ''})).join('') : ''}${planJobs ? `<div class="history-list">${planJobs}</div>` : ''}</section>`;
}
// How this style makes the scenes (0.98, owner question 2026-11-10: "I chose Motion Graphics with HTML render; when
// ChatGPT builds, is it building with HTML render or painting the scenes?"): the steps, who does each and how.
const FINISH_SAID = {motion: 'motion graphics (kinetic type, numbers, diagrams)', anime: 'HTML render (cel anime: painted cels, drawings swapped on twos)', collage: 'paper collage', pixel: 'pixel art', mix: 'a mix of finishes, one per scene'};
function sceneHowMade(style, ai) {
  if (!style?.ready) return '';
  const who = ai || 'the AI you press', key = `how-made-${style.revisionId}`;
  const steps = style.engine === 'atelier' ? [
    `<b>The story map and the storyboard</b>: ${esc(who)} plans every scene and every shot from your narration. In this style every shot is a <i>designed shot</i>, not a painting.`,
    `<b>The continuity check</b>: ${esc(who)} checks each shot against its own words and its neighbours.`,
    `<b>Writing each shot as HTML</b>: ${esc(who)} writes one HTML animation per shot, finish: ${esc(FINISH_SAID[style.atelier?.finish] || FINISH_SAID.motion)}${style.atelier?.finish === 'mix' && style.atelier.finishes?.length ? ` (${esc(style.atelier.finishes.map(item => FINISH_SAID[item] || item).join(', '))})` : ''}. The program's safety check reads every line before it is kept (no internet, no randomness, no outside files). The live view says "Writing S03B as an HTML render (4 of 22)".`,
    '<b>Draw the scenes</b>: this PC\'s own browser plays each HTML animation frame by frame and turns it into video. That is the HTML render; ChatGPT\'s picture painting is not used for these shots.',
  ] : [
    `<b>The storyboard</b>: ${esc(who)} plans every scene and shot from your narration, in the ${esc(style.drawing ? 'drawn' : 'footage')} engine of this style.`,
    `<b>The continuity check</b>: ${esc(who)} checks each shot against its words.`,
    `<b>Pictures</b>: shots that need a detailed picture get one from the picture maker (ChatGPT paints, or Claude draws vector art), in this look's own rules.`,
    '<b>Draw the scenes</b>: this PC\'s browser draws every shot frame by frame into video.',
  ];
  return `<details class="sound-fold" data-keep-open="${esc(key)}" ${keepOpen.has(key) ? 'open' : ''}><summary>How this style makes the scenes</summary><ol class="how-made">${steps.map(step => `<li>${step}</li>`).join('')}</ol><p class="hint">Every step is directed by the skills chosen for it; "Skills used" below lists them for this video.</p></details>`;
}
// What the drawings will look like (0.82, owner review 2026-11-02: "I chose classic cartoon and storybook but it made me
// hand-drawn scenes"): the ticked looks, the drawing hand and the film looks, said before anything is drawn.
function sceneDrawing(d, familyId) {
  if (!d) return '';
  const looks = d.looks?.length ? d.looks : d.boards?.length ? d.boards : d.designs?.length ? d.designs : [d.look || d.board || d.design].filter(Boolean);
  const mixed = looks.length > 1 || [d.look, d.board, d.design].includes('mix');
  const films = d.films?.length ? d.films.map(filmLabel).join(', ') : d.film && !['none', 'choose'].includes(d.film) ? filmLabel(d.film) : null;
  const parts = [`${looks.map(styleLabel).join(' + ') || 'the engine\'s own look'}${mixed ? ' (the AI picks one per scene)' : ''}`, d.hand ? 'a hand draws every scene' : 'no drawing hand', ...(films ? [`film look: ${films}`] : []), ...(d.pictureType && d.pictureType !== 'cartoon' ? [`pictures: ${d.pictureType}`] : [])];
  const handWarn = d.hand && !looks.includes('whiteboard') ? `<br><span class="inline-warning">A hand draws every scene line by line, so the scenes look hand-drawn even in ${esc(looks.map(styleLabel).join(' and '))}. ${action('Change it in this channel\'s editing style', 'family-style', familyId, 'text-button')}</span>` : '';
  return `<br>Draws: ${esc(parts.join(' · '))}${handWarn}`;
}
// What a redraw job is for (0.82.2): the long-shot fix's new shots, a change asked in words, or undesigned shots.
const sceneRedrawName = redraw => { const n = redraw.count, s = n === 1 ? '' : 's'; return redraw.purpose === 'redo' ? `Redoing ${n} revoked shot${s}` : redraw.purpose === 'long' ? `Drawing ${n} new shot${s} (long-shot fix)` : redraw.purpose === 'change' ? `Changing ${redraw.label || 'a shot'} as you asked` : `Drawings for ${n} undesigned shot${s}`; };
// A paused storyboard (0.81): why it paused, what is kept, and the buttons that go on from there.
function scenePaused(content, job) {
  const kept = [job.progress?.map ? 'the story map' : '', job.parts.total > 1 && job.parts.done ? `${job.parts.done} of ${job.parts.total} parts` : '', job.progress?.review === 'done' ? (job.redraw ? 'the new drawings' : 'the continuity check') : job.progress?.review && job.progress.review !== 'not yet' ? `the continuity check (${job.progress.review})` : '', job.progress?.pictures ? `${job.progress.pictures} picture${job.progress.pictures === 1 ? '' : 's'}` : '', job.progress?.frames ? `${job.progress.frames} designed shot${job.progress.frames === 1 ? '' : 's'}` : ''].filter(Boolean);
  const why = {owner: 'You stopped it.', network: 'The internet connection was lost.', limit: 'The AI plan reached its usage limit.', closed: 'The program was closed while it was working.', error: 'A problem in the program stopped it (not your internet, not your AI plan).'}[job.pause?.kind] || 'It is paused.';
  const other = sceneAis().find(ai => ai.name !== sceneAiName(job.provider)), self = sceneAis().find(ai => ai.name === sceneAiName(job.provider));
  const buttons = [self || !other ? action('Resume', 'scene-plan-resume', job.id, 'primary') : '', other && !job.picture && !job.redesign && !job.redraw ? action(`Resume with ${other.name}`, 'scene-plan-resume', `${job.id}|${other.id}`, 'secondary') : '', job.pause?.kind === 'network' ? action('Check my connection', 'scene-net-check', job.provider || 'claude-code', 'text-button') : ''].join('');
  return `<div class="paused-box"><p><strong>${why}</strong>${job.pause?.kind !== 'owner' && job.pause?.message ? ` ${esc(job.pause.message)}` : ''} ${kept.length ? `Kept: ${esc(kept.join(', '))}. Resume goes on from the next step; nothing finished is paid for again.` : 'Nothing was finished yet; Resume starts it from the beginning.'}${job.pause?.kind === 'network' ? (job.pause.waitUntil ? ` The program is waiting for the internet: it checks every 30 seconds and goes on by itself when the connection is back (until ${esc(new Date(job.pause.waitUntil).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}))}). You can also press Resume.` : ' It waited for the connection; press Resume when your internet works again.') : job.pause?.kind === 'limit' ? ' Resume when the limit resets, or go on with the other AI.' : ''}</p><div class="card-actions">${buttons}</div></div>`;
}
// A plan that failed (a usage limit, no connection, a bad answer) can go on with the other connected AI: the owner's
// click is the permission, nothing switches by itself (0.79).
function sceneSwitch(content, job) {
  if (!['failed', 'interrupted', 'quality_failed', 'usage_unknown'].includes(job.status) || job.picture || job.redesign || job.redraw) return '';
  const other = sceneAis().find(ai => ai.name !== sceneAiName(job.provider));
  return other ? action(`Continue with ${other.name}`, 'scene-plan-claude', `${content.contentId}|${other.id}`, 'text-button') : '';
}
function sceneEmptyPlan(content) {
  return `<section class="production-card"><div class="production-empty compact"><h3>No scene plan yet</h3><p>${content.inputs.ready ? 'Build the storyboard with the AI you prefer (the real planner: it builds every scene and shot from the story). The rough free draft is only for testing. You can edit every scene and shot afterwards.' : esc(content.inputs.blockers.join(' '))}</p></div></section>`;
}

// 0.95: the owner's skills reach the planner as numbered directives (D1 ...), and scene directions name the codes they
// follow; this key says which skill each code is and ticks the ones the AI cited.
function sceneDirectives(content) {
  const used = (state.skills?.usage || []).find(item => item.contentId === content.contentId && item.taskKey === 'scene.plan');
  if (!used?.skillIds?.length) return '';
  const title = id => (typeof skillsAll === 'function' ? skillsAll().find(item => item.id === id)?.title : null) || id;
  const followed = used.applied || [];
  return `<details class="scene-history" data-keep-open="directives-${esc(content.contentId)}"><summary>Skills that directed this storyboard · ${used.applied ? `${followed.length} of ${used.skillIds.length} cited by the AI` : `${used.skillIds.length} given`}</summary><p class="hint">The program gave the AI these as numbered directives in its instructions. A scene's direction names the codes it follows, for example "D2, D5: …".</p><ul class="intel-list">${used.skillIds.map((id, k) => `<li>${followed.includes(id) ? '✓' : '·'} <b>D${k + 1}</b> ${esc(title(id))} <code>${esc(id)}</code></li>`).join('')}</ul></details>`;
}
function scenePlanCard(content, manifest) {
  const statusColor = {approved: 'green', draft: 'orange', rejected: 'gray', superseded: 'gray'}[manifest.status] || 'gray';
  const history = content.manifests.map(item => `<li><b>r${item.revision}</b> ${esc(item.status)} · ${esc(item.source)} · ${esc(item.changeNote)} · ${esc(item.createdBy)} · ${esc(date(item.createdAt))}${item.review ? ` · ${esc(item.review.decision)} by ${esc(item.review.reviewer)}` : ''}</li>`).join('');
  const actions = [
    !manifest.scope.current && manifest.contentRevision === content.contentRevision ? action('Refresh for current narration and style', 'scene-refresh', manifest.id, 'primary') : '',
    action('Visual settings', 'scene-settings', content.familyId, 'secondary'),
  ].join('');
  return `<section class="production-card"><div class="production-card-head"><div><span class="micro-label">SCENE PLAN · REVISION ${manifest.revision}</span><h2>${esc(content.title)}</h2></div><div class="row-end">${badge(manifest.status === 'approved' ? 'Plan approved' : manifest.status, statusColor)}${badge(manifest.source === 'claude' ? 'Claude' : manifest.source === 'hermes' ? 'Earlier AI planner' : manifest.source === 'rules' ? 'Rough free draft' : manifest.source === 'merge' ? 'Merged storyboard' : manifest.source === 'choice' ? 'Earlier storyboard again' : manifest.source === 'rules-update' ? 'Updated to today\'s rules' : 'Edited')}</div></div>
    ${!manifest.scope.current ? `<p class="inline-warning">${esc(manifest.scope.issues.join(' '))}</p>` : ''}
    ${manifest.issues.length ? `<div class="checks" id="scene-problems"><strong>Fix before approval</strong><ul>${manifest.issues.map(item => `<li>${sceneLinked(item)}</li>`).join('')}</ul>${manifest.scope.current && manifest.issues.some(item => SCENE_LONG.test(item)) ? `<p class="hint">Shots that hold longer than the video's pace: fix them with "Fix with Claude" or "Fix with ChatGPT" in step 2 of ${'<button type="button" class="scene-jump" data-action="scene-goto-board" data-id="road">What happens next</button>'} at the top of this room. The program splits each long shot and the AI draws only the new shots; everything else keeps its drawing.</p>` : ''}</div>` : ''}
    ${sceneDirectives(content)}${manifest.warnings.length ? `<details class="scene-warnings"><summary>${manifest.warnings.length} warning${manifest.warnings.length === 1 ? '' : 's'}</summary><ul class="intel-list">${manifest.warnings.map(item => `<li>${esc(item)}</li>`).join('')}</ul></details>` : ''}
    ${sceneStory(manifest.plan)}${sceneUndesigned(manifest)}${sceneDirection(manifest.plan)}${sceneFixes(manifest.plan)}
    ${manifest.plan.summary ? `<p class="muted">${esc(manifest.plan.summary)}</p>` : ''}
    ${manifest.plan.design ? sceneDesignLine(manifest.plan.design) : ''}
    ${manifest.plan.cast?.length ? `<p class="muted"><strong>Cast:</strong> ${manifest.plan.cast.map(member => esc(`${member.name}${member.role ? ` (${member.role})` : ''}`)).join(' · ')}</p>` : ''}
    <p class="hint">${esc(manifest.plan.timing.note)} Every edit creates a new revision; untouched shots keep their IDs and visuals.</p>
    <div class="card-actions">${actions}</div>
    <details class="scene-history"><summary>Revision history (${content.manifests.length})</summary><ul class="intel-list">${history}</ul></details>
    <h3 class="board-title" id="scene-board">The storyboard · ${manifest.sceneCount} scenes · ${manifest.shotCount} shots</h3>
    <div class="scene-board">${manifest.plan.scenes.map(scene => sceneRow(content, manifest, scene)).join('')}</div></section>`;
}
function sceneRow(content, manifest, scene) {
  const editable = manifest.scope.current;
  const last = manifest.plan.scenes.at(-1).id === scene.id;
  return `<article class="scene-row" id="scene-row-${esc(scene.label)}"><div class="scene-head"><span class="room-number">${esc(scene.label)}</span><div><strong>${esc(SCENE_PURPOSE[scene.purpose] || scene.purpose)} · ${sceneClock(scene.startSeconds)}–${sceneClock(scene.startSeconds + scene.durationSeconds)}</strong><small>${sceneSeconds(scene.durationSeconds)} · sentence${scene.sentenceStart === scene.sentenceEnd ? ` ${scene.sentenceStart}` : `s ${scene.sentenceStart}–${scene.sentenceEnd}`} · ${scene.shots.length} shot${scene.shots.length === 1 ? '' : 's'}</small></div>
      ${editable ? `<div class="scene-tools">${action('Edit', 'scene-edit', scene.id, 'text-button')}${scene.sentenceEnd > scene.sentenceStart ? action('Split', 'scene-split', scene.id, 'text-button') : ''}${!last ? action('Merge next', 'scene-merge', scene.id, 'text-button') : ''}${scene.shots.length < 8 ? action('+ Shot', 'scene-add-shot', scene.id, 'text-button') : ''}</div>` : ''}</div>
    <p class="scene-narration">${esc(sceneNarration(manifest, scene))}</p>
    ${scene.direction || scene.onScreenText ? `<p class="scene-direction">${scene.direction ? `<span>Direction:</span> ${esc(scene.direction)} ` : ''}${scene.onScreenText ? `<span>On screen:</span> “${esc(scene.onScreenText)}”` : ''}</p>` : ''}
    <div class="shot-grid">${scene.shots.map(shot => sceneShotCard(content, manifest, scene, shot)).join('')}</div></article>`;
}
function sceneShotCard(content, manifest, scene, shot) {
  const selection = content.selections[shot.id], asset = selection && sceneAsset(content, selection.assetId);
  const jobs = content.jobs.filter(job => job.shotId === shot.id), active = jobs.find(job => ['queued', 'running'].includes(job.status));
  const failed = !active && jobs.find(job => ['failed', 'interrupted', 'blocked_quota', 'blocked_budget', 'stale'].includes(job.status) && job.updatedAt >= (selection?.selectedAt || ''));
  const count = content.candidateCounts[shot.id] || 0, editable = manifest.scope.current;
  // 0.94: the shot a change is drawing again says so on the board, so it is clear which shot is being worked on.
  const redraw = content.planJobs.find(job => ['queued', 'running', 'paused'].includes(job.status) && job.redraw?.labels?.includes(shot.label));
  const media = asset?.thumb ? `<img src="${esc(asset.thumb)}" alt="Selected visual for ${esc(shot.label)}" loading="lazy">` : `<span class="shot-empty">${active ? (active.kind === 'search' ? 'Searching…' : active.kind === 'import' ? 'Downloading…' : active.kind === 'draw' ? 'Drawing…' : 'Generating…') : 'No visual yet'}</span>`;
  return `<div class="shot-card ${asset ? 'filled' : ''}"><div class="shot-media">${media}${asset ? `<span class="shot-origin">${asset.origin === 'ai' ? 'AI' : asset.origin === 'drawn' ? 'Drawn' : esc(asset.provider)}</span>` : ''}${redraw ? `<span class="shot-redraw ${redraw.status === 'paused' ? 'paused' : ''}">${redraw.status === 'paused' ? 'Redraw paused' : 'Being drawn again'}</span>` : ''}</div>
    <div class="shot-body"><div class="card-top"><strong>${esc(shot.label)}</strong><small>${sceneSeconds(shot.durationSeconds)}</small></div>
      <small class="shot-source">${esc(styleLabel(shot.source))} · ${esc(styleLabel(shot.motion))}</small>
      <p class="shot-brief">${esc(shot.source === 'ai-image' ? shot.prompt : shot.source === 'generated-graphics' ? (shot.frame ? sceneFrameSummary(shot.frame) : sceneSketchSummary(shot.sketch, manifest.plan.cast)) : shot.query)}</p>${shot.cue ? `<small class="muted">Starts on “${esc(shot.cue)}”</small>` : ''}
      ${failed ? `<p class="inline-warning">${esc(failed.error || failed.status)}</p>` : ''}
      <div class="shot-actions">${editable ? action(asset ? 'Change' : 'Find visual', 'scene-shot-open', shot.id, asset ? 'secondary' : 'primary') + action('Edit', 'scene-shot-edit', shot.id, 'text-button') + (shot.frame && shot.source === 'generated-graphics' ? action('Redesign', 'scene-frame-redesign', shot.id, 'text-button') : '') + (shot.sketch && shot.source === 'generated-graphics' ? action('Change with words', 'scene-shot-change', shot.id, 'text-button') + action(shot.sketch.elements.some(item => item.kind === 'picture' && item.art) ? 'New picture' : 'Paid picture', 'scene-shot-picture', shot.id, 'text-button') : '') + (scene.shots.length > 1 ? action('Remove', 'scene-shot-remove', shot.id, 'text-button danger') : '') : ''}${count ? `<small class="muted">${count} result${count === 1 ? '' : 's'}</small>` : ''}</div></div></div>`;
}

// What an atelier shot (designed by Claude) shows, in words: "Motion graphics · dataviz-countup · the number · 3 beats".
function sceneFrameSummary(frame) {
  return [frame.shot ? `HTML render (${frame.shot})` : 'Motion graphics', frame.blueprint !== 'compose' ? `${frame.blueprint} (${frame.posture})` : 'composed freely', frame.focal, `${frame.beats.length} beat${frame.beats.length === 1 ? '' : 's'}`, frame.html ? 'designed' : 'not designed yet: drawn from its words'].filter(Boolean).join(' · ');
}
// What a drawn shot shows, in words: "Stickman · storm set · Max (scared, cower) · bolt · “5x hotter” · flash".
function sceneSketchSummary(sketch, cast = []) {
  if (!sketch) return 'Drawn from the narration';
  const name = item => cast.find(member => member.id === item.who)?.name || 'figure';
  const parts = sketch.elements.map(item => item.kind === 'figure' ? `${name(item)} (${item.expression || 'neutral'}, ${item.pose})` : item.kind === 'prop' ? item.prop : item.kind === 'arrow' ? 'arrow' : item.kind === 'fx' ? item.effect : item.kind === 'picture' ? `${item.art ? 'picture' : 'picture (not drawn yet)'}: ${item.describe}` : `“${item.text}”`);
  return [sketch.engine ? styleLabel(sketch.engine) : null, sketch.set && sketch.set !== 'none' ? `${sketch.set} set` : null, ...parts].filter(Boolean).join(' · ');
}
function sceneBatchCard(content, manifest, family) {
  const settings = state.scenes.settings[family.id], shots = sceneShots(manifest);
  const stockEmpty = shots.filter(shot => (shot.source.startsWith('stock-') || shot.source === 'archival-public-domain') && !content.selections[shot.id]).length;
  const aiEmpty = shots.filter(shot => shot.source === 'ai-image' && !content.selections[shot.id]).length;
  const drawn = shots.filter(shot => shot.source === 'generated-graphics').length, drawnEmpty = shots.filter(shot => shot.source === 'generated-graphics' && !content.selections[shot.id]).length;
  const withResults = shots.filter(shot => !content.selections[shot.id] && content.candidateCounts[shot.id]).length;
  const active = sceneActiveJobs(content).length;
  return `<section class="production-card"><div class="production-card-head"><div><span class="micro-label">FILL THE BOARD</span><h2>Batch sourcing</h2></div>${active ? badge(`${active} job${active === 1 ? '' : 's'} running`, 'orange') : ''}</div>
    <p class="hint">Batch actions only touch shots without a visual. You still review every shot and approve the whole board.</p>
    <div class="batch-list">
      <div><strong>${stockEmpty} stock shot${stockEmpty === 1 ? '' : 's'} empty</strong><small>One search each with your first tested stock library (${esc(settings.stockOrder.join(' → '))}).</small>${manifest.scope.current && stockEmpty ? action('Search all', 'scene-search-all', manifest.id, 'secondary') : ''}</div>
      <div><strong>${withResults} empty shot${withResults === 1 ? '' : 's'} with results</strong><small>Downloads the top result for each, with its license evidence.</small>${manifest.scope.current && withResults ? action('Use top results', 'scene-pick-top', manifest.id, 'secondary') : ''}</div>
      ${drawn ? sceneDrawRow(content, manifest) : ''}
      <div><strong>${aiEmpty} AI shot${aiEmpty === 1 ? '' : 's'} empty</strong><small>${manifest.status === 'approved' ? `About ${money(aiEmpty * settings.priceCents[settings.imageQuality])} at ${esc(settings.imageQuality)} quality.` : 'Approve the plan before spending on AI images.'}</small>${manifest.scope.current && aiEmpty && manifest.status === 'approved' ? action('Generate all', 'scene-generate-all', manifest.id, 'secondary') : ''}</div>
    </div></section>`;
}
// Drawing the scenes (0.82, owner review 2026-11-02: the button still said "Draw all scenes" after everything was drawn,
// and there was no Stop): drawn with today's drawing, out of date, not drawn yet; Stop while it draws; "Draw the
// remaining" goes on from where it stopped; "Draw them all again" only when everything is drawn.
function sceneDrawRow(content, manifest) {
  const d = content.drawing || {total: 0, current: 0, outdated: 0, missing: 0, active: 0}, left = d.missing + d.outdated, ok = manifest.scope.current;
  const title = d.active ? `Drawing now: ${d.current} of ${d.total} done, ${d.active} to go` : !left ? `All ${d.total} drawn shots are drawn ✓` : left === d.total && !d.outdated ? `${d.total} drawn shots to draw` : `${left} of ${d.total} drawn shots still to draw${d.outdated ? ` (${d.outdated} out of date: the drawing or the drawing engine changed)` : ''}`;
  return `<div><strong>${title}</strong><small>${ok ? 'Draw and stop from step 3 of "What happens next" above. ' : ''}The program draws each shot itself on this PC. Free; no internet needed. Finished drawings are kept, so it always goes on from where it stopped.</small></div>`;
}
function sceneApprovalCard(content, manifest) {
  const shots = sceneShots(manifest), filled = shots.filter(shot => content.selections[shot.id]).length;
  const current = content.approvals.find(item => item.status === 'approved'), last = content.approvals[0];
  // 0.86 (owner review 2026-11-04): revoked visuals can be deleted for good, or their scenes redone by an AI.
  const revoked = !current && last?.status === 'revoked' && !last.clearedAt ? last : null;
  const revokedBox = revoked ? `<div class="revoked-box"><p class="inline-warning">Last approval revoked: ${esc(last.endReason || '')}</p>
      <div class="card-actions">${manifest.scope.current ? sceneAis().map((ai, k) => action(`Redo the scenes with ${ai.name}`, 'scene-redo-revoked', `${manifest.id}|${ai.id}`, k ? 'secondary' : 'primary')).join('') : ''}${action('Delete the revoked drawings', 'scene-delete-revoked', content.contentId, 'text-button danger')}</div>
      <p class="hint">Redo: the AI draws every scene again, told why you revoked them; then press "Draw the remaining" in step 3. Delete: the revoked drawings leave the program and this PC for good (anything still approved stays, and the skills and your reasons stay).</p></div>` : '';
  const d = content.drawing || {total: 0, current: 0, outdated: 0, missing: 0, active: 0}, canApprove = manifest.status === 'approved' && manifest.scope.current && filled === shots.length && !sceneDrawWait(d);
  return `<section class="production-card"><div class="production-card-head"><div><span class="micro-label">OUTPUT HANDOFF</span><h2>Visual approval</h2></div>${badge(content.handoff.ready ? 'Ready for editing' : 'Blocked', content.handoff.ready ? 'green' : 'gray')}</div>
    <div class="cap-row"><div><strong>${filled} of ${shots.length} shots filled</strong><small>${manifest.status === 'approved' ? 'Plan approved' : 'Approve the plan first'}</small></div><div class="cap-meter">${intelMeter(filled, shots.length || 1, false)}</div></div>
    ${current ? `<div class="handoff-rule"><strong>Approved by ${esc(current.approvedBy)} · ${esc(date(current.approvedAt))}</strong><p>${current.snapshot.shots.length} shots locked by checksum${current.snapshot.disclosureRequired ? ' · AI disclosure required when publishing' : ''}${current.snapshot.warnings.length ? ` · ${current.snapshot.warnings.length} accepted warning(s)` : ''}.</p></div>` : revokedBox || (last && !last.clearedAt ? `<p class="inline-warning">Last approval ${esc(last.status)}: ${esc(last.endReason || '')}</p>` : '')}
    ${!content.handoff.ready ? `<p class="muted">${esc(content.handoff.blocker)}</p>` : ''}
    ${canApprove && !content.handoff.ready ? '<p class="hint">Ready: approve them in step 4 of "What happens next" above.</p>' : !content.handoff.ready && sceneDrawWait(d) ? `<p class="hint">${esc(sceneDrawWait(d))}</p>` : ''}<div class="card-actions">${current ? action('Revoke', 'scene-revoke', current.id, 'text-button danger') : ''}</div></section>`;
}

// ---------------------------------------------------------------- generic dialog
function sceneDialog(kind, title, kicker, body, submitLabel, data = {}) {
  const form = document.getElementById('scene-form');
  form.reset();
  form.dataset.kind = kind;
  form.dataset.payload = JSON.stringify(data);
  document.getElementById('scene-heading').textContent = title;
  document.getElementById('scene-kicker').textContent = kicker;
  document.getElementById('scene-body').innerHTML = body;
  form.querySelector('.form-error').hidden = true;
  form.querySelector('[type=submit]').textContent = submitLabel;
  document.getElementById('scene-dialog').showModal();
}
function sceneFind(shotId) {
  const content = sceneContent(), manifest = sceneLatest(content);
  for (const scene of manifest.plan.scenes) { const shot = scene.shots.find(item => item.id === shotId); if (shot) return {content, manifest, scene, shot}; }
  return {content, manifest, scene: manifest.plan.scenes.find(item => item.id === shotId) || null, shot: null};
}

function sceneAction(command, id, button) {
  const content = sceneContent(), manifest = sceneLatest(content);
  const nameAndNote = `<div class="form-grid">${scenePersonField()}<label>Change note <span class="hint">Optional</span><input name="note" maxlength="300"></label></div>`;
  if (command === 'scene-plan-rules') return sceneDialog('plan-rules', 'Split the narration into scenes', 'FREE · NO PROVIDER CALL · TEST ONLY', `<p class="hint">Groups whole sentences toward the middle of the style's scene length and draws each shot from words it finds in the narration. It does not build scenes from the story (no story characters, places, era or key words on screen), so it is for testing the machinery, not for a video you will publish. For real videos build the storyboard with Claude or ChatGPT.</p><div class="form-grid">${scenePersonField()}</div>`, 'Create plan', {contentId: id});
  if (command === 'scene-plan-claude') {
    // 0.79 (owner review 2026-11-02): neutral words, the AI the owner clicked, and who makes the pictures.
    const [contentId, aiId] = String(id).split('|'), settings = state.scenes.settings[content.familyId], ais = sceneAis(), ai = ais.find(item => item.id === aiId) || ais[0];
    if (!ai) return toast('Connect and test Claude or ChatGPT in Connections first.', true);
    const team = state.ai?.team, roles = team?.roles || {}, both = ais.length > 1;
    const picturesBy = team?.pictures ? sceneAiName(team.pictures.provider) : ai.name;
    const active = content.planJobs.find(job => ['queued', 'running'].includes(job.status));
    const paused = content.planJobs.find(job => job.status === 'paused' && !job.picture && !job.redesign && !job.redraw);
    const warn = (paused && !active ? `<p class="strong-warning">A paused storyboard by ${esc(sceneAiName(paused.provider))} already keeps finished work for this script. To save tokens, close this window and press Resume on it instead of starting a new one.</p>` : '') + (active ? `<p class="strong-warning">${esc(sceneAiName(active.provider))} is already building this script's storyboard. A second one with ${esc(ai.name)} starts when that one has finished; the newer one becomes the plan you see and the other stays in its history.</p><label class="checkbox-label"><input type="checkbox" name="also" required>Yes, also build this storyboard with ${esc(ai.name)}.</label>` : '');
    // 0.86 (owner request 2026-11-04): building again is confirmed, and the storyboard there is is kept (to choose or merge
    // afterwards) or replaced (its approved visuals are revoked).
    const before = sceneLatest(content), rebuilt = before && before.source !== 'rules' ? before : null, approvedNow = content.approvals.some(item => item.status === 'approved');
    const again = rebuilt ? `<div class="strong-warning"><p><strong>You already have a storyboard:</strong> revision ${rebuilt.revision}, ${rebuilt.sceneCount} scenes, ${rebuilt.shotCount} shots. This builds a new one from scratch.</p>
      <label class="check"><input type="radio" name="previous" value="keep" checked> Keep the one I have. When the new one is built I choose: use the new one, go back to this one, or merge the best scenes of both. Nothing of it is deleted.</label>
      <label class="check"><input type="radio" name="previous" value="revoke"> Replace it. ${approvedNow ? 'Its approved visuals are revoked now' : 'The new one takes its place'}; its drawings can then be deleted.</label>
      <label class="check"><input type="checkbox" name="fresh" required> Yes, I want a new storyboard (not a mistaken click).</label></div>` : '';
    return sceneDialog('plan-claude', `${rebuilt ? 'Build the storyboard again' : 'Build the storyboard'} with ${ai.name}`, `${ai.name.toUpperCase()} · ${ai.provider === 'claude' ? 'API TOKENS' : 'YOUR PLAN\'S ALLOWANCE'}`, `<p class="hint"><strong>The storyboard</strong> is the plan of the whole video: ${esc(ai.name)} reads the approved narration sentence by sentence, the style and any approved competitor techniques, and splits it into scenes and shots. For every shot it decides what is on screen (who, where, the key words, the drawing, the camera and the cut), timed on the narration's real words.</p><p class="hint"><strong>The visuals</strong> come next in the same job: drawn shots are drawn by the program's own engine for free, and the shots that deserve a detailed picture or painting get one from ${both ? 'the AI chosen below' : esc(picturesBy)}. Up to ${settings.plannerTokenLimit.toLocaleString()} tokens are held from this channel's own monthly AI limit in the program while it runs (not your Claude or ChatGPT plan; what is not used is given back). Nothing is used in the video until you approve the visuals.</p>${warn}${again}<div class="form-grid">${both ? `<label class="full">Detailed pictures inside the shots are made by<select name="pictures"><option value="chatgpt" ${roles.pictures !== 'claude' ? 'selected' : ''}>ChatGPT: painted, detailed images</option><option value="claude" ${roles.pictures === 'claude' ? 'selected' : ''}>Claude: clean vector drawings</option></select><span class="hint">The storyboard and the pictures are two jobs: ${esc(ai.name)} plans every scene, and the AI chosen here makes the detailed pictures inside them (it can be the same AI or the other one). This is also the AI team's picture setting for later videos.</span></label>` : ''}${scenePersonField()}</div>`, `${rebuilt ? 'Build again' : 'Build'} with ${ai.name}`, {contentId: contentId || id, connector: ai.id, rebuilt: rebuilt ? 1 : 0});
  }

  if (command === 'scene-plan-stop') {
    if (!confirm('Stop this storyboard now? Everything already finished is kept, and Resume goes on from there. The answer the AI is writing right now is dropped (it may still count against your plan).')) return;
    if (button) button.disabled = true;
    return api(`/api/scene-plan-jobs/${id}/stop`, {}).then(result => { toast(result.stopping ? 'Stopping… the AI is being ended now.' : 'Stopped.'); return refresh(); }).catch(error => toast(error.message, true)).finally(() => { if (button) button.disabled = false; });
  }
  if (command === 'scene-plan-resume') {
    const [jobId, aiId] = String(id).split('|');
    if (button) button.disabled = true;
    return api(`/api/scene-plan-jobs/${jobId}/resume`, aiId ? {connector: sceneConnectorRef(aiId)} : {}).then(job => { toast(job?.already ? 'It is already going on: the program resumed it by itself when the internet came back.' : 'Resumed: it goes on from the last finished step.'); return refresh(); }).catch(error => toast(error.message, true)).finally(() => { if (button) button.disabled = false; });
  }
  if (command === 'scene-net-check') {
    if (button) button.disabled = true;
    return api(`/api/net-check?provider=${encodeURIComponent(id)}`, undefined, 'GET').then(result => toast(result.connected ? `Your internet works: this PC reached ${result.host} in ${result.ms} ms. Press Resume.` : result.found === false ? `No internet: this PC cannot find ${result.host}. Check your Wi-Fi or cable, then try again.` : `This PC found ${result.host} but could not connect to it. The connection may be weak or blocked; try again in a minute.`, !result.connected)).catch(error => toast(error.message, true)).finally(() => { if (button) button.disabled = false; });
  }
  if (command === 'scene-plan-clear') {
    if (!confirm('Clear the finished storyboard jobs of this script from the list? Plans already made stay, and nothing is deleted from the records.')) return;
    return api(`/api/content/${id}/scene-plan-jobs/clear`, {}).then(result => { toast(`${result.cleared} job${result.cleared === 1 ? '' : 's'} cleared.`); return refresh(); }).catch(error => toast(error.message, true));
  }
  if (command === 'scene-plan-retry' || command === 'scene-job-retry') {
    const job = command === 'scene-plan-retry' ? content.planJobs.find(item => item.id === id) : content.jobs.find(item => item.id === id);
    const unknown = job?.status === 'interrupted';
    if (unknown && !confirm('The last attempt was interrupted, so the provider may already have charged it. Deliberately retry?')) return;
    if (button) button.disabled = true;
    return api(command === 'scene-plan-retry' ? `/api/scene-plan-jobs/${id}/retry` : `/api/visual-jobs/${id}/retry`, {confirmInterrupted: unknown}).then(refresh).then(() => { toast('Deliberately requeued.'); if (sceneShot) sceneShotRender(); }).catch(error => toast(error.message, true)).finally(() => { if (button) button.disabled = false; });
  }
  if (command === 'scene-settings') {
    const settings = state.scenes.settings[id], quota = state.scenes.quota.settings;
    return sceneDialog('settings', 'Visual settings', 'BUDGETS AND PROVIDERS', `<div class="form-grid">
      <label>Monthly AI image budget (USD)<input name="budget" type="number" min="0" max="10000" step="0.01" required value="${(settings.monthlyBudgetCents / 100).toFixed(2)}"></label>
      <label>OpenAI image model<select name="imageModel">${state.scenes.imageModels.map(model => `<option ${model === settings.imageModel ? 'selected' : ''}>${esc(model)}</option>`).join('')}</select></label>
      <label>Default quality<select name="imageQuality">${['low', 'medium', 'high'].map(item => `<option ${item === settings.imageQuality ? 'selected' : ''}>${item}</option>`).join('')}</select></label>
      <label>Image format<select name="imageFormat">${['png', 'jpeg'].map(item => `<option ${item === settings.imageFormat ? 'selected' : ''}>${item}</option>`).join('')}</select></label>
      <label>Price per low image (cents)<input name="low" type="number" min="0" max="10000" step="0.01" required value="${settings.priceCents.low}"></label>
      <label>Price per medium image (cents)<input name="medium" type="number" min="0" max="10000" step="0.01" required value="${settings.priceCents.medium}"></label>
      <label>Price per high image (cents)<input name="high" type="number" min="0" max="10000" step="0.01" required value="${settings.priceCents.high}"></label>
      <label>Stock library order<select name="stockOrder"><option value="pexels,pixabay" ${settings.stockOrder[0] === 'pexels' ? 'selected' : ''}>Pexels first, then Pixabay</option><option value="pixabay,pexels" ${settings.stockOrder[0] === 'pixabay' ? 'selected' : ''}>Pixabay first, then Pexels</option></select></label>
      <label>Results per search<input name="perSearch" type="number" min="3" max="30" required value="${settings.perSearch}"></label>
      <label>Scene planner token limit<input name="plannerTokenLimit" type="number" min="8000" max="120000" step="1000" required value="${settings.plannerTokenLimit}"></label>
      <label class="check"><input name="continuityReview" type="checkbox" ${settings.continuityReview !== false ? 'checked' : ''}> Continuity review: Claude checks every drawn shot against its own words and its neighbours, and redraws what does not fit (one more answer per part)</label>
      <label>Continuity review token limit (per answer)<input name="reviewTokenLimit" type="number" min="20000" max="200000" step="1000" required value="${settings.reviewTokenLimit || 70000}"></label>
      <label class="check"><input name="composeFrames" type="checkbox" ${settings.composeFrames !== false ? 'checked' : ''}> Motion Graphics shots: Claude designs the shots the plan marks for the Motion Graphics engine (kinetic type, numbers, diagrams, metaphors, or the HTML render of anime), one answer per shot, each reserved on its own</label>
      <label>Motion Graphics shot token limit (per shot)<input name="composeTokenLimit" type="number" min="12000" max="150000" step="1000" required value="${settings.composeTokenLimit || 40000}"></label>
      <label>Designed shots per minute <span class="hint">When atelier is not the main look; each costs about 15,000 tokens; 0 turns them off</span><input name="designedPerMinute" type="number" min="0" max="10" step="1" required value="${settings.designedPerMinute ?? 2}"></label>
      <label>Detailed pictures per minute, at most <span class="hint">Quality first: a ceiling, not a target. The storyboard gives a detailed picture to every shot that needs one and draws free only what looks just as good drawn (words, numbers, charts, maps, diagrams); each picture uses the picture AI's tokens or plan allowance; 0 turns them off</span><input name="picturesPerMinute" type="number" min="0" max="20" step="1" required value="${settings.picturesPerMinute ?? 12}"></label>
      <label>Picture token limit (per picture)<input name="pictureTokenLimit" type="number" min="12000" max="120000" step="1000" required value="${settings.pictureTokenLimit || 40000}"></label>
      <label>Natural paintings per minute <span class="hint">For styles with the Natural or Mix picture type: realistic scenes ChatGPT paints (shots of one scene in one place share one); each reserves about 42,000 tokens with its art-director check until it settles</span><input name="naturalPerMinute" type="number" min="0" max="30" step="1" required value="${settings.naturalPerMinute ?? 15}"></label>
      <label class="check"><input name="storyMap" type="checkbox" ${settings.storyMap !== false ? 'checked' : ''}> Story director: for a long script, Claude first reads the whole script and decides the chapters, the hooks and which engine carries each part (one answer)</label>
      <label>Pexels requests per hour<input name="pexelsCap" type="number" min="0" max="200" required value="${quota.pexelsHourlyRequestCap}"><span class="hint">Pexels allows 200/hour by default.</span></label>
      <label>Pixabay requests per hour<input name="pixabayCap" type="number" min="0" max="6000" required value="${quota.pixabayHourlyRequestCap}"><span class="hint">Pixabay allows 100 per minute.</span></label>
    </div><p class="hint">Prices are your own estimates for the chosen model; check current OpenAI pricing. The budget is reserved before every image and an interrupted image stays counted.</p>`, 'Save settings', {familyId: id, revision: settings.revision, quotaRevision: quota.revision});
  }
  if (command === 'scene-review') {
    return sceneDialog('review', `Review plan revision ${manifest.revision}`, 'HUMAN APPROVAL GATE', `<div class="form-grid"><label>Decision<select name="decision"><option value="approve">Approve</option><option value="reject">Reject</option></select></label>${scenePersonField('Reviewer name')}<label class="full">Notes <span class="hint">Required when rejecting</span><input name="notes" maxlength="2000"></label></div>
      <label class="checkbox-label"><input type="checkbox" name="coverageReviewed">Every sentence is covered once, in order, and the scene purposes make sense.</label>
      <label class="checkbox-label"><input type="checkbox" name="directionReviewed">The search words and prompts are original and avoid real people, brands, logos and competitor names.</label>`, 'Record decision', {id});
  }
  if (command === 'scene-update-rules') return sceneDialog('edit', 'Update to today\'s scene rules', 'NEW REVISION · FREE', '<p class="hint">Keeps every scene and shot, and fixes places, clothes and objects to the story\'s world and era. Changed shots are drawn again in step 3.</p>' + nameAndNote, 'Update the storyboard', {manifestId: id, op: 'update-rules'});
  if (command === 'scene-refresh') return sceneDialog('edit', 'Refresh for the current narration and style', 'NEW REVISION', `<p class="hint">Keeps every scene and shot ID (and their visuals), recalculates timing from the current approved narration and re-checks the plan against the current family style.</p>${nameAndNote}`, 'Create revision', {manifestId: id, op: 'refresh-scope'});
  if (command === 'scene-edit') {
    const {scene} = sceneFind(id);
    return sceneDialog('edit', `Edit ${scene.label}`, 'NEW REVISION', `<div class="form-grid"><label>Purpose<select name="purpose">${state.scenes.purposes.map(item => `<option value="${item}" ${item === scene.purpose ? 'selected' : ''}>${esc(SCENE_PURPOSE[item] || item)}</option>`).join('')}</select></label><label>On-screen text <span class="hint">Optional, short</span><input name="onScreenText" maxlength="140" value="${esc(scene.onScreenText)}"></label><label class="full">Direction<textarea name="direction" rows="3" maxlength="600">${esc(scene.direction)}</textarea></label></div>${nameAndNote}`, 'Save as new revision', {manifestId: manifest.id, op: 'update-scene', sceneId: id});
  }
  if (command === 'scene-split') {
    const {scene} = sceneFind(id), options = manifest.plan.sentences.slice(scene.sentenceStart, scene.sentenceEnd);
    return sceneDialog('edit', `Split ${scene.label}`, 'NEW REVISION', `<label>New scene starts at<select name="atSentence">${options.map(item => `<option value="${item.n}">Sentence ${item.n}: ${esc(item.text.slice(0, 90))}</option>`).join('')}</select></label>${nameAndNote}`, 'Split scene', {manifestId: manifest.id, op: 'split-scene', sceneId: id});
  }
  if (command === 'scene-merge') { const {scene} = sceneFind(id); return sceneDialog('edit', `Merge ${scene.label} with the next scene`, 'NEW REVISION', `<p class="hint">Both scenes' shots are kept (up to 8). Remove extra shots afterwards if the plan reports them as too short.</p>${nameAndNote}`, 'Merge scenes', {manifestId: manifest.id, op: 'merge-next', sceneId: id}); }
  if (command === 'scene-add-shot') { const {scene} = sceneFind(id); return sceneDialog('edit', `Add a shot to ${scene.label}`, 'NEW REVISION', `<p class="hint">The new shot copies the last shot's source and search words. Shots split the scene time evenly.</p>${nameAndNote}`, 'Add shot', {manifestId: manifest.id, op: 'add-shot', sceneId: id}); }
  if (command === 'scene-shot-remove') { const {shot} = sceneFind(id); return sceneDialog('edit', `Remove ${shot.label}`, 'NEW REVISION', `<p class="hint">The other shots keep their IDs and visuals.</p>${nameAndNote}`, 'Remove shot', {manifestId: manifest.id, op: 'remove-shot', shotId: id}); }
  if (command === 'scene-redraw') {
    const settings = state.scenes.settings[content.familyId];
    return sceneDialog('redraw', 'Draw the undesigned shots', 'YOUR AI · ONE ANSWER PER GROUP OF SCENES', `<p class="hint">Claude gives each shot that was planned as a designed shot, but not designed, a real drawing in the engine that suits its words (motion graphics for numbers and lists, stickman for people, hand-drawn for processes and places). One answer per group of eight scenes, up to ${(settings.reviewTokenLimit || 70000).toLocaleString()} tokens each. Every other shot keeps its drawing and its visual; the result is a new plan revision for you to approve.</p><div class="form-grid"><label>Which AI<select name="connector">${sceneConnectorOptions('ai')}</select></label>${scenePersonField()}</div>`, 'Draw them', {manifestId: id});
  }
  if (command === 'scene-frame-redesign') {
    const {shot} = sceneFind(id), settings = state.scenes.settings[content.familyId];
    return sceneDialog('redesign', `Redesign ${shot.label}`, 'YOUR AI · ONE SHOT', `<p class="hint">Claude designs this one shot again, in the video's art direction, and the program checks it the same way. One answer, up to ${(settings.composeTokenLimit || 40000).toLocaleString()} tokens. Every other shot keeps its design and its visual. If the new design fails its checks, the current one stays.</p><div class="form-grid"><label class="full">What should change <span class="hint">Optional, the brief Claude reads</span><input name="reason" maxlength="300" placeholder="e.g. it opens on an almost black frame; show the stage from the start"></label><label>Which AI<select name="connector">${sceneConnectorOptions('ai')}</select></label>${scenePersonField()}</div>`, 'Redesign this shot', {manifestId: manifest.id, shotId: id});
  }
  // 0.77 (owner review 2026-10-31): change any drawn shot by saying what should change.
  if (command === 'scene-shot-change') {
    const {shot} = sceneFind(id), settings = state.scenes.settings[content.familyId];
    return sceneDialog('change-shot', `Change ${shot.label}`, 'YOUR AI · ONE SHOT', `<p class="hint">Say what should change and Claude draws this shot again with your words, checked like every drawing. One answer, up to ${(settings.reviewTokenLimit || 70000).toLocaleString()} tokens. Every other shot stays as it is; the result is a new plan revision you approve.</p><div class="form-grid"><label class="full">What should change<textarea name="ask" rows="3" maxlength="500" required placeholder="e.g. show the caveman counting stones on a flat rock, and make him look worried"></textarea></label><label>Which AI<select name="connector">${sceneConnectorOptions('ai')}</select></label>${scenePersonField()}</div>`, 'Change this shot', {manifestId: manifest.id, label: shot.label});
  }
  if (command === 'scene-shot-picture') {
    const {shot} = sceneFind(id), settings = state.scenes.settings[content.familyId];
    return sceneDialog('shot-picture', `Paid picture for ${shot.label}`, 'YOUR AI · ONE PICTURE', `<p class="hint">Claude draws one detailed picture for this shot, and the hand traces it and colours it in. One answer, up to ${(settings.pictureTokenLimit || 40000).toLocaleString()} tokens (paid from your Claude plan). Every other shot keeps its drawing. If the picture fails its checks, this shot keeps its drawing.</p><div class="form-grid"><label class="full">What the picture shows <span class="hint">The subject, what happens, the place and the feeling; no words in the picture</span><textarea name="describe" maxlength="400" required minlength="10" rows="3">${esc(shot.sketch.elements.find(item => item.kind === 'picture')?.describe || '')}</textarea></label><label>Size<select name="size">${['s', 'm', 'l', 'xl'].map(item => `<option ${item === 'l' ? 'selected' : ''}>${item}</option>`).join('')}</select></label><label class="check"><input name="replace" type="checkbox"> The picture replaces the other drawings (the shot's words stay)</label><label>Which AI<select name="connector">${sceneConnectorOptions('ai')}</select></label>${scenePersonField()}</div>`, 'Draw the picture', {manifestId: manifest.id, shotId: id});
  }
  if (command === 'scene-shot-edit') {
    const {shot} = sceneFind(id), spec = sceneSpec(content), moves = spec?.motion.cameraMoves || [shot.motion];
    return sceneDialog('edit', `Edit ${shot.label}`, 'NEW REVISION', `<div class="form-grid"><label>Visual source<select name="source">${content.inputs.sources.map(item => `<option value="${item}" ${item === shot.source ? 'selected' : ''}>${esc(styleLabel(item))}</option>`).join('')}</select></label><label>Camera move<select name="motion">${moves.map(item => `<option value="${item}" ${item === shot.motion ? 'selected' : ''}>${esc(styleLabel(item))}</option>`).join('')}</select></label>
      <label class="full">Stock search words<input name="query" maxlength="100" value="${esc(shot.query)}"></label><label class="full">AI image prompt<textarea name="prompt" rows="3" maxlength="1500">${esc(shot.prompt)}</textarea></label><label class="full">Notes<input name="notes" maxlength="500" value="${esc(shot.notes)}"></label></div>
      ${shot.frame ? '<label class="checkbox-label"><input type="checkbox" name="dropFrame">Drop the atelier design (this shot is then drawn from its words)</label>' : ''}
      ${Object.entries(state.scenes.notExecutable).filter(([source]) => spec?.visuals.sources.includes(source)).map(([source, reason]) => `<p class="hint">${esc(styleLabel(source))}: ${esc(reason)}</p>`).join('')}${nameAndNote}`, 'Save as new revision', {manifestId: manifest.id, op: 'update-shot', shotId: id});
  }
  if (command === 'scene-search-all') {
    const pexels = intelConnectors('pexels'), pixabay = intelConnectors('pixabay'), wikimedia = intelConnectors('wikimedia');
    return sceneDialog('search-all', 'Search stock for every empty shot', 'FREE API · HOURLY CAPS', `<div class="form-grid"><label>Pexels connector<select name="pexels">${sceneConnectorOptions('pexels', true)}</select></label><label>Pixabay connector<select name="pixabay">${sceneConnectorOptions('pixabay', true)}</select></label><label>Archive images (Wikimedia Commons)<select name="wikimedia">${sceneConnectorOptions('wikimedia', true)}</select></label>${scenePersonField()}</div>${!pexels.length && !pixabay.length && !wikimedia.length ? '<p class="inline-warning">Add and test a Pexels, Pixabay or Wikimedia Commons connector in Connections first.</p>' : ''}<p class="hint">Archive shots search Wikimedia Commons: public domain, CC0 and CC BY files only, each with its licence and credit line kept for the description.</p><p class="hint">One request per shot, counted against your hourly caps. Identical searches within 24 hours reuse cached results.</p>`, 'Search', {manifestId: id});
  }
  if (command === 'scene-goto-board' || command === 'scene-goto') {
    const target = command === 'scene-goto' ? document.getElementById(`scene-row-${id}`) : id === 'road' ? document.querySelector('.scene-road') : document.getElementById(id === 'problems' ? 'scene-problems' : 'scene-board');
    if (target) { target.scrollIntoView({behavior: 'smooth', block: 'start'}); target.classList.add('flash'); setTimeout(() => target.classList.remove('flash'), 1600); }
    return;
  }
  if (command === 'scene-draw-stop') {
    if (button) button.disabled = true;
    return api(`/api/scene-manifests/${id}/draw-stop`, {}).then(result => { toast(`Stopped ${result.stopped} waiting drawing${result.stopped === 1 ? '' : 's'}.${result.finishing ? ' The one being drawn now finishes first.' : ''} "Draw the remaining" goes on from here.`); return refresh(); }).catch(error => toast(error.message, true)).finally(() => { if (button) button.disabled = false; });
  }
  if (command === 'scene-draw-again') {
    if (!confirm('Draw every scene again? Every shot is already drawn with today\'s drawing, so this only helps after a change you made outside the plan. It is free and runs on this PC.')) return;
    if (button) button.disabled = true;
    return api(`/api/scene-manifests/${id}/draw-all`, {requestedBy: scenePerson() || 'Owner', again: true}).then(result => { toast(`${result.queued} scene${result.queued === 1 ? '' : 's'} queued for drawing.`); return refresh(); }).catch(error => toast(error.message, true)).finally(() => { if (button) button.disabled = false; });
  }
  if (command === 'scene-fix-long') {
    const [manifestId, aiId] = String(id).split('|'), ai = sceneAis().find(item => item.id === aiId);
    return sceneDialog('fix-long', `Fix the long shots with ${ai?.name || 'the AI'}`, 'NEW SHOTS · ONE ANSWER PER EIGHT SCENES', `<p class="hint">Some shots hold longer than this video's pace, so the storyboard cannot be approved. The program adds the shots each of those scenes needs (as a new revision), then ${esc(ai?.name || 'the AI')} draws only the new shots, each on its own words, in the same place with the same characters. Every other shot keeps its drawing. Afterwards press "Draw the remaining" to draw the new shots.</p><div class="form-grid">${scenePersonField()}</div>`, 'Fix them', {manifestId, connector: aiId});
  }
  if (command === 'scene-draw-all') { if (button) button.disabled = true; return api(`/api/scene-manifests/${id}/draw-all`, {requestedBy: scenePerson() || 'Owner'}).then(result => { toast(`${result.queued} scene${result.queued === 1 ? '' : 's'} queued for drawing.`); return refresh(); }).catch(error => toast(error.message, true)).finally(() => { if (button) button.disabled = false; }); }
  if (command === 'scene-pick-top') return sceneDialog('pick-top', 'Use the top result for every empty shot', 'DOWNLOAD WITH LICENSE EVIDENCE', `<p class="hint">Downloads the first result of each shot's latest search. You can change any shot before approving the board.</p><div class="form-grid">${scenePersonField()}</div>`, 'Download', {manifestId: id});
  if (command === 'scene-generate-all') {
    const settings = state.scenes.settings[content.familyId], usage = state.scenes.usage[content.familyId];
    const count = sceneShots(manifest).filter(shot => shot.source === 'ai-image' && !content.selections[shot.id]).length;
    return sceneDialog('generate-all', `Generate ${count} AI image${count === 1 ? '' : 's'}`, 'PAID · BUDGET ADMISSION', `<div class="form-grid"><label>OpenAI connector<select name="connector">${sceneConnectorOptions('openai')}</select></label><label>Quality<select name="quality">${['low', 'medium', 'high'].map(item => `<option value="${item}" ${item === settings.imageQuality ? 'selected' : ''}>${item} · ${money(settings.priceCents[item])} each</option>`).join('')}</select></label>${scenePersonField()}</div>
      <p class="note">${esc(settings.imageModel)} · ${money(usage.remainingCents)} left of the ${money(usage.budgetCents)} monthly budget. Every image is synthetic media and follows the style's disclosure policy.</p>
      <label class="checkbox-label"><input type="checkbox" name="costConfirmed">I confirm the estimated cost for these images.</label>`, 'Generate', {manifestId: id});
  }
  if (command === 'scene-approve') {
    return reach(`/api/scene-manifests/${id}/board`).then(response => response.json()).then(board => {
      if (board.error) throw new Error(board.error);
      const disclose = board.aiPolicy === 'review-per-asset' && board.ai.length;
      sceneDialog('approve', 'Approve the visual board', 'HUMAN APPROVAL GATE', `${board.blockers.length ? `<div class="checks"><strong>Blocked</strong>${intelList(board.blockers)}</div>` : ''}
        ${board.warnings.length ? `<div class="checks"><strong>${board.warnings.length} warning${board.warnings.length === 1 ? '' : 's'}</strong>${intelList(board.warnings)}</div><label class="checkbox-label"><input type="checkbox" name="warningsAccepted">I accept these warnings for this video.</label>` : ''}
        <label class="checkbox-label"><input type="checkbox" name="rightsReviewed">I reviewed every visual's license and source, and none misuses identifiable people, trademarks or logos.</label>
        <label class="checkbox-label"><input type="checkbox" name="sequenceReviewed">I reviewed the visuals in narration order and they support what is said.</label>
        ${board.ai.length ? `<label class="checkbox-label"><input type="checkbox" name="disclosureReviewed">I reviewed the AI disclosure for the ${board.ai.length} AI image${board.ai.length === 1 ? '' : 's'}${board.aiPolicy === 'always-disclose' ? ' (this style always discloses)' : ''}.</label>` : ''}
        ${disclose ? `<div class="disclosure-grid">${board.ai.map(item => `<label>${esc(item.label)}<select name="disclose-${esc(item.assetId)}"><option value="disclose">Disclose as synthetic</option><option value="not-required">Not realistic, no disclosure</option></select></label>`).join('')}</div>` : ''}
        <div class="form-grid">${scenePersonField('Approver name')}<label>Notes<input name="notes" maxlength="2000"></label></div>`, 'Approve visuals', {manifestId: id, ai: disclose ? board.ai.map(item => item.assetId) : []});
    }).catch(error => toast(error.message, true));
  }
  if (command === 'scene-choose') {
    const [jobId, choice, aiId] = String(id).split('|'), c = content.compare, ai = sceneAis().find(item => item.id === aiId);
    if (!c) return toast('This choice was already made.', true);
    const ask = {new: `Use the new storyboard (revision ${c.fresh.revision})? The kept one (revision ${c.earlier.revision}) stays in the history.`, previous: `Go back to revision ${c.earlier.revision}? It becomes the plan again as a new revision with its scenes and drawings exactly; revision ${c.fresh.revision} stays in the history.`, merge: `Merge the two storyboards with ${ai?.name || 'the AI'}? It picks the better version of each stretch of the script and builds one new revision from those scenes. This uses tokens and may take a minute or two.`}[choice];
    if (!confirm(ask)) return;
    if (button) { button.disabled = true; if (choice === 'merge') button.textContent = `${ai?.name || 'The AI'} is comparing…`; }
    return api(`/api/scene-plan-jobs/${jobId}/choose`, {choice, requestedBy: scenePerson() || 'Owner', expectedRevision: sceneLatest(content).revision, ...(choice === 'merge' ? {connector: sceneConnectorRef(aiId)} : {})})
      .then(result => { toast(choice === 'new' ? 'The new storyboard stays.' : choice === 'previous' ? `Revision ${c.earlier.revision} is the plan again. Review and approve it in step 2.` : `${result.explain || 'Merged.'} Review and approve the merged storyboard in step 2.`); return refresh(); })
      .catch(error => toast(error.message, true)).finally(() => { if (button) button.disabled = false; });
  }
  if (command === 'scene-delete-revoked') {
    if (!confirm('Delete the revoked drawings for good? They leave the program and this PC and cannot come back. Drawings still approved stay, and the skills and your reasons stay. The shots without a drawing are drawn again with "Draw the remaining" (free).')) return;
    if (button) button.disabled = true;
    return api(`/api/content/${id}/revoked-drawings/delete`, {requestedBy: scenePerson() || 'Owner'}).then(result => { toast(`${result.deleted} drawing${result.deleted === 1 ? '' : 's'} deleted (${result.files} file${result.files === 1 ? '' : 's'} removed from this PC).`); return refresh(); }).catch(error => toast(error.message, true)).finally(() => { if (button) button.disabled = false; });
  }
  if (command === 'scene-redo-revoked') {
    const [manifestId, aiId] = String(id).split('|'), ai = sceneAis().find(item => item.id === aiId);
    return sceneDialog('redo-revoked', `Redo the revoked scenes with ${ai?.name || 'the AI'}`, 'NEW DRAWINGS · ONE ANSWER PER EIGHT SCENES', `<p class="hint">${esc(ai?.name || 'The AI')} draws every drawn shot again, told why you revoked the visuals. The scenes, words and timing stay; the drawings arrive as a new plan revision. Then press "Draw the remaining" in step 3 and approve the new visuals. It uses tokens from the channel's monthly limit.</p><div class="form-grid">${scenePersonField()}</div>`, 'Redo the scenes', {manifestId, connector: aiId});
  }
  if (command === 'scene-revoke') return sceneDialog('revoke', 'Revoke the visual approval', 'HANDOFF', `<div class="form-grid">${scenePersonField()}<label>Reason<input name="reason" required minlength="8" maxlength="1000"></label></div>`, 'Revoke', {id});
  if (command === 'scene-shot-open') return sceneShotOpen(id);
  return toast('Unknown action.', true);
}

document.getElementById('scene-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget, kind = form.dataset.kind, data = JSON.parse(form.dataset.payload || '{}');
  const value = name => form.elements[name]?.value ?? '', checked = name => !!form.elements[name]?.checked, person = value('person');
  sceneRemember(person);
  let message = null;
  saveForm(form, async () => {
    const content = sceneContent();
    if (kind === 'plan-rules') { await api(`/api/content/${data.contentId}/scene-plans`, {mode: 'rules', requestedBy: person, contentRevision: content.contentRevision}); message = 'Scene plan created. Review the scenes, then approve the plan.'; return; }
    if (kind === 'plan-claude') {
      const roles = state.ai?.team?.roles;
      if (value('pictures') && roles && value('pictures') !== roles.pictures) await api('/api/ai-roles', {revision: roles.revision, pictures: value('pictures'), scripts: roles.scripts, scriptWriter: roles.scriptWriter, models: roles.models || {}});
      const ai = sceneAis().find(item => item.id === data.connector);
      if (Number(data.rebuilt) && !checked('fresh')) throw new Error('Tick "Yes, I want a new storyboard" first.');
      await api(`/api/content/${data.contentId}/scene-plans`, {mode: 'claude', requestedBy: person, contentRevision: content.contentRevision, connector: sceneConnectorRef(data.connector), alsoWhileRunning: checked('also'), ...(Number(data.rebuilt) ? {previous: value('previous')} : {})}); message = `${ai?.name || 'The AI'} is building the storyboard. Watch it live above.`; return;
    }
    if (kind === 'settings') {
      const cents = Math.round(Number(value('budget')) * 100);
      await api(`/api/families/${data.familyId}/visual-settings`, {revision: data.revision, monthlyBudgetCents: cents, imageModel: value('imageModel'), imageQuality: value('imageQuality'), imageFormat: value('imageFormat'), priceCents: {low: Number(value('low')), medium: Number(value('medium')), high: Number(value('high'))}, stockOrder: value('stockOrder').split(','), perSearch: Number(value('perSearch')), plannerTokenLimit: Number(value('plannerTokenLimit')), continuityReview: !!form.elements.continuityReview?.checked, reviewTokenLimit: Number(value('reviewTokenLimit')), composeFrames: !!form.elements.composeFrames?.checked, composeTokenLimit: Number(value('composeTokenLimit')), designedPerMinute: Number(value('designedPerMinute')), picturesPerMinute: Number(value('picturesPerMinute')), pictureTokenLimit: Number(value('pictureTokenLimit')), naturalPerMinute: Number(value('naturalPerMinute')), storyMap: !!form.elements.storyMap?.checked});
      await api('/api/quota-settings', {revision: data.quotaRevision, pexelsHourlyRequestCap: Number(value('pexelsCap')), pixabayHourlyRequestCap: Number(value('pixabayCap'))});
      return;
    }
    if (kind === 'redo-revoked') { await api(`/api/scene-manifests/${data.manifestId}/redo-revoked`, {requestedBy: person, connector: sceneConnectorRef(data.connector), expectedRevision: sceneLatest(content).revision}); message = 'The AI is drawing the scenes again. Watch it live above; the new drawings arrive as a new plan revision.'; return; }
    if (kind === 'fix-long') { const result = await api(`/api/scene-manifests/${data.manifestId}/fix-long-shots`, {requestedBy: person, connector: sceneConnectorRef(data.connector), expectedRevision: sceneLatest(content).revision}); message = `${result.added} shot${result.added === 1 ? '' : 's'} added; the AI is drawing them now.`; return; }
    if (kind === 'redraw') { await api(`/api/scene-manifests/${data.manifestId}/redraw-undesigned`, {requestedBy: person, connector: sceneConnectorRef(value('connector')), expectedRevision: sceneLatest(content).revision}); message = 'Drawings queued. They arrive as a new plan revision.'; return; }
    if (kind === 'shot-picture') { await api(`/api/scene-manifests/${data.manifestId}/shot-picture`, {shotId: data.shotId, describe: value('describe'), size: value('size'), replace: checked('replace'), requestedBy: person, connector: sceneConnectorRef(value('connector')), expectedRevision: sceneLatest(content).revision}); message = 'Picture queued. It arrives as a new plan revision.'; return; }
    if (kind === 'change-shot') { await api(`/api/scene-manifests/${data.manifestId}/change-shot`, {label: data.label, ask: value('ask'), requestedBy: person, connector: sceneConnectorRef(value('connector')), expectedRevision: sceneLatest(content).revision}); message = 'Change queued. Watch it live above; the new drawing arrives as a new plan revision.'; return; }
    if (kind === 'redesign') { await api(`/api/scene-manifests/${data.manifestId}/redesign-frame`, {shotId: data.shotId, reason: value('reason'), requestedBy: person, connector: sceneConnectorRef(value('connector')), expectedRevision: sceneLatest(content).revision}); message = 'Redesign queued. The new design arrives as a new plan revision.'; return; }
    if (kind === 'review') { await api(`/api/scene-manifests/${data.id}/review`, {decision: value('decision'), reviewer: person, notes: value('notes'), confirmations: {coverageReviewed: checked('coverageReviewed'), directionReviewed: checked('directionReviewed')}}); return; }
    if (kind === 'edit') {
      const manifest = sceneLatest(content), body = {op: data.op, createdBy: person, note: value('note'), expectedRevision: manifest.revision};
      if (data.sceneId) body.sceneId = data.sceneId;
      if (data.shotId) body.shotId = data.shotId;
      if (data.op === 'update-scene') Object.assign(body, {purpose: value('purpose'), direction: value('direction'), onScreenText: value('onScreenText')});
      if (data.op === 'update-shot') Object.assign(body, {source: value('source'), motion: value('motion'), query: value('query'), prompt: value('prompt'), notes: value('notes')}, checked('dropFrame') ? {frame: null} : {});
      if (data.op === 'split-scene') body.atSentence = Number(value('atSentence'));
      const created = await api(`/api/scene-manifests/${data.manifestId}/revisions`, body);
      message = created.issues.length ? `Saved revision ${created.revision} with ${created.issues.length} issue(s) to fix before approval.` : `Saved revision ${created.revision}.`;
      return;
    }
    if (kind === 'search-all') { const result = await api(`/api/scene-manifests/${data.manifestId}/search-all`, {requestedBy: person, connectors: {pexels: sceneConnectorRef(value('pexels')), pixabay: sceneConnectorRef(value('pixabay')), wikimedia: sceneConnectorRef(value('wikimedia'))}}); message = `${result.queued} searches queued.`; return; }
    if (kind === 'pick-top') { const result = await api(`/api/scene-manifests/${data.manifestId}/pick-top`, {requestedBy: person}); message = `${result.queued} downloads queued.`; return; }
    if (kind === 'generate-all') { const result = await api(`/api/scene-manifests/${data.manifestId}/generate-all`, {requestedBy: person, connector: sceneConnectorRef(value('connector')), quality: value('quality'), costConfirmed: checked('costConfirmed')}); message = `${result.queued} images queued (about ${money(result.estimatedCents)}).`; return; }
    if (kind === 'approve') {
      const disclosures = Object.fromEntries(data.ai.map(assetId => [assetId, value(`disclose-${assetId}`)]));
      await api(`/api/scene-manifests/${data.manifestId}/visual-approval`, {approvedBy: person, notes: value('notes'), disclosures, confirmations: {rightsReviewed: checked('rightsReviewed'), sequenceReviewed: checked('sequenceReviewed'), warningsAccepted: checked('warningsAccepted'), disclosureReviewed: checked('disclosureReviewed')}});
      message = 'Visuals approved and handed to the Editing Room.';
      return;
    }
    if (kind === 'revoke') { await api(`/api/visual-approvals/${data.id}/revoke`, {by: person, reason: value('reason')}); return; }
    throw new Error('Unknown form.');
  }, () => message);
});

// ---------------------------------------------------------------- shot sourcing dialog
function sceneShotOpen(shotId) {
  const {content, manifest, scene, shot} = sceneFind(shotId);
  if (!shot) return toast('Shot not found. Reload.', true);
  sceneShot = {shotId, manifestId: manifest.id, contentId: content.contentId};
  const settings = state.scenes.settings[content.familyId];
  const caps = state.scenes.capabilities.filter(cap => cap.kind === 'search' && intelConnectors(cap.provider).length);
  const preferred = shot.source === 'stock-video' ? 'video' : 'photo';
  const order = settings.stockOrder.map(provider => `${provider}-${preferred}`);
  caps.sort((a, b) => (order.indexOf(a.id) + 1 || 9) - (order.indexOf(b.id) + 1 || 9));
  const openai = intelConnectors('openai');
  document.getElementById('shot-heading').textContent = `${shot.label} · ${styleLabel(shot.source)} · ${sceneSeconds(shot.durationSeconds)}`;
  document.getElementById('shot-body').innerHTML = `<p class="scene-narration">${esc(sceneNarration(manifest, scene))}</p>
    <div id="shot-selected"></div>
    <div class="shot-panels">
      <section class="shot-panel"><h3>Stock search</h3>${caps.length ? `<div class="form-grid"><label>Library<select id="shot-cap">${caps.map(cap => `<option value="${cap.id}">${esc(cap.name)}</option>`).join('')}</select></label><label>Search words<input id="shot-query" maxlength="100" value="${esc(shot.query)}"></label></div><div class="card-actions"><button type="button" class="button primary" data-scene-act="search">Search</button></div><p class="hint">Results and previews are kept for 24 hours. The chosen file is downloaded with its license, author and source page.</p>` : '<p class="inline-warning">Add and test a Pexels or Pixabay connector in Connections.</p>'}</section>
      <section class="shot-panel"><h3>AI image</h3>${manifest.status !== 'approved' ? '<p class="inline-warning">Approve the plan revision before spending on AI images.</p>' : !openai.length ? '<p class="inline-warning">Add and test an OpenAI connector in Connections.</p>' : `<label>Prompt<textarea id="shot-prompt" rows="4" maxlength="1500">${esc(shot.prompt || `Original illustration for a ${sceneSpec(content)?.name.toLowerCase() || 'documentary'} video, no text, no logos, no real people: ${sceneNarration(manifest, scene).slice(0, 300)}`)}</textarea></label><div class="form-grid"><label>Quality<select id="shot-quality">${['low', 'medium', 'high'].map(item => `<option value="${item}" ${item === settings.imageQuality ? 'selected' : ''}>${item} · ${money(settings.priceCents[item])}</option>`).join('')}</select></label><label>OpenAI connector<select id="shot-openai">${sceneConnectorOptions('openai')}</select></label></div><label class="checkbox-label"><input type="checkbox" id="shot-cost">I confirm the estimated cost (${esc(settings.imageModel)}).</label>${shot.source !== 'ai-image' ? '<label class="checkbox-label"><input type="checkbox" id="shot-exception">Use an AI image although this shot is planned for stock.</label>' : ''}<div class="card-actions"><button type="button" class="button primary" data-scene-act="generate">Generate</button></div>`}</section>
    </div>
    <label class="shot-person">Your name <input id="shot-person" maxlength="80" autocomplete="name" value="${esc(scenePerson())}"></label>
    <div id="shot-jobs"></div>
    <h3 class="intel-subhead">Search results</h3><div id="shot-results" class="candidate-grid"><p class="muted">Loading…</p></div>
    <h3 class="intel-subhead">Visuals already downloaded for this script</h3><div id="shot-gallery" class="candidate-grid"></div>`;
  document.getElementById('shot-dialog').showModal();
  sceneShotRender();
}
async function sceneShotRender() {
  if (!sceneShot) return;
  const content = sceneContent(sceneShot.contentId), manifest = sceneLatest(content);
  if (!content || !manifest || manifest.id !== sceneShot.manifestId) { document.getElementById('shot-selected').innerHTML = '<p class="inline-warning">The plan changed. Close this window and open the shot again.</p>'; return; }
  const selection = content.selections[sceneShot.shotId], asset = selection && sceneAsset(content, selection.assetId);
  document.getElementById('shot-selected').innerHTML = asset ? `<div class="selected-asset">${asset.thumb ? `<img src="${esc(asset.thumb)}" alt="Selected visual">` : ''}<div><strong>Selected: ${asset.origin === 'ai' ? `AI image · ${esc(asset.rights.model)}` : `${esc(sceneProvider(asset.provider))} ${esc(asset.mediaType)}`}</strong><small>${asset.probe.width}×${asset.probe.height}${asset.probe.durationSeconds ? ` · ${sceneSeconds(asset.probe.durationSeconds)}` : ''} · ${esc(asset.rights.license.name)}${asset.rights.author ? ` · ${esc(asset.rights.author)}` : ''} · ${esc(asset.sha256.slice(0, 12))}</small>${asset.rights.pageUrl ? `<a href="${esc(asset.rights.pageUrl)}" target="_blank" rel="noopener noreferrer">Source page ↗</a>` : ''}${asset.rights.synthetic ? '<small class="muted">Synthetic media · disclosure decided at approval</small>' : ''}</div><button type="button" class="button text-button danger" data-scene-act="clear">Clear</button></div>` : '<p class="muted">No visual selected for this shot yet.</p>';
  const jobs = content.jobs.filter(job => job.shotId === sceneShot.shotId).slice(0, 6);
  document.getElementById('shot-jobs').innerHTML = jobs.length ? `<div class="history-list">${jobs.map(job => `<div class="history-row"><span class="job-dot ${['queued', 'running'].includes(job.status) ? 'queued' : job.status === 'completed' ? 'completed' : ''}"></span><div><strong>${sceneJobBadge(job.status)} ${esc(job.kind)} · ${esc(job.capabilityId)}</strong><small>${esc(date(job.createdAt))} · attempt ${job.attempts}/3${job.result?.cached ? ' · from 24-hour cache' : ''}${job.error ? ` · ${esc(job.error)}` : ''}</small></div>${['failed', 'interrupted', 'blocked_quota', 'blocked_budget', 'stale'].includes(job.status) && job.attempts < 3 ? `<button type="button" class="button text-button" data-scene-act="retry" data-id="${esc(job.id)}">Retry deliberately</button>` : ''}</div>`).join('')}</div>` : '';
  try {
    const response = await reach(`/api/scene-candidates?contentId=${encodeURIComponent(sceneShot.contentId)}&shotId=${encodeURIComponent(sceneShot.shotId)}`);
    const candidates = await response.json();
    if (!response.ok) throw new Error(candidates.error);
    document.getElementById('shot-results').innerHTML = candidates.length ? candidates.map(item => `<div class="candidate">${item.preview ? `<img src="${esc(item.preview)}" alt="${esc(item.title)}" loading="lazy">` : '<span class="shot-empty">No preview</span>'}<div><strong>${esc(item.title)}</strong><small>${esc(item.providerName)} · ${item.width && item.height ? `${item.width}×${item.height}` : 'size unknown'}${item.durationSeconds ? ` · ${sceneSeconds(item.durationSeconds)}` : ''}</small><small>${item.author ? `by ${esc(item.author)} · ` : ''}<a href="${esc(item.license.url)}" target="_blank" rel="noopener noreferrer">${esc(item.license.name)}</a>${item.pageUrl ? ` · <a href="${esc(item.pageUrl)}" target="_blank" rel="noopener noreferrer">Source ↗</a>` : ''}</small><small class="muted">“${esc(item.query)}” · #${item.rank}</small></div><button type="button" class="button secondary" data-scene-act="import" data-id="${esc(item.id)}">Use this</button></div>`).join('') : '<p class="muted">No results yet. Search a stock library above.</p>';
  } catch (error) {
    document.getElementById('shot-results').innerHTML = `<p class="inline-warning">${esc(error.message || 'Could not load results.')}</p>`;
  }
  const gallery = content.assets.filter(item => item.id !== selection?.assetId).slice(0, 24);
  document.getElementById('shot-gallery').innerHTML = gallery.length ? gallery.map(item => `<div class="candidate compact">${item.thumb ? `<img src="${esc(item.thumb)}" alt="Visual ${esc(item.id.slice(0, 8))}" loading="lazy">` : '<span class="shot-empty">No thumbnail</span>'}<div><strong>${item.origin === 'ai' ? 'AI image' : `${esc(sceneProvider(item.provider))} ${esc(item.mediaType)}`}</strong><small>${item.probe.width}×${item.probe.height}${item.probe.durationSeconds ? ` · ${sceneSeconds(item.probe.durationSeconds)}` : ''}</small></div><button type="button" class="button text-button" data-scene-act="use" data-id="${esc(item.id)}">Use for this shot</button></div>`).join('') : '<p class="muted">Nothing downloaded yet.</p>';
  scenePollStart();
}
function scenePollStart() {
  clearInterval(scenePoll);
  const content = sceneContent(sceneShot?.contentId);
  if (!sceneShot || !content || !sceneActiveJobs(content, sceneShot.shotId).length) return;
  scenePoll = setInterval(async () => {
    if (!document.getElementById('shot-dialog').open) { clearInterval(scenePoll); return; }
    try { await refresh(); } catch { return; }
    const current = sceneContent(sceneShot.contentId);
    if (!current || !sceneActiveJobs(current, sceneShot.shotId).length) { clearInterval(scenePoll); sceneShotRender(); }
  }, 1500);
}
document.getElementById('shot-dialog').addEventListener('close', () => { clearInterval(scenePoll); sceneShot = null; refresh().catch(() => {}); });
document.getElementById('shot-dialog').addEventListener('click', async event => {
  const button = event.target.closest('[data-scene-act]');
  if (!button || !sceneShot) return;
  const act = button.dataset.sceneAct, person = document.getElementById('shot-person').value.trim();
  sceneRemember(person);
  const base = {manifestId: sceneShot.manifestId, shotId: sceneShot.shotId};
  button.disabled = true;
  try {
    if (act === 'search') {
      const cap = document.getElementById('shot-cap').value, provider = state.scenes.capabilities.find(item => item.id === cap).provider;
      await api('/api/scene-shots/search', {...base, capabilityId: cap, query: document.getElementById('shot-query').value, connector: sceneConnectorRef(intelConnectors(provider)[0]?.id), requestedBy: person});
      toast('Search queued.');
    } else if (act === 'generate') {
      await api('/api/scene-shots/generate', {...base, prompt: document.getElementById('shot-prompt').value, quality: document.getElementById('shot-quality').value, connector: sceneConnectorRef(document.getElementById('shot-openai').value), costConfirmed: document.getElementById('shot-cost').checked, allowSourceChange: !!document.getElementById('shot-exception')?.checked, requestedBy: person});
      toast('Image generation queued.');
    } else if (act === 'import') {
      await api(`/api/visual-candidates/${button.dataset.id}/import`, {...base, requestedBy: person});
      toast('Downloading with license evidence…');
    } else if (act === 'use') {
      await api('/api/scene-shots/select', {...base, assetId: button.dataset.id, selectedBy: person});
      toast('Visual selected for this shot.');
    } else if (act === 'clear') {
      await api('/api/scene-shots/select', {...base, assetId: null, selectedBy: person});
    } else if (act === 'retry') {
      const content = sceneContent(sceneShot.contentId), job = content.jobs.find(item => item.id === button.dataset.id), unknown = job?.status === 'interrupted';
      if (unknown && !confirm('The last attempt was interrupted, so it may already have been charged. Deliberately retry?')) return;
      await api(`/api/visual-jobs/${button.dataset.id}/retry`, {confirmInterrupted: unknown});
    }
    await refresh();
    sceneShotRender();
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
  }
});
document.addEventListener('change', event => { if (event.target.id === 'scene-content') { sceneContentId = event.target.value; render(); } });
// 0.93 (owner review 2026-11-05: the tile said 77/77 while every shot was being drawn again from the start): the shots of
// THIS video that are ready today. A drawn shot counts only with today's drawing; old drawings being replaced do not.
function sceneShotsTile(content, manifest, shots, filled) {
  if (!manifest) return '<div><span>Shots ready</span><strong>—</strong><small>No plan yet</small></div>';
  const d = content.drawing || {total: 0, current: 0, outdated: 0, missing: 0, active: 0}, other = shots.length - d.total;
  const otherFilled = Math.max(0, filled - d.current - d.outdated), drawnNow = d.current - (d.redrawing || 0), ready = drawnNow + Math.min(other, otherFilled);
  const note = d.active ? `Drawing now: ${drawnNow} of ${d.total} drawn` : d.outdated ? `${d.outdated} drawn with older rules: draw them again` : d.missing ? `${d.missing} not drawn yet` : `${Math.round(ready / Math.max(1, shots.length) * 100)}% of this video's shots`;
  return `<div><span>Shots ready (this video)</span><strong>${ready}/${shots.length}</strong><small>${esc(note)}</small></div>`;
}
