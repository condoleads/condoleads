// scripts/apply-f-reroll-coupled-check-fix.js
// Apply-runner for F-REROLL-LISTINGS-AT-GEO-COUPLED-CHECK (P1 FIX 2 of 3).
//
// Sequence:
//   1. Connect via DATABASE_URL (postgres role, port-5432 session pooler --
//      enforces session-pooler so SET LOCAL persists across statements).
//   2. Read the CURRENT live body of public.reroll_listings_at_geo via
//      pg_get_functiondef and write it to a timestamped snapshot file at
//      supabase/migrations/rollback-snapshots/ (forensic evidence).
//   3. Read the up-migration .sql, strip any UTF-8 BOM, BEGIN, execute,
//      check that V1..V4 all emitted PASS notices (RAISE EXCEPTION inside
//      V-asserts auto-fails the tx).
//   4. If everything passes, COMMIT and re-verify under postgres (NOT under
//      service_role -- the v25/Event-4 lesson: post-COMMIT probes that
//      need restricted tables must read as postgres). If any step failed,
//      ROLLBACK with snapshot still intact for forensics.
//
// Per CLAUDE.md "Production DB changes":
//   - Single transaction; in-tx verification asserts.
//   - rollback-snapshot captured before the apply.
//   - DISABLE_STATEMENT_TIMEOUT not needed at this scale.
//
// Per the user's instruction "STOP before apply" -- this runner is the apply
// gate. The user explicitly invokes it AFTER reviewing the migration package.
require('dotenv').config({ path: '.env.local' })
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const ROOT = path.resolve(__dirname, '..')
const MIGRATION_PATH = path.join(ROOT, 'supabase', 'migrations', '20260601_f_reroll_coupled_check_fix.sql')
const SNAPSHOTS_DIR  = path.join(ROOT, 'supabase', 'migrations', 'rollback-snapshots')

function tsNow () {
  const d = new Date()
  return d.toISOString().replace(/[:.]/g, '-')
}

function stripBom (s) {
  return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s
}

function assertSessionPooler (url) {
  // CLAUDE.md / v19 lesson: port 5432 (session pooler) preserves SET LOCAL
  // across statements; port 6543 (transaction pooler) does not. Our V-asserts
  // rely on SET LOCAL app.skip_apa_reroll, so this runner refuses 6543.
  const m = /:(\d{4,5})\//.exec(url || '')
  if (!m) throw new Error('apply-runner: could not parse port from DATABASE_URL')
  if (m[1] === '6543') {
    throw new Error('apply-runner: DATABASE_URL points at port 6543 (transaction pooler). Use port 5432 (session pooler) so SET LOCAL persists.')
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

  if (!fs.existsSync(SNAPSHOTS_DIR)) {
    fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true })
  }

  const c = new Client({ connectionString: url })
  c.on('error', (e) => console.error('[apply] CLIENT ERROR:', e.message))
  await c.connect()
  console.log('[apply] connected as postgres')

  // ============================================================
  // STEP A. Snapshot the current live body.
  // ============================================================
  const ts = tsNow()
  const snapshotPath = path.join(SNAPSHOTS_DIR, `_f-reroll-coupled-check_${ts}.sql`)
  let preDef
  try {
    const r = await c.query(`
      SELECT pg_get_functiondef(p.oid) AS def,
             p.prosecdef,
             p.proconfig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname = 'reroll_listings_at_geo'`)
    if (r.rowCount === 0) {
      throw new Error('apply-runner: pre-state reroll_listings_at_geo not found in DB')
    }
    preDef = r.rows[0]
    const snapshotContent = [
      `-- F-REROLL-LISTINGS-AT-GEO-COUPLED-CHECK -- PRE-FIX SNAPSHOT`,
      `-- Captured: ${ts}`,
      `-- prosecdef: ${preDef.prosecdef}  proconfig: ${JSON.stringify(preDef.proconfig)}`,
      `-- This is the EXACT live body before the up-migration. Forensic only;`,
      `-- the down-migration at 20260601_f_reroll_coupled_check_fix_down.sql`,
      `-- has the same body inline so rollback is repeatable without this file.`,
      ``,
      preDef.def
    ].join('\n')
    fs.writeFileSync(snapshotPath, snapshotContent, 'utf8')
    console.log('[apply] pre-fix snapshot written:', snapshotPath)
    console.log('[apply] pre-fix prosecdef:', preDef.prosecdef, '  proconfig:', preDef.proconfig)
  } catch (e) {
    await c.end()
    console.error('[apply] snapshot step FAILED:', e.message)
    process.exit(1)
  }

  // ============================================================
  // STEP B. Apply the up-migration inside a single transaction.
  // V1..V4 are inline DO $$ blocks; any RAISE EXCEPTION rolls
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

    // Inline sanity-check before COMMIT (defense in depth).
    const post = await c.query(`
      SELECT p.prosecdef, p.proconfig,
             p.pronargs,
             pg_get_function_arguments(p.oid) AS args,
             pg_get_function_result(p.oid) AS result_type
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname='public' AND p.proname='reroll_listings_at_geo'`)
    const row = post.rows[0]
    if (!row || row.prosecdef !== true) {
      throw new Error(`apply-runner: post-apply prosecdef=${row && row.prosecdef} (expected true)`)
    }
    const cfg = (row.proconfig || []).join(',')
    if (!/search_path=public,\s*pg_temp/i.test(cfg)) {
      throw new Error(`apply-runner: post-apply proconfig="${cfg}" lacks locked search_path`)
    }
    if (row.pronargs !== 3) {
      throw new Error(`apply-runner: post-apply pronargs=${row.pronargs} (expected 3)`)
    }
    if (row.result_type !== 'integer') {
      throw new Error(`apply-runner: post-apply result_type="${row.result_type}" (expected integer)`)
    }
    console.log('[apply] post-apply sanity OK:', JSON.stringify(row))

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
  // STEP C. Post-COMMIT verification under postgres (NO role-switch
  // -- v25 lesson). Read-only confirms the function is callable and
  // produces 0 on the no-op inputs.
  // ============================================================
  try {
    const r1 = await c.query(`SELECT public.reroll_listings_at_geo('community', NULL::uuid, gen_random_uuid()) AS n`)
    if (r1.rows[0].n !== 0) throw new Error(`post-COMMIT V-NULL: expected 0, got ${r1.rows[0].n}`)
    const r2 = await c.query(`SELECT public.reroll_listings_at_geo('pin', gen_random_uuid(), gen_random_uuid()) AS n`)
    if (r2.rows[0].n !== 0) throw new Error(`post-COMMIT V-SCOPE: expected 0, got ${r2.rows[0].n}`)
    console.log('[apply] post-COMMIT verify OK -- function callable, guards return 0')
  } catch (e) {
    console.error('[apply] POST-COMMIT VERIFY FAILED (function is live but probes failed):', e.message)
    console.error('[apply] consider running the down-migration:')
    console.error('         node scripts/apply-f-reroll-coupled-check-fix-down.js')
    await c.end()
    process.exit(2)
  }

  await c.end()
  console.log('[apply] DONE.')
  console.log('[apply] next: run smoke harness -> node scripts/smoke-f-reroll-coupled-check-fix.js')
})().catch(e => { console.error('apply-runner uncaught:', e); process.exit(1) })
