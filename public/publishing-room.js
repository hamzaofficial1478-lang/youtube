'use strict';
// Room 11 - Publishing (Y01): each family language bound to one YouTube channel through Google's own sign-in and
// confirmed by name; the approved master or released edition uploaded PRIVATELY, resumable, reconciled before anything
// is sent again. Y02: the approved thumbnail and captions are attached after processing, the owner schedules when it
// goes public, and the program observes whether YouTube really made it public. Loaded before app.js; helpers from
// app.js and render-room.js are used only inside functions.

const PUB_STATUS = {queued: ['Waiting to upload', 'gray'], uploading: ['Uploading', 'orange'], interrupted: ['Stopped: can resume', 'orange'], unknown: ['Outcome unknown: reconcile', 'orange'], uploaded: ['Uploaded privately', 'green'], processing: ['YouTube is processing', 'green'], processed: ['Ready on YouTube (private)', 'green'], failed: ['Failed', 'gray'], discarded: ['Discarded', 'gray'], scheduled: ['Scheduled', 'green'], published: ['Public on YouTube', 'green'], kept_private: ['YouTube kept it private', 'orange']};
const PUB_ATTACH = {pending: 'being attached', done: 'attached', failed: 'did not attach', unknown: 'outcome unknown', none: 'none approved'};
function pubOAuthConnection() { return state.connectors.find(item => item.provider === 'youtube-oauth' && item.hasKey && item.test?.status === 'passed'); }

function publishingRoomView(family) {
  const pub = state.publishing, hero = `<section class="voice-hero"><div><span class="stage-kicker">ROOM 11 · PUBLISHING</span><h2>Private uploads</h2><p>Each language of this family is connected to one YouTube channel through Google's own sign-in, and you confirm the channel by name. An approved final master (main language) or a released edition is uploaded <b>privately</b>; if the PC or the network stops, the upload continues from where YouTube stopped, and an upload whose outcome is unknown is looked up on the channel before anything is sent again. Thumbnails, captions, the schedule and going public come next.</p></div></section>`;
  if (!pub) return hero;
  const channels = pub.families.find(item => item.familyId === family.id), q = pub.quota;
  const oauth = pubOAuthConnection();
  const channelRows = channels.locales.map(entry => {
    const active = entry.active, key = `${family.id}|${entry.locale}`;
    const status = active ? badge(active.status === 'active' ? 'Connected' : 'Connect again', active.status === 'active' ? 'green' : 'orange') : badge('Not connected', 'gray');
    const pending = entry.pending.map(item => `<div class="handoff-record"><span>?</span><div><strong>Google returned: ${item.channels.map(channel => `${esc(channel.title)} (${esc(channel.id)})`).join(', ')}</strong><p>Is this the channel for ${esc(localeName(entry.locale))}?</p><div class="card-actions">${action('Confirm this channel', 'pub-confirm', item.id, 'primary')}${action('Cancel', 'pub-disconnect', item.id, 'text-button')}</div></div></div>`).join('');
    return `<div class="handoff-record"><span>${active?.status === 'active' ? '✓' : '○'}</span><div><strong>${esc(localeName(entry.locale))}${entry.locale === family.primaryLocale ? ' · main language' : ''}</strong>
      <p>${active ? `<a href="https://www.youtube.com/channel/${esc(active.channelId)}" target="_blank" rel="noopener">${esc(active.channelTitle)} ↗</a> · confirmed by ${esc(active.confirmedBy)}` : 'No channel yet.'}</p>
      <div class="card-actions">${status}${oauth ? action(active ? 'Connect a different channel' : 'Connect channel', 'pub-connect', key, active ? 'secondary' : 'primary') : ''}${active ? action('Disconnect', 'pub-disconnect', active.id, 'text-button danger') : ''}</div></div></div>${pending}`;
  }).join('');
  const setup = oauth ? '' : '<p class="inline-warning">Add a "YouTube channel access (Google OAuth client)" connection in Connections first: create an OAuth client of type "Desktop app" in Google Cloud with the YouTube Data API v3 enabled, then enter its client ID and secret there.</p><div class="card-actions"><a class="button secondary" href="#connections">Open Connections</a></div>';
  const channelCard = `<section class="production-card"><div class="production-card-head"><div><span class="micro-label">CHANNELS</span><h2>${esc(family.name)}</h2></div></div>${setup}${channelRows}
    <p class="hint">Today: ${q.youtubeUploads.used} of ${q.youtubeUploads.cap} uploads and ${q.youtube.used} of ${q.youtube.cap} YouTube units used (the day ends at midnight Pacific time). Videos from a Google project that YouTube has not audited stay private; that is why uploads here are private.</p></section>`;
  const contents = pub.contents.filter(item => item.familyId === family.id);
  const portfolio = pub.portfolioPause ? `<section class="production-card"><p class="inline-warning"><b>All publishing is paused</b> by ${esc(pub.portfolioPause.by)}: ${esc(pub.portfolioPause.reason)}</p><div class="card-actions">${action('Resume all publishing', 'pub-resume-all', family.id, 'primary')}</div></section>` : `<div class="card-actions">${action('Pause all publishing', 'pub-pause-all', family.id, 'text-button danger')}</div>`;
  const automation = automationCard(family, channels.automation, pub.portfolioPause);
  if (!contents.length) return hero + portfolio + channelCard + automation + '<section class="production-card"><h3>Nothing to upload yet</h3><p>Approve a final master in Room 10 first.</p></section>';
  if (!contents.some(item => item.contentId === renderContentId)) renderContentId = contents[0].contentId;
  const content = contents.find(item => item.contentId === renderContentId);
  const picker = contents.length > 1 ? `<div class="production-toolbar"><div><label for="render-content">Script</label><select id="render-content">${contents.map(item => `<option value="${item.contentId}" ${item.contentId === content.contentId ? 'selected' : ''}>${esc(item.title)}</option>`).join('')}</select></div></div>` : '';
  return hero + portfolio + channelCard + automation + picker + `<section class="production-card"><div class="production-card-head"><div><span class="micro-label">UPLOADS</span><h2>${esc(content.title)}</h2></div></div>${content.locales.map(entry => publicationRowView(family, channels, content, entry)).join('')}</section>`;
}

