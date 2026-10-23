// Preserve the existing reminder's credential refs/settings/state; exports stay private.
const fs=require('fs'),path=require('path'),{intakeSource,reminderQuery}=require('./source');
const CAMPAIGN=process.env.CAMPAIGN||'refi';
const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('usage: input.json output.json');
const w=JSON.parse(fs.readFileSync(input,'utf8'));
if(w.id!=='kiHHRdm7KzMEuXlO'||w.nodes.length!==8)throw Error('Unexpected reminder workflow');
const service=fs.readFileSync(path.join(__dirname,'../../../config/lead-service.json'),'utf8');
const cfg=JSON.parse(fs.readFileSync(path.join(__dirname,'../../config/campaigns',CAMPAIGN+'.json'),'utf8'));
const node=name=>{const a=w.nodes.filter(n=>n.name===name);if(a.length!==1)throw Error('Node ownership '+name);return a[0];};
node('Pick overdue').parameters.jsCode=intakeSource('pick-overdue.js',CAMPAIGN).replace('__SERVICE__',service).replace('__QUIZ_PATTERN__',JSON.stringify(cfg.quizDonePattern));
node('New leads').parameters.jsonBody='={{ JSON.stringify({query:'+JSON.stringify(reminderQuery(CAMPAIGN))+'}) }}';
const r=node('Remind Yoram');
w.nodes.push({id:'sla-ack-confirmed',name:'Confirm reminder',type:'n8n-nodes-base.code',typeVersion:2,position:[r.position[0]+220,r.position[1]],parameters:{mode:'runOnceForEachItem',jsCode:fs.readFileSync(path.join(__dirname,'ack-reminder.js'),'utf8')}});
const link=name=>({main:[[{node:name,type:'main',index:0}]]});
w.connections['Remind Yoram']=link('Confirm reminder');w.connections['Confirm reminder']=link('Email reminder');
// Existing email remains secondary. Confirmed Monday delivery must not be forgotten
// merely because the secondary channel failed later in the execution.
node('Email reminder').onError='continueRegularOutput';
// The user's WhatsApp exception allows only internal TEST traffic to 0502234052.
// No recurring WhatsApp reminders to other recipients are scheduled by this patch.
node('WhatsApp recipients').disabled=true;node('WhatsApp reminder').disabled=true;
delete w.connections['Email reminder'];delete w.connections['WhatsApp recipients'];
w.name='קליטת LP1: תזכורת 30/60 דקות ליורם';
const out={name:w.name,nodes:w.nodes,connections:w.connections,settings:w.settings,pinData:{}};
fs.writeFileSync(output,JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({nodes:9,thresholds:[30,60],businessHours:'Sun-Thu 08:30-20:00 Asia/Jerusalem',whatsappRemindersDisabled:true,acknowledgmentAfterConfirmedMonday:true}));
