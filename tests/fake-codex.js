'use strict';
// Stands in for `codex exec --json` in tests: logs how it was called and prints the prepared event stream.
// An image reply also writes a PNG where Codex keeps generated images (CODEX_HOME/generated_images/<thread>).
const fs = require('node:fs');
const path = require('node:path');
let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  const args = process.argv.slice(2), at = name => args[args.indexOf(name) + 1];
  fs.appendFileSync(process.env.FAKE_CODEX_LOG, JSON.stringify({args, cwd: process.cwd(), home: process.env.CODEX_HOME, apiKeyPresent: 'OPENAI_API_KEY' in process.env || 'CODEX_API_KEY' in process.env, images: args.filter((arg, k) => args[k - 1] === '-i').map(file => fs.existsSync(file)), stdin: input}) + '\n');
  const {answer = '', usage = {input_tokens: 17000, cached_input_tokens: 16000, output_tokens: 40, reasoning_output_tokens: 10}, fail = null, image = null, tool = null} = JSON.parse(fs.readFileSync(process.env.FAKE_CODEX_REPLY, 'utf8'));
  const thread = 'thread-test-1', events = [{type: 'thread.started', thread_id: thread}, {type: 'turn.started'}];
  // A tool the model chose to use (for example a command that reads a file), before its answer.
  if (tool) events.push({type: 'item.started', item: {id: 'item_t', type: tool, command: 'type secrets.txt'}}, {type: 'item.completed', item: {id: 'item_t', type: tool, command: 'type secrets.txt'}});
  if (fail) events.push({type: 'turn.failed', error: {message: fail}});
  else {
    if (image) { const dir = path.join(process.env.CODEX_HOME, 'generated_images', thread); fs.mkdirSync(dir, {recursive: true}); fs.writeFileSync(path.join(dir, 'exec-1.png'), Buffer.from(image, 'base64')); }
    events.push({type: 'item.completed', item: {id: 'item_0', type: 'agent_message', text: answer}}, {type: 'turn.completed', usage});
    if (args.includes('-o')) fs.writeFileSync(at('-o'), answer);
  }
  process.stdout.write(events.map(event => JSON.stringify(event)).join('\n') + '\n');
});
