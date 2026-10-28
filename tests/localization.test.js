'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
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
  store.db.prepare('INSERT INTO connectors(id,name_key,payload,secret) VALUES(?,?,?,?)').run('eleven', 'eleven', JSON.stringify({name: 'eleven', provider: 'elevenlabs', revision: 1, test: {status: 'passed', at: new Date().toISOString()}}), Buffer.from('protected'));
  const state = {master: true, pkg: structuredClone(pkg), fetch: null}, calls = [];
  const connectors = {row: id => store.db.prepare('SELECT * FROM connectors WHERE id=?').get(id), key: id => id === 'eleven' ? 'fixture-key' : null, fetch: (...args) => state.fetch(...args)};
  const renders = {masterApproval: () => ({current: state.master})}, packaging = {latestRow: () => ({payload: JSON.stringify(state.pkg)})};
  const ai = {complete: async ({task, messages, maxTokens, onStart}) => { onStart?.(); calls.push({task, messages, maxTokens}); return {content: JSON.stringify(answer(JSON.parse(messages[1].content), calls.length)), usage: {promptTokens: 800, completionTokens: 400, totalTokens: 1200}, model: 'claude-opus-5-5'}; }};
  return {store, content, family, root, room: new LocalizationRoom(store, renders, packaging, connectors, ai), state, calls};
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

// A stand-in for ElevenLabs: real audio (an FFmpeg tone, 0.4 s a word) with character timing for the text it was sent.
function fakeElevenLabs(root, calls, {failAfter = Infinity} = {}) {
  return async (url, options) => {
    calls.push(String(url));
    if (calls.length > failAfter) throw new Error('connection reset');
    const text = JSON.parse(options.body).text, seconds = text.split(/\s+/).filter(Boolean).length * 0.4, file = path.join(root, `tts-${calls.length}.mp3`);
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `sine=frequency=220:sample_rate=44100:duration=${seconds}`, '-af', 'volume=0.5', '-c:a', 'libmp3lame', '-b:a', '64k', '-y', file]);
    const chars = [...text], per = seconds / chars.length;
    return new Response(JSON.stringify({audio_base64: fs.readFileSync(file).toString('base64'), alignment: {characters: chars, character_start_times_seconds: chars.map((_, k) => k * per), character_end_times_seconds: chars.map((_, k) => (k + 1) * per)}}), {status: 200, headers: {'content-type': 'application/json'}});
  };
}

