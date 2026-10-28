// Minimal migration of the guarded intake. Does not rewrite existing Code nodes,
// credentials, settings, disabled send nodes, or central-error routes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const G=require('../../../config/error-handler.json');
const shape=require('./atomic-shape.json');
const id=name=>{const h=crypto.createHash('sha256').update('atomic-intake-v1:'+name).digest('hex');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20,32);};
const edge=node=>({node,type:'main',index:0});
const link=node=>({main:[[edge(node)]]});
const normalize=connections=>Object.fromEntries(Object.entries(connections).sort(([a],[b])=>a.localeCompare(b)).map(([name,c])=>{
  if(Object.keys(c).some(k=>k!=='main')||!Array.isArray(c.main))throw Error('Unexpected guarded connection kind');
  const main=c.main.map(branch=>branch.map(e=>({node:e.node,type:e.type,index:e.index})));
  while(main.length && main.at(-1).length===0)main.pop();return [name,{main}];
}));
function patchGuardedIntake(input,{lockUrl,lockCredentialId}){
  if(input?.id!==G.bindings.leadIntake || !Array.isArray(input.nodes) || input.nodes.length!==37)throw Error('Unexpected guarded intake workflow');
  if(!/^https?:\/\/[\w.-]+(:\d{2,5})?$/.test(String(lockUrl||'')))throw Error('LOCK_SERVER_URL like http://host:8787 required');
  if(!/^\w{8,40}$/.test(String(lockCredentialId||'')))throw Error('LOCK_CREDENTIAL_ID required');
  if(new Set(input.nodes.map(n=>n.name)).size!==37 || new Set(input.nodes.map(n=>n.id)).size!==37)throw Error('Ambiguous guarded intake nodes');
  try{
    assert.deepEqual(Object.fromEntries(input.nodes.map(n=>[n.name,n.type]).sort(([a],[b])=>a.localeCompare(b))),shape.nodes);
    assert.deepEqual(normalize(input.connections),normalize(shape.connections));
    assert.equal(input.settings?.errorWorkflow,G.workflowId);
    assert.equal(input.nodes.find(n=>n.name==='Stop And Error').disabled===true,false);
    for(const name of ['WhatsApp recipients','WhatsApp alert'])assert.equal(input.nodes.find(n=>n.name===name).disabled,true);
  }catch{throw Error('Unexpected guarded intake topology or protection state');}
  const w=structuredClone(input),p=w.nodes.find(n=>n.name==='Find query').position;
  const add=(name,type,offset,parameters,extra={})=>w.nodes.push({id:id(name),name,type,typeVersion:2,position:[p[0]+offset[0],p[1]+offset[1]],parameters,...extra});
  add('Atomic lock','n8n-nodes-base.httpRequest',[-800,0],{
    method:'POST',url:lockUrl+'/lock',authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',
    sendBody:true,specifyBody:'json',jsonBody:"={{ JSON.stringify({phone:$('Validate').first().json.phone,source:'lead-intake'}) }}",
    options:{timeout:5000,response:{response:{fullResponse:true,neverError:true,responseFormat:'json'}}}
  },{typeVersion:4.2,onError:'continueRegularOutput',retryOnFail:false,credentials:{httpHeaderAuth:{id:lockCredentialId,name:'Lock server'}}});
  add('Atomic lock result','n8n-nodes-base.code',[-600,0],{jsCode:fs.readFileSync(path.join(__dirname,'atomic-lock-result.js'),'utf8').replace(/\r\n/g,'\n')});
  add('Atomic lock failed?','n8n-nodes-base.if',[-400,0],{conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict',version:1},conditions:[{id:id('failed-condition'),leftValue:'={{ !!$json.__centralFailure }}',rightValue:true,operator:{type:'boolean',operation:'true',singleValue:true}}],combinator:'and'},options:{}});
  add('Atomic lock response','n8n-nodes-base.respondToWebhook',[-200,250],{respondWith:'json',responseBody:'={{ $json.body }}',options:{responseCode:'={{ $json.status }}'}},{typeVersion:1.1});
  w.connections['Needs save?'].main[0]=[edge('Atomic lock')];
  w.connections['Atomic lock']=link('Atomic lock result');
  w.connections['Atomic lock result']=link('Atomic lock failed?');
  w.connections['Atomic lock failed?']={main:[[edge('Atomic lock response')],[edge('Find query')]]};
  w.connections['Atomic lock response']=link('Stop And Error');
  // Imports deliberately omit private execution/static data. A node-only deployment
  // must retain the current runtime staticData; never import this as a replacement database record.
  return {name:w.name,nodes:w.nodes,connections:w.connections,settings:w.settings,pinData:{}};
}
// n8n's editor appends imported nodes. This artifact intentionally contains only
// new nodes and their internal links; the small explicit plan replaces the one
// existing edge and connects the gate to existing nodes without deleting them.
function incrementalGuardedIntake(input,options){
  const full=patchGuardedIntake(input,options),oldIds=new Set(input.nodes.map(n=>n.id));
  const nodes=full.nodes.filter(n=>!oldIds.has(n.id)),names=new Set(nodes.map(n=>n.name));
  const connections={},add=[];
  for(const [from,c] of Object.entries(full.connections)){
    const main=c.main.map((branch,output)=>branch.filter(e=>{
      if(names.has(from)&&names.has(e.node))return true;
      if(names.has(from)||names.has(e.node))add.push({from,output,to:e.node,input:e.index});
      return false;
    }));
    while(main.length&&!main.at(-1).length)main.pop();
    if(main.length)connections[from]={main};
  }
  return {artifact:{nodes,connections,pinData:{}},rewiring:{remove:[{from:'Needs save?',output:0,to:'Find query',input:0}],add,expectedNodeCount:41,settingsChanged:false}};
}
module.exports={patchGuardedIntake,incrementalGuardedIntake};
