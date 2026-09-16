'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {Store}=require('../store');
const {assessScriptQuality,HermesReasoning,deriveCompletionLimit}=require('../hermes');
const {ResearchReasoning,validateResearchResult}=require('../research');
const {ConnectorSlots}=require('../connectors');

const protector={transform:(operation,input)=>Buffer.from([...input].reverse())};
const key='fixture-hermes-'+'z'.repeat(32);
const hook='This exact opening hook must remain unchanged today.';
const words=(count,prefix='word')=>Array.from({length:count},(_,i)=>`${prefix}${i+1}`).join(' ');
const qualityScript=(opening=hook,count=650)=>{const remaining=count-opening.split(/\s+/).length,size=Math.floor(remaining/4);return [opening+' '+words(size,'opening'),words(size,'development'),words(size,'example'),words(remaining-size*3,'payoff')].join('\n\n');};
const familyInput=(extra={})=>({name:'Review blocker family',tier:'A',countries:['United States'],audience:'Adults who need careful evidence-led explanations.',niche:'Evidence systems',spanishLocale:'es-419',englishLocale:'en-US',timezone:'Asia/Karachi',monthlyBudget:100,cadence:2,format:'long-form',monthlyTokenLimit:200000,scriptTokenLimit:8000,researchTokenLimit:8000,...extra});
const evidenceInput=(familyId,index=1,extra={})=>({familyId,title:`Evidence ${index}`,url:`https://example.com/evidence-${index}`,publisher:'Example Publisher',publishedAt:'2026-09-01',accessedAt:'2026-09-05',expiresAt:'2026-09-30',permission:'permitted',analysisMode:'brief_synthesis_permitted',notes:'Current factual evidence for the isolated regression test.',rightsNotes:'Public factual source summarized with attribution only.',...extra});
const contentInput=(familyId,extra={})=>({familyId,title:'Review blocker script',kind:'fiction',angle:'A sufficiently specific original angle for this regression test.',hook,script:qualityScript(),sources:[],rightsConfirmed:true,...extra});
const candidate=()=>({title:'Review blocker candidate',angle:'A sufficiently specific original candidate angle.',hook,script:qualityScript(),claims:[],uncertainties:[]});
const researchOutput=(extra={})=>({decision:'topics',rationale:'The selected evidence supports one current topic for review.',topics:[{title:'A current topic for careful review',audienceNeed:'Readers need a concrete way to understand the current evidence.',whyNow:{text:'The evidence is current for the selected brief date.',sourceIds:['S1']},angle:'Use the evidence to build an original practical diagnostic.',hooks:['First meaningful hook for this topic.','Second meaningful hook for this topic.','Third meaningful hook for this topic.'],outline:['Introduce the current problem.','Explain what the evidence supports.','Show an original example.','Close with a practical check.'],evidenceClaims:[{text:'The evidence supports the dated observation.',sourceIds:['S1']}],confidence:{level:'medium',rationale:'One current source supports the observation.',missingEvidence:['A second independent source would improve confidence.']},uncertainties:['The observation may not generalize.'],expiresAt:'2026-09-20'}],...extra});

function tempDb(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'youtube-review-'));const file=path.join(dir,'workspace.sqlite');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return file;}
function saveConnector(store,fetchImpl){const slots=new ConnectorSlots(store,protector,fetchImpl);return {slots,save:async()=>{const item=slots.save({name:'Review Hermes',provider:'hermes',notes:'Isolated review regression connector',key});await slots.test(item.id,item.revision);return item;}};}
function setup(t,extra={}){const store=new Store(':memory:');t.after(()=>store.close());const family=store.saveFamily(familyInput(extra)),content=store.saveContent(contentInput(family.id)),connector={id:'connector-1',revision:1};store.db.prepare('INSERT INTO connectors(id,name_key,payload,secret) VALUES(?,?,?,?)').run(connector.id,'review connector',JSON.stringify({id:connector.id,provider:'hermes',revision:1,test:{status:'passed'}}),Buffer.from('secret'));return {store,family,content,connector};}

