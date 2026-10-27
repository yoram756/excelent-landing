// Deployment package: validate every campaign file, build the n8n workflow JSON, write .env.production.example.
// Usage: node src/deploy/package.js
// Builds test mode only (simulated sends, TEST leads only). A live build stays a separate step that needs
// explicit approval from יורם: node src/services/funnel/build-workflows.js live <go-live ISO>.
// Files whose name starts with "_" are test scratch files and are skipped.
const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
const ROOT=path.resolve(__dirname,'../..');
const CAMPAIGNS=path.join(ROOT,'src/config/campaigns');
const DIST=path.join(ROOT,'src/services/funnel/dist');

// Columns the engine, the go links and the Calendly workflow read (build-workflows.js).
const ENGINE_COLUMNS=['firstReply','phone','stage','meeting','consentMarketing','consentService','quizDone','heat','status','path','step','next','last','token','state','email','source'];

// Errors block the package. Warnings are what still stands between the campaign and going live.
const validateCampaign=(c,file,biz)=>{
  const errors=[],warnings=[];const err=m=>errors.push(m),warn=m=>warnings.push(m);
  if(c.id!==path.basename(file,'.json'))err('id "'+c.id+'" does not match the file name');
  if(typeof c.name!=='string'||!c.name.trim())err('name missing');
  if(!/^\d+$/.test(String(c.board||'')))err('board id must be numeric');
  for(const k of ENGINE_COLUMNS)if(!/^\w+$/.test(String(c.columns?.[k]||'')))err('column '+k+' missing or invalid');
  if(!/^\w+$/.test(String(c.groups?.meetings||'')))err('groups.meetings missing');
  const T=c.templates||{};
  for(const [code,t] of Object.entries(T)){
    if(typeof t.name!=='string'||!t.name)err('template '+code+' has no name');
    if(t.id==='PENDING')warn('template '+code+' ('+t.name+') not approved in Gambot');
    else if(!/^\d{6,}$/.test(String(t.id)))err('template '+code+' id must be numeric or PENDING');
  }
  for(const [p,steps] of Object.entries(c.sequences||{}))for(const s of steps){
    if(!T[s.code])err('sequence '+p+' uses unknown template '+s.code);
    if(s.thenPath&&!c.sequences[s.thenPath])err('sequence '+p+' moves to unknown path '+s.thenPath);
  }
  for(const k of ['booked','reminder','noShow'])if(c.meeting&&!T[c.meeting[k]])err('meeting.'+k+' uses unknown template');
  const ch=c.channels;
  if(!ch||!Array.isArray(ch.cascade)||!ch.cascade.length)err('channels.cascade missing');
  else{
    for(const x of ch.cascade)if(!Object.hasOwn(ch.providers||{},x))err('channel '+x+' has no providers entry');
    if(ch.providers.whatsapp!=='gambot')err('WhatsApp provider must be gambot');
    for(const x of ch.cascade)if(ch.providers[x]===null)warn('channel '+x+' has no provider (deferred)');
    if(!ch.optOut?.label)err('channels.optOut.label missing');
  }
  const IR=c.instantReply;
  if(!IR)err('instantReply missing');
  else{
    if(!(IR.withinSeconds>0&&IR.withinSeconds<=60))err('instantReply.withinSeconds must be 1 to 60');
    if(!(IR.graceMinutes>=0))err('instantReply.graceMinutes invalid');
    if(!['UTILITY','MARKETING'].includes(IR.template?.category))err('instantReply.template.category must be UTILITY or MARKETING');
    if(IR.enabled===true&&!/^\d{6,}$/.test(String(IR.template?.id||'')))err('instantReply enabled without an approved template id');
    if(IR.enabled!==true)warn('instant reply is off');
  }
  const lt=c.crmFields?.leadTemperature;
  if(!lt||!Array.isArray(lt.bands)||lt.bands.at(-1)?.atLeast!==0)err('crmFields.leadTemperature bands must end at 0');
  else for(const b of lt.bands)if(!lt.labels?.[b.value]?.write)err('Lead_Temperature '+b.value+' has no label');
  if(c.meta!==undefined){
    if(!Array.isArray(c.meta.campaignIds)||c.meta.campaignIds.some(x=>!/^\d+$/.test(String(x))))err('meta.campaignIds must be numeric strings');
    else if(!c.meta.campaignIds.length)warn('no Meta campaign ids: Meta leads are rejected for this campaign');
  }else warn('no meta block: Meta leads are rejected for this campaign');
  if(!c.intake)warn('no intake block: patch-export.js cannot wire the intake for this campaign');
  const ID=c.identity;
  if(!ID)err('identity block missing');
  else if(ID.approved!==true)warn('identity not approved by the owner: only test builds');
  else{
    const prof=biz.profiles[ID.profile];
    if(!prof)err('unknown identity profile '+ID.profile);
    else{
      if(!prof.allowedContactPhones.includes(ID.contactPhone))err('contact phone not allowed for the profile');
      for(const k of ID.testPhones||[])if(!biz.phones[k])err('unknown test phone '+k);
    }
  }
  if(c.status==='draft')warn('status is draft');
  return {campaign:c.id,errors,warnings,liveReady:!errors.length&&ID?.approved===true&&!Object.values(T).some(t=>t.id==='PENDING')};
};

// One Meta campaign id may belong to one campaign file only (same rule as meta-adapter.js campaignIndex).
const crossChecks=configs=>{
  const seen={},errors=[];
  for(const c of configs)for(const id of c.meta?.campaignIds||[]){if(seen[id])errors.push('Meta campaign '+id+' in '+seen[id]+' and '+c.id);seen[id]=c.id;}
  return errors;
};

