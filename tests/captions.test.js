'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Cap = require('../captions');
const B = require('../editing-brain');

const SENTENCES = [
  {n: 1, text: 'In 1347 a ship docked in Messina.', startSeconds: 0, durationSeconds: 3.2},
  {n: 2, text: 'Within months, 60% of the city was gone, and nobody knew why.', startSeconds: 3.2, durationSeconds: 4.7},
  {n: 3, text: 'Nobody.', startSeconds: 7.9, durationSeconds: 1.1},
];
// Measured pauses: one after each sentence (the cut sits 0.08 s before its end) and one at each comma.
const PAUSES = [{start: 2.9, end: 3.28}, {start: 4.4, end: 4.7}, {start: 6.3, end: 6.5}, {start: 7.6, end: 7.98}];

test('words are timed inside measured sentence windows, with inner pauses anchored at the commas', () => {
  const words = Cap.wordTimings({sentences: SENTENCES, pauses: PAUSES, narrationSeconds: 9});
  assert.deepEqual(words.map(word => word.text), SENTENCES.flatMap(item => item.text.split(' ')), 'every token once, in order');
  for (let k = 1; k < words.length; k++) assert.ok(words[k].start >= words[k - 1].end - 1e-9 && words[k].end > words[k].start, 'monotonic');
  const at = text => words.find(word => word.text === text);
  assert.equal(at('Messina.').end, 2.9, 'speech ends where the measured pause starts');
  assert.equal(at('Within').start, 3.28, 'the next sentence starts where the pause ends');
  assert.equal(at('months,').end, 4.4, 'the comma pause is anchored after "months,"');
  assert.equal(at('60%').start, 4.7);
  assert.equal(at('gone,').end, 6.3);
  assert.equal(at('and').start, 6.5);
  assert.ok(at('60%').end - at('60%').start > at('of').end - at('of').start, 'a figure takes longer to say than a short word');
  // With no pauses measured, words still share each sentence window.
  const estimated = Cap.wordTimings({sentences: SENTENCES, narrationSeconds: 9});
  assert.equal(estimated[0].start, 0);
  assert.equal(estimated.at(-1).end, 9);
});

test('long-form captions break at sentences, pauses and clauses, never overlap and carry every word', () => {
  const captions = Cap.buildCaptions({sentences: SENTENCES, pauses: PAUSES, narrationSeconds: 9, format: 'long-form'});
  assert.equal(captions.schema, 'ytprod.captions/1');
  assert.equal(captions.enabled, true);
  assert.deepEqual(captions.groups.map(group => group.text), ['In 1347 a ship docked in Messina.', 'Within months,', '60% of the city was gone,', 'and nobody knew why.', 'Nobody.']);
  captions.groups.forEach((group, k) => {
    assert.ok(group.end - group.start >= 0.5 - 1e-9, `${group.id} stays at least half a second`);
    if (k) assert.ok(group.start >= captions.groups[k - 1].end + 0.05 - 1e-9, 'a small gap separates captions');
  });
  assert.equal(captions.groups[1].start, Math.round((3.28 - 0.08) * 1000) / 1000, 'a caption appears 0.08 s before its first word');
  assert.deepEqual(Cap.lintCaptions(captions, {sentences: SENTENCES}), []);
  assert.deepEqual(Cap.validateCaptions(captions, 9), []);
  // Long sentences wrap onto two balanced lines of at most 42 characters.
  const long = Cap.buildCaptions({sentences: [{n: 1, text: 'The archive kept every single receipt from the harbour masters for two centuries.', startSeconds: 0, durationSeconds: 6}], narrationSeconds: 6});
  for (const group of long.groups) { assert.ok(group.words.length <= 8); assert.ok(group.lines.length <= 2); assert.ok(group.lines.every(line => line.length <= 42)); }
});

