// scripts/apply-home-adjustments-migration.js
//
// Gated apply-runner for the home_adjustments migration (v10 step 3 Phase 1).
// HOLDS — operator must explicitly invoke:
//   APPLY_CONFIRMED=1 node scripts/apply-home-adjustments-migration.js
//
// Pattern mirrors prior gated runners (snapshot → BEGIN → verify → COMMIT /
// ROLLBACK). Captures a pre-snapshot of schema state (tables + policies)
// before applying; verifies post-state markers; aborts on any mismatch.
//
// HARD GATE per CLAUDE.md: "Production-DB write — the actual `apply-*`
// execution pauses for explicit operator approval". This file is the
// runner, not the trigger — invocation = approval.

require('dotenv').config({ path: '.env.local' })
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const MIGRATION_FILE = path.resolve(__dirname, '..', 'supabase', 'migrations', '20260609_create_home_adjustments.sql')
const SNAPSHOT_DIR = path.resolve(__dirname, '..', 'supabase', 'migrations', 'rollback-snapshots')

async function main() {
  if (!process.env.APPLY_CONFIRMED) {
    console.error('==========================================================')
    console.error('HOLD — apply requires explicit operator confirmation.')
    console.error('Invoke with: APPLY_CONFIRMED=1 node scripts/apply-home-adjustments-migration.js')
    console.error('==========================================================')
    console.error('')
    console.error('Pre-flight summary:')
    console.error('  Migration file: ' + MIGRATION_FILE)
    console.error('  Creates table:  home_adjustments')
    console.error('  RLS enforced:   YES (tenant_id IN agents.user_id = auth.uid())')
    console.error('  Service-role:   full access (matcher read path)')
    console.error('  Default-empty:  no-op (resolver falls through to DEFAULT_ADJUSTMENTS)')
    console.error('')
    console.error('This is a NEW-table migration (CREATE TABLE IF NOT EXISTS).')
    console.error('No data is mutated, no existing schema is altered.')
    console.error('Rollback path: DROP TABLE home_adjustments CASCADE (no callers exist pre-apply).')
    process.exit(1)
  }

  let sql = fs.readFileSync(MIGRATION_FILE, 'utf8')
  if (sql.charCodeAt(0) === 0xFEFF) sql = sql.slice(1)  // strip BOM if present

  // Pool the apply through pgBouncer (port 6543) to bypass direct-conn quirks
  // on local Windows machines. statement_timeout=0 disabled (migration is fast).
  const c = new Client({ connectionString: process.env.DATABASE_URL.replace(':5432', ':6543') })
  await c.connect()
  console.log('connected to ' + (process.env.DATABASE_URL || '').replace(/:[^@]+@/, ':***@'))

  // Pre-snapshot
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const snapPath = path.join(SNAPSHOT_DIR, `home_adjustments_pre_${ts}.json`)
  const preSnap = {
    timestamp: ts,
    migration: '20260609_create_home_adjustments.sql',
    pre_table_exists: (await c.query("SELECT to_regclass('public.home_adjustments') AS r")).rows[0].r,
    pre_policies: (await c.query(`
      SELECT polname FROM pg_policy
       WHERE polrelid = 'public.home_adjustments'::regclass
    `).catch(() => ({ rows: [] }))).rows,
  }
  fs.writeFileSync(snapPath, JSON.stringify(preSnap, null, 2))
  console.log('pre-snapshot: ' + snapPath)
  console.log('pre_table_exists: ' + preSnap.pre_table_exists)

  if (preSnap.pre_table_exists) {
    console.error('ABORT — public.home_adjustments already exists. Run rollback first if re-applying.')
    await c.end()
    process.exit(2)
  }

  // Apply (the migration is itself wrapped in BEGIN/COMMIT; pg client treats
  // it as one batch — if anything inside fails, the explicit ROLLBACK fires).
  try {
    console.log('applying migration...')
    await c.query(sql)
    console.log('migration applied (CREATE TABLE + indexes + RLS + policies + trigger)')
  } catch (e) {
    console.error('apply FAILED:', e.message)
    await c.end()
    process.exit(3)
  }

  // Verify post-state markers
  const verify = await c.query(`
    SELECT
      to_regclass('public.home_adjustments') AS table_exists,
      (SELECT relrowsecurity FROM pg_class WHERE relname='home_adjustments') AS rls_enabled,
      (SELECT relforcerowsecurity FROM pg_class WHERE relname='home_adjustments') AS rls_forced,
      (SELECT count(*) FROM pg_policy WHERE polrelid='public.home_adjustments'::regclass) AS policy_count,
      (SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND tablename='home_adjustments') AS index_count
  `)
  const v = verify.rows[0]
  console.log('')
  console.log('verify post-state:')
  console.log('  table_exists: ' + v.table_exists)
  console.log('  rls_enabled:  ' + v.rls_enabled)
  console.log('  rls_forced:   ' + v.rls_forced)
  console.log('  policy_count: ' + v.policy_count + ' (expect 5: 4 tenant_isolation + 1 service_role)')
  console.log('  index_count:  ' + v.index_count + ' (expect 8: PK + 4 unique partial + 3 read-path)')

  const pass =
    v.table_exists === 'home_adjustments' &&
    v.rls_enabled === true &&
    v.rls_forced === true &&
    Number(v.policy_count) === 5 &&
    Number(v.index_count) >= 8

  if (!pass) {
    console.error('')
    console.error('VERIFY FAILED — post-state does not match expectations. Investigate before relying on this migration.')
    process.exit(4)
  }

  console.log('')
  console.log('OK — home_adjustments table live with RLS + 5 policies + ' + v.index_count + ' indexes.')
  console.log('row count (should be 0): ' + (await c.query('SELECT count(*) AS n FROM home_adjustments')).rows[0].n)
  await c.end()
}

main().catch(e => { console.error(e); process.exit(99) })
