// C-UNIT-1 (2026-07-08): thin GA4 event wrapper. No-ops when gtag is not
// present (analytics off / consent denied / SSR) — safe to call from any
// component without guards.
//
// PII policy: names + non-PII params only. Never include email, phone,
// user_id, name, address, or any content the visitor typed into a form.
// Successful-submit fires may include property_id / building_slug / lead_kind
// (all public listing metadata), never lead.email etc.
//
// Consent-safe: gtag itself observes Consent Mode v2. When analytics_storage
// is 'denied', gtag emits cookieless pings only. No cookie is set until the
// user explicitly accepts. This module doesn't need to know; it just calls
// gtag('event', ...) and lets gtag route it.

type GtagFn = (
  command: 'event' | 'config' | 'consent' | 'set' | 'get',
  targetId: string,
  params?: Record<string, unknown>,
) => void

declare global {
  interface Window {
    gtag?: GtagFn
    dataLayer?: unknown[]
  }
}

// Canonical event names for C-UNIT-1 real conversion surfaces (LANE-C recon).
// Every event fires only after the corresponding POST resolves successfully.
export type TrackedEventName =
  | 'contact_agent_submit'
  | 'book_showing_submit'
  | 'estimator_submit'
  | 'plan_generated_submit'
  | 'chat_vip_request'
  | 'chat_vip_questionnaire'
  | 'vip_access_grant'
  | 'page_view'

export function trackEvent(name: TrackedEventName, params?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  const g = window.gtag
  if (typeof g !== 'function') return
  try {
    g('event', name, params || {})
  } catch {
    // Never throw from a track call — analytics is a side-signal.
  }
}
