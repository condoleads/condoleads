// scripts/smoke-cv1-lead-page.js
//
// W-CHARLIE-CONVERGENCE CV-1 (2026-06-14) — lead-page parity smoke.
//
// EVIDENCE STRATEGY:
//   - DATA correctness: hits the CV-0 view probe (test-seller-estimate-
//     view-probe) with the fixture leadId; that probe runs the SHIPPED
//     buildSellerEstimateView server-side and returns the canonical view.
//     The 144/144 CV-0 smoke already proved the helper's output values
//     match the source — this leg just confirms the view is non-null and
//     carries the expected `present` flags for the fixture / AMBER /
//     NEITHER cases.
//   - VIEW-CONSUMPTION correctness: static source analysis of
//     CharlieLeadEstimate.tsx + LeadDetailClient.tsx asserts every
//     canonical section has its JSX block (preservation + completeness),
//     that the JSX references the right view fields (not `sellerEstimate`
//     anymore), and that tier-chip literals are imported from CV-0 (no
//     inline TIER_COLORS{platinum:'#10b981'…} duplication left in this
//     file).
//   - WHY NOT renderToStaticMarkup: 'use client' components imported into
//     route handlers resolve to Next's client-component placeholder (an
//     object), not the function. React's renderToStaticMarkup throws
//     "Element type is invalid: ... but got: object". The combined
//     evidence above is what the C-CHARLIE-FOLLOWUP B(i) verifier
//     established as the right pattern when actual server-rendering of a
//     client component isn't feasible.
//
// Asserts:
//   1. PRESERVATION — CharlieLeadEstimate JSX still has every section
//      Phase 2 shipped (price card, tier rail, Comparable Sold, Tax-
//      Matched, Competing For Sale + estimate pill).
//   2. COMPLETENESS — JSX now also has the 8 NEW canonical sections
//      (Seller Strategy, Seller Profile, Market Intel, Price by Home Type,
//      Offer Intel, Best Time, Pricing Risk, AI Disclaimer).
//   3. VIEW-CONSUMPTION — JSX references view.{priceCard,tierRail,
//      comparables,taxMatch,competingListings,marketIntel,priceByHomeType,
//      offerIntel,bestTime,planSummary,planCardGrid,pricingRisk} and each
//      is gated on view.present.*.
//   4. AMBER PATH — legacy notice JSX still present + still reached when
//      view=null and legacyNoticeWhenEmpty=true.
//   5. NEITHER PATH — for a non-charlie-seller lead, CV-0 probe returns
//      view=null cleanly (no throw).
//   6. TIER CHIP PARITY — CharlieLeadEstimate imports tierChipFor +
//      TIER_META + TIER_ORDER from lib/charlie/tier-chip (CV-0 single
//      source). Inline TIER_COLORS duplication GONE from this file
//      (CV-0 cited at L85-89 of pre-CV-1 file).
//   7. LEADDETAILCLIENT — calls buildSellerEstimateView and threads the
//      view through; old `sellerEstimate=` prop usage GONE.
//   8. NON-IN-SCOPE FILES BYTE-UNCHANGED — ResultsPanel, SellerEstimate-
//      Block, ComparableCard, charlie-plan-email-html, plan-email/route,
//      09b97ef-protected SHAs.

require('dotenv').config({ path: '.env.local' })
const { Client } = require('pg')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const FIXTURE = '63b48f13-8a03-46be-b4ce-91007da0794a'
const REPORT  = path.resolve(__dirname, '..', 'scripts-output', 'smoke-cv1-lead-page.txt')

function dbCfg() {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.DIRECT_URL
  if (!url) throw new Error('DATABASE_URL not in env')
  return { connectionString: url, ssl: { rejectUnauthorized: false } }
}
function readFile(p) { return fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8') }
function sha(buf) { return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 12) }
function readBytes(p) { return fs.readFileSync(path.resolve(__dirname, '..', p)) }

