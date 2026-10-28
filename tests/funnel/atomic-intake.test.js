const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {patchIntake}=require('../../src/webhooks/intake/patch-export');
const {patch}=require('../../src/services/funnel/error-workflow-patch');
const {LifecycleDb}=require('../../src/services/lifecycle/db');
const {createLockServer}=require('../../src/services/lifecycle/lock-server');
const fixture=()=>patch(JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/intake-before-guards.json'))),{role:'leadIntake'});
const opts={lockUrl:'http://127.0.0.1:8787',lockCredentialId:'SyntheticLock0001'};
const lead={ok:true,duplicate:false,key:'TEST_atomic_event_001',eventId:'TEST_atomic_event_001',phone:'972500000081',name:'TEST atomic race'};
const evaluate=(expression,json,$)=>new Function('$json','$','return ('+expression.slice(3,-2)+')')(json,$);

// Executes the generated gate's real HTTP/Code/If/Response graph. The CRM boundary
// is deliberately injected and counted; it is not production Monday evidence.
async function executeGate(w,{value=lead,transport=fetch,write=()=>{},token='t'.repeat(40)}={}){
  const $=name=>{assert.equal(name,'Validate');return {first:()=>({json:value})};};
  let node=w.connections['Needs save?'].main[0][0].node,json=value,response=null;
  for(let step=0;step<12;step++){
    if(node==='Find query'){await write();return {saved:true,response};}
    if(node==='Stop And Error')return {saved:false,stopped:true,response,failure:json.__centralFailure};
    const n=w.nodes.find(n=>n.name===node);assert.ok(n,node);
    if(n.type==='n8n-nodes-base.httpRequest'){
      try{const r=await transport(n.parameters.url,{method:n.parameters.method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:evaluate(n.parameters.jsonBody,json,$)});json={statusCode:r.status,body:await r.json()};}
      catch{if(n.onError!=='continueRegularOutput')throw Error('Uncontrolled lock failure');json={error:{message:'transport unavailable'}};}
    }else if(n.type==='n8n-nodes-base.code')json=new Function('$input','$',n.parameters.jsCode)({first:()=>({json})},$)[0].json;
    else if(n.type==='n8n-nodes-base.if'){
      const yes=evaluate(n.parameters.conditions.conditions[0].leftValue,json,$);node=w.connections[node].main[yes?0:1][0].node;continue;
    }else if(n.type==='n8n-nodes-base.respondToWebhook')response={status:evaluate(n.parameters.options.responseCode,json,$),body:evaluate(n.parameters.responseBody,json,$)};
    else throw Error('Unexpected gate node '+n.type);
    node=w.connections[node].main[0][0].node;
  }
  throw Error('Gate did not terminate');
}
const serve=async db=>{const server=createLockServer({db,token:'t'.repeat(40)});await new Promise(r=>server.listen(0,'127.0.0.1',r));return {url:'http://127.0.0.1:'+server.address().port,close:()=>new Promise(r=>server.close(r))};};

test('37-node migration preserves every original node, error path, setting and disabled send',()=>{
  const input=fixture();assert.equal(input.nodes.length,37);const snapshot=structuredClone(input);
  input.staticData={privateReceipt:'must-not-export'};
  const w=patchIntake(input,opts);assert.equal(w.nodes.length,41);assert.deepEqual(input,{...snapshot,staticData:input.staticData},'input is not mutated');
  assert.deepEqual(w.settings,snapshot.settings);
  for(const n of snapshot.nodes)assert.deepEqual(w.nodes.find(x=>x.id===n.id),n,n.name);
  for(const [name,c]of Object.entries(snapshot.connections))if(name!=='Needs save?')assert.deepEqual(w.connections[name],c,name);
  assert.deepEqual(w.connections['Needs save?'].main[1],snapshot.connections['Needs save?'].main[1]);
  assert.equal(w.staticData,undefined);assert.deepEqual(w.pinData,{});
  assert.equal(w.nodes.some(n=>n.name==='Instant reply'),false);
  const lock=w.nodes.find(n=>n.name==='Atomic lock');assert.equal(lock.retryOnFail,false);
  assert.deepEqual(lock.credentials,{httpHeaderAuth:{id:opts.lockCredentialId,name:'Lock server'}});
  assert.deepEqual(lock.parameters.options.response.response,{fullResponse:true,neverError:true,responseFormat:'json'});
  assert.deepEqual(w.connections['Atomic lock response'].main[0],[{node:'Stop And Error',type:'main',index:0}]);
  const names=new Set(w.nodes.map(n=>n.name));for(const c of Object.values(w.connections))for(const br of c.main)for(const e of br)assert.ok(names.has(e.node),e.node);
});

test('migration rejects changed topology, enabled WhatsApp, duplicate names and incorrect error handler without mutations',()=>{
  for(const mutate of [w=>w.connections['Needs save?'].main[0].push({node:'Save to Monday',type:'main',index:0}),w=>w.nodes.find(n=>n.name==='WhatsApp alert').disabled=false,w=>w.settings.errorWorkflow='other',w=>w.nodes[0].name=w.nodes[1].name,w=>w.nodes.find(n=>n.name==='Stop And Error').disabled=true,w=>w.connections['Atomic bypass']={main:[[{node:'Find query',type:'main',index:0}]]}]){
    const w=fixture();mutate(w);const before=structuredClone(w);assert.throws(()=>patchIntake(w,opts),/Unexpected|Ambiguous/);assert.deepEqual(w,before);
  }
  assert.throws(()=>patchIntake(fixture(),{...opts,lockCredentialId:''}),/LOCK_CREDENTIAL_ID/);
  assert.throws(()=>patchIntake(fixture(),{...opts,lockUrl:'http://lock:8787?secret=x'}),/LOCK_SERVER_URL/);
});

test('unverified admissions and transport failures reach existing controlled Stop And Error with no CRM write',async()=>{
  const w=patchIntake(fixture(),opts),future=new Date(Date.now()+60000).toISOString();
  for(const body of [{},{locked:'true',phone:lead.phone,lockedUntil:future},{locked:true,phone:'972500000082',lockedUntil:future},{locked:true,phone:lead.phone,lockedUntil:'invalid'},{locked:true,phone:lead.phone,lockedUntil:new Date(0).toISOString()}]){
    const r=await executeGate(w,{transport:async()=>({status:200,json:async()=>body}),write:()=>assert.fail('CRM write after unverified lock')});assert.equal(r.response.status,503);assert.equal(r.stopped,true);
  }
  for(const status of [401,429,500]){const r=await executeGate(w,{transport:async()=>({status,json:async()=>({error:'provider failure'})})});assert.equal(r.response.status,503);assert.equal(r.stopped,true);}
  const down=await executeGate(w,{transport:async()=>{throw Error('down');}});assert.equal(down.response.status,503);assert.equal(down.failure.code,'provider_error');
  const duplicate=await executeGate(w,{transport:async()=>({status:200,json:async()=>({locked:false,phone:lead.phone,lockedUntil:future})})});assert.equal(duplicate.response.status,409);assert.equal(duplicate.failure.code,'duplicate_lead');
});

test('two real HTTP workers share a SQLite lock: 20 concurrent executions permit one simulated CRM write',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'atomic-intake-')),dbPath=path.join(dir,'locks.sqlite');
  const db1=new LifecycleDb(dbPath),db2=new LifecycleDb(dbPath),a=await serve(db1),b=await serve(db2);
  try{
    const workflows=[a,b].map(s=>patchIntake(fixture(),{...opts,lockUrl:s.url}));let writes=0;
    const results=await Promise.all(Array.from({length:20},(_,i)=>executeGate(workflows[i%2],{write:async()=>{writes++;await new Promise(r=>setTimeout(r,20));}})));
    assert.equal(writes,1);assert.equal(results.filter(r=>r.saved).length,1);assert.equal(results.filter(r=>r.stopped&&r.response.status===409).length,19);
    assert.equal(db1.db.prepare("SELECT count(*) n FROM lifecycle_events WHERE type='lead_received'").get().n,1);
    assert.equal(db1.db.prepare("SELECT count(*) n FROM lifecycle_events WHERE type='duplicate_blocked'").get().n,19);
    const bypass=structuredClone(workflows[0]);bypass.connections['Needs save?'].main[0]=[{node:'Find query',type:'main',index:0}];let brokenWrites=0;
    await Promise.all(Array.from({length:20},()=>executeGate(bypass,{write:()=>brokenWrites++})));
    assert.throws(()=>assert.equal(brokenWrites,1),{code:'ERR_ASSERTION'},'negative control must reject removed wiring');assert.equal(brokenWrites,20);
  }finally{await a.close();await b.close();db1.close();db2.close();fs.rmSync(dir,{recursive:true,force:true});}
});
