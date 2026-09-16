'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {Store}=require('../store');
const {ConnectorSlots}=require('../connectors');
const {ResearchReasoning,validateResearchResult}=require('../research');
const {createApp}=require('../server');

const protector={transform:(operation,input)=>Buffer.from([...input].reverse())};
const key='fixture-hermes-'+'r'.repeat(32);
const familyLocalDay=(timeZone='Asia/Karachi')=>{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(part=>[part.type,part.value]));return `${parts.year}-${parts.month}-${parts.day}`;};
const localBriefDate=familyLocalDay(),outputExpiry=new Date(`${localBriefDate}T12:00:00.000Z`);outputExpiry.setUTCDate(outputExpiry.getUTCDate()+7);
const familyInput=(extra={})=>({name:'Research family',tier:'A',countries:['United States'],audience:'Adults seeking evidence-led practical explanations.',niche:'Creator systems',spanishLocale:'es-419',englishLocale:'en-US',timezone:'Asia/Karachi',monthlyBudget:100,cadence:2,format:'long-form',monthlyTokenLimit:100000,scriptTokenLimit:6000,researchTokenLimit:4000,...extra});
const evidenceInput=(familyId,extra={})=>({familyId,title:'Official creator research',url:'https://example.com/research',publisher:'Example Publisher',publishedAt:'2026-09-09',permission:'permitted',analysisMode:'brief_synthesis_permitted',notes:'This evidence supports a dated observation about creator workflow.',rightsNotes:'Public factual source; summarize with attribution, do not copy expression.',...extra});
const output={decision:'topics',rationale:'One timely, well-supported topic fits the saved audience.',topics:[{title:'Why creator workflows stall at handoffs',audienceNeed:'A practical way to find hidden delays.',whyNow:{text:'The supplied evidence documents a current workflow observation.',sourceIds:['S1']},angle:'Turn one dated observation into an original diagnostic method.',hooks:['Your workflow is not slow where you think.','The hidden delay starts between two ordinary steps.','One handoff may be costing your whole routine.'],outline:['Open with the surprising handoff.','Explain the evidence carefully.','Demonstrate an original diagnostic example.','End with a practical test.'],evidenceClaims:[{text:'The source documents the workflow observation.',sourceIds:['S1']}],confidence:{level:'medium',rationale:'One permitted source supports the core observation.',missingEvidence:['A second independent source would improve confidence.']},uncertainties:['The observation may not generalize to every creator.'],expiresAt:outputExpiry.toISOString().slice(0,10)}]};

function setup(t,fetchImpl,familyExtra={}){
  const store=new Store(':memory:');t.after(()=>store.close());
  const family=store.saveFamily(familyInput(familyExtra));
  const slots=new ConnectorSlots(store,protector,fetchImpl);
  return {store,family,slots};
}

function provider(result=output,calls=[]){return async (url,options)=>{
  calls.push({url:String(url),options});
  if(String(url).endsWith('/v1/capabilities'))return Response.json({auth:{type:'bearer',required:true},features:{chat_completions:true}});
  if(String(url).endsWith('/v1/toolsets'))return Response.json([]);
  return Response.json({choices:[{message:{content:JSON.stringify(result)}}],usage:{prompt_tokens:450,completion_tokens:700,total_tokens:1150}});
};}

async function connector(slots){const saved=slots.save({name:'Research Hermes',provider:'hermes',notes:'Tool-free review-only research synthesis',key});await slots.test(saved.id,saved.revision);return saved;}

test('research evidence is family-scoped, revisioned, permission-labeled and archived without deletion',t=>{
  const {store,family}=setup(t,provider());
  const saved=store.saveResearchEvidence(evidenceInput(family.id));
  assert.equal(saved.revision,1);assert.equal(saved.archived,false);assert.equal(saved.analysisMode,'brief_synthesis_permitted');
  assert.throws(()=>store.saveResearchEvidence({...saved,familyId:'other',revision:1},saved.id));
  const revised=store.saveResearchEvidence({...saved,title:'Revised source title',revision:1},saved.id);
  assert.equal(revised.revision,2);assert.equal(revised.familyId,family.id);
  const archived=store.archiveResearchEvidence(saved.id,{revision:2,archived:true});
  assert.equal(archived.archived,true);assert.equal(store.state().researchEvidence.length,1);
});

