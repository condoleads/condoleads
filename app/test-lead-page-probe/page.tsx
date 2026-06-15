// app/test-lead-page-probe/page.tsx
//
// W-CHARLIE-BUYER-CHUNK3 (2026-06-15) — Playwright real-DOM verify seam
// for the admin lead-page tile upgrade. Mounts PlanRenderer's PlanTab
// with three synthetic leads (buyer-with-data, seller-with-estimate,
// buyer-with-empty-tax) so a headless browser can assert the upgraded
// matched-listings + comp-sold tiles AND the seller-side no-regression.
//
// /test- prefix bypasses middleware's comprehensive-site rewrite
// (middleware.ts:87). No DB read, no auth gate — pure render seam.

import PlanTab from '@/components/admin-homes/lead-workbench/PlanRenderer'

// Realistic buyer plan_data shape — matches what plan-email/route.ts
// writes for a buyer plan (snake_case from /api/geo-listings, server-
// derived buyerTaxMatch, top-level comparables array).
const BUYER_LEAD: any = {
  id: 'buyer-fixture-1',
  contact_name: 'Buyer Test',
  contact_email: 'buyer@test.invalid',
  intent: 'buyer',
  geo_name: 'Whitby',
  source: 'walliam_charlie',
  source_url: null,
  created_at: '2026-06-15T10:00:00Z',
  agents: null,
  plan_data: {
    planType: 'buyer',
    plan: { type: 'buyer', geoName: 'Whitby', budgetMin: 600000, budgetMax: 800000, propertyType: 'homes', bedrooms: 3, timeline: 'flexible' },
    analytics: { sale_to_list_ratio: 99, closed_avg_dom_90: 18, median_psf: 800, active_count: 50, closed_sale_count_90: 80, absorption_rate_pct: 60, track: 'homes' },
    topListings: [
      { listing_key: 'BUYER-MATCH-1', unparsed_address: '201 Match St, Whitby, ON L1N 2A2', list_price: 725000, bedrooms_total: 3, bathrooms_total_integer: 2, days_on_market: 14, property_subtype: 'Detached', property_type: 'Residential Freehold', tax_annual_amount: 5100, media: [{ media_url: 'https://example.invalid/m1.jpg' }], _slug: '201-match-st-whitby-buyer-match-1' },
      { listing_key: 'BUYER-MATCH-2', unparsed_address: '202 Match St, Whitby, ON L1N 2A2', list_price: 750000, bedrooms_total: 4, bathrooms_total_integer: 3, days_on_market: 22, property_subtype: 'Detached', tax_annual_amount: 5400, media: [{ media_url: 'https://example.invalid/m2.jpg' }], _slug: '202-match-st-whitby-buyer-match-2' },
      { listing_key: 'BUYER-MATCH-3-NOPHOTO', unparsed_address: '203 Match St, Whitby', list_price: 698000, bedrooms_total: 3, bathrooms_total_integer: 2, property_subtype: 'Detached' /* no media, no _slug yet */ },
    ],
    comparables: [
      { listing_key: 'BUYER-COMP-1', unparsed_address: '50 Comp St, Whitby, ON L1N 9X9', close_price: 705000, bedrooms_total: 3, bathrooms_total_integer: 2, days_on_market: 18, property_subtype: 'Detached', media: [{ media_url: 'https://example.invalid/c1.jpg' }], _slug: '50-comp-st-whitby-buyer-comp-1' },
      { listing_key: 'BUYER-COMP-2', unparsed_address: '60 Comp St, Whitby', close_price: 685000, bedrooms_total: 3, bathrooms_total_integer: 2, property_subtype: 'Detached', media: [{ media_url: 'https://example.invalid/c2.jpg' }] },
    ],
    buyerTaxMatch: {
      isEmpty: false,
      reason: null,
      medianTax: 5250,
      taxBand: { low: 5100, high: 5400 },
      withTaxCount: 2,
      totalCount: 3,
      samples: [
        { listingKey: 'BUYER-MATCH-1', address: '201 Match St, Whitby', price: 725000, tax: 5100, bedrooms: 3, bathrooms: 2, propertySubtype: 'Detached', _slug: '201-match-st-whitby-buyer-match-1', media: [{ media_url: 'https://example.invalid/m1.jpg' }] },
      ],
    },
    sellerEstimate: null,  // Chunk-1 gate ensures null on buyer plans
  },
}

