// app/test-comparable-tile-probe/page.tsx
// (named with /test- prefix to bypass middleware's comprehensive-site
//  rewrite — see middleware.ts:87)
//
// W-CHARLIE-BUYER-INCHAT-FIX (2026-06-15) — Playwright real-DOM verify
// seam. Mirrors the test-render-plan-email-probe pattern (test-only,
// no DB read, no auth gate). Renders ComparableCard with two side-by-
// side fixtures so a headless browser can assert that BOTH the buyer
// snake_case shape AND the seller camelCase shape render populated
// tiles (address visible, price visible, beds visible) — proving the
// dual-shape edit lands on the live render path users hit.

import ComparableCard from '@/app/charlie/components/ComparableCard'

// SELLER fixture — camelCase (matches seller-estimate API shape).
// Pre-fix code path that already worked; this proves no-regression.
const SELLER_FIXTURE = {
  listingKey: 'SELLER-FIX-1',
  unparsedAddress: '888 Seller Cam St, Pickering, ON L1V 6X4',
  closePrice: 870000,
  closeDate: '2026-08-15',
  bedrooms: 3,
  bathrooms: 2,
  daysOnMarket: 18,
  propertySubtype: 'Detached',
  mediaUrl: 'https://example.invalid/seller-photo.jpg',
}

// BUYER fixture — snake_case (matches /api/geo-listings shape that
// get_comparables passes through unchanged). Pre-fix this rendered
// hollow tiles; post-fix the dual-shape reads must hydrate every
// field.
const BUYER_FIXTURE = {
  listing_key: 'BUYER-SNAKE-1',
  unparsed_address: '101 Buyer Snake St, Whitby, ON L1N 2A2',
  close_price: 705000,
  close_date: '2026-08-28',
  bedrooms_total: 4,
  bathrooms_total_integer: 3,
  days_on_market: 22,
  property_subtype: 'Detached',
  media: [{ media_url: 'https://example.invalid/buyer-photo.jpg' }],
  _slug: '101-buyer-snake-st-whitby-buyer-snake-1',
}

// HOLLOW fixture — neither shape (sanity-check that the fallback
// '—' rendering still works when there is genuinely no data, so the
// dual-shape edit didn't hide the legitimate-empty case).
const HOLLOW_FIXTURE = {
  listingKey: 'HOLLOW-1',
}

export default function ComparableTileProbePage() {
  return (
    <div style={{ background: '#080f1a', padding: 40, minHeight: '100vh', color: '#fff', fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 18, marginBottom: 24 }}>ComparableCard real-DOM probe</h1>
      <section data-testid="seller-section" style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 14, marginBottom: 12, color: 'rgba(255,255,255,0.6)' }}>Seller (camelCase — no-regression)</h2>
        <ComparableCard comparable={SELLER_FIXTURE as any} />
      </section>
      <section data-testid="buyer-section" style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 14, marginBottom: 12, color: 'rgba(255,255,255,0.6)' }}>Buyer (snake_case — the fix)</h2>
        <ComparableCard comparable={BUYER_FIXTURE as any} />
      </section>
      <section data-testid="hollow-section">
        <h2 style={{ fontSize: 14, marginBottom: 12, color: 'rgba(255,255,255,0.6)' }}>Hollow (no fields — legitimate empty path)</h2>
        <ComparableCard comparable={HOLLOW_FIXTURE as any} />
      </section>
    </div>
  )
}