test('research evidence uses HTTPS, exact calendar dates, sane chronology and preserves access provenance on edit',t=>{
  const {store,family}=setup(t,provider());
  assert.throws(()=>store.saveResearchEvidence(evidenceInput(family.id,{url:'http://example.com/source'})),/HTTPS/i);
  assert.throws(()=>store.saveResearchEvidence(evidenceInput(family.id,{publishedAt:'2026-02-30'})),/YYYY-MM-DD/i);
  assert.throws(()=>store.saveResearchEvidence(evidenceInput(family.id,{publishedAt:'2026-09-12',accessedAt:'2026-09-11'})),/published.*access/i);
  assert.throws(()=>store.saveResearchEvidence(evidenceInput(family.id,{accessedAt:'2026-09-12',expiresAt:'2026-09-11'})),/access.*expiry/i);
  const saved=store.saveResearchEvidence(evidenceInput(family.id,{publishedAt:'2026-01-01',accessedAt:'2026-01-02',expiresAt:'2026-12-31'}));
  const {accessedAt,...editedInput}=saved;
  const revised=store.saveResearchEvidence({...editedInput,title:'Title-only revision',revision:saved.revision},saved.id);
  assert.equal(revised.accessedAt,'2026-01-02');
  assert.throws(()=>store.saveResearchEvidence({...revised,accessedAt:'2026-02-02',revision:revised.revision},saved.id),/access date.*cannot change/i);
});

test('research output requires exact evidence-linked topic fields',()=>{
  const sourceIds=new Set(['S1']);
  assert.equal(validateResearchResult(output,sourceIds).topics.length,1);
  assert.throws(()=>validateResearchResult({...output,extra:true},sourceIds),/shape/i);
  assert.throws(()=>validateResearchResult({...output,topics:[{...output.topics[0],whyNow:{text:'Unsupported',sourceIds:['S2']}}]},sourceIds),/source/i);
  assert.throws(()=>validateResearchResult({...output,decision:'no_strong_topic'},sourceIds),/zero topics/i);
  assert.deepEqual(validateResearchResult({decision:'no_strong_topic',rationale:'No topic has enough current evidence today.',topics:[]},sourceIds).topics,[]);
  const context={briefDate:localBriefDate,sourceExpiries:new Map([['S1','2026-09-30']])};
  assert.throws(()=>validateResearchResult({...output,topics:[{...output.topics[0],expiresAt:'2026-02-30'}]},sourceIds,context),/expiry/i);
  assert.throws(()=>validateResearchResult({...output,topics:[{...output.topics[0],expiresAt:'2026-09-09'}]},sourceIds,context),/expiry/i);
  assert.throws(()=>validateResearchResult({...output,topics:[{...output.topics[0],expiresAt:'2026-10-01'}]},sourceIds,context),/expiry/i);
});

test('brief dates reject impossible, backdated, and expired-at-claim work before Hermes',async t=>{
  const {store,family,slots}=setup(t,provider()),source=store.saveResearchEvidence(evidenceInput(family.id)),hermes=await connector(slots),reasoning=new ResearchReasoning(store,slots);
  assert.throws(()=>reasoning.queue(family.id,{familyRevision:family.revision,briefDate:'2026-02-31',connectorId:hermes.id,connectorRevision:hermes.revision,evidence:[{id:source.id,revision:source.revision}]}),/YYYY-MM-DD/i);
  const yesterdayDate=new Date(`${localBriefDate}T12:00:00.000Z`);yesterdayDate.setUTCDate(yesterdayDate.getUTCDate()-1);const yesterday=yesterdayDate.toISOString().slice(0,10);
  assert.throws(()=>reasoning.queue(family.id,{familyRevision:family.revision,briefDate:yesterday,connectorId:hermes.id,connectorRevision:hermes.revision,evidence:[{id:source.id,revision:source.revision}]}),/current family-local day/i);
  const queued=reasoning.queue(family.id,{familyRevision:family.revision,briefDate:localBriefDate,connectorId:hermes.id,connectorRevision:hermes.revision,evidence:[{id:source.id,revision:source.revision}]});
  const stored=store.researchEvidence(source.id);stored.expiresAt=yesterday;store.db.prepare('UPDATE research_evidence SET payload=? WHERE id=?').run(JSON.stringify(stored),source.id);
  assert.equal(store.claimResearchBrief(),null);assert.equal(store.state().researchJobs.find(item=>item.id===queued.id).status,'stale');
});

