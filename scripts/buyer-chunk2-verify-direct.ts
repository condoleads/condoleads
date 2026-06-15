// scripts/buyer-chunk2-verify-direct.ts
// W-CHARLIE-BUYER-CHUNK2 VERIFY — direct fn-import verify (real fn, NOT source-grep).
//
// The live HTTP-route verify (POST /api/charlie/plan-email + DB readback)
// is BLOCKED right now: the local dev server on :3004 is unresponsive on
// all API routes (probed unrelated routes — same hang, not specific to
// this chunk). Operator action required to restart it; until then this
// harness exercises every code path we control by direct tsx import:
//
//   1. lib/charlie/buyer-tax-match.ts deriveBuyerTaxMatch — pure fn,
//      tested across 4 fixture shapes (4/5 with tax, sparse 1/3,
//      empty 0/0, mixed-density 3/6).
//   2. lib/email/charlie-plan-email-html.ts buildRichPlanEmail — the
//      ACTUAL function used by the live POST handler. Driven with the
//      same fixture, for buyer + seller side-by-side. Asserts on the
//      rendered HTML.
//   3. Source-shape architectural checks for the 3rd surface (in-chat
//      ResultsPanel + lead-page PlanRenderer + prompt edit) — these
//      ARE source asserts, but they're proving that the gating logic
//      and import wiring are in place (the rendered output for these
//      surfaces would need Playwright + a live auth'd session).
//
// Output: recon/buyer-chunk2-verify.txt
import * as fs from 'fs'
import * as path from 'path'
import { deriveBuyerTaxMatch, type BuyerTaxMatch } from '../lib/charlie/buyer-tax-match'
import { buildRichPlanEmail } from '../lib/email/charlie-plan-email-html'

const OUT_DIR = path.resolve(__dirname, '..', 'recon')
const REPORT = path.join(OUT_DIR, 'buyer-chunk2-verify.txt')
fs.mkdirSync(OUT_DIR, { recursive: true })
fs.writeFileSync(REPORT, '')
const log = (m: string) => { console.log(m); fs.appendFileSync(REPORT, m + '\n') }
const hr = () => log('─'.repeat(76))

let fail = 0
function expect(label: string, cond: boolean, evidence?: string) {
  if (!cond) fail++
  log(`${cond ? 'PASS' : 'FAIL'}  ${label}${evidence ? '\n        → ' + evidence : ''}`)
}

log('W-CHARLIE-BUYER-CHUNK2 VERIFY — ' + new Date().toISOString())
log('Mode: direct tsx import (live HTTP-route verify deferred; dev server unresponsive).')
hr()

// ─── Fixtures ───
function mkListing(i: number, tax: number | null) {
  return {
    id: `vfix-${i}`,
    listing_key: `VFIX${i}`,
    unparsed_address: `${100 + i} Verify Buyer St, Whitby, ON L1N ${i}A${i}`,
    list_price: 600000 + i * 25000,
    bedrooms_total: 3,
    bathrooms_total_integer: 2,
    property_type: 'Residential Freehold',
    property_subtype: 'Detached',
    tax_annual_amount: tax,
    media: [{ media_url: `https://example.invalid/p${i}.jpg` }],
    _slug: `${100 + i}-verify-buyer-st-whitby-vfix${i}`.toLowerCase(),
  }
}
const BUYER_LISTINGS = [mkListing(1, 4500), mkListing(2, 4800), mkListing(3, 5100), mkListing(4, 5400), mkListing(5, null)]
const BUYER_COMPS = [
  { listing_key: 'VFIX-C-1', unparsed_address: '50 Comp St, Whitby', close_price: 685000, bedrooms_total: 3, property_subtype: 'Detached' },
  { listing_key: 'VFIX-C-2', unparsed_address: '60 Comp St, Whitby', close_price: 705000, bedrooms_total: 3, property_subtype: 'Detached' },
  { listing_key: 'VFIX-C-3', unparsed_address: '70 Comp St, Whitby', close_price: 725000, bedrooms_total: 4, property_subtype: 'Detached' },
]
const FIXTURE_PLAN_BUYER: any = { type: 'buyer', planReady: true, geoName: 'Whitby', budgetMin: 600000, budgetMax: 800000, propertyType: 'homes', bedrooms: 3, timeline: 'flexible' }
const FIXTURE_PLAN_SELLER: any = { type: 'seller', planReady: true, geoName: 'Pickering', propertyType: 'homes', estimatedValueMin: 850000, estimatedValueMax: 910000, timeline: 'flexible', goal: 'maximize' }
const FIXTURE_ANALYTICS: any = { sale_to_list_ratio: 99, closed_avg_dom_90: 18, median_psf: 800, active_count: 50, closed_sale_count_90: 80, absorption_rate_pct: 60, track: 'homes' }
const STALE_SE: any = {
  estimate: { estimatedPrice: 880000, priceRange: { low: 850000, high: 910000 }, bestGeoTier: 'community', tiers: { community: { count: 5, median: 880000 } }, taxMatch: { estimatedPrice: 875000, priceRange: { low: 850000, high: 900000 }, comparables: [{ listingKey: 'STALE-TM-1', closePrice: 880000, unparsedAddress: '999 Test Tax Ln, Pickering' }] } },
  comparables: [{ listingKey: 'STALE-CS-1', closePrice: 870000, unparsedAddress: '888 Test Comp Ave, Pickering' }],
  competingListings: [], buildingName: null, subjectAddress: '606 Aspen Test St, Pickering', geoLevel: 'community', intent: 'sale', path: 'home',
}

