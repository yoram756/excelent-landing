'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {OperationsStore,hash}=require('../../src/services/business-ops/store');
const {project,reconcileProjection}=require('../../src/services/business-ops/monday');
const {seed,stages,applyStage,caseData,event,task,now}=require('./scenario');
function setup(){const s=new OperationsStore(':memory:');seed(s);return s;}
test('call → email → spouse WhatsApp completes one task with proof and unblocks the next',()=>{
 const s=setup();try{
  const first=applyStage(s,stages[0]).snapshot;assert.equal(first.tasks.length,2);assert.equal(first.tasks.find(t=>t.commitmentKey==='contact-banker').state,'blocked');
  const draft=s.draft(caseData.id,'collect-documents',{now});assert.ok(draft.approvalRequired);assert.equal(s.draft(caseData.id,'collect-documents',{now}).id,draft.id);assert.equal(s.get('SELECT COUNT(*) n FROM ops_drafts').n,1);
  const second=applyStage(s,stages[1]).snapshot;assert.equal(second.tasks.find(t=>t.commitmentKey==='collect-documents').state,'waiting_customer');assert.equal(s.get('SELECT state FROM ops_drafts').state,'canceled_reply');assert.equal(s.draft(caseData.id,'collect-documents',{now}),null);
  const final=applyStage(s,stages[2]).snapshot;assert.equal(final.tasks.length,2);assert.equal(final.tasks.find(t=>t.commitmentKey==='collect-documents').state,'completed');assert.equal(final.tasks.find(t=>t.commitmentKey==='contact-banker').state,'not_started');assert.equal(final.tasks.find(t=>t.commitmentKey==='collect-documents').evidence.length,2);assert.equal(final.dispatchEnabled,false);
  for(const [index,stage]of stages.entries()){const r=s.ingest(stage.event,{now});assert.ok(r.duplicate);const replay=s.review(r.eventKey,stage.observations,{actor:'reviewer',now});assert.ok(replay.duplicate);assert.equal(replay.snapshot.version,index+1);}
  assert.equal(s.metrics({now}).events,3);assert.equal(s.metrics({now}).tasks,2);assert.equal(s.metrics({now}).completed,1);assert.equal(s.metrics({now}).accuracy,null);
 }finally{s.close();}
});
test('same event id with changed content is rejected and whole invalid review rolls back',()=>{
 const s=setup();try{const r=s.ingest(stages[0].event,{now});assert.throws(()=>s.ingest({...stages[0].event,text:'different'},{now}),/conflict/);assert.throws(()=>s.review(r.eventKey,[task(),task({commitmentKey:'other',quote:'invented quote'})],{actor:'reviewer',now}),/quote/);assert.equal(s.get('SELECT COUNT(*) n FROM ops_tasks').n,0);assert.equal(s.get('SELECT reviewed_at FROM ops_events').reviewed_at,null);}finally{s.close();}
});
test('names alone, multiple cases and conflicting identifiers never merge',()=>{
 const s=setup();try{assert.equal(s.resolve({name:'TEST same name'}).status,'review');s.registerCase({...caseData,id:'TEST-case-002'});assert.equal(s.resolve({phone:'0500000040'}).reason,'multiple_cases');assert.equal(s.resolve({caseId:caseData.id,phone:'0500000099'}).reason,'unknown_contact');assert.equal(s.resolve({caseId:caseData.id,phone:'0500000041'}).status,'linked');s.registerPerson({id:'TEST-other',emails:['other@example.invalid']});s.registerCase({...caseData,id:'TEST-case-other',customerId:'TEST-other-customer',participants:[{personId:'TEST-other',role:'client'}]});assert.equal(s.resolve({phone:'0500000040',email:'other@example.invalid'}).reason,'conflicting_identifiers');}finally{s.close();}
});
test('unknown identity requires a reasoned human resolution with audit history',()=>{
 const s=setup();try{const e=event('unknown','gmail','נתון לבדיקה',{caseId:undefined,phone:undefined});const r=s.ingest(e,{now});assert.equal(r.resolution.status,'review');assert.throws(()=>s.review(r.eventKey,[],{actor:'reviewer',now}),/Resolve/);s.resolveEvent(r.eventKey,{caseId:caseData.id,actor:'reviewer',reason:'Verified protected source mapping',now});assert.equal(s.get("SELECT COUNT(*) n FROM ops_audit WHERE action='identity_resolved'").n,1);}finally{s.close();}
});
test('reported send, unverified artifact and wrong artifact cannot complete a task',()=>{
 const s=setup();try{applyStage(s,stages[0]);const e=event('sent','whatsapp','שלחתי את כל המסמכים');const r=s.ingest(e,{now});s.review(r.eventKey,[{kind:'fact',quote:e.text}],{actor:'reviewer',now});assert.notEqual(s.taskByKey(caseData.id,'collect-documents').state,'completed');const x=s.ingest(event('bad-proof','manual','מסמך התקבל'),{now});const evidence={kind:'evidence',quote:'מסמך התקבל',commitmentKey:'collect-documents',evidenceKind:'document_validated',artifactId:'wrong-document',artifactDigest:hash('wrong'),verified:false};assert.throws(()=>s.review(x.eventKey,[evidence],{actor:'reviewer',now}),/Verified/);s.review(x.eventKey,[{...evidence,verified:true}],{actor:'reviewer',now});assert.notEqual(s.taskByKey(caseData.id,'collect-documents').state,'completed');}finally{s.close();}
});
test('duplicate commitments, dependency cycles, false completed status and missing handover are rejected',()=>{
 const s=setup();try{applyStage(s,stages[0]);const e=event('update','manual',stages[0].event.text);const r=s.ingest(e,{now});for(const o of [task({commitmentKey:'duplicate'}),task({dependsOn:['contact-banker']}),task({state:'completed'}),task({owner:'yoram'})])assert.throws(()=>s.review(r.eventKey,[o],{actor:'reviewer',now}));assert.equal(s.get('SELECT COUNT(*) n FROM ops_tasks').n,2);}finally{s.close();}
});
test('proposed deadlines stay distinct and history survives a newer correction',()=>{
 const s=setup();try{applyStage(s,stages[0]);assert.equal(s.taskByKey(caseData.id,'collect-documents').dueAt,null);const old=s.get("SELECT id FROM ops_observations WHERE kind='task' ORDER BY id").id;const r=s.ingest(event('correction','manual',stages[0].event.text+' עד מחר',{occurredAt:'2026-10-27T08:40:00Z'}),{now});s.review(r.eventKey,[task({supersedes:old,dueAt:'2026-10-28T08:00:00Z',dueQuote:'עד מחר'})],{actor:'reviewer',now});assert.equal(s.get('SELECT COUNT(*) n FROM ops_observations').n,3);assert.ok(s.taskByKey(caseData.id,'collect-documents').dueAt);const earlier=s.ingest(event('late','manual',stages[0].event.text,{occurredAt:'2026-10-26T08:00:00Z'}),{now});assert.throws(()=>s.review(earlier.eventKey,[task()],{actor:'reviewer',now}),/Older/);}finally{s.close();}
});
test('private/school sources and unsafe source URLs are rejected',()=>{
 const s=setup();try{for(const scope of ['school','private',null])assert.throws(()=>s.ingest({...stages[0].event,scope},{now}),/Business/);assert.throws(()=>s.ingest({...stages[0].event,url:'https://example.invalid/?token=secret'},{now}),/Source URL/);}finally{s.close();}
});
test('canonical Gmail message anchors and Drive sharing links remain traceable',()=>{
 const s=setup();try{const a=s.ingest({...stages[0].event,id:'gmail-link',url:'https://mail.google.com/mail/u/?authuser=client%40example.invalid#all/1a13f1b0123fb675'},{now});assert.equal(a.resolution.status,'linked');const b=s.ingest({...stages[0].event,id:'drive-link',url:'https://drive.google.com/file/d/TEST/view?usp=drivesdk'},{now});assert.equal(b.resolution.status,'linked');}finally{s.close();}
});
test('restart preserves events, evidence, task identity and replay deduplication',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'excellent-ops-')),file=path.join(dir,'ops.sqlite');let s=new OperationsStore(file);try{seed(s);for(const stage of stages)applyStage(s,stage);const ids=s.snapshot(caseData.id).tasks.map(t=>t.id);s.close();s=new OperationsStore(file);assert.deepEqual(s.snapshot(caseData.id).tasks.map(t=>t.id),ids);assert.ok(s.ingest(stages[2].event,{now}).duplicate);assert.equal(s.metrics({now}).completed,1);}finally{s.close();assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(dir).startsWith('excellent-ops-'));fs.rmSync(dir,{recursive:true,force:true});}
});
test('Monday sandbox adapter verifies independent readback and quarantines lost responses',async()=>{
 const s=setup(),target={boardId:'5106494186',itemId:'1234567',name:'TEST OPS journey',runId:'journey'};try{
  applyStage(s,stages[0]);let item={boardId:target.boardId,id:target.itemId,name:target.name,marker:'OPS:journey',text:'',status:'open'},writes=0;
  const transport={read:async()=>structuredClone(item),write:async(t,v)=>{writes++;item={...item,...v};}};
  assert.equal((await project({store:s,projectionId:caseData.id+':1',target,transport,now})).status,'acked');assert.equal(writes,1);await project({store:s,projectionId:caseData.id+':1',target,transport,now});assert.equal(writes,1);
  await assert.rejects(project({store:s,projectionId:caseData.id+':1',target:{...target,itemId:'7654321'},transport,now}),/target mismatch/);
  applyStage(s,stages[1]);const broken={...transport,write:async(t,v)=>{writes++;item={...item,...v};throw Error('timeout after commit');}};await assert.rejects(project({store:s,projectionId:caseData.id+':2',target,transport:broken,now}),/timeout/);await assert.rejects(project({store:s,projectionId:caseData.id+':2',target,transport,now}),/reconciliation/);assert.equal(writes,2);
  await assert.rejects(project({store:s,projectionId:caseData.id+':2',target:{...target,boardId:'5106315262'},transport,now}),/sandbox target/);
  const recovered=await reconcileProjection({store:s,projectionId:caseData.id+':2',target,transport,now});assert.equal(recovered.status,'acked');assert.equal(recovered.writePerformed,false);assert.equal(writes,2);
 }finally{s.close();}
});
test('Monday sandbox rejects real case identifiers before reserving a remote write',async()=>{
 const s=setup();try{applyStage(s,stages[0]);const row=s.get('SELECT * FROM ops_projection'),payload=JSON.parse(row.payload);payload.customerId='real-customer';s.run('UPDATE ops_projection SET payload=? WHERE id=?',JSON.stringify(payload),row.id);let calls=0;
 await assert.rejects(project({store:s,projectionId:row.id,target:{boardId:'5106494186',itemId:'1234567',name:'TEST OPS guard',runId:'guard'},transport:{read:async()=>{calls++;},write:async()=>{calls++;}},now}),/Synthetic case/);
 assert.equal(calls,0);assert.equal(s.get('SELECT state FROM ops_projection').state,'pending');}finally{s.close();}
});
