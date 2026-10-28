import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHmac} from 'node:crypto';
import {Broker,ORG,CONNECTION} from '../src/broker.mjs';
import {createIsolatedServer} from '../src/server.mjs';
import {cosendTransport} from '../src/cosend-adapter.mjs';

const now=Date.parse('2026-10-28T10:00:00Z');
const secret='synthetic-signing-only-not-a-provider-secret';
const gates={live:true,exclusiveOwnerVerified:true,providerStateVerified:true,retentionApproved:true};
let sequence=0;
function event(text='מה שעות הפעילות?',{message={},envelope={}}={}){
  const n=++sequence;
  return {id:`evt_regression_${n}`,object:'event',type:'message.received',api_version:'v1',organization_id:ORG,connection_id:CONNECTION,
    data:{object:{id:`msg_regression_${n}`,wamid:`wamid.regression.${n}`,conversation_id:'cv_synthetic',connection_id:CONNECTION,direction:'inbound',source:'customer',type:'text',content:{text:{body:text}},wa_timestamp:new Date(now).toISOString(),...message}},...envelope};
}
function ingest(b,e){const raw=Buffer.from(JSON.stringify(e));const t=now/1000;return b.ingest(raw,`t=${t},v1=${createHmac('sha256',secret).update(`${t}.`).update(raw).digest('hex')}`,[secret]);}
function fixture(){const dir=mkdtempSync(join(tmpdir(),'excelent-wa-regression-'));return {b:new Broker(join(dir,'state.sqlite'),{now:()=>now}),path:join(dir,'state.sqlite'),close(){this.b.close();rmSync(dir,{recursive:true,force:true});}};}
function outbox(b,id){return b.db.prepare('SELECT * FROM outbox WHERE id=?').get(id);}

test('handoff acquires persistent human ownership and suppresses later bot replies',()=>{
  const f=fixture();try{
    ingest(f.b,event('אפשר נציג?'));const handed=f.b.prepareOne();
    assert.equal(handed.route,'handoff');assert.equal(handed.id,null);
    assert.equal(f.b.conversation('cv_synthetic').human,1);
    ingest(f.b,event('מה שעות הפעילות?'));assert.equal(f.b.prepareOne().reason,'human_controls_conversation');
    assert.equal(f.b.db.prepare('SELECT count(*) n FROM outbox').get().n,0);
    assert.equal(f.b.db.prepare("SELECT count(*) n FROM handoffs WHERE state='OPEN'").get().n,1);
  }finally{f.close();}
});

test('live dispatch fails closed without an explicit provider preflight function',async()=>{
  const f=fixture();try{
    ingest(f.b,event());const o=f.b.prepareOne();let calls=0;
    const result=await f.b.dispatch(o.id,{send:async()=>{calls++;return {accepted:true,id:'msg_mock',status:201};}},gates);
    assert.deepEqual(result,{state:'BLOCKED',reason:'provider_preflight_required'});assert.equal(calls,0);assert.equal(outbox(f.b,o.id).state,'READY');
  }finally{f.close();}
});

test('preflight exception blocks a send and leaves a pending item unclaimed',async()=>{
  const f=fixture();try{
    ingest(f.b,event());const o=f.b.prepareOne();let calls=0;
    const result=await f.b.dispatch(o.id,{send:async()=>{calls++;}}, {...gates,beforeSend:async()=>{throw new Error('synthetic provider disconnected');}});
    assert.deepEqual(result,{state:'BLOCKED',reason:'provider_preflight_failed'});assert.equal(calls,0);assert.equal(outbox(f.b,o.id).attempts,0);
  }finally{f.close();}
});

test('simulation does not report success for absent or cancelled items',async()=>{
  const f=fixture();try{
    assert.equal((await f.b.dispatch('missing',null)).state,'NOT_CLAIMED');
    ingest(f.b,event());const o=f.b.prepareOne();ingest(f.b,event('הסר'));
    assert.equal((await f.b.dispatch(o.id,null)).state,'NOT_CLAIMED');assert.equal(outbox(f.b,o.id).state,'CANCELLED');
  }finally{f.close();}
});

test('historical business echoes never seize live conversation control',()=>{
  const f=fixture();try{
    ingest(f.b,event());const o=f.b.prepareOne();
    ingest(f.b,event('archived business text',{envelope:{type:'message.echo'},message:{is_imported:true,direction:'outbound',source:'app'}}));
    assert.equal(f.b.conversation('cv_synthetic').human,0);assert.equal(outbox(f.b,o.id).state,'READY');
  }finally{f.close();}
});

test('health reports storage failure instead of claiming the service is healthy',async()=>{
  const f=fixture();const server=createIsolatedServer({broker:f.b,signing:[secret],workerKey:'SYNTHETIC_WORKER_KEY_NOT_REAL_123456789'});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{
    const url=`http://127.0.0.1:${server.address().port}/health`;
    assert.equal((await fetch(url)).status,200);
    f.b.db.exec('DROP TABLE messages');
    assert.equal((await fetch(url)).status,503);
  }finally{await new Promise(r=>server.close(r));f.close();}
});

