'use strict';
const test = require('node:test');
const {Ai}=require('../ai');
const {claudeMessage,isClaudeModel,claudeModel,claudeFetch,promptOf}=require('./fake-claude');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {Store} = require('../store');
const {SkillsEngine, validateSkill, loadPacks, RULES, TASK_KEYS, SOURCE_HIERARCHY, BRIEF_BYTE_BUDGET} = require('../skills');
const {scriptMessages} = require('../writer');
const {createApp} = require('../server');

const root = path.join(__dirname, '..');
const familyFixture = {
  name: 'Skills fixture family', tier: 'A', countries: ['United States'],
  audience: 'Adults who enjoy documentary stories about money and trade.', niche: 'Money history',
  locales: ['en-US', 'es-419'], timezone: 'Asia/Karachi', monthlyBudget: 50, cadence: 2, format: 'long-form',
};
const review = {approvedBy: 'Fixture reviewer', notes: 'Reviewed in an isolated test.', confirmations: {wordingReviewed: true, numbersReviewed: true, scopeReviewed: true}};

// Every skill ID the build brief (docs/SKILLS-ENGINE-PLAN.md section 8) maps a source section to.
// This list is the completeness contract: nothing from the owner's documents may be dropped.
const PLANNED_IDS = [
  // 8.1 Precision AI Operating System, 36 sections plus the pipeline note and the setup note.
  'os.execution-partner', 'os.context-first', 'os.project-memory', 'os.context-retrieval', 'os.source-hierarchy',
  'os.known-inferred-unknown', 'os.downstream-thinking', 'os.input-first', 'os.file-first', 'os.reference-dna',
  'learning.corrections-as-constraints', 'os.minimum-questions', 'research.evidence-protocol', 'os.five-pass',
  'qc.output-qa', 'strategy.youtube-chain', 'competitors.nine-dna', 'niche.niche-bending', 'script.spoken-standard',
  'scene.visual-serves-narration', 'scene.character-bible', 'editing.voiceover-edit-map', 'packaging.thumbnail-system',
  'strategy.business-chain', 'os.systemize-repeats', 'os.master-prompt-anatomy', 'os.checkpoints', 'os.error-recovery',
  'os.communication', 'os.depth-matching', 'os.use-tools', 'qc.completion-standard', 'learning.project-state',
  'learning.version-preference', 'os.project-bootstrap', 'qc.anti-generic', 'os.operating-command', 'os.project-workspace',
  // 8.2 YT Empire Builders Reusable Prompt Library, library rules plus 44 prompts.
  'library.prompt-card-anatomy', 'library.chaining', 'qc.no-raw-placeholders', 'library.model-routing',
  'library.pipeline-map', 'learning.scale-winners', 'niche.trend-hunter', 'niche.trend-to-niche', 'niche.compare-14-point',
  'niche.selection-checklist', 'competitors.channel-dna-extractor', 'competitors.ecosystem-map', 'ideas.master-ideas',
  'ideas.promise-fulfilment-thumbnail', 'research.deep-report', 'ideas.clustered-titles', 'ideas.similar-winner',
  'analytics.stats-strategist', 'hooks.universal-3-hook', 'hooks.nine-layer-retention', 'script.documentary-builder',
  'script.three-step-hook', 'script.open-loop-outline', 'script.news-to-script', 'script.originalize',
  'script.unified-five-phase', 'script.evidence-first-documentary', 'hooks.viral-hooks-extractor', 'qc.title-script-promise',
  'voice.voice-recommender', 'script.long-form-passes', 'visuals.word-count-prompts', 'visuals.themed-editor-mapped',
  'visuals.confirm-before-generate', 'visuals.art-as-story', 'packaging.thumbnail-pick', 'packaging.thumbnail-three-layer',
  'packaging.thumbnail-concept-director', 'editing.line-by-line-blueprint', 'editing.avd-visual-alignment',
  'seo.keyword-position-titles', 'seo.script-aware', 'seo.fifteen-video-roadmap', 'branding.visual-identity',
  'localization.creator-finder', 'localization.creator-outreach', 'localization.translation-check',
  'os.faceless-automation-os', 'visuals.path-selector', 'research.credible-sources', 'niche.trend-24h-faceless',
  // 8.4 the owner's motion-designer title-card prompt.
  'motion.title-cards-canvas',
  // CB YT AI Mastery Prompts Bundle (docs/research/mastery-bundle-analysis.md), the load-bearing ones.
  'script.chapter-section-allocation', 'script.exact-word-expansion', 'script.owner-angle-questions',
  'ideas.core-idea-topic-title-ladder', 'niche.outlier-entry-signals', 'competitors.editing-pattern-decode',
  'editing.clip-source-policy', 'editing.zero-decision-assembly-package', 'editing.format-rotation',
  'strategy.authenticity-guardrails', 'analytics.stall-response-order', 'niche.profile-true-crime',
];

function setup(t, {seed = true} = {}) {
  const store = new Store(':memory:');
  t.after(() => store.close());
  const skills = new SkillsEngine(store, {root, seed});
  return {store, skills};
}
const ownerSkill = (overrides = {}) => ({
  id: 'script.owner-rule', title: 'Owner rule for hooks', rooms: ['script'], kind: 'ruleset',
  when: 'When the owner wants his own hook rule applied to every script.',
  summary: 'The owner prefers a concrete number in the first sentence of every hook.',
  do: ['Put one concrete number in the first sentence.'], avoid: ['Opening on an abstract claim.'],
  checks: ['The first sentence contains a number.'], tags: ['hook'], source: 'Owner instruction, 2026-10-05',
  priority: 50, ...overrides,
});
function approveById(skills, id) {
  const skill = skills.skills().find(item => item.id === id);
  assert.ok(skill, `expected seeded skill ${id}`);
  return skills.approveRevision(skill.latest.id, review);
}

