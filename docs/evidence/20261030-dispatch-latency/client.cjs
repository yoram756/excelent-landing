const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const OUT=path.resolve(process.argv[2]||'tests/out/dispatch-latency-20261030');
const VERSION='ca4089e7-049c-471d-9dca-6901cbc33144';
const ORIGIN='https://refi.excelentfinance.com',CLOCK='https://n8n-qhxa.srv1604140.hstgr.cloud';
function save(n,v){fs.writeFileSync(path.join(OUT,n),JSON.stringify(v,null,2)+'\n',{flag:'wx'});}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function clocks(){
 const rows=[];
 for(let i=0;i<8;i++){
  const s=Date.now(),m=performance.now();
  const r=await fetch(CLOCK+'/?dispatch_clock='+crypto.randomUUID(),{method:'HEAD',cache:'no-store',signal:AbortSignal.timeout(10000)});
  const e=Date.now(),duration=performance.now()-m,d=Date.parse(r.headers.get('date')||'');
  assert.equal(r.status,200,'Clock endpoint status');assert.ok(Number.isFinite(d),'Missing Date');assert.ok(Math.abs((e-s)-duration)<30,'Client clock jumped');
  assert.ok(!r.headers.get('age')||Number(r.headers.get('age'))===0,'Cached Date');
  rows.push({sentEpochMs:s,receivedEpochMs:e,elapsedMs:duration,date:r.headers.get('date'),dateEpochMs:d,server:r.headers.get('server'),age:r.headers.get('age')});
  await sleep(110);
 }
 return rows;
}
(async()=>{
 fs.mkdirSync(OUT,{recursive:true});
 const proof=JSON.parse(fs.readFileSync(path.join(OUT,'preflight.json'),'utf8'));
 assert.equal(proof.status,'PASS');assert.equal(proof.version,VERSION);assert.equal(proof.whatsappDisabled,true);
 assert.ok(Math.abs(Date.now()-Date.parse(proof.checkedAtUtc))<600000,'Stale safety proof');
 const cases=['campaign_buyers_south','campaign_sellers_south','campaign_bundle_allinone'].map((campaign,i)=>({first_name:'TEST dispatch timing '+(i+1),phone:'050000013'+(i+1),product:'LP1',product_slug:'refi',campaign:'refi',source:'LP1 CRO',event_id:crypto.randomUUID(),service_request:true,marketing_consent:false,money_included:false,answers:{},utm_source:'synthetic_dispatch_20261030',utm_campaign:campaign}));
 for(const p of cases)p.idempotency_key=p.event_id;
 save('client-intent.json',{version:VERSION,origin:ORIGIN,clockOrigin:CLOCK,cases});
 const results=[];
 for(let i=0;i<cases.length;i++){
  if(i)await sleep(12000);
  const before=await clocks(),p=cases[i];p.service_request_at=new Date().toISOString();
  save('attempt-'+i+'.json',{eventId:p.event_id,intent:p,attempted:true});
  const body=JSON.stringify(p),s=Date.now(),m=performance.now();
  let result;
  try{
   const r=await fetch(ORIGIN+'/api/lead',{method:'POST',headers:{'Content-Type':'application/json',Origin:ORIGIN},body,signal:AbortSignal.timeout(25000)});
   const responseText=await r.text(),e=Date.now(),duration=performance.now()-m;
   result={eventId:p.event_id,campaign:p.utm_campaign,phone:p.phone,payload:p,startEpochMs:s,endEpochMs:e,fullResponseMs:duration,wallClockJumpMs:(e-s)-duration,status:r.status,response:JSON.parse(responseText),before};
  }catch(e){save('ambiguous-'+i+'.json',{eventId:p.event_id,errorType:e.name,attempted:true,noAutomaticRetry:true});throw e;}
  save('response-'+i+'.json',result);
  assert.equal(result.status,200,'No automatic retry');assert.match(result.response.request_id||'',/^[1-9]\d*$/);assert.equal(result.response.pending,undefined);
  assert.ok(Math.abs(result.wallClockJumpMs)<30,'Client clock jumped');
  result.after=await clocks();save('case-'+i+'.json',result);results.push(result);
  console.log(JSON.stringify({campaign:p.utm_campaign,eventId:p.event_id,itemId:result.response.request_id,status:result.status,startEpochMs:s,fullResponseMs:Math.round(result.fullResponseMs)}));
 }
 save('client-result.json',{status:'PASS',scope:'Three real workstation POSTs to the public form endpoint; arrival bound requires server correlation',version:VERSION,results});
 console.log('CLIENT_THREE_REQUESTS_COMPLETE');
})().catch(e=>{console.error(e.name+': '+e.message);process.exitCode=1;});

