const test=require('node:test'),assert=require('node:assert/strict');
const {mkdtempSync,rmSync}=require('node:fs'),{tmpdir}=require('node:os'),{join}=require('node:path'),{spawn}=require('node:child_process');
const {Store}=require('../../automation/lifecycle/store'),config=require('../../config/lifecycle/refi.json');
const START='2026-10-18T09:00:00.000Z',DUE='2026-10-20T09:00:00.000Z',LATER='2026-10-20T09:02:00.000Z';
const worker=join(__dirname,'atomic-worker.js');
const receipt=(campaignId='refi',n=40)=>({version:'lifecycle-consent-v1',campaignId,receivedAt:START,recipients:{phone:'05000000'+String(n).padStart(2,'0'),email:'test'+n+'@example.invalid'},grants:{whatsapp:true,email:true,sms:true}});
const intake=(eventId='intake',campaign=config,n=40)=>({eventId,campaign,receipt:receipt(campaign.id,n),attribution:{source:'synthetic',adId:'synthetic-ad'},now:START});
function setup(t){const dir=mkdtempSync(join(tmpdir(),'excelent-atomic-')),path=join(dir,'sandbox.sqlite'),store=new Store(path,{sandbox:true});t.after(()=>{try{store.close();}catch{}rmSync(dir,{recursive:true,force:true});});return {path,store};}
function child(path,action,args,{crash=false}={}){return new Promise((resolve,reject)=>{const p=spawn(process.execPath,[worker,path,action,JSON.stringify(args)],{env:{...process.env,NODE_NO_WARNINGS:'1',ATOMIC_CRASH:crash?'1':'0'},windowsHide:true});let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('error',reject);p.on('close',code=>{if(code!==0&&!(crash&&code===73))return reject(Error(err||'worker exit '+code));try{resolve(JSON.parse(out));}catch(e){reject(e);}});});}
const reserve=(store,enrollmentId,now=DUE)=>store.reserve({enrollmentId,workerId:'test-worker',now,leaseMs:1000});
const begin=(store,r,now=DUE)=>store.beginDispatch({key:r.key,token:r.token,fence:r.fence,now});

