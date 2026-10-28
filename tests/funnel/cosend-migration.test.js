const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../..'),binding=require('../../src/services/wa-assistant/config/provider.json'),biz=require('../../config/business.json');
test('current provider binding uses Cosend without changing the technical number or contact roles',()=>{
 assert.equal(biz.whatsapp.provider,'cosend');assert.equal(biz.whatsapp.outboundEnabled,false);assert.equal(biz.whatsapp.senderPhone,binding.businessPhoneKey);assert.equal(biz.phones[binding.businessPhoneKey].e164,'972559881245');assert.equal(binding.phoneNumberId,'1138723472651617');assert.equal(binding.runtimeOutboundEnabled,false);assert.equal(binding.exclusiveResponderApproved,false);assert.equal(binding.modelBudgetApproved,false);
});
test('fresh test exports never call Gambot or direct Meta messages and carry no send credential',()=>{
 for(const campaign of ['refi','consolidation']){
  const build=spawnSync(process.execPath,[ROOT+'/src/services/funnel/build-workflows.js','test'],{env:{...process.env,CAMPAIGN:campaign},encoding:'utf8'});assert.equal(build.status,0,build.stderr);
  const dir=ROOT+'/src/services/funnel/dist/'+(campaign==='refi'?'':campaign+'/');
  for(const file of ['engine-test.json','instant-reply-test.json']){
   const w=JSON.parse(fs.readFileSync(dir+file,'utf8'));
   for(const n of w.nodes.filter(n=>n.type==='n8n-nodes-base.httpRequest')){
    assert.doesNotMatch(n.parameters.url,/gambot|graph\.facebook\.com.*messages/i);
    if(n.name==='Send WhatsApp'){assert.equal(n.disabled,true);assert.equal(n.credentials,undefined);assert.equal(n.parameters.url,binding.apiBaseUrl+'/v1/messages');assert.ok(n.parameters.headerParameters.parameters.some(h=>h.name==='Idempotency-Key'));}
   }
   if(file==='engine-test.json'){assert.ok(w.nodes.some(n=>n.name==='Legacy history blocked'));assert.equal(w.nodes.find(n=>n.name==='Convos').type,'n8n-nodes-base.code');}
  }
 }
});
test('all live and pilot generation stays blocked even if old Meta environment variables exist',()=>{
 for(const mode of ['live','pilot']){
  const result=spawnSync(process.execPath,[ROOT+'/src/services/funnel/build-workflows.js',mode,'2026-10-28T10:00:00Z','972502234052'],{env:{...process.env,CAMPAIGN:'refi',META_WA_PHONE_NUMBER_ID:'1350440204809114',META_WA_CREDENTIAL_ID:'synthetic-legacy'},encoding:'utf8'});
  assert.equal(result.status,1);assert.match(result.stderr,/Cosend activation not verified/);
 }
});
test('internal alert preparation uses a native Cosend body and stable event/item idempotency key',()=>{
 const {intakeSource}=require('../../src/webhooks/intake/source');const lead={ok:true,duplicate:false,eventId:'TEST_migration_1',name:'TEST migration',phone:'972500000040',event_id:'TEST_migration_1',utm_campaign:'campaign_buyers_south'};
 const run=()=>new Function('$',intakeSource('internal-alert.js'))(n=>({first:()=>({json:n==='Check save'?{saved:true,mode:'create',request_id:'123'}:n==='Lead webhook'?{body:lead}:lead})}))[0].json;
 const a=run(),b=run();assert.equal(a.request.url,binding.apiBaseUrl+'/v1/messages');assert.equal(a.request.body.connection_id,binding.connectionId);assert.equal(a.request.body.type,'text');assert.equal(a.request.body.to,biz.phones.excelent_contact.e164);assert.equal(a.request.headers['Idempotency-Key'],b.request.headers['Idempotency-Key']);assert.equal(a.request.body.templateId,undefined);
});
