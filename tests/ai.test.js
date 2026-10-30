'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {Ai, AiError, ClaudeApi, ClaudeCode, DEFAULT_MODELS, TASK_ROLE} = require('../ai');
const {Store} = require('../store');
const {ConnectorSlots} = require('../connectors');
const {claudeMessage, claudeStream, isClaudeMessages, isClaudeModel, claudeModel, fakeClaudeCode} = require('./fake-claude');

const protector = {transform: (op, input) => Buffer.from([...input].reverse())};
const KEY = 'sk-ant-api03-test-key-0000000000';

test('the API-key connection calls Claude through the SDK with the chosen model, effort and no retries', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { const body = JSON.parse(init.body); calls.push({url: String(url), headers: init.headers, body}); return (body.stream ? claudeStream : claudeMessage)({ok: true}, {input_tokens: 100, output_tokens: 40, cache_read_input_tokens: 20}, {model: 'claude-opus-5-5'}); };
  const result = await new ClaudeApi(KEY, fetchImpl).complete({model: 'claude-opus-5-5', system: 'Return JSON only.', prompt: 'Data', maxTokens: 50000, effort: 'high'});
  assert.equal(result.content, '{"ok":true}');
  assert.deepEqual(result.usage, {promptTokens: 120, completionTokens: 40, totalTokens: 160});
  assert.equal(result.model, 'claude-opus-5-5');
  const [call] = calls;
  assert.match(call.url, /^https:\/\/api\.anthropic\.com\/v1\/messages/);
  assert.equal(call.headers.get('x-api-key'), KEY, 'the key travels in its header only');
  assert.match(call.headers.get('anthropic-beta'), /server-side-fallback-2026-07-01/);
  assert.equal(call.body.fallbacks, 'default', 'a refusal is re-run server side and the served model is recorded');
  assert.deepEqual([call.body.max_tokens, call.body.stream], [50000, true], 'a long answer (a 30-minute script) is streamed instead of capped');
  assert.deepEqual(call.body.output_config, {effort: 'high'});
  assert.equal(call.body.thinking, undefined, 'Opus 5.5 always thinks adaptively; it takes no thinking setting');
  assert.equal(call.body.system, 'Return JSON only.');
  // Opus 4.8 must be asked to think, and takes no fallback beta.
  calls.length = 0;
  await new ClaudeApi(KEY, fetchImpl).complete({model: 'claude-opus-4-8', system: '', prompt: 'Data', maxTokens: 2000, effort: 'medium'});
  assert.equal(calls[0].body.stream, undefined, 'short answers come back in one response');
  assert.deepEqual(calls[0].body.thinking, {type: 'adaptive'});
  assert.equal(calls[0].body.fallbacks, undefined);
  // Failures are named and never retried.
  let attempts = 0;
  const limited = async () => { attempts++; return new Response(JSON.stringify({type: 'error', error: {type: 'rate_limit_error', message: 'slow down'}}), {status: 429, headers: {'content-type': 'application/json'}}); };
  await assert.rejects(new ClaudeApi(KEY, limited).complete({model: 'claude-opus-4-8', prompt: 'x', maxTokens: 500, effort: 'low'}), /rate limiting/);
  assert.equal(attempts, 1, 'no automatic retry');
  await assert.rejects(new ClaudeApi(KEY, async () => claudeMessage('', undefined, {stop: 'refusal'})).complete({model: 'claude-opus-4-8', prompt: 'x', maxTokens: 500, effort: 'low'}), error => error instanceof AiError && /declined/.test(error.message));
  await assert.rejects(new ClaudeApi(KEY, async () => claudeMessage('{"a":', undefined, {stop: 'max_tokens'})).complete({model: 'claude-opus-4-8', prompt: 'x', maxTokens: 500, effort: 'low'}), /more room/);
  const fenced = await new ClaudeApi(KEY, async () => claudeMessage('```json\n{"a":1}\n```')).complete({model: 'claude-opus-4-8', prompt: 'x', maxTokens: 500, effort: 'low'});
  assert.equal(fenced.content, '{"a":1}');
});

