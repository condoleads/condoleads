// lib/estimator/types.ts

export interface UnitSpecs {
  bedrooms: number
  bathrooms: number
  livingAreaRange: string  // e.g., "700-799"
  parking: number
  hasLocker: boolean
  buildingId: string
  taxAnnualAmount?: number  // Optional - for better matching
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
  PARKING_PER_SPACE: 85000,
  LOCKER: 10000,
  BATHROOM: 50000
} as const