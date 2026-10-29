// Loopback-only verification server. Never included in the deployment output.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '../../../site/refi-cro');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.vtt': 'text/vtt' };

function createServer() {
  let mode = 'ok', analytics = false, requests = [];
  const seen = new Map();
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/' || url.pathname === '/index.html') {
      const pages = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/generated/variants.json'), 'utf8'));
      const page = pages.find(page => page.attributionCampaign === url.searchParams.get('utm_campaign'));
      if (page) { res.writeHead(302, { Location: page.route + url.search }).end(); return; }
    }
    if (url.pathname === '/__test/axe.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(fs.readFileSync(require.resolve('axe-core/axe.min.js'))); return; }
    if (url.pathname === '/__test/mode') { mode = url.searchParams.get('value') || 'ok'; requests = []; res.end('ok'); return; }
    if (url.pathname === '/__test/analytics') { analytics = url.searchParams.get('enabled') === 'true'; res.end('ok'); return; }
    if (url.pathname === '/__test/log') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(requests)); return; }
    // Never expose the deployed project's public binding to a local browser test.
    if (url.pathname === '/analytics-config.json') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(analytics ? { key: 'phc_TEST_CRO_VERIFICATION_ONLY', host: 'https://analytics.example.invalid' } : { key: '', host: '' })); return; }
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname !== '/api/lead' || req.method !== 'POST') { res.writeHead(404).end(); return; }
      let body = ''; req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        let payload; try { payload = JSON.parse(body); } catch { res.writeHead(400).end(); return; }
        requests.push({ body: payload, receivedAt: Date.now(), mode });
        setTimeout(() => {
          res.setHeader('Content-Type', 'application/json');
          if (mode === 'error') { res.statusCode = 502; res.end('{"error":"save_failed"}'); return; }
          if (mode === 'rate') { res.statusCode = 429; res.end('{"error":"rate_limited"}'); return; }
          if (mode === 'missing') { res.end('{"ok":true}'); return; }
          if (mode === 'malformed') { res.end('<html>upstream error</html>'); return; }
          const key = payload.event_id;
          const duplicate = seen.has(key);
          if (!duplicate) seen.set(key, 'TEST_CRM_' + (seen.size + 1));
          res.end(JSON.stringify({ request_id: seen.get(key), duplicate }));
        }, mode === 'slow' ? 900 : 100);
      }); return;
    }
    let decoded;
    try { decoded = decodeURIComponent(url.pathname); } catch { res.writeHead(400).end(); return; }
    let file = path.resolve(root, '.' + decoded);
    if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    try { if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html'); } catch { res.writeHead(404).end(); return; }
    fs.readFile(file, (error, data) => {
      if (error) { res.writeHead(404).end(); return; }
      const headers = JSON.parse(fs.readFileSync(path.join(root, 'security-headers.json')));
      for (const [name, value] of Object.entries(headers)) {
        let header = value.replace('; upgrade-insecure-requests', '');
        if (name === 'Content-Security-Policy' && analytics) header = header.replace("connect-src 'self'", "connect-src 'self' https://analytics.example.invalid");
        res.setHeader(name, header);
      }
      res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
      if (/gzip/.test(req.headers['accept-encoding'] || '') && /\.(html|js|css|json)$/.test(file)) { res.setHeader('Content-Encoding', 'gzip'); res.setHeader('Vary', 'Accept-Encoding'); res.end(zlib.gzipSync(data)); }
      else res.end(data);
    });
  });
}

if (require.main === module) createServer().listen(4186, '127.0.0.1', () => { console.log('Local mock preview: http://127.0.0.1:4186'); process.send?.('ready'); });
module.exports = { createServer };
