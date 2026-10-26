// Global opt-out, WhatsApp -> SMS -> Email fallback decision and the instant WhatsApp reply.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {planner,afterSend,item,metaErr}=require('./load');
const {nextChannel}=require('../../src/services/funnel/channels');
const cfg=id=>JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../src/config/campaigns',id+'.json'),'utf8'));
const refi=cfg('refi');const plan=planner('test');
// The same campaign with no SMS or email provider: the decision must block, never invent one.
const noProv={...refi,channels:{...refi.channels,providers:{...refi.channels.providers,sms:null,email:null}}};
const NOW='2026-10-21T09:00:00Z',due={date:'2026-10-21',time:'08:00:00'};
const active=o=>({refi_phone:'0500000040',boolean_mm88mzry:{checked:'true'},fn_status:'פעיל',fn_token:'abcdefghjk',fn_path:'B',fn_step:'M1',fn_next:due,...o});
const all={whatsapp:true,sms:true,email:true};

test('global opt-out outranks every channel and consent',()=>{
  assert.deepEqual(nextChannel({status:'הסר',grants:all},refi),{action:'STOP',reason:'global_optout'});});
test('fallback skips the failed channel and channels without consent, and never invents a provider',()=>{
  assert.deepEqual(nextChannel({status:'פעיל',failed:['whatsapp'],grants:all},noProv),{action:'BLOCKED',reason:'no_provider',channels:['sms','email']});
  assert.deepEqual(nextChannel({status:'פעיל',failed:['whatsapp'],grants:{whatsapp:true,email:true}},noProv),{action:'BLOCKED',reason:'no_provider',channels:['email']});
  assert.deepEqual(nextChannel({status:'פעיל',failed:['whatsapp'],grants:{whatsapp:true}},refi),{action:'STOP',reason:'no_channel_left'});
  const withSms={...noProv,channels:{...noProv.channels,providers:{...noProv.channels.providers,sms:'provider'}}};
  assert.deepEqual(nextChannel({status:'פעיל',failed:['whatsapp'],grants:all},withSms),{action:'SEND',channel:'sms'});
  assert.deepEqual(nextChannel({status:'פעיל',failed:['whatsapp'],grants:{...all,sms:'yes'}},withSms).action,'BLOCKED');});
test('every campaign declares the cascade, providers and one opt-out label that exists on the board',()=>{
  // refi: providers enabled by Yoram (2026-10-25). consolidation stays without SMS and email.
  const want={refi:{sms:'textme',email:'sendgrid'},consolidation:{sms:null,email:null}};
  for(const id of ['refi','consolidation']){const c=cfg(id).channels;assert.deepEqual(c.cascade,['whatsapp','sms','email']);
    assert.equal(c.providers.sms,want[id].sms,id);assert.equal(c.providers.email,want[id].email,id);assert.equal(c.optOut.label,'הסר');}
  assert.equal(cfg('refi').channels.sms.source,'Excelent');assert.equal(cfg('refi').channels.email.from,'office@excelent.co.il');});

test('an opt-out on one item stops every other item with the same phone and blocks new enrollment',()=>{
  const out=plan({items:[item({id:'1',cols:{refi_phone:'0500000040',fn_status:'הסר'}}),item({id:'2',cols:active({refi_phone:'+972 50-000-0040'})}),
    item({id:'3',created:'2026-10-21T08:00:00Z',cols:{refi_phone:'0500000040',boolean_mm88mzry:{checked:'true'}}})],now:NOW});
  assert.equal(out.length,1);assert.equal(out[0].itemId,'2');assert.equal(out[0].hasSend,false);
  assert.equal(JSON.parse(out[0].colsJson).fn_status.label,'הסר');assert.match(out[0].notifyText,/הסרה גלובלית/);});
test('a different phone keeps sending',()=>{
  const out=plan({items:[item({id:'1',cols:{refi_phone:'0500000041',fn_status:'הסר'}}),item({id:'2',cols:active()})],now:NOW});
  assert.equal(out.find(o=>o.itemId==='2').hasSend,true);});

