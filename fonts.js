'use strict';
// Installed fonts (0.41). A style names its fonts; a font that is not installed is silently replaced by the browser or
// libass with some other face (the 0.41 study of video-use: "fonts fail silently"). Here the program reads the family
// names inside the installed font files (Windows and per-user font folders), so it knows what this PC really has,
// and swaps a missing font for a chosen look-alike instead of an accidental one.
const fs = require('node:fs');
const path = require('node:path');

// Look-alikes that ship with Windows 10/11, by the character of the missing font.
const STANDIN = Object.freeze({
  'source serif 4': 'Georgia', 'source serif pro': 'Georgia', 'playfair display': 'Georgia', 'lora': 'Georgia', 'merriweather': 'Georgia', 'libre baskerville': 'Georgia', 'crimson text': 'Georgia', 'eb garamond': 'Georgia',
  'inter': 'Segoe UI', 'roboto': 'Segoe UI', 'open sans': 'Segoe UI', 'lato': 'Segoe UI', 'poppins': 'Segoe UI', 'karla': 'Segoe UI', 'helvetica': 'Arial', 'helvetica neue': 'Arial',
  'bebas neue': 'Bahnschrift', 'montserrat': 'Bahnschrift', 'oswald': 'Bahnschrift', 'anton': 'Impact', 'league gothic': 'Bahnschrift',
  'patrick hand': 'Segoe Print', 'caveat': 'Segoe Print', 'kalam': 'Segoe Print', 'indie flower': 'Segoe Print', 'permanent marker': 'Segoe Print',
});
const SERIF = /serif|garamond|baskerville|times|georgia|playfair|lora|merriweather|crimson/i;
// Fonts to choose from (0.64, owner request 2026-10-28: "add more fonts"): the families every Windows 10/11 PC has,
// then free (OFL) families that look great once installed; a missing one is drawn in its look-alike above.
const CHOICES = Object.freeze([
  ...['Segoe UI', 'Segoe UI Semibold', 'Segoe UI Black', 'Arial', 'Arial Black', 'Calibri', 'Candara', 'Corbel', 'Tahoma', 'Verdana', 'Trebuchet MS', 'Franklin Gothic Medium', 'Gadugi', 'Leelawadee UI', 'Nirmala UI', 'Ebrima', 'Microsoft Sans Serif'].map(name => ({name, group: 'sans', windows: true})),
  ...['Georgia', 'Cambria', 'Constantia', 'Palatino Linotype', 'Times New Roman', 'Sitka Heading', 'Sitka Text', 'Sylfaen'].map(name => ({name, group: 'serif', windows: true})),
  ...['Impact', 'Bahnschrift', 'Gabriola'].map(name => ({name, group: 'display', windows: true})),
  ...['Segoe Print', 'Segoe Script', 'Ink Free', 'Comic Sans MS', 'MV Boli'].map(name => ({name, group: 'hand', windows: true})),
  ...['Consolas', 'Courier New', 'Lucida Console'].map(name => ({name, group: 'mono', windows: true})),
  ...['Inter', 'Roboto', 'Open Sans', 'Lato', 'Poppins', 'Montserrat', 'Karla'].map(name => ({name, group: 'sans', windows: false})),
  ...['Playfair Display', 'Merriweather', 'Lora', 'Source Serif 4', 'EB Garamond', 'Libre Baskerville', 'Crimson Text'].map(name => ({name, group: 'serif', windows: false})),
  ...['Bebas Neue', 'Anton', 'Oswald', 'League Gothic'].map(name => ({name, group: 'display', windows: false})),
  ...['Patrick Hand', 'Caveat', 'Kalam', 'Indie Flower', 'Permanent Marker'].map(name => ({name, group: 'hand', windows: false})),
]);
// The choices with whether this PC has each one (every name counts as installed where no font folder is readable).
const choices = (names = installed()) => CHOICES.map(item => ({...item, installed: has(item.name, names), ...(has(item.name, names) ? {} : {instead: resolve(item.name, names)})}));

function familyNames(file) {
  const names = new Set();
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const read = (offset, length) => { const buffer = Buffer.alloc(length); fs.readSync(fd, buffer, 0, length, offset); return buffer; };
    const head = read(0, 12);
    const fonts = head.toString('latin1', 0, 4) === 'ttcf' ? [...Array(Math.min(head.readUInt32BE(8), 32)).keys()].map(k => read(12 + 4 * k, 4).readUInt32BE(0)) : [0];
    for (const base of fonts) {
      const count = read(base + 4, 2).readUInt16BE(0), records = read(base + 12, 16 * count);
      for (let k = 0; k < count; k++) {
        if (records.toString('latin1', 16 * k, 16 * k + 4) !== 'name') continue;
        const at = records.readUInt32BE(16 * k + 8), size = Math.min(records.readUInt32BE(16 * k + 12), 1 << 20), table = read(at, size);
        const total = table.readUInt16BE(2), strings = table.readUInt16BE(4);
        for (let r = 0; r < total; r++) {
          const o = 6 + 12 * r, platform = table.readUInt16BE(o), id = table.readUInt16BE(o + 6), length = table.readUInt16BE(o + 8), start = strings + table.readUInt16BE(o + 10);
          if ((id !== 1 && id !== 16) || start + length > table.length) continue;
          const raw = table.subarray(start, start + length);
          const value = platform === 3 || platform === 0 ? Buffer.from(raw).swap16().toString('utf16le') : raw.toString('latin1');
          if (value.trim()) names.add(value.trim().toLowerCase());
        }
      }
    }
  } catch { /* an unreadable or odd font file is simply skipped */ } finally { if (fd !== undefined) fs.closeSync(fd); }
  return names;
}

let cache = null;
// Every installed family name (lower case), read once per process.
function installed(dirs = [path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts'), ...(process.env.LOCALAPPDATA ? [path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Windows', 'Fonts')] : [])]) {
  if (cache) return cache;
  const names = new Set();
  for (const dir of dirs) {
    let files = [];
    try { files = fs.readdirSync(dir); } catch { continue; }
    for (const file of files) if (/\.(ttf|otf|ttc)$/i.test(file)) for (const name of familyNames(path.join(dir, file))) names.add(name);
  }
  cache = names;
  return names;
}
const has = (name, names = installed()) => !names.size || names.has(String(name || '').trim().toLowerCase());
// The font to use for a style's font: itself when installed, else its look-alike (serif faces fall back to Georgia,
// others to Segoe UI). Without a readable font folder (not Windows) every name is kept.
function resolve(name, names = installed()) {
  const value = String(name || '').trim();
  if (!value || has(value, names)) return value || 'Segoe UI';
  return STANDIN[value.toLowerCase()] || (SERIF.test(value) ? 'Georgia' : 'Segoe UI');
}
// A style's fonts that this PC does not have, each with the face that will be used instead.
const missing = (typography, names = installed(), extra = []) => [...['headingFont', 'bodyFont'].map(key => typography?.[key]), ...extra].filter((name, k, all) => name && all.indexOf(name) === k && !has(name, names)).map(name => ({font: name, instead: resolve(name, names)}));
// A copy of a spec whose fonts are the ones that will really be drawn.
const withFonts = (spec, names = installed()) => (spec?.typography ? {...spec, typography: {...spec.typography, headingFont: resolve(spec.typography.headingFont, names), bodyFont: resolve(spec.typography.bodyFont, names)}, ...(spec.captions?.font ? {captions: {...spec.captions, font: resolve(spec.captions.font, names)}} : {})} : spec);

module.exports = {STANDIN, CHOICES, choices, familyNames, installed, has, resolve, missing, withFonts};
