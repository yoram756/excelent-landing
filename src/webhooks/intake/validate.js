// Validate, normalize and score a landing page lead. Product agnostic: product code comes from the request.
const LABELS = {"has": {"q": "יש לכם היום משכנתא?", "o": {"yes": "כן, משכנתא אחת", "multi": "כן, יותר ממשכנתא אחת", "selling": "יש, ואנחנו בתהליך מכירה או פירעון", "none": "אין, אנחנו לפני קנייה"}}, "goal": {"q": "מה המטרה העיקרית?", "o": {"monthly": "תשלום חודשי נמוך יותר", "total": "עלות כוללת נמוכה יותר", "term": "קיצור התקופה", "risk": "פחות חשיפה למדד או לריבית", "loans": "טיפול בהלוואות נוספות", "mix": "תמהיל שמתאים לתוכניות שלנו"}}, "bal": {"q": "מה יתרת המשכנתא בקירוב?", "o": {"b1": "עד 300 אלף ₪", "b2": "מעל 300 אלף ועד 600 אלף ₪", "b3": "מעל 600 אלף ועד מיליון ₪", "b4": "מעל מיליון ועד 1.5 מיליון ₪", "b5": "מעל 1.5 מיליון ₪", "na": "לא יודע"}}, "pay": {"q": "מה ההחזר החודשי היום?", "o": {"p1": "עד 3,000 ₪", "p2": "מעל 3,000 ועד 5,000 ₪", "p3": "מעל 5,000 ועד 8,000 ₪", "p4": "מעל 8,000 ועד 12,000 ₪", "p5": "מעל 12,000 ₪", "na": "לא יודע"}}, "left": {"q": "כמה זמן נשאר לתשלום?", "o": {"l1": "עד 10 שנים", "l2": "מעל 10 ועד 20 שנה", "l3": "מעל 20 שנה", "na": "לא יודע"}}, "when": {"q": "מתי תרצו לפעול?", "o": {"week": "השבוע", "month": "החודש", "later": "בהמשך, יש לנו מועד", "none": "אין מועד מסוים"}}, "ask": {"q": "מה אתם מבקשים כרגע?", "o": {"info": "מידע כללי", "check": "בדיקה אישית", "call": "שיחת טלפון קצרה", "meet": "פגישה"}}, "doc": {"q": "יש לכם דוח יתרות לסילוק עדכני?", "o": {"have": "יש, ואשמח לשלוח", "old": "יש, אבל לא עדכני", "help": "אין, צריך עזרה להשיג", "what": "לא בטוח מה זה"}}, "loans": {"q": "יש הלוואות נוספות מלבד המשכנתא?", "o": {"n": "אין", "s": "יש, עד 50 אלף ₪ בסך הכול", "m": "יש, מעל 50 אלף ועד 200 אלף ₪", "l": "יש, מעל 200 אלף ועד 500 אלף ₪", "xl": "יש, מעל 500 אלף ₪", "na": "לא יודע"}}, "income": {"q": "צפוי שינוי בהכנסה בשנים הקרובות?", "o": {"down": "כן, ירידה", "up": "כן, עלייה", "no": "לא צפוי", "na": "לא יודע"}}, "plan": {"q": "מתוכננים מכירה של הנכס או פירעון גדול?", "o": {"sell": "כן, מכירה", "repay": "כן, פירעון גדול", "no": "לא", "na": "עוד לא יודע"}}, "strain": {"q": "יש קושי בתשלומים היום?", "o": {"late": "כן, כבר קשה לשלם בזמן", "tight": "יש לחץ, אבל משלמים", "no": "לא", "skip": "מעדיף לא לענות"}}}
;
// Raw legacy harnesses support LP1; packaged code injects the full catalog and explicit route allowlist.
const CATALOG = typeof __PRODUCT_CATALOG__ === 'undefined' ? {refi:{name:'מחזור משכנתא',funnel_type:'refi',aliases:['LP1']}} : __PRODUCT_CATALOG__;
const ROUTE = typeof __INTAKE__ === 'undefined' ? {campaign:'refi',productSlugs:['refi']} : __INTAKE__;
const MONEY = ['bal','pay','loans','income','strain'];
const W = { intent:{info:0,check:25,call:40,meet:40}, timing:{none:0,later:10,month:15,week:25}, action:{none:0,received:10,meeting:25}, docs:{help:3,what:3,old:3,have:6,received:10} };
const band = n => n>=85?'רותח':n>=70?'חם מאוד':n>=40?'חם':'מתעניין';
function scoreLead(l, now){
  const reasons=[], missing=[];
  const pick=(t,k,f)=>{ if(k==null||!(k in t)){missing.push(f);return 0;} reasons.push(`${f}=${k} (+${t[k]})`); return t[k]; };
  const intent=pick(W.intent,l.ask,'intent'), timing=pick(W.timing,l.when,'timing');
  let ak='none'; if(l.messageReceived) ak='received'; if(l.meetingSet&&!l.meetingCancelled) ak='meeting';
  const action=W.action[ak]; reasons.push(`action=${ak} (+${action})`);
  const docs=pick(W.docs, l.docReceived?'received':l.doc, 'docs');
  const score=intent+timing+action+docs; let label;
  if(missing.includes('intent')&&missing.includes('timing')) label='אין מספיק מידע';
  else { label=band(score); if(label==='רותח' && !(l.messageReceived&&l.requestedRecently)){label='חם מאוד';reasons.push('cap: רותח דורש הודעה שהתקבלה ובקשה עדכנית');} }
  const complexity=[];
  if(l.strain==='late') complexity.push('קושי בתשלום');
  if(['m','l','xl'].includes(l.loans)) complexity.push('הלוואות נוספות משמעותיות');
  if(l.income==='down') complexity.push('ירידה צפויה בהכנסה');
  if(l.has==='none') complexity.push('אין משכנתא, לא מחזור');
  return { version:'heat-1.1', computedAt:now.toISOString(), score, label, reasons, missing, completeness:`${4-missing.length}/4`, complexity, feasibility:'לא נבדקה כדאיות' };
}
const fail = (code, status=400) => [{ json: { ok:false, status, error:code } }];
const req = $input.first().json; const b = req.body || {};
// the landing page proxy passes the visitor IP in x-lp-client-ip; direct calls fall back to the forwarded address
const ip = (req.headers && (req.headers['x-lp-client-ip'] || req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '')).split(',')[0].trim();
if (typeof b !== 'object' || Array.isArray(b)) return fail('bad_body');
if (b.website) return fail('rejected');
const resolveProduct=x=>Object.keys(CATALOG).find(k=>k===String(x).toLowerCase()||CATALOG[k].aliases.some(a=>a.toLowerCase()===String(x).toLowerCase()));
const supplied=[b.product,b.product_slug,b.funnel_type].filter(x=>x!==undefined);
if(!supplied.length)supplied.push((String(b.source||'').match(/LP\d+/i)||[''])[0]);
const slugs=supplied.map(resolveProduct);if(slugs.some(x=>!x))return fail('unknown_product');
const product_slug=slugs[0];if(slugs.some(x=>x!==product_slug))return fail('conflicting_product');
if(!ROUTE.productSlugs.includes(product_slug))return fail('product_route_unconfigured',422);
const product=product_slug==='refi'?'LP1':product_slug;
const P={...CATALOG[product_slug],campaign:ROUTE.campaign,labels:product_slug==='refi'?LABELS:{}};
if (b.campaign !== undefined && b.campaign !== P.campaign) return fail('unknown_campaign');
// This public form endpoint cannot attest that an inbound WhatsApp message exists.
const channel = 'טופס';
const name = String(b.first_name||'').trim().replace(/\s+/g,' ');
const nl = Array.from(name).length; if (nl<2 || nl>40 || /[<>{}\[\]\\]/.test(name)) return fail('bad_name');
// Same normalizer as build-mutation.js, plan.js and calendly.js (tests/funnel/phone.test.js keeps them identical).
const norm=s=>{let d=String(s||'').replace(/\D/g,'');if(d.startsWith('00'))d=d.slice(2);else if(d.startsWith('0'))d='972'+d.slice(1);if(d.startsWith('9720'))d='972'+d.slice(4);return d.length>=11?d:'';};
if (!/^[\d\s()+.\-]*$/.test(String(b.phone||''))) return fail('bad_phone');
const phone = norm(b.phone);
if (!/^9725\d{8}$/.test(phone)) return fail('bad_phone');
if (b.service_request !== true) return fail('no_service_request');
for (const field of ['service_request_at','marketing_consent_at']) {
  if (b[field] != null && !Number.isFinite(Date.parse(b[field]))) return fail('bad_consent_date');
}
const key = String(b.idempotency_key||''); if (!/^[A-Za-z0-9-]{8,80}$/.test(key)) return fail('bad_key');
const email = String(b.email||'').trim();
if (email && (email.length>254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))) return fail('bad_email');
let contactPermissions = null;
if (b.marketing_channels !== undefined) {
  const channels=b.marketing_channels;
  if (!Array.isArray(channels) || channels.length>3 || channels.some(c=>!['whatsapp','email','sms'].includes(c)) || new Set(channels).size!==channels.length) return fail('bad_marketing_channels');
  if (channels.includes('whatsapp') !== (b.marketing_consent===true)) return fail('conflicting_whatsapp_consent');
  if (channels.includes('email') && !email) return fail('email_required_for_marketing');
  contactPermissions={version:'lp1-channels-20261020',source:'LP1 callback form',receivedAt:new Date().toISOString(),requestId:key,phone,email:email||null,
    grants:Object.fromEntries(['whatsapp','email','sms'].map(c=>[c,channels.includes(c)]))};
}
const answers = b.answers && typeof b.answers==='object' ? b.answers : {};
const clean = {};
for (const [k,v] of Object.entries(answers)) {
  if (!Object.hasOwn(P.labels,k)) return fail('bad_answer');
  if (v == null) continue;
  const vals = Array.isArray(v) ? v : [v];
  for (const x of vals) if (typeof x!=='string' || !Object.hasOwn(P.labels[k].o,x)) return fail('bad_answer');
  if (b.money_included !== true && MONEY.includes(k)) continue;
  clean[k] = Array.isArray(v) ? v.slice(0,6) : v;
}
// Bind a replay to the normalized submission, not just its user-supplied key.
// Client timestamps change on an unchanged browser retry, so preserve the first
// saved receipt rather than including those timestamps in the comparison.
// No runtime-specific crypto/module availability is assumed. This exact binding
// contains normalized contact/answers in internal workflow state. Receipts are
// eligible for replay for 48 hours and are pruned lazily on a later validation;
// this is not a timed deletion guarantee. Do not export workflow static data.
const replayBinding = JSON.stringify({version:1,product,product_slug,funnel_type:P.funnel_type,campaign:P.campaign,purpose:'callback',name,phone,email:email||null,
  answers:Object.fromEntries(Object.keys(P.labels).filter(k=>Object.hasOwn(clean,k)).map(k=>[k,clean[k]])),
  money_included:b.money_included===true,service_request:true,marketing_consent:b.marketing_consent===true,
  marketing_channels:contactPermissions ? contactPermissions.grants : null});
