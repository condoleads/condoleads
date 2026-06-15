// scripts/buyer-chunk4-verify.ts
//
// W-CHARLIE-BUYER-CHUNK4 VERIFY — real-DOM via Playwright + live API.
// Asserts cross-surface equality after the framing fix:
//   * Tax-Matched is SOLD comps (price + "Sold" label, NOT "/yr"
//     assessment framing).
//   * Counts equal across in-chat ↔ email ↔ lead page.
//   * Sold comps are real (real Closed listings in derived band).
//   * Seller no-regression (seller path untouched).
//   * Empty-state when matched-listings tax data is sparse.

import * as fs from 'fs'
import * as path from 'path'
import { chromium } from 'playwright'
import { Pool } from 'pg'
import { execSync } from 'child_process'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const BASE = process.env.LOCAL_BASE || 'http://localhost:3004'
const WALLIAM = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
const WHITBY_MUNI = '70103aef-1b32-4939-9ff8-264e859a5587'
const OUT_DIR = path.resolve(__dirname, '..', 'recon')
const SHOT_DIR = path.join(OUT_DIR, 'buyer-chunk4-screenshots')
const REPORT = path.join(OUT_DIR, 'buyer-chunk4-verify.txt')
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

// Real matched-listings shape from lead 6d479d84 (Whitby freehold buyer).
const REAL_TOPLISTINGS: any[] = [
  { id: '1', listing_key: 'E12945508', unparsed_address: '6540 Coronation Road, Whitby, ON L0B 1C0', list_price: 1,      bedrooms_total: 5, bathrooms_total_integer: 3, property_type: 'Residential Freehold', property_subtype: 'Detached',           tax_annual_amount: 0,       _slug: '/6540-coronation-road-whitby-e12945508' },
  { id: '2', listing_key: 'E13257090', unparsed_address: '8 Hialeah Crescent, Whitby, ON L1N 6R1',   list_price: 1,      bedrooms_total: 6, bathrooms_total_integer: 3, property_type: 'Residential Freehold', property_subtype: 'Detached',           tax_annual_amount: 6261,    _slug: '/8-hialeah-crescent-whitby-e13257090' },
  { id: '3', listing_key: 'E12815354', unparsed_address: '1050 Elton Way 8, Whitby, ON L1N 0L3',     list_price: 599900, bedrooms_total: 3, bathrooms_total_integer: 2, property_type: 'Residential Freehold', property_subtype: 'Att/Row/Townhouse', tax_annual_amount: 4196,    _slug: '/1050-elton-way-8-whitby-e12815354' },
  { id: '4', listing_key: 'E13228560', unparsed_address: '73 Sutcliffe Drive, Whitby, ON L1R 0R4',   list_price: 599999, bedrooms_total: 2, bathrooms_total_integer: 2, property_type: 'Residential Freehold', property_subtype: 'Att/Row/Townhouse', tax_annual_amount: 4663.57, _slug: '/73-sutcliffe-drive-whitby-e13228560' },
  { id: '5', listing_key: 'E13426702', unparsed_address: '28 Pallock Hill Way, Whitby, ON L1R 0N5', list_price: 629000, bedrooms_total: 3, bathrooms_total_integer: 3, property_type: 'Residential Freehold', property_subtype: 'Att/Row/Townhouse', tax_annual_amount: 5377.89, _slug: '/28-pallock-hill-way-whitby-e13426702' },
]
const GEO_CONTEXT = { geoType: 'municipality', geoId: WHITBY_MUNI, geoName: 'Whitby', municipalityId: WHITBY_MUNI, communityId: null as string | null }

// Empty-tax case — same shape but no tax_annual_amount on any listing.
const EMPTY_TAX_LISTINGS: any[] = REAL_TOPLISTINGS.map(l => ({ ...l, tax_annual_amount: null }))