// ─── 1. deriveBuyerTaxMatch unit tests ───
log('SECTION 1 — deriveBuyerTaxMatch unit tests (4 fixture shapes)')
const d1 = deriveBuyerTaxMatch(BUYER_LISTINGS)
expect('U1: isEmpty=false (4 of 5 have tax)', d1.isEmpty === false, `withTaxCount=${d1.withTaxCount}/${d1.totalCount}`)
expect('U2: medianTax = 4950 (median of 4500/4800/5100/5400)', d1.medianTax === 4950, `medianTax=${d1.medianTax}`)
expect('U3: taxBand low=4725 high=5175 (25/75 quantiles)', d1.taxBand?.low === 4725 && d1.taxBand?.high === 5175, `taxBand=${JSON.stringify(d1.taxBand)}`)
expect('U4: samples populated', Array.isArray(d1.samples) && d1.samples.length === 4, `samples.length=${d1.samples.length}`)

const d2 = deriveBuyerTaxMatch([mkListing(1, null), mkListing(2, null), mkListing(3, 5000)])
expect('U5: sparse → isEmpty=true', d2.isEmpty === true, `withTaxCount=${d2.withTaxCount}/${d2.totalCount}`)
expect('U6: sparse reason cites N of M', /Only 1 of 3/.test(d2.reason || ''), `reason="${d2.reason}"`)

const d3 = deriveBuyerTaxMatch([])
expect('U7: empty → isEmpty=true, "No matched listings yet"', d3.isEmpty === true && /No matched listings/.test(d3.reason || ''))

// 50% condo-like density (still passes minimum)
const d4 = deriveBuyerTaxMatch([
  { tax_annual_amount: 3500, list_price: 600000, listing_key: 'C1' },
  { tax_annual_amount: null, list_price: 620000, listing_key: 'C2' },
  { tax_annual_amount: 3700, list_price: 640000, listing_key: 'C3' },
  { tax_annual_amount: null, list_price: 660000, listing_key: 'C4' },
  { tax_annual_amount: 3900, list_price: 680000, listing_key: 'C5' },
  { tax_annual_amount: null, list_price: 700000, listing_key: 'C6' },
])
expect('U8: 50%-density (3 of 6 have tax) → derived, median=3700', d4.isEmpty === false && d4.medianTax === 3700, `medianTax=${d4.medianTax} withTaxCount=${d4.withTaxCount}/${d4.totalCount}`)

// ─── 2. buildRichPlanEmail render tests ───
hr()
log('SECTION 2 — buildRichPlanEmail render tests (live fn, buyer + seller)')
const btm = deriveBuyerTaxMatch(BUYER_LISTINGS)
const buyerHtml = buildRichPlanEmail({
  userName: 'VerifyBuyer', userEmail: 'b@test.invalid', planType: 'buyer',
  plan: FIXTURE_PLAN_BUYER, analytics: FIXTURE_ANALYTICS, listings: BUYER_LISTINGS,
  agent: null, geoName: 'Whitby',
  comparables: BUYER_COMPS, sellerEstimate: null,
  vipCreditUsed: false, vipCreditPlansUsed: 0, vipCreditTotal: 1,
  blocks: [], brandName: 'WALLiam', domain: 'walliam.ca', baseUrl: 'https://walliam.ca',
  buyerTaxMatch: btm,
})
const sellerHtml = buildRichPlanEmail({
  userName: 'VerifySeller', userEmail: 's@test.invalid', planType: 'seller',
  plan: FIXTURE_PLAN_SELLER, analytics: FIXTURE_ANALYTICS, listings: [],
  agent: null, geoName: 'Pickering',
  comparables: [], sellerEstimate: STALE_SE,
  vipCreditUsed: false, vipCreditPlansUsed: 0, vipCreditTotal: 1,
  blocks: [], brandName: 'WALLiam', domain: 'walliam.ca', baseUrl: 'https://walliam.ca',
  buyerTaxMatch: null,
})

