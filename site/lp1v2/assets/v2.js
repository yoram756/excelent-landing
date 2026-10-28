(function(){
'use strict';
/* ===== content ===== */
var Q=[
 {id:'has',part:1,t:'יש לכם היום משכנתא?',w:'כך נדע אם זה מחזור או ייעוץ לקנייה.',o:[['yes','כן, משכנתא אחת'],['multi','כן, יותר ממשכנתא אחת'],['selling','יש, ואנחנו בתהליך מכירה או פירעון'],['none','אין, אנחנו לפני קנייה']]},
 {id:'goal',part:1,t:'מה המטרה העיקרית?',h:'אפשר לבחור עד שתיים. הראשונה שתבחרו היא המטרה העיקרית.',multi:2,w:'המטרה קובעת מה בודקים קודם.',o:[['monthly','תשלום חודשי נמוך יותר'],['total','עלות כוללת נמוכה יותר'],['term','קיצור התקופה'],['risk','פחות חשיפה למדד או לריבית'],['loans','טיפול בהלוואות נוספות'],['mix','תמהיל שמתאים לתוכניות שלנו']]},
 {id:'bal',part:1,money:1,t:'מה יתרת המשכנתא בקירוב?',h:'כמה נשאר לפרוע היום, לא סך כל התשלומים העתידיים.',w:'גודל היתרה מראה כמה משמעותי יכול להיות שינוי.',o:[['b1','עד 300 אלף ₪'],['b2','מעל 300 אלף ועד 600 אלף ₪'],['b3','מעל 600 אלף ועד מיליון ₪'],['b4','מעל מיליון ועד 1.5 מיליון ₪'],['b5','מעל 1.5 מיליון ₪'],['na','לא יודע']]},
 {id:'pay',part:1,money:1,t:'מה ההחזר החודשי היום?',w:'ההחזר מראה כמה מרווח יש לכם היום.',o:[['p1','עד 3,000 ₪'],['p2','מעל 3,000 ועד 5,000 ₪'],['p3','מעל 5,000 ועד 8,000 ₪'],['p4','מעל 8,000 ועד 12,000 ₪'],['p5','מעל 12,000 ₪'],['na','לא יודע']]},
 {id:'left',part:1,t:'כמה זמן נשאר לתשלום?',w:'ככל שנשארו יותר שנים, לשינוי נכון יש יותר זמן להשפיע.',o:[['l1','עד 10 שנים'],['l2','מעל 10 ועד 20 שנה'],['l3','מעל 20 שנה'],['na','לא יודע']]},
 {id:'when',part:1,t:'מתי תרצו לפעול?',w:'כך נדע כמה מהר לחזור אליכם.',o:[['week','השבוע'],['month','החודש'],['later','בהמשך, יש לנו מועד'],['none','אין מועד מסוים']]},
 {id:'ask',part:1,t:'מה אתם מבקשים כרגע?',w:'כדי שהצעד הבא יתאים למה שאתם רוצים, בלי לחץ.',o:[['info','מידע כללי'],['check','בדיקה אישית'],['call','שיחת טלפון קצרה'],['meet','פגישה']]},
 {id:'doc',part:2,t:'יש לכם דוח יתרות לסילוק עדכני?',h:'מורידים אותו מאתר הבנק או מהאפליקציה, באזור המשכנתאות.',w:'הדוח מראה את המסלולים, הריביות והעמלות שלכם בפועל.',o:[['have','יש, ואשמח לשלוח'],['old','יש, אבל לא עדכני'],['help','אין, צריך עזרה להשיג'],['what','לא בטוח מה זה']]},
 {id:'loans',part:2,money:1,t:'יש הלוואות נוספות מלבד המשכנתא?',w:'לפעמים החיסכון הגדול נמצא דווקא בהלוואות שליד המשכנתא.',o:[['n','אין'],['s','יש, עד 50 אלף ₪ בסך הכול'],['m','יש, מעל 50 אלף ועד 200 אלף ₪'],['l','יש, מעל 200 אלף ועד 500 אלף ₪'],['xl','יש, מעל 500 אלף ₪'],['na','לא יודע']]},
 {id:'income',part:2,money:1,t:'צפוי שינוי בהכנסה בשנים הקרובות?',w:'שינוי בהכנסה משנה איזה החזר נכון לכם.',o:[['down','כן, ירידה'],['up','כן, עלייה'],['no','לא צפוי'],['na','לא יודע']]},
 {id:'plan',part:2,t:'מתוכננים מכירה של הנכס או פירעון גדול?',w:'אם כן, בונים אסטרטגיה אחרת ונמנעים מעמלות מיותרות.',o:[['sell','כן, מכירה'],['repay','כן, פירעון גדול'],['no','לא'],['na','עוד לא יודע']]},
 {id:'strain',part:2,money:1,t:'יש קושי בתשלומים היום?',w:'כך נדע לתעדף ולבנות פתרון שמתאים למצב, בדיסקרטיות.',o:[['late','כן, כבר קשה לשלם בזמן'],['tight','יש לחץ, אבל משלמים'],['no','לא'],['skip','מעדיף לא לענות']]}
];
var KEY='exc_refi_lp1v2';
var st={a:{},skip:{},goalAbove:false};
try{var s=JSON.parse(sessionStorage.getItem(KEY)||'null');if(s&&s.a)st=s;}catch(e){}
function save(){try{sessionStorage.setItem(KEY,JSON.stringify(st));}catch(e){}}
var A=st.a;
function track(n,x){window.dataLayer=window.dataLayer||[];var e={event:n,lp:'refi_lp1'};if(x)for(var k in x)e[k]=x[k];window.dataLayer.push(e);}
function q(id){for(var i=0;i<Q.length;i++)if(Q[i].id===id)return Q[i];}
function lab(qq,v){for(var i=0;i<qq.o.length;i++)if(qq.o[i][0]===v)return qq.o[i][1];return v;}
function goals(){return Array.isArray(A.goal)?A.goal:[];}

/* ===== goal chooser ===== */
var gb=document.querySelectorAll('.gbtn'),gn=document.getElementById('goalNote');
function paintGoals(){var g=goals();gb.forEach(function(b){var i=g.indexOf(b.dataset.goal);b.setAttribute('aria-pressed',i>-1?'true':'false');var t=b.querySelector('em');if(t)t.remove();if(i>-1){var e=document.createElement('em');e.textContent=i===0?'ראשית':'משנית';b.appendChild(e);}});
  gn.textContent=g.length?('נבחר: '+g.map(function(v){return lab(q('goal'),v);}).join(', ')+'. לא נשאל על זה שוב.'):'';}
gb.forEach(function(b){b.addEventListener('click',function(){var g=goals().slice(),i=g.indexOf(b.dataset.goal);if(i>-1)g.splice(i,1);else{if(g.length>=2)g.pop();g.push(b.dataset.goal);}A.goal=g;st.goalAbove=g.length>0;delete st.skip.goal;save();paintGoals();if(seq()[idx]&&seq()[idx].id==='goal')render();else{render();}track('goal_select',{count:g.length});});});

/* ===== quiz ===== */
function seq(){return Q.filter(function(x){return !(x.id==='goal'&&st.goalAbove&&goals().length);});}
var idx=0,timer=null,started=false;
var steps=document.getElementById('steps'),err=document.getElementById('err'),next=document.getElementById('next'),back=document.getElementById('back'),nav=document.getElementById('nav');
function part1(){return seq().filter(function(x){return x.part===1;}).length;}
function render(){
  clearTimeout(timer);err.hidden=true;steps.innerHTML='';
  var S=seq(),SUM=S.length;if(idx>SUM)idx=SUM;
  document.getElementById('progBar').style.width=Math.round(idx/SUM*100)+'%';
  var p1=part1();
  document.getElementById('progTxt').textContent=idx<p1?('חלק 1 מתוך 2, שאלה '+(idx+1)+' מתוך '+p1):idx<SUM?('חלק 2 מתוך 2, שאלה '+(idx-p1+1)+' מתוך '+(SUM-p1)):'כמעט סיימנו';
  document.getElementById('quick').hidden=idx>=SUM;
  back.classList.toggle('is-hidden',idx===0);
  if(idx>=SUM){nav.classList.add('is-hidden');renderSummary();return;}
  nav.classList.remove('is-hidden');next.textContent=idx===SUM-1?'לסיכום':'המשך';
  var qq=S[idx],d=document.createElement('div');d.className='step';
  var fs=document.createElement('fieldset'),lg=document.createElement('legend');lg.innerHTML='<h3></h3>';lg.firstChild.textContent=qq.t;fs.appendChild(lg);
  if(idx===p1){var p=document.createElement('p');p.className='hint';p.textContent='חלק 2 עוזר לנו להגיע מוכנים. אפשר לדלג עליו ולעבור לסיכום.';fs.appendChild(p);}
  if(qq.h){var h=document.createElement('p');h.className='hint';h.textContent=qq.h;fs.appendChild(h);}
  if(qq.w){var w=document.createElement('p');w.className='why';w.textContent='למה זה עוזר לנו: '+qq.w;fs.appendChild(w);}
  var g=document.createElement('div');g.className='opts';
  qq.o.forEach(function(o,i){var wr=document.createElement('div');wr.className='opt';var id='q_'+qq.id+'_'+i;
    var inp=document.createElement('input');inp.type=qq.multi?'checkbox':'radio';inp.name=qq.id;inp.id=id;inp.value=o[0];
    var cur=A[qq.id];inp.checked=qq.multi?(Array.isArray(cur)&&cur.indexOf(o[0])>-1):cur===o[0];
    inp.addEventListener('change',function(){
      if(!started){started=true;track('quiz_start');}
      delete st.skip[qq.id];
      if(qq.multi){var arr=Array.isArray(A[qq.id])?A[qq.id].slice():[];var j=arr.indexOf(o[0]);if(inp.checked){if(j<0)arr.push(o[0]);if(arr.length>qq.multi){var rm=arr.shift();var other=steps.querySelector('input[value="'+rm+'"]');if(other)other.checked=false;}}else if(j>-1)arr.splice(j,1);A[qq.id]=arr;if(qq.id==='goal')paintGoals();}
      else{A[qq.id]=o[0];}
      save();showRoute(d,qq);
      if(!qq.multi&&!routeFor(qq)){var at=idx;timer=setTimeout(function(){if(idx===at)go(idx+1);},380);}
    });
    var lb=document.createElement('label');lb.htmlFor=id;lb.textContent=o[1];wr.appendChild(inp);wr.appendChild(lb);g.appendChild(wr);});
  fs.appendChild(g);d.appendChild(fs);
  var sk=document.createElement('button');sk.type='button';sk.className='link skipq';sk.textContent=idx===p1?'לדלג על חלק 2 ולעבור לסיכום':'לדלג על השאלה, נדבר על זה בשיחה';
  sk.addEventListener('click',function(){if(idx===p1){S.slice(p1).forEach(function(x){if(A[x.id]==null)st.skip[x.id]=true;});save();track('quiz_skip_part2');go(SUM);}else{delete A[qq.id];st.skip[qq.id]=true;save();track('quiz_skip_q',{step:idx+1});go(idx+1);}});
  d.appendChild(sk);
  steps.appendChild(d);showRoute(d,qq);
}
function routeFor(qq){var v=A[qq.id];
  if(qq.id==='has'&&v==='none')return 'בלי משכנתא קיימת אין מה למחזר. אפשר להמשיך, ונבדוק איתכם ייעוץ משכנתא לקנייה.';
  if(qq.id==='goal'&&Array.isArray(v)&&v[0]==='monthly')return 'הקטנת ההחזר אפשרית לפעמים רק בהארכת התקופה, שעשויה לייקר את העלות הכוללת. בבדיקה נראה את שני הצדדים.';
  if(qq.id==='goal'&&Array.isArray(v)&&v.indexOf('loans')>-1)return 'איחוד הלוואות אינו מחזור, ודורש בדיקה מותאמת. נבדוק את שניהם יחד.';
  if(qq.id==='doc'&&(v==='help'||v==='what'))return 'אין בעיה. אחרי השליחה נסביר בדיוק איך מורידים את הדוח.';
  if(qq.id==='strain'&&v==='late')return 'נעדיף לדבר איתכם קודם. במצב כזה עושים בדיקה מקצועית מותאמת, בלי לחץ ובלי הבטחות.';
  return '';}
function showRoute(d,qq){var r=d.querySelector('.route'),t=routeFor(qq);if(!t){if(r)r.remove();return;}if(!r){r=document.createElement('p');r.className='route';r.setAttribute('aria-live','polite');var sk=d.querySelector('.skipq');d.insertBefore(r,sk);}r.textContent=t;}
function go(n){clearTimeout(timer);var S=seq();idx=Math.max(0,Math.min(S.length,n));render();var c=document.getElementById('quizCard');if(c.getBoundingClientRect().top<0)c.scrollIntoView({behavior:'smooth',block:'start'});}
back.addEventListener('click',function(){go(idx-1);});
next.addEventListener('click',function(){go(idx+1);});
document.getElementById('quickBtn').addEventListener('click',function(){track('quiz_quick_exit',{step:idx+1});go(seq().length);setTimeout(function(){var f=document.getElementById('fName');if(f){f.scrollIntoView({behavior:'smooth',block:'center'});f.focus({preventScroll:true});}},200);});

/* ===== summary ===== */
var MONEY=Q.filter(function(x){return x.money;}).map(function(x){return x.id;});
function ans(qq){var v=A[qq.id];if(v==null||(Array.isArray(v)&&!v.length))return null;if(Array.isArray(v))return v.map(function(x,i){return lab(qq,x)+(v.length>1?(i===0?' (ראשית)':' (משנית)'):'');}).join(', ');return lab(qq,v);}
function intentOpen(){switch(A.ask){case 'info':return 'שלום, אשמח לקבל מידע כללי על מחזור משכנתא.';case 'call':return 'שלום, אשמח לשיחת טלפון קצרה על המשכנתא שלי.';case 'meet':return 'שלום, אשמח לקבוע פגישה לבדיקת המשכנתא שלי.';default:return 'שלום, אשמח לבדיקה ראשונית למחזור משכנתא.';}}
function nextStep(){
  if(A.has==='none')return 'שיחה קצרה על ייעוץ משכנתא לקנייה. לא מחזור.';
  if(A.strain==='late'||A.loans==='l'||A.loans==='xl')return 'שיחה עם יורם לבדיקה מקצועית מותאמת, כולל ההלוואות הנוספות.';
  if(A.ask==='info')return 'נשלח לכם הסבר קצר, ואם תרצו נמשיך לבדיקה אישית.';
  if(A.doc==='help'||A.doc==='what')return 'נסביר איך מורידים את דוח היתרות, ואז בדיקה ראשונית.';
  if(A.ask==='meet')return 'תיאום פגישה, ובדיקת הדוח לפניה.';
  if(A.ask==='call')return 'תיאום שיחה קצרה, ובדיקת הדוח לפניה.';
  return 'שולחים את דוח היתרות לסילוק, ומקבלים תשובה לבדיקה הראשונית.';}
function message(withMoney){var t=intentOpen();
  Q.forEach(function(qq){if(qq.id==='ask')return;if(!withMoney&&MONEY.indexOf(qq.id)>-1)return;var a=ans(qq);if(a)t+='\n'+qq.t.replace('?','')+': '+a;});
  if(!withMoney&&MONEY.some(function(k){return A[k]!=null;}))t+='\nאת הנתונים הכספיים אמסור בשיחה.';
  var sk=Q.filter(function(qq){return st.skip[qq.id];}).length;if(sk)t+='\nעל '+sk+' שאלות נדבר בשיחה.';
  return t+'\n(LP1'+(window.__tag?' '+window.__tag:'')+')';}
function renderSummary(){
  track('quiz_complete',{answered:Q.filter(function(x){return ans(x);}).length});
  var d=document.createElement('div');d.className='step sum';
  var h=document.createElement('h3');h.textContent='כמעט סיימנו. איך נוח לכם שנמשיך?';d.appendChild(h);
  var unknown=Q.filter(function(qq){return A[qq.id]==='na'||A[qq.id]==='skip';}).map(function(qq){return qq.t.replace('?','');});
  var skipped=Q.filter(function(qq){return !ans(qq);}).map(function(qq){return qq.t.replace('?','');});
  var br=document.createElement('div');br.className='brief';var dl=document.createElement('dl');
  function row(k,v){var dt=document.createElement('dt');dt.textContent=k;var dd=document.createElement('dd');dd.textContent=v;dl.appendChild(dt);dl.appendChild(dd);}
  row('המטרה',ans(q('goal'))||'עוד לא נבחרה');
  row('מה מבקשים',ans(q('ask'))||'לא צוין');
  row('מה חסר',(skipped.length?skipped.length+' שאלות לשיחה':'לא חסר כלום')+(unknown.length?', '+unknown.length+' עם ״לא יודע״':''));
  row('ההמשך המוצע',nextStep());
  br.appendChild(dl);d.appendChild(br);
  var paths=document.createElement('div');paths.className='paths';
  var mw=document.createElement('label');mw.className='money';mw.innerHTML='<input type="checkbox" id="incMoney"><span>לצרף להודעה גם את הטווחים הכספיים ואת מצב התשלומים. בלי הסימון, הם נאספים בשיחה.</span>';paths.appendChild(mw);
  var wa=document.createElement('a');wa.className='btn btn-wa';wa.target='_blank';wa.rel='noopener';wa.textContent=A.ask==='info'?'לקבלת מידע בוואטסאפ':'שליחת הסיכום בוואטסאפ';
  function inc(){var c=document.getElementById('incMoney');return !!(c&&c.checked);}
  function setHref(){wa.href='https://wa.me/972552783459?text='+encodeURIComponent(message(inc()));}
  paths.appendChild(wa);
  var af=document.createElement('div');af.className='after';af.hidden=true;
  af.innerHTML='<p>נפתח וואטסאפ עם ההודעה. הפנייה נקלטת אצלנו רק אחרי שתלחצו שם על שליחה.</p><p>לא נפתח? שלחו ל <bdi class="ltr">055-2783459</bdi> <button type="button" class="link" id="copyMsg">העתקת ההודעה</button></p>';
  paths.appendChild(af);
  wa.addEventListener('click',function(){track('wa_click');af.hidden=false;});
  var or=document.createElement('p');or.className='or';or.textContent='או';paths.appendChild(or);
  paths.appendChild(buildForm());
  d.appendChild(paths);
  var det=document.createElement('details');var sm=document.createElement('summary');sm.textContent='כל התשובות ('+(Q.length-skipped.length)+' מתוך '+Q.length+'), לצפייה ועריכה';det.appendChild(sm);
  var all=document.createElement('dl');all.className='all';
  Q.forEach(function(qq){var a=ans(qq);var dt=document.createElement('dt');dt.textContent=qq.t;var dd=document.createElement('dd');dd.className='v'+(a?'':' miss');dd.textContent=a||(st.skip[qq.id]?'דילגתם, נשאל בשיחה':'לא נענה');var de=document.createElement('dd');de.className='e';var eb=document.createElement('button');eb.type='button';eb.className='link';eb.textContent='עריכה';eb.setAttribute('aria-label','עריכה: '+qq.t);
    eb.addEventListener('click',function(){var S=seq(),i=S.indexOf(qq);if(i<0){st.goalAbove=false;save();S=seq();i=S.indexOf(qq);}go(i);});de.appendChild(eb);all.appendChild(dt);all.appendChild(dd);all.appendChild(de);});
  det.appendChild(all);d.appendChild(det);
  var pv=document.createElement('p');pv.className='privacy';pv.textContent='התשובות נשמרות רק בדפדפן שלכם עד סגירת הלשונית. אם תשלחו בקשת חזרה, השם, הטלפון והתשובות שבחרתם יישמרו לצורך טיפול. מידע כספי נשלח רק אם סימנתם, ואינו נכנס לכתובת הדף או לכלי מדידה.';d.appendChild(pv);
  steps.appendChild(d);
  setHref();d.querySelector('#incMoney').addEventListener('change',setHref);
  d.querySelector('#copyMsg').addEventListener('click',function(){var b=this,t=message(inc());function ok(){b.textContent='הועתק';}function sel(){var ta=document.createElement('textarea');ta.value=t;ta.setAttribute('readonly','');ta.className='hp';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');ok();}catch(e){}ta.remove();}if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t).then(ok,sel);else sel();});
}

/* ===== shared helpers for forms ===== */
function mobile(v){v=String(v||'').trim().replace(/[\s()\-]/g,'');if(/^05\d{8}$/.test(v))return '972'+v.slice(1);if(/^\+?9725\d{8}$/.test(v))return v.replace(/^\+/,'');return null;}
function key(){return window.crypto&&crypto.randomUUID?crypto.randomUUID():'k'+Date.now().toString(36)+Math.random().toString(36).slice(2,10);}
function fieldErr(input,el,msg){if(msg){input.setAttribute('aria-invalid','true');el.textContent=msg;}else{input.removeAttribute('aria-invalid');el.textContent='';}}
async function post(url,body){body.event_id=body.idempotency_key;var attribution=new URLSearchParams(location.search);['utm_source','utm_campaign'].forEach(function(k){var v=attribution.get(k);if(v)body[k]=v.slice(0,100);});var r=await fetch(url,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});var j=null;try{j=await r.json();}catch(e){}var id=j&&(j.request_id||j.id);if(!r.ok||!id){var e=new Error((j&&j.error)||'save_failed');e.status=r.status;throw e;}return id;}

/* ===== callback form ===== */
var formState={key:key(),done:false,retry:false};
function buildForm(){
  var f=document.createElement('form');f.className='lead-form';f.noValidate=true;f.setAttribute('aria-labelledby','fTitle');
  f.innerHTML='<h4 id="fTitle">מעדיפים שנחזור אליכם?</h4><div class="fgrid"><div class="field"><label for="fName">שם פרטי</label><input id="fName" name="first_name" autocomplete="given-name" maxlength="40" required aria-describedby="fNameErr"><span class="ferr" id="fNameErr"></span></div><div class="field"><label for="fPhone">טלפון נייד</label><input id="fPhone" name="phone" type="tel" inputmode="tel" autocomplete="tel" required aria-describedby="fPhoneErr"><span class="ferr" id="fPhoneErr"></span></div><div class="field"><label for="fEmail">דואר אלקטרוני (לא חובה)</label><input id="fEmail" name="email" type="email" inputmode="email" autocomplete="email" maxlength="254" aria-describedby="fEmailErr"><span class="ferr" id="fEmailErr"></span></div></div><label class="consent"><input type="checkbox" id="fService"><span>אני מבקש שאקסלנט תחזור אליי בנוגע לבדיקה.</span></label><span class="ferr" id="fServiceErr"></span><label class="consent"><input type="checkbox" id="fMarketing"><span>אשמח לקבל מידע ותוכן שיווקי ב־WhatsApp. לא חובה.</span></label><label class="consent"><input type="checkbox" id="fSmsMarketing"><span>אשמח לקבל מידע ותוכן שיווקי במסרונים (SMS). לא חובה.</span></label><label class="consent"><input type="checkbox" id="fEmailMarketing"><span>אשמח לקבל מידע ותוכן שיווקי בדואר אלקטרוני. לא חובה.</span></label><p class="privacy">אפשר לבחור כל ערוץ בנפרד ולהסיר את ההסכמה בכל עת. בקשת החזרה אינה תלויה בהסכמה לדיוור.</p><div class="hp" aria-hidden="true"><label for="fWeb">אתר</label><input id="fWeb" tabindex="-1" autocomplete="off"></div><button type="submit" class="btn btn-primary" id="fSubmit">שליחת בקשת חזרה</button><p class="status" id="fStatus" role="status" aria-live="polite"></p>';
  var nm=f.querySelector('#fName'),ph=f.querySelector('#fPhone'),sv=f.querySelector('#fService'),mk=f.querySelector('#fMarketing'),em=f.querySelector('#fEmail'),sm=f.querySelector('#fSmsMarketing'),me=f.querySelector('#fEmailMarketing'),hp=f.querySelector('#fWeb'),bt=f.querySelector('#fSubmit'),ss=f.querySelector('#fStatus');
  f.addEventListener('input',function(){if(formState.retry&&!formState.done){formState.key=key();formState.retry=false;}});
  f.addEventListener('submit',async function(ev){ev.preventDefault();if(formState.done||bt.disabled)return;
    var name=nm.value.trim().replace(/\s+/g,' '),m=mobile(ph.value),email=em.value.trim(),ok=true,len=Array.from(name).length;
    fieldErr(nm,f.querySelector('#fNameErr'),len<2||len>40?'יש להזין שם פרטי, 2 עד 40 תווים.':'');if(len<2||len>40)ok=false;
    fieldErr(ph,f.querySelector('#fPhoneErr'),m?'':'יש להזין מספר נייד ישראלי, למשל 0521234567.');if(!m)ok=false;
    var emailBad=email&&(email.length>254||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email));
    fieldErr(em,f.querySelector('#fEmailErr'),emailBad?'יש להזין כתובת דואר אלקטרוני תקינה.':me.checked&&!email?'כדי לקבל דיוור במייל, יש להזין כתובת דואר אלקטרוני.':'');if(emailBad||(me.checked&&!email))ok=false;
    f.querySelector('#fServiceErr').textContent=sv.checked?'':'כדי שנחזור אליכם, סמנו את בקשת החזרה.';if(!sv.checked)ok=false;
    if(!ok){ss.dataset.state='error';ss.textContent='יש לתקן את השדות שסומנו.';return;}
    var withMoney=!!(document.getElementById('incMoney')&&document.getElementById('incMoney').checked),answers={};
    Q.forEach(function(qq){if(!withMoney&&qq.money)return;var v=A[qq.id];if(v!=null&&!(Array.isArray(v)&&!v.length))answers[qq.id]=Array.isArray(v)?v.slice():v;});
    var at=new Date().toISOString();
    bt.disabled=true;bt.textContent='שולחים…';ss.removeAttribute('data-state');ss.textContent='שומרים את הבקשה…';
    try{var id=await post('/api/lead',{idempotency_key:formState.key,source:'קליטת LP1',product:'LP1',first_name:name,phone:m,email:email||null,marketing_channels:[mk.checked?'whatsapp':null,me.checked?'email':null,sm.checked?'sms':null].filter(Boolean),answers:answers,money_included:withMoney,service_request:true,service_request_at:at,marketing_consent:mk.checked,marketing_consent_at:mk.checked?at:null,website:hp.value});
      formState.done=true;ss.dataset.state='success';ss.textContent='הבקשה נקלטה. נחזור אליכם בהקדם. מספר פנייה: '+id;bt.textContent='הבקשה נשלחה';f.querySelectorAll('input').forEach(function(i){i.disabled=true;});track('form_submit_ok');
    }catch(e){formState.retry=true;ss.dataset.state='error';ss.textContent=e.status===429?'נשלחו יותר מדי בקשות. נסו שוב בעוד כמה דקות, או שלחו בוואטסאפ.':'לא הצלחנו לשמור את הבקשה. נסו שוב, או שלחו בוואטסאפ.';bt.disabled=false;bt.textContent='שליחת בקשת חזרה';track('form_submit_fail');}
  });
  return f;
}

/* ===== club form ===== */
(function(){var f=document.getElementById('clubForm');if(!f)return;var k=key(),done=false,retry=false;
  var nm=f.querySelector('#cName'),ph=f.querySelector('#cPhone'),cs=f.querySelector('#cConsent'),hp=f.querySelector('#cWeb'),bt=f.querySelector('#cSubmit'),ss=f.querySelector('#cStatus');
  f.addEventListener('input',function(){if(retry&&!done){k=key();retry=false;}});
  f.addEventListener('submit',async function(ev){ev.preventDefault();if(done||bt.disabled)return;
    var name=nm.value.trim().replace(/\s+/g,' '),m=mobile(ph.value),len=Array.from(name).length,ok=true;
    fieldErr(nm,f.querySelector('#cNameErr'),len<2||len>40?'יש להזין שם פרטי, 2 עד 40 תווים.':'');if(len<2||len>40)ok=false;
    fieldErr(ph,f.querySelector('#cPhoneErr'),m?'':'יש להזין מספר נייד ישראלי.');if(!m)ok=false;
    f.querySelector('#cConsentErr').textContent=cs.checked?'':'כדי להירשם, סמנו את ההסכמה.';if(!cs.checked)ok=false;
    if(!ok){ss.dataset.state='error';ss.textContent='יש לתקן את השדות שסומנו.';return;}
    bt.disabled=true;ss.removeAttribute('data-state');ss.textContent='רושמים…';
    try{await post('/api/club',{kind:'club',idempotency_key:k,first_name:name,phone:m,consent:true,consent_at:new Date().toISOString(),website:hp.value});
      done=true;ss.dataset.state='success';ss.textContent='נרשמתם לרשימת ההמתנה. נעדכן אתכם בוואטסאפ כשהמעגל ייפתח.';bt.textContent='נרשמתם';f.querySelectorAll('input').forEach(function(i){i.disabled=true;});track('club_submit_ok');
    }catch(e){retry=true;ss.dataset.state='error';ss.textContent='ההרשמה לא נשמרה. נסו שוב בעוד רגע.';bt.disabled=false;track('club_submit_fail');}
  });
})();

/* ===== misc ===== */
(function(){var qs=new URLSearchParams(location.search);window.__tag=(qs.get('utm_content')||qs.get('utm_campaign')||'').replace(/[^\w\-]/g,'').slice(0,24);})();
paintGoals();render();
var sticky=document.getElementById('sticky');
if('IntersectionObserver' in window){var vis={};var io=new IntersectionObserver(function(es){es.forEach(function(e){vis[e.target.id]=e.isIntersecting;});sticky.classList.toggle('off',!!(vis.top||vis.check||vis.club));},{threshold:.05});['top','check','club'].forEach(function(id){io.observe(document.getElementById(id));});}
document.querySelectorAll('[data-ev]').forEach(function(el){el.addEventListener('click',function(){track(el.dataset.ev);});});
track('lp_view');
})();
