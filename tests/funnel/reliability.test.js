const test=require('node:test');const assert=require('node:assert/strict');
const {planner,afterSend,reconcile,item}=require('./load');
const plan=planner('test');const pilot=planner('pilot','2026-10-20T07:00:00Z','972548180280');
const NOW='2026-10-20T09:00:00Z';const due={date:'2026-10-20',time:'08:00:00'};
const base={refi_phone:'0500000040',boolean_mm88mzry:{checked:'true'}};
const active=o=>({...base,fn_status:'פעיל',fn_token:'abcdefghjk',...o});
test('every send is reserved in Monday first, with a unique key',()=>{const [r]=plan({items:[item({cols:active({fn_path:'B',fn_step:'M1',fn_next:due})})],now:NOW});
  const pend=JSON.parse(JSON.parse(r.reserveJson).fn_opens.text).pending;assert.equal(pend.tpl,r.send.templateId);assert.equal(r.send.key,pend.key);assert.match(pend.key,/^1:M2:\d+$/);
  assert.equal(pend.adv.fn_step,'M2');assert.equal(JSON.parse(JSON.parse(r.colsJson).fn_opens.text).pending,undefined);});
test('a lead with a pending send is never planned again, only reconciled',()=>{const st={pending:{key:'1:M2:1',tpl:'2866421103739060',code:'M2',at:Date.parse(NOW)-60000,adv:{fn_step:'M2',fn_path:'C'}}};
  const [r]=plan({items:[item({cols:active({fn_path:'B',fn_step:'M1',fn_next:due,fn_opens:JSON.stringify(st)})})],now:NOW});assert.equal(r.reconcile,true);assert.equal(r.send,null);});
test('unknown send result keeps the pending send (no blind resend)',()=>{const [r]=plan({items:[item({cols:active({fn_path:'B',fn_step:'M1',fn_next:due})})],now:NOW});const a=afterSend(r,{});assert.equal(a.sendUnknown,true);assert.equal(a.colsJson,'{}');});
test('Gambot refusal clears the pending send and retries later',()=>{const [r]=plan({items:[item({cols:active({fn_path:'B',fn_step:'M1',fn_next:due})})],now:NOW});const c=JSON.parse(afterSend(r,{success:false,message:'x'}).colsJson);assert.equal(JSON.parse(c.fn_opens.text).pending,undefined);assert.equal(c.fn_step,'M1');});
const colmap=require('../../campaigns/refi.json').columns;
const pend=(at)=>({itemId:'1',colmap,pendingJson:JSON.stringify({key:'1:M2:1',tpl:'2866421103739060',code:'M2',at,adv:{fn_step:'M2',fn_path:'C'}}),stJson:JSON.stringify({pending:{},mkt:true})});
test('reconcile: message found in Gambot applies the update, no resend',()=>{const at=Date.now()-60000;const r=reconcile(pend(at),{data:{messages:[{direction:'outgoing',templateId:'2866421103739060',time:new Date(at+5000).toISOString()}]}});assert.equal(r.outcome,'confirmed');const c=JSON.parse(r.colsJson);assert.equal(c.fn_step,'M2');assert.equal(JSON.parse(c.fn_opens.text).pending,undefined);});
test('reconcile: not found yet and recent, waits',()=>{const r=reconcile(pend(Date.now()-60000),{data:{messages:[]}});assert.equal(r.outcome,'wait');assert.equal(r.colsJson,'{}');});
test('reconcile: Gambot history unreadable, waits',()=>{const r=reconcile(pend(Date.now()-3600000),{error:'down'});assert.equal(r.outcome,'wait');});
test('reconcile: confirmed absent after 10 minutes, released for retry',()=>{const r=reconcile(pend(Date.now()-11*60000),{data:{messages:[{direction:'outgoing',templateId:'other',time:new Date().toISOString()}]}});assert.equal(r.outcome,'not sent, released for retry');assert.equal(JSON.parse(JSON.parse(r.colsJson).fn_opens.text).pending,undefined);});
test('Monday update failing after a send cannot cause a second send',()=>{
  // reserve stored pending; the final update is lost; next run sees pending and only reconciles
  const [r]=plan({items:[item({cols:active({fn_path:'B',fn_step:'M1',fn_next:due})})],now:NOW});
  const afterReserve=JSON.parse(JSON.parse(r.reserveJson).fn_opens.text);
  const [r2]=plan({items:[item({cols:active({fn_path:'B',fn_step:'M1',fn_next:due,fn_opens:JSON.stringify(afterReserve)})})],now:NOW});
  assert.equal(r2.reconcile,true);assert.equal(r2.send,null);});
test('manual stage stops automatic messages',()=>{for(const stage of ['בטיפול','נוצר קשר']){const r=plan({items:[item({cols:active({fn_path:'C',fn_step:'M2',fn_next:due,refi_stage:stage})})],now:NOW});assert.ok(r.every(x=>!x.send),stage);}});
test('a recorded human first reply stops automatic messages',()=>{const r=plan({items:[item({cols:active({fn_path:'C',fn_step:'M2',fn_next:due,refi_first_reply:'2026-10-20'})})],now:NOW});assert.ok(r.every(x=>!x.send));});
test('pilot touches only the listed internal phone and sends live',()=>{const r=pilot({items:[item({name:'TEST פיילוט',cols:{...base,refi_phone:'0548180280'}}),item({id:'2',name:'ליד אמיתי',cols:{...base,refi_phone:'0521234567'}})],now:NOW});assert.equal(r.length,1);assert.equal(r[0].send.to,'972548180280');assert.equal(r[0].live,true);});
