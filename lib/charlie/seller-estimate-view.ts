// lib/charlie/seller-estimate-view.ts
//
// W-CHARLIE-CONVERGENCE CV-0 (2026-06-14) — canonical data-shaping helper.
// Given a Charlie lead's plan_data JSONB (as stored on leads.plan_data by
// app/api/charlie/plan-email/route.ts), produces ONE normalized view object
// the three renderers (dashboard CharlieLeadEstimate, in-chat ResultsPanel
// + SellerEstimateBlock, plan email buildRichPlanEmail) will consume in
// CV-1 / CV-2 / CV-3. Single source of truth — renderers can't diverge
// again on which fields exist or what they're named.
//
// Pure: no React, no DOM, no string-HTML. Deterministic. Same plan_data →
// same view. Safe to call server-side, client-side, in scripts, anywhere.
//
// Field sources (verified against lead 63b48f13 at CV-0 RECON step 1):
//   - plan_data.plan                     → planCardGrid + planSummary
//   - plan_data.analytics                → marketIntel + priceByHomeType +
//                                          offerIntel + bestTime +
//                                          priceTrendMonthly + pricingRisk
//   - plan_data.sellerEstimate           → identity + comparables +
//                                          competingListings
//   - plan_data.sellerEstimate.estimate  → priceCard + tierRail + taxMatch
//                                          (+ pricingRisk.estimatedPrice)
//
// CompRow NORMALIZATION (the critical convergence work):
//   GEO comps     are camelCase (closePrice, listingKey, mediaUrl, ...)
//   TAX comps     are camelCase (same shape as geo + per-tile sourceTier)
//   COMPETING     is snake_case (list_price, listing_key, bedrooms_total,
//                                 unparsed_address, living_area_range, ...)
// All three map into the same { address, beds, baths, sqft, dom, price,
// priceKind, listingKey, sourceTier, mediaUrl } shape. Any field missing
// in the source becomes EXPLICIT null in the view — never an invented value
// (Rule Zero).

import type { TierName, TierBestSlot, PathName } from './tier-chip'
import { asTierName } from './tier-chip'

// ─── public types ────────────────────────────────────────────────────────

export type PriceKind = 'close' | 'list'

export interface CanonicalCompRow {
  address: string | null
  beds: number | null
  baths: number | null
  /** Living-area range string ('2000-2500') OR exactSqft as a number. */
  sqft: string | number | null
  dom: number | null
  price: number | null
  priceKind: PriceKind
  listingKey: string | null
  sourceTier: TierName | null
  mediaUrl: string | null
  /** Pre-resolved property page id (CompetingListing carries it; comp/tax don't). */
  id: string | null
}

export interface TierSlotView {
  count: number | null
  median: number | null
  range: { low: number; high: number } | null
}

export interface TierRailView {
  bestGeoTier: TierBestSlot
  slots: {
    platinum: TierSlotView | null
    gold:     TierSlotView | null
    silver:   TierSlotView | null
    bronze:   TierSlotView | null
  }
}

export interface PriceCardView {
  estimatedPrice: number | null
  priceRange: { low: number; high: number } | null
  confidence: string | null
  matchTier: string | null
  marketSpeed: {
    avgDaysOnMarket: number | null
    status: string | null
    message: string | null
  } | null
  currentMarketPrice: number | null
  confidenceMessage: string | null
}

export interface MarketIntelView {
  geoName: string | null
  closedAvgDom90: number | null
  saleToListRatio: number | null
  activeCount: number | null
  closedSaleCount90: number | null
  absorptionRatePct: number | null
  medianPsf: number | null
  monthsOfInventory: number | null
  medianSalePrice: number | null
  domTrendPct: number | null
  psfTrendPct: number | null
}

export interface PriceByHomeTypeRow {
  subtype: string
  count: number | null
  avgDom: number | null
  saleToList: number | null
  medianPrice: number | null
}

export interface OfferIntelView {
  offerAt: number | null          // sale_to_list_ratio
  avgConcession: number | null    // avg_concession_pct
  decideIn: number | null         // closed_avg_dom_90
}

