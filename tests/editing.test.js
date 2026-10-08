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
const {SceneRoom, splitSentences, timeSentences} = require('../scene-room');
const {RenderRoom} = require('../render-room');
const {EditingRoom} = require('../editing-room');
const {SkillsEngine} = require('../skills');
const B = require('../editing-brain');
const Cap = require('../captions');
const R = require('../render');
const {createApp} = require('../server');

const hasFFmpeg = (() => { try { execFileSync('ffprobe', ['-version'], {stdio: 'ignore'}); execFileSync('ffmpeg', ['-version'], {stdio: 'ignore'}); return true; } catch { return false; } })();
const skip = hasFFmpeg ? false : 'FFmpeg/ffprobe are not installed on this machine';
const sha = buffer => createHash('sha256').update(buffer).digest('hex');
const ffmpeg = args => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', ...args]);

// A documentary-montage style as the brain sees it.
const SPEC = {
  name: 'Documentary Montage', canvas: {frameRate: 30},
  pacing: {shotMinSeconds: 3, shotMaxSeconds: 8, hookShotMaxSeconds: 2.5, maxStaticHoldSeconds: 8},
  transitions: {allowed: ['cut', 'crossfade', 'dip-to-black'], default: 'cut', maxDurationMs: 700},
  motion: {cameraMoves: ['static', 'ken-burns', 'pan', 'zoom'], intensity: 35},
  typography: {headingFont: 'Georgia', bodyFont: 'Arial', maxWordsOnScreen: 8, minTextHeightPercent: 4},
  palette: {background: '#0E0E0E', primary: '#F2EEE6', accent: '#C9A227'}, qc: {maxFrozenSeconds: 6, maxBlackSeconds: 1},
};
const TEXTS = ['In 1347 a ship docked in Messina.', 'Within months, 60% of the city was gone.', 'Nobody knew why.', 'Doctors wrote that "the air itself had turned to poison" in their reports.', 'But the real cause was hiding in plain sight.', 'Rats carried fleas, and fleas carried the plague.', 'By 1351 the plague had crossed Europe.', 'Today we know the bacterium by name.'];
function fixture({videoE = 2} = {}) {
  let t = 0;
  const sentences = TEXTS.map((text, index) => { const words = text.split(' ').length; const item = {n: index + 1, text, words, startSeconds: Math.round(t * 1000) / 1000, durationSeconds: words * 0.42}; t += words * 0.42; return item; });
  const scenes = [
    {id: 'sc1', label: 'S01', purpose: 'hook', onScreenText: '1347: the ship', sentenceStart: 1, sentenceEnd: 2, shots: [{id: 'a', label: 'S01A', motion: 'ken-burns'}, {id: 'b', label: 'S01B', motion: 'ken-burns'}]},
    {id: 'sc2', label: 'S02', purpose: 'evidence', onScreenText: '', sentenceStart: 3, sentenceEnd: 4, shots: [{id: 'c', label: 'S02A', motion: 'ken-burns'}, {id: 'd', label: 'S02B', motion: 'zoom'}]},
    {id: 'sc3', label: 'S03', purpose: 'turn', onScreenText: 'The hidden *cause*', sentenceStart: 5, sentenceEnd: 6, shots: [{id: 'e', label: 'S03A', motion: 'ken-burns'}, {id: 'f', label: 'S03B', motion: 'ken-burns'}]},
    {id: 'sc4', label: 'S04', purpose: 'close', onScreenText: '', sentenceStart: 7, sentenceEnd: 8, shots: [{id: 'g', label: 'S04A', motion: 'ken-burns'}]},
  ];
  const assets = {a: {assetId: 'A', mediaType: 'image'}, b: {assetId: 'B', mediaType: 'video', clipSeconds: 10}, c: {assetId: 'C', mediaType: 'image'}, d: {assetId: 'D', mediaType: 'image'}, e: {assetId: 'E', mediaType: 'video', clipSeconds: videoE}, f: {assetId: 'F', mediaType: 'image'}, g: {assetId: 'G', mediaType: 'image'}};
  return {sentences, scenes, assets, narrationSeconds: Math.round(t * 1000) / 1000};
}

test('narration pauses move the estimated sentence starts onto the real breaks', () => {
  assert.deepEqual(B.pausesFromSilence('[silencedetect @ x] silence_start: 2.51\n[silencedetect @ x] silence_end: 2.93 | silence_duration: 0.42\n[silencedetect @ x] silence_start: -0.01\n'), [{start: 2.51, end: 2.93}]);
  const {sentences, narrationSeconds} = fixture();
  const pauses = sentences.slice(1).map(item => ({start: item.startSeconds + 0.1, end: item.startSeconds + 0.45}));
  const aligned = B.alignSentences(sentences, pauses, narrationSeconds);
  assert.equal(aligned.method, 'pause-aligned');
  assert.equal(aligned.matched, sentences.length - 1);
  aligned.sentences.slice(1).forEach((item, index) => assert.ok(Math.abs(item.startSeconds - (sentences[index + 1].startSeconds + 0.37)) < 0.01, `sentence ${index + 2} lands just before its first word`));
  assert.ok(Math.abs(aligned.sentences.reduce((sum, item) => sum + item.durationSeconds, 0) - narrationSeconds) < 0.01);
  const none = B.alignSentences(sentences, [], narrationSeconds);
  assert.equal(none.method, 'word-share');
  assert.deepEqual(none.sentences.map(item => item.startSeconds), sentences.map(item => item.startSeconds));
});

