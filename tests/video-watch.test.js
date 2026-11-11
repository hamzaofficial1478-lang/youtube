'use strict';
// 0.107 (owner request 2026-11-11, after bradautomates/claude-video): the program watches competitor videos - Gemini
// from the YouTube link, never a download - or a file the owner saved (frames read by Claude or ChatGPT), writes one
// document per subject the owner ticked for that channel, and turns every watched video into a roadmap that, approved
// by name, leads this family's jobs as pinned skills.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const W = require('../watch');
const G = require('../gemini');
const {Store} = require('../store');
const {ConnectorSlots} = require('../connectors');
const {QuotaLedger} = require('../intel-sources');
const {StyleLibrary} = require('../style');
const {CompetitorIntelligence} = require('../competitor-intel');
const {SkillsEngine, validateSkill} = require('../skills');
const {VideoWatcher} = require('../video-watch');

const hasFFmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], {stdio: 'ignore'}); execFileSync('ffprobe', ['-version'], {stdio: 'ignore'}); return true; } catch { return false; } })();
const protector = {transform: (operation, input) => Buffer.from([...input].reverse())};
const KEY = 'AIzaFAKEgeminiKEY0123456789abcdefghijk';
const C1 = 'UCabcdefghijklmnopqrstuv';

// A study the watcher could give: every ticked subject, a timeline, retention and where to beat it.
function study(subjects, extra = {}) {
  return {
    summary: 'A stone-age money story told as a chase: a hook on a single shell, then three turns, each ending on a question.',
    title: 'Why shells became money', format: 'long', durationSeconds: 600,
    timeline: [
      {from: '00:00', to: '00:08', part: 'hook', seen: 'A single shell in a hand, hard light', heard: 'A question about what makes money', technique: 'one object, one question'},
      {from: '00:08', to: '01:10', part: 'setup', seen: 'Map of trade routes', heard: 'Who traded with whom', technique: 'map flies in on the place name'},
      {from: '05:00', to: '05:20', part: 'rehook', seen: 'Cut to black, one word', heard: 'But then it broke', technique: 'pattern interrupt'},
    ],
    subjects: Object.fromEntries(subjects.map(key => [key, {verdict: `How they handle ${key}.`, steps: [`Do ${key} step one with a number: 3 s`, `Do ${key} step two`], observations: [{at: '00:04', what: `${key} moment`, why: 'it lands on the word'}], numbers: {'seconds to promise': '9 s'}}])),
    retention: [{at: '05:00', kind: 'regrab', what: 'cut to black', why: 'silence after noise'}, {at: '07:30', kind: 'drop', what: 'long list', why: 'no picture change for 20 s'}],
    beat: [{at: '07:30', weakness: 'a list read over one still', howWeBeatIt: 'show each item as it is named'}],
    unavailable: [],
    ...extra,
  };
}
// A fake Google: the model list for the connection test, the interactions endpoint and the Files API.
function google({answer = () => study(['hooks']), status = 200} = {}) {
  const calls = [];
  const fetch = async (url, options = {}) => {
    calls.push({url, method: options.method || 'GET', headers: options.headers || {}, body: options.body, redirect: options.redirect});
    const json = (data, code = 200, headers = {}) => new Response(JSON.stringify(data), {status: code, headers: {'content-type': 'application/json', ...headers}});
    if (url.endsWith('/v1beta/models?pageSize=50')) return json({models: [{name: 'models/gemini-3.7-flash'}, {name: 'models/gemini-3.7-pro'}]});
    if (url.endsWith('/v1beta/interactions')) {
      if (status !== 200) return json({error: {message: `refused for key ${KEY}`}}, status);
      const body = JSON.parse(options.body);
      return json({status: 'completed', steps: [{type: 'thought'}, {type: 'model_output', content: [{type: 'text', text: `Here is the study:\n\`\`\`json\n${JSON.stringify(answer(body))}\n\`\`\``}]}], usage: {total_tokens: 180000}});
    }
    if (url.endsWith('/upload/v1beta/files')) return new Response('{}', {status: 200, headers: {'x-goog-upload-url': 'https://generativelanguage.googleapis.com/upload/v1beta/files?upload_id=abc'}});
    if (url.includes('upload_id=abc')) return json({file: {name: 'files/f1', uri: 'https://generativelanguage.googleapis.com/v1beta/files/f1', state: 'PROCESSING', mimeType: 'video/mp4'}});
    if (url.endsWith('/v1beta/files/f1') && options.method === 'GET') return json({name: 'files/f1', uri: 'https://generativelanguage.googleapis.com/v1beta/files/f1', state: 'ACTIVE', mimeType: 'video/mp4'});
    if (url.endsWith('/v1beta/files/f1') && options.method === 'DELETE') return json({});
    throw new Error(`Unexpected request to ${url}`);
  };
  return {fetch, calls};
}

