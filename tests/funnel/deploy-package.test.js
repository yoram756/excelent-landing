// Deployment package (src/deploy/package.js): campaign validation, n8n workflow build, production env template.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'../..');
const pkg=require(ROOT+'/src/deploy/package');
const biz=require(ROOT+'/config/business.json');
const load=id=>JSON.parse(fs.readFileSync(ROOT+'/src/config/campaigns/'+id+'.json','utf8'));
const check=(c,file=c.id+'.json')=>pkg.validateCampaign(c,file,biz);

test('campaigns validate but Cosend activation remains blocked',()=>{
  const r=check(load('refi'));assert.deepEqual(r.errors,[]);assert.equal(r.liveReady,false);
  assert.ok(r.warnings.some(w=>w.startsWith('Cosend activation pending:')));
  assert.ok(r.warnings.includes('instant reply is off'));
  const c=check(load('consolidation'));assert.deepEqual(c.errors,[]);assert.equal(c.liveReady,false);
  for(const w of ['identity not approved by the owner: only test builds','template A1 (exc_cons_a1_ack) has no verified provider approval','no Meta campaign ids: Meta leads are rejected for this campaign','no intake block: patch-export.js cannot wire the intake for this campaign','status is draft'])
    assert.ok(c.warnings.includes(w),w);
  const all=pkg.validateAll();assert.deepEqual(all.reports.map(x=>x.campaign),['consolidation','refi']);assert.deepEqual(all.crossErrors,[]);});

test('a broken campaign file is rejected',()=>{
  const bad=(fn,re)=>{const c=load('refi');fn(c);assert.ok(check(c,'refi.json').errors.some(e=>re.test(e)),re+' '+JSON.stringify(check(c,'refi.json').errors));};
  bad(c=>{c.id='other';},/does not match the file name/);
  bad(c=>{c.board='abc';},/board id/);
  bad(c=>{delete c.columns.phone;},/column phone/);
  bad(c=>{c.templates.M1.id='12';},/template M1 id/);
  bad(c=>{c.sequences[Object.keys(c.sequences).find(k=>c.sequences[k].length)][0].code='NOPE';},/unknown template NOPE/);
  bad(c=>{c.instantReply.enabled=true;},/enabled without an approved template id/);
  bad(c=>{c.instantReply.withinSeconds=90;},/withinSeconds/);
  bad(c=>{c.channels.providers.whatsapp='other';},/cosend/);
  bad(c=>{c.channels.whatsappDeliveryEnabled=true;},/delivery disabled/);
  bad(c=>{c.identity.profile='nope';},/unknown identity profile/);
  bad(c=>{c.identity.contactPhone='yoram_050';},/contact phone not allowed/);
  bad(c=>{c.meta.campaignIds=['12a'];},/meta.campaignIds/);
  bad(c=>{c.crmFields.leadTemperature.bands.pop();},/bands must end at 0/);
  assert.deepEqual(pkg.crossChecks([{id:'a',meta:{campaignIds:['1']}},{id:'b',meta:{campaignIds:['1']}}]),['Meta campaign 1 in a and b']);});

test('.env.production.example is generated, lists every env var the code reads, and holds no secret value',()=>{
  const committed=fs.readFileSync(ROOT+'/.env.production.example','utf8').replace(/\r\n/g,'\n');
  assert.equal(committed,pkg.envFile(),'run node src/deploy/package.js after changing ENV');
  const keys=pkg.ENV.filter(e=>e.length>1).map(e=>e[0]);
  for(const k of ['LOCK_SERVER_HOST','LOCK_SERVER_TOKEN','GAMBOT_API_KEY','META_VERIFY_TOKEN'])assert.ok(keys.includes(k),k);
  const src=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?(e.name==='dist'?[]:src(path.join(d,e.name))):e.name.endsWith('.js')?[path.join(d,e.name)]:[]);
  const used=new Set();for(const f of src(ROOT+'/src')){const s=fs.readFileSync(f,'utf8');
    for(const m of s.matchAll(/process\.env\.([A-Z_]+)/g))used.add(m[1]);
    for(const m of s.matchAll(/\{([^{}]*)\}\s*=\s*process\.env/g))for(const p of m[1].split(','))used.add(p.split(/[:=]/)[0].trim());}
  assert.ok(used.has('LOCK_SERVER_TOKEN')&&used.has('LOCK_SERVER_URL'),'scanner finds env reads');
  for(const k of used)assert.ok(keys.includes(k),k+' is read by src but missing from .env.production.example');
  for(const k of pkg.SECRET_ENV)assert.match(committed,new RegExp('^'+k+'=$','m'),k);
  assert.match(fs.readFileSync(ROOT+'/.gitignore','utf8'),/^\.env\.production$/m);});

test('the package validates, builds importable n8n workflows for every campaign and is deterministic',()=>{
  const before=fs.readFileSync(ROOT+'/src/services/funnel/dist/consolidation/engine-test.json','utf8');
  const r=pkg.run();assert.equal(r.ok,true,JSON.stringify(r.reports.map(x=>x.errors)));
  assert.deepEqual(r.built.map(b=>[b.campaign,b.dir]),[['consolidation','src/services/funnel/dist/consolidation'],['refi','src/services/funnel/dist']]);
  for(const b of r.built)for(const f of b.files){const w=JSON.parse(fs.readFileSync(ROOT+'/'+b.dir+'/'+f,'utf8'));
    assert.ok(w.name&&w.nodes.length&&w.connections,f);
    const names=new Set(w.nodes.map(n=>n.name));for(const [a,c] of Object.entries(w.connections)){assert.ok(names.has(a));for(const br of c.main)for(const x of br)assert.ok(names.has(x.node),b.campaign+'/'+f+' '+x.node);}}
  assert.equal(fs.readFileSync(ROOT+'/src/services/funnel/dist/consolidation/engine-test.json','utf8'),before);
  for(const f of ['engine-live.json','instant-reply-live.json'])assert.ok(!r.built.some(b=>b.files.includes(f)),'no live build in the package');});
