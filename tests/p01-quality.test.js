'use strict';
const test=require('node:test');
const {Ai}=require('../ai');
const {claudeMessage,claudeStream,isClaudeModel,claudeModel,claudeFetch,promptOf}=require('./fake-claude');
const assert=require('node:assert/strict');
const {assessScriptQuality,scriptPolicy,wordCount}=require('../writer');
const {Store,reviewIssues}=require('../store');
const {ConnectorSlots}=require('../connectors');
const {ScriptWriter}=require('../writer');

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
  assert.deepEqual(scriptPolicy('long-form'),{minWords:600,targetMinWords:800,targetMaxWords:1000,maxWords:1200,minParagraphs:4,maxCompletionTokens:16000});
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
    if(isClaudeModel(url))return claudeModel(url);
    completions++;return Response.json({});
  });
  const connector=slots.save({name:'Budgeted Hermes',provider:'claude',notes:'Isolated budget test',key});await slots.test(connector.id,connector.revision);
  const reasoning=new ScriptWriter(store,new Ai(slots));
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
    if(isClaudeModel(url))return claudeModel(url);
    return claudeMessage(generated,{input_tokens:500,output_tokens:900});
  });
  const connector=slots.save({name:'Settled Hermes',provider:'claude',notes:'Isolated usage test',key});await slots.test(connector.id,connector.revision);
  const reasoning=new ScriptWriter(store,new Ai(slots));
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

test('the owner chooses any long-form length: words, paragraphs, answer room and job limit scale with it',async t=>{
  assert.deepEqual(scriptPolicy('long-form',30),{minWords:3375,targetMinWords:4050,targetMaxWords:4950,maxWords:5625,minParagraphs:30,maxCompletionTokens:17000,minutes:30});
  assert.equal(scriptPolicy('long-form',90).maxCompletionTokens,35000,'a 90-minute script gets room for about 13,500 words');
  assert.deepEqual(scriptPolicy('long-form',null),scriptPolicy('long-form'),'no chosen length keeps the standard policy');
  assert.deepEqual(scriptPolicy('shorts',30),scriptPolicy('shorts'),'Shorts keep their own policy');
  assert.throws(()=>scriptPolicy('long-form',0),/1-180 minutes/);
  assert.throws(()=>scriptPolicy('long-form',181),/1-180 minutes/);
  const long=(count,paragraphs)=>{const hook='This familiar system hides a surprising cost today.',per=Math.floor((count-8)/paragraphs);return {hook,script:[hook+' '+words(per,'p0'),...Array.from({length:paragraphs-2},(_,i)=>words(per,`p${i+1}x`)),words(count-8-per*(paragraphs-1),'end')].join('\n\n')};};
  assert.equal(assessScriptQuality(long(4500,30),'long-form','en',null,30).passed,true,'a 30-minute script of 4,500 words passes');
  assert.match(assessScriptQuality(long(1000,30),'long-form','en',null,30).issues.join(' '),/A 30-minute script must contain 3375-5625 words; received 1000/);
  assert.equal(assessScriptQuality(long(4500,30),'long-form').passed,false,'the same words are too long for the standard length');
  // Store: the length travels with the draft, into the prompt and the reservation; the answer is streamed.
  const store=new Store(':memory:');t.after(()=>store.close());
  const family=store.saveFamily(familyInput({scriptTokenLimit:24000}));
  assert.throws(()=>store.saveContent(contentInput(family.id,{targetMinutes:0})),/Target length in minutes must be a whole number from 1 to 180/);
  const content=store.saveContent(contentInput(family.id,{targetMinutes:30}));
  assert.equal(content.targetMinutes,30);
  assert.equal(reviewIssues(content,'long-form').some(issue=>/30-minute script must contain/.test(issue)),true,'the review gate uses the chosen length');
  const generated={...candidate(),...long(4500,30)},calls=[];
  const slots=new ConnectorSlots(store,protector,async(url,init)=>{
    if(isClaudeModel(url))return claudeModel(url);
    const body=JSON.parse(init.body);calls.push(body);return claudeStream(generated,{input_tokens:3000,output_tokens:9000});
  });
  const connector=slots.save({name:'Long script',provider:'claude',notes:'Length test',key});await slots.test(connector.id,connector.revision);
  const writer=new ScriptWriter(store,new Ai(slots));
  const job=writer.queue(content.id,{revision:content.revision,connectorId:connector.id,connectorRevision:connector.revision}),scope=JSON.parse(job.input);
  assert.equal(scope.promptInput.content.targetMinutes,30);
  assert.equal(scope.tokenLimit,17000+12000,'the job limit grows past the family default for a long video');
  await writer.processNext();
  assert.deepEqual([calls[0].max_tokens,calls[0].stream],[17000,true]);
  assert.match(promptOf(calls[0])+calls[0].system,/runs about 30 minutes when read aloud, so it must contain 3375-5625 words/);
  const saved=store.state().scriptCandidates[0];
  assert.deepEqual([saved.status,saved.quality.passed,saved.quality.wordCount],['available',true,4500],JSON.stringify(saved.quality.issues));
});

test('short but schema-valid paid output is retained and cannot become usable',async t=>{
  const store=new Store(':memory:');t.after(()=>store.close());
  const family=store.saveFamily(familyInput());
  const content=store.saveContent(contentInput(family.id));
  const generated=candidate(267);
  const slots=new ConnectorSlots(store,protector,async url=>{
    if(isClaudeModel(url))return claudeModel(url);
    return claudeMessage(generated,{input_tokens:400,output_tokens:500});
  });
  const connector=slots.save({name:'Quality Hermes',provider:'claude',notes:'Isolated quality test',key});await slots.test(connector.id,connector.revision);
  const reasoning=new ScriptWriter(store,new Ai(slots));
  reasoning.queue(content.id,{revision:content.revision,connectorId:connector.id,connectorRevision:connector.revision});
  await reasoning.processNext();
  const state=store.state();
  assert.equal(state.scriptCandidates[0].status,'quality_failed');
  assert.equal(state.scriptCandidates[0].quality.passed,false);
  assert.equal(state.jobs[0].status,'quality_failed');
  assert.equal(store.content(content.id).script,content.script);
});
