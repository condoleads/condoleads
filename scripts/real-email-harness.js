// scripts/real-email-harness.js
// W-CHARLIE-EMAIL REAL-RENDER HARNESS 3 — email delivery path
// Read-only. No edits. SAVEPOINT-isolated DB read.
//
// Renders the email via the SAME buildRichPlanEmail function the live
// plan-email route uses, fed by REAL plan_data.sellerEstimate from
// 63b48f13 + 1b2a5b50 (most recent post-CV-2 lead). Tests whether the
// live email path actually renders Tax-Matched when plan_data carries it.

require('tsx/cjs')
const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })
const fs = require('fs')
const path = require('path')

const OUT = path.resolve(__dirname, '..', 'recon', 'REAL-EMAIL.txt')
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, '')
const log = (m) => { console.log(m); fs.appendFileSync(OUT, m + '\n') }
const hr = () => log('─'.repeat(76))

const FIXTURE = '63b48f13-8a03-46be-b4ce-91007da0794a'
const RECENT  = '1b2a5b50'

// Same import the live route uses
const { buildRichPlanEmail } = require('../lib/email/charlie-plan-email-html.ts')

function renderForLead(label, lead, outFile) {
  log('')
  hr(); log(`RENDER: ${label} — lead ${lead.id} (created ${lead.created_at})`); hr()
  const pd = lead.plan_data || {}
  log(`  plan_data top keys: ${JSON.stringify(Object.keys(pd).sort())}`)
  log(`  sellerEstimate present? ${!!pd.sellerEstimate}`)
  if (pd.sellerEstimate) {
    log(`  sellerEstimate.estimate.taxMatch present? ${!!pd.sellerEstimate.estimate?.taxMatch}`)
    log(`  sellerEstimate.estimate.taxMatch.comparables count: ${(pd.sellerEstimate.estimate?.taxMatch?.comparables || []).length}`)
    log(`  sellerEstimate.estimate.taxMatch.estimatedPrice: ${pd.sellerEstimate.estimate?.taxMatch?.estimatedPrice}`)
    log(`  sellerEstimate.comparables count: ${(pd.sellerEstimate.comparables || []).length}`)
    log(`  sellerEstimate.competingListings count: ${(pd.sellerEstimate.competingListings || []).length}`)
  }
  // Build the EXACT args the live route passes (plan-email/route.ts L200)
  // For args sourced from external state (userName, agent chain, brandName,
  // domain, baseUrl, sourceUrl, vipCredit fields), use neutral placeholders
  // — they don't affect tax-match rendering.
  const html = buildRichPlanEmail({
    userName:        lead.contact_name || 'there',
    userEmail:       lead.contact_email || 'test@test.com',
    planType:        pd.planType,
    plan:            pd.plan,
    analytics:       pd.analytics,
    listings:        [],
    agent:           null,
    geoName:         pd.plan?.geoName || null,
    comparables:     [],
    sellerEstimate:  pd.sellerEstimate || null,
    vipCreditUsed:   false,
    vipCreditPlansUsed: 0,
    vipCreditTotal:  1,
    blocks:          [],
    brandName:       'WALLiam',
    domain:          'walliam.ca',
    baseUrl:         'https://www.walliam.ca',
    sourceUrl:       null,
  })
  fs.writeFileSync(outFile, html)
  log(`  rendered HTML: ${html.length} chars → ${outFile}`)
  // Section probes
  const probes = [
    ['Tax-Matched section',      /Tax-Matched \(\d+\)/],
    ['Tax-matched estimate pill', /Tax-matched estimate/],
    ['Tier rail (Confidence by Area)', /Confidence by Area/],
    ['Price card (Estimated Value)',    /Estimated Value/],
    ['Comparable Sold',          /Comparable Sold \(\d+\)/],
    ['Competing For Sale',       /Competing For Sale/],
    ['Pricing Strategy',         /Pricing Strategy/],
  ]
  log('')
  log('  Section inventory (real HTML):')
  log('  ' + '-'.repeat(72))
  for (const [name, re] of probes) {
    const m = html.match(re)
    log(`  ${name.padEnd(34)} ${m ? 'PRESENT — "' + m[0] + '"' : 'ABSENT'}`)
  }
}

