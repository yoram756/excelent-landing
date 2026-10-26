// Meta Cloud API HSM payload and inbound webhook normalization, the consolidation campaign file, and the intake wiring (lock before Find query, instant reply after the response).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'../..');
const hsm=require(ROOT+'/src/services/funnel/meta-hsm');
const {patchIntake}=require(ROOT+'/src/webhooks/intake/patch-export');
const {intakeSource}=require(ROOT+'/src/webhooks/intake/source');
const {campaignIndex}=require(ROOT+'/src/webhooks/intake/meta-adapter');
const refi=require(ROOT+'/src/config/campaigns/refi.json'),cons=require(ROOT+'/src/config/campaigns/consolidation.json');
const on={...refi,instantReply:{...refi.instantReply,enabled:true,template:{...refi.instantReply.template,id:'1234567890',name:'exc_refi_instant_test'}}};
const lead={itemId:'77',name:'TEST דנה',firstName:'דנה',phone:'972500000040',receivedAt:'2026-10-24T09:00:00Z',grants:{whatsapp:true},marketing:false};
const at=s=>Date.parse('2026-10-24T09:00:00Z')+s*1000;
const body=(name,texts)=>({messaging_product:'whatsapp',recipient_type:'individual',to:'972500000040',type:'template',template:{name,language:{code:'he'},components:[{type:'body',parameters:texts.map(text=>({type:'text',text}))}]}});

test('template payload: Meta Cloud API endpoint, recipient, template name, language and components',()=>{
  assert.equal(hsm.sendUrl('123456789012345'),'https://graph.facebook.com/'+hsm.GRAPH_VERSION+'/123456789012345/messages');
  for(const id of ['',null,'PENDING','12345'])assert.equal(hsm.sendUrl(id),'https://graph.facebook.com/'+hsm.GRAPH_VERSION+'/{phone_number_id}/messages',String(id));
  assert.deepEqual(hsm.templatePayload({to:'972500000040',name:'exc_refi_m02_quiz_v2',variables:['דנה',5]}),body('exc_refi_m02_quiz_v2',['דנה','5']));
  assert.deepEqual(hsm.templatePayload({to:'972500000040',name:'exc_refi_m01_ack'}).template,{name:'exc_refi_m01_ack',language:{code:'he'}},'no variables, no components');
  assert.deepEqual(hsm.templatePayload({to:'972500000040',name:'exc_x',variables:['דנה'],buttonVariables:['abcq']}).template.components[1],{type:'button',sub_type:'url',index:'0',parameters:[{type:'text',text:'abcq'}]});
  assert.equal('from' in hsm.templatePayload({to:'972500000040',name:'exc_x'}),false,'the sender is the phone number id in the URL');
  assert.throws(()=>hsm.templatePayload({to:'0500000040',name:'exc_x'}),/bad_recipient/);
  for(const name of [null,'','1234567890','Exc Refi','exc-refi'])assert.throws(()=>hsm.templatePayload({to:'972500000040',name}),/bad_template_name/,String(name));
  assert.throws(()=>hsm.templatePayload({to:'972500000040',name:'exc_x',language:'hebrew'}),/bad_language/);});

test('instant payload goes out only inside 60 seconds, by approved template name, with consent',()=>{
  const run=(o={})=>hsm.instantPayload({lead,cfg:on,now:at(30),mode:'test',...o});
  assert.deepEqual(run(),{ok:true,payload:body('exc_refi_instant_test',['דנה'])});
  assert.equal(run({cfg:{...on,instantReply:{...on.instantReply,template:{...on.instantReply.template,id:'PENDING'}}}}).reason,'awaiting_approved_template','the numeric id stays the approval mark');
  assert.equal(run({cfg:{...on,instantReply:{...on.instantReply,template:{...on.instantReply.template,name:undefined}}}}).reason,'template_name_missing');
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
  assert.equal(call.type,'n8n-nodes-base.executeWorkflow');assert.deepEqual(call.parameters.workflowId,{__rl:true,value:'InstantWf0001',mode:'id'});
  assert.equal(call.parameters.options.waitForSubWorkflow,false);assert.equal(call.onError,'continueRegularOutput');
  const code=w.nodes.find(n=>n.name==='Instant reply input').parameters.jsCode;assert.equal(code,intakeSource('instant-reply-input.js','refi'));
  const v={name:'TEST דנה כהן',phone:'972500000040',marketing_consent:false,contact_permissions:{receivedAt:'2026-10-24T09:00:00Z',grants:{whatsapp:true,email:false,sms:false}}};
  const run=(mode,saved=true)=>new Function('$',code)(n=>({first:()=>({json:n==='Validate'?v:n==='Build mutation'?{mode}:{saved,request_id:'900001'}})}));
  const [out]=run('create');
  assert.deepEqual(out.json,{itemId:'900001',name:'TEST דנה כהן',firstName:'דנה',phone:'972500000040',receivedAt:'2026-10-24T09:00:00Z',grants:{whatsapp:true,email:false,sms:false},marketing:false});
  assert.deepEqual(run('update'),[],'a repeat inquiry stays with the engine');assert.deepEqual(run('create',false),[]);
  // The produced input is accepted by the instant reply decision inside the window.
  assert.equal(hsm.instantPayload({lead:out.json,cfg:on,now:at(20),mode:'test'}).ok,true);});

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

