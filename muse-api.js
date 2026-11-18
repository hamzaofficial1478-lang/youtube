'use strict';
// 0.112 (owner decision 2026-11-18: "connect my Muse subscription like Claude and ChatGPT"): Meta has no Muse video API,
// so the owner's Muse account is reached through useapi.net (an independent service, not Meta). The owner adds the
// muse.ai account on useapi.net once ("Setup Muse"); the program keeps only the useapi.net API token (encrypted like any
// key, never the Meta password) and uses the account's own weekly Muse allowance. Documented REST API
// (useapi.net/docs/api-muse-v1): POST /assets (raw bytes), POST /jobs/video (prompt, image_1..image_9 asset ids,
// async), GET /jobs/{jobid}, GET /assets/{assetId} (the file). One origin, no redirects, the token never in a message.
const fs = require('node:fs');
const {InputError} = require('./store');

const ORIGIN = 'https://api.useapi.net', BASE = `${ORIGIN}/v1/muse`;
const HINTS = {
  auth: 'useapi.net refused the API token (check it in Connections)',
  allowance: 'Your Muse account has used its weekly allowance',
  busy: 'Muse is busy or your account reached its video limit for now',
  paused: 'useapi.net paused your Muse account: it needs attention (sign in again on useapi.net, Setup Muse)',
  refused: 'Muse refused the request',
  service: 'Muse or useapi.net had a problem; nothing was made',
  network: 'useapi.net could not be reached from this PC',
  response: 'useapi.net answered with something this version cannot read',
};
class MuseError extends InputError {
  constructor(kind, detail, token, status = 502, extra = {}) {
    const clean = String(detail || '').replace(/\s+/g, ' ').slice(0, 400);
    super(`${HINTS[kind]}. ${token ? clean.split(token).join('[token]') : clean}`.trim(), status);
    Object.assign(this, {kind, ...extra});
  }
}
const kindOf = status => (status === 401 ? 'auth' : status === 412 ? 'allowance' : status === 429 ? 'busy' : status === 596 ? 'paused' : status >= 500 ? 'service' : 'refused');

