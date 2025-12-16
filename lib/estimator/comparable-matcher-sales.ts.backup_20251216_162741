// lib/estimator/comparable-matcher-sales.ts
import { createClient } from '@/lib/supabase/client'
import { 
  ComparableSale, 
  UnitSpecs, 
  PriceAdjustment, 
  MatchTier,
  ADJUSTMENT_VALUES, 
  extractExactSqft,
  assignTemperature,
  isMaintenanceMatch
} from './types'

interface MatchResult {
  tier: MatchTier
  comparables: ComparableSale[]
}

/**
 * Finds comparable sales using 7-tier matching:
 * BINGO → BINGO-ADJ → RANGE → RANGE-ADJ → MAINT → MAINT-ADJ → CONTACT
 */
export async function findComparables(specs: UnitSpecs): Promise<MatchResult> {
  const supabase = createClient()

  // Query closed sales from last 2 years in this specific building
  const twoYearsAgo = new Date()
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
  
  const { data: allSales, error } = await supabase
    .from('mls_listings')
    .select('id, unit_number, listing_key, close_price, list_price, bedrooms_total, bathrooms_total_integer, living_area_range, parking_total, locker, days_on_market, close_date, tax_annual_amount, square_foot_source, association_fee')
    .eq('building_id', specs.buildingId)
    .eq('standard_status', 'Closed')
    .not('close_price', 'is', null)
    .gte('close_date', twoYearsAgo.toISOString())
    .gt('close_price', 100000)
    .order('close_date', { ascending: false })

  if (error || !allSales || allSales.length === 0) {
    console.error('Error fetching comparables:', error)
    return { tier: 'CONTACT', comparables: [] }
  }

  // Filter for same bedroom AND bathroom (strict requirement for all tiers)
  const bedBathMatches = allSales.filter(sale =>
    sale.bedrooms_total === specs.bedrooms &&
    sale.bathrooms_total_integer === specs.bathrooms
  )

  if (bedBathMatches.length === 0) {
    // No bed/bath matches - go to CONTACT with reference units
    const referenceComparables = findReferenceComparables(allSales, specs)
    return { tier: 'CONTACT', comparables: referenceComparables }
  }

  // TIER 1: BINGO - Exact sqft ±10% + same parking + same locker
  const bingoMatches = findBingoMatches(bedBathMatches, specs, false)
  if (bingoMatches.length > 0) {
    return { tier: 'BINGO', comparables: bingoMatches }
  }

  // TIER 2: BINGO-ADJ - Exact sqft ±10% + parking/locker may differ
  const bingoAdjMatches = findBingoMatches(bedBathMatches, specs, true)
  if (bingoAdjMatches.length > 0) {
    return { tier: 'BINGO-ADJ', comparables: bingoAdjMatches }
  }

  // TIER 3: RANGE - Same sqft range + same parking + same locker
  const rangeMatches = findRangeMatches(bedBathMatches, specs, false)
  if (rangeMatches.length > 0) {
    return { tier: 'RANGE', comparables: rangeMatches }
  }

  // TIER 4: RANGE-ADJ - Same sqft range + parking/locker may differ
  const rangeAdjMatches = findRangeMatches(bedBathMatches, specs, true)
  if (rangeAdjMatches.length > 0) {
    return { tier: 'RANGE-ADJ', comparables: rangeAdjMatches }
  }

  // TIER 5: MAINT - Association fee ±20% + same parking + same locker
  const maintMatches = findMaintenanceMatches(bedBathMatches, specs, false)
  if (maintMatches.length > 0) {
    return { tier: 'MAINT', comparables: maintMatches }
  }

  // TIER 6: MAINT-ADJ - Association fee ±20% + parking/locker may differ
  const maintAdjMatches = findMaintenanceMatches(bedBathMatches, specs, true)
  if (maintAdjMatches.length > 0) {
    return { tier: 'MAINT-ADJ', comparables: maintAdjMatches }
  }

  // TIER 7: CONTACT - No good matches
  const referenceComparables = findReferenceComparables(allSales, specs)
  return { tier: 'CONTACT', comparables: referenceComparables }
}

