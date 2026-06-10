// lib/estimator/home-comparable-matcher-rentals.ts
import { createClient } from '@/lib/supabase/client'
import {
  ComparableSale,
  PriceAdjustment,
  MatchTier,
  extractExactSqft,
  assignTemperature,
} from './types'
import { HomeSpecs } from './home-comparable-matcher-sales'
import {
  resolveHomeAdjustments,
  type ResolvedHomeAdjustments,
} from './resolve-home-adjustments'

interface HomeRentalMatchResult {
  tier: MatchTier
  comparables: ComparableSale[]
  geoLevel: 'community' | 'municipality' | 'none'
}

const HOME_RENTAL_SELECT = `id, listing_key, close_price, list_price, bedrooms_total,
  bathrooms_total_integer, living_area_range, parking_total, locker,
  days_on_market, close_date, square_foot_source,
  unit_number, property_subtype, street_name, street_number,
  lot_width, lot_depth, lot_size_area, garage_type, basement, approximate_age,
  furnished, lease_term, portion_property_lease, rent_includes`

// Rental adjustment values for homes
const HOME_RENTAL_ADJUSTMENTS = {
  PARKING_PER_SPACE: 150,  // $150/mo per parking space
  BATHROOM: 100,           // $100/mo per bathroom difference
}

// ============ h9 LEASE SEGMENTATION GATES (2026-06-10, LEASE-only) ============
//
// 3 type gates filter the comp pool BEFORE matchWithinPool runs. The gates
// partition each geo tier; sub-tier (exact-sqft / LAR / bed+bath / bed-only)
// matching then runs WITHIN the gate-filtered pool. The geo cascade
// (community → muni) is preserved.
//
// 1. FURNISHED: 3-bucket enum (Unfurnished | Furnished | Partially), 100% fill.
//    Subject's bucket exact-match OR Partially bridges (Partially↔Furnished
//    and Partially↔Unfurnished both allowed; Furnished↔Unfurnished blocked).
//
// 2. LEASE TERM GROUP: LONG {12/24/36+ Months} vs SHORT {Short Term Lease,
//    Month To Month}. Same-group only. ~99% of leases are 12-Month, so the
//    gate's effect is narrow — its job is isolating the small SHORT cohort
//    (predominantly furnished, systematically different price).
//
// 3. PORTION_PROPERTY_LEASE (homes only): jsonb array of {Entire Property |
//    Basement | Main | 2nd Floor | 3rd Floor | Other | Ancillary Structure}.
//    Pool collapse:
//      Basement       → Basement pool
//      Upper          → Main/2nd/3rd Floor pool
//      Entire         → Entire Property pool
//      Ancillary/Other→ Ancillary pool
//    Subject's portion-pool only.
//
// Silent-omit pattern: each gate checks `if (subject's value is null/undefined,
// skip the filter)`. Un-plumbed callers get the matcher's pre-h9 behavior
// (byte-identical). Env disable knobs:
//   LEASE_GATE_FURNISHED=0  → furnished gate skipped
//   LEASE_GATE_TERM=0       → term gate skipped
//   LEASE_GATE_PORTION=0    → portion gate skipped
//   LEASE_RENT_INCL_WEIGHT  → rent_includes score weight (default 7)
// All env-default = enabled; setting to 0 disables for the sweep harness.
// Default weight tuned 10→7 (2026-06-10) — weight sweep showed w=10 regressed
// MAPE +1.74pp while w=7 strictly improved both ±15 (+0.2pp) and MAPE (-1.98pp).

const GATE_FURNISHED  = process.env.LEASE_GATE_FURNISHED !== '0'
const GATE_TERM       = process.env.LEASE_GATE_TERM !== '0'
const GATE_PORTION    = process.env.LEASE_GATE_PORTION !== '0'
const RENT_INCL_WEIGHT = (() => {
  const v = parseFloat(process.env.LEASE_RENT_INCL_WEIGHT || '7')
  return Number.isFinite(v) && v >= 0 ? v : 7
})()

