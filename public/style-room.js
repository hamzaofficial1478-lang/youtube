'use strict';
// Room 03 - Style Library & Assignment (UI).
// Loaded before app.js. Shared helpers ($, esc, badge, action, state, api, refresh,
// toast, saveForm, date, localeName) come from app.js and are only used inside functions.

const STYLE_LABELS = {
  mix: 'Mix: every look of this engine, chosen per scene',
  vector: 'Vector world', infographic: 'Infographic cartoon', kinetic: 'Kinetic type', collage: 'Documentary collage', data: 'Data desk', footage: 'Footage with motion graphics', painted: 'Painted story',
  'long-form': 'Long-form', shorts: 'Shorts', cut: 'Cut', crossfade: 'Crossfade', 'dip-to-black': 'Dip to black', push: 'Push', slide: 'Slide',
  zoom: 'Zoom', 'whip-pan': 'Whip pan', 'match-cut': 'Match cut', wipe: 'Wipe', morph: 'Morph', static: 'Static', 'ken-burns': 'Ken Burns',
  pan: 'Pan', parallax: 'Parallax', 'handheld-sim': 'Handheld feel', tracking: 'Tracking', linear: 'Linear', 'ease-in-out': 'Ease in-out',
  spring: 'Spring', sentence: 'Sentence case', title: 'Title Case', upper: 'UPPERCASE', 'burned-in': 'Burned in', sidecar: 'Sidecar file',
  both: 'Burned in + sidecar', bottom: 'Bottom', center: 'Center', top: 'Top', 'stock-video': 'Stock video', 'stock-image': 'Stock images',
  'ai-image': 'AI images', 'ai-video': 'AI video', 'generated-graphics': 'Generated graphics', 'maps-and-diagrams': 'Maps & diagrams',
  'archival-public-domain': 'Public-domain archive', 'review-per-asset': 'Review per asset', 'always-disclose': 'Always disclose',
  classic: 'Classic cartoon', whiteboard: 'Whiteboard', storybook: 'Storybook', doodle: 'Doodle', illustrated: 'Illustrated',
  cartoon: 'Colour cartoon', marker: 'Black marker', pencil: 'Pencil sketch', framed: 'Framed board', 'dry-erase': 'Dry-erase markers',
  none: 'None', subtle: 'Subtle', accent: 'Accent hits', rich: 'Rich sound design', draft: 'Draft · needs review', approved: 'Approved', retired: 'Retired',
};
const styleLabel = value => STYLE_LABELS[value] || String(value).replace(/-/g, ' ').replace(/^./, letter => letter.toUpperCase());

