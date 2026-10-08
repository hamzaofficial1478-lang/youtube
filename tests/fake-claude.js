'use strict';
// Test doubles for the two Claude connections. No test ever contacts Anthropic or uses the subscription.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// A Claude Messages API reply as the official SDK receives it.
function claudeMessage(text, usage = {input_tokens: 120, output_tokens: 80}, extra = {}) {
  const body = {id: 'msg_test', type: 'message', role: 'assistant', model: extra.model || 'claude-opus-5-5', content: [{type: 'text', text: typeof text === 'string' ? text : JSON.stringify(text)}], stop_reason: extra.stop || 'end_turn', ...(usage ? {usage} : {})};
  return new Response(JSON.stringify(body), {status: 200, headers: {'content-type': 'application/json'}});
}
// The same answer as a server-sent event stream (requests above 16,000 output tokens are streamed).
function claudeStream(text, usage = {input_tokens: 120, output_tokens: 80}, extra = {}) {
  const {output_tokens: output, ...input} = usage;
  const events = [
    ['message_start', {type: 'message_start', message: {id: 'msg_test', type: 'message', role: 'assistant', model: extra.model || 'claude-opus-5-5', content: [], stop_reason: null, usage: {...input, output_tokens: 1}}}],
    ['content_block_start', {type: 'content_block_start', index: 0, content_block: {type: 'text', text: ''}}],
    ['content_block_delta', {type: 'content_block_delta', index: 0, delta: {type: 'text_delta', text: typeof text === 'string' ? text : JSON.stringify(text)}}],
    ['content_block_stop', {type: 'content_block_stop', index: 0}],
    ['message_delta', {type: 'message_delta', delta: {stop_reason: extra.stop || 'end_turn'}, usage: {output_tokens: output}}],
    ['message_stop', {type: 'message_stop'}],
  ];
  return new Response(events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join(''), {status: 200, headers: {'content-type': 'text/event-stream'}});
}
const isClaudeMessages = url => String(url) === 'https://api.anthropic.com/v1/messages' || String(url).startsWith('https://api.anthropic.com/v1/messages?');
const isClaudeModel = url => String(url).startsWith('https://api.anthropic.com/v1/models/');
const claudeModel = url => new Response(JSON.stringify({id: String(url).split('/').pop().split('?')[0], type: 'model', display_name: 'Claude'}), {status: 200, headers: {'content-type': 'application/json'}});

// A fetch that answers like the Claude API: model checks pass; each Messages call goes to reply(body, n).
function claudeFetch(reply, calls = []) {
  return async (url, init = {}) => {
    if (isClaudeModel(url)) return claudeModel(url);
    if (isClaudeMessages(url)) { const body = JSON.parse(init.body); calls.push({url: String(url), body, headers: init.headers}); return reply(body, calls.length); }
    throw new Error(`Unexpected request to ${url}`);
  };
}
// The text of the user turn Claude received (the untrusted data pack the room sent).
const promptOf = body => body.messages.map(message => (typeof message.content === 'string' ? message.content : message.content.map(part => part.text || '').join(''))).join('\n');

// A fake Claude Code app: node runs fake-claude-code.js, which prints the reply file and logs its call.
function fakeClaudeCode(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-claude-code-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const replyFile = path.join(dir, 'reply.json'), logFile = path.join(dir, 'calls.jsonl');
  const reply = (result, {usage = {input_tokens: 150, output_tokens: 90}, error = false, stop = 'end_turn', model = 'claude-opus-5-5', delayMs = 0} = {}) => fs.writeFileSync(replyFile, JSON.stringify({delayMs, body: {type: 'result', subtype: 'success', is_error: error, stop_reason: stop, result: typeof result === 'string' ? result : JSON.stringify(result), usage, modelUsage: {[model]: {}}}}));
  process.env.FAKE_CLAUDE_REPLY = replyFile;
  process.env.FAKE_CLAUDE_LOG = logFile;
  t.after(() => { delete process.env.FAKE_CLAUDE_REPLY; delete process.env.FAKE_CLAUDE_LOG; });
  const calls = () => (fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : []);
  return {command: process.execPath, prefix: [path.join(__dirname, 'fake-claude-code.js')], reply, calls};
}

module.exports = {claudeMessage, claudeStream, isClaudeMessages, isClaudeModel, claudeModel, claudeFetch, promptOf, fakeClaudeCode};