const LONG_TERMS  = new Set(['12 Months', '24 Months', '36 Plus Months'])
const SHORT_TERMS = new Set(['Short Term Lease', 'Month To Month'])
function leaseTermGroup(t?: string | null): 'LONG' | 'SHORT' | null {
  if (!t) return null
  if (LONG_TERMS.has(t)) return 'LONG'
  if (SHORT_TERMS.has(t)) return 'SHORT'
  return null  // unknown labels → null → gate silent-omits
}

const UPPER_PORTIONS = new Set(['Main', '2nd Floor', '3rd Floor'])
const ANCILLARY_PORTIONS = new Set(['Other', 'Ancillary Structure'])
function portionPool(arr?: string[] | null): 'Basement' | 'Upper' | 'Entire' | 'Ancillary' | null {
  if (!arr || !Array.isArray(arr) || arr.length === 0) return null
  // Priority: Basement > Upper > Entire > Ancillary (a "Basement+Main" comp
  // is a basement-included rental, route to Basement pool to avoid mixing).
  if (arr.includes('Basement')) return 'Basement'
  if (arr.some(p => UPPER_PORTIONS.has(p))) return 'Upper'
  if (arr.includes('Entire Property')) return 'Entire'
  if (arr.some(p => ANCILLARY_PORTIONS.has(p))) return 'Ancillary'
  return null
}

// Apply the 3 gates to a lease pool. Returns the filtered subset. Empty
// subject value for a gate → that gate skipped (no filter). The matcher's
// pre-gate pool is recovered when ALL gates skip (un-plumbed caller).
function applyLeaseTypeGates(leases: any[], specs: any): any[] {
  let pool = leases

  // GATE 1: Furnished
  if (GATE_FURNISHED && specs.subjectFurnished) {
    const subjF = specs.subjectFurnished
    pool = pool.filter(l => {
      const compF = l.furnished
      if (!compF) return true  // missing comp value → permit (silent-omit on comp side too)
      if (compF === subjF) return true
      // Partially bridges both directions
      if (subjF === 'Partially' || compF === 'Partially') return true
      return false  // Furnished ↔ Unfurnished blocked
    })
  }

  // GATE 2: Lease term group
  if (GATE_TERM) {
    const subjGroup = leaseTermGroup(specs.subjectLeaseTerm)
    if (subjGroup) {
      pool = pool.filter(l => {
        const compGroup = leaseTermGroup(l.lease_term)
        if (!compGroup) return true  // missing → silent-omit
        return compGroup === subjGroup
      })
    }
  }

  // GATE 3: Portion (homes only — applies via the lease matcher which IS homes-only)
  if (GATE_PORTION) {
    const subjPool = portionPool(specs.subjectPortionPropertyLease)
    if (subjPool) {
      pool = pool.filter(l => {
        const compPool = portionPool(l.portion_property_lease)
        if (!compPool) return true  // missing → silent-omit
        return compPool === subjPool
      })
    }
  }

  return pool
}

// rent_includes Jaccard-overlap nudge: 0 → no overlap, 1 → identical sets.
// Empty subject array → no nudge (silent-omit). Empty comp array against
// non-empty subject → 0 overlap → 0 points.
function rentIncludesNudge(lease: any, specs: any): number {
  if (RENT_INCL_WEIGHT <= 0) return 0
  const subj = specs.subjectRentIncludes
  if (!Array.isArray(subj) || subj.length === 0) return 0
  const comp = Array.isArray(lease.rent_includes) ? lease.rent_includes : []
  if (comp.length === 0) return 0
  const subjSet = new Set(subj)
  const compSet = new Set(comp)
  let inter = 0
  for (const x of subjSet) if (compSet.has(x)) inter++
  const union = subjSet.size + compSet.size - inter
  if (union === 0) return 0
  return RENT_INCL_WEIGHT * (inter / union)
}

