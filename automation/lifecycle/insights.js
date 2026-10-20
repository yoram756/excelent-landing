// Aggregates first-touch cohorts from a complete event export. No PII in output.
const STAGES=['entered','questionnaire','monday_saved','reply','meeting_booked','meeting_cancelled','handed_off','paid','optout','competitor_chosen','exit_feedback'];
const REASONS=['timing','price','value_unclear','response_time','fit','other_provider','not_relevant','other','prefer_not_say'];
function summarize({complete,events}){
 if(complete!==true||!Array.isArray(events))throw Error('Complete event export required');
 const byId=new Map();
 for(const e of events){
  if(!e?.id||!e.leadId||!STAGES.includes(e.type)||!Number.isFinite(Date.parse(e.at)))throw Error('Invalid event');
  if(e.reasonCode&&!REASONS.includes(e.reasonCode))throw Error('Feedback requires a known reason code, never free text');
  if(byId.has(e.id)&&JSON.stringify(byId.get(e.id))!==JSON.stringify(e))throw Error('Conflicting duplicate event');
  byId.set(e.id,e);
 }
 const people=new Map();for(const e of [...byId.values()].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)||String(a.id).localeCompare(String(b.id)))){if(!people.has(e.leadId))people.set(e.leadId,[]);people.get(e.leadId).push(e);}
 const groups=new Map();let unattributedLeads=0;
 for(const list of people.values()){
  const entry=list.find(e=>e.type==='entered');if(!entry?.campaignId){unattributedLeads++;continue;}
  const a={campaignId:entry.campaignId,adSetId:entry.adSetId||null,adId:entry.adId||null,source:entry.source||'unknown'},key=JSON.stringify(a);
  if(!groups.has(key))groups.set(key,{...a,leads:0,...Object.fromEntries(STAGES.filter(t=>t!=='entered').map(t=>[t,0])),exitReasons:{},meetingPaid:0,competitorFeedback:0});
  const g=groups.get(key);g.leads++;
  for(const t of STAGES.filter(t=>t!=='entered'))if(list.some(e=>e.type===t&&Date.parse(e.at)>=Date.parse(entry.at)))g[t]++;
  const current=list.filter(e=>Date.parse(e.at)>=Date.parse(entry.at));
  if(current.some(e=>e.type==='meeting_booked')&&current.some(e=>e.type==='paid'))g.meetingPaid++;
  if(current.some(e=>e.type==='competitor_chosen')&&current.some(e=>e.type==='exit_feedback'))g.competitorFeedback++;
  const feedback=current.filter(e=>e.type==='exit_feedback'&&e.reasonCode).at(-1);
  if(feedback)g.exitReasons[feedback.reasonCode]=(g.exitReasons[feedback.reasonCode]||0)+1;
 }
 return {complete:true,uniqueEvents:byId.size,unattributedLeads,groups:[...groups.values()].map(({meetingPaid,competitorFeedback,...g})=>({...g,meetingRate:g.leads?g.meeting_booked/g.leads:null,paidRate:g.leads?g.paid/g.leads:null,meetingToPaidRate:g.meeting_booked?meetingPaid/g.meeting_booked:null,voluntaryFeedbackCoverage:g.competitor_chosen?competitorFeedback/g.competitor_chosen:null,costPerLead:null,costPerPaid:null,costStatus:'Ad-platform spend and currency not joined; cost cannot be inferred'}))};
}
module.exports={summarize};
