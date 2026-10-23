const test=require('node:test'),assert=require('node:assert/strict'),{calculate}=require('../../src/services/lifecycle/campaign-metrics');
const window={from:'2026-10-20T07:00:00Z',until:'2026-10-21T07:00:00Z',timezone:'America/Los_Angeles'},accountId='287081049104797',campaignId='120252891592490603';
const spend=()=>({accountId,campaignId,currency:'ILS',amountMinor:10000,window,observedAt:'2026-10-21T08:00:00Z',periodComplete:true,result:{name:'messaging_conversation_started',count:10}});
const lead=(id,qualification='qualified')=>({id,enteredAt:'2026-10-20T08:00:00Z',attributionVerified:true,qualification,...(qualification==='unknown'?{}:{qualificationRecordedAt:'2026-10-21T07:30:00Z'})});
const cohort=()=>({accountId,platformCampaignId:campaignId,window,observedThrough:'2026-10-21T08:00:00Z',complete:true,qualificationComplete:true,leads:[lead('a'),lead('b'),lead('c','not_qualified'),lead('d','not_qualified')]});
test('platform result cost is distinct from attributed and qualified enrollment denominators',()=>{
 const r=calculate({spend:spend(),cohort:cohort()});assert.equal(r.platformResult.cost.valueMajor,10);assert.equal(r.costPerAttributedEnrollment.valueMajor,25);assert.equal(r.costPerQualifiedEnrollment.valueMajor,50);assert.deepEqual(r.qualificationRate,{numerator:2,denominator:4,value:.5});assert.equal(r.costPerQualifiedEnrollment.denominator,2);
});
test('unreported dash stays null and never becomes zero conversations or a zero cost',()=>{
 const s=spend();s.result.count=null;const r=calculate({spend:s});assert.equal(r.platformResult.count,null);assert.equal(r.platformResult.cost.valueMajor,null);assert.equal(r.platformResult.cost.reason,'platform_result_not_reported');assert.equal(r.costPerQualifiedEnrollment.reason,'cohort_missing');assert.equal(r.cohort.observedEnrollments,null);
});
test('zero results and zero qualified denominator produce unavailable metrics, while verified zero spend is valid',()=>{
 const s=spend();s.result.count=0;const c=cohort();c.leads=c.leads.map(x=>({...x,qualification:'not_qualified'}));let r=calculate({spend:s,cohort:c});assert.equal(r.platformResult.cost.reason,'zero_denominator');assert.equal(r.costPerQualifiedEnrollment.valueMajor,null);assert.equal(r.costPerQualifiedEnrollment.denominator,0);s.amountMinor=0;r=calculate({spend:s,cohort:cohort()});assert.equal(r.costPerQualifiedEnrollment.valueMajor,0);
});
test('incomplete attribution prevents qualified CPL even if verified subset looks successful',()=>{
 const c=cohort();c.leads[0].attributionVerified=false;const r=calculate({spend:spend(),cohort:c});assert.equal(r.costPerAttributedEnrollment.reason,'attribution_incomplete');assert.equal(r.costPerQualifiedEnrollment.valueMajor,null);assert.equal(r.cohort.observedEnrollments,4);assert.equal(r.cohort.attributedEnrollments,3);
});
test('partial cohort or spend never implies a complete lead denominator',()=>{
 for(const kind of ['spend','cohort']){const s=spend(),c=cohort();if(kind==='spend')s.periodComplete=false;else c.complete=false;const r=calculate({spend:s,cohort:c});assert.equal(r.costPerQualifiedEnrollment.status,'UNAVAILABLE');assert.equal(r.platformResult.cost.status,kind==='spend'?'PROVISIONAL':'AVAILABLE');}
});
test('unknown qualification blocks qualified cost but preserves complete attributed enrollment cost',()=>{
 const c=cohort();c.qualificationComplete=false;c.leads[0]=lead('a','unknown');const r=calculate({spend:spend(),cohort:c});assert.equal(r.costPerAttributedEnrollment.valueMajor,25);assert.equal(r.costPerQualifiedEnrollment.reason,'qualification_incomplete');assert.equal(r.qualificationRate,null);assert.equal(r.cohort.unassessedEnrollments,1);
});
test('account campaign period and reporting timezone must match before joining spend',()=>{
 for(const change of [c=>c.accountId='187081049104797',c=>c.platformCampaignId='220252891592490603',c=>c.window={...window,timezone:'Asia/Jerusalem'},c=>c.window={...window,from:'2026-10-20T06:00:00Z'}]){const c=cohort();change(c);const r=calculate({spend:spend(),cohort:c});assert.equal(r.costPerQualifiedEnrollment.status,'UNAVAILABLE');assert.equal(r.costPerAttributedEnrollment.valueMajor,null);}
});
test('identical enrollment replay deduplicates while conflicting status duplicates require reconciliation',()=>{
 const c=cohort();c.leads.push({...c.leads[0]});assert.equal(calculate({spend:spend(),cohort:c}).cohort.observedEnrollments,4);c.leads.push({...c.leads[0],qualification:'not_qualified'});assert.throws(()=>calculate({spend:spend(),cohort:c}),/Conflicting/);
});
test('entry cohort is half-open and later qualification cannot pull historical leads into denominator',()=>{
 const c=cohort();c.leads.push({...lead('old'),enteredAt:'2026-10-20T06:59:59Z'},{...lead('next'),enteredAt:'2026-10-21T07:00:00Z'});const r=calculate({spend:spend(),cohort:c});assert.equal(r.cohort.observedEnrollments,4);assert.equal(r.cohort.excludedOutsideWindow,2);assert.equal(r.costPerQualifiedEnrollment.denominator,2);
});
test('invalid or contradictory monetary coverage assessment and clock assertions fail closed',()=>{
 for(const change of [s=>s.amountMinor=-1,s=>s.amountMinor=NaN,s=>s.amountMinor=1.1,s=>s.amountMinor=Number.MAX_SAFE_INTEGER+1,s=>s.currency='JPY',s=>s.result.count=-1,s=>s.result.count=undefined,s=>s.result.name='qualified_leads',s=>s.observedAt='2026-10-20T08:00:00Z',s=>s.window={...window,timezone:'not/timezone'}]){const s=spend();change(s);assert.throws(()=>calculate({spend:s}));}
 for(const change of [c=>c.leads[0]=lead('a','unknown'),c=>c.observedThrough='2026-10-20T12:00:00Z',c=>c.leads[0].qualificationRecordedAt='2026-10-20T07:00:00Z',c=>c.leads[0].qualificationRecordedAt='2026-10-22T00:00:00Z']){const c=cohort();change(c);assert.throws(()=>calculate({spend:spend(),cohort:c}));}
});
test('aggregate report never emits enrollment identifiers contact data or free-text payloads',()=>{
 const c=cohort();c.leads[0].email='private@example.invalid';c.leads[0].notes='private financial answer';c.leads[0].id='private-enrollment-marker';const serialized=JSON.stringify(calculate({spend:spend(),cohort:c}));assert.doesNotMatch(serialized,/private|@|financial answer/);
});
test('equivalent UTC timestamps normalize to the same window without timezone relabeling',()=>{
 const s=spend(),c=cohort();c.window={...window,from:'2026-10-20T00:00:00-07:00',until:'2026-10-21T00:00:00-07:00'};assert.equal(calculate({spend:s,cohort:c}).costPerQualifiedEnrollment.valueMajor,50);
});
test('impossible calendar dates and timezone-free timestamps cannot be silently normalized',()=>{
 for(const from of ['2026-02-30T07:00:00Z','2026-10-20T07:00:00','2026-10-20','2026-10-20T24:00:00Z','2026-10-20T07:00:00+15:00']){const s=spend();s.window={...window,from};assert.throws(()=>calculate({spend:s}));}
});
test('later qualification observation must be separately visible from spend snapshot clock',()=>{
 const c=cohort();c.observedThrough='2027-01-01T08:00:00Z';c.leads[0].qualificationRecordedAt='2027-01-01T07:00:00Z';const r=calculate({spend:spend(),cohort:c});assert.equal(r.cohort.observedThrough,'2027-01-01T08:00:00.000Z');assert.equal(r.coverage.spend.observedAt,'2026-10-21T08:00:00.000Z');assert.equal(r.costPerQualifiedEnrollment.status,'AVAILABLE');
});
test('partial platform cost is visibly provisional and exposes incomplete period coverage',()=>{
 const s=spend();s.periodComplete=false;const r=calculate({spend:s});assert.equal(r.platformResult.cost.status,'PROVISIONAL');assert.equal(r.coverage.spend.periodComplete,false);
});
test('mismatched cohort counts retain their own account campaign and window metadata',()=>{
 const c=cohort();c.platformCampaignId='220252891592490603';c.accountId='187081049104797';c.window={...window,timezone:'Asia/Jerusalem'};const r=calculate({spend:spend(),cohort:c});assert.equal(r.cohort.accountId,c.accountId);assert.equal(r.cohort.platformCampaignId,c.platformCampaignId);assert.equal(r.cohort.window.timezone,'Asia/Jerusalem');assert.equal(r.cohort.joined,false);
});
test('a positive cost below one minor unit never rounds into a false zero',()=>{
 const s=spend();s.amountMinor=1;s.result.count=3;const r=calculate({spend:s});assert.ok(r.platformResult.cost.valueMajor>0);assert.equal(r.platformResult.cost.belowMinorUnit,true);assert.equal(r.platformResult.cost.numeratorMinor,1);assert.equal(r.platformResult.cost.denominator,3);
});