test('the built instant reply workflow carries the HSM module and posts to the Meta Cloud API endpoint',()=>{
  const {execFileSync}=require('child_process');execFileSync('node',[ROOT+'/src/services/funnel/build-workflows.js','test']);
  const w=JSON.parse(fs.readFileSync(ROOT+'/src/services/funnel/dist/instant-reply-test.json','utf8'));
  const node=w.nodes.find(n=>n.name==='Instant reply').parameters.jsCode;assert.match(node,/instantPayload/);assert.doesNotMatch(node,/__META_HSM__/);
  const send=w.nodes.find(n=>n.name==='Send WhatsApp');assert.equal(send.parameters.url,hsm.sendUrl(''));assert.equal(send.disabled,true);
  assert.equal(send.credentials,undefined,'a test build carries no Meta credential');
  // Only a Meta message id counts as sent; a refusal or an n8n error leaves fn_last alone.
  const sent=w.nodes.find(n=>n.name==='Sent?').parameters.conditions.conditions[0].leftValue.slice(3,-2);
  const ok=j=>new Function('$json','return ('+sent+')')(j);
  assert.equal(ok({messages:[{id:'wamid.X'}]}),true);for(const j of [{},{messages:[]},{error:{code:131047}},{success:true}])assert.equal(ok(j),false,JSON.stringify(j));
  const store={};const D=class extends Date{static now(){return at(10);}};
  const r=new Function('$json','$getWorkflowStaticData','Date',node.replace(/"enabled":false,"withinSeconds":60,"graceMinutes":2,"template":\{"id":null/,'"enabled":true,"withinSeconds":60,"graceMinutes":2,"template":{"id":"1234567890","name":"exc_refi_instant_test"'))(lead,()=>store,D).json;
  assert.deepEqual(r,{itemId:'77',hasSend:true,live:false,send:body('exc_refi_instant_test',['דנה'])});});

// Standard Meta webhook delivery (object, entry[].changes[].value with metadata, contacts, messages, statuses).
const hook=(value,field='messages')=>({object:'whatsapp_business_account',entry:[{id:'WABA_ID',changes:[{field,value:{messaging_product:'whatsapp',metadata:{display_phone_number:'972559881245',phone_number_id:'123456789012345'},...value}}]}]});
test('inbound Meta webhook: incoming messages become conversation rows, statuses and other numbers are ignored',()=>{
  const p=hook({contacts:[{profile:{name:'דנה'},wa_id:'972500000040'}],messages:[
    {from:'972500000040',id:'wamid.A',timestamp:'1729760400',type:'text',text:{body:'כן מעוניין'}},
    {from:'972500000040',id:'wamid.B',timestamp:'1729760460',type:'button',button:{payload:'p',text:'הסר'}},
    {from:'972500000041',id:'wamid.C',timestamp:'1729760430',type:'interactive',interactive:{type:'button_reply',button_reply:{id:'1',title:'לשיחה'}}}],
    statuses:[{id:'wamid.S',status:'read',timestamp:'1729760500',recipient_id:'972500000042'}]});
  assert.deepEqual(hsm.conversationsFromWebhook(p,'123456789012345'),[
    {phone:'972500000040',lastMessageDirection:'incoming',lastMessageTime:'2024-10-24T09:01:00.000Z',lastMessage:'הסר'},
    {phone:'972500000041',lastMessageDirection:'incoming',lastMessageTime:'2024-10-24T09:00:30.000Z',lastMessage:'לשיחה'}]);
  assert.deepEqual(hsm.conversationsFromWebhook(p,'999999999999999'),[],'another phone number id');
  assert.deepEqual(hsm.conversationsFromWebhook(hook({statuses:[{id:'wamid.S',status:'delivered',timestamp:'1729760500',recipient_id:'972500000040'}]})),[],'statuses are our own sends');
  assert.deepEqual(hsm.conversationsFromWebhook(hook({messages:[{from:'972500000040',timestamp:'1',type:'text',text:{body:'x'}}]},'account_update')),[]);
  for(const bad of [null,{},{object:'page',entry:[]},{object:'whatsapp_business_account'}])assert.deepEqual(hsm.conversationsFromWebhook(bad),[]);});

test('inbound Meta webhook rows drive the planner exactly like a reply: stop the series, or opt out on הסר',()=>{
  const {planner,item}=require('./load');const plan=planner('test');const NOW='2026-10-20T09:00:00Z';
  const ts=s=>String(Date.parse(s)/1000);
  const cols=active=>({refi_phone:'0500000040',boolean_mm88mzry:{checked:'true'},fn_status:'פעיל',fn_token:'abcdefghjk',fn_path:'C',fn_step:'M3',fn_last:{date:'2026-10-20',time:'06:00:00'}});
  const run=text=>plan({items:[item({cols:cols()})],convos:hsm.conversationsFromWebhook(hook({messages:[{from:'972500000040',id:'wamid.A',timestamp:ts('2026-10-20T08:30:00Z'),type:'text',text:{body:text}}]})),now:NOW})[0];
  const r=run('כן מעוניין');assert.equal(JSON.parse(r.colsJson).fn_status.label,'ענה');assert.equal(r.send,null);assert.ok(r.notifyText.includes('כן מעוניין'));
  assert.equal(JSON.parse(run('הסר').colsJson).fn_status.label,'הסר');});

test('intake wiring accepts the original export with response already before notifications',()=>{
  const w=exportFixture();
  const L=n=>({main:[[{node:n,type:'main',index:0}]]});
  w.connections['Saved?'].main[0]=L('Reply saved').main[0];
  w.connections['Reply saved']=L('Alert query');
  w.connections['Alert Yoram']=L('Email alert');
  const out=patchIntake(w,opts);
  assert.deepEqual(next(out,'Saved?')[0],['Reply saved']);
  assert.deepEqual(next(out,'Reply saved'),[['Alert query','Instant reply input']]);
  assert.deepEqual(next(out,'Alert Yoram'),[['Email alert']]);
  assert.equal(out.nodes.length,24);
});
test('intake wiring rejects unknown or parallel success routes',()=>{
  for(const variant of ['unknown','parallel']){
    const w=exportFixture();
    if(variant==='unknown')w.connections['Saved?'].main[0][0].node='Save to Monday';
    else w.connections['Saved?'].main[0].push({node:'Reply saved',type:'main',index:0});
    assert.throws(()=>patchIntake(w,opts),/Unexpected success routing/);
  }
  const w=exportFixture();
  w.connections['Saved?'].main[0]=[{node:'Reply saved',type:'main',index:0}];
  w.connections['Reply saved']={main:[[{node:'Alert query',type:'main',index:0}]]};
  w.connections['Alert Yoram']={main:[[{node:'Email alert',type:'main',index:0},{node:'Save to Monday',type:'main',index:0}]]};
  assert.throws(()=>patchIntake(w,opts),/Unexpected success routing/);
});

test('intake subworkflow reference matches the installed n8n 1.1 value-object contract',()=>{
 const w=patchIntake(exportFixture(),opts);const call=w.nodes.find(n=>n.name==='Instant reply');
 const {value}=call.parameters.workflowId;
 assert.equal(value,opts.instantWorkflowId,'n8n 1.1 reads workflowId.value');
 assert.equal(call.parameters.workflowId.mode,'id');
});
