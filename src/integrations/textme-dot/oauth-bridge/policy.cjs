'use strict';
const {textmeToolInput,textmeReadRequest}=require('../read-policy');
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
function validateRpc(body,username){
  if(!object(body)||body.jsonrpc!=='2.0'||Object.keys(body).some(k=>!['jsonrpc','id','method','params'].includes(k)))throw Error('INVALID_RPC');
  if(body.id!==undefined&&!(typeof body.id==='string'&&body.id.length<=80||Number.isSafeInteger(body.id)))throw Error('INVALID_ID');
  if(!['initialize','notifications/initialized','ping','tools/list','tools/call'].includes(body.method))throw Error('METHOD_NOT_ALLOWED');
  const p=body.params===undefined?{}:body.params;if(!object(p))throw Error('INVALID_PARAMS');
  if(body.method==='notifications/initialized'){if(body.id!==undefined||Object.keys(p).length)throw Error('EMPTY_NOTIFICATION_REQUIRED');return {method:body.method};}
  if(body.id===undefined)throw Error('REQUEST_ID_REQUIRED');
  if(body.method==='initialize'){
    if(Object.keys(p).some(k=>!['protocolVersion','capabilities','clientInfo'].includes(k))||!/^\d{4}-\d{2}-\d{2}$/.test(p.protocolVersion)||!object(p.capabilities)||!object(p.clientInfo)||typeof p.clientInfo.name!=='string'||p.clientInfo.name.length>100||typeof p.clientInfo.version!=='string'||p.clientInfo.version.length>100)throw Error('INVALID_INITIALIZE');
  }else if(body.method==='tools/call'){
    if(Object.keys(p).some(k=>!['name','arguments'].includes(k))||p.name!=='textme_read')throw Error('TOOL_NOT_ALLOWED');
    const input=textmeToolInput(p.arguments);textmeReadRequest(input,username);return {method:body.method,operation:input.operation};
  }else if(Object.keys(p).length)throw Error('PARAMS_NOT_ALLOWED');
  return {method:body.method};
}
function toolDefinition(){return {name:'textme_read',description:'Read Excellent TextMe balance or bounded reports only. No messages, campaigns, scheduling, settings, credentials or generic HTTP.',inputSchema:{type:'object',properties:{requestJson:{type:'string',maxLength:4000,description:'JSON string: operation balance, verifiedSenders, delivery, deliveryByDate, incoming or blacklist. Date windows maximum seven days.'}},required:['requestJson'],additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:true}};}
function validateReadResult(result,operation){
  if(!object(result)||result.isError||!Array.isArray(result.content)||result.content.length!==1||result.content[0]?.type!=='text')throw Error('UPSTREAM_TOOL_ERROR');
  let data=JSON.parse(result.content[0].text);if(Array.isArray(data)&&data.length===1)data=data[0];if(data?.json)data=data.json;
  if(!object(data)||data.provider!=='TextMe'||data.operation!==operation||data.readOnly!==true||data.httpStatus!==200||data.providerStatus!==0)throw Error('UPSTREAM_PROOF_MISSING');
  const common=['provider','operation','readOnly','httpStatus','providerStatus'];
  if(operation==='balance'){
    if(!/^\d+(\.\d+)?$/.test(String(data.balance))||Object.keys(data).some(k=>![...common,'balance','internationalBalance'].includes(k)))throw Error('INVALID_BALANCE_RESULT');
  }else{
    if(!Array.isArray(data.rows)||data.rows.length>100||!Number.isSafeInteger(data.rowCount)||data.rowCount<data.rows.length||typeof data.truncated!=='boolean'||data.contentTrust!=='untrusted_provider_data'||Object.keys(data).some(k=>![...common,'rows','rowCount','truncated','contentTrust'].includes(k)))throw Error('INVALID_REPORT_RESULT');
    const keys=operation==='verifiedSenders'?['PHONE','ASSIGNMENT_DATE','LAST_UPDATE']:operation==='incoming'?['source','destination','message','date']:operation==='blacklist'?['phone','date']:['external_id','source','phone','status','message_he','en_message','shipment_id','date'];
    if(data.rows.some(r=>!object(r)||Object.keys(r).some(k=>!keys.includes(k))||Object.values(r).some(v=>typeof v!=='string'||v.length>2000)))throw Error('INVALID_REPORT_ROW');
  }
  return {content:[{type:'text',text:JSON.stringify(data)}]};
}
module.exports={validateRpc,toolDefinition,validateReadResult};
