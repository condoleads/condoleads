// lib/estimator/condo-comparable-matcher-sales.ts
// c2 (2026-06-10) — System 2 condo SALE comparable matcher.
//
// Mirror of condo-comparable-matcher-rentals.ts (c1) on the SALE side, with
// SALE-specific signals layered in:
//   - h8 tax similarity score band (SALE-only; tax 100% on condo sale,
//     0% on lease — same gating logic as homes h8).
//   - Maintenance-$/sqft sliding band (replaces the existing MAINT ±20%-$
//     tier; condo SALE has 100% assoc_fee + 100% living_area_range fill
//     so PSF is computable for every comp).
//   - Parking SALE adjustment via the S2 resolver (which reads the
//     correct parking_sale_weighted_avg column, not the broken
//     parking_sale_calculated the shared resolver reads).
//
// Geo cascade (locked v1): Platinum=Building → Gold=Community → Silver=Muni
// → Bronze=Area. Within-Platinum uses the existing within-building 7-tier
// model (BINGO/RANGE/MAINT). Within Gold/Silver/Bronze uses sqft-range +
// bed + bath + score-nudge reordering. Building-less subjects (5% recent
// SALE cohort with building_id=null) skip Platinum and start at Gold.
//
// Env knobs:
//   CONDO_SALE_TAX_BAND_PCT       (default 0.20 — same as homes h8)
//   CONDO_SALE_MAINT_PSF_BAND_PCT (default 0.20)
//   CONDO_SALE_TAX_WEIGHT         (default 15 — ships per c2 sweep: +3.0pp ±15)
//   CONDO_SALE_MAINT_PSF_WEIGHT   (default 0 — DROPPED per c2 sweep: regresses
//                                  ±15 by 1.0pp when stacked with tax. Knob
//                                  kept for forward sweep work; silent-omit
//                                  at default 0.)
// PLATINUM FIRING (LOCKED MODEL, REAFFIRMED 2026-06-10): a single same-
// building comp (>= 1) fires Platinum and WINS on pricing. Buildings are
// the foundational unit of condo valuation — a same-building comp is the
// most relevant comp regardless of count. The c2-follow-on threshold
// (CONDO_SALE_PLATINUM_MIN_COMPS, default 7 from 41afbd0) optimized
// aggregate ±15 by skipping the most-relevant comp for ~93% of subjects
// — that deviation has been REVERTED. The backtest does NOT override the
// locked design.
//
// Silent-omit on every signal: subject missing tax → tax band skips;
// subject missing assoc_fee → maint-psf band skips. Un-plumbed callers
// get the deterministic pre-c2 behavior on those signals.

import { createClient } from '@/lib/supabase/client'
import {
  ComparableSale,
  UnitSpecs,
  PriceAdjustment,
  MatchTier,
  TierResult,
  extractExactSqft,
  assignTemperature,
  isMaintenanceMatch,
} from './types'
import { resolveCondoAdjustments, type ResolvedCondoAdjustments } from './resolve-condo-adjustments'

export interface CondoSaleSpecs extends UnitSpecs {
  communityId?: string | null
  municipalityId?: string | null
  areaId?: string | null
  subjectTaxAnnualAmount?: number | null
  subjectTaxYear?: number | null
  tenantId?: string | null
}

export interface CondoSaleMatchResult {
  tier: MatchTier
  comparables: ComparableSale[]
  geoLevel: 'building' | 'community' | 'municipality' | 'area' | 'none'
  // W-CONDO-MODAL-PARITY Phase 1 (display-only, no pricing change):
  // emit all four geo-tier pools as TierResult context so the Geographic
  // Confidence Spread can render. Condo Platinum maps to BUILDING (not
  // street, as on homes). Best-tier resolution + priced output below are
  // BYTE-IDENTICAL to pre-Phase-1 behavior — these fields are additive.
  tiers?: {
    platinum: TierResult | null   // same-building pool
    gold:     TierResult | null   // community pool
    silver:   TierResult | null   // municipality pool
    bronze:   TierResult | null   // area pool
  }
  bestGeoTier?: 'platinum' | 'gold' | 'silver' | 'bronze' | 'none'

  // W-TAX-MATCH (2026-06-11): tax-as-match-criterion result set, additive.
  // W-TAX-MATCH b1 (2026-06-11): `comparables` is now the MULTI-TIER DISPLAY
  // list (concatenated across tiers, sourceTier-stamped, deduped by
  // listingKey keeping tightest tier, capped at TAX_MATCH_DISPLAY_CAP).
  // `winnerComparables` is the WINNING-TIER-ONLY list used by the action
  // for calculateEstimate — preserving the N=200 backtest (8.4% median APE).
  // `count` = winnerComparables.length (the count used to size the section
  // header — operator's intent is the "number of tax-matched comps shown"
  // which still anchors on the winning tier; the broader display list is
  // additional context).
  // Empty when subject has no usable tax fields or no comps fall in the
  // band on any tier.
  taxMatch?: {
    matchTier:         MatchTier
    comparables:       ComparableSale[]    // multi-tier display list
    winnerComparables: ComparableSale[]    // winning-tier-only, for pricing
    count:             number
    tiers?: {
      platinum: TierResult | null
      gold:     TierResult | null
      silver:   TierResult | null
      bronze:   TierResult | null
    }
    bestGeoTier?: 'platinum' | 'gold' | 'silver' | 'bronze' | 'none'
  }
}

