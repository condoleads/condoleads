// scripts/lib/analytics-engine.ts
// Core analytics computation engine
// Called by analytics-nightly.ts
// Computes all metrics + all 7 preloaded insights per geo entity

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
  'Detached', 'Semi-Detached', 'Semi-Detached ',  // trailing space exists in DB
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

function round2(n: number | null | undefined): number | null {
  return n != null ? Math.round(n * 100) / 100 : null
}

function roundInt(n: number | null | undefined): number | null {
  return n != null ? Math.round(n) : null
}

// =====================================================
// SQFT CALCULATION
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
    if (!records || records.length === 0) { hasMore = false; break }

    for (const r of records) {
      const sqft = calculateSqft(r.square_foot_source, r.living_area_range)
      const method = getSqftMethod(r.square_foot_source, r.living_area_range)
      const isClosed = r.standard_status === 'Closed' && r.close_price > 0 && r.close_date <= todayStr()
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

function applyGeoFilter(query: any, filter: { mode: string; column: string; value?: string; values?: string[] }): any {
  if (filter.mode === 'single') return query.eq(filter.column, filter.value)
  return query.in(filter.column, filter.values)
}

// =====================================================
// PARENT GEO RESOLVER (for value migration insight)
// =====================================================

async function resolveParentGeo(
  geoType: GeoType,
  geoId: string
): Promise<{ parentGeoType: string; parentGeoId: string } | null> {
  if (geoType === 'building') {
    const { data } = await supabase.from('buildings').select('community_id').eq('id', geoId).single()
    if (data?.community_id) return { parentGeoType: 'community', parentGeoId: data.community_id }
  } else if (geoType === 'community') {
    const { data } = await supabase.from('communities').select('municipality_id').eq('id', geoId).single()
    if (data?.municipality_id) return { parentGeoType: 'municipality', parentGeoId: data.municipality_id }
  } else if (geoType === 'municipality') {
    const { data } = await supabase.from('municipalities').select('area_id').eq('id', geoId).single()
    if (data?.area_id) return { parentGeoType: 'area', parentGeoId: data.area_id }
  }
  return null // area and neighbourhood have no higher parent
}

// =====================================================
// BEDROOM BREAKDOWN — includes concession per bedroom
// =====================================================
function computeSqftRangeBreakdown(listings: any[]): Record<string, any> {
  const VALID_RANGES = ['0-499','500-599','600-699','700-799','800-899','900-999','1000-1199','1200-1399','1400-1599','1600-1799','1800-1999','2000-2249','2250-2499']
  const groups: Record<string, any[]> = {}
  for (const range of VALID_RANGES) groups[range] = []
  for (const l of listings) {
    if (!l.living_area_range || !groups[l.living_area_range]) continue
    groups[l.living_area_range].push(l)
  }
  const result: Record<string, any> = {}
  for (const [range, items] of Object.entries(groups)) {
    if (items.length < 5) continue
    const prices = items.map((l: any) => l.close_price).filter((p: any) => p > 50000) as number[]
    const psfs = items.map((l: any) => l.price_per_sqft).filter((p: any) => p > 100 && p < 5000) as number[]
    if (prices.length < 5) continue
    result[range] = {
      count: items.length,
      median_price: roundInt(median(prices)),
      median_psf: psfs.length >= 5 ? round2(median(psfs)) : null
    }
  }
  return result
}

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
    const stlItems = items.filter(l => l.close_price > 0 && l.list_price > 50000)
    const stls = stlItems.map(l => (l.close_price / l.list_price) * 100)
    const concessions = stlItems.filter(l => l.close_price < l.list_price)

    result[key] = {
      count: items.length,
      median_psf: round2(median(psfs)),
      avg_dom: round2(avg(doms)),
      median_price: roundInt(median(prices)),
      sale_to_list: round2(avg(stls)),
      concession_amt: concessions.length ? roundInt(avg(concessions.map(l => l.list_price - l.close_price))) : null,
      concession_pct: concessions.length ? round2(avg(concessions.map(l => (l.list_price - l.close_price) / l.list_price * 100))) : null
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
// INSIGHT 1: SEASONAL TIMING
// Best/worst months to list — grouped by month-of-year
// =====================================================

function computeSeasonalInsight(closedAll: any[]): any | null {
  if (closedAll.length < 12) return null

  const byMonth: Record<number, any[]> = {}
  for (let m = 1; m <= 12; m++) byMonth[m] = []

  for (const l of closedAll) {
    if (!l.close_date) continue
    const month = new Date(l.close_date).getMonth() + 1
    byMonth[month].push(l)
  }

  const allDoms = closedAll.map(l => l.days_on_market).filter(d => d != null) as number[]
  const allStls = closedAll
    .filter(l => l.close_price > 0 && l.list_price > 50000)
    .map(l => (l.close_price / l.list_price) * 100)
  const annualAvgDom = avg(allDoms)
  const annualAvgStl = avg(allStls)
  const annualAvgVolume = closedAll.length / 12

  if (!annualAvgDom || !annualAvgStl) return null

  const monthlyData: any[] = []
  for (let m = 1; m <= 12; m++) {
    const items = byMonth[m]
    if (items.length === 0) continue

    const doms = items.map(l => l.days_on_market).filter(d => d != null) as number[]
    const stls = items
      .filter(l => l.close_price > 0 && l.list_price > 50000)
      .map(l => (l.close_price / l.list_price) * 100)
    const mAvgDom = avg(doms)
    const mAvgStl = avg(stls)

    monthlyData.push({
      month: m,
      volume: items.length,
      avg_dom: round2(mAvgDom),
      avg_stl: round2(mAvgStl),
      dom_vs_annual_pct: mAvgDom && annualAvgDom
        ? round2((mAvgDom - annualAvgDom) / annualAvgDom * 100) : null,
      stl_vs_annual: mAvgStl && annualAvgStl
        ? round2(mAvgStl - annualAvgStl) : null,
      volume_vs_annual_pct: round2((items.length / annualAvgVolume - 1) * 100)
    })
  }

  if (monthlyData.length < 3) return null

  // Rank by DOM ascending (fastest = best to list)
  const ranked = [...monthlyData]
    .filter(m => m.avg_dom != null)
    .sort((a, b) => a.avg_dom - b.avg_dom)

  const bestMonths = ranked.slice(0, 3).map(m => m.month)
  const worstMonths = ranked.slice(-3).map(m => m.month)
  const currentMonth = new Date().getMonth() + 1
  const currentRank = ranked.findIndex(m => m.month === currentMonth) + 1

  return {
    best_months: bestMonths,
    worst_months: worstMonths,
    current_month: currentMonth,
    current_month_rank: currentRank || null,
    annual_avg_dom: round2(annualAvgDom),
    annual_avg_stl: round2(annualAvgStl),
    monthly_data: monthlyData,
    sample_size: closedAll.length
  }
}

// =====================================================
// INSIGHT 2: PRICE REDUCTION — with monthly trend
// =====================================================

function computePriceReductionInsight(closedAll: any[], d90: string): any | null {
  if (closedAll.length === 0) return null

  // Monthly trend
  const byMonth: Record<string, any[]> = {}
  for (const l of closedAll) {
    if (!l.close_date) continue
    const ym = l.close_date.substring(0, 7)
    if (!byMonth[ym]) byMonth[ym] = []
    byMonth[ym].push(l)
  }

  const monthlyTrend = Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, items]) => {
      const valid = items.filter(l => l.list_price > 50000)
      const reduced = valid.filter(l =>
        l.original_list_price > 0 && l.original_list_price > l.list_price
      )
      return {
        month,
        volume: valid.length,
        reduction_rate_pct: valid.length > 0
          ? round2(reduced.length / valid.length * 100) : null,
        avg_reduction_amt: reduced.length > 0
          ? roundInt(avg(reduced.map(l => l.original_list_price - l.list_price))) : null
      }
    })
    .filter(m => m.volume >= 3)

  // 90-day summary
  const valid90 = closedAll.filter(l => l.close_date >= d90 && l.list_price > 50000)
  const reduced90 = valid90.filter(l =>
    l.original_list_price > 0 && l.original_list_price > l.list_price
  )

  return {
    rate_pct_90d: valid90.length > 0
      ? round2(reduced90.length / valid90.length * 100) : null,
    avg_reduction_amt_90d: reduced90.length > 0
      ? roundInt(avg(reduced90.map(l => l.original_list_price - l.list_price))) : null,
    avg_reduction_pct_90d: reduced90.length > 0
      ? round2(avg(reduced90.map(l =>
        (l.original_list_price - l.list_price) / l.original_list_price * 100
      ))) : null,
    monthly_trend: monthlyTrend
  }
}

