// lib/estimator/statistical-calculator.ts
import { ComparableSale, EstimateResult, UnitSpecs } from './types'

/**
 * Calculates price estimate from comparable sales
 * Uses median price with adjustments for parking/locker differences
 */
export function calculateEstimate(
  specs: UnitSpecs,
  comparables: ComparableSale[]
): Omit<EstimateResult, 'aiInsights'> {
  
  if (comparables.length === 0) {
    throw new Error('No comparable sales data available for this unit configuration')
  }
  
  // Calculate base prices with adjustments for parking/locker differences
  const adjustedPrices = comparables.map(comp => {
    let adjustedPrice = comp.closePrice
    
    // Parking adjustment: $75k per space difference
    const parkingDiff = specs.parking - (comp.parking || 0)
    adjustedPrice += parkingDiff * 75000
    
    // Locker adjustment: $12.5k if difference exists
    const compHasLocker = comp.locker === 'Owned'
    if (specs.hasLocker && !compHasLocker) {
      adjustedPrice += 12500
    } else if (!specs.hasLocker && compHasLocker) {
      adjustedPrice -= 12500
    }
    
    return adjustedPrice
  })
  
  // Use median instead of average (more robust to outliers)
  const sortedPrices = [...adjustedPrices].sort((a, b) => a - b)
  const medianPrice = sortedPrices[Math.floor(sortedPrices.length / 2)]
  
  // Calculate price range (10% of median)
  const priceRange = {
    low: Math.round(medianPrice * 0.90),
    high: Math.round(medianPrice * 1.10)
  }
  
  // Determine confidence level based on number of comparables
  let confidence: 'High' | 'Medium' | 'Low'
  if (comparables.length >= 8) {
    confidence = 'High'
  } else if (comparables.length >= 4) {
    confidence = 'Medium'
  } else {
    confidence = 'Low'
  }
  
  // Calculate market speed from days on market
  const avgDaysOnMarket = Math.round(
    comparables.reduce((sum, comp) => sum + comp.daysOnMarket, 0) / comparables.length
  )
  
  let marketStatus: 'Fast' | 'Moderate' | 'Slow'
  let marketMessage: string
  
  if (avgDaysOnMarket < 30) {
    marketStatus = 'Fast'
    marketMessage = 'Units are selling quickly in this building. Strong seller\'s market.'
  } else if (avgDaysOnMarket < 60) {
    marketStatus = 'Moderate'
    marketMessage = 'Normal market conditions. Units selling at a steady pace.'
  } else {
    marketStatus = 'Slow'
    marketMessage = 'Units taking longer to sell. Buyer\'s market with more negotiating room.'
  }
  
  return {
    estimatedPrice: Math.round(medianPrice),
    priceRange,
    confidence,
    comparables,
    marketSpeed: {
      avgDaysOnMarket,
      status: marketStatus,
      message: marketMessage
    }
  }
}