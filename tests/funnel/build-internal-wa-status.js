// Read-only follow-up to the single authorized internal test. No outgoing actions.
const fs=require('fs'),path=require('path');
const messageId='wamid.HBgMOTcyNTAyMjM0MDUyFQIAERgUQ0U3NzU4MkQyQUQ3ODM0Q0FENUMA';
const phone='972502234052';
const nodes=[],connections={};
const add=(name,type,parameters,extra={})=>nodes.push({id:'internal-status-'+nodes.length,name,type:'n8n-nodes-base.'+type,typeVersion:type==='httpRequest'?4.2:type==='code'?2:1,position:[nodes.length*240,0],parameters,...extra});
const get=(name,url)=>add(name,'httpRequest',{method:'GET',url:'https://api.gambot.co.il/api/v1/'+url,authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',options:{timeout:20000}},{credentials:{httpHeaderAuth:{id:'6hr28GsvQQrGzjwx',name:'Header Auth account'}}});
add('Manual read only','manualTrigger',{});
get('Exact test status','messages/'+encodeURIComponent(messageId)+'/status?phone='+phone);
get('Internal replies after test only','conversations/'+phone+'/messages?after='+encodeURIComponent(messageId)+'&pageSize=20');
add('CRM credential owner READ ONLY','httpRequest',{method:'POST',url:'https://api.monday.com/v2',authentication:'predefinedCredentialType',nodeCredentialType:'mondayComApi',sendHeaders:true,headerParameters:{parameters:[{name:'API-Version',value:'2024-10'}]},sendBody:true,specifyBody:'json',jsonBody:JSON.stringify({query:'query { me { id name } }'}),options:{timeout:20000}},{credentials:{mondayComApi:{id:'Un7HBqZvldpVYUaB',name:'Monday.com account'}}});
add('Summarize exact internal test','code',{jsCode:`const s=$('Exact test status').first().json,r=$('Internal replies after test only').first().json,m=$input.first().json;if(s.success!==true||r.success!==true||m.errors?.length||!m.data?.me?.id)throw Error('Provider read failed');const list=r.data?.messages||r.data?.items||[];if(!Array.isArray(list))throw Error('Unrecognized history');const replies=list.filter(x=>Date.parse(x.time||x.timestamp||x.createdAt||'')>=Date.parse('2026-10-20T18:17:31Z')&&/^(in|incoming|inbound)$/i.test(x.direction||'')&&/TEST/i.test(x.text||x.body||''));return [{json:{readOnly:true,simulation:false,at:new Date().toISOString(),messageStatus:s.data,replyCount:replies.length,testReplies:replies.map(x=>({direction:x.direction,time:x.time||x.timestamp||x.createdAt,text:x.text||x.body})),historyKeys:Object.keys(r.data||{}),crmCredentialOwner:m.data.me,noMessageSent:true}}];`});
for(let i=0;i<nodes.length-1;i++)connections[nodes[i].name]={main:[[{node:nodes[i+1].name,type:'main',index:0}]]};
const w={name:'TEST LP1 WA exact message STATUS READ ONLY 20261020',nodes,connections,settings:{executionOrder:'v1',timezone:'Asia/Jerusalem'},pinData:{}};
fs.writeFileSync(path.join(__dirname,'../../automation/funnel/dist/internal-wa-status.json'),JSON.stringify(w,null,2)+'\n');