test('research idempotency canonicalizes evidence order and includes family revision',t=>{
  const store=new Store(':memory:');t.after(()=>store.close());
  let family=store.saveFamily(familyInput());
  const firstEvidence=store.saveResearchEvidence(evidenceInput(family.id,1));
  const secondEvidence=store.saveResearchEvidence(evidenceInput(family.id,2));
  const request={familyRevision:family.revision,briefDate:store.localDay(family),connectorId:'connector-1',connectorRevision:1,evidence:[{id:firstEvidence.id,revision:1},{id:secondEvidence.id,revision:1}]};
  const first=store.queueResearchBrief(family.id,request);
  const reordered=store.queueResearchBrief(family.id,{...request,evidence:[...request.evidence].reverse()});
  assert.equal(reordered.id,first.id);
  const firstScope=JSON.parse(first.input);
  assert.deepEqual(firstScope.evidence.map(item=>item.id),[firstEvidence.id,secondEvidence.id].sort());
  family=store.saveFamily({...familyInput(),name:'Review blocker family revised',revision:family.revision},family.id);
  const revised=store.queueResearchBrief(family.id,{...request,familyRevision:family.revision});
  assert.notEqual(revised.id,first.id);
});

test('script quality requires the exact returned hook at byte zero',()=>{
  assert.equal(assessScriptQuality({hook,script:qualityScript(hook)},'long-form').passed,true);
  assert.equal(assessScriptQuality({hook,script:qualityScript(`Before it: ${hook}`)},'long-form').issues.some(issue=>/open with/i.test(issue)),true);
  assert.equal(assessScriptQuality({hook,script:qualityScript(hook.toLowerCase())},'long-form').issues.some(issue=>/open with/i.test(issue)),true);
});

test('changing family format invalidates approval and derived storyboard editions',t=>{
  const store=new Store(':memory:');t.after(()=>store.close());
  const family=store.saveFamily(familyInput());
  const content=store.saveContent(contentInput(family.id));
  store.reviewContent(content.id,{revision:1,action:'submit'});
  const approved=store.reviewContent(content.id,{revision:1,action:'approve'});
  assert.equal(approved.approvedFamilyRevision,family.revision);
  store.queueStoryboard(content.id,{revision:1});store.processNextJob();
  const revisedFamily=store.saveFamily({...familyInput({format:'shorts'}),revision:family.revision},family.id);
  const invalidated=store.content(content.id);
  assert.equal(revisedFamily.revision,2);
  assert.equal(invalidated.state,'draft');
  assert.equal(invalidated.approvedAt,null);
  assert.equal(invalidated.approvedFamilyRevision,null);
  assert.deepEqual(invalidated.scenes,[]);
  assert.ok(invalidated.editions.every(item=>item.state==='not_started'));
  assert.throws(()=>store.queueStoryboard(content.id,{revision:content.revision}),/approve|review/i);
});

test('partial usage counters are consistent and known overages remain fully charged',t=>{
  const {store,family,content,connector}=setup(t,{monthlyTokenLimit:20000,scriptTokenLimit:6000});
  const first=store.queueHermesScript(content.id,{revision:content.revision,connectorId:connector.id,connectorRevision:connector.revision});
  store.claimHermesScriptJob();
  assert.equal(store.completeHermesScriptJob(first.id,{candidate:candidate(),usage:{promptTokens:200,completionTokens:null,totalTokens:100}}),null);
  assert.equal(store.state().jobs.find(item=>item.id===first.id).status,'usage_unknown');
  assert.throws(()=>store.retryHermesScriptJob(first.id,{revision:content.revision,connectorId:connector.id,connectorRevision:connector.revision}),/confirm/i);

  const next=store.retryHermesScriptJob(first.id,{revision:content.revision,connectorId:connector.id,connectorRevision:connector.revision,confirmInterrupted:true});
  assert.equal(next.attempts,2);
  store.claimHermesScriptJob();
  assert.equal(store.completeHermesScriptJob(next.id,{candidate:candidate(),usage:{promptTokens:3000,completionTokens:4000,totalTokens:7000}}),null);
  const summary=store.usageSummary(family.id);
  assert.equal(summary.reservedTokens,13000);
  assert.equal(summary.remainingTokens,7000);
});