test('the subscription connection runs Claude Code isolated: safe mode, no tools, empty folder, no stray key', async t => {
  const fake = fakeClaudeCode(t);
  fake.reply({title: 'ok'}, {usage: {input_tokens: 800, output_tokens: 120}});
  process.env.ANTHROPIC_API_KEY = 'sk-should-not-leak';
  t.after(() => { delete process.env.ANTHROPIC_API_KEY; });
  const client = new ClaudeCode({command: fake.command, prefix: fake.prefix});
  const result = await client.complete({model: 'claude-opus-5-5', system: 'Return JSON only.', prompt: 'The data.', maxTokens: 6000, effort: 'high'});
  assert.equal(result.content, '{"title":"ok"}');
  assert.deepEqual(result.usage, {promptTokens: 800, completionTokens: 120, totalTokens: 920});
  const [call] = fake.calls();
  for (const flag of ['-p', '--safe-mode', '--no-session-persistence']) assert.ok(call.args.includes(flag), flag);
  assert.equal(call.args[call.args.indexOf('--tools') + 1], '', 'all tools are disabled');
  assert.equal(call.args[call.args.indexOf('--model') + 1], 'claude-opus-5-5');
  assert.equal(call.args[call.args.indexOf('--effort') + 1], 'high');
  assert.equal(call.args[call.args.indexOf('--output-format') + 1], 'json');
  assert.equal(call.system, 'Return JSON only.');
  assert.equal(call.stdin, 'The data.');
  assert.equal(call.maxOutput, '6000', 'the job token limit caps the answer');
  assert.equal(call.apiKeyPresent, false, 'the subscription login is used, never a stray API key');
  assert.deepEqual(call.cwdFiles, ['system.txt'], 'an empty working folder: no project files or CLAUDE.md');
  assert.equal(fs.existsSync(call.cwd), false, 'the working folder is removed afterwards');
  // Errors are mapped to plain messages; nothing half-finished is returned.
  fake.reply("API Error: Claude's response exceeded the 40 output token maximum.", {error: true});
  await assert.rejects(client.complete({model: 'claude-opus-4-8', system: '', prompt: 'x', maxTokens: 40, effort: 'low'}), /more room/);
  fake.reply('Not logged in. Please run /login', {error: true});
  await assert.rejects(client.complete({model: 'claude-opus-4-8', system: '', prompt: 'x', maxTokens: 400, effort: 'low'}), error => /not signed in on this PC[\s\S]*said: "Not logged in\. Please run \/login"[\s\S]*type \/login/.test(error.message) && error.nothingUsed && error.kind === 'login');
  // 0.73: a model the plan lacks also mentions /login; it is named as the plan's model, not as a sign-in problem.
  fake.reply('Claude Opus 5.5 is not available with the Claude Pro plan. If you have updated your subscription plan recently, run /logout and /login for the plan to take effect.', {error: true});
  await assert.rejects(client.complete({model: 'claude-opus-5-5', system: '', prompt: 'x', maxTokens: 400, effort: 'low'}), error => /plan cannot use Claude Opus 5\.5/.test(error.message) && error.nothingUsed && error.kind === 'model');
  fake.reply('Claude AI usage limit reached|1761840000', {error: true});
  await assert.rejects(client.complete({model: 'claude-opus-4-8', system: '', prompt: 'x', maxTokens: 400, effort: 'low'}), error => /usage limit/.test(error.message) && error.nothingUsed);
  fake.reply('Something odd happened mid-answer', {error: true});
  await assert.rejects(client.complete({model: 'claude-opus-4-8', system: '', prompt: 'x', maxTokens: 400, effort: 'low'}), error => /usage may still count\. Claude Code said: "Something odd happened mid-answer"/.test(error.message) && !error.nothingUsed);
  fake.reply('nothing', {stop: 'refusal'});
  await assert.rejects(client.complete({model: 'claude-opus-4-8', system: '', prompt: 'x', maxTokens: 400, effort: 'low'}), /declined/);
  await assert.rejects(new ClaudeCode({command: null}).complete({model: 'claude-opus-4-8', prompt: 'x', maxTokens: 400, effort: 'low'}), /not found/);
});

test('tasks route to the two models and the two models work side by side, one call each at a time', async t => {
  const store = new Store(':memory:');
  t.after(() => store.close());
  const slots = new ConnectorSlots(store, protector, async () => { throw new Error('no network'); });
  const fake = fakeClaudeCode(t);
  const active = new Map(), modelsSeen = [];
  let parallel = 0;
  const ai = new Ai(slots, {claudeCode: {complete: async ({model}) => {
    assert.equal(active.get(model) || 0, 0, 'same-role calls must not overlap');
    active.set(model, 1); modelsSeen.push(model);
    parallel = Math.max(parallel, [...active.values()].reduce((a, b) => a + b, 0));
    await new Promise(resolve => setImmediate(resolve));
    active.set(model, 0);
    return {content: '{"ok":1}', usage: {promptTokens: 1, completionTokens: 1, totalTokens: 2}, model};
  }}});
  const slot = slots.save({name: 'My Claude', provider: 'claude-code'});
  assert.deepEqual(slot.models, DEFAULT_MODELS, 'Opus 5.5 main, Opus 4.8 support by default');
  assert.equal(slot.hasKey, false);
  assert.equal(TASK_ROLE.script, 'main');
  assert.equal(TASK_ROLE.research, 'support');
  assert.equal(new Ai(null).model({}, 'frames').effort, 'medium', 'frame workers think less than the plan');
  assert.equal(new Ai(null).model({}, 'illustrate').effort, 'medium', 'the illustrator draws a subject the plan already chose');
  fake.reply({ok: 1}, {delayMs: 400});
  const messages = [{role: 'system', content: 'S'}, {role: 'user', content: 'U'}];
  const [script, niche, research] = await Promise.all([
    ai.complete({connectorId: slot.id, task: 'script', messages, maxTokens: 4000}),
    ai.complete({connectorId: slot.id, task: 'niche', messages, maxTokens: 4000}),
    ai.complete({connectorId: slot.id, task: 'research', messages, maxTokens: 4000}),
  ]);
  assert.equal(script.role, 'main');
  assert.equal(research.role, 'support');
  const models = modelsSeen.sort();
  assert.deepEqual(models, ['claude-opus-4-8', 'claude-opus-5-5', 'claude-opus-5-5']);
  assert.equal(parallel, 2, 'the support role runs alongside the main role');
  assert.equal(niche.provider, 'claude-code');
  // The owner can choose other models per role; unknown models are refused.
  const changed = slots.save({name: 'My Claude', provider: 'claude-code', revision: slot.revision, models: {main: 'claude-opus-5-5', support: 'claude-sonnet-5-5'}}, slot.id);
  assert.deepEqual(changed.models, {main: 'claude-opus-5-5', support: 'claude-sonnet-5-5'});
  assert.throws(() => slots.save({name: 'Bad', provider: 'claude-code', models: {main: 'gpt-5'}}), /supported Claude model/);
  assert.throws(() => slots.save({name: 'Keyed', provider: 'claude-code', key: KEY}), /takes no API key/);
  assert.throws(() => slots.save({name: 'Old', provider: 'hermes'}), /Hermes was removed/);
  await assert.rejects(ai.complete({connectorId: slot.id, task: 'nonsense', messages, maxTokens: 4000}), /Unknown AI task/);
});

