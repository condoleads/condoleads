// scripts/apply-event7-reconcile.js
// Apply-runner for P-LIFECYCLE Event 7 (nightly reconcile).
//
// TWO-PHASE APPLY (restructured 2026-06-01):
//
//   PHASE 1 -- non-transactional, FIRST.
//     CREATE INDEX CONCURRENTLY idx_mls_listings_updated_at ON mls_listings(updated_at).
//     CONCURRENTLY cannot run inside a tx block; it's its own step. After
//     the build, verify pg_index.indisvalid = true. If the concurrent build
//     fails or leaves the index invalid, DROP it and ABORT -- do NOT proceed
//     to phase 2.
//
//     Why CONCURRENTLY: non-CONCURRENTLY takes ACCESS EXCLUSIVE on mls_listings
//     for ~30s on 1.3M rows, blocking ALL reads/writes including geo-page
//     renders and the lead-path cache resolve. CONCURRENTLY takes only
//     short locks and lets concurrent traffic continue; build runs ~3x
//     longer (~90s) but the hot table stays available.
//
//   PHASE 2 -- transactional, AFTER index is valid.
//     The rest of the migration: CREATE TABLE reconcile_corrections + 2
//     indexes, extend tenant_floor_alerts CHECKs, CREATE OR REPLACE
//     reconcile_tenant_cache (SECURITY DEFINER + locked search_path),
//     GRANT SELECT to service_role, V1-V5 in-tx asserts -> COMMIT or
//     auto-ROLLBACK on any V-assert RAISE.
//
// Post-COMMIT verify under POSTGRES (no role-switch -- v25 lesson). The
// reconcile_tenant_cache function mutates state (NULL trio + walk + INSERT
// corrections), so the post-COMMIT verify wraps in BEGIN/ROLLBACK to leave
// no residue in production.

require('dotenv').config({ path: '.env.local' })
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const ROOT = path.resolve(__dirname, '..')
const MIGRATION_PATH = path.join(ROOT, 'supabase', 'migrations', '20260601_event7_reconcile.sql')
const SNAPSHOTS_DIR  = path.join(ROOT, 'supabase', 'migrations', 'rollback-snapshots')

function tsNow () { return new Date().toISOString().replace(/[:.]/g, '-') }
function stripBom (s) { return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s }

function assertSessionPooler (url) {
  const m = /:(\d{4,5})\//.exec(url || '')
  if (!m) throw new Error('apply-runner: could not parse port from DATABASE_URL')
  if (m[1] === '6543') {
    throw new Error('apply-runner: DATABASE_URL points at port 6543 (transaction pooler). Use port 5432 (session pooler) so SET LOCAL + TEMP tables persist across the V5 assertion.')
  }
}

