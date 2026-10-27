// Pure central-error contract. No transport, credentials, filesystem or implicit item lookup.
const id=x=>typeof x==='string'&&/^[1-9]\d{0,18}$/.test(x)?x:null;
const clean=(x,max=2000)=>String(x??'').replace(/Bearer\s+[^\s"'<>]+/gi,'Bearer [REDACTED]').replace(/EAA[A-Za-z0-9]{30,}/g,'[REDACTED]').replace(/((?:access_token|api_key|token|authorization)["']?\s*[:=]\s*["']?)[^\s"'&,<>]+/gi,'$1[REDACTED]').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').slice(0,max);
const gql=s=>s.replace(/\{/g,'{ ').replace(/\}/g,' }');
const hash=s=>{let n=2166136261;for(const c of s){n^=c.charCodeAt(0);n=Math.imul(n,16777619);}return(n>>>0).toString(36);};
const classify=(r,{provider=false}={})=>{
 if(!r||typeof r!=='object')return null;
 if(r.__centralFailure)return r.__centralFailure;
 if(r.body&&typeof r.body==='object')r={...r,...r.body};
 if(r.duplicate===true)return {code:'duplicate_lead',message:'Duplicate lead execution stopped',httpStatus:200};
 const raw=r.error;
 const status=Number(r.statusCode||r.httpCode||r.status||r.error?.httpCode||r.error?.statusCode||(/^\d{3}\b/.exec(raw?.message||'')||[])[0]);
 const key=typeof raw==='string'?raw:String(raw?.code||'');
 if(status===429||['4','17','32','613','80007','130429'].includes(key))return {code:'api_rate_limit',message:'API rate limit reached',httpStatus:429};
 if([401,403].includes(status)||['190','key','bad_body','bad_key','bad_event_id','rejected','unknown_campaign','conflicting_product','idempotency_unverified','idempotency_conflict','idempotency_mismatch','idempotency_store_invalid'].includes(key))return {code:'security_violation',message:clean(typeof raw==='string'?raw:raw?.message||'Security guard rejected execution'),httpStatus:status>=400&&status<600?status:403};
 if(Array.isArray(r.errors)&&r.errors.length){
  const rate=r.errors.some(e=>/rate|complexity|limit|budget/i.test(String(e.extensions?.code||e.extensions?.error_code||e.message||'')));
  return {code:rate?'api_rate_limit':'provider_error',message:rate?'API rate limit reached':'Provider returned GraphQL errors',httpStatus:rate?429:502};
 }
 if(raw&&(provider||typeof raw==='object'))return {code:'provider_error',message:clean(typeof raw==='string'?raw:raw.message||'Provider request failed'),httpStatus:502};
 return null;
};
function prepare(input,{campaign:c,global:g,state,selfId,now}){
 const wf=input?.workflow||{},ex=input?.execution||{},err=ex.error||input?.trigger?.error||{};
 const wfId=String(wf.id||'');
 if(!Object.values(g.bindings).includes(wfId)||wfId===String(selfId)||wfId===String(g.workflowId))return null;
 if(!err||typeof err!=='object')return null;
 const executionId=id(String(ex.id||'')),lastNode=clean(ex.lastNodeExecuted||'Trigger',200),message=clean(err.message||'Unknown workflow failure');
 // n8n's Code sandbox does not expose the browser URL constructor. Accept only the exact internal execution path.
 const expected=g.n8nBaseUrl.replace(/\/$/,'')+'/workflow/'+encodeURIComponent(wfId)+'/executions/'+executionId;
 const url=executionId&&typeof ex.url==='string'&&ex.url.split(/[?#]/,1)[0]===expected?expected:'';
 const triggerStamp=Number(err.timestamp);
 const suffix=executionId||hash(JSON.stringify([lastNode,message,Number.isFinite(triggerStamp)?triggerStamp:Math.floor(now/300000)]));
 const key='n8n-'+wfId+'-'+suffix;
 if(!state.handled||typeof state.handled!=='object'||Array.isArray(state.handled))state.handled={};
 const cutoff=now-g.retentionHours*3600000;
 for(const [k,v]of Object.entries(state.handled))if(!Number.isFinite(v?.at)||v.at<cutoff)delete state.handled[k];
 if(state.handled[key])return null;
 const metadata=err.context?.metadata;
 const trusted=lastNode===g.controlledStopNode&&metadata?.schema==='central-error-v1'&&metadata.workflowId===wfId&&String(metadata.boardId)===String(c.board)&&metadata.verifiedItem===true;
 const itemId=trusted?id(String(metadata.itemId||metadata.pulseId||'')):null;
 const workflowName=clean(wf.name||wfId,160).replace(/[\r\n]/g,' ');
 const body=['שם התהליך: '+workflowName,'מזהה התהליך: '+wfId,'הרכיב שנכשל: '+lastNode,'הודעת השגיאה: '+message,'מזהה הרצה: '+(executionId||'Trigger'),'קישור להרצה ב-n8n: '+(url||'לא זמין'),'מזהה פריט מאומת: '+(itemId||'אין')].join('\n');
 const columns={[c.columns.status]:{label:c.errorHandling.statusLabel},[c.intake.columns.eventId]:key,[c.intake.columns.answers]:{text:body}};
 if(c.intake.columns.assignee&&c.intake.assignees?.length)columns[c.intake.columns.assignee]={personsAndTeams:c.intake.assignees};
 const updateValues={[c.columns.status]:{label:c.errorHandling.statusLabel},[c.columns.next]:{}};
 return {key,workflow:{id:wfId,name:workflowName},execution:{id:executionId,url,lastNodeExecuted:lastNode,error:{message}},lastNode,message,itemId,subject:g.subjectPrefix+workflowName,body,
  lookupRequest:itemId?{query:gql('query($ids:[ID!]!){items(ids:$ids){id state board{id} column_values(ids:'+JSON.stringify([c.columns.status,c.columns.stage])+'){id text}}}'),variables:{ids:[itemId]}}:null,
  updateRequest:itemId?{query:gql('mutation($b:ID!,$i:ID!,$v:JSON!){change_multiple_column_values(board_id:$b,item_id:$i,column_values:$v,create_labels_if_missing:true){id}}'),variables:{b:String(c.board),i:itemId,v:JSON.stringify(updateValues)}}:null,
  createRequest:{query:gql('mutation($b:ID!,$g:String!,$name:String!,$vals:JSON!){create_item(board_id:$b,group_id:$g,item_name:$name,column_values:$vals,create_labels_if_missing:true){id}}'),variables:{b:String(c.board),g:c.intake.group,name:c.errorHandling.alertNamePrefix+workflowName+' '+(executionId||'Trigger'),vals:JSON.stringify(columns)}}};
}
function canUpdate(response,a,c){
 if(response?.errors?.length||!a?.itemId||!Array.isArray(response?.data?.items)||response.data.items.length!==1)return false;
 const item=response.data.items[0],cv=Object.fromEntries((item.column_values||[]).map(x=>[x.id,x.text]));
 return String(item.id)===a.itemId&&String(item.board?.id)===String(c.board)&&item.state==='active'&&Object.hasOwn(cv,c.columns.status)&&Object.hasOwn(cv,c.columns.stage)&&!c.errorHandling.protectedStatusLabels.includes(cv[c.columns.status])&&cv[c.columns.stage]!==c.stages.paid;
}
function finish(response,mail,a,state,now){
 const updated=id(String(response?.data?.change_multiple_column_values?.id||'')),created=id(String(response?.data?.create_item?.id||''));
 if(response?.errors?.length||(!created&&(!updated||updated!==a.itemId)))throw Error('Monday error handling write not confirmed');
 if(mail?.error||!mail?.id)throw Error('Error alert email not confirmed; Monday receipt exists');
 state.handled=state.handled||{};state.handled[a.key]={at:now,itemId:created||updated,mailId:String(mail.id)};
 const keys=Object.keys(state.handled).sort((x,y)=>state.handled[y].at-state.handled[x].at);
 for(const key of keys.slice(2000))delete state.handled[key];
 return {handled:true,key:a.key,itemId:created||updated,action:created?'created_alert':'stopped_item',emailAccepted:true};
}
module.exports={id,clean,classify,prepare,canUpdate,finish};
