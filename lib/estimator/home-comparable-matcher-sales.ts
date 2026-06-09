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

  // Street-level matching activation (2026-06-08): when present, the matcher
  // computes sameStreet (15 pts) and sameOddEven (5 pts) bonuses against each
  // comp's parsed unparsed_address. When absent (undefined) the bonuses are
  // skipped, preserving exact pre-activation behavior for un-plumbed callers.
  // Subject name must pass through normalizePlaceName so it matches the
  // (lowercased + suffix-stripped) parse from comp's unparsed_address.
  subjectStreetName?: string
  subjectStreetNumber?: number
}

interface HomeMatchResult {
  tier: MatchTier
  comparables: ComparableSale[]
  geoLevel: 'street' | 'community' | 'municipality' | 'area' | 'none'
  bestMatchScore?: number
  // h1: when set, server-action short-circuits calculateEstimate's mean
  // aggregation and uses this value (the plex-axis median per backtest).
  // Production must mirror the measurement; the calculator's mean would
  // differ from the backtest's median on plex pools.
  estimatedPrice?: number
}

// h1: per-subtype price-band fractions, keyed to the MEASURED median APE
// from scripts-output/backtest-plex-axis.txt (2026-06-08). NOT a magic
// number — the band is an honest reflection of the subtype's measured
// error. Tightening below this would claim confidence we measured
// ourselves NOT to have. h2/h4 may refine the band shape but the
// floor stays at-or-above the measured median APE.
//
//   Duplex   median APE 17.4%  →  ±0.17
//   Triplex  median APE 22.1%  →  ±0.22
//
// Fourplex/Multiplex are enrich-only (no priced path) — no band needed.
export const PLEX_PRICE_BAND_FRACTION: Record<string, number> = {
  Duplex:  0.17,
  Triplex: 0.22,
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
  garage_type, pool_features, public_remarks,
  net_operating_income, gross_revenue,
  street_number, street_name`

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

// h5: shared street-name normalizer. Used by BOTH:
//   (a) extractStreetName(address) for the comp side (parses unparsed_address)
//   (b) the SUBJECT side, where we already have a clean dedicated street_name
//       column and only need to strip whitespace + lowercase + unit suffixes.
// Without a shared normalizer, a clean dedicated column subject value will
// never equal the parsed-from-address comp value (e.g. "Main St" vs "main st"
// or "Westcroft Drive" vs "westcroft drive"). Both sides MUST converge here.
// STEP-0 hygiene: btrim is built in via .trim() — covers the 10 contaminated
// rows the hygiene scan found.
function normalizePlaceName(raw: string | null | undefined): string | null {
  if (!raw) return null
  // Strip unit suffixes ("Main", "BSMT", "Upper", "Lower", "Rear", "Apt", "Unit")
  // and any leading/trailing whitespace, then lowercase.
  const cleaned = raw.replace(/\s+(Main|BSMT|Upper|Lower|Rear|Apt|Unit)\s*$/i, '').trim().toLowerCase()
  return cleaned.length > 0 ? cleaned : null
}

function extractStreetName(address: string | null): string | null {
  if (!address) return null
  // Format: "22 Westcroft Drive, Toronto E10, ON M1E 3A3"
  const streetPart = address.split(',')[0]?.trim()
  if (!streetPart) return null
  // Remove the street number (first word if it's a number)
  const parts = streetPart.split(' ')
  if (parts.length < 2) return null
  // Remove leading number, then pass to the shared normalizer so subject side
  // (which uses normalizePlaceName directly on dedicated street_name) matches.
  return normalizePlaceName(parts.slice(1).join(' '))
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

// h5: per-comp street bonus computation. Used at all 4 scoreMatch call sites.
// Guards: if subject street data is absent (caller didn't plumb yet), both
// flags are false — preserves byte-identical behavior for un-plumbed callers.
// Comp-side name is parsed from unparsed_address via extractStreetName; both
// subject + comp names go through normalizePlaceName so a clean dedicated-
// column subject value can match a parsed-from-address comp value. Same with
// numbers: parse to int, null-guard the parity check.
function streetBonusFor(
  sale: any,
  subjName: string | null,
  subjNum: number | null,
): { sameStreet: boolean; sameOddEven: boolean } {
  if (!subjName || subjNum == null) return { sameStreet: false, sameOddEven: false }
  const saleStreet = extractStreetName(sale.unparsed_address)
  if (!saleStreet || saleStreet !== subjName) return { sameStreet: false, sameOddEven: false }
  const saleNum = extractStreetNumber(sale.unparsed_address)
  const sameOddEven = saleNum != null && isOdd(saleNum) === isOdd(subjNum)
  return { sameStreet: true, sameOddEven }
}

// ============ "AS IS" DETECTION ============

function isAsIs(remarks: string | null): boolean {
  if (!remarks) return false
  const lower = remarks.toLowerCase()
  return lower.includes('as is') || lower.includes('as-is') || lower.includes('sold as is')
}

// ============ PROPERTY TYPE MATCHING ============

// Module-level multi-unit subtype set. Referenced by getCompatibleSubtypes (for
// cascade .in() class-gating) AND by the (j) multi-unit CONTACT gate +
// findMultiUnitContactComparables helper. Single source of truth.
export const MULTI_UNIT_SUBTYPES = ['Duplex', 'Triplex', 'Fourplex', 'Multiplex']

function getCompatibleSubtypes(subtype: string): string[] {
  const detachedTypes = ['Detached']
  const semiTypes = ['Semi-Detached']
  const townTypes = ['Att/Row/Townhouse', 'Link']

  if (detachedTypes.includes(subtype)) return detachedTypes
  if (semiTypes.includes(subtype)) return semiTypes
  if (townTypes.includes(subtype)) return townTypes
  if (MULTI_UNIT_SUBTYPES.includes(subtype)) return MULTI_UNIT_SUBTYPES
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
    // h4: thumbnail attached by attachMediaUrls (same batched join used for
    // plex). Allows SF converged tile to render a photo. Null when MLS has
    // no thumbnail for this listing.
    mediaUrl: sale.mediaUrl ?? null,
  }
}

// ============ SHARED COMPARABILITY PREDICATES (h3 refinement) ============

// h3 refinement: shared predicates so the COMPETING-FOR-SALE rail uses the
// same comparability criteria as the SOLD pool, per type. Pure functions on
// already-fetched rows — no DB, no async. Pre-existing logic, just lifted to
// named helpers so findActiveCompetition (h3) and the sold pipeline call ONE
// implementation. Byte-identical behavior to inline call sites.

// Plex predicate: the SAME-subtype gate lives in the SELECT (.eq('property_
// subtype', subjectSubtype)), so this just enforces LAR same-or-adjacent.
// Used by runPlexPricingPath.tierQuery + findActiveCompetition (plex branch).
function plexComparablePredicate(row: any, subjectLAR: string): boolean {
  return isAdjacentRange(row.living_area_range, subjectLAR)
}

// SF "is this a clean comp" predicate: excludes "as is"/power-of-sale.
// Used by findHomeComparables's cleanSales filters + findActiveCompetition
// (SF branch). Thin inversion of isAsIs to clarify intent at call sites.
function notAsIs(row: any): boolean {
  return !isAsIs(row.public_remarks)
}

// F-MLS-SUBTYPE-TRAILING-SPACE-SEMI defensive normalization. MLS stores
// 'Semi-Detached ' with ONE trailing space on 100% of that subtype (67481
// rows, measured 2026-06-08); all 37 other subtypes clean. This returns the
// clean value + the single-trailing-space variant so .in()/.eq() match both.
// NOTE: keyed to the MEASURED single-trailing-space pattern — if MLS data
// later carries other whitespace (leading, double, tab) this silently misses
// again. The permanent fix is the deferred data-cleanup + sync-btrim
// workstream (F-MLS-DATA-CLEANUP-TRAILING-SPACE); this is the defensive code
// guard until then. ALWAYS use this helper instead of writing raw .eq()/.in()
// against property_subtype.
function propertySubtypeVariants(subtype: string): string[] {
  return subtype === subtype.trim()
    ? [subtype, subtype + ' ']
    : [subtype, subtype.trim()]
}

// ============ MULTI-UNIT CONTACT (g1) ============

// Plex-comp builder — populates only the fields the CONTACT-branch tile at
// HomeEstimatorResults reads (closePrice/bedrooms/bathrooms/livingAreaRange/
// parking/closeDate/unparsedAddress/listingKey/unitNumber). Intentionally
// OMITS single-family-derived signals: temperature (recency datum, but the
// 🔥/❄ badge presentation reads as match-quality), matchTier, matchQuality,
// matchScore, adjustments, adjustedPrice. Plex tiles are honest reference,
// not match-scored.
function createMultiUnitContactComparable(sale: any): ComparableSale {
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
    unitNumber: sale.unit_number || undefined,
    propertySubtype: sale.property_subtype,
    listingKey: sale.listing_key,
    unparsedAddress: sale.unparsed_address,
    // h2 Phase 2: income signals for plex tile enrichment. Sparse (7-15% on
    // Duplex/Triplex/Fourplex, 0% on Multiplex) — render layer silent-omits
    // per-tile when these are null/0.
    netOperatingIncome: sale.net_operating_income,
    grossRevenue: sale.gross_revenue,
    // h3: thumbnail URL — set by attachMediaUrls before this builder runs.
    // The competing-listings route uses the same media join pattern.
    mediaUrl: sale.mediaUrl ?? null,
  }
}

// h3: batch-fetch thumbnail media for plex sales rows so the Charlie-style
// tile can render a photo. Mirrors app/api/charlie/competing-listings/route.ts
// media join (same variant_type='thumbnail' + order_number=0). One query per
// rail (community OR muni OR area returns at most 10 rows). Returns the same
// shape, with a mediaUrl prop added to each sale. Empty input → no-op.
//
// h4: renamed from attachPlexMediaUrls to attachMediaUrls — same logic, now
// also used by the SF matcher returns so SF tiles get photos too (converged
// tile design).
async function attachMediaUrls(sales: any[]): Promise<any[]> {
  if (!sales || sales.length === 0) return sales
  const ids = sales.map(s => s.id).filter(Boolean)
  if (ids.length === 0) return sales
  const supabase = createClient()
  const { data: media } = await supabase
    .from('media')
    .select('listing_id, media_url')
    .in('listing_id', ids)
    .eq('variant_type', 'thumbnail')
    .eq('order_number', 0)
  const map: Record<string, string> = {}
  ;(media || []).forEach((m: any) => { map[m.listing_id] = m.media_url })
  return sales.map(s => ({ ...s, mediaUrl: map[s.id] || null }))
}

// Multi-unit CONTACT cascade. Class-contained via MULTI_UNIT_SUBTYPES at the
// DB layer (orange-to-orange guaranteed). Community → muni → STATE-C empty.
// Skips the single-family funnels (style/age/LAR are wrong axes for plex) and
// skips the isAsIs filter (1.7-3.3% prevalence on plex; investor-flip sales
// are legitimate plex comps). Returns CONTACT tier regardless of pool size;
// no pricing computed; no bestMatchScore field (per g-build-recon).
async function findMultiUnitContactComparables(specs: HomeSpecs): Promise<HomeMatchResult> {
  const supabase = createClient()
  const referenceDate = specs.asOfDate ?? new Date()
  const twoYearsAgo = new Date(referenceDate)
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)

  // Community tier
  if (specs.communityId) {
    let qC = supabase
      .from('mls_listings')
      .select(HOME_SELECT)
      .eq('community_id', specs.communityId)
      .in('property_subtype', MULTI_UNIT_SUBTYPES.flatMap(propertySubtypeVariants))
      .eq('transaction_type', 'For Sale')
      .eq('standard_status', 'Closed')
      .not('close_price', 'is', null)
      .gt('close_price', 100000)
      .gte('close_date', twoYearsAgo.toISOString())
      .order('close_date', { ascending: false })
      .limit(10)
    if (specs.asOfDate) qC = qC.lt('close_date', referenceDate.toISOString())
    const { data: cSales } = await qC
    if (cSales && cSales.length > 0) {
      const enriched = await attachMediaUrls(cSales)
      return {
        tier: 'CONTACT',
        comparables: enriched.map(createMultiUnitContactComparable),
        geoLevel: 'community',
      }
    }
  }

  // Muni tier fallback
  if (specs.municipalityId) {
    let qM = supabase
      .from('mls_listings')
      .select(HOME_SELECT)
      .eq('municipality_id', specs.municipalityId)
      .in('property_subtype', MULTI_UNIT_SUBTYPES.flatMap(propertySubtypeVariants))
      .eq('transaction_type', 'For Sale')
      .eq('standard_status', 'Closed')
      .not('close_price', 'is', null)
      .gt('close_price', 100000)
      .gte('close_date', twoYearsAgo.toISOString())
      .order('close_date', { ascending: false })
      .limit(10)
    if (specs.asOfDate) qM = qM.lt('close_date', referenceDate.toISOString())
    const { data: mSales } = await qM
    if (mSales && mSales.length > 0) {
      const enriched = await attachMediaUrls(mSales)
      return {
        tier: 'CONTACT',
        comparables: enriched.map(createMultiUnitContactComparable),
        geoLevel: 'municipality',
      }
    }
  }

  // STATE-C honest empty
  return { tier: 'CONTACT', comparables: [], geoLevel: 'none' }
}

// ============ PLEX PRICING (h1) ============

// h1 helper: build a priced HomeMatchResult from matched plex comps.
// MEDIAN of close_price (per v12 "median, not mean" — robust to outliers
// in the noisy plex pool). Top 10 most-recent comps surfaced as tiles via
// createMultiUnitContactComparable (g1 builder; omits SF-derived signals).
function buildPricedPlexResult(
  comps: any[],
  geoLevel: 'community' | 'municipality' | 'area'
): HomeMatchResult {
  const prices = comps.map(s => parseFloat(s.close_price)).sort((a, b) => a - b)
  const mid = Math.floor(prices.length / 2)
  const median = prices.length % 2 === 0
    ? (prices[mid - 1] + prices[mid]) / 2
    : prices[mid]
  return {
    tier: 'RANGE',  // h2 will refine to plex-specific tier labels
    comparables: comps.slice(0, 10).map(createMultiUnitContactComparable),
    geoLevel,
    estimatedPrice: Math.round(median),
  }
}

// h1: plex-axis pricing path — MIRRORS scripts/backtest-plex-axis.js EXACTLY.
// Same-subtype + LAR-adjacent + community→muni→area cascade + median-of-
// matched-comp close_price. The backtest measured Duplex 17.4% median,
// Triplex 22.1% median on this logic; production must match.
//
// Thin pool (<3 comps in any tier) → falls back to enrich-only CONTACT via
// findMultiUnitContactComparables (no bad-price leak).
//
// NO single-family axes: no style/age/LAR-via-style funnels, no frontage
// adjustment, no bedrooms_total gate (bedrooms_total sums across plex units).
async function runPlexPricingPath(specs: HomeSpecs): Promise<HomeMatchResult> {
  const supabase = createClient()
  const referenceDate = specs.asOfDate ?? new Date()
  const twoYearsAgo = new Date(referenceDate)
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
  const subjectLAR = specs.livingAreaRange

  // The plex axis REQUIRES LAR for adjacency match. No LAR → cannot price
  // on this axis → fall back to enrich-only.
  if (!subjectLAR) {
    return await findMultiUnitContactComparables(specs)
  }

  // Cascade query for one geo tier, filtered post-query to LAR same-or-adjacent.
  const tierQuery = async (
    geoColumn: 'community_id' | 'municipality_id',
    geoValue: string
  ) => {
    let q = supabase
      .from('mls_listings')
      .select(HOME_SELECT)
      .eq(geoColumn, geoValue)
      .in('property_subtype', propertySubtypeVariants(specs.propertySubtype))  // SAME-subtype (NOT class-wide)
      .eq('transaction_type', 'For Sale')
      .eq('standard_status', 'Closed')
      .not('close_price', 'is', null)
      .gt('close_price', 100000)
      .gte('close_date', twoYearsAgo.toISOString())
      .not('living_area_range', 'is', null)
      .order('close_date', { ascending: false })
    if (specs.asOfDate) q = q.lt('close_date', referenceDate.toISOString())
    const { data } = await q
    return (data || []).filter(s => plexComparablePredicate(s, subjectLAR))
  }

  // Community tier
  if (specs.communityId) {
    const cComps = await tierQuery('community_id', specs.communityId)
    if (cComps.length >= 3) {
      const enriched = await attachMediaUrls(cComps)
      return buildPricedPlexResult(enriched, 'community')
    }
  }

  // Muni tier fallback
  if (specs.municipalityId) {
    const mComps = await tierQuery('municipality_id', specs.municipalityId)
    if (mComps.length >= 3) {
      const enriched = await attachMediaUrls(mComps)
      return buildPricedPlexResult(enriched, 'municipality')
    }
  }

  // Area tier fallback (cascade from muni→area requires the muni's area_id)
  if (specs.municipalityId) {
    const { data: muni } = await supabase
      .from('municipalities')
      .select('area_id')
      .eq('id', specs.municipalityId)
      .single()
    if (muni?.area_id) {
      let q = supabase
        .from('mls_listings')
        .select(`${HOME_SELECT}, municipalities!inner(area_id)`)
        .eq('municipalities.area_id', muni.area_id)
        .in('property_subtype', propertySubtypeVariants(specs.propertySubtype))
        .eq('transaction_type', 'For Sale')
        .eq('standard_status', 'Closed')
        .not('close_price', 'is', null)
        .gt('close_price', 100000)
        .gte('close_date', twoYearsAgo.toISOString())
        .not('living_area_range', 'is', null)
        .order('close_date', { ascending: false })
      if (specs.asOfDate) q = q.lt('close_date', referenceDate.toISOString())
      const { data } = await q
      const aComps = (data || []).filter(s => plexComparablePredicate(s, subjectLAR))
      if (aComps.length >= 3) {
        const enriched = await attachMediaUrls(aComps)
        return buildPricedPlexResult(enriched, 'area')
      }
    }
  }

  // Thin pool — enrich-only fallback (no bad price)
  return await findMultiUnitContactComparables(specs)
}

// ============ COMPETING-FOR-SALE (h3 refinement) ============

// Active-rows SELECT — supports both plex predicates (LAR-adjacent) and SF
// funnels (architectural_style + approximate_age + public_remarks for notAsIs).
// Includes income fields for the plex tile's elevated income panel.
const COMPETING_SELECT = `id, listing_key, list_price, unparsed_address,
  bedrooms_total, bathrooms_total_integer, living_area_range,
  days_on_market, approximate_age, property_subtype, frontage_length,
  lot_size_area, net_operating_income, gross_revenue, architectural_style,
  public_remarks`

// h3 refinement: competing-for-sale rail uses the SAME comparability criteria
// as the sold-comp pool, for the subject's type. Plex → same-subtype + LAR-
// adjacent + community→muni→area cascade (mirrors runPlexPricingPath). SF →
// getCompatibleSubtypes + notAsIs + applyFunnel→applyRelaxedFunnel→
// last-resort-bed-bath + community→muni cascade (mirrors findHomeComparables).
// Threshold: ≥1 to show (sold path needs ≥3 to PRICE; competing just needs
// 1 to SHOW). Order: list_price asc (cheapest competition first).
//
// Both rails consume identical predicate logic — the shared helpers
// plexComparablePredicate, notAsIs, applyFunnel, applyRelaxedFunnel,
// getCompatibleSubtypes — so a future change to "what counts as comparable"
// propagates to both rails automatically.
async function findActiveCompetitionPlex(specs: HomeSpecs, supabase: any): Promise<any[]> {
  const subjectLAR = specs.livingAreaRange
  if (!subjectLAR) return []  // plex axis requires LAR; without it, no competition pool

  const tierQuery = async (geoCol: 'community_id' | 'municipality_id', geoVal: string) => {
    const { data } = await supabase
      .from('mls_listings')
      .select(COMPETING_SELECT)
      .eq(geoCol, geoVal)
      .in('property_subtype', propertySubtypeVariants(specs.propertySubtype))  // same-subtype (NOT class-wide)
      .eq('transaction_type', 'For Sale')
      .in('standard_status', ['Active', 'Active Under Contract', 'Pending'])
      .eq('available_in_vow', true)
      .gt('list_price', 100000)
      .not('living_area_range', 'is', null)
      .order('list_price', { ascending: true })
      .limit(10)
    return (data || []).filter((s: any) => plexComparablePredicate(s, subjectLAR))
  }

  if (specs.communityId) {
    const c = await tierQuery('community_id', specs.communityId)
    if (c.length > 0) return c
  }
  if (specs.municipalityId) {
    const m = await tierQuery('municipality_id', specs.municipalityId)
    if (m.length > 0) return m
  }
  // Area tier fallback (same as runPlexPricingPath area cascade)
  if (specs.municipalityId) {
    const { data: muni } = await supabase.from('municipalities').select('area_id').eq('id', specs.municipalityId).single()
    if (muni?.area_id) {
      const { data } = await supabase
        .from('mls_listings')
        .select(`${COMPETING_SELECT}, municipalities!inner(area_id)`)
        .eq('municipalities.area_id', muni.area_id)
        .in('property_subtype', propertySubtypeVariants(specs.propertySubtype))
        .eq('transaction_type', 'For Sale')
        .in('standard_status', ['Active', 'Active Under Contract', 'Pending'])
        .eq('available_in_vow', true)
        .gt('list_price', 100000)
        .not('living_area_range', 'is', null)
        .order('list_price', { ascending: true })
        .limit(10)
      const a = (data || []).filter((s: any) => plexComparablePredicate(s, subjectLAR))
      if (a.length > 0) return a
    }
  }
  return []
}

async function findActiveCompetitionSF(specs: HomeSpecs, supabase: any): Promise<any[]> {
  const subtypes = getCompatibleSubtypes(specs.propertySubtype)

  const runFunnels = (clean: any[]): any[] => {
    const strict = applyFunnel(clean, specs)
    if (strict.length > 0) return strict.slice(0, 10)
    const relaxed = applyRelaxedFunnel(clean, specs)
    if (relaxed.length > 0) return relaxed.slice(0, 10)
    // Last resort: bed+bath only with style-family + LAR-adjacent product gate
    // (mirrors findHomeComparables muni-tier fallback).
    const bedBath = clean.filter(s => {
      if (s.bedrooms_total !== specs.bedrooms) return false
      if (Math.abs((s.bathrooms_total_integer || 0) - specs.bathrooms) > 1) return false
      const saleStyle = s.architectural_style?.[0] || null
      if (specs.architecturalStyle && saleStyle &&
          saleStyle !== specs.architecturalStyle &&
          !isSameStyleFamily(saleStyle, specs.architecturalStyle || null)) return false
      if (specs.livingAreaRange && s.living_area_range !== specs.livingAreaRange &&
          !isAdjacentRange(s.living_area_range, specs.livingAreaRange)) return false
      return true
    })
    return bedBath.slice(0, 10)
  }

  if (specs.communityId) {
    const { data: comm } = await supabase
      .from('mls_listings')
      .select(COMPETING_SELECT)
      .eq('community_id', specs.communityId)
      .in('property_subtype', subtypes.flatMap(propertySubtypeVariants))
      .eq('transaction_type', 'For Sale')
      .in('standard_status', ['Active', 'Active Under Contract', 'Pending'])
      .eq('available_in_vow', true)
      .gt('list_price', 100000)
      .order('list_price', { ascending: true })
      .limit(300)
    if (comm && comm.length > 0) {
      const pool = runFunnels(comm.filter(notAsIs))
      if (pool.length > 0) return pool
    }
  }
  if (specs.municipalityId) {
    const { data: muni } = await supabase
      .from('mls_listings')
      .select(COMPETING_SELECT)
      .eq('municipality_id', specs.municipalityId)
      .in('property_subtype', subtypes.flatMap(propertySubtypeVariants))
      .eq('transaction_type', 'For Sale')
      .in('standard_status', ['Active', 'Active Under Contract', 'Pending'])
      .eq('available_in_vow', true)
      .gt('list_price', 100000)
      .order('list_price', { ascending: true })
      .limit(500)
    if (muni && muni.length > 0) {
      const pool = runFunnels(muni.filter(notAsIs))
      if (pool.length > 0) return pool
    }
  }
  return []
}

// Public entry. Branches per type and attaches media thumbnails (same shape
// as competing-listings/route.ts previously did). The /api/charlie/competing-
// listings home path delegates to this function for all types.
export async function findActiveCompetition(specs: HomeSpecs): Promise<any[]> {
  const supabase = createClient()
  const isPlex = MULTI_UNIT_SUBTYPES.includes(specs.propertySubtype)
  const results = isPlex
    ? await findActiveCompetitionPlex(specs, supabase)
    : await findActiveCompetitionSF(specs, supabase)
  if (results.length === 0) return []

  // Media thumbnail join (mirrors the existing pattern; same SELECT + join).
  const ids = results.map(r => r.id).filter(Boolean)
  if (ids.length === 0) return results.map(r => ({ ...r, mediaUrl: null }))
  const { data: media } = await supabase
    .from('media')
    .select('listing_id, media_url')
    .in('listing_id', ids)
    .eq('variant_type', 'thumbnail')
    .eq('order_number', 0)
  const mediaMap: Record<string, string> = {}
  ;(media || []).forEach((m: any) => { mediaMap[m.listing_id] = m.media_url })
  return results.map(r => ({ ...r, mediaUrl: mediaMap[r.id] || null }))
}

// ============ MAIN FUNCTION ============

export async function findHomeComparables(specs: HomeSpecs): Promise<HomeMatchResult> {
  // h1: subtype-aware plex routing (supersedes prior unconditional-CONTACT (j)
  // gate). The 33.4% wrong-axis MAPE was measured on SF axes (style/age/LAR-
  // via-style/frontage); the plex-axis backtest (2026-06-08) measured:
  //   Duplex   median APE 17.4%  → PRICE (in operator's ≤20% band)
  //   Triplex  median APE 22.1%  → PRICE WITH STRONG DISCLAIMER (20-30% band)
  //   Fourplex median APE 35.0%  → ENRICH-ONLY (>30% band + 47% CONTACT)
  //   Multiplex median APE 21.1% → ENRICH-ONLY (subtype-label-vs-unit-count fuzzy)
  // Disclaimer copy is client-side concern (h4); helper just routes.
  if (specs.propertySubtype === 'Duplex' || specs.propertySubtype === 'Triplex') {
    return await runPlexPricingPath(specs)
  }
  if (specs.propertySubtype === 'Fourplex' || specs.propertySubtype === 'Multiplex') {
    return await findMultiUnitContactComparables(specs)
  }

  const supabase = createClient()
  const referenceDate = specs.asOfDate ?? new Date()
  const twoYearsAgo = new Date(referenceDate)
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)

  const subtypes = getCompatibleSubtypes(specs.propertySubtype)

  // h5: subject-side street normalization. Computed ONCE per matcher call, not
  // per comp. Subject's dedicated street_name goes through the SAME normalizer
  // (normalizePlaceName) that extractStreetName applies after parsing the
  // comp's unparsed_address — so a clean DB value can equal a parsed value.
  // When subjectStreetName/Number are undefined (un-plumbed caller), both
  // remain null and streetBonusFor returns sameStreet=false → no behavior
  // change vs pre-activation.
  const subjName = normalizePlaceName(specs.subjectStreetName ?? null)
  const subjNum = (specs.subjectStreetNumber != null && Number.isInteger(specs.subjectStreetNumber))
    ? specs.subjectStreetNumber
    : null

  // ===== TIER 1: SAME STREET (within community) =====
  if (specs.communityId) {
    let qCommunity = supabase
      .from('mls_listings')
      .select(HOME_SELECT)
      .eq('community_id', specs.communityId)
      .in('property_subtype', subtypes.flatMap(propertySubtypeVariants))
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
      const cleanSales = communitySales.filter(notAsIs)

      // Apply funnel: style + age + size
      const funneled = applyFunnel(cleanSales, specs)

      if (funneled.length >= 3) {
        // Score all and sort. h5: street bonus now active — subject side
        // computed once at top of findHomeComparables, comp side parsed per
        // sale via streetBonusFor. Un-plumbed callers: subjName=null →
        // sameStreet=false → byte-identical to pre-h5.
        const scored = funneled.map(s => {
          const { sameStreet, sameOddEven } = streetBonusFor(s, subjName, subjNum)
          return {
            sale: s,
            score: scoreMatch(s, specs, sameStreet, sameOddEven),
          }
        }).sort((a, b) => b.score - a.score)

        const bestScore = scored[0].score
        const tier = tierFromScore(bestScore, scored.length)
        const top = scored.slice(0, 10)
        const withMedia = await attachMediaUrls(top.map(s => s.sale))
        const comps = withMedia.map((sale, i) => createHomeComparable(sale, specs, top[i].score))

        return { tier, comparables: comps, geoLevel: 'community', bestMatchScore: bestScore }
      }

      // If funnel is too strict, try relaxed (style family + adjacent age)
      const relaxed = applyRelaxedFunnel(cleanSales, specs)
      if (relaxed.length >= 3) {
        const scored = relaxed.map(s => ({
          sale: s,
          score: (() => {
            const { sameStreet, sameOddEven } = streetBonusFor(s, subjName, subjNum)
            return scoreMatch(s, specs, sameStreet, sameOddEven)
          })(),
        })).sort((a, b) => b.score - a.score)

        const bestScore = scored[0].score
        const tier = tierFromScore(bestScore, scored.length)
        const top = scored.slice(0, 10)
        const withMedia = await attachMediaUrls(top.map(s => s.sale))
        const comps = withMedia.map((sale, i) => createHomeComparable(sale, specs, top[i].score))

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
      .in('property_subtype', subtypes.flatMap(propertySubtypeVariants))
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
      const cleanSales = muniSales.filter(notAsIs)

      // Try strict funnel first
      let pool = applyFunnel(cleanSales, specs)
      if (pool.length < 3) {
        pool = applyRelaxedFunnel(cleanSales, specs)
      }

      if (pool.length >= 2) {
        const scored = pool.map(s => ({
          sale: s,
          score: (() => {
            const { sameStreet, sameOddEven } = streetBonusFor(s, subjName, subjNum)
            return scoreMatch(s, specs, sameStreet, sameOddEven)
          })(),
        })).sort((a, b) => b.score - a.score)

        const bestScore = scored[0].score
        const tier = tierFromScore(bestScore, scored.length)
        const top = scored.slice(0, 10)
        const withMedia = await attachMediaUrls(top.map(s => s.sale))
        const comps = withMedia.map((sale, i) => createHomeComparable(sale, specs, top[i].score))

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
          score: (() => {
            const { sameStreet, sameOddEven } = streetBonusFor(s, subjName, subjNum)
            return scoreMatch(s, specs, sameStreet, sameOddEven)
          })(),
        })).sort((a, b) => b.score - a.score)

        const bestScore = scored[0].score
        const top = scored.slice(0, 10)
        const withMedia = await attachMediaUrls(top.map(s => s.sale))
        const comps = withMedia.map((sale, i) => createHomeComparable(sale, specs, top[i].score))

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
