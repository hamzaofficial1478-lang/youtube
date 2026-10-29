'use strict';
// 0.53: the ChatGPT subscription (through the Codex app) beside Claude, the AI team's roles, scripts written
// together and painted pictures. No test contacts OpenAI, Anthropic or uses either subscription.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {Ai, CodexCli} = require('../ai');
const {Store} = require('../store');
const {ConnectorSlots} = require('../connectors');
const {generateScript, readReview} = require('../writer');
const Il = require('../illustrate');
const Sk = require('../sketch');
const {fakeCodex} = require('./fake-claude');

const protector = {transform: (op, input) => Buffer.from([...input].reverse())};
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test('the ChatGPT connection runs Codex isolated: read-only, no saved settings, no stray key, cached instructions not counted', async t => {
  const fake = fakeCodex(t), codex = new CodexCli({command: fake.command, prefix: fake.prefix, home: fake.home});
  process.env.OPENAI_API_KEY = 'sk-should-not-leak';
  t.after(() => { delete process.env.OPENAI_API_KEY; });
  fake.reply({title: 'ok'}, {usage: {input_tokens: 17000, cached_input_tokens: 16000, output_tokens: 300, reasoning_output_tokens: 200}});
  const result = await codex.complete({model: 'gpt-6-sol', system: 'Return JSON only.', prompt: [{type: 'text', text: 'The data.'}, {type: 'image', source: {media_type: 'image/png', data: PNG}}], maxTokens: 4000, effort: 'high'});
  assert.equal(result.content, '{"title":"ok"}');
  assert.deepEqual(result.usage, {promptTokens: 1000, completionTokens: 500, totalTokens: 1500}, 'Codex\'s own cached instructions are not counted; thinking is');
  const [call] = fake.calls();
  for (const flag of ['exec', '--json', '--ephemeral', '--skip-git-repo-check', '--ignore-user-config']) assert.ok(call.args.includes(flag), flag);
  assert.equal(call.args[call.args.indexOf('-s') + 1], 'read-only');
  assert.equal(call.args[call.args.indexOf('-m') + 1], 'gpt-6-sol');
  assert.ok(call.args.includes('model_reasoning_effort="high"'));
  assert.deepEqual(call.images, [true], 'image blocks reach Codex as files');
  assert.match(call.stdin, /^Answer directly from what is written here[\s\S]*Return JSON only\.[\s\S]*The data\.$/);
  assert.equal(call.apiKeyPresent, false, 'the ChatGPT sign-in is used, never a stray API key');
  assert.equal(call.home, fake.home);
  assert.equal(fs.existsSync(call.cwd), false, 'the working folder is removed afterwards');
  // Without a chosen model Codex uses its own default.
  fake.reply('OK');
  await codex.complete({model: null, system: '', prompt: 'x', maxTokens: 400, effort: 'low'});
  assert.equal(fake.calls()[1].args.includes('-m'), false);
  // Failures are named plainly and never retried.
  fake.reply('', {fail: 'Not logged in. Run codex login.'});
  await assert.rejects(codex.complete({model: null, prompt: 'x', maxTokens: 400}), /not signed in/);
  fake.reply('', {fail: 'You have hit your usage limit.'});
  await assert.rejects(codex.complete({model: null, prompt: 'x', maxTokens: 400}), /usage limit/);
  fake.reply('   ');
  await assert.rejects(codex.complete({model: null, prompt: 'x', maxTokens: 400}), /ChatGPT returned an empty answer/);
  // Outside text may tell the model to read a file: any tool use throws the whole answer away.
  for (const tool of ['command_execution', 'file_change', 'mcp_tool_call', 'web_search']) {
    fake.reply('{"title":"the file said ..."}', {tool});
    await assert.rejects(codex.complete({model: null, prompt: 'x', maxTokens: 400}), /tried to run a command, read a file or browse/, tool);
  }
  assert.equal(fake.calls().length, 9, 'one call per request');
  await assert.rejects(new CodexCli({command: null}).complete({prompt: 'x', maxTokens: 400}), /not found/);
});

