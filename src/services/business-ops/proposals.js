'use strict';
// Untrusted model/source suggestions are durable drafts, never executable tasks.
const {hash,encode,kinds}=require('./store');
const stamp=v=>{if(typeof v!=='string'||!Number.isFinite(Date.parse(v)))throw Error('ISO time required');return new Date(v).toISOString();};
class ProposalQueue{
 constructor(store){this.store=store;store.db.exec(`CREATE TABLE IF NOT EXISTS ops_proposals(
  id TEXT PRIMARY KEY,event_key TEXT NOT NULL REFERENCES ops_events(event_key),observations TEXT NOT NULL,
  state TEXT NOT NULL,proposed_at TEXT NOT NULL,decision_digest TEXT,receipt TEXT);
  CREATE INDEX IF NOT EXISTS ops_proposals_state ON ops_proposals(state,proposed_at);`);}
 propose(eventKey,observations,{actor,now}){
  if(typeof eventKey!=='string'||!Array.isArray(observations)||!observations.length||observations.length>50||Buffer.byteLength(encode(observations))>65536)throw Error('Bounded observation proposals required');
  const store=this.store,id=hash([eventKey,observations]);
  return store.tx(()=>{
   const old=store.get('SELECT * FROM ops_proposals WHERE id=?',id);if(old)return {id,state:old.state,duplicate:true,reviewRequired:true};
   const row=store.get('SELECT * FROM ops_events WHERE event_key=?',eventKey);if(!row||row.reviewed_at)throw Error('Unreviewed source event required');
   const event=JSON.parse(row.payload);
   for(const o of observations){
    if(!o||!kinds.includes(o.kind)||o.kind==='evidence'||typeof o.quote!=='string'||!o.quote.trim()||!event.text.includes(o.quote))throw Error('Exact source quote and non-evidence proposal required');
    // Artifact verification requires a separate human-reviewed receipt through
    // the existing review API; an accepted draft cannot certify a document.
    if(['verified','verifiedBy','authorization','actor','token'].some(k=>Object.hasOwn(o,k)))throw Error('Proposal cannot grant authority');
   }
   store.run("INSERT INTO ops_proposals(id,event_key,observations,state,proposed_at) VALUES(?,?,?,'pending',?)",id,eventKey,encode(observations),stamp(now));
   store.audit(actor,'proposal_created',{proposalId:id,eventKey},now);
   return {id,state:'pending',duplicate:false,reviewRequired:true};
  });
 }
 pending({limit=10}={}){
  if(!Number.isInteger(limit)||limit<1||limit>50)throw Error('Bounded queue limit required');
  return this.store.all("SELECT p.*,e.case_id,e.resolution,e.payload,e.source,e.occurred_at FROM ops_proposals p JOIN ops_events e ON e.event_key=p.event_key WHERE p.state='pending' ORDER BY p.proposed_at,p.id LIMIT ?",limit).map(r=>{
   const event=JSON.parse(r.payload);return {id:r.id,eventKey:r.event_key,caseId:r.case_id,needsIdentityReview:!r.case_id,resolution:JSON.parse(r.resolution),observations:JSON.parse(r.observations),
    source:{kind:r.source,occurredAt:r.occurred_at,url:event.url,text:event.text},proposedAt:r.proposed_at,reviewRequired:true,dispatchEnabled:false};
  });
 }
 decide(proposalId,{decision,reason,actor,now}){
  if(!['accept','reject'].includes(decision)||typeof reason!=='string'||!reason.trim()||reason.length>1000)throw Error('Explicit review decision and reason required');
  const store=this.store,digest=hash([decision,reason,actor]);
  return store.tx(()=>{
   const row=store.get('SELECT * FROM ops_proposals WHERE id=?',proposalId);if(!row)throw Error('Proposal not found');
   if(row.state!=='pending'){if(row.decision_digest!==digest||!row.receipt)throw Error('Proposal decision conflict');return {...JSON.parse(row.receipt),duplicate:true};}
   let reviewed;
   if(decision==='accept')reviewed=store.review(row.event_key,JSON.parse(row.observations),{actor,now});
   const receipt={proposalId,decision,state:decision==='accept'?'accepted':'rejected',eventKey:row.event_key,
    caseId:reviewed?.snapshot.caseId||null,caseVersion:reviewed?.snapshot.version||null,taskIds:reviewed?.snapshot.tasks.map(t=>t.id)||[],dispatchEnabled:false};
   store.run('UPDATE ops_proposals SET state=?,decision_digest=?,receipt=? WHERE id=?',receipt.state,digest,encode(receipt),proposalId);
   if(reviewed)store.run("UPDATE ops_proposals SET state='superseded' WHERE event_key=? AND id!=? AND state='pending'",row.event_key,proposalId);
   store.audit(actor,'proposal_decided',{proposalId,decision,reason,caseVersion:receipt.caseVersion},now);
   return {...receipt,duplicate:false};
  });
 }
 metrics(){return Object.fromEntries(this.store.all('SELECT state,COUNT(*) n FROM ops_proposals GROUP BY state').map(r=>[r.state,r.n]));}
}
module.exports={ProposalQueue};
