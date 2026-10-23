// Intake Code node sources with the campaign's Monday ids injected (__INTAKE__).
// Used by patch-export.js, patch-reminder-export.js and the test harnesses, so n8n and the tests run the same code.
const fs=require('fs'),path=require('path');
const intakeConfig=(id='refi')=>{
  const c=JSON.parse(fs.readFileSync(path.join(__dirname,'../../config/campaigns',id+'.json'),'utf8'));
  if(!c.intake)throw new Error('campaign '+id+' has no intake block');
  if(!/^\d+$/.test(c.board)||!/^\w+$/.test(c.intake.group))throw new Error('campaign '+id+' has an invalid board or group id');
  const C=c.columns;
  return {campaign:c.id,board:c.board,group:c.intake.group,newStage:c.intake.newStage,reminder:c.intake.reminder||null,
    columns:{...c.intake.columns,phone:C.phone,stage:C.stage,source:C.source,heat:C.heat,firstReply:C.firstReply,consentMarketing:C.consentMarketing,
      consentService:C.consentService,email:C.email,permissions:c.contactPermissions.column}};
};
const inject=(code,id)=>code.split('__INTAKE__').join(JSON.stringify(intakeConfig(id)));
const intakeSource=(file,id)=>inject(fs.readFileSync(path.join(__dirname,file),'utf8').replace(/\r\n/g,'\n'),id);
// Monday query of the callback SLA reminder workflow ("New leads" node).
const reminderQuery=id=>{const K=intakeConfig(id),C=K.columns;
  return 'query { boards(ids: '+K.board+') { groups(ids: ["'+K.group+'"]) { items_page(limit: 500) { cursor items { id name created_at column_values(ids: '+
    JSON.stringify([C.stage,C.firstReply,C.source,C.phone,C.serviceRequestAt,C.answers]).replace(/","/g,'", "')+') { id text value } } } } } }';};
module.exports={intakeConfig,inject,intakeSource,reminderQuery};