/**
 * BINGO Match: Exact sqft ±10% + bed + bath + (parking + locker if not adjusted)
 */
function findBingoMatches(sales: any[], specs: UnitSpecs, allowAdjustments: boolean): ComparableSale[] {
  if (!specs.exactSqft) return [] // Need exact sqft for BINGO
  
  const sqftTolerance = specs.exactSqft * 0.10 // ±10%
  const minSqft = specs.exactSqft - sqftTolerance
  const maxSqft = specs.exactSqft + sqftTolerance

  const matches = sales.filter(sale => {
    const saleExactSqft = extractExactSqft(sale.square_foot_source)
    if (!saleExactSqft) return false
    
    // Exact sqft within ±10%
    const sqftMatch = saleExactSqft >= minSqft && saleExactSqft <= maxSqft
    if (!sqftMatch) return false

    if (allowAdjustments) {
      // BINGO-ADJ: parking/locker can differ
      return true
    } else {
      // BINGO: parking AND locker must match
      const parkingMatch = (sale.parking_total || 0) === specs.parking
      const lockerMatch = (sale.locker === 'Owned') === specs.hasLocker
      return parkingMatch && lockerMatch
    }
  })

  return matches.map(sale => createComparable(sale, specs, allowAdjustments))
}

/**
 * RANGE Match: Same sqft range + bed + bath + (parking + locker if not adjusted)
 */
function findRangeMatches(sales: any[], specs: UnitSpecs, allowAdjustments: boolean): ComparableSale[] {
  const matches = sales.filter(sale => {
    // Exact sqft range match
    const rangeMatch = sale.living_area_range === specs.livingAreaRange
    if (!rangeMatch) return false

    if (allowAdjustments) {
      // RANGE-ADJ: parking/locker can differ
      return true
    } else {
      // RANGE: parking AND locker must match
      const parkingMatch = (sale.parking_total || 0) === specs.parking
      const lockerMatch = (sale.locker === 'Owned') === specs.hasLocker
      return parkingMatch && lockerMatch
    }
  })

  return matches.map(sale => createComparable(sale, specs, allowAdjustments))
}

/**
 * MAINT Match: Association fee ±20% + bed + bath + (parking + locker if not adjusted)
 */
function findMaintenanceMatches(sales: any[], specs: UnitSpecs, allowAdjustments: boolean): ComparableSale[] {
  if (!specs.associationFee) return [] // Need user's fee for MAINT

  const matches = sales.filter(sale => {
    // Association fee within ±20%
    const feeMatch = isMaintenanceMatch(specs.associationFee, sale.association_fee, 0.20)
    if (!feeMatch) return false

    if (allowAdjustments) {
      // MAINT-ADJ: parking/locker can differ
      return true
    } else {
      // MAINT: parking AND locker must match
      const parkingMatch = (sale.parking_total || 0) === specs.parking
      const lockerMatch = (sale.locker === 'Owned') === specs.hasLocker
      return parkingMatch && lockerMatch
    }
  })

  return matches.map(sale => createComparable(sale, specs, allowAdjustments))
}

/**
 * CONTACT: Reference comparables when no good matches exist
 * Shows units within 35% sqft range variance
 */
