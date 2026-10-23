// HTTP lock service over the SQLite engine: auth, validation, atomic 60 second lock.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('path');
const {spawnSync}=require('child_process');
const {LifecycleDb}=require('../../src/services/lifecycle/db');
const {createLockServer}=require('../../src/services/lifecycle/lock-server');
const TOKEN='t'.repeat(40);

const start=async(now)=>{const db=new LifecycleDb(':memory:');const server=createLockServer({db,token:TOKEN,now});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  return {db,base,stop:()=>new Promise(r=>server.close(()=>{db.close();r();}))};};
const lock=(base,body,token=TOKEN,raw)=>fetch(base+'/lock',{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:raw??JSON.stringify(body)});

test('health answers without auth',async()=>{const s=await start();try{
  const r=await fetch(s.base+'/health');assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true});
  assert.equal((await fetch(s.base+'/health',{method:'POST'})).status,405);}finally{await s.stop();}});

test('POST /lock needs the bearer token',async()=>{const s=await start();try{
  assert.equal((await lock(s.base,{phone:'0500000040'},null)).status,401);
  assert.equal((await lock(s.base,{phone:'0500000040'},'x'.repeat(40))).status,401);
  assert.equal(s.db.db.prepare('SELECT count(*) n FROM incoming_webhooks').get().n,0,'unauthorized calls leave no record');}finally{await s.stop();}});

test('first caller wins for 60 seconds, any phone format, then the lock is free again',async()=>{
  let t=Date.parse('2026-10-23T09:00:00Z');const s=await start(()=>t);try{
  const a=await (await lock(s.base,{phone:'050-000-0040',source:'n8n-intake'})).json();
  assert.equal(a.locked,true);assert.equal(a.phone,'972500000040');
  t+=30000;assert.equal((await (await lock(s.base,{phone:'+972 50 000 0040'})).json()).locked,false);
  assert.equal((await (await lock(s.base,{phone:'0500000041'})).json()).locked,true);
  t+=30000;assert.equal((await (await lock(s.base,{phone:'0500000040'})).json()).locked,true);
  assert.deepEqual(s.db.db.prepare('SELECT source FROM incoming_webhooks ORDER BY received_at,rowid').all().map(r=>r.source),['n8n-intake','http','http','http']);}finally{await s.stop();}});

test('parallel requests for one phone: exactly one gets the lock',async()=>{const s=await start();try{
  const r=await Promise.all(Array.from({length:12},()=>lock(s.base,{phone:'0500000040'}).then(x=>x.json())));
  assert.equal(r.filter(x=>x.locked).length,1);}finally{await s.stop();}});

test('bad input is rejected without a lock',async()=>{const s=await start();try{
  assert.equal((await lock(s.base,null,TOKEN,'{not json')).status,400);
  assert.equal((await lock(s.base,{})).status,400);
  assert.equal((await lock(s.base,{phone:'abc'})).status,400);
  assert.equal((await lock(s.base,null,TOKEN,JSON.stringify({phone:'0500000040',pad:'x'.repeat(20000)}))).status,413);
  assert.equal((await fetch(s.base+'/lock')).status,405);assert.equal((await fetch(s.base+'/other')).status,404);
  assert.equal(s.db.db.prepare('SELECT count(*) n FROM lead_dedup_locks').get().n,0);}finally{await s.stop();}});

test('the service refuses to start without a strong token or a valid database path',()=>{
  assert.throws(()=>createLockServer({db:{},token:'short'}),/32 characters/);
  const file=path.resolve(__dirname,'../../src/services/lifecycle/lock-server.js');
  for(const env of [{LOCK_DB_PATH:path.join(require('os').tmpdir(),'never.sqlite')},{LOCK_SERVER_TOKEN:TOKEN,LOCK_DB_PATH:'relative.sqlite'}]){
    const r=spawnSync(process.execPath,[file],{env:{PATH:process.env.PATH,...env},timeout:10000});assert.notEqual(r.status,0,JSON.stringify(env));}});