test('worker marks usage unknown only after the completion request actually starts',async()=>{
  let completions=0,failed;
  const promptInput={family:{name:'x',format:'long-form'},content:{kind:'factual'},sources:[{id:'S1',notes:'x'.repeat(33000)}],policy:{maxCompletionTokens:500,totalTokenLimit:6000}};
  const store={claimHermesScriptJob:()=>({id:'job',scope:{connectorId:'connector',promptInput}}),completeHermesScriptJob:()=>{},failHermesScriptJob:(id,message,options)=>{failed={id,message,options};}};
  const connectors={key:()=>key,fetch:async url=>{if(String(url).endsWith('/v1/capabilities'))return Response.json({auth:{type:'bearer',required:true},features:{chat_completions:true}});if(String(url).endsWith('/v1/toolsets'))return Response.json([]);completions++;return Response.json({});}};
  await new HermesReasoning(store,connectors).processNext();
  assert.equal(completions,0);assert.equal(failed.options.usageUnknown,false);
});

test('unknown provider outcomes require confirmation and released failures do not consume another paid attempt',t=>{
  const {store,content,connector}=setup(t);
  const first=store.queueHermesScript(content.id,{revision:content.revision,connectorId:connector.id,connectorRevision:connector.revision});store.claimHermesScriptJob();
  store.failHermesScriptJob(first.id,'transport failed',{usageUnknown:true});
  assert.equal(store.state().jobs.find(item=>item.id===first.id).status,'interrupted');
  assert.throws(()=>store.retryHermesScriptJob(first.id,{revision:content.revision,connectorId:connector.id,connectorRevision:connector.revision}),/confirm/i);
  const second=store.retryHermesScriptJob(first.id,{revision:content.revision,connectorId:connector.id,connectorRevision:connector.revision,confirmInterrupted:true});assert.equal(second.attempts,2);
  store.claimHermesScriptJob();store.failHermesScriptJob(second.id,'local failure',{usageUnknown:false});
  const samePaidAttempt=store.retryHermesScriptJob(second.id,{revision:content.revision,connectorId:connector.id,connectorRevision:connector.revision});assert.equal(samePaidAttempt.attempts,2);
});

test('script jobs derive max_tokens from actual UTF-8 messages and the total job ceiling',async t=>{
  const calls=[],store=new Store(':memory:');t.after(()=>store.close());
  const family=store.saveFamily(familyInput({scriptTokenLimit:4500}));
  const content=store.saveContent(contentInput(family.id));
  const connectorSetup=saveConnector(store,async (url,options)=>{
    if(String(url).endsWith('/v1/capabilities'))return Response.json({auth:{type:'bearer',required:true},features:{chat_completions:true}});
    if(String(url).endsWith('/v1/toolsets'))return Response.json([]);
    calls.push(JSON.parse(options.body));
    return Response.json({choices:[{message:{content:JSON.stringify({title:content.title,angle:content.angle,hook,script:qualityScript(),claims:[],uncertainties:[]})}}],usage:{prompt_tokens:500,completion_tokens:1000,total_tokens:1500}});
  });
  const connector=await connectorSetup.save(),reasoning=new HermesReasoning(store,connectorSetup.slots);
  reasoning.queue(content.id,{revision:content.revision,connectorId:connector.id,connectorRevision:connector.revision});
  await reasoning.processNext();
  assert.equal(calls.length,1);
  const sent=calls[0],promptUpperBound=Buffer.byteLength(JSON.stringify(sent.messages),'utf8');
  assert.equal(sent.max_tokens,Math.min(4000,4500-promptUpperBound));
  assert.ok(promptUpperBound+sent.max_tokens<=4500);
});

