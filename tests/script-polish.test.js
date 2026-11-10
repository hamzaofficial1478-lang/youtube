'use strict';
// 0.99 (owner request 2026-11-09, point 6): reference videos in Content Studio (a link with the transcript the owner
// pastes; the program never downloads videos or captions), the polish of the owner's own script by both AIs with a
// report of what was missing, weak and changed, and a copy guard against the references' wording.
const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../writer');
const {Store} = require('../store');
const {ConnectorSlots} = require('../connectors');
const {claudeMessage, claudeFetch} = require('./fake-claude');

const words = (prefix, count) => Array.from({length: count}, (_, i) => `${prefix}${i + 1}`).join(' ');

test('transcripts are cleaned, packed for the writers and guarded against copying', () => {
  assert.equal(W.cleanTranscript('0:00\nWhy did stone age money work?\n0:04\n[1:02:07] Because everyone trusted the shells.\n2 minutes, 5 seconds\n'), 'Why did stone age money work? Because everyone trusted the shells.');
  const long = {kind: 'competitor', title: 'Long one', url: 'https://www.youtube.com/watch?v=abc', transcript: `${words('open', 6000)} ${words('end', 3000)}`};
  const [pack, small] = W.referencePack([long, {kind: 'odd', title: 'Small', url: 'https://x.example/v', transcript: 'A short transcript.'}]);
  assert.deepEqual([pack.id, pack.kind, pack.excerpt, small.id, small.kind, small.excerpt], ['R1', 'competitor', true, 'R2', 'reference', undefined]);
  assert.ok(pack.transcript.length <= 20000 + 10 && pack.transcript.startsWith('open1 ') && pack.transcript.includes(' [...] ') && pack.transcript.endsWith('end3000'), 'the opening and the ending are kept');
  const ref = {id: 'R1', transcript: 'and that is exactly why the whole village trusted the shells for a thousand years'};
  assert.deepEqual(W.copiedRuns('Our story: that is exactly why the whole village trusted the shells for ages.', [ref]), [{ref: 'R1', words: 'that is exactly why the whole village trusted the shells for'}]);
  assert.deepEqual(W.copiedRuns('Our story: that is exactly why the whole village trusted the shells for ages.', [ref], 'I wrote: that is exactly why the whole village trusted the shells for ages.'), [], 'the owner\'s own words are never called copied');
  assert.deepEqual(W.copiedRuns('the whole village trusted them', [ref]), [], 'short shared phrases are not copying');
  assert.deepEqual(W.readReport({summary: 'Tighter.', missing: ['A promise', 3], weak: 'x', changed: [{where: 'Hook', before: 'Hello', after: 'You lose', why: 'stakes'}, 'Cut the intro', null]}), {summary: 'Tighter.', missing: ['A promise'], weak: [], changed: [{where: 'Hook', before: 'Hello', after: 'You lose', why: 'stakes'}, {where: '', before: '', after: '', why: 'Cut the intro'}]});
  assert.equal(W.readReport('no'), null);
});

