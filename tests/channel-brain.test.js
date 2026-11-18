'use strict';
// 0.110 (owner request 2026-11-18): the channel brain. The owner's niche brief, files, reference pictures (a recurring
// character) and their idea for one video reach the writer, the storyboard, the paintings and the editor; the creative
// director answers any question (Claude, ChatGPT or both), writes a playbook that, approved by name, leads the channel's
// jobs as pinned skills, and remembers what the owner keeps; Gemini matches a video link's style to an engine.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const C = require('../creative');
const Sk = require('../sketch');
const Il = require('../illustrate');
const {scriptMessages, critiqueMessages} = require('../writer');
const {Store} = require('../store');
const {ConnectorSlots} = require('../connectors');
const {QuotaLedger} = require('../intel-sources');
const {SkillsEngine, validateSkill} = require('../skills');
const {ChannelBrain} = require('../channel-brain');

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const KEY = 'AIzaFAKEgeminiKEY0123456789abcdefghijk';
const protector = {transform: (operation, input) => Buffer.from([...input].reverse())};
const family = (store, name, niche) => store.saveFamily({name, tier: 'A', countries: ['United States'], audience: 'Adults who like true survival stories told minute by minute.', niche, locales: ['en-US'], timezone: 'Asia/Karachi', monthlyBudget: 50, cadence: 2, format: 'long-form', monthlyTokenLimit: 900000, scriptTokenLimit: 8000, researchTokenLimit: 8000, competitors: ['https://www.youtube.com/@SurviveDaily']});
const ENGINES = C.catalogue({looks: ['classic', 'whiteboard'], boards: ['cartoon', 'marker'], designs: ['cartoon', 'painted'], finishes: ['motion', 'anime']});

function setup(t, {answer = () => ({}), fetchImpl = null} = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-'));
  const store = new Store(':memory:');
  t.after(() => { store.close(); fs.rmSync(dir, {recursive: true, force: true}); });
  const connectors = new ConnectorSlots(store, protector, fetchImpl || fetch), quota = new QuotaLedger(store);
  const skills = new SkillsEngine(store, {root: path.join(__dirname, '..'), builtinApproved: false}).attach();
  const calls = [];
  const ai = {team: () => ({claude: {id: 'claude-slot', provider: 'claude'}, chatgpt: {id: 'gpt-slot', provider: 'chatgpt'}}),
    complete: async request => { calls.push(request); return {content: JSON.stringify(answer(request, calls.length)), usage: {promptTokens: 3000, completionTokens: 1000, totalTokens: 4000}}; }};
  const survival = family(store, 'Survival Minutes', 'Survival stories in hard places');
  const other = family(store, 'Other channel', 'Gardening');
  const brain = new ChannelBrain(store, {connectors, quota, ai, skills, imageDir: path.join(dir, 'brain-images'), fetch: fetchImpl || fetch, catalogue: {looks: ['classic', 'whiteboard'], boards: ['cartoon', 'marker'], designs: ['cartoon', 'painted'], finishes: ['motion', 'anime']}});
  store.brainProvider = (familyId, contentId, bytes) => brain.context(familyId, {contentId, bytes});
  store.brainReferenceFiles = ids => brain.referenceFiles(ids);
  return {store, connectors, quota, skills, brain, calls, survival, other, dir};
}

