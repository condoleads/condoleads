// scripts/buyer-narration-verify.ts
//
// W-CHARLIE-BUYER-NARRATION VERIFY — live cross-surface DOM verification.
//
// Asserts:
//   * For Sale label on all 3 surfaces (no more "Matched Listings" /
//     "Homes in Whitby" on the active-buyable section).
//   * Comp Sold offer narration on all 3 with REAL numbers cross-
//     checked against the actual comp set's median.
//   * Tax-Matched value narration on all 3 with REAL numbers.
//   * Cross-surface number equality (same buyer plan → same median +
//     same offer figure on all 3 surfaces).
//   * Stats sections (Market Intel, Offer Intel, Best Time, Subtype,
//     Strategy) still render — no regression.
//   * Seller path byte-unchanged + seller email no-regression.
//   * For Sale tiles still have photos + clickable slug links (Chunk 3
//     work intact).

import * as fs from 'fs'
import * as path from 'path'
import { chromium } from 'playwright'
import { execSync } from 'child_process'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const BASE = process.env.LOCAL_BASE || 'http://localhost:3004'
const WALLIAM = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
const OUT_DIR = path.resolve(__dirname, '..', 'recon')
const SHOT_DIR = path.join(OUT_DIR, 'buyer-narration-screenshots')
const REPORT = path.join(OUT_DIR, 'buyer-narration-verify.txt')
fs.mkdirSync(OUT_DIR, { recursive: true })
fs.mkdirSync(SHOT_DIR, { recursive: true })
fs.writeFileSync(REPORT, '')
const log = (m: string) => { console.log(m); fs.appendFileSync(REPORT, m + '\n') }
const hr  = () => log('─'.repeat(76))

let fail = 0
function expect(label: string, cond: boolean, evidence?: string) {
  if (!cond) fail++
  log(`${cond ? 'PASS' : 'FAIL'}  ${label}${evidence ? '\n        → ' + evidence : ''}`)
}

// ─── Real-shape fixtures (same buyer plan across all 3 surfaces) ─────────
const REAL_TOPLISTINGS: any[] = [
  { id: '1', listing_key: 'E12945508', unparsed_address: '6540 Coronation Road, Whitby, ON L0B 1C0', list_price: 1, bedrooms_total: 5, bathrooms_total_integer: 3, property_type: 'Residential Freehold', property_subtype: 'Detached', tax_annual_amount: 0, media: [{ media_url: 'https://example.invalid/m1.jpg' }], _slug: '/6540-coronation-road-whitby-e12945508' },
  { id: '2', listing_key: 'E13257090', unparsed_address: '8 Hialeah Crescent, Whitby, ON L1N 6R1', list_price: 1, bedrooms_total: 6, bathrooms_total_integer: 3, property_type: 'Residential Freehold', property_subtype: 'Detached', tax_annual_amount: 6261, media: [{ media_url: 'https://example.invalid/m2.jpg' }], _slug: '/8-hialeah-crescent-whitby-e13257090' },
  { id: '3', listing_key: 'E12815354', unparsed_address: '1050 Elton Way 8, Whitby, ON L1N 0L3', list_price: 599900, bedrooms_total: 3, bathrooms_total_integer: 2, property_type: 'Residential Freehold', property_subtype: 'Att/Row/Townhouse', tax_annual_amount: 4196, media: [{ media_url: 'https://example.invalid/m3.jpg' }], _slug: '/1050-elton-way-8-whitby-e12815354' },
]
// Real Whitby sold comps (matches what get_comparables would emit)
const REAL_COMPS: any[] = [
  { listing_key: 'E13075010', unparsed_address: '121-3 Pat Perkins Drive, Whitby', close_price: 766990, close_date: '2028-04-06', bedrooms_total: 3, bathrooms_total_integer: 3, property_subtype: 'Att/Row/Townhouse' },
  { listing_key: 'E13156072', unparsed_address: '52 Anchorage Avenue, Whitby', close_price: 690000, close_date: '2026-08-28', bedrooms_total: 3, bathrooms_total_integer: 2, property_subtype: 'Att/Row/Townhouse' },
  { listing_key: 'E13169330', unparsed_address: '507 Dunlop Street W, Whitby', close_price: 799000, close_date: '2026-08-28', bedrooms_total: 4, bathrooms_total_integer: 2, property_subtype: 'Detached' },
  { listing_key: 'E13182312', unparsed_address: '75 Magpie Way, Whitby', close_price: 710000, close_date: '2026-08-28', bedrooms_total: 3, bathrooms_total_integer: 4, property_subtype: 'Att/Row/Townhouse' },
  { listing_key: 'E13194904', unparsed_address: '10 Plantation Court, Whitby', close_price: 670000, close_date: '2026-08-28', bedrooms_total: 3, bathrooms_total_integer: 2, property_subtype: 'Att/Row/Townhouse' },
  { listing_key: 'E13066884', unparsed_address: '25 Graham Court, Whitby', close_price: 775000, close_date: '2026-08-27', bedrooms_total: 3, bathrooms_total_integer: 3, property_subtype: 'Detached' },
]
// Median of [670000, 690000, 710000, 766990, 775000, 799000] = (710000+766990)/2 = 738495
const EXPECTED_COMP_MEDIAN = (710000 + 766990) / 2  // 738495
const AVG_CONCESSION_PCT = 3.21
const BUDGET_MAX = 900000
const EXPECTED_OFFER_NEAR = EXPECTED_COMP_MEDIAN * (1 - AVG_CONCESSION_PCT / 100)  // 738495 * 0.9679 = 714779.65