test('the AI team polishes the owner\'s script: polish, challenge, finish, with a report and the program\'s own checks', async () => {
  const ownHook = 'Hello and welcome to my channel about money.';
  const own = {title: 'Stone age money', hook: ownHook, script: `${ownHook} ${'Shells were money for a long time in many places. '.repeat(30)}`};
  const hook = 'You would trade a week of food for one shell, and so did 3,000 people.';
  const paragraph = n => `${'The shells moved from hand to hand across the valley and every family kept a careful count. '.repeat(14)}Part ${n} ends with a question: what happened next?`;
  const polished = {title: 'The shell that fed a village', angle: 'Follow one shell through a stone age village and show why trust made it money.', hook, script: [`${hook} ${paragraph(1)}`, paragraph(2), paragraph(3), paragraph(4), 'So the shell was never the money: trust was, and you still use it every single day when you pay for anything at all.'].join('\n\n'), claims: [], uncertainties: [],
    report: {summary: 'A real hook and a promise.', missing: ['A promise of what the viewer learns'], weak: ['The greeting wastes the first seconds'], changed: [{where: 'Hook', before: 'Hello and welcome', after: 'You would trade a week of food', why: 'Stakes in the first second'}]}};
  const review = {verdict: 'Better, but the middle drags.', keep: ['The shell'], fixes: [{where: 'Middle', problem: 'Repeats', change: 'Cut a third'}], hooks: ['a', 'b', 'c'], facts: [], additions: []};
  const references = [{id: 'R1', kind: 'competitor', title: 'Rival', url: 'https://www.youtube.com/watch?v=r1', transcript: 'In this video we look at how shells became the first money and why every family kept a careful count of them.'}];
  const input = {family: {name: 'Money History', audience: 'Curious adults', locale: 'en-US', format: 'long-form'}, content: {title: 'Stone age money', kind: 'fiction', angle: 'Follow one shell', hook: ownHook}, sources: [], references, ownScript: own, policy: {totalTokenLimit: 60000, maxCompletionTokens: 16000}};
  const usage = {promptTokens: 100, completionTokens: 50, totalTokens: 150};
  const run = async answers => {
    const calls = [];
    const ai = {complete: async ({connectorId, messages}) => { calls.push({connectorId, messages}); return {content: JSON.stringify(answers[calls.length - 1]), usage, model: 'm', provider: connectorId === 'W' ? 'claude-code' : 'chatgpt'}; }};
    return {result: await W.generateScript(ai, 'W', input, {partner: 'P'}), calls};
  };
  const {result, calls} = await run([polished, review, polished]);
  assert.match(calls[0].messages[0].content, /^Polish the owner's own YouTube script \(OWN SCRIPT/);
  assert.match(calls[0].messages[0].content, /REFERENCE VIDEOS: [\s\S]*never reuse their wording/);
  assert.match(calls[0].messages[0].content, /report \(an object: summary/);
  assert.match(calls[0].messages[1].content, /"ownScript":\{"title":"Stone age money"/);
  assert.match(calls[1].messages[0].content, /polished the owner's own script[\s\S]*is the report honest[\s\S]*reference videos \(R1/);
  assert.match(calls[2].messages[0].content, /update it to every change you make now/);
  const report = result.candidate.report;
  assert.deepEqual([report.summary, report.missing, report.changed[0].where], ['A real hook and a promise.', ['A promise of what the viewer learns'], 'Hook']);
  assert.ok(report.checks.wordsBefore > 0 && report.checks.wordsAfter > report.checks.wordsBefore, 'the program counts the words before and after');
  assert.ok(report.checks.before.length > report.checks.after.length, 'the program\'s own checks found fewer problems after the polish');
  assert.ok(report.checks.hookBefore && report.checks.hookAfter);
  assert.equal(result.candidate.review.status, 'revised');
  // The final version copies the rival's wording (eight words and more): named on the candidate and blocked.
  const copying = {...polished, script: polished.script.replace('Part 2 ends', 'Every family kept a careful count of them, as the rival said. Part 2 ends')};
  const blocked = await run([polished, review, copying]);
  assert.deepEqual(blocked.result.candidate.copied.map(run => run.ref), ['R1']);
  assert.match(blocked.result.quality.issues.join(' '), /copies the wording of a reference video: R1 "/);
  assert.equal(blocked.result.quality.passed, false);
  // The writers are told when the first pass copies, so the finished script can fix it.
  const told = await run([copying, review, polished]);
  assert.match(told.calls[1].messages[1].content, /Copies the wording of reference R1/);
  assert.equal(told.result.candidate.copied, undefined);
});

test('reference videos are kept per draft, checked, and reach the writers; a polish stays a polish when retried', async t => {
  const store = new Store(':memory:');
  t.after(() => store.close());
  const family = store.saveFamily({name: 'Everyday Explained', tier: 'A', countries: ['Pakistan'], audience: 'Curious adults seeking sourced explanations.', niche: 'Everyday systems', locales: ['en-US'], timezone: 'Asia/Karachi', monthlyBudget: 100, cadence: 2, format: 'long-form'});
  const content = store.saveContent({familyId: family.id, title: 'Why routines feel slow', kind: 'fiction', angle: 'Follow a routine and show hidden handoffs.', hook: '', script: 'My own words about routines. They feel slow because nobody owns the handoff between two people.', sources: [], rightsConfirmed: true});
  const transcript = `0:00\n${words('w', 80)}\n0:31\n${words('x', 40)}`;
  assert.throws(() => store.addScriptReference(content.id, {kind: 'competitor', url: 'ftp://example.com/v', transcript}), /Paste the video link/);
  assert.throws(() => store.addScriptReference(content.id, {kind: 'competitor', url: 'https://www.youtube.com/watch?v=a', transcript: 'Too short.'}), /Show transcript/);
  assert.throws(() => store.addScriptReference(content.id, {kind: 'enemy', url: 'https://www.youtube.com/watch?v=a', transcript}), /competitor video or a video you like/);
  const ref = store.addScriptReference(content.id, {kind: 'competitor', url: 'https://www.youtube.com/watch?v=a', title: 'Rival routines', transcript, addedBy: 'Hasnain'});
  assert.deepEqual([ref.kind, ref.title, ref.words, ref.createdBy], ['competitor', 'Rival routines', 120, 'Hasnain']);
  assert.ok(!/0:31/.test(store.scriptReferenceRows(content.id)[0].transcript), 'timestamps are gone');
  assert.equal(store.state().scriptReferences.length, 1);
  // A polish needs the owner's script; it carries the references and the script, and the job says it is a polish.
  const slots = new ConnectorSlots(store, {transform: (op, input) => Buffer.from([...input].reverse())}, claudeFetch(() => claudeMessage({})));
  const connector = slots.save({name: 'Claude', provider: 'claude', key: 'sk-ant-api03-fixture-' + 'x'.repeat(32)});
  await slots.test(connector.id, connector.revision);
  const ask = {revision: content.revision, connectorId: connector.id, connectorRevision: connector.revision};
  const job = store.queueScriptJob(content.id, {...ask, polish: true});
  const scope = JSON.parse(job.input);
  assert.match(job.type, /:polish:r[0-9a-f]{12}$/, 'a polish with these references is its own job');
  assert.equal(scope.polish, true);
  assert.deepEqual(scope.promptInput.references.map(item => [item.id, item.kind, item.title]), [['R1', 'competitor', 'Rival routines']]);
  assert.equal(scope.promptInput.ownScript.script, content.script);
  assert.equal(scope.promptInput.ownScript.hook, 'My own words about routines.', 'an empty hook takes the script\'s first sentence');
  assert.notEqual(store.queueScriptJob(content.id, ask).id, job.id, 'writing anew and polishing are different jobs');
  store.db.prepare("UPDATE jobs SET status='failed' WHERE id=?").run(job.id);
  const retried = store.retryScriptJob(job.id, ask);
  assert.equal(JSON.parse(retried.input).polish, true, 'a retried polish is still a polish');
  // Removing a reference keeps it out of the next request.
  store.removeScriptReference(content.id, ref.id);
  assert.equal(store.state().scriptReferences.length, 0);
  assert.throws(() => store.removeScriptReference(content.id, ref.id), /not found/);
  const empty = store.saveContent({familyId: family.id, title: 'Empty draft', kind: 'fiction', angle: 'An angle long enough to save the draft.', hook: '', script: '', sources: [], rightsConfirmed: true});
  assert.throws(() => store.queueScriptJob(empty.id, {...ask, revision: empty.revision, polish: true}), /Add your script first/);
});
