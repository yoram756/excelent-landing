const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const {CapiStore}=require('../../src/integrations/meta-capi/store'),{configuration,candidate,CapiWorker}=require('../../src/integrations/meta-capi/worker'),{mondayReader}=require('../../src/integrations/meta-capi/monday');
const now=Date.parse('2026-10-29T00:00:00Z'),eventId='TEST-AUTOMATIC-CAPI-001';
const campaign={board:'900000001',columns:{source:'configured_source'},intake:{columns:{eventId:'configured_event'}},conversions:{datasetId:'900000002',eventName:'Lead',actionSource:'system_generated',graphVersion:'v26.0',mondayApiVersion:'2026-07',sourceLabels:['APPROVED SOURCE']}};
const item=()=>({id:'900000003',name:'TEST automated conversion',state:'active',created_at:new Date(now).toISOString(),board:{id:campaign.board},privatePhone:'0551234567',financialData:'NEVER EXPORT',column_values:[{id:'configured_event',text:eventId,value:JSON.stringify(eventId)},{id:'configured_source',text:'APPROVED SOURCE',value:'{}'}]});
function fixture({file=':memory:',mode='test',Worker=CapiWorker,transport,read,list,startNow=now}={}){
 const cfg=configuration(structuredClone(campaign)),store=new CapiStore(file,cfg.binding);let clock=startNow,calls=0,reads=0,lastBody;
 const f={store,cfg,clock:n=>clock=n,calls:()=>calls,reads:()=>reads,body:()=>lastBody};
 f.worker=new Worker({store,cfg,mode,now:()=>clock,monday:{list:list||(async()=>[item()]),read:async id=>{reads++;return read?read(id):item();}},accessToken:'SYNTHETIC_CAPI_CREDENTIAL',testCode:'TEST1234',transport:async(url,opts)=>{calls++;lastBody=JSON.parse(opts.body);assert.ok(!url.includes('SYNTHETIC_CAPI_CREDENTIAL'));assert.equal(opts.headers.authorization,'Bearer SYNTHETIC_CAPI_CREDENTIAL');return transport?transport(url,opts):{status:200,json:async()=>({events_received:1,fbtrace_id:'synthetic-trace'})};}});
 return f;
}
function temp(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'capi-worker-'));return {dir,file:path.join(dir,'state.sqlite'),close(){fs.rmSync(dir,{recursive:true,force:true});}};}
function child(args){return new Promise((resolve,reject)=>{const p=spawn(process.execPath,[path.join(__dirname,'fixtures/capi-worker-child.cjs'),...args],{stdio:['ignore','pipe','pipe']});let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('error',reject);p.on('exit',code=>code===0?resolve(JSON.parse(out.trim())):reject(Error('child failed '+code+' '+err)));});}

test('automatic scan reads Monday independently, preserves event_id and records one accepted event',async()=>{
 const f=fixture();try{const r=await f.worker.tick();assert.equal(r.acknowledged,1);assert.equal(f.reads(),1);assert.equal(f.calls(),1);assert.equal(f.body().data[0].event_id,eventId);assert.equal(f.body().data[0].event_name,'Lead');assert.equal(f.body().test_event_code,'TEST1234');assert.equal(f.body().data[0].event_time,now/1000);assert.equal(f.store.status().states[0].state,'ACKED');assert.doesNotMatch(JSON.stringify(f.body()),/0551234567|NEVER EXPORT|privatePhone|financialData/);}finally{f.store.close();}
});
test('repeated scans of an acknowledged event do not post or repeat individual Monday reads',async()=>{
 const f=fixture();try{await f.worker.tick();assert.equal((await f.worker.tick()).duplicates,1);f.clock(now+8*86400000);assert.equal((await f.worker.tick()).duplicates,1);assert.equal(f.calls(),1);assert.equal(f.reads(),1);assert.equal(f.store.status().issues.length,0);}finally{f.store.close();}
});

