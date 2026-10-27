'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {planResponse}=require('../../src/services/business-ops/response-plan');
const {OperationsStore}=require('../../src/services/business-ops/store');
const {seed,stages,applyStage,caseData,now}=require('./scenario');
test('draft plans require existing context, choose one channel and check calendar availability',()=>{
 const c={audience:'client',purpose:'איסוף מסמכים',known:['אישור הכנסה חסר'],required:'להעביר אישור הכנסה',next:'נבדוק את המסמך',preferredChannel:'whatsapp',caseLink:'https://example.invalid/case'};
 assert.equal(planResponse(c).state,'needs_context');const verified={...c,recipientVerified:true,recentConversationRead:true};assert.equal(planResponse(verified).channel,'whatsapp');assert.equal(planResponse({...verified,needsDocuments:true}).channel,'email');assert.equal(planResponse({...verified,needsMeeting:true}).state,'needs_availability');assert.equal(planResponse({...verified,needsMeeting:true,availabilityChecked:true}).channel,'calendar');assert.equal(planResponse({...verified,audience:'internal'}).channel,'monday');assert.equal(planResponse(verified).dispatchEnabled,false);
});
test('owner digests suppress unchanged state, retain proposed dates as proposed, and change after new proof',()=>{
 const s=new OperationsStore(':memory:');seed(s);try{applyStage(s,stages[0]);const d=s.digest(caseData.id,{owner:'neria',now});assert.equal(d.open.length,2);assert.equal(d.urgent.length,0);assert.ok(d.open.every(t=>!t.dueAt&&t.proposedDueAt));assert.equal(s.digest(caseData.id,{owner:'neria',now}),null);for(const stage of stages.slice(1))applyStage(s,stage);const final=s.digest(caseData.id,{owner:'neria',now});assert.equal(final.closed.length,1);assert.equal(final.open.length,1);assert.equal(final.dispatchEnabled,false);assert.equal(final.recipientVerified,false);}finally{s.close();}
});
