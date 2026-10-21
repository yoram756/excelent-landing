const test=require('node:test'),assert=require('node:assert/strict'),{Store}=require('../../automation/lifecycle/store'),{projectNext,bootstrap,encode,hash,BOARD,COLUMN}=require('../../automation/lifecycle/crm-sandbox'),{adapt}=require('../../automation/lifecycle/lp1-adapter'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),campaign=require('../../config/lifecycle/refi.json');
const NOW='2026-10-20T09:00:00.000Z',LATER='2026-10-20T09:02:00.000Z',runId='12345678-1234-1234-1234-123456789012';
function setup(t,{disk=false}={}){
 const dir=disk?fs.mkdtempSync(path.join(os.tmpdir(),'excelent-crm-')):null,file=dir?path.join(dir,'crm.sqlite'):':memory:',s=new Store(file,{sandbox:true}),open=[s];t.after(()=>{for(const db of open)try{db.close();}catch{}if(dir)fs.rmSync(dir,{recursive:true,force:true});});
 const v=new Function('$input','$getWorkflowStaticData',fs.readFileSync(path.resolve(__dirname,'../../automation/intake/validate.js'),'utf8'))({first:()=>({json:{headers:{},body:{product:'LP1',first_name:'TEST CRM only',phone:'0500000040',email:'test@example.invalid',idempotency_key:'test-sqlite-crm-001',service_request:true,marketing_consent:false,marketing_channels:['email'],answers:{ask:'call'}}}})},()=>({}))[0].json;v.contact_permissions.receivedAt=NOW;
 const e=s.ingest(adapt(v,{campaign,now:NOW})),target={boardId:BOARD,columnId:COLUMN,itemId:'1234567',runId,enrollmentId:e.enrollmentId};
 let item={boardId:BOARD,id:target.itemId,name:'TEST SQLite CRM '+runId,state:'active',text:encode(bootstrap(target))},reads=0,writes=0;
 const transport={read:async()=>{reads++;return {...item};},write:async r=>{writes++;item={...item,text:r.text};}};
 const args={store:s,resolveTarget:()=>target,transport,now:()=>NOW};return {s,e,target,args,transport,file,open,item:()=>item,setItem:v=>item=v,counts:()=>({reads,writes})};
}
test('LP1 to SQLite to CRM exact readback acknowledges one preallocated item and deduplicates intake',async t=>{
 const f=setup(t),r=await projectNext(f.args);assert.equal(r.status,'ACKED');assert.equal(f.s.snapshot().projections[0].state,'acked');assert.deepEqual(f.counts(),{reads:2,writes:1});
 const p=JSON.parse(f.item().text).projection;assert.equal(p.data.event.type,'entered');assert.deepEqual(p.data.grants,{email:true,sms:false,whatsapp:false});assert.equal(p.data.enrollmentId,f.e.enrollmentId);assert.equal(p.hash,r.payloadHash);assert.equal((await projectNext(f.args)).status,'IDLE');assert.equal(f.counts().writes,1);
});
test('CRM readback mismatch never acknowledges and cannot be retried after lease expiry',async t=>{
 const f=setup(t),read=f.transport.read;f.transport.read=async target=>{const item=await read(target);if(f.counts().reads>1){const v=JSON.parse(item.text);v.projection.data.grants.sms=true;v.projection.hash=hash(v.projection.data);item.text=encode(v);}return item;};
 await assert.rejects(projectNext(f.args),/readback mismatch/);assert.equal(f.s.snapshot().projections[0].state,'unknown');const reads=f.counts().reads;
 await assert.doesNotReject(async()=>assert.equal((await projectNext({...f.args,now:()=>LATER})).status,'IDLE'),'unknown must never be reclaimed, including for a read');assert.equal(f.counts().reads,reads);assert.equal(f.counts().writes,1);
});
test('lost response after remote commit remains unknown with no automatic write replay',async t=>{
 const f=setup(t),write=f.transport.write;f.transport.write=async r=>{await write(r);throw Error('timeout after remote commit');};await assert.rejects(projectNext(f.args),/timeout/);assert.equal(f.s.snapshot().projections[0].state,'unknown');assert.ok(JSON.parse(f.item().text).projection);assert.equal((await projectNext({...f.args,now:()=>LATER})).status,'IDLE');assert.equal(f.counts().writes,1);
});
test('readback exception, partial item, wrong event or missing column cannot produce success',async t=>{
 for(const corrupt of [()=>{throw Error('GraphQL partial response');},item=>({...item,text:undefined}),item=>{const v=JSON.parse(item.text);v.projection.data.event.id='wrong';v.projection.hash=hash(v.projection.data);return {...item,text:encode(v)};}]){
  const f=setup(t),read=f.transport.read;f.transport.read=async target=>{const item=await read(target);return f.counts().reads>1?corrupt(item):item;};await assert.rejects(projectNext(f.args));assert.equal(f.s.snapshot().projections[0].state,'unknown');
 }
});
test('wrong board, item, TEST name, owner, recipient and future remote version refuse writes',async t=>{
 for(const change of [i=>i.boardId='5106246268',i=>i.id='7654321',i=>i.name='actual lead',i=>i.state='archived',i=>{const v=JSON.parse(i.text);v.owner.enrollmentId='wrong';i.text=encode(v);},i=>{const v=JSON.parse(i.text);const data={frontier:999,event:{seq:999}};v.projection={data,hash:hash(data)};i.text=encode(v);}]){
  const f=setup(t),item=f.item();change(item);f.setItem(item);await assert.rejects(projectNext(f.args));assert.equal(f.counts().writes,0);assert.equal(f.s.snapshot().projections[0].state,'reserved');
 }
 const f=setup(t);f.s.run("UPDATE subjects SET phone='972502234052'");await assert.rejects(projectNext(f.args),/synthetic/);assert.equal(f.counts().writes,0);
});
test('wrong configured target and expired prewrite lease cannot reach remote write',async t=>{
 const f=setup(t);await assert.rejects(projectNext({...f.args,resolveTarget:()=>({...f.target,boardId:'5106246268'})}));assert.equal(f.counts().reads,0);
 const g=setup(t);let clock=NOW;const read=g.transport.read;g.transport.read=async r=>{const item=await read(r);clock=LATER;return item;};await assert.rejects(projectNext({...g.args,now:()=>clock,leaseMs:1000}),/Stale/);assert.equal(g.counts().writes,0);
});
test('remote ownership is checked again after write before acknowledgment',async t=>{
 const f=setup(t),write=f.transport.write;f.transport.write=async r=>{await write(r);const item=f.item(),v=JSON.parse(item.text);v.owner.runId='another-run';item.text=encode(v);};await assert.rejects(projectNext(f.args),/ownership/);assert.equal(f.s.snapshot().projections[0].state,'unknown');
});
test('consent changed between frozen frame and begin-write refuses stale CRM write',async t=>{
 const f=setup(t),begin=f.s.beginProjection.bind(f.s);f.s.beginProjection=args=>{f.s.withdraw({eventId:'last-moment-withdrawal',enrollmentId:f.e.enrollmentId,channels:['email'],now:NOW});return begin(args);};
 await assert.rejects(projectNext(f.args),/changed before write/);assert.equal(f.counts().writes,0);assert.equal(f.s.snapshot().projections[0].state,'reserved');
});
test('optout in another campaign between frame and write refuses stale CRM subject state',async t=>{
 const f=setup(t),c=JSON.parse(f.s.snapshot().enrollments[0].consent),otherCampaign={...campaign,id:'synthetic-other'};c.campaignId=otherCampaign.id;
 const other=f.s.ingest({eventId:'other-campaign',campaign:otherCampaign,receipt:c,now:NOW}),begin=f.s.beginProjection.bind(f.s);f.s.beginProjection=args=>{f.s.record({eventId:'cross-campaign-stop',enrollmentId:other.enrollmentId,type:'optout',now:NOW});return begin(args);};
 await assert.rejects(projectNext(f.args),/changed before write/);assert.equal(f.counts().writes,0);assert.equal(f.s.snapshot().projections[0].state,'reserved');
});
test('consent withdrawal and optout update same CRM item in order without expanding grants',async t=>{
 const f=setup(t);await projectNext(f.args);f.s.withdraw({eventId:'withdraw',enrollmentId:f.e.enrollmentId,channels:['email'],now:NOW});f.s.record({eventId:'stop',enrollmentId:f.e.enrollmentId,type:'optout',now:NOW});
 const a=await projectNext(f.args),b=await projectNext(f.args);assert.equal(a.itemId,b.itemId);assert.equal(f.counts().writes,3);const v=JSON.parse(f.item().text);assert.equal(v.projection.data.stop.reason,'optout');assert.equal(v.projection.data.grants.email,false);assert.equal(v.projection.data.event.id,'stop');assert.equal(f.s.snapshot().projections.every(p=>p.state==='acked'),true);
});
test('target binding is immutable and cannot be shared by different enrollments',async t=>{
 const f=setup(t);await projectNext(f.args);f.s.record({eventId:'q',enrollmentId:f.e.enrollmentId,type:'questionnaire',now:NOW});const newTarget={...f.target,itemId:'7654321'};f.setItem({...f.item(),id:newTarget.itemId,text:encode(bootstrap(newTarget))});await assert.rejects(projectNext({...f.args,resolveTarget:()=>newTarget}),/bound/);assert.equal(f.counts().writes,1);
 const g=setup(t),p=g.s.claimProjection({workerId:'pin',now:NOW});g.s.beginProjection({...p,binding:'monday:'+BOARD+':'+g.target.itemId,payloadHash:'a'.repeat(64),now:NOW});
 const c=JSON.parse(g.s.snapshot().enrollments[0].consent);c.recipients={phone:'0500000041',email:'test41@example.invalid'};const another=g.s.ingest({eventId:'new',receipt:c,campaign,now:NOW}),second=g.s.claimProjection({workerId:'second',now:NOW});assert.equal(second.enrollmentId,another.enrollmentId);assert.throws(()=>g.s.beginProjection({...second,binding:'monday:'+BOARD+':'+g.target.itemId,payloadHash:'b'.repeat(64),now:NOW}),/bound/);
});
test('process exit after beginning CRM write preserves unknown state on restart and does not starve other leads',t=>{
 const f=setup(t,{disk:true});f.s.close();const env={...process.env,NODE_NO_WARNINGS:'1'};delete env.NODE_TEST_CONTEXT;
 const child=require('node:child_process').spawnSync(process.execPath,[path.join(__dirname,'crm-crash-worker.js'),f.file],{env,encoding:'utf8',windowsHide:true,timeout:15000});assert.equal(child.status,74,child.stderr);
 const reopened=new Store(f.file,{sandbox:true});f.open.push(reopened);assert.equal(reopened.claimProjection({workerId:'new',now:LATER}),null);const old=reopened.snapshot().projections[0];assert.equal(old.state,'unknown');assert.throws(()=>reopened.acknowledgeProjection({eventId:old.event_id,token:old.token,receipt:'late',now:LATER}),e=>e.code==='STALE');
 const c=JSON.parse(reopened.snapshot().enrollments[0].consent);c.recipients={phone:'0500000041',email:'other@example.invalid'};const e=reopened.ingest({eventId:'other',receipt:c,campaign,now:NOW});assert.equal(reopened.claimProjection({workerId:'independent',now:LATER}).enrollmentId,e.enrollmentId);
});
test('schema two migrates to three while old CRM reservations remain valid only before write',t=>{
 const f=setup(t,{disk:true});f.s.db.exec('PRAGMA user_version=2');f.s.close();const reopened=new Store(f.file,{sandbox:true});f.open.push(reopened);assert.equal(reopened.get('PRAGMA user_version').user_version,3);assert.equal(reopened.snapshot().enrollments[0].id,f.e.enrollmentId);
});
