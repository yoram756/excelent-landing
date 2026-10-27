'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {OperationsStore}=require('../../src/services/business-ops/store');
const {SourceInbox,runSourceCycle,runSourceRound}=require('../../src/services/business-ops/ingestion');
const {seed,stages,caseData,now}=require('./scenario');
const time=n=>new Date(Date.parse(now)+n).toISOString();
const stream=(source='gmail',suffix='a')=>({id:'TEST-stream-'+source+'-'+suffix,source,accountId:'TEST-account-'+suffix});
const event=(source='gmail',id='TEST-record-1',extra={})=>({source,id,scope:'business',caseId:caseData.id,email:'client@example.invalid',
 occurredAt:'2026-10-27T08:00:00Z',url:'https://example.invalid/source/'+id,text:'מסמך התקבל',...extra});
const page=(events,id='page-1',nextCursor='opaque-cursor-1')=>({id,events,nextCursor});
function setup(file=':memory:'){const store=new OperationsStore(file);seed(store);return {store,inbox:new SourceInbox(store)};}

test('cursor and event receipts survive restart; repeated pages cannot duplicate or rewind a checkpoint',()=>{
 const base=fs.realpathSync(os.tmpdir()),dir=fs.mkdtempSync(path.join(base,'ops-stream-')),file=path.join(dir,'ops.sqlite');let {store,inbox}=setup(file);
 try{
  const binding=stream();inbox.register(binding,{now});const p=page([event()]);
  const r=inbox.accept(inbox.claim(binding.id,{now}),p,{now});assert.equal(r.accepted,1);assert.equal(store.metrics({now}).tasks,0);
  store.close();store=new OperationsStore(file);inbox=new SourceInbox(store);
  const c=inbox.claim(binding.id,{now});assert.equal(c.cursor,'opaque-cursor-1');assert.equal(c.generation,1);
  const duplicate=inbox.accept(c,p,{now});assert.equal(duplicate.duplicate,true);assert.deepEqual(duplicate.eventKeys,r.eventKeys);
  inbox.accept(inbox.claim(binding.id,{now}),page([event('gmail','TEST-record-2')],'page-2','cursor-2'),{now});
  inbox.accept(inbox.claim(binding.id,{now}),p,{now});const current=inbox.claim(binding.id,{now});
  assert.equal(current.cursor,'cursor-2');assert.equal(current.generation,2);assert.equal(store.metrics({now}).events,2);
 }finally{store.close();assert.equal(path.dirname(fs.realpathSync(dir)),base);fs.rmSync(dir,{recursive:true,force:true});}
});

test('a failed page rolls back its earlier events and cursor together; no audit falsely records acceptance',()=>{
 const {store,inbox}=setup();try{const b=stream();inbox.register(b,{now});const c=inbox.claim(b.id,{now});
  assert.throws(()=>inbox.accept(c,page([event(),event('gmail','TEST-record-2',{scope:'private'})]),{now}),/Synthetic/);
  assert.equal(store.metrics({now}).events,0);assert.equal(store.get('SELECT generation FROM ops_streams').generation,0);
  assert.equal(store.get('SELECT cursor FROM ops_streams').cursor,null);assert.equal(store.get('SELECT COUNT(*) n FROM ops_pages').n,0);
  assert.equal(store.get("SELECT COUNT(*) n FROM ops_audit WHERE action='event_received' OR action='source_page_accepted'").n,0);
  assert.equal(inbox.fail(c,{now,kind:'invalid_page'}).status,'blocked');assert.equal(inbox.claim(b.id,{now:time(10000)}),null);
  inbox.resume(b.id,{actor:'reviewer',reason:'Corrected the synthetic page fixture',now});
  assert.equal(inbox.accept(inbox.claim(b.id,{now}),page([event()]),{now}).accepted,1);
 }finally{store.close();}
});

