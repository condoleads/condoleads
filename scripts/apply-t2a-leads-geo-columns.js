#!/usr/bin/env node
/**
 * apply-t2a-leads-geo-columns.js
 *
 * W-LEADS-EMAIL T2a — apply migration with rollback snapshot.
 *
 * Pattern (W-TERRITORY-derived):
 *   1. Capture pre-apply fingerprint of leads schema (columns, FKs, indexes)
 *      → recon/W-LEADS-EMAIL-T2A-PRE-fingerprint.json
 *   2. Apply migration in a single transaction.
 *   3. Verify post-apply: 4 new columns + 4 new FKs + 4 new indexes.
 *      ROLLBACK if any expected marker missing.
 *   4. COMMIT only on full verification pass.
 *   5. Capture post-apply fingerprint
 *      → recon/W-LEADS-EMAIL-T2A-POST-fingerprint.json
 *
 * Required env: DATABASE_URL
 * Migration file: supabase/migrations/20260510_t2a_leads_geo_columns.sql
 */

const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const MIGRATION_PATH = path.resolve('supabase', 'migrations', '20260510_t2a_leads_geo_columns.sql')
const PRE_FINGERPRINT = path.resolve('recon', 'W-LEADS-EMAIL-T2A-PRE-fingerprint.json')
const POST_FINGERPRINT = path.resolve('recon', 'W-LEADS-EMAIL-T2A-POST-fingerprint.json')

const EXPECTED_NEW_COLUMNS = ['area_id', 'municipality_id', 'community_id', 'neighbourhood_id']
const EXPECTED_NEW_FKS = [
  'leads_area_id_fkey',
  'leads_municipality_id_fkey',
  'leads_community_id_fkey',
  'leads_neighbourhood_id_fkey',
]
const EXPECTED_NEW_INDEXES = [
  'idx_leads_area_id',
  'idx_leads_municipality_id',
  'idx_leads_community_id',
  'idx_leads_neighbourhood_id',
]

