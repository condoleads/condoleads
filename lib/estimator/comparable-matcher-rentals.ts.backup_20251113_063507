// lib/estimator/comparable-matcher-rentals.ts
import { createClient } from '@/lib/supabase/client'
import { ComparableSale, UnitSpecs, PriceAdjustment, extractExactSqft } from './types'

// Rental adjustment constants (monthly amounts)
const RENTAL_ADJUSTMENTS = {
  PARKING_PER_SPACE: 300,
  LOCKER: 100,
  BATHROOM: 100
} as const

/**
 * Finds comparable leases within the same building with transparent adjustments
 */
export async function findComparablesRentals(specs: UnitSpecs): Promise<ComparableSale[]> {
  const supabase = createClient()
  
  // Query closed leases from last 2 years in this specific building
  const twoYearsAgo = new Date()
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)

  const { data: allLeases, error } = await supabase
    .from('mls_listings')
    .select('close_price, list_price, bedrooms_total, bathrooms_total_integer, living_area_range, parking_total, locker, days_on_market, close_date, square_foot_source, association_fee')
    .eq('building_id', specs.buildingId)
    .eq('transaction_type', 'For Lease')
    .eq('standard_status', 'Closed')
    .not('close_price', 'is', null)
    .gte('close_date', twoYearsAgo.toISOString())
    .order('close_date', { ascending: false })

  if (error || !allLeases) {
    console.error('Error fetching comparable leases:', error)
    return []
  }

  // Filter for exact bedroom match (strict requirement)
  const bedroomMatches = allLeases.filter(lease =>
    lease.bedrooms_total === specs.bedrooms
  )

  if (bedroomMatches.length === 0) {
    return [] // No data available
  }

  // Score each comparable based on similarity
  const scoredComparables = bedroomMatches.map(lease => {
    let score = 100

    // Bathroom similarity (±1 is acceptable)
    const bathroomDiff = Math.abs((lease.bathrooms_total_integer || 0) - specs.bathrooms)
    if (bathroomDiff === 0) score += 20
    else if (bathroomDiff === 1) score += 10
    else score -= 20

    // Sqft matching - prioritize exact sqft if available
    const userExactSqft = specs.exactSqft
    const compExactSqft = extractExactSqft(lease.square_foot_source)
    
    if (userExactSqft && compExactSqft) {
      // Both have exact sqft - use precise matching
      const sqftDiff = Math.abs(userExactSqft - compExactSqft)
      if (sqftDiff <= 25) score += 40      // Within 25 sqft - nearly identical
      else if (sqftDiff <= 50) score += 30  // Within 50 sqft - excellent
      else if (sqftDiff <= 100) score += 20 // Within 100 sqft - good
      else if (sqftDiff <= 150) score += 10 // Within 150 sqft - acceptable
      else score -= 5                        // Beyond 150 sqft difference
    } else {
      // Fallback to range matching
      if (lease.living_area_range === specs.livingAreaRange) {
        score += 30
      } else if (isAdjacentRange(lease.living_area_range, specs.livingAreaRange)) {
        score += 15
      } else {
        score -= 10
      }
    }

    // Parking match
    if ((lease.parking_total || 0) === specs.parking) {
      score += 15
    } else {
      score -= Math.abs((lease.parking_total || 0) - specs.parking) * 5
    }

    // Locker match
    const leaseHasLocker = lease.locker === 'Owned'
    if (leaseHasLocker === specs.hasLocker) {
      score += 10
    }

    // Recency bonus (more recent = better comparable)
    const monthsAgo = (new Date().getTime() - new Date(lease.close_date).getTime()) / (1000 * 60 * 60 * 24 * 30)
    if (monthsAgo < 6) score += 10
    else if (monthsAgo < 12) score += 5

    return { lease, score }
  })

  // Sort by score and return top 10 comparables WITH ADJUSTMENTS
  const topComparables = scoredComparables
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(item => {
      const adjustments: PriceAdjustment[] = []
      let adjustedPrice = item.lease.close_price

      // Calculate parking adjustment
      const parkingDiff = specs.parking - (item.lease.parking_total || 0)
      if (parkingDiff !== 0) {
        const adjustmentAmount = parkingDiff * RENTAL_ADJUSTMENTS.PARKING_PER_SPACE
        adjustedPrice += adjustmentAmount
        adjustments.push({
          type: 'parking',
          difference: parkingDiff,
          adjustmentAmount: adjustmentAmount,
          reason: parkingDiff > 0 
            ? `Your unit has ${Math.abs(parkingDiff)} more parking space${Math.abs(parkingDiff) > 1 ? 's' : ''}`
            : `Comparable has ${Math.abs(parkingDiff)} more parking space${Math.abs(parkingDiff) > 1 ? 's' : ''}`
        })
      }

      // Calculate locker adjustment
      const userHasLocker = specs.hasLocker
      const compHasLocker = item.lease.locker === 'Owned'
      if (userHasLocker !== compHasLocker) {
        const adjustmentAmount = userHasLocker ? RENTAL_ADJUSTMENTS.LOCKER : -RENTAL_ADJUSTMENTS.LOCKER
        adjustedPrice += adjustmentAmount
        adjustments.push({
          type: 'locker',
          difference: userHasLocker ? 1 : -1,
          adjustmentAmount: adjustmentAmount,
          reason: userHasLocker 
            ? 'Your unit includes a locker'
            : 'Comparable includes a locker'
        })
      }

      // Calculate bathroom adjustment
      const bathroomDiff = specs.bathrooms - (item.lease.bathrooms_total_integer || 0)
      if (bathroomDiff !== 0) {
        const adjustmentAmount = bathroomDiff * RENTAL_ADJUSTMENTS.BATHROOM
        adjustedPrice += adjustmentAmount
        adjustments.push({
          type: 'bathroom',
          difference: bathroomDiff,
          adjustmentAmount: adjustmentAmount,
          reason: bathroomDiff > 0
            ? `Your unit has ${Math.abs(bathroomDiff)} more bathroom${Math.abs(bathroomDiff) > 1 ? 's' : ''}`
            : `Comparable has ${Math.abs(bathroomDiff)} more bathroom${Math.abs(bathroomDiff) > 1 ? 's' : ''}`
        })
      }

      // Determine match quality
      let matchQuality: 'Perfect' | 'Excellent' | 'Good' | 'Fair' = 'Fair'
      const hasExactBedBath = item.lease.bedrooms_total === specs.bedrooms && 
                              item.lease.bathrooms_total_integer === specs.bathrooms
      const hasExactParking = (item.lease.parking_total || 0) === specs.parking
      const hasExactLocker = compHasLocker === specs.hasLocker

      if (hasExactBedBath && hasExactParking && hasExactLocker) {
        matchQuality = 'Perfect'
      } else if (hasExactBedBath && adjustments.length <= 1) {
        matchQuality = 'Excellent'
      } else if (hasExactBedBath) {
        matchQuality = 'Good'
      }

     return {
  closePrice: item.lease.close_price,
  listPrice: item.lease.list_price,
  bedrooms: item.lease.bedrooms_total,
  bathrooms: item.lease.bathrooms_total_integer || 0,
  livingAreaRange: item.lease.living_area_range || 'Unknown',
  parking: item.lease.parking_total || 0,
  locker: item.lease.locker,
  daysOnMarket: item.lease.days_on_market || 0,
  closeDate: item.lease.close_date,
  exactSqft: extractExactSqft(item.lease.square_foot_source),  // ADD THIS
  userExactSqft: specs.exactSqft,  // ADD THIS
  associationFee: item.lease.association_fee,  // ADD THIS
  adjustments: adjustments,
  adjustedPrice: adjustedPrice,
  matchQuality: matchQuality,
  matchScore: item.score
}
    })

  return topComparables
}

/**
 * Check if two sqft ranges are adjacent (e.g., "700-799" and "800-899")
 */
function isAdjacentRange(range1: string | null, range2: string): boolean {
  if (!range1) return false

  const getRangeStart = (range: string): number => {
    const match = range.match(/^(\d+)-/)
    return match ? parseInt(match[1]) : 0
  }
  
  const start1 = getRangeStart(range1)
  const start2 = getRangeStart(range2)

  // Adjacent if within 200 sqft
  return Math.abs(start1 - start2) <= 200
}