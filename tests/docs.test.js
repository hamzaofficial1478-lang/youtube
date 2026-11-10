'use strict';
// 0.104 (owner question 2026-11-10: "are the docs updated with every program update?"): a release cannot be merged
// while the documents the program and its owner read still name an older version, and the documents the program's
// pages link to exist.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('every release document names the program\'s own version', () => {
  const version = JSON.parse(read('package.json')).version;
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(lock.version, version, 'package-lock.json');
  assert.equal(lock.packages[''].version, version, 'package-lock.json packages');
  assert.equal(JSON.parse(read('docs/build-status.json')).version, version, 'docs/build-status.json (shown on the Build page)');
  assert.ok(read('README.md').split('\n')[2].startsWith(`Version ${version} `), 'README.md line 3');
  assert.ok(read('docs/BUILD-PROGRESS.md').split('\n')[2].includes(`Current application: ${version}`), 'BUILD-PROGRESS.md line 3 (shown on the Build page)');
  assert.ok(read('AGENTS.md').includes(`Current release is ${version} (`), 'AGENTS.md release line');
  assert.ok(read('docs/HANDOFF.md').split('\n')[2].includes(version), 'HANDOFF.md line 3');
});

test('the documents the program\'s pages open, and the room map, exist', () => {
  const server = read('server.js');
  for (const [, file] of server.matchAll(/path\.join\(root,'(docs\/[^']+)'\)/g)) assert.ok(fs.existsSync(path.join(root, file)), file);
  for (const [, file] of read('docs/PRODUCTION-ROOM.md').matchAll(/\]\(([A-Z-]+\.md)\)/g)) assert.ok(fs.existsSync(path.join(root, 'docs', file)), file);
});