function styleProfiles() { return state.styles?.profiles || []; }
function styleRevisionById(id) {
  for (const profile of styleProfiles()) {
    const revision = profile.revisions.find(item => item.id === id);
    if (revision) return {profile, revision};
  }
  return null;
}
function styleFamilyAssignments(familyId) { return (state.styles?.assignments || []).filter(item => item.familyId === familyId); }
function styleActive(familyId, scope = 'family', locale = null) {
  return styleFamilyAssignments(familyId).find(item => item.status === 'active' && item.scope === scope && (scope === 'family' || item.locale === locale));
}
function styleHandoff(familyId) { return (state.styles?.handoffs || []).find(item => item.familyId === familyId); }
function stylePalette(spec, large = false) {
  return `<div class="palette-strip ${large ? 'large' : ''}" aria-label="Palette">${['background', 'primary', 'accent', 'text'].map(key => `<span data-swatch="${esc(spec.palette[key])}" title="${esc(key)} ${esc(spec.palette[key])}"></span>`).join('')}</div>`;
}
// The page CSP forbids inline style attributes, so swatch colours are applied through the CSSOM.
function applySwatches(root = document) {
  root.querySelectorAll('[data-swatch]').forEach(element => {
    const colour = element.dataset.swatch;
    if (/^#[0-9A-Fa-f]{6}$/.test(colour)) element.style.backgroundColor = colour;
  });
}
function styleRendererBadge(spec) {
  const renderer = state.styles.renderers[spec.renderer.adapter];
  // 0.62: every engine renders and is tested; none has been proven on a real video of the owner's yet.
  return badge(`${renderer.name} · built and tested, not yet proven on a real video`, 'gray');
}
// The visual rules of the style's look(s) (visual-dna.js, 0.56): what kind of pictures, places, objects, people and
// motion it uses, and what never belongs in it. Every painter, illustrator and the planner follow them.
function styleVisualRules(spec) {
  const adapter = spec.renderer.adapter, rules = state.visualRules || [], find = key => rules.find(item => item.key === key), d = spec.drawing || {};
  const keys = adapter === 'ffmpeg-sketch' ? (d.look === 'mix' ? rules.filter(item => item.key.startsWith('stickman/')).map(item => item.key) : [`stickman/${d.look || 'classic'}`])
    : adapter === 'canvas-frames' ? (d.board === 'mix' ? rules.filter(item => item.key.startsWith('handdrawn/')).map(item => item.key) : [`handdrawn/${d.board || 'cartoon'}`])
    : ['ffmpeg-montage', 'motion-graphics'].includes(adapter) ? (d.design === 'mix' ? rules.filter(item => item.key.startsWith('documentary/')).map(item => item.key) : [`documentary/${d.design || 'footage'}`])
    : adapter === 'cinematic-hybrid' ? ['cinema/footage'] : adapter === 'atelier' ? ['atelier/designed'] : [];
  // 0.63: a natural video follows the natural rules in every look; a mix follows both.
  const shown = (d.pictureType === 'natural' ? ['natural'] : d.pictureType === 'mix' ? [...keys, 'natural'] : keys).map(find).filter(Boolean);
  if (!shown.length) return '';
  return `<details class="scene-history visual-rules"><summary>Visual rules of this look (${shown.length})</summary>${shown.map(item => `<div class="visual-rule"><strong>${esc(item.name)}</strong> ${badge(item.pictures === 'photo' ? 'Real photos' : item.pictures === 'cutout' ? 'Photo cut-outs' : item.pictures === 'natural' ? 'Realistic, painted by ChatGPT' : 'Drawn in this look', item.pictures === 'drawn' ? 'green' : 'orange')}<dl class="style-facts"><div><dt>Pictures</dt><dd>${esc(item.medium)}</dd></div><div><dt>Places</dt><dd>${esc(item.places)}</dd></div><div><dt>Objects</dt><dd>${esc(item.objects)}</dd></div><div><dt>People</dt><dd>${esc(item.people)}</dd></div><div><dt>Motion</dt><dd>${esc(item.motion)}</dd></div><div><dt>Never</dt><dd>${esc(item.never)}</dd></div></dl></div>`).join('')}<p class="hint">The scene planner plans with these rules, every picture is painted or drawn by them, and Claude checks each painted picture against them before it is used.</p></details>`;
}
// What the style's engine can do, and for stick figures the look and the hand this style uses.
function styleFeatures(spec) {
  const renderer = state.styles.renderers[spec.renderer.adapter] || {}, adapter = spec.renderer.adapter, stick = ['ffmpeg-sketch', 'story-mix'].includes(adapter), board = ['canvas-frames', 'story-mix'].includes(adapter), design = ['ffmpeg-montage', 'motion-graphics', 'story-mix'].includes(adapter);
  const chosen = stick || board || design ? `<p class="hint">${adapter === 'story-mix' ? '<strong>Mix of all engines.</strong> ' : ''}${design ? `Documentary look: <strong>${esc(docLabel(spec.drawing?.design || 'vector'))}</strong>${stick || board ? ' · ' : ''}` : ''}${stick ? `Stickman look: <strong>${esc(styleLabel(spec.drawing?.look || 'classic'))}</strong> · ` : ''}${board ? `Whiteboard look: <strong>${esc(styleLabel(spec.drawing?.board || 'cartoon'))}</strong> · ` : ''}${stick || board ? `drawing hand ${spec.drawing?.hand ? '<strong>on</strong>' : 'off'}` : ''}</p>` : '';
  const adaptive = spec.adaptive ? '<p class="hint"><strong>The AI designs each video:</strong> colours, fonts, pace, energy and caption look per story; the settings below are the starting point.</p>' : '';
  const type = spec.drawing?.pictureType ? `<p class="hint">Picture type: <strong>${esc(typeLabel(spec.drawing.pictureType))}</strong></p>` : '';
  const film = spec.drawing?.film ? `<p class="hint">Film look: <strong>${esc(filmLabel(spec.drawing.film))}</strong>${spec.drawing.films?.length ? ` from ${esc(spec.drawing.films.map(filmLabel).join(', '))}` : ''}</p>` : '';
  const ticked = [['Stickman looks mixed', spec.drawing?.looks, styleLabel], ['Whiteboard looks mixed', spec.drawing?.boards, styleLabel], ['Documentary looks mixed', spec.drawing?.designs, docLabel]].filter(([, list]) => list?.length).map(([label, list, name]) => `<p class="hint">${label}: <strong>${esc(list.map(name).join(', '))}</strong></p>`).join('');
  const grade = spec.cinema ? `<p class="hint">Colour grade: <strong>${esc(gradeLabel(spec.cinema.grade))}</strong>${spec.cinema.letterbox ? ' · cinema bars' : ''}${spec.cinema.grain ? ` · film grain ${esc(spec.cinema.grain)}` : ''}</p>` : '';
  // A font this PC does not have is drawn in a look-alike (0.41): say so, so the owner is never surprised.
  const lacking = [spec.typography.headingFont, spec.typography.bodyFont].filter((name, k, all) => all.indexOf(name) === k && state.styles.missingFonts?.[name]);
  const fonts = lacking.length ? `<p class="inline-warning">${lacking.map(name => `${esc(name)} is not installed on this PC, so ${esc(state.styles.missingFonts[name])} is used`).join('; ')}. Install the font or choose another.</p>` : '';
  return (renderer.features?.length ? `<ul class="engine-features">${renderer.features.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : '') + chosen + ticked + adaptive + type + film + grade + fonts + styleVisualRules(spec);
}
// A style that allows every transition says so in one line; Claude picks one per scene from all of them.
function transitionList(spec) {
  const all = state.styles.vocabulary.transitions, allowed = spec.transitions.allowed;
  return all.every(name => allowed.includes(name)) ? `All ${all.length - 1} transitions and cuts (Claude chooses per scene)` : allowed.map(styleLabel).join(', ');
}
function styleFacts(spec) {
  const aspects = spec.formats.map(format => `${styleLabel(format)} ${state.styles.vocabulary.aspect[format]}`).join(' · ');
  return `<dl class="style-facts">
    <div><dt>Canvas</dt><dd>${esc(aspects)} · ${spec.canvas.frameRate} fps</dd></div>
    <div><dt>Pacing</dt><dd>${spec.pacing.shotMinSeconds}-${spec.pacing.shotMaxSeconds}s shots · hook ≤ ${spec.pacing.hookShotMaxSeconds}s</dd></div>
    <div><dt>Transitions</dt><dd>${esc(transitionList(spec))}</dd></div>
    <div><dt>Captions</dt><dd>${esc(styleLabel(spec.captions.mode))} · ${spec.captions.maxLines}×${spec.captions.maxCharsPerLine} chars · ${esc(styleLabel(spec.captions.position))}</dd></div>
    <div><dt>Visuals</dt><dd>${esc(spec.visuals.sources.map(styleLabel).join(', '))}</dd></div>
    <div><dt>Audio</dt><dd>${esc(spec.audio.musicMoods.join(', '))} · ${spec.audio.targetLufs} LUFS · SFX ${esc(styleLabel(spec.audio.sfxUsage).toLowerCase())}</dd></div>
  </dl>`;
}

function styleRoom(family) {
  const profiles = styleProfiles().filter(profile => !(profile.origin === 'launch' && profile.revisions.every(item => item.status === 'retired'))), handoff = styleHandoff(family.id), familyAssignment = styleActive(family.id);
  const assigned = familyAssignment && styleRevisionById(familyAssignment.revisionId);
  const overrides = styleFamilyAssignments(family.id).filter(item => item.status === 'active' && item.scope === 'channel');
  const approvedCount = profiles.reduce((sum, profile) => sum + profile.revisions.filter(item => item.status === 'approved').length, 0);
  const pending = profiles.filter(profile => profile.revisions.at(-1).status === 'draft').length;
  const history = styleFamilyAssignments(family.id);
  const ledger = state.productionInvalidations.filter(item => item.familyId === family.id && item.reason.startsWith('Style')).slice(-12).reverse();

  const assignmentPanel = assigned ? `<div class="assign-panel">
      ${stylePalette(assigned.revision.spec, true)}
      <div class="assign-main">
        <div class="card-top"><h2>${esc(assigned.revision.spec.name)}</h2>${badge(`r${assigned.revision.revision} · ${styleLabel(assigned.revision.status)}`, assigned.revision.status === 'approved' ? 'green' : 'orange')}</div>
        <p>${esc(assigned.revision.spec.summary)}</p>
        <p class="muted">Assigned by ${esc(familyAssignment.decision.assignedBy)} · ${esc(date(familyAssignment.createdAt))} · “${esc(familyAssignment.decision.reason)}”</p>
        <div class="assign-meta">${styleRendererBadge(assigned.revision.spec)}${familyAssignment.fallback ? badge(`Fallback: ${styleRevisionById(familyAssignment.fallback.revisionId)?.revision.spec.name || 'revision'} (manual only)`, 'green') : badge('No fallback approved')}</div>
        <div class="card-actions">${action('Change default style', 'style-assign', family.id, 'secondary')}${action(familyAssignment.fallback ? 'Change fallback' : 'Approve a fallback', 'style-fallback', familyAssignment.id, 'text-button')}${!overrides.length ? action('Revoke default', 'style-revoke', familyAssignment.id, 'text-button danger') : ''}</div>
      </div>
    </div>` : `<div class="production-empty"><span class="empty-icon">◆</span><h2>No editing style assigned</h2><p>Review a style in the library below, then assign it as ${esc(family.name)}'s default. Every channel edition inherits it unless you add a deliberate override.</p>${action('Assign default style', 'style-assign', family.id, 'primary')}</div>`;

  const channelRows = (handoff?.channels || []).map(channel => {
    const override = channel.source === 'override' ? overrides.find(item => item.locale === channel.locale) : null;
    return `<div class="channel-style-row">
      <div><strong>${esc(localeName(channel.locale))}</strong><small>${channel.primary ? 'Primary master channel' : 'Additional channel edition'}</small></div>
      <div>${channel.revisionId ? `<strong>${esc(channel.name)} r${channel.revision}</strong><small>${channel.source === 'override' ? 'Deliberate channel override' : 'Inherited from family default'}</small>` : '<strong>No style</strong><small>Waiting for the family default</small>'}</div>
      <div class="row-end">${channel.issues.length ? badge(channel.issues[0], 'orange') : channel.revisionId ? badge('Locked for scenes', 'green') : badge('Blocked')}${override ? action('Revoke override', 'style-revoke', override.id, 'text-button danger') : ''}</div>
    </div>`;
  }).join('');

  const familyAssignedProfile = assigned?.profile.id;
  const cards = profiles.map(profile => {
    const latest = profile.revisions.at(-1), spec = latest.spec;
    const approved = profile.revisions.filter(item => item.status === 'approved');
    const inUse = profile.revisions.reduce((sum, item) => sum + item.usage.active, 0);
    return `<article class="style-card ${profile.id === familyAssignedProfile ? 'assigned' : ''}">
      ${stylePalette(spec)}
      <div class="card-top"><span class="micro-label">${profile.origin === 'launch' ? 'Launch profile' : profile.origin === 'derived' ? 'Derived style' : 'Custom style'} · r${latest.revision}</span>${badge(styleLabel(latest.status), latest.status === 'approved' ? 'green' : latest.status === 'draft' ? 'orange' : 'gray')}</div>
      <h3>${esc(spec.name)}</h3>
      <p>${esc(spec.summary)}</p>
      <div class="chip-row">${spec.bestFit.map(item => `<span class="chip">${esc(item)}</span>`).join('')}</div>
      ${styleFeatures(spec)}
      ${styleFacts(spec)}
      <div class="style-card-foot">${styleRendererBadge(spec)}${profile.id === familyAssignedProfile ? badge('This family\'s default', 'green') : ''}${inUse ? `<small>${inUse} active assignment${inUse === 1 ? '' : 's'}</small>` : ''}${approved.length && latest.status === 'draft' ? `<small>r${approved.at(-1).revision} remains approved</small>` : ''}</div>
      <div class="card-actions">${action('Spec & history', 'style-view', profile.id, 'text-button')}${latest.status === 'draft' ? action('Review & approve', 'style-approve', latest.id, 'primary') : ''}${action('New revision', 'style-revise', profile.id, 'text-button')}${action('Duplicate', 'style-duplicate', profile.id, 'text-button')}${latest.status !== 'retired' ? action('Retire', 'style-retire', latest.id, 'text-button danger') : ''}</div>
    </article>`;
  }).join('');

  const historyRows = history.map(item => {
    const found = styleRevisionById(item.revisionId);
    return `<div class="history-row ${item.status}"><span class="job-dot ${item.status === 'active' ? 'completed' : ''}"></span><div><strong>${item.scope === 'family' ? 'Family default' : `Override · ${esc(item.locale)}`} → ${esc(found?.revision.spec.name || 'Unknown style')} r${found?.revision.revision ?? '?'}</strong><small>${esc(item.status)} · ${esc(item.decision.assignedBy)} · ${esc(date(item.createdAt))} · ${esc(item.decision.reason)}${item.endedReason ? ` · ended: ${esc(item.endedReason)}` : ''}</small></div></div>`;
  }).join('') || '<p class="muted">No style decisions for this family yet.</p>';

  return `<section class="voice-hero"><div><span class="stage-kicker">ROOM 03 · VISUAL GRAMMAR</span><h2>Style Library &amp; Assignment</h2><p>Review versioned editing styles, assign one approved default to this family, and let every channel edition inherit it. Overrides and fallbacks are explicit decisions, never silent switches.</p></div><div class="voice-health"><span class="health-light ${handoff?.ready ? 'ready' : ''}"></span><strong>${handoff?.ready ? 'Style locked for scenes' : 'Style handoff blocked'}</strong><small>${esc(handoff?.ready ? `${assigned.revision.spec.name} r${assigned.revision.revision} · ${handoff.channels.length} channel${handoff.channels.length === 1 ? '' : 's'}` : handoff?.blocker || 'Assign an approved style.')}</small></div></section>
    <div class="production-kpis"><div><span>Styles in library</span><strong>${profiles.length}</strong><small>${pending} awaiting review</small></div><div><span>Approved revisions</span><strong>${approvedCount}</strong><small>immutable once created</small></div><div><span>Family default</span><strong>${assigned ? `r${assigned.revision.revision}` : '—'}</strong><small>${esc(assigned ? assigned.revision.spec.name : 'not assigned')}</small></div><div><span>Channel overrides</span><strong>${overrides.length}</strong><small>${family.channels.length} configured channel${family.channels.length === 1 ? '' : 's'}</small></div></div>
    <section class="production-card"><div class="production-card-head"><div><span class="micro-label">CHANNEL FAMILY DEFAULT</span><h2>Assigned editing style</h2></div><div class="row-end">${family.channels.length > 1 && familyAssignment ? action('Add channel override', 'style-override', family.id, 'secondary') : ''}</div></div>${assignmentPanel}${channelRows ? `<div class="channel-style-list"><span class="micro-label">Effective style per channel</span>${channelRows}</div>` : ''}</section>
    <section class="production-card"><div class="production-card-head"><div><span class="micro-label">STYLE LIBRARY</span><h2>Launch styles and your custom styles</h2></div>${action('+ New custom style', 'style-new', '', 'secondary')}</div><div class="style-grid">${cards}</div></section>
    <div class="production-split"><section class="production-card"><div class="production-card-head"><div><span class="micro-label">DECISION TRAIL</span><h2>Assignment history</h2></div>${badge(`${history.length} decision${history.length === 1 ? '' : 's'}`)}</div><div class="history-list">${historyRows}</div></section>
    <section class="production-card"><div class="production-card-head"><div><span class="micro-label">DEPENDENCY LEDGER</span><h2>Style invalidations</h2></div>${badge(`${ledger.length} recent`)}</div>${ledger.length ? `<div class="invalidations">${ledger.map(item => `<div class="invalidation-row"><span>${esc(item.stage.replaceAll('_', ' '))}</span><p>${esc(item.reason)}</p><time>${esc(date(item.createdAt))}</time></div>`).join('')}</div>` : '<p class="muted">Changing, revoking or retiring an assigned style marks scene plans, edits, captions treatment, packaging and renders for approved scripts as stale. Nothing has been invalidated yet.</p>'}</section></div>
    <div class="production-notice"><strong>Renderer boundary.</strong> Assigning a style never grants a renderer, provider, asset library or publishing permission. Every renderer is still locked; Documentary Montage (FFmpeg montage) is the first executable target in P05. The owner rule caps reference influence at 30% — competitor patterns can inform a style, never be copied into it.</div>`;
}

// ---------------------------------------------------------------- dialogs
function styleOptions(values, selected, label = styleLabel) { return values.map(value => `<option value="${esc(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${esc(label(value))}</option>`).join(''); }
// The Documentary engine's looks (0.37): "cartoon" here is the cartoon documentary, not the whiteboard's colour cartoon.
// Film looks (0.39): the medium every drawn shot is printed in.
const FILM_LABELS = {none: "None (the engine's own finish)", choose: 'Claude chooses one per video', silent: '1920s silent film', noir: '1940s film noir', sepia: '19th-century photograph', selective: 'Black and white, one colour', newsprint: 'Newspaper print', riso: 'Risograph (two inks)', blueprint: 'Blueprint', woodcut: 'Woodcut print', kinescope: '1950s television', technicolor: 'Technicolor', album: 'Family album snapshot', screenprint: 'Silkscreen poster', engraving: 'Copperplate engraving', deco: 'Art deco gold'};
const filmLabel = value => FILM_LABELS[value] || styleLabel(value);
// The Cinematic engine's colour grades (0.40).
const GRADE_LABELS = {choose: 'Claude chooses one per video', natural: 'Natural', 'teal-orange': 'Teal and orange', golden: 'Golden hour', bleach: 'Bleach bypass', cold: 'Cold thriller', noir: 'Black and white', vintage: 'Vintage film', moody: 'Moody'};
const gradeLabel = value => GRADE_LABELS[value] || styleLabel(value);
const docLabel = value => (value === 'cartoon' ? 'Cartoon documentary' : value === 'mix' ? 'Mix: every documentary look, chosen per scene' : styleLabel(value));
// The fonts offered in every font field (0.64): Windows' own families first, then free ones a look-alike stands in for.
const FONT_GROUPS = {sans: 'clean sans', serif: 'serif', display: 'display', hand: 'handwritten', mono: 'typewriter'};
function styleFontList(v) {
  return `<datalist id="style-font-list">${(v.fonts || []).map(item => `<option value="${esc(item.name)}">${esc(`${FONT_GROUPS[item.group] || item.group}${item.installed ? '' : ` · not on this PC, drawn as ${item.instead}`}`)}</option>`).join('')}</datalist>`;
}
function styleChecks(name, values, selected, label = styleLabel) {
  return `<div class="check-grid">${values.map(value => `<label class="check-chip"><input type="checkbox" name="${name}" value="${esc(value)}" ${selected.includes(value) ? 'checked' : ''}> ${esc(label(value))}</label>`).join('')}</div>`;
}
// 0.62: under a look menu, the looks a mix uses (shown while the menu says mix, or choose for film looks).
function mixTicks(name, menu, values, selected, open, label = styleLabel) {
  return `<div class="full mix-ticks" data-mix-for="${menu}" ${open ? '' : 'hidden'}><span class="field-label">${menu === 's.drawingFilm' ? 'Film looks Claude may choose from' : 'Looks to mix'} <span class="hint">Tick two or more; the video uses only these${menu === 's.drawingFilm' ? '' : ', chosen per scene'}. None ticked: every look.</span></span>${styleChecks(name, values.filter(value => !['mix', 'choose', 'none'].includes(value)), selected || [], label)}</div>`;
}
function styleNumber(name, label, value, min, max, step, hint = '') {
  return `<label>${label}<input name="${name}" type="number" required min="${min}" max="${max}" step="${step}" value="${esc(value)}">${hint ? `<span class="hint">${hint}</span>` : ''}</label>`;
}

function styleEditorBody(spec) {
  const v = state.styles.vocabulary, renderers = state.styles.renderers;
  return `
  <fieldset class="editor-section"><legend>Identity</legend><div class="form-grid">
    <label class="full">Style name<input name="s.name" required minlength="3" maxlength="60" value="${esc(spec.name)}"></label>
    <label class="full">Summary<textarea name="s.summary" required minlength="10" maxlength="400" rows="2">${esc(spec.summary)}</textarea></label>
    <label class="full">Best fit <span class="hint">1-6 entries, separated by commas.</span><input name="s.bestFit" required value="${esc(spec.bestFit.join(', '))}"></label>
    <div class="full"><span class="field-label">Supported formats</span>${styleChecks('s.formats', v.formats, spec.formats)}</div>
    <label class="checkbox-label full"><input type="checkbox" name="s.adaptive" ${spec.adaptive !== false ? 'checked' : ''}>Let the AI design each video <span class="hint">Claude chooses every video's own colours, fonts, pace, energy and caption look for its story, and may use every transition and camera move. The settings below become the channel's starting point and the fallback.</span></label>
  </div></fieldset>
  ${styleFontList(v)}
  <fieldset class="editor-section"><legend>Canvas &amp; pacing</legend><div class="form-grid">
    <label>Frame rate<select name="s.frameRate">${styleOptions(v.frameRates, spec.canvas.frameRate)}</select></label>
    <label>Long-form resolution<select name="s.longFormResolution">${styleOptions(v.resolutions['long-form'], spec.canvas.longFormResolution || '1920x1080')}</select></label>
    <label>Shorts resolution<select name="s.shortsResolution">${styleOptions(v.resolutions.shorts, spec.canvas.shortsResolution || '1080x1920')}</select></label>
    ${styleNumber('s.hookShotMaxSeconds', 'Longest hook shot (s)', spec.pacing.hookShotMaxSeconds, 0.5, 10, 0.1)}
    ${styleNumber('s.shotMinSeconds', 'Shortest shot (s)', spec.pacing.shotMinSeconds, 0.5, 30, 0.1)}
    ${styleNumber('s.shotMaxSeconds', 'Longest shot (s)', spec.pacing.shotMaxSeconds, 0.5, 60, 0.1)}
    ${styleNumber('s.maxStaticHoldSeconds', 'Longest static hold (s)', spec.pacing.maxStaticHoldSeconds, 1, 30, 0.1)}
  </div></fieldset>
  <fieldset class="editor-section"><legend>Transitions &amp; motion</legend><div class="form-grid">
    <div class="full"><span class="field-label">Allowed transitions <span class="hint">A straight cut is always required.</span></span>${styleChecks('s.transitions', [...new Set([...v.transitions, ...spec.transitions.allowed])], spec.transitions.allowed)}</div>
    <label>Default transition<select name="s.defaultTransition">${styleOptions(v.transitions, spec.transitions.default)}</select></label>
    ${styleNumber('s.maxTransitionMs', 'Longest transition (ms)', spec.transitions.maxDurationMs, 0, 2000, 1)}
    <div class="full"><span class="field-label">Camera moves</span>${styleChecks('s.cameraMoves', v.cameraMoves, spec.motion.cameraMoves)}</div>
    ${styleNumber('s.motionIntensity', 'Motion intensity (0-100)', spec.motion.intensity, 0, 100, 1)}
    <label>Easing<select name="s.easing">${styleOptions(v.easing, spec.motion.easing)}</select></label>
  </div></fieldset>
  <fieldset class="editor-section"><legend>Typography &amp; palette</legend><div class="form-grid">
    <label>Heading font<input name="s.headingFont" list="style-font-list" required maxlength="60" value="${esc(spec.typography.headingFont)}"><span class="hint">Pick from the list (${(v.fonts || []).length} fonts) or type one you are licensed to use; a font this PC lacks is drawn in a look-alike.</span></label>
    <label>Body font<input name="s.bodyFont" list="style-font-list" required maxlength="60" value="${esc(spec.typography.bodyFont)}"></label>
    ${styleNumber('s.maxWordsOnScreen', 'Most words on screen', spec.typography.maxWordsOnScreen, 1, 40, 1)}
    <label>Text case<select name="s.textCase">${styleOptions(v.textCase, spec.typography.textCase)}</select></label>
    ${styleNumber('s.minTextHeightPercent', 'Minimum text height (% of frame)', spec.typography.minTextHeightPercent, 2, 15, 0.5)}
    <div class="full palette-inputs">${['background', 'primary', 'accent', 'text'].map(key => `<label>${key[0].toUpperCase() + key.slice(1)}<input type="color" name="s.palette.${key}" value="${esc(spec.palette[key].toLowerCase())}"></label>`).join('')}</div>
    <p class="hint full">Text on background must reach 4.5:1 contrast.</p>
  </div></fieldset>
  <fieldset class="editor-section"><legend>Captions</legend><div class="form-grid">
    <label>Caption mode<select name="s.captionMode">${styleOptions(v.captionModes, spec.captions.mode)}</select></label>
    <label>Position<select name="s.captionPosition">${styleOptions(v.captionPositions, spec.captions.position)}</select></label>
    ${styleNumber('s.maxCharsPerLine', 'Characters per line', spec.captions.maxCharsPerLine, 16, 60, 1)}
    ${styleNumber('s.maxLines', 'Lines', spec.captions.maxLines, 1, 3, 1)}
    ${styleNumber('s.safeAreaPercent', 'Safe area (%)', spec.captions.safeAreaPercent, 5, 20, 1)}
    <label class="checkbox-label"><input type="checkbox" name="s.activeWordHighlight" ${spec.captions.activeWordHighlight ? 'checked' : ''}>Highlight the active word</label>
    <label>Caption look<select name="s.captionTheme">${styleOptions(Object.keys(v.captionThemes || {clean: ''}), spec.captions.theme || 'clean', value => v.captionThemes?.[value] || value)}</select><span class="hint">How burned-in captions look. Sidecar captions (SRT, WebVTT) are drawn by the player.</span></label>
    <label>Caption animation<select name="s.captionAnimation">${styleOptions(Object.keys(v.captionAnimations || {fade: ''}), spec.captions.animation || 'fade', value => v.captionAnimations?.[value] || value)}</select><span class="hint">How each caption arrives: all at once, or word by word on the narrator's words.</span></label>
    <label>Caption font <span class="hint">(optional)</span><input name="s.captionFont" list="style-font-list" maxlength="60" value="${esc(spec.captions.font || '')}" placeholder="the look's own font"></label>
  </div></fieldset>
  <fieldset class="editor-section"><legend>Visual sources</legend><div class="form-grid">
    <div class="full"><span class="field-label">Allowed sources <span class="hint">Stock and AI only; every asset still needs licence evidence.</span></span>${styleChecks('s.sources', v.visualSources, spec.visuals.sources)}</div>
    <label>Primary source<select name="s.primarySource">${styleOptions(v.visualSources, spec.visuals.primarySource)}</select></label>
    <label>AI disclosure<select name="s.aiDisclosure">${styleOptions(v.aiDisclosure, spec.visuals.aiDisclosure)}</select></label>
    <label class="checkbox-label full"><input type="checkbox" name="s.characterConsistency" ${spec.visuals.characterConsistency ? 'checked' : ''}>Keep recurring characters visually consistent</label>
  </div></fieldset>
  <fieldset class="editor-section"><legend>Music &amp; sound</legend><div class="form-grid">
    <label class="full">Music moods <span class="hint">1-6, separated by commas. Licensed music only.</span><input name="s.musicMoods" required value="${esc(spec.audio.musicMoods.join(', '))}"></label>
    ${styleNumber('s.duckingDb', 'Music ducking (dB)', spec.audio.duckingDb, -30, -6, 0.5)}
    ${styleNumber('s.targetLufs', 'Target loudness (LUFS)', spec.audio.targetLufs, -24, -9, 0.5)}
    ${styleNumber('s.truePeakDbtp', 'True-peak ceiling (dBTP)', spec.audio.truePeakDbtp, -3, -0.5, 0.1)}
    <label>Sound effects<select name="s.sfxUsage">${styleOptions(v.sfxUsage, spec.audio.sfxUsage)}</select></label>
  </div></fieldset>
  ${['ffmpeg-sketch', 'story-mix', 'canvas-frames', 'motion-graphics', 'ffmpeg-montage'].includes(spec.renderer.adapter) ? `<fieldset class="editor-section"><legend>${spec.renderer.adapter === 'canvas-frames' ? 'Hand-drawn engine features' : spec.renderer.adapter === 'story-mix' ? 'Story mix: every engine, each in its look' : ['ffmpeg-montage', 'motion-graphics'].includes(spec.renderer.adapter) ? 'Documentary engine features' : 'Stickman engine features'}</legend><div class="form-grid">
    <p class="hint full">${spec.renderer.adapter === 'story-mix' ? 'This style mixes ALL engines in one video. Below, choose the look each engine uses when it appears (one look, or Mix of that engine\'s looks).' : 'This style uses only this engine. Choose one look, or Mix: every look of this engine in one video, picked for each scene. Motion graphics (kinetic words, maps, charts) are part of every engine. To mix all engines, assign the Story Mix style instead.'}</p>
    ${['story-mix', 'motion-graphics', 'ffmpeg-montage'].includes(spec.renderer.adapter) ? `<label>Documentary look<select name="s.drawingDesign">${styleOptions(v.drawingDesigns || ['vector'], spec.drawing?.design || 'vector', docLabel)}</select><span class="hint">One look (footage with motion graphics, cartoon documentary, painted story, vector world, infographic, collage or data desk), or Mix: every documentary look in one video, or only the ones you tick. Footage needs a stock or image key.</span></label>${mixTicks('s.drawingDesigns', 's.drawingDesign', v.drawingDesigns || [], spec.drawing?.designs, spec.drawing?.design === 'mix', docLabel)}` : ''}
    ${!['canvas-frames', 'motion-graphics', 'ffmpeg-montage'].includes(spec.renderer.adapter) ? `<label>Stickman look<select name="s.drawingLook">${styleOptions(v.drawingLooks || ['classic'], spec.drawing?.look || 'classic')}</select><span class="hint">How the stick-figure shots are drawn: one look (classic cartoon, whiteboard, storybook, marker doodle or illustrated), or Mix: every Stickman look in one video (or only the ones you tick), picked for each scene.</span></label>${mixTicks('s.drawingLooks', 's.drawingLook', v.drawingLooks || [], spec.drawing?.looks, spec.drawing?.look === 'mix')}` : ''}
    ${!['ffmpeg-sketch', 'motion-graphics', 'ffmpeg-montage'].includes(spec.renderer.adapter) ? `<label>Whiteboard look<select name="s.drawingBoard">${styleOptions(v.drawingBoards || ['cartoon'], spec.drawing?.board || 'cartoon')}</select><span class="hint">How the hand-drawn engine draws: one look (colour cartoon, black marker, pencil sketch, framed board or dry-erase markers), or Mix: every look in one video (or only the ones you tick), picked for each scene.</span></label>${mixTicks('s.drawingBoards', 's.drawingBoard', v.drawingBoards || [], spec.drawing?.boards, spec.drawing?.board === 'mix')}` : ''}
    ${(v.pictureTypeAdapters || []).includes(spec.renderer.adapter) ? `<label>Picture type<select name="s.drawingPictureType">${styleOptions(v.pictureTypes || ['cartoon'], spec.drawing?.pictureType || 'cartoon', typeLabel)}</select><span class="hint">For every look of this engine: drawn cartoon pictures, natural (realistic scenes painted by ChatGPT, never photos), or a mix where the AI chooses per scene. Natural and Mix need ChatGPT connected for pictures.</span></label>` : ''}
    <label>Film look<select name="s.drawingFilm">${styleOptions(v.drawingFilms || ['none'], spec.drawing?.film || 'none', filmLabel)}</select><span class="hint">How every drawn shot is printed: a silent film, a newspaper, a blueprint, a woodcut, art deco gold and more, or Claude picks the one that suits the story. The colour of the hero (the accent) survives where the medium allows it. Footage keeps its own grade.</span></label>${mixTicks('s.drawingFilms', 's.drawingFilm', v.drawingFilms || [], spec.drawing?.films, spec.drawing?.film === 'choose', filmLabel)}
    <label>Animation cadence<select name="s.drawingCadence">${styleOptions(['full', 'twos', 'threes'], spec.drawing?.cadence || 'full', value => ({full: 'Smooth (every frame)', twos: 'On twos (hand-made 2D feel)', threes: 'On threes (stop-motion feel)'}[value]))}</select><span class="hint">On twos or threes, drawings move in small steps like hand-made animation.</span></label>
    <label class="checkbox-label"><input type="checkbox" name="s.drawingMotionBlur" ${spec.drawing?.motionBlur ?? ['ffmpeg-montage', 'motion-graphics'].includes(spec.renderer.adapter) ? 'checked' : ''}>Motion blur on fast moves (like a film camera)</label>
    ${!['motion-graphics', 'ffmpeg-montage'].includes(spec.renderer.adapter) ? `<label class="checkbox-label"><input type="checkbox" name="s.drawingHand" ${spec.drawing?.hand ? 'checked' : ''}>Show a hand drawing each scene</label>` : '<input type="hidden" name="s.drawingHand" value="">'}
    ${spec.renderer.adapter === 'ffmpeg-sketch' ? '<p class="hint full">Choosing a look fills in its recommended colours, shot lengths and transitions below; you can still change them.</p>' : ''}
  </div></fieldset>` : ''}
  ${spec.renderer.adapter === 'cinematic-hybrid' ? `<fieldset class="editor-section"><legend>Cinematic engine features</legend><div class="form-grid">
    <p class="hint full">This style uses only real footage, cut and graded like a film. Nothing is drawn; titles come from the editing brain. Footage needs a stock key (Pexels and Pixabay keys are free).</p>
    <label>Colour grade<select name="s.cinemaGrade">${styleOptions(v.cinemaGrades || ['choose'], spec.cinema?.grade || 'choose', gradeLabel)}</select><span class="hint">One grade on every clip, so footage from many cameras looks like one film, or Claude picks the grade that suits the story.</span></label>
    ${styleNumber('s.cinemaGrain', 'Film grain (0-100)', spec.cinema?.grain ?? 30, 0, 100, 1)}
    <label class="checkbox-label"><input type="checkbox" name="s.cinemaLetterbox" ${spec.cinema?.letterbox !== false ? 'checked' : ''}>Cinema bars (2.39:1) on long videos</label>
  </div></fieldset>` : ''}
  <fieldset class="editor-section"><legend>Planning brief</legend><div class="form-grid">
    <label class="full">Brief for Claude's planner <span class="hint">Optional, up to 1,200 characters. A style made from an approved style study carries what was learned here, in our own words.</span><textarea name="s.brief" rows="4" maxlength="1200">${esc(spec.brief || '')}</textarea></label>
  </div></fieldset>
  <fieldset class="editor-section"><legend>Renderer &amp; quality checks</legend><div class="form-grid">
    <label class="full">Renderer adapter<select name="s.renderer">${Object.entries(renderers).map(([key, item]) => `<option value="${esc(key)}" ${key === spec.renderer.adapter ? 'selected' : ''}>${esc(item.name)} (${esc(item.milestone)}${item.firstProof ? ', first proof' : ''})</option>`).join('')}</select><span class="hint">The renderer must support every format, frame rate, transition and camera move you chose.</span></label>
    ${styleNumber('s.maxBlackSeconds', 'Longest black (s)', spec.qc.maxBlackSeconds, 0, 5, 0.1)}
    ${styleNumber('s.maxFrozenSeconds', 'Longest frozen frame (s)', spec.qc.maxFrozenSeconds, 0, 15, 0.1)}
    ${styleNumber('s.minSceneSeconds', 'Shortest scene (s)', spec.qc.minSceneSeconds, 0.5, 30, 0.1)}
    ${styleNumber('s.maxSceneSeconds', 'Longest scene (s)', spec.qc.maxSceneSeconds, 2, 120, 0.1)}
    ${styleNumber('s.contactSheetEverySeconds', 'Contact sheet every (s)', spec.qc.contactSheetEverySeconds, 1, 30, 0.5)}
  </div></fieldset>
  <fieldset class="editor-section"><legend>Originality guard</legend><div class="form-grid">
    ${styleNumber('s.referenceSharePercent', `Reference share (%) <span class="hint">Owner rule: at most ${v.referenceLimit}%.</span>`, spec.originality.referenceSharePercent, 0, v.referenceLimit, 1)}
    <label class="full">Prohibited techniques <span class="hint">One per line.</span><textarea name="s.prohibited" rows="3" required>${esc(spec.originality.prohibited.join('\n'))}</textarea></label>
  </div></fieldset>`;
}

function collectStyleSpec(form) {
  const value = name => form.elements[name].value;
  const num = name => Number(form.elements[name].value);
  const checked = name => [...form.querySelectorAll(`input[name="${name}"]:checked`)].map(input => input.value);
  const list = (name, separator) => value(name).split(separator).map(item => item.trim()).filter(Boolean);
  return {
    name: value('s.name'), summary: value('s.summary'), bestFit: list('s.bestFit', ','), formats: checked('s.formats'),
    canvas: {frameRate: num('s.frameRate'), longFormResolution: value('s.longFormResolution'), shortsResolution: value('s.shortsResolution')},
    pacing: {shotMinSeconds: num('s.shotMinSeconds'), shotMaxSeconds: num('s.shotMaxSeconds'), hookShotMaxSeconds: num('s.hookShotMaxSeconds'), maxStaticHoldSeconds: num('s.maxStaticHoldSeconds')},
    transitions: {allowed: checked('s.transitions'), default: value('s.defaultTransition'), maxDurationMs: num('s.maxTransitionMs')},
    motion: {cameraMoves: checked('s.cameraMoves'), intensity: num('s.motionIntensity'), easing: value('s.easing')},
    typography: {headingFont: value('s.headingFont'), bodyFont: value('s.bodyFont'), maxWordsOnScreen: num('s.maxWordsOnScreen'), textCase: value('s.textCase'), minTextHeightPercent: num('s.minTextHeightPercent')},
    palette: Object.fromEntries(['background', 'primary', 'accent', 'text'].map(key => [key, value(`s.palette.${key}`).toUpperCase()])),
    captions: {mode: value('s.captionMode'), maxCharsPerLine: num('s.maxCharsPerLine'), maxLines: num('s.maxLines'), position: value('s.captionPosition'), activeWordHighlight: form.elements['s.activeWordHighlight'].checked, safeAreaPercent: num('s.safeAreaPercent'), ...(form.elements['s.captionTheme'] && value('s.captionTheme') !== 'clean' ? {theme: value('s.captionTheme')} : {}), ...(form.elements['s.captionAnimation'] && value('s.captionAnimation') !== 'fade' ? {animation: value('s.captionAnimation')} : {}), ...(form.elements['s.captionFont']?.value.trim() ? {font: value('s.captionFont').trim()} : {})},
    visuals: {sources: checked('s.sources'), primarySource: value('s.primarySource'), aiDisclosure: value('s.aiDisclosure'), characterConsistency: form.elements['s.characterConsistency'].checked},
    audio: {musicMoods: list('s.musicMoods', ','), duckingDb: num('s.duckingDb'), targetLufs: num('s.targetLufs'), truePeakDbtp: num('s.truePeakDbtp'), sfxUsage: value('s.sfxUsage')},
    renderer: {adapter: value('s.renderer')},
    ...(form.elements['s.drawingHand'] ? {drawing: {look: form.elements['s.drawingLook'] ? value('s.drawingLook') : 'classic', hand: form.elements['s.drawingHand'].checked === true, ...(form.elements['s.drawingBoard'] ? {board: value('s.drawingBoard')} : {}), ...(form.elements['s.drawingDesign'] ? {design: value('s.drawingDesign')} : {}), ...(form.elements['s.drawingFilm'] && value('s.drawingFilm') !== 'none' ? {film: value('s.drawingFilm')} : {}), ...(form.elements['s.drawingPictureType'] && value('s.drawingPictureType') !== 'cartoon' ? {pictureType: value('s.drawingPictureType')} : {}), ...Object.fromEntries([['looks', 's.drawingLook', 'mix'], ['boards', 's.drawingBoard', 'mix'], ['designs', 's.drawingDesign', 'mix'], ['films', 's.drawingFilm', 'choose']].filter(([, menu, when]) => form.elements[menu] && value(menu) === when && checked(`${menu}s`).length).map(([field, menu]) => [field, checked(`${menu}s`)])), ...(form.elements['s.drawingCadence'] && value('s.drawingCadence') !== 'full' ? {cadence: value('s.drawingCadence')} : {}), ...(form.elements['s.drawingMotionBlur'] ? {motionBlur: form.elements['s.drawingMotionBlur'].checked} : {})}} : {}),
    ...(form.elements['s.cinemaGrade'] ? {cinema: {grade: value('s.cinemaGrade'), grain: num('s.cinemaGrain'), letterbox: form.elements['s.cinemaLetterbox'].checked}} : {}),
    ...(value('s.brief').trim() ? {brief: value('s.brief').trim()} : {}),
    ...(form.elements['s.adaptive'] ? {adaptive: form.elements['s.adaptive'].checked} : {}),
    qc: {maxBlackSeconds: num('s.maxBlackSeconds'), maxFrozenSeconds: num('s.maxFrozenSeconds'), minSceneSeconds: num('s.minSceneSeconds'), maxSceneSeconds: num('s.maxSceneSeconds'), contactSheetEverySeconds: num('s.contactSheetEverySeconds')},
    originality: {referenceSharePercent: num('s.referenceSharePercent'), prohibited: list('s.prohibited', /\r?\n/)},
  };
}

function styleResetForm(form) {
  form.reset();
  const error = form.querySelector('.form-error');
  if (error) error.hidden = true;
}

function styleEditorDialog(mode, profileId) {
  const profile = styleProfiles().find(item => item.id === profileId) || styleProfiles().find(item => item.key === 'documentary-montage') || styleProfiles()[0];
  if (!profile) return toast('The style library is not available yet.', true);
  const latest = profile.revisions.at(-1), form = document.getElementById('style-editor-form'), spec = structuredClone(latest.spec);
  styleResetForm(form);
  if (mode !== 'revise') spec.name = mode === 'duplicate' ? `${spec.name} (custom)`.slice(0, 60) : 'New custom style';
  form.elements.mode.value = mode;
  form.elements.profileId.value = profile.id;
  form.elements.expectedRevision.value = latest.revision;
  form.elements.baseRevisionId.value = mode === 'duplicate' ? latest.id : '';
  document.getElementById('style-editor-heading').textContent = mode === 'revise' ? `New revision of ${latest.spec.name}` : mode === 'duplicate' ? `Duplicate ${latest.spec.name}` : 'Create a custom style';
  document.getElementById('style-editor-kicker').textContent = mode === 'revise' ? `CREATES DRAFT r${latest.revision + 1} · r${latest.revision} STAYS UNCHANGED` : `STARTS FROM ${latest.spec.name.toUpperCase()} r${latest.revision}`;
  document.getElementById('style-editor-body').innerHTML = styleEditorBody(spec);
  form.elements.changeNote.value = '';
  document.getElementById('style-editor-dialog').showModal();
}

function styleSpecRows(spec) {
  const rows = [
    ['Formats', spec.formats.map(format => `${styleLabel(format)} (${state.styles.vocabulary.aspect[format]})`).join(', ')],
    ['Resolution', [spec.canvas.longFormResolution && `Long-form ${spec.canvas.longFormResolution}`, spec.canvas.shortsResolution && `Shorts ${spec.canvas.shortsResolution}`].filter(Boolean).join(' · ') + ` · ${spec.canvas.frameRate} fps`],
    ['Pacing', `Shots ${spec.pacing.shotMinSeconds}-${spec.pacing.shotMaxSeconds}s · hook shot ≤ ${spec.pacing.hookShotMaxSeconds}s · static hold ≤ ${spec.pacing.maxStaticHoldSeconds}s`],
    ['Transitions', `${transitionList(spec)} · default ${styleLabel(spec.transitions.default)} · ≤ ${spec.transitions.maxDurationMs} ms`],
    ['Motion', `${spec.motion.cameraMoves.map(styleLabel).join(', ')} · intensity ${spec.motion.intensity}/100 · ${styleLabel(spec.motion.easing)}`],
    ['Typography', `${spec.typography.headingFont} / ${spec.typography.bodyFont} · ≤ ${spec.typography.maxWordsOnScreen} words · ${styleLabel(spec.typography.textCase)} · ≥ ${spec.typography.minTextHeightPercent}% height`],
    ['Palette', `${spec.palette.background} background · ${spec.palette.primary} primary · ${spec.palette.accent} accent · ${spec.palette.text} text`],
    ['Captions', `${styleLabel(spec.captions.mode)} · ${spec.captions.maxLines} × ${spec.captions.maxCharsPerLine} chars · ${styleLabel(spec.captions.position)} · safe area ${spec.captions.safeAreaPercent}%${spec.captions.activeWordHighlight ? ' · active-word highlight' : ''}`],
    ['Visuals', `${spec.visuals.sources.map(styleLabel).join(', ')} · primary ${styleLabel(spec.visuals.primarySource)} · AI disclosure: ${styleLabel(spec.visuals.aiDisclosure).toLowerCase()} · licence evidence required${spec.visuals.characterConsistency ? ' · consistent characters' : ''}`],
    ['Audio', `${spec.audio.musicMoods.join(', ')} · ducking ${spec.audio.duckingDb} dB · ${spec.audio.targetLufs} LUFS · ≤ ${spec.audio.truePeakDbtp} dBTP · SFX ${styleLabel(spec.audio.sfxUsage).toLowerCase()} · licensed only`],
    ['Renderer', `${state.styles.renderers[spec.renderer.adapter].name} — ${state.styles.renderers[spec.renderer.adapter].note}`],
    ...(spec.brief ? [['Planning brief', spec.brief]] : []),
    ...(spec.drawing ? [['Stickman drawing', `${styleLabel(spec.drawing.look)} look · ${spec.drawing.hand ? 'a hand draws each scene' : 'no drawing hand'}`]] : []),
    ['QC thresholds', `Black ≤ ${spec.qc.maxBlackSeconds}s · frozen ≤ ${spec.qc.maxFrozenSeconds}s · scenes ${spec.qc.minSceneSeconds}-${spec.qc.maxSceneSeconds}s · contact sheet every ${spec.qc.contactSheetEverySeconds}s`],
    ['Originality', `Reference share ≤ ${spec.originality.referenceSharePercent}% · prohibited: ${spec.originality.prohibited.join('; ')}`],
  ];
  return `<table class="spec-table"><tbody>${rows.map(([label, value]) => `<tr><th>${esc(label)}</th><td>${esc(value)}</td></tr>`).join('')}</tbody></table>`;
}

function styleSpecDialog(profileId, revisionId = null) {
  const profile = styleProfiles().find(item => item.id === profileId);
  if (!profile) return toast('That style is no longer available.', true);
  const revision = profile.revisions.find(item => item.id === revisionId) || profile.revisions.at(-1);
  const review = revision.review ? `<p class="muted">Approved by ${esc(revision.review.approvedBy)} · ${esc(date(revision.review.approvedAt))}${revision.review.notes ? ` · “${esc(revision.review.notes)}”` : ''}</p>` : '';
  const retirement = revision.retirement ? `<p class="inline-warning">Retired by ${esc(revision.retirement.retiredBy)} · ${esc(date(revision.retirement.retiredAt))} · ${esc(revision.retirement.reason)}</p>` : '';
  const changes = revision.changes.length ? `<div class="diff-list"><span class="micro-label">Changes from r${revision.revision - 1}</span>${revision.changes.map(change => `<div><code>${esc(change.path)}</code><span>${esc(JSON.stringify(change.before))} → ${esc(JSON.stringify(change.after))}</span></div>`).join('')}</div>` : '';
  document.getElementById('style-spec-heading').textContent = `${revision.spec.name} · r${revision.revision}`;
  document.getElementById('style-spec-body').innerHTML = `
    <div class="card-top spec-top">${stylePalette(revision.spec, true)}${badge(styleLabel(revision.status), revision.status === 'approved' ? 'green' : revision.status === 'draft' ? 'orange' : 'gray')}</div>
    <p>${esc(revision.spec.summary)}</p>
    <p class="muted">Created by ${esc(revision.createdBy)} · ${esc(date(revision.createdAt))} · “${esc(revision.changeNote)}” · spec ${esc(revision.specHash.slice(0, 12))}</p>
    ${review}${retirement}${changes}${styleSpecRows(revision.spec)}
    <div class="revision-tabs"><span class="micro-label">Revision history</span>${profile.revisions.map(item => `<button type="button" class="button ${item.id === revision.id ? 'primary' : 'secondary'}" data-style-revision="${esc(item.id)}" data-style-profile="${esc(profile.id)}">r${item.revision} · ${esc(styleLabel(item.status).split(' ·')[0])}${item.usage.active ? ` · ${item.usage.active} in use` : ''}</button>`).join('')}</div>`;
  const dialog = document.getElementById('style-spec-dialog');
  applySwatches(dialog);
  if (!dialog.open) dialog.showModal();
}

function styleReviewDialog(revisionId) {
  const found = styleRevisionById(revisionId);
  if (!found || found.revision.status !== 'draft') return toast('Only a current draft revision can be reviewed.', true);
  const form = document.getElementById('style-review-form');
  styleResetForm(form);
  form.elements.revisionId.value = revisionId;
  document.getElementById('style-review-heading').textContent = `Review ${found.revision.spec.name} r${found.revision.revision}`;
  document.getElementById('style-review-summary').innerHTML = `${found.revision.changes.length ? `<div class="diff-list"><span class="micro-label">${found.revision.changes.length} change${found.revision.changes.length === 1 ? '' : 's'} from r${found.revision.revision - 1}</span>${found.revision.changes.map(change => `<div><code>${esc(change.path)}</code><span>${esc(JSON.stringify(change.before))} → ${esc(JSON.stringify(change.after))}</span></div>`).join('')}</div>` : ''}${styleSpecRows(found.revision.spec)}`;
  document.getElementById('style-review-dialog').showModal();
}

function styleAssignDialog(familyId, scope) {
  const family = state.families.find(item => item.id === familyId);
  if (!family) return toast('That family is no longer available.', true);
  const form = document.getElementById('style-assign-form');
  styleResetForm(form);
  const current = scope === 'family' ? styleActive(family.id) : null;
  const familyDefault = styleActive(family.id);
  const candidates = styleProfiles().flatMap(profile => profile.revisions.filter(item => item.status === 'approved' && item.spec.formats.includes(family.format)).map(item => ({profile, revision: item})))
    .filter(item => scope === 'family' ? item.revision.id !== current?.revisionId : item.revision.id !== familyDefault?.revisionId);
  if (!candidates.length) return toast(`No approved style supports ${family.format}${scope === 'channel' ? ' besides the family default' : ''}. Review and approve a style in the library first.`, true);
  const extraLocales = family.locales.slice(1);
  form.elements.familyId.value = family.id;
  form.elements.familyRevision.value = family.revision;
  form.elements.scope.value = scope;
  form.elements.expectedAssignmentId.value = current?.id || '';
  form.elements.revisionId.innerHTML = candidates.map(item => `<option value="${esc(item.revision.id)}">${esc(item.revision.spec.name)} r${item.revision.revision}</option>`).join('');
  form.elements.locale.innerHTML = extraLocales.map(locale => `<option value="${esc(locale)}">${esc(localeName(locale))}</option>`).join('');
  form.querySelectorAll('[data-style-scope="channel"]').forEach(element => { element.hidden = scope !== 'channel'; });
  form.elements.locale.required = scope === 'channel';
  form.elements.separateProductionAcknowledged.required = scope === 'channel';
  document.getElementById('style-assign-heading').textContent = scope === 'family' ? (current ? `Change ${family.name}'s default style` : `Assign ${family.name}'s default style`) : `Add a channel override for ${family.name}`;
  document.getElementById('style-assign-note').textContent = scope === 'family'
    ? (current ? 'The previous assignment is kept in the history. Approved scripts in this family get stale-marks for scenes, edits, captions treatment, packaging and renders built on the old style.' : 'Every configured channel edition inherits this default. Only approved revisions that support this family\'s format are listed.')
    : 'An override gives one additional channel its own visual production. That means separate scenes, renders, cost and approvals for that channel.';
  styleAssignPreview();
  document.getElementById('style-assign-dialog').showModal();
}
function styleAssignPreview() {
  const form = document.getElementById('style-assign-form'), found = styleRevisionById(form.elements.revisionId.value);
  const preview = document.getElementById('style-assign-preview');
  preview.innerHTML = found ? `${stylePalette(found.revision.spec)}<strong>${esc(found.revision.spec.name)} r${found.revision.revision}</strong><p class="muted">${esc(found.revision.spec.summary)}</p>${styleFacts(found.revision.spec)}` : '';
  applySwatches(preview);
}

function styleFallbackDialog(assignmentId) {
  const assignment = (state.styles?.assignments || []).find(item => item.id === assignmentId && item.status === 'active');
  const family = assignment && state.families.find(item => item.id === assignment.familyId);
  if (!assignment || !family) return toast('That assignment is no longer active.', true);
  const form = document.getElementById('style-fallback-form');
  styleResetForm(form);
  const candidates = styleProfiles().flatMap(profile => profile.revisions.filter(item => item.status === 'approved' && item.id !== assignment.revisionId && item.spec.formats.includes(family.format)).map(item => ({profile, revision: item})));
  form.elements.assignmentId.value = assignment.id;
  form.elements.familyRevision.value = family.revision;
  form.elements.fallbackRevisionId.innerHTML = `${assignment.fallback ? '<option value="">Clear the fallback</option>' : ''}${candidates.map(item => `<option value="${esc(item.revision.id)}" ${assignment.fallback?.revisionId === item.revision.id ? 'selected' : ''}>${esc(item.revision.spec.name)} r${item.revision.revision}</option>`).join('')}`;
  if (!form.elements.fallbackRevisionId.options.length) return toast('Approve a second style that supports this format before choosing a fallback.', true);
  document.getElementById('style-fallback-dialog').showModal();
}

function styleDecisionDialog(kind, id) {
  const form = document.getElementById('style-decision-form');
  styleResetForm(form);
  form.elements.kind.value = kind;
  form.elements.targetId.value = id;
  let heading, note;
  if (kind === 'retire') {
    const found = styleRevisionById(id);
    if (!found) return toast('That revision is no longer available.', true);
    heading = `Retire ${found.revision.spec.name} r${found.revision.revision}`;
    note = found.revision.usage.active ? `This revision is assigned to ${found.revision.usage.active} family or channel. Those handoffs will be blocked until you assign a current revision — nothing switches automatically.` : 'A retired revision stays in the history but can no longer be assigned.';
  } else {
    const assignment = (state.styles?.assignments || []).find(item => item.id === id && item.status === 'active');
    const family = assignment && state.families.find(item => item.id === assignment.familyId);
    if (!assignment || !family) return toast('That assignment is no longer active.', true);
    form.elements.familyRevision.value = family.revision;
    heading = assignment.scope === 'family' ? `Revoke ${family.name}'s default style` : `Revoke the ${assignment.locale} override`;
    note = assignment.scope === 'family' ? 'Scene planning for this family will be blocked until you assign a new default.' : 'That channel will inherit the family default again; its separate visual production becomes stale.';
  }
  document.getElementById('style-decision-heading').textContent = heading;
  document.getElementById('style-decision-note').textContent = note;
  document.getElementById('style-decision-dialog').showModal();
}

// Handles every data-action that starts with "style-"; called from app.js.
function styleAction(command, id) {
  const family = state.families.find(item => item.id === id);
  if (command === 'style-view') return styleSpecDialog(id);
  if (command === 'style-approve') return styleReviewDialog(id);
  if (command === 'style-revise') return styleEditorDialog('revise', id);
  if (command === 'style-duplicate') return styleEditorDialog('duplicate', id);
  if (command === 'style-new') return styleEditorDialog('new', null);
  if (command === 'style-retire') return styleDecisionDialog('retire', id);
  if (command === 'style-revoke') return styleDecisionDialog('revoke', id);
  if (command === 'style-fallback') return styleFallbackDialog(id);
  if (command === 'style-assign') return family ? styleAssignDialog(id, 'family') : toast('That family is no longer available.', true);
  if (command === 'style-override') return family ? styleAssignDialog(id, 'channel') : toast('That family is no longer available.', true);
  return toast('Unknown style action.', true);
}

document.getElementById('style-editor-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  saveForm(form, async () => {
    const spec = collectStyleSpec(form), mode = form.elements.mode.value;
    const body = {spec, changeNote: form.elements.changeNote.value, createdBy: form.elements.createdBy.value};
    if (mode === 'revise') await api(`/api/styles/${form.elements.profileId.value}/revisions`, {...body, expectedRevision: Number(form.elements.expectedRevision.value)});
    else await api('/api/styles', {...body, baseRevisionId: form.elements.baseRevisionId.value || null});
  });
});
document.getElementById('style-review-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  saveForm(form, () => api(`/api/style-revisions/${form.elements.revisionId.value}/approve`, {
    approvedBy: form.elements.approvedBy.value, notes: form.elements.notes.value,
    confirmations: {specReviewed: form.elements.specReviewed.checked, rightsReviewed: form.elements.rightsReviewed.checked, originalityReviewed: form.elements.originalityReviewed.checked},
  }));
});
document.getElementById('style-assign-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget, scope = form.elements.scope.value;
  saveForm(form, () => api(`/api/families/${form.elements.familyId.value}/style-assignments`, {
    familyRevision: Number(form.elements.familyRevision.value), scope, revisionId: form.elements.revisionId.value,
    expectedAssignmentId: form.elements.expectedAssignmentId.value || null, assignedBy: form.elements.assignedBy.value, reason: form.elements.reason.value,
    ...(scope === 'channel' ? {locale: form.elements.locale.value, separateProductionAcknowledged: form.elements.separateProductionAcknowledged.checked} : {}),
  }));
});
document.getElementById('style-assign-form').elements.revisionId.addEventListener('change', styleAssignPreview);
document.getElementById('style-fallback-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget, fallbackRevisionId = form.elements.fallbackRevisionId.value || null;
  saveForm(form, () => api(`/api/style-assignments/${form.elements.assignmentId.value}/fallback`, {
    familyRevision: Number(form.elements.familyRevision.value), fallbackRevisionId, approvedBy: form.elements.approvedBy.value,
    reason: form.elements.reason.value, confirmManualActivation: form.elements.confirmManualActivation.checked,
  }));
});
document.getElementById('style-decision-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget, kind = form.elements.kind.value, id = form.elements.targetId.value;
  saveForm(form, () => kind === 'retire'
    ? api(`/api/style-revisions/${id}/retire`, {retiredBy: form.elements.person.value, reason: form.elements.reason.value})
    : api(`/api/style-assignments/${id}/revoke`, {revokedBy: form.elements.person.value, reason: form.elements.reason.value, familyRevision: Number(form.elements.familyRevision.value)}));
});
document.getElementById('style-spec-dialog').addEventListener('click', event => {
  const button = event.target.closest('[data-style-revision]');
  if (button) styleSpecDialog(button.dataset.styleProfile, button.dataset.styleRevision);
});