test('the builtin packs cover every planned source section and seed only drafts', t => {
  const {store, skills} = setup(t);
  const loaded = loadPacks(root);
  assert.equal(loaded.length, 400, 'expected 38 Precision OS + 51 prompt library + 64 mastery bundle + 14 youtube-agent-skill + 17 HyperFrames + 5 claude-video + 14 motion craft + 14 film craft + 23 channel study + 160 editing-brain skills');
  const ids = new Set(skills.skills().map(item => item.id));
  const missing = PLANNED_IDS.filter(id => !ids.has(id));
  assert.deepEqual(missing, [], `the seeded library is missing planned skills: ${missing.join(', ')}`);
  assert.equal(ids.size, 400);
  const state = skills.state();
  assert.equal(state.counts.total, 400);
  assert.equal(state.counts.draft, 400);
  assert.equal(state.counts.approved, 0, 'a freshly seeded library must have nothing approved');
  assert.equal(state.counts.builtin, 400);
  // Every builtin skill carries its source note so the provenance of a rule stays visible.
  for (const skill of skills.skills()) assert.ok(skill.latest.skill.source.length >= 3, `${skill.id} has no source note`);
  // Re-seeding is idempotent and never adds a second revision to an existing skill.
  const second = new SkillsEngine(store, {root});
  assert.equal(second.skills().length, 400);
  assert.deepEqual(second.skills().map(item => item.revisions.length).filter(count => count !== 1), []);
  // Every task key has at least one candidate skill, so no room is left without guidance.
  for (const task of TASK_KEYS) {
    assert.ok(loaded.some(item => item.skill.tasks.includes(task)), `no skill is bound to ${task}`);
  }
});

test('nothing reaches a prompt until a human approves a revision', t => {
  const {skills} = setup(t);
  assert.equal(skills.promptBrief('script.candidate'), null, 'drafts must not be injected');
  assert.equal(skills.brief('script.candidate').skills.length, 0);
  approveById(skills, 'hooks.universal-3-hook');
  const brief = skills.promptBrief('script.candidate');
  assert.deepEqual(brief.skillIds, ['hooks.universal-3-hook']);
  assert.deepEqual(brief.prompt.sourceHierarchy, SOURCE_HIERARCHY);
  const entry = brief.prompt.skills[0];
  assert.equal(entry.id, 'hooks.universal-3-hook');
  assert.ok(entry.do.length && entry.avoid.length && entry.checks.length);
  // The compiled brief carries the rules, not the long prose fields.
  assert.equal(entry.summary, undefined);
  assert.equal(entry.steps, undefined);
});

test('approval needs every named confirmation and supersedes the previous approved revision', t => {
  const {skills} = setup(t);
  const draft = skills.skills().find(item => item.id === 'qc.anti-generic').latest;
  assert.throws(() => skills.approveRevision(draft.id, {...review, confirmations: {wordingReviewed: true}}), /Confirm that the/);
  assert.throws(() => skills.approveRevision(draft.id, {...review, approvedBy: ''}), /Reviewer name/);
  const approved = skills.approveRevision(draft.id, review);
  assert.equal(approved.status, 'approved');
  assert.equal(approved.review.approvedBy, 'Fixture reviewer');
  assert.throws(() => skills.approveRevision(draft.id, review), /Only draft revisions can be approved/);
  // A second approved revision takes over, and exactly one revision stays approved.
  const changed = {...approved.skill, do: [...approved.skill.do, 'Name the family audience in the opening line.']};
  const next = skills.createRevision('qc.anti-generic', {skill: changed, createdBy: 'Fixture author', changeNote: 'Add an audience rule after review.'});
  assert.equal(next.revision, 2);
  assert.equal(next.status, 'draft');
  assert.deepEqual(skills.brief('qc.review').skillIds, ['qc.anti-generic']);
  assert.equal(skills.brief('qc.review').skills[0].do.length, approved.skill.do.length, 'a draft revision must not change runtime');
  skills.approveRevision(next.id, review);
  const after = skills.skills().find(item => item.id === 'qc.anti-generic');
  assert.equal(after.approved.revision, 2);
  assert.deepEqual(after.revisions.map(item => item.status), ['superseded', 'approved']);
  assert.equal(skills.brief('qc.review').skills[0].do.length, approved.skill.do.length + 1);
});

test('skill revisions are immutable and retained', t => {
  const {store, skills} = setup(t);
  const draft = skills.skills().find(item => item.id === 'os.five-pass').latest;
  assert.throws(() => store.db.prepare('UPDATE skill_revisions SET payload=? WHERE id=?').run('{}', draft.id), /immutable/);
  assert.throws(() => store.db.prepare('DELETE FROM skill_revisions WHERE id=?').run(draft.id), /cannot be deleted/);
  // Retiring records a reason and takes the skill out of runtime selection.
  approveById(skills, 'os.five-pass');
  assert.ok(skills.brief('script.candidate').skillIds.includes('os.five-pass'));
  const retired = skills.retireRevision(skills.skills().find(item => item.id === 'os.five-pass').approved.id, {retiredBy: 'Fixture owner', reason: 'Superseded by a shorter internal checklist.'});
  assert.equal(retired.retirement.reason, 'Superseded by a shorter internal checklist.');
  assert.ok(!skills.brief('script.candidate').skillIds.includes('os.five-pass'));
});

