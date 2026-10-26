// n8n Code node "Instant reply" (mode: run once for each item). Source of truth: this file.
// First automatic WhatsApp template (HSM) within CFG.instantReply.withinSeconds of a saved intake lead.
// Input from the intake workflow (Execute Workflow): {itemId, name, firstName, phone, receivedAt, grants, marketing}.
// Off until the owner approves a Meta template (id and name) and sets instantReply.enabled; the human SLA is unchanged.
// The send decision and the Meta Cloud API body come from meta-hsm.js, injected by build-workflows.js.
const CFG = __CONFIG__;
const BIZ = __BUSINESS__;
const HSM = __META_HSM__;
const MODE = '__MODE__';
const l = $json || {};
const now = Date.now();
const skip = reason => ({ json: { itemId: l.itemId || null, hasSend: false, send: null, skipped: reason } });
const r = HSM.instantPayload({ lead: l, cfg: CFG, now, mode: MODE });
if (!r.ok) return skip(r.reason);
const sd = $getWorkflowStaticData('global'); sd.sent = sd.sent || {};
for (const [k, t] of Object.entries(sd.sent)) if (now - t > 86400000) delete sd.sent[k];
if (sd.sent[l.itemId]) return skip('already_sent');
sd.sent[l.itemId] = now;
return { json: { itemId: l.itemId, hasSend: true, live: MODE !== 'test', send: r.payload } };
