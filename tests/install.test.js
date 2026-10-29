'use strict';
// The Windows installer, updater and launcher (0.66, owner request 2026-10-29: "make the program workable on other
// PCs"). They run under Windows PowerShell 5.1, which cannot be run here, so these checks guard what breaks them:
// line endings, plain ASCII (5.1 reads a file without a byte-order mark as ANSI), https-only downloads checked by
// SHA-256, and the runtime folder kept out of git.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'latin1');

test('0.66 the installer and updater: Windows line endings, plain ASCII, https downloads checked by SHA-256, runtime kept out of git', () => {
  for (const name of ['Install Control Room.cmd', 'Update Control Room.cmd', 'Start Control Room.cmd', 'scripts/Install-ControlRoom.ps1', 'scripts/Update-ControlRoom.ps1', 'scripts/Start-ControlRoom.ps1', 'scripts/Stop-ControlRoom.ps1']) {
    const text = read(name);
    assert.ok(!/[^\x00-\x7F]/.test(text), `${name} is plain ASCII`);
    assert.equal(text.split('\n').length, text.split('\r\n').length, `${name} has Windows line endings only`);
  }
  for (const [cmd, script] of [['Install Control Room.cmd', 'Install-ControlRoom.ps1'], ['Update Control Room.cmd', 'Update-ControlRoom.ps1']]) {
    assert.match(read(cmd), new RegExp(`-File "%~dp0scripts\\\\${script}"`));
    assert.ok(fs.existsSync(path.join(root, 'scripts', script)));
  }
  const install = read('scripts/Install-ControlRoom.ps1');
  const urls = install.match(/'https?:\/\/[^']+'/g);
  assert.ok(urls.length >= 4 && urls.every(url => url.startsWith("'https://")), 'every download is https');
  assert.match(install, /\$ffmpegPinnedSha256 = '[0-9a-f]{64}'/);
  assert.match(install, /Get-Verified \(\$nodeFolder \+ \$parts\[1\]\) \$parts\[0\] \$zip/, 'Node is checked against nodejs.org\'s SHASUMS256.txt');
  assert.match(install, /Get-Verified \$url \$sha256 \$zip/, 'FFmpeg is checked against its pinned or published checksum');
  assert.match(install, /git reset -q --hard origin\/main/);
  assert.ok(fs.readFileSync(path.join(root, '.gitignore'), 'utf8').split('\n').includes('runtime/'), 'the downloaded tools never reach git');
  const start = read('scripts/Start-ControlRoom.ps1');
  assert.match(start, /runtime'\r?\n|Join-Path \$programDirectory 'runtime'/);
  assert.match(start, /\$env:FFMPEG_PATH = \$bundledFfmpeg/);
  assert.ok(!start.includes('$nodeCommand'), 'the launcher uses the found Node everywhere');
  const update = read('scripts/Update-ControlRoom.ps1');
  assert.match(update, /merge -q --ff-only origin\/main/, 'an update never rewrites history or local work');
  assert.match(update, /status --porcelain --untracked-files=no/);
});
