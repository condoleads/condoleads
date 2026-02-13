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

interface HomeRentalMatchResult {
  tier: MatchTier
  comparables: ComparableSale[]
  geoLevel: 'community' | 'municipality' | 'none'
}

const HOME_RENTAL_SELECT = `id, listing_key, close_price, list_price, bedrooms_total, 
  bathrooms_total_integer, living_area_range, parking_total, locker, 
  days_on_market, close_date, square_foot_source, 
  unit_number, property_subtype, street_name, street_number,
  lot_width, lot_depth, lot_size_area, garage_type, basement, approximate_age`

// Rental adjustment values for homes
const HOME_RENTAL_ADJUSTMENTS = {
  PARKING_PER_SPACE: 150,  // $150/mo per parking space
  BATHROOM: 100,           // $100/mo per bathroom difference
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
      const result = matchWithinPool(communityLeases, specs)
      if (result.comparables.length >= 3) {
        return { ...result, geoLevel: 'community' }
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
      const result = matchWithinPool(muniLeases, specs)
      if (result.comparables.length > 0) {
        return { ...result, geoLevel: 'municipality' }
      }
    }
  }

  return { tier: 'CONTACT', comparables: [], geoLevel: 'none' }
}

function matchWithinPool(leases: any[], specs: HomeSpecs): { tier: MatchTier; comparables: ComparableSale[] } {
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
        comparables: sqftMatches.slice(0, 10).map(l => createHomeRentalComparable(l, specs))
      }
    }
  }

  // SUB-TIER B: Same living area range
  if (specs.livingAreaRange) {
    const rangeMatches = bedBathMatches.filter(l => l.living_area_range === specs.livingAreaRange)
    if (rangeMatches.length >= 3) {
      return {
        tier: 'RANGE',
        comparables: rangeMatches.slice(0, 10).map(l => createHomeRentalComparable(l, specs))
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
      comparables: scored.slice(0, 10).map(s => createHomeRentalComparable(s.lease, specs))
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
      comparables: scored.slice(0, 10).map(s => createHomeRentalComparable(s.lease, specs))
    }
  }

  if (leases.length > 0) {
    return {
      tier: 'CONTACT',
      comparables: leases.slice(0, 5).map(l => createHomeRentalComparable(l, specs))
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

  return score
}

function createHomeRentalComparable(lease: any, specs: HomeSpecs): ComparableSale {
  const adjustments: PriceAdjustment[] = []

  const bathDiff = specs.bathrooms - (lease.bathrooms_total_integer || 0)
  if (bathDiff !== 0) {
    adjustments.push({
      type: 'bathroom' as any,
      difference: bathDiff,
      adjustmentAmount: bathDiff * HOME_RENTAL_ADJUSTMENTS.BATHROOM,
      reason: bathDiff > 0
        ? `Your home has ${Math.abs(bathDiff)} more bathroom${Math.abs(bathDiff) > 1 ? 's' : ''}`
        : `Comparable has ${Math.abs(bathDiff)} more bathroom${Math.abs(bathDiff) > 1 ? 's' : ''}`
    })
  }

  const parkDiff = (specs.parking || 0) - (lease.parking_total || 0)
  if (parkDiff !== 0) {
    adjustments.push({
      type: 'parking',
      difference: parkDiff,
      adjustmentAmount: parkDiff * HOME_RENTAL_ADJUSTMENTS.PARKING_PER_SPACE,
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