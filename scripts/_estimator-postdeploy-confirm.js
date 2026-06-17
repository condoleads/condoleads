// W-ESTIMATOR-POSTDEPLOY-CONFIRM — read-only. Tenant-scoped, BEGIN
// READ ONLY → ROLLBACK. Surfaces any lead written in the last
// 30 minutes (the operator's just-submitted estimator test would
// fall in this window). Also includes a property_details preview
// to distinguish estimator from other paths.
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const WALLIAM = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'

;(async () => {
  const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL })
  const c = await pool.connect()
  try {
    await c.query('BEGIN READ ONLY')

    console.log('── Last 30 minutes: ANY new WALLiam leads ──\n')
    const r30 = await c.query(`
      SELECT id, source, lead_origin_route, intent,
             contact_email, contact_name,
             agent_id, tenant_id,
             property_details->>'buildingName'   AS pd_building,
             property_details->'workingDoc'->>'type' AS workingdoc_type,
             property_details->>'estimatedPrice' AS estimated_price,
             created_at,
             NOW() - created_at AS age
        FROM leads
       WHERE tenant_id = $1
         AND created_at >= NOW() - INTERVAL '30 minutes'
       ORDER BY created_at DESC
    `, [WALLIAM])

    if (r30.rowCount === 0) {
      console.log('  ZERO new WALLiam leads in the last 30 minutes.')
      console.log('  → either the operator has not submitted YET, or the submit')
      console.log('    failed to write a row.')
    } else {
      console.log(`  ${r30.rowCount} row(s):\n`)
      for (const r of r30.rows) {
        const ts = r.created_at.toISOString().slice(0, 19).replace('T', ' ')
        const ageMs = Number(r.age?.milliseconds ?? 0)
        console.log(`  ${ts}  (age ≈ ${r.age?.minutes ?? '?'} min)`)
        console.log(`    id:               ${r.id}`)
        console.log(`    source:           ${r.source}`)
        console.log(`    lead_origin_route: ${r.lead_origin_route ?? 'NULL'}`)
        console.log(`    intent:           ${r.intent ?? 'NULL'}`)
        console.log(`    contact_email:    ${r.contact_email}`)
        console.log(`    contact_name:     ${r.contact_name}`)
        console.log(`    agent_id:         ${r.agent_id}`)
        console.log(`    tenant_id:        ${r.tenant_id}`)
        console.log(`    tenant matches WALLiam: ${r.tenant_id === WALLIAM ? '✓ YES' : '✗ NO (' + r.tenant_id + ')'}`)
        console.log(`    pd_building:      ${r.pd_building ?? '—'}`)
        console.log(`    workingdoc_type:  ${r.workingdoc_type ?? '—'}  (estimator path stamps 'home' or 'condo')`)
        console.log(`    estimated_price:  ${r.estimated_price ?? '—'}`)
        console.log('')
      }
    }

    // Cross-reference: distinguish estimator-source from other paths.
    console.log('── Of those, which look like ESTIMATOR submits? ──\n')
    const est30 = await c.query(`
      SELECT id, source, contact_email, created_at,
             property_details->'workingDoc'->>'type' AS workingdoc_type
        FROM leads
       WHERE tenant_id = $1
         AND created_at >= NOW() - INTERVAL '30 minutes'
         AND (
              source ILIKE '%estimator%'
           OR lead_origin_route ILIKE '%estimator%'
           OR source ILIKE '%sale_offer%'
           OR source ILIKE '%lease_offer%'
           OR property_details ? 'workingDoc'
         )
       ORDER BY created_at DESC
    `, [WALLIAM])
    if (est30.rowCount === 0) {
      console.log('  ZERO estimator-pattern leads in last 30 min.')
    } else {
      for (const r of est30.rows) {
        console.log(`  ${r.created_at.toISOString()}  source=${r.source}  wd=${r.workingdoc_type ?? '—'}  ${r.contact_email}`)
      }
    }

    // Final sanity: confirm WALLiam tenant + King Shah agent
    console.log('\n── Sanity: WALLiam tenant + King Shah agent IDs (for cross-check) ──')
    console.log(`  WALLiam tenant_id expected: ${WALLIAM}`)
    console.log(`  King Shah agent_id expected: fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe`)

    await c.query('ROLLBACK')
  } finally { c.release(); await pool.end() }
})().catch(e => { console.error('FATAL', e); process.exit(1) })
