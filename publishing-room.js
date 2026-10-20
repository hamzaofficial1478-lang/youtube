'use strict';
// Y01 Publishing Room (Room 11): each family language is bound to one YouTube channel through Google's own sign-in
// (confirmed by name after the program shows the returned channel); an approved master (primary language) or a
// released edition is uploaded PRIVATELY through YouTube's resumable upload. A publication is a durable record: the
// session is saved before the first byte, every finished chunk is recorded, a stop resumes from where Google says it
// stopped, and an upload whose outcome is unknown is reconciled against the channel before anything is sent again.
// Never a blind second copy. Thumbnails, captions, scheduling and public release are Y02.
const fs = require('node:fs');
const {randomUUID} = require('node:crypto');
const G = require('./publishing');
const R = require('./render');
const {InputError} = require('./store');
const {requireValue, now, object, person, text} = R;

const PAUSE = [2000, 5000, 15000]; // status questions after a dropped chunk, within one run
const CHECK_EVERY = 60000, MAX_CHECKS = 120; // processing checks: once a minute, for up to two hours
const AUTH_TTL = 15 * 60000;

class PublishingRoom {
  constructor(store, connectors, {renders, packaging, localization, quota, fetch: fetchImpl = null, wait = ms => new Promise(done => setTimeout(done, ms))} = {}) {
    Object.assign(this, {store, db: store.db, connectors, renders, packaging, localization, quota, wait, busy: false, auth: new Map(), tokens: new Map()});
    this.fetch = fetchImpl || ((...args) => (connectors.fetch || fetch)(...args));
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS youtube_bindings(id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id), locale TEXT NOT NULL, connector_id TEXT NOT NULL, connector_revision INTEGER NOT NULL, channels TEXT NOT NULL, channel_id TEXT, channel_title TEXT, uploads_playlist TEXT, scopes TEXT NOT NULL, secret BLOB, status TEXT NOT NULL, created_by TEXT NOT NULL, confirmed_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS publications(id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id), content_id TEXT NOT NULL, locale TEXT NOT NULL, kind TEXT NOT NULL, render_id TEXT NOT NULL, approval_id TEXT NOT NULL, binding_id TEXT NOT NULL REFERENCES youtube_bindings(id), channel_id TEXT NOT NULL, status TEXT NOT NULL, metadata TEXT NOT NULL, sha256 TEXT NOT NULL, size INTEGER NOT NULL, session BLOB, sent INTEGER NOT NULL DEFAULT 0, video_id TEXT, processing TEXT, checks INTEGER NOT NULL DEFAULT 0, next_check_at TEXT, attempts INTEGER NOT NULL DEFAULT 0, error TEXT, candidates TEXT, started_at TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS publications_video ON publications(video_id) WHERE video_id IS NOT NULL;
    `);
    this.db.prepare("UPDATE publications SET status='interrupted', error='The program stopped during the upload. The upload session is kept; resuming asks Google where it stopped.', updated_at=? WHERE status='uploading'").run(now());
  }

  // ------------------------------------------------------------ channel connections
  protect(value) { return this.connectors.protector.transform('protect', Buffer.from(JSON.stringify(value))); }
  unprotect(blob) { return JSON.parse(this.connectors.protector.transform('unprotect', Buffer.from(blob)).toString('utf8')); }
  client(connectorId) {
    const row = this.connectors.row(connectorId), slot = JSON.parse(row.payload);
    requireValue(slot.provider === 'youtube-oauth' && slot.clientId, 'Choose a "YouTube channel access" connection (Connections) with its client ID and secret.', 409);
    return {id: row.id, revision: slot.revision, clientId: slot.clientId, clientSecret: this.connectors.key(row.id)};
  }
  bindingRow(id) { const row = this.db.prepare('SELECT * FROM youtube_bindings WHERE id=?').get(id); requireValue(row, 'Channel connection not found.', 404); return row; }
  activeBinding(familyId, locale) { return this.db.prepare("SELECT * FROM youtube_bindings WHERE family_id=? AND locale=? AND status IN ('active','reconnect') ORDER BY updated_at DESC LIMIT 1").get(familyId, locale) || null; }
  // Step 1: the address of Google's sign-in page. Google sends the owner back to this program (loopback, PKCE, state).
  connect(input, origin) {
    object(input);
    const by = person(input.requestedBy), family = this.store.family(text(input.familyId, 'Family', 8, 80)), locale = text(input.locale, 'Language', 2, 20);
    requireValue(family.locales.includes(locale), `${locale} is not one of this family's languages.`, 400);
    requireValue(/^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}$/.test(origin), 'Open the program at http://127.0.0.1 to connect a channel.', 400);
    const client = this.client(text(input.connectorId, 'Connection', 8, 80)), {verifier, challenge, state} = G.pkce(), redirectUri = `${origin}/oauth/youtube/callback`;
    for (const [key, session] of this.auth) if (Date.now() - session.at > AUTH_TTL || (session.familyId === family.id && session.locale === locale)) this.auth.delete(key);
    this.auth.set(state, {familyId: family.id, locale, connectorId: client.id, connectorRevision: client.revision, verifier, redirectUri, requestedBy: by, at: Date.now()});
    return {url: G.authUrl({clientId: client.clientId, redirectUri, state, challenge})};
  }
  // Step 2: Google's answer arrives at the loopback address. The channel is found and kept as pending; nothing is
  // bound until the owner confirms it by name in the program.
  async callback(query) {
    const session = this.auth.get(String(query.get('state') || ''));
    if (!session || Date.now() - session.at > AUTH_TTL) return {ok: false, message: 'This sign-in link expired or was already used. Start "Connect channel" again in the program.'};
    this.auth.delete(String(query.get('state')));
    if (query.get('error')) return {ok: false, message: query.get('error') === 'access_denied' ? 'You declined access on Google\'s page. Nothing was connected.' : 'Google did not complete the sign-in. Nothing was connected.'};
    try {
      const client = this.client(session.connectorId);
      requireValue(client.revision === session.connectorRevision, 'The connection changed during the sign-in. Start again.', 409);
      const granted = await G.exchangeCode(this.fetch, {clientId: client.clientId, clientSecret: client.clientSecret, code: String(query.get('code') || ''), verifier: session.verifier, redirectUri: session.redirectUri});
      const channels = await G.myChannels(this.fetch, granted.accessToken);
      if (!channels.length) { await G.revoke(this.fetch, granted.refreshToken).catch(() => false); return {ok: false, message: 'This Google account has no YouTube channel. Nothing was connected.'}; }
      const id = randomUUID(), at = now();
      this.db.prepare("INSERT INTO youtube_bindings(id,family_id,locale,connector_id,connector_revision,channels,scopes,secret,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,'pending',?,?,?)")
        .run(id, session.familyId, session.locale, client.id, client.revision, JSON.stringify(channels), granted.scope, this.protect({refreshToken: granted.refreshToken}), session.requestedBy, at, at);
      this.tokens.set(id, {accessToken: granted.accessToken, expiresAt: granted.expiresAt});
      this.store.event(`Google sign-in returned ${channels.length === 1 ? `the channel "${channels[0].title}"` : `${channels.length} channels`} for ${this.store.family(session.familyId).name} (${session.locale}); waiting for the owner's confirmation`);
      return {ok: true, channels, message: 'Return to the Control Room and confirm this channel for the language you chose.'};
    } catch (error) { return {ok: false, message: error instanceof InputError ? error.message : 'The sign-in could not be completed.'}; }
  }
  // Step 3: the owner confirms the channel by name; any earlier connection of that language is replaced.
  confirm(id, input) {
    object(input);
    const by = person(input.confirmedBy, 'Your name');
    const replaced = this.store.transaction(() => {
      const row = this.bindingRow(id), channels = JSON.parse(row.channels), channel = channels.find(item => item.id === input.channelId);
      requireValue(row.status === 'pending', 'This connection is not waiting for a confirmation.', 409);
      requireValue(channel, 'Choose one of the channels Google returned.', 400);
      requireValue(input.confirmed === true, `Confirm that "${channel.title}" is the channel for this language.`);
      const old = this.db.prepare("SELECT * FROM youtube_bindings WHERE family_id=? AND locale=? AND status IN ('active','reconnect')").all(row.family_id, row.locale);
      for (const item of old) this.db.prepare("UPDATE youtube_bindings SET status='replaced', secret=NULL, updated_at=? WHERE id=?").run(now(), item.id);
      this.db.prepare("UPDATE youtube_bindings SET status='active', channel_id=?, channel_title=?, uploads_playlist=?, confirmed_by=?, updated_at=? WHERE id=?").run(channel.id, channel.title, channel.uploads, by, now(), id);
      this.store.event(`${this.store.family(row.family_id).name} (${row.locale}) now publishes to "${channel.title}" (${channel.id}), confirmed by ${by}`);
      return old;
    });
    for (const item of replaced) if (item.secret) this.revokeSecret(item.secret);
    return this.publicBinding(this.bindingRow(id));
  }
  revokeSecret(blob) { try { G.revoke(this.fetch, this.unprotect(blob).refreshToken).catch(() => false); } catch { /* nothing to revoke */ } }
  disconnect(id, input) {
    object(input);
    const by = person(input.requestedBy), row = this.bindingRow(id);
    requireValue(['pending', 'active', 'reconnect'].includes(row.status), 'This connection is already closed.', 409);
    requireValue(!this.db.prepare("SELECT 1 FROM publications WHERE binding_id=? AND status IN ('queued','uploading')").get(id), 'An upload to this channel is running. Wait for it or let it stop first.', 409);
    if (row.secret) this.revokeSecret(row.secret);
    this.tokens.delete(id);
    this.db.prepare("UPDATE youtube_bindings SET status='disconnected', secret=NULL, updated_at=? WHERE id=?").run(now(), id);
    this.store.event(`Disconnected ${row.channel_title || 'a pending channel'} from ${this.store.family(row.family_id).name} (${row.locale}), by ${by}`);
    return this.publicBinding(this.bindingRow(id));
  }
  // A short-lived access token from the saved refresh token; a refusal pauses this channel until it is reconnected.
  async accessToken(row) {
    const cached = this.tokens.get(row.id);
    if (cached && cached.expiresAt > Date.now()) return cached.accessToken;
    requireValue(row.secret && row.status === 'active', 'Connect this channel again (Room 11).', 409);
    const client = this.client(row.connector_id);
    try {
      const fresh = await G.refresh(this.fetch, {clientId: client.clientId, clientSecret: client.clientSecret, refreshToken: this.unprotect(row.secret).refreshToken});
      this.tokens.set(row.id, fresh);
      return fresh.accessToken;
    } catch (error) {
      if (error.reconnect) this.db.prepare("UPDATE youtube_bindings SET status='reconnect', updated_at=? WHERE id=?").run(now(), row.id);
      throw error;
    }
  }

  // ------------------------------------------------------------ what may be uploaded
  // The primary language uploads its approved final master with its approved package; another language uploads its
  // released edition with the edition's words. Both must still stand.
  deliverable(contentId, locale) {
    const content = this.store.content(contentId), family = this.store.family(content.familyId), pkgRow = this.packaging.latestRow(contentId);
    const pkg = pkgRow ? JSON.parse(pkgRow.payload) : null, synthetic = !!pkg?.disclosure?.synthetic;
    if (locale === family.primaryLocale) {
      const master = this.localization.approvedMaster(contentId), approval = master ? this.renders.masterApproval(master) : null;
      requireValue(master && approval?.current, 'Approve the final master in Room 10 first.', 409);
      const checks = JSON.parse(pkgRow.checks);
      return {kind: 'master', renderId: master.id, approvalId: approval.id, title: pkg.titles.find(item => item.id === pkg.chosenTitle).text, description: checks.description, tags: pkg.tags, synthetic};
    }
    const release = this.localization.currentRelease(contentId, locale);
    requireValue(release, 'Approve this language\'s edition for release in Room 06 first.', 409);
    const edition = JSON.parse(this.renders.row(release.renderId).scope).edition;
    requireValue(edition.package?.title, 'This edition has no title. Add one in Room 06.', 409);
    return {kind: 'edition', renderId: release.renderId, approvalId: release.releaseId, title: edition.package.title, description: edition.package.description, tags: edition.package.tags, synthetic};
  }
  publicationRow(id) { const row = this.db.prepare('SELECT * FROM publications WHERE id=?').get(id); requireValue(row, 'Upload record not found.', 404); return row; }
  queueUpload(contentId, input) {
    object(input);
    const by = person(input.requestedBy), content = this.store.content(contentId), locale = text(input.locale, 'Language', 2, 20);
    const binding = this.activeBinding(content.familyId, locale);
    requireValue(binding?.status === 'active', binding ? 'Google asked to connect this channel again (Room 11).' : 'Connect and confirm a YouTube channel for this language first (Room 11).', 409);
    const item = this.deliverable(contentId, locale), file = this.renders.file(item.renderId, 'video'), video = JSON.parse(this.renders.row(item.renderId).result).video;
    const body = G.metadata({title: item.title, description: item.description, tags: item.tags, categoryId: input.categoryId, locale, madeForKids: input.madeForKids, synthetic: item.synthetic});
    return this.store.transaction(() => {
      const open = this.db.prepare("SELECT status FROM publications WHERE content_id=? AND locale=? AND status NOT IN ('failed','discarded')").get(contentId, locale);
      requireValue(!open, `This language already has an upload record (${open?.status}). Finish, reconcile or discard it first; a second copy is never uploaded blindly.`, 409);
      const id = randomUUID(), at = now();
      this.db.prepare("INSERT INTO publications(id,family_id,content_id,locale,kind,render_id,approval_id,binding_id,channel_id,status,metadata,sha256,size,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'queued',?,?,?,?,?,?)")
        .run(id, content.familyId, contentId, locale, item.kind, item.renderId, item.approvalId, binding.id, binding.channel_id, JSON.stringify(body), video.sha256, file.size, by, at, at);
      this.store.event(`Queued the private upload of "${content.title}" (${locale}) to "${binding.channel_title}"`);
      return this.publicPublication(this.publicationRow(id));
    });
  }

  // ------------------------------------------------------------ the upload
  claim() {
    return this.store.transaction(() => {
      const row = this.db.prepare("SELECT * FROM publications WHERE status='queued' ORDER BY created_at, rowid LIMIT 1").get();
      if (!row) return null;
      const fail = message => { this.db.prepare("UPDATE publications SET status=?, error=?, updated_at=? WHERE id=?").run(row.session ? 'interrupted' : 'failed', message, now(), row.id); return null; };
      const binding = this.bindingRow(row.binding_id);
      if (binding.status !== 'active') return fail('The channel connection changed. Connect the channel again (Room 11).');
      let item;
      try { item = this.deliverable(row.content_id, row.locale); } catch (error) { return fail(`${error.message} Nothing more was sent.`); }
      if (item.renderId !== row.render_id || item.approvalId !== row.approval_id) return fail('A different video is approved now. Nothing more was sent; discard this record and upload the approved one.');
      if (!row.session) {
        // One of the day's uploads (YouTube's separate upload bucket), reserved before the session starts.
        const reserved = this.quota.reserve(row.id, {'youtube-upload': 1});
        if (!reserved.ok) return fail(`Today's YouTube upload limit (${reserved.cap}) is used up. Try after midnight Pacific time.`);
      }
      this.db.prepare("UPDATE publications SET status='uploading', attempts=attempts+1, error=NULL, updated_at=? WHERE id=?").run(now(), row.id);
      return {...row, binding};
    });
  }
  async processNext() {
    if (this.busy) return null;
    this.busy = true;
    try { return await this.upload() || await this.checkNext(); } finally { this.busy = false; }
  }
  async upload() {
    const job = this.claim();
    if (!job) return null;
    const set = (fields, values) => this.db.prepare(`UPDATE publications SET ${fields}, updated_at=? WHERE id=?`).run(...values, now(), job.id);
    let file = null;
    try {
      const token = await this.accessToken(job.binding);
      const path = this.renders.file(job.render_id, 'video').file;
      requireValue(R.fileSha256(path) === job.sha256, 'The approved video file changed after it was queued.', 409);
      let session = job.session ? this.unprotect(job.session).session : null, at = job.sent;
      if (!session) {
        session = await G.startUpload(this.fetch, token, {body: JSON.parse(job.metadata), size: job.size});
        set('session=?, started_at=?, sent=0', [this.protect({session}), now()]);
        at = 0;
      } else {
        const answer = await G.uploadStatus(this.fetch, token, session, job.size);
        if (answer.expired) { set("status='unknown', error=?", ['Google no longer knows this upload session. Reconcile the channel: the video may or may not be there.']); return this.publicPublication(this.publicationRow(job.id)); }
        if (answer.video) return this.uploaded(job, answer.video, set);
        at = answer.next;
      }
      file = fs.openSync(path, 'r');
      while (true) {
        const buffer = Buffer.alloc(Math.min(G.CHUNK, job.size - at));
        fs.readSync(file, buffer, 0, buffer.length, at);
        let answer;
        try { answer = await G.sendChunk(this.fetch, token, session, {buffer, start: at, size: job.size}); } catch (error) {
          if (!error.unknown && !(error.status >= 500)) throw error;
          // The chunk's fate is unknown: ask the session where it stopped (a few times), then continue from there.
          answer = null;
          for (const pause of PAUSE) {
            await this.wait(pause);
            try { answer = await G.uploadStatus(this.fetch, token, session, job.size); break; } catch (retry) { if (!retry.unknown && !(retry.status >= 500)) throw retry; }
          }
          if (!answer) throw Object.assign(new InputError('The connection to YouTube dropped and did not come back. The session is kept: resume later.'), {resumable: true});
        }
        if (answer.expired) { set("status='unknown', error=?", ['Google no longer knows this upload session. Reconcile the channel: the video may or may not be there.']); return this.publicPublication(this.publicationRow(job.id)); }
        if (answer.video) return this.uploaded(job, answer.video, set);
        at = answer.next;
        set('sent=?', [at]);
      }
    } catch (error) {
      const row = this.publicationRow(job.id), message = error instanceof InputError ? error.message : 'The upload stopped.';
      // With a session the upload can resume (or must be reconciled); without one nothing reached YouTube.
      if (row.session) set("status='interrupted', error=?", [`${message} The upload session is kept; resuming asks Google where it stopped.`]);
      else { set("status='failed', error=?", [message]); if (error.unknown) this.quota.markUnknown(job.id); else this.quota.release(job.id); }
      return null;
    } finally { if (file !== null) fs.closeSync(file); }
  }
  uploaded(job, video, set) {
    this.store.transaction(() => {
      set("status='uploaded', video_id=?, sent=size, session=NULL, next_check_at=?, error=NULL", [video.id, now()]);
      this.quota.settle(job.id, {'youtube-upload': 1});
      this.store.event(`Uploaded "${this.store.content(job.content_id).title}" (${job.locale}) privately as ${video.id}`);
    });
    return this.publicPublication(this.publicationRow(job.id));
  }
  // Processing after the upload, checked conservatively (1 unit a check, from the shared daily bucket).
  async checkNext(id = null) {
    const row = id ? this.publicationRow(id) : this.db.prepare("SELECT * FROM publications WHERE status IN ('uploaded','processing') AND next_check_at<=? ORDER BY next_check_at LIMIT 1").get(now());
    if (!row) return null;
    requireValue(row.video_id && ['uploaded', 'processing', 'processed'].includes(row.status), 'This upload has no video to check yet.', 409);
    const job = `${row.id}:check:${row.checks + 1}`, reserved = this.store.transaction(() => this.quota.reserve(job, {youtube: 1}));
    const later = (status, error, extra = {}) => this.db.prepare('UPDATE publications SET status=?, error=?, processing=COALESCE(?, processing), checks=checks+1, next_check_at=?, updated_at=? WHERE id=?')
      .run(status, error, extra.processing ? JSON.stringify(extra.processing) : null, extra.next ?? null, now(), row.id);
    if (!reserved.ok) { later(row.status, `The daily YouTube unit limit (${reserved.cap}) is used up; the next check waits.`, {next: new Date(Date.now() + 3600000).toISOString()}); return null; }
    try {
      const token = await this.accessToken(this.bindingRow(row.binding_id)), state = await G.videoStatus(this.fetch, token, row.video_id);
      this.quota.settle(job, {youtube: 1});
      if (!state.found) later('failed', 'YouTube no longer finds this video (it was deleted or is not on this channel).');
      else if (['failed', 'rejected', 'deleted'].includes(state.uploadStatus) || state.processingStatus === 'failed') later('failed', `YouTube ${state.uploadStatus === 'rejected' ? `rejected the video (${state.rejectionReason || 'no reason given'})` : `could not process the video (${state.failureReason || state.processingStatus || state.uploadStatus})`}.`, {processing: state});
      else if (state.uploadStatus === 'processed' || state.processingStatus === 'succeeded') later('processed', null, {processing: state});
      else later('processing', row.checks + 1 >= MAX_CHECKS ? 'Still processing after two hours of checks; use "Check now" later.' : null, {processing: state, next: row.checks + 1 >= MAX_CHECKS ? null : new Date(Date.now() + CHECK_EVERY).toISOString()});
    } catch (error) {
      if (error.unknown) this.quota.markUnknown(job); else this.quota.release(job);
      later(row.status, error instanceof InputError ? error.message : 'The check failed.', {next: new Date(Date.now() + CHECK_EVERY * 5).toISOString()});
    }
    return this.publicPublication(this.publicationRow(row.id));
  }

  // ------------------------------------------------------------ owner actions on a record
  resume(id, input) {
    object(input);
    const row = this.publicationRow(id);
    requireValue(row.status === 'interrupted', 'Only a stopped upload can be resumed.', 409);
    requireValue(row.attempts < 5, 'This upload stopped 5 times. Reconcile the channel, then discard it and start again.', 409);
    this.db.prepare("UPDATE publications SET status='queued', error=NULL, updated_at=? WHERE id=?").run(now(), id);
    return this.publicPublication(this.publicationRow(id));
  }
  // An unknown outcome: look for the video on the channel (2 units) before anything is uploaded again.
  async reconcile(id, input) {
    object(input);
    const by = person(input.requestedBy), row = this.publicationRow(id);
    requireValue(['unknown', 'interrupted'].includes(row.status), 'Only an upload with an unknown or stopped outcome is reconciled.', 409);
    const binding = this.bindingRow(row.binding_id), job = `${row.id}:reconcile:${Date.now()}`;
    const reserved = this.store.transaction(() => this.quota.reserve(job, {youtube: 2}));
    requireValue(reserved.ok, `The daily YouTube unit limit (${reserved.cap}) is used up. Reconcile tomorrow.`, 409);
    let found;
    try { found = G.matchUpload(await G.recentUploads(this.fetch, await this.accessToken(binding), binding.uploads_playlist), {title: JSON.parse(row.metadata).snippet.title, after: row.started_at || row.created_at}); this.quota.settle(job, {youtube: 2}); } catch (error) { this.quota.markUnknown(job); throw error; }
    if (found.length === 1) {
      this.store.transaction(() => { this.db.prepare("UPDATE publications SET status='uploaded', video_id=?, session=NULL, candidates=NULL, next_check_at=?, error=NULL, updated_at=? WHERE id=?").run(found[0].videoId, now(), now(), id); this.quota.settle(row.id, {'youtube-upload': 1}); });
      this.store.event(`Reconciled the upload of "${this.store.content(row.content_id).title}" (${row.locale}): found ${found[0].videoId} on the channel (by ${by})`);
    } else {
      this.db.prepare('UPDATE publications SET candidates=?, error=?, updated_at=? WHERE id=?').run(JSON.stringify(found), found.length ? `${found.length} videos on the channel match this title. Open them in YouTube Studio, then choose the right one or discard this record.` : 'No video with this title appeared on the channel after the upload started. If the upload can resume, resume it; otherwise discard this record and upload again.', now(), id);
    }
    return this.publicPublication(this.publicationRow(id));
  }
  // The owner names the video when reconciliation found more than one candidate.
  choose(id, input) {
    object(input);
    const by = person(input.requestedBy), row = this.publicationRow(id), candidates = JSON.parse(row.candidates || '[]');
    requireValue(['unknown', 'interrupted'].includes(row.status) && candidates.some(item => item.videoId === input.videoId), 'Choose one of the videos reconciliation found.', 400);
    this.store.transaction(() => { this.db.prepare("UPDATE publications SET status='uploaded', video_id=?, session=NULL, candidates=NULL, next_check_at=?, error=NULL, updated_at=? WHERE id=?").run(input.videoId, now(), now(), id); this.quota.settle(row.id, {'youtube-upload': 1}); });
    this.store.event(`${by} named ${input.videoId} as the upload of "${this.store.content(row.content_id).title}" (${row.locale})`);
    return this.publicPublication(this.publicationRow(id));
  }
  // Giving up a record that has no video: only after reconciliation found nothing, or before any byte left.
  discard(id, input) {
    object(input);
    const by = person(input.requestedBy), row = this.publicationRow(id);
    requireValue(['queued', 'failed', 'interrupted', 'unknown'].includes(row.status) && !row.video_id, 'Only an upload record without a video can be discarded.', 409);
    if (row.session || row.status === 'unknown') requireValue(row.candidates !== null && JSON.parse(row.candidates).length === 0, 'Reconcile the channel first: discard only when no matching video was found.', 409);
    this.db.prepare("UPDATE publications SET status='discarded', session=NULL, error=?, updated_at=? WHERE id=?").run(`Discarded by ${by}.`, now(), id);
    if (row.status !== 'failed') this.quota.release(row.id);
    return this.publicPublication(this.publicationRow(id));
  }

  // ------------------------------------------------------------ page
  publicBinding(row) {
    return {id: row.id, familyId: row.family_id, locale: row.locale, status: row.status, channelId: row.channel_id, channelTitle: row.channel_title, channels: row.status === 'pending' ? JSON.parse(row.channels).map(({id, title, customUrl, thumbnail}) => ({id, title, customUrl, thumbnail})) : null,
      createdBy: row.created_by, confirmedBy: row.confirmed_by, createdAt: row.created_at, updatedAt: row.updated_at};
  }
  publicPublication(row) {
    const meta = JSON.parse(row.metadata);
    return {id: row.id, contentId: row.content_id, locale: row.locale, kind: row.kind, renderId: row.render_id, status: row.status, videoId: row.video_id, channelId: row.channel_id, title: meta.snippet.title, privacy: meta.status.privacyStatus, madeForKids: meta.status.selfDeclaredMadeForKids,
      size: row.size, sent: row.sent, attempts: row.attempts, error: row.error, processing: row.processing ? JSON.parse(row.processing) : null, candidates: row.candidates ? JSON.parse(row.candidates) : null, hasSession: !!row.session, createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at,
      studioUrl: row.video_id ? `https://studio.youtube.com/video/${row.video_id}/edit` : null};
  }
  state() {
    const families = this.store.families().filter(family => !family.archived);
    return {
      busy: !!this.db.prepare("SELECT 1 FROM publications WHERE status IN ('queued','uploading') OR (status IN ('uploaded','processing') AND next_check_at IS NOT NULL) LIMIT 1").get(),
      quota: this.quota.summary(),
      families: families.map(family => ({familyId: family.id, locales: family.locales.map(locale => {
        const bindings = this.db.prepare("SELECT * FROM youtube_bindings WHERE family_id=? AND locale=? AND status IN ('pending','active','reconnect') ORDER BY created_at DESC").all(family.id, locale).map(row => this.publicBinding(row));
        return {locale, active: bindings.find(item => ['active', 'reconnect'].includes(item.status)) || null, pending: bindings.filter(item => item.status === 'pending')};
      })})),
      contents: this.store.contents().filter(content => content.state === 'approved').map(content => {
        const family = this.store.family(content.familyId);
        return {contentId: content.id, familyId: content.familyId, title: content.title, locales: family.locales.map(locale => {
          let ready = null, blocker = null;
          try { const item = this.deliverable(content.id, locale); ready = {kind: item.kind, renderId: item.renderId, title: item.title}; } catch (error) { blocker = error.message; }
          return {locale, primary: locale === family.primaryLocale, ready, blocker, publications: this.db.prepare('SELECT * FROM publications WHERE content_id=? AND locale=? ORDER BY created_at DESC LIMIT 5').all(content.id, locale).map(row => this.publicPublication(row))};
        })};
      }),
    };
  }
}

module.exports = {PublishingRoom};
