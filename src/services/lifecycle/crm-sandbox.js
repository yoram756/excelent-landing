// Sandbox projection into ONE explicitly preallocated, owned Monday item.
// Transport is injected. No credentials, item creation, dispatch or production.
// Monday has no compare-and-swap: exclusive ownership is a precondition, and
// ambiguous writes are quarantined rather than automatically retried.
const {createHash}=require('node:crypto');
const BOARD='5106403803',COLUMN='long_text_mm8adnp7',VERSION='excelent-sandbox-crm-v1';
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const encode=v=>JSON.stringify(canonical(v));
const hash=v=>createHash('sha256').update(encode(v)).digest('hex');
function target(t,enrollmentId){
 if(t?.boardId!==BOARD||t.columnId!==COLUMN||! /^[1-9][0-9]{1,15}$/.test(t.itemId||'')||! /^[a-f0-9-]{36}$/.test(t.runId||'')||t.enrollmentId!==enrollmentId)throw Error('Explicit owned sandbox target required');
 return {...t,name:'TEST SQLite CRM '+t.runId};
}
function bootstrap({runId,enrollmentId}){return {version:VERSION,synthetic:true,owner:{runId,enrollmentId},projection:null};}
function owned(item,t){
 if(!item||item.boardId!==BOARD||item.id!==t.itemId||item.name!==t.name||item.state!=='active'||typeof item.text!=='string')throw Error('CRM item ownership mismatch');
 const v=JSON.parse(item.text),owner={runId:t.runId,enrollmentId:t.enrollmentId};
 if(v.version!==VERSION||v.synthetic!==true||encode(v.owner)!==encode(owner)||!Object.hasOwn(v,'projection'))throw Error('CRM marker ownership mismatch');
 if(v.projection!==null&&(!v.projection?.data||v.projection.hash!==hash(v.projection.data)))throw Error('CRM projection checksum mismatch');
 return v;
}
function payload(store,p,t){
 return store.tx(()=>{
 const e=store.enrollment(p.enrollmentId),s=store.get('SELECT * FROM subjects WHERE id=?',e.subject_id),c=JSON.parse(e.consent);
 if(! /^9725000000[4-9][0-9]$/.test(s.phone)||! /^[^@]+@example\.invalid$/.test(s.email||''))throw Error('Only synthetic sandbox recipients are supported');
 const frontier=store.get('SELECT MAX(seq) AS seq FROM events WHERE enrollment_id=?',e.id).seq;
 const subjectFrontier=store.get('SELECT MAX(events.seq) AS seq FROM events JOIN enrollments ON enrollments.id=events.enrollment_id WHERE subject_id=?',e.subject_id).seq;
 const related=store.all('SELECT state FROM enrollments WHERE subject_id=?',e.subject_id).map(row=>JSON.parse(row.state)),sharedPause=Object.fromEntries(['humanHandling','incomingReplyPending','meetingActive'].map(key=>[key,related.some(state=>state[key]===true)]));
 const data={event:{id:p.eventId,seq:p.seq,type:p.type,at:p.at,detail:p.detail},frontier,subjectFrontier,enrollmentId:e.id,campaignId:e.campaign_id,enrolledAt:e.started_at,recipients:c.recipients,grants:c.grants,stop:{reason:s.stop_reason,at:s.stopped_at},state:JSON.parse(e.state),sharedPause};
 return {...bootstrap(t),projection:{data,hash:hash(data)}};
 });
}
async function projectNext({store,resolveTarget,transport,now,workerId='sandbox-crm',leaseMs=60000}){
 if(typeof now!=='function'||typeof resolveTarget!=='function'||typeof transport?.read!=='function'||typeof transport?.write!=='function')throw Error('Explicit clock, target and transport required');
 const p=store.claimProjection({workerId,now:now(),leaseMs});if(!p)return {status:'IDLE',dispatchEnabled:false};
 const t=target(resolveTarget(p.enrollmentId),p.enrollmentId);
 // Reads may fail safely before any write. Their reserved leases can expire.
 const before=owned(await transport.read(t),t),expected=payload(store,p,t);
 if(before.projection&&(before.projection.data.frontier>expected.projection.data.frontier||before.projection.data.subjectFrontier>expected.projection.data.subjectFrontier||before.projection.data.event.seq>p.seq||before.projection.data.event.seq===p.seq&&encode(before)!==encode(expected)))throw Error('CRM version conflict; reconciliation required');
 const binding='monday:'+BOARD+':'+t.itemId;
 store.beginProjection({...p,binding,payloadHash:expected.projection.hash,payload:encode(expected),frontier:expected.projection.data.frontier,subjectFrontier:expected.projection.data.subjectFrontier,now:now()});
 try{
  const alreadyVerified=encode(before)===encode(expected);
  if(!alreadyVerified)await transport.write({...t,text:encode(expected)});
  const after=owned(await transport.read(t),t);
  if(encode(after)!==encode(expected))throw Error('CRM readback mismatch');
  const receipt=binding+':'+expected.projection.hash;
  store.acknowledgeProjection({...p,receipt,now:now()});
  return {status:'ACKED',eventId:p.eventId,itemId:t.itemId,payloadHash:expected.projection.hash,writePerformed:!alreadyVerified,dispatchEnabled:false};
 }catch(error){
  // Includes a lost response, partial GraphQL success, readback error and lease
  // expiry. No path automatically resubmits an uncertain remote write.
  store.unknownProjection(p);throw error;
 }
}
module.exports={projectNext,bootstrap,owned,encode,hash,BOARD,COLUMN};
