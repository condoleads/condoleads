// scripts/_estimator-postdeploy-leads-probe.js
//
// Check live DB: any new estimator-sourced leads under WALLiam since
// e79c670 was pushed (~few hours ago)? Read-only.
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const WALLIAM = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
// e79c670 pushed: 2026-06-17 (today). Look at last 24h for any new
// estimator-sourced lead.
;(async () => {
  const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL })
  const c = await pool.connect()
  try {
    await c.query('BEGIN READ ONLY')

    console.log('── last 24h: any new WALLiam leads (any source) ──')
    const r24 = await c.query(`
      SELECT id, source, lead_origin_route, intent, contact_email, agent_id, created_at
        FROM leads
       WHERE tenant_id = $1
         AND created_at >= NOW() - INTERVAL '24 hours'
       ORDER BY created_at DESC
       LIMIT 30
    `, [WALLIAM])
    console.log(`  ${r24.rowCount} rows in last 24h:`)
    for (const r of r24.rows) {
      const ts = r.created_at.toISOString().slice(0,19).replace('T',' ')
      console.log(`  ${ts}  source=${(r.source||'').padEnd(28)} origin=${(r.lead_origin_route||'').padEnd(14)} intent=${(r.intent||'').padEnd(8)} email=${r.contact_email}`)
    }

    console.log('\n── last 24h: ESTIMATOR-sourced leads under WALLiam ──')
    const e24 = await c.query(`
      SELECT id, source, lead_origin_route, contact_email, created_at,
             NOW() - created_at AS age
        FROM leads
       WHERE tenant_id = $1
         AND created_at >= NOW() - INTERVAL '24 hours'
         AND (source ILIKE '%estimator%' OR lead_origin_route ILIKE '%estimator%')
       ORDER BY created_at DESC
    `, [WALLIAM])
    if (e24.rowCount === 0) {
      console.log('  ZERO estimator-sourced leads under WALLiam in last 24h.')
    } else {
      console.log(`  ${e24.rowCount} rows:`)
      for (const r of e24.rows) {
        console.log(`    ${r.created_at.toISOString()}  source=${r.source}  ${r.contact_email}`)
      }
    }

    console.log('\n── newest estimator-sourced lead under WALLiam (any age) ──')
    const eAll = await c.query(`
      SELECT id, source, lead_origin_route, contact_email, created_at,
             NOW() - created_at AS age
        FROM leads
       WHERE tenant_id = $1
         AND (source ILIKE '%estimator%' OR lead_origin_route ILIKE '%estimator%')
       ORDER BY created_at DESC
       LIMIT 1
    `, [WALLIAM])
    if (eAll.rowCount === 0) {
      console.log('  No estimator-source lead has EVER been written under WALLiam.')
    } else {
      const r = eAll.rows[0]
      console.log(`  Newest: ${r.created_at.toISOString()}`)
      console.log(`  Source: ${r.source}`)
      console.log(`  Age vs now: ${r.age}`)
    }

    await c.query('ROLLBACK')
  } finally { c.release(); await pool.end() }
})().catch(e => { console.error('FATAL', e); process.exit(1) })
