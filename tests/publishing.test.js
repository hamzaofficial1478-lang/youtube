'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {randomBytes} = require('node:crypto');
const {Store} = require('../store');
const {ConnectorSlots} = require('../connectors');
const {QuotaLedger} = require('../intel-sources');
const {PublishingRoom} = require('../publishing-room');
const G = require('../publishing');
const R = require('../render');

const story = ['In 1602, a group of Dutch merchants did something no one had ever tried. They sold small pieces of one company to anyone who wanted to buy. Their ships sailed from Amsterdam to Indonesia, a voyage of eight months, for pepper, nutmeg and cloves.', 'A single bag of nutmeg could sell in Europe for sixty times what it cost on the islands. Within ten years, the shares were worth three times what people had paid. But one ship lost at sea could wipe out a whole year of profit.', 'So the merchants did something clever: they split every voyage between hundreds of owners. A ledger from 1609 records a loss that no single family could have survived. By 1700, the company had 40,000 employees, its own coins and its own army.', 'It could sign treaties and fight wars like a country. Then debts, smuggling and war slowly drained it, and in 1799 it was dissolved. Yet every stock you can buy today still works the way those merchants planned.'].join('\n\n');
const CHANNEL = 'UCabcdefghijklmnopqrstuv';

// A stand-in for Google: sign-in, channel identity, one resumable session per upload, processing and recent uploads.
function fakeGoogle() {
  const g = {calls: [], sessions: new Map(), metadata: [], refreshRefused: false, dropAt: null, down: false, expire: false, processing: 1, uploads: [], revoked: [], thumbnails: 0, thumbnailRefusals: 0, captions: [], dropCaption: false, status: {privacyStatus: 'private', license: 'youtube', embeddable: true, publicStatsViewable: true, selfDeclaredMadeForKids: false, containsSyntheticMedia: true, uploadStatus: 'processed'}};
  const reply = (status, body, headers = {}) => new Response(body === null ? null : JSON.stringify(body), {status, headers: {'content-type': 'application/json', ...headers}});
  g.fetch = async (url, init = {}) => {
    const u = new URL(url), method = init.method || 'GET';
    assert.equal(init.redirect, 'error', 'no Google call may follow a redirect');
    g.calls.push(`${method} ${u.host}${u.pathname}`);
    if (u.href === 'https://oauth2.googleapis.com/token') {
      const p = new URLSearchParams(init.body);
      if (p.get('grant_type') === 'authorization_code') return p.get('code') === 'good-code' && p.get('code_verifier')?.length >= 43 ? reply(200, {access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3600, scope: G.SCOPES.join(' ')}) : reply(400, {error: 'invalid_grant'});
      return g.refreshRefused ? reply(400, {error: 'invalid_grant'}) : reply(200, {access_token: 'access-2', expires_in: 3600});
    }
    if (u.href === 'https://oauth2.googleapis.com/revoke') { g.revoked.push(new URLSearchParams(init.body).get('token')); return reply(200, {}); }
    if (u.pathname === '/youtube/v3/channels') return reply(200, {items: [{id: CHANNEL, snippet: {title: 'Money Stories', customUrl: '@moneystories', thumbnails: {default: {url: 'https://yt3.ggpht.com/a'}}}, contentDetails: {relatedPlaylists: {uploads: 'UUabcdefghijklmnopqrstuv'}}}]});
    if (u.pathname === '/upload/youtube/v3/videos' && method === 'POST') {
      const id = `s${g.sessions.size + 1}`;
      g.sessions.set(id, {size: Number(init.headers['X-Upload-Content-Length']), bytes: []});
      g.metadata.push(JSON.parse(init.body));
      return reply(200, null, {location: `https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=${id}`});
    }
    if (u.pathname === '/upload/youtube/v3/videos' && method === 'PUT') {
      const session = g.sessions.get(u.searchParams.get('upload_id')), range = init.headers['Content-Range'];
      if (g.down) throw new TypeError('network down');
      if (g.expire || !session) return reply(404, {error: {errors: [{reason: 'notFound'}]}});
      const received = session.bytes.reduce((sum, item) => sum + item.length, 0), done = () => reply(201, {id: `vid${String(g.sessions.size).padStart(8, '0')}`, status: {uploadStatus: 'uploaded'}});
      const where = () => received ? reply(308, null, {range: `bytes=0-${received - 1}`}) : reply(308, null);
      if (range.startsWith('bytes */')) return received === session.size ? done() : where();
      const [, start] = /bytes (\d+)-/.exec(range);
      assert.equal(Number(start), received, 'every chunk continues exactly where Google stopped');
      session.bytes.push(Buffer.from(init.body));
      const now = received + init.body.length;
      // Google kept this chunk, but the answer is lost on the way back.
      if (g.dropAt === Number(start)) { g.dropAt = null; throw new TypeError('connection reset'); }
      return now === session.size ? done() : reply(308, null, {range: `bytes=0-${now - 1}`});
    }
    if (u.pathname === '/upload/youtube/v3/thumbnails/set') { g.thumbnails++; assert.equal(init.headers['Content-Type'], 'image/jpeg'); return g.thumbnailRefusals-- > 0 ? reply(403, {error: {errors: [{reason: 'forbidden'}]}}) : reply(200, {items: [{default: {url: 'https://i.ytimg.com/x.jpg'}}]}); }
    if (u.pathname === '/upload/youtube/v3/captions') { const body = Buffer.from(init.body).toString('utf8'); g.captionBody = body.split('application/octet-stream\r\n\r\n')[1]; const meta = JSON.parse(/\{"snippet"[^\r]*/.exec(body)[0]); g.captions.push({id: `cap${g.captions.length + 1}`, snippet: meta.snippet}); if (g.dropCaption) { g.dropCaption = false; throw new TypeError('connection reset'); } return reply(200, {id: g.captions.at(-1).id}); }
    if (u.pathname === '/youtube/v3/captions') return reply(200, {items: g.captions});
    if (u.pathname === '/youtube/v3/videos' && method === 'PUT') { const body = JSON.parse(init.body); g.status = body.status; return reply(200, {id: body.id, status: body.status}); }
    if (u.pathname === '/youtube/v3/videos' && u.searchParams.get('part') === 'status') return reply(200, {items: [{status: g.status}]});
    if (u.pathname === '/youtube/v3/videos') return reply(200, {items: [{status: {uploadStatus: g.processing-- > 0 ? 'uploaded' : 'processed', privacyStatus: 'private'}, processingDetails: {processingStatus: g.processing >= 0 ? 'processing' : 'succeeded'}}]});
    if (u.pathname === '/youtube/v3/playlistItems') return reply(200, {items: g.uploads});
    throw new Error(`unexpected Google call ${method} ${u.href}`);
  };
  return g;
}

function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'y01-'));
  const store = new Store(':memory:', {artifactRoot: root});
  t.after(() => { store.close(); fs.rmSync(root, {recursive: true, force: true}); });
  const family = store.saveFamily({name: 'Money Stories', tier: 'A', countries: ['United States', 'Mexico'], audience: 'Curious adults who like money history told as stories.', niche: 'Origins of money', locales: ['en-US', 'es-419'], timezone: 'Asia/Karachi', monthlyBudget: 50, cadence: 2, format: 'long-form', monthlyTokenLimit: 2000000, scriptTokenLimit: 8000, researchTokenLimit: 8000});
  let content = store.saveContent({familyId: family.id, title: 'The first company you could own', kind: 'fiction', angle: 'How the Dutch East India Company invented shares.', hook: 'In 1602, a group of Dutch merchants did something no one had ever tried.', script: story, targetMinutes: 1, sources: [], rightsConfirmed: true});
  store.reviewContent(content.id, {revision: content.revision, action: 'submit'});
  content = store.reviewContent(content.id, {revision: content.revision, action: 'approve'});
  const g = fakeGoogle(), connectors = new ConnectorSlots(store, {transform: (op, input) => Buffer.from(input)}, g.fetch);
  const client = connectors.save({name: 'Google client', provider: 'youtube-oauth', clientId: '123456789-abcdefgh12345678.apps.googleusercontent.com', key: 'GOCSPX-fixture-client-secret'});
  // The approved deliverables: a 20 MB master and a 9 MB Spanish edition (three and two upload chunks).
  const files = {m1: path.join(root, 'master.mp4'), e1: path.join(root, 'edition.mp4')};
  fs.writeFileSync(files.m1, randomBytes(20 * 1024 * 1024)); fs.writeFileSync(files.e1, randomBytes(9 * 1024 * 1024));
  const ok = {master: true, release: true};
  // The approved thumbnail and the edit's captions travel with the deliverable.
  fs.writeFileSync(path.join(root, 'thumb.jpg'), randomBytes(120 * 1024));
  const captions = {groups: [{start: 0, end: 2.5, lines: ['In 1602 a group of Dutch merchants']}, {start: 2.5, end: 5, lines: ['did something no one had tried.']}]};
  const renders = {file: id => ({file: files[id], size: fs.statSync(files[id]).size}), localFile: relative => path.join(root, relative), row: id => ({result: JSON.stringify({video: {sha256: R.fileSha256(files[id])}}), scope: JSON.stringify({edit: {timeline: {captions}}, edition: {package: {title: 'La primera empresa', description: 'Cómo nacieron las acciones.', tags: ['historia']}}})}), masterApproval: () => ({id: 'approval-1', current: ok.master})};
  const localization = {approvedMaster: () => (ok.master ? {id: 'm1'} : null), currentRelease: () => (ok.release ? {renderId: 'e1', releaseId: 'release-1'} : null), latestVoice: () => null, voiceOf: () => null};
  const packaging = {latestRow: () => ({payload: JSON.stringify({titles: [{id: 't1', text: 'The first company you could own'}], chosenTitle: 't1', chosenThumbnail: 'k1', tags: ['history'], disclosure: {synthetic: true}}), images: JSON.stringify({k1: {relativePath: 'thumb.jpg', sha256: R.fileSha256(path.join(root, 'thumb.jpg'))}}), checks: JSON.stringify({description: 'How shares began.\n\nVisuals: stock footage.'})})};
  const room = new PublishingRoom(store, connectors, {renders, packaging, localization, quota: new QuotaLedger(store), wait: async () => {}});
  return {store, family, content, g, connectors, client, room, ok, root};
}
async function connected(env, locale = 'en-US') {
  const {room, family, client} = env;
  const {url} = room.connect({requestedBy: 'Owner', familyId: family.id, locale, connectorId: client.id}, 'http://127.0.0.1:3456');
  const state = new URL(url).searchParams.get('state');
  const result = await room.callback(new URLSearchParams({state, code: 'good-code'}));
  assert.equal(result.ok, true, result.message);
  const pending = room.state().families[0].locales.find(item => item.locale === locale).pending[0];
  return room.confirm(pending.id, {confirmedBy: 'Owner', channelId: CHANNEL, confirmed: true});
}

