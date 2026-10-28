const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {patchIntake}=require('../../src/webhooks/intake/patch-export');
const {patch}=require('../../src/services/funnel/error-workflow-patch');
const {LifecycleDb}=require('../../src/services/lifecycle/db');
const {createLockServer}=require('../../src/services/lifecycle/lock-server');
const {incrementalGuardedIntake}=require('../../src/webhooks/intake/atomic-export');
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
  assert.equal(w.nodes.find(n=>n.name==='Atomic lock failed?').parameters.conditions.options.version,1,'match the n8n serialized IF contract');
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

test('incremental editor import retains 37 nodes and requires the explicit three-link rewiring plan',async()=>{
  const input=fixture(),{artifact,rewiring}=incrementalGuardedIntake(input,opts);
  assert.equal(artifact.nodes.length,4);assert.equal(artifact.settings,undefined);
  assert.equal(artifact.nodes.some(n=>input.nodes.some(old=>old.id===n.id||old.name===n.name)),false);
  assert.equal(rewiring.remove.length,1);assert.equal(rewiring.add.length,3);
  const names=new Set(artifact.nodes.map(n=>n.name));
  for(const c of Object.values(artifact.connections))for(const branch of c.main)for(const e of branch)assert.ok(names.has(e.node),'imports cannot silently link existing nodes');
  const apply=remove=>{
    const w=structuredClone(input);w.nodes.push(...structuredClone(artifact.nodes));Object.assign(w.connections,structuredClone(artifact.connections));
    for(const e of remove)w.connections[e.from].main[e.output]=w.connections[e.from].main[e.output].filter(t=>t.node!==e.to);
    for(const e of rewiring.add){w.connections[e.from]??={main:[]};w.connections[e.from].main[e.output]??=[];w.connections[e.from].main[e.output].push({node:e.to,type:'main',index:e.input});}
    return w;
  };
  const w=apply(rewiring.remove);assert.equal(w.nodes.length,41);assert.deepEqual(w.settings,input.settings);
  for(const n of input.nodes)assert.deepEqual(w.nodes.find(x=>x.id===n.id),n);
  const blocked=await executeGate(w,{transport:async()=>{throw Error('down');},write:()=>assert.fail('unverified admission reached CRM')});
  assert.equal(blocked.stopped,true);assert.equal(blocked.response.status,503);
  // Negative control: append-only import without removing the old edge bypasses
  // admission and must be rejected, even though all four new nodes are present.
  const broken=await executeGate(apply([]),{write:()=>{}});assert.equal(broken.saved,true);
  assert.throws(()=>assert.equal(broken.saved,false),{code:'ERR_ASSERTION'});
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
