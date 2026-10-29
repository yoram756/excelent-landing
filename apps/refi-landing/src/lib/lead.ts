export type LeadInput = { name: string; phone: string; analyticsConsent: boolean };
export type LeadPayload = {
  first_name: string; phone: string; product: string; product_slug: string; campaign: string;
  source: string; event_id: string; idempotency_key: string; service_request: true;
  service_request_at: string; marketing_consent: false; money_included: false; answers: Record<string, never>;
  utm_source?: string; utm_campaign?: string;
};
export type Receipt = { version: 1; requestId: string; eventId: string; acceptedAt: string; analyticsConsent: boolean; landingId?: string };
export const receiptKey = 'excelent:quote-receipt:v1';

export function normalizeInput(input: LeadInput) {
  const name = input.name.trim().replace(/\s+/g, ' ');
  let phone = input.phone.replace(/[\s()+.-]/g, '');
  if (phone.startsWith('00')) phone = phone.slice(2);
  if (phone.startsWith('0')) phone = '972' + phone.slice(1);
  if (phone.startsWith('9720')) phone = '972' + phone.slice(4);
  const errors: Partial<Record<'name' | 'phone', string>> = {};
  if (Array.from(name).length < 2 || Array.from(name).length > 40 || Array.from(name).some(char => char.charCodeAt(0) < 32 || ['<', '>', '{', '}', '[', ']', '\\'].includes(char))) errors.name = 'מה השם שלכם? יש להזין בין שני תווים לארבעים.';
  if (!/^[\d\s()+.-]+$/.test(input.phone) || !/^9725\d{8}$/.test(phone)) errors.phone = 'יש להזין מספר נייד ישראלי תקין.';
  return { name, phone, errors };
}

export function createPayload(input: LeadInput, identity: { product: string; campaign: string; source: string; attributionCampaign?: string }, eventId = crypto.randomUUID(), now = new Date(), search = typeof location === 'undefined' ? '' : location.search): LeadPayload {
  const normalized = normalizeInput(input);
  if (Object.keys(normalized.errors).length) throw Error('Invalid lead');
  const attribution = new URLSearchParams(search);
  return {
    first_name: normalized.name, phone: normalized.phone, product: identity.product,
    product_slug: identity.campaign, campaign: identity.campaign, source: identity.source,
    event_id: eventId, idempotency_key: eventId, service_request: true,
    service_request_at: now.toISOString(), marketing_consent: false, money_included: false, answers: {},
    ...(attribution.get('utm_source') ? { utm_source: attribution.get('utm_source')!.slice(0, 100) } : {}),
    ...((identity.attributionCampaign || attribution.get('utm_campaign')) ? { utm_campaign: (identity.attributionCampaign || attribution.get('utm_campaign')!).slice(0, 100) } : {}),
  };
}

export async function submitLead(payload: LeadPayload, analyticsConsent: boolean, endpoint: string, transport: typeof fetch = fetch): Promise<Receipt> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    // Dispatch immediately. Analytics and navigation must never block this request.
    const response = await transport(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal, credentials: 'same-origin' });
    if (response.status === 429) throw Error('rate');
    if (!response.ok) throw Error('not-confirmed');
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object') throw Error('not-confirmed');
    const result = body as Record<string, unknown>;
    if (result.ok === false || result.saved === false || result.pending === true || response.status === 202 || result.error || typeof result.request_id !== 'string' || !/^[\w-]{1,100}$/.test(result.request_id)) throw Error('not-confirmed');
    return { version: 1, requestId: result.request_id, eventId: payload.event_id, acceptedAt: new Date().toISOString(), analyticsConsent };
  } finally { clearTimeout(timer); }
}

export function isReceipt(value: unknown, now = Date.now()): value is Receipt {
  if (!value || typeof value !== 'object') return false;
  const r = value as Partial<Receipt>;
  const date = Date.parse(r.acceptedAt || '');
  return (r.landingId === undefined || (typeof r.landingId === 'string' && /^[a-z][a-z0-9_]{1,79}$/.test(r.landingId))) && r.version === 1 && typeof r.requestId === 'string' && /^[\w-]{1,100}$/.test(r.requestId) && typeof r.eventId === 'string' && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(r.eventId) && typeof r.analyticsConsent === 'boolean' && Number.isFinite(date) && date <= now + 60000 && now - date < 86400000;
}

export function readReceipt(): Receipt | null {
  try { const value: unknown = JSON.parse(sessionStorage.getItem(receiptKey) || 'null'); return isReceipt(value) ? value : null; }
  catch { return null; }
}

export function saveReceipt(receipt: Receipt) {
  try { sessionStorage.setItem(receiptKey, JSON.stringify(receipt)); } catch { /* Memory navigation still works when browser storage is unavailable. */ }
}
