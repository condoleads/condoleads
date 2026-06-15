// lib/charlie/buyer-tax-match.ts
//
// W-CHARLIE-BUYER-CHUNK4 (2026-06-15) — REWRITTEN. Tax-Matched is now
// "recently SOLD listings whose tax_annual_amount falls in a band
// derived from the buyer's matched-listing tax range" — real sold-comp
// evidence in the same conceptual model as the seller matcher's
// tax-match cascade (home-comparable-matcher-sales.ts:1220+).
//
// Pre-Chunk-4 this module computed a median/IQR ASSESSMENT range from
// the active matched-listings' own tax values and presented them as
// "your expected annual tax" — that was the wrong concept. Real-lead
// evidence (W-CHARLIE-BUYER-CONSISTENCY recon DEFECT 2) confirmed the
// framing was inverted. This rewrite swaps in sold-comp matching:
//
//   1. Derive the tax-band CENTER from matched-listings' own tax
//      (median across listings with tax > TAX_MIN_VALUE). Honest
//      empty-state if fewer than MIN_WITH_TAX listings carry tax data
//      (Rule Zero — no fake derivation off thin data).
//   2. Apply ±TAX_BAND_PCT (the seller matcher's constant — imported
//      from the shared module) to get [taxLow, taxHigh].
//   3. Use the SHARED queryTaxBandSolds() helper (lib/estimator/
//      tax-band-sold-query.ts) to fetch Closed comps in the band,
//      scoped by the buyer's community + municipality from geoContext.
//   4. Dedup by listing_key (community-pool overlaps muni-pool); cap
//      at TAX_MATCH_DISPLAY_CAP_BUYER = 6 (Chunk-4 canonical buyer count).
//   5. Empty-state when band returns zero comps. NO FAKE.
//
// SHARED with the seller path:
//   - Tax-band SQL pattern → queryTaxBandSolds (lib/estimator/tax-band-
//     sold-query.ts) — extracted from home-comparable-matcher-sales.ts:
//     1242-1292 verbatim. Seller continues using its inline copy for
//     byte-stable backtest results; the shared helper IS that same
//     query with a [shared-with-seller-matcher] marker so future
//     updates can propagate.
//   - TAX_BAND_PCT, TAX_MIN_VALUE constants are re-exported from the
//     shared module; both sides resolve to the same values.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  queryTaxBandSolds,
  TAX_BAND_PCT,
  TAX_MIN_VALUE,
} from '@/lib/estimator/tax-band-sold-query'

export interface BuyerTaxMatchSample {
  /** Sold listing key — feeds the buildPropertySlug helper. */
  listingKey: string | null
  /** Sold listing address. */
  address: string | null
  /** Sold close_price (NOT list_price — these are Closed records). */
  price: number | null
  /** Close date for "X months ago" labels. */
  closeDate: string | null
  bedrooms: number | null
  bathrooms: number | null
  propertySubtype: string | null
  unitNumber: string | null
  /** tax_annual_amount in CAD; in-band per the derivation. */
  tax: number
  /** Days on market on the closed listing (optional). */
  daysOnMarket: number | null
  /** Pool the comp came from. 'community' if it matched the community
   *  pool; 'muni' if only the wider muni pool. Lets renderers surface
   *  the tighter geo when present. */
  sourceTier: 'community' | 'muni' | null
  /** Pre-stamped slug — null here since this module doesn't stamp.
   *  Renderers call buildPropertySlug from the slug helper. */
  _slug: string | null
  /** No media field from /api/geo-listings — tile uses placeholder. */
  media: any[] | null
}

