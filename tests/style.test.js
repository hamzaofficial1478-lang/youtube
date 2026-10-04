'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {Store} = require('../store');
const {StyleLibrary, validateStyleSpec, specDiff, contrastRatio, LAUNCH_PROFILES, RENDERERS} = require('../style');
const {createApp} = require('../server');

const familyFixture = {
  name: 'Style fixture family', tier: 'A', countries: ['United States'],
  audience: 'Adults who enjoy documentary stories about money and trade.', niche: 'Money history',
  locales: ['en-US', 'es-419', 'it-IT'], timezone: 'Asia/Karachi', monthlyBudget: 50, cadence: 2, format: 'long-form',
};
const words = (count, prefix) => Array.from({length: count}, (_, index) => `${prefix}${index + 1}`).join(' ');
const hook = 'Before coins existed, trust already had a price.';
const script = [`${hook} ${words(150, 'opening')}`, words(160, 'development'), words(160, 'example'), words(168, 'payoff')].join('\n\n');
const review = {approvedBy: 'Fixture reviewer', notes: 'Reviewed in an isolated test.', confirmations: {specReviewed: true, rightsReviewed: true, originalityReviewed: true}};

function setup(t, extra = {}) {
  const store = new Store(':memory:');
  t.after(() => store.close());
  const styles = new StyleLibrary(store);
  const family = store.saveFamily({...familyFixture, ...extra});
  return {store, styles, family};
}
const profile = (styles, key) => styles.profiles().find(item => item.key === key);
const latest = (styles, key) => profile(styles, key).revisions.at(-1);
const approve = (styles, key) => styles.approveRevision(latest(styles, key).id, review);
function approvedScript(store, family) {
  const content = store.saveContent({familyId: family.id, title: 'How trust became money', kind: 'fiction', angle: 'Follow two invented villages through a trade that needs trust.', hook, script, sources: [], rightsConfirmed: true});
  store.reviewContent(content.id, {revision: content.revision, action: 'submit'});
  return store.reviewContent(content.id, {revision: content.revision, action: 'approve'});
}

test('launch library seeds five valid draft profiles once and every launch spec passes its renderer contract', t => {
  const {store, styles} = setup(t);
  new StyleLibrary(store);
  const profiles = styles.profiles();
  assert.deepEqual(profiles.map(item => item.key), ['stickman-sketch-explainer', 'hand-drawn-canvas', 'motion-graphics', 'documentary-montage', 'cinematic-hybrid']);
  assert.ok(profiles.every(item => item.revisions.length === 1 && item.revisions[0].status === 'draft' && item.origin === 'launch'));
  for (const launch of LAUNCH_PROFILES) assert.deepEqual(validateStyleSpec(structuredClone(launch.spec)).name, launch.spec.name);
  assert.equal(profile(styles, 'documentary-montage').revisions[0].spec.renderer.adapter, 'ffmpeg-montage');
  assert.equal(RENDERERS['ffmpeg-montage'].firstProof, true);
  assert.ok(Object.values(RENDERERS).every(renderer => renderer.status === 'not_implemented'), 'no renderer may claim to be ready before P05');
});

