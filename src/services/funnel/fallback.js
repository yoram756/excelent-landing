// Controlled WhatsApp -> SMS / Email fallback. Pure: builds the provider request, never sends.
// The channel decision itself (opt-out, consent, configured provider) stays in channels.js; this file only
// adds the triggers and the content gates on top of it:
// - a closed 24 hour window (Meta 131047 / re-engagement) falls back at once, any other refusal after 3 tries (after-send.js)
// - content comes only from an approved draft of the campaign product (src/services/email/drafts.json)
// - SMS source and email sender come only from the campaign file (channels.sms.source, channels.email.from)

const isWindowClosed = r => {
  if (!r || r.success !== false) return false;
  const code = String(r.code ?? r.errorCode ?? r.error?.code ?? '');
  const msg = String(r.message || r.error?.message || r.error || '');
  return code === '131047' || /\b131047\b|re-?engagement message/i.test(msg);
};

// decision: channels.nextChannel output. lead: { phone, email, first }. P: { sms, email } provider modules.
const planFallback = ({ decision, lead, cfg, biz, drafts }, P) => {
  if (!decision || decision.action !== 'SEND') return decision || { action: 'STOP', reason: 'no_decision' };
  const ch = decision.channel;
  const draft = drafts && cfg.product ? drafts[cfg.product] : null;
  if (!draft) return { action: 'BLOCKED', reason: 'no_content', channel: ch };
  if (draft.approved !== true) return { action: 'BLOCKED', reason: 'draft_not_approved', channel: ch };
  const id = cfg.identity || {};
  // plan.js uses 'שלום' when the item has no name; the fallback text then greets without a name.
  const vars = { first: lead.first && lead.first !== 'שלום' ? lead.first : '', name: id.nameInMessages || '', contactPhone: biz.phones[id.contactPhone]?.number || '' };
  const conf = cfg.channels[ch] || {};
  try {
    if (ch === 'sms') return { action: 'SEND', channel: ch, request: P.sms.buildRequest({ source: conf.source, destinations: [lead.phone], message: P.email.fill(draft.sms, vars).replace(/ ,/g, ',') }) };
    if (ch === 'email') return { action: 'SEND', channel: ch, request: P.email.buildRequest({ from: conf.from, fromName: vars.name, to: lead.email, subject: P.email.fill(draft.email.subject, vars), text: P.email.fill(draft.email.text, vars).replace(/ ,/g, ',') }) };
  } catch (e) { return { action: 'BLOCKED', reason: 'invalid_request', channel: ch, error: e.message }; }
  return { action: 'BLOCKED', reason: 'unknown_channel', channel: ch };
};

const inlineSource = () => '(()=>{const module={exports:{}};\n' + require('fs').readFileSync(__filename, 'utf8').replace(/\r\n/g, '\n') + '\nreturn module.exports;})()';

// The value injected for the fallback placeholder: this file, both providers and the drafts as one expression. Used by the build and every test harness.
const bundleSource = () => {
  const fs = require('fs'), path = require('path');
  return '({plan:' + inlineSource() + ',sms:' + require('../sms/textme').inlineSource() + ',email:' + require('../email/sendgrid').inlineSource() +
    ',drafts:' + fs.readFileSync(path.join(__dirname, '../email/drafts.json'), 'utf8').replace(/\r\n/g, '\n') + '})';
};

module.exports = { isWindowClosed, planFallback, inlineSource, bundleSource };