const campaignFiles=()=>fs.readdirSync(CAMPAIGNS).filter(f=>f.endsWith('.json')&&!f.startsWith('_')).sort();

const validateAll=()=>{
  const biz=JSON.parse(fs.readFileSync(path.join(ROOT,'config/business.json'),'utf8'));
  const configs=[],reports=[];
  for(const f of campaignFiles()){
    let c;try{c=JSON.parse(fs.readFileSync(path.join(CAMPAIGNS,f),'utf8'));}catch(e){reports.push({campaign:f,errors:['invalid JSON: '+e.message],warnings:[],liveReady:false});continue;}
    configs.push(c);reports.push(validateCampaign(c,f,biz));
  }
  return {reports,crossErrors:crossChecks(configs)};
};

// Production env. Values are never committed; secrets are set on the server or in n8n credentials only.
const ENV=[
  ['Lock service (src/services/lifecycle/lock-server.js), runs next to n8n'],
  ['LOCK_SERVER_HOST','','Address to listen on. Use the internal Docker network address n8n reaches, never a public interface'],
  ['LOCK_SERVER_PORT','8787',''],
  ['LOCK_SERVER_TOKEN','','Secret, at least 32 characters. The same value goes into the n8n Header Auth credential "Lock server" as "Bearer <token>"'],
  ['LOCK_DB_PATH','','Absolute path ending in .sqlite, on a persistent volume'],
  ['Intake patch (src/webhooks/intake/patch-export.js), used once when wiring the intake workflow'],
  ['LOCK_SERVER_URL','','How n8n reaches the lock service, for example http://lock-server:8787'],
  ['LOCK_CREDENTIAL_ID','','Id of the n8n Header Auth credential "Lock server"'],
  ['INSTANT_REPLY_WORKFLOW_ID','','Id of the imported instant reply workflow in n8n'],
  ['CAMPAIGN','refi','Campaign file for build-workflows.js and patch-export.js'],
  ['Gambot'],
  ['GAMBOT_API_KEY','','Secret. Not read by repo code: n8n sends it from the Header Auth credential "Header Auth account" on every Gambot call'],
  ['Meta Lead Ads (src/webhooks/intake/meta-adapter.js)'],
  ['META_VERIFY_TOKEN','','Secret. Must equal the verify token entered in the Meta app webhook settings'],
  ['META_APP_SECRET','','Secret. Meta app secret, used to check X-Hub-Signature-256'],
  ['META_ACCESS_TOKEN','','Secret. Page access token with leads_retrieval'],
  ['WhatsApp Cloud API sends (src/services/funnel/build-workflows.js), required for pilot and live builds'],
  ['META_WA_PHONE_NUMBER_ID','','Meta phone number id of the WhatsApp sending number (not the phone number itself)'],
  ['META_WA_CREDENTIAL_ID','','Id of the n8n Header Auth credential "Meta WhatsApp Cloud" (Authorization: Bearer <token>); the token stays in n8n'],
  ['Business operations sandbox (loopback only; no outbound dispatch)'],
  ['OPS_DB_PATH','','Absolute .sqlite path on a protected persistent volume'],
  ['OPS_PORT','8791','Loopback port for the local operations service'],
  ['OPS_INGEST_TOKEN','','Secret, distinct role token of at least 32 characters'],
  ['OPS_REVIEW_TOKEN','','Secret, distinct reviewer role token; never give to source/LLM workers'],
  ['OPS_READ_TOKEN','','Secret, distinct internal reader role token'],
];
const SECRET_ENV=['LOCK_SERVER_TOKEN','GAMBOT_API_KEY','META_VERIFY_TOKEN','META_APP_SECRET','META_ACCESS_TOKEN','OPS_INGEST_TOKEN','OPS_REVIEW_TOKEN','OPS_READ_TOKEN'];
const envFile=()=>['# Production environment for the lead funnel. Generated by src/deploy/package.js: edit the list there, not here.',
  '# Copy to .env.production on the server only (gitignored). Never commit a value for a secret.',
  ...ENV.flatMap(([k,v,note])=>v===undefined?['','# '+k]:[...(note?['# '+note]:[]),k+'='+v])].join('\n')+'\n';

const buildAll=campaigns=>campaigns.map(id=>{
  execFileSync(process.execPath,[path.join(ROOT,'src/services/funnel/build-workflows.js'),'test'],{env:{...process.env,CAMPAIGN:id},stdio:'pipe'});
  const dir=path.join(DIST,id==='refi'?'':id);
  const files=['engine-test.json','go.json','calendly.json','instant-reply-test.json'];
  for(const f of files){
    const s=fs.readFileSync(path.join(dir,f),'utf8');const w=JSON.parse(s);
    if(!Array.isArray(w.nodes)||!w.nodes.length||typeof w.connections!=='object')throw Error(id+'/'+f+' is not an n8n workflow');
    const left=s.match(/__(?!TEST_PATH__)[A-Z_]+__/);if(left)throw Error(id+'/'+f+' still holds '+left[0]);
  }
  return {campaign:id,dir:path.relative(ROOT,dir).replace(/\\/g,'/')||'.',files};
});

const run=()=>{
  const {reports,crossErrors}=validateAll();
  const failed=reports.filter(r=>r.errors.length);
  if(failed.length||crossErrors.length)return {ok:false,reports,crossErrors,built:[]};
  const built=buildAll(reports.map(r=>r.campaign));
  fs.writeFileSync(path.join(ROOT,'.env.production.example'),envFile());
  return {ok:true,reports,crossErrors,built,env:'.env.production.example'};
};

if(require.main===module){const r=run();console.log(JSON.stringify(r,null,1));if(!r.ok)process.exit(1);}

module.exports={validateCampaign,crossChecks,validateAll,envFile,ENV,SECRET_ENV,run};
