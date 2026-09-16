'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {assessScriptQuality,scriptPolicy,wordCount}=require('../hermes');
const {Store,reviewIssues}=require('../store');
const {ConnectorSlots}=require('../connectors');
const {HermesReasoning}=require('../hermes');

const protector={transform:(operation,input)=>Buffer.from([...input].reverse())};
const key='fixture-hermes-'+'x'.repeat(32);
const words=(count,prefix='word')=>Array.from({length:count},(_,i)=>`${prefix}${i+1}`).join(' ');
function structuredScript(hook,count){
  const remaining=count-hook.split(/\s+/).length;
  const chunks=[Math.floor(remaining/4),Math.floor(remaining/4),Math.floor(remaining/4)];
  chunks.push(remaining-chunks.reduce((a,b)=>a+b,0));
  return [hook+' '+words(chunks[0],'opening'),words(chunks[1],'development'),words(chunks[2],'example'),words(chunks[3],'payoff')].join('\n\n');
}
const familyInput=(extra={})=>({name:'Quality family',tier:'A',countries:['United States'],audience:'Adults who want sourced and useful explanations.',niche:'Evidence-led explainers',spanishLocale:'es-419',englishLocale:'en-US',timezone:'Asia/Karachi',monthlyBudget:100,cadence:2,format:'long-form',monthlyTokenLimit:100000,scriptTokenLimit:6000,researchTokenLimit:4000,...extra});
const contentInput=(familyId,extra={})=>({familyId,title:'A quality-gated factual script',kind:'factual',angle:'Explain one mechanism with a useful original example.',hook:'This familiar system hides a surprising cost today.',script:structuredScript('This familiar system hides a surprising cost today.',650),sources:[{title:'Evidence',url:'https://example.com/evidence',permission:'permitted',notes:'Permitted factual evidence used only for this isolated test.'}],rightsConfirmed:true,...extra});
const candidate=(count=650)=>({title:'A quality-gated factual script',angle:'Explain one mechanism with a useful original example.',hook:'This familiar system hides a surprising cost today.',script:structuredScript('This familiar system hides a surprising cost today.',count),claims:[{text:'The supplied evidence supports the example.',sourceIds:['S1']}],uncertainties:['The evidence does not prove a universal outcome.']});

test('format-specific script quality rejects short and incomplete candidates at exact boundaries',()=>{
  assert.deepEqual(scriptPolicy('long-form'),{minWords:600,targetMinWords:800,targetMaxWords:1000,maxWords:1200,minParagraphs:4,maxCompletionTokens:4000});
  assert.equal(assessScriptQuality(candidate(599),'long-form').passed,false);
  assert.equal(assessScriptQuality(candidate(600),'long-form').passed,true);
  assert.equal(assessScriptQuality(candidate(1201),'long-form').passed,false);
  assert.equal(assessScriptQuality({...candidate(650),script:words(650)},'long-form').issues.some(x=>/paragraph/i.test(x)),true);
  assert.equal(assessScriptQuality(candidate(80),'shorts').passed,true);
  assert.equal(assessScriptQuality(candidate(181),'shorts').passed,false);
});

test('script counting segments languages that do not use spaces',()=>{assert.ok(wordCount('这是一个测试。我们正在验证中文分词。','zh-CN')>2);assert.ok(wordCount('これはテストです。日本語の単語を数えます。','ja-JP')>2);});

test('saved drafts cannot enter review below their family format quality gate',t=>{
  const store=new Store(':memory:');t.after(()=>store.close());
  const family=store.saveFamily(familyInput());
  const short=store.saveContent(contentInput(family.id,{script:'This familiar system hides a surprising cost today. '+words(100)}));
  assert.equal(reviewIssues(short,'long-form').some(x=>/600/gi.test(x)),true);
  assert.throws(()=>store.reviewContent(short.id,{revision:short.revision,action:'submit'}),/600/);
});

