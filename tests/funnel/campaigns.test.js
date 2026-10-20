const test=require('node:test');const assert=require('node:assert/strict');const {execFileSync}=require('child_process');const path=require('path');const fs=require('fs');
const {planner,item}=require('./load');
const NOW='2026-10-20T09:00:00Z';const base={refi_phone:'0500000040',boolean_mm88mzry:{checked:'true'}};
const REQ=['id','name','service','goal','status','board','columns','stages','templates','entry','sequences','meeting','rules','links','handoff','kpiTargets'];
for(const f of fs.readdirSync(path.resolve(__dirname,'../../campaigns')).filter(f=>f.endsWith('.json'))){
  const c=require('../../campaigns/'+f);
  test('campaign '+c.id+' config is complete and consistent',()=>{
    for(const k of REQ)assert.ok(k in c,c.id+' missing '+k);
    const codes=new Set(Object.keys(c.templates));
    for(const [p,seq] of Object.entries(c.sequences))for(const s of seq)assert.ok(codes.has(s.code),c.id+' sequence '+p+' uses unknown '+s.code);
    for(const k of ['booked','reminder','noShow'])assert.ok(codes.has(c.meeting[k]),c.id+' meeting '+k);
    for(const t of Object.values(c.templates))if(t.dest)assert.ok(c.links[t.dest],c.id+' link '+t.dest);
  });
}
test('a second campaign runs on the same engine with its own messages',()=>{const cons=planner('test','2026-10-20T07:00:00Z','','consolidation');
  const [r]=cons({items:[item({cols:base})],now:NOW});assert.equal(r.campaign,'consolidation');assert.equal(r.send,null,'template not approved, nothing is sent');assert.ok(r.notifyText.includes('A1'));});
test('consolidation with an approved id would send its own first message',()=>{const c=require('../../campaigns/consolidation.json');const tmp=path.resolve(__dirname,'../../campaigns/_tmp_test.json');
  const x=JSON.parse(JSON.stringify(c));x.id='_tmp_test';x.templates.A1.id='1111111111';fs.writeFileSync(tmp,JSON.stringify(x));
  try{const p=planner('test','2026-10-20T07:00:00Z','','_tmp_test');const [r]=p({items:[item({cols:base})],now:NOW});assert.equal(r.send.templateId,'1111111111');assert.equal(r.code,'A1');}finally{fs.unlinkSync(tmp);}});
test('building a campaign does not touch the shared engine code and writes separate workflows',()=>{
  execFileSync('node',[path.resolve(__dirname,'../../automation/funnel/build-workflows.js'),'test'],{env:{...process.env,CAMPAIGN:'consolidation'}});
  const d=path.resolve(__dirname,'../../automation/funnel/dist/consolidation');const w=require(d+'/engine-test.json');
  assert.ok(w.name.includes('איחוד הלוואות'));const code=w.nodes.find(n=>n.name==='Plan').parameters.jsCode;assert.ok(code.includes('"id":"consolidation"'));
  assert.equal(require(d+'/go.json').nodes.find(n=>n.name==='Link').parameters.path,'go-consolidation');});
