// Internal callback SLA only. No messaging provider is called by this code.
const policy=__SERVICE__;
const quizPattern=new RegExp(__QUIZ_PATTERN__);
const response=$input.first().json;
const page=response.data?.boards?.[0]?.groups?.[0]?.items_page;
if(response.errors?.length||!Array.isArray(page?.items)||page.cursor)throw Error('Incomplete Monday SLA lookup');
const sd=$getWorkflowStaticData('global'),now=Date.now();
const fmt=new Intl.DateTimeFormat('en-GB',{timeZone:policy.timezone,weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false});
const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const mins=s=>{const [h,m]=s.split(':').map(Number);return h*60+m;};
function open(t){const p={};fmt.formatToParts(new Date(t)).forEach(x=>p[x.type]=x.value);const m=(+p.hour%24)*60+(+p.minute);return policy.businessHours.days.includes(days.indexOf(p.weekday))&&m>=mins(policy.businessHours.open)&&m<mins(policy.businessHours.close);}
if(!open(now))return [];
function elapsed(from,to,cap){let total=0;for(let t=from;t<to&&total<cap;){const end=Math.min(to,(Math.floor(t/60000)+1)*60000);if(open(t))total+=end-t;t=end;}return total;}
const out=[];
for(const it of page.items){
 const cv=Object.fromEntries((it.column_values||[]).map(c=>[c.id,c]));
 const text=id=>cv[id]?.text||'';
 if(!/LP1|מטא|וואטסאפ/i.test(text('refi_source')))continue;
 if(!['ליד חדש','התקבל',''].includes(text('refi_stage'))||text('refi_first_reply').trim())continue;
 let requested=Date.parse(it.created_at);
 try{const d=JSON.parse(cv.date_mm88hmw2?.value||'null');if(d?.date)requested=Date.parse(d.date+'T'+(d.time||'00:00:00')+'Z');}catch(e){continue;}
 if(!Number.isFinite(requested)||requested>now||now-requested>3*86400000)continue;
 const questionnaire=quizPattern.test(text('long_text_mm88xzfe'));
 const limit=questionnaire?policy.responseMinutes.questionnaireSubmittedWithKnownAnswers:policy.responseMinutes.withoutQuestionnaire;
 const key=String(it.id)+':'+requested+':'+limit;
 if(sd.reminded?.[key]||Number(sd.reminded?.[it.id]||0)>=requested)continue;
 if(elapsed(requested,now,limit*60000)<limit*60000)continue;
 out.push({json:{item:String(it.id),reminderKey:key,requestedAt:requested,thresholdMinutes:limit,questionnaire,leadName:it.name,source:text('refi_source'),phone:text('refi_phone'),text:`תזכורת ליורם פלד: פנייה ${it.id} טרם טופלה לאחר ${limit} דקות פעילות (${questionnaire?'נשלחו תשובות שאלון':'ללא תשובות שאלון'}). שעות הפעילות א׳–ה׳ 08:30–20:00.`}});
}
// Cache acknowledgment belongs after confirmed internal notification, never here.
return out;
