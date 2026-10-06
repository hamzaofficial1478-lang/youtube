'use strict';
// P06b - Canvas motion-graphics renderer. Drives a locally installed Chromium browser (Microsoft Edge is
// preinstalled on Windows) over the DevTools Protocol with Node's built-in WebSocket: no npm packages.
// The page is about:blank with our own template script injected (motion-templates.js); networking is
// blocked by host-resolver rules, the profile is a throwaway folder, and pixels come from the canvas
// itself, never from screenshots. One browser per job, frames rendered one at a time as a pure function of t.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {createHash} = require('node:crypto');
const {InputError} = require('./store');

const TEMPLATE_FILE = path.join(__dirname, 'motion-templates.js');
const BROWSER_CANDIDATES = [
  process.env.MOTION_BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/microsoft-edge', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha256 = value => createHash('sha256').update(value).digest('hex');

function findBrowser() { return BROWSER_CANDIDATES.find(file => { try { return fs.statSync(file).isFile(); } catch { return false; } }) || null; }

class MotionRenderer {
  constructor({browser = findBrowser(), timeoutMs = 30000} = {}) {
    this.browser = browser;
    this.timeoutMs = timeoutMs;
    this.child = null;
    this.socket = null;
    this.pending = new Map();
    this.nextId = 0;
  }
  async start() {
    if (!this.browser) throw new InputError('No Chromium browser was found. Install Microsoft Edge or Google Chrome, or set MOTION_BROWSER.', 503);
    this.profile = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-profile-'));
    this.child = spawn(this.browser, [
      '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${this.profile}`,
      '--force-device-scale-factor=1', '--force-color-profile=srgb', '--hide-scrollbars', '--mute-audio',
      '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync', '--disable-default-apps',
      '--disable-background-networking', '--disable-component-update', '--disable-gpu', '--host-resolver-rules=MAP * ~NOTFOUND',
      'about:blank',
    ], {stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true});
    let stderr = '';
    const endpoint = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new InputError('The browser did not start in time.', 504)), this.timeoutMs);
      this.child.on('error', () => { clearTimeout(timer); reject(new InputError('The browser could not be started.', 503)); });
      this.child.stderr.on('data', chunk => {
        stderr += chunk;
        const match = stderr.match(/DevTools listening on (ws:\/\/\S+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    const port = new URL(endpoint).port;
    let pageSocket = null;
    for (let attempt = 0; attempt < 50 && !pageSocket; attempt++) {
      try { pageSocket = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(item => item.type === 'page')?.webSocketDebuggerUrl || null; } catch { /* still starting */ }
      if (!pageSocket) await sleep(100);
    }
    if (!pageSocket) throw new InputError('The browser page did not become available.', 504);
    this.socket = new WebSocket(pageSocket);
    await new Promise((resolve, reject) => { this.socket.onopen = resolve; this.socket.onerror = () => reject(new InputError('Could not connect to the browser.', 503)); });
    this.socket.onmessage = event => {
      const message = JSON.parse(event.data);
      const handler = this.pending.get(message.id);
      if (handler) { this.pending.delete(message.id); handler(message); }
    };
    this.version = (await this.send('Runtime.evaluate', {expression: 'navigator.userAgent', returnByValue: true})).result.value;
    return this;
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new InputError(`The browser did not answer ${method} in time.`, 504)); }, this.timeoutMs);
      this.pending.set(id, message => { clearTimeout(timer); if (message.error) reject(new InputError(`Browser error: ${message.error.message}`, 502)); else resolve(message.result); });
      this.socket.send(JSON.stringify({id, method, params}));
    });
  }
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
    if (result.exceptionDetails) throw new InputError(`Motion template error: ${result.exceptionDetails.exception?.description?.split('\n')[0] || result.exceptionDetails.text}`, 502);
    return result.result.value;
  }
  // Renders one graphic to numbered PNG frames (f00000.png ...). Returns the frame count and a hash of all frames.
  async render({template, data, palette, fonts, finish = 'clean', vertical = false, width, height, fps, duration, outDir, onFrame = () => {}}) {
    if (!this.injected) {
      await this.send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile: false});
      await this.evaluate(fs.readFileSync(TEMPLATE_FILE, 'utf8') + '\ntrue');
      this.injected = true;
    }
    const params = {template, data, palette, fonts, finish, vertical, width, height, fps, duration};
    await this.evaluate(`MOTION.setup(${JSON.stringify(params)})`);
    // Wait for the named fonts (system fonts resolve immediately; a missing one falls back).
    await this.evaluate(`Promise.all([${JSON.stringify(fonts.heading)}, ${JSON.stringify(fonts.body)}, ${JSON.stringify(fonts.hand)}].map(name => document.fonts.load('40px "' + name + '"'))).then(() => true)`);
    fs.mkdirSync(outDir, {recursive: true});
    const frames = Math.max(1, Math.round(duration * fps)), hash = createHash('sha256');
    for (let index = 0; index < frames; index++) {
      const url = await this.evaluate(`MOTION.renderFrame(${index}/${fps}) && document.getElementById('stage').toDataURL('image/png')`);
      const png = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
      hash.update(png);
      fs.writeFileSync(path.join(outDir, `f${String(index).padStart(5, '0')}.png`), png);
      onFrame(index + 1, frames);
    }
    return {frames, sha256: hash.digest('hex')};
  }
  // One frame as PNG bytes, for checks.
  async frame({template, data, palette, fonts, finish = 'clean', vertical = false, width, height, fps, duration, t}) {
    if (!this.injected) {
      await this.send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile: false});
      await this.evaluate(fs.readFileSync(TEMPLATE_FILE, 'utf8') + '\ntrue');
      this.injected = true;
    }
    await this.evaluate(`MOTION.setup(${JSON.stringify({template, data, palette, fonts, finish, vertical, width, height, fps, duration})})`);
    const url = await this.evaluate(`MOTION.renderFrame(${t}) && document.getElementById('stage').toDataURL('image/png')`);
    return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  }
  async close() {
    try { this.socket?.close(); } catch { /* already closed */ }
    if (this.child && this.child.exitCode === null) {
      this.child.kill();
      await new Promise(resolve => { const timer = setTimeout(resolve, 3000); this.child.once('exit', () => { clearTimeout(timer); resolve(); }); });
    }
    for (let attempt = 0; attempt < 5 && this.profile; attempt++) {
      try { fs.rmSync(this.profile, {recursive: true, force: true}); break; } catch { await sleep(200); }
    }
  }
}

