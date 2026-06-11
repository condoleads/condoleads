// lib/estimator/home-comparable-matcher-sales.ts
import { createClient } from '@/lib/supabase/client'
import {
  ComparableSale,
  PriceAdjustment,
  MatchTier,
  TierResult,
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
  normalizeFrontageFeet,
} from './home-adjustment-math'
import {
  resolveHomeAdjustments,
  type ResolvedHomeAdjustments,
} from './resolve-home-adjustments'

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
  // h6 (frontage-as-gate): when present, the matcher normalizes Metres→Feet.
  // 'Feet'/'Acres'/null all treated as feet. When absent (un-plumbed caller),
  // defaults to feet — same as null (the 90.8% dominant regime).
  lotSizeUnits?: string | null
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

  // v10 step 3 Phase 1 (2026-06-09): tenant id for per-tenant adjustment
  // override resolution. The server action sets this via getCurrentTenantId().
  // When null/undefined (anonymous, System 1, or un-plumbed caller like the
  // backtest harness) the resolver falls through to DEFAULT_ADJUSTMENTS,
  // preserving f7f3c6e behavior byte-for-byte (the no-op guarantee).
  tenantId?: string | null

  // h8 tax-similarity score band (2026-06-09, SALE-only): subject's MLS
  // tax_annual_amount + tax_year. The matcher awards up to 15 score points
  // when comp's tax sits within the subject's tax band (% diff), gated on
  // SAME municipality (mill-rate constancy) AND tax_year within ±1.
  // Silent-omit when missing — never penalize. Un-plumbed callers (null/
  // undefined) get neutral 0 contribution → score path stays byte-identical
  // for callers that don't thread this.
  subjectTaxAnnualAmount?: number | null
  subjectTaxYear?: number | null

  // h9 lease segmentation (2026-06-10, LEASE-only): subject's MLS lease type
  // signals. The lease matcher gates the comp pool on these 3 fields. When
  // any is null/undefined, the corresponding gate silent-omits (no filter).
  // Sale matcher does NOT read these fields — interface addition only.
  subjectFurnished?: string | null              // 'Unfurnished' | 'Furnished' | 'Partially'
  subjectLeaseTerm?: string | null              // '12 Months' | 'Short Term Lease' | …
  subjectPortionPropertyLease?: string[] | null // jsonb array — 'Entire Property' | 'Basement' | 'Main' | …
  subjectRentIncludes?: string[] | null         // jsonb array — for the rent_includes score nudge
  // (subject's basement jsonb already lives in basementRaw above — reused for
  // the basement-pool confidence supplement on the lease side.)
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
  // h7 (2026-06-09) Platinum/Gold/Silver/Bronze geo-tier spread. SF path only;
  // plex returns leave these undefined. Best tier mirrors the top-level
  // tier/comparables/bestMatchScore; the others are display-only context.
  tiers?: {
    platinum: TierResult | null   // same-street subset of community pool
    gold:     TierResult | null   // community pool
    silver:   TierResult | null   // municipality pool
    bronze:   TierResult | null   // area pool (new for SF; mirrors plex area cascade)
  }
  bestGeoTier?: 'platinum' | 'gold' | 'silver' | 'bronze' | 'none'

  // W-TAX-MATCH HOME (2026-06-11): mirror of condo's taxMatch payload
  // (CondoSaleMatchResult.taxMatch). Tax-as-match-criterion result set,
  // additive. `comparables` is the MULTI-TIER display list (sourceTier-
  // stamped, dedup tightest-tier, capped at TAX_MATCH_DISPLAY_CAP).
  // `winnerComparables` is the winning-tier-only list for the action's
  // calculateEstimate (preserves the N=200 home backtest's 6.9% median APE).
  // Bronze omitted (h8 muni-gated; silver is full muni reach). Plex paths
  // (Duplex/Triplex/Fourplex/Multiplex) leave it undefined.
  taxMatch?: {
    matchTier:         MatchTier
    comparables:       ComparableSale[]
    winnerComparables: ComparableSale[]
    count:             number
    tiers?: {
      platinum: TierResult | null
      gold:     TierResult | null
      silver:   TierResult | null
      bronze:   TierResult | null
    }
    bestGeoTier?: 'platinum' | 'gold' | 'silver' | 'bronze' | 'none'
  }
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
  days_on_market, close_date, tax_annual_amount, tax_year, square_foot_source,
  association_fee, unparsed_address, property_subtype, architectural_style,
  approximate_age, lot_width, lot_depth, lot_size_area, lot_size_units, basement,
  garage_type, pool_features, public_remarks,
  net_operating_income, gross_revenue,
  street_number, street_name, municipality_id`

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

// ============ h8 TAX-SIMILARITY SCORE BAND (SALE-only, 2026-06-09) ============
//
// Per-comp tax similarity gates the band on TWO conditions before scoring:
//   (1) SAME municipality_id (subject + comp) — tax-to-tax comparison is only
//       valid where mill rate is constant. Cross-muni comp → neutral 0.
//   (2) tax_year within ±1 year of the subject's tax_year — Whitby/Oshawa data
//       confirms 2025/2026 dominate (98.7% of 90d closed); ±1 catches the
//       legitimate cohort, rejects stale assessments.
// Plus silent-omits on missing subject tax, missing comp tax, or tax ≤ 500
// (placeholder data — Whitby Detached 0.09% of populated rows are < $500).
// Never penalize: zero contribution → no rank change for the missing-data subjects.
//
// Band width is parameterized via TAX_BAND_PCT env var (default 0.20 = 20%).
// The backtest sweeps 0.15/0.20/0.25/0.30 to pick the width that most improves
// median APE on the SF sale backtest.
//
// Points: 15 max at exact match, linearly sliding to 0 at the band edge.
// Sliding (not stepped) so the signal differentiates comps inside the band.

const TAX_BAND_PCT = (() => {
  // Env override for backtest sweeps. TAX_BAND_PCT=0 disables the band
  // entirely (taxSimilarityScore returns 0 — required for the sweep's
  // no-band baseline). Production runs leave the env unset → default 0.20.
  const raw = process.env.TAX_BAND_PCT
  if (raw === undefined) return 0.20
  const v = parseFloat(raw)
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0.20
})()
const TAX_BAND_MAX_POINTS = 15
const TAX_MIN_VALUE = 500  // filter $1-placeholder + obvious dirty rows

function taxSimilarityScore(sale: any, specs: HomeSpecs): number {
  const subjectTax = specs.subjectTaxAnnualAmount
  const subjectYear = specs.subjectTaxYear
  if (subjectTax == null || subjectTax <= TAX_MIN_VALUE) return 0
  if (subjectYear == null) return 0

  // Gate 1: same municipality (mill-rate constancy)
  const subjectMuni = specs.municipalityId
  const compMuni = sale.municipality_id
  if (!subjectMuni || !compMuni || subjectMuni !== compMuni) return 0

  // Gate 2: comp tax + year present + clean + within ±1 year
  const compTax = parseFloat(sale.tax_annual_amount)
  if (!Number.isFinite(compTax) || compTax <= TAX_MIN_VALUE) return 0
  const compYear = sale.tax_year
  if (compYear == null || Math.abs(compYear - subjectYear) > 1) return 0

  // Sliding band: 1.0 at exact match, 0 at band edge.
  const fracDiff = Math.abs(compTax - subjectTax) / subjectTax
  if (fracDiff >= TAX_BAND_PCT) return 0
  const closeness = 1 - (fracDiff / TAX_BAND_PCT)
  return TAX_BAND_MAX_POINTS * closeness
}

// ============ MATCH SCORING (200 POINT SYSTEM + h8 tax band → 215 max) ============

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

  // h8 tax similarity: up to 15 pts sliding, SAME-muni gated, ±1 year gated,
  // silent-omit on missing/dirty. Never penalizes — un-plumbed callers
  // (subject tax/year null) return 0 → score path byte-identical for those.
  score += taxSimilarityScore(sale, specs)

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

// v10 step 3 Phase 1 (2026-06-09): createHomeComparable now accepts an
// optional `customValues` (per-tenant + per-geo resolved overrides). Every
// DEFAULT_ADJUSTMENTS read is replaced with `customValues?.X ?? DEFAULT.X`
// — the `??` pattern means a null/undefined override falls through to the
// hardcoded default. Empty home_adjustments table => customValues=undefined
// => byte-identical to f7f3c6e (the no-op guarantee).
//
// Phase 1 scope: only the inline-read constants in this function are
// overridable (LOT_FRONTAGE_*, LOT_DEPTH_*, POOL_INGROUND, BATHROOM_FULL).
// Basement + garage adjustments flow through helpers in home-adjustment-
// math.js whose internal DEFAULT_ADJUSTMENTS reads are NOT yet threaded;
// extending those helpers is a Phase 1.1 follow-up (table already carries
// the columns so the data model is forward-compatible).
function createHomeComparable(
  sale: any,
  specs: HomeSpecs,
  matchScore: number,
  customValues?: ResolvedHomeAdjustments,
): ComparableSale {
  const adjustments: PriceAdjustment[] = []
  let adjustedPrice = sale.close_price

  // 1. Lot Frontage adjustment — h6 (frontage-as-gate, 2026-06-09):
  // Previously a flat $40k/ft additive (LOT_FRONTAGE_PER_FOOT) that produced
  // catastrophic mispredictions on large diffs. Now proportional ±20% of
  // comp close_price, capped — bounded by construction.
  // Both sides go through normalizeFrontageFeet so Metres rows convert
  // (×3.28084) and guard cases (negative / >1000 / non-finite) become null
  // (no adjustment — honest skip, not fabricated dollar amount).
  const subjFt = normalizeFrontageFeet(specs.lotWidth, specs.lotSizeUnits)
  const compFt = normalizeFrontageFeet(sale.lot_width, sale.lot_size_units)
  if (subjFt != null && compFt != null) {
    const diffFt = subjFt - compFt
    if (Math.abs(diffFt) >= 1) {
      const pct = Math.min(
        Math.abs(diffFt) * (customValues?.LOT_FRONTAGE_PER_FOOT_PCT ?? DEFAULT_ADJUSTMENTS.LOT_FRONTAGE_PER_FOOT_PCT),
        (customValues?.LOT_FRONTAGE_MAX_PCT ?? DEFAULT_ADJUSTMENTS.LOT_FRONTAGE_MAX_PCT),
      )
      const sign = diffFt > 0 ? 1 : -1
      const amount = Math.round(sign * pct * sale.close_price)
      adjustedPrice += amount
      const pctLabel = (pct * 100).toFixed(1)
      adjustments.push({
        type: 'lot_frontage' as any,
        difference: parseFloat(diffFt.toFixed(1)),
        adjustmentAmount: amount,
        reason: diffFt > 0
          ? `Your lot is ${Math.abs(diffFt).toFixed(1)}ft wider (+${pctLabel}% of comp price = +$${Math.abs(amount).toLocaleString()})`
          : `Comparable lot is ${Math.abs(diffFt).toFixed(1)}ft wider (-${pctLabel}% of comp price = -$${Math.abs(amount).toLocaleString()})`,
      })
    }
  }

  // 2. Lot Depth adjustment
  const saleDepth = parseFloat(sale.lot_depth) || null
  const specDepth = specs.lotDepth || null
  if (saleDepth && specDepth) {
    const diff = specDepth - saleDepth
    if (Math.abs(diff) > 10) {
      const perTen = customValues?.LOT_DEPTH_PER_10FT ?? DEFAULT_ADJUSTMENTS.LOT_DEPTH_PER_10FT
      const cap = customValues?.LOT_DEPTH_MAX ?? DEFAULT_ADJUSTMENTS.LOT_DEPTH_MAX
      let amount = Math.round((diff / 10) * perTen)
      amount = Math.max(-cap, Math.min(cap, amount))
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

  // 3. Basement adjustment — Phase 1.1: customValues threaded so per-tenant
  // BASEMENT_FINISHED / BASEMENT_SEP_ENTRANCE / BASEMENT_WALKOUT_BONUS take
  // effect. Score-only paths (scoreMatch) keep DEFAULT — only price-path
  // adjustment uses overrides.
  const basementAdj = getBasementAdjustment(
    specs.basementRaw || (specs.basement ? [specs.basement] : null),
    sale.basement,
    customValues,
  )
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

  // 4. Garage adjustment — Phase 1.1: per-tenant GARAGE_DETACHED_SINGLE /
  // GARAGE_ATTACHED_SINGLE / GARAGE_BUILTIN take effect on the price path.
  // scoreMatch's getGarageValue calls (line ~314) stay customValues-less to
  // preserve score-only semantics.
  const subjectGarageVal = getGarageValue(specs.garageType || null, customValues)
  const compGarageVal = getGarageValue(sale.garage_type, customValues)
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
    const poolAmt = customValues?.POOL_INGROUND ?? DEFAULT_ADJUSTMENTS.POOL_INGROUND
    const poolAdj = subjectHasInground ? poolAmt : -poolAmt
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
    const bathAdj = bathDiff * (customValues?.BATHROOM_FULL ?? DEFAULT_ADJUSTMENTS.BATHROOM_FULL)
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

// ============ h7 — 4-TIER (PLATINUM/GOLD/SILVER/BRONZE) HELPERS ============
//
// Per tracker section 3 lock (2026-06-07):
//   - Compute all four geo tiers every time.
//   - Display all four as the confidence spread (display layer).
//   - Price from the BEST tier only — NEVER blend.
//   - Class containment: every tier .in() uses the same SF subtype family
//     (getCompatibleSubtypes + propertySubtypeVariants) — no cross-class leak.
//
// Platinum is a DERIVED SUBSET of Gold's already-funneled community pool — no
// extra DB query. Bronze is a new query that lifts the plex area-cascade
// pattern (runPlexPricingPath:752-779) with SF subtypes.

// Median + min/max range of close_price over a pool. Pure. Used for the
// display spread on each tier (not for the priced best-tier number — that
// still flows through calculateEstimate's weighted-mean with adjustments).
function medianRangeOf(prices: number[]): { median: number; range: { low: number; high: number } } {
  if (prices.length === 0) return { median: 0, range: { low: 0, high: 0 } }
  const sorted = [...prices].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
  return {
    median: Math.round(median),
    range: { low: Math.round(sorted[0]), high: Math.round(sorted[sorted.length - 1]) },
  }
}

// Score a funneled pool, take top 10, attach media, run createHomeComparable.
// Each TierResult carries the same shape regardless of whether this tier is
// the best — keeps the parity probe + display layer uniform.
//
// PARITY RULE: when the funneledPool here matches what today's matcher would
// have built (community-strict, community-relaxed, muni-strict, muni-relaxed,
// muni-bedBath) the resulting `comparables` array is byte-identical to today
// — same scoring, same top-10, same enrichment, same media join.
// W-TAX-MATCH HOME (2026-06-11): tax-band membership predicate. Reuses the
// existing h8 taxSimilarityScore as a SELECTOR (same-muni, +/-1 tax_year,
// +/-20% band, $500 floor — all gates inside the scorer). Returns true iff
// the comp falls inside the band; false otherwise (including when subject
// tax/year/muni is missing — the scorer short-circuits to 0). Mirror of
// condo-comparable-matcher-sales.ts withinTaxBand.
function withinTaxBand(sale: any, specs: HomeSpecs): boolean {
  return taxSimilarityScore(sale, specs) > 0
}

// W-TAX-MATCH HOME (2026-06-11): tax-mode geo cascade for SF homes (sale
// only). Mirror of runTaxMatchCascade in the condo matcher. Queries the
// same per-geo pools (street/community/muni), filters EACH by withinTaxBand
// BEFORE the existing applyFunnel + buildSFTierResult, builds:
//   - winnerComparables (winning-tier-only, for action's calculateEstimate)
//   - comparables (multi-tier display list: platinum -> gold -> silver
//     concatenated, sourceTier-stamped, deduped by listingKey keeping
//     tightest tier, capped at TAX_MATCH_DISPLAY_CAP)
//
// Same priority + thresholds as the geo cascade (Platinum >= 1 for tax-mode
// — backtest justified — and Gold/Silver >= 3). Bronze omitted (h8 is
// muni-gated; silver IS the full muni reach in tax-mode).
//
// PLATINUM same-street: uses the EXISTING streetBonusFor(sale, subjName,
// subjNum) predicate (line 242), which already handles normalization on
// BOTH sides via normalizePlaceName + extractStreetName (subject side
// pre-normalized by the caller). So "Adelaide Street West" vs "Adelaide St
// W" parsed from comp's unparsed_address both pass through the same
// normalizer; same-street matching is suffix-variance-robust by construction.
const TAX_MATCH_DISPLAY_CAP = 12
async function runHomeTaxMatchCascade(
  supabase: any,
  specs: HomeSpecs,
  referenceDate: Date,
  twoYearsAgo: Date,
  subjName: string | null,
  subjNum: number | null,
  customValues: ResolvedHomeAdjustments,
): Promise<HomeMatchResult['taxMatch']> {
  // Short-circuit when the h8 gate would never fire.
  const subjTax = specs.subjectTaxAnnualAmount
  if (!subjTax || subjTax <= 500) return undefined
  if (specs.subjectTaxYear == null) return undefined
  if (!specs.municipalityId) return undefined

  const subtypes = getCompatibleSubtypes(specs.propertySubtype)

  // Query community pool (used for Gold tax-mode).
  let commSales: any[] = []
  if (specs.communityId) {
    let q = supabase
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
    if (specs.asOfDate) q = q.lt('close_date', referenceDate.toISOString())
    const { data } = await q
    commSales = data || []
  }

  // Query muni pool (used for BOTH Silver tax-mode AND Platinum same-street
  // filter). Single query, two tiers — DRY.
  let muniSales: any[] = []
  {
    let q = supabase
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
    if (specs.asOfDate) q = q.lt('close_date', referenceDate.toISOString())
    const { data } = await q
    muniSales = data || []
  }

  // PLATINUM — same-street + tax-band. Same-street uses streetBonusFor
  // (normalized both sides; suffix-variance-robust). Threshold >= 1 for tax-
  // mode Platinum (backtest justified at 31.5% coverage).
  let platinumTier: TierResult | null = null
  if (subjName && subjNum != null && muniSales.length > 0) {
    const samestreetBanded = muniSales.filter(s =>
      streetBonusFor(s, subjName, subjNum).sameStreet && withinTaxBand(s, specs),
    )
    if (samestreetBanded.length > 0) {
      const clean = samestreetBanded.filter(notAsIs)
      let pool = applyFunnel(clean, specs)
      if (pool.length < 1) pool = applyRelaxedFunnel(clean, specs)
      if (pool.length >= 1) {
        platinumTier = await buildSFTierResult(pool, specs, subjName, subjNum, customValues)
      }
    }
  }

  // GOLD — community + tax-band.
  let goldTier: TierResult | null = null
  if (commSales.length > 0) {
    const banded = commSales.filter(s => withinTaxBand(s, specs))
    if (banded.length > 0) {
      const clean = banded.filter(notAsIs)
      let pool = applyFunnel(clean, specs)
      if (pool.length < 3) pool = applyRelaxedFunnel(clean, specs)
      if (pool.length >= 3) {
        goldTier = await buildSFTierResult(pool, specs, subjName, subjNum, customValues)
      }
    }
  }

  // SILVER — muni + tax-band (reuses muniSales).
  let silverTier: TierResult | null = null
  if (muniSales.length > 0) {
    const banded = muniSales.filter(s => withinTaxBand(s, specs))
    if (banded.length > 0) {
      const clean = banded.filter(notAsIs)
      let pool = applyFunnel(clean, specs)
      if (pool.length < 3) pool = applyRelaxedFunnel(clean, specs)
      if (pool.length >= 3) {
        silverTier = await buildSFTierResult(pool, specs, subjName, subjNum, customValues)
      }
    }
  }

  const tiers = { platinum: platinumTier, gold: goldTier, silver: silverTier, bronze: null }

  // Winner by priority: Platinum >= 1, Gold/Silver >= 3.
  let winnerTier: TierResult | null = null
  let bestGeoTier: 'platinum' | 'gold' | 'silver' | 'none' = 'none'
  if (platinumTier && platinumTier.count >= 1) {
    winnerTier = platinumTier; bestGeoTier = 'platinum'
  } else if (goldTier && goldTier.count >= 3) {
    winnerTier = goldTier; bestGeoTier = 'gold'
  } else if (silverTier && silverTier.count >= 3) {
    winnerTier = silverTier; bestGeoTier = 'silver'
  } else {
    return undefined
  }

  // Multi-tier DISPLAY list: priority order = tightest tier first
  // (platinum -> gold -> silver). Stamp sourceTier. Dedup by listingKey,
  // KEEPING THE FIRST OCCURRENCE (tightest tier wins). Cap at
  // TAX_MATCH_DISPLAY_CAP.
  const stamp = (
    arr: ComparableSale[] | undefined,
    tier: 'platinum' | 'gold' | 'silver',
  ): ComparableSale[] => (arr || []).map(c => ({ ...c, sourceTier: tier }))

  const orderedAll: ComparableSale[] = [
    ...stamp(platinumTier?.comparables, 'platinum'),
    ...stamp(goldTier?.comparables, 'gold'),
    ...stamp(silverTier?.comparables, 'silver'),
  ]
  const seenKeys = new Set<string>()
  const deduped: ComparableSale[] = []
  for (const c of orderedAll) {
    const k = c.listingKey || `__noKey_${deduped.length}`
    if (seenKeys.has(k)) continue
    seenKeys.add(k)
    deduped.push(c)
    if (deduped.length >= TAX_MATCH_DISPLAY_CAP) break
  }

  // MatchTier for the tax section header (winning tier's quality axis).
  const matchTier: MatchTier = tierFromScore(winnerTier.bestMatchScore, winnerTier.count)

  return {
    matchTier,
    comparables:       deduped,
    winnerComparables: winnerTier.comparables,
    count:             winnerTier.count,
    tiers,
    bestGeoTier,
  }
}

async function buildSFTierResult(
  funneledPool: any[],
  specs: HomeSpecs,
  subjName: string | null,
  subjNum: number | null,
  customValues?: ResolvedHomeAdjustments,
): Promise<TierResult | null> {
  if (funneledPool.length === 0) return null
  const scored = funneledPool.map(s => {
    const { sameStreet, sameOddEven } = streetBonusFor(s, subjName, subjNum)
    return { sale: s, score: scoreMatch(s, specs, sameStreet, sameOddEven) }
  }).sort((a, b) => b.score - a.score)
  const top = scored.slice(0, 10)
  const withMedia = await attachMediaUrls(top.map(s => s.sale))
  const comparables = withMedia.map((sale, i) => createHomeComparable(sale, specs, top[i].score, customValues))
  const prices = funneledPool
    .map(s => parseFloat(s.close_price))
    .filter(p => Number.isFinite(p) && p > 0)
  const mr = medianRangeOf(prices)
  return {
    comparables,
    count: funneledPool.length,
    median: mr.median,
    range: mr.range,
    bestMatchScore: scored[0]?.score ?? 0,
  }
}

// SF Bronze area-cascade query. The plex matcher uses a `municipalities!inner`
// embedded join (runPlexPricingPath:752-779), but that pattern times out on SF
// because the SF row count under one area is ~50× plex (Durham alone holds
// ~250K closed listings vs ~1K plex). Two-query pattern instead:
//   1) fetch the area's municipality_ids (8 munis for Durham, sub-second);
//   2) .in('municipality_id', muniIds) on mls_listings — same selectivity as
//      Silver's .eq() but spread across multiple munis.
// Class-contained via getCompatibleSubtypes + propertySubtypeVariants.
async function runSFAreaQuery(
  specs: HomeSpecs,
  supabase: any,
  referenceDate: Date,
  twoYearsAgo: Date,
): Promise<any[]> {
  if (!specs.municipalityId) return []
  const { data: muni } = await supabase
    .from('municipalities')
    .select('area_id')
    .eq('id', specs.municipalityId)
    .single()
  if (!muni?.area_id) return []
  const { data: areaMunis } = await supabase
    .from('municipalities')
    .select('id')
    .eq('area_id', muni.area_id)
  const muniIds = (areaMunis || []).map((m: any) => m.id)
  if (muniIds.length === 0) return []
  const subtypes = getCompatibleSubtypes(specs.propertySubtype)
  let q = supabase
    .from('mls_listings')
    .select(HOME_SELECT)
    .in('municipality_id', muniIds)
    .in('property_subtype', subtypes.flatMap(propertySubtypeVariants))
    .eq('transaction_type', 'For Sale')
    .eq('standard_status', 'Closed')
    .not('close_price', 'is', null)
    .gt('close_price', 100000)
    .gte('close_date', twoYearsAgo.toISOString())
    .order('close_date', { ascending: false })
    .limit(500)
  if (specs.asOfDate) q = q.lt('close_date', referenceDate.toISOString())
  const { data } = await q
  return data || []
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

  // v10 step 3 Phase 1 (2026-06-09): resolve per-tenant + per-geo adjustment
  // overrides ONCE at the top of the matcher call, then thread the resolved
  // object into every buildSFTierResult call. Empty home_adjustments table
  // OR missing tenantId => customValues falls through to DEFAULT_ADJUSTMENTS
  // (no-op guarantee — byte-identical to f7f3c6e).
  const customValues = await resolveHomeAdjustments(
    {
      communityId: specs.communityId,
      municipalityId: specs.municipalityId,
      tenantId: specs.tenantId ?? null,
    },
    'sale',
  )

  // ===== h7: ACCUMULATE ALL FOUR GEO TIERS (no early returns) =====
  //
  // Per tracker section 3 lock: compute every tier always, display every tier
  // always, price from BEST tier only. The MatchTier quality axis (BINGO/
  // RANGE/MAINT/CONTACT) is a separate axis from this geo-tier axis and is
  // still computed by tierFromScore on the best-tier's bestMatchScore.
  //
  // PARITY: for any subject whose best geo tier resolves to the SAME tier
  // today's matcher would have chosen (the typical case — community-priced
  // or muni-priced), the top-level tier/comparables/geoLevel/bestMatchScore
  // are byte-identical to today. The new behavior surfaces only when
  // Platinum's same-street subset has >=3 comps (then Platinum anchors;
  // expected-platinum-anchor) OR when today returned CONTACT but the new
  // Bronze area pool has >=3 (expected-bronze-fill).

  let goldTier: TierResult | null = null
  let platinumTier: TierResult | null = null
  let silverTier: TierResult | null = null
  let silverUsedBedBath = false
  let bronzeTier: TierResult | null = null

  // ----- GOLD: community pool (mirrors today's TIER 1 funnel sequence) -----
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
      const cleanSales = communitySales.filter(notAsIs)
      // Strict-first, fall through to relaxed if strict <3 — mirrors today's
      // sequence at lines 1004-1046 (pre-h7). Whichever pool today would have
      // returned IS the gold pool here.
      let goldPool = applyFunnel(cleanSales, specs)
      if (goldPool.length < 3) {
        goldPool = applyRelaxedFunnel(cleanSales, specs)
      }
      goldTier = await buildSFTierResult(goldPool, specs, subjName, subjNum, customValues)

      // Platinum: same-street subset of Gold's already-funneled pool.
      // No extra DB query. Subject without street data → null.
      if (subjName && subjNum != null && goldPool.length > 0) {
        const platinumPool = goldPool.filter(s => streetBonusFor(s, subjName, subjNum).sameStreet)
        platinumTier = await buildSFTierResult(platinumPool, specs, subjName, subjNum, customValues)
      }
    }
  }

  // ----- SILVER: municipality pool (mirrors today's TIER 2 sequence) -----
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
      let silverPool = applyFunnel(cleanSales, specs)
      if (silverPool.length < 3) silverPool = applyRelaxedFunnel(cleanSales, specs)
      if (silverPool.length < 2) {
        // bedBathOnly fallback — today's last-resort that returns tier=CONTACT
        // with muni comps (lines 1095-1106). We track usedBedBath so the
        // best-tier resolution can force tier='CONTACT' to match pre-h7.
        const bedBathOnly = cleanSales.filter(s => {
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
        if (bedBathOnly.length >= 2) {
          silverPool = bedBathOnly
          silverUsedBedBath = true
        } else {
          silverPool = []
        }
      }
      silverTier = await buildSFTierResult(silverPool, specs, subjName, subjNum, customValues)
    }
  }

  // ----- BRONZE: area pool (NEW for SF — lifts plex pattern) -----
  const areaSales = await runSFAreaQuery(specs, supabase, referenceDate, twoYearsAgo)
  if (areaSales.length > 0) {
    const cleanSales = areaSales.filter(notAsIs)
    let bronzePool = applyFunnel(cleanSales, specs)
    if (bronzePool.length < 3) bronzePool = applyRelaxedFunnel(cleanSales, specs)
    bronzeTier = await buildSFTierResult(bronzePool, specs, subjName, subjNum, customValues)
  }

  // ===== h7: BEST-TIER RESOLUTION (drives top-level fields) =====
  // Order: Platinum>Gold>Silver>Bronze>CONTACT. Thresholds mirror today:
  //   - Gold meets threshold at >=3 funneled (strict OR relaxed)
  //   - Silver meets threshold at >=2 funneled OR bedBathOnly (forces CONTACT)
  //   - Bronze meets threshold at >=3 funneled (no bedBathOnly fallback — area
  //     pool is already wider, last-resort doesn't add useful signal)
  //   - Platinum meets threshold at >=3 (same threshold as Gold; tighter pool)
  const tiers = { platinum: platinumTier, gold: goldTier, silver: silverTier, bronze: bronzeTier }

  // W-TAX-MATCH HOME (2026-06-11): run the tax-mode cascade in parallel
  // with the geo selection. ADDITIVE — does not influence geo
  // tier/pricing/comps; the geo returns below are unchanged. taxMatch is
  // undefined when subject tax is missing or no comps fall in the band
  // (silent-omits at the renderer).
  const taxMatch = await runHomeTaxMatchCascade(supabase, specs, referenceDate, twoYearsAgo, subjName, subjNum, customValues)

  let bestGeoTier: 'platinum' | 'gold' | 'silver' | 'bronze' | 'none'
  let best: TierResult | null
  let geoLevel: HomeMatchResult['geoLevel']
  if (platinumTier && platinumTier.count >= 3) {
    best = platinumTier; bestGeoTier = 'platinum'; geoLevel = 'street'
  } else if (goldTier && goldTier.count >= 3) {
    best = goldTier; bestGeoTier = 'gold'; geoLevel = 'community'
  } else if (silverTier && silverTier.count >= 2) {
    best = silverTier; bestGeoTier = 'silver'; geoLevel = 'municipality'
  } else if (bronzeTier && bronzeTier.count >= 3) {
    best = bronzeTier; bestGeoTier = 'bronze'; geoLevel = 'area'
  } else {
    best = null; bestGeoTier = 'none'; geoLevel = 'none'
  }

  if (!best) {
    return { tier: 'CONTACT', comparables: [], geoLevel: 'none', tiers, bestGeoTier, taxMatch }
  }

  // MatchTier (quality axis) from best tier's top score + count.
  // PARITY: when best=silver AND silver was bedBathOnly, force CONTACT to
  // match today's hardcoded `tier: 'CONTACT'` return at the bedBathOnly path.
  const matchTier: MatchTier = (bestGeoTier === 'silver' && silverUsedBedBath)
    ? 'CONTACT'
    : tierFromScore(best.bestMatchScore, best.count)

  return {
    tier: matchTier,
    comparables: best.comparables,
    geoLevel,
    bestMatchScore: best.bestMatchScore,
    tiers,
    bestGeoTier,
    taxMatch,
  }
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
