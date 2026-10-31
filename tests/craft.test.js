'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const C = require('../craft');
const {assessScriptQuality, scriptMessages, critiqueMessages, reviseMessages} = require('../writer');
const {Store} = require('../store');
const {createApp} = require('../server');

// Expected values were produced by the upstream Python tools (hookscore.py, title.py at a2feb21)
// on the same inputs, so the port is checked against the original, not against itself.
test('the hook scorer matches the upstream hookscore.py exactly', () => {
  const cases = [
    ['97% of the people who start a channel quit before video 30. Here is what the other 3% do differently.', 55, 'The Statistic', {specificity: 96, address: 26, stakes: 88, curiosity: 58, brevity: 100}],
    ['You are wasting $400 a month on subscriptions you forgot, and here is the 5 minute fix.', 53, 'The Reveal', {specificity: 78, address: 96, stakes: 62, curiosity: 24, brevity: 100}],
    ['Why does your bread go stale in two days when bakery bread lasts a week?', 44, 'The Question', {specificity: 34, address: 76, stakes: 22, curiosity: 59, brevity: 100}],
    ['Nobody tells you this about Tesla until it is too late.', 44, 'Contrarian Flip', {specificity: 40, address: 76, stakes: 22, curiosity: 58, brevity: 100}],
    ['In this video we will talk about some amazing tips', 27, null, {specificity: 13, address: 26, stakes: 22, curiosity: 24, brevity: 100}],
  ];
  for (const [hook, verdict, formula, properties] of cases) {
    const result = C.scoreHook(hook);
    assert.equal(result.verdict, verdict, hook);
    assert.equal(result.formula?.name ?? null, formula, hook);
    assert.deepEqual(result.properties, properties, hook);
  }
  const weak = C.scoreHook('In this video we will talk about some amazing tips');
  assert.equal(weak.band, 'weak');
  assert.equal(weak.weakest, 'specificity');
  assert.match(weak.note, /summary, not a hook/);
  assert.equal(C.scoreHook('Hola amigos, hoy vamos a ver algo', {locale: 'es-ES'}).applicable, false, 'English heuristics never score another language');
  assert.equal(C.FORMULAS.length, 21);
});

test('the title and thumbnail pairing linter matches the upstream title.py', () => {
  const cases = [
    ['The ULTIMATE guide to amazing bread', 'bread guide fast', 66, ['vague', 'no-number', 'duplicate']],
    ['I baked 30 loaves in 7 days. One rule changed everything', 'STALE BY DAY 2?', 84, ['mobile', 'vague']],
    ['How to make the BEST SOURDOUGH EVER at home in 2026 without any special equipment at all', 'this is how you do it now', 38, ['length', 'mobile', 'shouting', 'vague', 'thumb-length']],
  ];
  for (const [title, thumbnailText, score, codes] of cases) {
    const result = C.lintPackaging({title, thumbnailText});
    assert.equal(result.score, score, title);
    assert.deepEqual(result.issues.map(item => item.code), codes, title);
  }
  const spanish = C.lintPackaging({title: 'Por qué el pan se pone duro en dos días y cómo evitarlo', locale: 'es-419'});
  assert.equal(spanish.applicable, false);
  assert.deepEqual(spanish.issues.map(item => item.code), ['mobile'], 'only length is judged outside English');
});

// Three topics with longer pauses between them, 3 s per sentence.
function cues() {
  const topics = [
    ['Sourdough starter needs flour and water.', 'The starter ferments for several days.', 'Feed the starter every morning.', 'A healthy starter doubles quickly.'],
    ['Kneading builds gluten strands.', 'Stretch the dough and fold it over.', 'Gluten traps the gas from fermentation.', 'Strong gluten means an open crumb.'],
    ['Bake the loaf in a hot oven.', 'Steam keeps the crust soft at first.', 'Remove the lid to brown the crust.', 'Cool the bread before slicing it.'],
  ];
  let t = 0;
  return topics.flatMap((sentences, topic) => sentences.map((text, index) => {
    const gap = topic > 0 && index === 0 ? 0.9 : 0.2, start = t + gap;
    t = start + 3;
    return {start, end: t, text, gap, sceneStart: index === 0 && topic > 0};
  }));
}

