// Protected test webhook over the already isolated private-board runtime test.
const fs=require('node:fs'),crypto=require('node:crypto');
const {build:buildSandbox}=require('./build-lock-intake-sandbox');
function build(base,{webhookPath,runId='TEST-lock-http-20261025-001',phone='0500000098'}={}){
 if(!/^excelent-intake-test-[a-f0-9]{32}$/.test(webhookPath||''))throw Error('Fresh private test path required');
 const w=buildSandbox(base,{runId,phone}),n=name=>w.nodes.find(x=>x.name===name);
 const fixtureCode=n('Synthetic fixture').parameters.jsCode;
 const fixture=new Function(fixtureCode)()[0].json;
 const wh=n('Lead webhook');wh.type='n8n-nodes-base.webhook';wh.typeVersion=2;wh.webhookId=crypto.randomUUID();
 wh.parameters={httpMethod:'POST',path:webhookPath,authentication:'headerAuth',responseMode:'responseNode',options:{}};
 wh.credentials={httpHeaderAuth:structuredClone(n('Lock').credentials.httpHeaderAuth)};
 // Never forward the incoming Authorization header into subsequent nodes or save execution payloads.
 n('Synthetic fixture').parameters.jsCode=`const x=$input.first().json;const expected=${JSON.stringify(fixture.body)};const b=x.body;if(!b||Object.keys(b).length!==Object.keys(expected).length||Object.keys(expected).some(k=>JSON.stringify(b[k])!==JSON.stringify(expected[k])))throw Error('Synthetic HTTP body only');return [{json:{body:expected,headers:{}}}];`;
 w.name='TEST HTTP intake Lock private CRM NO DELIVERY 20261025';
 w.settings={executionOrder:'v1',saveDataSuccessExecution:'none',saveDataErrorExecution:'none',saveManualExecutions:false};
 n('Instant reply').alwaysOutputData=true;
 n('Assert final test evidence').parameters.jsCode=`const s=$('Check save').first().json,l=$('Lock').first().json,v=$('Validate').first().json,i=$('Instant reply input').first().json;if(s.saved!==true||l.locked!==true||v.ok!==true||v.name!=='TEST Lock integration'||v.key!==${JSON.stringify(runId)}||i.itemId!==s.request_id)throw Error('Full HTTP test assertion failed');return [{json:{ok:true,executionId:$execution.id,runId:${JSON.stringify(runId)},boardId:'5106494186',itemId:s.request_id,lockCredentialVerified:true,privateReadbackVerified:true,instantReplyCallCompleted:true,noMessagesConfigured:true,webhookTransportTested:true,productionMappingTested:false}}];`;
 const result={id:'http-test-response',name:'HTTP test result',type:'n8n-nodes-base.respondToWebhook',typeVersion:1.1,position:[0,0],parameters:{respondWith:'json',responseBody:'={{ JSON.stringify($json) }}',options:{responseCode:200}}};w.nodes.push(result);
 w.connections['Assert final test evidence']={main:[[{node:result.name,type:'main',index:0}]]};
 for(const name of ['Reply early','Reply failed','Reply locked']){const x=n(name);x.type='n8n-nodes-base.respondToWebhook';x.typeVersion=1.1;x.parameters={respondWith:'json',responseBody:JSON.stringify({ok:false,reason:name}),options:{responseCode:name==='Reply failed'?502:409}};}
 return {workflow:w,payload:fixture.body};
}
module.exports={build};
if(require.main===module){const [input,dir]=process.argv.slice(2),p=require('node:path');const webhookPath='excelent-intake-test-'+crypto.randomBytes(16).toString('hex');const{workflow,payload}=build(JSON.parse(fs.readFileSync(input)),{webhookPath});fs.writeFileSync(p.join(dir,'http-intake.json'),JSON.stringify(workflow,null,2)+'\n');fs.writeFileSync(p.join(dir,'http-payload.json'),JSON.stringify(payload)+'\n');fs.writeFileSync(p.join(dir,'http-manifest.json'),JSON.stringify({webhookPath,runId:payload.idempotency_key,phone:payload.phone})+'\n');console.log(JSON.stringify({name:workflow.name,nodes:workflow.nodes.length,active:false,protected:true,saveExecutionData:false}));}