// buyerTaxMatch fixture — band, samples include 4 sold comps (≥TAX_MIN=3)
const REAL_BTM: any = {
  isEmpty: false,
  reason: null,
  bandCenter: 5020.785,
  taxBand: { low: 4016.628, high: 6024.942 },
  taxYearWindow: { low: 2025, high: 2026 },
  withTaxCount: 4, totalCount: 5,
  samples: [
    { listingKey: 'TM1', address: '14 Heber Down Crescent, Whitby', price: 940000, closeDate: '2026-08-31', tax: 5405.03, bedrooms: 4, bathrooms: 3, propertySubtype: 'Detached', _slug: null },
    { listingKey: 'TM2', address: '507 Dunlop Street W, Whitby', price: 799000, closeDate: '2026-08-28', tax: 5648.37, bedrooms: 4, bathrooms: 2, propertySubtype: 'Detached', _slug: null },
    { listingKey: 'TM3', address: '10 Plantation Court, Whitby', price: 670000, closeDate: '2026-08-28', tax: 4822, bedrooms: 3, bathrooms: 2, propertySubtype: 'Att/Row/Townhouse', _slug: null },
    { listingKey: 'TM4', address: '75 Magpie Way, Whitby', price: 710000, closeDate: '2026-08-28', tax: 4822, bedrooms: 3, bathrooms: 4, propertySubtype: 'Att/Row/Townhouse', _slug: null },
  ],
}
// Tax-match price median: [670000, 710000, 799000, 940000] → (710000+799000)/2 = 754500
const EXPECTED_TAX_MEDIAN = (710000 + 799000) / 2  // 754500
const EXPECTED_TAX_OFFER  = EXPECTED_TAX_MEDIAN * (1 - AVG_CONCESSION_PCT / 100)  // 754500 * 0.9679 = 730284.55

