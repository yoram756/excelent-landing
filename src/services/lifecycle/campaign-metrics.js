// Pure reporting contract, no APIs, tracking guesses, recommendations or writes.
// complete/verified fields must come from a reconciled private source export;
// this module validates consistency, not the authenticity of those assertions.
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const encode=v=>JSON.stringify(canonical(v));
const clock=v=>{
 const m=typeof v==='string'&&/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-](\d{2}):(\d{2}))$/.exec(v);
 if(!m)throw Error('Explicit ISO reporting clock with offset required');
 const [year,month,day,hour,minute,second]=m.slice(1,7).map(Number),leap=year%4===0&&(year%100!==0||year%400===0),days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
 if(year<1||month<1||month>12||day<1||day>days[month-1]||hour>23||minute>59||second>59||m[7]!=='Z'&&(Number(m[8])>14||Number(m[9])>59||Number(m[8])===14&&Number(m[9])!==0))throw Error('Invalid calendar date or offset');
 const at=new Date(v).toISOString();if(! /^\d{4}-/.test(at))throw Error('Reporting clock outside supported range');return at;
};
const platformId=v=>typeof v==='string'&& /^[0-9]{14,25}$/.test(v);
function windowOf(w){
 const from=clock(w?.from),until=clock(w?.until);if(from>=until||typeof w?.timezone!=='string')throw Error('Invalid reporting window');
 try{new Intl.DateTimeFormat('en',{timeZone:w.timezone}).format();}catch{throw Error('Invalid reporting timezone');}
 return {from,until,timezone:w.timezone};
}
const unavailable=(reason,numeratorMinor=null,denominator=null)=>({status:'UNAVAILABLE',reason,numeratorMinor,denominator,valueMajor:null});
const cost=(amount,denominator)=>denominator===0?unavailable('zero_denominator',amount,0):{status:'AVAILABLE',reason:null,numeratorMinor:amount,denominator,valueMajor:amount/denominator/100,belowMinorUnit:amount>0&&amount/denominator<1};
function calculate({spend,cohort=null}){
 if(!platformId(spend?.accountId)||!platformId(spend?.campaignId)||!['ILS','USD','EUR'].includes(spend?.currency)||!Number.isSafeInteger(spend?.amountMinor)||spend.amountMinor<0||typeof spend?.periodComplete!=='boolean')throw Error('Invalid campaign spend export');
 const window=windowOf(spend.window),observedAt=clock(spend.observedAt);
 if(observedAt<window.from||spend.periodComplete&&observedAt<window.until)throw Error('Completed spend period cannot precede its end');
 if(!['messaging_conversation_started','lead_form_submission','link_click','landing_page_view'].includes(spend.result?.name)||spend.result.count!==null&&(!Number.isSafeInteger(spend.result.count)||spend.result.count<0))throw Error('Explicit platform result definition and count/null required');
 const platformCost=spend.result.count===null?unavailable('platform_result_not_reported',spend.amountMinor):cost(spend.amountMinor,spend.result.count);
 if(!spend.periodComplete&&platformCost.status==='AVAILABLE'){platformCost.status='PROVISIONAL';platformCost.reason='partial_period';}
 const report={accountId:spend.accountId,platformCampaignId:spend.campaignId,currency:spend.currency,minorUnitsPerMajor:100,window,observedAt,spendMinor:spend.amountMinor,coverage:{spend:{periodComplete:spend.periodComplete,observedAt},cohort:null},platformResult:{name:spend.result.name,count:spend.result.count,cost:platformCost},cohort:{joined:false,observedEnrollments:null,attributedEnrollments:null,qualifiedEnrollments:null,unassessedEnrollments:null,excludedOutsideWindow:null},costPerAttributedEnrollment:unavailable('cohort_missing',spend.amountMinor),costPerQualifiedEnrollment:unavailable('cohort_missing',spend.amountMinor),qualificationRate:null,limitations:['Enrollment counts are campaign entries, not globally unique people','Platform results are not qualified enrollments','No authentication of source-export completeness or attribution assertions is provided here','Exact cost fraction is numeratorMinor / denominator / 100; valueMajor is an unrounded floating estimate']};
 if(cohort===null)return report;
 if(typeof cohort.complete!=='boolean'||typeof cohort.qualificationComplete!=='boolean'||!Array.isArray(cohort.leads)||!platformId(cohort.accountId)||!platformId(cohort.platformCampaignId))throw Error('Explicit cohort coverage required');
 const cw=windowOf(cohort.window),through=clock(cohort.observedThrough);if(through<cw.from||cohort.complete&&through<cw.until)throw Error('Complete cohort must cover its reporting window');
 const records=new Map();let excludedOutsideWindow=0;
 for(const lead of cohort.leads){
  if(typeof lead?.id!=='string'||! /^[A-Za-z0-9_-]{1,80}$/.test(lead.id)||typeof lead.attributionVerified!=='boolean'||!['qualified','not_qualified','unknown'].includes(lead.qualification))throw Error('Invalid anonymous enrollment record');
  const enteredAt=clock(lead.enteredAt);if(enteredAt>through)throw Error('Enrollment is beyond export coverage');
  const qualifiedAt=lead.qualification==='unknown'?null:clock(lead.qualificationRecordedAt);if(qualifiedAt!==null&&(qualifiedAt<enteredAt||qualifiedAt>through))throw Error('Invalid qualification clock');
  const normalized={enteredAt,attributionVerified:lead.attributionVerified,qualification:lead.qualification,qualifiedAt};
  if(records.has(lead.id)&&encode(records.get(lead.id))!==encode(normalized))throw Error('Conflicting enrollment duplicates require reconciliation');
  records.set(lead.id,normalized);
 }
 const inside=[];for(const row of records.values()){if(row.enteredAt>=cw.from&&row.enteredAt<cw.until)inside.push(row);else excludedOutsideWindow++;}
 const attributed=inside.filter(row=>row.attributionVerified),qualified=attributed.filter(row=>row.qualification==='qualified'),unassessed=attributed.filter(row=>row.qualification==='unknown');
 if(cohort.qualificationComplete&&inside.some(row=>row.qualification==='unknown'))throw Error('Qualification coverage claim contradicts unknown assessments');
 report.coverage.cohort={complete:cohort.complete,qualificationComplete:cohort.qualificationComplete,observedThrough:through,attributionComplete:inside.every(row=>row.attributionVerified)};
 report.cohort={joined:false,accountId:cohort.accountId,platformCampaignId:cohort.platformCampaignId,window:cw,observedThrough:through,observedEnrollments:inside.length,attributedEnrollments:attributed.length,qualifiedEnrollments:qualified.length,unassessedEnrollments:unassessed.length,excludedOutsideWindow};
 let reason=null;
 if(spend.accountId!==cohort.accountId)reason='account_mismatch';
 else if(spend.campaignId!==cohort.platformCampaignId)reason='campaign_mismatch';
 else if(encode(window)!==encode(cw))reason='window_or_timezone_mismatch';
 else if(!spend.periodComplete)reason='spend_period_incomplete';
 else if(!cohort.complete)reason='cohort_incomplete';
 else if(inside.some(row=>!row.attributionVerified))reason='attribution_incomplete';
 if(reason){report.costPerAttributedEnrollment=unavailable(reason,spend.amountMinor);report.costPerQualifiedEnrollment=unavailable(reason,spend.amountMinor);return report;}
 report.cohort.joined=true;
 report.costPerAttributedEnrollment=cost(spend.amountMinor,attributed.length);
 if(!cohort.qualificationComplete||unassessed.length){report.costPerQualifiedEnrollment=unavailable('qualification_incomplete',spend.amountMinor);return report;}
 report.costPerQualifiedEnrollment=cost(spend.amountMinor,qualified.length);
 report.qualificationRate=attributed.length?{numerator:qualified.length,denominator:attributed.length,value:qualified.length/attributed.length}:null;
 return report;
}
module.exports={calculate};
