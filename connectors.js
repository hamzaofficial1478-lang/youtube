'use strict';
const {randomUUID} = require('node:crypto');
const {InputError} = require('./store');
const {YouTubeResearch, responseJson} = require('./youtube');
const {HermesClient} = require('./hermes');

const PROVIDERS = {
  youtube: {name: 'YouTube public research', test: 'Public channel lookup', ready: true},
  openai: {name: 'OpenAI', test: 'Read model list; no generation', ready: true},
  elevenlabs: {name: 'ElevenLabs', test: 'Read voice list; no generation', ready: true},
  hermes: {name: 'Hermes reasoning engine', test: 'Authenticated capability and tool-free profile check; no generation', ready: true},
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
    this.busy.add(id);
    let result=null, failure=null;
    try{
      const key=this.key(id);
      if(slot.provider==='youtube'){
        const research=new YouTubeResearch({get:()=>key},this.fetch);
        result=await research.lookup(channel);
      }else if(slot.provider==='hermes'){
        result=await new HermesClient(key,this.fetch).capabilities();
        result.message='Hermes authenticated capability and tool-free profile checks passed. No content was generated.';
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
    }catch(error){failure=error instanceof InputError?error:new InputError('Connector test failed. No credentials or raw provider errors are shown.',502);slot.test={status:'failed',at:new Date().toISOString(),message:failure.message};}
    finally{this.busy.delete(id);}
    // No slot writes can interleave while its async request is in flight.
    this.db.prepare('UPDATE connectors SET payload=? WHERE id=?').run(JSON.stringify(slot),id);
    if(failure)throw failure;
    return {connector:this.public(this.row(id)),result};
  }
}
module.exports={ConnectorSlots,PROVIDERS};