const CONDO_SALE_SELECT = `id, listing_key, close_price, list_price, bedrooms_total,
  bathrooms_total_integer, living_area_range, parking_total, locker,
  days_on_market, close_date, square_foot_source, association_fee,
  tax_annual_amount, tax_year, unparsed_address, unit_number,
  building_id, community_id, municipality_id`

// Env knobs
const TAX_BAND_PCT = (() => {
  const v = parseFloat(process.env.CONDO_SALE_TAX_BAND_PCT || '0.20')
  return Number.isFinite(v) && v > 0 ? v : 0.20
})()
const MAINT_PSF_BAND_PCT = (() => {
  const v = parseFloat(process.env.CONDO_SALE_MAINT_PSF_BAND_PCT || '0.20')
  return Number.isFinite(v) && v > 0 ? v : 0.20
})()
const TAX_WEIGHT = (() => {
  const v = parseFloat(process.env.CONDO_SALE_TAX_WEIGHT || '15')
  return Number.isFinite(v) && v >= 0 ? v : 15
})()
const MAINT_PSF_WEIGHT = (() => {
  const v = parseFloat(process.env.CONDO_SALE_MAINT_PSF_WEIGHT || '0')
  return Number.isFinite(v) && v >= 0 ? v : 0
})()
// Platinum firing threshold: locked at 1 (a single same-building comp wins).
// The CONDO_SALE_PLATINUM_MIN_COMPS env knob from 41afbd0 has been removed —
// it deviated from the locked Platinum=building model by optimizing aggregate
// ±15 at the cost of skipping the most-relevant comp.
const TAX_FLOOR = 500
const TAX_YEAR_DELTA_MAX = 1

// h8 tax similarity (SALE only). Same-muni gated, ±1 tax_year, >$500 floor,
// silent-omit. Sliding 0→WEIGHT pts.
function taxSimilarityScore(sale: any, specs: CondoSaleSpecs): number {
  if (TAX_WEIGHT <= 0) return 0
  const subjTax = specs.subjectTaxAnnualAmount
  const subjYear = specs.subjectTaxYear
  if (!subjTax || subjTax <= TAX_FLOOR) return 0
  if (subjYear == null) return 0
  if (!sale.municipality_id || !specs.municipalityId) return 0
  if (sale.municipality_id !== specs.municipalityId) return 0
  const compTax = sale.tax_annual_amount
  if (compTax == null || compTax <= TAX_FLOOR) return 0
  const compYear = sale.tax_year
  if (compYear == null) return 0
  if (Math.abs(compYear - subjYear) > TAX_YEAR_DELTA_MAX) return 0
  const fracDiff = Math.abs(compTax - subjTax) / subjTax
  if (fracDiff >= TAX_BAND_PCT) return 0
  const closeness = 1 - (fracDiff / TAX_BAND_PCT)
  return TAX_WEIGHT * closeness
}

// Maintenance-$/sqft sliding band (SALE only). Both subject + comp must have
// assoc_fee + sqft (LAR midpoint OK). Silent-omit otherwise.
function maintenancePsfScore(sale: any, specs: CondoSaleSpecs): number {
  if (MAINT_PSF_WEIGHT <= 0) return 0
  const subjFee = specs.associationFee
  if (!subjFee || subjFee <= 0) return 0
  const subjSqft = specs.exactSqft || rangeMidpoint(specs.livingAreaRange)
  if (!subjSqft || subjSqft <= 0) return 0
  const compFee = sale.association_fee
  if (!compFee || compFee <= 0) return 0
  const compSqft = extractExactSqft(sale.square_foot_source) || rangeMidpoint(sale.living_area_range)
  if (!compSqft || compSqft <= 0) return 0
  const subjPsf = subjFee / subjSqft
  const compPsf = compFee / compSqft
  if (subjPsf <= 0) return 0
  const fracDiff = Math.abs(compPsf - subjPsf) / subjPsf
  if (fracDiff >= MAINT_PSF_BAND_PCT) return 0
  const closeness = 1 - (fracDiff / MAINT_PSF_BAND_PCT)
  return MAINT_PSF_WEIGHT * closeness
}

function rangeMidpoint(range?: string | null): number | null {
  if (!range) return null
  const m = range.match(/^(\d+)-(\d+)$/)
  if (!m) return null
  return (parseInt(m[1]) + parseInt(m[2])) / 2
}

// W-CONDO-MODAL-PARITY Phase 1: median + min/max range over a raw pool's
// close_price. Pure. Display context — never feeds the priced top-level
// number (that still flows through calculateEstimate on the chosen tier's
// comparables).
function medianRangeOf(prices: number[]): { median: number; range: { low: number; high: number } } {
  if (prices.length === 0) return { median: 0, range: { low: 0, high: 0 } }
  const sorted = [...prices].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
  return {
    median: Math.round(median),
    range: { low: Math.round(sorted[0]), high: Math.round(sorted[sorted.length - 1]) },
  }
}

