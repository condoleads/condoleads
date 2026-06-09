// scripts/apply-home-adjustments-migration.js
//
// Gated apply-runner for the home_adjustments migration (v10 step 3 Phase 1).
// HOLDS — operator must explicitly invoke:
//   APPLY_CONFIRMED=1 node scripts/apply-home-adjustments-migration.js
//
// Audit 2026-06-09 caught two defects in the original runner and fixed them
// in this revision — both fixes are critical for an RLS-bearing table:
//
//   DEFECT 1 (transaction boundary): the SQL file used to carry its own
//   BEGIN; ... COMMIT;, so by the time the runner's verification queries
//   executed, the migration was already persisted in the database — a
//   verification failure couldn't roll back. This revision moves transaction
//   control INTO the Node runner: BEGIN, DDL, name-level verify, COMMIT-on-
//   pass / ROLLBACK-on-fail. The SQL file is now pure DDL with no
//   self-COMMIT.
//
//   DEFECT 2 (count-only verification): the original asserted `policy_count
//   === 5 AND index_count >= 8` — passes on shape-wrong-name-right migrations
//   (e.g. a policy with a permissive USING true clause on an RLS table would
//   not be caught). This revision verifies by NAME for every artifact: 5
//   specific policy names + their USING expressions for the 4 tenant_isolation
//   policies (must contain the agents.user_id = auth.uid() tenant derivation),
//   4 specific partial-unique index names + their predicates, the
//   at_most_one_scope CHECK constraint by conname, 4 FK constraints by
//   conname, the updated_at trigger by tgname, and all expected column names
//   from information_schema.columns.
//
// HARD GATE per CLAUDE.md: "Production-DB write — the actual `apply-*`
// execution pauses for explicit operator approval". This file is the
// runner; the invocation with APPLY_CONFIRMED=1 IS the approval.

require('dotenv').config({ path: '.env.local' })
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const MIGRATION_FILE = path.resolve(__dirname, '..', 'supabase', 'migrations', '20260609_create_home_adjustments.sql')
const SNAPSHOT_DIR = path.resolve(__dirname, '..', 'supabase', 'migrations', 'rollback-snapshots')

// Expected schema artifacts — name-level verification asserts each item
// matches by name AND (for tenant_isolation policies) by USING-expression
// pattern. The tenant-isolation derivation MUST contain the
// auth.uid()-joined agents-table lookup, NOT a permissive clause; otherwise
// this RLS table leaks across tenants.

const EXPECTED_POLICIES = [
  'home_adjustments_tenant_isolation_select',
  'home_adjustments_tenant_isolation_insert',
  'home_adjustments_tenant_isolation_update',
  'home_adjustments_tenant_isolation_delete',
  'home_adjustments_service_role',
]
const TENANT_ISOLATION_POLICIES = [
  'home_adjustments_tenant_isolation_select',
  'home_adjustments_tenant_isolation_insert',
  'home_adjustments_tenant_isolation_update',
  'home_adjustments_tenant_isolation_delete',
]
const EXPECTED_INDEXES_UNIQUE = [
  // partial unique indexes — the predicate for each must match the lock'd
  // scope shape (audit checks the indexdef contains the right WHERE branch)
  { name: 'home_adjustments_unique_community', predicate: 'community_id IS NOT NULL' },
  { name: 'home_adjustments_unique_municipality', predicate: 'municipality_id IS NOT NULL' },
  { name: 'home_adjustments_unique_area', predicate: 'area_id IS NOT NULL' },
  { name: 'home_adjustments_unique_generic', predicate: 'area_id IS NULL' },
]
const EXPECTED_INDEXES_READPATH = [
  'idx_home_adjustments_tenant_community',
  'idx_home_adjustments_tenant_municipality',
  'idx_home_adjustments_tenant_area',
]
const EXPECTED_FKS = [
  // conname follows PG's default naming: <table>_<col>_fkey
  'home_adjustments_tenant_id_fkey',
  'home_adjustments_area_id_fkey',
  'home_adjustments_municipality_id_fkey',
  'home_adjustments_community_id_fkey',
]
const EXPECTED_CHECK = 'home_adjustments_at_most_one_scope'
const EXPECTED_TRIGGER = 'trg_home_adjustments_updated_at'
const EXPECTED_COLUMNS = [
  // identity + scope
  'id', 'tenant_id', 'area_id', 'municipality_id', 'community_id', 'type',
  // proportional frontage (h6 pair)
  'lot_frontage_per_foot_pct', 'lot_frontage_max_pct',
  // additive sale-side
  'lot_depth_per_10ft', 'lot_depth_max',
  'basement_finished', 'basement_sep_entrance', 'basement_walkout_bonus',
  'garage_detached_single', 'garage_attached_single', 'garage_builtin', 'garage_attached_double',
  'pool_inground', 'bathroom_full', 'bathroom_half',
  // lease-side
  'parking_per_space',
  // audit
  'created_at', 'updated_at', 'updated_by',
]

