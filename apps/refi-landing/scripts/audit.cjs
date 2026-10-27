const fs = require('node:fs'), path = require('node:path');
const { createServer } = require('../tests/server.cjs');
const out = path.resolve(__dirname, '../../../tests/out/refi-cro-20261027');

(async () => {
  const { default: lighthouse } = await import('lighthouse');
  const { launch } = await import('chrome-launcher');
  fs.mkdirSync(out, { recursive: true });
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  let chrome;
  const runs = [];
  try {
    chrome = await launch({ chromeFlags: ['--headless=new', '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check'] });
    for (let i = 1; i <= 3; i++) {
      const result = await lighthouse(url, { port: chrome.port, logLevel: 'error', output: ['json', 'html'], onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'], formFactor: 'mobile', disableStorageReset: false });
      if (!result?.lhr) throw Error('No Lighthouse report');
      const lhr = result.lhr;
      fs.writeFileSync(path.join(out, `lighthouse-mobile-${i}.json`), result.report[0]);
      fs.writeFileSync(path.join(out, `lighthouse-mobile-${i}.html`), result.report[1]);
      const metrics = { run: i, lcpMs: lhr.audits['largest-contentful-paint'].numericValue, cls: lhr.audits['cumulative-layout-shift'].numericValue, tbtMs: lhr.audits['total-blocking-time'].numericValue, performance: lhr.categories.performance.score, accessibility: lhr.categories.accessibility.score, lighthouseVersion: lhr.lighthouseVersion };
      runs.push(metrics); console.log(JSON.stringify(metrics));
    }
    const status = runs.every(r => r.lcpMs < 2500) ? 'PASS' : 'FAIL';
    fs.writeFileSync(path.join(out, 'performance.json'), JSON.stringify({ scope: 'Lighthouse mobile lab test of local production build; simulated throttling; not field or deployed API evidence', status, runs }, null, 2));
    if (status !== 'PASS') throw Error('At least one mobile LCP was 2.5 seconds or more');
  } finally { if (chrome) await chrome.kill(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