;(async () => {
  log('W-CHARLIE-EMAIL REAL-RENDER HARNESS 3 — email delivery path')
  log(`run: ${new Date().toISOString()}`)
  log('handle: live buildRichPlanEmail (charlie-plan-email-html.ts) via tsx/cjs')
  log('source: REAL plan_data from production DB, SAVEPOINT-isolated read')
  log('')

  hr(); log('STEP 1 — route threading trace'); hr()
  log('  app/api/charlie/plan-email/route.ts')
  log('    L63:  destructures { sellerEstimate, plan, analytics, planType, ... } from req.json()')
  log('    L77:  STALE-SESSION detector — warns iff sellerEstimate.estimate.bestGeoTier missing')
  log('          (does NOT block; informational console.warn)')
  log('    L172: SAVES SLIM plan_data.sellerEstimate to leads row:')
  log('          { estimate: sellerEstimate.estimate || null,')
  log('            comparables, competingListings, buildingName, subjectAddress,')
  log('            geoLevel, intent, path }')
  log('          → estimate.taxMatch is INSIDE estimate; slim copy carries it.')
  log('    L200: PASSES sellerEstimate WHOLESALE to buildRichPlanEmail')
  log('          (NOT the slim copy — the live request body unchanged).')
  log('          NO reshape, NO flatten, NO field drop.')
  log('')
  log('  Trigger: app/charlie/hooks/useCharlie.ts:456-474')
  log('    body: { sellerEstimate: stateRef.current.sellerEstimate, ... }')
  log('    state.sellerEstimate is set by setSellerEstimate(data) at L262-271,')
  log('    where data is the full onEstimateReady payload from')
  log('    SellerEstimateRunner.tsx:205-214:')
  log('      { success, estimate, comparables, buildingName, marketAnalytics,')
  log('        analyticsGeoType, analyticsGeoId, intent, path, subjectAddress }')
  log('    estimate IS the matcher output (result.data) — contains taxMatch')
  log('    when the matcher produced one. NO field drop along this path.')
  log('')
  log('  Builder: lib/email/charlie-plan-email-html.ts')
  log('    L334: const view = buildSellerEstimateView({ planType, plan, analytics, sellerEstimate })')
  log('    L388: const taxComps = (sellerEstimate?.estimate?.taxMatch?.comparables || [])')
  log('    L391: const taxMatchHtml = taxComps.length > 0 ? `<...Tax-Matched (N)...>` : ""')
  log('          GATE: when taxComps.length === 0, silent-omit the section')
  log('          (same pattern Charlie in-chat had until W-CHARLIE-FIX/GAP 2;')
  log('          email still has the silent-hide pattern post-GAP-2 fix).')

  hr(); log('STEP 1b — CV-2 deploy timing vs lead creation'); hr()
  log('  CV-2 commit 4f0ffc4 (added Tax-Matched section to email):')
  log('    git-authored: 2026-06-14 06:23:10 -0400 (Eastern)')
  log('  Live deploy: after push to origin/main (in this session) on 2026-06-14.')
  log('  Lead 63b48f13 created: 2026-06-13 17:09 (~13.5 hours BEFORE CV-2 commit)')
  log('  Lead 9e8d25b3 created: 2026-06-13 19:13 (~11 hours BEFORE CV-2 commit)')
  log('  Lead 1b2a5b50 created: 2026-06-14 11:58 (~5 hours AFTER CV-2 commit)')
  log('  → 63b48f13 was emailed by the pre-CV-2 builder. No Tax-Matched section')
  log('    existed in the email template at the time of send. The "delivered')
  log('    email missing tax-match" observation for 63b48f13 is timing-driven.')

  const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL })
  const c = await pool.connect()
  let lead63, lead1b
  try {
    await c.query('BEGIN'); await c.query('SAVEPOINT s1')
    await c.query("SET LOCAL statement_timeout = 0")
    const r1 = await c.query(
      `SELECT id, contact_name, contact_email, plan_data, created_at FROM leads WHERE id = $1`, [FIXTURE])
    lead63 = r1.rows[0]
    const r2 = await c.query(
      `SELECT id, contact_name, contact_email, plan_data, created_at FROM leads
        WHERE id::text LIKE $1 || '%' LIMIT 1`, [RECENT])
    lead1b = r2.rows[0] || null
    await c.query('ROLLBACK')
  } finally {
    c.release(); await pool.end()
  }

  hr(); log('STEP 2 — render REAL path against real plan_data (current CV-2+ builder)'); hr()
  renderForLead('63b48f13 (Finaltest110, pre-CV-2 send)', lead63,
    path.resolve(__dirname, '..', 'recon', 'real-email-render-63b48f13.html'))
  if (lead1b) {
    renderForLead('1b2a5b50 (most recent post-CV-2 send)', lead1b,
      path.resolve(__dirname, '..', 'recon', 'real-email-render-1b2a5b50.html'))
  } else {
    log('')
    log('  no 1b2a5b50 lead found — skipping post-CV-2 sample')
  }

  hr(); log('STEP 3 — DIAGNOSIS'); hr()
  log('')
  log('Operator complaint: delivered email missing tax-match.')
  log('Three candidate causes:')
  log('  (a) Operator email was pre-CV-2 deploy (timing)')
  log('  (b) Operator email was for a lead whose sellerEstimate lacked taxMatch')
  log('      (0-comp case — silent-omit by the same pattern as Charlie GAP 2)')
  log('  (c) Real threading bug dropping taxMatch between trigger → route → builder')
  log('')
  log('Evidence:')
  log('  Route threading (STEP 1): NO reshape, NO drop. sellerEstimate is passed')
  log('    wholesale to buildRichPlanEmail. (c) RULED OUT by source trace.')
  log('  Timing (STEP 1b): 63b48f13 created 13.5h BEFORE CV-2 commit. Its email')
  log('    was rendered by the pre-CV-2 builder which had NO Tax-Matched section.')
  log('    9e8d25b3 same — created 11h BEFORE CV-2.')
  log('  Render verify (STEP 2): if the current builder renders Tax-Matched')
  log('    correctly when fed 63b48f13.plan_data.sellerEstimate, that confirms')
  log('    the threading + builder work — the original delivered email lacked')
  log('    tax-match because the builder lacked the section at send time.')
  log('  Empty-taxMatch class (b): when the matcher returns no comps in band,')
  log('    plan_data.sellerEstimate.estimate.taxMatch.comparables is empty')
  log('    and the builder silent-omits (L391 gate). Same silent-hide pattern')
  log('    as Charlie in-chat had pre-W-CHARLIE-FIX. NOT FIXED for email.')
  log('')
  log('Verdict pending real-render results above. See section inventories.')
  log('')
  log('Files:')
  log(`  ${OUT}`)
  log(`  recon/real-email-render-63b48f13.html`)
  if (lead1b) log(`  recon/real-email-render-1b2a5b50.html`)
})().catch(e => { log('CRASH: ' + e.stack); process.exit(1) })
