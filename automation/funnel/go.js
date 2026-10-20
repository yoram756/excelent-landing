// n8n Code node "Resolve link" in the go redirect workflow. Source of truth: this file.
// c = 10 char personal token + 1 letter destination, or a phone number as fallback.
const CFG = __CONFIG__;
const DEST = CFG.links, BY_STEP = CFG.linkByStep, C = CFG.columns;
const raw = String(($('Link').first().json.query || {}).c || '').trim().toLowerCase();
const items = $('Items').first().json.data.boards[0].items_page.items;
const norm = s => { let d = String(s || '').replace(/\D/g, ''); if (d.startsWith('0')) d = '972' + d.slice(1); return d; };
let token = '', dest = '', lead = null;
const m = raw.match(/^([a-z0-9]{10})([qcgmb])$/);
if (m) { token = m[1]; dest = m[2]; }
for (const it of items) {
  const cv = {}; for (const c of it.column_values) cv[c.id] = c;
  if (token && cv[C.token]?.text === token) { lead = { it, cv }; break; }
  if (!token && raw.replace(/\D/g, '').length >= 9 && norm(cv[C.phone]?.text) === norm(raw)) { lead = { it, cv }; break; }
}
if (lead && !dest) dest = BY_STEP[lead.cv[C.step]?.text] || 'q';
if (!dest) dest = 'q';
let url = DEST[dest];
if (dest === 'q' && lead) url = url.replace('#check', '&t=' + (lead.cv[C.token]?.text || '') + '#check');
const out = { url, found: !!lead, dest };
if (lead) {
  let st = {}; try { st = JSON.parse(lead.cv[C.state]?.text || '{}') || {}; } catch (e) {}
  st.opens = st.opens || {};
  const firstOfType = !st.opens[dest];
  st.opens[dest] = (st.opens[dest] || 0) + 1;
  const openPoints = Object.keys(st.opens).length * 5;
  let heat = Number(lead.cv[C.heat]?.text || 0);
  const before = heat;
  if (firstOfType && openPoints <= 15) heat += 5;
  const cols = { [C.state]: { text: JSON.stringify(st) } };
  if (heat !== before) cols[C.heat] = String(heat);
  out.itemId = lead.it.id; out.colsJson = JSON.stringify(cols);
  out.notify = before < CFG.handoff.heatAtLeast && heat >= CFG.handoff.heatAtLeast && (lead.cv[C.path]?.text || '') !== 'E';
  out.notifyText = 'משפך מחזור: הליד הגיע לציון חום ' + heat + ' ומוכן לשיחה. פתח קישור: ' + dest;
  out.meId = $('Items').first().json.data.me.id;
}
return [{ json: out }];
