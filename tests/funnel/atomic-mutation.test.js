const test=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),{join}=require('node:path');
test('regressions detect removed shared pause, removed optout and unsafe unknown retry',t=>{
 for(const [mutation,pattern]of [['shared_pause','reply, booking and handoff'],['optout','optout after reservation'],['unknown_retry','crash after dispatch began']]){
  const env={...process.env,ATOMIC_MUTATION:mutation,NODE_NO_WARNINGS:'1'};delete env.NODE_TEST_CONTEXT;
  const r=spawnSync(process.execPath,['--require',join(__dirname,'atomic-mutator.js'),'--test','--test-name-pattern',pattern,join(__dirname,'atomic.test.js')],{env,encoding:'utf8',windowsHide:true,timeout:20000});
  assert.equal(r.status,1,mutation+' must fail: '+r.stdout+r.stderr);assert.match(r.stdout,/fail 1/);assert.ok(!r.stderr.includes('Mutation target changed'));t.diagnostic(mutation+': broken implementation rejected');
 }
});
