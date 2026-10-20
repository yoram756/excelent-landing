// n8n Code node "Reconcile" (mode: run once for each item). Source of truth: this file.
// A send was reserved but its result is unknown. Look for it in Gambot before doing anything.
const p = $('Route').item.json;
const pend = JSON.parse(p.pendingJson);
const st = JSON.parse(p.stJson); delete st.pending;
const ok = $json && $json.data && Array.isArray($json.data.messages);
const msgs = ok ? $json.data.messages : [];
const found = msgs.some(m => m.direction === 'outgoing' && String(m.templateId) === String(pend.tpl) && Date.parse(m.time) >= pend.at - 120000);
let cols = {}; let outcome = 'wait';
const now = Date.now();
if (found) { cols = { ...pend.adv, fn_opens: { text: JSON.stringify({ ...st, lastKey: pend.key }) } }; outcome = 'confirmed'; }
else if (ok && now - pend.at > 10 * 60000) { st.unconfirmed = (st.unconfirmed || 0) + 1; cols = { fn_opens: { text: JSON.stringify(st) } }; outcome = 'not sent, released for retry'; }
if (st.unconfirmed >= 3) { cols.fn_status = { label: 'נעצר' }; outcome = 'stopped after 3 unconfirmed sends'; }
return { json: { itemId: p.itemId, colsJson: JSON.stringify(cols), outcome } };
