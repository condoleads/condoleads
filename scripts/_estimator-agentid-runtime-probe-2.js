// Retry of Script 2.1 + 2.3 with a tighter column allow-list — the prior
// run failed `.single()` because one of the selected columns doesn't
// exist on `tenants` (PostgREST errors the whole select).
require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')
const { Pool } = require('pg')

const WALLIAM_TENANT_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'

;(async () => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Use raw PG to enumerate columns on tenants first (no SELECT *).
  const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL })
  const c = await pool.connect()
  try {
    await c.query('BEGIN READ ONLY')
    console.log('── tenants column allow-list discovery ──')
    const cols = await c.query(`
      SELECT column_name, data_type
        FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'tenants'
       ORDER BY ordinal_position
    `)
    for (const row of cols.rows) {
      console.log(`  ${row.column_name}  (${row.data_type})`)
    }

    // Narrow secret-relevant columns
    console.log('\n── Reading WALLiam tenant row via raw PG (explicit allow-list, no SELECT *) ──')
    const interestingCols = cols.rows
      .map(r => r.column_name)
      .filter(n =>
        /resend|email|api_key|secret|domain|brand|name|default_agent|can_send|status|active/i.test(n)
        || n === 'id'
      )
      .filter(n => n !== 'anthropic_api_key' && n !== 'openai_api_key' /* hide other secrets */)
    console.log(`  Columns we'll print (excluding other secrets like anthropic_api_key): ${interestingCols.join(', ')}`)

    const selectList = interestingCols.map(c => `"${c}"`).join(', ')
    const tRow = await c.query(`SELECT ${selectList} FROM tenants WHERE id = $1`, [WALLIAM_TENANT_ID])
    if (tRow.rowCount === 0) {
      console.log('  WALLiam tenant NOT FOUND in tenants table!')
    } else {
      const t = tRow.rows[0]
      console.log(`\n  WALLiam tenant row (${interestingCols.length} columns shown):`)
      for (const [k, v] of Object.entries(t)) {
        if (k === 'resend_api_key' && v) {
          const fp = `${v.slice(0,6)}...${v.slice(-4)}  (length=${v.length})`
          console.log(`    ${k}: PRESENT  ${fp}`)
        } else if (/api_key|secret/i.test(k) && v) {
          // Generic catch for any other key-like column
          console.log(`    ${k}: PRESENT  (${(''+v).length} chars; fingerprint suppressed)`)
        } else {
          console.log(`    ${k}: ${v === null ? 'NULL' : v}`)
        }
      }
    }

    await c.query('ROLLBACK')
  } finally {
    c.release(); await pool.end()
  }
})().catch(e => { console.error('FATAL', e); process.exit(1) })
