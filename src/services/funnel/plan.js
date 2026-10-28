// Shared funnel engine planner (all campaigns). Runs inside the n8n Code node "Plan".
// Everything campaign specific comes from CFG (src/config/campaigns/<id>.json), injected by build-workflows.js.
// MODE: 'test' handles only items named TEST and never sends WhatsApp; 'pilot' sends only to listed
// internal phones; 'live' handles real leads only.
const CFG = __CONFIG__;
const BIZ = __BUSINESS__;
// Lead_Temperature, Niche_Segment, Churn_Reason from CFG.crmFields (src/services/funnel/crm-fields.js, injected by the build).
const CRM = __CRM_FIELDS__;
// Global opt-out and the WhatsApp -> SMS -> Email fallback decision (src/services/funnel/channels.js).
const CH = __CHANNELS__, OPT = CFG.channels.optOut;
// Meta Cloud API template body (src/services/funnel/meta-hsm.js, injected by the build).
const HSM = __META_HSM__;
const SENDER = BIZ.phones[BIZ.whatsapp.senderPhone].number;
const CONTACT = CFG.identity&&CFG.identity.contactPhone ? BIZ.phones[CFG.identity.contactPhone].number : 'לא הוגדר מספר קשר לקמפיין';
const MODE = '__MODE__';
// pilot: real sends, but only to the internal phones listed here (injected by the build)
const PILOT = '__PILOT__'.split(',').filter(Boolean);
// stages that mean a person is handling the lead: automation does not send
const HUMAN = CFG.stages.human;
const C = CFG.columns, SG = CFG.stages;
const GO_LIVE = Date.parse('__GO_LIVE__');
let testBody={};try{testBody=$('Run test').first().json.body||{};}catch(e){}
const T = {}, DEST = {};
for (const [code, t] of Object.entries(CFG.templates)) { T[code] = t.id; if (t.dest) DEST[code] = t.dest; }
const H = 3600000, D = 86400000;
const now = (MODE==='test'&&testBody.now)?Date.parse(testBody.now):Date.now();

function parts(ts){const o={};new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',weekday:'short',hour12:false}).formatToParts(new Date(ts)).forEach(p=>o[p.type]=p.value);o.hour=o.hour==='24'?'00':o.hour;return o;}
function offset(ts){const p=parts(ts);return Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute)-Math.floor(ts/60000)*60000;}
function atLocal(ts,days,hh,mm){const p=parts(ts+days*D);const guess=Date.UTC(+p.year,+p.month-1,+p.day,hh,mm);return guess-offset(guess);}
function dayKey(ts){const p=parts(ts);return p.year+p.month+p.day;}
const HEB_DAYS={Sun:'ראשון',Mon:'שני',Tue:'שלישי',Wed:'רביעי',Thu:'חמישי',Fri:'שישי',Sat:'שבת'};
// next due time from a config spec like {days:1, at:'10:00'} or {minutes:5}
function due(spec,from){if(!spec)return null;if(spec.at){const [hh,mm]=spec.at.split(':').map(Number);return atLocal(from,spec.days||0,hh,mm);}return from+(spec.days||0)*D+(spec.hours||0)*H+(spec.minutes||0)*60000;}
function whenText(ts){const p=parts(ts);return 'יום '+HEB_DAYS[p.weekday]+' '+(+p.day)+'.'+(+p.month)+' בשעה '+p.hour+':'+p.minute;}

let candles=null,havdalah=null;
try{const items=($('Shabbat').first().json.items)||[];for(const it of items){if(it.category==='candles'&&!candles)candles=Date.parse(it.date);if(it.category==='havdalah'&&!havdalah)havdalah=Date.parse(it.date);}}catch(e){}
function windowOpen(ts){const p=parts(ts);const mins=(+p.hour)*60+(+p.minute);
  if(candles&&havdalah&&ts>=candles&&ts<havdalah)return false;
  if(p.weekday==='Fri'){if(mins<510)return false;if(candles&&dayKey(candles)===dayKey(ts))return ts<candles;return mins<840;}
  if(p.weekday==='Sat'){if(havdalah&&dayKey(havdalah)===dayKey(ts))return ts>=havdalah&&mins<1350;return mins>=1200&&mins<1350;}
  return mins>=510&&mins<1200;}