export interface BestTimeView {
  bestMonths: number[]
  worstMonths: number[]
  currentMonth: number | null
  currentMonthRank: number | null
  annualAvgDom: number | null
  annualAvgStl: number | null
  sampleSize: number | null
}

export interface PriceTrendPoint {
  month: string
  value: number
  count: number | null
  partial: boolean | null
}

export interface PlanCardGridView {
  goal: string | null
  geoName: string | null
  timeline: string | null
  propertyType: string | null
  bedrooms: number | null
  budgetMin: number | null
  budgetMax: number | null
  estimatedValueMin: number | null
  estimatedValueMax: number | null
}

export interface PricingRiskView {
  saleToListRatio: number | null
  closedAvgDom90: number | null
  estimatedPrice: number | null
  avgConcessionPct: number | null
}

export interface TaxMatchView {
  count: number
  estimatedPrice: number | null
  priceRange: { low: number; high: number } | null
  bestGeoTier: TierBestSlot
  comparables: CanonicalCompRow[]
}

export interface PresentFlags {
  priceCard: boolean
  tierRail: boolean
  // W-CHARLIE-FINETUNE-FIX (2026-06-14): tax-match anchor rail (P/G/S/B
  // breakdown of taxMatch.tiers). Symmetric to tierRail. Renderers gate
  // a per-surface "Tax-Match Confidence" rail on this flag.
  taxTierRail: boolean
  comparables: boolean
  taxMatch: boolean
  competing: boolean
  marketIntel: boolean
  priceByHomeType: boolean
  offerIntel: boolean
  bestTime: boolean
  planCardGrid: boolean
  planSummary: boolean
  pricingRisk: boolean
}

export interface SellerEstimateView {
  // Identity
  path: PathName
  intent: 'sale' | 'lease'
  subjectAddress: string | null
  buildingName: string | null
  geoLevel: string | null
  geoName: string | null
  // Canonical sections (always shaped; check `present` for whether to render)
  priceCard: PriceCardView
  tierRail: TierRailView
  // W-CHARLIE-FINETUNE-FIX (2026-06-14): tax-match anchor rail. null when
  // taxMatch is absent (legacy / pre-cascade lead) OR when all 4 tier
  // slots are null (cascade ran but no tier qualified). Symmetric to
  // tierRail above; consumed by per-surface "Tax-Match Confidence" rails.
  taxTierRail: TierRailView | null
  marketIntel: MarketIntelView
  priceByHomeType: PriceByHomeTypeRow[]
  offerIntel: OfferIntelView
  bestTime: BestTimeView | null
  priceTrendMonthly: PriceTrendPoint[]
  planCardGrid: PlanCardGridView
  planSummary: string | null
  pricingRisk: PricingRiskView
  comparables: CanonicalCompRow[]
  taxMatch: TaxMatchView | null
  competingListings: CanonicalCompRow[]
  // Render-or-skip flags
  present: PresentFlags
}

// ─── normalizers (Rule Zero: missing → null, never fabricated) ──────────

function num(v: any): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function str(v: any): string | null {
  if (v === null || v === undefined) return null
  return typeof v === 'string' && v.length > 0 ? v : null
}

function priceRange(v: any): { low: number; high: number } | null {
  if (!v || typeof v !== 'object') return null
  const low = num(v.low)
  const high = num(v.high)
  if (low === null || high === null) return null
  return { low, high }
}

function tierSlot(s: any): TierSlotView | null {
  if (!s || typeof s !== 'object') return null
  return {
    count: num(s.count),
    median: num(s.median),
    range: priceRange(s.range),
  }
}

function bestGeoTierOf(v: any): TierBestSlot {
  if (v === 'none') return 'none'
  const t = asTierName(v)
  return t ?? 'none'
}

