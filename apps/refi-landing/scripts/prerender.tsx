import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import App from '../src/App';
import { pages } from '../src/content';

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
const routes = pages.flatMap(page => [page.route, page.thankYouPath]);
const attribute = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
for (const page of pages) for (const route of [page.route, page.thankYouPath]) {
  const app = renderToString(<StrictMode><App initialPath={route} /></StrictMode>);
  let html = template.replace('<!--app-html-->', app);
  // Campaign heroes fill the mobile viewport with text. Avoid competing with
  // the title's fonts by preloading a portrait that is below that viewport.
  if (page.attributionCampaign) html = html.replace(/<link\b[^>]*as="image"[^>]*media="\(max-width:[^"]*"[^>]*>/g, '');
  html = html.replace(/^[\t ]+$/gm, '');
  const title = route === page.thankYouPath ? 'נשארים בקשר | אקסלנט' : page.meta.title;
  html = html.replace(/<title>[^<]*<\/title>/, '<title>' + attribute(title) + '</title>').replace(/<meta name="description" content="[^"]*"\s*\/>/, '<meta name="description" content="' + attribute(page.meta.description) + '" />');
  html = html.replace('</head>', '<link rel="canonical" href="https://refi.excelentfinance.com' + route + '" /><meta property="og:title" content="' + attribute(title) + '" /><meta property="og:description" content="' + attribute(page.meta.description) + '" /></head>');
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) if (match[1]) hashes.add(`'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`);
  for (const match of html.matchAll(/\sstyle="([^"<>]*)"/g)) if (match[1]) styleHashes.add(`'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`);
  const dest = path.join(output, route === '/' ? 'index.html' : route.slice(1) + '/index.html');
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
const entries = [['/', '/index.html'], ['/index.html', '/index.html'], ['/analytics-config.json', '/analytics-config.json'], ...routes.filter(route => route !== '/').flatMap(route => [[route, route + '/index.html'], [route + '/', route + '/index.html']])];
const legacyRedirects = pages.filter(page => page.attributionCampaign).map(page => '  if ($arg_utm_campaign = ' + page.attributionCampaign + ') { return 302 ' + page.route + '$is_args$args; }').join('\n');
const locations = entries.map(([uri, file]) => `location = ${uri} {\n  root /site/refi-cro;\n${uri === '/' || uri === '/index.html' ? legacyRedirects + '\n' : ''}  try_files ${file} =404;\n${pageHeaders}}\n`).join('\n');
fs.writeFileSync(path.join(output, 'nginx-site.inc'), `# Generated. Include only in the public refinance server alongside lp1-site.inc and lp1-api.inc.\n${locations}\nlocation /cro-assets/ {\n  root /site/refi-cro;\n  try_files $uri =404;\n  add_header Cache-Control "public, max-age=604800" always;\n  add_header X-Content-Type-Options "nosniff" always;\n}\n`);
console.log(JSON.stringify({ prerendered: routes, faqCspHashes: hashes.size, output: 'site/refi-cro', analyticsConfigured: Boolean(analytics.host) }));
