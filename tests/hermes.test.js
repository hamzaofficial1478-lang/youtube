'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { HermesClient, HermesReasoning, validateCandidate } = require('../hermes');
const { Store } = require('../store');
const { ConnectorSlots } = require('../connectors');
const { createApp } = require('../server');

const key = 'fixture-hermes-' + 'x'.repeat(32);
const fixtureProtector = {transform:(operation, input) => Buffer.from([...input].reverse())};

test('factual Hermes candidates require sourced claims', () => {
  const sourceIds = new Set(['S1']);
  const base = {title:'A valid candidate title',angle:'A sufficiently detailed original candidate angle.',hook:'A specific opening hook?',script:'A sufficiently detailed original English candidate script that is long enough for strict candidate validation and careful review.',claims:[],uncertainties:[]};
  assert.throws(() => validateCandidate(base, sourceIds, true), /claim/i);
  assert.throws(() => validateCandidate({...base,claims:[{text:'A factual statement.',sourceIds:[]}]}, sourceIds, true), /source/i);
  assert.deepEqual(validateCandidate({...base,claims:[{text:'A factual statement.',sourceIds:['S1']}]}, sourceIds, true).claims[0].sourceIds,['S1']);
});

test('Hermes capability check uses only the fixed loopback API and bearer header', async () => {
  const calls = [];
  const client = new HermesClient(key, async (url, options) => {
    calls.push({url:String(url), options});
    if (String(url).endsWith('/v1/toolsets')) return Response.json({object:'list',platform:'api_server',data:[{name:'terminal',enabled:false,configured:true,tools:['terminal']}]});
    return Response.json({auth:{type:'bearer',required:true},features:{chat_completions:true}});
  });
  const result = await client.capabilities();
  assert.equal(result.chatCompletions, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'http://127.0.0.1:8642/v1/capabilities');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer ' + key);
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[1].url, 'http://127.0.0.1:8642/v1/toolsets');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer ' + key);
  assert.ok(calls[0].options.signal);
  assert.equal(JSON.stringify(result).includes(key), false);
});

test('Hermes capability check rejects enabled concrete tools and bounds streamed metadata', async () => {
  const enabled = new HermesClient(key, async url => String(url).endsWith('/v1/toolsets')
    ? Response.json([{name:'terminal',enabled:true,configured:true,tools:['terminal']}])
    : Response.json({auth:{type:'bearer',required:true},features:{chat_completions:true}}));
  await assert.rejects(enabled.capabilities(), /tool-free/i);
  let pulls=0;
  const oversized = new HermesClient(key, async url => {
    if (!String(url).endsWith('/v1/capabilities')) return Response.json([]);
    return new Response(new ReadableStream({pull(controller){pulls++;controller.enqueue(new Uint8Array(70000));if(pulls===3)controller.close();}}));
  });
  await assert.rejects(oversized.capabilities(), /too large/i);
  assert.ok(pulls < 3);
});

test('Hermes connector is stored as its own protected local reasoning provider', async t => {
  const calls = [];
  const store = new Store(':memory:');
  t.after(() => store.close());
  const slots = new ConnectorSlots(store, fixtureProtector, async (url, options) => {
    calls.push({url:String(url), options});
    if(String(url).endsWith('/v1/toolsets'))return Response.json([]);
    return Response.json({auth:{type:'bearer',required:true}, features:{chat_completions:true}});
  });
  const slot = slots.save({name:'Control Room reasoning', provider:'hermes', notes:'Dedicated local reasoning engine', key});
  const checked = await slots.test(slot.id, slot.revision);
  assert.equal(checked.connector.provider, 'hermes');
  assert.equal(checked.connector.test.status, 'passed');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'http://127.0.0.1:8642/v1/capabilities');
  assert.equal(calls[1].url, 'http://127.0.0.1:8642/v1/toolsets');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer ' + key);
  assert.equal(JSON.stringify(slots.list()).includes(key), false);
});