function findReferenceComparables(allSales: any[], specs: UnitSpecs): ComparableSale[] {
  // Get midpoint of user's sqft range
  const userRangeMidpoint = getRangeMidpoint(specs.livingAreaRange)
  
  // Filter to same bedroom (at minimum) and within 35% sqft variance
  const references = allSales.filter(sale => {
    // Must be same bedroom count
    if (sale.bedrooms_total !== specs.bedrooms) return false
    
    const saleRangeMidpoint = getRangeMidpoint(sale.living_area_range)
    if (!userRangeMidpoint || !saleRangeMidpoint) return true // Include if can't calculate
    
    const variance = Math.abs(userRangeMidpoint - saleRangeMidpoint) / userRangeMidpoint
    return variance <= 0.35 // Within 35%
  })

  // Sort by sqft variance (closest first)
  const sorted = references.sort((a, b) => {
    const aVariance = getSqftVariance(a.living_area_range, specs.livingAreaRange)
    const bVariance = getSqftVariance(b.living_area_range, specs.livingAreaRange)
    return aVariance - bVariance
  })

  return sorted.slice(0, 5).map(sale => {
    const variance = getSqftVariance(sale.living_area_range, specs.livingAreaRange)
    const variancePercent = Math.round(variance * 100)
    
    // Build mismatch reasons
    const reasons: string[] = []
    if (sale.bathrooms_total_integer !== specs.bathrooms) {
      reasons.push(`${sale.bathrooms_total_integer} bath vs your ${specs.bathrooms} bath`)
    }
    if (sale.living_area_range !== specs.livingAreaRange) {
      reasons.push(`${sale.living_area_range} sqft vs your ${specs.livingAreaRange} sqft (${variancePercent}% diff)`)
    }
    if ((sale.parking_total || 0) !== specs.parking) {
      reasons.push(`${sale.parking_total || 0} parking vs your ${specs.parking}`)
    }

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
      matchTier: 'CONTACT' as MatchTier,
      matchQuality: 'Fair' as const,
      mismatchReason: reasons.join(' • ') || 'Different configuration'
    }
  })
}

/**
 * Create ComparableSale object with optional adjustments
 */
function createComparable(sale: any, specs: UnitSpecs, applyAdjustments: boolean): ComparableSale {
  const adjustments: PriceAdjustment[] = []
  let adjustedPrice = sale.close_price

  if (applyAdjustments) {
    // Parking adjustment
    const parkingDiff = specs.parking - (sale.parking_total || 0)
    if (parkingDiff !== 0) {
      const adjustmentAmount = parkingDiff * ADJUSTMENT_VALUES.PARKING_PER_SPACE
      adjustedPrice += adjustmentAmount
      adjustments.push({
        type: 'parking',
        difference: parkingDiff,
        adjustmentAmount,
        reason: parkingDiff > 0
          ? `Your unit has ${Math.abs(parkingDiff)} more parking space${Math.abs(parkingDiff) > 1 ? 's' : ''}`
          : `Comparable has ${Math.abs(parkingDiff)} more parking space${Math.abs(parkingDiff) > 1 ? 's' : ''}`
      })
    }

    // Locker adjustment
    const userHasLocker = specs.hasLocker
    const compHasLocker = sale.locker === 'Owned'
    if (userHasLocker !== compHasLocker) {
      const adjustmentAmount = userHasLocker ? ADJUSTMENT_VALUES.LOCKER : -ADJUSTMENT_VALUES.LOCKER
      adjustedPrice += adjustmentAmount
      adjustments.push({
        type: 'locker',
        difference: userHasLocker ? 1 : -1,
        adjustmentAmount,
        reason: userHasLocker ? 'Your unit includes a locker' : 'Comparable includes a locker'
      })
    }
  }

  // Determine match quality
  let matchQuality: 'Perfect' | 'Excellent' | 'Good' | 'Fair' = 'Good'
  if (adjustments.length === 0) matchQuality = 'Perfect'
  else if (adjustments.length === 1) matchQuality = 'Excellent'

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
    matchTier: (adjustments.length > 0 ? 'ADJUSTED' : 'EXACT') as any, // Will be overwritten by caller
    matchQuality,
    adjustments,
    adjustedPrice
  }
}

/**
 * Get midpoint of sqft range (e.g., "800-899" → 850)
 */
function getRangeMidpoint(range: string | null): number | null {
  if (!range) return null
  const match = range.match(/^(\d+)-(\d+)$/)
  if (!match) return null
  return (parseInt(match[1]) + parseInt(match[2])) / 2
}

/**
 * Calculate sqft variance between two ranges
 */
function getSqftVariance(range1: string | null, range2: string): number {
  const mid1 = getRangeMidpoint(range1)
  const mid2 = getRangeMidpoint(range2)
  if (!mid1 || !mid2) return 0
  return Math.abs(mid1 - mid2) / mid2
}

// Legacy export for backwards compatibility
export { findComparables as findComparablesSales }