'use strict';
// 0.97 (owner 2026-11-10: "instead of NexLev I have TubeMind"): tubemind.io's connector (MCP over Streamable HTTP, the key
// inside a private URL). Saved encrypted, sent only to tubemind.io, tested honestly (TubeMind's own "paused" notice is
// reported as paused), its tools run from the Niche Factory and their research becomes niche evidence for 30 days.
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../tubemind');
const {Store} = require('../store');
const {ConnectorSlots} = require('../connectors');
const {StyleLibrary} = require('../style');
const {QuotaLedger} = require('../intel-sources');
const {NicheFactory} = require('../niche-factory');

const protector = {transform: (operation, input) => Buffer.from([...input].reverse())};
const URL_OK = 'https://tubemind.io/api/mcp/tm_live_0123456789abcdef0123';
const TOOLS = [
  {name: 'explore_niches', title: 'Explore niches', description: 'Tracked niches with score and verdict.', inputSchema: {type: 'object', properties: {language: {type: 'string', enum: ['en', 'ur', 'hi']}}}},
  {name: 'find_outliers', title: 'Find outliers', description: 'Videos that beat their channel.', inputSchema: {type: 'object', properties: {niche: {type: 'string', description: 'Niche words'}, min_multiplier: {type: 'number'}, days: {type: 'integer'}}, required: ['niche']}},
];
// A fake TubeMind: JSON for initialize, 202 for the notification, an event stream for tools/list, JSON for calls.
function tubemind({paused = false} = {}) {
  const calls = [];
  const fetch = async (url, options) => {
    const body = JSON.parse(options.body), headers = options.headers;
    calls.push({url, method: body.method, session: headers['Mcp-Session-Id'] || null, accept: headers.Accept, redirect: options.redirect});
    if (body.method === 'initialize') return new Response(JSON.stringify({jsonrpc: '2.0', id: body.id, result: {protocolVersion: T.PROTOCOL, serverInfo: {name: 'tubemind'}, capabilities: {tools: {}}}}), {status: 200, headers: {'content-type': 'application/json', 'mcp-session-id': 'sess-123'}});
    if (body.method === 'notifications/initialized') return new Response(null, {status: 202});
    if (body.method === 'tools/list') return new Response(`event: message\ndata: ${JSON.stringify({jsonrpc: '2.0', id: body.id, result: {tools: TOOLS}})}\n\n`, {status: 200, headers: {'content-type': 'text/event-stream'}});
    if (body.method === 'tools/call') {
      const text = paused ? 'TubeMind research is paused while YouTube reviews our API use. Please try again later.' : `Outliers for ${body.params.arguments.niche || 'all'}: "Why stone age money worked" 12x (8.4M views, channel baseline 700K).`;
      return new Response(JSON.stringify({jsonrpc: '2.0', id: body.id, result: {content: [{type: 'text', text}], isError: false}}), {status: 200, headers: {'content-type': 'application/json'}});
    }
    return new Response('{}', {status: 400});
  };
  return {fetch, calls};
}

test('the TubeMind client speaks MCP over HTTP to tubemind.io only, and reads JSON and event-stream answers', async () => {
  assert.equal(T.connectorUrl(` ${URL_OK} `), URL_OK);
  for (const bad of ['tm_live_0123456789abcdef0123', 'http://tubemind.io/api/mcp/x', 'https://evil.example/tubemind.io', 'https://tubemind.io.evil.example/mcp', 'https://user:pw@tubemind.io/mcp'])
    assert.throws(() => T.connectorUrl(bad), /connector URL/, bad);
  const {fetch, calls} = tubemind();
  const client = new T.TubeMindClient(URL_OK, fetch);
  assert.equal((await client.connect()).server.name, 'tubemind');
  const tools = await client.tools();
  assert.deepEqual(tools.map(tool => tool.name), ['explore_niches', 'find_outliers']);
  assert.deepEqual(tools[1].fields.map(field => [field.name, field.type, field.required]), [['niche', 'string', true], ['min_multiplier', 'number', false], ['days', 'integer', false]]);
  const answer = await client.call('find_outliers', {niche: 'stone age money'});
  assert.match(answer.text, /12x/);
  assert.equal(answer.paused, false);
  assert.ok(calls.every(call => call.url === URL_OK && call.redirect === 'error' && /text\/event-stream/.test(call.accept)), 'only the connector URL, never redirected');
  assert.deepEqual(calls.map(call => call.session), [null, 'sess-123', 'sess-123', 'sess-123'], 'the session TubeMind gave is sent back');
  // The owner's words are checked against the tool's own fields.
  assert.deepEqual(T.checkArgs(tools[1], {niche: ' stone age ', min_multiplier: '5', days: '30'}), {niche: 'stone age', min_multiplier: 5, days: 30});
  assert.throws(() => T.checkArgs(tools[1], {}), /Fill in "niche"/);
  assert.throws(() => T.checkArgs(tools[1], {niche: 'x', days: '1.5'}), /whole number/);
  assert.throws(() => T.checkArgs(tools[1], {niche: 'x', secret: 1}), /no field "secret"/);
  assert.throws(() => T.checkArgs(tools[0], {language: 'fr'}), /must be one of/);
  // Errors never show the URL (it holds the key).
  const refused = new T.TubeMindClient(URL_OK, async () => new Response('', {status: 401}));
  await assert.rejects(refused.connect(), error => /refused this connector URL/.test(error.message) && !error.message.includes('tm_live'));
});

