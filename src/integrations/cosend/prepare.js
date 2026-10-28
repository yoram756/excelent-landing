const crypto=require('node:crypto');
function verify(raw,header,secret,now=Date.now()){
 if(!Buffer.isBuffer(raw)||!secret||typeof header!=='string')return false;
 const fields=header.split(',').map(s=>s.trim().split('=')),ts=fields.filter(([k])=>k==='t');
 if(ts.length!==1||!/^\d+$/.test(ts[0][1]))return false;
 const t=ts[0][1];if(Math.abs(now-Number(t)*1000)>300000)return false;
 const expected=crypto.createHmac('sha256',secret).update(t+'.').update(raw).digest();
 return fields.some(([k,v])=>k==='v1'&&/^[a-f0-9]{64}$/.test(v||'')&&crypto.timingSafeEqual(expected,Buffer.from(v,'hex')));
}
function route(e,s){
 if(!s?.organizationId||!s?.connectionId)throw Error('verified scope required');
 if(!e||e.object!=='event'||!e.id||e.organization_id!==s.organizationId||e.connection_id!==s.connectionId)throw Error('event scope mismatch');
 const routes={'message.received':'intake-review','message.status':'delivery-review','message.echo':'human-reply-review'};
 return {eventId:e.id,route:routes[e.type]||'ignore',mayCreateLead:false,maySend:false,reason:routes[e.type]?'verified resource sample and consent mapping pending':'not a live message event'};
}
module.exports={verify,route};