// Rate limit per IP and replay receipts are kept in workflow static data.
// This cache is not an atomic claim across concurrent executions or workers.
const sd = $getWorkflowStaticData('global'); const now = Date.now();
sd.idem = sd.idem || {}; sd.ipHits2 = sd.ipHits2 || {};
if (typeof sd.idem!=='object' || Array.isArray(sd.idem)) return fail('idempotency_store_invalid',503);
for (const [k,v] of Object.entries(sd.idem)) if (v && Number.isFinite(v.t) && now - v.t > 48*3600e3) delete sd.idem[k];
for (const [k,v] of Object.entries(sd.ipHits2)) { sd.ipHits2[k] = v.filter(t => now - t < 3600e3); if (!sd.ipHits2[k].length) delete sd.ipHits2[k]; }
if (Object.hasOwn(sd.idem,key)) {
  const prior=sd.idem[key];
  if (!prior || Array.isArray(prior) || prior.binding_version!==1 || typeof prior.binding!=='string' ||
      typeof prior.id!=='string' || !/^[1-9]\d*$/.test(prior.id) || !Number.isFinite(prior.t) || prior.t>now) return fail('idempotency_unverified',409);
  if (prior.binding!==replayBinding) return fail('idempotency_conflict',409);
  return [{ json: { ok:true, duplicate:true, request_id: prior.id } }];
}
if (ip) { const h = sd.ipHits2[ip] || []; if (h.length >= 20) return fail('rate_limited', 429); h.push(now); sd.ipHits2[ip] = h; }
const first = v => Array.isArray(v) ? v[0] : v;
const lab = (q, v) => v==null ? null : (Array.isArray(v) ? v : [v]).map(x => P.labels[q].o[x]).join(', ');
const score = scoreLead({ ask:first(clean.ask), when:first(clean.when), doc:first(clean.doc), loans:first(clean.loans), strain:first(clean.strain), income:first(clean.income), has:first(clean.has), messageReceived: channel==='וואטסאפ', requestedRecently:true }, new Date());
const readable = Object.keys(P.labels).filter(q => clean[q]!=null).map(q => `${P.labels[q].q} ${lab(q, clean[q])}`).join('\n');
return [{ json: { ok:true, duplicate:false, key, replay_binding:replayBinding, product, product_slug, funnel_type:P.funnel_type, campaign:P.campaign, productName:P.name, channel, source:(channel==='טופס' ? `קליטת ${product}` : `${product} וואטסאפ`), name, phone, phoneLocal:'0'+phone.slice(3),
  answers: clean, goalNames: (Array.isArray(clean.goal)?clean.goal:(clean.goal?[clean.goal]:[])).map(x=>P.labels.goal.o[x]), labels: Object.fromEntries(Object.keys(clean).map(q=>[q, lab(q, clean[q])])), readable,
  money_included: b.money_included===true, service_request_at: b.service_request_at || new Date().toISOString(),
  email:email||null, contact_permissions:contactPermissions,
  marketing_consent: b.marketing_consent===true, marketing_consent_at: b.marketing_consent===true ? (b.marketing_consent_at || new Date().toISOString()) : null, score } }];
