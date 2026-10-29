const fs=require('node:fs');
const crypto=require('node:crypto');
const path=require('node:path');
function patchCalendly(workflow,{matchSource,ackSource,campaign}) {
  const out=structuredClone(workflow);
  const byName=name=>{const found=out.nodes.filter(n=>n.name===name);if(found.length!==1)throw Error('Expected one node: '+name);return found[0];};
  for(const name of ['Every 5 min','Calendly mails','Run test','Items','Match bookings','Matched?','Update lead','Create lead','Wait for board automation','Set meeting stage'])byName(name);
  if(out.nodes.some(n=>n.name==='Acknowledge booking'))throw Error('Already patched; compare before attempting again');
  if(out.nodes.length!==10)throw Error('Unexpected Calendly topology; compare before patching');
  if(byName('Calendly mails').type!=='n8n-nodes-base.gmail')throw Error('Unexpected mail provider');
  if(byName('Every 5 min').type!=='n8n-nodes-base.scheduleTrigger')throw Error('Unexpected scheduler');
  for(const n of out.nodes)if(n.type==='n8n-nodes-base.httpRequest'&&n.parameters.url!=='https://api.monday.com/v2')throw Error('Unexpected outbound provider');
  byName('Match bookings').parameters.jsCode=matchSource.replace('__CONFIG__',JSON.stringify(campaign));
  out.nodes.push({id:crypto.randomUUID(),name:'Acknowledge booking',type:'n8n-nodes-base.code',typeVersion:2,position:[1648,0],parameters:{mode:'runOnceForEachItem',jsCode:ackSource}});
  const link=name=>({main:[[{node:name,type:'main',index:0}]]});
  out.connections['Every 5 min']=link('Calendly mails');
  out.connections['Update lead']=link('Acknowledge booking');
  out.connections['Set meeting stage']=link('Acknowledge booking');
  if(JSON.stringify(out.settings)!==JSON.stringify(workflow.settings))throw Error('Settings changed');
  for(const before of workflow.nodes){const after=byName(before.name);if(before.name!=='Match bookings'&&JSON.stringify(before)!==JSON.stringify(after))throw Error('Unrelated node changed');}
  return out;
}
module.exports={patchCalendly};
if(require.main===module){
  const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: node scripts/patch-calendly-export.cjs private-input.json private-output.json');
  const workflow=JSON.parse(fs.readFileSync(input,'utf8'));
  // Keep the deployed campaign mapping, rather than introducing unrelated config changes.
  const old=workflow.nodes.find(n=>n.name==='Match bookings').parameters.jsCode;
  const embedded=old.match(/const CFG = ([\s\S]*?); const C = CFG\.columns;/);
  if(!embedded)throw Error('Deployed campaign config missing');
  const campaign=JSON.parse(embedded[1]);
  const src=path.join(__dirname,'../src/services/funnel');
  const patched=patchCalendly(workflow,{campaign,matchSource:fs.readFileSync(path.join(src,'calendly.js'),'utf8').replace(/\r\n/g,'\n'),ackSource:fs.readFileSync(path.join(src,'calendly-ack.js'),'utf8').replace(/\r\n/g,'\n')});
  fs.writeFileSync(output,JSON.stringify(patched,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({nodes:patched.nodes.length,settingsUnchanged:true,credentialsUnchanged:true,changedNodes:['Match bookings'],addedNodes:['Acknowledge booking'],whatsappNodes:0}));
}
