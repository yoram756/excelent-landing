'use strict';
// Local, synthetic-only connector runner. No timers, source SDKs, reviewer token,
// task projection, or outbound messaging. Live source adapters remain unverified.
const {randomUUID}=require('node:crypto');
const {hash,encode}=require('./store');
const sources=['transkriptor','gmail','whatsapp','calendar','drive','manual'];
const eventFields=new Set(['id','source','scope','occurredAt','url','text','caseId','customerId','personId','phone','email']);
const validId=x=>typeof x==='string'&&/^[\w.:-]{1,180}$/.test(x);
const testId=x=>validId(x)&&x.startsWith('TEST-');
const stamp=x=>{if(typeof x!=='string'||!Number.isFinite(Date.parse(x)))throw Error('ISO time required');return new Date(x).toISOString();};
const cursor=x=>{if(x!==null&&(typeof x!=='string'||!x||x.length>8192))throw Error('Opaque cursor required');return x;};

class SourceInbox{
 constructor(store){
  this.store=store;
  store.db.exec(`
   CREATE TABLE IF NOT EXISTS ops_streams(
    id TEXT PRIMARY KEY,source TEXT NOT NULL,account_id TEXT NOT NULL,cursor TEXT,
    generation INTEGER NOT NULL DEFAULT 0,lease TEXT,lease_until TEXT,
    registered_at TEXT NOT NULL,last_success TEXT,last_attempt TEXT,failures INTEGER NOT NULL DEFAULT 0,
    next_at TEXT,state TEXT NOT NULL DEFAULT 'ready',error_code TEXT);
   CREATE TABLE IF NOT EXISTS ops_pages(
    stream_id TEXT NOT NULL REFERENCES ops_streams(id),page_id TEXT NOT NULL,digest TEXT NOT NULL,
    receipt TEXT NOT NULL,PRIMARY KEY(stream_id,page_id));
  `);
 }
 register({id,source,accountId},{now}){
  // Sandbox accounts prevent an accidentally configured production poller.
  if(!testId(id)||!testId(accountId)||!sources.includes(source))throw Error('Synthetic stream and account required');
  const s=this.store;
  return s.tx(()=>{const old=s.get('SELECT * FROM ops_streams WHERE id=?',id);
   if(old){if(old.source!==source||old.account_id!==accountId)throw Error('Stream binding conflict');return {id,registered:false};}
   s.run('INSERT INTO ops_streams(id,source,account_id,registered_at) VALUES(?,?,?,?)',id,source,accountId,stamp(now));
   s.audit('connector','stream_registered',{streamId:id,source,mode:'synthetic'},now);return {id,registered:true};
  });
 }
 claim(id,{now,leaseMs=60000}){
  stamp(now);if(!testId(id)||!Number.isInteger(leaseMs)||leaseMs<1000||leaseMs>300000)throw Error('Invalid lease');
  const s=this.store;
  return s.tx(()=>{const row=s.get('SELECT * FROM ops_streams WHERE id=?',id);if(!row)throw Error('Unknown stream');
   if(row.state==='blocked'||(row.next_at&&row.next_at>stamp(now))||(row.lease_until&&row.lease_until>stamp(now)))return null;
   const token=randomUUID(),until=new Date(Date.parse(now)+leaseMs).toISOString();
   s.run('UPDATE ops_streams SET lease=?,lease_until=?,last_attempt=? WHERE id=?',token,until,stamp(now),id);
   // Cursor is passed only to the source reader, never to audit/log/health output.
   return {streamId:id,source:row.source,accountId:row.account_id,cursor:row.cursor,generation:row.generation,token};
  });
 }
 checkLease(claim,now){
  const row=this.store.get('SELECT * FROM ops_streams WHERE id=?',claim.streamId);
  if(!row||row.lease!==claim.token||row.generation!==claim.generation||row.lease_until<=stamp(now))throw Object.assign(Error('Stale source lease'),{code:'STALE_SOURCE_LEASE'});
  return row;
 }
 accept(claim,page,{now}){
  if(!page||!validId(page.id)||!Array.isArray(page.events)||page.events.length>100||Object.keys(page).some(k=>!['id','events','nextCursor'].includes(k)))throw Error('Bounded normalized page required');
  cursor(page.nextCursor);if(Buffer.byteLength(encode(page))>1048576)throw Error('Source page too large');
  const s=this.store,digest=hash({id:page.id,events:page.events,nextCursor:page.nextCursor});
  return s.tx(()=>{
   const row=this.checkLease(claim,now),old=s.get('SELECT * FROM ops_pages WHERE stream_id=? AND page_id=?',row.id,page.id);
   if(old){if(old.digest!==digest)throw Error('Source page replay conflict');
    s.run('UPDATE ops_streams SET lease=NULL,lease_until=NULL WHERE id=?',row.id);
    return {...JSON.parse(old.receipt),duplicate:true};
   }
   if(page.events.length&&page.nextCursor===row.cursor)throw Error('Nonempty page must advance its cursor');
   const receipts=page.events.map(event=>{
    if(!event||typeof event!=='object'||event.source!==row.source||!testId(event.id)||event.scope!=='business'||
      (event.caseId&&!testId(event.caseId))||(event.customerId&&!testId(event.customerId))||
      (event.personId&&!testId(event.personId))||
      (event.phone&&!/^0500000(?:0[4-9]\d|[1-9]\d\d)$/.test(event.phone))||
      (event.email&&!/^[^@]+@example\.invalid$/.test(event.email))||
      Object.keys(event).some(k=>!eventFields.has(k)))throw Error('Synthetic business envelope required');
    // Identity hints come from a reviewed adapter binding, never from instructions
    // inside a transcript. Namespace native IDs by account to avoid collisions.
    const normalized={...event,id:'TEST-'+hash([row.account_id,event.id]),nativeSourceId:event.id,sourceAccountId:row.account_id};
    return s.ingest(normalized,{now});
   });
   const receipt={streamId:row.id,pageId:page.id,generation:row.generation+1,accepted:receipts.length,
    eventKeys:receipts.map(r=>r.eventKey),needsIdentityReview:receipts.filter(r=>r.resolution.status==='review').length,duplicate:false};
   s.run('INSERT INTO ops_pages VALUES(?,?,?,?)',row.id,page.id,digest,encode(receipt));
   s.run("UPDATE ops_streams SET cursor=?,generation=generation+1,lease=NULL,lease_until=NULL,last_success=?,failures=0,next_at=NULL,state='ready',error_code=NULL WHERE id=?",page.nextCursor,stamp(now),row.id);
   s.audit('connector','source_page_accepted',{streamId:row.id,pageId:page.id,generation:receipt.generation,accepted:receipt.accepted},now);
   return receipt;
  });
 }
 fail(claim,{now,kind='read_failed'}){
  if(!['read_failed','invalid_page'].includes(kind))throw Error('Unknown source failure class');
  const s=this.store;
  return s.tx(()=>{this.checkLease(claim,now);const row=s.get('SELECT * FROM ops_streams WHERE id=?',claim.streamId),failures=row.failures+1;
   const blocked=kind==='invalid_page'||failures>=3,nextAt=blocked?null:new Date(Date.parse(now)+Math.min(60000,1000*2**(failures-1))).toISOString();
   s.run('UPDATE ops_streams SET lease=NULL,lease_until=NULL,failures=?,next_at=?,state=?,error_code=? WHERE id=?',failures,nextAt,blocked?'blocked':'ready',kind,row.id);
   s.audit('connector','source_page_failed',{streamId:row.id,kind,failures,blocked},now);
   return {streamId:row.id,status:blocked?'blocked':'retry_later',failureCode:kind,failures,nextAt};
  });
 }
 resume(id,{actor,reason,now}){
  if(!validId(actor)||typeof reason!=='string'||!reason.trim()||reason.length>1000)throw Error('Reviewed recovery reason required');
  return this.store.tx(()=>{const row=this.store.get('SELECT * FROM ops_streams WHERE id=?',id);if(!row||row.state!=='blocked')throw Error('Blocked stream required');
   this.store.run("UPDATE ops_streams SET state='ready',failures=0,next_at=NULL,error_code=NULL WHERE id=?",id);
   this.store.audit(actor,'source_resumed',{streamId:id,reason},now);return {streamId:id,status:'ready'};
  });
 }
 health({now,staleHours=24}){
  stamp(now);if(!Number.isFinite(staleHours)||staleHours<=0)throw Error('Positive stale interval required');
  return this.store.all('SELECT * FROM ops_streams ORDER BY id').map(r=>({streamId:r.id,source:r.source,generation:r.generation,failures:r.failures,errorCode:r.error_code,
   state:r.state==='blocked'?'blocked':!r.last_success?'never_connected':Date.parse(now)-Date.parse(r.last_success)>staleHours*3600000?'stale':'healthy',
   lastSuccess:r.last_success,lastAttempt:r.last_attempt,dispatchEnabled:false}));
 }
}

