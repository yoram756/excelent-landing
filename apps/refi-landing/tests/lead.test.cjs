const test = require('node:test'), assert = require('node:assert/strict');
const path = require('node:path'), { pathToFileURL } = require('node:url');
const source = process.env.CRO_LEAD_TEST_SOURCE || path.resolve(__dirname, '../src/lib/lead.ts');
const modulePromise = import(pathToFileURL(source).href);
const input = { name: 'TEST בדיקת אתר', phone: '050-0000198', analyticsConsent: true };
const identity = { product: 'LP1', campaign: 'refi', source: 'LP1 CRO' };

test('normalization accepts the supported local/international mobile formats and rejects broken input', async () => {
  const { normalizeInput } = await modulePromise;
  for (const phone of ['0500000198', '+972 50-000-0198', '00972500000198', '9720500000198']) assert.equal(normalizeInput({ ...input, phone }).phone, '972500000198');
  for (const phone of ['abc0500000198', '0500000', '055000000000', '']) assert.ok(normalizeInput({ ...input, phone }).errors.phone);
  for (const name of ['', 'x', '<script>', 'x'.repeat(41)]) assert.ok(normalizeInput({ ...input, name }).errors.name);
});

test('payload matches intake with one canonical event, service purpose and no marketing or financial data', async () => {
  const { createPayload } = await modulePromise;
  const payload = createPayload(input, identity);
  assert.equal(payload.event_id, payload.idempotency_key); assert.equal(payload.phone, '972500000198');
  assert.equal(payload.service_request, true); assert.equal(payload.marketing_consent, false); assert.deepEqual(payload.answers, {});
  assert.equal(payload.email, undefined); assert.equal(payload.analyticsConsent, undefined);
});

test('the actual campaign intake validator accepts the frontend payload and rejects a conflicting campaign', async () => {
  const { createPayload } = await modulePromise;
  const { intakeSource } = require('../../../src/webhooks/intake/source');
  const validate = new Function('$input', '$getWorkflowStaticData', intakeSource('validate.js', 'refi'));
  const payload = createPayload(input, identity);
  const run = body => validate({ first: () => ({ json: { body, headers: {} } }) }, () => ({}))[0].json;
  assert.equal(run(payload).ok, true); assert.equal(run(payload).eventId, payload.event_id);
  assert.equal(run({ ...payload, campaign: 'unconfigured' }).ok, false);
});

test('HTTP error, missing id, explicit rejection and malformed JSON cannot become a success receipt', async () => {
  const { submitLead, createPayload } = await modulePromise;
  const payload = createPayload(input, identity);
  for (const response of [new Response('{"request_id":"TEST_false"}', { status: 502 }), new Response('{"ok":true}'), new Response('{"request_id":"TEST_false","error":"bad"}'), new Response('{"request_id":"TEST_pending","pending":true}'), new Response('{"request_id":"TEST_pending"}', {status:202}), new Response('{"request_id":"TEST_false","saved":false}'), new Response('not json'), new Response('{"request_id":"  "}'), new Response('{"request_id":123}')]) await assert.rejects(submitLead(payload, true, '/api/lead', async () => response));
  await assert.rejects(submitLead(payload, true, '/api/lead', async () => new Response('{}', { status: 429 })), /rate/);
});

test('webhook dispatch is immediate and receipt stores no contact data', async () => {
  const { submitLead, createPayload, isReceipt } = await modulePromise;
  const payload = createPayload(input, identity); const start = performance.now(); let dispatchedAt;
  const receipt = await submitLead(payload, true, '/api/lead', async (endpoint, request) => {
    dispatchedAt = performance.now(); assert.equal(endpoint, '/api/lead'); assert.equal(request.method, 'POST');
    assert.equal(JSON.parse(request.body).event_id, payload.event_id);
    return new Response('{"request_id":"TEST_valid"}');
  });
  assert.ok(dispatchedAt - start < 2000); assert.equal(isReceipt(receipt), true);
  assert.equal(receipt.phone, undefined); assert.equal(receipt.name, undefined); assert.equal(receipt.eventId, payload.event_id);
  assert.equal(isReceipt({ ...receipt, acceptedAt: '2000-01-01' }), false); assert.equal(isReceipt({ ...receipt, eventId: 'bad' }), false);
});
