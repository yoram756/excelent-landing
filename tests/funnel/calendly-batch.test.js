const test = require('node:test');
const assert = require('node:assert/strict');
const {calendly, item} = require('./load');
const text='Invitee: TEST Calendar Batch Invitee Email: calendar-batch@example.com Event Date/Time: 17:30 - Thursday, 29 October 2026 (Israel Time) Location: +972 50-000-0085';
const lead=item({id:'85',cols:{refi_phone:'0500000085',fn_email:'calendar-batch@example.com',refi_meeting:{date:'2026-10-29',time:'15:30:00'}}});
const booking={id:'batch-new',subject:'New Event: TEST Calendar Batch',text,date:'2026-10-29T10:00:00Z'};
const cancellation={id:'batch-cancel',subject:'Canceled: TEST Calendar Batch',text,date:'2026-10-29T11:00:00Z'};
test('latest cancellation wins regardless of Gmail batch ordering',()=>{
  for(const mails of [[booking,cancellation],[cancellation,booking]]){
    const out=calendly({mails,items:[lead]});assert.equal(out.length,1);
    assert.equal(out[0].mailId,'batch-cancel');assert.deepEqual(JSON.parse(out[0].colsJson).refi_meeting,{});
  }
});
test('acknowledged cancellation keeps an older booking from reappearing',()=>{
  assert.deepEqual(calendly({mails:[cancellation,booking],items:[lead],store:{seen:{'batch-cancel':Date.now()}}}),[]);
});
test('unknown cancelled invitee is never created from an older booking',()=>{
  assert.deepEqual(calendly({mails:[cancellation,booking],items:[]}),[]);
});
test('missing received dates preserve Gmail newest-first ordering',()=>{
  const mails=[cancellation,booking].map(({date,...m})=>m);
  assert.equal(calendly({mails,items:[lead]})[0].kind,'cancel');
});
test('unconfirmed final write leaves the selected mail retryable',()=>{
  const store={};const args={mails:[cancellation,booking],items:[lead],store};
  assert.equal(calendly(args).length,1);assert.equal(calendly(args).length,1);
  assert.equal(store.seen['batch-cancel'],undefined);
});
