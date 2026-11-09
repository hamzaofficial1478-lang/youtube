'use strict';
// 0.61: Freesound effects and Jamendo music, searched on the owner's click and added to the sound library with their
// licence and credit line. Only CC0 and CC BY; each connection records the owner's confirmation of the API terms.
// No test leaves this PC.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {Store} = require('../store');
const {ConnectorSlots} = require('../connectors');
const {QuotaLedger} = require('../intel-sources');
const {SoundLibrary} = require('../sound-library');
const {SoundOnline, FreesoundClient, JamendoClient, licenceOf} = require('../sound-online');
const M = require('../music');

const protector = {transform: (op, input) => Buffer.from([...input].reverse())};
const json = body => new Response(JSON.stringify(body), {status: 200, headers: {'content-type': 'application/json'}});
// Effects are short files and music long ones (the fake measurer below goes by size).
const audio = (id, times = 40) => new Response(Buffer.from(`ID3-${id}-`.repeat(times)), {status: 200, headers: {'content-type': 'audio/mpeg'}});
const sound = (id, license, extra = {}) => ({id, name: `sound ${id}.wav`, tags: ['whoosh', 'swoosh'], license, username: 'maker', duration: 1.2, url: `https://freesound.org/people/maker/sounds/${id}/`, previews: {'preview-hq-mp3': `https://cdn.freesound.org/previews/${id}.mp3`}, ...extra});