// =====================================================
// INSIGHT 3: VALUE MIGRATION (async — needs parent lookup)
// Index this geo vs parent geo median PSF
// =====================================================

async function computeValueMigrationInsight(
  geoType: GeoType,
  geoId: string,
  thisMedianPsf: number | null,
  track: Track
): Promise<any | null> {
  if (!thisMedianPsf) return null

  const parent = await resolveParentGeo(geoType, geoId)
  if (!parent) return null

  const { data: parentAnalytics } = await supabase
    .from('geo_analytics')
    .select('median_psf')
    .eq('geo_type', parent.parentGeoType)
    .eq('geo_id', parent.parentGeoId)
    .eq('track', track)
    .eq('period_type', 'rolling_12mo')
    .maybeSingle()

  if (!parentAnalytics?.median_psf) return null

  const indexVsParent = round2(
    ((thisMedianPsf - parentAnalytics.median_psf) / parentAnalytics.median_psf) * 100
  )

  return {
    this_median_psf: thisMedianPsf,
    parent_median_psf: parentAnalytics.median_psf,
    parent_geo_type: parent.parentGeoType,
    index_vs_parent_pct: indexVsParent,
    direction: indexVsParent != null
      ? (indexVsParent > 2 ? 'premium' : indexVsParent < -2 ? 'discount' : 'at_par')
      : null
  }
}

