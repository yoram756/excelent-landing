const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../../..');
const app = path.resolve(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const page = read('config/landing/refi.json');
const campaign = read('src/config/campaigns/' + page.campaign + '.json');
const business = read('config/business.json');
const service = read('config/lead-service.json');
if (campaign.identity.approved !== true) throw Error('Approved identity required');
const identity = campaign.identity;
const profile = business.profiles[identity.profile];
if (!profile.allowedContactPhones.includes(identity.contactPhone)) throw Error('Unapproved client contact');
const phone = business.phones[identity.contactPhone];
if (service.responseMinutes.withoutQuestionnaire !== 60) throw Error('Refresh the response-time copy from the approved policy');
for (const video of page.testimonials.videos) {
  if (video.approved !== true || !video.src || !video.poster || !video.captions || !video.source) throw Error('Video requires approval, source, poster and captions');
}
const generated = path.join(app, 'src/generated');
fs.mkdirSync(generated, { recursive: true });
// Deliberately select public fields. Do not import business.json into browser code.
fs.writeFileSync(path.join(generated, 'content.json'), JSON.stringify({ ...page, identity: { brand: profile.brand, name: identity.nameInMessages, phone: phone.number, e164: phone.e164 } }, null, 2) + '\n');
const assets = path.join(app, 'public/cro-assets');
fs.mkdirSync(assets, { recursive: true });
for (const [source, dest] of [
  ['site/lp1v2/assets/official/logo_light_noslogan.png', 'logo.png'],
  ['site/lp1v2/assets/yoram/portrait.webp', 'portrait.webp'],
  ['site/lp1v2/assets/yoram/portrait-480.webp', 'portrait-480.webp'],
  ['site/lp1v2/assets/clients/c1.webp', 'clients.webp'],
  ['site/lp1v2/assets/favicon.svg', 'favicon.svg'],
]) fs.copyFileSync(path.join(root, source), path.join(assets, dest));
const repoRequire = createRequire(path.join(root, 'package.json'));
const fontRoot = path.dirname(repoRequire.resolve('@fontsource/assistant/package.json'));
for (const subset of ['hebrew', 'latin']) for (const weight of [400, 600, 800]) {
  fs.copyFileSync(path.join(fontRoot, `files/assistant-${subset}-${weight}-normal.woff2`), path.join(assets, `assistant-${subset}-${weight}.woff2`));
}
// Project settings are public, but only the public project key is accepted.
let key = process.env.VITE_POSTHOG_KEY || '', host = process.env.VITE_POSTHOG_HOST || '';
const localEnv = path.join(app, '.env.local');
if (fs.existsSync(localEnv)) for (const line of fs.readFileSync(localEnv, 'utf8').split(/\r?\n/)) {
  const match = /^(VITE_POSTHOG_KEY|VITE_POSTHOG_HOST)\s*=\s*["']?([^"'\s#]*)/.exec(line);
  if (match && match[1] === 'VITE_POSTHOG_KEY' && !key) key = match[2];
  if (match && match[1] === 'VITE_POSTHOG_HOST' && !host) host = match[2];
}
if (key && !/^phc_[A-Za-z0-9_-]{8,200}$/.test(key)) throw Error('Only a public PostHog project key is allowed');
if (host && (new URL(host).protocol !== 'https:' || new URL(host).username || new URL(host).password || new URL(host).search || new URL(host).pathname !== '/')) throw Error('PostHog host must be an HTTPS origin');
if (Boolean(key) !== Boolean(host)) throw Error('Configure both PostHog project key and host');
fs.writeFileSync(path.join(app, 'public/analytics-config.json'), JSON.stringify({ key, host }));
console.log(JSON.stringify({ identity: 'approved', assets: 'local', analyticsConfigured: Boolean(key), approvedVideos: page.testimonials.videos.length }));