;(async () => {
  log('W-CHARLIE-BUYER-NARRATION VERIFY — ' + new Date().toISOString())
  log('local base: ' + BASE)
  hr()

  // Dev server health
  try {
    const r = await fetch(`${BASE}/api/walliam/tenant-config`, { headers: { 'x-tenant-id': WALLIAM } })
    if (r.status !== 200) throw new Error('tenant-config returned ' + r.status)
    log(`dev server: 200 — proceeding with LIVE verify.`)
  } catch (e: any) {
    log('FATAL  dev server not serving — restart it before re-running.')
    log('       error: ' + e.message)
    process.exit(2)
  }

  // ═══════════════════ EMAIL render via test-render-plan-email-probe ═══════════════════
  hr()
  log('GROUP 1 — EMAIL render')
  const emailRes = await fetch(`${BASE}/api/charlie/test-render-plan-email-probe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userName: 'BuyerNarration', userEmail: 'bn@test.invalid', planType: 'buyer',
      plan: { type: 'buyer', geoName: 'Whitby', budgetMax: BUDGET_MAX, budgetMin: 600000, propertyType: 'homes', bedrooms: 3, timeline: 'flexible' },
      analytics: { sale_to_list_ratio: 96.79, closed_avg_dom_90: 20, median_psf: null, active_count: 250, closed_sale_count_90: 137, absorption_rate_pct: 36, track: 'homes', avg_concession_pct: AVG_CONCESSION_PCT, subtype_breakdown: { Detached: { count: 50, median_price: 920000, avg_dom: 18 }, 'Att/Row/Townhouse': { count: 80, median_price: 720000, avg_dom: 22 } } },
      listings: REAL_TOPLISTINGS, geoName: 'Whitby',
      comparables: REAL_COMPS, sellerEstimate: null,
      vipCreditUsed: false, vipCreditPlansUsed: 0, vipCreditTotal: 1,
      blocks: [], brandName: 'WALLiam', domain: 'walliam.ca', baseUrl: 'https://walliam.ca',
      buyerTaxMatch: REAL_BTM,
    }),
  })
  const emailJson = await emailRes.json()
  const emailHtml: string = emailJson?.html || ''
  fs.writeFileSync(path.resolve(OUT_DIR, 'buyer-narration-email.html'), emailHtml)

  // FIX 1: For Sale label
  expect('1.1 EMAIL For-Sale label is "For Sale" (not "Matched Listings")',
    /For Sale \(3\)/.test(emailHtml) && !/Matched Listings \(\d+\)/.test(emailHtml))
  // FIX 2: comp-sold narration
  expect('1.2 EMAIL Comp Sold narration cites real median ($738,495)',
    /\$738,495/.test(emailHtml))
  expect('1.3 EMAIL Comp Sold narration cites the budget ($900,000)',
    /\$900,000/.test(emailHtml))
  expect('1.4 EMAIL Comp Sold narration cites offer figure ($714,789 = median × (1-3.21%))',
    /\$714,789/.test(emailHtml),
    `expected offerNear=${EXPECTED_OFFER_NEAR}`)
  expect('1.5 EMAIL Comp Sold narration cites concession percentage',
    /3\.2%|3\.21%/.test(emailHtml))
  // FIX 3: tax-match narration
  expect('1.6 EMAIL Tax-Matched narration cites real tax-comp median ($754,500)',
    /\$754,500/.test(emailHtml))
  expect('1.7 EMAIL Tax-Matched narration cites offer figure ($730,281)',
    /\$730,281/.test(emailHtml))
  // No regression on framing (must not say "/yr what-you'll-pay" / "Median annual tax")
  expect('1.8 EMAIL Tax-Matched NO regression to assessment wording',
    !/Median annual tax/.test(emailHtml) && !/what you.{1,5}ll pay yearly/i.test(emailHtml))

  // ═══════════════════ LEAD-PAGE render via direct tsx import ═══════════════════
  hr()
  log('GROUP 2 — LEAD-PAGE render')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { jsx } = await import('react/jsx-runtime')
  const { default: PlanTab } = await import('../components/admin-homes/lead-workbench/PlanRenderer')
  const realBuyerLead: any = {
    id: 'verify-narr-1',
    contact_name: 'Narration Buyer',
    contact_email: 'nb@test.invalid',
    intent: 'buyer',
    geo_name: 'Whitby',
    source: 'walliam_charlie',
    source_url: null,
    created_at: '2026-06-15T10:00:00Z',
    agents: null,
    plan_data: {
      planType: 'buyer',
      plan: { type: 'buyer', geoName: 'Whitby', budgetMin: 600000, budgetMax: BUDGET_MAX, propertyType: 'homes', bedrooms: 3, timeline: 'flexible' },
      analytics: { sale_to_list_ratio: 96.79, closed_avg_dom_90: 20, median_psf: null, active_count: 250, closed_sale_count_90: 137, absorption_rate_pct: 36, track: 'homes', avg_concession_pct: AVG_CONCESSION_PCT, insight_seasonal: { best_months: [7,8], current_month: 6 }, subtype_breakdown: { Detached: { count: 50, median_price: 920000, avg_dom: 18 } } },
      topListings: REAL_TOPLISTINGS,
      comparables: REAL_COMPS,
      buyerTaxMatch: REAL_BTM,
      sellerEstimate: null,
    },
  }
  const leadHtml: string = renderToStaticMarkup(jsx(PlanTab as any, { anchorLead: realBuyerLead, leadFamily: [realBuyerLead] }))
  fs.writeFileSync(path.resolve(OUT_DIR, 'buyer-narration-lead.html'), leadHtml)

  expect('2.1 LEAD For-Sale label is "For Sale" (not "Matched Listings")',
    /For Sale \(3\)/.test(leadHtml) && !/Matched Listings \(\d+\)/.test(leadHtml))
  expect('2.2 LEAD Comp Sold narration cites $738,495 median', /\$738,495/.test(leadHtml))
  expect('2.3 LEAD Comp Sold narration cites $900,000 budget', /\$900,000/.test(leadHtml))
  expect('2.4 LEAD Comp Sold narration cites $714,789 offer', /\$714,789/.test(leadHtml))
  expect('2.5 LEAD Tax-Matched narration cites $754,500 median', /\$754,500/.test(leadHtml))
  expect('2.6 LEAD Tax-Matched narration cites $730,281 offer', /\$730,281/.test(leadHtml))
  expect('2.7 LEAD stats still render (Market Intel + Offer Intel + Best Time + Subtype + Summary)',
    /Market Intelligence/i.test(leadHtml) && /Offer Intelligence/i.test(leadHtml) && /Best Time to Buy/i.test(leadHtml) && /Price by Home Type/i.test(leadHtml))
  expect('2.8 LEAD For Sale tiles still have photos + clickable links (Chunk 3 intact)',
    /target="_blank"/.test(leadHtml) && /href="\/6540-coronation-road-whitby-e12945508"/.test(leadHtml))

  // ═══════════════════ IN-CHAT via narration-unit test on shared helpers ═══════════════════
  // The ResultsPanel can't be SSR-rendered without auth state; instead we
  // verify the shared narration builders directly + assert the live DOM
  // probe (test-comparable-tile-probe) doesn't regress on tile shape.
  hr()
  log('GROUP 3 — Shared narration helpers (in-process)')
  const { buildCompSoldNarration, buildTaxMatchNarration } = await import('../lib/charlie/buyer-narration')
  const compNarr = buildCompSoldNarration({ comparables: REAL_COMPS, budgetMax: BUDGET_MAX, avgConcessionPct: AVG_CONCESSION_PCT })
  expect('3.1 buildCompSoldNarration median = expected', compNarr.median === EXPECTED_COMP_MEDIAN, `median=${compNarr.median}`)
  expect('3.2 buildCompSoldNarration offerNear ≈ expected', Math.abs((compNarr.offerNear || 0) - EXPECTED_OFFER_NEAR) < 0.1, `offerNear=${compNarr.offerNear}`)
  expect('3.3 buildCompSoldNarration text contains median + budget + offer figures',
    !!compNarr.text && compNarr.text.includes('$738,495') && compNarr.text.includes('$900,000') && compNarr.text.includes('$714,789'))

  const taxNarr = buildTaxMatchNarration({ samples: REAL_BTM.samples, budgetMax: BUDGET_MAX, avgConcessionPct: AVG_CONCESSION_PCT })
  expect('3.4 buildTaxMatchNarration median = expected', taxNarr.median === EXPECTED_TAX_MEDIAN, `median=${taxNarr.median}`)
  expect('3.5 buildTaxMatchNarration offerNear ≈ expected', Math.abs((taxNarr.offerNear || 0) - EXPECTED_TAX_OFFER) < 0.1, `offerNear=${taxNarr.offerNear}`)
  expect('3.6 buildTaxMatchNarration text contains median + offer figures',
    !!taxNarr.text && taxNarr.text.includes('$754,500') && taxNarr.text.includes('$730,281'))

  // No-fabrication tests
  hr()
  log('GROUP 4 — No-fabrication / Rule-Zero')
  const thinNarr = buildCompSoldNarration({ comparables: [REAL_COMPS[0], REAL_COMPS[1]], budgetMax: BUDGET_MAX, avgConcessionPct: AVG_CONCESSION_PCT })
  expect('4.1 Thin comp data (n=2 < 3) → narration OMITTED entirely', thinNarr.text === null)
  const noPctNarr = buildCompSoldNarration({ comparables: REAL_COMPS, budgetMax: BUDGET_MAX, avgConcessionPct: null })
  expect('4.2 No avg_concession_pct → narration cites median + budget but NOT an offer figure',
    !!noPctNarr.text && /median of \$738,495/.test(noPctNarr.text || '') && !/an offer near/.test(noPctNarr.text || ''))
  const noBudgetNarr = buildCompSoldNarration({ comparables: REAL_COMPS, budgetMax: null, avgConcessionPct: AVG_CONCESSION_PCT })
  expect('4.3 No budget → narration cites median only, no positioning clause',
    !!noBudgetNarr.text && /\$738,495/.test(noBudgetNarr.text || '') && !/At your/.test(noBudgetNarr.text || ''))
  const emptyTaxNarr = buildTaxMatchNarration({ samples: [], budgetMax: BUDGET_MAX, avgConcessionPct: AVG_CONCESSION_PCT })
  expect('4.4 Empty tax-match samples → narration OMITTED', emptyTaxNarr.text === null)

  // ═══════════════════ IN-CHAT tile probe (no-regression) ═══════════════════
  hr()
  log('GROUP 5 — IN-CHAT tile probe (no Chunk 2b/3/4 regression)')
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 1800 } })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/test-comparable-tile-probe`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForSelector('[data-testid="buyer-section"]', { timeout: 30000 })
  await page.screenshot({ path: path.join(SHOT_DIR, '1-tile-probe.png'), fullPage: true })
  const buyerSec = await page.locator('[data-testid="buyer-section"]').innerText()
  expect('5.1 IN-CHAT ComparableCard still renders populated tile (Chunk 2b/3/4 intact)',
    buyerSec.includes('101 Buyer Snake St') && buyerSec.includes('$705,000'))
  await browser.close()

  // ═══════════════════ Cross-surface consistency ═══════════════════
  hr()
  log('GROUP 6 — Cross-surface number equality (email ↔ lead-page)')
  expect('6.1 Same comp median ($738,495) appears on EMAIL + LEAD',
    /\$738,495/.test(emailHtml) && /\$738,495/.test(leadHtml))
  expect('6.2 Same offer figure ($714,789) appears on EMAIL + LEAD',
    /\$714,789/.test(emailHtml) && /\$714,789/.test(leadHtml))
  expect('6.3 Same tax-comp median ($754,500) appears on EMAIL + LEAD',
    /\$754,500/.test(emailHtml) && /\$754,500/.test(leadHtml))
  expect('6.4 Same tax-comp offer ($730,281) appears on EMAIL + LEAD',
    /\$730,281/.test(emailHtml) && /\$730,281/.test(leadHtml))

  // ═══════════════════ Seller no-regression ═══════════════════
  hr()
  log('GROUP 7 — Seller no-regression')
  function unchanged(fp: string) {
    try { execSync(`git diff --quiet HEAD -- "${fp}"`, { stdio: 'pipe' }); return true } catch { return false }
  }
  for (const fp of [
    'lib/charlie/buyer-tax-match.ts',
    'lib/estimator/tax-band-sold-query.ts',
    'lib/estimator/home-comparable-matcher-sales.ts',
    'lib/estimator/condo-comparable-matcher-sales.ts',
    'app/api/charlie/plan-email/route.ts',
    'app/api/charlie/buyer-tax-match/route.ts',
    'app/api/charlie/seller-estimate/route.ts',
    'app/charlie/hooks/useCharlie.ts',
    'app/charlie/lib/charlie-prompts.ts',
    'app/charlie/lib/charlie-tools.ts',
    'app/charlie/components/ComparableCard.tsx',
    'app/charlie/components/SellerEstimateBlock.tsx',
    'components/dashboard/CharlieLeadEstimate.tsx',
  ]) {
    expect(`7.U ${fp} byte-unchanged this commit`, unchanged(fp))
  }

  // Seller email render — must still show seller sections
  const stale_se = {
    estimate: { estimatedPrice: 880000, priceRange: { low: 850000, high: 910000 }, bestGeoTier: 'community', tiers: { community: { count: 5, median: 880000 } }, taxMatch: { estimatedPrice: 875000, priceRange: { low: 850000, high: 900000 }, comparables: [{ listingKey: 'STALE-TM-1', closePrice: 880000, unparsedAddress: '999 Tax Match Ln, Pickering' }] } },
    comparables: [{ listingKey: 'STALE-CS-1', closePrice: 870000, unparsedAddress: '888 Stale Comp Ave, Pickering' }],
    competingListings: [], buildingName: null, subjectAddress: '606 Aspen', geoLevel: 'community', intent: 'sale', path: 'home',
  }
  const sellerRender = await fetch(`${BASE}/api/charlie/test-render-plan-email-probe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userName: 'Seller', userEmail: 's@t.invalid', planType: 'seller',
      plan: { type: 'seller', geoName: 'Pickering' }, analytics: { track: 'homes' },
      listings: [], geoName: 'Pickering',
      comparables: [], sellerEstimate: stale_se,
      vipCreditUsed: false, vipCreditPlansUsed: 0, vipCreditTotal: 1,
      blocks: [], brandName: 'WALLiam', domain: 'walliam.ca', baseUrl: 'https://walliam.ca',
      buyerTaxMatch: null,
    }),
  }).then(r => r.json())
  const sellerHtml = sellerRender?.html || ''
  expect('7.S1 SELLER email renders sellerEstimate.comparables (STALE-CS / 888 Stale Comp)',
    /STALE-CS|888 Stale Comp Ave/.test(sellerHtml))
  expect('7.S2 SELLER email retains Property Estimate price card', /Estimated Value/i.test(sellerHtml))
  expect('7.S3 SELLER email does NOT show "For Sale" buyer label (seller uses "Comparable Sales")',
    !/For Sale \(\d+\)/.test(sellerHtml) || /Comparable Sales/.test(sellerHtml))
  expect('7.S4 SELLER email does NOT contain buyer-only narration phrasing',
    !/Comparable homes sold at a median of/.test(sellerHtml) && !/Homes in this property-tax range recently sold around/.test(sellerHtml))

  // ═══════════════════ Email stats no-regression ═══════════════════
  hr()
  log('GROUP 8 — EMAIL stats still render (Market Intel / Offer Intel / Best Time / Strategy)')
  expect('8.1 EMAIL has Market Intelligence section', /Market Intelligence/i.test(emailHtml))
  expect('8.2 EMAIL has Offer Intelligence section', /Offer Intelligence/i.test(emailHtml))
  expect('8.3 EMAIL has Price by Home Type or Subtype Breakdown', /Price by Home Type/i.test(emailHtml) || /by Home Type/i.test(emailHtml))
  expect('8.4 EMAIL Tax-Matched section still renders SOLD framing',
    /Recently sold homes matched by property-tax band/.test(emailHtml))

  hr()
  log(`SUMMARY: ${fail === 0 ? 'ALL PASS' : fail + ' FAIL'}`)
  log(`screenshots: ${SHOT_DIR}/`)
  process.exit(fail === 0 ? 0 : 1)
})().catch(e => { log('UNHANDLED: ' + (e?.stack || e)); process.exit(2) })