test('ChatGPT paints a picture: the newest image of the request is copied out; no image is a named failure', async t => {
  const fake = fakeCodex(t), codex = new CodexCli({command: fake.command, prefix: fake.prefix, home: fake.home});
  const out = path.join(fake.home, '..', 'out', 'picture.png');
  fake.reply('DONE', {image: PNG});
  const made = await codex.image({prompt: 'A harbour at dawn.', outFile: out, model: null});
  assert.deepEqual(fs.readFileSync(out), Buffer.from(PNG, 'base64'));
  assert.equal(made.file, out);
  assert.match(fake.calls()[0].stdin, /Generate exactly one image[\s\S]*A harbour at dawn\./);
  // The text-answer guard never blocks a picture: Codex keeps its image tool.
  fs.rmSync(path.join(fake.home, 'generated_images'), {recursive: true, force: true});
  fake.reply('DONE', {image: PNG, tool: 'mcp_tool_call'});
  assert.equal((await codex.image({prompt: 'A harbour at dusk.', outFile: out, model: null})).file, out);
  fs.rmSync(path.join(fake.home, 'generated_images'), {recursive: true, force: true});
  fake.reply('I cannot draw that.');
  await assert.rejects(codex.image({prompt: 'x', outFile: out}), /made no picture/);
});

test('the AI team: one AI alone does everything; with both, ChatGPT paints, the two write scripts together and the owner can change the roles', async t => {
  const store = new Store(':memory:');
  t.after(() => store.close());
  const slots = new ConnectorSlots(store, protector, async () => { throw new Error('no network'); });
  const fake = fakeCodex(t);
  slots.ai = new Ai(slots, {claudeCode: {complete: async () => ({content: 'OK', usage: {promptTokens: 1, completionTokens: 1, totalTokens: 2}, model: 'claude-opus-4-8'})}, codex: new CodexCli({command: fake.command, prefix: fake.prefix, home: fake.home})});
  const ai = slots.ai;
  assert.throws(() => slots.save({name: 'GPT', provider: 'chatgpt', key: 'sk-test-0000000000000000'}), /takes no API key/);
  assert.throws(() => slots.save({name: 'GPT', provider: 'chatgpt', models: {main: 'GPT 6 <b>'}}), /GPT model name/);
  const gpt = slots.save({name: 'My ChatGPT', provider: 'chatgpt', models: {main: 'gpt-6-sol'}});
  assert.deepEqual(gpt.models, {main: 'gpt-6-sol'});
  assert.equal(ai.model(gpt, 'scenes').model, 'gpt-6-sol', 'a ChatGPT connection uses its one GPT model for every task');
  assert.equal(ai.team().chatgpt, null, 'an untested connection is not on the team');
  fake.reply('OK');
  const tested = await slots.test(gpt.id, gpt.revision);
  assert.equal(tested.connector.test.status, 'passed');
  assert.match(tested.result.message, /ChatGPT plan \(gpt-6-sol\)/);
  let team = ai.team();
  assert.deepEqual([team.pictures.id, team.painted, team.scripts.together, team.scripts.writer.id], [gpt.id, true, false, gpt.id], 'ChatGPT alone does everything');
  assert.equal(ai.partnerFor(gpt.id), null);
  const claude = slots.save({name: 'My Claude', provider: 'claude-code'});
  await slots.test(claude.id, claude.revision);
  team = ai.team();
  assert.deepEqual([team.pictures.id, team.painted, team.scripts.together, team.scripts.writer.id, team.scripts.partner.id], [gpt.id, true, true, claude.id, gpt.id], 'both: ChatGPT paints, Claude writes and ChatGPT reviews');
  assert.equal(ai.partnerFor(claude.id).connectorId, gpt.id);
  assert.equal(ai.partnerFor(gpt.id).connectorId, claude.id, 'whoever writes, the other one reviews');
  // The owner's roles.
  assert.throws(() => slots.saveAiRoles({revision: 0, pictures: 'dall-e', scripts: 'together', scriptWriter: 'claude'}), /who paints pictures/);
  const roles = slots.saveAiRoles({revision: 0, pictures: 'claude', scripts: 'together', scriptWriter: 'chatgpt'});
  assert.equal(roles.revision, 1);
  assert.throws(() => slots.saveAiRoles({revision: 0, pictures: 'claude', scripts: 'alone', scriptWriter: 'claude'}), /another tab/);
  team = ai.team();
  assert.deepEqual([team.pictures.id, team.painted, team.scripts.writer.id, team.scripts.partner.id], [claude.id, false, gpt.id, claude.id]);
  slots.saveAiRoles({revision: 1, pictures: 'chatgpt', scripts: 'alone', scriptWriter: 'claude'});
  assert.equal(ai.team().scripts.together, false);
  assert.equal(ai.partnerFor(claude.id), null, 'scripts written alone have no partner');
  // Claude alone also does everything (pictures as line drawings).
  slots.remove(gpt.id, tested.connector.revision);
  assert.deepEqual([ai.team().pictures.id, ai.team().painted, ai.team().scripts.writer.id], [claude.id, false, claude.id]);
  await assert.rejects(ai.image({connectorId: claude.id, prompt: 'x', outFile: path.join(os.tmpdir(), 'never.png')}), /need a ChatGPT connection/);
});

