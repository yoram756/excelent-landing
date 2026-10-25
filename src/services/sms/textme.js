// TextMe SMS provider: the only module that knows the TextMe request and webhook shapes.
// Pure builders plus send() with an injected transport, so tests never reach the network.
// The Bearer token is never part of the request built here: n8n adds it from a credential, send() from opts.token.
const URL = 'https://my.textme.co.il/api';

const toE164 = p => { const d = String(p || '').replace(/\D/g, ''); return d.startsWith('972') ? d : d.startsWith('0') ? '972' + d.slice(1) : d; };

// One SMS to one or more phones. Throws on missing fields instead of sending a half-built message.
const buildRequest = ({ source, destinations, message }) => {
  const to = [].concat(destinations || []).map(toE164).filter(d => /^972\d{8,9}$/.test(d));
  if (!source) throw new Error('textme: source (sender id) missing');
  if (!to.length) throw new Error('textme: no valid destination');
  if (!message || !String(message).trim()) throw new Error('textme: empty message');
  return { method: 'POST', url: URL, body: { source, destinations: to, message: String(message) } };
};

// transport(req) -> { status, json }. Default is global fetch (Node >= 18).
const send = async (msg, { token, transport } = {}) => {
  if (!token) throw new Error('textme: token missing');
  const req = buildRequest(msg);
  const t = transport || (async r => { const res = await fetch(r.url, { method: r.method, headers: r.headers, body: JSON.stringify(r.body) }); let json = null; try { json = await res.json(); } catch (e) {} return { status: res.status, json }; });
  const res = await t({ ...req, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } });
  return { ok: res.status >= 200 && res.status < 300, status: res.status, response: res.json };
};

// Inbound webhook (DLR or a reply), body is application/x-www-form-urlencoded: the raw string or the form n8n already parsed.
// Field names are not confirmed against TextMe documentation yet; the first present alias wins.
const pick = (q, names) => { for (const n of names) { const v = q.get(n); if (v != null && v !== '') return v; } return null; };
const parseWebhook = (rawBody, optOutKeywords) => {
  const q = new URLSearchParams(rawBody && typeof rawBody === 'object' ? rawBody : String(rawBody || ''));
  const text = pick(q, ['message', 'text', 'body', 'content']);
  const status = pick(q, ['status', 'dlr_status', 'state']);
  const messageId = pick(q, ['message_id', 'messageId', 'id', 'msgid']);
  const type = text != null ? 'reply' : status != null ? 'dlr' : 'unknown';
  // In a reply the lead is the sender; in a DLR the lead is the destination and "source" is our sender id.
  const phone = toE164(pick(q, type === 'reply' ? ['phone', 'sender', 'from', 'source'] : ['phone', 'destination', 'to']));
  const optOut = type === 'reply' && !!optOutKeywords && new RegExp('^(' + optOutKeywords + ')[\\s.!,]*$', 'i').test(text.trim());
  return { type, phone: phone || null, text, status, messageId, optOut };
};

// This file as an expression the build injects into n8n Code nodes (they cannot require repo files).
const inlineSource = () => '(()=>{const module={exports:{}};\n' + require('fs').readFileSync(__filename, 'utf8').replace(/\r\n/g, '\n') + '\nreturn module.exports;})()';

module.exports = { URL, buildRequest, send, parseWebhook, inlineSource };
