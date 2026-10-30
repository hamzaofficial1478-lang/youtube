'use strict';
// Owner request 2026-10-22: a family can be deleted after its name is typed; a family with work needs the owner's tick (2026-10-29).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {Store} = require('../store');
const {StyleLibrary} = require('../style');

const input = {name: 'Stickman', tier: 'A', countries: ['United States'], audience: 'Curious adults who like stone age life explained simply.', niche: 'Stone age life', locales: ['en-US'], timezone: 'Asia/Karachi', monthlyBudget: 0, cadence: 2, format: 'long-form'};

test('a family is deleted after its name is typed and the owner chose what happens to its style and settings', t => {
  const store = new Store(':memory:');
  t.after(() => store.close());
  const empty = store.saveFamily(input);
  assert.throws(() => store.deleteFamily(empty.id, {revision: empty.revision, confirmName: 'stickman'}), /Type the family's name exactly/);
  assert.throws(() => store.deleteFamily(empty.id, {revision: empty.revision + 1, confirmName: 'Stickman'}), /changed|revision/i);
  assert.throws(() => store.deleteFamily(empty.id, {revision: empty.revision, confirmName: 'Stickman'}), /Choose whether to keep/);
  assert.deepEqual(store.deleteFamily(empty.id, {revision: empty.revision, confirmName: 'Stickman', keep: false}), {deleted: true, name: 'Stickman', kept: false});
  assert.equal(store.families().length, 0);
  assert.throws(() => store.family(empty.id), /not found/i);
  // Keeping needs a data folder to save into; an in-memory workspace has none.
  const other = store.saveFamily({...input, name: 'History Shorts'});
  assert.throws(() => store.deleteFamily(other.id, {revision: other.revision, confirmName: 'History Shorts', keep: true}), /no data folder/);
  assert.equal(store.families().length, 1);
});

// Owner request 2026-10-29: after the warning, a family is deleted with all its work, history tables included, and
// nothing of another family is touched.
test('a family with work is deleted with everything hanging off it when the owner chooses to delete everything', t => {
  const store = new Store(':memory:');
  t.after(() => store.close());
  const script = {kind: 'fiction', angle: 'Invented markets learn to trust.', hook: 'Why did a stranger trust a stamp?', script: 'Why did a stranger trust a stamp? '.repeat(10), sources: [], rightsConfirmed: true};
  const dummy = store.saveFamily({...input, name: 'Finance'}), real = store.saveFamily({...input, name: 'Real Channel'});
  const mine = store.saveContent({...script, familyId: dummy.id, title: 'The first coin'}), theirs = store.saveContent({...script, familyId: real.id, title: 'The second coin'});
  // A history table that refuses deletes, a row hanging off it, and a job with a status.
  store.db.exec(`CREATE TABLE plan_history(id TEXT PRIMARY KEY, content_id TEXT NOT NULL REFERENCES content(id));
    CREATE TABLE plan_notes(id INTEGER PRIMARY KEY, plan_id TEXT NOT NULL REFERENCES plan_history(id));
    CREATE TABLE plan_jobs(id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id), status TEXT NOT NULL);
    CREATE TRIGGER plan_history_keep BEFORE DELETE ON plan_history BEGIN SELECT RAISE(ABORT, 'Plans are kept for history.'); END;`);
  for (const [id, content] of [['p1', mine.id], ['p2', theirs.id]]) store.db.prepare('INSERT INTO plan_history VALUES(?,?)').run(id, content);
  store.db.prepare("INSERT INTO plan_notes(plan_id) VALUES('p1'),('p2')").run();
  store.db.prepare("INSERT INTO plan_jobs VALUES('j1',?,'running')").run(dummy.id);
  assert.deepEqual(store.familyWork(dummy.id).map(item => item.table), ['content', 'plan_jobs']);
  const ask = {revision: dummy.revision, confirmName: 'Finance', keep: false};
  assert.throws(() => store.deleteFamily(dummy.id, ask), /waiting or running \(plan jobs\)/, 'running work is never pulled away');
  store.db.prepare("UPDATE plan_jobs SET status='completed'").run();
  assert.deepEqual(store.deleteFamily(dummy.id, ask), {deleted: true, name: 'Finance', kept: false, removed: 4});
  assert.deepEqual(store.families().map(item => item.name), ['Real Channel']);
  assert.deepEqual(store.db.prepare('SELECT id FROM plan_history').all().map(row => row.id), ['p2'], 'the other family keeps its history');
  assert.deepEqual(store.db.prepare('SELECT plan_id FROM plan_notes').all().map(row => row.plan_id), ['p2']);
  assert.equal(store.content(theirs.id).title, 'The second coin');
  assert.throws(() => store.db.prepare("DELETE FROM plan_history WHERE id='p2'").run(), /kept for history/, 'the history guard is back');
  assert.ok(store.state().events.some(item => /Deleted family: Finance with everything \(4 records/.test(item.message)));
});

// Owner request 2026-10-30: keep the channel's style and settings (saved to a file, the style stays in the library, the
// files stay) or delete everything (its own style copy and its folders of files too).
test('deleting keeps the style and saves the settings to a file, or deletes the style copy and the files too', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'control-room-delete-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  const store = new Store(path.join(root, 'c.sqlite')), styles = new StyleLibrary(store);
  t.after(() => store.close());
  const launch = styles.profiles().find(profile => profile.key === 'stickman-sketch-explainer'), base = launch.revisions.at(-1);
  const make = name => {
    const family = store.saveFamily({...input, name, competitors: ['@MoneyMap']});
    const copy = styles.createProfile({spec: {...base.spec, name: `${name} · Stickman Sketch Explainer`}, createdBy: 'Owner', changeNote: 'This channel\'s own settings.', baseRevisionId: base.id});
    for (const dir of ['renders', 'packaging']) { fs.mkdirSync(path.join(root, dir, family.id, 'video'), {recursive: true}); fs.writeFileSync(path.join(root, dir, family.id, 'video', 'file.txt'), name); }
    return {family: store.family(family.id), copy};
  };
  const kept = make('Finance'), gone = make('Dummy');
  // Keep: the record file has the family, its style and no secrets; the style copy and the files stay.
  const result = store.deleteFamily(kept.family.id, {revision: kept.family.revision, confirmName: 'Finance', keep: true});
  assert.equal(result.kept, true);
  assert.equal(path.dirname(result.savedTo), path.join(root, 'saved-channels'));
  assert.deepEqual(result.styles, ['Finance · Stickman Sketch Explainer']);
  assert.equal(result.folders.length, 2);
  const saved = JSON.parse(fs.readFileSync(result.savedTo, 'utf8'));
  assert.deepEqual([saved.family.name, saved.family.competitors[0].value, saved.styles[0].name], ['Finance', '@MoneyMap', 'Finance · Stickman Sketch Explainer']);
  assert.ok(styles.profiles().some(profile => profile.name === 'Finance · Stickman Sketch Explainer'), 'the style stays in the library');
  assert.ok(fs.existsSync(path.join(root, 'renders', kept.family.id, 'video', 'file.txt')), 'the files stay');
  assert.ok(store.state().events.some(item => item.message.includes(`its style, settings and work are saved in ${result.savedTo}`)));
  // Delete everything: its own style copy and its folders go; the launch engine and the other channel's things stay.
  const all = store.deleteFamily(gone.family.id, {revision: gone.family.revision, confirmName: 'Dummy', keep: false});
  assert.equal(all.kept, false);
  assert.ok(!styles.profiles().some(profile => profile.name.startsWith('Dummy · ')), 'its style copy is gone');
  assert.ok(styles.profiles().some(profile => profile.key === 'stickman-sketch-explainer'), 'the engine itself stays');
  for (const dir of ['renders', 'packaging']) assert.ok(!fs.existsSync(path.join(root, dir, gone.family.id)), `its ${dir} folder is gone`);
  assert.ok(fs.existsSync(path.join(root, 'renders', kept.family.id)), 'the kept channel\'s files are untouched');
  assert.throws(() => store.db.prepare('DELETE FROM style_revisions WHERE id=?').run(kept.copy.id), /retained for provenance/, 'the style history guard is back');
});