async function verify(c, failures) {
  // Single round-trip for the cheap markers; richer name-level checks below.
  const v = (await c.query(`
    SELECT
      to_regclass('public.home_adjustments') AS table_exists,
      (SELECT relrowsecurity FROM pg_class WHERE relname='home_adjustments') AS rls_enabled,
      (SELECT relforcerowsecurity FROM pg_class WHERE relname='home_adjustments') AS rls_forced
  `)).rows[0]

  if (v.table_exists !== 'home_adjustments') failures.push(`table_exists != home_adjustments (got ${v.table_exists})`)
  if (v.rls_enabled !== true) failures.push(`rls_enabled != true (got ${v.rls_enabled})`)
  if (v.rls_forced !== true) failures.push(`rls_forced != true (got ${v.rls_forced})`)

  // ----- columns by name (information_schema) -----
  const colRows = (await c.query(`
    SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'home_adjustments'
  `)).rows
  const colSet = new Set(colRows.map(r => r.column_name))
  for (const expected of EXPECTED_COLUMNS) {
    if (!colSet.has(expected)) failures.push(`column missing: ${expected}`)
  }

  // ----- policies by NAME + per-command expression check -----
  // Fix 2026-06-09 (apply attempt #1 verifier false-positive): PG stores
  // RLS policy expressions in two columns: polqual (USING) and polwithcheck
  // (WITH CHECK). Which one is populated depends on polcmd:
  //   'r' SELECT  → USING only         (polqual set, polwithcheck NULL)
  //   'a' INSERT  → WITH CHECK only    (polqual NULL, polwithcheck set)
  //   'w' UPDATE  → BOTH               (both set)
  //   'd' DELETE  → USING only         (polqual set, polwithcheck NULL)
  //   '*' ALL     → BOTH               (covers all commands)
  // The original verifier asserted USING on all 4 tenant_isolation policies,
  // which gave a false positive on the INSERT policy (legit NULL USING).
  // Fix: query both columns, branch the content check by polcmd, assert
  // tenant-scoping on whichever expression(s) that command actually uses.
  // The tenant-leak guard is PRESERVED — every command checks the right
  // expression(s); none are skipped.
  const polRows = (await c.query(`
    SELECT polname, polcmd,
           pg_get_expr(polqual, polrelid)      AS using_expr,
           pg_get_expr(polwithcheck, polrelid) AS with_check_expr
      FROM pg_policy WHERE polrelid = 'public.home_adjustments'::regclass
  `)).rows
  const polByName = {}
  for (const r of polRows) polByName[r.polname] = r
  for (const name of EXPECTED_POLICIES) {
    if (!polByName[name]) failures.push(`policy missing: ${name}`)
  }

  // Helper: assert a single expression is the tenant-scoped agents-joined
  // pattern. Rejects permissive `true` outright (the tenant-leak shape on
  // an RLS table). Tag = "USING" or "WITH CHECK" for the failure message.
  function assertTenantScopedExpr(name, tag, expr, failures) {
    if (!expr) {
      // The branching logic must guarantee we only call this for an
      // expression the policy SHOULD have declared. A null here means
      // either the policy is missing it (defect in the migration) OR
      // the verifier's branch is wrong (defect in the runner). Fail loud.
      failures.push(`policy ${name}: ${tag} expression unexpectedly null — migration or verifier defect`)
      return
    }
    const e = expr.toLowerCase()
    if (e === 'true' || e.trim() === '(true)') {
      failures.push(`policy ${name}: PERMISSIVE ${tag} (true) detected — tenant leak`)
      return  // permissive supersedes the other content checks; one strong signal is enough
    }
    if (!e.includes('auth.uid()')) failures.push(`policy ${name}: ${tag} does not reference auth.uid() (got: ${expr})`)
    if (!e.includes('agents'))     failures.push(`policy ${name}: ${tag} does not join agents table (got: ${expr})`)
    if (!e.includes('tenant_id'))  failures.push(`policy ${name}: ${tag} does not scope by tenant_id (got: ${expr})`)
  }

  // Per-command branching for tenant_isolation policies. The service_role
  // policy is checked by name only — it's deliberately permissive (USING
  // true / WITH CHECK true) because the matcher read path runs in
  // anonymous-buyer context. App-side .eq('tenant_id', ...) enforces that
  // path. Asserting tenant-scoping on service_role would fail by design.
  for (const name of TENANT_ISOLATION_POLICIES) {
    const r = polByName[name]
    if (!r) continue  // missing-policy already reported above
    switch (r.polcmd) {
      case 'r': // SELECT — USING only
        assertTenantScopedExpr(name, 'USING', r.using_expr, failures)
        break
      case 'a': // INSERT — WITH CHECK only; USING is NULL by PG design
        assertTenantScopedExpr(name, 'WITH CHECK', r.with_check_expr, failures)
        break
      case 'w': // UPDATE — BOTH expressions must scope (existing row AND new row)
        assertTenantScopedExpr(name, 'USING', r.using_expr, failures)
        assertTenantScopedExpr(name, 'WITH CHECK', r.with_check_expr, failures)
        break
      case 'd': // DELETE — USING only
        assertTenantScopedExpr(name, 'USING', r.using_expr, failures)
        break
      default:
        failures.push(`policy ${name}: unexpected polcmd '${r.polcmd}' — verifier branch not defined`)
    }
  }

  // ----- indexes: partial-unique by NAME + predicate; read-path by NAME -----
  const idxRows = (await c.query(`
    SELECT indexname, indexdef FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'home_adjustments'
  `)).rows
  const idxByName = {}
  for (const r of idxRows) idxByName[r.indexname] = r.indexdef
  for (const { name, predicate } of EXPECTED_INDEXES_UNIQUE) {
    const def = idxByName[name]
    if (!def) {
      failures.push(`partial-unique index missing: ${name}`)
      continue
    }
    if (!/CREATE UNIQUE INDEX/i.test(def)) failures.push(`index ${name}: not UNIQUE (def: ${def})`)
    if (!def.includes(predicate)) failures.push(`index ${name}: missing WHERE predicate '${predicate}' (def: ${def})`)
  }
  for (const name of EXPECTED_INDEXES_READPATH) {
    if (!idxByName[name]) failures.push(`read-path index missing: ${name}`)
  }

  // ----- CHECK constraint by conname -----
  const checkRow = (await c.query(`
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.home_adjustments'::regclass AND contype = 'c' AND conname = $1
  `, [EXPECTED_CHECK])).rows[0]
  if (!checkRow) failures.push(`CHECK constraint missing: ${EXPECTED_CHECK}`)

  // ----- FK constraints by conname -----
  const fkRows = (await c.query(`
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.home_adjustments'::regclass AND contype = 'f'
  `)).rows
  const fkNames = new Set(fkRows.map(r => r.conname))
  for (const expected of EXPECTED_FKS) {
    if (!fkNames.has(expected)) failures.push(`FK constraint missing: ${expected}`)
  }

  // ----- trigger by tgname -----
  const trgRow = (await c.query(`
    SELECT tgname FROM pg_trigger
     WHERE tgrelid = 'public.home_adjustments'::regclass AND tgname = $1
  `, [EXPECTED_TRIGGER])).rows[0]
  if (!trgRow) failures.push(`trigger missing: ${EXPECTED_TRIGGER}`)
}

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
    console.error('Transaction model: Node-managed. BEGIN ; DDL ; name-level verify ;')
    console.error('  COMMIT on pass / ROLLBACK on any failure. Verify failure leaves')
    console.error('  zero persisted state.')
    console.error('')
    console.error('Verification (name-level, post-fix):')
    console.error('  - all 15 columns + 6 identity/scope/audit columns present')
    console.error('  - 5 policies by polname, with tenant_isolation USING checks')
    console.error('    (auth.uid() + agents join + tenant_id; reject permissive USING true)')
    console.error('  - 4 partial-unique indexes by name + predicate')
    console.error('  - 3 read-path indexes by name')
    console.error('  - CHECK constraint home_adjustments_at_most_one_scope by conname')
    console.error('  - 4 FK constraints by conname')
    console.error('  - trigger trg_home_adjustments_updated_at by tgname')
    console.error('')
    console.error('Rollback path: ROLLBACK is automatic on any verify-fail (Node-managed).')
    console.error('Manual rollback (only if needed post-COMMIT): DROP TABLE home_adjustments CASCADE.')
    process.exit(1)
  }

  let sql = fs.readFileSync(MIGRATION_FILE, 'utf8')
  if (sql.charCodeAt(0) === 0xFEFF) sql = sql.slice(1)  // strip BOM if present

  // Sanity guard: SQL file MUST NOT contain its own BEGIN/COMMIT at the
  // outer level (would re-introduce defect 1). The plpgsql function body's
  // BEGIN ... END inside CREATE FUNCTION is fine — it's not a transaction
  // control statement. We look for top-of-line BEGIN; / COMMIT; only.
  const lines = sql.split(/\r?\n/)
  const offendingLines = []
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (trimmed === 'BEGIN;' || trimmed === 'COMMIT;' || trimmed === 'ROLLBACK;') {
      offendingLines.push(`line ${i + 1}: ${trimmed}`)
    }
  }
  if (offendingLines.length > 0) {
    console.error('ABORT — migration SQL contains its own transaction control:')
    for (const l of offendingLines) console.error('  ' + l)
    console.error('Remove these from the SQL — the runner owns transaction control.')
    process.exit(5)
  }

  // Pool the apply through pgBouncer (port 6543) to bypass direct-conn quirks
  // on local Windows machines.
  const c = new Client({ connectionString: process.env.DATABASE_URL.replace(':5432', ':6543') })
  await c.connect()
  console.log('connected to ' + (process.env.DATABASE_URL || '').replace(/:[^@]+@/, ':***@'))

  // Pre-snapshot (taken BEFORE any DDL / txn — captures current production state)
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
    console.error('ABORT — public.home_adjustments already exists. Run DROP TABLE first if re-applying.')
    await c.end()
    process.exit(2)
  }

  // ============ Node-managed transaction (FIX 1) ============
  // BEGIN, apply DDL, verify by name, then COMMIT/ROLLBACK based on verify.
  // Any catchable error inside the try → ROLLBACK before exit.
  try {
    await c.query('BEGIN')
    console.log('BEGIN issued by runner — transaction open')

    console.log('applying migration DDL...')
    await c.query(sql)
    console.log('DDL applied (within open txn — not yet committed)')

    console.log('')
    console.log('verifying post-DDL state (name-level, INSIDE txn)...')
    const failures = []
    await verify(c, failures)

    if (failures.length > 0) {
      console.error('')
      console.error(`VERIFY FAILED — ${failures.length} assertion(s) failed. Rolling back.`)
      for (const f of failures) console.error('  ✗ ' + f)
      await c.query('ROLLBACK')
      console.error('ROLLBACK issued — zero persisted state.')
      await c.end()
      process.exit(4)
    }

    await c.query('COMMIT')
    console.log('COMMIT issued — migration finalized.')
  } catch (e) {
    // Any error mid-flight: attempt explicit ROLLBACK (idempotent — PG will
    // no-op if the txn is already aborted by the failing statement). Then
    // exit with the error.
    console.error('apply ERROR:', e.message)
    try { await c.query('ROLLBACK') } catch (_) { /* already aborted */ }
    console.error('ROLLBACK issued — zero persisted state.')
    await c.end()
    process.exit(3)
  }

  // Post-commit summary (everything below this runs AFTER the txn closes;
  // no rollback is possible at this point, but verify already passed so
  // this is just informational).
  const summary = (await c.query(`
    SELECT
      (SELECT count(*) FROM pg_policy WHERE polrelid = 'public.home_adjustments'::regclass) AS policy_count,
      (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'home_adjustments') AS index_count,
      (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'home_adjustments') AS column_count,
      (SELECT count(*) FROM home_adjustments) AS row_count
  `)).rows[0]
  console.log('')
  console.log('OK — home_adjustments table live.')
  console.log(`  policies: ${summary.policy_count}`)
  console.log(`  indexes:  ${summary.index_count}`)
  console.log(`  columns:  ${summary.column_count}`)
  console.log(`  rows:     ${summary.row_count}  (should be 0)`)
  await c.end()
}

main().catch(e => { console.error(e); process.exit(99) })
