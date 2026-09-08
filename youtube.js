'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {randomUUID} = require('node:crypto');
const {InputError} = require('./store');

function validateKey(key) {
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{30,200}$/.test(key)) {
    throw new InputError('Enter a valid API key without spaces (30–200 characters).');
  }
  return key;
}

class WindowsVault {
  constructor(directory) { this.file = path.join(directory, 'youtube-key.dpapi'); }
  status() { return {supported: process.platform === 'win32', saved: fs.existsSync(this.file)}; }
  transform(operation, input) {
    if (process.platform !== 'win32') throw new InputError('Protected key storage currently requires Windows. Planning still works.', 503);
    // ponytail: one short, synchronous OS operation; use async helpers if multiple users are added.
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'scripts/Protect-Secret.ps1'), '-Operation', operation], {
      input: input.toString('base64'), encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 16384, shell: false
    });
    if (result.error || result.status !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(result.stdout || '')) {
      throw new InputError('Windows could not unlock or save the key. Use the Windows account that saved it, or replace the key in Connections.', 503);
    }
    return Buffer.from(result.stdout, 'base64');
  }
  get() {
    if (!fs.existsSync(this.file)) throw new InputError('Save a YouTube Data API key in Connections first.', 409);
    try {
      if (fs.statSync(this.file).size > 16384) throw new Error('Invalid vault size');
      return validateKey(this.transform('unprotect', fs.readFileSync(this.file)).toString('utf8'));
    } catch (error) {
      if (error instanceof InputError) throw error;
      throw new InputError('The saved key could not be read. Replace it in Connections.', 503);
    }
  }
  set(key) {
    const encrypted = this.transform('protect', Buffer.from(validateKey(key)));
    fs.mkdirSync(path.dirname(this.file), {recursive: true});
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, encrypted, {flag: 'wx', mode: 0o600});
      fs.renameSync(temporary, this.file);
    } finally { fs.rmSync(temporary, {force: true}); }
  }
  remove() { fs.rmSync(this.file, {force: true}); }
}

function channelFilter(input) {
  if (typeof input !== 'string' || input.length > 200) throw new InputError('Enter a YouTube @handle or channel ID.');
  let value = input.trim();
  if (value.startsWith('https://')) {
    let url;
    try { url = new URL(value); } catch { throw new InputError('Enter a valid YouTube channel URL.'); }
    if (!['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname) || url.port || url.username || url.password || url.search || url.hash) {
      throw new InputError('Use a plain https://www.youtube.com/@handle or /channel/ID URL without extra parameters.');
    }
    try { value = decodeURIComponent(url.pathname).replace(/^\/(?:channel\/)?/, '').replace(/\/$/, ''); }
    catch { throw new InputError('The channel URL contains invalid encoding.'); }
  }
  if (/^UC[A-Za-z0-9_-]{22}$/.test(value)) return {id: value};
  if (/^@[\p{L}\p{N}_\.\-·]{3,100}$/u.test(value)) return {forHandle: value};
  throw new InputError('Use a channel ID starting with UC, an @handle, or its plain YouTube channel URL. Video and custom /c/ links are not supported yet.');
}

async function responseJson(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new InputError('YouTube returned an empty response. Try again later.', 502);
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read(); if (done) break;
      size += value.length;
      if (size > 131072) { await reader.cancel(); throw new Error('Response limit'); }
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch { throw new InputError('YouTube returned an unreadable response. Try again later.', 502); }
  finally { reader.releaseLock(); }
}

class YouTubeResearch {
  constructor(vault, fetchImpl = fetch) { this.vault = vault; this.fetch = fetchImpl; this.busy = false; this.check = null; }
  status() { return {...this.vault.status(), busy: this.busy, check: this.check}; }
  idle() { if (this.busy) throw new InputError('A channel lookup is running. Wait for it to finish.', 409); }
  save(key) { this.idle(); this.vault.set(validateKey(key)); this.check = null; }
  forget() { this.idle(); this.vault.remove(); this.check = null; }
  async lookup(input) {
    this.idle(); const filter = channelFilter(input);
    const key = this.vault.get();
    this.busy = true;
    try {
      const url = new URL('https://www.googleapis.com/youtube/v3/channels');
      url.search = new URLSearchParams({part: 'snippet,statistics', ...filter, maxResults: '1'}).toString();
      let response;
      try { response = await this.fetch(url, {headers: {'x-goog-api-key': key}, redirect: 'error', signal: AbortSignal.timeout(10000)}); }
      catch { throw new InputError('Could not reach YouTube within 10 seconds. Check your connection and retry. No automatic retry was made.', 502); }
      if (!response.ok) {
        await response.body?.cancel();
        const messages = {
          400: 'YouTube rejected the request. Check the API key and channel identifier.',
          401: 'YouTube rejected the API key. Replace it in Connections.',
          403: 'YouTube denied access. Check that YouTube Data API v3 is enabled, key restrictions permit this server, and the project has quota available.',
          404: 'YouTube could not find this channel.',
          429: 'YouTube rate-limited this request. Wait before trying again.'
        };
        throw new InputError(messages[response.status] || 'YouTube is unavailable. Try again later.', 502);
      }
      const data = await responseJson(response);
      if (!Array.isArray(data.items)) throw new InputError('YouTube returned an unexpected channel response.', 502);
      if (!data.items.length) throw new InputError('No public channel matched that identifier. Check the handle or channel ID.', 404);
      const channel = data.items[0];
      if (!/^UC[A-Za-z0-9_-]{22}$/.test(channel?.id) || (filter.id && filter.id !== channel.id) || typeof channel.snippet?.title !== 'string') {
        throw new InputError('YouTube returned a channel identity that could not be verified.', 502);
      }
      const count = value => typeof value === 'string' && /^\d{1,30}$/.test(value) ? value : null;
      const result = {
        id: channel.id, title: channel.snippet.title.slice(0, 200),
        description: String(channel.snippet.description || '').slice(0, 5000),
        country: /^[A-Z]{2}$/.test(channel.snippet.country || '') ? channel.snippet.country : null,
        subscribers: channel.statistics?.hiddenSubscriberCount === true ? null : count(channel.statistics?.subscriberCount),
        views: count(channel.statistics?.viewCount), videos: count(channel.statistics?.videoCount),
        fetchedAt: new Date().toISOString(), sourceUrl: `https://www.youtube.com/channel/${channel.id}`,
        access: 'public_metadata_only'
      };
      this.check = {status: 'verified', at: result.fetchedAt};
      return result;
    } catch (error) { this.check = {status: 'failed', at: new Date().toISOString()}; throw error; }
    finally { this.busy = false; }
  }
}
module.exports = {WindowsVault, YouTubeResearch, channelFilter};
