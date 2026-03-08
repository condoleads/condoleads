// scripts/lib/analytics-engine.ts
// Core analytics computation engine
// Called by analytics-nightly.ts
// Processes one geo entity at a time — no timeouts possible

import { supabase } from './supabase-client'
import { log, warn, error } from './sync-logger'

const TAG = 'ANALYTICS-ENGINE'

// =====================================================
// CONSTANTS
// =====================================================

export const CONDO_SUBTYPES = [
  'Condo Apartment', 'Condo Townhouse', 'Co-op Apartment',
  'Common Element Condo', 'Leasehold Condo', 'Detached Condo'
]

export const HOMES_SUBTYPES = [
  'Detached', 'Semi-Detached', 'Semi-Detached ',  // note: trailing space exists in DB
  'Att/Row/Townhouse', 'Link', 'Duplex', 'Triplex', 'Fourplex', 'Multiplex'
]

export type GeoType = 'community' | 'municipality' | 'area' | 'neighbourhood' | 'building'
export type Track = 'condo' | 'homes'

const GEO_COLUMN: Record<string, string> = {
  community: 'community_id',
  municipality: 'municipality_id',
  area: 'area_id',
  building: 'building_id'
}

// =====================================================
// DATE HELPERS
// =====================================================

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

// =====================================================
// MATH HELPERS
// =====================================================

function median(arr: number[]): number | null {
  if (!arr.length) return null
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2
}

function avg(arr: number[]): number | null {
  if (!arr.length) return null
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function percentile(arr: number[], p: number): number | null {
  if (!arr.length) return null
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = (p / 100) * (sorted.length - 1)
  const lower = Math.floor(idx)
  const upper = Math.ceil(idx)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower)
}

function round2(n: number | null): number | null {
  return n != null ? Math.round(n * 100) / 100 : null
}

function roundInt(n: number | null): number | null {
  return n != null ? Math.round(n) : null
}

// =====================================================
// SQFT CALCULATION (matches building_psf_transactions logic)
// =====================================================

export function calculateSqft(source: string | null, range: string | null): number {
  if (source) {
    const match = source.match(/(?:^|[^0-9])([1-9][0-9]{2,3})(?:[^0-9]|$)/)
    if (match) {
      const val = parseInt(match[1])
      if (val >= 100 && val <= 5000) return val
    }
  }
  const midpoints: Record<string, number> = {
    '0-499': 400, '500-599': 550, '600-699': 650, '700-799': 750,
    '800-899': 850, '900-999': 950, '1000-1199': 1100, '1200-1399': 1300,
    '1400-1599': 1500, '1600-1799': 1700, '1800-1999': 1900,
    '2000-2249': 2125, '2250-2499': 2375, '2500-2999': 2750
  }
  if (range && midpoints[range]) return midpoints[range]
  if (range && range.startsWith('3000')) return 3250
  return 700
}

export function getSqftMethod(source: string | null, range: string | null): string {
  if (source) {
    const match = source.match(/(?:^|[^0-9])([1-9][0-9]{2,3})(?:[^0-9]|$)/)
    if (match) {
      const val = parseInt(match[1])
      if (val >= 100 && val <= 5000) return 'exact'
    }
  }
  if (range && range !== '') return 'midpoint'
  return 'fallback'
}

// =====================================================
// STAGE 1: PSF POPULATION
// Processes new/unpopulated listings in batches of 500
// =====================================================