test('Hermes returns one validated English script candidate without mutating source input', async () => {
  const calls = [];
  const payload = {
    title:'Why routines feel harder than expected',
    angle:'Follow one ordinary routine and identify the hidden handoffs.',
    hook:'The room is organized, so why does the task still feel slow?',
    script:'A sufficiently detailed original English candidate script that explains the evidence carefully, avoids unsupported certainty, and ends with a useful payoff for the intended audience.',
    claims:[{text:'The supplied source describes the observed workflow.', sourceIds:['S1']}],
    uncertainties:['The evidence does not establish a universal result.']
  };
  const input = {
    family:{name:'Everyday Explained', audience:'Curious adults', locale:'en-US'},
    content:{title:'Why routines feel slow', kind:'factual', angle:'Original workflow explanation', hook:'Why is this slow?'},
    sources:[{id:'S1', title:'Creator evidence', url:'https://example.com/evidence', notes:'Permitted summary of the supporting evidence.'}]
  };
  const snapshot = structuredClone(input);
  const client = new HermesClient(key, async (url, options) => {
    calls.push({url:String(url), options});
    return Response.json({choices:[{message:{content:JSON.stringify(payload)}}], usage:{prompt_tokens:120, completion_tokens:80, total_tokens:200}});
  });
  const result = await client.generateEnglishScript(input);
  assert.deepEqual(input, snapshot);
  assert.deepEqual(result.candidate, payload);
  assert.deepEqual(result.usage, {promptTokens:120, completionTokens:80, totalTokens:200});
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://127.0.0.1:8642/v1/chat/completions');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer ' + key);
  assert.equal(calls[0].options.redirect, 'error');
  const sent = JSON.parse(calls[0].options.body);
  assert.equal(sent.stream, false);
  assert.equal(sent.messages.some(message => message.content.includes('https://example.com/evidence')), true);
  assert.equal(JSON.stringify(result).includes(key), false);
});

test('reasoning job stores an immutable candidate and never overwrites the draft', async t => {
  const store = new Store(':memory:');
  t.after(() => store.close());
  const family = store.saveFamily({name:'Everyday Explained',tier:'A',countries:['United States'],audience:'Curious adults seeking sourced explanations.',niche:'Everyday systems',spanishLocale:'es-419',englishLocale:'en-US',timezone:'Asia/Karachi',monthlyBudget:100,cadence:2,format:'long-form'});
  const content = store.saveContent({familyId:family.id,title:'Why routines feel slow',kind:'factual',angle:'Follow a routine and show hidden handoffs.',hook:'Why does an organized task still feel slow?',script:'Existing creator text must remain unchanged while Hermes proposes a separate candidate for deliberate review by the operator.',sources:[{title:'Creator evidence',url:'https://example.com/evidence',permission:'permitted',notes:'Permitted summary supporting the workflow example.'}],rightsConfirmed:true});
  const generated = {
    title:'Why routines feel harder than expected',angle:'Follow one routine and identify hidden handoffs.',hook:'The room is organized, so why is the task slow?',script:'A sufficiently detailed original English candidate script that explains the supplied evidence carefully, avoids unsupported certainty, and concludes with a useful practical payoff.',claims:[{text:'The supplied evidence describes a workflow example.',sourceIds:['S1']}],uncertainties:['The result is not universal.']
  };
  let generationCalls = 0, toolsetChecks = 0;
  const slots = new ConnectorSlots(store, fixtureProtector, async (url) => {
    if (String(url).endsWith('/v1/capabilities')) return Response.json({auth:{type:'bearer',required:true},features:{chat_completions:true}});
    if (String(url).endsWith('/v1/toolsets')) { toolsetChecks++; return Response.json([]); }
    generationCalls++;
    return Response.json({choices:[{message:{content:JSON.stringify(generated)}}],usage:{total_tokens:321}});
  });
  const connector = slots.save({name:'Hermes soul',provider:'hermes',notes:'Dedicated local script reasoning',key});
  await slots.test(connector.id, connector.revision);
  const reasoning = new HermesReasoning(store, slots);
  const first = reasoning.queue(content.id, {revision:content.revision,connectorId:connector.id,connectorRevision:connector.revision});
  const duplicate = reasoning.queue(content.id, {revision:content.revision,connectorId:connector.id,connectorRevision:connector.revision});
  assert.equal(first.id, duplicate.id);
  await reasoning.processNext();
  const state = store.state();
  assert.equal(generationCalls, 1);
  assert.equal(toolsetChecks, 2);
  assert.equal(state.jobs.find(job => job.id === first.id).status, 'completed');
  assert.equal(state.scriptCandidates.length, 1);
  assert.equal(state.scriptCandidates[0].contentId, content.id);
  assert.equal(state.scriptCandidates[0].payload.script, generated.script);
  assert.equal(store.content(content.id).script, content.script);
  assert.equal(store.content(content.id).state, 'draft');
  slots.remove(connector.id, connector.revision);
  assert.equal(store.state().scriptCandidates.length, 1);
});