test('the owner can add skills, and an import creates revisions instead of overwriting', t => {
  const {skills} = setup(t, {seed: false});
  assert.throws(() => skills.saveOwnerSkill({createdBy: 'Owner', changeNote: 'First draft of my rule.', skill: {...ownerSkill(), id: 'NotAnId'}}), /area.kebab-name/);
  assert.throws(() => skills.saveOwnerSkill({createdBy: 'Owner', changeNote: 'First draft of my rule.', skill: {...ownerSkill(), do: [], avoid: [], checks: [], steps: []}}), /at least one step, do rule/);
  const created = skills.saveOwnerSkill({createdBy: 'Owner', changeNote: 'First draft of my own hook rule.', skill: ownerSkill()});
  assert.equal(created.origin, 'owner');
  assert.equal(created.revision, 1);
  assert.equal(created.status, 'draft');
  // An identical save is refused rather than piling up empty revisions.
  assert.throws(() => skills.saveOwnerSkill({createdBy: 'Owner', changeNote: 'Same content again.', skill: ownerSkill()}), /identical to the latest/);
  const imported = skills.importPack({createdBy: 'Owner', changeNote: 'Imported pack from a file.', skills: [ownerSkill(), ownerSkill({id: 'script.second-owner-rule', title: 'Second owner rule'})]});
  assert.deepEqual(imported.unchanged, ['script.owner-rule']);
  assert.deepEqual(imported.created, ['script.second-owner-rule']);
  const revised = skills.importPack({createdBy: 'Owner', changeNote: 'Tightened my hook rule.', skills: [ownerSkill({do: ['Put two concrete numbers in the first sentence.']})]});
  assert.deepEqual(revised.revised, ['script.owner-rule']);
  const history = skills.skills().find(item => item.id === 'script.owner-rule');
  assert.equal(history.revisions.length, 2);
  assert.deepEqual(history.revisions[0].skill.do, ['Put one concrete number in the first sentence.'], 'the first revision must survive the import');
  // Export carries only approved revisions by default.
  assert.deepEqual(skills.exportPack(), []);
  skills.approveRevision(history.revisions[1].id, review);
  assert.deepEqual(skills.exportPack().map(item => item.id), ['script.owner-rule']);
  assert.equal(skills.exportPack({status: 'latest'}).length, 2);
});

test('selection ranks owner and learned skills above builtin, and honours pins and blocks', t => {
  const {store, skills} = setup(t);
  const family = store.saveFamily(familyFixture);
  approveById(skills, 'hooks.universal-3-hook');
  approveById(skills, 'script.spoken-standard');
  const owner = skills.saveOwnerSkill({createdBy: 'Owner', changeNote: 'My own hook rule.', skill: ownerSkill()});
  skills.approveRevision(owner.id, review);
  const order = skills.select('script.candidate').map(item => item.skill.id);
  assert.equal(order[0], 'script.owner-rule', 'an owner skill outranks builtin skills');
  assert.deepEqual(order.slice(1), ['hooks.universal-3-hook', 'script.spoken-standard'], 'builtin order follows priority then id');
  // A family block removes a skill for that family only.
  skills.bind({createdBy: 'Owner', note: 'This family writes its own hooks.', mode: 'block', skillId: 'hooks.universal-3-hook', taskKey: 'script.candidate', familyId: family.id});
  assert.ok(!skills.select('script.candidate', {familyId: family.id}).some(item => item.skill.id === 'hooks.universal-3-hook'));
  assert.ok(skills.select('script.candidate').some(item => item.skill.id === 'hooks.universal-3-hook'), 'other families keep the skill');
  // A pin lifts a skill to the front even for a task its own bindings do not cover.
  approveById(skills, 'seo.script-aware');
  assert.ok(!skills.select('script.candidate', {familyId: family.id}).some(item => item.skill.id === 'seo.script-aware'));
  skills.bind({createdBy: 'Owner', note: 'This family wants keywords considered while writing.', mode: 'pin', skillId: 'seo.script-aware', taskKey: 'script.candidate', familyId: family.id, position: 0});
  assert.equal(skills.select('script.candidate', {familyId: family.id})[0].skill.id, 'seo.script-aware');
  // Removing the binding restores the default selection.
  const binding = skills.bindings().find(item => item.mode === 'block');
  skills.unbind(binding.id, {removedBy: 'Owner'});
  assert.ok(skills.select('script.candidate', {familyId: family.id}).some(item => item.skill.id === 'hooks.universal-3-hook'));
});

