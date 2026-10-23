// Isolated durable orchestration. No network transport and no production activation.
// Requires Node >=22.13 and a local SQLite filesystem supporting file locks.
const {DatabaseSync}=require('node:sqlite');
const {randomUUID,randomBytes,createHash}=require('node:crypto');
const fs=require('node:fs'),nodePath=require('node:path');
const {plan,validateCampaign}=require('./policy');
const feedback=require('./feedback');
const {summarize,attribution:normalizeAttribution}=require('./insights');
const CHANNELS=['whatsapp','email','sms'];
const STAGES=['questionnaire','monday_saved','reply','meeting_booked','meeting_cancelled','handed_off','paid','optout','competitor_chosen'];
const reasonCodes=['timing','price','value_unclear','response_time','fit','other_provider','not_relevant','other','prefer_not_say'];
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const encode=v=>JSON.stringify(canonical(v));
const hash=v=>createHash('sha256').update(encode(v)).digest('hex');
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(v);
const iso=v=>{if(typeof v!=='string'||!Number.isFinite(Date.parse(v)))throw Error('Invalid clock');return new Date(v).toISOString();};
const phone=v=>String(v||'').replace(/\D/g,'').replace(/^0/,'972');
const email=v=>String(v||'').trim().toLowerCase();
const fail=(reason,code='INVALID')=>{const e=Error(reason);e.code=code;throw e;};