test('scripts written together: one drafts, the other reviews, the first revises; a failed review or revision never loses the draft', async () => {
  const hook = 'Why did a whole empire trust a stranger\'s promise?';
  const draft = {title: 'The promise that built an empire', angle: 'Follow one merchant\'s promise across three cities.', hook, script: `${hook} ${'A careful story about trust and trade unfolds in many small steps. '.repeat(40)}`, claims: [], uncertainties: []};
  const revised = {...draft, hook: 'One stranger\'s promise moved more gold than an army?', script: `One stranger's promise moved more gold than an army? ${'The revised story keeps every promise it makes to the viewer. '.repeat(40)}`};
  const review = {verdict: 'Strong idea, slow start.', keep: ['The merchant'], fixes: [{where: 'Opening', problem: 'Too general', change: 'Start on the gold'}], hooks: ['One stranger\'s promise moved more gold than an army?', 'b', 'c'], facts: [], additions: []};
  const input = {family: {name: 'Money History', audience: 'Curious adults', locale: 'en-US', format: 'long-form'}, content: {title: 'Trust', kind: 'fiction', angle: 'Follow one merchant', hook: 'Why trust?'}, sources: [], policy: {totalTokenLimit: 12000, maxCompletionTokens: 4000}};
  const usage = {promptTokens: 100, completionTokens: 50, totalTokens: 150};
  const run = async answers => {
    const calls = [];
    const ai = {complete: async ({connectorId, messages}) => { calls.push({connectorId, messages}); const answer = answers[calls.length - 1]; if (answer instanceof Error) throw answer; return {content: typeof answer === 'string' ? answer : JSON.stringify(answer), usage, model: connectorId === 'W' ? 'claude-opus-5-5' : 'gpt-6-sol', provider: connectorId === 'W' ? 'claude-code' : 'chatgpt'}; }};
    return {result: await generateScript(ai, 'W', input, {partner: 'P'}), calls};
  };
  const {result, calls} = await run([draft, review, revised]);
  assert.deepEqual(calls.map(call => call.connectorId), ['W', 'P', 'W']);
  assert.match(calls[1].messages[0].content, /second writer[\s\S]*first 15 seconds/);
  assert.match(calls[1].messages[1].content, /DRAFT:\n\{"title":"The promise that built an empire"/);
  assert.match(calls[2].messages[1].content, /YOUR DRAFT:[\s\S]*REVIEW:\n\{"verdict":"Strong idea, slow start\."/);
  assert.equal(result.candidate.hook, revised.hook);
  assert.deepEqual([result.candidate.review.status, result.candidate.review.by, result.candidate.review.writer], ['revised', 'chatgpt', 'claude-code']);
  assert.deepEqual(result.candidate.review.fixes, ['Opening - Too general - Start on the gold']);
  assert.deepEqual(result.usage, {promptTokens: 300, completionTokens: 150, totalTokens: 450, model: 'claude-opus-5-5 + gpt-6-sol', provider: 'claude-code+chatgpt'});
  // The partner gives nothing usable: the draft stands, with the reason.
  const lost = await run([draft, 'I liked it!']);
  assert.equal(lost.calls.length, 2);
  assert.equal(lost.result.candidate.hook, hook);
  assert.equal(lost.result.candidate.review.status, 'partner_failed');
  // A revision that breaks the rules keeps the checked draft, the review beside it.
  const broken = await run([draft, review, {...revised, script: 'Too short.'}]);
  assert.equal(broken.result.candidate.hook, hook);
  assert.equal(broken.result.candidate.review.status, 'revision_failed');
  // Alone: one call, no review.
  const alone = await generateScript({complete: async () => ({content: JSON.stringify(draft), usage, model: 'gpt-6-sol', provider: 'chatgpt'})}, 'W', input);
  assert.equal(alone.candidate.review, undefined);
  assert.equal(readReview(['not', 'an', 'object']), null);
  assert.equal(readReview({keep: ['only praise']}), null, 'a review with no verdict, fix or hook is no review');
});

test('painted pictures: the prompt paints a place without people or words, the drawing keeps the checked image name', () => {
  const backdrop = Il.paintPrompt({describe: 'A Roman camp at night by a river', words: 'Marcus wrote three lines.', engine: 'stickman', look: 'storybook', backdrop: true, world: {place: 'the Danube frontier', era: 'ancient'}});
  assert.match(backdrop, /wide 16:9 landscape background illustration[\s\S]*A Roman camp at night by a river[\s\S]*Marcus wrote three lines[\s\S]*Danube frontier \(ancient era\)[\s\S]*no people[\s\S]*no text[\s\S]*lower middle third simple[\s\S]*Stickman · storybook/);
  // 0.56 (owner review): every picture is made in its engine's look; a stick-figure world is never painted like a photo.
  const stick = Il.paintPrompt({describe: 'A Roman camp at night by a river', engine: 'stickman', look: 'classic', backdrop: true, reference: true, findings: ['The tents look photographic.']});
  assert.match(stick, /flat 2D cartoon in the same drawing language as stick figures[\s\S]*Never: photographic detail[\s\S]*style reference: match its medium[\s\S]*The tents look photographic\. Fix that\./);
  const photo = Il.paintPrompt({describe: 'A container port at dawn', engine: 'motion', design: 'footage'});
  assert.match(photo, /^A photograph[\s\S]*editorial documentary photograph[\s\S]*Never: cartoons, illustrations/);
  assert.match(Il.paintPrompt({describe: 'A crowd of workers', engine: 'motion', design: 'collage'}), /^A photographic cut-out[\s\S]*white sticker edge/);
  assert.match(Il.paintPrompt({describe: 'A castle', engine: 'stickman', look: 'classic', film: 'sepia', filmName: '19th-century photograph'}), /prints every frame as 19th-century photograph \(umber and cream\)/);
  assert.match(Il.paintPrompt({describe: 'A coin', backdrop: true, vertical: true}), /tall 9:16 portrait/);
  const card = Il.paintPrompt({describe: 'A gold coin with a lion', engine: 'motion', design: 'infographic', aspect: 1.3});
  assert.match(card, /One clear subject[\s\S]*Aspect about 1\.3:1/);
  assert.notEqual(Il.paintPrompt({describe: 'x', engine: 'handdrawn'}), Il.paintPrompt({describe: 'x', look: 'doodle'}), 'each look paints in its own style');
  const sha = 'a'.repeat(64);
  const sketch = Sk.validate({engine: 'stickman', elements: [{kind: 'picture', describe: 'A Roman camp at night by a river', backdrop: true, image: sha}, {kind: 'picture', describe: 'A coin with a lion on it', image: '../../etc/passwd'}]}, {primary: 'stickman', lenient: true});
  assert.deepEqual([sketch.elements[0].image, sketch.elements[0].backdrop], [sha, true]);
  assert.equal(sketch.elements[1].image, undefined, 'only a SHA-256 names an image file');
  assert.deepEqual(Sk.validate(sketch, {primary: 'stickman', lenient: true}), sketch, 'checking a checked drawing again gives the same drawing');
  assert.match(Sk.promptGuide('stickman', {pictures: true, painted: true}), /PAINTED PICTURES: ChatGPT paints/);
  assert.doesNotMatch(Sk.promptGuide('stickman', {pictures: true}), /PAINTED PICTURES/);
});

test('visual rules (0.56): every look of every engine has its own rules, planners and checks read them', () => {
  const Dna = require('../visual-dna');
  for (const look of Sk.STICK_LOOKS) assert.ok(Dna.DNA[Dna.key({engine: 'stickman', look})] && Dna.key({engine: 'stickman', look}) === `stickman/${look}`, look);
  for (const board of Sk.BOARDS) assert.equal(Dna.key({engine: 'handdrawn', board}), `handdrawn/${board}`);
  for (const design of Sk.DESIGNS) assert.equal(Dna.key({engine: 'motion', design}), `documentary/${design}`);
  assert.equal(Dna.key({engine: 'montage'}), 'documentary/footage');
  assert.equal(Dna.key({engine: 'stickman', look: 'chronicle'}), 'documentary/cartoon', 'the history cartoon moved to the Documentary engine');
  assert.equal(Dna.of({engine: 'stickman'}).pictures, 'drawn');
  assert.equal(Dna.of({engine: 'motion', design: 'footage'}).pictures, 'photo');
  assert.ok(Object.values(Dna.DNA).every(rules => ['name', 'pictures', 'medium', 'places', 'objects', 'people', 'motion', 'never'].every(field => typeof rules[field] === 'string' && rules[field].length > 3)));
  assert.match(Dna.plannerLines(['stickman/classic', 'stickman/classic'])[0], /^VISUAL RULES \(Stickman · classic cartoon\): pictures are drawn in this look, never photo-real/);
  assert.equal(Dna.plannerLines(['stickman/classic', 'stickman/classic', 'nothing']).length, 1);
  const check = Dna.checkMessages({rules: Dna.of({engine: 'stickman'}), describe: 'A camp', backdrop: true, image: {mediaType: 'image/png', data: 'AAAA'}});
  assert.equal(check[1].content[0].type, 'image');
  assert.deepEqual(Dna.readCheck('{"fits": false, "problems": ["Looks like a photo."]}'), {fits: false, problems: ['Looks like a photo.']});
  assert.equal(Dna.readCheck('Looks great!').fits, false, 'no readable verdict is no pass');
  assert.equal(Dna.summary().length, Object.keys(Dna.DNA).length + 1, 'every look, and natural for any look');
});

test('a Claude model per kind of job (owner request 2026-10-22: stronger models use more tokens)', t => {
  const store = new Store(':memory:');
  t.after(() => store.close());
  const slots = new ConnectorSlots(store, protector, async () => { throw new Error('no network'); });
  const ai = new Ai(slots, {claudeCode: {complete: async () => ({content: 'OK'})}});
  const claude = slots.save({name: 'My Claude', provider: 'claude-code'});
  assert.equal(ai.model(claude, 'scenes').model, 'claude-opus-5-5', 'the connection default first');
  const roles = slots.saveAiRoles({revision: 0, pictures: 'chatgpt', scripts: 'together', scriptWriter: 'claude', models: {planning: 'claude-sonnet-5-5', research: 'claude-opus-5-5', editing: ''}});
  assert.deepEqual(roles.models, {planning: 'claude-sonnet-5-5', research: 'claude-opus-5-5'});
  assert.deepEqual(['scenes', 'review', 'frames', 'research', 'competitors', 'script', 'editing'].map(task => ai.model(claude, task).model), ['claude-sonnet-5-5', 'claude-sonnet-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5', 'claude-opus-5-5', 'claude-opus-5-5', 'claude-opus-5-5']);
  assert.throws(() => slots.saveAiRoles({revision: 1, pictures: 'chatgpt', scripts: 'together', scriptWriter: 'claude', models: {planning: 'gpt-6-sol'}}), /supported Claude model/);
  assert.throws(() => slots.saveAiRoles({revision: 1, pictures: 'chatgpt', scripts: 'together', scriptWriter: 'claude', models: {everything: 'claude-opus-5-5'}}), /listed kinds of job/);
  const gpt = slots.save({name: 'My ChatGPT', provider: 'chatgpt', models: {main: 'gpt-6-sol'}});
  assert.equal(ai.model(gpt, 'scenes').model, 'gpt-6-sol', 'ChatGPT jobs keep the GPT model of their connection');
});
