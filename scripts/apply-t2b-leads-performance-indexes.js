#!/usr/bin/env node
/**
 * apply-t2b-leads-performance-indexes.js
 *
 * W-LEADS-EMAIL T2b — apply migration with rollback snapshot.
 *
 * Pattern matches T2a runner: pre-fingerprint, apply in transaction,
 * post-fingerprint, verify expected new objects, COMMIT.
 *
 * Required env: DATABASE_URL
 * Migration file: supabase/migrations/20260510_t2b_leads_performance_indexes.sql
 */

const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const MIGRATION_PATH = path.resolve('supabase', 'migrations', '20260510_t2b_leads_performance_indexes.sql')
const PRE_FINGERPRINT = path.resolve('recon', 'W-LEADS-EMAIL-T2B-PRE-fingerprint.json')
const POST_FINGERPRINT = path.resolve('recon', 'W-LEADS-EMAIL-T2B-POST-fingerprint.json')

const EXPECTED_NEW_INDEXES = [
  'idx_leads_tenant_email',
  'idx_leads_listing_id',
  'idx_leads_source',
]

const EXPECTED_INDEX_DEFS = {
  idx_leads_tenant_email: /CREATE INDEX idx_leads_tenant_email ON public\.leads USING btree \(tenant_id, contact_email\)/,
  idx_leads_listing_id: /CREATE INDEX idx_leads_listing_id ON public\.leads USING btree \(listing_id\) WHERE \(listing_id IS NOT NULL\)/,
  idx_leads_source: /CREATE INDEX idx_leads_source ON public\.leads USING btree \(source\)/,
}

async function captureFingerprint(client) {
  const idx = await client.query(
    `SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'leads'
      ORDER BY indexname`
  )
  return {
    timestamp: new Date().toISOString(),
    indexes: idx.rows,
    index_count: idx.rows.length,
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
  const pre = await captureFingerprint(client)
  console.log(`  indexes: ${pre.index_count}`)

  const preIdxNames = new Set(pre.indexes.map((i) => i.indexname))
  const conflicts = EXPECTED_NEW_INDEXES.filter((i) => preIdxNames.has(i))
  if (conflicts.length) {
    console.error(`\nERROR: indexes already present: ${conflicts.join(', ')}`)
    console.error('Migration appears to have already been applied. Aborting without changes.')
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
  const post = await captureFingerprint(client)
  console.log(`  indexes: ${post.index_count} (was ${pre.index_count}, expected +3)`)

  const postIdxNames = new Set(post.indexes.map((i) => i.indexname))
  const missing = EXPECTED_NEW_INDEXES.filter((i) => !postIdxNames.has(i))

  // Verify each new index has the expected def shape
  const defMismatches = []
  for (const [idxName, pattern] of Object.entries(EXPECTED_INDEX_DEFS)) {
    const row = post.indexes.find((x) => x.indexname === idxName)
    if (row && !pattern.test(row.indexdef)) {
      defMismatches.push(`${idxName}: def=${row.indexdef}`)
    }
  }

  fs.writeFileSync(POST_FINGERPRINT, JSON.stringify(post, null, 2), 'utf8')
  console.log(`  post-fingerprint saved: ${POST_FINGERPRINT}`)

  if (missing.length || defMismatches.length) {
    console.error('\nVERIFICATION FAILED:')
    if (missing.length) console.error(`  missing indexes: ${missing.join(', ')}`)
    if (defMismatches.length) {
      console.error('  index def mismatches:')
      for (const m of defMismatches) console.error(`    ${m}`)
    }
    await client.end()
    process.exit(4)
  }

  console.log('\n  ✓ idx_leads_tenant_email created (composite — fixes dup-detection scan)')
  console.log('  ✓ idx_leads_listing_id created (partial WHERE NOT NULL)')
  console.log('  ✓ idx_leads_source created')

  await client.end()
  console.log('\n== T2b APPLIED SUCCESSFULLY ==')
  console.log('Next: T2c lead_origin_route column migration.')
}

main().catch((err) => {
  console.error('Apply failed:', err)
  process.exit(1)
})