function publicationRowView(family, channels, content, entry) {
  const binding = channels.locales.find(item => item.locale === entry.locale)?.active, latest = entry.publications[0], open = latest && !['failed', 'discarded'].includes(latest.status);
  const what = entry.ready ? `${entry.ready.kind === 'master' ? 'Final master' : 'Released edition'}: “${esc(entry.ready.title)}”` : esc(entry.blocker || 'Not ready.');
  const canUpload = entry.ready && binding?.status === 'active' && !open;
  const head = `<div class="handoff-record"><span>${latest?.status === 'processed' ? '✓' : '○'}</span><div><strong>${esc(localeName(entry.locale))}</strong><p>${what}</p>${canUpload ? `<div class="card-actions">${action('Upload privately', 'pub-upload', `${content.contentId}|${entry.locale}`, 'primary')}</div>` : !binding && entry.ready ? '<p class="hint">Connect a channel for this language above.</p>' : ''}</div></div>`;
  if (!latest) return head;
  const [label, tone] = PUB_STATUS[latest.status] || [latest.status, 'gray'], percent = latest.size ? Math.floor(latest.sent / latest.size * 100) : 0;
  const actions = [
    latest.status === 'interrupted' ? action('Resume upload', 'pub-resume', latest.id, 'primary') : '',
    ['interrupted', 'unknown'].includes(latest.status) ? action('Look for it on the channel', 'pub-reconcile', latest.id, latest.status === 'unknown' ? 'primary' : 'secondary') : '',
    latest.candidates?.length ? action('This one is the upload', 'pub-choose', latest.id, 'secondary') : '',
    latest.status === 'processed' && latest.standing && latest.attachments && !Object.values(latest.attachments).some(item => item.status === 'pending') ? action('Schedule going public', 'pub-schedule', latest.id, 'primary') : '',
    latest.status === 'scheduled' && Date.parse(latest.schedule.publishAt) > Date.now() + 60000 ? action('Cancel the schedule', 'pub-unschedule', latest.id, 'text-button danger') : '',
    ...(latest.attachments ? ['thumbnail', 'captions'].filter(kind => ['failed', 'unknown'].includes(latest.attachments[kind].status) && ['processed', 'scheduled'].includes(latest.status)).map(kind => action(`Retry the ${kind}`, 'pub-attach', `${latest.id}|${kind}`, 'secondary')) : []),
    ['uploaded', 'processing', 'processed', 'scheduled', 'kept_private'].includes(latest.status) ? action('Check now', 'pub-check', latest.id, 'secondary') : '',
    latest.videoId && !latest.incident ? action('Report a problem', 'pub-report', latest.id, 'text-button') : '',
    ['queued', 'failed', 'interrupted', 'unknown'].includes(latest.status) && !latest.videoId ? action('Discard this record', 'pub-discard', latest.id, 'text-button danger') : '',
  ].join('');
  return `${head}<div class="cap-row"><div><strong>${badge(label, tone)} ${esc(latest.title)}</strong><small>${latest.status === 'uploading' || latest.status === 'interrupted' ? `${percent}% sent (${(latest.sent / 1e6).toFixed(0)} of ${(latest.size / 1e6).toFixed(0)} MB) · ` : ''}private · made for kids: ${latest.madeForKids ? 'yes' : 'no'} · ${esc(date(latest.createdAt))} by ${esc(latest.createdBy)}${latest.processing?.processingStatus ? ` · YouTube: ${esc(latest.processing.processingStatus)}` : ''}</small>
    ${latest.error ? `<p class="${['failed', 'unknown'].includes(latest.status) ? 'inline-warning' : 'hint'}">${esc(latest.error)}</p>` : ''}${latest.candidates?.length ? `<p class="hint">Found on the channel: ${latest.candidates.map(item => `<a href="https://studio.youtube.com/video/${esc(item.videoId)}/edit" target="_blank" rel="noopener">${esc(item.videoId)} ↗</a>`).join(', ')}</p>` : ''}
    ${latest.attachments ? `<p class="hint">Thumbnail: ${esc(PUB_ATTACH[latest.attachments.thumbnail.status])}${latest.attachments.thumbnail.error ? ` (${esc(latest.attachments.thumbnail.error)})` : ''} · Captions: ${esc(PUB_ATTACH[latest.attachments.captions.status])}${latest.attachments.captions.error ? ` (${esc(latest.attachments.captions.error)})` : ''}</p>` : ''}
    ${latest.schedule ? `<p class="hint"><b>Goes public:</b> ${esc(latest.schedule.there)} (${esc(latest.schedule.timeZone)})${latest.schedule.homeZone !== latest.schedule.timeZone ? ` = ${esc(latest.schedule.home)} (${esc(latest.schedule.homeZone)})` : ''} · ${esc(latest.schedule.publishAt)} · set by ${esc(latest.schedule.scheduledBy)}${latest.schedule.waived.length ? ` · without the ${esc(latest.schedule.waived.join(' and '))}` : ''}</p>` : ''}
    ${latest.status === 'scheduled' && latest.standing === false ? '<p class="inline-warning">The approved video or package for this language changed after this was scheduled. YouTube will still make this upload public at its time: cancel the schedule if it should not go out.</p>' : ''}
    ${latest.studioUrl ? `<p class="hint">${latest.watchUrl ? `<a href="${esc(latest.watchUrl)}" target="_blank" rel="noopener">Watch on YouTube ↗</a> · ` : ''}<a href="${esc(latest.studioUrl)}" target="_blank" rel="noopener">Open in YouTube Studio ↗</a></p>` : ''}</div></div><div class="card-actions">${actions}</div>`;
}

