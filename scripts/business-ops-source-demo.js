'use strict';
// Reproducible local synthetic journey; no network or external-system mutation.
const fs=require('node:fs'),path=require('node:path');
const {OperationsStore}=require('../src/services/business-ops/store');
const {SourceInbox,runSourceCycle}=require('../src/services/business-ops/ingestion');
const {seed,stages,caseData,now}=require('../tests/business-ops/scenario');
async function demo(){
 const store=new OperationsStore(':memory:');seed(store);const inbox=new SourceInbox(store),pages=[];
 try{
  for(const source of ['transkriptor','gmail','whatsapp','drive','calendar','manual'])inbox.register({id:'TEST-source-'+source,source,accountId:'TEST-business-account'},{now});
  for(const stage of stages){
   const result=await runSourceCycle(inbox,{streamId:'TEST-source-'+stage.event.source,now:()=>now,
    adapter:{mode:'synthetic',readPage:async()=>({id:'TEST-page-1',nextCursor:'TEST-watermark-1',events:[{...stage.event,id:'TEST-'+stage.event.id}]})}});
   if(result.status!=='accepted')throw Error('Synthetic source fixture failed');
   const reviewed=store.review(result.eventKeys[0],stage.observations,{actor:'synthetic_fixture_reviewer',now:'2026-10-27T09:00:01Z'});
   pages.push({source:stage.event.source,receipt:result,tasks:reviewed.snapshot.tasks.map(t=>({id:t.id,state:t.state}))});
  }
  const snapshot=store.snapshot(caseData.id),result={status:'PASS',scope:'Local synthetic adapters and explicitly supplied reviewed observations only',
   pages,snapshot,sourceHealth:inbox.health({now}),metrics:store.metrics({now}),dispatchEnabled:false,productionWorkerDeployed:false};
  const directory=path.resolve(__dirname,'../tests/out/business-ops-overnight-20261027');fs.mkdirSync(directory,{recursive:true});
  fs.writeFileSync(path.join(directory,'source-demo.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({status:result.status,pages:pages.length,events:result.metrics.events,tasks:snapshot.tasks.length,
   completed:snapshot.tasks.filter(t=>t.state==='completed').length,neverConnected:result.sourceHealth.filter(s=>s.state==='never_connected').length,
   dispatchEnabled:false,output:path.join(directory,'source-demo.json')}));
 }finally{store.close();}
}
if(require.main===module)demo().catch(()=>{console.error('Synthetic source demo failed');process.exitCode=1;});
module.exports={demo};
