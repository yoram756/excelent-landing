// The only CAPI HTTP transport. Callers must durably claim before calling it.
async function postEvent({datasetId,graphVersion,event,testCode,accessToken,transport=fetch}){
  if(!/^\d{8,20}$/.test(String(datasetId))||!/^v\d{1,3}\.\d+$/.test(graphVersion)||!event||!accessToken||/[\s\x00-\x1f]/.test(accessToken))throw Error('Invalid CAPI request configuration');
  if(testCode!==undefined&&!/^TEST[A-Z0-9]{1,80}$/.test(testCode))throw Error('Invalid test code');
  const payload={data:[event],...(testCode?{test_event_code:testCode}:{})};
  try{
    const r=await transport('https://graph.facebook.com/'+graphVersion+'/'+datasetId+'/events',{method:'POST',redirect:'error',headers:{'content-type':'application/json',authorization:'Bearer '+accessToken},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
    let b;try{b=await r.json();}catch{return {apiAccepted:false,httpStatus:r.status,deliveryUnknown:true,malformedResponse:true};}
    if(!b||typeof b!=='object')return {apiAccepted:false,httpStatus:r.status,deliveryUnknown:true,malformedResponse:true};
    const apiAccepted=r.status===200&&!b.error&&b.events_received===1;
    const traceId=typeof b.fbtrace_id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(b.fbtrace_id)&&!b.fbtrace_id.includes(accessToken)&&(!testCode||!b.fbtrace_id.includes(testCode))&&!b.fbtrace_id.startsWith('EAA')?b.fbtrace_id:null;
    return {apiAccepted,httpStatus:r.status,eventsReceived:Number.isInteger(b.events_received)?b.events_received:null,errorCode:Number.isInteger(b.error?.code)?b.error.code:null,errorSubcode:Number.isInteger(b.error?.error_subcode)?b.error.error_subcode:null,traceId,...(!apiAccepted&&(r.status>=500||b.events_received>0)?{deliveryUnknown:true}:{})};
  }catch{return {apiAccepted:false,httpStatus:null,deliveryUnknown:true};}
}
module.exports={postEvent};
