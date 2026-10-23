// Test-only abrupt exit immediately after VACUUM completed, before quarantine.
const {DatabaseSync}=require('node:sqlite'),path=require('node:path');
const {Store}=require('../../src/services/lifecycle/store'),{backup,restore}=require('../../src/services/lifecycle/backup'),campaign=require('../../config/lifecycle/refi.json');
const root=process.argv[2],s=new Store(path.join(root,'source.sqlite'),{sandbox:true}),now='2026-10-18T09:00:00.000Z';
s.ingest({eventId:'crash-source',campaign,now,receipt:{version:'lifecycle-consent-v1',campaignId:'refi',receivedAt:now,recipients:{phone:'0500000040',email:null},grants:{whatsapp:false,email:false,sms:false}}});
if(process.argv[3]==='restore'){
 const fs=require('node:fs'),snapshot=path.join(root,'snapshot.sqlite'),manifest=backup(s,{target:snapshot,root,now});
 fs.copyFileSync=function(input,output){fs.writeFileSync(output,'',{flag:'wx'});process.exit(73);};
 restore({source:snapshot,manifest,target:path.join(root,'restored.sqlite'),root,now});process.exit(1);
}
const prepare=DatabaseSync.prototype.prepare;
DatabaseSync.prototype.prepare=function(sql){const statement=prepare.call(this,sql);if(sql!=='VACUUM INTO ?')return statement;return {run(...args){statement.run(...args);process.exit(73);}};};
backup(s,{target:path.join(root,'snapshot.sqlite'),root,now});process.exit(1);
