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
const {spawn, execFile, execFileSync} = require('node:child_process');
const Anthropic = require('@anthropic-ai/sdk').default;

// The AI connections every room may use (owner request 2026-10-22: Claude and/or the ChatGPT plan).
const AI_PROVIDERS = Object.freeze(['claude', 'claude-code', 'chatgpt']);
const MODELS = Object.freeze({'claude-opus-5-5': 'Claude Opus 5.5', 'claude-opus-4-8': 'Claude Opus 4.8', 'claude-sonnet-5-5': 'Claude Sonnet 5.5'});
const DEFAULT_MODELS = Object.freeze({main: 'claude-opus-5-5', support: 'claude-opus-4-8'});
// Owner decision 2026-10-06: Opus 5.5 writes scripts and makes the editing, visual and niche decisions;
// Opus 4.8 does the rest.
const TASK_ROLE = Object.freeze({script: 'main', voice: 'main', scenes: 'main', niche: 'main', editing: 'main', review: 'main', packaging: 'main', localization: 'main', research: 'support', competitors: 'support', frames: 'main', illustrate: 'main'});
const EFFORT = Object.freeze({main: 'high', support: 'medium'});
// Owner request 2026-10-22: choose the Claude model per kind of job, since stronger models use more tokens. A job group
// without a choice uses its connection's main or support model.
const MODEL_GROUPS = Object.freeze({writing: ['script'], planning: ['scenes', 'review', 'frames'], editing: ['editing'], pictures: ['illustrate'], voice: ['voice'], packaging: ['packaging'], languages: ['localization'], research: ['research', 'niche', 'competitors']});
const groupOf = task => Object.keys(MODEL_GROUPS).find(group => MODEL_GROUPS[group].includes(task));
// How heavy each model is, in plain words (the plan's usage limits or the bill depend on it).
const MODEL_WEIGHT = Object.freeze({'claude-opus-5-5': 'best quality, uses the most tokens', 'claude-opus-4-8': 'strong, uses fewer tokens', 'claude-sonnet-5-5': 'fast, uses the fewest tokens'});
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

