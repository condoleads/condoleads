// STEP 0 — introspect buildings_with_listing_counts view columns
const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })
;(async () => {
  const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL })
  const c = await pool.connect()
  try {
    await c.query('BEGIN'); await c.query('SAVEPOINT s1')
    // Column list of the view
    const cols = await c.query(`
      SELECT column_name, data_type
        FROM information_schema.columns
       WHERE table_name = 'buildings_with_listing_counts'
       ORDER BY ordinal_position`)
    console.log('=== buildings_with_listing_counts columns ===')
    for (const r of cols.rows) console.log('  ' + r.column_name + ' :: ' + r.data_type)
    if (cols.rows.length === 0) console.log('  (no rows — view may not exist OR may live in another schema)')

    // Also fetch view definition for full clarity
    const def = await c.query(`
      SELECT view_definition
        FROM information_schema.views
       WHERE table_name = 'buildings_with_listing_counts'
       LIMIT 1`)
    if (def.rows[0]) {
      console.log('\n=== view definition (first 2000 chars) ===')
      console.log(def.rows[0].view_definition.slice(0, 2000))
    }

    // Quick sample row showing what fields a typical query returns
    const sample = await c.query(`
      SELECT * FROM buildings_with_listing_counts LIMIT 1`)
    if (sample.rows[0]) {
      console.log('\n=== sample row keys ===')
      console.log(Object.keys(sample.rows[0]).sort().join(', '))
    }
    await c.query('ROLLBACK')
  } finally { c.release(); await pool.end() }
})()
