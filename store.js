'use strict';
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { validateYouTubeMetadata } = require('./vendor/youtube-automation-agent/youtube-metadata-validator');

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
const LANGUAGES = ['en', 'es', 'it'];

function familyInput(input) {
  object(input);
  requireValue(Array.isArray(input.countries) && input.countries.length >= 1 && input.countries.length <= 12, 'Enter 1-12 target countries.');
  const countries = [...new Set(input.countries.map(c => text(c, 'Country', 2, 60)))];
  const timezone = text(input.timezone, 'Time zone', 3, 80);
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(); } catch { throw new InputError('Choose a valid IANA time zone, such as Asia/Karachi.'); }
  requireValue(Number.isFinite(input.monthlyBudget) && input.monthlyBudget >= 0 && input.monthlyBudget <= 100000, 'Monthly budget must be between $0 and $100,000.');
  const budgetCents = Math.round(input.monthlyBudget * 100);
  requireValue(Math.abs(input.monthlyBudget * 100 - budgetCents) < .00001, 'Use no more than two decimal places for the budget.');
  return {
    name: text(input.name, 'Family name', 2, 80), tier: choice(input.tier, ['A', 'B', 'Custom'], 'audience tier'), countries,
    audience: text(input.audience, 'Audience description', 10, 2000), niche: text(input.niche || '', 'Niche hypothesis', 0, 1000),
    spanishLocale: choice(input.spanishLocale, ['es-ES', 'es-MX', 'es-419'], 'Spanish locale'),
    englishLocale: choice(input.englishLocale, ['en-US', 'en-GB'], 'English locale'),
    timezone, budgetCents, cadence: integer(input.cadence, 1, 14, 'Original videos per week'),
    format: choice(input.format, ['long-form', 'shorts'], 'format'),
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
    script: text(input.script || '', 'English script', 0, 50000), sources, rightsConfirmed: input.rightsConfirmed === true};
}

function reviewIssues(content) {
  const issues = [];
  if (content.angle.length < 20) issues.push('Explain the original angle in at least 20 characters.');
  if (content.hook.length < 10) issues.push('Add a specific opening hook.');
  if (content.script.length < 80) issues.push('Add an English script of at least 80 characters.');
  if (!content.rightsConfirmed) issues.push('Confirm that you reviewed factual accuracy, originality and media/story rights.');
  if (content.kind === 'factual' && !content.sources.length) issues.push('A factual draft needs at least one reviewed source.');
  if (content.sources.some(s => s.permission !== 'permitted' || s.notes.length < 10)) issues.push('Review each source permission and add a note explaining its supporting evidence and permitted use.');
  return issues;
}

function storyboard(content) {
  const words = content.script.split(/\s+/).filter(Boolean);
  const count = Math.min(6, words.length);
  const purposes = ['Opening image', 'Introduce the problem', 'Explain the mechanism', 'Show an original example', 'Reveal the consequence', 'Deliver the payoff'];
  let elapsed = 0;
  return Array.from({length:count}, (_, i) => {
    const narration = words.slice(Math.floor(i*words.length/count), Math.floor((i+1)*words.length/count)).join(' ');
    const duration = Math.round(narration.split(/\s+/).length / 145 * 60 * 10) / 10;
    const scene = {id: `${content.id}-v${content.revision}-s${i+1}`, order:i+1, purpose:purposes[i], narration,
      durationEstimateSeconds:duration, startEstimateSeconds:Math.round(elapsed*10)/10,
      visualDirection: 'To write: a relevant original visual metaphor, action, camera movement and transition.',
      delivery:'To direct: accent, emotion, emphasis and pauses.', status:'planning_only'};
    elapsed += duration;
    return scene;
  });
}

