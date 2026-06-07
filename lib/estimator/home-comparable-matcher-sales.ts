// lib/estimator/home-comparable-matcher-sales.ts
import { createClient } from '@/lib/supabase/client'
import {
  ComparableSale,
  PriceAdjustment,
  MatchTier,
  extractExactSqft,
  assignTemperature,
} from './types'
import {
  DEFAULT_ADJUSTMENTS,
  parseBasement,
  getBasementAdjustment,
  getGarageValue,
  hasIngroundPool,
  isAdjacentRange,
} from './home-adjustment-math'

// ============ INTERFACES ============

export interface HomeSpecs {
  bedrooms: number
  bathrooms: number
  propertySubtype: string          // 'Detached', 'Semi-Detached', etc.
  communityId: string | null
  municipalityId: string | null
  livingAreaRange?: string
  exactSqft?: number | null
  parking?: number
  lotWidth?: number | null         // DB field: lot_width (this IS frontage)
  lotDepth?: number | null
  lotArea?: number | null
  garageType?: string | null       // 'Attached', 'Detached', 'Built-In', 'None', etc.
  basement?: string | null         // Will receive parsed string from JSONB array
  basementRaw?: string[] | null    // Raw JSONB array from DB: ["Finished", "Separate Entrance"]
  poolFeatures?: string[] | null   // Raw JSONB array: ["Inground"], ["None"], etc.
  architecturalStyle?: string | null // First element from JSONB array: "Bungalow", "2-Storey", etc.
  approximateAge?: string | null   // Pre-bracketed: "0-5", "6-15", "16-30", "31-50", "51-99", "100+", "New"
  agentId?: string
  asOfDate?: Date              // backtest/historical use only - defaults to live (now) when absent
  subjectListingKey?: string   // backtest/historical use only - exclude-self; no effect in live estimates
}

interface HomeMatchResult {
  tier: MatchTier
  comparables: ComparableSale[]
  geoLevel: 'street' | 'community' | 'municipality' | 'none'
  bestMatchScore?: number
}

// ============ DEFAULT ADJUSTMENT VALUES ============
// DEFAULT_ADJUSTMENTS moved to ./home-adjustment-math.js (shared with backtest).
// Phase 2 / build-step-3: replace these flat constants with admin-configurable per-geo values.

// ============ SELECT QUERY ============
const HOME_SELECT = `id, listing_key, close_price, list_price, bedrooms_total,
  bathrooms_total_integer, living_area_range, parking_total, locker,
  days_on_market, close_date, tax_annual_amount, square_foot_source,
  association_fee, unparsed_address, property_subtype, architectural_style,
  approximate_age, lot_width, lot_depth, lot_size_area, basement,
  garage_type, pool_features, public_remarks`

// ============ STYLE FAMILIES ============

const STYLE_FAMILIES: Record<string, string[]> = {
  bungalow: ['Bungalow', 'Bungalow-Raised', 'Bungaloft'],
  twostorey: ['2-Storey', '2 1/2 Storey', '3-Storey'],
  split: ['Sidesplit', 'Sidesplit 3', 'Sidesplit 4', 'Sidesplit 5', 'Backsplit 3', 'Backsplit 4', 'Backsplit 5'],
  oneandhalf: ['1 1/2 Storey'],
  other: ['Contemporary', 'Multi-Level', 'Other', '1 Storey/Apt', 'Apartment', 'Bachelor/Studio'],
}

function getStyleFamily(style: string | null): string {
  if (!style) return 'other'
  for (const [family, members] of Object.entries(STYLE_FAMILIES)) {
    if (members.includes(style)) return family
  }
  return 'other'
}

function isSameStyleFamily(a: string | null, b: string | null): boolean {
  return getStyleFamily(a) === getStyleFamily(b)
}

// ============ AGE BRACKET HELPERS ============

const AGE_BRACKETS_ORDERED = ['New', '0-5', '6-15', '16-30', '31-50', '51-99', '100+']

