// Test-only loader: mutate code in memory in a child process, never on disk.
const Module=require('node:module'),fs=require('node:fs'),path=require('node:path');
const original=Module._extensions['.js'];
const mutations={
 shared_pause:['store.js',"state[flag]=related.some(x=>x[flag]===true)","state[flag]=state[flag]===true"],
 optout:['store.js',"if(['optout','competitor_chosen','paid'].includes(type))this.stopSubject(e.subject_id,type,at);","if(['competitor_chosen','paid'].includes(type))this.stopSubject(e.subject_id,type,at);"],
 unknown_retry:['store.js',"UPDATE outbox SET state='unknown',updated_at=?","UPDATE outbox SET state='queued',updated_at=?"],
 adapter_grants:['lp1-adapter.js','[ch,p.grants[ch]]','[ch,true]'],
 enrollment_anchor:['store.js','start=enrolledAt===null?at:iso(enrolledAt)','start=at'],
 restore_gate:['store.js',"if(this.restorePending())return {status:'BLOCKED'","if(false)return {status:'BLOCKED'"],
 crm_readback:['crm-sandbox.js','if(encode(after)!==encode(expected))','if(false)'],
 crm_unknown_retry:['store.js',"WHERE (p.state='queued' OR (p.state='reserved' AND p.lease_until<=?))","WHERE (p.state='queued' OR (p.state IN ('reserved','unknown') AND p.lease_until<=?))"],
 crm_snapshot:['crm-sandbox.js','return store.tx(()=>{','return (fn=>fn())(()=>{'],
 metrics_denominator:['campaign-metrics.js','cost(spend.amountMinor,qualified.length)','cost(spend.amountMinor,attributed.length)'],
 metrics_null:['campaign-metrics.js',"unavailable('platform_result_not_reported',spend.amountMinor)",'cost(0,1)'],
 metrics_attribution:['campaign-metrics.js',"else if(inside.some(row=>!row.attributionVerified))reason='attribution_incomplete';",'']
};
if(!Object.hasOwn(mutations,process.env.ATOMIC_MUTATION||''))throw Error('Explicit known test mutation required');
const [file,before,after]=mutations[process.env.ATOMIC_MUTATION],target=path.resolve(__dirname,'../../automation/lifecycle',file);
Module._extensions['.js']=function(module,filename){if(filename!==target)return original(module,filename);const source=fs.readFileSync(filename,'utf8');if(!source.includes(before))throw Error('Mutation target changed');module._compile(source.replace(before,after),filename);};
