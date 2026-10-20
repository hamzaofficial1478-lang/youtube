'use strict';
// External research data for Competitor Intelligence (R05) and the Niche Factory (R06).
// Fixed origins, header-only keys, bounded responses, no automatic retries, and a quota
// ledger that is reserved before any call. Provider responses are untrusted data.
const {randomUUID} = require('node:crypto');
const {InputError} = require('./store');

const NEXLEV_ORIGIN = 'https://prod.dashboard.nexlev.io';
const YOUTUBE_ORIGIN = 'https://www.googleapis.com';
const MAX_RESPONSE_BYTES = 1_500_000;
const now = () => new Date().toISOString();
const requireValue = (ok, message, status = 400) => { if (!ok) throw new InputError(message, status); };

function apiKey(value, label) {
  requireValue(typeof value === 'string' && /^\S{16,512}$/.test(value) && !/[^\x21-\x7e]/.test(value), `${label} key is missing or invalid.`, 409);
  return value;
}

async function readJson(response, label, maxBytes = MAX_RESPONSE_BYTES) {
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel();
    throw new InputError(`${label} returned a response that is too large.`, 502);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new InputError(`${label} returned an empty response.`, 502);
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new InputError(`${label} returned a response that is too large.`, 502);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks, bytes).toString('utf8'));
  } catch {
    throw new InputError(`${label} returned invalid JSON.`, 502);
  }
}

// ---------------------------------------------------------------- tolerant normalization
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;

