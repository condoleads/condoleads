// lib/estimator/condo-comparable-matcher-rentals.ts
// c1 (2026-06-10) — System 2 condo lease comparable matcher.
//
// Geo cascade (4-tier): Platinum=Building → Gold=Community → Silver=Muni → Bronze=Area.
// Within Platinum (same building): the existing within-building model
// (bed+bath + sqft/parking/locker) carries the match. Within
// Gold/Silver/Bronze: sqft-range + bed + bath alignment + score-nudge
// reordering — building-specific gates (parking/locker) lose meaning across
// buildings, so they become score nudges instead of hard gates.
//
// Building-less subjects (the ~18% all-time, ~3-5% recent cohort with
// building_id = null) skip Platinum and start at Gold. The shared matcher
// hard-fails on these subjects today; condo-cascade fixes that.
//
// h9 LEASE SEGMENTATION (port from homes — 100% fill on condos):
//   - furnished gate          (CONDO_LEASE_GATE_FURNISHED, default ON)
//   - lease_term LONG/SHORT   (CONDO_LEASE_GATE_TERM,      default ON)
//   - portion gate            (CONDO_LEASE_GATE_PORTION,   default ON — but
//                              expected near-neutral on condos which are
//                              overwhelmingly whole-unit; measured + decided)
//   - rent_includes Jaccard   (CONDO_LEASE_RENT_INCL_WEIGHT, default 7)
// Plus a condo-specific parking score nudge using parking_lease_calculated:
//   - CONDO_LEASE_PARKING_WEIGHT (default 5; range 0-WEIGHT score points
//     based on per-space-delta × resolved parking value)
//
// Silent-omit on every gate when the subject field is missing — un-plumbed
// callers (and subjects with sparse data) silently fall through to the
// pre-segmentation behavior. The matcher is otherwise deterministic.

import { createClient } from '@/lib/supabase/client'
import {
  ComparableSale,
  UnitSpecs,
  PriceAdjustment,
  MatchTier,
  TierResult,
  extractExactSqft,
  assignTemperature,
} from './types'
import { resolveCondoAdjustments, type ResolvedCondoAdjustments } from './resolve-condo-adjustments'

export interface CondoLeaseSpecs extends UnitSpecs {
  // Geo cascade fields — Platinum reads buildingId from UnitSpecs; the rest
  // need community/muni/area for the fall-through tiers. Required when
  // building_id is null (the building-less cohort) for any geo cascade to
  // run at all. When all three are null, only Platinum (building) is
  // possible — and if building is also null, the matcher returns CONTACT.
  communityId?: string | null
  municipalityId?: string | null
  areaId?: string | null
  // Lease segmentation — same shape as the homes h9 thread.
  subjectFurnished?: string | null
  subjectLeaseTerm?: string | null
  subjectPortionPropertyLease?: string[] | null
  subjectRentIncludes?: string[] | null
  // Tenant scoping for the resolver (forward-compat; adjustments table has
  // no tenant_id today).
  tenantId?: string | null
}

export interface CondoLeaseMatchResult {
  tier: MatchTier
  comparables: ComparableSale[]
  geoLevel: 'building' | 'community' | 'municipality' | 'area' | 'none'
  // W-CONDO-MODAL-PARITY Phase 1 (display-only, no pricing change):
  // mirror of the sale matcher's tiers emission. Best-tier resolution
  // + priced output below are BYTE-IDENTICAL to pre-Phase-1.
  tiers?: {
    platinum: TierResult | null
    gold:     TierResult | null
    silver:   TierResult | null
    bronze:   TierResult | null
  }
  bestGeoTier?: 'platinum' | 'gold' | 'silver' | 'bronze' | 'none'
}

// W-CONDO-MODAL-PARITY Phase 1: median + min/max range over a pool's
// close_price. Pure. Display context — never feeds the priced top-level
// number.
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
// On the LEASE side `pool` is the post-gate row set — median/range reflect
// the same cohort that drives the priced output. Returns null when the
// pool is empty OR the within-tier matcher produced zero comparables.
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
  return {
    comparables: matched,
    count: pool.length,
    median: mr.median,
    range: mr.range,
    bestMatchScore: 100,
  }
}

