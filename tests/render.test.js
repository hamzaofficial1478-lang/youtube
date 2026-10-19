'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {createHash, randomUUID} = require('node:crypto');
const {Store} = require('../store');
const {StyleLibrary} = require('../style');
const {QuotaLedger} = require('../intel-sources');
const VS = require('../visual-sources');
const {SceneRoom} = require('../scene-room');
const {RenderRoom} = require('../render-room');
const R = require('../render');
const {createApp} = require('../server');

const hasFFmpeg = (() => { try { execFileSync('ffprobe', ['-version'], {stdio: 'ignore'}); execFileSync('ffmpeg', ['-version'], {stdio: 'ignore'}); return true; } catch { return false; } })();
const skip = hasFFmpeg ? false : 'FFmpeg/ffprobe are not installed on this machine';
const sha = buffer => createHash('sha256').update(buffer).digest('hex');
const ffmpeg = args => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', ...args]);

const hook = 'Every coin in your pocket began as a quiet promise.';
const script = [
  `${hook} Long ago two villages traded salt for grain. Nobody carried coins. They carved small marks on clay tokens to remember who owed what.`,
  'Each token was a promise you could hold. Merchants checked the marks before every trade. Temples kept the tokens safe in sealed jars.',
  'Over time the tokens became smaller and easier to carry. People trusted the mark more than the clay itself. That trust is still inside every coin you spend today, and it started with a simple promise.',
].join('\n\n');

function setup(t, {seconds = 24} = {}) {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'render-room-'));
  const store = new Store(':memory:', {artifactRoot: dataRoot});
  t.after(() => { store.close(); fs.rmSync(dataRoot, {recursive: true, force: true}); });
  const styles = new StyleLibrary(store), quota = new QuotaLedger(store);
  const family = store.saveFamily({name: 'Money Shorts', tier: 'A', countries: ['United States'], audience: 'Curious adults who like quick money history.', niche: 'Origins of money', locales: ['en-US'], timezone: 'Asia/Karachi', monthlyBudget: 50, cadence: 3, format: 'shorts', monthlyTokenLimit: 200000, scriptTokenLimit: 4000, researchTokenLimit: 4000});
  let content = store.saveContent({familyId: family.id, title: 'The first promise', kind: 'fiction', angle: 'Invented villages show how trust became money.', hook, script, sources: [], rightsConfirmed: true});
  store.reviewContent(content.id, {revision: content.revision, action: 'submit'});
  content = store.reviewContent(content.id, {revision: content.revision, action: 'approve'});
  const montage = styles.profiles().find(item => item.key === 'documentary-montage').revisions.at(-1);
  styles.approveRevision(montage.id, {approvedBy: 'Owner', notes: 'Fixture.', confirmations: {specReviewed: true, rightsReviewed: true, originalityReviewed: true}});
  styles.assign(family.id, {familyRevision: store.family(family.id).revision, assignedBy: 'Owner', reason: 'Stock and AI visuals suit this family.', revisionId: montage.id, expectedAssignmentId: null});
  // A real narration WAV so the renderer mixes actual audio.
  store.db.prepare('INSERT INTO connectors(id,name_key,payload,secret) VALUES(?,?,?,?)').run('openai-1', 'openai-1', JSON.stringify({name: 'openai-1', provider: 'openai', revision: 1, test: {status: 'passed', at: new Date().toISOString()}}), Buffer.from('x'));
  const profile = store.saveVoiceProfile(family.id, {revision: 0, familyRevision: store.family(family.id).revision, name: 'Narrator', connectorId: 'openai-1', connectorRevision: 1, provider: 'openai', model: 'gpt-4o-mini-tts', voiceId: 'alloy', voiceVersion: 'current', ownershipBasis: 'provider_stock_voice', rightsHolder: 'Provider catalog', consentConfirmed: true, commercialUseConfirmed: true, evidenceReference: 'Terms reviewed by the owner.', termsReviewedAt: '2026-09-19', pace: 1, energy: 55, emotion: 'warm', pauseScale: 1, emphasis: 50, instructions: 'Warm delivery.', lexicon: [], monthlyCharacterLimit: 1000000, maxCharactersPerAudition: 20000, priceCentsPerMillionCharacters: 1500});
  const job = store.queueVoiceAudition(content.id, {contentRevision: content.revision, profileId: profile.id, profileRevision: profile.revision, connectorId: 'openai-1', connectorRevision: 1});
  const claimed = store.claimVoiceAudition();
  const relativePath = `voice-artifacts/${job.id}.wav`, wav = path.join(dataRoot, relativePath);
  fs.mkdirSync(path.dirname(wav), {recursive: true});
  ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=44100', '-t', String(seconds), '-c:a', 'pcm_s16le', '-y', wav]);
  const bytes = fs.readFileSync(wav);
  const audition = store.completeVoiceAudition(job.id, {artifact: {relativePath, sha256: sha(bytes), sizeBytes: bytes.length, mime: 'audio/wav'}, analysis: {passed: true, durationSeconds: seconds, silenceRatio: 0, checks: []}, provider: {requestIds: [], model: 'gpt-4o-mini-tts', voiceId: 'alloy', voiceVersion: 'current'}, settledCharacters: claimed.scope.characterCount});
  store.selectVoiceAudition(audition.id, {approvedBy: 'Owner', comparisonNotes: 'Compared the complete narration for pacing and clarity.', intelligibilityConfirmed: true});
  const scenes = new SceneRoom(store, null, quota, styles, {dataRoot});
  const renders = new RenderRoom(store, styles, scenes, {dataRoot, ffmpeg: 'ffmpeg', ffprobe: 'ffprobe'});
  return {dataRoot, store, styles, scenes, renders, family, content};
}

