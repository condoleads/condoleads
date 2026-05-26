// scripts/r-w-territory-master-p2-deploy.js
//
// Deploys P2 resolver strip with full rollback snapshot of all 4 functions.
//
// Pre-flight: dumps current function bodies to scripts/rollback-snapshots/
// Apply: runs the P2 migration SQL.
// Verify: re-reads function bodies and confirms strip markers present.

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

const MIGRATION_PATH = 'supabase/migrations/20260526_p2_resolver_strip.sql'

async function main() {
  const envFile = loadDotEnvLocal()
  const cs = process.env.DATABASE_URL || process.env.POSTGRES_URL ||
             envFile.DATABASE_URL || envFile.POSTGRES_URL
  if (!cs) { console.error('FAIL: no connection string'); process.exit(1) }

  if (!fs.existsSync(MIGRATION_PATH)) {
    console.error('FAIL: migration missing at', MIGRATION_PATH)
    process.exit(1)
  }
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')

  const client = new Client({ connectionString: cs })
  await client.connect()

  try {
    // === Snapshot ===
    console.log('=== Snapshotting pre-state ===')
    const fns = [
      'resolve_agent_for_context',
      'resolve_display_agent_for_context',
      'pick_routing_agent',
    ]
    const snapshot = {}
    for (const name of fns) {
      const r = await client.query(
        `SELECT pg_get_functiondef(p.oid) AS def
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = $1`,
        [name]
      )
      snapshot[name] = r.rows.map(row => row.def).join('\n\n')
    }
    const rollbackDir = 'scripts/rollback-snapshots'
    if (!fs.existsSync(rollbackDir)) fs.mkdirSync(rollbackDir, { recursive: true })
    const snapshotFile = path.join(rollbackDir, `p2-pre-${stamp()}.sql`)
    let snapshotContent = '-- P2 pre-deploy snapshot\n-- Replay these CREATE OR REPLACE statements to roll back.\n\n'
    for (const name of fns) snapshotContent += `-- ${name}\n${snapshot[name]}\n\n`
    fs.writeFileSync(snapshotFile, snapshotContent)
    console.log('Snapshot:', snapshotFile)
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

    // 1. pick_routing_agent no longer contains hashtext
    const r1 = await client.query(
      `SELECT pg_get_functiondef(p.oid) AS def
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'pick_routing_agent'`
    )
    const pickBody = r1.rows[0]?.def || ''
    check('1. pick_routing_agent no longer references hashtext', !pickBody.includes('hashtext'))
    check('2. pick_routing_agent uses resolve_geo_primary', pickBody.includes('resolve_geo_primary'))

    // 3. pick_routing_agent_for_type now exists
    const r3 = await client.query(
      `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'pick_routing_agent_for_type'`
    )
    check('3. pick_routing_agent_for_type exists', r3.rows.length === 1)

    // 4. resolve_agent_for_context no longer contains tenant default lookup
    const r4 = await client.query(
      `SELECT pg_get_functiondef(p.oid) AS def
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'resolve_agent_for_context'`
    )
    const racBody = r4.rows[0]?.def || ''
    check('4. resolve_agent_for_context no longer references default_agent_id',
      !racBody.includes('default_agent_id'))
    check('5. resolve_agent_for_context no longer references hashtext',
      !racBody.includes('hashtext'))
    check('6. resolve_agent_for_context no longer references tenant_users',
      !racBody.includes('tenant_users'))
    check('7. resolve_agent_for_context no longer references user_profiles',
      !racBody.includes('user_profiles'))
    check('8. resolve_agent_for_context uses pick_routing_agent_for_type',
      racBody.includes('pick_routing_agent_for_type'))
    check('9. resolve_agent_for_context derives property_type',
      racBody.includes('property_type') && racBody.includes('Residential Condo'))

    // 5. resolve_display_agent_for_context is now thin wrapper
    const r5 = await client.query(
      `SELECT pg_get_functiondef(p.oid) AS def
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'resolve_display_agent_for_context'`
    )
    const dispBody = r5.rows[0]?.def || ''
    check('10. resolve_display_agent_for_context no longer has descendant walk',
      !dispBody.includes('descendants') && !dispBody.includes('WITH RECURSIVE'))
    check('11. resolve_display_agent_for_context delegates to resolve_agent_for_context',
      dispBody.includes('resolve_agent_for_context'))

    // 6. tenant_property_access top-level check preserved
    check('12. tenant_property_access restriction preserved',
      racBody.includes('tenant_property_access'))

    // 7. is_selling AND is_active still enforced
    check('13. is_selling check preserved', racBody.includes('is_selling = true'))
    check('14. is_active check preserved', racBody.includes('is_active = true'))

    console.log('')
    console.log(`=== ${pass}/${pass + fail} checks PASS ===`)
    if (fail > 0) process.exit(1)
  } finally {
    await client.end()
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })