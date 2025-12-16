// lib/estimator/comparable-matcher-rentals.ts
import { createClient } from '@/lib/supabase/client'
import { 
  ComparableSale, 
  UnitSpecs, 
  PriceAdjustment, 
  MatchTier,
  ADJUSTMENT_VALUES_LEASE, 
  extractExactSqft,
  assignTemperature
} from './types'

interface MatchResult {
  tier: MatchTier
  comparables: ComparableSale[]
}

/**
 * Finds comparable leases using 5-tier matching:
 * BINGO → BINGO-ADJ → RANGE → RANGE-ADJ → CONTACT
 * (No MAINT tier for rentals - association fee not relevant)
 */
export async function findComparablesRentals(specs: UnitSpecs): Promise<MatchResult> {
  const supabase = createClient()

  // Query closed leases from last 2 years in this specific building
  const twoYearsAgo = new Date()
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
  
  const { data: allLeases, error } = await supabase
    .from('mls_listings')
    .select('id, unit_number, listing_key, close_price, list_price, bedrooms_total, bathrooms_total_integer, living_area_range, parking_total, locker, days_on_market, close_date, square_foot_source, association_fee')
    .eq('building_id', specs.buildingId)
    .eq('transaction_type', 'For Lease')
    .eq('standard_status', 'Closed')
    .not('close_price', 'is', null)
    .gte('close_date', twoYearsAgo.toISOString())
    .order('close_date', { ascending: false })

  if (error || !allLeases || allLeases.length === 0) {
    console.error('Error fetching comparable leases:', error)
    return { tier: 'CONTACT', comparables: [] }
  }

  // Filter for same bedroom AND bathroom (strict requirement for all tiers)
  const bedBathMatches = allLeases.filter(lease =>
    lease.bedrooms_total === specs.bedrooms &&
    lease.bathrooms_total_integer === specs.bathrooms
  )

  if (bedBathMatches.length === 0) {
    // No bed/bath matches - go to CONTACT with reference units
    const referenceComparables = findReferenceComparables(allLeases, specs)
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

  // TIER 5: CONTACT - No good matches
  const referenceComparables = findReferenceComparables(allLeases, specs)
  return { tier: 'CONTACT', comparables: referenceComparables }
}

/**
 * BINGO Match: Exact sqft ±10% + bed + bath + (parking + locker if not adjusted)
 */
function findBingoMatches(leases: any[], specs: UnitSpecs, allowAdjustments: boolean): ComparableSale[] {
  if (!specs.exactSqft) return [] // Need exact sqft for BINGO
  
  const sqftTolerance = specs.exactSqft * 0.10 // ±10%
  const minSqft = specs.exactSqft - sqftTolerance
  const maxSqft = specs.exactSqft + sqftTolerance

  const matches = leases.filter(lease => {
    const leaseExactSqft = extractExactSqft(lease.square_foot_source)
    if (!leaseExactSqft) return false
    
    // Exact sqft within ±10%
    const sqftMatch = leaseExactSqft >= minSqft && leaseExactSqft <= maxSqft
    if (!sqftMatch) return false

    if (allowAdjustments) {
      // BINGO-ADJ: parking/locker can differ
      return true
    } else {
      // BINGO: parking AND locker must match
      const parkingMatch = (lease.parking_total || 0) === specs.parking
      const lockerMatch = (lease.locker === 'Owned') === specs.hasLocker
      return parkingMatch && lockerMatch
    }
  })

  return matches.map(lease => createComparable(lease, specs, allowAdjustments))
}

/**
 * RANGE Match: Same sqft range + bed + bath + (parking + locker if not adjusted)
 */
function findRangeMatches(leases: any[], specs: UnitSpecs, allowAdjustments: boolean): ComparableSale[] {
  const matches = leases.filter(lease => {
    // Exact sqft range match
    const rangeMatch = lease.living_area_range === specs.livingAreaRange
    if (!rangeMatch) return false

    if (allowAdjustments) {
      // RANGE-ADJ: parking/locker can differ
      return true
    } else {
      // RANGE: parking AND locker must match
      const parkingMatch = (lease.parking_total || 0) === specs.parking
      const lockerMatch = (lease.locker === 'Owned') === specs.hasLocker
      return parkingMatch && lockerMatch
    }
  })

  return matches.map(lease => createComparable(lease, specs, allowAdjustments))
}

/**
 * CONTACT: Reference comparables when no good matches exist
 * Shows units within 35% sqft range variance
 */
function findReferenceComparables(allLeases: any[], specs: UnitSpecs): ComparableSale[] {
  // Get midpoint of user's sqft range
  const userRangeMidpoint = getRangeMidpoint(specs.livingAreaRange)
  
  // Filter to same bedroom (at minimum) and within 35% sqft variance
  const references = allLeases.filter(lease => {
    // Must be same bedroom count
    if (lease.bedrooms_total !== specs.bedrooms) return false
    
    const leaseRangeMidpoint = getRangeMidpoint(lease.living_area_range)
    if (!userRangeMidpoint || !leaseRangeMidpoint) return true // Include if can't calculate
    
    const variance = Math.abs(userRangeMidpoint - leaseRangeMidpoint) / userRangeMidpoint
    return variance <= 0.35 // Within 35%
  })

  // Sort by sqft variance (closest first)
  const sorted = references.sort((a, b) => {
    const aVariance = getSqftVariance(a.living_area_range, specs.livingAreaRange)
    const bVariance = getSqftVariance(b.living_area_range, specs.livingAreaRange)
    return aVariance - bVariance
  })

  return sorted.slice(0, 5).map(lease => {
    const variance = getSqftVariance(lease.living_area_range, specs.livingAreaRange)
    const variancePercent = Math.round(variance * 100)
    
    // Build mismatch reasons
    const reasons: string[] = []
    if (lease.bathrooms_total_integer !== specs.bathrooms) {
      reasons.push(`${lease.bathrooms_total_integer} bath vs your ${specs.bathrooms} bath`)
    }
    if (lease.living_area_range !== specs.livingAreaRange) {
      reasons.push(`${lease.living_area_range} sqft vs your ${specs.livingAreaRange} sqft (${variancePercent}% diff)`)
    }
    if ((lease.parking_total || 0) !== specs.parking) {
      reasons.push(`${lease.parking_total || 0} parking vs your ${specs.parking}`)
    }

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
      matchTier: 'CONTACT' as MatchTier,
      matchQuality: 'Fair' as const,
      mismatchReason: reasons.join(' • ') || 'Different configuration'
    }
  })
}

/**
 * Create ComparableSale object with optional adjustments (parking/locker only)
 */
function createComparable(lease: any, specs: UnitSpecs, applyAdjustments: boolean): ComparableSale {
  const adjustments: PriceAdjustment[] = []
  let adjustedPrice = lease.close_price

  if (applyAdjustments) {
    // Parking adjustment
    const parkingDiff = specs.parking - (lease.parking_total || 0)
    if (parkingDiff !== 0) {
      const adjustmentAmount = parkingDiff * ADJUSTMENT_VALUES_LEASE.PARKING_PER_SPACE
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
    const compHasLocker = lease.locker === 'Owned'
    if (userHasLocker !== compHasLocker) {
      const adjustmentAmount = userHasLocker ? ADJUSTMENT_VALUES_LEASE.LOCKER : -ADJUSTMENT_VALUES_LEASE.LOCKER
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
    matchTier: 'RANGE' as MatchTier, // Will be overwritten by caller
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

