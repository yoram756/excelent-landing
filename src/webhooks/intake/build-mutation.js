// Decide create or update (same phone within 24 hours) and build the Monday mutation with variables.
const v = $('Validate').first().json;
const response=$input.first().json;
const page=response.data?.items_page_by_column_values;
if(response.errors?.length || !Array.isArray(page?.items) || page.cursor)throw new Error('Monday lookup failed or incomplete; refusing duplicate-prone create');
const norm=s=>{let n=String(s||'').replace(/\D/g,'');return n.startsWith('0')?'972'+n.slice(1):n;};
const found=page.items.filter(it=>norm(it.column_values?.find(c=>c.id==='refi_phone')?.text)===v.phone);
const dayAgo = Date.now() - 24*3600e3;
const sd = $getWorkflowStaticData('global'); sd.phones = sd.phones || {};
for (const [k,x] of Object.entries(sd.phones)) if (Date.now() - x.t > 24*3600e3) delete sd.phones[k];
// Monday search can lag by a minute, so a local 24 hour cache of phone to item is checked first
const cached = sd.phones[v.phone] ? { id: sd.phones[v.phone].id, created_at: new Date(sd.phones[v.phone].t).toISOString() } : null;
const recent = cached || found.filter(i => Date.parse(i.created_at) >= dayAgo).sort((a,b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
const L = v.labels, A = v.answers, s = v.score;
const dt = iso => { const d = new Date(iso); return { date: d.toISOString().slice(0,10), time: d.toISOString().slice(11,19) }; };
const goals = Array.isArray(A.goal) ? A.goal : (A.goal ? [A.goal] : []);
const cv = {};
const st = (col, label) => { if (label) cv[col] = { label: String(label).slice(0,30) }; };
st('refi_source', v.source);
st('refi_balance', L.bal);
if (goals[0]) st('refi_goal', v.goalNames[0]);
if (goals[1]) st('color_mm88h0j8', v.goalNames[1]);
if (A.loans === 'n') st('refi_other_loans', 'לא'); else if (A.loans && A.loans !== 'na') st('refi_other_loans', 'כן');
st('color_mm88h799', L.pay); st('color_mm885m0t', L.left); st('color_mm88cffb', L.when); st('color_mm88fzyb', L.ask); st('color_mm88catt', L.doc);
cv.numeric_mm883h9v = String(s.score);
st('color_mm88xpa8', s.label);
cv.long_text_mm88pfdv = { text: `גרסה ${s.version}, חושב ${s.computedAt}, שלמות ${s.completeness}\n${s.reasons.join('\n')}${s.missing.length ? '\nחסר: ' + s.missing.join(', ') : ''}` };
cv.long_text_mm88xzfe = { text: `מוצר: ${v.productName} (${v.product})\nמידע כספי צורף: ${v.money_included ? 'כן' : 'לא'}\n${v.readable}` };
cv.long_text_mm88cs6f = { text: s.complexity.length ? s.complexity.join('\n') : 'לא זוהתה מורכבות מיוחדת' };
if (A.has) cv.dropdown_mm88dkb2 = { labels: [L.has] };
cv.boolean_mm8848pn = { checked: 'true' };
cv.date_mm88hmw2 = dt(v.service_request_at);
if (v.marketing_consent) { cv.boolean_mm88mzry = { checked: 'true' }; cv.date_mm88qwfm = dt(v.marketing_consent_at); }
if (v.email) cv.fn_email = { email:v.email, text:v.email };
if (v.contact_permissions) {
  cv.long_text_mm8ag9s = { text:JSON.stringify(v.contact_permissions) };
  // A modern form can withdraw WhatsApp consent while keeping email/SMS consent.
  cv.boolean_mm88mzry = { checked:v.contact_permissions.grants.whatsapp?'true':'false' };
  if (!v.contact_permissions.grants.whatsapp) cv.date_mm88qwfm = {};
}
if (v.channel === 'וואטסאפ') cv.boolean_mm88aae4 = { checked: 'true' };
if (recent) {
  return [{ json: { mode: 'update', itemId: recent.id, query: 'mutation($item: ID!, $vals: JSON!){ change_multiple_column_values(board_id: 5106246268, item_id: $item, column_values: $vals, create_labels_if_missing: true){ id } }', variables: { item: String(recent.id), vals: JSON.stringify(cv) } } }];
}
cv.refi_phone = { phone: v.phone, countryShortName: 'IL' };
cv.refi_entered = dt(new Date().toISOString());
cv.refi_stage = { label: 'ליד חדש' };
cv.color_mm88hss3 = { label: s.feasibility };
return [{ json: { mode: 'create', query: 'mutation($name: String!, $vals: JSON!){ create_item(board_id: 5106246268, group_id: "topics", item_name: $name, column_values: $vals, create_labels_if_missing: true){ id } }', variables: { name: `${v.name} ${v.phoneLocal}`, vals: JSON.stringify(cv) } } }];
