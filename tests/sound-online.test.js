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
      // The slot fill: one CC0 sound per query, named for it.
      const id = 100 + Math.abs([...q].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % 100000;
      return json({results: [sound(id, 'http://creativecommons.org/publicdomain/zero/1.0/', {name: `${q}.wav`, tags: q.split(' '), duration: 0.8})]});
    }
    if (target.hostname === 'cdn.freesound.org') {
      if (target.pathname === '/redirect/4.mp3') return new Response(null, {status: 302, headers: {location: 'https://evil.example/4.mp3'}});
      return audio(target.pathname);
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
  const library = new SoundLibrary(store, {dataRoot, analyze}), online = new SoundOnline(store, connectors, library, quota, {fetch: net.fetch});
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
  assert.equal(fill.progress.total, 20 - before);
  assert.equal(await library.processNextImport(), null, 'the folder import worker leaves online jobs alone');
  const filled = await online.processNextFill();
  assert.equal(filled.status, 'completed', JSON.stringify(filled.progress));
  assert.equal(Object.values(M.pickEffects(library.tracks('sfx'))).filter(Boolean).length, 20, 'every slot has a sound');
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
