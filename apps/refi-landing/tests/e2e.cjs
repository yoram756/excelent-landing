const { chromium } = require('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createServer } = require('./server.cjs');
const out = path.resolve(__dirname, '../../../tests/out/refi-cro-20261027');
const desktopAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';
const results = [];
const check = async (name, fn) => { try { const value = await fn(); results.push({ name, status: 'PASS', ...(value || {}) }); console.log('PASS ' + name); } catch (error) { results.push({ name, status: 'FAIL', error: error.message }); throw error; } };

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, userAgent: desktopAgent });
    // Local human-browser fixture. The production SDK bot filter is left enabled and tested separately below.
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'userAgentData', { get: () => undefined });
    });
    const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push({ message: e.message, url: 'pageerror' })); page.on('console', e => { if (e.type() === 'error') errors.push({ message: e.text(), url: e.location().url }); });
    await page.goto(base, { waitUntil: 'networkidle' });
    await check('prerendered Hebrew document and exact seven-section order', async () => {
      const html = await (await fetch(base)).text(); assert.ok(html.includes('החיים השתנו.')); assert.ok(html.includes('FAQPage'));
      assert.equal(await page.locator('html').getAttribute('lang'), 'he'); assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
      assert.deepEqual(await page.locator('[data-section]').evaluateAll(nodes => nodes.map(n => n.dataset.section)), ['hero', 'trust', 'benefits', 'testimonials', 'lead-form', 'faq', 'mobile-cta']);
      assert.equal(await page.locator('#benefits article').count(), 3);
    });
    await check('body and heading line heights, local fonts and no positive tracking', async () => {
      const metrics = await page.evaluate(() => { const body = getComputedStyle(document.body), h = getComputedStyle(document.querySelector('h1')); return { body: parseFloat(body.lineHeight) / parseFloat(body.fontSize), heading: parseFloat(h.lineHeight) / parseFloat(h.fontSize), tracking: h.letterSpacing, fonts: performance.getEntriesByType('resource').filter(x => /woff2/.test(x.name)).map(x => x.name) }; });
      assert.ok(Math.abs(metrics.body - 1.7) < 0.01); assert.ok(Math.abs(metrics.heading - 1.4) < 0.01); assert.ok(metrics.tracking === 'normal' || parseFloat(metrics.tracking) <= 0); assert.ok(metrics.fonts.length); assert.ok(metrics.fonts.every(x => x.startsWith(base)));
    });
    await check('all visible Latin and numeric fragments are directionally isolated', async () => {
      const unisolated = await page.evaluate(() => { const found = [], walker = document.createTreeWalker(document.querySelector('main'), NodeFilter.SHOW_TEXT); while (walker.nextNode()) { const n = walker.currentNode, p = n.parentElement; if (/[A-Za-z\d₪]/.test(n.textContent) && p && !p.closest('bdi,[dir="ltr"],script,style') && p.getClientRects().length) found.push(n.textContent); } return found; });
      assert.deepEqual(unisolated, []);
    });
    await check('FAQ opens by keyboard and schema answers match the real content', async () => {
      const faq = await page.locator('script[type="application/ld+json"]').evaluate(e => JSON.parse(e.textContent)); assert.equal(faq['@context'], 'https://schema.org');
      for (const item of faq.mainEntity) { const button = page.getByRole('button', { name: item.name, exact: true }); await button.focus(); await page.keyboard.press('Enter'); assert.equal(await button.getAttribute('aria-expanded'), 'true'); const panel = page.locator('#' + await button.getAttribute('aria-controls')); assert.equal((await panel.textContent()).trim(), item.acceptedAnswer.text); await button.press('Enter'); }
    });
    await check('no horizontal overflow at mobile, tablet or desktop widths', async () => {
      for (const width of [320, 390, 768, 1440]) { await page.setViewportSize({ width, height: 900 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'width ' + width); }
    });
    await check('mobile sticky CTA stays usable and does not cover the form', async () => {
      await page.setViewportSize({ width: 390, height: 844 }); await page.evaluate(() => scrollTo(0, 0)); await page.locator('[data-section="mobile-cta"]').waitFor({ state: 'visible' });
      await page.getByRole('link', { name: 'לבדיקה ללא עלות', exact: true }).click(); await page.locator('#lead-form').scrollIntoViewIfNeeded();
      await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-section="mobile-cta"]')).visibility === 'hidden');
    });
    await check('contact validation rejects incomplete data without a request', async () => {
      await page.getByRole('button', { name: 'כן, אשמח לבדיקה ראשונית', exact: true }).click(); assert.equal(await page.locator('input[name="name"]').getAttribute('aria-invalid'), 'true');
      await page.getByLabel('שם מלא', { exact: true }).fill('TEST בדיקת אתר'); await page.getByLabel('טלפון נייד', { exact: true }).fill('abc'); await page.getByRole('button', { name: 'כן, אשמח לבדיקה ראשונית', exact: true }).click();
      assert.equal(await page.locator('input[name="phone"]').getAttribute('aria-invalid'), 'true'); assert.equal((await (await fetch(base + '/__test/log')).json()).length, 0);
    });
    const fill = async phone => { await page.getByLabel('שם מלא', { exact: true }).fill('TEST בדיקת אתר'); await page.getByLabel('טלפון נייד', { exact: true }).fill(phone || '0500000198'); };
    const submit = () => page.getByRole('button', { name: 'כן, אשמח לבדיקה ראשונית', exact: true }).click();
    const log = async () => (await (await fetch(base + '/__test/log')).json());
    const mode = async value => { await fetch(base + '/__test/mode?value=' + value); };
    await check('HTTP 502 cannot show thank-you; unchanged retry keeps its event id', async () => {
      await mode('error'); await fill(); await submit(); await page.getByRole('alert').waitFor(); assert.equal(new URL(page.url()).pathname, '/'); const first = (await log())[0].body;
      assert.equal(first.phone, '972500000198'); assert.equal(first.event_id, first.idempotency_key); assert.equal(first.marketing_consent, false); assert.equal(first.service_request, true);
      await mode('ok'); await submit(); await page.waitForURL('**/thank-you'); await page.getByRole('heading', { name: /הפרטים התקבלו/ }).waitFor(); assert.equal((await log())[0].body.event_id, first.event_id);
    });
    await check('success receipt persists on refresh without storing contact details', async () => {
      const receipt = await page.evaluate(() => JSON.parse(sessionStorage.getItem('excelent:quote-receipt:v1'))); assert.ok(receipt.requestId); assert.equal(receipt.phone, undefined); assert.equal(receipt.name, undefined);
      await page.reload({ waitUntil: 'networkidle' }); await page.getByRole('heading', { name: /הפרטים התקבלו/ }).waitFor();
    });
    await check('editing a failed submission generates a new event id', async () => {
      await page.goto(base); await mode('error'); await fill(); await submit(); await page.getByRole('alert').waitFor(); const first = (await log())[0].body.event_id;
      await page.getByLabel('טלפון נייד', { exact: true }).fill('0500000199'); await mode('ok'); await submit(); await page.waitForURL('**/thank-you'); assert.notEqual((await log())[0].body.event_id, first);
    });
    for (const broken of ['missing', 'malformed', 'rate']) await check(broken + ' response cannot record success', async () => {
      await page.goto(base); await mode(broken); await fill(); await submit(); await page.getByRole('alert').waitFor(); assert.equal(new URL(page.url()).pathname, '/');
    });
    await check('double submission sends one webhook and dispatches within two seconds', async () => {
      await page.goto(base); await mode('slow'); await fill();
      await page.evaluate(() => { window.__submitAt = performance.now(); const form = document.querySelector('form'); form.requestSubmit(); form.requestSubmit(); });
      await page.waitForURL('**/thank-you'); const entries = await log(); assert.equal(entries.length, 1);
      const dispatchMs = await page.evaluate(() => performance.getEntriesByType('resource').find(e => e.name.endsWith('/api/lead')).startTime - window.__submitAt); assert.ok(dispatchMs < 2000); return { dispatchMs };
    });
    await check('direct thank-you visit never invents a success or conversion', async () => {
      const fresh = await browser.newContext({ userAgent: desktopAgent }); const p = await fresh.newPage(); const analyticsRequests = []; p.on('request', r => { if (r.url().includes('analytics.example.invalid')) analyticsRequests.push(r.url()); });
      await p.goto(base + '/thank-you', { waitUntil: 'networkidle' }); await p.getByRole('heading', { name: /עוד לא נשלחה בקשה/ }).waitFor(); assert.equal(analyticsRequests.length, 0); await fresh.close();
    });
    await check('blocked browser storage still permits a confirmed in-memory submission', async () => {
      await mode('ok'); const fresh = await browser.newContext({ userAgent: desktopAgent }); await fresh.addInitScript(() => Object.defineProperty(window, 'sessionStorage', { get() { throw new DOMException('Denied', 'SecurityError'); } })); const p = await fresh.newPage();
      await p.goto(base); await p.getByLabel('שם מלא', { exact: true }).fill('TEST ללא אחסון'); await p.getByLabel('טלפון נייד', { exact: true }).fill('0500000198'); await p.getByRole('button', { name: 'כן, אשמח לבדיקה ראשונית', exact: true }).click(); await p.waitForURL('**/thank-you'); await p.getByRole('heading', { name: /הפרטים התקבלו/ }).waitFor(); await fresh.close();
    });
    await fetch(base + '/__test/analytics?enabled=true'); await mode('ok');
    const captures = [], networkBodies = [];
    await context.route('https://analytics.example.invalid/**', async route => {
      const request = route.request(); const raw = request.postData() || ''; networkBodies.push(raw);
      let data; try { data = JSON.parse(raw); } catch { const encoded = new URLSearchParams(raw).get('data'); if (encoded) { try { data = JSON.parse(encoded); } catch { try { data = JSON.parse(Buffer.from(encoded, 'base64').toString()); } catch {} } } }
      for (const event of Array.isArray(data) ? data : data?.batch || (data ? [data] : [])) if (event.event === 'quote_submitted') captures.push(event);
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': base, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type,x-ph-client-id,x-ph-client-platform,x-ph-client-platform-version', 'access-control-allow-methods': 'GET,POST,OPTIONS' }, body: '{"status":1,"featureFlags":{}}' });
    });
    await check('real PostHog SDK emits a consented quote only after API confirmation', async () => {
      await page.goto(base); await fill(); assert.equal(await page.locator('[name="analytics-consent"]').isChecked(), false); assert.equal(captures.length, 0);
      await page.locator('[name="analytics-consent"]').check(); await submit(); await page.waitForURL('**/thank-you');
      const deadline = Date.now() + 20000; while (!captures.length && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
      assert.equal(captures.length, 1, JSON.stringify({ errors, networkBodies })); const body = (await log()).at(-1).body; assert.equal(captures[0].uuid, body.event_id); assert.equal(captures[0].properties.event_id, body.event_id);
      const serialized = JSON.stringify(captures); for (const pii of ['972500000198', '0500000198', 'TEST בדיקת אתר', 'first_name', '$current_url', '$referrer']) assert.ok(!serialized.includes(pii), pii);
      assert.ok(!networkBodies.join('').includes('972500000198'));
    });
    await check('refresh does not emit a duplicate conversion', async () => {
      await page.reload({ waitUntil: 'networkidle' }); await page.getByRole('heading', { name: /הפרטים התקבלו/ }).waitFor(); assert.equal(captures.length, 1);
    });
    await check('the production bot filter still rejects an automated conversion', async () => {
      const automated = await browser.newContext(); const p = await automated.newPage(); let posts = 0;
      await automated.route('https://analytics.example.invalid/**', route => { if (route.request().method() === 'POST') posts++; return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':base},body:'{}'}); });
      await p.goto(base); await p.getByLabel('שם מלא', {exact:true}).fill('TEST אוטומציה'); await p.getByLabel('טלפון נייד', {exact:true}).fill('0500000198'); await p.locator('[name="analytics-consent"]').check(); await p.getByRole('button', {name:'כן, אשמח לבדיקה ראשונית',exact:true}).click(); await p.waitForURL('**/thank-you'); await p.waitForLoadState('networkidle'); assert.equal(posts, 0); await automated.close();
    });
    await check('no consent means no analytics request even after a confirmed lead', async () => {
      const fresh = await browser.newContext({ userAgent: desktopAgent }); const p = await fresh.newPage(); let external = 0; await fresh.route('https://analytics.example.invalid/**', route => { external++; return route.abort(); });
      await p.goto(base); await p.getByLabel('שם מלא', { exact: true }).fill('TEST ללא מדידה'); await p.getByLabel('טלפון נייד', { exact: true }).fill('0500000198'); await p.getByRole('button', { name: 'כן, אשמח לבדיקה ראשונית', exact: true }).click(); await p.waitForURL('**/thank-you'); await p.waitForLoadState('networkidle'); assert.equal(external, 0); await fresh.close();
    });
    await fetch(base + '/__test/analytics?enabled=false');
    await check('axe accessibility on landing and thank-you', async () => {
      for (const route of ['/', '/thank-you']) { await page.goto(base + route, { waitUntil: 'networkidle' }); await page.addScriptTag({ url: base + '/__test/axe.js' }); const violations = await page.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa'] })).violations); fs.writeFileSync(path.join(out, route === '/' ? 'axe-landing.json' : 'axe-thank-you.json'), JSON.stringify(violations, null, 2)); assert.equal(violations.length, 0, JSON.stringify(violations.map(x => ({ id: x.id, nodes: x.nodes.map(n => n.target) })))); }
    });
    await check('console and CSP stay clean; desktop and mobile screenshots saved', async () => {
      const unexpected = errors.filter(e => !(e.url === base + '/api/lead' && /status of (502|429)\b/.test(e.message)));
      assert.deepEqual(unexpected, []); await page.goto(base, { waitUntil: 'networkidle' }); await page.setViewportSize({ width: 1440, height: 1000 }); await page.screenshot({ path: path.join(out, 'desktop.png'), fullPage: true }); await page.screenshot({ path: path.join(out, 'desktop-hero.png'), fullPage: false }); await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: path.join(out, 'mobile.png'), fullPage: true }); await page.screenshot({ path: path.join(out, 'mobile-hero.png'), fullPage: false });
    });
    console.log(results.length + '/' + results.length + ' local browser scenarios passed');
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); fs.writeFileSync(path.join(out, 'e2e.json'), JSON.stringify({ scope: 'Local built site with mock intake and mocked PostHog transport; real browser and SDK', results }, null, 2)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