test('Hermes claim and completion revalidate connector test status without a revision change', async t => {
  const store = new Store(':memory:');t.after(() => store.close());
  const family=store.saveFamily({name:'Connector checks',tier:'A',countries:['United States'],audience:'Adults reviewing original fictional explanations.',niche:'Fiction',spanishLocale:'es-419',englishLocale:'en-US',timezone:'Asia/Karachi',monthlyBudget:0,cadence:1,format:'long-form'});
  const content=store.saveContent({familyId:family.id,title:'A fictional connector check',kind:'fiction',angle:'Use an original fictional scenario to verify connector safety.',hook:'What changes while Hermes is answering?',script:'Existing fictional script content remains unchanged while connector invariants are checked before generation and again before completion.',sources:[],rightsConfirmed:true});
  const generated={title:'A fictional candidate',angle:'An original fictional angle that is detailed enough for review.',hook:'What changed during generation?',script:'A sufficiently detailed fictional candidate script that remains separate from the saved draft and requires deliberate operator review before use.',claims:[],uncertainties:[]};
  let generationCalls=0,connector;
  const slots=new ConnectorSlots(store,fixtureProtector,async url=>{
    if(String(url).endsWith('/v1/capabilities'))return Response.json({auth:{type:'bearer',required:true},features:{chat_completions:true}});
    if(String(url).endsWith('/v1/toolsets'))return Response.json([]);
    generationCalls++;const row=slots.row(connector.id),payload=JSON.parse(row.payload);payload.test={status:'failed',at:new Date().toISOString(),message:'Changed without revision'};store.db.prepare('UPDATE connectors SET payload=? WHERE id=?').run(JSON.stringify(payload),connector.id);
    return Response.json({choices:[{message:{content:JSON.stringify(generated)}}],usage:{}});
  });
  connector=slots.save({name:'Checked Hermes',provider:'hermes',notes:'Connector invariant fixture',key});await slots.test(connector.id,connector.revision);
  const reasoning=new HermesReasoning(store,slots);
  const first=reasoning.queue(content.id,{revision:content.revision,connectorId:connector.id,connectorRevision:connector.revision});
  let payload=JSON.parse(slots.row(connector.id).payload);payload.test.status='failed';store.db.prepare('UPDATE connectors SET payload=? WHERE id=?').run(JSON.stringify(payload),connector.id);
  await reasoning.processNext();assert.equal(generationCalls,0);assert.equal(store.state().jobs.find(job=>job.id===first.id).status,'stale');
  payload.test.status='passed';store.db.prepare('UPDATE connectors SET payload=? WHERE id=?').run(JSON.stringify(payload),connector.id);
  const second=store.retryHermesScriptJob(first.id,{revision:content.revision,connectorId:connector.id,connectorRevision:connector.revision});
  await reasoning.processNext();assert.equal(generationCalls,1);assert.equal(store.state().jobs.find(job=>job.id===second.id).status,'stale');assert.equal(store.state().scriptCandidates.length,0);
});

