// Manual read-only check. No send nodes and no public webhook.
const fs=require('fs'),path=require('path');
const nodes=[],connections={};
const add=(name,type,parameters,extra={})=>nodes.push({id:'internal-wa-'+nodes.length,name,type:'n8n-nodes-base.'+type,typeVersion:type==='httpRequest'?4.2:type==='code'?2:1,position:[nodes.length*260,0],parameters,...extra});
const get=(name,url)=>add(name,'httpRequest',{method:'GET',url:'https://api.gambot.co.il/api/v1/'+url,authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',options:{timeout:20000}},{credentials:{httpHeaderAuth:{id:'6hr28GsvQQrGzjwx',name:'Header Auth account'}}});
add('Manual only','manualTrigger',{});
get('Connected numbers','numbers');
get('Internal window only','conversations/972502234052/window');
get('Approved templates','templates/2386590312169194');
add('Evidence without messages','code',{jsCode:`const n=$('Connected numbers').first().json,w=$('Internal window only').first().json,t=$input.first().json;if(n.success!==true||w.success!==true||t.success!==true)throw Error('Read check failed');return [{json:{readOnly:true,at:new Date().toISOString(),numbers:n.data,internalWindow:w.data,templates:t.data,noMessageSent:true}}];`});
for(let i=0;i<nodes.length-1;i++)connections[nodes[i].name]={main:[[{node:nodes[i+1].name,type:'main',index:0}]]};
const result={name:'TEST LP1 WhatsApp internal READ ONLY 0502234052 20261020',nodes,connections,settings:{executionOrder:'v1',timezone:'Asia/Jerusalem'},pinData:{}};
const out=path.join(__dirname,'../../automation/funnel/dist/internal-wa-readonly.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(out);
