'use strict';
// 0.101 (owner 2026-11-10: "a step by step progress that gets marked when each step is finished", and "it still shows
// No scene plan yet while it is drawing the scenes"): the live view names every step, ticks each finished one with its
// time, counts the units of the running step and carries the scenes planned so far.
const test = require('node:test');
const assert = require('node:assert/strict');
const live = require('../live');

test('the live view lists every step, ticks the finished ones, counts the running one and carries the scenes so far', () => {
  live.start('job-1', {room: 'scene', label: 'Planning the scenes', steps: 3, plan: ['Plan part 1 of 2', 'Plan part 2 of 2', 'Drawing and painting the pictures'], contentId: 'c1'});
  live.step('job-1', 1, 'Plan part 1 of 2');
  live.board('job-1', [{n: 1, from: 1, to: 4, purpose: 'hook', direction: 'Open on the shell.', shots: 3}]);
  live.step('job-1', 3, 'Drawing and painting the pictures');
  live.progress('job-1', {done: 1, total: 10, unit: 'pictures', current: 'S20A', finished: ['S21A']});
  const [item] = live.list().filter(entry => entry.id === 'job-1');
  assert.deepEqual(item.plan, ['Plan part 1 of 2', 'Plan part 2 of 2', 'Drawing and painting the pictures']);
  assert.equal(item.step, 3);
  assert.equal(item.times.length, 2, 'both earlier steps are marked finished (the skipped one passed in no time)');
  assert.equal(item.times[1], 0);
  assert.deepEqual(item.sub, {done: 1, total: 10, unit: 'pictures', current: 'S20A', finished: ['S21A']});
  assert.equal(item.board.length, 1);
  live.step('job-1', 3, 'Drawing and painting the pictures');
  assert.ok(live.list().find(entry => entry.id === 'job-1').sub === null, 'a new step starts without the old count');
  live.end('job-1');
  assert.equal(live.list().filter(entry => entry.id === 'job-1').length, 0);
});
