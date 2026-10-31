'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ScriptWriter, generateScript, validateCandidate } = require('../writer');
const { Ai } = require('../ai');
const { claudeMessage, claudeFetch, isClaudeModel, claudeModel, promptOf } = require('./fake-claude');
const { Store } = require('../store');
const { ConnectorSlots } = require('../connectors');
const { createApp } = require('../server');

const key = 'sk-ant-api03-fixture-' + 'x'.repeat(32);
const fixtureProtector = {transform:(operation, input) => Buffer.from([...input].reverse())};
const qualityScript=(hook,count=650)=>{const filler=Array.from({length:count-hook.split(/\s+/).length},(_,index)=>`detail${index+1}`);const size=Math.floor(filler.length/4);return [hook+' '+filler.slice(0,size).join(' '),filler.slice(size,size*2).join(' '),filler.slice(size*2,size*3).join(' '),filler.slice(size*3).join(' ')].join('\n\n');};

test('factual script candidates require sourced claims', () => {
  const sourceIds = new Set(['S1']);
  const base = {title:'A valid candidate title',angle:'A sufficiently detailed original candidate angle.',hook:'A specific opening hook?',script:'A sufficiently detailed original English candidate script that is long enough for strict candidate validation and careful review.',claims:[],uncertainties:[]};
  assert.throws(() => validateCandidate(base, sourceIds, true), /claim/i);
  assert.throws(() => validateCandidate({...base,claims:[{text:'A factual statement.',sourceIds:[]}]}, sourceIds, true), /source/i);
  assert.deepEqual(validateCandidate({...base,claims:[{text:'A factual statement.',sourceIds:['S1']}]}, sourceIds, true).claims[0].sourceIds,['S1']);
});

test('the Claude API key is stored protected and never appears in any response', async t => {
  const calls = [];
  const store = new Store(':memory:');
  t.after(() => store.close());
  const slots = new ConnectorSlots(store, fixtureProtector, async (url, options) => { calls.push({url: String(url), options}); return claudeModel(url); });
  const slot = slots.save({name:'Control Room Claude', provider:'claude', notes:'Claude API key for the program', key});
  const checked = await slots.test(slot.id, slot.revision);
  assert.equal(checked.connector.provider, 'claude');
  assert.equal(checked.connector.test.status, 'passed');
  assert.ok(calls.every(call => isClaudeModel(call.url)), 'the test only reads model details');
  assert.equal(calls[0].options.headers.get('x-api-key'), key);
  assert.equal(JSON.stringify(slots.list()).includes(key), false);
  assert.equal(JSON.stringify(checked).includes(key), false);
});
test('Claude returns one validated primary-locale script candidate without mutating source input', async () => {
  const calls = [];
  const hook='The room is organized, so why does the task still feel slow?';
  const payload = {
    title:'Why routines feel harder than expected',
    angle:'Follow one ordinary routine and identify the hidden handoffs.',
    hook,
    script:qualityScript(hook),
    claims:[{text:'The supplied source describes the observed workflow.', sourceIds:['S1']}],
    uncertainties:['The evidence does not establish a universal result.']
  };
  const input = {
    family:{name:'Everyday Explained', audience:'Curious adults', locale:'en-US',format:'long-form'},
    content:{title:'Why routines feel harder than expected', kind:'factual', angle:'Follow one routine',hook:'Why is this slow?'},
    sources:[{id:'S1',title:'Evidence',url:'https://example.com/evidence',notes:'Reviewed evidence.'}],
    policy:{totalTokenLimit:8000,maxCompletionTokens:4000}
  };
  const snapshot = structuredClone(input);
  const store = new Store(':memory:');
  const slots = new ConnectorSlots(store, fixtureProtector, claudeFetch(() => claudeMessage(payload, {input_tokens:120, output_tokens:80}), calls));
  const connector = slots.save({name:'Claude', provider:'claude', key});
  const result = await generateScript(new Ai(slots), connector.id, input);
  store.close();
  assert.deepEqual(input, snapshot);
  assert.deepEqual(result.candidate, payload);
  assert.deepEqual(result.usage, {promptTokens:120, completionTokens:80, totalTokens:200, model:'claude-opus-5-5', provider:'claude'});
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.model, 'claude-opus-5-5', 'scripts are written by the main model');
  assert.equal(calls[0].body.max_tokens, 4000);
  assert.equal(calls[0].headers.get('x-api-key'), key);
  assert.equal(promptOf(calls[0].body).includes('https://example.com/evidence'), true);
  assert.equal(calls[0].body.system.includes('en-US'), true);
  assert.equal(JSON.stringify(result).includes(key), false);
});