function normalizeCompRow(c: any, kind: 'geo' | 'tax' | 'competing'): CanonicalCompRow {
  // GEO + TAX use camelCase; COMPETING uses snake_case.
  const address = str(c?.unparsedAddress) ?? str(c?.unparsed_address)
  const beds    = num(c?.bedrooms) ?? num(c?.bedrooms_total)
  const baths   = num(c?.bathrooms) ?? num(c?.bathrooms_total_integer)
  const sqftNum = num(c?.exactSqft)
  const sqft: string | number | null = sqftNum !== null
    ? sqftNum
    : (str(c?.livingAreaRange) ?? str(c?.living_area_range))
  const dom = num(c?.daysOnMarket) ?? num(c?.days_on_market)
  const listingKey = str(c?.listingKey) ?? str(c?.listing_key)
  const mediaUrl   = str(c?.mediaUrl)
  const id         = str(c?.id)
  const sourceTier = asTierName(c?.sourceTier)

  let price: number | null
  let priceKind: PriceKind
  if (kind === 'competing') {
    price = num(c?.list_price) ?? num(c?.listPrice)
    priceKind = 'list'
  } else {
    // sold tile: prefer adjustedPrice, then closePrice, then close_price.
    price = num(c?.adjustedPrice) ?? num(c?.closePrice) ?? num(c?.close_price)
    priceKind = 'close'
  }
  return { address, beds, baths, sqft, dom, price, priceKind, listingKey, sourceTier, mediaUrl, id }
}

// ─── builders per section ───────────────────────────────────────────────

function buildPriceCard(est: any): PriceCardView {
  const ms = est?.marketSpeed
  return {
    estimatedPrice: num(est?.estimatedPrice),
    priceRange:     priceRange(est?.priceRange),
    confidence:     str(est?.confidence),
    matchTier:      str(est?.matchTier),
    marketSpeed: ms ? {
      avgDaysOnMarket: num(ms.avgDaysOnMarket),
      status:          str(ms.status),
      message:         str(ms.message),
    } : null,
    currentMarketPrice: num(est?.currentMarketPrice),
    confidenceMessage:  str(est?.confidenceMessage),
  }
}

function buildTierRail(est: any): TierRailView {
  const t = est?.tiers || {}
  return {
    bestGeoTier: bestGeoTierOf(est?.bestGeoTier),
    slots: {
      platinum: tierSlot(t.platinum),
      gold:     tierSlot(t.gold),
      silver:   tierSlot(t.silver),
      bronze:   tierSlot(t.bronze),
    },
  }
}

function buildTaxMatch(est: any): TaxMatchView | null {
  const tm = est?.taxMatch
  if (!tm || typeof tm !== 'object') return null
  const comps = Array.isArray(tm.comparables) ? tm.comparables : []
  if (comps.length === 0 && (tm.count ?? 0) === 0) return null
  return {
    count: num(tm.count) ?? comps.length,
    estimatedPrice: num(tm.estimatedPrice),
    priceRange: priceRange(tm.priceRange),
    bestGeoTier: bestGeoTierOf(tm.bestGeoTier),
    comparables: comps.map((c: any) => normalizeCompRow(c, 'tax')),
  }
}

function buildMarketIntel(a: any, geoName: string | null): MarketIntelView {
  return {
    geoName,
    closedAvgDom90:   num(a?.closed_avg_dom_90),
    saleToListRatio:  num(a?.sale_to_list_ratio),
    activeCount:      num(a?.active_count),
    closedSaleCount90: num(a?.closed_sale_count_90),
    absorptionRatePct: num(a?.absorption_rate_pct),
    medianPsf:        num(a?.median_psf),
    monthsOfInventory: num(a?.months_of_inventory),
    medianSalePrice:  num(a?.median_sale_price),
    domTrendPct:      num(a?.dom_trend_pct),
    psfTrendPct:      num(a?.psf_trend_pct),
  }
}

function buildPriceByHomeType(a: any): PriceByHomeTypeRow[] {
  const sb = a?.subtype_breakdown
  if (!sb || typeof sb !== 'object') return []
  return Object.keys(sb).map(subtype => {
    const d = sb[subtype] || {}
    return {
      subtype,
      count:        num(d.count),
      avgDom:       num(d.avg_dom),
      saleToList:   num(d.sale_to_list),
      medianPrice:  num(d.median_price),
    }
  })
}

function buildOfferIntel(a: any): OfferIntelView {
  return {
    offerAt:       num(a?.sale_to_list_ratio),
    avgConcession: num(a?.avg_concession_pct),
    decideIn:      num(a?.closed_avg_dom_90),
  }
}

