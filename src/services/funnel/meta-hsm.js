// WhatsApp template (HSM) body for the Meta Cloud API: POST https://graph.facebook.com/<version>/<phone_number_id>/messages.
// Pure: no transport and no clock of its own. build-workflows.js injects it into plan.js and instant-reply.js.
const GRAPH_VERSION = 'v23.0';
// The sender is the phone number id in the URL (env META_WA_PHONE_NUMBER_ID at build time); the body has no from field.
// A missing id keeps a visible placeholder: build-workflows.js refuses pilot and live builds without it.
const sendUrl = phoneNumberId => 'https://graph.facebook.com/' + GRAPH_VERSION + '/' + (/^\d{6,}$/.test(String(phoneNumberId || '')) ? phoneNumberId : '{phone_number_id}') + '/messages';

// Body of one template send. Templates are identified by name and language; variables fill the body
// in order, buttonVariables fill URL buttons in order.
const templatePayload = ({ to, name, language = 'he', variables = [], buttonVariables = [] }) => {
  if (!/^9725\d{8}$/.test(String(to || ''))) throw Error('bad_recipient');
  if (!/^(?=[a-z0-9_]*[a-z])[a-z0-9_]{1,512}$/.test(String(name || ''))) throw Error('bad_template_name');
  if (!/^[a-z]{2,3}(_[A-Z]{2})?$/.test(String(language || ''))) throw Error('bad_language');
  const text = v => ({ type: 'text', text: String(v) });
  const components = [];
  if (variables.length) components.push({ type: 'body', parameters: variables.map(text) });
  buttonVariables.forEach((v, i) => components.push({ type: 'button', sub_type: 'url', index: String(i), parameters: [text(v)] }));
  return { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'template', template: { name, language: { code: language }, ...(components.length ? { components } : {}) } };
};

// First template within cfg.instantReply.withinSeconds of a saved intake lead.
// lead: {itemId, name, firstName, phone, receivedAt, grants, marketing}. Returns {ok:true, payload} or {ok:false, reason}.
const instantPayload = ({ lead, cfg, now, mode }) => {
  const l = lead || {};
  const slug=l.product_slug;
  if(slug && l.funnel_type && slug!==l.funnel_type)return {ok:false,reason:'conflicting_product'};
  // A different product must never borrow the campaign default template.
  const IR = slug && slug!==(cfg.crmFields?.nicheSegment?.value||cfg.id) ? cfg.productInstantReplies?.[slug] : cfg.instantReply;
  if(slug && !IR)return {ok:false,reason:'product_template_unconfigured'};
  if (!IR || IR.enabled !== true) return { ok: false, reason: 'disabled' };
  // The numeric Meta template id is the approval mark; the send itself uses the template name.
  if (!/^\d{6,}$/.test(String(IR.template.id || ''))) return { ok: false, reason: 'awaiting_approved_template' };
  if (!/^(?=[a-z0-9_]*[a-z])[a-z0-9_]{1,512}$/.test(String(IR.template.name || ''))) return { ok: false, reason: 'template_name_missing' };
  if (!/^9725\d{8}$/.test(String(l.phone || ''))) return { ok: false, reason: 'bad_phone' };
  if (!l.grants || l.grants.whatsapp !== true) return { ok: false, reason: 'no_whatsapp_consent' };
  // Same rule as plan.js: only a verified UTILITY template goes out without marketing consent.
  if (IR.template.category !== 'UTILITY' && l.marketing !== true) return { ok: false, reason: 'no_marketing_consent' };
  const age = (now - Date.parse(l.receivedAt)) / 1000;
  // A late "instant" message is worse than none: the regular engine takes over.
  if (!Number.isFinite(age) || age < 0 || age > IR.withinSeconds) return { ok: false, reason: 'window_missed' };
  if (mode === 'test' && !/^TEST/.test(l.name || '')) return { ok: false, reason: 'test_mode_real_lead' };
  const variables = (IR.template.vars || ['first']).map(() => l.firstName || 'שלום');
  return { ok: true, payload: templatePayload({ to: l.phone, name: IR.template.name, language: IR.template.language || 'he', variables }) };
};

// Standard Meta webhook body (object whatsapp_business_account, entry[].changes[].value.messages) -> the
// conversation rows plan.js reads ({phone, lastMessageDirection, lastMessageTime, lastMessage}), latest per phone.
// Only incoming messages count: Meta statuses (sent, delivered, read) are our own sends and carry no template,
// so they would look like a manual conversation in plan.js and cannot confirm a send in reconcile.js.
const conversationsFromWebhook = (body, phoneNumberId) => {
  const rows = {};
  if (!body || body.object !== 'whatsapp_business_account') return [];
  for (const e of body.entry || []) for (const c of e.changes || []) {
    const v = c && c.field === 'messages' ? c.value || {} : {};
    if (phoneNumberId && String(v.metadata?.phone_number_id || '') !== String(phoneNumberId)) continue;
    for (const m of v.messages || []) {
      const phone = String(m.from || '').replace(/\D/g, '');
      const time = Number(m.timestamp) * 1000;
      if (!phone || !Number.isFinite(time) || time <= 0) continue;
      const text = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? '';
      if (rows[phone] && Date.parse(rows[phone].lastMessageTime) >= time) continue;
      rows[phone] = { phone, lastMessageDirection: 'incoming', lastMessageTime: new Date(time).toISOString(), lastMessage: String(text) };
    }
  }
  return Object.values(rows);
};

// This file as an expression the build injects into Code nodes; n8n Code nodes cannot require repo files.
const inlineSource = () => '(()=>{const module={exports:{}};\n' + require('fs').readFileSync(__filename, 'utf8').replace(/\r\n/g, '\n') + '\nreturn module.exports;})()';

module.exports = { GRAPH_VERSION, sendUrl, templatePayload, instantPayload, conversationsFromWebhook, inlineSource };