// Build a TierResult for one geo tier's pool + its matched comparables.
// Used per-tier so the display layer (Geographic Confidence Spread) can
// render all four. Returns null when the pool is empty OR the within-tier
// matcher produced zero comparables (the tier has no display data).
//
// `pool` is the post-query (and, on lease, post-gate) row set whose
// close_prices feed the median/range display. `matched` is the priced
// comparables that the within-tier match function returned — those are
// what the user sees in the Comparables list when this tier wins.
// W-CONDO-MODAL-PARITY follow-up (2026-06-11): attach a thumbnail mediaUrl
// to each SELECTED comparable so the condo comp tile can render a photo.
// Verbatim port of home-comparable-matcher-sales.ts:713-727 (same `media`
// table, same variant_type='thumbnail' + order_number=0, same single
// batched .in(listing_id, ids) query — NOT N+1). Called only on the top-N
// selected raw sales (post-scoring, post-slice) so it cannot influence
// selection, scoring, or pricing — strictly enrichment.
async function attachMediaUrls(sales: any[]): Promise<any[]> {
  if (!sales || sales.length === 0) return sales
  const ids = sales.map(s => s.id).filter(Boolean)
  if (ids.length === 0) return sales
  const supabase = createClient()
  const { data: media } = await supabase
    .from('media')
    .select('listing_id, media_url')
    .in('listing_id', ids)
    .eq('variant_type', 'thumbnail')
    .eq('order_number', 0)
  const map: Record<string, string> = {}
  ;(media || []).forEach((m: any) => { map[m.listing_id] = m.media_url })
  return sales.map(s => ({ ...s, mediaUrl: map[s.id] || null }))
}

function buildCondoTierResult(
  pool: any[],
  matched: ComparableSale[],
): TierResult | null {
  if (!pool || pool.length === 0) return null
  if (!matched || matched.length === 0) return null
  const prices = pool
    .map((s: any) => parseFloat(s.close_price))
    .filter((p: number) => Number.isFinite(p) && p > 0)
  const mr = medianRangeOf(prices)
  // bestMatchScore on condo isn't part of the existing scoring pipeline
  // (the within-Platinum sub-tier model is structural, not scored; the
  // cross-building match uses scoreSim but doesn't surface the top score
  // through). Use 100 as a neutral default that matches calculateEstimate's
  // FALLBACK_SCORE — keeps any downstream score-driven UI honest about
  // "we don't have a precise per-comp score for condos."
  return {
    comparables: matched,
    count: pool.length,
    median: mr.median,
    range: mr.range,
    bestMatchScore: 100,
  }
}

// W-TAX-MATCH (2026-06-11): tax-band membership predicate. Reuses the
// existing h8 taxSimilarityScore as a SELECTOR: same-muni gate, +/-1
// tax_year, +/-20% tax band, $500 floor — all checks already implemented
// inside taxSimilarityScore. Returns true iff the comp falls inside the
// band; false otherwise (including when subject tax/year/muni is missing,
// because the scorer short-circuits to 0 in those cases).
function withinTaxBand(sale: any, specs: CondoSaleSpecs): boolean {
  return taxSimilarityScore(sale, specs) > 0
}

