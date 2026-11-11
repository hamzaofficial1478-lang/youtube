'use strict';
// 0.107 - Watching competitor videos (owner request 2026-11-11; the brain is in watch.js, the Gemini client in gemini.js).
// The owner ticks videos of each competitor (the latest scan offers the best performers first, "Videos to watch per
// channel" sets how many) or pastes links, or names a video file they saved on this PC. Each video is watched once per
// click (Gemini from its link or the file; Claude or ChatGPT from the file's frames and the owner's transcript), inside a
// reservation, never retried by itself except after a lost connection or a restart (NetRetry). Each answer is one
// document per subject the owner ticked for that channel plus retention and where to beat it. The roadmap reads every
// watched video of the channel family and, approved by name, becomes one pin-only skill per process pinned to this family,
// so its steps lead every job of that process as numbered directives.
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {InputError} = require('./store');
const R = require('./render');
const W = require('./watch');
const Direct = require('./direct');
const live = require('./live');
const {AiError} = require('./ai');
const {GeminiClient, GeminiError, videoId, watchUrl, DEFAULT_MODEL} = require('./gemini');
const {connectorReference, connectorCurrent} = require('./intel-sources');
const {sheetArgs, mainColours} = require('./style-study');
const {docxFile} = require('./documents');

const requireValue = (ok, message, status = 400) => { if (!ok) throw new InputError(message, status); };
const now = () => new Date().toISOString();
const object = (value, label = 'Request') => requireValue(value && typeof value === 'object' && !Array.isArray(value), `${label} must be a JSON object.`);
const text = (value, label, min, max) => { const v = String(value ?? '').trim(); requireValue(v.length >= min && v.length <= max && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v), `${label} must be ${min}-${max} characters.`); return v; };
const person = (value, label = 'Your name') => text(value, label, 2, 80);
const competitorKey = item => `${item.kind}:${item.value.toLowerCase()}`;
const VIDEO = /\.(mp4|m4v|mov|mkv|webm|avi)$/i;
const ACTIVE = ['queued', 'running'];
const RETRYABLE = ['failed', 'interrupted', 'quality_failed', 'blocked_budget', 'blocked_quota', 'stale'];
const PER_SHEET = 9, TOKENS_PER_SHEET = 1700, PROMPT_TOKENS = 8000, ANSWER_TOKENS = 32000, ROADMAP_ANSWER = 32000;
const TRANSCRIPT_CHARS = 60000, MAX_FILE = 2 * 1024 ** 3;
const ENGINE_LABEL = {gemini: 'Gemini (picture and sound)', frames: 'frames and transcript'};