// Plans the scenes, fills every shot with real local media (stills and clips) and approves the board.
async function approvedBoard({dataRoot, store, scenes, content}) {
  let {manifest} = scenes.createPlan(content.id, {mode: 'rules', requestedBy: 'Owner', contentRevision: content.revision});
  const first = manifest.plan.scenes[0].shots[0];
  manifest = scenes.editManifest(manifest.id, {op: 'update-shot', shotId: first.id, source: 'stock-image', motion: 'ken-burns', createdBy: 'Owner', expectedRevision: manifest.revision});
  scenes.reviewManifest(manifest.id, {decision: 'approve', reviewer: 'Owner', confirmations: {coverageReviewed: true, directionReviewed: true}});
  const media = path.join(dataRoot, 'fixture-media');
  fs.mkdirSync(media, {recursive: true});
  ffmpeg(['-f', 'lavfi', '-i', 'testsrc=size=1080x1920', '-frames:v', '1', '-y', path.join(media, 'still.jpg')]);
  ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30', '-t', '12', '-c:v', 'mpeg4', '-q:v', '10', '-y', path.join(media, 'clip.mp4')]);
  const shots = manifest.plan.scenes.flatMap(scene => scene.shots);
  for (const [index, shot] of shots.entries()) {
    const still = index % 2 === 0, source = path.join(media, still ? 'still.jpg' : 'clip.mp4'), id = randomUUID();
    const relative = `visual-assets/${content.familyId}/${content.id}/${id}.${still ? 'jpg' : 'mp4'}`, file = path.join(dataRoot, relative);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.copyFileSync(source, file);
    const bytes = fs.readFileSync(file), probe = await VS.probeMedia(file);
    store.db.prepare('INSERT INTO visual_assets(id,family_id,content_id,shot_id,origin,capability,source_job_id,candidate_id,media_type,relative_path,thumb_path,sha256,size_bytes,mime,probe,rights,created_by,created_at) VALUES(?,?,?,?,?,?,?,NULL,?,?,NULL,?,?,?,?,?,?,?)')
      .run(id, content.familyId, content.id, shot.id, 'stock', JSON.stringify(VS.capability(still ? 'pexels-photo' : 'pexels-video')), 'fixture', still ? 'image' : 'video', relative, sha(bytes), bytes.length, still ? 'image/jpeg' : 'video/mp4', JSON.stringify(probe), JSON.stringify({basis: 'stock-license', license: VS.CAPABILITIES['pexels-photo'].rights, synthetic: false, disclosure: 'none'}), 'Owner', new Date().toISOString());
    scenes.select({manifestId: manifest.id, shotId: shot.id, assetId: id, selectedBy: 'Owner'});
  }
  return {manifest, approval: await scenes.approveVisuals(manifest.id, {approvedBy: 'Owner', confirmations: {rightsReviewed: true, sequenceReviewed: true, warningsAccepted: true}})};
}
const ready = async renders => { const report = await renders.checkReadiness({requestedBy: 'Owner'}); renders.pin({readinessId: report.id, pinnedBy: 'Owner', reason: 'Reviewed build for the first proof.'}); return report; };

