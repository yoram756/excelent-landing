const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const root=process.env.INTAKE_SOURCE_ROOT||path.resolve(__dirname,'../../src/webhooks/intake');
const {inject}=require('../../src/webhooks/intake/source');
const read=n=>inject(fs.readFileSync(path.join(root,n+'.js'),'utf8'));
const base={product:'LP1',first_name:'TEST פנימי',phone:'0500000040',idempotency_key:'test-intake-001',service_request:true,marketing_consent:false,answers:{ask:'check',when:'week'}};
const validate=(b,store={})=>new Function('$input','$getWorkflowStaticData',read('validate'))({first:()=>({json:{body:b,headers:{}}})},()=>store)[0].json;
const save=(v,store={},response={data:{create_item:{id:'123'}}})=>new Function('$input','$','$getWorkflowStaticData',read('check-save'))(
 {first:()=>({json:response})},n=>({first:()=>({json:n==='Validate'?v:{mode:'create'}})}),()=>store)[0].json;
test('form source cannot impersonate a received WhatsApp message',()=>{const a=validate(base),b=validate({...base,source:'LP1 וואטסאפ'});assert.equal(b.channel,'טופס');assert.equal(b.score.score,a.score.score);});
test('money requires explicit boolean consent and marketing is independent',()=>{const r=validate({...base,money_included:'false',answers:{...base.answers,bal:'b3'}});assert.equal(r.answers.bal,undefined);assert.equal(r.money_included,false);assert.equal(r.marketing_consent,false);assert.equal(validate({...base,service_request:false}).ok,false);});
test('invalid dates and inherited answer names are rejected',()=>{for(const b of [{...base,service_request_at:'bad'},{...base,answers:{has:'toString'}},{...base,answers:{toString:'x'}}])assert.equal(validate(b).ok,false);});
test('same idempotency key returns the saved id, not a new create',()=>{const store={};assert.equal(save(validate(base),store).saved,true);const r=validate(base,store);assert.equal(r.duplicate,true);assert.equal(r.request_id,'123');});
test('Monday lookup failure cannot fall back to create',()=>{for(const r of [{errors:[{message:'down'}]},{data:{}}])assert.throws(()=>new Function('$input','$','$getWorkflowStaticData',read('build-mutation'))({first:()=>({json:r})},()=>({first:()=>({json:validate(base)})}),()=>({})),/lookup failed/);});
test('partial GraphQL save failure never returns success',()=>{const r=new Function('$input','$','$getWorkflowStaticData',read('check-save'))({first:()=>({json:{data:{create_item:{id:'123'}},errors:[{message:'partial'}]}})},()=>({first:()=>({json:{}})}),()=>({}))[0].json;assert.equal(r.saved,false);assert.equal(r.status,502);});
test('phone lookup declares the required non-null list and sends one unformatted number',()=>{const r=new Function('$input',read('find-query'))({first:()=>({json:{phone:'972500000040',phoneLocal:'0500000040'}})})[0].json;assert.ok(r.query.includes('$v:[String]!'));assert.deepEqual(r.variables.v,['972500000040']);assert.ok(r.query.includes('cursor items'));});
test('partial lookup cannot create and a normalized exact phone updates the existing item',()=>{
 const v=validate(base),run=r=>new Function('$input','$','$getWorkflowStaticData',read('build-mutation'))({first:()=>({json:r})},()=>({first:()=>({json:v})}),()=>({}))[0].json;
 assert.throws(()=>run({data:{items_page_by_column_values:{items:[],cursor:'more'}}}),/incomplete/);
 const r=run({data:{items_page_by_column_values:{cursor:null,items:[{id:'123',created_at:new Date().toISOString(),column_values:[{id:'refi_phone',text:'+972 50-000-0040'}]}]}}});assert.equal(r.mode,'update');assert.equal(r.itemId,'123');
});

