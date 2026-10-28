// An accepted API response is not a delivery receipt. Do not release the atomic
// claim on rejection, timeout or an ambiguous response; reconcile manually.
const response=$input.first().json;
if(response.object!=='message'||typeof response.id!=='string'||!response.id.startsWith('msg_')||response.direction!=='outbound')throw Error('Internal alert delivery unconfirmed; reservation retained, do not retry blindly');
const alert=$('WhatsApp recipients').first().json;
if(response.connection_id!==alert.request.body.connection_id)throw Error('Internal alert delivery unconfirmed for this connection');
return [{json:{accepted:true,delivered:false,messageId:response.id,to:alert.to,itemId:alert.itemId,eventId:alert.eventId}}];
