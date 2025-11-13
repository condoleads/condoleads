// lib/estimator/comparable-matcher.ts
import { createClient } from '@/lib/supabase/client'
import { ComparableSale, UnitSpecs, PriceAdjustment, ADJUSTMENT_VALUES, extractExactSqft } from './types'

/**
 * Finds comparable sales within the same building
 * Filters by bedroom match, fuzzy bathroom/sqft/parking/locker
 */
export async function findComparables(specs: UnitSpecs): Promise<ComparableSale[]> {
  const supabase = createClient()
  
  // Determine if this is a sale or rental based on typical price ranges
  // Sales > $100,000, Rentals < $10,000
  const isSale = true // Will be determined by context
  
  // Query closed sales from last 2 years in this specific building
  const twoYearsAgo = new Date()
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
  
  const { data: allSales, error } = await supabase
    .from('mls_listings')
   .select('close_price, list_price, bedrooms_total, bathrooms_total_integer, living_area_range, parking_total, locker, days_on_market, close_date, tax_annual_amount, square_foot_source, association_fee')
    .eq('building_id', specs.buildingId)
    .eq('standard_status', 'Closed')
    .not('close_price', 'is', null)
    .gte('close_date', twoYearsAgo.toISOString())
    .gt('close_price', 100000) // Filter for sales, not rentals
    .order('close_date', { ascending: false })
  
  if (error || !allSales) {
    console.error('Error fetching comparables:', error)
    return []
  }
  
  // Filter for exact bedroom match (strict requirement)
  const bedroomMatches = allSales.filter(sale => 
    sale.bedrooms_total === specs.bedrooms
  )
  
  if (bedroomMatches.length === 0) {
  return [] // No data available
}

// If user provided tax amount, use it for scoring
const userTax = specs.taxAnnualAmount

// Score each comparable based on similarity
const scoredComparables = bedroomMatches.map(sale => {
    let score = 100
    
    // Bathroom similarity (1 is acceptable)
    const bathroomDiff = Math.abs((sale.bathrooms_total_integer || 0) - specs.bathrooms)
    if (bathroomDiff === 0) score += 20
    else if (bathroomDiff === 1) score += 10
    else score -= 20
    
    // Sqft matching - prioritize exact sqft if available
const userExactSqft = specs.exactSqft
const compExactSqft = extractExactSqft(sale.square_foot_source)

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
  if (sale.living_area_range === specs.livingAreaRange) {
    score += 30
  } else if (isAdjacentRange(sale.living_area_range, specs.livingAreaRange)) {
    score += 15
  } else {
    score -= 10
  }
}
    
    // Parking match
    if ((sale.parking_total || 0) === specs.parking) {
      score += 15
    } else {
      score -= Math.abs((sale.parking_total || 0) - specs.parking) * 5
    }
    
    // Locker match
    const saleHasLocker = sale.locker === 'Owned'
    if (saleHasLocker === specs.hasLocker) {
      score += 10
    }
    
    // Recency bonus (more recent = better comparable)
    const monthsAgo = (new Date().getTime() - new Date(sale.close_date).getTime()) / (1000 * 60 * 60 * 24 * 30)
    if (monthsAgo < 6) score += 10
    else if (monthsAgo < 12) score += 5
    
    return { sale, score }
  })
  
  // Sort by score and return top 10 comparables with adjustments
const topComparables = scoredComparables
  .sort((a, b) => b.score - a.score)
  .slice(0, 10)
  .map(item => {
    const adjustments: PriceAdjustment[] = []
    let adjustedPrice = item.sale.close_price
    // Calculate parking adjustment
    const parkingDiff = specs.parking - (item.sale.parking_total || 0)
    if (parkingDiff !== 0) {
      const adjustmentAmount = parkingDiff * ADJUSTMENT_VALUES.PARKING_PER_SPACE
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
    const compHasLocker = item.sale.locker === 'Owned'
    if (userHasLocker !== compHasLocker) {
      const adjustmentAmount = userHasLocker ? ADJUSTMENT_VALUES.LOCKER : -ADJUSTMENT_VALUES.LOCKER
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
    const bathroomDiff = specs.bathrooms - (item.sale.bathrooms_total_integer || 0)
    if (bathroomDiff !== 0) {
      const adjustmentAmount = bathroomDiff * ADJUSTMENT_VALUES.BATHROOM
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
    const hasExactBedBath = item.sale.bedrooms_total === specs.bedrooms && 
                            item.sale.bathrooms_total_integer === specs.bathrooms
    const hasExactParking = (item.sale.parking_total || 0) === specs.parking
    const hasExactLocker = compHasLocker === specs.hasLocker
    const hasTaxMatch = userTax && item.sale.tax_annual_amount && 
                        Math.abs(item.sale.tax_annual_amount - userTax) / userTax <= 0.10

    if (hasExactBedBath && hasExactParking && hasExactLocker) {
      matchQuality = 'Perfect'
    } else if (hasTaxMatch && hasExactBedBath) {
      matchQuality = 'Excellent'
    } else if (hasExactBedBath && adjustments.length <= 1) {
      matchQuality = 'Good'
    }

    return {
  closePrice: item.sale.close_price,
  listPrice: item.sale.list_price,
  bedrooms: item.sale.bedrooms_total,
  bathrooms: item.sale.bathrooms_total_integer || 0,
  livingAreaRange: item.sale.living_area_range || 'Unknown',
  parking: item.sale.parking_total || 0,
  locker: item.sale.locker,
  daysOnMarket: item.sale.days_on_market || 0,
  closeDate: item.sale.close_date,
  taxAnnualAmount: item.sale.tax_annual_amount,
  exactSqft: extractExactSqft(item.sale.square_foot_source) ?? undefined,  // ADD THIS
  userExactSqft: specs.exactSqft,  // ADD THIS - pass user's sqft for comparison
  associationFee: item.sale.association_fee,  // ADD THIS
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
  
  // Adjacent if within 200 sqft (e.g., 700-799 adjacent to 800-899 or 600-699)
  return Math.abs(start1 - start2) <= 200
}
