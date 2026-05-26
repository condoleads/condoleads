// scripts/p4-recon-2.js
// Run: node scripts/p4-recon-2.js > p4-recon-2-output.txt

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
    // === 1. lead_ownership_changes columns ===
    console.log('=== 1. lead_ownership_changes columns ===')
    const locCols = await client.query(
      `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'lead_ownership_changes'
        ORDER BY ordinal_position`
    )
    console.table(locCols.rows)
    console.log('')

    // === 2. lead_ownership_changes constraints (especially the NOT NULL on lead_id mentioned in memory) ===
    console.log('=== 2. lead_ownership_changes constraints ===')
    const locCheck = await client.query(
      `SELECT conname, contype, pg_get_constraintdef(c.oid) AS definition
         FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = 'lead_ownership_changes'`
    )
    console.table(locCheck.rows)
    console.log('')

    // === 3. lead_email_recipients_log columns ===
    console.log('=== 3. lead_email_recipients_log columns ===')
    const lerlCols = await client.query(
      `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'lead_email_recipients_log'
        ORDER BY ordinal_position`
    )
    console.table(lerlCols.rows)
    console.log('')

    // === 4. Read the contact route (highest-volume lead path) ===
    console.log('=== 4. app/api/walliam/contact/route.ts ===')
    const contactPath = path.join(process.cwd(), 'app', 'api', 'walliam', 'contact', 'route.ts')
    if (fs.existsSync(contactPath)) {
      console.log(fs.readFileSync(contactPath, 'utf8'))
    } else {
      console.log('(file not found)')
    }
    console.log('')

    // === 5. Existing admin-homes leads page structure ===
    console.log('=== 5. admin-homes leads directory listing ===')
    const adminLeadsDir = path.join(process.cwd(), 'app', 'admin-homes', 'leads')
    if (fs.existsSync(adminLeadsDir)) {
      function walk(dir, prefix = '') {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          console.log(prefix + (e.isDirectory() ? '[dir] ' : '      ') + e.name)
          if (e.isDirectory()) walk(path.join(dir, e.name), prefix + '  ')
        }
      }
      walk(adminLeadsDir)
    } else {
      console.log('(no app/admin-homes/leads directory)')
    }
    console.log('')

    // === 6. admin-homes top-level page (to find where to mount feed) ===
    console.log('=== 6. admin-homes top-level files ===')
    const adminHomes = path.join(process.cwd(), 'app', 'admin-homes')
    if (fs.existsSync(adminHomes)) {
      for (const e of fs.readdirSync(adminHomes, { withFileTypes: true })) {
        console.log(e.isDirectory() ? '[dir] ' + e.name : '      ' + e.name)
      }
    }
    console.log('')

    // === 7. cockpit tabs directory (where Territory/Agents/etc tabs live) ===
    console.log('=== 7. cockpit tabs directory ===')
    const tabsDir = path.join(process.cwd(), 'components', 'admin-homes', 'cockpit', 'tabs')
    if (fs.existsSync(tabsDir)) {
      for (const e of fs.readdirSync(tabsDir)) console.log('  ' + e)
    }
    console.log('')

    // === 8. Read the charlie/lead route (other high-volume path) ===
    console.log('=== 8. app/api/charlie/lead/route.ts ===')
    const charlieLeadPath = path.join(process.cwd(), 'app', 'api', 'charlie', 'lead', 'route.ts')
    if (fs.existsSync(charlieLeadPath)) {
      console.log(fs.readFileSync(charlieLeadPath, 'utf8'))
    } else {
      console.log('(file not found)')
    }
    console.log('')

    console.log('=== RECON COMPLETE ===')
  } finally {
    await client.end()
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })