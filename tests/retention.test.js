'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../retention');

const good = {
  hook: 'In 170 AD, the most powerful man on Earth wrote three lines to himself every night.',
  script: [
    'In 170 AD, the most powerful man on Earth wrote three lines to himself every night. By the end of this video you will know the exact routine Marcus Aurelius used, and how to run it in five minutes tonight. But the strangest part is who he was writing to.',
    'The first line was about anger. Marcus ruled Rome from a tent on the Danube, and his letters show he lost his temper with his generals almost daily. So why did a man with unlimited power need a notebook?',
    'Here is where it gets stranger. Historians found that the notebook was never meant for readers at all. The second line was a question he asked himself, and the answer changed how he treated his own soldiers. But that was not the hardest part.',
    'The third line was the one he struggled with for 19 years: one thing he would do differently tomorrow. Tonight, take five minutes and write your own three lines, the way Marcus did on the Danube. If you want the letters that prove it, subscribe for the next one.',
  ].join('\n\n'),
};

test('a script with a cold open, a promise, specifics, pulls, a re-hook, a payoff and one late CTA passes', () => {
  const result = R.check({...good, locale: 'en-US'});
  assert.equal(result.applicable, true);
  assert.deepEqual(result.checks.filter(item => !item.passed).map(item => item.key), []);
  assert.match(result.checks.find(item => item.key === 'oneCta').detail, /One call to action at the end/);
  assert.equal(result.checks.find(item => item.key === 'payoff').passed, true);
  assert.match(result.checks.find(item => item.key === 'beats').detail, /3 of 3 sections/);
});

test('a greeting, no promise, vague words, flat sections and early CTAs are each named', () => {
  const flat = 'Hey guys, welcome back to the channel. Please subscribe and hit the bell. Today we talk about something amazing that happened a long time ago to a very powerful person who did many important things.';
  const result = R.check({hook: 'Hey guys, welcome back to the channel.', script: [flat, 'He did a lot of things. He was very important. People liked him a lot.', 'He wrote things down. It was good for him. It helped a lot.', 'That is the story. Thanks for watching. Like this video and subscribe.'].join('\n\n'), locale: 'en'});
  const failed = Object.fromEntries(result.checks.filter(item => !item.passed).map(item => [item.key, item.detail]));
  assert.match(failed.noIntro, /hey guys|welcome back to/i);
  assert.ok(failed.promise && failed.specific && failed.beats && failed.rehook);
  assert.match(failed.oneCta, /calls to action/);
});

test('other languages and very short drafts are not judged', () => {
  assert.equal(R.check({...good, locale: 'es-419'}).applicable, false);
  assert.equal(R.check({hook: 'Short.', script: 'Too short to judge.', locale: 'en'}).applicable, false);
  assert.equal(R.concreteCount('In 1602 the Dutch sold shares. Amsterdam grew.'), 2, 'a name that starts a sentence is not counted');
});