function get(object, path) {
  return path.split('.').reduce((value, key) => (value === null || value === undefined ? undefined : value[/^\d+$/.test(key) ? Number(key) : key]), object);
}
function pick(object, paths) {
  for (const path of paths) {
    const value = get(object, path);
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}
function cleanText(value, max) {
  if (typeof value !== 'string') return null;
  const result = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').trim();
  return result ? result.slice(0, max) : null;
}
// Counts may arrive as numbers, "1,234", "1.2M" or "12K". Unknown stays null; never invented.
function count(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
  if (typeof value !== 'string') return null;
  const textValue = value.trim().replace(/,/g, '');
  if (/^\d+$/.test(textValue)) return Number(textValue);
  const match = textValue.match(/^(\d+(?:\.\d+)?)\s*([KMB])$/i);
  if (!match) return null;
  return Math.round(Number(match[1]) * {k: 1e3, m: 1e6, b: 1e9}[match[2].toLowerCase()]);
}
function decimal(value) {
  const result = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(/x$/i, '')) : NaN;
  return Number.isFinite(result) && result >= 0 ? Math.round(result * 100) / 100 : null;
}
function durationSeconds(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 && value < 86400 ? Math.round(value) : null;
  if (typeof value !== 'string') return null;
  const iso = value.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (iso && value !== 'P' && value !== 'PT') return Number(iso[1] || 0) * 86400 + Number(iso[2] || 0) * 3600 + Number(iso[3] || 0) * 60 + Number(iso[4] || 0);
  const clock = value.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (clock) return Number(clock[1] || 0) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
  if (/^\d+$/.test(value)) return Number(value);
  return null;
}
function isoDate(value) {
  if (typeof value === 'number' && value > 1e9) {
    const date = new Date(value > 1e12 ? value : value * 1000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
function httpsUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString().slice(0, 500) : null;
  } catch {
    return null;
  }
}
function firstArray(data, depth = 0) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object' || depth > 3) return null;
  for (const key of ['data', 'results', 'items', 'videos', 'channels', 'outliers', 'similarChannels', 'similar_channels', 'transcripts', 'images', 'thumbnails']) {
    if (Array.isArray(data[key])) return data[key];
  }
  for (const key of ['data', 'result', 'results', 'response']) {
    if (data[key] && typeof data[key] === 'object') {
      const inner = firstArray(data[key], depth + 1);
      if (inner) return inner;
    }
  }
  return null;
}
function normVideo(item) {
  if (!item || typeof item !== 'object') return null;
  const videoId = pick(item, ['videoId', 'video_id', 'id.videoId', 'id', 'youtubeId']);
  if (typeof videoId !== 'string' || !VIDEO_ID.test(videoId)) return null;
  const durationValue = pick(item, ['durationSeconds', 'duration_seconds', 'lengthSeconds', 'length_seconds', 'duration', 'contentDetails.duration', 'lengthText']);
  return {
    videoId,
    title: cleanText(pick(item, ['title', 'snippet.title', 'name']), 200),
    channelId: (value => (typeof value === 'string' && CHANNEL_ID.test(value) ? value : null))(pick(item, ['channelId', 'channel_id', 'channel.id', 'snippet.channelId'])),
    channelTitle: cleanText(pick(item, ['channelTitle', 'channel_title', 'channelName', 'channel.title', 'channel.name', 'snippet.channelTitle']), 120),
    publishedAt: isoDate(pick(item, ['publishedAt', 'published_at', 'publishDate', 'uploadDate', 'upload_date', 'snippet.publishedAt', 'date'])),
    durationSeconds: durationSeconds(durationValue),
    views: count(pick(item, ['views', 'viewCount', 'view_count', 'statistics.viewCount'])),
    likes: count(pick(item, ['likes', 'likeCount', 'like_count', 'statistics.likeCount'])),
    comments: count(pick(item, ['comments', 'commentCount', 'comment_count', 'statistics.commentCount'])),
    outlierScore: decimal(pick(item, ['outlierScore', 'outlier_score', 'outlierMultiplier', 'outlier_multiplier', 'multiplier', 'outlier'])),
    thumbnailUrl: httpsUrl(pick(item, ['thumbnailUrl', 'thumbnail_url', 'thumbnail.url', 'thumbnail', 'thumbnails.0.url', 'thumbnails.medium.url', 'thumbnails.high.url', 'image_url', 'imageUrl'])),
  };
}
function normChannel(item) {
  if (!item || typeof item !== 'object') return null;
  const channelId = pick(item, ['channelId', 'channel_id', 'id', 'channel.id']);
  if (typeof channelId !== 'string' || !CHANNEL_ID.test(channelId)) return null;
  return {
    channelId,
    title: cleanText(pick(item, ['title', 'name', 'channelTitle', 'channel_name', 'channelName', 'snippet.title']), 120),
    handle: cleanText(pick(item, ['handle', 'customUrl', 'custom_url', 'username', 'snippet.customUrl']), 120),
    subscribers: count(pick(item, ['subscribers', 'subscriberCount', 'subscriber_count', 'subs', 'statistics.subscriberCount'])),
    views: count(pick(item, ['views', 'viewCount', 'view_count', 'totalViews', 'statistics.viewCount'])),
    videos: count(pick(item, ['videos', 'videoCount', 'video_count', 'statistics.videoCount'])),
    country: cleanText(pick(item, ['country', 'snippet.country']), 60),
    description: cleanText(pick(item, ['description', 'snippet.description']), 600),
    similarity: decimal(pick(item, ['similarity', 'score', 'similarityScore'])),
  };
}
function transcriptText(item) {
  if (typeof item === 'string') return cleanText(item, 60000);
  if (!item || typeof item !== 'object') return null;
  const direct = pick(item, ['transcript', 'text', 'content', 'subtitle', 'fullText']);
  if (typeof direct === 'string') return cleanText(direct, 60000);
  const segments = Array.isArray(direct) ? direct : firstArray(item);
  if (!Array.isArray(segments)) return null;
  return cleanText(segments.map(segment => (typeof segment === 'string' ? segment : pick(segment, ['text', 'content', 'snippet']) || '')).join(' '), 60000);
}
function words(value) {
  return (String(value || '').toLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || []);
}
function transcriptSummary(videoId, textValue, durationSecondsValue, ref) {
  const tokens = words(textValue);
  const plain = String(textValue || '').split(/\s+/);
  return {
    ref, videoId,
    wordCount: tokens.length,
    wordsPerMinute: durationSecondsValue && durationSecondsValue >= 30 && tokens.length ? Math.round(tokens.length / (durationSecondsValue / 60)) : null,
    hookExcerpt: plain.slice(0, 120).join(' ').slice(0, 900),
    excerpt: String(textValue || '').slice(0, 2400),
  };
}
// Copy guard: any 8-word sequence shared with competitor text is treated as copied wording.
function shingles(value, size = 8) {
  const tokens = words(value), out = new Set();
  for (let index = 0; index + size <= tokens.length; index++) out.add(tokens.slice(index, index + size).join(' '));
  return out;
}
function copiedPhrases(outputStrings, sourceStrings, size = 8) {
  const source = new Set();
  for (const value of sourceStrings) for (const shingle of shingles(value, size)) source.add(shingle);
  const hits = new Set();
  for (const value of outputStrings) for (const shingle of shingles(value, size)) if (source.has(shingle)) hits.add(shingle);
  return [...hits];
}
function median(values) {
  const list = values.filter(value => Number.isFinite(value)).sort((a, b) => a - b);
  if (!list.length) return null;
  const middle = Math.floor(list.length / 2);
  return list.length % 2 ? list[middle] : Math.round((list[middle - 1] + list[middle]) / 2);
}

