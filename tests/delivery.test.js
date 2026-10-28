'use strict';
// P08b voice direction: Claude marks how every sentence is performed; the owner can change lines; auditions
// perform the direction (tags on ElevenLabs v3/v4, per-segment settings or instructions elsewhere); the scene
// planner reads it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {Store} = require('../store');
const {VoiceRuntime} = require('../voice');
const {VoiceDirector} = require('../voice-direction');
const D = require('../delivery');

const script = 'A single bolt of lightning is five times hotter than the sun. It lasts less than a second.\n\nRight now, lightning is striking about 45 times every second. Nobody knows why.';
const sentences = [{n: 1, text: 'A single bolt of lightning is five times hotter than the sun.'}, {n: 2, text: 'It lasts less than a second.'}, {n: 3, text: 'Right now, lightning is striking about 45 times every second.'}, {n: 4, text: 'Nobody knows why.'}];
const answer = {summary: 'Opens dramatic, settles curious, lifts to excited, lands quietly.', lines: [
  {n: 1, emotion: 'dramatic', energy: 5, pace: 'fast', pause: 'short', emphasis: ['five']},
  {n: 2, emotion: 'curious', energy: 3, pace: 'normal', pause: 'long'},
  {n: 3, emotion: 'excited', energy: 4, pace: 'fast', pause: 'short', emphasis: ['45']},
  {n: 4, emotion: 'whisper', energy: 2, pace: 'slow', pause: 'long', note: 'Let it hang.'},
]};

test('a direction marks every sentence; Claude\'s near-misses are repaired, the owner\'s edits are strict', () => {
  const warnings = [];
  const direction = D.validate({summary: 'x', lines: [...answer.lines.slice(0, 3).map(line => (line.n === 1 ? {...line, emphasis: ['five', 'moon']} : line)), {n: 3, emotion: 'excited'}, {n: 9, emotion: 'sad'}, {n: 4, emotion: 'giddy', energy: 7}]}, sentences, {lenient: true, warn: message => warnings.push(message)});
  assert.deepEqual(direction.lines.map(line => [line.n, line.emotion, line.energy]), [[1, 'dramatic', 5], [2, 'curious', 3], [3, 'excited', 4], [4, 'neutral', 3]]);
  assert.deepEqual(direction.lines[0].emphasis, ['five'], 'a word that is not in the sentence is never stressed');
  assert.match(warnings.join(' | '), /"moon" is not in the sentence[\s\S]*Sentence 3 is directed twice[\s\S]*sentence 9, which is not in the script[\s\S]*energy must be a whole number[\s\S]*emotion must be one of/);
  assert.throws(() => D.validate({lines: [{n: 1, emotion: 'giddy'}]}, sentences), /emotion must be one of/);
  assert.throws(() => D.validate({lines: answer.lines.slice(0, 3)}, sentences), /Sentence 4 has no direction/);
});

test('the performance becomes provider requests: inline tags on v3/v4, voice settings or instructions elsewhere', () => {
  const direction = D.validate(answer, sentences);
  const v4 = D.segments({script, sentences, direction, provider: 'elevenlabs', model: 'eleven_v4'});
  assert.deepEqual(v4.map(item => [item.text, item.speed]), [
    ['[dramatically] A single bolt of lightning is FIVE times hotter than the sun.', 1.1],
    ['[curious] It lasts less than a second. [long pause]', 1],
    ['[excited] Right now, lightning is striking about 45 times every second.', 1.1],
    ['[whispers] Nobody knows why. [long pause]', 0.9],
  ], 'an emotion is tagged when it changes; stressed words in capitals; a change of pace is a new request');
  const merged = D.segments({script, sentences, direction: D.validate({lines: sentences.map(item => ({n: item.n, emotion: item.n < 3 ? 'warm' : 'excited'}))}, sentences), provider: 'elevenlabs', model: 'eleven_v3'});
  assert.deepEqual(merged.map(item => item.text), ['[warmly] A single bolt of lightning is five times hotter than the sun. It lasts less than a second.\n\n[excited] Right now, lightning is striking about 45 times every second. Nobody knows why.'], 'one pace, one request; paragraph breaks survive');
  const plain = D.segments({script, sentences, direction, provider: 'elevenlabs', model: 'eleven_multilingual_v2', base: {stability: 0.5, style: 0}});
  assert.deepEqual(plain.map(item => [item.text.slice(0, 12), item.stability, item.style]), [['A single bol', 0.26, 0.25], ['It lasts les', 0.5, 0.15], ['Right now, l', 0.34, 0.2], ['Nobody knows', 0.58, 0.1]], 'livelier lines are less stable and more styled');
  const openai = D.segments({script, sentences, direction, provider: 'openai', model: 'gpt-4o-mini-tts', base: {instructions: 'Warm narrator.'}});
  assert.equal(openai[0].instructions, 'Warm narrator. Perform this part as dramatic, energy 5 of 5, fast pace; stress "five".');
  assert.deepEqual([D.requestLimit('elevenlabs', 'eleven_v3'), D.requestLimit('elevenlabs', 'eleven_v4'), D.requestLimit('openai', 'gpt-4o-mini-tts')], [4500, 9000, 4000]);
});

