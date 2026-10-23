const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Store}=require('../../src/services/lifecycle/store'),{backup,restore}=require('../../src/services/lifecycle/backup'),campaign=require('../../config/lifecycle/refi.json');
const START='2026-10-18T09:00:00.000Z',NOW='2026-10-20T09:00:00.000Z',AFTER='2026-10-20T09:02:00.000Z';
const intake=(n=40)=>({eventId:'source-'+n,campaign,now:START,receipt:{version:'lifecycle-consent-v1',campaignId:'refi',receivedAt:START,recipients:{phone:'05000000'+n,email:'test'+n+'@example.invalid'},grants:{whatsapp:true,email:true,sms:true}}});
function setup(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'excelent-recovery-')),source=path.join(root,'source.sqlite'),target=path.join(root,'snapshot.sqlite'),recovered=path.join(root,'recovered.sqlite'),s=new Store(source,{sandbox:true});const open=[s];t.after(()=>{for(const x of open)try{x.close();}catch{}fs.rmSync(root,{recursive:true,force:true});});return {root,source,target,recovered,s,open};}
test('live WAL backup preserves optout, feedback, consent, events and inbox across offline restore',t=>{
 const f=setup(t),e=f.s.ingest(intake());f.s.withdraw({eventId:'withdraw',enrollmentId:e.enrollmentId,channels:['whatsapp','sms'],now:NOW});f.s.record({eventId:'stop',enrollmentId:e.enrollmentId,type:'optout',now:NOW});f.s.saveFeedback({eventId:'feedback',enrollmentId:e.enrollmentId,answers:{reason:'תזמון לא מתאים'},now:NOW});
 assert.ok(fs.existsSync(f.source+'-wal'));const original=f.s.snapshot(),m=backup(f.s,{target:f.target,root:f.root,now:NOW});assert.equal(f.s.restorePending(),false);assert.deepEqual(f.s.snapshot(),original);assert.ok(fs.existsSync(f.target+'.manifest.json'));assert.equal(m.eventFrontier,4);
 const r=restore({source:f.target,manifest:m,target:f.recovered,root:f.root,now:AFTER});f.open.push(r);assert.deepEqual(r.snapshot(),original);assert.equal(r.restorePending(),true);assert.equal(r.ingest(intake()).replayed,true);assert.equal(r.get('SELECT COUNT(*) AS n FROM inbox').n,4);assert.equal(JSON.parse(r.snapshot().enrollments[0].consent).grants.email,true);
 assert.equal(r.reserve({enrollmentId:e.enrollmentId,workerId:'restored',now:AFTER}).reason,'restore_reconciliation_required');
});
test('snapshot itself is quarantined before manifest publication, not just after a restore completes',t=>{
 const f=setup(t),e=f.s.ingest(intake());backup(f.s,{target:f.target,root:f.root,now:NOW});const direct=new Store(f.target,{sandbox:true});f.open.push(direct);assert.equal(direct.restorePending(),true);assert.equal(direct.reserve({enrollmentId:e.enrollmentId,workerId:'direct-copy',now:NOW}).reason,'restore_reconciliation_required');
});
test('inflight attempts remain unknown and inherited contact/CRM leases are revoked on restore',t=>{
 const f=setup(t),a=f.s.ingest(intake()),b=f.s.ingest(intake(41)),p=f.s.claimProjection({workerId:'old-crm',now:NOW}),r1=f.s.reserve({enrollmentId:a.enrollmentId,workerId:'before',now:NOW}),r2=f.s.reserve({enrollmentId:b.enrollmentId,workerId:'before2',now:NOW});f.s.beginDispatch({...r1,now:NOW});
 const m=backup(f.s,{target:f.target,root:f.root,now:NOW}),r=restore({source:f.target,manifest:m,target:f.recovered,root:f.root,now:AFTER});f.open.push(r);assert.equal(r.snapshot().outbox.find(x=>x.key===r1.key).state,'unknown');assert.equal(r.snapshot().outbox.find(x=>x.key===r2.key).state,'queued');assert.equal(r.snapshot().outbox.find(x=>x.key===r2.key).token,null);assert.equal(r.claimProjection({workerId:'new-crm',now:AFTER}),null);
 assert.throws(()=>r.beginDispatch({...r2,now:AFTER}),e=>e.code==='RESTORE_PENDING');assert.throws(()=>r.acknowledgeProjection({...p,receipt:'mock',now:AFTER}),e=>e.code==='RESTORE_PENDING');
});
test('post-snapshot optout is not invented; the restored copy remains blocked until reconciliation',t=>{
 const f=setup(t),e=f.s.ingest(intake()),m=backup(f.s,{target:f.target,root:f.root,now:NOW});f.s.record({eventId:'later-optout',enrollmentId:e.enrollmentId,type:'optout',now:AFTER});const r=restore({source:f.target,manifest:m,target:f.recovered,root:f.root,now:AFTER});f.open.push(r);
 assert.equal(r.snapshot().subjects[0].stop_reason,null);assert.equal(r.reserve({enrollmentId:e.enrollmentId,workerId:'blocked',now:AFTER}).status,'BLOCKED');r.record({eventId:'later-optout',enrollmentId:e.enrollmentId,type:'optout',now:AFTER});assert.equal(r.snapshot().subjects[0].stop_reason,'optout');assert.equal(r.restorePending(),true);
});

