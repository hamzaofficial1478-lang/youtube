'use strict';
const {HermesClient,HermesError,HERMES_ORIGIN,boundedJson,researchMessages,messageTokenUpperBound}=require('./hermes');

function strict(value,keys,label){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key))||keys.some(key=>!Object.hasOwn(value,key)))throw new HermesError(`Hermes returned an unexpected ${label} shape.`);
  return value;
}
function text(value,label,min=2,max=3000){
  if(typeof value!=='string'||value.trim().length<min||value.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value))throw new HermesError(`Hermes returned an invalid ${label}.`);
  return value.trim();
}
function sourceList(value,sourceIds,label){
  if(!Array.isArray(value)||value.length<1||value.length>10)throw new HermesError(`Hermes returned invalid sources for ${label}.`);
  const ids=[...new Set(value)];if(ids.some(id=>typeof id!=='string'||!sourceIds.has(id)))throw new HermesError('Hermes cited a source that was not supplied.');return ids;
}
function strings(value,label,min,max,itemMax=1000){
  if(!Array.isArray(value)||value.length<min||value.length>max)throw new HermesError(`Hermes returned an invalid ${label}.`);
  return value.map(item=>text(item,label.slice(0,-1)||label,2,itemMax));
}
function exactDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const [year,month,day]=value.split('-').map(Number),date=new Date(Date.UTC(year,month-1,day));return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day;}
function validateResearchResult(value,sourceIds,{briefDate=null,sourceExpiries=new Map()}={}){
  strict(value,['decision','rationale','topics'],'research result');
  if(!['topics','no_strong_topic'].includes(value.decision))throw new HermesError('Hermes returned an invalid research decision.');
  const rationale=text(value.rationale,'research rationale',20,3000);
  if(!Array.isArray(value.topics)||value.topics.length>3)throw new HermesError('Hermes returned invalid research topics.');
  if(value.decision==='no_strong_topic'&&value.topics.length)throw new HermesError('A no-strong-topic decision must contain zero topics.');
  if(value.decision==='topics'&&!value.topics.length)throw new HermesError('A topics decision must contain at least one topic.');
  const topics=value.topics.map(topic=>{
    strict(topic,['title','audienceNeed','whyNow','angle','hooks','outline','evidenceClaims','confidence','uncertainties','expiresAt'],'topic');
    strict(topic.whyNow,['text','sourceIds'],'why-now');
    strict(topic.confidence,['level','rationale','missingEvidence'],'confidence');
    if(!['low','medium','high'].includes(topic.confidence.level))throw new HermesError('Hermes returned an invalid confidence level.');
    if(!Array.isArray(topic.evidenceClaims)||topic.evidenceClaims.length<1||topic.evidenceClaims.length>20)throw new HermesError('Hermes returned invalid evidence claims.');
    const claims=topic.evidenceClaims.map(claim=>{strict(claim,['text','sourceIds'],'evidence claim');return {text:text(claim.text,'evidence claim',2,2000),sourceIds:sourceList(claim.sourceIds,sourceIds,'evidence claim')};});
    const expiresAt=text(topic.expiresAt,'topic expiry',10,10);if(!exactDate(expiresAt))throw new HermesError('Hermes returned an invalid topic expiry.');
    const whyNow={text:text(topic.whyNow.text,'why-now',10,2000),sourceIds:sourceList(topic.whyNow.sourceIds,sourceIds,'why-now')};
    const confidence={level:topic.confidence.level,rationale:text(topic.confidence.rationale,'confidence rationale',10,2000),missingEvidence:strings(topic.confidence.missingEvidence,'missing evidence',0,10,1000)};
    const cited=new Set([...whyNow.sourceIds,...claims.flatMap(claim=>claim.sourceIds)]);if(confidence.level==='high'&&cited.size<2)throw new HermesError('High confidence requires at least two supplied sources.');
    const citedExpiries=[...cited].map(id=>sourceExpiries.get(id)).filter(Boolean);if(briefDate&&(!exactDate(briefDate)||expiresAt<briefDate))throw new HermesError('Hermes returned a topic expiry before the brief date.');if(citedExpiries.length&&expiresAt>citedExpiries.sort()[0])throw new HermesError('Hermes returned a topic expiry beyond its supporting evidence.');
    return {title:text(topic.title,'topic title',5,120),audienceNeed:text(topic.audienceNeed,'audience need',10,2000),whyNow,angle:text(topic.angle,'topic angle',20,3000),hooks:strings(topic.hooks,'hooks',3,3,500),outline:strings(topic.outline,'outline items',3,8,1000),evidenceClaims:claims,confidence,uncertainties:strings(topic.uncertainties,'uncertainties',0,10,1000),expiresAt};
  });
  return {decision:value.decision,rationale,topics};
}