// W-CONDO-MODAL-PARITY Phase 1-FIX (2026-06-11): comparability filter for
// the displayed tier median/count. Same semantics as the sale matcher's
// version (intentionally mirrored, not shared-util, per recon rec (a)).
// On the LEASE side this applies ON TOP OF the lease-segmentation gates
// already applied to `pool` — the gated pool is the input, the comparable
// subset is the output. SELECTION IS UNCHANGED.
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

const CONDO_LEASE_SELECT = `id, listing_key, close_price, list_price, bedrooms_total,
  bathrooms_total_integer, living_area_range, parking_total, locker,
  days_on_market, close_date, square_foot_source, association_fee,
  unit_number, building_id, community_id, municipality_id,
  furnished, lease_term, portion_property_lease, rent_includes`

// Env knobs — all default ON / weight=7. Set =0 to disable.
const GATE_FURNISHED = process.env.CONDO_LEASE_GATE_FURNISHED !== '0'
const GATE_TERM      = process.env.CONDO_LEASE_GATE_TERM !== '0'
const GATE_PORTION   = process.env.CONDO_LEASE_GATE_PORTION !== '0'
const RENT_INCL_WEIGHT = (() => {
  const v = parseFloat(process.env.CONDO_LEASE_RENT_INCL_WEIGHT || '7')
  return Number.isFinite(v) && v >= 0 ? v : 7
})()
const PARKING_NUDGE_WEIGHT = (() => {
  const v = parseFloat(process.env.CONDO_LEASE_PARKING_WEIGHT || '5')
  return Number.isFinite(v) && v >= 0 ? v : 5
})()

const LONG_TERMS  = new Set(['12 Months', '24 Months', '36 Plus Months'])
const SHORT_TERMS = new Set(['Short Term Lease', 'Month To Month'])
function leaseTermGroup(t?: string | null): 'LONG' | 'SHORT' | null {
  if (!t) return null
  if (LONG_TERMS.has(t)) return 'LONG'
  if (SHORT_TERMS.has(t)) return 'SHORT'
  return null
}

// On condos, portion is overwhelmingly 'Entire Property' — this gate may
// be near-neutral or net-zero. Sweep measures it; ship/drop per the rule.
function portionPool(arr?: string[] | null): 'Entire' | 'Basement' | 'Upper' | null {
  if (!arr || !Array.isArray(arr) || arr.length === 0) return null
  if (arr.includes('Basement')) return 'Basement'
  if (arr.some(p => ['Main', '2nd Floor', '3rd Floor'].includes(p))) return 'Upper'
  if (arr.includes('Entire Property')) return 'Entire'
  return null
}

function applyLeaseSegGates(leases: any[], specs: CondoLeaseSpecs): any[] {
  let pool = leases

  if (GATE_FURNISHED && specs.subjectFurnished) {
    const subj = specs.subjectFurnished
    pool = pool.filter(l => {
      const c = l.furnished
      if (!c) return true
      if (c === subj) return true
      if (subj === 'Partially' || c === 'Partially') return true
      return false
    })
  }

  if (GATE_TERM) {
    const sg = leaseTermGroup(specs.subjectLeaseTerm)
    if (sg) {
      pool = pool.filter(l => {
        const cg = leaseTermGroup(l.lease_term)
        if (!cg) return true
        return cg === sg
      })
    }
  }

  if (GATE_PORTION) {
    const sp = portionPool(specs.subjectPortionPropertyLease)
    if (sp) {
      pool = pool.filter(l => {
        const cp = portionPool(l.portion_property_lease)
        if (!cp) return true
        return cp === sp
      })
    }
  }

  return pool
}

function rentIncludesNudge(lease: any, specs: CondoLeaseSpecs): number {
  if (RENT_INCL_WEIGHT <= 0) return 0
  const s = specs.subjectRentIncludes
  if (!Array.isArray(s) || s.length === 0) return 0
  const c = Array.isArray(lease.rent_includes) ? lease.rent_includes : []
  if (c.length === 0) return 0
  const ss = new Set(s)
  const cs = new Set(c)
  let inter = 0
  for (const x of ss) if (cs.has(x)) inter++
  const union = ss.size + cs.size - inter
  if (union === 0) return 0
  return RENT_INCL_WEIGHT * (inter / union)
}