test('completion-limit derivation always proves prompt plus completion is inside the ceiling',()=>{
  const input={family:{name:'Boundary',format:'long-form'},content:{kind:'fiction',title:'Digits'},sources:[]};
  for(let totalTokenLimit=500;totalTokenLimit<=10000;totalTokenLimit++){
    const derived=deriveCompletionLimit(input,totalTokenLimit,4000);
    if(derived.maxCompletionTokens>0)assert.ok(derived.maxCompletionTokens+derived.promptTokenUpperBound<=totalTokenLimit,`ceiling ${totalTokenLimit}`);
    else assert.ok(derived.promptTokenUpperBound>totalTokenLimit||derived.promptTokenUpperBound===totalTokenLimit);
    assert.equal(derived.promptInput.policy.maxCompletionTokens,derived.maxCompletionTokens);
  }
});

test('budget-only family edits preserve a valid approval and storyboard admission',t=>{
  const store=new Store(':memory:');t.after(()=>store.close());
  let family=store.saveFamily(familyInput()),content=store.saveContent(contentInput(family.id));
  store.reviewContent(content.id,{revision:content.revision,action:'submit'});content=store.reviewContent(content.id,{revision:content.revision,action:'approve'});
  family=store.saveFamily({...familyInput({monthlyTokenLimit:120000}),revision:family.revision},family.id);
  assert.equal(store.content(content.id).state,'approved');
  const job=store.queueStoryboard(content.id,{revision:content.revision});assert.ok(job);store.processNextJob();
  assert.equal(store.state().jobs.find(item=>item.id===job.id).status,'completed');
});

test('current family format revalidates old script candidates before adoption',t=>{
  const {store,family,content,connector}=setup(t);
  const job=store.queueHermesScript(content.id,{revision:content.revision,connectorId:connector.id,connectorRevision:connector.revision});store.claimHermesScriptJob();
  const created=store.completeHermesScriptJob(job.id,{candidate:candidate(),usage:{promptTokens:1000,completionTokens:1000,totalTokens:2000}});assert.equal(created.status,'available');
  store.saveFamily({...familyInput({format:'shorts'}),revision:family.revision},family.id);
  const staleFormat=store.scriptCandidate(created.id);assert.equal(staleFormat.status,'quality_failed');assert.equal(staleFormat.quality.format,'shorts');
});

