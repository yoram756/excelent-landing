// Test-only loader: mutate code in memory in a child process, never on disk.
const Module=require('node:module'),fs=require('node:fs'),path=require('node:path');
const target=path.resolve(__dirname,'../../automation/lifecycle/store.js'),original=Module._extensions['.js'];
const mutations={
 shared_pause:["state[flag]=related.some(x=>x[flag]===true)","state[flag]=state[flag]===true"],
 optout:["if(['optout','competitor_chosen','paid'].includes(type))this.stopSubject(e.subject_id,type,at);","if(['competitor_chosen','paid'].includes(type))this.stopSubject(e.subject_id,type,at);"],
 unknown_retry:["UPDATE outbox SET state='unknown',updated_at=?","UPDATE outbox SET state='queued',updated_at=?"]
};
if(!Object.hasOwn(mutations,process.env.ATOMIC_MUTATION||''))throw Error('Explicit known test mutation required');
Module._extensions['.js']=function(module,filename){if(filename!==target)return original(module,filename);const [before,after]=mutations[process.env.ATOMIC_MUTATION],source=fs.readFileSync(filename,'utf8');if(!source.includes(before))throw Error('Mutation target changed');module._compile(source.replace(before,after),filename);};