function publishAction(command, id) {
  if (['pub-rules', 'pub-unattended', 'pub-review', 'pub-pause-family', 'pub-pause-all', 'pub-resume-family', 'pub-resume-all', 'pub-ack', 'pub-report'].includes(command)) return automationAction(command, id);
  const pub = state.publishing;
  if (command === 'pub-connect') {
    const [familyId, locale] = id.split('|'), oauth = pubOAuthConnection();
    return api('/api/youtube/connect', {requestedBy: renderPerson() || 'Owner', familyId, locale, connectorId: oauth.id}).then(result => {
      window.open(result.url, '_blank', 'noopener');
      toast('Sign in on Google\'s page and choose the channel, then come back here to confirm it.');
      window.addEventListener('focus', () => refresh().catch(() => {}), {once: true});
    }).catch(error => toast(error.message, true));
  }
  if (command === 'pub-confirm') {
    const binding = pub.families.flatMap(item => item.locales.flatMap(entry => entry.pending)).find(item => item.id === id);
    return renderDialog('pub-confirm', 'Confirm the channel', 'CHANNEL · YOUR NAME IS RECORDED', `<p class="hint">Google returned the channel below. Check its name and ID in YouTube before you confirm: uploads for this language go there.</p><div class="form-grid">${renderNameField()}<label class="full">Channel<select name="channelId">${binding.channels.map(channel => `<option value="${esc(channel.id)}">${esc(channel.title)} (${esc(channel.id)})${channel.customUrl ? ` · ${esc(channel.customUrl)}` : ''}</option>`).join('')}</select></label></div>
      <label class="checkbox-label"><input type="checkbox" name="confirmed">This is the right channel for this language.</label>`, 'Confirm', {id});
  }
  if (command === 'pub-disconnect') return renderDialog('pub-disconnect', 'Disconnect this channel', 'CHANNEL ACCESS', '<p class="hint">The program stops using this channel and asks Google to revoke its access. Videos already on YouTube stay there.</p>' + `<div class="form-grid">${renderNameField()}</div>`, 'Disconnect', {id});
  if (command === 'pub-upload') {
    const [contentId, locale] = id.split('|'), content = pub.contents.find(item => item.contentId === contentId), entry = content.locales.find(item => item.locale === locale);
    const binding = pub.families.find(item => item.familyId === content.familyId).locales.find(item => item.locale === locale).active;
    return renderDialog('pub-upload', 'Upload privately', 'YOUTUBE · PRIVATE UPLOAD · 1 OF THE DAY\'S UPLOADS', `<p class="hint">Uploads “${esc(entry.ready.title)}” (${esc(localeName(locale))}) to <b>${esc(binding.channelTitle)}</b> as a <b>private</b> video, with its approved title, description and tags and the AI-content disclosure from Room 09. Nobody but you can see it. The thumbnail, captions and schedule come in the next step.</p>
      <div class="form-grid">${renderNameField()}<label>Category<select name="categoryId">${[[27, 'Education'], [28, 'Science & Technology'], [22, 'People & Blogs'], [24, 'Entertainment'], [25, 'News & Politics'], [26, 'Howto & Style'], [19, 'Travel & Events'], [1, 'Film & Animation']].map(([key, name]) => `<option value="${key}">${name}</option>`).join('')}</select></label></div>
      <p class="hint"><b>Made for kids?</b> YouTube requires this answer (children's privacy law).</p>
      <label class="checkbox-label"><input type="radio" name="madeForKids" value="no">No, it is not made for kids.</label>
      <label class="checkbox-label"><input type="radio" name="madeForKids" value="yes">Yes, it is made for kids.</label>`, 'Upload privately', {contentId, locale});
  }
  if (command === 'pub-discard') return renderDialog('pub-discard', 'Discard this upload record', 'UPLOAD RECORD', '<p class="hint">Use this only when nothing reached YouTube, or when looking on the channel found no video. Then the language can be uploaded again.</p>' + `<div class="form-grid">${renderNameField()}</div>`, 'Discard', {id});
  if (command === 'pub-choose') {
    const latest = pub.contents.flatMap(item => item.locales.flatMap(entry => entry.publications)).find(item => item.id === id);
    return renderDialog('pub-choose', 'Which video is the upload?', 'RECONCILIATION', `<p class="hint">More than one video with this title appeared on the channel after the upload started. Open them in YouTube Studio and choose the one this program uploaded.</p><div class="form-grid">${renderNameField()}<label class="full">Video<select name="videoId">${latest.candidates.map(item => `<option value="${esc(item.videoId)}">${esc(item.videoId)} · ${esc(item.publishedAt || '')}</option>`).join('')}</select></label></div>`, 'This is the upload', {id});
  }
  if (command === 'pub-schedule') {
    const latest = pub.contents.flatMap(item => item.locales.flatMap(entry => entry.publications)).find(item => item.id === id), family = state.families.find(item => item.id === pub.contents.find(content => content.locales.some(entry => entry.publications.some(row => row.id === id))).familyId);
    const zones = [...new Set([family.timezone, 'UTC', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'America/Mexico_City', 'America/Bogota', 'Europe/London', 'Europe/Madrid', 'Europe/Rome', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Dubai'])];
    const failed = ['thumbnail', 'captions'].filter(kind => ['failed', 'unknown'].includes(latest.attachments[kind].status));
    return renderDialog('pub-schedule', 'Schedule going public', 'YOUTUBE · SCHEDULE · YOUR NAME IS RECORDED', `<p class="hint">YouTube keeps “${esc(latest.title)}” private until the time you choose, then makes it public by itself. Choose the time in the time zone of the audience you have in mind; the record shows the exact moment.</p>
      <div class="form-grid">${renderNameField()}<label>Date and time<input type="datetime-local" name="local" required></label><label>Time zone<input name="timeZone" list="pub-zones" value="${esc(family.timezone)}" maxlength="60"><datalist id="pub-zones">${zones.map(zone => `<option value="${esc(zone)}">`).join('')}</datalist></label></div>
      <label class="checkbox-label"><input type="checkbox" name="settings">The audience settings are right: made for kids ${latest.madeForKids ? 'yes' : 'no'}; altered or synthetic content as declared in Room 09.</label>
      <label class="checkbox-label"><input type="checkbox" name="audit">YouTube has approved my Google project in its API audit. (Until it does, YouTube keeps uploads from the program private, even at the scheduled time.)</label>
      ${failed.map(kind => `<label class="checkbox-label"><input type="checkbox" name="waive-${kind}">Schedule without the ${kind === 'thumbnail' ? 'custom thumbnail' : 'captions'}: ${esc(latest.attachments[kind].error || 'it did not attach')}</label>`).join('')}`, 'Schedule', {id});
  }
  if (command === 'pub-unschedule') return renderDialog('pub-unschedule', 'Cancel the schedule', 'YOUTUBE · SCHEDULE', '<p class="hint">The video stays private on YouTube. You can schedule it again later.</p>' + `<div class="form-grid">${renderNameField()}</div>`, 'Cancel the schedule', {id});
  if (command === 'pub-attach') {
    const [pubId, kind] = id.split('|');
    return api(`/api/publications/${pubId}/attach`, {kind}).then(refresh).then(() => toast(`Tried the ${kind} again.`)).catch(error => toast(error.message, true));
  }
  if (['pub-resume', 'pub-check', 'pub-reconcile'].includes(command)) {
    const kind = {'pub-resume': 'resume', 'pub-check': 'check', 'pub-reconcile': 'reconcile'}[command];
    return api(`/api/publications/${id}/${kind}`, {requestedBy: renderPerson() || 'Owner'}).then(refresh).then(() => toast(kind === 'resume' ? 'Upload queued to resume.' : kind === 'check' ? 'Checked with YouTube.' : 'Looked for the video on the channel.')).catch(error => toast(error.message, true));
  }
  return toast('Unknown action.', true);
}

// Y03: the family's publishing rules, the gate measured from its own records, the pauses and the alerts.
const AUTO_LEVEL = {review: ['Review before publishing', 'gray'], unattended: ['Unattended publishing', 'green'], paused: ['Paused', 'orange']};
const PUB_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function automationCard(family, auto, portfolioPause) {
  const [label, tone] = AUTO_LEVEL[auto.effective.level], policy = auto.policy, gate = auto.gate;
  const checks = gate.checks.map(check => `<div class="handoff-record"><span>${check.passed ? '✓' : '○'}</span><div><strong>${esc(check.label)}</strong><p>${esc(check.detail)}</p></div></div>`).join('');
  const rules = policy ? `<p class="hint"><b>Rules r${policy.revision}</b> (${esc(policy.createdBy)}): publish ${esc(policy.windowText)} · ${esc(policy.timeZone)} · at least ${policy.minLeadHours} h after upload · up to ${policy.maxPerDay} upload${policy.maxPerDay === 1 ? '' : 's'} a day and ${policy.maxPerWeek} a week · made for kids: ${policy.madeForKids ? 'yes' : 'no'}</p>` : '<p class="hint">No rules yet: every upload and schedule waits for your click.</p>';
  const actions = [
    action(policy ? 'Change the rules' : 'Set the rules', 'pub-rules', family.id, 'secondary'),
    policy?.level === 'unattended' ? action('Back to review before publishing', 'pub-review', family.id, 'secondary') : policy && gate.passed ? action('Switch on unattended publishing', 'pub-unattended', family.id, 'primary') : '',
    auto.paused?.scope === 'family' ? action('Resume this family', 'pub-resume-family', family.id, 'primary') : action('Pause this family', 'pub-pause-family', family.id, 'text-button danger'),
  ].join('');
  const alerts = auto.alerts.length ? `<div class="qc-issues">${auto.alerts.map(alert => `<div class="handoff-record"><span>!</span><div><strong>${esc(date(alert.createdAt))}</strong><p class="inline-warning">${esc(alert.message)}</p><div class="card-actions">${action('Acknowledge', 'pub-ack', alert.id, 'text-button')}</div></div></div>`).join('')}</div>` : '';
  return `<section class="production-card"><div class="production-card-head"><div><span class="micro-label">AUTOMATION</span><h2>Unattended publishing</h2></div>${badge(label, tone)}</div>
    <p class="hint">${esc(auto.effective.reason)}</p>${rules}
    <p class="hint">Unattended publishing only uploads and schedules videos you already approved (Rooms 06-10), inside your rules. It unlocks when this gate passes on the family's own records, and falls back to review by itself when it no longer does. A new niche, voice or style starts the count again.</p>${checks}
    <div class="card-actions">${actions}</div>${alerts}</section>`;
}
function parseWindows(value) {
  return String(value).split(',').map(item => item.trim()).filter(Boolean).map(item => {
    const match = /^([A-Za-z]{3})[a-z]*\s+(\d{1,2}):(\d{2})$/.exec(item), day = match ? PUB_DAYS.findIndex(name => name.toLowerCase() === match[1].toLowerCase()) : -1;
    if (day < 0) throw new Error(`"${item}" is not a window: write a weekday and a time, such as Tue 18:00.`);
    return {day, time: `${match[2].padStart(2, '0')}:${match[3]}`};
  });
}
function rulesBody(policy, family) {
  const p = policy || {windows: [{day: 2, time: '18:00'}, {day: 4, time: '18:00'}], timeZone: family.timezone, minLeadHours: 24, maxPerDay: 1, maxPerWeek: family.cadence || 2, madeForKids: null, categoryId: '27'};
  return `<div class="form-grid">${renderNameField()}<label class="full">Publication windows<input name="windows" value="${esc(p.windows.map(item => `${PUB_DAYS[item.day]} ${item.time}`).join(', '))}" placeholder="Tue 18:00, Thu 18:00"></label>
    <label>Time zone<input name="timeZone" value="${esc(p.timeZone)}" maxlength="60"></label><label>Hours between upload and going public<input name="minLeadHours" type="number" min="1" max="336" value="${p.minLeadHours}"></label>
    <label>Uploads a day (at most)<input name="maxPerDay" type="number" min="1" max="20" value="${p.maxPerDay}"></label><label>Publications a week (at most)<input name="maxPerWeek" type="number" min="1" max="100" value="${p.maxPerWeek}"></label>
    <label>Category<select name="categoryId">${[[27, 'Education'], [28, 'Science & Technology'], [22, 'People & Blogs'], [24, 'Entertainment'], [25, 'News & Politics'], [26, 'Howto & Style'], [19, 'Travel & Events'], [1, 'Film & Animation']].map(([key, name]) => `<option value="${key}" ${String(key) === String(p.categoryId) ? 'selected' : ''}>${name}</option>`).join('')}</select></label></div>
    <p class="hint"><b>Made for kids?</b> YouTube requires this answer for every video the rules upload.</p>
    <label class="checkbox-label"><input type="radio" name="madeForKids" value="no" ${p.madeForKids === false ? 'checked' : ''}>No, this family's videos are not made for kids.</label>
    <label class="checkbox-label"><input type="radio" name="madeForKids" value="yes" ${p.madeForKids === true ? 'checked' : ''}>Yes, they are made for kids.</label>`;
}
function automationAction(command, id) {
  const pub = state.publishing, family = state.families.find(item => item.id === id), auto = pub?.families.find(item => item.familyId === id)?.automation;
  if (command === 'pub-rules') return renderDialog('pub-rules', 'Publishing rules', 'RULES · YOUR NAME IS RECORDED', `<p class="hint">The rules the program follows when unattended publishing is switched on. Saving them changes nothing else: ${auto.policy?.level === 'unattended' ? 'unattended publishing stays on with the new rules.' : 'every upload still waits for your click.'}</p>${rulesBody(auto.policy, family)}`, 'Save the rules', {familyId: id, expectedRevision: auto.policy?.revision || 0, level: auto.policy?.level || 'review'});
  if (command === 'pub-unattended') return renderDialog('pub-unattended', 'Switch on unattended publishing', 'AUTOMATION · YOUR NAME IS RECORDED', `<p class="hint">The program will upload every video you approve for ${esc(family.name)} (final masters and released editions), attach its thumbnail and captions, and schedule it into the next free window, without asking. It stops by itself if the gate stops passing, on any pause, and on every exception, which comes back here as an alert.</p>${rulesBody(auto.policy, family)}
      <label class="checkbox-label"><input type="checkbox" name="rules">The program may upload and schedule this family's approved videos by these rules without asking me.</label>
      <label class="checkbox-label"><input type="checkbox" name="audit">YouTube has approved my Google project in its API audit (otherwise nothing it schedules goes public).</label>`, 'Switch on', {familyId: id, expectedRevision: auto.policy.revision, level: 'unattended'});
  if (command === 'pub-review') return renderDialog('pub-rules', 'Back to review before publishing', 'RULES', `<p class="hint">Nothing is uploaded or scheduled by itself any more. Videos YouTube already accepted keep their schedule: cancel those in the Uploads list if they should not go out.</p>${rulesBody(auto.policy, family)}`, 'Back to review', {familyId: id, expectedRevision: auto.policy.revision, level: 'review'});
  if (command === 'pub-pause-family' || command === 'pub-pause-all') return renderDialog('pub-pause', command === 'pub-pause-all' ? 'Pause all publishing' : `Pause ${family.name}`, 'PAUSE', '<p class="hint">Nothing new starts: queued uploads wait, a running upload stops between chunks (it can resume), and nothing is attached or scheduled by itself. Videos YouTube already accepted keep their schedule: cancel those in the Uploads list if they should not go out.</p>' + `<div class="form-grid">${renderNameField()}<label class="full">Reason<input name="reason" maxlength="300" placeholder="e.g. Holiday week"></label></div>`, 'Pause', {scope: command === 'pub-pause-all' ? 'portfolio' : 'family', familyId: id});
  if (command === 'pub-resume-family' || command === 'pub-resume-all') return api('/api/publishing/pause', {requestedBy: renderPerson() || 'Owner', scope: command === 'pub-resume-all' ? 'portfolio' : 'family', familyId: id, paused: false}).then(refresh).then(() => toast('Publishing resumed.')).catch(error => toast(error.message, true));
  if (command === 'pub-ack') return api(`/api/publishing-alerts/${id}/acknowledge`, {requestedBy: renderPerson() || 'Owner'}).then(refresh).catch(error => toast(error.message, true));
  if (command === 'pub-report') return renderDialog('pub-report', 'Report a problem with this video', 'MATERIAL ERROR', '<p class="hint">A material error ends the run of clean videos, so unattended publishing goes back to review until ten more go out without one. Fix the video itself in YouTube Studio.</p>' + `<div class="form-grid">${renderNameField()}<label>Kind of error<select name="kind"><option value="factual">Factual</option><option value="rights">Rights</option><option value="language">Language</option><option value="destination">Destination (wrong channel, language or settings)</option></select></label><label class="full">What went wrong<input name="note" maxlength="500"></label></div>`, 'Report', {id});
  return toast('Unknown action.', true);
}
