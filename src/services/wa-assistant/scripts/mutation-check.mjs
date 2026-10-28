// Negative controls: every deliberately broken safety rule must fail its regression.
import {mkdtempSync,cpSync,readFileSync,writeFileSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const tmpRoot=realpathSync(tmpdir());
const mutations=[
  {name:'lock_readback_human_blocks',file:'src/cosend-control.mjs',find:"return fresh.control==='bot'&&",replace:'return ',test:'human takeover between lock',testFile:'migration.test.mjs'},
  {name:'handoff_assignment_readback_required',file:'src/cosend-control.mjs',find:"if(!['pending_human','human'].includes(c.control)||c.state!=='pending'||c.assignee_id!==assigneeId)",replace:'if(false)',test:'handoff never claims assignment',testFile:'migration.test.mjs'},
  {name:'model_transport_budget_blocks_calls',file:'src/model-adapter.mjs',find:"if(!credentialApproved||!budgetApproved)throw Error('model_approval_required');",replace:'',test:'model transport also enforces',testFile:'migration.test.mjs'},
  {name:'model_budget_blocks_calls',file:'src/broker.mjs',find:"if(!credentialApproved||!budgetApproved||typeof classify!=='function')",replace:"if(typeof classify!=='function')",test:'model approval and budget',testFile:'migration.test.mjs'},
  {name:'stale_model_result_is_discarded',file:'src/broker.mjs',find:'if(c.revision!==reserved.revision||c.human||c.optout)',replace:'if(false)',test:'inbound update invalidates.*stop',testFile:'migration.test.mjs'},
  {name:'model_cannot_change_approved_intent',file:'src/broker.mjs',find:"if(modelKey!==undefined&&d.route==='reply'&&modelKey!==d.kind)",replace:'if(false)',test:'approved synthetic model only',testFile:'migration.test.mjs'},
  {name:'provider_writes_need_approval',file:'src/cosend-control.mjs',find:"||!writesApproved)",replace:")",test:'write scope alone',testFile:'migration.test.mjs'},
  {name:'handoff_must_stop_bot',file:'src/broker.mjs',find:"this.db.prepare('UPDATE conversations SET human=1,revision=revision+1 WHERE id=?').run(c.id);",replace:'',test:'handoff acquires persistent'},
  {name:'provider_preflight_is_required',file:'src/broker.mjs',find:"if(typeof beforeSend!=='function')return {state:'BLOCKED',reason:'provider_preflight_required'};",replace:"if(typeof beforeSend!=='function')beforeSend=async()=>true;",test:'live dispatch fails closed'},
  {name:'preflight_error_blocks',file:'src/broker.mjs',find:"catch{return {state:'BLOCKED',reason:'provider_preflight_failed'};}",replace:"catch{throw new Error('synthetic provider disconnected');}",test:'preflight exception'},
  {name:'simulation_requires_pending_row',file:'src/broker.mjs',find:"Number(changed.changes)===1?'SIMULATED':'NOT_CLAIMED'",replace:"'SIMULATED'",test:'simulation does not report'},
  {name:'history_cannot_take_control',file:'src/broker.mjs',find:"if(m.imported){this.audit(m.eventId,m.conversationId,'ignored_history');return {status:200,code:'stored_ignored'};}",replace:'',test:'historical business echoes'},
  {name:'storage_required_for_health',file:'src/server.mjs',find:"for(const table of ['events','messages','conversations','outbox','handoffs','audit','provider_receipts'])broker.db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get();",replace:'',test:'health reports storage'},
  {name:'delivery_must_not_regress',file:'src/broker.mjs',find:'if(!old||rank[m.status]>rank[old.status])',replace:'if(true)',test:'accepted request remains distinct'},
  {name:'ambiguous_2xx_blocks_conversation',file:'src/cosend-adapter.mjs',find:"if(response.status>=200&&response.status<300&&!accepted)return {status:response.status,uncertain:true};",replace:'',test:'ambiguous HTTP 200'},
];
const results=[];
for(const m of mutations){
  const dir=mkdtempSync(join(tmpRoot,'excelent-wa-mutation-'));
  try{
    cpSync(join(root,'src'),join(dir,'src'),{recursive:true});cpSync(join(root,'test'),join(dir,'test'),{recursive:true});cpSync(join(root,'config'),join(dir,'config'),{recursive:true});
    const path=join(dir,m.file),source=readFileSync(path,'utf8');
    if(source.split(m.find).length!==2)throw new Error('mutation_target_not_unique_'+m.name);
    writeFileSync(path,source.replace(m.find,m.replace));
    const result=spawnSync(process.execPath,['--test','--test-reporter=tap',`--test-name-pattern=${m.test}`,'test/'+(m.testFile||'safety-regressions.test.mjs')],{cwd:dir,encoding:'utf8',timeout:10000});
    const output=result.stdout+result.stderr;
    const detected=result.status===1&&/# tests 1\b/.test(output)&&/# fail 1\b/.test(output)&&!/SyntaxError/.test(output);
    results.push({name:m.name,status:detected?'PASS':'FAIL',expectedTestExit:1,actualTestExit:result.status,matchedTests:1});
  }finally{const resolved=realpathSync(dir);if(dirname(resolved)===tmpRoot&&resolved.startsWith(tmpRoot+sep+'excelent-wa-mutation-'))rmSync(resolved,{recursive:true,force:true});}
}
const report={mode:'LOCAL_NEGATIVE_CONTROLS_NO_PROVIDER',status:results.every(x=>x.status==='PASS')?'PASS':'FAIL',results};
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));if(report.status!=='PASS')process.exitCode=1;
