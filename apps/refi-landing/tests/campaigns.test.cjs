const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { pathToFileURL } = require('node:url');
const { loadCatalog } = require('../scripts/campaign-catalog.cjs');
const root = path.resolve(__dirname, '../../..');
const base = JSON.parse(fs.readFileSync(path.join(root, 'config/landing/refi.json')));
const campaign = JSON.parse(fs.readFileSync(path.join(root, 'src/config/campaigns/refi.json')));
const directory = path.join(root, 'config/landing/campaigns');
const pages = loadCatalog(base, campaign, directory);
const lead = import(pathToFileURL(process.env.CRO_LEAD_TEST_SOURCE || path.resolve(__dirname, '../src/lib/lead.ts')).href);

test('each configured campaign has a unique route, offer, form, FAQ and thank-you', () => {
  assert.equal(pages.length, 3);
  for (const field of ['route', 'landingId', 'benefitsTitle']) assert.equal(new Set(pages.map(page => page[field])).size, 3);
  for (const field of ['hero', 'form', 'faq', 'thankYou']) assert.equal(new Set(pages.map(page => JSON.stringify(page[field]))).size, 3);
  for (const page of pages) { assert.equal(page.campaign, base.campaign); assert.equal(page.product, base.product); assert.equal(page.endpoint, '/api/lead'); assert.equal(page.testimonials.videos.length, 0); assert.ok(page.testimonialNote); }
});

test('the selected page pins attribution even with a conflicting URL and preserves source', async () => {
  const { createPayload } = await lead;
  for (const page of pages) {
    const other = pages.find(candidate => candidate.landingId !== page.landingId);
    const payload = createPayload({ name: 'TEST מסלול', phone: '0500000198', analyticsConsent: false }, page, 'TEST-campaign-contract', new Date(), '?utm_source=synthetic&utm_campaign=' + other.landingId);
    assert.equal(payload.utm_campaign, page.attributionCampaign); assert.equal(payload.utm_source, 'synthetic');
    assert.equal(payload.event_id, payload.idempotency_key); assert.equal(payload.marketing_consent, false);
    const { intakeSource } = require('../../../src/webhooks/intake/source');
    assert.equal(new Function('$input', '$getWorkflowStaticData', intakeSource('validate.js'))({ first: () => ({ json: { body: payload, headers: {} } }) }, () => ({}))[0].json.ok, true);
  }
});

test('the catalog rejects missing copy, duplicate routes, unknown codes and identity overrides', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'campaign-catalog-'));
  try {
    const originals = fs.readdirSync(directory).map(file => ({ file, value: JSON.parse(fs.readFileSync(path.join(directory, file))) }));
    for (const mutate of [entries => { delete entries[0].value.form.button; }, entries => { entries[0].value.route = entries[1].value.route; }, entries => { entries[0].value.attributionCampaign = 'campaign_unknown'; }, entries => { entries[0].value.product = 'unapproved'; }]) {
      const entries = structuredClone(originals); mutate(entries);
      for (const entry of entries) fs.writeFileSync(path.join(temporary, entry.file), JSON.stringify(entry.value));
      assert.throws(() => loadCatalog(base, campaign, temporary));
    }
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});

test('new receipt scope accepts configured-shaped keys and rejects untrusted values', async () => {
  const { isReceipt } = await lead;
  const receipt = { version: 1, requestId: 'TEST_receipt', eventId: '9ad9c0d0-2be1-4e2c-a20f-e75a39bb2001', acceptedAt: new Date().toISOString(), analyticsConsent: false };
  assert.equal(isReceipt(receipt), true);
  for (const page of pages) assert.equal(isReceipt({ ...receipt, landingId: page.landingId }), true);
  for (const landingId of ['<script>', {}, '../buyers']) assert.equal(isReceipt({ ...receipt, landingId }), false);
});

test('message packs remain drafts and rating sources are kept separate', () => {
  for (const page of pages) {
    const pack = JSON.parse(fs.readFileSync(path.join(root, 'config/campaign-messages', page.landingId + '.json')));
    assert.equal(pack.status, 'draft-only'); assert.equal(pack.dispatchEnabled, false); assert.equal(pack.landingPath, page.route);
    assert.equal(pack.ads.length, 10); assert.equal(new Set(pack.ads.map(ad => ad.title)).size, 10);
    assert.deepEqual(Object.keys(pack.serviceDrafts).sort(), ['acknowledgement', 'handoff', 'qualification']);
  }
  const trust = JSON.parse(fs.readFileSync(path.join(root, 'config/landing/trust.json')));
  assert.equal(trust.midrag.score, '9.89'); assert.equal(trust.midrag.sourceLabel, 'על פי נתוני אקסלנט');
  assert.equal(trust.reviews.score, '5.0'); assert.equal(trust.reviews.count, '74'); assert.equal(new URL(trust.reviews.url).hostname, 'www.bizreviews.co.il');
});
