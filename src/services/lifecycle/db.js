// Local SQLite engine: raw incoming webhooks, atomic per-phone lead locks and lifecycle events.
// No network. Requires Node >=22.13 (node:sqlite) and a filesystem supporting SQLite file locks.
// A lead is admitted (and only then may the caller write to Monday or send WhatsApp) when it wins the
// phone lock; a second lead with the same normalized phone inside the lock window is a blocked duplicate.
const {DatabaseSync}=require('node:sqlite');
const nodePath=require('node:path');
const {randomUUID}=require('node:crypto');
const LOCK_MS=60000;
// Same normalizer as validate.js, build-mutation.js, plan.js and calendly.js (tests/funnel/phone.test.js keeps them identical).
const norm=s=>{let d=String(s||'').replace(/\D/g,'');if(d.startsWith('00'))d=d.slice(2);else if(d.startsWith('0'))d='972'+d.slice(1);if(d.startsWith('9720'))d='972'+d.slice(4);return d.length>=11?d:'';};
const EVENT_TYPES=['lead_received','duplicate_blocked','status','heat'];
const iso=v=>{const t=typeof v==='number'?v:Date.parse(v);if(!Number.isFinite(t))throw Error('Invalid clock');return new Date(t).toISOString();};

class LifecycleDb{
  constructor(path){
    let dbPath=path;
    if(path!==':memory:'){
      // Validate before resolve: relative paths must not silently become absolute.
      if(typeof path!=='string'||!nodePath.isAbsolute(path))throw Error('Absolute .sqlite path or :memory: required');
      dbPath=nodePath.resolve(nodePath.normalize(path));
      if(!dbPath.endsWith('.sqlite'))throw Error('Absolute .sqlite path or :memory: required');
    }
    this.db=new DatabaseSync(dbPath);
    this.db.exec('PRAGMA busy_timeout=10000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS incoming_webhooks(
        id TEXT PRIMARY KEY, source TEXT NOT NULL, received_at TEXT NOT NULL, raw TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS lead_dedup_locks(
        phone TEXT PRIMARY KEY, locked_at TEXT NOT NULL, expires_at TEXT NOT NULL, webhook_id TEXT NOT NULL REFERENCES incoming_webhooks(id));
      CREATE TABLE IF NOT EXISTS lifecycle_events(
        id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT NOT NULL, item_id TEXT, type TEXT NOT NULL CHECK(type IN ('${EVENT_TYPES.join("','")}')),
        from_value TEXT, to_value TEXT, at TEXT NOT NULL, webhook_id TEXT REFERENCES incoming_webhooks(id));
      CREATE INDEX IF NOT EXISTS lifecycle_events_phone ON lifecycle_events(phone, at);`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS internal_alert_claims(
      claim_key TEXT PRIMARY KEY, claimed_at TEXT NOT NULL);`);
  }
  tx(fn){this.db.exec('BEGIN IMMEDIATE');try{const r=fn();this.db.exec('COMMIT');return r;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  // Raw body exactly as received; never parsed or trimmed here.
  recordWebhook({source,raw,receivedAt}){
    if(typeof source!=='string'||!source||typeof raw!=='string')throw Error('source and raw text required');
    const id=randomUUID();
    this.db.prepare('INSERT INTO incoming_webhooks(id,source,received_at,raw) VALUES(?,?,?,?)').run(id,source,iso(receivedAt),raw);
    return id;
  }
  // One statement: insert the lock, or take over only an expired one. changes===1 means this caller holds it.
  acquireLeadLock(phone,{now,webhookId,ttlMs=LOCK_MS}){
    const p=norm(phone);if(!p)throw Error('Invalid phone for lock');
    const at=iso(now),until=iso(Date.parse(at)+ttlMs);
    const r=this.db.prepare(`INSERT INTO lead_dedup_locks(phone,locked_at,expires_at,webhook_id) VALUES(?,?,?,?)
      ON CONFLICT(phone) DO UPDATE SET locked_at=excluded.locked_at,expires_at=excluded.expires_at,webhook_id=excluded.webhook_id
      WHERE lead_dedup_locks.expires_at<=excluded.locked_at`).run(p,at,until,webhookId);
    const held=this.db.prepare('SELECT webhook_id,expires_at FROM lead_dedup_locks WHERE phone=?').get(p);
    return {acquired:r.changes===1,phone:p,lockedUntil:held.expires_at,heldBy:held.webhook_id};
  }
  recordEvent({phone,itemId=null,type,from=null,to=null,at,webhookId=null}){
    const p=norm(phone);if(!p)throw Error('Invalid phone for event');
    if(!EVENT_TYPES.includes(type))throw Error('Unknown lifecycle event type');
    this.db.prepare('INSERT INTO lifecycle_events(phone,item_id,type,from_value,to_value,at,webhook_id) VALUES(?,?,?,?,?,?,?)')
      .run(p,itemId,type,from==null?null:String(from),to==null?null:String(to),iso(at),webhookId);
  }
  // Intake gate: record the raw webhook, take the phone lock, log the outcome. All or nothing.
  admitLead({source,raw,phone,now}){
    return this.tx(()=>{
      const webhookId=this.recordWebhook({source,raw,receivedAt:now});
      const lock=this.acquireLeadLock(phone,{now,webhookId});
      this.recordEvent({phone,type:lock.acquired?'lead_received':'duplicate_blocked',to:lock.heldBy,at:now,webhookId});
      return {admitted:lock.acquired,reason:lock.acquired?null:'duplicate_within_lock_window',webhookId,...lock};
    });
  }
  close(){this.db.close();}
  // A durable reservation is never automatically released, including on timeout.
  // This prevents two workers from sending the same internal alert; an unknown
  // delivery requires operator reconciliation rather than a blind retry.
  claimInternalAlert(key,now){
    if(typeof key!=='string'||!/^internal-lead:\d{1,20}:\d{1,20}:\d{11,15}$/.test(key))throw Error('Invalid alert key');
    const result=this.db.prepare('INSERT INTO internal_alert_claims(claim_key,claimed_at) VALUES(?,?) ON CONFLICT(claim_key) DO NOTHING').run(key,iso(now));
    return {claimed:result.changes===1,key};
  }
}

module.exports={LifecycleDb,LOCK_MS,norm};
