'use strict';
// Sandbox-only adapter, injected transport follows the established lifecycle pattern.
// A remote write without a matching independent readback becomes UNKNOWN, never retried blindly.
const {encode,hash}=require('./store');
const config=require('../../../config/business-ops.json');
function target(t){const c=config.monday.sandbox;if(!t||String(t.boardId)!==c.boardId||! /^[1-9]\d{3,15}$/.test(String(t.itemId))||! /^TEST OPS [\w-]+$/.test(t.name)||! /^[\w-]{1,80}$/.test(t.runId))throw Error('Explicit synthetic sandbox target required');return {...t,boardId:c.boardId,...c};}
function marker(t){return 'OPS:'+t.runId;}
function compact(snapshot){return {caseId:snapshot.caseId,customerId:snapshot.customerId,version:snapshot.version,goal:snapshot.goal,stage:snapshot.stage,link:snapshot.link,tasks:snapshot.tasks.map(t=>({id:t.id,key:t.commitmentKey,action:t.action,owner:t.owner,state:t.state,priority:t.priority,dueAt:t.dueAt,proposedDueAt:t.proposedDueAt,dependsOn:t.dependsOn,nextAction:t.nextAction,completion:t.completion,evidence:t.evidence.map(e=>({kind:e.kind,artifact:e.artifact_id,source:e.event_key}))})),sourceKeys:snapshot.sources.map(s=>s.eventKey),dispatchEnabled:false};}
function pack(snapshot,t){const summary=compact(snapshot);return {schema:'excellent-business-ops-v1',synthetic:true,runId:t.runId,hash:hash(summary),sourceSnapshotHash:hash(snapshot),snapshot:summary};}
function owned(item,t){if(!item||String(item.boardId)!==t.boardId||String(item.id)!==String(t.itemId)||item.name!==t.name||item.marker!==marker(t))throw Error('Sandbox ownership mismatch');}
function desired(snapshot,t){if(!/^TEST[-:]/.test(snapshot.caseId)||!/^TEST[-:]/.test(snapshot.customerId)||!Array.isArray(snapshot.participants)||snapshot.participants.some(p=>!/^TEST[-:]/.test(p.personId)))throw Error('Synthetic case identifiers required for sandbox projection');const encoded=encode(pack(snapshot,t));if(encoded.length>2400)throw Error('Sandbox summary exceeds verified connector readback limit; split per task');return {marker:marker(t),text:encoded,status:snapshot.tasks.every(x=>x.state==='completed')&&snapshot.tasks.length?'completed':snapshot.tasks.some(x=>x.state==='blocked')?'blocked':'open'};}
async function project({store,projectionId,target:input,transport,now}){
 const t=target(input);
 if(typeof transport?.read!=='function'||typeof transport?.write!=='function')throw Error('Read/write transport required');
 const row=store.tx(()=>{
  const r=store.get('SELECT * FROM ops_projection WHERE id=?',projectionId);if(!r)throw Error('Projection missing');
  if(r.state==='acked'){if(String(r.item_id)!==String(t.itemId))throw Error('Acknowledged projection target mismatch');return r;}
  if(r.state!=='pending')throw Error('Projection requires reconciliation');
  if(store.get("SELECT id FROM ops_projection WHERE case_id=? AND id!=? AND state IN ('reading','writing','unknown')",r.case_id,r.id))throw Error('Previous case projection requires reconciliation');
  if(store.get('SELECT version FROM ops_cases WHERE id=?',r.case_id).version!==r.version){store.run("UPDATE ops_projection SET state='superseded' WHERE id=?",projectionId);return {...r,state:'superseded'};}
  desired(JSON.parse(r.payload),t);
  store.run("UPDATE ops_projection SET state='reading',item_id=?,attempts=attempts+1 WHERE id=?",String(t.itemId),projectionId);
  return r;
 });
 if(['acked','superseded'].includes(row.state))return {status:row.state};
 const snapshot=JSON.parse(row.payload),expected=desired(snapshot,t);
 try{
  const before=await transport.read(t);owned(before,t);
  if(before.text){const p=JSON.parse(before.text);if(p.runId!==t.runId||p.schema!=='excellent-business-ops-v1'||p.synthetic!==true||p.hash!==hash(p.snapshot)||p.snapshot.caseId!==snapshot.caseId||p.snapshot.version>snapshot.version)throw Error('Remote version conflict');}
  store.run("UPDATE ops_projection SET state='writing' WHERE id=? AND state='reading'",projectionId);
  if(before.text!==expected.text)await transport.write(t,expected);
  const after=await transport.read(t);owned(after,t);
  if(after.text!==expected.text||after.status!==expected.status)throw Error('Readback mismatch');
  store.tx(()=>{store.run("UPDATE ops_projection SET state='acked',receipt=? WHERE id=?",hash(expected),projectionId);store.audit('monday_projection','verified',{projectionId,itemId:t.itemId,hash:hash(expected)},now);});
  return {status:'acked',itemId:t.itemId,hash:hash(expected)};
 }catch(error){store.run("UPDATE ops_projection SET state='unknown',error_code='remote_uncertain' WHERE id=?",projectionId);throw error;}
}
async function reconcileProjection({store,projectionId,target:input,transport,now}){
 const t=target(input),row=store.get('SELECT * FROM ops_projection WHERE id=?',projectionId);
 if(!row||!['unknown','reading','writing'].includes(row.state)||String(row.item_id)!==String(t.itemId))throw Error('Uncertain owned projection required');
 const expected=desired(JSON.parse(row.payload),t),after=await transport.read(t);owned(after,t);
 if(after.text!==expected.text||after.status!==expected.status)throw Error('Remote state differs; human resolution required');
 store.tx(()=>{store.run("UPDATE ops_projection SET state='acked',receipt=?,error_code=NULL WHERE id=?",hash(expected),projectionId);store.audit('monday_reconcile','verified_without_write',{projectionId,itemId:t.itemId},now);});
 return {status:'acked',writePerformed:false};
}
module.exports={target,marker,pack,desired,project,compact,reconcileProjection};
