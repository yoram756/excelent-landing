'use strict';
// Returns draft plans only. Caller must use verified participant/context metadata.
function planResponse({audience,purpose,known,required,next,preferredChannel,needsDocuments=false,needsMeeting=false,availabilityChecked=false,recentConversationRead=false,recipientVerified=false,caseLink}){
 if(!['internal','client','external_professional'].includes(audience)||![purpose,required,next,caseLink].every(v=>typeof v==='string'&&v.trim())||!Array.isArray(known))throw Error('Concrete response context required');
 if(audience!=='internal'&&(!recipientVerified||!recentConversationRead))return {state:'needs_context',reason:'Verify recipient and read the existing conversation before drafting',dispatchEnabled:false};
 if(needsMeeting&&!availabilityChecked)return {state:'needs_availability',dispatchEnabled:false};
 const channel=audience==='internal'?'monday':needsMeeting?'calendar':needsDocuments?'email':['whatsapp','email'].includes(preferredChannel)?preferredChannel:'email';
 return {state:'draft',channel,purpose,known,required,next,caseLink,approvalRequired:true,dispatchEnabled:false};
}
function digest(snapshot,{owner,now,urgentWithinHours=24}){
 if(!['neria','yoram'].includes(owner)||!Number.isFinite(Date.parse(now)))throw Error('Verified logical owner and clock required');
 const tasks=snapshot.tasks.filter(t=>t.owner===owner),closed=tasks.filter(t=>t.state==='completed'),open=tasks.filter(t=>t.state!=='completed');
 const urgent=open.filter(t=>t.state==='blocked'&&t.priority==='urgent'||t.dueAt&&Date.parse(t.dueAt)<=Date.parse(now)+urgentWithinHours*3600000);
 const waiting=open.filter(t=>['waiting_customer','waiting_external'].includes(t.state));
 return {owner,recipientVerified:false,caseId:snapshot.caseId,caseLink:snapshot.link,closed:closed.map(t=>t.action),open:open.map(t=>({action:t.action,state:t.state,nextAction:t.nextAction,dueAt:t.dueAt,proposedDueAt:t.proposedDueAt})),waiting:waiting.map(t=>t.action),urgent:urgent.map(t=>t.action),approvalRequired:true,dispatchEnabled:false};
}
module.exports={planResponse,digest};
