// Manual compute-only n8n acceptance; actual sources, synthetic adapters only.
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../..'),read=n=>fs.readFileSync(path.join(root,n),'utf8');
const cfg=read('campaigns/refi.json'),biz=read('config/business.json');
const src=n=>read('automation/funnel/'+n+'.js').replace('__CONFIG__',cfg).replace('__BUSINESS__',biz).replace('__MODE__','test').replace('__GO_LIVE__','2026-10-20T07:00:00Z').replace('__PILOT__','');
const suite=read('tests/funnel/acceptance.test.js').split('\n').slice(2).join('\n');
const js=`function Plan($){${src('plan')}}
function Calendar($,$getWorkflowStaticData){${src('calendly')}}
function Sent($,$json){${src('after-send')}}
function Validate($input,$getWorkflowStaticData){${read('automation/intake/validate.js')}}
const results=[];
const assert={equal:(a,b,m)=>{if(a!==b)throw new Error(m||JSON.stringify({a,b}));},deepEqual:(a,b)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(JSON.stringify({a,b}));},ok:(a,m)=>{if(!a)throw new Error(m||'Expected truthy');}};
const test=(name,f)=>{try{f();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',error:e.message});}};
const tokens=$input.all();
const item=o=>({id:o.id||'1',name:o.name||'TEST Acceptance',created_at:'2026-10-20T08:00:00Z',column_values:Object.entries(o.cols||{}).map(([id,v])=>({id,text:typeof v==='string'?v:'',value:typeof v==='string'?null:JSON.stringify(v)}))});
const planner=()=>({items,convos=[],now,convosDown=false})=>Plan(n=>({all:()=>tokens,first:()=>({json:n==='Run test'?{body:{now}}:n==='Items'?{data:{me:{id:'1'},boards:[{items_page:{items}}]}}:n==='Convos'?(convosDown?{error:'down'}:{data:{items:convos}}):{items:[]}})})).map(x=>x.json);
const calendly=({body,items,store={}})=>Calendar(n=>({first:()=>({json:n==='Run test'?{body}:{data:{boards:[{items_page:{items}}]}}}),all:()=>[]}),()=>store).map(x=>x.json);
${suite}
const base={product:'LP1',first_name:'TEST Acceptance',phone:'0500000040',idempotency_key:'acceptance-20261020',service_request:true,marketing_consent:false,answers:{ask:'check',when:'week'}};
const valid=(b,sd={})=>Validate({first:()=>({json:{body:b,headers:{}}})},()=>sd)[0].json;
test('S1 LP1 entry validates synthetic form; no marketing consent',()=>{const r=valid(base);assert.equal(r.ok,true);assert.equal(r.source,'קליטת LP1');assert.equal(r.marketing_consent,false);});
test('S1 Meta-shaped normalized lead enters test planner; Meta transport NOT TESTED',()=>{const r=planner()({items:[item({cols:{refi_source:'טופס מטא',refi_phone:'0500000040',boolean_mm88mzry:{checked:true}}})],now:NOW});assert.equal(r[0].live,false);assert.ok(r[0].send);});
test('S2 quiz validated and money excluded unless explicitly permitted',()=>{const r=valid({...base,answers:{...base.answers,bal:'b3'}});assert.equal(r.answers.bal,undefined);assert.equal(valid({...base,answers:{ask:'wrong'}}).ok,false);});
test('S3 idempotency returns confirmed Monday ID only (mock response)',()=>{assert.equal(valid(base,{idem:{[base.idempotency_key]:{id:'123',t:Date.now()}}}).request_id,'123');});
test('S4 outbound simulation applies actual After send; no provider call',()=>{const [p]=planner()({items:[item({cols:active})],now:NOW});const r=Sent(()=>({item:{json:p}}),{success:true,simulated:true}).json;assert.equal(r.simulated,true);assert.equal(r.sendOk,true);assert.equal(p.live,false);});
test('S4 incoming mock reply stops series and proposes handoff notification',()=>{const [r]=planner()({items:[item({cols:active})],now:NOW,convos:[{phone:'972500000040',lastMessageDirection:'incoming',lastMessageTime:NOW,lastMessage:'Please call'}]});assert.equal(r.cols.fn_status.label,'ענה');assert.equal(r.send,null);assert.equal(r.hasNotify,true);});
test('S5 provider error never advances; unknown response never retries blindly',()=>{const [p]=planner()({items:[item({cols:active})],now:NOW});assert.equal(Sent(()=>({item:{json:p}}),{}).json.colsJson,'{}');assert.equal(JSON.parse(Sent(()=>({item:{json:p}}),{success:false}).json.colsJson).fn_step,'M1');});
test('S5 unreadable provider history prevents sending',()=>assert.ok(planner()({items:[item({cols:active})],now:NOW,convosDown:true}).every(r=>!r.send)));
test('S6 booking and cancellation parsed without creating a calendar event',()=>{const a=book(mail(),[item({cols:active})]);assert.equal(JSON.parse(a[0].colsJson).refi_stage.label,'פגישה נקבעה');const b=book(mail(),[item({cols:active})],'Canceled: TEST');assert.equal(JSON.parse(b[0].colsJson).refi_stage.label,'פגישה בוטלה');});
test('S7 human handling and first reply stop automatic sends',()=>{for(const extra of [{refi_stage:'בטיפול'},{refi_first_reply:'2026-10-20'}])assert.ok(planner()({items:[item({cols:{...active,...extra}})],now:NOW}).every(r=>!r.send));});
test('S8 simulated paid stage becomes client and clears next send',()=>{const [r]=planner()({items:[item({cols:{...active,refi_stage:'לקוח משלם'}})],now:NOW});assert.equal(r.cols.fn_status.label,'לקוח');assert.deepEqual(r.cols.fn_next,{});assert.equal(r.send,null);});
test('Safety: real-looking non-TEST item is excluded',()=>assert.equal(planner()({items:[item({name:'Synthetic but not TEST',cols:active})],now:NOW}).length,0));
const passed=results.every(r=>r.status==='PASS');
if(!passed)throw new Error(JSON.stringify(results.filter(r=>r.status==='FAIL')));
return [{json:{passed,checks:results.length,results,scope:'actual Code sources in n8n; synthetic inputs/provider responses only; no HTTP, messages, calendar events, ads or production writes',metaTransport:'NOT TESTED',whatsappTransport:'SIMULATED'}}];`;
const names=['Manual only','Synthetic token IDs','Secure tokens','Acceptance NO NETWORK'];
const nodes=[{name:names[0],type:'manualTrigger',parameters:{}},{name:names[1],type:'code',parameters:{jsCode:"return Array.from({length:3},(_,i)=>({json:{itemId:String(i+1)}}));"}},{name:names[2],type:'crypto',parameters:{action:'generate',dataPropertyName:'secureToken',encodingType:'hex',stringLength:32}},{name:names[3],type:'code',parameters:{jsCode:js}}].map((n,i)=>({...n,id:'acceptance-'+i,type:'n8n-nodes-base.'+n.type,typeVersion:n.type==='code'?2:1,position:[i*260,0]}));
const connections={};names.slice(0,-1).forEach((n,i)=>connections[n]={main:[[{node:names[i+1],type:'main',index:0}]]});
const w={name:'TEST LP1 eight scenarios acceptance 20261020 NO NETWORK',active:false,settings:{executionOrder:'v1'},nodes,connections};
fs.writeFileSync(path.join(root,'automation/funnel/dist/acceptance-probe.json'),JSON.stringify(w,null,2));
if(require.main===module){const rows=Array.from({length:3},(_,i)=>({json:{itemId:String(i+1),secureToken:require('crypto').randomBytes(16).toString('hex')}}));const result=new Function('$input',js)({all:()=>rows})[0].json;console.log(JSON.stringify(result,null,2));}
