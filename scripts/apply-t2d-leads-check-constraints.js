#!/usr/bin/env node
/**
 * apply-t2d-leads-check-constraints.js
 *
 * W-LEADS-EMAIL T2d — apply data-quality CHECK constraints with verification.
 *
 * Required env: DATABASE_URL
 * Migration file: supabase/migrations/20260510_t2d_leads_check_constraints.sql
 */

const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const MIGRATION_PATH = path.resolve('supabase', 'migrations', '20260510_t2d_leads_check_constraints.sql')
const PRE_FINGERPRINT = path.resolve('recon', 'W-LEADS-EMAIL-T2D-PRE-fingerprint.json')
const POST_FINGERPRINT = path.resolve('recon', 'W-LEADS-EMAIL-T2D-POST-fingerprint.json')

const EXPECTED_NEW_CHECKS = [
  'leads_appointment_status_check',
  'leads_assignment_source_check',
]

const EXPECTED_CHECK_DEFS = {
  leads_appointment_status_check: /CHECK \(\(appointment_status = ANY \(ARRAY\['pending'::text, 'confirmed'::text, 'cancelled'::text, 'completed'::text, 'rescheduled'::text\]\)\)\)/,
  leads_assignment_source_check: /CHECK \(\(assignment_source = ANY \(ARRAY\['geo'::text, 'admin'::text, 'manual'::text, 'override'::text\]\)\)\)/,
}

async function captureFingerprint(client) {
  const checks = await client.query(
    `SELECT con.conname, pg_get_constraintdef(con.oid) AS def
       FROM pg_constraint con
       JOIN pg_class cl ON cl.oid = con.conrelid
       JOIN pg_namespace ns ON ns.oid = cl.relnamespace
      WHERE ns.nspname = 'public' AND cl.relname = 'leads' AND con.contype = 'c'
      ORDER BY con.conname`
  )
  return {
    timestamp: new Date().toISOString(),
    check_constraints: checks.rows,
    check_count: checks.rows.length,
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL env var not set.')
    process.exit(1)
  }
  if (!fs.existsSync(MIGRATION_PATH)) {
    console.error(`ERROR: migration file missing: ${MIGRATION_PATH}`)
    process.exit(1)
  }

  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  console.log(`Migration loaded: ${MIGRATION_PATH} (${sql.length} bytes)`)

  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  console.log('\n== Step 1: capturing pre-apply fingerprint ==')
  const pre = await captureFingerprint(client)
  console.log(`  CHECK constraints: ${pre.check_count}`)

  const preCheckNames = new Set(pre.check_constraints.map((c) => c.conname))
  const conflicts = EXPECTED_NEW_CHECKS.filter((c) => preCheckNames.has(c))
  if (conflicts.length) {
    console.error(`\nERROR: CHECK constraints already present: ${conflicts.join(', ')}`)
    console.error('Migration appears to have already been applied. Aborting.')
    fs.mkdirSync(path.dirname(PRE_FINGERPRINT), { recursive: true })
    fs.writeFileSync(PRE_FINGERPRINT, JSON.stringify(pre, null, 2), 'utf8')
    await client.end()
    process.exit(2)
  }

  fs.mkdirSync(path.dirname(PRE_FINGERPRINT), { recursive: true })
  fs.writeFileSync(PRE_FINGERPRINT, JSON.stringify(pre, null, 2), 'utf8')
  console.log(`  pre-fingerprint saved: ${PRE_FINGERPRINT}`)

  console.log('\n== Step 2: applying migration ==')
  try {
    await client.query(sql)
    console.log('  migration executed without throwing')
  } catch (err) {
    console.error('  migration execution failed:', err.message)
    await client.end()
    process.exit(3)
  }

  console.log('\n== Step 3: post-apply verification ==')
  const post = await captureFingerprint(client)
  console.log(`  CHECK constraints: ${post.check_count} (was ${pre.check_count}, expected +2)`)

  const postCheckNames = new Set(post.check_constraints.map((c) => c.conname))
  const missing = EXPECTED_NEW_CHECKS.filter((c) => !postCheckNames.has(c))

  const defMismatches = []
  for (const [conName, pattern] of Object.entries(EXPECTED_CHECK_DEFS)) {
    const row = post.check_constraints.find((x) => x.conname === conName)
    if (row && !pattern.test(row.def)) {
      defMismatches.push(`${conName}: def=${row.def}`)
    }
  }

  fs.writeFileSync(POST_FINGERPRINT, JSON.stringify(post, null, 2), 'utf8')
  console.log(`  post-fingerprint saved: ${POST_FINGERPRINT}`)

  if (missing.length || defMismatches.length) {
    console.error('\nVERIFICATION FAILED:')
    if (missing.length) console.error(`  missing constraints: ${missing.join(', ')}`)
    if (defMismatches.length) {
      console.error('  def mismatches:')
      for (const m of defMismatches) console.error(`    ${m}`)
    }
    await client.end()
    process.exit(4)
  }

  console.log('\n  ✓ leads_appointment_status_check added')
  console.log('  ✓ leads_assignment_source_check added')

  await client.end()
  console.log('\n== T2d APPLIED SUCCESSFULLY ==')
  console.log('Next: T2e vip_requests tenant scoping fix.')
}

main().catch((err) => {
  console.error('Apply failed:', err)
  process.exit(1)
})