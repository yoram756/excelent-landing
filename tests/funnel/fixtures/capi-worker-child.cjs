const fs=require('node:fs');
const {CapiStore}=require('../../../src/integrations/meta-capi/store');
const {configuration,CapiWorker}=require('../../../src/integrations/meta-capi/worker');
const [dbFile,fixtureFile,sendLog,operation]=process.argv.slice(2),f=JSON.parse(fs.readFileSync(fixtureFile,'utf8'));
const cfg=configuration(f.campaign),store=new CapiStore(dbFile,cfg.binding);
if(operation==='claim-only'){
 store.activate('test',f.now);
 const claim=store.reserve({datasetId:cfg.datasetId,eventName:cfg.eventName,eventId:f.item.column_values[0].text,boardId:cfg.boardId,itemId:f.item.id},f.now);
 console.log(JSON.stringify({claimed:claim.claimed}));store.close();process.exit(0);
}
const worker=new CapiWorker({store,cfg,mode:'test',now:()=>f.now,monday:{list:async()=>[f.item],read:async()=>f.item},accessToken:'SYNTHETIC_CAPI_CREDENTIAL',testCode:'TEST1234',transport:async()=>{fs.appendFileSync(sendLog,'POST\n');return {status:200,json:async()=>({events_received:1})};}});
worker.tick().then(r=>{console.log(JSON.stringify(r));store.close();}).catch(()=>{store.close();process.exitCode=1;});
