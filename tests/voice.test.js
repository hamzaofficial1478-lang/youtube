'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const {Store}=require('../store');
const {VoiceRuntime,analyzeAudio,OpenAISpeechClient,ElevenLabsSpeechClient}=require('../voice');

const hook='This familiar workflow hides a surprising cost today.';
const words=(count,prefix='word')=>Array.from({length:count},(_,index)=>`${prefix}${index+1}`).join(' ');
const script=[`${hook} ${words(150,'opening')}`,words(160,'development'),words(160,'example'),words(168,'payoff')].join('\n\n');
const familyInput=(extra={})=>({name:'Voice family',tier:'A',countries:['United States'],audience:'Adults who need clear practical explanations.',niche:'Evidence-led explainers',locales:['en-US'],timezone:'Asia/Karachi',monthlyBudget:100,cadence:2,format:'long-form',monthlyTokenLimit:100000,scriptTokenLimit:6000,researchTokenLimit:4000,...extra});
const contentInput=familyId=>({familyId,title:'A voice-room source script',kind:'fiction',angle:'Explain one workflow through an original practical example.',hook,script,sources:[],rightsConfirmed:true});
const profileInput=(connector,extra={})=>({revision:0,familyRevision:1,name:'Primary narrator',connectorId:connector.id,connectorRevision:connector.revision,provider:connector.provider,model:connector.provider==='openai'?'gpt-4o-mini-tts':'eleven_multilingual_v2',voiceId:connector.provider==='openai'?'alloy':'voice_fixture_123',voiceVersion:'provider-current',ownershipBasis:'provider_stock_voice',rightsHolder:'Provider voice catalog',consentConfirmed:true,commercialUseConfirmed:true,evidenceReference:'Provider account terms reviewed by the operator.',termsReviewedAt:'2026-09-19',pace:1,energy:55,emotion:'warm',pauseScale:1,emphasis:50,instructions:'Warm, precise documentary delivery.',lexicon:[{term:'SQL',replacement:'sequel',notes:'Channel-standard pronunciation.'}],monthlyCharacterLimit:100000,maxCharactersPerAudition:12000,priceCentsPerMillionCharacters:1500,...extra});
function setup(t,provider='openai'){
  const artifactRoot=fs.mkdtempSync(path.join(os.tmpdir(),'voice-store-test-'));
  const store=new Store(':memory:',{artifactRoot});t.after(()=>{store.close();fs.rmSync(artifactRoot,{recursive:true,force:true});});
  const family=store.saveFamily(familyInput());
  let content=store.saveContent(contentInput(family.id));
  store.reviewContent(content.id,{revision:content.revision,action:'submit'});
  content=store.reviewContent(content.id,{revision:content.revision,action:'approve'});
  const connector={id:`${provider}-connector`,revision:1,provider};
  store.db.prepare('INSERT INTO connectors(id,name_key,payload,secret) VALUES(?,?,?,?)').run(connector.id,connector.id,JSON.stringify({name:connector.id,provider,revision:1,test:{status:'passed',at:new Date().toISOString()}}),Buffer.from('protected'));
  return {store,family,content,connector,artifactRoot};
}
function completedAudition(store,content,profile,connector){
  const job=store.queueVoiceAudition(content.id,{contentRevision:content.revision,profileId:profile.id,profileRevision:profile.revision,connectorId:connector.id,connectorRevision:connector.revision});
  const claimed=store.claimVoiceAudition();assert.equal(claimed.id,job.id);assert.equal(store.voiceUsage().find(item=>item.jobId===job.id).period,store.tokenPeriod(store.family(content.familyId)));
  const relativePath=`voice-artifacts/${job.id}.wav`,filename=path.join(store.artifactRoot,relativePath),bytes=Buffer.alloc(64000,1);fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,bytes);
  return store.completeVoiceAudition(job.id,{artifact:{relativePath,sha256:createHash('sha256').update(bytes).digest('hex'),sizeBytes:bytes.length,mime:'audio/wav'},analysis:{passed:true,durationSeconds:270,silenceRatio:0.08,maxVolumeDb:-1.2,integratedLoudnessLufs:-17.5,sampleRate:44100,channels:1,codec:'pcm_s16le',checks:[]},provider:{requestIds:['request-1'],model:profile.model,voiceId:profile.voiceId,voiceVersion:profile.voiceVersion},settledCharacters:claimed.scope.characterCount});
}

