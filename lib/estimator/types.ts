// lib/estimator/types.ts

// ============ NEW: Temperature & Tier Types ============

export type Temperature = 'HOT' | 'WARM' | 'COLD' | 'FROZEN'
export type MatchTier = 'BINGO' | 'BINGO-ADJ' | 'RANGE' | 'RANGE-ADJ' | 'MAINT' | 'MAINT-ADJ' | 'CONTACT'

export const TEMPERATURE_CONFIG = {
  HOT: { maxMonths: 3, icon: '🔥', label: 'Hot', color: 'text-red-500' },
  WARM: { maxMonths: 6, icon: '🌡️', label: 'Warm', color: 'text-orange-500' },
  COLD: { maxMonths: 12, icon: '❄️', label: 'Cold', color: 'text-blue-500' },
  FROZEN: { maxMonths: 24, icon: '🧊', label: 'Frozen', color: 'text-slate-400' }
} as const

// ============ Unit Specs ============

export interface UnitSpecs {
  bedrooms: number
  bathrooms: number
  livingAreaRange: string  // e.g., "700-799"
  parking: number
  hasLocker: boolean
  buildingId: string
  buildingSlug?: string  // For generating view links
  agentId?: string  // For AI feature access control
  taxAnnualAmount?: number  // Optional - for better matching
  exactSqft?: number  // Optional - extracted from square_foot_source
  associationFee?: number  // Optional - maintenance fee for comparison
}

// ============ Price Adjustments ============

export interface PriceAdjustment {
  type: 'parking' | 'locker' | 'bathroom'
  difference: number  // +1 or -1
  adjustmentAmount: number  // Dollar amount
  reason: string  // Human-readable explanation
}

// Adjustment constants - SALES
export const ADJUSTMENT_VALUES = {
  PARKING_PER_SPACE: 50000,
  LOCKER: 10000,
  BATHROOM: 50000
} as const

// Adjustment constants - LEASE (monthly)
export const ADJUSTMENT_VALUES_LEASE = {
  PARKING_PER_SPACE: 200,
  LOCKER: 50
} as const

// ============ Comparable Sale ============

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
  exactSqft?: number
  userExactSqft?: number
  associationFee?: number
  unitNumber?: string
  listingKey?: string
  buildingSlug?: string
  
  // Match classification
  temperature?: Temperature
  matchTier?: MatchTier
  matchQuality?: 'Perfect' | 'Excellent' | 'Good' | 'Fair'
  matchScore?: number
  
  // Adjustments (for ADJUSTED tier)
  adjustments?: PriceAdjustment[]
  adjustedPrice?: number
  
  // Why it doesn't match (for CONTACT tier)
  mismatchReason?: string
}

// ============ Estimate Result ============

export interface EstimateResult {
  // Price info
  estimatedPrice: number  // Average of all matches
  currentMarketPrice?: number  // Most recent sale price
  priceRange: {
    low: number
    high: number
  }
  
  // Match info
  matchTier: MatchTier
  showPrice: boolean  // false for CONTACT tier
  confidence: 'High' | 'Medium-High' | 'Medium' | 'Medium-Low' | 'Low' | 'None'
  confidenceMessage: string
  
  // Comparables
  comparables: ComparableSale[]
  
  // Market speed
  marketSpeed: {
    avgDaysOnMarket: number
    status: 'Fast' | 'Moderate' | 'Slow'
    message: string
  }
  
  // Summary
  adjustmentSummary?: {
    perfectMatches: number
    adjustedComparables: number
    avgAdjustment: number
  }
  
  // AI insights (optional)
  aiInsights?: {
    summary: string
    keyFactors: string[]
    marketTrend: string
  }
}

// ============ Helper Functions ============

/**
 * Extract exact sqft from square_foot_source field
 */
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

/**
 * Assign temperature based on how recent the sale was
 */
export function assignTemperature(closeDate: string): Temperature {
  const saleDate = new Date(closeDate)
  const now = new Date()
  const monthsAgo = (now.getTime() - saleDate.getTime()) / (1000 * 60 * 60 * 24 * 30)
  
  if (monthsAgo <= TEMPERATURE_CONFIG.HOT.maxMonths) return 'HOT'
  if (monthsAgo <= TEMPERATURE_CONFIG.WARM.maxMonths) return 'WARM'
  if (monthsAgo <= TEMPERATURE_CONFIG.COLD.maxMonths) return 'COLD'
  return 'FROZEN'
}

/**
 * Check if maintenance fees are within tolerance (20%)
 */
export function isMaintenanceMatch(userFee: number | undefined, compFee: number | undefined, tolerance: number = 0.20): boolean {
  if (!userFee || !compFee) return true  // If either is missing, don't disqualify
  const diff = Math.abs(userFee - compFee) / userFee
  return diff <= tolerance
}