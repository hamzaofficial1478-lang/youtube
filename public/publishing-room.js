'use strict';
// Room 11 - Publishing (Y01): each family language bound to one YouTube channel through Google's own sign-in and
// confirmed by name; the approved master or released edition uploaded PRIVATELY, resumable, reconciled before anything
// is sent again. Thumbnails, captions, schedule and public release are Y02. Loaded before app.js; helpers from app.js
// and render-room.js are used only inside functions.

const PUB_STATUS = {queued: ['Waiting to upload', 'gray'], uploading: ['Uploading', 'orange'], interrupted: ['Stopped: can resume', 'orange'], unknown: ['Outcome unknown: reconcile', 'orange'], uploaded: ['Uploaded privately', 'green'], processing: ['YouTube is processing', 'green'], processed: ['Ready on YouTube (private)', 'green'], failed: ['Failed', 'gray'], discarded: ['Discarded', 'gray']};
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
  if (!contents.length) return hero + channelCard + '<section class="production-card"><h3>Nothing to upload yet</h3><p>Approve a final master in Room 10 first.</p></section>';
  if (!contents.some(item => item.contentId === renderContentId)) renderContentId = contents[0].contentId;
  const content = contents.find(item => item.contentId === renderContentId);
  const picker = contents.length > 1 ? `<div class="production-toolbar"><div><label for="render-content">Script</label><select id="render-content">${contents.map(item => `<option value="${item.contentId}" ${item.contentId === content.contentId ? 'selected' : ''}>${esc(item.title)}</option>`).join('')}</select></div></div>` : '';
  return hero + channelCard + picker + `<section class="production-card"><div class="production-card-head"><div><span class="micro-label">UPLOADS</span><h2>${esc(content.title)}</h2></div></div>${content.locales.map(entry => publicationRowView(family, channels, content, entry)).join('')}</section>`;
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
    ['uploaded', 'processing', 'processed'].includes(latest.status) ? action('Check now', 'pub-check', latest.id, 'secondary') : '',
    ['queued', 'failed', 'interrupted', 'unknown'].includes(latest.status) && !latest.videoId ? action('Discard this record', 'pub-discard', latest.id, 'text-button danger') : '',
  ].join('');
  return `${head}<div class="cap-row"><div><strong>${badge(label, tone)} ${esc(latest.title)}</strong><small>${latest.status === 'uploading' || latest.status === 'interrupted' ? `${percent}% sent (${(latest.sent / 1e6).toFixed(0)} of ${(latest.size / 1e6).toFixed(0)} MB) · ` : ''}private · made for kids: ${latest.madeForKids ? 'yes' : 'no'} · ${esc(date(latest.createdAt))} by ${esc(latest.createdBy)}${latest.processing?.processingStatus ? ` · YouTube: ${esc(latest.processing.processingStatus)}` : ''}</small>
    ${latest.error ? `<p class="${['failed', 'unknown'].includes(latest.status) ? 'inline-warning' : 'hint'}">${esc(latest.error)}</p>` : ''}${latest.candidates?.length ? `<p class="hint">Found on the channel: ${latest.candidates.map(item => `<a href="https://studio.youtube.com/video/${esc(item.videoId)}/edit" target="_blank" rel="noopener">${esc(item.videoId)} ↗</a>`).join(', ')}</p>` : ''}
    ${latest.studioUrl ? `<p class="hint"><a href="${esc(latest.studioUrl)}" target="_blank" rel="noopener">Open in YouTube Studio ↗</a></p>` : ''}</div></div><div class="card-actions">${actions}</div>`;
}

function publishAction(command, id) {
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
  if (['pub-resume', 'pub-check', 'pub-reconcile'].includes(command)) {
    const kind = {'pub-resume': 'resume', 'pub-check': 'check', 'pub-reconcile': 'reconcile'}[command];
    return api(`/api/publications/${id}/${kind}`, {requestedBy: renderPerson() || 'Owner'}).then(refresh).then(() => toast(kind === 'resume' ? 'Upload queued to resume.' : kind === 'check' ? 'Checked with YouTube.' : 'Looked for the video on the channel.')).catch(error => toast(error.message, true));
  }
  return toast('Unknown action.', true);
}
