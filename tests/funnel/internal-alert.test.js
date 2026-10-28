const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
const {intakeSource,intakeConfig}=require('../../src/webhooks/intake/source');
const {createPayloadExpression}=require('../../src/webhooks/intake/monday-payload');
const {LifecycleDb}=require('../../src/services/lifecycle/db');
const {createLockServer}=require('../../src/services/lifecycle/lock-server');
const {patchInternalAlert}=require('../../src/webhooks/intake/patch-internal-alert');
const cfg=intakeConfig(),base={product:'LP1',first_name:'TEST קמפיין',phone:'0500000045',event_id:'TEST-alert-20261028',service_request:true,utm_source:'synthetic',utm_campaign:'campaign_buyers_south'};
const validate=(body,store={})=>new Function('$input','$getWorkflowStaticData',intakeSource('validate.js'))({first:()=>({json:{body,headers:{}}})},()=>store)[0].json;
const alert=(lead=validate(base),saved={saved:true,mode:'create',request_id:'123'},body=base)=>new Function('$',process.env.INTERNAL_ALERT_SOURCE?fs.readFileSync(process.env.INTERNAL_ALERT_SOURCE,'utf8'):intakeSource('internal-alert.js'))(name=>({first:()=>({json:name==='Check save'?saved:name==='Lead webhook'?{body}:lead})}));
const payload=(body,mode='create')=>JSON.parse(new Function('$json','$','return ('+createPayloadExpression().slice(3,-2)+')')({mode,query:'test',variables:{vals:'{}'}},()=>({first:()=>({json:{body}})})));
test('the nested attribution config never prematurely terminates the n8n expression',()=>assert.equal(createPayloadExpression().slice(3,-2).includes('}}'),false));
test('all three campaign classifications survive validation and the actual Monday expression',()=>{
 for(const campaign of Object.keys(cfg.attribution.campaigns)){
  const body={...base,utm_campaign:campaign},v=validate(body);assert.equal(v.ok,true);assert.equal(v.campaign,'refi');assert.equal(v.utm_campaign,campaign);
  for(const mode of ['create','update']){const cols=JSON.parse(payload(body,mode).variables.vals);assert.equal(cols[cfg.attribution.columns.campaign],campaign);assert.equal(cols[cfg.attribution.columns.source],'synthetic');}
 }
});
test('malformed attribution and unknown reserved campaign ids fail closed',()=>{
 for(const body of [{...base,utm_campaign:'campaign_unknown'},{...base,utm_source:{bad:true}},{...base,utm_campaign:'x\nInjected'}]){
  assert.equal(validate(body).ok,false);assert.throws(()=>payload(body),/attribution/);
 }
});
test('an event cannot be replayed as a different campaign',()=>{
 const store={},v=validate(base,store);store.idem={[v.key]:{id:'123',t:Date.now(),binding_version:1,binding:v.replay_binding}};
 assert.equal(validate(base,store).duplicate,true);
 assert.equal(validate({...base,utm_campaign:'campaign_sellers_south'},store).error,'idempotency_conflict');
});
test('only a confirmed new lead prepares one alert for the configured primary phone',()=>{
 const [out]=alert();assert.equal(out.json.to,require('../../config/business.json').phones.excelent_contact.e164);
 assert.equal(out.json.variables.length,6);assert.ok(out.json.variables[2].includes(base.utm_campaign));assert.ok(out.json.variables[2].includes(base.utm_source));
 assert.equal(out.json.variables[5],cfg.internalAlert.mondayBaseUrl+'/boards/'+cfg.board+'/pulses/123');
 assert.ok(out.json.alertText.includes(base.first_name));assert.ok(out.json.alertText.includes(base.phone));
 for(const saved of [{saved:false,mode:'create',request_id:'123'},{saved:true,mode:'update',request_id:'123'}])assert.deepEqual(alert(undefined,saved),[]);
 assert.deepEqual(alert({...validate(base),duplicate:true}),[]);
 assert.throws(()=>alert(undefined,{saved:true,mode:'create',request_id:'not-an-item'}),/verified/);
});
test('durable alert claim survives process restart and has no blind timeout retry',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'internal-alert-')),file=path.join(dir,'ledger.sqlite'),key=alert()[0].json.dedupKey;
 try{let db=new LifecycleDb(file);assert.equal(db.claimInternalAlert(key,Date.now()).claimed,true);db.close();db=new LifecycleDb(file);assert.equal(db.claimInternalAlert(key,Date.now()+86400000).claimed,false);assert.throws(()=>db.claimInternalAlert('bad',Date.now()),/Invalid/);db.close();}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('separate worker processes race to claim exactly one synthetic alert',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'internal-alert-race-')),file=path.join(dir,'ledger.sqlite'),key=alert()[0].json.dedupKey;
 new LifecycleDb(file).close();const modulePath=require.resolve('../../src/services/lifecycle/db');
 const code="const {LifecycleDb}=require(process.argv[1]);const db=new LifecycleDb(process.argv[2]);console.log(JSON.stringify(db.claimInternalAlert(process.argv[3],Date.now())));db.close();";
 try{const results=await Promise.all(Array.from({length:8},()=>new Promise((resolve,reject)=>{const c=spawn(process.execPath,['-e',code,modulePath,file,key]);let out='',err='';c.stdout.on('data',x=>out+=x);c.stderr.on('data',x=>err+=x);c.on('close',n=>n===0?resolve(JSON.parse(out)):reject(Error(err)));})));assert.equal(results.filter(r=>r.claimed).length,1);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('HTTP alert claim requires auth and blocks twelve concurrent duplicates',async()=>{
 const db=new LifecycleDb(':memory:'),token='test-'.repeat(9),server=createLockServer({db,token});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url='http://127.0.0.1:'+server.address().port+'/internal-alert/claim';
 const claim=(authorized=true,key=alert()[0].json.dedupKey)=>fetch(url,{method:'POST',headers:{'content-type':'application/json',...(authorized?{authorization:'Bearer '+token}:{})},body:JSON.stringify({key})});
 try{assert.equal((await claim(false)).status,401);assert.equal((await claim(true,'bad')).status,400);const out=await Promise.all(Array.from({length:12},()=>claim().then(r=>r.json())));assert.equal(out.filter(r=>r.claimed).length,1);}finally{await new Promise(r=>server.close(r));db.close();}
});
test('retired Gambot workflow patch refuses all activation and preserves the input',()=>{
 const w={settings:{errorWorkflow:'unchanged'},nodes:[{name:'Reply saved',position:[0,0]},{name:'Save to Monday',parameters:{}},{name:'WhatsApp recipients',disabled:true,parameters:{}},{name:'WhatsApp alert',type:'n8n-nodes-base.httpRequest',disabled:true,parameters:{url:'https://api.gambot.co.il/api/v1/messages/send-template'},credentials:{httpHeaderAuth:{id:'existing-provider'}}}],connections:{'Saved?':{main:[[{node:'Reply saved'}]]},'Reply saved':{main:[[{node:'Email alert'}]]},'Email alert':{main:[[{node:'WhatsApp recipients'}]]}}};
 const before=JSON.stringify(w);
 assert.throws(()=>patchInternalAlert(w),/retired/i);
 assert.throws(()=>patchInternalAlert(w,{lockUrl:'http://lock:8787',lockCredentialId:'ExistingLockCred'}),/retired/i);
 assert.equal(JSON.stringify(w),before);
});
test('a provider acknowledgment is never reported as Delivered and ambiguous responses fail',()=>{
 const run=response=>new Function('$input','$',intakeSource('internal-alert-result.js'))({first:()=>({json:response})},()=>({first:()=>alert()[0]}))[0].json;
 for(const response of [{},{success:false},{success:true,data:{}}])assert.throws(()=>run(response),/unconfirmed/);
 assert.throws(()=>run({success:true,data:{messageId:'wamid.synthetic'}}),/unconfirmed/);
 const response={id:'msg_test',object:'message',direction:'outbound',connection_id:alert()[0].json.request.body.connection_id};
 assert.throws(()=>run({...response,connection_id:'other'}),/unconfirmed/);
 const out=run(response);assert.equal(out.accepted,true);assert.equal(out.delivered,false);
});
test('the retired Gambot manual probe refuses generation even when explicitly armed',()=>{
 const {build}=require('./build-internal-alert-probe');
 const provider={nodes:[{name:'WhatsApp alert',credentials:{httpHeaderAuth:{id:'TestExistingCred'}}}]};
 for(const armed of [false,true])assert.throws(()=>build(provider,{itemId:'123',armed}),/retired/i);
});
