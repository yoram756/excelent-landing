// Shared funnel engine planner (all campaigns). Runs inside the n8n Code node "Plan".
// Everything campaign specific comes from CFG (campaigns/<id>.json), injected by build-workflows.js.
// MODE: 'test' handles only items named TEST and never calls Gambot; 'pilot' sends only to listed
// internal phones; 'live' handles real leads only.
const CFG = __CONFIG__;
const BIZ = __BUSINESS__;
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

const norm=s=>{let d=String(s||'').replace(/\D/g,'');if(d.startsWith('0'))d='972'+d.slice(1);return d.length>=11?d:'';};
const convos={};let convosOk=false;
try{if(Array.isArray($('Convos').first().json.data.items))convosOk=true;for(const c of ($('Convos').first().json.data.items||[]))convos[norm(c.phone)]={dir:c.lastMessageDirection,time:Date.parse(c.lastMessageTime),text:c.lastMessage||''};}catch(e){}
const mdata=$('Items').first().json.data;
const meId=mdata.me.id;
const items=mdata.boards[0].items_page.items;
const col=(cv,k)=>cv[C[k]]||{};
const rand=()=>{const a='abcdefghjkmnpqrstuvwxyz23456789';let s='';for(let i=0;i<10;i++)s+=a[Math.floor(Math.random()*a.length)];return s;};
const dateVal=v=>{try{const j=JSON.parse(v||'null');if(!j||!j.date)return null;return Date.parse(j.date+'T'+(j.time||'00:00:00')+'Z');}catch(e){return null;}};
const toDate=ts=>{if(!ts)return null;const d=new Date(ts).toISOString();return {date:d.slice(0,10),time:d.slice(11,19)};};
const checked=v=>{try{return JSON.parse(v||'null')?.checked==='true'||JSON.parse(v||'null')?.checked===true;}catch(e){return false;}};

const out=[];
// phones already in the funnel: a second item with the same phone never starts its own series
const owner={};
for(const it of items){const cv={};for(const c of it.column_values)cv[c.id]=c;const ph=norm(col(cv,'phone').text);if(ph&&col(cv,'status').text&&!owner[ph])owner[ph]=it.id;}
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
  const quiz=(col(cv,'quizDone').text||'').trim().length>0;
  const meeting=dateVal(col(cv,'meeting').value);
  let heat=Number(col(cv,'heat').text||0);
  let st={};try{st=JSON.parse(col(cv,'state').text||'{}')||{};}catch(e){st={};}
  const first=(it.name||'').replace(/^TEST\s*/,'').trim().split(/\s+/)[0]||'שלום';
  // a send whose result is not confirmed yet: check Gambot before anything else, never send blindly again
  if(st.pending){out.push({itemId:it.id,phone,reconcile:true,pendingJson:JSON.stringify(st.pending),stJson:JSON.stringify(st),cols:{},send:null,notify:null});continue;}
  const cols={};let send=null;let notify=null;let changed=false;
  const set=(k,v)=>{cols[k]=v;changed=true;};

  if(!status){
    if(!(mkt||svc))continue;
    if(owner[phone]&&owner[phone]!==it.id)continue;
    owner[phone]=it.id;
    if(Date.parse(it.created_at)<GO_LIVE)continue;
    token=rand();status='פעיל';
    if(quiz){path=CFG.entry.quizDone.path;step=CFG.entry.quizDone.step;}else{path=CFG.entry.default.path;step=CFG.entry.default.step;}
    next=now;st.mkt=mkt;
    set(C.status,{label:'פעיל'});set(C.token,token);
  }
  if(stage===SG.paid&&status!=='לקוח'){set(C.status,{label:'לקוח'});set(C.next,{});out.push({itemId:it.id,phone,cols,send:null,notify:null});continue;}
  if(stage===SG.notRelevant&&status==='פעיל'){set(C.status,{label:'נעצר'});set(C.next,{});out.push({itemId:it.id,phone,cols,send:null,notify:null});continue;}

  const cvn=convos[phone];
  if(status==='פעיל'&&cvn&&cvn.time>(last||0)+120000&&cvn.time>(st.reply||0)&&(cvn.dir==='incoming'||last)){
    st.reply=cvn.time;const t=cvn.text.trim();
    if(/הסר|הסירו|להסיר|stop/i.test(t)){status='הסר';set(C.status,{label:'הסר'});set(C.next,{});notify='ביקש הסרה מהודעות: "'+t.slice(0,80)+'"';}
    else if(/^פחות/.test(t)){status='פחות';set(C.status,{label:'פחות'});notify='ביקש לקבל פחות הודעות';}
    else if(cvn.dir!=='incoming'){status='ענה';set(C.status,{label:'ענה'});notify='יש שיחה ידנית פעילה עם הליד במספר השליחה '+BIZ.phones.sender.number+', ולכן ההודעות האוטומטיות נעצרו. לחזרה ללקוח: '+BIZ.phones.contact.number+'. כדי להחזיר אותו למשפך: סטטוס משפך = פעיל.';}
    else{status='ענה';set(C.status,{label:'ענה'});heat+=10;set(C.heat,String(heat));notify='ענה בוואטסאפ למספר השליחה '+BIZ.phones.sender.number+': "'+t.slice(0,120)+'". ההודעות האוטומטיות נעצרו. לחזרה ללקוח: '+BIZ.phones.contact.number+'. כדי להחזיר אותו למשפך: סטטוס משפך = פעיל.';}
    set(C.state,{text:JSON.stringify(st)});
  }
  if(status!=='פעיל'){if(changed)out.push({itemId:it.id,phone,cols,send:null,notify});continue;}
  // manual handling wins: no automatic message while a person handles the lead
  if(HUMAN.includes(stage)||(col(cv,'firstReply').text||'').trim()){if(changed)out.push({itemId:it.id,phone,cols,send:null,notify});continue;}

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
    // a template without an approved Meta id is never sent: the lead waits and Yoram is told
    if(code&&!/^\d{6,}$/.test(String(T[code]||''))){notify='תבנית '+code+' עוד לא אושרה בקמפיין '+CFG.name+', ההודעה לא נשלחה.';code=null;nPath=path;nStep=step;nNext=now+D;}
    if(code){
      if(!fixed)nStep=code;
      const vars=(CFG.templates[code].vars||['first']).map(v=>v==='when'?whenText(meeting):first);
      send={to:phone,templateId:T[code],variables:vars};
      if(DEST[code])send.buttonVariables=[token+DEST[code]];
      set(C.last,toDate(now));
    }
  }
  if(nPath!==(col(cv,'path').text||''))set(C.path,nPath);
  if(nStep!==(col(cv,'step').text||''))set(C.step,nStep);
  if(nNext!==dateVal(col(cv,'next').value))set(C.next,nNext?toDate(nNext):{});
  let reserveJson=null;
  if(send){
    const key=it.id+':'+code+':'+now;
    const adv={...cols};delete adv[C.state];
    reserveJson=JSON.stringify({[C.state]:{text:JSON.stringify({...st,pending:{key,tpl:send.templateId,code,at:now,adv}})}});
    send.key=key;
    set(C.state,{text:JSON.stringify({...st,lastKey:key})});
  }
  if(changed)out.push({itemId:it.id,phone,cols,send,code,notify,reserveJson,prevPath:path,prevStep:step,stJson:JSON.stringify(st)});
}
return out.map(o=>({json:{...o,campaign:CFG.id,colmap:C,hasSend:!!o.send,reconcile:!!o.reconcile,live:MODE!=='test',hasNotify:!!o.notify,colsJson:JSON.stringify(o.cols),meId,notifyText:o.notify?('משפך מחזור: '+o.notify):''}}));
