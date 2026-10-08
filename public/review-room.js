'use strict';
// Room 08 - Review & QC (P09): one timecoded issue list with repair links, the narration aligned with its
// captions, clips, graphics and frames, and the style-proof verdict (the one approval; there is no second chain).
// Loaded before app.js; helpers from app.js, render-room.js and editing-room.js are used only inside functions.

const qcReports = {};
const QC_STATUS = {blocked: ['Blocked', 'gray'], 'awaiting-verdict': ['Ready for your verdict', 'orange'], approved: ['Approved', 'green'], 'changes-requested': ['Changes requested', 'orange']};
const QC_SEVERITY = {critical: ['Critical', 'gray'], suggestion: ['Suggestion', 'orange'], nitpick: ['Polish', 'gray']};
const QC_SOURCE = {render: 'Render check', editor: 'Editor', captions: 'Captions'};
const qcClock = seconds => { const tenths = Math.round(seconds * 10); return `${Math.floor(tenths / 600)}:${String(Math.floor(tenths / 10) % 60).padStart(2, '0')}.${tenths % 10}`; };
const qcSeek = seconds => `<button class="qc-time" data-action="qc-seek" data-id="${seconds}">${qcClock(seconds)}</button>`;

// The report is recomputed by the server from immutable evidence; it is fetched again whenever the render,
// its verdict or the newest edit changes.
function qcReportFor(job, content) {
  const key = `${job.id}:${job.updatedAt}:${job.current}:${editFor(content.contentId)?.edit?.id || ''}`, entry = qcReports[job.id];
  if (entry?.key === key) return entry;
  qcReports[job.id] = {key, loading: true};
  api(`/api/renders/${job.id}/qc`, null, 'GET').then(report => { qcReports[job.id] = {key, report}; }).catch(error => { qcReports[job.id] = {key, error: error.message}; }).finally(() => { if (productionRoom === 'qc') render(); });
  return qcReports[job.id];
}

function qcRoomView(family) {
  const contents = state.renders.contents.filter(item => item.familyId === family.id);
  const hero = `<section class="voice-hero"><div><span class="stage-kicker">ROOM 08 · REVIEW & QC</span><h2>Review & QC</h2><p>Everything the rooms measured about one render, in one list with times: the technical checks on the real file, the editor’s critique and every caption. Each issue links to where it is fixed. Then you watch, listen and record the verdict. That verdict is the approval.</p></div>${badge('Local · no cost', 'green')}</section>`;
  if (!contents.length) return `${hero}<section class="production-card"><h3>Nothing to review yet</h3><p>Approve a script, its narration and visuals, then draft and render the edit in Room 05.</p></section>`;
  if (!contents.some(item => item.contentId === renderContentId)) renderContentId = contents[0].contentId;
  const content = contents.find(item => item.contentId === renderContentId);
  const picker = contents.length > 1 ? `<div class="production-toolbar"><div><label for="render-content">Script</label><select id="render-content">${contents.map(item => `<option value="${item.contentId}" ${item.contentId === content.contentId ? 'selected' : ''}>${esc(item.title)}</option>`).join('')}</select></div></div>` : '';
  const job = content.renders.find(item => item.status === 'completed');
  if (!job) return `${hero}${picker}<section class="production-card"><h3>No finished render</h3><p>Render the edit in Room 05 (or its narration preview in Room 07). The review reads the real file.</p><button class="secondary" data-production-room="editing">Open Editing Room</button></section>`;
  const entry = qcReportFor(job, content);
  if (entry.loading) return `${hero}${picker}<section class="production-card"><p class="muted">Checking the render files and building the review…</p></section>`;
  if (entry.error) return `${hero}${picker}<section class="production-card"><p class="inline-warning">${esc(entry.error)}</p></section>`;
  return hero + picker + qcView(entry.report, job);
}