// =====================================================
// INSIGHT 4: BEDROOM DEMAND MISMATCH
// Supply% (active) vs Demand% (closed) by bedroom
// =====================================================

function computeDemandMismatch(activeListings: any[], closed90: any[]): any | null {
  const keys = ['studio', '1br', '2br', '3br']
  const supply: Record<string, number> = { studio: 0, '1br': 0, '2br': 0, '3br': 0 }
  const demand: Record<string, number> = { studio: 0, '1br': 0, '2br': 0, '3br': 0 }

  for (const l of activeListings) {
    const br = l.bedrooms_total
    if (br === 0) supply.studio++
    else if (br === 1) supply['1br']++
    else if (br === 2) supply['2br']++
    else if (br >= 3) supply['3br']++
  }

  for (const l of closed90) {
    const br = l.bedrooms_total
    if (br === 0) demand.studio++
    else if (br === 1) demand['1br']++
    else if (br === 2) demand['2br']++
    else if (br >= 3) demand['3br']++
  }

  const totalSupply = Object.values(supply).reduce((a, b) => a + b, 0)
  const totalDemand = Object.values(demand).reduce((a, b) => a + b, 0)

  if (totalSupply === 0 || totalDemand === 0) return null

  const breakdown: Record<string, any> = {}
  for (const key of keys) {
    const supplyPct = round2(supply[key] / totalSupply * 100)
    const demandPct = round2(demand[key] / totalDemand * 100)
    breakdown[key] = {
      supply_count: supply[key],
      demand_count: demand[key],
      supply_pct: supplyPct,
      demand_pct: demandPct,
      // positive = oversupplied (buyer opportunity), negative = undersupplied (competition)
      mismatch_pct: supplyPct != null && demandPct != null
        ? round2(supplyPct - demandPct) : null
    }
  }

  return {
    total_active: totalSupply,
    total_sold_90: totalDemand,
    breakdown
  }
}

// =====================================================
// INSIGHT 5: INVESTOR RATIO PROXY
// Lease/(sale+lease) as investor proxy
// =====================================================

function computeInvestorRatio(
  leasedRaw: any[] | null,
  closed90: any[],
  activeLeaseCount: number | null
): any | null {
  const leaseCount90 = leasedRaw?.length || 0
  const saleCount90 = closed90.length
  const total = leaseCount90 + saleCount90

  if (total < 5) return null

  return {
    investor_proxy_pct: round2(leaseCount90 / total * 100),
    end_user_pct: round2(saleCount90 / total * 100),
    lease_count_90: leaseCount90,
    sale_count_90: saleCount90,
    active_lease_count: activeLeaseCount || 0
  }
}

// =====================================================
// INSIGHT 6: RE-ENTRY INTELLIGENCE
// Re-listed properties — price change vs original sale
// =====================================================

