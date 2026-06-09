// lib/estimator/home-adjustment-math.js
//
// Shared home adjustment math primitives. CommonJS module so both:
//   - lib/estimator/home-comparable-matcher-sales.ts  (production TS, via allowJs)
//   - scripts/backtest-estimator-homes.js              (CLI JS, via require)
// can import the same constants + helpers without duplication.
//
// Verbatim MOVE of prior in-file definitions from
// lib/estimator/home-comparable-matcher-sales.ts (DEFAULT_ADJUSTMENTS @46-66,
// parseBasement @132-160, getBasementAdjustment @162-192, getGarageValue
// @197-206, hasIngroundPool @210-213). No logic change vs the prior code;
// only the export syntax differs. TypeScript type annotations dropped (JS
// runtime; consumers duck-type the basement-profile object).

const DEFAULT_ADJUSTMENTS = {
  // h6 (frontage-as-gate, 2026-06-09): the flat $40k/ft additive adjustment
  // produced catastrophic mispredictions on large frontage diffs (10ft diff
  // = $400k = ~47% of Detached median $850k; 15ft = ~71% of price). Replaced
  // with proportional ±20% band on close_price:
  //   amount = sign(diff) * min(|diff| * PER_FOOT_PCT, MAX_PCT) * close_price
  // The cap engages at |diff| = MAX_PCT / PER_FOOT_PCT = 0.20 / 0.008 = 25 ft
  // (half the Detached median lot, p50=50 ft) — defensible threshold.
  // The legacy LOT_FRONTAGE_PER_FOOT constant is kept here (unused) only so
  // any local recon script that still references it reads a defined value.
  // ALL production + backtest reads should use the *_PCT pair below.
  LOT_FRONTAGE_PER_FOOT: 40000,         // LEGACY — replaced by *_PCT pair (kept for compat)
  LOT_FRONTAGE_PER_FOOT_PCT: 0.008,     // 0.8% of comp close_price per foot of diff
  LOT_FRONTAGE_MAX_PCT: 0.20,           // hard cap: ±20% of comp close_price
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

// h6 frontage-as-gate: shared normalizer (BOTH subject + comp side go through
// this so they compare in the same regime). Returns frontage in feet, or null
// if the value can't be trusted.
// Empirical regime (STEP 0 hygiene gate, 2026-06-09):
//   lot_size_units = 'Feet'   → feet              (193,129 / 90.8%)
//   lot_size_units = (null)   → feet              ( 14,178 /  6.7%)  dominant default
//   lot_size_units = 'Acres'  → feet              (  3,691 /  1.7%)  flag refers to lot_size_area, NOT lot_width
//                                                  Verified via lot_size_dimensions cross-check
//                                                  (e.g. "75.00 x 133.00" matches area 0.06ac)
//   lot_size_units = 'Metres' → metres → feet     (  1,794 /  0.8%)  6.10m → 20ft townhouse, impossible if read as ft
// Guards: lot_width <= 0 (944 Det / 48 Semi / 351 AttRow / 3 Link / 1 Dup / 1 Trip),
//         > 1000 (952 Det / 5 Semi / 10 AttRow / 0 / 0 / 0 — data errors like 274,033),
//         non-finite → all → null (no adjustment).
// 200-1000 band IS legitimate rural acreage frontage (Acres cohort p90 = 400ft) —
// kept; the proportional ±20% cap makes wide rural frontages safe.
function normalizeFrontageFeet(rawWidth, lotSizeUnits) {
  const w = parseFloat(rawWidth)
  if (!isFinite(w) || w <= 0) return null
  if (w > 1000) return null
  if (lotSizeUnits === 'Metres') return w * 3.28084
  return w
}

function parseBasement(basementArr) {
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

function getBasementAdjustment(subjectArr, compArr) {
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

function getGarageValue(garageType) {
  const adj = DEFAULT_ADJUSTMENTS
  switch (garageType) {
    case 'Detached': return adj.GARAGE_DETACHED_SINGLE
    case 'Attached': return adj.GARAGE_ATTACHED_SINGLE
    case 'Built-In': return adj.GARAGE_BUILTIN
    case 'Carport': return 15000 // half of detached
    default: return 0 // 'None', 'Lane', 'Street', 'Unknown', etc.
  }
}

function hasIngroundPool(poolFeatures) {
  if (!poolFeatures) return false
  return poolFeatures.includes('Inground')
}

// Canonical home living_area_range ladder, in size order. Hardcoded (NOT parsed
// from bucket strings) so the 3 known noise buckets (600-699, 800-899, 2500-2749
// = 4 rows total in 317k) cannot corrupt adjacency. Source: verified DB recon 2026-06-04.
const HOME_LAR_LADDER = [
  '< 700', '700-1100', '1100-1500', '1500-2000', '2000-2500',
  '2500-3000', '3000-3500', '3500-5000', '5000 +',
]

// True if two LAR buckets are the same or one step apart on the canonical ladder.
// Returns false for unknown/noise buckets (not on the ladder) - they only match exact.
function isAdjacentRange(a, b) {
  if (!a || !b) return false
  if (a === b) return true
  const ia = HOME_LAR_LADDER.indexOf(a)
  const ib = HOME_LAR_LADDER.indexOf(b)
  if (ia === -1 || ib === -1) return false
  return Math.abs(ia - ib) === 1
}

module.exports = {
  DEFAULT_ADJUSTMENTS,
  parseBasement,
  getBasementAdjustment,
  getGarageValue,
  hasIngroundPool,
  isAdjacentRange,
  HOME_LAR_LADDER,
  normalizeFrontageFeet,
}
