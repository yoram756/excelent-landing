import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHmac} from 'node:crypto';
import {Broker,ORG,CONNECTION,signatureValid} from '../src/broker.mjs';
import {policyCases} from '../src/policy.mjs';
import {cosendTransport} from '../src/cosend-adapter.mjs';
import {classifyWithApprovedModel} from '../src/model-adapter.mjs';
import {createIsolatedServer} from '../src/server.mjs';
const now=Date.parse('2026-10-28T10:00:00Z'),secret='synthetic-test-signing-secret-not-a-credential';
const gates={live:true,exclusiveOwnerVerified:true,providerStateVerified:true,retentionApproved:true,beforeSend:async()=>true};
let sequence=0;
function event(text='מה שעות הפעילות?',patch={}){
  const n=++sequence;const msg={id:`msg_test_${n}`,wamid:`wamid.test.${n}`,conversation_id:'cv_synthetic',connection_id:CONNECTION,direction:'inbound',source:'customer',type:'text',content:{text:{body:text}},created_at:new Date(now).toISOString(),wa_timestamp:new Date(now).toISOString(),is_imported:false,...patch.message};
  return {id:`evt_test_${n}`,object:'event',type:'message.received',api_version:'v1',organization_id:ORG,connection_id:CONNECTION,created_at:new Date(now).toISOString(),data:{object:msg},...patch.envelope};
}
function signed(e,at=now,key=secret){const raw=Buffer.from(JSON.stringify(e));const t=Math.floor(at/1000);return {raw,header:`t=${t},v1=${createHmac('sha256',key).update(`${t}.`).update(raw).digest('hex')}`};}
function fixture(){const dir=mkdtempSync(join(tmpdir(),'excelent-wa-test-'));let time=now;const b=new Broker(join(dir,'state.sqlite'),{now:()=>time});return {b,dir,path:join(dir,'state.sqlite'),advance:n=>time+=n,close:()=>{b.close();rmSync(dir,{recursive:true,force:true});}};}
function ingest(b,e){const s=signed(e);return b.ingest(s.raw,s.header,[secret]);}
function outbox(b,id){return b.db.prepare('SELECT * FROM outbox WHERE id=?').get(id);}
for(const c of policyCases())test('policy: '+c.name,()=>assert.equal(c.pass,true));
test('signature validates original bytes, rejects changed bytes, stale/future/ambiguous timestamp and missing secret',()=>{
  const s=signed(event());assert(signatureValid(s.raw,s.header,[secret],now));
  assert(!signatureValid(Buffer.concat([s.raw,Buffer.from(' ')]),s.header,[secret],now));
  assert(!signatureValid(s.raw,s.header,[secret],now+301000));assert(!signatureValid(s.raw,s.header,[secret],now-301000));
  assert(!signatureValid(s.raw,s.header+',t=1',[secret],now));assert(!signatureValid(s.raw,s.header,[],now));
});
test('signature rotation accepts one of multiple v1 values',()=>{const s=signed(event());assert(signatureValid(s.raw,s.header+',v1='+'0'.repeat(64),['another-test-secret-123',secret],now));});
test('invalid signature never writes to durable inbox',()=>{const f=fixture();try{const s=signed(event());assert.equal(f.b.ingest(s.raw,'bad',[secret]).status,401);assert.equal(f.b.db.prepare('SELECT count(*) n FROM events').get().n,0);}finally{f.close();}});
test('wrong connection is rejected before storing',()=>{const f=fixture();try{assert.equal(ingest(f.b,event('שלום',{envelope:{connection_id:'other'}})).status,400);}finally{f.close();}});
test('ACK follows durable transaction and survives close/reopen',()=>{const f=fixture();try{assert.equal(ingest(f.b,event()).status,202);f.b.close();const next=new Broker(f.path);assert.equal(next.db.prepare('SELECT count(*) n FROM messages').get().n,1);next.close();f.b=new Broker(f.path);}finally{f.b.close();rmSync(f.dir,{recursive:true,force:true});}});
test('same event and same provider message in distinct envelope are deduplicated',()=>{const f=fixture();try{const e=event();assert.equal(ingest(f.b,e).status,202);assert.equal(ingest(f.b,e).code,'duplicate_event');assert.equal(ingest(f.b,{...e,id:'evt_second_delivery'}).code,'duplicate_message');assert.equal(f.b.db.prepare('SELECT count(*) n FROM messages').get().n,1);}finally{f.close();}});
test('two close messages cancel old pending reply; late older delivery does not replace latest',()=>{const f=fixture();try{ingest(f.b,event());const old=f.b.prepareOne();ingest(f.b,event('אפשר המלצות?',{message:{wa_timestamp:new Date(now+1000).toISOString()}}));assert.equal(outbox(f.b,old.id).state,'CANCELLED');ingest(f.b,event('שלום',{message:{wa_timestamp:new Date(now-1000).toISOString()}}));const latest=f.b.prepareOne();assert.equal(latest.reason,'superseded');const next=f.b.prepareOne();assert.equal(next.reason,'reviews');}finally{f.close();}});
test('human reply cancels queued answer and puts conversation under human control',()=>{const f=fixture();try{ingest(f.b,event());const o=f.b.prepareOne();ingest(f.b,event('תשובת נציג',{envelope:{type:'message.echo'},message:{direction:'outbound',source:'app'}}));assert.equal(outbox(f.b,o.id).state,'CANCELLED');assert.equal(f.b.conversation('cv_synthetic').human,1);}finally{f.close();}});
test('messages with equal provider timestamps produce only one current reply',()=>{const f=fixture();try{ingest(f.b,event('מה שעות הפעילות?'));ingest(f.b,event('אפשר המלצות?'));assert.equal(f.b.prepareOne().reason,'superseded');assert.equal(f.b.prepareOne().reason,'reviews');assert.equal(f.b.db.prepare("SELECT count(*) n FROM outbox WHERE state='READY'").get().n,1);}finally{f.close();}});
test('optout cancels queued reply, persists, and no later message clears it',()=>{const f=fixture();try{ingest(f.b,event());const o=f.b.prepareOne();ingest(f.b,event('הסירו אותי'));assert.equal(outbox(f.b,o.id).state,'CANCELLED');ingest(f.b,event('שלום'));while(f.b.prepareOne()){}assert.equal(f.b.db.prepare("SELECT count(*) n FROM outbox WHERE state='READY'").get().n,0);assert.equal(f.b.conversation('cv_synthetic').optout,1);}finally{f.close();}});
test('human handoff is durable, independent of acknowledgement text',()=>{const f=fixture();try{ingest(f.b,event('איזו ריבית אקבל?'));assert.equal(f.b.prepareOne().route,'handoff');assert.equal(f.b.db.prepare("SELECT count(*) n FROM handoffs WHERE state='OPEN'").get().n,1);}finally{f.close();}});
test('simulation never calls provider',async()=>{const f=fixture();try{ingest(f.b,event());const o=f.b.prepareOne();const r=await f.b.dispatch(o.id,{send(){throw new Error('must not call');}});assert.equal(r.state,'SIMULATED');}finally{f.close();}});
test('activation and provider preflight are mandatory',async()=>{const f=fixture();try{ingest(f.b,event());const o=f.b.prepareOne();assert.equal((await f.b.dispatch(o.id,null,{live:true})).state,'BLOCKED');assert.equal((await f.b.dispatch(o.id,null,{...gates,beforeSend:async()=>false})).state,'BLOCKED');}finally{f.close();}});
test('durable claim prevents concurrent duplicate send',async()=>{const f=fixture();try{ingest(f.b,event());const o=f.b.prepareOne();let calls=0,release;const provider={send:async()=>{calls++;await new Promise(r=>release=r);return {id:'msg_provider',accepted:true,status:201};}};const a=f.b.dispatch(o.id,provider,gates);await new Promise(r=>setImmediate(r));const b=await f.b.dispatch(o.id,provider,gates);assert.equal(b.state,'NOT_CLAIMED');release();assert.equal((await a).state,'ACCEPTED');assert.equal(calls,1);}finally{f.close();}});
test('429 retries only after delay, with a bounded attempt count and same outbox ID',async()=>{const f=fixture();try{ingest(f.b,event());const o=f.b.prepareOne();const ids=[];const p={send:async x=>{ids.push(x.id);return {status:429,accepted:false,retryAfterMs:1000};}};assert.equal((await f.b.dispatch(o.id,p,gates)).state,'RETRY');assert.equal((await f.b.dispatch(o.id,p,gates)).state,'NOT_CLAIMED');f.advance(1000);assert.equal((await f.b.dispatch(o.id,p,gates)).state,'RETRY');f.advance(1000);assert.equal((await f.b.dispatch(o.id,p,gates)).state,'FAILED');assert.equal(new Set(ids).size,1);}finally{f.close();}});
for(const failure of [{status:503,uncertain:true},{uncertain:true},{status:504}])test('ambiguous failure never retries '+JSON.stringify(failure),async()=>{const f=fixture();try{ingest(f.b,event());const o=f.b.prepareOne();let calls=0;const p={send:async()=>{calls++;return failure;}};assert.equal((await f.b.dispatch(o.id,p,gates)).state,'UNCERTAIN');f.advance(60000);assert.equal((await f.b.dispatch(o.id,p,gates)).state,'NOT_CLAIMED');assert.equal(calls,1);assert.equal(f.b.reconcile(o.id,'msg_verified_by_operator'),1);}finally{f.close();}});
test('closed service window cancels send even if queued while open',async()=>{const f=fixture();try{ingest(f.b,event());const o=f.b.prepareOne();f.advance(86400000);assert.equal((await f.b.dispatch(o.id,null,gates)).state,'NOT_CLAIMED');assert.equal(outbox(f.b,o.id).state,'CANCELLED');}finally{f.close();}});
test('database failure does not return a false success ACK',()=>{const f=fixture();try{f.b.db.exec("CREATE TRIGGER fail_insert BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;");assert.throws(()=>ingest(f.b,event()));assert.equal(f.b.db.prepare('SELECT count(*) n FROM events').get().n,0);}finally{f.close();}});
test('provider transport uses documented endpoint, strict send mode and stable idempotency',async()=>{let captured;const p=cosendTransport('SYNTHETIC_NOT_REAL',{fetchImpl:async(url,options)=>{captured={url,options};return new Response(JSON.stringify({id:'msg_test'}),{status:201});}});const r=await p.send({id:'synthetic-outbox',conversation:'cv_test',reply:'synthetic'});assert.equal(r.accepted,true);assert.equal(captured.url,'https://api.cosend.app/v1/messages');assert.equal(captured.options.headers['Idempotency-Key'],'synthetic-outbox');assert.equal(JSON.parse(captured.options.body).send_mode,'strict');});
test('model adapter is credential gated, schema constrained, no tools and no real call',async()=>{await assert.rejects(classifyWithApprovedModel('שלום',{}));let request;const key=await classifyWithApprovedModel('שלום',{credentialApproved:true,budgetApproved:true,apiKey:'SYNTHETIC_NOT_REAL',model:'approved-model-placeholder',fetchImpl:async(url,options)=>{request=JSON.parse(options.body);return new Response(JSON.stringify({output:[{content:[{type:'output_text',text:'{"key":"intro"}'}]}]}),{status:200});}});assert.equal(key,'intro');assert.equal(request.store,false);assert.equal(request.tools,undefined);assert.equal(request.text.format.strict,true);});
test('real local HTTP path preserves raw bytes and ACKs only committed data; no live route exists',async()=>{
  const f=fixture();const key='SYNTHETIC_WORKER_TOKEN_NOT_REAL_123456';
  const server=createIsolatedServer({broker:f.b,signing:[secret],workerKey:key});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{
    const url=`http://127.0.0.1:${server.address().port}`;
    // HTTP test timestamp uses wall clock, independent of message timestamp in policy tests.
    const e=event(),raw=Buffer.from(JSON.stringify(e,null,2));const t=Math.floor(now/1000);
    const header=`t=${t},v1=${createHmac('sha256',secret).update(`${t}.`).update(raw).digest('hex')}`;
    const r=await fetch(url+'/ingest',{method:'POST',headers:{'Cosend-Signature':header},body:raw});
    assert.equal(r.status,202);assert.equal(f.b.db.prepare('SELECT count(*) n FROM messages').get().n,1);
    assert.equal((await fetch(url+'/simulate-one',{method:'POST'})).status,401);
    const simulated=await fetch(url+'/simulate-one',{method:'POST',headers:{Authorization:'Bearer '+key}});
    assert.equal(simulated.status,200);assert.equal((await simulated.json()).simulated.state,'SIMULATED');
    assert.equal((await fetch(url+'/send',{method:'POST',headers:{Authorization:'Bearer '+key}})).status,404);
    f.b.db.exec("CREATE TRIGGER fail_http BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;");
    const another=signed(event());assert.equal((await fetch(url+'/ingest',{method:'POST',headers:{'Cosend-Signature':another.header},body:another.raw})).status,503);
  }finally{await new Promise(r=>server.close(r));f.close();}
});