test('CRM metadata follows the configured provider without changing durable identity',()=>{
 const original=configuration(campaign),custom=configuration({...campaign,conversions:{...campaign.conversions,crmName:'CRM Test Provider'}});
 assert.equal(original.binding,custom.binding);
 const event=candidate(item(),custom,'test',now,now).event;
 assert.deepEqual(event.custom_data,{event_source:'crm',lead_event_source:'CRM Test Provider'});
 assert.equal(event.event_id,eventId);
 assert.throws(()=>configuration({...campaign,conversions:{...campaign.conversions,crmName:'bad\nsource'}}),/Invalid CRM/);
});
test('scope rejects history, WhatsApp sources, wrong board, inactive data and real people in test mode',async()=>{
 const cfg=configuration(campaign);
 for(const mutate of [x=>x.created_at=new Date(now-1).toISOString(),x=>x.state='deleted',x=>x.board.id='other',x=>x.name='Actual lead',x=>x.column_values[1].text='WhatsApp']){const x=item();mutate(x);assert.ok(candidate(x,cfg,'test',now,now).skip);}
});
test('configured opt-out suppresses conversion and first-second activation precision cannot lose a new item',async()=>{
 const c=structuredClone(campaign);c.columns.status='optout';c.channels={optOut:{label:'STOP'}};const cfg=configuration(c),x=item();x.column_values.push({id:'optout',text:'STOP',value:'{}'});assert.equal(candidate(x,cfg,'test',now,now).skip,'opted_out');
 const f=fixture({startNow:now+999});try{assert.equal(f.worker.cutoff,Math.floor(now/1000)*1000);assert.equal((await f.worker.tick()).acknowledged,1);}finally{f.store.close();}
});
test('missing or conflicting stored event_id never obtains a claim or sends',async()=>{
 for(const mutate of [x=>x.column_values.shift(),x=>x.column_values.push(x.column_values[0]),x=>x.column_values[0].value=JSON.stringify('TEST-DIFFERENT-001'),x=>x.column_values[0].value='{}']){
  const bad=item();mutate(bad);const f=fixture({list:async()=>[bad]});try{assert.equal((await f.worker.tick()).blocked,1);assert.equal(f.calls(),0);assert.equal(f.store.status().states.length,0);}finally{f.store.close();}
 }
});
test('fresh Monday mismatch or failure cannot fall back to scan data',async()=>{
 for(const read of [async()=>({...item(),state:'deleted'}),async()=>({...item(),id:'wrong'}),async()=>{throw Error('PRIVATE_PROVIDER_ERROR');}]){
  const f=fixture({read});try{const r=await f.worker.tick();assert.ok(r.blocked===1||r.status==='BLOCKED');assert.equal(f.calls(),0);assert.doesNotMatch(JSON.stringify(r),/PRIVATE_PROVIDER_ERROR/);}finally{f.store.close();}
 }
});
test('live mode sends no test code, test email or customer fields and excludes TEST names',async()=>{
 const real=()=>({...item(),name:'Actual lead',column_values:[{id:'configured_event',text:'evt-real-conversion-001',value:JSON.stringify('evt-real-conversion-001')},item().column_values[1]]});
 const f=fixture({mode:'live',list:async()=>[real(),item()],read:async()=>real()});try{const r=await f.worker.tick();assert.equal(r.acknowledged,1);assert.equal(r.skipped,1);assert.equal(f.body().test_event_code,undefined);assert.equal(f.body().data[0].opt_out,false);assert.deepEqual(Object.keys(f.body().data[0].user_data),['external_id']);}finally{f.store.close();}
});
test('separate event/item uniqueness guards prevent changed IDs and one event on two items',async()=>{
 const f=fixture();try{await f.worker.tick();for(const mutate of [x=>x.id='900000004',x=>{x.column_values[0]={id:'configured_event',text:'TEST-CHANGED-ID-001',value:JSON.stringify('TEST-CHANGED-ID-001')};}]){const x=item();mutate(x);f.worker.monday.list=async()=>[x];assert.equal((await f.worker.tick()).blocked,1);}assert.equal(f.calls(),1);}finally{f.store.close();}
});
test('transport ambiguity, rejected or malformed API receipts are durable and never automatically retried',async()=>{
 for(const transport of [async()=>{throw Error('SYNTHETIC_CAPI_CREDENTIAL');},async()=>({status:502,json:async()=>{throw Error('PRIVATE');}}),async()=>({status:200,json:async()=>({events_received:2})}),async()=>({status:400,json:async()=>({error:{code:190,message:'PRIVATE'}})}),async()=>({status:429,json:async()=>({error:{code:4}})})]){
  const f=fixture({transport});try{assert.equal((await f.worker.tick()).blocked,1);assert.equal((await f.worker.tick()).blocked,1);assert.equal(f.calls(),1);assert.ok(['UNKNOWN','FAILED'].includes(f.store.status().states[0].state));assert.doesNotMatch(JSON.stringify(f.store.status()),/PRIVATE|SYNTHETIC_CAPI_CREDENTIAL/);}finally{f.store.close();}
 }
});
test('restart preserves activation and accepted reservation without replaying Meta',async()=>{
 const t=temp();try{const first=fixture({file:t.file});await first.worker.tick();first.store.close();const second=fixture({file:t.file});try{assert.equal(second.worker.cutoff,now);assert.equal((await second.worker.tick()).duplicates,1);assert.equal(second.calls(),0);}finally{second.store.close();}}finally{t.close();}
});
test('two separate processes and a post-crash worker share durable duplicate prevention',async()=>{
 const t=temp(),fixtureFile=path.join(t.dir,'fixture.json'),sendLog=path.join(t.dir,'send.log');fs.writeFileSync(fixtureFile,JSON.stringify({campaign,item:item(),now}));
 try{const r=await Promise.all([child([t.file,fixtureFile,sendLog]),child([t.file,fixtureFile,sendLog])]);assert.equal(r.reduce((n,x)=>n+x.acknowledged,0),1);assert.equal(fs.readFileSync(sendLog,'utf8').trim().split('\n').length,1);const f=fixture({file:t.file});try{assert.equal((await f.worker.tick()).duplicates,1);assert.equal(f.calls(),0);}finally{f.store.close();}}finally{t.close();}
});
test('crash after reservation remains SENDING and cannot send on recovery',async()=>{
 const t=temp(),fixtureFile=path.join(t.dir,'fixture.json');fs.writeFileSync(fixtureFile,JSON.stringify({campaign,item:item(),now}));try{assert.equal((await child([t.file,fixtureFile,path.join(t.dir,'send.log'),'claim-only'])).claimed,true);const f=fixture({file:t.file});try{assert.equal((await f.worker.tick()).blocked,1);assert.equal(f.calls(),0);assert.equal(f.store.status().states[0].state,'SENDING');}finally{f.store.close();}}finally{t.close();}
});
test('configuration mismatch and unset mode fail closed before any network request',()=>{
 const t=temp();try{const a=new CapiStore(t.file,'binding-a');a.close();assert.throws(()=>new CapiStore(t.file,'binding-b'),/another binding/);}finally{t.close();}
 assert.throws(()=>new CapiWorker({mode:undefined,accessToken:'SYNTHETIC'}),/Explicit mode/);assert.throws(()=>configuration({...campaign,conversions:undefined}),/Explicit conversion/);
});
test('one process overlapping tick is rejected while the independent read remains in flight',async()=>{
 let release;const pending=new Promise(resolve=>release=resolve),f=fixture({list:async()=>{await pending;return [item()];}});try{const first=f.worker.tick();assert.equal((await f.worker.tick()).status,'BUSY');release();await first;assert.equal(f.calls(),1);}finally{f.store.close();}
});
test('Monday transport is read-only, paginates completely and rejects partial GraphQL data',async()=>{
 let calls=0;const api=mondayReader({token:'SYNTHETIC_MONDAY',apiVersion:'2026-07',boardId:campaign.board,columnIds:['configured_event'],transport:async(url,o)=>{calls++;assert.equal(url,'https://api.monday.com/v2');assert.equal(o.headers.Authorization,'SYNTHETIC_MONDAY');const q=JSON.parse(o.body);assert.match(q.query,/^query/);assert.ok(!q.query.includes('mutation'));return {status:200,json:async()=>({data:{boards:[{id:campaign.board,items_page:{items:[{id:String(calls)}],cursor:calls===1?'next-page':null}}]}})};}});assert.equal((await api.list()).length,2);assert.equal(calls,2);
 const bad=mondayReader({token:'SYNTHETIC',apiVersion:'2026-07',boardId:campaign.board,columnIds:['configured_event'],transport:async()=>({status:200,json:async()=>({errors:[{message:'PRIVATE'}],data:{boards:[{id:campaign.board}]}})})});await assert.rejects(bad.list(),/monday_read_rejected/);
});
test('negative control proves the repeated-delivery harness fails if duplicate guards are bypassed',async()=>{
 async function verify(Worker){const f=fixture({Worker});try{await f.worker.tick();await f.worker.tick();assert.equal(f.calls(),1,'duplicate Meta send');}finally{f.store.close();}}
 await verify(CapiWorker);
 const Module=require('node:module'),file=require.resolve('../../src/integrations/meta-capi/worker'),broken=new Module(file,module);broken.filename=file;broken.paths=module.paths;
 const text=fs.readFileSync(file,'utf8').replace('const prior=this.store.inspect(record);','const prior=null;').replace('if(!claim.claimed){if(claim.state', 'if(false){if(claim.state');broken._compile(text,file);
 await assert.rejects(verify(broken.exports.CapiWorker),/duplicate Meta send/);
});
