process.on('unhandledRejection',e=>{console.error('FAIL unhandled',e&&e.message);process.exit(1);});
const {open}=require('./lib');const http=require('http');
const get=u=>new Promise(r=>http.get('http://localhost:8090'+u,s=>{let b='';s.on('data',c=>b+=c);s.on('end',()=>r(b));}));
const R=[];function ok(name,cond,info){R.push({name,pass:!!cond,info});}
async function fresh(w=1440,bp){const o=await open(w,900,bp);await o.p.goto('http://localhost:8090/',{waitUntil:'networkidle'});return o;}
const pick=async(p,id,val)=>{await p.locator(`input[name="${id}"][value="${val}"]`).check();};
const progress=p=>p.locator('#progTxt').textContent();
const legend=p=>p.locator('#steps legend h3').textContent().catch(()=>null);
(async()=>{
 // 1 goal above, auto-advance, no double advance
 {const {b,p,errs}=await fresh();await get('/__mode?m=ok');
  await p.click('.gbtn[data-goal="total"]');await p.click('.gbtn[data-goal="term"]');
  ok('goal chooser marks primary/secondary',(await p.locator('.gbtn[data-goal="total"] em').textContent())==='ראשית'&&(await p.locator('.gbtn[data-goal="term"] em').textContent())==='משנית');
  await pick(p,'has','yes');await p.waitForTimeout(600);
  const l=await legend(p);ok('goal not re-asked after choosing above',l==='מה יתרת המשכנתא בקירוב?',l);
  // double click on an option quickly
  await p.locator('#q_bal_1').dblclick();await p.waitForTimeout(700);
  ok('no double advance on double click',(await legend(p))==='מה ההחזר החודשי היום?',await legend(p));
  // back keeps answer
  await p.click('#back');ok('back keeps answer',await p.locator('#q_bal_1').isChecked());
  await p.click('#next');
  await pick(p,'pay','na');await p.waitForTimeout(600);
  await p.click('.skipq');// skip "left"
  await pick(p,'when','week');await p.waitForTimeout(600);
  await pick(p,'ask','call');await p.waitForTimeout(600);
  ok('part 2 intro shows skip-part link',(await p.locator('.skipq').textContent()).includes('חלק 2'));
  await p.click('.skipq');await p.waitForTimeout(300);
  const brief=await p.locator('.brief').textContent();
  ok('brief shows goal, missing and next',brief.includes('עלות כוללת')&&brief.includes('ההמשך המוצע')&&brief.includes('שאלות לשיחה')&&brief.includes('״לא יודע״'),brief);
  const href=decodeURIComponent(await p.locator('a.btn-wa').getAttribute('href'));
  ok('WA message intent=call',href.includes('שיחת טלפון קצרה'),href.slice(0,200));
  ok('WA message excludes money by default',!href.includes('300 אלף'),'');
  await p.check('#incMoney');const href2=decodeURIComponent(await p.locator('a.btn-wa').getAttribute('href'));
  ok('WA message includes money when checked',href2.includes('300 אלף'));
  // summary all answers: skipped vs unknown
  await p.click('.sum details summary');const all=await p.locator('dl.all').textContent();
  ok('summary distinguishes skipped and unknown',all.includes('דילגתם, נשאל בשיחה')&&all.includes('לא יודע'));
  // edit from summary returns to question with answer
  await p.locator('dl.all button[aria-label="עריכה: מתי תרצו לפעול?"]').click();
  ok('edit from summary opens question with saved answer',(await legend(p))==='מתי תרצו לפעול?'&&await p.locator('input[name="when"][value="week"]').isChecked());
  // edit goal from summary when goal chosen above
  await p.locator('#next').click();await p.locator('#next').click();
  for(let i=0;i<10&&!(await p.locator('.sum').count());i++)await p.locator('#next').click();
  await p.click('.sum details summary');await p.locator('dl.all button[aria-label="עריכה: מה המטרה העיקרית?"]').click();
  ok('goal editable from summary',(await legend(p))==='מה המטרה העיקרית?'&&await p.locator('input[name="goal"][value="total"]').isChecked());
  ok('no console/CSP errors',errs.length===0,errs.join('|'));
  
  await b.close();}
 // 2 info only + form submit success, double click, money exclusion
 {const {b,p}=await fresh(390);await get('/__mode?m=ok');
  await p.click('#quickBtn');await p.waitForTimeout(300);
  ok('quick exit jumps to summary/form',await p.locator('#fName').isVisible());
  await p.click('#fSubmit');
  ok('validation errors shown',(await p.locator('#fNameErr').textContent()).length>0&&(await p.locator('#fServiceErr').textContent()).length>0);
  await p.fill('#fName','בדיקה TEST');await p.fill('#fPhone','050-000-0001');await p.check('#fService');
  await p.locator('#fSubmit').dblclick();await p.waitForTimeout(900);
  const log=JSON.parse(await get('/__log'));
  ok('double click sends one request',log.length===1,log.length);
  ok('phone normalized',log[0]&&log[0].body.phone==='972500000001');
  ok('marketing consent false by default',log[0]&&log[0].body.marketing_consent===false);
  ok('success only after server id',(await p.locator('#fStatus').textContent()).includes('R'));
  
  await b.close();}
 // 3 info-only intent, payment difficulty, failure + retry
 {const {b,p}=await fresh(390);
  await pick(p,'has','yes');await p.waitForTimeout(500);
  await pick(p,'goal','monthly');ok('route message for monthly goal',(await p.locator('.route').count())===1);
  await p.click('#next');
  for(const id of ['bal','pay','left','when'])await p.click('.skipq');
  await pick(p,'ask','info');await p.waitForTimeout(500);
  await pick(p,'doc','help');await p.click('#next');
  await p.click('.skipq');await p.click('.skipq');await p.click('.skipq');
  await pick(p,'strain','late');ok('payment difficulty route shown',(await p.locator('.route').textContent()).includes('נעדיף לדבר'));
  await p.click('#next');
  const brief=await p.locator('.brief').textContent();
  ok('payment difficulty → talk to Yoram',brief.includes('שיחה עם יורם'),brief);
  ok('info intent button label',(await p.locator('a.btn-wa').textContent())==='לקבלת מידע בוואטסאפ');
  const href=decodeURIComponent(await p.locator('a.btn-wa').getAttribute('href'));
  ok('info intent opening line',href.startsWith('https://wa.me/972552783459?text=שלום, אשמח לקבל מידע כללי'));
  ok('strain not in message without consent',!href.includes('קשה לשלם'));
  await p.click('a.btn-wa',{modifiers:[]}).catch(()=>{});
  ok('after WA click: explains not yet received',await p.locator('.after').isVisible());
  await get('/__mode?m=fail');
  await p.fill('#fName','בדיקה');await p.fill('#fPhone','0500000002');await p.check('#fService');await p.click('#fSubmit');await p.waitForTimeout(800);
  ok('network failure shows error, no success',(await p.locator('#fStatus').getAttribute('data-state'))==='error');
  const k1=JSON.parse(await get('/__log'))[0].body.idempotency_key;
  await get('/__mode?m=ok');await p.click('#fSubmit');await p.waitForTimeout(800);
  const k2=JSON.parse(await get('/__log'))[0].body.idempotency_key;
  ok('retry without edits reuses idempotency key',k1===k2);
  ok('retry succeeds',(await p.locator('#fStatus').getAttribute('data-state'))==='success');
  await b.close();}
 // 4 urgent + has none
 {const {b,p}=await fresh();
  await pick(p,'has','none');ok('no-mortgage route',(await p.locator('.route').textContent()).includes('ייעוץ משכנתא לקנייה'));
  await p.click('#next');await p.click('#quickBtn');
  ok('no-mortgage next step',(await p.locator('.brief').textContent()).includes('לקנייה'));
  await b.close();}
 // 5 club + partner
 {const {b,p}=await fresh(390);await get('/__mode?m=ok');
  await p.click('#cSubmit');ok('club consent required',(await p.locator('#cConsentErr').textContent()).length>0);
  await p.fill('#cName','בדיקה');await p.fill('#cPhone','0500000003');await p.check('#cConsent');await p.click('#cSubmit');await p.waitForTimeout(700);
  const l=JSON.parse(await get('/__log'));ok('club posts to /api/club with kind club',l[0].path==='/api/club'&&l[0].body.kind==='club');
  ok('club success message',(await p.locator('#cStatus').textContent()).includes('רשימת ההמתנה'));
  await p.goto('http://localhost:8090/partners.html',{waitUntil:'networkidle'});await get('/__mode?m=ok');
  await p.click('#pSubmit');ok('partner validation',(await p.locator('#pFieldErr').textContent()).length>0);
  await p.fill('#pName','עו״ד בדיקה');await p.fill('#pPhone','0500000004');await p.selectOption('#pField','lawyer');await p.selectOption('#pArea','center');await p.selectOption('#pType','mutual');await p.check('#pConsent');
  await p.click('#pSubmit');await p.waitForTimeout(700);
  const l2=JSON.parse(await get('/__log'));ok('partner posts to /api/partner',l2[0].path==='/api/partner'&&l2[0].body.field==='lawyer');
  ok('partner success',(await p.locator('#pStatus').getAttribute('data-state'))==='success');
  
  await b.close();}
 // 6 keyboard + axe
 {const {b,p}=await fresh(1440,true);
  await p.keyboard.press('Tab');ok('skip link first tab stop',(await p.evaluate(()=>document.activeElement.className))==='skip');
  await p.locator('#q_has_0').focus();await p.keyboard.press('Space');await p.waitForTimeout(600);
  ok('keyboard selects option and advances',(await legend(p))!=='יש לכם היום משכנתא?');
  for(const u of ['/','/partners.html','/privacy.html','/accessibility.html']){await p.goto('http://localhost:8090'+u,{waitUntil:'networkidle'});
   await p.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
   const res=await p.evaluate(async()=>{const r=await axe.run(document,{runOnly:['wcag2a','wcag2aa','wcag21aa']});return r.violations.map(v=>v.id+':'+v.nodes.length+':'+v.nodes.slice(0,2).map(n=>n.target.join(' ')).join(','));});
   ok('axe '+u,res.length===0,res.join(' | '));}
  await b.close();}
 // Each optional channel has its own unchecked choice; email-only is never WA consent.
 {const {b,p}=await fresh(390);await get('/__mode?m=ok');await p.click('#quickBtn');
  ok('all channel choices are unchecked',!(await p.isChecked('#fMarketing'))&&!(await p.isChecked('#fEmailMarketing'))&&!(await p.isChecked('#fSmsMarketing')));
  await p.fill('#fName','TEST ערוצים');await p.fill('#fPhone','0500000009');await p.check('#fService');await p.check('#fEmailMarketing');await p.click('#fSubmit');
  ok('email opt-in requires an email address',(await p.locator('#fEmailErr').textContent()).includes('יש להזין'));
  ok('missing email cannot send intake',JSON.parse(await get('/__log')).length===0);
  await p.fill('#fEmail','invalid');await p.click('#fSubmit');ok('invalid email is explained',(await p.locator('#fEmailErr').textContent()).includes('תקינה'));
  await p.fill('#fEmail','test@example.invalid');await p.click('#fSubmit');await p.waitForTimeout(700);
  const req=JSON.parse(await get('/__log'))[0]?.body;
  ok('email address is submitted',req?.email==='test@example.invalid');ok('email-only consent remains separate',req?.marketing_channels?.join(',')==='email'&&req?.marketing_consent===false);
  ok('email-only callback is saved',(await p.locator('#fStatus').getAttribute('data-state'))==='success');await b.close();}
 // Isolated feedback view: responsive layout, voluntary fields and accessibility.
 {const {b,p}=await open(390,844);await p.setContent(require('../../automation/lifecycle/feedback-page').render({csrf:'synthetic-csrf'}));
  ok('feedback mobile has no horizontal overflow',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  ok('feedback answers are all optional',await p.locator('select,textarea').count()===5&&await p.locator('[required]').count()===0);
  ok('feedback removal does not require questionnaire',await p.locator('form').first().locator('select,textarea').count()===0);
  ok('feedback explains no automatic re-enrollment',(await p.locator('#privacy-note').textContent()).includes('אינו מחדש קשר'));
  await p.addScriptTag({path:require.resolve('axe-core/axe.min.js')});const a=await p.evaluate(async()=>{const r=await axe.run(document,{runOnly:['wcag2a','wcag2aa','wcag21aa']});return r.violations.map(x=>x.id);});ok('axe voluntary feedback',a.length===0,a.join(','));
  await p.screenshot({path:require('path').join(__dirname,'../out/feedback-mobile.png'),fullPage:true});await b.close();}
 for(const r of R)console.log((r.pass?'PASS':'FAIL'),r.name,r.pass?'':(r.info||''));
 console.log(R.filter(r=>r.pass).length+'/'+R.length);process.exitCode=R.every(r=>r.pass)&&R.length>0?0:1;
})();