function network() {
  const calls = [];
  const fetch = async (url, options = {}) => {
    const target = new URL(String(url));
    calls.push({url: target.toString(), headers: options.headers || {}, redirect: options.redirect});
    if (target.origin === 'https://freesound.org' && target.pathname === '/apiv2/search/') {
      assert.equal(options.headers.Authorization, 'Token free-key-0123456789');
      assert.equal(options.redirect, 'error');
      assert.match(target.searchParams.get('filter'), /license:\("Creative Commons 0" OR "Attribution"\)/);
      const q = target.searchParams.get('query');
      if (q === 'whoosh') return json({results: [sound(1, 'https://creativecommons.org/licenses/by/4.0/'), sound(2, 'http://creativecommons.org/publicdomain/zero/1.0/'), sound(3, 'http://creativecommons.org/licenses/by-nc/3.0/'), sound(4, 'https://creativecommons.org/licenses/by/4.0/', {previews: {'preview-hq-mp3': 'https://cdn.freesound.org/redirect/4.mp3'}})]});
      // The slot fill: one CC0 sound per query, named for it; a music search (0.74) finds two long tracks.
      const id = 100 + Math.abs([...q].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % 100000;
      if (/duration:\[20/.test(target.searchParams.get('filter'))) return json({results: [1, 2].map(n => sound(id * 10 + n, 'http://creativecommons.org/publicdomain/zero/1.0/', {name: `${q} ${n}.mp3`, tags: [...q.split(' '), 'background'], duration: 120, previews: {'preview-hq-mp3': `https://cdn.freesound.org/music/${id * 10 + n}.mp3`}}))});
      return json({results: [sound(id, 'http://creativecommons.org/publicdomain/zero/1.0/', {name: `${q}.wav`, tags: q.split(' '), duration: 0.8})]});
    }
    if (target.hostname === 'cdn.freesound.org') {
      if (target.pathname === '/redirect/4.mp3') return new Response(null, {status: 302, headers: {location: 'https://evil.example/4.mp3'}});
      return audio(target.pathname, target.pathname.startsWith('/music/') ? 400 : 40);
    }
    if (target.origin === 'https://api.jamendo.com' && target.pathname === '/v3.0/tracks/') {
      assert.equal(target.searchParams.get('client_id'), 'b6747d04');
      assert.equal(target.searchParams.get('vocalinstrumental'), 'instrumental');
      const track = (id, ccurl, allowed = true) => ({id: String(id), name: `Calm river ${id}`, duration: 150, artist_name: 'Ana', audio: `https://prod-1.storage.jamendo.com/?trackid=${id}&format=mp31`, audiodownload: allowed ? `https://prod-1.storage.jamendo.com/download/track/${id}/mp32/` : '', audiodownload_allowed: allowed, license_ccurl: ccurl, shareurl: `https://www.jamendo.com/track/${id}`, musicinfo: {tags: {genres: ['ambient'], instruments: ['piano'], vartags: ['calm']}}});
      return json({headers: {status: 'success', code: 0}, results: [track(11, 'http://creativecommons.org/licenses/by/3.0/'), track(12, 'http://creativecommons.org/licenses/by-nc-sa/3.0/'), track(13, 'http://creativecommons.org/licenses/by/3.0/', false)]});
    }
    if (target.hostname === 'prod-1.storage.jamendo.com') return audio(target.search + target.pathname, 400);
    throw new Error(`Unexpected request to ${url}`);
  };
  return {fetch, calls};
}

test('licences: CC0 and CC BY pass; NonCommercial, ShareAlike and NoDerivatives do not', () => {
  assert.deepEqual([licenceOf('http://creativecommons.org/publicdomain/zero/1.0/').code, licenceOf('https://creativecommons.org/licenses/by/4.0/').credit], ['CC0', true]);
  for (const url of ['http://creativecommons.org/licenses/by-nc/3.0/', 'http://creativecommons.org/licenses/by-sa/4.0/', 'http://creativecommons.org/licenses/by-nd/4.0/', 'Sampling+', '']) assert.equal(licenceOf(url).ok, false, url);
});

test('Freesound and Jamendo: the owner\'s confirmation, searches inside the hourly allowance, previews through the program, adds with credits, and empty effect slots filled', async t => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sound-online-'));
  const store = new Store(':memory:', {artifactRoot: dataRoot});
  t.after(() => { store.close(); fs.rmSync(dataRoot, {recursive: true, force: true}); });
  const net = network(), connectors = new ConnectorSlots(store, protector, net.fetch), quota = new QuotaLedger(store);
  const analyze = async file => ({durationSeconds: fs.statSync(file).size > 3000 ? 150 : 1.2, integratedLoudnessLufs: -16, maxVolumeDb: -2});
  const library = new SoundLibrary(store, {dataRoot, analyze}), online = new SoundOnline(store, connectors, library, quota, {fetch: net.fetch, pauseMs: 0});
  // A connection needs the owner's confirmation of the platform's API terms.
  assert.throws(() => connectors.save({name: 'Freesound', provider: 'freesound', key: 'free-key-0123456789'}), /allows your use of its API/);
  const saved = connectors.save({name: 'Freesound', provider: 'freesound', key: 'free-key-0123456789', termsConfirmed: true});
  assert.ok(saved.termsConfirmed.at);
  const tested = await connectors.test(saved.id, saved.revision);
  assert.equal(tested.connector.test.status, 'passed');
  assert.match(tested.result.message, /Freesound answered with 4 result\(s\), 3 under CC0 or CC BY/);
  const ref = {id: tested.connector.id, revision: tested.connector.revision};
  // A search: one request in the hourly allowance, NonCommercial left out, previews through the program.
  const found = await online.search({requestedBy: 'Owner', provider: 'freesound', connector: ref, query: 'whoosh', kind: 'sfx'});
  assert.deepEqual([found.found, found.leftOut, found.results.map(item => item.licence)], [4, 1, ['CC BY 4.0', 'CC0', 'CC BY 4.0']]);
  assert.equal(quota.summary().freesound.used, 1);
  assert.equal(found.results[0].preview, '/api/sound-online/preview?ref=freesound%3A1');
  assert.ok((await online.preview('freesound:1')).bytes.length > 512);
  await assert.rejects(online.preview('freesound:999'), /Search again/);
  // Adding keeps the licence, author, page and credit line; adding again adds nothing.
  const added = await online.add({requestedBy: 'Owner', ref: 'freesound:1', connector: ref});
  assert.equal(added.added, true);
  assert.deepEqual([added.sound.source, added.sound.kind, added.sound.pageUrl], ['freesound', 'sfx', 'https://freesound.org/people/maker/sounds/1/']);
  assert.match(added.sound.licence, /^CC BY 4\.0 \(https:\/\/creativecommons\.org\/licenses\/by\/4\.0\/\) via Freesound$/);
  assert.equal(added.sound.attribution, '"sound 1" by maker (https://freesound.org/people/maker/sounds/1/), CC BY 4.0 https://creativecommons.org/licenses/by/4.0/');
  assert.equal((await online.add({requestedBy: 'Owner', ref: 'freesound:1', connector: ref})).added, false);
  assert.equal((await online.add({requestedBy: 'Owner', ref: 'freesound:2', connector: ref})).sound.attribution, null, 'CC0 needs no credit');
  // A download that leaves the platform's own servers is refused.
  await assert.rejects(online.add({requestedBy: 'Owner', ref: 'freesound:4', connector: ref}), /not on its own servers/);
  // Empty effect slots filled from Freesound: one search per slot, each sound tagged with its slot.
  const before = Object.values(M.pickEffects(library.tracks('sfx'))).filter(Boolean).length;
  const fill = online.queueFill({requestedBy: 'Owner', connector: ref});
  assert.equal(fill.progress.total, Object.keys(M.SFX).length - before);
  assert.equal(await library.processNextImport(), null, 'the folder import worker leaves online jobs alone');
  const filled = await online.processNextFill();
  assert.equal(filled.status, 'completed', JSON.stringify(filled.progress));
  assert.equal(Object.values(M.pickEffects(library.tracks('sfx'))).filter(Boolean).length, Object.keys(M.SFX).length, 'every slot has a sound');
  assert.equal(quota.summary().freesound.used, 1 + fill.progress.total, 'the search and one search per slot (the connection test is outside the allowance)');
  // Jamendo music: CC BY only, and only tracks the artist allows to download.
  const jam = connectors.save({name: 'Jamendo', provider: 'jamendo', key: 'b6747d04', termsConfirmed: true});
  const jamTested = await connectors.test(jam.id, jam.revision);
  assert.equal(jamTested.connector.test.status, 'passed');
  const jamRef = {id: jamTested.connector.id, revision: jamTested.connector.revision};
  const music = await online.search({requestedBy: 'Owner', provider: 'jamendo', connector: jamRef, query: 'calm piano'});
  assert.deepEqual(music.results.map(item => [item.title, item.licence, item.addable]), [['Calm river 11', 'CC BY 3.0', true], ['Calm river 13', 'CC BY 3.0', false]]);
  await assert.rejects(online.add({requestedBy: 'Owner', ref: 'jamendo:13', connector: jamRef}), /does not allow downloading/);
  const track = await online.add({requestedBy: 'Owner', ref: 'jamendo:11', connector: jamRef});
  assert.deepEqual([track.sound.kind, track.sound.tags], ['music', ['ambient', 'calm', 'piano']]);
  assert.match(track.sound.attribution, /^"Calm river 11" by Ana \(https:\/\/www\.jamendo\.com\/track\/11\), CC BY 3\.0/);
  // A connection whose confirmation was never recorded (an older slot) cannot be used.
  const payload = JSON.parse(connectors.row(jam.id).payload);
  store.db.prepare('UPDATE connectors SET payload=? WHERE id=?').run(JSON.stringify({...payload, termsConfirmed: null}), jam.id);
  await assert.rejects(online.search({requestedBy: 'Owner', provider: 'jamendo', connector: jamRef, query: 'calm'}), /no confirmation/);
});

test('the clients send only what each platform needs', async () => {
  const net = network();
  await new FreesoundClient('free-key-0123456789', net.fetch).search('whoosh', {limit: 5});
  await new JamendoClient('b6747d04', net.fetch).search('piano', {limit: 5});
  assert.equal(new URL(net.calls[0].url).searchParams.get('token'), null, 'the Freesound key travels in the header only');
  assert.equal(new URL(net.calls[1].url).searchParams.get('limit'), '5');
});

test('0.74: one click fills the library: the most downloaded effects and music for every mood; a video\'s moods pick its music again', async t => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sound-fill-'));
  const store = new Store(':memory:', {artifactRoot: dataRoot});
  t.after(() => { store.close(); fs.rmSync(dataRoot, {recursive: true, force: true}); });
  const net = network(), connectors = new ConnectorSlots(store, protector, net.fetch), quota = new QuotaLedger(store);
  const analyze = async file => ({durationSeconds: fs.statSync(file).size > 3000 ? 150 : 1.2, integratedLoudnessLufs: -16, maxVolumeDb: -2});
  const library = new SoundLibrary(store, {dataRoot, analyze}), online = new SoundOnline(store, connectors, library, quota, {fetch: net.fetch, pauseMs: 0});
  const saved = connectors.save({name: 'Freesound', provider: 'freesound', key: 'free-key-0123456789', termsConfirmed: true});
  const tested = await connectors.test(saved.id, saved.revision), ref = {id: tested.connector.id, revision: tested.connector.revision};
  // The whole library: every effect slot (the story sounds of 0.87 too) and the 11 moods, one search each.
  const slots = Object.keys(M.SFX).length, fill = online.queueFill({requestedBy: 'Owner', connector: ref, music: 'all', perMood: 2});
  assert.equal(fill.progress.total, slots + Object.keys(M.MOOD_TAGS).length);
  const done = await online.processNextFill();
  assert.equal(done.status, 'completed', JSON.stringify(done.progress));
  const searches = net.calls.filter(call => call.url.includes('/apiv2/search/')).map(call => new URL(call.url).searchParams);
  assert.ok(searches.slice(-(slots + Object.keys(M.MOOD_TAGS).length)).every(params => params.get('sort') === 'downloads_desc'), 'the most downloaded, the most used');
  assert.equal(Object.values(M.pickEffects(library.tracks('sfx'))).filter(Boolean).length, slots);
  assert.ok(Object.values(online.moodCounts()).every(count => count >= 2), JSON.stringify(online.moodCounts()));
  assert.ok(library.tracks('music').every(track => track.attribution === null && track.source === 'freesound'));
  assert.throws(() => online.queueFill({requestedBy: 'Owner', connector: ref, music: 'all', perMood: 2}), /already has every effect and enough music/);
  // One video: its moods need three tracks each; when the fill is done its music is picked again.
  const picked = [];
  online.onFilled = scope => picked.push(scope.contentId);
  const forVideo = online.queueFill({requestedBy: 'Owner', connector: ref, music: ['curious mystery pulse', 'calm piano'], perMood: 3, contentId: 'video-1', effects: false});
  assert.deepEqual(JSON.parse(store.db.prepare('SELECT scope FROM sound_imports WHERE id=?').get(forVideo.id).scope).moods.map(item => item.mood).sort(), ['calm', 'curious', 'sad', 'tense'], 'warm already has three (calm tracks count for warm too)');
  await online.processNextFill();
  assert.deepEqual(picked, ['video-1']);
  assert.throws(() => online.queueFill({requestedBy: 'Owner', connector: ref, music: 'all', perMood: 9}), /1 to 5/);
});

