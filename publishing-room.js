'use strict';
// Y01 Publishing Room (Room 11): each family language is bound to one YouTube channel through Google's own sign-in
// (confirmed by name after the program shows the returned channel); an approved master (primary language) or a
// released edition is uploaded PRIVATELY through YouTube's resumable upload. A publication is a durable record: the
// session is saved before the first byte, every finished chunk is recorded, a stop resumes from where Google says it
// stopped, and an upload whose outcome is unknown is reconciled against the channel before anything is sent again.
// Never a blind second copy. Y02: after processing, the approved thumbnail and the edit's captions are
// attached (each once, a failed one retried alone), and the owner schedules the time it goes public; the program then
// observes whether YouTube really made it public.
const fs = require('node:fs');
const {randomUUID} = require('node:crypto');
const G = require('./publishing');
const R = require('./render');
const Cap = require('./captions');
const L = require('./localize');
const A = require('./autopilot');
const {InputError} = require('./store');
const {requireValue, now, object, person, text} = R;

const PAUSE = [2000, 5000, 15000]; // status questions after a dropped chunk, within one run
const CHECK_EVERY = 60000, MAX_CHECKS = 120; // processing checks: once a minute, for up to two hours
const AUTH_TTL = 15 * 60000;
// YouTube charges a request it answered even when it refuses it; a request that never left costs nothing.
const answered = error => error instanceof G.GoogleError && !error.unknown && !error.reconnect;

