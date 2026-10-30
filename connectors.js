'use strict';
const {randomUUID} = require('node:crypto');
const {InputError} = require('./store');
const {YouTubeResearch, responseJson} = require('./youtube');
const {MODELS, DEFAULT_MODELS, MODEL_GROUPS, AiError} = require('./ai');

const PROVIDERS = {
  youtube: {name: 'YouTube public research', test: 'Public channel lookup', ready: true},
  'youtube-oauth': {name: 'YouTube channel access (Google OAuth client)', test: 'Checks the client ID and secret are saved; Google checks them when you connect a channel in Room 11', ready: true, oauth: true},
  openai: {name: 'OpenAI API key (paid per use; not the ChatGPT subscription)', test: 'Read model list; no generation', ready: true},
  elevenlabs: {name: 'ElevenLabs', test: 'Read voice list; no generation', ready: true},
  // Owner request 2026-10-22: Fish Audio as a second narration provider (https://fish.audio, API key from its dashboard).
  'fish-audio': {name: 'Fish Audio', test: 'Reads your API credit balance; no generation', ready: true},
  // Owner request 2026-10-30: free voice models on this PC through VoiceStudio (no key), for testing only.
  voicestudio: {name: 'VoiceStudio (free voices on this PC, for testing only)', test: 'Asks VoiceStudio on this PC for its engines and voices; nothing generated', ready: true, keyless: true},
  // 0.57: free-licence and public-domain images (no key).
  wikimedia: {name: 'Wikimedia Commons (free-licence and public-domain images)', test: 'One image search; nothing downloaded', ready: true, keyless: true},
  'claude-code': {name: 'Claude subscription (Claude Code on this PC)', test: 'Asks Claude Code one tiny question on your subscription', ready: true, keyless: true, ai: true},
  claude: {name: 'Claude API key', test: 'Reads the chosen models\' details with the key; no generation', ready: true, ai: true},
  // Owner request 2026-10-22: the ChatGPT plan through the Codex app's own sign-in (no API key).
  chatgpt: {name: 'ChatGPT subscription (sign in with ChatGPT, through the Codex app)', test: 'Asks Codex one tiny question on your ChatGPT plan', ready: true, keyless: true, ai: true, gpt: true},
  // Owner decision 2026-10-06: Claude replaced Hermes. Old Hermes slots stay visible so they can be deleted.
  hermes: {name: 'Hermes (removed; use Claude)', test: 'Hermes was removed from the program on 2026-10-06. Delete this slot.', ready: false, retired: true},
  nexlev: {name: 'NexLev research API', test: 'Reads one channel profile (uses 1 NexLev API request); no other data', ready: true},
  pexels: {name: 'Pexels stock library', test: 'One photo search for "nature" (uses 1 Pexels request); nothing is downloaded', ready: true},
  pixabay: {name: 'Pixabay stock library', test: 'One photo search for "nature" (uses 1 Pixabay request); nothing is downloaded', ready: true},
  mcp: {name: 'MCP server', test: 'Adapter not implemented; setup record only', ready: false},
  // 0.57: the owner's own Reddit app (reddit.com/prefs/apps, type "script"): app ID, secret and the owner's username.
  reddit: {name: 'Reddit (your Reddit app)', test: 'Signs in as your Reddit app and runs one search; nothing is posted', ready: true, reddit: true},
  // 0.61 (owner request 2026-10-23): free sound effects and music. Their API terms reserve commercial use, so each
  // connection records the owner's confirmation that the platform allows their use.
  freesound: {name: 'Freesound (sound effects, CC0 and CC BY)', test: 'One sound search (1 request); nothing downloaded', ready: true, terms: true, keyLabel: 'Freesound API key'},
  jamendo: {name: 'Jamendo (music, CC BY)', test: 'One track search (1 request); nothing downloaded', ready: true, terms: true, keyLabel: 'Jamendo client ID', keyMin: 8}
};
function text(value, label, max, min=0) {
  if(typeof value!=='string'||value.trim().length<min||value.length>max||/[\x00-\x1f\x7f]/.test(value))throw new InputError(`Enter a valid ${label} (${min}–${max} characters).`);
  return value.trim();
}
// A Jamendo client ID is 8 characters (keyMin); every other key at least 16.
function secret(value,min=16){if(typeof value!=='string'||value.length<min||!/^\S{1,512}$/.test(value)||/[^\x21-\x7e]/.test(value))throw new InputError(`Enter an API key with ${min}–512 printable characters and no spaces.`);return value;}