test('the auto edit is frame-exact, deterministic and explains every decision', () => {
  const {sentences, scenes, assets, narrationSeconds} = fixture();
  const input = {fps: 30, narrationSeconds, sentences, scenes, assets, spec: SPEC};
  const edit = B.autoEdit(input);
  assert.deepEqual(B.autoEdit(input), edit, 'same inputs, same edit');
  assert.equal(edit.totalFrames, Math.round(narrationSeconds * 30));
  assert.equal(edit.clips.reduce((sum, clip) => sum + clip.frames, 0), edit.totalFrames);
  assert.ok(edit.clips.every(clip => clip.reason.length > 10), 'every clip says why it is there');
  // Hook: the first shot stays inside the style's hook limit.
  assert.ok(edit.clips[0].frames <= 2.5 * 30);
  // Scenes start on their first sentence, so picture and narration stay locked.
  for (const scene of edit.scenes.slice(1)) assert.equal(scene.startFrame, Math.round(sentences[scene.sentenceStart - 1].startSeconds * 30));
  // Cuts inside a scene land on a sentence break when one is near (and never make a shot too short).
  const starts = new Set(sentences.map(item => Math.round(item.startSeconds * 30)));
  const snapped = edit.clips.filter(clip => /sentence break/.test(clip.reason));
  assert.ok(snapped.length >= 1);
  assert.ok(snapped.every(clip => starts.has(clip.start)));
  // Neighbouring stills never repeat a camera move; heroes exist; the close pulls out or holds.
  const stills = edit.clips.filter(clip => clip.mediaType === 'image');
  for (let k = 1; k < edit.clips.length; k++) if (edit.clips[k].move && edit.clips[k - 1].move) assert.notEqual(edit.clips[k].move.kind, edit.clips[k - 1].move.kind);
  assert.ok(stills.every(clip => B.MOVES.includes(clip.move.kind) && clip.moveReason));
  assert.ok(edit.clips.some(clip => clip.hero));
  // Joins: hard cuts inside scenes, a crossfade into the turn, never two soft transitions in a row.
  edit.joins.forEach((join, index) => { if (edit.clips[index].sceneId === edit.clips[index + 1].sceneId) assert.equal(join.type, 'cut'); });
  const intoTurn = edit.clips.findIndex(clip => clip.sceneId === 'sc3') - 1;
  assert.equal(edit.joins[intoTurn].type, 'crossfade');
  assert.ok(edit.joins.every((join, index) => !index || join.type === 'cut' || edit.joins[index - 1].type === 'cut'));
  // Video clips: a long clip skips its settling start; a short clip is flagged rather than silently frozen.
  assert.ok(edit.clips.find(clip => clip.shotId === 'b').inSeconds > 0);
  assert.ok(edit.clips.find(clip => clip.shotId === 'e').freezeSeconds > 0);
  // Graphics: plan text accepted, the turn becomes a title card with the owner's accent, numbers and quotes proposed.
  const byTemplate = template => edit.graphics.filter(item => item.template === template);
  assert.equal(byTemplate('scene-text')[0].status, 'accepted');
  assert.equal(byTemplate('scene-text')[0].start, 0, 'hook text is on screen at once');
  assert.deepEqual([byTemplate('title-card')[0].lines[0], byTemplate('title-card')[0].accent, byTemplate('title-card')[0].accentSource], ['The hidden cause', 'cause', 'owner marker']);
  assert.equal(byTemplate('stat')[0].lines[0], '60%');
  assert.equal(byTemplate('stat')[0].status, 'proposed');
  assert.equal(byTemplate('quote')[0].lines[0], 'the air itself had turned to poison');
  assert.ok(edit.graphics.every((item, index) => !index || item.start >= edit.graphics[index - 1].start + edit.graphics[index - 1].frames), 'one graphic at a time');
  assert.ok(edit.markers.some(marker => marker.kind === 're-hook'));
  // "Static" planned for a video shot does not freeze the still that filled it; a long static still gets a gentle push.
  const filled = structuredClone(scenes);
  filled[3].shots[0] = {...filled[3].shots[0], motion: 'static', source: 'stock-video'};
  const moved = B.autoEdit({...input, scenes: filled});
  assert.notEqual(moved.clips.find(clip => clip.shotId === 'g').move.kind, 'static');
  filled[3].shots[0].source = 'stock-image';
  const gentle = B.autoEdit({...input, scenes: filled, spec: {...SPEC, qc: {...SPEC.qc, maxFrozenSeconds: 3}}}).clips.find(clip => clip.shotId === 'g');
  assert.equal(gentle.move.kind, 'push-in');
  assert.match(gentle.moveReason, /reads as frozen/);
  assert.equal(B.autoEdit({...input, scenes: filled}).clips.find(clip => clip.shotId === 'g').move.kind, 'static', 'a short planned static hold stays static');
});

test('the critic names the boring, lazy and amateur choices with a fix', () => {
  const {sentences, scenes, assets, narrationSeconds} = fixture();
  const edit = B.autoEdit({fps: 30, narrationSeconds, sentences, scenes, assets, spec: SPEC});
  const review = B.critique(edit, SPEC);
  const codes = review.findings.map(item => item.code);
  assert.ok(codes.includes('clip-freeze'), 'a clip shorter than its hold is a critical finding');
  assert.equal(review.findings.find(item => item.code === 'clip-freeze').severity, 'critical');
  assert.ok(codes.includes('hook-static'), 'opening on a still when the hook scene has motion');
  assert.deepEqual(review.findings.find(item => item.code === 'hook-static').op, {type: 'reorder', sceneId: 'sc1', clipId: 'cl_b', toIndex: 0});
  assert.ok(review.findings.every(item => item.fix && item.skill !== undefined));
  assert.ok(['strong', 'acceptable', 'revise', 'fail'].includes(review.slideshow.verdict));
  // A slideshow of equal static stills fails outright.
  const flat = structuredClone(edit);
  const per = Math.floor(flat.totalFrames / flat.clips.length);
  flat.clips.forEach((clip, index) => { clip.mediaType = 'image'; clip.assetId = `X${index}`; clip.start = index * per; clip.frames = index === flat.clips.length - 1 ? flat.totalFrames - index * per : per; clip.move = {kind: 'static', amount: 0}; clip.hero = false; delete clip.freezeSeconds; });
  flat.graphics = [];
  const bad = B.critique(flat, {...SPEC, qc: {...SPEC.qc, maxFrozenSeconds: 2}});
  assert.ok(bad.slideshow.score > review.slideshow.score);
  assert.ok(bad.findings.some(item => item.code === 'static-too-long' && item.severity === 'critical'));
  assert.ok(bad.findings.some(item => item.code === 'equal-holds'));
});

test('owner edits are checked before anything changes, and scene repair touches one scene', () => {
  const {sentences, scenes, assets, narrationSeconds} = fixture({videoE: 9});
  const edit = B.autoEdit({fps: 30, narrationSeconds, sentences, scenes, assets, spec: SPEC});
  const before = JSON.stringify(edit);
  const first = edit.clips[0], second = edit.clips[1];
  const held = B.applyOp(edit, {type: 'set-hold', clipId: first.id, seconds: 2}, {spec: SPEC}).timeline;
  assert.equal(held.clips[0].frames, 60);
  assert.equal(held.clips[1].start, 60);
  assert.equal(held.clips[1].frames, first.frames + second.frames - 60);
  assert.equal(JSON.stringify(edit), before, 'the source edit is never mutated');
  assert.throws(() => B.applyOp(edit, {type: 'set-hold', clipId: edit.clips.at(-1).id, seconds: 2}, {spec: SPEC}), /last clip/);
  assert.throws(() => B.applyOp(edit, {type: 'set-hold', clipId: first.id, seconds: 0.1}, {spec: SPEC}), /half a second/);
  assert.throws(() => B.applyOp(edit, {type: 'set-transition', clipId: first.id, transition: 'wipe'}, {spec: SPEC}), /Choose a transition/);
  assert.throws(() => B.applyOp(edit, {type: 'set-transition', clipId: first.id, transition: 'dip-to-black'}, {spec: {...SPEC, transitions: {...SPEC.transitions, allowed: ['cut', 'crossfade']}}}), /does not allow/);
  const faded = B.applyOp(edit, {type: 'set-transition', clipId: first.id, transition: 'crossfade', seconds: 0.5}, {spec: SPEC}).timeline;
  assert.deepEqual([faded.joins[0].type, faded.joins[0].frames], ['crossfade', 15]);
  assert.throws(() => B.applyOp(edit, {type: 'set-move', clipId: 'cl_b', kind: 'pan-left'}, {spec: SPEC}), /stills/);
  assert.equal(B.applyOp(edit, {type: 'set-move', clipId: first.id, kind: 'static'}, {spec: SPEC}).timeline.clips[0].move.kind, 'static');
  assert.throws(() => B.applyOp(edit, {type: 'set-in', clipId: 'cl_b', seconds: 9.9}, {spec: SPEC}), /in-point/);
  const stat = edit.graphics.find(item => item.template === 'stat');
  const accepted = B.applyOp(edit, {type: 'set-graphic', graphicId: stat.id, status: 'accepted', lines: ['60%', 'of Messina'], seconds: 3}, {spec: SPEC}).timeline;
  assert.deepEqual(accepted.graphics.find(item => item.id === stat.id).lines, ['60%', 'of Messina']);
  const reordered = B.applyOp(edit, {type: 'reorder', sceneId: 'sc1', clipId: 'cl_b', toIndex: 0}, {spec: SPEC}).timeline;
  assert.deepEqual(reordered.clips.slice(0, 2).map(clip => [clip.id, clip.start, clip.frames]), [['cl_b', 0, first.frames], ['cl_a', first.frames, second.frames]], 'the pictures move, the cuts stay on the sentence breaks');
  assert.throws(() => B.applyOp(edit, {type: 'reorder', sceneId: 'sc2', clipId: 'cl_b', toIndex: 0}, {spec: SPEC}), /own scene/);
  assert.throws(() => B.applyOp(edit, {type: 'teleport'}, {spec: SPEC}), /Choose one of/);
  // Single-scene repair: a new take of S02 changes only S02's clips.
  const fresh = B.autoEdit({fps: 30, narrationSeconds, sentences, scenes, assets, spec: SPEC, variants: {sc2: 1}});
  const repaired = B.spliceScene(accepted, fresh, 'sc2');
  assert.notDeepEqual(repaired.clips.filter(clip => clip.sceneId === 'sc2'), accepted.clips.filter(clip => clip.sceneId === 'sc2'));
  assert.deepEqual(repaired.clips.filter(clip => clip.sceneId !== 'sc2'), accepted.clips.filter(clip => clip.sceneId !== 'sc2'));
  assert.deepEqual(repaired.graphics, accepted.graphics, "the owner's graphics decisions survive the repair");
  assert.equal(repaired.scenes.find(scene => scene.id === 'sc2').variant, 1);
});

