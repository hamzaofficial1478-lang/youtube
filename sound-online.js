'use strict';
// Free sounds and music online (0.61, owner request 2026-10-23): Freesound (sound effects, an API key) and Jamendo
// (music, a client ID), searched on the owner's click and added to the sound library one at a time, with their
// licence, author, page and credit line. Only licences that work in a monetized video are offered: CC0 and CC BY (with
// its credit). NonCommercial is out for a monetized channel; ShareAlike and NoDerivatives are out because music synced
// to a moving image is an adaptation under CC 4.0. The platforms' own API terms reserve commercial use (Freesound:
// "negotiated on a case by case basis"; Jamendo: "may be used freely for non-commercial uses ... commercial uses please
// contact"), so each connection records the owner's confirmation that the platform allows their use.
// Fixed API origins; downloads only from the platform's own hosts (redirects checked one by one), bounded in size.
// Previews stream through the program (the page plays only its own audio) and only for results of the owner's search.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {InputError} = require('./store');
const {connectorReference} = require('./intel-sources');
const M = require('./music');

const requireValue = (ok, message, status = 400) => { if (!ok) throw new InputError(message, status); };
const object = value => { requireValue(value && typeof value === 'object' && !Array.isArray(value), 'Request must be a JSON object.'); return value; };
const person = value => { requireValue(typeof value === 'string' && value.trim().length >= 2 && value.trim().length <= 80, 'Enter your name (2-80 characters).'); return value.trim(); };
const clean = (value, max) => String(value ?? '').replace(/[\x00-\x1F\x7F<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const now = () => new Date().toISOString();
const MAX_BYTES = 60 * 1024 * 1024, MAX_PREVIEW = 16 * 1024 * 1024, CACHE_MINUTES = 30;
const PROVIDERS = Object.freeze({
  freesound: {label: 'Freesound', api: 'https://freesound.org/apiv2/', hosts: /^(cdn\.freesound\.org|freesound\.org)$/i, kind: 'sfx'},
  jamendo: {label: 'Jamendo', api: 'https://api.jamendo.com/v3.0/', hosts: /^([a-z0-9-]+\.)*jamendo\.com$/i, kind: 'music'},
});
// What each empty effect slot is searched for.
const SLOT_QUERY = Object.freeze({whoosh: 'whoosh', 'swoosh-up': 'swoosh rise', pop: 'pop', impact: 'impact hit', stamp: 'stamp paper', boom: 'boom explosion', zap: 'electric zap', thunder: 'thunder', ding: 'ding bell', right: 'correct answer', wrong: 'wrong buzzer', tick: 'clock tick', riser: 'riser', sparkle: 'magic sparkle', cash: 'cash register', glitch: 'glitch', scribble: 'pencil scribble', boing: 'boing', heartbeat: 'heartbeat', typing: 'typing keyboard'});

// A licence a monetized video may use: CC0, or CC BY of any version (credit required).
function licenceOf(value) {
  const text = String(value || '').trim().toLowerCase();
  if (/publicdomain\/zero|^creative commons 0$|^cc0/.test(text)) return {ok: true, code: 'CC0', url: 'https://creativecommons.org/publicdomain/zero/1.0/', credit: false};
  const match = /creativecommons\.org\/licenses\/([a-z-]+)\/(\d\.\d)/.exec(text);
  if (match?.[1] === 'by') return {ok: true, code: `CC BY ${match[2]}`, url: `https://creativecommons.org/licenses/by/${match[2]}/`, credit: true};
  if (text === 'attribution') return {ok: true, code: 'CC BY', url: 'https://creativecommons.org/licenses/by/4.0/', credit: true};
  return {ok: false, code: match ? `CC ${match[1].toUpperCase()} ${match[2]}` : clean(value, 40) || 'unknown'};
}
const creditLine = item => `"${item.title}" by ${item.author} (${item.page}), ${item.licence.code}${item.licence.credit ? ` ${item.licence.url}` : ''}`;

async function readBounded(response, limit) {
  const reader = response.body?.getReader(), chunks = [];
  requireValue(reader, 'The download returned no data.', 502);
  let bytes = 0;
  while (true) { const {done, value} = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > limit) { await reader.cancel(); throw new InputError('The file is larger than the size limit.', 502); } chunks.push(Buffer.from(value)); }
  return Buffer.concat(chunks, bytes);
}

class FreesoundClient {
  constructor(key, fetchImpl = fetch) { requireValue(key, 'The Freesound API key is missing.'); Object.assign(this, {key, fetch: fetchImpl, requests: 0}); }
  async search(query, {kind = 'sfx', limit = 30, sort = 'score'} = {}) {
    const url = new URL('search/', PROVIDERS.freesound.api);
    url.searchParams.set('query', clean(query, 100));
    url.searchParams.set('filter', `license:("Creative Commons 0" OR "Attribution") duration:[${kind === 'sfx' ? '0.1 TO 8' : '20 TO 900'}]`);
    url.searchParams.set('fields', 'id,name,tags,license,username,duration,previews,url');
    url.searchParams.set('page_size', String(Math.max(1, Math.min(60, limit))));
    url.searchParams.set('sort', sort);
    this.requests++;
    let response;
    try { response = await this.fetch(url, {headers: {Authorization: `Token ${this.key}`, Accept: 'application/json'}, redirect: 'error', signal: AbortSignal.timeout(30000)}); } catch { throw new InputError('Freesound did not answer.', 502); }
    if (response.status === 401 || response.status === 403) { await response.body?.cancel(); throw new InputError('Freesound refused the API key.', 502); }
    if (!response.ok) { await response.body?.cancel(); throw new InputError(`Freesound returned HTTP ${response.status}.`, 502); }
    const data = await response.json();
    return (data.results || []).map(item => ({provider: 'freesound', id: String(item.id), title: clean(String(item.name || '').replace(/\.(wav|mp3|ogg|flac|aiff?)$/i, '').replace(/[-_]+/g, ' '), 120) || `Sound ${item.id}`, author: clean(item.username, 60) || 'unknown',
      seconds: Number(item.duration) || 0, tags: (item.tags || []).map(tag => clean(tag, 30).toLowerCase()).filter(Boolean).slice(0, 15), licence: licenceOf(item.license), page: String(item.url || `https://freesound.org/s/${item.id}/`),
      preview: item.previews?.['preview-hq-mp3'] || null, download: item.previews?.['preview-hq-mp3'] || null, kind: 'sfx'}));
  }
}
class JamendoClient {
  constructor(key, fetchImpl = fetch) { requireValue(key, 'The Jamendo client ID is missing.'); Object.assign(this, {key, fetch: fetchImpl, requests: 0}); }
  async search(query, {limit = 100} = {}) {
    const url = new URL('tracks/', PROVIDERS.jamendo.api);
    for (const [key, value] of Object.entries({client_id: this.key, format: 'json', limit: String(Math.max(1, Math.min(200, limit))), search: clean(query, 100), vocalinstrumental: 'instrumental', include: 'licenses musicinfo', audioformat: 'mp31', audiodlformat: 'mp32'})) url.searchParams.set(key, value);
    this.requests++;
    let response;
    try { response = await this.fetch(url, {headers: {Accept: 'application/json'}, redirect: 'error', signal: AbortSignal.timeout(30000)}); } catch { throw new InputError('Jamendo did not answer.', 502); }
    if (!response.ok) { await response.body?.cancel(); throw new InputError(`Jamendo returned HTTP ${response.status}.`, 502); }
    const data = await response.json();
    if (data.headers && data.headers.status !== 'success') throw new InputError(`Jamendo refused the request: ${clean(data.headers.error_message, 160) || 'check the client ID'}.`, 502);
    return (data.results || []).map(item => ({provider: 'jamendo', id: String(item.id), title: clean(item.name, 120) || `Track ${item.id}`, author: clean(item.artist_name, 60) || 'unknown', seconds: Number(item.duration) || 0,
      tags: [...(item.musicinfo?.tags?.genres || []), ...(item.musicinfo?.tags?.vartags || []), ...(item.musicinfo?.tags?.instruments || [])].map(tag => clean(tag, 30).toLowerCase()).filter(Boolean).slice(0, 15),
      licence: licenceOf(item.license_ccurl), page: String(item.shareurl || `https://www.jamendo.com/track/${item.id}`), preview: item.audio || null, download: item.audiodownload_allowed !== false && item.audiodownload ? item.audiodownload : null, kind: 'music'}));
  }
}
const CLIENTS = {freesound: FreesoundClient, jamendo: JamendoClient};

class SoundOnline {
  constructor(store, connectors, library, quota, {fetch: fetchImpl = null, clientFor = null} = {}) {
    Object.assign(this, {store, db: store.db, connectors, library, quota, busy: false});
    this.fetch = fetchImpl || connectors.fetch || fetch;
    this.clientFor = clientFor || ((provider, connectorId) => new CLIENTS[provider](this.connectors.key(connectorId), this.fetch));
    this.cache = new Map();
  }
  // The connection, tested and with the owner's confirmation of the platform's API terms.
  connection(provider, reference) {
    requireValue(Object.hasOwn(PROVIDERS, provider), 'Search Freesound or Jamendo.');
    const ref = connectorReference(this.connectors, reference, provider, PROVIDERS[provider].label, true), payload = JSON.parse(this.connectors.row(ref.id).payload);
    requireValue(payload.termsConfirmed?.at, `The ${PROVIDERS[provider].label} connection has no confirmation that the platform allows your use of its API. Edit the connection and confirm it.`, 409);
    return ref;
  }
  // One request inside the platform's hourly allowance; never retried by itself.
  async request(provider, work) {
    const job = `sound-online:${provider}:${randomUUID()}`, reserved = this.store.transaction(() => this.quota.reserve(job, {[provider]: 1}));
    requireValue(reserved.ok, `The ${PROVIDERS[provider].label} hourly allowance (${reserved.cap} requests) is used up. Try again next hour.`, 409);
    try { const result = await work(); this.quota.settle(job, {[provider]: 1}); return result; } catch (error) { this.quota.settle(job, {[provider]: 1}); throw error; }
  }
  remember(items) {
    const until = Date.now() + CACHE_MINUTES * 60000;
    for (const item of items) this.cache.set(`${item.provider}:${item.id}`, {item, until});
    if (this.cache.size > 3000) for (const [key, value] of this.cache) if (value.until < Date.now() || this.cache.size > 3000) this.cache.delete(key);
  }
  found(ref) { const hit = this.cache.get(String(ref)); requireValue(hit && hit.until > Date.now(), 'Search again: that result is no longer in the list.', 404); return hit.item; }
  publicResult(item) {
    const known = this.db.prepare('SELECT id FROM sounds WHERE source=? AND page_url=?').get(item.provider, item.page);
    return {ref: `${item.provider}:${item.id}`, provider: item.provider, title: item.title, author: item.author, seconds: item.seconds, tags: item.tags, licence: item.licence.code, credit: item.licence.credit, page: item.page, kind: item.kind,
      preview: item.preview ? `/api/sound-online/preview?ref=${encodeURIComponent(`${item.provider}:${item.id}`)}` : null, addable: !!item.download, inLibrary: known?.id || null};
  }
  async search(input) {
    object(input);
    person(input.requestedBy);
    const provider = input.provider, ref = this.connection(provider, input.connector), query = clean(input.query, 100);
    requireValue(query.length >= 2, 'Type what you are looking for (at least 2 characters).');
    const kind = provider === 'jamendo' ? 'music' : input.kind === 'music' ? 'music' : 'sfx';
    const results = await this.request(provider, () => this.clientFor(provider, ref.id).search(query, {kind}));
    const usable = results.filter(item => item.licence.ok);
    this.remember(usable);
    return {provider, query, found: results.length, leftOut: results.length - usable.length, results: usable.slice(0, 60).map(item => this.publicResult(item))};
  }
  // A file from the platform's own hosts, following redirects only there.
  async download(item, url, limit) {
    let target = new URL(url);
    for (let hop = 0; hop < 4; hop++) {
      requireValue(target.protocol === 'https:' && PROVIDERS[item.provider].hosts.test(target.hostname), `The ${PROVIDERS[item.provider].label} file is not on its own servers.`, 502);
      let response;
      try { response = await this.fetch(target, {redirect: 'manual', signal: AbortSignal.timeout(180000)}); } catch { throw new InputError(`${PROVIDERS[item.provider].label} did not send the file.`, 502); }
      if ([301, 302, 303, 307, 308].includes(response.status)) { await response.body?.cancel(); target = new URL(response.headers.get('location'), target); continue; }
      if (!response.ok) { await response.body?.cancel(); throw new InputError(`${PROVIDERS[item.provider].label} returned HTTP ${response.status} for the file.`, 502); }
      return {bytes: await readBounded(response, limit), mime: response.headers.get('content-type') || 'audio/mpeg'};
    }
    throw new InputError('Too many redirects.', 502);
  }
  async preview(ref) { const item = this.found(ref); requireValue(item.preview, 'This result has no preview.', 404); return this.download(item, item.preview, MAX_PREVIEW); }
  // Add one result to the sound library, with its licence, author, page and credit line.
  async add(input) {
    object(input);
    const by = person(input.requestedBy), item = this.found(input.ref);
    requireValue(item.licence.ok, 'That licence cannot be used in a monetized video.');
    requireValue(item.download, `${PROVIDERS[item.provider].label} does not allow downloading this one.`, 409);
    this.connection(item.provider, input.connector);
    const {bytes} = await this.download(item, item.download, MAX_BYTES), file = path.join(os.tmpdir(), `sound-${randomUUID()}.mp3`);
    fs.writeFileSync(file, bytes);
    try {
      const kind = input.kind === 'music' || input.kind === 'sfx' ? input.kind : item.kind;
      const result = await this.library.storeFile(file, {kind, title: item.title, tags: [...new Set([...(input.slot ? [input.slot] : []), ...item.tags])].slice(0, 20), source: item.provider, licence: `${item.licence.code} (${item.licence.url}) via ${PROVIDERS[item.provider].label}`, attribution: item.licence.credit ? creditLine(item) : null, pageUrl: item.page, originalName: `${item.provider}-${item.id}.mp3`, by});
      this.store.event(`Added "${item.title}" by ${item.author} from ${PROVIDERS[item.provider].label} (${item.licence.code}) to the sound library, by ${by}`);
      return {...result, sound: this.library.publicSound(this.library.row(result.id))};
    } finally { fs.rmSync(file, {force: true}); }
  }
  // Empty effect slots filled from Freesound: one search per slot (best rated short CC0/CC BY sound), then the add.
  queueFill(input) {
    object(input);
    const by = person(input.requestedBy), ref = this.connection('freesound', input.connector), filled = M.pickEffects(this.library.tracks('sfx'));
    const kinds = Object.keys(M.SFX).filter(kind => !filled[kind] && (!Array.isArray(input.kinds) || input.kinds.includes(kind)));
    requireValue(kinds.length, 'Every effect slot already has a sound.', 409);
    return this.store.transaction(() => {
      requireValue(!this.db.prepare("SELECT 1 FROM sound_imports WHERE status IN ('queued','running')").get(), 'An import is already running. Wait for it to finish.', 409);
      const id = randomUUID(), at = now();
      this.db.prepare("INSERT INTO sound_imports(id,folder,status,scope,progress,error,created_by,created_at,updated_at) VALUES(?,?,'queued',?,?,NULL,?,?,?)")
        .run(id, 'online:freesound', JSON.stringify({source: 'freesound', online: 'freesound', connector: ref, kinds, licence: 'CC0 or CC BY via Freesound', kind: 'sfx'}), JSON.stringify({total: kinds.length, done: 0, added: 0, already: 0, failed: 0, problems: []}), by, at, at);
      this.store.event(`Queued Freesound sounds for ${kinds.length} empty effect slot(s), by ${by}`);
      return this.library.publicImport(this.library.importRow(id));
    });
  }
  async processNextFill() {
    if (this.busy) return null;
    const row = this.store.transaction(() => { const next = this.db.prepare("SELECT * FROM sound_imports WHERE status='queued' AND folder LIKE 'online:%' ORDER BY created_at, rowid LIMIT 1").get(); if (next) this.db.prepare("UPDATE sound_imports SET status='running', updated_at=? WHERE id=?").run(now(), next.id); return next; });
    if (!row) return null;
    this.busy = true;
    const scope = JSON.parse(row.scope), progress = {total: scope.kinds.length, done: 0, added: 0, already: 0, failed: 0, problems: []};
    const save = () => this.db.prepare('UPDATE sound_imports SET progress=?, updated_at=? WHERE id=?').run(JSON.stringify(progress), now(), row.id);
    try {
      const filled = M.pickEffects(this.library.tracks('sfx'));
      for (const kind of scope.kinds) {
        try {
          if (filled[kind]) { progress.already++; continue; }
          const ref = this.connection('freesound', scope.connector);
          const results = (await this.request('freesound', () => this.clientFor('freesound', ref.id).search(SLOT_QUERY[kind], {kind: 'sfx', limit: 15, sort: 'rating_desc'}))).filter(item => item.licence.ok && item.download && item.seconds <= Math.max(2, M.SFX[kind].seconds * 4));
          requireValue(results.length, 'no CC0 or CC BY sound found');
          this.remember(results);
          const added = await this.add({requestedBy: row.created_by, ref: `freesound:${results[0].id}`, connector: scope.connector, kind: 'sfx', slot: kind});
          if (added.added) progress.added++; else progress.already++;
        } catch (error) { progress.failed++; if (progress.problems.length < 20) progress.problems.push(`${kind}: ${clean(error.message, 140)}`); }
        finally { progress.done++; save(); }
      }
      this.db.prepare("UPDATE sound_imports SET status='completed', updated_at=? WHERE id=?").run(now(), row.id);
      return this.library.publicImport(this.library.importRow(row.id));
    } catch (error) {
      save();
      this.db.prepare("UPDATE sound_imports SET status='failed', error=?, updated_at=? WHERE id=?").run(clean(error.message, 300) || 'Filling the slots failed.', now(), row.id);
      return this.library.publicImport(this.library.importRow(row.id));
    } finally { this.busy = false; }
  }
}

module.exports = {SoundOnline, FreesoundClient, JamendoClient, PROVIDERS, SLOT_QUERY, licenceOf, creditLine};