// W-TAX-MATCH (2026-06-11): tax-mode geo cascade. Sibling to the geo
// cascade in findCondoComparablesSales. Queries the SAME 4 geo pools
// (building/community/muni/area), filters EACH by withinTaxBand BEFORE
// handing to the existing match functions (which then do bed+bath+LAR +
// top-N scoring tail unchanged). Tier display via the same
// buildCondoTierResult(condoComparabilityFilter(...)) helpers — both
// pool-agnostic.
//
// W-TAX-MATCH b1 (2026-06-11): cascade now runs ALL tier matches (no
// early-return), determines winner by priority (Platinum >=1 / Gold|Silver
// >=3, mirroring geo), AND builds a multi-tier DISPLAY list:
//   - concatenate platinum + gold + silver comps in priority order
//   - stamp each with sourceTier
//   - dedup by listingKey, keeping the TIGHTEST tier (platinum > gold > silver)
//   - cap at TAX_MATCH_DISPLAY_CAP (12)
// Returns winnerComparables (winning-tier-only, for action's calculateEstimate
// — preserves backtest) AND comparables (multi-tier display list with
// sourceTier).
//
// Tax-mode is muni-gated by the h8 same-muni rule, so silver IS the widest
// geo this mode reaches. Bronze (area) would only ever match same-muni rows
// anyway; folding it in adds nothing the silver query doesn't already see.
// Skip bronze in tax-mode — the silver query is the full muni reach.
// P-CASCADE-REBUILD (2026-06-12): cap lowered 12 -> 10 for parity with the
// geo-comps section's top-10 slice (operator-locked display rule: <=10 per
// section). winnerComparables (pricing) is independent of this cap.
const TAX_MATCH_DISPLAY_CAP = 10
async function runTaxMatchCascade(
  supabase: any,
  specs: CondoSaleSpecs,
  sinceISO: string,
  customValues: ResolvedCondoAdjustments,
): Promise<CondoSaleMatchResult['taxMatch']> {
  // Short-circuit when the h8 gate would never fire: no subject tax / year /
  // muni means withinTaxBand always returns false; no point querying.
  const subjTax = specs.subjectTaxAnnualAmount
  if (!subjTax || subjTax <= 500) return undefined
  if (specs.subjectTaxYear == null) return undefined
  if (!specs.municipalityId) return undefined

  // W-TAX-MATCH CONDO fix (2026-06-12): SQL-level tax-band pre-filter on the
  // community + muni pool queries so .limit applies AFTER the band, not
  // before. Same bug class as the home matcher: .order(close_date desc).
  // limit(N) executed BEFORE the JS withinTaxBand filter; for sparse-band
  // subjects (luxury condos in dense munis), viable band comps ranked
  // outside the most-recent N got truncated by recency. Fix: add band +
  // tax_year window to the Supabase query. withinTaxBand JS gate retained
  // as the precision filter. Tax cascade only; geo cascade unchanged.
  const taxLow = subjTax * (1 - TAX_BAND_PCT)
  const taxHigh = subjTax * (1 + TAX_BAND_PCT)
  const yearLo = specs.subjectTaxYear - 1
  const yearHi = specs.subjectTaxYear + 1

  // P-CASCADE-REBUILD (2026-06-12): parallelize tax cascade Pt+Gd+Sv queries
  // via Promise.all. All three queries are independent. Tax-band SQL pre-
  // filter unchanged (already pushed by the 6/12 W12955302 fix).
  const qTaxPlatinum = specs.buildingId ? supabase
    .from('mls_listings').select(CONDO_SALE_SELECT)
    .eq('building_id', specs.buildingId)
    .eq('transaction_type', 'For Sale').eq('standard_status', 'Closed')
    .not('close_price', 'is', null).gt('close_price', 100000)
    .gte('close_date', sinceISO).order('close_date', { ascending: false }) : null

  const qTaxGold = specs.communityId ? supabase
    .from('mls_listings').select(CONDO_SALE_SELECT)
    .eq('community_id', specs.communityId)
    .eq('transaction_type', 'For Sale').eq('standard_status', 'Closed')
    .not('close_price', 'is', null).gt('close_price', 100000)
    .gte('close_date', sinceISO)
    .gte('tax_annual_amount', taxLow)
    .lte('tax_annual_amount', taxHigh)
    .gte('tax_year', yearLo)
    .lte('tax_year', yearHi)
    .order('close_date', { ascending: false }).limit(300) : null

  const qTaxSilver = specs.municipalityId ? supabase
    .from('mls_listings').select(CONDO_SALE_SELECT)
    .eq('municipality_id', specs.municipalityId)
    .eq('transaction_type', 'For Sale').eq('standard_status', 'Closed')
    .not('close_price', 'is', null).gt('close_price', 100000)
    .gte('close_date', sinceISO)
    .gte('tax_annual_amount', taxLow)
    .lte('tax_annual_amount', taxHigh)
    .gte('tax_year', yearLo)
    .lte('tax_year', yearHi)
    .order('close_date', { ascending: false }).limit(500) : null

  const [bldgSales, commSalesTax, muniSalesTax] = await Promise.all([
    qTaxPlatinum ? qTaxPlatinum.then((r: any) => r.data || []) : Promise.resolve([] as any[]),
    qTaxGold     ? qTaxGold.then((r: any) => r.data || [])     : Promise.resolve([] as any[]),
    qTaxSilver   ? qTaxSilver.then((r: any) => r.data || [])   : Promise.resolve([] as any[]),
  ])

  let platinumMatch: { tier: MatchTier; comparables: ComparableSale[] } | null = null
  let platinumTier: TierResult | null = null
  if (bldgSales.length > 0) {
    const banded = bldgSales.filter((s: any) => withinTaxBand(s, specs))
    if (banded.length > 0) {
      platinumMatch = await matchWithinBuilding(banded, specs, customValues)
      platinumTier  = buildCondoTierResult(condoComparabilityFilter(banded, specs), platinumMatch.comparables)
    }
  }

  let goldMatch: { tier: MatchTier; comparables: ComparableSale[] } | null = null
  let goldTier: TierResult | null = null
  if (commSalesTax.length > 0) {
    const banded = commSalesTax.filter((s: any) => withinTaxBand(s, specs))
    if (banded.length > 0) {
      goldMatch = await matchAcrossBuildings(banded, specs, customValues)
      goldTier  = buildCondoTierResult(condoComparabilityFilter(banded, specs), goldMatch.comparables)
    }
  }

  let silverMatch: { tier: MatchTier; comparables: ComparableSale[] } | null = null
  let silverTier: TierResult | null = null
  if (muniSalesTax.length > 0) {
    const banded = muniSalesTax.filter((s: any) => withinTaxBand(s, specs))
    if (banded.length > 0) {
      silverMatch = await matchAcrossBuildings(banded, specs, customValues)
      silverTier  = buildCondoTierResult(condoComparabilityFilter(banded, specs), silverMatch.comparables)
    }
  }

  const tiers = { platinum: platinumTier, gold: goldTier, silver: silverTier, bronze: null }

  // Determine winner by priority: Platinum >=1, Gold/Silver >=3. Same as geo.
  let winnerMatch: { tier: MatchTier; comparables: ComparableSale[] } | null = null
  let bestGeoTier: 'platinum' | 'gold' | 'silver' | 'none' = 'none'
  if (platinumMatch && platinumMatch.comparables.length >= 1) {
    winnerMatch = platinumMatch
    bestGeoTier = 'platinum'
  } else if (goldMatch && goldMatch.comparables.length >= 3) {
    winnerMatch = goldMatch
    bestGeoTier = 'gold'
  } else if (silverMatch && silverMatch.comparables.length >= 3) {
    winnerMatch = silverMatch
    bestGeoTier = 'silver'
  } else {
    return undefined
  }

  // Build multi-tier DISPLAY list. Priority order = tightest tier first
  // (platinum -> gold -> silver). Stamp sourceTier on each. Dedup by
  // listingKey, KEEPING THE FIRST OCCURRENCE — which by priority order is
  // the tightest tier the comp appears in.
  const stamp = (
    arr: ComparableSale[] | undefined,
    tier: 'platinum' | 'gold' | 'silver',
  ): ComparableSale[] => (arr || []).map(c => ({ ...c, sourceTier: tier }))

  const orderedAll: ComparableSale[] = [
    ...stamp(platinumMatch?.comparables, 'platinum'),
    ...stamp(goldMatch?.comparables, 'gold'),
    ...stamp(silverMatch?.comparables, 'silver'),
  ]
  const seenKeys = new Set<string>()
  const deduped: ComparableSale[] = []
  for (const c of orderedAll) {
    const k = c.listingKey || `__noKey_${deduped.length}`
    if (seenKeys.has(k)) continue
    seenKeys.add(k)
    deduped.push(c)
    if (deduped.length >= TAX_MATCH_DISPLAY_CAP) break
  }

  return {
    matchTier:         winnerMatch.tier,                 // winning tier's match label
    comparables:       deduped,                          // MULTI-TIER display list (sourceTier-stamped)
    winnerComparables: winnerMatch.comparables,          // winning-tier-only, for action's pricing
    count:             winnerMatch.comparables.length,   // winning-tier count (drives header)
    tiers,
    bestGeoTier,
  }
}