test('Shorts captions follow the speaking rate and never end a caption on a weak word', () => {
  const captions = Cap.buildCaptions({sentences: SENTENCES, pauses: PAUSES, narrationSeconds: 9, format: 'shorts'});
  const texts = captions.groups.map(group => group.text);
  assert.ok(texts.includes('60% of the city'), 'the figure keeps its noun instead of ending on "the"');
  assert.ok(captions.groups.every(group => group.words.length <= 4));
  for (const text of texts) assert.doesNotMatch(text, /\b(the|of|a|in)$/i, `"${text}" ends on a weak word`);
  // A dense sentence (over 3.5 words a second) gets two-word captions.
  const dense = Cap.buildCaptions({sentences: [{n: 1, text: 'Salt bought bread wine wool and rope every single market day back then.', startSeconds: 0, durationSeconds: 3}], narrationSeconds: 3, format: 'shorts'});
  assert.ok(dense.groups.every(group => group.words.length <= 3), 'dense speech gets short captions');
});

test('emphasis is scarce: one word, figures first, never in two captions in a row', () => {
  const captions = Cap.buildCaptions({sentences: SENTENCES, pauses: PAUSES, narrationSeconds: 9});
  const marked = captions.groups.map(group => (group.emphasis === null ? null : group.words[group.emphasis].text));
  assert.deepEqual(marked, ['1347', null, '60%', null, 'Nobody.']);
  for (let k = 1; k < marked.length; k++) assert.ok(!(marked[k] && marked[k - 1]), 'never two in a row');
  const italian = Cap.buildCaptions({sentences: [{n: 1, text: 'Nessuno sapeva perché, mai.', startSeconds: 0, durationSeconds: 2}], narrationSeconds: 2, locale: 'it-IT'});
  assert.ok(italian.groups.every(group => group.emphasis === null), 'English word lists never mark other languages');
});

test('the ASS rail sits on the top layer, fades only around real gaps and clears for full-screen graphics on Shorts', () => {
  const spec = {palette: {accent: '#C9A227'}, typography: {bodyFont: 'Arial'}};
  const captions = Cap.buildCaptions({sentences: SENTENCES, pauses: PAUSES, narrationSeconds: 9});
  const timeline = {format: 'long-form', fps: 30, graphics: [], captions};
  const parts = Cap.assParts(timeline, spec, B.CAPTION_CLEARS);
  assert.match(parts.styles[0], /^Style: Caption,Arial,50,&H00FFFFFF,.*,2,144,144,62,1$/);
  assert.equal(parts.events.length, 5);
  assert.ok(parts.events.every(line => line.startsWith('Dialogue: 5,')));
  assert.match(parts.events[0], /\{\\fad\(0,0\)\}In \{\\c&H27A2C9&\}1347\{\\c&HFFFFFF&\} a ship/);
  assert.match(parts.events.at(-1), /\\fad\(0,150\)/, 'the last caption fades out');
  // Shorts: a canvas chart over 4-7 s clears the rail under it; horizontal graphics never clear it.
  const vertical = {format: 'shorts', fps: 30, captions: Cap.buildCaptions({sentences: SENTENCES, pauses: PAUSES, narrationSeconds: 9, format: 'shorts'}), graphics: [{id: 'g1', template: 'bar-chart', status: 'accepted', start: 120, frames: 90}, {id: 'g2', template: 'date', status: 'accepted', start: 0, frames: 60}]};
  const windows = Cap.clearWindows(vertical, B.CAPTION_CLEARS);
  assert.deepEqual(windows.map(item => item.graphicId), ['g1'], 'a date stamp sits at the top and never clears captions');
  const shortParts = Cap.assParts(vertical, spec, B.CAPTION_CLEARS);
  assert.ok(shortParts.hidden > 0);
  assert.match(shortParts.styles[0], /,2,96,96,620,1$/, 'the Shorts rail sits above the platform buttons');
  assert.deepEqual(Cap.clearWindows({...vertical, format: 'long-form'}, B.CAPTION_CLEARS), []);
  assert.deepEqual(Cap.assParts({...timeline, captions: {...captions, enabled: false}}, spec, B.CAPTION_CLEARS).events, []);
});

