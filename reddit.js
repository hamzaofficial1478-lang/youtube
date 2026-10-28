'use strict';
// Reddit (0.57, owner request 2026-10-22: "Reddit is the hub of finding contents"). The program reads public posts
// through the owner's own Reddit app (application-only OAuth, client credentials) to see what people in a niche ask,
// argue about and share. Posts are signals for topics, never scripts: a post's story is never retold and its words or
// usernames are never used. Adult (NSFW) posts are dropped. Only Reddit's sign-in and API hosts are called, with
// redirects refused and the User-Agent Reddit asks for (platform:app:version (by /u/username)).
const {InputError} = require('./store');
const {readJson, cleanText} = require('./intel-sources');

const TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
const API = 'https://oauth.reddit.com';
const SUBREDDIT = /^[A-Za-z0-9][A-Za-z0-9_]{1,20}$/;
const requireValue = (ok, message, status = 400) => { if (!ok) throw new InputError(message, status); };
// Reddit's time windows for top posts.
const timeWindow = days => (days <= 1 ? 'day' : days <= 7 ? 'week' : days <= 31 ? 'month' : 'year');

function subredditList(value) {
  if (value === undefined || value === null || value === '') return [];
  requireValue(Array.isArray(value) && value.length <= 10, 'Enter at most 10 subreddits.');
  const list = value.map(item => String(item).trim().replace(/^\/?r\//i, ''));
  requireValue(list.every(item => SUBREDDIT.test(item)), 'A subreddit name has 2-21 letters, digits or underscores (for example AskHistorians).');
  return [...new Set(list)];
}
function post(item) {
  if (!item || typeof item !== 'object' || item.over_18 === true || typeof item.id !== 'string' || typeof item.permalink !== 'string' || !item.permalink.startsWith('/r/')) return null;
  const count = value => (Number.isSafeInteger(Number(value)) ? Number(value) : null);
  return {id: item.id, title: cleanText(item.title, 300), subreddit: cleanText(item.subreddit, 40), score: count(item.score), comments: count(item.num_comments), createdAt: Number.isFinite(Number(item.created_utc)) ? new Date(Number(item.created_utc) * 1000).toISOString() : null,
    url: `https://www.reddit.com${item.permalink}`, flair: cleanText(item.link_flair_text || '', 60) || null};
}

class RedditClient {
  constructor({clientId, secret, username}, fetchImpl = fetch) {
    requireValue(typeof clientId === 'string' && clientId.length >= 10 && typeof secret === 'string' && secret.length >= 10, 'The Reddit app ID and secret are missing. Add them in Connections.', 409);
    this.clientId = clientId; this.secret = secret; this.username = username || 'unknown'; this.fetch = fetchImpl; this.requests = 0; this.token = null;
  }
  agent() { return `windows:youtube-control-room:0.57 (by /u/${this.username})`; }
  async call(url, options, label) {
    try { return await this.fetch(url, {...options, redirect: 'error', signal: AbortSignal.timeout(30000)}); }
    catch { throw new InputError(`${label} is unreachable or did not answer in time.`, 502); }
  }
  async auth() {
    if (this.token && this.token.until > Date.now() + 60000) return this.token.value;
    this.requests += 1;
    const response = await this.call(TOKEN_URL, {method: 'POST', headers: {Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': this.agent()}, body: 'grant_type=client_credentials'}, 'Reddit sign-in');
    if (response.status === 401 || response.status === 403) { await response.body?.cancel(); throw new InputError('Reddit rejected the app ID or secret. Check the Reddit connection.', 502); }
    if (!response.ok) { await response.body?.cancel(); throw new InputError(`Reddit sign-in returned HTTP ${response.status}.`, 502); }
    const data = await readJson(response, 'Reddit sign-in');
    requireValue(typeof data?.access_token === 'string' && data.access_token.length > 10, 'Reddit gave no access token.', 502);
    this.token = {value: data.access_token, until: Date.now() + Math.max(60, Number(data.expires_in) || 3600) * 1000};
    return this.token.value;
  }
  // Top posts for one keyword over the window, across Reddit or inside the given subreddits.
  async search(keyword, {subreddits = [], days = 7, limit = 10} = {}) {
    const token = await this.auth(), url = new URL(subreddits.length ? `/r/${subreddits.join('+')}/search` : '/search', API);
    for (const [key, value] of Object.entries({q: keyword, sort: 'top', t: timeWindow(days), limit: String(limit), type: 'link', raw_json: '1', ...(subreddits.length ? {restrict_sr: '1'} : {})})) url.searchParams.set(key, value);
    this.requests += 1;
    const response = await this.call(url, {headers: {Authorization: `Bearer ${token}`, 'User-Agent': this.agent()}}, 'Reddit');
    if (response.status === 429) { await response.body?.cancel(); throw new InputError('Reddit asked the program to slow down. Wait a few minutes before scanning again.', 429); }
    if (!response.ok) { await response.body?.cancel(); throw new InputError(`Reddit returned HTTP ${response.status}.`, 502); }
    const data = await readJson(response, 'Reddit'), children = data?.data?.children;
    requireValue(Array.isArray(children), 'Reddit returned an unexpected search response.', 502);
    return children.map(child => post(child?.data)).filter(Boolean).slice(0, limit);
  }
}

module.exports = {RedditClient, subredditList, timeWindow, post, SUBREDDIT};