class Store{
 constructor(path,{sandbox=false}={}){
  if(sandbox!==true)fail('Only explicitly isolated sandbox databases are supported');
  if(path!==':memory:'&&(typeof path!=='string'||!nodePath.isAbsolute(path)||!path.endsWith('.sqlite')))fail('Absolute .sqlite runtime path required; recovery staging files cannot be opened');
  if(path!==':memory:'&&!fs.existsSync(path)&&['-wal','-shm','-journal'].some(suffix=>fs.lstatSync(path+suffix,{throwIfNoEntry:false})))fail('Runtime path has existing SQLite sidecars');
  this.db=new DatabaseSync(path);
  try{
   this.db.exec('PRAGMA busy_timeout=10000; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
   const version=this.db.prepare('PRAGMA user_version').get().user_version;
   if(![0,1,2,3].includes(version))fail('Unsupported database schema');
   this.tx(()=>{
    this.db.exec(`
     CREATE TABLE IF NOT EXISTS subjects(
      id TEXT PRIMARY KEY, phone TEXT NOT NULL UNIQUE, email TEXT UNIQUE,
      stop_reason TEXT, stopped_at TEXT);
     CREATE TABLE IF NOT EXISTS enrollments(
      id TEXT PRIMARY KEY, subject_id TEXT NOT NULL REFERENCES subjects(id),
      campaign_id TEXT NOT NULL, started_at TEXT NOT NULL, consent TEXT NOT NULL,
      campaign TEXT NOT NULL, state TEXT NOT NULL DEFAULT '{}', attribution TEXT NOT NULL,
      UNIQUE(subject_id,campaign_id));
     CREATE TABLE IF NOT EXISTS inbox(
      id TEXT PRIMARY KEY, digest TEXT NOT NULL, result TEXT NOT NULL, received_at TEXT NOT NULL);
     CREATE TABLE IF NOT EXISTS events(
      seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
      enrollment_id TEXT NOT NULL REFERENCES enrollments(id), type TEXT NOT NULL,
      at TEXT NOT NULL, detail TEXT NOT NULL);
     CREATE TABLE IF NOT EXISTS projections(
      event_id TEXT PRIMARY KEY REFERENCES events(id), state TEXT NOT NULL DEFAULT 'queued',
      lease_until TEXT, token TEXT, attempts INTEGER NOT NULL DEFAULT 0,
      receipt TEXT, last_error TEXT);
     CREATE TABLE IF NOT EXISTS outbox(
      key TEXT PRIMARY KEY, subject_id TEXT NOT NULL REFERENCES subjects(id),
      enrollment_id TEXT NOT NULL REFERENCES enrollments(id), channel TEXT NOT NULL,
      milestone TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('queued','reserved','inflight','unknown','sent','failed','suppressed')),
      fence INTEGER NOT NULL DEFAULT 0, token TEXT, lease_until TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, attempted_at TEXT,
      receipt TEXT UNIQUE, note TEXT);
     CREATE UNIQUE INDEX IF NOT EXISTS one_unresolved_contact ON outbox(subject_id)
      WHERE state IN ('reserved','inflight','unknown');
     CREATE TABLE IF NOT EXISTS feedback(
      event_id TEXT PRIMARY KEY REFERENCES events(id), enrollment_id TEXT NOT NULL REFERENCES enrollments(id),
      at TEXT NOT NULL, answers TEXT NOT NULL);
     CREATE TABLE IF NOT EXISTS feedback_links(
      token_hash TEXT PRIMARY KEY, enrollment_id TEXT NOT NULL REFERENCES enrollments(id),
      csrf TEXT NOT NULL, expires_at TEXT NOT NULL);
     CREATE TABLE IF NOT EXISTS runtime_control(key TEXT PRIMARY KEY,value TEXT NOT NULL);
     PRAGMA user_version=3;
    `);
   });
  }catch(e){this.db.close();throw e;}
 }
 close(){this.db.close();}
 restorePending(){return this.get("SELECT value FROM runtime_control WHERE key='restore_pending'")?.value==='1';}
 tx(fn){this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 get(sql,...args){return this.db.prepare(sql).get(...args);}
 all(sql,...args){return this.db.prepare(sql).all(...args);}
 run(sql,...args){return this.db.prepare(sql).run(...args);}
 once(eventId,payload,now,fn){
  if(!id(eventId))fail('Invalid event id');
  const digest=hash(payload),previous=this.get('SELECT * FROM inbox WHERE id=?',eventId);
  if(previous){if(previous.digest!==digest)fail('Conflicting event replay','CONFLICT');return {...JSON.parse(previous.result),replayed:true};}
  const result=fn();
  this.run('INSERT INTO inbox VALUES(?,?,?,?)',eventId,digest,encode(result),now);
  return {...result,replayed:false};
 }
 event(eventId,enrollmentId,type,now,detail={}){
  this.run('INSERT INTO events(id,enrollment_id,type,at,detail) VALUES(?,?,?,?,?)',eventId,enrollmentId,type,now,encode(detail));
  this.run('INSERT INTO projections(event_id) VALUES(?)',eventId);
 }
 enrollment(enrollmentId){const row=this.get('SELECT * FROM enrollments WHERE id=?',enrollmentId);if(!row)fail('Unknown enrollment','NOT_FOUND');return row;}
 // Trusted adapter only: submitted addresses are contact-deduplication keys, not proof
 // of a person's identity. Different email/phone pairs are never silently merged.
 ingest({eventId,campaign,receipt,attribution={},enrolledAt=null,now}){
  const at=iso(now),start=enrolledAt===null?at:iso(enrolledAt),p=phone(receipt?.recipients?.phone),m=email(receipt?.recipients?.email);
  if(start>at||!id(campaign?.id)||receipt?.version!=='lifecycle-consent-v1'||receipt.campaignId!==campaign.id||iso(receipt.receivedAt)>start||!/^972\d{9}$/.test(p)||m&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m))fail('Invalid identity or campaign consent');
  if(!receipt.grants||CHANNELS.some(ch=>typeof receipt.grants[ch]!=='boolean')||Object.keys(receipt.grants).some(ch=>!CHANNELS.includes(ch))||receipt.grants.email&&!m)fail('Explicit channel grants required');
  if(Object.keys(attribution).some(k=>!['source','adSetId','adId'].includes(k))||Object.values(attribution).some(v=>typeof v!=='string'||v.length>160))fail('Invalid attribution');
  const safeAttribution=normalizeAttribution(attribution);
  if(Object.entries(attribution).some(([k,v])=>safeAttribution[k]!==v))fail('Only known sources and platform or synthetic ad identifiers are allowed');
  const consent={...receipt,receivedAt:iso(receipt.receivedAt),recipients:{phone:p,email:m||null}};
  // Validate configuration before persisting anything, including configurations with no consent.
  const invalid=validateCampaign(campaign,start);if(invalid)fail('Invalid campaign configuration: '+invalid);
  return this.tx(()=>this.once(eventId,{kind:'intake',campaign,receipt:consent,attribution,...(enrolledAt===null?{}:{enrolledAt:start})},at,()=>{
   const byPhone=this.get('SELECT * FROM subjects WHERE phone=?',p),byEmail=m?this.get('SELECT * FROM subjects WHERE email=?',m):null;
   if(byPhone&&byPhone.email!==(m||null)||byEmail&&byEmail.phone!==p)fail('Recipient alias conflict requires human verification','IDENTITY_CONFLICT');
   let subject=byPhone;
   if(!subject){const subjectId=randomUUID();this.run('INSERT INTO subjects(id,phone,email) VALUES(?,?,?)',subjectId,p,m||null);subject=this.get('SELECT * FROM subjects WHERE id=?',subjectId);}
   const existing=this.get('SELECT * FROM enrollments WHERE subject_id=? AND campaign_id=?',subject.id,campaign.id);
   // A repeated form may restrict consent, but never broaden it, renew the
   // horizon, replace the original receipt or undo global suppression.
   if(existing){
    const current=JSON.parse(existing.consent),withdrawn=CHANNELS.filter(ch=>current.grants[ch]===true&&consent.grants[ch]===false),requiresConsentReview=CHANNELS.some(ch=>current.grants[ch]!==true&&consent.grants[ch]===true);
    if(withdrawn.length){this.restrictConsent(existing,withdrawn,at);this.event(eventId,existing.id,'channel_withdrawal',at,{channels:withdrawn,sourceRequestId:consent.origin?.requestId||eventId});}
    return {subjectId:subject.id,enrollmentId:existing.id,existing:true,suppressed:!!subject.stop_reason,consentRestricted:withdrawn.length>0,requiresConsentReview};
   }
   const enrollmentId=randomUUID();
   this.run('INSERT INTO enrollments(id,subject_id,campaign_id,started_at,consent,campaign,attribution) VALUES(?,?,?,?,?,?,?)',enrollmentId,subject.id,campaign.id,start,encode(consent),encode(campaign),encode(attribution));
   this.event(eventId,enrollmentId,'entered',start,attribution);
   return {subjectId:subject.id,enrollmentId,existing:false,suppressed:!!subject.stop_reason};
  }));
 }
 stopSubject(subjectId,reason,at){
  // First stop is retained permanently. No method in this module clears it.
  this.run('UPDATE subjects SET stop_reason=COALESCE(stop_reason,?),stopped_at=COALESCE(stopped_at,?) WHERE id=?',reason,at,subjectId);
  this.run("UPDATE outbox SET state='suppressed',updated_at=?,note=? WHERE subject_id=? AND state IN ('queued','reserved')",at,reason,subjectId);
 }
 restrictConsent(enrollment,channels,at){
  const consent=JSON.parse(enrollment.consent);for(const ch of channels)consent.grants[ch]=false;
  this.run('UPDATE enrollments SET consent=? WHERE id=?',encode(consent),enrollment.id);
  this.run("UPDATE outbox SET state='suppressed',updated_at=?,note='channel_withdrawal' WHERE enrollment_id=? AND state IN ('queued','reserved')",at,enrollment.id);
  return consent.grants;
 }
 record({eventId,enrollmentId,type,referenceId=null,now}){
  if(!STAGES.includes(type))fail('Unsupported lifecycle event');
  if(['meeting_booked','meeting_cancelled'].includes(type)&&!id(referenceId))fail('Stable meeting reference required');
  const at=iso(now);
  return this.tx(()=>this.once(eventId,{enrollmentId,type,referenceId},at,()=>{
   const e=this.enrollment(enrollmentId);if(at<e.started_at)fail('Event precedes enrollment');
   const latest=this.get('SELECT MAX(at) AS at FROM events WHERE enrollment_id=?',enrollmentId).at;
   // Until source adapters provide authoritative versions, refuse stale state changes.
   // A late optout/paid/competitor signal still stops contact regardless of ordering.
   if(at<latest&&!['optout','competitor_chosen','paid'].includes(type))fail('Stale lifecycle event','STALE');
   const state=JSON.parse(e.state);
   if(['optout','competitor_chosen','paid'].includes(type))this.stopSubject(e.subject_id,type,at);
   if(type==='reply')state.incomingReplyPending=true;
   if(type==='handed_off')state.humanHandling=true;
   if(type==='meeting_booked'&&!(state.cancelledMeetingIds||[]).includes(referenceId))state.meetingIds=[...new Set([...(state.meetingIds||[]),referenceId])];
   if(type==='meeting_cancelled'){state.meetingIds=(state.meetingIds||[]).filter(value=>value!==referenceId);state.cancelledMeetingIds=[...new Set([...(state.cancelledMeetingIds||[]),referenceId])];}
   state.meetingIds=state.meetingIds||[];
   if(['meeting_booked','meeting_cancelled'].includes(type))state.meetingActive=state.meetingIds.length>0;
   // Cancellation does not clear a human handoff or unresolved incoming reply.
   this.run('UPDATE enrollments SET state=? WHERE id=?',encode(state),enrollmentId);
   if(['reply','handed_off'].includes(type)||type==='meeting_booked'&&state.meetingActive)this.run("UPDATE outbox SET state='suppressed',updated_at=?,note=? WHERE subject_id=? AND state IN ('queued','reserved')",at,type,e.subject_id);
   this.event(eventId,enrollmentId,type,at,referenceId?{referenceId}:{});
   return {enrollmentId,type,stored:true};
  }));
 }
 withdraw({eventId,enrollmentId,channels,now}){
  const at=iso(now);if(!Array.isArray(channels)||!channels.length||channels.some(ch=>!CHANNELS.includes(ch)))fail('Invalid withdrawal');
  return this.tx(()=>this.once(eventId,{enrollmentId,channels:[...new Set(channels)].sort()},at,()=>{
   const e=this.enrollment(enrollmentId);if(at<e.started_at)fail('Withdrawal precedes enrollment');
   const grants=this.restrictConsent(e,channels,at);
   this.event(eventId,enrollmentId,'channel_withdrawal',at,{channels});
   return {enrollmentId,grants};
  }));
 }
 saveFeedback({eventId,enrollmentId,answers,now}){
  const at=iso(now),validated=feedback.validate(answers);
  return this.tx(()=>this.once(eventId,{enrollmentId,answers:validated.answers},at,()=>{
   const e=this.enrollment(enrollmentId);if(at<e.started_at)fail('Feedback precedes enrollment');
   if(validated.stopCommercialFollowup)this.stopSubject(e.subject_id,'competitor_chosen',at);
   const index=feedback.questions[0].options.indexOf(validated.answers.reason),detail=index<0?{}:{reasonCode:reasonCodes[index]};
   if(validated.stopCommercialFollowup)this.event(eventId+'-stop',enrollmentId,'competitor_chosen',at);
   this.event(eventId,enrollmentId,'exit_feedback',at,detail);
   this.run('INSERT INTO feedback VALUES(?,?,?,?)',eventId,enrollmentId,at,encode(validated));
   return {stored:true,marketingConsentGranted:false,reEnrollmentAllowed:false};
  }));
 }
 issueFeedbackLink({enrollmentId,now,expiresInMs=86400000}){
  const at=iso(now);if(!Number.isInteger(expiresInMs)||expiresInMs<1000||expiresInMs>7*86400000)fail('Invalid feedback link lifetime');
  const token=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex'),expiresAt=new Date(Date.parse(at)+expiresInMs).toISOString();
  return this.tx(()=>{this.enrollment(enrollmentId);this.run('INSERT INTO feedback_links VALUES(?,?,?,?)',hash(token),enrollmentId,csrf,expiresAt);return {token,expiresAt};});
 }
 feedbackLink(token,now){
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))fail('Unknown feedback link','NOT_FOUND');
  const row=this.get('SELECT * FROM feedback_links WHERE token_hash=?',hash(token));if(!row)fail('Unknown feedback link','NOT_FOUND');
  if(row.expires_at<=iso(now))fail('Expired feedback link','EXPIRED');
  return row;
 }
 recover(at){
  this.run("UPDATE outbox SET state='queued',token=NULL,lease_until=NULL,updated_at=?,note='expired_before_dispatch' WHERE state='reserved' AND lease_until<=?",at,at);
  // An external request might already have succeeded. Never automatically retry it.
  this.run("UPDATE outbox SET state='unknown',updated_at=?,note='worker_lost_after_dispatch_started' WHERE state='inflight' AND lease_until<=?",at,at);
 }
 preview(enrollmentId,at,excludeKey=null){
  const e=this.enrollment(enrollmentId),s=this.get('SELECT * FROM subjects WHERE id=?',e.subject_id),state=JSON.parse(e.state);
  const related=this.all('SELECT state FROM enrollments WHERE subject_id=?',s.id).map(r=>JSON.parse(r.state));
  for(const flag of ['humanHandling','meetingActive','incomingReplyPending'])state[flag]=related.some(x=>x[flag]===true);
  const entries=this.all("SELECT * FROM outbox WHERE subject_id=? AND state!='queued'",s.id).filter(r=>r.key!==excludeKey).map(r=>({key:r.key,status:r.state==='inflight'?'unknown':r.state,at:r.updated_at}));
  const stop=s.stop_reason?{globalOptOutAt:s.stopped_at}:{};
  return plan({lead:{id:s.id,phone:s.phone,email:s.email,enrolledAt:e.started_at,consent:JSON.parse(e.consent),...state,...stop},campaign:JSON.parse(e.campaign),ledger:{complete:true,subjectId:s.id,entries},now:at});
 }
 reserve({enrollmentId,workerId,now,leaseMs=60000}){
  const at=iso(now);if(!id(workerId)||!Number.isInteger(leaseMs)||leaseMs<1000||leaseMs>300000)fail('Invalid worker lease');
  return this.tx(()=>{
   if(this.restorePending())return {status:'BLOCKED',reason:'restore_reconciliation_required',dispatchEnabled:false};
   this.recover(at);
   const draft=this.preview(enrollmentId,at);if(draft.status!=='DRAFT')return draft;
   const e=this.enrollment(enrollmentId),token=randomUUID(),until=new Date(Date.parse(at)+leaseMs).toISOString();
   this.run("INSERT INTO outbox(key,subject_id,enrollment_id,channel,milestone,state,created_at,updated_at) VALUES(?,?,?,?,?,'queued',?,?) ON CONFLICT(key) DO NOTHING",draft.key,e.subject_id,enrollmentId,draft.channel,draft.milestone,at,at);
   const row=this.get('SELECT * FROM outbox WHERE key=?',draft.key);if(row.state!=='queued')fail('Outbox state conflict','CONFLICT');
   this.run("UPDATE outbox SET state='reserved',channel=?,token=?,fence=fence+1,lease_until=?,updated_at=?,note=? WHERE key=?",draft.channel,token,until,at,'worker:'+workerId,draft.key);
   return {...draft,status:'RESERVED',dispatchEnabled:false,token,fence:row.fence+1,leaseUntil:until};
  });
 }
 owned(key,token,fence){const r=this.get('SELECT * FROM outbox WHERE key=? AND token=? AND fence=?',key,token,fence);if(!r)fail('Stale reservation','STALE');return r;}
 beginDispatch({key,token,fence,now}){
  const at=iso(now);
  return this.tx(()=>{
   if(this.restorePending())fail('Restored database requires reconciliation','RESTORE_PENDING');
   const r=this.owned(key,token,fence);if(r.state!=='reserved'||r.lease_until<=at)fail('Reservation expired or revoked','STALE');
   const draft=this.preview(r.enrollment_id,at,key);
   if(draft.status!=='DRAFT'||draft.key!==key||draft.channel!==r.channel){this.run("UPDATE outbox SET state='suppressed',updated_at=?,note=? WHERE key=?",at,'preflight:'+draft.reason,key);return {status:'STOP',reason:draft.reason,dispatchEnabled:false};}
   this.run("UPDATE outbox SET state='inflight',attempted_at=?,updated_at=?,lease_until=? WHERE key=?",at,at,new Date(Date.parse(at)+60000).toISOString(),key);
   return {status:'INFLIGHT',key,token,fence,channel:r.channel,dispatchEnabled:false};
  });
 }
 settle({key,token,fence,outcome,receipt=null,now}){
  const at=iso(now);if(!['sent','unknown','failed'].includes(outcome)||outcome==='sent'&&(typeof receipt!=='string'||!receipt.trim()||receipt.length>200))fail('Confirmed receipt required for sent');
  return this.tx(()=>{
   const r=this.owned(key,token,fence);if(!['inflight','unknown'].includes(r.state))fail('Attempt is not unresolved','STALE');
   if(at<r.attempted_at)fail('Acknowledgement precedes attempt');
   // 'failed' must mean confirmed not accepted by the provider. Timeout means unknown.
   this.run('UPDATE outbox SET state=?,receipt=?,updated_at=?,note=? WHERE key=?',outcome,outcome==='sent'?receipt:null,at,'sandbox_outcome:'+outcome,key);
   return {status:outcome.toUpperCase(),dispatchEnabled:false};
  });
 }
 claimProjection({workerId,now,leaseMs=60000}){
  const at=iso(now);if(!id(workerId)||!Number.isInteger(leaseMs)||leaseMs<1000||leaseMs>300000)fail('Invalid projection lease');
  return this.tx(()=>{
   if(this.restorePending())return null;
   // A remote write may have committed even if the worker disappeared. Never
   // reclaim inflight/unknown writes as a fresh attempt after lease expiration.
   this.run("UPDATE projections SET state='unknown',last_error='expired_remote_write' WHERE state='inflight' AND lease_until<=?",at);
   const row=this.get("SELECT p.*,e.seq,e.enrollment_id,e.type,e.at,e.detail FROM projections p JOIN events e ON e.id=p.event_id WHERE (p.state='queued' OR (p.state='reserved' AND p.lease_until<=?)) AND NOT EXISTS (SELECT 1 FROM events prior JOIN projections pp ON pp.event_id=prior.id WHERE prior.enrollment_id=e.enrollment_id AND prior.seq<e.seq AND pp.state!='acked') ORDER BY e.seq LIMIT 1",at);
   if(!row)return null;
   // Per-enrollment ordering: a later update must not overtake an unresolved one.
   if(this.get("SELECT 1 FROM projections p JOIN events e ON e.id=p.event_id WHERE e.enrollment_id=? AND e.seq<? AND p.state!='acked'",row.enrollment_id,row.seq))return null;
   const token=randomUUID();this.run("UPDATE projections SET state='reserved',token=?,lease_until=?,attempts=attempts+1 WHERE event_id=?",token,new Date(Date.parse(at)+leaseMs).toISOString(),row.event_id);
   return {eventId:row.event_id,enrollmentId:row.enrollment_id,seq:row.seq,type:row.type,at:row.at,detail:JSON.parse(row.detail),token,attempts:row.attempts+1,requiresRemoteIdempotency:true};
  });
 }
 beginProjection({eventId,token,binding,payloadHash,payload=null,frontier=null,subjectFrontier=null,now}){
  const at=iso(now);if(typeof binding!=='string'||binding.length>200||!binding||! /^[a-f0-9]{64}$/.test(payloadHash||''))fail('CRM target binding and payload hash required');
  return this.tx(()=>{
   if(this.restorePending())fail('Restored database requires reconciliation','RESTORE_PENDING');
   const row=this.get("SELECT p.*,e.enrollment_id FROM projections p JOIN events e ON e.id=p.event_id WHERE event_id=? AND token=?",eventId,token);
   if(!row||row.state!=='reserved'||row.lease_until<=at)fail('Stale projection lease','STALE');
   if(frontier!==null&&this.get('SELECT MAX(seq) AS seq FROM events WHERE enrollment_id=?',row.enrollment_id).seq!==frontier)fail('CRM frame changed before write','STALE');
   if(subjectFrontier!==null&&this.get('SELECT MAX(events.seq) AS seq FROM events JOIN enrollments ON enrollments.id=events.enrollment_id WHERE subject_id=?',this.enrollment(row.enrollment_id).subject_id).seq!==subjectFrontier)fail('CRM subject frame changed before write','STALE');
   const enrollmentKey='crm_enrollment:'+row.enrollment_id,targetKey='crm_target:'+binding;
   const pinned=this.get('SELECT value FROM runtime_control WHERE key=?',enrollmentKey),owner=this.get('SELECT value FROM runtime_control WHERE key=?',targetKey);
   if(pinned&&pinned.value!==binding||owner&&owner.value!==row.enrollment_id)fail('CRM target already bound','IDENTITY_CONFLICT');
   this.run('INSERT OR IGNORE INTO runtime_control VALUES(?,?)',enrollmentKey,binding);this.run('INSERT OR IGNORE INTO runtime_control VALUES(?,?)',targetKey,row.enrollment_id);
   if(payload!==null&&(typeof payload!=='string'||payload.length>60000))fail('Invalid CRM reconciliation frame');
   this.run('INSERT INTO runtime_control VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value','crm_payload:'+eventId,payloadHash);
   if(payload!==null)this.run('INSERT INTO runtime_control VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value','crm_frame:'+eventId,payload);
   this.run("UPDATE projections SET state='inflight' WHERE event_id=?",eventId);return {started:true};
  });
 }
 unknownProjection({eventId,token}){
  return this.tx(()=>{const r=this.get('SELECT * FROM projections WHERE event_id=? AND token=?',eventId,token);if(!r||!['inflight','unknown'].includes(r.state))fail('Stale projection attempt','STALE');this.run("UPDATE projections SET state='unknown',last_error='unverified_remote_result' WHERE event_id=?",eventId);return {status:'UNKNOWN'};});
 }
 acknowledgeProjection({eventId,token,receipt,now}){
  const at=iso(now);if(typeof receipt!=='string'||!receipt.trim()||receipt.length>200)fail('CRM acknowledgement required');
  return this.tx(()=>{
   if(this.restorePending())fail('Restored database requires reconciliation','RESTORE_PENDING');
   const row=this.get('SELECT * FROM projections WHERE event_id=? AND token=?',eventId,token);
   if(!row||row.state!=='inflight'||row.lease_until<=at)fail('Stale projection lease','STALE');
   this.run("UPDATE projections SET state='acked',receipt=?,lease_until=NULL WHERE event_id=?",receipt,eventId);
   return {acked:true};
  });
 }
 insights(){
  const known=new Set(['entered',...STAGES,'exit_feedback']);
  const events=this.all('SELECT * FROM events ORDER BY seq').filter(e=>known.has(e.type)).map(e=>({id:e.id,leadId:e.enrollment_id,type:e.type,at:e.at,...JSON.parse(e.detail),...(e.type==='entered'?{campaignId:this.enrollment(e.enrollment_id).campaign_id}:{})}));
  return summarize({complete:true,events});
 }
 snapshot(){return {subjects:this.all('SELECT * FROM subjects'),enrollments:this.all('SELECT * FROM enrollments'),outbox:this.all('SELECT * FROM outbox'),feedback:this.all('SELECT * FROM feedback'),events:this.all('SELECT * FROM events ORDER BY seq'),projections:this.all('SELECT * FROM projections')};}
}
module.exports={Store};
