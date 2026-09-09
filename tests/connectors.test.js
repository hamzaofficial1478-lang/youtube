'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {Store}=require('../store');
const {ConnectorSlots}=require('../connectors');
const {WindowsVault}=require('../youtube');
const {createApp}=require('../server');
const key='fixture-only-'+'x'.repeat(30);
// Reversible fixture transformer; actual Windows DPAPI is checked separately below.
const fixtureProtector={transform:(operation,input)=>Buffer.from([...input].reverse())};
const base={name:'Primary project',provider:'openai',notes:'Metadata test only',key};
function setup(t,fetchImpl=async()=>Response.json({data:[]})){
  const store=new Store(':memory:');t.after(()=>store.close());
  return new ConnectorSlots(store,fixtureProtector,fetchImpl);
}

test('slots create, edit, retain or clear keys, reject stale revisions and delete independently',async t=>{
  const slots=setup(t),a=slots.save(base),b=slots.save({...base,name:'Second project',key:key+'2'});
  assert.equal(a.hasKey,true);assert.equal(a.test,null);assert.equal(JSON.stringify(slots.list()).includes(key),false);
  await slots.test(a.id,1);assert.equal(slots.list()[0].test.status,'passed');
  const edit=slots.save({...base,name:'Renamed',key:'',revision:1},a.id);
  assert.equal(edit.revision,2);assert.equal(edit.test,null);assert.equal(slots.key(a.id),key);
  assert.throws(()=>slots.save({...base,revision:1},a.id),{status:409});
  assert.throws(()=>slots.remove(a.id,1),{status:409});
  assert.throws(()=>slots.save({...base,provider:'elevenlabs',revision:2},a.id));
  slots.save({...base,name:'Renamed',key:'',clearKey:true,revision:2},a.id);
  await assert.rejects(slots.test(a.id,3),{status:409});
  slots.remove(a.id,3);assert.throws(()=>slots.row(a.id),{status:404});assert.equal(slots.key(b.id),key+'2');
});

test('validation and encryption failure preserve the previous slot and key',t=>{
  const slots=setup(t),a=slots.save(base);
  for(const change of [{name:'x'},{provider:'__proto__'},{key:'\n'+key},{clearKey:true,key},{notes:[]},{key:{}}])assert.throws(()=>slots.save({...base,...change,revision:1},a.id));
  assert.throws(()=>slots.save({...base,name:'PRIMARY PROJECT'}),{status:409});
  slots.protector={transform:()=>{throw new Error('Synthetic encryption failure');}};
  assert.throws(()=>slots.save({...base,name:'New name',revision:1},a.id));
  assert.equal(slots.list()[0].name,base.name);assert.equal(slots.list()[0].revision,1);
});

test('slot credentials go only to their fixed provider and no generation request is made',async t=>{
  const calls=[];
  const slots=setup(t,async(url,options)=>{
    calls.push({url:String(url),headers:options.headers});assert.equal(options.redirect,'error');assert.ok(options.signal);
    if(String(url).includes('elevenlabs'))return Response.json({voices:[]});
    if(String(url).includes('googleapis'))return Response.json({items:[{id:'UC'+'a'.repeat(22),snippet:{title:'Fixture'}}]});
    return Response.json({data:[]});
  });
  for(const provider of ['openai','elevenlabs','youtube']){const c=slots.save({...base,provider,name:provider,key:key+provider});await slots.test(c.id,1);}
  assert.equal(calls.length,3);assert.equal(calls[0].url,'https://api.openai.com/v1/models');
  assert.equal(calls[0].headers.Authorization,'Bearer '+key+'openai');
  assert.equal(calls[1].url,'https://api.elevenlabs.io/v2/voices?page_size=1');assert.equal(calls[1].headers['xi-api-key'],key+'elevenlabs');
  assert.equal(calls[2].headers['x-goog-api-key'],key+'youtube');
  assert.equal(JSON.stringify(slots.list()).includes(key),false);
});

test('read-only denial, malformed response and thrown provider errors are recorded without secrets',async t=>{
  for(const kind of ['denied','shape','network']){
    const slots=setup(t,async()=>{if(kind==='network')throw new Error(key);return kind==='denied'?Response.json({error:key},{status:403}):Response.json({unexpected:key});});
    const c=slots.save(base);await assert.rejects(slots.test(c.id,1));
    const result=slots.list()[0];assert.equal(result.test.status,'failed');assert.equal(JSON.stringify(result).includes(key),false);assert.equal(result.busy,false);
  }
});

test('tests lock only their slot and never allow delete or replacement in flight',async t=>{
  let release;const slots=setup(t,()=>new Promise(resolve=>{release=resolve;}));
  const a=slots.save(base),b=slots.save({...base,name:'Other'}),pending=slots.test(a.id,1);
  assert.equal(slots.list()[0].busy,true);assert.throws(()=>slots.remove(a.id,1),{status:409});
  assert.throws(()=>slots.save({...base,revision:1},a.id),{status:409});await assert.rejects(slots.test(a.id,1),{status:409});
  slots.remove(b.id,1);release(Response.json({data:[]}));await pending;assert.equal(slots.list()[0].busy,false);
});

test('planned adapters keep setup slots but reject keys and do not claim a live test',async t=>{
  let calls=0;const slots=setup(t,async()=>{calls++;return Response.json({});});
  for(const provider of ['mcp','reddit']){
    assert.throws(()=>slots.save({...base,provider,name:provider}));
    const c=slots.save({...base,provider,name:provider,key:''});
    const result=await slots.test(c.id,1);assert.equal(result.connector.test.status,'not_implemented');
    assert.equal(result.connector.hasKey,false);slots.remove(c.id,1);
  }
  assert.equal(calls,0);
});

test('named slot encrypts with real Windows DPAPI and survives manager reopen',{skip:process.platform!=='win32'},t=>{
  const store=new Store(':memory:');t.after(()=>store.close());
  const slots=new ConnectorSlots(store,new WindowsVault('.'));
  const c=slots.save(base),raw=Buffer.from(slots.row(c.id).secret);
  assert.equal(raw.includes(Buffer.from(key)),false);
  assert.equal(new ConnectorSlots(store,new WindowsVault('.')).key(c.id),key);
  slots.remove(c.id,1);assert.equal(slots.list().length,0);
});

test('slot HTTP routes require the local token and expose no stored credentials',async t=>{
  const app=createApp({dataFile:':memory:',worker:false,protector:fixtureProtector,providerFetch:async()=>Response.json({data:[]})});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{app.server.close(resolve);app.server.closeIdleConnections();}));
  const root=`http://127.0.0.1:${app.server.address().port}`,state=await(await fetch(root+'/api/state')).json();
  const send=(route,body,token=state.token,method='POST')=>fetch(root+route,{method,headers:{'Content-Type':'application/json','X-Local-Token':token},body:JSON.stringify(body)});
  assert.equal((await send('/api/connectors',base,'')).status,403);
  const c=await(await send('/api/connectors',base)).json();assert.equal(c.hasKey,true);
  for(const suffix of ['/test','/delete'])assert.equal((await send(`/api/connectors/${c.id}${suffix}`,{revision:1},'')).status,403);
  assert.equal((await send(`/api/connectors/${c.id}/test`,{revision:1})).status,200);
  const after=await(await fetch(root+'/api/state')).json();assert.equal(JSON.stringify(after).includes(key),false);
  assert.equal(after.connectors[0].test.status,'passed');assert.equal(after.capabilities.text,'not_connected');
  assert.equal((await send(`/api/connectors/${c.id}/delete`,{revision:1})).status,200);
});
