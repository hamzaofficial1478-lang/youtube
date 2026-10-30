'use strict';
// 0.73 (owner request 2026-10-30): a script attached in Content Studio (TXT, Word .docx, PDF) becomes the draft's words,
// and the planning file downloads as a Word document.
const test = require('node:test');
const assert = require('node:assert/strict');
const {extractText, docxFile, docxText, planningBlocks} = require('../documents');

// A small real PDF: one page, Helvetica, three lines with a wider gap before the last (a new paragraph).
function pdf(lines) {
  const stream = `BT /F1 12 Tf 72 720 Td ${lines.map(([text, gap], k) => `${k ? `0 -${gap} Td ` : ''}(${text}) Tj`).join(' ')} ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let body = '%PDF-1.4\n';
  const offsets = objects.map((object, k) => { const at = body.length; body += `${k + 1} 0 obj\n${object}\nendobj\n`; return at; });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(at => `${String(at).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

test('attached scripts: plain text, Word and PDF become the same plain words with paragraphs kept', async () => {
  const words = 'You opened a casino in the stone age.\n\nNobody had money, only shells.';
  assert.deepEqual(await extractText({name: 'script.txt', data: Buffer.from(`﻿${words.replace(/\n/g, '\r\n')}\r\n\r\n\r\n`)}), {text: words, kind: 'txt', words: 13});
  assert.equal((await extractText({name: 'script.txt', data: Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Café — first line.', 'utf16le')])})).text, 'Café — first line.');
  // A Word file made by the program reads back paragraph by paragraph (accents, quotes, ampersands, tabs).
  const word = docxFile([{kind: 'title', text: 'Stone Age Casino'}, {kind: 'text', text: 'The café was full & loud: "deal!"'}, {kind: 'text', text: 'Line one\nline two'}]);
  assert.equal(word.subarray(0, 4).toString('latin1'), 'PK\u0003\u0004');
  const docx = await extractText({name: 'script.docx', data: word});
  assert.equal(docx.kind, 'docx');
  assert.equal(docx.text, 'Stone Age Casino\n\nThe café was full & loud: "deal!"\n\nLine one\nline two');
  // A PDF with a wider gap starts a new paragraph.
  const read = await extractText({name: 'script.pdf', data: pdf([['First line of the hook.', 0], ['It keeps going here.', 14], ['A new paragraph starts.', 40]])});
  assert.deepEqual([read.kind, read.text], ['pdf', 'First line of the hook. It keeps going here.\n\nA new paragraph starts.']);
  // What cannot be read says what to do.
  await assert.rejects(extractText({name: 'old.doc', data: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 1, 2, 3])}), /Old Word files \(\.doc\)[\s\S]*Save As/);
  await assert.rejects(extractText({name: 'broken.pdf', data: Buffer.from('not a pdf at all')}), /damaged or not what its name says/);
  await assert.rejects(extractText({name: 'empty.txt', data: Buffer.alloc(0)}), /empty/);
  await assert.rejects(extractText({name: 'blank.pdf', data: pdf([[' ', 0]])}), /no text the program can read/);
  await assert.rejects(extractText({name: 'big.txt', data: Buffer.alloc(11 * 1024 * 1024, 65)}), /larger than 10 MB/);
  assert.throws(() => docxText(Buffer.from('PK\u0003\u0004 not really a zip')), /not a Word document/);
});

test('the planning file is a Word document with the draft in reading order', () => {
  const blocks = planningBlocks({exportedAt: '2026-10-30T10:00:00Z', family: {name: 'Stone Age Laughs', primaryLocale: 'en-US'},
    content: {title: 'You opened a casino in the stone age', kind: 'fiction', targetMinutes: 3, revision: 2, state: 'draft', angle: 'Humour that teaches.', hook: 'You opened a casino.', script: 'Para one.\n\nPara two.', sources: [{title: 'Shell money', publisher: 'Museum', url: 'https://example.org/shells'}], scenes: [{order: 1, purpose: 'Hook', durationEstimateSeconds: 8, narration: 'Para one.'}]},
    limitations: ['Planning document only.']});
  assert.deepEqual(blocks.filter(item => item.kind === 'heading').map(item => item.text), ['Angle', 'Hook', 'Script', 'Sources', 'Scene plan (rough timing)', 'Notes']);
  assert.match(blocks[1].text, /Stone Age Laughs · en-US · Original fiction · about 3 minutes · version 2/);
  const text = docxText(docxFile(blocks));
  assert.match(text, /^You opened a casino in the stone age\n\n[\s\S]*Script\n\nPara one\.\n\nPara two\.[\s\S]*S1\. Shell money \(Museum\)\nhttps:\/\/example\.org\/shells/);
});
