import {DatabaseSync} from 'node:sqlite';
import {createHmac,timingSafeEqual,randomUUID} from 'node:crypto';
import {decide,intent} from './policy.mjs';
import providerConfig from '../config/provider.json' with {type:'json'};
export const ORG=providerConfig.organizationId;
export const CONNECTION=providerConfig.connectionId;
export function signatureValid(raw,header,secrets,at=Date.now()) {
  if(!Buffer.isBuffer(raw)||raw.length>262144||typeof header!=='string'||header.length>2048) return false;
  const ts=header.split(',').filter(p=>p.startsWith('t='));
  if(ts.length!==1||!/^t=\d{10,12}$/.test(ts[0])) return false;
  const timestamp=Number(ts[0].slice(2));
  if(Math.abs(at/1000-timestamp)>300) return false;
  const signatures=header.split(',').filter(p=>/^v1=[a-f0-9]{64}$/i.test(p)).map(p=>Buffer.from(p.slice(3),'hex'));
  return secrets.filter(s=>typeof s==='string'&&s.length>=16).some(s=>{
    const expected=createHmac('sha256',s).update(`${timestamp}.`).update(raw).digest();
    return signatures.some(actual=>timingSafeEqual(actual,expected));
  });
}
export function normalize(e) {
  if(e?.object!=='event'||e.api_version!=='v1'||typeof e.id!=='string'||e.id.length>160||e.organization_id!==ORG||e.connection_id!==CONNECTION) throw new Error('invalid_scope_or_envelope');
  const o=e.data?.object;
  if(!o||typeof e.type!=='string') throw new Error('invalid_resource');
  if(e.type==='conversation.updated'){
    if(typeof o.id!=='string'||o.connection_id!==CONNECTION||!['bot','pending_human','human','app'].includes(o.control))throw Error('invalid_conversation_control');
    return {eventId:e.id,eventType:e.type,conversationId:o.id,control:o.control};
  }
  if(!['message.received','message.echo','message.sent','message.status'].includes(e.type)) return {eventId:e.id,eventType:e.type,ignore:true};
  if(typeof o.id!=='string'||typeof o.conversation_id!=='string'||o.connection_id!==CONNECTION) throw new Error('invalid_message');
  return {eventId:e.id,eventType:e.type,messageId:o.wamid||o.id,resourceId:o.id,conversationId:o.conversation_id,direction:o.direction,source:o.source,type:o.type,text:typeof o.content?.text?.body==='string'?o.content.text.body:typeof o.content?.body==='string'?o.content.body:null,at:Date.parse(o.wa_timestamp||o.created_at),imported:o.is_imported===true,ownToken:typeof o.metadata?.excelent_outbox_id==='string'?o.metadata.excelent_outbox_id:null,status:o.status};
}
export class Broker {
  constructor(path,{now=()=>Date.now()}={}) {
    this.now=now; this.db=new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,kind TEXT NOT NULL,conversation TEXT,at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,revision INTEGER NOT NULL DEFAULT 0,latest_at INTEGER NOT NULL DEFAULT 0,latest_message_id TEXT,human INTEGER NOT NULL DEFAULT 0,optout INTEGER NOT NULL DEFAULT 0,introduced INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,event_id TEXT UNIQUE NOT NULL,conversation TEXT NOT NULL,at INTEGER NOT NULL,payload TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'NEW');
      CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,message_id TEXT UNIQUE NOT NULL,conversation TEXT NOT NULL,revision INTEGER NOT NULL,reply TEXT NOT NULL,route TEXT NOT NULL,state TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL DEFAULT 0,lease TEXT,provider_id TEXT,provider_status INTEGER,last_error TEXT);
      CREATE TABLE IF NOT EXISTS handoffs(id TEXT PRIMARY KEY,conversation TEXT NOT NULL,reason TEXT NOT NULL,at INTEGER NOT NULL,state TEXT NOT NULL DEFAULT 'OPEN');
      CREATE TABLE IF NOT EXISTS audit(seq INTEGER PRIMARY KEY,at INTEGER NOT NULL,event_id TEXT,conversation TEXT,decision TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS provider_receipts(resource_id TEXT NOT NULL,conversation TEXT NOT NULL,status TEXT NOT NULL,event_id TEXT NOT NULL,observed_at INTEGER NOT NULL,PRIMARY KEY(resource_id,conversation));
      CREATE UNIQUE INDEX IF NOT EXISTS conversation_one_flight ON outbox(conversation) WHERE state='SENDING';`);
  }
  close(){this.db.close();}
  transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const r=fn();this.db.exec('COMMIT');return r;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  audit(event,conv,decision){this.db.prepare('INSERT INTO audit(at,event_id,conversation,decision) VALUES(?,?,?,?)').run(this.now(),event,conv,decision);}
  conversation(id){return this.db.prepare('SELECT * FROM conversations WHERE id=?').get(id);}
  recordReceipt(m){
    // Keep provider acceptance and delivery as separate facts. Signed status
    // events are unordered; weaker/late observations cannot erase delivery proof.
    const rank={queued:0,sending:1,sent:2,failed:3,delivered:4,read:5,played:6};
    if(m.direction!=='outbound'||!Object.hasOwn(rank,m.status)){this.audit(m.eventId,m.conversationId,'ignored_unknown_delivery_status');return;}
    const old=this.db.prepare('SELECT status FROM provider_receipts WHERE resource_id=? AND conversation=?').get(m.resourceId,m.conversationId);
    if(!old||rank[m.status]>rank[old.status])this.db.prepare('INSERT INTO provider_receipts VALUES(?,?,?,?,?) ON CONFLICT(resource_id,conversation) DO UPDATE SET status=excluded.status,event_id=excluded.event_id,observed_at=excluded.observed_at').run(m.resourceId,m.conversationId,m.status,m.eventId,this.now());
    this.audit(m.eventId,m.conversationId,'delivery_status_'+m.status);
  }
  delivery(id){
    const o=this.db.prepare('SELECT state,provider_id,conversation FROM outbox WHERE id=?').get(id);if(!o)return null;
    const r=o.provider_id?this.db.prepare('SELECT status,event_id,observed_at FROM provider_receipts WHERE resource_id=? AND conversation=?').get(o.provider_id,o.conversation):null;
    return {requestState:o.state,providerId:o.provider_id,deliveryStatus:r?.status??null,receiptEventId:r?.event_id??null,observedAt:r?.observed_at??null};
  }
  cancel(conv,reason){this.db.prepare("UPDATE outbox SET state='CANCELLED' WHERE conversation=? AND state IN ('READY','RETRY','SIMULATED')").run(conv);this.audit(null,conv,reason);}
  ingest(raw,header,secrets) {
    if(!signatureValid(raw,header,secrets,this.now())) return {status:401,code:'invalid_signature'};
    let m;try{m=normalize(JSON.parse(raw.toString('utf8')));}catch{return {status:400,code:'invalid_event'};}
    return this.transaction(()=>{
      if(this.db.prepare('SELECT 1 FROM events WHERE id=?').get(m.eventId)) return {status:200,code:'duplicate_event'};
      this.db.prepare('INSERT INTO events VALUES(?,?,?,?)').run(m.eventId,m.eventType,m.conversationId??null,this.now());
      if(m.ignore){this.audit(m.eventId,null,'ignored_event_type');return {status:200,code:'stored_ignored'};}
      this.db.prepare('INSERT OR IGNORE INTO conversations(id) VALUES(?)').run(m.conversationId);
      if(m.eventType==='conversation.updated'){
        // A stale bot update never clears human ownership. Resuming automation
        // requires explicit operator reconciliation, not an unordered event.
        if(m.control!=='bot'){this.db.prepare('UPDATE conversations SET human=1,revision=revision+1 WHERE id=?').run(m.conversationId);this.cancel(m.conversationId,'provider_human_control');}
        this.audit(m.eventId,m.conversationId,'control_'+m.control);return {status:200,code:'stored_control'};
      }
      if(m.eventType==='message.status'){this.recordReceipt(m);return {status:200,code:'stored_status'};}
      if(m.imported){this.audit(m.eventId,m.conversationId,'ignored_history');return {status:200,code:'stored_ignored'};}
      const own=m.ownToken && this.db.prepare('SELECT 1 FROM outbox WHERE id=? AND conversation=?').get(m.ownToken,m.conversationId);
      if(m.eventType==='message.echo'||(m.eventType==='message.sent'&&!own)){
        this.db.prepare('UPDATE conversations SET human=1,revision=revision+1 WHERE id=?').run(m.conversationId);this.cancel(m.conversationId,'external_sender_took_control');
        return {status:200,code:'stored_external_reply'};
      }
      if(m.eventType!=='message.received'||m.direction!=='inbound'||m.source!=='customer'||m.imported){this.audit(m.eventId,m.conversationId,'ignored_non_customer');return {status:200,code:'stored_ignored'};}
      if(this.db.prepare('SELECT 1 FROM messages WHERE id=?').get(m.messageId)) return {status:200,code:'duplicate_message'};
      this.db.prepare('INSERT INTO messages(id,event_id,conversation,at,payload) VALUES(?,?,?,?,?)').run(m.messageId,m.eventId,m.conversationId,Number.isFinite(m.at)?m.at:0,JSON.stringify(m));
      const stop=intent(m.text)==='optout';
      const conv=this.conversation(m.conversationId);
      // A delayed older delivery never supersedes a newer customer message. STOP always wins.
      if(stop||m.at>=conv.latest_at){
        this.db.prepare('UPDATE conversations SET revision=revision+1,latest_at=max(latest_at,?),latest_message_id=?,optout=max(optout,?) WHERE id=?').run(Number.isFinite(m.at)?m.at:0,m.messageId,stop?1:0,m.conversationId);
        this.cancel(m.conversationId,stop?'optout':'new_inbound');
      }
      this.audit(m.eventId,m.conversationId,stop?'optout_stored':'inbound_stored');
      return {status:202,code:'durably_stored'};
    });
  }
  prepareOne(){return this.transaction(()=>this.prepareRow(this.db.prepare("SELECT * FROM messages WHERE state='NEW' ORDER BY at,id LIMIT 1").get()));}
  prepareRow(row,modelKey){
    if(!row)return null;
    const m=JSON.parse(row.payload), c=this.conversation(row.conversation),d=decide(m,c,this.now());
    if(m.messageId!==c.latest_message_id){d.route='ignore';d.reason='superseded';d.reply='';}
    // The model can veto an approved reply, never authorize a risky intent or an action.
    if(modelKey!==undefined&&d.route==='reply'&&modelKey!==d.kind){d.route='handoff';d.reason='model_requires_human';d.reply='';}
    this.db.prepare("UPDATE messages SET state='PROCESSED' WHERE id=?").run(row.id);
    if(d.route==='handoff'){
      // A local handoff is not proof that an agent has seen the request. Stop all
      // bot replies immediately and do not promise a provider-side assignment.
      if(!this.db.prepare("SELECT 1 FROM handoffs WHERE conversation=? AND state='OPEN'").get(c.id)){
        this.db.prepare('INSERT INTO handoffs(id,conversation,reason,at) VALUES(?,?,?,?)').run(row.id,c.id,d.reason,this.now());
      }
      this.db.prepare('UPDATE conversations SET human=1,revision=revision+1 WHERE id=?').run(c.id);
      this.cancel(c.id,'handoff_acquired_human_control');d.reply='';
    }
    const id=randomUUID();
    if(d.reply)this.db.prepare('INSERT INTO outbox(id,message_id,conversation,revision,reply,route,state) VALUES(?,?,?,?,?,?,?)').run(id,row.id,c.id,c.revision,d.reply,d.route,'READY');
    this.audit(m.eventId,c.id,d.reason);
    return {id:d.reply?id:null,route:d.route,reason:d.reason};
  }
  async prepareOneWithModel(classify,{credentialApproved=false,budgetApproved=false}={}){
    // No model call or queue mutation before both approvals. The isolated HTTP
    // service deliberately exposes only the deterministic simulation path.
    if(!credentialApproved||!budgetApproved||typeof classify!=='function')return {route:'blocked',reason:'model_approval_required'};
    const reserved=this.transaction(()=>{
      const row=this.db.prepare("SELECT * FROM messages WHERE state='NEW' ORDER BY at,id LIMIT 1").get();if(!row)return null;
      const m=JSON.parse(row.payload),c=this.conversation(row.conversation),d=decide(m,c,this.now());
      if(d.route!=='reply'||m.messageId!==c.latest_message_id)return {done:this.prepareRow(row)};
      this.db.prepare("UPDATE messages SET state='CLASSIFYING' WHERE id=?").run(row.id);
      return {row,revision:c.revision,text:m.text};
    });
    if(!reserved)return null;if(reserved.done)return reserved.done;
    let key='handoff';try{key=await classify(reserved.text);}catch{/* A refusal or model outage requires a human. */}
    return this.transaction(()=>{
      const {row}=reserved,c=this.conversation(row.conversation);
      if(c.revision!==reserved.revision||c.human||c.optout){this.db.prepare("UPDATE messages SET state='PROCESSED' WHERE id=?").run(row.id);this.audit(row.event_id,c.id,'model_result_invalidated');return {id:null,route:'ignore',reason:'model_result_invalidated'};}
      return this.prepareRow(row,key);
    });
  }
  recoverClassifications(){
    // Operator recovery after a stopped worker only. Fresh local/provider checks
    // are still mandatory before any later dispatch; no outgoing request is retried.
    return this.transaction(()=>Number(this.db.prepare("UPDATE messages SET state='NEW' WHERE state='CLASSIFYING'").run().changes));
  }
  async dispatch(id,provider,{live=false,exclusiveOwnerVerified=false,providerStateVerified=false,retentionApproved=false,beforeSend}={}){
    if(!live)return this.transaction(()=>{const changed=this.db.prepare("UPDATE outbox SET state='SIMULATED' WHERE id=? AND state='READY'").run(id);return {state:Number(changed.changes)===1?'SIMULATED':'NOT_CLAIMED',network:false};});
    if(!exclusiveOwnerVerified||!providerStateVerified||!retentionApproved) return {state:'BLOCKED',reason:'activation_gates'};
    // Provider check must include conversation control, opt-out, latest inbound, service window.
    if(typeof beforeSend!=='function')return {state:'BLOCKED',reason:'provider_preflight_required'};
    try{if(await beforeSend(id)!==true)return {state:'BLOCKED',reason:'provider_preflight'};}
    catch{return {state:'BLOCKED',reason:'provider_preflight_failed'};}
    const claim=this.transaction(()=>{
      const o=this.db.prepare('SELECT * FROM outbox WHERE id=?').get(id);if(!o||!['READY','RETRY'].includes(o.state)||o.next_at>this.now())return null;
      const c=this.conversation(o.conversation);
      const m=JSON.parse(this.db.prepare('SELECT payload FROM messages WHERE id=?').get(o.message_id).payload);
      if(c.optout||c.human||c.revision!==o.revision||this.now()-m.at>=86400000){this.db.prepare("UPDATE outbox SET state='CANCELLED' WHERE id=?").run(id);return null;}
      if(this.db.prepare("SELECT 1 FROM outbox WHERE conversation=? AND state IN ('SENDING','UNCERTAIN')").get(c.id))return null;
      const lease=randomUUID();this.db.prepare("UPDATE outbox SET state='SENDING',lease=?,attempts=attempts+1 WHERE id=?").run(lease,id);return {...o,lease};
    });
    if(!claim)return {state:'NOT_CLAIMED'};
    // No lease expiry resend. A process crash leaves SENDING and requires reconciliation.
    let result;try{result=await provider.send(claim);}catch{result={uncertain:true};}
    return this.transaction(()=>{
      let state;
      const definiteRateLimit=result.status===429&&result.accepted===false;
      if(result.id&&result.accepted===true)state='ACCEPTED';
      else if(definiteRateLimit&&claim.attempts+1<3)state='RETRY';
      else if(result.uncertain||result.status>=500||!result.status)state='UNCERTAIN';
      else state='FAILED';
      const delay=Math.max(1000,Math.min(3600000,result.retryAfterMs||30000));
      this.db.prepare('UPDATE outbox SET state=?,provider_id=?,provider_status=?,last_error=?,next_at=? WHERE id=? AND lease=?').run(state,result.id??null,Number.isInteger(result.status)?result.status:null,['FAILED','UNCERTAIN','RETRY'].includes(state)?state.toLowerCase():null,this.now()+delay,id,claim.lease);
      if(state==='ACCEPTED')this.db.prepare('UPDATE conversations SET introduced=1 WHERE id=?').run(claim.conversation);
      this.audit(null,claim.conversation,'provider_'+state.toLowerCase());return {state,providerId:result.id??null};
    });
  }
  reconcile(id,providerId){
    // Called only by trusted operator after GET message/list + matching metadata. Never auto retry ambiguity.
    if(typeof providerId!=='string'||!providerId.startsWith('msg_'))throw new Error('provider_evidence_required');
    return this.transaction(()=>{const r=this.db.prepare("UPDATE outbox SET state='ACCEPTED',provider_id=? WHERE id=? AND state IN ('UNCERTAIN','SENDING')").run(providerId,id);return Number(r.changes);});
  }
}
