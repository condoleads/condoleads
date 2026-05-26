// scripts/r-w-territory-master-p3-deploy.js
// Apply the P3 RPC, snapshot any pre-existing function with the same name,
// verify post-state.

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

const MIGRATION_PATH = 'supabase/migrations/20260526_p3_area_auto_distribute.sql'

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
    console.log('=== Snapshotting pre-state if function exists ===')
    const pre = await client.query(
      `SELECT pg_get_functiondef(p.oid) AS def
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'auto_distribute_areas'`
    )
    if (pre.rows.length > 0) {
      const dir = 'scripts/rollback-snapshots'
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      const snap = path.join(dir, `p3-pre-${stamp()}.sql`)
      fs.writeFileSync(snap, pre.rows.map(r => r.def).join('\n\n'))
      console.log('Snapshot:', snap)
    } else {
      console.log('(no existing function — fresh install)')
    }
    console.log('')

    console.log('=== Applying migration ===')
    await client.query(sql)
    console.log('Migration applied.')
    console.log('')

    console.log('=== Verify ===')
    let pass = 0, fail = 0
    function check(label, ok) {
      if (ok) { console.log('  PASS:', label); pass++ }
      else    { console.log('  FAIL:', label); fail++ }
    }

    const r1 = await client.query(
      `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'auto_distribute_areas'`
    )
    check('1. auto_distribute_areas exists', r1.rows.length === 1)

    const r2 = await client.query(
      `SELECT pg_get_function_identity_arguments(p.oid) AS args
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'auto_distribute_areas'`
    )
    check('2. signature is (p_tenant_id uuid, p_area_ids uuid[])',
      r2.rows[0]?.args === 'p_tenant_id uuid, p_area_ids uuid[]')

    const r3 = await client.query(
      `SELECT pg_get_function_result(p.oid) AS ret
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'auto_distribute_areas'`
    )
    check('3. returns jsonb', r3.rows[0]?.ret === 'jsonb')

    console.log('')
    console.log(`=== ${pass}/${pass + fail} checks PASS ===`)
    if (fail > 0) process.exit(1)
  } finally {
    await client.end()
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })