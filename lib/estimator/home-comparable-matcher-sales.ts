// lib/estimator/home-comparable-matcher-sales.ts
import { createClient } from '@/lib/supabase/client'
import {
  ComparableSale,
  PriceAdjustment,
  MatchTier,
  extractExactSqft,
  assignTemperature,
} from './types'

export interface HomeSpecs {
  bedrooms: number
  bathrooms: number
  propertySubtype: string          // 'Detached', 'Semi-Detached', etc.
  communityId: string | null
  municipalityId: string | null
  livingAreaRange?: string
  exactSqft?: number | null
  parking?: number
  lotWidth?: number | null
  lotDepth?: number | null
  lotArea?: number | null
  garageType?: string | null
  basement?: string | null
  approximateAge?: string | null
  agentId?: string
}

interface HomeMatchResult {
  tier: MatchTier
  comparables: ComparableSale[]
  geoLevel: 'community' | 'municipality' | 'none'
}

const HOME_SELECT = `id, listing_key, close_price, list_price, bedrooms_total, 
  bathrooms_total_integer, living_area_range, parking_total, locker, 
  days_on_market, close_date, tax_annual_amount, square_foot_source, 
  association_fee, unit_number, property_subtype, street_name, street_number,
  lot_width, lot_depth, lot_size_area, garage_type, basement, approximate_age`

/**
 * Home Comparable Matcher - Cascading Geographic Search
 * Tier 1: Community level (same neighborhood)
 * Tier 2: Municipality level (wider area fallback)
 * Within each tier: exact sqft → range → bedroom-only
 */
export async function findHomeComparables(specs: HomeSpecs): Promise<HomeMatchResult> {
  const supabase = createClient()
  const twoYearsAgo = new Date()
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)

  // Determine property subtypes to match
  const subtypes = getCompatibleSubtypes(specs.propertySubtype)

  // TIER 1: Community level
  if (specs.communityId) {
    const { data: communitySales } = await supabase
      .from('mls_listings')
      .select(HOME_SELECT)
      .eq('community_id', specs.communityId)
      .in('property_subtype', subtypes)
      .eq('standard_status', 'Closed')
      .not('close_price', 'is', null)
      .gt('close_price', 100000)
      .gte('close_date', twoYearsAgo.toISOString())
      .order('close_date', { ascending: false })
      .limit(200)

    if (communitySales && communitySales.length > 0) {
      const result = matchWithinPool(communitySales, specs)
      if (result.comparables.length >= 3) {
        return { ...result, geoLevel: 'community' }
      }
    }
  }

  // TIER 2: Municipality level (fallback)
  if (specs.municipalityId) {
    const { data: muniSales } = await supabase
      .from('mls_listings')
      .select(HOME_SELECT)
      .eq('municipality_id', specs.municipalityId)
      .in('property_subtype', subtypes)
      .eq('standard_status', 'Closed')
      .not('close_price', 'is', null)
      .gt('close_price', 100000)
      .gte('close_date', twoYearsAgo.toISOString())
      .order('close_date', { ascending: false })
      .limit(300)

    if (muniSales && muniSales.length > 0) {
      const result = matchWithinPool(muniSales, specs)
      if (result.comparables.length > 0) {
        return { ...result, geoLevel: 'municipality' }
      }
    }
  }

  return { tier: 'CONTACT', comparables: [], geoLevel: 'none' }
}

/**
 * Match within a pool of sales using tiered logic:
 * 1. Exact bed+bath + sqft ±10% + same property subtype
 * 2. Exact bed+bath + same range + same property subtype
 * 3. Exact bed + bath ±1 + same property subtype (widest net)
 */
function matchWithinPool(sales: any[], specs: HomeSpecs): { tier: MatchTier; comparables: ComparableSale[] } {
  // Strict bed+bath matches first
  const bedBathMatches = sales.filter(s =>
    s.bedrooms_total === specs.bedrooms &&
    s.bathrooms_total_integer === specs.bathrooms
  )

  // SUB-TIER A: Exact sqft ±10%
  if (specs.exactSqft && specs.exactSqft > 0) {
    const tolerance = specs.exactSqft * 0.10
    const sqftMatches = bedBathMatches.filter(s => {
      const compSqft = extractExactSqft(s.square_foot_source)
      return compSqft && compSqft >= specs.exactSqft! - tolerance && compSqft <= specs.exactSqft! + tolerance
    })
    if (sqftMatches.length >= 3) {
      return {
        tier: 'BINGO',
        comparables: sqftMatches.slice(0, 10).map(s => createHomeComparable(s, specs))
      }
    }
  }

  // SUB-TIER B: Same living area range
  if (specs.livingAreaRange) {
    const rangeMatches = bedBathMatches.filter(s => s.living_area_range === specs.livingAreaRange)
    if (rangeMatches.length >= 3) {
      return {
        tier: 'RANGE',
        comparables: rangeMatches.slice(0, 10).map(s => createHomeComparable(s, specs))
      }
    }
  }

  // SUB-TIER C: Bed match + bath ±1 (widest)
  const looseBathMatches = sales.filter(s =>
    s.bedrooms_total === specs.bedrooms &&
    Math.abs((s.bathrooms_total_integer || 0) - specs.bathrooms) <= 1
  )

  if (looseBathMatches.length >= 3) {
    // Score and sort by similarity
    const scored = looseBathMatches.map(s => ({
      sale: s,
      score: scoreHomeSimilarity(s, specs)
    }))
    scored.sort((a, b) => b.score - a.score)

    return {
      tier: 'RANGE-ADJ',
      comparables: scored.slice(0, 10).map(s => createHomeComparable(s.sale, specs))
    }
  }

  // SUB-TIER D: Just bedrooms match (last resort before CONTACT)
  const bedOnlyMatches = sales.filter(s => s.bedrooms_total === specs.bedrooms)
  if (bedOnlyMatches.length >= 2) {
    const scored = bedOnlyMatches.map(s => ({
      sale: s,
      score: scoreHomeSimilarity(s, specs)
    }))
    scored.sort((a, b) => b.score - a.score)

    return {
      tier: 'MAINT',
      comparables: scored.slice(0, 10).map(s => createHomeComparable(s.sale, specs))
    }
  }

  // CONTACT: Return whatever we have
  if (sales.length > 0) {
    return {
      tier: 'CONTACT',
      comparables: sales.slice(0, 5).map(s => createHomeComparable(s, specs))
    }
  }

  return { tier: 'CONTACT', comparables: [] }
}

/**
 * Score similarity between a comparable and the subject home
 */
function scoreHomeSimilarity(sale: any, specs: HomeSpecs): number {
  let score = 100

  // Bathroom match
  const bathDiff = Math.abs((sale.bathrooms_total_integer || 0) - specs.bathrooms)
  if (bathDiff === 0) score += 20
  else if (bathDiff === 1) score += 10
  else score -= 20

  // Exact sqft comparison
  if (specs.exactSqft && specs.exactSqft > 0) {
    const compSqft = extractExactSqft(sale.square_foot_source)
    if (compSqft) {
      const sqftDiff = Math.abs(compSqft - specs.exactSqft)
      if (sqftDiff <= 50) score += 40
      else if (sqftDiff <= 100) score += 30
      else if (sqftDiff <= 200) score += 20
      else if (sqftDiff <= 300) score += 10
      else score -= 5
    }
  } else if (specs.livingAreaRange) {
    // Range comparison
    if (sale.living_area_range === specs.livingAreaRange) score += 30
    else if (isAdjacentRange(sale.living_area_range, specs.livingAreaRange)) score += 15
    else score -= 10
  }

  // Parking similarity
  const parkDiff = Math.abs((sale.parking_total || 0) - (specs.parking || 0))
  if (parkDiff === 0) score += 15
  else if (parkDiff === 1) score += 5
  else score -= 10

  // Lot size similarity (if both have data)
  if (specs.lotArea && sale.lot_size_area) {
    const lotDiff = Math.abs(sale.lot_size_area - specs.lotArea) / specs.lotArea
    if (lotDiff <= 0.1) score += 20
    else if (lotDiff <= 0.2) score += 10
    else if (lotDiff <= 0.3) score += 5
    else score -= 5
  }

  // Garage type match
  if (specs.garageType && sale.garage_type) {
    if (sale.garage_type === specs.garageType) score += 10
  }

  // Approximate age bracket match
  if (specs.approximateAge && sale.approximate_age) {
    if (sale.approximate_age === specs.approximateAge) score += 10
    else if (isAdjacentAgeBracket(sale.approximate_age, specs.approximateAge)) score += 5
  }

  // Recency bonus: more recent sales weighted higher
  if (sale.close_date) {
    const monthsAgo = (Date.now() - new Date(sale.close_date).getTime()) / (1000 * 60 * 60 * 24 * 30)
    if (monthsAgo <= 3) score += 15
    else if (monthsAgo <= 6) score += 10
    else if (monthsAgo <= 12) score += 5
  }

  return score
}

