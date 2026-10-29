const fs=require('node:fs'),path=require('node:path'),{CapiStore}=require('./store'),{configuration,CapiWorker}=require('./worker'),{mondayReader}=require('./monday');
function secret(env,file){if(process.env[env])return process.env[env];try{return fs.readFileSync('/run/secrets/'+file,'utf8').trim();}catch{return '';}}
async function run(){
  const campaign=process.env.CAMPAIGN||'refi';if(!/^[a-z0-9-]+$/.test(campaign))throw Error('Invalid campaign');
  const cfg=configuration(require('../../config/campaigns/'+campaign+'.json'));
  const mode=process.env.CAPI_MODE,pollMs=mode==='test'?Number(process.env.CAPI_TEST_POLL_MS||10000):300000;
  if(!Number.isFinite(pollMs)||pollMs<1000)throw Error('Invalid poll interval');
  const store=new CapiStore(process.env.CAPI_DB_PATH,cfg.binding);
  const monday=mondayReader({token:secret('MONDAY_API_TOKEN','monday_token'),apiVersion:cfg.mondayApiVersion,boardId:cfg.boardId,columnIds:[cfg.eventColumn,cfg.sourceColumn,cfg.optOutColumn].filter(Boolean)});
  const worker=new CapiWorker({store,cfg,mode,monday,accessToken:secret('META_CAPI_ACCESS_TOKEN','meta_token'),testCode:secret('META_CAPI_TEST_EVENT_CODE','test_code')});
  let stopping=false,wake=()=>{};for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopping=true;wake();});
  console.log(JSON.stringify({service:'meta-capi',mode,activatedAt:new Date(worker.cutoff).toISOString(),pollMs,ready:true,whatsapp:false}));
  while(!stopping){
    if(mode==='test'&&Date.now()-worker.cutoff>300000){store.scan(Date.now(),'controlled_test_window_expired');console.log(JSON.stringify({status:'BLOCKED',code:'controlled_test_window_expired',providerCalls:0}));}
    else console.log(JSON.stringify(await worker.tick()));
    if(process.argv.includes('--once')||stopping)break;
    await new Promise(resolve=>{const timer=setTimeout(resolve,pollMs);wake=()=>{clearTimeout(timer);resolve();};});
  }
  store.close();
}
if(require.main===module)run().catch(()=>{console.error(JSON.stringify({status:'BLOCKED',code:'capi_startup_failed_no_secrets_logged'}));process.exitCode=1;});
module.exports={run};