// ---------------------------------------------------------------- NexLev REST client
class NexLevClient {
  constructor(key, fetchImpl = fetch) {
    this.key = apiKey(key, 'NexLev');
    this.fetch = fetchImpl;
    this.requests = 0;
  }
  async call(method, path, {query = null, body = null} = {}) {
    requireValue(/^\/external\/[a-z0-9/-]+$/.test(path), 'Unsupported NexLev endpoint.', 500);
    const url = new URL(`/api${path}`, NEXLEV_ORIGIN);
    if (query) for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    this.requests++;
    let response;
    try {
      response = await this.fetch(url.toString(), {
        method,
        headers: {'x-api-key': this.key, Accept: 'application/json', ...(body ? {'Content-Type': 'application/json'} : {})},
        body: body ? JSON.stringify(body) : undefined,
        redirect: 'error',
        signal: AbortSignal.timeout(45000),
      });
    } catch {
      throw new InputError('NexLev could not be reached or timed out. No automatic retry was attempted.', 502);
    }
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel();
      throw new InputError('NexLev rejected the API key. Check the key and your plan\'s API access.', 502);
    }
    if (response.status === 429) {
      await response.body?.cancel();
      throw new InputError('NexLev reports its rate limit or monthly quota is used up. Wait for the quota to reset.', 502);
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new InputError(`NexLev returned HTTP ${response.status}. The request was not retried.`, 502);
    }
    return readJson(response, 'NexLev');
  }
  channelAbout(channelId) { return this.call('GET', '/external/channels/about', {query: {id: channelId}}); }
  channelAboutByUsername(username) { return this.call('GET', '/external/channels/about', {query: {forUsername: username}}); }
  channelVideos(channelId, sort = 'latest') { return this.call('GET', '/external/channels/videos', {query: {id: channelId, sort_by: sort}}); }
  channelOutliers(channelId, maxVideos = 60, threshold = 2) { return this.call('GET', '/external/channels/outliers', {query: {id: channelId, maxVideos, minOutlierThreshold: threshold}}); }
  bulkTranscripts(videoIds) { return this.call('POST', '/external/videos/bulk-transcript', {body: {videoIds}}); }
  nicheOverview(channelId) { return this.call('POST', '/external/niche-overview/analyze', {body: {channelId}}); }
  similarChannels(channelId, channelType = 'all', level = 1) { return this.call('POST', '/external/similar-channels/search', {body: {channelId, channelType, level}}); }
  thumbnailSearch(textQuery, k = 25) { return this.call('POST', '/external/similar-thumbnails/search', {body: {text: textQuery, k}}); }
  channelAnalytics(channelId) { return this.call('POST', '/external/analytics/channel-analytics', {body: {channelId}}); }
}