test('creative.js: the brief is checked, the context fits its budget, the playbook becomes valid pin-only skills', () => {
  assert.throws(() => C.validateBrief({}), /at least what the niche is about/);
  assert.throws(() => C.validateBrief({about: 'x'.repeat(3001)}), /About is longer than 3000/);
  const brief = C.validateBrief({about: 'One survivor, one hard place, one clock.', titles: 'Six Survivors. One Damaged Raft. No Land in Sight\n\nFifteen Days From Safety. Five Days of Food.'});
  assert.equal(brief.titles.length, 2);
  // Big files share what is left of the budget; the brief and the references always come first.
  const context = C.context({brief, files: [{name: 'a.txt', text: 'a '.repeat(20000)}, {name: 'b.txt', text: 'b '.repeat(20000)}], images: [{id: 'x', label: 'Survivor', role: 'character', usage: 'The hero of every video', description: 'Rust shirt, satchel'}], idea: {files: [{name: 'idea.txt', text: 'raft '.repeat(5000)}]}}, {bytes: 9000});
  assert.ok(Buffer.byteLength(JSON.stringify(context)) <= 9400, `${Buffer.byteLength(JSON.stringify(context))} bytes`);
  assert.equal(context.references[0].description, 'Rust shirt, satchel');
  assert.ok(context.idea.files[0].text.endsWith('[the rest of the file is left out]'), 'the video\'s idea file is packed first');
  assert.equal(C.context({}), null);
  // The playbook: read leniently, refused without rules, one skill per process with signature lines.
  assert.throws(() => C.readPlaybook({summary: 'x'}), /without a summary or rules/);
  const playbook = C.readPlaybook({summary: 'Real survival, minute by minute, with one recurring survivor.', signature: {character: 'The same survivor in a rust shirt', editing: 'A countdown clock on every turn'}, rules: {script: ['Open on the clock: days left, food left.'], editing: ['A hard cut to black before each turn.'], dance: ['x']}, avoid: ['Zombies', 'Stick figures'], series: [{title: 'Trapped', premise: 'One place, one week'}]});
  assert.deepEqual(Object.keys(playbook.rules), ['script', 'editing']);
  const skills = C.playbookSkills(playbook, {familyId: '1a2b3c4d-0000-4000-8000-000000000000', familyName: 'Survival Minutes', revision: 1, approvedBy: 'Hasnain', date: '2026-11-18'});
  assert.deepEqual(skills.map(skill => skill.id), ['playbook.f1a2b3c4d-script', 'playbook.f1a2b3c4d-editing']);
  for (const skill of skills) assert.equal(validateSkill(skill).id, skill.id);
  assert.ok(skills[0].do[0].startsWith('Signature (character)') && skills[0].avoid.includes('Zombies') && skills.every(skill => skill.pinOnly && skill.priority === 96));
  // The style match only names engines the program has.
  assert.throws(() => C.readStyleMatch('{"engine": "veo"}', ENGINES), /engine the program does not have/);
  const match = C.readStyleMatch('Sure: {"engine": "ffmpeg-montage", "look": "painted", "pictureType": "natural", "paint": "all", "confidence": 0.8, "why": ["painted scenes"], "aiVideo": {"fits": true, "why": "realistic motion"}}', ENGINES);
  assert.deepEqual([match.engine, match.engineName, match.look, match.paint, match.aiVideo.fits], ['ffmpeg-montage', 'Documentary', 'painted', 'all', true]);
  assert.equal(C.readStyleMatch('{"engine": "atelier", "look": "nope"}', ENGINES).look, 'motion', 'an unknown look falls back to the engine\'s first');
});

