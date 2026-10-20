// Builds the n8n workflow JSON files from the Code node sources in this folder.
// Usage: node automation/funnel/build-workflows.js <test|live>
// The test webhook paths are placeholders (__TEST_PATH__) filled in at deploy time, so no secret lands in git.
const fs=require('fs');const path=require('path');const crypto=require('crypto');
const MODE=process.argv[2]||'test';if(!['test','live'].includes(MODE))throw new Error('mode must be test or live');
const GO_LIVE=process.argv[3]||'2026-10-20T07:00:00Z';
const D=__dirname;const src=f=>fs.readFileSync(path.join(D,f),'utf8');
// Deterministic ids, so rebuilding does not change the committed files.
let seq=0;const id=()=>{const h=crypto.createHash('sha1').update(MODE+':'+(seq++)).digest('hex');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20,32);};
const BOARD='5106246268';
const MON={mondayComApi:{id:'Un7HBqZvldpVYUaB',name:'Monday.com account'}};
const GAM={httpHeaderAuth:{id:'6hr28GsvQQrGzjwx',name:'Header Auth account'}};
const GMAIL={gmailOAuth2:{id:'1H4YGm5Z2UFN4IeE',name:'Gmail account'}};
const monday=(name,pos,body,extra={})=>({id:id(),name,type:'n8n-nodes-base.httpRequest',typeVersion:4.2,position:pos,credentials:MON,retryOnFail:true,maxTries:3,waitBetweenTries:2000,...extra,parameters:{method:'POST',url:'https://api.monday.com/v2',authentication:'predefinedCredentialType',nodeCredentialType:'mondayComApi',sendHeaders:true,headerParameters:{parameters:[{name:'API-Version',value:'2024-10'}]},sendBody:true,specifyBody:'json',jsonBody:body,options:{}}});
// GraphQL braces are spaced out: n8n expressions break on runs of closing braces.
const gq=q=>q.replace(/\{/g,'{ ').replace(/\}/g,' }');
const itemsQuery=cols=>JSON.stringify({query:gq('query{me{id} boards(ids:['+BOARD+']){items_page(limit:500){items{id name created_at column_values(ids:'+JSON.stringify(cols)+'){id text value}}}}}')});
const update=ref=>'={{ JSON.stringify({query:"mutation($b:ID!,$i:ID!,$v:JSON!){ change_multiple_column_values(board_id:$b,item_id:$i,column_values:$v,create_labels_if_missing:true){ id } }",variables:{b:"'+BOARD+'",i:String('+ref+'.itemId),v:'+ref+'.colsJson}}) }}';
const notify=ref=>'={{ JSON.stringify({query:"mutation($u:ID!,$t:ID!,$x:String!,$i:ID!,$b:String!){ create_notification(user_id:$u,target_id:$t,text:$x,target_type:Project){ text } create_update(item_id:$i,body:$b){ id } }",variables:{u:String('+ref+'.meId),t:String('+ref+'.itemId),x:'+ref+'.notifyText,i:String('+ref+'.itemId),b:'+ref+'.notifyText}}) }}';
const code=(name,pos,js,mode)=>({id:id(),name,type:'n8n-nodes-base.code',typeVersion:2,position:pos,parameters:mode?{mode,jsCode:js}:{jsCode:js}});
const ifTrue=(name,pos,expr,type='n8n-nodes-base.if')=>({id:id(),name,type,typeVersion:2,position:pos,parameters:{conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'loose'},conditions:[{id:id(),leftValue:expr,rightValue:true,operator:{type:'boolean',operation:'true',singleValue:true}}],combinator:'and'},options:{}}});
const hook=(name,pos,p,method='POST',responseMode='onReceived')=>({id:id(),name,type:'n8n-nodes-base.webhook',typeVersion:2,position:pos,webhookId:id(),parameters:{httpMethod:method,path:p,responseMode,options:{}}});
const L=(...names)=>({main:names.map(n=>n?[{node:n,type:'main',index:0}]:[])});
const tag=MODE==='live'?'':' (מצב בדיקה)';

