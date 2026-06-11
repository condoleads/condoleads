// lib/estimator/types.ts

// ============ NEW: Temperature & Tier Types ============

export type Temperature = 'HOT' | 'WARM' | 'COLD' | 'FROZEN'
export type MatchTier = 'BINGO' | 'BINGO-ADJ' | 'RANGE' | 'RANGE-ADJ' | 'MAINT' | 'MAINT-ADJ' | 'CONTACT'

export const TEMPERATURE_CONFIG = {
  HOT: { maxMonths: 3, icon: 'ðŸ”¥', label: 'Hot', color: 'text-red-500' },
  WARM: { maxMonths: 6, icon: 'ðŸŒ¡ï¸', label: 'Warm', color: 'text-orange-500' },
  COLD: { maxMonths: 12, icon: 'â„ï¸', label: 'Cold', color: 'text-blue-500' },
  FROZEN: { maxMonths: 24, icon: 'ðŸ§Š', label: 'Frozen', color: 'text-slate-400' }
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
  propertySubtype?: string
  listingKey?: string
  buildingSlug?: string
  unparsedAddress?: string

  // h2: income signals for plex comp tiles. Silent-omit when null/0 — fill
  // rates are 7-15% on plex (per recon), so most tiles will not carry these.
  // Cap-rate is derived per-tile from netOperatingIncome ÷ closePrice in the
  // render layer; not stored on the comparable itself.
  netOperatingIncome?: number | null
  grossRevenue?: number | null

  // h3: thumbnail URL attached by the matcher's media batch join. Used by
  // the Charlie-style plex tile (photo column). SF tiles do not render it.
  mediaUrl?: string | null

  // W-TAX-MATCH b1 (2026-06-11): which GEO TIER this comp came from
  // (platinum/gold/silver/bronze). Stamped by runTaxMatchCascade when
  // building the multi-tier display list. Distinct from matchTier (which is
  // the WITHIN-TIER match label: BINGO/RANGE/MAINT). Silent-omit on geo-
  // path comps (only the tax-mode multi-tier list carries it).
  sourceTier?: 'platinum' | 'gold' | 'silver' | 'bronze'

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

// ============ Geo-Tier Spread (Platinum / Gold / Silver / Bronze) ============
//
// LOCK (tracker section 3, 2026-06-07): the matcher COMPUTES all four geo tiers
// every time, DISPLAYS all four as a confidence spread, PRICES from the BEST
// tier only — never blends. This shape carries the per-tier context for the
// display layer. Best-tier resolution rule is enforced in the matcher
// (Platinum>Gold>Silver>Bronze>CONTACT) and the chosen tier's data is
// duplicated to the top-level fields (tier, comparables, bestMatchScore,
// estimatedPrice) for back-compat with consumers that read only top-level.
//
// NOTE: the geo tier (Platinum/Gold/Silver/Bronze) is a SEPARATE AXIS from the
// MatchTier quality labels (BINGO/RANGE/MAINT/CONTACT). geoTier tells you
// WHERE the comps came from; MatchTier tells you HOW WELL they matched your
// specs. Both axes coexist on every result.
export interface TierResult {
  comparables: ComparableSale[]   // top 10 scored (best tier gets full createHomeComparable; non-best may be lightweight)
  count: number                    // pool size AFTER funnel (the candidates available — not capped to top 10)
  median: number                   // median of close_price across the full pool (raw, not adjusted)
  range: { low: number; high: number }  // p10/p90 (or min/max for tiny pools) of close_price
  bestMatchScore: number           // top comp's score in the pool
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

  // h7 (2026-06-09) geo-tier spread (Platinum/Gold/Silver/Bronze). Each tier is
  // null when its geo data is missing or the pool produced zero comps. The
  // best tier is also reflected in the top-level fields above; the other three
  // are display-only context. SF subjects only — plex path leaves this undefined.
  // bestGeoTier names the tier that priced the result (or 'none' for CONTACT).
  tiers?: {
    platinum: TierResult | null
    gold:     TierResult | null
    silver:   TierResult | null
    bronze:   TierResult | null
  }
  bestGeoTier?: 'platinum' | 'gold' | 'silver' | 'bronze' | 'none'

  // W-TAX-MATCH (2026-06-11): tax-as-match-criterion result set. Additive —
  // condo SALE only; lease (~0% tax fill) + home (separate phase) leave it
  // undefined, so the EstimatorResults section auto-hides. Selects comps by
  // property-tax proximity (same-muni, +/-20% band — reuses h8 gate as a
  // selector via withinTaxBand), prices off their sold prices, renders co-
  // equal to the geo cascade.
  // Backtest N=200 (2026-06-11): tax 8.4% median APE / 72.1% +/-15 hit vs
  // geo 10.4% / 60.6%; KEEP Platinum (60.5% have >=2 in-bldg tax-band comps);
  // CO-EQUAL framing; NO combined estimate.
  taxMatch?: {
    matchTier:        MatchTier
    comparables:      ComparableSale[]
    estimatedPrice:   number
    priceRange:       { low: number; high: number }
    count:            number
    tiers?:           {
      platinum: TierResult | null
      gold:     TierResult | null
      silver:   TierResult | null
      bronze:   TierResult | null
    }
    bestGeoTier?:     'platinum' | 'gold' | 'silver' | 'bronze' | 'none'
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
// ============ HOME ESTIMATOR TYPES ============

export interface HomeUnitSpecs {
  bedrooms: number
  bathrooms: number
  propertySubtype: string
  communityId: string
  municipalityId?: string
  frontage?: number
  lotWidth?: number
  lotDepth?: number
  lotArea?: number
  livingAreaRange?: string
  exactSqft?: number
  legalStories?: number
  approximateAge?: string
  basementType?: string[]
  garageType?: string
  hasPool?: boolean
  hasFireplace?: boolean
  hasCentralAir?: boolean
  taxAnnualAmount?: number
  agentId?: string
  includeAI?: boolean
}

export const HOME_ADJUSTMENT_VALUES_SALE = {
  BATHROOM: 25000,
  BASEMENT_FINISHED_FULL: 0,
  BASEMENT_FINISHED_PART: -15000,
  BASEMENT_PART_FINISHED_FULL: -20000,
  BASEMENT_UNFINISHED_FULL: -40000,
  BASEMENT_NONE: -60000,
  GARAGE_ATTACHED: 60000,
  GARAGE_BUILTIN: 55000,
  GARAGE_DETACHED: 40000,
  GARAGE_CARPORT: 15000,
  GARAGE_NONE: 0,
  POOL: 30000,
  FIREPLACE: 5000,
  CENTRAL_AIR: 10000,
} as const

export const HOME_ADJUSTMENT_VALUES_LEASE = {
  BATHROOM: 75,
  BASEMENT_FINISHED: 200,
  GARAGE_ATTACHED: 150,
  GARAGE_DETACHED: 100,
  POOL: 100,
  CENTRAL_AIR: 50,
  FIREPLACE: 25,
} as const

export const FRONTAGE_VALUE_PER_FT: Record<string, number> = {
  'Toronto': 8000,
  'Oakville': 6000,
  'Burlington': 5000,
  'Mississauga': 5500,
  'Vaughan': 5000,
  'Markham': 4500,
  'Richmond Hill': 4500,
  'Brampton': 3500,
  'Hamilton': 3000,
  'default': 4000,
}

export const AGE_RANGES = ['New', '0-5', '6-15', '16-30', '31-50', '51-99', '100+']

export function getBasementScore(basement: string[] | string | null): string {
  if (!basement) return 'None'
  const arr = Array.isArray(basement) ? basement : [basement]
  const joined = arr.join(' ').toLowerCase()
  const hasFinished = joined.includes('finished') && !joined.includes('unfinished')
  const hasPartFinished = joined.includes('part') && joined.includes('finished')
  const hasFull = joined.includes('full')
  const hasPart = joined.includes('part') && !joined.includes('finished')
  if (hasFinished && hasFull) return 'Finished + Full'
  if (hasFinished && !hasFull) return 'Finished + Part'
  if (hasPartFinished) return 'Part Finished + Full'
  if (hasFull && !hasFinished) return 'Unfinished + Full'
  if (joined.includes('none') || joined.includes('crawl')) return 'None'
  return 'Other'
}

export function getBasementValue(basementScore: string, isSale: boolean): number {
  if (!isSale) {
    return basementScore.includes('Finished') ? 200 : 0
  }
  const values: Record<string, number> = {
    'Finished + Full': 0,
    'Finished + Part': -15000,
    'Part Finished + Full': -20000,
    'Unfinished + Full': -40000,
    'None': -60000,
    'Other': -30000,
  }
  return values[basementScore] ?? -30000
}

export function getGarageValue(garageType: string | null, isSale: boolean): number {
  if (!garageType || garageType === 'None') return 0
  if (isSale) {
    const v: Record<string, number> = { 'Attached': 60000, 'Built-In': 55000, 'Detached': 40000, 'Carport': 15000 }
    return v[garageType] ?? 20000
  }
  const v: Record<string, number> = { 'Attached': 150, 'Built-In': 150, 'Detached': 100, 'Carport': 50 }
  return v[garageType] ?? 75
}
