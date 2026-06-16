// lib/estimator/tax-band-sold-query.ts
//
// W-CHARLIE-BUYER-CHUNK4 (2026-06-15) — shared tax-band SOLD query.
// EXTRACTED from home-comparable-matcher-sales.ts:1242-1292 so the
// BUYER tax-match path consumes the SAME query the SELLER matcher
// uses — single source of truth for "Closed listings whose tax falls
// in a ±TAX_BAND_PCT band, within a tax_year window".
//
// The constants (TAX_BAND_PCT, TAX_MIN_VALUE, TAX_MATCH_DISPLAY_CAP)
// are RE-EXPORTED from this module so both seller and buyer paths
// import them from the same place. The seller's home-comparable-
// matcher-sales.ts continues to use its inline copy of the constants
// + query pattern verbatim (byte-stable for the existing backtest);
// this module DUPLICATES that EXACT code so the BUYER side can call
// it without touching the seller path. Any future change must update
// BOTH files together (lint marker `[shared-with-seller-matcher]`
// in code comments below).

import type { SupabaseClient } from '@supabase/supabase-js'

// ─── CONSTANTS — byte-identical to home-comparable-matcher-sales.ts:323-333 ──
//
// [shared-with-seller-matcher] DO NOT diverge from
// home-comparable-matcher-sales.ts:323-333 without coordinated update.
export const TAX_BAND_PCT = (() => {
  const raw = process.env.TAX_BAND_PCT
  if (raw === undefined) return 0.20
  const v = parseFloat(raw)
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0.20
})()
export const TAX_MIN_VALUE = 500
export const TAX_MATCH_DISPLAY_CAP = 10

export interface TaxBandSoldQueryParams {
  supabase: SupabaseClient
  /** Community to scope the community-pool query. Null skips that pool. */
  communityId: string | null
  /** Municipality to scope the muni-pool query. Required. */
  municipalityId: string
  /** Property subtypes to allow — passed to .in(). */
  subtypes: string[]
  /** Lower tax bound (inclusive). */
  taxLow: number
  /** Upper tax bound (inclusive). */
  taxHigh: number
  /** Lower tax_year (inclusive). */
  yearLo: number
  /** Upper tax_year (inclusive). */
  yearHi: number
  /** Lower close_date bound — typically twoYearsAgo. */
  twoYearsAgoIso: string
  /** Optional upper close_date bound (as-of-date for backtest). */
  asOfDateIso?: string
  /** Optional explicit SELECT list. Default mirrors seller's HOME_SELECT.
   *  Pass when consumer wants extra columns or a slim shape. */
  selectColumns?: string
  /** Optional per-pool LIMIT overrides. Defaults match seller matcher
   *  (community pool 300, muni pool 500). */
  communityLimit?: number
  muniLimit?: number
}

export interface TaxBandSoldQueryResult {
  /** Sales matched from the community pool (sourceTier 'community'-like). */
  commSales: any[]
  /** Sales matched from the muni pool. */
  muniSales: any[]
}

/**
 * Execute the tax-band SOLD query. The two pools (community + muni) are
 * fetched in parallel via Promise.all — independent inputs, mirrors the
 * P-CASCADE-REBUILD pattern at home-comparable-matcher-sales.ts:1247-1292.
 *
 * NOTE: this helper does NOT compute scores, dedup tiers, or stamp
 * sourceTier — that belongs to the consumer (the seller matcher does
 * its own dedup + tier assignment, and the buyer path will do its own).
 * This is the RAW query layer only.
 */
