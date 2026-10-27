// Reproducible n8n error workflow. Provider secrets remain in existing n8n credentials.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const defaultCampaign=require('../../config/campaigns/refi.json');
const defaultGlobal=require('../../../config/error-handler.json');
const library=()=>fs.readFileSync(path.join(__dirname,'error-handler.js'),'utf8').replace(/module\.exports=.*;/,'');
const nodeId=name=>{const h=crypto.createHash('sha1').update('central-error:'+name).digest('hex');return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20,32)].join('-');};
const edge=name=>({node:name,type:'main',index:0});
const link=(...names)=>({main:names.map(n=>[edge(n)])});
const code=(name,position,jsCode)=>({id:nodeId(name),name,type:'n8n-nodes-base.code',typeVersion:2,position,parameters:{jsCode}});
const condition=(name,position,expr)=>({id:nodeId(name),name,type:'n8n-nodes-base.if',typeVersion:2.2,position,parameters:{conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict',version:2},conditions:[{id:nodeId(name+':condition'),leftValue:expr,rightValue:true,operator:{type:'boolean',operation:'true',singleValue:true}}],combinator:'and'},options:{}}});
function build({campaign:c=defaultCampaign,global:g=defaultGlobal}={}){
 const bundle=library(),cc=JSON.stringify(c),gg=JSON.stringify(g);
 const request=(name,position,expr)=>({id:nodeId(name),name,type:'n8n-nodes-base.httpRequest',typeVersion:4.2,position,retryOnFail:false,onError:'continueRegularOutput',credentials:{mondayComApi:{id:g.mondayCredentialId,name:'Monday.com account'}},parameters:{method:'POST',url:'https://api.monday.com/v2',authentication:'predefinedCredentialType',nodeCredentialType:'mondayComApi',sendHeaders:true,headerParameters:{parameters:[{name:'API-Version',value:'2024-10'}]},sendBody:true,specifyBody:'json',jsonBody:expr,options:{timeout:20000}}});
 const nodes=[
  {id:nodeId('Error Trigger'),name:'Error Trigger',type:'n8n-nodes-base.errorTrigger',typeVersion:1,position:[0,0],parameters:{}},
  code('Prepare alert',[240,0],bundle+'\nconst a=prepare($input.first().json,{campaign:'+cc+',global:'+gg+',state:$getWorkflowStaticData("global"),selfId:$workflow.id,now:Date.now()});return a?[{json:a}]:[];'),
  {id:nodeId('Send Email'),name:'Send Email',type:'n8n-nodes-base.gmail',typeVersion:2.1,position:[480,0],onError:'continueRegularOutput',retryOnFail:false,credentials:{gmailOAuth2:{id:g.gmailCredentialId,name:'Gmail account'}},parameters:{resource:'message',operation:'send',sendTo:g.recipientEmail,subject:'={{ $json.subject }}',emailType:'text',message:'={{ $json.body }}',options:{appendAttribution:false}}},
  condition('Has item id?',[720,0],"={{ !!$('Prepare alert').first().json.itemId }}"),
  request('Read Monday target',[960,-140],"={{ JSON.stringify($('Prepare alert').first().json.lookupRequest) }}"),
  code('Validate Monday target',[1200,-140],bundle+'\nreturn [{json:{safe:canUpdate($input.first().json,$("Prepare alert").first().json,'+cc+')}}];'),
  condition('Safe target?',[1440,-140],'={{ $json.safe === true }}'),
  request('Monday Update Item',[1680,-260],"={{ JSON.stringify($('Prepare alert').first().json.updateRequest) }}"),
  request('Monday Create Item',[1680,160],"={{ JSON.stringify($('Prepare alert').first().json.createRequest) }}"),
  code('Confirm handling',[1920,0],bundle+'\nreturn [{json:finish($input.first().json,$("Send Email").first().json,$("Prepare alert").first().json,$getWorkflowStaticData("global"),Date.now())}];')
 ];
 return {name:g.name,nodes,connections:{'Error Trigger':link('Prepare alert'),'Prepare alert':link('Send Email'),'Send Email':link('Has item id?'),'Has item id?':link('Read Monday target','Monday Create Item'),'Read Monday target':link('Validate Monday target'),'Validate Monday target':link('Safe target?'),'Safe target?':link('Monday Update Item','Monday Create Item'),'Monday Update Item':link('Confirm handling'),'Monday Create Item':link('Confirm handling')},settings:{executionOrder:'v1',timezone:'Asia/Jerusalem',saveDataErrorExecution:'all',saveDataSuccessExecution:'all'},pinData:{}};
}
if(require.main===module){const dest=process.argv[2];if(!dest)throw Error('Output path required');fs.writeFileSync(dest,JSON.stringify(build(),null,2)+'\n');console.log('Built Central Error Handler');}
module.exports={build,library,nodeId,edge,link,code,condition};
