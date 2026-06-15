// lib/charlie/buyer-narration.ts
//
// W-CHARLIE-BUYER-NARRATION (2026-06-15) — shared narration builders
// for the buyer plan's Comparable Sold + Tax-Matched sections. Same
// helpers consumed by all 3 surfaces (in-chat ResultsPanel, email
// charlie-plan-email-html, lead-page PlanRenderer) so the narration
// text + cited numbers are IDENTICAL across surfaces for the same
// buyer plan.
//
// Rule Zero (no fabrication):
//   - OMIT the entire narration when fewer than COMP_MIN comps are
//     available (3) or when no price data can be extracted.
//   - When avgConcessionPct is missing/zero, cite only the median +
//     budget positioning — do NOT invent a concession figure.
//   - For tax-match: same minimums on tax-match samples.
//
// Pure functions — no React, no DOM, no DB.

export const COMP_MIN = 3
export const TAX_MIN = 3

function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function fmtCAD0(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return '$' + Math.round(n).toLocaleString('en-CA')
}

/** Extract a usable sold price from a comp row (snake_case from
 *  geo-listings OR camelCase from seller-estimate / tax-match shape). */
function pickClosePrice(c: any): number | null {
  const candidates = [c?.close_price, c?.closePrice, c?.price]
  for (const v of candidates) {
    const n = Number(v)
    if (Number.isFinite(n) && n > 0) return n
  }
  return null
}

export interface BuildCompSoldNarrationParams {
  comparables: any[] | null | undefined
  budgetMax: number | null | undefined
  avgConcessionPct: number | null | undefined
}

export interface NarrationResult {
  /** Full prose line ready to embed; null when omitted (Rule Zero). */
  text: string | null
  /** Median that was cited (for verify cross-check). null when omitted. */
  median: number | null
  /** Offer figure that was cited (for verify cross-check). null when
   *  no concession data was available — narration omits that clause. */
  offerNear: number | null
}

/**
 * Comparable Sold offer narration. Surfaced under the section header
 * on email + lead + in-chat.
 *
 * Output template:
 *   "Comparable homes sold at a median of $X. At your $A budget,
 *    an offer near $B is well-positioned."
 *
 * If avgConcessionPct is unavailable, the second sentence reduces to:
 *   "At your $A budget, you're well-positioned versus this median."
 * (No fabricated concession figure.)
 *
 * If fewer than COMP_MIN usable close_prices OR no budgetMax, returns
 * { text: null }.
 */
export function buildCompSoldNarration(params: BuildCompSoldNarrationParams): NarrationResult {
  const { comparables, budgetMax, avgConcessionPct } = params
  if (!Array.isArray(comparables)) return { text: null, median: null, offerNear: null }

  const prices: number[] = []
  for (const c of comparables) {
    const p = pickClosePrice(c)
    if (p != null) prices.push(p)
  }
  if (prices.length < COMP_MIN) return { text: null, median: null, offerNear: null }

  const med = median(prices)
  if (med == null) return { text: null, median: null, offerNear: null }

  const budget = (typeof budgetMax === 'number' && budgetMax > 0) ? budgetMax : null

  const pctRaw = Number(avgConcessionPct)
  const pct = (Number.isFinite(pctRaw) && pctRaw > 0 && pctRaw < 100) ? pctRaw : null

  let offerNear: number | null = null
  if (pct != null) {
    offerNear = med * (1 - pct / 100)
  }

  let text = `Comparable homes sold at a median of ${fmtCAD0(med)}.`
  if (budget != null && offerNear != null) {
    text += ` At your ${fmtCAD0(budget)} budget, an offer near ${fmtCAD0(offerNear)} is well-positioned (median minus ${pct!.toFixed(1)}% avg concession).`
  } else if (budget != null) {
    text += ` At your ${fmtCAD0(budget)} budget, you're well-positioned versus this median.`
  }
  return { text, median: med, offerNear }
}

export interface BuildTaxMatchNarrationParams {
  /** buyerTaxMatch.samples shape (from lib/charlie/buyer-tax-match.ts):
   *  each has `price` (sold close price) + `tax`. */
  samples: any[] | null | undefined
  budgetMax: number | null | undefined
  avgConcessionPct: number | null | undefined
}

/**
 * Tax-Matched value narration. Surfaced under the section header.
 *
 * Output template:
 *   "Homes in this property-tax range recently sold around $Z —
 *    validating a fair value near $W for what you're shopping."
 *
 * If avgConcessionPct is unavailable:
 *   "Homes in this property-tax range recently sold around $Z —
 *    a fair value anchor for your search."
 *
 * If fewer than TAX_MIN usable sold prices in samples, returns
 * { text: null }.
 */
export function buildTaxMatchNarration(params: BuildTaxMatchNarrationParams): NarrationResult {
  const { samples, budgetMax, avgConcessionPct } = params
  if (!Array.isArray(samples)) return { text: null, median: null, offerNear: null }

  const prices: number[] = []
  for (const s of samples) {
    const p = pickClosePrice(s)
    if (p != null) prices.push(p)
  }
  if (prices.length < TAX_MIN) return { text: null, median: null, offerNear: null }

  const med = median(prices)
  if (med == null) return { text: null, median: null, offerNear: null }

  const pctRaw = Number(avgConcessionPct)
  const pct = (Number.isFinite(pctRaw) && pctRaw > 0 && pctRaw < 100) ? pctRaw : null

  let offerNear: number | null = null
  if (pct != null) {
    offerNear = med * (1 - pct / 100)
  }
  void budgetMax // budget is not cited here — anchor is the tax-cluster median; budget is contextual elsewhere.

  let text = `Homes in this property-tax range recently sold around ${fmtCAD0(med)}`
  if (offerNear != null) {
    text += ` — validating a fair value near ${fmtCAD0(offerNear)} for what you're shopping.`
  } else {
    text += ` — a fair value anchor for your search.`
  }
  return { text, median: med, offerNear }
}
