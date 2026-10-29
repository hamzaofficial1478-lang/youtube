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
const F = require('./fonts');

// The page script: the drawn-shot engine (P06d) first, then the templates that call it.
const TEMPLATE_FILES = ['drawn-kit.js', 'drawn-props.js', 'drawn-things.js', 'drawn-figures.js', 'drawn-sets.js', 'drawn-reveal.js', 'drawn-engine.js', 'motion-templates.js'].map(name => path.join(__dirname, name));
// The drawn engines' country shapes (maps.js, 0.36) come first, as data.
const pageScript = () => `window.DMAP=${require('./maps').pageData()};\n` + TEMPLATE_FILES.map(file => fs.readFileSync(file, 'utf8')).join(';\n');
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
// gsap 3.15 and the plugins atelier compositions may use (npm package `gsap`, standard no-charge licence).
const GSAP_FILES = ['gsap', 'SplitText', 'DrawSVGPlugin', 'MorphSVGPlugin', 'MotionPathPlugin', 'CustomEase', 'TextPlugin', 'ScrambleTextPlugin'].map(name => path.join(__dirname, 'node_modules', 'gsap', 'dist', `${name}.min.js`));
let gsapSource = null;
const gsapScript = () => (gsapSource ??= GSAP_FILES.map(file => fs.readFileSync(file, 'utf8')).join(';\n').replace(/<\/script/gi, '<\\/script'));
const warpTime = (anchors, t) => require('./atelier').warpAt(anchors, t);

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
    // A (re)started browser has an empty page: the template script must be injected again (a stalled browser that
    // was restarted kept "injected" and failed with "MOTION is not defined", demo render 2026-10-16).
    this.injected = false; this.dirty = false;
    this.profile = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-profile-'));
    this.child = spawn(this.browser, [
      '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${this.profile}`,
      '--force-device-scale-factor=1', '--force-color-profile=srgb', '--hide-scrollbars', '--mute-audio',
      '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync', '--disable-default-apps',
      '--disable-background-networking', '--disable-component-update', '--disable-gpu', '--host-resolver-rules=MAP * ~NOTFOUND',
      'about:blank',
    ], {stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true});
    let stderr = '', failed = false;
    this.child.stderr.on('data', chunk => { stderr += chunk; });
    this.child.on('error', () => { failed = true; });
    // Edge can hand the launch to a relaunched process, so the launcher's stderr may stay silent and the
    // launcher may exit at once. Chromium also writes the port to DevToolsActivePort in the profile, which
    // is the reliable source; the stderr line is the fallback.
    const deadline = Date.now() + this.timeoutMs;
    let port = null;
    while (!port) {
      if (failed) throw new InputError('The browser could not be started.', 503);
      try {
        const [line, browserPath] = fs.readFileSync(path.join(this.profile, 'DevToolsActivePort'), 'utf8').split(/\r?\n/);
        if (/^\d+$/.test(line)) { port = line; this.browserPath = browserPath; }
      } catch { /* not written yet */ }
      const match = !port && stderr.match(/DevTools listening on ws:\/\/[^:/]+:(\d+)(\/\S+)/);
      if (match) { port = match[1]; this.browserPath = match[2]; }
      if (!port) {
        if (Date.now() > deadline) throw new InputError('The browser did not start in time.', 504);
        await sleep(100);
      }
    }
    this.port = port;
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
  // Renders one graphic to numbered lossless PNG frames (f00000.png ...; `format: 'jpeg'` exists for quick
  // previews only). Returns the frame count, the frame pattern and a hash of all frames.
  async render({template, data, palette, fonts, finish = 'clean', drawing = null, vertical = false, width, height, fps, duration, outDir, format = 'png', onFrame = () => {}, images = {}}) {
    if (!this.injected) {
      if (this.dirty) { await this.blank(); this.dirty = false; }
      await this.send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile: false});
      await this.evaluate(pageScript() + '\ntrue');
      this.injected = true;
    }
    // The faces this PC really has (fonts.js): a missing style font is drawn in its chosen look-alike, never an accident.
    fonts = {heading: F.resolve(fonts?.heading), body: F.resolve(fonts?.body), hand: F.resolve(fonts?.hand || 'Segoe Print')};
    const params = {template, data, palette, fonts, finish, drawing, vertical, width, height, fps, duration};
    // Painted pictures (ChatGPT, 2026-10-22) arrive as checked data and are decoded before the layout needs their size.
    await this.evaluate(`window.DIMG = {}; Promise.all(Object.entries(${JSON.stringify(images || {})}).map(([key, src]) => new Promise(done => { const image = new Image(); image.onload = done; image.onerror = done; image.src = src; window.DIMG[key] = image; }))).then(() => true)`);
    await this.evaluate(`MOTION.setup(${JSON.stringify(params)})`);
    // Wait for the named fonts (system fonts resolve immediately; a missing one falls back).
    await this.evaluate(`Promise.all([${JSON.stringify(fonts.heading)}, ${JSON.stringify(fonts.body)}, ${JSON.stringify(fonts.hand)}].map(name => document.fonts.load('40px "' + name + '"'))).then(() => true)`);
    fs.mkdirSync(outDir, {recursive: true});
    const frames = Math.max(1, Math.round(duration * fps)), hash = createHash('sha256');
    for (let index = 0; index < frames; index++) {
      const url = await this.evaluate(`MOTION.renderFrame(${index}/${fps}) && document.getElementById('stage').toDataURL(${format === 'jpeg' ? "'image/jpeg', 0.95" : "'image/png'"})`);
      const bytes = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
      hash.update(bytes);
      fs.writeFileSync(path.join(outDir, `f${String(index).padStart(5, '0')}.${format === 'jpeg' ? 'jpg' : 'png'}`), bytes);
      onFrame(index + 1, frames);
    }
    return {frames, sha256: hash.digest('hex'), pattern: `f%05d.${format === 'jpeg' ? 'jpg' : 'png'}`};
  }
  // One frame as PNG bytes, for checks.
  async frame({template, data, palette, fonts, finish = 'clean', drawing = null, vertical = false, width, height, fps, duration, t, images = {}}) {
    if (!this.injected) {
      if (this.dirty) { await this.blank(); this.dirty = false; }
      await this.send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile: false});
      await this.evaluate(pageScript() + '\ntrue');
      this.injected = true;
    }
    fonts = {heading: F.resolve(fonts?.heading), body: F.resolve(fonts?.body), hand: F.resolve(fonts?.hand || 'Segoe Print')};
    await this.evaluate(`window.DIMG = {}; Promise.all(Object.entries(${JSON.stringify(images || {})}).map(([key, src]) => new Promise(done => { const image = new Image(); image.onload = done; image.onerror = done; image.src = src; window.DIMG[key] = image; }))).then(() => true)`);
    await this.evaluate(`MOTION.setup(${JSON.stringify({template, data, palette, fonts, finish, drawing, vertical, width, height, fps, duration})})`);
    const url = await this.evaluate(`MOTION.renderFrame(${t}) && document.getElementById('stage').toDataURL('image/png')`);
    return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  }
  // ---------------------------------------------------------------- atelier compositions (P06h)
  // Each composition gets a fresh page (its own globals), a strict content policy (nothing outside the page can
  // load), gsap and the atelier runtime; then it is seeked frame by frame and captured as PNG. `warp` maps the
  // render time onto the composition's own time (atelier.warp), so reveals land on the narrator's words.
  // A fresh blank page: new globals, nothing left from the last composition or template.
  async blank() {
    await this.send('Runtime.evaluate', {expression: 'window.__previous = 1'});
    await this.send('Page.navigate', {url: 'about:blank'});
    // On a busy PC the blank page can take seconds; drawing code injected before it arrives would be wiped out
    // ("MOTION is not defined", demo render 2026-10-16). Wait for it, and treat a page that never turns blank
    // as a stalled browser (the render restarts it and draws the shot again).
    let blank = false;
    for (let attempt = 0; attempt < 500 && !blank; attempt++) {
      blank = (await this.send('Runtime.evaluate', {expression: 'typeof window.__previous + document.readyState', returnByValue: true})).result.value === 'undefinedcomplete';
      if (!blank) await sleep(20);
    }
    this.injected = false;
    if (!blank) throw new InputError('The drawing browser did not answer (the page did not reset).', 503);
  }
  async loadComposition({html, frameId, width, height, scale = 1, canvas = '#FFFFFF', duration}) {
    await this.blank();
    this.dirty = true;
    await this.send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: scale, mobile: false});
    const page = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src data:">`
      + `<style>html,body{margin:0;padding:0;width:${width}px;height:${height}px;overflow:hidden;background:${/^#[0-9a-f]{6}$/i.test(canvas) ? canvas : '#FFFFFF'}}[data-composition-id]{position:relative;width:${width}px;height:${height}px;overflow:hidden}</style>`
      + `<script>${gsapScript()}</script><script>${fs.readFileSync(path.join(__dirname, 'atelier-runtime.js'), 'utf8')}</script></head><body>${html}<script>__atelier.init(${JSON.stringify(frameId)}, ${Number(duration)}, ${width}, ${height})</script></body></html>`;
    await this.evaluate(`document.open(); document.write(${JSON.stringify(page)}); document.close(); true`);
    await this.evaluate('document.fonts.ready.then(() => true)');
    return this.evaluate('__atelier.status()');
  }
  // Layout findings at the given composition times: text off the frame, text in the caption band.
  async auditComposition(times) { return this.evaluate(`__atelier.audit(${JSON.stringify(times)})`); }
  // The times at which the loaded composition would fail the render's black-frame check.
  async blackMoments(times) {
    const found = [];
    for (const t of times) {
      await this.evaluate(`__atelier.seek(${Number(t)})`);
      // JPEG is enough to judge darkness and takes about a third of a PNG's time.
      const data = (await this.send('Page.captureScreenshot', {format: 'jpeg', quality: 80, fromSurface: true})).data;
      if (await this.evaluate(`__atelier.blackShare('data:image/jpeg;base64,${data}')`) >= 0.98) found.push(t);
    }
    return found;
  }
  async renderComposition({html, frameId, width, height, scale = 1, canvas, duration, fps, outDir, warp = null, onFrame = () => {}}) {
    const status = await this.loadComposition({html, frameId, width, height, scale, canvas, duration});
    if (!status.ready) throw new InputError(`The composition did not start: ${status.errors[0] || 'no timeline was registered'}.`, 422);
    fs.mkdirSync(outDir, {recursive: true});
    const frames = Math.max(1, Math.round(duration * fps)), hash = createHash('sha256');
    for (let index = 0; index < frames; index++) {
      const t = index / fps, at = warp ? warpTime(warp, t) : t;
      await this.evaluate(`__atelier.seek(${at})`);
      const bytes = Buffer.from((await this.send('Page.captureScreenshot', {format: 'png', fromSurface: true})).data, 'base64');
      hash.update(bytes);
      fs.writeFileSync(path.join(outDir, `f${String(index).padStart(5, '0')}.png`), bytes);
      onFrame(index + 1, frames);
    }
    return {frames, sha256: hash.digest('hex'), pattern: 'f%05d.png', errors: (await this.evaluate('__atelier.status()')).errors};
  }
  async close() {
    try { this.socket?.close(); } catch { /* already closed */ }
    // Close the browser itself over its own DevTools endpoint: the process we spawned may only have been a
    // launcher, and killing it would leave the real headless browser running.
    if (this.port && this.browserPath) {
      await new Promise(resolve => {
        const timer = setTimeout(resolve, 3000);
        try {
          const browser = new WebSocket(`ws://127.0.0.1:${this.port}${this.browserPath}`);
          browser.onopen = () => browser.send(JSON.stringify({id: 1, method: 'Browser.close'}));
          browser.onclose = browser.onerror = () => { clearTimeout(timer); resolve(); };
        } catch { clearTimeout(timer); resolve(); }
      });
      this.port = null;
    }
    if (this.child && this.child.exitCode === null) {
      this.child.kill();
      await new Promise(resolve => { const timer = setTimeout(resolve, 3000); this.child.once('exit', () => { clearTimeout(timer); resolve(); }); });
    }
    // The browser releases its profile a moment after it exits.
    for (let attempt = 0; attempt < 20 && this.profile; attempt++) {
      try { fs.rmSync(this.profile, {recursive: true, force: true}); break; } catch { await sleep(250); }
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

module.exports = {MotionRenderer, inspectBrowser, findBrowser, TEMPLATE_FILES};
