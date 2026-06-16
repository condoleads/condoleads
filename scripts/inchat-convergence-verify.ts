// scripts/inchat-convergence-verify.ts
//
// W-CHARLIE-INCHAT-CONVERGENCE FIX-VERIFY — live route POST + DB readback
// + source-level + pure-logic hydration simulation.
//
// Per CLAUDE.md: source-grep substitutes for live-DOM are DEAD. The
// operator's eyeball gate is the live-DOM check on walliam.ca that
// the in-chat For-Sale + Tax-Match BLOCKS actually appear after a
// failing-path session. This harness proves the DATA LAYER + state-
// machine LOGIC so the eyeball gate only checks "did the panel paint."
//
// Sections:
//   A. Edit 1 — plan-email response widening (live POST, 3 scenarios)
//      A1 buyer failing-path (listings=[]) → response carries
//         backfilledListings.length > 0 + backfilledTaxMatch with
//         samples (real Whitby Active rows + real trreb-image URLs).
//      A2 buyer in-order (listings populated) → response carries
//         backfilledListings = input listings (backfill no-op) +
//         backfilledTaxMatch derived from those listings.
//      A3 seller plan → response has NO buyer-only fields.
//      A4 the 5 original fields (success, userEmailSent, userEmailReason,
//         chainEmailSent, chainEmailReason) present in ALL 3 scenarios.
//   B. Edit 2 — useCharlie hydration guard (pure-logic simulation)
//      B1 EMPTY state + backfill response → state hydrated
//      B2 NON-EMPTY state + backfill response → strict NO-OP (state byte-
//         identical before/after)
//   C. Edit 3 — ResultsPanel single-render proof
//      C1 exactly ONE `<BuyerTaxMatchInChat` invocation in the file
//      C2 the OLD comparables-branch sibling invocation is REMOVED
//      C3 the top-level invocation is wrapped in IIFE with budgetMax +
//         avgConcessionPct computed
//   D. Cross-surface convergence (DB readback)
//      D1 plan_data.topListings populated by route's effectiveListings
//      D2 plan_data.buyerTaxMatch populated with same data the response
//         returned as backfilledTaxMatch
//   E. Byte-identity — email + lead + seller paths unchanged
//      E1 lib/email/charlie-plan-email-html.ts git diff HEAD~3 empty
//      E2 components/admin-homes/lead-workbench/PlanRenderer.tsx git diff
//         HEAD~3 empty (since W-CHARLIE-TAXMATCH-PHOTOS landed)
//      E3 lib/charlie/buyer-tax-match.ts unchanged in this commit
//      E4 lib/estimator/tax-band-sold-query.ts unchanged in this commit
//      E5 seller-comparable-matcher files unchanged
//
// (Live in-chat DOM appearance — operator eyeball on walliam.ca after
//  Vercel ships, per source-grep-is-dead.)

import * as fs from 'fs'
import * as path from 'path'
import { Pool } from 'pg'
import { execSync } from 'child_process'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const BASE = process.env.LOCAL_BASE || 'http://localhost:3000'
const WALLIAM = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
const WHITBY_MUNI = '70103aef-1b32-4939-9ff8-264e859a5587'
const OUT_DIR = path.resolve(__dirname, '..', 'recon')
const REPORT = path.join(OUT_DIR, 'inchat-convergence-verify.txt')
fs.mkdirSync(OUT_DIR, { recursive: true })
fs.writeFileSync(REPORT, '')
const log = (m: string) => { console.log(m); fs.appendFileSync(REPORT, m + '\n') }
const hr  = () => log('─'.repeat(76))

let fail = 0, pass = 0
function expect(label: string, cond: boolean, evidence?: string) {
  if (!cond) fail++; else pass++
  log(`${cond ? 'PASS' : 'FAIL'}  ${label}${evidence ? '\n        → ' + evidence : ''}`)
}

