// Real local nginx, real HTTP, controlled loopback upstream only. No live leads.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');

const root = path.resolve(__dirname, '../..');
const nginx = process.env.NGINX_BINARY || 'nginx';
const staging = 'lp1-stg.srv1604140.hstgr.cloud';
const publicHost = 'refi.excelentfinance.com';
const upstreamHost = 'n8n-qhxa.srv1604140.hstgr.cloud';
const auth = 'Basic ' + Buffer.from('synthetic:local-test-only').toString('base64');
const routes = [
  { path: '/api/lead', target: '/webhook/lead-intake', kind: undefined },
  { path: '/api/club', target: '/webhook/lp-signup', kind: 'club' },
  { path: '/api/partner', target: '/webhook/lp-signup', kind: 'partner' },
];
const listen = server => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => resolve(server.address().port));
});
const close = server => new Promise(resolve => server.close(resolve));
async function freePort() {
  const server = net.createServer();
  const port = await listen(server);
  await close(server);
  return port;
}
function request(port, host, url, method = 'GET', body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: url, method,
      headers: { Host: host, Connection: 'close', ...extraHeaders,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }) } }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(2000, () => req.destroy(new Error('Local proxy request timed out')));
    req.end(body);
  });
}

async function fixture(t, sharedStagingRoute = false, missingCroRoute = false) {
  const version = spawnSync(nginx, ['-v'], { encoding: 'utf8' });
  assert.equal(version.status, 0, `nginx is required for proxy verification; install it or set NGINX_BINARY. ${version.error?.message || version.stderr}`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp1-proxy-')).replace(/\\/g, '/');
  fs.mkdirSync(path.join(dir, 'logs'));
  const calls = [];
  const upstream = http.createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      calls.push({ path: req.url, method: req.method, headers: req.headers, body });
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ request_id: 'SYNTHETIC_PROXY_ACK' }));
    });
  });
  let child;
  t.after(async () => {
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill('SIGTERM');
      await exited;
    }
    await close(upstream);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const upstreamPort = await listen(upstream);
  const port = await freePort();
  fs.writeFileSync(path.join(dir, 'index.html'), 'Synthetic local page');
  for (const name of ['privacy.html', 'accessibility.html', 'partners.html']) fs.copyFileSync(path.join(root, 'site/lp1v2', name), path.join(dir, name));
  fs.mkdirSync(path.join(dir, 'assets'));
  for (const name of ['v2.css', 'v2.js', 'partners.js']) fs.copyFileSync(path.join(root, 'site/lp1v2/assets', name), path.join(dir, 'assets', name));
  fs.writeFileSync(path.join(dir, 'htpasswd'), 'synthetic:{SHA}' + createHash('sha1').update('local-test-only').digest('base64') + '\n');
  for (const name of ['client', 'proxy', 'fastcgi', 'uwsgi', 'scgi']) fs.mkdirSync(path.join(dir, name));

  let config = fs.readFileSync(path.join(root, 'deploy/nginx.conf'), 'utf8');
  const croInclude = 'include /site/refi-cro/nginx-site.inc;';
  assert.equal(config.split(croInclude).length, 2, 'React build must be included exactly once');
  if (missingCroRoute) config = config.replace(croInclude, '');
  else config = config.replace(croInclude, `include ${dir}/cro-build.inc;`);
  const builtInclude = fs.readFileSync(path.join(root, 'site/refi-cro/nginx-site.inc'), 'utf8')
    .replaceAll('/site/refi-cro', path.join(root, 'site/refi-cro').replace(/\\/g, '/'));
  fs.writeFileSync(path.join(dir, 'cro-build.inc'), builtInclude);
  if (sharedStagingRoute) {
    // Reintroduce the original defect: the protected host gets operational API routes.
    const blockedLocation = /location \^~ \/api\/ \{\s*default_type application\/json;\s*return 503 '[^']+';\s*\}/g;
    assert.equal([...config.matchAll(blockedLocation)].length, 1, 'negative control must replace exactly one staging guard');
    config = config.replace(blockedLocation, 'include /etc/nginx/conf.d/lp1-api.inc;');
  }
  config = config.replace(/listen 80/g, `listen 127.0.0.1:${port}`)
    .replaceAll('/etc/nginx/conf.d/', dir + '/')
    .replaceAll('/etc/nginx/secrets/htpasswd', dir + '/htpasswd')
    .replaceAll('/site/lp1v2', dir);
  let targets = 0;
  for (const name of ['lp1-site.inc', 'lp1-api.inc']) {
    let content = fs.readFileSync(path.join(root, 'deploy', name), 'utf8');
    content = content.replace(/https:\/\/n8n-qhxa\.srv1604140\.hstgr\.cloud\/webhook\//g, () => {
      targets++;
      return `http://127.0.0.1:${upstreamPort}/webhook/`;
    });
    assert.ok(!/proxy_pass\s+https?:\/\/(?!127\.0\.0\.1:)/.test(content), 'test must never retain an external upstream');
    fs.writeFileSync(path.join(dir, name), content);
  }
  assert.equal(targets, 3, 'all operational routes must be redirected to the controlled local upstream');
  const tempPaths = ['client_body', 'proxy', 'fastcgi', 'uwsgi', 'scgi'].map((name, i) => `${name}_temp_path ${dir}/${['client', 'proxy', 'fastcgi', 'uwsgi', 'scgi'][i]};`).join('\n');
  // Keep this isolated test process under its existing user. Some sandboxed
  // root environments cannot chown temporary files to nginx's default nobody.
  let sameUser = '';
  if (process.getuid?.() === 0) {
    const username = os.userInfo().username;
    assert.match(username, /^[a-z_][a-z0-9_-]*$/i);
    sameUser = `user ${username};\n`;
  }
  const fullConfig = `${sameUser}daemon off;\nmaster_process off;\npid ${dir}/nginx.pid;\nerror_log ${dir}/error.log;\nevents {}\nhttp {\nserver_names_hash_bucket_size 64;\naccess_log off;\n${tempPaths}\n${config}\n}\n`;
  const confPath = path.join(dir, 'test.conf');
  fs.writeFileSync(confPath, fullConfig);
  const checked = spawnSync(nginx, ['-p', dir + '/', '-c', confPath, '-t'], { encoding: 'utf8' });
  assert.equal(checked.status, 0, checked.stderr);
  child = spawn(nginx, ['-p', dir + '/', '-c', confPath], { stdio: 'ignore' });
  let spawnError;
  child.on('error', e => spawnError = e);
  for (let attempt = 0; attempt < 50; attempt++) {
    if (spawnError) throw spawnError;
    assert.equal(child.exitCode, null, fs.readFileSync(path.join(dir, 'error.log'), 'utf8'));
    try {
      await request(port, publicHost, '/');
      return { port, calls };
    } catch (e) {
      if (attempt === 49) throw e;
      await delay(40);
    }
  }
}

async function assertStagingIsolated(f, route) {
  const before = f.calls.length;
  const r = await request(f.port, staging, route.path, 'POST', JSON.stringify({ test: 'synthetic', path: route.path }), { Authorization: auth });
  assert.equal(f.calls.length, before, 'private staging forwarded a submission to the operational route');
  assert.equal(r.status, 503);
  assert.match(r.headers['content-type'], /^application\/json/);
  assert.deepEqual(JSON.parse(r.body), { error: 'staging_intake_not_connected' });
}

test('real nginx isolates all staging forms and preserves public route behavior', { timeout: 20000 }, async t => {
  const f = await fixture(t);
  assert.equal((await request(f.port, staging, '/')).status, 401, 'staging page remains password protected');
  assert.equal((await request(f.port, staging, '/', 'GET', undefined, { Authorization: auth })).status, 200);
  for (const [index, route] of routes.entries()) {
    await assertStagingIsolated(f, route);
    const body = JSON.stringify({ test: 'synthetic', request: index });
    const ip = `192.0.2.${index + 10}`;
    const r = await request(f.port, publicHost, route.path, 'POST', body, {
      Authorization: auth, 'X-Forwarded-For': ip, 'X-LP-Client-IP': 'untrusted', 'X-LP-Host': 'untrusted',
    });
    assert.equal(r.status, 200);
    assert.deepEqual(JSON.parse(r.body), { request_id: 'SYNTHETIC_PROXY_ACK' });
    const call = f.calls.at(-1);
    assert.equal(call.method, 'POST');
    assert.equal(call.path, route.target);
    assert.equal(call.body, body);
    assert.equal(call.headers.host, upstreamHost);
    assert.equal(call.headers['x-lp-host'], publicHost);
    assert.equal(call.headers['x-lp-client-ip'], ip);
    assert.equal(call.headers['x-lp-kind'], route.kind);
    assert.equal(call.headers.authorization, undefined, 'browser authorization must not reach upstream');
    const before = f.calls.length;
    const denied = await request(f.port, publicHost, route.path, 'GET', undefined, { 'X-Forwarded-For': `192.0.2.${index + 20}` });
    assert.equal(denied.status, 403, 'operational endpoints remain POST only');
    assert.equal(f.calls.length, before);
  }
  assert.equal(f.calls.length, 3, 'only the three public POST requests reached the controlled upstream');
});

test('the same HTTP isolation check detects the original shared staging route', { timeout: 20000 }, async t => {
  const f = await fixture(t, true);
  for (const route of routes) {
    await assert.rejects(() => assertStagingIsolated(f, route), { code: 'ERR_ASSERTION', message: /private staging forwarded/ });
  }
  assert.equal(f.calls.length, 3, 'negative control actually forwarded all three test requests');
});

function assertPublicAnalytics(config, csp) {
  const expected = JSON.parse(fs.readFileSync(path.join(root, 'config/landing/posthog.public.json'), 'utf8'));
  assert.deepEqual(config, { key: expected.key, host: expected.host });
  assert.match(config.key, /^phc_[A-Za-z0-9_-]{8,200}$/);
  const connect = csp.split(';').map(x => x.trim()).find(x => x.startsWith('connect-src '));
  assert.equal(connect, "connect-src 'self' " + new URL(expected.host).origin);
}

test('analytics release check rejects empty, wrong-project and expanded network bindings', () => {
  const { key, host } = JSON.parse(fs.readFileSync(path.join(root, 'config/landing/posthog.public.json'), 'utf8'));
  const csp = "default-src 'self'; connect-src 'self' " + host + ';';
  assertPublicAnalytics({ key, host }, csp);
  for (const bad of [{ key: '', host: '' }, { key: 'phc_WRONG_PROJECT', host }, { key, host: 'https://example.invalid' }])
    assert.throws(() => assertPublicAnalytics(bad, csp), { code: 'ERR_ASSERTION' });
  for (const bad of ["connect-src *", "connect-src 'self'", "connect-src 'self' " + host + ' https:'])
    assert.throws(() => assertPublicAnalytics({ key, host }, bad), { code: 'ERR_ASSERTION' });
});

async function assertCroPublished(f) {
  const home = await request(f.port, publicHost, '/');
  assert.equal(home.status, 200);
  assert.ok(home.body.includes('data-section="hero"'), 'public root did not serve the verified React build');
  const entry = /src="(\/cro-assets\/index-[^"]+\.js)"/.exec(home.body)?.[1];
  assert.ok(entry, 'entry bundle must use its isolated asset prefix');
  assert.equal((await request(f.port, publicHost, entry)).status, 200);
  assert.match(home.headers['content-security-policy'], /style-src 'self' 'sha256-/);
  assert.equal(home.headers['cache-control'], 'no-cache');
  for (const route of ['/thank-you', '/thank-you/']) {
    const thanks = await request(f.port, publicHost, route);
    assert.equal(thanks.status, 200); assert.ok(thanks.body.includes('נשארים בקשר'));
  }
  assertPublicAnalytics(JSON.parse((await request(f.port, publicHost, '/analytics-config.json')).body), home.headers['content-security-policy']);
}

test('real nginx serves the React release alongside LP1 v2 legal and partner pages', { timeout: 20000 }, async t => {
  const f = await fixture(t);
  await assertCroPublished(f);
  for (const file of ['privacy.html', 'accessibility.html', 'partners.html', 'assets/v2.css', 'assets/partners.js']) {
    const legacy = await request(f.port, publicHost, '/' + file);
    assert.equal(legacy.status, 200, file);
    assert.equal(legacy.body, fs.readFileSync(path.join(root, 'site/lp1v2', file), 'utf8'), file);
  }
  const protectedPage = await request(f.port, staging, '/', 'GET', undefined, { Authorization: auth });
  assert.equal(protectedPage.body, 'Synthetic local page', 'public React route leaked into staging');
  assert.equal(f.calls.length, 0, 'static verification must never call intake');
});

test('release verification detects an omitted React include', { timeout: 20000 }, async t => {
  const f = await fixture(t, false, true);
  await assert.rejects(() => assertCroPublished(f), { code: 'ERR_ASSERTION', message: /public root did not serve/ });
});