test('style specs reject unsupported renderer combinations, weak contrast, missing cuts and the 30% reference rule', () => {
  const base = () => structuredClone(LAUNCH_PROFILES.find(item => item.key === 'documentary-montage').spec);
  assert.throws(() => validateStyleSpec({...base(), transitions: {allowed: ['cut', 'morph'], default: 'cut', maxDurationMs: 300}}), /FFmpeg montage renderer does not support the "morph" transition/);
  assert.throws(() => validateStyleSpec({...base(), motion: {cameraMoves: ['static', 'handheld-sim'], intensity: 20, easing: 'linear'}}), /does not support the "handheld-sim" camera move/);
  assert.throws(() => validateStyleSpec({...base(), renderer: {adapter: 'canvas-frames'}, canvas: {frameRate: 60, longFormResolution: '1920x1080', shortsResolution: '1080x1920'}}), /does not support 60 fps|ken-burns/);
  assert.throws(() => validateStyleSpec({...base(), transitions: {allowed: ['crossfade'], default: 'crossfade', maxDurationMs: 300}}), /straight cut/);
  assert.throws(() => validateStyleSpec({...base(), transitions: {allowed: ['cut'], default: 'crossfade', maxDurationMs: 300}}), /default transition/);
  assert.throws(() => validateStyleSpec({...base(), palette: {background: '#FFFFFF', primary: '#000000', accent: '#FF0000', text: '#DDDDDD'}}), /contrast/);
  assert.throws(() => validateStyleSpec({...base(), originality: {referenceSharePercent: 31, prohibited: ['Copying']}}), /owner rule: at most 30%/);
  assert.throws(() => validateStyleSpec({...base(), visuals: {sources: ['ai-video'], primarySource: 'ai-video', aiDisclosure: 'review-per-asset', characterConsistency: false}}), /always disclose/);
  assert.throws(() => validateStyleSpec({...base(), pacing: {shotMinSeconds: 9, shotMaxSeconds: 3, hookShotMaxSeconds: 2, maxStaticHoldSeconds: 5}}), /Minimum shot length cannot exceed/);
  assert.throws(() => validateStyleSpec({...base(), formats: []}), /supported format/);
  assert.throws(() => validateStyleSpec({...base(), typography: {...base().typography, headingFont: 'Bad<script>'}}), /Heading font may contain/);
  const shortsOnly = validateStyleSpec({...base(), formats: ['shorts'], canvas: {frameRate: 30, longFormResolution: 'ignored', shortsResolution: '1080x1920'}});
  assert.equal(shortsOnly.canvas.longFormResolution, undefined);
  assert.ok(contrastRatio('#FFFFFF', '#000000') > 20);
});

test('revisions are immutable, need a real change, track diffs and refuse stale editors', t => {
  const {styles, store} = setup(t);
  const montage = profile(styles, 'documentary-montage');
  const spec = structuredClone(montage.revisions[0].spec);
  assert.throws(() => styles.createRevision(montage.id, {expectedRevision: 1, spec, changeNote: 'No real change here', createdBy: 'Fixture'}), /identical/);
  spec.pacing.shotMaxSeconds = 9;
  const second = styles.createRevision(montage.id, {expectedRevision: 1, spec, changeNote: 'Calmer pacing for money stories', createdBy: 'Fixture'});
  assert.equal(second.revision, 2);
  assert.equal(second.status, 'draft');
  assert.deepEqual(profile(styles, 'documentary-montage').revisions[1].changes, [{path: 'pacing.shotMaxSeconds', before: 8, after: 9}]);
  assert.throws(() => styles.createRevision(montage.id, {expectedRevision: 1, spec: {...spec, summary: 'Another edit made in a stale browser tab.'}, changeNote: 'Stale tab edit', createdBy: 'Fixture'}), /another tab/);
  assert.throws(() => store.db.prepare('UPDATE style_revisions SET spec=? WHERE id=?').run('{}', second.id), /immutable/);
  assert.throws(() => store.db.prepare('DELETE FROM style_revisions WHERE id=?').run(second.id), /cannot be deleted/);
  assert.equal(profile(styles, 'documentary-montage').revisions[0].spec.pacing.shotMaxSeconds, 8, 'the earlier revision keeps its exact specification');
  assert.deepEqual(specDiff({a: {b: 1, c: [1]}}, {a: {b: 1, c: [1, 2]}, d: true}), [{path: 'a.c', before: [1], after: [1, 2]}, {path: 'd', before: null, after: true}]);
});

test('approval is a human gate with all three confirmations, and only drafts can be approved', t => {
  const {styles} = setup(t);
  const draft = latest(styles, 'stickman-sketch-explainer');
  assert.throws(() => styles.approveRevision(draft.id, {...review, confirmations: {specReviewed: true, rightsReviewed: true}}), /originality guard/);
  assert.throws(() => styles.approveRevision(draft.id, {...review, approvedBy: ''}), /Reviewer name/);
  const approved = styles.approveRevision(draft.id, review);
  assert.equal(approved.status, 'approved');
  assert.equal(approved.review.approvedBy, 'Fixture reviewer');
  assert.throws(() => styles.approveRevision(draft.id, review), /Only draft revisions/);
});

