'use strict';
// Stands in for `claude -p` in tests: logs how it was called and prints the prepared JSON reply.
const fs = require('node:fs');
let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  const args = process.argv.slice(2), at = name => args[args.indexOf(name) + 1];
  const systemFile = at('--system-prompt-file');
  fs.appendFileSync(process.env.FAKE_CLAUDE_LOG, JSON.stringify({args, cwd: process.cwd(), cwdFiles: fs.readdirSync(process.cwd()), maxOutput: process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS, apiKeyPresent: 'ANTHROPIC_API_KEY' in process.env, system: systemFile ? fs.readFileSync(systemFile, 'utf8') : null, stdin: input}) + '\n');
  const {delayMs, body} = JSON.parse(fs.readFileSync(process.env.FAKE_CLAUDE_REPLY, 'utf8'));
  // stream-json mode (image prompts) prints one event per line and ends with the result event.
  const stream = args.includes('stream-json');
  setTimeout(() => process.stdout.write(stream ? `${JSON.stringify({type: 'system', subtype: 'init'})}\n${JSON.stringify(body)}\n` : JSON.stringify(body)), delayMs || 0);
});