export async function populatePSF(): Promise<{ updated: number }> {
  let totalUpdated = 0
  let hasMore = true

  while (hasMore) {
    const { data: records, error: fetchErr } = await supabase
      .from('mls_listings')
      .select('id, square_foot_source, living_area_range, close_price, standard_status, close_date')
      .in('property_subtype', CONDO_SUBTYPES)
      .is('calculated_sqft', null)
      .limit(500)

    if (fetchErr) {
      error(TAG, `PSF fetch error: ${fetchErr.message}`)
      break
    }

    if (!records || records.length === 0) {
      hasMore = false
      break
    }

    // Update each record individually — small batch, fast
    for (const r of records) {
      const sqft = calculateSqft(r.square_foot_source, r.living_area_range)
      const method = getSqftMethod(r.square_foot_source, r.living_area_range)
      const isClosed = r.standard_status === 'Closed'
        && r.close_price > 0
        && r.close_date <= todayStr()
      const psf = isClosed ? Math.round((r.close_price / sqft) * 100) / 100 : null

      await supabase
        .from('mls_listings')
        .update({ calculated_sqft: sqft, sqft_method: method, price_per_sqft: psf })
        .eq('id', r.id)
    }

    totalUpdated += records.length
    if (records.length < 500) hasMore = false
  }

  return { updated: totalUpdated }
}

// =====================================================
// GEO FILTER RESOLVER
// Returns the right filter for any geo level
// =====================================================

async function resolveGeoFilter(
  geoType: GeoType,
  geoId: string
): Promise<{ mode: 'single'; column: string; value: string } | { mode: 'multi'; column: string; values: string[] } | null> {
  if (geoType === 'neighbourhood') {
    const { data: mapping } = await supabase
      .from('municipality_neighbourhoods')
      .select('municipality_id')
      .eq('neighbourhood_id', geoId)
    const ids = (mapping || []).map((r: any) => r.municipality_id).filter(Boolean)
    if (ids.length === 0) return null
    return { mode: 'multi', column: 'municipality_id', values: ids }
  }

  const col = GEO_COLUMN[geoType]
  if (!col) return null
  return { mode: 'single', column: col, value: geoId }
}

// Apply geo filter to a supabase query
function applyGeoFilter(query: any, filter: { mode: string; column: string; value?: string; values?: string[] }): any {
  if (filter.mode === 'single') return query.eq(filter.column, filter.value)
  return query.in(filter.column, filter.values)
}

// =====================================================
// BEDROOM BREAKDOWN
// =====================================================

function computeBedroomBreakdown(listings: any[]): Record<string, any> {
  const groups: Record<string, any[]> = { studio: [], '1br': [], '2br': [], '3br': [] }

  for (const l of listings) {
    const br = l.bedrooms_total
    if (br === 0) groups.studio.push(l)
    else if (br === 1) groups['1br'].push(l)
    else if (br === 2) groups['2br'].push(l)
    else if (br >= 3) groups['3br'].push(l)
  }

  const result: Record<string, any> = {}
  for (const [key, items] of Object.entries(groups)) {
    if (items.length === 0) continue
    const psfs = items.map(l => l.price_per_sqft).filter(p => p != null && p > 100 && p < 10000) as number[]
    const doms = items.map(l => l.days_on_market).filter(d => d != null) as number[]
    const prices = items.map(l => l.close_price).filter(p => p > 0) as number[]
    const stls = items.filter(l => l.close_price > 0 && l.list_price > 50000)
      .map(l => (l.close_price / l.list_price) * 100)

    result[key] = {
      count: items.length,
      median_psf: round2(median(psfs)),
      avg_dom: round2(avg(doms)),
      median_price: roundInt(median(prices)),
      sale_to_list: round2(avg(stls))
    }
  }

  return result
}

// =====================================================
// SUBTYPE BREAKDOWN (HOMES)
// =====================================================

function computeSubtypeBreakdown(listings: any[]): Record<string, any> {
  const groups: Record<string, any[]> = {}

  for (const l of listings) {
    const st = (l.property_subtype || '').trim()
    if (!groups[st]) groups[st] = []
    groups[st].push(l)
  }

  const result: Record<string, any> = {}
  for (const [subtype, items] of Object.entries(groups)) {
    if (items.length === 0) continue
    const prices = items.map((l: any) => l.close_price).filter((p: number) => p > 0)
    const doms = items.map((l: any) => l.days_on_market).filter((d: any) => d != null) as number[]
    const stls = items
      .filter((l: any) => l.close_price > 0 && l.list_price > 50000)
      .map((l: any) => (l.close_price / l.list_price) * 100)

    result[subtype] = {
      count: items.length,
      median_price: roundInt(median(prices)),
      avg_dom: round2(avg(doms)),
      sale_to_list: round2(avg(stls))
    }
  }

  return result
}

