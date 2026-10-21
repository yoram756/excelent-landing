const test=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),{join}=require('node:path');
test('regressions detect removed policy, consent, recovery and CRM safeguards',t=>{
 for(const [mutation,pattern,file='atomic.test.js']of [['shared_pause','reply, booking and handoff'],['optout','optout after reservation'],['unknown_retry','crash after dispatch began'],['adapter_grants','all seven grant combinations','lp1-adapter.test.js'],['enrollment_anchor','original server receipt anchors','lp1-adapter.test.js'],['restore_gate','post-snapshot optout','backup.test.js'],['crm_readback','CRM readback mismatch','crm-sandbox.test.js'],['crm_unknown_retry','CRM readback mismatch','crm-sandbox.test.js'],['crm_snapshot','CRM snapshot frontier','crm-snapshot.test.js']]){
  const env={...process.env,ATOMIC_MUTATION:mutation,NODE_NO_WARNINGS:'1'};delete env.NODE_TEST_CONTEXT;
  const baselineEnv={...env};delete baselineEnv.ATOMIC_MUTATION;
  const baseline=spawnSync(process.execPath,['--test','--test-name-pattern',pattern,join(__dirname,file)],{env:baselineEnv,encoding:'utf8',windowsHide:true,timeout:20000});
  assert.equal(baseline.status,0,mutation+' unmodified baseline must pass before a mutation can prove anything: '+baseline.stdout+baseline.stderr);
  const r=spawnSync(process.execPath,['--require',join(__dirname,'atomic-mutator.js'),'--test','--test-name-pattern',pattern,join(__dirname,file)],{env,encoding:'utf8',windowsHide:true,timeout:20000});
  assert.equal(r.status,1,mutation+' must fail: '+r.stdout+r.stderr);assert.match(r.stdout,/fail 1/);assert.match(r.stdout,/AssertionError/);assert.doesNotMatch(r.stdout+r.stderr,/EACCES|EPERM|Mutation target changed/);t.diagnostic(mutation+': broken implementation rejected');
 }
});