// Basement-pool confidence supplement: when subject AND comp are both in the
// Basement portion pool, score the basement jsonb similarity (Finished /
// Separate Entrance / Walk-Out). Up to 5 pts. Outside the basement pool the
// supplement returns 0 (basement features irrelevant for upper / entire).
function basementBasementSupplement(lease: any, specs: any): number {
  if (!GATE_PORTION) return 0  // when portion gate is off, we don't know which pool the comp is in
  if (portionPool(specs.subjectPortionPropertyLease) !== 'Basement') return 0
  if (portionPool(lease.portion_property_lease) !== 'Basement') return 0
  const subjB = Array.isArray(specs.basementRaw) ? specs.basementRaw : null
  const compB = Array.isArray(lease.basement) ? lease.basement : null
  if (!subjB || !compB) return 0
  const subjSet = new Set(subjB)
  const compSet = new Set(compB)
  let inter = 0
  for (const x of subjSet) if (compSet.has(x)) inter++
  if (subjSet.size === 0 || compSet.size === 0) return 0
  return 5 * (inter / Math.max(subjSet.size, compSet.size))
}

/**
 * Home Rental Comparable Matcher - Cascading Geographic Search
 * Same pattern as sales but queries For Lease transactions
 */
export async function findHomeComparablesRentals(specs: HomeSpecs): Promise<HomeRentalMatchResult> {
  const supabase = createClient()
  const twoYearsAgo = new Date()
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)

  const subtypes = getCompatibleSubtypes(specs.propertySubtype)

  // v10 step 3 Phase 1 (2026-06-09): resolve per-tenant lease overrides once
  // at the top. Anonymous / System 1 / no-tenantId callers get DEFAULT
  // fallback (= f7f3c6e behavior). Lease side reads PARKING_PER_SPACE and
  // BATHROOM_FULL from the resolved object (mapped to HOME_RENTAL_ADJUSTMENTS
  // semantics inside createHomeRentalComparable).
  const customValues = await resolveHomeAdjustments(
    {
      communityId: specs.communityId,
      municipalityId: specs.municipalityId,
      tenantId: specs.tenantId ?? null,
    },
    'lease',
  )

  // TIER 1: Community level
  if (specs.communityId) {
    const { data: communityLeases } = await supabase
      .from('mls_listings')
      .select(HOME_RENTAL_SELECT)
      .eq('community_id', specs.communityId)
      .in('property_subtype', subtypes)
      .eq('transaction_type', 'For Lease')
      .eq('standard_status', 'Closed')
      .not('close_price', 'is', null)
      .gte('close_date', twoYearsAgo.toISOString())
      .order('close_date', { ascending: false })
      .limit(200)

    if (communityLeases && communityLeases.length > 0) {
      // h9: lease type gates run BEFORE sub-tier matching. The gate-filtered
      // pool feeds matchWithinPool; sub-tier (exact-sqft/LAR/bed+bath/bed-only)
      // logic stays untouched. When subject lacks a gate-relevant field OR
      // the gate's env knob is off, that gate skips (silent-omit) — recovered
      // behavior is byte-identical to pre-h9.
      const gated = applyLeaseTypeGates(communityLeases, specs)
      if (gated.length > 0) {
        const result = matchWithinPool(gated, specs, customValues)
        if (result.comparables.length >= 3) {
          return { ...result, geoLevel: 'community' }
        }
      }
    }
  }

  // TIER 2: Municipality level (fallback)
  if (specs.municipalityId) {
    const { data: muniLeases } = await supabase
      .from('mls_listings')
      .select(HOME_RENTAL_SELECT)
      .eq('municipality_id', specs.municipalityId)
      .in('property_subtype', subtypes)
      .eq('transaction_type', 'For Lease')
      .eq('standard_status', 'Closed')
      .not('close_price', 'is', null)
      .gte('close_date', twoYearsAgo.toISOString())
      .order('close_date', { ascending: false })
      .limit(300)

    if (muniLeases && muniLeases.length > 0) {
      const gated = applyLeaseTypeGates(muniLeases, specs)
      if (gated.length > 0) {
        const result = matchWithinPool(gated, specs, customValues)
        if (result.comparables.length > 0) {
          return { ...result, geoLevel: 'municipality' }
        }
      }
    }
  }

  return { tier: 'CONTACT', comparables: [], geoLevel: 'none' }
}