test('captions keep their contrast: white on footage and dark styles, the style ink with a white edge on paper', () => {
  const captions = Cap.buildCaptions({sentences: SENTENCES, pauses: PAUSES, narrationSeconds: 9});
  const timeline = {captions, format: 'long-form', graphics: [], fps: 30};
  const paper = Cap.assParts(timeline, {palette: {background: '#FFFFFF', primary: '#1F1F1F', accent: '#E0753E'}, typography: {bodyFont: 'Inter'}}, []);
  assert.match(paper.styles[0], /^Style: Caption,Inter,50,&H001F1F1F,&H001F1F1F,&H00FFFFFF,&H00FFFFFF,-1,0,0,0,100,100,0,0,1,4,0,2,/);
  assert.ok(paper.events.filter(event => event.includes('\\c&H3E75E0&')).every(event => event.includes('{\\c&H1F1F1F&}')), 'after the accent word the ink returns, not white');
  const dark = Cap.assParts(timeline, {palette: {background: '#0E0E0E', primary: '#F2EEE6', accent: '#C9A227'}, typography: {bodyFont: 'Inter'}}, []);
  assert.match(dark.styles[0], /^Style: Caption,Inter,50,&H00FFFFFF,&H00FFFFFF,&H00101010,&H96000000,-1,0,0,0,100,100,0,0,1,3,1,2,/, 'unchanged for footage');
});

test('the SRT sidecar is exact and the checks catch overlaps and missing words', () => {
  const captions = Cap.buildCaptions({sentences: SENTENCES, pauses: PAUSES, narrationSeconds: 9});
  const srt = Cap.srt(captions);
  assert.match(srt, /^1\n00:00:00,000 --> 00:00:03,\d{3}\nIn 1347 a ship docked in Messina\.\n\n2\n00:00:03,200 --> /);
  assert.equal(srt.split('\n\n').length, captions.groups.length);
  const broken = structuredClone(captions);
  broken.groups[2].start = broken.groups[1].start;
  broken.groups[3].words.shift();
  const kinds = Cap.lintCaptions(broken, {sentences: SENTENCES}).map(item => item.kind);
  assert.ok(kinds.includes('caption-overlap'));
  assert.ok(kinds.includes('caption-words'));
  assert.equal(Cap.validateCaptions(broken, 9).length, 1);
});

test('the WebVTT sidecar matches the SRT cues and escapes markup', () => {
  const captions = Cap.buildCaptions({sentences: SENTENCES, pauses: PAUSES, narrationSeconds: 9});
  const vtt = Cap.vtt(captions);
  assert.match(vtt, /^WEBVTT\n\n1\n00:00:00\.000 --> 00:00:03\.\d{3}\nIn 1347 a ship docked in Messina\.\n/);
  assert.deepEqual(vtt.match(/\d\d:\d\d:\d\d\.\d{3}/g), Cap.srt(captions).match(/\d\d:\d\d:\d\d,\d{3}/g).map(time => time.replace(',', '.')));
  const marked = structuredClone(captions);
  marked.groups[0].lines = ['Fish & <chips>'];
  assert.match(Cap.vtt(marked), /Fish &amp; &lt;chips&gt;/);
});