test('a pin-only profile reaches a brief only for the family it is pinned to', t => {
  const {store, skills} = setup(t);
  const crime = store.saveFamily(familyFixture);
  const history = store.saveFamily({...familyFixture, name: 'Second fixture family', niche: 'Sleep history'});
  approveById(skills, 'niche.profile-true-crime');
  assert.equal(skills.promptBrief('script.candidate'), null, 'approval alone must not spread a profile to every family');
  assert.equal(skills.promptBrief('script.candidate', {familyId: crime.id}), null);
  skills.bind({createdBy: 'Owner', note: 'This family covers court cases.', mode: 'pin', skillId: 'niche.profile-true-crime', taskKey: 'script.candidate', familyId: crime.id});
  assert.deepEqual(skills.promptBrief('script.candidate', {familyId: crime.id}).skillIds, ['niche.profile-true-crime']);
  assert.equal(skills.promptBrief('script.candidate', {familyId: history.id}), null, 'another family never receives the profile');
  // The flag is part of the skill, survives an owner revision, and older payloads without it keep their hash.
  assert.equal(validateSkill(ownerSkill()).pinOnly, undefined);
  assert.equal(validateSkill({...ownerSkill(), pinOnly: true}).pinOnly, true);
  assert.throws(() => validateSkill({...ownerSkill(), pinOnly: 'yes'}), /Pin-only/);
  const loaded = loadPacks(root).filter(item => item.skill.id.startsWith('niche.profile-'));
  assert.ok(loaded.length >= 10 && loaded.every(item => item.skill.pinOnly), 'every niche profile is pin-only');
});

test('the brief stays inside its byte budget and reports what it dropped', t => {
  const {skills} = setup(t);
  for (const id of ['hooks.universal-3-hook', 'script.spoken-standard', 'qc.output-qa', 'os.source-hierarchy', 'qc.anti-generic']) approveById(skills, id);
  const full = skills.brief('script.candidate', {byteBudget: 20000});
  assert.equal(full.dropped, 0);
  assert.equal(full.skills.length, full.available);
  const tight = skills.brief('script.candidate', {byteBudget: 900});
  assert.ok(tight.injectedBytes <= 900, `brief used ${tight.injectedBytes} bytes`);
  assert.ok(tight.dropped > 0, 'a tight budget must report dropped skills');
  assert.equal(tight.skills.length + tight.dropped, tight.available);
  // Whole skills are dropped; a partial rule set would be misleading guidance.
  for (const entry of tight.skills) {
    const source = full.skills.find(item => item.id === entry.id);
    assert.deepEqual(entry, source, 'an included skill must be complete');
  }
  assert.ok(BRIEF_BYTE_BUDGET >= 200);
});

test('an approved brief reaches the Hermes script prompt, is logged, and changes the job key', t => {
  const {store, skills} = setup(t);
  skills.attach();
  const family = store.saveFamily({...familyFixture, monthlyBudget: 500});
  const content = store.saveContent({familyId: family.id, title: 'How trust became money', kind: 'fiction', angle: 'Follow two invented villages through a trade that needs trust.', hook: 'Before coins existed, trust already had a price.', script: 'Draft body for the fixture.', sources: [], rightsConfirmed: true});
  store.db.prepare("INSERT INTO connectors(id,name_key,payload,secret) VALUES('c1','hermes slot',?,?)")
    .run(JSON.stringify({id: 'c1', provider: 'claude', name: 'Hermes slot', revision: 1, test: {status: 'passed'}}), Buffer.from('fixture'));
  const queue = () => store.queueScriptJob(content.id, {revision: content.revision, connectorId: 'c1', connectorRevision: 1});
  const before = queue();
  assert.equal(JSON.parse(before.input).promptInput.skills, undefined, 'no approved skill means no injection');
  assert.deepEqual(JSON.parse(before.input).skillRevisionIds, []);
  assert.equal(skills.usage().length, 0);
  approveById(skills, 'hooks.universal-3-hook');
  const after = queue();
  assert.notEqual(after.id, before.id, 'a changed approved skill set must not reuse the earlier job');
  const scope = JSON.parse(after.input);
  assert.equal(scope.promptInput.skills.skills[0].id, 'hooks.universal-3-hook');
  assert.equal(scope.skillRevisionIds.length, 1);
  // The compiled brief is really in the system prompt the provider would receive.
  const messages = scriptMessages(scope.promptInput);
  assert.match(messages[0].content, /owner-approved skill brief/);
  assert.match(messages[1].content, /hooks.universal-3-hook/);
  // Every use is recorded against the job, with the exact revision that was injected.
  const usage = skills.usage();
  assert.equal(usage.length, 1);
  assert.equal(usage[0].jobId, after.id);
  assert.equal(usage[0].taskKey, 'script.candidate');
  assert.deepEqual(usage[0].skillIds, ['hooks.universal-3-hook']);
  assert.deepEqual(usage[0].revisionIds, scope.skillRevisionIds);
  assert.ok(usage[0].injectedBytes > 0);
  // Queueing the same work twice reuses the job and does not double-count the usage.
  assert.equal(queue().id, after.id);
  assert.equal(skills.usage().length, 1);
  assert.equal(skills.effect('hooks.universal-3-hook').uses, 1);
});

test('the prompt brief never exceeds the family job token limit', t => {
  const {store, skills} = setup(t);
  skills.attach();
  // A deliberately small job limit must fail closed with an actionable message, not overspend.
  const family = store.saveFamily({...familyFixture, monthlyBudget: 500, monthlyTokenLimit: 200000, scriptTokenLimit: 1000});
  const content = store.saveContent({familyId: family.id, title: 'How trust became money', kind: 'fiction', angle: 'Follow two invented villages through a trade that needs trust.', hook: 'Before coins existed, trust already had a price.', script: 'Draft body for the fixture.', sources: [], rightsConfirmed: true});
  store.db.prepare("INSERT INTO connectors(id,name_key,payload,secret) VALUES('c1','hermes slot',?,?)")
    .run(JSON.stringify({id: 'c1', provider: 'claude', name: 'Hermes slot', revision: 1, test: {status: 'passed'}}), Buffer.from('fixture'));
  for (const id of ['hooks.universal-3-hook', 'script.spoken-standard', 'qc.output-qa']) approveById(skills, id);
  assert.throws(
    () => store.queueScriptJob(content.id, {revision: content.revision, connectorId: 'c1', connectorRevision: 1}),
    /reduce the approved skills bound to script writing/);
});

