const test=require('node:test'),assert=require('node:assert/strict');
const H=require('../../src/services/funnel/error-handler');
const C=require('../../src/config/campaigns/refi.json'),G=require('../../config/error-handler.json');
const now=Date.parse('2026-10-27T12:00:00Z');
const event=(extra={})=>({workflow:{id:G.bindings.leadIntake,name:'TEST Lead Intake'},execution:{id:'12345',url:G.n8nBaseUrl+'/workflow/'+G.bindings.leadIntake+'/executions/12345',lastNodeExecuted:G.controlledStopNode,error:{message:'Controlled test',context:{metadata:{schema:'central-error-v1',workflowId:G.bindings.leadIntake,boardId:C.board,verifiedItem:true,itemId:'321',code:'api_rate_limit'}}}},...extra});
const prepare=(e=event(),state={})=>H.prepare(e,{campaign:C,global:G,state,selfId:'central',now});
test('standard error fields, trusted target and exact email subject are preserved',()=>{
 const a=prepare();assert.equal(a.itemId,'321');assert.equal(a.subject,G.subjectPrefix+'TEST Lead Intake');assert.ok(a.body.includes('Controlled test'));assert.ok(a.body.includes('12345'));assert.equal(a.execution.url,event().execution.url);assert.equal(a.updateRequest.variables.i,'321');assert.equal(JSON.parse(a.updateRequest.variables.v)[C.columns.status].label,C.errorHandling.statusLabel);
});
test('trigger failures and untrusted item ids create an alert rather than touching a lead',()=>{
 const a=prepare({workflow:event().workflow,trigger:{error:{message:'Trigger failed',timestamp:now}},itemId:'321',pulseId:'321'});
 assert.equal(a.itemId,null);assert.equal(a.lastNode,'Trigger');assert.ok(a.createRequest.query.includes('create_item'));assert.equal(JSON.parse(a.createRequest.variables.vals)[C.columns.phone],undefined);
 const e=event();e.execution.lastNodeExecuted='HTTP Request';assert.equal(prepare(e).itemId,null);
 e.execution.lastNodeExecuted=G.controlledStopNode;e.execution.error.context.metadata.boardId='999';assert.equal(prepare(e).itemId,null);
 e.execution.error.context.metadata.boardId=C.board;e.execution.error.context.metadata.verifiedItem=false;assert.equal(prepare(e).itemId,null);
});
test('manual sample, unknown workflow and self-error cannot send alerts recursively',()=>{
 assert.equal(prepare({workflow:{id:'1',name:'Example Workflow'},execution:{id:'231',error:{message:'Example Error Message'}}}),null);
 assert.equal(H.prepare(event(),{campaign:C,global:G,state:{},selfId:G.bindings.leadIntake,now}),null);
});
test('safe target requires exact item, correct board, active state and no protected status',()=>{
 const a=prepare(),r={data:{items:[{id:'321',state:'active',board:{id:C.board},column_values:[{id:C.columns.status,text:'פעיל'},{id:C.columns.stage,text:'ליד חדש'}]}]}};
 assert.equal(H.canUpdate(r,a,C),true);
 for(const bad of [{data:{items:[]}},{errors:[{message:'partial'}],...r},{data:{items:[{...r.data.items[0],board:{id:'999'}}]}},{data:{items:[{...r.data.items[0],column_values:[{id:C.columns.status,text:'הסר'}]}]}}])assert.equal(H.canUpdate(bad,a,C),false);
});
test('error messages redact secrets and reject an external execution link',()=>{
 const token='EA'+'A'+'x'.repeat(45),e=event();e.execution.error.message='Authorization: Bearer '+token;e.execution.url='https://external.invalid/?access_token='+token;
 const a=prepare(e);assert.ok(!a.body.includes(token));assert.ok(!a.body.includes('external.invalid'));
});
test('only confirmed mail and Monday writes mark an execution handled',()=>{
 const state={},a=prepare(event(),state);assert.throws(()=>H.finish({errors:[{message:'bad'}]}, {id:'mail1'},a,state,now));assert.equal(prepare(event(),state)!==null,true);
 H.finish({data:{change_multiple_column_values:{id:'321'}}},{id:'mail1'},a,state,now);
 assert.equal(prepare(event(),state),null);
});
test('duplicates, security errors and API rate limits have controlled codes',()=>{
 assert.equal(H.classify({duplicate:true}).code,'duplicate_lead');assert.equal(H.classify({ok:false,error:'idempotency_conflict',status:409}).code,'security_violation');
 assert.equal(H.classify({statusCode:429}).code,'api_rate_limit');assert.equal(H.classify({error:{code:130429,message:'rate'}}).code,'api_rate_limit');
 assert.equal(H.classify({ok:false,error:'bad_phone',status:400}),null);assert.equal(H.classify({data:{create_item:{id:'123'}}}),null);
});