test('reasoning job stores an immutable candidate and never overwrites the draft', async t => {
  const store = new Store(':memory:');
  t.after(() => store.close());
  const family = store.saveFamily({name:'Everyday Explained',tier:'A',countries:['Pakistan'],audience:'Curious adults seeking sourced explanations.',niche:'Everyday systems',locales:['ur-PK'],timezone:'Asia/Karachi',monthlyBudget:100,cadence:2,format:'long-form'});
  const content = store.saveContent({familyId:family.id,title:'Why routines feel slow',kind:'factual',angle:'Follow a routine and show hidden handoffs.',hook:'Why does an organized task still feel slow?',script:'Existing creator text must remain unchanged while Hermes proposes a separate candidate for deliberate review by the operator.',sources:[{title:'Creator evidence',url:'https://example.com/evidence',permission:'permitted',notes:'Permitted summary supporting the workflow example.'}],rightsConfirmed:true});
  const generatedHook='The room is organized, so why is the task slow?';
  const generated = {
    title:'Why routines feel harder than expected',angle:'Follow one routine and identify hidden handoffs.',hook:generatedHook,script:qualityScript(generatedHook),claims:[{text:'The supplied evidence describes a workflow example.',sourceIds:['S1']}],uncertainties:['The result is not universal.']
  };
  let generationCalls = 0;
  const slots = new ConnectorSlots(store, fixtureProtector, claudeFetch(() => { generationCalls++; return claudeMessage(generated, {input_tokens:200, output_tokens:121}); }));
  const connector = slots.save({name:'Claude',provider:'claude',notes:'Program Claude key',key});
  await slots.test(connector.id, connector.revision);
  const reasoning = new ScriptWriter(store, new Ai(slots));
  const first = reasoning.queue(content.id, {revision:content.revision,connectorId:connector.id,connectorRevision:connector.revision});
  const duplicate = reasoning.queue(content.id, {revision:content.revision,connectorId:connector.id,connectorRevision:connector.revision});
  assert.equal(first.id, duplicate.id);
  await reasoning.processNext();
  const state = store.state();
  assert.equal(generationCalls, 1);
  assert.equal(state.scriptCandidates[0].usage.model, 'claude-opus-5-5', 'the candidate records which model wrote it');
  assert.equal(state.jobs.find(job => job.id === first.id).status, 'completed');
  assert.equal(state.scriptCandidates.length, 1);
  assert.equal(state.scriptCandidates[0].contentId, content.id);
  assert.equal(state.scriptCandidates[0].locale, 'ur-PK');
  assert.equal(state.scriptCandidates[0].language, 'ur');
  assert.equal(state.scriptCandidates[0].payload.script, generated.script);
  assert.equal(store.content(content.id).script, content.script);
  assert.equal(store.content(content.id).state, 'draft');
  assert.equal(state.scriptCandidates[0].status, 'available');
  store.saveFamily({name:family.name,tier:family.tier,countries:family.countries,audience:family.audience,niche:family.niche,locales:['de-DE'],timezone:family.timezone,monthlyBudget:family.budgetCents/100,cadence:family.cadence,format:family.format,revision:family.revision,monthlyTokenLimit:family.tokenBudget.monthlyLimit,scriptTokenLimit:family.tokenBudget.scriptJobLimit,researchTokenLimit:family.tokenBudget.researchJobLimit},family.id);
  assert.notEqual(store.scriptCandidate(state.scriptCandidates[0].id).status, 'available');
  assert.equal(store.state().jobs.find(job=>job.id===first.id).scopeCurrent,false);
  slots.remove(connector.id, connector.revision);
  assert.equal(store.state().scriptCandidates.length, 1);
});