test('the brain keeps the brief, files and reference pictures; the picture is described once and reaches every job', async t => {
  const {store, brain, calls, survival, other} = setup(t, {answer: () => ({description: 'A man in his thirties, short dark hair, stubble, rust-red shirt, brown satchel across the chest.'})});
  assert.throws(() => brain.saveBrief(survival.id, {updatedBy: 'Hasnain'}), /at least what the niche is about/);
  const brief = brain.saveBrief(survival.id, {updatedBy: 'Hasnain', about: 'Real survival situations told minute by minute.', difference: 'Competitors use stick figures and zombies; we use one realistic recurring survivor and real places.', titles: ['Trapped in Alaska for 30 Days. Your Food Will Last Ten.']});
  assert.equal(brief.revision, 1);
  assert.equal(brain.saveBrief(survival.id, {...brief, updatedBy: 'Hasnain'}).revision, 2);
  // Files: text read on this PC; a video's idea files stay with that video.
  const draft = store.saveContent({familyId: survival.id, title: 'Six Survivors. One Damaged Raft.', kind: 'fiction', angle: '', hook: '', idea: 'Six people, one raft, no land. The water runs out on day four; the sail is the turn.', script: '', sources: [], rightsConfirmed: false});
  assert.equal(draft.idea.slice(0, 10), 'Six people');
  await assert.rejects(brain.addFile({familyId: survival.id, addedBy: 'Hasnain', name: 'empty.txt', data: ''}), /PDF, Word/);
  const file = await brain.addFile({familyId: survival.id, addedBy: 'Hasnain', name: 'niche.txt', data: Buffer.from('Every video: one survivor, a countdown of days and food, a real place.').toString('base64')});
  assert.equal(file.words, 13);
  await brain.addFile({familyId: survival.id, contentId: draft.id, addedBy: 'Hasnain', name: 'raft-idea.txt', data: Buffer.from('The raft leaks from the left float on day two.').toString('base64')});
  await assert.rejects(brain.addFile({familyId: other.id, contentId: draft.id, addedBy: 'Hasnain', name: 'x.txt', data: Buffer.from('words here').toString('base64')}), /another channel/);
  // A reference picture: checked by its bytes, kept once by its checksum, described by the chosen AI.
  await assert.rejects(brain.addImage({familyId: survival.id, addedBy: 'Hasnain', label: 'Survivor', role: 'character', usage: 'The hero', image: 'data:image/png;base64,AAAA'}), /picture/);
  await assert.rejects(brain.addImage({familyId: survival.id, addedBy: 'Hasnain', label: 'Survivor', role: 'hero', usage: 'The hero', image: PNG}), /Choose what the picture is/);
  const image = await brain.addImage({familyId: survival.id, addedBy: 'Hasnain', label: 'Survivor', role: 'character', usage: 'The survivor of every video, same face and clothes.', image: PNG, describe: 'claude'});
  assert.match(image.description, /rust-red shirt/);
  assert.equal(image.describedBy, 'Claude for Hasnain');
  assert.equal(calls[0].task, 'illustrate');
  assert.equal(calls[0].messages[1].content[1].type, 'image', 'the picture itself is sent as an image block');
  assert.ok(fs.existsSync(brain.imageFile(image.id).file));
  const usage = store.db.prepare("SELECT status, total_tokens FROM intelligence_usage WHERE kind='brain_describe'").get();
  assert.deepEqual([usage.status, usage.total_tokens], ['settled', 4000], 'reserved first, settled at what was used');
  // The context of a job: the brief, the files, the picture with its description, and this video's idea files only.
  const context = brain.context(survival.id, {contentId: draft.id});
  assert.equal(context.brief.about, 'Real survival situations told minute by minute.');
  assert.deepEqual(context.references.map(item => [item.id, item.role]), [[image.id, 'character']]);
  assert.deepEqual(context.idea.files.map(item => item.name), ['raft-idea.txt']);
  assert.deepEqual(context.files.map(item => item.name), ['niche.txt']);
  assert.equal(brain.context(other.id), null, 'never another channel\'s brain');
  // The writer gets the idea and the brain, and the second writer judges the draft against both.
  const {scope} = store.scriptJobScope(store.content(draft.id), store.family(survival.id), {connectorId: 'x', connectorRevision: 1});
  assert.equal(scope.promptInput.content.idea, draft.idea);
  assert.equal(scope.promptInput.channel.references[0].id, image.id);
  const [system] = scriptMessages(scope.promptInput);
  assert.match(system.content, /CHANNEL BRAIN/);
  assert.match(system.content, /OWNER IDEA .*never replace it with a different idea/);
  const [review] = critiqueMessages(scope.promptInput, {title: 'x', hook: 'x', script: 'x'});
  assert.match(review.content, /flag every point of it the draft dropped/);
  // The storyboard casts the owner's character by its picture id, and the painting attaches the picture.
  assert.deepEqual(Sk.validateCast([{id: 'hero', name: 'Sam', ref: image.id}, {id: 'x2', name: 'Other', ref: 'not-an-id'}], {lenient: true}).map(member => member.ref), [image.id, undefined]);
  const [owned] = brain.referenceFiles([image.id, image.id, '00000000-0000-4000-8000-000000000000']);
  assert.equal(brain.referenceFiles([image.id]).length, 1);
  assert.match(owned.file, /\.png$/);
  const prompt = Il.paintPrompt({describe: 'A man bails water from a leaking raft', type: 'natural', look: 'classic', people: [{name: 'Sam', role: 'survivor'}], owned: [{name: 'Sam', label: 'Survivor', description: owned.description}]});
  assert.match(prompt, /the channel owner's own reference "Survivor" \(Sam: A man in his thirties/);
  // Removing keeps nothing in the context.
  brain.removeImage(image.id, {removedBy: 'Hasnain'});
  assert.equal(brain.context(survival.id).references, undefined);
  assert.throws(() => brain.imageFile(image.id), /not found/);
});

test('the creative director answers with both AIs (the second challenges the first), remembers what is kept, and its playbook leads the channel', async t => {
  const answer = (request, n) => (request.task === 'niche' && /PLAYBOOK/.test(request.messages[0].content)
    ? {summary: 'One survivor, real places, a clock on screen: never zombies, never stick figures.', competitorsDo: ['Stick figures', 'Zombie attacks'], whiteSpace: ['Real places'], signature: {character: 'The same survivor in a rust shirt', story: 'Days and food counted down'}, rules: {script: ['Open on the countdown of days and food.'], storyboard: ['The survivor is in every scene, the place is real.'], editing: ['A cut to black before each turn.']}, avoid: ['Zombies'], experiments: [{idea: 'Viewer-choice titles', test: 'CTR of the next three videos'}], series: [{title: 'Trapped', premise: 'One place, one week'}]}
    : {summary: n === 1 ? 'Use real places.' : 'Use real places and a visible countdown.', points: [{point: 'A countdown on screen', why: 'stakes', how: 'a clock overlay'}], titles: ['Stranded on a Glacier. Four Days of Fuel.'], keep: n === 1 ? 'Real places beat zombies.' : 'Every video shows a countdown of days and food.'});
  const {store, brain, calls, skills, survival, other} = setup(t, {answer});
  brain.saveBrief(survival.id, {updatedBy: 'Hasnain', about: 'Real survival situations.', difference: 'A realistic survivor, not stick figures.'});
  await assert.rejects(brain.ask(survival.id, {requestedBy: 'Hasnain', question: 'x'}), /Your question must be/);
  const {asks} = await brain.ask(survival.id, {requestedBy: 'Hasnain', question: 'How do we stand out from the zombie channels?', ai: 'both'});
  assert.deepEqual(asks.map(item => [item.provider, item.status]), [['claude', 'answered'], ['chatgpt', 'answered']]);
  const second = JSON.parse(calls[1].messages[1].content.replace(/^UNTRUSTED CONTROL ROOM DATA:\n/, ''));
  assert.equal(second.PARTNER_ANSWER.summary, 'Use real places.', 'ChatGPT challenges Claude\'s answer');
  assert.equal(second.CHANNEL.brief.difference, 'A realistic survivor, not stick figures.');
  assert.equal(calls[1].connectorId, 'gpt-slot');
  // Memory: what the owner keeps reaches every later job of this channel.
  brain.keep(asks[1].id, {keptBy: 'Hasnain'});
  assert.deepEqual(brain.context(survival.id).memory, ['Every video shows a countdown of days and food.']);
  brain.keep(asks[1].id, {keptBy: 'Hasnain', kept: false});
  assert.equal(brain.context(survival.id).memory, undefined);
  // The playbook: written, approved by name with three confirmations, then pinned to this channel's jobs only.
  const playbook = await brain.playbook(survival.id, {requestedBy: 'Hasnain', ai: 'claude'});
  assert.equal(playbook.status, 'ready');
  assert.throws(() => brain.reviewPlaybook(playbook.id, {decision: 'approve', reviewer: 'Hasnain', confirmations: {read: true}}), /Confirm that it keeps the channel original/);
  const approved = brain.reviewPlaybook(playbook.id, {decision: 'approve', reviewer: 'Hasnain', confirmations: {read: true, own: true, leads: true}});
  assert.equal(approved.status, 'approved');
  assert.equal(approved.review.skills.length, 3);
  const led = skills.brief('script.candidate', {familyId: survival.id});
  assert.match(led.skills[0].id, /^playbook\.f.*-script$/, 'pinned, so it leads');
  assert.ok(!skills.brief('script.candidate', {familyId: other.id}).skills.some(skill => skill.id.startsWith('playbook.f')), 'never another channel');
  assert.ok(skills.brief('scene.plan', {familyId: survival.id}).skills.some(skill => skill.id.endsWith('-storyboard')));
  assert.equal(brain.context(survival.id).playbook.summary.slice(0, 13), 'One survivor,');
  // A newer playbook without storyboard rules supersedes it and unpins that process.
  const again = await brain.playbook(survival.id, {requestedBy: 'Hasnain'});
  const payload = JSON.parse(store.db.prepare('SELECT payload FROM creative_playbooks WHERE id=?').get(again.id).payload);
  delete payload.rules.storyboard;
  store.db.prepare('UPDATE creative_playbooks SET payload=? WHERE id=?').run(JSON.stringify(payload), again.id);
  brain.reviewPlaybook(again.id, {decision: 'approve', reviewer: 'Hasnain', confirmations: {read: true, own: true, leads: true}});
  assert.equal(store.db.prepare('SELECT status FROM creative_playbooks WHERE id=?').get(playbook.id).status, 'superseded');
  assert.ok(!skills.brief('scene.plan', {familyId: survival.id}).skills.some(skill => skill.id.endsWith('-storyboard')), 'the dropped process is unpinned');
});

test('Gemini matches a video link\'s style to one of the program\'s engines, inside the hourly allowance', async t => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({url, headers: options.headers || {}, body: options.body});
    const json = data => new Response(JSON.stringify(data), {status: 200, headers: {'content-type': 'application/json'}});
    if (url.endsWith('/v1beta/models?pageSize=50')) return json({models: [{name: 'models/gemini-3.7-flash'}]});
    if (url.endsWith('/v1beta/interactions')) return json({status: 'completed', steps: [{type: 'model_output', content: [{type: 'text', text: '```json\n{"engine": "ffmpeg-montage", "look": "painted", "pictureType": "natural", "paint": "all", "confidence": 0.7, "why": ["realistic painted scenes", "one recurring man"], "aiVideo": {"fits": true, "why": "the scenes move like film"}}\n```'}]}], usage: {total_tokens: 90000}});
    throw new Error(`Unexpected request to ${url}`);
  };
  const {connectors, brain, survival} = setup(t, {fetchImpl});
  const slot = connectors.save({name: 'Gemini', provider: 'gemini', key: KEY});
  const tested = await connectors.test(slot.id, slot.revision), gemini = {id: slot.id, revision: tested.connector.revision};
  await assert.rejects(brain.matchStyle(survival.id, {requestedBy: 'Hasnain', connector: gemini, url: 'https://example.com/video'}), /YouTube video link/);
  const match = await brain.matchStyle(survival.id, {requestedBy: 'Hasnain', connector: gemini, url: 'https://www.youtube.com/watch?v=abcdefghijk'});
  assert.equal(match.status, 'done', match.error);
  assert.deepEqual([match.result.engine, match.result.look, match.result.paint, match.result.aiVideo.fits], ['ffmpeg-montage', 'painted', 'all', true]);
  const sent = requests.find(item => item.url.endsWith('/v1beta/interactions'));
  assert.equal(sent.headers['x-goog-api-key'], KEY, 'the key travels in its header only');
  assert.ok(!sent.url.includes(KEY));
  assert.match(sent.body, /youtube\.com\/watch\?v=abcdefghijk/);
  assert.equal(brain.state().families.find(item => item.familyId === survival.id).matches[0].result.engineName, 'Documentary');
});