function computeReentryInsight(closedAll: any[]): any | null {
  if (closedAll.length < 5) return null

  const byAddress: Record<string, any[]> = {}
  for (const l of closedAll) {
    const addr = (l.unparsed_address || '').trim().toLowerCase()
    if (!addr) continue
    if (!byAddress[addr]) byAddress[addr] = []
    byAddress[addr].push(l)
  }

  const reentries = Object.values(byAddress).filter(g => g.length >= 2)

  if (reentries.length === 0) {
    return { reentry_count: 0, reentry_rate_pct: 0, avg_price_change_pct: null, avg_price_change_amt: null }
  }

  const pctChanges: number[] = []
  const amtChanges: number[] = []

  for (const group of reentries) {
    const sorted = [...group].sort((a, b) => a.close_date.localeCompare(b.close_date))
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]
      const curr = sorted[i]
      if (prev.close_price > 0 && curr.close_price > 0) {
        pctChanges.push((curr.close_price - prev.close_price) / prev.close_price * 100)
        amtChanges.push(curr.close_price - prev.close_price)
      }
    }
  }

  return {
    reentry_count: reentries.length,
    total_sold_12mo: closedAll.length,
    reentry_rate_pct: round2(reentries.length / closedAll.length * 100),
    avg_price_change_pct: round2(avg(pctChanges)),
    avg_price_change_amt: roundInt(avg(amtChanges))
  }
}

// =====================================================
// INSIGHT 7: CONCESSION MATRIX BY BEDROOM
// Full concession profile per bedroom type
// =====================================================

function computeConcessionMatrix(stlRecords: any[]): any | null {
  if (stlRecords.length === 0) return null

  const groups: Record<string, any[]> = { studio: [], '1br': [], '2br': [], '3br': [] }

  for (const l of stlRecords) {
    const br = l.bedrooms_total
    if (br === 0) groups.studio.push(l)
    else if (br === 1) groups['1br'].push(l)
    else if (br === 2) groups['2br'].push(l)
    else if (br >= 3) groups['3br'].push(l)
  }

  const result: Record<string, any> = {}
  for (const [key, items] of Object.entries(groups)) {
    if (items.length < 3) continue

    const concessions = items.filter(l => l.close_price < l.list_price)
    const premiums = items.filter(l => l.close_price > l.list_price)
    const atAsk = items.filter(l => l.close_price === l.list_price)

    result[key] = {
      count: items.length,
      pct_with_concession: round2(concessions.length / items.length * 100),
      pct_over_ask: round2(premiums.length / items.length * 100),
      pct_at_ask: round2(atAsk.length / items.length * 100),
      avg_concession_amt: concessions.length
        ? roundInt(avg(concessions.map(l => l.list_price - l.close_price))) : null,
      avg_concession_pct: concessions.length
        ? round2(avg(concessions.map(l => (l.list_price - l.close_price) / l.list_price * 100))) : null,
      avg_premium_amt: premiums.length
        ? roundInt(avg(premiums.map(l => l.close_price - l.list_price))) : null,
      avg_premium_pct: premiums.length
        ? round2(avg(premiums.map(l => (l.close_price - l.list_price) / l.list_price * 100))) : null
    }
  }

  return Object.keys(result).length > 0 ? result : null
}
// =====================================================
// MONTHLY TREND COMPUTATION
// Groups 24mo of closed sales + leases into monthly buckets
// =====================================================

