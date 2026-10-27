'use strict';
const fs=require('node:fs'),path=require('node:path');
const {OperationsStore}=require('../src/services/business-ops/store');
const {seed,stages,applyStage,caseData,now}=require('../tests/business-ops/scenario');
const {pack,desired}=require('../src/services/business-ops/monday');
function demo({directory,runId='20261027-journey'}){
 fs.mkdirSync(directory,{recursive:true});const dbFile=path.resolve(directory,'business-ops.sqlite');
 const store=new OperationsStore(dbFile);try{
  if(!store.get('SELECT id FROM ops_cases WHERE id=?',caseData.id))seed(store);
  const results=[];
  for(const stage of stages){const {snapshot}=applyStage(store,stage);const t={runId};const projection=desired(snapshot,t);results.push({stage:stage.name,caseVersion:snapshot.version,tasks:snapshot.tasks.map(t=>({id:t.id,key:t.commitmentKey,owner:t.owner,state:t.state,evidenceCount:t.evidence.length})),projection});
   fs.writeFileSync(path.join(directory,stage.name+'.json'),JSON.stringify({stage:stage.name,synthetic:true,snapshot,remoteValue:pack(snapshot,t),projection},null,2));
   if(stage.name==='call')store.draft(caseData.id,'collect-documents',{now});
  }
  const snapshot=store.snapshot(caseData.id);const report={scope:'local SQLite, synthetic reviewed observations; no live source intake or model call',runId,dispatchEnabled:false,stages:results,metrics:store.metrics({now}),ownerDigestDraft:store.digest(caseData.id,{owner:'neria',now}),drafts:store.all('SELECT state,payload FROM ops_drafts').map(r=>({state:r.state,...JSON.parse(r.payload)}))};
  fs.writeFileSync(path.join(directory,'report.json'),JSON.stringify(report,null,2));
  return {dbFile,reportFile:path.join(directory,'report.json'),tasks:snapshot.tasks.map(t=>({key:t.commitmentKey,state:t.state,owner:t.owner})),dispatchEnabled:false};
 }finally{store.close();}
}
if(require.main===module){const directory=path.resolve(process.argv[2]||'tests/out/business-ops-20261027');console.log(JSON.stringify(demo({directory}),null,2));}
module.exports={demo};
