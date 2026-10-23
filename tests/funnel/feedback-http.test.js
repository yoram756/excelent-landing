const test=require('node:test'),assert=require('node:assert/strict'),{createServer}=require('node:http');
const {Store}=require('../../src/services/lifecycle/store'),{handler}=require('../../src/services/lifecycle/feedback-http'),{render}=require('../../src/services/lifecycle/feedback-page'),config=require('../../config/lifecycle/refi.json');
const NOW='2026-10-20T09:00:00.000Z';
async function fixture(t){
 const store=new Store(':memory:',{sandbox:true});let now=NOW;
 const e=store.ingest({eventId:'intake',campaign:config,now,receipt:{version:'lifecycle-consent-v1',campaignId:'refi',receivedAt:now,recipients:{phone:'0500000040',email:'test@example.invalid'},grants:{email:true,whatsapp:false,sms:false}}});
 const link=store.issueFeedbackLink({enrollmentId:e.enrollmentId,now}),server=createServer(handler(store,{clock:()=>now}));
 await new Promise((resolve,reject)=>{server.on('error',reject);server.listen(0,'127.0.0.1',resolve);});
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));store.close();});
 const origin='http://127.0.0.1:'+server.address().port,url=origin+'/feedback/'+link.token,csrf=store.feedbackLink(link.token,now).csrf;
 const post=(fields={},headers={})=>fetch(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Origin:origin,...headers},body:new URLSearchParams({csrf,action:'feedback',...fields}),redirect:'manual'});
 return {store,e,link,origin,url,csrf,post,setClock:value=>now=value};
}
test('real loopback GET renders a voluntary RTL form and never removes a contact',async t=>{
 const {store,url}=await fixture(t),r=await fetch(url),html=await r.text();assert.equal(r.status,200);assert.match(html,/lang="he" dir="rtl"/);assert.match(html,/הפסקת הקשר/);assert.equal((html.match(/\(רשות\)/g)||[]).length,5);assert.ok(!html.includes(' required'));assert.equal(store.snapshot().subjects[0].stop_reason,null);assert.ok(!html.includes('@example.invalid'));assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('referrer-policy'),'no-referrer');
});
test('removal commits before optional feedback and remains after invalid feedback',async t=>{
 const {store,post}=await fixture(t);assert.equal((await post({action:'stop'})).status,200);assert.equal(store.snapshot().subjects[0].stop_reason,'optout');assert.equal(store.snapshot().feedback.length,0);
 assert.equal((await post({experience:'bad'})).status,400);assert.equal(store.snapshot().subjects[0].stop_reason,'optout');
 assert.equal((await post({})).status,200);assert.equal(store.snapshot().feedback.length,1);assert.equal(store.snapshot().subjects[0].stop_reason,'optout');
});
test('empty feedback is accepted once and an identical network retry is idempotent',async t=>{
 const {store,post}=await fixture(t);assert.equal((await post()).status,200);assert.equal((await post()).status,200);assert.equal(store.snapshot().feedback.length,1);assert.equal(store.snapshot().subjects[0].stop_reason,null);assert.equal((await post({reason:'סיבה אחרת'})).status,409);
});
test('competitor feedback stops contact and stores voluntary answers without renewed consent',async t=>{
 const {store,post}=await fixture(t),r=await post({other_provider:'כן',missing:'<script>not executed</script>'});assert.equal(r.status,200);assert.ok(!(await r.text()).includes('<script>'));assert.equal(store.snapshot().subjects[0].stop_reason,'competitor_chosen');assert.equal(JSON.parse(store.snapshot().feedback[0].answers).marketingConsentGranted,false);
});
test('wrong CSRF and cross-origin submissions cannot change anything',async t=>{
 const {store,post}=await fixture(t);assert.equal((await post({action:'stop',csrf:'bad'})).status,403);assert.equal((await post({action:'stop'},{Origin:'https://foreign.invalid'})).status,403);assert.equal(store.snapshot().subjects[0].stop_reason,null);assert.equal(store.snapshot().feedback.length,0);
});
test('expired, invalid and unknown links cannot disclose a lead or change preferences',async t=>{
 const f=await fixture(t);f.setClock('2026-10-22T09:00:00.000Z');assert.equal((await fetch(f.url)).status,410);assert.equal((await f.post({action:'stop'})).status,410);assert.equal((await fetch(f.origin+'/feedback/'+'a'.repeat(64))).status,404);assert.equal((await fetch(f.url+'?phone=0500000040')).status,404);assert.equal(f.store.snapshot().subjects[0].stop_reason,null);
});
test('unsupported methods and media types never perform GET side effects',async t=>{
 const {store,url,post}=await fixture(t);assert.equal((await fetch(url,{method:'DELETE'})).status,405);assert.equal((await post({action:'stop'},{'Content-Type':'application/json'})).status,415);assert.equal(store.snapshot().subjects[0].stop_reason,null);
});
test('links are stored as hashes and rendered values are escaped',async t=>{
 const f=await fixture(t),row=f.store.get('SELECT * FROM feedback_links');assert.notEqual(row.token_hash,f.link.token);assert.ok(!JSON.stringify(f.store.snapshot()).includes(f.link.token));const html=render({csrf:'"><script>alert(1)</script>',message:'<img src=x onerror=alert(1)>'});assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img '));assert.match(html,/&lt;script&gt;/);
});
