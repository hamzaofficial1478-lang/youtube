'use strict';
// The program's one AI layer (owner decision 2026-10-06: Claude replaces Hermes). Every room asks through
// here, on the owner's chosen connection:
//   claude-code  the Claude subscription, through the Claude Code app logged in on this PC. Personal use
//                only: Anthropic does not allow offering subscription login to other people's use.
//   claude       a Claude API key from the Claude Console, through Anthropic's official SDK.
// Each task has a model role; at most one call per role runs at a time, so the two models work side by
// side. Calls never retry automatically: every call is paid or counts against the plan's limits.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');
const Anthropic = require('@anthropic-ai/sdk').default;

const MODELS = Object.freeze({'claude-opus-5-5': 'Claude Opus 5.5', 'claude-opus-4-8': 'Claude Opus 4.8', 'claude-sonnet-5-5': 'Claude Sonnet 5.5'});
const DEFAULT_MODELS = Object.freeze({main: 'claude-opus-5-5', support: 'claude-opus-4-8'});
// Owner decision 2026-10-06: Opus 5.5 writes scripts and makes the editing, visual and niche decisions;
// Opus 4.8 does the rest.
const TASK_ROLE = Object.freeze({script: 'main', voice: 'main', scenes: 'main', niche: 'main', editing: 'main', review: 'main', packaging: 'main', localization: 'main', research: 'support', competitors: 'support', frames: 'main', illustrate: 'main'});
const EFFORT = Object.freeze({main: 'high', support: 'medium'});
// A frame's design is already settled by the plan (blueprint, beats, motions); writing it needs less deliberation
// (live 0.25 run: about 10k thinking tokens per frame at high). A picture's subject is settled by the plan too
// (owner question 2026-10-17; the same picture: high 26k tokens, medium 13k with nearly the same detail, low 4k and plain).
const TASK_EFFORT = Object.freeze({frames: 'medium', illustrate: 'medium'});
// Answers up to this size come back in one response; longer ones (a 30-minute script) are streamed, so the
// request never meets the SDK's timeout for long non-streaming calls.
const NON_STREAMING_MAX_TOKENS = 16000;
// Long answers take longer: the Claude Code app gets 15 minutes, or about 40 ms per allowed output token.
const cliTimeoutMs = maxTokens => Math.max(15 * 60 * 1000, maxTokens * 40);
const MAX_REPLY_BYTES = 8 * 1024 * 1024;

class AiError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

// The Claude Code app installed for this Windows user (the native installer puts it in .local\bin).
function findClaudeCode() {
  const home = os.homedir(), exe = process.platform === 'win32' ? 'claude.exe' : 'claude';
  const candidates = [process.env.CLAUDE_CODE_PATH, path.join(home, '.local', 'bin', exe), ...String(process.env.PATH || '').split(path.delimiter).filter(Boolean).map(dir => path.join(dir, exe))];
  return candidates.find(file => { try { return !!file && fs.statSync(file).isFile(); } catch { return false; } }) || null;
}

// Rooms build OpenAI-style message lists; Claude takes one system prompt and the user turn. A user turn may
// carry content blocks (images for the frame scan); then the prompt is the block list.
function splitMessages(messages) {
  if (!Array.isArray(messages) || !messages.length) throw new AiError('The AI request is empty.', 400);
  const system = messages.filter(item => item.role === 'system').map(item => item.content).join('\n\n');
  const turns = messages.filter(item => item.role !== 'system').map(item => item.content);
  const prompt = turns.some(Array.isArray) ? turns.flatMap(item => (Array.isArray(item) ? item : [{type: 'text', text: String(item)}])) : turns.join('\n\n');
  if (!prompt.length) throw new AiError('The AI request has no question.', 400);
  return {system, prompt};
}
// Replies are asked for as JSON only; a fenced block is accepted, anything else is rejected by the caller.
function jsonText(text) {
  const fenced = String(text).trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : String(text).trim();
}
const usageOf = usage => {
  if (!usage || !Number.isSafeInteger(usage.input_tokens) || !Number.isSafeInteger(usage.output_tokens)) return {promptTokens: null, completionTokens: null, totalTokens: null};
  const prompt = usage.input_tokens + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
  return {promptTokens: prompt, completionTokens: usage.output_tokens, totalTokens: prompt + usage.output_tokens};
};

// ---------------------------------------------------------------- Claude API (API key)

