const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {adapt}=require('../../automation/lifecycle/lp1-adapter'),{Store}=require('../../automation/lifecycle/store'),campaign=require('../../config/lifecycle/refi.json');
const source=fs.readFileSync(path.resolve(__dirname,'../../automation/intake/validate.js'),'utf8');
const body={product:'LP1',first_name:'TEST חיבור מקומי',phone:'0500000040',email:'test@example.invalid',idempotency_key:'test-lp1-adapter-001',service_request:true,marketing_consent:false,marketing_channels:['email'],answers:{ask:'call',when:'week'}};
function validate(b=body){return new Function('$input','$getWorkflowStaticData',source)({first:()=>({json:{body:b,headers:{}}})},()=>({}))[0].json;}
const options=()=>({campaign,now:new Date().toISOString()});
const clone=x=>JSON.parse(JSON.stringify(x));
test('actual LP1 Validate output maps explicit email-only proof into durable intake and CRM outbox',()=>{
 const v=validate(),mapped=adapt(v,options()),s=new Store(':memory:',{sandbox:true});try{
  const e=s.ingest(mapped),again=s.ingest(adapt(v,options()));assert.equal(again.enrollmentId,e.enrollmentId);assert.equal(again.replayed,true);assert.equal(mapped.dispatchEnabled,false);
  const rows=s.snapshot();assert.equal(rows.enrollments[0].started_at,v.contact_permissions.receivedAt);assert.equal(rows.events.length,1);assert.equal(rows.projections.length,1);
  const saved=JSON.parse(rows.enrollments[0].consent);assert.deepEqual(saved.grants,{email:true,sms:false,whatsapp:false});assert.equal(saved.origin.requestId,v.key);assert.equal(saved.campaignId,'refi');
  const projection=s.claimProjection({workerId:'crm-test',now:options().now});assert.equal(projection.type,'entered');assert.equal(projection.detail.source,'lp1');assert.equal(rows.projections[0].state,'queued');
 }finally{s.close();}
});
test('generic legacy checkbox, missing proof and forged client output never invent grants',()=>{
 for(const v of [validate({...body,marketing_channels:undefined,marketing_consent:true}),validate({...body,service_request:false}),{...validate(),ok:false},{...validate(),duplicate:true}])assert.throws(()=>adapt(v,options()));
});
test('receipt is bound to product, request id, recipient and explicit campaign mapping',()=>{
 const original=validate();for(const change of [v=>v.product='LP2',v=>v.channel='וואטסאפ',v=>v.contact_permissions.requestId='other-request',v=>v.contact_permissions.phone='0500000041',v=>v.email='other@example.invalid',v=>v.contact_permissions.source='Meta',v=>v.contact_permissions.version='legacy']){const v=clone(original);change(v);assert.throws(()=>adapt(v,options()));}
 assert.throws(()=>adapt(original,{...options(),campaign:{...campaign,id:'purchase'}}));
});
test('all seven grant combinations plus callback-only retain exact independent choices',()=>{
 for(let mask=0;mask<8;mask++){const channels=['whatsapp','email','sms'].filter((_,i)=>mask&(1<<i)),v=validate({...body,marketing_channels:channels,marketing_consent:channels.includes('whatsapp')}),mapped=adapt(v,options());assert.deepEqual(mapped.receipt.grants,{whatsapp:channels.includes('whatsapp'),email:channels.includes('email'),sms:channels.includes('sms')});}
});
test('unknown, missing, truthy and contradictory grants fail closed',()=>{
 for(const change of [v=>v.contact_permissions.grants.email='true',v=>delete v.contact_permissions.grants.sms,v=>v.contact_permissions.grants.push=true,v=>v.marketing_consent=true,v=>{v.email=null;v.contact_permissions.email=null;}]){const v=validate();change(v);assert.throws(()=>adapt(v,options()));}
});
test('original server receipt anchors the horizon even after an eighteen-month processing delay',()=>{
 const v=validate();v.contact_permissions.receivedAt='2026-10-18T09:00:00.000Z';v.service_request_at='2035-01-01';v.marketing_consent_at='2035-01-01';
 const s=new Store(':memory:',{sandbox:true});try{const r=s.ingest(adapt(v,{campaign,now:'2028-04-18T09:00:00Z'}));assert.equal(s.snapshot().enrollments[0].started_at,'2026-10-18T09:00:00.000Z');assert.equal(s.reserve({enrollmentId:r.enrollmentId,workerId:'clock',now:'2028-04-18T09:00:00Z'}).reason,'horizon_complete');}finally{s.close();}
});
test('equivalent receipt timestamps replay but changing enrollment origin conflicts',()=>{
 const v=validate(),s=new Store(':memory:',{sandbox:true});v.contact_permissions.receivedAt='2026-10-18T09:00:00.000Z';try{const a=adapt(v,{campaign,now:'2026-10-20T09:00:00.000Z'});s.ingest(a);const b=clone(a);b.enrolledAt=b.enrolledAt.replace('.000Z','Z');assert.notEqual(b.enrolledAt,a.enrolledAt);assert.equal(s.ingest(b).replayed,true);assert.throws(()=>s.ingest({...a,enrolledAt:new Date(Date.parse(a.enrolledAt)+1).toISOString(),now:new Date(Date.parse(a.now)+5).toISOString()}),e=>e.code==='CONFLICT');}finally{s.close();}
});
test('long request ids are not truncated into collisions and financial answers never cross this adapter',()=>{
 const a=validate({...body,idempotency_key:'a'.repeat(79)+'x',money_included:true,answers:{bal:'b5',strain:'late'}}),b=validate({...body,idempotency_key:'a'.repeat(79)+'y'}),mapped=adapt(a,options());assert.notEqual(mapped.eventId,adapt(b,options()).eventId);assert.ok(mapped.eventId.length<=80);assert.equal(mapped.answers,undefined);assert.equal(mapped.name,undefined);assert.equal(mapped.receipt.recipients.email,body.email);
});
test('future server dates and malformed or inconsistent enrollment clocks cannot enter the store',()=>{
 const v=validate();v.contact_permissions.receivedAt='2030-01-01T00:00:00Z';assert.throws(()=>adapt(v,options()));
 const s=new Store(':memory:',{sandbox:true});try{const a=adapt(validate(),options());for(const start of ['bad','2030-01-01T00:00:00Z','2000-01-01T00:00:00Z'])assert.throws(()=>s.ingest({...a,enrolledAt:start}));assert.equal(s.snapshot().subjects.length,0);}finally{s.close();}
});