test('the owner corrects a caption\'s words without moving its timing, and a reset restores the narration', () => {
  const captions = Cap.buildCaptions({sentences: SENTENCES, pauses: PAUSES, narrationSeconds: 9});
  const group = captions.groups.find(item => item.text.includes('60%'));
  const {start, end, words} = structuredClone(group), original = group.text, originalEmphasis = group.emphasis;
  Cap.editCaption(captions, {groupId: group.id, text: '  sixty *percent*   of the city was gone,  '});
  assert.equal(group.text, 'sixty percent of the city was gone,');
  assert.deepEqual([group.start, group.end, group.words, group.emphasis, group.edited], [start, end, words, 1, true], 'timing and the narration words stay; *word* is the emphasis');
  assert.deepEqual(group.lines, ['sixty percent of the city was gone,']);
  const issues = Cap.lintCaptions(captions, {sentences: SENTENCES});
  assert.deepEqual(issues.filter(item => item.severity === 'critical'), [], 'a hand correction is not a missing narrated word');
  assert.deepEqual(issues.filter(item => item.kind === 'caption-edited').map(item => item.groupId), [group.id]);
  assert.throws(() => Cap.editCaption(captions, {groupId: group.id, text: 'sixty *percent* of the city was gone,'}), /Nothing changed/);
  for (const [text, pattern] of [['', /at least one word/], ['a {\b1} b', /control characters/], ['a --> b', /control characters/], ['*a* *b*', /at most one word/], ['a *b c', /whole word/], ['x'.repeat(85), /at most 84 characters/], [42, /Write the caption/]]) {
    assert.throws(() => Cap.editCaption(captions, {groupId: group.id, text}), pattern);
  }
  assert.throws(() => Cap.editCaption(captions, {groupId: 'cg999', text: 'x'}), /not in this edit/);
  Cap.editCaption(captions, {groupId: group.id, reset: true});
  assert.deepEqual([group.text, group.emphasis, group.edited, group.originalEmphasis], [original, originalEmphasis, undefined, undefined]);
  assert.throws(() => Cap.editCaption(captions, {groupId: group.id, reset: true}), /already shows/);
});

test('captions belong to every new edit, switch on and off as an owner change, and the critic asks for them back', () => {
  const SPEC = {name: 'Documentary Montage', canvas: {frameRate: 30}, pacing: {shotMinSeconds: 3, shotMaxSeconds: 8, hookShotMaxSeconds: 2.5, maxStaticHoldSeconds: 8}, transitions: {allowed: ['cut', 'crossfade'], default: 'cut', maxDurationMs: 700}, motion: {cameraMoves: ['static', 'ken-burns'], intensity: 35}, typography: {headingFont: 'Georgia', bodyFont: 'Arial', maxWordsOnScreen: 8, minTextHeightPercent: 4}, palette: {background: '#0E0E0E', primary: '#F2EEE6', accent: '#C9A227'}, qc: {maxFrozenSeconds: 6, maxBlackSeconds: 1}};
  const scenes = [{id: 'sc1', label: 'S01', purpose: 'hook', onScreenText: '', sentenceStart: 1, sentenceEnd: 3, shots: [{id: 'a', label: 'S01A', motion: 'ken-burns'}, {id: 'b', label: 'S01B', motion: 'ken-burns'}]}];
  const assets = {a: {assetId: 'x1', mediaType: 'image', clipSeconds: null}, b: {assetId: 'x2', mediaType: 'video', clipSeconds: 20}};
  const timeline = B.autoEdit({fps: 30, narrationSeconds: 9, sentences: SENTENCES, scenes, assets, spec: SPEC, pauses: PAUSES});
  assert.equal(timeline.captions.groups.length, 5);
  assert.equal(B.autoEdit({fps: 30, narrationSeconds: 9, sentences: SENTENCES, scenes, assets, spec: SPEC, pauses: PAUSES}).captions.groups.map(group => group.text).join('|'), timeline.captions.groups.map(group => group.text).join('|'), 'deterministic');
  const off = B.applyOp(timeline, {type: 'set-captions', enabled: false}, {spec: SPEC});
  assert.deepEqual(off.receipt.changed, ['captions']);
  assert.equal(off.timeline.captions.enabled, false);
  assert.throws(() => B.applyOp(off.timeline, {type: 'set-captions', enabled: false}, {spec: SPEC}), /already off/);
  assert.throws(() => B.applyOp(timeline, {type: 'set-captions', enabled: 'yes'}, {spec: SPEC}), /on or off/);
  const legacy = structuredClone(timeline);
  delete legacy.captions;
  assert.throws(() => B.applyOp(legacy, {type: 'set-captions', enabled: true}, {spec: SPEC}), /before captions existed/);
  const finding = B.critique(off.timeline, SPEC).findings.find(item => item.code === 'captions-off');
  assert.deepEqual(finding.op, {type: 'set-captions', enabled: true});
  assert.equal(finding.skill, 'editing.caption-spec');
  assert.equal(B.critique(timeline, SPEC).findings.some(item => item.code === 'captions-off'), false);
  // A stat's label stops at the clause; a drawn scene shows its own words and numbers, so nothing is laid over it.
  const strikes = [{n: 1, text: 'Lightning is everywhere on this planet today.', startSeconds: 0, durationSeconds: 3.2}, {n: 2, text: 'That is nearly 4 million strikes a day, most of them over land.', startSeconds: 3.2, durationSeconds: 4.7}, {n: 3, text: 'Nobody.', startSeconds: 7.9, durationSeconds: 1.1}];
  const edit = (text, source) => B.autoEdit({fps: 30, narrationSeconds: 9, sentences: strikes, scenes: scenes.map(scene => ({...scene, onScreenText: text, shots: scene.shots.map(shot => ({...shot, ...(source ? {source} : {})}))})), assets, spec: SPEC, pauses: []}).graphics.map(item => [item.template, item.lines.join(' / ')]);
  assert.deepEqual(edit('', null), [['stat', '4 million / strikes a day']], 'the label stops at the comma');
  assert.deepEqual(edit('Everywhere', null)[0], ['scene-text', 'Everywhere']);
  assert.deepEqual([edit('', 'generated-graphics'), edit('Everywhere', 'generated-graphics')], [[], []], 'a drawn scene shows its own words and numbers');
  // One caption's words corrected by hand: a new edit with the same timing and a nitpick asking for a listen.
  const target = timeline.captions.groups[1];
  const fixed = B.applyOp(timeline, {type: 'set-caption', groupId: target.id, text: 'Within *months*,'}, {spec: SPEC});
  assert.deepEqual(fixed.receipt.changed, [target.id]);
  assert.deepEqual([fixed.timeline.captions.groups[1].text, fixed.timeline.captions.groups[1].emphasis], ['Within months,', 1], 'punctuation may sit outside the asterisks');
  assert.equal(timeline.captions.groups[1].edited, undefined, 'the earlier timeline is untouched');
  assert.deepEqual([fixed.timeline.captions.groups[1].start, fixed.timeline.captions.groups[1].end], [target.start, target.end]);
  assert.equal(B.critique(fixed.timeline, SPEC).findings.find(item => item.code === 'captions-edited').severity, 'nitpick');
  assert.throws(() => B.applyOp(timeline, {type: 'set-caption', groupId: target.id, text: ''}, {spec: SPEC}), /at least one word/);
  assert.throws(() => B.applyOp(legacy, {type: 'set-caption', groupId: 'cg001', text: 'x'}, {spec: SPEC}), /before captions existed/);
});

