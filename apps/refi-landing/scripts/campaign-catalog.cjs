const fs = require('node:fs'), path = require('node:path');

function loadCatalog(base, campaign, directory) {
  const known = Object.keys(campaign.intake.attribution.campaigns).sort();
  const variants = fs.readdirSync(directory).filter(file => file.endsWith('.json')).map(file => JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8')));
  if (JSON.stringify(variants.map(page => page.attributionCampaign).sort()) !== JSON.stringify(known)) throw Error('Landing variants must cover the configured campaign codes exactly once');
  const routes = new Set();
  for (const page of variants) {
    if (!/^\/campaigns\/[a-z][a-z-]+$/.test(page.route) || routes.has(page.route) || page.landingId !== page.attributionCampaign) throw Error('Invalid or duplicate landing route');
    routes.add(page.route);
    for (const value of [page.meta?.title, page.meta?.description, page.hero?.eyebrow, page.hero?.title, page.hero?.accent, page.hero?.description, page.hero?.cta, page.benefitsTitle, page.form?.title, page.form?.description, page.form?.label, page.form?.button, page.form?.purpose, page.mobileCta, page.thankYou?.description, page.thankYou?.emptyDescription]) if (typeof value !== 'string' || !value.trim()) throw Error('Missing campaign-specific copy');
    if (page.benefits?.length !== 3 || page.faq?.length < 3 || page.benefits.some(item => !item.title || !item.text) || page.faq.some(item => !item.question || !item.answer)) throw Error('Campaign benefits and FAQ required');
    for (const field of ['product', 'campaign', 'endpoint', 'identity', 'source']) if (Object.hasOwn(page, field)) throw Error('Landing copy cannot override shared intake or identity');
  }
  return variants.map(page => ({ ...base, ...page, form: { ...base.form, ...page.form }, thankYou: { ...base.thankYou, ...page.thankYou }, testimonials: { ...base.testimonials, note: page.testimonialNote }, thankYouPath: page.route + '/thank-you' }));
}
module.exports = { loadCatalog };
