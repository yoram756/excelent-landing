// Add controlled failure routes without replacing deployed intake logic or provider credentials.
const fs=require('fs');
const C=require('../../config/campaigns/refi.json'),G=require('../../../config/error-handler.json');
const {library,nodeId,edge,link,code,condition}=require('./build-error-workflow');
function patch(w,{campaign:c=C,global:g=G,role}={}){
 if(!g.workflowId)throw Error('Central workflow ID must be configured');
 if(!['leadIntake','lpSignup','whatsappEngine'].includes(role))throw Error('Unknown core workflow role');
 if(w.nodes.some(n=>n.name===g.controlledStopNode))throw Error('Workflow already patched; export a fresh baseline');
 const original=w.nodes.slice(),lib=library();
 const add=n=>{if(w.nodes.some(x=>x.name===n.name))throw Error('Ambiguous guard node '+n.name);w.nodes.push(n);return n;};
 const stop=add({id:nodeId('stop:'+role),name:g.controlledStopNode,type:'n8n-nodes-base.stopAndError',typeVersion:1,position:[1800,900],parameters:{errorType:'errorObject',errorObject:'={{ JSON.stringify({message:$json.__centralFailure.message,schema:"central-error-v1",code:$json.__centralFailure.code,workflowId:$workflow.id,boardId:'+JSON.stringify(String(c.board))+',verifiedItem:!!$json.__centralFailure.itemId,itemId:$json.__centralFailure.itemId || null}) }}'}});
 const routeAfter=(from,guardName,guardCode,{reply=false}={})=>{
  const source=w.nodes.find(n=>n.name===from);if(!source)throw Error('Missing source '+from);
  const pos=source.position||[0,0],guard=add(code(guardName,[pos[0]+100,pos[1]+300],guardCode));
  const branch=add(condition(guardName+'?', [pos[0]+300,pos[1]+300],'={{ !!$json.__centralFailure }}'));
  const previous=w.connections[from]||{main:[[]]};w.connections[from]=link(guard.name);w.connections[guard.name]=link(branch.name);
  w.connections[branch.name]={main:[[edge(stop.name)],previous.main?.[0]||[]]};
  if(reply){
   const response=add({id:nodeId(guardName+':reply'),name:guardName+' response',type:'n8n-nodes-base.respondToWebhook',typeVersion:1.1,position:[pos[0]+500,pos[1]+500],parameters:{respondWith:'json',responseBody:'={{ $json.body || ($json.ok ? {request_id:$json.request_id} : {error:$json.error || $json.__centralFailure.code}) }}',options:{responseCode:'={{ $json.status || $json.__centralFailure.httpStatus || 500 }}'}}});
   w.connections[branch.name].main[0]=[edge(response.name)];w.connections[response.name]=link(stop.name);
  }
 };
 const classifyCode=lib+'\nconst r=$input.first().json;const f=classify(r);return [{json:f?{...r,__centralFailure:{...f,itemId:null}}:r}];';
 if(role!=='whatsappEngine'){
  if(!original.some(n=>n.name==='Validate'))throw Error('No validation node');
  // A honeypot is acknowledged before Stop And Error; its contents never enter the alert.
  const validate=w.nodes.find(n=>n.name==='Validate');
  if(role==='lpSignup')validate.parameters.jsCode=validate.parameters.jsCode.replace("if(b.website) return rep(200,{request_id:'S'+now.toString(36).toUpperCase()});","if(b.website) return [{json:{action:'reply',status:200,body:{request_id:'S'+now.toString(36).toUpperCase()},__centralFailure:{code:'security_violation',message:'Honeypot guard rejected execution',httpStatus:200}}}];");
  routeAfter('Validate','Guard validation',classifyCode,{reply:true});
  if(role==='lpSignup')routeAfter('Known phone?','Guard duplicate lookup',classifyCode,{reply:true});
 }
 for(const n of original){
  if(!['n8n-nodes-base.httpRequest','n8n-nodes-base.gmail'].includes(n.type)||n.disabled)continue;
  const contextName='Error context: '+n.name,guardName='Guard provider: '+n.name;
  // Legacy inline GraphQL braces can close an n8n expression prematurely, even inside a string.
  const body=n.parameters.jsonBody;
  if(typeof body==='string'&&body.startsWith('={{')){
   let inner=body.slice(3,-2);while(/\}\}/.test(inner))inner=inner.replace(/\}\}/g,'} }');
   n.parameters.jsonBody='={{'+inner+'}}';
  }
  const before=add(code(contextName,[n.position[0]-100,n.position[1]+450],
   'const r=$json;let itemId=null;'+(role==='whatsappEngine'?
   'try{const candidate=String(r.itemId||$("Has send?").item.json.itemId||"");const items=$("Items").first().json.data.boards[0].items_page.items;if(items.some(i=>String(i.id)===candidate))itemId=candidate;}catch(e){}':
   role==='leadIntake'?'try{const candidate=String(r.itemId||"");const items=$("Find by phone").first().json.data.items_page_by_column_values.items;if(items.some(i=>String(i.id)===candidate))itemId=candidate;}catch(e){}':'')+
   'return {json:{...r,__centralContext:{itemId}}};'));
  before.parameters.mode='runOnceForEachItem';
  // Redirect existing inputs only. Original body expressions continue to see the same fields.
  for(const con of Object.values(w.connections))for(const branch of con.main||[])for(const target of branch)if(target.node===n.name)target.node=before.name;
  w.connections[before.name]=link(n.name);
  n.onError='continueRegularOutput';n.continueOnFail=false;
  const guardCode=lib+'\nconst out=[];for(let i=0;i<$input.all().length;i++){const r=$input.all()[i].json;const f=classify(r,{provider:true});let target=null;try{target=$('+JSON.stringify(contextName)+').itemMatching(i).json.__centralContext.itemId;}catch(e){}out.push({json:f?{...r,__centralFailure:{...f,itemId:target}}:r,pairedItem:{item:i}});}return out;';
  routeAfter(n.name,guardName,guardCode);
 }
 w.settings={...w.settings,errorWorkflow:g.workflowId,saveDataErrorExecution:'all'};
 delete w.pinData;w.pinData={};
 return w;
}
if(require.main===module){const [input,output,role]=process.argv.slice(2);if(!input||!output||!role)throw Error('usage: input.json output.json role');const w=patch(JSON.parse(fs.readFileSync(input,'utf8')),{role});fs.writeFileSync(output,JSON.stringify({name:w.name,nodes:w.nodes,connections:w.connections,settings:w.settings,pinData:{}},null,2)+'\n');console.log(JSON.stringify({workflow:w.id,nodes:w.nodes.length,role,errorWorkflow:w.settings.errorWorkflow}));}
module.exports={patch};