class ResearchClient{
  constructor(key,fetchImpl=fetch){this.base=new HermesClient(key,fetchImpl);this.fetch=fetchImpl;this.key=this.base.key;}
  capabilities(){return this.base.capabilities();}
  async generateDailyBrief(input){
    if(!input||typeof input!=='object'||!input.family||!Array.isArray(input.sources)||input.sources.length<1||input.sources.length>20)throw new HermesError('The research brief input is invalid.',400);
    const sourceIds=new Set(input.sources.map(source=>source.id));if(sourceIds.size!==input.sources.length||[...sourceIds].some(id=>!/^S(?:[1-9]|1[0-9]|20)$/.test(id)))throw new HermesError('The research source identifiers are invalid.',400);
    const evidence=JSON.stringify(input);if(Buffer.byteLength(evidence)>65536)throw new HermesError('The research evidence pack is too large.',413);
    const messages=researchMessages(input),maxCompletionTokens=input.policy?.maxCompletionTokens,totalTokenLimit=input.policy?.totalTokenLimit;
    if(!Number.isSafeInteger(maxCompletionTokens)||maxCompletionTokens<500||!Number.isSafeInteger(totalTokenLimit)||messageTokenUpperBound(messages)+maxCompletionTokens>totalTokenLimit)throw new HermesError('The research prompt and completion cannot fit within the total job token limit.',400);
    let response;try{response=await this.fetch(`${HERMES_ORIGIN}/v1/chat/completions`,{method:'POST',headers:{Authorization:`Bearer ${this.key}`,'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(120000),body:JSON.stringify({model:'hermes-agent',stream:false,max_tokens:maxCompletionTokens,messages})});}catch{throw new HermesError('Hermes research generation failed or timed out. No brief or draft was changed.');}
    if(!response.ok){await response.body?.cancel();throw new HermesError(`Hermes research generation returned HTTP ${response.status}. No brief or draft was changed.`);}
    const data=await boundedJson(response);const raw=data?.choices?.[0]?.message?.content;if(typeof raw!=='string')throw new HermesError('Hermes returned an unexpected research completion response.');
    let parsed;try{parsed=JSON.parse(raw);}catch{throw new HermesError('Hermes did not return the required JSON research result.');}
    const sourceExpiries=new Map(input.sources.map(source=>[source.id,source.expiresAt]));return {result:validateResearchResult(parsed,sourceIds,{briefDate:input.briefDate,sourceExpiries}),usage:{promptTokens:data.usage?.prompt_tokens??null,completionTokens:data.usage?.completion_tokens??null,totalTokens:data.usage?.total_tokens??null}};
  }
}

class ResearchReasoning{
  constructor(store,connectors){this.store=store;this.connectors=connectors;this.busy=false;}
  checked(input,verb){const row=this.connectors.row(input.connectorId),connector=JSON.parse(row.payload);if(connector.provider!=='hermes')throw new HermesError('Choose a Hermes reasoning connector.',400);if(connector.revision!==input.connectorRevision)throw new HermesError(`The Hermes connector changed. Reload before ${verb}.`,409);if(!row.secret||connector.test?.status!=='passed')throw new HermesError(`Test the Hermes connector successfully before ${verb}.`,409);}
  queue(familyId,input){this.checked(input,'preparing research');return this.store.queueResearchBrief(familyId,input);}
  retry(jobId,input){this.checked(input,'retrying research');return this.store.retryResearchBrief(jobId,input);}
  async processNext(){if(this.busy)return null;const job=this.store.claimResearchBrief();if(!job)return null;this.busy=true;let providerStarted=false;try{const trackedFetch=async(url,options)=>{if(String(url)===`${HERMES_ORIGIN}/v1/chat/completions`)providerStarted=true;return this.connectors.fetch(url,options);};const client=new ResearchClient(this.connectors.key(job.scope.connectorId),trackedFetch);await client.capabilities();const result=await client.generateDailyBrief(job.scope.promptInput);return this.store.completeResearchBrief(job.id,result);}catch(error){this.store.failResearchBrief(job.id,error instanceof HermesError?error.message:undefined,{usageUnknown:providerStarted});return null;}finally{this.busy=false;}}
}
module.exports={ResearchClient,ResearchReasoning,validateResearchResult};
