'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {randomBytes,timingSafeEqual}=require('node:crypto');
const {Store,InputError}=require('./store');
const {WindowsVault,YouTubeResearch}=require('./youtube');
const {ConnectorSlots,PROVIDERS}=require('./connectors');
const {checkFFmpeg}=require('./vendor/youtube-automation-agent/ffmpeg');
const root=__dirname;
const files={ '/':['public/index.html','text/html; charset=utf-8'], '/app.js':['public/app.js','text/javascript; charset=utf-8'], '/style.css':['public/style.css','text/css; charset=utf-8'] };
function createApp({dataFile=path.join(root,'data','control-room.sqlite'),worker=true,research=null,protector=null,providerFetch=fetch}={}) {
  const store=new Store(dataFile), token=randomBytes(32).toString('hex');
  research ||= new YouTubeResearch(new WindowsVault(path.dirname(dataFile)));
  const connectors=new ConnectorSlots(store,protector||new WindowsVault(path.dirname(dataFile)),providerFetch);
  let timer, ffmpegAvailable=null;
  checkFFmpeg().then(available=>{ffmpegAvailable=available;}).catch(()=>{ffmpegAvailable=false;});
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
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const port=server.address().port, host=req.headers.host;
      if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(host))throw new InputError('This application accepts local requests only.',403);
      if(req.headers.origin && req.headers.origin!==`http://${host}`)throw new InputError('Cross-origin requests are not allowed.',403);
      if(req.headers['sec-fetch-site']==='cross-site')throw new InputError('Cross-site requests are not allowed.',403);
      const url=new URL(req.url,`http://${host}`), pathname=url.pathname;
      if(req.method==='GET'){
        if(Object.hasOwn(files,pathname)){const [filename,mime]=files[pathname];res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store'});return res.end(fs.readFileSync(path.join(root,filename)));}
        if(pathname==='/favicon.ico'){res.writeHead(204);return res.end();}
        if(pathname==='/api/health')return json(res,200,{app:'youtube-control-room',version:'0.3.0',mode:'local-planning'});
        if(pathname==='/api/state')return json(res,200,{...store.state(),token,connectors:connectors.list(),connectorProviders:PROVIDERS,youtubeResearch:research.status(),build:JSON.parse(fs.readFileSync(path.join(root,'docs/build-status.json'),'utf8')),
          capabilities:{research:'not_connected',text:'not_connected',translation:'not_implemented',voice:'not_connected',youtube:'not_connected',agentReach:'reference_only',ffmpeg:ffmpegAvailable===null?'checking':ffmpegAvailable?'executable_detected':'not_found'}});
        if(pathname==='/api/progress'){res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});return res.end(fs.readFileSync(path.join(root,'docs/BUILD-PROGRESS.md')));}
        if(pathname==='/api/templates/stickman'){res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});return res.end(fs.readFileSync(path.join(root,'vendor/stickman-video-director/skills__directing-stickman-videos__references__storyboard-template.md')));}
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
      else {
        const match=pathname.match(/^\/api\/(families|content)\/([a-f0-9-]+)(?:\/(archive|review|storyboard))?$/);
        if(!match)throw new InputError('Action not found.',404);
        const [,kind,id,action]=match;
        if(kind==='families' && !action && req.method==='PUT')result=store.saveFamily(body,id);
        else if(kind==='families' && action==='archive' && req.method==='POST')result=store.archiveFamily(id,body);
        else if(kind==='content' && !action && req.method==='PUT')result=store.saveContent(body,id);
        else if(kind==='content' && action==='review' && req.method==='POST')result=store.reviewContent(id,body);
        else if(kind==='content' && action==='storyboard' && req.method==='POST')result=store.queueStoryboard(id,body);
        else throw new InputError('Action not found.',404);
      }
      json(res,200,result);
    }catch(error){if(!(error instanceof InputError))console.error('Request failed:',error.message);json(res,error.status||500,{error:error.status?error.message:'Something went wrong. Your last saved work is retained.'});}
  });
  server.requestTimeout=15000;server.headersTimeout=10000;
  server.on('listening',()=>{if(worker)timer=setInterval(()=>{try{store.processNextJob();}catch(error){console.error('Planning worker:',error.message);}},500);});
  server.on('close',()=>{clearInterval(timer);store.close();});
  return {server,store};
}
if(require.main===module){
  const port=Number(process.env.PORT||3456);
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('PORT must be a whole number between 1024 and 65535.');
  const {server}=createApp({dataFile:process.env.CONTROL_ROOM_DATA_FILE||undefined});
  server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`Port ${port} is in use. Close the other app or set PORT to another local port.`:error.message);process.exit(1);});
  server.listen(port,'127.0.0.1',()=>console.log(`YouTube Control Room 0.3.0\nOpen http://127.0.0.1:${port}\nLocal planning with optional public YouTube lookup. No paid generation or publishing is enabled.`));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close());
}
module.exports={createApp};