const proof={version:'lp1-channels-20261020',phone:'972500000040',receivedAt:'2026-10-21T08:00:00Z',grants:{whatsapp:true,sms:true,email:true}};
test('the third WhatsApp failure builds the consented SMS fallback with the approved refi text and tells Yoram',()=>{
  const [r]=plan({items:[item({created:'2026-10-21T08:00:00Z',cols:active({long_text_mm8ag9s:JSON.stringify(proof),fn_opens:JSON.stringify({fails:2})})})],now:NOW});
  assert.deepEqual(JSON.parse(r.fallbackJson),{action:'SEND',channel:'sms'});
  const a=afterSend(r,metaErr(131026,'Message undeliverable'));assert.equal(JSON.parse(a.colsJson).fn_status.label,'נעצר');
  assert.equal(a.hasFallback,true);assert.match(a.notifyText,/sms נשלח אוטומטית/);
  assert.equal(a.fallbackSend.request.url,'https://my.textme.co.il/api');assert.equal(a.fallbackSend.request.body.source,'Excelent');
  assert.deepEqual(a.fallbackSend.request.body.destinations,['972500000040']);assert.match(a.fallbackSend.request.body.message,/^שלום דני, פנייתך לבחינת מחזור משכנתא.*לבחינת כדאיות והתנאים/);
  assert.equal(afterSend({...r,stJson:JSON.stringify({fails:0})},metaErr(131026,'Message undeliverable')).hasFallback,false,'first failure only retries');});
test('a lead without a channel receipt has no fallback channel',()=>{
  const [r]=plan({items:[item({cols:active({fn_opens:JSON.stringify({fails:2})})})],now:NOW});
  assert.deepEqual(JSON.parse(r.fallbackJson),{action:'STOP',reason:'no_channel_left'});assert.equal(afterSend(r,metaErr(131026,'Message undeliverable')).hasFallback,false);});

test('Lead_Temperature and Niche_Segment travel with every planned item',()=>{
  const [r]=plan({items:[item({cols:active({numeric_mm883h9v:'72'})})],now:NOW});assert.equal(r.leadTemperature,'HOT');assert.equal(r.nicheSegment,'refi');
  const [c]=plan({items:[item({cols:active()})],now:NOW});assert.equal(c.leadTemperature,null);});

const hsm=require('../../src/services/funnel/meta-hsm').inlineSource();
const biz=fs.readFileSync(path.resolve(__dirname,'../../config/business.json'),'utf8');
const instant=(c,mode='test')=>{const code=fs.readFileSync(path.resolve(__dirname,'../../src/services/funnel/instant-reply.js'),'utf8').replace('__CONFIG__',JSON.stringify(c)).replace('__BUSINESS__',biz).replace('__META_HSM__',hsm).replace('__MODE__',mode);
  const store={};return (lead,now='2026-10-21T09:00:30Z')=>{const D=class extends Date{static now(){return Date.parse(now);}};return new Function('$json','$getWorkflowStaticData','Date',code)(lead,()=>store,D).json;};};
const on={...refi,instantReply:{...refi.instantReply,enabled:true,template:{...refi.instantReply.template,id:'1234567890',name:'exc_refi_instant_test'}}};
const lead={itemId:'77',name:'TEST דנה',firstName:'דנה',phone:'972500000040',receivedAt:'2026-10-21T09:00:00Z',grants:{whatsapp:true},marketing:false};
test('instant reply is off in the repo and waits for an approved template',()=>{
  assert.equal(instant(refi)(lead).skipped,'disabled');
  assert.equal(instant({...on,instantReply:{...on.instantReply,template:{...on.instantReply.template,id:null}}})(lead).skipped,'awaiting_approved_template');});
