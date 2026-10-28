const test=require('node:test'),a=require('node:assert/strict'),crypto=require('node:crypto');
const {verify,route}=require('../../src/integrations/cosend/prepare');
const raw=Buffer.from('{"object":"event"}'),secret='synthetic-test-only',t='1793000000';
const sig=crypto.createHmac('sha256',secret).update(t+'.').update(raw).digest('hex');
test('exact byte signatures, rotation, tampering, wrong key, stale/future and duplicate timestamp',()=>{
 a.equal(verify(raw,`t=${t},v1=${sig}`,secret,Number(t)*1000),true);
 a.equal(verify(Buffer.from('{}'),`t=${t},v1=${sig}`,secret,Number(t)*1000),false);
 a.equal(verify(raw,`t=${t},v1=${sig}`,'wrong',Number(t)*1000),false);
 for(const delta of [-301000,301000])a.equal(verify(raw,`t=${t},v1=${sig}`,secret,Number(t)*1000+delta),false);
 a.equal(verify(raw,`t=${t},t=${t},v1=${sig}`,secret,Number(t)*1000),false);
 a.equal(verify(raw,`t=${t},v1=bad,v1=${sig}`,secret,Number(t)*1000),true);
});
const scope={organizationId:'org_TEST',connectionId:'conn_TEST'};
const event=type=>({id:'evt_TEST',object:'event',type,organization_id:scope.organizationId,connection_id:scope.connectionId});
test('rejects other organizations, numbers and unbound connections',()=>{
 a.throws(()=>route(event('message.received'),{}));
 a.throws(()=>route({...event('message.received'),connection_id:'other'},scope));
 a.throws(()=>route({...event('message.received'),organization_id:'other'},scope));
});
test('contact and history events never create leads; no route sends or writes',()=>{
 for(const type of ['contact.created','contact.updated','history','onboarding.completed','ping'])a.equal(route(event(type),scope).route,'ignore');
 for(const type of ['message.received','message.status','message.echo']){const r=route(event(type),scope);a.notEqual(r.route,'ignore');a.equal(r.mayCreateLead,false);a.equal(r.maySend,false);}
});
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
test('transfer preserves exact historical bodies and reports missing bodies instead of inventing them',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cosend-review-'));
 cp.execFileSync(process.execPath,[path.resolve(__dirname,'../../scripts/prepare-cosend-transfer.js'),dir]);
 const source=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../docs/evidence/20261020/gambot-refi-v2-templates.json'),'utf8'));
 const inventory=JSON.parse(fs.readFileSync(path.join(dir,'inventory.json')));
 a.equal(inventory.length,16);a.deepEqual(inventory.filter(x=>x.status==='BLOCKED_MISSING_BODY').map(x=>x.code),['M1','M6','M10','M14']);
 for(const row of inventory.filter(x=>x.status==='PREPARED_NOT_SUBMITTED')){
  const d=JSON.parse(fs.readFileSync(path.join(dir,row.code+'.template-draft.json'))),s=source.find(x=>x.name===row.name);
  a.equal(d.payload.components.find(c=>c.type==='BODY').text,s.components.find(c=>c.type==='BODY').text);
  a.equal(d.submissionEnabled,false);a.equal(d.payload.language,'he');a.equal('id' in d.payload,false);
 }
 const workflow=JSON.parse(fs.readFileSync(path.join(dir,'cosend-review-workflow.json')));
 a.equal(workflow.active,false);a.deepEqual(workflow.nodes.map(n=>n.type),['n8n-nodes-base.manualTrigger','n8n-nodes-base.code']);
});