// Condo-specific: parking score nudge using the resolved per-geo parking
// value (parking_lease_calculated). When subject and comp have matching
// parking counts, no nudge fires (zero delta). When they differ, the nudge
// is proportional to the dollar impact at the geo's actual parking rate —
// higher-parking-value geos penalize parking mismatches more.
function parkingNudge(lease: any, specs: CondoLeaseSpecs, parkingPerSpace: number): number {
  if (PARKING_NUDGE_WEIGHT <= 0) return 0
  if (parkingPerSpace <= 0) return 0
  const subjP = specs.parking ?? 0
  const compP = lease.parking_total ?? 0
  const delta = Math.abs(subjP - compP)
  if (delta === 0) return PARKING_NUDGE_WEIGHT  // exact match → full nudge
  // Sliding: 1 space delta = half nudge, 2+ = zero.
  if (delta === 1) return PARKING_NUDGE_WEIGHT * 0.5
  return 0
}

export async function findCondoComparablesRentals(specs: CondoLeaseSpecs): Promise<CondoLeaseMatchResult> {
  const supabase = createClient()
  const twoYearsAgo = new Date()
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
  const sinceISO = twoYearsAgo.toISOString()

  const customValues = await resolveCondoAdjustments(specs.buildingId || null, 'lease', specs.tenantId ?? null)

  // W-CONDO-MODAL-PARITY Phase 1 (2026-06-11): compute all four tier pools
  // every call, then walk the EXISTING selection priority (Platinum >= 2;
  // Gold/Silver >= 3; Bronze >= 1). Best-tier resolution + priced output
  // below are byte-identical to pre-Phase-1 — tiers + bestGeoTier are
  // additive display context only.

  let platinumMatch: { tier: MatchTier; comparables: ComparableSale[] } | null = null
  let platinumTier: TierResult | null = null
  if (specs.buildingId) {
    const { data: bldgLeases } = await supabase
      .from('mls_listings')
      .select(CONDO_LEASE_SELECT)
      .eq('building_id', specs.buildingId)
      .eq('transaction_type', 'For Lease')
      .eq('standard_status', 'Closed')
      .not('close_price', 'is', null)
      .gte('close_date', sinceISO)
      .order('close_date', { ascending: false })
    if (bldgLeases && bldgLeases.length > 0) {
      const gated = applyLeaseSegGates(bldgLeases, specs)
      if (gated.length > 0) {
        platinumMatch = matchWithinBuilding(gated, specs, customValues)
        platinumTier  = buildCondoTierResult(condoComparabilityFilter(gated, specs), platinumMatch.comparables)
      }
    }
  }

  let goldMatch: { tier: MatchTier; comparables: ComparableSale[] } | null = null
  let goldTier: TierResult | null = null
  if (specs.communityId) {
    const { data: commLeases } = await supabase
      .from('mls_listings')
      .select(CONDO_LEASE_SELECT)
      .eq('community_id', specs.communityId)
      .eq('transaction_type', 'For Lease')
      .eq('standard_status', 'Closed')
      .not('close_price', 'is', null)
      .gte('close_date', sinceISO)
      .order('close_date', { ascending: false })
      .limit(300)
    if (commLeases && commLeases.length > 0) {
      const gated = applyLeaseSegGates(commLeases, specs)
      if (gated.length > 0) {
        goldMatch = matchAcrossBuildings(gated, specs, customValues)
        goldTier  = buildCondoTierResult(condoComparabilityFilter(gated, specs), goldMatch.comparables)
      }
    }
  }

  let silverMatch: { tier: MatchTier; comparables: ComparableSale[] } | null = null
  let silverTier: TierResult | null = null
  if (specs.municipalityId) {
    const { data: muniLeases } = await supabase
      .from('mls_listings')
      .select(CONDO_LEASE_SELECT)
      .eq('municipality_id', specs.municipalityId)
      .eq('transaction_type', 'For Lease')
      .eq('standard_status', 'Closed')
      .not('close_price', 'is', null)
      .gte('close_date', sinceISO)
      .order('close_date', { ascending: false })
      .limit(500)
    if (muniLeases && muniLeases.length > 0) {
      const gated = applyLeaseSegGates(muniLeases, specs)
      if (gated.length > 0) {
        silverMatch = matchAcrossBuildings(gated, specs, customValues)
        silverTier  = buildCondoTierResult(condoComparabilityFilter(gated, specs), silverMatch.comparables)
      }
    }
  }

  let bronzeMatch: { tier: MatchTier; comparables: ComparableSale[] } | null = null
  let bronzeTier: TierResult | null = null
  if (specs.areaId) {
    const { data: areaLeases } = await supabase
      .from('mls_listings')
      .select(CONDO_LEASE_SELECT + ', municipality_id')
      .eq('transaction_type', 'For Lease')
      .eq('standard_status', 'Closed')
      .not('close_price', 'is', null)
      .gte('close_date', sinceISO)
      .in('municipality_id', await munisInArea(specs.areaId, supabase))
      .order('close_date', { ascending: false })
      .limit(500)
    if (areaLeases && areaLeases.length > 0) {
      const gated = applyLeaseSegGates(areaLeases, specs)
      if (gated.length > 0) {
        bronzeMatch = matchAcrossBuildings(gated, specs, customValues)
        bronzeTier  = buildCondoTierResult(condoComparabilityFilter(gated, specs), bronzeMatch.comparables)
      }
    }
  }

  const tiers = { platinum: platinumTier, gold: goldTier, silver: silverTier, bronze: bronzeTier }

  // SELECTION PRESERVED — same priority + same thresholds as pre-Phase-1.
  // LEASE Platinum threshold is >= 2 (c1 ship, NOT the c2-revert >=1
  // which is sale-only).
  if (platinumMatch && platinumMatch.comparables.length >= 2) {
    return { ...platinumMatch, geoLevel: 'building', tiers, bestGeoTier: 'platinum' }
  }
  if (goldMatch && goldMatch.comparables.length >= 3) {
    return { ...goldMatch, geoLevel: 'community', tiers, bestGeoTier: 'gold' }
  }
  if (silverMatch && silverMatch.comparables.length >= 3) {
    return { ...silverMatch, geoLevel: 'municipality', tiers, bestGeoTier: 'silver' }
  }
  if (bronzeMatch && bronzeMatch.comparables.length >= 1) {
    return { ...bronzeMatch, geoLevel: 'area', tiers, bestGeoTier: 'bronze' }
  }
  return { tier: 'CONTACT', comparables: [], geoLevel: 'none', tiers, bestGeoTier: 'none' }
}

