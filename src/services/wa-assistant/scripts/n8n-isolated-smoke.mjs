// Run ONLY in a disposable Docker container with --network none, no ports and
// no production mounts. This creates a new synthetic n8n database and owner.
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID,randomBytes,createHmac} from 'node:crypto';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {once} from 'node:events';
import {Broker,ORG,CONNECTION} from '../src/broker.mjs';
import {createIsolatedServer} from '../src/server.mjs';

if(process.env.EXCELENT_SYNTHETIC_CONTAINER!=='1'||!existsSync('/.dockerenv'))throw new Error('disposable_synthetic_docker_container_required');
const root=mkdtempSync('/tmp/excelent-n8n-synthetic-');
const userFolder=join(root,'n8n-synthetic'),n8nDb=join(userFolder,'database.sqlite');
mkdirSync(userFolder,{recursive:true});
const workflowId='syntheticWATst001',path='synthetic-wa-ingress-only';
const signing='SYNTHETIC_LOCAL_N8N_SIGNING_NOT_A_CREDENTIAL',workerKey='SYNTHETIC_LOCAL_N8N_WORKER_NOT_A_CREDENTIAL';
const broker=new Broker(join(root,'broker-synthetic.sqlite'));
const server=createIsolatedServer({broker,signing:[signing],workerKey});
const env={PATH:process.env.PATH,LANG:'C.UTF-8',TZ:'Asia/Jerusalem',NODE_ENV:'production',N8N_USER_FOLDER:userFolder,DB_TYPE:'sqlite',DB_SQLITE_DATABASE:n8nDb,
  N8N_PORT:'5689',N8N_HOST:'127.0.0.1',N8N_LISTEN_ADDRESS:'127.0.0.1',N8N_PROTOCOL:'http',N8N_SECURE_COOKIE:'false',
  N8N_ENCRYPTION_KEY:randomBytes(32).toString('hex'),N8N_DIAGNOSTICS_ENABLED:'false',N8N_VERSION_NOTIFICATIONS_ENABLED:'false',
  N8N_TEMPLATES_ENABLED:'false',N8N_PERSONALIZATION_ENABLED:'false',N8N_LOG_LEVEL:'error',N8N_RUNNERS_ENABLED:'true',
  N8N_BLOCK_ENV_ACCESS_IN_NODE:'true',N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS:'true',N8N_SKIP_AUTH_ON_OAUTH_CALLBACK:'false'};