test('watch.js: frame budget, frame times where shots change, transcripts and measured numbers', () => {
  assert.deepEqual([W.frameTarget(10), W.frameTarget(25), W.frameTarget(50), W.frameTarget(150), W.frameTarget(500), W.frameTarget(3600)], [12, 25, 40, 60, 80, 100]);
  // Fewer than eight cuts: read evenly.
  assert.equal(W.frameTimes([3, 9], 60).length, 40);
  // Many cuts: one frame just after each, thinned to the target with the first and last kept, gaps filled.
  const cuts = Array.from({length: 200}, (_, k) => k * 2 + 1);
  const many = W.frameTimes(cuts, 420);
  assert.equal(many.length, 80);
  assert.ok(many[0] === 0.3 && many.at(-1) <= 419.8 && many.every((t, k) => !k || t > many[k - 1]));
  const sparse = W.frameTimes([1, 2, 3, 4, 5, 6, 7, 8, 9], 200);
  assert.equal(sparse.length, 80, 'a long hold after the last cut is filled');
  assert.ok(sparse.filter(t => t > 20).length > 60);
  const srt = W.parseTranscript('1\n00:00:01,000 --> 00:00:04,000\nWhat made a shell\nworth a cow?\n\n2\n00:00:04,000 --> 00:00:09,500\nNobody agreed, until one island did.');
  assert.deepEqual(srt.cues.map(cue => [cue.start, cue.end]), [[1, 4], [4, 9.5]]);
  assert.equal(srt.cues[0].text, 'What made a shell worth a cow?');
  assert.ok(srt.timed);
  const vtt = W.parseTranscript('WEBVTT\n\n00:01.000 --> 00:03.000\n<c>Hello</c> there\n');
  assert.deepEqual(vtt.cues, [{start: 1, end: 3, text: 'Hello there'}]);
  const lines = W.parseTranscript('[00:00] First line here\n[00:12] Second line\n[1:02:03] Late line');
  assert.deepEqual(lines.cues.map(cue => [cue.start, cue.end]), [[0, 12], [12, 3723], [3723, null]]);
  const plain = W.parseTranscript('Just words with no times at all.');
  assert.deepEqual([plain.timed, plain.words], [false, 7]);
  const measured = W.measure({duration: 120, cuts: [2, 4, 6, 8, 40, 80], transcript: srt, colours: ['#FFFFFF']});
  assert.deepEqual([measured.shots, measured.medianShotSeconds, measured.cutsInFirst30s, measured.wordsPerMinute, measured.wordsInFirst15s, measured.colours], [7, 2, 4, 7, 13, ["#FFFFFF"]]);
  // The watch request: ticked subjects in depth, the program's own subjects always, the facts given.
  const prompt = W.geminiPrompt({video: {title: 'Why shells became money', url: 'https://www.youtube.com/watch?v=abcdefghijk'}, subjects: ['hooks', 'music'], measured});
  assert.match(prompt, /- hooks: The first 30 seconds/);
  assert.match(prompt, /- music: Sound/);
  assert.match(prompt, /- retention \(always\)/);
  assert.match(prompt, /- beat \(always\)/);
  assert.doesNotMatch(prompt, /- captions:/);
  assert.match(prompt, /Cite an MM:SS/);
  assert.match(prompt, /"medianShotSeconds":2/);
  assert.match(prompt, /untrusted data/);
});

