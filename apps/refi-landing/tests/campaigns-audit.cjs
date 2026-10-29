const fs = require('node:fs'), path = require('node:path');
const { createServer } = require('./server.cjs');
const out = path.resolve(__dirname, '../../../tests/out/campaign-content-20261029');
const pages = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/generated/variants.json')));
(async () => {
  const { default: lighthouse } = await import('lighthouse'); const { launch } = await import('chrome-launcher');
  fs.mkdirSync(out, { recursive: true });
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  console.log('Starting isolated installed Chrome for the mobile lab audit.');
  const chrome = await launch({ chromeFlags: ['--headless=new', '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check'] });
  const runs = [];
  try {
    for (const page of pages) {
      console.log('Auditing ' + page.landingId);
      const result = await lighthouse('http://127.0.0.1:' + server.address().port + page.route, { port: chrome.port, logLevel: 'error', output: 'json', onlyCategories: ['performance', 'accessibility'], formFactor: 'mobile' }, { extends: 'lighthouse:default', settings: { maxWaitForLoad: 20000, maxWaitForFcp: 15000 } });
      if (!result?.lhr) throw Error('Missing Lighthouse result'); const lhr = result.lhr;
      fs.writeFileSync(path.join(out, page.landingId + '-lighthouse.json'), result.report);
      const metrics = { campaign: page.landingId, lcpMs: lhr.audits['largest-contentful-paint'].numericValue, cls: lhr.audits['cumulative-layout-shift'].numericValue, performance: lhr.categories.performance.score, accessibility: lhr.categories.accessibility.score };
      runs.push(metrics); console.log(JSON.stringify(metrics));
    }
    const status = runs.every(run => run.lcpMs < 2500) ? 'PASS' : 'FAIL';
    fs.writeFileSync(path.join(out, 'performance.json'), JSON.stringify({ status, scope: 'One Lighthouse mobile lab run per campaign, local build, simulated throttling; no field or live API performance claim', runs }, null, 2));
    if (status !== 'PASS') process.exitCode = 1;
  } finally { await chrome.kill(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
