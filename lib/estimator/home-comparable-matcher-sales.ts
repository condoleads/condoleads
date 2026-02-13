// lib/estimator/home-comparable-matcher-sales.ts
import { createClient } from '@/lib/supabase/client'
import {
  ComparableSale,
  PriceAdjustment,
  MatchTier,
  extractExactSqft,
  assignTemperature,
} from './types'

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
}

interface HomeMatchResult {
  tier: MatchTier
  comparables: ComparableSale[]
  geoLevel: 'street' | 'community' | 'municipality' | 'none'
  bestMatchScore?: number
}

// ============ DEFAULT ADJUSTMENT VALUES ============
// These will be replaced by admin-configurable values per geo level in Phase 2

const DEFAULT_ADJUSTMENTS = {
  LOT_FRONTAGE_PER_FOOT: 40000,
  LOT_DEPTH_PER_10FT: 5000,
  LOT_DEPTH_MAX: 30000,
  BASEMENT_FINISHED: 50000,
  BASEMENT_SEP_ENTRANCE: 80000,
  BASEMENT_WALKOUT_BONUS: 30000,
  GARAGE_DETACHED_SINGLE: 30000,
  GARAGE_ATTACHED_SINGLE: 45000,
  GARAGE_BUILTIN: 60000,
  GARAGE_ATTACHED_DOUBLE: 70000,
  POOL_ABOVE_GROUND: 0,
  POOL_INGROUND: 30000,
  PARKING_PER_SPACE: 0,
  BATHROOM_FULL: 20000,
  BATHROOM_HALF: 10000,
  RECENCY_PCT_0_6: 1.0,     // 1% per month for 0-6 months
  RECENCY_PCT_6_12: 0.5,    // 0.5% per month for 6-12 months
  RECENCY_PCT_12_24: 0.3,   // 0.3% per month for 12-24 months
}

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

// ============ BASEMENT HELPERS ============

interface BasementProfile {
  hasBasement: boolean
  isFinished: boolean
  hasSepEntrance: boolean
  hasWalkout: boolean
  isUnfinished: boolean
  score: number // 0=none, 1=unfinished/crawl, 2=partial, 3=finished, 4=finished+sep, 5=finished+walkout+sep
}

function parseBasement(basementArr: string[] | null): BasementProfile {
  if (!basementArr || basementArr.length === 0 || basementArr.includes('None')) {
    return { hasBasement: false, isFinished: false, hasSepEntrance: false, hasWalkout: false, isUnfinished: false, score: 0 }
  }

  const hasFinished = basementArr.some(b => b === 'Finished' || b === 'Finished with Walk-Out')
  const hasPartial = basementArr.includes('Partially Finished')
  const hasSep = basementArr.includes('Separate Entrance') || basementArr.includes('Apartment')
  const hasWalkout = basementArr.some(b => b.includes('Walk-Out') || b.includes('Walk-Up'))
  const isUnfinished = basementArr.includes('Unfinished') || basementArr.includes('Full') ||
    basementArr.includes('Crawl Space') || basementArr.includes('Half')
  const hasDevPotential = basementArr.includes('Development Potential')

  let score = 1 // has basement but unfinished
  if (hasPartial) score = 2
  if (hasFinished) score = 3
  if (hasFinished && hasSep) score = 4
  if (hasFinished && hasWalkout && hasSep) score = 5
  if (hasDevPotential && !hasFinished && !hasPartial) score = 1

  return {
    hasBasement: true,
    isFinished: hasFinished || hasPartial,
    hasSepEntrance: hasSep,
    hasWalkout,
    isUnfinished: isUnfinished && !hasFinished && !hasPartial,
    score,
  }
}

function getBasementAdjustment(subjectArr: string[] | null, compArr: string[] | null): number {
  const subject = parseBasement(subjectArr)
  const comp = parseBasement(compArr)
  const adj = DEFAULT_ADJUSTMENTS

  let subjectValue = 0
  let compValue = 0

  // Calculate subject basement value
  if (subject.isFinished && subject.hasSepEntrance && subject.hasWalkout) {
    subjectValue = adj.BASEMENT_SEP_ENTRANCE + adj.BASEMENT_WALKOUT_BONUS
  } else if (subject.isFinished && subject.hasSepEntrance) {
    subjectValue = adj.BASEMENT_SEP_ENTRANCE
  } else if (subject.isFinished && subject.hasWalkout) {
    subjectValue = adj.BASEMENT_FINISHED + adj.BASEMENT_WALKOUT_BONUS
  } else if (subject.isFinished) {
    subjectValue = adj.BASEMENT_FINISHED
  }

  // Calculate comp basement value
  if (comp.isFinished && comp.hasSepEntrance && comp.hasWalkout) {
    compValue = adj.BASEMENT_SEP_ENTRANCE + adj.BASEMENT_WALKOUT_BONUS
  } else if (comp.isFinished && comp.hasSepEntrance) {
    compValue = adj.BASEMENT_SEP_ENTRANCE
  } else if (comp.isFinished && comp.hasWalkout) {
    compValue = adj.BASEMENT_FINISHED + adj.BASEMENT_WALKOUT_BONUS
  } else if (comp.isFinished) {
    compValue = adj.BASEMENT_FINISHED
  }

  return subjectValue - compValue
}

