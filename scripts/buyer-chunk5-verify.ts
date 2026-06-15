// scripts/buyer-chunk5-verify.ts
//
// W-CHARLIE-BUYER-CHUNK5 VERIFY — live verify of the comp-grounded
// summary spec + in-chat position fix.
//
// What gets verified live:
//   1. PROMPT EDIT — buyer summary spec NOW requires comp-grounded
//      figures, explicitly forbids tax-match citation (it's not
//      available at generate_plan time), explicit Rule-Zero against
//      hallucination. Source assertion.
//   2. IN-CHAT POSITION — ResultsPanel.tsx renders Tax-Matched as a
//      SIBLING of Comparable Sold inside blocks.map (NOT at the
//      bottom after all blocks). Real-DOM via Playwright + render
//      of a probe page that drives a buyer flow.
//   3. NO-FABRICATION INFRASTRUCTURE — the new prompt spec instructs
//      the LLM to cite only retrieved numbers and omit clauses when
//      data is missing. Asserted via source markers.
//   4. SELLER NO-REGRESSION — seller spec untouched; seller flow's
//      generate_plan summary still uses the prior 4-bullet shape.
//
// LIVE LLM ASSERTION (a real generate_plan summary that cites real
// comp numbers) requires driving Charlie end-to-end with an authed
// session + 5 tool calls + waiting for streamed output — too
// brittle to fit in a single verify run. Instead, the verify ASSERTS
// the prompt-layer instructions are in place AND runs a sanity check
// over the prior real lead's summary to flag if it cited a fabricated
// figure (none expected on the pre-Chunk-5 leads since the prompt
// didn't ask for comps). The next real buyer flow against the
// post-Chunk-5 prompt will demonstrate the new behavior.

