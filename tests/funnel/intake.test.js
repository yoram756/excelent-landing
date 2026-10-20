const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const root=process.env.INTAKE_SOURCE_ROOT||path.resolve(__dirname,'../../automation/intake');
const read=n=>fs.readFileSync(path.join(root,n+'.js'),'utf8');
const base={product:'LP1',first_name:'TEST פנימי',phone:'0500000040',idempotency_key:'test-intake-001',service_request:true,marketing_consent:false,answers:{ask:'check',when:'week'}};
const validate=(b,store={})=>new Function('$input','$getWorkflowStaticData',read('validate'))({first:()=>({json:{body:b,headers:{}}})},()=>store)[0].json;
test('form source cannot impersonate a received WhatsApp message',()=>{const a=validate(base),b=validate({...base,source:'LP1 וואטסאפ'});assert.equal(b.channel,'טופס');assert.equal(b.score.score,a.score.score);});
test('money requires explicit boolean consent and marketing is independent',()=>{const r=validate({...base,money_included:'false',answers:{...base.answers,bal:'b3'}});assert.equal(r.answers.bal,undefined);assert.equal(r.money_included,false);assert.equal(r.marketing_consent,false);assert.equal(validate({...base,service_request:false}).ok,false);});
test('invalid dates and inherited answer names are rejected',()=>{for(const b of [{...base,service_request_at:'bad'},{...base,answers:{has:'toString'}},{...base,answers:{toString:'x'}}])assert.equal(validate(b).ok,false);});
test('same idempotency key returns the saved id, not a new create',()=>{const r=validate(base,{idem:{'test-intake-001':{id:'123',t:Date.now()}}});assert.equal(r.duplicate,true);assert.equal(r.request_id,'123');});
test('Monday lookup failure cannot fall back to create',()=>{for(const r of [{errors:[{message:'down'}]},{data:{}}])assert.throws(()=>new Function('$input','$','$getWorkflowStaticData',read('build-mutation'))({first:()=>({json:r})},()=>({first:()=>({json:validate(base)})}),()=>({})),/lookup failed/);});
test('partial GraphQL save failure never returns success',()=>{const r=new Function('$input','$','$getWorkflowStaticData',read('check-save'))({first:()=>({json:{data:{create_item:{id:'123'}},errors:[{message:'partial'}]}})},()=>({first:()=>({json:{}})}),()=>({}))[0].json;assert.equal(r.saved,false);assert.equal(r.status,502);});
test('phone lookup declares the required non-null list and sends one unformatted number',()=>{const r=new Function('$input',read('find-query'))({first:()=>({json:{phone:'972500000040',phoneLocal:'0500000040'}})})[0].json;assert.ok(r.query.includes('$v:[String]!'));assert.deepEqual(r.variables.v,['972500000040']);assert.ok(r.query.includes('cursor items'));});
test('partial lookup cannot create and a normalized exact phone updates the existing item',()=>{
 const v=validate(base),run=r=>new Function('$input','$','$getWorkflowStaticData',read('build-mutation'))({first:()=>({json:r})},()=>({first:()=>({json:v})}),()=>({}))[0].json;
 assert.throws(()=>run({data:{items_page_by_column_values:{items:[],cursor:'more'}}}),/incomplete/);
 const r=run({data:{items_page_by_column_values:{cursor:null,items:[{id:'123',created_at:new Date().toISOString(),column_values:[{id:'refi_phone',text:'+972 50-000-0040'}]}]}}});assert.equal(r.mode,'update');assert.equal(r.itemId,'123');
});
