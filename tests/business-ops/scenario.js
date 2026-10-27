'use strict';
const {hash}=require('../../src/services/business-ops/store');
const person={id:'TEST-person-a',phones:['0500000040'],emails:['client@example.invalid']};
const spouse={id:'TEST-person-b',phones:['0500000041'],emails:['spouse@example.invalid']};
const caseData={id:'TEST-case-001',customerId:'TEST-customer-001',goal:'איסוף מסמכים לפני פנייה לבנקאי',stage:'איסוף מסמכים',participants:[{personId:person.id,role:'client'},{personId:spouse.id,role:'spouse'}],link:'https://example.invalid/cases/TEST-case-001'};
const event=(id,source,text,extra={})=>({id,source,text,scope:'business',caseId:caseData.id,phone:person.phones[0],occurredAt:'2026-10-27T08:00:00Z',url:`https://example.invalid/sources/${source}/${id}`,...extra});
const task=(extra={})=>({kind:'task',quote:'נריה יאסוף אישור הכנסה ותדפיס בנק לפני הפנייה לבנקאי',commitmentKey:'collect-documents',action:'לאסוף ולאמת אישור הכנסה ותדפיס בנק',owner:'neria',priority:'high',state:'waiting_customer',dueAt:null,proposedDueAt:'2026-10-28T08:00:00Z',dependsOn:[],nextAction:'לבדוק אילו מסמכים התקבלו ומה עדיין חסר',completion:[{kind:'document_validated',artifactId:'income'},{kind:'document_validated',artifactId:'bank-statement'}],...extra});
const call=event('call-001','transkriptor','נריה יאסוף אישור הכנסה ותדפיס בנק לפני הפנייה לבנקאי. לאחר אימות המסמכים נריה יפנה לבנקאי.');
const bank=task({quote:'לאחר אימות המסמכים נריה יפנה לבנקאי',commitmentKey:'contact-banker',action:'להכין פנייה לבנקאי לאחר אימות מסמכים',state:'not_started',dependsOn:['collect-documents'],nextAction:'להכין טיוטת פנייה לבנקאי לבדיקה אנושית',completion:[{kind:'action_verified',artifactId:'banker-request-confirmed'}]});
const mail=event('mail-001','gmail','מצורף אישור הכנסה. אישור ההכנסה נבדק ונמצא תקין.',{email:'client@example.invalid',occurredAt:'2026-10-27T08:10:00Z'});
const wa=event('wa-001','whatsapp','מצורף תדפיס בנק. תדפיס הבנק נבדק ונמצא תקין.',{phone:spouse.phones[0],occurredAt:'2026-10-27T08:20:00Z'});
const evidence=(artifactId,quote)=>({kind:'evidence',quote,commitmentKey:'collect-documents',evidenceKind:'document_validated',artifactId,artifactDigest:hash({syntheticArtifact:artifactId}),verified:true});
const stages=[{name:'call',event:call,observations:[task(),bank]},{name:'mail',event:mail,observations:[{kind:'reply',quote:'מצורף אישור הכנסה',commitmentKey:'collect-documents'},evidence('income','אישור ההכנסה נבדק ונמצא תקין')]},{name:'whatsapp',event:wa,observations:[evidence('bank-statement','תדפיס הבנק נבדק ונמצא תקין')]}];
const now='2026-10-27T09:00:00Z';
function seed(store){store.registerPerson(person);store.registerPerson(spouse);store.registerCase(caseData);}
function applyStage(store,stage){const ingested=store.ingest(stage.event,{now});return store.review(ingested.eventKey,stage.observations,{actor:'synthetic_fixture_reviewer',now:'2026-10-27T09:00:01Z'});}
module.exports={person,spouse,caseData,event,task,stages,now,seed,applyStage};
