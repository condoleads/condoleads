// lib/estimator/statistical-calculator.ts
import { ComparableSale, EstimateResult, MatchTier, TEMPERATURE_CONFIG } from './types'

interface CalculateInput {
  tier: MatchTier
  comparables: ComparableSale[]
  // Subject-class noun for the market-conditions copy. Default (when this
  // field is absent) is { unit: 'Units', place: 'building' } — preserves the
  // historical condo phrasing byte-identically. Home actions pass
  // { unit: 'Homes', place: 'area' } to avoid saying "in this building" on a
  // detached home. Pricing/numeric output is unaffected by this field.
  marketNoun?: { unit: string; place: string }
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
  // Default preserves the historical condo phrasing byte-identically. New-
  // signature callers can override via input.marketNoun.
  let marketNoun: { unit: string; place: string } = { unit: 'Units', place: 'building' }

  if (legacyComparables !== undefined) {
    // Old signature: (specs, comparables) - used by rentals.
    // Legacy callers are condo-only; default noun is correct for them.
    tier = 'RANGE'
    comparables = legacyComparables
  } else {
    // New signature: ({ tier, comparables, marketNoun? })
    const input = inputOrSpecs as CalculateInput
    tier = input.tier
    comparables = input.comparables
    if (input.marketNoun) marketNoun = input.marketNoun
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

  // Get prices (use adjustedPrice for ADJUSTED tier, closePrice for others).
  // Floor: a non-positive adjustedPrice (additive adjustments overshooting a low
  // closePrice) is never a valid comp price - fall back to the real sale price
  // rather than averaging in an impossible negative or zero.
  const prices = sortedComparables.map(comp => {
    const useAdjusted = tier === 'BINGO-ADJ' || tier === 'RANGE-ADJ' || tier === 'MAINT-ADJ'
    if (useAdjusted && comp.adjustedPrice && comp.adjustedPrice > 0) {
      return comp.adjustedPrice
    }
    return comp.closePrice
  })

  // B1: score-weighted mean. Higher-scoring comps pull the estimate more.
  // Condo + lease comps have no matchScore -> fallback constant degenerates to
  // unweighted mean (provable identity: sum(p*100)/sum(100) = sum(p)/n).
  const FALLBACK_SCORE = 100
  const weights = sortedComparables.map(c => c.matchScore ?? FALLBACK_SCORE)
  const totalWeight = weights.reduce((sum, w) => sum + w, 0)
  const weightedSum = prices.reduce((sum, p, i) => sum + p * weights[i], 0)
  const averagePrice = Math.round(weightedSum / totalWeight)

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
    marketMessage = `${marketNoun.unit} are selling quickly in this ${marketNoun.place}. Strong seller's market.`
  } else if (avgDaysOnMarket < 60) {
    marketStatus = 'Moderate'
    marketMessage = `Normal market conditions. ${marketNoun.unit} selling at a steady pace.`
  } else {
    marketStatus = 'Slow'
    marketMessage = `${marketNoun.unit} taking longer to sell. Buyer's market with more negotiating room.`
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