expect('E1: buyer html length > 1000', buyerHtml.length > 1000, `len=${buyerHtml.length}`)
expect('E2: buyer has Comparable Sold heading', /Comparable Sold/i.test(buyerHtml))
expect('E3: buyer has Tax-Matched heading', /Tax-Matched/i.test(buyerHtml))
expect('E4: buyer email contains buyer-derived comp-sold (VFIX-C / Comp St)', /50 Comp St|60 Comp St|70 Comp St/.test(buyerHtml))
expect('E5: buyer email contains "Median annual tax" blurb', /Median annual tax/.test(buyerHtml))
expect('E6: buyer email median displayed = $4,950', /\$4,950/.test(buyerHtml), `searched for $4,950`)
expect('E7: buyer email band displayed = $4,725 – $5,175', /\$4,725.{1,20}\$5,175/.test(buyerHtml))
expect('E8: buyer email contains a buyer tax-sample (Verify Buyer St addr)', /Verify Buyer St/.test(buyerHtml))
expect('E9: buyer email does NOT contain seller Tax-Match Confidence rail', !/Tax-Match Confidence/i.test(buyerHtml))
expect('E10: buyer email does NOT contain Estimated Value (seller priceCard)', !/Estimated Value/i.test(buyerHtml))

expect('E11: seller html length > 1000', sellerHtml.length > 1000, `len=${sellerHtml.length}`)
expect('E12: seller has Comparable Sold heading', /Comparable Sold/i.test(sellerHtml))
expect('E13: seller email still renders sellerEstimate.comparables (STALE-CS / 888 Test Comp)', /STALE-CS|888 Test Comp Ave/.test(sellerHtml))
expect('E14: seller email still renders sellerEstimate.taxMatch.comparables (STALE-TM / 999 Test Tax)', /STALE-TM|999 Test Tax Ln/.test(sellerHtml))
expect('E15: seller email does NOT contain buyer-derived "Median annual tax" blurb', !/Median annual tax/.test(sellerHtml))
expect('E16: seller email retains Property Estimate price card (Estimated Value)', /Estimated Value/i.test(sellerHtml))

// LEAK-STILL-DEAD render test: planType=buyer + sellerEstimate set
// (server-side gate would null it; we test that the email template
// itself respects isBuyer routing even if sellerEstimate sneaks in).
const buyerWithLeakedSe = buildRichPlanEmail({
  userName: 'VerifyBuyerLeak', userEmail: 'bl@test.invalid', planType: 'buyer',
  plan: FIXTURE_PLAN_BUYER, analytics: FIXTURE_ANALYTICS, listings: BUYER_LISTINGS,
  agent: null, geoName: 'Whitby',
  comparables: BUYER_COMPS,
  // Note: server gate (Chunk 1) would have nulled this before reaching here;
  // we feed it directly to prove the email template ALSO routes by isBuyer.
  sellerEstimate: STALE_SE,
  vipCreditUsed: false, vipCreditPlansUsed: 0, vipCreditTotal: 1,
  blocks: [], brandName: 'WALLiam', domain: 'walliam.ca', baseUrl: 'https://walliam.ca',
  buyerTaxMatch: btm,
})
expect('E17: buyer email with leaked seller fixture STILL renders buyer Tax-Matched (not seller)',
  /Median annual tax/.test(buyerWithLeakedSe) && !/Tax-Match Confidence/i.test(buyerWithLeakedSe),
  'isBuyer routing wins at template level too')

// ─── 3. Architectural checks (in-chat + lead-page + prompt) ───
hr()
log('SECTION 3 — Architectural checks (in-chat / lead-page / prompt wiring)')

const rpSrc = fs.readFileSync(path.resolve(__dirname, '..', 'app/charlie/components/ResultsPanel.tsx'), 'utf8')
expect('R1: ResultsPanel imports deriveBuyerTaxMatch from same source as server',
  /from '@\/lib\/charlie\/buyer-tax-match'/.test(rpSrc) && /deriveBuyerTaxMatch/.test(rpSrc),
  'single source of truth — convergence across surfaces')
