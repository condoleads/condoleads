// lib/estimator/statistical-calculator.ts
import { ComparableSale, EstimateResult, MatchTier, TEMPERATURE_CONFIG } from './types'

interface CalculateInput {
  tier: MatchTier
  comparables: ComparableSale[]
}

interface LegacySpecs {
  bedrooms: number
  bathrooms: number
  parking: number
  hasLocker: boolean
  buildingId: string
}

/**
 * Calculates price estimate based on match tier
 * BINGO/BINGO-ADJ/RANGE/RANGE-ADJ/MAINT/MAINT-ADJ: Returns average + most recent price
 * CONTACT: Returns no price (showPrice = false)
 */
export function calculateEstimate(
  inputOrSpecs: CalculateInput | LegacySpecs,
  legacyComparables?: ComparableSale[]
): Omit<EstimateResult, 'aiInsights'> {
  // Handle legacy call: calculateEstimate(specs, comparables)
  let tier: MatchTier
  let comparables: ComparableSale[]
  
  if (legacyComparables !== undefined) {
    // Old signature: (specs, comparables) - used by rentals
    tier = 'RANGE'
    comparables = legacyComparables
  } else {
    // New signature: ({ tier, comparables })
    const input = inputOrSpecs as CalculateInput
    tier = input.tier
    comparables = input.comparables
  }

  // CONTACT tier: No price calculation
  if (tier === 'CONTACT' || comparables.length === 0) {
    return {
      estimatedPrice: 0,
      currentMarketPrice: undefined,
      priceRange: { low: 0, high: 0 },
      matchTier: 'CONTACT',
      showPrice: false,
      confidence: 'None',
      confidenceMessage: 'Your unit has unique characteristics that require professional analysis for accurate pricing.',
      comparables,
      marketSpeed: {
        avgDaysOnMarket: 0,
        status: 'Moderate',
        message: 'Contact agent for market insights.'
      }
    }
  }

  // Sort by close date (most recent first)
  const sortedComparables = [...comparables].sort(
    (a, b) => new Date(b.closeDate).getTime() - new Date(a.closeDate).getTime()
  )

  // Get prices (use adjustedPrice for ADJUSTED tier, closePrice for others)
  const prices = sortedComparables.map(comp => 
    (tier === 'BINGO-ADJ' || tier === 'RANGE-ADJ' || tier === 'MAINT-ADJ') ? (comp.adjustedPrice || comp.closePrice) : comp.closePrice
  )

  // Calculate average
  const averagePrice = Math.round(prices.reduce((sum, p) => sum + p, 0) / prices.length)

  // Most recent sale price
  const currentMarketPrice = prices[0]

  // Calculate price range based on tier
  const rangeMultiplier = 
    tier === 'BINGO' ? 0.05 :
    tier === 'BINGO-ADJ' ? 0.05 :
    tier === 'RANGE' ? 0.08 :
    tier === 'RANGE-ADJ' ? 0.08 :
    tier === 'MAINT' ? 0.12 :
    tier === 'MAINT-ADJ' ? 0.12 : 0.15
  const priceRange = {
    low: Math.round(averagePrice * (1 - rangeMultiplier)),
    high: Math.round(averagePrice * (1 + rangeMultiplier))
  }

  // Determine confidence based on tier and temperature
  const { confidence, confidenceMessage } = calculateConfidence(tier, sortedComparables)

  // Calculate market speed
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

  // Count matches for summary
  const hotMatches = comparables.filter(c => c.temperature === 'HOT').length
  const warmMatches = comparables.filter(c => c.temperature === 'WARM').length

  return {
    estimatedPrice: averagePrice,
    currentMarketPrice,
    priceRange,
    matchTier: tier,
    showPrice: true,
    confidence,
    confidenceMessage,
    comparables: sortedComparables,
    marketSpeed: {
      avgDaysOnMarket,
      status: marketStatus,
      message: marketMessage
    },
    adjustmentSummary: {
      perfectMatches: hotMatches + warmMatches,
      adjustedComparables: comparables.filter(c => c.adjustments && c.adjustments.length > 0).length,
      avgAdjustment: calculateAvgAdjustment(comparables)
    }
  }
}

/**
 * Calculate confidence level based on tier and recency
 */
function calculateConfidence(
  tier: MatchTier, 
  comparables: ComparableSale[]
): { confidence: EstimateResult['confidence']; confidenceMessage: string } {
  const hotCount = comparables.filter(c => c.temperature === 'HOT').length
  const warmCount = comparables.filter(c => c.temperature === 'WARM').length
  const totalRecent = hotCount + warmCount

  if (tier === 'BINGO') {
    if (hotCount >= 2) {
      return {
        confidence: 'High',
        confidenceMessage: `Strong estimate based on ${hotCount} identical units sold in the last 3 months.`
      }
    }
    if (totalRecent >= 2) {
      return {
        confidence: 'High',
        confidenceMessage: `Strong estimate based on ${comparables.length} identical units sold recently.`
      }
    }
    return {
      confidence: 'Medium-High',
      confidenceMessage: `Good estimate based on ${comparables.length} identical unit${comparables.length > 1 ? 's' : ''}.`
    }
  }

  if (tier === 'BINGO-ADJ') {
    if (totalRecent >= 2) {
      return {
        confidence: 'High',
        confidenceMessage: `Strong estimate based on ${comparables.length} identical units with parking/locker adjustment.`
      }
    }
    return {
      confidence: 'Medium-High',
      confidenceMessage: `Good estimate based on ${comparables.length} identical unit${comparables.length > 1 ? 's' : ''} with adjustments.`
    }
  }

  if (tier === 'RANGE') {
    if (totalRecent >= 2) {
      return {
        confidence: 'Medium-High',
        confidenceMessage: `Good estimate based on ${comparables.length} same-size units.`
      }
    }
    return {
      confidence: 'Medium',
      confidenceMessage: `Estimate based on ${comparables.length} same-size unit${comparables.length > 1 ? 's' : ''}.`
    }
  }

  if (tier === 'RANGE-ADJ') {
    return {
      confidence: 'Medium',
      confidenceMessage: `Estimate based on ${comparables.length} same-size unit${comparables.length > 1 ? 's' : ''} with adjustments.`
    }
  }

  if (tier === 'MAINT') {
    return {
      confidence: 'Medium-Low',
      confidenceMessage: `Estimate based on ${comparables.length} similar-size unit${comparables.length > 1 ? 's' : ''} (maintenance fee proxy).`
    }
  }

  if (tier === 'MAINT-ADJ') {
    return {
      confidence: 'Low',
      confidenceMessage: `Limited data. Estimate based on similar-size units with adjustments.`
    }
  }

  return {
    confidence: 'None',
    confidenceMessage: 'Your unit requires professional analysis for accurate pricing.'
  }
}

/**
 * Calculate average adjustment amount
 */
function calculateAvgAdjustment(comparables: ComparableSale[]): number {
  const adjustedComps = comparables.filter(c => c.adjustments && c.adjustments.length > 0)
  if (adjustedComps.length === 0) return 0

  const totalAdjustment = adjustedComps.reduce((sum, comp) => {
    return sum + (comp.adjustments?.reduce((adjSum, adj) => adjSum + Math.abs(adj.adjustmentAmount), 0) || 0)
  }, 0)

  return Math.round(totalAdjustment / adjustedComps.length)
}