test('project state is injected and a rejected lesson is not proposed again', t => {
  const {store, skills} = setup(t);
  const family = store.saveFamily(familyFixture);
  approveById(skills, 'learning.project-state');
  const locked = skills.recordProjectState(family.id, {createdBy: 'Owner', category: 'locked', item: 'Narration stays one calm male voice.', note: 'Approved after the first audition round.'});
  skills.recordProjectState(family.id, {createdBy: 'Owner', category: 'rejected', item: 'Loud hype intro music.', note: 'Did not fit the family.'});
  const brief = skills.promptBrief('script.candidate', {familyId: family.id});
  assert.deepEqual(brief.prompt.projectState.locked, ['Narration stays one calm male voice.']);
  assert.deepEqual(brief.prompt.projectState.rejected, ['Loud hype intro music.']);
  // Project state belongs to one family, and with nothing approved or recorded there is no brief.
  assert.equal(skills.brief('script.candidate').projectState, null);
  assert.equal(skills.promptBrief('script.candidate'), null);
  skills.endProjectState(locked.id, {endedBy: 'Owner', reason: 'The family moved to a second narrator.'});
  assert.equal(skills.promptBrief('script.candidate', {familyId: family.id}).prompt.projectState.locked, undefined);
});

test('a lesson is a proposal: approving it writes a draft, never a live rule', t => {
  const {store, skills} = setup(t);
  skills.attach();
  const family = store.saveFamily(familyFixture);
  approveById(skills, 'script.spoken-standard');
  const candidate = skills.capture({
    familyId: family.id, skillId: 'script.spoken-standard', taskKey: 'script.candidate',
    source: 'script-quality-gate', sourceRef: 'job-1',
    finding: 'The quality gate blocked a candidate for opening on a different hook than the saved one.',
    evidence: ['hermes job job-1'], proposal: {kind: 'add-check', value: 'The script opens with the exact saved hook.'},
  });
  assert.equal(candidate.status, 'proposed');
  // A repeat capture for the same review does not create a second proposal.
  assert.equal(skills.capture({familyId: family.id, skillId: 'script.spoken-standard', taskKey: 'script.candidate', source: 'script-quality-gate', sourceRef: 'job-1', finding: 'Same finding again.', evidence: [], proposal: {kind: 'add-check', value: 'Duplicate.'}}).id, candidate.id);
  assert.equal(skills.lessons('proposed').length, 1);
  const approvedBefore = skills.skills().find(item => item.id === 'script.spoken-standard').approved;
  const {revision} = skills.reviewLesson(candidate.id, {reviewedBy: 'Fixture owner', action: 'approve', reason: 'The rule is right and worth keeping.'});
  assert.equal(revision.status, 'draft', 'an approved lesson must land as a draft, not as a live rule');
  assert.equal(revision.revision, 2);
  assert.equal(revision.lessonId, candidate.id);
  assert.ok(revision.skill.checks.includes('The script opens with the exact saved hook.'));
  // Runtime still serves the previously approved revision until the draft is approved on its own.
  assert.equal(skills.skills().find(item => item.id === 'script.spoken-standard').approved.id, approvedBefore.id);
  assert.deepEqual(skills.brief('script.candidate').skills[0].checks, approvedBefore.skill.checks);
  skills.approveRevision(revision.id, review);
  assert.ok(skills.brief('script.candidate').skills[0].checks.includes('The script opens with the exact saved hook.'));
  // A rejection is recorded against the family so the same finding is not proposed again.
  const second = skills.capture({familyId: family.id, skillId: 'script.spoken-standard', taskKey: 'script.candidate', source: 'scene-plan-review', sourceRef: 'plan-9', finding: 'Reviewer asked for shorter paragraphs.', evidence: [], proposal: {kind: 'add-do', value: 'Keep paragraphs under four sentences.'}});
  skills.reviewLesson(second.id, {reviewedBy: 'Fixture owner', action: 'reject', reason: 'That is a style choice, not a standing rule.'});
  assert.equal(skills.lessons('rejected').length, 1);
  assert.ok(skills.projectState(family.id).some(row => row.category === 'rejected' && row.item === 'Reviewer asked for shorter paragraphs.'));
  assert.equal(skills.capture({familyId: family.id, skillId: 'script.spoken-standard', taskKey: 'script.candidate', source: 'scene-plan-review', sourceRef: 'plan-10', finding: 'Reviewer asked for shorter paragraphs.', evidence: [], proposal: {kind: 'add-do', value: 'Keep paragraphs under four sentences.'}}), null);
  // A lesson can also propose a whole new learned skill, still as a draft.
  const fresh = skills.capture({
    familyId: family.id, taskKey: 'editing.review', source: 'style-proof-review', sourceRef: 'render-3',
    finding: 'Two style proofs failed for the same reason: the opening shot held too long.',
    evidence: ['render job render-3'],
    proposal: {
      kind: 'new-skill', value: 'Cap the opening shot length.',
      skill: {
        id: 'editing.learned-opening-cap', title: 'Cap the opening shot', rooms: ['editing'], kind: 'ruleset',
        when: 'When planning the first shot of a video.', summary: 'Two reviews rejected a long opening shot.',
        do: ['Keep the opening shot under three seconds.'], tags: ['hook'],
        source: "Learned from this program's own style-proof reviews",
      },
    },
  });
  const learned = skills.reviewLesson(fresh.id, {reviewedBy: 'Fixture owner', action: 'approve', reason: 'Seen twice; worth a rule.'});
  assert.equal(learned.revision.origin, 'learned');
  assert.equal(learned.revision.status, 'draft');
  assert.ok(!skills.brief('editing.review').skillIds.includes('editing.learned-opening-cap'));
});

