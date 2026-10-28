// Synthetic, loopback-only service verification. No provider credentials or network transport.
import {fork} from 'node:child_process';
import {createHmac} from 'node:crypto';
import {mkdtempSync,rmSync,realpathSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import {DatabaseSync} from 'node:sqlite';
import {Broker,ORG,CONNECTION} from '../src/broker.mjs';
import {createIsolatedServer} from '../src/server.mjs';

const signing='SYNTHETIC_LOCAL_SMOKE_SIGNING_NOT_A_CREDENTIAL';
const workerKey='SYNTHETIC_LOCAL_SMOKE_WORKER_NOT_A_CREDENTIAL';
const script=fileURLToPath(import.meta.url);
const gates={live:true,exclusiveOwnerVerified:true,providerStateVerified:true,retentionApproved:true,beforeSend:async()=>true};

if(process.argv[2]==='--serve-synthetic'){
  const broker=new Broker(process.argv[3]);
  const server=createIsolatedServer({broker,signing:[signing],workerKey});
  server.listen(0,'127.0.0.1',()=>process.send({type:'ready',port:server.address().port}));
  process.on('message',async m=>{
    // Test harness IPC is not part of the HTTP service and is never deployed as its entry point.
    if(m?.type==='mock-inflight')await broker.dispatch(m.id,{send:async()=>{
      process.send({type:'mock-inflight',id:m.id});return new Promise(()=>{});
    }},gates);
    if(m?.type==='probe-no-retry'){
      let calls=0;const result=await broker.dispatch(m.id,{send:async()=>{calls++;return {accepted:true,status:201,id:'msg_synthetic_unexpected'};}},gates);
      process.send({type:'probe-no-retry',state:result.state,calls});
    }
  });
}else{
  const root=realpathSync(tmpdir());
  const dir=mkdtempSync(join(root,'excelent-wa-smoke-'));
  const dbPath=join(dir,'synthetic.sqlite');
  let child;const checks=[];let seq=0;
  const report={mode:'SYNTHETIC_REAL_HTTP_NO_PROVIDER_NO_SEND',startedAt:new Date().toISOString(),checks,liveProviderCalls:0,liveModelCalls:0,limitations:['Synthetic signing secret only','No n8n binary forwarding verified','No provider delivery or provider inbox handoff verified']};
  const check=(name,pass,actual)=>{checks.push({name,status:pass?'PASS':'FAIL',actual});if(!pass)throw new Error(name);};
  async function message(type,send){
    let timer;try{return await new Promise((resolve,reject)=>{
      timer=setTimeout(()=>{child.off('message',handler);reject(new Error('child_timeout_'+type));},5000);
      const handler=m=>{if(m?.type===type){child.off('message',handler);resolve(m);}};
      child.on('message',handler);if(send)child.send(send);
    });}finally{clearTimeout(timer);}
  }
  async function start(){
    child=fork(script,['--serve-synthetic',dbPath],{stdio:['ignore','ignore','ignore','ipc']});
    const ready=await message('ready');return `http://127.0.0.1:${ready.port}`;
  }
  async function stop(){if(child&&child.exitCode===null){const exited=once(child,'exit');child.kill('SIGKILL');await exited;}}
  function event(text,conversation='cv_smoke',extra={}){
    const n=++seq;const at=new Date().toISOString();return {id:`evt_smoke_${n}`,object:'event',api_version:'v1',type:'message.received',organization_id:ORG,connection_id:CONNECTION,created_at:at,
      data:{object:{id:`msg_smoke_${n}`,wamid:`wamid.smoke.${n}`,connection_id:CONNECTION,conversation_id:conversation,direction:'inbound',source:'customer',type:'text',content:{text:{body:text}},wa_timestamp:at,created_at:at,...extra}}};
  }
  async function ingest(url,e,bad=false){const raw=JSON.stringify(e,null,2);const t=Math.floor(Date.now()/1000);const sig=createHmac('sha256',signing).update(`${t}.`).update(raw).digest('hex');
    const response=await fetch(url+'/ingest',{method:'POST',signal:AbortSignal.timeout(5000),headers:{'Cosend-Signature':bad?'invalid':`t=${t},v1=${sig}`},body:raw});return {http:response.status,body:await response.json()};}
  async function simulate(url){const response=await fetch(url+'/simulate-one',{method:'POST',signal:AbortSignal.timeout(5000),headers:{Authorization:'Bearer '+workerKey}});return {http:response.status,body:await response.json()};}
  function read(sql,...params){const db=new DatabaseSync(dbPath,{readOnly:true});try{return db.prepare(sql).get(...params);}finally{db.close();}}
  function execute(sql){const db=new DatabaseSync(dbPath);try{db.exec(sql);}finally{db.close();}}
  try{
    let url=await start();
    const health=await fetch(url+'/health');check('health_before',health.status===200,{http:health.status,body:await health.json()});
    const first=event('מה שעות הפעילות?');let result=await ingest(url,first,true);
    check('wrong_signature',result.http===401&&read('SELECT count(*) n FROM events').n===0,result);
    result=await ingest(url,first);check('durable_ack',result.http===202&&read('SELECT count(*) n FROM messages').n===1,result);
    result=await ingest(url,first);check('event_dedup',result.http===200&&result.body.code==='duplicate_event',result);
    result=await ingest(url,{...first,id:'evt_smoke_duplicate_envelope'});check('provider_message_dedup',result.http===200&&result.body.code==='duplicate_message',result);
    const unauthorized=await fetch(url+'/simulate-one',{method:'POST'});check('worker_auth',unauthorized.status===401,{http:unauthorized.status});
    result=await simulate(url);check('simulation',result.http===200&&result.body.simulated?.state==='SIMULATED',result);
    await ingest(url,event('אפשר נציג?','cv_handoff'));result=await simulate(url);
    check('durable_handoff',result.http===200&&result.body.prepared?.route==='handoff'&&read("SELECT human FROM conversations WHERE id='cv_handoff'").human===1&&read("SELECT count(*) n FROM handoffs WHERE state='OPEN'").n===1,result);
    await ingest(url,event('מה שעות הפעילות?','cv_handoff'));result=await simulate(url);
    check('human_blocks_followup',result.body.prepared?.reason==='human_controls_conversation'&&read("SELECT count(*) n FROM outbox WHERE conversation='cv_handoff'").n===0,result);
    await stop();url=await start();
    result=await ingest(url,first);check('restart_preserves_dedup',result.http===200&&result.body.code==='duplicate_event'&&read("SELECT count(*) n FROM outbox WHERE state='SIMULATED'").n===1,result);
    check('restart_preserves_handoff',read("SELECT human FROM conversations WHERE id='cv_handoff'").human===1,{human:1,openHandoffs:read("SELECT count(*) n FROM handoffs WHERE state='OPEN'").n});
    execute("CREATE TRIGGER synthetic_write_failure BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT,'synthetic_write_failure'); END;");
    const failed=event('שלום','cv_recovery');result=await ingest(url,failed);
    check('db_failure_returns_503',result.http===503&&read('SELECT count(*) n FROM events WHERE id=?',failed.id).n===0,result);
    execute('DROP TRIGGER synthetic_write_failure');result=await ingest(url,failed);check('db_recovery',result.http===202,result);
    const absentSend=await fetch(url+'/send',{method:'POST',headers:{Authorization:'Bearer '+workerKey}});check('no_http_send_route',absentSend.status===404,{http:absentSend.status});
    // Prepare an item locally, then crash an actual child during an injected mock send.
    await simulate(url);await ingest(url,event('מה שעות הפעילות?','cv_crash'));
    await stop();const preparedBroker=new Broker(dbPath);const prepared=preparedBroker.prepareOne();preparedBroker.close();
    url=await start();await message('mock-inflight',{type:'mock-inflight',id:prepared.id});
    check('mock_send_durably_claimed',read('SELECT state FROM outbox WHERE id=?',prepared.id).state==='SENDING',{state:'SENDING',outboxId:prepared.id});
    await stop();url=await start();const noRetry=await message('probe-no-retry',{type:'probe-no-retry',id:prepared.id});
    check('crash_never_auto_resends',noRetry.state==='NOT_CLAIMED'&&noRetry.calls===0&&read('SELECT state FROM outbox WHERE id=?',prepared.id).state==='SENDING',noRetry);
    report.status='PASS';
  }catch(e){report.status='FAIL';report.failure=e.message;process.exitCode=1;}
  finally{
    await stop();report.finishedAt=new Date().toISOString();report.passed=checks.filter(c=>c.status==='PASS').length;report.failed=checks.filter(c=>c.status==='FAIL').length;
    if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report,null,2));
    const resolved=realpathSync(dir);
    if(dirname(resolved)===root&&resolved.startsWith(root+sep+'excelent-wa-smoke-'))rmSync(resolved,{recursive:true,force:true});
  }
}
