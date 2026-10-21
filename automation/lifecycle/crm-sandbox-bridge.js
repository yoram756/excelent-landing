// Manual JSONL test transport. The operator routes requests through an authorized
// connector; this CLI never accesses a credential, network or production board.
const fs=require('node:fs'),path=require('node:path'),readline=require('node:readline'),{randomUUID}=require('node:crypto'),{Store}=require('./store'),{adapt}=require('./lp1-adapter'),{projectNext,bootstrap,encode,BOARD,COLUMN}=require('./crm-sandbox'),campaign=require('../../config/lifecycle/refi.json');
if(process.argv[2]!=='--sandbox'||!path.isAbsolute(process.argv[3]||'')||fs.existsSync(process.argv[3]))throw Error('Explicit new sandbox database path required');
const lines=readline.createInterface({input:process.stdin,crlfDelay:Infinity})[Symbol.asyncIterator](),emit=v=>process.stdout.write(JSON.stringify(v)+'\n');
const receive=async()=>{const r=await lines.next();if(r.done)throw Error('Test bridge closed before response');return JSON.parse(r.value);};
const s=new Store(process.argv[3],{sandbox:true}),runId=randomUUID(),now=()=>new Date().toISOString();
async function rpc(op,request){emit({op,request});const r=await receive();if(r.error)throw Error('Connector refused test request');return r.result;}
async function main(){
 const body={product:'LP1',first_name:'TEST CRM only',phone:'0500000040',email:'test@example.invalid',idempotency_key:'test-crm-'+runId,service_request:true,marketing_consent:false,marketing_channels:['email'],answers:{ask:'call',when:'week'}};
 const validated=new Function('$input','$getWorkflowStaticData',fs.readFileSync(path.resolve(__dirname,'../intake/validate.js'),'utf8'))({first:()=>({json:{headers:{},body}})},()=>({}))[0].json,mapped=adapt(validated,{campaign,now:now()}),e=s.ingest(mapped);
 emit({op:'allocate-owned-item',boardId:BOARD,columnId:COLUMN,name:'TEST SQLite CRM '+runId,runId,enrollmentId:e.enrollmentId,text:encode(bootstrap({runId,enrollmentId:e.enrollmentId}))});
 const {itemId}=await receive(),target={boardId:BOARD,columnId:COLUMN,itemId,runId,enrollmentId:e.enrollmentId},transport={read:t=>rpc('read',t),write:t=>rpc('write',t)};
 const results=[],project=async()=>{const r=await projectNext({store:s,resolveTarget:()=>target,transport,now,leaseMs:300000});results.push(r);emit({op:'projection-result',result:r});};
 await project();const replay=s.ingest({...mapped,now:now()});if(!replay.replayed||replay.enrollmentId!==e.enrollmentId)throw Error('Intake replay created another enrollment');
 for(const type of ['questionnaire','reply','meeting_booked','meeting_cancelled','handed_off']){s.record({eventId:'test-'+type,enrollmentId:e.enrollmentId,type,...(type.startsWith('meeting_')?{referenceId:'test-meeting'}:{}),now:now()});await project();}
 s.withdraw({eventId:'test-withdraw',enrollmentId:e.enrollmentId,channels:['email'],now:now()});await project();
 for(const type of ['optout','paid']){s.record({eventId:'test-'+type,enrollmentId:e.enrollmentId,type,now:now()});await project();}
 const idle=await projectNext({store:s,resolveTarget:()=>target,transport,now});if(idle.status!=='IDLE')throw Error('Unexpected extra projection');
 emit({op:'complete',itemId,runId,enrollmentId:e.enrollmentId,intakeReplayed:replay.replayed,enrollments:s.snapshot().enrollments.length,events:s.snapshot().events.length,acked:s.snapshot().projections.filter(p=>p.state==='acked').length,results,dispatchEnabled:false,scope:'LP1 server Validate + SQLite + real connector transport in private board; not live n8n'});
}
main().catch(e=>{emit({op:'failure',error:e.message});process.exitCode=1;}).finally(()=>{s.close();process.stdin.destroy();});