test('the quality gate and the review rooms raise lesson candidates automatically', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-capture-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const store = new Store(':memory:');
  t.after(() => store.close());
  const skills = new SkillsEngine(store, {root}).attach();
  const family = store.saveFamily({...familyFixture, monthlyBudget: 500});
  const content = store.saveContent({familyId: family.id, title: 'How trust became money', kind: 'fiction', angle: 'Follow two invented villages through a trade that needs trust.', hook: 'Before coins existed, trust already had a price.', script: 'Draft body for the fixture.', sources: [], rightsConfirmed: true});
  store.db.prepare("INSERT INTO connectors(id,name_key,payload,secret) VALUES('c1','hermes slot',?,?)")
    .run(JSON.stringify({id: 'c1', provider: 'claude', name: 'Hermes slot', revision: 1, test: {status: 'passed'}}), Buffer.from('fixture'));
  const job = store.queueScriptJob(content.id, {revision: content.revision, connectorId: 'c1', connectorRevision: 1});
  store.db.prepare("UPDATE jobs SET status='running' WHERE id=?").run(job.id);
  store.db.prepare("INSERT INTO llm_usage(job_id,family_id,kind,period_month,status,reserved_tokens,created_at,updated_at) VALUES(?,?,'script','2026-10','reserved',6000,?,?)").run(job.id, family.id, new Date().toISOString(), new Date().toISOString());
  // A short script fails the format gate; the gate's own finding becomes a lesson candidate.
  const candidate = {title: 'How trust became money', angle: 'A fixture angle long enough to pass validation.', hook: 'Before coins existed, trust already had a price.', script: 'Before coins existed, trust already had a price. Far too short for long-form.', claims: [], uncertainties: []};
  store.completeScriptJob(job.id, {candidate, usage: {promptTokens: 100, completionTokens: 100, totalTokens: 200}});
  assert.equal(store.db.prepare('SELECT status FROM jobs WHERE id=?').get(job.id).status, 'quality_failed');
  const lessons = skills.lessons('proposed');
  assert.equal(lessons.length, 1);
  assert.equal(lessons[0].source, 'script-quality-gate');
  assert.equal(lessons[0].sourceRef, job.id);
  assert.equal(lessons[0].skillId, 'script.spoken-standard');
  assert.match(lessons[0].finding, /quality gate blocked a candidate/);
  assert.equal(lessons[0].status, 'proposed', 'capture must not change any skill on its own');
  assert.equal(skills.state().counts.approved, 0);
});