function qcView(report, job) {
  const [label, color] = QC_STATUS[report.status] || [report.status, 'gray'];
  const blocked = report.status === 'blocked';
  const head = `<div class="production-card-head"><div><span class="micro-label">${report.editRevision ? `EDIT r${report.editRevision.revision} RENDER` : 'ASSEMBLY PROXY'} · ${esc(date(job.createdAt))}</span><h2>${esc(job.scope.styleName)} · ${renderClock(job.scope.narrationSeconds)}</h2></div>${badge(label, color)}</div>`;
  const blockers = report.blockers.length ? `<div class="qc-blockers">${report.verdictStale ? '<p class="inline-warning"><b>The earlier approval no longer applies.</b></p>' : ''}${report.blockers.map((item, index) => `<p class="inline-warning">${esc(item.message)} ${item.repair ? action(esc(item.repair.label), 'qc-repair', `b${index}`, 'text-button') : ''}</p>`).join('')}</div>` : '';
  const passedChecks = report.checks.filter(check => check.passed).length;
  const kpis = `<div class="production-kpis"><div><span>Critical</span><strong>${report.counts.critical}</strong></div><div><span>Suggestions</span><strong>${report.counts.suggestion}</strong></div><div><span>Polish</span><strong>${report.counts.nitpick}</strong></div><div><span>File checks passed</span><strong>${passedChecks}/${report.checks.length}</strong></div></div>`;
  const checks = `<div class="qc-checks">${report.checks.map(check => `<span class="${check.passed ? 'pass' : 'fail'}" title="${esc(check.detail)}">${check.passed ? '✓' : '!'} ${esc(check.name)}</span>`).join('')}</div>`;
  const player = report.videoUrl ? `<div class="render-player"><video id="qc-video" controls preload="metadata" src="${esc(report.videoUrl)}"></video><div class="render-facts">${checks}<p class="hint">Click any time, frame or sentence to jump the player there.</p></div></div>` : checks;
  const issues = report.findings.length ? `<div class="qc-issues">${report.findings.map((item, index) => {
    const [severity, tone] = QC_SEVERITY[item.severity] || [item.severity, 'gray'];
    return `<div class="qc-issue"><div class="qc-issue-time">${item.at === null ? '<span class="muted">whole video</span>' : qcSeek(item.at)}</div><div><div class="card-top">${badge(severity, tone)}<span class="muted">${esc(QC_SOURCE[item.source] || item.source)}${item.label ? ` · ${esc(item.label)}` : ''}</span></div><p>${esc(item.message)}</p>${item.fix ? `<p class="hint">${esc(item.fix)}</p>` : ''}</div><div>${!blocked && item.repair?.command ? action(esc(item.repair.label), 'qc-repair', `f${index}`, 'secondary') : ''}</div></div>`;
  }).join('')}</div>` : '<p class="muted">No issues: every check passed and the editor and caption checks found nothing.</p>';
  const sheets = [report.sheets?.hook && qcSheet(report.sheets.hook, `The hook · one frame every ${report.sheets.hook.everySeconds} s for the first ${report.sheets.hook.seconds} s`), report.sheets?.overview && qcSheet(report.sheets.overview, `Whole video · one frame every ${report.sheets.overview.everySeconds} s`)].filter(Boolean).join('');
  return `<section class="production-card">${head}${blockers}${kpis}${player}</section>
    <section class="production-card"><div class="production-card-head"><div><span class="micro-label">ISSUES · IN TIME ORDER</span><h2>What to look at</h2></div></div>${issues}</section>
    ${sheets ? `<section class="production-card"><div class="production-card-head"><div><span class="micro-label">CONTACT SHEETS</span><h2>Frames with their times</h2></div></div>${sheets}</section>` : ''}
    ${report.timeline ? qcTimeline(report) : ''}
    <section class="production-card"><div class="production-card-head"><div><span class="micro-label">YOUR VERDICT</span><h2>Style proof</h2></div></div>${qcVerdictBlock(report, job)}<details class="scene-history"><summary>What this review does not check</summary><ul class="hint">${report.notChecked.map(line => `<li>${esc(line)}</li>`).join('')}</ul></details></section>`;
}

