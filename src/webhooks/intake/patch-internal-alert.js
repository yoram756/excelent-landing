// Patch a fresh private n8n export. Requires an already deployed authenticated
// lock service with /internal-alert/claim. Does not edit workflow settings.
const fs=require('node:fs');
const {intakeSource}=require('./source');
const {createPayloadExpression}=require('./monday-payload');
const edge=node=>({node,type:'main',index:0});
function patchInternalAlert(input,{campaign='refi',lockUrl,lockCredentialId}={}){
 throw Error('Gambot internal-alert patch retired. Use the Cosend durable controller and a separately reviewed activation package; no workflow was changed.');
 if(!/^https?:\/\/[\w.-]+(?::\d{2,5})?$/.test(lockUrl||''))throw Error('Verified lock service URL required');
 if(!/^\w{8,40}$/.test(lockCredentialId||''))throw Error('Existing lock credential required');
 const w=structuredClone(input),node=name=>{const found=w.nodes.filter(n=>n.name===name);if(found.length!==1)throw Error('Missing or ambiguous '+name);return found[0];};
 const recipients=node('WhatsApp recipients'),send=node('WhatsApp alert'),reply=node('Reply saved');
 if(send.type!=='n8n-nodes-base.httpRequest'||send.parameters.url!=='https://api.gambot.co.il/api/v1/messages/send-template'||!send.credentials?.httpHeaderAuth?.id)throw Error('Unexpected alert provider');
 if(w.nodes.some(n=>['Claim internal alert','Internal alert claimed?','Confirm internal alert'].includes(n.name)))throw Error('Already patched; export the current workflow for review');
 if(!w.connections['Saved?']?.main?.[0]?.some(e=>e.node==='Reply saved'))throw Error('Confirmed response must precede alerts');
 // Remove old incoming routes so email latency cannot gate or duplicate the alert.
 for(const c of Object.values(w.connections))for(const branch of c.main||[])for(let i=branch.length-1;i>=0;i--)if(branch[i].node===recipients.name)branch.splice(i,1);
 recipients.parameters.jsCode=intakeSource('internal-alert.js',campaign);recipients.disabled=false;
 send.disabled=false;send.retryOnFail=false;delete send.onError;delete send.continueOnFail;
 send.parameters.jsonBody="={{ JSON.stringify((() => { const a=$('WhatsApp recipients').first().json;return {to:a.to,from:a.from,templateId:a.templateId,variables:a.variables}; })()) }}";
 const [x,y]=reply.position||[0,0];
 const added=[
  {id:'internal-alert-claim-v1',name:'Claim internal alert',type:'n8n-nodes-base.httpRequest',typeVersion:4.2,position:[x+400,y+300],retryOnFail:false,credentials:{httpHeaderAuth:{id:lockCredentialId,name:'Lock server'}},parameters:{method:'POST',url:lockUrl+'/internal-alert/claim',authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',sendBody:true,specifyBody:'json',jsonBody:'={{ JSON.stringify({key:$json.dedupKey}) }}',options:{timeout:5000}}},
  {id:'internal-alert-claimed-v1',name:'Internal alert claimed?',type:'n8n-nodes-base.if',typeVersion:2,position:[x+600,y+300],parameters:{conditions:{options:{caseSensitive:true,typeValidation:'strict'},conditions:[{id:'internal-claim-true',leftValue:'={{ $json.claimed === true }}',rightValue:true,operator:{type:'boolean',operation:'true',singleValue:true}}],combinator:'and'},options:{}}},
  {id:'internal-alert-confirm-v1',name:'Confirm internal alert',type:'n8n-nodes-base.code',typeVersion:2,position:[x+1000,y+300],parameters:{jsCode:intakeSource('internal-alert-result.js',campaign)}}
 ];
 w.nodes.push(...added);const outgoing=w.connections[reply.name]||(w.connections[reply.name]={main:[[]]});outgoing.main[0].push(edge(recipients.name));
 w.connections[recipients.name]={main:[[edge('Claim internal alert')]]};w.connections['Claim internal alert']={main:[[edge('Internal alert claimed?')]]};w.connections['Internal alert claimed?']={main:[[edge(send.name)],[]]};w.connections[send.name]={main:[[edge('Confirm internal alert')]]};
 node('Save to Monday').parameters.jsonBody=createPayloadExpression(campaign);
 return w;
}
if(require.main===module){const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('input and output exports required');const w=patchInternalAlert(JSON.parse(fs.readFileSync(input,'utf8')),{campaign:process.env.CAMPAIGN||'refi',lockUrl:process.env.LOCK_SERVER_URL,lockCredentialId:process.env.LOCK_CREDENTIAL_ID});fs.writeFileSync(output,JSON.stringify(w,null,2)+'\n');console.log(JSON.stringify({nodes:w.nodes.length,settingsChanged:false}));}
module.exports={patchInternalAlert};
