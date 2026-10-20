'use strict';
const {randomUUID} = require('node:crypto');
const {InputError} = require('./store');
const {YouTubeResearch, responseJson} = require('./youtube');
const {MODELS, DEFAULT_MODELS, AiError} = require('./ai');

const PROVIDERS = {
  youtube: {name: 'YouTube public research', test: 'Public channel lookup', ready: true},
  'youtube-oauth': {name: 'YouTube channel access (Google OAuth client)', test: 'Checks the client ID and secret are saved; Google checks them when you connect a channel in Room 11', ready: true, oauth: true},
  openai: {name: 'OpenAI', test: 'Read model list; no generation', ready: true},
  elevenlabs: {name: 'ElevenLabs', test: 'Read voice list; no generation', ready: true},
  'claude-code': {name: 'Claude subscription (Claude Code on this PC)', test: 'Asks Claude Code one tiny question on your subscription', ready: true, keyless: true, ai: true},
  claude: {name: 'Claude API key', test: 'Reads the chosen models\' details with the key; no generation', ready: true, ai: true},
  // Owner decision 2026-10-06: Claude replaced Hermes. Old Hermes slots stay visible so they can be deleted.
  hermes: {name: 'Hermes (removed; use Claude)', test: 'Hermes was removed from the program on 2026-10-06. Delete this slot.', ready: false, retired: true},
  nexlev: {name: 'NexLev research API', test: 'Reads one channel profile (uses 1 NexLev API request); no other data', ready: true},
  pexels: {name: 'Pexels stock library', test: 'One photo search for "nature" (uses 1 Pexels request); nothing is downloaded', ready: true},
  pixabay: {name: 'Pixabay stock library', test: 'One photo search for "nature" (uses 1 Pixabay request); nothing is downloaded', ready: true},
  mcp: {name: 'MCP server', test: 'Adapter not implemented; setup record only', ready: false},
  reddit: {name: 'Reddit', test: 'OAuth adapter not implemented; setup record only', ready: false}
};
function text(value, label, max, min=0) {
  if(typeof value!=='string'||value.trim().length<min||value.length>max||/[\x00-\x1f\x7f]/.test(value))throw new InputError(`Enter a valid ${label} (${min}–${max} characters).`);
  return value.trim();
}
function secret(value){if(typeof value!=='string'||!/^\S{16,512}$/.test(value)||/[^\x21-\x7e]/.test(value))throw new InputError('Enter an API key with 16–512 printable characters and no spaces.');return value;}