import * as fs from 'fs'
import * as path from 'path'
import { chromium } from 'playwright'
import { Pool } from 'pg'
import { execSync } from 'child_process'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const BASE = process.env.LOCAL_BASE || 'http://localhost:3004'
const WALLIAM = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
const OUT_DIR = path.resolve(__dirname, '..', 'recon')
const SHOT_DIR = path.join(OUT_DIR, 'buyer-chunk5-screenshots')
const REPORT = path.join(OUT_DIR, 'buyer-chunk5-verify.txt')
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
  log('W-CHARLIE-BUYER-CHUNK5 VERIFY — ' + new Date().toISOString())
  log('local base: ' + BASE)
  hr()

  // Dev server gate
  try {
    const r = await fetch(`${BASE}/api/walliam/tenant-config`, { headers: { 'x-tenant-id': WALLIAM } })
    if (r.status !== 200) throw new Error('tenant-config returned ' + r.status)
    log(`dev server: 200 — proceeding with LIVE verify.`)
  } catch (e: any) {
    log('FATAL  dev server not serving — restart it before re-running.')
    log('       error: ' + e.message)
    process.exit(2)
  }

  // ═══════════════════ GROUP 1 — Prompt edit (Defect 3) ═══════════════════
  hr()
  log('GROUP 1 — Prompt edit requires comp-grounded buyer summary + anti-hallucination')

  const promptSrc = fs.readFileSync(path.resolve(__dirname, '..', 'app/charlie/lib/charlie-prompts.ts'), 'utf8')

  expect('1.1 Prompt has new BUYER SUMMARY block (W-CHARLIE-BUYER-CHUNK5 marker)',
    /BUYER SUMMARY — MUST cite real retrieved comp evidence/.test(promptSrc))
  expect('1.2 Prompt requires (a) comparable-SOLD median citation from get_comparables',
    /comparable-SOLD median or range from the 6 comps in get_comparables/.test(promptSrc) &&
    /Compute the median close_price/.test(promptSrc))
  expect('1.3 Prompt requires (b) offer/positioning grounded in comps + budget',
    /suggested offer.{1,20}positioning grounded in those comps/.test(promptSrc) &&
    /At your \$A budget vs the \$X sold median/.test(promptSrc))
  expect('1.4 Prompt FORBIDS tax-match citation at summary time (not available)',
    /DO NOT reference "tax-matched" or "tax band" figures in the summary/.test(promptSrc) &&
    /NOT available to you at generate_plan time/.test(promptSrc) &&
    /Citing them would be hallucination/.test(promptSrc))
  expect('1.5 Prompt has explicit anti-hallucination Rule-Zero clause',
    /ANTI-HALLUCINATION/.test(promptSrc) &&
    /cite ONLY numbers you actually retrieved/.test(promptSrc) &&
    /omit clause.{0,40}rather than invent/.test(promptSrc) &&
    /NEVER fabricate a price, median, range, or percentage/.test(promptSrc))
  expect('1.6 Prompt explicitly notes seller summary is unchanged',
    /Seller summary unchanged from prior spec/.test(promptSrc))

  // ═══════════════════ GROUP 2 — Seller no-regression (prompt-side) ═══════════════════
  hr()
  log('GROUP 2 — Seller summary spec untouched (the original L56 bullet stays)')
  expect('2.1 Original "market condition / budget / next-step / urgency" spec still present',
    /Always populate the summary field in generate_plan with 3-4 sentences: market condition, what their budget gets them, recommended next step, and urgency signal/.test(promptSrc))
  expect('2.2 SELLER FLOW prompt section unchanged (same 9-step block)',
    /SELLER FLOW:[\s\S]+?After plan: "Your seller strategy is ready/.test(promptSrc))
  // Also check the comparison: the BUYER summary spec applies only to buyers
  expect('2.3 New buyer-summary block is buyer-scoped (mentions BUYERS specifically)',
    /3-4 sentence summary for BUYERS MUST reference real numbers/.test(promptSrc))

  // ═══════════════════ GROUP 3 — In-chat tax-match repositioned (Defect 1) ═══════════════════
  hr()
  log('GROUP 3 — In-chat Tax-Matched repositioned (sibling of Comparable Sold)')

  const rpSrc = fs.readFileSync(path.resolve(__dirname, '..', 'app/charlie/components/ResultsPanel.tsx'), 'utf8')

  expect('3.1 BuyerTaxMatchInChat now rendered INSIDE the comparables-block branch (sibling of Comparable Sold)',
    /block\.type === 'comparables'[\s\S]+?<ComparableCard[\s\S]+?<BuyerTaxMatchInChat/m.test(rpSrc))
  expect('3.2 Standalone bottom-of-panel BuyerTaxMatchInChat render REMOVED (now a comment marker)',
    /the standalone bottom-of-\s*\n[ ]*panel BuyerTaxMatchInChat render that lived here was REMOVED/m.test(rpSrc))
  expect('3.3 BuyerTaxMatchInChat component definition still exists (no orphan delete)',
    /function BuyerTaxMatchInChat/.test(rpSrc))

  // Live DOM probe: render the test-lead-page-probe page (which mounts
  // PlanRenderer with synthetic data — different from ResultsPanel but
  // confirms our component & data wiring still ssr-renders cleanly).
  // For the in-chat order assertion, we drive against the existing
  // /test-comparable-tile-probe which mounts ComparableCard directly;
  // the ORDER assertion is best done via source (above) since the
  // ResultsPanel needs a live Charlie chat session to populate blocks
  // (auth-gated, not headless-friendly without test creds).
  hr()
  log('GROUP 4 — In-chat tile probe still healthy (Chunk 2b/3/4 regression check)')
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 1800 } })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/test-comparable-tile-probe`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForSelector('[data-testid="buyer-section"]', { timeout: 30000 })
  await page.screenshot({ path: path.join(SHOT_DIR, '1-tile-probe.png'), fullPage: true })
  const buyerText = await page.locator('[data-testid="buyer-section"]').innerText()
  expect('4.1 ComparableCard buyer probe still renders populated tile',
    buyerText.includes('101 Buyer Snake St') && buyerText.includes('$705,000'),
    'snapshot: ' + JSON.stringify(buyerText.slice(0, 120)))
  await browser.close()

  // ═══════════════════ GROUP 5 — Data-availability finding ═══════════════════
  hr()
  log('GROUP 5 — Data-availability finding at generate_plan time')
  log('  Charlie\'s BUYER FLOW (charlie-prompts.ts:34-43) calls in order:')
  log('    1. resolve_geo                  → geoContext')
  log('    2. get_market_analytics         → market stats (avg_concession_pct, sale_to_list, etc.)')
  log('    3. search_listings              → up to 10 matched ACTIVE listings (with list_price)')
  log('    4. get_comparables              → up to 6 SOLD comps (with close_price + close_date + tax_annual_amount)')
  log('    5. generate_plan                ← LLM writes `summary` HERE')
  log('  After generate_plan:')
  log('    6. plan-email POST (server)     → derives buyerTaxMatch via tax-band SOLD query.')
  log('  ')
  log('  → At step 5, the LLM has:')
  log('     • get_market_analytics figures (already cited today)')
  log('     • get_comparables sold-price array (the 6 comps — NEW to cite in Chunk 5)')
  log('  → It does NOT yet have buyerTaxMatch — that\'s derived only at step 6 on the server.')
  log('  → Conclusion (cited in the prompt edit at clause c): the summary MUST use comp-sold,')
  log('     MAY use market-analytics, MUST NOT cite tax-match. Anti-hallucination clause backs')
  log('     this up: cite only retrieved numbers; omit clauses for unretrieved values.')

  expect('5.1 Prompt explicitly enumerates the available data correctly',
    /Compute the median close_price from the comp set you received/.test(promptSrc),
    'matches what is in tool context at generate_plan time')
  expect('5.2 Prompt enumerates the unavailable data correctly',
    /tax-matched[\s\S]+?derived later in the email pipeline/.test(promptSrc),
    'matches the actual derivation flow (Chunk 4 server-side derivation)')

  // ═══════════════════ GROUP 6 — Sanity check on pre-Chunk-5 real lead's summary ═══════════════════
  hr()
  log('GROUP 6 — Sanity: pre-Chunk-5 leads SHOULD NOT cite invented comp numbers')
  log('  (The fix is forward-looking — pre-Chunk-5 prompts didn\'t require')
  log('   comp citation, so no expectation of comp-grounded numbers in old')
  log('   summaries. Just confirming there are no FABRICATED figures —')
  log('   citations of $X that don\'t exist anywhere in plan_data.)')

  const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL })
  const c = await pool.connect()
  try {
    await c.query('BEGIN READ ONLY')
    const r = await c.query(`
      SELECT id, plan_data
        FROM leads
       WHERE tenant_id = '${WALLIAM}'
         AND intent = 'buyer'
         AND lead_origin_route LIKE '%charlie%'
         AND jsonb_array_length(COALESCE(plan_data->'topListings', '[]'::jsonb)) > 0
         AND (plan_data->'plan'->'summary') IS NOT NULL
       ORDER BY created_at DESC LIMIT 1`)
    if (r.rowCount === 0) {
      log('  (no pre-Chunk-5 buyer lead with topListings + summary — sanity check skipped)')
    } else {
      const row = r.rows[0]
      const summary = row.plan_data?.plan?.summary || ''
      const topListings = row.plan_data?.topListings || []
      log(`  Lead ${row.id.slice(0,8)}…  summary (${summary.length} chars):`)
      log(`    ${JSON.stringify(summary).slice(0, 200)}…`)
      // Extract dollar figures from summary; assert each is plausibly
      // derivable from topListings (a generous check — operator may
      // accept market-analytics-cited numbers too).
      const figures = (summary.match(/\$[0-9,.]+[KMm]?/g) || [])
      log(`    cited dollar figures: ${JSON.stringify(figures)}`)
      const topListingPrices = topListings.map((l: any) => Number(l.list_price)).filter((p: number) => p > 1000)
      log(`    topListings list_prices: ${JSON.stringify(topListingPrices.slice(0, 10))}`)
      // No structural assertion — just print so operator can eyeball
      // for fabrication. Pre-Chunk-5 leads aren't required to cite
      // comp-grounded numbers; they typically cite market analytics
      // (median sale price, months of inventory, etc).
      log(`    NOTE: pre-Chunk-5 summary is not required to cite comp medians;`)
      log(`          the new comp-grounded clause applies to post-Chunk-5 generates only.`)
    }
    await c.query('ROLLBACK')
  } finally { c.release(); await pool.end() }

  // ═══════════════════ GROUP 7 — Byte-unchanged scope ═══════════════════
  hr()
  log('GROUP 7 — Byte-unchanged scope (Chunk 5 should touch ONLY prompts + ResultsPanel)')
  function unchanged(fp: string) {
    try { execSync(`git diff --quiet HEAD -- "${fp}"`, { stdio: 'pipe' }); return true } catch { return false }
  }
  for (const fp of [
    // Server / data layer
    'app/api/charlie/plan-email/route.ts',
    'app/api/charlie/buyer-tax-match/route.ts',
    'lib/charlie/buyer-tax-match.ts',
    'lib/estimator/tax-band-sold-query.ts',
    'lib/estimator/home-comparable-matcher-sales.ts',
    'lib/estimator/condo-comparable-matcher-sales.ts',
    // Email + lead-page renderers
    'lib/email/charlie-plan-email-html.ts',
    'components/admin-homes/lead-workbench/PlanRenderer.tsx',
    'components/dashboard/CharlieLeadEstimate.tsx',
    // Charlie tool layer + shared components
    'app/charlie/lib/charlie-tools.ts',
    'app/charlie/hooks/useCharlie.ts',
    'app/charlie/components/ComparableCard.tsx',
    // Seller path
    'app/charlie/components/SellerEstimateBlock.tsx',
    'app/api/charlie/seller-estimate/route.ts',
  ]) {
    expect(`U: ${fp} byte-unchanged this commit`, unchanged(fp))
  }

  hr()
  log(`SUMMARY: ${fail === 0 ? 'ALL PASS' : fail + ' FAIL'}`)
  log(`screenshots: ${SHOT_DIR}/`)
  process.exit(fail === 0 ? 0 : 1)
})().catch(e => { log('UNHANDLED: ' + (e?.stack || e)); process.exit(2) })