// Helper: resolve list of municipality_ids in an area (the schema has
// areas → munis as a 1-many). Cached per process for the rare Bronze fall-through.
const _areaMunisCache: Map<string, string[]> = new Map()
async function munisInArea(areaId: string, supabase: any): Promise<string[]> {
  if (_areaMunisCache.has(areaId)) return _areaMunisCache.get(areaId)!
  const { data } = await supabase.from('municipalities').select('id').eq('area_id', areaId)
  const ids = (data || []).map((m: any) => m.id)
  _areaMunisCache.set(areaId, ids)
  return ids
}

// ===== Within-Platinum (same building) sub-tier matching =====
function matchWithinBuilding(
  leases: any[],
  specs: CondoLeaseSpecs,
  customValues: ResolvedCondoAdjustments,
): { tier: MatchTier; comparables: ComparableSale[] } {
  const bedBath = leases.filter(l =>
    l.bedrooms_total === specs.bedrooms && l.bathrooms_total_integer === specs.bathrooms
  )
  if (bedBath.length === 0) {
    // No bed+bath in building → fall to caller (Gold).
    return { tier: 'CONTACT', comparables: [] }
  }

  // BINGO: exact sqft ±10% + parking + locker
  if (specs.exactSqft) {
    const tol = specs.exactSqft * 0.10
    const min = specs.exactSqft - tol
    const max = specs.exactSqft + tol
    const bingo = bedBath.filter(l => {
      const sf = extractExactSqft(l.square_foot_source)
      if (!sf || sf < min || sf > max) return false
      return (l.parking_total || 0) === specs.parking && (l.locker === 'Owned') === specs.hasLocker
    })
    if (bingo.length > 0) {
      return { tier: 'BINGO', comparables: bingo.slice(0, 10).map(l => createComp(l, specs, customValues, false)) }
    }
    // BINGO-ADJ: exact sqft ±10% + parking/locker may differ
    const bingoAdj = bedBath.filter(l => {
      const sf = extractExactSqft(l.square_foot_source)
      return sf && sf >= min && sf <= max
    })
    if (bingoAdj.length > 0) {
      return { tier: 'BINGO-ADJ', comparables: bingoAdj.slice(0, 10).map(l => createComp(l, specs, customValues, true)) }
    }
  }

  // RANGE: same LAR + parking + locker
  if (specs.livingAreaRange) {
    const range = bedBath.filter(l =>
      l.living_area_range === specs.livingAreaRange &&
      (l.parking_total || 0) === specs.parking &&
      (l.locker === 'Owned') === specs.hasLocker,
    )
    if (range.length > 0) {
      return { tier: 'RANGE', comparables: range.slice(0, 10).map(l => createComp(l, specs, customValues, false)) }
    }
    const rangeAdj = bedBath.filter(l => l.living_area_range === specs.livingAreaRange)
    if (rangeAdj.length > 0) {
      return { tier: 'RANGE-ADJ', comparables: rangeAdj.slice(0, 10).map(l => createComp(l, specs, customValues, true)) }
    }
  }

  return { tier: 'CONTACT', comparables: [] }
}

