// Future transport only. The isolated server does not import this module.
import {CONNECTION} from './broker.mjs';
export function cosendTransport(apiKey,{fetchImpl=fetch}={}){
  if(!apiKey)throw new Error('existing_approved_connection_key_required');
  return {async send(o){
    let response;
    try{response=await fetchImpl('https://api.cosend.app/v1/messages',{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':o.id},body:JSON.stringify({connection_id:CONNECTION,conversation_id:o.conversation,type:'text',text:{body:o.reply},source:'api',send_mode:'strict',metadata:{excelent_outbox_id:o.id}})});}catch{return {uncertain:true};}
    // No automatic fallback template and no re-send of ambiguous errors.
    if(response.status===429)return {status:429,accepted:false,retryAfterMs:Number(response.headers.get('retry-after')||30)*1000};
    if(response.status>=500)return {status:response.status,uncertain:true};
    let body;try{body=await response.json();}catch{return {uncertain:true,status:response.status};}
    const accepted=response.status===201&&typeof body.id==='string'&&body.id.length>0;
    // Any unexpected 2xx may already have produced a send. Keep the conversation
    // blocked pending reconciliation instead of treating that response as rejection.
    if(response.status>=200&&response.status<300&&!accepted)return {status:response.status,uncertain:true};
    return {status:response.status,accepted,id:accepted?body.id:undefined};
  }};
}
