// Builds the n8n workflow JSON files from the Code node sources in this folder.
// Usage: node src/services/funnel/build-workflows.js <test|live>
// The test webhook paths are placeholders (__TEST_PATH__) filled in at deploy time, so no secret lands in git.
const fs=require('fs');const path=require('path');const crypto=require('crypto');
// Usage: build-workflows.js test | pilot <go-live ISO> <phone,phone> | live <go-live ISO>   (env CAMPAIGN=<id>, default refi)
const CAMPAIGN=process.env.CAMPAIGN||'refi';
const CFG=JSON.parse(fs.readFileSync(path.join(__dirname,'../../config/campaigns',CAMPAIGN+'.json'),'utf8'));
const CFGS=JSON.stringify(CFG);
const BIZS=fs.readFileSync(path.join(__dirname,'../../../config/business.json'),'utf8').replace(/\r\n/g,'\n');
const MODE=process.argv[2]||'test';if(!['test','pilot','live'].includes(MODE))throw new Error('mode must be test, pilot or live');
const GO_LIVE=process.argv[3]||'2026-10-20T07:00:00Z';
const PILOT=MODE==='pilot'?(process.argv[4]||''):'';
if(MODE==='pilot'&&!/^972\d{9}(,972\d{9})*$/.test(PILOT))throw new Error('pilot needs internal phones like 9725XXXXXXXX');
// identity gate: every campaign declares its own approved identity; nothing is inherited from another campaign
const BIZ0=JSON.parse(fs.readFileSync(path.join(__dirname,'../../../config/business.json'),'utf8'));
const ID=CFG.identity;
if(!ID)throw new Error('campaign '+CFG.id+' has no identity block');
if(MODE!=='test'){
  if(ID.approved!==true)throw new Error('campaign '+CFG.id+': identity not approved by the owner, only test builds are allowed');
  const prof=BIZ0.profiles[ID.profile];if(!prof)throw new Error('unknown profile '+ID.profile);
  if(!prof.allowedContactPhones.includes(ID.contactPhone))throw new Error('contact phone not allowed for profile');
  if(MODE==='pilot'){const ok=ID.testPhones.map(k=>BIZ0.phones[k].e164);for(const ph of PILOT.split(','))if(!ok.includes(ph))throw new Error('pilot phone '+ph+' is not an approved test phone of '+CFG.id);}
}
const D=__dirname;const CRMS=require('./crm-fields').inlineSource(),CHS=require('./channels').inlineSource(),HSM=require('./meta-hsm'),HSMS=HSM.inlineSource();
// Fallback providers and drafts, inlined for the After send node (fallback.js).
const FBS=require('./fallback').bundleSource();
const src=f=>fs.readFileSync(path.join(D,f),'utf8').replace(/\r\n/g,'\n').split('__CONFIG__').join(CFGS).split('__BUSINESS__').join(BIZS).split('__CRM_FIELDS__').join(CRMS).split('__CHANNELS__').join(CHS).split('__META_HSM__').join(HSMS).split('__FALLBACK__').join(FBS).split('__TEXTME__').join(require('../sms/textme').inlineSource());
// Deterministic ids, so rebuilding does not change the committed files.
let seq=0;const id=()=>{const h=crypto.createHash('sha1').update(MODE+':'+(seq++)).digest('hex');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20,32);};
const BOARD=CFG.board;const COLS=CFG.columns;
const MON={mondayComApi:{id:'Un7HBqZvldpVYUaB',name:'Monday.com account'}};
const GAM={httpHeaderAuth:{id:'6hr28GsvQQrGzjwx',name:'Header Auth account'}};
// WhatsApp sends go to the Meta Cloud API. The phone number id and the n8n credential (header Authorization: Bearer <token>)
// come from env at build time; test builds keep a placeholder (their send nodes are disabled), pilot and live refuse to build without them.
const WA_ID=process.env.META_WA_PHONE_NUMBER_ID||'',WA_CRED=process.env.META_WA_CREDENTIAL_ID||'';
if(MODE!=='test'&&(!/^\d{6,}$/.test(WA_ID)||!WA_CRED))throw new Error('pilot and live builds need META_WA_PHONE_NUMBER_ID and META_WA_CREDENTIAL_ID');
const WA_URL=HSM.sendUrl(WA_ID);
const META=WA_CRED?{httpHeaderAuth:{id:WA_CRED,name:'Meta WhatsApp Cloud'}}:undefined;
const GMAIL={gmailOAuth2:{id:'1H4YGm5Z2UFN4IeE',name:'Gmail account'}};
const monday=(name,pos,body,extra={})=>({id:id(),name,type:'n8n-nodes-base.httpRequest',typeVersion:4.2,position:pos,credentials:MON,retryOnFail:true,maxTries:3,waitBetweenTries:2000,...extra,parameters:{method:'POST',url:'https://api.monday.com/v2',authentication:'predefinedCredentialType',nodeCredentialType:'mondayComApi',sendHeaders:true,headerParameters:{parameters:[{name:'API-Version',value:'2024-10'}]},sendBody:true,specifyBody:'json',jsonBody:body,options:{}}});
// GraphQL braces are spaced out: n8n expressions break on runs of closing braces.
const gq=q=>q.replace(/\{/g,'{ ').replace(/\}/g,' }');
const pageQuery=(cols,cursor)=>gq('query{me{id} boards(ids:['+BOARD+']){items_page(limit:500'+(cursor?',cursor:'+cursor:'')+'){cursor items{id name created_at column_values(ids:'+JSON.stringify(cols)+'){id text value}}}}}');
const itemsQuery=cols=>JSON.stringify({query:pageQuery(cols)});
const update=ref=>'={{ JSON.stringify({query:"mutation($b:ID!,$i:ID!,$v:JSON!){ change_multiple_column_values(board_id:$b,item_id:$i,column_values:$v,create_labels_if_missing:true){ id } }",variables:{b:"'+BOARD+'",i:String('+ref+'.itemId),v:'+ref+'.colsJson}}) }}';
const notify=ref=>'={{ JSON.stringify({query:"mutation($u:ID!,$t:ID!,$x:String!,$i:ID!,$b:String!){ create_notification(user_id:$u,target_id:$t,text:$x,target_type:Project){ text } create_update(item_id:$i,body:$b){ id } }",variables:{u:String('+ref+'.meId),t:String('+ref+'.itemId),x:'+ref+'.notifyText,i:String('+ref+'.itemId),b:'+ref+'.notifyText}}) }}';
const code=(name,pos,js,mode)=>({id:id(),name,type:'n8n-nodes-base.code',typeVersion:2,position:pos,parameters:mode?{mode,jsCode:js}:{jsCode:js}});
const ifTrue=(name,pos,expr,type='n8n-nodes-base.if')=>({id:id(),name,type,typeVersion:2,position:pos,parameters:{conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'loose'},conditions:[{id:id(),leftValue:expr,rightValue:true,operator:{type:'boolean',operation:'true',singleValue:true}}],combinator:'and'},options:{}}});
const hook=(name,pos,p,method='POST',responseMode='onReceived')=>({id:id(),name,type:'n8n-nodes-base.webhook',typeVersion:2,position:pos,webhookId:id(),parameters:{httpMethod:method,path:p,responseMode,options:{}}});
const L=(...names)=>({main:names.map(n=>n?[{node:n,type:'main',index:0}]:[])});
const tag=MODE==='live'?'':' (מצב בדיקה)';const PFX='משפך '+CFG.name+': ';

