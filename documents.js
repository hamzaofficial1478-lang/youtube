'use strict';
// Script files and planning files (owner request 2026-10-30). A script the owner attaches in Content Studio (plain
// text, Word .docx or PDF) becomes the draft's words; the planning file downloads as a Word document. Only the text is
// read: no macros, scripts or embedded objects are ever run. PDFs are read with Mozilla's pdf.js (Apache-2.0).
const zlib = require('node:zlib');
const {InputError} = require('./store');

const MAX_FILE = 10 * 1024 * 1024;
const MAX_TEXT = 300000; // the script field's own limit

// ---------------------------------------------------------------- zip (the container of a .docx)
// The one stored or deflated part named `wanted`, or null. Offsets come from the central directory, as zip readers do.
function unzip(data, wanted) {
  let end = -1;
  for (let at = data.length - 22; at >= Math.max(0, data.length - 66000); at--) if (data.readUInt32LE(at) === 0x06054b50) { end = at; break; }
  if (end < 0) return null;
  let at = data.readUInt32LE(end + 16);
  for (let k = data.readUInt16LE(end + 10); k > 0 && data.readUInt32LE(at) === 0x02014b50; k--) {
    const method = data.readUInt16LE(at + 10), size = data.readUInt32LE(at + 20), nameLength = data.readUInt16LE(at + 28);
    const skip = 46 + nameLength + data.readUInt16LE(at + 30) + data.readUInt16LE(at + 32), local = data.readUInt32LE(at + 42);
    if (data.toString('utf8', at + 46, at + 46 + nameLength) === wanted) {
      const start = local + 30 + data.readUInt16LE(local + 26) + data.readUInt16LE(local + 28), raw = data.subarray(start, start + size);
      if (method === 0) return raw;
      if (method === 8) return zlib.inflateRawSync(raw, {maxOutputLength: 64 * 1024 * 1024});
      throw new InputError('This Word document is packed in a way the program cannot read. Save it again as .docx and attach it.');
    }
    at += skip;
  }
  return null;
}
// A stored (uncompressed) zip of [{name, data}], enough for Word to open a .docx.
function zip(files) {
  const parts = [], central = [];
  let offset = 0;
  for (const {name, data} of files) {
    const title = Buffer.from(name), crc = zlib.crc32(data), head = Buffer.alloc(30), entry = Buffer.alloc(46);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(33, 12);
    head.writeUInt32LE(crc, 14); head.writeUInt32LE(data.length, 18); head.writeUInt32LE(data.length, 22); head.writeUInt16LE(title.length, 26);
    entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(0x0800, 8); entry.writeUInt16LE(33, 14);
    entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(data.length, 20); entry.writeUInt32LE(data.length, 24); entry.writeUInt16LE(title.length, 28); entry.writeUInt32LE(offset, 42);
    parts.push(head, title, data); central.push(entry, title);
    offset += head.length + title.length + data.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, directory, end]);
}

