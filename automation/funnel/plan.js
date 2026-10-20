// Funnel engine planner. Runs inside the n8n Code node "Plan" (source of truth: this file).
// MODE is injected by build-workflow.js: 'test' handles only items named TEST and never calls Gambot;
// 'live' handles real leads only and sends real WhatsApp templates.
const MODE = '__MODE__';
// pilot: real sends, but only to the internal phones listed here (injected by the build)
const PILOT = '__PILOT__'.split(',').filter(Boolean);
// stages that mean a person is handling the lead: automation does not send
const HUMAN = ['נוצר קשר','בטיפול','התקבל','נבדק','דוח התקבל'];
const GO_LIVE = Date.parse('__GO_LIVE__');
let testBody={};try{testBody=$('Run test').first().json.body||{};}catch(e){}
const T = {M1:'2146929776251168',M2:'2866421103739060',M3:'2306286663247344',M4:'991655264017502',M5:'1861514208308620',M6:'922497660829094',M7:'1695504292330742',M8:'1456261889708463',M9:'1825910702064350',M10:'1517902547031884',M10R:'4090685337891850',M11:'1462992419096031',M12:'1152794754084561',M13:'1022323597539469',M14:'1665753921818083',M15:'1150212394355928'};
const DEST = {M2:'q',M3:'b',M4:'c',M5:'q',M7:'c',M8:'c',M9:'c',M10R:'c',M11:'c',M12:'g',M13:'m',M15:'c'};
const H = 3600000, D = 86400000;
const now = (MODE==='test'&&testBody.now)?Date.parse(testBody.now):Date.now();

function parts(ts){const o={};new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',weekday:'short',hour12:false}).formatToParts(new Date(ts)).forEach(p=>o[p.type]=p.value);o.hour=o.hour==='24'?'00':o.hour;return o;}
function offset(ts){const p=parts(ts);return Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute)-Math.floor(ts/60000)*60000;}
function atLocal(ts,days,hh,mm){const p=parts(ts+days*D);const guess=Date.UTC(+p.year,+p.month-1,+p.day,hh,mm);return guess-offset(guess);}
function dayKey(ts){const p=parts(ts);return p.year+p.month+p.day;}
const HEB_DAYS={Sun:'ראשון',Mon:'שני',Tue:'שלישי',Wed:'רביעי',Thu:'חמישי',Fri:'שישי',Sat:'שבת'};
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
const rand=()=>{const a='abcdefghjkmnpqrstuvwxyz23456789';let s='';for(let i=0;i<10;i++)s+=a[Math.floor(Math.random()*a.length)];return s;};
const dateVal=v=>{try{const j=JSON.parse(v||'null');if(!j||!j.date)return null;return Date.parse(j.date+'T'+(j.time||'00:00:00')+'Z');}catch(e){return null;}};
const toDate=ts=>{if(!ts)return null;const d=new Date(ts).toISOString();return {date:d.slice(0,10),time:d.slice(11,19)};};
const checked=v=>{try{return JSON.parse(v||'null')?.checked==='true'||JSON.parse(v||'null')?.checked===true;}catch(e){return false;}};

