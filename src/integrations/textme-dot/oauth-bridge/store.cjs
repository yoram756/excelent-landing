'use strict';
const {DatabaseSync}=require('node:sqlite');
const {createHash,createCipheriv,createDecipheriv,randomBytes}=require('node:crypto');
const {chmodSync}=require('node:fs');

// OIDC payloads (including client/token state) are encrypted; lookup IDs are hashed.
function openStore(file,key){
  if(!Buffer.isBuffer(key)||key.length!==32)throw Error('STORAGE_KEY_REQUIRED');
  const db=new DatabaseSync(file);db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  db.exec(`CREATE TABLE IF NOT EXISTS records(model TEXT NOT NULL,id TEXT NOT NULL,data BLOB NOT NULL,expires INTEGER,grant_id TEXT,uid TEXT,user_code TEXT,consumed INTEGER,PRIMARY KEY(model,id));
    CREATE INDEX IF NOT EXISTS grant_idx ON records(grant_id);
    CREATE INDEX IF NOT EXISTS uid_idx ON records(model,uid);
    CREATE INDEX IF NOT EXISTS code_idx ON records(model,user_code);
    CREATE TABLE IF NOT EXISTS login_failures(id TEXT PRIMARY KEY,starts INTEGER NOT NULL,attempts INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,at INTEGER NOT NULL,event TEXT NOT NULL,result TEXT NOT NULL);`);
  if(process.platform!=='win32')chmodSync(file,0o600);
  const hash=s=>createHash('sha256').update(String(s)).digest('hex');
  const encrypt=(model,id,payload)=>{const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);c.setAAD(Buffer.from(model+':'+id));const data=Buffer.concat([c.update(JSON.stringify(payload)),c.final()]);return Buffer.concat([iv,c.getAuthTag(),data]);};
  const decode=row=>{if(!row||(row.expires&&row.expires<=Math.floor(Date.now()/1000)))return undefined;const data=Buffer.from(row.data),c=createDecipheriv('aes-256-gcm',key,data.subarray(0,12));c.setAAD(Buffer.from(row.model+':'+row.id));c.setAuthTag(data.subarray(12,28));const value=JSON.parse(Buffer.concat([c.update(data.subarray(28)),c.final()]).toString());if(row.consumed)value.consumed=row.consumed;return value;};
  class Adapter{
    constructor(model){if(!/^[A-Za-z][A-Za-z0-9]{0,60}$/.test(model))throw Error('INVALID_MODEL');this.model=model;}
    async upsert(id,payload,ttl){const h=hash(id);db.prepare('INSERT OR REPLACE INTO records VALUES(?,?,?,?,?,?,?,?)').run(this.model,h,encrypt(this.model,h,payload),ttl?Math.floor(Date.now()/1000)+ttl:null,payload.grantId?hash(payload.grantId):null,payload.uid?hash(payload.uid):null,payload.userCode?hash(payload.userCode):null,payload.consumed||null);}
    async find(id){return decode(db.prepare('SELECT * FROM records WHERE model=? AND id=?').get(this.model,hash(id)));}
    async findByUid(uid){return decode(db.prepare('SELECT * FROM records WHERE model=? AND uid=?').get(this.model,hash(uid)));}
    async findByUserCode(code){return decode(db.prepare('SELECT * FROM records WHERE model=? AND user_code=?').get(this.model,hash(code)));}
    async destroy(id){db.prepare('DELETE FROM records WHERE model=? AND id=?').run(this.model,hash(id));}
    async consume(id){const now=Math.floor(Date.now()/1000),r=db.prepare('UPDATE records SET consumed=? WHERE model=? AND id=? AND consumed IS NULL AND (expires IS NULL OR expires>?)').run(now,this.model,hash(id),now);if(r.changes!==1)throw Error('TOKEN_ALREADY_CONSUMED_OR_EXPIRED');}
    async revokeByGrantId(id){db.prepare('DELETE FROM records WHERE grant_id=?').run(hash(id));}
  }
  return {Adapter,db,close:()=>db.close(),
    audit(event,result){if(!/^[a-z_]{1,40}$/.test(event)||!/^[A-Z_]{1,50}$/.test(result))throw Error('AUDIT_METADATA_ONLY');db.prepare('INSERT INTO audit(at,event,result) VALUES(?,?,?)').run(Math.floor(Date.now()/1000),event,result);},
    // Account-independent, durable rate bound. Never store an address or a key.
    failedLogin(id){const h=hash(id),now=Math.floor(Date.now()/1000);db.prepare('INSERT INTO login_failures VALUES(?,?,1) ON CONFLICT(id) DO UPDATE SET attempts=CASE WHEN starts<? THEN 1 ELSE attempts+1 END,starts=CASE WHEN starts<? THEN excluded.starts ELSE starts END').run(h,now,now-900,now-900);},
    loginBlocked(id){const r=db.prepare('SELECT * FROM login_failures WHERE id=?').get(hash(id));return !!r&&r.starts>Math.floor(Date.now()/1000)-900&&r.attempts>=5;},
    cleanup(){db.prepare('DELETE FROM records WHERE expires IS NOT NULL AND expires<=?').run(Math.floor(Date.now()/1000));db.prepare('DELETE FROM login_failures WHERE starts<?').run(Math.floor(Date.now()/1000)-900);db.prepare('DELETE FROM audit WHERE at<?').run(Math.floor(Date.now()/1000)-30*86400);}
  };
}
module.exports={openStore};