test('restored inflight CRM write becomes unknown and retains its reconciliation frame and target binding',t=>{
 const f=setup(t);f.s.ingest(intake());const p=f.s.claimProjection({workerId:'crm',now:NOW});f.s.beginProjection({...p,binding:'monday:5106403803:1234567',payloadHash:'a'.repeat(64),payload:'synthetic-reconciliation-frame',now:NOW});
 const m=backup(f.s,{target:f.target,root:f.root,now:NOW}),r=restore({source:f.target,manifest:m,target:f.recovered,root:f.root,now:AFTER});f.open.push(r);assert.equal(r.snapshot().projections[0].state,'unknown');assert.equal(r.get("SELECT value FROM runtime_control WHERE key=?",'crm_frame:'+p.eventId).value,'synthetic-reconciliation-frame');assert.equal(r.claimProjection({workerId:'no-retry',now:AFTER}),null);assert.throws(()=>r.beginProjection({...p,binding:'other',payloadHash:'a'.repeat(64),now:AFTER}),e=>e.code==='RESTORE_PENDING');
});
test('checksum and manifest mismatch fail before creating a recovery destination',t=>{
 const f=setup(t);f.s.ingest(intake());const m=backup(f.s,{target:f.target,root:f.root,now:NOW});for(const altered of [{...m,sha256:'0'.repeat(64)},{...m,eventFrontier:m.eventFrontier+1},{...m,tables:{...m.tables,subjects:99}}])assert.throws(()=>restore({source:f.target,manifest:altered,target:f.recovered,root:f.root,now:NOW}),/checksum|manifest/);assert.ok(!fs.existsSync(f.recovered));
});
test('truncated backup fails checksum and existing targets are never overwritten',t=>{
 const f=setup(t);f.s.ingest(intake());const m=backup(f.s,{target:f.target,root:f.root,now:NOW});assert.throws(()=>backup(f.s,{target:f.target,root:f.root,now:NOW}),/exists/);fs.writeFileSync(f.recovered,'keep me');assert.throws(()=>restore({source:f.target,manifest:m,target:f.recovered,root:f.root,now:NOW}),/new sandbox/);assert.equal(fs.readFileSync(f.recovered,'utf8'),'keep me');fs.truncateSync(f.target,100);assert.throws(()=>restore({source:f.target,manifest:m,target:path.join(f.root,'different.sqlite'),root:f.root,now:NOW}),/checksum/);
});
test('recovery paths reject traversal, URI filenames and a source path outside the explicit root',t=>{
 const f=setup(t);f.s.ingest(intake());for(const target of [path.join(f.root,'..','escaped.sqlite'),'file:other.sqlite','relative.sqlite',path.join(f.root,'bad.txt')])assert.throws(()=>backup(f.s,{target,root:f.root,now:NOW}));assert.ok(!fs.existsSync(f.target));
});
test('schema one migrates atomically without losing intake, and recovery requires schema three',t=>{
 const f=setup(t),e=f.s.ingest(intake());f.s.db.exec('DROP TABLE runtime_control; PRAGMA user_version=1;');f.s.close();const migrated=new Store(f.source,{sandbox:true});f.open.push(migrated);assert.equal(migrated.get('PRAGMA user_version').user_version,3);assert.equal(migrated.snapshot().enrollments[0].id,e.enrollmentId);assert.equal(migrated.ingest(intake()).replayed,true);
 const m=backup(migrated,{target:f.target,root:f.root,now:NOW});assert.equal(m.schemaVersion,3);assert.equal(migrated.restorePending(),false);
});
test('crash after VACUUM leaves only a non-runtime staging file, never an unblocked published snapshot',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'excelent-backup-crash-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const env={...process.env,NODE_NO_WARNINGS:'1'};delete env.NODE_TEST_CONTEXT;
 const result=require('node:child_process').spawnSync(process.execPath,[path.join(__dirname,'recovery-crash-worker.js'),root],{env,encoding:'utf8',windowsHide:true,timeout:15000});assert.equal(result.status,73,result.stderr);assert.ok(!fs.existsSync(path.join(root,'snapshot.sqlite')));assert.ok(!fs.existsSync(path.join(root,'snapshot.sqlite.manifest.json')));
 const leftovers=fs.readdirSync(root).filter(n=>n.endsWith('.partial'));assert.equal(leftovers.length,1);assert.throws(()=>new Store(path.join(root,leftovers[0]),{sandbox:true}),/staging/);
});
test('existing destination sidecars are preserved and reject both backup and restore',t=>{
 const f=setup(t);f.s.ingest(intake());const m=backup(f.s,{target:f.target,root:f.root,now:NOW});for(const suffix of ['-wal','-shm','-journal']){
  const occupied=path.join(f.root,'occupied'+suffix.replace('-','')+'.sqlite'),sidecar=occupied+suffix;fs.writeFileSync(sidecar,'preserve');assert.throws(()=>restore({source:f.target,manifest:m,target:occupied,root:f.root,now:NOW}),/sidecars/);assert.throws(()=>backup(f.s,{target:occupied,root:f.root,now:NOW}),/sidecars/);assert.throws(()=>new Store(occupied,{sandbox:true}),/sidecars/);assert.equal(fs.readFileSync(sidecar,'utf8'),'preserve');assert.ok(!fs.existsSync(occupied));
 }
});
test('unexpected backup-source sidecars are rejected without altering their contents',t=>{
 const f=setup(t);f.s.ingest(intake());const m=backup(f.s,{target:f.target,root:f.root,now:NOW}),sidecar=f.target+'-journal';fs.writeFileSync(sidecar,'preserve-source');assert.throws(()=>restore({source:f.target,manifest:m,target:f.recovered,root:f.root,now:NOW}),/sidecars/);assert.equal(fs.readFileSync(sidecar,'utf8'),'preserve-source');assert.ok(!fs.existsSync(f.recovered));
});
test('a checksum-valid source without quarantine cannot be accepted as a recovery snapshot',t=>{
 const f=setup(t);f.s.ingest(intake());const m=backup(f.s,{target:f.target,root:f.root,now:NOW}),db=new (require('node:sqlite').DatabaseSync)(f.target);db.exec("DELETE FROM runtime_control WHERE key='restore_pending'");db.close();const modified={...m,sha256:require('node:crypto').createHash('sha256').update(fs.readFileSync(f.target)).digest('hex'),tables:{...m.tables,runtime_control:0}};
 assert.throws(()=>restore({source:f.target,manifest:modified,target:f.recovered,root:f.root,now:NOW}),/quarantined/);assert.ok(!fs.existsSync(f.recovered));
});
test('crash at the beginning of restore copying cannot publish an empty runtime database',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'excelent-restore-crash-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const env={...process.env,NODE_NO_WARNINGS:'1'};delete env.NODE_TEST_CONTEXT;
 const result=require('node:child_process').spawnSync(process.execPath,[path.join(__dirname,'recovery-crash-worker.js'),root,'restore'],{env,encoding:'utf8',windowsHide:true,timeout:15000});assert.equal(result.status,73,result.stderr);assert.ok(!fs.existsSync(path.join(root,'restored.sqlite')));const stages=fs.readdirSync(root).filter(n=>n.endsWith('.partial'));assert.equal(stages.length,1);assert.throws(()=>new Store(path.join(root,stages[0]),{sandbox:true}),/staging/);
});
