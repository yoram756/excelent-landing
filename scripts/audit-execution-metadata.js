// Read-only n8n execution metadata audit. Soft-deleted history is never a live run or proof of success.
const path=require('node:path');
function classify(row){
 if(row.deletedAt)return {status:'PASS',effectiveState:'excluded_from_history',runtimeSuccessProven:false};
 if(row.status==='success'&&row.stoppedAt)return {status:'PASS',effectiveState:'saved_success',runtimeSuccessProven:true};
 if(['error','crashed','canceled'].includes(row.status))return {status:'FAIL',effectiveState:'saved_unsuccessful',runtimeSuccessProven:false};
 return {status:'NOT TESTED',effectiveState:'active_or_incomplete',runtimeSuccessProven:false};
}
function audit(dbPath,ids){
 if(!path.isAbsolute(dbPath)||!Array.isArray(ids)||!ids.length||ids.length>20||ids.some(x=>!/^\d+$/.test(String(x))))throw Error('Absolute database path and 1..20 numeric execution ids required');
 const{DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(dbPath,{readOnly:true});try{
 const rows=db.prepare('SELECT id,workflowId,status,mode,startedAt,stoppedAt,deletedAt FROM execution_entity WHERE id IN ('+ids.map(()=>'?').join(',')+') ORDER BY id').all(...ids.map(String));
 return ids.map(String).map(id=>{const r=rows.find(x=>String(x.id)===id);return r?{...r,rawStatus:r.status,...classify(r)}:{id,status:'NOT TESTED',effectiveState:'not_found',runtimeSuccessProven:false};});
 }finally{db.close();}
}
module.exports={classify,audit};
if(require.main===module){try{const[db,...ids]=process.argv.slice(2);console.log(JSON.stringify({readOnly:true,scope:'metadata_only',executions:audit(db,ids)},null,2));}catch(e){console.error(e.message);process.exitCode=1;}}