function computeMonthlyTrends(
  closedAll: any[],
  leasedRaw: any[]
): {
  price_trend_monthly: any[]
  dom_trend_monthly: any[]
  volume_trend_monthly: any[]
  lease_trend_monthly: any[]
} {
  const currentMonth = new Date().toISOString().slice(0, 7) // 'YYYY-MM'

  // Group sales by month
  const saleByMonth = new Map<string, { psfs: number[], doms: number[], count: number }>()
  for (const l of closedAll) {
    if (!l.close_date) continue
    const month = l.close_date.slice(0, 7)
    if (!saleByMonth.has(month)) saleByMonth.set(month, { psfs: [], doms: [], count: 0 })
    const bucket = saleByMonth.get(month)!
    bucket.count++
    if (l.price_per_sqft > 200 && l.price_per_sqft < 10000) bucket.psfs.push(l.price_per_sqft)
    if (l.days_on_market != null) bucket.doms.push(l.days_on_market)
  }

  // Group leases by month
  const leaseByMonth = new Map<string, { psfs: number[] }>()
  for (const l of (leasedRaw || [])) {
    if (!l.close_date || !l.calculated_sqft || l.calculated_sqft <= 0) continue
    if (l.close_price < 500 || l.close_price > 20000) continue
    const month = l.close_date.slice(0, 7)
    if (!leaseByMonth.has(month)) leaseByMonth.set(month, { psfs: [] })
    leaseByMonth.get(month)!.psfs.push(l.close_price / l.calculated_sqft)
  }

  const priceTrend: any[] = []
  const domTrend: any[] = []
  const volumeTrend: any[] = []
  const leaseTrend: any[] = []

  for (const [month, data] of Array.from(saleByMonth.entries()).sort()) {
    if (data.count < 3) continue
    const partial = month === currentMonth
    if (data.psfs.length >= 3) {
      priceTrend.push({ month, value: round2(median(data.psfs)), count: data.psfs.length, ...(partial && { partial: true }) })
    }
    if (data.doms.length >= 3) {
      domTrend.push({ month, value: round2(avg(data.doms)), count: data.doms.length, ...(partial && { partial: true }) })
    }
    volumeTrend.push({ month, value: data.count, count: data.count, ...(partial && { partial: true }) })
  }

  for (const [month, data] of Array.from(leaseByMonth.entries()).sort()) {
    if (data.psfs.length < 3) continue
    const partial = month === currentMonth
    leaseTrend.push({ month, value: round2(median(data.psfs)), count: data.psfs.length, ...(partial && { partial: true }) })
  }

  return {
    price_trend_monthly: priceTrend,
    dom_trend_monthly: domTrend,
    volume_trend_monthly: volumeTrend,
    lease_trend_monthly: leaseTrend
  }
}

// =====================================================
// STAGE 2â€"5: COMPUTE AND SAVE GEO ANALYTICS
// =====================================================
// STAGE 2–5: COMPUTE AND SAVE GEO ANALYTICS
// One entity, one track — called by orchestrator
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
    const d730 = daysAgo(730)

    // ── ACTIVE LISTINGS ──
    // NOTE: bedrooms_total added for demand mismatch insight
    let activeQuery = supabase
      .from('mls_listings')
      .select('days_on_market, list_price, bedrooms_total')
      .eq('standard_status', 'Active')
      .eq('available_in_vow', true)
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
      .eq('available_in_vow', true)
      .eq('transaction_type', 'For Lease')
      .in('property_subtype', subtypes)
    activeLeaseQuery = applyGeoFilter(activeLeaseQuery, geoFilter)
    const { count: activeLeaseCount } = await activeLeaseQuery

    // ── CLOSED SALES (12 months) ──
    // NOTE: unparsed_address added for re-entry insight
    let closedQuery = supabase
      .from('mls_listings')
      .select('close_price, list_price, original_list_price, days_on_market, price_per_sqft, bedrooms_total, parking_total, association_fee, tax_annual_amount, close_date, property_subtype, unparsed_address, living_area_range')
      .eq('standard_status', 'Closed')
      .eq('transaction_type', 'For Sale')
      .eq('available_in_vow', true)
      .in('property_subtype', subtypes)
      .gte('close_date', d730)
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
      ? round2(((closedAvgDom90 - priorAvgDom) / priorAvgDom) * 100) : null

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
      ? round2(((medianPsf - priorMedianPsf) / priorMedianPsf) * 100) : null

    // ── SALE TO LIST + CONCESSIONS ──
    const stlRecords = closedAll.filter((l: any) => l.close_price > 0 && l.list_price > 50000)
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
    const validClosed = closedAll.filter((l: any) => l.list_price > 50000)
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
      ? round2((closed30.length / Math.max(activeCount, 1)) * 100) : null
    const monthsInventory = closed30.length > 0
      ? round2(activeCount / closed30.length) : null
    const staleCount = closedAvgDom90
      ? activeListings.filter((l: any) => l.days_on_market > closedAvgDom90 * 1.5).length : 0
    const stalePct = activeCount > 0 ? round2(staleCount / activeCount * 100) : null

    // ── LEASE ──
    let leaseQuery = supabase
      .from('mls_listings')
      .select('close_price, calculated_sqft, close_date')
      .eq('standard_status', 'Closed')
      .eq('transaction_type', 'For Lease')
      .eq('available_in_vow', true)
      .in('property_subtype', subtypes)
      .gte('close_date', d730)
      .lte('close_date', today_)
    leaseQuery = applyGeoFilter(leaseQuery, geoFilter)

    const { data: leasedRaw } = await leaseQuery
    // Snapshot metrics use 90-day window only
    const leased90 = (leasedRaw || []).filter((l: any) => l.close_date >= d90)
    const leasePrices = leased90
      .filter((l: any) => l.close_price > 500 && l.close_price < 20000)
      .map((l: any) => l.close_price) as number[]
    const leasePsfs = leased90
      .filter((l: any) => l.calculated_sqft > 0 && l.close_price > 500)
      .map((l: any) => l.close_price / l.calculated_sqft) as number[]

    const medianLeasePrice = median(leasePrices)
    const avgLeasePrice = avg(leasePrices)
    const medianLeasePsf = median(leasePsfs)
    const grossYield = medianLeasePrice && medianSalePrice && medianSalePrice > 0
      ? round2((medianLeasePrice * 12) / medianSalePrice * 100) : null
    const priceToRent = medianLeasePrice && medianSalePrice && medianLeasePrice > 0
      ? round2(medianSalePrice / (medianLeasePrice * 12)) : null

    // ── CARRYING COST ──
    const fees = closedAll
      .map((l: any) => l.association_fee)
      .filter((f: any) => f != null && f > 0 && f < 5000) as number[]
    const taxes = closedAll
      .map((l: any) => l.tax_annual_amount)
      .filter((t: any) => t != null && t > 0 && t < 100000) as number[]

    // ── PARKING PREMIUM ──
    // Apple-to-apple: compare with/without parking within same $100K price buckets