const out=[];
// phones already in the funnel: a second item with the same phone never starts its own series
const owner={};
for(const it of items){const cv={};for(const c of it.column_values)cv[c.id]=c;const ph=norm(cv.refi_phone?.text);if(ph&&cv.fn_status?.text&&!owner[ph])owner[ph]=it.id;}
for(const it of items){
  const cv={};for(const c of it.column_values)cv[c.id]=c;
  const isTest=/^TEST/.test(it.name||'');
  const phone=norm(cv.refi_phone?.text);if(!phone)continue;
  if(MODE==='test'){if(!isTest)continue;}
  else if(MODE==='pilot'){if(!PILOT.includes(phone))continue;}
  else if(isTest)continue;
  let status=cv.fn_status?.text||'';let path=cv.fn_path?.text||'';let step=cv.fn_step?.text||'';
  let next=dateVal(cv.fn_next?.value);const last=dateVal(cv.fn_last?.value);
  let token=cv.fn_token?.text||'';const stage=cv.refi_stage?.text||'';
  const mkt=checked(cv.boolean_mm88mzry?.value);const svc=checked(cv.boolean_mm8848pn?.value);
  const quiz=(cv.long_text_mm88pfdv?.text||'').trim().length>0;
  const meeting=dateVal(cv.refi_meeting?.value);
  let heat=Number(cv.numeric_mm883h9v?.text||0);
  let st={};try{st=JSON.parse(cv.fn_opens?.text||'{}')||{};}catch(e){st={};}
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
    if(quiz){path='D';step='QUIZ';}else{path='B';step='NEW';}
    next=now;st.mkt=mkt;
    set('fn_status',{label:'פעיל'});set('fn_token',token);
  }
  if(stage==='לקוח משלם'&&status!=='לקוח'){set('fn_status',{label:'לקוח'});set('fn_next',{});out.push({itemId:it.id,phone,cols,send:null,notify:null});continue;}
  if(stage==='לא רלוונטי'&&status==='פעיל'){set('fn_status',{label:'נעצר'});set('fn_next',{});out.push({itemId:it.id,phone,cols,send:null,notify:null});continue;}

  const cvn=convos[phone];
  if(status==='פעיל'&&cvn&&cvn.time>(last||0)+120000&&cvn.time>(st.reply||0)&&(cvn.dir==='incoming'||last)){
    st.reply=cvn.time;const t=cvn.text.trim();
    if(/הסר|הסירו|להסיר|stop/i.test(t)){status='הסר';set('fn_status',{label:'הסר'});set('fn_next',{});notify='ביקש הסרה מהודעות: "'+t.slice(0,80)+'"';}
    else if(/^פחות/.test(t)){status='פחות';set('fn_status',{label:'פחות'});notify='ביקש לקבל פחות הודעות';}
    else if(cvn.dir!=='incoming'){status='ענה';set('fn_status',{label:'ענה'});notify='יש שיחה ידנית פעילה עם הליד ב 055-9881245, ולכן ההודעות האוטומטיות נעצרו. כדי להחזיר אותו למשפך: סטטוס משפך = פעיל.';}
    else{status='ענה';set('fn_status',{label:'ענה'});heat+=10;set('numeric_mm883h9v',String(heat));notify='ענה בוואטסאפ ל 055-9881245: "'+t.slice(0,120)+'". ההודעות האוטומטיות נעצרו. כדי להחזיר אותו למשפך: סטטוס משפך = פעיל.';}
    set('fn_opens',{text:JSON.stringify(st)});
  }
  if(status!=='פעיל'){if(changed)out.push({itemId:it.id,phone,cols,send:null,notify});continue;}
  // manual handling wins: no automatic message while a person handles the lead
  if(HUMAN.includes(stage)||(cv.refi_first_reply?.text||'').trim()){if(changed)out.push({itemId:it.id,phone,cols,send:null,notify});continue;}

  if(stage==='פגישה נקבעה'&&meeting&&meeting>now&&!(path==='E'&&st.mt===meeting)){path='E';step='BOOK';next=now;st.mt=meeting;set('fn_opens',{text:JSON.stringify(st)});}
  else if(stage==='פגישה התקיימה'&&path!=='G'&&path!=='L'){path='G';step='MET';next=atLocal((meeting&&meeting<now?meeting:now),2,10,0);}
  else if((stage==='פגישה בוטלה'||stage==='לא הגיע')&&path==='E'){st.ns=(st.ns||0)+1;set('fn_opens',{text:JSON.stringify(st)});if(st.ns>=2){path='L';step='NOSHOW2';next=now+14*D;}else{path='F';step='NOSHOW';next=Math.max(now,(meeting||now)+H);}}
  else if(quiz&&(path==='B'||path==='C')){path='D';step='QUIZ';next=now;}

  let code=null,nPath=path,nStep=step,nNext=next,fixed=false;
  if(next&&next<=now&&open&&convosOk){
    const sameDay=last&&dayKey(last)===dayKey(now);
    if(path==='B'&&step==='NEW'){code='M1';nNext=now+5*60000;}
    else if(path==='B'&&step==='M1'){code='M2';nPath='C';nNext=now+3*H;}
    else if(path==='C'&&step==='M2'){code='M3';nNext=atLocal(now,1,10,0);}
    else if(path==='C'&&step==='M3'){code='M4';nNext=atLocal(now,2,10,0);}
    else if(path==='C'&&step==='M4'){code='M5';nNext=atLocal(now,4,10,0);}
    else if(path==='C'&&step==='M5'){code='M6';nPath='L';nNext=now+14*D;}
    else if(path==='D'&&step==='QUIZ'){code='M7';nNext=now+D;}
    else if(path==='D'&&step==='M7'){code='M8';nNext=now+2*D;}
    else if(path==='D'&&step==='M8'){code='M9';nPath='L';nNext=now+14*D;}
    else if(path==='E'&&step==='BOOK'){code='M10';fixed=true;const r24=meeting-D,r1=meeting-H;if(r24>now+2*H){nStep='M10';nNext=r24;}else if(r1>now+15*60000){nStep='R1';nNext=r1;}else{nStep='M10';nNext=null;}}
    else if(path==='E'&&step==='M10'){fixed=true;if(meeting&&meeting>now){code='M10R';const r1=meeting-H;if(r1>now+30*60000){nStep='R1';nNext=r1;}else{nStep='R2';nNext=null;}}else{nNext=null;}}
    else if(path==='E'&&step==='R1'){fixed=true;if(meeting&&meeting>now){code='M10R';}nStep='R2';nNext=null;}
    else if(path==='F'&&step==='NOSHOW'){code='M11';nNext=null;}
    else if(path==='G'&&step==='MET'){code='M12';nNext=now+3*D;}
    else if(path==='G'&&step==='M12'){code='M13';nNext=now+5*D;}
    else if(path==='G'&&step==='M13'){code='M14';nNext=now+11*D;}
    else if(path==='G'&&step==='M14'){code='M15';nPath='L';nNext=now+14*D;}
    else if(path==='L'){nNext=now+14*D;}
    if(code&&sameDay&&['C','D','G'].includes(path)&&!['M2','M3','M7'].includes(code)){code=null;nNext=atLocal(now,1,9,30);nPath=path;nStep=step;}
    if(code){
      if(!fixed)nStep=code;
      const vars=['M10','M10R'].includes(code)?[first,whenText(meeting)]:[first];
      send={to:phone,templateId:T[code],variables:vars};
      if(DEST[code])send.buttonVariables=[token+DEST[code]];
      set('fn_last',toDate(now));
    }
  }
  if(nPath!==(cv.fn_path?.text||''))set('fn_path',nPath);
  if(nStep!==(cv.fn_step?.text||''))set('fn_step',nStep);
  if(nNext!==dateVal(cv.fn_next?.value))set('fn_next',nNext?toDate(nNext):{});
  let reserveJson=null;
  if(send){
    const key=it.id+':'+code+':'+now;
    const adv={...cols};delete adv.fn_opens;
    reserveJson=JSON.stringify({fn_opens:{text:JSON.stringify({...st,pending:{key,tpl:send.templateId,code,at:now,adv}})}});
    send.key=key;
    set('fn_opens',{text:JSON.stringify({...st,lastKey:key})});
  }
  if(changed)out.push({itemId:it.id,phone,cols,send,code,notify,reserveJson,prevPath:path,prevStep:step,stJson:JSON.stringify(st)});
}
return out.map(o=>({json:{...o,hasSend:!!o.send,reconcile:!!o.reconcile,live:MODE!=='test',hasNotify:!!o.notify,colsJson:JSON.stringify(o.cols),meId,notifyText:o.notify?('משפך מחזור: '+o.notify):''}}));