test('family default assignment requires an approved compatible revision and records a superseding history', t => {
  const {store, styles, family} = setup(t);
  const montage = latest(styles, 'documentary-montage');
  const decision = {familyRevision: family.revision, assignedBy: 'Fixture owner', reason: 'Stock and AI visuals suit this family.'};
  assert.throws(() => styles.assign(family.id, {...decision, revisionId: montage.id}), /still a draft/);
  approve(styles, 'documentary-montage');
  assert.throws(() => styles.assign(family.id, {...decision, familyRevision: family.revision + 1, revisionId: montage.id}), /another tab/);
  const first = styles.assign(family.id, {...decision, revisionId: montage.id, expectedAssignmentId: null});
  assert.equal(first.status, 'active');
  assert.throws(() => styles.assign(family.id, {...decision, revisionId: montage.id, expectedAssignmentId: first.id}), /already assigned/);
  approve(styles, 'motion-graphics');
  assert.throws(() => styles.assign(family.id, {...decision, revisionId: latest(styles, 'motion-graphics').id, expectedAssignmentId: null}), /changed in another tab/);

  const content = approvedScript(store, family);
  const second = styles.assign(family.id, {...decision, revisionId: latest(styles, 'motion-graphics').id, expectedAssignmentId: first.id, reason: 'Testing a faster visual grammar.'});
  const history = styles.assignments(family.id);
  assert.deepEqual(history.map(item => item.status), ['active', 'superseded']);
  assert.equal(history[0].supersedesId, first.id);
  assert.match(history[1].endedReason, /Replaced by Motion Graphics r1/);
  const stale = store.productionInvalidations().filter(item => item.contentId === content.id);
  assert.deepEqual(stale.map(item => item.stage), ['scene_manifest', 'editing_timeline', 'captions', 'packaging', 'render']);
  assert.ok(stale.every(item => item.reason.startsWith('Style family default changed')));
  assert.equal(styles.handoffs().find(item => item.familyId === family.id).revisionId, second.revisionId);
});

test('every channel inherits the family default; overrides need acknowledgement and never touch the primary channel', t => {
  const {styles, family} = setup(t);
  approve(styles, 'documentary-montage');
  approve(styles, 'motion-graphics');
  const base = {familyRevision: family.revision, assignedBy: 'Fixture owner', reason: 'Explicit fixture decision.'};
  const blocked = styles.handoffs().find(item => item.familyId === family.id);
  assert.equal(blocked.ready, false);
  assert.match(blocked.blocker, /Assign an approved default/);
  assert.throws(() => styles.assign(family.id, {...base, scope: 'channel', locale: 'es-419', revisionId: latest(styles, 'motion-graphics').id, separateProductionAcknowledged: true}), /family default style before/);
  const defaultAssignment = styles.assign(family.id, {...base, revisionId: latest(styles, 'documentary-montage').id});
  let handoff = styles.handoffs().find(item => item.familyId === family.id);
  assert.equal(handoff.ready, true);
  assert.deepEqual(handoff.channels.map(item => item.source), ['family', 'family', 'family']);

  const override = {...base, scope: 'channel', locale: 'es-419', revisionId: latest(styles, 'motion-graphics').id};
  assert.throws(() => styles.assign(family.id, override), /separate visual production/);
  assert.throws(() => styles.assign(family.id, {...override, locale: 'en-US', separateProductionAcknowledged: true}), /primary channel always uses the family default/);
  assert.throws(() => styles.assign(family.id, {...override, locale: 'fr-FR', separateProductionAcknowledged: true}), /configured channel locales/);
  assert.throws(() => styles.assign(family.id, {...override, revisionId: latest(styles, 'documentary-montage').id, separateProductionAcknowledged: true}), /already the family default/);
  const channel = styles.assign(family.id, {...override, separateProductionAcknowledged: true});
  handoff = styles.handoffs().find(item => item.familyId === family.id);
  assert.deepEqual(handoff.channels.map(item => item.source), ['family', 'override', 'family']);
  assert.equal(handoff.channels[1].name, 'Motion Graphics');

  assert.throws(() => styles.revoke(defaultAssignment.id, {...base, revokedBy: 'Fixture owner'}), /channel overrides first/);
  styles.revoke(channel.id, {...base, revokedBy: 'Fixture owner', reason: 'Spanish channel returns to the family style.'});
  assert.deepEqual(styles.handoffs().find(item => item.familyId === family.id).channels.map(item => item.source), ['family', 'family', 'family']);
  styles.revoke(defaultAssignment.id, {...base, revokedBy: 'Fixture owner', reason: 'Pausing visual planning for this family.'});
  assert.equal(styles.handoffs().find(item => item.familyId === family.id).ready, false);
});