test('deterministic rules are applied in code, not left to the model', () => {
  // Image count: one visual per 10-15 spoken words (library 4.1).
  assert.equal(RULES.imageCount(0), 0);
  assert.equal(RULES.imageCount(120), 10);
  assert.equal(RULES.imageCount(120, 15), 8);
  assert.equal(RULES.imageCount(5), 1, 'a short passage still needs one visual');
  assert.throws(() => RULES.imageCount(-1), /Word count/);
  assert.throws(() => RULES.imageCount(100, 500), /Words per image/);
  // Beat math: the worked example from Precision OS 21.
  assert.equal(RULES.beatCount(720, 5), 144);
  assert.equal(RULES.beatCount(0, 5), 0);
  assert.throws(() => RULES.beatCount(720, 0), /Seconds per visual/);
  // Text dwell: the owner's title-card formula, with its 1.2 s floor.
  assert.equal(RULES.textDwellSeconds(1), 1.2);
  assert.equal(RULES.textDwellSeconds(6), 2.225);
  assert.ok(RULES.textDwellSeconds(3) >= 1.2);
  // Captions: 42 characters a line, 20 characters a second, 7 seconds a cue, 2 lines.
  assert.deepEqual(RULES.captionIssues({lines: ['Short line here.'], seconds: 3}), []);
  assert.match(RULES.captionIssues({lines: ['x'.repeat(50)], seconds: 5})[0], /characters; the limit is 42/);
  assert.match(RULES.captionIssues({lines: ['Readable line.'], seconds: 9}).join(' '), /at most 7 seconds/);
  assert.match(RULES.captionIssues({lines: ['Forty characters of caption text here ok'], seconds: 1}).join(' '), /characters per second/);
  assert.match(RULES.captionIssues({lines: ['One', 'Two', 'Three'], seconds: 4}).join(' '), /at most 2 lines/);
  assert.throws(() => RULES.captionIssues({lines: ['ok'], seconds: 0}), /Caption duration/);
  // Titles: 50-70 characters, and no banned filler.
  assert.deepEqual(RULES.titleIssues('How a forgotten trade route quietly rebuilt a city'), []);
  assert.match(RULES.titleIssues('Too short').join(' '), /50-70 characters/);
  assert.match(RULES.titleIssues('In this video we explain how a trade route rebuilt a city').join(' '), /banned filler phrase "in this video"/);
  // Banned phrases, raw placeholders and sentence length.
  assert.deepEqual(RULES.bannedPhraseIssues('A clean opening sentence.'), []);
  assert.equal(RULES.bannedPhraseIssues('Stay tuned, we will delve in.').length, 2);
  assert.deepEqual(RULES.placeholderIssues('A finished line with no slots.'), []);
  assert.match(RULES.placeholderIssues('Write about [YOUR NICHE] today.')[0], /Replace the raw placeholder \[YOUR NICHE\]/);
  assert.deepEqual(RULES.sentenceLengthIssues('Short enough. Also short.'), []);
  assert.match(RULES.sentenceLengthIssues(`${'word '.repeat(30)}.`)[0], /runs 30 words/);
  // Loudness: -14 LUFS with a -1.5 dBTP ceiling.
  assert.deepEqual(RULES.loudnessIssues({lufs: -14, truePeakDbtp: -1.5}), []);
  assert.deepEqual(RULES.loudnessIssues({lufs: -13.5, truePeakDbtp: -2}), []);
  assert.match(RULES.loudnessIssues({lufs: -9, truePeakDbtp: -2}).join(' '), /Integrated loudness is -9 LUFS/);
  assert.match(RULES.loudnessIssues({lufs: -14, truePeakDbtp: -0.2}).join(' '), /True peak is -0.2 dBTP/);
  assert.throws(() => RULES.loudnessIssues({lufs: 'loud', truePeakDbtp: -2}), /Integrated loudness/);
  // Mastery bundle: runtime to words, exact allocation, paragraph tiers, image holds, title variety.
  assert.equal(RULES.wordsForMinutes(60), 9300);
  assert.equal(RULES.wordsForMinutes(10, 150), 1500);
  assert.throws(() => RULES.wordsForMinutes(10, 400), /Words per minute/);
  assert.deepEqual(RULES.wordAllocationIssues({target: 1000, sections: [{words: 150}, {words: 200}, {words: 175}, {words: 250}, {words: 125}, {words: 100}]}), []);
  assert.match(RULES.wordAllocationIssues({target: 1000, sections: [{words: 150}, {words: 200}, {words: 200}, {words: 250}, {words: 150}, {words: 100}]})[0], /1050 words, not the target 1000/);
  const chapters = {target: 6000, chapters: [{words: 3000, sections: [{words: 1500}, {words: 1500}]}, {words: 3000, sections: [{words: 1000}, {words: 1900}]}]};
  assert.deepEqual(RULES.wordAllocationIssues(chapters), ["Chapter 2 sections add up to 2900 words, not the chapter's 3000."]);
  assert.throws(() => RULES.wordAllocationIssues({target: 100, sections: [{words: 0}]}), /word count/);
  assert.equal(RULES.paragraphImageCount(100), 3);
  assert.equal(RULES.paragraphImageCount(101), 6);
  assert.equal(RULES.paragraphImageCount(99, 'oil-sketch'), 3);
  assert.equal(RULES.paragraphImageCount(150, 'oil-sketch'), 5);
  assert.equal(RULES.paragraphImageCount(201, 'oil-sketch'), 15);
  assert.equal(RULES.paragraphImageCount(150, 'renaissance'), null, 'this tier asks the owner first');
  assert.equal(RULES.paragraphImageCount(0), 0);
  assert.throws(() => RULES.paragraphImageCount(50, 'unknown'), /tier style/);
  assert.equal(RULES.imageIntervalSeconds(600, 50), 12);
  assert.throws(() => RULES.imageIntervalSeconds(600, 0), /Image count/);
  assert.deepEqual(RULES.titleVariationIssues(['Quiet rain over an old library', 'A lantern walk through winter fields']), []);
  assert.match(RULES.titleVariationIssues(['Fall asleep to one', 'Fall asleep to two', 'Fall Asleep to three'])[0], /in a row open with "fall asleep"/);
  const tired = ['Drift off a', 'Calm b', 'Drift off c', 'Night d', 'Drift off e', 'Rain f', 'Drift off g', 'Snow h'];
  assert.match(RULES.titleVariationIssues(tired).join(' '), /opens 4 of 8 titles/);
});

test('skill validation rejects malformed input and keeps typed reference numbers', () => {
  assert.throws(() => validateSkill({...ownerSkill(), rooms: ['not-a-room']}), /Choose a valid room/);
  assert.throws(() => validateSkill({...ownerSkill(), tasks: ['not.a-task']}), /Choose a valid task key/);
  assert.throws(() => validateSkill({...ownerSkill(), kind: 'vibes'}), /Choose a valid skill kind/);
  assert.throws(() => validateSkill({...ownerSkill(), tags: ['Not Kebab']}), /lowercase letters, numbers and hyphens/);
  assert.throws(() => validateSkill({...ownerSkill(), do: ['same rule', 'Same Rule']}), /entries must be unique/);
  assert.throws(() => validateSkill({...ownerSkill(), summary: 'short'}), /Summary must contain/);
  assert.throws(() => validateSkill({...ownerSkill(), priority: 500}), /Priority/);
  // Task bindings fall back to the rooms the skill names.
  assert.deepEqual(validateSkill(ownerSkill()).tasks, ['script.candidate', 'script.review']);
  assert.deepEqual(validateSkill({...ownerSkill(), tasks: ['qc.review']}).tasks, ['qc.review']);
  // Ranges and tables in numbers keep their shape, as the editing-brain packs rely on them.
  const typed = validateSkill({...ownerSkill(), numbers: {range: [0.5, 0.75], flag: true, count: 12, table: {a: 1}}});
  assert.deepEqual(typed.numbers, {range: [0.5, 0.75], flag: true, count: 12, table: {a: 1}});
  assert.throws(() => validateSkill({...ownerSkill(), numbers: {bad: {a: {b: {c: {d: {e: 1}}}}}}}), /nested too deeply/);
});