test('measured word times from the voice replace the estimate; a re-spelled word takes the time between its neighbours', () => {
  const sentences = [{n: 1, text: 'SQL makes data easy.', startSeconds: 0, durationSeconds: 2}, {n: 2, text: 'Try it today.', startSeconds: 2, durationSeconds: 1.5}];
  // The voice said "sequel" (a pronunciation fix), so "SQL" has no measured match of its own.
  const spoken = [{text: 'sequel', start: 0.1, end: 0.5}, {text: 'makes', start: 0.6, end: 0.9}, {text: 'data', start: 1.0, end: 1.3}, {text: 'easy.', start: 1.35, end: 1.8}, {text: 'Try', start: 2.2, end: 2.4}, {text: 'it', start: 2.45, end: 2.55}, {text: 'today.', start: 2.6, end: 3.1}];
  const words = Cap.wordTimings({sentences, pauses: [], narrationSeconds: 3.5, measured: spoken});
  assert.deepEqual(words.slice(1).map(word => [word.text, word.start]), [['makes', 0.6], ['data', 1], ['easy.', 1.35], ['Try', 2.2], ['it', 2.45], ['today.', 2.6]]);
  assert.ok(words[0].start < 0.6 && words[0].end <= 0.6, 'the re-spelled word sits before its matched neighbour');
  const captions = Cap.buildCaptions({sentences, narrationSeconds: 3.5, measured: spoken});
  assert.equal(captions.method, 'measured');
  assert.equal(captions.groups[0].words[1].start, 0.6);
  // Too few matches: the estimate stays.
  assert.equal(Cap.buildCaptions({sentences, narrationSeconds: 3.5, measured: [{text: 'unrelated', start: 0, end: 1}]}).method, 'estimated');
});

