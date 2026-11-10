'use strict';
// TubeMind (tubemind.io, owner request 2026-11-10: "instead of NexLev I have TubeMind"). TubeMind is a YouTube research
// service (outlier videos, niche verdicts, channel research, similar and new channels). AI apps reach it through a
// private connector URL (tubemind.io -> Connect AI -> "Create connector URL"; the key is inside the URL) speaking MCP
// over Streamable HTTP: JSON-RPC 2.0 by POST, answers as JSON or as a server-sent event stream.
//
// TubeMind's own docs (updated 2026-11-06) say connector and API-key data is paused while YouTube reviews TubeMind's API
// use: a connected app gets a short "paused" message instead of research. This client says so in plain words.
//
// The connector URL is a password: it is kept encrypted like an API key, sent only to tubemind.io, never logged and
// never put into an error message. Every call starts from an owner's click and is never retried by itself.
const {InputError} = require('./store');

const PROTOCOL = '2025-06-18';
const CLIENT = {name: 'youtube-control-room', version: '0.97'};
const MAX_ANSWER = 2 * 1024 * 1024;

// The connector URL the owner pastes: https on tubemind.io (or a subdomain), nothing else.
function connectorUrl(value) {
  let url;
  try { url = new URL(String(value || '').trim()); } catch { url = null; }
  const host = url?.hostname.toLowerCase() || '';
  if (!url || url.protocol !== 'https:' || !(host === 'tubemind.io' || host.endsWith('.tubemind.io')) || url.username || url.password || url.port)
    throw new InputError('Paste the TubeMind connector URL: on tubemind.io open Connect AI, click "Create connector URL" and copy the address it shows once (it starts with https://tubemind.io and holds your key). A bare API key is not enough: TubeMind has not published how a key alone is used.');
  return url.toString();
}
// A tool's result as text (TubeMind answers in text and/or structured content).
function resultText(result) {
  if (!result || typeof result !== 'object') return '';
  const parts = (Array.isArray(result.content) ? result.content : []).filter(item => item?.type === 'text' && typeof item.text === 'string').map(item => item.text);
  if (!parts.length && result.structuredContent) parts.push(JSON.stringify(result.structuredContent));
  return parts.join('\n').trim();
}
// TubeMind's paused notice (its connector answers this way while YouTube reviews its API use).
const isPaused = text => /\bpaused\b/i.test(String(text || '')) && /youtube|review|api|research/i.test(String(text || ''));
// The tool list as the program keeps it: name, title, description and input fields.
function toolInfo(tool) {
  const schema = tool?.inputSchema && typeof tool.inputSchema === 'object' ? tool.inputSchema : {};
  const properties = schema.properties && typeof schema.properties === 'object' ? schema.properties : {};
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  return {
    name: String(tool?.name || '').slice(0, 80), title: String(tool?.title || tool?.annotations?.title || '').slice(0, 120), description: String(tool?.description || '').slice(0, 1200),
    fields: Object.entries(properties).slice(0, 30).map(([name, spec]) => ({name: name.slice(0, 60), type: ['string', 'number', 'integer', 'boolean', 'array'].includes(spec?.type) ? spec.type : 'string',
      description: String(spec?.description || '').slice(0, 300), required: required.has(name), ...(Array.isArray(spec?.enum) ? {enum: spec.enum.slice(0, 40).map(String)} : {}),
      ...(spec?.default !== undefined ? {default: spec.default} : {})})),
  };
}
// The arguments the owner typed, checked against the tool's own fields (types converted, unknown fields refused).
function checkArgs(tool, input) {
  const args = {}, given = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  for (const key of Object.keys(given)) if (!tool.fields.some(field => field.name === key)) throw new InputError(`TubeMind's "${tool.title || tool.name}" has no field "${key}".`);
  for (const field of tool.fields) {
    let value = given[field.name];
    if (value === undefined || value === null || value === '') { if (field.required) throw new InputError(`Fill in "${field.name}" for TubeMind's "${tool.title || tool.name}".`); continue; }
    if (field.type === 'number' || field.type === 'integer') { value = Number(value); if (!Number.isFinite(value) || (field.type === 'integer' && !Number.isInteger(value))) throw new InputError(`"${field.name}" must be a ${field.type === 'integer' ? 'whole ' : ''}number.`); }
    else if (field.type === 'boolean') value = value === true || value === 'true';
    else if (field.type === 'array') value = (Array.isArray(value) ? value : String(value).split(',')).map(item => String(item).trim()).filter(Boolean).slice(0, 20);
    else { value = String(value).trim().slice(0, 500); if (field.enum && !field.enum.includes(value)) throw new InputError(`"${field.name}" must be one of: ${field.enum.join(', ')}.`); }
    args[field.name] = value;
  }
  return args;
}

