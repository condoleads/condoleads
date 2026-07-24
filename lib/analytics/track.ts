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
//
// GA4-GAPS-FIX 2026-07-24: added 6 new events for previously-blind lead
// surfaces (chat, gate, contact form, agent card, header CTA, listing card).
// Also added optional {contactEmail} opts arg so callers that HAVE the user's
// email can skip firing on obvious test/dev submissions (finaltest@, @*.local,
// @example.com, condoleads.ca@gmail.com, kingshahone@gmail.com). Existing
// callers pass 2 args (unchanged behavior); new fix sites pass 3 to get the
// guard. Working events are NOT modified.

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

// Canonical event names.
// - First 8: shipped C-UNIT-1 conversion surfaces (unchanged).
// - Next 6: GA4-GAPS-FIX 2026-07-24, one per previously-blind lead source.
//   Naming aligns with operator dispatch recommendation.
export type TrackedEventName =
  | 'contact_agent_submit'
  | 'book_showing_submit'
  | 'estimator_submit'
  | 'plan_generated_submit'
  | 'chat_vip_request'
  | 'chat_vip_questionnaire'
  | 'vip_access_grant'
  | 'page_view'
  // GA4-GAPS-FIX 2026-07-24 (batch 1, shipped d2453e8):
  | 'chat_lead_submit'         // useCharlie plan-email auto-write (source=walliam_charlie / aily_charlie)
  | 'chat_gate_submit'         // RegisterModal via CharlieWidget gate + ChatLocked (registrationSource=walliam_charlie_gate | ai_chat)
  | 'contact_form_submit'      // WalliamContactForm (source=walliam_contact_form)
  | 'agent_card_submit'        // WalliamAgentCard (source=walliam_agent_card)
  | 'header_cta_submit'        // RegisterModal via SiteHeader (registrationSource=site_header | site_header_mobile)
  | 'listing_card_submit'      // RegisterModal via ListingCard / HomeListingCard / GeoListingCard (registrationSource=listing_card | home_listing_card | geo_listing_card)
  // GA4-GAPS-FIX 2026-07-24 (batch 2, this commit):
  | 'hero_cta_submit'          // RegisterModal via HomePage hero (registrationSource=homepage_hero)
  | 'gated_content_submit'     // RegisterModal via PropertyHeader / PropertyGallery / GatedContent / HomeAddressHistoryModal (registrationSource=property_header | property_gallery | property_detail | home_history_modal). Which gate is passed as a param.
  | 'sold_gate_submit'         // RegisterModal via GeoListingSection / NeighbourhoodListingSection (registrationSource=walliam_sold_gate)
  | 'listing_gate_submit'      // RegisterModal via ListingSection (registrationSource=walliam_listing_gate)
  | 'contact_modal_submit'     // ContactModal (source variant passed as param — home_page | building_page | property_inquiry | message_agent | sale_offer | building_visit)
  | 'contact_section_submit'   // ContactSection on homepage (source=contact_form)
  | 'seller_evaluation_submit' // ListYourUnit -> market evaluation form (source=sale_evaluation_request)
  | 'building_visit_submit'    // ListYourUnit -> building visit form (source=building_visit_request)
  | 'unit_history_submit'      // UnitHistoryModal (source=unit_history_inquiry)
  | 'appointment_submit'       // AppointmentForm in Charlie (source=`${sourceKey}_appointment`)

// GA4-GAPS-FIX 2026-07-24: test-email guard. The DB previously accumulated
// 308/309 test leads (finaltest@, @t3b-smoke.local, @example.com, dev email
// condoleads.ca@gmail.com). Once Ads bidding is turned on, any of those
// firing a conversion event would corrupt bid optimization. This predicate
// captures the same patterns used to identify test rows during the leads
// purge on 2026-07-24. Callers that have the visitor's email pass it via
// opts.contactEmail; the guard silently swallows the event when matched.
// Callers without a form email (e.g. useCharlie auto-write, page_view) can
// simply omit opts.
const TEST_EMAIL_PATTERNS: RegExp[] = [
  /test/i,                                    // finaltest, testfinal, testingleads, "test"
  /^kingshahone@gmail\.com$/i,                // platform admin dev testing
  /@condoleads\.ca$/i,                        // wleadflow+*@condoleads.ca
  /^condoleads\.ca@gmail\.com$/i,             // dev's alternate address
  /@example\.com$/i,                          // t6d-verify buyer/seller
  /\.local$/i,                                // @t3b-smoke.local, @t3c-smoke.local
]

export function isTestEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const trimmed = email.trim()
  if (!trimmed) return false
  return TEST_EMAIL_PATTERNS.some(re => re.test(trimmed))
}

export function trackEvent(
  name: TrackedEventName,
  params?: Record<string, unknown>,
  opts?: { contactEmail?: string | null },
): void {
  if (typeof window === 'undefined') return
  // GA4-GAPS-FIX guard: if the caller has the visitor's email and it matches
  // a test pattern, don't emit. Absence of opts.contactEmail means the caller
  // has no email to check (e.g. page_view, auth-only chat auto-write); we
  // still fire in that case — the guard is opt-in per call site.
  if (opts && isTestEmail(opts.contactEmail)) return
  const g = window.gtag
  if (typeof g !== 'function') return
  try {
    g('event', name, params || {})
  } catch {
    // Never throw from a track call — analytics is a side-signal.
  }
}
