const { chromium } = require('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createServer } = require('./server.cjs');
const pages = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/generated/variants.json')));
const out = path.resolve(__dirname, '../../../tests/out/campaign-content-20261029');
const results = [];
const check = async (name, fn) => { await fn(); results.push({ name, status: 'PASS' }); console.log('PASS '+name); };

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const content of pages) {
      const context = await browser.newContext(); const page = await context.newPage(); const errors = [], external = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', entry => { if (entry.type() === 'error') errors.push(entry.text()); });
      page.on('request', request => { if (!request.url().startsWith(base)) external.push(request.url()); });
      await check(content.landingId + ' has matching SSR, title, FAQ and legacy-link redirect', async () => {
        const initial = await fetch(base + content.route); assert.equal(initial.status, 200);
        const html = await initial.text(); assert.ok(html.includes(content.hero.title)); assert.ok(html.includes(content.meta.title));
        const redirect = await fetch(base + '/?utm_campaign=' + content.landingId + '&utm_source=synthetic', { redirect: 'manual' });
        assert.equal(redirect.status, 302); assert.equal(redirect.headers.get('location'), content.route + '?utm_campaign=' + content.landingId + '&utm_source=synthetic');
        await page.goto(base + '/?utm_campaign=' + content.landingId + '&utm_source=synthetic', { waitUntil: 'networkidle' });
        assert.equal(new URL(page.url()).pathname, content.route); assert.equal(await page.title(), content.meta.title);
        assert.equal(await page.locator('[data-trust-proof]').count(), 2);
        const formProof = page.locator('form [data-trust-proof]');
        assert.ok((await formProof.textContent()).includes('9.89')); assert.ok((await formProof.textContent()).includes('על פי נתוני אקסלנט'));
        assert.equal(await formProof.getByRole('link').getAttribute('href'), 'https://www.bizreviews.co.il/provider/peled-yoram#reviews');
        assert.equal(await page.locator('form img[alt="אקסלנט משכנתאות ופיננסים"]').count(), 1);
        assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
        const schema = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
        assert.deepEqual(schema.mainEntity.map(item => item.name), content.faq.map(item => item.question));
        for (const item of content.faq) { const button = page.getByRole('button', { name: item.question, exact: true }); await button.focus(); await button.press('Enter'); const target = page.locator('#' + await button.getAttribute('aria-controls')); assert.equal((await target.textContent()).trim(), item.answer); await button.press('Enter'); }
      });
      await check(content.landingId + ' is readable and accessible at mobile and desktop sizes', async () => {
        for (const width of [320, 390, 768, 1440]) { await page.setViewportSize({ width, height: 900 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'overflow at ' + width); }
        await page.addScriptTag({ url: base + '/__test/axe.js' });
        const violations = await page.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa'] })).violations);
        assert.deepEqual(violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) })), []);
        for (const width of [390, 1440]) { await page.setViewportSize({ width, height: 900 }); await page.goto(base + content.route, { waitUntil: 'networkidle' }); await page.screenshot({ path: path.join(out, content.landingId + '-' + width + '.png'), fullPage: true }); }
      });
      await check(content.landingId + ' pins its code, confirms its own thank-you, and isolates another campaign receipt', async () => {
        await fetch(base + '/__test/mode?value=ok');
        const other = pages.find(candidate => candidate.landingId !== content.landingId);
        await page.goto(base + content.route + '?utm_campaign=' + other.landingId + '&utm_source=synthetic');
        await page.getByLabel('שם מלא', { exact: true }).fill('TEST תוכן מותאם'); await page.getByLabel('טלפון נייד', { exact: true }).fill('0500000198');
        await page.getByRole('button', { name: content.form.button, exact: true }).click(); await page.waitForURL(base + content.thankYouPath);
        await page.getByText(content.thankYou.description, { exact: true }).waitFor();
        const entries = await (await fetch(base + '/__test/log')).json(); assert.equal(entries.length, 1); const body = entries[0].body;
        assert.equal(body.utm_campaign, content.attributionCampaign); assert.equal(body.event_id, body.idempotency_key); assert.equal(body.service_request, true); assert.equal(body.marketing_consent, false);
        const receipt = await page.evaluate(() => JSON.parse(sessionStorage.getItem('excelent:quote-receipt:v1')));
        assert.equal(receipt.landingId, content.landingId); assert.equal(receipt.name, undefined); assert.equal(receipt.phone, undefined);
        await page.reload({ waitUntil: 'networkidle' }); await page.getByText(content.thankYou.description, { exact: true }).waitFor();
        await page.goto(base + other.thankYouPath); await page.getByRole('heading', { name: /עוד לא נשלחה בקשה/ }).waitFor();
        assert.equal(await page.getByRole('link', { name: 'לבקשת שיחה', exact: true }).getAttribute('href'), other.route + '#lead-form');
        assert.deepEqual(errors, []); assert.deepEqual(external, []);
      });
      await context.close();
    }
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); fs.writeFileSync(path.join(out, 'campaign-e2e.json'), JSON.stringify({ scope: 'Local production build, real browser and mock intake only', results }, null, 2)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
