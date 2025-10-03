// lib/estimator/types.ts
export interface UnitSpecs {
  bedrooms: number
  bathrooms: number
  livingAreaRange: string  // e.g., "700-799"
  parking: number
  hasLocker: boolean
  buildingId: string
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
  aiInsights?: {
    summary: string
    keyFactors: string[]
    marketTrend: string
  }
}