// W-CONDO-MODAL-PARITY Phase 1-FIX (2026-06-11): comparability filter for
// the displayed tier median/count. Mirrors the bed+bath(+LAR) subset the
// match functions select top-10 from, so the displayed Geographic
// Confidence Spread reflects subject-comparable inventory rather than the
// raw geo pool (which on wide tiers, esp. Bronze, mixes property types and
// produced the X2 Condos $1.33M-of-detached-homes display bug).
// SELECTION IS UNCHANGED — matched comparables still come from the match
// functions; this only narrows the pool feeding median/range/count.
// LAR threshold (>= 3) mirrors matchAcrossBuildings line 427.
function condoComparabilityFilter(
  pool: any[],
  specs: { bedrooms: number; bathrooms: number; livingAreaRange?: string },
): any[] {
  const bedBath = pool.filter(s =>
    s.bedrooms_total === specs.bedrooms &&
    s.bathrooms_total_integer === specs.bathrooms,
  )
  if (!specs.livingAreaRange) return bedBath
  const lar = bedBath.filter(s => s.living_area_range === specs.livingAreaRange)
  return lar.length >= 3 ? lar : bedBath
}

export async function findCondoComparablesSales(specs: CondoSaleSpecs): Promise<CondoSaleMatchResult> {
  const supabase = createClient()
  const twoYearsAgo = new Date()
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
  const sinceISO = twoYearsAgo.toISOString()

  const customValues = await resolveCondoAdjustments(specs.buildingId || null, 'sale', specs.tenantId ?? null)

  // W-CONDO-MODAL-PARITY Phase 1 (2026-06-11): compute all four tier pools
  // every call, then walk the EXISTING selection priority (Platinum >= 1
  // same-building comp wins per c2-revert; Gold/Silver >= 3; Bronze >= 1).
  // Best-tier resolution + priced output below are byte-identical to
  // pre-Phase-1 — tiers + bestGeoTier are additive display context only.

  // ----- Per-tier query + within-tier match. Each block builds:
  //   - the queried (Sale-only — no gates on SALE) raw pool
  //   - the within-tier matchResult (comparables + tier label)
  //   - the TierResult for the display rail
  // and stores them for the resolution step below.

  // P-CASCADE-REBUILD (2026-06-12): parallelize Platinum + Gold + Silver +
  // Bronze + Tax-Match queries via Promise.all. Independence verified in
  // recon/W-CASCADE-REBUILD-RECON.txt section 4. SQL-level bedrooms_total
  // push on Gold/Silver/Bronze (not Platinum — building pool is small, no
  // truncation risk; operator-locked "Gold/Silver/Bronze" scope). Safe-
  // superset: every condo match path requires bed eq via matchAcrossBuildings'
  // bedBath base filter, so SQL push is a selection NOOP that only fixes the
  // recency-truncation class.

  // Resolve munis for Bronze before fan-out (one DB lookup, cached).
  const bronzeMunis: string[] = specs.areaId ? await munisInArea(specs.areaId, supabase) : []

  // Compose each base query (or null when geo missing).
  const qPlatinum = specs.buildingId ? supabase
    .from('mls_listings')
    .select(CONDO_SALE_SELECT)
    .eq('building_id', specs.buildingId)
    .eq('transaction_type', 'For Sale')
    .eq('standard_status', 'Closed')
    .not('close_price', 'is', null)
    .gt('close_price', 100000)
    .gte('close_date', sinceISO)
    .order('close_date', { ascending: false }) : null

  const qGoldCondo = specs.communityId ? supabase
    .from('mls_listings')
    .select(CONDO_SALE_SELECT)
    .eq('community_id', specs.communityId)
    .eq('bedrooms_total', specs.bedrooms)
    .eq('transaction_type', 'For Sale')
    .eq('standard_status', 'Closed')
    .not('close_price', 'is', null)
    .gt('close_price', 100000)
    .gte('close_date', sinceISO)
    .order('close_date', { ascending: false })
    .limit(300) : null

  const qSilverCondo = specs.municipalityId ? supabase
    .from('mls_listings')
    .select(CONDO_SALE_SELECT)
    .eq('municipality_id', specs.municipalityId)
    .eq('bedrooms_total', specs.bedrooms)
    .eq('transaction_type', 'For Sale')
    .eq('standard_status', 'Closed')
    .not('close_price', 'is', null)
    .gt('close_price', 100000)
    .gte('close_date', sinceISO)
    .order('close_date', { ascending: false })
    .limit(500) : null

  const qBronzeCondo = bronzeMunis.length > 0 ? supabase
    .from('mls_listings')
    .select(CONDO_SALE_SELECT + ', municipality_id')
    .eq('transaction_type', 'For Sale')
    .eq('standard_status', 'Closed')
    .not('close_price', 'is', null)
    .gt('close_price', 100000)
    .gte('close_date', sinceISO)
    .in('municipality_id', bronzeMunis)
    .eq('bedrooms_total', specs.bedrooms)
    .order('close_date', { ascending: false })
    .limit(500) : null

  const [bldgSales, commSalesGeo, muniSalesGeo, areaSales, taxMatch] = await Promise.all([
    qPlatinum ? qPlatinum.then((r: any) => r.data || []) : Promise.resolve([] as any[]),
    qGoldCondo ? qGoldCondo.then((r: any) => r.data || []) : Promise.resolve([] as any[]),
    qSilverCondo ? qSilverCondo.then((r: any) => r.data || []) : Promise.resolve([] as any[]),
    qBronzeCondo ? qBronzeCondo.then((r: any) => r.data || []) : Promise.resolve([] as any[]),
    runTaxMatchCascade(supabase, specs, sinceISO, customValues),
  ])

  // Process each tier sequentially (post-gather). Match functions have their
  // own awaits (attachMediaUrls); preserved in order to keep per-tier output
  // byte-identical to pre-rebuild.
  let platinumMatch: { tier: MatchTier; comparables: ComparableSale[] } | null = null
  let platinumTier: TierResult | null = null
  if (bldgSales.length > 0) {
    platinumMatch = await matchWithinBuilding(bldgSales, specs, customValues)
    platinumTier  = buildCondoTierResult(condoComparabilityFilter(bldgSales, specs), platinumMatch.comparables)
  }

  let goldMatch: { tier: MatchTier; comparables: ComparableSale[] } | null = null
  let goldTier: TierResult | null = null
  if (commSalesGeo.length > 0) {
    goldMatch = await matchAcrossBuildings(commSalesGeo, specs, customValues)
    goldTier  = buildCondoTierResult(condoComparabilityFilter(commSalesGeo, specs), goldMatch.comparables)
  }

  let silverMatch: { tier: MatchTier; comparables: ComparableSale[] } | null = null
  let silverTier: TierResult | null = null
  if (muniSalesGeo.length > 0) {
    silverMatch = await matchAcrossBuildings(muniSalesGeo, specs, customValues)
    silverTier  = buildCondoTierResult(condoComparabilityFilter(muniSalesGeo, specs), silverMatch.comparables)
  }

  let bronzeMatch: { tier: MatchTier; comparables: ComparableSale[] } | null = null
  let bronzeTier: TierResult | null = null
  if (areaSales.length > 0) {
    bronzeMatch = await matchAcrossBuildings(areaSales, specs, customValues)
    bronzeTier  = buildCondoTierResult(condoComparabilityFilter(areaSales, specs), bronzeMatch.comparables)
  }

  const tiers = { platinum: platinumTier, gold: goldTier, silver: silverTier, bronze: bronzeTier }

  // SELECTION PRESERVED — same priority + same thresholds as pre-Phase-1.
  // Locked c2-revert: a single same-building comp anchors Platinum.
  if (platinumMatch && platinumMatch.comparables.length >= 1) {
    return { ...platinumMatch, geoLevel: 'building', tiers, bestGeoTier: 'platinum', taxMatch }
  }
  if (goldMatch && goldMatch.comparables.length >= 3) {
    return { ...goldMatch, geoLevel: 'community', tiers, bestGeoTier: 'gold', taxMatch }
  }
  if (silverMatch && silverMatch.comparables.length >= 3) {
    return { ...silverMatch, geoLevel: 'municipality', tiers, bestGeoTier: 'silver', taxMatch }
  }
  if (bronzeMatch && bronzeMatch.comparables.length >= 1) {
    return { ...bronzeMatch, geoLevel: 'area', tiers, bestGeoTier: 'bronze', taxMatch }
  }
  return { tier: 'CONTACT', comparables: [], geoLevel: 'none', tiers, bestGeoTier: 'none', taxMatch }
}