test('monthly token admission blocks before any Hermes generation call',async t=>{
  const store=new Store(':memory:');t.after(()=>store.close());
  const family=store.saveFamily(familyInput({monthlyTokenLimit:5000,scriptTokenLimit:6000}));
  const content=store.saveContent(contentInput(family.id));
  let completions=0;
  const slots=new ConnectorSlots(store,protector,async url=>{
    if(String(url).endsWith('/v1/capabilities'))return Response.json({auth:{type:'bearer',required:true},features:{chat_completions:true}});
    if(String(url).endsWith('/v1/toolsets'))return Response.json([]);
    completions++;return Response.json({});
  });
  const connector=slots.save({name:'Budgeted Hermes',provider:'hermes',notes:'Isolated budget test',key});await slots.test(connector.id,connector.revision);
  const reasoning=new HermesReasoning(store,slots);
  const job=reasoning.queue(content.id,{revision:content.revision,connectorId:connector.id,connectorRevision:connector.revision});
  await reasoning.processNext();
  const saved=store.state().jobs.find(item=>item.id===job.id);
  assert.equal(saved.status,'blocked_budget');
  assert.equal(completions,0);
  assert.equal(store.usageSummary(family.id).reservedTokens,0);
});

test('passing output settles usage and stores immutable quality evidence',async t=>{
  const store=new Store(':memory:');t.after(()=>store.close());
  const family=store.saveFamily(familyInput());
  const content=store.saveContent(contentInput(family.id));
  const generated=candidate(650);
  const slots=new ConnectorSlots(store,protector,async url=>{
    if(String(url).endsWith('/v1/capabilities'))return Response.json({auth:{type:'bearer',required:true},features:{chat_completions:true}});
    if(String(url).endsWith('/v1/toolsets'))return Response.json([]);
    return Response.json({choices:[{message:{content:JSON.stringify(generated)}}],usage:{prompt_tokens:500,completion_tokens:900,total_tokens:1400}});
  });
  const connector=slots.save({name:'Settled Hermes',provider:'hermes',notes:'Isolated usage test',key});await slots.test(connector.id,connector.revision);
  const reasoning=new HermesReasoning(store,slots);
  reasoning.queue(content.id,{revision:content.revision,connectorId:connector.id,connectorRevision:connector.revision});
  await reasoning.processNext();
  const state=store.state(),saved=state.scriptCandidates[0];
  assert.equal(saved.status,'available');
  assert.equal(saved.quality.passed,true);
  assert.equal(saved.quality.wordCount,650);
  assert.equal(saved.usage.totalTokens,1400);
  assert.equal(state.usage[0].status,'settled');
  assert.equal(store.usageSummary(family.id).settledTokens,1400);
  assert.equal(store.content(content.id).script,content.script);
});

test('short but schema-valid paid output is retained and cannot become usable',async t=>{
  const store=new Store(':memory:');t.after(()=>store.close());
  const family=store.saveFamily(familyInput());
  const content=store.saveContent(contentInput(family.id));
  const generated=candidate(267);
  const slots=new ConnectorSlots(store,protector,async url=>{
    if(String(url).endsWith('/v1/capabilities'))return Response.json({auth:{type:'bearer',required:true},features:{chat_completions:true}});
    if(String(url).endsWith('/v1/toolsets'))return Response.json([]);
    return Response.json({choices:[{message:{content:JSON.stringify(generated)}}],usage:{prompt_tokens:400,completion_tokens:500,total_tokens:900}});
  });
  const connector=slots.save({name:'Quality Hermes',provider:'hermes',notes:'Isolated quality test',key});await slots.test(connector.id,connector.revision);
  const reasoning=new HermesReasoning(store,slots);
  reasoning.queue(content.id,{revision:content.revision,connectorId:connector.id,connectorRevision:connector.revision});
  await reasoning.processNext();
  const state=store.state();
  assert.equal(state.scriptCandidates[0].status,'quality_failed');
  assert.equal(state.scriptCandidates[0].quality.passed,false);
  assert.equal(state.jobs[0].status,'quality_failed');
  assert.equal(store.content(content.id).script,content.script);
});
