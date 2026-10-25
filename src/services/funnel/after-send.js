// n8n Code node "After send" (mode: run once for each item). Source of truth: this file.
// success true  -> apply the planned update (advance, clear the pending send)
// success false -> Gambot refused: keep the position, retry in 30 minutes, stop after 3 refusals
// no answer     -> result unknown: keep the pending send, the reconcile step checks Gambot before any resend
const p = $('Has send?').item.json;
const CFG = __CONFIG__, BIZ = __BUSINESS__, FB = __FALLBACK__;
const r = $json || {};
const C = p.colmap;
const ok = r.success === true;
const refused = r.success === false;
let cols = JSON.parse(p.colsJson);
let fallback = null, fallbackText = '';
if (refused) {
  let st = {}; try { st = JSON.parse(p.stJson || '{}'); } catch (e) {}
  delete st.pending;
  st.fails = (st.fails || 0) + 1;
  st.lastError = String(r.message || r.error || 'unknown').slice(0, 160);
  cols = { [C.path]: p.prevPath, [C.step]: p.prevStep };
  const t = new Date(Date.now() + 30 * 60000).toISOString();
  cols[C.next] = { date: t.slice(0, 10), time: t.slice(11, 19) };
  // A closed 24 hour window will not reopen on retry: fall back at once. Any other refusal gets 3 tries.
  const windowClosed = FB.plan.isWindowClosed(r);
  if (windowClosed || st.fails >= 3) {
    cols[C.status] = { label: 'נעצר' }; cols[C.next] = {};
    // WhatsApp finally failed: the planned decision (channels.js) becomes a provider request (fallback.js).
    // "Send SMS" / "Send email" send it only in live mode with a configured provider; Yoram is told either way.
    try { fallback = JSON.parse(p.fallbackJson || 'null'); } catch (e) {}
    if (fallback && fallback.action !== 'STOP') {
      fallback = FB.plan.planFallback({ decision: fallback, lead: { phone: p.phone, email: p.email, first: p.first }, cfg: CFG, biz: BIZ, drafts: FB.drafts }, { sms: FB.sms, email: FB.email });
      const why = windowClosed ? 'חלון 24 השעות סגור' : 'WhatsApp נכשל 3 פעמים';
      fallbackText = 'משפך: ' + why + ', נעצר. ערוץ חלופי: ' + (fallback.action === 'SEND' ? fallback.channel + ' נשלח אוטומטית' : (fallback.channel || (fallback.channels || []).join(', ')) + ' לא נשלח (' + fallback.reason + '), טיפול ידני') + '.';
    }
  }
  cols[C.state] = { text: JSON.stringify(st) };
} else if (!ok) {
  cols = {};
}
return { json: { ...p, colsJson: JSON.stringify(cols), sendOk: ok, sendUnknown: !ok && !refused, simulated: !!r.simulated, fallback, hasFallback: !!fallbackText, fallbackSend: fallback && fallback.action === 'SEND' ? fallback : null, notifyText: fallbackText || p.notifyText } };
