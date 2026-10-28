'use strict';
// Y01 Google client for publishing: channel sign-in (OAuth 2.0 for installed apps: loopback redirect, state and PKCE),
// token refresh and revocation, the signed-in channel's identity, YouTube's resumable upload (always private here),
// processing status and the channel's recent uploads for reconciliation. Every call goes to a fixed Google origin,
// follows no redirect and never puts a token or a raw upstream body in an error.
const {createHash, randomBytes} = require('node:crypto');
const {InputError} = require('./store');

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth', TOKEN = 'https://oauth2.googleapis.com/token', REVOKE = 'https://oauth2.googleapis.com/revoke';
const API = 'https://www.googleapis.com/youtube/v3', UPLOAD = 'https://www.googleapis.com/upload/youtube/v3/videos';
// Upload videos; captions, schedule and reading the channel's own videos (Y02) need youtube.force-ssl.
const SCOPES = Object.freeze(['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.force-ssl']);
const CHUNK = 8 * 1024 * 1024; // YouTube wants multiples of 256 KiB
// Common YouTube categories (videoCategories.list for the US); the owner chooses per upload.
const CATEGORIES = Object.freeze({1: 'Film & Animation', 2: 'Autos & Vehicles', 10: 'Music', 15: 'Pets & Animals', 17: 'Sports', 19: 'Travel & Events', 20: 'Gaming', 22: 'People & Blogs', 23: 'Comedy', 24: 'Entertainment', 25: 'News & Politics', 26: 'Howto & Style', 27: 'Education', 28: 'Science & Technology'});

class GoogleError extends InputError {
  constructor(message, {status = 502, reason = null, unknown = false, reconnect = false} = {}) { super(message, status); Object.assign(this, {reason, unknown, reconnect}); }
}
const b64url = buffer => buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function pkce() { const verifier = b64url(randomBytes(48)); return {verifier, challenge: b64url(createHash('sha256').update(verifier).digest()), state: b64url(randomBytes(24))}; }
function authUrl({clientId, redirectUri, state, challenge}) {
  const url = new URL(AUTH);
  for (const [key, value] of Object.entries({client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: SCOPES.join(' '), state, code_challenge: challenge, code_challenge_method: 'S256', access_type: 'offline', prompt: 'consent select_account', include_granted_scopes: 'false'})) url.searchParams.set(key, value);
  return url.toString();
}

// One request. A network failure or timeout after the request left is "unknown" (Google may have acted on it).
async function call(fetchImpl, url, init, label, timeout = 30000) {
  let response;
  try { response = await fetchImpl(url, {...init, redirect: 'error', signal: AbortSignal.timeout(timeout)}); } catch { throw new GoogleError(`${label}: the request failed or timed out. Google may have received it.`, {unknown: true}); }
  return response;
}
async function failure(response, label) {
  let reason = null;
  try { const body = await response.json(); reason = body?.error?.errors?.[0]?.reason || (typeof body?.error === 'string' ? body.error : body?.error?.status) || null; } catch { /* no body */ }
  reason = typeof reason === 'string' && /^[A-Za-z_.-]{1,60}$/.test(reason) ? reason : null;
  const reconnect = reason === 'invalid_grant' || response.status === 401;
  const hint = reconnect ? ' Connect the channel again.' : reason === 'quotaExceeded' || reason === 'uploadLimitExceeded' ? ' The daily YouTube quota or upload limit is used up; try after midnight Pacific time.' : '';
  return new GoogleError(`${label}: Google answered HTTP ${response.status}${reason ? ` (${reason})` : ''}.${hint}`, {status: response.status === 404 ? 404 : 502, reason, reconnect});
}
async function json(fetchImpl, url, init, label) {
  const response = await call(fetchImpl, url, init, label);
  if (!response.ok) throw await failure(response, label);
  try { return await response.json(); } catch { throw new GoogleError(`${label}: Google returned an unreadable answer.`); }
}
const form = values => ({method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams(values).toString()});
const bearer = token => ({Authorization: `Bearer ${token}`});
function tokens(body, now) {
  if (typeof body?.access_token !== 'string' || !Number.isFinite(Number(body.expires_in))) throw new GoogleError('Google returned no usable access token.');
  return {accessToken: body.access_token, refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : null, expiresAt: now + (Number(body.expires_in) - 60) * 1000, scope: String(body.scope || '')};
}

