'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {WindowsVault, YouTubeResearch, channelFilter} = require('../youtube');
const {createApp} = require('../server');

const key = 'AIza' + 'x'.repeat(35); // Nonfunctional fixture; never sent to Google.
const channelId = 'UC' + 'a'.repeat(22);
const payload = {items: [{id: channelId, snippet: {title: 'Fixture <script>text</script>', description: 'A synthetic test channel.'}, statistics: {viewCount: '9007199254740993123', subscriberCount: '12000', videoCount: '40'}}]};
const response = () => Response.json(payload);
function memoryVault() {
  let value = key;
  return {status: () => ({supported: true, saved: !!value}), get: () => {if (!value) throw new Error('Missing fixture'); return value;}, set: next => {value = next;}, remove: () => {value = null;}};
}
function temp(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'control-room-vault-test-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('control-room-vault-test-'));
    fs.rmSync(directory, {recursive: true, force: true});
  });
  return directory;
}

test('channel inputs accept only public channel identifiers, never arbitrary fetch targets', () => {
  for (const value of ['@GoogleDevelopers', 'https://www.youtube.com/@GoogleDevelopers']) assert.deepEqual(channelFilter(value), {forHandle: '@GoogleDevelopers'});
  assert.deepEqual(channelFilter(`https://youtube.com/channel/${channelId}/`), {id: channelId});
  assert.deepEqual(channelFilter('@Español'), {forHandle: '@Español'});
  for (const value of ['https://youtube.com.evil.test/@name', 'https://youtube.com:444/@name', 'https://user:password@youtube.com/@name', 'https://youtube.com/@name?key=secret', 'https://youtube.com/watch?v=x', 'http://127.0.0.1/private', '@a/b', '@ab', 'https://youtube.com/@%ZZ', {}, null]) assert.throws(() => channelFilter(value));
});

test('lookup makes exactly one fixed-origin request and never exposes the API key', async () => {
  let calls = 0;
  const research = new YouTubeResearch(memoryVault(), async (url, options) => {
    calls++; assert.equal(url.origin, 'https://www.googleapis.com');
    assert.equal(url.pathname, '/youtube/v3/channels');
    assert.equal(url.searchParams.get('forHandle'), '@fixture');
    assert.equal(options.headers['x-goog-api-key'], key);
    assert.equal(url.toString().includes(key), false); assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal); return response();
  });
  const result = await research.lookup('@fixture');
  assert.equal(calls, 1); assert.equal(result.views, '9007199254740993123');
  assert.equal(result.access, 'public_metadata_only'); assert.equal(result.id, channelId);
  assert.equal(result.country, null); assert.equal(research.status().check.status, 'verified');
  assert.equal(JSON.stringify([result, research.status()]).includes(key), false);
});

test('hidden and missing metrics remain unavailable rather than zero', async () => {
  const data = structuredClone(payload); data.items[0].statistics = {hiddenSubscriberCount: true, subscriberCount: '12000'};
  const result = await new YouTubeResearch(memoryVault(), async () => Response.json(data)).lookup('@fixture');
  assert.equal(result.subscribers, null); assert.equal(result.views, null); assert.equal(result.videos, null);
});

test('provider denial and transport errors never echo upstream secrets or retry', async () => {
  for (const status of [400, 401, 403, 404, 429, 500]) {
    let calls = 0;
    const research = new YouTubeResearch(memoryVault(), async () => {calls++; return Response.json({error: {message: key}}, {status});});
    await assert.rejects(research.lookup('@fixture'), error => error.status === 502 && !error.message.includes(key));
    assert.equal(calls, 1); assert.equal(research.status().check.status, 'failed'); assert.equal(research.busy, false);
  }
  await assert.rejects(new YouTubeResearch(memoryVault(), async () => {throw new Error(key);}).lookup('@fixture'), error => !error.message.includes(key) && error.status === 502);
});