function matchWithinPool(
  leases: any[],
  specs: HomeSpecs,
  customValues?: ResolvedHomeAdjustments,
): { tier: MatchTier; comparables: ComparableSale[] } {
  const bedBathMatches = leases.filter(l =>
    l.bedrooms_total === specs.bedrooms &&
    l.bathrooms_total_integer === specs.bathrooms
  )

  // SUB-TIER A: Exact sqft ±10%
  if (specs.exactSqft && specs.exactSqft > 0) {
    const tolerance = specs.exactSqft * 0.10
    const sqftMatches = bedBathMatches.filter(l => {
      const compSqft = extractExactSqft(l.square_foot_source)
      return compSqft && compSqft >= specs.exactSqft! - tolerance && compSqft <= specs.exactSqft! + tolerance
    })
    if (sqftMatches.length >= 3) {
      return {
        tier: 'BINGO',
        comparables: sqftMatches.slice(0, 10).map(l => createHomeRentalComparable(l, specs, customValues))
      }
    }
  }

  // SUB-TIER B: Same living area range
  if (specs.livingAreaRange) {
    const rangeMatches = bedBathMatches.filter(l => l.living_area_range === specs.livingAreaRange)
    if (rangeMatches.length >= 3) {
      return {
        tier: 'RANGE',
        comparables: rangeMatches.slice(0, 10).map(l => createHomeRentalComparable(l, specs, customValues))
      }
    }
  }

  // SUB-TIER C: Bed match + bath ±1
  const looseBathMatches = leases.filter(l =>
    l.bedrooms_total === specs.bedrooms &&
    Math.abs((l.bathrooms_total_integer || 0) - specs.bathrooms) <= 1
  )

  if (looseBathMatches.length >= 3) {
    const scored = looseBathMatches.map(l => ({
      lease: l,
      score: scoreRentalSimilarity(l, specs)
    }))
    scored.sort((a, b) => b.score - a.score)
    return {
      tier: 'RANGE-ADJ',
      comparables: scored.slice(0, 10).map(s => createHomeRentalComparable(s.lease, specs, customValues))
    }
  }

  // SUB-TIER D: Just bedrooms
  const bedOnlyMatches = leases.filter(l => l.bedrooms_total === specs.bedrooms)
  if (bedOnlyMatches.length >= 2) {
    const scored = bedOnlyMatches.map(l => ({
      lease: l,
      score: scoreRentalSimilarity(l, specs)
    }))
    scored.sort((a, b) => b.score - a.score)
    return {
      tier: 'MAINT',
      comparables: scored.slice(0, 10).map(s => createHomeRentalComparable(s.lease, specs, customValues))
    }
  }

  if (leases.length > 0) {
    return {
      tier: 'CONTACT',
      comparables: leases.slice(0, 5).map(l => createHomeRentalComparable(l, specs, customValues))
    }
  }

  return { tier: 'CONTACT', comparables: [] }
}

function scoreRentalSimilarity(lease: any, specs: HomeSpecs): number {
  let score = 100

  const bathDiff = Math.abs((lease.bathrooms_total_integer || 0) - specs.bathrooms)
  if (bathDiff === 0) score += 20
  else if (bathDiff === 1) score += 10
  else score -= 20

  if (specs.exactSqft && specs.exactSqft > 0) {
    const compSqft = extractExactSqft(lease.square_foot_source)
    if (compSqft) {
      const sqftDiff = Math.abs(compSqft - specs.exactSqft)
      if (sqftDiff <= 50) score += 40
      else if (sqftDiff <= 100) score += 30
      else if (sqftDiff <= 200) score += 20
      else if (sqftDiff <= 300) score += 10
      else score -= 5
    }
  } else if (specs.livingAreaRange) {
    if (lease.living_area_range === specs.livingAreaRange) score += 30
    else score -= 10
  }

  const parkDiff = Math.abs((lease.parking_total || 0) - (specs.parking || 0))
  if (parkDiff === 0) score += 15
  else if (parkDiff === 1) score += 5
  else score -= 10

  if (lease.close_date) {
    const monthsAgo = (Date.now() - new Date(lease.close_date).getTime()) / (1000 * 60 * 60 * 24 * 30)
    if (monthsAgo <= 3) score += 15
    else if (monthsAgo <= 6) score += 10
    else if (monthsAgo <= 12) score += 5
  }

  // h9 (2026-06-10): rent_includes Jaccard-overlap nudge (default weight 10).
  // Silent-omit on missing subject array. Score-only — never affects pool.
  score += rentIncludesNudge(lease, specs)

  // h9 (2026-06-10): basement-pool confidence supplement (up to 5 pts).
  // Active only when subject + comp are both in the Basement portion pool;
  // returns 0 elsewhere. Score-only.
  score += basementBasementSupplement(lease, specs)

  return score
}

