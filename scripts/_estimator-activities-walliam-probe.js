// W-ESTIMATOR-ACTIVITY-EMAIL R3 probe — read-only. Tenant-scoped WALLiam.
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')
const WALLIAM = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
const TYPES = [
  'sale_offer_inquiry','lease_offer_inquiry',
  'sale_evaluation_request','lease_evaluation_request',
  'estimator','estimator_used','estimator_contact_submitted',
  'clicked_get_estimate_cta'
]

;(async () => {
  const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL })
  const c = await pool.connect()
  try {
    await c.query('BEGIN READ ONLY')

    console.log('── 1. Schema check: does user_activities have tenant_id column? ──')
    const cols = await c.query(`
      SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name='user_activities'
       ORDER BY ordinal_position
    `)
    console.log('  Columns:', cols.rows.map(r => r.column_name).join(', '))

    console.log('\n── 2. Counts by activity_type under WALLiam (the 8 in-scope types) ──')
    const counts = await c.query(`
      SELECT activity_type, COUNT(*) AS n, MAX(created_at) AS newest
        FROM user_activities
       WHERE tenant_id = $1
         AND activity_type = ANY($2::text[])
       GROUP BY activity_type
       ORDER BY newest DESC NULLS LAST
    `, [WALLIAM, TYPES])
    if (counts.rowCount === 0) {
      console.log('  ZERO rows of these 8 types under WALLiam, EVER.')
    } else {
      for (const r of counts.rows) {
        console.log(`  ${r.activity_type.padEnd(35)}  n=${String(r.n).padStart(5)}  newest=${r.newest?.toISOString()?.slice(0,19) ?? '—'}`)
      }
    }

    console.log('\n── 3. Last 30 rows of any in-scope activity_type under WALLiam ──')
    const recent = await c.query(`
      SELECT activity_type, contact_email, agent_id, created_at,
             activity_data->>'buildingName' AS building,
             activity_data->>'listingId'     AS listing_id
        FROM user_activities
       WHERE tenant_id = $1
         AND activity_type = ANY($2::text[])
       ORDER BY created_at DESC
       LIMIT 30
    `, [WALLIAM, TYPES])
    if (recent.rowCount === 0) {
      console.log('  ZERO matching rows.')
    } else {
      console.log(`  ${recent.rowCount} rows:`)
      for (const r of recent.rows) {
        const ts = r.created_at.toISOString().slice(0,19).replace('T',' ')
        const ashort = r.agent_id ? r.agent_id.slice(0,8) : 'NULL'
        console.log(`  ${ts}  ${r.activity_type.padEnd(33)}  agent=${ashort}  email=${(r.contact_email||'').padEnd(34)}  bldg=${(r.building||'').slice(0,25)}`)
      }
    }

    console.log('\n── 4. ALL WALLiam user_activities last 24h (any type) ──')
    const r24 = await c.query(`
      SELECT activity_type, COUNT(*) AS n, MAX(created_at) AS newest
        FROM user_activities
       WHERE tenant_id = $1
         AND created_at >= NOW() - INTERVAL '24 hours'
       GROUP BY activity_type
       ORDER BY newest DESC
    `, [WALLIAM])
    if (r24.rowCount === 0) {
      console.log('  ZERO WALLiam activities in the last 24h.')
    } else {
      for (const r of r24.rows) {
        console.log(`  ${r.activity_type.padEnd(35)}  n=${String(r.n).padStart(4)}  newest=${r.newest?.toISOString().slice(0,19) ?? '—'}`)
      }
    }

    console.log('\n── 5. Same 8 types — TOTAL across ALL tenants (not just WALLiam) ──')
    const allT = await c.query(`
      SELECT activity_type, COUNT(*) AS n, COUNT(DISTINCT tenant_id) AS n_tenants, MAX(created_at) AS newest
        FROM user_activities
       WHERE activity_type = ANY($1::text[])
       GROUP BY activity_type
       ORDER BY n DESC
    `, [TYPES])
    if (allT.rowCount === 0) {
      console.log('  ZERO rows of these 8 types EVER in the entire user_activities table.')
    } else {
      for (const r of allT.rows) {
        console.log(`  ${r.activity_type.padEnd(35)}  total=${String(r.n).padStart(5)}  tenants=${r.n_tenants}  newest=${r.newest?.toISOString().slice(0,19) ?? '—'}`)
      }
    }

    await c.query('ROLLBACK')
  } finally { c.release(); await pool.end() }
})().catch(e => { console.error('FATAL', e); process.exit(1) })