test('approved fallbacks are explicit, compatible and manual-only; nothing switches automatically', t => {
  const {styles, family} = setup(t);
  approve(styles, 'documentary-montage');
  const assignment = styles.assign(family.id, {familyRevision: family.revision, assignedBy: 'Fixture owner', reason: 'Primary style decision.', revisionId: latest(styles, 'documentary-montage').id});
  const base = {familyRevision: family.revision, approvedBy: 'Fixture owner', reason: 'Use only if the primary renderer fails.'};
  assert.throws(() => styles.setFallback(assignment.id, {...base, fallbackRevisionId: latest(styles, 'stickman-sketch-explainer').id, confirmManualActivation: true}), /still a draft/);
  approve(styles, 'stickman-sketch-explainer');
  assert.throws(() => styles.setFallback(assignment.id, {...base, fallbackRevisionId: latest(styles, 'stickman-sketch-explainer').id}), /never used automatically/);
  assert.throws(() => styles.setFallback(assignment.id, {...base, fallbackRevisionId: latest(styles, 'documentary-montage').id, confirmManualActivation: true}), /different style revision/);
  const withFallback = styles.setFallback(assignment.id, {...base, fallbackRevisionId: latest(styles, 'stickman-sketch-explainer').id, confirmManualActivation: true});
  assert.equal(withFallback.fallback.activation, 'manual-per-job');
  const handoff = styles.handoffs().find(item => item.familyId === family.id);
  assert.equal(handoff.revisionId, latest(styles, 'documentary-montage').id, 'the handoff keeps the assigned style, not the fallback');
  assert.equal(styles.setFallback(assignment.id, {...base, fallbackRevisionId: null}).fallback, null);
});

