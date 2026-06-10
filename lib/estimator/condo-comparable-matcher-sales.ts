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
//   CONDO_SALE_PLATINUM_MIN_COMPS (default <swept-value> — c2-follow-on, sale-only)
//                                  Platinum (same-building) tier anchors only
//                                  when the within-building bed+bath pool yields
//                                  ≥N comps after the sub-tier match. Below N,
//                                  fall through to Gold. Rationale: thin
//                                  within-building SALE comp pools (1-3 comps,
//                                  per c2 distribution recon) produce
//                                  high-variance estimates; falling through to
//                                  community lets the larger comp pool +
//                                  score-nudge picker do better. LEASE is
//                                  UNTOUCHED (c1 confirmed Platinum-first is
//                                  correct for lease — same-building rents are
//                                  tight + plentiful).
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
// c2-follow-on (2026-06-10): Platinum sub-tier comp-count threshold. Default
// is the winning N from the sweep. When the within-building pool yields
// fewer comps, fall through to Gold instead of anchoring on Platinum.
const PLATINUM_MIN_COMPS = (() => {
  const v = parseInt(process.env.CONDO_SALE_PLATINUM_MIN_COMPS || '7', 10)
  return Number.isFinite(v) && v >= 1 ? v : 7
})()
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

export async function findCondoComparablesSales(specs: CondoSaleSpecs): Promise<CondoSaleMatchResult> {
  const supabase = createClient()
  const twoYearsAgo = new Date()
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
  const sinceISO = twoYearsAgo.toISOString()

  const customValues = await resolveCondoAdjustments(specs.buildingId || null, 'sale', specs.tenantId ?? null)

  // TIER 1 — PLATINUM: same building. Existing within-building 7-tier
  // (BINGO/RANGE/MAINT) carries the within-building match.
  if (specs.buildingId) {
    const { data: bldgSales } = await supabase
      .from('mls_listings')
      .select(CONDO_SALE_SELECT)
      .eq('building_id', specs.buildingId)
      .eq('transaction_type', 'For Sale')
      .eq('standard_status', 'Closed')
      .not('close_price', 'is', null)
      .gt('close_price', 100000)
      .gte('close_date', sinceISO)
      .order('close_date', { ascending: false })

    if (bldgSales && bldgSales.length > 0) {
      const result = matchWithinBuilding(bldgSales, specs, customValues)
      // c2-follow-on: anchor on Platinum only when the within-building match
      // yielded ≥ PLATINUM_MIN_COMPS comps. Thin pools fall through to Gold
      // (the community-level cascade) where the larger comp pool +
      // score-nudge ordering produces lower-variance estimates.
      if (result.comparables.length >= PLATINUM_MIN_COMPS) {
        return { ...result, geoLevel: 'building' }
      }
    }
  }

  // TIER 2 — GOLD: same community.
  if (specs.communityId) {
    const { data: commSales } = await supabase
      .from('mls_listings')
      .select(CONDO_SALE_SELECT)
      .eq('community_id', specs.communityId)
      .eq('transaction_type', 'For Sale')
      .eq('standard_status', 'Closed')
      .not('close_price', 'is', null)
      .gt('close_price', 100000)
      .gte('close_date', sinceISO)
      .order('close_date', { ascending: false })
      .limit(300)

    if (commSales && commSales.length > 0) {
      const result = matchAcrossBuildings(commSales, specs, customValues)
      if (result.comparables.length >= 3) {
        return { ...result, geoLevel: 'community' }
      }
    }
  }

  // TIER 3 — SILVER: same municipality.
  if (specs.municipalityId) {
    const { data: muniSales } = await supabase
      .from('mls_listings')
      .select(CONDO_SALE_SELECT)
      .eq('municipality_id', specs.municipalityId)
      .eq('transaction_type', 'For Sale')
      .eq('standard_status', 'Closed')
      .not('close_price', 'is', null)
      .gt('close_price', 100000)
      .gte('close_date', sinceISO)
      .order('close_date', { ascending: false })
      .limit(500)

    if (muniSales && muniSales.length > 0) {
      const result = matchAcrossBuildings(muniSales, specs, customValues)
      if (result.comparables.length >= 3) {
        return { ...result, geoLevel: 'municipality' }
      }
    }
  }

  // TIER 4 — BRONZE: same area.
  if (specs.areaId) {
    const munis = await munisInArea(specs.areaId, supabase)
    if (munis.length > 0) {
      const { data: areaSales } = await supabase
        .from('mls_listings')
        .select(CONDO_SALE_SELECT + ', municipality_id')
        .eq('transaction_type', 'For Sale')
        .eq('standard_status', 'Closed')
        .not('close_price', 'is', null)
        .gt('close_price', 100000)
        .gte('close_date', sinceISO)
        .in('municipality_id', munis)
        .order('close_date', { ascending: false })
        .limit(500)

      if (areaSales && areaSales.length > 0) {
        const result = matchAcrossBuildings(areaSales, specs, customValues)
        if (result.comparables.length >= 1) {
          return { ...result, geoLevel: 'area' }
        }
      }
    }
  }

  return { tier: 'CONTACT', comparables: [], geoLevel: 'none' }
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
function matchWithinBuilding(
  sales: any[],
  specs: CondoSaleSpecs,
  customValues: ResolvedCondoAdjustments,
): { tier: MatchTier; comparables: ComparableSale[] } {
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
      return { tier: 'BINGO', comparables: scoreAndShape(bingo, specs, customValues, 'BINGO', false) }
    }
    const bingoAdj = bedBath.filter(s => {
      const sf = extractExactSqft(s.square_foot_source)
      return sf && sf >= min && sf <= max
    })
    if (bingoAdj.length > 0) {
      return { tier: 'BINGO-ADJ', comparables: scoreAndShape(bingoAdj, specs, customValues, 'BINGO-ADJ', true) }
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
      return { tier: 'RANGE', comparables: scoreAndShape(range, specs, customValues, 'RANGE', false) }
    }
    const rangeAdj = bedBath.filter(s => s.living_area_range === specs.livingAreaRange)
    if (rangeAdj.length > 0) {
      return { tier: 'RANGE-ADJ', comparables: scoreAndShape(rangeAdj, specs, customValues, 'RANGE-ADJ', true) }
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
      return { tier: 'MAINT', comparables: scoreAndShape(maint, specs, customValues, 'MAINT', false) }
    }
    const maintAdj = bedBath.filter(s => isMaintenanceMatch(specs.associationFee, s.association_fee, 0.20))
    if (maintAdj.length > 0) {
      return { tier: 'MAINT-ADJ', comparables: scoreAndShape(maintAdj, specs, customValues, 'MAINT-ADJ', true) }
    }
  }

  return { tier: 'CONTACT', comparables: [] }
}

