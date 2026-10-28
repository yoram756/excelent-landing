// Apply the verified intake sources to an existing n8n export, preserving settings,
// credentials and webhook configuration. Input/output exports remain private.
// Also wires the 60 second phone lock (lock-server.js) before "Find query" and the instant reply after the response.
// Env for the CLI: LOCK_SERVER_URL (n8n's address of the lock service), LOCK_CREDENTIAL_ID (n8n Header Auth credential
// holding "Authorization: Bearer <LOCK_SERVER_TOKEN>"), INSTANT_REPLY_WORKFLOW_ID (the imported instant reply workflow).
const fs=require('fs'),crypto=require('crypto'),{intakeSource}=require('./source');
const {createPayloadExpression}=require('./monday-payload');
const link=name=>({main:[[{node:name,type:'main',index:0}]]});
const nodeId=name=>{const h=crypto.createHash('sha1').update('intake:'+name).digest('hex');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20,32);};
const ifTrue=(name,pos,expr)=>({id:nodeId(name),name,type:'n8n-nodes-base.if',typeVersion:2,position:pos,parameters:{conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict'},conditions:[{id:nodeId(name+':c'),leftValue:expr,rightValue:true,operator:{type:'boolean',operation:'true',singleValue:true}}],combinator:'and'},options:{}}});

const patchIntake=(w,{campaign='refi',lockUrl,lockCredentialId,instantWorkflowId})=>{
 if(w?.nodes?.length===37)return require('./atomic-export').patchGuardedIntake(w,{lockUrl,lockCredentialId});
 if(w.id!=='8W7MymUCLpPnilJs'||w.nodes.length!==18)throw Error('Unexpected intake workflow');
 if(!/^https?:\/\/[\w.-]+(:\d{2,5})?$/.test(String(lockUrl||'')))throw Error('LOCK_SERVER_URL like http://host:8787 required');
 if(!/^\w{8,40}$/.test(String(lockCredentialId||'')))throw Error('LOCK_CREDENTIAL_ID required');
 if(!/^\w{8,40}$/.test(String(instantWorkflowId||'')))throw Error('INSTANT_REPLY_WORKFLOW_ID required');
 const sources={'Validate':'validate.js','Find query':'find-query.js','Build mutation':'build-mutation.js','Check save':'check-save.js'};
 for(const [name,file]of Object.entries(sources)){
  const matches=w.nodes.filter(n=>n.name===name&&n.type==='n8n-nodes-base.code');
  if(matches.length!==1)throw Error('Missing/ambiguous source node '+name);
  matches[0].parameters.jsCode=intakeSource(file,campaign);
 }
 const save=w.nodes.filter(n=>n.name==='Save to Monday'&&n.type==='n8n-nodes-base.httpRequest');
 if(save.length!==1)throw Error('Missing/ambiguous Save to Monday node');
 save[0].parameters={...save[0].parameters,jsonBody:createPayloadExpression(campaign)};
 // Respond after the confirmed save, before optional internal notification delivery.
 // Accept only the two known success layouts; parallel or unknown routes need review.
 const exactly=(from,to)=>{const out=w.connections[from]?.main?.[0];return out?.length===1&&out[0].node===to&&out[0].type==='main'&&out[0].index===0;};
 const legacy=exactly('Saved?','Alert query')&&exactly('Alert Yoram','Reply saved');
 const responseFirst=exactly('Saved?','Reply saved')&&exactly('Reply saved','Alert query')&&exactly('Alert Yoram','Email alert');
 if(!legacy&&!responseFirst)throw Error('Unexpected success routing');
 w.connections['Saved?'].main[0]=[{node:'Reply saved',type:'main',index:0}];
 w.connections['Reply saved']=link('Alert query');
 w.connections['Alert Yoram']=link('Email alert');

 // Lock: admitLead must succeed before any Monday write. No continue-on-fail: if the service is down the
 // request fails and the sender retries, instead of saving without the lock.
 const into=[];for(const [from,c] of Object.entries(w.connections))c.main.forEach((br,i)=>br.forEach((t,j)=>{if(t.node==='Find query')into.push([from,i,j]);}));
 if(into.length!==1)throw Error('Expected one connection into Find query');
 const fq=w.nodes.find(n=>n.name==='Find query');const [x,y]=fq.position;
 w.nodes.push(
  {id:nodeId('Lock'),name:'Lock',type:'n8n-nodes-base.httpRequest',typeVersion:4.2,position:[x-600,y],retryOnFail:true,maxTries:3,waitBetweenTries:1000,
   credentials:{httpHeaderAuth:{id:lockCredentialId,name:'Lock server'}},
   parameters:{method:'POST',url:lockUrl+'/lock',authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',sendBody:true,specifyBody:'json',
    jsonBody:"={{ JSON.stringify({phone:$('Validate').first().json.phone,source:'lead-intake'}) }}",options:{timeout:5000}}},
  ifTrue('Locked?',[x-400,y],'={{ $json.locked === true }}'),
  // Find query reads its input as the Validate output; hand it back after the lock call.
  {id:nodeId('Restore intake'),name:'Restore intake',type:'n8n-nodes-base.code',typeVersion:2,position:[x-200,y],parameters:{jsCode:"return [{ json: $('Validate').first().json }];"}},
  // Another request for the same phone holds the lock and is saving it; this one is acknowledged without a write.
  {id:nodeId('Reply locked'),name:'Reply locked',type:'n8n-nodes-base.respondToWebhook',typeVersion:1.1,position:[x-200,y+200],
   parameters:{respondWith:'json',responseBody:"={{ JSON.stringify({ok:true,duplicate:true,pending:true,request_id:$('Validate').first().json.key}) }}",options:{responseCode:200}}});
 const [from,i,j]=into[0];w.connections[from].main[i][j]={node:'Lock',type:'main',index:0};
 w.connections['Lock']=link('Locked?');
 w.connections['Locked?']={main:[[{node:'Restore intake',type:'main',index:0}],[{node:'Reply locked',type:'main',index:0}]]};
 w.connections['Restore intake']=link('Find query');

 // Instant reply: after the response, in parallel with the internal alert. It never blocks or fails the intake.
 const rs=w.nodes.find(n=>n.name==='Reply saved');const [rx,ry]=rs.position;
 w.nodes.push(
  {id:nodeId('Instant reply input'),name:'Instant reply input',type:'n8n-nodes-base.code',typeVersion:2,position:[rx+200,ry+200],parameters:{jsCode:intakeSource('instant-reply-input.js',campaign)}},
  {id:nodeId('Instant reply'),name:'Instant reply',type:'n8n-nodes-base.executeWorkflow',typeVersion:1.1,position:[rx+400,ry+200],onError:'continueRegularOutput',
   parameters:{source:'database',workflowId:{__rl:true,value:instantWorkflowId,mode:'id'},options:{waitForSubWorkflow:false}}});
 w.connections['Reply saved'].main[0].push({node:'Instant reply input',type:'main',index:0});
 w.connections['Instant reply input']=link('Instant reply');
 // State and saved execution data are deliberately excluded from the import file.
 return {name:w.name,nodes:w.nodes,connections:w.connections,settings:w.settings,pinData:{}};
};

if(require.main===module){
 const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('usage: node patch-export.js input.json output.json');
 const {CAMPAIGN='refi',LOCK_SERVER_URL,LOCK_CREDENTIAL_ID,INSTANT_REPLY_WORKFLOW_ID}=process.env;
 const parsed=JSON.parse(fs.readFileSync(input,'utf8'));const w=Array.isArray(parsed)&&parsed.length===1?parsed[0]:parsed;const id=w.id;
 const result=patchIntake(w,{campaign:CAMPAIGN,lockUrl:LOCK_SERVER_URL,lockCredentialId:LOCK_CREDENTIAL_ID,instantWorkflowId:INSTANT_REPLY_WORKFLOW_ID});
 fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({sourceWorkflow:id,nodes:result.nodes.length,replaced:w.nodes.length===37?[]:['Validate','Find query','Build mutation','Check save'],lockBefore:'Find query',settingsChanged:false,guardedMigration:w.nodes.length===37,notificationsAfterResponse:true}));
}

module.exports={patchIntake};
