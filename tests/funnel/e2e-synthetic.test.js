// Synthetic end to end: one Meta Lead Ads style lead through the real sources, no network.
// SIMULATED: the Meta payload to intake mapping (no Meta adapter exists in this repo), the Monday save response
// and the Gambot send. Everything else is the actual code: SQLite lock, validate, find-query, build-mutation,
// check-save, instant-reply and the engine planner.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {LifecycleDb}=require('../../src/services/lifecycle/db');
const {inject}=require('../../src/webhooks/intake/source');
const {leadTemperature}=require('../../src/services/funnel/crm-fields');
const {planner,item}=require('./load');
const root=path.resolve(__dirname,'../..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const refi=JSON.parse(read('src/config/campaigns/refi.json'));
const intake=n=>inject(read('src/webhooks/intake/'+n+'.js'));

// Meta Lead Ads webhook shape (leadgen), synthetic TEST lead.
const meta=id=>({object:'page',entry:[{id:'synthetic-page',time:1761210000,changes:[{field:'leadgen',value:{leadgen_id:id,form_id:'synthetic-form',
  field_data:[{name:'full_name',values:['TEST דנה כהן']},{name:'phone_number',values:['+972 50-000-0040']},{name:'email',values:['test@example.invalid']}]}}]}]});
const field=(m,n)=>m.entry[0].changes[0].value.field_data.find(f=>f.name===n).values[0];
// SIMULATED mapping into the intake contract.
const toIntake=m=>({product:'LP1',first_name:field(m,'full_name').split(' ').slice(0,2).join(' '),phone:field(m,'phone_number'),email:field(m,'email'),
  idempotency_key:'meta-'+m.entry[0].changes[0].value.leadgen_id,service_request:true,marketing_consent:true,marketing_channels:['whatsapp'],answers:{ask:'meet',when:'week'}});

test('synthetic Meta lead: lock, intake, Monday mutation with heat label, instant WhatsApp, no duplicate opener',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'e2e-'));const db=new LifecycleDb(path.join(dir,'e2e.sqlite'));
  try{
    const now=Date.now(),raw=JSON.stringify(meta('TEST-LEAD-1'));
    // 1. Atomic lock on the normalized phone, raw event stored, before any Monday or WhatsApp step.
    const gate=db.admitLead({source:'meta_lead_ads',raw,phone:field(JSON.parse(raw),'phone_number'),now});
    assert.equal(gate.admitted,true);assert.equal(gate.phone,'972500000040');
    assert.equal(db.db.prepare('SELECT raw FROM incoming_webhooks WHERE id=?').get(gate.webhookId).raw,raw);

    // 2. Intake: validate and normalize.
    const v=new Function('$input','$getWorkflowStaticData',intake('validate'))({first:()=>({json:{body:toIntake(JSON.parse(raw)),headers:{}}})},()=>({}))[0].json;
    assert.equal(v.ok,true,JSON.stringify(v));assert.equal(v.phone,'972500000040');assert.equal(v.contact_permissions.grants.whatsapp,true);

    // 3. Monday GraphQL: phone lookup, then create with heat score and heat label.
    const q=new Function('$input',intake('find-query'))({first:()=>({json:v})})[0].json;
    assert.match(q.query,/board_id: 5106246268, columns: \[\{column_id: "refi_phone"/);assert.deepEqual(q.variables.v,['972500000040']);
    const m=new Function('$input','$','$getWorkflowStaticData',intake('build-mutation'))({first:()=>({json:{data:{items_page_by_column_values:{cursor:null,items:[]}}}})},()=>({first:()=>({json:v})}),()=>({}))[0].json;
    assert.equal(m.mode,'create');assert.match(m.query,/create_item\(board_id: 5106246268, group_id: "topics"/);
    const vals=JSON.parse(m.variables.vals);
    assert.deepEqual(vals.refi_phone,{phone:'972500000040',countryShortName:'IL'});assert.equal(vals.numeric_mm883h9v,String(v.score.score));
    const tier=leadTemperature(v.score.score,refi);
    assert.equal(tier,'WARM');assert.equal(vals.color_mm88xpa8.label,'חם');
    assert.ok(refi.crmFields.leadTemperature.labels[tier].accept.includes(vals.color_mm88xpa8.label),'heat label agrees with Lead_Temperature');
    const saved=new Function('$input','$','$getWorkflowStaticData',intake('check-save'))({first:()=>({json:{data:{create_item:{id:'900001'}}}})},
      n=>({first:()=>({json:n==='Validate'?v:m})}),()=>({}))[0].json;
    assert.equal(saved.saved,true);assert.equal(saved.request_id,'900001');

    // 4. Instant WhatsApp within 60 seconds (template approval SIMULATED; the repo keeps it off).
    const irOn={...refi,instantReply:{...refi.instantReply,enabled:true,template:{...refi.instantReply.template,id:'1234567890',name:'exc_refi_instant_test'}}};
    const code=read('src/services/funnel/instant-reply.js').replace('__CONFIG__',JSON.stringify(irOn)).replace('__BUSINESS__',read('config/business.json')).replace('__META_HSM__',require('../../src/services/funnel/meta-hsm').inlineSource()).replace('__MODE__','test');
    const lead={itemId:saved.request_id,name:v.name,firstName:v.name.replace(/^TEST\s*/,'').split(' ')[0],phone:v.phone,receivedAt:new Date(now).toISOString(),grants:v.contact_permissions.grants,marketing:v.marketing_consent};
    const sent=new Function('$json','$getWorkflowStaticData','Date',code)(lead,()=>({}),Date).json;
    assert.equal(sent.hasSend,true,JSON.stringify(sent));assert.equal(sent.live,false);
    assert.deepEqual(sent.send,{messaging_product:'whatsapp',recipient_type:'individual',to:'972500000040',type:'template',template:{name:'exc_refi_instant_test',language:{code:'he'},components:[{type:'body',parameters:[{type:'text',text:'דנה'}]}]}});

    // 5. A second identical Meta delivery 20 seconds later is blocked before Monday or WhatsApp.
    const dup=db.admitLead({source:'meta_lead_ads',raw,phone:'0500000040',now:now+20000});
    assert.equal(dup.admitted,false);
    assert.deepEqual(db.db.prepare('SELECT type FROM lifecycle_events ORDER BY id').all().map(r=>r.type),['lead_received','duplicate_blocked']);

    // 6. The engine sees the instant reply mark and does not send its own opener.
    const d=new Date(now+5000).toISOString();
    const monday=item({id:saved.request_id,name:v.name,created:new Date(now).toISOString(),cols:{refi_phone:'+972500000040',boolean_mm88mzry:vals.boolean_mm88mzry,
      long_text_mm8ag9s:vals.long_text_mm8ag9s.text,numeric_mm883h9v:vals.numeric_mm883h9v,color_mm88xpa8:vals.color_mm88xpa8.label,fn_last:{date:d.slice(0,10),time:d.slice(11,19)}}});
    const [r]=planner('test','2026-10-20T07:00:00Z','',irOn)({items:[monday],now:new Date(now+180000).toISOString()});
    const cols=JSON.parse(r.colsJson);
    assert.equal(r.hasSend,false,'no duplicate opener');assert.equal(cols.fn_status.label,'פעיל');assert.equal(cols.fn_step,'M1');
    assert.equal(r.leadTemperature,'WARM');assert.equal(r.nicheSegment,'refi');
  }finally{db.close();fs.rmSync(dir,{recursive:true,force:true});}
});