test('voice profiles are immutable revisions with explicit commercial-use and consent evidence',t=>{
  const {store,family,connector}=setup(t);
  assert.throws(()=>store.saveVoiceProfile(family.id,profileInput(connector,{consentConfirmed:false})),/consent/i);
  assert.throws(()=>store.saveVoiceProfile(family.id,profileInput(connector,{commercialUseConfirmed:false})),/commercial/i);
  const first=store.saveVoiceProfile(family.id,profileInput(connector));
  const second=store.saveVoiceProfile(family.id,profileInput(connector,{revision:first.revision,energy:70}));
  assert.equal(first.revision,1);assert.equal(second.revision,2);assert.notEqual(first.id,second.id);
  assert.equal(store.voiceProfiles(family.id)[0].delivery.energy,55);
  assert.equal(store.voiceProfiles(family.id)[1].delivery.energy,70);
  assert.deepEqual(first.lexicon.entries,[{term:'SQL',replacement:'sequel',notes:'Channel-standard pronunciation.'}]);
  assert.notEqual(first.lexicon.versionId,second.lexicon.versionId);
});

test('voice admission requires approved current content, current provider provenance and character budget',t=>{
  const {store,family,content,connector}=setup(t);
  const profile=store.saveVoiceProfile(family.id,profileInput(connector,{monthlyCharacterLimit:content.script.length-1}));
  const blocked=store.queueVoiceAudition(content.id,{contentRevision:content.revision,profileId:profile.id,profileRevision:profile.revision,connectorId:connector.id,connectorRevision:connector.revision});
  assert.equal(store.claimVoiceAudition(),null);
  assert.equal(store.voiceJobs().find(item=>item.id===blocked.id).status,'blocked_budget');
  const draft=store.saveContent({...content,title:'Changed before narration'},content.id);
  assert.throws(()=>store.queueVoiceAudition(draft.id,{contentRevision:draft.revision,profileId:profile.id,profileRevision:profile.revision,connectorId:connector.id,connectorRevision:connector.revision}),/approved/i);
});

test('validated auditions still require human comparison and intelligibility approval before handoff',t=>{
  const {store,family,content,connector}=setup(t);
  const profile=store.saveVoiceProfile(family.id,profileInput(connector));
  const audition=completedAudition(store,content,profile,connector);
  assert.throws(()=>store.selectVoiceAudition(audition.id,{approvedBy:'Hamza',comparisonNotes:'Best pacing.',intelligibilityConfirmed:false}),/intelligibility/i);
  const approval=store.selectVoiceAudition(audition.id,{approvedBy:'Hamza',comparisonNotes:'Compared against the other takes; pronunciation, pacing and emotional delivery are clear.',intelligibilityConfirmed:true});
  assert.equal(approval.status,'approved');assert.equal(approval.contentRevision,content.revision);
  assert.equal(store.voiceHandoffs(family.id)[0].ready,true);
  fs.writeFileSync(path.join(store.artifactRoot,audition.artifact.relativePath),Buffer.alloc(64000,2));
  assert.equal(store.voiceHandoffs(family.id)[0].ready,false);
  assert.match(store.voiceHandoffs(family.id)[0].blocker,/checksum|integrity/i);
  assert.deepEqual(store.productionInvalidations().map(item=>item.stage),['scene_timing','captions','audio_mix','qc','packaging','render']);
  const revoked=store.revokeVoiceApproval(approval.id,{reason:'Narration no longer matches the intended performance.',approvedBy:'Hamza'});
  assert.equal(revoked.status,'revoked');assert.equal(store.voiceHandoffs(family.id)[0].ready,false);
});

test('profile or script changes revoke current narration without deleting immutable audition evidence',t=>{
  const {store,family,content,connector}=setup(t);
  const profile=store.saveVoiceProfile(family.id,profileInput(connector));
  const audition=completedAudition(store,content,profile,connector);
  const approval=store.selectVoiceAudition(audition.id,{approvedBy:'Hamza',comparisonNotes:'Selected after direct A/B review of the complete narration.',intelligibilityConfirmed:true});
  store.saveVoiceProfile(family.id,profileInput(connector,{revision:profile.revision,emotion:'serious'}));
  assert.equal(store.voiceApprovals().find(item=>item.id===approval.id).status,'revoked');
  assert.equal(store.voiceAuditions()[0].id,audition.id);
  assert.equal(store.voiceAuditions()[0].scopeCurrent,false);
});

