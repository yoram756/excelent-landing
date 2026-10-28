// n8n Code node. Runs only after a confirmed create, never on an update or a replay.
// The source config supplies the sole internal recipient and Cosend connection.
// This prepares a strict request only; it does not grant send permission or a service window.
const K=__INTAKE__, config=K.internalAlert;
const saved=$('Check save').first().json, lead=$('Validate').first().json;
if(!config||saved.saved!==true||saved.mode!=='create'||lead.ok!==true||lead.duplicate!==false)return [];
if(!/^[1-9]\d*$/.test(String(saved.request_id||''))||!/^[A-Za-z0-9_-]{8,80}$/.test(lead.eventId||lead.key||''))throw Error('Internal alert requires a verified item and event');
const clean=value=>String(value||'לא צוין').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,200);
const mondayUrl=config.mondayBaseUrl+'/boards/'+K.board+'/pulses/'+saved.request_id;
const body=$('Lead webhook').first().json.body||{};
const utmCampaign=lead.utm_campaign||body.utm_campaign||'';
const utmSource=lead.utm_source||body.utm_source||'';
if([utmCampaign,utmSource].some(x=>typeof x!=='string'||x.length>100||/[\u0000-\u001f\u007f<>{}]/.test(x)))throw Error('Invalid alert attribution');
const campaign=utmCampaign||lead.campaign;
const source=[utmSource||lead.source,campaign].filter(Boolean).join(' / ');
const variables=[clean(lead.name),clean(lead.phoneLocal),clean(source),clean(lead.score?.label+' ('+lead.score?.score+')'),clean(lead.labels?.ask),mondayUrl];
const eventId=lead.eventId||body.event_id||lead.key,itemId=String(saved.request_id),dedupKey='internal-lead:'+K.board+':'+saved.request_id+':'+config.to;
const alertText=['ליד חדש','שם: '+clean(lead.name),'טלפון: '+clean(lead.phoneLocal),'קמפיין: '+clean(source),'Monday: '+mondayUrl].join('\n');
return [{json:{provider:'cosend',to:config.to,from:config.from,variables,eventId,itemId,dedupKey,alertText,request:{method:'POST',url:config.apiBaseUrl+'/v1/messages',headers:{'Idempotency-Key':dedupKey},body:{connection_id:config.connectionId,to:config.to,type:'text',text:{body:alertText},source:'api',send_mode:'strict',metadata:{event_id:eventId,monday_item_id:itemId}}}}}];