test('watch.js: a study is read leniently, and fails only when nothing usable is in it', () => {
  const {breakdown, warnings} = W.readBreakdown({...study(['hooks', 'pacing']), subjects: {...study(['hooks', 'pacing']).subjects, ghosts: {verdict: 'x'}}, timeline: [...study([]).timeline, {from: '45:00', seen: 'after the end'}]}, {subjects: ['hooks', 'pacing', 'music'], duration: 600});
  assert.deepEqual(Object.keys(breakdown.subjects), ['hooks', 'pacing']);
  assert.equal(breakdown.timeline.length, 3, 'a moment after the end is left out');
  assert.deepEqual([breakdown.timeline[2].from, breakdown.retention[1].kind, breakdown.beat[0].at], [300, 'drop', 450]);
  assert.ok(warnings.some(item => /ghosts/.test(item)) && warnings.some(item => /music: the watcher said nothing/.test(item)) && warnings.some(item => /after the end/.test(item)));
  assert.throws(() => W.readBreakdown({summary: '', timeline: [], subjects: {}}, {subjects: ['hooks']}), /not usable: no summary; only 0 timeline entries.*only 0 of the 1/);
  assert.throws(() => W.readBreakdown('words', {}), /not a JSON study/);
  assert.deepEqual(W.jsonOf('Sure!\n```json\n{"a": 1}\n```'), {a: 1});
});

test('watch.js: the roadmap keeps ticked processes, drops copied instructions and becomes pin-only skills', () => {
  const words = 'when the shell broke in half the whole island stopped trading for a year';
  const raw = {
    summary: 'Open on one object, chase one question, show every item as it is named.',
    processes: [
      {process: 'script', subjects: ['hooks'], goal: 'A hook that names the object and the question within 9 seconds.', steps: ['Open on one object and one question within 9 s (V1 00:00).', `Say: ${words}`], do: ['Name a number in the first 15 s'], avoid: ['A slow list over one picture'], checks: ['Is the question asked by 0:09?'], numbers: {'seconds to promise': '9 s'}, beat: ['Pay the promise by 2:00, earlier than V1'], own: ['Our own recurring object motif', 'A viewer question at each turn'], evidence: ['V1 00:00', 'V9 01:00']},
      {process: 'sound', added: true, why: 'Every video drops the music before the turn.', goal: 'Silence before each turn.', steps: ['Drop the music 1 s before a turn.'], own: ['Our own sting'], beat: ['A softer return']},
      {process: 'dance', steps: ['x']},
    ],
    missed: [{subject: 'sound design', why: 'Silence before each turn in every video.', process: 'sound'}],
  };
  const {roadmap, warnings} = W.readRoadmap(raw, {required: ['script', 'storyboard'], refs: ['V1', 'V2'], references: [{id: 'V1', transcript: `Then he said ${words} and walked off.`}]});
  assert.deepEqual(roadmap.processes.map(item => [item.process, item.added]), [['script', false], ['sound', true]]);
  assert.equal(roadmap.processes[0].steps.length, 1, 'the instruction sharing eight words with the transcript is left out');
  assert.deepEqual(roadmap.processes[0].evidence, ['V1 00:00'], 'unknown video refs dropped');
  assert.ok(warnings.some(item => /unknown process "dance"/.test(item)) && warnings.some(item => /Storyboard and pictures was ticked/.test(item)) && warnings.some(item => /copy guard left out 1/.test(item)));
  assert.equal(roadmap.missed[0].process, 'sound');
  assert.throws(() => W.readRoadmap({processes: []}), /no usable process/);
  const skills = W.roadmapSkills(roadmap, {familyId: '1a2b3c4d-0000-4000-8000-000000000000', familyName: 'Money History', revision: 2, approvedBy: 'Hasnain', date: '2026-11-11', videos: 2});
  assert.deepEqual(skills.map(skill => skill.id), ['roadmap.f1a2b3c4d-script', 'roadmap.f1a2b3c4d-sound']);
  for (const skill of skills) assert.equal(validateSkill(skill).id, skill.id, 'each skill passes the skills engine\'s own check');
  assert.ok(skills.every(skill => skill.pinOnly && skill.priority === 95));
  assert.deepEqual(skills[0].tasks, ['script.candidate', 'script.hooks', 'script.review']);
  assert.ok(skills[0].do.includes('Do better than the competitors: Pay the promise by 2:00, earlier than V1') && skills[0].do.includes('Our own: Our own recurring object motif'));
  assert.match(skills[0].source, /r2 for Money History, from 2 watched video\(s\); approved by Hasnain on 2026-11-11/);
});

