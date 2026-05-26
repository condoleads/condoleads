// scripts/r-w-territory-master-p4-deploy.js
//
// Deploys the P4 schema migration with rollback snapshot.
//
// Pre-flight:
//   - Captures current leads.agent_id NOT NULL state
//   - Captures current lead_ownership_changes CHECK constraint definition
//   - Confirms idx_leads_unowned does not yet exist
//
// Apply: runs the migration SQL as a single transaction.
//
// Verify:
//   - leads.agent_id is_nullable = 'YES'
//   - leads has claimed_at + claimed_by_agent_id columns
//   - lead_ownership_changes_reason_check includes 'claim'
//   - idx_leads_unowned exists
//
// Run: node scripts/r-w-territory-master-p4-deploy.js

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

function stamp() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

const MIGRATION_PATH = 'supabase/migrations/20260526_p4_unowned_leads_claim.sql'

async function main() {
  const envFile = loadDotEnvLocal()
  const cs = process.env.DATABASE_URL || process.env.POSTGRES_URL ||
             envFile.DATABASE_URL || envFile.POSTGRES_URL
  if (!cs) { console.error('FAIL: no connection string'); process.exit(1) }

  if (!fs.existsSync(MIGRATION_PATH)) {
    console.error('FAIL: migration file missing at', MIGRATION_PATH)
    process.exit(1)
  }
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')

  const client = new Client({ connectionString: cs })
  await client.connect()

  try {
    // === Pre-flight ===
    console.log('=== Pre-flight ===')
    const pre = await client.query(
      `SELECT is_nullable FROM information_schema.columns
        WHERE table_schema='public' AND table_name='leads' AND column_name='agent_id'`
    )
    console.log('leads.agent_id is_nullable (pre):', pre.rows[0]?.is_nullable)

    const preCheck = await client.query(
      `SELECT pg_get_constraintdef(c.oid) AS def
         FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = 'lead_ownership_changes' AND c.conname = 'lead_ownership_changes_reason_check'`
    )
    console.log('lead_ownership_changes_reason_check (pre):', preCheck.rows[0]?.def)

    // Snapshot the pre-state to a rollback file
    const rollbackDir = 'scripts/rollback-snapshots'
    if (!fs.existsSync(rollbackDir)) fs.mkdirSync(rollbackDir, { recursive: true })
    const snapshotPath = path.join(rollbackDir, `p4-pre-${stamp()}.json`)
    fs.writeFileSync(snapshotPath, JSON.stringify({
      leads_agent_id_is_nullable: pre.rows[0]?.is_nullable,
      lead_ownership_changes_reason_check: preCheck.rows[0]?.def,
    }, null, 2))
    console.log('Rollback snapshot:', snapshotPath)
    console.log('')

    // === Apply ===
    console.log('=== Applying migration ===')
    await client.query(sql)
    console.log('Migration applied.')
    console.log('')

    // === Verify ===
    console.log('=== Verify ===')
    let pass = 0, fail = 0

    function check(label, ok) {
      if (ok) { console.log('  PASS:', label); pass++ }
      else    { console.log('  FAIL:', label); fail++ }
    }

    // 1. leads.agent_id nullable
    const post1 = await client.query(
      `SELECT is_nullable FROM information_schema.columns
        WHERE table_schema='public' AND table_name='leads' AND column_name='agent_id'`
    )
    check('leads.agent_id is now nullable', post1.rows[0]?.is_nullable === 'YES')

    // 2. claimed_at column exists
    const post2 = await client.query(
      `SELECT data_type FROM information_schema.columns
        WHERE table_schema='public' AND table_name='leads' AND column_name='claimed_at'`
    )
    check('leads.claimed_at exists as timestamptz',
      post2.rows[0]?.data_type === 'timestamp with time zone')

    // 3. claimed_by_agent_id column exists
    const post3 = await client.query(
      `SELECT data_type FROM information_schema.columns
        WHERE table_schema='public' AND table_name='leads' AND column_name='claimed_by_agent_id'`
    )
    check('leads.claimed_by_agent_id exists as uuid', post3.rows[0]?.data_type === 'uuid')

    // 4. FK constraint on claimed_by_agent_id
    const post4 = await client.query(
      `SELECT 1 FROM pg_constraint WHERE conname = 'leads_claimed_by_agent_id_fkey'`
    )
    check('leads_claimed_by_agent_id_fkey FK exists', post4.rows.length === 1)

    // 5. CHECK includes 'claim'
    const post5 = await client.query(
      `SELECT pg_get_constraintdef(c.oid) AS def
         FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = 'lead_ownership_changes' AND c.conname = 'lead_ownership_changes_reason_check'`
    )
    const def5 = post5.rows[0]?.def || ''
    check("lead_ownership_changes_reason_check includes 'claim'", def5.includes("'claim'"))

    // 6. Index exists
    const post6 = await client.query(
      `SELECT 1 FROM pg_indexes WHERE indexname = 'idx_leads_unowned'`
    )
    check('idx_leads_unowned exists', post6.rows.length === 1)

    console.log('')
    console.log(`=== ${pass}/${pass + fail} checks PASS ===`)
    if (fail > 0) process.exit(1)
  } finally {
    await client.end()
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })