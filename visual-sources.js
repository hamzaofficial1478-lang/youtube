'use strict';
// P04 - visual source adapters for the Scene & Visual Room.
// Pexels and Pixabay stock search, OpenAI image generation, a versioned capability
// registry, bounded allowlisted downloads with SHA-256, and ffprobe/ffmpeg evidence.
// Nothing here decides which asset is used: the Scene Room records the owner's choice.
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {execFile} = require('node:child_process');
const {InputError} = require('./store');
const {readJson, cleanText} = require('./intel-sources');

const PEXELS_ORIGIN = 'https://api.pexels.com';
const PIXABAY_ORIGIN = 'https://pixabay.com';
const OPENAI_ORIGIN = 'https://api.openai.com';
const REGISTRY_VERSION = '2026-10-04.1';
// Media is only downloaded from the providers' own CDNs (Pexels videos may be served through Vimeo's CDN).
const MEDIA_HOSTS = ['pexels.com', 'vimeocdn.com', 'vimeo.com', 'pixabay.com'];
const MB = 1024 * 1024;

const requireValue = (ok, message, status = 400) => { if (!ok) throw new InputError(message, status); };
function apiKey(value, label) {
  requireValue(typeof value === 'string' && /^\S{16,512}$/.test(value) && !/[^\x21-\x7e]/.test(value), `${label} key is missing or invalid.`, 409);
  return value;
}

// ---------------------------------------------------------------- capability registry
const PEXELS_LICENSE = {
  name: 'Pexels License', url: 'https://www.pexels.com/license/', commercialUse: true, attribution: 'Optional (credit is appreciated)',
  restrictions: ['No identifiable people in offensive or negative contexts', 'No implied endorsement by the people or brands shown', 'No selling unaltered copies', 'No redistribution on other stock platforms', 'Not usable as a trademark, logo or business name'],
};
const PIXABAY_LICENSE = {
  name: 'Pixabay Content License', url: 'https://pixabay.com/service/license-summary/', commercialUse: true, attribution: 'Optional (credit is appreciated)',
  restrictions: ['No standalone sale without creative effort', 'No commercial use of recognisable trademarks, logos or brands', 'No immoral or illegal use of identifiable people', 'No misleading or deceptive use', 'Not usable as a trademark, design mark, trade name or service mark'],
};
const OPENAI_TERMS = {
  name: 'OpenAI Terms of Use', url: 'https://openai.com/policies/terms-of-use/', commercialUse: true, attribution: 'Not required',
  restrictions: ['OpenAI usage policies apply to prompts and outputs', 'Synthetic media: follow YouTube\'s altered or synthetic content disclosure', 'Do not depict real people, brands or copyrighted characters'],
};
const OPENAI_IMAGE_MODELS = ['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst', 'gpt-image-2', 'gpt-image-1.5', 'gpt-image-1', 'gpt-image-1-mini'];
const ORIENTATION = {'long-form': {pexels: 'landscape', pixabay: 'horizontal', size: '1536x1024', width: 1920, height: 1080}, shorts: {pexels: 'portrait', pixabay: 'vertical', size: '1024x1536', width: 1080, height: 1920}};

const CAPABILITIES = {
  'pexels-photo': {
    id: 'pexels-photo', version: REGISTRY_VERSION, provider: 'pexels', source: 'stock-image', kind: 'search', name: 'Pexels photos', mediaType: 'image',
    settings: {perPage: {min: 3, max: 30, default: 12}, orientation: 'From the family format (landscape for long-form, portrait for Shorts)'},
    mediaRoles: [], output: {mime: ['image/jpeg', 'image/png', 'image/webp'], maxBytes: 40 * MB, rendition: 'original'},
    rights: PEXELS_LICENSE, synthetic: false, cost: {unit: 'request', paid: false, note: 'Free API; 200 requests per hour and 20,000 per month by default.'},
    notes: ['Search results and previews are kept for 24 hours; the chosen photo is downloaded and kept with its license evidence.'],
  },
  'pexels-video': {
    id: 'pexels-video', version: REGISTRY_VERSION, provider: 'pexels', source: 'stock-video', kind: 'search', name: 'Pexels videos', mediaType: 'video',
    settings: {perPage: {min: 3, max: 30, default: 12}, orientation: 'From the family format', minimumSize: 'Full HD (size=medium)'},
    mediaRoles: [], output: {mime: ['video/mp4'], maxBytes: 300 * MB, rendition: 'Smallest MP4 file at or above the family resolution'},
    rights: PEXELS_LICENSE, synthetic: false, cost: {unit: 'request', paid: false, note: 'Free API; 200 requests per hour and 20,000 per month by default.'},
    notes: ['Clips shorter than their shot are flagged before approval.'],
  },
  'pixabay-photo': {
    id: 'pixabay-photo', version: REGISTRY_VERSION, provider: 'pixabay', source: 'stock-image', kind: 'search', name: 'Pixabay photos', mediaType: 'image',
    settings: {perPage: {min: 3, max: 30, default: 12}, orientation: 'From the family format', safeSearch: true},
    mediaRoles: [], output: {mime: ['image/jpeg', 'image/png'], maxBytes: 40 * MB, rendition: 'largeImageURL (up to 1280 px without full API access)'},
    rights: PIXABAY_LICENSE, synthetic: false, cost: {unit: 'request', paid: false, note: 'Free API; up to 100 requests per 60 seconds.'},
    notes: ['Without full API access Pixabay serves photos up to 1280 px wide, below 1080p. Prefer Pexels for full-HD stills.', 'Search results are cached for 24 hours, as Pixabay requires.'],
  },
  'pixabay-video': {
    id: 'pixabay-video', version: REGISTRY_VERSION, provider: 'pixabay', source: 'stock-video', kind: 'search', name: 'Pixabay videos', mediaType: 'video',
    settings: {perPage: {min: 3, max: 30, default: 12}, orientation: 'Filtered after search (the video API has no orientation filter)', safeSearch: true},
    mediaRoles: [], output: {mime: ['video/mp4'], maxBytes: 300 * MB, rendition: 'videos.large, else videos.medium'},
    rights: PIXABAY_LICENSE, synthetic: false, cost: {unit: 'request', paid: false, note: 'Free API; up to 100 requests per 60 seconds.'},
    notes: ['Search results are cached for 24 hours, as Pixabay requires.'],
  },
  'openai-image': {
    id: 'openai-image', version: REGISTRY_VERSION, provider: 'openai', source: 'ai-image', kind: 'generate', name: 'OpenAI image generation', mediaType: 'image',
    settings: {models: OPENAI_IMAGE_MODELS, size: {'long-form': '1536x1024', shorts: '1024x1536'}, quality: ['low', 'medium', 'high'], outputFormat: ['png', 'jpeg'], n: 1, moderation: 'auto'},
    mediaRoles: [], output: {mime: ['image/png', 'image/jpeg'], maxBytes: 40 * MB, rendition: 'b64_json decoded locally'},
    rights: OPENAI_TERMS, synthetic: true, cost: {unit: 'image', paid: true, note: 'Owner-entered price per image by quality; check current OpenAI pricing for the chosen model.'},
    notes: ['Text-to-image only in this milestone (no reference images).', 'Every image is synthetic media and carries the style\'s disclosure policy.'],
  },
};
// P06c: drawn scenes. The program draws each generated-graphics shot itself (stick figures, props, labels) in the
// local browser and keeps it as a video clip. No provider, no cost, no third-party media.
CAPABILITIES['drawn-scene'] = {
  id: 'drawn-scene', version: REGISTRY_VERSION, provider: 'local', source: 'generated-graphics', kind: 'draw', name: 'Drawn scene (local)', mediaType: 'video',
  settings: {template: 'sketch-scene', finish: 'From the style: hand-drawn for Stickman and Hand-drawn Canvas, clean for Motion Graphics'},
  mediaRoles: [], output: {mime: ['video/mp4'], maxBytes: 300 * MB, rendition: 'Drawn at the family resolution and the style frame rate'},
  rights: {name: 'Drawn by this program', url: '', commercialUse: true, attribution: 'Not required', restrictions: ['Original drawing from the scene plan; no third-party media']}, synthetic: false,
  cost: {unit: 'shot', paid: false, note: 'Drawn locally in Microsoft Edge or Google Chrome; free.'},
  notes: ['Each shot is drawn from its sketch in the scene plan: figures, props, labels, arrows and bubbles, drawn on stroke by stroke.'],
};
const SOURCE_CAPABILITIES = {'stock-video': ['pexels-video', 'pixabay-video'], 'stock-image': ['pexels-photo', 'pixabay-photo'], 'ai-image': ['openai-image'], 'generated-graphics': ['drawn-scene']};
const NOT_EXECUTABLE = {
  'ai-video': 'No AI video adapter is enabled yet.',
  'maps-and-diagrams': 'Maps and diagrams will be produced by the renderer in a later room.',
  'archival-public-domain': 'No public-domain archive adapter is enabled yet.',
};
const capability = id => { requireValue(Object.hasOwn(CAPABILITIES, id), 'Unknown visual capability.'); return structuredClone(CAPABILITIES[id]); };
const executableSources = sources => sources.filter(source => Object.hasOwn(SOURCE_CAPABILITIES, source));

