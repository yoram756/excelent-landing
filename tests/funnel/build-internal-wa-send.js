// Explicitly authorized one-recipient manual test. Never connects to CRM or ads.
// Disabled by default. --armed is for a newly authorized test only. Run once,
// inspect provider status, then deactivate the send node in the saved UI.
const fs=require('fs'),path=require('path');
const to='972502234052',from='972559881245',templateId='2386590312169194';
const nodes=[],connections={};
const add=(name,type,parameters,extra={})=>nodes.push({id:'internal-test-'+nodes.length,name,type:'n8n-nodes-base.'+type,typeVersion:type==='httpRequest'?4.2:type==='code'?2:1,position:[nodes.length*240,0],parameters,...extra});
const auth={credentials:{httpHeaderAuth:{id:'6hr28GsvQQrGzjwx',name:'Header Auth account'}}};
const http=(name,method,url,extra={})=>add(name,'httpRequest',{method,url,authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',options:{timeout:20000},...extra},{...auth,retryOnFail:false});
add('Manual only','manualTrigger',{});
http('Verify approved internal template','GET','https://api.gambot.co.il/api/v1/templates/'+templateId);
add('Guard exact internal recipient','code',{jsCode:`const r=$input.first().json,t=r.data;if(r.success!==true||String(t?.id)!=='${templateId}'||t.name!=='exc_internal_lead_alert'||t.status!=='APPROVED'||t.category!=='UTILITY')throw Error('Template not the approved internal utility');const body={to:'${to}',from:'${from}',templateId:'${templateId}',variables:['TEST בדיקת מערכת בלבד, אין ליד אמיתי','0502234052','TEST 20261020, בדיקה פנימית מאושרת','TEST ללא ניקוד לקוח','נא להשיב TEST התקבל לצורך בדיקת תגובה בלבד','https://kho566440.monday.com/boards/5106403803']};if(body.to!=='972502234052'||body.from!=='972559881245'||body.variables.some(x=>typeof x!=='string'))throw Error('Recipient guard');return [{json:body}];`});
http('SEND ONCE internal test ONLY','POST','https://api.gambot.co.il/api/v1/messages/send-template',{sendBody:true,specifyBody:'json',jsonBody:'={{ JSON.stringify($json) }}'});
nodes[nodes.length-1].disabled=!process.argv.includes('--armed');
add('Require provider acknowledgment','code',{jsCode:`const r=$input.first().json;if(r.success!==true||!r.data?.messageId)throw Error('Provider did not acknowledge message; do not retry blindly');return [{json:{messageId:r.data.messageId,to:'${to}',providerAccepted:true,delivered:false,simulation:false}}];`});
http('Read exact test message status','GET',`={{ 'https://api.gambot.co.il/api/v1/messages/' + encodeURIComponent($json.messageId) + '/status?phone=${to}' }}`);
for(let i=0;i<nodes.length-1;i++)connections[nodes[i].name]={main:[[{node:nodes[i+1].name,type:'main',index:0}]]};
const w={name:'TEST LP1 WA SEND ONCE internal 0502234052 ONLY 20261020',nodes,connections,settings:{executionOrder:'v1',timezone:'Asia/Jerusalem'},pinData:{}};
if(nodes.some(n=>/webhook|scheduleTrigger|monday/i.test(n.type))||nodes.filter(n=>n.parameters.method==='POST').length!==1)throw Error('Unexpected live surface');
const out=path.join(__dirname,'../../src/services/funnel/dist/internal-wa-send-once.json');fs.writeFileSync(out,JSON.stringify(w,null,2)+'\n');console.log(out);