// 0.78 (owner test 2026-10-31: six music searches ended "Freesound did not answer"; "the program will find the music and
// sfx as per the need of usage"): the cause is named, a slow or throttled search gets one more try, and a video's new
// score asks Freesound by itself for the moods it needs.
test('0.78: Freesound failures are named, a slow search is tried once more, and a new score fills the library by itself', async t => {
  const timeout = async () => { throw new DOMException('slow', 'TimeoutError'); };
  await assert.rejects(new FreesoundClient('free-key-0123456789', timeout).search('warm music'), error => /longer than 60 seconds/.test(error.message) && error.retryable === true);
  const throttled = async () => new Response('{}', {status: 429, headers: {'retry-after': '7'}});
  await assert.rejects(new FreesoundClient('free-key-0123456789', throttled).search('warm music'), error => /HTTP 429/.test(error.message) && error.retryAfter === 7);
  await assert.rejects(new FreesoundClient('free-key-0123456789', async () => new Response('{}', {status: 403})).search('x'), error => /refused the API key/.test(error.message) && !error.retryable);

  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sound-auto-'));
  const store = new Store(':memory:', {artifactRoot: dataRoot});
  t.after(() => { store.close(); fs.rmSync(dataRoot, {recursive: true, force: true}); });
  const net = network(), quota = new QuotaLedger(store);
  // The first search for "piano music" (0.90: a cue is searched by its own words first) is slow; its second try answers.
  let slowOnce = true;
  const flaky = async (url, options) => { if (slowOnce && String(url).includes('/apiv2/search/') && new URL(String(url)).searchParams.get('query') === 'piano music') { slowOnce = false; throw new DOMException('slow', 'TimeoutError'); } return net.fetch(url, options); };
  const connectors = new ConnectorSlots(store, protector, flaky);
  const analyze = async file => ({durationSeconds: fs.statSync(file).size > 3000 ? 150 : 1.2, integratedLoudnessLufs: -16, maxVolumeDb: -2});
  const library = new SoundLibrary(store, {dataRoot, analyze}), online = new SoundOnline(store, connectors, library, quota, {fetch: flaky, pauseMs: 0});
  assert.equal(online.autoFill('video-1', [{mood: 'warm', prompt: 'soft piano'}]), null, 'nothing happens without a Freesound connection');
  const saved = connectors.save({name: 'Freesound', provider: 'freesound', key: 'free-key-0123456789', termsConfirmed: true});
  await connectors.test(saved.id, saved.revision);
  const queued = online.autoFill('video-1', [{mood: 'warm', prompt: 'soft piano'}, {mood: 'tense', prompt: 'low pulse'}]);
  assert.ok(queued, 'a new score with moods the library lacks asks Freesound by itself');
  const scope = JSON.parse(store.db.prepare('SELECT scope, created_by FROM sound_imports WHERE id=?').get(queued.id).scope);
  assert.equal(scope.contentId, 'video-1');
  assert.deepEqual(scope.cues.map(cue => [cue.id, cue.mood]), [['cue001', 'warm'], ['cue002', 'tense']], 'each cue of the video is searched (0.90), not just its moods');
  assert.equal(store.db.prepare('SELECT created_by FROM sound_imports WHERE id=?').get(queued.id).created_by, 'Program (automatic)');
  assert.equal(online.autoFill('video-1', [{mood: 'warm'}]), null, 'quiet while an import already runs');
  const done = await online.processNextFill();
  assert.equal(done.progress.failed, 0, JSON.stringify(done.progress.problems));
  assert.equal(net.calls.filter(call => new URL(call.url).searchParams.get('query') === 'piano music').length, 1, 'the slow search was asked once more and answered');
  assert.ok(new URL(net.calls.find(call => call.url.includes('query=piano+music')).url).searchParams.get('page_size') <= 25, 'smaller music searches');
  // The library says where its sounds came from.
  const sources = library.state().bySource;
  assert.equal(sources[0].id, 'freesound');
  assert.ok(sources[0].music >= 2, JSON.stringify(sources));
});

