const {DatabaseSync}=require('node:sqlite'),{randomUUID,createHash}=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const hash=x=>createHash('sha256').update(x).digest('hex');
class CapiStore{
  constructor(file,binding){
    if(file!==':memory:'&&(!path.isAbsolute(file)||!file.endsWith('.sqlite')))throw Error('Absolute dedicated .sqlite required');
    this.db=new DatabaseSync(file);if(file!==':memory:')fs.chmodSync(file,0o600);
    this.db.exec(`PRAGMA busy_timeout=10000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS capi_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS capi_dispatch(key TEXT PRIMARY KEY,item_key TEXT NOT NULL UNIQUE,event_id TEXT NOT NULL,item_id TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('SENDING','ACKED','FAILED','UNKNOWN')),claim TEXT NOT NULL,at INTEGER NOT NULL,receipt TEXT);
      CREATE TABLE IF NOT EXISTS capi_issues(key TEXT PRIMARY KEY,code TEXT NOT NULL,at INTEGER NOT NULL);`);
    try{this.tx(()=>{const r=this.db.prepare("SELECT value FROM capi_meta WHERE key='binding'").get();if(r&&r.value!==binding)throw Error('CAPI state belongs to another binding');this.db.prepare("INSERT INTO capi_meta(key,value) VALUES('binding',?) ON CONFLICT DO NOTHING").run(binding);});}catch(e){this.db.close();throw e;}
  }
  tx(fn){this.db.exec('BEGIN IMMEDIATE');try{const r=fn();this.db.exec('COMMIT');return r;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  activate(mode,now){
    if(!['test','live'].includes(mode)||!Number.isFinite(now))throw Error('Invalid activation');
    return this.tx(()=>{const k='activated:'+mode;this.db.prepare('INSERT INTO capi_meta(key,value) VALUES(?,?) ON CONFLICT DO NOTHING').run(k,String(now));return Number(this.db.prepare('SELECT value FROM capi_meta WHERE key=?').get(k).value);});
  }
  key(dataset,eventName,eventId){return hash(JSON.stringify([String(dataset),eventName,eventId]));}
  itemKey(dataset,eventName,board,item){return hash(JSON.stringify([String(dataset),eventName,String(board),String(item)]));}
  issue(item,code,now){this.db.prepare('INSERT INTO capi_issues(key,code,at) VALUES(?,?,?) ON CONFLICT DO NOTHING').run(hash(String(item)+':'+code),code,now);}
  inspect(record){
    const key=this.key(record.datasetId,record.eventName,record.eventId),itemKey=this.itemKey(record.datasetId,record.eventName,record.boardId,record.itemId);
    const rows=this.db.prepare('SELECT key,item_key,state FROM capi_dispatch WHERE key=? OR item_key=?').all(key,itemKey);
    return !rows.length?null:{state:rows.length===1&&rows[0].key===key&&rows[0].item_key===itemKey?rows[0].state:'CONFLICT',key};
  }
  reserve(record,now){
    return this.tx(()=>{
      const key=this.key(record.datasetId,record.eventName,record.eventId),itemKey=this.itemKey(record.datasetId,record.eventName,record.boardId,record.itemId);
      const existing=this.db.prepare('SELECT * FROM capi_dispatch WHERE key=? OR item_key=?').all(key,itemKey);
      if(existing.length){const same=existing.length===1&&existing[0].key===key&&existing[0].item_key===itemKey;return {claimed:false,state:same?existing[0].state:'CONFLICT',key};}
      const claim=randomUUID();this.db.prepare("INSERT INTO capi_dispatch(key,item_key,event_id,item_id,state,claim,at) VALUES(?,?,?,?,'SENDING',?,?)").run(key,itemKey,record.eventId,String(record.itemId),claim,now);
      return {claimed:true,key,claim,state:'SENDING'};
    });
  }
  finish(reservation,receipt){
    const state=receipt.apiAccepted?'ACKED':receipt.deliveryUnknown?'UNKNOWN':'FAILED';
    const result=this.db.prepare("UPDATE capi_dispatch SET state=?,receipt=? WHERE key=? AND claim=? AND state='SENDING'").run(state,JSON.stringify(receipt),reservation.key,reservation.claim);
    if(result.changes!==1)throw Error('Lost durable CAPI claim');return state;
  }
  scan(now,error=null){this.db.prepare("INSERT INTO capi_meta(key,value) VALUES('scan',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify({at:now,error}));}
  status(){return {states:this.db.prepare('SELECT state,count(*) count FROM capi_dispatch GROUP BY state').all(),issues:this.db.prepare('SELECT code,count(*) count FROM capi_issues GROUP BY code').all(),scan:JSON.parse(this.db.prepare("SELECT value FROM capi_meta WHERE key='scan'").get()?.value||'null')};}
  close(){this.db.close();}
}
module.exports={CapiStore,hash};
