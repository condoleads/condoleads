// Read-only recon — checks tenants.domain for WALLiam + env values
const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })
;(async () => {
  const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL })
  const c = await pool.connect()
  try {
    await c.query('BEGIN'); await c.query('SAVEPOINT s1')
    const r = await c.query(`SELECT id, name, brand_name, source_key, domain FROM tenants WHERE name ILIKE '%walliam%' OR domain ILIKE '%walliam%' LIMIT 5`)
    console.log('WALLiam tenants:')
    for (const t of r.rows) {
      console.log(`  id=${t.id}  name=${t.name}  brand=${t.brand_name}  source=${t.source_key}  domain="${t.domain}"`)
    }
    // For comparison, also check condoleads tenant
    const r2 = await c.query(`SELECT id, name, brand_name, source_key, domain FROM tenants WHERE name ILIKE '%condoleads%' OR domain ILIKE '%condoleads%' LIMIT 5`)
    console.log('condoleads tenants:')
    for (const t of r2.rows) {
      console.log(`  id=${t.id}  name=${t.name}  brand=${t.brand_name}  source=${t.source_key}  domain="${t.domain}"`)
    }
    await c.query('ROLLBACK')
  } finally { c.release(); await pool.end() }
  console.log('NEXT_PUBLIC_APP_URL:', process.env.NEXT_PUBLIC_APP_URL || '(unset)')
})()