// 0.77 (owner review 2026-10-31): "Approve script" sits beside "Edit draft" under the AI's script; one click makes the
// candidate the draft and approves it, after the owner confirms the rights. What blocks approval is named.
test('a candidate is approved in one click, with the rights confirmed; a stale or blocked one is refused', async t => {
  const store = new Store(':memory:');
  t.after(() => store.close());
  const family = store.saveFamily({name:'Stone Age Money',tier:'A',countries:['United States'],audience:'Adults who like history told simply.',niche:'Stone age finance',locales:['en-US'],timezone:'Asia/Karachi',monthlyBudget:100,cadence:2,format:'long-form'});
  const content = store.saveContent({familyId:family.id,title:'The first casino',kind:'factual',angle:'',hook:'',script:'',sources:[{title:'Museum note',url:'https://example.com/stones',permission:'permitted',notes:'Describes stone tokens used in trade.'}],rightsConfirmed:false});
  const hook='You trade one shiny stone for a whole meal, but why did anyone agree?';
  const generated={title:'The first casino of the stone age',angle:'How early trade turned into the first games of chance.',hook,script:qualityScript(hook),claims:[{text:'Stone tokens were used in trade.',sourceIds:['S1']}],uncertainties:[]};
  const slots = new ConnectorSlots(store, fixtureProtector, claudeFetch(() => claudeMessage(generated, {input_tokens:200, output_tokens:121})));
  const connector = slots.save({name:'Claude',provider:'claude',notes:'Program Claude key',key});
  await slots.test(connector.id, connector.revision);
  const writer = new ScriptWriter(store, new Ai(slots));
  writer.queue(content.id, {revision:content.revision,connectorId:connector.id,connectorRevision:connector.revision});
  await writer.processNext();
  const [candidate] = store.scriptCandidates();
  assert.equal(candidate.status, 'available');
  assert.equal(require('../live').list().length, 0, 'the live view forgets a finished job');
  assert.throws(() => store.approveCandidate(candidate.id, {revision:content.revision}), /Confirm that you read the script/);
  assert.throws(() => store.approveCandidate(candidate.id, {revision:content.revision+1,rightsConfirmed:true}), /changed|revision|version/i);
  const approved = store.approveCandidate(candidate.id, {revision:content.revision,rightsConfirmed:true});
  assert.deepEqual([approved.state, approved.title, approved.hook, approved.script, approved.rightsConfirmed], ['approved', generated.title, hook, generated.script, true]);
  assert.ok(approved.approvedAt);
  assert.throws(() => store.approveCandidate(candidate.id, {revision:approved.revision,rightsConfirmed:true}), /already in review or approved/, 'an approved draft is not replaced by a candidate');
});

