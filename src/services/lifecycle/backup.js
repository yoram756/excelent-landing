// Offline sandbox recovery only. No overwrite, no production path discovery,
// no automatic resume. A checksum detects corruption; it is not a signature.
const fs=require('node:fs'),path=require('node:path'),{createHash,randomUUID}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite'),{Store}=require('./store');
const TABLES=['subjects','enrollments','inbox','events','projections','outbox','feedback','feedback_links','runtime_control'];
function location(file,root){
 if(typeof root!=='string'||typeof file!=='string'||!path.isAbsolute(file)||!path.isAbsolute(root)||/^(?:file:|\\\\|\/\/)/i.test(file))throw Error('Explicit local absolute recovery paths required');
 const base=fs.realpathSync(root),parent=fs.realpathSync(path.dirname(file)),relative=path.relative(base,parent);
 if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative)||! /^[A-Za-z0-9_.-]+\.sqlite$/.test(path.basename(file)))throw Error('Recovery path escapes sandbox root');
 const resolved=path.join(parent,path.basename(file));
 if(fs.existsSync(resolved)&&fs.lstatSync(resolved).isSymbolicLink())throw Error('Recovery links are not supported');
 return resolved;
}
const digest=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const exists=file=>!!fs.lstatSync(file,{throwIfNoEntry:false});
function noSidecars(file){if(['-wal','-shm','-journal'].some(suffix=>exists(file+suffix)))throw Error('Recovery path has existing SQLite sidecars');}
function unused(file){if(exists(file)||exists(file+'.manifest.json'))throw Error('Recovery destination already exists');noSidecars(file);}
const clock=now=>{if(typeof now!=='string'||!Number.isFinite(Date.parse(now)))throw Error('Invalid recovery clock');return new Date(now).toISOString();};
function inspect(file){
 const db=new DatabaseSync(file,{readOnly:true});
 try{
  if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Backup database integrity failed');
  if(db.prepare('PRAGMA user_version').get().user_version!==3)throw Error('Unsupported backup schema');
  if(db.prepare("SELECT value FROM runtime_control WHERE key='restore_pending'").get()?.value!=='1')throw Error('Backup is not quarantined');
  const tables=Object.fromEntries(TABLES.map(table=>[table,db.prepare('SELECT COUNT(*) AS n FROM '+table).get().n]));
  const frontier=db.prepare('SELECT COALESCE(MAX(seq),0) AS seq FROM events').get().seq;
  return {schemaVersion:3,tables,eventFrontier:frontier};
 }finally{db.close();}
}
function backup(store,{target,root,now}){
 const at=clock(now),file=location(target,root),manifestPath=file+'.manifest.json';
 unused(file);
 // The intermediate file cannot be opened by Store, and the final target does
 // not exist until quarantine is committed. Hard-link publication is atomic
 // and refuses an existing target. Unsupported filesystems fail closed.
 const staging=path.join(path.dirname(file),'.lp1-recovery-'+randomUUID()+'.partial');
 const fd=fs.openSync(staging,'wx',0o600);fs.closeSync(fd);
 try{
 store.db.prepare('VACUUM INTO ?').run(staging);
 // Quarantine the snapshot before issuing a valid manifest. A crash during
 // restore must not leave a copied database eligible for queue consumption.
 const snapshot=new DatabaseSync(staging);
 try{snapshot.exec("PRAGMA synchronous=FULL; BEGIN IMMEDIATE; INSERT INTO runtime_control(key,value) VALUES('restore_pending','1') ON CONFLICT(key) DO UPDATE SET value='1'; COMMIT;");}finally{snapshot.close();}
 const manifest={format:'excelent-sandbox-backup-v1',createdAt:at,sha256:digest(staging),...inspect(staging)};
 unused(file);fs.linkSync(staging,file);
 const metadata=fs.openSync(manifestPath,'wx',0o600);
 try{fs.writeFileSync(metadata,JSON.stringify(manifest,null,2)+'\n');fs.fsyncSync(metadata);}finally{fs.closeSync(metadata);}
 return manifest;
 }finally{fs.unlinkSync(staging);}
}
function restore({source,manifest,target,root,now}){
 const at=clock(now),input=location(source,root),output=location(target,root);
 if(input===output||exists(output))throw Error('Restore destination must be a new sandbox database');
 noSidecars(input);unused(output);
 if(manifest?.format!=='excelent-sandbox-backup-v1'||! /^[a-f0-9]{64}$/.test(manifest.sha256||'')||digest(input)!==manifest.sha256)throw Error('Backup checksum mismatch');
 const actual=inspect(input);
 if(JSON.stringify(actual)!==JSON.stringify({schemaVersion:manifest.schemaVersion,tables:manifest.tables,eventFrontier:manifest.eventFrontier}))throw Error('Backup manifest mismatch');
 const staging=path.join(path.dirname(output),'.lp1-recovery-'+randomUUID()+'.partial');
 fs.copyFileSync(input,staging,fs.constants.COPYFILE_EXCL);fs.chmodSync(staging,0o600);
 try{
  const db=new DatabaseSync(staging);
  try{
   db.exec('PRAGMA synchronous=FULL; BEGIN IMMEDIATE');
   db.prepare("INSERT INTO runtime_control(key,value) VALUES('restore_source',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify({sha256:manifest.sha256,eventFrontier:manifest.eventFrontier,restoredAt:at}));
   db.exec("UPDATE outbox SET state='queued',token=NULL,lease_until=NULL,note='restore_revoked_reservation' WHERE state='reserved'; UPDATE outbox SET state='unknown',note='restore_unresolved_attempt' WHERE state='inflight'; UPDATE projections SET state='queued',token=NULL,lease_until=NULL WHERE state='reserved'; UPDATE projections SET state='unknown',last_error='restore_unresolved_remote_write' WHERE state='inflight'; COMMIT;");
  }finally{db.close();}
  inspect(staging);unused(output);fs.linkSync(staging,output);
  return new Store(output,{sandbox:true});
 }finally{fs.unlinkSync(staging);}
}
module.exports={backup,restore};