test('active-word highlight: words wait dimmed and light up on the narrator\'s words, the hero word pops in the accent', () => {
  const captions = Cap.buildCaptions({sentences: SENTENCES, pauses: PAUSES, narrationSeconds: 9});
  const timeline = {captions, format: 'long-form', graphics: [], fps: 30};
  const spec = {palette: {accent: '#C9A227'}, typography: {bodyFont: 'Arial'}, captions: {activeWordHighlight: true}};
  const parts = Cap.assParts(timeline, spec, []);
  assert.match(parts.styles[0], /^Style: Caption,Arial,50,&H00FFFFFF,&H90FFFFFF,/, 'words not yet spoken are dimmed');
  const first = captions.groups[0], event = parts.events[0];
  const beats = [...event.matchAll(/\\k(\d+)/g)].map(match => Number(match[1]));
  assert.equal(beats.length, first.words.length + (first.words[0].start > first.start ? 1 : 0));
  assert.equal(beats.reduce((sum, value) => sum + value, 0), Math.round((first.words.at(-1).end - first.start) * 100), 'the beats follow the word times');
  assert.match(event, /\\c&H27A2C9&\\t\(\d+,\d+,\\fscx114\\fscy114\)\\t\(\d+,\d+,\\fscx100\\fscy100\)\}1347\{\\c&HFFFFFF&\\fscx100\\fscy100\}/, 'the hero word pops when it is said');
  // A corrected caption with other words has no word times to follow; it is shown whole.
  const fixed = structuredClone(captions);
  Cap.editCaption(fixed, {groupId: first.id, text: 'In the year 1347 a ship'});
  assert.doesNotMatch(Cap.assParts({...timeline, captions: fixed}, spec, []).events[0], /\\k/);
  assert.doesNotMatch(Cap.assParts(timeline, {...spec, captions: {activeWordHighlight: false}}, []).events.join(''), /\\k/);
});

// 0.41: caption looks (caption-ai's themes, restated as our own ASS styles).
test('caption themes change how burned-in captions look; the style checks the name', () => {
  const timeline = {format: 'long-form', captions: {enabled: true, groups: [{id: 'g1', start: 0, end: 2, text: 'money is a promise', lines: ['money is a promise'], words: 'money is a promise'.split(' ').map((text, k) => ({text, start: k * 0.4, end: k * 0.4 + 0.3})), emphasis: 3}]}};
  const parts = theme => Cap.assParts(timeline, {palette: {background: '#101418', primary: '#F2F4F5', accent: '#37C2A0'}, typography: {bodyFont: 'Segoe UI'}, captions: {theme}}, []);
  assert.deepEqual(parts('clean'), parts(undefined), 'clean is the default look');
  assert.match(parts('comic').styles[0], /^Style: Caption,Impact,59,&H004DE1FF,/);
  assert.match(parts('comic').events[0], /MONEY IS A/);
  assert.match(parts('boxed').styles[0], /,3,13,0,2,/, 'an opaque box behind the words');
  assert.match(parts('cinematic').events[0], /\\fad\(0,320\)/, 'a slow cinematic fade out (the first caption starts at once)');
  assert.match(parts('glow').events[0], /\\blur4/);
  assert.doesNotMatch(parts('glow').events[0], /\\c&HA0C237&/, 'on a glow the key word stays white and glows wider');
  const {LAUNCH_PROFILES, validateStyleSpec} = require('../style');
  const spec = structuredClone(LAUNCH_PROFILES.find(item => item.key === 'documentary-montage').spec);
  assert.equal(validateStyleSpec({...spec, captions: {...spec.captions, theme: 'bold'}}).captions.theme, 'bold');
  assert.equal(validateStyleSpec({...spec, captions: {...spec.captions, theme: 'clean'}}).captions.theme, undefined);
  assert.throws(() => validateStyleSpec({...spec, captions: {...spec.captions, theme: 'neon'}}), /caption theme/);
});
