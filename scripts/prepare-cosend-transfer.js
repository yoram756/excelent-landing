// Offline preparation only. Never submits templates, listens, sends or writes CRM.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=process.argv[2];
if(!out||!path.isAbsolute(out))throw Error('absolute output directory required');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const source='docs/evidence/20261020/gambot-refi-v2-templates.json',templates=read(source),cfg=read('src/config/campaigns/refi.json');
fs.mkdirSync(out,{recursive:true});const inventory=[];
for(const [code,ref] of Object.entries(cfg.templates)){
 const original=templates.find(t=>t.name===ref.name);
 inventory.push({code,name:ref.name,legacyId:ref.id,status:original?'PREPARED_NOT_SUBMITTED':'BLOCKED_MISSING_BODY',targetApproval:'NOT_TESTED'});
 if(!original)continue;
 const components=JSON.parse(JSON.stringify(original.components));
 for(const c of components){if(c.text===null)delete c.text;if(c.buttons)for(const b of c.buttons)for(const k of Object.keys(b))if(b[k]===null)delete b[k];}
 const payload={name:ref.name,language:'he',category:original.category,components};
 fs.writeFileSync(path.join(out,code+'.template-draft.json'),JSON.stringify({source,sourceSha256:crypto.createHash('sha256').update(JSON.stringify(original)).digest('hex'),requiresExamples:true,submissionEnabled:false,payload},null,2));
}
fs.writeFileSync(path.join(out,'inventory.json'),JSON.stringify(inventory,null,2));
fs.writeFileSync(path.join(out,'monday-mapping.json'),JSON.stringify({mode:'draft',writesEnabled:false,productionBoard:cfg.board,columns:cfg.columns,guards:['verified signature','exact organization and connection','durable event-id dedup','exclude contact/history imports','phone dedup via existing Lock','no inferred marketing consent','human reply stops followups','delivery never regresses'],ownerEmail:'office@kho.org.il',ownerId:null},null,2));
const jsCode="return $input.all().map(i=>({json:{mode:'offline-review',maySend:false,mayWriteMonday:false,input:i.json}}));";
fs.writeFileSync(path.join(out,'cosend-review-workflow.json'),JSON.stringify({name:'TEST Cosend preparation NO SEND NO CRM WRITE',active:false,settings:{saveDataSuccessExecution:'none',saveDataErrorExecution:'none',saveManualExecutions:false},nodes:[{id:'manual',name:'Manual review only',type:'n8n-nodes-base.manualTrigger',typeVersion:1,position:[0,0],parameters:{}},{id:'gate',name:'No external actions',type:'n8n-nodes-base.code',typeVersion:2,position:[250,0],parameters:{jsCode}}],connections:{'Manual review only':{main:[[{node:'No external actions',type:'main',index:0}]]}}},null,2));
const lines=['חבילת העברה ל-Cosend, ללא הגשה או שליחה','',...inventory.map(x=>x.code+' | '+x.name+' | '+x.status),'','הקבצים מכילים נוסחי מקור מייצוא היסטורי. סטטוס APPROVED הישן אינו אישור לחשבון החדש.','יש להשלים דוגמאות משתנים, לאמת עברית וכפתורים ולבדוק טענות מספריות וביקורות לפני הגשה.','ארבע התבניות החסרות דורשות ייצוא מקור מלא. אין להעתיק מזהה ישן כאישור חדש.','ה-Workflow הוא שלד סקירה ידני בלבד; אין בו חיבור ל-CRM, מאזין או שליחה.','המתאם המקומי מאמת חתימות ומבודד אירועים בלבד; נדרשים דוגמת משאב אמיתית, שמירה מתמשכת למניעת כפילויות, חיבור Lock ומיפוי CRM לפני פריסה.','מקורות: https://cosend.app/docs/webhooks , https://cosend.app/business-api'];
fs.writeFileSync(path.join(out,'README.txt'),lines.join('\n'));
console.log(JSON.stringify({prepared:inventory.filter(x=>x.status==='PREPARED_NOT_SUBMITTED').length,blocked:inventory.filter(x=>x.status==='BLOCKED_MISSING_BODY').map(x=>x.code),output:out}));