test('gemini.js: watches a YouTube link with the key in a header only, names refusals, uploads and deletes a file', async () => {
  assert.equal(G.videoId('https://youtu.be/abcdefghijk?t=4'), 'abcdefghijk');
  assert.equal(G.videoId('https://www.youtube.com/watch?app=desktop&v=abcdefghijk'), 'abcdefghijk');
  assert.equal(G.videoId('https://www.youtube.com/shorts/abcdefghijk'), 'abcdefghijk');
  assert.equal(G.videoId('https://evil.example/watch?v=abcdefghijk'), null);
  const net = google({answer: () => ({ok: true})});
  const client = new G.GeminiClient(KEY, net.fetch, {sleep: async () => {}});
  const reply = await client.ask({video: {uri: G.watchUrl('abcdefghijk')}, prompt: 'Study it', model: 'gemini-3.7-flash'});
  assert.deepEqual(W.jsonOf(reply.text), {ok: true});
  assert.equal(reply.tokens, 180000);
  const sent = JSON.parse(net.calls[0].body);
  assert.deepEqual(sent.input[0], {type: 'video', uri: 'https://www.youtube.com/watch?v=abcdefghijk', processing: 'agentic'});
  assert.equal(sent.model, 'gemini-3.7-flash');
  assert.ok(net.calls.every(call => call.headers['x-goog-api-key'] === KEY && call.redirect === 'error' && !call.url.includes(KEY)));
  // A refusal says what it is and never shows the key.
  for (const [code, pattern] of [[401, /refused the API key/], [429, /rate-limited/], [400, /refused this video/], [503, /server error/]]) {
    await assert.rejects(new G.GeminiClient(KEY, google({status: code}).fetch).ask({video: {uri: 'x'}, prompt: 'p'}), error => pattern.test(error.message) && !error.message.includes(KEY), String(code));
  }
  await assert.rejects(new G.GeminiClient(KEY, async () => { throw new TypeError('fetch failed'); }).ask({video: {uri: 'x'}, prompt: 'p'}), /Gemini could not be reached from this PC/);
  await assert.rejects(client.call('GET', 'https://evil.example/v1beta/models'), /outside generativelanguage/);
  // A file: resumable upload, waited for until processed, then deleted.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gem-'));
  const file = path.join(dir, 'clip.mp4');
  fs.writeFileSync(file, Buffer.alloc(2048, 1));
  const files = google();
  const up = new G.GeminiClient(KEY, files.fetch, {sleep: async () => {}});
  assert.deepEqual(await up.upload(file), {name: 'files/f1', uri: 'https://generativelanguage.googleapis.com/v1beta/files/f1', mime_type: 'video/mp4'});
  assert.equal(files.calls[0].headers['X-Goog-Upload-Header-Content-Length'], '2048');
  assert.equal(files.calls[1].headers['X-Goog-Upload-Command'], 'upload, finalize');
  assert.equal(await up.remove('files/f1'), null);
  assert.equal(files.calls.at(-1).method, 'DELETE');
  fs.rmSync(dir, {recursive: true, force: true});
});

