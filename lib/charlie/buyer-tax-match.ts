// lib/charlie/buyer-tax-match.ts
//
// W-CHARLIE-BUYER-CHUNK2 (2026-06-15) — buyer-side Tax-Matched derivation.
// Inversion of the seller pattern: a buyer doesn't provide a tax value,
// so we derive a tax-band from the matched LISTINGS' own
// tax_annual_amount and surface "what tax-band matches your shop window."
//
// Honest sparsity: condo property_type has ~41% null tax in the source
// (probe: W-CHARLIE-BUYER-CHUNK2 STEP 0). Freehold ~73%. Specific buyer
// queries can return as few as 0% with-tax (new builds, $0 assessment).
// When fewer than 3 matched listings carry positive tax, we return
// isEmpty=true and the surface renders an honest empty-state — NEVER
// a single-listing tax pretending to be a band.
//
// Pure function. No React, no DOM. Safe to import on server (plan-email
// route, lead-page renderer) and on client (in-chat ResultsPanel).

export interface BuyerTaxMatchSample {
  listingKey: string | null
  address: string | null
  price: number | null
  tax: number
  bedrooms: number | null
  bathrooms: number | null
  propertySubtype: string | null
  unitNumber: string | null
  media: any[] | null
  /** Optional pre-stamped Charlie slug (server tool stamps `_slug`). */
  _slug: string | null
}

export interface BuyerTaxMatch {
  /** True when the matched-listing set has <3 listings with positive tax.
   *  Surfaces should render an honest empty-state in that case. */
  isEmpty: boolean
  /** Human-readable reason when isEmpty=true (sample-size shortfall). */
  reason: string | null
  /** Median annual tax across matched listings with non-null tax. */
  medianTax: number | null
  /** 25th/75th percentile band — the typical-tax range for the shop window. */
  taxBand: { low: number; high: number } | null
  /** How many of the matched listings had usable tax data. */
  withTaxCount: number
  /** Total matched listings considered. */
  totalCount: number
  /** Up-to-5 samples closest to the median tax, for tile rendering. */
  samples: BuyerTaxMatchSample[]
}

const MIN_WITH_TAX = 3

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]
  const pos = (sorted.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  const next = sorted[base + 1] ?? sorted[base]
  return sorted[base] + rest * (next - sorted[base])
}

/**
 * Derive the buyer Tax-Matched band from a set of matched listings.
 * @param listings raw matched listings (search_listings tool output shape:
 *   tax_annual_amount, list_price, bedrooms_total, unparsed_address,
 *   listing_key, _slug, media, etc.). Field names use snake_case to match
 *   the api/geo-listings LISTING_SELECT shape.
 */
export function deriveBuyerTaxMatch(listings: any[] | null | undefined): BuyerTaxMatch {
  const total = Array.isArray(listings) ? listings.length : 0
  const withTax: Array<{ tax: number; listing: any }> = []

  if (Array.isArray(listings)) {
    for (const l of listings) {
      const raw = l?.tax_annual_amount ?? l?.taxAnnualAmount
      const tax = Number(raw)
      if (Number.isFinite(tax) && tax > 0) {
        withTax.push({ tax, listing: l })
      }
    }
  }

  if (withTax.length < MIN_WITH_TAX) {
    return {
      isEmpty: true,
      reason: total === 0
        ? 'No matched listings yet.'
        : withTax.length === 0
          ? `Tax data isn't populated on the ${total} matched listings (often new builds or pre-assessment).`
          : `Only ${withTax.length} of ${total} matched listings carry tax data — need at least ${MIN_WITH_TAX} for a fair median.`,
      medianTax: null,
      taxBand: null,
      withTaxCount: withTax.length,
      totalCount: total,
      samples: [],
    }
  }

  const sortedTax = withTax.map(x => x.tax).sort((a, b) => a - b)
  const medianTax = quantile(sortedTax, 0.5)
  const low = quantile(sortedTax, 0.25)
  const high = quantile(sortedTax, 0.75)

  // Samples: 5 closest to median, in tax-ascending order for stable display.
  const sortedByCloseness = [...withTax].sort((a, b) => Math.abs(a.tax - medianTax) - Math.abs(b.tax - medianTax))
  const top = sortedByCloseness.slice(0, 5).sort((a, b) => a.tax - b.tax)

  const samples: BuyerTaxMatchSample[] = top.map(({ tax, listing: l }) => ({
    listingKey: l?.listing_key ?? l?.listingKey ?? null,
    address: l?.unparsed_address ?? l?.unparsedAddress ?? null,
    price: typeof l?.list_price === 'number' ? l.list_price : (typeof l?.listPrice === 'number' ? l.listPrice : (l?.close_price ?? null)),
    tax,
    bedrooms: l?.bedrooms_total ?? l?.bedrooms ?? null,
    bathrooms: l?.bathrooms_total_integer ?? l?.bathrooms ?? null,
    propertySubtype: l?.property_subtype ?? l?.propertySubtype ?? null,
    unitNumber: l?.unit_number ?? l?.unitNumber ?? null,
    media: Array.isArray(l?.media) ? l.media : null,
    _slug: l?._slug ?? null,
  }))

  return {
    isEmpty: false,
    reason: null,
    medianTax,
    taxBand: { low, high },
    withTaxCount: withTax.length,
    totalCount: total,
    samples,
  }
}