test('connection tests: the key reads model details only; the subscription asks one tiny question', async t => {
  const store = new Store(':memory:');
  t.after(() => store.close());
  const seen = [];
  const slots = new ConnectorSlots(store, protector, async url => { seen.push(String(url)); if (isClaudeModel(url)) return claudeModel(url); if (isClaudeMessages(url)) throw new Error('a key test must not generate'); throw new Error('unexpected'); });
  const fake = fakeClaudeCode(t);
  slots.ai = new Ai(slots, {claudeCode: new ClaudeCode({command: fake.command, prefix: fake.prefix})});
  const api = slots.save({name: 'Claude key', provider: 'claude', key: KEY});
  const tested = await slots.test(api.id, api.revision);
  assert.equal(tested.connector.test.status, 'passed');
  assert.match(tested.result.message, /Nothing was generated/);
  assert.deepEqual(seen.map(url => url.split('?')[0]), ['https://api.anthropic.com/v1/models/claude-opus-5-5', 'https://api.anthropic.com/v1/models/claude-opus-4-8']);
  const sub = slots.save({name: 'Claude plan', provider: 'claude-code'});
  fake.reply('OK', {model: 'claude-opus-4-8'});
  const passed = await slots.test(sub.id, sub.revision);
  assert.equal(passed.connector.test.status, 'passed');
  // 0.73: every model the jobs use is asked once (main and support), not only the support model.
  assert.deepEqual(fake.calls().map(call => call.args[call.args.indexOf('--model') + 1]), ['claude-opus-5-5', 'claude-opus-4-8']);
  assert.match(passed.result.message, /Claude Opus 5\.5 and Claude Opus 4\.8/);
  assert.equal(fake.calls()[0].args[fake.calls()[0].args.indexOf('--effort') + 1], 'low');
  fake.reply('Not logged in', {error: true});
  await assert.rejects(slots.test(sub.id, passed.connector.revision), /not signed in/i);
  assert.equal(slots.list().find(item => item.id === sub.id).test.status, 'failed');
  // A job that finds the plan signed out fails without "usage unknown" and marks the connection's test as failed.
  fake.reply('OK', {model: 'claude-opus-4-8'});
  const again = await slots.test(sub.id, slots.list().find(item => item.id === sub.id).revision);
  assert.equal(again.connector.test.status, 'passed');
  let started = false;
  fake.reply('Invalid API key · Please run /login', {error: true});
  await assert.rejects(slots.ai.complete({connectorId: sub.id, task: 'script', messages: [{role: 'user', content: 'Write.'}], maxTokens: 4000, onStart: () => { started = true; }}), /not signed in/);
  assert.equal(started, false, 'nothing was generated, so the job is not told its usage is unknown');
  assert.equal(slots.list().find(item => item.id === sub.id).test.status, 'failed', 'the page stops showing it as connected');
  fake.reply('Something odd happened mid-answer', {error: true});
  await assert.rejects(slots.ai.complete({connectorId: sub.id, task: 'script', messages: [{role: 'user', content: 'Write.'}], maxTokens: 4000, onStart: () => { started = true; }}), /usage may still count/);
  assert.equal(started, true, 'a failure after generation began keeps the unknown usage');
  started = false;
  fake.reply({ok: 1});
  await slots.ai.complete({connectorId: sub.id, task: 'script', messages: [{role: 'user', content: 'Write.'}], maxTokens: 4000, onStart: () => { started = true; }});
  assert.equal(started, true);
});
