// n8n Code node "Match bookings" in the Calendly workflow. Source of truth: this file.
// Input: Calendly notification emails (Gmail) or a test body. Output: Monday updates for matched leads.
const CFG = __CONFIG__; const C = CFG.columns;
const norm = s => { let d = String(s || '').replace(/\D/g, ''); if (d.startsWith('00')) d = d.slice(2); else if (d.startsWith('0')) d = '972' + d.slice(1); if (d.startsWith('9720')) d = '972' + d.slice(4); return d.length >= 11 ? d : ''; };
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
  const dm = t.match(/Event Date\/Time: (\d{1,2}):(\d{2})\s*(am|pm)?\s*-?[^,]*, (\d{1,2}) ([A-Za-z]+) (\d{4}) \(Israel Time\)/i);
  const loc = (t.match(/Location: (\+?[\d\s\-]{9,20})/) || [])[1] || '';
  const phoneQ = (t.match(/(\+?972[\d\s\-]{8,14}|05\d[\d\s\-]{7,10})/) || [])[1] || '';
  if (!dm) return null;
  let hh=+dm[1];const mm=+dm[2],day=+dm[4],mo=MONTHS[dm[5]],year=+dm[6];
  if(!mo||mm>59||(dm[3]?(hh<1||hh>12):hh>23))return null;
  if(dm[3])hh=hh%12+(dm[3].toLowerCase()==='pm'?12:0);
  const check=new Date(Date.UTC(year,mo-1,day));
  if(check.getUTCFullYear()!==year||check.getUTCMonth()!==mo-1||check.getUTCDate()!==day)return null;
  const at = israelToUtc(year,mo,day,hh,mm);
  return { kind, name, email, phone: norm(loc) || norm(phoneQ), at };
}
const sd = $getWorkflowStaticData('global'); sd.seen = sd.seen || {};
const mails = [];
try { const b = $('Run test').first().json.body; if (b && b.subject) mails.push({ id: 'test-' + (b.id || Date.now()), subject: b.subject, text: b.text }); } catch (e) {}
try { for (const m of $('Calendly mails').all()) if (m.json && m.json.id) mails.push({ id: m.json.id, subject: m.json.subject || m.json.headers?.subject || '', text: m.json.text || m.json.snippet || '' }); } catch (e) {}
const items = $('Items').first().json.data.boards[0].items_page.items;
const out = [];
const inBatch=new Set();
for (const mail of mails) {
  if (sd.seen[mail.id]||inBatch.has(mail.id)) continue;
  inBatch.add(mail.id);
  const ev = parse(mail.subject, mail.text);
  if (!ev) continue;
  const matches=[];
  for (const it of items) {
    const cv = {}; for (const c of it.column_values) cv[c.id] = c;
    if ((ev.phone && norm(cv[C.phone]?.text) === ev.phone) || (ev.email && (cv[C.email]?.text || '').toLowerCase() === ev.email)) matches.push(it);
  }
  // Conflicting identities and duplicate owners require manual resolution.
  if(matches.length>1||(!ev.phone&&!ev.email))continue;
  const lead=matches[0]||null;
  if (!lead && ev.kind === 'cancel') continue; // a cancel for someone we do not know creates nothing
  const cv=Object.fromEntries((lead?.column_values||[]).map(c=>[c.id,c]));
  if(cv[C.stage]?.text===CFG.stages.paid)continue;
  if(ev.kind==='cancel'&&cv[C.meeting]?.value){
    let mt;try{mt=JSON.parse(cv[C.meeting].value);}catch(e){continue;}
    if(mt?.date&&Date.parse(mt.date+'T'+(mt.time||'00:00:00')+'Z')!==ev.at)continue;
  }
  const d = new Date(ev.at).toISOString();
  const cols = ev.kind === 'new'
    ? { [C.stage]: { label: CFG.stages.booked }, [C.meeting]: { date: d.slice(0, 10), time: d.slice(11, 19) } }
    : { [C.stage]: { label: CFG.stages.noShow[0] }, [C.meeting]: {} };
  if (ev.email) cols[C.email] = { email: ev.email, text: ev.email };
  out.push({ json: { kind: ev.kind, matched: !!lead, itemId: lead ? lead.id : null, name: ev.name, phone: ev.phone, colsJson: JSON.stringify(cols), mailId: mail.id } });
}
// keep the dedupe store small
const cutoff = Date.now() - 30 * 86400000; for (const k of Object.keys(sd.seen)) if (sd.seen[k] < cutoff) delete sd.seen[k];
return out;
