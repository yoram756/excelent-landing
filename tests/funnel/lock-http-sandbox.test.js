const test=require('node:test'),assert=require('node:assert/strict');
const{build}=require('./build-lock-http-sandbox');
const base=require('../../src/services/funnel/dist/intake.json');
test('HTTP sandbox enforces exact synthetic body, real authentication, private writes and no saved Authorization headers',()=>{
 const{workflow:w,payload}=build(base,{webhookPath:'excelent-intake-test-'+('a'.repeat(32))});const n=name=>w.nodes.find(x=>x.name===name);
 assert.equal(w.active,false);assert.equal(n('Lead webhook').parameters.authentication,'headerAuth');assert.deepEqual(n('Lead webhook').credentials,n('Lock').credentials);
 assert.equal(w.settings.saveDataSuccessExecution,'none');assert.equal(w.settings.saveDataErrorExecution,'none');assert.equal(w.settings.saveManualExecutions,false);
 const guard=new Function('$input',n('Synthetic fixture').parameters.jsCode),run=body=>guard({first:()=>({json:{body,headers:{authorization:'TEST_ONLY_DO_NOT_STORE'}}})});
 assert.deepEqual(run(payload),[{json:{body:payload,headers:{}}}]);
 for(const bad of [{...payload,phone:'0501234567'},{...payload,marketing_consent:true},{...payload,other:1}])assert.throws(()=>run(bad),/Synthetic HTTP body only/);
 assert.throws(()=>build(base,{webhookPath:'public'}),/Fresh private test path required/);
 assert.equal(n('Instant reply').alwaysOutputData,true);assert.equal(n('Instant reply').parameters.options.waitForSubWorkflow,true);assert.equal(n('Instant reply').onError,undefined);
 for(const x of w.nodes)if(x.type==='n8n-nodes-base.code')new Function(x.parameters.jsCode);
 const names=new Set(w.nodes.map(x=>x.name));for(const[from,c]of Object.entries(w.connections)){assert.ok(names.has(from));for(const rows of Object.values(c))for(const row of rows)for(const edge of row)assert.ok(names.has(edge.node));}
});
