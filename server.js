'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {randomBytes,timingSafeEqual}=require('node:crypto');
const {Store,InputError}=require('./store');
const {WindowsVault,YouTubeResearch}=require('./youtube');
const {ConnectorSlots,PROVIDERS}=require('./connectors');
const {ScriptWriter}=require('./writer');
const {ResearchReasoning}=require('./research');
const {Ai,ClaudeCode,MODELS,DEFAULT_MODELS,MODEL_GROUPS,MODEL_WEIGHT,TASK_ROLE}=require('./ai');
const {VoiceRuntime}=require('./voice');
const {StyleLibrary}=require('./style');
const {QuotaLedger}=require('./intel-sources');
const {CompetitorIntelligence}=require('./competitor-intel');
const {StyleStudies}=require('./style-study');
const {NicheFactory}=require('./niche-factory');
const {TrendScanner}=require('./trends');
const {Backups}=require('./backup');
const VisualDna=require('./visual-dna');
const Operations=require('./operations');
// The GPT models the owner's ChatGPT plan offers, as the Codex app last listed them (a hint for the connection form).
function gptModels(){try{const cache=JSON.parse(fs.readFileSync(path.join(process.env.CODEX_HOME||path.join(require('node:os').homedir(),'.codex'),'models_cache.json'),'utf8'));return (cache.models||[]).filter(item=>item&&item.visibility!=='hide'&&typeof item.slug==='string').map(item=>item.slug).slice(0,20);}catch{return [];}}
const {SceneRoom}=require('./scene-room');
const {RenderRoom}=require('./render-room');
const {EditingRoom}=require('./editing-room');
const {FrameScanner}=require('./frame-scan');
const {PackagingRoom}=require('./packaging-room');
const {LocalizationRoom}=require('./localization-room');
const {PublishingRoom}=require('./publishing-room');
const {VoiceDirector}=require('./voice-direction');
const {SoundtrackRoom}=require('./soundtrack');
const {SoundLibrary}=require('./sound-library');
const {SoundOnline}=require('./sound-online');
const {SkillsEngine}=require('./skills');
const craft=require('./craft');
const {getFFmpegPath}=require('./vendor/youtube-automation-agent/ffmpeg');
const root=__dirname;
const APP_VERSION=JSON.parse(fs.readFileSync(path.join(__dirname,'package.json'),'utf8')).version;
const files={ '/audio-room.js':['public/audio-room.js','text/javascript; charset=utf-8'], '/packaging-room.js':['public/packaging-room.js','text/javascript; charset=utf-8'], '/master-room.js':['public/master-room.js','text/javascript; charset=utf-8'], '/localization-room.js':['public/localization-room.js','text/javascript; charset=utf-8'], '/publishing-room.js':['public/publishing-room.js','text/javascript; charset=utf-8'], '/voice-direction.js':['public/voice-direction.js','text/javascript; charset=utf-8'], '/review-room.js':['public/review-room.js','text/javascript; charset=utf-8'], '/':['public/index.html','text/html; charset=utf-8'], '/app.js':['public/app.js','text/javascript; charset=utf-8'], '/style-room.js':['public/style-room.js','text/javascript; charset=utf-8'], '/intelligence.js':['public/intelligence.js','text/javascript; charset=utf-8'], '/scene-room.js':['public/scene-room.js','text/javascript; charset=utf-8'], '/render-room.js':['public/render-room.js','text/javascript; charset=utf-8'], '/editing-room.js':['public/editing-room.js','text/javascript; charset=utf-8'], '/skills-room.js':['public/skills-room.js','text/javascript; charset=utf-8'], '/style.css':['public/style.css','text/css; charset=utf-8'] };
function createApp({dataFile=path.join(root,'data','control-room.sqlite'),worker=true,research=null,protector=null,providerFetch=fetch,voiceOptions={},claudeCode=null}={}) {
  // In-memory fixtures must never share media, recovery cleanup or credentials with the owner's program.
  const dataRoot=dataFile===':memory:'?fs.mkdtempSync(path.join(os.tmpdir(),'control-room-memory-')):path.dirname(path.resolve(dataFile));
  // A02: a restore the owner asked for happens now, before the database opens.
  if(dataFile!==':memory:'){const restored=Backups.applyPendingRestore({dataRoot,dataFile:path.resolve(dataFile)});if(restored)console.log(`Restore of a backup: ${restored.ok?`done (${restored.restored} files back, the work it replaced is in ${restored.setAside})`:restored.reason}`);}
  const store=new Store(dataFile,{artifactRoot:dataRoot}), token=randomBytes(32).toString('hex');
  research ||= new YouTubeResearch(new WindowsVault(dataRoot));
  const connectors=new ConnectorSlots(store,protector||new WindowsVault(dataRoot),providerFetch);
  // One AI layer for every room: Claude on the owner's chosen connection, one call per model at a time.
  const ai=new Ai(connectors,{claudeCode:claudeCode||new ClaudeCode()});connectors.ai=ai;
  const backups=dataFile===':memory:'?null:new Backups(store,{dataRoot,dataFile:path.resolve(dataFile),busy:()=>{try{return !!store.db.prepare("SELECT 1 FROM render_jobs WHERE status='running' LIMIT 1").get();}catch{return false;}}});
  const requireBackups=()=>{if(!backups)throw new InputError('Backups need a data file on disk.',409);};
  const reasoning=new ScriptWriter(store,ai);
  const researchReasoning=new ResearchReasoning(store,ai);
  const ffmpeg=voiceOptions.ffmpeg||getFFmpegPath(),ffprobe=voiceOptions.ffprobe||process.env.FFPROBE_PATH||(path.isAbsolute(ffmpeg)?path.join(path.dirname(ffmpeg),process.platform==='win32'?'ffprobe.exe':'ffprobe'):'ffprobe');
  const styles=new StyleLibrary(store);
  // The Skills Engine attaches its runtime to the store so the prompt-building rooms can reach
  // the approved skill brief. Nothing is injected until a skill revision is approved by a human.
  const skills=new SkillsEngine(store,{root}).attach();
  const quota=new QuotaLedger(store),competitorIntel=new CompetitorIntelligence(store,connectors,quota,styles,ai),nicheFactory=new NicheFactory(store,connectors,quota,styles,ai,{shotDir:path.join(dataRoot,'niche-shots')}),trends=new TrendScanner(store,connectors,quota,ai);
  const sceneRoom=new SceneRoom(store,connectors,quota,styles,{dataRoot,ffmpeg,ffprobe,competitorIntel,ai});
  const renderRoom=new RenderRoom(store,styles,sceneRoom,{dataRoot,ffmpeg,ffprobe});
  const editingRoom=new EditingRoom(store,styles,sceneRoom,renderRoom,{ffmpeg});
  const frameScanner=new FrameScanner(store,renderRoom,connectors,ai);renderRoom.frameScanner=frameScanner;
  // R05c: the program learns a look from a reference the owner names (a video file or screenshots on this PC).
  const styleStudies=new StyleStudies(store,styles,connectors,ai,renderRoom,{studyDir:path.join(dataRoot,'studies')});
  const packagingRoom=new PackagingRoom(store,sceneRoom,renderRoom,editingRoom,connectors,ai,{dataRoot});renderRoom.packaging=packagingRoom;
  const localizationRoom=new LocalizationRoom(store,renderRoom,packagingRoom,connectors,ai,{dataRoot,ffmpeg,ffprobe});renderRoom.localization=localizationRoom;
  const publishingRoom=new PublishingRoom(store,connectors,{renders:renderRoom,packaging:packagingRoom,localization:localizationRoom,quota});
  const voiceDirector=new VoiceDirector(store,connectors,{ai,competitorIntel,styles});
  // The sound library (0.60): music and effects the owner downloaded (Pixabay, YouTube Audio Library), imported and measured once.
  const soundLibrary=new SoundLibrary(store,{dataRoot,renders:renderRoom,ffmpeg,ffprobe});
  const soundtrack=new SoundtrackRoom(store,connectors,sceneRoom,{dataRoot,ai,renders:renderRoom,ffmpeg,ffprobe,sounds:soundLibrary});
  // 0.61: Freesound effects and Jamendo music, searched and added on the owner's click.
  const soundOnline=new SoundOnline(store,connectors,soundLibrary,quota);
  editingRoom.soundtrack=soundtrack;
  const voiceRuntime=new VoiceRuntime(store,connectors,{artifactDir:path.join(dataRoot,'voice-artifacts'),...voiceOptions,ffmpeg,ffprobe});
  let timer, ffmpegAvailable=null, ticks=0;
  const voiceReady=voiceRuntime.preflight().then(()=>{ffmpegAvailable=true;return true;}).catch(()=>{ffmpegAvailable=false;return false;});
  function json(res,code,body) {res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));}
  async function readBody(req,limit=262144) {
    if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw new InputError('Use application/json.',415);
    const chunks=[];let bytes=0;
    for await(const chunk of req){bytes+=chunk.length;if(bytes>limit)throw new InputError(`Request is too large. Maximum ${Math.round(limit/1024)} KB.`,413);chunks.push(chunk);}
    let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new InputError('Request body is not valid JSON.');}
    if(!body || typeof body!=='object' || Array.isArray(body))throw new InputError('Send a JSON object.');return body;
  }
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const port=server.address().port, host=req.headers.host;
      if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(host))throw new InputError('This application accepts local requests only.',403);
      if(req.headers.origin && req.headers.origin!==`http://${host}`)throw new InputError('Cross-origin requests are not allowed.',403);
      const url=new URL(req.url,`http://${host}`), pathname=url.pathname;
      // Google's sign-in page sends the owner back here (a cross-site navigation); it carries only a one-time state and code.
      const oauthReturn=req.method==='GET'&&pathname==='/oauth/youtube/callback';
      if(req.headers['sec-fetch-site']==='cross-site'&&!oauthReturn)throw new InputError('Cross-site requests are not allowed.',403);
      if(oauthReturn){const result=await publishingRoom.callback(url.searchParams),safe=value=>String(value).replace(/[&<>"']/g,char=>`&#${char.charCodeAt(0)};`);res.writeHead(result.ok?200:400,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>YouTube channel</title></head><body><h1>${result.ok?'Channel found':'Not connected'}</h1>${(result.channels||[]).map(channel=>`<p><b>${safe(channel.title)}</b> (${safe(channel.id)})</p>`).join('')}<p>${safe(result.message)}</p><p><a href="/#production">Back to the Control Room</a></p></body></html>`);}
      if(req.method==='GET'){
        if(Object.hasOwn(files,pathname)){const [filename,mime]=files[pathname],body=fs.readFileSync(path.join(root,filename));res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store'});return res.end(body);}
        if(pathname==='/favicon.ico'){res.writeHead(204);return res.end();}
        // A03 (0.59): the operations report, counted from the program's own records; read-only.
        if(pathname==='/api/operations')return json(res,200,Operations.report(store.db,{days:Number(url.searchParams.get('days'))||14,quota:quota.summary()}));
        if(pathname==='/api/health')return json(res,200,{app:'youtube-control-room',version:APP_VERSION,mode:'local-control-room-with-reviewed-skills-engine'});
        if(pathname==='/api/state'){const skillState=skills.state(),connectorState=connectors.list(),claudeReady=connectorState.some(item=>['claude','claude-code','chatgpt'].includes(item.provider)&&(item.hasKey||['claude-code','chatgpt'].includes(item.provider))&&!item.busy&&item.test?.status==='passed'),voiceReady=ffmpegAvailable===true&&connectorState.some(item=>['openai','elevenlabs','fish-audio'].includes(item.provider)&&item.hasKey&&!item.busy&&item.test?.status==='passed');return json(res,200,{...store.state(),app:{version:APP_VERSION},token,connectors:connectorState,connectorProviders:PROVIDERS,backups:backups?.state()||null,visualRules:VisualDna.summary(),ai:{team:ai.team(),modelGroups:Object.keys(MODEL_GROUPS),modelWeight:MODEL_WEIGHT,gptModels:gptModels(),claudeCodeFound:!!ai.claudeCode.command,codexFound:!!ai.codex.command,models:MODELS,defaults:DEFAULT_MODELS,taskRoles:TASK_ROLE},youtubeResearch:research.status(),styles:styles.state(),scenes:sceneRoom.state(),renders:renderRoom.state(),editing:editingRoom.state(),frameScans:frameScanner.state(),styleStudies:styleStudies.state(),packaging:packagingRoom.state(),localization:localizationRoom.state(),publishing:publishingRoom.state(),voiceDirection:voiceDirector.state(),soundtrack:soundtrack.state(),skills:skillState,intelligence:{competitors:competitorIntel.state(),niches:nicheFactory.state(),trends:trends.state()},build:JSON.parse(fs.readFileSync(path.join(root,'docs/build-status.json'),'utf8')),
          capabilities:{skills:skillState.counts.approved>0?'approved_skills_injected':'drafts_only_not_injected',research:claudeReady?'review_only_saved_evidence':'saved_evidence_only',text:claudeReady?'bounded_claude_candidates':'not_connected',translation:'not_implemented',voice:voiceReady?'bounded_primary_locale_auditions':'not_connected',youtube:'not_connected',agentReach:'reference_only',ffmpeg:ffmpegAvailable===null?'checking':ffmpegAvailable?'executable_detected':'not_found'}});}
        if(pathname==='/api/progress'){res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});return res.end(fs.readFileSync(path.join(root,'docs/BUILD-PROGRESS.md')));}
        if(pathname==='/api/production-plan'){res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});return res.end(fs.readFileSync(path.join(root,'docs/PRODUCTION-ROOM.md')));}
        if(pathname==='/api/templates/stickman'){res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});return res.end(fs.readFileSync(path.join(root,'vendor/stickman-video-director/skills__directing-stickman-videos__references__storyboard-template.md')));}
        if(pathname==='/api/sounds')return json(res,200,soundLibrary.list({kind:url.searchParams.get('kind')||'',q:url.searchParams.get('q')||'',limit:url.searchParams.get('limit'),offset:url.searchParams.get('offset')}));
        if(pathname==='/api/sound-online/preview'){const {bytes,mime}=await soundOnline.preview(url.searchParams.get('ref')||'');res.writeHead(200,{'Content-Type':/^audio\//.test(mime)?mime:'audio/mpeg','Content-Length':bytes.length,'Cache-Control':'no-store'});return res.end(bytes);}
        const soundFile=pathname.match(/^\/api\/sounds\/([a-f0-9]{64})\/audio$/);
        if(soundFile){const {file,size,mime}=soundLibrary.file(soundFile[1]);res.writeHead(200,{'Content-Type':mime,'Content-Length':size,'Cache-Control':'no-store'});return fs.createReadStream(file).pipe(res);}
        const audioAsset=pathname.match(/^\/api\/audio-assets\/([a-f0-9-]+)\/audio$/);
        if(audioAsset){const {file,size,mime}=soundtrack.assetFile(audioAsset[1]);res.writeHead(200,{'Content-Type':mime,'Content-Length':size,'Cache-Control':'no-store'});return fs.createReadStream(file).pipe(res);}
        const voiceAudio=pathname.match(/^\/api\/voice-auditions\/([a-f0-9-]+)\/audio$/);
        if(voiceAudio){const audition=store.voiceAudition(voiceAudio[1]),integrity=store.verifyVoiceArtifact(audition);if(!integrity.ok)throw new InputError(integrity.reason||'Voice artifact file is unavailable.',404);const {filename,stat}=integrity,range=req.headers.range;if(range){const match=range.match(/^bytes=(\d+)-(\d*)$/);if(!match)throw new InputError('Invalid audio byte range.',416);const start=Number(match[1]),end=match[2]?Number(match[2]):stat.size-1;if(!(Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start>=0&&end>=start&&end<stat.size))throw new InputError('Audio byte range is outside the artifact.',416);res.writeHead(206,{'Content-Type':audition.artifact.mime||'audio/wav','Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${stat.size}`,'Content-Length':end-start+1,'Cache-Control':'no-store'});return fs.createReadStream(filename,{start,end}).pipe(res);}res.writeHead(200,{'Content-Type':audition.artifact.mime||'audio/wav','Accept-Ranges':'bytes','Content-Length':stat.size,'Cache-Control':'no-store'});return fs.createReadStream(filename).pipe(res);}
        const renderFile=pathname.match(/^\/api\/renders\/([a-f0-9-]+)\/(video|sheet|manifest|audio|hook)$/);
        if(renderFile){const {file,mime,size}=renderRoom.file(renderFile[1],renderFile[2]);const range=req.headers.range;if(['video','audio'].includes(renderFile[2])&&range){const match=range.match(/^bytes=(\d*)-(\d*)$/);if(!match||(!match[1]&&!match[2]))throw new InputError('Invalid video byte range.',416);let start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2])),end=match[1]&&match[2]?Math.min(Number(match[2]),size-1):size-1;if(!(start>=0&&start<=end&&end<size))throw new InputError('Video byte range is outside the file.',416);res.writeHead(206,{'Content-Type':mime,'Content-Range':`bytes ${start}-${end}/${size}`,'Accept-Ranges':'bytes','Content-Length':end-start+1,'Cache-Control':'no-store'});return fs.createReadStream(file,{start,end}).pipe(res);}res.writeHead(200,{'Content-Type':mime,'Content-Length':size,'Accept-Ranges':['video','audio'].includes(renderFile[2])?'bytes':'none','Cache-Control':'no-store'});return fs.createReadStream(file).pipe(res);}
        const packageThumb=pathname.match(/^\/api\/package-revisions\/([a-f0-9-]+)\/thumbnails\/(k\d)$/);
        if(packageThumb){const file=packagingRoom.thumbnailFile(packageThumb[1],packageThumb[2]);res.writeHead(200,{'Content-Type':'image/jpeg','Content-Length':fs.statSync(file).size,'Cache-Control':'no-store'});return fs.createReadStream(file).pipe(res);}
        const packageExport=pathname.match(/^\/api\/package-revisions\/([a-f0-9-]+)\/export\.txt$/);
        const editionAudio=req.method==='GET'&&pathname.match(/^\/api\/edition-narrations\/([a-f0-9-]+)\/audio$/);
        if(editionAudio){const {file,size,mime}=localizationRoom.narrationFile(editionAudio[1]),range=req.headers.range,match=range&&range.match(/^bytes=(\d+)-(\d*)$/);if(match){const start=Number(match[1]),end=match[2]?Math.min(Number(match[2]),size-1):size-1;if(!(start<=end&&end<size))throw new InputError('Audio byte range is outside the file.',416);res.writeHead(206,{'Content-Type':mime,'Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':end-start+1,'Cache-Control':'no-store'});return fs.createReadStream(file,{start,end}).pipe(res);}res.writeHead(200,{'Content-Type':mime,'Accept-Ranges':'bytes','Content-Length':size,'Cache-Control':'no-store'});return fs.createReadStream(file).pipe(res);}
        const editionThumb=req.method==='GET'&&pathname.match(/^\/api\/edition-renders\/([a-f0-9-]+)\/thumbnail$/);
        if(editionThumb){const file=localizationRoom.editionThumbnailFile(editionThumb[1]);res.writeHead(200,{'Content-Type':'image/jpeg','Content-Length':fs.statSync(file).size,'Cache-Control':'no-store'});return fs.createReadStream(file).pipe(res);}
        const editionExport=req.method==='GET'&&pathname.match(/^\/api\/edition-revisions\/([a-f0-9-]+)\/export$/);
        if(editionExport){const {text,filename}=localizationRoom.exportText(editionExport[1]);res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Content-Disposition':`attachment; filename="edition.txt"; filename*=UTF-8''${encodeURIComponent(filename)}`,'Cache-Control':'no-store'});return res.end(text);}
        if(packageExport){const {text,filename}=packagingRoom.exportText(packageExport[1]);res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Content-Disposition':`attachment; filename="package.txt"; filename*=UTF-8''${encodeURIComponent(filename)}`,'Cache-Control':'no-store'});return res.end(text);}
        const studySheet=pathname.match(/^\/api\/style-studies\/([a-f0-9-]+)\/sheets\/(\d{1,2})$/);
        if(studySheet){const file=styleStudies.sheetFile(studySheet[1],studySheet[2]);res.writeHead(200,{'Content-Type':'image/jpeg','Content-Length':fs.statSync(file).size,'Cache-Control':'no-store'});return fs.createReadStream(file).pipe(res);}
        const scanSheet=pathname.match(/^\/api\/frame-scans\/([a-f0-9-]+)\/sheets\/(\d{1,4})$/);
        if(scanSheet){const file=frameScanner.sheetFile(scanSheet[1],scanSheet[2]);res.writeHead(200,{'Content-Type':'image/jpeg','Content-Length':fs.statSync(file).size,'Cache-Control':'no-store'});return fs.createReadStream(file).pipe(res);}
        const qcReport=pathname.match(/^\/api\/renders\/([a-f0-9-]+)\/qc$/);
        if(qcReport)return json(res,200,renderRoom.qcReport(qcReport[1]));
        const captionFile=pathname.match(/^\/api\/edit-revisions\/([a-f0-9-]+)\/captions\.(srt|vtt)$/);
        if(captionFile){const {text,filename}=editingRoom.captionsFile(captionFile[1],captionFile[2]);res.writeHead(200,{'Content-Type':`${captionFile[2]==='vtt'?'text/vtt':'application/x-subrip'}; charset=utf-8`,'Content-Disposition':`attachment; filename="captions.${captionFile[2]}"; filename*=UTF-8''${encodeURIComponent(filename)}`,'Cache-Control':'no-store'});return res.end(text);}
        const sceneBoard=pathname.match(/^\/api\/scene-manifests\/([a-f0-9-]+)\/board$/);
        if(sceneBoard)return json(res,200,sceneRoom.boardSummary(sceneBoard[1]));
        if(pathname==='/api/scene-candidates')return json(res,200,sceneRoom.candidates(String(url.searchParams.get('contentId')||''),String(url.searchParams.get('shotId')||'')));
        if(pathname==='/api/skills/export')return json(res,200,{status:url.searchParams.get('status')==='latest'?'latest':'approved',skills:skills.exportPack({status:url.searchParams.get('status')==='latest'?'latest':'approved'})});
        if(pathname==='/api/skills/brief')return json(res,200,skills.brief(String(url.searchParams.get('taskKey')||''),{familyId:url.searchParams.get('familyId')||null}));
        if(pathname==='/api/skills/effect')return json(res,200,skills.effect(String(url.searchParams.get('skillId')||'')));
        const visualFile=pathname.match(/^\/api\/(visual-candidates|visual-assets)\/([a-f0-9-]+)\/(preview|thumb|file)$/);
        if(visualFile){const [,kind,id,part]=visualFile;if((kind==='visual-candidates')!==(part==='preview'))throw new InputError('Page not found.',404);const {file,mime}=kind==='visual-candidates'?sceneRoom.candidatePreview(id):sceneRoom.assetFile(id,part);let body;try{body=fs.readFileSync(file);}catch{throw new InputError('Media file is unavailable.',404);}res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store','Content-Length':body.length});return res.end(body);}
        const nicheShot=pathname.match(/^\/api\/niche-reads\/([a-f0-9-]+)\/image$/);
        if(nicheShot){const {file,mime}=nicheFactory.imageFile(nicheShot[1]),body=fs.readFileSync(file);res.writeHead(200,{'Content-Type':mime,'Content-Length':body.length,'Cache-Control':'no-store'});return res.end(body);}
        const trendScan=pathname.match(/^\/api\/trend-scans\/([a-f0-9-]+)$/);
        if(trendScan)return json(res,200,trends.publicScan(trends.scanRow(trendScan[1])));
        const exported=pathname.match(/^\/api\/content\/([a-f0-9-]+)\/export$/);
        if(exported){const data=store.exportContent(exported[1]);res.setHeader('Content-Disposition',`attachment; filename="content-${exported[1]}-v${data.content.revision}.json"`);return json(res,200,data);}
        const editDrawings=pathname.match(/^\/api\/edit-revisions\/([a-f0-9-]+)\/drawings$/);
        if(editDrawings)return json(res,200,editingRoom.drawings(editDrawings[1]));
        throw new InputError('Page not found.',404);
      }
      if(!['POST','PUT'].includes(req.method))throw new InputError('Method not supported.',405);
      const supplied=Buffer.from(String(req.headers['x-local-token']||''));const expected=Buffer.from(token);
      if(supplied.length!==expected.length || !timingSafeEqual(supplied,expected))throw new InputError('Reload the app before saving.',403);
      const body=await readBody(req,pathname==='/api/niche-reads'?6*1024*1024:262144);let result;
      if(pathname==='/api/connectors'&&req.method==='POST')return json(res,200,connectors.save(body));
      if(pathname==='/api/ai-roles'&&req.method==='POST')return json(res,200,connectors.saveAiRoles(body));
      const connectorRoute=pathname.match(/^\/api\/connectors\/([a-f0-9-]+)(?:\/(test|delete))?$/);
      if(connectorRoute){
        const [,id,action]=connectorRoute;
        if(!action&&req.method==='PUT')result=connectors.save(body,id);
        else if(action==='test'&&req.method==='POST')result=await connectors.test(id,body.revision,body.channel);
        else if(action==='delete'&&req.method==='POST')result=connectors.remove(id,body.revision);
        else throw new InputError('Action not found.',404);
        return json(res,200,result);
      }
      if(pathname==='/api/youtube/key' && req.method==='POST'){research.save(body.key);result=research.status();}
      else if(pathname==='/api/youtube/forget' && req.method==='POST'){research.forget();result=research.status();}
      else if(pathname==='/api/youtube/channel' && req.method==='POST')result=await research.lookup(body.channel);
      else if(pathname==='/api/families' && req.method==='POST')result=store.saveFamily(body);
      else if(pathname==='/api/content' && req.method==='POST')result=store.saveContent(body);
      else if(pathname==='/api/research/evidence'&&req.method==='POST')result=store.saveResearchEvidence(body);
      else {
        if(pathname==='/api/quota-settings'&&req.method==='POST')return json(res,200,quota.saveSettings(body));
        if(pathname==='/api/niche-settings'&&req.method==='POST')return json(res,200,nicheFactory.saveSettings(body));
        if(pathname==='/api/niche-reads'&&req.method==='POST')return json(res,200,nicheFactory.queueRead(body));
        const readRetry=pathname.match(/^\/api\/niche-reads\/([a-f0-9-]+)\/retry$/);
        if(readRetry&&req.method==='POST')return json(res,200,nicheFactory.retryRead(readRetry[1],body));
        if(pathname==='/api/trend-settings'&&req.method==='POST')return json(res,200,trends.saveSettings(body));
        if(pathname==='/api/trend-scans'&&req.method==='POST')return json(res,200,trends.queueScan(body));
        const trendAction=pathname.match(/^\/api\/trend-(scans|topics)\/([a-f0-9-]+)\/(retry|topics)$/);
        if(trendAction&&req.method==='POST'){const [,kind,id,action]=trendAction;if(kind==='scans')return json(res,200,action==='retry'?trends.retryScan(id,body):trends.queueTopics(id,body));if(action==='retry')return json(res,200,trends.retryTopics(id,body));}
        if(pathname==='/api/niche-ideas'&&req.method==='POST')return json(res,200,nicheFactory.saveIdea(body));
        const familyIntel=pathname.match(/^\/api\/families\/([a-f0-9-]+)\/(competitor-settings|competitor-notes|competitor-scans|competitor-analyses|competitor-picks)$/);
        if(familyIntel&&req.method==='POST'){const [,id,kind]=familyIntel;return json(res,200,kind==='competitor-settings'?competitorIntel.saveSettings(id,body):kind==='competitor-notes'?competitorIntel.saveNote(id,body):kind==='competitor-scans'?competitorIntel.queueScan(id,body):kind==='competitor-picks'?competitorIntel.savePicks(id,body):competitorIntel.queueAnalysis(id,body));}
        const scanAction=pathname.match(/^\/api\/competitor-scans\/([a-f0-9-]+)\/retry$/);
        if(scanAction&&req.method==='POST')return json(res,200,competitorIntel.retryScan(scanAction[1],body));
        const analysisAction=pathname.match(/^\/api\/competitor-analyses\/([a-f0-9-]+)\/(retry|review|style-draft)$/);
        if(analysisAction&&req.method==='POST'){const [,id,kind]=analysisAction;return json(res,200,kind==='retry'?competitorIntel.retryAnalysis(id,body):kind==='review'?competitorIntel.review(id,body):competitorIntel.createStyleDraft(id,body));}
        const ideaRoute=pathname.match(/^\/api\/niche-ideas\/([a-f0-9-]+)(?:\/(archive|discoveries|evaluations))?$/);
        if(ideaRoute){const [,id,kind]=ideaRoute;if(!kind&&req.method==='PUT')return json(res,200,nicheFactory.saveIdea(body,id));if(req.method==='POST'&&kind)return json(res,200,kind==='archive'?nicheFactory.archiveIdea(id,body):kind==='discoveries'?nicheFactory.queueDiscovery(id,body):nicheFactory.queueEvaluation(id,body));throw new InputError('Action not found.',404);}
        const discoveryAction=pathname.match(/^\/api\/niche-discoveries\/([a-f0-9-]+)\/retry$/);
        if(discoveryAction&&req.method==='POST')return json(res,200,nicheFactory.retryDiscovery(discoveryAction[1],body));
        const evaluationAction=pathname.match(/^\/api\/niche-evaluations\/([a-f0-9-]+)\/(retry|review|link-family)$/);
        if(evaluationAction&&req.method==='POST'){const [,id,kind]=evaluationAction;return json(res,200,kind==='retry'?nicheFactory.retryEvaluation(id,body):kind==='review'?nicheFactory.review(id,body):nicheFactory.linkFamily(id,body));}
        const packageRoute=pathname.match(/^\/api\/content\/([a-f0-9-]+)\/package(?:\/(start|draft))?$/);
        if(packageRoute&&req.method==='POST'){const [,id,kind]=packageRoute;return json(res,200,kind==='start'?await packagingRoom.startFromScript(id,body):kind==='draft'?packagingRoom.queueDraft(id,body):await packagingRoom.save(id,body));}
        const packageJob=pathname.match(/^\/api\/package-jobs\/([a-f0-9-]+)\/retry$/);
        if(packageJob&&req.method==='POST')return json(res,200,packagingRoom.retryDraft(packageJob[1],body));
        const packageApprove=pathname.match(/^\/api\/package-revisions\/([a-f0-9-]+)\/approve$/);
        if(packageApprove&&req.method==='POST')return json(res,200,packagingRoom.approve(packageApprove[1],body));
        const editionRoute=pathname.match(/^\/api\/content\/([a-f0-9-]+)\/edition(?:\/(draft|narrate|render))?$/);
        if(editionRoute&&req.method==='POST')return json(res,200,editionRoute[2]==='draft'?localizationRoom.queueDraft(editionRoute[1],body):editionRoute[2]==='narrate'?localizationRoom.queueNarration(editionRoute[1],body):editionRoute[2]==='render'?await localizationRoom.queueEditionRender(editionRoute[1],body):localizationRoom.save(editionRoute[1],body));
        const editionRelease=pathname.match(/^\/api\/edition-renders\/([a-f0-9-]+)\/approve$/);
        if(pathname==='/api/youtube/connect'&&req.method==='POST')return json(res,200,publishingRoom.connect(body,`http://${host}`));
        const bindingAction=pathname.match(/^\/api\/youtube-bindings\/([a-f0-9-]+)\/(confirm|disconnect)$/);
        if(bindingAction&&req.method==='POST')return json(res,200,bindingAction[2]==='confirm'?publishingRoom.confirm(bindingAction[1],body):publishingRoom.disconnect(bindingAction[1],body));
        const publishRoute=pathname.match(/^\/api\/content\/([a-f0-9-]+)\/publish$/);
        if(publishRoute&&req.method==='POST')return json(res,200,publishingRoom.queueUpload(publishRoute[1],body));
        const rulesRoute=pathname.match(/^\/api\/families\/([a-f0-9-]+)\/publishing-rules$/);
        if(rulesRoute&&req.method==='POST')return json(res,200,publishingRoom.setPolicy(rulesRoute[1],body));
        if(pathname==='/api/publishing/pause'&&req.method==='POST')return json(res,200,publishingRoom.setPause(body));
        const alertRoute=pathname.match(/^\/api\/publishing-alerts\/([a-f0-9-]+)\/acknowledge$/);
        if(alertRoute&&req.method==='POST')return json(res,200,publishingRoom.acknowledge(alertRoute[1],body));
        const reportRoute=pathname.match(/^\/api\/publications\/([a-f0-9-]+)\/report$/);
        if(reportRoute&&req.method==='POST')return json(res,200,publishingRoom.report(reportRoute[1],body));
        const publicationAction=pathname.match(/^\/api\/publications\/([a-f0-9-]+)\/(resume|check|reconcile|choose|discard|attach|schedule|unschedule)$/);
        if(publicationAction&&req.method==='POST'){const [,id,kind]=publicationAction;return json(res,200,kind==='resume'?publishingRoom.resume(id,body):kind==='check'?await publishingRoom.checkNext(id):kind==='reconcile'?await publishingRoom.reconcile(id,body):kind==='choose'?publishingRoom.choose(id,body):kind==='attach'?await publishingRoom.retryAttachment(id,body):kind==='schedule'?await publishingRoom.schedule(id,body):kind==='unschedule'?await publishingRoom.unschedule(id,body):publishingRoom.discard(id,body));}
        if(editionRelease&&req.method==='POST')return json(res,200,localizationRoom.approveEditionRender(editionRelease[1],body));
        const editionVoice=pathname.match(/^\/api\/families\/([a-f0-9-]+)\/edition-voices$/);
        if(editionVoice&&req.method==='POST')return json(res,200,localizationRoom.saveVoice(editionVoice[1],body));
        const editionNarration=pathname.match(/^\/api\/edition-narrations\/([a-f0-9-]+)\/(retry|approve)$/);
        if(editionNarration&&req.method==='POST')return json(res,200,editionNarration[2]==='retry'?localizationRoom.retryNarration(editionNarration[1],body):localizationRoom.approveNarration(editionNarration[1],body));
        const editionJob=pathname.match(/^\/api\/edition-jobs\/([a-f0-9-]+)\/retry$/);
        if(editionJob&&req.method==='POST')return json(res,200,localizationRoom.retryDraft(editionJob[1],body));
        const editionApprove=pathname.match(/^\/api\/edition-revisions\/([a-f0-9-]+)\/approve$/);
        if(editionApprove&&req.method==='POST')return json(res,200,localizationRoom.approve(editionApprove[1],body));
        if(pathname==='/api/render-readiness'&&req.method==='POST')return json(res,200,await renderRoom.checkReadiness(body));
        if(pathname==='/api/render-pins'&&req.method==='POST')return json(res,200,renderRoom.pin(body));
        const editCreate=pathname.match(/^\/api\/content\/([a-f0-9-]+)\/edits$/);
        if(editCreate&&req.method==='POST')return json(res,200,await editingRoom.generate(editCreate[1],body));
        const retentionRoute=pathname.match(/^\/api\/content\/([a-f0-9-]+)\/retention$/);
        if(retentionRoute&&req.method==='POST')return json(res,200,editingRoom.retention(retentionRoute[1],body));
        if(pathname==='/api/craft/check'&&req.method==='POST'){const locale=typeof body.locale==='string'?body.locale.slice(0,35):'en',field=(value,max)=>typeof value==='string'?value.slice(0,max):'';return json(res,200,{hook:craft.scoreHook(field(body.hook,1000),{locale}),packaging:craft.lintPackaging({title:field(body.title,300),thumbnailText:field(body.thumbnailText,200),locale})});}
        const watchRoute=pathname.match(/^\/api\/competitor-watch\/([a-f0-9-]+)$/);
        if(watchRoute&&req.method==='POST')return json(res,200,competitorIntel.saveWatch(watchRoute[1],body));
        if(pathname==='/api/backups'&&req.method==='POST'){requireBackups();return json(res,200,await backups.create({by:body.requestedBy}));}
        if(pathname==='/api/backups/settings'&&req.method==='POST'){requireBackups();return json(res,200,backups.saveSettings(body));}
        if(pathname==='/api/backups/restore/cancel'&&req.method==='POST'){requireBackups();return json(res,200,backups.cancelRestore());}
        const backupAction=pathname.match(/^\/api\/backups\/([0-9TZ]+-[0-9a-f]{4})\/(verify|restore)$/);
        if(backupAction&&req.method==='POST'){requireBackups();return json(res,200,backupAction[2]==='verify'?await backups.verify(backupAction[1]):await backups.requestRestore(backupAction[1],{by:body.requestedBy,confirmed:body.confirmed}));}
        const editTool=pathname.match(/^\/api\/edit-revisions\/([a-f0-9-]+)\/(frame|command)$/);
        if(editTool&&editTool[2]==='frame'&&req.method==='POST')return json(res,200,await editingRoom.frame(editTool[1],body));
        if(editTool&&editTool[2]==='command'&&req.method==='POST')return json(res,200,await editingRoom.command(editTool[1],body));
        const editAction=pathname.match(/^\/api\/edit-revisions\/([a-f0-9-]+)\/(ops|undo)$/);
        if(editAction&&req.method==='POST')return json(res,200,editAction[2]==='ops'?editingRoom.applyOps(editAction[1],body):editingRoom.undo(editAction[1],body));
        const renderQueue=pathname.match(/^\/api\/content\/([a-f0-9-]+)\/renders$/);
        if(renderQueue&&req.method==='POST')return json(res,200,renderRoom.queueRender(renderQueue[1],body));
        const scanStart=pathname.match(/^\/api\/renders\/([a-f0-9-]+)\/frame-scan$/);
        if(scanStart&&req.method==='POST')return json(res,200,frameScanner.queue(scanStart[1],body));
        const scanRetry=pathname.match(/^\/api\/frame-scans\/([a-f0-9-]+)\/retry$/);
        if(scanRetry&&req.method==='POST')return json(res,200,frameScanner.retry(scanRetry[1],body));
        const studyStart=pathname.match(/^\/api\/families\/([a-f0-9-]+)\/style-studies$/);
        if(studyStart&&req.method==='POST')return json(res,200,styleStudies.create(studyStart[1],body));
        const studyAction=pathname.match(/^\/api\/style-studies\/([a-f0-9-]+)\/(retry|review|style-draft)$/);
        if(studyAction&&req.method==='POST'){const [,id,kind]=studyAction;return json(res,200,kind==='retry'?styleStudies.retry(id,body):kind==='review'?styleStudies.review(id,body):styleStudies.styleDraft(id,body));}
        const scanSettings=pathname.match(/^\/api\/families\/([a-f0-9-]+)\/frame-scan-settings$/);
        if(scanSettings&&req.method==='POST')return json(res,200,frameScanner.saveSettings(scanSettings[1],body));
        const renderAction=pathname.match(/^\/api\/renders\/([a-f0-9-]+)\/(cancel|retry|review|master|approve-master)$/);
        if(renderAction&&req.method==='POST'){const [,id,kind]=renderAction;return json(res,200,kind==='cancel'?renderRoom.cancel(id,body):kind==='retry'?renderRoom.retry(id,body):kind==='master'?renderRoom.queueMaster(id,body):kind==='approve-master'?renderRoom.approveMaster(id,body):renderRoom.review(id,body));}
        const visualSettings=pathname.match(/^\/api\/families\/([a-f0-9-]+)\/visual-settings$/);
        if(visualSettings&&req.method==='POST')return json(res,200,sceneRoom.saveSettings(visualSettings[1],body));
        const scenePlan=pathname.match(/^\/api\/content\/([a-f0-9-]+)\/scene-plans$/);
        if(scenePlan&&req.method==='POST')return json(res,200,sceneRoom.createPlan(scenePlan[1],body));
        const planRetry=pathname.match(/^\/api\/scene-plan-jobs\/([a-f0-9-]+)\/retry$/);
        if(planRetry&&req.method==='POST')return json(res,200,sceneRoom.retryPlan(planRetry[1],body));
        const manifestAction=pathname.match(/^\/api\/scene-manifests\/([a-f0-9-]+)\/(revisions|review|search-all|pick-top|generate-all|draw-all|visual-approval|redesign-frame|redraw-undesigned|shot-picture)$/);
        if(manifestAction&&req.method==='POST'){const [,id,kind]=manifestAction;const handler={revisions:()=>sceneRoom.editManifest(id,body),review:()=>sceneRoom.reviewManifest(id,body),'search-all':()=>sceneRoom.queueSearchAll(id,body),'pick-top':()=>sceneRoom.queuePickTop(id,body),'generate-all':()=>sceneRoom.queueGenerateAll(id,body),'draw-all':()=>sceneRoom.queueDrawAll(id,body),'visual-approval':()=>sceneRoom.approveVisuals(id,body),'redesign-frame':()=>sceneRoom.redesignFrame(id,body),'redraw-undesigned':()=>sceneRoom.redrawUndesigned(id,body),'shot-picture':()=>sceneRoom.pictureForShot(id,body)}[kind];return json(res,200,await handler());}
        const shotAction=pathname.match(/^\/api\/scene-shots\/(search|generate|select)$/);
        if(shotAction&&req.method==='POST'){const kind=shotAction[1];return json(res,200,kind==='search'?sceneRoom.queueSearch(body):kind==='generate'?sceneRoom.queueGenerate(body):sceneRoom.select(body));}
        const candidateImport=pathname.match(/^\/api\/visual-candidates\/([a-f0-9-]+)\/import$/);
        if(candidateImport&&req.method==='POST')return json(res,200,sceneRoom.queueImport(candidateImport[1],body));
        const visualRetry=pathname.match(/^\/api\/visual-jobs\/([a-f0-9-]+)\/retry$/);
        if(visualRetry&&req.method==='POST')return json(res,200,sceneRoom.retryJob(visualRetry[1],body));
        const visualRevoke=pathname.match(/^\/api\/visual-approvals\/([a-f0-9-]+)\/revoke$/);
        if(visualRevoke&&req.method==='POST')return json(res,200,sceneRoom.revokeApproval(visualRevoke[1],body));
        if(pathname==='/api/skills'&&req.method==='POST')return json(res,200,skills.saveOwnerSkill(body));
        if(pathname==='/api/skills/import'&&req.method==='POST')return json(res,200,skills.importPack(body));
        if(pathname==='/api/skills/packs/approve'&&req.method==='POST')return json(res,200,skills.approvePack(body));
        if(pathname==='/api/skill-bindings'&&req.method==='POST')return json(res,200,skills.bind(body));
        const skillRevision=pathname.match(/^\/api\/skills\/([a-z][a-z0-9]*\.[a-z0-9][a-z0-9-]*)\/revisions$/);
        if(skillRevision&&req.method==='POST')return json(res,200,skills.createRevision(skillRevision[1],body));
        const skillDecision=pathname.match(/^\/api\/skill-revisions\/([a-f0-9-]+)\/(approve|retire)$/);
        if(skillDecision&&req.method==='POST')return json(res,200,skillDecision[2]==='approve'?skills.approveRevision(skillDecision[1],body):skills.retireRevision(skillDecision[1],body));
        const skillUnbind=pathname.match(/^\/api\/skill-bindings\/([a-f0-9-]+)\/remove$/);
        if(skillUnbind&&req.method==='POST')return json(res,200,skills.unbind(skillUnbind[1],body));
        const lessonReview=pathname.match(/^\/api\/skill-lessons\/([a-f0-9-]+)\/review$/);
        if(lessonReview&&req.method==='POST')return json(res,200,skills.reviewLesson(lessonReview[1],body));
        const projectState=pathname.match(/^\/api\/families\/([a-f0-9-]+)\/project-state$/);
        if(projectState&&req.method==='POST')return json(res,200,skills.recordProjectState(projectState[1],body));
        const projectStateEnd=pathname.match(/^\/api\/project-state\/([a-f0-9-]+)\/end$/);
        if(projectStateEnd&&req.method==='POST')return json(res,200,skills.endProjectState(projectStateEnd[1],body));
        if(pathname==='/api/styles'&&req.method==='POST')return json(res,200,styles.createProfile(body));
        const styleRevision=pathname.match(/^\/api\/styles\/([a-f0-9-]+)\/revisions$/);
        if(styleRevision&&req.method==='POST')return json(res,200,styles.createRevision(styleRevision[1],body));
        const styleDecision=pathname.match(/^\/api\/style-revisions\/([a-f0-9-]+)\/(approve|retire)$/);
        if(styleDecision&&req.method==='POST')return json(res,200,styleDecision[2]==='approve'?styles.approveRevision(styleDecision[1],body):styles.retireRevision(styleDecision[1],body));
        const styleAssign=pathname.match(/^\/api\/families\/([a-f0-9-]+)\/style-assignments$/);
        if(styleAssign&&req.method==='POST')return json(res,200,styles.assign(styleAssign[1],body));
        const styleAssignment=pathname.match(/^\/api\/style-assignments\/([a-f0-9-]+)\/(revoke|fallback)$/);
        if(styleAssignment&&req.method==='POST')return json(res,200,styleAssignment[2]==='revoke'?styles.revoke(styleAssignment[1],body):styles.setFallback(styleAssignment[1],body));
        const voiceProfile=pathname.match(/^\/api\/families\/([a-f0-9-]+)\/voice-profiles$/);
        if(voiceProfile&&req.method==='POST')return json(res,200,store.saveVoiceProfile(voiceProfile[1],body));
        const voiceAudition=pathname.match(/^\/api\/content\/([a-f0-9-]+)\/voice-auditions$/);
        if(voiceAudition&&req.method==='POST'){if(ffmpegAvailable!==true)throw new InputError('FFmpeg and ffprobe must pass local preflight before a billable voice audition can be admitted.',503);return json(res,200,store.queueVoiceAudition(voiceAudition[1],body));}
        const soundtrackSettings=pathname.match(/^\/api\/families\/([a-f0-9-]+)\/soundtrack-settings$/);
        if(soundtrackSettings&&req.method==='POST')return json(res,200,soundtrack.saveSettings(soundtrackSettings[1],body));
        const scoreRoute=pathname.match(/^\/api\/content\/([a-f0-9-]+)\/score$/);
        if(scoreRoute&&req.method==='POST')return json(res,200,body?.mode==='rules'?soundtrack.rulesScore(scoreRoute[1],body):soundtrack.queueScore(scoreRoute[1],body));
        const scoreRetry=pathname.match(/^\/api\/score-jobs\/([a-f0-9-]+)\/retry$/);
        if(scoreRetry&&req.method==='POST')return json(res,200,soundtrack.retryScore(scoreRetry[1],body));
        const scoreAction=pathname.match(/^\/api\/scores\/([a-f0-9-]+)\/(edit|generate)$/);
        if(scoreAction&&req.method==='POST')return json(res,200,scoreAction[2]==='edit'?soundtrack.editScore(scoreAction[1],body):soundtrack.queueMusic(scoreAction[1],body));
        if(pathname==='/api/sounds/import'&&req.method==='POST')return json(res,200,soundLibrary.queueImport(body));
        if(pathname==='/api/sound-online/search'&&req.method==='POST')return json(res,200,await soundOnline.search(body));
        if(pathname==='/api/sound-online/add'&&req.method==='POST')return json(res,200,await soundOnline.add(body));
        if(pathname==='/api/sound-online/fill'&&req.method==='POST')return json(res,200,soundOnline.queueFill(body));
        const soundImport=pathname.match(/^\/api\/sound-imports\/([a-f0-9-]+)\/continue$/);
        if(soundImport&&req.method==='POST')return json(res,200,soundLibrary.continueImport(soundImport[1]));
        const soundEdit=pathname.match(/^\/api\/sounds\/([a-f0-9]{64})$/);
        if(soundEdit&&req.method==='POST')return json(res,200,soundLibrary.update(soundEdit[1],body));
        const sfxPick=pathname.match(/^\/api\/families\/([a-f0-9-]+)\/sfx-pick$/);
        if(sfxPick&&req.method==='POST')return json(res,200,soundtrack.chooseEffect(sfxPick[1],body));
        const sfxLibrary=pathname.match(/^\/api\/families\/([a-f0-9-]+)\/sfx-library$/);
        if(sfxLibrary&&req.method==='POST')return json(res,200,soundtrack.queueLibrary(sfxLibrary[1],body));
        const audioRetry=pathname.match(/^\/api\/audio-jobs\/([a-f0-9-]+)\/retry$/);
        if(audioRetry&&req.method==='POST')return json(res,200,soundtrack.retryAudio(audioRetry[1],body));
        const voiceDirect=pathname.match(/^\/api\/content\/([a-f0-9-]+)\/voice-direction$/);
        if(voiceDirect&&req.method==='POST')return json(res,200,voiceDirector.queue(voiceDirect[1],body));
        const voiceDirectRetry=pathname.match(/^\/api\/voice-direction-jobs\/([a-f0-9-]+)\/retry$/);
        if(voiceDirectRetry&&req.method==='POST')return json(res,200,voiceDirector.retry(voiceDirectRetry[1],body));
        const voiceDirectEdit=pathname.match(/^\/api\/voice-directions\/([a-f0-9-]+)\/edit$/);
        if(voiceDirectEdit&&req.method==='POST')return json(res,200,voiceDirector.edit(voiceDirectEdit[1],body));
        const voiceRetry=pathname.match(/^\/api\/voice-jobs\/([a-f0-9-]+)\/retry$/);
        if(voiceRetry&&req.method==='POST')return json(res,200,store.retryVoiceAudition(voiceRetry[1],body));
        const voiceSelect=pathname.match(/^\/api\/voice-auditions\/([a-f0-9-]+)\/select$/);
        if(voiceSelect&&req.method==='POST')return json(res,200,store.selectVoiceAudition(voiceSelect[1],body));
        const voiceRevoke=pathname.match(/^\/api\/voice-approvals\/([a-f0-9-]+)\/revoke$/);
        if(voiceRevoke&&req.method==='POST')return json(res,200,store.revokeVoiceApproval(voiceRevoke[1],body));
        const evidenceRoute=pathname.match(/^\/api\/research\/evidence\/([a-f0-9-]+)(?:\/(archive))?$/);
        if(evidenceRoute){if(!evidenceRoute[2]&&req.method==='PUT')return json(res,200,store.saveResearchEvidence(body,evidenceRoute[1]));if(evidenceRoute[2]==='archive'&&req.method==='POST')return json(res,200,store.archiveResearchEvidence(evidenceRoute[1],body));throw new InputError('Action not found.',404);}
        const researchRetry=pathname.match(/^\/api\/research-jobs\/([a-f0-9-]+)\/retry$/);
        if(researchRetry&&req.method==='POST')return json(res,200,researchReasoning.retry(researchRetry[1],body));
        const researchBrief=pathname.match(/^\/api\/families\/([a-f0-9-]+)\/research-briefs$/);
        if(researchBrief&&req.method==='POST')return json(res,200,researchReasoning.queue(researchBrief[1],body));
        const retry=pathname.match(/^\/api\/script-jobs\/([a-f0-9-]+)\/retry$/);
        if(retry&&req.method==='POST')return json(res,200,reasoning.retry(retry[1],body));
        const match=pathname.match(/^\/api\/(families|content)\/([a-f0-9-]+)(?:\/(archive|delete|review|storyboard|ai-script))?$/);
        if(!match)throw new InputError('Action not found.',404);
        const [,kind,id,action]=match;
        if(kind==='families' && !action && req.method==='PUT')result=store.saveFamily(body,id);
        else if(kind==='families' && action==='archive' && req.method==='POST')result=store.archiveFamily(id,body);
        else if(kind==='families' && action==='delete' && req.method==='POST')result=store.deleteFamily(id,body);
        else if(kind==='content' && !action && req.method==='PUT')result=store.saveContent(body,id);
        else if(kind==='content' && action==='review' && req.method==='POST')result=store.reviewContent(id,body);
        else if(kind==='content' && action==='storyboard' && req.method==='POST')result=store.queueStoryboard(id,body);
        else if(kind==='content' && action==='ai-script' && req.method==='POST')result=reasoning.queue(id,body);
        else throw new InputError('Action not found.',404);
      }
      json(res,200,result);
    }catch(error){if(!(error instanceof InputError))console.error('Request failed:',error.message);json(res,error.status||500,{error:error.status?error.message:'Something went wrong. Your last saved work is retained.'});}
  });
  server.requestTimeout=15000;server.headersTimeout=10000;
  server.on('listening',()=>{if(worker)timer=setInterval(()=>{try{store.processNextJob();reasoning.processNext().catch(error=>console.error('Script worker:',error.message));researchReasoning.processNext().catch(error=>console.error('Research worker:',error.message));voiceRuntime.processNext().catch(error=>console.error('Voice worker:',error.message));competitorIntel.processNextScan().catch(error=>console.error('Competitor scan worker:',error.message));styleStudies.processNext().catch(error=>console.error('Style study worker:',error.message));competitorIntel.processNextAnalysis().catch(error=>console.error('Competitor analysis worker:',error.message));nicheFactory.processNextDiscovery().catch(error=>console.error('Niche discovery worker:',error.message));nicheFactory.processNextEvaluation().catch(error=>console.error('Niche evaluation worker:',error.message));nicheFactory.processNextRead().catch(error=>console.error('Screenshot read worker:',error.message));trends.processNextScan().catch(error=>console.error('Trend scan worker:',error.message));trends.processNextTopics().catch(error=>console.error('Trend topic worker:',error.message));sceneRoom.processNextPlan().catch(error=>console.error('Scene planner worker:',error.message));sceneRoom.processNextVisual().catch(error=>console.error('Visual worker:',error.message));renderRoom.processNext().catch(error=>console.error('Render worker:',error.message));frameScanner.processNext().catch(error=>console.error('Frame scan worker:',error.message));packagingRoom.processNext().catch(error=>console.error('Packaging worker:',error.message));localizationRoom.processNext().catch(error=>console.error('Localization worker:',error.message));localizationRoom.processNextNarration().catch(error=>console.error('Edition narration worker:',error.message));publishingRoom.processNext().catch(error=>console.error('Publishing worker:',error.message));voiceDirector.processNext().catch(error=>console.error('Voice direction worker:',error.message));soundtrack.processNextScore().catch(error=>console.error('Music score worker:',error.message));soundtrack.processNextAudio().catch(error=>console.error('Music and effects worker:',error.message));soundLibrary.processNextImport().catch(error=>console.error('Sound import:',error.message));soundOnline.processNextFill().catch(error=>console.error('Freesound fill:',error.message));if(++ticks%1200===0){competitorIntel.purgeExpiredYouTubeData();sceneRoom.purgeExpired();}}catch(error){console.error('Planning worker:',error.message);}},500);});
  // Automatic backups (A02): checked a few minutes after start, then every quarter hour; one runs when the newest
  // backup is older than the setting and no render is running.
  let backupTimer=null,backupFirst=null;const backupTick=()=>backups?.autoTick().catch(error=>console.error(`${new Date().toISOString()} Automatic backup failed:`,error.message));
  server.on('listening',()=>{if(worker&&backups){backupFirst=setTimeout(backupTick,3*60*1000);backupTimer=setInterval(backupTick,15*60*1000);}});
  // The competitor watch (0.57): checked every half hour; the scans themselves run on the normal worker.
  let watchTimer=null;server.on('listening',()=>{if(worker)watchTimer=setInterval(()=>{try{const done=competitorIntel.watchTick();if(done.length)console.log(`${new Date().toISOString()} Competitor watch:`,JSON.stringify(done));}catch(error){console.error('Competitor watch:',error.message);}},30*60*1000);});
  server.on('close',()=>{clearInterval(timer);clearTimeout(backupFirst);clearInterval(backupTimer);clearInterval(watchTimer);store.close();});
  return {server,store,dataRoot,backups,soundLibrary,soundOnline,styles,quota,competitorIntel,styleStudies,nicheFactory,trends,sceneRoom,renderRoom,editingRoom,frameScanner,packagingRoom,localizationRoom,publishingRoom,voiceDirector,soundtrack,connectors,ai,reasoning,researchReasoning,voiceRuntime,voiceReady};
}
if(require.main===module){
  const port=Number(process.env.PORT||3456);
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('PORT must be a whole number between 1024 and 65535.');
  const {server}=createApp({dataFile:process.env.CONTROL_ROOM_DATA_FILE||undefined});
  server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`Port ${port} is in use. Close the other app or set PORT to another local port.`:error.message);process.exit(1);});
  server.listen(port,'127.0.0.1',()=>console.log(`YouTube Control Room ${APP_VERSION}\nOpen http://127.0.0.1:${port}\nLocal planning, review-only research, bounded reasoning, human-controlled voice auditions and the style library. Publishing is not enabled.`));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close());
  // One unexpected error in a background job must not stop the whole program (the page would only say
  // "Failed to fetch"); it is written to data/server-error.log and every job keeps its own recorded state.
  process.on('unhandledRejection',error=>console.error(`${new Date().toISOString()} Unhandled background error (the program keeps running):`,error?.stack||error));
  process.on('uncaughtException',error=>console.error(`${new Date().toISOString()} Unexpected error (the program keeps running):`,error?.stack||error));
}
module.exports={createApp};
