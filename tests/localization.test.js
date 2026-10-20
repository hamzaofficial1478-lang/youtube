'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {Store} = require('../store');
const L = require('../localize');
const {LocalizationRoom, sentencesOf} = require('../localization-room');

const script = ['In 1602, Dutch merchants sold pieces of one company to anyone. Their ships sailed for eight months.', 'By 1700, the company had 40,000 employees. It was dissolved in 1799.'].join('\n\n');
const drawings = {
  c1: {sketch: {elements: [{kind: 'text', text: 'ANYONE', style: 'poster'}, {kind: 'figure', who: 'merchant', label: 'One company'}, {kind: 'chart', title: 'Shares 1602', labels: ['Ships', 'Gold'], unit: '%'}]}},
  c2: {composition: {html: '<div>Designed</div>'}},
};
const graphics = [{id: 'g1', status: 'accepted', template: 'title-card', title: 'The first company', lines: ['you could own', '1602']}, {id: 'g2', status: 'rejected', template: 'title-card', title: 'Dropped', lines: []}];
const clips = [{id: 'c1', label: 'S1.1'}, {id: 'c2', label: 'S1.2'}];
const pkg = {titles: [{id: 't1', text: 'The first company you could own (1602)'}], chosenTitle: 't1', thumbnails: [{id: 'k1', text: 'ANYONE COULD BUY IN', accent: 'ANYONE'}], chosenThumbnail: 'k1', description: 'How shares began.', tags: ['history', 'stocks']};

test('what an edition adapts: sentences, on-screen words, the package; figures and spoken length are checked', () => {
  const visible = L.visibleTexts({drawings, graphics, clips});
  assert.deepEqual(visible.items.map(item => [item.id, item.source]), [['d:c1/elements/0/text', 'ANYONE'], ['d:c1/elements/1/label', 'One company'], ['d:c1/elements/2/title', 'Shares 1602'], ['d:c1/elements/2/labels/0', 'Ships'], ['d:c1/elements/2/labels/1', 'Gold'], ['g:g1/title', 'The first company'], ['g:g1/lines/0', 'you could own']]);
  assert.deepEqual(visible.designed, [{clipId: 'c2', label: 'S1.2'}]);
  assert.deepEqual(L.figures('By 1700, 40,000 people; 40.000 and 3,5'), ['1700', '40000', '40000', '35']);
  const sentences = sentencesOf(script, 'en-US');
  assert.deepEqual(sentences.map(item => [item.n, item.paragraph]), [[1, 0], [2, 0], [3, 1], [4, 1]]);
  const src = L.source({sentences, visible, pkg});
  assert.equal(src.package.title, pkg.titles[0].text);
  // Strict for the owner, lenient (with named repairs) for Claude.
  assert.throws(() => L.normalise({sentences: [{n: 9, text: 'x'}]}, src), /Sentence 9 is not in the source/);
  const warnings = [];
  const loose = L.normalise({sentences: [{n: 9, text: 'x'}, {n: 1, text: 'En 1602, unos mercaderes vendieron partes de una compañía a cualquiera.'}], package: {title: 'La primera empresa (1602)', thumbnail: {text: 'CUALQUIERA', accent: 'NADIE'}}}, src, {lenient: true, warn: message => warnings.push(message)});
  assert.equal(warnings.length, 2);
  assert.equal(loose.package.thumbnail.accent, '');
  const checks = L.check(loose, src);
  assert.equal(checks.passed, false);
  assert.ok(checks.issues.some(item => item.code === 'missing-sentence' && item.n === 3));
  assert.ok(checks.issues.some(item => item.code === 'designed-shot'));
  const lost = L.check(L.normalise({sentences: [{n: 1, text: 'En 1602, unos mercaderes neerlandeses vendieron partes de una compañía a cualquiera.'}, {n: 2, text: 'Sus barcos navegaban durante ocho meses.'}, {n: 3, text: 'Hacia 1700 la compañía tenía cuarenta mil empleados y muchísimos barcos que navegaban por todo el mundo conocido de entonces.'}, {n: 4, text: 'Se disolvió en 1799.'}]}, src), src, {locale: 'es-419', sourceLocale: 'en-US'});
  assert.ok(lost.issues.some(item => item.code === 'figure-changed' && item.n === 3), 'the digits 40,000 disappeared');
  assert.deepEqual(lost.issues.filter(item => item.code === 'long-spoken').map(item => item.n), [3], 'only the padded sentence runs long against the others');
  assert.ok(lost.issues.some(item => item.code === 'long-edition'));
  assert.ok(L.seconds('Un solo saco de nuez moscada', 'es') < L.seconds('Un solo saco de nuez moscada', 'en'), 'Spanish syllables are spoken faster');
  // Unchanged items keep their wording when the source changes elsewhere.
  const changed = {...src, sentences: src.sentences.map(item => item.n === 2 ? {...item, text: 'Their ships sailed for nine months.'} : item)};
  const kept = L.carry(loose, src, changed);
  assert.deepEqual(kept.sentences, [1]);
  assert.equal(L.script({sentences: [{n: 1, text: 'Uno.'}, {n: 3, text: 'Tres.'}]}, src), 'Uno.\n\nTres.');
});