test('graphics become one ASS layer: eased entrances, the title-card accent, accepted graphics only', () => {
  const {sentences, scenes, assets, narrationSeconds} = fixture();
  const edit = B.autoEdit({fps: 30, narrationSeconds, sentences, scenes, assets, spec: SPEC});
  const ass = B.graphicsAss(edit, SPEC);
  assert.match(ass, /PlayResX: 1920/);
  assert.match(ass, /The hidden \{\\c&H27A2C9&\}cause\{\\c&HE6EEF2&\}/, 'one accent word in the style accent colour');
  assert.equal((ass.match(/,Card,/g) || []).length, 7, 'title card: five eased entrance steps, a hold and a fade');
  const graphicLines = ass.split('\n').filter(line => line.startsWith('Dialogue:') && !line.includes(',Caption,'));
  assert.doesNotMatch(graphicLines.join('\n'), /60%/, 'proposed graphics are not drawn until accepted');
  assert.match(ass, /Dialogue: 5,[^\n]*,Caption,[^\n]*\{\\c&H27A2C9&\}60%/, 'the caption rail carries the narration and lifts the figure in the accent colour');
  const none = structuredClone(edit);
  none.graphics.forEach(item => { item.status = 'rejected'; });
  assert.ok(B.graphicsAss(none, SPEC).split('\n').filter(line => line.startsWith('Dialogue:')).every(line => line.includes(',Caption,')), 'with every graphic rejected only captions remain');
  none.captions.enabled = false;
  assert.equal(B.graphicsAss(none, SPEC), null);
  // Render plan: runs of hard cuts become chunks; the crossfade offset keeps the narration length.
  const files = Object.fromEntries(edit.clips.map(clip => [clip.id, `${clip.id}.src`]));
  const plan = R.planTimeline({timeline: edit, files, narration: {file: 'n.wav', durationSeconds: narrationSeconds}, format: 'long-form', workDir: '/w', outFile: '/w/o.mp4', graphics: true});
  assert.equal(plan.chunks.length, 2);
  assert.equal(plan.chunks.reduce((sum, chunk) => sum + chunk.frames, 0) - plan.transition.frames, plan.totalFrames);
  assert.match(plan.final.args.join(' '), /ass=graphics\.ass,fade=t=out/);
  assert.match(plan.segments[0].args.join(' '), /zoompan=z='1\+[\d.]+\*\(\(on\/\d+\)\*\(on\/\d+\)\*\(3-2\*\(on\/\d+\)\)\)'/, 'eased push-in');
  // Every segment is converted to one colour profile, so joined chunks never change format mid-stream.
  for (const segment of plan.segments) {
    assert.match(segment.args.join(' '), /out_range=tv:out_color_matrix=bt709/);
    assert.match(segment.args.join(' '), /setparams=range=tv:colorspace=bt709/);
    assert.match(segment.args.join(' '), /-color_range tv -colorspace bt709/);
  }
});

// ---------------------------------------------------------------- the room, end to end with real FFmpeg

const hook = 'Every coin in your pocket began as a quiet promise.';
const script = [
  `${hook} In 1347 two villages traded salt for grain. Nobody carried coins. They carved small marks on clay tokens to remember who owed what.`,
  'Each token was a promise you could hold. By the end of that winter, 60% of all trades used tokens. A temple scribe wrote that "a mark kept is a debt repaid" in his ledger.',
  'Over time the tokens became smaller and easier to carry. People trusted the mark more than the clay itself. That trust is still inside every coin you spend today, and it started with a simple promise.',
].join('\n\n');