// Tiles are placed from the sheet's real geometry (margin and padding 4 px), so each frame is labelled and clickable.
function qcSheet(sheet, title) {
  if (!sheet.url) return '';
  const img = `<img class="contact-sheet" src="${esc(sheet.url)}" alt="${esc(title)}">`;
  if (!sheet.tileWidth) return `<h3 class="intel-subhead">${esc(title)}</h3>${img}`;
  const pct = (value, total) => (value / total * 100).toFixed(3);
  const tiles = Array.from({length: sheet.frames}, (_, k) => {
    const col = k % sheet.cols, row = Math.floor(k / sheet.cols), seconds = Math.round(k * sheet.everySeconds * 10) / 10;
    return `<button class="qc-tile" data-qc-css="${esc(JSON.stringify({left: `${pct(4 + col * (sheet.tileWidth + 4), sheet.width)}%`, top: `${pct(4 + row * (sheet.tileHeight + 4), sheet.height)}%`, width: `${pct(sheet.tileWidth, sheet.width)}%`, height: `${pct(sheet.tileHeight, sheet.height)}%`}))}" data-action="qc-seek" data-id="${seconds}" aria-label="Jump to ${qcClock(seconds)}"><span>${qcClock(seconds)}</span></button>`;
  }).join('');
  return `<h3 class="intel-subhead">${esc(title)}</h3><div class="qc-sheet" data-qc-css="${esc(JSON.stringify({maxWidth: `${sheet.width}px`}))}">${img}${tiles}</div>`;
}
function qcThumb(sheet, tile) {
  if (!sheet?.tileWidth || tile === null) return '';
  const col = tile % sheet.cols, row = Math.floor(tile / sheet.cols), span = (offset, size, total) => (total > size ? offset / (total - size) * 100 : 0).toFixed(2);
  return `<span class="qc-thumb" data-qc-css="${esc(JSON.stringify({width: `${sheet.tileHeight > sheet.tileWidth ? 54 : 96}px`, aspectRatio: `${sheet.tileWidth} / ${sheet.tileHeight}`, backgroundImage: `url("${sheet.url}")`, backgroundSize: `${(sheet.width / sheet.tileWidth * 100).toFixed(2)}% auto`, backgroundPosition: `${span(4 + col * (sheet.tileWidth + 4), sheet.tileWidth, sheet.width)}% ${span(4 + row * (sheet.tileHeight + 4), sheet.tileHeight, sheet.height)}%`}))}"></span>`;
}
// The page CSP forbids inline style attributes, so tile and thumbnail geometry goes through the CSSOM.
const QC_CSS = ['left', 'top', 'width', 'height', 'maxWidth', 'aspectRatio', 'backgroundImage', 'backgroundSize', 'backgroundPosition'];
function qcApplyLayout(root = document) {
  root.querySelectorAll('[data-qc-css]').forEach(element => {
    let css;
    try { css = JSON.parse(element.dataset.qcCss); } catch { return; }
    for (const key of QC_CSS) if (typeof css[key] === 'string' && (key !== 'backgroundImage' || css[key].startsWith('url("/api/renders/'))) element.style[key] = css[key];
  });
}
function qcTimeline(report) {
  const sheet = report.sheets?.overview;
  const rows = report.timeline.map(row => `<tr><td>${qcThumb(sheet, row.tile)}</td><td>${qcSeek(row.start)}</td><td>${esc(row.text)}</td>
    <td>${row.captions.map(item => `${esc(item.text)}${item.edited ? ' <span class="muted">(corrected)</span>' : ''}`).join(' <span class="muted">/</span> ') || '<span class="muted">—</span>'}</td>
    <td>${row.clips.map(item => esc(item.label)).join(', ')}${row.cuts ? ` <span class="muted">· ${row.cuts} cut${row.cuts === 1 ? '' : 's'}</span>` : ''}</td>
    <td>${row.graphics.map(item => `${esc(EDIT_TEMPLATE_NAMES[item.template] || item.template)}${item.text ? `: ${esc(item.text)}` : ''}`).join('; ') || '<span class="muted">—</span>'}</td>
    <td>${row.issues ? badge(String(row.issues), 'orange') : ''}</td></tr>`).join('');
  return `<section class="production-card"><div class="production-card-head"><div><span class="micro-label">ALIGNED READ</span><h2>Sentence by sentence</h2></div></div><p class="hint">What the narrator says, the captions shown with it, the clips and cuts under it and any graphic on screen. The frame is taken from the contact sheet nearest the start of each sentence.</p>
    <div class="qc-table-wrap"><table class="data-table qc-table"><thead><tr><th>Frame</th><th>Time</th><th>Narration</th><th>Captions</th><th>Clips</th><th>On screen</th><th>Issues</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}
function qcVerdictBlock(report, job) {
  if (report.verdict) return `<div class="handoff-rule"><strong>${report.verdict.decision === 'passed' ? 'Style proof passed' : 'Changes requested'} by ${esc(report.verdict.reviewer)} · ${esc(date(report.verdict.at))}</strong><p>${esc(report.verdict.notes || 'No notes.')}</p>${report.verdictStale ? '<p class="inline-warning">Inputs changed since this verdict. Render the current edit and review it again.</p>' : ''}</div>`;
  if (report.status === 'blocked') return '<p class="muted">Clear the blockers above first. They cannot be accepted away.</p>';
  return `<p class="hint">Watch the whole render with sound, check the issues above, then record the verdict. Critical findings that you leave in must be accepted on the form.</p><div class="card-actions">${action('Record style-proof verdict', 'qc-verdict', job.id, 'primary')}</div>`;
}

function qcAction(command, id) {
  if (command === 'qc-seek') {
    const video = document.getElementById('qc-video');
    if (!video) return;
    video.currentTime = Number(id);
    video.scrollIntoView({block: 'center', behavior: 'smooth'});
    return;
  }
  const content = state.renders.contents.find(item => item.contentId === renderContentId);
  const job = content?.renders.find(item => item.status === 'completed'), report = job && qcReports[job.id]?.report;
  if (!report) return toast('The review is still loading.', true);
  if (command === 'qc-repair') {
    const item = id.startsWith('b') ? report.blockers[Number(id.slice(1))] : report.findings[Number(id.slice(1))];
    const repair = item?.repair;
    if (!repair) return toast('No repair link for this item.', true);
    productionRoom = repair.room === 'audio' ? 'audio' : 'editing';
    render();
    if (!repair.command) return;
    if (repair.command === 'audio-settings') return audioAction('audio-settings', report.editRevision?.id);
    return editAction(repair.command, repair.id);
  }
  if (command === 'qc-verdict') {
    const editorial = report.findings.filter(item => item.severity === 'critical' && item.source !== 'render').length;
    return renderDialog('review', 'Style-proof verdict', 'HUMAN REVIEW · THE ONE APPROVAL', `<p class="hint">${report.counts.critical} critical, ${report.counts.suggestion} suggestions and ${report.counts.nitpick} polish items are listed for this render.</p><div class="form-grid"><label>Verdict<select name="decision"><option value="pass">Style proof passed</option><option value="changes">Needs changes</option></select></label>${renderNameField('Reviewer name')}<label class="full">Notes <span class="hint">Required for “needs changes”</span><input name="notes" maxlength="2000"></label></div>
      <label class="checkbox-label"><input type="checkbox" name="watchedFully">I watched the whole render with sound.</label>
      <label class="checkbox-label"><input type="checkbox" name="styleMatches">Motion, pacing and transitions match ${esc(job.scope.styleName)}.</label>
      <label class="checkbox-label"><input type="checkbox" name="syncReviewed">The visuals and captions stay in step with the narration.</label>
      ${report.audio ? '<label class="checkbox-label"><input type="checkbox" name="audioReviewed">I listened to the finished narration for clarity and natural delivery.</label>' : ''}
      ${job.result.qcPassed ? '' : '<label class="checkbox-label"><input type="checkbox" name="qcAccepted">I accept the failed render checks listed for this render.</label>'}
      ${editorial ? `<label class="checkbox-label"><input type="checkbox" name="critiqueAccepted">I accept the ${editorial} critical editor and caption finding${editorial === 1 ? '' : 's'} listed above.</label>` : ''}`, 'Record verdict', {id: job.id});
  }
  return toast('Unknown action.', true);
}