const open=windowOpen(now);

const norm=s=>{let d=String(s||'').replace(/\D/g,'');if(d.startsWith('00'))d=d.slice(2);else if(d.startsWith('0'))d='972'+d.slice(1);if(d.startsWith('9720'))d='972'+d.slice(4);return d.length>=11?d:'';};
const convos={};let convosOk=false;
try{if(Array.isArray($('Convos').first().json.data.items))convosOk=true;for(const c of ($('Convos').first().json.data.items||[]))convos[norm(c.phone)]={dir:c.lastMessageDirection,time:Date.parse(c.lastMessageTime),text:c.lastMessage||''};}catch(e){}
const mdata=$('Items').first().json.data;
const meId=mdata.me.id;
const page=mdata.boards[0].items_page;
if (page.cursor) throw new Error('Monday list exceeds one 500-item page: refuse sends until paginated lookup is configured');
const items=page.items;
const col=(cv,k)=>cv[C[k]]||{};
// The built-in Crypto node supplies independent 128-bit random tokens. The Code
// sandbox does not expose crypto on the deployed n8n instance. No weak fallback.
let tokenRows=[];try{tokenRows=$('Secure tokens').all();}catch(e){}
const rand=itemId=>{
  const rows=tokenRows.filter(r=>String(r.json.itemId)===String(itemId));
  if(rows.length!==1||! /^[a-f0-9]{32}$/.test(rows[0].json.secureToken||''))
    throw new Error('Secure CSPRNG unavailable or token missing/ambiguous for lead');
  return rows[0].json.secureToken;
};
const dateVal=v=>{try{const j=JSON.parse(v||'null');if(!j||!j.date)return null;return Date.parse(j.date+'T'+(j.time||'00:00:00')+'Z');}catch(e){return null;}};
const toDate=ts=>{if(!ts)return null;const d=new Date(ts).toISOString();return {date:d.slice(0,10),time:d.slice(11,19)};};
const checked=v=>{try{return JSON.parse(v||'null')?.checked==='true'||JSON.parse(v||'null')?.checked===true;}catch(e){return false;}};

