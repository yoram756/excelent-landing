// Gambot HSM payload, the consolidation campaign file, and the intake wiring (lock before Find query, instant reply after the response).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'../..');
const hsm=require(ROOT+'/src/services/funnel/gambot-hsm');
const {patchIntake}=require(ROOT+'/src/webhooks/intake/patch-export');
const {intakeSource}=require(ROOT+'/src/webhooks/intake/source');
const {campaignIndex}=require(ROOT+'/src/webhooks/intake/meta-adapter');
const refi=require(ROOT+'/src/config/campaigns/refi.json'),cons=require(ROOT+'/src/config/campaigns/consolidation.json');
const biz=require(ROOT+'/config/business.json');
const on={...refi,instantReply:{...refi.instantReply,enabled:true,template:{...refi.instantReply.template,id:'1234567890'}}};
const lead={itemId:'77',name:'TEST דנה',firstName:'דנה',phone:'972500000040',receivedAt:'2026-10-24T09:00:00Z',grants:{whatsapp:true},marketing:false};
const at=s=>Date.parse('2026-10-24T09:00:00Z')+s*1000;

test('template payload: recipient, Gambot sender and approved numeric template id are enforced',()=>{
  assert.equal(hsm.SEND_URL,'https://api.gambot.co.il/api/v1/messages/send-template');
  assert.deepEqual(hsm.templatePayload({to:'972500000040',from:'972559881245',templateId:1234567,variables:['דנה',5]}),{to:'972500000040',from:'972559881245',templateId:'1234567',variables:['דנה','5']});
  assert.throws(()=>hsm.templatePayload({to:'0500000040',from:'972559881245',templateId:'1234567'}),/bad_recipient/);
  assert.throws(()=>hsm.templatePayload({to:'972500000040',from:'',templateId:'1234567'}),/bad_sender/);
  for(const id of [null,'PENDING','12345'])assert.throws(()=>hsm.templatePayload({to:'972500000040',from:'972559881245',templateId:id}),/bad_template_id/);});

test('instant payload goes out only inside 60 seconds, from config/business.json gambot_sender, with consent',()=>{
  const run=(o={})=>hsm.instantPayload({lead,cfg:on,biz,now:at(30),mode:'test',...o});
  assert.deepEqual(run(),{ok:true,payload:{to:'972500000040',from:biz.phones.gambot_sender.e164,templateId:'1234567890',variables:['דנה']}});
  assert.equal(biz.phones.gambot_sender.e164,'972559881245');
  assert.equal(run({now:at(60)}).ok,true);assert.equal(run({now:at(61)}).reason,'window_missed');assert.equal(run({now:at(-1)}).reason,'window_missed');
  assert.equal(run({cfg:refi}).reason,'disabled','repo keeps it off');
  assert.equal(run({cfg:cons}).reason,'disabled');
  assert.equal(run({lead:{...lead,grants:{whatsapp:false}}}).reason,'no_whatsapp_consent');
  assert.equal(run({lead:{...lead,phone:'97250000004'}}).reason,'bad_phone');
  assert.equal(run({lead:{...lead,name:'דנה כהן'}}).reason,'test_mode_real_lead');
  assert.equal(run({lead:{...lead,name:'דנה כהן'},mode:'live'}).ok,true);
  assert.equal(run({lead:{...lead,receivedAt:null}}).reason,'window_missed');});

test('consolidation is its own modular campaign file: no Meta ids, identity or instant reply inherited from refi',()=>{
  assert.equal(cons.id,'consolidation');assert.deepEqual(cons.meta.campaignIds,[]);assert.equal(cons.meta.adAccount,null);
  assert.equal(cons.identity.approved,false);assert.equal(cons.instantReply.enabled,false);assert.equal(cons.instantReply.template.id,null);
  assert.equal(cons.instantReply.withinSeconds,60);assert.equal(cons.crmFields.nicheSegment.value,'consolidation');
  const idx=campaignIndex();assert.equal(idx['120252891592490603'],'refi');assert.ok(!Object.values(idx).includes('consolidation'),'no Meta lead maps to consolidation until its ids are added');});

