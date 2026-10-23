const test=require('node:test');const assert=require('node:assert/strict');const {execFileSync}=require('child_process');const path=require('path');
const D=path.resolve(__dirname,'../../src/services/funnel');
execFileSync('node',[D+'/build-workflows.js','test']);
const wfs=['engine-test','go','calendly'].map(f=>require(D+'/dist/'+f+'.json'));
test('every connection points at an existing node',()=>{for(const w of wfs){const n=new Set(w.nodes.map(x=>x.name));for(const [a,c] of Object.entries(w.connections)){assert.ok(n.has(a),a);for(const br of c.main)for(const x of br)assert.ok(n.has(x.node),x.node);}}});
test('no expression contains a run of closing braces (n8n breaks on it)',()=>{for(const w of wfs)for(const x of w.nodes){const b=x.parameters.jsonBody;if(typeof b==='string'&&b.startsWith('={{'))assert.ok(!/\}\}/.test(b.slice(3,-2)),w.name+' / '+x.name);}});
test('test build never contains a live engine',()=>{const p=wfs[0].nodes.find(x=>x.name==='Plan').parameters.jsCode;assert.ok(p.includes("MODE = 'test'"));});
test('test build physically disables the WhatsApp HTTP node',()=>{assert.equal(wfs[0].nodes.find(n=>n.name==='Send WhatsApp').disabled,true);});
test('no secret test path is baked into the build',()=>{for(const w of wfs)for(const x of w.nodes)if(x.type==='n8n-nodes-base.webhook'&&x.name==='Run test')assert.ok(x.parameters.path.startsWith('__TEST_PATH__'));});
test('rebuilding gives identical files (no churn in git)',()=>{const fs=require('fs');const before=fs.readFileSync(D+'/dist/go.json','utf8');execFileSync('node',[D+'/build-workflows.js','test']);assert.equal(fs.readFileSync(D+'/dist/go.json','utf8'),before);});

test('Monday pagination requests the next cursor and stops on terminal/error responses',()=>{
  const evaluate=(expression,$pageCount,body)=>new Function('$pageCount','$response','return ('+expression.slice(3,-2)+')')($pageCount,{body});
  for(const w of wfs){
    const fetch=w.nodes.find(n=>n.name==='Fetch pages');
    const p=fetch.parameters.options.pagination.pagination;
    assert.equal(p.paginationMode,'updateAParameterInEachRequest');
    assert.equal(p.limitPagesFetched,true);assert.equal(p.maxRequests,50);
    const first=evaluate(p.parameters.parameters[0].value,0,undefined);
    assert.equal(first,JSON.parse(fetch.parameters.jsonBody).query);
    assert.ok(first.includes('cursor items'));
    const next={data:{boards:[{items_page:{items:[],cursor:'opaque-cursor'}}]}};
    assert.ok(evaluate(p.parameters.parameters[0].value,1,next).includes('cursor:"opaque-cursor"'));
    assert.equal(evaluate(p.completeExpression,0,next),false);
    assert.equal(evaluate(p.completeExpression,1,{data:{boards:[{items_page:{items:[],cursor:null}}]}}),true);
    assert.equal(evaluate(p.completeExpression,1,{errors:[{message:'failed'}]}),true);
    assert.deepEqual(w.connections['Fetch pages'].main[0].map(x=>x.node),['Items']);
    assert.equal(w.nodes.find(n=>n.name==='Items').type,'n8n-nodes-base.code');
  }
});

test('runtime probe has only manual trigger, Crypto and computation, with no credentials',()=>{
  execFileSync('node',[path.join(__dirname,'build-runtime-probe.js')]);
  const probe=JSON.parse(require('fs').readFileSync(D+'/dist/runtime-probe.json','utf8'));
  assert.equal(probe.active,false);
  assert.deepEqual(probe.nodes.map(n=>n.type),['n8n-nodes-base.manualTrigger','n8n-nodes-base.code','n8n-nodes-base.crypto','n8n-nodes-base.code']);
  assert.ok(probe.nodes.every(n=>!n.credentials));
  const rows=Array.from({length:100},(_,i)=>({json:{itemId:String(i+1),secureToken:require('crypto').randomBytes(16).toString('hex')}}));
  const r=new Function('$input',probe.nodes[3].parameters.jsCode)({all:()=>rows})[0].json;
  assert.equal(r.passed,true);
});

test('isolated intake probe has no messaging endpoints or automatic triggers',()=>{
  execFileSync('node',[path.join(__dirname,'build-intake-probe.js')]);
  const p=JSON.parse(require('fs').readFileSync(D+'/dist/intake-probe.json','utf8'));
  assert.equal(p.active,false);
  assert.ok(p.nodes.every(n=>['n8n-nodes-base.manualTrigger','n8n-nodes-base.code','n8n-nodes-base.httpRequest'].includes(n.type)));
  assert.ok(p.nodes.filter(n=>n.type==='n8n-nodes-base.httpRequest').every(n=>n.parameters.url==='https://api.monday.com/v2'));
  assert.ok(p.nodes.some(n=>n.name==='Guard synthetic phone ownership'));
  assert.ok(p.nodes.some(n=>n.name==='Archive synthetic lead'));
});

test('acceptance exports are manual only and sandbox transport cannot call messaging providers',()=>{
  const fs=require('fs');
  for(const name of ['acceptance-probe','sandbox-journey','channel-intake-probe']){
    execFileSync('node',[path.join(__dirname,'build-'+name+'.js')]);
    const w=JSON.parse(fs.readFileSync(D+'/dist/'+name+'.json','utf8'));
    assert.equal(w.active,false);
    assert.equal(w.nodes.filter(n=>n.type.endsWith('.manualTrigger')).length,1);
    assert.ok(w.nodes.every(n=>['manualTrigger','code','crypto','httpRequest'].some(t=>n.type==='n8n-nodes-base.'+t)));
    for(const n of w.nodes){
      if(n.type.endsWith('.httpRequest'))assert.equal(n.parameters.url,'https://api.monday.com/v2');
      if(n.type.endsWith('.code'))new Function(n.parameters.jsCode);
      const b=n.parameters.jsonBody;
      if(b?.startsWith('={{')){assert.ok(!/\}\}/.test(b.slice(3,-2)),n.name);new Function('return ('+b.slice(3,-2)+')');}
    }
    if(name==='acceptance-probe')assert.ok(w.nodes.every(n=>!n.credentials));
    else {assert.ok(w.nodes.some(n=>n.name==='Guard sandbox ownership'));assert.ok(w.nodes.some(n=>n.name==='Archive synthetic item'));}
  }
});