const checks=[];const report={mode:'ISOLATED_N8N_RAW_HTTP_SYNTHETIC_NO_PROVIDER_NO_SEND',startedAt:new Date().toISOString(),workflowId,checks,liveProviderCalls:0,liveModelCalls:0};
let child,brokerListening=false,logs='';
function check(name,pass,actual){checks.push({name,status:pass?'PASS':'FAIL',actual});if(!pass)throw new Error(name);}
function guard(){if(!env.N8N_USER_FOLDER.startsWith('/tmp/excelent-n8n-synthetic-')||!env.DB_SQLITE_DATABASE.startsWith(env.N8N_USER_FOLDER+'/'))throw new Error('isolated_database_guard');}
async function stop(){if(child&&child.exitCode===null){const exited=once(child,'exit');child.kill('SIGTERM');await Promise.race([exited,new Promise(r=>setTimeout(r,5000))]);if(child.exitCode===null){child.kill('SIGKILL');await exited;}}child=null;}
async function start(){
  guard();child=spawn('n8n',['start'],{env,stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',b=>{logs=(logs+b.toString()).slice(-12000);});child.stderr.on('data',b=>{logs=(logs+b.toString()).slice(-12000);});
  let spawnError;child.on('error',e=>{spawnError=e;});
  for(let n=0;n<90;n++){
    if(spawnError)throw new Error('n8n_spawn_failed');if(child.exitCode!==null)throw new Error('n8n_start_exited');
    try{const r=await fetch('http://127.0.0.1:5689/healthz/readiness',{signal:AbortSignal.timeout(500)});if(r.status===200)return;}catch{}
    await new Promise(r=>setTimeout(r,500));
  }
  throw new Error('n8n_start_timeout');
}
function cli(args){guard();const r=spawnSync('n8n',args,{env,encoding:'utf8',timeout:45000});if(r.status!==0)logs+=(r.stdout??'')+(r.stderr??'');check('cli_'+args[0],r.status===0,{command:args[0],exit:r.status});}
function executions(){const db=new DatabaseSync(n8nDb,{readOnly:true});try{return db.prepare('SELECT id,status FROM execution_entity WHERE workflowId=? ORDER BY id').all(workflowId);}finally{db.close();}}
const expectedStatuses=['success','success','success','success','success','error'];
function finalStatusesMatch(rows){return rows.length===expectedStatuses.length&&rows.every((r,i)=>r.status===expectedStatuses[i]);}
async function waitForFinalExecutions(){
  // RespondToWebhook can finish the HTTP response before execution finalization.
  // Read a fresh SQLite snapshot, bounded to 10 seconds, before stopping n8n.
  const deadline=Date.now()+10000;let rows=[];
  do{rows=executions();if(finalStatusesMatch(rows))return rows;await new Promise(r=>setTimeout(r,250));}while(Date.now()<deadline);
  return rows;
}
let sequence=0;
function event(){const n=++sequence,at=new Date().toISOString();return {id:`evt_n8n_synthetic_${n}`,object:'event',api_version:'v1',type:'message.received',organization_id:ORG,connection_id:CONNECTION,created_at:at,data:{object:{id:`msg_n8n_synthetic_${n}`,wamid:`wamid.n8n.synthetic.${n}`,connection_id:CONNECTION,conversation_id:'cv_n8n_synthetic',direction:'inbound',source:'customer',type:'text',content:{text:{body:'מה שעות הפעילות?'}},created_at:at,wa_timestamp:at}}};}
async function ingest(e,bad=false){const raw=JSON.stringify(e,null,3)+'\n',t=Math.floor(Date.now()/1000),signature=createHmac('sha256',signing).update(`${t}.`).update(raw).digest('hex');
  const r=await fetch(`http://127.0.0.1:5689/webhook/${path}`,{method:'POST',signal:AbortSignal.timeout(12000),headers:{'content-type':'application/json','Cosend-Signature':bad?'invalid':`t=${t},v1=${signature}`},body:raw});
  const body=await r.text();let json;try{json=JSON.parse(body);}catch{}
  // Returned test bodies contain only controlled codes, no raw request or credentials.
  return {http:r.status,...(json?.code?{code:json.code}:{bodyBytes:Buffer.byteLength(body)})};
}
try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(8789,'127.0.0.1',resolve);});brokerListening=true;
  await start();
  // Normal first-owner registration on a NEW local test instance only. Never
  // disable auth or reuse/import any real account, key, credential or database.
  const setup=await fetch('http://127.0.0.1:5689/rest/owner/setup',{method:'POST',signal:AbortSignal.timeout(5000),headers:{'content-type':'application/json'},body:JSON.stringify({email:'synthetic-owner@example.invalid',firstName:'Synthetic',lastName:'Only',password:'LocalOnly!'+randomBytes(18).toString('hex')})});
  check('synthetic_owner_setup',setup.status===200,{http:setup.status});await setup.text();await stop();
  const workflow=JSON.parse(readFileSync(new URL('../workflows/ingress.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
  workflow.id=workflowId;workflow.name='SYNTHETIC ISOLATED RAW FORWARDING ONLY';workflow.active=false;workflow.versionId=randomUUID();delete workflow.pinData;delete workflow.shared;
  // Save synthetic-only evidence. Do not change production/draft retention.
  workflow.settings={...workflow.settings,saveDataSuccessExecution:'all',saveDataErrorExecution:'all',saveManualExecutions:true};
  for(const node of workflow.nodes){delete node.credentials;node.id=randomUUID();if(node.type==='n8n-nodes-base.webhook'){node.parameters.path=path;node.webhookId=randomUUID();}if(node.type==='n8n-nodes-base.httpRequest')node.parameters.url='http://127.0.0.1:8789/ingest';}
  const input=join(root,'synthetic-workflow.json');writeFileSync(input,JSON.stringify(workflow));
  cli(['import:workflow','--input='+input]);cli(['publish:workflow','--id='+workflowId]);await start();
  // A webhook 404 during activation is distinguishable from a broker response.
  const first=event();let r=await ingest(first);check('raw_whitespace_hmac_and_commit',r.http===202&&r.code==='durably_stored'&&broker.db.prepare('SELECT count(*) n FROM messages').get().n===1,r);
  r=await ingest(first);check('duplicate_same_event',r.http===200&&r.code==='duplicate_event',r);
  r=await ingest(event(),true);check('wrong_signature',r.http===401&&r.code==='invalid_signature',r);
  broker.db.exec("CREATE TRIGGER synthetic_n8n_fail BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT,'synthetic_failure'); END;");
  const failed=event();r=await ingest(failed);check('db_failure_is_503',r.http===503&&broker.db.prepare('SELECT count(*) n FROM events WHERE id=?').get(failed.id).n===0,r);
  broker.db.exec('DROP TRIGGER synthetic_n8n_fail');r=await ingest(failed);check('db_recovery_is_202',r.http===202,r);
  await new Promise(r=>server.close(r));brokerListening=false;r=await ingest(event());check('unavailable_broker_never_acks_success',r.http>=400&&r.http!==404,r);
  const finalRows=await waitForFinalExecutions();
  report.n8nExecutionsBeforeShutdown=finalRows;
  check('n8n_final_execution_statuses',finalStatusesMatch(finalRows),{expectedStatuses,executions:finalRows,maximumWaitMs:10000});
  report.status='PASS';
}catch(e){report.status='FAIL';report.failure=e.message;process.exitCode=1;}
finally{
  await stop();if(brokerListening)await new Promise(r=>server.close(r));broker.close();
  try{report.n8nExecutions=executions();}catch{report.n8nExecutions=[];}
  report.finishedAt=new Date().toISOString();report.passed=checks.filter(c=>c.status==='PASS').length;report.failed=checks.filter(c=>c.status==='FAIL').length;
  report.limitations=['Disposable local n8n only; no production workflow edited','No provider signing credential, real delivery or model call tested','No provider-side human handoff tested'];
  writeFileSync(join(root,'harness-logs.txt'),logs);
  if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({...report,isolatedEvidenceFolder:root},null,2));
}
