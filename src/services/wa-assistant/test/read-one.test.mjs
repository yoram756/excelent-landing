import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyReadIdentity, verifyReadNumber, captureOneUnread, confirmReadUnchanged, safeReadId} from '../src/read-one.mjs';
import {makeReadOneWorker} from '../scripts/read-one-workflow.mjs';

const binding = {organizationId: 'org_expected', connectionId: 'conn_expected', phoneNumberId: 'pn_expected', wabaId: 'waba_expected'};
const response = body => ({statusCode: 200, body});
const identity = () => ({organization: {id: binding.organizationId}, credential: {kind: 'connection', is_live: true,
  connection_id: binding.connectionId, connection_ids: [binding.connectionId], scopes: ['messages:read', 'connections:read']}});
const conversation = () => ({id: 'conv_expected', connection_id: binding.connectionId, contact_id: 'contact_expected',
  unread_count: 2, message_count: 7, last_read_at: null, control: 'human', state: 'pending', assignee_id: null,
  last_message: {id: 'msg_expected', connection_id: binding.connectionId, conversation_id: 'conv_expected',
    contact_id: 'contact_expected', direction: 'inbound', type: 'text', content: {text: {body: 'Synthetic text only'}}}});

test('read-only credential works without contacts:read or write scope', () => {
  assert.equal(verifyReadIdentity(response(identity()), binding).identityVerified, true);
});
for (const [name, change] of [
  ['wrong organization', x => x.organization.id = 'org_other'],
  ['missing read scope', x => x.credential.scopes = ['connections:read']],
  ['workspace key', x => x.credential.kind = 'workspace'],
  ['extra connection', x => x.credential.connection_ids.push('conn_other')],
  ['wildcard privilege', x => x.credential.scopes.push('*')],
  ['test credential', x => x.credential.is_live = false],
]) test('identity rejects ' + name, () => {const x = identity(); change(x); assert.throws(() => verifyReadIdentity(response(x), binding));});

test('number identity is checked independently', () => {
  const x = {id: binding.connectionId, phone_e164: '+972500000040', phone_number_id: binding.phoneNumberId,
    meta_waba_id: binding.wabaId, status: 'active', mode: 'coexistence', delivery_mode: 'stored'};
  assert.equal(verifyReadNumber(response(x), binding, '972500000040').numberVerified, true);
  assert.throws(() => verifyReadNumber(response({...x, phone_e164: '+972500000041'}), binding, '972500000040'));
  assert.throws(() => verifyReadNumber(response({...x, delivery_mode: 'direct'}), binding, '972500000040'));
});

test('one text body is inspected without returning personal data or text', () => {
  const x = conversation(); x.contact = {phone_e164: '+972500000040', display_name: 'TEST private name'};
  const result = captureOneUnread(response({data: [x]}), binding);
  assert.equal(result.bodyRead, true); assert.equal(result.contentCharacters, 19);
  assert.doesNotMatch(JSON.stringify(result), /Synthetic text|TEST private|972500000040/);
  assert.equal(confirmReadUnchanged(response(x), result, binding).readMarkerUnchanged, true);
});

for (const [name, change] of [
  ['read conversation', x => x.unread_count = 0],
  ['missing read marker', x => delete x.last_read_at],
  ['missing response control', x => delete x.control],
  ['missing assignment', x => delete x.assignee_id],
  ['wrong message connection', x => x.last_message.connection_id = 'conn_other'],
  ['wrong message conversation', x => x.last_message.conversation_id = 'conv_other'],
  ['wrong contact', x => x.last_message.contact_id = 'contact_other'],
  ['empty text', x => x.last_message.content = {text: {body: ''}}],
  ['unsupported media', x => x.last_message.type = 'image'],
]) test('peek rejects ' + name, () => {const x = conversation(); change(x); assert.throws(() => captureOneUnread(response({data:[x]}), binding));});

test('does not read a second conversation or silently accept an empty result', () => {
  for (const data of [[], [conversation(), conversation()]]) assert.throws(() => captureOneUnread(response({data}), binding));
});
for (const [name, change] of [
  ['unread marker', x => x.unread_count = 0],
  ['read timestamp', x => x.last_read_at = '2026-10-31T18:00:00Z'],
  ['missing read timestamp', x => delete x.last_read_at],
  ['concurrent message', x => x.message_count++],
  ['latest message', x => x.last_message.id = 'msg_other'],
  ['response control', x => x.control = 'bot'],
  ['assignment', x => x.assignee_id = 'user_other'],
]) test('no-mark proof rejects changed ' + name, () => {
  const x = conversation(), before = captureOneUnread(response({data:[x]}), binding); change(x);
  assert.throws(() => confirmReadUnchanged(response(x), before, binding));
});
test('resource identifiers cannot inject another URL or path', () => {
  for (const id of ['../messages/send', 'conv_x?mark_read=true', 'https://other.invalid', 'conv_x/lock']) assert.throws(() => safeReadId(id));
});
test('HTTP failures fail closed without reflecting a provider body', () => {
  assert.throws(() => verifyReadIdentity({statusCode: 403, body: {secret: 'hidden'}}, binding), /cosend_read_failed/);
});

test('existing manual worker gets GET-only calls with no raw execution storage', () => {
  const old = {id:'existingWorker123', active:false, activeVersionId:null, nodes:[
    {id:'manual', name:'Manual', type:'n8n-nodes-base.manualTrigger', parameters:{}},
    {id:'simulate', name:'Legacy simulation', type:'n8n-nodes-base.httpRequest', parameters:{method:'POST',url:'http://isolated/simulate-one'}},
  ], connections:{Manual:{main:[[{node:'Legacy simulation',type:'main',index:0}]]}}, settings:{availableInMCP:true}};
  const result = makeReadOneWorker(old, {id:'existingCredential123',name:'Existing test reference'});
  assert.equal(result.id, old.id); assert.equal(result.active, false);
  assert.equal(result.nodes.find(n => n.id==='simulate').disabled, true);
  const runnable = result.nodes.filter(n => !n.disabled);
  assert.equal(runnable.filter(n => n.type.endsWith('manualTrigger')).length, 1);
  assert.equal(runnable.some(n => /webhook|schedule|trigger/i.test(n.type) && !n.type.endsWith('manualTrigger')), false);
  assert.ok(runnable.filter(n => n.type.endsWith('httpRequest')).every(n => n.parameters.method==='GET'));
  assert.ok(runnable.filter(n => n.type.endsWith('httpRequest')).every(n => n.parameters.options.redirect.redirect.followRedirects===false));
  for (const key of ['saveDataSuccessExecution','saveDataErrorExecution']) assert.equal(result.settings[key],'none');
  assert.equal(result.settings.saveManualExecutions,false);
  assert.equal(result.settings.saveExecutionProgress,false);
  assert.equal(result.settings.availableInMCP,false);
  assert.equal(Object.hasOwn(result.connections,'Legacy simulation'),false);
  for (const node of runnable.filter(n => n.type.endsWith('code')))
    assert.doesNotThrow(() => new Function('$json', '$', node.parameters.jsCode));
  assert.throws(() => makeReadOneWorker({...old,active:true},{id:'existingCredential123',name:'Reference'}));
  assert.throws(() => makeReadOneWorker({...old,activeVersionId:'published'},{id:'existingCredential123',name:'Reference'}));
});
