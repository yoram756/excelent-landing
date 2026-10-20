// n8n Code node "After send" (mode: run once for each item). Source of truth: this file.
// Keeps the lead's position when a send fails, retries after 30 minutes, stops after 3 failures.
const p = $('Has send?').item.json;
const r = $json || {};
const ok = r.success === true;
const cols = JSON.parse(p.colsJson);
if (!ok) {
  let st = {}; try { st = JSON.parse(p.stJson || '{}'); } catch (e) {}
  st.fails = (st.fails || 0) + 1;
  st.lastError = String(r.message || r.error || 'unknown').slice(0, 160);
  delete cols.fn_last;
  cols.fn_path = p.prevPath; cols.fn_step = p.prevStep;
  const t = new Date(Date.now() + 30 * 60000).toISOString();
  cols.fn_next = { date: t.slice(0, 10), time: t.slice(11, 19) };
  if (st.fails >= 3) { cols.fn_status = { label: 'נעצר' }; cols.fn_next = {}; }
  cols.fn_opens = { text: JSON.stringify(st) };
}
return { json: { ...p, colsJson: JSON.stringify(cols), sendOk: ok, simulated: !!r.simulated } };
