'use strict';
// 0.111: the program directs each AI-video shot for Meta Muse (the owner generates it there and uploads the clip).
const test = require('node:test');
const assert = require('node:assert/strict');
const Mu = require('../muse');

const cast = [{id: 'hero', name: 'Sam', role: 'survivor', ref: '0b6f4a40-1111-4222-8333-444455556666'}, {id: 'c2', name: 'Lena', role: 'navigator'}];
const refs = {'0b6f4a40-1111-4222-8333-444455556666': {label: 'The survivor', description: 'Short dark hair, stubble, rust-red shirt, brown satchel.'}};

test('muse.js: a shot direction names the reference character, the world, the camera, the length and what to avoid', () => {
  const d = Mu.direction({shot: {label: 'S03B', prompt: 'Medium shot: Sam bails water out of the leaking raft with a tin cup, waves slapping the float.', motion: 'push-in', durationSeconds: 14.2},
    scene: {direction: 'The raft is losing the fight with the sea.'}, words: 'By day two, the left float was leaking.', cast, refs, world: {place: 'the open Pacific', era: 'modern', rules: ['no land in sight']}, grade: 'cold, desaturated', before: 'the raft from above at dawn'});
  assert.equal(d.seconds, 10, 'a Muse clip is at most 10 s');
  assert.equal(d.aspect, '16:9');
  assert.deepEqual(d.attach, [{id: '0b6f4a40-1111-4222-8333-444455556666', label: 'The survivor', who: 'Sam'}]);
  assert.match(d.text, /exactly as in the attached reference "The survivor": Short dark hair/);
  assert.match(d.text, /World: the open Pacific, modern era \(no land in sight\)/);
  assert.match(d.text, /slow push in/);
  assert.match(d.text, /Continuity: it follows a shot of the raft from above at dawn/);
  assert.match(d.text, /Avoid: any text/);
  assert.match(d.text, /do not show these words/);
  // A shot of a person who is not named still gets the one reference character; a shot of a thing gets none.
  assert.equal(Mu.direction({shot: {prompt: 'Close-up: he grips the rope, knuckles white.', motion: 'static', durationSeconds: 3}, cast, refs}).attach.length, 1);
  assert.equal(Mu.direction({shot: {prompt: 'Extreme close-up of a cracked compass on wet planks.', motion: 'static', durationSeconds: 3}, cast, refs}).attach.length, 0);
  assert.equal(Mu.direction({shot: {prompt: 'Sam looks up.', motion: 'static', durationSeconds: 1}, cast, refs, vertical: true}).aspect, '9:16');
});

test('muse.js: an uploaded clip is checked against its shot', () => {
  const probe = (width, height, duration, kind = 'video') => ({kind, width, height, durationSeconds: duration});
  assert.deepEqual(Mu.checkClip(probe(1280, 720, 10), {seconds: 8}).problems, []);
  assert.match(Mu.checkClip(probe(1280, 720, 4), {seconds: 8}).notes[0], /4.0 s and its shot is 8.0 s/);
  assert.match(Mu.checkClip(probe(720, 1280, 8), {seconds: 8}).notes[0], /cropped/);
  assert.match(Mu.checkClip(probe(426, 240, 8), {seconds: 8}).problems[0], /720p or more/);
  assert.equal(Mu.checkClip(probe(1280, 720, null, 'image'), {seconds: 3}).ok, false);
  assert.ok(Mu.checkClip(probe(1080, 1920, 6), {seconds: 6, vertical: true}).ok);
});

test('muse-api.js: the useapi.net client names refusals, keeps the token out of messages and reads a finished job', async () => {
  const {MuseClient} = require('../muse-api');
  const TOKEN = 'useapi-fixture-token-0123456789abcdef';
  const answers = {
    '/v1/muse/jobs/video': () => new Response(JSON.stringify({error: `Weekly allowance used for ${TOKEN}`, code: 412}), {status: 412}),
    '/v1/muse/jobs/j1': () => new Response(JSON.stringify({status: 'failed', error: {code: 429, message: 'Video limit reached', retryAt: '2026-11-18T12:00:00Z'}}), {status: 200}),
    '/v1/muse/jobs/j2': () => new Response(JSON.stringify({status: 'completed', result: {assets: [{assetId: 'a-image', type: 'image'}, {assetId: 'a-video', type: 'video', mime: 'video/mp4'}]}}), {status: 200}),
  };
  const client = new MuseClient(TOKEN, async (url, options) => { assert.equal(options.redirect, 'error'); assert.equal(options.headers.Authorization, `Bearer ${TOKEN}`); return answers[new URL(url).pathname](); }, {sleep: async () => {}});
  await assert.rejects(client.startVideo({prompt: 'x'}), error => error.kind === 'allowance' && !error.message.includes(TOKEN) && /\[token\]/.test(error.message));
  await assert.rejects(client.waitVideo('j1'), error => error.kind === 'busy' && error.failed === true && error.retryAt === '2026-11-18T12:00:00Z');
  assert.deepEqual(await client.waitVideo('j2'), {assetId: 'a-video', mime: 'video/mp4', bytes: null, text: ''});
  assert.throws(() => new MuseClient('short'), /useapi.net API token/);
});

test('muse.js: the channel\'s skills reach the direction as craft lines', () => {
  const d = Mu.direction({shot: {prompt: 'Wide shot: the raft alone on a grey sea at dawn.', motion: 'pull-out', durationSeconds: 6}, craft: 'Light from one motivated source. Keep the horizon level.'});
  assert.match(d.text, /Craft \(the channel's skills\): Light from one motivated source/);
});