async function runSourceCycle(inbox,{streamId,adapter,now=()=>new Date().toISOString(),readTimeoutMs=5000}){
 if(!adapter||adapter.mode!=='synthetic'||typeof adapter.readPage!=='function')throw Error('Synthetic read-only adapter required');
 if(!Number.isInteger(readTimeoutMs)||readTimeoutMs<10||readTimeoutMs>30000)throw Error('Bounded read timeout required');
 const claim=inbox.claim(streamId,{now:now()});if(!claim)return {streamId,status:'not_due'};
 const failed=kind=>{try{return inbox.fail(claim,{now:now(),kind});}catch(error){return error.code==='STALE_SOURCE_LEASE'?{streamId,status:'lease_lost',failureCode:'lease_lost'}:{streamId,status:'blocked',failureCode:'failure_record_unconfirmed'};}};
 let page,timer;const abort=new AbortController();
 try{page=await Promise.race([
  adapter.readPage({cursor:claim.cursor,limit:100,accountId:claim.accountId,signal:abort.signal}),
  new Promise((resolve,reject)=>{timer=setTimeout(()=>{abort.abort();reject(Error('read_timeout'));},readTimeoutMs);})
 ]);}
 catch{return failed('read_failed');}
 finally{clearTimeout(timer);}
 try{return {status:'accepted',...inbox.accept(claim,page,{now:now()})};}
 catch{return failed('invalid_page');}
}
async function runSourceRound(inbox,streams,options={}){
 if(!Array.isArray(streams)||streams.length>10||new Set(streams.map(s=>s.streamId)).size!==streams.length)throw Error('At most ten distinct streams required');
 return Promise.all(streams.map(async stream=>{try{return await runSourceCycle(inbox,{...options,...stream});}catch{return {streamId:stream.streamId,status:'blocked',failureCode:'configuration_invalid'};}}));
}
module.exports={SourceInbox,runSourceCycle,runSourceRound};