test('proxy plan snaps shots to frames and computes crossfade offsets that keep the narration length', () => {
  const spec = {canvas: {frameRate: 30}, transitions: {default: 'crossfade', maxDurationMs: 600}, motion: {intensity: 35}};
  const shots = [{shotId: 'a', label: 'S01A', mediaType: 'image', motion: 'ken-burns', startSeconds: 0, file: 'a.jpg'}, {shotId: 'b', label: 'S01B', mediaType: 'video', motion: 'static', startSeconds: 3.333, clipSeconds: 2, file: 'b.mp4'}, {shotId: 'c', label: 'S02A', mediaType: 'image', motion: 'pan', startSeconds: 7.01, file: 'c.jpg'}];
  const plan = R.planProxy({shots, narration: {file: 'n.wav', durationSeconds: 10}, spec, format: 'long-form', workDir: '/w', outFile: '/w/o.mp4'});
  assert.deepEqual(plan.segments.map(item => [item.startFrame, item.frames, item.extraFrames]), [[0, 100, 18], [100, 110, 18], [210, 90, 0]]);
  assert.equal(plan.totalFrames, 300);
  assert.equal(plan.final.mode, 'xfade');
  assert.match(plan.final.args.join(' '), /xfade=transition=fade:duration=0\.6:offset=3\.333333\[v1\];\[v1\]\[2:v\]xfade=transition=fade:duration=0\.6:offset=7\[vout\]/);
  assert.deepEqual([plan.preset.width, plan.preset.height, plan.preset.fps], [640, 360, 30]);
  assert.deepEqual(plan.segments.map(item => item.motion), ['zoom-in', 'clip', 'pan-right']);
  const cut = R.planProxy({shots, narration: {file: 'n.wav', durationSeconds: 10}, spec: {...spec, transitions: {default: 'cut', maxDurationMs: 0}}, format: 'shorts', workDir: '/w', outFile: '/w/o.mp4'});
  assert.equal(cut.final.mode, 'concat');
  assert.deepEqual([cut.preset.width, cut.preset.height], [360, 640]);
  assert.ok(cut.segments.every(item => item.extraFrames === 0));
  assert.equal(R.zoompanFor('static', 0, 10, 35).z, '1');
  assert.match(R.zoompanFor('ken-burns', 1, 10, 100).z, /^1\.2-0\.2\*on\/9$/);
  assert.deepEqual(R.detections('[blackdetect @ x] black_start:6.3 black_end:6.4 black_duration:0.1\n[freezedetect @ y] lavfi.freezedetect.freeze_start: 5.4\n[freezedetect @ y] lavfi.freezedetect.freeze_duration: 0.7').frozen, [{start: 5.4, duration: 0.7, end: 6.1000000000000005}]);
});

