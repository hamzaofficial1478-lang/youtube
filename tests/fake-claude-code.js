'use strict';
// Stands in for `claude -p` in tests: logs how it was called and prints the prepared JSON reply.
const fs = require('node:fs');
// `claude --version` and `claude auth status --json` (0.74) answer at once: they read no input.
const early = process.argv.slice(2);
if (early[0] === '--version' || (early[0] === 'auth' && early[1] === 'status')) {
  fs.appendFileSync(process.env.FAKE_CLAUDE_LOG, JSON.stringify({args: early, inherited: Object.keys(process.env).filter(name => /^CLAUDE_?CODE|^ANTHROPIC/i.test(name))}) + '\n');
  const auth = process.env.FAKE_CLAUDE_AUTH || 'claude.ai';
  if (early[0] === '--version') process.stdout.write('2.1.316 (Claude Code)\n');
  else if (auth === 'old') { process.stderr.write("error: unknown command 'auth'\n"); process.exitCode = 1; }
  else process.stdout.write(JSON.stringify({loggedIn: auth !== 'none', authMethod: auth, apiProvider: 'firstParty'}));
  return;
}
// An old Claude Code that does not know a flag stops at once with a message on stderr.
if (process.env.FAKE_CLAUDE_STDERR) { process.stderr.write(`${process.env.FAKE_CLAUDE_STDERR}\n`); process.exit(1); }
let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  const args = process.argv.slice(2), at = name => args[args.indexOf(name) + 1];
  const systemFile = at('--system-prompt-file');
  fs.appendFileSync(process.env.FAKE_CLAUDE_LOG, JSON.stringify({args, cwd: process.cwd(), cwdFiles: fs.readdirSync(process.cwd()), maxOutput: process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS, apiKeyPresent: 'ANTHROPIC_API_KEY' in process.env, inherited: Object.keys(process.env).filter(name => /^CLAUDE_?CODE|^ANTHROPIC/i.test(name)), system: systemFile ? fs.readFileSync(systemFile, 'utf8') : null, stdin: input}) + '\n');
  const {delayMs, body} = JSON.parse(fs.readFileSync(process.env.FAKE_CLAUDE_REPLY, 'utf8'));
  // stream-json mode (image prompts) prints one event per line and ends with the result event.
  const stream = args.includes('stream-json');
  setTimeout(() => process.stdout.write(stream ? `${JSON.stringify({type: 'system', subtype: 'init'})}\n${JSON.stringify(body)}\n` : JSON.stringify(body)), delayMs || 0);
});
