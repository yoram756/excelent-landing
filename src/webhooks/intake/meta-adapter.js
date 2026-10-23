// Meta Lead Ads adapter: verify the webhook, fetch the lead from the Graph API, normalize it to the intake shape.
// Secrets come only from the caller (env META_APP_SECRET, META_ACCESS_TOKEN, META_VERIFY_TOKEN); none live in the repo.
// The campaign is chosen by meta.campaignIds in src/config/campaigns/<id>.json; an unknown campaign is rejected.
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const GRAPH='https://graph.facebook.com';
const FIELDS='field_data,created_time,ad_id,adset_id,campaign_id,form_id';
// Same normalizer as validate.js, build-mutation.js, plan.js, calendly.js and db.js (tests/funnel/phone.test.js keeps them identical).
const norm=s=>{let d=String(s||'').replace(/\D/g,'');if(d.startsWith('00'))d=d.slice(2);else if(d.startsWith('0'))d='972'+d.slice(1);if(d.startsWith('9720'))d='972'+d.slice(4);return d.length>=11?d:'';};
const fail=code=>{const e=Error(code);e.code=code;throw e;};
const sameSecret=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y);};

// X-Hub-Signature-256: "sha256=" + HMAC-SHA256(app secret, raw request body). Must be computed on the exact raw bytes.
const verifySignature=(rawBody,header,appSecret)=>{
  if(!appSecret)fail('missing_app_secret');
  const m=/^sha256=([a-f0-9]{64})$/.exec(String(header||''));if(!m)return false;
  const expected=crypto.createHmac('sha256',appSecret).update(Buffer.isBuffer(rawBody)?rawBody:Buffer.from(String(rawBody),'utf8')).digest('hex');
  return sameSecret(m[1],expected);
};

// GET subscription handshake: echo hub.challenge only for the configured verify token.
const verifyChallenge=(query,verifyToken)=>{
  if(!verifyToken)fail('missing_verify_token');
  return query['hub.mode']==='subscribe'&&sameSecret(query['hub.verify_token']||'',verifyToken)?String(query['hub.challenge']||''):null;
};

// Leadgen changes in a verified webhook body.
const leadgenEvents=body=>{
  if(!body||body.object!=='page'||!Array.isArray(body.entry))fail('not_a_page_webhook');
  return body.entry.flatMap(e=>(e.changes||[]).filter(c=>c.field==='leadgen'&&/^\d+$/.test(String(c.value?.leadgen_id||''))).map(c=>({
    leadgenId:String(c.value.leadgen_id),formId:c.value.form_id?String(c.value.form_id):null,pageId:String(c.value.page_id||e.id||''),
    adId:c.value.ad_id?String(c.value.ad_id):null,createdTime:c.value.created_time??null})));
};

// GET /{leadgen_id}. The token goes in the Authorization header, never in the URL.
const fetchLead=async(leadgenId,{accessToken,graphVersion='v21.0',fetchImpl=fetch})=>{
  if(!accessToken)fail('missing_access_token');
  if(!/^\d+$/.test(String(leadgenId)))fail('bad_leadgen_id');
  if(!/^v\d+\.\d+$/.test(graphVersion))fail('bad_graph_version');
  const res=await fetchImpl(`${GRAPH}/${graphVersion}/${leadgenId}?fields=${FIELDS}`,{headers:{Authorization:'Bearer '+accessToken}});
  const body=await res.json().catch(()=>null);
  if(!res.ok||!body||body.error)fail('graph_error');
  if(String(body.id)!==String(leadgenId)||!Array.isArray(body.field_data))fail('graph_bad_lead');
  return body;
};

const campaignIndex=(dir=path.join(__dirname,'../../config/campaigns'))=>{
  const index={};
  for(const f of fs.readdirSync(dir).filter(f=>f.endsWith('.json'))){const c=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));
    for(const id of c.meta?.campaignIds||[]){if(index[id])fail('campaign_id_in_two_configs');index[id]=c.id;}}
  return index;
};

// Unified intake shape. A lead form asks to be contacted (service request); it is not marketing consent.
const normalizeLead=(lead,{campaigns=campaignIndex()}={})=>{
  const f={};for(const x of lead.field_data||[])if(x&&typeof x.name==='string'&&Array.isArray(x.values))f[x.name.toLowerCase()]=String(x.values[0]??'').trim();
  const campaign=campaigns[String(lead.campaign_id||'')];if(!campaign)fail('unknown_campaign');
  const full=(f.full_name||[f.first_name,f.last_name].filter(Boolean).join(' ')).replace(/\s+/g,' ').trim();
  if(Array.from(full).length<2||Array.from(full).length>40||/[<>{}\[\]\\]/.test(full))fail('bad_name');
  const phone=norm(f.phone_number);if(!/^9725\d{8}$/.test(phone))fail('bad_phone');
  const email=(f.email||'').toLowerCase();if(email&&!/^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[a-z]{2,24}$/.test(email))fail('bad_email');
  return {source:'טופס מטא',campaign,first_name:full,phone,email:email||null,idempotency_key:'meta-'+lead.id,
    service_request:true,marketing_consent:false,received_at:lead.created_time||null,
    meta:{leadgenId:String(lead.id),formId:lead.form_id?String(lead.form_id):null,adId:lead.ad_id?String(lead.ad_id):null,
      adsetId:lead.adset_id?String(lead.adset_id):null,campaignId:String(lead.campaign_id)}};
};

module.exports={verifySignature,verifyChallenge,leadgenEvents,fetchLead,normalizeLead,campaignIndex,norm};