test('v0.4 migration is atomic, fail-closed, accounts known usage and invalidates old approvals',t=>{
  const file=tempDb(t),db=new DatabaseSync(file),at='2026-09-10T00:00:00.000Z',family={id:'family-1',name:'Legacy family',tier:'A',countries:['United States'],audience:'Adults seeking careful evidence-led explanations.',niche:'Evidence systems',spanishLocale:'es-419',englishLocale:'en-US',timezone:'Asia/Karachi',budgetCents:10000,cadence:2,format:'long-form',revision:1,createdAt:at,updatedAt:at,archived:false,channels:[]},content={id:'content-1',familyId:'family-1',revision:1,state:'approved',title:'Legacy approved content',kind:'fiction',angle:'A sufficiently specific original legacy angle.',hook,script:`${hook} Too short.`,sources:[],rightsConfirmed:true,approvedAt:at,scenes:[{id:'old-scene'}],editions:[{language:'en',state:'script_ready'}],createdAt:at,updatedAt:at},passing={id:'content-2',familyId:'family-1',revision:1,state:'approved',title:'Legacy valid approved content',kind:'fiction',angle:'A sufficiently specific original legacy angle.',hook,script:qualityScript(),sources:[],rightsConfirmed:true,approvedAt:at,scenes:[],editions:[],createdAt:at,updatedAt:at},payload={title:'Legacy candidate',angle:'A sufficiently specific original legacy angle.',hook,script:`${hook} Too short.`,claims:[],uncertainties:[]};
  db.exec(`PRAGMA foreign_keys=ON;CREATE TABLE families(id TEXT PRIMARY KEY,name_key TEXT UNIQUE NOT NULL,payload TEXT NOT NULL);CREATE TABLE content(id TEXT PRIMARY KEY,family_id TEXT NOT NULL REFERENCES families(id),payload TEXT NOT NULL);CREATE TABLE jobs(id TEXT PRIMARY KEY,content_id TEXT NOT NULL REFERENCES content(id),revision INTEGER NOT NULL,type TEXT NOT NULL,status TEXT NOT NULL,input TEXT,result TEXT,error TEXT,attempts INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(content_id,revision,type));CREATE TABLE script_candidates(id TEXT PRIMARY KEY,job_id TEXT UNIQUE NOT NULL REFERENCES jobs(id),content_id TEXT NOT NULL REFERENCES content(id),family_id TEXT NOT NULL REFERENCES families(id),content_revision INTEGER NOT NULL,family_revision INTEGER NOT NULL,connector_id TEXT NOT NULL,connector_revision INTEGER NOT NULL,language TEXT NOT NULL,locale TEXT NOT NULL,prompt_version INTEGER NOT NULL,status TEXT NOT NULL,payload TEXT NOT NULL,usage TEXT NOT NULL,created_at TEXT NOT NULL);`);
  db.prepare('INSERT INTO families VALUES(?,?,?)').run(family.id,'legacy family',JSON.stringify(family));db.prepare('INSERT INTO content VALUES(?,?,?)').run(content.id,family.id,JSON.stringify(content));db.prepare('INSERT INTO content VALUES(?,?,?)').run(passing.id,family.id,JSON.stringify(passing));db.prepare('INSERT INTO jobs(id,content_id,revision,type,status,input,result,error,attempts,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('job-1',content.id,1,'hermes_script:connector-1:1','completed',JSON.stringify({}),null,null,1,at,at);db.prepare('INSERT INTO script_candidates VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('candidate-1','job-1',content.id,family.id,1,1,'connector-1',1,'en','en-US',1,'available',JSON.stringify(payload),JSON.stringify({promptTokens:100,completionTokens:100,totalTokens:200}),at);db.close();
  const store=new Store(file);
  assert.equal(store.family(family.id).tokenBudget.monthlyLimit,0);assert.equal(store.content(content.id).state,'draft');assert.equal(store.content(passing.id).state,'approved');const legacyStoryboard=store.queueStoryboard(passing.id,{revision:1});store.processNextJob();assert.equal(store.state().jobs.find(item=>item.id===legacyStoryboard.id).status,'completed');assert.equal(store.state().jobs.find(item=>item.id==='job-1').status,'quality_failed');assert.equal(store.state().usage.find(item=>item.jobId==='job-1').totalTokens,200);assert.equal(store.scriptCandidate('candidate-1').status,'quality_failed');assert.equal(store.db.prepare('PRAGMA user_version').get().user_version,5);store.close();
});

test('restart recovery marks both script job and reservation as unknown',t=>{
  const file=tempDb(t);let store=new Store(file),family=store.saveFamily(familyInput()),content=store.saveContent(contentInput(family.id)),connector={id:'connector-1',revision:1};store.db.prepare('INSERT INTO connectors(id,name_key,payload,secret) VALUES(?,?,?,?)').run(connector.id,'restart connector',JSON.stringify({id:connector.id,provider:'hermes',revision:1,test:{status:'passed'}}),Buffer.from('secret'));const job=store.queueHermesScript(content.id,{revision:content.revision,connectorId:connector.id,connectorRevision:connector.revision});store.claimHermesScriptJob();store.close();store=new Store(file);assert.equal(store.state().jobs.find(item=>item.id===job.id).status,'interrupted');assert.equal(store.state().usage.find(item=>item.jobId===job.id).status,'unknown');store.close();
});