// A Stickman look fills in its recommended colours, shot lengths, transitions and motion in the editor (the owner
// can still change them before saving the revision).
document.addEventListener('change', event => {
  const ticks = event.target.form?.querySelector(`[data-mix-for="${event.target.name}"]`);
  if (ticks) ticks.hidden = event.target.value !== (event.target.name === 's.drawingFilm' ? 'choose' : 'mix');
  if (event.target.name !== 's.drawingLook') return;
  const form = event.target.form, preset = state.styles?.vocabulary?.lookPresets?.[event.target.value];
  if (!form || !preset || form.elements['s.renderer']?.value !== 'ffmpeg-sketch') return;
  const set = (name, value) => { if (form.elements[name]) form.elements[name].value = value; };
  for (const key of ['background', 'primary', 'accent', 'text']) set(`s.palette.${key}`, preset.palette[key].toLowerCase());
  for (const key of ['shotMinSeconds', 'shotMaxSeconds', 'hookShotMaxSeconds', 'maxStaticHoldSeconds']) set(`s.${key}`, preset.pacing[key]);
  form.querySelectorAll('input[name="s.transitions"]').forEach(box => { box.checked = preset.transitions.allowed.includes(box.value); });
  set('s.defaultTransition', preset.transitions.default);
  set('s.maxTransitionMs', preset.transitions.maxDurationMs);
  set('s.motionIntensity', preset.intensity);
  if (form.elements['s.drawingHand']) form.elements['s.drawingHand'].checked = preset.hand;
});

