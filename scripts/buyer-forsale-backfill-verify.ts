// scripts/buyer-forsale-backfill-verify.ts
//
// W-CHARLIE-BUYER-FORSALE-BACKFILL VERIFY — live route POST + DB readback
// + cross-surface DOM render. No source-grep substitute (the prior
// W-CHARLIE-BUYER-FORSALE-MISSING bug shipped because verification
// asserted via static renderToStaticMarkup; this verify drives the
// LIVE /api/charlie/plan-email route with a real chat_session +
// the failing-path payload (listings=[]) and reads back plan_data
// from the DB).

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
const SHOT_DIR = path.join(OUT_DIR, 'buyer-forsale-backfill-screenshots')
const REPORT = path.join(OUT_DIR, 'buyer-forsale-backfill-verify.txt')
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

;(async () => {
  log('W-CHARLIE-BUYER-FORSALE-BACKFILL VERIFY — ' + new Date().toISOString())
  log('local base: ' + BASE)
  hr()

  // Dev server health gate
  try {
    const r = await fetch(`${BASE}/api/walliam/tenant-config`, { headers: { 'x-tenant-id': WALLIAM } })
    if (r.status !== 200) throw new Error('tenant-config returned ' + r.status)
    log(`dev server: 200 — proceeding with LIVE verify.`)
  } catch (e: any) {
    log('FATAL  dev server not serving — restart it before re-running.')
    log('       error: ' + e.message)
    process.exit(2)
  }

  // ─── Get a real test user + session ───
  const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL })
  const c = await pool.connect()
  let testUserId: string, testSessionId: string, sourceKey: string

  try {
    await c.query('BEGIN')
    const u = await c.query(`SELECT id, email FROM auth.users WHERE email LIKE 'testfinal%@gmail.com' OR email LIKE 'finaltest%@gmail.com' ORDER BY created_at DESC LIMIT 1`)
    testUserId = u.rows[0].id
    log(`test user: ${testUserId.slice(0,8)}… (${u.rows[0].email})`)
    const tr = await c.query(`SELECT source_key FROM tenants WHERE id = $1`, [WALLIAM])
    sourceKey = tr.rows[0].source_key
    const sess = await c.query(`SELECT id FROM chat_sessions WHERE user_id = $1 AND tenant_id = $2 AND source = $3 LIMIT 1`, [testUserId, WALLIAM, sourceKey])
    testSessionId = sess.rows[0].id
    log(`chat_session: ${testSessionId}`)
    await c.query('COMMIT')
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {})
    log('FATAL  setup error: ' + (e as any).message)
    process.exit(2)
  }

  // Pre-fetch the CANONICAL for-sale rows so we can assert byte-equivalence
  // between what the backfill returns vs what /api/geo-listings returns
  // directly. Same params the backfill uses.
  log('\nPre-fetch canonical /api/geo-listings for cross-check…')
  // Same params the backfill will assemble in SCENARIO A: geoType
  // municipality, Whitby muni, tab for-sale, propertyCategory homes,
  // budgetMin/Max 600K..900K, beds 3, sort price_asc, pageSize 10.
  const canonicalRes = await fetch(
    `${BASE}/api/geo-listings?` + new URLSearchParams({
      geoType: 'municipality',
      geoId: WHITBY_MUNI,
      tab: 'for-sale',
      page: '1',
      pageSize: '10',
      propertyCategory: 'homes',
      minPrice: '600000',
      maxPrice: '900000',
      beds: '3',
      sort: 'price_asc',
    }).toString(),
    { headers: { 'x-tenant-id': WALLIAM } },
  )
  const canonicalJson = await canonicalRes.json()
  const canonicalListings: any[] = canonicalJson.listings || []
  log(`canonical for-sale rows: ${canonicalListings.length}`)
  if (canonicalListings.length === 0) {
    log('FATAL  /api/geo-listings returned 0 rows for the test geo+budget — can\'t verify backfill.')
    process.exit(2)
  }
  log('canonical sample (first 3):')
  for (const l of canonicalListings.slice(0, 3)) {
    log(`  ${l.listing_key}  ${l.unparsed_address}  $${l.list_price?.toLocaleString?.() || l.list_price}  ${l.property_subtype}`)
  }

  // ═══════════════════ SCENARIO A — FAILING PATH (backfill should fire) ═══════════════════
  hr()
  log('SCENARIO A — POST with listings=[] (failing path; backfill fires)')
  const postA = await fetch(`${BASE}/api/charlie/plan-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': WALLIAM, 'host': 'walliam.ca' },
    body: JSON.stringify({
      sessionId: testSessionId,
      userId: testUserId,
      planType: 'buyer',
      plan: { type: 'buyer', planReady: true, geoName: 'Whitby', budgetMax: 900000, budgetMin: 600000, propertyType: 'homes', bedrooms: 3, timeline: 'flexible', summary: 'W-CHARLIE-BUYER-FORSALE-BACKFILL verify scenario A — failing path.' },
      analytics: { sale_to_list_ratio: 96.79, closed_avg_dom_90: 20, active_count: 250, closed_sale_count_90: 137, absorption_rate_pct: 36, track: 'homes', avg_concession_pct: 3.21 },
      listings: [],                                    // ← THE EMPTY (failing path)
      geoContext: { geoType: 'municipality', geoId: WHITBY_MUNI, geoName: 'Whitby' },
      comparables: [],
      sellerEstimate: null,
      vipCreditUsed: false, vipCreditPlansUsed: 0, vipCreditTotal: 1,
      blocks: [],
    }),
  })
  const respA = await postA.json()
  log(`  status: ${postA.status}  userEmailSent=${respA.userEmailSent}  chainEmailSent=${respA.chainEmailSent}`)
  await new Promise(r => setTimeout(r, 600))   // give lead INSERT a moment

  // Read back the most recent lead
  const c2 = await pool.connect()
  let leadA: any
  try {
    await c2.query('BEGIN READ ONLY')
    const r = await c2.query(`
      SELECT id, plan_data
        FROM leads
       WHERE user_id = $1 AND tenant_id = $2 AND intent = 'buyer'
       ORDER BY created_at DESC LIMIT 1`,
      [testUserId, WALLIAM])
    leadA = r.rows[0]
    await c2.query('ROLLBACK')
  } finally { c2.release() }

  log(`  lead: ${leadA.id}`)
  const topA: any[] = leadA.plan_data?.topListings || []
  const btmA = leadA.plan_data?.buyerTaxMatch
  log(`  plan_data.topListings: length=${topA.length}`)
  log(`  plan_data.buyerTaxMatch: isEmpty=${btmA?.isEmpty}, samples=${(btmA?.samples||[]).length}, bandCenter=${btmA?.bandCenter}, reason=${JSON.stringify(btmA?.reason)}`)
  for (const l of topA.slice(0, 3)) log(`    ${l.listing_key}  ${l.unparsed_address}  $${l.list_price}`)

  expect('A1 plan_data.topListings has rows (backfill ran)', topA.length > 0, `length=${topA.length}`)
  expect('A2 plan_data.topListings count ≤ 10 (slice cap respected)', topA.length <= 10, `length=${topA.length}`)
  expect('A3 every backfilled row carries the canonical mls_listings shape (listing_key + unparsed_address + list_price)',
    topA.every(l => l.listing_key && l.unparsed_address && (l.list_price != null)))
  expect('A4 every backfilled row carries _slug (Charlie-stamped — search_listings-equivalent shape)',
    topA.every(l => typeof l._slug === 'string' && l._slug.length > 0),
    'sample _slugs: ' + topA.slice(0,3).map(l => l._slug).join(' | '))
  expect('A5 backfilled rows match canonical /api/geo-listings result (cross-check)',
    topA.length > 0 &&
    canonicalListings.slice(0, topA.length).every((c: any, i: number) => c.listing_key === topA[i].listing_key))
  expect('A6 backfilled rows are REAL active Whitby listings (DB cross-check on listing_keys)',
    true /* assertion run below */,
    'see DB cross-check')
  // DB-side cross-check
  const c3 = await pool.connect()
  try {
    await c3.query('BEGIN READ ONLY')
    const keys = topA.map(l => l.listing_key)
    const r = await c3.query(`SELECT listing_key, standard_status, municipality_id FROM mls_listings WHERE listing_key = ANY($1::text[])`, [keys])
    const allActive = r.rows.every(row => row.standard_status === 'Active' || row.standard_status === 'Active Under Contract' || row.standard_status === 'Pending')
    const allWhitby = r.rows.every(row => row.municipality_id === WHITBY_MUNI)
    expect('A6 backfilled rows are real Active rows in Whitby (DB cross-check)',
      r.rowCount === topA.length && allActive && allWhitby,
      `db rows=${r.rowCount}/${topA.length}, allActive=${allActive}, allWhitby=${allWhitby}`)
    await c3.query('ROLLBACK')
  } finally { c3.release() }

  expect('A7 buyerTaxMatch repopulated (band+samples) from backfilled topListings',
    btmA != null && !btmA.isEmpty && (btmA.samples || []).length > 0,
    `isEmpty=${btmA?.isEmpty} samples=${(btmA?.samples||[]).length} bandCenter=${btmA?.bandCenter}`)
  expect('A8 buyerTaxMatch.taxBand derived from the backfill (low+high present)',
    btmA?.taxBand != null && typeof btmA.taxBand.low === 'number' && typeof btmA.taxBand.high === 'number')

  // ═══════════════════ SCENARIO B — IN-ORDER PATH (no backfill) ═══════════════════
  hr()
  log('SCENARIO B — POST with listings populated (in-order path; backfill is a no-op)')
  const inOrderListings = canonicalListings.slice(0, 5).map((l: any) => ({ ...l, _slug: `/${l.listing_key.toLowerCase()}-prepush` }))   // distinguishable _slug
  const postB = await fetch(`${BASE}/api/charlie/plan-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': WALLIAM, 'host': 'walliam.ca' },
    body: JSON.stringify({
      sessionId: testSessionId,
      userId: testUserId,
      planType: 'buyer',
      plan: { type: 'buyer', planReady: true, geoName: 'Whitby', budgetMax: 900000, budgetMin: 600000, propertyType: 'homes', bedrooms: 3, timeline: 'flexible', summary: 'Scenario B — in-order listings already populated; backfill should NOT run.' },
      analytics: { sale_to_list_ratio: 96.79, closed_avg_dom_90: 20, active_count: 250, closed_sale_count_90: 137, absorption_rate_pct: 36, track: 'homes', avg_concession_pct: 3.21 },
      listings: inOrderListings,                       // ← populated
      geoContext: { geoType: 'municipality', geoId: WHITBY_MUNI, geoName: 'Whitby' },
      comparables: [],
      sellerEstimate: null,
      vipCreditUsed: false, vipCreditPlansUsed: 0, vipCreditTotal: 1,
      blocks: [],
    }),
  })
  const respB = await postB.json()
  log(`  status: ${postB.status}  userEmailSent=${respB.userEmailSent}`)
  await new Promise(r => setTimeout(r, 600))

  const c4 = await pool.connect()
  let leadB: any
  try {
    await c4.query('BEGIN READ ONLY')
    const r = await c4.query(`SELECT id, plan_data FROM leads WHERE user_id = $1 AND tenant_id = $2 AND intent = 'buyer' ORDER BY created_at DESC LIMIT 1`, [testUserId, WALLIAM])
    leadB = r.rows[0]
    await c4.query('ROLLBACK')
  } finally { c4.release() }

  const topB = leadB.plan_data?.topListings || []
  log(`  plan_data.topListings: length=${topB.length}`)
  log(`  first _slug: ${topB[0]?._slug}`)

  expect('B1 in-order listings preserved (no double-query)', topB.length === inOrderListings.length, `length=${topB.length}`)
  expect('B2 in-order rows retained their distinguishable _slug suffix (backfill did NOT overwrite)',
    topB.every((l: any) => l._slug?.endsWith?.('-prepush')),
    `_slug check: ${topB.slice(0,2).map((l:any)=>l._slug).join(' | ')}`)

  // ═══════════════════ SCENARIO C — SELLER PATH (no backfill, never) ═══════════════════
  hr()
  log('SCENARIO C — SELLER POST (backfill is buyer-only; seller path untouched)')
  const stale_se = {
    estimate: { estimatedPrice: 880000, priceRange: { low: 850000, high: 910000 }, bestGeoTier: 'community', tiers: { community: { count: 5, median: 880000 } }, taxMatch: { comparables: [] } },
    comparables: [{ listingKey: 'STALE-CS-1', closePrice: 870000, unparsedAddress: '888 Stale Comp Ave, Pickering' }],
    competingListings: [], buildingName: null, subjectAddress: '606 Aspen', geoLevel: 'community', intent: 'sale', path: 'home',
  }
  const postC = await fetch(`${BASE}/api/charlie/plan-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': WALLIAM, 'host': 'walliam.ca' },
    body: JSON.stringify({
      sessionId: testSessionId,
      userId: testUserId,
      planType: 'seller',
      plan: { type: 'seller', planReady: true, geoName: 'Pickering', propertyType: 'homes', estimatedValueMin: 850000, estimatedValueMax: 910000, timeline: 'flexible', goal: 'maximize', summary: 'Seller verify scenario.' },
      analytics: { sale_to_list_ratio: 99, closed_avg_dom_90: 18, track: 'homes' },
      listings: [],
      geoContext: { geoType: 'municipality', geoId: '94447f26-216a-47be-ac73-d07f33732036', geoName: 'Pickering' },
      comparables: [],
      sellerEstimate: stale_se,
      vipCreditUsed: false, vipCreditPlansUsed: 0, vipCreditTotal: 1,
      blocks: [],
    }),
  })
  const respC = await postC.json()
  log(`  status: ${postC.status}  userEmailSent=${respC.userEmailSent}`)
  await new Promise(r => setTimeout(r, 600))

  const c5 = await pool.connect()
  let leadC: any
  try {
    await c5.query('BEGIN READ ONLY')
    const r = await c5.query(`SELECT id, plan_data FROM leads WHERE user_id = $1 AND tenant_id = $2 AND intent = 'seller' ORDER BY created_at DESC LIMIT 1`, [testUserId, WALLIAM])
    leadC = r.rows[0]
    await c5.query('ROLLBACK')
  } finally { c5.release() }

  const topC = leadC.plan_data?.topListings || []
  log(`  seller plan_data.topListings: length=${topC.length}`)
  log(`  seller plan_data.sellerEstimate IS object: ${!!leadC.plan_data?.sellerEstimate}`)

  expect('C1 SELLER plan topListings UNCHANGED (backfill is buyer-only — stays empty for seller)',
    topC.length === 0,
    `length=${topC.length}`)
  expect('C2 SELLER plan_data.sellerEstimate intact (seller path no-regression)',
    leadC.plan_data?.sellerEstimate?.estimate?.estimatedPrice === 880000)

  // ═══════════════════ EMAIL RENDER ═══════════════════
  hr()
  log('EMAIL render (via test-render-plan-email-probe, using SCENARIO A\'s effective listings)')
  const emailRes = await fetch(`${BASE}/api/charlie/test-render-plan-email-probe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userName: 'BFV', userEmail: 'bfv@test.invalid', planType: 'buyer',
      plan: { type: 'buyer', geoName: 'Whitby', budgetMax: 900000, budgetMin: 600000, propertyType: 'homes', bedrooms: 3 },
      analytics: { sale_to_list_ratio: 96.79, closed_avg_dom_90: 20, track: 'homes', avg_concession_pct: 3.21 },
      listings: topA,                                  // ← what backfill produced
      geoName: 'Whitby',
      comparables: [], sellerEstimate: null,
      vipCreditUsed: false, vipCreditPlansUsed: 0, vipCreditTotal: 1,
      blocks: [], brandName: 'WALLiam', domain: 'walliam.ca', baseUrl: 'https://walliam.ca',
      buyerTaxMatch: btmA,
    }),
  })
  const emailJson = await emailRes.json()
  const emailHtml: string = emailJson?.html || ''
  fs.writeFileSync(path.resolve(OUT_DIR, 'buyer-forsale-backfill-email.html'), emailHtml)

  expect('E1 EMAIL renders "For Sale" header (Chunk-narration label intact)',
    /For Sale \(\d+\)/.test(emailHtml))
  expect('E2 EMAIL includes ≥1 real backfilled address',
    topA.slice(0, 3).some((l: any) => emailHtml.includes((l.unparsed_address || '').split(',')[0])))
  expect('E3 EMAIL Tax-Matched renders SOLD-comp framing (Chunk-4 intact)',
    /Recently sold homes matched by property-tax band/.test(emailHtml))

  // ═══════════════════ LEAD-PAGE render (renderToStaticMarkup) ═══════════════════
  hr()
  log('LEAD-PAGE render via renderToStaticMarkup(PlanTab) with the backfilled lead')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { jsx } = await import('react/jsx-runtime')
  const { default: PlanTab } = await import('../components/admin-homes/lead-workbench/PlanRenderer')
  const leadView: any = {
    id: leadA.id, contact_name: 'Backfill Buyer', contact_email: 'bfv@test.invalid',
    intent: 'buyer', geo_name: 'Whitby', source: 'walliam_charlie', source_url: null,
    created_at: new Date().toISOString(), agents: null,
    plan_data: leadA.plan_data,
  }
  const leadHtml: string = renderToStaticMarkup(jsx(PlanTab as any, { anchorLead: leadView, leadFamily: [leadView] }))
  fs.writeFileSync(path.resolve(OUT_DIR, 'buyer-forsale-backfill-lead.html'), leadHtml)

  expect('L1 LEAD renders "For Sale" header',
    /For Sale \(\d+\)/.test(leadHtml))
  expect('L2 LEAD shows ≥1 backfilled address',
    topA.slice(0, 3).some((l: any) => leadHtml.includes((l.unparsed_address || '').split(',')[0])))
  expect('L3 LEAD stats sections intact (Market Intel / Offer Intel / Strategy Summary)',
    /Market Intelligence/i.test(leadHtml) && /Offer Intelligence/i.test(leadHtml))

  // ═══════════════════ IN-CHAT tile probe no-regression ═══════════════════
  hr()
  log('IN-CHAT tile probe (Chunk 2b/3/4 no-regression)')
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 1800 } })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/test-comparable-tile-probe`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForSelector('[data-testid="buyer-section"]', { timeout: 30000 })
  await page.screenshot({ path: path.join(SHOT_DIR, '1-tile-probe.png'), fullPage: true })
  const buyerText = await page.locator('[data-testid="buyer-section"]').innerText()
  expect('I1 IN-CHAT ComparableCard probe still renders populated tile',
    buyerText.includes('101 Buyer Snake St') && buyerText.includes('$705,000'))
  await browser.close()

  // ═══════════════════ TENANT SCOPE evidence ═══════════════════
  hr()
  log('TENANT SCOPE — grep added backfill code for x-tenant-id forwarding')
  const peSrc = fs.readFileSync(path.resolve(__dirname, '..', 'app/api/charlie/plan-email/route.ts'), 'utf8')
  expect('T1 backfill reads route\'s resolved x-tenant-id from req.headers',
    /req\.headers\.get\('x-tenant-id'\)/.test(peSrc))
  expect('T2 backfill forwards x-tenant-id header on the geo-listings fetch',
    /fetch\(url, \{[\s\S]+?headers: \{ 'x-tenant-id': _resolvedTenantHeader \}/.test(peSrc),
    'header propagated through middleware so /api/geo-listings runs in the tenant\'s authority')
  expect('T3 backfill is gated by planType === \'buyer\' (seller path untouched)',
    /planType === 'buyer' &&[\s\S]+?effectiveListings\.length === 0[\s\S]+?geoContext\?\.geoType[\s\S]+?plan\?\.budgetMax/.test(peSrc))

  // ═══════════════════ Byte-unchanged scope ═══════════════════
  hr()
  log('Byte-unchanged scope (Chunk touches ONLY plan-email/route.ts)')
  function unchanged(fp: string) {
    try { execSync(`git diff --quiet HEAD -- "${fp}"`, { stdio: 'pipe' }); return true } catch { return false }
  }
  for (const fp of [
    'lib/charlie/buyer-tax-match.ts',
    'lib/estimator/tax-band-sold-query.ts',
    'lib/estimator/home-comparable-matcher-sales.ts',
    'lib/estimator/condo-comparable-matcher-sales.ts',
    'app/charlie/components/ResultsPanel.tsx',
    'components/admin-homes/lead-workbench/PlanRenderer.tsx',
    'lib/email/charlie-plan-email-html.ts',
    'app/charlie/hooks/useCharlie.ts',
    'app/charlie/lib/charlie-prompts.ts',
    'app/charlie/lib/charlie-tools.ts',
    'app/charlie/components/ComparableCard.tsx',
    'components/dashboard/CharlieLeadEstimate.tsx',
    'app/charlie/components/SellerEstimateBlock.tsx',
    'app/api/charlie/seller-estimate/route.ts',
    'app/api/charlie/buyer-tax-match/route.ts',
    'lib/charlie/buyer-narration.ts',
    'app/api/charlie/route.ts',
  ]) {
    expect(`U: ${fp} byte-unchanged`, unchanged(fp))
  }

  await pool.end()
  hr()
  log(`SUMMARY: ${fail === 0 ? 'ALL PASS' : fail + ' FAIL'}`)
  log(`screenshot: ${SHOT_DIR}/1-tile-probe.png`)
  process.exit(fail === 0 ? 0 : 1)
})().catch(e => { log('UNHANDLED: ' + (e?.stack || e)); process.exit(2) })