function setup(t, {seconds = 36} = {}) {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'editing-room-'));
  const store = new Store(':memory:', {artifactRoot: dataRoot});
  t.after(() => { store.close(); fs.rmSync(dataRoot, {recursive: true, force: true}); });
  const skills = new SkillsEngine(store, {root: path.join(__dirname, '..')}).attach();
  const styles = new StyleLibrary(store), quota = new QuotaLedger(store);
  const family = store.saveFamily({name: 'Money Stories', tier: 'A', countries: ['United States'], audience: 'Curious adults who like money history told as stories.', niche: 'Origins of money', locales: ['en-US'], timezone: 'Asia/Karachi', monthlyBudget: 50, cadence: 2, format: 'shorts', monthlyTokenLimit: 200000, scriptTokenLimit: 4000, researchTokenLimit: 4000});
  let content = store.saveContent({familyId: family.id, title: 'The first promise', kind: 'fiction', angle: 'Invented villages show how trust became money.', hook, script, sources: [], rightsConfirmed: true});
  store.reviewContent(content.id, {revision: content.revision, action: 'submit'});
  content = store.reviewContent(content.id, {revision: content.revision, action: 'approve'});
  const montage = styles.profiles().find(item => item.key === 'documentary-montage').revisions.at(-1);
  styles.approveRevision(montage.id, {approvedBy: 'Owner', notes: 'Fixture.', confirmations: {specReviewed: true, rightsReviewed: true, originalityReviewed: true}});
  styles.assign(family.id, {familyRevision: store.family(family.id).revision, assignedBy: 'Owner', reason: 'Stock and AI visuals suit this family.', revisionId: montage.id, expectedAssignmentId: null});
  store.db.prepare('INSERT INTO connectors(id,name_key,payload,secret) VALUES(?,?,?,?)').run('openai-1', 'openai-1', JSON.stringify({name: 'openai-1', provider: 'openai', revision: 1, test: {status: 'passed', at: new Date().toISOString()}}), Buffer.from('x'));
  const profile = store.saveVoiceProfile(family.id, {revision: 0, familyRevision: store.family(family.id).revision, name: 'Narrator', connectorId: 'openai-1', connectorRevision: 1, provider: 'openai', model: 'gpt-4o-mini-tts', voiceId: 'alloy', voiceVersion: 'current', ownershipBasis: 'provider_stock_voice', rightsHolder: 'Provider catalog', consentConfirmed: true, commercialUseConfirmed: true, evidenceReference: 'Terms reviewed by the owner.', termsReviewedAt: '2026-09-19', pace: 1, energy: 55, emotion: 'warm', pauseScale: 1, emphasis: 50, instructions: 'Warm delivery.', lexicon: [], monthlyCharacterLimit: 1000000, maxCharactersPerAudition: 20000, priceCentsPerMillionCharacters: 1500});
  const job = store.queueVoiceAudition(content.id, {contentRevision: content.revision, profileId: profile.id, profileRevision: profile.revision, connectorId: 'openai-1', connectorRevision: 1});
  const claimed = store.claimVoiceAudition();
  // Narration with real pauses 0.35 s after each word-share estimate, like a speaker taking a breath.
  const estimated = timeSentences(splitSentences(content.script), seconds);
  const silences = estimated.slice(1).map(item => `between(t,${(item.startSeconds + 0.05).toFixed(2)},${(item.startSeconds + 0.4).toFixed(2)})`).join('+');
  const relativePath = `voice-artifacts/${job.id}.wav`, wav = path.join(dataRoot, relativePath);
  fs.mkdirSync(path.dirname(wav), {recursive: true});
  ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=44100', '-t', String(seconds), '-af', `volume=enable='${silences}':volume=0`, '-c:a', 'pcm_s16le', '-y', wav]);
  const bytes = fs.readFileSync(wav);
  const audition = store.completeVoiceAudition(job.id, {artifact: {relativePath, sha256: sha(bytes), sizeBytes: bytes.length, mime: 'audio/wav'}, analysis: {passed: true, durationSeconds: seconds, silenceRatio: 0, checks: []}, provider: {requestIds: [], model: 'gpt-4o-mini-tts', voiceId: 'alloy', voiceVersion: 'current'}, settledCharacters: claimed.scope.characterCount});
  store.selectVoiceAudition(audition.id, {approvedBy: 'Owner', comparisonNotes: 'Compared the complete narration for pacing and clarity.', intelligibilityConfirmed: true});
  const scenes = new SceneRoom(store, null, quota, styles, {dataRoot});
  const renders = new RenderRoom(store, styles, scenes, {dataRoot, ffmpeg: 'ffmpeg', ffprobe: 'ffprobe'});
  const editing = new EditingRoom(store, styles, scenes, renders, {ffmpeg: 'ffmpeg'});
  return {dataRoot, store, skills, styles, scenes, renders, editing, family, content, estimated};
}
async function approvedBoard({dataRoot, store, scenes, content, twoShotClip = false}) {
  let {manifest} = scenes.createPlan(content.id, {mode: 'rules', requestedBy: 'Owner', contentRevision: content.revision});
  const third = manifest.plan.scenes[2];
  manifest = scenes.editManifest(manifest.id, {op: 'update-scene', sceneId: third.id, purpose: 'turn', onScreenText: 'The *mark* mattered', createdBy: 'Owner', expectedRevision: manifest.revision});
  scenes.reviewManifest(manifest.id, {decision: 'approve', reviewer: 'Owner', confirmations: {coverageReviewed: true, directionReviewed: true}});
  const media = path.join(dataRoot, 'fixture-media');
  fs.mkdirSync(media, {recursive: true});
  ffmpeg(['-f', 'lavfi', '-i', 'testsrc=size=1080x1920', '-frames:v', '1', '-y', path.join(media, 'still.jpg')]);
  ffmpeg(['-f', 'lavfi', '-i', 'smptebars=size=1080x1920', '-frames:v', '1', '-y', path.join(media, 'still2.jpg')]);
  if (twoShotClip) ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30:duration=4', '-f', 'lavfi', '-i', 'mandelbrot=size=1080x1920:rate=30', '-filter_complex', '[1:v]trim=duration=8,setpts=PTS-STARTPTS,format=yuv420p[b];[0:v]format=yuv420p[a];[a][b]concat=n=2:v=1:a=0', '-c:v', 'mpeg4', '-q:v', '10', '-y', path.join(media, 'clip.mp4')]);
  else ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30', '-t', '12', '-c:v', 'mpeg4', '-q:v', '10', '-y', path.join(media, 'clip.mp4')]);
  const shots = manifest.plan.scenes.flatMap(scene => scene.shots);
  for (const [index, shot] of shots.entries()) {
    const kind = index % 3 === 1 ? 'clip' : 'still', name = kind === 'clip' ? 'clip.mp4' : index % 2 ? 'still2.jpg' : 'still.jpg', id = randomUUID();
    const relative = `visual-assets/${content.familyId}/${content.id}/${id}${path.extname(name)}`, file = path.join(dataRoot, relative);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.copyFileSync(path.join(media, name), file);
    const bytes = fs.readFileSync(file), probe = await VS.probeMedia(file), still = kind === 'still';
    store.db.prepare('INSERT INTO visual_assets(id,family_id,content_id,shot_id,origin,capability,source_job_id,candidate_id,media_type,relative_path,thumb_path,sha256,size_bytes,mime,probe,rights,created_by,created_at) VALUES(?,?,?,?,?,?,?,NULL,?,?,NULL,?,?,?,?,?,?,?)')
      .run(id, content.familyId, content.id, shot.id, 'stock', JSON.stringify(VS.capability(still ? 'pexels-photo' : 'pexels-video')), 'fixture', still ? 'image' : 'video', relative, sha(bytes), bytes.length, still ? 'image/jpeg' : 'video/mp4', JSON.stringify(probe), JSON.stringify({basis: 'stock-license', license: VS.CAPABILITIES['pexels-photo'].rights, synthetic: false, disclosure: 'none'}), 'Owner', new Date().toISOString());
    scenes.select({manifestId: manifest.id, shotId: shot.id, assetId: id, selectedBy: 'Owner'});
  }
  return {manifest, approval: await scenes.approveVisuals(manifest.id, {approvedBy: 'Owner', confirmations: {rightsReviewed: true, sequenceReviewed: true, warningsAccepted: true}})};
}