// Synthetic stand-in for the private 18 node intake export (names and routing that patch-export.js relies on).
const exportFixture=()=>{
  const names=['Webhook','Validate','Valid?','Find query','Find by phone','Build mutation','Save to Monday','Check save','Saved?','Reply saved','Alert query','Alert data','Alert Yoram','Email alert','Reply error','Reply duplicate','Duplicate?','Save error'];
  const nodes=names.map((name,i)=>({id:'n'+i,name,type:['Validate','Find query','Build mutation','Check save'].includes(name)?'n8n-nodes-base.code':'n8n-nodes-base.noOp',position:[i*200,0],parameters:{jsCode:'old'}}));
  nodes.find(n=>n.name==='Reply saved').type='n8n-nodes-base.respondToWebhook';
  const L=(...n)=>({main:n.map(x=>x?[{node:x,type:'main',index:0}]:[])});
  return {id:'8W7MymUCLpPnilJs',name:'Intake',settings:{executionOrder:'v1'},staticData:{idem:{secret:1}},nodes,connections:{
    'Webhook':L('Validate'),'Validate':L('Valid?'),'Valid?':L('Find query','Reply error'),'Find query':L('Find by phone'),'Find by phone':L('Build mutation'),
    'Build mutation':L('Save to Monday'),'Save to Monday':L('Check save'),'Check save':L('Saved?'),'Saved?':L('Alert query','Save error'),'Alert query':L('Alert data'),
    'Alert data':L('Alert Yoram'),'Alert Yoram':L('Reply saved')}};};
const opts={lockUrl:'http://lock-server:8787',lockCredentialId:'LockCred0001',instantWorkflowId:'InstantWf0001'};
const next=(w,n)=>(w.connections[n]?.main||[]).map(br=>br.map(x=>x.node));

test('intake wiring: the lock runs before the Monday lookup and a lost lock never reaches a write',()=>{
  const w=patchIntake(exportFixture(),opts);
  assert.deepEqual(next(w,'Valid?'),[['Lock'],['Reply error']]);
  assert.deepEqual(next(w,'Lock'),[['Locked?']]);assert.deepEqual(next(w,'Locked?'),[['Restore intake'],['Reply locked']]);
  assert.deepEqual(next(w,'Restore intake'),[['Find query']]);assert.deepEqual(next(w,'Reply locked'),[]);
  const lock=w.nodes.find(n=>n.name==='Lock');
  assert.equal(lock.parameters.url,'http://lock-server:8787/lock');assert.equal(lock.parameters.method,'POST');
  assert.deepEqual(lock.credentials,{httpHeaderAuth:{id:'LockCred0001',name:'Lock server'}},'token stays in the n8n credential');
  assert.equal(lock.onError,undefined,'a failed lock call stops the request instead of saving without the lock');
  const locked=w.nodes.find(n=>n.name==='Locked?').parameters.conditions.conditions[0].leftValue;
  assert.equal(new Function('$json','return ('+locked.slice(3,-2)+')')({locked:true}),true);
  for(const v of [{locked:false},{},{locked:'true'}])assert.equal(new Function('$json','return ('+locked.slice(3,-2)+')')(v),false,JSON.stringify(v));
  const body=new Function('$','return ('+lock.parameters.jsonBody.slice(3,-2)+')')(()=>({first:()=>({json:{phone:'972500000040'}})}));
  assert.deepEqual(JSON.parse(body),{phone:'972500000040',source:'lead-intake'});
  const reply=w.nodes.find(n=>n.name==='Reply locked');
  assert.deepEqual(JSON.parse(new Function('$','return ('+reply.parameters.responseBody.slice(3,-2)+')')(()=>({first:()=>({json:{key:'test-key-0001'}})}))),{ok:true,duplicate:true,pending:true,request_id:'test-key-0001'});
  const v={phone:'972500000040',name:'TEST דנה'};
  assert.deepEqual(new Function('$',w.nodes.find(n=>n.name==='Restore intake').parameters.jsCode)(()=>({first:()=>({json:v})})),[{json:v}]);});

