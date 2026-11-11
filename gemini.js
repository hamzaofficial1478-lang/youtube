'use strict';
// 0.107 - Gemini watches a video, ported from bradautomates/claude-video's gemini engine (MIT, pinned 03ceb42):
// Google's agentic video understanding sees the picture and hears the sound. A YouTube link is watched by Google
// itself (nothing is downloaded by this program); a file the owner saved on this PC is uploaded to Gemini's Files API,
// watched and deleted right after the answer (it would expire by itself within 48 hours).
// The key travels only in the x-goog-api-key header to the fixed Google origin and is scrubbed from every error.
const fs = require('node:fs');
const path = require('node:path');
const {InputError} = require('./store');

const API = 'https://generativelanguage.googleapis.com';
const INTERACTIONS = `${API}/v1beta/interactions`;
const DEFAULT_MODEL = 'gemini-3.7-flash';
const YOUTUBE = /^https?:\/\/(?:(?:www\.|m\.|music\.)?youtube\.com\/(?:watch\?\S*\bv=|shorts\/|live\/)|youtu\.be\/)\S+$/i;
const MIME = {'.mp4': 'video/mp4', '.m4v': 'video/x-m4v', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska', '.webm': 'video/webm', '.avi': 'video/x-msvideo'};
const HINTS = {
  auth: 'Gemini refused the API key. Check it in Connections (make one at aistudio.google.com/apikey)',
  quota: 'The Gemini key is rate-limited or out of quota. Wait a while or check its plan at aistudio.google.com',
  rejected: 'Gemini refused this video. It may be private, age-restricted, unsupported or too long',
  service: 'Gemini had a server error. Try again shortly',
  network: 'Gemini could not be reached from this PC',
  response: 'Gemini answered with something this version cannot read',
  upload: 'The video could not be uploaded to or processed by Gemini',
};
class GeminiError extends InputError {
  constructor(kind, detail, key, status = 502) {
    const clean = String(detail || '').replace(/\s+/g, ' ').slice(0, 400);
    super(`${HINTS[kind]}. ${key ? clean.split(key).join('[key]') : clean}`.trim(), status);
    this.kind = kind;
  }
}

const isYouTube = url => YOUTUBE.test(String(url || '').trim());
// The 11-character video ID of a YouTube link, or null.
function videoId(url) {
  if (!isYouTube(url)) return null;
  const text = String(url).trim(), match = text.match(/[?&]v=([\w-]{11})/) || text.match(/(?:youtu\.be\/|shorts\/|live\/)([\w-]{11})/);
  return match ? match[1] : null;
}
const watchUrl = id => `https://www.youtube.com/watch?v=${id}`;

class GeminiClient {
  constructor(key, fetchImpl = fetch, {sleep = ms => new Promise(resolve => setTimeout(resolve, ms))} = {}) {
    if (typeof key !== 'string' || key.length < 16) throw new InputError('Add the Gemini API key in Connections first.', 409);
    Object.assign(this, {key, fetch: fetchImpl, sleep, requests: 0});
  }
  // One request to Google; a refusal is named by its kind (claude-video's categories).
  async call(method, url, {headers = {}, body, timeoutMs = 60000, signal = null} = {}) {
    if (!String(url).startsWith(`${API}/`)) throw new GeminiError('response', 'An address outside generativelanguage.googleapis.com was refused.', this.key);
    const timeout = AbortSignal.timeout(timeoutMs), stop = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let response;
    this.requests++;
    try { response = await this.fetch(url, {method, headers: {'x-goog-api-key': this.key, ...headers}, body, redirect: 'error', signal: stop}); }
    catch (error) {
      if (signal?.aborted) throw Object.assign(new InputError('Stopped.', 409), {kind: 'stopped'});
      throw new GeminiError('network', timeout.aborted ? `No answer within ${Math.round(timeoutMs / 1000)} s.` : `${error?.cause?.code || error?.name || 'error'}: ${error?.cause?.message || error?.message || ''}`, this.key);
    }
    if (response.ok) return response;
    let message = '';
    try { const data = await response.json(); message = String((Array.isArray(data) ? data[0] : data)?.error?.message || ''); } catch { message = ''; }
    // The Files API answers a malformed key with 400 "API key not valid", not 401.
    const kind = response.status === 401 || response.status === 403 || /api key/i.test(message) ? 'auth' : response.status === 429 ? 'quota' : response.status >= 500 ? 'service' : 'rejected';
    throw new GeminiError(kind, `HTTP ${response.status}${message ? `: ${message}` : ''}`, this.key, kind === 'auth' ? 401 : kind === 'quota' ? 429 : 502);
  }
  // Is the key accepted? One model listing (no generation, free).
  async test() {
    const data = await (await this.call('GET', `${API}/v1beta/models?pageSize=50`)).json();
    return Array.isArray(data?.models) ? data.models.map(model => String(model.name || '').replace(/^models\//, '')).filter(Boolean) : [];
  }
  // Gemini watches one video and answers the prompt: {text, model, tokens}. video is {uri} for a YouTube link, or
  // {uri, mime_type} for an uploaded file. Agentic processing: Gemini decides how densely to look.
  async ask({video, prompt, model = DEFAULT_MODEL, timeoutMs = 600000, signal = null}) {
    const body = JSON.stringify({model, input: [{type: 'video', ...video, processing: 'agentic'}, {type: 'text', text: prompt}]});
    const response = await this.call('POST', INTERACTIONS, {headers: {'Content-Type': 'application/json'}, body, timeoutMs, signal});
    let data;
    try { data = await response.json(); } catch { throw new GeminiError('response', 'The answer was not JSON.', this.key); }
    const parts = Array.isArray(data?.steps) ? data.steps.filter(step => step?.type === 'model_output').flatMap(step => (Array.isArray(step.content) ? step.content : []).filter(part => part?.type === 'text' && part.text).map(part => part.text)) : [];
    if (!parts.length) throw new GeminiError('response', `No answer text (status ${String(data?.status || 'unknown').slice(0, 40)}).`, this.key);
    const tokens = Number.isSafeInteger(data?.usage?.total_tokens) ? data.usage.total_tokens : null;
    return {text: parts.join('\n').trim(), model, tokens};
  }
  // A file on this PC to Gemini's Files API (resumable upload, streamed, never held in memory), then waited for until
  // Google has processed it: {name, uri, mime_type}.
  async upload(file, {maxWaitMs = 900000, pollMs = 2000, signal = null} = {}) {
    const size = fs.statSync(file).size;
    if (!size) throw new GeminiError('upload', 'The file is empty.', this.key, 400);
    const mime = MIME[path.extname(file).toLowerCase()] || 'video/mp4';
    const start = await this.call('POST', `${API}/upload/v1beta/files`, {signal, headers: {'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start', 'X-Goog-Upload-Header-Content-Length': String(size), 'X-Goog-Upload-Header-Content-Type': mime, 'Content-Type': 'application/json'}, body: JSON.stringify({file: {display_name: 'control-room-watch'}})});
    const session = start.headers.get('x-goog-upload-url');
    await start.body?.cancel();
    if (!session) throw new GeminiError('upload', 'The Files API gave no upload address.', this.key);
    const blob = await fs.openAsBlob(file, {type: mime});
    const done = await this.call('POST', session, {signal, timeoutMs: 3600000, headers: {'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize'}, body: blob});
    let info;
    try { info = (await done.json()).file; } catch { info = null; }
    if (!info?.name) throw new GeminiError('upload', 'The Files API answer could not be read.', this.key);
    let waited = 0;
    while (info.state === 'PROCESSING') {
      if (waited >= maxWaitMs) { await this.remove(info.name); throw new GeminiError('upload', `Google was still processing the file after ${Math.round(maxWaitMs / 60000)} minutes.`, this.key); }
      await this.sleep(pollMs); waited += pollMs;
      info = await (await this.call('GET', `${API}/v1beta/${info.name}`, {signal})).json();
    }
    if (info.state !== 'ACTIVE') { await this.remove(info.name); throw new GeminiError('upload', `Google left the file ${String(info.state || 'unknown').slice(0, 30)}.`, this.key); }
    return {name: info.name, uri: info.uri, mime_type: info.mimeType || mime};
  }
  // Cleanup never hides the real result: a failed delete is reported, and the file expires within 48 hours anyway.
  async remove(name) {
    try { const response = await this.call('DELETE', `${API}/v1beta/${name}`); await response.body?.cancel(); return null; }
    catch (error) { return `Could not delete the uploaded copy from Google (${error.message.split('.')[0]}); it expires by itself within 48 hours.`; }
  }
}

module.exports = {GeminiClient, GeminiError, isYouTube, videoId, watchUrl, DEFAULT_MODEL, API};