class ConnectorSlots {
  constructor(store, protector, fetchImpl=fetch){this.store=store;this.db=store.db;this.protector=protector;this.fetch=fetchImpl;this.busy=new Set();}
  row(id){const row=this.db.prepare('SELECT * FROM connectors WHERE id=?').get(id);if(!row)throw new InputError('Connector not found.',404);return row;}
  public(row){return {...JSON.parse(row.payload),id:row.id,hasKey:!!row.secret,busy:this.busy.has(row.id)};}
  list(){return this.db.prepare('SELECT * FROM connectors ORDER BY rowid').all().map(row=>this.public(row));}
  idle(id){if(this.busy.has(id))throw new InputError('This connector is being tested. Wait before changing or deleting it.',409);}
  checkRevision(row,revision){this.store.version(JSON.parse(row.payload),revision);}
  save(input,id){
    if(id)this.idle(id);
    const old=id?this.row(id):null;if(old)this.checkRevision(old,input.revision);
    const provider=input.provider;
    if(!Object.hasOwn(PROVIDERS,provider))throw new InputError('Choose a supported connector type.');
    if(PROVIDERS[provider].retired&&!old)throw new InputError('Hermes was removed from the program. Add a Claude connection instead.');
    if(PROVIDERS[provider].keyless&&input.key)throw new InputError('The Claude subscription connection uses the Claude Code login on this PC; it takes no API key.');
    if(old&&JSON.parse(old.payload).provider!==provider)throw new InputError('Create a new slot to change provider. Keys cannot be moved between providers.');
    const name=text(input.name,'connector name',80,2), notes=text(input.notes||'','setup notes',1000);
    if(input.clearKey!==undefined&&typeof input.clearKey!=='boolean')throw new InputError('Invalid clear-key choice.');
    if(input.key!==undefined&&typeof input.key!=='string')throw new InputError('Invalid key input.');
    if(input.clearKey&&input.key)throw new InputError('Choose either replace key or clear key.');
    if(!PROVIDERS[provider].ready&&input.key)throw new InputError('This adapter is not ready. Save setup notes only; do not enter its credentials yet.');
    const duplicate=this.db.prepare('SELECT id FROM connectors WHERE name_key=?').get(name.toLowerCase());
    if(duplicate&&duplicate.id!==id)throw new InputError('That connector name is already used.',409);
    if(!old&&this.list().length>=60)throw new InputError('Maximum 60 connector slots.');
    let encrypted=old?.secret||null;
    if(input.clearKey)encrypted=null;
    if(input.key)encrypted=this.protector.transform('protect',Buffer.from(secret(input.key)));
    const next={name,provider,notes,revision:old?JSON.parse(old.payload).revision+1:1,test:null,updatedAt:new Date().toISOString()};
    // Y01: a Google OAuth client of type "Desktop app"; its ID is not a secret, its secret is kept like a key.
    if(PROVIDERS[provider].oauth){const clientId=input.clientId??(old?JSON.parse(old.payload).clientId:undefined);if(typeof clientId!=='string'||!/^\d{6,30}-[a-z0-9]{8,64}\.apps\.googleusercontent\.com$/.test(clientId))throw new InputError('Enter the OAuth client ID from Google Cloud (it ends in .apps.googleusercontent.com).');next.clientId=clientId;}
    // The two Claude models a connection uses: main (scripts, editing, visuals, niches) and support (the rest).
    if(PROVIDERS[provider].ai){
      const pick=(value,role)=>{const model=value??(old?JSON.parse(old.payload).models?.[role]:undefined)??DEFAULT_MODELS[role];if(!Object.hasOwn(MODELS,model))throw new InputError(`Choose a supported Claude model for the ${role} role.`);return model;};
      next.models={main:pick(input.models?.main,'main'),support:pick(input.models?.support,'support')};
    }
    const recordId=id||randomUUID();
    this.db.prepare('INSERT INTO connectors(id,name_key,payload,secret) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name_key=excluded.name_key,payload=excluded.payload,secret=excluded.secret').run(recordId,name.toLowerCase(),JSON.stringify(next),encrypted);
    return this.public(this.row(recordId));
  }
  remove(id,revision){this.idle(id);this.checkRevision(this.row(id),revision);this.db.prepare('DELETE FROM connectors WHERE id=?').run(id);return {removed:true};}
  key(id){const row=this.row(id);if(!row.secret)throw new InputError('Edit this connector and add its API key first.',409);return secret(this.protector.transform('unprotect',Buffer.from(row.secret)).toString('utf8'));}
  async test(id,revision,channel='@GoogleDevelopers'){
    this.idle(id);const row=this.row(id);this.checkRevision(row,revision);const slot=JSON.parse(row.payload);
    if(!PROVIDERS[slot.provider].ready){
      slot.test={status:'not_implemented',at:new Date().toISOString(),message:PROVIDERS[slot.provider].test};
      this.db.prepare('UPDATE connectors SET payload=? WHERE id=?').run(JSON.stringify(slot),id);
      return {connector:this.public(this.row(id)),result:null};
    }
    slot.test={status:'testing',at:new Date().toISOString(),message:'Connector test in progress. Generation remains disabled until it passes.'};
    this.db.prepare('UPDATE connectors SET payload=? WHERE id=?').run(JSON.stringify(slot),id);
    this.busy.add(id);
    let result=null, failure=null;
    try{
      const key=PROVIDERS[slot.provider].keyless?null:this.key(id);
      if(PROVIDERS[slot.provider].ai){
        const {Ai}=require('./ai');
        result=await(this.ai||new Ai(this)).test(slot,key);
      }else if(slot.provider==='youtube'){
        const research=new YouTubeResearch({get:()=>key},this.fetch);
        result=await research.lookup(channel);
      }else if(PROVIDERS[slot.provider].oauth){
        result={access:'oauth_client_saved',message:'The client ID and secret are saved. Nothing was sent to Google: Google checks them when you connect a channel in Room 11.'};
      }else if(slot.provider==='nexlev'){
        const {NexLevClient}=require('./intel-sources');
        const data=await new NexLevClient(key,this.fetch).channelAbout('UC_x5XG1OV2P6uZZ5FSM9Ttw');
        if(!data||typeof data!=='object')throw new InputError('NexLev returned an unexpected response.',502);
        result={access:'read_only_channel_profile',message:'NexLev accepted the API key and returned a channel profile (1 request used). Plan limits and other endpoints are not tested.'};
      }else if(slot.provider==='pexels'||slot.provider==='pixabay'){
        const {PexelsClient,PixabayClient}=require('./visual-sources');
        const client=slot.provider==='pexels'?new PexelsClient(key,this.fetch):new PixabayClient(key,this.fetch);
        const found=await client.search({capabilityId:`${slot.provider}-photo`,query:'nature',perPage:3});
        result={access:'stock_search',message:`${PROVIDERS[slot.provider].name} accepted the API key and returned ${found.candidates.length} photo result(s) (1 request used). Nothing was downloaded.`};
      }else{
        const url=slot.provider==='openai'?'https://api.openai.com/v1/models':'https://api.elevenlabs.io/v2/voices?page_size=1';
        const headers=slot.provider==='openai'?{Authorization:`Bearer ${key}`}:{'xi-api-key':key};
        let response;
        try{response=await this.fetch(url,{headers,redirect:'error',signal:AbortSignal.timeout(10000)});}
        catch{throw new InputError('Provider connection failed or timed out. Check your network and retry.',502);}
        if(!response.ok){await response.body?.cancel();throw new InputError(`Provider returned HTTP ${response.status}. Check key permissions, account access and rate limits.`,502);}
        const data=await responseJson(response);
        const items=slot.provider==='openai'?data.data:data.voices;
        if(!Array.isArray(items))throw new InputError('Provider returned an unexpected response.',502);
        result={access:'read_only_metadata',message:slot.provider==='openai'?'Model-list access passed. Generation, model access and billing are not tested.':'Voice-list access passed. Speech generation and voice rights are not tested.'};
      }
      slot.test={status:'passed',at:new Date().toISOString(),message:result.message||'Public channel lookup passed. Channel ownership and uploads are not authorized.'};
    }catch(error){failure=error instanceof InputError?error:error instanceof AiError?new InputError(error.message,error.status):new InputError('Connector test failed. No credentials or raw provider errors are shown.',502);slot.test={status:'failed',at:new Date().toISOString(),message:failure.message};}
    finally{this.busy.delete(id);}
    // No slot writes can interleave while its async request is in flight.
    this.db.prepare('UPDATE connectors SET payload=? WHERE id=?').run(JSON.stringify(slot),id);
    if(failure)throw failure;
    return {connector:this.public(this.row(id)),result};
  }
}
module.exports={ConnectorSlots,PROVIDERS};