const out=[],temps={};
// phones already in the funnel: a second item with the same phone never starts its own series
const owner={};
const usedTokens=new Set(items.map(it=>(it.column_values.find(c=>c.id===C.token)||{}).text).filter(Boolean));
for(const it of items){const cv={};for(const c of it.column_values)cv[c.id]=c;const ph=norm(col(cv,'phone').text);if(ph&&col(cv,'status').text&&!owner[ph])owner[ph]=it.id;}
// A person who opted out on any item is opted out everywhere: every item with that phone stops, on every channel.
const optedOut=new Set();
for(const it of items){const cv={};for(const c of it.column_values)cv[c.id]=c;const ph=norm(col(cv,'phone').text);if(ph&&col(cv,'status').text===OPT.label)optedOut.add(ph);}
for(const it of items){
  const cv={};for(const c of it.column_values)cv[c.id]=c;
  const isTest=/^TEST/.test(it.name||'');
  const phone=norm(col(cv,'phone').text);if(!phone)continue;
  if(MODE==='test'){if(!isTest)continue;}
  else if(MODE==='pilot'){if(!PILOT.includes(phone))continue;}
  else if(isTest)continue;
  let status=col(cv,'status').text||'';let path=col(cv,'path').text||'';let step=col(cv,'step').text||'';
  let next=dateVal(col(cv,'next').value);const last=dateVal(col(cv,'last').value);
  let token=col(cv,'token').text||'';const stage=col(cv,'stage').text||'';
  const mkt=checked(col(cv,'consentMarketing').value);const svc=checked(col(cv,'consentService').value);
  const permissionRule=CFG.contactPermissions;
  const needsChannelProof=permissionRule&&Date.parse(it.created_at)>=Date.parse(permissionRule.requiredAfter);
  let channelProof=null;try{channelProof=JSON.parse(cv[permissionRule?.column]?.text||'null');}catch(e){}
  const proofAt=Date.parse(channelProof?.receivedAt);
  const whatsappAllowed=!needsChannelProof||(channelProof?.version===permissionRule.version&&channelProof?.phone===phone&&channelProof?.grants?.whatsapp===true&&Number.isFinite(proofAt)&&proofAt>=Date.parse(permissionRule.requiredAfter)&&proofAt<=now);
  // Score explanations also exist for callback-only leads. A configured campaign
  // must find actual questionnaire answer lines before selecting the quiz path.
  const quizText=(col(cv,'quizDone').text||'').trim();
  const quiz=CFG.quizDonePattern ? new RegExp(CFG.quizDonePattern).test(quizText) : quizText.length>0;
  const meeting=dateVal(col(cv,'meeting').value);
  let heat=Number(col(cv,'heat').text||0);
  const temp=()=>{temps[it.id]=CRM.crmFields({heat:(col(cv,'heat').text||heat)?heat:''},CFG).values.Lead_Temperature;};temp();
  // Corrupt state may hide an unresolved send; never reset it and send again.
  let st;try{st=JSON.parse(col(cv,'state').text||'{}');if(!st||typeof st!=='object'||Array.isArray(st))continue;}catch(e){continue;}
  const first=(it.name||'').replace(/^TEST\s*/,'').trim().split(/\s+/)[0]||'שלום';
  const cols={};let send=null;let notify=null;let changed=false;let fallback=null;
  const set=(k,v)=>{cols[k]=v;changed=true;};

  if(!status){
    if(!whatsappAllowed||optedOut.has(phone))continue;
    // Do not enroll a lead already handled by a person, even with no funnel status.
    if(HUMAN.includes(stage)||(col(cv,'firstReply').text||'').trim())continue;
    if(!(mkt||svc))continue;
    if(owner[phone]&&owner[phone]!==it.id)continue;
    owner[phone]=it.id;
    if(Date.parse(it.created_at)<GO_LIVE)continue;
    // The instant reply (instant-reply.js) replaces the entry message. Give it graceMinutes to mark fn_last;
    // if it went out, start after it; if it never did, the entry message goes out as before. Never both.
    const IR=CFG.instantReply,irOn=!!IR&&IR.enabled===true&&/^\d{6,}$/.test(String(IR.template.id||''));
    if(irOn&&!last&&now-Date.parse(it.created_at)<IR.graceMinutes*60000)continue;
    token=rand(it.id);if(usedTokens.has(token))throw new Error('Secure token collision; abort enrollment');usedTokens.add(token);status='פעיל';
    if(quiz){path=CFG.entry.quizDone.path;step=CFG.entry.quizDone.step;}else{path=CFG.entry.default.path;step=CFG.entry.default.step;}
    next=now;st.mkt=mkt;st.tokenIssuedAt=now;st.tokenExpiresAt=now+90*D;
    if(irOn&&last){const seq=CFG.sequences[path]||[];const nx=seq[seq.findIndex(x=>x.code===step)+1];
      if(nx){step=nx.code;next=due(nx.next,last);if(nx.thenPath)path=nx.thenPath;}st.instantReplyAt=last;}
    set(C.state,{text:JSON.stringify(st)});
    set(C.status,{label:'פעיל'});set(C.token,token);
  }
  if(stage===SG.paid&&status!=='לקוח'){set(C.status,{label:'לקוח'});set(C.next,{});out.push({itemId:it.id,phone,cols,send:null,notify:null});continue;}
  if(stage===SG.notRelevant&&status==='פעיל'){set(C.status,{label:'נעצר'});set(C.next,{});out.push({itemId:it.id,phone,cols,send:null,notify:null});continue;}

  if(status==='פעיל'&&optedOut.has(phone)){status=OPT.label;set(C.status,{label:OPT.label});set(C.next,{});out.push({itemId:it.id,phone,cols,send:null,notify:'הסרה גלובלית: המספר ביקש הסרה בפנייה אחרת, כל הערוצים נעצרו גם כאן.'});continue;}

  const cvn=convos[phone];
  if(status==='פעיל'&&cvn&&cvn.time>(last||0)+120000&&cvn.time>(st.reply||0)&&(cvn.dir==='incoming'||last)){
    st.reply=cvn.time;const t=cvn.text.trim();
    if(new RegExp(OPT.keywords,'i').test(t)){status=OPT.label;optedOut.add(phone);set(C.status,{label:OPT.label});set(C.next,{});notify='ביקש הסרה מהודעות: "'+t.slice(0,80)+'"';}
    else if(/^פחות/.test(t)){status='פחות';set(C.status,{label:'פחות'});notify='ביקש לקבל פחות הודעות';}
    else if(cvn.dir!=='incoming'){status='ענה';set(C.status,{label:'ענה'});notify='יש שיחה ידנית פעילה עם הליד במספר השליחה '+SENDER+', ולכן ההודעות האוטומטיות נעצרו. לחזרה ללקוח: '+CONTACT+'. כדי להחזיר אותו למשפך: סטטוס משפך = פעיל.';}
    else{status='ענה';set(C.status,{label:'ענה'});heat+=10;set(C.heat,String(heat));for(const [k,v] of Object.entries(CRM.crmFields({heat,currentLabel:cv[CFG.crmFields.leadTemperature.column]?.text},CFG).columns))set(k,v);notify='ענה בוואטסאפ למספר השליחה '+SENDER+': "'+t.slice(0,120)+'". ההודעות האוטומטיות נעצרו. לחזרה ללקוח: '+CONTACT+'. כדי להחזיר אותו למשפך: סטטוס משפך = פעיל.';}
    set(C.state,{text:JSON.stringify(st)});temp();
  }
  if(status!=='פעיל'){if(changed)out.push({itemId:it.id,phone,cols,send:null,notify});continue;}
  if(!whatsappAllowed){set(C.status,{label:'נעצר'});set(C.next,{});out.push({itemId:it.id,phone,cols,send:null,notify:'אין אישור WhatsApp מתועד לערוץ זה; הסדרה נעצרה.'});continue;}
  // manual handling wins: no automatic message while a person handles the lead
  if(HUMAN.includes(stage)||(col(cv,'firstReply').text||'').trim()){if(changed)out.push({itemId:it.id,phone,cols,send:null,notify});continue;}

  // Stops and replies win over stale pending advancement. Reconciliation never sends.
  if(st.pending){out.push({itemId:it.id,phone,reconcile:true,pendingJson:JSON.stringify(st.pending),stJson:JSON.stringify(st),cols:{},send:null,notify:null});continue;}

  const MT=CFG.meeting,HOLD=MT.holdPath;
  if(stage===SG.booked&&meeting&&meeting>now&&!(path==='E'&&st.mt===meeting)){path='E';step='BOOK';next=now;st.mt=meeting;set(C.state,{text:JSON.stringify(st)});}
  else if(stage===SG.met&&path!==MT.after.path&&path!==HOLD){path=MT.after.path;step=MT.after.step;next=due(MT.after.next,(meeting&&meeting<now?meeting:now));}
  else if(SG.noShow.includes(stage)&&path==='E'){st.ns=(st.ns||0)+1;set(C.state,{text:JSON.stringify(st)});if(st.ns>=MT.noShowLimit){path=HOLD;step='NOSHOW2';next=now+CFG.rules.holdDays*D;}else{path='F';step='NOSHOW';next=Math.max(now,(meeting||now)+H);}}
  else if(quiz&&CFG.quizUpgrade.fromPaths.includes(path)){path=CFG.quizUpgrade.to.path;step=CFG.quizUpgrade.to.step;next=now;}

  let code=null,nPath=path,nStep=step,nNext=next,fixed=false;
  if(next&&next<=now&&open&&convosOk){
    const sameDay=last&&dayKey(last)===dayKey(now);
    const seq=CFG.sequences[path];
    if(path==='E'&&step==='BOOK'){code=MT.booked;fixed=true;const r24=meeting-D,r1=meeting-H;if(r24>now+2*H){nStep='M10';nNext=r24;}else if(r1>now+15*60000){nStep='R1';nNext=r1;}else{nStep='M10';nNext=null;}}
    else if(path==='E'&&step==='M10'){fixed=true;if(meeting&&meeting>now){code=MT.reminder;const r1=meeting-H;if(r1>now+30*60000){nStep='R1';nNext=r1;}else{nStep='R2';nNext=null;}}else{nNext=null;}}
    else if(path==='E'&&step==='R1'){fixed=true;if(meeting&&meeting>now){code=MT.reminder;}nStep='R2';nNext=null;}
    else if(path==='F'&&step==='NOSHOW'){code=MT.noShow;nNext=null;}
    else if(seq&&seq.length){const i=seq.findIndex(x=>x.code===step);const nx=seq[i+1];
      if(nx){code=nx.code;nNext=due(nx.next,now);if(nx.thenPath)nPath=nx.thenPath;}else{nNext=now+CFG.rules.holdDays*D;}}
    else if(seq){nNext=now+CFG.rules.holdDays*D;}
    if(code&&sameDay&&CFG.rules.onePerDayPaths.includes(path)&&!CFG.rules.sameDayAllowed.includes(code)){code=null;nNext=atLocal(now,1,9,30);nPath=path;nStep=step;}
    // a template without an approved Meta id (the approval mark) or a name to send by is never sent: the lead waits and Yoram is told
    if(code&&(!/^\d{6,}$/.test(String(T[code]||''))||!/^(?=[a-z0-9_]*[a-z])[a-z0-9_]{1,512}$/.test(String(CFG.templates[code].name||'')))){notify='תבנית '+code+' עוד לא אושרה בקמפיין '+CFG.name+', ההודעה לא נשלחה.';code=null;nPath=path;nStep=step;nNext=now+D;}
    // A callback request is not marketing opt-in. Unknown template categories
    // also require marketing consent; only a verified UTILITY category is exempt.
    if(code&&!mkt&&CFG.templates[code].category!=='UTILITY'){
      notify='בקשת חזרה ללא הסכמה לדיוור: טיפול ידני בלבד, תבנית שיווקית לא נשלחה.';
      code=null;nPath=path;nStep=step;nNext=null;
    }
    if(code){
      if(!fixed)nStep=code;
      const vars=(CFG.templates[code].vars||['first']).map(v=>v==='when'?whenText(meeting):v==='link'?token+DEST[code]:first);
      // A body Meta would refuse (not a mobile number, bad name) stops this lead only, never the whole run.
      try{send=HSM.templatePayload({to:phone,name:CFG.templates[code].name,language:CFG.templates[code].language||'he',variables:vars,buttonVariables:DEST[code]&&CFG.templates[code].linkMode!=='body'?[token+DEST[code]]:[]});}
      catch(e){notify='הודעה '+code+' לא נשלחה ('+e.message+'), טיפול ידני.';code=null;nPath=path;nStep=step;nNext=null;}
    }
    if(code){
      // Decided now, used by After send only if WhatsApp finally fails. Leads without a channel receipt have no other consented channel.
      const grants=channelProof&&channelProof.phone===phone&&channelProof.grants?channelProof.grants:{whatsapp:whatsappAllowed};
      fallback=CH.nextChannel({status,failed:['whatsapp'],grants},CFG);
      set(C.last,toDate(now));
    }
  }
  if(nPath!==(col(cv,'path').text||''))set(C.path,nPath);
  if(nStep!==(col(cv,'step').text||''))set(C.step,nStep);
  if(nNext!==dateVal(col(cv,'next').value))set(C.next,nNext?toDate(nNext):{});
  // The reservation key travels beside the Meta body, never inside it.
  let reserveJson=null,sendKey=null;
  if(send){
    const key=it.id+':'+code+':'+now;
    const adv={...cols};delete adv[C.state];
    reserveJson=JSON.stringify({[C.state]:{text:JSON.stringify({...st,pending:{key,tpl:T[code],code,at:now,adv}})}});
    sendKey=key;
    set(C.state,{text:JSON.stringify({...st,lastKey:key})});
  }
  if(changed)out.push({itemId:it.id,phone,cols,send,sendKey,code,notify,reserveJson,prevPath:path,prevStep:step,stJson:JSON.stringify(st),fallbackJson:fallback?JSON.stringify(fallback):null,email:col(cv,'email').text||null,first});
}
return out.map(o=>({json:{...o,campaign:CFG.id,leadTemperature:temps[o.itemId]??null,nicheSegment:CFG.crmFields.nicheSegment.value,colmap:C,hasSend:!!o.send,reconcile:!!o.reconcile,live:MODE!=='test',hasNotify:!!o.notify,colsJson:JSON.stringify(o.cols),meId,notifyText:o.notify?('משפך מחזור: '+o.notify):''}}));