test('missing, paid, foreign and incomplete Monday targets fail closed',()=>{
 const a=prepare();
 for(const item of [{id:'321',board:{id:C.board},state:'active',column_values:[]},{id:'999',board:{id:C.board},state:'active',column_values:[]},{id:'321',board:{id:C.board},state:'active',column_values:[{id:C.columns.status,text:'פעיל'},{id:C.columns.stage,text:C.stages.paid}]}])assert.equal(H.canUpdate({data:{items:[item]}},a,C),false);
 const trigger=prepare({workflow:event().workflow,trigger:{error:{message:'No item'}}});
 assert.throws(()=>H.finish({data:{}},{id:'mail'},trigger,{},now));
 assert.throws(()=>H.finish({data:{create_item:{id:'444'}}},{error:'rejected'},trigger,{},now));
});

test('HTTP exceptions, nested duplicate replies and GraphQL complexity limits are classified',()=>{
 assert.equal(H.classify({error:{message:'429 - rate limit'}}).code,'api_rate_limit');
 assert.equal(H.classify({status:200,body:{duplicate:true}}).code,'duplicate_lead');
 assert.equal(H.classify({status:400,body:{error:'key'}}).code,'security_violation');
 assert.equal(H.classify({errors:[{message:'Complexity budget exhausted'}]}).code,'api_rate_limit');
 assert.equal(H.classify({error:'Connection timed out'},{provider:true}).code,'provider_error');
});

test('workflow graph binds error handling and preserves disabled send and request contract',()=>{
 const {build}=require('../../src/services/funnel/build-error-workflow'),{patch}=require('../../src/services/funnel/error-workflow-patch');
 const w={id:G.bindings.leadIntake,name:'TEST Core',settings:{timezone:'Asia/Jerusalem'},nodes:[{id:'a',name:'Validate',type:'n8n-nodes-base.code',position:[0,0],parameters:{jsCode:'return [];'}},{id:'b',name:'Save',type:'n8n-nodes-base.httpRequest',position:[200,0],credentials:{mondayComApi:{id:'original'}},parameters:{url:'https://api.monday.com/v2',jsonBody:'={{ $json.query }}'}},{id:'c',name:'Send WhatsApp',disabled:true,type:'n8n-nodes-base.httpRequest',position:[400,0],parameters:{url:'https://example.invalid'}}],connections:{Validate:{main:[[{node:'Save',type:'main',index:0}]]}}};
 const p=patch(structuredClone(w),{role:'leadIntake'});
 assert.equal(p.settings.errorWorkflow,G.workflowId);assert.equal(p.settings.timezone,w.settings.timezone);
 assert.equal(p.nodes.find(n=>n.name==='Save').parameters.jsonBody,w.nodes[1].parameters.jsonBody);
 assert.deepEqual(p.nodes.find(n=>n.name==='Save').credentials,w.nodes[1].credentials);
 assert.equal(p.nodes.find(n=>n.name==='Send WhatsApp').disabled,true);
 assert.ok(p.nodes.some(n=>n.type==='n8n-nodes-base.stopAndError'));
 assert.equal(p.connections['Guard validation?'].main[0][0].node,'Guard validation response');
 assert.equal(p.connections['Guard validation response'].main[0][0].node,G.controlledStopNode);
 assert.equal(p.nodes.find(n=>n.name==='Error context: Save').parameters.mode,'runOnceForEachItem');
 const central=build();assert.equal(central.settings.errorWorkflow,undefined);
 assert.equal(central.nodes.find(n=>n.name==='Send Email').parameters.sendTo,G.recipientEmail);
 for(const n of [...central.nodes,...p.nodes])if(n.type==='n8n-nodes-base.code')assert.doesNotThrow(()=>new Function(n.parameters.jsCode));
});

test('legacy provider expression braces cannot truncate the n8n expression',()=>{
 const {patch}=require('../../src/services/funnel/error-workflow-patch');
 const expression='={{ JSON.stringify({query:"query { me { id }}",variables:{}}) }}';
 const w={name:'TEST',nodes:[{name:'Validate',type:'n8n-nodes-base.code',position:[0,0],parameters:{jsCode:'return [];'}},{name:'Lookup',type:'n8n-nodes-base.httpRequest',position:[200,0],parameters:{jsonBody:expression}}],connections:{Validate:{main:[[{node:'Lookup',type:'main',index:0}]]}}};
 const p=patch(w,{role:'leadIntake'}),actual=p.nodes.find(n=>n.name==='Lookup').parameters.jsonBody;
 assert.doesNotMatch(actual.slice(3,-2),/\}\}/);
 const request=JSON.parse(new Function('return ('+actual.slice(3,-2)+')')());
 assert.equal(request.query.replace(/\s/g,''),'query{me{id}}');assert.deepEqual(request.variables,{});
});
