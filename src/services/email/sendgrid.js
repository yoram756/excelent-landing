// SendGrid email provider (v3 Mail Send). Same shape as sms/textme.js: pure builder, send() with an injected transport.
// The API key is never part of the request built here: n8n adds it from a credential, send() from opts.apiKey.
const URL = 'https://api.sendgrid.com/v3/mail/send';

const isEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || ''));

const buildRequest = ({ from, fromName, to, subject, text }) => {
  if (!isEmail(from)) throw new Error('sendgrid: from address missing or invalid');
  if (!isEmail(to)) throw new Error('sendgrid: recipient missing or invalid');
  if (!subject || !text) throw new Error('sendgrid: subject and text required');
  return { method: 'POST', url: URL, body: {
    personalizations: [{ to: [{ email: to }] }],
    from: fromName ? { email: from, name: fromName } : { email: from },
    subject: String(subject),
    content: [{ type: 'text/plain', value: String(text) }]
  } };
};

// SendGrid answers 202 Accepted on success with an empty body.
const send = async (msg, { apiKey, transport } = {}) => {
  if (!apiKey) throw new Error('sendgrid: api key missing');
  const req = buildRequest(msg);
  const t = transport || (async r => { const res = await fetch(r.url, { method: r.method, headers: r.headers, body: JSON.stringify(r.body) }); let json = null; try { json = await res.json(); } catch (e) {} return { status: res.status, json }; });
  const res = await t({ ...req, headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' } });
  return { ok: res.status === 202 || res.status === 200, status: res.status, response: res.json };
};

// Fills {first}, {name}, {contactPhone} in a draft text. Unknown placeholders stay visible, so review catches them.
const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (m, k) => vars[k] != null ? vars[k] : m);

const inlineSource = () => '(()=>{const module={exports:{}};\n' + require('fs').readFileSync(__filename, 'utf8').replace(/\r\n/g, '\n') + '\nreturn module.exports;})()';

module.exports = { URL, buildRequest, send, fill, inlineSource };