test('research budget admission blocks before provider execution',async t=>{
  let completions=0;const fetchImpl=async url=>{if(String(url).endsWith('/v1/capabilities'))return Response.json({auth:{type:'bearer',required:true},features:{chat_completions:true}});if(String(url).endsWith('/v1/toolsets'))return Response.json([]);completions++;return Response.json({});},{store,family,slots}=setup(t,fetchImpl,{monthlyTokenLimit:3000,researchTokenLimit:4000}),source=store.saveResearchEvidence(evidenceInput(family.id)),hermes=await connector(slots),reasoning=new ResearchReasoning(store,slots),job=reasoning.queue(family.id,{familyRevision:family.revision,briefDate:localBriefDate,connectorId:hermes.id,connectorRevision:hermes.revision,evidence:[{id:source.id,revision:source.revision}]});
  await reasoning.processNext();assert.equal(store.state().researchJobs.find(item=>item.id===job.id).status,'blocked_budget');assert.equal(completions,0);assert.equal(store.usageSummary(family.id).reservedTokens,0);
});

test('research usage rejects inconsistent partial counters',async t=>{
  const {store,family,slots}=setup(t,provider()),source=store.saveResearchEvidence(evidenceInput(family.id)),hermes=await connector(slots),reasoning=new ResearchReasoning(store,slots),job=reasoning.queue(family.id,{familyRevision:family.revision,briefDate:localBriefDate,connectorId:hermes.id,connectorRevision:hermes.revision,evidence:[{id:source.id,revision:source.revision}]});store.claimResearchBrief();assert.equal(store.completeResearchBrief(job.id,{result:output,usage:{promptTokens:200,completionTokens:null,totalTokens:100}}),null);assert.equal(store.state().researchJobs.find(item=>item.id===job.id).status,'usage_unknown');assert.throws(()=>reasoning.retry(job.id,{familyRevision:family.revision,connectorId:hermes.id,connectorRevision:hermes.revision}),/confirm/i);const retry=reasoning.retry(job.id,{familyRevision:family.revision,connectorId:hermes.id,connectorRevision:hermes.revision,confirmInterrupted:true});assert.equal(retry.attempts,2);
});

test('research preflight failures release usage before any completion request',async()=>{
  let completions=0,failed;const promptInput={family:{name:'x'},briefDate:localBriefDate,sources:[{id:'S1',recordId:'r1',expiresAt:'2026-09-30',notes:'x'.repeat(66000)}],policy:{maxCompletionTokens:500,totalTokenLimit:8000}},store={claimResearchBrief:()=>({id:'job',scope:{connectorId:'connector',promptInput}}),completeResearchBrief:()=>{},failResearchBrief:(id,message,options)=>{failed={id,message,options};}},connectors={key:()=>key,fetch:async url=>{if(String(url).endsWith('/v1/capabilities'))return Response.json({auth:{type:'bearer',required:true},features:{chat_completions:true}});if(String(url).endsWith('/v1/toolsets'))return Response.json([]);completions++;return Response.json({});}};await new ResearchReasoning(store,connectors).processNext();assert.equal(completions,0);assert.equal(failed.options.usageUnknown,false);
});

test('daily research brief uses only selected permitted evidence and stores immutable review-only topics',async t=>{
  const calls=[],{store,family,slots}=setup(t,provider(output,calls)),source=store.saveResearchEvidence(evidenceInput(family.id)),hermes=await connector(slots);
  const reasoning=new ResearchReasoning(store,slots);
  const first=reasoning.queue(family.id,{familyRevision:family.revision,briefDate:localBriefDate,connectorId:hermes.id,connectorRevision:hermes.revision,evidence:[{id:source.id,revision:source.revision}]});
  const duplicate=reasoning.queue(family.id,{familyRevision:family.revision,briefDate:localBriefDate,connectorId:hermes.id,connectorRevision:hermes.revision,evidence:[{id:source.id,revision:source.revision}]});
  assert.equal(first.id,duplicate.id);
  await reasoning.processNext();
  const state=store.state(),brief=state.topicBriefs[0];
  assert.equal(state.researchJobs[0].status,'completed');assert.equal(brief.status,'review_only');assert.equal(brief.payload.title,output.topics[0].title);
  assert.equal(brief.evidenceSnapshot[0].id,'S1');assert.equal(brief.evidenceSnapshot[0].title,source.title);
  assert.equal(state.contents.length,0);assert.equal(state.usage.find(row=>row.kind==='research_brief').totalTokens,1150);
  const completion=JSON.parse(calls.find(call=>call.url.endsWith('/v1/chat/completions')).options.body);
  assert.match(completion.messages[0].content,/untrusted/i);assert.match(completion.messages[0].content,/use \[\] when none/i);assert.match(completion.messages[1].content,/Official creator research/);
});