// 1. Engine
const engineCols=['refi_phone','refi_stage','refi_meeting','boolean_mm88mzry','boolean_mm8848pn','long_text_mm88pfdv','numeric_mm883h9v','fn_status','fn_path','fn_step','fn_next','fn_last','fn_token','fn_opens'];
const engine={name:'משפך מחזור: מנוע הודעות'+tag,settings:{executionOrder:'v1',timezone:'Asia/Jerusalem'},nodes:[
 {id:id(),name:'Every 5 min',type:'n8n-nodes-base.scheduleTrigger',typeVersion:1.2,position:[0,0],parameters:{rule:{interval:[{field:'minutes',minutesInterval:5}]}}},
 hook('Run test',[0,200],'__TEST_PATH__engine'),
 {id:id(),name:'Shabbat',type:'n8n-nodes-base.httpRequest',typeVersion:4.2,position:[200,0],onError:'continueRegularOutput',parameters:{method:'GET',url:'https://www.hebcal.com/shabbat?cfg=json&geonameid=281184&M=on',options:{timeout:10000}}},
 monday('Items',[400,0],itemsQuery(engineCols)),
 {id:id(),name:'Convos',type:'n8n-nodes-base.httpRequest',typeVersion:4.2,position:[600,0],onError:'continueRegularOutput',credentials:GAM,parameters:{method:'GET',url:'https://api.gambot.co.il/api/v1/conversations?pageNumber=1&pageSize=100',authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',options:{timeout:20000}}},
 code('Plan',[800,0],src('plan.js').replace('__MODE__',MODE).replace('__GO_LIVE__',GO_LIVE)),
 ifTrue('Has send?',[1000,0],'={{ $json.hasSend }}'),
 ifTrue('Live?',[1200,-100],'={{ $json.live }}'),
 {id:id(),name:'Send WhatsApp',type:'n8n-nodes-base.httpRequest',typeVersion:4.2,position:[1400,-200],onError:'continueRegularOutput',credentials:GAM,parameters:{method:'POST',url:'https://api.gambot.co.il/api/v1/messages/send-template',authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',sendBody:true,specifyBody:'json',jsonBody:'={{ JSON.stringify($json.send) }}',options:{response:{response:{neverError:true}},timeout:30000,batching:{batch:{batchSize:1,batchInterval:1500}}}}},
 code('Simulated send',[1400,0],"return {json:{success:true,simulated:true,templateId:$json.send.templateId,to:$json.send.to}};",'runOnceForEachItem'),
 code('After send',[1600,-100],src('after-send.js'),'runOnceForEachItem'),
 monday('Update item (sent)',[1800,-100],update('$json')),
 monday('Update item',[1200,150],update("$('Has send?').item.json")),
 ifTrue('Notify?',[1400,150],"={{ $('Has send?').item.json.hasNotify }}",'n8n-nodes-base.filter'),
 monday('Notify Yoram',[1600,150],notify("$('Has send?').item.json"))],
 connections:{'Every 5 min':L('Shabbat'),'Run test':L('Shabbat'),'Shabbat':L('Items'),'Items':L('Convos'),'Convos':L('Plan'),'Plan':L('Has send?'),'Has send?':L('Live?','Update item'),'Live?':L('Send WhatsApp','Simulated send'),'Send WhatsApp':L('After send'),'Simulated send':L('After send'),'After send':L('Update item (sent)'),'Update item':L('Notify?'),'Notify?':L('Notify Yoram')}};

// 2. Personal links (go)
const goCols=['refi_phone','fn_token','fn_step','fn_opens','numeric_mm883h9v','fn_path'];
const go={name:'משפך מחזור: קישורים אישיים (go)',settings:{executionOrder:'v1'},nodes:[
 hook('Link',[0,0],'go','GET','responseNode'),
 monday('Items',[200,0],itemsQuery(goCols),{onError:'continueRegularOutput'}),
 code('Resolve',[400,0],src('go.js')),
 {id:id(),name:'Redirect',type:'n8n-nodes-base.respondToWebhook',typeVersion:1.1,position:[600,0],parameters:{respondWith:'redirect',redirectURL:'={{ $json.url }}',options:{responseCode:302}}},
 ifTrue('Found?',[800,0],"={{ $('Resolve').item.json.found }}",'n8n-nodes-base.filter'),
 monday('Update opens',[1000,0],update("$('Resolve').item.json")),
 ifTrue('Hot?',[1200,0],"={{ $('Resolve').item.json.notify }}",'n8n-nodes-base.filter'),
 monday('Notify Yoram',[1400,0],notify("$('Resolve').item.json"))],
 connections:{'Link':L('Items'),'Items':L('Resolve'),'Resolve':L('Redirect'),'Redirect':L('Found?'),'Found?':L('Update opens'),'Update opens':L('Hot?'),'Hot?':L('Notify Yoram')}};

// 3. Calendly bookings from the office mailbox
const calCols=['refi_phone','fn_email'];
const cal={name:'משפך מחזור: פגישות מ Calendly',settings:{executionOrder:'v1',timezone:'Asia/Jerusalem'},nodes:[
 {id:id(),name:'Every 5 min',type:'n8n-nodes-base.scheduleTrigger',typeVersion:1.2,position:[0,0],parameters:{rule:{interval:[{field:'minutes',minutesInterval:5}]}}},
 {id:id(),name:'Calendly mails',type:'n8n-nodes-base.gmail',typeVersion:2.1,position:[200,0],credentials:GMAIL,onError:'continueRegularOutput',alwaysOutputData:true,parameters:{resource:'message',operation:'getAll',returnAll:false,limit:20,simple:false,filters:{q:'from:notifications@calendly.com newer_than:2d'},options:{}}},
 hook('Run test',[0,200],'__TEST_PATH__calendly'),
 monday('Items',[400,0],itemsQuery(calCols),{executeOnce:true}),
 code('Match bookings',[600,0],src('calendly.js')),
 ifTrue('Matched?',[800,0],'={{ $json.matched }}'),
 monday('Update lead',[1000,-100],update('$json')),
 monday('Create lead',[1000,100],'={{ JSON.stringify({query:"mutation($b:ID!,$g:String!,$n:String!,$v:JSON!){ create_item(board_id:$b,group_id:$g,item_name:$n,column_values:$v,create_labels_if_missing:true){ id } }",variables:{b:"'+BOARD+'",g:"group_mm883gr6",n:($json.name||"פגישה מהיומן"),v:JSON.stringify(Object.assign(JSON.parse($json.colsJson),{refi_phone:$json.phone?{phone:$json.phone,countryShortName:"IL"}:undefined,refi_source:{label:"יומן"}}))}}) }}')],
 connections:{'Every 5 min':L('Calendly mails'),'Calendly mails':L('Items'),'Run test':L('Items'),'Items':L('Match bookings'),'Match bookings':L('Matched?'),'Matched?':L('Update lead','Create lead'),'Create lead':L('Wait for board automation'),'Wait for board automation':L('Set meeting stage')}};
// A board automation sets new items to "ליד חדש"; set the meeting stage again after it ran.
cal.nodes.push({id:id(),name:'Wait for board automation',type:'n8n-nodes-base.wait',typeVersion:1.1,position:[1200,100],webhookId:id(),parameters:{amount:15,unit:'seconds'}});
cal.nodes.push(monday('Set meeting stage',[1400,100],'={{ JSON.stringify({query:"mutation($b:ID!,$i:ID!,$v:JSON!){ change_multiple_column_values(board_id:$b,item_id:$i,column_values:$v,create_labels_if_missing:true){ id } }",variables:{b:"'+BOARD+'",i:String($json.data.create_item.id),v:JSON.stringify({refi_stage:JSON.parse($(\'Match bookings\').item.json.colsJson).refi_stage})}}) }}'));

// Final guard: no run of two closing braces inside an expression body.
for(const w of [engine,go,cal])for(const n of w.nodes){const b=n.parameters.jsonBody;if(typeof b==='string'&&b.startsWith('={{')){let inner=b.slice(3,-2);while(/\}\}/.test(inner))inner=inner.replace(/\}\}/g,'} }');n.parameters.jsonBody='={{'+inner+'}}';}}
const out=path.join(D,'dist');fs.mkdirSync(out,{recursive:true});
for(const [f,w] of [['engine-'+MODE+'.json',engine],['go.json',go],['calendly.json',cal]])fs.writeFileSync(path.join(out,f),JSON.stringify(w,null,1));
console.log('built',MODE,fs.readdirSync(out).join(' '));