// =====================================================
// STAGE 2–5: COMPUTE AND SAVE GEO ANALYTICS
// One entity, one track — called in a loop by orchestrator
// =====================================================

export async function computeAndSaveGeoAnalytics(
  geoType: GeoType,
  geoId: string,
  track: Track
): Promise<boolean> {
  try {
    const subtypes = track === 'condo' ? CONDO_SUBTYPES : HOMES_SUBTYPES
    const geoFilter = await resolveGeoFilter(geoType, geoId)
    if (!geoFilter) return false

    const today_ = todayStr()
    const d30 = daysAgo(30)
    const d90 = daysAgo(90)
    const d365 = daysAgo(365)

    // ── ACTIVE LISTINGS ──
    let activeQuery = supabase
      .from('mls_listings')
      .select('days_on_market, list_price')
      .eq('standard_status', 'Active')
      .eq('available_in_idx', true)
      .in('property_subtype', subtypes)
    activeQuery = applyGeoFilter(activeQuery, geoFilter)

    const { data: activeRaw } = await activeQuery
    const activeListings = activeRaw || []
    const activeCount = activeListings.length
    const activeDoms = activeListings.map((l: any) => l.days_on_market).filter((d: any) => d != null) as number[]
    const activeAvgDom = avg(activeDoms)

    // ── ACTIVE LEASE COUNT ──
    let activeLeaseQuery = supabase
      .from('mls_listings')
      .select('id', { count: 'exact', head: true })
      .eq('standard_status', 'Active')
      .eq('available_in_idx', true)
      .eq('transaction_type', 'For Lease')
      .in('property_subtype', subtypes)
    activeLeaseQuery = applyGeoFilter(activeLeaseQuery, geoFilter)
    const { count: activeLeaseCount } = await activeLeaseQuery

    // ── CLOSED SALES (12 months) ──
    let closedQuery = supabase
      .from('mls_listings')
      .select('close_price, list_price, original_list_price, days_on_market, price_per_sqft, bedrooms_total, parking_total, association_fee, tax_annual_amount, close_date, property_subtype')
      .eq('standard_status', 'Closed')
      .eq('transaction_type', 'For Sale')
      .eq('available_in_vow', true)
      .in('property_subtype', subtypes)
      .gte('close_date', d365)
      .lte('close_date', today_)
    closedQuery = applyGeoFilter(closedQuery, geoFilter)

    const { data: closedRaw } = await closedQuery
    const closedAll = (closedRaw || []).filter((l: any) => l.close_price > 0 && l.list_price > 50000)
    const closed90 = closedAll.filter((l: any) => l.close_date >= d90)
    const closed30 = closedAll.filter((l: any) => l.close_date >= d30)

    // ── DOM ──
    const doms90 = closed90.map((l: any) => l.days_on_market).filter((d: any) => d != null) as number[]
    const doms30 = closed30.map((l: any) => l.days_on_market).filter((d: any) => d != null) as number[]
    const closedAvgDom90 = avg(doms90)
    const closedAvgDom30 = avg(doms30)

    // Prior year same 90d window for DOM trend
    let priorQuery = supabase
      .from('mls_listings')
      .select('days_on_market')
      .eq('standard_status', 'Closed')
      .eq('transaction_type', 'For Sale')
      .in('property_subtype', subtypes)
      .gte('close_date', daysAgo(365 + 90))
      .lt('close_date', daysAgo(365))
    priorQuery = applyGeoFilter(priorQuery, geoFilter)

    const { data: priorRaw } = await priorQuery
    const priorDoms = (priorRaw || []).map((l: any) => l.days_on_market).filter((d: any) => d != null) as number[]
    const priorAvgDom = avg(priorDoms)
    const domTrendPct = closedAvgDom90 && priorAvgDom && priorAvgDom > 0
      ? round2(((closedAvgDom90 - priorAvgDom) / priorAvgDom) * 100)
      : null

    // ── PRICE ──
    const prices90 = closed90.map((l: any) => l.close_price) as number[]
    const psfs90 = closed90
      .map((l: any) => l.price_per_sqft)
      .filter((p: any) => p != null && p > 200 && p < 10000) as number[]

    const medianSalePrice = median(prices90)
    const avgSalePrice = avg(prices90)
    const p25Price = percentile(prices90, 25)
    const p75Price = percentile(prices90, 75)
    const medianPsf = median(psfs90)
    const avgPsf = avg(psfs90)

    // PSF trend vs prior year
    let priorPsfQuery = supabase
      .from('mls_listings')
      .select('price_per_sqft')
      .eq('standard_status', 'Closed')
      .eq('transaction_type', 'For Sale')
      .in('property_subtype', subtypes)
      .gte('close_date', daysAgo(365 + 90))
      .lt('close_date', daysAgo(365))
      .not('price_per_sqft', 'is', null)
    priorPsfQuery = applyGeoFilter(priorPsfQuery, geoFilter)
    const { data: priorPsfRaw } = await priorPsfQuery
    const priorPsfs = (priorPsfRaw || [])
      .map((l: any) => l.price_per_sqft)
      .filter((p: any) => p > 200 && p < 10000) as number[]
    const priorMedianPsf = median(priorPsfs)
    const psfTrendPct = medianPsf && priorMedianPsf && priorMedianPsf > 0
      ? round2(((medianPsf - priorMedianPsf) / priorMedianPsf) * 100)
      : null

    // ── SALE TO LIST + CONCESSIONS ──
    const stlRecords = closed90.filter((l: any) => l.close_price > 0 && l.list_price > 50000)
    const stlValues = stlRecords.map((l: any) => (l.close_price / l.list_price) * 100)
    const avgStl = avg(stlValues)
    const pctOver = stlValues.length ? round2(stlValues.filter(v => v > 100).length / stlValues.length * 100) : null
    const pctUnder = stlValues.length ? round2(stlValues.filter(v => v < 100).length / stlValues.length * 100) : null
    const pctAt = stlValues.length ? round2(stlValues.filter(v => v === 100).length / stlValues.length * 100) : null

    const concessions = stlRecords.filter((l: any) => l.close_price < l.list_price)
    const premiums = stlRecords.filter((l: any) => l.close_price > l.list_price)
    const avgConcessionAmt = avg(concessions.map((l: any) => l.list_price - l.close_price))
    const avgConcessionPct = avg(concessions.map((l: any) => (l.list_price - l.close_price) / l.list_price * 100))
    const avgPremiumAmt = avg(premiums.map((l: any) => l.close_price - l.list_price))
    const avgPremiumPct = avg(premiums.map((l: any) => (l.close_price - l.list_price) / l.list_price * 100))

    // ── PRICE REDUCTION ──
    const validClosed = closed90.filter((l: any) => l.list_price > 50000)
    const reduced = validClosed.filter((l: any) =>
      l.original_list_price > 0 && l.original_list_price > l.list_price
    )
    const priceReductionRate = validClosed.length > 0
      ? round2(reduced.length / validClosed.length * 100) : null
    const avgReductionAmt = avg(reduced.map((l: any) => l.original_list_price - l.list_price))
    const avgReductionPct = avg(reduced.map((l: any) =>
      (l.original_list_price - l.list_price) / l.original_list_price * 100
    ))

    // ── ABSORPTION + MARKET CONDITION ──
    const absorptionRate = activeCount >= 0
      ? round2((closed30.length / Math.max(activeCount, 1)) * 100)
      : null
    const monthsInventory = closed30.length > 0
      ? round2(activeCount / closed30.length)
      : null

    const staleCount = closedAvgDom90
      ? activeListings.filter((l: any) => l.days_on_market > closedAvgDom90 * 1.5).length
      : 0
    const stalePct = activeCount > 0 ? round2(staleCount / activeCount * 100) : null

    // ── LEASE ──
    let leaseQuery = supabase
      .from('mls_listings')
      .select('close_price, price_per_sqft')
      .eq('standard_status', 'Closed')
      .eq('transaction_type', 'For Lease')
      .eq('available_in_vow', true)
      .in('property_subtype', subtypes)
      .gte('close_date', d90)
      .lte('close_date', today_)
    leaseQuery = applyGeoFilter(leaseQuery, geoFilter)

    const { data: leasedRaw } = await leaseQuery
    const leasePrices = (leasedRaw || [])
      .filter((l: any) => l.close_price > 500 && l.close_price < 20000)
      .map((l: any) => l.close_price) as number[]
    const leasePsfs = (leasedRaw || [])
      .filter((l: any) => l.price_per_sqft > 1 && l.price_per_sqft < 20)
      .map((l: any) => l.price_per_sqft) as number[]

    const medianLeasePrice = median(leasePrices)
    const avgLeasePrice = avg(leasePrices)
    const medianLeasePsf = median(leasePsfs)
    const grossYield = medianLeasePrice && medianSalePrice && medianSalePrice > 0
      ? round2((medianLeasePrice * 12) / medianSalePrice * 100)
      : null
    const priceToRent = medianLeasePrice && medianSalePrice && medianLeasePrice > 0
      ? round2(medianSalePrice / (medianLeasePrice * 12))
      : null

    // ── CARRYING COST ──
    const fees = closedAll
      .map((l: any) => l.association_fee)
      .filter((f: any) => f != null && f > 0 && f < 5000) as number[]
    const taxes = closedAll
      .map((l: any) => l.tax_annual_amount)
      .filter((t: any) => t != null && t > 0 && t < 100000) as number[]

    // ── PARKING PREMIUM ──
    const withParking = closed90.filter((l: any) => l.parking_total > 0 && l.price_per_sqft > 200)
    const withoutParking = closed90.filter((l: any) => l.parking_total === 0 && l.price_per_sqft > 200)
    const parkingAvgPsf = avg(withParking.map((l: any) => l.price_per_sqft))
    const noParkingAvgPsf = avg(withoutParking.map((l: any) => l.price_per_sqft))
    const parkingPremiumPsf = parkingAvgPsf && noParkingAvgPsf
      ? round2(parkingAvgPsf - noParkingAvgPsf) : null
    const parkingPremiumPct = parkingPremiumPsf && noParkingAvgPsf
      ? round2(parkingPremiumPsf / noParkingAvgPsf * 100) : null

    // ── NEW LISTINGS 7 DAYS ──
    let newListingsQuery = supabase
      .from('mls_listings')
      .select('id', { count: 'exact', head: true })
      .in('property_subtype', subtypes)
      .gte('listing_contract_date', daysAgo(7))
    newListingsQuery = applyGeoFilter(newListingsQuery, geoFilter)
    const { count: newListings7d } = await newListingsQuery

    // ── BEDROOM BREAKDOWN ──
    const bedroomBreakdown = track === 'condo' ? computeBedroomBreakdown(closed90) : null
    const subtypeBreakdown = track === 'homes' ? computeSubtypeBreakdown(closed90) : null

    // ── UPSERT ──
    const { error: upsertErr } = await supabase
      .from('geo_analytics')
      .upsert({
        geo_type: geoType,
        geo_id: geoId,
        track,
        period: 'rolling_12mo',
        period_type: 'rolling_12mo',

        active_avg_dom: round2(activeAvgDom),
        closed_avg_dom_30: round2(closedAvgDom30),
        closed_avg_dom_90: round2(closedAvgDom90),
        closed_avg_dom_prior_90: round2(priorAvgDom),
        dom_trend_pct: domTrendPct,

        active_count: activeCount,
        active_lease_count: activeLeaseCount || 0,
        closed_sale_count_30: closed30.length,
        closed_sale_count_90: closed90.length,
        closed_sale_count_12mo: closedAll.length,
        closed_lease_count_90: leasedRaw?.length || 0,
        new_listings_7d: newListings7d || 0,

        median_sale_price: roundInt(medianSalePrice),
        avg_sale_price: roundInt(avgSalePrice),
        p25_sale_price: roundInt(p25Price),
        p75_sale_price: roundInt(p75Price),
        median_psf: round2(medianPsf),
        avg_psf: round2(avgPsf),
        psf_trend_pct: psfTrendPct,

        sale_to_list_ratio: round2(avgStl),
        pct_sold_over_ask: pctOver,
        pct_sold_under_ask: pctUnder,
        pct_sold_at_ask: pctAt,
        avg_concession_amount: roundInt(avgConcessionAmt),
        avg_concession_pct: round2(avgConcessionPct),
        avg_premium_amount: roundInt(avgPremiumAmt),
        avg_premium_pct: round2(avgPremiumPct),

        price_reduction_rate_pct: priceReductionRate,
        avg_price_reduction_amt: roundInt(avgReductionAmt),
        avg_price_reduction_pct: round2(avgReductionPct),

        absorption_rate_pct: absorptionRate,
        months_of_inventory: monthsInventory,
        stale_listing_pct: stalePct,

        median_lease_price: roundInt(medianLeasePrice),
        avg_lease_price: roundInt(avgLeasePrice),
        median_lease_psf: medianLeasePsf ? Math.round(medianLeasePsf * 10000) / 10000 : null,
        gross_rental_yield_pct: grossYield,
        price_to_rent_ratio: priceToRent,

        median_maint_fee: round2(median(fees)),
        median_tax_annual: round2(median(taxes)),

        parking_premium_psf: parkingPremiumPsf,
        parking_premium_pct: parkingPremiumPct,

        bedroom_breakdown: bedroomBreakdown,
        subtype_breakdown: subtypeBreakdown,

        transaction_count: closedAll.length,
        low_volume_flag: closedAll.length < 10,
        calculated_at: new Date().toISOString()
      }, { onConflict: 'geo_type,geo_id,track,period,period_type' })

    if (upsertErr) {
      error(TAG, `Upsert failed ${geoType} ${geoId} ${track}: ${upsertErr.message}`)
      return false
    }

    return true
  } catch (err: any) {
    error(TAG, `computeAndSave error ${geoType} ${geoId} ${track}: ${err.message}`)
    return false
  }
}

