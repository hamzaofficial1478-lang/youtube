'use strict';
const { DatabaseSync } = require('node:sqlite');
const { randomUUID,createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { validateYouTubeMetadata } = require('./vendor/youtube-automation-agent/youtube-metadata-validator');
const {assessScriptQuality,scriptPolicy,deriveCompletionLimit,wordCount}=require('./hermes');

class InputError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const requireValue = (ok, message, status) => { if (!ok) throw new InputError(message, status); };
function text(value, label, min, max) {
  requireValue(typeof value === 'string', `${label} must be text.`);
  const result = value.trim();
  requireValue(result.length >= min && result.length <= max, `${label} must contain ${min}-${max} characters.`);
  requireValue(!/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(result), `${label} contains unsupported control characters.`);
  return result;
}
function choice(value, allowed, label) { requireValue(allowed.includes(value), `Choose a valid ${label}.`); return value; }
function integer(value, min, max, label) { requireValue(Number.isSafeInteger(value) && value >= min && value <= max, `${label} must be a whole number from ${min} to ${max}.`); return value; }
function object(value) { requireValue(value && typeof value === 'object' && !Array.isArray(value), 'Send a JSON object.'); return value; }
const now = () => new Date().toISOString();
function isoDate(value,label,optional=false){if(optional&&(value===null||value===''))return null;const result=text(value,label,10,10);requireValue(/^\d{4}-\d{2}-\d{2}$/.test(result),`${label} must use YYYY-MM-DD.`);const [year,month,day]=result.split('-').map(Number),date=new Date(Date.UTC(year,month-1,day));requireValue(date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day,`${label} must use YYYY-MM-DD.`);return result;}
function localeCode(value){try{return Intl.getCanonicalLocales([text(value,'Content locale',2,255)])[0];}catch{throw new InputError('Choose a valid BCP 47 content locale, such as en-US, es-419, or ur-PK.');}}
function channelLanguage(locale){return new Intl.Locale(locale).language;}
function editionSlots(family,state='not_started'){return family.channels.map((channel,index)=>({language:channel.language,locale:channel.locale,state:index===0&&state==='storyboard'?'script_ready':state==='storyboard'?'awaiting_translation':state}));}

const COMPETITOR_LIMIT=10;
function competitorChannel(value){
  const raw=text(value,'Competitor channel',3,300);
  let reference=raw;
  if(/^https?:\/\//i.test(raw)){
    let url;try{url=new URL(raw);}catch{throw new InputError('Enter a valid YouTube competitor channel URL.');}
    requireValue(url.protocol==='https:'&&['youtube.com','www.youtube.com','m.youtube.com'].includes(url.hostname)&&!url.port&&!url.username&&!url.password,'Competitor links must be https://www.youtube.com channel URLs.');
    let parts;try{parts=decodeURIComponent(url.pathname).split('/').filter(Boolean);}catch{throw new InputError('A competitor channel URL contains invalid encoding.');}
    requireValue(parts.length>=1,'Use a competitor channel URL such as https://www.youtube.com/@handle.');
    if(parts[0].startsWith('@'))reference=parts[0];
    else if(parts[0]==='channel'&&parts[1])reference=parts[1];
    else if(parts[0]==='user'&&parts[1])reference=`user:${parts[1]}`;
    else throw new InputError('Use a competitor channel link in the @handle, /channel/UC… or /user/ form. Video, playlist and /c/ links are not channel identities.');
  }
  if(/^UC[A-Za-z0-9_-]{22}$/.test(reference))return {kind:'channel_id',value:reference,url:`https://www.youtube.com/channel/${reference}`};
  if(/^@[\p{L}\p{N}_.\-·]{3,100}$/u.test(reference))return {kind:'handle',value:reference,url:`https://www.youtube.com/${reference}`};
  const user=reference.match(/^user:([A-Za-z0-9_.-]{1,100})$/);
  if(user)return {kind:'username',value:user[1],url:`https://www.youtube.com/user/${user[1]}`};
  throw new InputError(`"${raw.slice(0,80)}" is not a YouTube channel. Use an @handle, a UC… channel ID or a channel URL.`);
}
function competitorList(value){
  if(value===undefined||value===null)return [];
  requireValue(Array.isArray(value)&&value.length<=COMPETITOR_LIMIT,`Add at most ${COMPETITOR_LIMIT} competitor channels.`);
  const seen=new Set(),result=[];
  for(const item of value){const channel=competitorChannel(item),key=`${channel.kind}:${channel.value.toLowerCase()}`;requireValue(!seen.has(key),`Competitor ${channel.value} is listed twice.`);seen.add(key);result.push(channel);}
  return result;
}

function familyInput(input) {
  object(input);
  requireValue(Array.isArray(input.countries) && input.countries.length >= 1 && input.countries.length <= 12, 'Enter 1-12 target countries.');
  const countries = [...new Set(input.countries.map(c => text(c, 'Country', 2, 60)))];
  const timezone = text(input.timezone, 'Time zone', 3, 80);
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(); } catch { throw new InputError('Choose a valid IANA time zone, such as Asia/Karachi.'); }
  requireValue(Number.isFinite(input.monthlyBudget) && input.monthlyBudget >= 0 && input.monthlyBudget <= 100000, 'Monthly budget must be between $0 and $100,000.');
  const budgetCents = Math.round(input.monthlyBudget * 100);
  requireValue(Math.abs(input.monthlyBudget * 100 - budgetCents) < .00001, 'Use no more than two decimal places for the budget.');
  let locales;
  if(input.locales!==undefined){requireValue(Array.isArray(input.locales)&&input.locales.length>=1&&input.locales.length<=10,'Choose 1-10 content languages for this family.');locales=input.locales.map(localeCode);requireValue(new Set(locales).size===locales.length,'Choose each content locale once.');}
  else {const englishLocale=choice(input.englishLocale,['en-US','en-GB'],'English locale'),spanishLocale=choice(input.spanishLocale,['es-ES','es-MX','es-419'],'Spanish locale');locales=[englishLocale,spanishLocale,'it-IT'];}
  return {
    name: text(input.name, 'Family name', 2, 80), tier: choice(input.tier, ['A', 'B', 'Custom'], 'audience tier'), countries,
    audience: text(input.audience, 'Audience description', 10, 2000), niche: text(input.niche || '', 'Niche hypothesis', 0, 1000),
    locales,primaryLocale:locales[0],
    timezone, budgetCents, cadence: integer(input.cadence, 1, 14, 'Original videos per week'),
    format: choice(input.format, ['long-form', 'shorts'], 'format'),
    competitors: competitorList(input.competitors),
    tokenBudget:{
      monthlyLimit:integer(input.monthlyTokenLimit??100000,0,10000000,'Monthly token limit'),
      scriptJobLimit:integer(input.scriptTokenLimit??6000,1000,8000,'Script job token limit'),
      researchJobLimit:integer(input.researchTokenLimit??4000,1000,8000,'Research job token limit')
    },
  };
}

