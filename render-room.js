'use strict';
// P05 - Assembly proxy and style proof (Room 05 preview stage).
// Renders the approved visual board on the approved narration with the family style through the pinned
// FFmpeg build, runs technical QC, keeps an immutable manifest and asks a human for the style-proof verdict.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {randomUUID, createHash} = require('node:crypto');
const {InputError} = require('./store');
const R = require('./render');
const B = require('./editing-brain');
const {MotionRenderer, inspectBrowser, findBrowser} = require('./motion');
const VS = require('./visual-sources');
const Audio = require('./audio');
const Review = require('./review');
const Sk = require('./sketch');
const M = require('./music');
const At = require('./atelier');
const E = require('./engines');
const {requireValue, now, round, object, text, person} = R;

const ACTIVE = ['queued', 'running'];

class RenderRoom {
  constructor(store, styles, sceneRoom, {dataRoot, ffmpeg = 'ffmpeg', ffprobe = 'ffprobe', browser = findBrowser()} = {}) {
    this.browser = browser;
    this.store = store;
    this.db = store.db;
    this.styles = styles;
    this.scenes = sceneRoom;
    this.dataRoot = dataRoot || path.join(process.cwd(), 'data');
    this.renderDir = path.join(this.dataRoot, 'renders');
    this.ffmpeg = ffmpeg;
    this.ffprobe = ffprobe;
    this.busy = false;
    this.checking = false;
    this.current = null;
    this.migrate();
    this.recoverInterrupted();
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS render_readiness(id TEXT PRIMARY KEY, payload TEXT NOT NULL, passed INTEGER NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS render_pins(id TEXT PRIMARY KEY, readiness_id TEXT NOT NULL REFERENCES render_readiness(id), ffmpeg_sha256 TEXT NOT NULL, ffprobe_sha256 TEXT NOT NULL, version TEXT NOT NULL, pinned_by TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL, ended_at TEXT);
      CREATE TABLE IF NOT EXISTS render_jobs(id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id), content_id TEXT NOT NULL REFERENCES content(id), visual_approval_id TEXT NOT NULL, preset TEXT NOT NULL, status TEXT NOT NULL, scope TEXT NOT NULL, progress TEXT, result TEXT, error TEXT, attempts INTEGER NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, review TEXT);
      CREATE TRIGGER IF NOT EXISTS render_results_final BEFORE UPDATE OF result ON render_jobs WHEN OLD.result IS NOT NULL BEGIN SELECT RAISE(ABORT, 'A completed render result is immutable.'); END;
    `);
  }
  // Rendering is local: an interrupted render cost nothing and may be retried, but never silently.
  recoverInterrupted() {
    for (const row of this.db.prepare("SELECT id FROM render_jobs WHERE status='running'").all())
      this.db.prepare("UPDATE render_jobs SET status='interrupted', error='The program stopped during this render. Partial files were discarded; retry when ready.', updated_at=? WHERE id=?").run(now(), row.id);
    fs.rmSync(path.join(this.renderDir, '.work'), {recursive: true, force: true});
  }

  // ------------------------------------------------------------ readiness and pinned build
  latestReadiness() {
    const row = this.db.prepare('SELECT * FROM render_readiness ORDER BY created_at DESC, rowid DESC LIMIT 1').get();
    return row ? {id: row.id, ...JSON.parse(row.payload), passed: !!row.passed, createdBy: row.created_by, createdAt: row.created_at} : null;
  }
  activePin() {
    const row = this.db.prepare('SELECT * FROM render_pins WHERE ended_at IS NULL ORDER BY created_at DESC LIMIT 1').get();
    return row ? {id: row.id, readinessId: row.readiness_id, ffmpegSha256: row.ffmpeg_sha256, ffprobeSha256: row.ffprobe_sha256, version: row.version, pinnedBy: row.pinned_by, reason: row.reason, createdAt: row.created_at} : null;
  }
  async checkReadiness(input) {
    object(input);
    const by = person(input.requestedBy);
    requireValue(!this.checking, 'A readiness check is already running.', 409);
    this.checking = true;
    try {
      const report = await R.inspectFFmpeg({ffmpeg: this.ffmpeg, ffprobe: this.ffprobe, workDir: path.join(this.renderDir, '.work', `readiness-${randomUUID()}`)});
      // The canvas graphics renderer is checked too; it is optional and does not change the FFmpeg verdict.
      report.motion = await inspectBrowser({browser: this.browser});
      const id = randomUUID();
      this.store.transaction(() => {
        this.db.prepare('INSERT INTO render_readiness(id,payload,passed,created_by,created_at) VALUES(?,?,?,?,?)').run(id, JSON.stringify(report), report.passed ? 1 : 0, by, now());
        this.store.event(`FFmpeg readiness check ${report.passed ? 'passed' : 'failed'} (${report.ffmpeg?.version || 'not found'})`);
      });
      return this.latestReadiness();
    } finally {
      this.checking = false;
    }
  }
  pin(input) {
    object(input);
    const by = person(input.pinnedBy), reason = text(input.reason || '', 'Reason', 8, 500);
    return this.store.transaction(() => {
      const latest = this.latestReadiness();
      requireValue(latest && latest.id === input.readinessId, 'Run a fresh readiness check and pin that one.', 409);
      requireValue(latest.passed, 'Only a build that passed every readiness check can be pinned.', 409);
      this.db.prepare('UPDATE render_pins SET ended_at=? WHERE ended_at IS NULL').run(now());
      this.db.prepare('INSERT INTO render_pins(id,readiness_id,ffmpeg_sha256,ffprobe_sha256,version,pinned_by,reason,created_at) VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(), latest.id, latest.ffmpeg.sha256, latest.ffprobe.sha256, latest.ffmpeg.version, by, reason, now());
      this.store.event(`Pinned FFmpeg ${latest.ffmpeg.version} (${latest.ffmpeg.sha256.slice(0, 12)}) for rendering`);
      return this.activePin();
    });
  }
  // The pinned build must still be the binary on disk; a silent FFmpeg upgrade blocks rendering.
  pinCheck() {
    const pin = this.activePin(), latest = this.latestReadiness();
    if (!pin) return {ok: false, reason: 'Pin a reviewed FFmpeg build first.'};
    const ffmpegPath = R.resolveExecutable(this.ffmpeg), ffprobePath = R.resolveExecutable(this.ffprobe);
    if (!ffmpegPath || !ffprobePath) return {ok: false, reason: 'FFmpeg or ffprobe is no longer installed.'};
    const current = {ffmpeg: R.fileSha256(ffmpegPath), ffprobe: R.fileSha256(ffprobePath)};
    if (current.ffmpeg !== pin.ffmpegSha256 || current.ffprobe !== pin.ffprobeSha256) return {ok: false, reason: 'The FFmpeg or ffprobe binary changed since it was pinned. Run the readiness check and pin the new build deliberately.'};
    return {ok: true, pin, readinessId: latest?.id || null, paths: {ffmpeg: ffmpegPath, ffprobe: ffprobePath}};
  }

  // ------------------------------------------------------------ inputs
  inputs(content) {
    const family = this.store.family(content.familyId), blockers = [];
    const visual = this.scenes.handoff(content.id);
    const voice = this.store.voiceHandoffs(family.id).find(item => item.contentId === content.id) || null;
    if (!visual.ready) blockers.push(visual.blocker || 'Approve the visuals in Room 04.');
    if (!voice?.ready) blockers.push(voice?.blocker || 'Approve a narration in the Voice Room.');
    let spec = null, manifestRow = null, approvalRow = null;
    if (visual.ready) {
      manifestRow = this.scenes.manifestRow(visual.manifestId);
      approvalRow = this.db.prepare('SELECT * FROM visual_approvals WHERE id=?').get(visual.approvalId);
      spec = JSON.parse(this.styles.revisionRow(manifestRow.style_revision_id).spec);
      // Drawn styles (P06c) render through the montage assembler: their shots are clips the program drew itself.
      if (!['ffmpeg-montage', 'ffmpeg-sketch', 'canvas-frames', 'motion-graphics', 'atelier', 'story-mix'].includes(spec.renderer.adapter)) blockers.push(`${spec.name} needs the ${spec.renderer.adapter} renderer, which is not built yet.`);
      if (voice?.ready && manifestRow.voice_approval_id !== voice.approvalId) blockers.push('The approved narration differs from the one the scene plan was timed with.');
    }
    return {family, visual, voice, spec, manifestRow, approvalRow, blockers, ready: !blockers.length};
  }

  // ------------------------------------------------------------ jobs
  row(id) { const row = this.db.prepare('SELECT * FROM render_jobs WHERE id=?').get(id); requireValue(row, 'Render not found.', 404); return row; }
  publicJob(row) {
    const scope = JSON.parse(row.scope), result = row.result ? JSON.parse(row.result) : null;
    const content = (() => { try { return this.store.content(row.content_id); } catch { return null; } })();
    const visual = this.scenes.handoff(row.content_id);
    const current = !!(visual.ready && visual.approvalId === row.visual_approval_id && content && content.revision === scope.contentRevision && (!scope.edit || this.editing?.isLatest(scope.edit.revisionId)));
    return {id: row.id, familyId: row.family_id, contentId: row.content_id, visualApprovalId: row.visual_approval_id, preset: row.preset, status: row.status, attempts: row.attempts,
      progress: row.progress ? JSON.parse(row.progress) : null, error: row.error, createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at,
      review: row.review ? JSON.parse(row.review) : null, current, scope: {manifestRevision: scope.manifestRevision, shots: scope.edit ? scope.edit.timeline.clips.length : scope.shots.length, styleName: scope.style.name, styleRevision: scope.style.revision, narrationSeconds: scope.narration.durationSeconds, ffmpeg: scope.ffmpeg,
        edit: scope.edit ? {revisionId: scope.edit.revisionId, revision: scope.edit.revision, criticals: scope.edit.criticals, verdict: scope.edit.critiqueVerdict, graphics: scope.edit.timeline.graphics.filter(item => item.status === 'accepted').length} : null},
      result: result ? {...result, plan: undefined, logs: undefined, videoUrl: `/api/renders/${row.id}/video`, audioUrl: result.audio ? `/api/renders/${row.id}/audio` : null, sheetUrl: result.sheet ? `/api/renders/${row.id}/sheet` : null, hookUrl: result.hook ? `/api/renders/${row.id}/hook` : null, manifestUrl: `/api/renders/${row.id}/manifest`, commands: result.plan?.commands?.length || 0} : null};
  }
  queueRender(contentId, input) {
    object(input);
    const by = person(input.requestedBy);
    return this.store.transaction(() => {
      const content = this.store.content(contentId), inputs = this.inputs(content);
      requireValue(inputs.ready, inputs.blockers[0], 409);
      requireValue(input.visualApprovalId === inputs.visual.approvalId, 'The visual approval changed. Reload before rendering.', 409);
      // P06: an edit revision from the Editing Room renders its own cuts, moves, transitions and graphics.
      let edit = null;
      if (input.editRevisionId !== undefined && input.editRevisionId !== null) {
        requireValue(this.editing, 'The Editing Room is not available.', 503);
        edit = this.editing.renderScope(text(input.editRevisionId, 'Edit revision', 8, 80), content);
      }
      const readiness = this.latestReadiness();
      requireValue(readiness?.passed, 'Run the FFmpeg readiness check first.', 409);
      const pin = this.activePin();
      requireValue(pin, 'Pin a reviewed FFmpeg build before rendering.', 409);
      requireValue(!this.db.prepare("SELECT 1 FROM render_jobs WHERE content_id=? AND status IN ('queued','running')").get(content.id), 'A render for this script is already queued or running.', 409);
      const snapshot = JSON.parse(inputs.approvalRow.snapshot), payload = JSON.parse(inputs.manifestRow.payload);
      const planned = new Map(payload.scenes.flatMap(scene => scene.shots.map(shot => [shot.id, shot])));
      const shots = snapshot.shots.map(item => {
        const shot = planned.get(item.shotId), asset = this.scenes.assetRow(item.assetId), probe = JSON.parse(asset.probe);
        return {shotId: item.shotId, label: item.label, assetId: asset.id, sha256: asset.sha256, relativePath: asset.relative_path, mediaType: asset.media_type, clipSeconds: probe.durationSeconds || null,
          startSeconds: shot.startSeconds, durationSeconds: shot.durationSeconds, motion: shot.motion, source: shot.source};
      });
      const revision = this.styles.revisionRow(inputs.manifestRow.style_revision_id);
      const scope = {
        contentRevision: content.revision, manifestId: inputs.manifestRow.id, manifestRevision: inputs.manifestRow.revision, manifestHash: inputs.manifestRow.payload_hash,
        narration: {approvalId: inputs.voice.approvalId, relativePath: inputs.voice.artifact.relativePath, sha256: inputs.voice.artifact.sha256, durationSeconds: inputs.voice.analysis.durationSeconds},
        style: {revisionId: revision.id, revision: revision.revision, name: inputs.spec.name, specHash: revision.spec_hash, spec: inputs.spec},
        ffmpeg: {version: pin.version, sha256: pin.ffmpegSha256, pinId: pin.id}, rendererVersion: R.RENDERER_VERSION, format: inputs.family.format, shots, edit,
      };
      const id = randomUUID(), at = now();
      this.db.prepare("INSERT INTO render_jobs(id,family_id,content_id,visual_approval_id,preset,status,scope,attempts,created_by,created_at,updated_at) VALUES(?,?,?,?,'proxy','queued',?,0,?,?,?)").run(id, inputs.family.id, content.id, inputs.visual.approvalId, JSON.stringify(scope), by, at, at);
      this.store.event(edit ? `Queued edit r${edit.revision} render for "${content.title}" (${edit.timeline.clips.length} clips)` : `Queued proxy render for "${content.title}" (${shots.length} shots)`);
      return this.publicJob(this.row(id));
    });
  }
  retry(id, input) {
    object(input);
    return this.store.transaction(() => {
      const row = this.row(id);
      requireValue(['failed', 'interrupted', 'cancelled', 'stale'].includes(row.status), `A ${row.status} render cannot be retried.`, 409);
      requireValue(row.attempts < 3, 'This render already used 3 attempts. Start a new render.', 409);
      this.db.prepare("UPDATE render_jobs SET status='queued', error=NULL, progress=NULL, updated_at=? WHERE id=?").run(now(), id);
      this.store.event(`Requeued proxy render ${id}`);
      return this.publicJob(this.row(id));
    });
  }
  cancel(id, input) {
    object(input);
    const by = person(input.requestedBy);
    const row = this.row(id);
    requireValue(ACTIVE.includes(row.status), 'Only a queued or running render can be cancelled.', 409);
    if (row.status === 'queued') {
      this.db.prepare("UPDATE render_jobs SET status='cancelled', error=?, updated_at=? WHERE id=? AND status='queued'").run(`Cancelled by ${by} before it started.`, now(), id);
    } else if (this.current?.id === id) {
      this.current.cancelledBy = by;
      this.current.handle?.kill('cancelled');
    }
    return this.publicJob(this.row(id));
  }
  claim() {
    return this.store.transaction(() => {
      const row = this.db.prepare("SELECT * FROM render_jobs WHERE status='queued' ORDER BY created_at, rowid LIMIT 1").get();
      if (!row) return null;
      const scope = JSON.parse(row.scope), at = now();
      const content = this.store.content(row.content_id), inputs = this.inputs(content);
      if (!inputs.ready || inputs.visual.approvalId !== row.visual_approval_id || content.revision !== scope.contentRevision) {
        this.db.prepare("UPDATE render_jobs SET status='stale', error=?, updated_at=? WHERE id=?").run(`${inputs.blockers[0] || 'The visual approval changed.'} Nothing was rendered.`, at, row.id);
        return null;
      }
      if (scope.edit && !this.editing?.isLatest(scope.edit.revisionId)) {
        this.db.prepare("UPDATE render_jobs SET status='stale', error=?, updated_at=? WHERE id=?").run('The edit changed after this render was queued. Render the newest revision.', at, row.id);
        return null;
      }
      const pin = this.pinCheck();
      if (!pin.ok || pin.pin.id !== scope.ffmpeg.pinId) {
        this.db.prepare("UPDATE render_jobs SET status='stale', error=?, updated_at=? WHERE id=?").run(pin.ok ? 'A different FFmpeg build was pinned after this render was queued. Start a new render.' : pin.reason, at, row.id);
        return null;
      }
      this.db.prepare("UPDATE render_jobs SET status='running', attempts=attempts+1, progress=?, updated_at=? WHERE id=?").run(JSON.stringify({stage: 'verifying inputs', done: 0, total: scope.shots.length + 4}), at, row.id);
      return {...row, scope, paths: pin.paths};
    });
  }
  progress(id, stage, done, total) { this.db.prepare('UPDATE render_jobs SET progress=?, updated_at=? WHERE id=?').run(JSON.stringify({stage, done, total}), now(), id); }
  localFile(relative) {
    const file = path.resolve(this.dataRoot, relative);
    requireValue(file.startsWith(path.resolve(this.dataRoot) + path.sep), 'Invalid media path.', 400);
    return file;
  }
  async processNext() {
    if (this.busy) return null;
    const job = this.claim();
    if (!job) return null;
    this.busy = true;
    this.current = {id: job.id, handle: null, cancelledBy: null};
    const work = path.join(this.renderDir, '.work', job.id), finalDir = path.join(this.renderDir, job.family_id, job.content_id, job.id);
    const logs = [], started = Date.now(), scope = job.scope, total = scope.shots.length + 4;
    const exec = async (label, command, args, timeout, cwd) => {
      if (this.current.cancelledBy) throw Object.assign(new InputError('The render was cancelled.', 409), {cancelled: true});
      try {
        const out = await R.run(command, args, {timeout, cwd, onSpawn: handle => { this.current.handle = handle; }});
        logs.push({step: label, ok: true, stderr: R.tail(out.stderr)});
        return out;
      } catch (error) {
        logs.push({step: label, ok: false, stderr: R.tail(error.stderr)});
        throw error;
      } finally {
        this.current.handle = null;
      }
    };
    try {
      fs.rmSync(work, {recursive: true, force: true});
      fs.mkdirSync(work, {recursive: true});
      // 1. Every input must still match the checksum recorded when it was approved.
      let narrationFile = this.localFile(scope.narration.relativePath);
      requireValue(fs.existsSync(narrationFile) && R.fileSha256(narrationFile) === scope.narration.sha256, 'The approved narration file is missing or changed.', 409);
      let audioInfo = null;
      const audioCommands = [];
      if (scope.edit?.timeline.audio) {
        const config = Audio.settings(scope.edit.timeline.audio);
        this.progress(job.id, 'measuring narration', 0, total);
        const scanArgs = Audio.analysisArgs(narrationFile, config, {source: true});
        const measured = Audio.measurement((await exec('measure narration', job.paths.ffmpeg, scanArgs, Math.max(120000, scope.narration.durationSeconds * 1000))).stderr);
        audioCommands.push({step: 'measure narration', args: scanArgs});
        const audioFile = path.join(work, 'narration.wav'), args = Audio.finishArgs(narrationFile, audioFile, config, measured);
        this.progress(job.id, 'finishing narration', 0, total);
        await exec('finish narration', job.paths.ffmpeg, args, Math.max(120000, scope.narration.durationSeconds * 1000));
        audioCommands.push({step: 'finish narration', args});
        narrationFile = audioFile;
        audioInfo = {settings: config, source: measured};
        // Music and sound effects (P08c): every file is checked against its checksum, laid under or over the
        // finished voice by one filter graph, then the whole mix is brought back to the loudness target.
        const soundtrack = scope.edit.soundtrack;
        if (soundtrack && (soundtrack.music.length || soundtrack.sfx.length)) {
          const files = [...soundtrack.music, ...soundtrack.sfx].map(item => {
            const file = this.localFile(item.relativePath);
            requireValue(fs.existsSync(file) && R.fileSha256(file) === item.sha256, 'A generated music or sound-effect file is missing or changed.', 409);
            return file;
          });
          const graph = M.mixGraph({music: soundtrack.music, sfx: soundtrack.sfx, settings: {music: config.music || Audio.MUSIC_DEFAULTS, sfx: config.sfx || Audio.SFX_DEFAULTS}});
          fs.writeFileSync(path.join(work, 'mix-graph.txt'), graph);
          const mixed = path.join(work, 'mix.wav'), mixArgs = ['-hide_banner', '-nostdin', '-loglevel', 'error', '-i', narrationFile, ...files.flatMap(file => ['-i', file]), '-filter_complex_script', 'mix-graph.txt', '-map', '[out]', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s24le', '-fflags', '+bitexact', '-flags:a', '+bitexact', '-map_metadata', '-1', '-y', mixed];
          this.progress(job.id, `mixing ${soundtrack.music.length} music cue(s) and ${soundtrack.sfx.length} sound effect(s)`, 0, total);
          await exec('mix music and effects', job.paths.ffmpeg, mixArgs, Math.max(120000, scope.narration.durationSeconds * 2000), work);
          audioCommands.push({step: 'mix music and effects', args: mixArgs.map(arg => (path.isAbsolute(arg) ? path.basename(arg) : arg)), graphSha256: createHash('sha256').update(graph).digest('hex')});
          const mixScan = Audio.analysisArgs(mixed, config), mixMeasured = Audio.measurement((await exec('measure mix', job.paths.ffmpeg, mixScan, Math.max(120000, scope.narration.durationSeconds * 1000))).stderr);
          const finished = path.join(work, 'soundtrack.wav'), finishArgs = Audio.finishArgs(mixed, finished, {...config, mode: 'normalize'}, mixMeasured);
          await exec('finish mix', job.paths.ffmpeg, finishArgs, Math.max(120000, scope.narration.durationSeconds * 1000));
          audioCommands.push({step: 'finish mix', args: finishArgs.map(arg => (arg === mixed || arg === finished ? path.basename(arg) : arg))});
          narrationFile = finished;
          audioInfo.mix = {music: soundtrack.music.map(item => ({cueId: item.cueId, start: item.start, end: item.end, sha256: item.sha256})), sfx: soundtrack.sfx.map(item => ({kind: item.kind, seconds: item.seconds, reason: item.reason, sha256: item.sha256})), measured: mixMeasured};
        }
      }
      const shots = scope.shots.map(shot => {
        const file = this.localFile(shot.relativePath);
        requireValue(fs.existsSync(file) && R.fileSha256(file) === shot.sha256, `${shot.label}: the approved visual file is missing or changed.`, 409);
        return {...shot, file};
      });
      const out = path.join(work, 'proxy.mp4');
      let plan, motionInfo = null;
      const drawnInfo = [];
      if (scope.edit) {
        const files = {};
        for (const [clipId, entry] of Object.entries(scope.edit.files)) {
          const file = this.localFile(entry.relativePath);
          requireValue(fs.existsSync(file) && R.fileSha256(file) === entry.sha256, 'An approved visual file used by this edit is missing or changed.', 409);
          files[clipId] = file;
        }
        if (scope.edit.graphicsAss) fs.writeFileSync(path.join(work, 'graphics.ass'), scope.edit.graphicsAss);
        // Drawn shots: each is drawn again for its exact hold (plus its transition), and every drawing arrives on the
        // narrator's words as the captions time them. The approved drawing and engine decide every frame.
        const drawings = Object.entries(scope.edit.drawings || {});
        // A character already on screen in the clip before (same scene) stays on screen across the cut, even in
        // plans made before that rule (Sk.carry only removes a re-entrance; it never moves anything).
        const ordered = scope.edit.timeline.clips.map(clip => ({label: clip.label, sceneId: clip.sceneId, clipId: clip.id, sketch: scope.edit.drawings?.[clip.id] ? structuredClone(scope.edit.drawings[clip.id].sketch) : null}));
        Sk.carry(ordered);
        const carried = Object.fromEntries(ordered.filter(item => item.sketch).map(item => [item.clipId, item.sketch]));
        if (drawings.length) {
          const size = R.PRESETS.proxy[scope.format] || R.PRESETS.proxy['long-form'], tl = scope.edit.timeline, fps = Math.min(tl.fps, R.PRESETS.proxy.maxFps);
          const spec = scope.style.spec, spoken = (tl.captions?.groups || []).flatMap(group => group.words);
          // Lossless PNG frames, drawn by up to three local browsers side by side (each frame stays a pure function of
          // its shot, so parallel drawing changes nothing in the picture).
          const renderers = Array.from({length: Math.max(1, Math.min(3, Math.floor(os.cpus().length / 2), drawings.length))}, () => new MotionRenderer({browser: this.browser}));
          this.current.handle = {kill: () => { renderers.forEach(item => item.close()); }};
          let next = 0, finished = 0;
          const drawOne = async (renderer, k) => {
            const [clipId, drawing] = drawings[k];
            const index = tl.clips.findIndex(item => item.id === clipId), clip = tl.clips[index], extra = index < tl.clips.length - 1 ? tl.joins[index].frames : 0;
            const start = clip.start / tl.fps, seconds = (clip.frames + extra) / tl.fps;
            const words = spoken.filter(word => word.start >= start - 0.01 && word.start < start + seconds).map(word => ({text: word.text, start: round(word.start - start, 3)}));
            const folder = `drawn-${k + 1}`, file = `${folder}.mp4`;
            // Drawing is local: a browser that stalls (a busy or throttled PC) is restarted and the shot drawn again, so
            // one stalled frame never throws away a long render (live 0.26 run: a stall after 3.6 hours).
            const drawIt = () => {
              if (drawing.composition) {
                // Atelier shot: the composition, seeked so each reveal lands on the narrator's actual word.
                const comp = drawing.composition, canvas = scope.format === 'shorts' ? {width: 1080, height: 1920} : {width: 1920, height: 1080};
                const warp = At.warp({planned: comp.words || [], actual: words, composed: comp.composedSeconds, hold: seconds});
                return renderer.renderComposition({html: comp.html, frameId: comp.frameId, ...canvas, scale: size.width / canvas.width, canvas: comp.canvas, duration: seconds + 0.1, fps, warp, outDir: path.join(work, folder)});
              } else {
              const sketch = Sk.validate(carried[clipId] || drawing.sketch, {primary: E.ENGINES[scope.edit.engine]?.draws ? scope.edit.engine : 'motion', lenient: true});
              return renderer.render({template: 'sketch-scene', data: {...sketch, times: Sk.timing(sketch, words)}, palette: {bg: spec.palette.background, ink: spec.palette.primary, accent: spec.palette.accent}, fonts: {heading: spec.typography.headingFont, body: spec.typography.bodyFont, hand: 'Segoe Print'},
                vertical: scope.format === 'shorts', width: size.width, height: size.height, fps, duration: seconds + 0.1, outDir: path.join(work, folder)});
              }
            };
            let drawn;
            try { drawn = await drawIt(); } catch (error) {
              if (!/did not answer|did not start/i.test(String(error.message))) throw error;
              await renderer.close(); await renderer.start();
              fs.rmSync(path.join(work, folder), {recursive: true, force: true});
              logs.push({step: `redraw ${clip.label} after a stalled browser`, ok: true, stderr: ''});
              drawn = await drawIt();
            }
            const args = ['-hide_banner', '-nostdin', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(folder, drawn.pattern), '-c:v', 'libx264', '-preset', 'slow', '-crf', '12', '-pix_fmt', 'yuv420p', '-an', '-y', file];
            const out = await R.run(job.paths.ffmpeg, args, {timeout: Math.max(60000, drawn.frames * 200), cwd: work});
            logs.push({step: `encode ${clip.label}`, ok: true, stderr: R.tail(out.stderr)});
            fs.rmSync(path.join(work, folder), {recursive: true, force: true});
            files[clipId] = path.join(work, file);
            drawnInfo.push({clipId, label: clip.label, frames: drawn.frames, framesSha256: drawn.sha256, index: k});
            this.progress(job.id, `drew ${clip.label} (${++finished} of ${drawings.length})`, 0, total);
          };
          try {
            await Promise.all(renderers.map(item => item.start()));
            await Promise.all(renderers.map(async renderer => {
              while (next < drawings.length) {
                if (this.current.cancelledBy) throw Object.assign(new InputError('The render was cancelled.', 409), {cancelled: true});
                await drawOne(renderer, next++);
              }
            }));
          } finally {
            await Promise.all(renderers.map(item => item.close()));
            this.current.handle = null;
          }
          drawnInfo.sort((x, y) => x.index - y.index).forEach(item => { delete item.index; });
        }
        // Canvas graphics: drawn frame by frame in the local browser, then packed into lossless RGBA clips.
        const canvasGraphics = scope.edit.timeline.graphics.filter(item => item.status === 'accepted' && B.CANVAS_TEMPLATES.includes(item.template));
        const overlays = [];
        if (canvasGraphics.length) {
          const size = R.PRESETS.proxy[scope.format] || R.PRESETS.proxy['long-form'], fps = Math.min(scope.edit.timeline.fps, R.PRESETS.proxy.maxFps);
          const spec = scope.style.spec, renderer = new MotionRenderer({browser: this.browser});
          this.current.handle = {kill: () => { renderer.close(); }};
          try {
            await renderer.start();
            for (const [k, graphic] of canvasGraphics.entries()) {
              if (this.current.cancelledBy) throw Object.assign(new InputError('The render was cancelled.', 409), {cancelled: true});
              this.progress(job.id, `drawing ${graphic.template} ${k + 1} of ${canvasGraphics.length}`, 0, total);
              const frames = Math.max(1, Math.round(graphic.frames * fps / scope.edit.timeline.fps)), dir = path.join(work, `graphic-${k + 1}`);
              const drawn = await renderer.render({template: graphic.template, data: B.canvasData(graphic.template, graphic.title, graphic.lines), finish: graphic.finish || 'clean', vertical: scope.format === 'shorts',
                palette: {bg: spec.palette.background, ink: spec.palette.primary, accent: spec.palette.accent}, fonts: {heading: spec.typography.headingFont, body: spec.typography.bodyFont, hand: 'Segoe Print'},
                width: size.width, height: size.height, fps, duration: frames / fps, outDir: dir});
              const clip = `graphic-${k + 1}.mov`;
              await exec(`pack ${graphic.template}`, job.paths.ffmpeg, ['-hide_banner', '-nostdin', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(`graphic-${k + 1}`, 'f%05d.png'), '-c:v', 'png', '-pix_fmt', 'rgba', '-fflags', '+bitexact', '-map_metadata', '-1', '-y', clip], Math.max(60000, frames * 200), work);
              fs.rmSync(dir, {recursive: true, force: true});
              overlays.push({file: clip, start: graphic.start, frames, graphicId: graphic.id, template: graphic.template, framesSha256: drawn.sha256});
            }
            motionInfo = {browser: renderer.version, path: path.basename(this.browser), graphics: overlays.map(item => ({graphicId: item.graphicId, template: item.template, frames: item.frames, framesSha256: item.framesSha256}))};
          } finally {
            await renderer.close();
            this.current.handle = null;
          }
        }
        plan = R.planTimeline({timeline: scope.edit.timeline, files, narration: {file: narrationFile, durationSeconds: scope.narration.durationSeconds}, format: scope.format, workDir: work, outFile: out, graphics: !!scope.edit.graphicsAss, overlays});
      } else {
        plan = R.planProxy({shots, narration: {file: narrationFile, durationSeconds: scope.narration.durationSeconds}, spec: scope.style.spec, format: scope.format, workDir: work, outFile: out});
      }
      // 2. One segment per shot or clip, frame-exact.
      for (const segment of plan.segments) {
        this.progress(job.id, `rendering ${segment.label}`, segment.index + 1, total);
        await exec(`segment ${segment.label}`, job.paths.ffmpeg, segment.args, Math.max(60000, (segment.frames + segment.extraFrames) * 400));
      }
      // 3. Assemble with the narration (an edit first joins its runs of hard cuts losslessly).
      this.progress(job.id, 'assembling with narration', plan.segments.length + 1, total);
      for (const chunk of plan.chunks || []) {
        fs.writeFileSync(chunk.listFile, chunk.list);
        await exec(`join ${chunk.file}`, job.paths.ffmpeg, chunk.args, Math.max(60000, chunk.frames * 20), work);
      }
      if (plan.final.mode === 'concat') fs.writeFileSync(plan.final.listFile, plan.final.list);
      await exec('assemble', job.paths.ffmpeg, plan.final.args, Math.max(120000, plan.totalFrames * 200), plan.final.mode === 'edit' ? work : undefined);
      // 4. Technical QC on the real file.
      this.progress(job.id, 'checking the proxy', plan.segments.length + 2, total);
      const probe = await VS.probeMedia(out, job.paths.ffprobe);
      const streams = JSON.parse((await exec('ffprobe streams', job.paths.ffprobe, ['-v', 'error', '-show_streams', '-of', 'json', out], 60000)).stdout).streams || [];
      const audio = streams.find(stream => stream.codec_type === 'audio');
      if (audioInfo) {
        const args = Audio.analysisArgs(out, audioInfo.settings);
        const measured = await exec('verify encoded audio', job.paths.ffmpeg, args, Math.max(120000, scope.narration.durationSeconds * 1000));
        audioCommands.push({step: 'verify encoded audio', args});
        audioInfo.output = Audio.qc({stderr: measured.stderr, stream: audio, expectedSeconds: scope.narration.durationSeconds, config: audioInfo.settings});
      }
      const spec = scope.style.spec, qc = spec.qc;
      const scan = await exec('blackdetect and freezedetect', job.paths.ffmpeg, ['-hide_banner', '-nostdin', '-i', out, '-vf', `blackdetect=d=0.1:pix_th=0.10,freezedetect=n=0.003:d=${qc.maxFrozenSeconds}`, '-an', '-f', 'null', '-'], Math.max(120000, plan.totalFrames * 100));
      const found = R.detections(scan.stderr);
      const shotAt = scope.edit
        ? seconds => plan.segments.find((segment, index) => seconds >= segment.startFrame / plan.preset.fps - 0.001 && (index === plan.segments.length - 1 || seconds < plan.segments[index + 1].startFrame / plan.preset.fps))?.label || '—'
        : seconds => scope.shots.find((shot, index) => seconds >= shot.startSeconds - 0.001 && (index === scope.shots.length - 1 || seconds < scope.shots[index + 1].startSeconds))?.label || '—';
      // Planned dark moments are not defects: title cards sit on a dark panel and the edit fades out at the end.
      const planned = scope.edit ? [
        ...scope.edit.timeline.graphics.filter(item => item.status === 'accepted' && (item.template === 'title-card' || B.CANVAS_TEMPLATES.includes(item.template))).map(item => [item.start / scope.edit.timeline.fps, (item.start + item.frames) / scope.edit.timeline.fps]),
        ...(plan.fadeFrames ? [[(plan.totalFrames - plan.fadeFrames) / plan.preset.fps, plan.totalFrames / plan.preset.fps + 1]] : []),
      ] : [];
      const plannedDark = span => planned.some(([from, to]) => span.start >= from - 0.15 && span.end <= to + 0.15);
      // Cuts the edit did not plan, measured in the render itself: a stock clip's hidden cut that slipped
      // through, or a broken join. Planned changes are every clip boundary (with its soft transition), every
      // accepted graphic entering or leaving, and the fade-out.
      let cutCheck = null;
      if (scope.edit) {
        const tl = scope.edit.timeline, sec = frames => frames / tl.fps;
        const windows = [
          ...tl.clips.slice(1).map((clip, k) => { const soft = tl.joins[k].type === 'cut' ? 0 : sec(tl.joins[k].frames); return [sec(clip.start) - soft - 0.12, sec(clip.start) + soft + 0.12]; }),
          ...tl.graphics.filter(item => item.status === 'accepted').flatMap(item => [[sec(item.start) - 0.12, sec(item.start) + 0.7], [sec(item.start + item.frames) - 0.7, sec(item.start + item.frames) + 0.12]]),
          ...(plan.fadeFrames ? [[(plan.totalFrames - plan.fadeFrames) / plan.preset.fps - 0.12, plan.totalFrames / plan.preset.fps + 1]] : []),
          // A drawn shot's flashes, stamps and wipes are part of its drawing, not hidden cuts.
          ...tl.clips.filter(clip => scope.edit.drawings?.[clip.id]).map(clip => [sec(clip.start) - 0.12, sec(clip.start + clip.frames) + 0.12]),
        ];
        const measured = R.sceneCutTimes((await exec('scene cuts', job.paths.ffmpeg, ['-hide_banner', '-nostdin', '-i', out, '-an', '-vf', `select='gt(scene,${R.SCENE_CUT_THRESHOLD})',showinfo`, '-f', 'null', '-'], Math.max(120000, plan.totalFrames * 100))).stderr);
        const unplanned = measured.filter(time => !windows.some(([from, to]) => time >= from && time <= to));
        cutCheck = {name: 'unplanned cuts', passed: !unplanned.length, spans: unplanned.map(time => ({start: time, end: time})), detail: unplanned.length ? unplanned.map(time => `${time.toFixed(2)} s (${shotAt(time)})`).join('; ') : `none: ${measured.length} measured cut${measured.length === 1 ? '' : 's'}, all where the edit planned a change`};
      }
      // P09: the whole file decodes, sound and picture line up, and a render without a narration finish is
      // still checked for clipping (a finished narration has its own true-peak check).
      const decoded = await exec('full decode', job.paths.ffmpeg, R.decodeArgs(out), Math.max(120000, plan.totalFrames * 100)).catch(error => { if (error.cancelled) throw error; return {stderr: error.stderr || error.message, failed: true}; });
      let clipping = null;
      if (!audioInfo && audio) {
        const peak = Audio.measurement((await exec('audio peak', job.paths.ffmpeg, Audio.analysisArgs(out, Audio.DEFAULTS), Math.max(120000, scope.narration.durationSeconds * 1000))).stderr);
        clipping = {name: 'audio clipping', passed: peak.truePeakDb !== null && peak.truePeakDb <= -0.1, detail: `${peak.truePeakDb ?? 'unmeasured'} dBTP true peak (clips above -0.1)`};
      }
      const expected = plan.totalFrames / plan.preset.fps, tolerance = 1 / plan.preset.fps + 0.15;
      const darkSpans = found.black.filter(span => !(span.duration <= qc.maxBlackSeconds || plannedDark(span)));
      const checks = [
        R.decodeCheck(decoded),
        R.avAlignment(streams, plan.preset.fps),
        {name: 'duration', passed: Math.abs(probe.durationSeconds - expected) <= tolerance && Math.abs(probe.durationSeconds - scope.narration.durationSeconds) <= tolerance + 0.05, detail: `${probe.durationSeconds.toFixed(2)} s video for ${scope.narration.durationSeconds.toFixed(2)} s narration`},
        {name: 'frame', passed: probe.width === plan.preset.width && probe.height === plan.preset.height && Math.abs((probe.frameRate || 0) - plan.preset.fps) < 0.01, detail: `${probe.width}×${probe.height} at ${probe.frameRate} fps`},
        {name: 'narration audio', passed: !!audio && audio.codec_name === 'aac', detail: audio ? `${audio.codec_name} ${audio.sample_rate} Hz` : 'no audio stream'},
        {name: 'black frames', passed: !darkSpans.length, spans: darkSpans.map(({start, end}) => ({start, end})), detail: found.black.length ? found.black.map(span => `${span.duration.toFixed(2)} s at ${span.start.toFixed(1)} s (${shotAt(span.start)}${plannedDark(span) ? ', planned' : ''})`).join('; ') : 'none'},
        {name: 'frozen picture', passed: !found.frozen.length, spans: found.frozen.map(({start, end}) => ({start, end})), detail: found.frozen.length ? found.frozen.map(span => `${span.duration === null ? 'until the end' : `${span.duration.toFixed(1)} s`} from ${span.start.toFixed(1)} s (${shotAt(span.start)})`).join('; ') : `no hold longer than ${qc.maxFrozenSeconds} s`},
        ...(cutCheck ? [cutCheck] : []),
        ...(audioInfo ? audioInfo.output.checks : []),
        ...(clipping ? [clipping] : []),
      ];
      // 5. Contact sheet for review.
      this.progress(job.id, 'contact sheet', plan.segments.length + 3, total);
      let every = qc.contactSheetEverySeconds;
      // Up to 300 frames, so even a long video has a frame every few seconds (and each sentence a close thumbnail).
      if (expected / every > 300) every = Math.ceil(expected / 300);
      const count = Math.max(1, Math.ceil(expected / every)), cols = Math.min(scope.format === 'shorts' ? 8 : 6, count), rows = Math.ceil(count / cols);
      const sheet = path.join(work, 'contact-sheet.jpg');
      await exec('contact sheet', job.paths.ffmpeg, ['-hide_banner', '-nostdin', '-loglevel', 'error', '-i', out, '-vf', `fps=1/${every},scale=${scope.format === 'shorts' ? 120 : 240}:-2,tile=${cols}x${rows}:padding=4:margin=4`, '-frames:v', '1', '-q:v', '4', '-y', sheet], Math.max(60000, plan.totalFrames * 50));
      // The hook gets a dense sheet of its own: every second of the first 15 s (every half second of a Short's first 5 s).
      const hookEvery = scope.format === 'shorts' ? 0.5 : 1, hookSeconds = Math.min(expected, scope.format === 'shorts' ? 5 : 15);
      const hookCount = Math.max(1, Math.ceil(hookSeconds / hookEvery)), hookCols = Math.min(5, hookCount), hookRows = Math.ceil(hookCount / hookCols);
      const hook = path.join(work, 'hook-sheet.jpg');
      await exec('hook sheet', job.paths.ffmpeg, ['-hide_banner', '-nostdin', '-loglevel', 'error', '-t', String(hookSeconds), '-i', out, '-vf', `fps=${1 / hookEvery},scale=${scope.format === 'shorts' ? 120 : 240}:-2,tile=${hookCols}x${hookRows}:padding=4:margin=4`, '-frames:v', '1', '-q:v', '4', '-y', hook], 60000);
      const sheetSize = async file => JSON.parse((await exec('sheet size', job.paths.ffprobe, ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'json', file], 30000)).stdout).streams[0];
      // 6. Immutable outputs and manifest.
      this.progress(job.id, 'saving', total, total);
      fs.mkdirSync(finalDir, {recursive: true});
      const video = path.join(finalDir, 'proxy.mp4'), sheetFinal = path.join(finalDir, 'contact-sheet.jpg'), hookFinal = path.join(finalDir, 'hook-sheet.jpg');
      const sheetGrid = R.sheetGeometry(await sheetSize(sheet), cols, rows), hookGrid = R.sheetGeometry(await sheetSize(hook), hookCols, hookRows);
      fs.renameSync(out, video);
      fs.renameSync(sheet, sheetFinal);
      fs.renameSync(hook, hookFinal);
      const relative = file => path.relative(this.dataRoot, file).replaceAll('\\', '/');
      let audioArtifact = null;
      if (audioInfo) {
        const audioFinal = path.join(finalDir, 'narration.wav');
        fs.renameSync(narrationFile, audioFinal);
        audioArtifact = {relativePath: relative(audioFinal), sha256: R.fileSha256(audioFinal), sizeBytes: fs.statSync(audioFinal).size};
      }
      const scrub = args => args.map(arg => String(arg).replaceAll(work, '<work>').replaceAll(this.dataRoot, '<data>'));
      const manifest = {
        renderId: job.id, rendererVersion: R.RENDERER_VERSION, createdAt: now(), preset: plan.preset, transition: plan.transition, inputs: {contentRevision: scope.contentRevision, manifestId: scope.manifestId, manifestRevision: scope.manifestRevision, manifestHash: scope.manifestHash, visualApprovalId: job.visual_approval_id, narration: {approvalId: scope.narration.approvalId, sha256: scope.narration.sha256}, style: {revisionId: scope.style.revisionId, specHash: scope.style.specHash}, ffmpeg: scope.ffmpeg,
          edit: scope.edit ? {revisionId: scope.edit.revisionId, revision: scope.edit.revision, timelineId: scope.edit.timelineId, payloadHash: scope.edit.payloadHash, graphicsSha256: scope.edit.graphicsAss ? createHash('sha256').update(scope.edit.graphicsAss).digest('hex') : null, canvas: motionInfo, ...(drawnInfo.length ? {drawn: {engine: Sk.VERSION, clips: drawnInfo}} : {})} : null},
        shots: plan.segments.map(segment => ({label: segment.label, shotId: segment.shotId, clipId: segment.clipId || null, assetId: segment.assetId, sha256: scope.edit ? scope.edit.files[segment.clipId].sha256 : scope.shots[segment.index].sha256, mediaType: segment.mediaType, motion: segment.motion, startFrame: segment.startFrame, frames: segment.frames, extraFrames: segment.extraFrames})),
        commands: [...audioCommands.map(command => ({step: command.step, args: scrub(command.args)})), ...plan.segments.map(segment => ({step: `segment ${segment.label}`, args: scrub(segment.args)})), ...(plan.chunks || []).map(chunk => ({step: `join ${chunk.file}`, args: scrub(chunk.args)})), {step: 'assemble', args: scrub(plan.final.args)}],
        output: {sha256: R.fileSha256(video), sizeBytes: fs.statSync(video).size, probe}, audio: audioInfo ? {...audioInfo, artifact: audioArtifact} : null, qc: checks, detections: found, logs,
      };
      const manifestFile = path.join(finalDir, 'render-manifest.json');
      fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2), {flag: 'wx'});
      const result = {
        video: {relativePath: relative(video), sha256: manifest.output.sha256, sizeBytes: manifest.output.sizeBytes, probe},
        sheet: {relativePath: relative(sheetFinal), sha256: R.fileSha256(sheetFinal), everySeconds: every, frames: count, ...sheetGrid},
        hook: {relativePath: relative(hookFinal), sha256: R.fileSha256(hookFinal), everySeconds: hookEvery, frames: hookCount, seconds: hookSeconds, ...hookGrid},
        manifest: {relativePath: relative(manifestFile), sha256: R.fileSha256(manifestFile)},
        audio: audioArtifact, audioQc: audioInfo?.output || null,
        preset: plan.preset, transition: plan.transition, qc: checks, qcPassed: checks.every(check => check.passed), renderSeconds: round((Date.now() - started) / 1000, 1),
        plan: {commands: manifest.commands}, logs,
      };
      this.store.transaction(() => {
        this.db.prepare("UPDATE render_jobs SET status='completed', result=?, progress=NULL, updated_at=? WHERE id=?").run(JSON.stringify(result), now(), job.id);
        this.store.event(`Proxy render ${job.id.slice(0, 8)} finished: QC ${result.qcPassed ? 'passed' : 'found issues'} (${result.renderSeconds} s)`);
      });
      this.onRendered?.(job.id);
      return this.publicJob(this.row(job.id));
    } catch (error) {
      const cancelled = !!error.cancelled || !!this.current.cancelledBy;
      const message = cancelled ? `Cancelled by ${this.current.cancelledBy || 'the owner'} while running.` : error instanceof InputError ? error.message : 'The render failed.';
      this.db.prepare('UPDATE render_jobs SET status=?, error=?, progress=?, updated_at=? WHERE id=?').run(cancelled ? 'cancelled' : 'failed', message, JSON.stringify({stage: 'stopped', logs: logs.slice(-3)}), now(), job.id);
      fs.rmSync(finalDir, {recursive: true, force: true});
      return null;
    } finally {
      fs.rmSync(work, {recursive: true, force: true});
      this.current = null;
      this.busy = false;
    }
  }

  // ------------------------------------------------------------ human style-proof verdict
  review(id, input) {
    object(input);
    const reviewer = person(input.reviewer, 'Reviewer name');
    requireValue(['pass', 'changes'].includes(input.decision), 'Choose "style proof passed" or "needs changes".');
    return this.store.transaction(() => {
      const row = this.row(id), job = this.publicJob(row);
      requireValue(row.status === 'completed', 'Only a finished render can be reviewed.', 409);
      requireValue(!row.review, 'This render already has a verdict. Render again to review a new proxy.', 409);
      let review = {decision: input.decision === 'pass' ? 'passed' : 'changes_requested', reviewer, notes: text(input.notes || '', 'Notes', input.decision === 'changes' ? 8 : 0, 2000), at: now()};
      if (input.decision === 'pass') {
        requireValue(job.current, 'The visuals or narration changed after this render. Render again before passing the proof.', 409);
        const result = JSON.parse(row.result);
        const confirmations = object(input.confirmations, 'Confirmations');
        // After Claude scanned every sampled frame, checking each flagged moment can stand in for watching it all.
        const scanned = !!this.frameScanner?.latestFor(id)?.complete;
        requireValue(confirmations.watchedFully === true || (scanned && confirmations.flaggedReviewed === true), scanned ? 'Confirm that you checked every moment Claude and the checks flagged, or that you watched the whole render with sound.' : 'Confirm that you watched the whole proxy with sound.');
        requireValue(confirmations.styleMatches === true, 'Confirm that motion, pacing and transitions match the assigned style.');
        requireValue(confirmations.syncReviewed === true, 'Confirm that the visuals stay in step with the narration.');
        if (!result.qcPassed) requireValue(confirmations.qcAccepted === true, 'Accept the technical QC findings or fix them first.');
        const scope = JSON.parse(row.scope);
        if (scope.edit?.timeline.audio) {
          requireValue(result.audioQc?.passed === true, 'Fix the audio QC findings before approving this narration finish.', 409);
          requireValue(confirmations.audioReviewed === true, 'Confirm that you listened to the finished narration for clarity and natural delivery.');
        }
        // P09: the review's blockers (out of date, changed files, a file that does not decode) cannot be accepted away;
        // its critical editorial findings (the critic's and the caption checks') must be accepted explicitly.
        const report = this.qcReport(id);
        requireValue(!report.blockers.length, report.blockers[0]?.message, 409);
        const criticals = report.findings.filter(item => item.severity === 'critical' && item.source !== 'render').length;
        if (criticals) requireValue(confirmations.critiqueAccepted === true, `Accept the ${criticals} critical finding${criticals === 1 ? '' : 's'} from the editor, the caption checks and Claude, or fix them first.`);
        review = {...review, confirmations: {watchedFully: confirmations.watchedFully === true, flaggedReviewed: confirmations.flaggedReviewed === true && scanned ? true : null, styleMatches: true, syncReviewed: true, audioReviewed: scope.edit?.timeline.audio ? true : null, qcAccepted: result.qcPassed ? null : true, critiqueAccepted: criticals ? true : null},
          report: {schema: report.schema, counts: report.counts, checks: report.checks.length}};
      }
      this.db.prepare('UPDATE render_jobs SET review=?, updated_at=? WHERE id=?').run(JSON.stringify(review), now(), id);
      // Skills Engine: a "needs changes" style proof becomes a lesson candidate for human review.
      if (review.decision === 'changes_requested') {
        this.store.skillRuntime?.capture({
          familyId: row.family_id, skillId: 'qc.completion-standard', taskKey: 'editing.review',
          source: 'style-proof-review', sourceRef: row.id,
          finding: `A style proof was returned for changes: ${review.notes}`,
          evidence: [`render job ${row.id}`, `reviewer ${reviewer}`],
          proposal: {kind: 'add-check', value: review.notes.slice(0, 1200)},
        });
      }
      this.store.event(`Style proof for render ${id.slice(0, 8)}: ${review.decision} by ${reviewer}`);
      return this.publicJob(this.row(id));
    });
  }
  // P09 Review & QC: the consolidated, timecoded review of one render, recomputed from its immutable evidence
  // and the current state of its inputs (so a changed edit or file shows up at once).
  qcReport(id) {
    const row = this.row(id), job = this.publicJob(row), scope = JSON.parse(row.scope), result = row.result ? JSON.parse(row.result) : null;
    const integrity = result ? ['video', 'sheet', 'manifest', 'audio', 'hook'].filter(kind => result[kind]).map(kind => { try { this.file(id, kind); return {kind, ok: true}; } catch (error) { return {kind, ok: false, reason: error.message}; } }) : [];
    let findings = [], cues = null, autoFixes = [];
    if (scope.edit && this.editing) {
      const revision = this.editing.revisionRow(scope.edit.revisionId);
      findings = JSON.parse(revision.critique).findings;
      autoFixes = JSON.parse(revision.payload).meta?.autoFixes || [];
      if (job.current) cues = this.editing.cues(this.editing.inputs(this.store.content(row.content_id)));
    }
    const scan = this.frameScanner?.latestFor(row.id) || null;
    return {...Review.build({render: {id: row.id, status: row.status, current: job.current, review: job.review}, result, integrity, edit: scope.edit?.timeline || null, findings, cues, urls: {sheet: job.result?.sheetUrl, hook: job.result?.hookUrl}, scan}),
      contentId: row.content_id, autoFixes, editRevision: scope.edit ? {id: scope.edit.revisionId, revision: scope.edit.revision} : null, videoUrl: job.result?.videoUrl || null, audio: !!scope.edit?.timeline.audio};
  }
  file(id, kind) {
    const row = this.row(id);
    requireValue(row.result, 'This render has no output yet.', 404);
    const result = JSON.parse(row.result);
    requireValue(['video', 'sheet', 'manifest', 'audio', 'hook'].includes(kind), 'File not found.', 404);
    const entry = result[kind];
    requireValue(entry, 'File not found.', 404);
    const file = this.localFile(entry.relativePath);
    requireValue(fs.existsSync(file) && fs.statSync(file).size === (entry.sizeBytes ?? fs.statSync(file).size) && R.fileSha256(file) === entry.sha256, 'The render file is missing or changed.', 409);
    return {file, mime: kind === 'video' ? 'video/mp4' : kind === 'audio' ? 'audio/wav' : kind === 'sheet' || kind === 'hook' ? 'image/jpeg' : 'application/json; charset=utf-8', size: fs.statSync(file).size};
  }

  state() {
    const readiness = this.latestReadiness(), pin = this.activePin();
    const contents = this.store.contents().filter(content => content.state === 'approved' || this.db.prepare('SELECT 1 FROM render_jobs WHERE content_id=? LIMIT 1').get(content.id));
    return {
      rendererVersion: R.RENDERER_VERSION, checking: this.checking, readiness: readiness ? {...readiness, determinism: readiness.determinism} : null,
      pin, pinMatchesLatest: !!(pin && readiness && pin.ffmpegSha256 === readiness.ffmpeg?.sha256 && pin.ffprobeSha256 === readiness.ffprobe?.sha256), requiredFilters: R.REQUIRED_FILTERS, requiredEncoders: R.REQUIRED_ENCODERS,
      contents: contents.map(content => {
        const inputs = this.inputs(content);
        return {
          contentId: content.id, familyId: content.familyId, title: content.title, contentRevision: content.revision,
          inputs: {ready: inputs.ready, blockers: inputs.blockers, visualApprovalId: inputs.visual.approvalId || null, shots: inputs.visual.shots || 0, style: inputs.spec ? {name: inputs.spec.name, adapter: inputs.spec.renderer.adapter, transition: inputs.spec.transitions.default, fps: inputs.spec.canvas.frameRate} : null, narrationSeconds: inputs.voice?.analysis?.durationSeconds ?? null},
          renders: this.db.prepare('SELECT * FROM render_jobs WHERE content_id=? ORDER BY created_at DESC, rowid DESC LIMIT 10').all(content.id).map(row => this.publicJob(row)),
        };
      }),
    };
  }
}

module.exports = {RenderRoom};