function normalizeAge(age: string | null): string | null {
  if (!age) return null
  if (age === 'New') return '0-5'
  return age
}

function getAgeBracketIndex(age: string | null): number {
  const normalized = normalizeAge(age)
  if (!normalized) return -1
  return AGE_BRACKETS_ORDERED.indexOf(normalized === '0-5' ? '0-5' : normalized)
}

function isAdjacentAgeBracket(a: string | null, b: string | null): boolean {
  const idxA = getAgeBracketIndex(a)
  const idxB = getAgeBracketIndex(b)
  if (idxA === -1 || idxB === -1) return false
  return Math.abs(idxA - idxB) <= 1
}

// Home adjustment helpers (DEFAULT_ADJUSTMENTS, parseBasement, getBasementAdjustment,
// getGarageValue, hasIngroundPool) moved to ./home-adjustment-math.js (shared with backtest).

// ============ STREET EXTRACTION ============

function extractStreetName(address: string | null): string | null {
  if (!address) return null
  // Format: "22 Westcroft Drive, Toronto E10, ON M1E 3A3"
  const streetPart = address.split(',')[0]?.trim()
  if (!streetPart) return null
  // Remove the street number (first word if it's a number)
  const parts = streetPart.split(' ')
  if (parts.length < 2) return null
  // Remove leading number
  const numberRemoved = parts.slice(1).join(' ')
  // Remove unit suffixes like "Main", "BSMT", "Upper", "Lower"
  return numberRemoved.replace(/\s+(Main|BSMT|Upper|Lower|Rear|Apt|Unit)\s*$/i, '').trim().toLowerCase()
}

function extractStreetNumber(address: string | null): number | null {
  if (!address) return null
  const streetPart = address.split(',')[0]?.trim()
  if (!streetPart) return null
  const num = parseInt(streetPart.split(' ')[0], 10)
  return isNaN(num) ? null : num
}

function isOdd(n: number): boolean {
  return n % 2 !== 0
}

// ============ "AS IS" DETECTION ============

function isAsIs(remarks: string | null): boolean {
  if (!remarks) return false
  const lower = remarks.toLowerCase()
  return lower.includes('as is') || lower.includes('as-is') || lower.includes('sold as is')
}

// ============ PROPERTY TYPE MATCHING ============

function getCompatibleSubtypes(subtype: string): string[] {
  const detachedTypes = ['Detached']
  const semiTypes = ['Semi-Detached']
  const townTypes = ['Att/Row/Townhouse', 'Link']
  const multiTypes = ['Duplex', 'Triplex', 'Fourplex', 'Multiplex']

  if (detachedTypes.includes(subtype)) return detachedTypes
  if (semiTypes.includes(subtype)) return semiTypes
  if (townTypes.includes(subtype)) return townTypes
  if (multiTypes.includes(subtype)) return multiTypes
  return [subtype]
}

// ============ MATCH SCORING (200 POINT SYSTEM) ============