test('chapters start at 0:00, fall on the topic changes and follow YouTube\'s rules', () => {
  const list = cues();
  const result = C.chapterize(list, {target: 3});
  assert.equal(result.valid, true, result.problems.join(' '));
  assert.deepEqual(result.chapters.map(item => item.start), [0, list[4].start, list[8].start].map(value => Math.round(value * 100) / 100));
  assert.equal(result.chapters[0].label, '0:00');
  assert.match(result.chapters[0].title, /Starter/);
  assert.match(result.text, /^0:00 /);
  assert.ok(result.chapters.every(item => item.seconds >= 10));
  const short = C.chapterize(list.slice(0, 5));
  assert.equal(short.valid, false, 'a 16-second piece cannot hold three 10-second chapters');
  assert.equal(C.chapterize(list.slice(0, 3)).valid, false);
  assert.equal(C.clock(3725), '1:02:05');
});

test('Shorts spans open on a complete thought, turn and end on a line', () => {
  const lines = [
    'Most people think bread goes stale because it dries out.',
    'And that is what the bag seems to say.',
    'But stale bread can hold almost as much water as fresh bread.',
    'The real change is starch crystallising as it cools.',
    'That is why a fridge makes bread stale three times faster.',
    'For example, a loaf kept at four degrees hardens within a day.',
    'So keep bread on the counter or freeze it the same day.',
    'It also helps to slice only what you eat.',
    'Your freezer stops the starch from crystallising almost completely.',
    'Toast a frozen slice and it tastes fresh again.',
  ];
  const list = lines.map((text, index) => ({start: index * 5, end: index * 5 + 5, text}));
  const result = C.findShorts(list);
  assert.equal(result.applicable, true);
  assert.ok(result.candidates.length >= 1);
  const best = result.candidates[0];
  assert.equal(best.firstLine, lines[0], 'the best span opens on the complete claim');
  assert.ok(best.seconds >= 20 && best.seconds <= 55);
  assert.match(best.turnLine, /^But stale bread/);
  for (const item of result.candidates) assert.doesNotMatch(item.firstLine, /^(And|So|It|That)\b/, 'a span never opens leaning on the sentence before it');
  for (let i = 0; i < result.candidates.length; i++) for (let j = i + 1; j < result.candidates.length; j++) {
    const a = result.candidates[i], b = result.candidates[j];
    assert.ok(a.end <= b.start || a.start >= b.end, 'candidates do not overlap');
  }
  assert.equal(C.findShorts(list, {locale: 'it-IT'}).applicable, false);
});

test('outliers are multiples of the channel median and need four videos', () => {
  const videos = [100, 200, 300, 400, 5000].map((views, index) => ({videoId: `v${index}`, views, title: `${index + 3} mistakes that cost you money`}));
  const result = C.outlierMultiples(videos);
  assert.equal(result.median, 300);
  assert.equal(result.videos.find(item => item.videoId === 'v4').multiple, 16.67);
  assert.equal(result.videos[0].formula, 'The List');
  const baseline = C.outlierMultiples(videos, {baseline: videos.slice(0, 4)});
  assert.equal(baseline.median, 250, 'known outliers stay out of the median');
  const thin = C.outlierMultiples(videos.slice(0, 3));
  assert.equal(thin.enough, false);
  assert.ok(thin.videos.every(item => item.multiple === null));
});

test('a retention export names the hook leak, the cliffs with what was said, the slide and one fix', () => {
  const rows = ['Video position (%),Absolute audience retention (%)'];
  for (let x = 0; x <= 100; x += 5) rows.push(`${x},"${x === 0 ? 100 : x <= 10 ? 100 - x * 3 : x <= 50 ? 70 - (x - 10) * 0.2 : 62 - (x - 50) * 0.2 - (x >= 55 ? 9 : 0)}%"`);
  const narration = [{start: 0, end: 60, text: 'The opening.'}, {start: 60, end: 66, text: 'Now a long sponsor message about our partners.'}, {start: 66, end: 120, text: 'The rest.'}];
  const result = C.analyseRetention(rows.join('\n'), {durationSeconds: 120, cues: narration});
  assert.equal(result.ok, true);
  assert.equal(result.axis, 'percent');
  assert.equal(result.hookLeak, 33, "100% at the start, 67% at 30 s (25% of a 120 s video)");
  assert.equal(result.verdict, 'leaking');
  assert.match(result.fix, /Fix the opening first/);
  const cliff = result.cliffs.find(item => item.from === 50);
  assert.ok(cliff, 'the sudden drop after half way is a cliff');
  assert.equal(cliff.atSeconds, 60);
  assert.match(cliff.said, /sponsor message/);
  assert.equal(C.analyseRetention('a,b\n1,2').ok, false);
  // A healthy opening moves the one fix to the worst cliff.
  const flat = Array.from({length: 21}, (_, i) => `${i * 5},${100 - i * 0.5 - (i >= 11 ? 9 : 0)}`);
  const healthy = C.analyseRetention(flat.join('\n'), {durationSeconds: 120, cues: narration});
  assert.equal(healthy.verdict, 'healthy');
  assert.match(healthy.fix, /Look at 1:00|Look at 60 s/);
});

