// scripts/apply-f-pmt-grant-fix.js
// Apply-runner for F-PLATFORM-MANAGER-TENANTS-SERVICE-ROLE-GRANT (P1 FIX 3 of 3).
//
// Sequence:
//   1. Connect as postgres via DATABASE_URL (session pooler port 5432 -- SET
//      LOCAL must persist for V2's role-switch).
//   2. Capture pre-state grants snapshot to rollback-snapshots/ (forensic).
//   3. BEGIN -> execute the up-migration .sql (V1-V3 inline) -> COMMIT (or
//      auto-ROLLBACK on any V-assert RAISE).
//   4. Post-COMMIT verify under POSTGRES (no role-switch -- v25 lesson; the
//      smoke harness does the service_role tests separately).
//
// Per CLAUDE.md / v25 / Event-4 lesson: post-COMMIT probes that need
// restricted tables must read as postgres. Smoke does the role-switch work.
require('dotenv').config({ path: '.env.local' })
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const ROOT = path.resolve(__dirname, '..')
const MIGRATION_PATH = path.join(ROOT, 'supabase', 'migrations', '20260601_f_pmt_grant_fix.sql')
const SNAPSHOTS_DIR  = path.join(ROOT, 'supabase', 'migrations', 'rollback-snapshots')

function tsNow () { return new Date().toISOString().replace(/[:.]/g, '-') }
function stripBom (s) { return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s }

function assertSessionPooler (url) {
  const m = /:(\d{4,5})\//.exec(url || '')
  if (!m) throw new Error('apply-runner: could not parse port from DATABASE_URL')
  if (m[1] === '6543') {
    throw new Error('apply-runner: DATABASE_URL points at port 6543 (transaction pooler). Use port 5432 (session pooler) so SET LOCAL persists in V-asserts.')
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
  console.log('[apply] connected as postgres')

  // ============================================================
  // STEP A. Snapshot pre-state grants on platform_manager_tenants.
  // Forensic record. The down-migration is hand-rolled in
  // 20260601_f_pmt_grant_fix_down.sql; this snapshot is evidence
  // of what the grant state was at the moment of apply.
  // ============================================================
  const ts = tsNow()
  const snapshotPath = path.join(SNAPSHOTS_DIR, `_f-pmt-grant_${ts}.sql`)
  try {
    const r = await c.query(`
      SELECT grantee, privilege_type
        FROM information_schema.role_table_grants
       WHERE table_schema='public' AND table_name='platform_manager_tenants'
       ORDER BY grantee, privilege_type`)
    const rls = await c.query(`
      SELECT relrowsecurity, relforcerowsecurity
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relname='platform_manager_tenants'`)
    const lines = [
      `-- F-PLATFORM-MANAGER-TENANTS-SERVICE-ROLE-GRANT -- PRE-FIX SNAPSHOT`,
      `-- Captured: ${ts}`,
      `-- relrowsecurity=${rls.rows[0]?.relrowsecurity}  relforcerowsecurity=${rls.rows[0]?.relforcerowsecurity}`,
      `-- Pre-fix grants (information_schema.role_table_grants):`
    ]
    for (const row of r.rows) lines.push(`--   ${row.grantee} -> ${row.privilege_type}`)
    lines.push('')
    lines.push('-- Forensic only. Down-migration at 20260601_f_pmt_grant_fix_down.sql does')
    lines.push('-- REVOKE SELECT ON public.platform_manager_tenants FROM service_role;')
    fs.writeFileSync(snapshotPath, lines.join('\n'), 'utf8')
    console.log('[apply] pre-fix snapshot written:', snapshotPath)
    console.log('[apply] pre-fix grants:')
    for (const row of r.rows) console.log('         ', row.grantee, '->', row.privilege_type)
    if (!r.rows.some(x => x.grantee === 'service_role' && x.privilege_type === 'SELECT')) {
      console.log('[apply] confirmed: service_role has NO SELECT pre-apply')
    } else {
      console.log('[apply] WARNING: service_role already has SELECT pre-apply (idempotent re-run?)')
    }
  } catch (e) {
    await c.end()
    console.error('[apply] snapshot step FAILED:', e.message)
    process.exit(1)
  }

  // ============================================================
  // STEP B. Apply migration in a single transaction.
  // V1..V3 are inline DO $$ blocks; any RAISE EXCEPTION rolls
  // the tx back automatically.
  // ============================================================
  const notices = []
  c.on('notice', (n) => notices.push(n.message))

  try {
    await c.query('BEGIN')
    console.log('[apply] tx BEGIN')
    await c.query(migrationSql)
    console.log('[apply] migration body executed; V-asserts evaluated')
    console.log('[apply] NOTICEs:')
    for (const m of notices) console.log('         ', m)

    // Pre-COMMIT sanity: confirm the grant is present in pg_catalog.
    const post = await c.query(`
      SELECT COUNT(*)::int AS n
        FROM information_schema.role_table_grants
       WHERE table_schema='public' AND table_name='platform_manager_tenants'
         AND grantee='service_role' AND privilege_type='SELECT'`)
    if (post.rows[0].n !== 1) {
      throw new Error(`pre-COMMIT sanity: service_role SELECT grant count=${post.rows[0].n} (expected 1)`)
    }
    console.log('[apply] pre-COMMIT sanity OK: service_role SELECT grant present')

    await c.query('COMMIT')
    console.log('[apply] tx COMMIT')
  } catch (e) {
    try { await c.query('ROLLBACK') } catch (_) {}
    console.error('[apply] APPLY FAILED -- transaction ROLLBACK:', e.message)
    console.error('[apply] NOTICEs captured before failure:')
    for (const m of notices) console.error('         ', m)
    console.error('[apply] pre-fix snapshot intact at:', snapshotPath)
    await c.end()
    process.exit(1)
  }

  // ============================================================
  // STEP C. Post-COMMIT verify under POSTGRES (no role-switch).
  // v25 lesson: post-COMMIT probes that need restricted tables
  // must read as postgres. Smoke does the service_role tests
  // separately in its own role-switch BEGIN/ROLLBACK envelopes.
  // ============================================================
  try {
    const r = await c.query(`
      SELECT has_table_privilege('service_role', 'public.platform_manager_tenants', 'SELECT') AS has_select`)
    if (r.rows[0].has_select !== true) {
      throw new Error(`post-COMMIT: has_table_privilege('service_role', ...) = ${r.rows[0].has_select}`)
    }
    console.log('[apply] post-COMMIT verify OK: has_table_privilege(service_role, SELECT) = true')
  } catch (e) {
    console.error('[apply] POST-COMMIT VERIFY FAILED (grant is live but probe failed):', e.message)
    console.error('[apply] consider running the down-migration:')
    console.error('         node scripts/apply-f-pmt-grant-fix-down.js')
    await c.end()
    process.exit(2)
  }

  await c.end()
  console.log('[apply] DONE.')
  console.log('[apply] next: run smoke harness -> node scripts/smoke-f-pmt-grant-fix.js')
})().catch(e => { console.error('apply-runner uncaught:', e); process.exit(1) })