function scoreMatch(sale: any, specs: HomeSpecs, sameStreet: boolean, sameOddEven: boolean): number {
  let score = 0
  const saleStyle = sale.architectural_style?.[0] || null

  // Style: 25 pts
  if (saleStyle === specs.architecturalStyle) score += 25
  else if (isSameStyleFamily(saleStyle, specs.architecturalStyle || null)) score += 15

  // Age: 20 pts
  const saleAge = sale.approximate_age || null
  const specAge = specs.approximateAge || null
  if (saleAge && specAge) {
    if (normalizeAge(saleAge) === normalizeAge(specAge)) score += 20
    else if (isAdjacentAgeBracket(saleAge, specAge)) score += 10
  }

  // Sqft: 30 pts - LAR is the only real home size signal (SFS ~0% parseable on homes).
  // Same bucket = 30, adjacent bucket (+/-1 on canonical ladder) = 15, else 0.
  if (specs.livingAreaRange && sale.living_area_range) {
    if (sale.living_area_range === specs.livingAreaRange) score += 30
    else if (isAdjacentRange(sale.living_area_range, specs.livingAreaRange)) score += 15
  }

  // Lot Frontage: 25 pts
  const saleFrontage = parseFloat(sale.lot_width) || null
  const specFrontage = specs.lotWidth || null
  if (saleFrontage && specFrontage) {
    const diff = Math.abs(saleFrontage - specFrontage)
    if (diff <= 5) score += 25
    else if (diff <= 10) score += 15
    else if (diff <= 15) score += 10
    else if (diff <= 20) score += 5
  }

  // Lot Depth: 10 pts
  const saleDepth = parseFloat(sale.lot_depth) || null
  const specDepth = specs.lotDepth || null
  if (saleDepth && specDepth) {
    const diff = Math.abs(saleDepth - specDepth)
    if (diff <= 10) score += 10
    else if (diff <= 20) score += 5
  }

  // Basement: 15 pts
  const saleBasement = parseBasement(sale.basement)
  const specBasement = parseBasement(specs.basementRaw || (specs.basement ? [specs.basement] : null))
  if (saleBasement.score === specBasement.score) score += 15
  else if (Math.abs(saleBasement.score - specBasement.score) === 1) score += 8

  // Garage: 10 pts
  if (sale.garage_type === specs.garageType) score += 10
  else if (getGarageValue(sale.garage_type) > 0 && getGarageValue(specs.garageType || null) > 0) score += 5

  // Bathrooms: 10 pts
  const bathDiff = Math.abs((sale.bathrooms_total_integer || 0) - specs.bathrooms)
  if (bathDiff === 0) score += 10
  else if (bathDiff === 1) score += 5

  // Pool: 5 pts
  const saleHasPool = hasIngroundPool(sale.pool_features)
  const specHasPool = hasIngroundPool(specs.poolFeatures || null)
  if (saleHasPool === specHasPool) score += 5

  // Recency: 30 pts
  if (sale.close_date) {
    const referenceMs = specs.asOfDate ? specs.asOfDate.getTime() : Date.now()
    const monthsAgo = (referenceMs - new Date(sale.close_date).getTime()) / (1000 * 60 * 60 * 24 * 30)
    if (monthsAgo <= 1) score += 30
    else if (monthsAgo <= 3) score += 25
    else if (monthsAgo <= 6) score += 20
    else if (monthsAgo <= 9) score += 15
    else if (monthsAgo <= 12) score += 10
    else if (monthsAgo <= 18) score += 5
    else score += 2
  }

  // Street bonus: 15 + 5 pts
  if (sameStreet) {
    score += 15
    if (sameOddEven) score += 5
  }

  return score
}

// ============ DETERMINE MATCH TIER FROM SCORE ============

function tierFromScore(score: number, compCount: number): MatchTier {
  if (score >= 160 && compCount >= 3) return 'BINGO'
  if (score >= 130 && compCount >= 3) return 'BINGO-ADJ'
  if (score >= 100 && compCount >= 3) return 'RANGE'
  if (score >= 70 && compCount >= 2) return 'RANGE-ADJ'
  if (score >= 40) return 'MAINT'
  return 'CONTACT'
}

// ============ CREATE COMPARABLE WITH ADJUSTMENTS ============

