// scripts/p4-check-recon.js
// Read all CHECK constraints on the leads table so we don't get blindsided again.
// Run: node scripts/p4-check-recon.js

const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

function loadDotEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return {}
  const out = {}
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('='); if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[k] = v
  }
  return out
}

async function main() {
  const envFile = loadDotEnvLocal()
  const cs = process.env.DATABASE_URL || process.env.POSTGRES_URL ||
             envFile.DATABASE_URL || envFile.POSTGRES_URL
  if (!cs) { console.error('FAIL: no connection string'); process.exit(1) }
  const client = new Client({ connectionString: cs })
  await client.connect()
  try {
    const r = await client.query(
      `SELECT conname, pg_get_constraintdef(c.oid) AS def
         FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = 'leads' AND c.contype = 'c'
        ORDER BY conname`
    )
    for (const row of r.rows) {
      console.log('---', row.conname, '---')
      console.log(row.def)
      console.log('')
    }
  } finally {
    await client.end()
  }
}
main().catch(e => { console.error('FATAL:', e); process.exit(1) })