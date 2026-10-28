'use strict';

function textmeToolInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 1 || typeof input.requestJson !== 'string' || input.requestJson.length > 4000) throw Error('REQUEST_JSON_REQUIRED');
  try { return JSON.parse(input.requestJson); } catch { throw Error('INVALID_REQUEST_JSON'); }
}

// No credential values, caller-controlled URL, username or arbitrary RPC root.
function textmeReadRequest(input, username) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('INVALID_INPUT');
  if (typeof username !== 'string' || !username.includes('@')) throw Error('ACCOUNT_REQUIRED');
  const rules = {
    balance: [], verifiedSenders: [],
    delivery: ['from', 'to', 'externalIds'],
    deliveryByDate: ['from', 'to'], incoming: ['from', 'to'], blacklist: ['from', 'to'],
  };
  const { operation } = input;
  if (!Object.hasOwn(rules, operation)) throw Error('OPERATION_NOT_ALLOWED');
  if (Object.keys(input).some(k => !['operation', ...rules[operation]].includes(k))) throw Error('UNEXPECTED_FIELD');
  const roots = { balance: 'balance', verifiedSenders: 'getVerifiedPhones', delivery: 'dlr', deliveryByDate: 'dlrByDate', incoming: 'incoming', blacklist: 'blacklist' };
  const body = { user: { username } };
  if (rules[operation].includes('from')) {
    const parse = value => {
      const m = /^(\d{2})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})$/.exec(value || '');
      if (!m) throw Error('DATE_FORMAT_DDMMYY_HHMM');
      const [day, month, year, hour, minute] = m.slice(1).map(Number);
      const date = new Date(Date.UTC(2000 + year, month - 1, day, hour, minute));
      if (date.getUTCFullYear() !== 2000 + year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || hour > 23 || minute > 59) throw Error('INVALID_DATE');
      return +date;
    };
    const from = parse(input.from), to = parse(input.to);
    if (to < from || to - from > 7 * 86400000) throw Error('MAX_SEVEN_DAY_WINDOW');
    body.from = input.from; body.to = input.to;
  }
  if (operation === 'delivery') {
    if (!Array.isArray(input.externalIds) || input.externalIds.length < 1 || input.externalIds.length > 100 || new Set(input.externalIds).size !== input.externalIds.length || input.externalIds.some(v => typeof v !== 'string' || !/^[A-Za-z0-9_.:-]{1,80}$/.test(v))) throw Error('INVALID_EXTERNAL_IDS');
    body.transactions = { external_id: input.externalIds };
  }
  if (operation === 'deliveryByDate') body.transactions = { external_id: 'null' };
  return { method: 'POST', url: 'https://my.textme.co.il/api', operation, body: { [roots[operation]]: body } };
}

function textmeReadResponse(operation, response) {
  const { statusCode, body } = response || {};
  if (statusCode !== 200 || !body || typeof body !== 'object' || Array.isArray(body)) throw Error('INVALID_PROVIDER_RESPONSE');
  // No truthy coercion: absent/null/false/empty status is not success.
  if (body.status !== 0 && body.status !== '0') throw Error('TEXTME_STATUS_' + (/^\d{1,6}$/.test(String(body.status)) ? body.status : 'UNKNOWN'));
  if (body.errors !== undefined && (!Array.isArray(body.errors) || body.errors.length)) throw Error('TEXTME_PARTIAL_OR_MALFORMED_RESULT');
  const rows = value => value == null ? [] : Array.isArray(value) ? value : [value];
  const select = (row, keys) => Object.fromEntries(keys.filter(k => typeof row?.[k] === 'string' || typeof row?.[k] === 'number').map(k => [k, String(row[k]).slice(0,2000)]));
  const result = { provider: 'TextMe', operation, httpStatus: 200, providerStatus: 0, readOnly: true };
  if (operation === 'balance') {
    if (!/^\d+(\.\d+)?$/.test(String(body.balance))) throw Error('BALANCE_MISSING');
    result.balance = String(body.balance);
    if (/^\d+(\.\d+)?$/.test(String(body.international_balance))) result.internationalBalance = String(body.international_balance);
  } else {
    const keys = operation === 'verifiedSenders' ? ['PHONE', 'ASSIGNMENT_DATE', 'LAST_UPDATE'] : operation === 'incoming' ? ['source', 'destination', 'message', 'date'] : operation === 'blacklist' ? ['phone', 'date'] : ['external_id', 'source', 'phone', 'status', 'message_he', 'en_message', 'shipment_id', 'date'];
    const values = rows(operation === 'verifiedSenders' ? body.verified_phones : body.transactions);
    if (values.some(v => !v || typeof v !== 'object' || Array.isArray(v))) throw Error('MALFORMED_ROWS');
    result.rows = values.slice(0,100).map(v => select(v,keys));
    result.truncated = values.length > 100;
    result.rowCount = values.length;
    result.contentTrust = 'untrusted_provider_data';
  }
  return result;
}

module.exports = { textmeToolInput, textmeReadRequest, textmeReadResponse };