// ===== Within Gold/Silver/Bronze (cross-building) =====
function matchAcrossBuildings(
  sales: any[],
  specs: CondoSaleSpecs,
  customValues: ResolvedCondoAdjustments,
): { tier: MatchTier; comparables: ComparableSale[] } {
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
      return {
        tier: 'RANGE',
        comparables: scored.slice(0, 10).map(x => createCrossBuildingComp(x.s, specs)),
      }
    }
  }

  // bed+bath fallback with score-nudge.
  if (bedBath.length >= 3) {
    const scored = bedBath.map(s => ({ s, sc: scoreSim(s, specs) }))
    scored.sort((a, b) => b.sc - a.sc)
    return {
      tier: 'RANGE-ADJ',
      comparables: scored.slice(0, 10).map(x => createCrossBuildingComp(x.s, specs)),
    }
  }

  // bed-only last resort.
  const bedOnly = sales.filter(s => s.bedrooms_total === specs.bedrooms)
  if (bedOnly.length >= 1) {
    const scored = bedOnly.map(s => ({ s, sc: scoreSim(s, specs) }))
    scored.sort((a, b) => b.sc - a.sc)
    return {
      tier: 'CONTACT',
      comparables: scored.slice(0, 5).map(x => createCrossBuildingComp(x.s, specs)),
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

function scoreAndShape(
  sales: any[],
  specs: CondoSaleSpecs,
  customValues: ResolvedCondoAdjustments,
  tier: MatchTier,
  applyAdj: boolean,
): ComparableSale[] {
  // Within-Platinum: pricing carries by within-building structure; tax band +
  // maint-PSF nudges reorder but the top-N stays same-building.
  const scored = sales.map(s => ({ s, sc: scoreSim(s, specs) }))
  scored.sort((a, b) => b.sc - a.sc)
  return scored.slice(0, 10).map(x => createComp(x.s, specs, customValues, applyAdj, tier))
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
    if (subjL !== compL) {
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
  }
}