class ConnectorSlots {
  constructor(store, protector, fetchImpl=fetch){this.store=store;this.db=store.db;this.protector=protector;this.fetch=fetchImpl;this.busy=new Set();this.db.exec('CREATE TABLE IF NOT EXISTS ai_roles(id TEXT PRIMARY KEY, revision INTEGER NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL)');}
  // The AI team (owner request 2026-10-22): who paints pictures, and whether scripts are written by both AIs together.
  aiRoles(){const row=this.db.prepare("SELECT * FROM ai_roles WHERE id='global'").get();return {pictures:'chatgpt',scripts:'together',scriptWriter:'claude',...(row?JSON.parse(row.payload):{}),revision:row?.revision||0};}
  saveAiRoles(input){
    if(!input||typeof input!=='object')throw new InputError('Send the AI team settings.');
    const pick=(value,allowed,label)=>{if(!allowed.includes(value))throw new InputError(`Choose ${label}: ${allowed.join(' or ')}.`);return value;};
    const payload={pictures:pick(input.pictures,['chatgpt','claude'],'who paints pictures'),scripts:pick(input.scripts,['together','alone'],'how scripts are written'),scriptWriter:pick(input.scriptWriter,['claude','chatgpt'],'who writes the script')};
    // The Claude model per kind of job ('' = the connection's own choice).
    const models=input.models??{};
    if(typeof models!=='object'||Array.isArray(models)||Object.keys(models).some(key=>!Object.hasOwn(MODEL_GROUPS,key)))throw new InputError('Choose models only for the listed kinds of job.');
    payload.models=Object.fromEntries(Object.entries(models).filter(([,value])=>value).map(([key,value])=>{if(!Object.hasOwn(MODELS,value))throw new InputError('Choose a supported Claude model for each kind of job.');return [key,value];}));
    const current=this.aiRoles();if(input.revision!==current.revision)throw new InputError('The AI team changed in another tab. Reload first.',409);
    this.db.prepare("INSERT INTO ai_roles(id,revision,payload,updated_at) VALUES('global',?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload,updated_at=excluded.updated_at").run(current.revision+1,JSON.stringify(payload),new Date().toISOString());
    this.store.event(`AI team: pictures by ${payload.pictures === 'chatgpt' ? 'ChatGPT' : 'Claude'}, scripts ${payload.scripts === 'together' ? `written together (${payload.scriptWriter === 'claude' ? 'Claude' : 'ChatGPT'} writes, the other reviews)` : 'by one AI'}${Object.keys(payload.models).length ? `, models chosen for ${Object.keys(payload.models).join(', ')}` : ''}`);
    return this.aiRoles();
  }
  row(id){const row=this.db.prepare('SELECT * FROM connectors WHERE id=?').get(id);if(!row)throw new InputError('Connector not found.',404);return row;}
  public(row){return {...JSON.parse(row.payload),id:row.id,hasKey:!!row.secret,busy:this.busy.has(row.id),...(this.signIns?.has(row.id)?{signIn:{...this.signIns.get(row.id)}}:{})};}
  // The ChatGPT subscription signs in through Codex's own login (owner review 2026-10-29); when it finishes, the
  // connection test runs by itself (one tiny question on the plan). The sign-in state lives in memory only.
  signIn(id,revision){
    const row=this.row(id);this.checkRevision(row,revision);const slot=JSON.parse(row.payload);
    if(slot.provider!=='chatgpt')throw new InputError('Only the ChatGPT subscription signs in from here; other connections use their key.');
    this.signIns||=new Map();
    if(['waiting','testing'].includes(this.signIns.get(id)?.status))throw new InputError('The ChatGPT sign-in is already open in your browser.',409);
    const state={status:'waiting',at:new Date().toISOString(),message:'ChatGPT\'s sign-in page is opening in your browser. Sign in there with your ChatGPT account, then come back here.',link:null};
    this.signIns.set(id,state);
    const {Ai}=require('./ai');
    (this.ai||new Ai(this)).codex.login({onLink:link=>{state.link=link;}}).then(async()=>{
      state.status='testing';state.message='Signed in. Testing the connection with one tiny question...';
      try{const tested=await this.test(id,revision);state.status=tested.connector.test?.status==='passed'?'done':'failed';state.message=tested.connector.test?.status==='passed'?'Signed in with ChatGPT and tested.':`Signed in, but the test did not pass: ${tested.connector.test?.message||'no answer'}`;}
      catch(error){state.status='failed';state.message=`Signed in, but the test could not run: ${error.message}`;}
      state.link=null;
    },error=>{state.status='failed';state.message=error.message;state.link=null;});
    return {connector:this.public(this.row(id)),signIn:{...state}};
  }
  list(){return this.db.prepare('SELECT * FROM connectors ORDER BY rowid').all().map(row=>this.public(row));}
  idle(id){if(this.busy.has(id))throw new InputError('This connector is being tested. Wait before changing or deleting it.',409);}
  checkRevision(row,revision){this.store.version(JSON.parse(row.payload),revision);}
  save(input,id){
    if(id)this.idle(id);
    const old=id?this.row(id):null;if(old)this.checkRevision(old,input.revision);
    const provider=input.provider;
    if(!Object.hasOwn(PROVIDERS,provider))throw new InputError('Choose a supported connector type.');
    if(PROVIDERS[provider].retired&&!old)throw new InputError('Hermes was removed from the program. Add a Claude connection instead.');
    if(PROVIDERS[provider].keyless&&input.key)throw new InputError('This connection takes no API key: it uses the app on this PC (Claude Code, Codex or VoiceStudio).');
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
    if(input.key)encrypted=this.protector.transform('protect',Buffer.from(secret(input.key,PROVIDERS[provider].keyMin)));
    const next={name,provider,notes,revision:old?JSON.parse(old.payload).revision+1:1,test:null,updatedAt:new Date().toISOString()};
    // Y01: a Google OAuth client of type "Desktop app"; its ID is not a secret, its secret is kept like a key.
    if(PROVIDERS[provider].reddit){
      const oldPayload=old?JSON.parse(old.payload):{},clientId=input.clientId??oldPayload.clientId,username=input.username??oldPayload.username;
      if(typeof clientId!=='string'||!/^[A-Za-z0-9_-]{10,40}$/.test(clientId))throw new InputError('Enter the Reddit app ID (the short code under the app name on reddit.com/prefs/apps).');
      if(typeof username!=='string'||!/^[A-Za-z0-9_-]{3,20}$/.test(username))throw new InputError('Enter your Reddit username (Reddit asks every app to name its owner).');
      next.clientId=clientId;next.username=username;
    }
    if(PROVIDERS[provider].terms){
      const confirmed=input.termsConfirmed??(old?!!JSON.parse(old.payload).termsConfirmed:false);
      if(confirmed!==true)throw new InputError(`Confirm that ${provider==='jamendo'?'Jamendo':'Freesound'} allows your use of its API (its free API is for non-commercial use; a monetized channel needs the platform\'s OK).`);
      next.termsConfirmed=old&&JSON.parse(old.payload).termsConfirmed&&input.termsConfirmed===undefined?JSON.parse(old.payload).termsConfirmed:{at:new Date().toISOString()};
    }
    if(PROVIDERS[provider].oauth){const clientId=input.clientId??(old?JSON.parse(old.payload).clientId:undefined);if(typeof clientId!=='string'||!/^\d{6,30}-[a-z0-9]{8,64}\.apps\.googleusercontent\.com$/.test(clientId))throw new InputError('Enter the OAuth client ID from Google Cloud (it ends in .apps.googleusercontent.com).');next.clientId=clientId;}
    // The two Claude models a connection uses: main (scripts, editing, visuals, niches) and support (the rest).
    // A ChatGPT connection names one GPT model (empty: the Codex app's own default).
    if(PROVIDERS[provider].gpt){
      const model=input.models?.main??(old?JSON.parse(old.payload).models?.main:undefined)??'';
      if(typeof model!=='string'||(model&&!/^[a-z0-9][a-z0-9.\-]{1,47}$/.test(model)))throw new InputError('Enter a GPT model name such as gpt-6.1-sol, or leave it empty for the Codex default.');
      next.models={main:model};
    }else if(PROVIDERS[provider].ai){
      const pick=(value,role)=>{const model=value??(old?JSON.parse(old.payload).models?.[role]:undefined)??DEFAULT_MODELS[role];if(!Object.hasOwn(MODELS,model))throw new InputError(`Choose a supported Claude model for the ${role} role.`);return model;};
      next.models={main:pick(input.models?.main,'main'),support:pick(input.models?.support,'support')};
    }
    const recordId=id||randomUUID();
    this.db.prepare('INSERT INTO connectors(id,name_key,payload,secret) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name_key=excluded.name_key,payload=excluded.payload,secret=excluded.secret').run(recordId,name.toLowerCase(),JSON.stringify(next),encrypted);
    return this.public(this.row(recordId));
  }
  // A job found this connection signed out (0.73): its test no longer stands, so the page stops showing it connected
  // and jobs queued on it stop before anything is sent (stale) instead of failing one by one. Testing again restores it.
  failTest(id,message){const row=this.db.prepare('SELECT payload FROM connectors WHERE id=?').get(id);if(!row)return;const slot=JSON.parse(row.payload);slot.test={status:'failed',at:new Date().toISOString(),message:String(message).slice(0,600)};this.db.prepare('UPDATE connectors SET payload=? WHERE id=?').run(JSON.stringify(slot),id);}
  remove(id,revision){this.idle(id);this.checkRevision(this.row(id),revision);this.db.prepare('DELETE FROM connectors WHERE id=?').run(id);return {removed:true};}
  key(id){const row=this.row(id);if(!row.secret)throw new InputError('Edit this connector and add its API key first.',409);return secret(this.protector.transform('unprotect',Buffer.from(row.secret)).toString('utf8'),PROVIDERS[JSON.parse(row.payload).provider]?.keyMin);}
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
      }else if(slot.provider==='reddit'){
        const {RedditClient}=require('./reddit');
        const found=await new RedditClient({clientId:slot.clientId,secret:key,username:slot.username},this.fetch).search('history',{days:7,limit:3});
        result={access:'reddit_read',message:`Reddit accepted your app and returned ${found.length} post(s) (2 requests). Nothing was posted.`};
      }else if(slot.provider==='freesound'||slot.provider==='jamendo'){
        const {FreesoundClient,JamendoClient}=require('./sound-online');
        const found=slot.provider==='freesound'?await new FreesoundClient(key,this.fetch).search('whoosh',{limit:5}):await new JamendoClient(key,this.fetch).search('piano',{limit:20});
        result={access:'sound_search',message:`${slot.provider==='freesound'?'Freesound':'Jamendo'} answered with ${found.length} result(s), ${found.filter(item=>item.licence.ok).length} under CC0 or CC BY (1 request). Nothing was downloaded.`};
      }else if(slot.provider==='wikimedia'){
        const {WikimediaClient}=require('./visual-sources');
        const found=await new WikimediaClient(null,this.fetch).search({query:'old map',perPage:3});
        result={access:'archive_search',message:`Wikimedia Commons answered with ${found.candidates.length} usable image(s) (public domain, CC0 or CC BY). Nothing was downloaded.`};
      }else if(slot.provider==='pexels'||slot.provider==='pixabay'){
        const {PexelsClient,PixabayClient}=require('./visual-sources');
        const client=slot.provider==='pexels'?new PexelsClient(key,this.fetch):new PixabayClient(key,this.fetch);
        const found=await client.search({capabilityId:`${slot.provider}-photo`,query:'nature',perPage:3});
        result={access:'stock_search',message:`${PROVIDERS[slot.provider].name} accepted the API key and returned ${found.candidates.length} photo result(s) (1 request used). Nothing was downloaded.`};
      }else if(slot.provider==='voicestudio'){
        const {voices,engines}=await require('./voice').voiceStudioVoices(this.fetch);
        if(!engines.length)throw new InputError('VoiceStudio is running but has no voice engine ready. Install one in its Model Manager, then test again.',502);
        result={access:'local_voices',message:`VoiceStudio is running on this PC with ${engines.length} ready engine(s) (${engines.slice(0,6).join(', ')}) and ${voices.length} saved voice(s). Nothing was generated. Its voices are for testing only.`};
      }else if(slot.provider==='fish-audio'){
        let response;
        try{response=await this.fetch('https://api.fish.audio/wallet/self/api-credit',{headers:{Authorization:`Bearer ${key}`},redirect:'error',signal:AbortSignal.timeout(10000)});}
        catch{throw new InputError('Provider connection failed or timed out. Check your network and retry.',502);}
        if(!response.ok){await response.body?.cancel();throw new InputError(`Fish Audio returned HTTP ${response.status}. Check the API key on fish.audio.`,502);}
        const data=await responseJson(response),credit=Number(data?.credit);
        result={access:'voice_account',message:`Fish Audio accepted the key${Number.isFinite(credit)?` (API credit ${credit.toFixed(2)})`:''}. Nothing was generated.`};
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