test('Y01: a channel is connected through Google\'s sign-in and confirmed by name; no secret ever leaves the program', async t => {
  const env = setup(t), {room, family, client, g, store} = env;
  assert.throws(() => room.connect({requestedBy: 'Owner', familyId: family.id, locale: 'en-US', connectorId: client.id}, 'https://evil.example'), /127\.0\.0\.1/);
  assert.throws(() => room.connect({requestedBy: 'Owner', familyId: family.id, locale: 'fr-FR', connectorId: client.id}, 'http://127.0.0.1:3456'), /not one of this family's languages/);
  const {url} = room.connect({requestedBy: 'Owner', familyId: family.id, locale: 'en-US', connectorId: client.id}, 'http://127.0.0.1:3456');
  const auth = new URL(url);
  assert.equal(auth.origin + auth.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.deepEqual([auth.searchParams.get('redirect_uri'), auth.searchParams.get('code_challenge_method'), auth.searchParams.get('access_type'), auth.searchParams.get('scope')], ['http://127.0.0.1:3456/oauth/youtube/callback', 'S256', 'offline', G.SCOPES.join(' ')]);
  assert.equal((await room.callback(new URLSearchParams({state: 'forged', code: 'good-code'}))).ok, false, 'a forged state is refused');
  const state = auth.searchParams.get('state');
  const result = await room.callback(new URLSearchParams({state, code: 'good-code'}));
  assert.deepEqual([result.ok, result.channels[0].id, result.channels[0].title], [true, CHANNEL, 'Money Stories']);
  assert.equal((await room.callback(new URLSearchParams({state, code: 'good-code'}))).ok, false, 'a sign-in link works once');
  const pending = room.state().families[0].locales[0].pending[0];
  assert.equal(pending.status, 'pending');
  assert.equal(room.state().families[0].locales[0].active, null, 'nothing is bound before the owner confirms');
  assert.throws(() => room.confirm(pending.id, {confirmedBy: 'Owner', channelId: CHANNEL}), /Confirm that "Money Stories"/);
  assert.throws(() => room.confirm(pending.id, {confirmedBy: 'Owner', channelId: 'UCzzzzzzzzzzzzzzzzzzzzzz', confirmed: true}), /channels Google returned/);
  const binding = room.confirm(pending.id, {confirmedBy: 'Owner', channelId: CHANNEL, confirmed: true});
  assert.deepEqual([binding.status, binding.channelTitle], ['active', 'Money Stories']);
  const visible = JSON.stringify([room.state(), env.connectors.list(), store.state()]);
  for (const secret of ['refresh-1', 'access-1', 'GOCSPX-fixture-client-secret']) assert.ok(!visible.includes(secret), `${secret} never appears in what the page receives`);
  // A second sign-in for the same language replaces the first one, whose access is revoked at Google.
  await connected(env);
  assert.deepEqual(g.revoked, ['refresh-1']);
  assert.equal(store.db.prepare("SELECT count(*) AS n FROM youtube_bindings WHERE status='active'").get().n, 1);
});

test('Y01: the approved master uploads privately in resumable chunks, survives a lost answer, is checked until processed and never twice', async t => {
  const env = setup(t), {room, content, g, store, ok} = env;
  await connected(env);
  const queue = extra => room.queueUpload(content.id, {requestedBy: 'Owner', locale: 'en-US', categoryId: 27, ...extra});
  assert.throws(() => queue({}), /made for kids/);
  ok.master = false;
  assert.throws(() => queue({madeForKids: false}), /Approve the final master in Room 10/);
  ok.master = true;
  const queued = queue({madeForKids: false});
  assert.deepEqual([queued.status, queued.kind, queued.privacy, queued.title], ['queued', 'master', 'private', 'The first company you could own']);
  assert.throws(() => queue({madeForKids: false}), /already has an upload record \(queued\)[\s\S]*never uploaded blindly/);
  g.dropAt = 8 * 1024 * 1024; // the answer to the second chunk is lost
  const done = await room.processNext();
  assert.equal(done.status, 'uploaded', room.publicationRow(queued.id).error);
  const session = [...g.sessions.values()][0];
  assert.ok(Buffer.concat(session.bytes).equals(fs.readFileSync(path.join(env.root, 'master.mp4'))), 'YouTube received exactly the approved file');
  assert.deepEqual(g.metadata[0].status, {privacyStatus: 'private', selfDeclaredMadeForKids: false, containsSyntheticMedia: true, embeddable: true});
  assert.deepEqual([g.metadata[0].snippet.categoryId, g.metadata[0].snippet.defaultAudioLanguage, g.metadata[0].snippet.description], ['27', 'en-US', 'How shares began.\n\nVisuals: stock footage.']);
  assert.ok(g.calls.includes('PUT www.googleapis.com/upload/youtube/v3/videos'));
  assert.equal(room.quota.summary().youtubeUploads.used, 1);
  // Processing is checked (1 unit each) until YouTube reports it processed.
  const first = await room.checkNext(queued.id);
  assert.deepEqual([first.status, first.processing.processingStatus], ['processing', 'processing']);
  const second = await room.checkNext(queued.id);
  assert.equal(second.status, 'processed');
  assert.equal(second.studioUrl, `https://studio.youtube.com/video/${second.videoId}/edit`);
  assert.equal(room.quota.summary().youtube.used, 2);
  assert.throws(() => queue({madeForKids: false}), /already has an upload record \(processed\)/);
  assert.throws(() => room.discard(queued.id, {requestedBy: 'Owner'}), /without a video/);
  // Google refusing the saved access pauses this channel until it is connected again.
  g.refreshRefused = true; room.tokens.clear();
  await assert.rejects(room.checkNext(queued.id).then(row => { if (row.error) throw new Error(row.error); }), /Connect the channel again/);
  assert.equal(room.state().families[0].locales[0].active.status, 'reconnect');
  assert.equal(store.db.prepare("SELECT status FROM youtube_bindings WHERE status='reconnect'").get().status, 'reconnect');
});

test('Y01: a stopped upload resumes from where Google says it stopped; a lost session is reconciled before anything is sent again', async t => {
  const env = setup(t), {room, content, g, store, connectors} = env;
  await connected(env, 'es-419');
  const queue = () => room.queueUpload(content.id, {requestedBy: 'Owner', locale: 'es-419', categoryId: 27, madeForKids: false});
  const first = queue();
  // The network goes down after the first chunk: the session and the progress are kept.
  const fetch = g.fetch;
  let chunks = 0;
  room.fetch = async (url, init) => { if (init?.method === 'PUT' && !String(init.headers['Content-Range']).startsWith('bytes */') && ++chunks === 2) g.down = true; return fetch(url, init); };
  assert.equal(await room.processNext(), null);
  let row = room.publicationRow(first.id);
  assert.deepEqual([row.status, row.sent, !!row.session], ['interrupted', 8 * 1024 * 1024, true]);
  assert.match(row.error, /session is kept/);
  g.down = false;
  // A program stop while uploading marks the record interrupted; resuming asks Google and continues.
  store.db.prepare("UPDATE publications SET status='uploading' WHERE id=?").run(first.id);
  const restarted = new (require('../publishing-room').PublishingRoom)(store, connectors, {renders: room.renders, packaging: room.packaging, localization: room.localization, quota: room.quota, wait: async () => {}});
  restarted.fetch = fetch;
  assert.equal(restarted.publicationRow(first.id).status, 'interrupted');
  restarted.resume(first.id, {});
  const done = await restarted.processNext();
  assert.deepEqual([done.status, done.kind, done.title], ['uploaded', 'edition', 'La primera empresa']);
  assert.equal(g.sessions.size, 1, 'one session, one copy');
  assert.equal(g.metadata[0].snippet.defaultAudioLanguage, 'es-419');

  // Another upload whose session Google forgets: its outcome is unknown until the channel is reconciled.
  store.db.prepare("UPDATE publications SET status='discarded', video_id=NULL WHERE id=?").run(first.id);
  const second = queue();
  g.down = true;
  assert.equal(await restarted.processNext(), null);
  g.down = false; g.expire = true;
  restarted.resume(second.id, {});
  assert.equal((await restarted.processNext()).status, 'unknown');
  assert.throws(() => restarted.discard(second.id, {requestedBy: 'Owner'}), /Reconcile the channel first/);
  assert.throws(() => queue(), /already has an upload record \(unknown\)/, 'no second copy while the first may be on the channel');
  // Two videos with this title appeared after the upload started: the owner names the right one.
  const started = restarted.publicationRow(second.id).started_at;
  g.uploads = [{contentDetails: {videoId: 'aaaaaaaaaaa', videoPublishedAt: started}, snippet: {title: 'La primera empresa'}}, {contentDetails: {videoId: 'bbbbbbbbbbb', videoPublishedAt: started}, snippet: {title: 'La primera empresa'}}, {contentDetails: {videoId: 'ccccccccccc', videoPublishedAt: '2020-01-01T00:00:00Z'}, snippet: {title: 'La primera empresa'}}];
  let reconciled = await restarted.reconcile(second.id, {requestedBy: 'Owner'});
  assert.deepEqual([reconciled.status, reconciled.candidates.map(item => item.videoId)], ['unknown', ['aaaaaaaaaaa', 'bbbbbbbbbbb']]);
  assert.throws(() => restarted.choose(second.id, {requestedBy: 'Owner', videoId: 'ccccccccccc'}), /Choose one of the videos/);
  assert.equal(restarted.choose(second.id, {requestedBy: 'Owner', videoId: 'bbbbbbbbbbb'}).videoId, 'bbbbbbbbbbb');
  // None found: only then may the record be discarded and the language uploaded again.
  store.db.prepare("UPDATE publications SET status='unknown', video_id=NULL, candidates=NULL WHERE id=?").run(second.id);
  g.uploads = [];
  reconciled = await restarted.reconcile(second.id, {requestedBy: 'Owner'});
  assert.match(reconciled.error, /No video with this title/);
  assert.equal(restarted.discard(second.id, {requestedBy: 'Owner'}).status, 'discarded');
  g.expire = false;
  assert.equal(queue().status, 'queued');
});

test('Y02: the approved thumbnail and captions attach after processing (each retried alone), the video is scheduled in a chosen time zone and observed going public', async t => {
  const env = setup(t), {room, content, g, store} = env;
  await connected(env);
  const queued = room.queueUpload(content.id, {requestedBy: 'Owner', locale: 'en-US', categoryId: 27, madeForKids: false});
  await room.processNext();
  await room.checkNext(queued.id);
  // The channel is not verified for custom thumbnails yet, and the answer to the caption upload is lost.
  g.thumbnailRefusals = 1; g.dropCaption = true;
  assert.equal((await room.checkNext(queued.id)).status, 'processed');
  assert.deepEqual(room.publicPublication(room.publicationRow(queued.id)).attachments, {thumbnail: {status: 'pending'}, captions: {status: 'pending'}});
  await room.processNext(); await room.processNext();
  let row = room.publicPublication(room.publicationRow(queued.id));
  assert.equal(row.attachments.thumbnail.status, 'failed');
  assert.match(row.attachments.thumbnail.error, /verified by phone/);
  assert.equal(row.attachments.captions.status, 'unknown');
  assert.equal(g.captions.length, 1, 'YouTube did receive the captions');
  assert.match(g.captionBody, /1\n00:00:00,000 --> 00:00:02,500\nIn 1602 a group/);
  // Each attachment is retried alone; the captions are looked up first, so the track is never added twice.
  const tomorrow = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date(Date.now() + 2 * 86400000));
  const schedule = extra => room.schedule(queued.id, {scheduledBy: 'Owner', local: `${tomorrow}T20:00`, timeZone: 'Asia/Karachi', confirmations: {settings: true, audit: true}, ...extra});
  await assert.rejects(schedule({}), /custom thumbnail did not attach[\s\S]*confirm scheduling without it/);
  row = await room.retryAttachment(queued.id, {kind: 'thumbnail'});
  assert.deepEqual([row.attachments.thumbnail.status, g.thumbnails], ['done', 2]);
  row = await room.retryAttachment(queued.id, {kind: 'captions'});
  assert.deepEqual([row.attachments.captions.status, g.captions.length], ['done', 1]);
  await assert.rejects(room.retryAttachment(queued.id, {kind: 'captions'}), /Only a failed attachment/);
  // Scheduling: a future time in the chosen zone, the audience settings and YouTube's audit confirmed by name.
  await assert.rejects(room.schedule(queued.id, {scheduledBy: 'Owner', local: '2020-01-01T10:00', timeZone: 'Asia/Karachi', confirmations: {settings: true, audit: true}}), /at least 30 minutes from now/);
  await assert.rejects(schedule({confirmations: {settings: true}}), /API audit/);
  await assert.rejects(schedule({confirmations: {audit: true}}), /made for kids no, altered or synthetic content yes/);
  row = await schedule({});
  const publishAt = G.zonedToUtc(`${tomorrow}T20:00`, 'Asia/Karachi');
  assert.equal(publishAt.slice(11), '15:00:00Z', 'Karachi is five hours ahead of UTC');
  assert.deepEqual([row.status, row.schedule.publishAt, row.schedule.timeZone, row.schedule.there.endsWith('20:00')], ['scheduled', publishAt, 'Asia/Karachi', true]);
  assert.deepEqual(g.status, {privacyStatus: 'private', publishAt, license: 'youtube', embeddable: true, publicStatsViewable: true, selfDeclaredMadeForKids: false, containsSyntheticMedia: true}, 'every other setting is sent back unchanged');
  // Cancelling keeps the video private; scheduling again works.
  row = await room.unschedule(queued.id, {requestedBy: 'Owner'});
  assert.deepEqual([row.status, g.status.publishAt, g.status.privacyStatus], ['processed', undefined, 'private']);
  row = await schedule({});
  assert.equal(row.status, 'scheduled');
  // After its time, the program looks: public means published.
  store.db.prepare('UPDATE publications SET next_check_at=? WHERE id=?').run(new Date(Date.now() - 1000).toISOString(), queued.id);
  g.status = {...g.status, privacyStatus: 'public', publishAt: undefined};
  row = await room.processNext();
  assert.deepEqual([row.status, row.watchUrl, row.visibility.privacyStatus], ['published', `https://www.youtube.com/watch?v=${row.videoId}`, 'public']);
  // Still private after its time and six looks: YouTube kept it private (an unaudited project, or the schedule removed).
  store.db.prepare("UPDATE publications SET status='scheduled', checks=5, next_check_at=? WHERE id=?").run(new Date(Date.now() - 1000).toISOString(), queued.id);
  g.status = {...g.status, privacyStatus: 'private'};
  row = await room.processNext();
  assert.equal(row.status, 'kept_private');
  assert.match(row.error, /not yet approved in YouTube's API audit/);
  assert.ok(room.quota.summary().youtube.used >= 50 * 2 + 400 + 50 + 51 * 3, 'thumbnails, captions, the caption lookup and every schedule change count against the daily units');
});

test('Y03: unattended publishing stays locked until the gate passes on real records; then it uploads and schedules by the rules, a pause holds it, and an error or a change returns it to review', async t => {
  const env = setup(t), {room, content, store, family, connectors, client} = env;
  await connected(env);
  const rules = {level: 'unattended', timeZone: 'America/New_York', windows: [{day: 2, time: '18:00'}, {day: 4, time: '18:00'}], madeForKids: false, categoryId: 27, minLeadHours: 24, maxPerDay: 2, maxPerWeek: 10};
  const unattended = (expectedRevision, confirmations = {rules: true, audit: true}) => room.setPolicy(family.id, {updatedBy: 'Owner', expectedRevision, rules, confirmations});
  // No evidence yet: locked, with every missing piece named.
  assert.throws(() => unattended(0), /stays locked until the gate passes: 0 of 10 consecutive reviewed videos/);
  let gate = room.gateFor(family.id);
  assert.deepEqual(gate.checks.map(check => check.passed), [false, false, false, false]);
  assert.match(gate.checks[3].detail, /Google client connection is missing or not tested/);
  await connectors.test(client.id, client.revision);
  assert.equal(room.gateFor(family.id).checks[3].passed, true);
  // Review rules can be kept ready; nothing is automatic.
  const ready = room.setPolicy(family.id, {updatedBy: 'Owner', expectedRevision: 0, rules: {...rules, level: 'review'}});
  assert.deepEqual([ready.policy.revision, ready.effective.level, ready.policy.windowText], [1, 'review', 'Tue 18:00, Thu 18:00']);
  assert.throws(() => store.db.prepare('UPDATE publishing_policies SET payload=?').run('{}'), /immutable/);
  // The pilot's evidence: ten reviewed videos that went public with today's recipe, one of them recovered after a stop.
  const binding = room.activeBinding(family.id, 'en-US'), recipe = room.currentRecipe(family.id, 'en-US');
  for (let k = 0; k < 10; k++) store.db.prepare("INSERT INTO publications(id,family_id,content_id,locale,kind,render_id,approval_id,binding_id,channel_id,status,metadata,sha256,size,video_id,recipe,recovered,created_by,created_at,updated_at) VALUES(?,?,?,?,'master','old','old',?,?,'published',?,'x',1,?,?,?,'Owner',?,?)")
    .run(`pilot-${k}`, family.id, `pilot-content-${k}`, 'en-US', binding.id, binding.channel_id, JSON.stringify({snippet: {title: `Pilot ${k}`}, status: {privacyStatus: 'private', selfDeclaredMadeForKids: false}}), `pilotvid${String(k).padStart(3, '0')}`, recipe, k === 3 ? 1 : 0, new Date(Date.now() - (20 - k) * 86400000).toISOString(), new Date().toISOString());
  store.db.prepare("INSERT INTO intelligence_usage(job_id,family_id,kind,period_month,status,reserved_tokens,total_tokens,created_at,updated_at) VALUES('job-1',?,'scene_plan','2026-10','unknown',5000,NULL,?,?)").run(family.id, new Date().toISOString(), new Date().toISOString());
  gate = room.gateFor(family.id);
  assert.deepEqual([gate.streak, gate.checks.map(check => check.passed)], [10, [true, true, false, true]], 'an interrupted paid request leaves the cost unknown');
  store.db.prepare("UPDATE intelligence_usage SET status='settled', total_tokens=48000 WHERE job_id='job-1'").run();
  assert.equal(room.gateFor(family.id).passed, true);
  assert.throws(() => unattended(1, {audit: true}), /may upload and schedule this family's approved videos/);
  const on = unattended(1);
  assert.deepEqual([on.policy.revision, on.policy.enabledBy, on.effective.level], [2, 'Owner', 'unattended']);
  // The autopilot takes the approved master: queues it with the rules' settings, uploads it, attaches, then schedules
  // it into the next window at least 24 hours away.
  const queued = await room.processNext();
  assert.deepEqual([queued.status, queued.createdBy, queued.madeForKids], ['queued', 'Autopilot (rules r2 of Owner)', false]);
  assert.equal((await room.processNext()).status, 'uploaded');
  assert.equal((await room.processNext()).status, 'processing');
  store.db.prepare('UPDATE publications SET next_check_at=? WHERE id=?').run(new Date(Date.now() - 1000).toISOString(), queued.id);
  assert.equal((await room.processNext()).status, 'processed');
  await room.processNext(); await room.processNext();
  const scheduled = await room.processNext();
  assert.equal(scheduled.status, 'scheduled', JSON.stringify(scheduled.attachments));
  const at = new Date(scheduled.schedule.publishAt), there = new Intl.DateTimeFormat('en-US', {timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(at);
  assert.match(there, /^(Tue|Thu) 18:00$/);
  assert.ok(at.getTime() >= Date.now() + 23.9 * 3600000);
  assert.match(scheduled.schedule.scheduledBy, /^Autopilot \(rules r2 of Owner\)$/);
  assert.equal(await room.processNext(), null, 'nothing else to do: the next video is not approved yet');
  // A pause holds everything new: even an upload queued by hand waits.
  await connected(env, 'es-419');
  room.setPause({requestedBy: 'Owner', scope: 'portfolio', paused: true, reason: 'Holiday week.'});
  assert.equal(room.effective(family.id).level, 'paused');
  const held = room.queueUpload(content.id, {requestedBy: 'Owner', locale: 'es-419', categoryId: 27, madeForKids: false});
  assert.equal(await room.processNext(), null);
  assert.equal(room.publicationRow(held.id).status, 'queued');
  room.setPause({requestedBy: 'Owner', scope: 'portfolio', paused: false});
  assert.equal((await room.processNext()).status, 'uploaded');
  // A material error reported afterwards ends the clean run: back to review, with the reason and an alert.
  room.report(scheduled.id, {reportedBy: 'Owner', kind: 'factual', note: 'The founding year is wrong in the title card.'});
  assert.throws(() => room.report(scheduled.id, {reportedBy: 'Owner', kind: 'taste', note: 'Not a material error.'}), /factual, rights, language or destination/);
  const back = room.automation(family.id);
  assert.equal(back.effective.level, 'review');
  assert.match(back.effective.reason, /gate no longer passes[\s\S]*factual error was reported/);
  await room.autopilotNext();
  const alerts = room.automation(family.id).alerts;
  assert.deepEqual(alerts.map(alert => alert.kind).sort(), ['gate', 'incident']);
  room.acknowledge(alerts[0].id, {requestedBy: 'Owner'});
  assert.equal(room.automation(family.id).alerts.length, 1);
  // A new voice is a new recipe: the earlier videos no longer count.
  store.db.prepare('UPDATE publications SET incident=NULL WHERE id=?').run(scheduled.id);
  store.db.prepare("INSERT INTO connectors(id,name_key,payload,secret) VALUES('eleven','eleven',?,?)").run(JSON.stringify({name: 'eleven', provider: 'elevenlabs', revision: 1, test: {status: 'passed', at: new Date().toISOString()}}), Buffer.from('protected'));
  store.saveVoiceProfile(family.id, {revision: 0, familyRevision: store.family(family.id).revision, name: 'Narrator', connectorId: 'eleven', connectorRevision: 1, provider: 'elevenlabs', model: 'eleven_multilingual_v2', voiceId: 'voice_fixture_123', voiceVersion: 'current', ownershipBasis: 'provider_stock_voice', rightsHolder: 'Provider voice catalog', consentConfirmed: true, commercialUseConfirmed: true, evidenceReference: 'Terms reviewed.', termsReviewedAt: '2026-10-09', pace: 1, energy: 55, emotion: 'warm', pauseScale: 1, emphasis: 50, instructions: '', lexicon: [], monthlyCharacterLimit: 100000, maxCharactersPerAudition: 12000, priceCentsPerMillionCharacters: 1500});
  gate = room.gateFor(family.id);
  assert.equal(gate.streak, 0);
  assert.match(gate.checks[0].detail, /another niche, voice, provider or style/);
});