test('missing, mismatched, oversized and malformed channel responses fail closed', async () => {
  for (const data of [{}, {items: []}, {items: [{id: 'wrong', snippet: {title: 'x'}}]}, {items: [{id: 'UC'+'b'.repeat(22), snippet: {title: 'x'}}]}]) {
    await assert.rejects(new YouTubeResearch(memoryVault(), async () => Response.json(data)).lookup(channelId));
  }
  for (const body of ['not json', 'x'.repeat(131073)]) {
    await assert.rejects(new YouTubeResearch(memoryVault(), async () => new Response(body)).lookup('@fixture'), {status: 502});
  }
});

test('concurrent lookups and key changes cannot mix credentials in flight', async () => {
  let release;
  const research = new YouTubeResearch(memoryVault(), () => new Promise(resolve => {release = resolve;}));
  const pending = research.lookup('@fixture');
  await assert.rejects(research.lookup('@another'), {status: 409});
  assert.throws(() => research.save(key), {status: 409}); assert.throws(() => research.forget(), {status: 409});
  release(response()); await pending;
  research.save(key); assert.equal(research.status().check, null);
  research.forget(); assert.equal(research.status().saved, false);
});

test('invalid keys and invalid channel inputs cause no provider call or key overwrite', async () => {
  const vault = memoryVault(); let calls = 0;
  const research = new YouTubeResearch(vault, async () => {calls++; return response();});
  for (const invalid of ['', key+'\n', null, 'short', '<script>'+'x'.repeat(40)]) assert.throws(() => research.save(invalid));
  await assert.rejects(research.lookup('https://evil.test')); assert.equal(calls, 0); assert.equal(vault.get(), key);
});

test('Windows vault encrypts, survives reopen, replaces, rejects corruption and forgets', {skip: process.platform !== 'win32'}, t => {
  const directory = temp(t), vault = new WindowsVault(directory);
  assert.equal(vault.status().saved, false); assert.throws(() => vault.get(), {status: 409});
  vault.set(key); assert.equal(fs.readFileSync(vault.file).includes(Buffer.from(key)), false);
  assert.equal(new WindowsVault(directory).get(), key);
  const next = 'AIza'+'y'.repeat(35); vault.set(next); assert.equal(vault.get(), next);
  assert.throws(() => vault.set('invalid')); assert.equal(vault.get(), next);
  fs.writeFileSync(vault.file, 'corrupt'); assert.throws(() => vault.get(), {status: 503});
  vault.remove(); vault.remove(); assert.equal(vault.status().saved, false);
  assert.deepEqual(fs.readdirSync(directory), []);
});

test('HTTP key and lookup routes enforce local tokens and keep secret data out of responses', async t => {
  let app;
  t.after(() => app && new Promise(resolve => {app.server.close(resolve); app.server.closeIdleConnections();}));
  const directory = temp(t), vault = memoryVault(); vault.remove();
  app = createApp({dataFile: path.join(directory, 'test.sqlite'), worker: false, research: new YouTubeResearch(vault, async () => response())});
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const state = await (await fetch(base+'/api/state')).json();
  const post = (route, body, token=state.token) => fetch(base+route, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Local-Token': token}, body: JSON.stringify(body)});
  for (const route of ['/api/youtube/key', '/api/youtube/forget', '/api/youtube/channel']) assert.equal((await post(route, {key, channel: '@fixture'}, '')).status, 403);
  const saved = await (await post('/api/youtube/key', {key})).json(); assert.equal(saved.saved, true); assert.equal(saved.check, null); assert.equal(JSON.stringify(saved).includes(key), false);
  const found = await (await post('/api/youtube/channel', {channel: '@fixture'})).json(); assert.equal(found.id, channelId);
  const after = await (await fetch(base+'/api/state')).json(); assert.equal(after.capabilities.youtube, 'not_connected'); assert.equal(JSON.stringify(after).includes(key), false);
  for (const route of ['/youtube-key.dpapi', '/scripts/Protect-Secret.ps1', '/data/youtube-key.dpapi', '/constructor', '/__proto__']) assert.equal((await fetch(base+route)).status, 404);
  assert.equal((await post('/api/youtube/forget', {})).status, 200); assert.equal(vault.status().saved, false);
});
