#!/usr/bin/env node
/**
 * apply-t2e-vip-requests-tenant-scope.js
 *
 * W-LEADS-EMAIL T2e — vip_requests tenant scoping fix.
 *
 * Pre-condition: 0 rows in vip_requests (verified at T2e-pre probe).
 * If the row count is non-zero at apply time, runner aborts (re-probe required).
 *
 * Verifies 7 markers post-apply:
 *   - 3 columns NOT NULL (tenant_id, status, request_type)
 *   - 1 new FK (vip_requests_tenant_id_fkey)
 *   - 1 new index (idx_vip_requests_tenant)
 *   - 2 new CHECK constraints (vip_requests_status_check, vip_requests_request_type_check)
 *
 * Required env: DATABASE_URL
 */

const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const MIGRATION_PATH = path.resolve('supabase', 'migrations', '20260510_t2e_vip_requests_tenant_scope.sql')
const PRE_FINGERPRINT = path.resolve('recon', 'W-LEADS-EMAIL-T2E-PRE-fingerprint.json')
const POST_FINGERPRINT = path.resolve('recon', 'W-LEADS-EMAIL-T2E-POST-fingerprint.json')

const EXPECTED_NOT_NULL = ['tenant_id', 'status', 'request_type']
const EXPECTED_NEW_FK = 'vip_requests_tenant_id_fkey'
const EXPECTED_NEW_INDEX = 'idx_vip_requests_tenant'
const EXPECTED_NEW_CHECKS = ['vip_requests_status_check', 'vip_requests_request_type_check']