// 0.87 (owner request 2026-11-04): Freesound is asked only for the sounds this video's drawings need, and for music in
// the story's world first ("tribal" for the stone age), then any music of the mood.
test('0.87: a video asks Freesound only for the sounds its drawings need, and for music in its world first', async t => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sound-need-'));
  const store = new Store(':memory:', {artifactRoot: dataRoot});
  t.after(() => { store.close(); fs.rmSync(dataRoot, {recursive: true, force: true}); });
  const net = network(), connectors = new ConnectorSlots(store, protector, net.fetch), quota = new QuotaLedger(store);
  const analyze = async file => ({durationSeconds: fs.statSync(file).size > 3000 ? 150 : 1.2, integratedLoudnessLufs: -16, maxVolumeDb: -2});
  const library = new SoundLibrary(store, {dataRoot, analyze}), online = new SoundOnline(store, connectors, library, quota, {fetch: net.fetch, pauseMs: 0});
  const saved = connectors.save({name: 'Freesound', provider: 'freesound', key: 'free-key-0123456789', termsConfirmed: true});
  await connectors.test(saved.id, saved.revision);
  const before = net.calls.length;
  const job = online.autoFill('video-2', [{mood: 'curious', prompt: 'light pulse under the hook'}], {kinds: ['fire', 'animal'], flavour: 'tribal'});
  const scope = JSON.parse(store.db.prepare('SELECT scope FROM sound_imports WHERE id=?').get(job.id).scope);
  assert.deepEqual([scope.kinds, scope.flavour, scope.contentId], [['fire', 'animal'], 'tribal', 'video-2']);
  const done = await online.processNextFill();
  assert.equal(done.status, 'completed', JSON.stringify(done.progress));
  const queries = net.calls.slice(before).filter(call => call.url.includes('/apiv2/search/')).map(call => new URL(call.url).searchParams.get('query'));
  assert.deepEqual(queries.filter(q => !/music$/.test(q)), ['campfire crackling', 'elephant trumpet'], 'only the effects the drawings need');
  assert.equal(queries.find(q => /music$/.test(q)), 'tribal music', 'the story\'s world first');
  const picked = M.pickEffects(library.tracks('sfx'));
  assert.ok(picked.fire && picked.animal && !picked.whoosh);
  const music = library.tracks('music');
  assert.ok(music.length && music.every(track => track.tags.includes('tribal')) && music.some(track => track.tags.includes('curious')), JSON.stringify(music.map(track => track.tags)));
});

