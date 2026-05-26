// scripts/p3-area-recon.js
// Recon for P3 area auto-distribution.
//
//   1. treb_areas count + sample
//   2. WALLiam tenant_property_access rows (restriction set)
//   3. WALLiam existing area-scope apa cards (should be 0 per prior recon)
//   4. WALLiam active selling agents + created_at order (the round-robin order)
//   5. apa scope CHECK already includes 'area' (verified earlier)
//
// Run: node scripts/p3-area-recon.js > p3-recon-output.txt

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

const WALLIAM = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'

async function main() {
  const envFile = loadDotEnvLocal()
  const cs = process.env.DATABASE_URL || process.env.POSTGRES_URL ||
             envFile.DATABASE_URL || envFile.POSTGRES_URL
  if (!cs) { console.error('FAIL: no connection string'); process.exit(1) }
  const client = new Client({ connectionString: cs })
  await client.connect()
  try {
    console.log('=== 1. treb_areas count ===')
    const ac = await client.query(`SELECT COUNT(*)::int AS n FROM treb_areas`)
    console.log('Total treb_areas:', ac.rows[0].n)
    const asample = await client.query(
      `SELECT id, name, slug FROM treb_areas ORDER BY name LIMIT 10`
    )
    console.table(asample.rows)
    console.log('')

    console.log('=== 2. WALLiam tenant_property_access (restriction set) ===')
    const tpa = await client.query(
      `SELECT scope, area_id, municipality_id, community_id, is_active
         FROM tenant_property_access WHERE tenant_id = $1`,
      [WALLIAM]
    )
    console.log('Rows:', tpa.rows.length)
    console.table(tpa.rows)
    console.log('')

    console.log('=== 3. WALLiam existing area-scope apa cards ===')
    const area = await client.query(
      `SELECT id, agent_id, area_id, condo_access, homes_access, is_active
         FROM agent_property_access
        WHERE tenant_id = $1 AND scope = 'area'`,
      [WALLIAM]
    )
    console.log('Rows:', area.rows.length)
    console.table(area.rows)
    console.log('')

    console.log('=== 4. WALLiam active selling agents (round-robin order) ===')
    const ags = await client.query(
      `SELECT id, full_name, role, is_selling, is_active, created_at
         FROM agents
        WHERE tenant_id = $1
          AND is_active = true
          AND is_selling = true
        ORDER BY created_at ASC`,
      [WALLIAM]
    )
    console.table(ags.rows)
    console.log('')

    console.log('=== 5. apa scope CHECK includes area ===')
    const chk = await client.query(
      `SELECT pg_get_constraintdef(c.oid) AS def
         FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = 'agent_property_access' AND c.conname = 'agent_property_access_scope_check'`
    )
    console.log(chk.rows[0]?.def)
    console.log('')

    console.log('=== 6. Existing apa partial unique indexes (avoid collision) ===')
    const idx = await client.query(
      `SELECT indexname, indexdef
         FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'agent_property_access'
        ORDER BY indexname`
    )
    console.table(idx.rows)
    console.log('')

    console.log('=== RECON COMPLETE ===')
  } finally {
    await client.end()
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })