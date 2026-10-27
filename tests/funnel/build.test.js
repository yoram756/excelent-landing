const test=require('node:test');const assert=require('node:assert/strict');const {execFileSync}=require('child_process');const path=require('path');
const D=path.resolve(__dirname,'../../src/services/funnel');
execFileSync('node',[D+'/build-workflows.js','test']);
const wfs=['engine-test','go','calendly'].map(f=>require(D+'/dist/'+f+'.json'));
const instantWf=require(D+'/dist/instant-reply-test.json');
const smsWf=require(D+'/dist/sms-inbound-test.json');

test('live fallback nodes remain disabled while their credential ids are PENDING',t=>{
  const fs=require('fs'),os=require('os'),root=path.resolve(__dirname,'../..');
  const temporaryRoot=fs.mkdtempSync(path.join(os.tmpdir(),'funnel-live-build-'));
  t.after(()=>{assert.ok(path.resolve(temporaryRoot).startsWith(path.resolve(os.tmpdir())+path.sep+'funnel-live-build-'));fs.rmSync(temporaryRoot,{recursive:true,force:true});});
  fs.cpSync(root+'/src',temporaryRoot+'/src',{recursive:true,filter:p=>!/[\\/](dist|runtime)([\\/]|$)/.test(p)});
  fs.cpSync(root+'/config',temporaryRoot+'/config',{recursive:true});
  const temporaryD=temporaryRoot+'/src/services/funnel';
  execFileSync('node',[temporaryD+'/build-workflows.js','live','2026-10-26T16:08:56.417Z'],{env:{...process.env,CAMPAIGN:'refi',META_WA_PHONE_NUMBER_ID:'100000000000001',META_WA_CREDENTIAL_ID:'TestMetaCred01'},stdio:'pipe'});
  const live=JSON.parse(fs.readFileSync(temporaryD+'/dist/live/engine-live.json','utf8'));
  for(const name of ['Send SMS','Send email']){
    const n=live.nodes.find(n=>n.name===name);
    assert.ok(n.credentials.httpHeaderAuth.id.startsWith('PENDING'));
    assert.equal(n.disabled,true,name+' cannot run without a real credential');
  }
});
test('SMS inbound: every placeholder injected, every connection valid, opt-out writes only after a match',()=>{const names=new Set(smsWf.nodes.map(x=>x.name));
  for(const x of smsWf.nodes)if(x.type==='n8n-nodes-base.code')assert.doesNotMatch(x.parameters.jsCode,/__(CONFIG|BUSINESS|TEXTME|FALLBACK)__/,x.name);
  for(const [a,c] of Object.entries(smsWf.connections)){assert.ok(names.has(a),a);for(const br of c.main)for(const x of br)assert.ok(names.has(x.node),x.node);}
  assert.deepEqual(smsWf.connections['Opt-out?'].main[0].map(x=>x.node),['Find by phone']);assert.equal(smsWf.nodes.find(x=>x.type==='n8n-nodes-base.webhook').parameters.path,'__SMS_INBOUND_PATH__');});
test('every injected library and config placeholder is replaced in every Code node',()=>{for(const w of [...wfs,instantWf])for(const x of w.nodes)if(x.type==='n8n-nodes-base.code')assert.doesNotMatch(x.parameters.jsCode,/__(CONFIG|BUSINESS|CRM_FIELDS|CHANNELS|GAMBOT_HSM|FALLBACK|TEXTME|MODE|PILOT|GO_LIVE|INTAKE)__/,w.name+' / '+x.name);});

test('every workflow JSON body expression compiles, including SMS inbound',()=>{
  for(const w of [...wfs,instantWf,smsWf])for(const n of w.nodes){
    const b=n.parameters.jsonBody;
    if(typeof b==='string'&&b.startsWith('={{'))assert.doesNotThrow(()=>new Function('return ('+b.slice(3,-2)+')'),w.name+' / '+n.name);
  }
});

test('SMS phone lookup evaluates to the configured column and all normalized phone forms',()=>{
  const cfg=require('../../src/config/campaigns/refi.json');
  const expression=smsWf.nodes.find(n=>n.name==='Find by phone').parameters.jsonBody;
  const body=JSON.parse(new Function('$json','return ('+expression.slice(3,-2)+')')({local:'0500000040',phone:'972500000040'}));
  assert.ok(body.query.includes('column_id:'+JSON.stringify(cfg.columns.phone)));
  assert.equal(body.variables.b,String(cfg.board));
  assert.deepEqual(body.variables.v,['0500000040','972500000040','+972500000040']);
});
test('engine Plan carries the CRM field mapping and the channel decision',()=>{const p=wfs[0].nodes.find(x=>x.name==='Plan').parameters.jsCode;assert.match(p,/leadTemperature/);assert.match(p,/nextChannel/);});
test('a final WhatsApp failure notifies the fallback after the Monday update; SMS and email senders exist only disabled without a provider or in a test build',()=>{const e=wfs[0];
  assert.deepEqual(e.connections['Update item (sent)'].main[0].map(x=>x.node),['Fallback?']);assert.deepEqual(e.connections['Fallback?'].main[0].map(x=>x.node),['Notify fallback','Fallback channel']);
  assert.deepEqual(e.connections['Fallback channel'].main.map(br=>br.map(x=>x.node)),[['Send SMS'],['Send email']]);
  for(const n of e.nodes)if(n.type==='n8n-nodes-base.httpRequest'){
    if(n.name==='Send SMS'||n.name==='Send email'){assert.equal(n.disabled,true,n.name);assert.match(n.parameters.url,/fallbackSend\.request\.url/,n.name);}
    else if(n.name==='Send WhatsApp'){assert.match(n.parameters.url,/^https:\/\/graph\.facebook\.com\/v\d+\.\d+\/\{phone_number_id\}\/messages$/,n.name);assert.equal(n.disabled,true,'a test build never sends');}
    else assert.match(n.parameters.url,/monday\.com|gambot\.co\.il|hebcal\.com/,n.name);}});
test('instant reply runs only from the intake workflow and cannot send from a test build or without an approved template',()=>{const w=instantWf;
  const names=new Set(w.nodes.map(x=>x.name));for(const [a,c] of Object.entries(w.connections)){assert.ok(names.has(a),a);for(const br of c.main)for(const x of br)assert.ok(names.has(x.node),x.node);}
  assert.equal(w.nodes[0].type,'n8n-nodes-base.executeWorkflowTrigger');assert.ok(!w.nodes.some(n=>n.type==='n8n-nodes-base.webhook'));
  assert.equal(w.nodes.find(n=>n.name==='Send WhatsApp').disabled,true);});
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