test('unreviewed, display-only, expired and cross-family evidence never reaches Hermes',async t=>{
  let completions=0;const {store,family,slots}=setup(t,async url=>{if(String(url).endsWith('/v1/capabilities'))return Response.json({auth:{type:'bearer',required:true},features:{chat_completions:true}});if(String(url).endsWith('/v1/toolsets'))return Response.json([]);completions++;return Response.json({});});
  const hermes=await connector(slots),reasoning=new ResearchReasoning(store,slots);
  for(const extra of [{permission:'unreviewed'},{analysisMode:'display_only'},{publishedAt:'2026-09-07',accessedAt:'2026-09-08',expiresAt:'2026-09-09'}]){
    const evidence=store.saveResearchEvidence(evidenceInput(family.id,extra));
    assert.throws(()=>reasoning.queue(family.id,{familyRevision:family.revision,briefDate:localBriefDate,connectorId:hermes.id,connectorRevision:hermes.revision,evidence:[{id:evidence.id,revision:evidence.revision}]}));
  }
  const other=store.saveFamily({...familyInput(),name:'Other research family'}),cross=store.saveResearchEvidence(evidenceInput(other.id));
  assert.throws(()=>reasoning.queue(family.id,{familyRevision:family.revision,briefDate:localBriefDate,connectorId:hermes.id,connectorRevision:hermes.revision,evidence:[{id:cross.id,revision:cross.revision}]}));
  assert.equal(completions,0);
});

test('duplicate topic titles are retained as quality-failed instead of mutating content',async t=>{
  const {store,family,slots}=setup(t,provider()),source=store.saveResearchEvidence(evidenceInput(family.id)),hermes=await connector(slots),reasoning=new ResearchReasoning(store,slots);
  store.saveContent({familyId:family.id,title:output.topics[0].title,kind:'fiction',angle:'A deliberately matching existing content title for deduplication.',hook:'This existing topic already covers the same idea clearly.',script:'',sources:[],rightsConfirmed:true});
  reasoning.queue(family.id,{familyRevision:family.revision,briefDate:localBriefDate,connectorId:hermes.id,connectorRevision:hermes.revision,evidence:[{id:source.id,revision:source.revision}]});
  await reasoning.processNext();
  const state=store.state();assert.equal(state.researchJobs[0].status,'quality_failed');assert.equal(state.topicBriefs[0].status,'quality_failed');assert.match(state.topicBriefs[0].quality.issues.join(' '),/duplicate/i);assert.equal(state.contents.length,1);
});

test('near-duplicate topic detection segments no-space language titles',t=>{const store=new Store(':memory:');t.after(()=>store.close());assert.ok(store.topicSimilarity('人工智能如何改变视频创作者日常工作流程效率','人工智能正在改变视频创作者日常工作流程效率','zh-CN')>=0.8);});

test('no-strong-topic decisions remain visible with their review rationale',async t=>{
  const noTopic={decision:'no_strong_topic',rationale:'The available evidence is too weak and too narrow to justify a topic today.',topics:[]},{store,family,slots}=setup(t,provider(noTopic)),source=store.saveResearchEvidence(evidenceInput(family.id)),hermes=await connector(slots),reasoning=new ResearchReasoning(store,slots);
  reasoning.queue(family.id,{familyRevision:family.revision,briefDate:localBriefDate,connectorId:hermes.id,connectorRevision:hermes.revision,evidence:[{id:source.id,revision:source.revision}]});await reasoning.processNext();const job=store.state().researchJobs[0];assert.equal(job.decision,'no_strong_topic');assert.equal(job.rationale,noTopic.rationale);assert.equal(store.state().topicBriefs.length,0);
});