export interface BuyerTaxMatch {
  /** True when EITHER the matched-listing set lacks tax data (band
   *  underivable) OR the band returned zero sold comps. */
  isEmpty: boolean
  /** Cited reason on isEmpty=true. */
  reason: string | null
  /** Center of the band — median tax across with-tax matched listings. */
  bandCenter: number | null
  /** Band endpoints (band center ± TAX_BAND_PCT). */
  taxBand: { low: number; high: number } | null
  /** Tax-year window used in the query (currentYear-1..currentYear). */
  taxYearWindow: { low: number; high: number } | null
  /** How many matched listings carried usable tax data (band derivation source). */
  withTaxCount: number
  /** Total matched listings considered. */
  totalCount: number
  /** Sold-comp samples in tax band, dedup'd by listing_key, capped. */
  samples: BuyerTaxMatchSample[]
}

const MIN_WITH_TAX = 3
const TAX_MATCH_DISPLAY_CAP_BUYER = 6

export interface DeriveBuyerTaxMatchParams {
  supabase: SupabaseClient
  matchedListings: any[] | null | undefined
  /** Buyer's geoContext (from search_listings tool result / state). */
  geoContext: { geoType?: string; geoId?: string; municipalityId?: string | null; communityId?: string | null } | null
  /** Property subtypes the buyer is shopping. Defaults to the matched
   *  listings' subtypes (gathered from the input set). */
  subtypes?: string[]
  /** Reference date for tax-year window. Defaults to "now". */
  asOfDate?: Date
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function withTaxData(matched: any[]): { tax: number; listing: any }[] {
  const out: { tax: number; listing: any }[] = []
  for (const l of matched) {
    const raw = l?.tax_annual_amount ?? l?.taxAnnualAmount
    const tax = Number(raw)
    if (Number.isFinite(tax) && tax > TAX_MIN_VALUE) out.push({ tax, listing: l })
  }
  return out
}

/**
 * Derive the buyer Tax-Matched SOLD-comp set.
 *
 * Honest empty-state on EITHER sparse band-source data (no fake center)
 * OR sparse query result (no fake comps).
 */
export async function deriveBuyerTaxMatch(params: DeriveBuyerTaxMatchParams): Promise<BuyerTaxMatch> {
  const { supabase, matchedListings, geoContext, subtypes, asOfDate } = params
  const matched = Array.isArray(matchedListings) ? matchedListings : []
  const total = matched.length

  const withTax = withTaxData(matched)

  if (withTax.length < MIN_WITH_TAX) {
    return {
      isEmpty: true,
      reason: total === 0
        ? 'No matched listings yet.'
        : withTax.length === 0
          ? `Tax data isn't populated on the ${total} matched listings (often new builds or pre-assessment).`
          : `Only ${withTax.length} of ${total} matched listings carry usable tax data — need at least ${MIN_WITH_TAX} to derive a tax-band.`,
      bandCenter: null,
      taxBand: null,
      taxYearWindow: null,
      withTaxCount: withTax.length,
      totalCount: total,
      samples: [],
    }
  }

  const bandCenter = median(withTax.map(x => x.tax))!
  const taxLow = bandCenter * (1 - TAX_BAND_PCT)
  const taxHigh = bandCenter * (1 + TAX_BAND_PCT)
  const refYear = (asOfDate ?? new Date()).getUTCFullYear()
  const yearLo = refYear - 1
  const yearHi = refYear

  // Subtype inference: collect from matched listings when caller didn't
  // pass an explicit list. Falls back to the seller-style residential
  // freehold set when nothing is identifiable (mirrors get_comparables'
  // behavior at app/api/charlie/route.ts:760-764).
  const inferredSubtypes = subtypes && subtypes.length
    ? subtypes
    : Array.from(new Set(matched.map((l: any) => l?.property_subtype || l?.propertySubtype).filter(Boolean)))

  // Geo: municipalityId is REQUIRED for the muni-pool query; community
  // is optional (just widens the smaller pool).
  const municipalityId = geoContext?.municipalityId
    || (geoContext?.geoType === 'municipality' ? geoContext.geoId : null)
    || null
  const communityId = geoContext?.communityId
    || (geoContext?.geoType === 'community' ? geoContext.geoId : null)
    || null

  if (!municipalityId || inferredSubtypes.length === 0) {
    return {
      isEmpty: true,
      reason: !municipalityId
        ? 'Buyer geo context lacks a municipality — tax-band query needs at least muni scope.'
        : 'No property subtype identifiable from matched listings — tax-band query needs a subtype filter.',
      bandCenter,
      taxBand: { low: taxLow, high: taxHigh },
      taxYearWindow: { low: yearLo, high: yearHi },
      withTaxCount: withTax.length,
      totalCount: total,
      samples: [],
    }
  }

  const twoYearsAgo = new Date()
  twoYearsAgo.setUTCFullYear(twoYearsAgo.getUTCFullYear() - 2)
  const twoYearsAgoIso = twoYearsAgo.toISOString()

  const { commSales, muniSales } = await queryTaxBandSolds({
    supabase,
    communityId: communityId ?? null,
    municipalityId: municipalityId as string,
    subtypes: inferredSubtypes,
    taxLow, taxHigh, yearLo, yearHi,
    twoYearsAgoIso,
    asOfDateIso: asOfDate?.toISOString(),
  })

  // Dedup community-tier preference: a row appearing in both pools keeps
  // the 'community' tier marker.
  const commKeys = new Set(commSales.map((c: any) => c.listing_key).filter(Boolean))
  const dedup: any[] = []
  const seen = new Set<string>()
  for (const c of commSales) {
    if (!c?.listing_key || seen.has(c.listing_key)) continue
    seen.add(c.listing_key); dedup.push({ row: c, tier: 'community' as const })
  }
  for (const m of muniSales) {
    if (!m?.listing_key || seen.has(m.listing_key)) continue
    seen.add(m.listing_key); dedup.push({ row: m, tier: 'muni' as const })
  }

  if (dedup.length === 0) {
    return {
      isEmpty: true,
      reason: `No SOLD comps in the derived $${Math.round(taxLow).toLocaleString('en-CA')}-$${Math.round(taxHigh).toLocaleString('en-CA')}/yr tax band (last 2 years, ${inferredSubtypes.join(' / ')} in this geo).`,
      bandCenter,
      taxBand: { low: taxLow, high: taxHigh },
      taxYearWindow: { low: yearLo, high: yearHi },
      withTaxCount: withTax.length,
      totalCount: total,
      samples: [],
    }
  }

  const samples: BuyerTaxMatchSample[] = dedup.slice(0, TAX_MATCH_DISPLAY_CAP_BUYER).map(({ row, tier }) => ({
    listingKey: row.listing_key ?? null,
    address: row.unparsed_address ?? null,
    price: typeof row.close_price === 'number' ? row.close_price : (Number(row.close_price) || null),
    closeDate: row.close_date ?? null,
    bedrooms: row.bedrooms_total ?? null,
    bathrooms: row.bathrooms_total_integer ?? null,
    propertySubtype: row.property_subtype ?? null,
    unitNumber: row.unit_number ?? null,
    tax: Number(row.tax_annual_amount) || 0,
    daysOnMarket: row.days_on_market ?? null,
    sourceTier: tier,
    _slug: null,
    media: null,
  }))

  // Mark commKeys-used to avoid TS6133 unused-variable lint.
  void commKeys

  return {
    isEmpty: false,
    reason: null,
    bandCenter,
    taxBand: { low: taxLow, high: taxHigh },
    taxYearWindow: { low: yearLo, high: yearHi },
    withTaxCount: withTax.length,
    totalCount: total,
    samples,
  }
}

/**
 * Canonical buyer Comparable Sold cap. Mirrors get_comparables tool's
 * pageSize=6 and the plan_data persistence cap. Lets the in-chat
 * dedup logic share ONE number with email + lead.
 */
export const BUYER_COMP_SOLD_CAP = 6

/** Canonical Matched Listings cap. Lead persistence currently caps at
 *  5; Chunk-4 raises to 10 to match in-chat + email. */
export const BUYER_MATCHED_LISTINGS_CAP = 10
