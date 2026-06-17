// Probe 1b — settle send_from for WALLiam. Prior probe filtered it out.
require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')
const W = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
;(async () => {
  const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL })
  const c = await pool.connect()
  try {
    await c.query('BEGIN READ ONLY')
    const r = await c.query(`
      SELECT id, name, domain, brand_name, send_from,
             email_from_domain, resend_verification_status,
             resend_api_key IS NOT NULL AS has_resend_key,
             LENGTH(COALESCE(resend_api_key,'')) AS key_len
        FROM tenants
       WHERE id = $1
    `, [W])
    console.log('WALLiam tenant row — send_from + email-config fields:')
    for (const [k, v] of Object.entries(r.rows[0])) {
      console.log(`  ${k}: ${v === null ? 'NULL' : v}`)
    }
    await c.query('ROLLBACK')
  } finally { c.release(); await pool.end() }
})().catch(e => { console.error(e); process.exit(1) })