test('account namespaces prevent native-ID collisions, including the maximum supported identifier length',()=>{
 const {store,inbox}=setup();try{
  for(const account of ['a','b']){const b=stream('gmail',account);inbox.register(b,{now});inbox.accept(inbox.claim(b.id,{now}),page([event()]),{now});}
  assert.equal(store.metrics({now}).events,2);
  const b={id:'TEST-long',source:'drive',accountId:'TEST-'+ 'a'.repeat(175)};inbox.register(b,{now});
  inbox.accept(inbox.claim(b.id,{now}),page([event('drive','TEST-'+ 'b'.repeat(175))]),{now});
  assert.equal(store.metrics({now}).events,3);assert.equal(new Set(store.all('SELECT event_key FROM ops_events').map(r=>r.event_key)).size,3);
 }finally{store.close();}
});

test('a changed page replay fails and cannot change the established cursor or original event',()=>{
 const {store,inbox}=setup();try{const b=stream();inbox.register(b,{now});inbox.accept(inbox.claim(b.id,{now}),page([event()]),{now});
  const c=inbox.claim(b.id,{now});assert.throws(()=>inbox.accept(c,page([event('gmail','TEST-record-1',{text:'changed'})]),{now}),/replay conflict/);
  assert.equal(store.get('SELECT cursor FROM ops_streams').cursor,'opaque-cursor-1');assert.equal(store.metrics({now}).events,1);
 }finally{store.close();}
});

test('leases exclude concurrent readers; an expired reader cannot overwrite or fail the newer lease',()=>{
 const {store,inbox}=setup();try{const b=stream();inbox.register(b,{now});const old=inbox.claim(b.id,{now,leaseMs:1000});
  assert.equal(inbox.claim(b.id,{now}),null);const current=inbox.claim(b.id,{now:time(1001)});assert.ok(current);
  assert.throws(()=>inbox.accept(old,page([event()]),{now:time(1001)}),/Stale/);
  assert.throws(()=>inbox.fail(old,{now:time(1001)}),/Stale/);
  assert.equal(inbox.accept(current,page([event()]),{now:time(1001)}).accepted,1);
 }finally{store.close();}
});

test('source failure has bounded retries and no raw secrets; another channel proceeds independently',async()=>{
 const {store,inbox}=setup();try{const mail=stream(),drive=stream('drive');inbox.register(mail,{now});inbox.register(drive,{now});
  const broken={mode:'synthetic',readPage:async()=>{throw Error('Authorization: private-sentinel');}};
  const working={mode:'synthetic',readPage:async()=>page([event('drive')])};
  const first=await runSourceRound(inbox,[{streamId:mail.id,adapter:broken},{streamId:drive.id,adapter:working}],{now:()=>now});
  assert.equal(first[0].status,'retry_later');assert.equal(first[1].status,'accepted');
  assert.equal((await runSourceCycle(inbox,{streamId:mail.id,adapter:broken,now:()=>now})).status,'not_due');
  await runSourceCycle(inbox,{streamId:mail.id,adapter:broken,now:()=>time(1000)});
  assert.equal((await runSourceCycle(inbox,{streamId:mail.id,adapter:broken,now:()=>time(3000)})).status,'blocked');
  const health=inbox.health({now:time(25*3600000)});assert.equal(health.find(s=>s.source==='drive').state,'stale');assert.equal(health.find(s=>s.source==='gmail').state,'blocked');
  assert.equal(JSON.stringify(store.all('SELECT * FROM ops_audit')).includes('private-sentinel'),false);
  assert.equal(JSON.stringify(health).includes('opaque-cursor'),false);assert.equal(store.metrics({now}).tasks,0);
 }finally{store.close();}
});

test('never-connected streams are visible and a slow reader reports lease loss without crashing other sources',async()=>{
 const {store,inbox}=setup();try{const b=stream();inbox.register(b,{now});assert.equal(inbox.health({now:time(25*3600000)})[0].state,'never_connected');
  let clock=now;
  const r=await runSourceCycle(inbox,{streamId:b.id,adapter:{mode:'synthetic',readPage:async()=>{clock=time(60001);return page([event()]);}},now:()=>clock});
  assert.equal(r.status,'lease_lost');assert.equal(store.metrics({now}).events,0);assert.ok(inbox.claim(b.id,{now:clock}));
 }finally{store.close();}
});

