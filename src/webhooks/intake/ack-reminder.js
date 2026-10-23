// Per-item acknowledgment of a confirmed Monday internal notification.
const planned=$('Pick overdue').item.json;
if($json.errors?.length||!$json.data?.create_notification?.text)throw Error('Internal notification not confirmed; keep eligible for retry');
if(!planned.item||!planned.reminderKey)throw Error('Missing reminder ownership');
const sd=$getWorkflowStaticData('global');sd.reminded=sd.reminded||{};
sd.reminded[planned.reminderKey]=Date.now();
for(const [k,t]of Object.entries(sd.reminded))if(Date.now()-Number(t)>7*86400000)delete sd.reminded[k];
return {json:{...planned,notificationConfirmed:true}};
