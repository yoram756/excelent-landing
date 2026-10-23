// Meta Lead Ads adapter: signature, challenge, Graph fetch and normalization, plus the chain into the lock service.
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('crypto');
const meta=require('../../src/webhooks/intake/meta-adapter');
const {LifecycleDb}=require('../../src/services/lifecycle/db');
const {createLockServer}=require('../../src/services/lifecycle/lock-server');
const SECRET='synthetic-app-secret-for-tests-only';
const sign=(raw,secret=SECRET)=>'sha256='+crypto.createHmac('sha256',secret).update(raw).digest('hex');
const webhook={object:'page',entry:[{id:'111',time:1761210000,changes:[{field:'leadgen',value:{leadgen_id:'4444444444',form_id:'555',page_id:'111',ad_id:'666',created_time:1761210000}},{field:'feed',value:{}}]}]};
const lead={id:'4444444444',created_time:'2026-10-23T09:00:00+0000',ad_id:'666',adset_id:'777',campaign_id:'120252891592490603',form_id:'555',
  field_data:[{name:'full_name',values:['TEST  דנה  כהן']},{name:'phone_number',values:['+972 50-000-0040']},{name:'EMAIL',values:['Test@Example.invalid']}]};

test('X-Hub-Signature-256 is verified on the exact raw body',()=>{
  const raw=JSON.stringify(webhook);
  assert.equal(meta.verifySignature(raw,sign(raw),SECRET),true);
  assert.equal(meta.verifySignature(Buffer.from(raw),sign(raw),SECRET),true);
  assert.equal(meta.verifySignature(raw+' ',sign(raw),SECRET),false,'tampered body');
  assert.equal(meta.verifySignature(raw,sign(raw,'other-secret'),SECRET),false,'wrong secret');
  for(const h of [undefined,'',sign(raw).replace('sha256=','sha1='),sign(raw).slice(0,-2),'sha256='+'g'.repeat(64)])assert.equal(meta.verifySignature(raw,h,SECRET),false,String(h));
  assert.throws(()=>meta.verifySignature(raw,sign(raw),''),/missing_app_secret/);});

test('subscription challenge is echoed only for the verify token',()=>{
  const q={'hub.mode':'subscribe','hub.verify_token':'vt-123','hub.challenge':'987'};
  assert.equal(meta.verifyChallenge(q,'vt-123'),'987');assert.equal(meta.verifyChallenge({...q,'hub.verify_token':'nope'},'vt-123'),null);
  assert.equal(meta.verifyChallenge({...q,'hub.mode':'unsubscribe'},'vt-123'),null);});

test('only leadgen changes become events',()=>{
  assert.deepEqual(meta.leadgenEvents(webhook),[{leadgenId:'4444444444',formId:'555',pageId:'111',adId:'666',createdTime:1761210000}]);
  assert.throws(()=>meta.leadgenEvents({object:'user',entry:[]}),/not_a_page_webhook/);});

test('Graph fetch puts the token in the Authorization header, never in the URL, and fails closed',async()=>{
  const calls=[];const ok=async(url,opt)=>{calls.push({url,opt});return {ok:true,json:async()=>lead};};
  assert.deepEqual(await meta.fetchLead('4444444444',{accessToken:'tok-synthetic',fetchImpl:ok}),lead);
  assert.equal(calls[0].url,'https://graph.facebook.com/v21.0/4444444444?fields=field_data,created_time,ad_id,adset_id,campaign_id,form_id');
  assert.doesNotMatch(calls[0].url,/tok-synthetic|access_token/);assert.equal(calls[0].opt.headers.Authorization,'Bearer tok-synthetic');
  const reply=(status,body)=>async()=>({ok:status<400,json:async()=>body});
  await assert.rejects(meta.fetchLead('4444444444',{accessToken:'t',fetchImpl:reply(400,{error:{message:'x'}})}),/graph_error/);
  await assert.rejects(meta.fetchLead('4444444444',{accessToken:'t',fetchImpl:reply(200,{...lead,id:'1'})}),/graph_bad_lead/);
  await assert.rejects(meta.fetchLead('../me',{accessToken:'t',fetchImpl:ok}),/bad_leadgen_id/);
  await assert.rejects(meta.fetchLead('4444444444',{accessToken:'',fetchImpl:ok}),/missing_access_token/);});

test('a lead is normalized to the intake shape with its campaign, ids and no assumed marketing consent',()=>{
  const n=meta.normalizeLead(lead);
  assert.deepEqual(n,{source:'טופס מטא',campaign:'refi',first_name:'TEST דנה כהן',phone:'972500000040',email:'test@example.invalid',idempotency_key:'meta-4444444444',
    service_request:true,marketing_consent:false,received_at:'2026-10-23T09:00:00+0000',meta:{leadgenId:'4444444444',formId:'555',adId:'666',adsetId:'777',campaignId:'120252891592490603'}});
  assert.match(n.idempotency_key,/^[A-Za-z0-9-]{8,80}$/,'accepted by the intake idempotency rule');
  const split=meta.normalizeLead({...lead,field_data:[{name:'first_name',values:['דנה']},{name:'last_name',values:['כהן']},{name:'phone_number',values:['0500000041']}]});
  assert.equal(split.first_name,'דנה כהן');assert.equal(split.email,null);});

test('unknown campaign, bad phone, bad name or bad email are rejected',()=>{
  assert.throws(()=>meta.normalizeLead({...lead,campaign_id:'999'}),/unknown_campaign/);
  const with_=(name,v)=>({...lead,field_data:lead.field_data.map(f=>f.name===name?{name,values:[v]}:f)});
  assert.throws(()=>meta.normalizeLead(with_('phone_number','+1 212 555 0100')),/bad_phone/);
  assert.throws(()=>meta.normalizeLead(with_('full_name','<b>')),/bad_name/);
  assert.throws(()=>meta.normalizeLead(with_('EMAIL','not-an-email')),/bad_email/);});

test('chain: signed webhook to Graph lead to normalized intake to the HTTP lock, duplicate delivery blocked',async()=>{
  const db=new LifecycleDb(':memory:'),token='k'.repeat(40);const server=createLockServer({db,token});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  try{
    const raw=JSON.stringify(webhook);assert.equal(meta.verifySignature(raw,sign(raw),SECRET),true);
    const results=[];
    for(let delivery=0;delivery<2;delivery++)for(const ev of meta.leadgenEvents(JSON.parse(raw))){
      const n=meta.normalizeLead(await meta.fetchLead(ev.leadgenId,{accessToken:'tok-synthetic',fetchImpl:async()=>({ok:true,json:async()=>lead})}));
      const r=await fetch(base+'/lock',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({phone:n.phone,source:'meta-lead-ads'})});
      results.push((await r.json()).locked);}
    assert.deepEqual(results,[true,false],'Meta retries the same delivery; only the first proceeds');
  }finally{await new Promise(r=>server.close(r));db.close();}});
