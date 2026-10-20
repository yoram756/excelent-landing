// Pure preview policy. No transport, database writes, timers or delivery adapters.
// An atomic, recipient-scoped outbox and a final suppression check are required
// before any future dispatcher may consume these drafts.
const DAY=86400000,CHANNELS=['whatsapp','email','sms'];
const timestamp=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?Date.parse(v):NaN;
function addMonths(iso,months){
  const t=timestamp(iso);if(!Number.isFinite(t)||!Number.isInteger(months)||months<0)throw Error('Invalid calendar offset');
  const d=new Date(t),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+months);
  const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return d.toISOString();
}
const phone=v=>String(v||'').replace(/\D/g,'').replace(/^0/,'972');
const mail=v=>String(v||'').trim().toLowerCase();
const outcome=(status,reason,extra={})=>({status,reason,dispatchEnabled:false,...extra});
function validateCampaign(campaign,enrolledAt){
  if(!Number.isInteger(campaign?.maxMonths)||campaign.maxMonths<1||campaign.maxMonths>18)return 'invalid_horizon';
  if(!Number.isFinite(campaign.minimumGapDays)||campaign.minimumGapDays<1||!Number.isInteger(campaign.maxTouchesPer30Days)||campaign.maxTouchesPer30Days<1||campaign.maxTouchesPer30Days>4||!Array.isArray(campaign.milestones)||!campaign.milestones.length||!Array.isArray(campaign.preferredChannels)||!campaign.preferredChannels.length||new Set(campaign.preferredChannels).size!==campaign.preferredChannels.length||campaign.preferredChannels.some(ch=>!CHANNELS.includes(ch)))return 'invalid_contact_policy';
  try{new Intl.DateTimeFormat('en-GB',{timeZone:campaign.timezone}).format(new Date(enrolledAt));}catch(e){return 'invalid_timezone';}
  if(typeof campaign.timezone!=='string'||!campaign.timezone)return 'invalid_timezone';
  if(campaign.milestones.some(m=>!m?.offset||Object.keys(m.offset).length!==1||!['days','months'].includes(Object.keys(m.offset)[0])||!Number.isSafeInteger(Object.values(m.offset)[0])||Object.values(m.offset)[0]<1||Object.values(m.offset)[0]>18*31||typeof m.topic!=='string'||!m.topic.trim()||! /^[A-Za-z0-9_-]{1,80}$/.test(m.id||'')))return 'invalid_milestones';
  const start=timestamp(enrolledAt),expiry=timestamp(addMonths(enrolledAt,campaign.maxMonths));
  if(campaign.milestones.some(m=>{const at=m.offset.months?timestamp(addMonths(enrolledAt,m.offset.months)):start+m.offset.days*DAY;return !Number.isFinite(at)||at<=start||at>=expiry;})||new Set(campaign.milestones.map(m=>m.id)).size!==campaign.milestones.length)return 'invalid_milestones';
  return null;
}
function plan({lead,campaign,ledger,now}){
  const at=timestamp(now),start=timestamp(lead?.enrolledAt);
  if(!Number.isFinite(at)||!Number.isFinite(start)||start>at||! /^[A-Za-z0-9_-]{1,80}$/.test(lead?.id||'')||! /^[A-Za-z0-9_-]{1,80}$/.test(campaign?.id||''))return outcome('BLOCKED','invalid_identity_or_clock');
  // Global stops outrank consent, unreadable ledgers, stale reservations and every channel.
  if(lead.globalOptOutAt)return outcome('STOP','global_optout',{cancelQueued:true,feedbackInvitationAllowed:false});
  if(lead.competitorChosenAt)return outcome('STOP','competitor_chosen',{cancelQueued:true,feedbackInvitationAllowed:false});
  if(lead.paidAt)return outcome('STOP','converted',{cancelQueued:true});
  const invalid=validateCampaign(campaign,lead.enrolledAt);if(invalid)return outcome('BLOCKED',invalid);
  const expiresAt=addMonths(lead.enrolledAt,campaign.maxMonths);
  if(at>=Date.parse(expiresAt))return outcome('STOP','horizon_complete',{expiresAt,cancelQueued:true});
  if(lead.humanHandling||lead.meetingActive||lead.incomingReplyPending)return outcome('WAIT','human_handling');
  if(lead.deferUntil){const defer=timestamp(lead.deferUntil);if(!Number.isFinite(defer))return outcome('BLOCKED','invalid_preferred_date');if(defer>at)return outcome('WAIT','lead_preferred_date',{expiresAt});}
  const c=lead.consent,issued=timestamp(c?.receivedAt);
  if(c?.version!=='lifecycle-consent-v1'||c.campaignId!==campaign.id||!Number.isFinite(issued)||issued>start||issued>at)return outcome('BLOCKED','missing_campaign_consent');
  const validPhone=/^972\d{9}$/.test(phone(lead.phone))&&phone(c.recipients?.phone)===phone(lead.phone);
  const validMail=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail(lead.email))&&mail(c.recipients?.email)===mail(lead.email);
  const allowed=CHANNELS.filter(ch=>c.grants?.[ch]===true&&(ch==='email'?validMail:validPhone));
  if(!allowed.length)return outcome('STOP','no_channel_consent',{cancelQueued:true});
  // The caller must supply a complete ledger for this person, across all channels/campaigns.
  if(ledger?.complete!==true||ledger.subjectId!==lead.id||!Array.isArray(ledger.entries))return outcome('BLOCKED','ledger_incomplete');
  const statuses=['sent','reserved','unknown','failed','suppressed'];
  if(ledger.entries.some(e=>!e||typeof e!=='object'||!e.key||!statuses.includes(e.status)||!Number.isFinite(timestamp(e.at))||timestamp(e.at)>at)||new Set(ledger.entries.map(e=>e.key)).size!==ledger.entries.length)return outcome('BLOCKED','ledger_invalid');
  if(ledger.entries.some(e=>['reserved','unknown'].includes(e.status)))return outcome('BLOCKED','delivery_unresolved');
  const sent=ledger.entries.filter(e=>e.status==='sent');
  if(sent.some(e=>at-timestamp(e.at)<campaign.minimumGapDays*DAY))return outcome('WAIT','cross_channel_cooldown');
  if(sent.filter(e=>at-timestamp(e.at)<30*DAY).length>=campaign.maxTouchesPer30Days)return outcome('WAIT','cross_channel_frequency_cap');
  const p={};try{new Intl.DateTimeFormat('en-GB',{timeZone:campaign.timezone,weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date(at)).forEach(x=>p[x.type]=x.value);}catch(e){return outcome('BLOCKED','invalid_timezone');}
  const minutes=Number(p.hour)%24*60+Number(p.minute);
  if(['Fri','Sat'].includes(p.weekday)||minutes<540||minutes>=1200)return outcome('WAIT','contact_hours');
  const all=campaign.milestones.map(m=>({...m,at:m.offset.months?timestamp(addMonths(lead.enrolledAt,m.offset.months)):start+m.offset.days*DAY}));
  const prefix=campaign.id+':'+lead.id+':'+new Date(start).toISOString()+':';
  const due=all.filter(m=>m.at<=at).sort((a,b)=>a.at-b.at);
  if(!due.length)return outcome('WAIT','no_due_content',{expiresAt});
  // Missed contacts are not replayed in a burst. One current draft, one channel.
  const m=due.at(-1),key=prefix+m.id;
  if(ledger.entries.some(e=>e.key===key&&['sent','suppressed'].includes(e.status)))return outcome('WAIT','current_milestone_already_handled',{expiresAt});
  if(ledger.entries.some(e=>e.key===key&&e.status==='failed'))return outcome('BLOCKED','failed_delivery_needs_review');
  const channel=(campaign.preferredChannels||[]).find(ch=>allowed.includes(ch));
  if(!channel)return outcome('BLOCKED','no_preferred_authorized_channel');
  return outcome('DRAFT','eligible_preview',{key,channel,milestone:m.id,topic:m.topic,cta:m.cta,expiresAt,skippedMilestones:due.slice(0,-1).map(m=>m.id),requiresAtomicReservation:true,requiresSuppressionRecheck:true});
}
module.exports={plan,addMonths,validateCampaign};