test('the Editing Room drafts, revises, repairs and renders an edit with a human verdict', {skip}, async t => {
  const env = setup(t);
  const {editing, renders, scenes, store, skills, content, family, dataRoot} = env;
  await assert.rejects(editing.generate(content.id, {requestedBy: 'Owner', visualApprovalId: 'none'}), /Approve the visuals|Create and approve a scene plan/);
  const {approval} = await approvedBoard(env);
  await assert.rejects(editing.generate(content.id, {requestedBy: 'Owner', visualApprovalId: 'stale'}), /visual approval changed/);
  // An approved editing skill is recorded with the edit it informed.
  const skill = skills.skills().find(item => item.id === 'editing.transition-grammar');
  skills.approveRevision(skill.latest.id, {approvedBy: 'Owner', notes: 'Reviewed.', confirmations: {wordingReviewed: true, numbersReviewed: true, scopeReviewed: true}});

  const r1 = await editing.generate(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id});
  assert.equal(r1.revision, 1);
  assert.equal(r1.actor, 'brain');
  assert.equal(r1.timing.method, 'pause-aligned', 'cuts follow the measured pauses');
  assert.ok(r1.timing.matched >= 3);
  assert.equal(r1.timeline.clips.reduce((sum, clip) => sum + clip.frames, 0), r1.timeline.totalFrames);
  assert.ok(r1.skills.some(item => item.id === 'editing.transition-grammar'));
  assert.ok(r1.timeline.joins.some(join => join.skill === 'editing.transition-grammar' && join.skillApproved === true));
  assert.equal(skills.usage().find(item => item.jobId === r1.id).taskKey, 'editing.plan');
  const title = r1.timeline.graphics.find(item => item.template === 'title-card');
  assert.deepEqual([title.lines[0], title.accent], ['The mark mattered', 'mark']);
  const stat = r1.timeline.graphics.find(item => item.template === 'stat');
  assert.equal(stat.lines[0], '60%');
  assert.throws(() => store.db.prepare('UPDATE edit_revisions SET note=? WHERE id=?').run('x', r1.id), /immutable/);
  // Captions (P07): every narrated word once, on the measured pauses, with an SRT sidecar for YouTube.
  assert.equal(r1.timeline.captions.enabled, true);
  assert.deepEqual(Cap.lintCaptions(r1.timeline.captions, {sentences: editing.inputs(store.content(content.id)).payload.sentences}).filter(item => item.severity === 'critical'), []);
  assert.ok(r1.timeline.captions.groups.every(group => group.words.length <= 4), 'a Shorts family gets short captions');
  const srt = editing.captionsSrt(r1.id);
  assert.match(srt.text, /^1\n00:00:0\d,\d{3} --> /);
  assert.match(srt.filename, /^The-first-promise-r1\.srt$/);
  // YouTube craft: sentence cues follow the measured pauses; chapters and Shorts spans only exist for long-form.
  const room = editing.state().contents.find(item => item.contentId === content.id);
  assert.deepEqual(room.craft, {chapters: null, shorts: null}, 'a Shorts family gets no chapters or Shorts-inside-Shorts');
  const cues = editing.cues(editing.inputs(store.content(content.id)));
  assert.equal(cues[0].start, 0);
  assert.ok(cues.slice(1).some(cue => cue.gap > 0.3), 'measured pauses become chapter-boundary evidence');
  const csv = ['Video position (%),Absolute audience retention (%)', ...Array.from({length: 11}, (_, i) => `${i * 10},${100 - i * 2 - (i >= 6 ? 15 : 0)}`)].join('\n');
  const retention = editing.retention(content.id, {csv});
  const cliff = retention.cliffs[0];
  assert.equal(cliff.from, 50);
  assert.equal(cliff.atSeconds, 18, 'percent positions map onto the 36 s narration');
  assert.ok(cliff.said && cues.some(cue => cue.start <= 22 && cue.end >= 14 && cliff.said.includes(cue.text.slice(0, 20))), 'each cliff names what the narration said there');
  assert.throws(() => editing.retention(content.id, {csv: 'position,retention\n1,2\n3,4'}), /at least 8 data points/);

  // Owner edits with conflict protection; undo restores the earlier edit exactly.
  const still = r1.timeline.clips.find(clip => clip.mediaType === 'image');
  const r2 = editing.applyOps(r1.id, {editedBy: 'Owner', ops: [{type: 'set-graphic', graphicId: stat.id, status: 'accepted'}, {type: 'set-move', clipId: still.id, kind: still.move.kind === 'pull-out' ? 'push-in' : 'pull-out'}]});
  assert.equal(r2.revision, 2);
  assert.equal(r2.timeline.graphics.find(item => item.id === stat.id).status, 'accepted');
  assert.throws(() => editing.applyOps(r1.id, {editedBy: 'Owner', ops: [{type: 'set-hero', clipId: still.id, hero: true}]}), /This edit changed \(now r2\)/);
  assert.throws(() => editing.applyOps(r2.id, {editedBy: 'Owner', ops: [{type: 'set-move', clipId: 'nope', kind: 'static'}]}), /not in this edit/);
  assert.equal(editing.state().contents.find(item => item.contentId === content.id).edit.revision, 2, 'a refused edit creates no revision');
  const r3 = editing.undo(r2.id, {editedBy: 'Owner'});
  assert.equal(r3.payloadHash, r1.payloadHash);
  // Single-scene repair.
  const sceneId = r3.timeline.scenes[1].id;
  const r4 = editing.applyOps(r3.id, {editedBy: 'Owner', ops: [{type: 'regenerate-scene', sceneId}]});
  assert.equal(r4.timeline.scenes[1].variant, 1);
  assert.deepEqual(r4.timeline.clips.filter(clip => clip.sceneId !== sceneId), r3.timeline.clips.filter(clip => clip.sceneId !== sceneId));
  let r5 = editing.applyOps(r4.id, {editedBy: 'Owner', ops: [{type: 'set-graphic', graphicId: stat.id, status: 'accepted'}]});
  // Apply the critic's hook fix so the edit opens on a moving clip: a chunk that mixes clip and still
  // segments must still join without losing frames (regression: mixed colour ranges once dropped a chunk).
  const mixed = r5.timeline.scenes.map(scene => r5.timeline.clips.filter(clip => clip.sceneId === scene.id)).find(clips => clips.findIndex(clip => clip.mediaType === 'video') > 0);
  assert.ok(mixed, 'the fixture has a scene where a clip follows a still');
  const moving = mixed.find(clip => clip.mediaType === 'video');
  r5 = editing.applyOps(r5.id, {editedBy: 'Owner', ops: [{type: 'reorder', sceneId: moving.sceneId, clipId: moving.id, toIndex: 0}]});
  assert.equal(r5.timeline.clips.find(clip => clip.sceneId === moving.sceneId).id, moving.id);
  assert.equal(r5.timeline.audio, undefined, 'existing edits keep their original audio behavior until an owner chooses settings');
  assert.throws(() => editing.applyOps(r5.id, {editedBy: 'Owner', ops: [{type: 'set-audio', settings: {truePeakDb: 1}}]}), /truePeakDb/);
  const beforeAudio = r5;
  r5 = editing.applyOps(r5.id, {editedBy: 'Owner', ops: [{type: 'set-audio', settings: {mode: 'normalize', targetLufs: -16, truePeakDb: -2}}]});
  assert.equal(r5.revision, beforeAudio.revision + 1);
  assert.deepEqual(r5.timeline.captions, beforeAudio.timeline.captions);
  assert.deepEqual(r5.timeline.clips, beforeAudio.timeline.clips);
  assert.throws(() => editing.applyOps(beforeAudio.id, {editedBy: 'Owner', ops: [{type: 'set-audio', settings: {mode: 'source'}}]}), /changed/);

  // Rendering the edit needs the pinned build; the render follows the edit's own decisions.
  await assert.rejects(Promise.resolve().then(() => renders.queueRender(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id, editRevisionId: r5.id})), /readiness check/);
  const report = await renders.checkReadiness({requestedBy: 'Owner'});
  assert.equal(report.passed, true, JSON.stringify(report.issues));
  assert.equal(report.filters.ass, true);
  renders.pin({readinessId: report.id, pinnedBy: 'Owner', reason: 'Reviewed build for the edit render.'});
  assert.throws(() => renders.queueRender(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id, editRevisionId: r4.id}), /newer revision/);
  const queued = renders.queueRender(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id, editRevisionId: r5.id});
  assert.equal(queued.scope.edit.revision, r5.revision);
  const done = await renders.processNext();
  assert.equal(done?.status, 'completed', JSON.stringify(renders.publicJob(renders.row(queued.id)).error));
  const result = JSON.parse(renders.row(queued.id).result);
  assert.deepEqual([result.video.probe.width, result.video.probe.height], [360, 640]);
  assert.equal(result.qc.find(item => item.name === 'duration').passed, true, JSON.stringify(result.qc));
  assert.equal(result.video.probe.frames ?? Math.round(result.video.probe.durationSeconds * 30), Math.round(36 * 30), 'every frame of the narration is in the render');
  assert.equal(result.qc.find(item => item.name === 'black frames').passed, true, 'the title card and the fade-out are planned, not defects');
  assert.equal(result.qc.find(item => item.name === 'unplanned cuts').passed, true, JSON.stringify(result.qc));
  const manifest = JSON.parse(fs.readFileSync(path.join(dataRoot, result.manifest.relativePath), 'utf8'));
  assert.equal(manifest.inputs.edit.revisionId, r5.id);
  const burned = JSON.parse(renders.row(queued.id).scope).edit.graphicsAss;
  assert.match(burned, /,Caption,/, 'the render burned the caption rail in');
  assert.equal(manifest.inputs.edit.graphicsSha256, createHash('sha256').update(burned).digest('hex'), 'the manifest records the exact subtitle layer, captions included');
  assert.match(manifest.inputs.edit.graphicsSha256, /^[a-f0-9]{64}$/);
  assert.ok(manifest.commands.some(command => command.step.startsWith('join chunk-')));
  assert.equal(result.audioQc.passed, true, JSON.stringify(result.audioQc));
  assert.equal(manifest.audio.settings.targetLufs, -16);
  assert.equal(manifest.audio.artifact.sha256, result.audio.sha256);
  assert.ok(manifest.commands.some(command => command.step === 'verify encoded audio'));
  assert.equal(renders.file(queued.id, 'audio').mime, 'audio/wav');
  assert.ok(manifest.commands.every(command => !command.args.join(' ').includes(dataRoot)), 'command plans do not leak local paths');
  // Same edit, same build: byte-identical render.
  const again = renders.queueRender(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id, editRevisionId: r5.id});
  await renders.processNext();
  assert.equal(JSON.parse(renders.row(again.id).result).video.sha256, result.video.sha256);
  // The verdict on the rendered edit is its approval; critical findings must be accepted explicitly.
  const criticals = queued.scope.edit.criticals;
  const confirmations = {watchedFully: true, styleMatches: true, syncReviewed: true, qcAccepted: true, audioReviewed: true};
  assert.throws(() => renders.review(queued.id, {decision: 'pass', reviewer: 'Owner', confirmations: {...confirmations, audioReviewed: false}}), /listened/);
  if (criticals) assert.throws(() => renders.review(queued.id, {decision: 'pass', reviewer: 'Owner', confirmations}), /critical finding/);
  const renderedFile = renders.file(queued.id, 'video').file, original = fs.readFileSync(renderedFile), changed = Buffer.from(original);
  changed[changed.length - 1] ^= 1;
  fs.writeFileSync(renderedFile, changed);
  assert.throws(() => renders.file(queued.id, 'video'), /missing or changed/);
  assert.throws(() => renders.review(queued.id, {decision: 'pass', reviewer: 'Owner', confirmations: {...confirmations, critiqueAccepted: true}}), /missing or changed/);
  fs.writeFileSync(renderedFile, original);
  const passed = renders.review(queued.id, {decision: 'pass', reviewer: 'Owner', confirmations: {...confirmations, critiqueAccepted: true}});
  assert.equal(passed.review.decision, 'passed');
  assert.equal(passed.current, true);
  // A newer edit makes the rendered one out of date.
  const waiting = renders.queueRender(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id, editRevisionId: r5.id});
  editing.applyOps(r5.id, {editedBy: 'Owner', ops: [{type: 'set-hero', clipId: still.id, hero: true}]});
  assert.equal(await renders.processNext(), null);
  assert.equal(renders.row(waiting.id).status, 'stale', 'a superseded queued edit does not consume rendering time');
  assert.equal(renders.publicJob(renders.row(again.id)).current, false);
  // A changed visual board makes the edit itself out of date: no more edits, no render.
  const latest = editing.state().contents.find(item => item.contentId === content.id).edit;
  const scope = JSON.parse(renders.row(queued.id).scope);
  scenes.select({manifestId: approval.manifestId, shotId: scope.shots[1].shotId, assetId: scope.shots[0].assetId, selectedBy: 'Owner'});
  assert.equal(editing.state().contents.find(item => item.contentId === content.id).current, false);
  assert.throws(() => editing.applyOps(latest.id, {editedBy: 'Owner', ops: [{type: 'set-hero', clipId: still.id, hero: false}]}), /Approve the visuals|changed after this edit/);
  assert.equal(family.id, store.family(family.id).id);
});