test('intake wiring: the instant reply is called after the response, only for a new saved item, and cannot fail the intake',()=>{
  const w=patchIntake(exportFixture(),opts);
  assert.deepEqual(next(w,'Saved?')[0],['Reply saved']);assert.deepEqual(next(w,'Reply saved'),[['Alert query','Instant reply input']]);
  assert.deepEqual(next(w,'Instant reply input'),[['Instant reply']]);
  const call=w.nodes.find(n=>n.name==='Instant reply');
  assert.equal(call.type,'n8n-nodes-base.executeWorkflow');assert.equal(call.parameters.workflowId,'InstantWf0001');
  assert.equal(call.parameters.options.waitForSubWorkflow,false);assert.equal(call.onError,'continueRegularOutput');
  const code=w.nodes.find(n=>n.name==='Instant reply input').parameters.jsCode;assert.equal(code,intakeSource('instant-reply-input.js','refi'));
  const v={name:'TEST דנה כהן',phone:'972500000040',marketing_consent:false,contact_permissions:{receivedAt:'2026-10-24T09:00:00Z',grants:{whatsapp:true,email:false,sms:false}}};
  const run=(mode,saved=true)=>new Function('$',code)(n=>({first:()=>({json:n==='Validate'?v:n==='Build mutation'?{mode}:{saved,request_id:'900001'}})}));
  const [out]=run('create');
  assert.deepEqual(out.json,{itemId:'900001',name:'TEST דנה כהן',firstName:'דנה',phone:'972500000040',receivedAt:'2026-10-24T09:00:00Z',grants:{whatsapp:true,email:false,sms:false},marketing:false});
  assert.deepEqual(run('update'),[],'a repeat inquiry stays with the engine');assert.deepEqual(run('create',false),[]);
  // The produced input is accepted by the instant reply decision inside the window.
  assert.equal(hsm.instantPayload({lead:out.json,cfg:on,biz,now:at(20),mode:'test'}).ok,true);});

test('intake wiring: refuses a missing setting or an unexpected export, keeps state out, and every connection resolves',()=>{
  for(const k of Object.keys(opts))assert.throws(()=>patchIntake(exportFixture(),{...opts,[k]:''}),new RegExp(k==='lockUrl'?'LOCK_SERVER_URL':k==='lockCredentialId'?'LOCK_CREDENTIAL_ID':'INSTANT_REPLY_WORKFLOW_ID'));
  assert.throws(()=>patchIntake(exportFixture(),{...opts,lockUrl:'http://x:8787/lock?token=abc'}),/LOCK_SERVER_URL/);
  assert.throws(()=>patchIntake({...exportFixture(),id:'other'},opts),/Unexpected intake workflow/);
  const w=patchIntake(exportFixture(),opts);
  assert.equal(w.nodes.length,24);assert.equal(w.staticData,undefined);assert.deepEqual(w.pinData,{});
  const names=new Set(w.nodes.map(n=>n.name));assert.equal(names.size,w.nodes.length);
  for(const [a,c] of Object.entries(w.connections)){assert.ok(names.has(a),a);for(const br of c.main)for(const x of br)assert.ok(names.has(x.node),x.node);}
  for(const n of w.nodes)for(const b of [n.parameters.jsonBody,n.parameters.responseBody])if(typeof b==='string'&&b.startsWith('={{'))assert.ok(!/\}\}/.test(b.slice(3,-2)),n.name);
  assert.deepEqual(patchIntake(exportFixture(),opts),w,'deterministic output');});

test('the built instant reply workflow carries the HSM module and posts to the Gambot template endpoint',()=>{
  const {execFileSync}=require('child_process');execFileSync('node',[ROOT+'/src/services/funnel/build-workflows.js','test']);
  const w=JSON.parse(fs.readFileSync(ROOT+'/src/services/funnel/dist/instant-reply-test.json','utf8'));
  const node=w.nodes.find(n=>n.name==='Instant reply').parameters.jsCode;assert.match(node,/instantPayload/);assert.doesNotMatch(node,/__GAMBOT_HSM__/);
  const send=w.nodes.find(n=>n.name==='Send WhatsApp');assert.equal(send.parameters.url,hsm.SEND_URL);assert.equal(send.disabled,true);
  const store={};const D=class extends Date{static now(){return at(10);}};
  const r=new Function('$json','$getWorkflowStaticData','Date',node.replace(/"enabled":false,"withinSeconds":60,"graceMinutes":2,"template":\{"id":null/,'"enabled":true,"withinSeconds":60,"graceMinutes":2,"template":{"id":"1234567890"'))(lead,()=>store,D).json;
  assert.deepEqual(r,{itemId:'77',hasSend:true,live:false,send:{to:'972500000040',from:'972559881245',templateId:'1234567890',variables:['דנה']}});});