;(async () => {
  const url = process.env.DATABASE_URL
  if (!url) { console.error('apply-runner: no DATABASE_URL'); process.exit(1) }
  assertSessionPooler(url)

  const migrationSqlRaw = fs.readFileSync(MIGRATION_PATH, 'utf8')
  const migrationSql = stripBom(migrationSqlRaw)
  console.log('[apply] migration file:', MIGRATION_PATH)
  console.log('[apply] migration size:', migrationSql.length, 'chars')

  if (!fs.existsSync(SNAPSHOTS_DIR)) fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true })

  const c = new Client({ connectionString: url })
  c.on('error', (e) => console.error('[apply] CLIENT ERROR:', e.message))
  await c.connect()
  // CONCURRENTLY can run for >8s default statement_timeout on 1.3M rows.
  await c.query('SET statement_timeout = 0')
  console.log('[apply] connected as postgres; statement_timeout=0')

  // ============================================================
  // STEP A. Snapshot pre-state CHECK constraints on tenant_floor_alerts +
  // net-new object presence flags.
  // ============================================================
  const ts = tsNow()
  const snapshotPath = path.join(SNAPSHOTS_DIR, `_event7-reconcile_${ts}.sql`)
  try {
    const r = await c.query(`
      SELECT con.conname, pg_get_constraintdef(con.oid) AS def
        FROM pg_constraint con
        JOIN pg_class c ON c.oid=con.conrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relname='tenant_floor_alerts'
       ORDER BY con.conname`)
    const lines = [
      `-- P-LIFECYCLE Event 7 -- PRE-FIX SNAPSHOT`,
      `-- Captured: ${ts}`,
      ``,
      `-- tenant_floor_alerts CHECK constraints pre-Event-7:`
    ]
    for (const row of r.rows) lines.push(`--   ${row.conname}: ${row.def}`)
    const tbl = await c.query(`SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_name='reconcile_corrections'`)
    const fn  = await c.query(`SELECT COUNT(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='reconcile_tenant_cache'`)
    const idx = await c.query(`SELECT COUNT(*)::int AS n FROM pg_indexes WHERE schemaname='public' AND indexname='idx_mls_listings_updated_at'`)
    lines.push('')
    lines.push(`-- reconcile_corrections table exists pre-apply: ${tbl.rows[0].n === 0 ? 'NO' : 'YES (idempotent re-run?)'}`)
    lines.push(`-- reconcile_tenant_cache function exists pre-apply: ${fn.rows[0].n === 0 ? 'NO' : 'YES (idempotent re-run?)'}`)
    lines.push(`-- idx_mls_listings_updated_at index exists pre-apply: ${idx.rows[0].n === 0 ? 'NO' : 'YES (idempotent re-run?)'}`)
    fs.writeFileSync(snapshotPath, lines.join('\n'), 'utf8')
    console.log('[apply] pre-fix snapshot written:', snapshotPath)
    console.log('[apply] pre-state CHECKs:')
    for (const row of r.rows) console.log('         ', row.conname, ':', row.def)
    console.log('[apply] pre-apply objects: table=', tbl.rows[0].n, 'fn=', fn.rows[0].n, 'idx=', idx.rows[0].n)
  } catch (e) {
    await c.end()
    console.error('[apply] snapshot step FAILED:', e.message)
    process.exit(1)
  }

  // ============================================================
  // PHASE 1 -- non-transactional CONCURRENTLY index build.
  // CREATE INDEX CONCURRENTLY ... IF NOT EXISTS so the runner is
  // idempotent on re-run (an already-valid index is a no-op).
  // After build, assert pg_index.indisvalid = true. If invalid, DROP
  // the index (cleanup) and abort -- do NOT proceed to phase 2.
  // ============================================================
  console.log('')
  console.log('=== PHASE 1: CREATE INDEX CONCURRENTLY idx_mls_listings_updated_at ===')
  console.log('  (non-transactional; ~90s on 1.3M rows; no ACCESS EXCLUSIVE on mls_listings)')
  const phase1Start = Date.now()
  try {
    await c.query(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mls_listings_updated_at
      ON public.mls_listings (updated_at DESC)`)
    console.log('  CREATE INDEX CONCURRENTLY returned after', ((Date.now() - phase1Start) / 1000).toFixed(1), 's')
  } catch (e) {
    console.error('[apply] PHASE 1 FAILED -- CONCURRENTLY build raised:', e.message)
    console.error('[apply] checking for orphan invalid index to clean up...')
    try {
      const orphan = await c.query(`
        SELECT i.indisvalid
          FROM pg_index i
          JOIN pg_class c ON c.oid = i.indexrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname='public' AND c.relname='idx_mls_listings_updated_at'`)
      if (orphan.rowCount > 0) {
        console.error('[apply] found orphan idx_mls_listings_updated_at (indisvalid=' + orphan.rows[0].indisvalid + '); dropping...')
        await c.query('DROP INDEX IF EXISTS public.idx_mls_listings_updated_at')
        console.error('[apply] orphan index dropped.')
      } else {
        console.error('[apply] no orphan index found.')
      }
    } catch (cleanupErr) {
      console.error('[apply] cleanup attempt also failed:', cleanupErr.message)
    }
    await c.end()
    process.exit(1)
  }

  // Verify the index landed valid.
  try {
    const v = await c.query(`
      SELECT i.indisvalid
        FROM pg_index i
        JOIN pg_class c ON c.oid = i.indexrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname='public' AND c.relname='idx_mls_listings_updated_at'`)
    if (v.rowCount === 0) {
      throw new Error('post-phase-1: idx_mls_listings_updated_at not found in pg_index')
    }
    if (v.rows[0].indisvalid !== true) {
      console.error('[apply] PHASE 1 INVALID INDEX -- pg_index.indisvalid = false; CONCURRENTLY build did not complete.')
      console.error('[apply] dropping invalid index for retry safety...')
      await c.query('DROP INDEX IF EXISTS public.idx_mls_listings_updated_at')
      console.error('[apply] invalid index dropped. ABORTING -- do not proceed to phase 2.')
      await c.end()
      process.exit(1)
    }
    console.log('  PHASE 1 OK: indisvalid=true')
  } catch (e) {
    await c.end()
    console.error('[apply] PHASE 1 verify FAILED:', e.message)
    process.exit(1)
  }

  // ============================================================
  // PHASE 2 -- transactional. The rest of the migration.
  // V1-V5 inline DO blocks; any RAISE EXCEPTION rolls the tx back.
  // ============================================================
  console.log('')
  console.log('=== PHASE 2: transactional migration (table + CHECKs + function + grant + V1-V5) ===')
  const notices = []
  c.on('notice', (n) => notices.push(n.message))

  try {
    await c.query('BEGIN')
    console.log('[apply] tx BEGIN')
    await c.query(migrationSql)
    console.log('[apply] migration body executed; V-asserts evaluated')
    console.log('[apply] NOTICEs:')
    for (const m of notices) console.log('         ', m)

    // Pre-COMMIT sanity check.
    const post = await c.query(`
      SELECT
        (SELECT COUNT(*)::int FROM information_schema.tables
          WHERE table_schema='public' AND table_name='reconcile_corrections') AS tbl,
        (SELECT COUNT(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname='reconcile_tenant_cache') AS fn,
        (SELECT COUNT(*)::int FROM pg_indexes
          WHERE schemaname='public' AND indexname='idx_mls_listings_updated_at') AS idx,
        (SELECT has_table_privilege('service_role','public.reconcile_corrections','SELECT')) AS svcrole_select`)
    const row = post.rows[0]
    if (row.tbl !== 1) throw new Error(`pre-COMMIT: reconcile_corrections missing (count=${row.tbl})`)
    if (row.fn  !== 1) throw new Error(`pre-COMMIT: reconcile_tenant_cache missing (count=${row.fn})`)
    if (row.idx !== 1) throw new Error(`pre-COMMIT: idx_mls_listings_updated_at missing (count=${row.idx})`)
    if (row.svcrole_select !== true) throw new Error(`pre-COMMIT: service_role SELECT grant missing`)
    console.log('[apply] pre-COMMIT sanity OK:', row)

    await c.query('COMMIT')
    console.log('[apply] tx COMMIT')
  } catch (e) {
    try { await c.query('ROLLBACK') } catch (_) {}
    console.error('[apply] PHASE 2 FAILED -- transaction ROLLBACK:', e.message)
    console.error('[apply] NOTICEs captured before failure:')
    for (const m of notices) console.error('         ', m)
    console.error('[apply] NOTE: phase-1 idx_mls_listings_updated_at is COMMITted and survives this rollback.')
    console.error('[apply] If you intend to fully revert, run the down-migration which also DROPs the index.')
    console.error('[apply] pre-fix snapshot intact at:', snapshotPath)
    await c.end()
    process.exit(1)
  }

  // ============================================================
  // STEP C. Post-COMMIT verify under POSTGRES (no role-switch).
  // Wrap in BEGIN/ROLLBACK -- reconcile_tenant_cache MUTATES state
  // (NULL trio + walk + INSERT corrections). Verify the function is
  // callable + returns counts, then ROLLBACK so the call leaves
  // no residue in production.
  // ============================================================
  try {
    await c.query('BEGIN')
    const r = await c.query(`
      SELECT corrections_count, candidates_count
        FROM public.reconcile_tenant_cache(
          (SELECT id FROM public.tenants WHERE source_key='walliam'),
          1, 0::numeric, 999999)`)
    const row = r.rows[0]
    if (typeof row.corrections_count !== 'number') {
      await c.query('ROLLBACK')
      throw new Error(`post-COMMIT: function returned non-numeric corrections_count`)
    }
    await c.query('ROLLBACK')
    console.log('[apply] post-COMMIT verify OK (tx-isolated): reconcile_tenant_cache callable; verify-run returned candidates=' + row.candidates_count + ', corrections=' + row.corrections_count + ' (rolled back)')
  } catch (e) {
    try { await c.query('ROLLBACK') } catch (_) {}
    console.error('[apply] POST-COMMIT VERIFY FAILED (objects are live but probe failed):', e.message)
    console.error('[apply] consider running the down-migration:')
    console.error('         node scripts/apply-event7-reconcile-down.js')
    await c.end()
    process.exit(2)
  }

  await c.end()
  console.log('[apply] DONE.')
  console.log('[apply] next: run smoke harness -> node scripts/smoke-event7-reconcile.js')
})().catch(e => { console.error('apply-runner uncaught:', e); process.exit(1) })