// ===== Within Gold/Silver/Bronze (cross-building) matching =====
// Building-specific signals (parking spec, locker spec) lose meaning across
// buildings — they become score nudges. Sqft-range + bed + bath remain the
// alignment.
function matchAcrossBuildings(
  leases: any[],
  specs: CondoLeaseSpecs,
  customValues: ResolvedCondoAdjustments,
): { tier: MatchTier; comparables: ComparableSale[] } {
  const bedBath = leases.filter(l =>
    l.bedrooms_total === specs.bedrooms && l.bathrooms_total_integer === specs.bathrooms,
  )
  if (bedBath.length === 0) return { tier: 'CONTACT', comparables: [] }

  // Prefer same LAR.
  if (specs.livingAreaRange) {
    const rangeMatches = bedBath.filter(l => l.living_area_range === specs.livingAreaRange)
    if (rangeMatches.length >= 3) {
      const scored = rangeMatches.map(l => ({
        lease: l,
        score: scoreSimilarity(l, specs, customValues),
      }))
      scored.sort((a, b) => b.score - a.score)
      return {
        tier: 'RANGE',
        comparables: scored.slice(0, 10).map(s => createCrossBuildingComp(s.lease, specs)),
      }
    }
  }

  // Same bed + same bath, looser sqft.
  if (bedBath.length >= 3) {
    const scored = bedBath.map(l => ({
      lease: l,
      score: scoreSimilarity(l, specs, customValues),
    }))
    scored.sort((a, b) => b.score - a.score)
    return {
      tier: 'RANGE-ADJ',
      comparables: scored.slice(0, 10).map(s => createCrossBuildingComp(s.lease, specs)),
    }
  }

  // Last resort: bed-only at this geo level.
  const bedOnly = leases.filter(l => l.bedrooms_total === specs.bedrooms)
  if (bedOnly.length >= 1) {
    const scored = bedOnly.map(l => ({
      lease: l,
      score: scoreSimilarity(l, specs, customValues),
    }))
    scored.sort((a, b) => b.score - a.score)
    return {
      tier: 'CONTACT',
      comparables: scored.slice(0, 5).map(s => createCrossBuildingComp(s.lease, specs)),
    }
  }

  return { tier: 'CONTACT', comparables: [] }
}

