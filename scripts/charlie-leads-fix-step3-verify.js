// scripts/charlie-leads-fix-step3-verify.js
// W-CHARLIE-LEADS-FIX STEP 3 — real-render verify (jsdom-free).
// Renders the admin PlanRenderer's seller branch (via React's
// renderToStaticMarkup) against REAL 63b48f13 plan_data pulled from
// production DB under SAVEPOINT (read-only). Asserts each section's
// PRESENT/ABSENT + occurrence count from the rendered static markup —
// NOT source-grep, NOT route-handler probe.
//
// Why jsdom-free + RTL-free: the operator's directive allows either path.
// renderToStaticMarkup gives us a deterministic HTML string of the actual
// rendered component tree, which is what we need to count sections and
// confirm no-duplication. RTL/jsdom adds a DOM but we don't need
// click/keyboard interaction here. tsx/cjs (small, no native deps) loads
// the .tsx source.

require('tsx/cjs')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })
const fs = require('fs')
const path = require('path')

const OUT = path.resolve(__dirname, '..', 'recon', 'REAL-LEADS-FIX-VERIFY.txt')
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, '')
const log = (m) => { console.log(m); fs.appendFileSync(OUT, m + '\n') }
const hr = () => log('─'.repeat(76))

const FIXTURE = '63b48f13-8a03-46be-b4ce-91007da0794a'