class VideoWatcher {
  constructor(store, {connectors, quota, intel, ai, renders, skills = null, watchDir = null, fetch: fetchImpl = fetch, sleep} = {}) {
    Object.assign(this, {store, db: store.db, connectors, quota, intel, ai, renders, skills, fetch: fetchImpl, sleep});
    this.watchDir = watchDir || path.join(store.artifactRoot || require('node:os').tmpdir(), 'watches');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS competitor_video_watches(id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id), competitor_key TEXT, channel TEXT, title TEXT NOT NULL, url TEXT, video_id TEXT,
        source TEXT NOT NULL, file_path TEXT, engine TEXT NOT NULL, connector TEXT NOT NULL, model TEXT, subjects TEXT NOT NULL, transcript TEXT, status TEXT NOT NULL, measured TEXT, result TEXT, warnings TEXT,
        usage TEXT, error TEXT, attempts INTEGER NOT NULL DEFAULT 0, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, removed_at TEXT);
      CREATE TABLE IF NOT EXISTS competitor_roadmaps(id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id), revision INTEGER NOT NULL, status TEXT NOT NULL, connector TEXT NOT NULL, scope TEXT NOT NULL,
        result TEXT, warnings TEXT, review TEXT, applied TEXT, usage TEXT, error TEXT, attempts INTEGER NOT NULL DEFAULT 0, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(family_id, revision));
    `);
    // A watch or roadmap running when the program stopped may already have been charged: it waits for a confirmed retry
    // (NetRetry tries it again by itself within the hour, as for every job a restart cut off).
    for (const table of ['competitor_video_watches', 'competitor_roadmaps']) for (const row of this.db.prepare(`SELECT id FROM ${table} WHERE status='running'`).all()) {
      this.db.prepare(`UPDATE ${table} SET status='interrupted', error='The program stopped while this was running. What it used is unknown; retry when you want to.', updated_at=? WHERE id=?`).run(now(), row.id);
      this.db.prepare("UPDATE intelligence_usage SET status='unknown', updated_at=? WHERE job_id=? AND status='reserved'").run(now(), row.id);
      this.quota.markUnknown(row.id);
    }
  }
  row(id) { const row = this.db.prepare('SELECT * FROM competitor_video_watches WHERE id=? AND removed_at IS NULL').get(id); requireValue(row, 'Watched video not found.', 404); return row; }
  roadmapRow(id) { const row = this.db.prepare('SELECT * FROM competitor_roadmaps WHERE id=?').get(id); requireValue(row, 'Roadmap not found.', 404); return row; }
  settings(familyId) { const s = this.intel.settings(familyId); return {watchPerChannel: s.watchPerChannel, geminiModel: s.geminiModel || DEFAULT_MODEL}; }
  // What the owner ticked to learn from one channel; every subject when nothing was ticked for it.
  subjectsFor(familyId, key) {
    const picked = key ? this.intel.picks(familyId).picks[key] : null;
    return picked?.length ? W.SUBJECTS.filter(subject => picked.includes(subject)) : [...W.SUBJECTS];
  }

  // ------------------------------------------------------------ choosing videos
  // Each channel's videos from the newest scan, best performers first: NexLev outliers, then NexLev videos by views
  // (long ones first for a long-form channel), then YouTube's list. A title from YouTube's own data is sent to the
  // watcher only with the recorded YouTube derived-use approval (YouTube data stays display-only otherwise).
  candidates(familyId) {
    const family = this.store.family(familyId), settings = this.intel.settings(familyId), per = settings.watchPerChannel;
    const derived = settings.youtubeDerivedUse?.approved === true;
    const scan = this.db.prepare('SELECT result FROM competitor_scans WHERE family_id=? AND result IS NOT NULL ORDER BY created_at DESC, rowid DESC LIMIT 1').get(familyId);
    const result = scan ? JSON.parse(scan.result) : null;
    const watched = new Set(this.db.prepare("SELECT video_id FROM competitor_video_watches WHERE family_id=? AND video_id IS NOT NULL AND removed_at IS NULL AND status IN ('queued','running','watched')").all(familyId).map(row => row.video_id));
    const long = family.format !== 'shorts';
    return family.competitors.map(item => {
      const key = competitorKey(item), channel = result?.channels?.find(entry => entry.competitorKey === key);
      const nexlev = [...(channel?.nexlev?.outliers || []).slice().sort((a, b) => (b.outlierScore || 0) - (a.outlierScore || 0)), ...(channel?.nexlev?.videos || []).slice().sort((a, b) => (long ? ((b.durationSeconds || 0) > 180) - ((a.durationSeconds || 0) > 180) : 0) || (b.views || 0) - (a.views || 0))].map(video => ({...video, source: 'nexlev'}));
      const youtube = channel?.youtube && !channel.youtube.purged ? (channel.youtube.videos || []).map(video => ({...video, source: 'youtube'})) : [];
      const seen = new Set(), videos = [];
      for (const video of [...nexlev, ...youtube]) {
        if (!video?.videoId || seen.has(video.videoId)) continue;
        seen.add(video.videoId);
        videos.push({videoId: video.videoId, url: watchUrl(video.videoId), title: video.title || null, sendTitle: video.source === 'nexlev' || derived, views: video.views ?? null, outlierScore: video.outlierScore ?? null, durationSeconds: video.durationSeconds ?? null, source: video.source, watched: watched.has(video.videoId)});
      }
      let ticks = 0;
      for (const video of videos) if (!video.watched && ticks < per) { video.preTicked = true; ticks++; }
      return {competitorKey: key, name: channel?.nexlev?.about?.title || (channel?.youtube && !channel.youtube.purged ? channel.youtube.title : null) || item.value, ref: channel?.ref || null, subjects: this.subjectsFor(familyId, key), videos: videos.slice(0, 30)};
    });
  }

  // ------------------------------------------------------------ queueing
  queue(familyId, input) {
    object(input);
    const by = person(input.requestedBy);
    requireValue(Array.isArray(input.videos) && input.videos.length >= 1 && input.videos.length <= 100, 'Tick 1-100 videos or paste links.');
    return this.store.transaction(() => {
      const family = this.store.family(familyId);
      requireValue(!family.archived, 'Restore this channel family first.', 409);
      const connector = connectorReference(this.connectors, input.connector, 'gemini', 'Gemini', true);
      const keys = new Set(family.competitors.map(competitorKey)), lists = new Map(this.candidates(familyId).map(channel => [channel.competitorKey, channel]));
      const model = this.settings(familyId).geminiModel, queued = [], skipped = [];
      for (const entry of input.videos) {
        object(entry, 'Each video');
        const id = videoId(entry.url || (entry.videoId ? watchUrl(entry.videoId) : ''));
        requireValue(id, 'Each video must be a YouTube video link (youtube.com/watch?v=..., youtu.be/..., /shorts/...).');
        const key = entry.competitorKey ? String(entry.competitorKey) : null;
        requireValue(!key || keys.has(key), 'A video names a channel that is not in this family\'s competitor list.');
        if (queued.some(item => item.videoId === id)) continue;
        if (!input.again && this.db.prepare("SELECT 1 FROM competitor_video_watches WHERE family_id=? AND video_id=? AND removed_at IS NULL AND status IN ('queued','running','watched')").get(familyId, id)) { skipped.push(id); continue; }
        const known = key ? lists.get(key)?.videos.find(video => video.videoId === id) : null;
        const title = known ? (known.sendTitle && known.title ? known.title : `Video ${id}`) : entry.title ? text(entry.title, 'Title', 2, 200) : `Video ${id}`;
        queued.push({videoId: id, key, title, channel: key ? lists.get(key)?.name || null : null, durationSeconds: known?.durationSeconds || null});
      }
      requireValue(queued.length, skipped.length ? `Every video chosen was already watched or is waiting (${skipped.length}). Tick "Watch again" to study one again.` : 'Choose at least one video.', 409);
      const at = now();
      for (const item of queued) {
        this.db.prepare("INSERT INTO competitor_video_watches(id,family_id,competitor_key,channel,title,url,video_id,source,engine,connector,model,subjects,measured,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'link','gemini',?,?,?,?,'queued',?,?,?)")
          .run(randomUUID(), familyId, item.key, item.channel, item.title, watchUrl(item.videoId), item.videoId, JSON.stringify(connector), model, JSON.stringify(this.subjectsFor(familyId, item.key)), item.durationSeconds ? JSON.stringify({durationSeconds: item.durationSeconds}) : null, by, at, at);
      }
      this.store.event(`${by} asked Gemini to watch ${queued.length} competitor video(s) for ${family.name}`);
      return {queued: queued.length, skipped: skipped.length};
    });
  }
  // A video file the owner saved on this PC (never downloaded by the program), watched by Gemini (uploaded to Google,
  // deleted after the answer) or read by Claude or ChatGPT from its frames and the owner's transcript.
  queueFile(familyId, input) {
    object(input);
    const by = person(input.requestedBy), title = text(input.title, 'Video title', 2, 200);
    const file = String(input.path ?? '').trim().replace(/^"(.*)"$/, '$1');
    requireValue(file.length >= 3 && file.length <= 400 && VIDEO.test(file), 'Paste the path of a video file on this PC (mp4, m4v, mov, mkv, webm or avi).');
    let stat; try { stat = fs.statSync(file); } catch { requireValue(false, 'That file does not exist on this PC.'); }
    requireValue(stat.isFile() && stat.size > 0, 'That video file is empty.');
    const engine = input.engine === 'frames' ? 'frames' : 'gemini';
    requireValue(engine === 'frames' || stat.size <= MAX_FILE, 'Gemini takes files up to 2 GB. Use Claude or ChatGPT (frames and transcript) for this one.');
    const transcript = input.transcript ? String(input.transcript).slice(0, 400000) : null;
    if (transcript) requireValue(W.parseTranscript(transcript).words >= 20, 'The transcript has fewer than 20 words. Paste the whole transcript (SRT, WebVTT, timed lines or plain text).');
    return this.store.transaction(() => {
      const family = this.store.family(familyId);
      requireValue(!family.archived, 'Restore this channel family first.', 409);
      const connector = engine === 'gemini' ? connectorReference(this.connectors, input.connector, 'gemini', 'Gemini', true) : connectorReference(this.connectors, input.connector, 'ai', 'Claude or ChatGPT', true);
      const key = input.competitorKey ? String(input.competitorKey) : null;
      requireValue(!key || family.competitors.some(item => competitorKey(item) === key), 'That channel is not in this family\'s competitor list.');
      const channel = key ? this.candidates(familyId).find(item => item.competitorKey === key)?.name || null : null;
      const link = input.url ? text(input.url, 'Link', 8, 300) : null;
      if (link) requireValue(/^https:\/\//i.test(link), 'The link must start with https://. It is kept for your record; nothing is downloaded from it.');
      const id = randomUUID(), at = now();
      this.db.prepare("INSERT INTO competitor_video_watches(id,family_id,competitor_key,channel,title,url,video_id,source,file_path,engine,connector,model,subjects,transcript,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'file',?,?,?,?,?,?,'queued',?,?,?)")
        .run(id, familyId, key, channel, title, link, link ? videoId(link) : null, file, engine, JSON.stringify(connector), engine === 'gemini' ? this.settings(familyId).geminiModel : null, JSON.stringify(this.subjectsFor(familyId, key)), transcript, by, at, at);
      this.store.event(`${by} asked ${engine === 'gemini' ? 'Gemini' : 'the AI'} to watch the file "${title}" for ${family.name}`);
      return this.publicWatch(this.row(id));
    });
  }
  retry(id, input = {}) {
    object(input);
    return this.store.transaction(() => {
      const row = this.row(id);
      requireValue(RETRYABLE.includes(row.status), `A ${row.status} video cannot be watched again this way.`, 409);
      requireValue(row.attempts < 4, 'This video used 4 attempts. Remove it and start a new one.', 409);
      if (row.status === 'interrupted') requireValue(input.confirmInterrupted === true, 'The last attempt was interrupted and may have used tokens. Confirm the deliberate retry.', 409);
      this.renameUsage(id, row.attempts);
      this.db.prepare("UPDATE competitor_video_watches SET status='queued', error=NULL, updated_at=? WHERE id=?").run(now(), id);
      return this.publicWatch(this.row(id));
    });
  }
  // Earlier attempts keep their usage records under their own name, so a retry reserves afresh.
  renameUsage(id, attempt) {
    this.db.prepare('UPDATE intelligence_usage SET job_id=? WHERE job_id=?').run(`${id}:attempt${attempt}`, id);
    this.db.prepare('UPDATE data_usage SET job_id=? WHERE job_id=?').run(`${id}:attempt${attempt}`, id);
  }
  // Removed from the lists; usage records stay. Waiting or running work cannot be removed.
  remove(id, input = {}) {
    object(input);
    const row = this.row(id), by = person(input.removedBy);
    requireValue(!ACTIVE.includes(row.status), 'This video is being watched. Wait for it to finish first.', 409);
    this.db.prepare('UPDATE competitor_video_watches SET removed_at=?, updated_at=? WHERE id=?').run(now(), now(), id);
    this.store.event(`${by} removed the watched video "${row.title}"`);
    return {removed: id};
  }

  // ------------------------------------------------------------ watching
  // One video at a time: Gemini's free plans allow few requests a minute, and the AI's family budget is reserved first.
  claim() {
    return this.store.transaction(() => {
      if (this.db.prepare("SELECT 1 FROM competitor_video_watches WHERE status='running'").get()) return null;
      const row = this.db.prepare("SELECT * FROM competitor_video_watches WHERE status='queued' AND removed_at IS NULL ORDER BY created_at, rowid LIMIT 1").get();
      if (!row) return null;
      const at = now(), family = this.store.family(row.family_id), connector = JSON.parse(row.connector);
      const stop = (status, error) => { this.db.prepare('UPDATE competitor_video_watches SET status=?, error=?, updated_at=? WHERE id=?').run(status, error, at, row.id); return null; };
      if (!connectorCurrent(this.connectors, connector, row.engine === 'gemini' ? 'gemini' : 'ai')) return stop('stale', `The ${row.engine === 'gemini' ? 'Gemini' : 'AI'} connection changed or is not tested. Nothing was sent; test it in Connections and press Retry.`);
      if (row.source === 'file' && !fs.existsSync(row.file_path)) return stop('failed', 'The video file is no longer at that path on this PC. Nothing was sent.');
      if (row.engine === 'gemini') {
        const reservation = this.quota.reserve(row.id, {gemini: 1});
        if (!reservation.ok) return stop('blocked_quota', `The Gemini allowance (${reservation.cap} videos an hour) is used up. Wait for the next hour or raise it under Data caps, then press Retry.`);
      } else {
        const reserve = Math.ceil(100 / PER_SHEET) * TOKENS_PER_SHEET + Math.ceil(Math.min(TRANSCRIPT_CHARS, (row.transcript || '').length) / 3.3) + PROMPT_TOKENS + ANSWER_TOKENS, summary = this.store.usageSummary(family.id);
        if (summary.settledTokens + summary.reservedTokens + reserve > family.tokenBudget.monthlyLimit) return stop('blocked_budget', this.store.budgetMessage(family.id, reserve, 'Watching this video'));
        this.db.prepare("INSERT INTO intelligence_usage(job_id,family_id,kind,period_month,status,reserved_tokens,created_at,updated_at) VALUES(?,?,'video_watch',?,'reserved',?,?,?)").run(row.id, family.id, this.store.tokenPeriod(family), reserve, at, at);
      }
      this.db.prepare("UPDATE competitor_video_watches SET status='running', attempts=attempts+1, updated_at=? WHERE id=?").run(at, row.id);
      return {...row, connector, subjects: JSON.parse(row.subjects), measured: row.measured ? JSON.parse(row.measured) : null};
    });
  }
  // Measured with the pinned FFmpeg on this PC (free): length, cuts and, for the frames engine, the contact sheets.
  async prepareFile(job, {sheets: makeSheets}) {
    const pin = this.renders.pinCheck();
    requireValue(pin.ok, pin.reason || 'Pin an FFmpeg build in the Render Room first.', 409);
    const {ffmpeg, ffprobe} = pin.paths, dir = path.join(this.watchDir, job.id);
    fs.rmSync(dir, {recursive: true, force: true}); fs.mkdirSync(dir, {recursive: true});
    const probe = await R.run(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', job.file_path], {timeout: 60000});
    const duration = Number(String(probe.stdout).trim());
    requireValue(duration > 1, 'FFmpeg could not read that video file. Nothing was sent.', 422);
    const cuts = await R.sceneCuts(ffmpeg, job.file_path, {timeout: Math.max(180000, Math.round(duration * 600))});
    const transcript = job.transcript ? W.parseTranscript(job.transcript) : null;
    const sheets = [];
    if (makeSheets) {
      const times = W.frameTimes(cuts, duration);
      for (let k = 0; k * PER_SHEET < times.length; k++) {
        const part = times.slice(k * PER_SHEET, (k + 1) * PER_SHEET), file = path.join(dir, `sheet-${k + 1}.jpg`);
        live.note(job.id, `Picking frames where the shots change: sheet ${k + 1} of ${Math.ceil(times.length / PER_SHEET)}`);
        await R.run(ffmpeg, sheetArgs(part.map(t => ({file: job.file_path, t})), file).args, {timeout: 180000});
        requireValue(fs.existsSync(file), 'FFmpeg did not make the frames. Nothing was sent.', 502);
        sheets.push({file, times: part});
      }
    }
    let colours = null;
    if (sheets.length) {
      const rgb = [];
      for (const [k, sheet] of sheets.slice(0, 4).entries()) {
        const raw = path.join(dir, `colours-${k + 1}.rgb`);
        await R.run(ffmpeg, ['-hide_banner', '-nostdin', '-loglevel', 'error', '-i', sheet.file, '-vf', 'scale=48:-1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-y', raw], {timeout: 60000});
        rgb.push(...fs.readFileSync(raw));
      }
      colours = mainColours(rgb);
    }
    return {measured: W.measure({duration, cuts, transcript, colours}), transcript, sheets};
  }
  async processNext() {
    const job = this.claim();
    if (!job) return null;
    const family = this.store.family(job.family_id), at = () => now();
    let started = false, uploadNote = null;
    live.start(job.id, {room: 'competitors', label: `Watching "${job.title}"`, familyId: family.id, who: job.engine === 'gemini' ? 'Gemini' : 'the AI', steps: 3, plan: ['Preparing the video', job.engine === 'gemini' ? 'Gemini watches it' : 'The AI reads its frames', 'Checking the study']});
    try {
      // The owner's skills for watching competitors direct the watcher (owner decision 2026-11-10: every job by skills).
      const brief = this.store.skillRuntime?.brief?.('competitors.scan', family.id, {text: [job.title, family.niche, job.subjects.join(' ')].join(' '), format: family.format}) || null;
      const direction = brief ? Direct.directionText(brief.prompt) : '';
      let measured = job.measured, transcript = null, sheets = [], reply;
      if (job.source === 'file') ({measured, transcript, sheets} = await this.prepareFile(job, {sheets: job.engine === 'frames'}));
      const video = {title: job.title, channel: job.channel, url: job.url, durationSeconds: measured?.durationSeconds || null};
      live.step(job.id, 2, job.engine === 'gemini' ? 'Gemini watches the video' : `The AI reads ${sheets.reduce((n, sheet) => n + sheet.times.length, 0)} frames`);
      if (job.engine === 'gemini') {
        const client = new GeminiClient(this.connectors.key(job.connector.id), this.fetch, this.sleep ? {sleep: this.sleep} : {});
        let target = {uri: watchUrl(job.video_id)}, uploaded = null;
        started = true;
        if (job.source === 'file') { live.note(job.id, 'Uploading the file to Gemini (deleted after the answer)'); uploaded = await client.upload(job.file_path); target = {uri: uploaded.uri, mime_type: uploaded.mime_type}; }
        try {
          live.note(job.id, 'Gemini is watching the video (a long video takes several minutes)');
          reply = await client.ask({video: target, prompt: `${W.geminiPrompt({video, subjects: job.subjects, measured})}${direction ? `\n\n${direction}` : ''}`, model: job.model || DEFAULT_MODEL});
        } finally { if (uploaded) uploadNote = await client.remove(uploaded.name); }
        this.quota.settle(job.id, {gemini: 1});
        reply = {content: reply.text, usage: {gemini: reply.tokens, requests: client.requests, model: reply.model}};
      } else {
        let messages = W.frameMessages({video, subjects: job.subjects, measured, transcript: transcript ? W.transcriptLines(transcript, TRANSCRIPT_CHARS) : '', sheets: sheets.map(sheet => ({times: sheet.times, data: fs.readFileSync(sheet.file).toString('base64')}))});
        if (brief) messages = Direct.withDirection(messages, brief.prompt);
        started = true;
        const answer = await this.ai.complete({connectorId: job.connector.id, task: 'competitors', messages, maxTokens: ANSWER_TOKENS, jobId: job.id});
        const usage = {prompt: answer.usage?.promptTokens ?? null, completion: answer.usage?.completionTokens ?? null, total: answer.usage?.totalTokens ?? null};
        this.db.prepare('UPDATE intelligence_usage SET status=?, prompt_tokens=?, completion_tokens=?, total_tokens=?, updated_at=? WHERE job_id=?').run(Number.isSafeInteger(usage.total) ? 'settled' : 'unknown', usage.prompt, usage.completion, usage.total, at(), job.id);
        reply = {content: answer.content, usage: {tokens: usage.total, provider: answer.provider || null}};
      }
      if (brief) { this.store.skillRuntime.recordUsage({jobId: job.id, familyId: family.id, room: 'competitors', taskKey: 'competitors.scan', brief}); this.store.skillRuntime.recordApplied?.(job.id, 'competitors.scan', Direct.cited(reply.content, brief.prompt)); }
      live.step(job.id, 3, 'Checking the study');
      const usage = JSON.stringify({...reply.usage, ...(uploadNote ? {cleanup: uploadNote} : {})});
      try {
        const {breakdown, warnings} = W.readBreakdown(W.jsonOf(reply.content), {subjects: job.subjects, duration: measured?.durationSeconds || null});
        this.db.prepare("UPDATE competitor_video_watches SET status='watched', result=?, warnings=?, measured=?, usage=?, error=NULL, title=CASE WHEN title LIKE 'Video %' AND ?<>'' THEN ? ELSE title END, updated_at=? WHERE id=?")
          .run(JSON.stringify(breakdown), JSON.stringify(uploadNote ? [...warnings, uploadNote] : warnings), measured ? JSON.stringify(measured) : null, usage, breakdown.title, breakdown.title, at(), job.id);
        this.store.event(`Watched "${job.title}" for ${family.name}: ${Object.keys(breakdown.subjects).length} subject(s), ${breakdown.timeline.length} moments`);
      } catch (error) {
        this.db.prepare("UPDATE competitor_video_watches SET status='quality_failed', error=?, warnings=?, measured=?, usage=?, updated_at=? WHERE id=?").run(error.message, JSON.stringify(error.warnings || []), measured ? JSON.stringify(measured) : null, usage, at(), job.id);
      }
    } catch (error) {
      const message = error instanceof InputError || error instanceof AiError ? error.message : `The program stopped this watch: ${error?.message || error}`;
      const nothingUsed = !started || error?.nothingUsed === true;
      if (job.engine === 'gemini') { if (started) this.quota.settle(job.id, {gemini: 1}); else this.quota.release(job.id); }
      else this.db.prepare('UPDATE intelligence_usage SET status=?, reserved_tokens=CASE WHEN ? THEN 0 ELSE reserved_tokens END, updated_at=? WHERE job_id=?').run(nothingUsed ? 'released' : 'unknown', nothingUsed ? 1 : 0, at(), job.id);
      // A refusal Gemini answered (key, quota, a private video) is a plain failure; a lost AI answer is interrupted.
      const status = nothingUsed || error instanceof GeminiError || error instanceof InputError ? 'failed' : 'interrupted';
      this.db.prepare('UPDATE competitor_video_watches SET status=?, error=?, updated_at=? WHERE id=?').run(status, String(message).slice(0, 1200), at(), job.id);
    } finally { live.end(job.id); }
    return this.publicWatch(this.row(job.id));
  }

  // ------------------------------------------------------------ the roadmap
  watchedFor(familyId) {
    return this.db.prepare("SELECT * FROM competitor_video_watches WHERE family_id=? AND status='watched' AND removed_at IS NULL ORDER BY competitor_key, created_at").all(familyId);
  }
  queueRoadmap(familyId, input) {
    object(input);
    const by = person(input.requestedBy);
    return this.store.transaction(() => {
      const family = this.store.family(familyId);
      requireValue(!family.archived, 'Restore this channel family first.', 409);
      const connector = connectorReference(this.connectors, input.connector, 'ai', 'Claude or ChatGPT', true);
      const watched = this.watchedFor(familyId);
      requireValue(watched.length, 'Watch at least one competitor video first.', 409);
      requireValue(!this.db.prepare("SELECT 1 FROM competitor_roadmaps WHERE family_id=? AND status IN ('queued','running')").get(familyId), 'A roadmap is already being made for this family.', 409);
      const revision = (this.db.prepare('SELECT MAX(revision) AS n FROM competitor_roadmaps WHERE family_id=?').get(familyId).n || 0) + 1, picks = this.intel.picks(familyId);
      const id = randomUUID(), at = now();
      this.db.prepare("INSERT INTO competitor_roadmaps(id,family_id,revision,status,connector,scope,created_by,created_at,updated_at) VALUES(?,?,?,'queued',?,?,?,?,?)")
        .run(id, familyId, revision, JSON.stringify(connector), JSON.stringify({watchIds: watched.map(row => row.id), picksRevision: picks.revision}), by, at, at);
      this.store.event(`${by} asked for competitor roadmap r${revision} of ${family.name} from ${watched.length} watched video(s)`);
      return this.publicRoadmap(this.roadmapRow(id));
    });
  }
  retryRoadmap(id, input = {}) {
    object(input);
    return this.store.transaction(() => {
      const row = this.roadmapRow(id);
      requireValue(RETRYABLE.includes(row.status), `A ${row.status} roadmap cannot be retried.`, 409);
      requireValue(row.attempts < 3, 'This roadmap used 3 attempts. Make a new one.', 409);
      if (row.status === 'interrupted') requireValue(input.confirmInterrupted === true, 'The last attempt was interrupted and may have used tokens. Confirm the deliberate retry.', 409);
      this.renameUsage(id, row.attempts);
      this.db.prepare("UPDATE competitor_roadmaps SET status='queued', error=NULL, updated_at=? WHERE id=?").run(now(), id);
      return this.publicRoadmap(this.roadmapRow(id));
    });
  }
  // The roadmap's request: every watched video, each with only the subjects ticked for its channel and the program's own
  // additions, numbered V1, V2... Returns {messages, refs, required, references, brief}.
  roadmapInput(row) {
    const family = this.store.family(row.family_id), scope = JSON.parse(row.scope), {picks} = this.intel.picks(row.family_id);
    const rows = scope.watchIds.map(id => this.db.prepare("SELECT * FROM competitor_video_watches WHERE id=? AND status='watched'").get(id)).filter(Boolean);
    requireValue(rows.length, 'The watched videos of this roadmap were removed. Make a new roadmap.', 409);
    const channels = new Map(this.candidates(row.family_id).map(item => [item.competitorKey, item]));
    const videos = rows.map((watch, k) => ({ref: `V${k + 1}`, channelRef: watch.competitor_key ? channels.get(watch.competitor_key)?.ref || null : null, title: watch.title, durationSeconds: JSON.parse(watch.result).durationSeconds, engine: watch.engine, measured: watch.measured ? JSON.parse(watch.measured) : null, breakdown: JSON.parse(watch.result)}));
    const ticked = Object.values(picks).flat(), required = [...new Set((ticked.length ? ticked : videos.flatMap(video => Object.keys(video.breakdown.subjects))).map(W.processOf).filter(Boolean))];
    const ownerTicked = Object.fromEntries(Object.entries(picks).map(([key, list]) => [channels.get(key)?.ref || key, list]));
    // The copy guard reads what the competitors said: the owner's transcripts and every "heard" the watcher wrote.
    const references = rows.map((watch, k) => ({id: `V${k + 1}`, transcript: [watch.transcript || '', ...JSON.parse(watch.result).timeline.map(item => item.heard)].join('\n')}));
    const brief = this.store.skillRuntime?.brief?.('competitors.blueprint', family.id, {text: [family.niche, family.audience, ticked.join(' ')].join(' '), format: family.format}) || null;
    const messages = W.roadmapMessages({family, videos, picks: ownerTicked, skills: brief?.prompt || null});
    return {messages, refs: videos.map(video => video.ref), required, references, brief, videos: videos.length};
  }
  claimRoadmap() {
    return this.store.transaction(() => {
      if (this.db.prepare("SELECT 1 FROM competitor_roadmaps WHERE status='running'").get()) return null;
      const row = this.db.prepare("SELECT * FROM competitor_roadmaps WHERE status='queued' ORDER BY created_at, rowid LIMIT 1").get();
      if (!row) return null;
      const at = now(), family = this.store.family(row.family_id), connector = JSON.parse(row.connector);
      const stop = (status, error) => { this.db.prepare('UPDATE competitor_roadmaps SET status=?, error=?, updated_at=? WHERE id=?').run(status, error, at, row.id); return null; };
      if (!connectorCurrent(this.connectors, connector, 'ai')) return stop('stale', 'The AI connection changed or is not tested. Nothing was sent; test it in Connections and press Retry.');
      let input;
      try { input = this.roadmapInput(row); } catch (error) { return stop('failed', error.message); }
      const reserve = Math.ceil(Buffer.byteLength(JSON.stringify(input.messages)) / 3.3) + ROADMAP_ANSWER, summary = this.store.usageSummary(family.id);
      if (summary.settledTokens + summary.reservedTokens + reserve > family.tokenBudget.monthlyLimit) return stop('blocked_budget', this.store.budgetMessage(family.id, reserve, 'This roadmap'));
      this.db.prepare("INSERT INTO intelligence_usage(job_id,family_id,kind,period_month,status,reserved_tokens,created_at,updated_at) VALUES(?,?,'competitor_roadmap',?,'reserved',?,?,?)").run(row.id, family.id, this.store.tokenPeriod(family), reserve, at, at);
      this.db.prepare("UPDATE competitor_roadmaps SET status='running', attempts=attempts+1, updated_at=? WHERE id=?").run(at, row.id);
      return {...row, connector, input};
    });
  }
  async processNextRoadmap() {
    const job = this.claimRoadmap();
    if (!job) return null;
    const {input} = job, at = () => now();
    let started = false;
    live.start(job.id, {room: 'competitors', label: `Roadmap r${job.revision} from ${input.videos} watched video(s)`, familyId: job.family_id, who: 'the AI'});
    try {
      started = true;
      const answer = await this.ai.complete({connectorId: job.connector.id, task: 'competitors', messages: input.messages, maxTokens: ROADMAP_ANSWER, jobId: job.id, onProgress: live.follow(job.id)});
      const usage = {prompt: answer.usage?.promptTokens ?? null, completion: answer.usage?.completionTokens ?? null, total: answer.usage?.totalTokens ?? null};
      this.db.prepare('UPDATE intelligence_usage SET status=?, prompt_tokens=?, completion_tokens=?, total_tokens=?, updated_at=? WHERE job_id=?').run(Number.isSafeInteger(usage.total) ? 'settled' : 'unknown', usage.prompt, usage.completion, usage.total, at(), job.id);
      if (input.brief) { this.store.skillRuntime.recordUsage({jobId: job.id, familyId: job.family_id, room: 'competitors', taskKey: 'competitors.blueprint', brief: input.brief}); this.store.skillRuntime.recordApplied?.(job.id, 'competitors.blueprint', answer.directives?.applied || Direct.cited(answer.content, input.brief.prompt)); }
      try {
        const {roadmap, warnings} = W.readRoadmap(W.jsonOf(answer.content), {required: input.required, refs: input.refs, references: input.references});
        this.db.prepare("UPDATE competitor_roadmaps SET status='ready', result=?, warnings=?, usage=?, error=NULL, updated_at=? WHERE id=?").run(JSON.stringify({...roadmap, videos: input.videos}), JSON.stringify(warnings), JSON.stringify(usage), at(), job.id);
        this.store.event(`Competitor roadmap r${job.revision} is ready for review: ${roadmap.processes.length} process(es)`);
      } catch (error) {
        this.db.prepare("UPDATE competitor_roadmaps SET status='quality_failed', error=?, warnings=?, usage=?, updated_at=? WHERE id=?").run(error.message, JSON.stringify(error.warnings || []), JSON.stringify(usage), at(), job.id);
      }
    } catch (error) {
      const nothingUsed = !started || error?.nothingUsed === true;
      this.db.prepare('UPDATE intelligence_usage SET status=?, reserved_tokens=CASE WHEN ? THEN 0 ELSE reserved_tokens END, updated_at=? WHERE job_id=?').run(nothingUsed ? 'released' : 'unknown', nothingUsed ? 1 : 0, at(), job.id);
      this.db.prepare('UPDATE competitor_roadmaps SET status=?, error=?, updated_at=? WHERE id=?').run(nothingUsed ? 'failed' : 'interrupted', String(error?.message || error).slice(0, 1200), at(), job.id);
    } finally { live.end(job.id); }
    return this.publicRoadmap(this.roadmapRow(job.id));
  }
  // The owner's decision by name. Approval turns each process into a pin-only skill (new revisions of the same IDs on a
  // later roadmap), approves it and pins it to this family's jobs of that process; a process the new roadmap no longer
  // has is unpinned. Nothing reaches another family.
  review(id, input) {
    object(input);
    const by = person(input.reviewer, 'Reviewer name'), row = this.roadmapRow(id), family = this.store.family(row.family_id);
    requireValue(row.status === 'ready', `A ${row.status} roadmap cannot be reviewed.`, 409);
    if (input.decision === 'reject') {
      const reason = text(input.reason, 'Reason', 8, 600);
      this.db.prepare("UPDATE competitor_roadmaps SET status='rejected', review=?, updated_at=? WHERE id=?").run(JSON.stringify({decision: 'rejected', reviewer: by, reason, at: now()}), now(), id);
      this.store.event(`${by} rejected competitor roadmap r${row.revision} of ${family.name}`);
      return this.publicRoadmap(this.roadmapRow(id));
    }
    requireValue(input.decision === 'approve', 'Choose approve or reject.');
    const confirmations = input.confirmations || {};
    for (const [key, label] of [['read', 'you read the steps of every process'], ['ownWork', 'the roadmap learns techniques only and keeps at least 70% our own'], ['leads', 'these steps should lead the AI in this family\'s jobs']]) requireValue(confirmations[key] === true, `Confirm that ${label}.`);
    requireValue(this.skills, 'The skills engine is not available.', 500);
    const result = JSON.parse(row.result), date = now().slice(0, 10);
    const skills = W.roadmapSkills(result, {familyId: family.id, familyName: family.name, revision: row.revision, approvedBy: by, date, videos: result.videos});
    const imported = this.skills.importPack({createdBy: by, changeNote: `Competitor roadmap r${row.revision} approved for ${family.name}`, origin: 'owner', skills, pack: `Competitor roadmap: ${family.name}`.slice(0, 120), approve: {approvedBy: by, confirmations: {wordingReviewed: true, numbersReviewed: true, scopeReviewed: true}}});
    const ids = new Set(skills.map(skill => skill.id)), prefix = skills[0]?.id.replace(/-[a-z]+$/, '-') || null, pins = [];
    for (const skill of skills) for (const taskKey of skill.tasks) { this.skills.bind({createdBy: by, note: `Competitor roadmap r${row.revision}: leads ${family.name}'s jobs of this process`, mode: 'pin', taskKey, skillId: skill.id, familyId: family.id}); pins.push(`${skill.id} → ${taskKey}`); }
    const dropped = prefix ? this.skills.bindings(family.id).filter(item => item.familyId === family.id && item.skillId.startsWith(prefix) && !ids.has(item.skillId)) : [];
    for (const item of dropped) this.skills.unbind(item.id, {removedBy: by});
    this.store.transaction(() => {
      this.db.prepare("UPDATE competitor_roadmaps SET status='superseded', updated_at=? WHERE family_id=? AND status='approved'").run(now(), family.id);
      this.db.prepare("UPDATE competitor_roadmaps SET status='approved', review=?, applied=?, updated_at=? WHERE id=?").run(JSON.stringify({decision: 'approved', reviewer: by, at: now(), confirmations: {read: true, ownWork: true, leads: true}}), JSON.stringify({skills: [...ids], pins, unpinned: dropped.map(item => `${item.skillId} → ${item.taskKey}`), imported}), now(), id);
    });
    this.store.event(`${by} approved competitor roadmap r${row.revision} of ${family.name}: ${ids.size} skill(s) now lead its jobs`);
    return this.publicRoadmap(this.roadmapRow(id));
  }

  // ------------------------------------------------------------ what the page shows
  publicWatch(row, {full = false} = {}) {
    const result = row.result ? JSON.parse(row.result) : null;
    return {id: row.id, familyId: row.family_id, competitorKey: row.competitor_key, channel: row.channel, title: row.title, url: row.url, videoId: row.video_id, source: row.source, file: row.source === 'file' ? path.basename(row.file_path || '') : null,
      engine: row.engine, engineLabel: ENGINE_LABEL[row.engine], model: row.model, subjects: JSON.parse(row.subjects), status: row.status, measured: row.measured ? JSON.parse(row.measured) : null,
      warnings: row.warnings ? JSON.parse(row.warnings) : [], usage: row.usage ? JSON.parse(row.usage) : null, error: row.error, attempts: row.attempts, createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at,
      hasTranscript: !!row.transcript, summary: result ? {text: result.summary, moments: result.timeline.length, subjects: Object.keys(result.subjects), durationSeconds: result.durationSeconds} : null, ...(full ? {result} : {})};
  }
  publicRoadmap(row) {
    return {id: row.id, familyId: row.family_id, revision: row.revision, status: row.status, result: row.result ? JSON.parse(row.result) : null, warnings: row.warnings ? JSON.parse(row.warnings) : [], review: row.review ? JSON.parse(row.review) : null,
      applied: row.applied ? JSON.parse(row.applied) : null, usage: row.usage ? JSON.parse(row.usage) : null, error: row.error, attempts: row.attempts, videos: JSON.parse(row.scope).watchIds.length, createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at};
  }
  watch(id) { return this.publicWatch(this.row(id), {full: true}); }
  // One Word document: a watched video's study, or a roadmap.
  document(kind, id) {
    if (kind === 'watch') { const item = this.watch(id); requireValue(item.result, 'This video has no study yet.', 409); return {name: `${item.title.replace(/[^\w -]+/g, '').slice(0, 60) || 'video'} - study.docx`, data: docxFile(W.breakdownBlocks(item))}; }
    const item = this.publicRoadmap(this.roadmapRow(id));
    requireValue(item.result, 'This roadmap has nothing to export yet.', 409);
    return {name: `Competitor roadmap r${item.revision}.docx`, data: docxFile(W.roadmapBlocks({...item, videos: item.videos}))};
  }
  state() {
    return {
      families: Object.fromEntries(this.store.families().filter(family => !family.archived).map(family => [family.id, {
        settings: this.settings(family.id),
        candidates: (() => { try { return this.candidates(family.id); } catch { return []; } })(),
        watches: this.db.prepare('SELECT * FROM competitor_video_watches WHERE family_id=? AND removed_at IS NULL ORDER BY created_at DESC, rowid DESC LIMIT 80').all(family.id).map(row => this.publicWatch(row)),
        roadmaps: this.db.prepare('SELECT * FROM competitor_roadmaps WHERE family_id=? ORDER BY revision DESC LIMIT 6').all(family.id).map(row => this.publicRoadmap(row)),
      }])),
      subjects: W.SUBJECTS, added: Object.keys(W.ADDED), processes: Object.fromEntries(Object.entries(W.PROCESSES).map(([key, item]) => [key, {label: item.label, subjects: item.subjects}])),
    };
  }
}

module.exports = {VideoWatcher, ENGINE_LABEL};
