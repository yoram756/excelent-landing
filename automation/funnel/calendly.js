// n8n Code node "Match bookings" in the Calendly workflow. Source of truth: this file.
// Input: Calendly notification emails (Gmail) or a test body. Output: Monday updates for matched leads.
const norm = s => { let d = String(s || '').replace(/\D/g, ''); if (d.startsWith('0')) d = '972' + d.slice(1); return d.length >= 11 ? d : ''; };
const MONTHS = {January:1,February:2,March:3,April:4,May:5,June:6,July:7,August:8,September:9,October:10,November:11,December:12};
function israelToUtc(y, mo, d, hh, mm) {
  const guess = Date.UTC(y, mo - 1, d, hh, mm);
  const p = {}; new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(guess)).forEach(x => p[x.type] = x.value);
  const off = Date.UTC(+p.year, +p.month - 1, +p.day, +(p.hour === '24' ? 0 : p.hour), +p.minute) - guess;
  return guess - off;
}
function parse(subject, text) {
  const t = String(text || '').replace(/\s+/g, ' ');
  const kind = /^(New Event|TEST New Event)/i.test(subject) ? 'new' : /^(Canceled|Cancelled)/i.test(subject) ? 'cancel' : '';
  if (!kind) return null;
  const name = (t.match(/Invitee: (.+?) Invitee Email:/) || [])[1] || '';
  const email = ((t.match(/Invitee Email: ([^\s\[]+)/) || [])[1] || '').toLowerCase();
  const dm = t.match(/Event Date\/Time: (\d{1,2}):(\d{2}) [^,]*, (\d{1,2}) ([A-Za-z]+) (\d{4})/);
  const loc = (t.match(/Location: (\+?[\d\s\-]{9,20})/) || [])[1] || '';
  const phoneQ = (t.match(/(\+?972[\d\s\-]{8,14}|05\d[\d\s\-]{7,10})/) || [])[1] || '';
  if (!dm) return null;
  const at = israelToUtc(+dm[5], MONTHS[dm[4]], +dm[3], +dm[1], +dm[2]);
  return { kind, name, email, phone: norm(loc) || norm(phoneQ), at };
}
const sd = $getWorkflowStaticData('global'); sd.seen = sd.seen || {};
const mails = [];
try { const b = $('Run test').first().json.body; if (b && b.subject) mails.push({ id: 'test-' + (b.id || Date.now()), subject: b.subject, text: b.text }); } catch (e) {}
try { for (const m of $('Calendly mails').all()) if (m.json && m.json.id) mails.push({ id: m.json.id, subject: m.json.subject || m.json.headers?.subject || '', text: m.json.text || m.json.snippet || '' }); } catch (e) {}
const items = $('Items').first().json.data.boards[0].items_page.items;
const out = [];
for (const mail of mails) {
  if (sd.seen[mail.id]) continue;
  const ev = parse(mail.subject, mail.text);
  sd.seen[mail.id] = Date.now();
  if (!ev) continue;
  let lead = null;
  for (const it of items) {
    const cv = {}; for (const c of it.column_values) cv[c.id] = c;
    if ((ev.phone && norm(cv.refi_phone?.text) === ev.phone) || (ev.email && (cv.fn_email?.text || '').toLowerCase() === ev.email)) { lead = it; break; }
  }
  const d = new Date(ev.at).toISOString();
  const cols = ev.kind === 'new'
    ? { refi_stage: { label: 'פגישה נקבעה' }, refi_meeting: { date: d.slice(0, 10), time: d.slice(11, 19) } }
    : { refi_stage: { label: 'פגישה בוטלה' } };
  if (ev.email) cols.fn_email = { email: ev.email, text: ev.email };
  out.push({ json: { kind: ev.kind, matched: !!lead, itemId: lead ? lead.id : null, name: ev.name, phone: ev.phone, colsJson: JSON.stringify(cols), mailId: mail.id } });
}
// keep the dedupe store small
const cutoff = Date.now() - 30 * 86400000; for (const k of Object.keys(sd.seen)) if (sd.seen[k] < cutoff) delete sd.seen[k];
return out;