test('channel receipt binds choices to recipient and server receipt time',()=>{
 const r=validate({...base,email:'test@example.invalid',marketing_consent:true,marketing_channels:['whatsapp','email','sms'],marketing_consent_at:'2000-01-01T00:00:00Z'});
 assert.equal(r.email,'test@example.invalid');assert.deepEqual(r.contact_permissions.grants,{whatsapp:true,email:true,sms:true});
 assert.equal(r.contact_permissions.phone,'972500000040');assert.equal(r.contact_permissions.requestId,base.idempotency_key);
 assert.equal(r.contact_permissions.version,'lp1-channels-20261020');assert.ok(Date.now()-Date.parse(r.contact_permissions.receivedAt)<5000);
});
test('email-only consent cannot authorize WhatsApp or SMS',()=>{
 const r=validate({...base,email:'test@example.invalid',marketing_channels:['email']});
 assert.equal(r.ok,true);assert.equal(r.marketing_consent,false);assert.deepEqual(r.contact_permissions.grants,{whatsapp:false,email:true,sms:false});
});
test('empty choices preserve callback request without marketing permission',()=>{
 const r=validate({...base,marketing_channels:[]});assert.equal(r.ok,true);assert.deepEqual(r.contact_permissions.grants,{whatsapp:false,email:false,sms:false});
});
test('legacy generic consent never invents channel-specific proof',()=>{
 const r=validate({...base,marketing_consent:true});assert.equal(r.contact_permissions,null);assert.equal(r.email,null);
});
test('invalid or contradictory channel payloads are rejected',()=>{
 for(const b of [{marketing_channels:'email'},{marketing_channels:['push']},{marketing_channels:['sms','sms']},{marketing_channels:['whatsapp']},{marketing_channels:[],marketing_consent:true},{marketing_channels:['email']}]) assert.equal(validate({...base,...b}).ok,false);
});
test('invalid email and header injection are rejected; optional email stays optional',()=>{
 for(const email of ['bad','a@b','a@b.co\r\nBcc: other@example.invalid','a'.repeat(255)+'@b.co'])assert.equal(validate({...base,email}).ok,false);
 assert.equal(validate({...base,email:''}).ok,true);
});
test('modern consent and email persist in the mutation and clear prior WhatsApp opt-in',()=>{
 const v=validate({...base,email:'test@example.invalid',marketing_channels:['email']});
 const r=new Function('$input','$','$getWorkflowStaticData',read('build-mutation'))({first:()=>({json:{data:{items_page_by_column_values:{items:[],cursor:null}}}})},()=>({first:()=>({json:v})}),()=>({}))[0].json;
 const c=JSON.parse(r.variables.vals);assert.equal(c.fn_email.email,v.email);assert.equal(c.boolean_mm88mzry.checked,'false');assert.deepEqual(c.date_mm88qwfm,{});
 assert.deepEqual(JSON.parse(c.long_text_mm8ag9s.text),v.contact_permissions);
});

