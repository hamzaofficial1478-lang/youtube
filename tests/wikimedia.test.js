'use strict';
// 0.57: Wikimedia Commons as a licensed image source (public domain, CC0 and CC BY only). No test leaves this PC.
const test = require('node:test');
const assert = require('node:assert/strict');
const VS = require('../visual-sources');
const {Store} = require('../store');
const {ConnectorSlots} = require('../connectors');
const {QuotaLedger} = require('../intel-sources');
const {credits} = require('../packaging');

const json = body => new Response(JSON.stringify(body), {status: 200, headers: {'content-type': 'application/json'}});
const original = name => ({mediatype: 'BITMAP', width: 2400, height: 1600, url: `https://upload.wikimedia.org/wikipedia/commons/a/ab/${name}?utm_source=commons.wikimedia.org&utm_campaign=rest&utm_content=original`});
const PAGES = {
  'File:Port_of_Mocha_1737.jpg': '== {{int:license-header}} ==\n{{PD-Art|PD-old-100-expired}}\n{{Information\n|Author=[[w:Jacques-Nicolas Bellin|Jacques-Nicolas Bellin]]\n}}',
  'File:Coffee_cup.jpg': '{{Information\n|Author=[[User:Ana|Ana Photographer]]\n}}\n{{self|cc-by-4.0|GFDL}}',
  'File:Share_alike.jpg': '{{Information\n|Author=Someone\n}}\n{{self|cc-by-sa-4.0|GFDL}}',
  'File:No_licence.jpg': '{{Information\n|Author=Someone\n}}',
  'File:Small_cc0.png': '{{CC-zero}}',
};
function fakeWikimedia(calls = []) {
  return async (url, options = {}) => {
    const target = new URL(String(url));
    calls.push({url: target.toString(), agent: options.headers?.['User-Agent']});
    assert.equal(target.origin, 'https://api.wikimedia.org');
    assert.match(options.headers['User-Agent'], /^YouTubeControlRoom\//, 'Wikimedia asks for a descriptive User-Agent');
    assert.equal(options.redirect, 'error');
    if (target.pathname === '/core/v1/commons/search/page') return json({pages: [...Object.keys(PAGES), 'Gallery page'].map((key, id) => ({id: id + 1, key}))});
    const key = decodeURIComponent(target.pathname.split('/').pop());
    if (target.pathname.includes('/page/')) return json({key, source: PAGES[key]});
    if (target.pathname.includes('/file/')) return json({title: key, original: key === 'File:Small_cc0.png' ? {...original(key.slice(5)), width: 600} : original(key.slice(5))});
    throw new Error(`Unexpected ${url}`);
  };
}

test('Commons licences: public domain, CC0 and CC BY are offered; share-alike, GFDL-only and unknown licences are not', () => {
  assert.equal(VS.wikitextLicense('{{PD-old-70}}').code, 'pd');
  assert.equal(VS.wikitextLicense('{{PD-Art|PD-old-100}}').code, 'pd');
  assert.equal(VS.wikitextLicense('{{CC-zero}}').code, 'cc0');
  assert.deepEqual([VS.wikitextLicense('{{self|cc-by-4.0}}').name, VS.wikitextLicense('{{cc-by-2.0}}').url], ['CC BY 4.0', 'https://creativecommons.org/licenses/by/2.0/']);
  assert.equal(VS.wikitextLicense('{{self|cc-by-4.0|GFDL}}').code, 'cc-by-4.0', 'a dual licence may be used under its CC BY option');
  for (const only of ['{{self|cc-by-sa-4.0|GFDL}}', '{{cc-by-nc-2.0}}', '{{cc-by-nd-3.0}}', '{{GFDL}}', '{{Information|Author=x}}', '']) assert.equal(VS.wikitextLicense(only), null, only);
  assert.equal(VS.wikitextAuthor('|Author=[[User:Ana|Ana Photographer]]'), 'Ana Photographer');
  assert.equal(VS.wikitextAuthor('|artist={{Creator:Johannes Vermeer}}'), 'Johannes Vermeer');
  assert.equal(VS.wikitextAuthor('no author here'), 'Unknown author');
  assert.equal(VS.commonsThumb('https://upload.wikimedia.org/wikipedia/commons/a/ab/Map.jpg?utm_source=x'), 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Map.jpg/500px-Map.jpg');
  assert.equal(VS.commonsThumb('https://evil.example/a/ab/Map.jpg'), null);
});

test('a Commons search keeps only usable files with their licence and credit line, through the API gateway', async () => {
  const calls = [], client = new VS.WikimediaClient(null, fakeWikimedia(calls));
  const {candidates} = await client.search({query: 'port of Mocha', perPage: 5});
  assert.deepEqual(candidates.map(item => item.title), ['Port of Mocha 1737', 'Coffee cup']);
  const [mocha, cup] = candidates;
  assert.deepEqual([mocha.license.code, mocha.author, mocha.downloadUrl], ['pd', 'Jacques-Nicolas Bellin', 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Port_of_Mocha_1737.jpg']);
  assert.equal(mocha.previewUrl, 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Port_of_Mocha_1737.jpg/500px-Port_of_Mocha_1737.jpg');
  assert.equal(cup.attribution, 'Coffee cup by Ana Photographer, CC BY 4.0, via Wikimedia Commons');
  assert.equal(client.requests, calls.length);
  assert.ok(calls.every(call => call.url.startsWith('https://api.wikimedia.org/core/v1/commons/')), 'never commons.wikimedia.org (reset on the owner\'s network)');
  // The credit line goes into the description with the licence link.
  const [line] = credits([{id: 'a1', label: 'S03A', origin: 'stock', rights: {provider: 'wikimedia', attribution: cup.attribution, license: cup.license, pageUrl: cup.pageUrl}}]);
  assert.equal(line.line, 'S03A: Coffee cup by Ana Photographer, CC BY 4.0, via Wikimedia Commons (https://creativecommons.org/licenses/by/4.0/) https://commons.wikimedia.org/wiki/File:Coffee_cup.jpg');
  assert.ok(VS.CAPABILITIES['wikimedia-image'] && VS.SOURCE_CAPABILITIES['archival-public-domain'].includes('wikimedia-image'));
});

test('the Wikimedia connection needs no key and its test is one search; searches have their own hourly allowance', async t => {
  const store = new Store(':memory:');
  t.after(() => store.close());
  const slots = new ConnectorSlots(store, {transform: (op, input) => Buffer.from([...input].reverse())}, fakeWikimedia());
  assert.throws(() => slots.save({name: 'Commons', provider: 'wikimedia', key: 'not-needed-0123456789'}), /takes no API key/);
  const slot = slots.save({name: 'Commons', provider: 'wikimedia'});
  const tested = await slots.test(slot.id, slot.revision);
  assert.equal(tested.connector.test.status, 'passed');
  assert.match(tested.result.message, /usable image\(s\) \(public domain, CC0 or CC BY\)\. Nothing was downloaded/);
  const quota = new QuotaLedger(store);
  assert.equal(quota.summary().wikimedia.cap, 480);
  assert.equal(quota.reserve('job-1', {wikimedia: 49}).ok, true);
  assert.equal(quota.summary().wikimedia.used, 49);
  quota.settle('job-1', {wikimedia: 13});
  assert.equal(quota.summary().wikimedia.used, 13, 'settled at the requests really made');
  const saved = quota.saveSettings({revision: 0, pexelsHourlyRequestCap: 100});
  assert.equal(saved.wikimediaHourlyRequestCap, 480, 'saving other caps keeps the Wikimedia allowance');
});
