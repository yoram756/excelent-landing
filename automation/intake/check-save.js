// Confirm Monday saved the item, remember the idempotency key, and prepare the reply and the internal alert.
const r = $input.first().json; const m = $('Build mutation').first().json; const v = $('Validate').first().json;
const id = r.data && (r.data.create_item || r.data.change_multiple_column_values || {}).id;
const savedId=typeof id==='string' ? id : (Number.isSafeInteger(id) ? String(id) : '');
if (!/^[1-9]\d*$/.test(savedId) || r.errors?.length) return [{ json: { saved: false, status: 502, error: 'save_failed' } }];
if (v.ok!==true || v.duplicate!==false || typeof v.replay_binding!=='string') return [{ json: { saved:false, status:502, error:'invalid_intake_context' } }];
const sd = $getWorkflowStaticData('global'); sd.idem = sd.idem || {};
sd.idem[v.key] = { id:savedId, t:Date.now(), binding_version:1, binding:v.replay_binding };
sd.phones = sd.phones || {}; if (!sd.phones[v.phone]) sd.phones[v.phone] = { id: String(id), t: Date.now() };
const s = v.score;
const text = `${m.mode === 'create' ? 'ליד חדש' : 'פנייה חוזרת'} ${v.source}: ${v.name}, ${s.label}${s.complexity.length ? ', מורכבות: ' + s.complexity.join(', ') : ''}${v.labels.ask ? ', מבקש: ' + v.labels.ask : ''}`;
return [{ json: { saved: true, status: 200, request_id: String(id), mode: m.mode, alertText: text } }];
