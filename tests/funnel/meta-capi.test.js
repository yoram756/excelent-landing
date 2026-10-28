const test=require('node:test'),assert=require('node:assert/strict');
const {buildTestRequest,sendTestOnce}=require('../../scripts/test-meta-capi-once.cjs');
const id='TEST-CAPI-contract-20261029-001';
const fixture=()=>({item:{id:'123',name:'TEST synthetic CAPI',state:'active',board:{id:'900000001'},email:'private-real@example.com',phone:'0551234567',financialData:'never-export',column_values:[{id:'configured_event',text:id,value:JSON.stringify(id)}]},boardId:'900000001',eventColumn:'configured_event',datasetId:'900000002',testCode:'TEST1234',now:1793232000000,accessToken:'synthetic-credential-only'});
test('CAPI test derives the exact event ID from configured Monday storage and excludes CRM contacts',()=>{
 const r=buildTestRequest(fixture());assert.equal(r.endpoint,'https://graph.facebook.com/v26.0/900000002/events');assert.equal(r.body.data.length,1);
 const event=r.body.data[0];assert.equal(event.event_id,id);assert.equal(event.event_name,'Lead');assert.equal(event.action_source,'system_generated');assert.equal(event.opt_out,true);
 assert.match(event.user_data.em[0],/^[a-f0-9]{64}$/);assert.match(event.user_data.external_id[0],/^[a-f0-9]{64}$/);
 assert.doesNotMatch(JSON.stringify(r),/private-real|0551234567|never-export|access_token/);
});
test('missing, conflicting, wrong-board, non-TEST and deleted fixtures are rejected before claim or transport',async()=>{
 for(const mutate of [x=>x.item.column_values=[],x=>x.item.column_values.push(x.item.column_values[0]),x=>x.item.column_values[0].value=JSON.stringify('TEST-different-001'),x=>x.item.name='Real lead',x=>x.item.board.id='other',x=>x.item.state='deleted',x=>x.datasetId='900000002?access_token=bad',x=>x.graphVersion='v26.0/elsewhere',x=>x.testCode='',x=>x.accessToken='']){
  const x=fixture();mutate(x);await assert.rejects(sendTestOnce(x,{claim:()=>assert.fail('invalid fixture claimed'),transport:()=>assert.fail('invalid fixture sent')}));
 }
});
test('one claimed request uses a header credential and API receipt is not Test Events proof',async()=>{
 let claims=0,calls=0;
 const r=await sendTestOnce(fixture(),{claim:()=>claims++,transport:async(url,options)=>{calls++;assert.ok(!url.includes(fixture().accessToken));assert.equal(options.headers.authorization,'Bearer '+fixture().accessToken);assert.equal(options.redirect,'error');assert.equal(JSON.parse(options.body).data[0].event_id,id);return {status:200,json:async()=>({events_received:1,fbtrace_id:'synthetic-trace'})};}});
 assert.equal(claims,1);assert.equal(calls,1);assert.equal(r.apiAccepted,true);assert.equal(r.metaTestEventsStatus,'NOT TESTED');
 assert.ok(!JSON.stringify(r).includes(fixture().accessToken));assert.ok(!JSON.stringify(r).includes(fixture().testCode));
});
test('claimed or uncertain attempts cannot be blindly repeated and never expose credentials',async()=>{
 let calls=0,claimed=false;const deps={claim:()=>{if(claimed)throw Error('already attempted');claimed=true;},transport:async()=>{calls++;throw Error(fixture().accessToken);}};
 const r=await sendTestOnce(fixture(),deps);assert.equal(r.deliveryUnknown,true);assert.equal(calls,1);assert.ok(!JSON.stringify(r).includes(fixture().accessToken));
 await assert.rejects(sendTestOnce(fixture(),deps),/already attempted/);assert.equal(calls,1);
 await assert.rejects(sendTestOnce({...fixture(),testCode:'TESTPREVIEW'},deps),/verified test code/);
});
test('HTTP 200 without one acknowledged event, API errors and malformed responses are never accepted',async()=>{
 for(const body of [{events_received:0},{events_received:2},{success:true},{events_received:1,error:{code:190,message:fixture().accessToken}}]){
  const r=await sendTestOnce(fixture(),{claim:()=>{},transport:async()=>({status:200,json:async()=>body})});assert.equal(r.apiAccepted,false);assert.ok(!JSON.stringify(r).includes(fixture().accessToken));
 }
 const r=await sendTestOnce(fixture(),{claim:()=>{},transport:async()=>({status:502,json:async()=>{throw Error('bad JSON');}})});assert.equal(r.malformedResponse,true);assert.equal(r.apiAccepted,false);assert.equal(r.deliveryUnknown,true);
 const echo=await sendTestOnce(fixture(),{claim:()=>{},transport:async()=>({status:200,json:async()=>({events_received:1,fbtrace_id:fixture().accessToken})})});assert.equal(echo.traceId,null);assert.ok(!JSON.stringify(echo).includes(fixture().accessToken));
});
