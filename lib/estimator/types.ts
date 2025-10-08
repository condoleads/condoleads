// lib/estimator/types.ts

export interface UnitSpecs {
  bedrooms: number
  bathrooms: number
  livingAreaRange: string  // e.g., "700-799"
  parking: number
  hasLocker: boolean
  buildingId: string
  taxAnnualAmount?: number  // Optional - for better matching
  exactSqft?: number  // Optional - extracted from square_foot_source
}

export interface PriceAdjustment {
  type: 'parking' | 'locker' | 'bathroom'
  difference: number  // +1 or -1
  adjustmentAmount: number  // Dollar amount
  reason: string  // Human-readable explanation
}

export interface ComparableSale {
  closePrice: number
  listPrice: number
  bedrooms: number
  bathrooms: number
  livingAreaRange: string
  parking: number
  locker: string | null
  daysOnMarket: number
  closeDate: string
  taxAnnualAmount?: number

  // NEW: Exact sqft for better matching display
  exactSqft?: number           // ADD THIS
  userExactSqft?: number        // ADD THIS - to show user's sqft for comparison
  associationFee?: number       // ADD THIS - maintenance fee
  
  // NEW: Adjustment tracking
  adjustments?: PriceAdjustment[]
  adjustedPrice?: number
  matchQuality?: 'Perfect' | 'Excellent' | 'Good' | 'Fair'
  matchScore?: number
}

export interface EstimateResult {
  estimatedPrice: number
  priceRange: {
    low: number
    high: number
  }
  confidence: 'High' | 'Medium' | 'Low'
  comparables: ComparableSale[]
  marketSpeed: {
    avgDaysOnMarket: number
    status: 'Fast' | 'Moderate' | 'Slow'
    message: string
  }
  adjustmentSummary?: {
    perfectMatches: number
    adjustedComparables: number
    avgAdjustment: number
  }
  aiInsights?: {
    summary: string
    keyFactors: string[]
    marketTrend: string
  }
}

// Adjustment constants
export const ADJUSTMENT_VALUES = {
  PARKING_PER_SPACE: 50000,
  LOCKER: 10000,
  BATHROOM: 50000
} as const
// Extract exact sqft from square_foot_source field
export function extractExactSqft(squareFootSource: string | null | undefined): number | null {
  if (!squareFootSource) return null
  
  const cleaned = squareFootSource.replace(/,/g, '').toLowerCase()
  
  // Reject patterns that aren't actual sqft
  if (cleaned.match(/^\+\s*\d+/)) return null  // Starts with + (balcony only)
  if (cleaned.match(/^\d+-\d+$/)) return null  // Pure range like "0-499"
  if (cleaned.match(/3rd\s+party/i)) return null
  
  // Extract first 3-4 digit number
  const match = cleaned.match(/\b(\d{3,4})\b/)
  if (!match) return null
  
  const value = parseInt(match[1])
  if (value > 5000) return null  // Sanity check
  
  return value
}