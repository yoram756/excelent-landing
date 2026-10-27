'use strict';
// Compile deliberately broken connector variants in memory, never on disk.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const {OperationsStore}=require('../../src/services/business-ops/store');
const {seed,stages,now}=require('./scenario');
const file=path.resolve(__dirname,'../../src/services/business-ops/ingestion.js'),source=fs.readFileSync(file,'utf8');
function load(code){const candidate=new Module(file,module);candidate.filename=file;candidate.paths=Module._nodeModulePaths(path.dirname(file));candidate._compile(code,file);return candidate.exports;}
const record={...stages[1].event,id:'TEST-message'};
const binding=account=>({id:'TEST-stream-'+account,source:'gmail',accountId:'TEST-account-'+account});
const page=events=>({id:'TEST-page',nextCursor:'cursor-1',events});
const controls=[
 {name:'page_transaction_removed',needle:'return s.tx(()=>{\n   const row=this.checkLease(claim,now),old=',replacement:'return (fn=>fn())(()=>{\n   const row=this.checkLease(claim,now),old=',check:(store,inbox)=>{
  const b=binding('a');inbox.register(b,{now});const claim=inbox.claim(b.id,{now});
  assert.throws(()=>inbox.accept(claim,page([record,{...record,id:'TEST-bad',scope:'private'}]),{now}));
  assert.equal(store.metrics({now}).events,0,'a rejected page must not leave its first event behind');
 }},
 {name:'account_namespace_removed',needle:'hash([row.account_id,event.id])',replacement:'hash([event.id])',check:(store,inbox)=>{
  for(const account of ['a','b']){const b=binding(account);inbox.register(b,{now});assert.doesNotThrow(()=>inbox.accept(inbox.claim(b.id,{now}),page([record]),{now}));}
  assert.equal(store.metrics({now}).events,2,'native IDs belong to different source accounts');
 }}
];
const results=[];
for(const control of controls){
 assert.equal(source.split(control.needle).length,2,'Control must change one expression');
 for(const broken of [false,true]){
  const {SourceInbox}=load(broken?source.replace(control.needle,control.replacement):source),store=new OperationsStore(':memory:');seed(store);let detected=false;
  try{control.check(store,new SourceInbox(store));}catch(error){if(!broken||error.code!=='ERR_ASSERTION')throw error;detected=true;}finally{store.close();}
  if(broken)assert.ok(detected,'Broken variant survived: '+control.name);
 }
 results.push({name:control.name,detected:true});
}
console.log(JSON.stringify({status:'PASS',scope:'In-memory connector negative controls',controls:results}));