/**
 * Create a ComparableSale from a home sale record
 */
function createHomeComparable(sale: any, specs: HomeSpecs): ComparableSale {
  const adjustments: PriceAdjustment[] = []

  // Bathroom adjustment
  const bathDiff = specs.bathrooms - (sale.bathrooms_total_integer || 0)
  if (bathDiff !== 0) {
    adjustments.push({
      type: 'bathroom' as any,
      difference: bathDiff,
      adjustmentAmount: bathDiff * 25000,
      reason: bathDiff > 0
        ? `Your home has ${Math.abs(bathDiff)} more bathroom${Math.abs(bathDiff) > 1 ? 's' : ''}`
        : `Comparable has ${Math.abs(bathDiff)} more bathroom${Math.abs(bathDiff) > 1 ? 's' : ''}`
    })
  }

  // Parking adjustment
  const parkDiff = (specs.parking || 0) - (sale.parking_total || 0)
  if (parkDiff !== 0) {
    adjustments.push({
      type: 'parking',
      difference: parkDiff,
      adjustmentAmount: parkDiff * 30000,
      reason: parkDiff > 0
        ? `Your home has ${Math.abs(parkDiff)} more parking space${Math.abs(parkDiff) > 1 ? 's' : ''}`
        : `Comparable has ${Math.abs(parkDiff)} more parking space${Math.abs(parkDiff) > 1 ? 's' : ''}`
    })
  }

  let adjustedPrice = sale.close_price
  adjustments.forEach(a => { adjustedPrice += a.adjustmentAmount })

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
    locker: sale.locker || 'None',
    daysOnMarket: sale.days_on_market || 0,
    closeDate: sale.close_date,
    taxAnnualAmount: sale.tax_annual_amount,
    exactSqft: extractExactSqft(sale.square_foot_source) ?? undefined,
    userExactSqft: specs.exactSqft || undefined,
    associationFee: sale.association_fee,
    unitNumber: sale.street_number ? `${sale.street_number} ${sale.street_name || ''}`.trim() : sale.unit_number,
    listingKey: sale.listing_key,
    temperature: assignTemperature(sale.close_date),
    matchTier: 'RANGE' as MatchTier,
    matchQuality,
    adjustments: adjustments.length > 0 ? adjustments : undefined,
    adjustedPrice: adjustments.length > 0 ? adjustedPrice : undefined,
  }
}

/**
 * Get compatible property subtypes for matching
 * e.g., Semi-Detached can compare with Att/Row/Townhouse
 */
function getCompatibleSubtypes(subtype: string): string[] {
  const detachedTypes = ['Detached']
  const attachedTypes = ['Semi-Detached', 'Att/Row/Townhouse', 'Link']
  const multiTypes = ['Duplex', 'Triplex', 'Fourplex', 'Multiplex']

  if (detachedTypes.includes(subtype)) return detachedTypes
  if (attachedTypes.includes(subtype)) return attachedTypes
  if (multiTypes.includes(subtype)) return multiTypes
  return [subtype]
}

/**
 * Check if two living area ranges are adjacent
 */
function isAdjacentRange(range1: string | null, range2: string): boolean {
  if (!range1) return false
  const mid1 = getRangeMidpoint(range1)
  const mid2 = getRangeMidpoint(range2)
  if (!mid1 || !mid2) return false
  const diff = Math.abs(mid1 - mid2)
  return diff <= 200 // Within one range bracket
}

function getRangeMidpoint(range: string | null): number | null {
  if (!range) return null
  const match = range.match(/^(\d+)-(\d+)$/)
  if (!match) return null
  return (parseInt(match[1]) + parseInt(match[2])) / 2
}

/**
 * Check if approximate age brackets are adjacent
 */
function isAdjacentAgeBracket(age1: string, age2: string): boolean {
  const brackets = ['0-5', '6-15', '16-30', '31-50', '51-99', '100+']
  const idx1 = brackets.indexOf(age1)
  const idx2 = brackets.indexOf(age2)
  if (idx1 === -1 || idx2 === -1) return false
  return Math.abs(idx1 - idx2) <= 1
}

function parseLotDimension(val: string | number | null): number | null {
  if (!val) return null
  const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^\d.]/g, ''))
  return isNaN(num) ? null : num
}