test('L02: each language gets its own narrator, the narration is measured scene by scene and approved by name', async t => {
  const {store, content, room, state, root, family} = setup(t, spanish);
  const fetches = [];
  state.fetch = fakeElevenLabs(root, fetches);
  const confirmations = {meaningReviewed: true, factsChecked: true, visibleChecked: true, packageHonest: true};
  room.queueDraft(content.id, {requestedBy: 'Owner', locale: 'es-419', connector: {id: 'claude', revision: 1}});
  const edition = await room.processNext();
  // The narrator: the main narrator's connection and rights, with this language's voice and model.
  assert.throws(() => room.saveVoice(family.id, {createdBy: 'Owner', locale: 'es-419', expectedRevision: 0, languageConfirmed: true}), /main narrator in the Voice Room/);
  store.saveVoiceProfile(family.id, {revision: 0, familyRevision: store.family(family.id).revision, name: 'Narrator', connectorId: 'eleven', connectorRevision: 1, provider: 'elevenlabs', model: 'eleven_multilingual_v2', voiceId: 'voice_fixture_123', voiceVersion: 'current', ownershipBasis: 'provider_stock_voice', rightsHolder: 'Provider voice catalog', consentConfirmed: true, commercialUseConfirmed: true, evidenceReference: 'Terms reviewed.', termsReviewedAt: '2026-10-09', pace: 1, energy: 55, emotion: 'warm', pauseScale: 1, emphasis: 50, instructions: '', lexicon: [], monthlyCharacterLimit: 100000, maxCharactersPerAudition: 12000, priceCentsPerMillionCharacters: 1500});
  assert.throws(() => room.saveVoice(family.id, {createdBy: 'Owner', locale: 'es-419', expectedRevision: 0}), /may narrate in Latin American Spanish/);
  assert.throws(() => room.saveVoice(family.id, {createdBy: 'Owner', locale: 'fr-FR', expectedRevision: 0, languageConfirmed: true}), /not one of this family's other languages/);
  const voice = room.saveVoice(family.id, {createdBy: 'Owner', locale: 'es-419', expectedRevision: 0, voiceId: 'voice_es_456', languageConfirmed: true});
  assert.deepEqual([voice.voiceId, voice.model, voice.provider, voice.revision], ['voice_es_456', 'eleven_multilingual_v2', 'elevenlabs', 1]);
  assert.throws(() => store.db.prepare('UPDATE edition_voices SET payload=? WHERE id=?').run('{}', voice.id), /immutable/);
  // The approved edit's scenes, one per paragraph; the third is far shorter than this language needs.
  const words = n => edition.payload.sentences.filter(item => item.n >= n[0] && item.n <= n[1]).reduce((sum, item) => sum + item.text.split(/\s+/).length, 0) * 0.4;
  const spans = [[1, 3], [4, 6], [7, 9], [10, 12]], shape = [1, 1.1, 0.6, 1], fps = 30;
  let at = 0;
  const scenes = spans.map((span, k) => { const frames = Math.round(words(span) * shape[k] * fps), scene = {id: `sc${k}`, label: `S${k + 1}`, startFrame: at, endFrame: at + frames, sentenceStart: span[0], sentenceEnd: span[1]}; at += frames; return scene; });
  store.db.prepare('UPDATE render_jobs SET scope=? WHERE id=?').run(JSON.stringify({edit: {drawings, timeline: {fps, totalFrames: at, narrationSeconds: at / fps, scenes, graphics, clips}}}), 'm1');
  assert.throws(() => room.queueNarration(content.id, {requestedBy: 'Owner', locale: 'es-419'}), /Approve the Latin American Spanish edition's words first/);
  room.approve(edition.id, {approvedBy: 'Owner', confirmations});
  const job = room.queueNarration(content.id, {requestedBy: 'Owner', locale: 'es-419'});
  assert.throws(() => room.queueNarration(content.id, {requestedBy: 'Owner', locale: 'es-419'}), /already being made/);
  const narration = await room.processNextNarration();
  assert.equal(narration.status, 'completed', narration.error);
  assert.equal(fetches.length, 1);
  assert.match(fetches[0], /text-to-speech\/voice_es_456\/with-timestamps/);
  assert.equal(narration.analysis.timing, 'measured');
  assert.equal(narration.analysis.passed, true);
  // Every scene change lands on its own words in this language; the scene that needs much more time is named.
  const sync = narration.sync;
  assert.equal(sync.method, 'measured');
  assert.ok(sync.maxDrift < L.DRIFT_LIMIT);
  assert.deepEqual(sync.scenes.map(scene => scene.status), ['same', 'retime', 'long', 'same']);
  assert.match(sync.issues[0].message, /S3 runs 6\d% longer[\s\S]*sentences 7-9/);
  const period = store.tokenPeriod(store.family(family.id));
  assert.equal(store.editionVoiceCharacters(family.id, period), JSON.parse(room.narrationRow(job.id).scope).characterCount, 'the edition counts against the family voice characters');
  // Approval by name; a scene outside the natural range must be accepted explicitly.
  const base = {listened: true, pronunciation: true, syncReviewed: true};
  assert.throws(() => room.approveNarration(job.id, {approvedBy: 'Owner', confirmations: {listened: true}}), /pronounced right/);
  assert.throws(() => room.approveNarration(job.id, {approvedBy: 'Owner', confirmations: base}), /Accept the scene that changes length/);
  const approved = room.approveNarration(job.id, {approvedBy: 'Owner', confirmations: {...base, syncAccepted: true}});
  assert.equal(approved.approval.current, true);
  assert.equal(room.currentNarration(content.id, 'es-419').id, job.id);
  assert.throws(() => store.db.prepare('UPDATE edition_narration_approvals SET notes=? WHERE narration_id=?').run('x', job.id), /immutable/);
  // New words for this language: the narration no longer stands for them.
  room.save(content.id, {createdBy: 'Owner', locale: 'es-419', expectedRevision: 1, edition: {...edition.payload, sentences: edition.payload.sentences.map(item => item.n === 2 ? {...item, text: 'Vendieron partes de una compañía.'} : item)}});
  assert.equal(room.currentNarration(content.id, 'es-419'), null);
  assert.match(room.publicNarration(room.narrationRow(job.id)).approval.staleReason, /words or the voice changed/);
});

test('L02: a narration that stops after the voice service was asked needs a confirmed retry', async t => {
  const {store, content, room, state, root, family} = setup(t, spanish);
  const fetches = [];
  state.fetch = fakeElevenLabs(root, fetches, {failAfter: 0});
  room.queueDraft(content.id, {requestedBy: 'Owner', locale: 'it-IT', connector: {id: 'claude', revision: 1}});
  const edition = await room.processNext();
  room.approve(edition.id, {approvedBy: 'Owner', confirmations: {meaningReviewed: true, factsChecked: true, visibleChecked: true, packageHonest: true}});
  store.db.prepare('UPDATE render_jobs SET scope=? WHERE id=?').run(JSON.stringify({edit: {drawings, timeline: {fps: 30, totalFrames: 900, narrationSeconds: 30, scenes: [{id: 'a', label: 'S1', startFrame: 0, endFrame: 900, sentenceStart: 1, sentenceEnd: 12}], graphics, clips}}}), 'm1');
  store.saveVoiceProfile(family.id, {revision: 0, familyRevision: store.family(family.id).revision, name: 'Narrator', connectorId: 'eleven', connectorRevision: 1, provider: 'elevenlabs', model: 'eleven_multilingual_v2', voiceId: 'voice_fixture_123', voiceVersion: 'current', ownershipBasis: 'provider_stock_voice', rightsHolder: 'Provider voice catalog', consentConfirmed: true, commercialUseConfirmed: true, evidenceReference: 'Terms reviewed.', termsReviewedAt: '2026-10-09', pace: 1, energy: 55, emotion: 'warm', pauseScale: 1, emphasis: 50, instructions: '', lexicon: [], monthlyCharacterLimit: 100000, maxCharactersPerAudition: 12000, priceCentsPerMillionCharacters: 1500});
  room.saveVoice(family.id, {createdBy: 'Owner', locale: 'it-IT', expectedRevision: 0, languageConfirmed: true});
  const job = room.queueNarration(content.id, {requestedBy: 'Owner', locale: 'it-IT'});
  assert.equal(await room.processNextNarration(), null);
  const failed = room.narrationRow(job.id);
  assert.deepEqual([failed.status, failed.usage_status], ['interrupted', 'unknown']);
  assert.throws(() => room.retryNarration(job.id, {}), /may have been charged/);
  const again = room.retryNarration(job.id, {confirmInterrupted: true});
  assert.equal(again.attempts, 2);
  state.fetch = fakeElevenLabs(root, fetches);
  assert.equal((await room.processNextNarration()).status, 'completed');
  // A program stop while narrating marks it interrupted on the next start.
  room.queueNarration(content.id, {requestedBy: 'Owner', locale: 'it-IT'});
  store.db.prepare("UPDATE edition_narrations SET status='running', usage_status='reserved' WHERE status='queued'").run();
  new LocalizationRoom(store, {masterApproval: () => ({current: true})}, {latestRow: () => null}, {}, {});
  assert.equal(store.db.prepare("SELECT count(*) AS n FROM edition_narrations WHERE status='interrupted' AND usage_status='unknown'").get().n, 1);
});

test('L03: the edit is retimed scene by scene onto the edition voice, with its own words and music in place', () => {
  const timeline = {fps: 30, format: 'long-form', totalFrames: 600, narrationSeconds: 20,
    scenes: [{id: 'a', label: 'S1', startFrame: 0, endFrame: 300, sentenceStart: 1, sentenceEnd: 1}, {id: 'b', label: 'S2', startFrame: 300, endFrame: 600, sentenceStart: 2, sentenceEnd: 2}],
    clips: [{id: 'c1', sceneId: 'a', mediaType: 'image', start: 0, frames: 150, speed: 1, inSeconds: 0}, {id: 'c2', sceneId: 'a', mediaType: 'video', start: 150, frames: 150, speed: 1, inSeconds: 1, clipSeconds: 6}, {id: 'c3', sceneId: 'b', mediaType: 'image', start: 300, frames: 300, speed: 1, inSeconds: 0}],
    joins: [{type: 'cut', frames: 0}, {type: 'fade', frames: 12}], graphics: [{id: 'g1', status: 'accepted', template: 'title-card', start: 330, frames: 90, title: 'The first company', lines: ['1602']}],
    markers: [{kind: 'hook-end', frame: 450}], ending: {fadeOutFrames: 18}, captions: null};
  // The edition says scene 1 in 15 s and scene 2 in 15 s (30 s in all).
  const sync = {sentences: [{n: 1, start: 0}, {n: 2, start: 15}], scenes: [{id: 'a', startFrame: 0, endFrame: 450}, {id: 'b', startFrame: 450, endFrame: 900}]};
  const payload = {sentences: [{n: 1, text: 'Uno dos tres.'}, {n: 2, text: 'Cuatro cinco.'}], visible: [{id: 'g:g1/title', text: 'La primera empresa'}, {id: 'd:c1/elements/0/text', text: 'CUALQUIERA'}, {id: 'd:c1/elements/1/labels/0', text: 'Barcos'}]};
  const tl = L.editionTimeline(timeline, sync, {payload, narrationSeconds: 30, locale: 'es-419'});
  assert.deepEqual(tl.clips.map(clip => [clip.start, clip.frames]), [[0, 225], [225, 225], [450, 450]]);
  assert.deepEqual([tl.totalFrames, tl.scenes[1].startFrame, tl.graphics[0].start, tl.graphics[0].frames, tl.markers[0].frame], [900, 450, 495, 135, 675]);
  assert.deepEqual([tl.graphics[0].title, tl.graphics[0].lines], ['La primera empresa', ['1602']]);
  // 7.5 s of a 6-s clip from 1 s: it starts earlier, then slows down (never below half speed).
  assert.deepEqual([tl.clips[1].inSeconds, tl.clips[1].speed], [0, 0.79]);
  assert.match(tl.clips[1].trimReason, /Retimed for Latin American Spanish: the clip runs at 79% speed/);
  assert.equal(tl.joins[1].frames, 12);
  assert.ok(tl.captions.groups.length && tl.captions.groups[0].words[0].text === 'Uno');
  const drawings = L.editionDrawings({c1: {sketch: {elements: [{kind: 'text', text: 'ANYONE'}, {kind: 'chart', labels: ['Ships', 'Gold']}]}}, c9: {composition: {html: '<p>x</p>'}}}, payload);
  assert.deepEqual(drawings.c1.sketch.elements.map(item => item.text || item.labels), ['CUALQUIERA', ['Barcos', 'Gold']]);
  assert.deepEqual(drawings.c9, {composition: {html: '<p>x</p>'}});
  const music = L.editionSoundtrack({music: [{start: 10, end: 20}], sfx: [{seconds: 5}]}, timeline, sync);
  assert.deepEqual([music.music[0].start, music.music[0].end, music.sfx[0].seconds], [15, 30, 7.5]);
});