test('readiness, pinned build, deterministic proxy render with QC, contact sheet, manifest and a human style proof', {skip}, async t => {
  const env = setup(t);
  const {renders, scenes, content, store, dataRoot} = env;
  assert.match(renders.inputs(content).blockers.join(' '), /Approve the visuals|Create and approve a scene plan/);
  const {approval} = await approvedBoard(env);
  assert.throws(() => renders.queueRender(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id}), /readiness check first/);
  const report = await renders.checkReadiness({requestedBy: 'Owner'});
  assert.equal(report.passed, true, JSON.stringify(report.issues));
  assert.equal(report.determinism.passed, true);
  assert.ok(Object.values(report.filters).every(Boolean));
  assert.match(report.ffmpeg.sha256, /^[a-f0-9]{64}$/);
  assert.throws(() => renders.queueRender(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id}), /Pin a reviewed FFmpeg build/);
  assert.throws(() => renders.pin({readinessId: 'other', pinnedBy: 'Owner', reason: 'Reviewed build.'}), /fresh readiness check/);
  renders.pin({readinessId: report.id, pinnedBy: 'Owner', reason: 'Reviewed build for the first proof.'});
  assert.throws(() => renders.queueRender(content.id, {requestedBy: 'Owner', visualApprovalId: 'stale'}), /visual approval changed/);

  const queued = renders.queueRender(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id});
  assert.throws(() => renders.queueRender(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id}), /already queued/);
  const done = await renders.processNext();
  assert.equal(done.status, 'completed', JSON.stringify(renders.publicJob(renders.row(queued.id)).error));
  const result = JSON.parse(renders.row(queued.id).result);
  assert.deepEqual([result.video.probe.width, result.video.probe.height, result.video.probe.frameRate], [360, 640, 30]);
  assert.ok(Math.abs(result.video.probe.durationSeconds - 24) < 0.1);
  assert.equal(result.qc.find(item => item.name === 'narration audio').passed, true);
  assert.equal(result.qc.find(item => item.name === 'duration').passed, true);
  assert.equal(result.transition.applied, 'cut', 'Documentary Montage cuts by default');
  const video = path.join(dataRoot, result.video.relativePath);
  assert.equal(R.fileSha256(video), result.video.sha256);
  assert.ok(fs.statSync(path.join(dataRoot, result.sheet.relativePath)).size > 1000);
  const manifest = JSON.parse(fs.readFileSync(path.join(dataRoot, result.manifest.relativePath), 'utf8'));
  assert.equal(manifest.inputs.visualApprovalId, approval.id);
  assert.equal(manifest.shots[0].motion, 'zoom-in', 'the first still uses the Ken Burns cycle');
  assert.ok(manifest.commands.every(command => !command.args.join(' ').includes(dataRoot)), 'command plans do not leak local paths');
  assert.throws(() => store.db.prepare('UPDATE render_jobs SET result=? WHERE id=?').run('{}', queued.id), /immutable/);
  assert.equal(fs.existsSync(path.join(dataRoot, 'renders', '.work', queued.id)), false, 'work files are removed');

  // Same inputs, same pinned build: byte-identical proxy.
  const again = renders.queueRender(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id});
  await renders.processNext();
  assert.equal(JSON.parse(renders.row(again.id).result).video.sha256, result.video.sha256);

  assert.throws(() => renders.review(queued.id, {decision: 'pass', reviewer: 'Owner', confirmations: {watchedFully: true, styleMatches: true}}), /in step with the narration/);
  const passed = renders.review(queued.id, {decision: 'pass', reviewer: 'Owner', confirmations: {watchedFully: true, styleMatches: true, syncReviewed: true, qcAccepted: true}});
  assert.equal(passed.review.decision, 'passed');
  assert.throws(() => renders.review(queued.id, {decision: 'changes', reviewer: 'Owner', notes: 'Second opinion.'}), /already has a verdict/);

  // A changed visual makes earlier renders out of date.
  const shotId = JSON.parse(renders.row(queued.id).scope).shots[1].shotId, otherAsset = JSON.parse(renders.row(queued.id).scope).shots[0].assetId;
  scenes.select({manifestId: approval.manifestId, shotId, assetId: otherAsset, selectedBy: 'Owner'});
  assert.equal(renders.publicJob(renders.row(again.id)).current, false);
  assert.throws(() => renders.review(again.id, {decision: 'pass', reviewer: 'Owner', confirmations: {watchedFully: true, styleMatches: true, syncReviewed: true, qcAccepted: true}}), /changed after this render/);
});

test('a changed FFmpeg binary, cancellation and restarts never render silently', {skip}, async t => {
  const env = setup(t, {seconds: 12});
  const {renders, content, store, styles, scenes, dataRoot} = env;
  const {approval} = await approvedBoard(env);
  await ready(renders);
  const first = renders.queueRender(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id});
  assert.equal(renders.cancel(first.id, {requestedBy: 'Owner'}).status, 'cancelled');
  assert.equal(renders.retry(first.id, {}).status, 'queued');
  store.db.prepare("UPDATE render_pins SET ffmpeg_sha256='0000' WHERE ended_at IS NULL").run();
  assert.equal(await renders.processNext(), null);
  assert.match(renders.publicJob(renders.row(first.id)).error, /binary changed since it was pinned/);
  assert.equal(renders.publicJob(renders.row(first.id)).status, 'stale');

  await ready(renders);
  const second = renders.queueRender(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id});
  const running = renders.processNext();
  await new Promise(resolve => setTimeout(resolve, 50));
  renders.cancel(second.id, {requestedBy: 'Owner'});
  await running;
  assert.equal(renders.publicJob(renders.row(second.id)).status, 'cancelled');
  assert.equal(fs.existsSync(path.join(dataRoot, 'renders', '.work', second.id)), false);

  store.db.prepare("UPDATE render_jobs SET status='running' WHERE id=?").run(second.id);
  const restarted = new RenderRoom(store, styles, scenes, {dataRoot});
  assert.equal(restarted.publicJob(restarted.row(second.id)).status, 'interrupted');
  assert.equal(restarted.retry(second.id, {}).status, 'queued');
});

