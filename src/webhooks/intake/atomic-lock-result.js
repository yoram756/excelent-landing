// n8n Code node: an unverified, expired or failed admission can never reach CRM.
const lead=$('Validate').first().json;
const response=$input.first().json;
const body=response?.body;
const verified=response?.statusCode===200 && !response.error && body && !body.error &&
  typeof body.locked==='boolean' && body.phone===lead.phone &&
  Number.isFinite(Date.parse(body.lockedUntil)) && Date.parse(body.lockedUntil)>Date.now();
if(verified && body.locked===true)return [{json:lead}];
const duplicate=verified && body.locked===false;
return [{json:{
  status:duplicate?409:503,
  body:{ok:false,pending:true,error:duplicate?'duplicate_pending':'lock_unavailable'},
  __centralFailure:{code:duplicate?'duplicate_lead':'provider_error',
    message:duplicate?'Atomic lead lock already held':'Atomic lead lock admission not verified',
    httpStatus:duplicate?409:503,itemId:null}
}}];