// Readiness: is a browser installed, which version, and does the same frame render byte-identically twice?
async function inspectBrowser({browser = findBrowser()} = {}) {
  const report = {checkedAt: new Date().toISOString(), path: browser, passed: false, issues: []};
  if (!browser) { report.issues.push('No Chromium browser found (Microsoft Edge or Google Chrome). Canvas graphics cannot render.'); return report; }
  report.sha256 = sha256(fs.readFileSync(browser));
  const renderer = new MotionRenderer({browser});
  try {
    await renderer.start();
    report.version = `${/msedge/i.test(browser) ? 'Microsoft Edge' : /chrome/i.test(browser) ? 'Google Chrome' : 'Chromium'} ${(renderer.version.match(/(?:Edg|Chrome)\/(\d+)/) || [])[1] || ''}`.trim();
    const sample = {template: 'bar-chart', data: {title: 'Readiness check', items: [{label: 'One', value: 3, prefix: '', suffix: '', decimals: 0}, {label: 'Two', value: 5, prefix: '', suffix: '', decimals: 0}, {label: 'Three', value: 4, prefix: '', suffix: '', decimals: 0}]}, palette: {bg: '#0E0E0E', ink: '#F2EEE6', accent: '#C9A227'}, fonts: {heading: 'Georgia', body: 'Arial', hand: 'Segoe Print'}, width: 640, height: 360, fps: 30, duration: 3};
    const first = sha256(await renderer.frame({...sample, t: 1.2})), second = sha256(await renderer.frame({...sample, t: 1.2}));
    report.determinism = {passed: first === second, hashes: [first, second]};
    if (first !== second) report.issues.push('The same frame rendered twice gave different pixels.');
    report.passed = !report.issues.length;
  } catch (error) {
    report.issues.push(error.message);
  } finally {
    await renderer.close();
  }
  return report;
}

module.exports = {MotionRenderer, inspectBrowser, findBrowser, TEMPLATE_FILE};