async function exchangeCode(fetchImpl, {clientId, clientSecret, code, verifier, redirectUri, now = Date.now()}) {
  const result = tokens(await json(fetchImpl, TOKEN, form({client_id: clientId, client_secret: clientSecret, code, code_verifier: verifier, redirect_uri: redirectUri, grant_type: 'authorization_code'}), 'Google sign-in'), now);
  if (!result.refreshToken) throw new GoogleError('Google returned no refresh token. Remove the program\'s access in your Google account settings, then connect again.');
  const missing = SCOPES.filter(scope => !result.scope.split(' ').includes(scope));
  if (missing.length) throw new GoogleError(`Google granted less access than needed (missing ${missing.map(scope => scope.split('/').pop()).join(', ')}). Connect again and allow every requested permission.`);
  return result;
}
async function refresh(fetchImpl, {clientId, clientSecret, refreshToken, now = Date.now()}) {
  return tokens(await json(fetchImpl, TOKEN, form({client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token'}), 'Google access renewal'), now);
}
async function revoke(fetchImpl, token) {
  const response = await call(fetchImpl, REVOKE, form({token}), 'Google revoke');
  return response.ok || response.status === 400; // 400: already revoked or expired
}
// The channels this sign-in may act for (normally one: the channel chosen on Google's account picker).
async function myChannels(fetchImpl, accessToken) {
  const body = await json(fetchImpl, `${API}/channels?part=snippet,contentDetails&mine=true&maxResults=50`, {headers: bearer(accessToken)}, 'Reading the signed-in channel');
  return (Array.isArray(body.items) ? body.items : []).filter(item => /^UC[\w-]{22}$/.test(item?.id || '')).map(item => ({id: item.id, title: String(item.snippet?.title || '').slice(0, 200), customUrl: String(item.snippet?.customUrl || '').slice(0, 100), thumbnail: /^https:\/\/yt\d\.(ggpht|googleusercontent)\.com\//.test(item.snippet?.thumbnails?.default?.url || '') ? item.snippet.thumbnails.default.url : null, uploads: item.contentDetails?.relatedPlaylists?.uploads || null}));
}

// What YouTube receives. Y01 uploads privately; the schedule and public release come later (Y02).
function metadata({title, description, tags = [], categoryId, locale, madeForKids, synthetic}) {
  const issues = [];
  if (typeof title !== 'string' || !title.trim() || title.length > 100) issues.push('The title must have 1-100 characters.');
  if (/[<>]/.test(title || '') || /[<>]/.test(description || '')) issues.push('YouTube does not accept < or > in the title or description.');
  if (Buffer.byteLength(description || '', 'utf8') > 5000) issues.push('The description is longer than YouTube\'s 5,000 bytes.');
  if (tags.reduce((sum, tag) => sum + tag.length + (tag.includes(' ') ? 2 : 0), 0) + Math.max(0, tags.length - 1) > 500) issues.push('The tags are longer than YouTube\'s 500 characters.');
  if (!Object.hasOwn(CATEGORIES, String(categoryId))) issues.push('Choose a YouTube category.');
  if (typeof madeForKids !== 'boolean') issues.push('Say whether the video is made for kids (YouTube requires it).');
  if (issues.length) throw new InputError(issues.join(' '), 400);
  return {snippet: {title: title.trim(), description: description || '', tags, categoryId: String(categoryId), defaultLanguage: locale, defaultAudioLanguage: locale},
    status: {privacyStatus: 'private', selfDeclaredMadeForKids: madeForKids, containsSyntheticMedia: !!synthetic, embeddable: true}};
}
async function startUpload(fetchImpl, accessToken, {body, size}) {
  const response = await call(fetchImpl, `${UPLOAD}?uploadType=resumable&part=snippet,status`, {method: 'POST', headers: {...bearer(accessToken), 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(size), 'X-Upload-Content-Type': 'video/mp4'}, body: JSON.stringify(body)}, 'Starting the upload');
  if (!response.ok) throw await failure(response, 'Starting the upload');
  const session = response.headers.get('location') || '';
  if (!session.startsWith(`${UPLOAD}?`)) throw new GoogleError('Google returned no upload session.');
  return session;
}
// The session's answer: the finished video, the next byte to send, or a session Google no longer knows.
async function progress(response, label) {
  if (response.status === 200 || response.status === 201) {
    let video = null;
    try { video = await response.json(); } catch { /* checked below */ }
    if (!/^[\w-]{11}$/.test(video?.id || '')) throw new GoogleError(`${label}: Google finished the upload but returned no video ID. Reconcile the channel before anything else.`, {unknown: true});
    return {video: {id: video.id, uploadStatus: video.status?.uploadStatus || null}};
  }
  if (response.status === 308) { const range = /bytes=0-(\d+)/.exec(response.headers.get('range') || ''); return {next: range ? Number(range[1]) + 1 : 0}; }
  if (response.status === 404 || response.status === 410) return {expired: true};
  throw await failure(response, label);
}
async function uploadStatus(fetchImpl, accessToken, session, size) {
  return progress(await call(fetchImpl, session, {method: 'PUT', headers: {...bearer(accessToken), 'Content-Length': '0', 'Content-Range': `bytes */${size}`}}, 'Asking where the upload stopped'), 'Asking where the upload stopped');
}
async function sendChunk(fetchImpl, accessToken, session, {buffer, start, size}) {
  const end = start + buffer.length - 1;
  return progress(await call(fetchImpl, session, {method: 'PUT', headers: {...bearer(accessToken), 'Content-Length': String(buffer.length), 'Content-Range': `bytes ${start}-${end}/${size}`}, body: buffer}, 'Uploading', 120000), 'Uploading');
}
// Processing after the upload (1 unit): processingDetails is only visible to the channel owner.
async function videoStatus(fetchImpl, accessToken, id) {
  const body = await json(fetchImpl, `${API}/videos?part=status,processingDetails&id=${encodeURIComponent(id)}`, {headers: bearer(accessToken)}, 'Checking the uploaded video');
  const item = body.items?.[0];
  if (!item) return {found: false};
  return {found: true, uploadStatus: item.status?.uploadStatus || null, privacyStatus: item.status?.privacyStatus || null, failureReason: item.status?.failureReason || null, rejectionReason: item.status?.rejectionReason || null, processingStatus: item.processingDetails?.processingStatus || null};
}
// The channel's newest uploads (2 units), newest first, to find a video whose upload answer was lost.
async function recentUploads(fetchImpl, accessToken, uploadsPlaylist) {
  const body = await json(fetchImpl, `${API}/playlistItems?part=snippet,contentDetails&maxResults=25&playlistId=${encodeURIComponent(uploadsPlaylist)}`, {headers: bearer(accessToken)}, 'Reading the channel\'s recent uploads');
  return (body.items || []).map(item => ({videoId: item.contentDetails?.videoId, title: item.snippet?.title || '', publishedAt: item.contentDetails?.videoPublishedAt || item.snippet?.publishedAt || null})).filter(item => /^[\w-]{11}$/.test(item.videoId || ''));
}
// A lost upload is the one video with the same title that appeared after the session started.
function matchUpload(items, {title, after}) {
  const since = Date.parse(after) - 120000;
  return items.filter(item => item.title === title && (!item.publishedAt || Date.parse(item.publishedAt) >= since));
}

// ------------------------------------------------------------ Y02: attachments and schedule
const UPLOAD_ROOT = 'https://www.googleapis.com/upload/youtube/v3';
// The custom thumbnail (50 units). YouTube allows it only on channels verified by phone.
async function setThumbnail(fetchImpl, accessToken, videoId, buffer) {
  if (buffer.length > 2 * 1024 * 1024) throw new InputError('YouTube takes thumbnails up to 2 MB.', 400);
  const response = await call(fetchImpl, `${UPLOAD_ROOT}/thumbnails/set?uploadType=media&videoId=${encodeURIComponent(videoId)}`, {method: 'POST', headers: {...bearer(accessToken), 'Content-Type': 'image/jpeg', 'Content-Length': String(buffer.length)}, body: buffer}, 'Setting the thumbnail');
  if (!response.ok) {
    const error = await failure(response, 'Setting the thumbnail');
    if (response.status === 403) error.message += ' Custom thumbnails need a channel verified by phone (youtube.com/verify).';
    throw error;
  }
  return true;
}
// One caption track (400 units): the captions the edit made, as SubRip.
async function insertCaption(fetchImpl, accessToken, {videoId, language, name, text}) {
  const boundary = `cr${randomBytes(12).toString('hex')}`;
  const body = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({snippet: {videoId, language, name, isDraft: false}})}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n${text}\r\n--${boundary}--\r\n`, 'utf8');
  const answer = await json(fetchImpl, `${UPLOAD_ROOT}/captions?uploadType=multipart&part=snippet`, {method: 'POST', headers: {...bearer(accessToken), 'Content-Type': `multipart/related; boundary=${boundary}`, 'Content-Length': String(body.length)}, body}, 'Adding the captions');
  if (typeof answer?.id !== 'string') throw new GoogleError('Google added the captions but returned no caption ID.', {unknown: true});
  return answer.id;
}
// The video's caption tracks (50 units), to find one whose insert answer was lost.
async function listCaptions(fetchImpl, accessToken, videoId) {
  const body = await json(fetchImpl, `${API}/captions?part=snippet&videoId=${encodeURIComponent(videoId)}`, {headers: bearer(accessToken)}, 'Reading the caption tracks');
  return (body.items || []).map(item => ({id: item.id, language: item.snippet?.language || '', name: item.snippet?.name || ''}));
}
// The status part as YouTube has it now (1 unit); an update must send every writable field back.
const WRITABLE = ['privacyStatus', 'publishAt', 'license', 'embeddable', 'publicStatsViewable', 'selfDeclaredMadeForKids', 'containsSyntheticMedia'];
async function currentStatus(fetchImpl, accessToken, id) {
  const body = await json(fetchImpl, `${API}/videos?part=status&id=${encodeURIComponent(id)}`, {headers: bearer(accessToken)}, 'Reading the video status');
  const status = body.items?.[0]?.status;
  if (!status) throw new GoogleError('YouTube no longer finds this video.', {status: 404});
  return status;
}
// Sets or removes the time the private video goes public (50 units). YouTube's publishAt needs a private video that
// has never been public; a time in the past would publish at once, so the room never sends one.
async function setSchedule(fetchImpl, accessToken, id, current, publishAt) {
  const status = Object.fromEntries(WRITABLE.filter(key => current[key] !== undefined).map(key => [key, current[key]]));
  status.privacyStatus = 'private';
  if (publishAt) status.publishAt = publishAt; else delete status.publishAt;
  const body = await json(fetchImpl, `${API}/videos?part=status`, {method: 'PUT', headers: {...bearer(accessToken), 'Content-Type': 'application/json; charset=UTF-8'}, body: JSON.stringify({id, status})}, publishAt ? 'Scheduling the video' : 'Removing the schedule');
  return body.status || {};
}
// A wall-clock time in a time zone to the exact moment (UTC). A time skipped by a clock change does not exist.
function zoneOffset(ms, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'}).formatToParts(new Date(ms)).map(part => [part.type, part.value]));
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - Math.floor(ms / 1000) * 1000;
}
function zonedToUtc(local, timeZone) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(local || ''));
  if (!match) throw new InputError('Enter the date and time as YYYY-MM-DDTHH:MM.', 400);
  try { new Intl.DateTimeFormat('en-US', {timeZone}); } catch { throw new InputError(`${timeZone} is not a time zone name (for example Asia/Karachi or America/New_York).`, 400); }
  const guess = Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5]);
  let utc = guess - zoneOffset(guess, timeZone);
  utc = guess - zoneOffset(utc, timeZone);
  if (utc + zoneOffset(utc, timeZone) !== guess) throw new InputError(`${local} does not exist in ${timeZone} (the clocks change then). Choose another time.`, 400);
  return new Date(utc).toISOString().replace('.000Z', 'Z');
}
const wallClock = (iso, timeZone) => new Intl.DateTimeFormat('en-GB', {timeZone, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(new Date(iso));

module.exports = {SCOPES, CHUNK, CATEGORIES, GoogleError, pkce, authUrl, exchangeCode, refresh, revoke, myChannels, metadata, startUpload, uploadStatus, sendChunk, videoStatus, recentUploads, matchUpload, setThumbnail, insertCaption, listCaptions, currentStatus, setSchedule, zonedToUtc, wallClock};