test('script claim and completion revalidate the Claude connection without a revision change', async t => {
  const store = new Store(':memory:');t.after(() => store.close());
  const family=store.saveFamily({name:'Connector checks',tier:'A',countries:['United States'],audience:'Adults reviewing original fictional explanations.',niche:'Fiction',spanishLocale:'es-419',englishLocale:'en-US',timezone:'Asia/Karachi',monthlyBudget:0,cadence:1,format:'long-form'});
  const content=store.saveContent({familyId:family.id,title:'A fictional connector check',kind:'fiction',angle:'Use an original fictional scenario to verify connector safety.',hook:'What changes while Hermes is answering?',script:'Existing fictional script content remains unchanged while connector invariants are checked before generation and again before completion.',sources:[],rightsConfirmed:true});
  const generated={title:'A fictional candidate',angle:'An original fictional angle that is detailed enough for review.',hook:'What changed during generation?',script:'A sufficiently detailed fictional candidate script that remains separate from the saved draft and requires deliberate operator review before use.',claims:[],uncertainties:[]};
  let generationCalls=0,connector;
  const slots=new ConnectorSlots(store,fixtureProtector,claudeFetch(()=>{
    generationCalls++;const row=slots.row(connector.id),payload=JSON.parse(row.payload);payload.test={status:'failed',at:new Date().toISOString(),message:'Changed without revision'};store.db.prepare('UPDATE connectors SET payload=? WHERE id=?').run(JSON.stringify(payload),connector.id);
    return claudeMessage(generated,null);
  }));
  connector=slots.save({name:'Checked Claude',provider:'claude',notes:'Connector invariant fixture',key});await slots.test(connector.id,connector.revision);
  const reasoning=new ScriptWriter(store,new Ai(slots));
  const first=reasoning.queue(content.id,{revision:content.revision,connectorId:connector.id,connectorRevision:connector.revision});
  let payload=JSON.parse(slots.row(connector.id).payload);payload.test.status='failed';store.db.prepare('UPDATE connectors SET payload=? WHERE id=?').run(JSON.stringify(payload),connector.id);
  await reasoning.processNext();assert.equal(generationCalls,0);assert.equal(store.state().jobs.find(job=>job.id===first.id).status,'stale');
  payload.test.status='passed';store.db.prepare('UPDATE connectors SET payload=? WHERE id=?').run(JSON.stringify(payload),connector.id);
  const second=store.retryScriptJob(first.id,{revision:content.revision,connectorId:connector.id,connectorRevision:connector.revision});
  await reasoning.processNext();assert.equal(generationCalls,1);assert.equal(store.state().jobs.find(job=>job.id===second.id).status,'stale');assert.equal(store.state().scriptCandidates.length,0);
});

test('Control Room HTTP queues Claude script writing and exposes only the review candidate', async t => {
  const generated = {title:'A reviewed candidate title',angle:'A distinct evidence-led angle for this original explanation.',hook:'Why does this familiar process contain a hidden delay?',script:'This is a bounded English script candidate produced for review. It uses the supplied evidence as context, avoids inventing certainty, and leaves the existing saved draft unchanged until the operator chooses to edit it.',claims:[{text:'The fixture supports the example.',sourceIds:['S1']}],uncertainties:['Fixture evidence is limited.']};
  const app = createApp({dataFile:':memory:',worker:false,protector:fixtureProtector,providerFetch:claudeFetch(()=>claudeMessage(generated,{input_tokens:60,output_tokens:39}))});
  await new Promise(resolve => app.server.listen(0,'127.0.0.1',resolve));
  t.after(() => new Promise(resolve => app.server.close(resolve)));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const initial = await (await fetch(base+'/api/state')).json();
  const send = async (route, body, method='POST') => {
    const response = await fetch(base+route,{method,headers:{'Content-Type':'application/json','X-Local-Token':initial.token},body:JSON.stringify(body)});
    return {response,data:await response.json()};
  };
  const connector = (await send('/api/connectors',{name:'Claude',provider:'claude',notes:'Program Claude key',key})).data;
  assert.equal((await send(`/api/connectors/${connector.id}/test`,{revision:connector.revision})).response.status,200);
  const family = (await send('/api/families',{name:'Family',tier:'A',countries:['United States'],audience:'Adults seeking clear factual explanations.',niche:'Everyday systems',spanishLocale:'es-419',englishLocale:'en-US',timezone:'Asia/Karachi',monthlyBudget:100,cadence:2,format:'long-form'})).data;
  const content = (await send('/api/content',{familyId:family.id,title:'A working factual title',kind:'factual',angle:'An original explanation of hidden process delays.',hook:'Where does the delay hide?',script:'Existing script text that must remain untouched while a separate Hermes candidate is generated for review by the operator.',sources:[{title:'Fixture',url:'https://example.com/source',permission:'permitted',notes:'Permitted fixture evidence for this isolated integration test.'}],rightsConfirmed:true})).data;
  const queued = await send(`/api/content/${content.id}/ai-script`,{revision:content.revision,connectorId:connector.id,connectorRevision:connector.revision});
  assert.equal(queued.response.status,200);
  await app.reasoning.processNext();
  const after = await (await fetch(base+'/api/state')).json();
  assert.equal(after.scriptCandidates.length,1);
  assert.equal(after.scriptCandidates[0].payload.script,generated.script);
  assert.equal(after.contents[0].script,content.script);
  assert.equal(JSON.stringify(after).includes(key),false);
  app.store.db.prepare("UPDATE jobs SET status='interrupted' WHERE id=?").run(queued.data.id);
  assert.equal((await send(`/api/script-jobs/${queued.data.id}/retry`,{revision:content.revision,connectorId:connector.id,connectorRevision:connector.revision})).response.status,409);
  const retry2=await send(`/api/script-jobs/${queued.data.id}/retry`,{revision:content.revision,connectorId:connector.id,connectorRevision:connector.revision,confirmInterrupted:true});
  assert.equal(retry2.response.status,200);assert.equal(retry2.data.attempts,2);
  app.store.claimScriptJob();app.store.failScriptJob(retry2.data.id,'unknown provider outcome',{usageUnknown:true});
  const retry3=await send(`/api/script-jobs/${retry2.data.id}/retry`,{revision:content.revision,connectorId:connector.id,connectorRevision:connector.revision,confirmInterrupted:true});
  assert.equal(retry3.response.status,200);assert.equal(retry3.data.attempts,3);
  app.store.claimScriptJob();app.store.failScriptJob(retry3.data.id,'unknown provider outcome',{usageUnknown:true});
  assert.equal((await send(`/api/script-jobs/${retry3.data.id}/retry`,{revision:content.revision,connectorId:connector.id,connectorRevision:connector.revision,confirmInterrupted:true})).response.status,409);
  const ui = await (await fetch(base+'/app.js')).text();
  assert.match(ui,/Ask AI to write/);
  assert.match(ui,/ai-script/);
  assert.match(ui,/'Edit draft','use-claude-candidate'/);
  assert.match(ui,/'Approve script','approve-candidate'/);
  assert.match(ui,/'Try again','retry-claude'/);
  assert.match(ui,/confirmInterrupted/);
  assert.match(ui,/Source IDs/);
  assert.match(ui,/j\.content_id===c\.id&&j\.revision===c\.revision/);
  assert.match(ui,/scopeCurrent!==false/);
  assert.match(ui,/c\.sources\[Number\(id\.slice\(1\)\)-1\]/);
  assert.match(ui,/source\.title/);
  assert.match(ui,/source\.url/);
});

