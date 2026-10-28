// Owner-authorized manual-only primary-phone test. No lead recipients, public
// trigger or schedule. The provider send is disabled unless --armed is supplied.
const fs=require('node:fs');
const {intakeConfig}=require('../../src/webhooks/intake/source');
function build(exported,{itemId,armed=false}={}){
 throw Error('Gambot probe retired after provider migration. Do not use --armed; prepare a Cosend test with fresh per-test approval.');
 if(!/^[1-9]\d*$/.test(itemId||''))throw Error('Verified synthetic item required');
 const K=intakeConfig(),a=K.internalAlert;
 const provider=exported.nodes.find(n=>n.name==='WhatsApp alert');if(!provider?.credentials?.httpHeaderAuth?.id)throw Error('Existing provider credential required');
 const nodes=[],connections={},add=(name,type,parameters,extra={})=>nodes.push({id:'internal-alert-probe-'+nodes.length,name,type:'n8n-nodes-base.'+type,typeVersion:type==='code'?2:type==='httpRequest'?4.2:1,position:[nodes.length*260,0],parameters,...extra});
 const http=(name,method,url,parameters={})=>add(name,'httpRequest',{method,url,authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',options:{timeout:20000},...parameters},{credentials:provider.credentials,retryOnFail:false});
 add('Manual only','manualTrigger',{});
 http('Read internal template','GET','https://api.gambot.co.il/api/v1/templates/'+a.templateId);
 add('Guard approved template and primary recipient','code',{jsCode:`const r=$input.first().json,t=r.data;if(r.success!==true||String(t?.id)!==${JSON.stringify(a.templateId)}||t.name!=='exc_internal_lead_alert'||t.status!=='APPROVED'||t.category!=='UTILITY')throw Error('Approved internal template not verified; no message sent');return [{json:{to:${JSON.stringify(a.to)},from:${JSON.stringify(a.from)},templateId:${JSON.stringify(a.templateId)},variables:['TEST התראה פנימית בלבד, אין ליד אמיתי','0500000066','synthetic_20261028 / campaign_buyers_south','TEST ללא ניקוד לקוח','בדיקת ניתוב לנייד העסקי בלבד',${JSON.stringify(a.mondayBaseUrl+'/boards/'+K.board+'/pulses/'+itemId)}]}}];`});
 http('SEND ONCE primary internal TEST','POST','https://api.gambot.co.il/api/v1/messages/send-template',{sendBody:true,specifyBody:'json',jsonBody:'={{ JSON.stringify($json) }}'});nodes.at(-1).disabled=!armed;
 add('Require real provider acknowledgment','code',{jsCode:`const r=$input.first().json;if(r.success!==true||!r.data?.messageId)throw Error('Provider did not acknowledge; do not retry blindly');return [{json:{messageId:r.data.messageId,to:${JSON.stringify(a.to)},accepted:true,delivered:false,simulation:false}}];`});
 http('Read exact test status','GET',`={{ 'https://api.gambot.co.il/api/v1/messages/' + encodeURIComponent($json.messageId) + '/status?phone=${a.to}' }}`);
 for(let i=0;i<nodes.length-1;i++)connections[nodes[i].name]={main:[[{node:nodes[i+1].name,type:'main',index:0}]]};
 return {name:'TEST internal alert primary 20261028 MANUAL ONLY',nodes,connections,settings:{executionOrder:'v1',timezone:'Asia/Jerusalem',saveManualExecutions:true},pinData:{}};
}
if(require.main===module){const [input,output,itemId]=process.argv.slice(2);const w=build(JSON.parse(fs.readFileSync(input,'utf8')),{itemId,armed:process.argv.includes('--armed')});fs.writeFileSync(output,JSON.stringify(w,null,2)+'\n');console.log(JSON.stringify({output,sendArmed:w.nodes.find(n=>n.name.startsWith('SEND ONCE')).disabled===false,nodes:w.nodes.length}));}
module.exports={build};