function setup(t, net) {
  const store = new Store(':memory:');
  t.after(() => store.close());
  const connectors = new ConnectorSlots(store, protector, net.fetch);
  const quota = new QuotaLedger(store), styles = new StyleLibrary(store);
  const intel = new CompetitorIntelligence(store, connectors, quota, styles);
  const skills = new SkillsEngine(store, {root: path.join(__dirname, '..'), builtinApproved: false}).attach();
  const family = store.saveFamily({name: 'Money History', tier: 'A', countries: ['United States'], audience: 'Curious adults who like money history told as stories.', niche: 'Origins of money', locales: ['en-US'], timezone: 'Asia/Karachi', monthlyBudget: 50, cadence: 2, format: 'long-form', monthlyTokenLimit: 900000, scriptTokenLimit: 8000, researchTokenLimit: 8000,
    competitors: [`https://www.youtube.com/channel/${C1}`, 'https://www.youtube.com/@CoinOrigins']});
  const other = store.saveFamily({name: 'Other family', tier: 'B', countries: ['United States'], audience: 'Someone else entirely, with other tastes.', niche: 'Gardening', locales: ['en-US'], timezone: 'Asia/Karachi', monthlyBudget: 50, cadence: 2, format: 'long-form', monthlyTokenLimit: 900000, scriptTokenLimit: 8000, researchTokenLimit: 8000});
  const keys = family.competitors.map(item => `${item.kind}:${item.value.toLowerCase()}`);
  const vid = k => `vid${String(k).padStart(8, '0')}`;
  const result = {retrievedAt: new Date().toISOString(), usage: {nexlev: 3, youtube: 0}, channels: [
    {ref: 'C1', competitorKey: keys[0], status: 'ok', errors: [], nexlev: {about: {title: 'Coin Stories'}, outliers: [{videoId: vid(1), title: 'Shells: the first money', views: 900000, outlierScore: 9, durationSeconds: 640}], videos: [{videoId: vid(2), title: 'A short', views: 2000000, durationSeconds: 40}, {videoId: vid(3), title: 'Salt wages', views: 300000, durationSeconds: 700}, {videoId: vid(4), title: 'Iron bars', views: 100000, durationSeconds: 650}], transcripts: []}},
    {ref: 'C2', competitorKey: keys[1], status: 'ok', errors: [], nexlev: null, youtube: {title: 'Coin Origins', videos: [{videoId: vid(5), title: 'YouTube raw title', views: '5000', durationSeconds: 500}]}},
  ]};
  store.db.prepare("INSERT INTO competitor_scans(id,family_id,family_revision,status,scope,result,created_by,created_at,updated_at) VALUES('scan1',?,?,'completed','{}',?,'Owner',?,?)").run(family.id, family.revision, JSON.stringify(result), new Date().toISOString(), new Date().toISOString());
  const make = (provider, key) => {
    const slot = connectors.save({name: `${provider} fixture`, provider, notes: '', ...(key ? {key} : {})});
    const row = connectors.row(slot.id), payload = JSON.parse(row.payload);
    payload.test = {status: 'passed', at: new Date().toISOString(), message: 'fixture'};
    store.db.prepare('UPDATE connectors SET payload=? WHERE id=?').run(JSON.stringify(payload), slot.id);
    return {id: slot.id, revision: slot.revision};
  };
  return {store, connectors, quota, intel, skills, family, other, keys, vid, make};
}