// ---------------------------------------------------------------- YouTube public client
// Public, non-authorized data: display-only by default and deleted after 30 days.
class YouTubePublicClient {
  constructor(key, fetchImpl = fetch) {
    this.key = apiKey(key, 'YouTube Data API');
    this.fetch = fetchImpl;
    this.units = 0;
  }
  async call(resource, params) {
    const url = new URL(`/youtube/v3/${resource}`, YOUTUBE_ORIGIN);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    this.units++;
    let response;
    try {
      response = await this.fetch(url.toString(), {headers: {'x-goog-api-key': this.key, Accept: 'application/json'}, redirect: 'error', signal: AbortSignal.timeout(15000)});
    } catch {
      throw new InputError('YouTube could not be reached or timed out. No automatic retry was attempted.', 502);
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new InputError(response.status === 403 ? 'YouTube denied the request (key restriction or daily quota). Check the Google Cloud project.' : `YouTube returned HTTP ${response.status}.`, 502);
    }
    return readJson(response, 'YouTube', 600_000);
  }
  async channel(reference) {
    const params = {part: 'snippet,statistics,contentDetails', maxResults: 1, fields: 'items(id,snippet(title,customUrl,country,publishedAt),statistics(viewCount,subscriberCount,hiddenSubscriberCount,videoCount),contentDetails/relatedPlaylists/uploads)'};
    if (reference.kind === 'channel_id') params.id = reference.value;
    else if (reference.kind === 'handle') params.forHandle = reference.value;
    else params.forUsername = reference.value;
    const data = await this.call('channels', params);
    const item = Array.isArray(data?.items) ? data.items[0] : null;
    if (!item || typeof item.id !== 'string' || !CHANNEL_ID.test(item.id)) throw new InputError(`YouTube found no channel for ${reference.value}.`, 404);
    return {
      channelId: item.id,
      title: cleanText(item.snippet?.title, 120),
      handle: cleanText(item.snippet?.customUrl, 120),
      country: cleanText(item.snippet?.country, 60),
      publishedAt: isoDate(item.snippet?.publishedAt),
      subscriberCount: item.statistics?.hiddenSubscriberCount ? null : (typeof item.statistics?.subscriberCount === 'string' ? item.statistics.subscriberCount : null),
      viewCount: typeof item.statistics?.viewCount === 'string' ? item.statistics.viewCount : null,
      videoCount: typeof item.statistics?.videoCount === 'string' ? item.statistics.videoCount : null,
      uploadsPlaylistId: typeof item.contentDetails?.relatedPlaylists?.uploads === 'string' ? item.contentDetails.relatedPlaylists.uploads : null,
    };
  }
  async recentVideos(uploadsPlaylistId, limit) {
    if (!uploadsPlaylistId || !/^[A-Za-z0-9_-]{10,64}$/.test(uploadsPlaylistId)) return [];
    const playlist = await this.call('playlistItems', {part: 'contentDetails', playlistId: uploadsPlaylistId, maxResults: Math.min(50, limit), fields: 'items(contentDetails(videoId,videoPublishedAt))'});
    const ids = (Array.isArray(playlist?.items) ? playlist.items : []).map(item => item?.contentDetails?.videoId).filter(id => typeof id === 'string' && VIDEO_ID.test(id)).slice(0, limit);
    if (!ids.length) return [];
    const data = await this.call('videos', {part: 'snippet,contentDetails,statistics', id: ids.join(','), maxResults: ids.length, fields: 'items(id,snippet(publishedAt,title),contentDetails(duration,caption,definition),statistics(viewCount,likeCount,commentCount))'});
    return (Array.isArray(data?.items) ? data.items : []).filter(item => typeof item?.id === 'string' && VIDEO_ID.test(item.id)).map(item => ({
      videoId: item.id,
      title: cleanText(item.snippet?.title, 200),
      publishedAt: isoDate(item.snippet?.publishedAt),
      durationSeconds: durationSeconds(item.contentDetails?.duration),
      captions: item.contentDetails?.caption === 'true',
      definition: item.contentDetails?.definition === 'hd' ? 'hd' : item.contentDetails?.definition === 'sd' ? 'sd' : null,
      views: typeof item.statistics?.viewCount === 'string' ? item.statistics.viewCount : null,
      likes: typeof item.statistics?.likeCount === 'string' ? item.statistics.likeCount : null,
      comments: typeof item.statistics?.commentCount === 'string' ? item.statistics.commentCount : null,
    }));
  }
}