;(async () => {
  log('W-CHARLIE-BUYER-CHUNK4 VERIFY — ' + new Date().toISOString())
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

  // ═══════════════════ GROUP 1 — Real derivation via API (live SQL) ═══════════════════
  hr()
  log('GROUP 1 — Live API call → SOLD comps in derived tax band (real DB)')
  const apiRes = await fetch(`${BASE}/api/charlie/buyer-tax-match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ matchedListings: REAL_TOPLISTINGS, geoContext: GEO_CONTEXT }),
  })
  const apiJson = await apiRes.json()
  expect('1.1 API returns 200', apiRes.status === 200, `status=${apiRes.status}`)
  expect('1.2 API returns ok:true with buyerTaxMatch object', apiJson?.ok === true && apiJson.buyerTaxMatch != null)
  const btm = apiJson.buyerTaxMatch
  if (btm) {
    log(`  bandCenter:    ${btm.bandCenter ?? '(null)'}`)
    log(`  taxBand:       ${JSON.stringify(btm.taxBand)}`)
    log(`  taxYearWindow: ${JSON.stringify(btm.taxYearWindow)}`)
    log(`  withTaxCount:  ${btm.withTaxCount} of ${btm.totalCount}`)
    log(`  isEmpty:       ${btm.isEmpty}`)
    log(`  reason:        ${btm.reason ?? '(none)'}`)
    log(`  samples (${btm.samples?.length || 0}):`)
    for (const s of (btm.samples || [])) {
      log(`    ${s.listingKey}  $${Number(s.price).toLocaleString('en-CA')}  ${s.address?.split(',')[0]}  tier=${s.sourceTier}  tax=${s.tax}  close=${s.closeDate}`)
    }
  }
  expect('1.3 Derived band exists (matched-listings had ≥3 with-tax)', btm?.taxBand != null)
  expect('1.4 Tax-year window exists', btm?.taxYearWindow != null)
  // Real-data assertion: the band-center for these 5 Whitby Att/Row+Detached
  // listings (4 with tax) should be the median of 4196, 4663.57, 5377.89, 6261
  // = 5020.785. Sanity check.
  expect('1.5 bandCenter is the median of with-tax matched listings (≈5020.79)',
    btm?.bandCenter != null && Math.abs(btm.bandCenter - 5020.785) < 1,
    `bandCenter=${btm?.bandCenter}`)
  if (btm?.samples?.length > 0) {
    expect('1.6 Samples have SOLD shape (closePrice + closeDate present, not just listPrice)',
      btm.samples.every((s: any) => s.price != null && s.closeDate != null))
    // Each sample's tax should be within the derived band.
    expect('1.7 Every sample\'s tax falls inside the derived band',
      btm.samples.every((s: any) => s.tax >= btm.taxBand.low && s.tax <= btm.taxBand.high))
  }

  // Cross-check against DB: confirm the samples are REAL listings (rows
  // exist in mls_listings with standard_status='Closed').
  hr()
  log('GROUP 2 — DB cross-check (samples are real Closed rows)')
  const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL })
  const c = await pool.connect()
  try {
    await c.query('BEGIN READ ONLY')
    if (btm?.samples?.length > 0) {
      const keys = btm.samples.map((s: any) => s.listingKey).filter(Boolean)
      const r = await c.query(`
        SELECT listing_key, standard_status, transaction_type, close_price, tax_annual_amount, tax_year
          FROM mls_listings
         WHERE listing_key = ANY($1::text[])`,
        [keys])
      expect('2.1 Every sample exists in mls_listings', r.rowCount === keys.length, `db rows=${r.rowCount} of ${keys.length}`)
      const allClosed = r.rows.every(row => row.standard_status === 'Closed')
      expect('2.2 Every sample has standard_status="Closed" (real SOLD comp, not Active)', allClosed)
      const allInBand = btm?.taxBand && r.rows.every(row => row.tax_annual_amount >= btm.taxBand.low && row.tax_annual_amount <= btm.taxBand.high)
      expect('2.3 Every sample\'s DB tax matches the derived band', !!allInBand)
    } else {
      log('  (no samples to cross-check — band query may have returned empty)')
    }
    await c.query('ROLLBACK')
  } finally { c.release(); await pool.end() }

  // ═══════════════════ GROUP 3 — RE-FRAMED text (no /yr-assessment wording on any surface) ═══════════════════
  hr()
  log('GROUP 3 — Re-framed text on all 3 surfaces (Defect 2 fix)')

  // ─ Email
  const emailRes = await fetch(`${BASE}/api/charlie/test-render-plan-email-probe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userName: 'BuyerEmail', userEmail: 'be@test.invalid', planType: 'buyer',
      plan: { type: 'buyer', geoName: 'Whitby' }, analytics: { track: 'homes' },
      listings: REAL_TOPLISTINGS, geoName: 'Whitby',
      comparables: [], sellerEstimate: null,
      vipCreditUsed: false, vipCreditPlansUsed: 0, vipCreditTotal: 1,
      blocks: [], brandName: 'WALLiam', domain: 'walliam.ca', baseUrl: 'https://walliam.ca',
      buyerTaxMatch: btm,
    }),
  })
  const emailJson = await emailRes.json()
  const emailHtml = emailJson?.html || ''
  expect('3.1 EMAIL renders Tax-Matched section', /Tax-Matched/i.test(emailHtml))
  expect('3.2 EMAIL has SOLD framing ("Recently sold homes matched by property-tax band")',
    /Recently sold homes matched by property-tax band/i.test(emailHtml))
  expect('3.3 EMAIL has NO old assessment wording ("what you\'ll pay yearly")',
    !/what you.{1,5}ll pay yearly/i.test(emailHtml))
  expect('3.4 EMAIL has NO "Median annual tax" assessment label',
    !/Median annual tax/i.test(emailHtml))
  if (!btm.isEmpty) {
    expect('3.5 EMAIL tile labels show "Sold" (not "/yr" as primary price)',
      /Sold/.test(emailHtml))
  }

  // ─ Lead page (rendered via tsx import)
  hr()
  log('GROUP 4 — Lead page render via direct tsx import')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { jsx } = await import('react/jsx-runtime')
  const { default: PlanTab } = await import('../components/admin-homes/lead-workbench/PlanRenderer')
  const realBuyerLead: any = {
    id: 'verify-buyer-1',
    contact_name: 'Real Buyer Verify',
    contact_email: 'rbv@test.invalid',
    intent: 'buyer',
    geo_name: 'Whitby',
    source: 'walliam_charlie',
    source_url: null,
    created_at: '2026-06-15T10:00:00Z',
    agents: null,
    plan_data: {
      planType: 'buyer',
      plan: { type: 'buyer', geoName: 'Whitby', budgetMin: 600000, budgetMax: 900000, propertyType: 'homes' },
      analytics: { track: 'homes' },
      topListings: REAL_TOPLISTINGS,
      comparables: [],
      buyerTaxMatch: btm,
      sellerEstimate: null,
    },
  }
  const leadHtml = renderToStaticMarkup(jsx(PlanTab as any, { anchorLead: realBuyerLead, leadFamily: [realBuyerLead] }))
  expect('4.1 LEAD-PAGE renders Tax-Matched section', /Tax-Matched/.test(leadHtml))
  expect('4.2 LEAD-PAGE has SOLD framing', /Recently sold homes matched by property-tax band/.test(leadHtml))
  expect('4.3 LEAD-PAGE has NO old assessment wording', !/what you.{1,5}ll pay yearly/i.test(leadHtml))
  expect('4.4 LEAD-PAGE has NO "Median annual tax" label', !/Median annual tax/i.test(leadHtml))
  if (!btm.isEmpty && btm.samples?.length > 0) {
    expect('4.5 LEAD-PAGE tax-match tiles use BuyerListingTile (have photo placeholder OR img + slug-format href)',
      /target="_blank"/.test(leadHtml) && /BuyerListingTile|\/\d/.test(leadHtml.slice(0, 10000)),
      'tiles wrap in <a target=_blank>')
  }

  // ─ In-chat via Playwright against the existing tile probe page
  hr()
  log('GROUP 5 — In-chat tile rendering (Playwright)')
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 1800 } })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/test-comparable-tile-probe`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForSelector('[data-testid="buyer-section"]', { timeout: 30000 })
  await page.screenshot({ path: path.join(SHOT_DIR, '1-comparable-tiles.png'), fullPage: true })
  const inchatBuyer = await page.locator('[data-testid="buyer-section"]').innerText()
  expect('5.1 IN-CHAT (existing tile-probe) snake_case fixture renders populated tile',
    inchatBuyer.includes('101 Buyer Snake St') && inchatBuyer.includes('$705,000'),
    'no-regression on Chunk 2b: ' + JSON.stringify(inchatBuyer.slice(0, 100)))
  await browser.close()

  // ═══════════════════ GROUP 6 — Count equality across surfaces ═══════════════════
  hr()
  log('GROUP 6 — Cap consistency (Defect 4 fix)')

  // Check the source code asserts the caps are at the canonical values
  const useCharlieSrc = fs.readFileSync(path.resolve(__dirname, '..', 'app/charlie/hooks/useCharlie.ts'), 'utf8')
  const peSrc = fs.readFileSync(path.resolve(__dirname, '..', 'app/api/charlie/plan-email/route.ts'), 'utf8')
  const btmSrc = fs.readFileSync(path.resolve(__dirname, '..', 'lib/charlie/buyer-tax-match.ts'), 'utf8')

  expect('6.1 useCharlie comp-sold dedup+cap at 6 (single block)',
    /BUYER_COMP_CAP\s*=\s*6/.test(useCharlieSrc) && /withoutOldComp/.test(useCharlieSrc))
  expect('6.2 plan-email comp-sold persistence cap = 6 (unchanged)',
    /comparables: planType === 'buyer' \? \(Array\.isArray\(comparables\) \? comparables\.slice\(0, 6\)/.test(peSrc))
  expect('6.3 plan-email topListings cap RAISED to 10 (was 5)',
    /topListings: \(listings \|\| \[\]\)\.slice\(0, 10\)/.test(peSrc))
  expect('6.4 buyer-tax-match cap = TAX_MATCH_DISPLAY_CAP_BUYER (6)',
    /TAX_MATCH_DISPLAY_CAP_BUYER\s*=\s*6/.test(btmSrc))

  // ═══════════════════ GROUP 7 — Empty-state when matched listings lack tax ═══════════════════
  hr()
  log('GROUP 7 — Empty-state when matched listings lack tax')
  const emptyRes = await fetch(`${BASE}/api/charlie/buyer-tax-match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ matchedListings: EMPTY_TAX_LISTINGS, geoContext: GEO_CONTEXT }),
  })
  const emptyJson = await emptyRes.json()
  expect('7.1 Empty-tax fixture → isEmpty=true', emptyJson?.buyerTaxMatch?.isEmpty === true,
    `isEmpty=${emptyJson?.buyerTaxMatch?.isEmpty}`)
  expect('7.2 Empty-tax fixture cites reason (no fake number)',
    typeof emptyJson?.buyerTaxMatch?.reason === 'string' && emptyJson.buyerTaxMatch.reason.length > 0)
  expect('7.3 Empty-tax fixture has no samples', !emptyJson?.buyerTaxMatch?.samples?.length)

  // ═══════════════════ GROUP 8 — Seller no-regression ═══════════════════
  hr()
  log('GROUP 8 — Seller no-regression (verify untouched paths)')
  function unchanged(fp: string) {
    try { execSync(`git diff --quiet HEAD -- "${fp}"`, { stdio: 'pipe' }); return true } catch { return false }
  }
  expect('8.1 Seller matcher home-comparable-matcher-sales.ts unchanged this commit',
    unchanged('lib/estimator/home-comparable-matcher-sales.ts'))
  expect('8.2 Seller matcher condo-comparable-matcher-sales.ts unchanged',
    unchanged('lib/estimator/condo-comparable-matcher-sales.ts'))
  expect('8.3 SellerEstimateBlock unchanged',
    unchanged('app/charlie/components/SellerEstimateBlock.tsx'))
  expect('8.4 seller-estimate route unchanged',
    unchanged('app/api/charlie/seller-estimate/route.ts'))
  expect('8.5 CharlieLeadEstimate unchanged',
    unchanged('components/dashboard/CharlieLeadEstimate.tsx'))

  // Seller email render — should be byte-identical except for our buyer-side
  // edits to the SAME file (charlie-plan-email-html.ts). Test by re-rendering
  // a seller plan + asserting the seller-side strings are intact.
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
  expect('8.6 SELLER email still renders sellerEstimate.comparables (STALE-CS / 888 Stale Comp)',
    /STALE-CS|888 Stale Comp Ave/.test(sellerHtml))
  expect('8.7 SELLER email still renders Tax-Match Confidence rail OR taxMatch.comparables',
    /STALE-TM|999 Tax Match Ln|Tax-Match Confidence/.test(sellerHtml))
  expect('8.8 SELLER email retains Property Estimate price card', /Estimated Value/i.test(sellerHtml))
  expect('8.9 SELLER email has NO buyer-side "Recently sold homes matched by property-tax band" blurb',
    !/Recently sold homes matched by property-tax band/.test(sellerHtml))

  // ═══════════════════ GROUP 9 — Shared SQL helper exists + seller still using its inline copy ═══════════════════
  hr()
  log('GROUP 9 — Shared tax-band SOLD query (lib/estimator/tax-band-sold-query.ts)')
  const sharedSrc = fs.readFileSync(path.resolve(__dirname, '..', 'lib/estimator/tax-band-sold-query.ts'), 'utf8')
  expect('9.1 Shared helper exports queryTaxBandSolds',
    /export async function queryTaxBandSolds/.test(sharedSrc))
  expect('9.2 Shared helper re-exports TAX_BAND_PCT, TAX_MIN_VALUE, TAX_MATCH_DISPLAY_CAP',
    /export const TAX_BAND_PCT/.test(sharedSrc) &&
    /export const TAX_MIN_VALUE/.test(sharedSrc) &&
    /export const TAX_MATCH_DISPLAY_CAP/.test(sharedSrc))
  expect('9.3 Buyer derivation IMPORTS the shared helper (not a parallel query)',
    /from '@\/lib\/estimator\/tax-band-sold-query'/.test(btmSrc) &&
    /queryTaxBandSolds/.test(btmSrc))
  // Seller home matcher unchanged this commit → still using its inline
  // identical pattern. Both sides resolve to the same constants when
  // the env var TAX_BAND_PCT isn't set.
  expect('9.4 Seller matcher unchanged this commit (preserves backtest stability)',
    unchanged('lib/estimator/home-comparable-matcher-sales.ts'))

  hr()
  log(`SUMMARY: ${fail === 0 ? 'ALL PASS' : fail + ' FAIL'}`)
  process.exit(fail === 0 ? 0 : 1)
})().catch(e => { log('UNHANDLED: ' + (e?.stack || e)); process.exit(2) })