// 1. Engine
const engineCols=['firstReply','phone','stage','meeting','consentMarketing','consentService','quizDone','heat','status','path','step','next','last','token','state'].map(k=>COLS[k]);
// Email address for the email fallback (fallback.js), only when the campaign maps one.
if(COLS.email)engineCols.push(COLS.email);
if(CFG.contactPermissions)engineCols.push(CFG.contactPermissions.column);
// Current temperature label, so the engine never downgrades it (crm-fields.js).
if(CFG.crmFields.leadTemperature.column)engineCols.push(CFG.crmFields.leadTemperature.column);
const engine={name:PFX+'מנוע הודעות'+tag,settings:{executionOrder:'v1',timezone:'Asia/Jerusalem'},nodes:[
 {id:id(),name:'Every 5 min',type:'n8n-nodes-base.scheduleTrigger',typeVersion:1.2,position:[0,0],parameters:{rule:{interval:[{field:'minutes',minutesInterval:5}]}}},
 hook('Run test',[0,200],'__TEST_PATH__engine'),
 {id:id(),name:'Shabbat',type:'n8n-nodes-base.httpRequest',typeVersion:4.2,position:[200,0],onError:'continueRegularOutput',parameters:{method:'GET',url:'https://www.hebcal.com/shabbat?cfg=json&geonameid=281184&M=on',options:{timeout:10000}}},
 monday('Items',[400,0],itemsQuery(engineCols)),
 {id:id(),name:'Convos',type:'n8n-nodes-base.httpRequest',typeVersion:4.2,position:[600,0],onError:'continueRegularOutput',credentials:GAM,parameters:{method:'GET',url:'https://api.gambot.co.il/api/v1/conversations?pageNumber=1&pageSize=100',authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',options:{timeout:20000}}},
 code('Plan',[800,0],src('plan.js').replace('__MODE__',MODE).replace('__GO_LIVE__',GO_LIVE).replace('__PILOT__',PILOT)),
 ifTrue('Route',[900,0],'={{ $json.reconcile }}'),
 {id:id(),name:'Gambot history',type:'n8n-nodes-base.httpRequest',typeVersion:4.2,position:[1000,-300],onError:'continueRegularOutput',credentials:GAM,parameters:{method:'GET',url:'={{ "https://api.gambot.co.il/api/v1/conversations/" + $json.phone + "/messages?pageSize=20" }}',authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',options:{response:{response:{neverError:true}},timeout:20000}}},
 code('Reconcile',[1200,-300],src('reconcile.js'),'runOnceForEachItem'),
 monday('Update item (reconciled)',[1400,-300],update('$json')),
 ifTrue('Has send?',[1000,0],'={{ $json.hasSend }}'),
 monday('Reserve send',[1100,-100],'={{ JSON.stringify({query:"mutation($b:ID!,$i:ID!,$v:JSON!){change_multiple_column_values(board_id:$b,item_id:$i,column_values:$v){id}}",variables:{b:"'+BOARD+'",i:String($json.itemId),v:$json.reserveJson}}) }}',{onError:'continueRegularOutput'}),
 ifTrue('Reserved?',[1150,-100],'={{ !!($json.data && $json.data.change_multiple_column_values && $json.data.change_multiple_column_values.id) }}'),
 ifTrue('Live?',[1200,-100],"={{ $('Has send?').item.json.live }}"),
 {id:id(),name:'Send WhatsApp',type:'n8n-nodes-base.httpRequest',typeVersion:4.2,disabled:MODE==='test',position:[1400,-200],onError:'continueRegularOutput',credentials:META,parameters:{method:'POST',url:WA_URL,authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',sendBody:true,specifyBody:'json',jsonBody:"={{ JSON.stringify($('Has send?').item.json.send) }}",options:{response:{response:{neverError:true}},timeout:60000,batching:{batch:{batchSize:1,batchInterval:1500}}}}},
 code('Simulated send',[1400,0],"const s=$('Has send?').item.json.send;return {json:{messages:[{id:'simulated'}],simulated:true,template:s.template.name,to:s.to}};",'runOnceForEachItem'),
 code('After send',[1600,-100],src('after-send.js'),'runOnceForEachItem'),
 monday('Update item (sent)',[1800,-100],update('$json')),
 monday('Update item',[1200,150],update("$('Has send?').item.json")),
 ifTrue('Notify?',[1400,150],"={{ $('Has send?').item.json.hasNotify }}",'n8n-nodes-base.filter'),
 monday('Notify Yoram',[1600,150],notify("$('Has send?').item.json"))],
 connections:{'Every 5 min':L('Shabbat'),'Run test':L('Shabbat'),'Shabbat':L('Items'),'Items':L('Convos'),'Convos':L('Plan'),'Plan':L('Route'),'Route':L('Gambot history','Has send?'),'Gambot history':L('Reconcile'),'Reconcile':L('Update item (reconciled)'),'Has send?':L('Reserve send','Update item'),'Reserve send':L('Reserved?'),'Reserved?':L('Live?'),'Live?':L('Send WhatsApp','Simulated send'),'Send WhatsApp':L('After send'),'Simulated send':L('After send'),'After send':L('Update item (sent)'),'Update item':L('Notify?'),'Notify?':L('Notify Yoram')}};

// WhatsApp finally failed: tell Yoram which fallback channel applies. SMS and email have no provider yet, so nothing is sent.
engine.nodes.push(ifTrue('Fallback?',[2000,-100],"={{ $('After send').item.json.hasFallback }}",'n8n-nodes-base.filter'));
engine.nodes.push(monday('Notify fallback',[2200,-100],notify("$('After send').item.json")));
engine.connections['Update item (sent)']=L('Fallback?');
engine.connections['Fallback?']=L('Notify fallback');
// Controlled fallback send. Enabled only in live mode and only for a channel whose provider the campaign configures;
// the request body was built by fallback.js, the provider token comes from the n8n credential.
const FBCRED={sms:{httpHeaderAuth:{id:'PENDING_TEXTME',name:'TextMe Bearer'}},email:{httpHeaderAuth:{id:'PENDING_SENDGRID',name:'SendGrid Bearer'}}};
const fbSend=(name,ch,pos)=>({id:id(),name,type:'n8n-nodes-base.httpRequest',typeVersion:4.2,disabled:MODE!=='live'||!CFG.channels.providers[ch],position:pos,onError:'continueRegularOutput',credentials:FBCRED[ch],parameters:{method:'POST',url:"={{ $('After send').item.json.fallbackSend.request.url }}",authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',sendBody:true,specifyBody:'json',jsonBody:"={{ JSON.stringify($('After send').item.json.fallbackSend.request.body) }}",options:{response:{response:{neverError:true}},timeout:30000}}});
engine.nodes.push({id:id(),name:'Fallback channel',type:'n8n-nodes-base.switch',typeVersion:3,position:[2200,-300],parameters:{rules:{values:['sms','email'].map(ch=>({conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'loose'},conditions:[{id:id(),leftValue:"={{ $('After send').item.json.fallbackSend?.channel }}",rightValue:ch,operator:{type:'string',operation:'equals'}}],combinator:'and'},renameOutput:true,outputKey:ch}))},options:{}}});
engine.nodes.push(fbSend('Send SMS','sms',[2400,-400]),fbSend('Send email','email',[2400,-200]));
engine.connections['Fallback?']=L('Notify fallback');engine.connections['Fallback?'].main[0].push({node:'Fallback channel',type:'main',index:0});
engine.connections['Fallback channel']=L('Send SMS','Send email');

engine.nodes.push(code('Token candidates',[500,100],src('token-candidates.js')));
engine.nodes.push({id:id(),name:'Secure tokens',type:'n8n-nodes-base.crypto',typeVersion:1,position:[600,100],parameters:{action:'generate',dataPropertyName:'secureToken',encodingType:'hex',stringLength:32}});
engine.connections.Items=L('Token candidates');
engine.connections['Token candidates']=L('Secure tokens');
engine.connections['Secure tokens']=L('Convos');
engine.nodes.find(n=>n.name==='Convos').executeOnce=true;

// 2. Personal links (go)
const goCols=['phone','token','step','state','heat','path','status'].map(k=>COLS[k]);
const go={name:PFX+'קישורים אישיים (go)',settings:{executionOrder:'v1'},nodes:[
 hook('Link',[0,0],CFG.id==='refi'?'go':'go-'+CFG.id,'GET','responseNode'),
 monday('Items',[200,0],itemsQuery(goCols),{onError:'continueRegularOutput'}),
 code('Resolve',[400,0],src('go.js')),
 {id:id(),name:'Redirect',type:'n8n-nodes-base.respondToWebhook',typeVersion:1.1,position:[600,0],parameters:{respondWith:'redirect',redirectURL:'={{ $json.url }}',options:{responseCode:302}}},
 ifTrue('Found?',[800,0],"={{ $('Resolve').item.json.found }}",'n8n-nodes-base.filter'),
 monday('Update opens',[1000,0],update("$('Resolve').item.json")),
 ifTrue('Hot?',[1200,0],"={{ $('Resolve').item.json.notify }}",'n8n-nodes-base.filter'),
 monday('Notify Yoram',[1400,0],notify("$('Resolve').item.json"))],
 connections:{'Link':L('Items'),'Items':L('Resolve'),'Resolve':L('Redirect'),'Redirect':L('Found?'),'Found?':L('Update opens'),'Update opens':L('Hot?'),'Hot?':L('Notify Yoram')}};

// 3. Calendly bookings from the office mailbox
const calCols=['phone','email','stage','meeting'].map(k=>COLS[k]);
const cal={name:PFX+'פגישות מ Calendly',settings:{executionOrder:'v1',timezone:'Asia/Jerusalem'},nodes:[
 {id:id(),name:'Every 5 min',type:'n8n-nodes-base.scheduleTrigger',typeVersion:1.2,position:[0,0],parameters:{rule:{interval:[{field:'minutes',minutesInterval:5}]}}},
 {id:id(),name:'Calendly mails',type:'n8n-nodes-base.gmail',typeVersion:2.1,position:[200,0],credentials:GMAIL,onError:'continueRegularOutput',alwaysOutputData:true,parameters:{resource:'message',operation:'getAll',returnAll:false,limit:20,simple:false,filters:{q:'from:notifications@calendly.com newer_than:2d'},options:{}}},
 hook('Run test',[0,200],'__TEST_PATH__calendly'),
 monday('Items',[400,0],itemsQuery(calCols),{executeOnce:true}),
 code('Match bookings',[600,0],src('calendly.js')),
 ifTrue('Matched?',[800,0],'={{ $json.matched }}'),
 monday('Update lead',[1000,-100],update('$json')),
 monday('Create lead',[1000,100],'={{ JSON.stringify({query:"mutation($b:ID!,$g:String!,$n:String!,$v:JSON!){ create_item(board_id:$b,group_id:$g,item_name:$n,column_values:$v,create_labels_if_missing:true){ id } }",variables:{b:"'+BOARD+'",g:"'+CFG.groups.meetings+'",n:($json.name||"פגישה מהיומן"),v:JSON.stringify(Object.assign(JSON.parse($json.colsJson),{['+JSON.stringify(COLS.phone)+']:$json.phone?{phone:$json.phone,countryShortName:"IL"}:undefined,['+JSON.stringify(COLS.source)+']:{label:"יומן"}}))}}) }}')],
 connections:{'Every 5 min':L('Calendly mails'),'Calendly mails':L('Items'),'Run test':L('Items'),'Items':L('Match bookings'),'Match bookings':L('Matched?'),'Matched?':L('Update lead','Create lead'),'Create lead':L('Wait for board automation'),'Wait for board automation':L('Set meeting stage')}};
// A board automation sets new items to "ליד חדש"; set the meeting stage again after it ran.
cal.nodes.push({id:id(),name:'Wait for board automation',type:'n8n-nodes-base.wait',typeVersion:1.1,position:[1200,100],webhookId:id(),parameters:{amount:15,unit:'seconds'}});
cal.nodes.push(monday('Set meeting stage',[1400,100],'={{ JSON.stringify({query:"mutation($b:ID!,$i:ID!,$v:JSON!){ change_multiple_column_values(board_id:$b,item_id:$i,column_values:$v,create_labels_if_missing:true){ id } }",variables:{b:"'+BOARD+'",i:String($json.data.create_item.id),v:JSON.stringify({['+JSON.stringify(COLS.stage)+']:JSON.parse($(\'Match bookings\').item.json.colsJson)['+JSON.stringify(COLS.stage)+']})}}) }}'));

cal.nodes.push(code('Acknowledge booking',[1600,0],src('calendly-ack.js'),'runOnceForEachItem'));
cal.connections['Update lead']=L('Acknowledge booking');
cal.connections['Set meeting stage']=L('Acknowledge booking');

// Fetch all Monday pages, then expose one validated complete list under the
// existing Items name. A failed page or exhausted cap never reaches write nodes.
for (const w of [engine,go,cal]) {
  const fetch = w.nodes.find(n=>n.name==='Items');
  const cols = w===engine?engineCols:w===go?goCols:calCols;
  const marker='__CURSOR__';
  const [prefix,suffix]=pageQuery(cols,marker).split(marker);
  fetch.name='Fetch pages'; delete fetch.onError;
  fetch.parameters.options.pagination={pagination:{
    paginationMode:'updateAParameterInEachRequest',
    parameters:{parameters:[{type:'body',name:'query',value:'={{ $pageCount === 0 ? '+JSON.stringify(pageQuery(cols))+' : '+JSON.stringify(prefix)+' + JSON.stringify($response.body.data.boards[0].items_page.cursor) + '+JSON.stringify(suffix)+' }}'}]},
    paginationCompleteWhen:'other',
    completeExpression:'={{ !!$response.body.errors?.length || !$response.body.data?.boards?.[0]?.items_page?.cursor }}',
    limitPagesFetched:true,maxRequests:50,requestInterval:250
  }};
  for(const c of Object.values(w.connections))for(const branch of c.main)for(const target of branch)if(target.node==='Items')target.node='Fetch pages';
  w.nodes.push(code('Items',[fetch.position[0],fetch.position[1]+100],src('collect-pages.js')));
  w.connections['Fetch pages']=L('Items');
}

// 4. Instant reply: first WhatsApp template within instantReply.withinSeconds of a saved intake lead.
// Called only by the intake workflow (Execute Workflow), never a public webhook. Sends stay disabled
// unless the build is live and the campaign enables it with an approved template id.
const IR=CFG.instantReply;const irLive=MODE!=='test'&&IR&&IR.enabled===true&&/^\d{6,}$/.test(String(IR.template.id||''));
const instant={name:PFX+'מענה מיידי'+tag,settings:{executionOrder:'v1',timezone:'Asia/Jerusalem'},nodes:[
 {id:id(),name:'From intake',type:'n8n-nodes-base.executeWorkflowTrigger',typeVersion:1.1,position:[0,0],parameters:{inputSource:'passthrough'}},
 code('Instant reply',[200,0],src('instant-reply.js').replace('__MODE__',MODE),'runOnceForEachItem'),
 ifTrue('Has send?',[400,0],'={{ $json.hasSend }}'),
 ifTrue('Live?',[600,0],'={{ $json.live }}'),
 {id:id(),name:'Send WhatsApp',type:'n8n-nodes-base.httpRequest',typeVersion:4.2,disabled:!irLive,position:[800,-100],onError:'continueRegularOutput',credentials:META,parameters:{method:'POST',url:WA_URL,authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',sendBody:true,specifyBody:'json',jsonBody:"={{ JSON.stringify($('Has send?').item.json.send) }}",options:{response:{response:{neverError:true}},timeout:30000}}},
 code('Simulated send',[800,100],"const s=$('Has send?').item.json.send;return {json:{messages:[{id:'simulated'}],simulated:true,template:s.template.name,to:s.to}};",'runOnceForEachItem'),
 // Only a confirmed send marks "sent at"; the engine then skips its entry message for this lead (plan.js).
 ifTrue('Sent?',[1000,0],'={{ !!($json.messages && $json.messages[0] && $json.messages[0].id) }}','n8n-nodes-base.filter'),
 code('Mark sent',[1200,0],"const d=new Date().toISOString();return {json:{itemId:$('Has send?').item.json.itemId,colsJson:JSON.stringify({"+JSON.stringify(COLS.last)+":{date:d.slice(0,10),time:d.slice(11,19)}})}};",'runOnceForEachItem'),
 monday('Update item (instant)',[1400,0],update('$json'))],
 connections:{'From intake':L('Instant reply'),'Instant reply':L('Has send?'),'Has send?':L('Live?'),'Live?':L('Send WhatsApp','Simulated send'),'Send WhatsApp':L('Sent?'),'Simulated send':L('Sent?'),'Sent?':L('Mark sent'),'Mark sent':L('Update item (instant)')}};

// 5. SMS inbound (TextMe DLR and replies). The path is a placeholder filled in at deploy time, like the test paths.
// A reply with an opt-out keyword sets the global opt-out label on every item with that phone; DLRs stay in the execution log.
const smsPhoneQuery=gq('query($b:ID!,$v:[String]!){ items_page_by_column_values(board_id:$b,limit:50,columns:[{column_id:'+JSON.stringify(COLS.phone)+',column_values:$v}]){ items{ id } } }');
const smsIn={name:PFX+'קליטת SMS'+tag,settings:{executionOrder:'v1',timezone:'Asia/Jerusalem'},nodes:[
 hook('TextMe webhook',[0,0],'__SMS_INBOUND_PATH__'),
 code('Parse SMS',[200,0],src('../sms/inbound.js'),'runOnceForEachItem'),
 ifTrue('Opt-out?',[400,0],'={{ $json.optOut }}','n8n-nodes-base.filter'),
 monday('Find by phone',[600,0],'={{ JSON.stringify({query:'+JSON.stringify(smsPhoneQuery)+',variables:{b:'+JSON.stringify(String(BOARD))+',v:[$json.local,$json.phone,"+"+$json.phone]}}) }}'),
 code('Mark opt-out',[800,0],src('../sms/mark-optout.js')),
 monday('Update item',[1000,0],update('$json'))],
 connections:{'TextMe webhook':L('Parse SMS'),'Parse SMS':L('Opt-out?'),'Opt-out?':L('Find by phone'),'Find by phone':L('Mark opt-out'),'Mark opt-out':L('Update item')}};

// Final guard: no run of two closing braces inside an expression body.
for(const w of [engine,go,cal,instant,smsIn])for(const n of w.nodes){const b=n.parameters.jsonBody;if(typeof b==='string'&&b.startsWith('={{')){let inner=b.slice(3,-2);while(/\}\}/.test(inner))inner=inner.replace(/\}\}/g,'} }');n.parameters.jsonBody='={{'+inner+'}}';}}
const out=path.join(D,'dist',CAMPAIGN==='refi'?'':CAMPAIGN);fs.mkdirSync(out,{recursive:true});
for(const [f,w] of [['engine-'+MODE+'.json',engine],['go.json',go],['calendly.json',cal],['instant-reply-'+MODE+'.json',instant],['sms-inbound-'+MODE+'.json',smsIn]])for(const n of w.nodes)if(/__CONFIG__|__BUSINESS__|__CRM_FIELDS__|__CHANNELS__|__META_HSM__|__FALLBACK__|__TEXTME__/.test(JSON.stringify(n)))throw new Error('config not injected in '+n.name);
for(const [f,w] of [['engine-'+MODE+'.json',engine],['go.json',go],['calendly.json',cal],['instant-reply-'+MODE+'.json',instant],['sms-inbound-'+MODE+'.json',smsIn]])fs.writeFileSync(path.join(out,f),JSON.stringify(w,null,1));
fs.copyFileSync(path.join(__dirname,'../../config/products.json'),path.join(out,'product-dictionary.json'));
console.log('built',MODE,fs.readdirSync(out).join(' '));
