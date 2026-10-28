// Explicit read-only snapshot. This does not start a scheduler or send an alert.
import {DatabaseSync} from 'node:sqlite';
import {existsSync,statSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export function readOpsStatus(path,{now=Date.now()}={}){
  if(typeof path!=='string'||!existsSync(path)||!statSync(path).isFile())return {status:'BLOCKED',mode:'READ_ONLY_NO_ALERTS',reason:'existing_database_required'};
  let db;
  try{
    db=new DatabaseSync(path,{readOnly:true});db.exec('PRAGMA query_only=ON');
    const required=['events','messages','conversations','outbox','handoffs','audit','provider_receipts'];
    const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name));
    if(required.some(t=>!tables.has(t)))return {status:'BLOCKED',mode:'READ_ONLY_NO_ALERTS',reason:'assistant_schema_not_present'};
    const group=table=>Object.fromEntries(db.prepare(`SELECT state,count(*) n FROM ${table} GROUP BY state`).all().map(x=>[x.state,x.n]));
    const age=at=>at==null?null:Math.max(0,now-at);
    const newMessages=db.prepare("SELECT count(*) n,min(at) oldest FROM messages WHERE state='NEW'").get();
    const openHandoffs=db.prepare("SELECT count(*) n,min(at) oldest FROM handoffs WHERE state='OPEN'").get();
    const outbox=group('outbox');
    return {status:'PASS',mode:'READ_ONLY_NO_ALERTS',observedAt:new Date(now).toISOString(),
      counts:{events:db.prepare('SELECT count(*) n FROM events').get().n,newMessages:newMessages.n,openHandoffs:openHandoffs.n,outbox,providerReceipts:db.prepare('SELECT count(*) n FROM provider_receipts').get().n},
      oldestAgeMs:{newMessages:age(newMessages.oldest),openHandoffs:age(openHandoffs.oldest)},
      conditions:{hasPendingMessages:newMessages.n>0,hasOpenHandoffs:openHandoffs.n>0,hasUnresolvedSend:(outbox.SENDING??0)+(outbox.UNCERTAIN??0)>0,hasFailedRequests:(outbox.FAILED??0)>0},
      limitations:['Snapshot only; no operational alert sent','SENDING and UNCERTAIN require provider reconciliation before retry','Signature failures, source disconnects and model quotas are not persisted by this draft and are not measured here']};
  }catch{return {status:'FAIL',mode:'READ_ONLY_NO_ALERTS',reason:'database_read_failed'};}
  finally{db?.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const result=readOpsStatus(process.argv[2]);console.log(JSON.stringify(result,null,2));if(result.status!=='PASS')process.exitCode=1;}