function createHomeRentalComparable(
  lease: any,
  specs: HomeSpecs,
  customValues?: ResolvedHomeAdjustments,
): ComparableSale {
  const adjustments: PriceAdjustment[] = []

  // v10 step 3 Phase 1 (2026-06-09): lease-side overrides. BATHROOM_FULL maps
  // to the lease bathroom $/mo value; PARKING_PER_SPACE maps to lease parking
  // $/mo. ?? fallback preserves f7f3c6e behavior when no override row exists.
  const bathDiff = specs.bathrooms - (lease.bathrooms_total_integer || 0)
  if (bathDiff !== 0) {
    const bathAmt = customValues?.BATHROOM_FULL ?? HOME_RENTAL_ADJUSTMENTS.BATHROOM
    adjustments.push({
      type: 'bathroom' as any,
      difference: bathDiff,
      adjustmentAmount: bathDiff * bathAmt,
      reason: bathDiff > 0
        ? `Your home has ${Math.abs(bathDiff)} more bathroom${Math.abs(bathDiff) > 1 ? 's' : ''}`
        : `Comparable has ${Math.abs(bathDiff)} more bathroom${Math.abs(bathDiff) > 1 ? 's' : ''}`
    })
  }

  const parkDiff = (specs.parking || 0) - (lease.parking_total || 0)
  if (parkDiff !== 0) {
    const parkAmt = customValues?.PARKING_PER_SPACE ?? HOME_RENTAL_ADJUSTMENTS.PARKING_PER_SPACE
    adjustments.push({
      type: 'parking',
      difference: parkDiff,
      adjustmentAmount: parkDiff * parkAmt,
      reason: parkDiff > 0
        ? `Your home has ${Math.abs(parkDiff)} more parking space${Math.abs(parkDiff) > 1 ? 's' : ''}`
        : `Comparable has ${Math.abs(parkDiff)} more parking space${Math.abs(parkDiff) > 1 ? 's' : ''}`
    })
  }

  let adjustedPrice = lease.close_price
  adjustments.forEach(a => { adjustedPrice += a.adjustmentAmount })

  let matchQuality: 'Perfect' | 'Excellent' | 'Good' | 'Fair' = 'Good'
  if (adjustments.length === 0) matchQuality = 'Perfect'
  else if (adjustments.length === 1) matchQuality = 'Excellent'

  return {
    closePrice: lease.close_price,
    listPrice: lease.list_price,
    bedrooms: lease.bedrooms_total,
    bathrooms: lease.bathrooms_total_integer || 0,
    livingAreaRange: lease.living_area_range || 'Unknown',
    parking: lease.parking_total || 0,
    locker: lease.locker || 'None',
    daysOnMarket: lease.days_on_market || 0,
    closeDate: lease.close_date,
    taxAnnualAmount: undefined,
    exactSqft: extractExactSqft(lease.square_foot_source) ?? undefined,
    userExactSqft: specs.exactSqft || undefined,
    associationFee: undefined,
    unitNumber: lease.street_number ? `${lease.street_number} ${lease.street_name || ''}`.trim() : lease.unit_number,
    listingKey: lease.listing_key,
    temperature: assignTemperature(lease.close_date),
    matchTier: 'RANGE' as MatchTier,
    matchQuality,
    adjustments: adjustments.length > 0 ? adjustments : undefined,
    adjustedPrice: adjustments.length > 0 ? adjustedPrice : undefined,
  }
}

function getCompatibleSubtypes(subtype: string): string[] {
  const detachedTypes = ['Detached']
  const attachedTypes = ['Semi-Detached', 'Att/Row/Townhouse', 'Link']
  const multiTypes = ['Duplex', 'Triplex', 'Fourplex', 'Multiplex']
  if (detachedTypes.includes(subtype)) return detachedTypes
  if (attachedTypes.includes(subtype)) return attachedTypes
  if (multiTypes.includes(subtype)) return multiTypes
  return [subtype]
}