// A stock clip that hides its own cut (claude-video scene detection): measured once, avoided by the brain,
// flagged by the critic when the owner forces the window across it, and caught in the render itself.
test('hidden cuts inside stock clips are measured, avoided, flagged and caught in the render', {skip}, async t => {
  const env = setup(t);
  const {editing, renders, store, content} = env;
  const {approval} = await approvedBoard({...env, twoShotClip: true});
  const report = await renders.checkReadiness({requestedBy: 'Owner'});
  assert.equal(report.passed, true, JSON.stringify(report.issues));
  renders.pin({readinessId: report.id, pinnedBy: 'Owner', reason: 'Reviewed build for the hidden-cut check.'});
  const r1 = await editing.generate(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id});
  const videos = r1.timeline.clips.filter(clip => clip.mediaType === 'video');
  assert.ok(videos.length >= 1);
  for (const clip of videos) {
    assert.deepEqual(clip.sourceCuts, [4], 'the 4 s cut inside the stock clip was measured');
    const span = clip.frames / r1.timeline.fps * clip.speed;
    assert.ok(clip.inSeconds >= 4 || clip.inSeconds + span <= 4, `${clip.label} plays ${clip.inSeconds}-${clip.inSeconds + span} s, across the hidden cut`);
  }
  assert.ok(videos.some(clip => /changes shot at 4\.00 s/.test(clip.trimReason)), 'the decision says why the in-point moved');
  assert.equal(r1.findings.some(item => item.code === 'hidden-cut'), false);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM media_analyses').get().n, 1, 'one file, measured once');
  // The owner forces a window across the cut: the critic names it and offers the clean in-point.
  const target = videos[0], hold = target.frames / r1.timeline.fps;
  const r2 = editing.applyOps(r1.id, {editedBy: 'Owner', ops: [{type: 'set-in', clipId: target.id, seconds: Math.max(0, Math.round((4 - hold / 2) * 100) / 100)}]});
  const flagged = r2.findings.find(item => item.code === 'hidden-cut' && item.clipId === target.id);
  assert.ok(flagged, 'the critic flags the hidden cut');
  assert.equal(flagged.op.type, 'set-in');
  assert.ok(flagged.op.seconds >= 4);
  // The render of the forced edit measures the cut where the edit planned none.
  renders.queueRender(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id, editRevisionId: r2.id});
  const done = await renders.processNext();
  assert.equal(done?.status, 'completed');
  const qc = JSON.parse(renders.row(done.id).result).qc.find(item => item.name === 'unplanned cuts');
  assert.equal(qc.passed, false, 'the render check catches the hidden cut');
  assert.match(qc.detail, new RegExp(target.label));
  // Applying the critic's fix gives a clean render again.
  const r3 = editing.applyOps(r2.id, {editedBy: 'Owner', ops: [flagged.op]});
  assert.equal(r3.findings.some(item => item.code === 'hidden-cut'), false);
  renders.queueRender(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id, editRevisionId: r3.id});
  const clean = await renders.processNext();
  assert.equal(JSON.parse(renders.row(clean.id).result).qc.find(item => item.name === 'unplanned cuts').passed, true);
});

test('repeated owner corrections in two edits of a family raise one lesson, never a silent change', {skip}, async t => {
  const env = setup(t, {seconds: 30});
  const {editing, skills, content} = env;
  const {approval} = await approvedBoard(env);
  const r1 = await editing.generate(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id});
  const soft = r1.timeline.joins.findIndex(join => join.type !== 'cut');
  const clipId = r1.timeline.clips[Math.max(0, soft)].id;
  editing.applyOps(r1.id, {editedBy: 'Owner', ops: [{type: 'set-transition', clipId, transition: 'cut'}]});
  assert.equal(skills.lessons().length, 0, 'one correction is not a pattern');
  // A second edit of the same family (another approved scope) with the same correction.
  const other = editing.timelineRow(r1.timelineId);
  const twinId = randomUUID();
  editing.db.prepare('INSERT INTO edit_timelines(id,family_id,content_id,visual_approval_id,scope,scope_hash,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)').run(twinId, other.family_id, other.content_id, other.visual_approval_id, other.scope, 'twin-scope', 'Owner', new Date().toISOString());
  editing.db.prepare("INSERT INTO edit_revisions(id,timeline_id,revision,parent_id,actor,payload,payload_hash,critique,ops,receipt,note,created_by,created_at) VALUES(?,?,1,NULL,'owner','{}','x','{}',?,'{}','twin','Owner',?)").run(randomUUID(), twinId, JSON.stringify([{type: 'set-transition', clipId, transition: 'cut'}]), new Date().toISOString());
  const latest = editing.state().contents.find(item => item.contentId === content.id).edit;
  editing.applyOps(latest.id, {editedBy: 'Owner', ops: [{type: 'set-transition', clipId, transition: 'cut'}]});
  const lessons = skills.lessons();
  assert.equal(lessons.length, 1);
  assert.equal(lessons[0].skillId, 'editing.transition-grammar');
  assert.equal(lessons[0].status, 'proposed');
  assert.match(lessons[0].finding, /2 different edits/);
  assert.equal(skills.state().counts.approved, 0, 'a lesson never changes a skill by itself');
});

