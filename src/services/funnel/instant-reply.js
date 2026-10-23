// n8n Code node "Instant reply" (mode: run once for each item). Source of truth: this file.
// First automatic WhatsApp template (HSM) within CFG.instantReply.withinSeconds of a saved intake lead.
// Input from the intake workflow (Execute Workflow): {itemId, name, firstName, phone, receivedAt, grants, marketing}.
// Off until the owner approves a Gambot template id and sets instantReply.enabled; the human SLA is unchanged.
const CFG = __CONFIG__;
const BIZ = __BUSINESS__;
const MODE = '__MODE__';
const IR = CFG.instantReply;
const l = $json || {};
const now = Date.now();
const skip = reason => ({ json: { itemId: l.itemId || null, hasSend: false, send: null, skipped: reason } });
if (!IR || IR.enabled !== true) return skip('disabled');
if (!/^\d{6,}$/.test(String(IR.template.id || ''))) return skip('awaiting_approved_template');
if (!/^9725\d{8}$/.test(String(l.phone || ''))) return skip('bad_phone');
if (!l.grants || l.grants.whatsapp !== true) return skip('no_whatsapp_consent');
// Same rule as plan.js: only a verified UTILITY template goes out without marketing consent.
if (IR.template.category !== 'UTILITY' && l.marketing !== true) return skip('no_marketing_consent');
const age = (now - Date.parse(l.receivedAt)) / 1000;
// A late "instant" message is worse than none: the regular engine takes over.
if (!Number.isFinite(age) || age < 0 || age > IR.withinSeconds) return skip('window_missed');
if (MODE === 'test' && !/^TEST/.test(l.name || '')) return skip('test_mode_real_lead');
const sd = $getWorkflowStaticData('global'); sd.sent = sd.sent || {};
for (const [k, t] of Object.entries(sd.sent)) if (now - t > 86400000) delete sd.sent[k];
if (sd.sent[l.itemId]) return skip('already_sent');
sd.sent[l.itemId] = now;
const vars = (IR.template.vars || ['first']).map(() => l.firstName || 'שלום');
return { json: { itemId: l.itemId, hasSend: true, live: MODE !== 'test', send: { to: l.phone, from: BIZ.phones.gambot_sender.e164, templateId: String(IR.template.id), variables: vars } } };
