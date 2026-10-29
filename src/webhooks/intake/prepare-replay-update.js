// Offline review packet only. This tool has no n8n transport and cannot publish.
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const shape=require('./atomic-shape.json');
const {intakeSource}=require('./source');
const G=require('../../../config/error-handler.json');
const hash=value=>crypto.createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const edge=node=>({node,type:'main',index:0});
const normalize=connections=>Object.fromEntries(Object.entries(connections).sort(([a],[b])=>a.localeCompare(b)).map(([name,c])=>{
 if(Object.keys(c).some(k=>k!=='main')||!Array.isArray(c.main))throw Error('Unexpected connection kind');
 const main=c.main.map(branch=>branch.map(e=>({node:e.node,type:e.type,index:e.index})));
 while(main.length&&!main.at(-1).length)main.pop();return [name,{main}];
}));
function prepareReplayUpdate(input,{campaign='refi'}={}){
 if(input?.id!==G.bindings.leadIntake||input.nodes?.length!==41)throw Error('Expected the 41-node intake');
 if(!/^[a-f\d-]{36}$/i.test(input.activeVersionId||''))throw Error('Published version required');
 const expectedTypes={...shape.nodes,'Atomic lock':'n8n-nodes-base.httpRequest','Atomic lock result':'n8n-nodes-base.code','Atomic lock failed?':'n8n-nodes-base.if','Atomic lock response':'n8n-nodes-base.respondToWebhook'};
 const expected=structuredClone(shape.connections);
 expected['Needs save?'].main[0]=[edge('Atomic lock')];
 expected['Atomic lock']={main:[[edge('Atomic lock result')]]};
 expected['Atomic lock result']={main:[[edge('Atomic lock failed?')]]};
 expected['Atomic lock failed?']={main:[[edge('Atomic lock response')],[edge('Find query')]]};
 expected['Atomic lock response']={main:[[edge('Stop And Error')]]};
 try{
  assert.equal(new Set(input.nodes.map(n=>n.name)).size,41);
  assert.equal(new Set(input.nodes.map(n=>n.id)).size,41);
  assert.deepEqual(Object.fromEntries(input.nodes.map(n=>[n.name,n.type]).sort(([a],[b])=>a.localeCompare(b))),Object.fromEntries(Object.entries(expectedTypes).sort(([a],[b])=>a.localeCompare(b))));
  assert.deepEqual(normalize(input.connections),normalize(expected));
  assert.equal(input.settings?.errorWorkflow,G.workflowId);
  assert.notEqual(input.nodes.find(n=>n.name==='Stop And Error').disabled,true);
  for(const name of ['WhatsApp recipients','WhatsApp alert'])assert.equal(input.nodes.find(n=>n.name===name).disabled,true);
 }catch{throw Error('Unexpected intake topology or protection state');}
 const replacements=Object.entries({'Validate':'validate.js','Check save':'check-save.js'}).map(([name,sourceFile])=>{
  const n=input.nodes.find(n=>n.name===name),jsCode=intakeSource(sourceFile,campaign);
  if(typeof n.parameters?.jsCode!=='string')throw Error('Missing Code source: '+name);
  new Function('$input','$','$getWorkflowStaticData',jsCode);
  return {nodeId:n.id,name,parameter:'jsCode',sourceFile,fromSha256:hash(n.parameters.jsCode),toSha256:hash(jsCode),jsCode};
 });
 return {kind:'offline-node-parameter-review',workflowId:input.id,expectedPublishedVersion:input.activeVersionId,
  baseline:{nodesSha256:hash(input.nodes),connectionsSha256:hash(input.connections),settingsSha256:hash(input.settings)},
  replacements,preservation:{nodeCount:41,connectionsChanged:false,settingsChanged:false,credentialsChanged:false,staticDataMustBeRetained:true,whatsappEnabled:false},
  deploymentStatus:'BLOCKED',reason:'No n8n change authorized; this packet is not an importable workflow or a publisher.'};
}
if(require.main===module){
 const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('usage: node prepare-replay-update.js private-export.json private-review.json');
 const raw=JSON.parse(fs.readFileSync(input,'utf8')),w=Array.isArray(raw)&&raw.length===1?raw[0]:raw;
 fs.writeFileSync(output,JSON.stringify(prepareReplayUpdate(w),null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify({status:'PASS',scope:'offline preparation only',replacements:2,productionChanges:0}));
}
module.exports={prepareReplayUpdate};
