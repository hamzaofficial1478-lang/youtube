'use strict';
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {randomUUID,createHash}=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {InputError}=require('./store');
const Delivery=require('./delivery');
const live=require('./live');

const execFileAsync=promisify(execFile);
const MAX_AUDIO_BYTES=25*1024*1024;
const PROVIDER_LIMITS={openai:4000,elevenlabs:9000,'fish-audio':3000,voicestudio:1200};
function boundedText(value,label,max,min=1){if(typeof value!=='string'||value.trim().length<min||value.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value))throw new InputError(`Enter a valid ${label} (${min}–${max} characters).`);return value.trim();}
function safeId(value,label){return boundedText(value,label,128).replace(/[A-Za-z0-9_.:-]/g,'').length===0?value.trim():(()=>{throw new InputError(`Enter a valid ${label}.`);})();}
async function responseAudio(response){
  if(!response?.ok){await response?.body?.cancel();throw new InputError(`Voice provider returned HTTP ${response?.status||'unknown'}. Its billing outcome may be unknown.`,502);}
  const declared=Number(response.headers.get('content-length')||0);if(declared>MAX_AUDIO_BYTES){await response.body?.cancel();throw new InputError('Voice provider audio exceeded the 25 MB safety limit.',502);}
  const reader=response.body?.getReader();if(!reader)throw new InputError('Voice provider returned no audio body.',502);
  const chunks=[];let bytes=0;
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_AUDIO_BYTES){await reader.cancel();throw new InputError('Voice provider audio exceeded the 25 MB safety limit.',502);}chunks.push(Buffer.from(value));}
  if(bytes<44)throw new InputError('Voice provider returned an empty or incomplete audio file.',502);
  return Buffer.concat(chunks,bytes);
}
class OpenAISpeechClient{
  constructor(key,fetchImpl=fetch){this.key=key;this.fetch=fetchImpl;}
  async synthesize(input){
    const text=boundedText(input.text,'speech text',4096),model=safeId(input.model,'OpenAI speech model'),voiceId=safeId(input.voiceId,'OpenAI voice');
    const speed=Number(input.speed);if(!Number.isFinite(speed)||speed<.25||speed>4)throw new InputError('OpenAI speech speed must be between 0.25 and 4.');
    const body={model,input:text,voice:voiceId,response_format:'wav',speed};if(input.instructions)body.instructions=boundedText(input.instructions,'voice instructions',4096);
    let response;try{if(input.onRequest)input.onRequest();response=await this.fetch('https://api.openai.com/v1/audio/speech',{method:'POST',headers:{Authorization:`Bearer ${this.key}`,'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(300000)});}catch{throw new InputError('OpenAI speech request failed or timed out after it started. Its billing outcome may be unknown.',502);}
    const audio=await responseAudio(response);return {audio,extension:'wav',mime:response.headers.get('content-type')||'audio/wav',requestId:response.headers.get('x-request-id')||null};
  }
}
class ElevenLabsSpeechClient{
  constructor(key,fetchImpl=fetch){this.key=key;this.fetch=fetchImpl;}
  async synthesize(input){
    const text=boundedText(input.text,'speech text',10000),model=safeId(input.model,'ElevenLabs model'),voiceId=safeId(input.voiceId,'ElevenLabs voice');
    const number=(value,label,min,max)=>{value=Number(value);if(!Number.isFinite(value)||value<min||value>max)throw new InputError(`${label} must be between ${min} and ${max}.`);return value;};
    const body={text,model_id:model,voice_settings:{stability:number(input.stability??.5,'Stability',0,1),similarity_boost:number(input.similarity??.75,'Similarity',0,1),style:number(input.style??0,'Style',0,1),speed:number(input.speed??1,'Speed',.7,1.2),use_speaker_boost:true}};
    // The with-timestamps form returns the same audio plus each character's start and end time.
    let response;try{if(input.onRequest)input.onRequest();response=await this.fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`,{method:'POST',headers:{'xi-api-key':this.key,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(300000)});}catch{throw new InputError('ElevenLabs speech request failed or timed out after it started. Its billing outcome may be unknown.',502);}
    const raw=await responseAudio(response);let reply;try{reply=JSON.parse(raw.toString('utf8'));}catch{throw new InputError('ElevenLabs returned an unreadable timed answer. Its billing outcome may be unknown.',502);}
    if(typeof reply?.audio_base64!=='string'||!reply.audio_base64)throw new InputError('ElevenLabs returned no audio.',502);
    const audio=Buffer.from(reply.audio_base64,'base64');if(audio.length<44)throw new InputError('Voice provider returned an empty or incomplete audio file.',502);
    return {audio,extension:'mp3',mime:'audio/mpeg',requestId:response.headers.get('request-id')||response.headers.get('x-request-id')||null,words:spokenWords(reply.alignment||reply.normalized_alignment)};
  }
}
// Fish Audio (owner request 2026-10-22): POST /v1/tts with the voice model's ID as reference_id and the model in its
// own header (s1, s2-pro, s2.1-pro ...). Plain text in, MP3 out; no word timing, so captions use the estimate.
class FishAudioSpeechClient{
  constructor(key,fetchImpl=fetch){this.key=key;this.fetch=fetchImpl;}
  async synthesize(input){
    const text=boundedText(input.text,'speech text',10000),model=safeId(input.model,'Fish Audio model'),voiceId=safeId(input.voiceId,'Fish Audio voice');
    const speed=Number(input.speed??1);if(!Number.isFinite(speed)||speed<.5||speed>2)throw new InputError('Fish Audio speed must be between 0.5 and 2.');
    const body={text,reference_id:voiceId,format:'mp3',mp3_bitrate:128,normalize:true,latency:'normal',prosody:{speed,volume:0}};
    let response;try{if(input.onRequest)input.onRequest();response=await this.fetch('https://api.fish.audio/v1/tts',{method:'POST',headers:{Authorization:`Bearer ${this.key}`,'Content-Type':'application/json',model},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(300000)});}catch{throw new InputError('Fish Audio speech request failed or timed out after it started. Its billing outcome may be unknown.',502);}
    const audio=await responseAudio(response);return {audio,extension:'mp3',mime:'audio/mpeg',requestId:response.headers.get('x-request-id')||null};
  }
}
// VoiceStudio (owner request 2026-10-30): free voice models on this PC through VoiceStudio's OpenAI-style local API, to
// test the program before paid voices. Loopback only, no key. Its default model weights are non-commercial, so every
// VoiceStudio narration is a test voice that never reaches YouTube (publishing-room deliverable). No word timing.
const VOICESTUDIO='http://127.0.0.1:3900';
// VoiceStudio answers only when a whole part has been spoken, which takes many minutes on a laptop processor. Node's
// built-in fetch gives up when no answer has started within 5 minutes (its headers timeout), so the program said "did
// not answer" while VoiceStudio was still working (owner test 2026-10-31). Plain HTTP to this PC has no such limit:
// the caller's AbortSignal is the only clock. Loopback only.
function loopbackFetch(url,init={}){
  return new Promise((resolve,reject)=>{
    const target=new URL(url);
    if(target.protocol!=='http:'||target.hostname!=='127.0.0.1')return reject(new TypeError('VoiceStudio is reached on this PC only.'));
    if(init.signal?.aborted)return reject(init.signal.reason);
    const request=http.request(target,{method:init.method||'GET',headers:init.headers||{}},response=>{
      const chunks=[];let bytes=0;
      response.on('data',chunk=>{bytes+=chunk.length;if(bytes>MAX_AUDIO_BYTES+1048576)request.destroy(new InputError('VoiceStudio audio exceeded the 25 MB safety limit.',502));else chunks.push(chunk);});
      response.on('end',()=>{const status=response.statusCode,headers=Object.entries(response.headers).filter(([,value])=>value!==undefined).map(([name,value])=>[name,Array.isArray(value)?value.join(', '):String(value)]);resolve(new Response([204,304].includes(status)?null:Buffer.concat(chunks),{status,headers}));});
      response.on('error',reject);
    });
    const stop=()=>request.destroy(init.signal.reason);
    init.signal?.addEventListener('abort',stop,{once:true});
    request.on('error',error=>{init.signal?.removeEventListener('abort',stop);reject(error);});
    request.on('close',()=>init.signal?.removeEventListener('abort',stop));
    request.end(init.body===undefined?undefined:init.body);
  });
}
// The program's ordinary fetch is swapped for the loopback one; tests pass their own.
const studioFetch=fetchImpl=>(!fetchImpl||fetchImpl===globalThis.fetch?loopbackFetch:fetchImpl);
// Why VoiceStudio could not be reached, in plain words (the cause used to be hidden behind "did not answer").
function studioDown(error,{waited,part}={}){
  if(error instanceof InputError)return error;
  const code=error?.code||error?.cause?.code||'';
  if(error?.name==='TimeoutError')return new InputError(`VoiceStudio did not finish ${part||'speaking'} within ${waited}. On a PC without a strong graphics card its models read slowly: try an engine marked fast in VoiceStudio (KittenTTS, Supertonic-3 or PocketTTS) or a shorter script.`,504);
  if(code==='ECONNREFUSED')return new InputError('VoiceStudio is not running on this PC (nothing answered at 127.0.0.1:3900). Open VoiceStudio, wait until it is ready, then try again.',502);
  if(code==='ECONNRESET'||/socket hang up/i.test(error?.message||''))return new InputError('VoiceStudio closed the connection while it was working (it may have restarted or run out of memory). Look at VoiceStudio\'s window, then try again.',502);
  return new InputError(`VoiceStudio stopped answering (${code||error?.message||'no reason given'}). Open VoiceStudio, wait until it is ready, then try again.`,502);
}
async function voiceStudioError(response){
  let message='';try{const data=await response.json();message=String(data?.error?.message||data?.detail||'').replace(/[\x00-\x1f\x7f]/g,' ').slice(0,300);}catch{/* no readable body */}
  if(response.status===403)return `VoiceStudio may not use this model yet: open its Model Manager and accept the model's licence (VoiceStudio: Settings → Models, the Model Catalogue; find each model named here, read its licence and press Accept). ${message}`.trim();
  if(response.status===503)return `VoiceStudio is still loading or downloading the voice model. Wait until its Model Manager shows it installed, then try again. ${message}`.trim();
  return `VoiceStudio returned HTTP ${response.status}. ${message}`.trim();
}
async function voiceStudioVoices(fetchImpl=fetch){
  let response;try{response=await studioFetch(fetchImpl)(`${VOICESTUDIO}/v1/audio/voices`,{redirect:'error',signal:AbortSignal.timeout(20000)});}catch(error){throw studioDown(error,{waited:'20 seconds',part:'listing its voices'});}
  if(!response.ok)throw new InputError(await voiceStudioError(response),502);
  let data;try{data=await response.json();}catch{data=null;}
  if(!Array.isArray(data?.voices)||!Array.isArray(data?.engines))throw new InputError('VoiceStudio returned an unexpected voice list.',502);
  return {voices:data.voices.filter(item=>item?.type==='profile').slice(0,50).map(item=>({id:String(item.voice_id),name:String(item.name)})),engines:data.engines.filter(item=>item?.available).slice(0,40).map(item=>String(item.id))};
}
// One spoken test word (0.77, owner test 2026-10-31: Connections passed while the Voice Room failed). Listing voices never
// asks a model to speak, and VoiceStudio checks a model's licence only when it speaks, so the test now speaks.
// One spoken test sentence (0.77, owner test 2026-10-31: Connections passed while the Voice Room failed): listing voices
// never asks a model to speak, and VoiceStudio checks a model's licence only when it speaks. 0.78: a sentence instead of
// one word (very short text can trip some engines), up to 10 minutes for a model that still has to load, and the time it
// took, so the owner knows how long a narration will take on this PC.
const TEST_SENTENCE='This is a short test of the narrator voice for your channel.';
async function voiceStudioSpeak(fetchImpl,model,voice){
  const started=Date.now();let response;
  try{response=await studioFetch(fetchImpl)(`${VOICESTUDIO}/v1/audio/speech`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,input:TEST_SENTENCE,voice,response_format:'wav'}),redirect:'error',signal:AbortSignal.timeout(600000)});}
  catch(error){throw studioDown(error,{waited:'10 minutes',part:`one test sentence with "${model}"`});}
  if(!response.ok)throw new InputError(`Engine "${model}": ${await voiceStudioError(response)}`,502);
  await response.body?.cancel();
  const seconds=Math.max(.1,(Date.now()-started)/1000),routing=response.headers.get('x-omnivoice-routing')||'';
  return {seconds:Math.round(seconds*10)/10,cpu:/cpu/i.test(routing),minutesPerThousandWords:Math.round(seconds/TEST_SENTENCE.split(' ').length*1000/60)};
}
class VoiceStudioSpeechClient{
  constructor(key,fetchImpl=fetch){this.fetch=studioFetch(fetchImpl);}
  async synthesize(input){
    const text=boundedText(input.text,'speech text',4096),model=safeId(input.model,'VoiceStudio engine'),voiceId=safeId(input.voiceId,'VoiceStudio voice');
    const speed=Number(input.speed??1);if(!Number.isFinite(speed)||speed<.25||speed>4)throw new InputError('VoiceStudio speed must be between 0.25 and 4.');
    const body={model,input:text,voice:voiceId,response_format:'wav',speed};if(input.instructions)body.instructions=boundedText(input.instructions,'voice instructions',4096);
    // Free and local: onRequest is not called, so a failed part costs nothing and the narration can simply be asked again.
    // A slow PC reads a part on its processor, so a part may take many minutes (and a model may first have to load).
    let response;try{response=await this.fetch(`${VOICESTUDIO}/v1/audio/speech`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(2700000)});}catch(error){throw studioDown(error,{waited:'45 minutes',part:'this part of the narration'});}
    if(!response.ok)throw new InputError(await voiceStudioError(response),502);
    const audio=await responseAudio(response);return {audio,extension:'wav',mime:'audio/wav',requestId:null};
  }
}
const SPEECH_CLIENTS={openai:OpenAISpeechClient,elevenlabs:ElevenLabsSpeechClient,'fish-audio':FishAudioSpeechClient,voicestudio:VoiceStudioSpeechClient};
// Character timing to spoken words: a word runs from its first to its last letter; delivery tags ([excited])
// and spaces are not words. Returns null when the timing is missing or malformed.
function spokenWords(alignment){
  const c=alignment?.characters,s=alignment?.character_start_times_seconds,e=alignment?.character_end_times_seconds;
  if(!Array.isArray(c)||!Array.isArray(s)||!Array.isArray(e)||!c.length||s.length!==c.length||e.length!==c.length)return null;
  const words=[];let current=null,tag=0;
  for(let i=0;i<c.length;i++){
    const ch=String(c[i]);
    if(ch==='[')tag++;
    if(tag||/\s/.test(ch)){if(current){words.push(current);current=null;}if(ch===']')tag=Math.max(0,tag-1);continue;}
    const start=Number(s[i]),end=Number(e[i]);if(!Number.isFinite(start)||!Number.isFinite(end)||end<start)return null;
    if(current){current.text+=ch;current.end=end;}else current={text:ch,start,end};
  }
  if(current)words.push(current);
  return words.length?words:null;
}
async function probeSeconds(file,ffprobe){const out=await run(ffprobe,['-v','error','-show_entries','format=duration','-of','csv=p=0',file]);const value=Number(String(out.stdout).trim());if(!Number.isFinite(value)||value<=0)throw new InputError('A generated audio part has no readable duration.',502);return value;}
function applyLexicon(text,entries=[]){let output=text;for(const entry of entries){if(!entry.term||entry.term===entry.replacement)continue;output=output.split(entry.term).join(entry.replacement);}return output;}
function chunkText(text,provider){
  const limit=PROVIDER_LIMITS[provider]||4000,paragraphs=String(text).split(/\n{2,}/),chunks=[];let current='';
  const push=value=>{value=value.trim();if(value)chunks.push(value);};
  for(const paragraph of paragraphs){
    if((current?current.length+2:0)+paragraph.length<=limit){current+=(current?'\n\n':'')+paragraph;continue;}
    push(current);current='';
    const sentences=paragraph.match(/[^.!?。！？]+[.!?。！？]+|[^.!?。！？]+$/gu)||[paragraph];
    for(const sentence of sentences){if((current?current.length+1:0)+sentence.length<=limit){current+=(current?' ':'')+sentence.trim();continue;}push(current);current='';if(sentence.length<=limit){current=sentence.trim();continue;}for(let start=0;start<sentence.length;start+=limit)push(sentence.slice(start,start+limit));}
  }
  push(current);return chunks;
}
async function run(executable,args,options={}){try{return await execFileAsync(executable,args,{windowsHide:true,timeout:Math.ceil(options.timeout||120000),maxBuffer:options.maxBuffer||8*1024*1024,cwd:options.cwd});}catch(error){throw new InputError(`${executable} could not validate the generated audio. ${String(error.stderr||error.message).slice(0,300)}`,502);}}
async function checkTool(executable,label){try{await execFileAsync(executable,['-version'],{windowsHide:true,timeout:10000,maxBuffer:1024*1024});return true;}catch{throw new InputError(`${label} is unavailable. Voice generation was not started.`,503);}}
// Speaking pace (0.41, from claude-code-video-toolkit's pacing QC): words per minute over the whole narration.
// Comfortable narration is about 140-160; above 170 sounds rushed, below 110 drags. A note for the owner, not a gate.
function pace(script,seconds){const words=(String(script||'').match(/[\p{L}\p{N}][\p{L}\p{N}'\u2019-]*/gu)||[]).length;if(!words||!(seconds>0))return null;const wpm=Math.round(words/seconds*60);return {words,wpm,label:words<6?'ok':wpm>170?'fast':wpm<110?'slow':'ok'};}
async function analyzeAudio(filename,{expectedDuration=null,ffprobe='ffprobe',ffmpeg='ffmpeg'}={}){
  const probe=await run(ffprobe,['-v','error','-print_format','json','-show_format','-show_streams',filename]);let parsed;try{parsed=JSON.parse(probe.stdout);}catch{throw new InputError('ffprobe returned invalid audio metadata.',502);}
  const stream=parsed.streams?.find(item=>item.codec_type==='audio');if(!stream)throw new InputError('The generated file contains no decodable audio stream.',502);
  const durationSeconds=Number(stream.duration||parsed.format?.duration),sampleRate=Number(stream.sample_rate),channels=Number(stream.channels);
  if(!Number.isFinite(durationSeconds)||durationSeconds<=0)throw new InputError('The generated audio duration is invalid.',502);
  // Measuring time grows with the narration (a 60-minute file still finishes well inside it).
  const long={timeout:Math.max(120000,durationSeconds*1000)};
  const measured=await run(ffmpeg,['-hide_banner','-nostdin','-i',filename,'-af','silencedetect=n=-50dB:d=0.25,ebur128=framelog=quiet','-f','null','-'],long);
  const volume=await run(ffmpeg,['-hide_banner','-nostdin','-i',filename,'-af','volumedetect','-f','null','-'],long);
  const diagnostic=`${measured.stderr||''}\n${measured.stdout||''}`,volumeText=`${volume.stderr||''}\n${volume.stdout||''}`,decodeClean=!/\b(?:error while decoding|invalid data found|corrupt(?:ed)?|decod(?:er|ing) error|error opening input)\b/i.test(diagnostic);
  const durations=[...diagnostic.matchAll(/silence_duration:\s*([0-9.]+)/g)].map(match=>Number(match[1])).filter(Number.isFinite);const starts=[...diagnostic.matchAll(/silence_start:\s*([0-9.]+)/g)].map(match=>Number(match[1])).filter(Number.isFinite);const ends=[...diagnostic.matchAll(/silence_end:\s*([0-9.]+)/g)].map(match=>Number(match[1])).filter(Number.isFinite);
  let silenceSeconds=durations.reduce((sum,value)=>sum+value,0);if(starts.length>ends.length)silenceSeconds+=Math.max(0,durationSeconds-starts.at(-1));
  const loudness=[...diagnostic.matchAll(/\bI:\s*(-?(?:\d+(?:\.\d+)?|inf))\s*LUFS/g)].map(match=>Number(match[1])).filter(Number.isFinite).at(-1);
  const maxVolume=volumeText.match(/max_volume:\s*(-?(?:\d+(?:\.\d+)?|inf))\s*dB/i);const maxVolumeDb=maxVolume?Number(maxVolume[1]):NaN;
  const silenceRatio=Math.min(1,Math.max(0,silenceSeconds/durationSeconds)),checks=[
    {name:'decode',passed:decodeClean,detail:decodeClean?`${stream.codec_name}, ${sampleRate} Hz, ${channels} channel(s)`:'FFmpeg reported a decoder integrity error'},
    {name:'duration',passed:!expectedDuration||(durationSeconds>=expectedDuration.min&&durationSeconds<=expectedDuration.max),detail:`${durationSeconds.toFixed(2)} seconds`},
    {name:'silence',passed:silenceRatio<=.35,detail:`${(silenceRatio*100).toFixed(1)}% silence`},
    {name:'clipping',passed:Number.isFinite(maxVolumeDb)&&maxVolumeDb<=-.1,detail:`${Number.isFinite(maxVolumeDb)?maxVolumeDb.toFixed(1):'unknown'} dB peak`},
    {name:'loudness',passed:Number.isFinite(loudness)&&loudness>=-35&&loudness<=-5,detail:`${Number.isFinite(loudness)?loudness.toFixed(1):'unknown'} LUFS`},
    {name:'sample_rate',passed:Number.isSafeInteger(sampleRate)&&sampleRate>=16000,detail:`${sampleRate||'unknown'} Hz`},
    {name:'channels',passed:[1,2].includes(channels),detail:`${channels||'unknown'} channel(s)`}
  ];
  return {passed:checks.every(item=>item.passed),decodable:true,durationSeconds:Math.round(durationSeconds*1000)/1000,silenceRatio:Math.round(silenceRatio*10000)/10000,maxVolumeDb,loudness:Number.isFinite(loudness)?loudness:null,integratedLoudnessLufs:Number.isFinite(loudness)?loudness:null,sampleRate,channels,codec:stream.codec_name,checks};
}
async function mergeToWav(inputs,output,ffmpeg='ffmpeg'){
  if(!Array.isArray(inputs)||inputs.length===0)throw new InputError('No provider audio chunks were returned.',502);
  const work=path.dirname(inputs[0]),list=path.join(work,`${path.basename(output)}.concat.txt`);fs.writeFileSync(list,inputs.map(file=>`file '${path.basename(file).replaceAll("'","'\\''")}'`).join('\n'),'utf8');
  try{await run(ffmpeg,['-hide_banner','-nostdin','-loglevel','error','-f','concat','-safe','1','-i',path.basename(list),'-vn','-c:a','pcm_s16le','-y',output],{cwd:work,timeout:900000});}finally{fs.rmSync(list,{force:true});}
}
// Speaks a narration's provider requests in order, one part file each (the Voice Room and the language editions, L02).
// isCurrent is asked before every request, so a changed scope never starts another paid request.
// onPart(index, total) tells the live view which part is being read (0.78).
async function speak({client,requests,scope,work,isCurrent=()=>true,onRequest,onPart=()=>{}}){
  const parts=[],partWords=[],requestIds=[];
  for(let index=0;index<requests.length;index++){if(!isCurrent())throw new InputError('Voice scope or connector changed before the next provider request.',409);onPart(index,requests.length);const request=requests[index],speed=request.speed?Math.min(scope.provider==='openai'?4:1.2,Math.max(scope.provider==='openai'?.25:.7,Math.round(scope.delivery.pace*request.speed*100)/100)):scope.delivery.pace;const result=await client.synthesize({text:request.text,model:scope.model,voiceId:scope.voiceId,speed,instructions:request.instructions||scope.providerInstructions,stability:request.stability??scope.delivery.stability,similarity:scope.delivery.similarity,style:request.style??scope.delivery.style,onRequest});const part=path.join(work,`part-${String(index+1).padStart(3,'0')}.${result.extension}`);fs.writeFileSync(part,result.audio,{flag:'wx'});parts.push(part);partWords.push(result.words||null);if(result.requestId)requestIds.push(result.requestId);}
  return {parts,partWords,requestIds};
}
// Joins the parts into one WAV, checks the real audio and keeps the measured word times (ElevenLabs).
async function joinNarration({parts,partWords,final,scope,ffmpeg,ffprobe,onJoined=()=>{}}){
  await mergeToWav(parts,final,ffmpeg);onJoined();const analysis=await analyzeAudio(final,{expectedDuration:scope.expectedDuration,ffmpeg,ffprobe});const measuredPace=pace(scope.script,analysis.durationSeconds);if(measuredPace)analysis.pace=measuredPace;
  // Measured word timing when every part came with it (ElevenLabs): each part's words move by the parts before it.
  if(partWords.length&&partWords.every(Boolean)){let offset=0;const words=[];for(let k=0;k<parts.length;k++){for(const word of partWords[k])words.push({text:word.text,start:Math.round((word.start+offset)*1000)/1000,end:Math.round((word.end+offset)*1000)/1000});offset+=await probeSeconds(parts[k],ffprobe);}analysis.alignment={method:'measured',provider:scope.provider,words};}
  return {analysis,bytes:fs.readFileSync(final)};
}
class VoiceRuntime{
  constructor(store,connectors,{artifactDir,ffmpeg='ffmpeg',ffprobe='ffprobe'}={}){this.store=store;this.connectors=connectors;this.artifactDir=artifactDir||path.join(process.cwd(),'data','voice-artifacts');this.ffmpeg=ffmpeg;this.ffprobe=ffprobe;this.running=false;}
  async preflight(){await checkTool(this.ffmpeg,'FFmpeg');await checkTool(this.ffprobe,'ffprobe');return true;}
  async processNext(){
    if(this.running)return null;const job=this.store.claimVoiceAudition();if(!job)return null;this.running=true;let requestStarted=false,final=null;const work=path.join(this.artifactDir,'.working',job.id);
    try{
      fs.mkdirSync(work,{recursive:true});await this.preflight();const scope=job.scope,key=scope.provider==='voicestudio'?null:this.connectors.key(scope.connectorId),Client=SPEECH_CLIENTS[scope.provider]||ElevenLabsSpeechClient,client=new Client(key,this.connectors.fetch),text=applyLexicon(scope.script,scope.lexicon.entries),requests=scope.direction?Delivery.segments({script:scope.script,sentences:scope.direction.sentences,direction:scope.direction,provider:scope.provider,model:scope.model,base:{stability:scope.delivery.stability,style:scope.delivery.style,instructions:scope.providerInstructions},limit:Delivery.requestLimit(scope.provider,scope.model)}).map(item=>({...item,text:applyLexicon(item.text,scope.lexicon.entries)})):chunkText(text,scope.provider).map(chunk=>({text:chunk}));
      // The live view (0.78, owner request 2026-10-31): one step per part, then joining and the audio checks.
      const local=scope.provider==='voicestudio';
      live.start(job.id,{room:'voice',label:'Reading the narration',steps:requests.length+2,contentId:scope.contentId,familyId:scope.familyId,wait:local?'VoiceStudio sends a part back only when it is finished; on a PC without a strong graphics card a part can take several minutes.':'Each part comes back when the voice service has read it.'});
      const {parts,partWords,requestIds}=await speak({client,requests,scope,work,isCurrent:()=>this.store.voiceScopeCurrent(job,scope),onRequest:()=>{requestStarted=true;},onPart:(index,total)=>live.step(job.id,index+1,`Reading part ${index+1} of ${total}${local?' on this PC':''} (${requests[index].text.length.toLocaleString()} characters)`)});
      live.step(job.id,requests.length+1,'Joining the parts into one narration');
      const familyDir=path.join(this.artifactDir,scope.familyId,scope.contentId);final=path.join(familyDir,`${job.id}.wav`);fs.mkdirSync(familyDir,{recursive:true});const joined=joinNarration({parts,partWords,final,scope,ffmpeg:this.ffmpeg,ffprobe:this.ffprobe,onJoined:()=>live.step(job.id,requests.length+2,'Checking the audio: decode, silence, clipping and loudness')}),{analysis,bytes}=await joined,artifact={relativePath:path.relative(path.dirname(this.artifactDir),final).replaceAll('\\','/'),sha256:createHash('sha256').update(bytes).digest('hex'),sizeBytes:bytes.length,mime:'audio/wav'};
      const saved=this.store.completeVoiceAudition(job.id,{artifact,analysis,provider:{requestIds,model:scope.model,voiceId:scope.voiceId,voiceVersion:scope.voiceVersion},settledCharacters:scope.characterCount});final=null;return saved;
    }catch(error){if(final)fs.rmSync(final,{force:true});this.store.failVoiceAudition(job.id,error instanceof InputError?error.message:'Voice generation failed. Review the local logs before retrying.',{usageUnknown:requestStarted});return null;}finally{live.end(job.id);fs.rmSync(work,{recursive:true,force:true});this.running=false;}
  }
}
// The owner's own narration file (0.78): streamed from the page into the data folder (500 MB at most, audio types only),
// turned into the same WAV the generated takes use, checked by the same real-audio checks, then recorded as a take.
const UPLOAD_TYPES=/\.(wav|mp3|m4a|aac|flac|ogg|opus|webm)$/i,MAX_UPLOAD_BYTES=500*1024*1024;
VoiceRuntime.prototype.attach=async function(contentId,stream,params){
  const name=String(params.name||'').replace(/[\x00-\x1f\x7f\\/:*?"<>|]+/g,' ').trim().slice(0,120),by=String(params.by||'').trim(),holder=String(params.holder||'').trim(),revision=Number(params.revision);
  if(!UPLOAD_TYPES.test(name))throw new InputError('Attach an audio file: WAV, MP3, M4A, AAC, FLAC, OGG, Opus or WebM.',415);
  if(by.length<2||by.length>100)throw new InputError('Enter your name (2-100 characters).');
  if(holder.length<2||holder.length>200)throw new InputError('Name who holds the rights to this voice-over (2-200 characters).');
  if(params.rights!=='1')throw new InputError('Confirm that you own this voice-over or are licensed to use it commercially on your channels.');
  const content=this.store.content(contentId);if(content.state!=='approved'||content.revision!==revision)throw new InputError('Attach the narration to the current approved script (reload the page).',409);
  if(!this.store.voiceProfiles(content.familyId).length)throw new InputError('Set up the channel\'s narrator once (Configure narrator: name, language, pronunciation and rights) before attaching a file.',409);
  await this.preflight();
  const id=randomUUID(),work=path.join(this.artifactDir,'.working',`upload-${id}`),original=path.join(work,`original${path.extname(name).toLowerCase()}`);fs.mkdirSync(work,{recursive:true});
  const familyDir=path.join(this.artifactDir,content.familyId,content.id),final=path.join(familyDir,`upload-${id}.wav`);let kept=false;
  try{
    let bytes=0;const out=fs.createWriteStream(original,{flags:'wx'}),hash=createHash('sha256');
    await new Promise((resolve,reject)=>{stream.on('data',chunk=>{bytes+=chunk.length;if(bytes>MAX_UPLOAD_BYTES){stream.destroy();out.destroy();reject(new InputError('The file is larger than 500 MB. Export it as MP3 or a shorter WAV.',413));return;}hash.update(chunk);if(!out.write(chunk)){stream.pause();out.once('drain',()=>stream.resume());}});stream.on('end',()=>out.end(resolve));stream.on('error',reject);out.on('error',reject);});
    if(bytes<1024)throw new InputError('The file is empty or too small to be a narration.',400);
    fs.mkdirSync(familyDir,{recursive:true});
    await run(this.ffmpeg,['-hide_banner','-nostdin','-loglevel','error','-i',original,'-vn','-map','0:a:0','-ac','2','-c:a','pcm_s16le','-y',final],{timeout:900000}).catch(()=>{throw new InputError('This file could not be read as audio. Export it again as WAV or MP3 and attach that.',415);});
    // The same length check as a generated take: a file far shorter or longer than its script is the wrong file.
    const words=(content.script.match(/[\p{L}\p{N}][\p{L}\p{N}'\u2019-]*/gu)||[]).length,estimated=words/145*60;
    const analysis=await analyzeAudio(final,{expectedDuration:{min:Math.max(1,estimated*.45),max:estimated*2.1},ffmpeg:this.ffmpeg,ffprobe:this.ffprobe}),measured=pace(content.script,analysis.durationSeconds);if(measured)analysis.pace=measured;
    const data=fs.readFileSync(final),artifact={relativePath:path.relative(path.dirname(this.artifactDir),final).replaceAll('\\','/'),sha256:createHash('sha256').update(data).digest('hex'),sizeBytes:data.length,mime:'audio/wav'};
    const audition=this.store.recordUploadedNarration({contentId,revision,artifact,analysis,upload:{name,sizeBytes:bytes,originalSha256:hash.digest('hex'),attachedBy:by,rightsHolder:holder,commercialUseConfirmed:true,at:new Date().toISOString()}});
    kept=true;return audition;
  }finally{if(!kept)fs.rmSync(final,{force:true});fs.rmSync(work,{recursive:true,force:true});}
};
module.exports={pace,analyzeAudio,applyLexicon,chunkText,spokenWords,speak,joinNarration,checkTool,OpenAISpeechClient,ElevenLabsSpeechClient,FishAudioSpeechClient,VoiceStudioSpeechClient,voiceStudioVoices,voiceStudioSpeak,loopbackFetch,SPEECH_CLIENTS,VoiceRuntime};