test('Claude retests revoke the previous passed state before queue admission',async t=>{
  const store=new Store(':memory:');t.after(()=>store.close());
  const family=store.saveFamily({name:'Retest boundary',tier:'A',countries:['Pakistan'],audience:'Adults reviewing bounded original content.',niche:'Original fiction',locales:['en-US'],timezone:'Asia/Karachi',monthlyBudget:20,cadence:1,format:'long-form'});
  const content=store.saveContent({familyId:family.id,title:'A retest boundary draft',kind:'fiction',angle:'Use an original scenario to verify connector retest isolation.',hook:'Can generation start while its connector is being retested?',script:'Existing creator text remains unchanged during this connector boundary test.',sources:[],rightsConfirmed:true});
  let retesting=false,release;
  const slots=new ConnectorSlots(store,fixtureProtector,async url=>{if(retesting&&isClaudeModel(url)){retesting=false;return new Promise(resolve=>{release=()=>resolve(claudeModel(url));});}return claudeModel(url);});
  const connector=slots.save({name:'Retested Claude',provider:'claude',notes:'Boundary fixture',key});await slots.test(connector.id,connector.revision);const reasoning=new ScriptWriter(store,new Ai(slots));retesting=true;const pending=slots.test(connector.id,connector.revision);
  assert.equal(slots.list()[0].busy,true);assert.equal(store.aiConnectorCurrent({connectorId:connector.id,connectorRevision:connector.revision}),false);
  assert.throws(()=>reasoning.queue(content.id,{revision:content.revision,connectorId:connector.id,connectorRevision:connector.revision}),{status:409});
  while(!release)await new Promise(resolve=>setTimeout(resolve,5)); // the SDK reaches the network a few steps later
  release();await pending;
});
