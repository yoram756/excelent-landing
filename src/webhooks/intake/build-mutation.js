// Decide create or update (same phone within 24 hours) and build the Monday mutation with variables.
// Board, group, stage and column ids come from the campaign's intake block (injected as __INTAKE__ by source.js).
const K = __INTAKE__, KC = K.columns;
const v = $('Validate').first().json;
const response=$input.first().json;
const page=response.data?.items_page_by_column_values;
if(response.errors?.length || !Array.isArray(page?.items) || page.cursor)throw new Error('Monday lookup failed or incomplete; refusing duplicate-prone create');
const norm=s=>{let d=String(s||'').replace(/\D/g,'');if(d.startsWith('00'))d=d.slice(2);else if(d.startsWith('0'))d='972'+d.slice(1);if(d.startsWith('9720'))d='972'+d.slice(4);return d.length>=11?d:'';};
const found=page.items.filter(it=>norm(it.column_values?.find(c=>c.id===KC.phone)?.text)===v.phone);
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
// Write segmentation only to explicitly configured, verified text columns.
for(const [field,column] of Object.entries(K.productColumns||{})){if(!['product_slug','funnel_type'].includes(field)||!column)continue;cv[column]=v[field];}
const st = (col, label) => { if (label) cv[col] = { label: String(label).slice(0,30) }; };
st(KC.source, v.source);
st(KC.balance, L.bal);
if (goals[0]) st(KC.goal, v.goalNames[0]);
if (goals[1]) st(KC.goal2, v.goalNames[1]);
if (A.loans === 'n') st(KC.otherLoans, 'לא'); else if (A.loans && A.loans !== 'na') st(KC.otherLoans, 'כן');
st(KC.pay, L.pay); st(KC.left, L.left); st(KC.when, L.when); st(KC.ask, L.ask); st(KC.doc, L.doc);
cv[KC.heat] = String(s.score);
st(KC.heatLabel, s.label);
cv[KC.heatDetail] = { text: `גרסה ${s.version}, חושב ${s.computedAt}, שלמות ${s.completeness}\n${s.reasons.join('\n')}${s.missing.length ? '\nחסר: ' + s.missing.join(', ') : ''}` };
cv[KC.answers] = { text: `מוצר: ${v.productName} (${v.product})\nסיווג: ${v.product_slug || v.product}\nמידע כספי צורף: ${v.money_included ? 'כן' : 'לא'}\n${v.readable}` };
cv[KC.complexity] = { text: s.complexity.length ? s.complexity.join('\n') : 'לא זוהתה מורכבות מיוחדת' };
if (A.has) cv[KC.hasMortgage] = { labels: [L.has] };
cv[KC.consentService] = { checked: 'true' };
cv[KC.serviceRequestAt] = dt(v.service_request_at);
if (v.marketing_consent) { cv[KC.consentMarketing] = { checked: 'true' }; cv[KC.marketingAt] = dt(v.marketing_consent_at); }
if (v.email) cv[KC.email] = { email:v.email, text:v.email };
if (v.contact_permissions) {
  cv[KC.permissions] = { text:JSON.stringify(v.contact_permissions) };
  // A modern form can withdraw WhatsApp consent while keeping email/SMS consent.
  cv[KC.consentMarketing] = { checked:v.contact_permissions.grants.whatsapp?'true':'false' };
  if (!v.contact_permissions.grants.whatsapp) cv[KC.marketingAt] = {};
}
if (v.channel === 'וואטסאפ') cv[KC.messageReceived] = { checked: 'true' };
if (recent) {
  return [{ json: { mode: 'update', itemId: recent.id, query: 'mutation($item: ID!, $vals: JSON!){ change_multiple_column_values(board_id: ' + K.board + ', item_id: $item, column_values: $vals, create_labels_if_missing: true){ id } }', variables: { item: String(recent.id), vals: JSON.stringify(cv) } } }]
}
cv[KC.phone] = { phone: v.phone, countryShortName: 'IL' };
cv[KC.entered] = dt(new Date().toISOString());
cv[KC.stage] = { label: K.newStage };
cv[KC.feasibility] = { label: s.feasibility };
return [{ json: { mode: 'create', eventId:v.eventId, query: 'mutation($name: String!, $vals: JSON!){ create_item(board_id: ' + K.board + ', group_id: "' + K.group + '", item_name: $name, column_values: $vals, create_labels_if_missing: true){ id } }', variables: { name: `${v.name} ${v.phoneLocal}`, vals: JSON.stringify(cv) } } }];
