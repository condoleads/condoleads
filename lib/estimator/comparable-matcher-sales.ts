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
 * Finds comparable sales using tiered matching:
 * BINGO → FAIR → ADJUSTED → CONTACT
 */
export async function findComparables(specs: UnitSpecs): Promise<MatchResult> {
  const supabase = createClient()

  // Query closed sales from last 2 years in this specific building
  const twoYearsAgo = new Date()
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
  
  const { data: allSales, error } = await supabase
    .from('mls_listings')
    .select('id, unit_number, close_price, list_price, bedrooms_total, bathrooms_total_integer, living_area_range, parking_total, locker, days_on_market, close_date, tax_annual_amount, square_foot_source, association_fee')
    .eq('building_id', specs.buildingId)
    .eq('standard_status', 'Closed')
    .not('close_price', 'is', null)
    .gte('close_date', twoYearsAgo.toISOString())
    .gt('close_price', 100000) // Filter for sales, not rentals
    .order('close_date', { ascending: false })

  if (error || !allSales || allSales.length === 0) {
    console.error('Error fetching comparables:', error)
    return { tier: 'CONTACT', comparables: [] }
  }

  // Step 1: Try BINGO matches
  const bingoMatches = findBingoMatches(allSales, specs)
  if (bingoMatches.length > 0) {
    return { tier: 'BINGO', comparables: bingoMatches }
  }

  // Step 2: Try FAIR matches
  const fairMatches = findFairMatches(allSales, specs)
  if (fairMatches.length > 0) {
    return { tier: 'FAIR', comparables: fairMatches }
  }

  // Step 3: Try ADJUSTED matches
  const adjustedMatches = findAdjustedMatches(allSales, specs)
  if (adjustedMatches.length > 0) {
    return { tier: 'ADJUSTED', comparables: adjustedMatches }
  }

  // Step 4: CONTACT - return reference comparables without price recommendation
  const referenceComparables = findReferenceComparables(allSales, specs)
  return { tier: 'CONTACT', comparables: referenceComparables }
}

/**
 * BINGO Match: Exact sqft + bed + bath + parking + locker
 */
function findBingoMatches(allSales: any[], specs: UnitSpecs): ComparableSale[] {
  if (!specs.exactSqft) return [] // Need exact sqft for BINGO
  
  const matches = allSales.filter(sale => {
    const saleExactSqft = extractExactSqft(sale.square_foot_source)
    if (!saleExactSqft) return false
    
    // Exact sqft within 50 sqft tolerance
    const sqftMatch = Math.abs(saleExactSqft - specs.exactSqft!) <= 50
    const bedMatch = sale.bedrooms_total === specs.bedrooms
    const bathMatch = sale.bathrooms_total_integer === specs.bathrooms
    const parkingMatch = (sale.parking_total || 0) === specs.parking
    const lockerMatch = (sale.locker === 'Owned') === specs.hasLocker
    
    return sqftMatch && bedMatch && bathMatch && parkingMatch && lockerMatch
  })

  return matches.map(sale => ({
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
    temperature: assignTemperature(sale.close_date),
    matchTier: 'BINGO' as MatchTier,
    matchQuality: 'Perfect' as const,
    adjustments: [],
    adjustedPrice: sale.close_price
  }))
}

/**
 * FAIR Match: Same sqft range + maintenance ±20% + bed + bath + parking + locker
 */
function findFairMatches(allSales: any[], specs: UnitSpecs): ComparableSale[] {
  const matches = allSales.filter(sale => {
    const rangeMatch = sale.living_area_range === specs.livingAreaRange
    const maintenanceMatch = isMaintenanceMatch(specs.associationFee, sale.association_fee)
    const bedMatch = sale.bedrooms_total === specs.bedrooms
    const bathMatch = sale.bathrooms_total_integer === specs.bathrooms
    const parkingMatch = (sale.parking_total || 0) === specs.parking
    const lockerMatch = (sale.locker === 'Owned') === specs.hasLocker
    
    return rangeMatch && maintenanceMatch && bedMatch && bathMatch && parkingMatch && lockerMatch
  })

  return matches.map(sale => ({
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
    temperature: assignTemperature(sale.close_date),
    matchTier: 'FAIR' as MatchTier,
    matchQuality: 'Good' as const,
    adjustments: [],
    adjustedPrice: sale.close_price
  }))
}

/**
 * ADJUSTED Match: Same bedrooms, apply adjustments for differences
 */
function findAdjustedMatches(allSales: any[], specs: UnitSpecs): ComparableSale[] {
  // Filter for same bedroom count (strict requirement)
  const bedroomMatches = allSales.filter(sale => sale.bedrooms_total === specs.bedrooms)
  
  if (bedroomMatches.length === 0) return []

  return bedroomMatches.slice(0, 10).map(sale => {
    const adjustments: PriceAdjustment[] = []
    let adjustedPrice = sale.close_price

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

    // Bathroom adjustment
    const bathroomDiff = specs.bathrooms - (sale.bathrooms_total_integer || 0)
    if (bathroomDiff !== 0) {
      const adjustmentAmount = bathroomDiff * ADJUSTMENT_VALUES.BATHROOM
      adjustedPrice += adjustmentAmount
      adjustments.push({
        type: 'bathroom',
        difference: bathroomDiff,
        adjustmentAmount,
        reason: bathroomDiff > 0
          ? `Your unit has ${Math.abs(bathroomDiff)} more bathroom${Math.abs(bathroomDiff) > 1 ? 's' : ''}`
          : `Comparable has ${Math.abs(bathroomDiff)} more bathroom${Math.abs(bathroomDiff) > 1 ? 's' : ''}`
      })
    }

    // Determine match quality based on number of adjustments
    let matchQuality: 'Perfect' | 'Excellent' | 'Good' | 'Fair' = 'Fair'
    if (adjustments.length === 0) matchQuality = 'Excellent'
    else if (adjustments.length === 1) matchQuality = 'Good'

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
      temperature: assignTemperature(sale.close_date),
      matchTier: 'ADJUSTED' as MatchTier,
      matchQuality,
      adjustments,
      adjustedPrice
    }
  })
}

/**
 * CONTACT: Reference comparables when no good matches exist
 * Shows recent sales but with mismatch reasons
 */
function findReferenceComparables(allSales: any[], specs: UnitSpecs): ComparableSale[] {
  // Get up to 5 most recent sales for reference
  return allSales.slice(0, 5).map(sale => {
    // Determine why this doesn't match
    const reasons: string[] = []
    
    if (sale.bedrooms_total !== specs.bedrooms) {
      reasons.push(`${sale.bedrooms_total} bed vs your ${specs.bedrooms} bed`)
    }
    if (sale.bathrooms_total_integer !== specs.bathrooms) {
      reasons.push(`${sale.bathrooms_total_integer} bath vs your ${specs.bathrooms} bath`)
    }
    
    const saleExactSqft = extractExactSqft(sale.square_foot_source)
    if (specs.exactSqft && saleExactSqft && Math.abs(saleExactSqft - specs.exactSqft) > 100) {
      reasons.push(`${saleExactSqft} sqft vs your ${specs.exactSqft} sqft`)
    } else if (sale.living_area_range !== specs.livingAreaRange) {
      reasons.push(`${sale.living_area_range} sqft range vs your ${specs.livingAreaRange}`)
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
      temperature: assignTemperature(sale.close_date),
      matchTier: 'CONTACT' as MatchTier,
      matchQuality: 'Fair' as const,
      mismatchReason: reasons.join(' • ') || 'Different configuration'
    }
  })
}

// Legacy export for backwards compatibility during transition
export { findComparables as findComparablesSales }