const test=require('node:test');const assert=require('node:assert/strict');
const {planner,afterSend,item}=require('./load');
const plan=planner('test');const live=planner('live');
const T={M1:'2146929776251168',M2:'2157972271457704',M3:'2017016385642572',M4:'1840616890627890',M6:'922497660829094',M7:'1915186253195181',M8:'28923882683911966',M10:'1517902547031884',M10R:'4665876823677509',M11:'4430944130505180',M12:'1586746399324895'};
const NOW='2026-10-20T09:00:00Z'; // Tuesday 12:00 Jerusalem
const base={refi_phone:'0500000040',boolean_mm88mzry:{checked:'true'}};
const active=o=>({...base,fn_status:'פעיל',fn_token:'abcdefghjk',...o});
const due={date:'2026-10-20',time:'08:00:00'};
const cols=r=>JSON.parse(r.colsJson);

test('new form lead gets M1 and a token',()=>{const [r]=plan({items:[item({cols:base})],now:NOW});
  assert.equal(r.send.templateId,T.M1);assert.equal(r.send.to,'972500000040');assert.deepEqual(r.send.variables,['דני']);
  const c=cols(r);assert.equal(c.fn_status.label,'פעיל');assert.match(c.fn_token,/^[a-f0-9]{32}$/);assert.equal(c.fn_path,'B');assert.equal(c.fn_step,'M1');});

test('WhatsApp sender is explicitly the existing owner-selected number',()=>{
 for(const mode of ['test','live']){const [r]=planner(mode)({items:[item({name:mode==='live'?'ליד בדיקה':'TEST פנימי',cols:base})],now:NOW});assert.equal(r.send.from,'972559881245');}
});

test('new cohort requires recipient-bound explicit WhatsApp proof',()=>{
 const now='2026-10-21T09:00:00Z',created='2026-10-21T08:00:00Z';
 const proof={version:'lp1-channels-20261020',phone:'972500000040',receivedAt:created,grants:{whatsapp:true,email:false,sms:false}};
 const run=p=>plan({items:[item({created,cols:{...base,...(p?{long_text_mm8ag9s:JSON.stringify(p)}:{})}})],now});
 assert.equal(run(null).length,0);assert.equal(run({...proof,grants:{email:true}}).length,0);assert.equal(run({...proof,phone:'972500000041'}).length,0);
 assert.equal(run({...proof,receivedAt:'2030-01-01'}).length,0);assert.equal(run(proof)[0].send.from,'972559881245');
});
test('withdrawn channel proof stops an active WhatsApp series before stale pending reconciliation',()=>{
 const [r]=plan({items:[item({created:'2026-10-21T08:00:00Z',cols:active({fn_path:'B',fn_step:'M1',fn_next:due,fn_opens:JSON.stringify({pending:{key:'old',at:1}}),long_text_mm8ag9s:JSON.stringify({version:'lp1-channels-20261020',phone:'972500000040',receivedAt:'2026-10-21T08:00:00Z',grants:{whatsapp:false,email:true}})})})],now:'2026-10-21T09:00:00Z'});
 assert.equal(r.send,null);assert.equal(r.reconcile,false);assert.equal(r.cols.fn_status.label,'נעצר');assert.deepEqual(r.cols.fn_next,{});
});
test('landing page lead with submitted questionnaire answers starts at M7',()=>{const [r]=plan({items:[item({cols:{...base,long_text_mm88xzfe:'מוצר: מחזור משכנתא (LP1)\nיש לכם היום משכנתא? כן, משכנתא אחת'}})],now:NOW});assert.equal(r.send.templateId,T.M7);assert.equal(cols(r).fn_path,'D');});
test('callback score explanation and product metadata do not pretend a questionnaire was answered',()=>{const [r]=plan({items:[item({cols:{...base,long_text_mm88pfdv:'גרסה heat-1.1, שלמות 1/4\nחסר: intent, timing, docs',long_text_mm88xzfe:'מוצר: מחזור משכנתא (LP1)\nמידע כספי צורף: לא\n'}})],now:NOW});assert.equal(r.send.templateId,T.M1);assert.equal(cols(r).fn_path,'B');});
test('a submitted unknown answer qualifies even when financial details were skipped',()=>{const [r]=plan({items:[item({cols:{...base,long_text_mm88xzfe:'מוצר: מחזור משכנתא (LP1)\nיש לכם דוח יתרות לסילוק עדכני? לא בטוח מה זה'}})],now:NOW});assert.equal(r.send.templateId,T.M7);});
test('lead without any consent is not contacted',()=>{assert.equal(plan({items:[item({cols:{refi_phone:'0500000040'}})],now:NOW}).length,0);});
test('lead created before go live is not contacted',()=>{assert.equal(plan({items:[item({created:'2026-10-19T08:00:00Z',cols:base})],now:NOW}).length,0);});
test('lead without phone is skipped',()=>{assert.equal(plan({items:[item({cols:{boolean_mm88mzry:{checked:'true'}}})],now:NOW}).length,0);});
test('M2 carries the personal link code',()=>{const [r]=plan({items:[item({cols:active({fn_path:'B',fn_step:'M1',fn_next:due})})],now:NOW});
  assert.equal(r.send.templateId,T.M2);assert.deepEqual(r.send.variables,['דני','abcdefghjkq']);assert.equal(r.send.buttonVariables,undefined);assert.equal(cols(r).fn_path,'C');});
