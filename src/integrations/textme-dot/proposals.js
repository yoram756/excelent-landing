'use strict';
// Local preparation/control library. No HTTP transport or live-send function.
// Reuse an approved existing SQLite connection when integrating; do not open
// another customer database or change the n8n internal database directly.
const {createHash,randomUUID}=require('node:crypto');
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function prepareSms(input) {
  const allowed=['recipient','sender','message','purpose','consentReference','maxCostIls','quoteReference'];
  if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(k=>!allowed.includes(k))) throw Error('UNEXPECTED_FIELD');
  const {recipient,sender,message,purpose,consentReference,maxCostIls,quoteReference}=input;
  if(typeof recipient!=='string'||!/^05\d{8}$/.test(recipient)) throw Error('ONE_ISRAELI_MOBILE_REQUIRED');
  if(typeof sender!=='string'||!/^[A-Za-z0-9]{1,11}$/.test(sender)) throw Error('SENDER_REQUIRED');
  if(typeof message!=='string'||!message.trim()||Array.from(message).length>1005) throw Error('MESSAGE_REQUIRED');
  if(!['service','marketing'].includes(purpose)||typeof consentReference!=='string'||!consentReference.trim()||consentReference.length>200) throw Error('CONSENT_EVIDENCE_REQUIRED');
  if(!Number.isFinite(maxCostIls)||maxCostIls<=0||maxCostIls>100||typeof quoteReference!=='string'||!quoteReference.trim()||quoteReference.length>200) throw Error('CURRENT_QUOTE_AND_BUDGET_REQUIRED');
  // Segment counts/prices are not inferred from character count. TextMe account
  // quote, verified sender and consent must be checked again before approval.
  const proposal={recipient,sender,message,purpose,consentReference,maxCostIls,quoteReference,count:1,channel:'sms',schedule:null};
  return {proposal,digest:digest(proposal),state:'PREPARED',executable:false,requires:['verified_sender','current_quote','global_opt_out','account_hours','owner_approval','secure_execution_identity']};
}

class ProposalLedger {
  constructor(db){
    this.db=db;
    db.exec(`CREATE TABLE IF NOT EXISTS textme_dot_proposals (
      id TEXT PRIMARY KEY, digest TEXT NOT NULL, proposal_json TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('PREPARED','APPROVED','CLAIMED','ACCEPTED','REJECTED','UNKNOWN','DELIVERED','FAILED')),
      expires_at INTEGER NOT NULL, approver TEXT, approved_at INTEGER,
      provider_id TEXT, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS textme_dot_audit (
      id INTEGER PRIMARY KEY, proposal_id TEXT NOT NULL, action TEXT NOT NULL, at INTEGER NOT NULL);`);
  }
  save(prepared,{now=Date.now(),ttlMs=900000}={}){
    if(!Number.isSafeInteger(now)||!Number.isSafeInteger(ttlMs)||ttlMs<1||ttlMs>3600000)throw Error('INVALID_TTL');
    const checked=prepareSms(prepared?.proposal ? Object.fromEntries(Object.entries(prepared.proposal).filter(([k])=>!['count','channel','schedule'].includes(k))) : null);
    if(checked.digest!==prepared.digest)throw Error('PROPOSAL_CHANGED');
    const id=randomUUID();
    this.db.prepare('INSERT INTO textme_dot_proposals VALUES(?,?,?,?,?,NULL,NULL,NULL,?)').run(id,checked.digest,JSON.stringify(checked.proposal),'PREPARED',now+ttlMs,now);
    this.audit(id,'prepared',now);return {id,digest:checked.digest,expiresAt:now+ttlMs,state:'PREPARED'};
  }
  audit(id,action,now){this.db.prepare('INSERT INTO textme_dot_audit(proposal_id,action,at) VALUES(?,?,?)').run(id,action,now);}
  approve(id,hash,principal,{now=Date.now()}={}){
    // Principal must come from a trusted separate human approval ingress, never
    // a dot/model tool argument. No public approve endpoint is supplied here.
    if(principal?.kind!=='verified-human'||principal?.role!=='owner'||typeof principal.subject!=='string'||!principal.subject)throw Error('VERIFIED_OWNER_REQUIRED');
    const r=this.db.prepare("UPDATE textme_dot_proposals SET state='APPROVED',approver=?,approved_at=? WHERE id=? AND digest=? AND state='PREPARED' AND expires_at>?").run(principal.subject,now,id,hash,now);
    if(r.changes!==1)throw Error('APPROVAL_REJECTED');this.audit(id,'approved',now);
  }
  claim(id,hash,{now=Date.now(),liveEnabled=false,preflight}={}){
    if(liveEnabled!==true)throw Error('LIVE_DISABLED');
    // This method only reserves; this package cannot send. Wiring a transport
    // remains a separate owner-approved deployment, not a dot-settable flag.
    const checks=['verifiedSender','quoteWithinBudget','consentCurrent','notOptedOut','withinAccountHours','recipientUnchanged'];
    if(checks.some(k=>preflight?.[k]!==true))throw Error('PREFLIGHT_FAILED');
    const r=this.db.prepare("UPDATE textme_dot_proposals SET state='CLAIMED' WHERE id=? AND digest=? AND state='APPROVED' AND expires_at>?").run(id,hash,now);
    if(r.changes!==1)throw Error('ALREADY_CLAIMED_OR_NOT_APPROVED');
    this.audit(id,'claimed',now);return {id,idempotencyKey:'textme-dot:'+id};
  }
  record(id,result,{now=Date.now()}={}){
    const states=['ACCEPTED','REJECTED','UNKNOWN'];
    if(!states.includes(result?.state))throw Error('INVALID_SEND_RESULT');
    if(result.state==='ACCEPTED'&&(typeof result.providerId!=='string'||!result.providerId))throw Error('PROVIDER_ID_REQUIRED');
    const r=this.db.prepare("UPDATE textme_dot_proposals SET state=?,provider_id=? WHERE id=? AND state='CLAIMED'").run(result.state,result.providerId||null,id);
    if(r.changes!==1)throw Error('INVALID_TRANSITION');this.audit(id,result.state,now);
  }
  reconcile(id,{providerId,delivered,failed},{now=Date.now()}={}){
    if(typeof providerId!=='string'||!providerId||typeof delivered!=='boolean'||typeof failed!=='boolean'||delivered===failed)throw Error('DEFINITIVE_DLR_REQUIRED');
    const r=this.db.prepare("UPDATE textme_dot_proposals SET state=?,provider_id=? WHERE id=? AND state IN ('ACCEPTED','UNKNOWN') AND (provider_id IS NULL OR provider_id=?)").run(delivered?'DELIVERED':'FAILED',providerId,id,providerId);
    if(r.changes!==1)throw Error('INVALID_RECONCILIATION');this.audit(id,delivered?'DELIVERED':'FAILED',now);
  }
  get(id){return this.db.prepare('SELECT id,digest,state,expires_at,approver,provider_id FROM textme_dot_proposals WHERE id=?').get(id);}
}
module.exports={prepareSms,ProposalLedger,digest};