test('the watcher picks each channel\'s best videos, Gemini watches them once from the link, by the ticked subjects', async t => {
  const net = google({answer: body => study(body.input[1].text.includes('- captions:') ? W.SUBJECTS : ['hooks', 'music'])});
  const {store, connectors, quota, intel, skills, family, keys, vid} = setup(t, net);
  const slot = connectors.save({name: 'Gemini', provider: 'gemini', key: KEY});
  const tested = await connectors.test(slot.id, slot.revision);
  assert.match(tested.connector.test.message, /lists 2 model\(s\) \(gemini-3.7-flash, gemini-3.7-pro\)/);
  const gemini = {id: slot.id, revision: tested.connector.revision};
  intel.savePicks(family.id, {createdBy: 'Hasnain', expectedRevision: 0, picks: {[keys[0]]: ['hooks', 'music']}});
  intel.saveSettings(family.id, {...intel.settings(family.id), watchPerChannel: 2, revision: 0});
  const watcher = new VideoWatcher(store, {connectors, quota, intel, ai: null, renders: null, skills, fetch: net.fetch});
  const [first, second] = watcher.candidates(family.id);
  assert.deepEqual(first.videos.map(video => [video.videoId, !!video.preTicked]), [[vid(1), true], [vid(3), true], [vid(4), false], [vid(2), false]], 'outliers first, long videos before a short for a long-form channel, two ticked');
  assert.deepEqual(first.subjects, ['hooks', 'music']);
  assert.equal(second.subjects.length, 14, 'nothing ticked for a channel: every subject');
  assert.equal(second.videos[0].sendTitle, false, 'a YouTube title is display-only without the derived-use approval');
  assert.throws(() => watcher.queue(family.id, {requestedBy: 'Hasnain', connector: gemini, videos: [{url: 'https://example.com/v'}]}), /YouTube video link/);
  const queued = watcher.queue(family.id, {requestedBy: 'Hasnain', connector: gemini, videos: [{videoId: vid(1), competitorKey: keys[0]}, {videoId: vid(5), competitorKey: keys[1]}, {url: 'https://youtu.be/abcdefghijk', title: 'My pick'}]});
  assert.deepEqual(queued, {queued: 3, skipped: 0});
  assert.throws(() => watcher.queue(family.id, {requestedBy: 'Hasnain', connector: gemini, videos: [{videoId: vid(1)}]}), /already watched or is waiting/);
  const rows = store.db.prepare('SELECT title, subjects FROM competitor_video_watches ORDER BY created_at, rowid').all();
  assert.deepEqual(rows.map(row => row.title), ['Shells: the first money', `Video ${vid(5)}`, 'My pick']);
  // One at a time, each once.
  const done = await watcher.processNext();
  assert.equal(done.status, 'watched', done.error);
  assert.deepEqual(done.summary.subjects, ['hooks', 'music']);
  const asked = JSON.parse(net.calls.find(call => call.url.endsWith('/interactions')).body);
  assert.equal(asked.input[0].uri, `https://www.youtube.com/watch?v=${vid(1)}`, 'Gemini is given the link; nothing is downloaded');
  assert.match(asked.input[1].text, /- hooks:.*\n- music:/s);
  assert.equal(done.usage.gemini, 180000);
  assert.equal(quota.summary().gemini.used, 1);
  const full = watcher.watch(done.id);
  assert.equal(full.result.timeline.length, 3);
  const doc = watcher.document('watch', done.id);
  assert.ok(doc.data.subarray(0, 2).toString() === 'PK' && /study\.docx$/.test(doc.name));
  await watcher.processNext(); await watcher.processNext();
  assert.equal(await watcher.processNext(), null, 'never retried by itself');
  const second2 = watcher.state().families[family.id].watches.find(item => item.videoId === vid(5));
  assert.equal(second2.title, 'Why shells became money', 'a title only Gemini saw replaces "Video <id>"');
  assert.ok(watcher.state().families[family.id].candidates[0].videos.find(video => video.videoId === vid(1)).watched);
  // The Gemini allowance is counted; over it, a watch waits as blocked, nothing sent.
  quota.saveSettings({...quota.settings(), geminiHourlyRequestCap: 3});
  watcher.queue(family.id, {requestedBy: 'Hasnain', connector: gemini, videos: [{videoId: vid(3), competitorKey: keys[0]}]});
  const before = net.calls.length;
  assert.equal(await watcher.processNext(), null);
  assert.equal(net.calls.length, before);
  assert.equal(store.db.prepare("SELECT status FROM competitor_video_watches WHERE video_id=?").get(vid(3)).status, 'blocked_quota');
  // A refusal Gemini answers is a plain failure with its reason; a lost connection is retried by NetRetry later.
  const refused = google({status: 403});
  const watcher2 = new VideoWatcher(store, {connectors, quota, intel, ai: null, renders: null, skills, fetch: refused.fetch});
  quota.saveSettings({...quota.settings(), geminiHourlyRequestCap: 20});
  watcher2.retry(store.db.prepare("SELECT id FROM competitor_video_watches WHERE video_id=?").get(vid(3)).id);
  const failed = await watcher2.processNext();
  assert.equal(failed.status, 'failed');
  assert.match(failed.error, /Gemini refused the API key/);
  assert.ok(!failed.error.includes(KEY));
});