function createHomeComparable(sale: any, specs: HomeSpecs, matchScore: number): ComparableSale {
  const adjustments: PriceAdjustment[] = []
  let adjustedPrice = sale.close_price

  // 1. Lot Frontage adjustment
  const saleFrontage = parseFloat(sale.lot_width) || null
  const specFrontage = specs.lotWidth || null
  if (saleFrontage && specFrontage) {
    const diff = specFrontage - saleFrontage
    if (Math.abs(diff) >= 1) {
      const amount = Math.round(diff * DEFAULT_ADJUSTMENTS.LOT_FRONTAGE_PER_FOOT)
      adjustedPrice += amount
      adjustments.push({
        type: 'lot_frontage' as any,
        difference: parseFloat(diff.toFixed(1)),
        adjustmentAmount: amount,
        reason: diff > 0
          ? `Your lot is ${Math.abs(diff).toFixed(1)}ft wider (+$${Math.abs(amount).toLocaleString()})`
          : `Comparable lot is ${Math.abs(diff).toFixed(1)}ft wider (-$${Math.abs(amount).toLocaleString()})`,
      })
    }
  }

  // 2. Lot Depth adjustment
  const saleDepth = parseFloat(sale.lot_depth) || null
  const specDepth = specs.lotDepth || null
  if (saleDepth && specDepth) {
    const diff = specDepth - saleDepth
    if (Math.abs(diff) > 10) {
      let amount = Math.round((diff / 10) * DEFAULT_ADJUSTMENTS.LOT_DEPTH_PER_10FT)
      amount = Math.max(-DEFAULT_ADJUSTMENTS.LOT_DEPTH_MAX, Math.min(DEFAULT_ADJUSTMENTS.LOT_DEPTH_MAX, amount))
      adjustedPrice += amount
      adjustments.push({
        type: 'lot_depth' as any,
        difference: parseFloat(diff.toFixed(1)),
        adjustmentAmount: amount,
        reason: diff > 0
          ? `Your lot is ${Math.abs(diff).toFixed(0)}ft deeper (+$${Math.abs(amount).toLocaleString()})`
          : `Comparable lot is ${Math.abs(diff).toFixed(0)}ft deeper (-$${Math.abs(amount).toLocaleString()})`,
      })
    }
  }

  // 3. Basement adjustment
  const basementAdj = getBasementAdjustment(specs.basementRaw || (specs.basement ? [specs.basement] : null), sale.basement)
  if (basementAdj !== 0) {
    adjustedPrice += basementAdj
    adjustments.push({
      type: 'basement' as any,
      difference: basementAdj > 0 ? 1 : -1,
      adjustmentAmount: basementAdj,
      reason: basementAdj > 0
        ? `Your basement has more features (+$${Math.abs(basementAdj).toLocaleString()})`
        : `Comparable has better basement (-$${Math.abs(basementAdj).toLocaleString()})`,
    })
  }

  // 4. Garage adjustment
  const subjectGarageVal = getGarageValue(specs.garageType || null)
  const compGarageVal = getGarageValue(sale.garage_type)
  const garageAdj = subjectGarageVal - compGarageVal
  if (garageAdj !== 0) {
    adjustedPrice += garageAdj
    adjustments.push({
      type: 'garage' as any,
      difference: garageAdj > 0 ? 1 : -1,
      adjustmentAmount: garageAdj,
      reason: garageAdj > 0
        ? `Your home has better garage (+$${Math.abs(garageAdj).toLocaleString()})`
        : `Comparable has better garage (-$${Math.abs(garageAdj).toLocaleString()})`,
    })
  }

  // 5. Pool adjustment (inground only)
  const subjectHasInground = hasIngroundPool(specs.poolFeatures || null)
  const compHasInground = hasIngroundPool(sale.pool_features)
  if (subjectHasInground !== compHasInground) {
    const poolAdj = subjectHasInground
      ? DEFAULT_ADJUSTMENTS.POOL_INGROUND
      : -DEFAULT_ADJUSTMENTS.POOL_INGROUND
    adjustedPrice += poolAdj
    adjustments.push({
      type: 'pool' as any,
      difference: poolAdj > 0 ? 1 : -1,
      adjustmentAmount: poolAdj,
      reason: poolAdj > 0
        ? `Your home has an inground pool (+$${Math.abs(poolAdj).toLocaleString()})`
        : `Comparable has an inground pool (-$${Math.abs(poolAdj).toLocaleString()})`,
    })
  }

  // 6. Bathroom adjustment
  const bathDiff = specs.bathrooms - (sale.bathrooms_total_integer || 0)
  if (bathDiff !== 0) {
    const bathAdj = bathDiff * DEFAULT_ADJUSTMENTS.BATHROOM_FULL
    adjustedPrice += bathAdj
    adjustments.push({
      type: 'bathroom' as any,
      difference: bathDiff,
      adjustmentAmount: bathAdj,
      reason: bathDiff > 0
        ? `Your home has ${Math.abs(bathDiff)} more bathroom${Math.abs(bathDiff) > 1 ? 's' : ''} (+$${Math.abs(bathAdj).toLocaleString()})`
        : `Comparable has ${Math.abs(bathDiff)} more bathroom${Math.abs(bathDiff) > 1 ? 's' : ''} (-$${Math.abs(bathAdj).toLocaleString()})`,
    })
  }

  // A1b: cap aggregate adjustment magnitude. Six additive adjustments can stack
  // catastrophically when the matcher pooled a dissimilar comp; clamp to +/-50%
  // of close_price keeps adjustedPrice within sanity (symmetric counterpart to
  // the A1 negative-price floor in statistical-calculator.ts).
  adjustedPrice = Math.max(sale.close_price * 0.5, Math.min(sale.close_price * 1.5, adjustedPrice))

  // Determine match quality from score
  let matchQuality: 'Perfect' | 'Excellent' | 'Good' | 'Fair' = 'Fair'
  if (matchScore >= 160) matchQuality = 'Perfect'
  else if (matchScore >= 130) matchQuality = 'Excellent'
  else if (matchScore >= 100) matchQuality = 'Good'

  return {
    closePrice: sale.close_price,
    listPrice: sale.list_price,
    bedrooms: sale.bedrooms_total,
    bathrooms: sale.bathrooms_total_integer || 0,
    livingAreaRange: sale.living_area_range || 'Unknown',
    parking: sale.parking_total || 0,
    locker: sale.locker || null,
    daysOnMarket: sale.days_on_market || 0,
    closeDate: sale.close_date,
    taxAnnualAmount: sale.tax_annual_amount || undefined,
    exactSqft: extractExactSqft(sale.square_foot_source) ?? undefined,
    unitNumber: sale.unit_number || undefined,
    propertySubtype: sale.property_subtype,
    listingKey: sale.listing_key,
    buildingSlug: undefined, // Homes don't have building slugs
    unparsedAddress: sale.unparsed_address,
    temperature: assignTemperature(sale.close_date),
    matchTier: tierFromScore(matchScore, 1) as MatchTier,
    matchQuality,
    matchScore,
    adjustments: adjustments.length > 0 ? adjustments : undefined,
    adjustedPrice: adjustments.length > 0 ? adjustedPrice : undefined,
  }
}

