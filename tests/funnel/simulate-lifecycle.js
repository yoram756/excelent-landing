// Deterministic long-horizon simulation: no HTTP, credentials, timers or messages.
const assert=require('node:assert/strict');
const {plan,addMonths}=require('../../automation/lifecycle/policy');
const refi=require('../../config/lifecycle/refi.json');
const DAY=86400000,channels=['whatsapp','email','sms'];
function simulate(){
 const report={scope:'Pure lifecycle policy; synthetic acknowledgments and ledgers only',actualDelivery:false,persistentConcurrencyTested:false,productionAcceptanceClaimed:false,timelines:0,evaluations:0,draftCandidates:0,unresolvedDeliveryProbes:0,queuedSuppressionProbes:0,byChannel:{whatsapp:0,email:0,sms:0},byTerminalReason:{},invariants:['recipient-and-campaign-consent','single-channel-per-touch','shared-seven-day-minimum-gap','at-most-two-touches-per-30-days','monotonic-content-no-catchup','stable-no-repeat-key','pending-and-unknown-block','optout-cancels-queued','withdrawal-cancels-queued','competitor-stops','human-pause','18-calendar-month-expiry','dispatch-always-disabled']};
 const evaluate=a=>{report.evaluations++;return plan(a);};
 const starts=['2026-10-18T09:00:00Z','2024-08-31T09:00:00Z','2025-01-31T09:00:00Z'];
 // Other ids exercise isolation of the generic mechanics, not new live campaigns.
 for(const campaignId of ['refi','TEST-real-estate','TEST-finance'])for(const enrolledAt of starts)for(let mask=1;mask<8;mask++)for(const stop of ['none','optout','competitor']){
  const i=report.timelines++,id='simulation-'+i,campaign={...refi,id:campaignId},start=Date.parse(enrolledAt),expires=Date.parse(addMonths(enrolledAt,18));
  const lead={id,enrolledAt,phone:'0500000040',email:'test@example.invalid',consent:{version:'lifecycle-consent-v1',campaignId,receivedAt:enrolledAt,recipients:{phone:'972500000040',email:'test@example.invalid'},grants:Object.fromEntries(channels.map((c,k)=>[c,!!(mask&(1<<k))]))}};
  const ledger={complete:true,subjectId:id,entries:[]},seen=new Set();let lastAt=null,lastMilestone=-1;
  for(let at=start;at<=expires+3*DAY;at+=DAY){
   const elapsed=Math.floor((at-start)/DAY),now=new Date(at).toISOString();
   lead.humanHandling=elapsed>=40&&elapsed<=65;
   if(elapsed>=120&&stop==='optout')lead.globalOptOutAt=new Date(start+120*DAY).toISOString();
   if(elapsed>=120&&stop==='competitor')lead.competitorChosenAt=new Date(start+120*DAY).toISOString();
   const a={lead,campaign,ledger,now},r=evaluate(a);
   assert.equal(r.dispatchEnabled,false);
   if(elapsed>=120&&stop!=='none'){assert.equal(r.status,'STOP');assert.equal(r.cancelQueued,true);assert.equal(r.feedbackInvitationAllowed,false);}
   if(at>=expires)assert.equal(r.status,'STOP');
   if(lead.humanHandling&&at<expires&&!lead.globalOptOutAt&&!lead.competitorChosenAt)assert.equal(r.status,'WAIT');
   if(r.status==='STOP')report.byTerminalReason[r.reason]=(report.byTerminalReason[r.reason]||0)+1;
   if(r.status!=='DRAFT')continue;
   report.draftCandidates++;report.byChannel[r.channel]++;
   assert.equal(lead.consent.grants[r.channel],true);assert.ok(at<expires);assert.ok(!seen.has(r.key));seen.add(r.key);
   if(lastAt!==null)assert.ok(at-lastAt>=7*DAY);
   assert.ok(ledger.entries.filter(e=>e.status==='sent'&&at-Date.parse(e.at)<30*DAY).length<2);
   const index=campaign.milestones.findIndex(m=>m.id===r.milestone);assert.ok(index>lastMilestone);lastMilestone=index;lastAt=at;
   ledger.entries.push({key:r.key,status:'reserved',at:now});
   assert.equal(evaluate(a).reason,'delivery_unresolved');report.unresolvedDeliveryProbes++;
   ledger.entries.at(-1).status='unknown';assert.equal(evaluate(a).reason,'delivery_unresolved');report.unresolvedDeliveryProbes++;
   const removed=evaluate({...a,lead:{...lead,globalOptOutAt:now}});assert.equal(removed.status,'STOP');assert.equal(removed.cancelQueued,true);report.queuedSuppressionProbes++;
   const withdrawn=evaluate({...a,lead:{...lead,consent:{...lead.consent,grants:{whatsapp:false,email:false,sms:false}}}});assert.equal(withdrawn.status,'STOP');assert.equal(withdrawn.cancelQueued,true);report.queuedSuppressionProbes++;
   // This is a synthetic provider acknowledgment, never a call to a provider.
   ledger.entries.at(-1).status='sent';assert.notEqual(evaluate(a).status,'DRAFT');
  }
 }
 assert.ok(report.byChannel.whatsapp&&report.byChannel.email&&report.byChannel.sms);
 return {...report,passed:true};
}
if(require.main===module)process.stdout.write(JSON.stringify(simulate(),null,2)+'\n');
module.exports={simulate};
