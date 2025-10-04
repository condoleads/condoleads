// lib/estimator/comparable-matcher-rentals.ts
import { createClient } from '@/lib/supabase/client'
import { ComparableSale, UnitSpecs } from './types'

/**
 * Finds comparable leases within the same building
 * Filters by bedroom match, fuzzy bathroom/sqft/parking/locker
 */
export async function findComparablesRentals(specs: UnitSpecs): Promise<ComparableSale[]> {
  const supabase = createClient()
  
  // Query closed leases from last 2 years in this specific building
  const twoYearsAgo = new Date()
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
  
  const { data: allLeases, error } = await supabase
    .from('mls_listings')
    .select('close_price, list_price, bedrooms_total, bathrooms_total_integer, living_area_range, parking_total, locker, days_on_market, close_date')
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
    
    // Bathroom similarity (1 is acceptable)
    const bathroomDiff = Math.abs((lease.bathrooms_total_integer || 0) - specs.bathrooms)
    if (bathroomDiff === 0) score += 20
    else if (bathroomDiff === 1) score += 10
    else score -= 20
    
    // Sqft range similarity (adjacent ranges acceptable)
    if (lease.living_area_range === specs.livingAreaRange) {
      score += 30
    } else if (isAdjacentRange(lease.living_area_range, specs.livingAreaRange)) {
      score += 15
    } else {
      score -= 10
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
  
  // Sort by score and return top 10 comparables
  const topComparables = scoredComparables
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(item => ({
      closePrice: item.lease.close_price,
      listPrice: item.lease.list_price,
      bedrooms: item.lease.bedrooms_total,
      bathrooms: item.lease.bathrooms_total_integer || 0,
      livingAreaRange: item.lease.living_area_range || 'Unknown',
      parking: item.lease.parking_total || 0,
      locker: item.lease.locker,
      daysOnMarket: item.lease.days_on_market || 0,
      closeDate: item.lease.close_date
    }))
  
  return topComparables
}

/**
 * Check if two sqft ranges are adjacent (e.g., \"700-799\" and \"800-899\")
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
