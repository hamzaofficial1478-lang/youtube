'use strict';
// 0.104 (owner 2026-11-10: "the program should keep working while the laptop goes to sleep"): while work runs the program
// asks Windows not to sleep on its own, through a helper that ends with the program, and lets it sleep when idle.
const test = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {KeepAwake, script} = require('../keep-awake');

test('the PC is kept awake only while work runs, by a helper that ends with the program', () => {
  const started = [];
  const run = (command, args) => { const child = new EventEmitter(); child.killed = false; child.kill = () => { child.killed = true; child.emit('exit'); }; started.push({command, args, child}); return child; };
  const awake = new KeepAwake({platform: 'win32', run, parent: 4242});
  assert.equal(awake.set(false), false, 'idle: nothing runs');
  assert.equal(awake.set(true), true);
  assert.equal(awake.set(true), true);
  assert.equal(started.length, 1, 'one helper, however often the program checks');
  assert.equal(started[0].command, 'powershell.exe');
  assert.match(started[0].args.at(-1), /SetThreadExecutionState\(2147483649\)/, 'system required, display may turn off');
  assert.match(started[0].args.at(-1), /Get-Process -Id 4242/, 'it ends by itself when the program is gone');
  assert.equal(awake.set(false), false);
  assert.equal(started[0].child.killed, true, 'idle again: the helper is stopped and the PC may sleep');
  awake.set(true);
  started[1].child.emit('exit');
  assert.equal(awake.state().awake, false, 'a helper that ended is noticed');
  assert.equal(new KeepAwake({platform: 'linux', run}).set(true), false, 'only on Windows');
  assert.equal(started.length, 2);
  assert.match(script(1), /while \(Get-Process -Id 1 /);
});
