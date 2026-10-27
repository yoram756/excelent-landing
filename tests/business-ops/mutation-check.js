'use strict';
// Negative controls compiled in memory. Production source files are never modified.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const {seed,stages,applyStage,caseData,now}=require('./scenario');
const file=path.resolve(__dirname,'../../src/services/business-ops/store.js'),source=fs.readFileSync(file,'utf8');
function load(code){const candidate=new Module(file,module);candidate.filename=file;candidate.paths=Module._nodeModulePaths(path.dirname(file));candidate._compile(code,file);return candidate.exports;}
const controls=[
 {name:'completion_without_artifact_proof',needle:'const met=t.completion.every(c=>evidence.some(e=>e.kind===c.kind&&e.artifact_id===c.artifactId));',replacement:'const met=true;',check:s=>{applyStage(s,stages[0]);assert.notEqual(s.taskByKey(caseData.id,'collect-documents').state,'completed');}},
 {name:'replay_payload_conflict_ignored',needle:"if(old.digest!==digest)throw Error('Event replay conflict');",replacement:'',check:s=>{s.ingest(stages[0].event,{now});assert.throws(()=>s.ingest({...stages[0].event,text:'changed'},{now}),/conflict/);}}
];
const results=[];
for(const c of controls){assert.equal(source.split(c.needle).length,2,'Control must mutate exactly one expression');
 const baseline=load(source),good=new baseline.OperationsStore(':memory:');try{seed(good);c.check(good);}finally{good.close();}
 const candidate=load(source.replace(c.needle,c.replacement)),broken=new candidate.OperationsStore(':memory:');let detected=false;
 try{seed(broken);c.check(broken);}catch(error){if(error.code!=='ERR_ASSERTION')throw error;detected=true;}finally{broken.close();}
 assert.ok(detected,'Negative control survived: '+c.name);results.push({name:c.name,detected:true});
}
console.log(JSON.stringify({status:'PASS',scope:'in-memory negative controls',controls:results},null,2));
