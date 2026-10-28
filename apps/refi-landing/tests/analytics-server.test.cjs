const test=require('node:test'),assert=require('node:assert/strict');
const {createServer}=require('./server.cjs');
test('local verification never exposes the production analytics binding',async()=>{
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try{
    assert.deepEqual(await (await fetch(base+'/analytics-config.json')).json(),{key:'',host:''});
    await fetch(base+'/__test/analytics?enabled=true');
    assert.deepEqual(await (await fetch(base+'/analytics-config.json')).json(),{key:'phc_TEST_CRO_VERIFICATION_ONLY',host:'https://analytics.example.invalid'});
    await fetch(base+'/__test/analytics?enabled=false');
    assert.deepEqual(await (await fetch(base+'/analytics-config.json')).json(),{key:'',host:''});
  }finally{await new Promise(resolve=>server.close(resolve));}
});