function contentInput(input) {
  object(input);
  const title = text(input.title, 'Title', 3, 100);
  const result = validateYouTubeMetadata({title, description: '', defaultLanguage:'en'});
  requireValue(result.valid, result.errors.join(' '));
  const kind = choice(input.kind, ['factual', 'fiction'], 'content type');
  requireValue(Array.isArray(input.sources) && input.sources.length <= 30, 'Provide at most 30 sources.');
  const sources = input.sources.map(source => {
    object(source);
    const url = text(source.url, 'Source URL', 8, 2000);
    try { const parsed = new URL(url); requireValue(['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password, 'Use an HTTP(S) source URL without credentials.'); }
    catch (error) { if (error instanceof InputError) throw error; throw new InputError('Enter a valid source URL.'); }
    return {title: text(source.title, 'Source title', 2, 200), url,
      permission: choice(source.permission, ['unreviewed', 'permitted'], 'source permission'), notes: text(source.notes || '', 'Source notes', 0, 3000)};
  });
  return {title, kind, angle: text(input.angle || '', 'Original angle', 0, 3000), hook: text(input.hook || '', 'Hook', 0, 1000),
    script: text(input.script || '', 'Primary-language script', 0, 50000), sources, rightsConfirmed: input.rightsConfirmed === true};
}

function researchEvidenceInput(input,defaults={}) {
  object(input);
  const url=text(input.url,'Evidence URL',8,2000);try{const parsed=new URL(url);requireValue(parsed.protocol==='https:'&&!parsed.username&&!parsed.password,'Use an HTTPS evidence URL without credentials.');}catch(error){if(error instanceof InputError)throw error;throw new InputError('Enter a valid HTTPS evidence URL.');}
  const publishedAt=isoDate(input.publishedAt,'Published date',true),accessedAt=isoDate(input.accessedAt||defaults.accessedAt||now().slice(0,10),'Access date'),expiresAt=isoDate(input.expiresAt||defaults.expiresAt||new Date(Date.now()+30*86400000).toISOString().slice(0,10),'Expiry date');
  requireValue(!publishedAt||publishedAt<=accessedAt,'Published date cannot be after the access date.');requireValue(accessedAt<=expiresAt,'Access date cannot be after the expiry date.');requireValue(accessedAt<=now().slice(0,10),'Access date cannot be in the future.');
  return {familyId:text(input.familyId,'Family ID',1,80),title:text(input.title,'Evidence title',2,200),url,publisher:text(input.publisher,'Publisher',2,120),publishedAt,accessedAt,expiresAt,permission:choice(input.permission,['unreviewed','permitted'],'evidence permission'),analysisMode:choice(input.analysisMode,['display_only','brief_synthesis_permitted'],'analysis mode'),notes:text(input.notes||'','Evidence notes',10,3000),rightsNotes:text(input.rightsNotes||'','Rights notes',10,2000)};
}

function voiceProfileInput(input) {
  object(input);
  const boundedNumber=(value,min,max,label)=>{requireValue(Number.isFinite(value)&&value>=min&&value<=max,`${label} must be between ${min} and ${max}.`);return value;};
  const provider=choice(input.provider,['openai','elevenlabs'],'voice provider');
  const providerId=(value,label)=>{const result=text(value,label,1,128);requireValue(/^[A-Za-z0-9_.:-]+$/.test(result),`${label} contains unsupported characters.`);return result;};
  requireValue(input.consentConfirmed===true,'Confirm voice consent and authority before saving this profile.');
  requireValue(input.commercialUseConfirmed===true,'Confirm commercial-use rights before saving this profile.');
  requireValue(Array.isArray(input.lexicon)&&input.lexicon.length<=100,'Provide at most 100 pronunciation entries.');
  const entries=input.lexicon.map(entry=>{object(entry);return {term:text(entry.term,'Pronunciation term',1,80),replacement:text(entry.replacement,'Pronunciation replacement',1,120),notes:text(entry.notes||'','Pronunciation notes',0,500)};});
  requireValue(new Set(entries.map(entry=>entry.term.toLocaleLowerCase())).size===entries.length,'Each pronunciation term may appear once.');
  const pace=boundedNumber(input.pace,.25,4,'Pace');
  if(provider==='elevenlabs')requireValue(pace>=.7&&pace<=1.2,'ElevenLabs pace must be between 0.7 and 1.2.');
  return {
    name:text(input.name,'Voice profile name',2,80),connectorId:text(input.connectorId,'Connector ID',1,80),connectorRevision:integer(input.connectorRevision,1,1000000,'Connector revision'),provider,
    model:providerId(input.model,'Voice model'),voiceId:providerId(input.voiceId,'Voice ID'),voiceVersion:text(input.voiceVersion||'provider-current','Voice version',1,120),
    rights:{ownershipBasis:choice(input.ownershipBasis,['provider_stock_voice','self_owned_voice','licensed_custom_voice'],'voice ownership basis'),rightsHolder:text(input.rightsHolder,'Voice rights holder',2,160),consentConfirmed:true,commercialUseConfirmed:true,evidenceReference:text(input.evidenceReference,'Consent or license evidence reference',10,1000),termsReviewedAt:isoDate(input.termsReviewedAt,'Voice terms review date')},
    delivery:{pace,energy:integer(input.energy,0,100,'Energy'),emotion:choice(input.emotion,['neutral','warm','serious','energetic','calm','dramatic'],'emotion'),pauseScale:boundedNumber(input.pauseScale,.5,2,'Pause scale'),emphasis:integer(input.emphasis,0,100,'Emphasis'),instructions:text(input.instructions||'','Delivery instructions',0,2000),stability:boundedNumber(input.stability??.5,0,1,'Stability'),similarity:boundedNumber(input.similarity??.75,0,1,'Similarity'),style:boundedNumber(input.style??0,0,1,'Style')},
    lexicon:{entries},budget:{monthlyCharacterLimit:integer(input.monthlyCharacterLimit,1,100000000,'Monthly voice character limit'),maxCharactersPerAudition:integer(input.maxCharactersPerAudition,1,100000,'Per-audition character limit'),priceCentsPerMillionCharacters:integer(input.priceCentsPerMillionCharacters??0,0,10000000,'Voice price per million characters')}
  };
}
function reviewIssues(content,format='long-form',locale='en') {
  const issues = [];
  if (content.angle.length < 20) issues.push('Explain the original angle in at least 20 characters.');
  if (content.hook.length < 10) issues.push('Add a specific opening hook.');
  const quality=assessScriptQuality({script:content.script,hook:content.hook},format,locale);
  issues.push(...quality.issues);
  if (!content.rightsConfirmed) issues.push('Confirm that you reviewed factual accuracy, originality and media/story rights.');
  if (content.kind === 'factual' && !content.sources.length) issues.push('A factual draft needs at least one reviewed source.');
  if (content.sources.some(s => s.permission !== 'permitted' || s.notes.length < 10)) issues.push('Review each source permission and add a note explaining its supporting evidence and permitted use.');
  return issues;
}

function storyboard(content,locale='en') {
  const script=String(content.script||'').trim();let words;
  try{words=[...new Intl.Segmenter(locale,{granularity:'word'}).segment(script)].filter(item=>item.isWordLike);}catch{words=[...script.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)].map(match=>({index:match.index,segment:match[0],isWordLike:true}));}
  const count = Math.min(6, words.length);
  const purposes = ['Opening image', 'Introduce the problem', 'Explain the mechanism', 'Show an original example', 'Reveal the consequence', 'Deliver the payoff'];
  let elapsed = 0;
  return Array.from({length:count}, (_, i) => {
    const start=i===0?0:words[Math.floor(i*words.length/count)].index,end=i===count-1?script.length:words[Math.floor((i+1)*words.length/count)].index,narration=script.slice(start,end).trim();
    const duration = Math.round(wordCount(narration,locale) / 145 * 60 * 10) / 10;
    const scene = {id: `${content.id}-v${content.revision}-s${i+1}`, order:i+1, purpose:purposes[i], narration,
      durationEstimateSeconds:duration, startEstimateSeconds:Math.round(elapsed*10)/10,
      visualDirection: 'To write: a relevant original visual metaphor, action, camera movement and transition.',
      delivery:'To direct: accent, emotion, emphasis and pauses.', status:'planning_only'};
    elapsed += duration;
    return scene;
  });
}

class Store {
  constructor(filename,{artifactRoot=null}={}) {
    if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), {recursive:true});
    this.artifactRoot=artifactRoot?path.resolve(artifactRoot):filename===':memory:'?null:path.dirname(path.resolve(filename));
    this.artifactVerificationCache=new Map();
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    this.db.exec('BEGIN IMMEDIATE');
    try {this.db.exec(`
      CREATE TABLE IF NOT EXISTS families(id TEXT PRIMARY KEY, name_key TEXT UNIQUE NOT NULL, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS content(id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id), payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, content_id TEXT NOT NULL REFERENCES content(id), revision INTEGER NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL, input TEXT, result TEXT, error TEXT, attempts INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(content_id,revision,type));
      CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, created_at TEXT NOT NULL, message TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS connectors(id TEXT PRIMARY KEY, name_key TEXT UNIQUE NOT NULL, payload TEXT NOT NULL, secret BLOB);
      CREATE TABLE IF NOT EXISTS script_candidates(id TEXT PRIMARY KEY, job_id TEXT UNIQUE NOT NULL REFERENCES jobs(id), content_id TEXT NOT NULL REFERENCES content(id), family_id TEXT NOT NULL REFERENCES families(id), content_revision INTEGER NOT NULL, family_revision INTEGER NOT NULL, connector_id TEXT NOT NULL, connector_revision INTEGER NOT NULL, language TEXT NOT NULL, locale TEXT NOT NULL, prompt_version INTEGER NOT NULL, status TEXT NOT NULL, payload TEXT NOT NULL, quality TEXT, usage TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS llm_usage(job_id TEXT PRIMARY KEY REFERENCES jobs(id), family_id TEXT NOT NULL REFERENCES families(id), kind TEXT NOT NULL, period_month TEXT NOT NULL, status TEXT NOT NULL, reserved_tokens INTEGER NOT NULL, prompt_tokens INTEGER, completion_tokens INTEGER, total_tokens INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS research_evidence(id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id), revision INTEGER NOT NULL, archived INTEGER NOT NULL DEFAULT 0, payload TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS research_jobs(id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id), family_revision INTEGER NOT NULL, brief_date TEXT NOT NULL, connector_id TEXT NOT NULL, connector_revision INTEGER NOT NULL, prompt_version INTEGER NOT NULL, evidence_hash TEXT NOT NULL, status TEXT NOT NULL, input TEXT NOT NULL, result TEXT, error TEXT, attempts INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(family_id,brief_date,connector_id,connector_revision,prompt_version,evidence_hash));
      CREATE TABLE IF NOT EXISTS topic_briefs(id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES research_jobs(id), family_id TEXT NOT NULL REFERENCES families(id), brief_date TEXT NOT NULL, rank INTEGER NOT NULL, status TEXT NOT NULL, evidence_snapshot TEXT NOT NULL, payload TEXT NOT NULL, quality TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(job_id,rank));
      CREATE TABLE IF NOT EXISTS research_usage(job_id TEXT PRIMARY KEY REFERENCES research_jobs(id), family_id TEXT NOT NULL REFERENCES families(id), kind TEXT NOT NULL, period_month TEXT NOT NULL, status TEXT NOT NULL, reserved_tokens INTEGER NOT NULL, prompt_tokens INTEGER, completion_tokens INTEGER, total_tokens INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS voice_profiles(id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id), revision INTEGER NOT NULL, locale TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(family_id,revision));
      CREATE TABLE IF NOT EXISTS voice_jobs(id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id), content_id TEXT NOT NULL REFERENCES content(id), content_revision INTEGER NOT NULL, profile_id TEXT NOT NULL REFERENCES voice_profiles(id), profile_revision INTEGER NOT NULL, connector_id TEXT NOT NULL, connector_revision INTEGER NOT NULL, status TEXT NOT NULL, input TEXT NOT NULL, error TEXT, attempts INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS voice_usage(job_id TEXT PRIMARY KEY REFERENCES voice_jobs(id), family_id TEXT NOT NULL REFERENCES families(id), period_month TEXT NOT NULL, status TEXT NOT NULL, reserved_characters INTEGER NOT NULL, settled_characters INTEGER, estimated_cost_cents INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS voice_auditions(id TEXT PRIMARY KEY, job_id TEXT UNIQUE NOT NULL REFERENCES voice_jobs(id), family_id TEXT NOT NULL REFERENCES families(id), content_id TEXT NOT NULL REFERENCES content(id), content_revision INTEGER NOT NULL, profile_id TEXT NOT NULL REFERENCES voice_profiles(id), profile_revision INTEGER NOT NULL, locale TEXT NOT NULL, status TEXT NOT NULL, artifact TEXT NOT NULL, analysis TEXT NOT NULL, provider TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS voice_approvals(id TEXT PRIMARY KEY, audition_id TEXT NOT NULL REFERENCES voice_auditions(id), family_id TEXT NOT NULL REFERENCES families(id), content_id TEXT NOT NULL REFERENCES content(id), content_revision INTEGER NOT NULL, profile_id TEXT NOT NULL REFERENCES voice_profiles(id), profile_revision INTEGER NOT NULL, status TEXT NOT NULL, approved_by TEXT NOT NULL, comparison_notes TEXT NOT NULL, approved_at TEXT NOT NULL, revoked_at TEXT, revocation_reason TEXT);
      CREATE TABLE IF NOT EXISTS production_invalidations(id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id), content_id TEXT NOT NULL REFERENCES content(id), approval_id TEXT, stage TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL);
      `);
      if (!this.db.prepare("PRAGMA table_info(jobs)").all().some(column=>column.name==='input')) this.db.exec('ALTER TABLE jobs ADD COLUMN input TEXT');
      if (!this.db.prepare("PRAGMA table_info(jobs)").all().some(column=>column.name==='attempts')) this.db.exec('ALTER TABLE jobs ADD COLUMN attempts INTEGER NOT NULL DEFAULT 1');
      if (!this.db.prepare("PRAGMA table_info(script_candidates)").all().some(column=>column.name==='quality')) this.db.exec('ALTER TABLE script_candidates ADD COLUMN quality TEXT');
      // ponytail: synchronous transactions on one local host; migrate before multi-host workers.
      for(const row of this.db.prepare("SELECT j.*,c.family_id FROM jobs j JOIN content c ON c.id=j.content_id LEFT JOIN llm_usage u ON u.job_id=j.id WHERE j.type LIKE 'hermes_script:%' AND u.job_id IS NULL AND j.status NOT IN ('queued','blocked_budget','cancelled','stale','retried')").all()){
        const family=this.family(row.family_id),candidate=this.db.prepare('SELECT * FROM script_candidates WHERE job_id=?').get(row.id),at=now();let usage=null,quality=null;
        try{usage=candidate?JSON.parse(candidate.usage):null;}catch{}
        const total=usage?.totalTokens,prompt=usage?.promptTokens,completion=usage?.completionTokens,valid=Number.isSafeInteger(total)&&total>=0&&(prompt===null||Number.isSafeInteger(prompt)&&prompt>=0&&prompt<=total)&&(completion===null||Number.isSafeInteger(completion)&&completion>=0&&completion<=total)&&(prompt===null||completion===null||prompt+completion===total);
        if(candidate){try{quality=assessScriptQuality(JSON.parse(candidate.payload),family.format,candidate.locale||family.primaryLocale);}catch{}this.db.prepare('UPDATE script_candidates SET status=?,quality=? WHERE id=?').run(valid&&quality?.passed?'available':'quality_failed',quality?JSON.stringify(quality):null,candidate.id);}
        const period=this.tokenPeriod(family,new Date(row.created_at)),reservation=valid?total:family.tokenBudget.scriptJobLimit;
        this.db.prepare("INSERT INTO llm_usage(job_id,family_id,kind,period_month,status,reserved_tokens,prompt_tokens,completion_tokens,total_tokens,created_at,updated_at) VALUES(?,?,? ,?,?,?,?,?,?,?,?)").run(row.id,family.id,'script',period,valid?'settled':'unknown',reservation,valid?prompt:null,valid?completion:null,valid?total:null,row.created_at||at,at);
        this.db.prepare('UPDATE jobs SET status=?,error=?,updated_at=? WHERE id=?').run(valid&&quality?.passed?'completed':valid?'quality_failed':'usage_unknown',valid&&quality&&!quality.passed?quality.issues.join(' '):valid?null:'Legacy Hermes usage could not be verified; retry deliberately after setting an explicit family token budget.',at,row.id);
      }
      for(const row of this.db.prepare('SELECT id,payload FROM content').all()){
        const content=JSON.parse(row.payload),family=this.family(content.familyId),current=Array.isArray(content.editions)?content.editions:[],mapped=editionSlots(family).map(slot=>{const previous=current.find(item=>item.locale===slot.locale||(!item.locale&&item.language===slot.language));return previous?{...slot,state:previous.state}:slot;}),invalid=content.state==='approved'&&reviewIssues(content,family.format,family.primaryLocale).length;let changed=JSON.stringify(current)!==JSON.stringify(mapped);
        content.editions=mapped;
        if(invalid){content.state='draft';content.approvedAt=null;content.approvedFamilyRevision=null;content.scenes=[];content.editions=editionSlots(family);this.db.prepare("UPDATE jobs SET status='cancelled',error='Previously approved content no longer passes the current quality policy.',updated_at=? WHERE content_id=? AND type='storyboard' AND status IN ('queued','running')").run(now(),row.id);changed=true;}
        if(changed){content.updatedAt=now();this.db.prepare('UPDATE content SET payload=? WHERE id=?').run(JSON.stringify(content),row.id);}
      }
      this.db.prepare("UPDATE jobs SET status='queued', updated_at=? WHERE status='running' AND type='storyboard'").run(now());
      this.db.prepare("UPDATE jobs SET status='interrupted', error='Hermes stopped during an unknown request. Review before retrying to avoid duplicate spend.', updated_at=? WHERE status='running' AND type LIKE 'hermes_script:%'").run(now());
      this.db.prepare("UPDATE llm_usage SET status='unknown',updated_at=? WHERE status='reserved'").run(now());
      this.db.prepare("UPDATE research_jobs SET status='interrupted', error='Hermes stopped during an unknown research request. Review before retrying to avoid duplicate spend.', updated_at=? WHERE status='running'").run(now());
      this.db.prepare("UPDATE research_usage SET status='unknown',updated_at=? WHERE status='reserved'").run(now());
      this.db.prepare("UPDATE voice_jobs SET status='interrupted',error='Voice generation stopped after admission. Provider spend may be unknown; review before deliberate retry.',updated_at=? WHERE status='running'").run(now());
      this.db.prepare("UPDATE voice_usage SET status='unknown',updated_at=? WHERE status='reserved'").run(now());
      this.db.exec('PRAGMA user_version=6; COMMIT');
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  close() { this.db.close(); }
  transaction(fn) { this.db.exec('BEGIN IMMEDIATE'); try { const result=fn();this.db.exec('COMMIT');return result; } catch(error) { this.db.exec('ROLLBACK');throw error; } }
  event(message) { this.db.prepare('INSERT INTO events(created_at,message) VALUES(?,?)').run(now(),message); }
  hydrateFamily(f){const legacyChannels=Array.isArray(f.channels)&&f.channels.length?f.channels:[{language:'en',locale:f.englishLocale||'en-US',connection:'not_connected'},{language:'es',locale:f.spanishLocale||'es-419',connection:'not_connected'},{language:'it',locale:'it-IT',connection:'not_connected'}],locales=Array.isArray(f.locales)&&f.locales.length?f.locales:legacyChannels.map(channel=>channel.locale),channels=locales.map(locale=>{const previous=legacyChannels.find(channel=>channel.locale===locale);return {language:channelLanguage(locale),locale,connection:previous?.connection||'not_connected'};});return {...f,competitors:Array.isArray(f.competitors)?f.competitors:[],locales,primaryLocale:f.primaryLocale||locales[0],channels,tokenBudget:f.tokenBudget||{monthlyLimit:0,scriptJobLimit:6000,researchJobLimit:4000}};}
  families() { return this.db.prepare('SELECT payload FROM families ORDER BY rowid DESC').all().map(r=>this.hydrateFamily(JSON.parse(r.payload))); }
  contents() { return this.db.prepare('SELECT payload FROM content ORDER BY rowid DESC').all().map(r=>{const c=JSON.parse(r.payload),family=this.family(c.familyId);return {...c,reviewIssues:reviewIssues(c,family.format,family.primaryLocale)};}); }
  family(id) { const r=this.db.prepare('SELECT payload FROM families WHERE id=?').get(id);requireValue(r,'Family not found.',404);return this.hydrateFamily(JSON.parse(r.payload)); }
  content(id) { const r=this.db.prepare('SELECT payload FROM content WHERE id=?').get(id);requireValue(r,'Draft not found.',404);return JSON.parse(r.payload); }
  version(record, expected) { requireValue(Number.isSafeInteger(expected) && expected === record.revision, 'This item changed in another tab. Reload before saving.',409); }
  saveFamily(input, id) {
    const values=familyInput(input);
    return this.transaction(()=>{
      const old=id?this.family(id):null;
      if(old)this.version(old,input.revision);
      else requireValue(this.families().filter(f=>!f.archived).length<15,'The current portfolio limit is 15 active families.');
      const key=values.name.toLowerCase();
      const duplicate=this.db.prepare('SELECT id FROM families WHERE name_key=?').get(key);
      requireValue(!duplicate || duplicate.id===id,'That family name is already used.',409);
      const family={...values,id:old?.id||randomUUID(),revision:(old?.revision||0)+1,createdAt:old?.createdAt||now(),updatedAt:now(),archived:old?.archived||false,
        channels:values.locales.map(locale=>({language:channelLanguage(locale),locale,connection:old?.channels.find(channel=>channel.locale===locale)?.connection||'not_connected'}))};
      this.db.prepare('INSERT INTO families(id,name_key,payload) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name_key=excluded.name_key,payload=excluded.payload').run(family.id,key,JSON.stringify(family));
      const primaryChanged=old&&old.primaryLocale!==family.primaryLocale,formatChanged=old&&old.format!==family.format,localesChanged=old&&JSON.stringify(old.locales)!==JSON.stringify(family.locales);
      if(formatChanged||primaryChanged){
        for(const row of this.db.prepare('SELECT id,payload FROM content WHERE family_id=?').all(family.id)){
          const content=JSON.parse(row.payload);
          content.state='draft';content.approvedAt=null;content.approvedFamilyRevision=null;content.scenes=[];
          content.editions=editionSlots(family);content.updatedAt=now();
          this.db.prepare('UPDATE content SET payload=? WHERE id=?').run(JSON.stringify(content),row.id);
        }
        this.db.prepare("UPDATE jobs SET status='cancelled',error='Family format or primary language changed; approve the script again before storyboarding.',updated_at=? WHERE content_id IN (SELECT id FROM content WHERE family_id=?) AND type='storyboard' AND status IN ('queued','running')").run(now(),family.id);
        this.invalidateVoiceForFamily(family.id,'Family format or primary locale changed; approved narration and downstream artifacts are stale.');
      }else if(localesChanged){
        for(const row of this.db.prepare('SELECT id,payload FROM content WHERE family_id=?').all(family.id)){const content=JSON.parse(row.payload),existing=new Map((content.editions||[]).map(edition=>[edition.locale||edition.language,edition]));content.editions=family.channels.map((channel,index)=>{const prior=existing.get(channel.locale)||existing.get(channel.language);return {language:channel.language,locale:channel.locale,state:prior?.state||(content.scenes?.length?(index===0?'script_ready':'awaiting_translation'):'not_started')};});content.updatedAt=now();this.db.prepare('UPDATE content SET payload=? WHERE id=?').run(JSON.stringify(content),row.id);}
      }
      this.event(`${old?'Updated':'Created'} channel family: ${family.name}`);return family;
    });
  }
  archiveFamily(id, input) {
    object(input);return this.transaction(()=>{
      const f=this.family(id);this.version(f,input.revision);requireValue(typeof input.archived==='boolean','Archive state must be true or false.');
      if(!input.archived && f.archived)requireValue(this.families().filter(x=>!x.archived).length<15,'The current portfolio limit is 15 active families.');
      f.archived=input.archived;f.revision++;f.updatedAt=now();
      this.db.prepare('UPDATE families SET payload=? WHERE id=?').run(JSON.stringify(f),id);if(f.archived)this.invalidateVoiceForFamily(f.id,'Family archived; approved narration and downstream artifacts are inactive.');this.event(`${f.archived?'Archived':'Restored'} family: ${f.name}`);return f;
    });
  }
  researchEvidence(id){const row=this.db.prepare('SELECT * FROM research_evidence WHERE id=?').get(id);requireValue(row,'Research evidence not found.',404);return {...JSON.parse(row.payload),id:row.id,familyId:row.family_id,revision:row.revision,archived:!!row.archived,createdAt:row.created_at,updatedAt:row.updated_at};}
  researchEvidenceList(){return this.db.prepare('SELECT id FROM research_evidence ORDER BY created_at DESC,rowid DESC').all().map(row=>this.researchEvidence(row.id));}
  saveResearchEvidence(input,id){object(input);return this.transaction(()=>{const old=id?this.researchEvidence(id):null;if(old)this.version(old,input.revision);const values=researchEvidenceInput(input,{accessedAt:old?.accessedAt,expiresAt:old?.expiresAt});if(old){requireValue(values.familyId===old.familyId,'Research evidence cannot move between families.');requireValue(values.accessedAt===old.accessedAt,'The saved access date is provenance and cannot change; create a new evidence revision from a fresh record instead.');}const family=this.family(values.familyId);requireValue(!family.archived,'Restore this family before changing research evidence.',409);const at=now(),record={...values};this.db.prepare('INSERT INTO research_evidence(id,family_id,revision,archived,payload,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload,updated_at=excluded.updated_at').run(old?.id||randomUUID(),values.familyId,(old?.revision||0)+1,old?.archived?1:0,JSON.stringify(record),old?.createdAt||at,at);const saved=this.db.prepare('SELECT id FROM research_evidence WHERE family_id=? ORDER BY rowid DESC LIMIT 1').get(values.familyId);this.event(`${old?'Revised':'Saved'} research evidence: ${values.title}`);return this.researchEvidence(old?.id||saved.id);});}
  archiveResearchEvidence(id,input){object(input);return this.transaction(()=>{const record=this.researchEvidence(id);this.version(record,input.revision);requireValue(typeof input.archived==='boolean','Archive state must be true or false.');this.db.prepare('UPDATE research_evidence SET revision=?,archived=?,updated_at=? WHERE id=?').run(record.revision+1,input.archived?1:0,now(),id);this.event(`${input.archived?'Archived':'Restored'} research evidence: ${record.title}`);return this.researchEvidence(id);});}
  persistContent(content) {this.db.prepare('INSERT INTO content(id,family_id,payload) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(content.id,content.familyId,JSON.stringify(content));return content;}
  saveContent(input,id) {
    const values=contentInput(input);
    return this.transaction(()=>{
      const old=id?this.content(id):null;if(old)this.version(old,input.revision);
      const familyId=old?.familyId||text(input.familyId,'Family ID',1,80);
      if(old && input.familyId!==undefined)requireValue(input.familyId===familyId,'A draft cannot move between families.');
      const family=this.family(familyId);requireValue(!family.archived,'Restore this family before editing its drafts.',409);
      const content={...values,id:old?.id||randomUUID(),familyId,revision:(old?.revision||0)+1,state:'draft',createdAt:old?.createdAt||now(),updatedAt:now(),approvedAt:null,approvedFamilyRevision:null,scenes:[],
        editions:editionSlots(family)};
      this.persistContent(content);if(old)this.invalidateVoiceForContent(content.id,'Approved source script changed; narration and downstream production artifacts must be rebuilt.');this.event(`${old?'Revised':'Created'} draft: ${content.title}${old?' (previous approval, narration and storyboard cleared)':''}`);return content;
    });
  }
  reviewContent(id,input) {
    object(input);return this.transaction(()=>{
      const c=this.content(id);this.version(c,input.revision);requireValue(!this.family(c.familyId).archived,'Restore this family before reviewing drafts.',409);
      const action=choice(input.action,['submit','approve','return'],'review action');
      if(action==='return'){requireValue(c.state==='in_review','Only a draft in review can be returned.',409);c.state='draft';}
      else {
        requireValue(c.state===(action==='submit'?'draft':'in_review'),'The draft is not in the required review state.',409);
        const family=this.family(c.familyId),issues=reviewIssues(c,family.format,family.primaryLocale);requireValue(!issues.length,issues.join(' '));
        c.state=action==='submit'?'in_review':'approved';if(action==='approve'){c.approvedAt=now();c.approvedFamilyRevision=this.family(c.familyId).revision;}
      }
      // Revision identifies content, not a workflow click. Editing always invalidates approval.
      c.updatedAt=now();this.persistContent(c);this.event(`${action==='submit'?'Submitted for review':action==='approve'?'Approved script':'Returned to draft'}: ${c.title}`);return c;
    });
  }
  queueStoryboard(id,input) {
    object(input);return this.transaction(()=>{
      const c=this.content(id);this.version(c,input.revision);const family=this.family(c.familyId);requireValue(c.state==='approved'&&reviewIssues(c,family.format,family.primaryLocale).length===0,'Approve the current script before preparing a storyboard.',409);
      requireValue(!family.archived,'Restore this family before preparing work.',409);
      const existing=this.db.prepare("SELECT * FROM jobs WHERE content_id=? AND revision=? AND type='storyboard'").get(id,c.revision);
      if(existing)return existing;
      const jobId=randomUUID(),at=now();
      this.db.prepare("INSERT INTO jobs(id,content_id,revision,type,status,created_at,updated_at) VALUES(?,?,?,'storyboard','queued',?,?)").run(jobId,id,c.revision,at,at);
      this.event(`Queued storyboard plan: ${c.title}`);return this.db.prepare('SELECT * FROM jobs WHERE id=?').get(jobId);
    });
  }
  processNextJob() {
    return this.transaction(()=>{
      const j=this.db.prepare("SELECT * FROM jobs WHERE status='queued' AND type='storyboard' ORDER BY created_at,id LIMIT 1").get();if(!j)return null;
      this.db.prepare("UPDATE jobs SET status='running',updated_at=? WHERE id=?").run(now(),j.id);
      try {
      const c=this.content(j.content_id);
      const family=this.family(c.familyId);
      if(c.revision!==j.revision || c.state!=='approved' || reviewIssues(c,family.format,family.primaryLocale).length>0 || family.archived) {
        this.db.prepare("UPDATE jobs SET status='cancelled',error=?,updated_at=? WHERE id=?").run('Draft changed or family archived before processing.',now(),j.id);return j.id;
      }
      const scenes=storyboard(c,family.primaryLocale);c.scenes=scenes;c.editions=editionSlots(family,'storyboard');
      this.persistContent(c);
      this.db.prepare("UPDATE jobs SET status='completed',result=?,updated_at=? WHERE id=?").run(JSON.stringify({sceneCount:scenes.length,planningOnly:true}),now(),j.id);
      this.event(`Prepared ${scenes.length}-scene planning scaffold: ${c.title}`);return j.id;
      } catch(error) {
        this.db.prepare("UPDATE jobs SET status='failed',error=?,updated_at=? WHERE id=?").run('Planning failed. Revise the draft and prepare a new version after the issue is resolved.',now(),j.id);
        this.event(`Storyboard job failed: ${j.id}`);
        return j.id;
      }
    });
  }
  queueHermesScript(id,input) {
    object(input);return this.transaction(()=>{
      const c=this.content(id);this.version(c,input.revision);const f=this.family(c.familyId);
      requireValue(!f.archived,'Restore this family before asking Hermes to prepare a script.',409);
      requireValue(typeof input.connectorId==='string'&&input.connectorId.length>0,'Choose a Hermes connector.');
      requireValue(Number.isSafeInteger(input.connectorRevision)&&input.connectorRevision>0,'Reload the Hermes connector before generating.');
      if(c.kind==='factual')requireValue(c.sources.length>0&&c.sources.every(source=>source.permission==='permitted'&&source.notes.length>=10),'Hermes needs permitted evidence notes for factual script generation.');
      const policy=scriptPolicy(f.format),basePromptInput={family:{name:f.name,audience:f.audience,locale:f.primaryLocale,countries:f.countries,niche:f.niche,format:f.format},content:{title:c.title,kind:c.kind,angle:c.angle,hook:c.hook},sources:c.sources.slice(0,10).map((source,index)=>({id:`S${index+1}`,title:source.title,url:source.url,notes:source.notes}))};
      const {promptInput,maxCompletionTokens}=deriveCompletionLimit(basePromptInput,f.tokenBudget.scriptJobLimit,policy.maxCompletionTokens);
      requireValue(maxCompletionTokens>=500,'Increase the script job token limit for this format.');
      const scope={contentRevision:c.revision,familyRevision:f.revision,connectorId:input.connectorId,connectorRevision:input.connectorRevision,promptVersion:2,tokenLimit:f.tokenBudget.scriptJobLimit,promptInput};
      const type=`hermes_script:${input.connectorId}:${input.connectorRevision}:f${f.revision}:p2`;
      const existing=this.db.prepare('SELECT * FROM jobs WHERE content_id=? AND revision=? AND type=?').get(id,c.revision,type);if(existing)return existing;
      const jobId=randomUUID(),at=now();
      this.db.prepare("INSERT INTO jobs(id,content_id,revision,type,status,input,created_at,updated_at) VALUES(?,?,?,?,'queued',?,?,?)").run(jobId,id,c.revision,type,JSON.stringify(scope),at,at);
      this.event(`Queued Hermes ${f.primaryLocale} script candidate: ${c.title}`);return this.db.prepare('SELECT * FROM jobs WHERE id=?').get(jobId);
    });
  }
  retryHermesScriptJob(jobId,input) {
    object(input);return this.transaction(()=>{
      const previous=this.db.prepare('SELECT * FROM jobs WHERE id=?').get(jobId);
      requireValue(previous&&previous.type.startsWith('hermes_script:'),'Hermes job not found.',404);
      requireValue(['failed','stale','cancelled','interrupted','quality_failed','usage_unknown','budget_violation','blocked_budget'].includes(previous.status),'Only a terminal Hermes job can be retried deliberately.',409);
      const priorUsage=this.db.prepare('SELECT status FROM llm_usage WHERE job_id=?').get(previous.id),usageUnknown=['interrupted','usage_unknown'].includes(previous.status)||['unknown','usage_unknown'].includes(priorUsage?.status),paidAttempt=['settled','unknown','usage_unknown','budget_violation'].includes(priorUsage?.status);
      requireValue(!usageUnknown||input.confirmInterrupted===true,'Confirm the interrupted request before retrying because its provider outcome is unknown.',409);
      requireValue(!paidAttempt||previous.attempts<3,'This Hermes job reached the maximum of 3 paid attempts.',409);
      const c=this.content(previous.content_id);this.version(c,input.revision);const f=this.family(c.familyId);
      requireValue(!f.archived,'Restore this family before retrying Hermes.',409);
      requireValue(typeof input.connectorId==='string'&&input.connectorId.length>0,'Choose a Hermes connector.');
      requireValue(Number.isSafeInteger(input.connectorRevision)&&input.connectorRevision>0,'Reload the Hermes connector before retrying.');
      if(c.kind==='factual')requireValue(c.sources.length>0&&c.sources.every(source=>source.permission==='permitted'&&source.notes.length>=10),'Hermes needs permitted evidence notes for factual script generation.');
      const policy=scriptPolicy(f.format),basePromptInput={family:{name:f.name,audience:f.audience,locale:f.primaryLocale,countries:f.countries,niche:f.niche,format:f.format},content:{title:c.title,kind:c.kind,angle:c.angle,hook:c.hook},sources:c.sources.slice(0,10).map((source,index)=>({id:`S${index+1}`,title:source.title,url:source.url,notes:source.notes}))};
      const {promptInput,maxCompletionTokens}=deriveCompletionLimit(basePromptInput,f.tokenBudget.scriptJobLimit,policy.maxCompletionTokens);
      requireValue(maxCompletionTokens>=500,'Increase the script job token limit for this format.');
      const scope={contentRevision:c.revision,familyRevision:f.revision,connectorId:input.connectorId,connectorRevision:input.connectorRevision,promptVersion:2,tokenLimit:f.tokenBudget.scriptJobLimit,promptInput};
      const attempts=paidAttempt?previous.attempts+1:previous.attempts,type=`hermes_script:${input.connectorId}:${input.connectorRevision}:f${f.revision}:p2:attempt${attempts}:${randomUUID()}`,id=randomUUID(),at=now();
      this.db.prepare("INSERT INTO jobs(id,content_id,revision,type,status,input,attempts,created_at,updated_at) VALUES(?,?,?,?,'queued',?,?,?,?)").run(id,c.id,c.revision,type,JSON.stringify(scope),attempts,at,at);
      this.db.prepare("UPDATE jobs SET status='retried',updated_at=? WHERE id=?").run(at,previous.id);
      this.event(`Deliberately retried Hermes ${f.primaryLocale} script candidate (attempt ${attempts}/3): ${c.title}`);return this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id);
    });
  }
  tokenPeriod(family,at=new Date()) {
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:family.timezone,year:'numeric',month:'2-digit'}).formatToParts(at).map(part=>[part.type,part.value]));
    return `${parts.year}-${parts.month}`;
  }
  localDay(family,at=new Date()){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:family.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(at).map(part=>[part.type,part.value]));return `${parts.year}-${parts.month}-${parts.day}`;}
  usageSummary(familyId) {
    const family=this.family(familyId),period=this.tokenPeriod(family);
    const rows=[...this.db.prepare('SELECT * FROM llm_usage WHERE family_id=? AND period_month=? ORDER BY created_at').all(familyId,period),...this.db.prepare('SELECT * FROM research_usage WHERE family_id=? AND period_month=? ORDER BY created_at').all(familyId,period)];
    const settledTokens=rows.filter(row=>row.status==='settled').reduce((sum,row)=>sum+row.total_tokens,0);
    const reservedTokens=rows.filter(row=>row.status!=='settled').reduce((sum,row)=>sum+Math.max(row.reserved_tokens||0,row.total_tokens||0),0);
    return {familyId,period,monthlyLimit:family.tokenBudget.monthlyLimit,settledTokens,reservedTokens,remainingTokens:Math.max(0,family.tokenBudget.monthlyLimit-settledTokens-reservedTokens)};
  }
  hermesConnectorCurrent(scope) {
    const row=this.db.prepare('SELECT payload,secret FROM connectors WHERE id=?').get(scope.connectorId);if(!row||!row.secret)return false;
    const connector=JSON.parse(row.payload);
    return connector.provider==='hermes'&&connector.revision===scope.connectorRevision&&connector.test?.status==='passed';
  }
  claimHermesScriptJob() {
    return this.transaction(()=>{
      const job=this.db.prepare("SELECT * FROM jobs WHERE status='queued' AND type LIKE 'hermes_script:%' ORDER BY created_at,id LIMIT 1").get();if(!job)return null;
      const scope=JSON.parse(job.input),c=this.content(job.content_id),f=this.family(c.familyId);
      if(c.revision!==scope.contentRevision||f.revision!==scope.familyRevision||f.archived||!this.hermesConnectorCurrent(scope)){
        this.db.prepare("UPDATE jobs SET status='stale',error='Content, family, or tested Hermes connector is no longer current before generation.',updated_at=? WHERE id=?").run(now(),job.id);return null;
      }
      const period=this.tokenPeriod(f),summary=this.usageSummary(f.id),reservation=scope.tokenLimit;
      if(!Number.isSafeInteger(reservation)||reservation<1||summary.settledTokens+summary.reservedTokens+reservation>f.tokenBudget.monthlyLimit){
        this.db.prepare("UPDATE jobs SET status='blocked_budget',error='The family monthly token limit cannot reserve this script job. Increase the explicit token limit or wait for the next family-local month.',updated_at=? WHERE id=?").run(now(),job.id);return null;
      }
      const at=now();
      this.db.prepare("INSERT INTO llm_usage(job_id,family_id,kind,period_month,status,reserved_tokens,created_at,updated_at) VALUES(?,?,? ,?,'reserved',?,?,?)").run(job.id,f.id,'script',period,reservation,at,at);
      this.db.prepare("UPDATE jobs SET status='running',updated_at=? WHERE id=? AND status='queued'").run(at,job.id);
      return {...job,status:'running',scope};
    });
  }
  completeHermesScriptJob(jobId,result) {
    return this.transaction(()=>{
      const job=this.db.prepare('SELECT * FROM jobs WHERE id=?').get(jobId);requireValue(job&&job.status==='running','Hermes job is not running.',409);
      const scope=JSON.parse(job.input),c=this.content(job.content_id),f=this.family(c.familyId),at=now();
      if(c.revision!==scope.contentRevision||f.revision!==scope.familyRevision||f.archived||!this.hermesConnectorCurrent(scope)){this.db.prepare("UPDATE jobs SET status='stale',error='Hermes completed, but its input scope or tested connector changed. Candidate was not attached.',updated_at=? WHERE id=?").run(at,jobId);this.db.prepare("UPDATE llm_usage SET status='unknown',updated_at=? WHERE job_id=?").run(at,jobId);return null;}
      const usage=result?.usage,total=usage?.totalTokens,prompt=usage?.promptTokens,completion=usage?.completionTokens;
      const validTotal=Number.isSafeInteger(total)&&total>=0;
      const validParts=(prompt===null||Number.isSafeInteger(prompt)&&prompt>=0&&prompt<=total)&&(completion===null||Number.isSafeInteger(completion)&&completion>=0&&completion<=total)&&(prompt===null||completion===null||prompt+completion===total);
      if(!validTotal||!validParts||total>scope.tokenLimit){
        const status=validTotal&&total>scope.tokenLimit?'budget_violation':'usage_unknown';
        const message=status==='budget_violation'?'Hermes reported token use above the script job limit. The result is blocked.':'Hermes did not report valid token usage. The result is blocked and the reservation remains charged.';
        this.db.prepare('UPDATE llm_usage SET status=?,prompt_tokens=?,completion_tokens=?,total_tokens=?,updated_at=? WHERE job_id=?').run(status==='usage_unknown'?'unknown':status,Number.isSafeInteger(prompt)?prompt:null,Number.isSafeInteger(completion)?completion:null,validTotal?total:null,at,jobId);
        this.db.prepare('UPDATE jobs SET status=?,error=?,updated_at=? WHERE id=?').run(status,message,at,jobId);return null;
      }
      const quality=result.quality||assessScriptQuality(result.candidate,f.format,f.primaryLocale),candidateStatus=quality.passed?'available':'quality_failed',jobStatus=quality.passed?'completed':'quality_failed',id=randomUUID();
      this.db.prepare("INSERT INTO script_candidates(id,job_id,content_id,family_id,content_revision,family_revision,connector_id,connector_revision,language,locale,prompt_version,status,payload,quality,usage,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id,jobId,c.id,f.id,c.revision,f.revision,scope.connectorId,scope.connectorRevision,channelLanguage(f.primaryLocale),f.primaryLocale,scope.promptVersion,candidateStatus,JSON.stringify(result.candidate),JSON.stringify(quality),JSON.stringify(usage),at);
      this.db.prepare("UPDATE llm_usage SET status='settled',prompt_tokens=?,completion_tokens=?,total_tokens=?,updated_at=? WHERE job_id=?").run(prompt,completion,total,at,jobId);
      this.db.prepare('UPDATE jobs SET status=?,result=?,error=?,updated_at=? WHERE id=?').run(jobStatus,JSON.stringify({candidateId:id,usage,quality}),quality.passed?null:quality.issues.join(' '),at,jobId);
      this.event(`${quality.passed?'Hermes prepared':'Hermes returned a quality-blocked'} ${f.primaryLocale} script candidate for review: ${c.title}`);return this.scriptCandidate(id);
    });
  }
  failHermesScriptJob(jobId,message='Hermes generation failed. Review the connector and retry deliberately.',{usageUnknown=false}={}) {
    return this.transaction(()=>{const at=now();this.db.prepare("UPDATE jobs SET status=?,error=?,updated_at=? WHERE id=? AND status='running'").run(usageUnknown?'interrupted':'failed',message,at,jobId);this.db.prepare(`UPDATE llm_usage SET status=?,reserved_tokens=CASE WHEN ? THEN reserved_tokens ELSE 0 END,updated_at=? WHERE job_id=?`).run(usageUnknown?'unknown':'released',usageUnknown?1:0,at,jobId);});
  }
  scriptCandidate(id){const row=this.db.prepare('SELECT * FROM script_candidates WHERE id=?').get(id);requireValue(row,'Script candidate not found.',404);const payload=JSON.parse(row.payload),family=this.family(row.family_id),quality=assessScriptQuality(payload,family.format,row.locale),job=this.db.prepare('SELECT status FROM jobs WHERE id=?').get(row.job_id),status=quality.passed&&row.locale===family.primaryLocale&&row.status==='available'&&job?.status==='completed'?'available':'quality_failed';return {id:row.id,jobId:row.job_id,contentId:row.content_id,familyId:row.family_id,contentRevision:row.content_revision,familyRevision:row.family_revision,connectorId:row.connector_id,connectorRevision:row.connector_revision,language:row.language,locale:row.locale,promptVersion:row.prompt_version,status,payload,quality,usage:JSON.parse(row.usage),createdAt:row.created_at};}
  scriptCandidates(){return this.db.prepare('SELECT id FROM script_candidates ORDER BY created_at DESC,rowid DESC').all().map(row=>this.scriptCandidate(row.id));}
  queueResearchBrief(familyId,input){
    object(input);return this.transaction(()=>{
      const family=this.family(familyId);this.version(family,input.familyRevision);requireValue(!family.archived,'Restore this family before preparing research.',409);
      const briefDate=isoDate(input.briefDate,'Brief date');
      requireValue(briefDate===this.localDay(family),'Daily briefs can only be prepared for the current family-local day.');
      requireValue(typeof input.connectorId==='string'&&input.connectorId.length>0,'Choose a Hermes connector.');requireValue(Number.isSafeInteger(input.connectorRevision)&&input.connectorRevision>0,'Reload the Hermes connector before preparing research.');
      requireValue(Array.isArray(input.evidence)&&input.evidence.length>=1&&input.evidence.length<=20,'Choose 1-20 evidence records.');
      const selected=input.evidence.map(item=>{object(item);const evidence=this.researchEvidence(text(item.id,'Evidence ID',1,80));this.version(evidence,item.revision);requireValue(evidence.familyId===family.id,'Every evidence record must belong to this family.');requireValue(!evidence.archived,'Archived evidence cannot be synthesized.');requireValue(evidence.permission==='permitted'&&evidence.analysisMode==='brief_synthesis_permitted','Only permitted evidence approved for brief synthesis may be used.');requireValue(evidence.expiresAt>=briefDate,'Expired evidence cannot be used for this brief date.');return evidence;});
      requireValue(new Set(selected.map(item=>item.id)).size===selected.length,'Choose each evidence record once.');
      selected.sort((left,right)=>left.id.localeCompare(right.id));
      const snapshot=selected.map((item,index)=>({id:`S${index+1}`,recordId:item.id,revision:item.revision,title:item.title,url:item.url,publisher:item.publisher,publishedAt:item.publishedAt,accessedAt:item.accessedAt,expiresAt:item.expiresAt,notes:item.notes,rightsNotes:item.rightsNotes}));
      const evidenceHash=createHash('sha256').update(JSON.stringify([family.revision,...snapshot.map(item=>[item.recordId,item.revision])])).digest('hex');
      const basePromptInput={family:{name:family.name,audience:family.audience,countries:family.countries,niche:family.niche,format:family.format,timezone:family.timezone,locale:family.primaryLocale},briefDate,sources:snapshot};
      const {promptInput,maxCompletionTokens}=deriveCompletionLimit(basePromptInput,family.tokenBudget.researchJobLimit,2500);requireValue(maxCompletionTokens>=500,'Increase the research job token limit.');
      const scope={familyRevision:family.revision,connectorId:input.connectorId,connectorRevision:input.connectorRevision,promptVersion:1,tokenLimit:family.tokenBudget.researchJobLimit,evidence:snapshot.map(item=>({id:item.recordId,revision:item.revision})),promptInput};
      const existing=this.db.prepare('SELECT * FROM research_jobs WHERE family_id=? AND brief_date=? AND connector_id=? AND connector_revision=? AND prompt_version=1 AND evidence_hash=?').get(family.id,briefDate,input.connectorId,input.connectorRevision,evidenceHash);if(existing)return existing;
      const id=randomUUID(),at=now();this.db.prepare("INSERT INTO research_jobs(id,family_id,family_revision,brief_date,connector_id,connector_revision,prompt_version,evidence_hash,status,input,created_at,updated_at) VALUES(?,?,?,?,?,?,1,?,'queued',?,?,?)").run(id,family.id,family.revision,briefDate,input.connectorId,input.connectorRevision,evidenceHash,JSON.stringify(scope),at,at);this.event(`Queued daily research brief for ${family.name}: ${briefDate}`);return this.db.prepare('SELECT * FROM research_jobs WHERE id=?').get(id);
    });
  }
  retryResearchBrief(jobId,input){
    object(input);return this.transaction(()=>{
      const previous=this.db.prepare('SELECT * FROM research_jobs WHERE id=?').get(jobId);requireValue(previous,'Research job not found.',404);
      requireValue(['failed','stale','interrupted','quality_failed','usage_unknown','budget_violation','blocked_budget'].includes(previous.status),'Only a terminal research job can be retried deliberately.',409);
      const priorUsage=this.db.prepare('SELECT status FROM research_usage WHERE job_id=?').get(previous.id),usageUnknown=['interrupted','usage_unknown'].includes(previous.status)||['unknown','usage_unknown'].includes(priorUsage?.status),paidAttempt=['settled','unknown','usage_unknown','budget_violation'].includes(priorUsage?.status);
      requireValue(!usageUnknown||input.confirmInterrupted===true,'Confirm the interrupted research request before retrying because its provider outcome is unknown.',409);
      requireValue(!paidAttempt||previous.attempts<3,'This research job reached the maximum of 3 paid attempts.',409);
      const oldScope=JSON.parse(previous.input),family=this.family(previous.family_id);this.version(family,input.familyRevision);
      requireValue(previous.brief_date===this.localDay(family),'A prior-day research job cannot be retried as today’s brief. Queue a fresh daily brief.');
      requireValue(!family.archived,'Archived families cannot create research briefs.');
      requireValue(typeof input.connectorId==='string'&&typeof input.connectorRevision==='number','Choose the current tested Hermes connector.');
      const sources=oldScope.evidence.map(reference=>{const current=this.researchEvidence(reference.id);requireValue(current.revision===reference.revision,'Research evidence changed. Queue a fresh daily brief instead.',409);requireValue(current.familyId===family.id&&!current.archived&&current.permission==='permitted'&&current.analysisMode==='brief_synthesis_permitted','Research evidence is no longer eligible for synthesis.',409);requireValue(current.expiresAt>=previous.brief_date,'Research evidence expired for this brief date. Queue a fresh daily brief with current evidence.',409);return current;});
      const basePromptInput={family:{name:family.name,audience:family.audience,countries:family.countries,niche:family.niche,format:family.format,timezone:family.timezone,locale:family.primaryLocale},briefDate:previous.brief_date,sources:sources.map((item,index)=>({id:`S${index+1}`,recordId:item.id,revision:item.revision,title:item.title,url:item.url,publisher:item.publisher,publishedAt:item.publishedAt,accessedAt:item.accessedAt,expiresAt:item.expiresAt,notes:item.notes,rightsNotes:item.rightsNotes}))};
      const {promptInput,maxCompletionTokens}=deriveCompletionLimit(basePromptInput,family.tokenBudget.researchJobLimit,2500);requireValue(maxCompletionTokens>=500,'Increase the research job token limit.');
      const id=randomUUID(),at=now(),attempts=paidAttempt?previous.attempts+1:previous.attempts,evidenceHash=`${previous.evidence_hash}:retry:${id}`,scope={familyRevision:family.revision,connectorId:input.connectorId,connectorRevision:input.connectorRevision,promptVersion:1,tokenLimit:family.tokenBudget.researchJobLimit,evidence:oldScope.evidence,promptInput};
      this.db.prepare("INSERT INTO research_jobs(id,family_id,family_revision,brief_date,connector_id,connector_revision,prompt_version,evidence_hash,status,input,attempts,created_at,updated_at) VALUES(?,?,?,?,?,?,1,?,'queued',?,?,?,?)").run(id,family.id,family.revision,previous.brief_date,input.connectorId,input.connectorRevision,evidenceHash,JSON.stringify(scope),attempts,at,at);
      this.db.prepare("UPDATE research_jobs SET status='retried',updated_at=? WHERE id=?").run(at,previous.id);this.event(`Deliberately requeued daily research brief for ${family.name}: attempt ${attempts} of 3.`);return this.db.prepare('SELECT * FROM research_jobs WHERE id=?').get(id);
    });
  }
  researchScopeCurrent(job,scope){const family=this.family(job.family_id),today=this.localDay(family);return job.brief_date===today&&family.revision===scope.familyRevision&&!family.archived&&this.hermesConnectorCurrent(scope)&&scope.evidence.every(item=>{try{const current=this.researchEvidence(item.id);return current.revision===item.revision&&!current.archived&&current.permission==='permitted'&&current.analysisMode==='brief_synthesis_permitted'&&current.expiresAt>=today;}catch{return false;}});}
  claimResearchBrief(){return this.transaction(()=>{const job=this.db.prepare("SELECT * FROM research_jobs WHERE status='queued' ORDER BY created_at,id LIMIT 1").get();if(!job)return null;const scope=JSON.parse(job.input),family=this.family(job.family_id);if(!this.researchScopeCurrent(job,scope)){this.db.prepare("UPDATE research_jobs SET status='stale',error='Family, evidence, or tested Hermes connector changed before research generation.',updated_at=? WHERE id=?").run(now(),job.id);return null;}const summary=this.usageSummary(family.id),reservation=scope.tokenLimit;if(!Number.isSafeInteger(reservation)||summary.settledTokens+summary.reservedTokens+reservation>family.tokenBudget.monthlyLimit){this.db.prepare("UPDATE research_jobs SET status='blocked_budget',error='The family monthly token limit cannot reserve this research job.',updated_at=? WHERE id=?").run(now(),job.id);return null;}const at=now(),period=this.tokenPeriod(family);this.db.prepare("INSERT INTO research_usage(job_id,family_id,kind,period_month,status,reserved_tokens,created_at,updated_at) VALUES(?,?,? ,?,'reserved',?,?,?)").run(job.id,family.id,'research_brief',period,reservation,at,at);this.db.prepare("UPDATE research_jobs SET status='running',updated_at=? WHERE id=?").run(at,job.id);return {...job,status:'running',scope};});}
  topicSimilarity(a,b,locale='en'){const tokens=value=>{const input=String(value).toLocaleLowerCase();try{return new Set([...new Intl.Segmenter(locale,{granularity:'word'}).segment(input)].filter(item=>item.isWordLike).map(item=>item.segment));}catch{return new Set(input.match(/[\p{L}\p{N}]+/gu)||[]);}},left=tokens(a),right=tokens(b);if(!left.size||!right.size)return 0;const common=[...left].filter(token=>right.has(token)).length;return common/(left.size+right.size-common);}
  completeResearchBrief(jobId,response){return this.transaction(()=>{const job=this.db.prepare('SELECT * FROM research_jobs WHERE id=?').get(jobId);requireValue(job&&job.status==='running','Research job is not running.',409);const scope=JSON.parse(job.input),at=now();if(!this.researchScopeCurrent(job,scope)){this.db.prepare("UPDATE research_jobs SET status='stale',error='Research completed, but its family, evidence, or connector scope changed. No brief was attached.',updated_at=? WHERE id=?").run(at,jobId);this.db.prepare("UPDATE research_usage SET status='unknown',updated_at=? WHERE job_id=?").run(at,jobId);return null;}const usage=response?.usage,total=usage?.totalTokens,prompt=usage?.promptTokens,completion=usage?.completionTokens,valid=Number.isSafeInteger(total)&&total>=0&&(prompt===null||Number.isSafeInteger(prompt)&&prompt>=0&&prompt<=total)&&(completion===null||Number.isSafeInteger(completion)&&completion>=0&&completion<=total)&&(prompt===null||completion===null||prompt+completion===total);if(!valid||total>scope.tokenLimit){const status=valid?'budget_violation':'usage_unknown';this.db.prepare('UPDATE research_usage SET status=?,prompt_tokens=?,completion_tokens=?,total_tokens=?,updated_at=? WHERE job_id=?').run(status==='usage_unknown'?'unknown':status,Number.isSafeInteger(prompt)?prompt:null,Number.isSafeInteger(completion)?completion:null,Number.isSafeInteger(total)?total:null,at,jobId);this.db.prepare('UPDATE research_jobs SET status=?,error=?,updated_at=? WHERE id=?').run(status,status==='budget_violation'?'Hermes reported token use above the research job limit.':'Hermes did not report valid research token usage.',at,jobId);return null;}const previous=[...this.contents().filter(item=>item.familyId===job.family_id).map(item=>item.title),...this.topicBriefs().filter(item=>item.familyId===job.family_id).map(item=>item.payload.title)],created=[];let anyFailed=false;response.result.topics.forEach((topic,index)=>{const peers=[...previous,...response.result.topics.slice(0,index).map(item=>item.title)],duplicate=peers.some(title=>this.topicSimilarity(title,topic.title,scope.promptInput.family.locale)>=.8),quality={policyVersion:1,passed:!duplicate,issues:duplicate?['Topic duplicates or closely overlaps existing work in this family.']:[]},status=quality.passed?'review_only':'quality_failed',id=randomUUID();anyFailed||=duplicate;this.db.prepare('INSERT INTO topic_briefs(id,job_id,family_id,brief_date,rank,status,evidence_snapshot,payload,quality,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,job.id,job.family_id,job.brief_date,index+1,status,JSON.stringify(scope.promptInput.sources),JSON.stringify(topic),JSON.stringify(quality),at);created.push(this.topicBrief(id));});this.db.prepare("UPDATE research_usage SET status='settled',prompt_tokens=?,completion_tokens=?,total_tokens=?,updated_at=? WHERE job_id=?").run(prompt,completion,total,at,jobId);const status=anyFailed?'quality_failed':'completed';this.db.prepare('UPDATE research_jobs SET status=?,result=?,error=?,updated_at=? WHERE id=?').run(status,JSON.stringify({decision:response.result.decision,rationale:response.result.rationale,briefIds:created.map(item=>item.id),usage}),anyFailed?'One or more topic briefs duplicated existing work and are blocked.':null,at,jobId);this.event(`${response.result.topics.length?`Prepared ${response.result.topics.length}`:'Recorded no strong'} daily topic brief${response.result.topics.length===1?'':'s'} for review.`);return created;});}
  failResearchBrief(jobId,message='Hermes research generation failed. Review the evidence and connector before retrying.',{usageUnknown=false}={}){return this.transaction(()=>{const at=now();this.db.prepare("UPDATE research_jobs SET status=?,error=?,updated_at=? WHERE id=? AND status='running'").run(usageUnknown?'interrupted':'failed',message,at,jobId);this.db.prepare('UPDATE research_usage SET status=?,reserved_tokens=CASE WHEN ? THEN reserved_tokens ELSE 0 END,updated_at=? WHERE job_id=?').run(usageUnknown?'unknown':'released',usageUnknown?1:0,at,jobId);});}
  researchJobs(){return this.db.prepare('SELECT * FROM research_jobs ORDER BY created_at DESC,rowid DESC LIMIT 100').all().map(job=>{let result=null;try{result=job.result?JSON.parse(job.result):null;}catch{}return {...job,input:undefined,result:undefined,decision:result?.decision??null,rationale:result?.rationale??null};});}
  topicBrief(id){const row=this.db.prepare('SELECT * FROM topic_briefs WHERE id=?').get(id);requireValue(row,'Topic brief not found.',404);return {id:row.id,jobId:row.job_id,familyId:row.family_id,briefDate:row.brief_date,rank:row.rank,status:row.status,evidenceSnapshot:JSON.parse(row.evidence_snapshot),payload:JSON.parse(row.payload),quality:JSON.parse(row.quality),createdAt:row.created_at};}
  topicBriefs(){return this.db.prepare('SELECT id FROM topic_briefs ORDER BY brief_date DESC,rank,rowid DESC').all().map(row=>this.topicBrief(row.id));}
  usageRows(){const map=row=>({jobId:row.job_id,familyId:row.family_id,kind:row.kind,period:row.period_month,status:row.status,reservedTokens:row.reserved_tokens,promptTokens:row.prompt_tokens,completionTokens:row.completion_tokens,totalTokens:row.total_tokens,createdAt:row.created_at,updatedAt:row.updated_at});return [...this.db.prepare('SELECT * FROM llm_usage').all(),...this.db.prepare('SELECT * FROM research_usage').all()].map(map).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
  voiceProfiles(familyId=null){const rows=this.db.prepare(`SELECT * FROM voice_profiles ${familyId?'WHERE family_id=?':''} ORDER BY family_id,revision`).all(...(familyId?[familyId]:[]));return rows.map(row=>({...JSON.parse(row.payload),id:row.id,familyId:row.family_id,revision:row.revision,locale:row.locale,createdAt:row.created_at}));}
  voiceProfile(id){const row=this.db.prepare('SELECT * FROM voice_profiles WHERE id=?').get(id);requireValue(row,'Voice profile not found.',404);return {...JSON.parse(row.payload),id:row.id,familyId:row.family_id,revision:row.revision,locale:row.locale,createdAt:row.created_at};}
  voiceConnector(id,revision,provider){const row=this.db.prepare('SELECT * FROM connectors WHERE id=?').get(id);requireValue(row&&row.secret,'Choose a voice connector with a saved credential.',409);const slot=JSON.parse(row.payload);requireValue(slot.revision===revision&&slot.provider===provider&&slot.test?.status==='passed','Choose the current tested voice connector revision.',409);return slot;}
  invalidateVoiceForContent(contentId,reason){const approvals=this.db.prepare("SELECT * FROM voice_approvals WHERE content_id=? AND status='approved'").all(contentId);for(const approval of approvals){const at=now();this.db.prepare("UPDATE voice_approvals SET status='revoked',revoked_at=?,revocation_reason=? WHERE id=?").run(at,reason,approval.id);this.invalidateProduction(approval,reason,at);}}
  invalidateVoiceForFamily(familyId,reason){for(const row of this.db.prepare("SELECT content_id FROM voice_approvals WHERE family_id=? AND status='approved' GROUP BY content_id").all(familyId))this.invalidateVoiceForContent(row.content_id,reason);}
  verifyVoiceArtifact(audition){
    if(!this.artifactRoot)return {ok:false,reason:'Voice artifact verification root is unavailable.'};
    try{
      const artifact=audition?.artifact;object(artifact);requireValue(typeof artifact.relativePath==='string'&&!path.isAbsolute(artifact.relativePath)&&!artifact.relativePath.split(/[\\/]/).includes('..'),'Voice artifact path is invalid.');
      const filename=path.resolve(this.artifactRoot,artifact.relativePath),boundary=this.artifactRoot.endsWith(path.sep)?this.artifactRoot:`${this.artifactRoot}${path.sep}`;requireValue(filename.startsWith(boundary),'Voice artifact is outside the local artifact root.');
      const stat=fs.statSync(filename);requireValue(stat.isFile()&&stat.size===artifact.sizeBytes,'Voice artifact size no longer matches its immutable record.');
      const cacheKey=`${filename}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`,cached=this.artifactVerificationCache.get(cacheKey);let sha256=cached;
      if(!sha256){sha256=createHash('sha256').update(fs.readFileSync(filename)).digest('hex');this.artifactVerificationCache.clear();this.artifactVerificationCache.set(cacheKey,sha256);}
      requireValue(sha256===artifact.sha256,'Voice artifact checksum no longer matches its immutable record.');return {ok:true,filename,stat};
    }catch(error){return {ok:false,reason:error instanceof InputError?error.message:'Voice artifact file is unavailable.'};}
  }
  invalidateProduction(approval,reason,at=now()){for(const stage of ['scene_timing','captions','audio_mix','qc','packaging','render'])this.db.prepare('INSERT INTO production_invalidations(id,family_id,content_id,approval_id,stage,reason,created_at) VALUES(?,?,?,?,?,?,?)').run(randomUUID(),approval.family_id,approval.content_id,approval.id,stage,reason,at);}
  saveVoiceProfile(familyId,input){object(input);return this.transaction(()=>{const family=this.family(familyId);this.version(family,input.familyRevision);requireValue(!family.archived,'Restore this family before configuring its voice.');const current=this.voiceProfiles(familyId).at(-1),expected=current?.revision||0;requireValue(input.revision===expected,'The voice profile changed in another tab. Reload before saving.',409);const values=voiceProfileInput(input);this.voiceConnector(values.connectorId,values.connectorRevision,values.provider);const id=randomUUID(),revision=expected+1,createdAt=now(),profile={...values,familyRevision:family.revision,lexicon:{versionId:randomUUID(),entries:values.lexicon.entries}};this.db.prepare('INSERT INTO voice_profiles(id,family_id,revision,locale,payload,created_at) VALUES(?,?,?,?,?,?)').run(id,familyId,revision,family.primaryLocale,JSON.stringify(profile),createdAt);if(current)this.invalidateVoiceForFamily(familyId,'Voice profile changed; downstream artifacts require a fresh approved narration.');this.event(`${current?'Revised':'Created'} voice profile for ${family.name}: ${values.name} v${revision}`);return {...profile,id,familyId,revision,locale:family.primaryLocale,createdAt};});}
  voiceScopeCurrent(job,scope){try{const family=this.family(job.family_id),content=this.content(job.content_id),current=this.voiceProfiles(family.id).at(-1);this.voiceConnector(scope.connectorId,scope.connectorRevision,scope.provider);return !family.archived&&content.state==='approved'&&content.revision===scope.contentRevision&&family.primaryLocale===scope.locale&&current?.id===scope.profileId&&current.revision===scope.profileRevision;}catch{return false;}}
  queueVoiceAudition(contentId,input){object(input);return this.transaction(()=>{const content=this.content(contentId);this.version(content,input.contentRevision);requireValue(content.state==='approved','A current approved primary-locale script is required before creating voice auditions.',409);const family=this.family(content.familyId);requireValue(!family.archived,'Restore this family before creating voice auditions.');const profile=this.voiceProfile(text(input.profileId,'Voice profile ID',1,80));requireValue(profile.familyId===family.id&&profile.revision===input.profileRevision,'Choose the current voice profile revision.',409);const current=this.voiceProfiles(family.id).at(-1);requireValue(current?.id===profile.id&&profile.locale===family.primaryLocale,'Choose the current primary-locale voice profile.',409);requireValue(input.connectorId===profile.connectorId&&input.connectorRevision===profile.connectorRevision,'Use the connector revision recorded by the voice profile.');this.voiceConnector(profile.connectorId,profile.connectorRevision,profile.provider);let rendered=content.script;for(const entry of profile.lexicon.entries)rendered=rendered.split(entry.term).join(entry.replacement);const characterCount=rendered.length;requireValue(characterCount<=profile.budget.maxCharactersPerAudition,`This narration contains ${characterCount} provider characters, above the profile limit of ${profile.budget.maxCharactersPerAudition}.`,409);const estimatedSeconds=wordCount(content.script,family.primaryLocale)/(145*profile.delivery.pace)*60,scope={familyId:family.id,familyRevision:family.revision,contentId:content.id,contentRevision:content.revision,locale:family.primaryLocale,script:content.script,scriptHash:createHash('sha256').update(content.script).digest('hex'),profileId:profile.id,profileRevision:profile.revision,connectorId:profile.connectorId,connectorRevision:profile.connectorRevision,provider:profile.provider,model:profile.model,voiceId:profile.voiceId,voiceVersion:profile.voiceVersion,rights:profile.rights,delivery:profile.delivery,lexicon:profile.lexicon,budget:profile.budget,characterCount,expectedDuration:{min:Math.max(1,estimatedSeconds*.45),max:estimatedSeconds*2.1},providerInstructions:`${profile.delivery.instructions} Emotion: ${profile.delivery.emotion}. Energy: ${profile.delivery.energy}/100. Pause scale: ${profile.delivery.pauseScale}. Emphasis: ${profile.delivery.emphasis}/100.`.trim()};const matching=this.db.prepare('SELECT j.*,u.status AS usage_status FROM voice_jobs j LEFT JOIN voice_usage u ON u.job_id=j.id WHERE j.content_id=? AND j.content_revision=? AND j.profile_id=? AND j.profile_revision=? AND j.connector_id=? AND j.connector_revision=? ORDER BY j.created_at DESC,j.rowid DESC').all(content.id,content.revision,profile.id,profile.revision,profile.connectorId,profile.connectorRevision),latest=matching[0],paidAttempts=matching.filter(item=>['settled','unknown'].includes(item.usage_status)).length;if(latest&&['queued','running'].includes(latest.status))return latest;requireValue(!latest||!['failed','stale','interrupted','validation_failed','blocked_budget'].includes(latest.status),'Use the deliberate retry control for the existing terminal voice attempt.',409);requireValue(paidAttempts<3,'This exact script and voice profile reached the maximum of 3 paid auditions.',409);const id=randomUUID(),at=now(),attempts=paidAttempts+1;this.db.prepare("INSERT INTO voice_jobs(id,family_id,content_id,content_revision,profile_id,profile_revision,connector_id,connector_revision,status,input,attempts,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,'queued',?,?,?,?)").run(id,family.id,content.id,content.revision,profile.id,profile.revision,profile.connectorId,profile.connectorRevision,JSON.stringify(scope),attempts,at,at);this.event(`Queued primary-locale voice audition for ${content.title}: ${profile.name} v${profile.revision}`);return this.voiceJobs().find(item=>item.id===id);});}
  voiceJobs(){return this.db.prepare('SELECT * FROM voice_jobs ORDER BY created_at DESC,rowid DESC LIMIT 200').all().map(row=>({...row,input:undefined}));}
  claimVoiceAudition(){return this.transaction(()=>{const job=this.db.prepare("SELECT * FROM voice_jobs WHERE status='queued' ORDER BY created_at,id LIMIT 1").get();if(!job)return null;const scope=JSON.parse(job.input);if(!this.voiceScopeCurrent(job,scope)){this.db.prepare("UPDATE voice_jobs SET status='stale',error='Script, voice profile, locale, or tested connector changed before generation.',updated_at=? WHERE id=?").run(now(),job.id);return null;}const family=this.family(job.family_id),period=this.tokenPeriod(family),used=this.db.prepare("SELECT COALESCE(SUM(reserved_characters),0) AS total FROM voice_usage WHERE family_id=? AND period_month=? AND status IN ('reserved','settled','unknown')").get(job.family_id,period).total;if(used+scope.characterCount>scope.budget.monthlyCharacterLimit){this.db.prepare("UPDATE voice_jobs SET status='blocked_budget',error='The family monthly voice character limit cannot reserve this audition.',updated_at=? WHERE id=?").run(now(),job.id);return null;}const at=now(),cost=Math.ceil(scope.characterCount*scope.budget.priceCentsPerMillionCharacters/1000000);this.db.prepare("INSERT INTO voice_usage(job_id,family_id,period_month,status,reserved_characters,estimated_cost_cents,created_at,updated_at) VALUES(?,?,?,'reserved',?,?,?,?)").run(job.id,job.family_id,period,scope.characterCount,cost,at,at);this.db.prepare("UPDATE voice_jobs SET status='running',updated_at=? WHERE id=?").run(at,job.id);return {...job,status:'running',scope};});}
  completeVoiceAudition(jobId,result){object(result);return this.transaction(()=>{const job=this.db.prepare('SELECT * FROM voice_jobs WHERE id=?').get(jobId);requireValue(job&&job.status==='running','Voice job is not running.',409);const scope=JSON.parse(job.input),at=now();if(!this.voiceScopeCurrent(job,scope)){this.db.prepare("UPDATE voice_jobs SET status='stale',error='Voice completed after its script, profile, locale, or connector scope changed.',updated_at=? WHERE id=?").run(at,job.id);this.db.prepare("UPDATE voice_usage SET status='unknown',updated_at=? WHERE job_id=?").run(at,job.id);return null;}object(result.artifact);object(result.analysis);object(result.provider);requireValue(typeof result.artifact.relativePath==='string'&&!path.isAbsolute(result.artifact.relativePath)&&!result.artifact.relativePath.split(/[\\/]/).includes('..'),'Voice artifact path must remain inside the local artifact root.');requireValue(/^[a-f0-9]{64}$/.test(result.artifact.sha256||'')&&Number.isSafeInteger(result.artifact.sizeBytes)&&result.artifact.sizeBytes>0,'Voice artifact evidence is invalid.');requireValue(Number.isSafeInteger(result.settledCharacters)&&result.settledCharacters===scope.characterCount,'Voice character settlement does not match the admitted request.');const status=result.analysis.passed===true?'validated':'validation_failed',auditionId=randomUUID();this.db.prepare('INSERT INTO voice_auditions(id,job_id,family_id,content_id,content_revision,profile_id,profile_revision,locale,status,artifact,analysis,provider,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(auditionId,job.id,job.family_id,job.content_id,job.content_revision,job.profile_id,job.profile_revision,scope.locale,status,JSON.stringify(result.artifact),JSON.stringify(result.analysis),JSON.stringify(result.provider),at);this.db.prepare('UPDATE voice_jobs SET status=?,error=?,updated_at=? WHERE id=?').run(status==='validated'?'completed':'validation_failed',status==='validated'?null:'Generated audio failed one or more real-audio validation checks.',at,job.id);this.db.prepare("UPDATE voice_usage SET status='settled',settled_characters=?,updated_at=? WHERE job_id=?").run(result.settledCharacters,at,job.id);this.event(`${status==='validated'?'Validated':'Blocked'} voice audition for content ${job.content_id}`);return this.voiceAudition(auditionId);});}
  failVoiceAudition(jobId,message,{usageUnknown=false}={}){return this.transaction(()=>{const job=this.db.prepare('SELECT * FROM voice_jobs WHERE id=?').get(jobId);requireValue(job&&job.status==='running','Voice job is not running.',409);const at=now();this.db.prepare('UPDATE voice_jobs SET status=?,error=?,updated_at=? WHERE id=?').run(usageUnknown?'interrupted':'failed',text(message,'Voice failure',1,1000),at,jobId);this.db.prepare("UPDATE voice_usage SET status=?,reserved_characters=CASE WHEN ? THEN reserved_characters ELSE 0 END,updated_at=? WHERE job_id=?").run(usageUnknown?'unknown':'released',usageUnknown?1:0,at,jobId);});}
  retryVoiceAudition(jobId,input){object(input);return this.transaction(()=>{const previous=this.db.prepare('SELECT * FROM voice_jobs WHERE id=?').get(jobId);requireValue(previous,'Voice job not found.',404);requireValue(['failed','stale','interrupted','validation_failed','blocked_budget'].includes(previous.status),'Only a terminal voice job can be retried deliberately.',409);const usage=this.db.prepare('SELECT status FROM voice_usage WHERE job_id=?').get(jobId),unknown=previous.status==='interrupted'||usage?.status==='unknown',paid=['settled','unknown'].includes(usage?.status);requireValue(!unknown||input.confirmInterrupted===true,'Confirm the interrupted voice request before retrying because its provider outcome is unknown.',409);requireValue(!paid||previous.attempts<3,'This voice audition reached the maximum of 3 paid attempts.',409);const scope=JSON.parse(previous.input),content=this.content(previous.content_id);this.version(content,input.contentRevision);requireValue(input.profileId===scope.profileId&&input.profileRevision===scope.profileRevision&&input.connectorId===scope.connectorId&&input.connectorRevision===scope.connectorRevision,'Retry the exact current voice scope or queue a fresh audition.');requireValue(this.voiceScopeCurrent(previous,scope),'The original voice scope is stale. Queue a fresh audition.',409);const id=randomUUID(),at=now(),attempts=paid?previous.attempts+1:previous.attempts;this.db.prepare("INSERT INTO voice_jobs(id,family_id,content_id,content_revision,profile_id,profile_revision,connector_id,connector_revision,status,input,attempts,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,'queued',?,?,?,?)").run(id,previous.family_id,previous.content_id,previous.content_revision,previous.profile_id,previous.profile_revision,previous.connector_id,previous.connector_revision,previous.input,attempts,at,at);this.db.prepare("UPDATE voice_jobs SET status='retried',updated_at=? WHERE id=?").run(at,previous.id);this.event(`Deliberately requeued voice audition: paid attempt ${attempts} of 3.`);return this.voiceJobs().find(item=>item.id===id);});}
  voiceAudition(id){const row=this.db.prepare('SELECT * FROM voice_auditions WHERE id=?').get(id);requireValue(row,'Voice audition not found.',404);const job=this.db.prepare('SELECT * FROM voice_jobs WHERE id=?').get(row.job_id),scope=JSON.parse(job.input);return {id:row.id,jobId:row.job_id,familyId:row.family_id,contentId:row.content_id,contentRevision:row.content_revision,profileId:row.profile_id,profileRevision:row.profile_revision,locale:row.locale,status:row.status,artifact:JSON.parse(row.artifact),analysis:JSON.parse(row.analysis),provider:JSON.parse(row.provider),createdAt:row.created_at,scopeCurrent:this.voiceScopeCurrent(job,scope)};}
  voiceAuditions(){return this.db.prepare('SELECT id FROM voice_auditions ORDER BY created_at DESC,rowid DESC').all().map(row=>this.voiceAudition(row.id));}
  voiceApproval(id){const row=this.db.prepare('SELECT * FROM voice_approvals WHERE id=?').get(id);requireValue(row,'Voice approval not found.',404);return {id:row.id,auditionId:row.audition_id,familyId:row.family_id,contentId:row.content_id,contentRevision:row.content_revision,profileId:row.profile_id,profileRevision:row.profile_revision,status:row.status,approvedBy:row.approved_by,comparisonNotes:row.comparison_notes,approvedAt:row.approved_at,revokedAt:row.revoked_at,revocationReason:row.revocation_reason};}
  voiceApprovals(){return this.db.prepare('SELECT id FROM voice_approvals ORDER BY approved_at DESC,rowid DESC').all().map(row=>this.voiceApproval(row.id));}
  selectVoiceAudition(auditionId,input){object(input);return this.transaction(()=>{const audition=this.voiceAudition(auditionId);requireValue(audition.status==='validated'&&audition.scopeCurrent,'Only a current audition that passed real-audio validation can be approved.',409);const integrity=this.verifyVoiceArtifact(audition);requireValue(integrity.ok,integrity.reason||'The immutable voice artifact is unavailable or changed.',409);requireValue(input.intelligibilityConfirmed===true,'Confirm intelligibility after listening to the entire narration.');const approvedBy=text(input.approvedBy,'Approver name',2,100),notes=text(input.comparisonNotes,'Comparison notes',20,2000);this.invalidateVoiceForContent(audition.contentId,'A different narration was selected; all dependent production artifacts are stale.');const id=randomUUID(),at=now();this.db.prepare("INSERT INTO voice_approvals(id,audition_id,family_id,content_id,content_revision,profile_id,profile_revision,status,approved_by,comparison_notes,approved_at) VALUES(?,?,?,?,?,?,?,'approved',?,?,?)").run(id,audition.id,audition.familyId,audition.contentId,audition.contentRevision,audition.profileId,audition.profileRevision,approvedBy,notes,at);const approval=this.db.prepare('SELECT * FROM voice_approvals WHERE id=?').get(id);this.invalidateProduction(approval,'Approved narration changed; dependent production stages must rebuild.',at);this.event(`Approved voice audition ${audition.id} after human comparison and intelligibility review.`);return this.voiceApproval(id);});}
  revokeVoiceApproval(id,input){object(input);return this.transaction(()=>{const approval=this.db.prepare('SELECT * FROM voice_approvals WHERE id=?').get(id);requireValue(approval&&approval.status==='approved','Voice approval is not active.',409);const reason=text(input.reason,'Revocation reason',10,1000),approvedBy=text(input.approvedBy,'Revoking operator',2,100),at=now();this.db.prepare("UPDATE voice_approvals SET status='revoked',revoked_at=?,revocation_reason=? WHERE id=?").run(at,`${reason} Revoked by ${approvedBy}.`,id);this.invalidateProduction(approval,reason,at);this.event(`Revoked approved narration ${id}: ${reason}`);return this.voiceApproval(id);});}
  productionInvalidations(){return this.db.prepare('SELECT * FROM production_invalidations ORDER BY created_at,rowid').all().map(row=>({id:row.id,familyId:row.family_id,contentId:row.content_id,approvalId:row.approval_id,stage:row.stage,reason:row.reason,createdAt:row.created_at}));}
  voiceHandoffs(familyId=null){return this.contents().filter(content=>(!familyId||content.familyId===familyId)&&content.state==='approved').map(content=>{const approval=this.db.prepare("SELECT id FROM voice_approvals WHERE content_id=? AND content_revision=? AND status='approved' ORDER BY approved_at DESC LIMIT 1").get(content.id,content.revision),record=approval?this.voiceApproval(approval.id):null,audition=record?this.voiceAudition(record.auditionId):null,integrity=audition?this.verifyVoiceArtifact(audition):{ok:false};return {familyId:content.familyId,contentId:content.id,contentRevision:content.revision,locale:this.family(content.familyId).primaryLocale,ready:!!(record&&audition?.scopeCurrent&&integrity.ok),blocker:!record?'Select and approve a validated narration.':!audition?.scopeCurrent?'Approved narration scope is stale.':!integrity.ok?(integrity.reason||'Approved narration artifact failed integrity verification.'):null,approvalId:record?.id||null,auditionId:audition?.id||null,artifact:audition?.artifact||null,analysis:audition?.analysis||null};});}
  voiceUsage(){return this.db.prepare('SELECT * FROM voice_usage ORDER BY created_at DESC,rowid DESC').all().map(row=>({jobId:row.job_id,familyId:row.family_id,period:row.period_month,status:row.status,reservedCharacters:row.reserved_characters,settledCharacters:row.settled_characters,estimatedCostCents:row.estimated_cost_cents,createdAt:row.created_at,updatedAt:row.updated_at}));}
  state() {return {families:this.families(),contents:this.contents(),jobs:this.db.prepare('SELECT * FROM jobs ORDER BY created_at DESC,rowid DESC LIMIT 100').all().map(job=>{let scopeCurrent=true;if(job.type.startsWith('hermes_script:'))try{const scope=JSON.parse(job.input),content=this.content(job.content_id),family=this.family(content.familyId);scopeCurrent=scope.contentRevision===content.revision&&scope.promptInput?.family?.format===family.format&&scope.promptInput?.family?.locale===family.primaryLocale;}catch{scopeCurrent=false;}return {...job,input:undefined,scopeCurrent};}),scriptCandidates:this.scriptCandidates(),researchEvidence:this.researchEvidenceList(),researchJobs:this.researchJobs(),topicBriefs:this.topicBriefs(),usage:this.usageRows(),voiceProfiles:this.voiceProfiles(),voiceJobs:this.voiceJobs(),voiceAuditions:this.voiceAuditions(),voiceApprovals:this.voiceApprovals(),voiceHandoffs:this.voiceHandoffs(),voiceUsage:this.voiceUsage(),productionInvalidations:this.productionInvalidations(),events:this.db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT 25').all()};}
  exportContent(id) {
    const c=this.content(id), f=this.family(c.familyId);
    const additional=f.locales.slice(1),localization=additional.length?`${additional.join(', ')} editions are awaiting localization. Source review is a creator attestation, not automatic verification.`:'This family has no additional language editions configured. Source review is a creator attestation, not automatic verification.';
    return {schemaVersion:2,exportedAt:now(),family:{id:f.id,name:f.name,profile:f.audience,countries:f.countries,primaryLocale:f.primaryLocale,locales:f.locales,channels:f.channels},content:c,
      limitations:['Planning document only; no media generated or uploaded.','Timing is an estimate at 145 words/minute. Scene breaks may fall inside sentences; revise before narration.',localization]};
  }
}
module.exports={competitorList,Store,InputError,reviewIssues,storyboard};