test('atomic store refuses implicit production use and persists intake across reopen',t=>{
 assert.throws(()=>new Store(':memory:'),/isolated/);const {store,path}=setup(t),a=intake(),r=store.ingest(a);
 const reopened=new Store(path,{sandbox:true});try{assert.equal(reopened.ingest({...a,now:DUE}).enrollmentId,r.enrollmentId);assert.equal(reopened.snapshot().events.length,1);assert.equal(reopened.snapshot().projections.length,1);}finally{reopened.close();}
});
test('16 simultaneous intake processes create one enrollment and one CRM event',async t=>{
 const {store,path}=setup(t),results=await Promise.all(Array.from({length:16},()=>child(path,'ingest',intake())));
 assert.equal(new Set(results.map(r=>r.enrollmentId)).size,1);assert.equal(results.filter(r=>!r.replayed).length,1);
 assert.equal(store.snapshot().subjects.length,1);assert.equal(store.snapshot().events.length,1);
});
test('a replay with changed contents rolls back and aliases cannot silently merge people',t=>{
 const {store}=setup(t),a=intake();store.ingest(a);
 assert.throws(()=>store.ingest({...a,receipt:{...a.receipt,grants:{whatsapp:false,email:true,sms:true}}}),e=>e.code==='CONFLICT');
 const b=intake('other');b.receipt.recipients.email='changed@example.invalid';assert.throws(()=>store.ingest(b),e=>e.code==='IDENTITY_CONFLICT');
 const c=intake('another',config,41);c.receipt.recipients.email=a.receipt.recipients.email;assert.throws(()=>store.ingest(c),e=>e.code==='IDENTITY_CONFLICT');
 assert.equal(store.snapshot().enrollments.length,1);assert.equal(store.snapshot().events.length,1);
});
test('16 simultaneous workers across campaigns and channels reserve exactly one contact',async t=>{
 const {store,path}=setup(t),a=store.ingest(intake()),b=store.ingest(intake('intake-other',{...config,id:'purchase',preferredChannels:['sms','whatsapp','email']}));
 const r=await Promise.all(Array.from({length:16},(_,i)=>child(path,'reserve',{enrollmentId:i%2?a.enrollmentId:b.enrollmentId,workerId:'w'+i,now:DUE})));
 assert.equal(r.filter(x=>x.status==='RESERVED').length,1);assert.equal(store.snapshot().outbox.filter(x=>x.state==='reserved').length,1);
 assert.ok(r.every(x=>x.dispatchEnabled===false));
});
test('a crashed reservation is recovered with fencing and the stale worker cannot dispatch',async t=>{
 const {store,path}=setup(t),e=store.ingest(intake());
 const first=await child(path,'reserve',{enrollmentId:e.enrollmentId,workerId:'crasher',now:DUE,leaseMs:1000},{crash:true});
 const next=reserve(store,e.enrollmentId,LATER);assert.equal(next.status,'RESERVED');assert.equal(next.key,first.key);assert.equal(next.fence,first.fence+1);assert.notEqual(next.token,first.token);
 assert.throws(()=>begin(store,first,LATER),e=>e.code==='STALE');assert.equal(begin(store,next,LATER).status,'INFLIGHT');
});
test('a crash after dispatch began becomes unknown and blocks all channels after restart',async t=>{
 const {store,path}=setup(t),e=store.ingest(intake()),r=reserve(store,e.enrollmentId);
 await child(path,'beginDispatch',{key:r.key,token:r.token,fence:r.fence,now:DUE},{crash:true});
 assert.equal(reserve(store,e.enrollmentId,LATER).reason,'delivery_unresolved');assert.equal(store.snapshot().outbox[0].state,'unknown');
 assert.throws(()=>store.settle({...r,outcome:'sent',now:LATER}),/receipt/);
 store.settle({...r,outcome:'sent',receipt:'mock-provider-accepted-1',now:LATER});
 assert.equal(reserve(store,e.enrollmentId,LATER).reason,'cross_channel_cooldown');
});
test('timeout never triggers fallback; confirmed failure blocks the current milestone',t=>{
 const {store}=setup(t),e=store.ingest(intake()),r=reserve(store,e.enrollmentId);begin(store,r);
 store.settle({...r,outcome:'unknown',now:DUE});assert.equal(reserve(store,e.enrollmentId).reason,'delivery_unresolved');
 store.settle({...r,outcome:'failed',now:DUE});assert.equal(reserve(store,e.enrollmentId).reason,'failed_delivery_needs_review');
});
test('optout after reservation revokes preflight and stops every campaign despite fresh intake',t=>{
 const {store}=setup(t),e=store.ingest(intake()),r=reserve(store,e.enrollmentId);
 store.record({eventId:'stop',enrollmentId:e.enrollmentId,type:'optout',now:DUE});
 assert.throws(()=>begin(store,r),e=>e.code==='STALE');assert.equal(store.snapshot().outbox[0].state,'suppressed');
 const next=store.ingest({...intake('new-form',{...config,id:'other'}),now:DUE});assert.equal(next.suppressed,true);
 assert.equal(reserve(store,next.enrollmentId).status,'STOP');assert.equal(store.snapshot().subjects.length,1);
});
test('concurrent optout and preflight have a durable serial order, never a second contact',async t=>{
 const {store,path}=setup(t),e=store.ingest(intake()),r=reserve(store,e.enrollmentId);
 const [stop,attempt]=await Promise.allSettled([child(path,'record',{eventId:'stop',enrollmentId:e.enrollmentId,type:'optout',now:DUE}),child(path,'beginDispatch',{key:r.key,token:r.token,fence:r.fence,now:DUE})]);
 assert.equal(stop.status,'fulfilled');assert.ok(attempt.status==='rejected'||attempt.value.status==='INFLIGHT');
 const snapshot=store.snapshot();assert.equal(snapshot.subjects[0].stop_reason,'optout');assert.ok(['inflight','suppressed'].includes(snapshot.outbox[0].state));
 assert.equal(reserve(store,e.enrollmentId).status,'STOP');
});
test('recipient preferences are read again before dispatch and original horizon cannot renew',t=>{
 const {store}=setup(t),e=store.ingest(intake()),r=reserve(store,e.enrollmentId);
 store.withdraw({eventId:'withdraw',enrollmentId:e.enrollmentId,channels:['email'],now:DUE});assert.throws(()=>begin(store,r),e=>e.code==='STALE');
 const again=store.ingest({...intake('refill'),now:DUE});assert.equal(again.enrollmentId,e.enrollmentId);assert.equal(store.snapshot().enrollments[0].started_at,START);assert.equal(JSON.parse(store.snapshot().enrollments[0].consent).grants.email,false);
 assert.equal(reserve(store,e.enrollmentId,'2028-04-18T09:00:00.000Z').reason,'horizon_complete');
});
test('reply, booking and handoff pause all enrollments for this contact',t=>{
 const {store}=setup(t),a=store.ingest(intake()),b=store.ingest(intake('second',{...config,id:'purchase'}));
 store.record({eventId:'meeting',enrollmentId:a.enrollmentId,type:'meeting_booked',referenceId:'meeting1',now:DUE});assert.equal(reserve(store,b.enrollmentId).reason,'human_handling');
 store.record({eventId:'cancel',enrollmentId:a.enrollmentId,type:'meeting_cancelled',referenceId:'meeting1',now:DUE});assert.equal(reserve(store,b.enrollmentId).status,'RESERVED');
 store.record({eventId:'reply',enrollmentId:a.enrollmentId,type:'reply',now:DUE});assert.equal(reserve(store,b.enrollmentId).reason,'human_handling');
});
test('a confirmed mock delivery imposes one shared cooldown across campaigns',t=>{
 const {store}=setup(t),a=store.ingest(intake()),b=store.ingest(intake('second',{...config,id:'purchase'})),r=reserve(store,a.enrollmentId);begin(store,r);
 store.settle({...r,outcome:'sent',receipt:'mock-only-1',now:DUE});assert.equal(reserve(store,b.enrollmentId).reason,'cross_channel_cooldown');
});
test('CRM projection retries are ordered and acknowledge only a current lease and remote receipt',async t=>{
 const {store,path}=setup(t),e=store.ingest(intake());store.record({eventId:'quiz',enrollmentId:e.enrollmentId,type:'questionnaire',now:DUE});
 const first=store.claimProjection({workerId:'crm1',now:DUE,leaseMs:1000});assert.equal(first.type,'entered');
 assert.equal(store.claimProjection({workerId:'crm2',now:DUE}),null);
 const retry=await child(path,'claimProjection',{workerId:'recovery',now:LATER});assert.equal(retry.eventId,first.eventId);assert.equal(retry.attempts,2);
 assert.throws(()=>store.acknowledgeProjection({...first,receipt:'mock-item',now:LATER}),e=>e.code==='STALE');
 assert.throws(()=>store.acknowledgeProjection({...retry,now:LATER}),/acknowledgement/);
 store.acknowledgeProjection({...retry,receipt:'mock-item',now:LATER});assert.equal(store.claimProjection({workerId:'crm2',now:LATER}).type,'questionnaire');
});
test('CRM claims by competing processes expose one current lease for one event',async t=>{
 const {store,path}=setup(t);store.ingest(intake());const r=await Promise.all(Array.from({length:8},(_,i)=>child(path,'claimProjection',{workerId:'crm'+i,now:DUE})));
 assert.equal(r.filter(Boolean).length,1);
});
test('feedback is saved and read after reopen without undoing optout, even when empty',t=>{
 const {store,path}=setup(t),e=store.ingest(intake());store.record({eventId:'stop',enrollmentId:e.enrollmentId,type:'optout',now:DUE});
 const result=store.saveFeedback({eventId:'feedback',enrollmentId:e.enrollmentId,answers:{},now:DUE});assert.equal(result.reEnrollmentAllowed,false);
 const reopened=new Store(path,{sandbox:true});try{assert.deepEqual(JSON.parse(reopened.snapshot().feedback[0].answers).answers,{});assert.equal(reserve(reopened,e.enrollmentId).status,'STOP');}finally{reopened.close();}
 assert.throws(()=>store.saveFeedback({eventId:'feedback-bad',enrollmentId:e.enrollmentId,answers:{marketingConsent:'yes'},now:DUE}));assert.equal(store.snapshot().feedback.length,1);
});
test('full synthetic journey persists questionnaire, CRM, reply, meeting, cancellation, handoff and paid events',t=>{
 const {store}=setup(t),e=store.ingest(intake());for(const [i,type]of ['questionnaire','monday_saved','reply','meeting_booked','meeting_cancelled','handed_off','paid'].entries())store.record({eventId:'stage'+i,enrollmentId:e.enrollmentId,type,referenceId:type.startsWith('meeting_')?'meeting1':null,now:DUE});
 store.saveFeedback({eventId:'feedback',enrollmentId:e.enrollmentId,answers:{reason:'מחיר או תנאי השירות',improve:'בדיקה סינתטית'},now:DUE});
 const r=store.insights(),g=r.groups[0];assert.equal(g.leads,1);assert.equal(g.meeting_booked,1);assert.equal(g.meeting_cancelled,1);assert.equal(g.handed_off,1);assert.equal(g.paid,1);assert.equal(g.exitReasons.price,1);assert.equal(g.costPerLead,null);assert.ok(!JSON.stringify(r).includes('@example.invalid'));
 assert.equal(store.snapshot().subjects[0].stop_reason,'paid');assert.equal(reserve(store,e.enrollmentId).status,'STOP');
});
test('competitor feedback stops all campaigns and is distinct from an unsolicited invitation',t=>{
 const {store}=setup(t),a=store.ingest(intake()),b=store.ingest(intake('second',{...config,id:'purchase'}));
 store.saveFeedback({eventId:'feedback',enrollmentId:a.enrollmentId,answers:{other_provider:'כן'},now:DUE});assert.equal(reserve(store,b.enrollmentId).status,'STOP');assert.equal(store.snapshot().subjects[0].stop_reason,'competitor_chosen');
 assert.equal(store.insights().groups.find(g=>g.campaignId==='refi').competitor_chosen,1);
});
test('partial storage failure rolls back subject, enrollment, inbox, event and projection together',t=>{
 const {store}=setup(t);store.db.exec("CREATE TRIGGER reject_projection BEFORE INSERT ON projections BEGIN SELECT RAISE(ABORT,'injected disk-write failure'); END;");
 assert.throws(()=>store.ingest(intake()),/injected disk-write failure/);const empty=store.snapshot();for(const k of ['subjects','enrollments','events','projections'])assert.equal(empty[k].length,0);assert.equal(store.get('SELECT COUNT(*) AS n FROM inbox').n,0);
 store.db.exec('DROP TRIGGER reject_projection');store.ingest(intake());assert.equal(store.snapshot().events.length,1);
});
test('invalid cadence fails closed even at night and with no marketing grants',t=>{
 const {store}=setup(t);for(const patch of [{milestones:[{id:'bad:id',topic:'demo',offset:{days:2}}]},{timezone:undefined},{preferredChannels:[]},{milestones:[{id:'too-late',topic:'demo',offset:{months:18}}]}]){
  const a=intake('bad',{...config,...patch});a.now='2026-10-18T22:00:00Z';a.receipt.grants={whatsapp:false,email:false,sms:false};assert.throws(()=>store.ingest(a),/campaign configuration/);
 }assert.equal(store.snapshot().events.length,0);
});
test('a blocked CRM enrollment does not starve independent enrollment projections',t=>{
 const {store}=setup(t),a=store.ingest(intake());store.record({eventId:'quiz',enrollmentId:a.enrollmentId,type:'questionnaire',now:DUE});const b=store.ingest(intake('another',config,41));
 const first=store.claimProjection({workerId:'first',now:DUE});assert.equal(first.enrollmentId,a.enrollmentId);assert.equal(store.claimProjection({workerId:'second',now:DUE}).enrollmentId,b.enrollmentId);
});
test('a competitor stop and feedback save roll back together on a projection write failure',t=>{
 const {store}=setup(t),a=store.ingest(intake());store.db.exec("CREATE TRIGGER reject_feedback BEFORE INSERT ON feedback BEGIN SELECT RAISE(ABORT,'injected feedback-write failure'); END;");
 assert.throws(()=>store.saveFeedback({eventId:'f',enrollmentId:a.enrollmentId,answers:{other_provider:'כן'},now:DUE}),/injected/);assert.equal(store.snapshot().subjects[0].stop_reason,null);assert.equal(store.snapshot().events.length,1);
 store.db.exec('DROP TRIGGER reject_feedback');store.saveFeedback({eventId:'f',enrollmentId:a.enrollmentId,answers:{other_provider:'כן'},now:DUE});assert.equal(store.snapshot().subjects[0].stop_reason,'competitor_chosen');
});
test('stale cancellation and cancellation of another meeting cannot clear the current booking',t=>{
 const {store}=setup(t),a=store.ingest(intake());
 store.record({eventId:'booking',enrollmentId:a.enrollmentId,type:'meeting_booked',referenceId:'current',now:'2026-10-20T10:00:00Z'});
 assert.throws(()=>store.record({eventId:'old-cancel',enrollmentId:a.enrollmentId,type:'meeting_cancelled',referenceId:'current',now:DUE}),e=>e.code==='STALE');
 store.record({eventId:'other-cancel',enrollmentId:a.enrollmentId,type:'meeting_cancelled',referenceId:'old',now:'2026-10-20T10:01:00Z'});
 assert.equal(reserve(store,a.enrollmentId,'2026-10-20T11:00:00Z').reason,'human_handling');
 assert.throws(()=>store.record({eventId:'no-ref',enrollmentId:a.enrollmentId,type:'meeting_cancelled',now:'2026-10-20T11:00:00Z'}),/reference/);
 store.record({eventId:'real-cancel',enrollmentId:a.enrollmentId,type:'meeting_cancelled',referenceId:'current',now:'2026-10-20T11:00:00Z'});assert.equal(reserve(store,a.enrollmentId,'2026-10-20T11:00:00Z').status,'RESERVED');
});
test('late booking replay cannot revive an already cancelled meeting at the same timestamp',t=>{
 const {store}=setup(t),a=store.ingest(intake());
 store.record({eventId:'cancel',enrollmentId:a.enrollmentId,type:'meeting_cancelled',referenceId:'cancelled',now:DUE});
 store.record({eventId:'late-booking',enrollmentId:a.enrollmentId,type:'meeting_booked',referenceId:'cancelled',now:DUE});
 assert.equal(JSON.parse(store.snapshot().enrollments[0].state).meetingActive,false);
 store.record({eventId:'fresh-booking',enrollmentId:a.enrollmentId,type:'meeting_booked',referenceId:'new-meeting',now:DUE});assert.equal(reserve(store,a.enrollmentId).reason,'human_handling');
});
test('intake rejects personal text in attribution before storing any data',t=>{
 const {store}=setup(t);for(const attribution of [{source:'private@example.invalid'},{source:'lp1',adId:'0500000040'}])assert.throws(()=>store.ingest({...intake(),attribution}),/known sources/);assert.equal(store.snapshot().subjects.length,0);
});
