// Intake Code node sources with the campaign's Monday ids injected (__INTAKE__).
// Used by patch-export.js and the test harnesses, so n8n and the tests run the same code.
const fs=require('fs'),path=require('path');
const intakeConfig=(id='refi')=>{
  const c=JSON.parse(fs.readFileSync(path.join(__dirname,'../../config/campaigns',id+'.json'),'utf8'));
  if(!c.intake)throw new Error('campaign '+id+' has no intake block');
  if(!/^\d+$/.test(c.board)||!/^\w+$/.test(c.intake.group))throw new Error('campaign '+id+' has an invalid board or group id');
  const C=c.columns;
  return {campaign:c.id,board:c.board,group:c.intake.group,newStage:c.intake.newStage,
    columns:{...c.intake.columns,phone:C.phone,stage:C.stage,source:C.source,heat:C.heat,consentMarketing:C.consentMarketing,
      consentService:C.consentService,email:C.email,permissions:c.contactPermissions.column}};
};
const inject=(code,id)=>code.split('__INTAKE__').join(JSON.stringify(intakeConfig(id)));
const intakeSource=(file,id)=>inject(fs.readFileSync(path.join(__dirname,file),'utf8').replace(/\r\n/g,'\n'),id);
module.exports={intakeConfig,inject,intakeSource};
