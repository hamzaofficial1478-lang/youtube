'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {randomBytes,timingSafeEqual}=require('node:crypto');
const {Store,InputError}=require('./store');
const {WindowsVault,YouTubeResearch}=require('./youtube');
const {ConnectorSlots,PROVIDERS}=require('./connectors');
const {HermesReasoning}=require('./hermes');
const {ResearchReasoning}=require('./research');
const {VoiceRuntime}=require('./voice');
const {StyleLibrary}=require('./style');
const {QuotaLedger}=require('./intel-sources');
const {CompetitorIntelligence}=require('./competitor-intel');
const {NicheFactory}=require('./niche-factory');
const {SceneRoom}=require('./scene-room');
const {RenderRoom}=require('./render-room');
const {SkillsEngine}=require('./skills');
const {getFFmpegPath}=require('./vendor/youtube-automation-agent/ffmpeg');
const root=__dirname;
const APP_VERSION=JSON.parse(fs.readFileSync(path.join(__dirname,'package.json'),'utf8')).version;
const files={ '/':['public/index.html','text/html; charset=utf-8'], '/app.js':['public/app.js','text/javascript; charset=utf-8'], '/style-room.js':['public/style-room.js','text/javascript; charset=utf-8'], '/intelligence.js':['public/intelligence.js','text/javascript; charset=utf-8'], '/scene-room.js':['public/scene-room.js','text/javascript; charset=utf-8'], '/render-room.js':['public/render-room.js','text/javascript; charset=utf-8'], '/skills-room.js':['public/skills-room.js','text/javascript; charset=utf-8'], '/style.css':['public/style.css','text/css; charset=utf-8'] };
function createApp({dataFile=path.join(root,'data','control-room.sqlite'),worker=true,research=null,protector=null,providerFetch=fetch,voiceOptions={}}={}) {
  const dataRoot=dataFile===':memory:'?path.join(root,'data'):path.dirname(path.resolve(dataFile));
  const store=new Store(dataFile,{artifactRoot:dataRoot}), token=randomBytes(32).toString('hex');
  research ||= new YouTubeResearch(new WindowsVault(path.dirname(dataFile)));
  const connectors=new ConnectorSlots(store,protector||new WindowsVault(path.dirname(dataFile)),providerFetch);
  const reasoning=new HermesReasoning(store,connectors);
  const researchReasoning=new ResearchReasoning(store,connectors);
  const ffmpeg=voiceOptions.ffmpeg||getFFmpegPath(),ffprobe=voiceOptions.ffprobe||process.env.FFPROBE_PATH||(path.isAbsolute(ffmpeg)?path.join(path.dirname(ffmpeg),process.platform==='win32'?'ffprobe.exe':'ffprobe'):'ffprobe');
  const styles=new StyleLibrary(store);
  // The Skills Engine attaches its runtime to the store so the prompt-building rooms can reach
  // the approved skill brief. Nothing is injected until a skill revision is approved by a human.
  const skills=new SkillsEngine(store,{root}).attach();
  const quota=new QuotaLedger(store),competitorIntel=new CompetitorIntelligence(store,connectors,quota,styles),nicheFactory=new NicheFactory(store,connectors,quota,styles);
  const sceneRoom=new SceneRoom(store,connectors,quota,styles,{dataRoot,ffmpeg,ffprobe,competitorIntel});
  const renderRoom=new RenderRoom(store,styles,sceneRoom,{dataRoot,ffmpeg,ffprobe});
  const voiceRuntime=new VoiceRuntime(store,connectors,{artifactDir:path.join(dataRoot,'voice-artifacts'),...voiceOptions,ffmpeg,ffprobe});
  let timer, ffmpegAvailable=null, ticks=0;
  const voiceReady=voiceRuntime.preflight().then(()=>{ffmpegAvailable=true;return true;}).catch(()=>{ffmpegAvailable=false;return false;});
  function json(res,code,body) {res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));}
  async function readBody(req) {
    if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw new InputError('Use application/json.',415);
    const chunks=[];let bytes=0;
    for await(const chunk of req){bytes+=chunk.length;if(bytes>262144)throw new InputError('Request is too large. Maximum 256 KB.',413);chunks.push(chunk);}
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
      if(req.headers['sec-fetch-site']==='cross-site')throw new InputError('Cross-site requests are not allowed.',403);
      const url=new URL(req.url,`http://${host}`), pathname=url.pathname;
      if(req.method==='GET'){
        if(Object.hasOwn(files,pathname)){const [filename,mime]=files[pathname],body=fs.readFileSync(path.join(root,filename));res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store'});return res.end(body);}
        if(pathname==='/favicon.ico'){res.writeHead(204);return res.end();}
        if(pathname==='/api/health')return json(res,200,{app:'youtube-control-room',version:APP_VERSION,mode:'local-control-room-with-reviewed-skills-engine'});
        if(pathname==='/api/state'){const skillState=skills.state(),connectorState=connectors.list(),hermesReady=connectorState.some(item=>item.provider==='hermes'&&item.hasKey&&!item.busy&&item.test?.status==='passed'),voiceReady=ffmpegAvailable===true&&connectorState.some(item=>['openai','elevenlabs'].includes(item.provider)&&item.hasKey&&!item.busy&&item.test?.status==='passed');return json(res,200,{...store.state(),app:{version:APP_VERSION},token,connectors:connectorState,connectorProviders:PROVIDERS,youtubeResearch:research.status(),styles:styles.state(),scenes:sceneRoom.state(),renders:renderRoom.state(),skills:skillState,intelligence:{competitors:competitorIntel.state(),niches:nicheFactory.state()},build:JSON.parse(fs.readFileSync(path.join(root,'docs/build-status.json'),'utf8')),
          capabilities:{skills:skillState.counts.approved>0?'approved_skills_injected':'drafts_only_not_injected',research:hermesReady?'review_only_saved_evidence':'saved_evidence_only',text:hermesReady?'bounded_hermes_candidates':'not_connected',translation:'not_implemented',voice:voiceReady?'bounded_primary_locale_auditions':'not_connected',youtube:'not_connected',agentReach:'reference_only',ffmpeg:ffmpegAvailable===null?'checking':ffmpegAvailable?'executable_detected':'not_found'}});}
        if(pathname==='/api/progress'){res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});return res.end(fs.readFileSync(path.join(root,'docs/BUILD-PROGRESS.md')));}
        if(pathname==='/api/production-plan'){res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});return res.end(fs.readFileSync(path.join(root,'docs/PRODUCTION-ROOM.md')));}
        if(pathname==='/api/templates/stickman'){res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});return res.end(fs.readFileSync(path.join(root,'vendor/stickman-video-director/skills__directing-stickman-videos__references__storyboard-template.md')));}
        const voiceAudio=pathname.match(/^\/api\/voice-auditions\/([a-f0-9-]+)\/audio$/);
        if(voiceAudio){const audition=store.voiceAudition(voiceAudio[1]),integrity=store.verifyVoiceArtifact(audition);if(!integrity.ok)throw new InputError(integrity.reason||'Voice artifact file is unavailable.',404);const {filename,stat}=integrity,range=req.headers.range;if(range){const match=range.match(/^bytes=(\d+)-(\d*)$/);if(!match)throw new InputError('Invalid audio byte range.',416);const start=Number(match[1]),end=match[2]?Number(match[2]):stat.size-1;if(!(Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start>=0&&end>=start&&end<stat.size))throw new InputError('Audio byte range is outside the artifact.',416);res.writeHead(206,{'Content-Type':audition.artifact.mime||'audio/wav','Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${stat.size}`,'Content-Length':end-start+1,'Cache-Control':'no-store'});return fs.createReadStream(filename,{start,end}).pipe(res);}res.writeHead(200,{'Content-Type':audition.artifact.mime||'audio/wav','Accept-Ranges':'bytes','Content-Length':stat.size,'Cache-Control':'no-store'});return fs.createReadStream(filename).pipe(res);}
        const renderFile=pathname.match(/^\/api\/renders\/([a-f0-9-]+)\/(video|sheet|manifest)$/);
        if(renderFile){const {file,mime,size}=renderRoom.file(renderFile[1],renderFile[2]);const range=req.headers.range;if(renderFile[2]==='video'&&range){const match=range.match(/^bytes=(\d*)-(\d*)$/);if(!match||(!match[1]&&!match[2]))throw new InputError('Invalid video byte range.',416);let start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2])),end=match[1]&&match[2]?Math.min(Number(match[2]),size-1):size-1;if(!(start>=0&&start<=end&&end<size))throw new InputError('Video byte range is outside the file.',416);res.writeHead(206,{'Content-Type':mime,'Content-Range':`bytes ${start}-${end}/${size}`,'Accept-Ranges':'bytes','Content-Length':end-start+1,'Cache-Control':'no-store'});return fs.createReadStream(file,{start,end}).pipe(res);}res.writeHead(200,{'Content-Type':mime,'Content-Length':size,'Accept-Ranges':renderFile[2]==='video'?'bytes':'none','Cache-Control':'no-store'});return fs.createReadStream(file).pipe(res);}
        const sceneBoard=pathname.match(/^\/api\/scene-manifests\/([a-f0-9-]+)\/board$/);
        if(sceneBoard)return json(res,200,sceneRoom.boardSummary(sceneBoard[1]));
        if(pathname==='/api/scene-candidates')return json(res,200,sceneRoom.candidates(String(url.searchParams.get('contentId')||''),String(url.searchParams.get('shotId')||'')));
        if(pathname==='/api/skills/export')return json(res,200,{status:url.searchParams.get('status')==='latest'?'latest':'approved',skills:skills.exportPack({status:url.searchParams.get('status')==='latest'?'latest':'approved'})});
        if(pathname==='/api/skills/brief')return json(res,200,skills.brief(String(url.searchParams.get('taskKey')||''),{familyId:url.searchParams.get('familyId')||null}));
        if(pathname==='/api/skills/effect')return json(res,200,skills.effect(String(url.searchParams.get('skillId')||'')));
        const visualFile=pathname.match(/^\/api\/(visual-candidates|visual-assets)\/([a-f0-9-]+)\/(preview|thumb|file)$/);
        if(visualFile){const [,kind,id,part]=visualFile;if((kind==='visual-candidates')!==(part==='preview'))throw new InputError('Page not found.',404);const {file,mime}=kind==='visual-candidates'?sceneRoom.candidatePreview(id):sceneRoom.assetFile(id,part);let body;try{body=fs.readFileSync(file);}catch{throw new InputError('Media file is unavailable.',404);}res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store','Content-Length':body.length});return res.end(body);}
        const exported=pathname.match(/^\/api\/content\/([a-f0-9-]+)\/export$/);
        if(exported){const data=store.exportContent(exported[1]);res.setHeader('Content-Disposition',`attachment; filename="content-${exported[1]}-v${data.content.revision}.json"`);return json(res,200,data);}
        throw new InputError('Page not found.',404);
      }
      if(!['POST','PUT'].includes(req.method))throw new InputError('Method not supported.',405);
      const supplied=Buffer.from(String(req.headers['x-local-token']||''));const expected=Buffer.from(token);
      if(supplied.length!==expected.length || !timingSafeEqual(supplied,expected))throw new InputError('Reload the app before saving.',403);
      const body=await readBody(req);let result;
      if(pathname==='/api/connectors'&&req.method==='POST')return json(res,200,connectors.save(body));
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
        if(pathname==='/api/render-readiness'&&req.method==='POST')return json(res,200,await renderRoom.checkReadiness(body));
        if(pathname==='/api/render-pins'&&req.method==='POST')return json(res,200,renderRoom.pin(body));
        const renderQueue=pathname.match(/^\/api\/content\/([a-f0-9-]+)\/renders$/);
        if(renderQueue&&req.method==='POST')return json(res,200,renderRoom.queueRender(renderQueue[1],body));
        const renderAction=pathname.match(/^\/api\/renders\/([a-f0-9-]+)\/(cancel|retry|review)$/);
        if(renderAction&&req.method==='POST'){const [,id,kind]=renderAction;return json(res,200,kind==='cancel'?renderRoom.cancel(id,body):kind==='retry'?renderRoom.retry(id,body):renderRoom.review(id,body));}
        const visualSettings=pathname.match(/^\/api\/families\/([a-f0-9-]+)\/visual-settings$/);
        if(visualSettings&&req.method==='POST')return json(res,200,sceneRoom.saveSettings(visualSettings[1],body));
        const scenePlan=pathname.match(/^\/api\/content\/([a-f0-9-]+)\/scene-plans$/);
        if(scenePlan&&req.method==='POST')return json(res,200,sceneRoom.createPlan(scenePlan[1],body));
        const planRetry=pathname.match(/^\/api\/scene-plan-jobs\/([a-f0-9-]+)\/retry$/);
        if(planRetry&&req.method==='POST')return json(res,200,sceneRoom.retryPlan(planRetry[1],body));
        const manifestAction=pathname.match(/^\/api\/scene-manifests\/([a-f0-9-]+)\/(revisions|review|search-all|pick-top|generate-all|visual-approval)$/);
        if(manifestAction&&req.method==='POST'){const [,id,kind]=manifestAction;const handler={revisions:()=>sceneRoom.editManifest(id,body),review:()=>sceneRoom.reviewManifest(id,body),'search-all':()=>sceneRoom.queueSearchAll(id,body),'pick-top':()=>sceneRoom.queuePickTop(id,body),'generate-all':()=>sceneRoom.queueGenerateAll(id,body),'visual-approval':()=>sceneRoom.approveVisuals(id,body)}[kind];return json(res,200,await handler());}
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
        const retry=pathname.match(/^\/api\/hermes-jobs\/([a-f0-9-]+)\/retry$/);
        if(retry&&req.method==='POST')return json(res,200,reasoning.retry(retry[1],body));
        const match=pathname.match(/^\/api\/(families|content)\/([a-f0-9-]+)(?:\/(archive|review|storyboard|hermes-script))?$/);
        if(!match)throw new InputError('Action not found.',404);
        const [,kind,id,action]=match;
        if(kind==='families' && !action && req.method==='PUT')result=store.saveFamily(body,id);
        else if(kind==='families' && action==='archive' && req.method==='POST')result=store.archiveFamily(id,body);
        else if(kind==='content' && !action && req.method==='PUT')result=store.saveContent(body,id);
        else if(kind==='content' && action==='review' && req.method==='POST')result=store.reviewContent(id,body);
        else if(kind==='content' && action==='storyboard' && req.method==='POST')result=store.queueStoryboard(id,body);
        else if(kind==='content' && action==='hermes-script' && req.method==='POST')result=reasoning.queue(id,body);
        else throw new InputError('Action not found.',404);
      }
      json(res,200,result);
    }catch(error){if(!(error instanceof InputError))console.error('Request failed:',error.message);json(res,error.status||500,{error:error.status?error.message:'Something went wrong. Your last saved work is retained.'});}
  });
  server.requestTimeout=15000;server.headersTimeout=10000;
  server.on('listening',()=>{if(worker)timer=setInterval(()=>{try{store.processNextJob();reasoning.processNext().catch(error=>console.error('Hermes worker:',error.message));researchReasoning.processNext().catch(error=>console.error('Research worker:',error.message));voiceRuntime.processNext().catch(error=>console.error('Voice worker:',error.message));competitorIntel.processNextScan().catch(error=>console.error('Competitor scan worker:',error.message));competitorIntel.processNextAnalysis().catch(error=>console.error('Competitor analysis worker:',error.message));nicheFactory.processNextDiscovery().catch(error=>console.error('Niche discovery worker:',error.message));nicheFactory.processNextEvaluation().catch(error=>console.error('Niche evaluation worker:',error.message));sceneRoom.processNextPlan().catch(error=>console.error('Scene planner worker:',error.message));sceneRoom.processNextVisual().catch(error=>console.error('Visual worker:',error.message));renderRoom.processNext().catch(error=>console.error('Render worker:',error.message));if(++ticks%1200===0){competitorIntel.purgeExpiredYouTubeData();sceneRoom.purgeExpired();}}catch(error){console.error('Planning worker:',error.message);}},500);});
  server.on('close',()=>{clearInterval(timer);store.close();});
  return {server,store,styles,quota,competitorIntel,nicheFactory,sceneRoom,renderRoom,connectors,reasoning,researchReasoning,voiceRuntime,voiceReady};
}
if(require.main===module){
  const port=Number(process.env.PORT||3456);
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('PORT must be a whole number between 1024 and 65535.');
  const {server}=createApp({dataFile:process.env.CONTROL_ROOM_DATA_FILE||undefined});
  server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`Port ${port} is in use. Close the other app or set PORT to another local port.`:error.message);process.exit(1);});
  server.listen(port,'127.0.0.1',()=>console.log(`YouTube Control Room ${APP_VERSION}\nOpen http://127.0.0.1:${port}\nLocal planning, review-only research, bounded reasoning, human-controlled voice auditions and the style library. Publishing is not enabled.`));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close());
}
module.exports={createApp};