test('HTTP skill routes need the local token, gate approval and expose the library in state', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-http-'));
  const protector = {transform: (operation, input) => Buffer.from([...input].reverse())};
  const {server} = createApp({dataFile: path.join(dir, 'workspace.sqlite'), worker: false, protector, voiceOptions: {ffmpeg: 'missing-ffmpeg-for-test', ffprobe: 'missing-ffprobe-for-test'}});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(() => { fs.rmSync(dir, {recursive: true, force: true}); resolve(); }); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const state = await (await fetch(`${base}/api/state`)).json();
  assert.equal(state.skills.counts.total, 400);
  assert.equal(state.skills.counts.approved, 0);
  assert.equal(state.capabilities.skills, 'drafts_only_not_injected');
  assert.deepEqual(state.skills.sourceHierarchy, SOURCE_HIERARCHY);
  assert.equal((await fetch(`${base}/skills-room.js`)).status, 200);
  const send = (url, body, token = state.token) => fetch(base + url, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Local-Token': token}, body: JSON.stringify(body)});
  const draft = state.skills.skills.find(item => item.id === 'hooks.universal-3-hook').latest;
  assert.equal((await send(`/api/skill-revisions/${draft.id}/approve`, review, 'wrong-token')).status, 403);
  const missing = await send(`/api/skill-revisions/${draft.id}/approve`, {...review, confirmations: {}});
  assert.equal(missing.status, 400);
  assert.match((await missing.json()).error, /Confirm that the/);
  assert.equal((await send(`/api/skill-revisions/${draft.id}/approve`, review)).status, 200);
  const owner = await send('/api/skills', {createdBy: 'Owner', changeNote: 'My own rule, added from the page.', skill: ownerSkill()});
  assert.equal(owner.status, 200);
  const after = await (await fetch(`${base}/api/state`)).json();
  assert.equal(after.skills.counts.approved, 1);
  assert.equal(after.skills.counts.owner, 1);
  assert.equal(after.capabilities.skills, 'approved_skills_injected');
  // Reads: the compiled brief and the export are visible for inspection.
  const brief = await (await fetch(`${base}/api/skills/brief?taskKey=script.hooks`)).json();
  assert.deepEqual(brief.skillIds, ['hooks.universal-3-hook']);
  assert.equal((await (await fetch(`${base}/api/skills/export`)).json()).skills.length, 1);
  assert.equal((await fetch(`${base}/api/skills/brief?taskKey=nope`)).status, 400);
  assert.equal((await send('/api/skill-revisions/00000000-0000-0000-0000-000000000000/approve', review)).status, 404);
  const lesson = await send('/api/skill-lessons/00000000-0000-0000-0000-000000000000/review', {reviewedBy: 'Owner', action: 'approve', reason: 'No such lesson exists.'});
  assert.equal(lesson.status, 404);
});

test('0.39: a whole pack is approved in one named review of the exact drafts shown, and scene planning gets a larger share for skills', t => {
  const {skills} = setup(t);
  const pack = 'motionmaxxing (Apache-2.0): measured motion, word timing, script cues, machine-look check';
  const drafts = skills.skills().filter(item => item.pack === pack && item.latest.status === 'draft');
  assert.equal(drafts.length, 14);
  assert.throws(() => skills.approvePack({...review, pack, revisionIds: drafts.map(item => item.latest.id), confirmations: {wordingReviewed: true}}), /Confirm that the/);
  assert.throws(() => skills.approvePack({...review, pack, revisionIds: []}), /Name the 1-500 draft revisions/);
  const other = skills.skills().find(item => item.pack !== pack);
  assert.throws(() => skills.approvePack({...review, pack, revisionIds: [other.latest.id]}), /is not in the pack/);
  // A draft changed after the reviewer opened the pack: nothing is approved.
  const first = drafts[0], changed = skills.createRevision(first.id, {createdBy: 'Fixture', changeNote: 'A newer wording to review', skill: {...first.latest.skill, summary: `${first.latest.skill.summary} Changed.`}});
  assert.throws(() => skills.approvePack({...review, pack, revisionIds: drafts.map(item => item.latest.id)}), /changed since you opened the pack/);
  assert.equal(skills.skills().filter(item => item.pack === pack && item.approved).length, 0);
  const result = skills.approvePack({...review, pack, revisionIds: [changed.id, ...drafts.slice(1).map(item => item.latest.id)]});
  assert.deepEqual(result, {approved: 14, pack});
  const approved = skills.skills().filter(item => item.pack === pack && item.approved);
  assert.equal(approved.length, 14);
  assert.ok(approved.every(item => item.approved.review.approvedBy === review.approvedBy && item.approved.review.pack === pack), 'each revision carries its own named approval');
  const brief = skills.brief('scene.plan');
  assert.equal(brief.byteBudget, 9000);
  assert.ok(brief.skillIds.includes('scene.script-cues-to-visuals') && brief.injectedBytes <= 9000);
  assert.equal(skills.brief('script.candidate').byteBudget, BRIEF_BYTE_BUDGET, 'other rooms keep the default share');
  assert.ok(!skills.brief('scene.plan').skillIds.some(id => id.startsWith('profile.')), 'channel profiles reach a family only where pinned');
});
