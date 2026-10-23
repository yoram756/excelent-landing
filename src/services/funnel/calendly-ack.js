// Acknowledge only after the final Monday write. This cache is not a durable lock.
const r=$json||{};
const id=r.data?.change_multiple_column_values?.id;
if(r.errors?.length||!id)throw new Error('Calendly write not confirmed; mail remains retryable');
const mail=$('Match bookings').item.json;
if(mail.itemId&&String(id)!==String(mail.itemId))throw new Error('Calendly write target mismatch');
const sd=$getWorkflowStaticData('global');sd.seen=sd.seen||{};sd.seen[mail.mailId]=Date.now();
return {json:{saved:true,itemId:String(id),mailId:mail.mailId}};