test('unknown provider outcomes require deliberate bounded retries',t=>{
  const {store,family,content,connector}=setup(t);
  const profile=store.saveVoiceProfile(family.id,profileInput(connector));
  const first=store.queueVoiceAudition(content.id,{contentRevision:content.revision,profileId:profile.id,profileRevision:profile.revision,connectorId:connector.id,connectorRevision:connector.revision});
  store.claimVoiceAudition();store.failVoiceAudition(first.id,'Connection ended after generation started.',{usageUnknown:true});
  assert.throws(()=>store.queueVoiceAudition(content.id,{contentRevision:content.revision,profileId:profile.id,profileRevision:profile.revision,connectorId:connector.id,connectorRevision:connector.revision}),/deliberate retry/i);
  assert.throws(()=>store.retryVoiceAudition(first.id,{contentRevision:content.revision,profileId:profile.id,profileRevision:profile.revision,connectorId:connector.id,connectorRevision:connector.revision}),/confirm/i);
  let current=store.retryVoiceAudition(first.id,{contentRevision:content.revision,profileId:profile.id,profileRevision:profile.revision,connectorId:connector.id,connectorRevision:connector.revision,confirmInterrupted:true});
  assert.equal(current.attempts,2);store.claimVoiceAudition();store.failVoiceAudition(current.id,'Unknown second provider outcome.',{usageUnknown:true});
  current=store.retryVoiceAudition(current.id,{contentRevision:content.revision,profileId:profile.id,profileRevision:profile.revision,connectorId:connector.id,connectorRevision:connector.revision,confirmInterrupted:true});
  assert.equal(current.attempts,3);store.claimVoiceAudition();store.failVoiceAudition(current.id,'Unknown third provider outcome.',{usageUnknown:true});
  assert.throws(()=>store.retryVoiceAudition(current.id,{contentRevision:content.revision,profileId:profile.id,profileRevision:profile.revision,connectorId:connector.id,connectorRevision:connector.revision,confirmInterrupted:true}),/maximum of 3 paid attempts/i);
});

test('provider-specific settings fail before admission',t=>{
  const {store,family,connector}=setup(t,'elevenlabs');
  assert.throws(()=>store.saveVoiceProfile(family.id,profileInput(connector,{pace:1.5})),/between 0.7 and 1.2/i);
});

test('speech clients use fixed provider endpoints, bounded payloads and never return credentials',async()=>{
  const calls=[];
  const fetchImpl=async(url,options)=>{calls.push({url:String(url),options});if(String(url).includes('elevenlabs'))return new Response(JSON.stringify({audio_base64:Buffer.alloc(100,1).toString('base64'),alignment:{characters:[...'[calm] SQL is'],character_start_times_seconds:[0,0,0,0,0,0,0,0.1,0.2,0.3,0.4,0.5,0.6],character_end_times_seconds:[0,0,0,0,0,0,0,0.2,0.3,0.4,0.5,0.6,0.7]}}),{status:200,headers:{'content-type':'application/json','request-id':'req-fixture'}});return new Response(Buffer.alloc(100,1),{status:200,headers:{'content-type':'audio/wav','x-request-id':'req-fixture'}});};
  const key='fixture-provider-'+'x'.repeat(32);
  const openai=await new OpenAISpeechClient(key,fetchImpl).synthesize({text:'SQL is useful.',model:'gpt-4o-mini-tts',voiceId:'alloy',speed:1,instructions:'Say SQL as sequel.'});
  assert.equal(calls[0].url,'https://api.openai.com/v1/audio/speech');assert.equal(JSON.parse(calls[0].options.body).response_format,'wav');assert.equal(openai.requestId,'req-fixture');
  const eleven=await new ElevenLabsSpeechClient(key,fetchImpl).synthesize({text:'SQL is useful.',model:'eleven_multilingual_v2',voiceId:'voice_fixture_123',speed:1,stability:.5,similarity:.75,style:.2});
  assert.match(calls[1].url,/^https:\/\/api\.elevenlabs\.io\/v1\/text-to-speech\/voice_fixture_123\/with-timestamps\?output_format=mp3_44100_128$/);assert.equal(eleven.audio.length,100);assert.deepEqual(eleven.words,[{text:'SQL',start:0.1,end:0.4},{text:'is',start:0.5,end:0.7}],'character times become words; delivery tags are not words');
  assert.equal(JSON.parse(calls[1].options.body).model_id,'eleven_multilingual_v2');assert.equal(JSON.stringify([openai,eleven]).includes(key),false);
});

test('runtime persists provider provenance, settles known usage and rejects an implausibly short take',async t=>{
  const {store,family,content,connector,artifactRoot}=setup(t);
  const profile=store.saveVoiceProfile(family.id,profileInput(connector));
  store.queueVoiceAudition(content.id,{contentRevision:content.revision,profileId:profile.id,profileRevision:profile.revision,connectorId:connector.id,connectorRevision:connector.revision});
  const root=artifactRoot;
  const sample=path.join(root,'provider.wav');execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=380:duration=2','-af','volume=0.5','-ar','44100','-ac','1','-y',sample]);
  const providerBytes=fs.readFileSync(sample),calls=[];
  const runtime=new VoiceRuntime(store,{key:id=>{assert.equal(id,connector.id);return 'runtime-fixture-key';},fetch:async(url,options)=>{calls.push({url:String(url),body:JSON.parse(options.body)});return new Response(providerBytes,{status:200,headers:{'content-type':'audio/wav','x-request-id':`runtime-${calls.length}`}});}},{artifactDir:path.join(root,'artifacts')});
  const audition=await runtime.processNext();assert.ok(audition,JSON.stringify(store.voiceJobs()));assert.equal(audition.status,'validation_failed');assert.equal(audition.analysis.decodable,true);assert.ok(calls.length>=1);assert.ok(calls.every(call=>call.url==='https://api.openai.com/v1/audio/speech'));
  assert.equal(store.voiceUsage()[0].status,'settled');assert.ok(fs.existsSync(path.join(root,audition.artifact.relativePath)));
  assert.equal(JSON.stringify(store.state()).includes('runtime-fixture-key'),false);
});

