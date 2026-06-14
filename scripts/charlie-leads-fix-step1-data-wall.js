// scripts/charlie-leads-fix-step1-data-wall.js
// W-CHARLIE-LEADS-FIX STEP 1 — data-wall verdict.
// SAVEPOINT-isolated read. No writes. Resolves the contradiction between
// PlanRenderer.tsx:14's comment ("sellerEstimate is API-time-only, not in
// plan_data, unrenderable") and CV-0/1/2 smokes that found lead 63b48f13
// has plan_data.sellerEstimate populated.

const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })
const fs = require('fs')
const path = require('path')

const OUT = path.resolve(__dirname, '..', 'recon', 'CHARLIE-LEADS-FIX-STEP1.txt')
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, '')
const log = (m) => { console.log(m); fs.appendFileSync(OUT, m + '\n') }
const hr = () => log('─'.repeat(76))

const FIXTURE = '63b48f13-8a03-46be-b4ce-91007da0794a'

;(async () => {
  log('W-CHARLIE-LEADS-FIX STEP 1 — data-wall verdict')
  log(`run: ${new Date().toISOString()}`)
  log('')

  const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL })
  const c = await pool.connect()
  try {
    await c.query('BEGIN')
    await c.query('SAVEPOINT s1')
    await c.query("SET LOCAL statement_timeout = 0")
    await c.query("SET LOCAL idle_in_transaction_session_timeout = 0")

    hr(); log(`PART 1 — lead ${FIXTURE} plan_data top-level keys`); hr()
    const r1 = await c.query(
      `SELECT plan_data, lead_origin_route, intent, contact_name, agent_id, tenant_id
         FROM leads WHERE id = $1`, [FIXTURE])
    if (r1.rows.length === 0) {
      log('FAIL: lead not found')
    } else {
      const row = r1.rows[0]
      log(`  contact_name:       ${row.contact_name}`)
      log(`  lead_origin_route:  ${row.lead_origin_route}`)
      log(`  intent:             ${row.intent}`)
      log(`  agent_id:           ${row.agent_id}`)
      log(`  tenant_id:          ${row.tenant_id}`)
      const pd = row.plan_data || {}
      const topKeys = Object.keys(pd).sort()
      log(`  plan_data top keys: ${JSON.stringify(topKeys)}`)
      const se = pd.sellerEstimate
      log(`  plan_data.sellerEstimate present? ${se ? 'YES' : 'NO'}`)
      if (se) {
        log(`  sellerEstimate top-level keys: ${JSON.stringify(Object.keys(se).sort())}`)
        log(`  sellerEstimate.estimate present?       ${!!se.estimate}`)
        log(`  sellerEstimate.comparables count:      ${(se.comparables || []).length}`)
        log(`  sellerEstimate.competingListings count: ${(se.competingListings || []).length}`)
        if (se.estimate?.taxMatch) {
          log(`  sellerEstimate.estimate.taxMatch.comparables count: ${(se.estimate.taxMatch.comparables || []).length}`)
          log(`  sellerEstimate.estimate.taxMatch.estimatedPrice:    ${se.estimate.taxMatch.estimatedPrice}`)
        } else {
          log('  sellerEstimate.estimate.taxMatch: (absent)')
        }
      }
    }

    hr(); log('PART 2 — coverage: WALLiam Charlie seller leads with plan_data.sellerEstimate'); hr()
    // Find the WALLiam tenant id first
    const tr = await c.query(`SELECT id, name FROM tenants WHERE domain LIKE '%walliam%' OR name ILIKE '%walliam%' LIMIT 5`)
    log(`  tenant rows: ${tr.rows.length}`)
    for (const t of tr.rows) log(`    tenant ${t.id}: ${t.name}`)
    const walliamTenantId = tr.rows[0]?.id
    if (!walliamTenantId) {
      log('  WARN: no WALLiam tenant found — skipping per-tenant coverage')
    } else {
      // Coverage among Charlie SELLER leads in WALLiam tenant
      const q = `
        SELECT
          COUNT(*) FILTER (WHERE plan_data ? 'sellerEstimate' AND plan_data->'sellerEstimate' IS NOT NULL AND plan_data->'sellerEstimate' != 'null'::jsonb)  AS with_se,
          COUNT(*) FILTER (WHERE NOT (plan_data ? 'sellerEstimate') OR plan_data->'sellerEstimate' IS NULL OR plan_data->'sellerEstimate' = 'null'::jsonb)   AS without_se,
          COUNT(*)                                                                                      AS total
          FROM leads
         WHERE tenant_id = $1
           AND intent = 'seller'
           AND lead_origin_route IS NOT NULL
           AND lead_origin_route LIKE '%charlie%'`
      const cov = await c.query(q, [walliamTenantId])
      const row = cov.rows[0]
      log(`  WALLiam Charlie SELLER leads:`)
      log(`    total:                 ${row.total}`)
      log(`    with sellerEstimate:   ${row.with_se}`)
      log(`    without sellerEstimate:${row.without_se}`)
      if (Number(row.total) > 0) {
        const pct = (Number(row.with_se) / Number(row.total) * 100).toFixed(1)
        log(`    coverage:              ${pct}%`)
      }

      // Sample 5 most-recent leads to verify shape
      const sample = await c.query(`
        SELECT id, contact_name, lead_origin_route, created_at,
               (plan_data ? 'sellerEstimate' AND plan_data->'sellerEstimate' IS NOT NULL AND plan_data->'sellerEstimate' != 'null'::jsonb) AS has_se
          FROM leads
         WHERE tenant_id = $1
           AND intent = 'seller'
           AND lead_origin_route IS NOT NULL
           AND lead_origin_route LIKE '%charlie%'
         ORDER BY created_at DESC
         LIMIT 10`, [walliamTenantId])
      log(`  recent 10 (most→oldest):`)
      for (const r of sample.rows) {
        log(`    ${r.created_at.toISOString().slice(0,16)}  hasSE=${r.has_se ? 'Y' : 'N'}  ${r.id.slice(0,8)}…  ${r.lead_origin_route}  ${r.contact_name || '(no name)'}`)
      }
    }

    hr(); log('PART 3 — admin route + PlanRenderer SELLER branch source verdict'); hr()
    log('  Route: app/admin-homes/leads/[id]/page.tsx')
    log('         → mounts LeadWorkbenchClient.tsx (server → client handoff)')
    log('         → LeadWorkbenchClient.tsx:150  <PlanTab anchorLead={…} leadFamily={…} />')
    log('         → PlanTab = components/admin-homes/lead-workbench/PlanRenderer.tsx')
    log('')
    log('  PlanRenderer SELLER branch (n.isBuyer === false):')
    log('    L226-227: headerLabel = "Seller Strategy"')
    log('    L262:     <Profile norm={n} />        — Seller Profile section')
    log('    L290:     Market Intelligence section')
    log('    L319:     Offer Intelligence section')
    log('    L349:     Best Time to Sell section')
    log('    L374:     Price by Home Type section')
    log('    L462-463: "Comparable Sales" — capped topListings (subset)')
    log('    L513:     Assigned Agent (brand chrome)')
    log('')
    log('  WHAT PLANRENDERER LACKS (per L14 comment) but plan_data DOES carry:')
    log('    - sellerEstimate.estimate (price card)')
    log('    - sellerEstimate.estimate.tiers (4-row tier rail "Confidence by Area")')
    log('    - sellerEstimate.comparables (full Comparable Sold + tier chips)')
    log('    - sellerEstimate.estimate.taxMatch (Tax-Matched + chips + pill)')
    log('    - sellerEstimate.competingListings (Competing For Sale)')
    log('    - PricingRiskBlock content (Pricing Strategy & Risk)')
    log('  These are exactly the 14 sections CV-1 added to CharlieLeadEstimate.')
    log('  The plan_data CARRIES the data; the renderer just doesn\'t consume it.')
    log('')
    log('  Cleanest mount point (preserves PlanRenderer stats, no duplication):')
    log('    Replace L462-463 "Comparable Sales (topListings)" subsection with a')
    log('    CharlieLeadEstimate mount fed by buildSellerEstimateView(plan_data).')
    log('    CharlieLeadEstimate carries: price card + tier rail + Comparable Sold')
    log('    (the full version with tier chips, NOT the topListings subset) +')
    log('    Tax-Matched + Competing + Pricing Strategy & Risk. The PlanRenderer')
    log('    stats above (Market Intel/Offer Intel/Best Time/Price by Home Type/')
    log('    Profile/Seller Strategy header) remain INTACT and unmoved — they')
    log('    feed from plan_data.analytics (not plan_data.sellerEstimate) and')
    log('    are correctly rendered by PlanRenderer already.')
    log('    Duplication check: CharlieLeadEstimate ALSO has Market Intel/Price')
    log('    by Home Type sections (CV-1). To avoid duplication, those sections')
    log('    inside CharlieLeadEstimate must be SUPPRESSED on the admin mount')
    log('    (since PlanRenderer renders them). Use the view.present flags OR a')
    log('    new optional `omit` prop on CharlieLeadEstimate. STEP 2 picks one.')

    await c.query('ROLLBACK')
  } finally {
    c.release()
    await pool.end()
  }

  hr(); log('OUTPUT FILES'); hr()
  log(`  ${OUT}`)
})().catch(e => { log('CRASH: ' + e.stack); process.exit(1) })