test('nothing is sent before the due time (no double send)',()=>{assert.equal(plan({items:[item({cols:active({fn_path:'C',fn_step:'M2',fn_next:{date:'2026-10-20',time:'12:00:00'},fn_last:due})})],now:NOW}).length,0);});
test('second message in the same day is postponed for C path',()=>{const [r]=plan({items:[item({cols:active({fn_path:'C',fn_step:'M3',fn_next:due,fn_last:{date:'2026-10-20',time:'06:00:00'}})})],now:NOW});assert.equal(r.send,null);assert.equal(cols(r).fn_next.date,'2026-10-21');});
test('no sends on Shabbat',()=>{assert.equal(plan({items:[item({cols:active({fn_path:'C',fn_step:'M2',fn_next:due})})],now:'2026-10-24T09:00:00Z',shabbat:[{category:'candles',date:'2026-10-23T17:04:00+03:00'},{category:'havdalah',date:'2026-10-24T18:00:00+03:00'}]}).length,0);});
test('no sends at night',()=>{assert.equal(plan({items:[item({cols:active({fn_path:'C',fn_step:'M2',fn_next:due})})],now:'2026-10-20T19:00:00Z'}).length,0);});
test('a reply stops the series and notifies',()=>{const [r]=plan({items:[item({cols:active({fn_path:'C',fn_step:'M3',fn_last:{date:'2026-10-20',time:'06:00:00'}})})],convos:[{phone:'972500000040',lastMessageDirection:'incoming',lastMessageTime:'2026-10-20T08:30:00Z',lastMessage:'כן מעוניין'}],now:NOW});
  assert.equal(cols(r).fn_status.label,'ענה');assert.equal(r.send,null);assert.ok(r.notifyText.includes('כן מעוניין'));});
test('a reply that was already handled is not handled again',()=>{assert.equal(plan({items:[item({cols:active({fn_path:'C',fn_step:'M3',fn_last:{date:'2026-10-20',time:'06:00:00'},fn_opens:JSON.stringify({reply:Date.parse('2026-10-20T08:30:00Z')}),fn_next:{date:'2026-10-21',time:'07:00:00'}})})],convos:[{phone:'972500000040',lastMessageDirection:'incoming',lastMessageTime:'2026-10-20T08:30:00Z',lastMessage:'כן'}],now:NOW}).length,0);});
test('remove request stops everything',()=>{const [r]=plan({items:[item({cols:active({fn_path:'C',fn_step:'M3'})})],convos:[{phone:'972500000040',lastMessageDirection:'incoming',lastMessageTime:'2026-10-20T08:30:00Z',lastMessage:'הסר'}],now:NOW});assert.equal(cols(r).fn_status.label,'הסר');assert.deepEqual(cols(r).fn_next,{});});
test('less request moves to פחות',()=>{const [r]=plan({items:[item({cols:active({fn_path:'C',fn_step:'M3'})})],convos:[{phone:'972500000040',lastMessageDirection:'incoming',lastMessageTime:'2026-10-20T08:30:00Z',lastMessage:'פחות'}],now:NOW});assert.equal(cols(r).fn_status.label,'פחות');});
test('booking sends M10 with the meeting time',()=>{const [r]=plan({items:[item({cols:active({fn_path:'D',fn_step:'M7',refi_stage:'פגישה נקבעה',refi_meeting:{date:'2026-10-22',time:'07:00:00'}})})],now:NOW});
  assert.equal(r.send.templateId,T.M10);assert.deepEqual(r.send.variables,['דני','יום חמישי 22.10 בשעה 10:00']);assert.equal(cols(r).fn_path,'E');});
test('reminder a day before, then an hour before',()=>{const mt=Date.parse('2026-10-22T07:00:00Z');
  const [r]=plan({items:[item({cols:active({fn_path:'E',fn_step:'M10',refi_stage:'פגישה נקבעה',refi_meeting:{date:'2026-10-22',time:'07:00:00'},fn_opens:JSON.stringify({mt}),fn_next:{date:'2026-10-21',time:'07:00:00'}})})],now:'2026-10-21T07:01:00Z'});
  assert.equal(r.send.templateId,T.M10R);assert.equal(cols(r).fn_step,'R1');assert.deepEqual(cols(r).fn_next,{date:'2026-10-22',time:'06:00:00'});});
test('cancelled meeting sends M11 once, second no show goes to long funnel',()=>{const [r]=plan({items:[item({cols:active({fn_path:'E',fn_step:'R2',refi_stage:'פגישה בוטלה',refi_meeting:{date:'2026-10-20',time:'07:00:00'}})})],now:NOW});assert.equal(r.send.templateId,T.M11);
  const [r2]=plan({items:[item({cols:active({fn_path:'E',fn_step:'R2',refi_stage:'פגישה בוטלה',fn_opens:JSON.stringify({ns:1}),refi_meeting:{date:'2026-10-20',time:'07:00:00'}})})],now:NOW});assert.equal(r2.send,null);assert.equal(cols(r2).fn_path,'L');});