// ---------------------------------------------------------------- helpers
function mediaUrl(value) {
  if (typeof value !== 'string' || value.length > 2000) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return MEDIA_HOSTS.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`)) ? url.toString() : null;
  } catch { return null; }
}
function pageUrl(value) {
  if (typeof value !== 'string' || value.length > 1000) return null;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null; } catch { return null; }
}
const positive = value => { const number = Number(value); return Number.isFinite(number) && number > 0 ? Math.round(number) : null; };
async function call(fetchImpl, url, options, label, timeout = 30000) {
  try {
    return await fetchImpl(url, {...options, redirect: 'error', signal: AbortSignal.timeout(timeout)});
  } catch {
    throw new InputError(`${label} is unreachable or did not answer in time.`, 502);
  }
}
async function failure(response, label) {
  await response.body?.cancel();
  if (response.status === 401 || response.status === 403) return new InputError(`${label} rejected the API key (HTTP ${response.status}). Check the connector.`, 502);
  if (response.status === 429) return new InputError(`${label} rate limit reached. Wait before trying again.`, 429);
  if (response.status === 400) return new InputError(`${label} refused the request (HTTP 400).`, 502);
  return new InputError(`${label} returned HTTP ${response.status}.`, 502);
}
function rateLimit(response) {
  const value = name => { const number = Number(response.headers?.get?.(name)); return Number.isFinite(number) ? number : null; };
  return {limit: value('x-ratelimit-limit'), remaining: value('x-ratelimit-remaining'), reset: value('x-ratelimit-reset')};
}
function sniffMime(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString('latin1') === 'ftyp') return 'video/mp4';
  if (buffer.length >= 4 && buffer.readUInt32BE(0) === 0x1a45dfa3) return 'video/webm';
  return null;
}
const EXTENSION = {'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm'};

// ---------------------------------------------------------------- Pexels
function pexelsPhoto(item) {
  if (!item || typeof item !== 'object' || !Number.isSafeInteger(Number(item.id))) return null;
  const downloadUrl = mediaUrl(item.src?.original), previewUrl = mediaUrl(item.src?.medium || item.src?.small || item.src?.tiny);
  if (!downloadUrl || !previewUrl) return null;
  return {
    externalId: String(item.id), mediaType: 'image', title: cleanText(item.alt, 300) || `Pexels photo ${item.id}`, author: cleanText(item.photographer, 120), authorUrl: pageUrl(item.photographer_url),
    pageUrl: pageUrl(item.url), width: positive(item.width), height: positive(item.height), durationSeconds: null, previewUrl, downloadUrl,
  };
}
function pexelsVideo(item, target) {
  if (!item || typeof item !== 'object' || !Number.isSafeInteger(Number(item.id))) return null;
  const files = (Array.isArray(item.video_files) ? item.video_files : [])
    .map(file => ({link: mediaUrl(file?.link), width: positive(file?.width), height: positive(file?.height), type: file?.file_type}))
    .filter(file => file.link && file.width && file.height && file.type === 'video/mp4');
  if (!files.length) return null;
  const short = file => Math.min(file.width, file.height), need = Math.min(target.width, target.height);
  const enough = files.filter(file => short(file) >= need).sort((a, b) => a.width * a.height - b.width * b.height);
  const chosen = enough[0] || files.sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const previewUrl = mediaUrl(item.image) || mediaUrl(item.video_pictures?.[0]?.picture);
  if (!previewUrl) return null;
  const duration = Number(item.duration);
  return {
    externalId: String(item.id), mediaType: 'video', title: cleanText(item.url?.split('/').filter(Boolean).at(-1)?.replace(/-\d+$/, '').replaceAll('-', ' '), 300) || `Pexels video ${item.id}`,
    author: cleanText(item.user?.name, 120), authorUrl: pageUrl(item.user?.url), pageUrl: pageUrl(item.url), width: chosen.width, height: chosen.height,
    durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : null, previewUrl, downloadUrl: chosen.link,
  };
}
class PexelsClient {
  constructor(key, fetchImpl = fetch) { this.key = apiKey(key, 'Pexels'); this.fetch = fetchImpl; this.requests = 0; }
  async search({capabilityId, query, format = 'long-form', perPage = 12, locale = null}) {
    requireValue(['pexels-photo', 'pexels-video'].includes(capabilityId), 'Unknown Pexels capability.');
    const video = capabilityId === 'pexels-video', target = ORIENTATION[format] || ORIENTATION['long-form'];
    const url = new URL(video ? '/v1/videos/search' : '/v1/search', PEXELS_ORIGIN);
    url.searchParams.set('query', query);
    url.searchParams.set('orientation', target.pexels);
    url.searchParams.set('per_page', String(perPage));
    if (video) url.searchParams.set('size', 'medium');
    if (locale) url.searchParams.set('locale', locale);
    this.requests += 1;
    const response = await call(this.fetch, url, {headers: {Authorization: this.key}}, 'Pexels');
    if (!response.ok) throw await failure(response, 'Pexels');
    const data = await readJson(response, 'Pexels');
    const items = Array.isArray(video ? data?.videos : data?.photos) ? (video ? data.videos : data.photos) : null;
    requireValue(items, 'Pexels returned an unexpected search response.', 502);
    return {candidates: items.map(item => (video ? pexelsVideo(item, target) : pexelsPhoto(item))).filter(Boolean).slice(0, perPage), rateLimit: rateLimit(response)};
  }
}

// ---------------------------------------------------------------- Pixabay
const PIXABAY_LANGS = new Set(['cs', 'da', 'de', 'en', 'es', 'fr', 'id', 'it', 'hu', 'nl', 'no', 'pl', 'pt', 'ro', 'sk', 'fi', 'sv', 'tr', 'vi', 'th', 'bg', 'ru', 'el', 'ja', 'ko', 'zh']);
function pixabayUser(item) { return item.user && item.user_id ? pageUrl(`https://pixabay.com/users/${encodeURIComponent(String(item.user))}-${encodeURIComponent(String(item.user_id))}/`) : null; }
function pixabayPhoto(item) {
  if (!item || typeof item !== 'object' || !Number.isSafeInteger(Number(item.id))) return null;
  const downloadUrl = mediaUrl(item.largeImageURL), previewUrl = mediaUrl(item.webformatURL || item.previewURL);
  if (!downloadUrl || !previewUrl) return null;
  return {
    externalId: String(item.id), mediaType: 'image', title: cleanText(item.tags, 300) || `Pixabay image ${item.id}`, author: cleanText(item.user, 120), authorUrl: pixabayUser(item),
    pageUrl: pageUrl(item.pageURL), width: positive(item.imageWidth), height: positive(item.imageHeight), durationSeconds: null, previewUrl, downloadUrl,
  };
}
function pixabayVideo(item, target) {
  if (!item || typeof item !== 'object' || !Number.isSafeInteger(Number(item.id))) return null;
  const sizes = ['large', 'medium', 'small'].map(key => ({key, url: mediaUrl(item.videos?.[key]?.url), width: positive(item.videos?.[key]?.width), height: positive(item.videos?.[key]?.height), thumbnail: mediaUrl(item.videos?.[key]?.thumbnail)})).filter(entry => entry.url && entry.width && entry.height);
  if (!sizes.length) return null;
  const chosen = sizes[0], portrait = target.height > target.width;
  if (portrait !== chosen.height > chosen.width) return null;
  const previewUrl = sizes.find(entry => entry.thumbnail)?.thumbnail;
  if (!previewUrl) return null;
  const duration = Number(item.duration);
  return {
    externalId: String(item.id), mediaType: 'video', title: cleanText(item.tags, 300) || `Pixabay video ${item.id}`, author: cleanText(item.user, 120), authorUrl: pixabayUser(item),
    pageUrl: pageUrl(item.pageURL), width: chosen.width, height: chosen.height, durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : null, previewUrl, downloadUrl: chosen.url,
  };
}
class PixabayClient {
  constructor(key, fetchImpl = fetch) { this.key = apiKey(key, 'Pixabay'); this.fetch = fetchImpl; this.requests = 0; }
  async search({capabilityId, query, format = 'long-form', perPage = 12, locale = null}) {
    requireValue(['pixabay-photo', 'pixabay-video'].includes(capabilityId), 'Unknown Pixabay capability.');
    const video = capabilityId === 'pixabay-video', target = ORIENTATION[format] || ORIENTATION['long-form'];
    // Pixabay only accepts the key as a query parameter; the URL is never logged or returned.
    const url = new URL(video ? '/api/videos/' : '/api/', PIXABAY_ORIGIN);
    url.searchParams.set('key', this.key);
    url.searchParams.set('q', query.slice(0, 100));
    url.searchParams.set('safesearch', 'true');
    url.searchParams.set('per_page', String(Math.max(3, perPage)));
    const lang = String(locale || 'en').slice(0, 2).toLowerCase();
    url.searchParams.set('lang', PIXABAY_LANGS.has(lang) ? lang : 'en');
    if (!video) { url.searchParams.set('image_type', 'photo'); url.searchParams.set('orientation', target.pixabay); }
    this.requests += 1;
    const response = await call(this.fetch, url, {}, 'Pixabay');
    if (!response.ok) throw await failure(response, 'Pixabay');
    const data = await readJson(response, 'Pixabay');
    requireValue(Array.isArray(data?.hits), 'Pixabay returned an unexpected search response.', 502);
    return {candidates: data.hits.map(item => (video ? pixabayVideo(item, target) : pixabayPhoto(item))).filter(Boolean).slice(0, perPage), rateLimit: rateLimit(response)};
  }
}

// ---------------------------------------------------------------- OpenAI images
class OpenAIImageClient {
  constructor(key, fetchImpl = fetch) { this.key = apiKey(key, 'OpenAI'); this.fetch = fetchImpl; }
  async generate({model, prompt, size, quality, outputFormat, onRequest = () => {}}) {
    requireValue(validImageModel(model), 'Choose a supported OpenAI image model.');
    requireValue(['1536x1024', '1024x1536', '1024x1024'].includes(size), 'Unsupported image size.');
    requireValue(['low', 'medium', 'high'].includes(quality), 'Unsupported image quality.');
    requireValue(['png', 'jpeg'].includes(outputFormat), 'Unsupported image format.');
    onRequest();
    const response = await call(this.fetch, `${OPENAI_ORIGIN}/v1/images/generations`, {
      method: 'POST', headers: {Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({model, prompt, n: 1, size, quality, output_format: outputFormat, moderation: 'auto'}),
    }, 'OpenAI image generation', 300000);
    if (!response.ok) throw await failure(response, 'OpenAI image generation');
    const data = await readJson(response, 'OpenAI image generation', 80 * MB);
    const b64 = data?.data?.[0]?.b64_json;
    requireValue(typeof b64 === 'string' && b64.length > 100 && /^[A-Za-z0-9+/=\s]+$/.test(b64.slice(0, 2000)), 'OpenAI returned no image data.', 502);
    const bytes = Buffer.from(b64, 'base64'), mime = sniffMime(bytes);
    requireValue(mime === 'image/png' || mime === 'image/jpeg', 'OpenAI returned data that is not a PNG or JPEG image.', 502);
    requireValue(bytes.length <= CAPABILITIES['openai-image'].output.maxBytes, 'OpenAI returned an image that is too large.', 502);
    const usage = data.usage && typeof data.usage === 'object' ? {inputTokens: Number.isSafeInteger(data.usage.input_tokens) ? data.usage.input_tokens : null, outputTokens: Number.isSafeInteger(data.usage.output_tokens) ? data.usage.output_tokens : null, totalTokens: Number.isSafeInteger(data.usage.total_tokens) ? data.usage.total_tokens : null} : null;
    return {bytes, mime, extension: EXTENSION[mime], revisedPrompt: cleanText(data.data[0].revised_prompt, 2000), usage, requestId: cleanText(response.headers?.get?.('x-request-id'), 120)};
  }
}
function validImageModel(model) {
  if (typeof model !== 'string') return false;
  const base = model.replace(/-\d{4}-\d{2}-\d{2}$/, '');
  return OPENAI_IMAGE_MODELS.includes(base);
}

// ---------------------------------------------------------------- downloads and media evidence
async function downloadTo(fetchImpl, url, file, {maxBytes, accept, label = 'Media download', timeout = 300000}) {
  const safe = mediaUrl(url);
  requireValue(safe, `${label}: the source address is not an allowed provider media address.`, 502);
  let response;
  try {
    response = await fetchImpl(safe, {redirect: 'follow', signal: AbortSignal.timeout(timeout)});
  } catch {
    throw new InputError(`${label} failed or timed out.`, 502);
  }
  if (response.url && !mediaUrl(response.url)) { await response.body?.cancel(); throw new InputError(`${label} was redirected outside the provider's media hosts.`, 502); }
  if (!response.ok) { await response.body?.cancel(); throw new InputError(`${label} returned HTTP ${response.status}.`, 502); }
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) { await response.body?.cancel(); throw new InputError(`${label} is larger than ${Math.round(maxBytes / MB)} MB.`, 502); }
  const reader = response.body?.getReader();
  requireValue(reader, `${label} returned no data.`, 502);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const handle = fs.openSync(file, 'wx'), hash = createHash('sha256');
  let bytes = 0, head = Buffer.alloc(0), complete = false;
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      bytes += chunk.length;
      if (bytes > maxBytes) { await reader.cancel(); throw new InputError(`${label} is larger than ${Math.round(maxBytes / MB)} MB.`, 502); }
      if (head.length < 64) head = Buffer.concat([head, chunk.subarray(0, 64 - head.length)]);
      hash.update(chunk);
      fs.writeSync(handle, chunk);
    }
    complete = true;
  } finally {
    reader.releaseLock();
    fs.closeSync(handle);
    if (!complete) fs.rmSync(file, {force: true});
  }
  const mime = sniffMime(head);
  if (!mime || !accept.includes(mime)) { fs.rmSync(file, {force: true}); throw new InputError(`${label} is not an accepted ${accept.join(' or ')} file.`, 502); }
  requireValue(bytes > 0, `${label} was empty.`, 502);
  return {sizeBytes: bytes, sha256: hash.digest('hex'), mime};
}
function writeImmutable(file, bytes) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, bytes, {flag: 'wx'});
  return {sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')};
}
function sha256File(file) {
  const hash = createHash('sha256'), handle = fs.openSync(file, 'r'), buffer = Buffer.alloc(MB);
  try {
    for (;;) { const read = fs.readSync(handle, buffer, 0, buffer.length, null); if (!read) break; hash.update(buffer.subarray(0, read)); }
  } finally { fs.closeSync(handle); }
  return hash.digest('hex');
}
function runTool(command, args, timeout = 60000) {
  return new Promise((resolve, reject) => {
    execFile(command, args, {timeout, maxBuffer: 4 * MB, windowsHide: true}, (error, stdout, stderr) => {
      if (error) {
        const missing = error.code === 'ENOENT';
        reject(new InputError(missing ? `${path.basename(command)} is not installed or not on PATH.` : `${path.basename(command)} could not read the media file.`, missing ? 503 : 502));
        return;
      }
      resolve({stdout: String(stdout), stderr: String(stderr)});
    });
  });
}
async function probeMedia(file, ffprobe = 'ffprobe') {
  const {stdout} = await runTool(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]);
  let data;
  try { data = JSON.parse(stdout); } catch { throw new InputError('ffprobe returned unreadable output.', 502); }
  const streams = Array.isArray(data.streams) ? data.streams : [];
  const visual = streams.find(stream => stream.codec_type === 'video');
  requireValue(visual, 'The file has no decodable picture.', 502);
  const width = positive(visual.width), height = positive(visual.height);
  requireValue(width && height, 'The picture has no valid size.', 502);
  const formatName = String(data.format?.format_name || '');
  const still = /image2|png_pipe|jpeg_pipe|webp_pipe|_pipe$/.test(formatName) || ['png', 'mjpeg', 'webp', 'bmp'].includes(visual.codec_name) && !(Number(data.format?.duration) > 0.5);
  const rate = String(visual.avg_frame_rate || visual.r_frame_rate || '0/1').split('/').map(Number);
  const frameRate = rate[1] ? Math.round(rate[0] / rate[1] * 1000) / 1000 : null;
  const duration = Number(visual.duration || data.format?.duration);
  const result = {kind: still ? 'image' : 'video', width, height, codec: String(visual.codec_name || ''), format: formatName, hasAudio: streams.some(stream => stream.codec_type === 'audio'),
    durationSeconds: still ? null : Number.isFinite(duration) && duration > 0 ? Math.round(duration * 1000) / 1000 : null, frameRate: still ? null : frameRate};
  if (result.kind === 'video') requireValue(result.durationSeconds, 'The video has no valid duration.', 502);
  return result;
}
async function makeThumbnail(input, output, {ffmpeg = 'ffmpeg', video = false, at = 1} = {}) {
  fs.mkdirSync(path.dirname(output), {recursive: true});
  const args = ['-hide_banner', '-nostdin', '-v', 'error'];
  if (video) args.push('-ss', String(Math.max(0, at)));
  args.push('-i', input, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '4', '-y', output);
  await runTool(ffmpeg, args, 60000);
  requireValue(fs.existsSync(output) && fs.statSync(output).size > 0, 'Could not create a thumbnail.', 502);
  return output;
}

module.exports = {
  PEXELS_ORIGIN, PIXABAY_ORIGIN, OPENAI_ORIGIN, REGISTRY_VERSION, CAPABILITIES, SOURCE_CAPABILITIES, NOT_EXECUTABLE, OPENAI_IMAGE_MODELS, ORIENTATION, MEDIA_HOSTS,
  capability, executableSources, validImageModel, mediaUrl, sniffMime, EXTENSION,
  PexelsClient, PixabayClient, OpenAIImageClient, pexelsPhoto, pexelsVideo, pixabayPhoto, pixabayVideo,
  downloadTo, writeImmutable, sha256File, probeMedia, makeThumbnail, runTool,
};