test('accepted request remains distinct from signed delivery receipts and late statuses never regress',async()=>{
  const f=fixture();try{
    ingest(f.b,event());const o=f.b.prepareOne();
    await f.b.dispatch(o.id,{send:async()=>({accepted:true,id:'msg_provider_receipt',status:201})},{...gates,beforeSend:async()=>true});
    assert.equal(f.b.delivery(o.id).requestState,'ACCEPTED');assert.equal(f.b.delivery(o.id).deliveryStatus,null);
    function receipt(status,id='msg_provider_receipt',conversation='cv_synthetic'){
      return event('',{envelope:{type:'message.status'},message:{id,conversation_id:conversation,wamid:'wamid.provider.receipt',direction:'outbound',source:'api',status}});
    }
    const delivered=receipt('delivered');ingest(f.b,delivered);
    assert.equal(f.b.delivery(o.id).deliveryStatus,'delivered');assert.equal(f.b.delivery(o.id).receiptEventId,delivered.id);
    ingest(f.b,receipt('sent'));assert.equal(f.b.delivery(o.id).deliveryStatus,'delivered');
    ingest(f.b,receipt('failed'));assert.equal(f.b.delivery(o.id).deliveryStatus,'delivered');
    ingest(f.b,receipt('read'));assert.equal(f.b.delivery(o.id).deliveryStatus,'read');
    ingest(f.b,receipt('delivered'));assert.equal(f.b.delivery(o.id).deliveryStatus,'read');
    assert.equal(outbox(f.b,o.id).state,'ACCEPTED');
  }finally{f.close();}
});

test('failed delivery is separate from accepted request and unknown or unrelated statuses do not fabricate delivery',async()=>{
  const f=fixture();try{
    ingest(f.b,event());const o=f.b.prepareOne();
    await f.b.dispatch(o.id,{send:async()=>({accepted:true,id:'msg_provider_failure',status:201})},{...gates,beforeSend:async()=>true});
    const status=(value,conv='cv_synthetic')=>event('',{envelope:{type:'message.status'},message:{id:'msg_provider_failure',direction:'outbound',source:'api',status:value,conversation_id:conv}});
    ingest(f.b,status('delivered','cv_other'));assert.equal(f.b.delivery(o.id).deliveryStatus,null);
    ingest(f.b,status('unknown'));assert.equal(f.b.delivery(o.id).deliveryStatus,null);
    ingest(f.b,status('failed'));assert.equal(f.b.delivery(o.id).deliveryStatus,'failed');assert.equal(f.b.delivery(o.id).requestState,'ACCEPTED');
    ingest(f.b,status('sent'));assert.equal(f.b.delivery(o.id).deliveryStatus,'failed');
  }finally{f.close();}
});

test('a receipt arriving before the send response is available after reopening the database',async()=>{
  const f=fixture();try{
    ingest(f.b,event());const o=f.b.prepareOne();
    ingest(f.b,event('',{envelope:{type:'message.status'},message:{id:'msg_provider_early',direction:'outbound',source:'api',status:'sent'}}));
    await f.b.dispatch(o.id,{send:async()=>({accepted:true,id:'msg_provider_early',status:201})},{...gates,beforeSend:async()=>true});
    f.b.close();f.b=new Broker(f.path,{now:()=>now});
    assert.equal(f.b.delivery(o.id).deliveryStatus,'sent');
  }finally{f.close();}
});

for(const [status,body]of [[200,{id:'msg_mock'}],[202,{id:'msg_mock'}],[201,{}],[201,{id:''}]])test(`ambiguous HTTP ${status} acceptance never permits a retry or another send in the conversation ${JSON.stringify(body)}`,async()=>{
  const f=fixture();try{
    ingest(f.b,event());const o=f.b.prepareOne();let calls=0;
    const provider=cosendTransport('SYNTHETIC_ONLY_NOT_REAL',{fetchImpl:async()=>{calls++;return new Response(JSON.stringify(body),{status});}});
    const options={...gates,beforeSend:async()=>true};
    assert.equal((await f.b.dispatch(o.id,provider,options)).state,'UNCERTAIN');
    assert.equal((await f.b.dispatch(o.id,provider,options)).state,'NOT_CLAIMED');
    ingest(f.b,event('אפשר המלצות?'));const next=f.b.prepareOne();
    assert.equal((await f.b.dispatch(next.id,provider,options)).state,'NOT_CLAIMED');assert.equal(calls,1);
  }finally{f.close();}
});

test('revoked provider permission fails without retry and does not claim delivery',async()=>{
  const f=fixture();try{
    ingest(f.b,event());const o=f.b.prepareOne();let calls=0;
    const provider=cosendTransport('SYNTHETIC_ONLY_NOT_REAL',{fetchImpl:async()=>{calls++;return new Response('{}',{status:403});}});
    const options={...gates,beforeSend:async()=>true};
    assert.equal((await f.b.dispatch(o.id,provider,options)).state,'FAILED');assert.equal((await f.b.dispatch(o.id,provider,options)).state,'NOT_CLAIMED');
    assert.equal(f.b.delivery(o.id).deliveryStatus,null);assert.equal(calls,1);
  }finally{f.close();}
});