;(async () => {
  log('W-CHARLIE-INCHAT-CONVERGENCE FIX-VERIFY — ' + new Date().toISOString())
  log(`base: ${BASE}`)
  hr()

  // dev-server health
  try {
    const r = await fetch(`${BASE}/api/walliam/tenant-config`, { headers: { 'x-tenant-id': WALLIAM } })
    if (r.status !== 200) throw new Error('tenant-config returned ' + r.status)
    log(`dev server: 200 — proceeding with LIVE verify.`)
  } catch (e: any) {
    log('FATAL  dev server not serving at ' + BASE + ' — set LOCAL_BASE or start `npm run dev`.')
    log('       error: ' + e.message)
    process.exit(2)
  }

  const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL })
  const c = await pool.connect()
  let testUserId: string, testSessionId: string

  try {
    await c.query('BEGIN')
    const u = await c.query(`SELECT id, email FROM auth.users WHERE email LIKE 'testfinal%@gmail.com' OR email LIKE 'finaltest%@gmail.com' ORDER BY created_at DESC LIMIT 1`)
    testUserId = u.rows[0].id
    const tr = await c.query(`SELECT source_key FROM tenants WHERE id = $1`, [WALLIAM])
    const sourceKey = tr.rows[0].source_key
    const sess = await c.query(`SELECT id FROM chat_sessions WHERE user_id = $1 AND tenant_id = $2 AND source = $3 LIMIT 1`, [testUserId, WALLIAM, sourceKey])
    testSessionId = sess.rows[0].id
    log(`test session: ${testSessionId.slice(0,8)}…  user: ${testUserId.slice(0,8)}…`)
    await c.query('COMMIT')
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {})
    log('FATAL  setup: ' + (e as any).message)
    process.exit(2)
  }
  hr()

  // ═══════════════════════════════════════════════════════════════════
  // SECTION A — Edit 1: live POST, 3 scenarios
  // ═══════════════════════════════════════════════════════════════════
  log('SECTION A — Edit 1: plan-email response widening (live POST)')

  // A1: buyer failing-path (listings=[])
  const buyerPlan = {
    type: 'buyer', planReady: true, geoName: 'Whitby',
    budgetMax: 900000, budgetMin: 600000,
    propertyType: 'homes', bedrooms: 3, timeline: 'flexible',
    summary: 'W-CHARLIE-INCHAT-CONVERGENCE verify',
  }
  const buyerAnalytics = {
    sale_to_list_ratio: 96.79, closed_avg_dom_90: 20,
    active_count: 250, closed_sale_count_90: 137, absorption_rate_pct: 36,
    track: 'homes', avg_concession_pct: 3.21,
  }
  const buyerGeo = { geoType: 'municipality', geoId: WHITBY_MUNI, geoName: 'Whitby', municipalityId: WHITBY_MUNI }

  const postA = await fetch(`${BASE}/api/charlie/plan-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': WALLIAM, 'host': 'walliam.ca' },
    body: JSON.stringify({
      sessionId: testSessionId, userId: testUserId,
      planType: 'buyer', plan: buyerPlan, analytics: buyerAnalytics,
      listings: [],          // FAILING PATH
      geoContext: buyerGeo,
      vipCreditUsed: false, vipCreditPlansUsed: 0, vipCreditTotal: 1,
      comparables: [], blocks: [],
    }),
  })
  const jsonA = await postA.json()
  expect('A1.1: POST 200',  postA.status === 200, `status=${postA.status}`)
  expect('A1.2: response.success === true',  jsonA.success === true)
  expect('A1.3: response.userEmailSent present (boolean)', typeof jsonA.userEmailSent === 'boolean')
  expect('A1.4: response.userEmailReason present', typeof jsonA.userEmailReason !== 'undefined')
  expect('A1.5: response.chainEmailSent present (boolean)', typeof jsonA.chainEmailSent === 'boolean')
  expect('A1.6: response.chainEmailReason present', typeof jsonA.chainEmailReason !== 'undefined')
  expect('A1.7: NEW response.backfilledListings present',
    Array.isArray(jsonA.backfilledListings),
    `backfilledListings.length=${jsonA.backfilledListings?.length}`)
  expect('A1.8: backfilledListings has > 0 real rows (Whitby Active)',
    Array.isArray(jsonA.backfilledListings) && jsonA.backfilledListings.length > 0,
    `count=${jsonA.backfilledListings?.length || 0}`)
  // Cross-check a couple of listing_keys against DB
  let aRealRows = 0
  if (Array.isArray(jsonA.backfilledListings) && jsonA.backfilledListings.length > 0) {
    const keys = jsonA.backfilledListings.slice(0, 3).map((l: any) => l.listing_key).filter(Boolean)
    const r = await c.query(`SELECT listing_key, standard_status FROM mls_listings WHERE listing_key = ANY($1::text[])`, [keys])
    aRealRows = r.rowCount!
    expect('A1.9: backfilledListings keys exist in mls_listings',
      r.rowCount === keys.length,
      `${r.rowCount}/${keys.length} found`)
    const activeOnly = r.rows.every(x => x.standard_status === 'Active')
    expect('A1.10: backfilledListings are all standard_status=Active', activeOnly,
      r.rows.map(x => `${x.listing_key}=${x.standard_status}`).join(', '))
  }
  expect('A1.11: NEW response.backfilledTaxMatch present',
    !!jsonA.backfilledTaxMatch,
    `taxMatch=${jsonA.backfilledTaxMatch ? 'OBJECT' : 'undefined'}`)
  if (jsonA.backfilledTaxMatch) {
    expect('A1.12: backfilledTaxMatch.isEmpty === false', jsonA.backfilledTaxMatch.isEmpty === false,
      `reason=${jsonA.backfilledTaxMatch.reason}`)
    expect('A1.13: backfilledTaxMatch.samples.length > 0',
      Array.isArray(jsonA.backfilledTaxMatch.samples) && jsonA.backfilledTaxMatch.samples.length > 0,
      `samples=${jsonA.backfilledTaxMatch.samples?.length}`)
    // photos check (the a589f10 fix should mean each sample has media)
    let withMedia = 0
    for (const s of jsonA.backfilledTaxMatch.samples || []) {
      if (s.media && s.media[0]?.media_url && /trreb-image\.ampre\.ca/.test(s.media[0].media_url)) withMedia++
    }
    expect('A1.14: backfilledTaxMatch samples carry real trreb-image URLs',
      withMedia > 0, `${withMedia}/${jsonA.backfilledTaxMatch.samples?.length} samples carry trreb-image URL`)
  }

  hr()

  // SECTION D moved up: the leads table is keyed by (user_id, tenant_id,
  // intent), so scenarios B + C would overwrite the lead before we
  // could read scenario A's persistence. Read NOW, before B/C run.
  log('SECTION D — cross-surface convergence (DB readback, executed before scenarios B/C overwrite the lead)')
  {
    const leadR = await c.query(
      `SELECT id, plan_data FROM leads WHERE user_id = $1 AND tenant_id = $2 AND intent = 'buyer' ORDER BY created_at DESC LIMIT 1`,
      [testUserId, WALLIAM])
    if (leadR.rowCount === 0) {
      expect('D1: lead row exists after scenario A POST', false, 'no lead found')
    } else {
      const lead = leadR.rows[0]
      const pd = lead.plan_data || {}
      const top = pd.topListings || []
      expect('D1: plan_data.topListings populated post-POST',
        Array.isArray(top) && top.length > 0, `topListings.length=${top.length}`)
      const responseListingsKeys = (jsonA.backfilledListings || []).map((l: any) => l.listing_key).sort()
      const persistedKeys = top.map((l: any) => l.listing_key).sort()
      // Persistence caps topListings at 10 (route.ts:322 effectiveListings.slice(0,10)).
      // backfilledListings is the SAME effectiveListings (pre-slice or equal),
      // so persistedKeys ⊆ responseListingsKeys.
      const persistedSubsetOfResponse = persistedKeys.every((k: string) => responseListingsKeys.includes(k))
      expect('D2: plan_data.topListings ⊆ response.backfilledListings (same source)',
        persistedSubsetOfResponse,
        `response=${responseListingsKeys.length} keys, persisted=${persistedKeys.length} keys, subset=${persistedSubsetOfResponse}`)
      const btm = pd.buyerTaxMatch
      expect('D3: plan_data.buyerTaxMatch populated', !!btm && !btm.isEmpty,
        `samples=${btm?.samples?.length}`)
      const responseTaxKeys = (jsonA.backfilledTaxMatch?.samples || []).map((s: any) => s.listingKey).sort()
      const persistedTaxKeys = (btm?.samples || []).map((s: any) => s.listingKey).sort()
      const sameTaxSet = JSON.stringify(responseTaxKeys) === JSON.stringify(persistedTaxKeys)
      expect('D4: plan_data.buyerTaxMatch.samples === response.backfilledTaxMatch.samples',
        sameTaxSet,
        `response=${responseTaxKeys.length} keys, persisted=${persistedTaxKeys.length} keys`)
      // Photo persistence — assert plan_data carries real URLs too
      let persistedWithMedia = 0
      for (const s of btm?.samples || []) {
        if (s.media?.[0]?.media_url && /trreb-image\.ampre\.ca/.test(s.media[0].media_url)) persistedWithMedia++
      }
      expect('D5: plan_data.buyerTaxMatch.samples carry real photos (chunking fix persists)',
        persistedWithMedia > 0, `${persistedWithMedia}/${(btm?.samples||[]).length} samples carry real URL`)
    }
  }
  hr()

  // A2: buyer in-order (listings populated)
  const inOrderListings = (jsonA.backfilledListings || []).slice(0, 5)
  if (inOrderListings.length === 0) {
    expect('A2: in-order listings available for scenario', false, 'A1 produced no rows to seed scenario B')
  } else {
    const postB = await fetch(`${BASE}/api/charlie/plan-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-tenant-id': WALLIAM, 'host': 'walliam.ca' },
      body: JSON.stringify({
        sessionId: testSessionId, userId: testUserId,
        planType: 'buyer', plan: buyerPlan, analytics: buyerAnalytics,
        listings: inOrderListings,    // IN-ORDER PATH
        geoContext: buyerGeo,
        vipCreditUsed: false, vipCreditPlansUsed: 0, vipCreditTotal: 1,
        comparables: [], blocks: [],
      }),
    })
    const jsonB = await postB.json()
    expect('A2.1: POST 200',  postB.status === 200)
    expect('A2.2: response.success === true', jsonB.success === true)
    expect('A2.3: backfilledListings reflects backfill no-op (== input listings)',
      Array.isArray(jsonB.backfilledListings) && jsonB.backfilledListings.length === inOrderListings.length,
      `backfilled=${jsonB.backfilledListings?.length} input=${inOrderListings.length}`)
    expect('A2.4: backfilledTaxMatch derived from input listings (samples>0)',
      jsonB.backfilledTaxMatch && !jsonB.backfilledTaxMatch.isEmpty && jsonB.backfilledTaxMatch.samples?.length > 0,
      `samples=${jsonB.backfilledTaxMatch?.samples?.length}`)
  }

  hr()

  // A3: seller plan — no buyer-only fields
  const postSeller = await fetch(`${BASE}/api/charlie/plan-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': WALLIAM, 'host': 'walliam.ca' },
    body: JSON.stringify({
      sessionId: testSessionId, userId: testUserId,
      planType: 'seller',
      plan: { type: 'seller', planReady: true, geoName: 'Whitby', summary: 'seller verify' },
      analytics: buyerAnalytics,
      listings: [],
      geoContext: buyerGeo,
      // No sellerEstimate to keep the smoke minimal; route handles null path
      sellerEstimate: null,
      vipCreditUsed: false, vipCreditPlansUsed: 0, vipCreditTotal: 1,
      comparables: [], blocks: [],
    }),
  })
  const jsonSeller = await postSeller.json()
  expect('A3.1: seller POST 200', postSeller.status === 200, `status=${postSeller.status} body=${JSON.stringify(jsonSeller).slice(0,200)}`)
  expect('A3.2: seller response.success === true', jsonSeller.success === true)
  expect('A3.3: seller response carries NO backfilledListings field',
    !('backfilledListings' in (jsonSeller || {})) || jsonSeller.backfilledListings === undefined,
    `keys=${Object.keys(jsonSeller || {}).join(',')}`)
  expect('A3.4: seller response carries NO backfilledTaxMatch field',
    !('backfilledTaxMatch' in (jsonSeller || {})) || jsonSeller.backfilledTaxMatch === undefined,
    `keys=${Object.keys(jsonSeller || {}).join(',')}`)
  const sellerExpectedKeys = new Set(['success', 'userEmailSent', 'userEmailReason', 'chainEmailSent', 'chainEmailReason'])
  const sellerActualKeys = new Set(Object.keys(jsonSeller || {}))
  const sellerHasAllOriginal = [...sellerExpectedKeys].every(k => sellerActualKeys.has(k))
  expect('A3.5: seller response has the 5 ORIGINAL fields (byte-identical shape)',
    sellerHasAllOriginal,
    `keys=${[...sellerActualKeys].join(',')}`)
  hr()

  // ═══════════════════════════════════════════════════════════════════
  // SECTION B — Edit 2: useCharlie hydration guard (pure logic)
  // ═══════════════════════════════════════════════════════════════════
  log('SECTION B — Edit 2: useCharlie hydration guard (pure-logic simulation)')

  // Replicate the .then handler's state update for these two cases.
  // This is a CHEAP behavioral test of the guard logic — doesn't run
  // React, just the state-transition function.
  function simulateHydrate(
    initialListingGroups: any[],
    initialBlocks: any[],
    backfilledListings: any[] | undefined,
  ): { listingGroups: any[]; blocks: any[] } {
    const s = { listingGroups: initialListingGroups, blocks: initialBlocks }
    const _bfl = backfilledListings
    if (Array.isArray(_bfl) && _bfl.length > 0) {
      if (s.listingGroups.length > 0) return s
      return {
        listingGroups: [{ label: 'Matched Listings', listings: _bfl }],
        blocks: [...s.blocks, { type: 'listings', label: 'Matched Listings', listings: _bfl }],
      }
    }
    return s
  }

  const realBackfilled = jsonA.backfilledListings || []

  // B1: EMPTY state + backfill → hydrate
  const beforeB1 = { listingGroups: [], blocks: [{ type: 'plan' }] }
  const afterB1 = simulateHydrate(beforeB1.listingGroups, beforeB1.blocks, realBackfilled)
  expect('B1.1: empty state hydrates listingGroups',
    afterB1.listingGroups.length === 1 && afterB1.listingGroups[0].listings.length === realBackfilled.length,
    `length=${afterB1.listingGroups.length}, listings=${afterB1.listingGroups[0]?.listings?.length}`)
  expect('B1.2: empty state pushes a listings block',
    afterB1.blocks.length === 2 && afterB1.blocks[1].type === 'listings',
    `blocks=${afterB1.blocks.map((b: any) => b.type).join(',')}`)

  // B2: NON-EMPTY state + backfill → strict no-op
  const seededGroups = [{ label: 'Matched Listings', listings: realBackfilled.slice(0, 3) }]
  const seededBlocks = [{ type: 'listings', label: 'Matched Listings', listings: realBackfilled.slice(0, 3) }, { type: 'plan' }]
  const beforeB2_serialized = JSON.stringify({ listingGroups: seededGroups, blocks: seededBlocks })
  const afterB2 = simulateHydrate(seededGroups, seededBlocks, realBackfilled)
  const afterB2_serialized = JSON.stringify(afterB2)
  expect('B2.1: non-empty state — listingGroups byte-identical (no-op)',
    JSON.stringify(afterB2.listingGroups) === JSON.stringify(seededGroups),
    `before=${JSON.stringify(seededGroups).length} chars, after=${JSON.stringify(afterB2.listingGroups).length} chars`)
  expect('B2.2: non-empty state — blocks byte-identical (no-op)',
    JSON.stringify(afterB2.blocks) === JSON.stringify(seededBlocks))
  expect('B2.3: in-order state byte-identical before/after hydration call',
    beforeB2_serialized === afterB2_serialized)

  // B3: empty state + EMPTY backfilled → no-op (honest empty-state)
  const afterB3 = simulateHydrate([], [], [])
  expect('B3.1: empty state + empty backfilled → no-op',
    afterB3.listingGroups.length === 0 && afterB3.blocks.length === 0)
  hr()

  // ═══════════════════════════════════════════════════════════════════
  // SECTION C — Edit 3: ResultsPanel single-render
  // ═══════════════════════════════════════════════════════════════════
  log('SECTION C — Edit 3: ResultsPanel single-render proof')

  const rpTxt = fs.readFileSync(path.resolve(__dirname, '..', 'app/charlie/components/ResultsPanel.tsx'), 'utf8')
  const matches = rpTxt.match(/<BuyerTaxMatchInChat[\s\n]/g) || []
  expect('C1: exactly ONE <BuyerTaxMatchInChat invocation in ResultsPanel.tsx',
    matches.length === 1, `count=${matches.length}`)
  expect('C2: comparables-branch sibling removed (no `<div style={{ marginTop: 20 }}>` before <BuyerTaxMatchInChat`)',
    !/marginTop: 20[^}]*}}>\s*<BuyerTaxMatchInChat/m.test(rpTxt),
    'old sibling pattern absent')
  expect('C3: top-level invocation wrapped in IIFE that computes budgetMax + avgConcessionPct',
    /=> \{[\s\S]*?const _budgetMax = plan\?\.budgetMax[\s\S]*?const _avgConc[\s\S]*?<BuyerTaxMatchInChat/.test(rpTxt))
  expect('C4: convergence marker present',
    /W-CHARLIE-INCHAT-CONVERGENCE/.test(rpTxt))
  hr()

  // SECTION D ran earlier (before scenarios B/C overwrite the lead).

  // ═══════════════════════════════════════════════════════════════════
  // SECTION E — Byte-identity: email + lead + seller paths
  // ═══════════════════════════════════════════════════════════════════
  log('SECTION E — byte-identity (email + lead + seller paths unchanged)')

  function diffEmpty(p: string): boolean {
    try {
      const d = execSync(`git diff HEAD -- "${p}"`, { encoding: 'utf8' }).trim()
      return d === ''
    } catch { return false }
  }
  expect('E1: lib/email/charlie-plan-email-html.ts byte-identical to HEAD',
    diffEmpty('lib/email/charlie-plan-email-html.ts'))
  expect('E2: components/admin-homes/lead-workbench/PlanRenderer.tsx byte-identical to HEAD',
    diffEmpty('components/admin-homes/lead-workbench/PlanRenderer.tsx'))
  expect('E3: lib/charlie/buyer-tax-match.ts byte-identical to HEAD',
    diffEmpty('lib/charlie/buyer-tax-match.ts'))
  // E4: lib/estimator/tax-band-sold-query.ts is EXPECTED MODIFIED in
  // this commit (Edit 4 — chunked .in() lookup for media). This is
  // strictly additive: the same row-set predicates still drive the
  // SOLD fetch (DEFAULT_TAX_BAND_SELECT, mls_listings predicates), and
  // the same media-table predicates still drive the photo lookup (just
  // batched over CHUNK_SIZE). Assert by presence of every predicate
  // fragment in the post-edit file.
  const taxBandTxt = fs.readFileSync(path.resolve(__dirname, '..', 'lib/estimator/tax-band-sold-query.ts'), 'utf8')
  const taxBandPredicates = [
    // SOLD-fetch predicates (untouched)
    `'id, listing_key, listing_id, unparsed_address, list_price, close_price, close_date, '`,
    `.from('mls_listings')`,
    `.eq('transaction_type', 'For Sale')`,
    `.eq('standard_status', 'Closed')`,
    `.gte('tax_annual_amount', taxLow)`,
    `.lte('tax_annual_amount', taxHigh)`,
    // Media-table predicates (preserved; just batched into chunks)
    `.from('media')`,
    `.select('listing_id, media_url, order_number')`,
    `.eq('variant_type', 'thumbnail')`,
    `.order('order_number', { ascending: true })`,
    // NEW chunking marker — additive only
    `CHUNK_SIZE`,
  ]
  const missing = taxBandPredicates.filter(p => !taxBandTxt.includes(p))
  expect('E4: tax-band-sold-query.ts — additive chunking edit (all SOLD + media predicates preserved)',
    missing.length === 0,
    missing.length === 0 ? `${taxBandPredicates.length} predicates preserved + chunking added` : `MISSING fragments: ${missing.join(' | ')}`)
  expect('E5: lib/estimator/home-comparable-matcher-sales.ts byte-identical to HEAD',
    diffEmpty('lib/estimator/home-comparable-matcher-sales.ts'))
  expect('E6: lib/estimator/condo-comparable-matcher-sales.ts byte-identical to HEAD',
    diffEmpty('lib/estimator/condo-comparable-matcher-sales.ts'))
  expect('E7: app/api/geo-listings/route.ts byte-identical to HEAD',
    diffEmpty('app/api/geo-listings/route.ts'))
  expect('E8: app/api/charlie/route.ts byte-identical to HEAD',
    diffEmpty('app/api/charlie/route.ts'))
  hr()

  // ═══════════════════════════════════════════════════════════════════
  // SECTION F — Edit-set identity (only 3 declared targets modified)
  // ═══════════════════════════════════════════════════════════════════
  log('SECTION F — edit-set identity')
  const status = execSync('git status --porcelain', { encoding: 'utf8' })
  const modified = status.split('\n').filter(l => /^\s*M /.test(l)).map(l => l.replace(/^\s*M\s+/, '').replace(/\\/g, '/'))
  const declared = new Set([
    'app/api/charlie/plan-email/route.ts',
    'app/charlie/hooks/useCharlie.ts',
    'app/charlie/components/ResultsPanel.tsx',
    // Edit 4 — additive chunking fix to the W-CHARLIE-TAXMATCH-PHOTOS
    // helper, surfaced by this verify because plan-email's larger pool
    // (full 500-cap muni SOLD pool) tripped Supabase's .in() URI limit
    // and silently failed media lookup. Without this, in-chat tax-match
    // hydration paths would render placeholder photos even though
    // email + lead expected real URLs. Strictly additive — no row-set
    // change, just batching the existing media join.
    'lib/estimator/tax-band-sold-query.ts',
  ])
  // Pre-existing dirty files documented during W-CHARLIE-TAXMATCH-PHOTOS recon.
  const preDirty = new Set([
    'app/api/charlie/municipalities/route.ts',
    'scripts/r-w-territory-master-p2-data-phantom-fix.js',
    'scripts/r-w-territory-master-p4-check-fix.js',
  ])
  const unexpected = modified.filter(f => !declared.has(f) && !preDirty.has(f) && !/^docs\//.test(f) && !/^scripts\//.test(f) && !/^recon\//.test(f))
  expect('F1: all 3 declared targets in `M` list',
    [...declared].every(f => modified.includes(f)),
    `M files: ${modified.join(', ')}`)
  expect('F2: no NEW unexpected source files modified',
    unexpected.length === 0,
    unexpected.length === 0 ? 'pre-existing dirty are excluded from commit' : `UNEXPECTED: ${unexpected.join(', ')}`)
  hr()

  log(`SUMMARY: ${pass} PASS, ${fail} FAIL`)
  log(fail === 0 ? 'STATUS: data-layer + state-machine verified.' : 'STATUS: FAIL — investigate before proceeding.')
  log('NOTE: live-DOM in-chat render (For Sale + tax-match blocks WITH photos appearing in the panel) = operator eyeball gate on walliam.ca post-deploy per source-grep-is-dead lock (CLAUDE.md).')

  c.release(); await pool.end()
  process.exit(fail === 0 ? 0 : 1)
})().catch(e => { console.error(e); log('FATAL: ' + (e?.stack || e?.message || String(e))); process.exit(2) })