test('private/real envelopes and source-granted authority are refused before any durable acceptance',async()=>{
 const {store,inbox}=setup();try{
  assert.throws(()=>inbox.register({...stream(),id:'production'},{now}),/Synthetic/);
  const b=stream();inbox.register(b,{now});const c=inbox.claim(b.id,{now});
  for(const extra of [{id:'real-record'},{scope:'private'},{caseId:'real-case'},{phone:'0501234567'},{email:'real@example.com'},{observations:[]},{actor:'reviewer'},{authorization:'redacted'},{headers:{authorization:'redacted'}},{unexpectedMetadata:{token:'redacted'}}])
   assert.throws(()=>inbox.accept(c,page([event('gmail','TEST-record-1',extra)]),{now}),/Synthetic/);
  assert.equal(store.metrics({now}).events,0);
  await assert.rejects(runSourceCycle(inbox,{streamId:b.id,adapter:{mode:'live',readPage:async()=>page([])},now:()=>now}),/Synthetic/);
  assert.equal(store.metrics({now}).tasks,0);
 }finally{store.close();}
});

test('a source that never responds times out, releases its lease and does not block another channel',async()=>{
 const {store,inbox}=setup();try{
  const a=stream(),b=stream('calendar');inbox.register(a,{now});inbox.register(b,{now});let signal;
  const result=await runSourceRound(inbox,[
   {streamId:a.id,adapter:{mode:'synthetic',readPage:({signal:input})=>{signal=input;return new Promise(()=>{});}}},
   {streamId:b.id,adapter:{mode:'synthetic',readPage:async()=>page([event('calendar')])}}
  ],{now:()=>now,readTimeoutMs:10});
  assert.equal(result[0].status,'retry_later');assert.equal(result[1].status,'accepted');assert.equal(signal.aborted,true);
  assert.equal(store.get('SELECT lease FROM ops_streams WHERE id=?',a.id).lease,null);
 }finally{store.close();}
});

test('paged call → email → WhatsApp joins the same case; only separate review completes evidence-dependent work',async()=>{
 const {store,inbox}=setup();try{for(const stage of stages){
  const b=stream(stage.event.source);inbox.register(b,{now});const e={...stage.event,id:'TEST-'+stage.event.id};
  const receipt=await runSourceCycle(inbox,{streamId:b.id,adapter:{mode:'synthetic',readPage:async()=>page([e])},now:()=>now});
  assert.equal(receipt.accepted,1);const row=store.get('SELECT reviewed_at FROM ops_events WHERE event_key=?',receipt.eventKeys[0]);assert.equal(row.reviewed_at,null);
  store.review(receipt.eventKeys[0],stage.observations,{actor:'synthetic_reviewer',now:time(1)});
 }
 const snapshot=store.snapshot(caseData.id);assert.equal(snapshot.tasks.length,2);assert.equal(snapshot.tasks.filter(t=>t.state==='completed').length,1);
 assert.equal(snapshot.tasks.find(t=>t.commitmentKey==='contact-banker').state,'not_started');assert.equal(snapshot.dispatchEnabled,false);
 }finally{store.close();}
});

test('nested savepoints roll back only their scope and async transaction callbacks are rejected',()=>{
 const {store}=setup();try{
  store.tx(()=>{store.audit('test','outer',{},now);assert.throws(()=>store.tx(()=>{store.audit('test','inner',{},now);throw Error('rollback');}));});
  assert.equal(store.get("SELECT COUNT(*) n FROM ops_audit WHERE action='outer'").n,1);assert.equal(store.get("SELECT COUNT(*) n FROM ops_audit WHERE action='inner'").n,0);
  assert.throws(()=>store.tx(async()=>{store.audit('test','async',{},now);}),/Synchronous/);
  assert.equal(store.get("SELECT COUNT(*) n FROM ops_audit WHERE action='async'").n,0);
 }finally{store.close();}
});