const parkingBase = closedAll.filter((l: any) => l.price_per_sqft > 200 && l.close_price > 0)
const BUCKET_SIZE = 100000
const parkingPremiums: number[] = []
const psfPremiums: number[] = []
const buckets = new Map<number, { with: number[], without: number[] }>()
for (const l of parkingBase) {
  const bucket = Math.floor(l.close_price / BUCKET_SIZE) * BUCKET_SIZE
  if (!buckets.has(bucket)) buckets.set(bucket, { with: [], without: [] })
  if (l.parking_total > 0) buckets.get(bucket)!.with.push(l.price_per_sqft)
  else buckets.get(bucket)!.without.push(l.price_per_sqft)
}
for (const [, b] of buckets) {
  if (b.with.length >= 3 && b.without.length >= 3) {
    const avgWith = avg(b.with)
    const avgWithout = avg(b.without)
    if (avgWithout > 0) {
      psfPremiums.push(avgWith - avgWithout)
      parkingPremiums.push((avgWith - avgWithout) / avgWithout * 100)
    }
  }
}
const withParking = parkingBase.filter((l: any) => l.parking_total > 0)
const withoutParking = parkingBase.filter((l: any) => l.parking_total === 0)
    const parkingPremiumPsf = psfPremiums.length >= 2 ? round2(avg(psfPremiums)) : null
    const parkingPremiumPct = parkingPremiums.length >= 2 ? round2(avg(parkingPremiums)) : null

    // ── NEW LISTINGS 7 DAYS ──
    let newListingsQuery = supabase
      .from('mls_listings')
      .select('id', { count: 'exact', head: true })
      .in('property_subtype', subtypes)
      .gte('listing_contract_date', daysAgo(7))
    newListingsQuery = applyGeoFilter(newListingsQuery, geoFilter)
    const { count: newListings7d } = await newListingsQuery

    // ── BREAKDOWNS ──
    const bedroomBreakdown = track === 'condo' ? computeBedroomBreakdown(closedAll) : null
    const subtypeBreakdown = track === 'homes' ? computeSubtypeBreakdown(closedAll) : null
    const sqftRangeBreakdown = track === 'condo' ? computeSqftRangeBreakdown(closedAll) : null

    // MONTHLY TRENDS 
    const monthlyTrends = computeMonthlyTrends(closedAll, leasedRaw || [])

    // =====================================================
    // PRELOADED INSIGHTS — all 7 computed here
    // =====================================================

    const insightSeasonal = computeSeasonalInsight(closedAll)

    const insightPriceReduction = computePriceReductionInsight(closedAll, d90)

    // Value migration is async — needs parent geo analytics lookup
    const insightValueMigration = await computeValueMigrationInsight(
      geoType, geoId, medianPsf ?? null, track
    )

    // Demand mismatch only meaningful for condo track (bedroom-based)
    const insightDemandMismatch = track === 'condo'
      ? computeDemandMismatch(activeListings, closed90)
      : null

    const insightInvestorRatio = computeInvestorRatio(leasedRaw, closed90, activeLeaseCount)

    const insightReentry = computeReentryInsight(closedAll)

    // Concession matrix only for condo (bedroom-segmented)
    const insightConcessionMatrix = track === 'condo'
      ? computeConcessionMatrix(stlRecords)
      : null

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
        sqft_range_breakdown: sqftRangeBreakdown,
        subtype_breakdown: subtypeBreakdown,

        // ── 7 PRELOADED INSIGHTS ──
        insight_seasonal: insightSeasonal,
        insight_price_reduction: insightPriceReduction,
        insight_value_migration: insightValueMigration,
        insight_demand_mismatch: insightDemandMismatch,
        insight_investor_ratio: insightInvestorRatio,
        insight_reentry: insightReentry,
        insight_concession_matrix: insightConcessionMatrix,

        price_trend_monthly: monthlyTrends.price_trend_monthly,
        dom_trend_monthly: monthlyTrends.dom_trend_monthly,
        volume_trend_monthly: monthlyTrends.volume_trend_monthly,
        lease_trend_monthly: track === 'condo' ? monthlyTrends.lease_trend_monthly : [],

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

    const { data: analytics } = await supabase
      .from('geo_analytics')
      .select('geo_id, closed_avg_dom_90, median_psf, median_sale_price, sale_to_list_ratio, active_count, closed_sale_count_90, gross_rental_yield_pct, price_reduction_rate_pct, avg_concession_amount, dom_trend_pct, transaction_count, insight_investor_ratio')
      .eq('geo_type', childGeoType)
      .in('geo_id', children.map(c => c.id))
      .eq('track', track)
      .eq('period_type', 'rolling_12mo')

    if (!analytics || analytics.length === 0) return true

    const analyticsMap = new Map(analytics.map((a: any) => [a.geo_id, a]))

    const results = children
      .map(child => {
        const a: any = analyticsMap.get(child.id)
        if (!a || (a.transaction_count || 0) < 3) return null
        const investorPct = a.insight_investor_ratio?.investor_proxy_pct ?? null
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
          investor_rate: investorPct,
          end_user_rate: investorPct != null ? round2(100 - investorPct) : null,
          transaction_count: a.transaction_count
        }
      })
      .filter(Boolean) as any[]

    if (results.length === 0) return true

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
        sortFn: (a: any, b: any) => (a.dom_trend_pct ?? 0) - (b.dom_trend_pct ?? 0),
        filter: (r: any) => r.dom_trend_pct != null
      },
      // NEW: investor/end-user rankings — now powered by insight_investor_ratio
      {
        type: 'most_investor',
        sortFn: (a: any, b: any) => (b.investor_rate ?? 0) - (a.investor_rate ?? 0),
        filter: (r: any) => r.investor_rate != null
      },
      {
        type: 'most_end_user',
        sortFn: (a: any, b: any) => (b.end_user_rate ?? 0) - (a.end_user_rate ?? 0),
        filter: (r: any) => r.end_user_rate != null
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
// =====================================================
// STAGE 8: VALUE MIGRATION SECOND PASS
// Runs AFTER all geo levels are computed so parent rows exist
// Updates insight_value_migration for every geo_analytics row
// =====================================================

export async function updateValueMigrationForAll(
  entities: { id: string; geoType: GeoType; track: Track }[]
): Promise<{ success: number; failed: number }> {
  const stats = { success: 0, failed: 0 }

  for (const { id, geoType, track } of entities) {
    try {
      // Fetch this entity's current median_psf from geo_analytics
      const { data: thisRow } = await supabase
        .from('geo_analytics')
        .select('median_psf')
        .eq('geo_type', geoType)
        .eq('geo_id', id)
        .eq('track', track)
        .eq('period_type', 'rolling_12mo')
        .maybeSingle()

      if (!thisRow?.median_psf) { stats.failed++; continue }

      const insight = await computeValueMigrationInsight(
        geoType, id, thisRow.median_psf, track
      )

      if (!insight) { stats.failed++; continue }

      const { error: updateErr } = await supabase
        .from('geo_analytics')
        .update({ insight_value_migration: insight })
        .eq('geo_type', geoType)
        .eq('geo_id', id)
        .eq('track', track)
        .eq('period_type', 'rolling_12mo')

      if (updateErr) { stats.failed++; continue }
      stats.success++
    } catch {
      stats.failed++
    }
  }

  return stats
}