// Actual n8n HTTP transport to an isolated, automation-free private Monday board.
// All input events are fixtures. This never calls messaging/calendar/ad providers.
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../..'),read=p=>require('../../src/webhooks/intake/source').inject(fs.readFileSync(path.join(root,p),'utf8').replace(/\r\n/g,'\n'));
const S=JSON.parse(read('tests/funnel/sandbox-columns.json')),M=S.columns,B=S.board;
if(B===S.productionBoardForbidden||B!=='5106403803')throw Error('Unexpected sandbox target');
const remap=s=>Object.entries(M).reduce((s,[a,b])=>s.split(a).join(b),s).split(S.productionBoardForbidden).join(B);
const cfg=read('src/config/campaigns/refi.json'),biz=read('config/business.json');
const planner=read('src/services/funnel/plan.js').replace('__CONFIG__',cfg).replace('__META_HSM__',()=>require('../../src/services/funnel/meta-hsm').inlineSource()).replace('__BUSINESS__',biz).replace('__MODE__','test').replace('__GO_LIVE__','2026-10-20T07:00:00Z').replace('__PILOT__','').replace('__CRM_FIELDS__',require('../../src/services/funnel/crm-fields').inlineSource).replace('__CHANNELS__',require('../../src/services/funnel/channels').inlineSource);
const calendar=read('src/services/funnel/calendly.js').replace('__CONFIG__',cfg);
const pre=`const M=${JSON.stringify(M)},B='${B}';
const back=Object.fromEntries(Object.entries(M).map(([a,b])=>[b,a]));
const input=$input.first().json;
if(input.errors?.length)throw new Error('Monday GraphQL error');
const lead=input.data?.items?.[0];
const proof=$('Check save').first().json;
if(!lead||String(lead.id)!==proof.request_id||lead.name!=='TEST LP1 SANDBOX 20261020 0500000040')throw new Error('Synthetic item ownership mismatch');
// Planner events below use a fixed historical clock. Only its synthetic copy is
// dated before that clock; the actual Monday created_at is never modified.
const canonical={...lead,created_at:'2026-10-20T08:00:00Z',column_values:lead.column_values.map(c=>({...c,id:back[c.id]||c.id}))};
const cv=Object.fromEntries(canonical.column_values.map(c=>[c.id,c]));
const vals=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[M[k]||k,v]));
const mutation=o=>[{json:{query:'mutation($b:ID!,$i:ID!,$v:JSON!){change_multiple_column_values(board_id:$b,item_id:$i,column_values:$v,create_labels_if_missing:true){id}}',variables:{b:B,i:lead.id,v:JSON.stringify(vals(o))}}}];
function Plan($){${planner}}
function Calendar($,$getWorkflowStaticData){${calendar}}
const plan=(extra={},convos=[],now='2026-10-20T09:00:00Z')=>{const it={...canonical,column_values:canonical.column_values.filter(c=>!Object.hasOwn(extra,c.id)).concat(Object.entries(extra).map(([id,v])=>({id,text:typeof v==='string'?v:'',value:typeof v==='string'?null:JSON.stringify(v)})))};return Plan(n=>({all:()=>[{json:{itemId:lead.id,secureToken:'0123456789abcdef0123456789abcdef'}}],first:()=>({json:n==='Run test'?{body:{now}}:n==='Items'?{data:{me:{id:'1'},boards:[{items_page:{items:[it]}}]}}:n==='Convos'?{data:{items:convos}}:{items:[]}})})).map(x=>x.json);};
const assert=(v,m)=>{if(!v)throw new Error(m);};
const mail='Invitee: TEST Sandbox Invitee Email: sandbox@example.com Event Date/Time: 6:00pm - Thursday, 22 October 2026 (Israel Time) Location: +972 50-000-0040 Invitee Time Zone: Israel Time';
`;
const nodes=[],connections={};
const add=(name,type,parameters,extra={})=>nodes.push({id:'sandbox-'+nodes.length,name,type:'n8n-nodes-base.'+type,typeVersion:type==='httpRequest'?4.2:type==='code'?2:1,position:[nodes.length*220,0],parameters,...extra});
const code=(name,js)=>add(name,'code',{jsCode:js});
const http=(name,body)=>add(name,'httpRequest',{method:'POST',url:'https://api.monday.com/v2',authentication:'predefinedCredentialType',nodeCredentialType:'mondayComApi',sendHeaders:true,headerParameters:{parameters:[{name:'API-Version',value:'2024-10'}]},sendBody:true,specifyBody:'json',jsonBody:body,options:{timeout:20000}},{credentials:{mondayComApi:{id:'Un7HBqZvldpVYUaB',name:'Monday.com account'}}});
const dynamic='={{ JSON.stringify({query:$json.query,variables:$json.variables}) }}';
const readback=name=>http(name,`={{ JSON.stringify({query:'query($ids:[ID!]){items(ids:$ids){id name created_at column_values{id text value}}}',variables:{ids:[$('Check save').first().json.request_id]}}) }}`);
add('Manual only','manualTrigger',{});
http('Inspect private sandbox',JSON.stringify({query:`query{boards(ids:[${B}]){id name board_kind items_page(limit:5){items{id name}}}}`}));
code('Guard sandbox ownership',`const r=$input.first().json,b=r.data?.boards?.[0];if(r.errors?.length||b?.id!=='${B}'||b.board_kind!=='private'||b.name!=='TEST Excelent LP1 acceptance 20261020 NO AUTOMATIONS'||b.items_page.items.length>1||b.items_page.items.some(it=>it.id!=='3297936391'||it.name!=='TEST LP1 SANDBOX 20261020 0500000040'))throw new Error('Board is not the empty sandbox or the exact retained fixture from the interrupted test; no writes');return [{json:{body:{product:'LP1',first_name:'TEST LP1 SANDBOX 20261020',phone:'0500000040',idempotency_key:'sandbox-20261020-'+Date.now(),service_request:true,marketing_consent:false,answers:{}},headers:{}}}];`);
code('Prepare exact fixture reset',`const it=$('Inspect private sandbox').first().json.data.boards[0].items_page.items[0];
if(!it)return [{json:{query:'query{boards(ids:[${B}]){id}}'}}];
if(it.id!=='3297936391')throw new Error('Unexpected recovery item');
const c=${JSON.stringify(M)};const cv=Object.fromEntries(Object.values(c).map(id=>[id,null]));
cv[c.refi_phone]={phone:'972500000040',countryShortName:'IL'};
cv[c.fn_opens]={text:'{}'};cv[c.boolean_mm88mzry]={checked:false};cv[c.boolean_mm8848pn]={checked:false};
return [{json:{query:'mutation($b:ID!,$i:ID!,$v:JSON!){change_multiple_column_values(board_id:$b,item_id:$i,column_values:$v){id}}',variables:{b:'${B}',i:it.id,v:JSON.stringify(cv)}}}];`);
http('Reset retained synthetic fixture',dynamic);
code('Restore fixture input',`const r=$input.first().json;if(r.errors?.length)throw new Error('Fixture reset failed');return [{json:$('Guard sandbox ownership').first().json}];`);
code('Validate',read('src/webhooks/intake/validate.js'));
code('Find query',remap(read('src/webhooks/intake/find-query.js')));
http('Find by phone',dynamic);
code('Build mutation',remap(read('src/webhooks/intake/build-mutation.js')));
http('Save to Monday sandbox',dynamic);
code('Check save',read('src/webhooks/intake/check-save.js'));
readback('Read intake');
code('Verify intake and simulate send',pre+`
assert([true,'true'].includes(JSON.parse(cv.boolean_mm8848pn.value).checked),'Service consent readback');
assert(!cv.boolean_mm88mzry.value||![true,'true'].includes(JSON.parse(cv.boolean_mm88mzry.value).checked),'Marketing defaults off');
assert(cv.refi_source.text==='קליטת LP1','LP1 source');
assert(plan().every(p=>!p.send),'Service-only lead must not get marketing');
const [p]=plan({boolean_mm88mzry:{checked:true}});assert(p?.send&&!p.live,'Simulated outbound plan');
function after($,$json){${read('src/services/funnel/after-send.js').replace('__CONFIG__',cfg).replace('__BUSINESS__',biz).replace('__FALLBACK__',()=>require('../../src/services/funnel/fallback').bundleSource())}}
const a=after(()=>({item:{json:p}}),{messages:[{id:'simulated'}],simulated:true}).json;
assert(a.sendOk&&a.simulated,'Mock provider acknowledgment');
return mutation({...JSON.parse(a.colsJson),boolean_mm88mzry:{checked:true}});`);
http('Apply simulated send',dynamic);
readback('Read simulated send');
code('Verify send and mock reply',pre+`assert(cv.fn_status.text==='פעיל'&&cv.fn_token.text==='0123456789abcdef0123456789abcdef','Send state readback');const [p]=plan({},[{phone:'972500000040',lastMessageDirection:'incoming',lastMessageTime:'2026-10-20T09:03:00Z',lastMessage:'Please call'}], '2026-10-20T09:03:00Z');assert(p?.cols.fn_status.label==='ענה'&&!p.send&&p.hasNotify,'Reply handoff');return mutation(p.cols);`);
http('Apply reply handoff',dynamic);
readback('Read reply handoff');
code('Verify reply and mock optout',pre+`assert(cv.fn_status.text==='ענה','Reply readback');const [p]=plan({fn_status:'פעיל'},[{phone:'972500000040',lastMessageDirection:'incoming',lastMessageTime:'2026-10-20T09:06:00Z',lastMessage:'STOP'}],'2026-10-20T09:06:00Z');assert(p?.cols.fn_status.label==='הסר'&&!p.send,'Optout');return mutation(p.cols);`);
http('Apply optout',dynamic);
readback('Read optout');
code('Match bookings',pre+`assert(cv.fn_status.text==='הסר'&&!JSON.parse(cv.fn_next.value||'null')?.date,'Optout readback');const [p]=Calendar(n=>({first:()=>({json:n==='Run test'?{body:{id:'sandbox-book',subject:'New Event: TEST',text:mail}}:{data:{boards:[{items_page:{items:[canonical]}}]}}}),all:()=>[]}),()=>({})).map(x=>x.json);assert(p?.matched&&p.itemId===lead.id,'Booking match');return mutation(JSON.parse(p.colsJson));`);
http('Apply mock booking',dynamic);
add('Acknowledge mock booking','code',{mode:'runOnceForEachItem',jsCode:`function acknowledge($json,$,$getWorkflowStaticData){${read('src/services/funnel/calendly-ack.js')}}
return acknowledge($json,()=>({item:{json:{itemId:$('Check save').first().json.request_id,mailId:'sandbox-booking-ack-'+$('Check save').first().json.request_id}}}),$getWorkflowStaticData);`});
readback('Read booking');
code('Match cancellation',pre+`assert(cv.refi_stage.text==='פגישה נקבעה'&&JSON.parse(cv.refi_meeting.value).time==='15:00:00','Booking readback timezone');const [p]=Calendar(n=>({first:()=>({json:n==='Run test'?{body:{id:'sandbox-cancel',subject:'Canceled: TEST',text:mail}}:{data:{boards:[{items_page:{items:[canonical]}}]}}}),all:()=>[]}),()=>({})).map(x=>x.json);assert(p?.matched,'Cancellation match');return mutation(JSON.parse(p.colsJson));`);
http('Apply mock cancellation',dynamic);
readback('Read cancellation');
code('Verify cancellation and human handoff',pre+`assert(cv.refi_stage.text==='פגישה בוטלה'&&!JSON.parse(cv.refi_meeting.value||'null')?.date,'Cancellation readback');assert(plan({refi_stage:'בטיפול',fn_status:'פעיל'}).every(p=>!p.send),'Human handled stop');return mutation({refi_stage:{label:'בטיפול'},fn_status:{label:'ענה'},fn_next:{}});`);
http('Apply human handoff fixture',dynamic);
readback('Read human handoff');
code('Verify handoff and simulated paid',pre+`assert(cv.refi_stage.text==='בטיפול'&&plan().every(p=>!p.send),'Human handoff readback');const [p]=plan({refi_stage:'לקוח משלם'});assert(p?.cols.fn_status.label==='לקוח'&&!p.send,'Paid stops sends');return mutation({...p.cols,refi_stage:{label:'לקוח משלם'}});`);
http('Apply simulated paid',dynamic);
readback('Read simulated paid');
code('Verify paid and prepare archive',pre+`assert(cv.refi_stage.text==='לקוח משלם'&&cv.fn_status.text==='לקוח'&&!JSON.parse(cv.fn_next.value||'null')?.date,'Paid readback');assert(plan().every(p=>!p.send),'Paid no further send');return [{json:{query:'mutation($id:ID!){archive_item(item_id:$id){id}}',variables:{id:lead.id}}}];`);
http('Archive synthetic item',dynamic);
code('Confirm archive',`const r=$input.first().json;if(r.errors?.length||r.data?.archive_item?.id!==$('Check save').first().json.request_id)throw new Error('Archive failed');if(!$('Acknowledge mock booking').first().json.saved)throw new Error('Booking acknowledgment missing');return [{json:{passed:true,board:'${B}',itemId:r.data.archive_item.id,archived:true,checks:['intake-save-readback','separate-consents','mock-outbound-ack-readback','mock-inbound-handoff-readback','optout-readback','mock-booking-Israel-PM-readback','booking-write-acknowledgment','mock-cancellation-clear-date','human-stop-readback','mock-paid-stop-readback'],scope:'actual n8n HTTP and Monday private board; all WhatsApp/Calendly/paid events simulated; no messages, notifications, production records or ads'}}];`);
for(let i=0;i<nodes.length-1;i++)connections[nodes[i].name]={main:[[{node:nodes[i+1].name,type:'main',index:0}]]};
for(const n of nodes){let s=n.parameters.jsonBody;if(s?.startsWith('={{')){let inner=s.slice(3,-2);while(/\}\}/.test(inner))inner=inner.replace(/\}\}/g,'} }');n.parameters.jsonBody='={{'+inner+'}}';}}
const w={name:'TEST LP1 private Monday journey 20261020 NO MESSAGES',active:false,settings:{executionOrder:'v1',timezone:'Asia/Jerusalem'},nodes,connections};
fs.writeFileSync(path.join(root,'src/services/funnel/dist/sandbox-journey.json'),JSON.stringify(w,null,2));
console.log('Built manual private-board journey:',nodes.length,'nodes; no outbound providers');