class MuseClient {
  constructor(token, fetchImpl = fetch, {email = null, sleep = ms => new Promise(resolve => setTimeout(resolve, ms))} = {}) {
    if (typeof token !== 'string' || token.length < 16) throw new InputError('Add the useapi.net API token for Muse in Connections first.', 409);
    Object.assign(this, {token, fetch: fetchImpl, email: email || null, sleep, requests: 0});
  }
  async call(method, path, {headers = {}, body, timeoutMs = 60000, signal = null, raw = false} = {}) {
    const url = `${BASE}${path}`;
    const timeout = AbortSignal.timeout(timeoutMs), stop = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let response;
    this.requests++;
    try { response = await this.fetch(url, {method, headers: {Authorization: `Bearer ${this.token}`, ...headers}, body, redirect: 'error', signal: stop, ...(body && typeof body.pipe === 'function' ? {duplex: 'half'} : {})}); }
    catch (error) {
      if (signal?.aborted) throw Object.assign(new InputError('Stopped.', 409), {kind: 'stopped'});
      throw new MuseError('network', timeout.aborted ? `No answer within ${Math.round(timeoutMs / 1000)} s.` : `${error?.cause?.code || error?.name || 'error'}: ${error?.cause?.message || error?.message || ''}`, this.token);
    }
    if (response.ok) return raw ? response : response.json().catch(() => { throw new MuseError('response', `HTTP ${response.status} without JSON.`, this.token); });
    let data = null;
    try { data = await response.json(); } catch { data = null; }
    const message = String(data?.error?.message || data?.error || ''), kind = kindOf(response.status);
    throw new MuseError(kind, `HTTP ${response.status}${message ? `: ${message}` : ''}${data?.retryAt || data?.error?.retryAt ? ` (try again after ${data.retryAt || data.error.retryAt})` : ''}`, this.token, kind === 'auth' ? 401 : kind === 'allowance' || kind === 'busy' ? 429 : 502, {retryAt: data?.retryAt || data?.error?.retryAt || null, httpStatus: response.status});
  }
  query() { return this.email ? `?email=${encodeURIComponent(this.email)}` : ''; }
  // The connection test: the Muse accounts this token has (no generation, no allowance used).
  async accounts() {
    const data = await this.call('GET', '/accounts');
    const list = Array.isArray(data) ? data : data && typeof data === 'object' ? Object.values(data).filter(item => item && typeof item === 'object') : [];
    return list.map(item => ({email: String(item.email || ''), status: String(item.status || item.state || ''), error: item.error ? String(item.error.message || item.error) : null})).filter(item => item.email || Object.keys(data || {}).length);
  }
  // One reference picture uploaded to the Muse account (the same file returns the same asset id; no allowance used).
  async upload(file, mime) {
    const bytes = fs.readFileSync(file);
    const data = await this.call('POST', `/assets${this.query()}`, {headers: {'Content-Type': mime, 'Content-Length': String(bytes.length)}, body: bytes, timeoutMs: 120000});
    if (typeof data?.assetId !== 'string' || !data.assetId) throw new MuseError('response', 'The upload answer has no asset id.', this.token);
    return data.assetId;
  }
  // A video job (about 10 s, 720p, with sound) from the prompt and up to nine reference pictures, started async.
  async startVideo({prompt, images = []}) {
    const body = {prompt: String(prompt).slice(0, 5000), async: true, ...(this.email ? {email: this.email} : {})};
    images.slice(0, 9).forEach((assetId, k) => { body[`image_${k + 1}`] = assetId; });
    const data = await this.call('POST', '/jobs/video', {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body), timeoutMs: 120000});
    if (typeof data?.jobid !== 'string' || !data.jobid) throw new MuseError('response', 'The job answer has no job id.', this.token);
    return data.jobid;
  }
  async job(jobid) { return this.call('GET', `/jobs/${encodeURIComponent(jobid)}`); }
  // Waits for a job: started -> completed (the finished video's asset id) or failed (its reason).
  async waitVideo(jobid, {timeoutMs = 20 * 60000, everyMs = 10000, signal = null, onTick = () => {}} = {}) {
    const until = Date.now() + timeoutMs;
    for (;;) {
      const record = await this.job(jobid);
      if (record?.status === 'completed') {
        const asset = (record.result?.assets || []).find(item => item?.type === 'video' || String(item?.mime || '').startsWith('video/'));
        if (!asset?.assetId) throw new MuseError('response', 'Muse finished but returned no video.', this.token);
        return {assetId: asset.assetId, mime: asset.mime || 'video/mp4', bytes: asset.bytes || null, text: String(record.result?.text || '').slice(0, 600)};
      }
      if (record?.status === 'failed') {
        const code = Number(record.error?.code) || 0, kind = code ? kindOf(code) : 'refused';
        throw new MuseError(kind, String(record.error?.message || record.error || 'The job failed.'), this.token, kind === 'allowance' || kind === 'busy' ? 429 : 502, {retryAt: record.error?.retryAt || null, failed: true});
      }
      if (record?.status !== 'started') throw new MuseError('response', `Unknown job status "${String(record?.status).slice(0, 40)}".`, this.token);
      if (Date.now() > until) throw new MuseError('service', `Muse did not finish within ${Math.round(timeoutMs / 60000)} minutes; the job is kept and looked at again on retry.`, this.token, 504, {pending: true});
      onTick(record);
      if (signal?.aborted) throw Object.assign(new InputError('Stopped.', 409), {kind: 'stopped'});
      await this.sleep(everyMs);
    }
  }
  // The finished file, streamed to disk (at most maxBytes).
  async download(assetId, file, maxBytes = 500 * 1024 * 1024) {
    const response = await this.call('GET', `/assets/${encodeURIComponent(assetId)}`, {raw: true, timeoutMs: 300000});
    const type = String(response.headers.get('content-type') || '');
    if (!/^video\//.test(type)) throw new MuseError('response', `The file is ${type || 'of no type'}, not a video.`, this.token);
    const out = fs.createWriteStream(file, {flags: 'wx'});
    let bytes = 0;
    try {
      for await (const chunk of response.body) {
        bytes += chunk.length;
        if (bytes > maxBytes) throw new MuseError('response', 'The video is larger than 500 MB.', this.token);
        if (!out.write(chunk)) await new Promise(resolve => out.once('drain', resolve));
      }
      await new Promise((resolve, reject) => out.end(error => (error ? reject(error) : resolve())));
    } catch (error) { out.destroy(); fs.rmSync(file, {force: true}); throw error; }
    return {bytes, mime: type.split(';')[0]};
  }
}

module.exports = {MuseClient, MuseError, ORIGIN, BASE};
