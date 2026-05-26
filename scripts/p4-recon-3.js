// scripts/p4-recon-3.js
// Read existing /admin-homes/leads page + lead_admin_actions schema.
// Run: node scripts/p4-recon-3.js > p4-recon-3-output.txt

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
    // === 1. /admin-homes/leads/page.tsx ===
    console.log('=== 1. app/admin-homes/leads/page.tsx ===')
    const p = path.join(process.cwd(), 'app', 'admin-homes', 'leads', 'page.tsx')
    if (fs.existsSync(p)) {
      console.log(fs.readFileSync(p, 'utf8'))
    } else {
      console.log('(not found)')
    }
    console.log('')

    // === 2. lead_admin_actions table ===
    console.log('=== 2. lead_admin_actions columns ===')
    const cols = await client.query(
      `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'lead_admin_actions'
        ORDER BY ordinal_position`
    )
    console.table(cols.rows)
    console.log('')

    // === 3. Existing admin-homes leads API routes ===
    console.log('=== 3. Existing app/api/admin-homes/leads/* tree ===')
    const apiDir = path.join(process.cwd(), 'app', 'api', 'admin-homes', 'leads')
    if (fs.existsSync(apiDir)) {
      function walk(d, prefix = '') {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          console.log(prefix + (e.isDirectory() ? '[dir] ' : '      ') + e.name)
          if (e.isDirectory()) walk(path.join(d, e.name), prefix + '  ')
        }
      }
      walk(apiDir)
    } else {
      console.log('(no app/api/admin-homes/leads dir)')
    }
    console.log('')

    console.log('=== RECON COMPLETE ===')
  } finally {
    await client.end()
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })