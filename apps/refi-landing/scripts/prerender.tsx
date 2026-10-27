import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import App from '../src/App';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const output = path.join(root, 'site/refi-cro');
let template = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
if (!template.includes('<!--app-html-->')) throw Error('Prerender placeholder missing');
// A single small stylesheet is inlined to remove a render-blocking request on
// mobile. Its exact bytes are authorized by a CSP hash, never unsafe-inline.
const cssHashes = new Set<string>();
template = template.replace(/<link\b[^>]*rel="stylesheet"[^>]*>/g, tag => {
  const href = /href="([^"]+)"/.exec(tag)?.[1];
  if (!href || !/^\/cro-assets\/[\w.-]+\.css$/.test(href)) throw Error('Unexpected stylesheet path');
  const css = fs.readFileSync(path.join(output, href.slice(1)), 'utf8');
  if (/<\/style/i.test(css)) throw Error('Unsafe stylesheet delimiter');
  cssHashes.add(`'sha256-${createHash('sha256').update(css).digest('base64')}'`);
  return `<style>${css}</style>`;
});
if (cssHashes.size !== 1) throw Error('Expected exactly one production stylesheet');
const hashes = new Set<string>();
const styleHashes = new Set<string>();
for (const route of ['/', '/thank-you']) {
  const app = renderToString(<StrictMode><App initialPath={route} /></StrictMode>);
  let html = template.replace('<!--app-html-->', app);
  if (route === '/thank-you') html = html.replace('<title>החיים השתנו. והמשכנתא? | אקסלנט</title>', '<title>נשארים בקשר | אקסלנט</title>');
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) if (match[1]) hashes.add(`'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`);
  for (const match of html.matchAll(/\sstyle="([^"<>]*)"/g)) if (match[1]) styleHashes.add(`'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`);
  const dest = route === '/' ? path.join(output, 'index.html') : path.join(output, 'thank-you/index.html');
  fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, html);
}
const analytics = JSON.parse(fs.readFileSync(path.join(output, 'analytics-config.json'), 'utf8')) as { host: string };
const connect = analytics.host ? ' ' + new URL(analytics.host).origin : '';
const styleAttributes = styleHashes.size ? `; style-src-attr 'unsafe-hashes' ${[...styleHashes].join(' ')}` : '';
const csp = `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self'; media-src 'self' https:; script-src 'self' ${[...hashes].join(' ')}; style-src 'self' ${[...cssHashes].join(' ')}${styleAttributes}; font-src 'self'; connect-src 'self'${connect}; upgrade-insecure-requests`;
fs.writeFileSync(path.join(output, 'security-headers.json'), JSON.stringify({ 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' }, null, 2) + '\n');
const pageHeaders = `  add_header Cache-Control "no-cache" always;\n  add_header X-Robots-Tag "noindex, nofollow" always;\n  add_header Content-Security-Policy "${csp}" always;\n  add_header X-Content-Type-Options "nosniff" always;\n  add_header Referrer-Policy "strict-origin-when-cross-origin" always;\n  add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;\n  add_header Strict-Transport-Security "max-age=31536000" always;\n`;
// Exact entries and a dedicated asset prefix coexist with LP1 v2 legal/partner
// pages and /api routes. Never include this file on the protected staging host.
const entries = [['/', '/index.html'], ['/index.html', '/index.html'], ['/thank-you', '/thank-you/index.html'], ['/thank-you/', '/thank-you/index.html'], ['/analytics-config.json', '/analytics-config.json']];
const locations = entries.map(([uri, file]) => `location = ${uri} {\n  root /site/refi-cro;\n  try_files ${file} =404;\n${pageHeaders}}\n`).join('\n');
fs.writeFileSync(path.join(output, 'nginx-site.inc'), `# Generated. Include only in the public refinance server alongside lp1-site.inc and lp1-api.inc.\n${locations}\nlocation /cro-assets/ {\n  root /site/refi-cro;\n  try_files $uri =404;\n  add_header Cache-Control "public, max-age=604800" always;\n  add_header X-Content-Type-Options "nosniff" always;\n}\n`);
console.log(JSON.stringify({ prerendered: ['/', '/thank-you'], faqCspHashes: hashes.size, output: 'site/refi-cro', analyticsConfigured: Boolean(analytics.host) }));