// ============ MAIN FUNCTION ============

export async function findHomeComparables(specs: HomeSpecs): Promise<HomeMatchResult> {
  // Multi-unit subtypes cannot be priced on the home spine (33.4% backtest MAPE,
  // 1.6x single-family). Income axis unavailable (NOI fill 7.6%, 0% in 90d
  // freshness window, pool survival 9-44%). Route to agent.
  if (['Duplex', 'Triplex', 'Fourplex', 'Multiplex'].includes(specs.propertySubtype)) {
    return { tier: 'CONTACT', comparables: [], geoLevel: 'none' }
  }

  const supabase = createClient()
  const referenceDate = specs.asOfDate ?? new Date()
  const twoYearsAgo = new Date(referenceDate)
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)

  const subtypes = getCompatibleSubtypes(specs.propertySubtype)
  const subjectStreet = extractStreetName(null) // We don't have subject address in specs
  const subjectStreetNum = extractStreetNumber(null)

  // ===== TIER 1: SAME STREET (within community) =====
  if (specs.communityId) {
    let qCommunity = supabase
      .from('mls_listings')
      .select(HOME_SELECT)
      .eq('community_id', specs.communityId)
      .in('property_subtype', subtypes)
      .eq('transaction_type', 'For Sale')
      .eq('standard_status', 'Closed')
      .not('close_price', 'is', null)
      .gt('close_price', 100000)
      .gte('close_date', twoYearsAgo.toISOString())
      .order('close_date', { ascending: false })
      .limit(300)
    if (specs.asOfDate) qCommunity = qCommunity.lt('close_date', referenceDate.toISOString())
    const { data: communitySales } = await qCommunity

    if (communitySales && communitySales.length > 0) {
      // Filter out "as is" properties
      const cleanSales = communitySales.filter(s => !isAsIs(s.public_remarks))

      // Apply funnel: style + age + size
      const funneled = applyFunnel(cleanSales, specs)

      if (funneled.length >= 3) {
        // Score all and sort
        const scored = funneled.map(s => {
          const saleStreet = extractStreetName(s.unparsed_address)
          const saleNum = extractStreetNumber(s.unparsed_address)
          const sameStreet = false // We don't have subject address — street matching needs address passed in
          const sameOddEven = false
          return {
            sale: s,
            score: scoreMatch(s, specs, sameStreet, sameOddEven),
          }
        }).sort((a, b) => b.score - a.score)

        const bestScore = scored[0].score
        const tier = tierFromScore(bestScore, scored.length)
        const comps = scored.slice(0, 10).map(s => createHomeComparable(s.sale, specs, s.score))

        return { tier, comparables: comps, geoLevel: 'community', bestMatchScore: bestScore }
      }

      // If funnel is too strict, try relaxed (style family + adjacent age)
      const relaxed = applyRelaxedFunnel(cleanSales, specs)
      if (relaxed.length >= 3) {
        const scored = relaxed.map(s => ({
          sale: s,
          score: scoreMatch(s, specs, false, false),
        })).sort((a, b) => b.score - a.score)

        const bestScore = scored[0].score
        const tier = tierFromScore(bestScore, scored.length)
        const comps = scored.slice(0, 10).map(s => createHomeComparable(s.sale, specs, s.score))

        return { tier, comparables: comps, geoLevel: 'community', bestMatchScore: bestScore }
      }
    }
  }

  // ===== TIER 2: MUNICIPALITY =====
  if (specs.municipalityId) {
    let qMuni = supabase
      .from('mls_listings')
      .select(HOME_SELECT)
      .eq('municipality_id', specs.municipalityId)
      .in('property_subtype', subtypes)
      .eq('transaction_type', 'For Sale')
      .eq('standard_status', 'Closed')
      .not('close_price', 'is', null)
      .gt('close_price', 100000)
      .gte('close_date', twoYearsAgo.toISOString())
      .order('close_date', { ascending: false })
      .limit(500)
    if (specs.asOfDate) qMuni = qMuni.lt('close_date', referenceDate.toISOString())
    const { data: muniSales } = await qMuni

    if (muniSales && muniSales.length > 0) {
      const cleanSales = muniSales.filter(s => !isAsIs(s.public_remarks))

      // Try strict funnel first
      let pool = applyFunnel(cleanSales, specs)
      if (pool.length < 3) {
        pool = applyRelaxedFunnel(cleanSales, specs)
      }

      if (pool.length >= 2) {
        const scored = pool.map(s => ({
          sale: s,
          score: scoreMatch(s, specs, false, false),
        })).sort((a, b) => b.score - a.score)

        const bestScore = scored[0].score
        const tier = tierFromScore(bestScore, scored.length)
        const comps = scored.slice(0, 10).map(s => createHomeComparable(s.sale, specs, s.score))

        return { tier, comparables: comps, geoLevel: 'municipality', bestMatchScore: bestScore }
      }

      // Last resort: just bed+bath match at municipality
      const bedBathOnly = cleanSales.filter(s => {
        if (s.bedrooms_total !== specs.bedrooms) return false
        if (Math.abs((s.bathrooms_total_integer || 0) - specs.bathrooms) > 1) return false
        // Product-gate the last resort too: never pool dissimilar style/size.
        const saleStyle = s.architectural_style?.[0] || null
        if (specs.architecturalStyle && saleStyle &&
            saleStyle !== specs.architecturalStyle &&
            !isSameStyleFamily(saleStyle, specs.architecturalStyle || null)) return false
        if (specs.livingAreaRange && s.living_area_range !== specs.livingAreaRange &&
            !isAdjacentRange(s.living_area_range, specs.livingAreaRange)) return false
        return true
      })
      if (bedBathOnly.length >= 2) {
        const scored = bedBathOnly.map(s => ({
          sale: s,
          score: scoreMatch(s, specs, false, false),
        })).sort((a, b) => b.score - a.score)

        const bestScore = scored[0].score
        const comps = scored.slice(0, 10).map(s => createHomeComparable(s.sale, specs, s.score))

        return { tier: 'CONTACT', comparables: comps, geoLevel: 'municipality', bestMatchScore: bestScore }
      }
    }
  }

  // ===== TIER 3: CONTACT =====
  return { tier: 'CONTACT', comparables: [], geoLevel: 'none' }
}