// nothingUsed: the provider refused before generating anything (signed out, a model the plan lacks, a usage limit,
// the app missing), so the job failed without spending; kind 'login' also marks the connection's test as failed.
class AiError extends Error {
  constructor(message, status = 502, {nothingUsed = false, kind = null} = {}) { super(message); this.status = status; this.nothingUsed = nothingUsed; this.kind = kind; }
}
// What a CLI said, cleaned for a message: one line, no control characters, at most 240 characters.
const saidText = value => String(value || '').replace(/[\x00-\x1f\x7f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);
// Claude Code's own result text when it refused (0.73): a model the plan does not include mentions "/login" too
// ("run /logout and /login for the plan to take effect"), so it is read before the sign-in check.
function claudeCodeRefusal(said, model) {
  const words = saidText(said), name = MODELS[model] || model, quoted = words ? ` Claude Code said: "${words}"` : '';
  if (/output token maximum/i.test(words)) return new AiError('Claude needed more room than this job allows. Raise the family token limit for this kind of job.', 413);
  if (/not available (with|on|for|in)|may not exist|not have access|invalid model|unknown model|model\b.*\bnot (found|supported|allowed)|issue with the selected model/i.test(words)) return new AiError(`Your Claude plan cannot use ${name} in Claude Code, so nothing was generated.${quoted} Choose a model your plan includes for this kind of job (Connections: your Claude connection's models, or the AI team), then try again.`, 403, {nothingUsed: true, kind: 'model'});
  if (/not logged in|log ?in|authenticat|oauth|invalid api key|unauthori[sz]ed|credentials/i.test(words)) return new AiError(`Claude Code is not signed in on this PC, so nothing was generated.${quoted} Click "Sign in to Claude" on your Claude connection in Connections (or run claude auth login in a terminal), then test it again.`, 401, {nothingUsed: true, kind: 'login'});
  if (/usage limit|rate limit|limit reached|too many requests|overloaded/i.test(words)) return new AiError(`Your Claude plan has reached its usage limit for now, so nothing was generated.${quoted} Try again later.`, 429, {nothingUsed: true});
  return new AiError(`Claude Code reported an error. Its usage may still count.${quoted}`, 502);
}

const isFile = file => { try { return !!file && fs.statSync(file).isFile(); } catch { return false; } };
const pathDirs = () => String(process.env.PATH || '').split(path.delimiter).filter(Boolean);
// The Claude Code app installed for this Windows user: the native installer puts claude.exe in .local\bin; an npm
// install has only claude.cmd, which cannot be started without a shell, so its JavaScript entry runs on this Node
// (0.74). Returns {command, prefix} or null; looked up again on every use, so an install or update needs no restart.
function findClaudeCode() {
  const exe = process.platform === 'win32' ? 'claude.exe' : 'claude';
  const native = [process.env.CLAUDE_CODE_PATH, path.join(os.homedir(), '.local', 'bin', exe), ...pathDirs().map(dir => path.join(dir, exe))].find(isFile);
  if (native) return {command: native, prefix: []};
  if (process.platform !== 'win32') return null;
  const pkg = dir => path.join(dir, 'node_modules', '@anthropic-ai', 'claude-code');
  const roots = [path.join(process.env.APPDATA || '', 'npm'), ...pathDirs()].map(pkg);
  const bundled = roots.map(root => path.join(root, 'bin', 'claude.exe')).find(isFile);
  if (bundled) return {command: bundled, prefix: []};
  const cli = roots.map(root => path.join(root, 'cli.js')).find(isFile);
  return cli ? {command: process.execPath, prefix: [cli]} : null;
}
// What a CLI started by the program inherits (0.74). A program started from inside a Claude Code or Codex session
// carries that session's variables; a CLI started under them may refuse to run (a "nested" session) or run
// sandboxed without network. Keys never travel: the subscription's own sign-in is used.
function cliEnv(extra = {}) {
  const env = {...process.env};
  for (const name of Object.keys(env)) {
    if ((/^CLAUDE_?CODE/i.test(name) && !/^CLAUDE_CODE_(OAUTH_TOKEN|GIT_BASH_PATH)$/i.test(name)) || /^CODEX_(SANDBOX|THREAD_ID|CI$|MANAGED)/i.test(name)
      || /^(ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|ANTHROPIC_BASE_URL|OPENAI_API_KEY|CODEX_API_KEY|CODEX_HOME)$/i.test(name)) delete env[name];
  }
  return {...env, ...extra};
}
// A CLI that stopped before answering left its reason on stderr (0.74; it used to be thrown away, so every such stop
// looked like "not signed in"). Returns an AiError naming the cause, or null when stderr says nothing useful.
function cliProblem(stderr, app) {
  const lines = String(stderr || '').split(/\r?\n/).map(saidText).filter(Boolean), said = lines.filter(line => /error|unknown|not |fail|invalid|denied|login|auth/i.test(line)).pop() || lines.pop() || '';
  if (!said) return null;
  const quoted = ` ${app} said: "${said}"`, update = app === 'Claude Code' ? 'open a terminal and run: claude update' : 'update the Codex app';
  if (/unknown option|unknown argument|unexpected argument|unrecognized|invalid option|error: option/i.test(said)) return new AiError(`${app} on this PC is older than this program needs, so nothing was generated.${quoted} To fix it, ${update}, then test the connection again.`, 503, {nothingUsed: true, kind: 'version'});
  if (/another claude code session|nested session/i.test(said)) return new AiError(`Claude Code refused to start inside another Claude Code session, so nothing was generated.${quoted} Start the Control Room with its own Start Control Room shortcut, not from a Claude Code terminal.`, 503, {nothingUsed: true});
  if (/refresh token|token .*(expired|revoked|already used)|re-?authenticate/i.test(said)) return new AiError(`The program's ChatGPT sign-in has run out, so nothing was generated.${quoted} Click "Sign in again" on your ChatGPT connection.`, 401, {nothingUsed: true, kind: 'login'});
  if (/not logged in|log ?in|sign ?in|authenticat|unauthori[sz]ed|credentials/i.test(said)) return new AiError(`${app} is not signed in on this PC, so nothing was generated.${quoted} Click "Sign in" on its connection in Connections.`, 401, {nothingUsed: true, kind: 'login'});
  return new AiError(`${app} stopped before answering. Its usage may still count.${quoted}`, 502);
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
  async complete({model, system, prompt, maxTokens, effort, onStart = () => {}, onProgress = null}) {
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
      // A streamed answer feeds the job's live view as it arrives (0.77).
      if (maxTokens > NON_STREAMING_MAX_TOKENS) { const stream = api.stream(params); if (onProgress) { stream.on('text', delta => onProgress({text: delta})); stream.on('thinking', () => onProgress({thinking: true})); } response = await stream.finalMessage(); }
      else response = await api.create(params);
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) throw new AiError('Claude rejected the API key, so nothing was generated. Check it in Connections.', 401, {nothingUsed: true, kind: 'login'});
      if (error instanceof Anthropic.RateLimitError) throw new AiError('Claude is rate limiting this key, so nothing was generated. Wait, then try again.', 429, {nothingUsed: true});
      if (error instanceof Anthropic.APIError && [400, 403, 404].includes(error.status)) throw new AiError(`Claude refused the request (HTTP ${error.status}), so nothing was generated. Check the model chosen for this kind of job and the key's access.`, error.status, {nothingUsed: true});
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

const CLAUDE_MISSING = 'Claude Code was not found on this PC, so nothing was generated. Install it (claude.com/claude-code: the Windows installer puts it in your user folder), sign in with your Claude subscription, then test the connection again.';
class ClaudeCode {
  // command: the claude executable; prefix: extra leading arguments (tests run a fake script through node). Without a
  // command the app is looked up on every use.
  constructor({command, prefix = []} = {}) { this.override = command; this.overridePrefix = prefix; }
  get found() { return this.override !== undefined ? (this.override ? {command: this.override, prefix: this.overridePrefix} : null) : findClaudeCode(); }
  get command() { return this.found?.command || null; }
  get prefix() { return this.found?.prefix || []; }
  // Claude Code's version and sign-in, read without asking Claude anything (0.74): `claude auth status` says whether
  // it is signed in and how (claude.ai = the subscription; api_key = an Anthropic Console key, billed per use).
  async status() {
    const found = this.found;
    if (!found) throw new AiError(CLAUDE_MISSING, 503, {nothingUsed: true});
    const run = args => new Promise(resolve => execFile(found.command, [...found.prefix, ...args], {env: cliEnv(), timeout: 60000, windowsHide: true, maxBuffer: 1 << 20}, (error, stdout, stderr) => resolve({error, stdout: String(stdout || ''), stderr: String(stderr || '')})));
    const version = await run(['--version']);
    if (version.error && !version.stdout) throw cliProblem(version.stderr, 'Claude Code') || new AiError('Claude Code could not be started on this PC.', 503, {nothingUsed: true});
    const auth = await run(['auth', 'status', '--json']);
    let parsed = null;
    try { parsed = JSON.parse(auth.stdout); } catch { /* an older Claude Code without auth status */ }
    return {version: saidText(version.stdout.split('\n')[0]).slice(0, 80) || null, loggedIn: typeof parsed?.loggedIn === 'boolean' ? parsed.loggedIn : null, method: typeof parsed?.authMethod === 'string' ? parsed.authMethod : null};
  }
  // Claude Code's own sign-in in a window of its own (0.74): it opens Claude's sign-in page in the browser and keeps
  // the sign-in inside Claude Code (the program never reads it). The caller watches status() until it is signed in.
  login() {
    const found = this.found;
    if (!found) throw new AiError(CLAUDE_MISSING, 503);
    if (process.platform !== 'win32') throw new AiError('Open a terminal on this computer and run: claude auth login. Then test the connection again.', 400);
    // cmd /k keeps the window open, so its messages stay readable; the owner closes it when done.
    const line = `"${[found.command, ...found.prefix].map(part => `"${part}"`).join(' ')} auth login --claudeai"`;
    const child = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/k', line], {env: cliEnv(), detached: true, stdio: 'ignore', windowsVerbatimArguments: true});
    child.on('error', () => {});
    child.unref();
  }
  complete({model, system, prompt, maxTokens, effort, onStart = () => {}, onProgress = null}) {
    if (!this.command) return Promise.reject(new AiError(CLAUDE_MISSING, 503, {nothingUsed: true}));
    // An empty working folder and safe mode keep the owner's personal Claude Code setup (CLAUDE.md, plugins,
    // hooks, skills, MCP servers) out of the program's calls; no tools, and nothing is saved as a session.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'control-room-claude-'));
    const systemFile = path.join(dir, 'system.txt');
    fs.writeFileSync(systemFile, system || 'Follow the user message exactly.');
    const env = cliEnv({CLAUDE_CODE_MAX_OUTPUT_TOKENS: String(maxTokens)}); // the subscription login, never a stray key
    // Images travel as one stream-json user message (still no tools); plain text keeps the simple JSON mode. A job that
    // shows its progress live (0.77) reads the answer as it streams (partial messages).
    const blocks = Array.isArray(prompt), stream = blocks || !!onProgress;
    const args = [...this.prefix, '-p', '--safe-mode', '--tools', '', '--no-session-persistence', ...(blocks ? ['--input-format', 'stream-json'] : []), ...(stream ? ['--output-format', 'stream-json', '--verbose', ...(onProgress ? ['--include-partial-messages'] : [])] : ['--output-format', 'json']), '--model', model, '--effort', effort, '--system-prompt-file', systemFile];
    return new Promise((resolve, reject) => {
      const done = (error, value) => { clearTimeout(timer); fs.rmSync(dir, {recursive: true, force: true}); if (error) reject(error); else resolve(value); };
      let child;
      try { onStart(); child = spawn(this.command, args, {cwd: dir, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']}); }
      catch { return done(new AiError('The Claude Code app could not be started.', 503, {nothingUsed: true})); }
      const timer = setTimeout(() => { child.kill(); }, cliTimeoutMs(maxTokens));
      let out = '', bytes = 0, err = '', line = '';
      // A job that shows its progress (0.77): each streamed piece of the answer (or of thinking) goes to the live view and
      // is not kept, so a long streamed answer never counts against the reply size; every other line is kept as before.
      const keep = text => { bytes += Buffer.byteLength(text); if (bytes <= MAX_REPLY_BYTES) out += text; else child.kill(); };
      const seen = chunk => {
        line += chunk;
        if (line.length > MAX_REPLY_BYTES) { line = ''; return child.kill(); }
        const lines = line.split('\n'); line = lines.pop();
        for (const item of lines) {
          let event = null; try { event = JSON.parse(item); } catch { /* kept as it is */ }
          if (event?.type !== 'stream_event') { keep(`${item}\n`); continue; }
          const delta = event.event?.type === 'content_block_delta' ? event.event.delta : null;
          onProgress(delta?.type === 'text_delta' ? {text: delta.text} : {thinking: delta?.type === 'thinking_delta'});
        }
      };
      child.stdout.setEncoding('utf8'); // a letter split across two chunks stays whole (Urdu, accents)
      child.stdout.on('data', chunk => { if (onProgress) seen(chunk); else keep(chunk); });
      child.stderr.on('data', chunk => { err = (err + chunk).slice(-4000); });
      child.on('error', () => done(new AiError('The Claude Code app could not be started.', 503, {nothingUsed: true})));
      child.on('close', code => {
        if (onProgress && line) keep(line);
        let reply;
        try { reply = stream ? out.trim().split('\n').map(line => JSON.parse(line)).findLast(item => item.type === 'result') : JSON.parse(out); if (!reply) throw new Error('no result'); } catch { return done(bytes > MAX_REPLY_BYTES ? new AiError('Claude Code returned too much output.', 502) : code === null ? new AiError('Claude Code took too long and was stopped. Its usage may still count.', 502) : cliProblem(err, 'Claude Code') || new AiError('Claude Code returned no readable answer and gave no reason. Its usage may still count.', 502)); }
        if (reply.is_error || reply.subtype !== 'success') return done(claudeCodeRefusal(reply.result, model));
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

function finish({text, stop, usage, model, who = 'Claude'}) {
  if (stop === 'refusal') throw new AiError('Claude declined this request. Nothing was saved.', 422);
  if (stop === 'max_tokens') throw new AiError('Claude needed more room than this job allows. Raise the family token limit for this kind of job.', 413);
  if (!text.trim()) throw new AiError(`${who} returned an empty answer.`, 502);
  return {content: jsonText(text), usage, model};
}

// ---------------------------------------------------------------- ChatGPT subscription (Codex on this PC)
// Owner request 2026-10-22: the ChatGPT plan works beside Claude (pictures, and scripts written together). OpenAI's
// Codex app ships its command-line program signed in with the owner's ChatGPT account; the program asks it like
// Claude Code: one request, an empty read-only working folder, the owner's own Codex settings left out, nothing
// kept as a session, never retried by itself. Personal use on the owner's own plan only.
// The program keeps its own ChatGPT sign-in, apart from the Codex app's (0.74, owner report 2026-10-30: the test failed
// "after a while"). ChatGPT's sign-in refreshes with a token that works only once; when the Codex app and the program
// shared one sign-in file, whichever refreshed second was signed out. CONTROL_ROOM_CODEX_HOME moves it.
const codexHome = home => home || process.env.CONTROL_ROOM_CODEX_HOME || path.join(os.homedir(), '.control-room', 'codex');
let codexFound;
function findCodex() {
  // The Store app moves to a new folder when it updates: a remembered path that is gone is looked up again.
  if (codexFound !== undefined && (codexFound === null || isFile(codexFound))) return codexFound;
  const exe = process.platform === 'win32' ? 'codex.exe' : 'codex';
  let found = [process.env.CODEX_PATH, ...pathDirs().map(dir => path.join(dir, exe))].find(isFile) || null;
  // The Codex app from the Microsoft Store keeps its program inside the app package.
  if (!found && process.platform === 'win32') {
    try {
      const dir = execFileSync('powershell.exe', ['-NoProfile', '-Command', '(Get-AppxPackage -Name OpenAI.Codex | Select-Object -First 1).InstallLocation'], {encoding: 'utf8', timeout: 20000, windowsHide: true}).trim();
      const file = dir ? path.join(dir, 'app', 'resources', 'codex.exe') : null;
      if (isFile(file)) found = file;
    } catch { /* not installed */ }
  }
  codexFound = found;
  return found;
}
// Codex's own instructions (about 16k tokens, mostly cached) come with every request; the cached part is not counted.
const codexUsage = usage => {
  if (!usage || !Number.isSafeInteger(usage.input_tokens) || !Number.isSafeInteger(usage.output_tokens)) return {promptTokens: null, completionTokens: null, totalTokens: null};
  const prompt = Math.max(0, usage.input_tokens - (usage.cached_input_tokens || 0)), completion = usage.output_tokens + (usage.reasoning_output_tokens || 0);
  return {promptTokens: prompt, completionTokens: completion, totalTokens: prompt + completion};
};
// Codex's event items for tools (`codex exec --json`); the program's requests never need one.
const CODEX_TOOL_ITEMS = Object.freeze(['command_execution', 'file_change', 'mcp_tool_call', 'web_search']);
const CODEX_TOOL = new RegExp(`"type":"(${CODEX_TOOL_ITEMS.join('|')})"`);
class CodexCli {
  // command/prefix/home: tests run a fake script through node with its own Codex home.
  constructor({command, prefix = [], home = null} = {}) { this.override = command; this.prefix = prefix; this.home = home; }
  get command() { return this.override !== undefined ? this.override : findCodex(); }
  // Owner review 2026-10-29: choosing the ChatGPT subscription signs in. Codex's own `codex login` opens ChatGPT's
  // sign-in page in the browser and keeps the sign-in inside Codex (the program never reads it). The page's link is
  // handed to `onLink` for when the browser does not open by itself. One attempt, 10 minutes at most.
  get homeDir() { const dir = codexHome(this.home); fs.mkdirSync(dir, {recursive: true}); return dir; }
  // Codex's version and whether the program's own ChatGPT sign-in is there (0.74), without asking ChatGPT anything.
  async status() {
    if (!this.command) throw new AiError('The Codex app (ChatGPT) was not found on this PC. Install the Codex app, then sign in again.', 503, {nothingUsed: true});
    const env = cliEnv({CODEX_HOME: this.homeDir});
    const run = args => new Promise(resolve => execFile(this.command, [...this.prefix, ...args], {env, timeout: 60000, windowsHide: true, maxBuffer: 1 << 20}, (error, stdout, stderr) => resolve({error, out: `${stdout || ''}\n${stderr || ''}`})));
    const version = await run(['--version']), login = await run(['login', 'status']);
    const said = saidText(login.out);
    return {version: saidText(version.out).slice(0, 80) || null, loggedIn: /logged in using|logged in with/i.test(said) ? true : /not logged in/i.test(said) ? false : null};
  }
  login({onLink = () => {}, timeoutMs = 600000} = {}) {
    if (!this.command) return Promise.reject(new AiError('The Codex app (ChatGPT) was not found on this PC. Install the Codex app first, then sign in again.', 503));
    const env = cliEnv({CODEX_HOME: this.homeDir});
    return new Promise((resolve, reject) => {
      let said = '', child;
      try { child = spawn(this.command, [...this.prefix, 'login'], {env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']}); }
      catch { return reject(new AiError('Codex could not start its sign-in.', 503)); }
      const timer = setTimeout(() => { child.kill(); reject(new AiError('The ChatGPT sign-in was not finished within 10 minutes. Start it again.', 408)); }, timeoutMs);
      const read = chunk => { said = (said + chunk).slice(-8000); const link = said.match(/https:\/\/auth\.openai\.com\/\S+/); if (link) onLink(link[0]); };
      child.stdout.on('data', read); child.stderr.on('data', read);
      child.on('error', () => { clearTimeout(timer); reject(new AiError('Codex could not start its sign-in.', 503)); });
      child.on('close', code => {
        clearTimeout(timer);
        if (code === 0) return resolve({message: 'Signed in with ChatGPT.'});
        const last = said.replace(/https:\/\/\S+/g, '').trim().split('\n').filter(Boolean).pop() || 'it was closed';
        reject(new AiError(`The ChatGPT sign-in did not finish (${last.slice(0, 160)}).`, 401));
      });
    });
  }
  // guard: a text answer is discarded when Codex used a tool; a picture request leaves Codex its image tool.
  run({text, images = [], model, effort, timeoutMs, onStart = () => {}, guard = true, onProgress = null}) {
    if (!this.command) return Promise.reject(new AiError('The Codex app (ChatGPT) was not found on this PC. Install the Codex app and sign in with your ChatGPT account.', 503, {nothingUsed: true}));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'control-room-codex-')), last = path.join(dir, 'answer.txt');
    const files = images.map((image, k) => { const file = path.join(dir, `image-${k + 1}.${/png/.test(image.media_type) ? 'png' : 'jpg'}`); fs.writeFileSync(file, Buffer.from(image.data, 'base64')); return file; });
    const env = cliEnv({CODEX_HOME: this.homeDir}); // the program's own ChatGPT sign-in, never a stray key
    const args = [...this.prefix, 'exec', '--json', '--ephemeral', '--skip-git-repo-check', '--ignore-user-config', '-s', 'read-only', '-C', dir, '-o', last, ...(model ? ['-m', model] : []), ...(effort ? ['-c', `model_reasoning_effort="${effort}"`] : []), ...files.flatMap(file => ['-i', file]), '-'];
    return new Promise((resolve, reject) => {
      const done = (error, value) => { clearTimeout(timer); fs.rmSync(dir, {recursive: true, force: true}); if (error) reject(error); else resolve(value); };
      let child;
      try { onStart(); child = spawn(this.command, args, {cwd: dir, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']}); }
      catch { return done(new AiError('The Codex app could not be started.', 503, {nothingUsed: true})); }
      const timer = setTimeout(() => { child.kill(); }, timeoutMs);
      let out = '', bytes = 0, err = '', line = '';
      // Each event is a sign of life for the job's live view (0.77); Codex sends its answer whole, at the end.
      const seen = chunk => { line += chunk; const lines = line.split('\n'); line = lines.pop(); for (const item of lines) { try { const event = JSON.parse(item); onProgress({thinking: event.item?.type === 'reasoning', text: event.type === 'item.completed' && event.item?.type === 'agent_message' ? String(event.item.text || '') : ''}); } catch { /* not an event line */ } } };
      // Read-only still lets Codex open any file of this Windows account, and prompts carry outside text (Reddit,
      // competitors, screenshots): a tool call stops the run and its answer is thrown away, so nothing it read is saved.
      child.stdout.on('data', chunk => { bytes += chunk.length; if (bytes <= MAX_REPLY_BYTES) out += chunk; else child.kill(); if (guard && CODEX_TOOL.test(chunk)) child.kill(); if (onProgress) seen(String(chunk)); });
      child.stderr.on('data', chunk => { err = (err + chunk).slice(-4000); });
      child.on('error', () => done(new AiError('The Codex app could not be started.', 503, {nothingUsed: true})));
      child.on('close', code => {
        const events = out.split('\n').map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
        if (guard && events.some(event => CODEX_TOOL_ITEMS.includes(event.item?.type))) return done(new AiError('ChatGPT tried to run a command, read a file or browse, so its answer was thrown away and nothing was saved. Its usage may still count.', 502));
        const failed = events.find(event => event.type === 'turn.failed' || event.type === 'error');
        const said = String(failed?.error?.message || failed?.message || '');
        if (failed || !events.some(event => event.type === 'turn.completed')) {
          // Nothing on the event stream: Codex stopped before the request (an old version, no sign-in); stderr says why.
          if (!events.length && code !== null) { const problem = cliProblem(err, 'Codex'); if (problem) return done(problem); }
          const quoted = saidText(said) ? ` Codex said: "${saidText(said)}"` : '';
          if (/refresh token|already used|re-?authenticate/i.test(said)) return done(new AiError(`The program's ChatGPT sign-in has run out, so nothing was generated.${quoted} Click "Sign in again" on your ChatGPT connection.`, 401, {nothingUsed: true, kind: 'login'}));
          if (/log ?in|auth|sign in|unauthori/i.test(said)) return done(new AiError(`Codex is not signed in, so nothing was generated.${quoted} Sign in again from Connections (your ChatGPT connection), then test it.`, 401, {nothingUsed: true, kind: 'login'}));
          if (/usage limit|rate limit|limit reached|quota/i.test(said)) return done(new AiError(`Your ChatGPT plan has reached its usage limit for now, so nothing was generated.${quoted} Try again later.`, 429, {nothingUsed: true}));
          return done(new AiError(`${code === null ? 'Codex took too long and was stopped.' : 'Codex returned no readable answer.'} Its usage may still count.${quoted}`, 502));
        }
        let answer = events.filter(event => event.type === 'item.completed' && event.item?.type === 'agent_message').map(event => event.item.text).at(-1) || '';
        try { answer = fs.readFileSync(last, 'utf8') || answer; } catch { /* the event stream has it */ }
        done(null, {answer, usage: codexUsage(events.findLast(event => event.type === 'turn.completed')?.usage), thread: events.find(event => event.type === 'thread.started')?.thread_id || null});
      });
      child.stdin.on('error', () => {});
      child.stdin.end(text);
    });
  }
  async complete({model, system, prompt, maxTokens, effort, onStart, onProgress}) {
    const blocks = Array.isArray(prompt) ? prompt : [{type: 'text', text: String(prompt)}];
    const text = ['Answer directly from what is written here. Do not run commands, read or write files, browse or use tools.', system || '', blocks.filter(block => block.type === 'text').map(block => block.text).join('\n\n')].filter(Boolean).join('\n\n');
    const reply = await this.run({text, images: blocks.filter(block => block.type === 'image').map(block => block.source), model, effort, timeoutMs: cliTimeoutMs(maxTokens), onStart, onProgress});
    return finish({text: reply.answer, stop: null, usage: reply.usage, model: model || 'gpt (Codex default)', who: 'ChatGPT'});
  }
  // One picture from ChatGPT's image generation, copied to outFile. Codex keeps it under its own home, in a folder
  // named after the request's thread.
  // references: image files attached to the request (the video's style key), so every picture shares one style.
  async image({prompt, outFile, model, references = [], onStart}) {
    const text = `Generate exactly one image with your image generation tool. ${prompt}\nDo not run commands, read or write files, or ask questions. When the image is made, reply with only the word DONE.`;
    const images = references.map(file => ({media_type: /\.png$/i.test(file) ? 'image/png' : 'image/jpeg', data: fs.readFileSync(file).toString('base64')}));
    const reply = await this.run({text, images, model, effort: 'medium', timeoutMs: 8 * 60 * 1000, onStart, guard: false});
    const folder = reply.thread ? path.join(this.homeDir, 'generated_images', reply.thread) : null;
    let made = [];
    try { made = fs.readdirSync(folder).filter(name => /\.(png|jpe?g|webp)$/i.test(name)).map(name => path.join(folder, name)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs); } catch { /* none */ }
    if (!made.length) throw new AiError('ChatGPT answered but made no picture. Its usage may still count.', 502);
    fs.mkdirSync(path.dirname(outFile), {recursive: true});
    fs.copyFileSync(made[0], outFile);
    return {usage: reply.usage, file: outFile};
  }
}

// ---------------------------------------------------------------- the layer the rooms use

class Ai {
  constructor(connectors, {claudeCode = new ClaudeCode(), codex = new CodexCli()} = {}) {
    this.connectors = connectors;
    this.claudeCode = claudeCode;
    this.codex = codex;
    this.lanes = {};
  }
  slot(connectorId) {
    const row = this.connectors.row(connectorId), slot = JSON.parse(row.payload);
    if (!AI_PROVIDERS.includes(slot.provider)) throw new AiError('Choose a Claude or ChatGPT connection.', 400);
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
    // A ChatGPT connection uses its chosen GPT model (or Codex's own default) for every task.
    if (slot.provider === 'chatgpt') return {role, model: slot.models?.main || null, effort: TASK_EFFORT[task] || EFFORT[role]};
    const chosen = this.connectors?.aiRoles?.().models?.[groupOf(task)];
    return {role, model: MODELS[chosen] ? chosen : slot.models?.[role] || DEFAULT_MODELS[role], effort: TASK_EFFORT[task] || EFFORT[role]};
  }
  // messages: [{role, content}]; returns {content, usage, model, provider}.
  // onProgress (0.77): called with each streamed piece of the answer, for the job's live view.
  async complete({connectorId, task, messages, maxTokens, onStart, onProgress = null}) {
    const {row, slot} = this.slot(connectorId), {role, model, effort} = this.model(slot, task), {system, prompt} = splitMessages(messages);
    if (!Number.isSafeInteger(maxTokens) || maxTokens < 256) throw new AiError('This job leaves Claude too little room to answer. Raise its token limit.', 400);
    const client = slot.provider === 'claude' ? new ClaudeApi(this.connectors.key(connectorId), this.connectors.fetch) : slot.provider === 'chatgpt' ? this.codex : this.claudeCode;
    if (slot.provider === 'claude' && !row.secret) throw new AiError('Add the Claude API key in Connections first.', 409);
    // Claude and ChatGPT keep separate lanes, so they work side by side.
    const result = await this.counted(connectorId, onStart, started => this.lane(`${slot.provider === 'chatgpt' ? 'gpt' : 'claude'}:${role}`, () => client.complete({model, system, prompt, maxTokens, effort, onStart: started, onProgress: onProgress && (update => { try { onProgress(update); } catch { /* the view never stops the job */ } })})));
    return {...result, provider: slot.provider, role};
  }
  // The rooms' onStart means "this request may have cost something" (0.73): a refusal before anything was
  // generated leaves it unsaid, so the job fails plainly instead of "interrupted, usage unknown", and a sign-in
  // refusal marks the connection's test as failed so the page stops showing it as connected.
  async counted(connectorId, onStart = () => {}, run) {
    let started = false;
    try {
      const result = await run(() => { started = true; });
      onStart();
      return result;
    } catch (error) {
      if (started && !error?.nothingUsed) onStart();
      if (error?.kind === 'login') this.connectors.failTest?.(connectorId, error.message);
      throw error;
    }
  }
  // A painted picture from ChatGPT's image generation (ChatGPT connections only).
  async image({connectorId, prompt, outFile, references = [], onStart}) {
    const {slot} = this.slot(connectorId);
    if (slot.provider !== 'chatgpt') throw new AiError('Painted pictures need a ChatGPT connection.', 400);
    return this.counted(connectorId, onStart, started => this.lane('gpt:image', () => this.codex.image({prompt, outFile, model: slot.models?.main || null, references, onStart: started})));
  }
  // The AI team (owner request 2026-10-22): the tested Claude and ChatGPT connections and the roles the owner set.
  // Pictures go to ChatGPT when it is connected (it paints); scripts are written together when both are.
  tested(kind) {
    const rows = this.connectors.list().filter(item => (kind === 'chatgpt' ? item.provider === 'chatgpt' : ['claude', 'claude-code'].includes(item.provider)) && (item.hasKey || item.provider !== 'claude') && item.test?.status === 'passed');
    return rows[0] ? {id: rows[0].id, revision: rows[0].revision, provider: rows[0].provider} : null;
  }
  team() {
    const roles = this.connectors.aiRoles?.() || {}, claude = this.tested('claude'), chatgpt = this.tested('chatgpt');
    const pictures = roles.pictures === 'claude' ? claude || chatgpt : chatgpt || claude;
    const together = !!(claude && chatgpt) && roles.scripts !== 'alone';
    const writer = roles.scriptWriter === 'chatgpt' ? chatgpt || claude : claude || chatgpt;
    return {claude, chatgpt, pictures, painted: pictures?.provider === 'chatgpt', scripts: {together, writer, partner: together ? (writer === claude ? chatgpt : claude) : null}, roles};
  }
  // The other AI of the team for a script whose writer is connectorId (null when scripts are written alone).
  partnerFor(connectorId) {
    const team = this.team();
    if (!team.scripts.together) return null;
    const slot = JSON.parse(this.connectors.row(connectorId).payload), other = slot.provider === 'chatgpt' ? team.claude : team.chatgpt;
    return other ? {connectorId: other.id, connectorRevision: other.revision} : null;
  }
  // Connection test: the API key path reads model details (no generation); the subscription path asks one
  // tiny question, which counts very slightly against the plan.
  async test(slot, key) {
    const models = [slot.models?.main || DEFAULT_MODELS.main, slot.models?.support || DEFAULT_MODELS.support];
    if (slot.provider === 'claude') return new ClaudeApi(key, this.connectors.fetch).check(models);
    // Both subscriptions first say, for free, whether they are installed and signed in (0.74), so a missing sign-in is
    // named before any question is asked.
    if (slot.provider === 'chatgpt') {
      const status = await this.codex.status();
      if (status.loggedIn === false) throw new AiError('The program\'s own ChatGPT sign-in is missing (since 0.74 it is kept apart from the Codex app, so the two never sign each other out). Click "Sign in again" on this connection.', 401, {nothingUsed: true, kind: 'login'});
      const reply = await this.codex.complete({model: slot.models?.main || null, system: 'Answer with exactly the word OK.', prompt: 'Connection test.', maxTokens: 400, effort: 'low'});
      if (!/^ok\b/i.test(reply.content.trim())) throw new AiError('Codex answered, but not as expected. Try the test again.', 502);
      return {message: `Codex${status.version ? ` (${status.version})` : ''} answered on your ChatGPT plan (${slot.models?.main || 'its default GPT model'}). One tiny test question was used.`};
    }
    const status = await this.claudeCode.status();
    if (status.loggedIn === false) throw new AiError('Claude Code is not signed in on this PC. Click "Sign in to Claude" on this connection: a window opens Claude\'s sign-in page; sign in with your Claude subscription there.', 401, {nothingUsed: true, kind: 'login'});
    if (['api_key', 'api_key_helper', 'third_party'].includes(status.method)) throw new AiError(`Claude Code is signed in with ${status.method === 'third_party' ? 'a cloud provider account' : 'an Anthropic Console API key, which is billed per use'}, not your Claude subscription. Click "Sign in to Claude" and choose your Claude subscription, or use a "Claude API key" connection instead.`, 409, {nothingUsed: true, kind: 'login'});
    // Every model the jobs ask for (0.73): the test used to try only the support model, so a plan without the main
    // model (scripts, scenes) still showed connected while every script failed.
    const chosen = Object.values(this.connectors?.aiRoles?.().models || {}).filter(model => MODELS[model]);
    const used = [...new Set([...models, ...chosen])];
    for (const model of used) {
      const reply = await this.claudeCode.complete({model, system: 'Answer with exactly the word OK.', prompt: 'Connection test.', maxTokens: 400, effort: 'low'});
      if (!/^ok\b/i.test(reply.content.trim())) throw new AiError(`Claude Code answered with ${MODELS[model] || model}, but not as expected. Try the test again.`, 502);
    }
    return {message: `Claude Code${status.version ? ` ${status.version}` : ''}${status.method === 'claude.ai' ? ', signed in with your Claude subscription,' : ''} answered with ${used.map(model => MODELS[model] || model).join(' and ')} (one tiny test question each).`};
  }
}

module.exports = {Ai, AiError, ClaudeApi, ClaudeCode, CodexCli, findCodex, cliEnv, cliProblem, codexHome, AI_PROVIDERS, MODELS, DEFAULT_MODELS, MODEL_GROUPS, MODEL_WEIGHT, TASK_ROLE, EFFORT, NON_STREAMING_MAX_TOKENS, findClaudeCode, splitMessages, jsonText};