class PublishingRoom {
  constructor(store, connectors, {renders, packaging, localization, quota, fetch: fetchImpl = null, wait = ms => new Promise(done => setTimeout(done, ms))} = {}) {
    Object.assign(this, {store, db: store.db, connectors, renders, packaging, localization, quota, wait, busy: false, auth: new Map(), tokens: new Map()});
    this.fetch = fetchImpl || ((...args) => (connectors.fetch || fetch)(...args));
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS youtube_bindings(id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id), locale TEXT NOT NULL, connector_id TEXT NOT NULL, connector_revision INTEGER NOT NULL, channels TEXT NOT NULL, channel_id TEXT, channel_title TEXT, uploads_playlist TEXT, scopes TEXT NOT NULL, secret BLOB, status TEXT NOT NULL, created_by TEXT NOT NULL, confirmed_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS publications(id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id), content_id TEXT NOT NULL, locale TEXT NOT NULL, kind TEXT NOT NULL, render_id TEXT NOT NULL, approval_id TEXT NOT NULL, binding_id TEXT NOT NULL REFERENCES youtube_bindings(id), channel_id TEXT NOT NULL, status TEXT NOT NULL, metadata TEXT NOT NULL, sha256 TEXT NOT NULL, size INTEGER NOT NULL, session BLOB, sent INTEGER NOT NULL DEFAULT 0, video_id TEXT, processing TEXT, checks INTEGER NOT NULL DEFAULT 0, next_check_at TEXT, attempts INTEGER NOT NULL DEFAULT 0, error TEXT, candidates TEXT, started_at TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS publications_video ON publications(video_id) WHERE video_id IS NOT NULL;
    `);
    const columns = new Set(this.db.prepare('PRAGMA table_info(publications)').all().map(column => column.name));
    for (const column of ['attachments', 'schedule', 'visibility', 'recipe', 'incident']) if (!columns.has(column)) this.db.exec(`ALTER TABLE publications ADD COLUMN ${column} TEXT`);
    for (const column of ['recovered', 'auto']) if (!columns.has(column)) this.db.exec(`ALTER TABLE publications ADD COLUMN ${column} INTEGER NOT NULL DEFAULT 0`);
    // Y03: the owner's publishing rules (immutable revisions), the pauses and the alerts that bring exceptions back.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS publishing_policies(id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id), revision INTEGER NOT NULL, payload TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(family_id, revision));
      CREATE TRIGGER IF NOT EXISTS publishing_policies_immutable BEFORE UPDATE ON publishing_policies BEGIN SELECT RAISE(ABORT, 'Publishing rules are immutable.'); END;
      CREATE TABLE IF NOT EXISTS publishing_controls(key TEXT PRIMARY KEY, paused INTEGER NOT NULL, reason TEXT, by_name TEXT NOT NULL, at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS publishing_alerts(id TEXT PRIMARY KEY, family_id TEXT NOT NULL, publication_id TEXT, kind TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL, resolved_at TEXT, resolved_by TEXT);
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
      // As for a disconnect: an upload to the channel being replaced finishes (or stops) first.
      requireValue(!old.some(item => this.db.prepare("SELECT 1 FROM publications WHERE binding_id=? AND status IN ('queued','uploading')").get(item.id)), 'An upload to the channel being replaced is running. Wait for it or let it stop first.', 409);
      for (const item of old) { this.db.prepare("UPDATE youtube_bindings SET status='replaced', secret=NULL, updated_at=? WHERE id=?").run(now(), item.id); this.tokens.delete(item.id); }
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
    requireValue(row.secret && row.status === 'active', 'Connect this channel again (Room 11).', 409);
    const cached = this.tokens.get(row.id);
    if (cached && cached.expiresAt > Date.now()) return cached.accessToken;
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
  queueUpload(contentId, input, {auto = false} = {}) {
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
      this.db.prepare("INSERT INTO publications(id,family_id,content_id,locale,kind,render_id,approval_id,binding_id,channel_id,status,metadata,sha256,size,recipe,auto,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'queued',?,?,?,?,?,?,?,?)")
        .run(id, content.familyId, contentId, locale, item.kind, item.renderId, item.approvalId, binding.id, binding.channel_id, JSON.stringify(body), video.sha256, file.size, this.currentRecipe(content.familyId, locale), auto ? 1 : 0, by, at, at);
      this.store.event(`Queued the private upload of "${content.title}" (${locale}) to "${binding.channel_title}"`);
      return this.publicPublication(this.publicationRow(id));
    });
  }

  // ------------------------------------------------------------ the upload
  claim() {
    return this.store.transaction(() => {
      // A paused family's queued uploads wait (the pause holds them; nothing new starts).
      const row = this.db.prepare("SELECT * FROM publications WHERE status='queued' ORDER BY created_at, rowid").all().find(item => !this.paused(item.family_id));
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
    try { return await this.upload() || await this.attachNext() || await this.checkNext() || await this.autopilotNext(); } finally { this.busy = false; }
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
        if (this.paused(job.family_id)) throw new InputError('Publishing was paused, so the upload stopped between chunks.');
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
      // An upload that needed more than one run was recovered without a second copy (the gate's recovery drill).
      set("status='uploaded', video_id=?, sent=size, session=NULL, next_check_at=?, error=NULL, recovered=?", [video.id, now(), job.attempts >= 1 ? 1 : 0]);
      this.quota.settle(job.id, {'youtube-upload': 1});
      this.store.event(`Uploaded "${this.store.content(job.content_id).title}" (${job.locale}) privately as ${video.id}`);
    });
    return this.publicPublication(this.publicationRow(job.id));
  }
  // Processing after the upload, checked conservatively (1 unit a check, from the shared daily bucket).
  async checkNext(id = null) {
    const row = id ? this.publicationRow(id) : this.db.prepare("SELECT * FROM publications WHERE status IN ('uploaded','processing','scheduled') AND next_check_at<=? ORDER BY next_check_at LIMIT 1").get(now());
    if (!row) return null;
    requireValue(row.video_id && ['uploaded', 'processing', 'processed', 'scheduled', 'published', 'kept_private'].includes(row.status), 'This upload has no video to check yet.', 409);
    const job = `${row.id}:check:${row.checks + 1}`, reserved = this.store.transaction(() => this.quota.reserve(job, {youtube: 1}));
    const later = (status, error, extra = {}) => this.db.prepare('UPDATE publications SET status=?, error=?, processing=COALESCE(?, processing), checks=checks+1, next_check_at=?, updated_at=? WHERE id=?')
      .run(status, error, extra.processing ? JSON.stringify(extra.processing) : null, extra.next ?? null, now(), row.id);
    if (!reserved.ok) { later(row.status, `The daily YouTube unit limit (${reserved.cap}) is used up; the next check waits.`, {next: new Date(Date.now() + 3600000).toISOString()}); return null; }
    try {
      if (['scheduled', 'published', 'kept_private'].includes(row.status)) {
        await this.observe(row, (status, error, seen, next) => this.db.prepare('UPDATE publications SET status=?, error=?, visibility=?, checks=checks+1, next_check_at=?, updated_at=? WHERE id=?').run(status, error, JSON.stringify(seen), next, now(), row.id));
        this.quota.settle(job, {youtube: 1});
        return this.publicPublication(this.publicationRow(row.id));
      }
      const token = await this.accessToken(this.bindingRow(row.binding_id)), state = await G.videoStatus(this.fetch, token, row.video_id);
      this.quota.settle(job, {youtube: 1});
      if (!state.found) later('failed', 'YouTube no longer finds this video (it was deleted or is not on this channel).');
      else if (['failed', 'rejected', 'deleted'].includes(state.uploadStatus) || state.processingStatus === 'failed') later('failed', `YouTube ${state.uploadStatus === 'rejected' ? `rejected the video (${state.rejectionReason || 'no reason given'})` : `could not process the video (${state.failureReason || state.processingStatus || state.uploadStatus})`}.`, {processing: state});
      else if (state.uploadStatus === 'processed' || state.processingStatus === 'succeeded') { later('processed', null, {processing: state}); this.prepareAttachments(row.id); }
      else later('processing', row.checks + 1 >= MAX_CHECKS ? 'Still processing after two hours of checks; use "Check now" later.' : null, {processing: state, next: row.checks + 1 >= MAX_CHECKS ? null : new Date(Date.now() + CHECK_EVERY).toISOString()});
    } catch (error) {
      if (error.unknown) this.quota.markUnknown(job); else if (answered(error)) this.quota.settle(job, {youtube: 1}); else this.quota.release(job);
      later(row.status, error instanceof InputError ? error.message : 'The check failed.', {next: new Date(Date.now() + CHECK_EVERY * 5).toISOString()});
    }
    return this.publicPublication(this.publicationRow(row.id));
  }

  // ------------------------------------------------------------ Y02 attachments
  // The approved thumbnail (Room 09, or the edition's own) and the captions the edit made, for this record's video.
  assets(row) {
    const scope = JSON.parse(this.renders.row(row.render_id).scope), out = {thumbnail: null, captions: null};
    if (row.kind === 'master') {
      const pkg = this.packaging.latestRow(row.content_id), chosen = pkg ? JSON.parse(pkg.payload).chosenThumbnail : null;
      out.thumbnail = chosen ? JSON.parse(pkg.images || '{}')[chosen] || null : null;
    } else out.thumbnail = scope.edition?.thumbnail || null;
    if (scope.edit?.timeline?.captions?.groups?.length) out.captions = {text: Cap.srt(scope.edit.timeline.captions), language: row.locale, name: L.language(row.locale)};
    return out;
  }
  prepareAttachments(id) {
    const row = this.publicationRow(id);
    if (row.attachments) return;
    const assets = this.assets(row);
    this.db.prepare('UPDATE publications SET attachments=?, updated_at=? WHERE id=?').run(JSON.stringify({thumbnail: {status: assets.thumbnail ? 'pending' : 'none'}, captions: {status: assets.captions ? 'pending' : 'none'}}), now(), id);
  }
  // Attachments are tried once by themselves after processing; a failed one is retried alone, by the owner.
  async attachNext() {
    // A video processed before attachments existed (or before this check) gets its list now.
    const fresh = this.db.prepare("SELECT id FROM publications WHERE status='processed' AND attachments IS NULL LIMIT 1").get();
    if (fresh) this.prepareAttachments(fresh.id);
    const row = this.db.prepare("SELECT * FROM publications WHERE status='processed' AND attachments LIKE '%\"pending\"%' ORDER BY updated_at").all().find(item => !this.paused(item.family_id));
    if (!row) return null;
    const kind = ['thumbnail', 'captions'].find(item => JSON.parse(row.attachments)[item].status === 'pending');
    await this.runAttach(row, kind);
    return this.publicPublication(this.publicationRow(row.id));
  }
  async runAttach(row, kind) {
    const attachments = JSON.parse(row.attachments), before = attachments[kind].status, lookFirst = kind === 'captions' && before === 'unknown';
    const units = (kind === 'thumbnail' ? 50 : 400) + (lookFirst ? 50 : 0), job = `${row.id}:${kind}:${Date.now()}`;
    const set = value => { attachments[kind] = {...value, at: now()}; this.db.prepare('UPDATE publications SET attachments=?, updated_at=? WHERE id=?').run(JSON.stringify(attachments), now(), row.id); };
    const reserved = this.store.transaction(() => this.quota.reserve(job, {youtube: units}));
    if (!reserved.ok) { set({status: 'failed', error: `The daily YouTube unit limit (${reserved.cap}) is used up. Retry tomorrow.`}); return; }
    let used = 0;
    try {
      const token = await this.accessToken(this.bindingRow(row.binding_id)), asset = this.assets(row)[kind];
      requireValue(asset, `This video has no ${kind === 'thumbnail' ? 'approved thumbnail' : 'captions'} any more.`, 409);
      if (kind === 'thumbnail') {
        const file = this.renders.localFile(asset.relativePath);
        requireValue(fs.existsSync(file) && R.fileSha256(file) === asset.sha256, 'The approved thumbnail file is missing or changed.', 409);
        await G.setThumbnail(this.fetch, token, row.video_id, fs.readFileSync(file));
        used = 50;
        set({status: 'done', sha256: asset.sha256});
      } else {
        // An insert whose answer was lost may have added the track: look before adding it again.
        if (lookFirst) {
          const found = (await G.listCaptions(this.fetch, token, row.video_id)).find(track => track.language === asset.language && track.name === asset.name);
          used = 50;
          if (found) { set({status: 'done', captionId: found.id, language: asset.language}); this.quota.settle(job, {youtube: used}); return; }
        }
        const captionId = await G.insertCaption(this.fetch, token, {videoId: row.video_id, ...asset});
        used += 400;
        set({status: 'done', captionId, language: asset.language});
      }
      this.quota.settle(job, {youtube: used});
    } catch (error) {
      if (error.unknown) this.quota.markUnknown(job); else this.quota.settle(job, {youtube: answered(error) ? units : used});
      set({status: kind === 'captions' && error.unknown ? 'unknown' : 'failed', error: error instanceof InputError ? error.message : 'The attachment failed.'});
    }
  }
  async retryAttachment(id, input) {
    object(input);
    const row = this.publicationRow(id), kind = input.kind;
    requireValue(['thumbnail', 'captions'].includes(kind), 'Choose the thumbnail or the captions.', 400);
    requireValue(['processed', 'scheduled'].includes(row.status) && row.attachments, 'Attachments are added once YouTube has processed the video.', 409);
    const attachments = JSON.parse(row.attachments);
    requireValue(['failed', 'unknown'].includes(attachments[kind].status), 'Only a failed attachment is retried.', 409);
    await this.runAttach(row, kind);
    return this.publicPublication(this.publicationRow(id));
  }

  // ------------------------------------------------------------ Y02 schedule
  // The time a processed private video goes public, set only when everything mandatory is in place and confirmed.
  async schedule(id, input) {
    object(input);
    const by = person(input.scheduledBy, 'Your name'), row = this.publicationRow(id);
    requireValue(row.status === 'processed', 'Only a processed private upload can be scheduled.', 409);
    requireValue(this.bindingRow(row.binding_id).status === 'active', 'Connect this channel again (Room 11) before scheduling.', 409);
    const item = this.deliverable(row.content_id, row.locale);
    requireValue(item.renderId === row.render_id && item.approvalId === row.approval_id, 'A different video or approval stands now for this language: this upload is no longer the approved one.', 409);
    const attachments = JSON.parse(row.attachments || '{}'), waive = input.waive && typeof input.waive === 'object' ? input.waive : {};
    for (const kind of ['thumbnail', 'captions']) {
      const status = attachments[kind]?.status, label = kind === 'thumbnail' ? 'custom thumbnail' : 'captions';
      requireValue(status !== 'pending' && status !== undefined, `The ${label} is still being attached. Wait a moment.`, 409);
      if (['failed', 'unknown'].includes(status)) requireValue(waive[kind] === true, `The ${label} did not attach (${attachments[kind].error || status}). Retry it, or confirm scheduling without it.`, 409);
    }
    const timeZone = text(input.timeZone, 'Time zone', 3, 60), publishAt = G.zonedToUtc(input.local, timeZone), at = Date.parse(publishAt);
    requireValue(at >= Date.now() + 30 * 60000, 'Choose a time at least 30 minutes from now. (YouTube would publish a time in the past at once.)', 400);
    requireValue(at <= Date.now() + 365 * 86400000, 'Choose a time within the next year.', 400);
    const meta = JSON.parse(row.metadata), c = object(input.confirmations, 'Confirmations');
    requireValue(c.settings === true, `Confirm the audience settings: made for kids ${meta.status.selfDeclaredMadeForKids ? 'yes' : 'no'}, altered or synthetic content ${meta.status.containsSyntheticMedia ? 'yes' : 'no'}.`);
    requireValue(c.audit === true, 'Confirm that YouTube has approved your Google project in its API audit. Until then YouTube keeps uploads from the API private, and the video would not go public at this time.');
    const job = `${row.id}:schedule:${Date.now()}`, reserved = this.store.transaction(() => this.quota.reserve(job, {youtube: 51}));
    requireValue(reserved.ok, `The daily YouTube unit limit (${reserved.cap}) is used up. Schedule tomorrow.`, 409);
    try {
      const token = await this.accessToken(this.bindingRow(row.binding_id)), current = await G.currentStatus(this.fetch, token, row.video_id);
      requireValue(current.privacyStatus === 'private', `YouTube shows this video as ${current.privacyStatus}. Only a private video that was never public can be scheduled.`, 409);
      await G.setSchedule(this.fetch, token, row.video_id, current, publishAt);
      this.quota.settle(job, {youtube: 51});
    } catch (error) { if (error.unknown) this.quota.markUnknown(job); else if (answered(error)) this.quota.settle(job, {youtube: 51}); else this.quota.release(job); throw error; }
    const schedule = {publishAt, timeZone, local: input.local, scheduledBy: by, at: now(), waived: ['thumbnail', 'captions'].filter(kind => waive[kind] === true && ['failed', 'unknown'].includes(attachments[kind]?.status)), auditConfirmedBy: by};
    this.db.prepare("UPDATE publications SET status='scheduled', schedule=?, checks=0, next_check_at=?, error=NULL, updated_at=? WHERE id=?").run(JSON.stringify(schedule), new Date(at + 5 * 60000).toISOString(), now(), id);
    this.store.event(`Scheduled "${this.store.content(row.content_id).title}" (${row.locale}) to go public ${G.wallClock(publishAt, timeZone)} ${timeZone}, by ${by}`);
    return this.publicPublication(this.publicationRow(id));
  }
  async unschedule(id, input) {
    object(input);
    const by = person(input.requestedBy), row = this.publicationRow(id), schedule = JSON.parse(row.schedule || 'null');
    requireValue(row.status === 'scheduled' && Date.parse(schedule.publishAt) > Date.now() + 60000, 'Only a schedule that has not happened yet can be cancelled.', 409);
    const job = `${row.id}:unschedule:${Date.now()}`, reserved = this.store.transaction(() => this.quota.reserve(job, {youtube: 51}));
    requireValue(reserved.ok, `The daily YouTube unit limit (${reserved.cap}) is used up. Remove the schedule in YouTube Studio instead.`, 409);
    try {
      const token = await this.accessToken(this.bindingRow(row.binding_id));
      await G.setSchedule(this.fetch, token, row.video_id, await G.currentStatus(this.fetch, token, row.video_id), null);
      this.quota.settle(job, {youtube: 51});
    } catch (error) { if (error.unknown) this.quota.markUnknown(job); else if (answered(error)) this.quota.settle(job, {youtube: 51}); else this.quota.release(job); throw error; }
    this.db.prepare("UPDATE publications SET status='processed', schedule=NULL, next_check_at=NULL, error=?, updated_at=? WHERE id=?").run(`The schedule for ${schedule.publishAt} was cancelled by ${by}; the video stays private.`, now(), id);
    this.store.event(`Cancelled the schedule of "${this.store.content(row.content_id).title}" (${row.locale}), by ${by}`);
    return this.publicPublication(this.publicationRow(id));
  }
  // After its time: did YouTube really make it public? Checked 5 minutes after, then every 30 minutes, six times.
  async observe(row, set) {
    const token = await this.accessToken(this.bindingRow(row.binding_id)), current = await G.currentStatus(this.fetch, token, row.video_id), seen = {privacyStatus: current.privacyStatus, publishAt: current.publishAt || null, observedAt: now()};
    if (current.privacyStatus === 'public') { set('published', null, seen, null); this.store.event(`"${this.store.content(row.content_id).title}" (${row.locale}) is public on YouTube (${row.video_id})`); return; }
    if (current.publishAt && Date.parse(current.publishAt) > Date.now()) { set('scheduled', current.publishAt !== JSON.parse(row.schedule).publishAt ? `The time was changed in YouTube Studio to ${current.publishAt}.` : null, seen, new Date(Date.parse(current.publishAt) + 5 * 60000).toISOString()); return; }
    if (row.checks + 1 >= 6) { set('kept_private', 'YouTube kept the video private after its time. Either your Google project is not yet approved in YouTube\'s API audit, or the schedule was removed in YouTube Studio.', seen, null); return; }
    set('scheduled', 'The time has passed and YouTube still shows the video as private; checking again in 30 minutes.', seen, new Date(Date.now() + 30 * 60000).toISOString());
  }

  // ------------------------------------------------------------ Y03 rules, gate, pauses and alerts
  // What makes this language's videos now: the family's format and niche, its assigned style and this language's voice.
  currentRecipe(familyId, locale) {
    const family = this.store.family(familyId), style = this.renders.styles?.handoffs().find(item => item.familyId === familyId)?.revisionId || null;
    const voice = locale === family.primaryLocale ? this.store.voiceProfiles(familyId).at(-1) : this.localization.voiceOf(this.localization.latestVoice(familyId, locale));
    return A.recipeKey({format: family.format, niche: family.niche, style, voice: voice ? `${voice.id}:${voice.revision}:${voice.provider}:${voice.model}` : null});
  }
  policyRow(familyId) { return this.db.prepare('SELECT * FROM publishing_policies WHERE family_id=? ORDER BY revision DESC LIMIT 1').get(familyId) || null; }
  policy(familyId) { const row = this.policyRow(familyId); return row ? {...JSON.parse(row.payload), revision: row.revision, createdBy: row.created_by, createdAt: row.created_at} : null; }
  paused(familyId) {
    const row = this.db.prepare("SELECT key, reason, by_name, at FROM publishing_controls WHERE paused=1 AND key IN ('portfolio', ?) ORDER BY key='portfolio' DESC LIMIT 1").get(`family:${familyId}`);
    return row ? {scope: row.key === 'portfolio' ? 'portfolio' : 'family', reason: row.reason, by: row.by_name, at: row.at} : null;
  }
  setPause(input) {
    object(input);
    const by = person(input.requestedBy), scope = input.scope === 'portfolio' ? 'portfolio' : `family:${this.store.family(text(input.familyId, 'Family', 8, 80)).id}`, pause = input.paused === true;
    const reason = pause ? text(input.reason || 'Paused by the owner.', 'Reason', 3, 300) : null;
    this.db.prepare('INSERT INTO publishing_controls(key,paused,reason,by_name,at) VALUES(?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET paused=excluded.paused, reason=excluded.reason, by_name=excluded.by_name, at=excluded.at').run(scope, pause ? 1 : 0, reason, by, now());
    this.store.event(`${pause ? 'Paused' : 'Resumed'} publishing for ${scope === 'portfolio' ? 'every family' : this.store.family(scope.slice(7)).name}, by ${by}${pause ? `: ${reason}` : ''}`);
    return this.state();
  }
  // The gate, measured from this family's own records.
  gateFor(familyId) {
    const family = this.store.family(familyId), rows = this.db.prepare("SELECT * FROM publications WHERE family_id=? AND status NOT IN ('discarded','queued') ORDER BY created_at DESC, rowid DESC").all(familyId);
    const recipes = new Map(family.locales.map(locale => [locale, this.currentRecipe(familyId, locale)]));
    const history = rows.filter(row => ['published', 'failed', 'kept_private'].includes(row.status) || row.incident).map(row => ({status: row.status, current: row.recipe === recipes.get(row.locale), incident: row.incident ? JSON.parse(row.incident) : null}));
    // A table another room creates may not exist in a smaller setup: it then has nothing to count.
    const count = (sql, ...args) => { try { return this.db.prepare(sql).get(...args).n; } catch { return 0; } };
    const unknownCharges = count("SELECT count(*) AS n FROM intelligence_usage WHERE family_id=? AND status='unknown'", familyId) + count("SELECT count(*) AS n FROM voice_usage WHERE family_id=? AND status='unknown'", familyId) + count("SELECT count(*) AS n FROM edition_narrations WHERE family_id=? AND usage_status='unknown'", familyId);
    const accessIssues = [];
    if (!this.connectors.list().some(item => item.provider === 'youtube-oauth' && item.hasKey && item.test?.status === 'passed')) accessIssues.push('The Google client connection is missing or not tested.');
    const bindings = family.locales.map(locale => ({locale, binding: this.activeBinding(familyId, locale)}));
    if (!bindings.some(item => item.binding?.status === 'active')) accessIssues.push('No channel of this family is connected.');
    for (const item of bindings.filter(entry => entry.binding?.status === 'reconnect')) accessIssues.push(`Google asked to connect the ${item.locale} channel again.`);
    const open = count("SELECT count(*) AS n FROM publications WHERE family_id=? AND status IN ('interrupted','unknown')", familyId);
    if (open) accessIssues.push(`${open} upload${open === 1 ? ' has' : 's have'} an open outcome (stopped or unknown).`);
    const published = rows.filter(row => row.status === 'published').length;
    const cost = {videos: published, voiceCents: count("SELECT COALESCE(SUM(estimated_cost_cents),0) AS n FROM voice_usage WHERE family_id=? AND status='settled'", familyId), tokens: count("SELECT COALESCE(SUM(total_tokens),0) AS n FROM intelligence_usage WHERE family_id=? AND status='settled'", familyId)};
    return A.gate({history, recovered: rows.filter(row => row.recovered).length, unknownCharges, accessIssues, cost});
  }
  // Unattended only while the owner chose it, nothing is paused and the gate still passes; otherwise review.
  effective(familyId) {
    const policy = this.policy(familyId), pause = this.paused(familyId);
    // A pause holds every level: nothing new starts, not even an upload queued by hand.
    if (pause) return {level: 'paused', reason: `Paused${pause.scope === 'portfolio' ? ' for every family' : ''} by ${pause.by}: ${pause.reason}. Nothing new starts; videos YouTube already accepted keep their schedule.`};
    if (!policy || policy.level !== 'unattended') return {level: 'review', reason: 'Every upload and schedule waits for your click.'};
    const gate = this.gateFor(familyId);
    if (!gate.passed) return {level: 'review', reason: `Unattended publishing is switched on but its gate no longer passes, so the family is back to review: ${gate.checks.find(check => !check.passed).detail}`};
    return {level: 'unattended', reason: `Approved videos are uploaded and scheduled into ${A.windowText(policy.windows)} (${policy.timeZone}) by the rules of revision ${policy.revision}.`};
  }
  setPolicy(familyId, input) {
    object(input);
    const by = person(input.updatedBy, 'Your name'), family = this.store.family(familyId);
    let rules;
    try { rules = A.validatePolicy(input.rules); } catch (error) { throw new InputError(error.message, 400); }
    const current = this.policyRow(familyId);
    requireValue((current?.revision || 0) === input.expectedRevision, 'The rules changed in another tab. Reload before saving.', 409);
    if (rules.level === 'unattended') {
      const gate = this.gateFor(familyId);
      if (!gate.passed) throw new InputError(`Unattended publishing stays locked until the gate passes: ${gate.checks.find(check => !check.passed).detail}`, 409);
      const c = object(input.confirmations, 'Confirmations');
      requireValue(c.rules === true, 'Confirm that the program may upload and schedule this family\'s approved videos by these rules without asking.');
      requireValue(c.audit === true, 'Confirm that YouTube has approved your Google project in its API audit (otherwise nothing it schedules goes public).');
      rules.enabledBy = by;
    }
    const revision = (current?.revision || 0) + 1;
    this.db.prepare('INSERT INTO publishing_policies(id,family_id,revision,payload,created_by,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(), familyId, revision, JSON.stringify(rules), by, now());
    this.store.event(`Publishing rules r${revision} for ${family.name}: ${rules.level === 'unattended' ? 'unattended publishing switched on' : 'review before publishing'}, by ${by}`);
    return this.automation(familyId);
  }
  // Exceptions return to the control room: one open alert per family, video and kind.
  raise(familyId, publicationId, kind, message) {
    if (this.db.prepare('SELECT 1 FROM publishing_alerts WHERE family_id=? AND COALESCE(publication_id, \'\')=? AND kind=? AND resolved_at IS NULL').get(familyId, publicationId || '', kind)) return;
    this.db.prepare('INSERT INTO publishing_alerts(id,family_id,publication_id,kind,message,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(), familyId, publicationId, kind, message, now());
    this.store.event(`Publishing alert (${this.store.family(familyId).name}): ${message}`);
  }
  acknowledge(id, input) {
    object(input);
    const by = person(input.requestedBy);
    this.db.prepare('UPDATE publishing_alerts SET resolved_at=?, resolved_by=? WHERE id=? AND resolved_at IS NULL').run(now(), by, text(id, 'Alert', 8, 80));
    return this.state();
  }
  // A material error found after the fact: it ends the clean run (and so any unattended publishing) until ten more.
  report(id, input) {
    object(input);
    const by = person(input.reportedBy), row = this.publicationRow(id), kind = input.kind;
    requireValue(Object.hasOwn(A.INCIDENTS, kind), 'Choose a factual, rights, language or destination error.', 400);
    requireValue(row.video_id, 'Only an uploaded video can have a reported error.', 409);
    const note = text(input.note, 'What went wrong', 5, 500);
    this.db.prepare('UPDATE publications SET incident=?, updated_at=? WHERE id=?').run(JSON.stringify({kind, note, by, at: now()}), now(), id);
    this.raise(row.family_id, id, 'incident', `A ${kind} error was reported on "${JSON.parse(row.metadata).snippet.title}" (${row.locale}) by ${by}: ${note}`);
    return this.publicPublication(this.publicationRow(id));
  }
  // The autopilot: one step per round, only for families that are unattended now. It never pays for anything, never
  // waives an attachment and never repeats an upload; whatever it cannot do itself becomes an alert.
  async autopilotNext() {
    for (const family of this.store.families().filter(item => !item.archived)) {
      const policy = this.policy(family.id);
      if (policy?.level !== 'unattended') continue;
      const state = this.effective(family.id);
      if (state.level === 'review') { this.raise(family.id, null, 'gate', state.reason); continue; }
      if (state.level !== 'unattended') continue;
      for (const row of this.db.prepare("SELECT * FROM publications WHERE family_id=? AND auto=1 AND status IN ('failed','interrupted','unknown','kept_private')").all(family.id))
        this.raise(family.id, row.id, row.status, `The automatic upload of "${JSON.parse(row.metadata).snippet.title}" (${row.locale}) needs you: ${row.error || row.status}`);
      for (const locale of family.locales) if (this.activeBinding(family.id, locale)?.status === 'reconnect') this.raise(family.id, null, `reconnect:${locale}`, `Google asked to connect the ${locale} channel again.`);
      // Schedule a processed automatic upload into the next free window of its channel.
      for (const row of this.db.prepare("SELECT * FROM publications WHERE family_id=? AND auto=1 AND status='processed' AND attachments IS NOT NULL").all(family.id)) {
        const attachments = JSON.parse(row.attachments);
        if (Object.values(attachments).some(item => item.status === 'pending')) continue;
        if (Object.values(attachments).some(item => ['failed', 'unknown'].includes(item.status))) { this.raise(family.id, row.id, 'attachment', `"${JSON.parse(row.metadata).snippet.title}" (${row.locale}): an attachment did not go on (${Object.entries(attachments).filter(([, item]) => ['failed', 'unknown'].includes(item.status)).map(([kind]) => kind).join(', ')}). Retry it or schedule by hand; the autopilot never schedules without it.`); continue; }
        const taken = this.db.prepare("SELECT schedule FROM publications WHERE channel_id=? AND status='scheduled'").all(row.channel_id).map(item => Date.parse(JSON.parse(item.schedule).publishAt));
        const publishAt = A.nextWindow({windows: policy.windows, timeZone: policy.timeZone, after: Date.now() + policy.minLeadHours * 3600000, taken});
        if (!publishAt) { this.raise(family.id, row.id, 'window', 'No free publication window in the next five weeks. Add windows to the rules.'); continue; }
        const local = new Intl.DateTimeFormat('sv-SE', {timeZone: policy.timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(new Date(publishAt)).replace(' ', 'T');
        try { return await this.schedule(row.id, {scheduledBy: `Autopilot (rules r${policy.revision} of ${policy.enabledBy})`, local, timeZone: policy.timeZone, confirmations: {settings: true, audit: true}}); } catch (error) { this.raise(family.id, row.id, 'schedule', `Scheduling "${JSON.parse(row.metadata).snippet.title}" failed: ${error.message}`); }
      }
      // Upload the next approved video that has no record yet, within the day and week limits.
      const recent = since => this.db.prepare('SELECT count(*) AS n FROM publications WHERE family_id=? AND auto=1 AND created_at>=?').get(family.id, new Date(Date.now() - since).toISOString()).n;
      if (recent(86400000) >= policy.maxPerDay || recent(7 * 86400000) >= policy.maxPerWeek) continue;
      for (const content of this.store.contents().filter(item => item.familyId === family.id && item.state === 'approved')) {
        for (const locale of family.locales) {
          if (this.activeBinding(family.id, locale)?.status !== 'active' || this.db.prepare("SELECT 1 FROM publications WHERE content_id=? AND locale=? AND status!='discarded'").get(content.id, locale)) continue;
          try { this.deliverable(content.id, locale); } catch { continue; }
          try { return this.queueUpload(content.id, {requestedBy: `Autopilot (rules r${policy.revision} of ${policy.enabledBy})`, locale, madeForKids: policy.madeForKids, categoryId: policy.categoryId}, {auto: true}); } catch (error) { this.raise(family.id, null, `queue:${content.id}:${locale}`, `Could not queue "${content.title}" (${locale}): ${error.message}`); }
        }
      }
    }
    return null;
  }
  automation(familyId) {
    const policy = this.policy(familyId);
    return {familyId, policy: policy ? {...policy, windowText: A.windowText(policy.windows)} : null, effective: this.effective(familyId), gate: this.gateFor(familyId), paused: this.paused(familyId),
      alerts: this.db.prepare('SELECT * FROM publishing_alerts WHERE family_id=? AND resolved_at IS NULL ORDER BY created_at DESC LIMIT 30').all(familyId).map(row => ({id: row.id, kind: row.kind, message: row.message, publicationId: row.publication_id, createdAt: row.created_at}))};
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
      this.store.transaction(() => { this.db.prepare("UPDATE publications SET status='uploaded', video_id=?, session=NULL, candidates=NULL, next_check_at=?, error=NULL, recovered=1, updated_at=? WHERE id=?").run(found[0].videoId, now(), now(), id); this.quota.settle(row.id, {'youtube-upload': 1}); });
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
    this.store.transaction(() => { this.db.prepare("UPDATE publications SET status='uploaded', video_id=?, session=NULL, candidates=NULL, next_check_at=?, error=NULL, recovered=1, updated_at=? WHERE id=?").run(input.videoId, now(), now(), id); this.quota.settle(row.id, {'youtube-upload': 1}); });
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
      studioUrl: row.video_id ? `https://studio.youtube.com/video/${row.video_id}/edit` : null, watchUrl: row.status === 'published' ? `https://www.youtube.com/watch?v=${row.video_id}` : null,
      auto: !!row.auto, incident: row.incident ? JSON.parse(row.incident) : null, attachments: row.attachments ? JSON.parse(row.attachments) : null, visibility: row.visibility ? JSON.parse(row.visibility) : null,
      schedule: row.schedule ? (() => { const s = JSON.parse(row.schedule), family = this.store.family(row.family_id); return {...s, there: G.wallClock(s.publishAt, s.timeZone), home: G.wallClock(s.publishAt, family.timezone), homeZone: family.timezone}; })() : null,
      // A scheduled video stays scheduled on YouTube even when the approval behind it changes here: say so.
      standing: ['scheduled', 'processed'].includes(row.status) ? (() => { try { const item = this.deliverable(row.content_id, row.locale); return item.renderId === row.render_id && item.approvalId === row.approval_id; } catch { return false; } })() : null};
  }
  state() {
    const families = this.store.families().filter(family => !family.archived);
    return {
      busy: !!this.db.prepare("SELECT 1 FROM publications WHERE status IN ('queued','uploading') OR (status IN ('uploaded','processing') AND next_check_at IS NOT NULL) OR (status='processed' AND attachments LIKE '%\"pending\"%') LIMIT 1").get(),
      quota: this.quota.summary(), portfolioPause: (() => { const row = this.db.prepare("SELECT * FROM publishing_controls WHERE key='portfolio' AND paused=1").get(); return row ? {reason: row.reason, by: row.by_name, at: row.at} : null; })(),
      families: families.map(family => ({familyId: family.id, automation: this.automation(family.id), locales: family.locales.map(locale => {
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
