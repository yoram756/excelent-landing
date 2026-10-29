const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {prepareReplayUpdate}=require('../../src/webhooks/intake/prepare-replay-update');
const {patchIntake}=require('../../src/webhooks/intake/patch-export');
const {patch}=require('../../src/services/funnel/error-workflow-patch');
function fixture(){
 const old=patch(JSON.parse(fs.readFileSync(require.resolve('./fixtures/intake-before-guards.json'))),{role:'leadIntake'});
 const w=patchIntake(old,{lockUrl:'http://127.0.0.1:8787',lockCredentialId:'SyntheticLock0001'});
 w.id=old.id;w.activeVersionId='60101067-81e0-4daa-b9b2-d4cfa7b9d736';
 w.staticData={private:'must never be exported'};w.nodes.find(n=>n.name==='Validate').parameters.jsCode='return [{json:{legacy:true}}];';
 w.nodes.find(n=>n.name==='Check save').parameters.jsCode='return [{json:{legacy:true}}];';return w;
}
test('41-node packet changes only the paired source parameters and never mutates the export',()=>{
 const w=fixture(),before=structuredClone(w),r=prepareReplayUpdate(w);assert.deepEqual(w,before);
 assert.deepEqual(r.replacements.map(n=>n.name),['Validate','Check save']);
 assert.match(r.replacements[0].jsCode,/idempotency_conflict/);assert.match(r.replacements[1].jsCode,/binding_version:1/);
 assert.equal(r.preservation.staticDataMustBeRetained,true);assert.equal(r.preservation.settingsChanged,false);
 assert.equal(r.deploymentStatus,'BLOCKED');assert.equal(JSON.stringify(r).includes('must never be exported'),false);
 for(const n of r.replacements){assert.notEqual(n.fromSha256,n.toSha256);assert.equal(n.parameter,'jsCode');assert.equal(n.credentials,undefined);}
});
test('unsafe topology, enabled send, missing error handling and version drift are rejected',()=>{
 for(const mutate of [w=>w.nodes.pop(),w=>w.nodes[0].name=w.nodes[1].name,w=>w.nodes[0].id=w.nodes[1].id,
  w=>w.nodes.find(n=>n.name==='WhatsApp alert').disabled=false,w=>w.nodes.find(n=>n.name==='WhatsApp recipients').disabled=false,
  w=>w.nodes.find(n=>n.name==='Stop And Error').disabled=true,w=>w.settings.errorWorkflow='other',
  w=>w.connections['Atomic lock response'].main[0]=[],w=>w.connections['Needs save?'].main[0].push({node:'Find query',type:'main',index:0}),w=>w.activeVersionId=null]){
  const w=fixture();mutate(w);const before=structuredClone(w);assert.throws(()=>prepareReplayUpdate(w),/Expected|Unexpected|version/);assert.deepEqual(w,before);
 }
});
test('packet source compiles, preserves campaign injection and does not contain executable deployment',()=>{
 const r=prepareReplayUpdate(fixture());for(const n of r.replacements){new Function('$input','$','$getWorkflowStaticData',n.jsCode);assert.doesNotMatch(n.jsCode,/__INTAKE__|__PRODUCT_CATALOG__/);}
 const source=fs.readFileSync(require.resolve('../../src/webhooks/intake/prepare-replay-update'),'utf8');assert.doesNotMatch(source,/fetch\(|https\.request|execFile|spawn\(/);
});
