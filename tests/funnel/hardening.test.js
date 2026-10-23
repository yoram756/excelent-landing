const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path');
const root=process.env.HARDENING_SOURCE_ROOT||path.resolve(__dirname,'../../src/services/funnel');
const cfg=fs.readFileSync(path.resolve(__dirname,'../../src/config/campaigns/refi.json'),'utf8');
const biz=fs.readFileSync(path.resolve(__dirname,'../../config/business.json'),'utf8');
const {item}=require('./load');
const source=n=>fs.readFileSync(path.join(root,n+'.js'),'utf8').replace('__CONFIG__',cfg).replace('__BUSINESS__',biz).replace('__MODE__','test').replace('__PILOT__','').replace('__CRM_FIELDS__',require('../../src/services/funnel/crm-fields').inlineSource).replace('__CHANNELS__',require('../../src/services/funnel/channels').inlineSource).replace('__GO_LIVE__','2026-10-20T07:00:00Z');
const page=(items,cursor=null)=>({json:{data:{me:{id:'1'},boards:[{items_page:{items,cursor}}]}}});
const collect=pages=>new Function('$input',source('collect-pages'))({all:()=>pages})[0].json;
const go=(items,c='abcdefghjkq')=>new Function('$',source('go'))(n=>({first:()=>({json:n==='Link'?{query:{c}}:page(items).json})}))[0].json;
const plan=items=>new Function('$',source('plan'))(n=>({first:()=>({json:n==='Items'?page(items).json:n==='Convos'?{data:{items:[]}}:n==='Run test'?{body:{now:'2026-10-20T09:00:00Z'}}:{items:[]}})})).map(x=>x.json);

test('owner beyond item 500 is found after complete pagination',()=>{
  const first=Array.from({length:500},(_,i)=>item({id:String(i+1),cols:{}}));
  const last=item({id:'501',cols:{fn_token:'abcdefghjk',fn_opens:'{}',numeric_mm883h9v:'50'}});
  const data=collect([page(first,'next'),page([last])]);
  assert.equal(data.data.boards[0].items_page.items.length,501);
  assert.equal(go(data.data.boards[0].items_page.items).itemId,'501');
});
test('partial pages and GraphQL failure never permit attribution',()=>{
  for(const pages of [[page([],'more')],[page([],'more'),{json:{errors:[{message:'down'}]}}],[{json:{data:{me:{id:1},boards:[{items_page:{items:[]}}]}}}]])assert.throws(()=>collect(pages));
});
test('repeated cursors, repeated items and unexpected extra pages fail closed',()=>{
  const a=item({id:'1',cols:{}});
  for(const pages of [[page([],'same'),page([],'same'),page([])],[page([a],'next'),page([a])],[page([]),page([])]])assert.throws(()=>collect(pages));
});
test('missing and malformed stored click state never writes or awards heat',()=>{
  for(const state of [undefined,'','null','[]','{"opens":null}','{"opens":{"q":-1}}','{"clicks":{}}','{"clickHeat":"5"}','{"opens":{"q":1}}']){
    const r=go([item({cols:{fn_token:'abcdefghjk',numeric_mm883h9v:'50',...(state===undefined?{}:{fn_opens:state})}})]);
    assert.equal(r.colsJson,undefined,state);assert.equal(r.found,false,state);
  }
});
test('human-handled lead with blank funnel status never enrolls',()=>{
  for(const extra of [{refi_stage:'בטיפול'},{refi_first_reply:'2026-10-20'}]){
    assert.deepEqual(plan([item({cols:{refi_phone:'0500000040',boolean_mm88mzry:{checked:true},...extra}})]),[]);
  }
});
test('planner fails closed if its secure random source is unavailable',()=>{
  const vm=require('vm');
  const it=item({cols:{refi_phone:'0500000040',boolean_mm88mzry:{checked:true}}});
  const $=n=>({first:()=>({json:n==='Items'?page([it]).json:n==='Convos'?{data:{items:[]}}:n==='Run test'?{body:{now:'2026-10-20T09:00:00Z'}}:{items:[]}})});
  assert.throws(()=>vm.runInNewContext('(function(){'+source('plan')+'})()',{$}),/CSPRNG unavailable/);
});
test('new tokens require a valid expiry and revocation prevents attribution',()=>{
 const token='a'.repeat(32);
 for(const st of [{},{tokenExpiresAt:Date.now()-1},{tokenExpiresAt:'tomorrow'},{tokenExpiresAt:Date.now()+86400000,tokenRevoked:true}]){
   const r=go([item({cols:{fn_token:token,fn_opens:JSON.stringify(st)}})],token+'q');assert.equal(r.colsJson,undefined);assert.equal(r.found,false);assert.ok(!r.url.includes('t='+token));
 }
 const r=go([item({cols:{fn_token:token,fn_opens:JSON.stringify({tokenExpiresAt:Date.now()+86400000})}})],token+'q');assert.equal(r.found,true);
});
test('an unsubscribed lead cannot earn click heat',()=>{const r=go([item({cols:{fn_token:'abcdefghjk',fn_status:'הסר',fn_opens:'{}'}})]);assert.equal(r.found,false);assert.equal(r.colsJson,undefined);});