test('a TubeMind connection is tested honestly, and its research becomes niche evidence for 30 days', async t => {
  const store = new Store(':memory:');
  t.after(() => store.close());
  const live = tubemind({paused: true}), connectors = new ConnectorSlots(store, protector, live.fetch);
  assert.throws(() => connectors.save({name: 'TubeMind', provider: 'tubemind', key: 'tm_live_0123456789abcdef0123'}), /Paste the TubeMind connector URL/);
  const slot = connectors.save({name: 'TubeMind', provider: 'tubemind', key: URL_OK});
  assert.ok(slot.hasKey && !JSON.stringify(slot).includes('tm_live'), 'the URL is kept like a key, never shown');
  const tested = await connectors.test(slot.id, slot.revision);
  assert.equal(tested.connector.test.status, 'passed');
  assert.match(tested.connector.test.message, /offers 2 research tool\(s\): Explore niches, Find outliers.*paused/);
  assert.equal(tested.connector.tubemind.paused, true);
  const niches = new NicheFactory(store, connectors, new QuotaLedger(store), new StyleLibrary(store));
  const {TrendScanner} = require('../trends'), {CompetitorIntelligence} = require('../competitor-intel');
  new TrendScanner(store, niches.connectors, niches.quota); new CompetitorIntelligence(store, niches.connectors, niches.quota, niches.styles);
  assert.equal(niches.state().tubemind.connections[0].tools.length, 2);
  // While TubeMind is paused, a run is kept as "paused" and is not evidence.
  const paused = await niches.runTubemind({connectorId: slot.id, tool: 'find_outliers', args: {niche: 'stone age money'}, requestedBy: 'Hasnain'});
  assert.deepEqual([paused.status, paused.use], ['paused', false]);
  assert.throws(() => niches.tubemindRead(paused.id, {use: true}), /Only a result with research/);
  // Once it gives research, the result is evidence for niche suggestions until it is untick or 30 days pass.
  connectors.fetch = tubemind().fetch;
  const done = await niches.runTubemind({connectorId: slot.id, tool: 'find_outliers', args: {niche: 'stone age money', days: 30}, requestedBy: 'Hasnain'});
  assert.deepEqual([done.status, done.use, done.args], ['done', true, {niche: 'stone age money', days: 30}]);
  const evidence = niches.suggestionEvidence('new', null).items.find(item => item.kind === 'tubemind research');
  assert.ok(evidence && /12x/.test(evidence.found) && evidence.tool === 'Find outliers');
  assert.equal(niches.suggestionSources().tubemind, 1);
  niches.tubemindRead(done.id, {use: false});
  assert.ok(!niches.suggestionEvidence('new', null).items.some(item => item.kind === 'tubemind research'), 'untick = not evidence');
  await assert.rejects(niches.runTubemind({connectorId: slot.id, tool: 'delete_everything', args: {}, requestedBy: 'Hasnain'}), /not offered/);
  store.db.prepare('UPDATE tubemind_reads SET expires_at=?').run(new Date(Date.now() - 1000).toISOString());
  assert.equal(niches.state().tubemind.reads.length, 0, 'gone after 30 days');
});