// ---------------------------------------------------------------- reading
const ENTITIES = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'"};
const xmlText = value => value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (all, code) => (code[0] === '#' ? String.fromCodePoint(code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1))) : ENTITIES[code.toLowerCase()]));
function docxText(data) {
  const xml = unzip(data, 'word/document.xml');
  if (!xml) throw new InputError('This is not a Word document the program can read. Save it as .docx, PDF or plain text and attach it again.');
  // Each paragraph's runs of text, tabs and line breaks, in order.
  return (xml.toString('utf8').match(/<w:p[\s>][\s\S]*?<\/w:p>/g) || [])
    .map(paragraph => [...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\b[^>]*\/>/g)].map(([all, words]) => (words !== undefined ? xmlText(words) : all.startsWith('<w:tab') ? '\t' : '\n')).join(''))
    .join('\n\n');
}
async function pdfText(data) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({data: new Uint8Array(data), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0});
  try {
    const doc = await task.promise;
    if (doc.numPages > 300) throw new InputError('This PDF has more than 300 pages. Attach the script on its own.');
    const paragraphs = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const lines = [];
      let line = null;
      for (const item of (await (await doc.getPage(n)).getTextContent()).items) {
        if (typeof item.str !== 'string') continue;
        const y = item.transform[5];
        if (!line || Math.abs(line.y - y) > Math.max(2, (item.height || 10) / 2)) lines.push(line = {y, text: '', height: 0});
        line.text += item.str;
        line.height = Math.max(line.height, item.height || 0);
        if (item.hasEOL) line = null;
      }
      // A gap clearly wider than the page's usual line spacing starts a new paragraph, and so does a wide gap after a line
      // that ends a sentence (pages whose paragraphs are one line each have no usual spacing to compare with).
      lines.splice(0, lines.length, ...lines.filter(item => item.text.trim()));
      const gaps = lines.slice(1).map((item, k) => lines[k].y - item.y).filter(gap => gap > 0).sort((a, b) => a - b), usual = gaps[Math.floor((gaps.length - 1) / 2)] || 0;
      let current = '';
      lines.forEach((item, k) => {
        const words = item.text.trim();
        if (!words) return;
        const gap = k ? lines[k - 1].y - item.y : 0;
        // A change of type size (a heading) starts one too.
        if (current && gap > 0 && ((usual && gap > usual * 1.45) || (gap > (lines[k - 1].height || 10) * 1.6 && /[.!?:"”’)]$/.test(current)) || Math.abs(lines[k - 1].height - item.height) > 2)) { paragraphs.push(current); current = ''; }
        current = current ? (current.endsWith('-') ? current.slice(0, -1) + words : `${current} ${words}`) : words;
      });
      if (current) paragraphs.push(current);
    }
    return paragraphs.join('\n\n');
  } finally { await task.destroy(); }
}
function plainText(data) {
  if (data[0] === 0xff && data[1] === 0xfe) return data.subarray(2).toString('utf16le');
  if (data[0] === 0xfe && data[1] === 0xff) return Buffer.from(data.subarray(2)).swap16().toString('utf16le');
  return data.toString('utf8').replace(/^﻿/, '');
}
// The script's words from an attached file: {text, kind, words}. One blank line between paragraphs.
async function extractText({name = '', data}) {
  if (!Buffer.isBuffer(data) || !data.length) throw new InputError('The file is empty.');
  if (data.length > MAX_FILE) throw new InputError('The file is larger than 10 MB. Attach the script on its own.');
  const head = data.subarray(0, 5).toString('latin1'), lower = String(name).toLowerCase();
  if (/\.doc$/.test(lower) && !head.startsWith('PK')) throw new InputError('Old Word files (.doc) cannot be read. Open it in Word, choose Save As, pick Word Document (.docx), then attach that.');
  const kind = head === '%PDF-' ? 'pdf' : head.startsWith('PK\u0003\u0004') ? 'docx' : /\.(pdf|docx)$/.test(lower) ? 'broken' : 'txt';
  if (kind === 'broken') throw new InputError(`This ${lower.endsWith('.pdf') ? 'PDF' : 'Word document'} is damaged or not what its name says. Save it again and attach it.`);
  let text;
  try { text = kind === 'pdf' ? await pdfText(data) : kind === 'docx' ? docxText(data) : plainText(data); }
  catch (error) { if (error instanceof InputError) throw error; throw new InputError(`The ${kind === 'pdf' ? 'PDF' : kind === 'docx' ? 'Word document' : 'file'} could not be read${/password/i.test(error?.message || '') ? ' because it is protected by a password' : ''}. Save it again (or as plain text) and attach it.`); }
  text = text.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').split('\n').map(item => item.replace(/[ \t ]+$/, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) throw new InputError(kind === 'pdf' ? 'This PDF has no text the program can read (it may be a scanned picture). Attach the Word file or paste the script instead.' : 'The file has no text.');
  if (text.length > MAX_TEXT) throw new InputError(`The script is longer than ${MAX_TEXT.toLocaleString('en-US')} characters. Attach a shorter file.`);
  return {text, kind, words: text.split(/\s+/).filter(Boolean).length};
}

// ---------------------------------------------------------------- writing (the planning file)
const xmlSafe = value => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f￾￿]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const SIZES = {title: 36, heading: 28, text: 22, small: 18};
// blocks: [{kind: 'title'|'heading'|'text'|'small', text}]; a line break inside a block stays a line break.
function docxFile(blocks) {
  const paragraphs = blocks.map(({kind = 'text', text}) => {
    const runs = String(text ?? '').split('\n').map((line, k) => `${k ? '<w:br/>' : ''}<w:t xml:space="preserve">${xmlSafe(line)}</w:t>`).join('');
    const bold = kind === 'title' || kind === 'heading' ? '<w:b/>' : '', colour = kind === 'small' ? '<w:color w:val="666666"/>' : '';
    return `<w:p><w:pPr><w:spacing w:before="${kind === 'heading' ? 240 : 0}" w:after="120"/></w:pPr><w:r><w:rPr>${bold}${colour}<w:sz w:val="${SIZES[kind] || 22}"/></w:rPr>${runs}</w:r></w:p>`;
  }).join('');
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  return zip([
    {name: '[Content_Types].xml', data: Buffer.from(`${xml}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`)},
    {name: '_rels/.rels', data: Buffer.from(`${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`)},
    {name: 'word/document.xml', data: Buffer.from(`${xml}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`)},
  ]);
}
// The planning file of one draft (store.exportContent), in reading order.
function planningBlocks({family, content, limitations, exportedAt}) {
  const blocks = [{kind: 'title', text: content.title || 'Untitled draft'},
    {kind: 'small', text: `${family.name} · ${family.primaryLocale} · ${content.kind === 'fiction' ? 'Original fiction' : 'Factual / educational'}${content.targetMinutes ? ` · about ${content.targetMinutes} minutes` : ''} · version ${content.revision} · ${content.state} · exported ${String(exportedAt).slice(0, 10)}`}];
  const section = (heading, text) => { if (String(text || '').trim()) blocks.push({kind: 'heading', text: heading}, ...String(text).trim().split(/\n{2,}/).map(paragraph => ({kind: 'text', text: paragraph}))); };
  section('Angle', content.angle);
  section('Hook', content.hook);
  section('Script', content.script);
  if (content.sources?.length) blocks.push({kind: 'heading', text: 'Sources'}, ...content.sources.map((source, k) => ({kind: 'text', text: `S${k + 1}. ${source.title || source.publisher || 'Source'}${source.publisher && source.title ? ` (${source.publisher})` : ''}\n${source.url || ''}`})));
  if (content.scenes?.length) blocks.push({kind: 'heading', text: 'Scene plan (rough timing)'}, ...content.scenes.map(scene => ({kind: 'text', text: `${scene.order}. ${scene.purpose} · about ${scene.durationEstimateSeconds} s\n${scene.narration}`})));
  if (limitations?.length) blocks.push({kind: 'heading', text: 'Notes'}, ...limitations.map(item => ({kind: 'small', text: item})));
  return blocks;
}

// ---------------------------------------------------------------- exports of a list (0.74)
// CSV for spreadsheets: UTF-8 with a byte-order mark (Excel then reads every language), RFC 4180 quoting, and a cell that
// would start a formula (=, +, -, @) is written as text, so a title from YouTube or Reddit can never run in a spreadsheet.
function csvFile(columns, rows) {
  const cell = value => { let text = String(value ?? ''); if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`; return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };
  return Buffer.from(`\ufeff${[columns, ...rows].map(row => row.map(cell).join(',')).join('\r\n')}\r\n`, 'utf8');
}
// The same blocks as the Word file, as a page the browser prints to PDF (A4, the PC's own fonts, every language).
const htmlSafe = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
function blocksHtml(blocks, title) {
  const tag = {title: 'h1', heading: 'h2', small: 'p class="small"', text: 'p'};
  const body = blocks.map(({kind = 'text', text}) => { const open = tag[kind] || 'p'; return `<${open}>${htmlSafe(text).replace(/\n/g, '<br>')}</${open.split(' ')[0]}>`; }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${htmlSafe(title)}</title><style>@page{size:A4;margin:18mm}body{font-family:Segoe UI,Arial,sans-serif;font-size:11pt;line-height:1.45;color:#1d1d1d}h1{font-size:18pt;margin:0 0 6pt}h2{font-size:13pt;margin:14pt 0 4pt;break-after:avoid}p{margin:0 0 6pt;white-space:normal}.small{font-size:9pt;color:#666}</style></head><body>${body}</body></html>`;
}

module.exports = {extractText, docxText, docxFile, planningBlocks, csvFile, blocksHtml, unzip, zip, MAX_FILE};