// One MCP session with the owner's TubeMind connector.
class TubeMindClient {
  constructor(url, fetchImpl = fetch, {timeoutMs = 60000} = {}) {
    this.url = connectorUrl(url);
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.session = null;
    this.next = 1;
    this.requests = 0;
  }
  async send(method, params, {notify = false} = {}) {
    const id = notify ? undefined : this.next++, headers = {'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': PROTOCOL, ...(this.session ? {'Mcp-Session-Id': this.session} : {})};
    let response;
    this.requests++;
    try {
      response = await this.fetch(this.url, {method: 'POST', headers, body: JSON.stringify({jsonrpc: '2.0', ...(notify ? {} : {id}), method, ...(params ? {params} : {})}), redirect: 'error', signal: AbortSignal.timeout(this.timeoutMs)});
    } catch (error) {
      throw new InputError(error?.name === 'TimeoutError' ? `TubeMind did not answer within ${Math.round(this.timeoutMs / 1000)} seconds. Nothing was retried.` : 'TubeMind could not be reached from this PC (no internet, or tubemind.io is down). Nothing was retried.', 502);
    }
    const session = response.headers.get('mcp-session-id');
    if (session && /^[\x21-\x7e]{1,200}$/.test(session)) this.session = session;
    if (response.status === 401 || response.status === 403) { await response.body?.cancel(); throw new InputError('TubeMind refused this connector URL: it was revoked, replaced, or your password changed (that turns every key off). Create a new connector URL in Connect AI and save it here.', 502); }
    if (response.status === 404) { await response.body?.cancel(); throw new InputError('TubeMind does not know this connector URL (404). Copy it again from Connect AI.', 502); }
    if (response.status === 429) { await response.body?.cancel(); throw new InputError('TubeMind says the daily limit of your plan is used up (429). It resets at midnight UTC.', 502); }
    if (!response.ok && response.status !== 202) { await response.body?.cancel(); throw new InputError(`TubeMind answered with an error (HTTP ${response.status}). Nothing was retried.`, 502); }
    if (notify || response.status === 202) { await response.body?.cancel(); return null; }
    const raw = await response.text();
    if (raw.length > MAX_ANSWER) throw new InputError('TubeMind sent more than 2 MB in one answer; it was not read.', 502);
    const type = response.headers.get('content-type') || '';
    const messages = /text\/event-stream/i.test(type)
      ? raw.split(/\r?\n\r?\n/).map(block => block.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')).filter(Boolean).map(data => { try { return JSON.parse(data); } catch { return null; } })
      : (() => { try { const body = JSON.parse(raw); return Array.isArray(body) ? body : [body]; } catch { return []; } })();
    const answer = messages.find(message => message && message.id === id);
    if (!answer) throw new InputError('TubeMind sent an answer this program could not read (not MCP JSON-RPC).', 502);
    if (answer.error) throw new InputError(`TubeMind refused the request: ${String(answer.error.message || 'no reason given').slice(0, 300)}`, 502);
    return answer.result;
  }
  async connect() {
    const result = await this.send('initialize', {protocolVersion: PROTOCOL, capabilities: {}, clientInfo: CLIENT});
    await this.send('notifications/initialized', null, {notify: true});
    return {server: result?.serverInfo || null, protocol: result?.protocolVersion || null, instructions: typeof result?.instructions === 'string' ? result.instructions.slice(0, 2000) : null};
  }
  async tools() {
    const out = [];
    let cursor;
    for (let page = 0; page < 5; page++) {
      const result = await this.send('tools/list', cursor ? {cursor} : {});
      out.push(...(Array.isArray(result?.tools) ? result.tools : []).map(toolInfo).filter(tool => tool.name));
      cursor = result?.nextCursor;
      if (!cursor) break;
    }
    return out;
  }
  async call(name, args) {
    const result = await this.send('tools/call', {name, arguments: args});
    const text = resultText(result);
    return {text, error: result?.isError === true, paused: isPaused(text), structured: result?.structuredContent ?? null};
  }
}

module.exports = {PROTOCOL, TubeMindClient, connectorUrl, resultText, isPaused, toolInfo, checkArgs};