// 0.62 (owner request 2026-10-28, point 4): the channel's editing style chosen from its page in one window - the
// engine, its ticked looks, picture type (0.63) and film looks - saved for this channel (its own copy) or for every channel (a new
// revision of the library style), then approved by name and assigned through Room 03's own routes.
const FS_GROUPS = [['looks', 'look', 'drawingLooks', 'Stickman looks', ['ffmpeg-sketch', 'story-mix']], ['boards', 'board', 'drawingBoards', 'Whiteboard looks', ['canvas-frames', 'story-mix']], ['designs', 'design', 'drawingDesigns', 'Documentary looks', ['ffmpeg-montage', 'story-mix']]];
const fsLabel = field => (field === 'designs' ? docLabel : styleLabel);
const fsProfiles = () => styleProfiles().filter(profile => !(profile.origin === 'launch' && profile.revisions.every(item => item.status === 'retired')));
const fsLatest = profile => profile.revisions.find(item => item.id === profile.latestRevisionId) || profile.revisions.at(-1);
// What the spec has ticked today: one look, a mix of ticked ones, or (mix of all) every one.
function fsTicked(spec, field, single, all) {
  const drawing = spec.drawing || {};
  if (drawing[field]?.length) return drawing[field];
  if (drawing[single] === 'mix') return all.filter(value => value !== 'mix');
  return drawing[single] ? [drawing[single]] : [];
}
const typeLabel = value => ({cartoon: 'Cartoon (drawn)', natural: 'Natural (realistic, painted by ChatGPT)', mix: 'Mix (the AI chooses per scene)'}[value] || value);
const fsTypes = spec => ({natural: ['natural'], mix: ['cartoon', 'natural']}[spec.drawing?.pictureType] || ['cartoon']);
function familyStyleBody(form) {
  const family = state.families.find(item => item.id === form.elements.familyId.value), profiles = fsProfiles(), v = state.styles.vocabulary;
  const chosen = profiles.find(profile => profile.id === form.dataset.profileId) || profiles[0], spec = fsLatest(chosen).spec, adapter = spec.renderer.adapter;
  const engines = `<fieldset class="setup-choice"><legend>Editing engine</legend>${profiles.map(profile => { const latest = fsLatest(profile); return `<label class="radio-card"><input type="radio" name="profileId" value="${esc(profile.id)}" ${profile.id === chosen.id ? 'checked' : ''}><span><strong>${esc(profile.name)}</strong><small>${esc(latest.spec.summary || '')}</small></span></label>`; }).join('')}</fieldset>`;
  const groups = FS_GROUPS.filter(([, , , , adapters]) => adapters.includes(adapter)).map(([field, single, vocab, title]) => {
    const all = v[vocab] || [], ticked = fsTicked(spec, field, single, all);
    return `<div class="full"><span class="field-label">${title} <span class="hint">Tick one for one look, or two or more to mix only those in this engine, chosen per scene.</span></span>${styleChecks(`fs.${field}`, all.filter(value => value !== 'mix'), ticked, fsLabel(field))}</div>`;
  }).join('');
  // 0.63: the engine's picture type, for every look it uses: tick Cartoon, Natural, or both for a mix chosen per scene.
  const types = (v.pictureTypeAdapters || []).includes(adapter) ? `<div class="full"><span class="field-label">Picture type <span class="hint">For every look of this engine. Cartoon: drawn pictures. Natural: realistic scenes painted by ChatGPT (not photos). Both: the AI chooses per scene.</span></span>${styleChecks('fs.types', ['cartoon', 'natural'], fsTypes(spec), typeLabel)}</div>` : '';
  // 0.64: Claude designs each video (colours, fonts, pace, energy, captions); on unless the owner said no.
  const adaptive = `<label class="checkbox-label full"><input type="checkbox" name="fs.adaptive" ${spec.adaptive !== false ? 'checked' : ''}>Let the AI design each video <span class="hint">Colours, fonts, pace, energy, transitions and caption look are chosen for every story, so no two videos are a template. This style's own settings stay the starting point.</span></label>`;
  const films = adapter === 'cinematic-hybrid' ? '' : `<div class="full"><span class="field-label">Film looks <span class="hint">None: no film look. One: every drawn shot in it. Two or more: Claude chooses one of them for each video.</span></span>${styleChecks('fs.films', (v.drawingFilms || []).filter(value => !['none', 'choose'].includes(value)), fsTicked(spec, 'films', 'film', []).filter(value => value !== 'choose'), filmLabel)}</div>`;
  $('#family-style-heading').textContent = `Editing style for ${family?.name || 'this channel'}`;
  $('#family-style-body').innerHTML = `${engines}<div class="form-grid">${groups}${types}${films}${adaptive}</div><p class="card-actions">${action('⚙ All settings of this style', 'style-revise', chosen.id, 'secondary')}<span class="hint">Colours, pacing, captions, sound and every other setting, as a new draft revision in the style editor.</span></p>`;
}
function familyStyleDialog(familyId) {
  const form = $('#family-style-form'), current = styleActive(familyId), found = current && styleRevisionById(current.revisionId);
  form.reset(); form.querySelector('.form-error').hidden = true; form.elements.familyId.value = familyId;
  form.dataset.profileId = found?.profile.id || fsProfiles()[0]?.id || '';
  delete form.dataset.revisionId;
  familyStyleBody(form);
  $('#family-style-dialog').showModal();
}
// The spec with the owner's ticks: one = that look, two or more = a mix of only those; nothing ticked keeps the look.
function familyStyleSpec(form, base) {
  const spec = structuredClone(base), boxes = name => [...form.querySelectorAll(`input[name="${name}"]:checked`)].map(input => input.value);
  for (const [field, single, , , adapters] of FS_GROUPS) {
    if (!adapters.includes(spec.renderer.adapter)) continue;
    const ticked = boxes(`fs.${field}`);
    if (!ticked.length) continue;
    spec.drawing ||= {look: 'classic', hand: false};
    delete spec.drawing[field];
    if (ticked.length === 1) spec.drawing[single] = ticked[0];
    else { spec.drawing[single] = 'mix'; spec.drawing[field] = ticked; }
  }
  const adaptive = form.querySelector('input[name="fs.adaptive"]');
  if (adaptive) spec.adaptive = adaptive.checked;
  const types = boxes('fs.types');
  if (types.length && (state.styles.vocabulary.pictureTypeAdapters || []).includes(spec.renderer.adapter)) {
    spec.drawing ||= {look: 'classic', hand: false};
    delete spec.drawing.pictureType;
    if (types.length > 1) spec.drawing.pictureType = 'mix';
    else if (types[0] === 'natural') spec.drawing.pictureType = 'natural';
  }
  if (spec.renderer.adapter !== 'cinematic-hybrid') {
    const films = boxes('fs.films');
    if (films.length || spec.drawing?.film) {
      spec.drawing ||= {look: 'classic', hand: false};
      delete spec.drawing.films; delete spec.drawing.film;
      if (films.length === 1) spec.drawing.film = films[0];
      else if (films.length > 1) { spec.drawing.film = 'choose'; spec.drawing.films = films; }
    }
  }
  return spec;
}
document.addEventListener('change', event => {
  const form = event.target.form;
  if (form?.id !== 'family-style-form' || event.target.name !== 'profileId') return;
  form.dataset.profileId = event.target.value;
  familyStyleBody(form);
});
document.getElementById('family-style-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  saveForm(form, async () => {
    const data = Object.fromEntries(new FormData(form)), family = state.families.find(item => item.id === data.familyId);
    const profile = fsProfiles().find(item => item.id === form.dataset.profileId), latest = fsLatest(profile);
    const confirmations = {specReviewed: true, rightsReviewed: true, originalityReviewed: true};
    // A revision made by an earlier try of this window is reused, so a failed step never makes a second one.
    let revision = form.dataset.revisionId ? styleRevisionById(form.dataset.revisionId)?.revision || null : null;
    if (!revision) {
      // The channel's own copy is named "<channel> · <engine style>"; saving for the channel revises it (keeping its
      // own settings) or makes it from the chosen style; saving for every channel revises the chosen style.
      const prefix = `${family.name} · `, ownName = profile.name.startsWith(prefix) ? profile.name : `${prefix}${profile.name.split(' · ')[0]}`.slice(0, 60);
      const target = data.saveFor === 'all' ? profile : fsProfiles().find(item => item.name === ownName) || null;
      if (target) {
        const head = fsLatest(target), spec = familyStyleSpec(form, head.spec);
        revision = JSON.stringify(spec) === JSON.stringify(head.spec) ? head : await api(`/api/styles/${target.id}/revisions`, {spec, createdBy: data.person, changeNote: data.reason, expectedRevision: head.revision});
      } else revision = await api('/api/styles', {spec: {...familyStyleSpec(form, latest.spec), name: ownName}, createdBy: data.person, changeNote: data.reason, baseRevisionId: latest.id});
      form.dataset.revisionId = revision.id;
    }
    if (revision.status === 'draft') revision = await api(`/api/style-revisions/${revision.id}/approve`, {approvedBy: data.person, notes: data.reason, confirmations});
    if (revision.status !== 'approved') throw new Error(`This revision is ${revision.status}; choose another style.`);
    const current = styleActive(family.id);
    if (current?.revisionId !== revision.id) await api(`/api/families/${family.id}/style-assignments`, {scope: 'family', assignedBy: data.person, reason: data.reason, revisionId: revision.id, familyRevision: family.revision, expectedAssignmentId: current?.id || null});
    delete form.dataset.revisionId;
  }, 'Style saved, approved and assigned to this channel.');
});
