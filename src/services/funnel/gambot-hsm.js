// Gambot WhatsApp template (HSM) payload for POST https://api.gambot.co.il/api/v1/messages/send-template.
// Pure: no transport and no clock of its own. build-workflows.js injects it into instant-reply.js.
const SEND_URL = 'https://api.gambot.co.il/api/v1/messages/send-template';

// Body of one template send. The sender is always the Gambot number from config/business.json.
const templatePayload = ({ to, from, templateId, variables = [] }) => {
  if (!/^9725\d{8}$/.test(String(to || ''))) throw Error('bad_recipient');
  if (!/^972\d{8,9}$/.test(String(from || ''))) throw Error('bad_sender');
  if (!/^\d{6,}$/.test(String(templateId || ''))) throw Error('bad_template_id');
  return { to, from, templateId: String(templateId), variables: variables.map(String) };
};

// First template within cfg.instantReply.withinSeconds of a saved intake lead.
// lead: {itemId, name, firstName, phone, receivedAt, grants, marketing}. Returns {ok:true, payload} or {ok:false, reason}.
const instantPayload = ({ lead, cfg, biz, now, mode }) => {
  const IR = cfg.instantReply;
  const l = lead || {};
  if (!IR || IR.enabled !== true) return { ok: false, reason: 'disabled' };
  if (!/^\d{6,}$/.test(String(IR.template.id || ''))) return { ok: false, reason: 'awaiting_approved_template' };
  if (!/^9725\d{8}$/.test(String(l.phone || ''))) return { ok: false, reason: 'bad_phone' };
  if (!l.grants || l.grants.whatsapp !== true) return { ok: false, reason: 'no_whatsapp_consent' };
  // Same rule as plan.js: only a verified UTILITY template goes out without marketing consent.
  if (IR.template.category !== 'UTILITY' && l.marketing !== true) return { ok: false, reason: 'no_marketing_consent' };
  const age = (now - Date.parse(l.receivedAt)) / 1000;
  // A late "instant" message is worse than none: the regular engine takes over.
  if (!Number.isFinite(age) || age < 0 || age > IR.withinSeconds) return { ok: false, reason: 'window_missed' };
  if (mode === 'test' && !/^TEST/.test(l.name || '')) return { ok: false, reason: 'test_mode_real_lead' };
  const variables = (IR.template.vars || ['first']).map(() => l.firstName || 'שלום');
  return { ok: true, payload: templatePayload({ to: l.phone, from: biz.phones.gambot_sender.e164, templateId: IR.template.id, variables }) };
};

// This file as an expression the build injects into instant-reply.js; n8n Code nodes cannot require repo files.
const inlineSource = () => '(()=>{const module={exports:{}};\n' + require('fs').readFileSync(__filename, 'utf8').replace(/\r\n/g, '\n') + '\nreturn module.exports;})()';

module.exports = { SEND_URL, templatePayload, instantPayload, inlineSource };
