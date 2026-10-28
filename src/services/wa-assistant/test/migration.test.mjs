import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {Broker,ORG,CONNECTION} from '../src/broker.mjs';
import {cosendControl} from '../src/cosend-control.mjs';
import {classifyWithApprovedModel} from '../src/model-adapter.mjs';
import {createModelWorker} from '../src/model-worker.mjs';
import binding from '../config/provider.json' with {type:'json'};
const phone='+972500000040',now=Date.parse('2026-10-28T10:00:00Z'),secret='synthetic-migration-signing-secret';
test('model transport also enforces approvals before any HTTP request',async()=>{
 let calls=0;for(const approvals of [{},{credentialApproved:true},{budgetApproved:true}])await assert.rejects(classifyWithApprovedModel('opening hours',{...approvals,apiKey:'synthetic',model:'synthetic',fetchImpl:async()=>{calls++;}}),/model_approval_required/);assert.equal(calls,0);
});
test('model worker wires structured classification into the durable broker using an injected transport only',async()=>{
 const b=new Broker(':memory:',{now:()=>now});try{
  ingest(b);let calls=0;
  const worker=createModelWorker(b,{credentialApproved:true,budgetApproved:true,apiKey:'synthetic-placeholder',model:'synthetic-model',fetchImpl:async(url,options)=>{
   calls++;assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.tools,undefined);return new Response(JSON.stringify({output:[{content:[{type:'output_text',text:'{"key":"hours"}'}]}]}),{status:200});
  }});
  assert.equal((await worker.runOne()).route,'reply');assert.equal(calls,1);assert.equal(b.db.prepare('SELECT state FROM outbox').get().state,'READY');
 }finally{b.close();}
});
let seq=0;
function ingest(b,text='opening hours',change={}){
 const n=++seq,e={id:'evt_migrate_'+n,object:'event',api_version:'v1',type:'message.received',organization_id:ORG,connection_id:CONNECTION,data:{object:{id:'msg_'+n,conversation_id:'cv_test',connection_id:CONNECTION,direction:'inbound',source:'customer',type:'text',content:{text:{body:text}},wa_timestamp:new Date(now+n).toISOString(),...change}}};
 const raw=Buffer.from(JSON.stringify(e)),t=now/1000;return b.ingest(raw,`t=${t},v1=${createHmac('sha256',secret).update(`${t}.`).update(raw).digest('hex')}`,[secret]);
}
function fixture({scopes=['connections:read','messages:read','contacts:read','messages:write'],writesApproved=false,control='bot',last='msg_current',optout=false,wrongNumber=false,humanAfterLock=false,wrongAssigneeReadback=false,failAssignment=false}={}){
 const calls=[],state={control,last},me={organization:{id:ORG},credential:{kind:'connection',is_live:true,connection_id:CONNECTION,connection_ids:[CONNECTION],scopes}};
 const number={id:CONNECTION,phone_number_id:wrongNumber?'1350440204809114':binding.phoneNumberId,meta_waba_id:binding.wabaId,status:'active',mode:'coexistence',delivery_mode:'stored',phone_e164:phone};
 const conversation=()=>({id:'cv_test',connection_id:CONNECTION,control:state.control,state:state.state||'open',assignee_id:wrongAssigneeReadback?'user_wrong':state.assignee,window:{can_send_freeform:true},lock:{can_i_send:true},contact:{id:'ct_test',is_blocked:false},last_message:{id:state.last,direction:'inbound'}});
 const fetchImpl=async(url,opts)=>{
  calls.push({url,method:opts.method,body:opts.body&&JSON.parse(opts.body),redirect:opts.redirect});
  if(url.endsWith('/control'))state.control=JSON.parse(opts.body).control;
  if(url.endsWith('/lock')&&humanAfterLock)state.control='human';
  if(opts.method==='PATCH'&&failAssignment)return {ok:false,status:503};
  if(opts.method==='PATCH'){state.assignee=JSON.parse(opts.body).assignee_id;state.state=JSON.parse(opts.body).state;}
  const body=url.endsWith('/me')?me:url.includes('/connections/')?number:url.endsWith('/consent')?{categories:{},meta_marketing_opt_out:optout}:conversation();
  return {ok:true,status:200,json:async()=>body};
 };
 return {api:cosendControl('synthetic-placeholder',{fetchImpl,writesApproved,expectedPhone:phone}),calls,state,me};
}
test('Cosend identity verifies exact scope and rejects the deprecated phone number id',async()=>{
 const f=fixture();assert.equal((await f.api.verify()).verified,true);assert.ok(f.calls.every(c=>c.redirect==='error'));
 await assert.rejects(fixture({wrongNumber:true}).api.verify(),/number_binding/);
 const broad=fixture({scopes:['connections:read','keys:write']});await assert.rejects(broad.api.verify(),/excessive/);
});
test('read-only credential cannot acquire locks or hand off',async()=>{
 const f=fixture({scopes:['connections:read']});await f.api.verify();await assert.rejects(f.api.preflight({conversationId:'cv_test',latestResourceId:'msg_current'}),/messages:read/);await assert.rejects(f.api.handoff('cv_test',{assigneeId:'user_test',assigneeVerified:true}),/messages:read/);assert.ok(f.calls.every(c=>c.method==='GET'));
});
test('write scope alone never authorizes provider mutations',async()=>{
 const f=fixture();await f.api.verify();await assert.rejects(f.api.preflight({conversationId:'cv_test',latestResourceId:'msg_current'}),/write_not_approved/);assert.ok(f.calls.every(c=>c.method==='GET'));
});
for(const opts of [{control:'human'},{control:'pending_human'},{control:'app'},{last:'msg_newer'},{optout:true}])test('provider control/consent blocks a synthetic lock '+JSON.stringify(opts),async()=>{
 const f=fixture({...opts,writesApproved:true});await f.api.verify();assert.equal(await f.api.preflight({conversationId:'cv_test',latestResourceId:'msg_current'}),false);assert.ok(f.calls.every(c=>c.method==='GET'));
});
test('permitted synthetic bot lock is checked again and handoff requires assignment readback',async()=>{
 const f=fixture({writesApproved:true});await f.api.verify();assert.equal(await f.api.preflight({conversationId:'cv_test',latestResourceId:'msg_current'}),true);
 assert.equal(f.calls.filter(c=>c.url.endsWith('/lock')).length,1);
 await assert.rejects(f.api.handoff('cv_test',{assigneeId:'user_test'}),/verified_workspace/);
 assert.deepEqual(await f.api.handoff('cv_test',{assigneeId:'user_test',assigneeVerified:true}),{confirmed:true,conversationId:'cv_test',assigneeId:'user_test',representativeRead:false});
 assert.ok(f.calls.every(c=>c.url.startsWith('https://api.cosend.app/v1/')));assert.equal(f.state.control,'pending_human');
});
test('human takeover between lock acquisition and readback prevents dispatch authorization',async()=>{
 const f=fixture({writesApproved:true,humanAfterLock:true});await f.api.verify();assert.equal(await f.api.preflight({conversationId:'cv_test',latestResourceId:'msg_current'}),false);assert.equal(f.state.control,'human');assert.equal(f.calls.some(c=>c.url.endsWith('/messages')),false);
});
test('handoff never claims assignment if the provider reads back another representative',async()=>{
 const f=fixture({writesApproved:true,wrongAssigneeReadback:true});await f.api.verify();await assert.rejects(f.api.handoff('cv_test',{assigneeId:'user_test',assigneeVerified:true}),/handoff_readback_unconfirmed/);assert.equal(f.state.control,'pending_human');
});
test('failed assignment leaves pending human control and is never retried automatically',async()=>{
 const f=fixture({writesApproved:true,failAssignment:true});await f.api.verify();await assert.rejects(f.api.handoff('cv_test',{assigneeId:'user_test',assigneeVerified:true}),/http_503/);assert.equal(f.state.control,'pending_human');assert.equal(f.calls.filter(c=>c.method==='PATCH').length,1);
});
test('model approval and budget gates cause zero calls and zero queue mutations',async()=>{
 const b=new Broker(':memory:',{now:()=>now});try{ingest(b);let calls=0;for(const opts of [{},{credentialApproved:true},{budgetApproved:true}])assert.equal((await b.prepareOneWithModel(async()=>{calls++;return 'hours';},opts)).reason,'model_approval_required');assert.equal(calls,0);assert.equal(b.db.prepare('SELECT state FROM messages').get().state,'NEW');}finally{b.close();}
});
test('approved synthetic model only chooses an approved reply; failures and disagreement hand off',async()=>{
 for(const [model,expected] of [[async()=> 'hours','reply'],[async()=> 'booking','handoff'],[async()=>{throw Error('unavailable');},'handoff']]){
  const b=new Broker(':memory:',{now:()=>now});try{ingest(b);const result=await b.prepareOneWithModel(model,{credentialApproved:true,budgetApproved:true});assert.equal(result.route,expected);if(result.route==='handoff'){assert.equal(result.id,null);assert.equal(b.conversation('cv_test').human,1);}else assert.equal(b.db.prepare('SELECT reply FROM outbox').get().reply.includes('Our human team'),true);}finally{b.close();}
 }
});
test('signed provider human control immediately cancels replies and stale bot control never resumes them',()=>{
 const b=new Broker(':memory:',{now:()=>now});try{
  ingest(b);const out=b.prepareOne();
  for(const control of ['human','bot']){
   const e={id:'evt_control_'+control,object:'event',api_version:'v1',type:'conversation.updated',organization_id:ORG,connection_id:CONNECTION,data:{object:{id:'cv_test',connection_id:CONNECTION,control}}};
   const raw=Buffer.from(JSON.stringify(e)),t=now/1000;
   assert.equal(b.ingest(raw,`t=${t},v1=${createHmac('sha256',secret).update(`${t}.`).update(raw).digest('hex')}`,[secret]).code,'stored_control');
   assert.equal(b.conversation('cv_test').human,1);
  }
  assert.equal(b.db.prepare('SELECT state FROM outbox WHERE id=?').get(out.id).state,'CANCELLED');
 }finally{b.close();}
});
test('model never overrides financial advice policy or calls a model for a handoff',async()=>{
 const b=new Broker(':memory:',{now:()=>now});try{ingest(b,'what interest rate can I get?');let calls=0;assert.equal((await b.prepareOneWithModel(async()=>{calls++;return 'hours';},{credentialApproved:true,budgetApproved:true})).route,'handoff');assert.equal(calls,0);}finally{b.close();}
});
for(const text of ['stop','new question'])test('inbound update invalidates an in-flight model result: '+text,async()=>{
 const b=new Broker(':memory:',{now:()=>now});try{ingest(b);let resolve;const pending=b.prepareOneWithModel(()=>new Promise(r=>{resolve=r;}),{credentialApproved:true,budgetApproved:true});ingest(b,text);resolve('hours');assert.equal((await pending).reason,'model_result_invalidated');assert.equal(b.db.prepare('SELECT count(*) n FROM outbox').get().n,0);}finally{b.close();}
});
test('stopped classifier is recoverable without dispatching or resending',()=>{
 const b=new Broker(':memory:',{now:()=>now});try{ingest(b);b.db.prepare("UPDATE messages SET state='CLASSIFYING'").run();assert.equal(b.recoverClassifications(),1);assert.equal(b.db.prepare('SELECT count(*) n FROM outbox').get().n,0);assert.equal(b.prepareOne().route,'reply');}finally{b.close();}
});