test('HTTP routes serve render state, need the local token and stream video ranges', {skip}, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'render-http-'));
  const {server} = createApp({dataFile: path.join(dir, 'workspace.sqlite'), worker: false, protector: {transform: (op, input) => Buffer.from([...input].reverse())}, voiceOptions: {ffmpeg: 'ffmpeg', ffprobe: 'ffprobe'}});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(() => { fs.rmSync(dir, {recursive: true, force: true}); resolve(); }); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const state = await (await fetch(`${base}/api/state`)).json();
  assert.ok(state.renders);
  assert.equal(state.renders.readiness, null);
  assert.equal((await fetch(`${base}/render-room.js`)).status, 200);
  const send = (url, body, token = state.token) => fetch(base + url, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Local-Token': token}, body: JSON.stringify(body)});
  assert.equal((await send('/api/render-readiness', {requestedBy: 'Owner'}, 'bad')).status, 403);
  const report = await (await send('/api/render-readiness', {requestedBy: 'Owner'})).json();
  assert.equal(report.passed, true);
  assert.equal((await send('/api/render-pins', {readinessId: report.id, pinnedBy: 'Owner', reason: 'Reviewed build.'})).status, 200);
  assert.equal((await fetch(`${base}/api/renders/00000000-0000-0000-0000-000000000000/video`)).status, 404);
});

test('the FFmpeg here draws every transition of the catalogue', {skip}, () => {
  const T = require('../transitions');
  for (const fade of new Set(Object.values(T.CATALOG).map(item => item.xfade))) {
    const out = ffmpeg(['-f', 'lavfi', '-i', 'color=c=red:s=64x36:d=1:r=10', '-f', 'lavfi', '-i', 'color=c=blue:s=64x36:d=1:r=10', '-filter_complex', `xfade=transition=${fade}:duration=0.4:offset=0.5,format=gray`, '-f', 'rawvideo', '-']);
    assert.equal(out.length, 64 * 36 * 15, `${fade} draws 1.5 s`);
  }
});

