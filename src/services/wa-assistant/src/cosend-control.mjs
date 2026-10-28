// Native Cosend v1 control adapter. Not imported by the isolated HTTP server.
// No credential discovery, no connection changes, no lock takeover, no sends.
import binding from '../config/provider.json' with {type:'json'};
const safeId=id=>{if(typeof id!=='string'||!/^\w{3,160}$/.test(id))throw Error('invalid_resource_id');return id;};
export function cosendControl(apiKey,{fetchImpl=fetch,writesApproved=false,expectedPhone}={}){
  if(!apiKey)throw Error('approved_connection_credential_required');
  // The application supplies this from config/business.json. No copied phone
  // number or business identity lives inside the reusable transport module.
  if(!/^\+?9725\d{8}$/.test(expectedPhone||''))throw Error('expected_business_phone_required');
  expectedPhone='+'+expectedPhone.replace(/^\+/,'');
  let verified=false,liveCredential=false,scopes=new Set();
  async function request(path,method='GET',body){
    if(method!=='GET'&&(!verified||!liveCredential||!scopes.has('messages:write')||!writesApproved))throw Error('conversation_write_not_approved');
    const response=await fetchImpl(binding.apiBaseUrl+path,{method,redirect:'error',signal:AbortSignal.timeout(8000),headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
    if(!response.ok)throw Error('cosend_control_http_'+response.status);
    return response.json();
  }
  const requireScope=scope=>{if(!verified||!scopes.has(scope))throw Error('verified_scope_required_'+scope);};
  const scoped=c=>{if(c?.connection_id!==binding.connectionId)throw Error('conversation_scope_mismatch');return c;};
  return {
    async verify(){
      // Fail closed on refresh failures instead of retaining stale authorization.
      verified=false;liveCredential=false;scopes=new Set();
      const me=await request('/v1/me');
      const c=me.credential;
      if(me.organization?.id!==binding.organizationId||c?.kind!=='connection'||c.connection_ids?.length!==1||c.connection_ids[0]!==binding.connectionId||c.connection_id!==binding.connectionId||!Array.isArray(c.scopes))throw Error('credential_scope_mismatch');
      if(c.scopes.some(s=>s==='*'||/^(keys|connections):write$|^runtime:proxy$/.test(s)))throw Error('excessive_credential_scope');
      if(!c.scopes.includes('connections:read'))throw Error('verified_scope_required_connections:read');
      const number=await request('/v1/connections/'+binding.connectionId);
      if(number.id!==binding.connectionId||number.phone_number_id!==binding.phoneNumberId||number.meta_waba_id!==binding.wabaId||number.status!=='active'||number.mode!=='coexistence'||number.phone_e164!==expectedPhone||number.delivery_mode!=='stored')throw Error('number_binding_mismatch');
      scopes=new Set(c.scopes);liveCredential=c.is_live===true;verified=true;return {verified:true,liveCredential,scopes:[...scopes]};
    },
    async preflight({conversationId,latestResourceId,locallySuppressed=false}){
      requireScope('messages:read');requireScope('contacts:read');
      if(locallySuppressed)return false;
      const path='/v1/conversations/'+safeId(conversationId),c=scoped(await request(path));
      if(c.control!=='bot'||c.window?.can_send_freeform!==true||c.lock?.can_i_send!==true||c.contact?.is_blocked!==false||c.last_message?.id!==latestResourceId||c.last_message?.direction!=='inbound')return false;
      const consent=await request('/v1/contacts/'+safeId(c.contact.id)+'/consent');
      if(consent.meta_marketing_opt_out===true)return false;
      // Require documented consent output rather than treating missing data as approval.
      if(!consent.categories||typeof consent.categories!=='object')return false;
      // Acquire only a permitted bot lock and re-read after acquisition. The
      // provider strict send mode remains the final race guard.
      await request(path+'/lock','POST',{});
      const fresh=scoped(await request(path));
      return fresh.control==='bot'&&fresh.window?.can_send_freeform===true&&fresh.lock?.can_i_send===true&&fresh.last_message?.id===latestResourceId&&fresh.last_message?.direction==='inbound'&&fresh.contact?.is_blocked===false;
    },
    async handoff(conversationId,{assigneeId,assigneeVerified=false}={}){
      requireScope('messages:read');
      if(!assigneeVerified)throw Error('verified_workspace_assignee_required');
      safeId(assigneeId);const path='/v1/conversations/'+safeId(conversationId);
      scoped(await request(path));
      // Stop bot control first. Partial failure leaves human control requested,
      // never releases it or promises that a representative has read the case.
      await request(path+'/control','POST',{control:'pending_human',reason:'Customer needs an Excellent representative'});
      await request(path,'PATCH',{state:'pending',assignee_id:assigneeId});
      const c=scoped(await request(path));
      if(!['pending_human','human'].includes(c.control)||c.state!=='pending'||c.assignee_id!==assigneeId)throw Error('handoff_readback_unconfirmed');
      return {confirmed:true,conversationId,assigneeId,representativeRead:false};
    }
  };
}