const story = ['In 1602, a group of Dutch merchants did something no one had ever tried. They sold small pieces of one company to anyone who wanted to buy. Their ships sailed from Amsterdam to Indonesia, a voyage of eight months, for pepper, nutmeg and cloves.', 'A single bag of nutmeg could sell in Europe for sixty times what it cost on the islands. Within ten years, the shares were worth three times what people had paid. But one ship lost at sea could wipe out a whole year of profit.', 'So the merchants did something clever: they split every voyage between hundreds of owners. A ledger from 1609 records a loss that no single family could have survived. By 1700, the company had 40,000 employees, its own coins and its own army.', 'It could sign treaties and fight wars like a country. Then debts, smuggling and war slowly drained it, and in 1799 it was dissolved. Yet every stock you can buy today still works the way those merchants planned.'].join('\n\n');
function setup(t, answer, body = story, minutes = 1) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'l01-'));
  const store = new Store(':memory:', {artifactRoot: root});
  t.after(() => { store.close(); fs.rmSync(root, {recursive: true, force: true}); });
  const family = store.saveFamily({name: 'Money Stories', tier: 'A', countries: ['United States', 'Mexico'], audience: 'Curious adults who like money history told as stories.', niche: 'Origins of money', locales: ['en-US', 'es-419', 'it-IT'], timezone: 'Asia/Karachi', monthlyBudget: 50, cadence: 2, format: 'long-form', monthlyTokenLimit: 2000000, scriptTokenLimit: 8000, researchTokenLimit: 8000});
  let content = store.saveContent({familyId: family.id, title: 'The first company you could own', kind: 'fiction', angle: 'How the Dutch East India Company invented shares.', hook: 'In 1602, a group of Dutch merchants did something no one had ever tried.', script: body, targetMinutes: minutes, sources: [], rightsConfirmed: true});
  store.reviewContent(content.id, {revision: content.revision, action: 'submit'});
  content = store.reviewContent(content.id, {revision: content.revision, action: 'approve'});
  store.db.exec('CREATE TABLE render_jobs(id TEXT PRIMARY KEY, content_id TEXT, preset TEXT, status TEXT, scope TEXT, created_at TEXT)');
  store.db.prepare("INSERT INTO render_jobs VALUES('m1',?,'master','completed',?,?)").run(content.id, JSON.stringify({edit: {drawings, timeline: {graphics, clips}}}), new Date().toISOString());
  store.db.prepare('INSERT INTO connectors(id,name_key,payload,secret) VALUES(?,?,?,?)').run('claude', 'claude', JSON.stringify({name: 'claude', provider: 'claude-code', revision: 1, test: {status: 'passed', at: new Date().toISOString()}}), null);
  const connectors = {row: id => store.db.prepare('SELECT * FROM connectors WHERE id=?').get(id), key: () => null};
  const state = {master: true, pkg: structuredClone(pkg)}, calls = [];
  const renders = {masterApproval: () => ({current: state.master})}, packaging = {latestRow: () => ({payload: JSON.stringify(state.pkg)})};
  const ai = {complete: async ({task, messages, maxTokens, onStart}) => { onStart?.(); calls.push({task, messages, maxTokens}); return {content: JSON.stringify(answer(JSON.parse(messages[1].content), calls.length)), usage: {promptTokens: 800, completionTokens: 400, totalTokens: 1200}, model: 'claude-opus-5-5'}; }};
  return {store, content, room: new LocalizationRoom(store, renders, packaging, connectors, ai), state, calls};
}
// A fake Spanish adaptation: every asked sentence and text gets a Spanish wording with its figures kept.
const spanish = packet => ({sentences: packet.sentences.map(item => ({n: item.n, text: `ES ${item.text.replace(/[A-Za-z]+/g, 'palabra')}`})), visible: packet.visible.map(item => ({id: item.id, text: `ES ${item.text}`.slice(0, item.maxLength)})),
  package: packet.package ? {title: 'La primera empresa que podías comprar (1602)', description: 'Cómo nacieron las acciones.', tags: ['historia'], thumbnail: {text: 'CUALQUIERA PODÍA', accent: 'CUALQUIERA'}} : undefined, notes: 'Nombres conservados.'});

