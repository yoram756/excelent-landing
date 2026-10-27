'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomBytes}=require('node:crypto');
const {OperationsStore}=require('../../src/services/business-ops/store');
const {createOperationsServer}=require('../../src/services/business-ops/server');
const {seed,stages,caseData,now}=require('./scenario');
test('real loopback HTTP: role separation, ingestion/review, source failure isolation and no send endpoint',async()=>{
 const store=new OperationsStore(':memory:');seed(store);const tokens=Object.fromEntries(['ingest','read','review'].map(k=>[k,randomBytes(32).toString('hex')]));
 const server=createOperationsServer({store,tokens,now:()=>now});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const call=(route,role,body)=>fetch(base+route,{method:body?'POST':'GET',headers:{authorization:'Bearer '+tokens[role],'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
 try{
  assert.equal((await fetch(base+'/health')).status,200);
  assert.equal((await call('/events','read',stages[0].event)).status,401);
  assert.equal((await call('/reviews','ingest',{eventKey:'x',observations:[]})).status,401);
  assert.equal((await call('/events','ingest',{...stages[0].event,source:'broken-source'})).status,400);
  for(const stage of stages){const r=await call('/events','ingest',stage.event);assert.equal(r.status,200);const data=await r.json();const review=await call('/reviews','review',{eventKey:data.eventKey,observations:stage.observations});assert.equal(review.status,200);}
  const replay=await call('/events','ingest',stages[0].event);assert.equal((await replay.json()).duplicate,true);
  assert.equal((await call('/events','ingest',{...stages[0].event,text:'changed'})).status,409);
  const snapshot=await(await call('/snapshot?caseId='+caseData.id,'read')).json();assert.equal(snapshot.tasks.length,2);assert.equal(snapshot.tasks.filter(t=>t.state==='completed').length,1);
  assert.equal((await call('/snapshot?caseId='+caseData.id,'ingest')).status,401);
  assert.equal((await call('/send','review',{to:'nobody'})).status,404);
  const metrics=await(await call('/metrics','read')).json();assert.equal(metrics.events,3);assert.equal(metrics.dispatchEnabled,false);
 }finally{await new Promise(resolve=>server.close(resolve));store.close();}
});
