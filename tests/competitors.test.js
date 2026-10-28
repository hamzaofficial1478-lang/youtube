'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {Store, competitorList} = require('../store');

const familyFixture = {
  name: 'Competitor fixture family',
  tier: 'A',
  countries: ['United States'],
  audience: 'Adults who want clear explanations of everyday money decisions.',
  niche: 'Practical money explainers',
  locales: ['en-US'],
  timezone: 'Asia/Karachi',
  monthlyBudget: 50,
  cadence: 2,
  format: 'long-form',
};
const words = (count, prefix) => Array.from({length: count}, (_, index) => `${prefix}${index + 1}`).join(' ');
const hook = 'Every budget looks fine until the month actually starts.';
const script = [`${hook} ${words(150, 'opening')}`, words(160, 'development'), words(160, 'example'), words(168, 'payoff')].join('\n\n');

function memory(t) {
  const store = new Store(':memory:');
  t.after(() => store.close());
  return store;
}

test('competitor references normalize handles, channel IDs and channel URLs', () => {
  const list = competitorList([
    '@MoneyExplained',
    'UC1234567890abcdefghijkl',
    'https://www.youtube.com/@BudgetLab/videos',
    'https://youtube.com/channel/UCabcdefghijkl1234567890',
    'https://m.youtube.com/user/OldSchoolChannel',
  ]);
  assert.deepEqual(list.map(item => item.kind), ['handle', 'channel_id', 'handle', 'channel_id', 'username']);
  assert.equal(list[2].value, '@BudgetLab');
  assert.equal(list[2].url, 'https://www.youtube.com/@BudgetLab');
  assert.equal(list[3].url, 'https://www.youtube.com/channel/UCabcdefghijkl1234567890');
  assert.equal(list[4].url, 'https://www.youtube.com/user/OldSchoolChannel');
  assert.deepEqual(competitorList(undefined), []);
  assert.deepEqual(competitorList([]), []);
});

test('competitor references reject non-channel links, duplicates, other hosts and more than ten entries', () => {
  assert.throws(() => competitorList(['https://www.youtube.com/watch?v=abcdefghijk']), /not channel identities/i);
  assert.throws(() => competitorList(['https://www.youtube.com/c/CustomName']), /not channel identities/i);
  assert.throws(() => competitorList(['https://example.com/@lookalike']), /youtube\.com channel URLs/i);
  assert.throws(() => competitorList(['http://www.youtube.com/@plainhttp']), /youtube\.com channel URLs/i);
  assert.throws(() => competitorList(['https://user:pass@www.youtube.com/@secret']), /youtube\.com channel URLs/i);
  assert.throws(() => competitorList(['@SameChannel', '@samechannel']), /listed twice/i);
  assert.throws(() => competitorList(['not a channel']), /not a YouTube channel/i);
  assert.throws(() => competitorList('@single'), /at most 10/i);
  assert.throws(() => competitorList(Array.from({length: 11}, (_, index) => `@channel${index + 100}`)), /at most 10/i);
});

test('families store competitors, legacy families hydrate with none, and competitor edits keep approvals', t => {
  const store = memory(t);
  const family = store.saveFamily({...familyFixture, competitors: ['@MoneyExplained', 'https://www.youtube.com/@BudgetLab']});
  assert.deepEqual(family.competitors.map(item => item.value), ['@MoneyExplained', '@BudgetLab']);
  assert.deepEqual(store.saveFamily({...familyFixture, name: 'No competitors yet'}).competitors, []);

  const content = store.saveContent({familyId: family.id, title: 'Why budgets break in week two', kind: 'fiction', angle: 'Follow one invented household through a month of small leaks.', hook, script, sources: [], rightsConfirmed: true});
  store.reviewContent(content.id, {revision: content.revision, action: 'submit'});
  store.reviewContent(content.id, {revision: content.revision, action: 'approve'});

  const updated = store.saveFamily({...familyFixture, revision: family.revision, competitors: ['@MoneyExplained', '@BudgetLab', '@ThirdCompetitor']}, family.id);
  assert.equal(updated.revision, family.revision + 1);
  assert.equal(updated.competitors.length, 3);
  assert.equal(store.content(content.id).state, 'approved', 'competitor changes are research inputs and must not revoke an approved script');

  const legacy = store.family(family.id);
  delete legacy.competitors;
  store.db.prepare('UPDATE families SET payload=? WHERE id=?').run(JSON.stringify(legacy), family.id);
  assert.deepEqual(store.family(family.id).competitors, []);
  assert.throws(() => store.saveFamily({...familyFixture, revision: updated.revision, competitors: ['https://www.youtube.com/watch?v=x']}, family.id), /not channel identities/i);
});
