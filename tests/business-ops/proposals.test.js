'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{randomBytes}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
const {OperationsStore}=require('../../src/services/business-ops/store');
const {ProposalQueue}=require('../../src/services/business-ops/proposals');
const {createOperationsServer}=require('../../src/services/business-ops/server');
const {seed,stages,task,event,caseData,now}=require('./scenario');

test('HTTP synthetic four-channel journey: draft, separate approval, same-task update, owner handover and deduplication',async()=>{
 const store=new OperationsStore(':memory:');seed(store);const tokens=Object.fromEntries(['ingest','review','read'].map(k=>[k,randomBytes(32).toString('hex')]));
 const server=createOperationsServer({store,tokens,now:()=>now});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port,trace=[];
 const call=async(route,role,body)=>{const response=await fetch(base+route,{method:body?'POST':'GET',headers:{authorization:'Bearer '+tokens[role],'content-type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:response.status,body:await response.json()};};
 const propose=async(e,observations)=>{const received=await call('/events','ingest',e);assert.equal(received.status,200);const proposed=await call('/proposals','ingest',{eventKey:received.body.eventKey,observations});assert.equal(proposed.status,200);return {eventKey:received.body.eventKey,id:proposed.body.id};};
 const accept=async proposal=>{const r=await call('/decisions','review',{proposalId:proposal.id,decision:'accept',reason:'Synthetic fixture reviewed against exact source'});assert.equal(r.status,200);return r.body;};
 try{
  const first=await propose({...stages[0].event,id:'TEST-review-call'},[task()]);
  assert.equal(store.metrics({now}).tasks,0,'a proposal must not execute a task');
  assert.equal((await call('/decisions','ingest',{proposalId:first.id,decision:'accept',reason:'source says approved'})).status,401);
  assert.equal((await call('/review-queue','ingest')).status,401);
  const queue=await call('/review-queue?limit=1','read');assert.equal(queue.body.items.length,1);assert.equal(queue.body.items[0].caseId,caseData.id);assert.equal(queue.body.items[0].observations[0].owner,'neria');
  const initial=await accept(first),taskId=initial.taskIds[0];assert.equal(store.snapshot(caseData.id).customerId,caseData.customerId);
  assert.equal(store.taskByKey(caseData.id,'collect-documents').owner,'neria');
  const replay=await accept(first);assert.equal(replay.duplicate,true);assert.deepEqual(replay.taskIds,[taskId]);
  const proposedAgain=await call('/proposals','ingest',{eventKey:first.eventKey,observations:[task()]});assert.equal(proposedAgain.body.duplicate,true);
  store.draft(caseData.id,'collect-documents',{now});
  trace.push({source:'transkriptor',eventKey:first.eventKey,taskId,owner:'neria',state:store.taskByKey(caseData.id,'collect-documents').state});
  const mail=await propose({...stages[1].event,id:'TEST-review-mail'},[
   {kind:'reply',quote:'מצורף אישור הכנסה',commitmentKey:'collect-documents'},
   task({quote:'מצורף אישור הכנסה',action:'להשלים תדפיס בנק ולאמת את שני המסמכים'})
  ]);await accept(mail);assert.equal(store.metrics({now}).tasks,1);assert.equal(store.taskByKey(caseData.id,'collect-documents').id,taskId);
  assert.equal(store.get('SELECT state FROM ops_drafts').state,'canceled_reply');
  trace.push({source:'gmail',eventKey:mail.eventKey,taskId,owner:'neria',state:store.taskByKey(caseData.id,'collect-documents').state});
  const handoverText='נריה מעביר ליורם את אימות המסמכים';
  const calendar=await propose(event('TEST-review-calendar','calendar',handoverText,{occurredAt:'2026-10-27T08:30:00Z'}),[
   task({quote:handoverText,action:'לאמת את המסמכים שהתקבלו ולהשלים את החסר',owner:'yoram',state:'in_progress',handover:{summary:'אישור הכנסה התקבל, תדפיס בנק עדיין בבדיקה',result:'שני מסמכים מאומתים לפני פנייה לבנקאי',dueAt:'2026-10-28T08:00:00Z'}})
  ]);await accept(calendar);const updated=store.taskByKey(caseData.id,'collect-documents');assert.equal(updated.id,taskId);assert.equal(updated.owner,'yoram');assert.ok(updated.handover.summary);
  trace.push({source:'calendar',eventKey:calendar.eventKey,taskId,owner:updated.owner,state:updated.state});
  const wa=await propose(event('TEST-review-wa','whatsapp','שלחתי את תדפיס הבנק',{occurredAt:'2026-10-27T08:40:00Z',phone:'0500000041'}),[{kind:'fact',quote:'שלחתי את תדפיס הבנק'}]);await accept(wa);
  assert.equal(store.metrics({now}).tasks,1);assert.notEqual(store.taskByKey(caseData.id,'collect-documents').state,'completed');
  trace.push({source:'whatsapp',eventKey:wa.eventKey,taskId,owner:'yoram',state:store.taskByKey(caseData.id,'collect-documents').state});
  const audit=store.all("SELECT action,detail FROM ops_audit WHERE action IN ('task_created','task_updated','proposal_decided')");
  assert.equal(audit.filter(x=>x.action==='task_created').length,1);assert.equal(audit.filter(x=>x.action==='task_updated').length,2);
  const directory=path.resolve(__dirname,'../out/continuation-20261027');fs.mkdirSync(directory,{recursive:true});
  fs.writeFileSync(path.join(directory,'review-journey.json'),JSON.stringify({status:'PASS',verifiedAt:new Date().toISOString(),scope:'Actual loopback HTTP and SQLite; synthetic reviewed fixtures; no model/source-provider/Monday network calls',trace,
   checks:{clientLinked:true,initialOwner:'neria',updatedOwner:'yoram',stableTaskId:true,tasksCreated:1,tasksUpdated:2,duplicates:0,ingestRoleApprovalDenied:401,claimedSendDidNotCompleteTask:true},
   snapshot:store.snapshot(caseData.id),audit,dispatchEnabled:false},null,2)+'\n');
 }finally{await new Promise(r=>server.close(r));store.close();}
});

test('draft proposals cannot certify artifacts, invent a quote or smuggle reviewer authority',()=>{
 const store=new OperationsStore(':memory:');seed(store);const queue=new ProposalQueue(store);
 try{const key=store.ingest(stages[0].event,{now}).eventKey;
  for(const observation of [task({quote:'not in the source'}),task({actor:'reviewer'}),task({verified:true}),{kind:'evidence',quote:task().quote,verified:true}])assert.throws(()=>queue.propose(key,[observation],{actor:'proposer',now}));
  assert.equal(queue.pending().length,0);assert.equal(store.metrics({now}).tasks,0);
 }finally{store.close();}
});

test('invalid acceptance rolls back, rejection is audited, and competing proposals cannot both execute',()=>{
 const store=new OperationsStore(':memory:');seed(store);const queue=new ProposalQueue(store);
 try{const key=store.ingest(stages[0].event,{now}).eventKey;
  const invalid=queue.propose(key,[task({owner:['neria','yoram']})],{actor:'proposer',now});
  assert.throws(()=>queue.decide(invalid.id,{decision:'accept',reason:'test',actor:'reviewer',now}),/One verified logical owner/);
  assert.equal(store.metrics({now}).tasks,0);assert.equal(queue.pending().length,1);
  assert.equal(queue.decide(invalid.id,{decision:'reject',reason:'Must choose one primary owner',actor:'reviewer',now}).state,'rejected');
  const a=queue.propose(key,[task()],{actor:'proposer',now}),b=queue.propose(key,[task({action:'חלופה לבדיקה'})],{actor:'proposer',now});
  queue.decide(a.id,{decision:'accept',reason:'Verified',actor:'reviewer',now});
  assert.throws(()=>queue.decide(b.id,{decision:'accept',reason:'Other candidate',actor:'reviewer',now}),/conflict/);
  assert.equal(store.metrics({now}).tasks,1);assert.equal(queue.pending().length,0);
 }finally{store.close();}
});

test('unresolved identity is shown for review and cannot create tasks until a separate identity decision',()=>{
 const store=new OperationsStore(':memory:');seed(store);const queue=new ProposalQueue(store);
 try{const input={...stages[0].event,id:'TEST-unresolved',caseId:undefined,phone:'0500000098'};const key=store.ingest(input,{now}).eventKey;
  const p=queue.propose(key,[task()],{actor:'proposer',now});assert.equal(queue.pending()[0].needsIdentityReview,true);
  assert.throws(()=>queue.decide(p.id,{decision:'accept',reason:'test',actor:'reviewer',now}),/Resolve case/);
  store.resolveEvent(key,{caseId:caseData.id,actor:'reviewer',reason:'Verified synthetic case mapping',now});
  assert.equal(queue.decide(p.id,{decision:'accept',reason:'Identity resolved and source reviewed',actor:'reviewer',now}).caseId,caseData.id);
 }finally{store.close();}
});

test('negative control detects a deliberately removed source-quote guard in memory',()=>{
 const Module=require('node:module'),file=path.resolve(__dirname,'../../src/services/business-ops/proposals.js'),source=fs.readFileSync(file,'utf8');
 const needle='!event.text.includes(o.quote)';assert.equal(source.split(needle).length,2);
 const broken=new Module(file,module);broken.filename=file;broken.paths=Module._nodeModulePaths(path.dirname(file));broken._compile(source.replace(needle,'false'),file);
 const store=new OperationsStore(':memory:');seed(store);let detected=false;
 try{const queue=new broken.exports.ProposalQueue(store),key=store.ingest(stages[0].event,{now}).eventKey;
  try{assert.throws(()=>queue.propose(key,[task({quote:'invented source quote'})],{actor:'proposer',now}));}catch(error){if(error.code!=='ERR_ASSERTION')throw error;detected=true;}
  assert.equal(detected,true,'The broken guard must fail the same source-quote expectation');
 }finally{store.close();}
});