export async function queryTaxBandSolds(params: TaxBandSoldQueryParams): Promise<TaxBandSoldQueryResult> {
  const {
    supabase, communityId, municipalityId, subtypes,
    taxLow, taxHigh, yearLo, yearHi,
    twoYearsAgoIso, asOfDateIso,
    selectColumns = DEFAULT_TAX_BAND_SELECT,
    communityLimit = 300,
    muniLimit = 500,
  } = params

  // [shared-with-seller-matcher] structure mirrors L1253-1292 verbatim.
  let qComm = communityId ? supabase
    .from('mls_listings')
    .select(selectColumns)
    .eq('community_id', communityId)
    .in('property_subtype', subtypes)
    .eq('transaction_type', 'For Sale')
    .eq('standard_status', 'Closed')
    .not('close_price', 'is', null)
    .gt('close_price', 100000)
    .gte('close_date', twoYearsAgoIso)
    .gte('tax_annual_amount', taxLow)
    .lte('tax_annual_amount', taxHigh)
    .gte('tax_year', yearLo)
    .lte('tax_year', yearHi)
    .order('close_date', { ascending: false })
    .limit(communityLimit) : null
  if (qComm && asOfDateIso) qComm = qComm.lt('close_date', asOfDateIso)

  let qMuni = supabase
    .from('mls_listings')
    .select(selectColumns)
    .eq('municipality_id', municipalityId)
    .in('property_subtype', subtypes)
    .eq('transaction_type', 'For Sale')
    .eq('standard_status', 'Closed')
    .not('close_price', 'is', null)
    .gt('close_price', 100000)
    .gte('close_date', twoYearsAgoIso)
    .gte('tax_annual_amount', taxLow)
    .lte('tax_annual_amount', taxHigh)
    .gte('tax_year', yearLo)
    .lte('tax_year', yearHi)
    .order('close_date', { ascending: false })
    .limit(muniLimit)
  if (asOfDateIso) qMuni = qMuni.lt('close_date', asOfDateIso)

  const [commSales, muniSales] = await Promise.all([
    qComm ? qComm.then((r: any) => r.data || []) : Promise.resolve([] as any[]),
    qMuni.then((r: any) => r.data || []),
  ])

  // W-CHARLIE-TAXMATCH-PHOTOS (2026-06-16) — additive media-table join.
  // Mirrors app/api/geo-listings/route.ts:128-147 verbatim: the listing
  // SELECT above intentionally has no media column (none exists on
  // mls_listings); thumbnails live in a separate `media` table joined
  // on listing_id. Without this step, buyer Tax-Matched tiles render
  // the placeholder house icon on all 3 surfaces even though 99.9% of
  // Closed Whitby listings carry a thumbnail.
  //
  // This step is ADDITIVE ONLY: row count, row order, and every scoring
  // column on the rows are untouched. Each row gains a `media` property
  // (array of {media_url} or empty). The seller home/condo matchers do
  // NOT import this helper (they have their own inline copy of the
  // query in home-comparable-matcher-sales.ts / condo-comparable-
  // matcher-sales.ts), so they are unaffected.
  const allListingIds: string[] = []
  for (const r of commSales) if (r?.id) allListingIds.push(r.id)
  for (const r of muniSales) if (r?.id) allListingIds.push(r.id)
  if (allListingIds.length > 0) {
    // W-CHARLIE-INCHAT-CONVERGENCE (2026-06-16) — CHUNK the .in() lookup.
    // The W-CHARLIE-INCHAT-CONVERGENCE verify surfaced a latent bug in
    // the original a589f10 single-shot .in(allListingIds, ...) call:
    // a wide-pool buyer (e.g. backfilled Whitby Active + the muni pool
    // limit=500 SOLD comps in band) sends a ~18 KB URI to Supabase,
    // exceeds PostgREST's transport limit, and the request throws
    // `TypeError: fetch failed`. The original code destructured only
    // `data`, so the error was swallowed and every comp's media stayed
    // empty (silent placeholder regression in email + lead + in-chat).
    //
    // Fix: paginate the .in() over CHUNK_SIZE-sized batches and union
    // the responses into a single thumbnailMap. Strictly additive — no
    // change to row count, row order, or which media each comp resolves
    // to (the FIRST media_url per listing_id in order_number ASC, same
    // as before).
    const CHUNK_SIZE = 200
    const thumbnailMap: Record<string, string> = {}
    for (let i = 0; i < allListingIds.length; i += CHUNK_SIZE) {
      const chunk = allListingIds.slice(i, i + CHUNK_SIZE)
      const { data: mediaRows, error: mediaErr } = await supabase
        .from('media')
        .select('listing_id, media_url, order_number')
        .in('listing_id', chunk)
        .eq('variant_type', 'thumbnail')
        .order('order_number', { ascending: true })
      if (mediaErr) {
        console.warn('[tax-band-sold-query] media chunk lookup failed', { offset: i, size: chunk.length, error: mediaErr.message })
        continue
      }
      for (const m of mediaRows || []) {
        if (!thumbnailMap[m.listing_id]) thumbnailMap[m.listing_id] = m.media_url
      }
    }
    for (const r of commSales) {
      r.media = thumbnailMap[r.id]
        ? [{ media_url: thumbnailMap[r.id], variant_type: 'thumbnail', order_number: 0 }]
        : []
    }
    for (const r of muniSales) {
      r.media = thumbnailMap[r.id]
        ? [{ media_url: thumbnailMap[r.id], variant_type: 'thumbnail', order_number: 0 }]
        : []
    }
  }

  return { commSales, muniSales }
}

/** Slim default SELECT covering everything the buyer tile renderer + the
 *  seller score function need. Mirrors HOME_SELECT in home-comparable-
 *  matcher-sales.ts at columns the matcher actually reads. */
const DEFAULT_TAX_BAND_SELECT =
  'id, listing_key, listing_id, unparsed_address, list_price, close_price, close_date, ' +
  'bedrooms_total, bathrooms_total_integer, days_on_market, property_type, property_subtype, ' +
  'unit_number, tax_annual_amount, tax_year, living_area_range, square_foot_source, ' +
  'community_id, municipality_id, building_area_total, lot_size_area, garage_type, garage_yn'
