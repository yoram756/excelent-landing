// Build an unpublished, manual-only probe. No network, credentials or customer data.
const fs=require('fs'),path=require('path');
const sourceDir=path.resolve(__dirname,'../../automation/funnel');
const read=n=>fs.readFileSync(path.join(sourceDir,n+'.js'),'utf8');
const cfg=fs.readFileSync(path.join(__dirname,'../../campaigns/refi.json'),'utf8');
const biz=fs.readFileSync(path.join(__dirname,'../../config/business.json'),'utf8');
const plan=read('plan').replace('__CONFIG__',cfg).replace('__BUSINESS__',biz).replace('__MODE__','test').replace('__GO_LIVE__','2026-10-20T07:00:00Z').replace('__PILOT__','');
const js=`function planner($){${plan}}
function collect($input){${read('collect-pages')}}
function resolve($){${read('go').replace('__CONFIG__',cfg)}}
const results={};
const tokenRows=$input.all();
const tokens=tokenRows.map(r=>r.json.secureToken);
results.cryptoNode=tokens.length===100&&tokens.every(t=>/^[a-f0-9]{32}$/.test(t))&&new Set(tokens).size===100;
const page=(items,cursor=null)=>({json:{data:{me:{id:'1'},boards:[{items_page:{items,cursor}}]}}});
const item=(id,cols)=>({id:String(id),name:'TEST runtime',column_values:Object.entries(cols).map(([id,text])=>({id,text}))});
const rows=Array.from({length:500},(_,i)=>item(i+1,{}));
const last=item(501,{fn_token:'abcdefghjk',fn_opens:'{}',numeric_mm883h9v:'50'});
const all=collect({all:()=>[page(rows,'next'),page([last])]})[0].json;
const run=items=>resolve(n=>({first:()=>({json:n==='Link'?{query:{c:'abcdefghjkq'}}:page(items).json})}))[0].json;
results.page501=run(all.data.boards[0].items_page.items).itemId==='501';
try{collect({all:()=>[page(rows,'next')]});results.partialBlocked=false;}catch(e){results.partialBlocked=true;}
results.missingClickStateBlocked=run([item(501,{fn_token:'abcdefghjk',numeric_mm883h9v:'50'})]).colsJson===undefined;
const lead=item(1,{refi_phone:'0500000040',boolean_mm88mzry:''});
lead.created_at='2026-10-20T08:00:00Z';lead.column_values[1].value=JSON.stringify({checked:true});
const planned=planner(n=>({all:()=>n==='Secure tokens'?tokenRows:[],first:()=>({json:n==='Items'?page([lead]).json:n==='Run test'?{body:{now:'2026-10-20T09:00:00Z'}}:n==='Convos'?{data:{items:[]}}:{items:[]}})}));
results.plannerUsesCrypto=planned.length===1&&JSON.parse(planned[0].json.colsJson).fn_token===tokens[0]&&planned[0].json.live===false;
const stored=JSON.parse(JSON.parse(planned[0].json.colsJson).fn_opens.text);
const activeLead=item(1,{refi_phone:'0500000040',fn_status:'פעיל',fn_path:'B',fn_step:'M1',fn_token:tokens[0],fn_opens:JSON.stringify(stored)});
activeLead.column_values.push({id:'boolean_mm88mzry',text:'',value:JSON.stringify({checked:true})},{id:'fn_next',text:'',value:JSON.stringify({date:'2026-10-20',time:'08:00:00'})});
const followup=planner(n=>({all:()=>n==='Secure tokens'?tokenRows:[],first:()=>({json:n==='Items'?page([activeLead]).json:n==='Run test'?{body:{now:'2026-10-20T09:00:00Z'}}:n==='Convos'?{data:{items:[]}}:{items:[]}})}))[0].json;
results.bodyLinkMapping=followup.send.variables[1]===tokens[0]+'q'&&followup.send.buttonVariables===undefined&&followup.send.templateId===${JSON.stringify(JSON.parse(cfg).templates.M2.id)};
const serviceOnly={...lead,column_values:lead.column_values.filter(c=>c.id!=='boolean_mm88mzry').concat([{id:'boolean_mm8848pn',text:'',value:JSON.stringify({checked:true})}])};
const servicePlan=planner(n=>({all:()=>n==='Secure tokens'?tokenRows:[],first:()=>({json:n==='Items'?page([serviceOnly]).json:n==='Run test'?{body:{now:'2026-10-20T09:00:00Z'}}:n==='Convos'?{data:{items:[]}}:{items:[]}})}));
results.noMarketingWithoutConsent=servicePlan.length>0&&servicePlan.every(x=>!x.json.send);
const checkToken=state=>resolve(n=>({first:()=>({json:n==='Link'?{query:{c:tokens[0]+'q'}}:page([item(1,{fn_token:tokens[0],fn_opens:JSON.stringify(state)})]).json})}))[0].json;
results.expiryAndRevocation=checkToken(stored).found===true&&checkToken({...stored,tokenExpiresAt:0}).found===false&&checkToken({...stored,tokenRevoked:true}).found===false;
results.scope='synthetic compute only; no HTTP, Monday writes, messages or schedules';
results.passed=results.cryptoNode&&results.page501&&results.partialBlocked&&results.missingClickStateBlocked&&results.plannerUsesCrypto&&results.expiryAndRevocation&&results.bodyLinkMapping&&results.noMarketingWithoutConsent;
return [{json:results}];`;
const workflow={name:'TEST LP1 release runtime probe 20261020 NO SEND',active:false,settings:{executionOrder:'v1'},nodes:[
{id:'lp1-probe-manual',name:'Manual only',type:'n8n-nodes-base.manualTrigger',typeVersion:1,position:[0,0],parameters:{}},
{id:'lp1-probe-candidates',name:'100 synthetic IDs',type:'n8n-nodes-base.code',typeVersion:2,position:[240,0],parameters:{jsCode:"return Array.from({length:100},(_,i)=>({json:{itemId:String(i+1)}}));"}},
{id:'lp1-probe-crypto',name:'Secure tokens',type:'n8n-nodes-base.crypto',typeVersion:1,position:[480,0],parameters:{action:'generate',dataPropertyName:'secureToken',encodingType:'hex',stringLength:32}},
{id:'lp1-probe-code',name:'Synthetic checks NO NETWORK',type:'n8n-nodes-base.code',typeVersion:2,position:[720,0],parameters:{jsCode:js}}
],connections:{'Manual only':{main:[[{node:'100 synthetic IDs',type:'main',index:0}]]},'100 synthetic IDs':{main:[[{node:'Secure tokens',type:'main',index:0}]]},'Secure tokens':{main:[[{node:'Synthetic checks NO NETWORK',type:'main',index:0}]]}}};
fs.mkdirSync(path.join(sourceDir,'dist'),{recursive:true});
fs.writeFileSync(path.join(sourceDir,'dist/runtime-probe.json'),JSON.stringify(workflow,null,2));
console.log('Built manual-only synthetic runtime probe');