// 0.90 (owner request 2026-11-04: "the program should search Freesound according to the video, not random music or
// sfx that never match"): each cue is searched by its own words, each story sound for the thing on screen, the found
// track goes to its cue, nothing is searched twice, and a recent video's tracks are not used again.
test('0.90: Freesound is searched per cue and per thing on screen; each cue keeps the track found for it', async t => {
  const {cueSearch, rankFound, subjectQueries} = require('../sound-online');
  const pizz = cueSearch({mood: 'curious', prompt: 'Light pizzicato strings and soft marimba, 96 BPM, no vocals'}, 'tribal');
  assert.deepEqual(pizz.queries, ['tribal pizzicato music', 'tribal curious music', 'curious tribal music']);
  assert.ok(['tribal', 'pizzicato', 'strings', 'marimba', 'curious'].every(word => pizz.want.includes(word)), pizz.want.join(' '));
  const free = cueSearch({mood: 'curious', prompt: 'Instrumental background music for a YouTube video about stone age finance: curious, tribal, cinematic, steady groove'});
  assert.ok(free.queries.every(q => !/stone|finance|youtube/.test(q)), `topic words are never searched: ${free.queries}`);
  assert.deepEqual(subjectQueries('animal', 'mammoth'), ['elephant trumpet']);
  assert.deepEqual(subjectQueries('fire', 'cave'), ['cave fire crackling', 'campfire crackling']);
  const ranked = rankFound([{id: 'a', tags: ['music'], title: 'loop', downloads: 90000}, {id: 'b', tags: ['tribal', 'drums'], title: 'tribal drums', downloads: 40}], ['tribal', 'drums']);
  assert.equal(ranked[0].id, 'b', 'a sound that says what the video needs beats a merely popular one');

  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sound-video-'));
  const store = new Store(':memory:', {artifactRoot: dataRoot});
  t.after(() => { store.close(); fs.rmSync(dataRoot, {recursive: true, force: true}); });
  const net = network(), connectors = new ConnectorSlots(store, protector, net.fetch), quota = new QuotaLedger(store);
  const analyze = async file => ({durationSeconds: fs.statSync(file).size > 3000 ? 150 : 1.2, integratedLoudnessLufs: -16, maxVolumeDb: -2});
  const library = new SoundLibrary(store, {dataRoot, analyze}), online = new SoundOnline(store, connectors, library, quota, {fetch: net.fetch, pauseMs: 0});
  const saved = connectors.save({name: 'Freesound', provider: 'freesound', key: 'free-key-0123456789', termsConfirmed: true});
  await connectors.test(saved.id, saved.revision);
  const filled = [];
  online.onFilled = scope => filled.push(scope);
  const cues = [{id: 'cue001', mood: 'curious', prompt: 'Light pizzicato strings and soft marimba', start: 0, end: 40}, {id: 'cue002', mood: 'dramatic', prompt: 'Big taiko drums and low brass', start: 40, end: 90}];
  const needs = {kinds: [], subjects: [{kind: 'fire', subject: 'campfire'}, {kind: 'animal', subject: 'mammoth'}, {kind: 'waves', subject: 'harbor'}], flavour: 'tribal', recent: []};
  const before = net.calls.length;
  assert.ok(online.autoFill('video-3', cues, needs));
  const done = await online.processNextFill();
  assert.equal(done.progress.failed, 0, JSON.stringify(done.progress.problems));
  const queries = net.calls.slice(before).filter(call => call.url.includes('/apiv2/search/')).map(call => new URL(call.url).searchParams.get('query'));
  assert.deepEqual(queries, ['campfire crackling', 'elephant trumpet', 'harbor seagulls water', 'tribal pizzicato music', 'tribal taiko music']);
  const sfx = library.tracks('sfx');
  assert.ok(M.subjectEffect(sfx, 'fire', 'campfire') && M.subjectEffect(sfx, 'animal', 'mammoth') && M.subjectEffect(sfx, 'waves', 'harbor'), 'each thing on screen has its own sound');
  assert.equal(M.subjectEffect(sfx, 'waves', 'ocean'), null, 'another thing does not take it');
  const picks = filled[0].picks;
  assert.ok(picks.cue001.track && picks.cue002.track && picks.cue001.track !== picks.cue002.track, JSON.stringify(picks));
  assert.ok(library.tracks('music').find(track => track.id === picks.cue002.track).tags.includes('taiko'), 'the track carries the words it was found by');
  // Asked again for the same video: the library already answers every cue and thing, so nothing is searched.
  assert.equal(online.autoFill('video-3', cues, needs), null);
  assert.throws(() => online.autoFill('video-3', cues, needs, 'Owner', {strict: true}), /already has music for every cue/);
  // The next video with the same cues: the tracks of recent videos are avoided, so it gets new ones.
  assert.ok(online.autoFill('video-4', cues, {...needs, subjects: [], recent: [picks.cue001.track, picks.cue002.track]}));
  await online.processNextFill();
  const next = filled[1].picks;
  assert.ok(next.cue001.track !== picks.cue001.track && next.cue002.track !== picks.cue002.track, JSON.stringify(next));
  // 0.95 (owner: "why is the program forced to use the music in my library?"): every new video is searched on Freesound by
  // its own cues, even when the library already holds a track of that mood.
  assert.ok(online.autoFill('video-5', cues, {...needs, subjects: []}), 'a new video searches Freesound for its own cues');
});