// Seller fixture — no buyer-section mounts; routes to SellerEstimateMount
const SELLER_LEAD: any = {
  id: 'seller-fixture-1',
  contact_name: 'Seller Test',
  contact_email: 'seller@test.invalid',
  intent: 'seller',
  geo_name: 'Pickering',
  source: 'walliam_charlie',
  source_url: null,
  created_at: '2026-06-15T11:00:00Z',
  agents: null,
  plan_data: {
    planType: 'seller',
    plan: { type: 'seller', geoName: 'Pickering', propertyType: 'homes', estimatedValueMin: 850000, estimatedValueMax: 910000, timeline: 'flexible', goal: 'maximize' },
    analytics: { sale_to_list_ratio: 99, closed_avg_dom_90: 18, median_psf: 800, active_count: 50, closed_sale_count_90: 80, absorption_rate_pct: 60, track: 'homes' },
    topListings: [],
    comparables: null,         // null on seller plans (Chunk-2 gate)
    buyerTaxMatch: null,       // null on seller plans (Chunk-2 gate)
    sellerEstimate: {
      estimate: { estimatedPrice: 880000, priceRange: { low: 850000, high: 910000 }, bestGeoTier: 'community', tiers: { community: { count: 5, median: 880000 } }, taxMatch: { estimatedPrice: 875000, priceRange: { low: 850000, high: 900000 }, comparables: [] } },
      comparables: [{ listingKey: 'STALE-CS-1', closePrice: 870000, unparsedAddress: '888 Test Comp Ave, Pickering' }],
      competingListings: [],
      buildingName: null,
      subjectAddress: '606 Aspen Test St, Pickering',
      geoLevel: 'community',
      intent: 'sale',
      path: 'home',
    },
  },
}

// Empty-tax buyer (honest empty-state path)
const BUYER_EMPTY_TAX_LEAD: any = {
  id: 'buyer-empty-tax-1',
  contact_name: 'Buyer Empty Tax',
  contact_email: 'bet@test.invalid',
  intent: 'buyer',
  geo_name: 'Toronto',
  source: 'walliam_charlie',
  source_url: null,
  created_at: '2026-06-15T12:00:00Z',
  agents: null,
  plan_data: {
    planType: 'buyer',
    plan: { type: 'buyer', geoName: 'Toronto', budgetMin: 400000, budgetMax: 600000, propertyType: 'condo', bedrooms: 1, timeline: 'flexible' },
    analytics: { track: 'condo' },
    topListings: [],
    comparables: [],
    buyerTaxMatch: { isEmpty: true, reason: 'Only 1 of 5 matched listings carry tax data — need at least 3 for a fair median.', medianTax: null, taxBand: null, withTaxCount: 1, totalCount: 5, samples: [] },
    sellerEstimate: null,
  },
}

export default function LeadPageProbe() {
  return (
    <div style={{ background: '#f8fafc', padding: 24, minHeight: '100vh' }}>
      <h1 style={{ fontSize: 20, marginBottom: 24, color: '#0f172a', fontFamily: 'system-ui' }}>PlanRenderer real-DOM probe</h1>
      <section data-testid="buyer-lead" style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 14, marginBottom: 12, color: '#475569', fontFamily: 'system-ui' }}>Buyer lead (matched + comp-sold + tax-match)</h2>
        <PlanTab anchorLead={BUYER_LEAD} leadFamily={[BUYER_LEAD]} />
      </section>
      <section data-testid="seller-lead" style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 14, marginBottom: 12, color: '#475569', fontFamily: 'system-ui' }}>Seller lead (SellerEstimateMount — no-regression)</h2>
        <PlanTab anchorLead={SELLER_LEAD} leadFamily={[SELLER_LEAD]} />
      </section>
      <section data-testid="buyer-empty-tax-lead">
        <h2 style={{ fontSize: 14, marginBottom: 12, color: '#475569', fontFamily: 'system-ui' }}>Buyer lead with empty-tax fixture (honest empty-state)</h2>
        <PlanTab anchorLead={BUYER_EMPTY_TAX_LEAD} leadFamily={[BUYER_EMPTY_TAX_LEAD]} />
      </section>
    </div>
  )
}