// 0.40: the Cinematic engine's finish - one grade on every clip, seeded grain and 2.39:1 bars - keeps frames exact,
// keeps BT.709 TV range on every segment (or chunk joins drop frames) and renders the same bytes twice.
test('the cinematic finish grades every clip, adds grain and bars, and stays frame-exact and repeatable', {skip}, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'render-cinema-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  ffmpeg(['-f', 'lavfi', '-i', 'testsrc=size=1920x1280', '-frames:v', '1', '-y', path.join(dir, 'a.jpg')]);
  ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=25', '-t', '3', '-c:v', 'mpeg4', '-y', path.join(dir, 'b.mp4')]);
  ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000', '-t', '4', '-c:a', 'pcm_s16le', '-y', path.join(dir, 'n.wav')]);
  const spec = {canvas: {frameRate: 30}, transitions: {default: 'cut', maxDurationMs: 0}, motion: {intensity: 35}};
  const shots = [{shotId: 'a', label: 'S01A', mediaType: 'image', motion: 'ken-burns', startSeconds: 0, file: path.join(dir, 'a.jpg')}, {shotId: 'b', label: 'S01B', mediaType: 'video', motion: 'static', startSeconds: 2, clipSeconds: 3, file: path.join(dir, 'b.mp4')}];
  const frameOf = (file, filter) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-vf', `select=eq(n\\,10),${filter}`, '-frames:v', '1', '-f', 'rawvideo', '-']);
  for (const grade of Object.keys(R.GRADE_FILTERS)) {
    const out = path.join(dir, `${grade}.mp4`), look = {grade, grain: 30, letterbox: true};
    const plan = R.planProxy({shots, narration: {file: path.join(dir, 'n.wav'), durationSeconds: 4}, spec, format: 'long-form', workDir: dir, outFile: out, look});
    assert.deepEqual(plan.look, look);
    for (const segment of plan.segments) await R.run('ffmpeg', segment.args);
    const first = sha(fs.readFileSync(plan.segments[1].file));
    await R.run('ffmpeg', plan.segments[1].args);
    assert.equal(sha(fs.readFileSync(plan.segments[1].file)), first, `${grade}: the grain is seeded, so a render repeats exactly`);
    for (const segment of plan.segments) {
      const tags = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=color_space,color_range', '-of', 'default=nw=1', segment.file]).toString();
      assert.ok(/color_space=bt709/.test(tags) && /color_range=tv/.test(tags), `${grade} ${segment.label} keeps one colour profile`);
      const gray = frameOf(segment.file, 'format=gray'), {width, height} = plan.preset, row = y => gray.subarray(y * width, (y + 1) * width).reduce((sum, v) => sum + v, 0) / width;
      assert.ok(row(2) < 24 && row(height - 3) < 24, `${grade} ${segment.label}: cinema bars at the top and bottom`);
      assert.ok(row(Math.round(height / 2)) > 40, `${grade} ${segment.label}: the picture between them`);
    }
    if (grade === 'noir') {
      const rgb = frameOf(plan.segments[1].file, 'format=rgb24');
      let spread = 0;
      for (let k = rgb.length / 2; k < rgb.length / 2 + 3000; k += 3) spread = Math.max(spread, Math.abs(rgb[k] - rgb[k + 1]), Math.abs(rgb[k + 1] - rgb[k + 2]));
      assert.ok(spread <= 12, `black and white has no colour left (spread ${spread})`);
    }
    fs.writeFileSync(plan.final.listFile, plan.final.list);
    await R.run('ffmpeg', plan.final.args, {timeout: 120000});
    const frames = Number(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', out]).toString().trim());
    assert.equal(frames, 120, `${grade} keeps 120 frames for 4 s`);
  }
  assert.equal(R.lookFilters(null, {width: 640, height: 360}, 0), '', 'other engines are untouched');
  assert.doesNotMatch(R.lookFilters({grade: 'natural', grain: 0, letterbox: true}, {width: 360, height: 640}, 0), /drawbox/, 'no bars on a vertical short');
});

test('crossfade and dip-to-black assemblies stay frame-exact against the narration', {skip}, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'render-xfade-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  ffmpeg(['-f', 'lavfi', '-i', 'testsrc=size=1920x1280', '-frames:v', '1', '-y', path.join(dir, 'a.jpg')]);
  ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=25', '-t', '2', '-c:v', 'mpeg4', '-y', path.join(dir, 'b.mp4')]);
  ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000', '-t', '10', '-c:a', 'pcm_s16le', '-y', path.join(dir, 'n.wav')]);
  for (const transition of ['crossfade', 'dip-to-black']) {
    const spec = {canvas: {frameRate: 30}, transitions: {default: transition, maxDurationMs: 500}, motion: {intensity: 35}};
    const shots = [{shotId: 'a', label: 'S01A', mediaType: 'image', motion: 'ken-burns', startSeconds: 0, file: path.join(dir, 'a.jpg')}, {shotId: 'b', label: 'S01B', mediaType: 'video', motion: 'static', startSeconds: 3.4, clipSeconds: 2, file: path.join(dir, 'b.mp4')}, {shotId: 'c', label: 'S02A', mediaType: 'image', motion: 'zoom', startSeconds: 6.8, file: path.join(dir, 'a.jpg')}];
    const out = path.join(dir, `${transition}.mp4`);
    const plan = R.planProxy({shots, narration: {file: path.join(dir, 'n.wav'), durationSeconds: 10}, spec, format: 'long-form', workDir: dir, outFile: out});
    for (const segment of plan.segments) await R.run('ffmpeg', segment.args);
    await R.run('ffmpeg', plan.final.args, {timeout: 120000});
    const frames = Number(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', out]).toString().trim());
    assert.equal(frames, 300, `${transition} keeps 300 frames for 10 s`);
    const probe = await VS.probeMedia(out);
    assert.ok(Math.abs(probe.durationSeconds - 10) < 0.05);
  }
});
