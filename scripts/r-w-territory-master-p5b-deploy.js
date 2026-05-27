// scripts/r-w-territory-master-p5b-deploy.js
// Deploy the P5b fix: replace handle_listing_pin_change with the corrected version.
// Verifies before COMMIT: function body contains reresolve_listing(...,...) (two args).

const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

function loadDotEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) {
    console.error('ERROR: .env.local not found')
    process.exit(1)
  }
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

const MIGRATION_PATH = path.join(
  process.cwd(),
  'supabase', 'migrations', '20260526_p5b_fix_pin_trigger_reroll.sql'
)

if (!fs.existsSync(MIGRATION_PATH)) {
  console.error('ERROR: migration not found at', MIGRATION_PATH)
  process.exit(1)
}
const migrationSql = fs.readFileSync(MIGRATION_PATH, 'utf8')

async function main() {
  const client = new Client({ connectionString: conn })
  await client.connect()
  let txStarted = false
  let didCommit = false

  try {
    console.log('=== PRE-STATE: current trigger function body ===')
    const preBody = (await client.query(`
      SELECT pg_get_functiondef(p.oid) AS def
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname='handle_listing_pin_change';
    `)).rows[0]?.def || ''
    const preHasBuggyCall = /PERFORM reresolve_listing\(v_affected_listing_id\)\s*;/.test(preBody)
    const preHasFixedCall = /PERFORM reresolve_listing\(v_affected_listing_id,\s*v_tenant_id\)/.test(preBody)
    console.log('  has buggy 1-arg call:', preHasBuggyCall)
    console.log('  has fixed 2-arg call:', preHasFixedCall)
    if (preHasFixedCall) {
      console.log('Already fixed. Migration is a no-op.')
      await client.end()
      return
    }
    if (!preHasBuggyCall) {
      console.warn('WARNING: pre-state does not match expected buggy pattern.')
      console.warn('Continuing — CREATE OR REPLACE is safe regardless.')
    }

    await client.query('BEGIN')
    txStarted = true
    console.log('')
    console.log('=== APPLYING ===')
    await client.query(migrationSql)
    console.log('Applied.')

    console.log('')
    console.log('=== VERIFICATION ===')
    const postBody = (await client.query(`
      SELECT pg_get_functiondef(p.oid) AS def
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname='handle_listing_pin_change';
    `)).rows[0]?.def || ''

    const checks = [
      {
        name: 'function body contains reresolve_listing(...,...) two-arg call',
        pass: /PERFORM reresolve_listing\(v_affected_listing_id,\s*v_tenant_id\)/.test(postBody)
      },
      {
        name: 'function body no longer contains 1-arg call',
        pass: !/PERFORM reresolve_listing\(v_affected_listing_id\)\s*;/.test(postBody)
      },
      {
        name: 'function body contains pg_trigger_depth recursion guard',
        pass: /pg_trigger_depth\(\)\s*>\s*1/.test(postBody)
      },
      {
        name: 'trigger trg_listing_pin_change still attached',
        pass: (await client.query(`
          SELECT 1 FROM pg_trigger
          WHERE tgname='trg_listing_pin_change'
            AND tgrelid='public.agent_listing_assignments'::regclass;
        `)).rows.length === 1
      }
    ]

    let allPass = true
    for (const c of checks) {
      console.log(`${c.pass ? '✅' : '❌'} ${c.name}`)
      if (!c.pass) allPass = false
    }

    if (!allPass) {
      console.error('VERIFICATION FAILED. Rolling back.')
      await client.query('ROLLBACK')
      txStarted = false
      process.exit(1)
    }

    await client.query('COMMIT')
    didCommit = true
    txStarted = false
    console.log('')
    console.log('COMMIT complete. Trigger fixed.')
  } catch (err) {
    console.error('DEPLOY ERROR:', err.message)
    if (txStarted) {
      try { await client.query('ROLLBACK') } catch (_e) {}
    }
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()