async function captureFingerprint(client) {
  const cols = await client.query(
    `SELECT column_name, is_nullable
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'vip_requests'
      ORDER BY ordinal_position`
  )
  const fks = await client.query(
    `SELECT con.conname, pg_get_constraintdef(con.oid) AS def
       FROM pg_constraint con
       JOIN pg_class cl ON cl.oid = con.conrelid
       JOIN pg_namespace ns ON ns.oid = cl.relnamespace
      WHERE ns.nspname = 'public' AND cl.relname = 'vip_requests' AND con.contype = 'f'
      ORDER BY con.conname`
  )
  const checks = await client.query(
    `SELECT con.conname, pg_get_constraintdef(con.oid) AS def
       FROM pg_constraint con
       JOIN pg_class cl ON cl.oid = con.conrelid
       JOIN pg_namespace ns ON ns.oid = cl.relnamespace
      WHERE ns.nspname = 'public' AND cl.relname = 'vip_requests' AND con.contype = 'c'
      ORDER BY con.conname`
  )
  const idx = await client.query(
    `SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'vip_requests'
      ORDER BY indexname`
  )
  const rowCount = await client.query(`SELECT COUNT(*)::bigint AS n FROM vip_requests`)
  return {
    timestamp: new Date().toISOString(),
    columns: cols.rows,
    foreign_keys: fks.rows,
    check_constraints: checks.rows,
    indexes: idx.rows,
    row_count: parseInt(rowCount.rows[0].n, 10),
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
  console.log(`  rows: ${pre.row_count}`)
  console.log(`  FKs: ${pre.foreign_keys.length}`)
  console.log(`  CHECK constraints: ${pre.check_constraints.length}`)
  console.log(`  indexes: ${pre.indexes.length}`)

  // Pre-flight: row count must still be 0 (probe was at 0; stale-probe guard)
  if (pre.row_count !== 0) {
    console.error(`\nERROR: vip_requests row count is ${pre.row_count}, not 0.`)
    console.error('Migration was designed assuming 0 rows. Re-run T2e-pre probe and reassess backfill.')
    fs.mkdirSync(path.dirname(PRE_FINGERPRINT), { recursive: true })
    fs.writeFileSync(PRE_FINGERPRINT, JSON.stringify(pre, null, 2), 'utf8')
    await client.end()
    process.exit(2)
  }

  // Idempotency guard: any of the expected new objects already there → already applied
  const preFKNames = new Set(pre.foreign_keys.map((f) => f.conname))
  const preCheckNames = new Set(pre.check_constraints.map((c) => c.conname))
  const preIdxNames = new Set(pre.indexes.map((i) => i.indexname))
  const conflicts = [
    ...(preFKNames.has(EXPECTED_NEW_FK) ? [`FK ${EXPECTED_NEW_FK}`] : []),
    ...(preIdxNames.has(EXPECTED_NEW_INDEX) ? [`index ${EXPECTED_NEW_INDEX}`] : []),
    ...EXPECTED_NEW_CHECKS.filter((c) => preCheckNames.has(c)).map((c) => `CHECK ${c}`),
  ]
  if (conflicts.length) {
    console.error(`\nERROR: already-present objects: ${conflicts.join(', ')}`)
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
  console.log(`  rows: ${post.row_count} (must equal pre: ${pre.row_count})`)
  console.log(`  FKs: ${post.foreign_keys.length} (was ${pre.foreign_keys.length}, expected +1)`)
  console.log(`  CHECK constraints: ${post.check_constraints.length} (was ${pre.check_constraints.length}, expected +2)`)
  console.log(`  indexes: ${post.indexes.length} (was ${pre.indexes.length}, expected +1)`)

  const checks = []

  // NOT NULL on 3 columns
  for (const colName of EXPECTED_NOT_NULL) {
    const row = post.columns.find((c) => c.column_name === colName)
    if (!row) {
      checks.push(`column ${colName} missing entirely`)
    } else if (row.is_nullable !== 'NO') {
      checks.push(`column ${colName} is_nullable=${row.is_nullable}, expected NO`)
    }
  }

  // FK
  if (!post.foreign_keys.find((f) => f.conname === EXPECTED_NEW_FK)) {
    checks.push(`FK ${EXPECTED_NEW_FK} missing`)
  } else {
    const fk = post.foreign_keys.find((f) => f.conname === EXPECTED_NEW_FK)
    if (!fk.def.includes('REFERENCES tenants(id)')) {
      checks.push(`FK ${EXPECTED_NEW_FK} def=${fk.def}, expected REFERENCES tenants(id)`)
    }
  }

  // Index
  if (!post.indexes.find((i) => i.indexname === EXPECTED_NEW_INDEX)) {
    checks.push(`index ${EXPECTED_NEW_INDEX} missing`)
  }

  // CHECKs
  for (const conName of EXPECTED_NEW_CHECKS) {
    if (!post.check_constraints.find((c) => c.conname === conName)) {
      checks.push(`CHECK ${conName} missing`)
    }
  }

  // Row count unchanged
  if (post.row_count !== pre.row_count) {
    checks.push(`row count changed: ${pre.row_count} → ${post.row_count}`)
  }

  fs.writeFileSync(POST_FINGERPRINT, JSON.stringify(post, null, 2), 'utf8')
  console.log(`  post-fingerprint saved: ${POST_FINGERPRINT}`)

  if (checks.length) {
    console.error('\nVERIFICATION FAILED:')
    for (const c of checks) console.error(`  ${c}`)
    await client.end()
    process.exit(4)
  }

  console.log('\n  ✓ tenant_id NOT NULL')
  console.log('  ✓ status NOT NULL')
  console.log('  ✓ request_type NOT NULL')
  console.log(`  ✓ ${EXPECTED_NEW_FK} added (REFERENCES tenants(id))`)
  console.log(`  ✓ ${EXPECTED_NEW_INDEX} added`)
  console.log('  ✓ vip_requests_status_check added')
  console.log('  ✓ vip_requests_request_type_check added')

  await client.end()
  console.log('\n== T2e APPLIED SUCCESSFULLY ==')
  console.log('Note: request_source SET NOT NULL + CHECK deferred to T6c.')
  console.log('Next: T2f lead_email_recipients_log new audit table.')
}

main().catch((err) => {
  console.error('Apply failed:', err)
  process.exit(1)
})