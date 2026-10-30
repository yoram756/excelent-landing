const {test}=require('node:test');const assert=require('node:assert/strict');const {offsetBounds,classify,measure}=require('./measure.cjs');
const sample=(d=1000)=>({sentEpochMs:1000,receivedEpochMs:1020,dateEpochMs:d,elapsedMs:20});
const client={eventId:'synthetic',campaign:'test',startEpochMs:1000,wallClockJumpMs:0,before:[sample()],after:[sample()],response:{request_id:'123'},fullResponseMs:3000};
test('fast ingress passes even when complete CRM response takes three seconds',()=>assert.equal(measure(client,{eventId:'synthetic',status:'success',webhookStartMs:1100}).status,'PASS'));
test('server clock five seconds ahead is corrected rather than called slow',()=>assert.equal(measure({...client,before:[sample(6000)],after:[sample(6000)]},{eventId:'synthetic',status:'success',webhookStartMs:6100}).status,'PASS'));
test('known slow ingress fails',()=>assert.equal(measure(client,{eventId:'synthetic',status:'success',webhookStartMs:4100}).status,'FAIL'));
test('uncertainty crossing two seconds never passes',()=>assert.equal(classify(1500,2100),'BLOCKED'));
test('exact threshold never passes',()=>{assert.equal(classify(2000,2000),'FAIL');assert.equal(classify(1990,2000),'BLOCKED');});
test('inconsistent clock samples are rejected',()=>assert.throws(()=>offsetBounds([sample(),sample(10000)]),/Inconsistent/));
test('wrong event cannot be correlated',()=>assert.throws(()=>measure(client,{eventId:'other',status:'success',webhookStartMs:1100}),/Event mismatch/));
test('missing timestamps and client clock jumps are rejected',()=>{assert.throws(()=>offsetBounds([{...sample(),dateEpochMs:NaN},sample()]));assert.throws(()=>measure({...client,wallClockJumpMs:100},{eventId:'synthetic',status:'success',webhookStartMs:1100}));});

