// SMS (TextMe), email (SendGrid) and the WhatsApp fallback planner. Pure builders and an injected transport: no network.
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('fs');const path=require('path');
const R=p=>path.resolve(__dirname,'../..',p);
const TM=require(R('src/services/sms/textme')),SG=require(R('src/services/email/sendgrid')),FB=require(R('src/services/funnel/fallback'));
const {afterSend}=require('./load');
const cfg=JSON.parse(fs.readFileSync(R('src/config/campaigns/refi.json'),'utf8')),biz=JSON.parse(fs.readFileSync(R('config/business.json'),'utf8'));
const drafts=()=>JSON.parse(fs.readFileSync(R('src/services/email/drafts.json'),'utf8'));
const KW=cfg.channels.optOut.keywords;
const P={sms:TM,email:SG};
const live=(over={})=>({...cfg,product:'reverse_mortgage',channels:{...cfg.channels,sms:{source:'Excelent'},email:{from:'office@example.com'}},...over});

test('textme request: endpoint, E.164 destinations, no token in the body',()=>{
  const r=TM.buildRequest({source:'Excelent',destinations:['050-0000040','972500000041'],message:'x'});
  assert.equal(r.url,'https://my.textme.co.il/api');assert.deepEqual(r.body.destinations,['972500000040','972500000041']);
  assert.ok(!JSON.stringify(r).includes('Bearer'));
  assert.throws(()=>TM.buildRequest({destinations:['0500000040'],message:'x'}),/source/);
  assert.throws(()=>TM.buildRequest({source:'S',destinations:['123'],message:'x'}),/destination/);});
test('textme send adds the Bearer header through the injected transport',async()=>{
  let seen;const r=await TM.send({source:'S',destinations:['0500000040'],message:'m'},{token:'tok',transport:async q=>{seen=q;return{status:200,json:{}};}});
  assert.equal(seen.headers.Authorization,'Bearer tok');assert.equal(r.ok,true);
  await assert.rejects(TM.send({source:'S',destinations:['0500000040'],message:'m'},{}),/token/);});
test('textme webhook: urlencoded reply with only an opt-out word opts out; a sentence or a DLR does not',()=>{
  assert.equal(TM.parseWebhook('sender=0500000040&message='+encodeURIComponent('הסר.'),KW).optOut,true);
  assert.equal(TM.parseWebhook({from:'972500000040',message:'STOP'},KW).optOut,true);
  assert.equal(TM.parseWebhook('sender=0500000040&message='+encodeURIComponent('לא להסיר אותי'),KW).optOut,false);
  const d=TM.parseWebhook({destination:'0500000040',source:'Excelent',status:'DELIVERED'},KW);
  assert.equal(d.type,'dlr');assert.equal(d.phone,'972500000040');assert.equal(d.optOut,false);});
test('sendgrid request: v3 shape, invalid addresses refused, 202 is success',async()=>{
  const r=SG.buildRequest({from:'a@b.co',to:'c@d.co',subject:'s',text:'t'});
  assert.equal(r.url,'https://api.sendgrid.com/v3/mail/send');assert.equal(r.body.personalizations[0].to[0].email,'c@d.co');
  assert.throws(()=>SG.buildRequest({from:'a@b.co',to:'nope',subject:'s',text:'t'}),/recipient/);
  assert.equal((await SG.send({from:'a@b.co',to:'c@d.co',subject:'s',text:'t'},{apiKey:'k',transport:async()=>({status:202})})).ok,true);});
test('refi draft is approved with the owner text; the three product drafts stay unapproved',()=>{const d=drafts();
  assert.equal(d.refi.approved,true);assert.match(d.refi.sms,/להסרה השיבו STOP$/);assert.equal(d.refi.email.subject,'פנייתך לבחינת מחזור משכנתא נקלטה בהצלחה - אקסלנט');
  for(const k of ['bank_refused_mortgage','debt_consolidation_unsecured','reverse_mortgage']){assert.equal(d[k].approved,false,k);assert.ok(d[k].sms&&d[k].email.subject&&d[k].email.text,k);}});
test('planFallback never sends without an approved draft, a product or a configured sender',()=>{
  const dec={action:'SEND',channel:'sms'},lead={phone:'0500000040',first:'דני'};
  assert.equal(FB.planFallback({decision:dec,lead,cfg:live(),biz,drafts:drafts()},P).reason,'draft_not_approved');
  const ok=drafts();ok.reverse_mortgage.approved=true;
  assert.equal(FB.planFallback({decision:dec,lead,cfg:{...cfg,product:undefined},biz,drafts:ok},P).reason,'no_content');
  assert.equal(FB.planFallback({decision:dec,lead,cfg:live({channels:{...cfg.channels,sms:undefined}}),biz,drafts:ok},P).reason,'invalid_request');
  assert.equal(FB.planFallback({decision:{action:'BLOCKED',reason:'no_provider'},lead,cfg:live(),biz,drafts:ok},P).action,'BLOCKED');
  const s=FB.planFallback({decision:dec,lead,cfg:live(),biz,drafts:ok},P);
  assert.equal(s.action,'SEND');assert.match(s.request.body.message,/^שלום דני, /);assert.match(s.request.body.message,/055-2783459/);
  const anon=FB.planFallback({decision:dec,lead:{phone:'0500000040',first:'שלום'},cfg:live(),biz,drafts:ok},P);
  assert.match(anon.request.body.message,/^שלום, /);});
test('only a Meta 131047 / re-engagement refusal counts as a closed window',()=>{
  assert.equal(FB.isWindowClosed({success:false,message:'(#131047) Re-engagement message'}),true);
  assert.equal(FB.isWindowClosed({success:false,code:131047}),true);
  assert.equal(FB.isWindowClosed({success:false,message:'template paused for 24h'}),false);
  assert.equal(FB.isWindowClosed({success:true,message:'131047'}),false);});
test('After send: a closed window stops at the first refusal, any other refusal retries',()=>{
  const base={colmap:{path:'p',step:'s',next:'n',status:'st',state:'o'},colsJson:'{}',prevPath:'A',prevStep:'X',stJson:'{}',phone:'972500000040',first:'דני',campaign:'refi',fallbackJson:JSON.stringify({action:'SEND',channel:'sms'}),notifyText:''};
  const a=afterSend(base,{success:false,message:'(#131047) Re-engagement message'});
  assert.equal(JSON.parse(a.colsJson).st.label,'נעצר');assert.equal(a.hasFallback,true);assert.equal(a.fallbackSend.channel,'sms');
  const b=afterSend(base,{success:false,message:'rate limit'});
  assert.equal(JSON.parse(b.colsJson).st,undefined);assert.equal(b.hasFallback,false);});
