const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const source=fs.readFileSync(path.resolve(__dirname,'../../src/services/funnel/calendly-ack.js'),'utf8');
const run=(r,store={})=>new Function('$json','$','$getWorkflowStaticData',source)(r,()=>({item:{json:{itemId:'123',mailId:'mail-1'}}}),()=>store);
test('successful final Monday write acknowledges mail once',()=>{const store={};assert.equal(run({data:{change_multiple_column_values:{id:'123'}}},store).json.saved,true);assert.ok(store.seen['mail-1']);});
test('GraphQL partial failure does not acknowledge Calendly mail',()=>{const store={};assert.throws(()=>run({data:{change_multiple_column_values:{id:'123'}},errors:[{message:'partial'}]},store),/not confirmed/);assert.equal(store.seen,undefined);});
test('missing or wrong write target does not acknowledge Calendly mail',()=>{for(const r of [{data:{}},{data:{change_multiple_column_values:{id:'456'}}}]){const store={};assert.throws(()=>run(r,store));assert.equal(store.seen,undefined);}});
