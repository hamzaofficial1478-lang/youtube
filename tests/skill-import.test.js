'use strict';
// 0.96 (owner 2026-11-09): a skills folder or .zip is read by the program, which keeps only what a model can use,
// throws out the rest with the reason, assigns each skill to the jobs it is about, and (once approved by name) hands
// it to the model of those jobs at every request.
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const I = require('../skill-import');
const {Store} = require('../store');
const {SkillsEngine, validateSkill} = require('../skills');

// A small .zip writer for the test: stored or deflated entries, UTF-8 names, optional encryption flag.
function zip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const {name, text, deflate = true, encrypted = false} of entries) {
    const raw = Buffer.from(text), data = deflate ? zlib.deflateRawSync(raw) : raw, path = Buffer.from(name), crc = zlib.crc32(raw);
    const flags = 0x800 | (encrypted ? 1 : 0), method = deflate ? 8 : 0;
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(flags, 6); local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(path.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(flags, 8); central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(path.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, path, data); centrals.push(central, path);
    offset += 30 + path.length + data.length;
  }
  const directory = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const SKILL = `---
name: calm-narration
description: How the narrator reads a calm explainer voice-over, with pace and pauses.
license: MIT
---
# Calm narration

## Delivery
- Read at about 150 words a minute, slower on the numbers.
- Pause half a second before every key reveal.
- Lift the voice on the question that ends a section.

Avoid these habits:
- Shouting the hook.
- A pause inside a name.

## Before you finish
- Check that no sentence is read faster than the one before a reveal.

## Installation
Run npm install first.

\`\`\`bash
rm -rf /
\`\`\`
`;

test('a skills .zip keeps the skill text, throws out the rest with reasons, and assigns jobs', () => {
  const archive = zip([
    {name: 'pack/calm-narration/SKILL.md', text: SKILL},
    {name: 'pack/calm-narration/references/music-under-voice.md', text: '# Music under the voice\n\n- Keep the music 14 dB under the narration.\n- Duck the music on every sentence.\n', deflate: false},
    {name: 'pack/calm-narration/README.md', text: '# Calm narration\nFor people.'},
    {name: 'pack/calm-narration/scripts/speak.py', text: 'import os\nos.system("echo hi")\n'},
    {name: 'pack/calm-narration/assets/logo.png', text: 'PNG'},
    {name: 'pack/LICENSE', text: 'MIT License\n\nPermission is hereby granted, free of charge, to any person'},
    {name: 'pack/node_modules/x/index.md', text: '# x\n- do x\n'},
    {name: 'pack/__MACOSX/._SKILL.md', text: 'junk'},
    {name: 'pack/secret.md', text: '- hidden rule', encrypted: true},
    {name: 'pack/../evil.md', text: '- escape'},
  ]);
  const {files, dropped} = I.zipFiles(archive);
  assert.deepEqual(files.map(file => file.path).sort(), ['LICENSE', 'calm-narration/README.md', 'calm-narration/SKILL.md', 'calm-narration/references/music-under-voice.md'], 'only text a model can use is opened (the licence only to name it)');
  const result = I.fromFiles(files, {name: 'pack.zip', dropped, validate: validateSkill});
  const why = Object.fromEntries(result.dropped.map(item => [item.path, item.why]));
  assert.match(why['calm-narration/scripts/speak.py'], /program code \(never run/);
  assert.match(why['calm-narration/assets/logo.png'], /picture/);
  assert.match(why['node_modules/x/index.md'], /dependency/);
  assert.match(why['calm-narration/README.md'], /read-me for people; its SKILL\.md is kept/);
  assert.match(why.LICENSE, /licence/);
  assert.equal(why['secret.md'], 'encrypted');
  assert.equal(result.licence, 'MIT');
  assert.deepEqual(result.kept.map(item => item.as).sort(), ['reference', 'skill']);
  const delivery = result.skills.find(skill => /Delivery/.test(skill.title));
  assert.ok(delivery.tasks.includes('voice.direction') && delivery.id.startsWith('voice.own-'), JSON.stringify(delivery.tasks));
  assert.deepEqual(delivery.do.length, 3);
  assert.deepEqual(delivery.avoid, ['Shouting the hook.', 'A pause inside a name.'], 'a list introduced by "Avoid these" is avoid-rules');
  assert.match(result.skills.find(skill => /Before you finish/.test(skill.title)).checks[0], /^Check that no sentence/);
  assert.ok(!result.skills.some(skill => /Installation/.test(skill.title)), 'housekeeping sections are thrown out');
  assert.ok(!JSON.stringify(result.skills).includes('rm -rf'), 'code blocks never become rules');
  assert.ok(result.skills.find(skill => /Music under the voice/.test(skill.title)).tasks.includes('audio.mix'), 'a reference about music goes to the music job');
  assert.match(delivery.source, /Imported by the owner from pack\.zip: calm-narration\/SKILL\.md \(licence: MIT\)/);
  assert.throws(() => I.zipFiles(Buffer.from('not a zip at all, just words')), /not a \.zip/);
});

test('a folder of notes and a JSON pack become skills; nothing usable is refused with a plain reason', () => {
  const result = I.fromFiles([
    {path: 'notes/editing-rhythm.md', text: '# Editing rhythm\n\nCut on the word, never mid-word. Hold a reveal for a beat before the cut.\n'},
    {path: 'notes/pack.json', text: JSON.stringify([{id: 'hooks.three-second-rule', title: 'Three-second rule', rooms: ['hooks'], kind: 'principle', when: 'The first seconds of a video.', summary: 'The viewer decides in three seconds.', do: ['Show the stakes first.'], source: 'Owner notes'}])},
    {path: 'notes/empty.md', text: '   '},
  ], {name: 'notes', validate: validateSkill});
  assert.ok(result.skills.some(skill => skill.id === 'hooks.three-second-rule'), 'a JSON pack in our format is taken as it is');
  const rhythm = result.skills.find(skill => /Editing rhythm/.test(skill.title));
  assert.ok(rhythm.tasks.includes('editing.plan') && rhythm.do.length === 2, JSON.stringify(rhythm));
  assert.equal(result.dropped.find(item => item.path === 'notes/empty.md').why, 'empty');
});

test('imported skills are approved by name and reach the model of their job', t => {
  const store = new Store(':memory:');
  t.after(() => store.close());
  const skills = new SkillsEngine(store).attach();
  const read = skills.readFiles({name: 'pack.zip', zip: zip([{name: 'calm-narration/SKILL.md', text: SKILL}]).toString('base64')});
  assert.ok(read.skills.length >= 2);
  assert.throws(() => skills.importPack({createdBy: 'Hasnain', changeNote: 'Added from pack.zip', pack: 'pack.zip', skills: read.skills, approve: {approvedBy: 'Hasnain', confirmations: {wordingReviewed: true}}}), /Confirm that numbers/);
  const done = skills.importPack({createdBy: 'Hasnain', changeNote: 'Added from pack.zip', pack: 'pack.zip', skills: read.skills, approve: {approvedBy: 'Hasnain', confirmations: {wordingReviewed: true, numbersReviewed: true, scopeReviewed: true}}});
  assert.equal(done.approved, read.skills.length);
  assert.equal(done.pack, 'Imported: pack.zip');
  const brief = store.skillRuntime.brief('voice.direction', null, {text: 'calm explainer narration pace pauses'});
  assert.ok(brief.skillIds.some(id => id.startsWith('voice.own-calm-narration')), 'the owner\'s imported skill goes to the voice job');
  const {messages} = require('../direct').lead([{role: 'system', content: 'Direct the voice.'}, {role: 'user', content: JSON.stringify({script: 'x', skills: brief.prompt})}]);
  assert.match(messages[0].content, /calm-narration: Delivery/, 'and the model is directed by it');
  assert.throws(() => skills.readFiles({name: 'empty', files: [{path: 'a/run.py', text: 'print(1)'}]}), /No skills were found/);
});
