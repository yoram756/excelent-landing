// Apply the verified intake sources to an existing n8n export, preserving settings,
// credentials and webhook configuration. Input/output exports remain private.
const fs=require('fs'),{intakeSource}=require('./source');
const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('usage: node patch-export.js input.json output.json');
const w=JSON.parse(fs.readFileSync(input,'utf8'));
if(w.id!=='8W7MymUCLpPnilJs'||w.nodes.length!==18)throw Error('Unexpected intake workflow');
const sources={'Validate':'validate.js','Find query':'find-query.js','Build mutation':'build-mutation.js','Check save':'check-save.js'};
for(const [name,file]of Object.entries(sources)){
 const matches=w.nodes.filter(n=>n.name===name&&n.type==='n8n-nodes-base.code');
 if(matches.length!==1)throw Error('Missing/ambiguous source node '+name);
 matches[0].parameters.jsCode=intakeSource(file,process.env.CAMPAIGN||'refi');
}
// Respond after the confirmed save, before optional internal notification delivery.
const link=name=>({main:[[{node:name,type:'main',index:0}]]});
if(w.connections['Saved?']?.main?.[0]?.[0]?.node!=='Alert query'||w.connections['Alert Yoram']?.main?.[0]?.[0]?.node!=='Reply saved')throw Error('Unexpected success routing');
w.connections['Saved?'].main[0]=[{node:'Reply saved',type:'main',index:0}];
w.connections['Reply saved']=link('Alert query');
w.connections['Alert Yoram']=link('Email alert');
// State and saved execution data are deliberately excluded from the import file.
const result={name:w.name,nodes:w.nodes,connections:w.connections,settings:w.settings,pinData:{}};
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({sourceWorkflow:w.id,nodes:result.nodes.length,replaced:Object.keys(sources),responseAfter:'Check save → Saved? true',notificationsAfterResponse:true}));