const _areaMunisCache: Map<string, string[]> = new Map()
async function munisInArea(areaId: string, supabase: any): Promise<string[]> {
  if (_areaMunisCache.has(areaId)) return _areaMunisCache.get(areaId)!
  const { data } = await supabase.from('municipalities').select('id').eq('area_id', areaId)
  const ids = (data || []).map((m: any) => m.id)
  _areaMunisCache.set(areaId, ids)
  return ids
}

// ===== Within-Platinum (same building) sub-tier matching =====
// Existing 7-tier model: BINGO / BINGO-ADJ / RANGE / RANGE-ADJ / MAINT / MAINT-ADJ.
// MAINT tier here uses the assoc_fee ±20% band (kept; the maint-PSF score
// nudge is layered on top at scoring time, not as a separate tier).
async function matchWithinBuilding(
  sales: any[],
  specs: CondoSaleSpecs,
  customValues: ResolvedCondoAdjustments,
): Promise<{ tier: MatchTier; comparables: ComparableSale[] }> {
  const bedBath = sales.filter(s =>
    s.bedrooms_total === specs.bedrooms && s.bathrooms_total_integer === specs.bathrooms,
  )
  if (bedBath.length === 0) return { tier: 'CONTACT', comparables: [] }

  // BINGO + BINGO-ADJ: exact sqft ±10% + parking + locker
  if (specs.exactSqft) {
    const tol = specs.exactSqft * 0.10
    const min = specs.exactSqft - tol
    const max = specs.exactSqft + tol
    const bingo = bedBath.filter(s => {
      const sf = extractExactSqft(s.square_foot_source)
      if (!sf || sf < min || sf > max) return false
      return (s.parking_total || 0) === specs.parking && (s.locker === 'Owned') === specs.hasLocker
    })
    if (bingo.length > 0) {
      return { tier: 'BINGO', comparables: await scoreAndShape(bingo, specs, customValues, 'BINGO', false) }
    }
    const bingoAdj = bedBath.filter(s => {
      const sf = extractExactSqft(s.square_foot_source)
      return sf && sf >= min && sf <= max
    })
    if (bingoAdj.length > 0) {
      return { tier: 'BINGO-ADJ', comparables: await scoreAndShape(bingoAdj, specs, customValues, 'BINGO-ADJ', true) }
    }
  }

  // RANGE + RANGE-ADJ
  if (specs.livingAreaRange) {
    const range = bedBath.filter(s =>
      s.living_area_range === specs.livingAreaRange &&
      (s.parking_total || 0) === specs.parking &&
      ((s.locker === 'Owned') === specs.hasLocker),
    )
    if (range.length > 0) {
      return { tier: 'RANGE', comparables: await scoreAndShape(range, specs, customValues, 'RANGE', false) }
    }
    const rangeAdj = bedBath.filter(s => s.living_area_range === specs.livingAreaRange)
    if (rangeAdj.length > 0) {
      return { tier: 'RANGE-ADJ', comparables: await scoreAndShape(rangeAdj, specs, customValues, 'RANGE-ADJ', true) }
    }
  }

  // MAINT + MAINT-ADJ: assoc_fee ±20%
  if (specs.associationFee && specs.associationFee > 0) {
    const maint = bedBath.filter(s =>
      isMaintenanceMatch(specs.associationFee, s.association_fee, 0.20) &&
      (s.parking_total || 0) === specs.parking &&
      ((s.locker === 'Owned') === specs.hasLocker),
    )
    if (maint.length > 0) {
      return { tier: 'MAINT', comparables: await scoreAndShape(maint, specs, customValues, 'MAINT', false) }
    }
    const maintAdj = bedBath.filter(s => isMaintenanceMatch(specs.associationFee, s.association_fee, 0.20))
    if (maintAdj.length > 0) {
      return { tier: 'MAINT-ADJ', comparables: await scoreAndShape(maintAdj, specs, customValues, 'MAINT-ADJ', true) }
    }
  }

  return { tier: 'CONTACT', comparables: [] }
}