// A one-minute script whose first paragraph is the directed sample; the rest stays neutral.
const filler = ['Storm clouds build their charge as ice and water collide high inside them.', 'The charge grows until the air itself can no longer hold it apart.', 'Then a channel opens, and the sky finds the quickest path to the ground below.', 'Every strike rebuilds that path in a fraction of a moment, again and again.', 'Scientists still argue about what sparks the very first step of the channel.', 'Some think cosmic rays from deep space start it; others point to tiny ice crystals.', 'What everyone agrees on is the heat, the speed and the sheer raw power of it.', 'So when the next storm rolls in, look up, then count the seconds until the thunder answers.'];
const longScript = `${script}

${filler.slice(0, 3).join(' ')}

${filler.slice(3, 5).join(' ')}

${filler.slice(5).join(' ')}`;
function setup(t, model = 'eleven_v4') {
  const artifactRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-test-'));
  const store = new Store(':memory:', {artifactRoot});
  t.after(() => { store.close(); fs.rmSync(artifactRoot, {recursive: true, force: true}); });
  const family = store.saveFamily({name: 'Storm facts', tier: 'A', countries: ['United States'], audience: 'Curious adults who like surprising science.', niche: 'Everyday science', locales: ['en-US'], timezone: 'Asia/Karachi', monthlyBudget: 100, cadence: 2, format: 'long-form', monthlyTokenLimit: 200000, scriptTokenLimit: 6000, researchTokenLimit: 4000});
  let content = store.saveContent({familyId: family.id, title: 'Lightning', kind: 'fiction', targetMinutes: 1, angle: 'One surprising number about lightning.', hook: sentences[0].text, script: longScript, sources: [], rightsConfirmed: true});
  store.reviewContent(content.id, {revision: content.revision, action: 'submit'});
  content = store.reviewContent(content.id, {revision: content.revision, action: 'approve'});
  for (const [id, provider] of [['eleven', 'elevenlabs'], ['claude', 'claude-code']]) store.db.prepare('INSERT INTO connectors(id,name_key,payload,secret) VALUES(?,?,?,?)').run(id, id, JSON.stringify({name: id, provider, revision: 1, test: {status: 'passed', at: new Date().toISOString()}}), provider === 'claude-code' ? null : Buffer.from('protected'));
  const connectors = {row: id => store.db.prepare('SELECT * FROM connectors WHERE id=?').get(id), key: () => 'fixture-key'};
  const calls = [];
  const ai = {complete: async ({messages, maxTokens}) => { calls.push({messages, maxTokens}); return {content: `Here is the direction:\n${JSON.stringify(answer)}`, usage: {promptTokens: 900, completionTokens: 300, totalTokens: 1200}, model: 'claude-opus-5-5'}; }};
  const director = new VoiceDirector(store, connectors, {ai});
  const profile = store.saveVoiceProfile(family.id, {revision: 0, familyRevision: store.family(family.id).revision, name: 'Narrator', connectorId: 'eleven', connectorRevision: 1, provider: 'elevenlabs', model, voiceId: 'voice_fixture_123', voiceVersion: 'current', ownershipBasis: 'provider_stock_voice', rightsHolder: 'Provider voice catalog', consentConfirmed: true, commercialUseConfirmed: true, evidenceReference: 'Terms reviewed.', termsReviewedAt: '2026-10-09', pace: 1, energy: 55, emotion: 'warm', pauseScale: 1, emphasis: 50, instructions: '', lexicon: [], monthlyCharacterLimit: 100000, maxCharactersPerAudition: 12000, priceCentsPerMillionCharacters: 1500});
  return {store, family, content, director, connectors, calls, profile, artifactRoot};
}

