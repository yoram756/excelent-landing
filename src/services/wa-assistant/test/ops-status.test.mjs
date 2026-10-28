import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Broker} from '../src/broker.mjs';
import {readOpsStatus} from '../scripts/ops-status.mjs';
test('operations snapshot reads counts and age without personal content or state changes',()=>{
  const dir=mkdtempSync(join(tmpdir(),'excelent-wa-ops-status-')),path=join(dir,'synthetic.sqlite'),now=Date.now();const b=new Broker(path);
  try{
    b.db.prepare("INSERT INTO conversations(id) VALUES('cv_PRIVATE_CLIENT')").run();
    b.db.prepare("INSERT INTO messages(id,event_id,conversation,at,payload) VALUES('msg_PRIVATE','evt_PRIVATE','cv_PRIVATE_CLIENT',?,?)").run(now-9000,JSON.stringify({text:'PRIVATE_CLIENT_TEXT',phone:'+972500000040'}));
    b.db.prepare("INSERT INTO handoffs(id,conversation,reason,at) VALUES('msg_PRIVATE','cv_PRIVATE_CLIENT','handoff',?)").run(now-4000);
    b.db.prepare("INSERT INTO outbox(id,message_id,conversation,revision,reply,route,state) VALUES('synthetic_outbox','msg_PRIVATE','cv_PRIVATE_CLIENT',1,'PRIVATE_REPLY','reply','UNCERTAIN')").run();
    const snapshot=readOpsStatus(path,{now});
    assert.equal(snapshot.status,'PASS');assert.equal(snapshot.counts.newMessages,1);assert.equal(snapshot.counts.openHandoffs,1);assert.equal(snapshot.counts.outbox.UNCERTAIN,1);
    assert.equal(snapshot.oldestAgeMs.newMessages,9000);assert.equal(snapshot.oldestAgeMs.openHandoffs,4000);assert.equal(snapshot.conditions.hasUnresolvedSend,true);
    assert(!JSON.stringify(snapshot).includes('PRIVATE'));assert(!JSON.stringify(snapshot).includes('+972'));
    assert.equal(b.db.prepare('SELECT state FROM outbox').get().state,'UNCERTAIN');assert.equal(b.db.prepare('SELECT state FROM messages').get().state,'NEW');
  }finally{b.close();rmSync(dir,{recursive:true,force:true});}
});
test('operations snapshot never creates a missing database',()=>{
  const dir=mkdtempSync(join(tmpdir(),'excelent-wa-ops-status-')),path=join(dir,'does-not-exist.sqlite');
  try{assert.equal(readOpsStatus(path).status,'BLOCKED');assert.equal(existsSync(path),false);}finally{rmSync(dir,{recursive:true,force:true});}
});
