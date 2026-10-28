'use strict';
// Owner request 2026-10-22: a family can be deleted after its name is typed, only while nothing was made for it.
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
  assert.throws(() => store.deleteFamily(busy.id, {revision: busy.revision, confirmName: 'History Shorts'}), /already has work \(1 content\), so it cannot be deleted: archive it instead/);
  assert.equal(store.families().length, 1);
});
