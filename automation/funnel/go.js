// n8n Code node "Resolve" in the personal link workflow (go). Source of truth: this file.
// c = 10 character random token + 1 letter destination. Nothing personal is ever in the link.
// A click is recorded for a lead only when the token belongs to exactly one lead.
// Unknown tokens, template example values and anything else are never attributed to a lead.
const CFG = __CONFIG__;
const DEST = CFG.links, C = CFG.columns;
const EXAMPLES = (CFG.linkTokenExamples || []).map(x => String(x).toLowerCase());
const raw = String(($('Link').first().json.query || {}).c || '').trim().toLowerCase();
const items = $('Items').first().json.data.boards[0].items_page.items;
const m = raw.match(/^([a-z0-9]{10})([a-z])$/);
let token = '', dest = '', lead = null, reason = '';
if (!m) reason = 'bad format';
else if (EXAMPLES.includes(raw) || EXAMPLES.includes(m[1])) reason = 'template example value';
else {
  token = m[1]; dest = m[2];
  const owners = items.filter(it => (it.column_values.find(c => c.id === C.token) || {}).text === token);
  if (owners.length === 1) { const it = owners[0]; const cv = {}; for (const c of it.column_values) cv[c.id] = c; lead = { it, cv }; }
  else reason = owners.length ? 'token not unique' : 'unknown token';
}
// the destination letter is trusted only for a known lead; otherwise the campaign landing page
if (!lead || !DEST[dest]) dest = 'q';
let url = DEST[dest];
const out = { url, found: !!lead, dest, reason, campaign: CFG.id };
if (lead) {
  if (dest === 'q') out.url = url.replace('#', (url.includes('?') ? '&' : '?') + 't=' + token + '#');
  let st = {}; try { st = JSON.parse(lead.cv[C.state]?.text || '{}') || {}; } catch (e) {}
  st.opens = st.opens || {};
  const now = Date.now();
  const firstOfType = !st.opens[dest];
  st.opens[dest] = (st.opens[dest] || 0) + 1;
  st.clicks = (st.clicks || []).concat([{ d: dest, at: new Date(now).toISOString(), campaign: CFG.id }]).slice(-20);
  // heat: +5 only for the first click on each destination type, at most 15 in total from clicks
  let heat = Number(lead.cv[C.heat]?.text || 0);
  const before = heat;
  st.clickHeat = st.clickHeat || 0;
  if (firstOfType && st.clickHeat < 15) { heat += 5; st.clickHeat += 5; }
  const cols = { [C.state]: { text: JSON.stringify(st) } };
  if (heat !== before) cols[C.heat] = String(heat);
  out.itemId = lead.it.id; out.colsJson = JSON.stringify(cols);
  out.notify = before < CFG.handoff.heatAtLeast && heat >= CFG.handoff.heatAtLeast && (lead.cv[C.path]?.text || '') !== 'E';
  out.notifyText = 'משפך ' + CFG.name + ': הליד הגיע לציון חום ' + heat + ' ומוכן לשיחה. לחץ על: ' + dest;
  out.meId = $('Items').first().json.data.me.id;
}
return [{ json: out }];
