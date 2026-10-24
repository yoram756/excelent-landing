// SQLite engine: raw webhook log, atomic 60 second phone lock and lifecycle events.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {spawn}=require('child_process');
const {LifecycleDb,LOCK_MS}=require('../../src/services/lifecycle/db');
const T0=Date.parse('2026-10-23T09:00:00Z');
const count=(db,sql)=>db.db.prepare(sql).get().n;
const admit=(db,phone,ms,tag='x')=>db.admitLead({source:'lp1',raw:JSON.stringify({tag,phone}),phone,now:T0+ms});

test('the three tables exist',()=>{const db=new LifecycleDb(':memory:');
  const t=db.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name);
  for(const n of ['incoming_webhooks','lead_dedup_locks','lifecycle_events'])assert.ok(t.includes(n),n);db.close();});

test('a second lead with the same phone in any format inside 60 seconds is blocked; after 60 seconds it is admitted',()=>{
  const db=new LifecycleDb(':memory:');
  assert.equal(admit(db,'050-000-0040',0).admitted,true);
  const dup=admit(db,'+972 50 000 0040',30000);assert.equal(dup.admitted,false);assert.equal(dup.reason,'duplicate_within_lock_window');
  assert.equal(admit(db,'00972500000040',LOCK_MS-1).admitted,false);
  assert.equal(admit(db,'0500000041',1000).admitted,true,'another phone is independent');
  assert.equal(admit(db,'0500000040',LOCK_MS).admitted,true,'lock expires after 60 seconds');
  db.close();});

test('every incoming event is stored raw, and each outcome is a lifecycle event',()=>{
  const db=new LifecycleDb(':memory:');const raw='{"phone":"050-000-0040", "x":1}';
  db.admitLead({source:'lp1',raw,phone:'0500000040',now:T0});admit(db,'0500000040',5000);
  assert.equal(db.db.prepare('SELECT raw FROM incoming_webhooks ORDER BY received_at LIMIT 1').get().raw,raw);
  assert.equal(count(db,'SELECT count(*) n FROM incoming_webhooks'),2);
  assert.deepEqual(db.db.prepare('SELECT type FROM lifecycle_events ORDER BY id').all().map(r=>r.type),['lead_received','duplicate_blocked']);
  db.recordEvent({phone:'0500000040',itemId:'9',type:'heat',from:65,to:75,at:T0+9000});
  db.recordEvent({phone:'0500000040',itemId:'9',type:'status',from:'פעיל',to:'הסר',at:T0+9500});
  assert.deepEqual(db.db.prepare("SELECT type,from_value,to_value FROM lifecycle_events WHERE item_id='9' ORDER BY id").all().map(r=>({...r})),
    [{type:'heat',from_value:'65',to_value:'75'},{type:'status',from_value:'פעיל',to_value:'הסר'}]);
  assert.throws(()=>db.recordEvent({phone:'0500000040',type:'other',at:T0}),/Unknown/);db.close();});

test('an invalid phone is rejected and leaves no partial record',()=>{
  const db=new LifecycleDb(':memory:');assert.throws(()=>admit(db,'abc',0),/Invalid phone/);
  assert.equal(count(db,'SELECT count(*) n FROM incoming_webhooks'),0);assert.equal(count(db,'SELECT count(*) n FROM lifecycle_events'),0);db.close();});

test('only absolute .sqlite paths or :memory: can be opened',()=>{
  for(const p of ['relative.sqlite','/tmp/x.db',''])assert.throws(()=>new LifecycleDb(p),/required/);});

test('concurrent processes racing for the same phone: exactly one is admitted',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dedup-'));const dbPath=path.join(dir,'locks.sqlite');
  new LifecycleDb(dbPath).close();
  const N=8,startAt=Date.now()+1500;
  const run=i=>new Promise((res,rej)=>{const c=spawn(process.execPath,[path.join(__dirname,'dedup-worker.js'),dbPath,i%2?'050-000-0040':'+972500000040',String(startAt),'w'+i]);
    let out='',err='';c.stdout.on('data',d=>out+=d);c.stderr.on('data',d=>err+=d);c.on('close',code=>code===0?res(JSON.parse(out)):rej(Error(err)));});
  const results=await Promise.all(Array.from({length:N},(_,i)=>run(i)));
  assert.equal(results.filter(r=>r.admitted).length,1,JSON.stringify(results));
  const db=new LifecycleDb(dbPath);
  assert.equal(count(db,'SELECT count(*) n FROM incoming_webhooks'),N);
  assert.equal(count(db,"SELECT count(*) n FROM lifecycle_events WHERE type='lead_received'"),1);
  assert.equal(count(db,"SELECT count(*) n FROM lifecycle_events WHERE type='duplicate_blocked'"),N-1);
  db.close();fs.rmSync(dir,{recursive:true,force:true});});

test('absolute database paths are normalized before validation and opening',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dedup-path-'));
  const file=path.join(dir,'locks.sqlite');
  const supplied=dir.replace(/\\/g,'/')+'/unused/../locks.sqlite/.';
  let db;
  try{db=new LifecycleDb(supplied);assert.ok(fs.existsSync(file));assert.equal(admit(db,'0500000040',0).admitted,true);}
  finally{if(db)db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