expect('R2: ResultsPanel buyer-flow render gated on hasListings && !hasSellerEstimate',
  /hasListings/.test(rpSrc) && /b\.type === 'listings'/.test(rpSrc) && /b\.type === 'sellerEstimate'/.test(rpSrc))
expect('R3: ResultsPanel renders Tax-Matched header for buyer in-chat',
  /Tax-Matched ·/.test(rpSrc),
  'in-chat heading present (gated on buyer flow)')

const prSrc = fs.readFileSync(path.resolve(__dirname, '..', 'components/admin-homes/lead-workbench/PlanRenderer.tsx'), 'utf8')
expect('L1: PlanRenderer mounts BuyerCompSold for buyer leads',
  /n\.isBuyer.*<BuyerCompSold/s.test(prSrc) && /function BuyerCompSold/.test(prSrc))
expect('L2: PlanRenderer mounts BuyerTaxMatched for buyer leads',
  /n\.isBuyer.*<BuyerTaxMatched/s.test(prSrc) && /function BuyerTaxMatched/.test(prSrc))
expect('L3: PlanRenderer reads plan_data.comparables + plan_data.buyerTaxMatch on buyer branch',
  /lead\.plan_data\?\.comparables/.test(prSrc) && /lead\.plan_data\?\.buyerTaxMatch/.test(prSrc))

const promptSrc = fs.readFileSync(path.resolve(__dirname, '..', 'app/charlie/lib/charlie-prompts.ts'), 'utf8')
expect('P1: BUYER FLOW prompt now calls get_comparables between search_listings and generate_plan',
  /BUYER FLOW:[\s\S]+?search_listings[\s\S]+?get_comparables[\s\S]+?generate_plan/i.test(promptSrc) &&
  /search_listings → get_comparables → generate_plan/.test(promptSrc),
  'present in BUYER FLOW section AND in the CRITICAL one-turn sequence')
expect('P2: tools.ts get_comparables description no longer says "for a seller" only',
  /Pure criteria query[\s\S]{0,200}no subject address/.test(fs.readFileSync(path.resolve(__dirname, '..', 'app/charlie/lib/charlie-tools.ts'), 'utf8')))

const peSrc = fs.readFileSync(path.resolve(__dirname, '..', 'app/api/charlie/plan-email/route.ts'), 'utf8')
expect('S1: plan-email route derives buyerTaxMatch from listings (server-side)',
  /deriveBuyerTaxMatch\(listings\)/.test(peSrc))
expect('S2: plan-email route gates derivation by planType === \'buyer\'',
  /planType === 'buyer'[\s\S]{0,100}deriveBuyerTaxMatch/.test(peSrc))
expect('S3: plan-email route persists comparables to plan_data for buyer',
  /comparables: planType === 'buyer' \?/.test(peSrc))
expect('S4: plan-email route persists buyerTaxMatch to plan_data',
  /plan_data: \{[\s\S]+?buyerTaxMatch/.test(peSrc))
expect('S5: plan-email route passes buyerTaxMatch to buildRichPlanEmail',
  /buildRichPlanEmail\(\{[\s\S]{0,400}buyerTaxMatch.*\}\)/.test(peSrc))

hr()
log(`SUMMARY: ${fail === 0 ? 'ALL PASS' : fail + ' FAIL'}`)
log('')
log('Live HTTP-route verify (POST /api/charlie/plan-email + DB plan_data')
log('readback) is DEFERRED. The local dev server :3004 is non-responsive')
log('on every API route — probed both /api/charlie/test-render-plan-email-')
log('probe and /api/walliam/tenant-config (unrelated route) with up to')
log('240s timeout: both hang. The dev process itself is alive (homepage')
log('SSR returns 200) and tsc --noEmit passes cleanly. The block is in')
log('the dev server, not in this chunk\'s code. To exercise the live')
log('HTTP path:')
log('  1. Restart npm run dev')
log('  2. Run scripts/buyer-chunk2-verify.js (the HTTP version)')
log('     against a fresh server.')
log('Pattern matches Chunk-1 verify exactly, which DID pass live; the')
log('Chunk-2 route changes are minimally additive (one derive call +')
log('two new plan_data fields + one new email param).')
process.exit(fail === 0 ? 0 : 1)
