// n8n Code node "Resolve" in the personal link workflow (go). Source of truth: this file.
// c = a 32 character token (or legacy 10/20) + destination letter.
// A click is recorded for a lead only when the token belongs to exactly one lead.
// Unknown tokens, template example values and anything else are never attributed to a lead.
const CFG = __CONFIG__;
const DEST = CFG.links, C = CFG.columns;
const EXAMPLES = (CFG.linkTokenExamples || []).map(x => String(x).toLowerCase());
const raw = String(($('Link').first().json.query || {}).c || '').trim().toLowerCase();
const page = $('Items').first().json.data.boards[0].items_page;
if (page.cursor) throw new Error('Monday result truncated: do not attribute clicks from a partial lead list');
const items = page.items;
const m = raw.match(/^([a-z0-9]{10}|[a-z0-9]{20}|[a-z0-9]{32})([a-z])$/);
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
  let st;
  const storedState = lead.cv[C.state]?.text;
  try { st = storedState ? JSON.parse(storedState) : null; } catch (e) { st = null; }
  const obj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const heatValue = Number(lead.cv[C.heat]?.text || 0);
  if (!obj(st) ||
      ('opens' in st && (!obj(st.opens) || Object.entries(st.opens).some(([d,n])=>!Object.hasOwn(DEST,d)||!Number.isSafeInteger(n)||n<1))) ||
      ('clicks' in st && !Array.isArray(st.clicks)) ||
      ('clickHeat' in st && (!Number.isInteger(st.clickHeat)||st.clickHeat<0||st.clickHeat>15||st.clickHeat%5!==0)) ||
      (st.opens && Object.keys(st.opens).length && !Object.hasOwn(st,'clickHeat')) ||
      !Number.isFinite(heatValue) || heatValue<0) {
    // The destination still works, but no heat or engagement state is written over corrupted state.
    return [{ json: { url: out.url, found: false, dest, reason: 'invalid stored lead state', campaign: CFG.id } }];
  }
  const status=lead.cv[C.status]?.text;
  if(st.tokenRevoked===true||['הסר','נעצר','לקוח'].includes(status)||
      ((token.length===32||Object.hasOwn(st,'tokenExpiresAt'))&&
       (!Number.isFinite(st.tokenExpiresAt)||st.tokenExpiresAt<=Date.now()))) {
    return [{json:{url,found:false,dest,reason:'token expired or revoked',campaign:CFG.id}}];
  }
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
