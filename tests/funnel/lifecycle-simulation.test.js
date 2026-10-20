const test=require('node:test'),assert=require('node:assert/strict');
const {simulate}=require('./simulate-lifecycle');
test('18-month synthetic timelines across consent combinations and campaign identities preserve contact invariants',{timeout:90000},t=>{
 const r=simulate();assert.equal(r.passed,true);assert.equal(r.timelines,189);assert.ok(r.evaluations>50000);assert.equal(r.actualDelivery,false);assert.equal(r.persistentConcurrencyTested,false);
 t.diagnostic(JSON.stringify({timelines:r.timelines,evaluations:r.evaluations,draftCandidates:r.draftCandidates,scope:r.scope}));
});