// ===== Within Gold/Silver/Bronze (cross-building) =====
async function matchAcrossBuildings(
  sales: any[],
  specs: CondoSaleSpecs,
  customValues: ResolvedCondoAdjustments,
): Promise<{ tier: MatchTier; comparables: ComparableSale[] }> {
  const bedBath = sales.filter(s =>
    s.bedrooms_total === specs.bedrooms && s.bathrooms_total_integer === specs.bathrooms,
  )
  if (bedBath.length === 0) return { tier: 'CONTACT', comparables: [] }

  // Prefer same LAR. Score-nudge picks the 10 best.
  if (specs.livingAreaRange) {
    const r = bedBath.filter(x => x.living_area_range === specs.livingAreaRange)
    if (r.length >= 3) {
      const scored = r.map(s => ({ s, sc: scoreSim(s, specs) }))
      scored.sort((a, b) => b.sc - a.sc)
      // Attach media AFTER scoring + slicing — strictly post-selection.
      const top = scored.slice(0, 10).map(x => x.s)
      const enriched = await attachMediaUrls(top)
      return {
        tier: 'RANGE',
        comparables: enriched.map(s => createCrossBuildingComp(s, specs)),
      }
    }
  }

  // bed+bath fallback with score-nudge.
  if (bedBath.length >= 3) {
    const scored = bedBath.map(s => ({ s, sc: scoreSim(s, specs) }))
    scored.sort((a, b) => b.sc - a.sc)
    const top = scored.slice(0, 10).map(x => x.s)
    const enriched = await attachMediaUrls(top)
    return {
      tier: 'RANGE-ADJ',
      comparables: enriched.map(s => createCrossBuildingComp(s, specs)),
    }
  }

  // bed-only last resort.
  const bedOnly = sales.filter(s => s.bedrooms_total === specs.bedrooms)
  if (bedOnly.length >= 1) {
    const scored = bedOnly.map(s => ({ s, sc: scoreSim(s, specs) }))
    scored.sort((a, b) => b.sc - a.sc)
    const top = scored.slice(0, 5).map(x => x.s)
    const enriched = await attachMediaUrls(top)
    return {
      tier: 'CONTACT',
      comparables: enriched.map(s => createCrossBuildingComp(s, specs)),
    }
  }

  return { tier: 'CONTACT', comparables: [] }
}

function scoreSim(sale: any, specs: CondoSaleSpecs): number {
  let score = 100
  if (specs.exactSqft) {
    const sf = extractExactSqft(sale.square_foot_source)
    if (sf) {
      const d = Math.abs(sf - specs.exactSqft)
      if (d <= 50) score += 40
      else if (d <= 100) score += 30
      else if (d <= 200) score += 20
      else if (d <= 300) score += 10
      else score -= 5
    }
  } else if (specs.livingAreaRange) {
    if (sale.living_area_range === specs.livingAreaRange) score += 30
    else score -= 10
  }
  if (sale.close_date) {
    const months = (Date.now() - new Date(sale.close_date).getTime()) / (1000 * 60 * 60 * 24 * 30)
    if (months <= 3) score += 15
    else if (months <= 6) score += 10
    else if (months <= 12) score += 5
  }
  // h8 tax band + maintenance-PSF band — both silent-omit when data missing.
  score += taxSimilarityScore(sale, specs)
  score += maintenancePsfScore(sale, specs)
  // Locker presence — small binary nudge when both sides have a value.
  if ((sale.locker === 'Owned') === specs.hasLocker) score += 3
  return score
}