test('the writing voice blocks banned words in candidates and reaches the writer; the hook score only advises', () => {
  const voice = {audiencePerson: 'A first-time home baker.', neverWords: ['unlock', "let's dive in"], ownPhrases: ['crumb check'], refusedClaims: ['income figures'], formatNotes: 'No intro.'};
  assert.deepEqual(C.neverWordsUsed("Let's dive in and unlock the secret.", voice), ['unlock', "let's dive in"]);
  assert.deepEqual(C.neverWordsUsed('The door was unlocked.', voice), [], 'a banned word inside a longer word is not a match');
  const hook = 'Why does your bread go stale in two days when bakery bread lasts a week?';
  const paragraph = Array.from({length: 40}, (_, index) => `word${index}`).join(' ');
  const candidate = {title: 'Stale by day two', hook, script: [`${hook} ${paragraph} unlock`, paragraph].join('\n\n')};
  const blocked = assessScriptQuality(candidate, 'shorts', 'en-US', voice);
  assert.ok(blocked.issues.some(issue => /never uses: unlock/.test(issue)));
  const free = assessScriptQuality({...candidate, script: candidate.script.replace(' unlock', '')}, 'shorts', 'en-US', voice);
  assert.ok(!free.issues.some(issue => /never uses/.test(issue)));
  assert.equal(free.hook.verdict, 44);
  assert.equal(free.hook.band, 'weak');
  const messages = scriptMessages({family: {format: 'shorts', locale: 'en-US', writingVoice: voice}, content: {kind: 'fiction'}, sources: []});
  assert.match(messages[0].content, /never use any of its neverWords/);
  assert.match(messages[1].content, /crumb check/);
  assert.doesNotMatch(scriptMessages({family: {format: 'shorts', locale: 'en-US'}, content: {kind: 'fiction'}, sources: []})[0].content, /writing voice/);
});

// 0.77 (owner review 2026-10-31: an 82-word hook scored weak and the writer was never told why): the writer gets the
// hook rules and the order of a script; the second writer and the revision see what the free checks found.
test('the writer is told how a script is built, and the revision sees what the checks found', () => {
  const input = {family: {format: 'long-form', locale: 'en-US'}, content: {kind: 'fiction'}, sources: []};
  const system = scriptMessages(input)[0].content;
  for (const rule of [/9-24 words/, /\(2\) PROMISE/, /\(4\) RE-HOOK/, /\(5\) PAYOFF/, /Exactly one call to action, after 60%/]) assert.match(system, rule);
  const hook = 'Imagine a world thousands of years ago, long before banks or coins, where a group of cavemen sat around a fire and decided that a shiny rock was worth more than a whole basket of berries.';
  const draft = {title: 'Stone money', angle: 'How trade began', hook, script: `${hook} ${'The tribe traded stones for meat. '.repeat(30)}\n\nThat is how it went.`, claims: [], uncertainties: []};
  const critique = critiqueMessages(input, draft);
  assert.match(critique[0].content, /judge the draft against them: HOW TO WRITE IT/);
  assert.match(critique[1].content, /Hook scored \d+ \(weak\); weakest: brevity\. Use 9 to 24 words/);
  assert.match(critique[1].content, /A promise in the first minute/);
  const revise = reviseMessages(input, draft, {verdict: 'Tighten it.', keep: [], fixes: [], hooks: [], facts: [], additions: []});
  assert.match(revise[1].content, /CRAFT CHECKS FOUND IN YOUR DRAFT \(fix every one\):\n- Hook scored/);
  // A strong draft adds no notes.
  const good = 'You lose $40 every week on stale bread, but nobody tells you why bakery bread lasts 7 days.';
  assert.doesNotMatch(critiqueMessages(input, {...draft, hook: good, script: `${good} x`})[1].content, /Hook scored/);
});

