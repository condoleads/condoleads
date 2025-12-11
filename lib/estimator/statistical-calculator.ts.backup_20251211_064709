// lib/estimator/statistical-calculator.ts
import { ComparableSale, EstimateResult, UnitSpecs } from './types'

/**
 * Calculates price estimate from comparable sales using adjusted prices
 * Weights perfect/excellent matches more heavily
 */
export function calculateEstimate(
  specs: UnitSpecs,
  comparables: ComparableSale[]
): Omit<EstimateResult, 'aiInsights'> {
  
  if (comparables.length === 0) {
    throw new Error('No comparable sales data available for this unit configuration')
  }

  // Separate comparables by match quality for weighted calculation
  const perfectMatches = comparables.filter(c => c.matchQuality === 'Perfect')
  const excellentMatches = comparables.filter(c => c.matchQuality === 'Excellent')
  const adjustedComparables = comparables.filter(c => c.adjustments && c.adjustments.length > 0)

  // Use adjustedPrice (which includes all adjustments) instead of closePrice
  const prices = comparables.map(comp => comp.adjustedPrice || comp.closePrice)

  // Weight calculation: Perfect matches count 3x, Excellent 2x, others 1x
  const weightedPrices: number[] = []
  comparables.forEach(comp => {
    const price = comp.adjustedPrice || comp.closePrice
    if (comp.matchQuality === 'Perfect') {
      weightedPrices.push(price, price, price) // Count 3x
    } else if (comp.matchQuality === 'Excellent') {
      weightedPrices.push(price, price) // Count 2x
    } else {
      weightedPrices.push(price) // Count 1x
    }
  })

  // Use weighted median for final estimate
  const sortedWeightedPrices = [...weightedPrices].sort((a, b) => a - b)
  const medianPrice = sortedWeightedPrices[Math.floor(sortedWeightedPrices.length / 2)]

  // Calculate price range based on confidence
  const priceStdDev = calculateStdDev(prices)
  const rangeMultiplier = perfectMatches.length >= 3 ? 0.05 : 
                          excellentMatches.length >= 3 ? 0.08 : 0.10
  
  const priceRange = {
    low: Math.round(medianPrice * (1 - rangeMultiplier)),
    high: Math.round(medianPrice * (1 + rangeMultiplier))
  }

  // Enhanced confidence calculation
  let confidence: 'High' | 'Medium' | 'Low'
  if (perfectMatches.length >= 3 || comparables.length >= 8) {
    confidence = 'High'
  } else if (excellentMatches.length >= 2 || comparables.length >= 4) {
    confidence = 'Medium'
  } else {
    confidence = 'Low'
  }

  // Calculate adjustment summary
  const totalAdjustments = adjustedComparables.reduce((sum, comp) => {
    return sum + (comp.adjustments?.reduce((adjSum, adj) => adjSum + Math.abs(adj.adjustmentAmount), 0) || 0)
  }, 0)
  const avgAdjustment = adjustedComparables.length > 0 
    ? Math.round(totalAdjustments / adjustedComparables.length) 
    : 0

  const adjustmentSummary = {
    perfectMatches: perfectMatches.length,
    adjustedComparables: adjustedComparables.length,
    avgAdjustment: avgAdjustment
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
    adjustmentSummary,
    marketSpeed: {
      avgDaysOnMarket,
      status: marketStatus,
      message: marketMessage
    }
  }
}

/**
 * Calculate standard deviation for price variance
 */
function calculateStdDev(prices: number[]): number {
  const avg = prices.reduce((sum, price) => sum + price, 0) / prices.length
  const squaredDiffs = prices.map(price => Math.pow(price - avg, 2))
  const variance = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / prices.length
  return Math.sqrt(variance)
}