async function scoreAndShape(
  sales: any[],
  specs: CondoSaleSpecs,
  customValues: ResolvedCondoAdjustments,
  tier: MatchTier,
  applyAdj: boolean,
): Promise<ComparableSale[]> {
  // Within-Platinum: pricing carries by within-building structure; tax band +
  // maint-PSF nudges reorder but the top-N stays same-building.
  const scored = sales.map(s => ({ s, sc: scoreSim(s, specs) }))
  scored.sort((a, b) => b.sc - a.sc)
  // Attach media AFTER scoring + slicing — strictly post-selection enrichment.
  const top = scored.slice(0, 10).map(x => x.s)
  const enriched = await attachMediaUrls(top)
  return enriched.map(sale => createComp(sale, specs, customValues, applyAdj, tier))
}

function createComp(
  sale: any,
  specs: CondoSaleSpecs,
  customValues: ResolvedCondoAdjustments,
  applyAdj: boolean,
  tier: MatchTier,
): ComparableSale {
  const adjustments: PriceAdjustment[] = []
  let adjustedPrice = sale.close_price

  if (applyAdj) {
    const parkDiff = (specs.parking ?? 0) - (sale.parking_total ?? 0)
    if (parkDiff !== 0) {
      const amt = parkDiff * customValues.parkingPerSpace
      adjustedPrice += amt
      adjustments.push({
        type: 'parking',
        difference: parkDiff,
        adjustmentAmount: amt,
        reason: parkDiff > 0
          ? `Your unit has ${Math.abs(parkDiff)} more parking space${Math.abs(parkDiff) > 1 ? 's' : ''}`
          : `Comparable has ${Math.abs(parkDiff)} more parking space${Math.abs(parkDiff) > 1 ? 's' : ''}`,
      })
    }
    const subjL = specs.hasLocker
    const compL = sale.locker === 'Owned'
    // Locker silent-omit (2026-06-10): when the S2 resolver returns 0 for
    // locker, no scope in the cascade has a value (c4 analytics pipeline
    // still owes locker_*_calculated). Skip the locker $-adjustment rather
    // than faking a $10,000 hardcoded default.
    if (subjL !== compL && customValues.locker > 0) {
      const amt = subjL ? customValues.locker : -customValues.locker
      adjustedPrice += amt
      adjustments.push({
        type: 'locker',
        difference: subjL ? 1 : -1,
        adjustmentAmount: amt,
        reason: subjL ? 'Your unit includes a locker' : 'Comparable includes a locker',
      })
    }
  }

  let mq: 'Perfect' | 'Excellent' | 'Good' | 'Fair' = 'Good'
  if (adjustments.length === 0) mq = 'Perfect'
  else if (adjustments.length === 1) mq = 'Excellent'

  return {
    closePrice: sale.close_price,
    listPrice: sale.list_price,
    bedrooms: sale.bedrooms_total,
    bathrooms: sale.bathrooms_total_integer || 0,
    livingAreaRange: sale.living_area_range || 'Unknown',
    parking: sale.parking_total || 0,
    locker: sale.locker,
    daysOnMarket: sale.days_on_market || 0,
    closeDate: sale.close_date,
    taxAnnualAmount: sale.tax_annual_amount,
    exactSqft: extractExactSqft(sale.square_foot_source) ?? undefined,
    userExactSqft: specs.exactSqft,
    associationFee: sale.association_fee,
    unitNumber: sale.unit_number,
    listingKey: sale.listing_key,
    buildingSlug: specs.buildingSlug,
    temperature: assignTemperature(sale.close_date),
    matchTier: tier,
    matchQuality: mq,
    adjustments: adjustments.length > 0 ? adjustments : undefined,
    adjustedPrice: adjustments.length > 0 ? adjustedPrice : undefined,
    // mediaUrl populated by attachMediaUrls on the SELECTED raw sales.
    mediaUrl: sale.mediaUrl ?? null,
  }
}

function createCrossBuildingComp(sale: any, specs: CondoSaleSpecs): ComparableSale {
  return {
    closePrice: sale.close_price,
    listPrice: sale.list_price,
    bedrooms: sale.bedrooms_total,
    bathrooms: sale.bathrooms_total_integer || 0,
    livingAreaRange: sale.living_area_range || 'Unknown',
    parking: sale.parking_total || 0,
    locker: sale.locker,
    daysOnMarket: sale.days_on_market || 0,
    closeDate: sale.close_date,
    taxAnnualAmount: sale.tax_annual_amount,
    exactSqft: extractExactSqft(sale.square_foot_source) ?? undefined,
    userExactSqft: specs.exactSqft,
    associationFee: sale.association_fee,
    unitNumber: sale.unit_number,
    listingKey: sale.listing_key,
    buildingSlug: specs.buildingSlug,
    temperature: assignTemperature(sale.close_date),
    matchTier: 'RANGE' as MatchTier,
    matchQuality: 'Good',
    mediaUrl: sale.mediaUrl ?? null,
  }
}
