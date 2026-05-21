const pg = require('pg')
require('dotenv').config({ path: '.env.local' })

;(async () => {
  const connStr = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL
  if (!connStr) {
    console.error('ABORT: SUPABASE_DB_URL not in .env.local')
    process.exit(1)
  }
  const client = new pg.Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } })
  await client.connect()
  try {
    const res = await client.query(`
      SELECT column_name, is_nullable, column_default, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tenants'
      ORDER BY ordinal_position
    `)
    console.log('column_name                       | nullable | default                       | type')
    console.log('----------------------------------+----------+-------------------------------+---------')
    for (const r of res.rows) {
      const name = r.column_name.padEnd(33)
      const nullable = r.is_nullable.padEnd(8)
      const def = (r.column_default || 'NULL').slice(0, 29).padEnd(29)
      const type = r.data_type
      console.log(name + ' | ' + nullable + ' | ' + def + ' | ' + type)
    }
  } catch (e) {
    console.error('ERR:', e.message)
    process.exit(1)
  } finally {
    await client.end()
  }
  process.exit(0)
})()