test('missing local audio tooling fails before any provider request and releases the reservation',async t=>{
  const {store,family,content,connector,artifactRoot}=setup(t),profile=store.saveVoiceProfile(family.id,profileInput(connector));
  store.queueVoiceAudition(content.id,{contentRevision:content.revision,profileId:profile.id,profileRevision:profile.revision,connectorId:connector.id,connectorRevision:connector.revision});
  let calls=0;const runtime=new VoiceRuntime(store,{key:()=> 'unused-key',fetch:async()=>{calls+=1;throw new Error('must not run');}},{artifactDir:path.join(artifactRoot,'artifacts'),ffmpeg:path.join(artifactRoot,'missing-ffmpeg'),ffprobe:path.join(artifactRoot,'missing-ffprobe')});
  assert.equal(await runtime.processNext(),null);assert.equal(calls,0);assert.equal(store.voiceJobs()[0].status,'failed');assert.equal(store.voiceUsage()[0].status,'released');
});

test('connector revocation between chunks stops all later provider requests',async t=>{
  const {store,family,content,connector,artifactRoot}=setup(t),profile=store.saveVoiceProfile(family.id,profileInput(connector));
  store.queueVoiceAudition(content.id,{contentRevision:content.revision,profileId:profile.id,profileRevision:profile.revision,connectorId:connector.id,connectorRevision:connector.revision});
  const sample=path.join(artifactRoot,'chunk.wav');execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=380:duration=1','-ar','44100','-ac','1','-y',sample]);const bytes=fs.readFileSync(sample);let calls=0;
  const runtime=new VoiceRuntime(store,{key:()=> 'scope-key',fetch:async()=>{calls+=1;const row=store.db.prepare('SELECT payload FROM connectors WHERE id=?').get(connector.id),payload=JSON.parse(row.payload);payload.test={status:'failed',at:new Date().toISOString(),message:'Revoked during generation.'};store.db.prepare('UPDATE connectors SET payload=? WHERE id=?').run(JSON.stringify(payload),connector.id);return new Response(bytes,{status:200,headers:{'content-type':'audio/wav'}});}},{artifactDir:path.join(artifactRoot,'artifacts')});
  assert.equal(await runtime.processNext(),null);assert.equal(calls,1);assert.equal(store.voiceJobs()[0].status,'interrupted');assert.equal(store.voiceUsage()[0].status,'unknown');
});

test('real audio validation decodes the file and measures duration, silence, clipping and loudness',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'voice-audio-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'speech-like.wav');
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=440:duration=2','-af','volume=0.8','-ar','44100','-ac','1','-y',file]);
  const report=await analyzeAudio(file,{expectedDuration:{min:1,max:3}});
  assert.equal(report.decodable,true);assert.ok(report.durationSeconds>=1.9);assert.equal(report.sampleRate,44100);assert.equal(report.channels,1);
  assert.equal(typeof report.silenceRatio,'number');assert.equal(typeof report.maxVolumeDb,'number');assert.equal(typeof report.integratedLoudnessLufs,'number');assert.equal(report.passed,true);
});

test('a narration longer than two minutes with a fractional length is validated (its time limit is a whole number)',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'voice-long-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'long.wav');
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=440:duration=121.3337','-ar','8000','-ac','1','-y',file]);
  const report=await analyzeAudio(file,{expectedDuration:{min:100,max:200}});
  assert.equal(report.decodable,true);assert.ok(report.durationSeconds>121);
});

test('truncated audio cannot pass decoder integrity validation',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'voice-corrupt-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'truncated.wav');
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=440:duration=2','-ar','44100','-ac','1','-y',file]);const bytes=fs.readFileSync(file);fs.writeFileSync(file,bytes.subarray(0,Math.floor(bytes.length/2)));
  let report=null,rejected=false;try{report=await analyzeAudio(file,{expectedDuration:{min:1,max:3}});}catch{rejected=true;}assert.ok(rejected||report?.passed===false);
});