// ============ FUNNEL FILTERS ============

/**
 * Strict funnel: exact style + same age bracket + size match
 */
function applyFunnel(sales: any[], specs: HomeSpecs): any[] {
  return sales.filter(s => {
    // Filter 1: Style — exact match or same family
    const saleStyle = s.architectural_style?.[0] || null
    if (specs.architecturalStyle && saleStyle) {
      if (saleStyle !== specs.architecturalStyle && !isSameStyleFamily(saleStyle, specs.architecturalStyle || null)) {
        return false
      }
    }

    // Filter 2: Age — same bracket (skip if either is null)
    if (specs.approximateAge && s.approximate_age) {
      if (normalizeAge(s.approximate_age) !== normalizeAge(specs.approximateAge)) {
        return false
      }
    }

    // Filter 3: Bedrooms must match exactly
    if (s.bedrooms_total !== specs.bedrooms) return false

    // Filter 4: Size - strict = exact LAR bucket (only real home size signal).
    if (specs.livingAreaRange && s.living_area_range !== specs.livingAreaRange) return false

    return true
  })
}

/**
 * Relaxed funnel: style family + adjacent age + size ±20%
 */
function applyRelaxedFunnel(sales: any[], specs: HomeSpecs): any[] {
  return sales.filter(s => {
    // Filter 1: Style family match (relaxed)
    const saleStyle = s.architectural_style?.[0] || null
    if (specs.architecturalStyle && saleStyle) {
      if (!isSameStyleFamily(saleStyle, specs.architecturalStyle || null)) {
        return false
      }
    }

    // Filter 2: Adjacent age bracket (relaxed)
    if (specs.approximateAge && s.approximate_age) {
      if (!isAdjacentAgeBracket(s.approximate_age, specs.approximateAge)) {
        return false
      }
    }

    // Filter 3: Bedrooms must still match
    if (s.bedrooms_total !== specs.bedrooms) return false

    // Filter 4: Size (relaxed) - same OR +/-1 adjacent LAR bucket. Closes the prior
    // 'accept any range' hole that pooled dissimilar-size comps into RANGE-ADJ.
    if (specs.livingAreaRange && s.living_area_range !== specs.livingAreaRange &&
        !isAdjacentRange(s.living_area_range, specs.livingAreaRange)) return false

    // Filter 5: Bathrooms ±1 (relaxed)
    if (Math.abs((s.bathrooms_total_integer || 0) - specs.bathrooms) > 1) return false

    return true
  })
}