class Store {
  constructor(filename) {
    if (filename !== ':memory:') mkdirSync(path.dirname(filename), {recursive:true});
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS families(id TEXT PRIMARY KEY, name_key TEXT UNIQUE NOT NULL, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS content(id TEXT PRIMARY KEY, family_id TEXT NOT NULL REFERENCES families(id), payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, content_id TEXT NOT NULL REFERENCES content(id), revision INTEGER NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL, input TEXT, result TEXT, error TEXT, attempts INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(content_id,revision,type));
      CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, created_at TEXT NOT NULL, message TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS connectors(id TEXT PRIMARY KEY, name_key TEXT UNIQUE NOT NULL, payload TEXT NOT NULL, secret BLOB);
      CREATE TABLE IF NOT EXISTS script_candidates(id TEXT PRIMARY KEY, job_id TEXT UNIQUE NOT NULL REFERENCES jobs(id), content_id TEXT NOT NULL REFERENCES content(id), family_id TEXT NOT NULL REFERENCES families(id), content_revision INTEGER NOT NULL, family_revision INTEGER NOT NULL, connector_id TEXT NOT NULL, connector_revision INTEGER NOT NULL, language TEXT NOT NULL, locale TEXT NOT NULL, prompt_version INTEGER NOT NULL, status TEXT NOT NULL, payload TEXT NOT NULL, usage TEXT NOT NULL, created_at TEXT NOT NULL);
      PRAGMA user_version=1;`);
    if (!this.db.prepare("PRAGMA table_info(jobs)").all().some(column=>column.name==='input')) this.db.exec('ALTER TABLE jobs ADD COLUMN input TEXT');
    if (!this.db.prepare("PRAGMA table_info(jobs)").all().some(column=>column.name==='attempts')) this.db.exec('ALTER TABLE jobs ADD COLUMN attempts INTEGER NOT NULL DEFAULT 1');
    // ponytail: synchronous transactions on one local host; migrate before multi-host workers.
    this.db.prepare("UPDATE jobs SET status='queued', updated_at=? WHERE status='running' AND type='storyboard'").run(now());
    this.db.prepare("UPDATE jobs SET status='interrupted', error='Hermes stopped during an unknown request. Review before retrying to avoid duplicate spend.', updated_at=? WHERE status='running' AND type LIKE 'hermes_script:%'").run(now());
  }
  close() { this.db.close(); }
  transaction(fn) { this.db.exec('BEGIN IMMEDIATE'); try { const result=fn();this.db.exec('COMMIT');return result; } catch(error) { this.db.exec('ROLLBACK');throw error; } }
  event(message) { this.db.prepare('INSERT INTO events(created_at,message) VALUES(?,?)').run(now(),message); }
  families() { return this.db.prepare('SELECT payload FROM families ORDER BY rowid DESC').all().map(r=>JSON.parse(r.payload)); }
  contents() { return this.db.prepare('SELECT payload FROM content ORDER BY rowid DESC').all().map(r=>({...JSON.parse(r.payload),reviewIssues:reviewIssues(JSON.parse(r.payload))})); }
  family(id) { const r=this.db.prepare('SELECT payload FROM families WHERE id=?').get(id);requireValue(r,'Family not found.',404);return JSON.parse(r.payload); }
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
        channels:LANGUAGES.map(language=>({language,locale:language==='en'?values.englishLocale:language==='es'?values.spanishLocale:'it-IT',connection:'not_connected'}))};
      this.db.prepare('INSERT INTO families(id,name_key,payload) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name_key=excluded.name_key,payload=excluded.payload').run(family.id,key,JSON.stringify(family));
      this.event(`${old?'Updated':'Created'} channel family: ${family.name}`);return family;
    });
  }
  archiveFamily(id, input) {
    object(input);return this.transaction(()=>{
      const f=this.family(id);this.version(f,input.revision);requireValue(typeof input.archived==='boolean','Archive state must be true or false.');
      if(!input.archived && f.archived)requireValue(this.families().filter(x=>!x.archived).length<15,'The current portfolio limit is 15 active families.');
      f.archived=input.archived;f.revision++;f.updatedAt=now();
      this.db.prepare('UPDATE families SET payload=? WHERE id=?').run(JSON.stringify(f),id);this.event(`${f.archived?'Archived':'Restored'} family: ${f.name}`);return f;
    });
  }
  persistContent(content) {this.db.prepare('INSERT INTO content(id,family_id,payload) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(content.id,content.familyId,JSON.stringify(content));return content;}
  saveContent(input,id) {
    const values=contentInput(input);
    return this.transaction(()=>{
      const old=id?this.content(id):null;if(old)this.version(old,input.revision);
      const familyId=old?.familyId||text(input.familyId,'Family ID',1,80);
      if(old && input.familyId!==undefined)requireValue(input.familyId===familyId,'A draft cannot move between families.');
      const family=this.family(familyId);requireValue(!family.archived,'Restore this family before editing its drafts.',409);
      const content={...values,id:old?.id||randomUUID(),familyId,revision:(old?.revision||0)+1,state:'draft',createdAt:old?.createdAt||now(),updatedAt:now(),approvedAt:null,scenes:[],
        editions:LANGUAGES.map(language=>({language,state:'not_started'}))};
      this.persistContent(content);this.event(`${old?'Revised':'Created'} draft: ${content.title}${old?' (previous approval and storyboard cleared)':''}`);return content;
    });
  }
  reviewContent(id,input) {
    object(input);return this.transaction(()=>{
      const c=this.content(id);this.version(c,input.revision);requireValue(!this.family(c.familyId).archived,'Restore this family before reviewing drafts.',409);
      const action=choice(input.action,['submit','approve','return'],'review action');
      if(action==='return'){requireValue(c.state==='in_review','Only a draft in review can be returned.',409);c.state='draft';}
      else {
        requireValue(c.state===(action==='submit'?'draft':'in_review'),'The draft is not in the required review state.',409);
        const issues=reviewIssues(c);requireValue(!issues.length,issues.join(' '));
        c.state=action==='submit'?'in_review':'approved';if(action==='approve')c.approvedAt=now();
      }
      // Revision identifies content, not a workflow click. Editing always invalidates approval.
      c.updatedAt=now();this.persistContent(c);this.event(`${action==='submit'?'Submitted for review':action==='approve'?'Approved script':'Returned to draft'}: ${c.title}`);return c;
    });
  }
  queueStoryboard(id,input) {
    object(input);return this.transaction(()=>{
      const c=this.content(id);this.version(c,input.revision);requireValue(c.state==='approved','Approve the current script before preparing a storyboard.',409);
      requireValue(!this.family(c.familyId).archived,'Restore this family before preparing work.',409);
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
      if(c.revision!==j.revision || c.state!=='approved' || this.family(c.familyId).archived) {
        this.db.prepare("UPDATE jobs SET status='cancelled',error=?,updated_at=? WHERE id=?").run('Draft changed or family archived before processing.',now(),j.id);return j.id;
      }
      const scenes=storyboard(c);c.scenes=scenes;c.editions=LANGUAGES.map(language=>({language,state:language==='en'?'script_ready':'awaiting_translation'}));
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
      const promptInput={family:{name:f.name,audience:f.audience,locale:f.englishLocale,countries:f.countries,niche:f.niche,format:f.format},content:{title:c.title,kind:c.kind,angle:c.angle,hook:c.hook},sources:c.sources.slice(0,10).map((source,index)=>({id:`S${index+1}`,title:source.title,url:source.url,notes:source.notes}))};
      const scope={contentRevision:c.revision,familyRevision:f.revision,connectorId:input.connectorId,connectorRevision:input.connectorRevision,promptVersion:1,promptInput};
      const type=`hermes_script:${input.connectorId}:${input.connectorRevision}:f${f.revision}:p1`;
      const existing=this.db.prepare('SELECT * FROM jobs WHERE content_id=? AND revision=? AND type=?').get(id,c.revision,type);if(existing)return existing;
      const jobId=randomUUID(),at=now();
      this.db.prepare("INSERT INTO jobs(id,content_id,revision,type,status,input,created_at,updated_at) VALUES(?,?,?,?,'queued',?,?,?)").run(jobId,id,c.revision,type,JSON.stringify(scope),at,at);
      this.event(`Queued Hermes English script candidate: ${c.title}`);return this.db.prepare('SELECT * FROM jobs WHERE id=?').get(jobId);
    });
  }
  retryHermesScriptJob(jobId,input) {
    object(input);return this.transaction(()=>{
      const previous=this.db.prepare('SELECT * FROM jobs WHERE id=?').get(jobId);
      requireValue(previous&&previous.type.startsWith('hermes_script:'),'Hermes job not found.',404);
      requireValue(['failed','stale','cancelled','interrupted'].includes(previous.status),'Only a terminal Hermes job can be retried deliberately.',409);
      requireValue(previous.status!=='interrupted'||input.confirmInterrupted===true,'Confirm the interrupted request before retrying because its provider outcome is unknown.',409);
      requireValue(previous.attempts<3,'This Hermes job reached the maximum of 3 attempts.',409);
      const c=this.content(previous.content_id);this.version(c,input.revision);const f=this.family(c.familyId);
      requireValue(!f.archived,'Restore this family before retrying Hermes.',409);
      requireValue(typeof input.connectorId==='string'&&input.connectorId.length>0,'Choose a Hermes connector.');
      requireValue(Number.isSafeInteger(input.connectorRevision)&&input.connectorRevision>0,'Reload the Hermes connector before retrying.');
      if(c.kind==='factual')requireValue(c.sources.length>0&&c.sources.every(source=>source.permission==='permitted'&&source.notes.length>=10),'Hermes needs permitted evidence notes for factual script generation.');
      const promptInput={family:{name:f.name,audience:f.audience,locale:f.englishLocale,countries:f.countries,niche:f.niche,format:f.format},content:{title:c.title,kind:c.kind,angle:c.angle,hook:c.hook},sources:c.sources.slice(0,10).map((source,index)=>({id:`S${index+1}`,title:source.title,url:source.url,notes:source.notes}))};
      const scope={contentRevision:c.revision,familyRevision:f.revision,connectorId:input.connectorId,connectorRevision:input.connectorRevision,promptVersion:1,promptInput};
      const attempts=previous.attempts+1,type=`hermes_script:${input.connectorId}:${input.connectorRevision}:f${f.revision}:p1:attempt${attempts}:${randomUUID()}`,id=randomUUID(),at=now();
      this.db.prepare("INSERT INTO jobs(id,content_id,revision,type,status,input,attempts,created_at,updated_at) VALUES(?,?,?,?,'queued',?,?,?,?)").run(id,c.id,c.revision,type,JSON.stringify(scope),attempts,at,at);
      this.db.prepare("UPDATE jobs SET status='retried',updated_at=? WHERE id=?").run(at,previous.id);
      this.event(`Deliberately retried Hermes English script candidate (attempt ${attempts}/3): ${c.title}`);return this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id);
    });
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
      this.db.prepare("UPDATE jobs SET status='running',updated_at=? WHERE id=? AND status='queued'").run(now(),job.id);
      return {...job,status:'running',scope};
    });
  }
  completeHermesScriptJob(jobId,result) {
    return this.transaction(()=>{
      const job=this.db.prepare('SELECT * FROM jobs WHERE id=?').get(jobId);requireValue(job&&job.status==='running','Hermes job is not running.',409);
      const scope=JSON.parse(job.input),c=this.content(job.content_id),f=this.family(c.familyId);
      if(c.revision!==scope.contentRevision||f.revision!==scope.familyRevision||f.archived||!this.hermesConnectorCurrent(scope)){this.db.prepare("UPDATE jobs SET status='stale',error='Hermes completed, but its input scope or tested connector changed. Candidate was not attached.',updated_at=? WHERE id=?").run(now(),jobId);return null;}
      const id=randomUUID(),at=now();
      this.db.prepare("INSERT INTO script_candidates(id,job_id,content_id,family_id,content_revision,family_revision,connector_id,connector_revision,language,locale,prompt_version,status,payload,usage,created_at) VALUES(?,?,?,?,?,?,?,?,? ,?,?,?, ?,?,?)").run(id,jobId,c.id,f.id,c.revision,f.revision,scope.connectorId,scope.connectorRevision,'en',f.englishLocale,scope.promptVersion,'available',JSON.stringify(result.candidate),JSON.stringify(result.usage),at);
      this.db.prepare("UPDATE jobs SET status='completed',result=?,error=NULL,updated_at=? WHERE id=?").run(JSON.stringify({candidateId:id,usage:result.usage}),at,jobId);
      this.event(`Hermes prepared an English script candidate for review: ${c.title}`);return this.scriptCandidate(id);
    });
  }
  failHermesScriptJob(jobId,message='Hermes generation failed. Review the connector and retry deliberately.') {this.db.prepare("UPDATE jobs SET status='failed',error=?,updated_at=? WHERE id=? AND status='running'").run(message,now(),jobId);}
  scriptCandidate(id){const row=this.db.prepare('SELECT * FROM script_candidates WHERE id=?').get(id);requireValue(row,'Script candidate not found.',404);return {id:row.id,jobId:row.job_id,contentId:row.content_id,familyId:row.family_id,contentRevision:row.content_revision,familyRevision:row.family_revision,connectorId:row.connector_id,connectorRevision:row.connector_revision,language:row.language,locale:row.locale,promptVersion:row.prompt_version,status:row.status,payload:JSON.parse(row.payload),usage:JSON.parse(row.usage),createdAt:row.created_at};}
  scriptCandidates(){return this.db.prepare('SELECT id FROM script_candidates ORDER BY created_at DESC,rowid DESC').all().map(row=>this.scriptCandidate(row.id));}
  state() {return {families:this.families(),contents:this.contents(),jobs:this.db.prepare('SELECT * FROM jobs ORDER BY created_at DESC,rowid DESC LIMIT 100').all().map(job=>({...job,input:undefined})),scriptCandidates:this.scriptCandidates(),events:this.db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT 25').all()};}
  exportContent(id) {
    const c=this.content(id), f=this.family(c.familyId);
    return {schemaVersion:1,exportedAt:now(),family:{id:f.id,name:f.name,profile:f.audience,countries:f.countries,channels:f.channels},content:c,
      limitations:['Planning document only; no media generated or uploaded.','Timing is an estimate at 145 words/minute. Scene breaks may fall inside sentences; revise before narration.','Spanish and Italian are awaiting translation. Source review is a creator attestation, not automatic verification.']};
  }
}
module.exports={Store,InputError,reviewIssues,storyboard};