test('a roadmap from the watched videos is approved by name and leads only this family\'s jobs', async t => {
  const net = google({answer: () => study(['hooks', 'music'])});
  const {store, connectors, quota, intel, skills, family, other, keys, vid, make} = setup(t, net);
  const gemini = make('gemini', KEY), claude = make('claude', 'sk-ant-api03-fixture-0123456789abcdefghijklmnop');
  intel.savePicks(family.id, {createdBy: 'Hasnain', expectedRevision: 0, picks: {[keys[0]]: ['hooks', 'music']}});
  const calls = [];
  const roadmap = {
    summary: 'Open on one object, chase one question, drop the music before each turn.',
    processes: [
      {process: 'script', subjects: ['hooks'], goal: 'Name the object and the question within 9 s.', steps: ['Open on one object and one question within 9 s (V1 00:00).', 'Turn every 90 s with a question.'], do: ['Name a number in the first 15 s.'], avoid: ['A list over one still.'], checks: ['Is the question asked by 0:09?'], numbers: {'seconds to promise': '9 s'}, beat: ['Pay the promise by 2:00.'], own: ['A recurring object motif.', 'A viewer question at each turn.'], evidence: ['V1 00:00']},
      {process: 'sound', subjects: ['music'], goal: 'Silence carries the turns.', steps: ['Drop the music 1 s before each turn (V1 05:00).'], own: ['Our own short sting.'], beat: ['Bring the music back softer.'], evidence: ['V1 05:00']},
    ],
    missed: [{subject: 'pacing', why: 'The hook cuts every 2 s.', process: 'editing'}],
  };
  const ai = {complete: async request => { calls.push(request); return {content: JSON.stringify(roadmap), usage: {promptTokens: 20000, completionTokens: 3000, totalTokens: 23000}}; }};
  const watcher = new VideoWatcher(store, {connectors, quota, intel, ai, renders: null, skills, fetch: net.fetch});
  assert.throws(() => watcher.queueRoadmap(family.id, {requestedBy: 'Hasnain', connector: claude}), /Watch at least one/);
  watcher.queue(family.id, {requestedBy: 'Hasnain', connector: gemini, videos: [{videoId: vid(1), competitorKey: keys[0]}]});
  await watcher.processNext();
  const queued = watcher.queueRoadmap(family.id, {requestedBy: 'Hasnain', connector: claude});
  assert.equal(queued.revision, 1);
  const ready = await watcher.processNextRoadmap();
  assert.equal(ready.status, 'ready', ready.error);
  const data = JSON.parse(calls[0].messages[1].content.replace(/^UNTRUSTED CONTROL ROOM DATA:\n/, ''));
  assert.deepEqual([data.videos[0].ref, data.videos[0].channel, Object.keys(data.videos[0].subjects)], ['V1', 'C1', ['hooks', 'music']]);
  assert.deepEqual(data.ownerTicked, {C1: ['hooks', 'music']});
  assert.match(calls[0].messages[0].content, /at most 30% learned patterns/);
  assert.deepEqual(ready.result.processes.map(item => item.process), ['script', 'sound']);
  assert.equal(ready.usage.total, 23000);
  // Approval needs the confirmations and a name; it makes pin-only skills pinned to this family only.
  assert.throws(() => watcher.review(ready.id, {decision: 'approve', reviewer: 'Hasnain', confirmations: {read: true}}), /Confirm that the roadmap learns techniques only/);
  const approved = watcher.review(ready.id, {decision: 'approve', reviewer: 'Hasnain', confirmations: {read: true, ownWork: true, leads: true}});
  assert.equal(approved.status, 'approved');
  assert.equal(approved.applied.skills.length, 2);
  const brief = skills.brief('script.candidate', {familyId: family.id});
  const led = brief.skills.find(skill => skill.id.startsWith('roadmap.f'));
  assert.ok(led, 'the roadmap leads this family\'s script jobs');
  assert.equal(brief.skills[0].id, led.id, 'pinned, so it comes first');
  assert.ok(!skills.brief('script.candidate', {familyId: other.id}).skills.some(skill => skill.id.startsWith('roadmap.f')), 'never another family');
  assert.ok(skills.brief('audio.mix', {familyId: family.id}).skills.some(skill => skill.id.endsWith('-sound')));
  // A newer roadmap without sound supersedes it and unpins sound.
  roadmap.processes = roadmap.processes.slice(0, 1);
  watcher.queueRoadmap(family.id, {requestedBy: 'Hasnain', connector: claude});
  const next = await watcher.processNextRoadmap();
  watcher.review(next.id, {decision: 'approve', reviewer: 'Hasnain', confirmations: {read: true, ownWork: true, leads: true}});
  assert.equal(watcher.publicRoadmap(watcher.roadmapRow(ready.id)).status, 'superseded');
  assert.ok(!skills.brief('audio.mix', {familyId: family.id}).skills.some(skill => skill.id.endsWith('-sound')), 'a process the new roadmap dropped is unpinned');
  assert.ok(watcher.document('roadmap', next.id).data.length > 500);
});