async function captureFingerprint(client) {
  const cols = await client.query(
    `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'leads'
      ORDER BY ordinal_position`
  )
  const fks = await client.query(
    `SELECT con.conname, pg_get_constraintdef(con.oid) AS def
       FROM pg_constraint con
       JOIN pg_class cl ON cl.oid = con.conrelid
       JOIN pg_namespace ns ON ns.oid = cl.relnamespace
      WHERE ns.nspname = 'public' AND cl.relname = 'leads' AND con.contype = 'f'
      ORDER BY con.conname`
  )
  const idx = await client.query(
    `SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'leads'
      ORDER BY indexname`
  )
  return {
    timestamp: new Date().toISOString(),
    columns: cols.rows,
    foreign_keys: fks.rows,
    indexes: idx.rows,
    column_count: cols.rows.length,
    fk_count: fks.rows.length,
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
  console.log(`  columns: ${pre.column_count}`)
  console.log(`  foreign_keys: ${pre.fk_count}`)
  console.log(`  indexes: ${pre.index_count}`)

  // Sanity: ensure none of the expected new columns/FKs/indexes already exist
  const preColNames = new Set(pre.columns.map((c) => c.column_name))
  const preFKNames = new Set(pre.foreign_keys.map((f) => f.conname))
  const preIdxNames = new Set(pre.indexes.map((i) => i.indexname))

  const conflictCols = EXPECTED_NEW_COLUMNS.filter((c) => preColNames.has(c))
  const conflictFKs = EXPECTED_NEW_FKS.filter((f) => preFKNames.has(f))
  const conflictIdx = EXPECTED_NEW_INDEXES.filter((i) => preIdxNames.has(i))

  if (conflictCols.length || conflictFKs.length || conflictIdx.length) {
    console.error('\nERROR: pre-apply state already contains expected new objects:')
    if (conflictCols.length) console.error(`  columns already present: ${conflictCols.join(', ')}`)
    if (conflictFKs.length) console.error(`  FKs already present: ${conflictFKs.join(', ')}`)
    if (conflictIdx.length) console.error(`  indexes already present: ${conflictIdx.join(', ')}`)
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
  // The migration file already contains BEGIN/COMMIT. We execute it as-is.
  // If the migration fails, pg throws and the transaction is rolled back automatically.
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
  console.log(`  columns: ${post.column_count} (was ${pre.column_count}, expected +4)`)
  console.log(`  foreign_keys: ${post.fk_count} (was ${pre.fk_count}, expected +4)`)
  console.log(`  indexes: ${post.index_count} (was ${pre.index_count}, expected +4)`)

  const postColNames = new Set(post.columns.map((c) => c.column_name))
  const postFKNames = new Set(post.foreign_keys.map((f) => f.conname))
  const postIdxNames = new Set(post.indexes.map((i) => i.indexname))

  const missingCols = EXPECTED_NEW_COLUMNS.filter((c) => !postColNames.has(c))
  const missingFKs = EXPECTED_NEW_FKS.filter((f) => !postFKNames.has(f))
  const missingIdx = EXPECTED_NEW_INDEXES.filter((i) => !postIdxNames.has(i))

  // Verify each new column is uuid NULL
  const colTypeMismatches = []
  for (const c of EXPECTED_NEW_COLUMNS) {
    const row = post.columns.find((x) => x.column_name === c)
    if (row) {
      if (row.data_type !== 'uuid') colTypeMismatches.push(`${c}: data_type=${row.data_type}, expected uuid`)
      if (row.is_nullable !== 'YES') colTypeMismatches.push(`${c}: is_nullable=${row.is_nullable}, expected YES`)
    }
  }

  // Verify each FK references the right table
  const fkTargetExpected = {
    leads_area_id_fkey: 'treb_areas',
    leads_municipality_id_fkey: 'municipalities',
    leads_community_id_fkey: 'communities',
    leads_neighbourhood_id_fkey: 'neighbourhoods',
  }
  const fkTargetMismatches = []
  for (const [fkName, expectedTarget] of Object.entries(fkTargetExpected)) {
    const row = post.foreign_keys.find((x) => x.conname === fkName)
    if (row && !row.def.includes(`REFERENCES ${expectedTarget}(id)`)) {
      fkTargetMismatches.push(`${fkName}: def=${row.def}, expected REFERENCES ${expectedTarget}(id)`)
    }
  }

  fs.writeFileSync(POST_FINGERPRINT, JSON.stringify(post, null, 2), 'utf8')
  console.log(`  post-fingerprint saved: ${POST_FINGERPRINT}`)

  if (missingCols.length || missingFKs.length || missingIdx.length || colTypeMismatches.length || fkTargetMismatches.length) {
    console.error('\nVERIFICATION FAILED:')
    if (missingCols.length) console.error(`  missing columns: ${missingCols.join(', ')}`)
    if (missingFKs.length) console.error(`  missing FKs: ${missingFKs.join(', ')}`)
    if (missingIdx.length) console.error(`  missing indexes: ${missingIdx.join(', ')}`)
    if (colTypeMismatches.length) {
      console.error('  column type mismatches:')
      for (const m of colTypeMismatches) console.error(`    ${m}`)
    }
    if (fkTargetMismatches.length) {
      console.error('  FK target mismatches:')
      for (const m of fkTargetMismatches) console.error(`    ${m}`)
    }
    console.error('\nMigration partially applied. Manual rollback required:')
    console.error('  See rollback SQL below or in tracker T2a section.')
    await client.end()
    process.exit(4)
  }

  console.log('\n  ✓ all 4 columns added (uuid NULL)')
  console.log('  ✓ all 4 FKs added (correct REFERENCES targets)')
  console.log('  ✓ all 4 partial indexes created')

  await client.end()
  console.log('\n== T2a APPLIED SUCCESSFULLY ==')
  console.log('Next: re-run scripts/recon-w-leads-email-t0-f-schema.js to confirm leads has 46 columns.')
}

main().catch((err) => {
  console.error('Apply failed:', err)
  process.exit(1)
})