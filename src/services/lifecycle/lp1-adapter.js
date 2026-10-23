// Internal, explicit adapter for the server-side Validate output. Not a public
// endpoint, authentication mechanism, migration tool or permission to dispatch.
const CHANNELS=['whatsapp','email','sms'];
const phone=v=>typeof v==='string'?v.replace(/[\s()+-]/g,'').replace(/^0/,'972'):'';
const email=v=>v==null?'':typeof v==='string'?v.trim().toLowerCase():null;
const date=v=>{if(typeof v!=='string'||!Number.isFinite(Date.parse(v)))throw Error('Invalid server receipt time');return new Date(v).toISOString();};
function adapt(validated,{campaign,now}){
 if(campaign?.id!=='refi'||validated?.ok!==true||validated.duplicate!==false||validated.product!=='LP1'||validated.channel!=='טופס')throw Error('Explicit LP1 refinance intake required');
 const p=validated.contact_permissions;
 if(p?.version!=='lp1-channels-20261020'||p.source!=='LP1 callback form'||! /^[A-Za-z0-9-]{8,80}$/.test(validated.key||'')||p.requestId!==validated.key)throw Error('Modern bound LP1 receipt required');
 const receivedAt=date(p.receivedAt),at=date(now);
 if(receivedAt>at)throw Error('Server receipt is in the future');
 const recipientPhone=phone(validated.phone),recipientEmail=email(validated.email);
 if(!/^9725\d{8}$/.test(recipientPhone)||phone(p.phone)!==recipientPhone||recipientEmail===null||recipientEmail!==email(p.email)||recipientEmail&&(recipientEmail.length>254||! /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(recipientEmail)))throw Error('LP1 recipient binding mismatch');
 if(!p.grants||Object.keys(p.grants).length!==3||CHANNELS.some(ch=>typeof p.grants[ch]!=='boolean')||Object.keys(p.grants).some(ch=>!CHANNELS.includes(ch))||typeof validated.marketing_consent!=='boolean'||p.grants.whatsapp!==validated.marketing_consent||p.grants.email&&!recipientEmail)throw Error('Explicit independent channel grants required');
 // The 80-character incoming request id is hashed, not truncated. Names, free
 // text, financial answers and unverified client attribution are not copied.
 const digest=require('node:crypto').createHash('sha256').update('LP1\0'+p.requestId).digest('hex');
 return {eventId:'lp1_'+digest,campaign,now:at,enrolledAt:receivedAt,attribution:{source:'lp1'},receipt:{version:'lifecycle-consent-v1',campaignId:'refi',receivedAt,recipients:{phone:recipientPhone,email:recipientEmail||null},grants:Object.fromEntries(CHANNELS.map(ch=>[ch,p.grants[ch]])),origin:{version:p.version,source:p.source,requestId:p.requestId}},dispatchEnabled:false};
}
module.exports={adapt};