test('replayed key cannot acknowledge a different recipient',()=>{
 const store={};assert.equal(save(validate(base),store).saved,true);
 const r=validate({...base,phone:'0500000041'},store);
 assert.equal(r.ok,false);assert.equal(r.status,409);assert.equal(r.error,'idempotency_conflict');assert.equal(r.request_id,undefined);
 assert.equal(store.idem[base.idempotency_key].id,'123');
});
test('replayed key cannot silently discard changed request or consent',()=>{
 const original={...base,email:'test@example.invalid',marketing_channels:['email']};
 for(const change of [{first_name:'TEST אחר'},{email:'other@example.invalid'},{answers:{ask:'meet',when:'week'}},{money_included:true},{marketing_channels:[]},{marketing_consent:true,marketing_channels:['whatsapp','email']},{marketing_channels:undefined}]){
  const store={};assert.equal(save(validate(original),store).saved,true);
  const r=validate({...original,...change},store);
  assert.equal(r.ok,false,JSON.stringify(change));assert.equal(r.status,409);assert.equal(r.error,'idempotency_conflict');assert.equal(r.request_id,undefined);
 }
});
test('bound replay accepts normalized identity and reordered fields despite regenerated timestamps',()=>{
 const store={},original={...base,email:'test@example.invalid',marketing_consent:true,marketing_channels:['whatsapp','email'],service_request_at:'2026-10-20T08:00:00Z',marketing_consent_at:'2026-10-20T08:00:00Z'};
 assert.equal(save(validate(original),store).saved,true);
 const r=validate({...original,first_name:'  TEST   פנימי ',phone:'+972 50-000-0040',answers:{when:'week',ask:'check'},marketing_channels:['email','whatsapp'],service_request_at:'2026-10-20T08:01:00Z',marketing_consent_at:'2026-10-20T08:01:00Z'},store);
 assert.equal(r.ok,true);assert.equal(r.duplicate,true);assert.equal(r.request_id,'123');
});
test('legacy unbound receipt never acknowledges a request or creates a replacement',()=>{
 const store={idem:{[base.idempotency_key]:{id:'123',t:Date.now()}}};
 const r=validate(base,store);assert.equal(r.ok,false);assert.equal(r.status,409);assert.equal(r.error,'idempotency_unverified');assert.equal(r.request_id,undefined);
 assert.equal(store.idem[base.idempotency_key].id,'123');
});
test('failed Monday save does not create a replay receipt',()=>{
 const store={},v=validate(base);
 assert.equal(save(v,store,{data:{create_item:{id:'123'}},errors:[{message:'partial'}]}).saved,false);
 assert.equal(store.idem?.[base.idempotency_key],undefined);assert.equal(validate(base,store).duplicate,false);
});
test('reused key cannot cross the supported product or campaign',()=>{
 const store={};save(validate(base),store);
 for(const change of [{product:'LP2'},{campaign:'another-campaign'}]){
  const r=validate({...base,...change},store);assert.equal(r.ok,false);assert.equal(r.request_id,undefined);
 }
 assert.equal(validate({...base,campaign:'refi'},store).request_id,'123');
});
test('save confirmation requires the bound validated request',()=>{
 const store={},v=validate(base);delete v.replay_binding;
 const r=save(v,store);assert.equal(r.saved,false);assert.equal(r.status,502);assert.equal(store.idem,undefined);
});
test('malformed replay receipts fail closed without exposing the cached item',()=>{
 const original={};save(validate(base),original);const receipt=original.idem[base.idempotency_key];
 for(const prior of [null,[],{}, {...receipt,id:''},{...receipt,id:'not-an-item'},{...receipt,t:'yesterday'},{...receipt,t:Date.now()+3600e3},{...receipt,binding_version:2},{...receipt,binding:null},{...receipt,binding:'{broken'}]){
  const store={idem:{[base.idempotency_key]:prior}},r=validate(base,store);
  assert.equal(r.ok,false);assert.equal(r.status,409);assert.equal(r.request_id,undefined);assert.deepEqual(store.idem[base.idempotency_key],prior);
 }
 for(const idem of [[], 'broken']){const r=validate(base,{idem});assert.equal(r.ok,false);assert.equal(r.status,503);assert.equal(r.request_id,undefined);}
});
test('malformed Monday item identifiers never return success or prime the replay cache',()=>{
 for(const id of ['',0,{},[],true,'not-an-item']){const store={},r=save(validate(base),store,{data:{create_item:{id}}});assert.equal(r.saved,false);assert.equal(r.status,502);assert.equal(store.idem,undefined);}
});
test('expired bound receipt is pruned before accepting a fresh request',()=>{
 const store={};save(validate(base),store);store.idem[base.idempotency_key].t=Date.now()-49*3600e3;
 const r=validate(base,store);assert.equal(r.ok,true);assert.equal(r.duplicate,false);assert.equal(store.idem[base.idempotency_key],undefined);
});