test('Control Room HTTP queues Hermes reasoning and exposes only the review candidate', async t => {
  const generated = {title:'A reviewed candidate title',angle:'A distinct evidence-led angle for this original explanation.',hook:'Why does this familiar process contain a hidden delay?',script:'This is a bounded English script candidate produced for review. It uses the supplied evidence as context, avoids inventing certainty, and leaves the existing saved draft unchanged until the operator chooses to edit it.',claims:[{text:'The fixture supports the example.',sourceIds:['S1']}],uncertainties:['Fixture evidence is limited.']};
  const app = createApp({dataFile:':memory:',worker:false,protector:fixtureProtector,providerFetch:async url => String(url).endsWith('/v1/capabilities')?Response.json({auth:{type:'bearer',required:true},features:{chat_completions:true}}):String(url).endsWith('/v1/toolsets')?Response.json([]):Response.json({choices:[{message:{content:JSON.stringify(generated)}}],usage:{total_tokens:99}})});
  await new Promise(resolve => app.server.listen(0,'127.0.0.1',resolve));
  t.after(() => new Promise(resolve => app.server.close(resolve)));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const initial = await (await fetch(base+'/api/state')).json();
  const send = async (route, body, method='POST') => {
    const response = await fetch(base+route,{method,headers:{'Content-Type':'application/json','X-Local-Token':initial.token},body:JSON.stringify(body)});
    return {response,data:await response.json()};
  };
  const connector = (await send('/api/connectors',{name:'Hermes soul',provider:'hermes',notes:'Local reasoning',key})).data;
  assert.equal((await send(`/api/connectors/${connector.id}/test`,{revision:connector.revision})).response.status,200);
  const family = (await send('/api/families',{name:'Family',tier:'A',countries:['United States'],audience:'Adults seeking clear factual explanations.',niche:'Everyday systems',spanishLocale:'es-419',englishLocale:'en-US',timezone:'Asia/Karachi',monthlyBudget:100,cadence:2,format:'long-form'})).data;
  const content = (await send('/api/content',{familyId:family.id,title:'A working factual title',kind:'factual',angle:'An original explanation of hidden process delays.',hook:'Where does the delay hide?',script:'Existing script text that must remain untouched while a separate Hermes candidate is generated for review by the operator.',sources:[{title:'Fixture',url:'https://example.com/source',permission:'permitted',notes:'Permitted fixture evidence for this isolated integration test.'}],rightsConfirmed:true})).data;
  const queued = await send(`/api/content/${content.id}/hermes-script`,{revision:content.revision,connectorId:connector.id,connectorRevision:connector.revision});
  assert.equal(queued.response.status,200);
  await app.reasoning.processNext();
  const after = await (await fetch(base+'/api/state')).json();
  assert.equal(after.scriptCandidates.length,1);
  assert.equal(after.scriptCandidates[0].payload.script,generated.script);
  assert.equal(after.contents[0].script,content.script);
  assert.equal(JSON.stringify(after).includes(key),false);
  app.store.db.prepare("UPDATE jobs SET status='interrupted' WHERE id=?").run(queued.data.id);
  assert.equal((await send(`/api/hermes-jobs/${queued.data.id}/retry`,{revision:content.revision,connectorId:connector.id,connectorRevision:connector.revision})).response.status,409);
  const retry2=await send(`/api/hermes-jobs/${queued.data.id}/retry`,{revision:content.revision,connectorId:connector.id,connectorRevision:connector.revision,confirmInterrupted:true});
  assert.equal(retry2.response.status,200);assert.equal(retry2.data.attempts,2);
  app.store.db.prepare("UPDATE jobs SET status='failed' WHERE id=?").run(retry2.data.id);
  const retry3=await send(`/api/hermes-jobs/${retry2.data.id}/retry`,{revision:content.revision,connectorId:connector.id,connectorRevision:connector.revision});
  assert.equal(retry3.response.status,200);assert.equal(retry3.data.attempts,3);
  app.store.db.prepare("UPDATE jobs SET status='failed' WHERE id=?").run(retry3.data.id);
  assert.equal((await send(`/api/hermes-jobs/${retry3.data.id}/retry`,{revision:content.revision,connectorId:connector.id,connectorRevision:connector.revision})).response.status,409);
  const ui = await (await fetch(base+'/app.js')).text();
  assert.match(ui,/Ask Hermes/);
  assert.match(ui,/hermes-script/);
  assert.match(ui,/Use candidate/);
  assert.match(ui,/Retry Hermes/);
  assert.match(ui,/confirmInterrupted/);
  assert.match(ui,/Source IDs/);
  assert.match(ui,/j\.content_id===c\.id&&j\.revision===c\.revision/);
  assert.match(ui,/c\.sources\[Number\(id\.slice\(1\)\)-1\]/);
  assert.match(ui,/source\.title/);
  assert.match(ui,/source\.url/);
});
