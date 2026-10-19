'use strict';
// 0.41: the program knows which fonts this PC has (from the files' own name tables) and draws a missing style font in
// a chosen look-alike (video-use: "fonts fail silently").
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const F = require('../fonts');

test('a missing font is replaced by its look-alike; an installed one is kept', () => {
  const names = new Set(['georgia', 'segoe ui', 'bahnschrift', 'segoe print', 'caveat']);
  assert.equal(F.resolve('Caveat', names), 'Caveat');
  assert.equal(F.resolve('Source Serif 4', names), 'Georgia');
  assert.equal(F.resolve('Inter', names), 'Segoe UI');
  assert.equal(F.resolve('Bebas Neue', names), 'Bahnschrift');
  assert.equal(F.resolve('Some Unknown Serif', names), 'Georgia', 'a serif keeps a serif look');
  assert.equal(F.resolve('Some Unknown Face', names), 'Segoe UI');
  assert.deepEqual(F.missing({headingFont: 'Source Serif 4', bodyFont: 'Inter'}, names), [{font: 'Source Serif 4', instead: 'Georgia'}, {font: 'Inter', instead: 'Segoe UI'}]);
  assert.deepEqual(F.withFonts({typography: {headingFont: 'Inter', bodyFont: 'Caveat'}}, names).typography, {headingFont: 'Segoe UI', bodyFont: 'Caveat'});
  assert.equal(F.resolve('Anything', new Set()), 'Anything', 'without a readable font folder every name is kept');
});

const fontsDir = path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts');
test('family names are read from the font files themselves', {skip: fs.existsSync(path.join(fontsDir, 'georgia.ttf')) ? false : 'No Windows fonts here'}, () => {
  assert.ok(F.familyNames(path.join(fontsDir, 'georgia.ttf')).has('georgia'));
  const installed = F.installed();
  assert.ok(installed.has('segoe ui') && installed.has('georgia'));
  const {LAUNCH_PROFILES} = require('../style');
  for (const profile of LAUNCH_PROFILES) assert.deepEqual(F.missing(profile.spec.typography, installed).filter(item => !['Patrick Hand', 'Caveat'].includes(item.font)), [], `${profile.key} uses fonts Windows ships with`);
});
