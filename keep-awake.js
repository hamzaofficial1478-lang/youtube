'use strict';
// Keep the PC awake while the program works (0.104, owner 2026-11-10: "the program should keep working while the laptop
// goes to sleep"). A sleeping PC stops every running program, so the program asks Windows not to sleep on its own while
// a storyboard, drawing, render, narration or other AI job runs, and lets it sleep again when the work is done. It uses
// Windows' own SetThreadExecutionState (system required, display may still turn off) from a small PowerShell helper that
// ends by itself when the program is gone, so a crash never leaves the PC unable to sleep.
// Closing a laptop's lid or pressing its sleep button still sleeps it: that is the owner's choice in Windows' power
// settings ("When I close the lid: Do nothing" keeps it working), and the program says so.
const {spawn} = require('node:child_process');

const ES_CONTINUOUS_SYSTEM = 0x80000001;
const script = parent => [
  "$s='[DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint f);'",
  '$k=Add-Type -MemberDefinition $s -Name Awake -Namespace ControlRoom -PassThru',
  `while (Get-Process -Id ${Number(parent)} -ErrorAction SilentlyContinue) { $null=$k::SetThreadExecutionState(${ES_CONTINUOUS_SYSTEM}); Start-Sleep -Seconds 30 }`,
].join('; ');

class KeepAwake {
  constructor({platform = process.platform, run = spawn, parent = process.pid} = {}) {
    this.platform = platform;
    this.run = run;
    this.parent = parent;
    this.child = null;
    this.since = null;
  }
  // busy: true while any work runs. Returns whether the PC is being kept awake.
  set(busy) {
    if (this.platform !== 'win32') return false;
    if (busy && !this.child) {
      try {
        const child = this.run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script(this.parent)], {windowsHide: true, stdio: 'ignore'});
        child.on('exit', () => { if (this.child === child) { this.child = null; this.since = null; } });
        child.on('error', () => { if (this.child === child) { this.child = null; this.since = null; } });
        this.child = child;
        this.since = new Date().toISOString();
      } catch { this.child = null; }
    } else if (!busy && this.child) this.stop();
    return !!this.child;
  }
  stop() { try { this.child?.kill(); } catch { /* already gone */ } this.child = null; this.since = null; }
  state() { return {platform: this.platform, awake: !!this.child, since: this.since}; }
}

module.exports = {KeepAwake, script};
