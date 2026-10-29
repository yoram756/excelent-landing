// Controlled synthetic CAPI probe. Not a production lead dispatcher.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const {postEvent}=require('../src/integrations/meta-capi/client');
function buildTestRequest({item,boardId,eventColumn,datasetId,graphVersion='v26.0',testCode,crmName='Monday',now=Date.now()}){
  if(!/^\d{8,20}$/.test(String(datasetId))||!/^v\d{1,3}\.\d+$/.test(graphVersion))throw Error('Invalid CAPI destination');
  if(!/^TEST[A-Z0-9]{1,80}$/.test(testCode||''))throw Error('A current Meta test event code is required');
  if(typeof crmName!=='string'||!crmName.trim()||crmName.length>100||/[\u0000-\u001f]/.test(crmName))throw Error('Invalid CRM event source');
  if(!item||!/^TEST(?:\s|_|-)/.test(item.name||'')||String(item.board?.id)!==String(boardId)||item.state!=='active')throw Error('An active TEST item on the configured board is required');
  const matches=item.column_values?.filter(c=>c.id===eventColumn)||[];
  if(matches.length!==1)throw Error('One stored Monday event identifier is required');
  let eventId;try{eventId=JSON.parse(matches[0].value);}catch{throw Error('Unverified stored event identifier');}
  if(typeof eventId!=='string'||!/^TEST-[A-Za-z0-9_-]{8,90}$/.test(eventId)||matches[0].text!==eventId)throw Error('Stored event identifier must match its readback exactly');
  if(!Number.isFinite(now)||now<1577836800000)throw Error('Invalid event time');
  // These are synthetic subjects derived from the TEST event, never CRM contact
  // fields. opt_out avoids ad-delivery optimization; it is not an attribution
  // exclusion guarantee. Test Events visibility still requires independent UI proof.
  const user_data={external_id:[hash('TEST:'+eventId)],em:[hash('meta-capi-'+hash(eventId).slice(0,16)+'@example.invalid')]};
  return {endpoint:'https://graph.facebook.com/'+graphVersion+'/'+datasetId+'/events',body:{test_event_code:testCode,data:[{event_name:'Lead',event_time:Math.floor(now/1000),event_id:eventId,action_source:'system_generated',custom_data:{event_source:'crm',lead_event_source:crmName},opt_out:true,user_data}]}};
}
async function sendTestOnce(options,{transport=fetch,claim}={}){
  const request=buildTestRequest(options),token=options.accessToken;
  if(typeof token!=='string'||!token.trim()||/[\s\u0000-\u001f]/.test(token))throw Error('A scoped CAPI access token is required');
  if(options.testCode==='TESTPREVIEW'||typeof claim!=='function')throw Error('A verified test code and durable one-attempt claim are required');
  const eventId=request.body.data[0].event_id;
  await claim({eventId,datasetId:String(options.datasetId),eventName:'Lead',attemptedAt:new Date().toISOString(),automaticRetry:false});
  const base={scope:'Meta API acceptance only; Test Events receipt must be verified separately',eventId,eventName:'Lead',automaticRetry:false,metaTestEventsStatus:'NOT TESTED'};
  return {...base,...await postEvent({datasetId:options.datasetId,graphVersion:options.graphVersion||'v26.0',event:request.body.data[0],testCode:options.testCode,accessToken:token,transport})};
}
async function main(){
  const args=process.argv.slice(2),send=args.includes('--send'),preview=args.includes('--preview');
  if(send===preview||args.some(a=>!['--send','--preview'].includes(a)&&!a.startsWith('--item=')))throw Error('Use --preview or --send --item=<fresh-private-Monday-readback.json>');
  const root=path.resolve(__dirname,'..'),K=require('../src/webhooks/intake/source').intakeConfig(process.env.CAMPAIGN||'refi');
  const input=args.find(a=>a.startsWith('--item='))?.slice(7);let item;
  if(send){
    if(!input)throw Error('Live send requires a fresh independent Monday readback');
    const readback=JSON.parse(fs.readFileSync(input,'utf8')),age=Date.now()-Date.parse(readback.observedAt);
    if(readback.source!=='monday_api_readback'||!Number.isFinite(age)||age<0||age>600000)throw Error('Monday readback is missing or stale');item=readback.item;
  }else item={id:'LOCAL-PREVIEW',name:'TEST CAPI local preview',state:'active',board:{id:String(K.board)},column_values:[{id:K.columns.eventId,text:'TEST-META-CAPI-LOCAL-PREVIEW',value:JSON.stringify('TEST-META-CAPI-LOCAL-PREVIEW')}]};
  const options={item,boardId:K.board,eventColumn:K.columns.eventId,datasetId:process.env.META_CAPI_DATASET_ID,graphVersion:process.env.META_CAPI_GRAPH_VERSION||'v26.0',testCode:process.env.META_CAPI_TEST_EVENT_CODE||(preview?'TESTPREVIEW':''),accessToken:process.env.META_CAPI_ACCESS_TOKEN};
  if(preview){const r=buildTestRequest(options);console.log(JSON.stringify({status:'PASS',scope:'Local payload preview only; no network',endpoint:r.endpoint,eventId:r.body.data[0].event_id,eventName:'Lead',eventCount:1,storedColumn:K.columns.eventId,syntheticUserDataOnly:true}));return;}
  const dir=path.join(root,'tests/out/meta-capi-attempts');fs.mkdirSync(dir,{recursive:true});
  const key=hash(String(options.datasetId)+':Lead:'+JSON.parse(item.column_values.find(c=>c.id===K.columns.eventId)?.value||'null'));
  const receipt=await sendTestOnce(options,{claim:r=>fs.writeFileSync(path.join(dir,key+'.attempt.json'),JSON.stringify(r,null,2),{flag:'wx'})});
  fs.writeFileSync(path.join(dir,key+'.receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt));if(!receipt.apiAccepted)process.exitCode=1;
}
module.exports={buildTestRequest,sendTestOnce};
if(require.main===module)main().catch(()=>{console.error(JSON.stringify({status:'BLOCKED',message:'CAPI preflight or one-attempt guard failed. Verify the private credentials, test code and fresh TEST readback; do not repeat an ambiguous attempt.'}));process.exitCode=1;});