function buildBestTime(a: any): BestTimeView | null {
  const s = a?.insight_seasonal
  if (!s || typeof s !== 'object') return null
  return {
    bestMonths:       Array.isArray(s.best_months)  ? s.best_months.filter((m: any) => Number.isInteger(m))  : [],
    worstMonths:      Array.isArray(s.worst_months) ? s.worst_months.filter((m: any) => Number.isInteger(m)) : [],
    currentMonth:     num(s.current_month),
    currentMonthRank: num(s.current_month_rank),
    annualAvgDom:     num(s.annual_avg_dom),
    annualAvgStl:     num(s.annual_avg_stl),
    sampleSize:       num(s.sample_size),
  }
}

function buildPriceTrendMonthly(a: any): PriceTrendPoint[] {
  const arr = a?.price_trend_monthly
  if (!Array.isArray(arr)) return []
  return arr
    .map((p: any) => {
      const month = str(p?.month)
      const value = num(p?.value)
      if (!month || value === null) return null
      return {
        month,
        value,
        count: num(p?.count),
        partial: typeof p?.partial === 'boolean' ? p.partial : null,
      } as PriceTrendPoint
    })
    .filter((p: PriceTrendPoint | null): p is PriceTrendPoint => p !== null)
}

function buildPlanCardGrid(plan: any, fallbackGeoName: string | null): PlanCardGridView {
  return {
    goal:                str(plan?.goal),
    geoName:             str(plan?.geoName) ?? fallbackGeoName,
    timeline:            str(plan?.timeline),
    propertyType:        str(plan?.propertyType),
    bedrooms:            num(plan?.bedrooms),
    budgetMin:           num(plan?.budgetMin),
    budgetMax:           num(plan?.budgetMax),
    estimatedValueMin:   num(plan?.estimatedValueMin),
    estimatedValueMax:   num(plan?.estimatedValueMax),
  }
}

function buildPricingRisk(a: any, est: any): PricingRiskView {
  return {
    saleToListRatio:  num(a?.sale_to_list_ratio),
    closedAvgDom90:   num(a?.closed_avg_dom_90),
    estimatedPrice:   num(est?.estimatedPrice),
    avgConcessionPct: num(a?.avg_concession_pct),
  }
}

// ─── public entry point ─────────────────────────────────────────────────

/**
 * Build the canonical SellerEstimateView from a plan_data JSONB.
 *
 * Returns `null` when there is no seller content to render
 * (planType !== 'seller' OR plan_data.sellerEstimate is missing).
 *
 * NEVER throws on partial/malformed input — missing fields land as null
 * in the view; `present` flags tell renderers what to show.
 */
