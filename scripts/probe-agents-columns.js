// scripts/probe-agents-columns.js
// Probe real column names on agents table.

const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

function loadDotEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local')
  const raw = fs.readFileSync(envPath, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (!m) continue
    const k = m[1]
    let v = m[2]
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (!process.env[k]) process.env[k] = v
  }
}

loadDotEnvLocal()

const conn = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL

async function main() {
  const client = new Client({ connectionString: conn })
  await client.connect()
  try {
    console.log('=== agents table columns ===')
    const r1 = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='agents'
      ORDER BY ordinal_position;
    `)
    console.table(r1.rows)
    console.log('')

    console.log('=== King Shah row (raw, all columns) ===')
    const r2 = await client.query(`SELECT * FROM agents WHERE id = $1;`,
      ['fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe'])
    console.log(JSON.stringify(r2.rows[0], null, 2))
  } catch (err) {
    console.error('ERROR:', err.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()