;(async () => {
  log('W-CHARLIE-LEADS-FIX STEP 3 — real-render verify')
  log(`run: ${new Date().toISOString()}`)
  log('handle: react-dom/server.renderToStaticMarkup + tsx/cjs (no jsdom)')
  log('')

  hr(); log('PART 0 — pull REAL 63b48f13 plan_data (SAVEPOINT)'); hr()
  const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL })
  const c = await pool.connect()
  let realLead, nullLead
  try {
    await c.query('BEGIN')
    await c.query('SAVEPOINT s1')
    await c.query("SET LOCAL statement_timeout = 0")
    const r = await c.query(
      `SELECT id, contact_name, contact_email, intent, geo_name,
              budget_max, estimated_value_min, estimated_value_max,
              source, source_url, created_at, plan_data, agent_id, tenant_id
         FROM leads WHERE id = $1`, [FIXTURE])
    realLead = r.rows[0]
    // PG returns Date objects for timestamps; in production this row is
    // serialized to JSON over the server→client boundary which produces an
    // ISO string. Coerce here so the component sees what production sees.
    if (realLead?.created_at instanceof Date) realLead.created_at = realLead.created_at.toISOString()
    // ALSO fetch a null-sellerEstimate WALLiam Charlie seller lead for amber-notice test
    const r2 = await c.query(`
      SELECT id, contact_name, contact_email, intent, geo_name,
             budget_max, estimated_value_min, estimated_value_max,
             source, source_url, created_at, plan_data, agent_id, tenant_id
        FROM leads
       WHERE tenant_id = $1 AND intent = 'seller'
         AND lead_origin_route LIKE '%charlie%'
         AND (NOT (plan_data ? 'sellerEstimate')
              OR plan_data->'sellerEstimate' IS NULL
              OR plan_data->'sellerEstimate' = 'null'::jsonb)
       ORDER BY created_at DESC LIMIT 1
    `, [realLead.tenant_id])
    nullLead = r2.rows[0]
    if (nullLead?.created_at instanceof Date) nullLead.created_at = nullLead.created_at.toISOString()
    await c.query('ROLLBACK')
  } finally {
    c.release(); await pool.end()
  }
  log(`real lead pulled: ${realLead.id} (${realLead.contact_name}, intent=${realLead.intent})`)
  log(`  plan_data top keys: ${JSON.stringify(Object.keys(realLead.plan_data || {}).sort())}`)
  log(`  sellerEstimate present? ${!!realLead.plan_data?.sellerEstimate}`)
  log(`  sellerEstimate.comparables count:      ${(realLead.plan_data?.sellerEstimate?.comparables || []).length}`)
  log(`  sellerEstimate.estimate.taxMatch comps: ${(realLead.plan_data?.sellerEstimate?.estimate?.taxMatch?.comparables || []).length}`)
  log(`  sellerEstimate.competingListings:       ${(realLead.plan_data?.sellerEstimate?.competingListings || []).length}`)
  log('')
  if (nullLead) {
    log(`null-sellerEstimate lead: ${nullLead.id} (${nullLead.contact_name}) — for amber-notice path`)
  } else {
    log('WARN: no null-sellerEstimate WALLiam Charlie seller lead found — amber path skipped')
  }
  log('')

  hr(); log('PART 1 — render PlanTab with the SELLER lead'); hr()
  // Import the admin PlanTab component
  const PlanTabModule = require('../components/admin-homes/lead-workbench/PlanRenderer.tsx')
  const PlanTab = PlanTabModule.default
  if (typeof PlanTab !== 'function') {
    log('FAIL: PlanTab is not a React function — got ' + (typeof PlanTab))
    process.exit(1)
  }
  log('PlanTab imported OK — type=function')

  // PlanTab expects { anchorLead, leadFamily }. Render with the seller fixture.
  let html
  try {
    html = renderToStaticMarkup(
      React.createElement(PlanTab, { anchorLead: realLead, leadFamily: [realLead] })
    )
  } catch (e) {
    log(`RENDER ERROR: ${e.message}`)
    log(e.stack?.slice(0, 1500))
    process.exit(1)
  }
  fs.writeFileSync(path.resolve(__dirname, '..', 'recon', 'real-leads-fix-rendered.html'), html)
  log(`renderToStaticMarkup OK — ${html.length} chars`)
  log(`(full markup saved to recon/real-leads-fix-rendered.html)`)
  log('')

  hr(); log('PART 2 — section inventory (occurrence COUNTS — no-duplication assertion)'); hr()
  // Each section appears in the rendered HTML iff the corresponding heading
  // text is present. We use UNIQUE strings (heading text including the
  // distinctive context) to count occurrences. Duplication = count > 1.
  const probes = [
    // ── PlanRenderer's existing sections (must still render exactly ONCE) ──
    { tag: 'PR-MarketIntel',         needle: 'Market Intelligence',                              must: 1 },
    { tag: 'PR-OfferIntel',          needle: 'Offer Intelligence',                               must: 1 },
    { tag: 'PR-BestTime',            needle: 'Best Time to ',                                    must: 1 },
    { tag: 'PR-PriceByHomeType',     needle: 'Price by Home Type',                               must: 1 },
    { tag: 'PR-SellerProfile',       needle: 'Seller Profile',                                   must: 1 },
    // PlanRenderer renders "Seller Strategy" in TWO legitimate places: the
    // dark-bg page header ("💰 Seller Strategy — {geo}") and the Summary
    // gradient card ("✨ Your Seller Strategy"). Both pre-existed
    // W-CHARLIE-LEADS-FIX. Probe each by its unique prefix to distinguish.
    { tag: 'PR-SellerStrategy-Hdr',  needle: '💰 Seller Strategy',                                must: 1 },
    { tag: 'PR-SummaryCard',         needle: 'Your Seller Strategy',                              must: 1 },
    // Suppression check: CharlieLeadEstimate's planSummary section (which
    // has the heading text "Seller Strategy" inside a blue-bg card) must
    // NOT render because we override view.present.planSummary=false. The
    // global "Seller Strategy" substring count is 2 (header + Summary).
    // If suppression failed, we'd see 3.
    { tag: 'global-strategy-count',  needle: 'Seller Strategy',                                   must: 2 },
    // ── CharlieLeadEstimate-mounted sections (NEW — should now render 1×) ──
    { tag: 'CLE-PriceCard',          needle: 'Estimated value',                                  must: 1 },
    { tag: 'CLE-TierRail',           needle: 'Confidence by Area',                               must: 1 },
    { tag: 'CLE-ComparableSold',     needle: 'Comparable Sold',                                  must: 1 },
    { tag: 'CLE-TaxMatched',         needle: 'Tax-Matched',                                      must: 1 },
    { tag: 'CLE-TaxMatchPill',       needle: 'Tax-matched estimate',                             must: 1 },
    { tag: 'CLE-Competing',          needle: 'Competing For Sale',                               must: 1 },
    { tag: 'CLE-PricingRisk',        needle: 'Pricing Strategy',                                 must: 1 },
    { tag: 'CLE-AIDisclaimer',       needle: 'AI Disclaimer',                                    must: 1 },
    // ── Sections SUPPRESSED inside the mount (to avoid duplication) ──
    // The CharlieLeadEstimate component has these but the present-flag
    // overrides should hide them. Counts here should each be 0 inside the
    // CLE block but the PlanRenderer block still renders them — so the
    // GLOBAL count should be EXACTLY 1 (already asserted above).
  ]

  log('TAG'.padEnd(22) + 'NEEDLE'.padEnd(32) + 'COUNT  VERDICT')
  log('-'.repeat(76))
  let failures = 0
  for (const p of probes) {
    const re = new RegExp(p.needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
    const matches = (html.match(re) || []).length
    let verdict
    if (p.must === 1) {
      verdict = matches === 1 ? 'PASS' : (matches === 0 ? 'FAIL (missing)' : `FAIL (dup ×${matches})`)
    } else {
      verdict = matches === p.must ? 'PASS' : `FAIL (count=${matches})`
    }
    if (!verdict.startsWith('PASS')) failures++
    log(`${p.tag.padEnd(22)}${p.needle.padEnd(32)}${String(matches).padEnd(6)} ${verdict}`)
  }
  log('-'.repeat(76))
  log(`section verdict: ${probes.length - failures}/${probes.length} PASS, ${failures} FAIL`)
  log('')

  hr(); log('PART 3 — null-sellerEstimate path (amber "no estimate captured" notice)'); hr()
  if (nullLead) {
    let nullHtml
    try {
      nullHtml = renderToStaticMarkup(
        React.createElement(PlanTab, { anchorLead: nullLead, leadFamily: [nullLead] })
      )
    } catch (e) {
      log(`null-path RENDER ERROR: ${e.message}`)
      log(e.stack?.slice(0, 1000))
      process.exit(1)
    }
    fs.writeFileSync(path.resolve(__dirname, '..', 'recon', 'real-leads-fix-null-rendered.html'), nullHtml)
    log(`renderToStaticMarkup (null) OK — ${nullHtml.length} chars`)
    const amberMatches = (nullHtml.match(/No estimate captured/g) || []).length
    const amberCopyMatches = (nullHtml.match(/Charlie seller lead pre-dates/g) || []).length
    const noPriceCard = (nullHtml.match(/Estimated value/g) || []).length === 0
    const noTaxMatch = (nullHtml.match(/Tax-Matched/g) || []).length === 0
    const noComparable = (nullHtml.match(/Comparable Sold/g) || []).length === 0
    log(`amber heading "No estimate captured" count: ${amberMatches}  → ${amberMatches === 1 ? 'PASS' : 'FAIL'}`)
    log(`amber copy "pre-dates the estimate-persistence change" count: ${amberCopyMatches}  → ${amberCopyMatches === 1 ? 'PASS' : 'FAIL'}`)
    log(`no Estimated value (price card NOT rendered when sellerEstimate=null): ${noPriceCard ? 'PASS' : 'FAIL'}`)
    log(`no Tax-Matched (NOT rendered when sellerEstimate=null):                ${noTaxMatch ? 'PASS' : 'FAIL'}`)
    log(`no Comparable Sold (NOT rendered when sellerEstimate=null):            ${noComparable ? 'PASS' : 'FAIL'}`)
    if (amberMatches === 1 && amberCopyMatches === 1 && noPriceCard && noTaxMatch && noComparable) {
      log('  null path verdict: PASS')
    } else {
      log('  null path verdict: FAIL')
      failures++
    }
  } else {
    log('  null path: SKIP (no null-sellerEstimate lead available)')
  }
  log('')

  hr(); log('FINAL VERDICT'); hr()
  log(`${failures === 0 ? 'PASS' : 'FAIL'} (${failures} failure(s) across ${probes.length} section probes + amber path)`)
  log('')
  log('Files:')
  log(`  ${OUT}`)
  log(`  recon/real-leads-fix-rendered.html       (full PlanTab markup, seller fixture)`)
  if (nullLead) log(`  recon/real-leads-fix-null-rendered.html  (amber-path markup)`)
})().catch(e => { log('CRASH: ' + e.stack); process.exit(1) })