export function buildSellerEstimateView(planData: any): SellerEstimateView | null {
  if (!planData || typeof planData !== 'object') return null
  const plan = planData.plan
  const analytics = planData.analytics
  const sellerEstimate = planData.sellerEstimate
  const planType = planData.planType

  // Gate: no seller content → null
  if (planType && planType !== 'seller') return null
  if (!sellerEstimate || typeof sellerEstimate !== 'object') return null

  const est = sellerEstimate.estimate || {}
  const geoName = str(plan?.geoName) ?? null

  const path: PathName = sellerEstimate.path === 'condo' ? 'condo' : 'home'
  const intent: 'sale' | 'lease' = sellerEstimate.intent === 'lease' ? 'lease' : 'sale'

  const comparables = Array.isArray(sellerEstimate.comparables)
    ? sellerEstimate.comparables.map((c: any) => normalizeCompRow(c, 'geo'))
    : []
  const competingListings = Array.isArray(sellerEstimate.competingListings)
    ? sellerEstimate.competingListings.map((c: any) => normalizeCompRow(c, 'competing'))
    : []

  const priceCard       = buildPriceCard(est)
  const tierRail        = buildTierRail(est)
  const taxMatch        = buildTaxMatch(est)
  // W-CHARLIE-FINETUNE-FIX (2026-06-14): tax-match anchor rail built
  // from estimate.taxMatch.tiers + estimate.taxMatch.bestGeoTier — same
  // TierResult shape as the geo cascade (verified on 63b48f13: 4-slot
  // shape with platinum/gold/bronze null + silver populated). Reuses the
  // existing buildTierRail helper by passing a synthetic `est` whose
  // tiers + bestGeoTier come from taxMatch. Returns null when there's no
  // tax cascade output to summarize — gated below in present.taxTierRail.
  const taxTierRail: TierRailView | null = (est?.taxMatch?.tiers || est?.taxMatch?.bestGeoTier)
    ? buildTierRail({ tiers: est.taxMatch.tiers || {}, bestGeoTier: est.taxMatch.bestGeoTier })
    : null
  const marketIntel     = buildMarketIntel(analytics, geoName)
  const priceByHomeType = buildPriceByHomeType(analytics)
  const offerIntel      = buildOfferIntel(analytics)
  const bestTime        = buildBestTime(analytics)
  const priceTrendMonthly = buildPriceTrendMonthly(analytics)
  const planCardGrid    = buildPlanCardGrid(plan, geoName)
  const planSummary     = str(plan?.summary)
  const pricingRisk     = buildPricingRisk(analytics, est)

  // Present flags — honest "is there real data" answers
  const tierRailHasAny =
    tierRail.bestGeoTier !== 'none' ||
    !!(tierRail.slots.platinum || tierRail.slots.gold || tierRail.slots.silver || tierRail.slots.bronze)

  // W-CHARLIE-FINETUNE-FIX (2026-06-14): mirror the tierRail presence
  // rule for the tax rail. Either an anchor or at-least-one non-null
  // slot must be present for the rail to render. When taxMatch itself
  // is null (legacy lead / no cascade), taxTierRail is null and this
  // flag stays false — empty-state pill in the tax-match section
  // already covers that case.
  const taxTierRailHasAny = !!taxTierRail && (
    taxTierRail.bestGeoTier !== 'none' ||
    !!(taxTierRail.slots.platinum || taxTierRail.slots.gold || taxTierRail.slots.silver || taxTierRail.slots.bronze)
  )

  const marketIntelHasAny = (
    marketIntel.closedAvgDom90 !== null ||
    marketIntel.saleToListRatio !== null ||
    marketIntel.activeCount !== null
  )

  const offerIntelHasAny = (
    offerIntel.offerAt !== null ||
    offerIntel.avgConcession !== null ||
    offerIntel.decideIn !== null
  )

  const pricingRiskHasAny = (
    pricingRisk.saleToListRatio !== null &&
    pricingRisk.closedAvgDom90 !== null &&
    pricingRisk.estimatedPrice !== null
  )

  const planCardGridHasAny = (
    planCardGrid.goal !== null ||
    planCardGrid.timeline !== null ||
    planCardGrid.propertyType !== null ||
    planCardGrid.budgetMax !== null ||
    planCardGrid.estimatedValueMax !== null
  )

  const present: PresentFlags = {
    priceCard:       priceCard.estimatedPrice !== null,
    tierRail:        tierRailHasAny,
    taxTierRail:     taxTierRailHasAny,
    comparables:     comparables.length > 0,
    taxMatch:        !!taxMatch && taxMatch.comparables.length > 0,
    competing:       competingListings.length > 0,
    marketIntel:     marketIntelHasAny,
    priceByHomeType: priceByHomeType.length > 0,
    offerIntel:      offerIntelHasAny,
    bestTime:        !!bestTime && (bestTime.bestMonths.length > 0 || bestTime.currentMonth !== null),
    planCardGrid:    planCardGridHasAny,
    planSummary:     planSummary !== null && planSummary.length > 0,
    pricingRisk:     pricingRiskHasAny,
  }

  return {
    path,
    intent,
    subjectAddress:  str(sellerEstimate.subjectAddress),
    buildingName:    str(sellerEstimate.buildingName),
    geoLevel:        str(sellerEstimate.geoLevel),
    geoName,
    priceCard,
    tierRail,
    taxTierRail,
    marketIntel,
    priceByHomeType,
    offerIntel,
    bestTime,
    priceTrendMonthly,
    planCardGrid,
    planSummary,
    pricingRisk,
    comparables,
    taxMatch,
    competingListings,
    present,
  }
}