function scoreSimilarity(lease: any, specs: CondoLeaseSpecs, customValues: ResolvedCondoAdjustments): number {
  let score = 100

  // Sqft alignment: exact ±50 huge, ranges loose.
  if (specs.exactSqft) {
    const sf = extractExactSqft(lease.square_foot_source)
    if (sf) {
      const d = Math.abs(sf - specs.exactSqft)
      if (d <= 50) score += 40
      else if (d <= 100) score += 30
      else if (d <= 200) score += 20
      else if (d <= 300) score += 10
      else score -= 5
    }
  } else if (specs.livingAreaRange) {
    if (lease.living_area_range === specs.livingAreaRange) score += 30
    else score -= 10
  }

  // Recency.
  if (lease.close_date) {
    const months = (Date.now() - new Date(lease.close_date).getTime()) / (1000 * 60 * 60 * 24 * 30)
    if (months <= 3) score += 15
    else if (months <= 6) score += 10
    else if (months <= 12) score += 5
  }

  // h9 ports: rent_includes Jaccard + parking nudge.
  score += rentIncludesNudge(lease, specs)
  score += parkingNudge(lease, specs, customValues.parkingPerSpace)

  // Locker presence — small binary nudge when both sides have a value.
  const subjL = specs.hasLocker
  const compL = lease.locker === 'Owned'
  if (subjL === compL) score += 3

  return score
}

// Within-Platinum (same building) — uses existing 7-tier sub-model + parking/locker $ adjustment.
function createComp(lease: any, specs: CondoLeaseSpecs, customValues: ResolvedCondoAdjustments, applyAdj: boolean): ComparableSale {
  const adjustments: PriceAdjustment[] = []
  let adjustedPrice = lease.close_price

  if (applyAdj) {
    const parkDiff = (specs.parking ?? 0) - (lease.parking_total ?? 0)
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
    const compL = lease.locker === 'Owned'
    // Locker silent-omit (2026-06-10): S2 resolver returns 0 when no scope
    // in the cascade has a value (c4 analytics pipeline pending). Skip the
    // adjustment rather than faking the hardcoded $50 default.
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
    closePrice: lease.close_price,
    listPrice: lease.list_price,
    bedrooms: lease.bedrooms_total,
    bathrooms: lease.bathrooms_total_integer || 0,
    livingAreaRange: lease.living_area_range || 'Unknown',
    parking: lease.parking_total || 0,
    locker: lease.locker,
    daysOnMarket: lease.days_on_market || 0,
    closeDate: lease.close_date,
    exactSqft: extractExactSqft(lease.square_foot_source) ?? undefined,
    userExactSqft: specs.exactSqft,
    associationFee: lease.association_fee,
    unitNumber: lease.unit_number,
    listingKey: lease.listing_key,
    buildingSlug: specs.buildingSlug,
    temperature: assignTemperature(lease.close_date),
    matchTier: 'RANGE' as MatchTier,
    matchQuality: mq,
    adjustments: adjustments.length > 0 ? adjustments : undefined,
    adjustedPrice: adjustments.length > 0 ? adjustedPrice : undefined,
  }
}

// Cross-building (Gold/Silver/Bronze) — no within-building $ adjustment;
// the geo signal carries the comp pricing, parking is a score-nudge upstream.
function createCrossBuildingComp(lease: any, specs: CondoLeaseSpecs): ComparableSale {
  return {
    closePrice: lease.close_price,
    listPrice: lease.list_price,
    bedrooms: lease.bedrooms_total,
    bathrooms: lease.bathrooms_total_integer || 0,
    livingAreaRange: lease.living_area_range || 'Unknown',
    parking: lease.parking_total || 0,
    locker: lease.locker,
    daysOnMarket: lease.days_on_market || 0,
    closeDate: lease.close_date,
    exactSqft: extractExactSqft(lease.square_foot_source) ?? undefined,
    userExactSqft: specs.exactSqft,
    associationFee: lease.association_fee,
    unitNumber: lease.unit_number,
    listingKey: lease.listing_key,
    buildingSlug: specs.buildingSlug,
    temperature: assignTemperature(lease.close_date),
    matchTier: 'RANGE' as MatchTier,
    matchQuality: 'Good',
  }
}