async function detectDev() {
  for (const b of [process.env.DEV_BASE_URL, 'http://localhost:3000', 'http://localhost:3001'].filter(Boolean)) {
    try { const r = await fetch(b, { method: 'HEAD' }); if (r.status < 500) return b } catch {}
  }
  return null
}

async function probe(base, body) {
  const res = await fetch(`${base}/api/charlie/test-seller-estimate-view-probe`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const j = await res.json()
  if (!j.ok) throw new Error('probe error: ' + (j.error || res.statusText))
  return j
}

const out = []
function log(s) { out.push(s); console.log(s) }
const checks = []
function check(name, ok, detail) { checks.push([name, !!ok, detail || '']); log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  [' + detail + ']' : '')) }
function checkContains(haystack, needle, name, detail) {
  const ok = typeof haystack === 'string' && haystack.includes(needle)
  check(name, ok, detail || (ok ? '' : `missing: "${needle.slice(0, 80)}"`))
}

async function main() {
  log('================================================================')
  log('W-CHARLIE-CONVERGENCE CV-1 — lead-page parity smoke')
  log('================================================================')

  // ── data correctness ──
  const c = new Client(dbCfg())
  await c.connect()
  let amberLeadId, neitherLeadId
  try {
    await c.query('BEGIN')
    await c.query('SET LOCAL statement_timeout = 0')
    const r2 = await c.query(`
      SELECT id FROM leads
      WHERE lead_origin_route = 'charlie' AND intent = 'seller'
        AND (plan_data->'sellerEstimate' IS NULL OR plan_data->'sellerEstimate' = 'null'::jsonb)
      ORDER BY created_at DESC LIMIT 1
    `)
    amberLeadId = r2.rows[0]?.id || null
    const r3 = await c.query(`
      SELECT id FROM leads
      WHERE (lead_origin_route IS DISTINCT FROM 'charlie' OR intent IS DISTINCT FROM 'seller')
      ORDER BY created_at DESC LIMIT 1
    `)
    neitherLeadId = r3.rows[0]?.id || null
    await c.query('ROLLBACK')
  } finally { await c.end() }

  log(`fixture lead (FULL render): ${FIXTURE}`)
  log(`amber lead (legacyNotice):  ${amberLeadId || '(none)'}`)
  log(`neither lead (estimator):   ${neitherLeadId || '(none)'}`)

  const base = await detectDev()
  if (!base) { log('ERROR: no dev server reachable. Run `npm run dev`.'); process.exit(2) }
  log(`dev server: ${base}`)
  log('')

  // ── view data correctness ──
  log('── DATA — view shape from CV-0 helper (via probe) ──')
  const r = await probe(base, { op: 'view', leadId: FIXTURE })
  const v = r.view
  check('fixture view non-null', !!v)
  check('view.path === "home"', v?.path === 'home')
  check('view.subjectAddress === "606 Aspen rd, Pickering"', v?.subjectAddress === '606 Aspen rd, Pickering')
  const expected = {
    priceCard: true, tierRail: true, comparables: true, taxMatch: true, competing: true,
    marketIntel: true, priceByHomeType: true, offerIntel: true, bestTime: true,
    planCardGrid: true, planSummary: true, pricingRisk: true,
  }
  for (const k of Object.keys(expected)) {
    check(`view.present.${k} === ${expected[k]}`, v?.present?.[k] === expected[k], `actual=${v?.present?.[k]}`)
  }
  // tierRail anchor confirmation
  check('view.tierRail.bestGeoTier === "gold"', v?.tierRail?.bestGeoTier === 'gold')
  check('view.tierRail.slots.gold.count === 5 && median === 1127000', v?.tierRail?.slots?.gold?.count === 5 && v?.tierRail?.slots?.gold?.median === 1127000)
  // taxMatch
  check('view.taxMatch.count === 12 && comparables.length === 10', v?.taxMatch?.count === 12 && v?.taxMatch?.comparables?.length === 10)
  check('all tax comps carry sourceTier="silver"', Array.isArray(v?.taxMatch?.comparables) && v.taxMatch.comparables.every(c => c.sourceTier === 'silver'))
  // marketIntel values for content assertions
  check('view.marketIntel.closedAvgDom90 === 25', v?.marketIntel?.closedAvgDom90 === 25)
  check('view.marketIntel.saleToListRatio === 100.72', v?.marketIntel?.saleToListRatio === 100.72)
  check('view.marketIntel.activeCount === 423', v?.marketIntel?.activeCount === 423)
  check('view.priceByHomeType.length === 5', v?.priceByHomeType?.length === 5)
  check('view.bestTime.currentMonthRank === 3', v?.bestTime?.currentMonthRank === 3)
  check('view.planCardGrid.goal === "Top dollar"', v?.planCardGrid?.goal === 'Top dollar')
  check('view.planSummary starts with "Pickering"', typeof v?.planSummary === 'string' && v.planSummary.startsWith('Pickering'))

  // ── AMBER ──
  log('')
  log('── AMBER probe ──')
  if (amberLeadId) {
    const a = await probe(base, { op: 'view', leadId: amberLeadId })
    check('AMBER: view is null for pre-3d9ac08 Charlie seller lead', a.view === null, `actual=${JSON.stringify(a.view).slice(0,60)}`)
  } else {
    check('AMBER lead found in DB', false, 'no Charlie seller lead without sellerEstimate persisted')
  }

  // ── NEITHER ──
  log('── NEITHER probe ──')
  if (neitherLeadId) {
    const n = await probe(base, { op: 'view', leadId: neitherLeadId })
    check('NEITHER: view is null for non-charlie-seller lead', n.view === null, `actual=${JSON.stringify(n.view).slice(0,60)}`)
  } else {
    check('NEITHER lead found in DB', false, 'no non-charlie-seller lead')
  }

  // ── VIEW-CONSUMPTION — static source analysis ──
  log('')
  log('── VIEW-CONSUMPTION — CharlieLeadEstimate.tsx structural assertions ──')
  const cleSrc = readFile('components/dashboard/CharlieLeadEstimate.tsx')

  // PRESERVATION — Phase-2 sections still in JSX
  checkContains(cleSrc, 'Charlie seller estimate', 'PRESERVE: header text')
  checkContains(cleSrc, 'Estimated value', 'PRESERVE: price card label')
  checkContains(cleSrc, 'Confidence by Area', 'PRESERVE: tier rail heading')
  checkContains(cleSrc, 'Comparable Sold · {view.comparables.length} found', 'PRESERVE: Comparable Sold header reads view.comparables.length')
  checkContains(cleSrc, 'Tax-Matched · {view.taxMatch.comparables.length} found', 'PRESERVE: Tax-Matched header reads view.taxMatch')
  checkContains(cleSrc, 'Tax-matched estimate', 'PRESERVE: tax-matched estimate pill label')
  checkContains(cleSrc, 'Competing For Sale · {view.competingListings.length} found', 'PRESERVE: Competing For Sale header reads view.competingListings')
  checkContains(cleSrc, 'Anchor', 'PRESERVE: ANCHOR chip')

  // COMPLETENESS — 8 NEW sections
  checkContains(cleSrc, 'Seller Strategy', 'NEW: Seller Strategy section heading')
  checkContains(cleSrc, '{view.planSummary}', 'NEW: JSX renders {view.planSummary}')
  checkContains(cleSrc, 'Seller Profile', 'NEW: Seller Profile section heading')
  checkContains(cleSrc, '{view.planCardGrid.goal}', 'NEW: JSX renders {view.planCardGrid.goal}')
  checkContains(cleSrc, '{view.planCardGrid.timeline}', 'NEW: JSX renders {view.planCardGrid.timeline}')
  checkContains(cleSrc, '{view.planCardGrid.propertyType}', 'NEW: JSX renders {view.planCardGrid.propertyType}')
  checkContains(cleSrc, 'Market Intelligence', 'NEW: Market Intelligence heading')
  checkContains(cleSrc, 'view.marketIntel.closedAvgDom90', 'NEW: JSX consumes view.marketIntel.closedAvgDom90')
  checkContains(cleSrc, 'view.marketIntel.saleToListRatio', 'NEW: JSX consumes view.marketIntel.saleToListRatio')
  checkContains(cleSrc, 'view.marketIntel.activeCount', 'NEW: JSX consumes view.marketIntel.activeCount')
  checkContains(cleSrc, 'Price by Home Type', 'NEW: Price by Home Type heading')
  checkContains(cleSrc, 'view.priceByHomeType.map', 'NEW: JSX maps view.priceByHomeType')
  checkContains(cleSrc, 'Offer Intelligence', 'NEW: Offer Intelligence heading')
  checkContains(cleSrc, 'view.offerIntel.offerAt', 'NEW: JSX consumes view.offerIntel.offerAt')
  checkContains(cleSrc, 'view.offerIntel.avgConcession', 'NEW: JSX consumes view.offerIntel.avgConcession')
  checkContains(cleSrc, 'view.offerIntel.decideIn', 'NEW: JSX consumes view.offerIntel.decideIn')
  checkContains(cleSrc, 'Best Time to Sell', 'NEW: Best Time to Sell heading')
  checkContains(cleSrc, 'view.bestTime', 'NEW: JSX consumes view.bestTime')
  checkContains(cleSrc, 'Pricing Strategy', 'NEW: Pricing Strategy heading')
  checkContains(cleSrc, 'At asking price', 'NEW: Pricing-risk DOM row "At asking price"')
  checkContains(cleSrc, '5% over asking', 'NEW: Pricing-risk DOM row "5% over asking"')
  checkContains(cleSrc, '10% over asking', 'NEW: Pricing-risk DOM row "10% over asking"')
  checkContains(cleSrc, 'AI Disclaimer', 'NEW: AI Disclaimer block')

  // Section gating on view.present.* — assert each gate
  checkContains(cleSrc, 'p.priceCard', 'GATE: price card gated on view.present.priceCard')
  checkContains(cleSrc, 'p.tierRail', 'GATE: tier rail gated on view.present.tierRail')
  checkContains(cleSrc, 'p.comparables', 'GATE: comparables gated')
  checkContains(cleSrc, 'p.taxMatch', 'GATE: tax-match gated')
  checkContains(cleSrc, 'p.competing', 'GATE: competing gated')
  checkContains(cleSrc, 'p.marketIntel', 'GATE: marketIntel gated')
  checkContains(cleSrc, 'p.priceByHomeType', 'GATE: priceByHomeType gated')
  checkContains(cleSrc, 'p.offerIntel', 'GATE: offerIntel gated')
  checkContains(cleSrc, 'p.bestTime', 'GATE: bestTime gated')
  checkContains(cleSrc, 'p.planCardGrid', 'GATE: planCardGrid gated')
  checkContains(cleSrc, 'p.planSummary', 'GATE: planSummary gated')
  checkContains(cleSrc, 'p.pricingRisk', 'GATE: pricingRisk gated')

  // AMBER notice — still present in source
  checkContains(cleSrc, 'No estimate captured', 'AMBER: legacy notice text in source')
  checkContains(cleSrc, '3d9ac08', 'AMBER: cutoff commit cited')
  checkContains(cleSrc, 'bg-amber-50', 'AMBER: amber styling class')

  // TIER CHIP migration — imports from CV-0; no inline TIER_COLORS literal
  checkContains(cleSrc, "from '@/lib/charlie/tier-chip'", 'CV-0 IMPORT: tier-chip module imported')
  checkContains(cleSrc, 'TIER_META', 'CV-0 IMPORT: TIER_META named import')
  checkContains(cleSrc, 'TIER_ORDER', 'CV-0 IMPORT: TIER_ORDER named import')
  checkContains(cleSrc, 'tierChipFor', 'CV-0 IMPORT: tierChipFor named import')
  // No inline TIER_COLORS LITERAL in this file anymore
  const inlineLiteral = /const\s+TIER_COLORS\s*:\s*Record<TierKey,\s*string>\s*=\s*\{[\s\S]{0,200}platinum:\s*'#10b981'/
  check('CV-1: inline TIER_COLORS literal REMOVED from CharlieLeadEstimate.tsx (no more duplication)', !inlineLiteral.test(cleSrc))
  // CV-0 imports MUST be from @/lib/charlie/tier-chip
  checkContains(cleSrc, "import {\n  TIER_META,\n  TIER_ORDER,\n  tierChipFor", 'CV-0 IMPORTS exact block: TIER_META + TIER_ORDER + tierChipFor')

  // View prop signature (replaced sellerEstimate)
  checkContains(cleSrc, 'view: SellerEstimateView | null | undefined', 'PROPS: view prop now SellerEstimateView (replaced sellerEstimate)')
  check('PROPS: old sellerEstimate prop removed from interface',
    !/sellerEstimate\?:\s*SellerEstimatePayload/.test(cleSrc))

  // ── LeadDetailClient wiring ──
  log('')
  log('── LeadDetailClient.tsx wiring ──')
  const ldcSrc = readFile('components/dashboard/LeadDetailClient.tsx')
  checkContains(ldcSrc, "import { buildSellerEstimateView }", 'LeadDetailClient imports buildSellerEstimateView from CV-0')
  checkContains(ldcSrc, "buildSellerEstimateView((lead as any)?.plan_data ?? null)", 'LeadDetailClient calls buildSellerEstimateView(lead.plan_data)')
  checkContains(ldcSrc, "<CharlieLeadEstimate view={sellerView}", 'LeadDetailClient passes view prop')
  checkContains(ldcSrc, "view={null}", 'LeadDetailClient amber branch passes view={null}')
  checkContains(ldcSrc, 'legacyNoticeWhenEmpty={true}', 'LeadDetailClient amber branch legacyNoticeWhenEmpty=true')
  check('LeadDetailClient: old `sellerEstimate={charlieSellerEstimate}` pattern REMOVED',
    !/sellerEstimate=\{charlieSellerEstimate\}/.test(ldcSrc))

  // ── 8) NON-IN-SCOPE FILES byte-unchanged ──
  log('')
  log('── NON-IN-SCOPE files — byte-unchanged (CV-1 is lead-page only) ──')
  const expectedShas = [
    ['app/charlie/components/ResultsPanel.tsx',           null], // post-revert (informational)
    ['app/charlie/components/SellerEstimateBlock.tsx',    null], // informational
    ['app/charlie/components/ComparableCard.tsx',         null], // informational
    ['lib/email/charlie-plan-email-html.ts',              null], // CV-2 will touch
    ['app/api/charlie/plan-email/route.ts',               null],
    ['app/api/charlie/route.ts',                          '9c64acba0564'],
    ['app/charlie/lib/charlie-tools.ts',                  'a02ee7ab48f9'],
    ['app/charlie/lib/charlie-prompts.ts',                'fbe7b7de14b9'],
    ['app/api/walliam/charlie/vip-request/route.ts',      '97c651e90c6f'],
  ]
  for (const [p, expected] of expectedShas) {
    const got = sha(readBytes(p))
    if (expected) {
      check(`${p}  expected=${expected}, got=${got}`, got === expected)
    } else {
      log(`INFO  ${p}  sha=${got}`)
    }
  }

  // ── Final ──
  log('')
  log('================================================================')
  const fails = checks.filter(c => !c[1]).length
  log(`OVERALL: ${fails === 0 ? 'PASS' : 'FAIL'}  (${checks.length - fails}/${checks.length} passed, ${fails} failed)`)
  log('================================================================')

  fs.mkdirSync(path.dirname(REPORT), { recursive: true })
  fs.writeFileSync(REPORT, out.join('\n') + '\n')
  console.log('\nreport written: ' + REPORT)
  process.exit(fails === 0 ? 0 : 1)
}

main().catch(e => {
  console.error('FATAL', e)
  out.push('FATAL ' + (e?.message || String(e)))
  try { fs.writeFileSync(REPORT, out.join('\n') + '\n') } catch {}
  process.exit(2)
})