test('a saved video file is read from its frames and the owner\'s transcript by Claude or ChatGPT', {skip: hasFFmpeg ? false : 'FFmpeg is not installed'}, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const net = google();
  const {store, connectors, quota, intel, skills, family, keys, make} = setup(t, net);
  const claude = make('claude', 'sk-ant-api03-fixture-0123456789abcdefghijklmnop');
  const video = path.join(dir, 'saved.mp4');
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=white:s=640x360:d=1.5:r=25', '-f', 'lavfi', '-i', 'color=c=0x2E5C8A:s=640x360:d=1.5:r=25', '-f', 'lavfi', '-i', 'color=c=0xD9534F:s=640x360:d=1.5:r=25', '-f', 'lavfi', '-i', 'color=c=black:s=640x360:d=1.5:r=25',
    '-filter_complex', '[0][1][2][3]concat=n=4:v=1:a=0[v]', '-map', '[v]', '-pix_fmt', 'yuv420p', video]);
  const calls = [];
  const ai = {complete: async request => { calls.push(request); return {content: JSON.stringify(study(['hooks', 'pacing'], {durationSeconds: 6, timeline: [{from: '00:00', seen: 'white', technique: 'open bright'}, {from: '00:01', seen: 'blue'}, {from: '00:03', seen: 'red'}]})), usage: {promptTokens: 9000, completionTokens: 2000, totalTokens: 11000}}; }};
  intel.savePicks(family.id, {createdBy: 'Hasnain', expectedRevision: 0, picks: {[keys[0]]: ['hooks', 'pacing']}});
  const watcher = new VideoWatcher(store, {connectors, quota, intel, ai, renders: {pinCheck: () => ({ok: true, paths: {ffmpeg: 'ffmpeg', ffprobe: 'ffprobe'}})}, skills, watchDir: path.join(dir, 'watches'), fetch: net.fetch});
  assert.throws(() => watcher.queueFile(family.id, {requestedBy: 'Hasnain', title: 'Saved', path: path.join(dir, 'nope.mp4'), engine: 'frames', connector: claude}), /does not exist/);
  assert.throws(() => watcher.queueFile(family.id, {requestedBy: 'Hasnain', title: 'Saved', path: video, engine: 'frames', connector: claude, transcript: 'too short'}), /fewer than 20 words/);
  const transcript = '1\n00:00:00,000 --> 00:00:03,000\nWhat made a shell worth more than a cow on one small island long ago?\n\n2\n00:00:03,000 --> 00:00:06,000\nNobody agreed, until the chief did, and then everything about trade changed.';
  watcher.queueFile(family.id, {requestedBy: 'Hasnain', title: 'Saved competitor video', path: `"${video}"`, engine: 'frames', connector: claude, competitorKey: keys[0], transcript});
  const done = await watcher.processNext();
  assert.equal(done.status, 'watched', done.error);
  assert.equal(calls.length, 1, 'asked once');
  const blocks = calls[0].messages.find(message => message.role === 'user').content;
  assert.ok(blocks.filter(block => block.type === 'image').length >= 2, 'contact sheets of frames');
  assert.match(blocks[0].text, /\[00:00\] What made a shell/);
  assert.match(blocks[0].text, /- pacing:/);
  assert.match(calls[0].messages[0].content, /You do not hear the audio/);
  assert.deepEqual([done.measured.shots, done.measured.medianShotSeconds], [4, 1.5], 'the cut rhythm measured on this PC');
  assert.ok(done.measured.wordsPerMinute > 100);
  assert.equal(store.db.prepare("SELECT status FROM intelligence_usage WHERE job_id=?").get(done.id).status, 'settled');
  assert.equal(net.calls.length, 0, 'nothing went to Google for a frames watch');
});
