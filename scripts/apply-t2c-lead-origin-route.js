#!/usr/bin/env node
/**
 * apply-t2c-lead-origin-route.js
 *
 * W-LEADS-EMAIL T2c — apply migration with rollback snapshot + backfill report.
 *
 * Captures row count + source-distribution pre/post for audit trail.
 *
 * Required env: DATABASE_URL
 * Migration file: supabase/migrations/20260510_t2c_lead_origin_route.sql
 */

const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const MIGRATION_PATH = path.resolve('supabase', 'migrations', '20260510_t2c_lead_origin_route.sql')
const PRE_FINGERPRINT = path.resolve('recon', 'W-LEADS-EMAIL-T2C-PRE-fingerprint.json')
const POST_FINGERPRINT = path.resolve('recon', 'W-LEADS-EMAIL-T2C-POST-fingerprint.json')

const EXPECTED_NEW_COLUMN = 'lead_origin_route'
const EXPECTED_NEW_INDEX = 'idx_leads_tenant_origin_route'

async function captureFingerprint(client, includeRouteDistribution) {
  const cols = await client.query(
    `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'leads'
      ORDER BY ordinal_position`
  )
  const idx = await client.query(
    `SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'leads'
      ORDER BY indexname`
  )
  const rowCount = await client.query(`SELECT COUNT(*)::bigint AS n FROM leads`)
  const sourceDistribution = await client.query(
    `SELECT source, COUNT(*)::bigint AS n FROM leads GROUP BY source ORDER BY n DESC LIMIT 20`
  )

  let routeDistribution = null
  if (includeRouteDistribution) {
    routeDistribution = await client.query(
      `SELECT lead_origin_route, COUNT(*)::bigint AS n
         FROM leads GROUP BY lead_origin_route ORDER BY n DESC`
    )
  }

  return {
    timestamp: new Date().toISOString(),
    columns: cols.rows,
    indexes: idx.rows,
    column_count: cols.rows.length,
    index_count: idx.rows.length,
    row_count: parseInt(rowCount.rows[0].n, 10),
    source_distribution: sourceDistribution.rows,
    route_distribution: routeDistribution ? routeDistribution.rows : null,
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

  // ── Step 1: pre-apply fingerprint ──────────────────────────────────────────
  console.log('\n== Step 1: capturing pre-apply fingerprint ==')
  const pre = await captureFingerprint(client, false)
  console.log(`  columns: ${pre.column_count}`)
  console.log(`  indexes: ${pre.index_count}`)
  console.log(`  rows: ${pre.row_count}`)
  if (pre.source_distribution.length > 0) {
    console.log('  source distribution (top 20):')
    for (const s of pre.source_distribution) {
      console.log(`    ${(s.source || '(null)').padEnd(50)} ${s.n}`)
    }
  }

  const preColNames = new Set(pre.columns.map((c) => c.column_name))
  const preIdxNames = new Set(pre.indexes.map((i) => i.indexname))
  if (preColNames.has(EXPECTED_NEW_COLUMN) || preIdxNames.has(EXPECTED_NEW_INDEX)) {
    console.error(`\nERROR: ${EXPECTED_NEW_COLUMN} column or ${EXPECTED_NEW_INDEX} index already exists.`)
    console.error('Migration appears to have already been applied. Aborting.')
    fs.mkdirSync(path.dirname(PRE_FINGERPRINT), { recursive: true })
    fs.writeFileSync(PRE_FINGERPRINT, JSON.stringify(pre, null, 2), 'utf8')
    await client.end()
    process.exit(2)
  }

  fs.mkdirSync(path.dirname(PRE_FINGERPRINT), { recursive: true })
  fs.writeFileSync(PRE_FINGERPRINT, JSON.stringify(pre, null, 2), 'utf8')
  console.log(`  pre-fingerprint saved: ${PRE_FINGERPRINT}`)

  // ── Step 2: apply migration ────────────────────────────────────────────────
  console.log('\n== Step 2: applying migration ==')
  try {
    await client.query(sql)
    console.log('  migration executed without throwing')
  } catch (err) {
    console.error('  migration execution failed:', err.message)
    await client.end()
    process.exit(3)
  }

  // ── Step 3: post-apply fingerprint + verification ──────────────────────────
  console.log('\n== Step 3: post-apply verification ==')
  const post = await captureFingerprint(client, true)
  console.log(`  columns: ${post.column_count} (was ${pre.column_count}, expected +1)`)
  console.log(`  indexes: ${post.index_count} (was ${pre.index_count}, expected +1)`)
  console.log(`  rows: ${post.row_count} (must equal pre: ${pre.row_count})`)

  const postColNames = new Set(post.columns.map((c) => c.column_name))
  const postIdxNames = new Set(post.indexes.map((i) => i.indexname))

  const checks = []
  if (!postColNames.has(EXPECTED_NEW_COLUMN)) checks.push(`column ${EXPECTED_NEW_COLUMN} missing`)
  if (!postIdxNames.has(EXPECTED_NEW_INDEX)) checks.push(`index ${EXPECTED_NEW_INDEX} missing`)

  const colRow = post.columns.find((c) => c.column_name === EXPECTED_NEW_COLUMN)
  if (colRow) {
    if (colRow.data_type !== 'text') checks.push(`column type=${colRow.data_type}, expected text`)
    if (colRow.is_nullable !== 'NO') checks.push(`column nullable=${colRow.is_nullable}, expected NO`)
    if (!colRow.column_default || !colRow.column_default.includes("'unknown'")) {
      checks.push(`column default=${colRow.column_default}, expected to contain 'unknown'`)
    }
  }

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

  console.log(`\n  ✓ ${EXPECTED_NEW_COLUMN} column added (text NOT NULL DEFAULT 'unknown')`)
  console.log(`  ✓ ${EXPECTED_NEW_INDEX} index created`)
  console.log('  ✓ row count unchanged')

  if (post.route_distribution && post.route_distribution.length > 0) {
    console.log('\n  backfill route distribution (post-apply):')
    for (const r of post.route_distribution) {
      console.log(`    ${(r.lead_origin_route || '(null)').padEnd(30)} ${r.n}`)
    }
  }

  await client.end()
  console.log('\n== T2c APPLIED SUCCESSFULLY ==')
  console.log('Next: T2d data-quality CHECK constraints (appointment_status, assignment_source).')
}

main().catch((err) => {
  console.error('Apply failed:', err)
  process.exit(1)
})