// ---------------------------------------------------------------- quota ledger
// YouTube's videos.insert calls have their own daily bucket (100 a day by default), apart from the 10,000 shared units.
const QUOTA_DEFAULTS = {nexlevMonthlyRequestCap: 150, youtubeDailyUnitCap: 2000, youtubeDailyUploadCap: 100, pexelsHourlyRequestCap: 150, pixabayHourlyRequestCap: 1000};
// Stock libraries publish per-hour (Pexels 200/hour) and per-minute (Pixabay 100/60 s) limits; caps are counted per UTC hour.
function hourPeriod(at = new Date()) { return at.toISOString().slice(0, 13); }
function nexlevPeriod(at = new Date()) { return at.toISOString().slice(0, 7); }
function youtubePeriod(at = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(at).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

class QuotaLedger {
  constructor(store) {
    this.store = store;
    this.db = store.db;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS quota_settings(id TEXT PRIMARY KEY, revision INTEGER NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS data_usage(id TEXT PRIMARY KEY, job_id TEXT NOT NULL, provider TEXT NOT NULL, period TEXT NOT NULL, status TEXT NOT NULL, reserved_units INTEGER NOT NULL, used_units INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(job_id,provider));
    `);
  }
  settings() {
    const row = this.db.prepare("SELECT * FROM quota_settings WHERE id='global'").get();
    return row ? {...QUOTA_DEFAULTS, ...JSON.parse(row.payload), revision: row.revision} : {...QUOTA_DEFAULTS, revision: 0};
  }
  saveSettings(input) {
    requireValue(input && typeof input === 'object' && !Array.isArray(input), 'Send a JSON object.');
    const stored = this.settings();
    const nexlev = input.nexlevMonthlyRequestCap ?? stored.nexlevMonthlyRequestCap, youtube = input.youtubeDailyUnitCap ?? stored.youtubeDailyUnitCap;
    const pexels = input.pexelsHourlyRequestCap ?? stored.pexelsHourlyRequestCap, pixabay = input.pixabayHourlyRequestCap ?? stored.pixabayHourlyRequestCap;
    requireValue(Number.isSafeInteger(nexlev) && nexlev >= 0 && nexlev <= 100000, 'NexLev monthly request cap must be a whole number from 0 to 100,000.');
    requireValue(Number.isSafeInteger(youtube) && youtube >= 0 && youtube <= 10000, 'YouTube daily unit cap must be a whole number from 0 to 10,000.');
    requireValue(Number.isSafeInteger(pexels) && pexels >= 0 && pexels <= 200, 'Pexels hourly request cap must be a whole number from 0 to 200 (the Pexels default limit).');
    requireValue(Number.isSafeInteger(pixabay) && pixabay >= 0 && pixabay <= 6000, 'Pixabay hourly request cap must be a whole number from 0 to 6,000.');
    return this.store.transaction(() => {
      const current = this.settings();
      requireValue(input.revision === current.revision, 'Quota settings changed in another tab. Reload before saving.', 409);
      const payload = {nexlevMonthlyRequestCap: nexlev, youtubeDailyUnitCap: youtube, pexelsHourlyRequestCap: pexels, pixabayHourlyRequestCap: pixabay};
      this.db.prepare("INSERT INTO quota_settings(id,revision,payload,updated_at) VALUES('global',?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload,updated_at=excluded.updated_at").run(current.revision + 1, JSON.stringify(payload), now());
      this.store.event(`Updated data caps: NexLev ${nexlev} requests/month, YouTube ${youtube} units/day, Pexels ${pexels} and Pixabay ${pixabay} requests/hour`);
      return this.settings();
    });
  }
  periodFor(provider) { return provider === 'nexlev' ? nexlevPeriod() : provider.startsWith('youtube') ? youtubePeriod() : hourPeriod(); }
  capFor(provider) {
    const settings = this.settings(), key = {nexlev: 'nexlevMonthlyRequestCap', youtube: 'youtubeDailyUnitCap', 'youtube-upload': 'youtubeDailyUploadCap', pexels: 'pexelsHourlyRequestCap', pixabay: 'pixabayHourlyRequestCap'}[provider];
    requireValue(key, `Unknown data provider ${provider}.`, 500);
    return settings[key];
  }
  committed(provider, period) {
    return this.db.prepare("SELECT status, reserved_units, used_units FROM data_usage WHERE provider=? AND period=? AND status IN ('reserved','settled','unknown')").all(provider, period)
      .reduce((sum, row) => sum + (row.status === 'settled' ? row.used_units : Math.max(row.reserved_units, row.used_units || 0)), 0);
  }
  // Called inside the caller's transaction.
  reserve(jobId, plan) {
    for (const [provider, units] of Object.entries(plan)) {
      if (!units) continue;
      const period = this.periodFor(provider), cap = this.capFor(provider);
      if (this.committed(provider, period) + units > cap) return {ok: false, provider, period, cap};
    }
    for (const [provider, units] of Object.entries(plan)) {
      if (!units) continue;
      this.db.prepare("INSERT INTO data_usage(id,job_id,provider,period,status,reserved_units,created_at,updated_at) VALUES(?,?,?,?,'reserved',?,?,?) ON CONFLICT(job_id,provider) DO UPDATE SET period=excluded.period,status='reserved',reserved_units=excluded.reserved_units,used_units=NULL,updated_at=excluded.updated_at")
        .run(randomUUID(), jobId, provider, this.periodFor(provider), units, now(), now());
    }
    return {ok: true};
  }
  settle(jobId, used) {
    for (const [provider, units] of Object.entries(used)) {
      this.db.prepare("UPDATE data_usage SET status=?, used_units=?, updated_at=? WHERE job_id=? AND provider=?").run(units ? 'settled' : 'released', units, now(), jobId, provider);
    }
  }
  markUnknown(jobId) { this.db.prepare("UPDATE data_usage SET status='unknown', updated_at=? WHERE job_id=? AND status='reserved'").run(now(), jobId); }
  release(jobId) { this.db.prepare("UPDATE data_usage SET status='released', used_units=0, updated_at=? WHERE job_id=? AND status='reserved'").run(now(), jobId); }
  summary() {
    const settings = this.settings(), nexlev = nexlevPeriod(), youtube = youtubePeriod(), hour = hourPeriod();
    return {
      settings,
      pexels: {period: hour, used: this.committed('pexels', hour), cap: settings.pexelsHourlyRequestCap, unit: 'requests this hour (UTC)'},
      pixabay: {period: hour, used: this.committed('pixabay', hour), cap: settings.pixabayHourlyRequestCap, unit: 'requests this hour (UTC)'},
      nexlev: {period: nexlev, used: this.committed('nexlev', nexlev), cap: settings.nexlevMonthlyRequestCap, unit: 'requests this month (UTC)'},
      youtube: {period: youtube, used: this.committed('youtube', youtube), cap: settings.youtubeDailyUnitCap, unit: 'units today (Pacific time)'},
      youtubeUploads: {period: youtube, used: this.committed('youtube-upload', youtube), cap: settings.youtubeDailyUploadCap, unit: 'uploads today (Pacific time)'},
    };
  }
  usageFor(jobId) {
    return Object.fromEntries(this.db.prepare('SELECT provider, status, reserved_units, used_units FROM data_usage WHERE job_id=?').all(jobId).map(row => [row.provider, {status: row.status, reserved: row.reserved_units, used: row.used_units}]));
  }
}

// Connector rows are checked the same way by every R05/R06 job.
function connectorCurrent(connectors, reference, provider) {
  if (!reference) return false;
  try {
    const row = connectors.row(reference.id), slot = JSON.parse(row.payload);
    // provider 'ai' means either Claude connection; the subscription one (claude-code) has no stored key.
    const matches = provider === 'ai' ? ['claude', 'claude-code'].includes(slot.provider) : slot.provider === provider;
    return matches && slot.revision === reference.revision && (!!row.secret || slot.provider === 'claude-code') && slot.test?.status === 'passed';
  } catch {
    return false;
  }
}
function connectorReference(connectors, input, provider, label, required) {
  if (input === undefined || input === null) {
    requireValue(!required, `Choose a tested ${label} connector.`);
    return null;
  }
  requireValue(typeof input === 'object' && typeof input.id === 'string' && Number.isSafeInteger(input.revision), `Choose a tested ${label} connector.`);
  const reference = {id: input.id, revision: input.revision};
  requireValue(connectorCurrent(connectors, reference, provider), `The ${label} connector is missing, changed or not tested. Test it in Connections first.`, 409);
  return reference;
}

module.exports = {
  NEXLEV_ORIGIN, YOUTUBE_ORIGIN, NexLevClient, YouTubePublicClient, QuotaLedger, readJson,
  normVideo, normChannel, transcriptText, transcriptSummary, firstArray, count, durationSeconds, isoDate, median,
  copiedPhrases, shingles, words, connectorCurrent, connectorReference, nexlevPeriod, youtubePeriod, hourPeriod, cleanText,
};
