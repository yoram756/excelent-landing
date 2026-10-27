import type { Receipt } from './lead';
import { isReceipt } from './lead';

const pending = new Map<string, Promise<boolean>>();

export function trackQuoteSubmitted(receipt: Receipt): Promise<boolean> {
  if (!isReceipt(receipt) || !receipt.analyticsConsent || !/^\/thank-you\/?$/.test(location.pathname)) return Promise.resolve(false);
  const marker = `excelent:conversion:v1:${receipt.eventId}`;
  try { if (sessionStorage.getItem(marker)) return Promise.resolve(false); } catch { /* UUID deduplication also travels with the event. */ }
  const existing = pending.get(receipt.eventId);
  if (existing) return existing;
  const task = (async () => {
    const response = await fetch('/analytics-config.json', { credentials: 'same-origin' });
    if (!response.ok) return false;
    const config: { key?: string; host?: string } = await response.json();
    if (!config.key || !/^phc_[A-Za-z0-9_-]{8,200}$/.test(config.key) || !config.host) return false;
    const host = new URL(config.host);
    if (host.protocol !== 'https:' || host.username || host.password || host.pathname !== '/' || host.search) return false;
    const { default: posthog } = await import('posthog-js');
    posthog.init(config.key, {
      api_host: host.origin,
      persistence: 'memory', person_profiles: 'never',
      autocapture: false, capture_pageview: false, capture_pageleave: false,
      capture_performance: false, capture_exceptions: false,
      disable_session_recording: true, disable_surveys: true,
      disable_external_dependency_loading: true, advanced_disable_feature_flags: true,
      save_referrer: false, save_campaign_params: false,
      request_batching: false, disable_compression: true,
      before_send: event => {
        if (event.event !== 'quote_submitted') return null;
        // An allowlist removes SDK URL/referrer data and every contact field.
        event.properties = {
          token: event.properties.token,
          distinct_id: event.properties.distinct_id,
          $cookieless_mode: event.properties.$cookieless_mode,
          $lib: event.properties.$lib,
          $lib_version: event.properties.$lib_version,
          $process_person_profile: false,
          event_id: receipt.eventId,
          form_id: 'refi-cro',
          product: 'refi',
          page: '/thank-you',
        };
        delete event.$set;
        delete event.$set_once;
        delete event.$unset;
        return event;
      },
    });
    const captured = posthog.capture('quote_submitted', { event_id: receipt.eventId }, { uuid: receipt.eventId, send_instantly: true });
    if (!captured) return false;
    try { sessionStorage.setItem(marker, 'queued'); } catch { /* No contact data is stored. */ }
    return true;
  })().catch(() => false);
  pending.set(receipt.eventId, task);
  void task.then(queued => { if (!queued) pending.delete(receipt.eventId); });
  return task;
}