test('HTTP edit routes need the local token and expose the room in state', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'editing-http-'));
  const {server} = createApp({dataFile: path.join(dir, 'workspace.sqlite'), worker: false, protector: {transform: (op, input) => Buffer.from([...input].reverse())}, voiceOptions: {ffmpeg: 'missing-ffmpeg-for-test', ffprobe: 'missing-ffprobe-for-test'}});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(() => { fs.rmSync(dir, {recursive: true, force: true}); resolve(); }); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const state = await (await fetch(`${base}/api/state`)).json();
  assert.equal(state.editing.brain, 'ytprod.edit/1');
  assert.deepEqual(state.editing.contents, []);
  assert.equal((await fetch(`${base}/editing-room.js`)).status, 200);
  const send = (url, body, token = state.token) => fetch(base + url, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Local-Token': token}, body: JSON.stringify(body)});
  const id = '00000000-0000-0000-0000-000000000000';
  assert.equal((await send(`/api/content/${id}/edits`, {requestedBy: 'Owner'}, 'bad')).status, 403);
  assert.equal((await send(`/api/content/${id}/edits`, {requestedBy: 'Owner', visualApprovalId: 'x'})).status, 404);
  assert.equal((await send(`/api/edit-revisions/${id}/ops`, {editedBy: 'Owner', ops: [{type: 'set-hero'}]})).status, 404);
  assert.equal((await send(`/api/edit-revisions/${id}/undo`, {editedBy: 'Owner'})).status, 404);
});

// ---------------------------------------------------------------- P06b animated (canvas) graphics

const {MotionRenderer, inspectBrowser, findBrowser} = require('../motion');
const noBrowser = findBrowser() ? false : 'No Chromium browser (Edge or Chrome) on this machine';
const FILLER = 'This is a calm filler line about the distant past and its people.';
function proposalsFor(texts, spec = SPEC) {
  const all = [...texts, FILLER, FILLER, FILLER, FILLER, FILLER];
  let t = 0;
  const sentences = all.map((text, index) => { const words = text.split(' ').length; const item = {n: index + 1, text, words, startSeconds: t, durationSeconds: Math.max(2.5, words * 0.45)}; t += item.durationSeconds; return item; });
  const shot = id => ({id, label: id.toUpperCase(), motion: 'ken-burns', source: 'stock-image'});
  const scenes = [{id: 's1', label: 'S01', purpose: 'explain', onScreenText: '', sentenceStart: 1, sentenceEnd: texts.length, shots: [shot('a'), shot('b')]}, {id: 's2', label: 'S02', purpose: 'close', onScreenText: '', sentenceStart: texts.length + 1, sentenceEnd: all.length, shots: [shot('c'), shot('d'), shot('e')]}];
  const assets = Object.fromEntries('abcde'.split('').map(id => [id, {assetId: id, mediaType: 'image'}]));
  return B.autoEdit({fps: 30, narrationSeconds: t, sentences, scenes, assets, spec});
}

test('animated graphics come only from the script, validate line by line and follow the style finish', () => {
  // Data parsing: labels, values, one unit per chart, years before Christ, two-sided comparisons.
  assert.deepEqual(B.canvasData('bar-chart', 'Trades', ['Salt = 18%', 'Grain = 34%', 'Tokens = 60%']).items.map(item => [item.label, item.value, item.suffix]), [['Salt', 18, '%'], ['Grain', 34, '%'], ['Tokens', 60, '%']]);
  assert.deepEqual(B.canvasData('bar-chart', '', ['A = $1,200.50', 'B = $3', 'C = $40']).items[0], {label: 'A', value: 1200.5, prefix: '$', suffix: '', decimals: 2});
  assert.throws(() => B.canvasData('bar-chart', '', ['Salt = 18%', 'Grain = 34 people', 'Tokens = 60%']), /same unit/);
  assert.throws(() => B.canvasData('bar-chart', '', ['Salt 18%', 'a = 1', 'b = 2']), /label = value/);
  assert.throws(() => B.canvasData('timeline', '', ['1347 = a', '1351 = b']), /3-7 lines/);
  assert.deepEqual(B.canvasData('timeline', '', ['3200 BC = Tokens', '600 BC = Coins', '1024 = Paper']).items.map(item => [item.year, item.display]), [[-3200, '3200 BC'], [-600, '600 BC'], [1024, '1024']]);
  assert.deepEqual(B.canvasData('comparison', '', ['Clay token: kept by a temple', 'Coin']).items, [{label: 'Clay token', detail: 'kept by a temple'}, {label: 'Coin', detail: ''}]);
  // Proposals, one detector at a time.
  const lines = (texts, template) => proposalsFor(texts).graphics.find(item => item.template === template)?.lines;
  assert.deepEqual(lines(['Salt made up 18% of trades, grain 34% and tokens 60%.'], 'bar-chart'), ['Salt = 18%', 'grain = 34%', 'tokens = 60%']);
  assert.deepEqual(lines(['By 1900 cash was 80% of payments, by 1970 it was 60% and by 2020 just 20%.'], 'line-chart'), ['1900 = 80%', '1970 = 60%', '2020 = 20%']);
  assert.deepEqual(lines(['In 3200 BC clay tokens recorded debts.', 'By 600 BC stamped coins appeared in Lydia.', 'In 1024 China printed the first paper money.'], 'timeline').map(line => line.split(' = ')[0]), ['3200 BC', '600 BC', '1024']);
  assert.deepEqual(lines(['There are three reasons it worked: trust, records and portability.'], 'list'), ['trust', 'records', 'portability']);
  assert.equal(lines(['First, anyone could check the mark.', 'Second, temples kept the records safe.', 'Third, a token could travel between villages.'], 'list').length, 3);
  assert.deepEqual(lines(['Clay tokens versus metal coins tell the story.'], 'comparison'), ['Clay tokens', 'metal coins']);
  assert.deepEqual(lines(['A debt leads to a mark, which turns into a token that becomes money.'], 'flow'), ['A debt', 'a mark', 'a token', 'money']);
  const timeline = proposalsFor(['In 3200 BC clay tokens recorded debts.', 'By 600 BC stamped coins appeared in Lydia.', 'In 1024 China printed the first paper money.']);
  assert.ok(!timeline.graphics.some(item => item.template === 'date'), 'a timeline replaces the single date stamps of its scene');
  const chart = timeline.graphics.find(item => item.template === 'timeline');
  assert.deepEqual([chart.status, chart.renderer, chart.finish, chart.origin], ['proposed', 'canvas', 'clean', 'brain']);
  assert.match(chart.reason, /Check each event/);
  assert.equal(proposalsFor(['In 3200 BC clay tokens recorded debts.', 'By 600 BC stamped coins appeared in Lydia.', 'In 1024 China printed the first paper money.'], {...SPEC, renderer: {adapter: 'ffmpeg-sketch'}}).graphics.find(item => item.template === 'timeline').finish, 'hand-drawn');
  assert.equal(proposalsFor(['Salt made up 18% of trades, salt 34% and salt 60%.']).graphics.some(item => item.template === 'bar-chart'), false, 'repeated labels are not a chart');
  // Owner edits of a canvas graphic are validated; text graphics stay on the ASS layer only.
  const accepted = B.applyOp(timeline, {type: 'set-graphic', graphicId: chart.id, status: 'accepted', title: 'From clay to coin'}, {spec: SPEC}).timeline;
  assert.equal(accepted.graphics.find(item => item.id === chart.id).title, 'From clay to coin');
  assert.throws(() => B.applyOp(timeline, {type: 'set-graphic', graphicId: chart.id, lines: ['1347 = only one']}, {spec: SPEC}), /3-7 lines/);
  assert.equal(B.graphicsAss({...accepted, captions: {...accepted.captions, enabled: false}}, SPEC), null, 'canvas graphics are not drawn by libass');
  assert.equal(B.critique(accepted, SPEC).stats.graphicsAccepted, 1);
  // Adding a graphic: validated, accepted at once, never overlapping another.
  const added = B.applyOp(accepted, {type: 'add-graphic', template: 'flow', startSeconds: 12, seconds: 4, title: 'How it spread', lines: ['A port', 'A ship', 'A city']}, {spec: SPEC}).timeline;
  const flow = added.graphics.find(item => item.origin === 'owner');
  assert.deepEqual([flow.id, flow.status, flow.renderer, flow.start, flow.frames], ['gr_owner_1', 'accepted', 'canvas', 360, 120]);
  assert.throws(() => B.applyOp(added, {type: 'add-graphic', template: 'quote', startSeconds: 13, seconds: 2, lines: ['A clash']}, {spec: SPEC}), /overlap the flow/);
  assert.throws(() => B.applyOp(added, {type: 'add-graphic', template: 'map', startSeconds: 25, seconds: 2, lines: ['x']}, {spec: SPEC}), /Choose a graphic/);
  assert.throws(() => B.applyOp(added, {type: 'add-graphic', template: 'list', startSeconds: 25, seconds: 2, lines: ['only one']}, {spec: SPEC}), /3-6 lines/);
  // Render plan: canvas clips are inputs after the narration and are overlaid at their start time.
  const files = Object.fromEntries(added.clips.map(clip => [clip.id, `${clip.id}.src`]));
  const plan = R.planTimeline({timeline: added, files, narration: {file: 'n.wav', durationSeconds: added.narrationSeconds}, format: 'long-form', workDir: '/w', outFile: '/w/o.mp4', overlays: [{file: 'graphic-1.mov', start: 360, frames: 120}]});
  const args = plan.final.args.join(' ');
  assert.match(args, /-i n\.wav -i graphic-1\.mov/);
  assert.match(args, /setpts=PTS-STARTPTS\+12\/TB,format=rgba\[g0\];\[[a-z0-9]+\]\[g0\]overlay=x=0:y=0:eof_action=pass:enable='between\(t,12,16\)'/);
  assert.equal(plan.overlays, 1);
});

