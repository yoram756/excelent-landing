// n8n Code node "Instant reply input": the saved lead as the input of the instant reply workflow.
// Only a new item gets the instant template; a repeat inquiry stays with the engine.
// receivedAt is the server receipt time recorded by Validate, so the 60 second window starts at intake.
const v = $('Validate').first().json; const m = $('Build mutation').first().json; const s = $('Check save').first().json;
if (s.saved !== true || m.mode !== 'create') return [];
const p = v.contact_permissions || {};
return [{ json: { itemId: s.request_id, name: v.name, firstName: v.name.replace(/^TEST\s*/, '').split(' ')[0], phone: v.phone,
  receivedAt: p.receivedAt || null, grants: p.grants || {}, marketing: v.marketing_consent === true } }];