test('after a meeting M12 is scheduled two days later',()=>{const [r]=plan({items:[item({cols:active({fn_path:'E',fn_step:'R2',refi_stage:'פגישה התקיימה',refi_meeting:{date:'2026-10-20',time:'07:00:00'}})})],now:NOW});assert.equal(r.send,null);assert.equal(cols(r).fn_path,'G');assert.equal(cols(r).fn_next.date,'2026-10-22');});
test('paying client stops all messages',()=>{const [r]=plan({items:[item({cols:active({refi_stage:'לקוח משלם'})})],now:NOW});assert.equal(cols(r).fn_status.label,'לקוח');assert.equal(r.send,null);});
test('not relevant stops the funnel',()=>{const [r]=plan({items:[item({cols:active({refi_stage:'לא רלוונטי'})})],now:NOW});assert.equal(cols(r).fn_status.label,'נעצר');});
test('test mode never touches real leads',()=>{assert.equal(plan({items:[item({name:'אוסנת',cols:base})],now:NOW}).length,0);});
test('live mode never touches TEST items',()=>{assert.equal(live({items:[item({cols:base})],now:NOW}).length,0);});
test('live mode marks sends as live, test mode as not live',()=>{const [r]=live({items:[item({name:'אוסנת לוי',cols:base})],now:NOW});assert.equal(r.live,true);assert.equal(plan({items:[item({cols:base})],now:NOW})[0].live,false);});
test('failed send keeps position and retries in 30 minutes',()=>{const [r]=plan({items:[item({cols:active({fn_path:'B',fn_step:'M1',fn_next:due})})],now:NOW});
  const a=afterSend(r,{success:false,message:'(#132000) params'});const c=JSON.parse(a.colsJson);
  assert.equal(a.sendOk,false);assert.equal(c.fn_path,'B');assert.equal(c.fn_step,'M1');assert.equal(c.fn_last,undefined);assert.equal(JSON.parse(c.fn_opens.text).fails,1);});
test('three failed sends stop the lead',()=>{const [r]=plan({items:[item({cols:active({fn_path:'B',fn_step:'M1',fn_next:due,fn_opens:JSON.stringify({fails:2})})})],now:NOW});
  const c=JSON.parse(afterSend(r,{success:false}).colsJson);assert.equal(c.fn_status.label,'נעצר');});
test('successful send advances',()=>{const [r]=plan({items:[item({cols:active({fn_path:'B',fn_step:'M1',fn_next:due})})],now:NOW});const c=JSON.parse(afterSend(r,{success:true}).colsJson);assert.equal(c.fn_step,'M2');});
test('filling the quiz on the same day still sends M7 right away',()=>{const [r]=plan({items:[item({cols:active({fn_path:'C',fn_step:'M2',fn_next:{date:'2026-10-20',time:'12:00:00'},fn_last:{date:'2026-10-20',time:'08:30:00'},long_text_mm88xzfe:'מה אתם מבקשים כרגע? שיחת טלפון קצרה'})})],now:NOW});assert.equal(r.send&&r.send.templateId,T.M7);assert.equal(cols(r).fn_path,'D');});
test('a second item with the same phone does not start a second series',()=>{const r=plan({items:[item({id:'1',cols:active({fn_path:'C',fn_step:'M2',fn_next:{date:'2026-10-21',time:'07:00:00'}})}),item({id:'2',cols:base})],now:NOW});assert.equal(r.length,0);});
test('two new items with the same phone: only the first starts',()=>{const r=plan({items:[item({id:'1',cols:base}),item({id:'2',cols:base})],now:NOW});assert.equal(r.length,1);assert.equal(r[0].itemId,'1');});
test('when Gambot conversations cannot be read, nothing is sent',()=>{const r=plan({items:[item({cols:active({fn_path:'B',fn_step:'M1',fn_next:due})})],now:NOW,convosDown:true});assert.ok(r.every(x=>!x.send));});
test('a manual message in the chat after our last send stops the series',()=>{const [r]=plan({items:[item({cols:active({fn_path:'C',fn_step:'M3',fn_last:{date:'2026-10-20',time:'06:00:00'},fn_next:due})})],convos:[{phone:'972500000040',lastMessageDirection:'outgoing',lastMessageTime:'2026-10-20T08:30:00Z',lastMessage:'היי, כאן יורם'}],now:NOW});assert.equal(cols(r).fn_status.label,'ענה');assert.equal(r.send,null);});
test('our own send a few seconds later is not mistaken for a manual chat',()=>{const r=plan({items:[item({cols:active({fn_path:'C',fn_step:'M3',fn_last:{date:'2026-10-20',time:'06:00:00'},fn_next:{date:'2026-10-21',time:'07:00:00'}})})],convos:[{phone:'972500000040',lastMessageDirection:'outgoing',lastMessageTime:'2026-10-20T06:00:40Z',lastMessage:'M3'}],now:NOW});assert.equal(r.length,0);});
