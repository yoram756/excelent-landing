// One phone rule for intake (validate, build-mutation) and the WhatsApp engine (plan, calendly).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const root=process.env.PHONE_SOURCE_ROOT||path.resolve(__dirname,'../../src');
const SOURCES=['webhooks/intake/validate.js','webhooks/intake/build-mutation.js','services/funnel/plan.js','services/funnel/calendly.js','services/lifecycle/db.js','webhooks/intake/meta-adapter.js'];
const normOf=f=>{const line=fs.readFileSync(path.join(root,f),'utf8').split(/\r?\n/).find(l=>/^const norm\s*=/.test(l));
  assert.ok(line,'no single-line norm in '+f);return new Function(line+';return norm;')();};
const CASES=[['0501234567','972501234567'],['050-123-4567','972501234567'],['+972501234567','972501234567'],['972501234567','972501234567'],
  ['+972 50 123 4567','972501234567'],['00972501234567','972501234567'],['+972-0501234567','972501234567'],['9720501234567','972501234567'],
  ['050.123.4567','972501234567'],['(050) 1234567','972501234567'],['12345',''],['',''],[null,'']];

test('every copy of norm gives the same canonical number',()=>{
  for(const f of SOURCES){const norm=normOf(f);for(const [input,want] of CASES)assert.equal(norm(input),want,f+' '+JSON.stringify(input));}
});

let seq=0;
const validate=b=>new Function('$input','$getWorkflowStaticData',fs.readFileSync(path.join(root,'webhooks/intake/validate.js'),'utf8'))(
  {first:()=>({json:{body:{product:'LP1',first_name:'TEST פנימי',idempotency_key:'test-phone-'+(++seq),service_request:true,marketing_consent:false,answers:{ask:'check',when:'week'},...b},headers:{}}})},()=>({}))[0].json;

test('intake accepts every common mobile format and stores the canonical number',()=>{
  for(const p of ['0500000040','+972 50-000-0040','00972500000040','+972-0500000040','050.000.0040']){const r=validate({phone:p});assert.equal(r.ok,true,p);assert.equal(r.phone,'972500000040',p);}
});

test('intake rejects letters, landlines and short numbers',()=>{
  for(const p of ['05O0000040','050abc0000040','036000000','0500000','','+1 212 555 0100'])assert.equal(validate({phone:p}).ok,false,p);
});

// Meta Cloud API: the sender is the phone number id in the send URL (META_WA_PHONE_NUMBER_ID at build time), never a number in the body.
test('WhatsApp sends name no sender in the body and no hardcoded number',()=>{
  const biz=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../config/business.json'),'utf8'));
  assert.equal(biz.phones.gambot_sender.e164,'972559881245');
  const plan=fs.readFileSync(path.join(root,'services/funnel/plan.js'),'utf8');
  assert.match(plan,/HSM\.templatePayload\(\{to:phone,/);assert.doesNotMatch(plan,/\bfrom:/);
  const js=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?(e.name==='dist'?[]:js(path.join(d,e.name))):e.name.endsWith('.js')?[path.join(d,e.name)]:[]);
  for(const f of js(root))assert.doesNotMatch(fs.readFileSync(f,'utf8'),/9881245/,f);
});