test('families store a validated writing voice and drafts carry craft advice', t => {
  const store = new Store(':memory:');
  t.after(() => store.close());
  const base = {name: 'Bread Science', tier: 'A', countries: ['United States'], audience: 'Home bakers who want to understand their bread.', niche: 'Bread science', locales: ['en-US'], timezone: 'Asia/Karachi', monthlyBudget: 10, cadence: 2, format: 'long-form'};
  for (const writingVoice of [{neverWords: 'unlock'}, {neverWords: Array.from({length: 41}, (_, index) => `w${index}`)}, {audiencePerson: 'x'.repeat(401)}, ['unlock']])
    assert.throws(() => store.saveFamily({...base, writingVoice}), /list|at most|400|JSON object/);
  const family = store.saveFamily({...base, writingVoice: {audiencePerson: ' A first-time home baker. ', neverWords: ['unlock', 'Unlock', 'game-changer'], ownPhrases: [], refusedClaims: []}});
  assert.deepEqual(family.writingVoice.neverWords, ['unlock', 'game-changer'], 'duplicates collapse case-insensitively');
  assert.equal(family.writingVoice.audiencePerson, 'A first-time home baker.');
  assert.equal(store.saveFamily({...base, name: 'No voice', writingVoice: {neverWords: [], audiencePerson: ''}}).writingVoice, null, 'an empty voice is no voice');
  const content = store.saveContent({familyId: family.id, title: 'Why bread goes stale in 2 days', kind: 'fiction', angle: 'An original kitchen experiment shows the starch change.', hook: 'Unlock the secret of bread that stays soft for you all week long.', script: '', sources: [], rightsConfirmed: false});
  const draft = store.contents().find(item => item.id === content.id);
  assert.deepEqual(draft.craft.neverWords, ['unlock']);
  assert.equal(draft.craft.hook.applicable, true);
  assert.equal(draft.craft.title.applicable, true);
  assert.ok(!draft.reviewIssues.some(issue => /never uses/.test(issue)), 'advice on the owner\'s own draft never blocks review');
});

test('the craft check route needs the local token and bounds its input', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'craft-route-'));
  const {server} = createApp({dataFile: path.join(dir, 'workspace.sqlite'), worker: false, protector: {transform: (op, input) => Buffer.from([...input].reverse())}, voiceOptions: {ffmpeg: 'missing-ffmpeg-for-test', ffprobe: 'missing-ffprobe-for-test'}});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(() => { fs.rmSync(dir, {recursive: true, force: true}); resolve(); }); setImmediate(() => server.closeAllConnections()); }));
  const base = `http://127.0.0.1:${server.address().port}`, {token} = await (await fetch(`${base}/api/state`)).json();
  const body = JSON.stringify({title: 'The ULTIMATE guide to amazing bread', thumbnailText: 'bread guide fast', hook: 'x'.repeat(5000)});
  assert.equal((await fetch(`${base}/api/craft/check`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body})).status, 403);
  const response = await fetch(`${base}/api/craft/check`, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Local-Token': token}, body});
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.packaging.score, 66);
  assert.equal(result.hook.applicable, true);
  assert.equal((await fetch(`${base}/api/content/00000000-0000-0000-0000-000000000000/retention`, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Local-Token': token}, body: JSON.stringify({csv: 'x'.repeat(30)})})).status, 404);
});

// 0.73 (owner review 2026-10-30: "length 78, from where those numbers came?"): every hook number says what it read.
test('each hook score explains itself from the hook line alone', () => {
  const plain = C.scoreHook('A casino opened in the stone age');
  assert.deepEqual([plain.words, plain.properties.brevity, plain.properties.address, plain.properties.specificity], [7, 78, 26, 34]);
  assert.match(plain.why.brevity, /^7 words; a spoken hook fits 9 to 24 words/);
  assert.match(plain.why.address, /Never says "you", so it stays at the base score/);
  assert.match(plain.why.specificity, /No number, name or date/);
  const strong = C.scoreHook('Why would you risk 3 years of savings on a casino in Rome?');
  assert.match(strong.why.address, /Says you in the first six words/);
  assert.match(strong.why.stakes, /risk/);
  assert.equal(strong.why.specificity, 'Found 3, Rome.');
  assert.match(strong.why.curiosity, /\(why\) and ends with a question mark/);
});