// ============ GARAGE HELPERS ============

function getGarageValue(garageType: string | null): number {
  const adj = DEFAULT_ADJUSTMENTS
  switch (garageType) {
    case 'Detached': return adj.GARAGE_DETACHED_SINGLE
    case 'Attached': return adj.GARAGE_ATTACHED_SINGLE
    case 'Built-In': return adj.GARAGE_BUILTIN
    case 'Carport': return 15000 // half of detached
    default: return 0 // 'None', 'Lane', 'Street', 'Unknown', etc.
  }
}

// ============ POOL HELPERS ============

function hasIngroundPool(poolFeatures: string[] | null): boolean {
  if (!poolFeatures) return false
  return poolFeatures.includes('Inground')
}

function hasAboveGroundPool(poolFeatures: string[] | null): boolean {
  if (!poolFeatures) return false
  return poolFeatures.includes('Above Ground')
}

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

  // Sqft: 30 pts
  if (specs.exactSqft && specs.exactSqft > 0) {
    const compSqft = extractExactSqft(sale.square_foot_source)
    if (compSqft) {
      const pct = Math.abs(compSqft - specs.exactSqft) / specs.exactSqft
      if (pct <= 0.05) score += 30
      else if (pct <= 0.10) score += 20
      else if (pct <= 0.15) score += 10
      else if (pct <= 0.20) score += 5
    }
  } else if (specs.livingAreaRange) {
    if (sale.living_area_range === specs.livingAreaRange) score += 30
    else score += 0
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
    const monthsAgo = (Date.now() - new Date(sale.close_date).getTime()) / (1000 * 60 * 60 * 24 * 30)
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
    unitNumber: sale.unit_number || extractStreetNumber(sale.unparsed_address)?.toString(),
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
  const supabase = createClient()
  const twoYearsAgo = new Date()
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)

  const subtypes = getCompatibleSubtypes(specs.propertySubtype)
  const subjectStreet = extractStreetName(null) // We don't have subject address in specs
  const subjectStreetNum = extractStreetNumber(null)

  // ===== TIER 1: SAME STREET (within community) =====
  if (specs.communityId) {
    const { data: communitySales } = await supabase
      .from('mls_listings')
      .select(HOME_SELECT)
      .eq('community_id', specs.communityId)
      .in('property_subtype', subtypes)
      .eq('standard_status', 'Closed')
      .not('close_price', 'is', null)
      .gt('close_price', 100000)
      .gte('close_date', twoYearsAgo.toISOString())
      .order('close_date', { ascending: false })
      .limit(300)

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
    const { data: muniSales } = await supabase
      .from('mls_listings')
      .select(HOME_SELECT)
      .eq('municipality_id', specs.municipalityId)
      .in('property_subtype', subtypes)
      .eq('standard_status', 'Closed')
      .not('close_price', 'is', null)
      .gt('close_price', 100000)
      .gte('close_date', twoYearsAgo.toISOString())
      .order('close_date', { ascending: false })
      .limit(500)

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
      const bedBathOnly = cleanSales.filter(s =>
        s.bedrooms_total === specs.bedrooms &&
        Math.abs((s.bathrooms_total_integer || 0) - specs.bathrooms) <= 1
      )
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

    // Filter 4: Size — same range or ±10% exact sqft
    if (specs.exactSqft && specs.exactSqft > 0) {
      const compSqft = extractExactSqft(s.square_foot_source)
      if (compSqft) {
        const pct = Math.abs(compSqft - specs.exactSqft) / specs.exactSqft
        if (pct > 0.10) return false
      }
    } else if (specs.livingAreaRange) {
      if (s.living_area_range !== specs.livingAreaRange) return false
    }

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

    // Filter 4: Size ±20% or adjacent range (relaxed)
    if (specs.exactSqft && specs.exactSqft > 0) {
      const compSqft = extractExactSqft(s.square_foot_source)
      if (compSqft) {
        const pct = Math.abs(compSqft - specs.exactSqft) / specs.exactSqft
        if (pct > 0.20) return false
      }
    }
    // For range: accept any range when relaxed (don't filter)

    // Filter 5: Bathrooms ±1 (relaxed)
    if (Math.abs((s.bathrooms_total_integer || 0) - specs.bathrooms) > 1) return false

    return true
  })
}