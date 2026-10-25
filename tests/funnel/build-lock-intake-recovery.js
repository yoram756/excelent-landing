// Resume only the failed subworkflow call of an already saved synthetic private-board lead.
const fs=require('fs');
function build(base,checkpoint){
 const {validate:v,save:s,runId}=checkpoint;
 if(runId!=='TEST-lock-intake-20261025-001'||v.name!=='TEST Lock integration'||v.phone!=='972500000097'||v.key!==runId||s.saved!==true||s.request_id!=='3307807626')throw Error('Unexpected synthetic checkpoint');
 const code=(name,js)=>({id:name.replaceAll(' ','-'),name,type:'n8n-nodes-base.code',typeVersion:2,position:[0,0],parameters:{jsCode:js}});
 const http=structuredClone(base.nodes.find(n=>n.name==='Find by phone'));
 http.id='recovery-private-read';http.name='Read saved synthetic lead';http.parameters.jsonBody=JSON.stringify({query:'query($ids:[ID!]){items(ids:$ids){id name board{id} column_values{id text value}}}',variables:{ids:[s.request_id]}});
 const call=structuredClone(base.nodes.find(n=>n.name==='Instant reply'));call.parameters.options.waitForSubWorkflow=true;delete call.onError;
 if(call.parameters.workflowId?.value!=='QEGe2prEvnA4i47J')throw Error('Unverified workflow reference');
 const input=structuredClone(base.nodes.find(n=>n.name==='Instant reply input'));
 const nodes=[{id:'resume-manual',name:'Resume saved synthetic lead',type:'n8n-nodes-base.manualTrigger',typeVersion:1,position:[0,0],parameters:{}},http,
 code('Guard saved synthetic lead',`const r=$input.first().json,i=r.data?.items?.[0];if(r.errors?.length||i?.id!=='3307807626'||i.board?.id!=='5106494186'||!i.name.startsWith('TEST Lock integration'))throw Error('Private synthetic identity mismatch');const c=Object.fromEntries(i.column_values.map(x=>[x.id,x]));if(c.text_mm8cgqcw?.text!=='TEST-lock-intake-20261025-001'||!c.phone_mm8crjmj?.text.includes('500000097'))throw Error('Synthetic checkpoint mismatch');return [{json:{privateReadback:true}}];`),
 code('Validate','return [{json:'+JSON.stringify(v)+'}];'),code('Build mutation','return [{json:{mode:"create"}}];'),code('Check save','return [{json:'+JSON.stringify(s)+'}];'),input,call,
 code('Verify recovered Instant Reply',`const o=$input.first().json;if(o.hasSend!==false||o.skipped!=='disabled')throw Error('Unexpected instant reply result');return [{json:{ok:true,itemId:'3307807626',boardId:'5106494186',runId:'TEST-lock-intake-20261025-001',instantReplyReached:true,instantReplySkipped:o.skipped,noMessages:true,resumedSavedLead:true,webhookTransportTested:false}}];`)];
 const connections={};for(let i=0;i<nodes.length-1;i++)connections[nodes[i].name]={main:[[{node:nodes[i+1].name,type:'main',index:0}]]};nodes.forEach((n,i)=>n.position=[i*220,0]);
 return {name:'TEST resume saved intake Instant Reply NO DELIVERY 20261025',active:false,nodes,connections,pinData:{},settings:{executionOrder:'v1',saveDataSuccessExecution:'all',saveDataErrorExecution:'all',saveManualExecutions:true}};
}
module.exports={build};
if(require.main===module){const [input,checkpoint,output]=process.argv.slice(2);const w=build(JSON.parse(fs.readFileSync(input)),JSON.parse(fs.readFileSync(checkpoint)));fs.writeFileSync(output,JSON.stringify(w,null,2)+'\n');console.log(JSON.stringify({name:w.name,nodes:w.nodes.length,noWrites:true}));}