test('Claude directs on a click inside a token reservation; the owner edits lines as new revisions', async t => {
  const {store, content, director, calls} = setup(t);
  assert.throws(() => director.queue(content.id, {requestedBy: 'Owner'}), /Choose a tested Claude connector/);
  const job = director.queue(content.id, {requestedBy: 'Owner', connector: {id: 'claude', revision: 1}});
  assert.throws(() => director.queue(content.id, {requestedBy: 'Owner', connector: {id: 'claude', revision: 1}}), /already directing/);
  const direction = await director.processNext();
  assert.equal(calls.length, 1);
  assert.match(calls[0].messages[0].content, /voice director[\s\S]*Do not flatten the script into one tone/);
  assert.deepEqual(JSON.parse(calls[0].messages[1].content).sentences.slice(0, 4).map(item => item.text), sentences.map(item => item.text));
  assert.deepEqual([direction.revision, direction.source, direction.lines[3].emotion, direction.current], [1, 'claude', 'whisper', true]);
  assert.equal(director.publicJob(director.jobRow(job.id)).status, 'completed');
  const usage = store.db.prepare('SELECT * FROM intelligence_usage WHERE job_id=?').get(job.id);
  assert.deepEqual([usage.kind, usage.status, usage.total_tokens], ['voice_direction', 'settled', 1200]);
  assert.throws(() => director.edit(direction.id, {editedBy: 'Owner', expectedRevision: 1, lines: [{n: 2, emotion: 'giddy'}]}), /emotion must be one of/);
  const edited = director.edit(direction.id, {editedBy: 'Owner', expectedRevision: 1, lines: [{n: 2, emotion: 'serious', pace: 'slow'}], note: 'Less playful here.'});
  assert.deepEqual([edited.revision, edited.source, edited.lines[1].emotion, edited.lines[1].pace, edited.lines[0].emotion], [2, 'owner', 'serious', 'slow', 'dramatic']);
  assert.throws(() => director.edit(direction.id, {editedBy: 'Owner', expectedRevision: 1, lines: [{n: 2, emotion: 'sad'}]}), /changed in another tab/);
  assert.throws(() => store.db.prepare('UPDATE voice_directions SET note=? WHERE id=?').run('x', edited.id), /immutable/);
});

test('an audition performs the newest direction: tagged requests, varied speed, billed characters', async t => {
  const {store, content, director, profile, artifactRoot} = setup(t);
  director.queue(content.id, {requestedBy: 'Owner', connector: {id: 'claude', revision: 1}});
  const first = await director.processNext();
  const newest = director.edit(first.id, {editedBy: 'Owner', expectedRevision: 1, lines: [{n: 4, emotion: 'somber'}]});
  const base = {contentRevision: content.revision, profileId: profile.id, profileRevision: profile.revision, connectorId: 'eleven', connectorRevision: 1};
  assert.throws(() => store.queueVoiceAudition(content.id, {...base, directionId: first.id}), /newer voice direction exists/);
  const job = store.queueVoiceAudition(content.id, {...base, directionId: newest.id});
  const scope = JSON.parse(store.db.prepare('SELECT input FROM voice_jobs WHERE id=?').get(job.id).input);
  assert.equal(scope.direction.id, newest.id);
  assert.ok(scope.characterCount > script.length, 'tags are billed characters');
  const sample = path.join(artifactRoot, 'provider.wav');
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=380:duration=1', '-ar', '44100', '-ac', '1', '-y', sample]);
  const bytes = fs.readFileSync(sample), requests = [];
  // ElevenLabs answers with the audio and every character's time (here spread evenly over the 1 s take).
  const timed = text => ({audio_base64: bytes.toString('base64'), alignment: {characters: [...text], character_start_times_seconds: [...text].map((_, k) => k / text.length), character_end_times_seconds: [...text].map((_, k) => (k + 1) / text.length)}});
  const runtime = new VoiceRuntime(store, {key: () => 'fixture-key', fetch: async (url, options) => { assert.match(String(url), /\/with-timestamps\?/); requests.push(JSON.parse(options.body)); return new Response(JSON.stringify(timed(requests.at(-1).text)), {status: 200, headers: {'content-type': 'application/json'}}); }}, {artifactDir: path.join(artifactRoot, 'artifacts')});
  await runtime.processNext();
  assert.deepEqual(requests.slice(0, 4).map(item => [item.text.split(' ')[0], item.voice_settings.speed]), [['[dramatically]', 1.1], ['[curious]', 1], ['[excited]', 1.1], ['[somberly]', 0.9]]);
  assert.match(requests[4].text, /^Storm clouds build/, 'unmarked sentences are read as written');
  const audition = store.voiceAuditions().find(item => item.jobId === job.id);
  // Measured word timing: every spoken word, no delivery tags, later parts offset by the parts before them.
  const measured = store.voiceAudition(audition.id).analysis.alignment;
  assert.equal(measured.method, 'measured');
  assert.equal(measured.words.some(word => /\[|\]/.test(word.text)), false);
  assert.ok(measured.words.every((word, k) => k === 0 || word.start >= measured.words[k - 1].start), 'in time order across parts');
  assert.ok(measured.words.at(-1).start > 1, 'later parts start after the first take');
  assert.deepEqual(store.voiceDirectionLines(audition.id).lines.slice(0, 4).map(line => line.emotion), ['dramatic', 'curious', 'excited', 'somber'], 'the scene planner reads the performed direction');
});