test('retiring an assigned revision or changing the family format blocks the handoff instead of switching styles', t => {
  const {store, styles, family} = setup(t);
  const shortsOnly = structuredClone(latest(styles, 'motion-graphics').spec);
  shortsOnly.name = 'Shorts Only Motion';
  shortsOnly.formats = ['shorts'];
  const custom = styles.createProfile({spec: shortsOnly, changeNote: 'Vertical-only variant for Shorts.', createdBy: 'Fixture', baseRevisionId: latest(styles, 'motion-graphics').id});
  assert.equal(profile(styles, 'shorts-only-motion').origin, 'derived');
  styles.approveRevision(custom.id, review);
  assert.throws(() => styles.assign(family.id, {familyRevision: family.revision, assignedBy: 'Fixture', reason: 'Wrong format on purpose.', revisionId: custom.id}), /does not support the family's long-form format/);
  assert.throws(() => styles.createProfile({spec: shortsOnly, changeNote: 'Duplicate name attempt.', createdBy: 'Fixture'}), /already exists/);

  approve(styles, 'documentary-montage');
  styles.assign(family.id, {familyRevision: family.revision, assignedBy: 'Fixture', reason: 'Primary style decision.', revisionId: latest(styles, 'documentary-montage').id});
  approvedScript(store, family);
  styles.retireRevision(latest(styles, 'documentary-montage').id, {retiredBy: 'Fixture', reason: 'Replaced by a calmer documentary revision.'});
  let handoff = styles.handoffs().find(item => item.familyId === family.id);
  assert.equal(handoff.ready, false);
  assert.match(handoff.blocker, /retired/);
  assert.equal(handoff.revisionId, latest(styles, 'documentary-montage').id, 'the retired revision stays visible; no other style is substituted');
  assert.ok(store.productionInvalidations().some(item => /was retired/.test(item.reason)));

  const reopened = setup(t);
  approve(reopened.styles, 'hand-drawn-canvas');
  reopened.styles.assign(reopened.family.id, {familyRevision: reopened.family.revision, assignedBy: 'Fixture', reason: 'Storytelling style decision.', revisionId: latest(reopened.styles, 'hand-drawn-canvas').id});
  const handDrawn = profile(reopened.styles, 'hand-drawn-canvas');
  const longOnly = structuredClone(handDrawn.revisions[0].spec);
  longOnly.formats = ['long-form'];
  const revision = reopened.styles.createRevision(handDrawn.id, {expectedRevision: 1, spec: longOnly, changeNote: 'Long-form only for this test.', createdBy: 'Fixture'});
  reopened.styles.approveRevision(revision.id, review);
  reopened.styles.assign(reopened.family.id, {familyRevision: reopened.family.revision, assignedBy: 'Fixture', reason: 'Switch to the long-form-only revision.', revisionId: revision.id, expectedAssignmentId: reopened.styles.assignments(reopened.family.id)[0].id});
  reopened.store.saveFamily({...familyFixture, format: 'shorts', revision: reopened.family.revision}, reopened.family.id);
  handoff = reopened.styles.handoffs().find(item => item.familyId === reopened.family.id);
  assert.equal(handoff.ready, false);
  assert.match(handoff.blocker, /does not support the family's shorts format/);
});

test('HTTP style routes require the local token, validate input and return the library in state', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'control-room-style-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const protector = {transform: (operation, input) => Buffer.from([...input].reverse())};
  const {server} = createApp({dataFile: path.join(dir, 'workspace.sqlite'), worker: false, protector, voiceOptions: {ffmpeg: 'missing-ffmpeg-for-test', ffprobe: 'missing-ffprobe-for-test'}});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const state = await (await fetch(`${base}/api/state`)).json();
  assert.equal(state.styles.profiles.length, 5);
  assert.equal(state.app.version, JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version);
  const script = await fetch(`${base}/style-room.js`);
  assert.equal(script.status, 200);
  assert.match(await script.text(), /function styleRoom\(family\)/);
  const draft = state.styles.profiles.find(item => item.key === 'documentary-montage').revisions[0];
  const send = (url, body, token = state.token) => fetch(base + url, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Local-Token': token}, body: JSON.stringify(body)});
  assert.equal((await send(`/api/style-revisions/${draft.id}/approve`, review, 'wrong-token')).status, 403);
  const missing = await send(`/api/style-revisions/${draft.id}/approve`, {...review, confirmations: {}});
  assert.equal(missing.status, 400);
  assert.match((await missing.json()).error, /Confirm that you reviewed/);
  assert.equal((await send(`/api/style-revisions/${draft.id}/approve`, review)).status, 200);
  const family = await (await send('/api/families', familyFixture)).json();
  const assigned = await send(`/api/families/${family.id}/style-assignments`, {familyRevision: family.revision, revisionId: draft.id, assignedBy: 'Fixture owner', reason: 'HTTP assignment fixture.'});
  assert.equal(assigned.status, 200);
  const after = await (await fetch(`${base}/api/state`)).json();
  assert.equal(after.styles.handoffs.find(item => item.familyId === family.id).ready, true);
  assert.equal((await send('/api/style-assignments/00000000-0000-0000-0000-000000000000/revoke', {revokedBy: 'Fixture', reason: 'Unknown assignment id.', familyRevision: 1})).status, 404);
});