class ClaudeApi {
  constructor(key, fetchImpl = fetch) {
    this.client = new Anthropic({apiKey: key, fetch: fetchImpl, maxRetries: 0, timeout: 10 * 60 * 1000});
  }
  async complete({model, system, prompt, maxTokens, effort, onStart = () => {}}) {
    const request = {
      model, max_tokens: maxTokens, messages: [{role: 'user', content: prompt}],
      ...(system ? {system} : {}),
      // Opus 4.8 thinks only when asked; Opus 5.5 and Sonnet 5.5 always think adaptively. Effort sets depth.
      ...(model === 'claude-opus-4-8' ? {thinking: {type: 'adaptive'}} : {}),
      output_config: {effort},
    };
    let response;
    try {
      onStart();
      // Refusal fallback (server side): a policy decline is re-run on a fallback model inside the same call;
      // the served model is recorded with the result, so nothing switches silently.
      const [api, params] = model === 'claude-opus-4-8' ? [this.client.messages, request] : [this.client.beta.messages, {...request, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default'}];
      response = maxTokens > NON_STREAMING_MAX_TOKENS ? await api.stream(params).finalMessage() : await api.create(params);
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) throw new AiError('Claude rejected the API key. Check it in Connections.', 401);
      if (error instanceof Anthropic.RateLimitError) throw new AiError('Claude is rate limiting this key. Wait, then retry deliberately.', 429);
      if (error instanceof Anthropic.APIConnectionError) throw new AiError('Claude could not be reached or the request timed out. Its billing outcome may be unknown.', 502);
      if (error instanceof Anthropic.APIError) throw new AiError(`Claude returned HTTP ${error.status}. Its billing outcome may be unknown.`, 502);
      throw new AiError('The Claude request failed after it started. Its billing outcome may be unknown.', 502);
    }
    return finish({text: response.content.filter(block => block.type === 'text').map(block => block.text).join(''), stop: response.stop_reason, usage: usageOf(response.usage), model: response.model || model});
  }
  // Key check without generation: reads the chosen models' details.
  async check(models) {
    try { for (const model of new Set(models)) await this.client.models.retrieve(model); }
    catch (error) {
      if (error instanceof Anthropic.AuthenticationError) throw new AiError('Claude rejected the API key.', 401);
      if (error instanceof Anthropic.NotFoundError) throw new AiError('This key cannot use one of the chosen models.', 400);
      throw new AiError('Claude could not be reached to check the key.', 502);
    }
    return {message: `The API key works and can use ${[...new Set(models)].map(model => MODELS[model]).join(' and ')}. Nothing was generated.`};
  }
}

// ---------------------------------------------------------------- Claude Code (subscription)

class ClaudeCode {
  // command: the claude executable; prefix: extra leading arguments (tests run a fake script through node).
  constructor({command = findClaudeCode(), prefix = []} = {}) { this.command = command; this.prefix = prefix; }
  complete({model, system, prompt, maxTokens, effort, onStart = () => {}}) {
    if (!this.command) return Promise.reject(new AiError('The Claude Code app was not found on this PC. Install it and log in with your Claude subscription, or use an API key.', 503));
    // An empty working folder and safe mode keep the owner's personal Claude Code setup (CLAUDE.md, plugins,
    // hooks, skills, MCP servers) out of the program's calls; no tools, and nothing is saved as a session.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'control-room-claude-'));
    const systemFile = path.join(dir, 'system.txt');
    fs.writeFileSync(systemFile, system || 'Follow the user message exactly.');
    const env = {...process.env, CLAUDE_CODE_MAX_OUTPUT_TOKENS: String(maxTokens)};
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN; // the subscription login, never a stray key
    // Images travel as one stream-json user message (still no tools); plain text keeps the simple JSON mode.
    const blocks = Array.isArray(prompt);
    const args = [...this.prefix, '-p', '--safe-mode', '--tools', '', '--no-session-persistence', ...(blocks ? ['--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose'] : ['--output-format', 'json']), '--model', model, '--effort', effort, '--system-prompt-file', systemFile];
    return new Promise((resolve, reject) => {
      const done = (error, value) => { clearTimeout(timer); fs.rmSync(dir, {recursive: true, force: true}); if (error) reject(error); else resolve(value); };
      let child;
      try { onStart(); child = spawn(this.command, args, {cwd: dir, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']}); }
      catch { return done(new AiError('The Claude Code app could not be started.', 503)); }
      const timer = setTimeout(() => { child.kill(); }, cliTimeoutMs(maxTokens));
      let out = '', bytes = 0;
      child.stdout.on('data', chunk => { bytes += chunk.length; if (bytes <= MAX_REPLY_BYTES) out += chunk; else child.kill(); });
      child.stderr.on('data', () => {});
      child.on('error', () => done(new AiError('The Claude Code app could not be started.', 503)));
      child.on('close', code => {
        let reply;
        try { reply = blocks ? out.trim().split('\n').map(line => JSON.parse(line)).findLast(item => item.type === 'result') : JSON.parse(out); if (!reply) throw new Error('no result'); } catch { return done(new AiError(bytes > MAX_REPLY_BYTES ? 'Claude Code returned too much output.' : code === null ? 'Claude Code took too long and was stopped. Its usage may still count.' : 'Claude Code returned no readable answer. Check that it is logged in to your subscription.', 502)); }
        if (reply.is_error || reply.subtype !== 'success') {
          const said = String(reply.result || '');
          if (/output token maximum/i.test(said)) return done(new AiError('Claude needed more room than this job allows. Raise the family token limit for this kind of job.', 413));
          if (/log ?in|authenticat|not logged/i.test(said)) return done(new AiError('Claude Code is not logged in. Open Claude Code once and log in with your subscription.', 401));
          if (/usage limit|rate limit|limit reached/i.test(said)) return done(new AiError('Your Claude plan has reached its usage limit for now. Retry later, deliberately.', 429));
          return done(new AiError('Claude Code reported an error. Its usage may still count.', 502));
        }
        let value;
        try { value = finish({text: String(reply.result || ''), stop: reply.stop_reason, usage: usageOf(reply.usage), model: Object.keys(reply.modelUsage || {})[0] || model}); }
        catch (error) { return done(error); }
        done(null, value);
      });
      child.stdin.on('error', () => {});
      child.stdin.end(blocks ? `${JSON.stringify({type: 'user', message: {role: 'user', content: prompt}})}\n` : prompt);
    });
  }
}

function finish({text, stop, usage, model}) {
  if (stop === 'refusal') throw new AiError('Claude declined this request. Nothing was saved.', 422);
  if (stop === 'max_tokens') throw new AiError('Claude needed more room than this job allows. Raise the family token limit for this kind of job.', 413);
  if (!text.trim()) throw new AiError('Claude returned an empty answer.', 502);
  return {content: jsonText(text), usage, model};
}

// ---------------------------------------------------------------- the layer the rooms use

class Ai {
  constructor(connectors, {claudeCode = new ClaudeCode()} = {}) {
    this.connectors = connectors;
    this.claudeCode = claudeCode;
    this.lanes = {};
  }
  slot(connectorId) {
    const row = this.connectors.row(connectorId), slot = JSON.parse(row.payload);
    if (!['claude', 'claude-code'].includes(slot.provider)) throw new AiError('Choose a Claude connection.', 400);
    return {row, slot};
  }
  // One call per model role at a time: the main and the support model run side by side.
  lane(role, run) {
    const previous = this.lanes[role] || Promise.resolve();
    const next = previous.catch(() => {}).then(run);
    this.lanes[role] = next.catch(() => {});
    return next;
  }
  model(slot, task) {
    const role = TASK_ROLE[task];
    if (!role) throw new AiError(`Unknown AI task ${task}.`, 500);
    return {role, model: slot.models?.[role] || DEFAULT_MODELS[role], effort: TASK_EFFORT[task] || EFFORT[role]};
  }
  // messages: [{role, content}]; returns {content, usage, model, provider}.
  async complete({connectorId, task, messages, maxTokens, onStart}) {
    const {row, slot} = this.slot(connectorId), {role, model, effort} = this.model(slot, task), {system, prompt} = splitMessages(messages);
    if (!Number.isSafeInteger(maxTokens) || maxTokens < 256) throw new AiError('This job leaves Claude too little room to answer. Raise its token limit.', 400);
    const client = slot.provider === 'claude' ? new ClaudeApi(this.connectors.key(connectorId), this.connectors.fetch) : this.claudeCode;
    if (slot.provider === 'claude' && !row.secret) throw new AiError('Add the Claude API key in Connections first.', 409);
    const result = await this.lane(role, () => client.complete({model, system, prompt, maxTokens, effort, onStart}));
    return {...result, provider: slot.provider, role};
  }
  // Connection test: the API key path reads model details (no generation); the subscription path asks one
  // tiny question, which counts very slightly against the plan.
  async test(slot, key) {
    const models = [slot.models?.main || DEFAULT_MODELS.main, slot.models?.support || DEFAULT_MODELS.support];
    if (slot.provider === 'claude') return new ClaudeApi(key, this.connectors.fetch).check(models);
    const reply = await this.claudeCode.complete({model: models[1], system: 'Answer with exactly the word OK.', prompt: 'Connection test.', maxTokens: 400, effort: 'low'});
    if (!/^ok\b/i.test(reply.content.trim())) throw new AiError('Claude Code answered, but not as expected. Try the test again.', 502);
    return {message: `Claude Code answered on your subscription (${MODELS[models[1]] || models[1]}). One tiny test question was used.`};
  }
}

module.exports = {Ai, AiError, ClaudeApi, ClaudeCode, MODELS, DEFAULT_MODELS, TASK_ROLE, EFFORT, NON_STREAMING_MAX_TOKENS, findClaudeCode, splitMessages, jsonText};
