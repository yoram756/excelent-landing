'use strict';
// Operational event ledger. No message sender and no remote credentials.
// A model proposes observations; only a separately authenticated reviewer applies them.
const {DatabaseSync}=require('node:sqlite');
const {createHash}=require('node:crypto');
const path=require('node:path');
const {norm}=require('../lifecycle/db');
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const encode=v=>JSON.stringify(canonical(v));
const hash=v=>createHash('sha256').update(encode(v)).digest('hex');
const stamp=v=>{if(typeof v!=='string'||!Number.isFinite(Date.parse(v)))throw Error('ISO time required');return new Date(v).toISOString();};
const id=v=>{if(typeof v!=='string'||! /^[\w.:/-]{1,180}$/.test(v))throw Error('Invalid identifier');return v;};
const text=(v,max=4000)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw Error('Invalid text');return v.trim();};
const email=v=>{const s=String(v||'').trim().toLowerCase();return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)?s:'';};
const sourceTypes=['transkriptor','gmail','whatsapp','calendar','drive','manual'];
const states=['not_started','in_progress','waiting_customer','waiting_external','blocked','completed'];
const kinds=['fact','request','proposal','assessment','decision','question','waiting','information','task','reply','evidence'];
const evidenceKinds=['document_received','document_validated','agreement_signed','approval_received','payment_received','action_verified'];
function sourceUrl(v){const u=new URL(v);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Error('Source URL must have no credentials');for(const key of u.searchParams.keys())if(!['authuser','usp'].includes(key))throw Error('Source URL has an unapproved query field');if(u.hash&&!/^#(?:all|inbox|sent)\/[a-f0-9]+$/i.test(u.hash))throw Error('Source URL has an unapproved fragment');return u.href;}

class OperationsStore{
 constructor(file){
  if(file!==':memory:'&&(!path.isAbsolute(file)||!file.endsWith('.sqlite')))throw Error('Absolute .sqlite path required');
  this.db=new DatabaseSync(file);
  this.db.exec(`PRAGMA busy_timeout=10000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
   CREATE TABLE IF NOT EXISTS ops_people(id TEXT PRIMARY KEY, phones TEXT NOT NULL, emails TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS ops_cases(id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, goal TEXT NOT NULL, stage TEXT NOT NULL, participants TEXT NOT NULL, link TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE IF NOT EXISTS ops_events(seq INTEGER PRIMARY KEY AUTOINCREMENT, event_key TEXT UNIQUE NOT NULL, digest TEXT NOT NULL, source TEXT NOT NULL, source_id TEXT NOT NULL, occurred_at TEXT NOT NULL, received_at TEXT NOT NULL, case_id TEXT REFERENCES ops_cases(id), resolution TEXT NOT NULL, payload TEXT NOT NULL, reviewed_at TEXT, review_digest TEXT);
   CREATE TABLE IF NOT EXISTS ops_observations(id INTEGER PRIMARY KEY AUTOINCREMENT, event_key TEXT NOT NULL REFERENCES ops_events(event_key), kind TEXT NOT NULL, payload TEXT NOT NULL, supersedes INTEGER REFERENCES ops_observations(id));
   CREATE TABLE IF NOT EXISTS ops_tasks(id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES ops_cases(id), commitment_key TEXT NOT NULL, state TEXT NOT NULL, payload TEXT NOT NULL, version INTEGER NOT NULL, UNIQUE(case_id,commitment_key));
   CREATE TABLE IF NOT EXISTS ops_evidence(id TEXT PRIMARY KEY, event_key TEXT NOT NULL REFERENCES ops_events(event_key), case_id TEXT NOT NULL, task_id TEXT NOT NULL REFERENCES ops_tasks(id), kind TEXT NOT NULL, artifact_id TEXT NOT NULL, digest TEXT NOT NULL, verified_by TEXT NOT NULL, at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS ops_drafts(id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES ops_cases(id), task_id TEXT, version INTEGER NOT NULL, state TEXT NOT NULL, payload TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS ops_projection(id TEXT PRIMARY KEY, case_id TEXT NOT NULL, version INTEGER NOT NULL, state TEXT NOT NULL, item_id TEXT, payload TEXT NOT NULL, receipt TEXT, attempts INTEGER NOT NULL DEFAULT 0, next_at TEXT, error_code TEXT);
   CREATE TABLE IF NOT EXISTS ops_sources(source TEXT PRIMARY KEY,last_seen TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS ops_digests(id TEXT PRIMARY KEY,owner TEXT NOT NULL,case_id TEXT NOT NULL,digest TEXT NOT NULL,at TEXT NOT NULL,payload TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS ops_audit(seq INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS ops_events_case ON ops_events(case_id,seq);
  `);
 }
 get(sql,...args){return this.db.prepare(sql).get(...args);}
 all(sql,...args){return this.db.prepare(sql).all(...args);}
 run(sql,...args){return this.db.prepare(sql).run(...args);}
 tx(fn){this.db.exec('BEGIN IMMEDIATE');try{const r=fn();this.db.exec('COMMIT');return r;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 audit(actor,action,detail,at){this.run('INSERT INTO ops_audit(at,actor,action,detail) VALUES(?,?,?,?)',stamp(at),id(actor),action,encode(detail));}
 registerPerson(p){id(p.id);const phones=(p.phones||[]).map(norm),emails=(p.emails||[]).map(email);if(phones.some(x=>!x)||emails.some(x=>!x))throw Error('Invalid contact identifier');this.run('INSERT INTO ops_people VALUES(?,?,?)',p.id,encode(phones),encode(emails));}
 registerCase(c){
  id(c.id);id(c.customerId);text(c.goal);text(c.stage,200);
  if(!Array.isArray(c.participants)||!c.participants.length||c.participants.some(p=>!this.get('SELECT id FROM ops_people WHERE id=?',p.personId)||!['client','spouse','banker','lawyer','appraiser'].includes(p.role)))throw Error('Verified participants required');
  this.run('INSERT INTO ops_cases(id,customer_id,goal,stage,participants,link) VALUES(?,?,?,?,?,?)',c.id,c.customerId,c.goal,c.stage,encode(c.participants),sourceUrl(c.link));
 }
 resolve(e){
  const sets=[];
  if(e.customerId){id(e.customerId);sets.push(this.all('SELECT id FROM ops_cases WHERE customer_id=?',e.customerId).map(c=>c.id));}
  if(e.personId){id(e.personId);if(!this.get('SELECT id FROM ops_people WHERE id=?',e.personId))return {status:'review',reason:'unknown_person'};sets.push(this.all('SELECT id,participants FROM ops_cases').filter(c=>JSON.parse(c.participants).some(p=>p.personId===e.personId)).map(c=>c.id));}
  for(const [kind,value,normalizer]of [['phones',e.phone,norm],['emails',e.email,email]]){
   if(value==null)continue;
   const normalized=normalizer(value);if(!normalized)return {status:'review',reason:'invalid_identifier'};
   const people=this.all('SELECT * FROM ops_people').filter(p=>JSON.parse(p[kind]).includes(normalized));
   if(!people.length)return {status:'review',reason:'unknown_contact'};
   const personIds=new Set(people.map(p=>p.id));
   sets.push(this.all('SELECT id,participants FROM ops_cases').filter(c=>JSON.parse(c.participants).some(p=>personIds.has(p.personId))).map(c=>c.id));
  }
  if(e.caseId){id(e.caseId);if(!this.get('SELECT id FROM ops_cases WHERE id=?',e.caseId))return {status:'review',reason:'unknown_case'};if(sets.some(s=>!s.includes(e.caseId)))return {status:'review',reason:'conflicting_identifiers'};return {status:'linked',caseId:e.caseId};}
  if(!sets.length)return {status:'review',reason:'identifier_required'};
  const candidates=sets.reduce((a,b)=>a.filter(x=>b.includes(x)));
  return candidates.length===1?{status:'linked',caseId:candidates[0]}:{status:'review',reason:candidates.length?'multiple_cases':'conflicting_identifiers'};
 }
 ingest(input,{now}){
  const e=structuredClone(input);id(e.id);if(!sourceTypes.includes(e.source))throw Error('Unknown source');
  stamp(e.occurredAt);stamp(now);sourceUrl(e.url);text(e.text,32000);
  if(e.scope!=='business')throw Error('Business scope required; private/school content excluded');
  if(Date.parse(e.occurredAt)>Date.parse(now)+300000)throw Error('Future event clock');
  const key=e.source+':'+e.id,digest=hash(e);
  return this.tx(()=>{
   const old=this.get('SELECT * FROM ops_events WHERE event_key=?',key);
   if(old){if(old.digest!==digest)throw Error('Event replay conflict');return {eventKey:key,duplicate:true,resolution:JSON.parse(old.resolution)};}
   const resolution=this.resolve(e);
   this.run('INSERT INTO ops_events(event_key,digest,source,source_id,occurred_at,received_at,case_id,resolution,payload) VALUES(?,?,?,?,?,?,?,?,?)',key,digest,e.source,e.id,stamp(e.occurredAt),stamp(now),resolution.caseId||null,encode(resolution),encode(e));
   this.run('INSERT INTO ops_sources VALUES(?,?) ON CONFLICT(source) DO UPDATE SET last_seen=excluded.last_seen',e.source,stamp(now));
   this.audit('ingest','event_received',{eventKey:key,resolution},now);
   return {eventKey:key,duplicate:false,resolution};
  });
 }
 resolveEvent(eventKey,{caseId,actor,reason,now}){
  return this.tx(()=>{const row=this.get('SELECT * FROM ops_events WHERE event_key=?',eventKey);if(!row||row.reviewed_at)throw Error('Unreviewed event required');if(!this.get('SELECT id FROM ops_cases WHERE id=?',caseId))throw Error('Known case required');text(reason,1000);const resolution={status:'linked',caseId,method:'human_review',reason};this.run('UPDATE ops_events SET case_id=?,resolution=? WHERE event_key=?',caseId,encode(resolution),eventKey);this.audit(actor,'identity_resolved',{eventKey,before:JSON.parse(row.resolution),after:resolution},now);return resolution;});
 }
 // Review is a distinct trust boundary. Never take reviewer identity from a source event/model output.
 review(eventKey,observations,{actor,now}){
  id(actor);stamp(now);if(!Array.isArray(observations)||observations.length>50)throw Error('Observation array required');
  return this.tx(()=>{
   const row=this.get('SELECT * FROM ops_events WHERE event_key=?',eventKey);if(!row||!row.case_id)throw Error('Resolve case before review');
   const digest=hash(observations);if(row.reviewed_at){if(row.review_digest!==digest)throw Error('Reviewed event conflict; add a correction event');const receipt=this.get("SELECT detail FROM ops_audit WHERE action='event_reviewed' AND json_extract(detail,'$.eventKey')=?",eventKey);if(!receipt)throw Error('Missing review receipt');const version=JSON.parse(receipt.detail).version;const projection=this.get('SELECT payload FROM ops_projection WHERE case_id=? AND version=?',row.case_id,version);if(!projection)throw Error('Missing review snapshot');return {duplicate:true,snapshot:JSON.parse(projection.payload)};}
   const event=JSON.parse(row.payload),caseId=row.case_id;
   for(const o of observations){
    if(!o||!kinds.includes(o.kind)||typeof o.quote!=='string'||!o.quote.trim()||!event.text.includes(o.quote))throw Error('Observation needs an exact source quote');
    if(o.supersedes!=null){const prev=this.get('SELECT o.id,e.case_id,e.occurred_at FROM ops_observations o JOIN ops_events e ON o.event_key=e.event_key WHERE o.id=?',o.supersedes);if(!prev||prev.case_id!==caseId||row.occurred_at<prev.occurred_at)throw Error('Invalid superseded observation');}
    if(o.kind==='task')this.applyTask(caseId,o,{eventKey,actor,now});
    if(o.kind==='evidence')this.applyEvidence(caseId,o,{eventKey,actor,now});
    if(o.kind==='reply'){
     const task=this.taskByKey(caseId,o.commitmentKey);if(!task)throw Error('Reply task not found');
     this.run("UPDATE ops_drafts SET state='canceled_reply' WHERE task_id=? AND state='ready'",task.id);
    }
    this.run('INSERT INTO ops_observations(event_key,kind,payload,supersedes) VALUES(?,?,?,?)',eventKey,o.kind,encode(o),o.supersedes||null);
   }
   this.reconcile(caseId);
   this.run('UPDATE ops_cases SET version=version+1 WHERE id=?',caseId);
   this.run('UPDATE ops_events SET reviewed_at=?,review_digest=? WHERE event_key=?',stamp(now),digest,eventKey);
   const snapshot=this.snapshot(caseId),projectionId=caseId+':'+snapshot.version;
   this.run('INSERT INTO ops_projection(id,case_id,version,state,payload) VALUES(?,?,?,?,?)',projectionId,caseId,snapshot.version,'pending',encode(snapshot));
   this.audit(actor,'event_reviewed',{eventKey,caseId,version:snapshot.version},now);
   return {duplicate:false,snapshot};
  });
 }
 taskByKey(caseId,key){id(key);const r=this.get('SELECT * FROM ops_tasks WHERE case_id=? AND commitment_key=?',caseId,key);return r?{...JSON.parse(r.payload),state:r.state,version:r.version}:null;}
 applyTask(caseId,o,{eventKey,actor,now}){
  id(o.commitmentKey);text(o.action,1000);if(!['neria','yoram'].includes(o.owner))throw Error('One verified logical owner required');
  if(!['low','normal','high','urgent'].includes(o.priority))throw Error('Priority required');
  if(!states.includes(o.state)||o.state==='completed')throw Error('Completion is derived only from evidence');
  if(!Array.isArray(o.dependsOn)||o.dependsOn.some(x=>typeof x!=='string'||x===o.commitmentKey))throw Error('Invalid dependencies');
  for(const key of o.dependsOn){id(key);if(!this.taskByKey(caseId,key))throw Error('Dependency must already exist');}
  if(!Array.isArray(o.completion)||!o.completion.length||o.completion.some(c=>!evidenceKinds.includes(c.kind)||typeof c.artifactId!=='string'||!c.artifactId))throw Error('Explicit completion criteria required');
  if(!o.nextAction)throw Error('Next action required');text(o.nextAction,1000);
  const existing=this.taskByKey(caseId,o.commitmentKey);
  if(existing){const incoming=this.get('SELECT occurred_at FROM ops_events WHERE event_key=?',eventKey).occurred_at;const previous=this.get('SELECT occurred_at FROM ops_events WHERE event_key=?',existing.sources.at(-1)).occurred_at;if(incoming<previous)throw Error('Older event cannot overwrite newer commitment');}
  const duplicate=this.all('SELECT payload FROM ops_tasks WHERE case_id=? AND commitment_key!=?',caseId,o.commitmentKey).map(r=>JSON.parse(r.payload)).find(t=>t.action.trim()===o.action.trim()&&t.owner===o.owner);if(duplicate)throw Error('Reuse existing commitment key');
  const due=o.dueAt==null?null:stamp(o.dueAt),proposed=o.proposedDueAt==null?null:stamp(o.proposedDueAt);
  if(due&&(!o.dueQuote||!JSON.parse(this.get('SELECT payload FROM ops_events WHERE event_key=?',eventKey).payload).text.includes(o.dueQuote)))throw Error('Agreed deadline requires source quote');
  // A changed owner requires a concrete handover and preserves the previous revision in audit.
  if(existing&&existing.owner!==o.owner){if(!o.handover||!o.handover.result||!o.handover.summary||!o.handover.dueAt)throw Error('Handover context required');stamp(o.handover.dueAt);}
  const taskId=existing?.id||'task:'+hash([caseId,o.commitmentKey]).slice(0,24);
  const data={id:taskId,caseId,commitmentKey:o.commitmentKey,action:o.action,owner:o.owner,priority:o.priority,requestedState:o.state,dueAt:due,proposedDueAt:proposed,nextAction:o.nextAction,dependsOn:o.dependsOn,completion:o.completion,sources:[...new Set([...(existing?.sources||[]),eventKey])],handover:o.handover||null};
  this.run('INSERT INTO ops_tasks VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,payload=excluded.payload,version=ops_tasks.version+1',taskId,caseId,o.commitmentKey,o.state,encode(data),1);
  this.run("UPDATE ops_drafts SET state='superseded' WHERE task_id=? AND state='ready'",taskId);
  this.assertAcyclic(caseId);
  this.audit(actor,existing?'task_updated':'task_created',{taskId,before:existing,after:data},now);
 }
 assertAcyclic(caseId){const tasks=this.all('SELECT payload FROM ops_tasks WHERE case_id=?',caseId).map(r=>JSON.parse(r.payload)),byKey=new Map(tasks.map(t=>[t.commitmentKey,t]));const done=new Set(),active=new Set();function visit(k){if(active.has(k))throw Error('Dependency cycle');if(done.has(k))return;active.add(k);for(const d of byKey.get(k).dependsOn)visit(d);active.delete(k);done.add(k);}for(const k of byKey.keys())visit(k);}
 applyEvidence(caseId,o,{eventKey,actor,now}){
  const task=this.taskByKey(caseId,o.commitmentKey);if(!task)throw Error('Evidence task not found');
  if(!evidenceKinds.includes(o.evidenceKind)||typeof o.artifactId!=='string'||!o.artifactId||! /^[a-f0-9]{64}$/.test(o.artifactDigest||'')||o.verified!==true)throw Error('Verified artifact receipt required');
  const eid=hash([task.id,o.evidenceKind,o.artifactId,o.artifactDigest]);
  this.run('INSERT OR IGNORE INTO ops_evidence VALUES(?,?,?,?,?,?,?,?,?)',eid,eventKey,caseId,task.id,o.evidenceKind,o.artifactId,o.artifactDigest,actor,stamp(now));
 }
 reconcile(caseId){
  const tasks=this.all('SELECT * FROM ops_tasks WHERE case_id=?',caseId).map(r=>({...JSON.parse(r.payload),state:r.state}));
  const byKey=new Map(tasks.map(t=>[t.commitmentKey,t])),done=new Set();
  const complete=t=>{if(done.has(t.commitmentKey))return t.state==='completed';const deps=t.dependsOn.every(k=>complete(byKey.get(k)));const evidence=this.all('SELECT * FROM ops_evidence WHERE task_id=?',t.id);const met=t.completion.every(c=>evidence.some(e=>e.kind===c.kind&&e.artifact_id===c.artifactId));const before=t.state;t.state=deps&&met?'completed':!deps?'blocked':t.requestedState;done.add(t.commitmentKey);this.run('UPDATE ops_tasks SET state=?,version=version+? WHERE id=?',t.state,before===t.state?0:1,t.id);if(before!==t.state)this.run("UPDATE ops_drafts SET state=? WHERE task_id=? AND state='ready'",t.state==='completed'?'canceled_complete':'superseded',t.id);return t.state==='completed';};
  for(const task of tasks)complete(task);
 }
 snapshot(caseId){
  const c=this.get('SELECT * FROM ops_cases WHERE id=?',caseId);if(!c)throw Error('Unknown case');
  const events=this.all('SELECT event_key,source,occurred_at,payload FROM ops_events WHERE case_id=? ORDER BY seq',caseId).map(r=>({eventKey:r.event_key,source:r.source,at:r.occurred_at,url:JSON.parse(r.payload).url}));
  const tasks=this.all('SELECT * FROM ops_tasks WHERE case_id=? ORDER BY id',caseId).map(r=>({...JSON.parse(r.payload),state:r.state,version:r.version,evidence:this.all('SELECT kind,artifact_id,digest,event_key,verified_by,at FROM ops_evidence WHERE task_id=?',r.id)}));
  const observations=this.all('SELECT o.id,o.kind,o.payload,o.supersedes,o.event_key FROM ops_observations o JOIN ops_events e ON e.event_key=o.event_key WHERE e.case_id=? ORDER BY o.id',caseId).map(r=>({...r,payload:JSON.parse(r.payload)}));
  return {schemaVersion:1,caseId,customerId:c.customer_id,goal:c.goal,stage:c.stage,link:c.link,participants:JSON.parse(c.participants),version:c.version,tasks,observations,sources:events,dispatchEnabled:false};
 }
 draft(caseId,taskKey,{now,channel='whatsapp',purpose='reminder'}){
  if(!['whatsapp','email','monday'].includes(channel))throw Error('Draft channel invalid');
  return this.tx(()=>{
   const c=this.snapshot(caseId),task=this.taskByKey(caseId,taskKey);if(!task||task.state==='completed')return null;
   const latestRelevant=this.all("SELECT o.kind FROM ops_observations o JOIN ops_events e ON e.event_key=o.event_key WHERE e.case_id=? AND o.kind='reply' AND json_extract(o.payload,'$.commitmentKey')=?",caseId,taskKey);
   if(latestRelevant.length&&purpose==='reminder')return null;
   const draftId=hash([caseId,taskKey,task.version,channel,purpose]),payload={channel,purpose,recipient:task.owner,recipientVerified:false,approvalRequired:true,createdAt:stamp(now),caseLink:c.link,taskId:task.id,body:`עדכון לתיק ${caseId}: ${task.action}. מצב: ${task.state}. הפעולה הבאה: ${task.nextAction}. ${c.link}`};
   this.run('INSERT OR IGNORE INTO ops_drafts VALUES(?,?,?,?,?,?)',draftId,caseId,task.id,task.version,'ready',encode(payload));
   return {id:draftId,...payload};
  });
 }
 metrics({now,staleHours=24}){
  const reviewed=this.all('SELECT received_at,reviewed_at FROM ops_events WHERE reviewed_at IS NOT NULL'),latencies=reviewed.map(r=>Date.parse(r.reviewed_at)-Date.parse(r.received_at));
  return {events:this.get('SELECT COUNT(*) n FROM ops_events').n,needsIdentityReview:this.get('SELECT COUNT(*) n FROM ops_events WHERE case_id IS NULL').n,tasks:this.get('SELECT COUNT(*) n FROM ops_tasks').n,completed:this.get("SELECT COUNT(*) n FROM ops_tasks WHERE state='completed'").n,overdue:this.all("SELECT payload FROM ops_tasks WHERE state!='completed'").filter(r=>{const t=JSON.parse(r.payload);return t.dueAt&&t.dueAt<stamp(now);}).length,reviewLatencyMs:latencies.length?{max:Math.max(...latencies),mean:latencies.reduce((a,b)=>a+b,0)/latencies.length}:null,staleSources:this.all('SELECT * FROM ops_sources').filter(s=>Date.parse(now)-Date.parse(s.last_seen)>staleHours*3600000).map(s=>s.source),accuracy:null,accuracyReason:'Requires independently labelled production samples',dispatchEnabled:false};
 }
 digest(caseId,{owner,now,urgentWithinHours=24}){
  const {digest}=require('./response-plan');
  return this.tx(()=>{const payload=digest(this.snapshot(caseId),{owner,now,urgentWithinHours}),fingerprint=hash(payload),key=caseId+':'+owner;
   const old=this.get('SELECT digest FROM ops_digests WHERE id=?',key);if(old?.digest===fingerprint)return null;
   this.run('INSERT INTO ops_digests VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET digest=excluded.digest,at=excluded.at,payload=excluded.payload',key,owner,caseId,fingerprint,stamp(now),encode(payload));
   return payload;
  });
 }
 close(){this.db.close();}
}
module.exports={OperationsStore,hash,encode,canonical,states,kinds};