test('research retries are deliberate, capped and preserve paid-attempt semantics',async t=>{
  const {store,family,slots}=setup(t,provider()),source=store.saveResearchEvidence(evidenceInput(family.id)),hermes=await connector(slots),reasoning=new ResearchReasoning(store,slots);
  const first=reasoning.queue(family.id,{familyRevision:family.revision,briefDate:localBriefDate,connectorId:hermes.id,connectorRevision:hermes.revision,evidence:[{id:source.id,revision:source.revision}]});
  store.claimResearchBrief();store.failResearchBrief(first.id,'unknown provider outcome',{usageUnknown:true});
  const second=reasoning.retry(first.id,{familyRevision:family.revision,connectorId:hermes.id,connectorRevision:hermes.revision,confirmInterrupted:true});
  assert.equal(second.attempts,2);assert.equal(store.state().researchJobs.find(item=>item.id===first.id).status,'retried');
  store.claimResearchBrief();store.failResearchBrief(second.id,'unknown provider outcome',{usageUnknown:true});
  const third=reasoning.retry(second.id,{familyRevision:family.revision,connectorId:hermes.id,connectorRevision:hermes.revision,confirmInterrupted:true});assert.equal(third.attempts,3);
  store.claimResearchBrief();store.failResearchBrief(third.id,'unknown provider outcome',{usageUnknown:true});
  assert.throws(()=>reasoning.retry(third.id,{familyRevision:family.revision,connectorId:hermes.id,connectorRevision:hermes.revision,confirmInterrupted:true}),/maximum/i);
});

test('retried research rebuilds a valid current evidence snapshot',async t=>{
  const {store,family,slots}=setup(t,provider()),source=store.saveResearchEvidence(evidenceInput(family.id)),hermes=await connector(slots),reasoning=new ResearchReasoning(store,slots);
  const first=reasoning.queue(family.id,{familyRevision:family.revision,briefDate:localBriefDate,connectorId:hermes.id,connectorRevision:hermes.revision,evidence:[{id:source.id,revision:source.revision}]});
  store.db.prepare("UPDATE research_jobs SET status='failed' WHERE id=?").run(first.id);
  const retry=reasoning.retry(first.id,{familyRevision:family.revision,connectorId:hermes.id,connectorRevision:hermes.revision});
  await reasoning.processNext();
  const current=store.state();assert.equal(current.researchJobs.find(item=>item.id===retry.id).status,'completed');assert.equal(current.topicBriefs.length,1);
});

test('research HTTP routes are locally protected and UI exposes review-only daily briefs',async t=>{
  const app=createApp({dataFile:':memory:',worker:false,protector,providerFetch:provider()});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>app.server.close(resolve)));
  const root=`http://127.0.0.1:${app.server.address().port}`,initial=await(await fetch(root+'/api/state')).json();
  const send=(route,body,method='POST',token=initial.token)=>fetch(root+route,{method,headers:{'Content-Type':'application/json','X-Local-Token':token},body:JSON.stringify(body)});
  const family=await(await send('/api/families',familyInput())).json();
  assert.equal((await send('/api/research/evidence',evidenceInput(family.id),'POST','')).status,403);
  const evidence=await(await send('/api/research/evidence',evidenceInput(family.id))).json();
  const hermes=await(await send('/api/connectors',{name:'Research Hermes',provider:'hermes',notes:'Tool-free research',key})).json();await send(`/api/connectors/${hermes.id}/test`,{revision:hermes.revision});
  const queued=await send(`/api/families/${family.id}/research-briefs`,{familyRevision:family.revision,briefDate:localBriefDate,connectorId:hermes.id,connectorRevision:hermes.revision,evidence:[{id:evidence.id,revision:evidence.revision}]});
  assert.equal(queued.status,200);await app.researchReasoning.processNext();
  const state=await(await fetch(root+'/api/state')).json();assert.equal(state.topicBriefs.length,1);assert.equal(state.capabilities.text,'bounded_hermes_candidates');assert.equal(state.capabilities.research,'review_only_saved_evidence');assert.equal(JSON.stringify(state).includes(key),false);
  const html=await(await fetch(root)).text(),ui=await(await fetch(root+'/app.js')).text();assert.match(html,/Research briefs/);assert.match(ui,/Prepare daily brief/);assert.match(ui,/connector\?action\('Prepare daily brief'/);assert.match(ui,/Review only/);assert.match(ui,/No strong topic/);assert.match(ui,/Outline/);assert.match(ui,/Missing evidence/);assert.match(ui,/Uncertainties/);assert.match(ui,/item\.period===period/);assert.match(ui,/Bounded Hermes/);assert.match(ui,/Connected for bounded script candidates and review-only synthesis/);assert.doesNotMatch(ui,/AI writing is not connected yet/);assert.doesNotMatch(ui,/deeper research/);assert.doesNotMatch(ui,/Publish brief/);
});
