// Explicitly synthetic acceptance sidecar. Run with the deployed no-network
// broker's network namespace, never with production mounts or provider keys.
import {spawn,spawnSync} from 'node:child_process';
import {randomBytes,randomUUID,createHmac} from 'node:crypto';
import {mkdtempSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {once} from 'node:events';
import {DatabaseSync} from 'node:sqlite';
import {ORG,CONNECTION} from '../src/broker.mjs';

if(process.env.EXCELENT_SYNTHETIC_CONTAINER!=='1'||!existsSync('/.dockerenv'))throw Error('isolated_container_required');
if(readFileSync('/state/.synthetic-only','utf8').trim()!=='EXCELENT_SYNTHETIC_ONLY')throw Error('synthetic_volume_required');
const phase=process.argv[2],output=process.argv[3];
if(!['before','after'].includes(phase)||!output?.startsWith('/evidence/'))throw Error('explicit_phase_and_output_required');
const root=mkdtempSync('/tmp/excelent-wa-deployed-e2e-'),dbPath='/state/synthetic.sqlite';
const signing=readFileSync('/run/secrets/cosend_webhook_current','utf8').trim();
const workerKey=readFileSync('/run/secrets/excelent_worker','utf8').trim();
if(signing.length<32||workerKey.length<32)throw Error('synthetic_service_credentials_missing');
const marker='TEST_WA_DEPLOY_RESUME_20261028',ingressId='waDeployTest0001',workerId='waDeployWork0001';
const ingressPath=randomBytes(16).toString('hex'),workerPath=randomBytes(16).toString('hex');
const env={PATH:process.env.PATH,LANG:'C.UTF-8',TZ:'Asia/Jerusalem',NODE_ENV:'production',N8N_USER_FOLDER:join(root,'n8n'),DB_TYPE:'sqlite',DB_SQLITE_DATABASE:join(root,'n8n.sqlite'),
 N8N_PORT:'5689',N8N_HOST:'127.0.0.1',N8N_LISTEN_ADDRESS:'127.0.0.1',N8N_PROTOCOL:'http',N8N_SECURE_COOKIE:'false',N8N_ENCRYPTION_KEY:randomBytes(32).toString('hex'),
 N8N_DIAGNOSTICS_ENABLED:'false',N8N_VERSION_NOTIFICATIONS_ENABLED:'false',N8N_TEMPLATES_ENABLED:'false',N8N_PERSONALIZATION_ENABLED:'false',N8N_LOG_LEVEL:'error',
 N8N_RUNNERS_ENABLED:'true',N8N_BLOCK_ENV_ACCESS_IN_NODE:'true',N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS:'true'};
const report={phase,mode:'DEPLOYED_SYNTHETIC_E2E_NO_SEND',startedAt:new Date().toISOString(),checks:[],liveProviderCalls:0,liveModelCalls:0,workflowIds:[ingressId,workerId]};
let child,logs='',requests=0;
const check=(name,pass,actual)=>{report.checks.push({name,status:pass?'PASS':'FAIL',actual});if(!pass)throw Error(name);};
function sql(query,...args){const db=new DatabaseSync(dbPath,{readOnly:true});try{return db.prepare(query).get(...args);}finally{db.close();}}
function change(query){const db=new DatabaseSync(dbPath);try{db.exec(query);}finally{db.close();}}
async function stop(){if(child&&child.exitCode===null){const ended=once(child,'exit');child.kill('SIGTERM');await Promise.race([ended,new Promise(r=>setTimeout(r,5000))]);if(child.exitCode===null){child.kill('SIGKILL');await ended;}}child=null;}
async function start(){
 child=spawn('n8n',['start'],{env,stdio:['ignore','pipe','pipe']});let error;child.on('error',e=>error=e);
 child.stdout.on('data',b=>logs=(logs+b).slice(-12000));child.stderr.on('data',b=>logs=(logs+b).slice(-12000));
 for(let i=0;i<90;i++){if(error||child.exitCode!==null)throw Error('n8n_start_failed');try{if((await fetch('http://127.0.0.1:5689/healthz/readiness',{signal:AbortSignal.timeout(500)})).ok)return;}catch{}await new Promise(r=>setTimeout(r,500));}
 throw Error('n8n_readiness_timeout');
}
function cli(args){const r=spawnSync('n8n',args,{env,encoding:'utf8',timeout:45000});if(r.status!==0)logs+=(r.stdout??'')+(r.stderr??'');check('cli_'+args[0],r.status===0,{exit:r.status});}
async function response(url,options={}){const r=await fetch(url,{...options,signal:AbortSignal.timeout(12000)});const body=await r.text();let json;try{json=JSON.parse(body);}catch{}return {http:r.status,body:json??{bytes:Buffer.byteLength(body)}};}
async function ingress(e,bad=false){const raw=JSON.stringify(e,null,3)+'\n',t=Math.floor(Date.now()/1000),sig=createHmac('sha256',signing).update(t+'.').update(raw).digest('hex');requests++;
 return response('http://127.0.0.1:5689/webhook/'+ingressPath,{method:'POST',headers:{'content-type':'application/json','Cosend-Signature':bad?'invalid':`t=${t},v1=${sig}`},body:raw});}
async function processOne(){requests++;return response('http://127.0.0.1:5689/webhook/'+workerPath,{method:'POST'});}
function event(suffix,text,conversation=marker){const at=new Date().toISOString();return {id:'evt_'+marker+'_'+suffix,object:'event',api_version:'v1',type:'message.received',organization_id:ORG,connection_id:CONNECTION,created_at:at,data:{object:{id:'msg_'+marker+'_'+suffix,wamid:'wamid.'+marker+'.'+suffix,connection_id:CONNECTION,conversation_id:'cv_'+conversation,direction:'inbound',source:'customer',type:'text',content:{text:{body:text}},created_at:at,wa_timestamp:at}}};}
function executions(){const db=new DatabaseSync(env.DB_SQLITE_DATABASE,{readOnly:true});try{return db.prepare('SELECT id,workflowId,status FROM execution_entity WHERE workflowId IN (?,?) ORDER BY id').all(ingressId,workerId);}finally{db.close();}}
const save={executionOrder:'v1',timezone:'Asia/Jerusalem',saveDataSuccessExecution:'all',saveDataErrorExecution:'all',saveManualExecutions:true};
try{
 let h=await response('http://127.0.0.1:8789/health');check('deployed_service_health',h.http===200&&h.body.mode==='ISOLATED_NO_SEND',h);
 await start();const owner=await response('http://127.0.0.1:5689/rest/owner/setup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'synthetic-owner@example.invalid',firstName:'Synthetic',lastName:'Only',password:'LocalOnly!'+randomBytes(18).toString('hex')})});check('synthetic_owner',owner.http===200,{http:owner.http});await stop();
 const ingressWorkflow=JSON.parse(readFileSync(new URL('../workflows/ingress.json',import.meta.url),'utf8'));
 ingressWorkflow.id=ingressId;ingressWorkflow.versionId=randomUUID();ingressWorkflow.name='SYNTHETIC DEPLOYED INGRESS';ingressWorkflow.settings=save;ingressWorkflow.active=false;
 for(const n of ingressWorkflow.nodes){delete n.credentials;n.id=randomUUID();if(n.type.endsWith('.webhook')){n.parameters.path=ingressPath;n.webhookId=randomUUID();}if(n.type.endsWith('.httpRequest'))n.parameters.url='http://127.0.0.1:8789/ingest';}
 const worker={id:workerId,name:'SYNTHETIC DEPLOYED WORKER',active:false,versionId:randomUUID(),settings:save,nodes:[
  {id:randomUUID(),name:'Synthetic worker',type:'n8n-nodes-base.webhook',typeVersion:2,position:[0,0],webhookId:randomUUID(),parameters:{httpMethod:'POST',path:workerPath,responseMode:'responseNode',options:{}}},
  {id:randomUUID(),name:'Process isolated decision',type:'n8n-nodes-base.httpRequest',typeVersion:4.2,position:[250,0],credentials:{httpHeaderAuth:{id:'syntheticWorkerOnly1',name:'SYNTHETIC WORKER ONLY'}},parameters:{method:'POST',url:'http://127.0.0.1:8789/simulate-one',authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',options:{timeout:5000,response:{response:{fullResponse:true,neverError:true}}}}},
  {id:randomUUID(),name:'Worker result',type:'n8n-nodes-base.respondToWebhook',typeVersion:1.4,position:[500,0],parameters:{respondWith:'json',responseBody:'={{ $json.body }}',options:{responseCode:'={{ $json.statusCode }}'}}}],
  connections:{'Synthetic worker':{main:[[{node:'Process isolated decision',type:'main',index:0}]]},'Process isolated decision':{main:[[{node:'Worker result',type:'main',index:0}]]}}};
 const credentials=join(root,'synthetic-credentials.json'),flows=join(root,'synthetic-workflows.json');
 writeFileSync(credentials,JSON.stringify([{id:'syntheticWorkerOnly1',name:'SYNTHETIC WORKER ONLY',type:'httpHeaderAuth',data:{name:'Authorization',value:'Bearer '+workerKey}}]),{mode:0o600});
 writeFileSync(flows,JSON.stringify([ingressWorkflow,worker]),{mode:0o600});
 cli(['import:credentials','--input='+credentials]);cli(['import:workflow','--input='+flows]);for(const id of [ingressId,workerId])cli(['publish:workflow','--id='+id]);await start();
 if(phase==='before'){
  check('empty_test_namespace',sql('SELECT count(*) n FROM events WHERE id LIKE ?', 'evt_'+marker+'%').n===0,{namespace:marker});
  check('no_existing_pending_work',sql("SELECT count(*) n FROM messages WHERE state='NEW'").n===0,{expected:0});
  const first=event('first','מה שעות הפעילות?');writeFileSync('/state/resume-event.json',JSON.stringify(first));
  let r=await ingress(first,true);check('invalid_signature',r.http===401&&r.body.code==='invalid_signature'&&sql('SELECT count(*) n FROM events WHERE id=?',first.id).n===0,r);
  r=await ingress(first);check('signed_raw_commit_then_ack',r.http===202&&r.body.code==='durably_stored'&&sql('SELECT count(*) n FROM messages WHERE event_id=?',first.id).n===1,r);
  r=await ingress(first);check('event_dedup',r.http===200&&r.body.code==='duplicate_event',r);
  const duplicate=structuredClone(first);duplicate.id+='_duplicate';r=await ingress(duplicate);check('provider_message_dedup',r.http===200&&r.body.code==='duplicate_message',r);
  r=await processOne();const row=sql('SELECT id,state FROM outbox WHERE message_id=?',first.data.object.wamid);check('n8n_process_decide_and_simulate',r.http===200&&r.body.live===false&&r.body.simulated?.state==='SIMULATED'&&row?.state==='SIMULATED',r);writeFileSync('/state/resume-outbox-id',row.id);
  const human=event('human','אני רוצה נציג',marker+'_human');r=await ingress(human);check('handoff_event_committed',r.http===202,r);
  r=await processOne();check('n8n_handoff_queue',r.body.prepared?.route==='handoff'&&r.body.prepared.id===null&&sql("SELECT count(*) n FROM handoffs WHERE conversation=? AND state='OPEN'",human.data.object.conversation_id).n===1&&sql('SELECT human FROM conversations WHERE id=?',human.data.object.conversation_id).human===1,r);
  r=await ingress(event('followup','מה שעות הפעילות?',marker+'_human'));check('followup_stored',r.http===202,r);r=await processOne();check('human_control_blocks_reply',r.body.prepared?.id===null&&sql('SELECT count(*) n FROM outbox WHERE conversation=?',human.data.object.conversation_id).n===0,r);
  const fault=event('fault','מה הדואר שלכם?',marker+'_fault');
  change(`CREATE TRIGGER resume_storage_failure BEFORE INSERT ON events WHEN NEW.id='${fault.id}' BEGIN SELECT RAISE(ABORT,'synthetic_fault'); END;`);
  r=await ingress(fault);check('db_failure_is_503_without_commit',r.http===503&&sql('SELECT count(*) n FROM events WHERE id=?',fault.id).n===0,r);change('DROP TRIGGER resume_storage_failure');
  r=await ingress(fault);check('storage_recovery',r.http===202,r);r=await processOne();check('recovered_event_processed',r.http===200&&r.body.live===false,r);
 }else{
  const first=JSON.parse(readFileSync('/state/resume-event.json','utf8'));let r=await ingress(first);check('restart_preserves_dedup',r.http===200&&r.body.code==='duplicate_event',r);
  check('restart_preserves_outbox',sql('SELECT id,state FROM outbox WHERE message_id=?',first.data.object.wamid)?.id===readFileSync('/state/resume-outbox-id','utf8')&&sql('SELECT state FROM outbox WHERE message_id=?',first.data.object.wamid).state==='SIMULATED',{state:'SIMULATED'});
  r=await ingress(event('after_restart_human','מה שעות הפעילות?',marker+'_human'));check('post_restart_event_ack',r.http===202,r);r=await processOne();check('restart_preserves_human_handoff',r.body.prepared?.id===null&&sql('SELECT human FROM conversations WHERE id=?','cv_'+marker+'_human').human===1&&sql('SELECT count(*) n FROM outbox WHERE conversation=?','cv_'+marker+'_human').n===0,r);
 }
 const absent=await response('http://127.0.0.1:8789/send',{method:'POST'});check('no_send_endpoint',absent.http===404,absent);
 let rows=[];for(let i=0;i<40;i++){rows=executions();if(rows.length===requests&&rows.every(r=>r.status==='success'))break;await new Promise(r=>setTimeout(r,250));}
 check('n8n_final_execution_states',rows.length===requests&&rows.every(r=>r.status==='success'),{expected:requests,executions:rows});report.n8nExecutions=rows;report.status='PASS';
}catch(e){report.status='FAIL';report.failure=e.message;process.exitCode=1;}
finally{
 try{change('DROP TRIGGER IF EXISTS resume_storage_failure');}catch{}
 await stop();report.finishedAt=new Date().toISOString();report.passed=report.checks.filter(c=>c.status==='PASS').length;report.failed=report.checks.filter(c=>c.status==='FAIL').length;
 writeFileSync(join(root,'harness-private.log'),logs,{mode:0o600});writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