test('Room 06 adapts an edition on a click inside a reservation, checks it and approves it by name', async t => {
  const {store, content, room, state, calls} = setup(t, spanish);
  state.master = false;
  assert.throws(() => room.queueDraft(content.id, {requestedBy: 'Owner', locale: 'es-419', connector: {id: 'claude', revision: 1}}), /Approve the final master in Room 10/);
  state.master = true;
  assert.throws(() => room.queueDraft(content.id, {requestedBy: 'Owner', locale: 'fr-FR', connector: {id: 'claude', revision: 1}}), /not one of this family's other languages/);
  const job = room.queueDraft(content.id, {requestedBy: 'Owner', locale: 'es-419', connector: {id: 'claude', revision: 1}});
  assert.throws(() => room.queueDraft(content.id, {requestedBy: 'Owner', locale: 'es-419', connector: {id: 'claude', revision: 1}}), /already adapting/);
  const revision = await room.processNext();
  assert.equal(calls[0].task, 'localization');
  assert.match(calls[0].messages[0].content, /Latin American Spanish \(es-419\)[\s\S]*SPOKEN LENGTH/);
  assert.equal(revision.revision, 1);
  assert.equal(revision.checks.passed, true, JSON.stringify(revision.checks.issues));
  assert.equal(revision.payload.visible.length, 7);
  const usage = store.db.prepare('SELECT * FROM intelligence_usage WHERE job_id=?').get(job.id);
  assert.deepEqual([usage.kind, usage.status, usage.total_tokens], ['localization', 'settled', 1200]);
  assert.throws(() => store.db.prepare('UPDATE edition_revisions SET note=? WHERE id=?').run('x', revision.id), /immutable/);
  // Approval: every confirmation, by name; the owner's edit is strict and becomes the next revision.
  assert.throws(() => room.approve(revision.id, {approvedBy: 'Owner', confirmations: {meaningReviewed: true}}), /names, numbers, dates/);
  const edited = room.save(content.id, {createdBy: 'Owner', locale: 'es-419', expectedRevision: 1, edition: {...revision.payload, sentences: revision.payload.sentences.map(item => item.n === 1 ? {...item, text: 'En 1602, unos mercaderes neerlandeses vendieron partes de una compañía a cualquiera.'} : item)}});
  assert.equal(edited.revision, 2);
  assert.throws(() => room.approve(revision.id, {approvedBy: 'Owner', confirmations: {meaningReviewed: true, factsChecked: true, visibleChecked: true, packageHonest: true}}), /newer Latin American Spanish revision/);
  const confirmations = {meaningReviewed: true, factsChecked: true, visibleChecked: true, packageHonest: true};
  assert.equal(room.approve(edited.id, {approvedBy: 'Owner', confirmations}).approval.current, true);
  assert.equal(room.currentApproval(content.id, 'es-419').revision, 2);
  assert.match(room.exportText(edited.id).text, /NARRATION\nEn 1602, unos mercaderes[\s\S]*TITLE\nLa primera empresa/);
  // The primary video's words change: the approval goes stale, and the next adaptation asks only what changed.
  state.pkg.description = 'How shares began, and why they still work this way.';
  assert.equal(room.currentApproval(content.id, 'es-419'), null);
  assert.match(room.state().contents[0].editions[0].latest.approval.staleReason, /words changed/);
  room.queueDraft(content.id, {requestedBy: 'Owner', locale: 'es-419', connector: {id: 'claude', revision: 1}});
  const again = await room.processNext();
  const asked = JSON.parse(calls[1].messages[1].content);
  assert.equal(asked.sentences.length, 0, 'every sentence was unchanged and kept');
  assert.ok(asked.given.some(item => item.n === 1 && /neerlandeses/.test(item.text)));
  assert.equal(again.payload.sentences.find(item => item.n === 1).text, edited.payload.sentences.find(item => item.n === 1).text);
  assert.equal(again.checks.passed, true);
  // The other language is independent.
  assert.equal(room.state().contents[0].editions[1].latest, null);
});

test('an adaptation that stops part-way keeps its finished parts and never pays for them twice', async t => {
  let fail = true;
  // A long script: 200 sentences, two parts of at most 150.
  const lines = ['In 1602, a group of Dutch merchants did something no one had ever tried.', ...Array.from({length: 199}, (_, k) => `In year ${1600 + k} the merchants of voyage ${k + 1} counted their ${['ships', 'coins', 'spices', 'debts', 'owners'][k % 5]} again.`)];
  const long = Array.from({length: 20}, (_, p) => lines.slice(p * 10, p * 10 + 10).join(' ')).join('\n\n');
  const {store, room, calls, content: c} = setup(t, spanish, long, 14);
  const original = room.ai.complete;
  room.ai.complete = async args => { if (calls.length === 1 && fail) { fail = false; args.onStart(); throw new Error('connection reset'); } return original(args); };
  const job = room.queueDraft(c.id, {requestedBy: 'Owner', locale: 'it-IT', connector: {id: 'claude', revision: 1}});
  assert.equal(room.publicJob(room.jobRow(job.id)).parts, 2);
  assert.equal(await room.processNext(), null);
  assert.deepEqual([room.publicJob(room.jobRow(job.id)).status, room.publicJob(room.jobRow(job.id)).partsDone], ['interrupted', 1]);
  assert.throws(() => room.retryDraft(job.id, {}), /Confirm the deliberate retry/);
  room.retryDraft(job.id, {confirmInterrupted: true});
  const revision = await room.processNext();
  assert.equal(calls.length, 2, 'the finished first part was not asked again');
  assert.equal(revision.payload.sentences.length, 200);
  assert.equal(revision.checks.passed, true);
  assert.equal(store.db.prepare("SELECT count(*) n FROM intelligence_usage WHERE job_id LIKE ?").get(`${job.id}%`).n, 2);
});
