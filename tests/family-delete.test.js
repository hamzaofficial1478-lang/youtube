'use strict';
// Owner request 2026-10-22: a family can be deleted after its name is typed; a family with work needs the owner's tick (2026-10-29).
const test = require('node:test');
const assert = require('node:assert/strict');
const {Store} = require('../store');

const input = {name: 'Stickman', tier: 'A', countries: ['United States'], audience: 'Curious adults who like stone age life explained simply.', niche: 'Stone age life', locales: ['en-US'], timezone: 'Asia/Karachi', monthlyBudget: 0, cadence: 2, format: 'long-form'};

test('a family with no work is deleted after its name is typed; a family with work is archived instead', t => {
  const store = new Store(':memory:');
  t.after(() => store.close());
  const empty = store.saveFamily(input);
  assert.throws(() => store.deleteFamily(empty.id, {revision: empty.revision, confirmName: 'stickman'}), /Type the family's name exactly/);
  assert.throws(() => store.deleteFamily(empty.id, {revision: empty.revision + 1, confirmName: 'Stickman'}), /changed|revision/i);
  assert.deepEqual(store.deleteFamily(empty.id, {revision: empty.revision, confirmName: 'Stickman'}), {deleted: true, name: 'Stickman'});
  assert.equal(store.families().length, 0);
  assert.throws(() => store.family(empty.id), /not found/i);
  // With a script it stays (archive keeps the work and its history).
  const busy = store.saveFamily({...input, name: 'History Shorts'});
  store.saveContent({familyId: busy.id, title: 'The first coin', kind: 'fiction', angle: 'Invented markets learn to trust.', hook: 'Why did a stranger trust a stamp?', script: 'Why did a stranger trust a stamp? '.repeat(10), sources: [], rightsConfirmed: true});
  assert.throws(() => store.deleteFamily(busy.id, {revision: busy.revision, confirmName: 'History Shorts'}), /has work \(1 content\)\. Tick "Delete all of this too"/);
  assert.equal(store.families().length, 1);
});

// Owner request 2026-10-29: after the warning and the owner's tick, a family is deleted with all its work, history
// tables included, and nothing of another family is touched.
test('a family with work is deleted with everything hanging off it once the owner ticks it', t => {
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
  const ask = {revision: dummy.revision, confirmName: 'Finance', deleteWork: true};
  assert.throws(() => store.deleteFamily(dummy.id, ask), /waiting or running \(plan jobs\)/, 'running work is never pulled away');
  store.db.prepare("UPDATE plan_jobs SET status='completed'").run();
  assert.deepEqual(store.deleteFamily(dummy.id, ask), {deleted: true, name: 'Finance', removed: 4});
  assert.deepEqual(store.families().map(item => item.name), ['Real Channel']);
  assert.deepEqual(store.db.prepare('SELECT id FROM plan_history').all().map(row => row.id), ['p2'], 'the other family keeps its history');
  assert.deepEqual(store.db.prepare('SELECT plan_id FROM plan_notes').all().map(row => row.plan_id), ['p2']);
  assert.equal(store.content(theirs.id).title, 'The second coin');
  assert.throws(() => store.db.prepare("DELETE FROM plan_history WHERE id='p2'").run(), /kept for history/, 'the history guard is back');
  assert.ok(store.state().events.some(item => /Deleted family: Finance and all its work \(4 records\)/.test(item.message)));
});
