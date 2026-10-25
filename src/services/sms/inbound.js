// n8n Code node "Parse SMS" (mode: run once for each item). Source of truth: this file.
// TextMe posts DLRs and replies as application/x-www-form-urlencoded; n8n hands the parsed form as $json.body.
// A reply with an opt-out keyword is marked for the global opt-out (channels.optOut.label) on every item with that phone.
const TM = __TEXTME__, CFG = __CONFIG__;
const m = TM.parseWebhook($json.body, CFG.channels.optOut.keywords);
const local = m.phone && m.phone.startsWith('972') ? '0' + m.phone.slice(3) : null;
return { json: { ...m, local, campaign: CFG.id, receivedAt: new Date().toISOString() } };