test('the canvas renderer draws identical frames every time, at the requested size', {skip: noBrowser}, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const report = await inspectBrowser();
  assert.equal(report.passed, true, JSON.stringify(report.issues));
  assert.match(report.sha256, /^[a-f0-9]{64}$/);
  const graphic = {template: 'flow', data: B.canvasData('flow', 'How a promise became money', ['A debt', 'A mark', 'A token', 'Money']), palette: {bg: '#0E0E0E', ink: '#F2EEE6', accent: '#C9A227'}, fonts: {heading: 'Georgia', body: 'Arial', hand: 'Segoe Print'}, finish: 'hand-drawn', width: 320, height: 180, fps: 10, duration: 2};
  const renderer = await new MotionRenderer().start();
  const {port, profile} = renderer;
  let first, second;
  try {
    first = await renderer.render({...graphic, outDir: path.join(dir, 'a')});
    second = await renderer.render({...graphic, outDir: path.join(dir, 'b')});
    await assert.rejects(renderer.frame({...graphic, template: 'no-such-template', t: 0}), /Motion template error/);
  } finally { await renderer.close(); }
  // Regression: Edge may relaunch itself, so killing the spawned launcher once left headless browsers running.
  await assert.rejects(fetch(`http://127.0.0.1:${port}/json/version`), 'the browser itself is closed, not only the launcher');
  assert.equal(fs.existsSync(profile), false, 'the throwaway profile is removed');
  assert.equal(first.frames, 20);
  assert.equal(first.sha256, second.sha256, 'same graphic, same pixels');
  const png = fs.readFileSync(path.join(dir, 'a', 'f00019.png'));
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [320, 180]);
  assert.notEqual(fs.readFileSync(path.join(dir, 'a', 'f00000.png')).equals(png), true, 'the graphic animates');
});

test('an edit with an animated timeline renders through the local browser and FFmpeg, identically twice', {skip: skip || noBrowser}, async t => {
  const env = setup(t, {seconds: 30});
  const {editing, renders, content, dataRoot} = env;
  const {approval} = await approvedBoard(env);
  const r1 = await editing.generate(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id});
  const fps = r1.timeline.fps, startSeconds = 6;
  const clashing = r1.timeline.graphics.filter(item => item.status === 'accepted' && item.start / fps < startSeconds + 5 && (item.start + item.frames) / fps > startSeconds);
  const r2 = editing.applyOps(r1.id, {editedBy: 'Owner', ops: [
    ...clashing.map(item => ({type: 'set-graphic', graphicId: item.id, status: 'rejected'})),
    {type: 'add-graphic', template: 'timeline', startSeconds, seconds: 5, title: 'From clay to coin', lines: ['3200 BC = Clay tokens', '600 BC = First coins', '1024 = Paper money']},
  ]});
  const report = await renders.checkReadiness({requestedBy: 'Owner'});
  assert.equal(report.passed, true, JSON.stringify(report.issues));
  assert.equal(report.motion.passed, true, JSON.stringify(report.motion.issues));
  renders.pin({readinessId: report.id, pinnedBy: 'Owner', reason: 'Reviewed build for the animated graphics.'});
  const queued = renders.queueRender(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id, editRevisionId: r2.id});
  const done = await renders.processNext();
  assert.equal(done?.status, 'completed', JSON.stringify(renders.publicJob(renders.row(queued.id)).error));
  const result = JSON.parse(renders.row(queued.id).result);
  assert.equal(result.qc.find(item => item.name === 'duration').passed, true, JSON.stringify(result.qc));
  assert.equal(result.qc.find(item => item.name === 'black frames').passed, true, JSON.stringify(result.qc));
  const manifest = JSON.parse(fs.readFileSync(path.join(dataRoot, result.manifest.relativePath), 'utf8'));
  assert.equal(manifest.inputs.edit.canvas.graphics.length, 1);
  assert.equal(manifest.inputs.edit.canvas.graphics[0].template, 'timeline');
  assert.match(manifest.inputs.edit.canvas.graphics[0].framesSha256, /^[a-f0-9]{64}$/);
  assert.ok(manifest.commands.every(command => !command.args.join(' ').includes(dataRoot)), 'command plans do not leak local paths');
  // A frame inside the timeline window shows the graphic's dark panel, not the bright test footage.
  const video = path.join(dataRoot, result.video.relativePath), still = path.join(dataRoot, 'panel.png');
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', String(startSeconds + 4), '-i', video, '-frames:v', '1', '-vf', 'scale=1:1:flags=area,format=gray', '-f', 'rawvideo', '-y', still]);
  const luma = fs.readFileSync(still)[0];
  assert.ok(luma < 70, `the timeline panel is on screen (average luma ${luma})`);
  const again = renders.queueRender(content.id, {requestedBy: 'Owner', visualApprovalId: approval.id, editRevisionId: r2.id});
  await renders.processNext();
  assert.equal(JSON.parse(renders.row(again.id).result).video.sha256, result.video.sha256, 'same edit, same browser and build: byte-identical');
});

test('a stock clip window stays inside one shot when the clip hides a cut', () => {
  // 12 s clip with cuts at 4 s and 6 s; a 3 s window from the in-point 2 s crosses the 4 s cut.
  const moved = B.cleanWindow(12, 3, [4, 6], 2);
  assert.equal(moved.moved, true);
  assert.equal(moved.cut, 4);
  assert.ok(moved.inSeconds >= 6 && moved.inSeconds + 3 <= 12, 'the longest single shot (6-12 s) is used');
  assert.deepEqual(B.cleanWindow(12, 3, [8], 1), {inSeconds: 1, moved: false}, 'a clean default window stays');
  assert.deepEqual(B.cleanWindow(5, 4, [2.5], 0.5), {inSeconds: 0.5, moved: false}, 'no shot is long enough: the critic will name the cut');
});