// =====================================================
// STAGE 6: RANKINGS GENERATION
// Reads from geo_analytics — must run AFTER aggregation
// =====================================================

export async function generateRankingsForGeo(
  parentGeoType: string,
  parentGeoId: string,
  track: Track
): Promise<boolean> {
  try {
    // Determine child geo type and fetch child entities
    let childGeoType: string
    let children: { id: string; name: string; slug: string }[] = []

    if (parentGeoType === 'community') {
      childGeoType = 'building'
      const { data } = await supabase
        .from('buildings')
        .select('id, name, slug')
        .eq('community_id', parentGeoId)
      children = data || []
    } else if (parentGeoType === 'municipality') {
      childGeoType = 'community'
      const { data } = await supabase
        .from('communities')
        .select('id, name, slug')
        .eq('municipality_id', parentGeoId)
      children = data || []
    } else if (parentGeoType === 'area') {
      childGeoType = 'municipality'
      const { data } = await supabase
        .from('municipalities')
        .select('id, name, slug')
        .eq('area_id', parentGeoId)
      children = data || []
    } else if (parentGeoType === 'neighbourhood') {
      childGeoType = 'municipality'
      const { data } = await supabase
        .from('municipality_neighbourhoods')
        .select('municipality_id, municipalities(id, name, slug)')
        .eq('neighbourhood_id', parentGeoId)
      children = (data || []).map((r: any) => r.municipalities).filter(Boolean)
    } else {
      return false
    }

    if (children.length === 0) return true

    // Fetch pre-computed analytics for all children
    const { data: analytics } = await supabase
      .from('geo_analytics')
      .select('geo_id, closed_avg_dom_90, median_psf, median_sale_price, sale_to_list_ratio, active_count, closed_sale_count_90, gross_rental_yield_pct, price_reduction_rate_pct, avg_concession_amount, dom_trend_pct, transaction_count')
      .eq('geo_type', childGeoType)
      .in('geo_id', children.map(c => c.id))
      .eq('track', track)
      .eq('period_type', 'rolling_12mo')

    if (!analytics || analytics.length === 0) return true

    const analyticsMap = new Map(analytics.map((a: any) => [a.geo_id, a]))

    // Build enriched result set — minimum 3 transactions
    const results = children
      .map(child => {
        const a: any = analyticsMap.get(child.id)
        if (!a || (a.transaction_count || 0) < 3) return null
        return {
          entity_id: child.id,
          entity_name: child.name,
          entity_slug: child.slug,
          avg_dom: a.closed_avg_dom_90,
          median_psf: a.median_psf,
          median_price: a.median_sale_price,
          sale_to_list: a.sale_to_list_ratio,
          active_count: a.active_count,
          closed_count_90: a.closed_sale_count_90,
          gross_yield: a.gross_rental_yield_pct,
          price_reduction_rate: a.price_reduction_rate_pct,
          avg_concession_amt: a.avg_concession_amount,
          dom_trend_pct: a.dom_trend_pct,
          transaction_count: a.transaction_count
        }
      })
      .filter(Boolean) as any[]

    if (results.length === 0) return true

    // Define all ranking types with sort functions
    const rankingDefs = [
      {
        type: 'fastest_selling',
        sortFn: (a: any, b: any) => (a.avg_dom ?? 999) - (b.avg_dom ?? 999),
        filter: (r: any) => r.avg_dom != null
      },
      {
        type: 'slowest_moving',
        sortFn: (a: any, b: any) => (b.avg_dom ?? 0) - (a.avg_dom ?? 0),
        filter: (r: any) => r.avg_dom != null
      },
      {
        type: 'best_value',
        sortFn: (a: any, b: any) => (a.median_psf ?? 999999) - (b.median_psf ?? 999999),
        filter: (r: any) => r.median_psf != null
      },
      {
        type: 'premium',
        sortFn: (a: any, b: any) => (b.median_psf ?? 0) - (a.median_psf ?? 0),
        filter: (r: any) => r.median_psf != null
      },
      {
        type: 'best_yield',
        sortFn: (a: any, b: any) => (b.gross_yield ?? 0) - (a.gross_yield ?? 0),
        filter: (r: any) => r.gross_yield != null
      },
      {
        type: 'best_concession_opportunity',
        sortFn: (a: any, b: any) => (b.avg_concession_amt ?? 0) - (a.avg_concession_amt ?? 0),
        filter: (r: any) => r.avg_concession_amt != null
      },
      {
        type: 'highest_price_reduction',
        sortFn: (a: any, b: any) => (b.price_reduction_rate ?? 0) - (a.price_reduction_rate ?? 0),
        filter: (r: any) => r.price_reduction_rate != null
      },
      {
        type: 'strongest_value_migration',
        sortFn: (a: any, b: any) => (a.dom_trend_pct ?? 0) - (b.dom_trend_pct ?? 0), // most improving
        filter: (r: any) => r.dom_trend_pct != null
      }
    ]

    for (const def of rankingDefs) {
      const sorted = results
        .filter(def.filter)
        .sort(def.sortFn)
        .slice(0, 20)
        .map((r, idx) => ({ rank: idx + 1, ...r }))

      await supabase
        .from('geo_rankings')
        .upsert({
          parent_geo_type: parentGeoType,
          parent_geo_id: parentGeoId,
          ranked_entity: childGeoType,
          ranking_type: def.type,
          track,
          results: sorted,
          result_count: sorted.length,
          calculated_at: new Date().toISOString()
        }, { onConflict: 'parent_geo_type,parent_geo_id,ranked_entity,ranking_type,track' })
    }

    return true
  } catch (err: any) {
    error(TAG, `generateRankings error ${parentGeoType} ${parentGeoId}: ${err.message}`)
    return false
  }
}