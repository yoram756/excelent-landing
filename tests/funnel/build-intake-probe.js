// Manual integration probe: exactly one synthetic lead, no alert nodes, archive on success.
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../..');
const read=n=>fs.readFileSync(path.join(root,'automation/intake',n+'.js'),'utf8').replace(/\r\n/g,'\n');
const nodes=[],connections={};
const add=(name,type,parameters,extra={})=>nodes.push({id:'intake-probe-'+nodes.length,name,type,typeVersion:type==='n8n-nodes-base.httpRequest'?4.2:type==='n8n-nodes-base.code'?2:1,position:[nodes.length*220,0],parameters,...extra});
const code=(name,js)=>add(name,'n8n-nodes-base.code',{jsCode:js});
const http=(name,jsonBody)=>add(name,'n8n-nodes-base.httpRequest',{method:'POST',url:'https://api.monday.com/v2',authentication:'predefinedCredentialType',nodeCredentialType:'mondayComApi',sendHeaders:true,headerParameters:{parameters:[{name:'API-Version',value:'2024-10'}]},sendBody:true,specifyBody:'json',jsonBody,options:{timeout:20000}},{credentials:{mondayComApi:{id:'Un7HBqZvldpVYUaB',name:'Monday.com account'}}});
add('Manual only','n8n-nodes-base.manualTrigger',{});
code('Fixture',`return [{json:{body:{product:'LP1',first_name:'TEST LP1 RELEASE 20261020',phone:'0500000040',idempotency_key:'lp1-release-20261020-001',service_request:true,service_request_at:new Date().toISOString(),marketing_consent:false,money_included:false,answers:{ask:'check',when:'week'}},headers:{}}}];`);
code('Validate',read('validate'));
code('Find query',read('find-query'));
http('Find by phone','={{ JSON.stringify({query:$json.query,variables:$json.variables}) }}');
code('Guard synthetic phone ownership',`const r=$input.first().json;const rows=r.data?.items_page_by_column_values?.items;if(r.errors?.length||!Array.isArray(rows)||rows.length>1||rows.some(it=>it.name!=='TEST LP1 RELEASE 20261020 0500000040'))throw new Error('Synthetic phone conflict or lookup error; no write permitted');return [{json:r}];`);
code('Build mutation',read('build-mutation'));
http('Save to Monday','={{ JSON.stringify({query:$json.query,variables:$json.variables}) }}');
code('Check save',read('check-save'));
code('Read query',`const s=$input.first().json;if(!s.saved||!/^\\d+$/.test(s.request_id))throw new Error('Save not confirmed');return [{json:{query:'query($ids:[ID!]){items(ids:$ids){id name column_values(ids:["refi_phone","boolean_mm8848pn","boolean_mm88mzry","refi_source"]){id text value}}}',variables:{ids:[s.request_id]}}}];`);
http('Read saved lead','={{ JSON.stringify({query:$json.query,variables:$json.variables}) }}');
code('Verify and deduplicate',`function validateAgain($input,$getWorkflowStaticData){${read('validate')}}
const r=$input.first().json;const item=r.data?.items?.[0];
if(r.errors?.length||!item||item.id!==$('Check save').first().json.request_id||!item.name.startsWith('TEST LP1 RELEASE 20261020'))throw new Error('Unexpected saved lead');
const c=Object.fromEntries(item.column_values.map(v=>[v.id,v]));
if(!c.refi_phone.text.includes('500000040')||![true,'true'].includes(JSON.parse(c.boolean_mm8848pn.value||'null')?.checked)||[true,'true'].includes(JSON.parse(c.boolean_mm88mzry.value||'null')?.checked)||c.refi_source.text!=='קליטת LP1')throw new Error('Consent, source or phone readback mismatch');
const duplicate=validateAgain({first:()=>({json:$('Fixture').first().json})},$getWorkflowStaticData)[0].json;
if(!duplicate.duplicate||duplicate.request_id!==item.id)throw new Error('Idempotency failed');
return [{json:{itemId:item.id,saved:true,serviceConsent:true,marketingConsent:false,duplicateSameId:true,noMessages:true}}];`);
http('Archive synthetic lead','={{ JSON.stringify({query:"mutation($id:ID!){archive_item(item_id:$id){id}}",variables:{id:$json.itemId}}) }}');
code('Result',`const r=$input.first().json;const proof=$('Verify and deduplicate').first().json;if(r.errors?.length||r.data?.archive_item?.id!==proof.itemId)throw new Error('Test lead archive not confirmed');return [{json:{...proof,archived:true,scope:'manual n8n validation to Monday save/readback/idempotency/archive; no messages or schedules'}}];`);
for(let i=0;i<nodes.length-1;i++)connections[nodes[i].name]={main:[[{node:nodes[i+1].name,type:'main',index:0}]]};
for(const node of nodes){const body=node.parameters.jsonBody;if(typeof body==='string'&&body.startsWith('={{'))node.parameters.jsonBody='={{'+body.slice(3,-2).replace(/\}\}/g,'} }')+'}}';}
fs.writeFileSync(path.join(root,'automation/funnel/dist/intake-probe.json'),JSON.stringify({name:'TEST LP1 isolated intake 20261020 NO MESSAGES',active:false,settings:{executionOrder:'v1',timezone:'Asia/Jerusalem'},nodes,connections},null,2));
console.log('Built manual-only isolated intake probe');
