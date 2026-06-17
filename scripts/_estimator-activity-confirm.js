// W-ESTIMATOR-ACTIVITY-CONFIRM — read-only, tenant-scoped, BEGIN/ROLLBACK.
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')
const W = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
;(async () => {
  const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL })
  const c = await pool.connect()
  try {
    await c.query('BEGIN READ ONLY')

    console.log('── 1. user_activities, WALLiam, last 10 min ──\n')
    const a = await c.query(`
      SELECT id, activity_type, contact_email, agent_id, created_at,
             activity_data->>'buildingName' AS building,
             activity_data->>'listingId'    AS listing_id,
             activity_data->>'unitNumber'   AS unit
        FROM user_activities
       WHERE tenant_id = $1
         AND created_at >= NOW() - INTERVAL '10 minutes'
       ORDER BY created_at DESC
    `, [W])
    if (a.rowCount === 0) {
      console.log('  ZERO new activity rows under WALLiam in last 10 min.')
    } else {
      console.log(`  ${a.rowCount} row(s):`)
      for (const r of a.rows) {
        const ts = r.created_at.toISOString().slice(0,19).replace('T',' ')
        console.log(`    ${ts}  type=${r.activity_type}`)
        console.log(`      id:       ${r.id}`)
        console.log(`      email:    ${r.contact_email}`)
        console.log(`      agent_id: ${r.agent_id}`)
        console.log(`      building: ${r.building ?? '—'}`)
        console.log(`      listing:  ${r.listing_id ?? '—'}  unit=${r.unit ?? '—'}`)
      }
    }

    console.log('\n── 2. leads, WALLiam, last 10 min (last 3 with hierarchy chain) ──\n')
    const l = await c.query(`
      SELECT id, source, lead_origin_route, intent,
             agent_id, manager_id, area_manager_id, tenant_admin_id, tenant_id,
             contact_email, contact_name, created_at,
             property_details->>'buildingName' AS building
        FROM leads
       WHERE tenant_id = $1
         AND created_at >= NOW() - INTERVAL '10 minutes'
       ORDER BY created_at DESC
       LIMIT 3
    `, [W])
    if (l.rowCount === 0) {
      console.log('  ZERO new lead rows under WALLiam in last 10 min.')
    } else {
      console.log(`  ${l.rowCount} row(s):\n`)
      for (const r of l.rows) {
        const ts = r.created_at.toISOString().slice(0,19).replace('T',' ')
        console.log(`    ${ts}`)
        console.log(`      id:               ${r.id}`)
        console.log(`      source:           ${r.source}`)
        console.log(`      lead_origin_route: ${r.lead_origin_route ?? 'NULL'}`)
        console.log(`      intent:           ${r.intent ?? 'NULL'}`)
        console.log(`      contact:          ${r.contact_name} <${r.contact_email}>`)
        console.log(`      building:         ${r.building ?? '—'}`)
        console.log(`      ── chain ──`)
        console.log(`        tenant_id:        ${r.tenant_id}   ${r.tenant_id === W ? '✓ WALLiam' : '✗ MISMATCH'}`)
        console.log(`        agent_id:         ${r.agent_id ?? 'NULL'}        ${r.agent_id ? '✓' : '✗ NULL'}`)
        console.log(`        manager_id:       ${r.manager_id ?? 'NULL'}      ${r.manager_id ? '✓' : '— (none in chain)'}`)
        console.log(`        area_manager_id:  ${r.area_manager_id ?? 'NULL'} ${r.area_manager_id ? '✓' : '— (none in chain)'}`)
        console.log(`        tenant_admin_id:  ${r.tenant_admin_id ?? 'NULL'} ${r.tenant_admin_id ? '✓' : '— (none in chain)'}`)
        console.log('')
      }
    }

    // Cross-check: for any activity row found, was there a matching
    // lead written ~same time?
    if (a.rowCount > 0 && l.rowCount > 0) {
      console.log('── 3. Cross-check: activity + lead align? ──')
      const aEmails = new Set(a.rows.map(r => r.contact_email))
      const lEmails = new Set(l.rows.map(r => r.contact_email))
      const intersect = [...aEmails].filter(e => lEmails.has(e))
      console.log(`  activity emails: ${[...aEmails].join(', ')}`)
      console.log(`  lead emails:     ${[...lEmails].join(', ')}`)
      console.log(`  same-email pairs: ${intersect.join(', ') || '(none)'}`)
    }

    await c.query('ROLLBACK')
  } finally { c.release(); await pool.end() }
})().catch(e => { console.error('FATAL', e); process.exit(1) })