test('instant reply sends once, within 60 seconds, as a Meta template by name, only with WhatsApp consent',()=>{
  const run=instant(on);const r=run(lead);assert.equal(r.hasSend,true);assert.equal(r.live,false);
  assert.deepEqual(r.send,{messaging_product:'whatsapp',recipient_type:'individual',to:'972500000040',type:'template',template:{name:'exc_refi_instant_test',language:{code:'he'},components:[{type:'body',parameters:[{type:'text',text:'דנה'}]}]}});
  assert.equal(run(lead).skipped,'already_sent');
  assert.equal(instant(on)(lead,'2026-10-21T09:01:01Z').skipped,'window_missed');
  assert.equal(instant(on)({...lead,grants:{whatsapp:false,sms:true}}).skipped,'no_whatsapp_consent');
  assert.equal(instant(on)({...lead,name:'דנה כהן'}).skipped,'test_mode_real_lead');
  assert.equal(instant(on,'live')({...lead,name:'דנה כהן'}).live,true);
  const mkt={...on,instantReply:{...on.instantReply,template:{...on.instantReply.template,category:'MARKETING'}}};
  assert.equal(instant(mkt)(lead).skipped,'no_marketing_consent');assert.equal(instant(mkt)({...lead,marketing:true}).hasSend,true);});

// The instant reply replaces the engine's entry message (architect decision, TASK-04).
const irOn={...refi,instantReply:{...refi.instantReply,enabled:true,template:{...refi.instantReply.template,id:'1234567890',name:'exc_refi_instant_test'}}};
const planOn=planner('test','2026-10-20T07:00:00Z','',irOn);
const fresh=(createdMinAgo,o={})=>{const created=new Date(Date.parse(NOW)-createdMinAgo*60000).toISOString();
  return item({created,cols:{refi_phone:'0500000040',boolean_mm88mzry:{checked:'true'},long_text_mm8ag9s:JSON.stringify({...proof,receivedAt:created}),...o}});};
const at=minAgo=>{const d=new Date(Date.parse(NOW)-minAgo*60000).toISOString();return {date:d.slice(0,10),time:d.slice(11,19)};};
test('with the instant reply on, the engine waits for it instead of sending its own opener',()=>{
  assert.equal(planOn({items:[fresh(1)],now:NOW}).length,0);});
test('after the instant reply went out, the engine starts after the opener and never repeats it',()=>{
  const [r]=planOn({items:[fresh(3,{fn_last:at(2)})],now:NOW});const c=JSON.parse(r.colsJson);
  assert.equal(r.hasSend,false);assert.equal(c.fn_status.label,'פעיל');assert.equal(c.fn_step,'M1');assert.equal(JSON.parse(c.fn_opens.text).instantReplyAt,Date.parse(NOW)-120000);
  assert.deepEqual(c.fn_next,at(-3),'next message 5 minutes after the instant reply');});
test('if the instant reply never went out, the regular opener still goes out once',()=>{
  const [r]=planOn({items:[fresh(3)],now:NOW});assert.equal(r.hasSend,true);assert.equal(r.send.template.name,refi.templates.M1.name);});
test('with the instant reply off (repo default) the engine sends its opener at once',()=>{
  const [r]=plan({items:[fresh(1)],now:NOW});assert.equal(r.send.template.name,refi.templates.M1.name);});

test('a reply that raises heat updates the temperature label, never downgrading one that fits',()=>{
  const reply=[{phone:'972500000040',lastMessageDirection:'incoming',lastMessageTime:new Date(Date.parse(NOW)-60000).toISOString(),lastMessage:'מעוניין'}];
  const run=o=>JSON.parse(plan({items:[item({cols:active({fn_last:at(600),...o})})],convos:reply,now:NOW})[0].colsJson);
  const up=run({numeric_mm883h9v:'65',color_mm88xpa8:'חם'});assert.equal(up.numeric_mm883h9v,'75');assert.deepEqual(up.color_mm88xpa8,{label:'חם מאוד'});
  const keep=run({numeric_mm883h9v:'85',color_mm88xpa8:'רותח'});assert.equal(keep.numeric_mm883h9v,'95');assert.equal(keep.color_mm88xpa8,undefined);});
