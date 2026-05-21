const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

;(async () => {
  // Pre-check: confirm no duplicates before applying UNIQUE
  const { data: tenants } = await supabase.from('tenants').select('id, source_key')
  const counts = {}
  for (const t of tenants) counts[t.source_key] = (counts[t.source_key] || 0) + 1
  const dups = Object.entries(counts).filter(([k, c]) => c > 1)
  if (dups.length) {
    console.error('ABORT: duplicate source_keys exist, UNIQUE would fail:')
    for (const [k, c] of dups) console.error('  ' + k + ' x' + c)
    process.exit(1)
  }
  console.log('Pre-check: ' + tenants.length + ' tenants, 0 duplicate source_keys')

  // Apply migration via direct SQL execution
  // Supabase JS client doesn't have a raw-SQL exec method; use the REST endpoint via fetch
  const sql = fs.readFileSync(path.join('supabase', 'migrations', '20260521_tenants_source_key_unique.sql'), 'utf8')

  // Try via pg module if available
  let pg
  try { pg = require('pg') } catch (e) {
    console.error('pg module not installed; trying alternate path')
  }

  if (pg) {
    const connStr = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL
    if (!connStr) {
      console.error('ABORT: SUPABASE_DB_URL not set in .env.local; cannot run raw SQL')
      console.error('Set SUPABASE_DB_URL to the postgres connection string from Supabase dashboard')
      process.exit(1)
    }
    const client = new pg.Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } })
    await client.connect()
    try {
      await client.query(sql)
      console.log('Migration applied OK')
    } catch (e) {
      console.error('Migration FAILED:', e.message)
      console.error('Full error:', e)
      process.exit(1)
    } finally {
      await client.end()
    }
  } else {
    console.error('Cannot apply -- pg module needed')
    process.exit(1)
  }

  // Post-check: confirm constraint exists
  const { data: constraintCheck, error } = await supabase
    .from('tenants')
    .select('source_key')
    .limit(1)
  if (error) {
    console.error('Post-check fetch failed:', error)
    process.exit(1)
  }
  console.log('Post-check: tenants table still readable, constraint applied')

  process.exit(0)
})()