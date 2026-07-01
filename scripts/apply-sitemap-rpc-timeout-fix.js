// W-MARKETING A-UNIT-1b TIMEOUT FIX — apply runner.
//
// Applies supabase/migrations/20260701_w_marketing_sitemap_rpc_timeout_fix.sql
// (3× CREATE OR REPLACE FUNCTION adding SET statement_timeout = 0).
//
// OPTIONAL: composite index CREATE INDEX CONCURRENTLY idx_mls_listings_status_id
// ON mls_listings (standard_status, id) — gated behind INCLUDE_INDEX=1 env var.
// The index eliminates the 11MB external sort in the sitemap listings plan
// (17.7s -> expected <500ms per call). Recommend running INCLUDE_INDEX=1.
//
// Runner shape (same as scripts/apply-sitemap-rpc-functions.js):
//   1. Pre-snapshot current function defs to recon/
//   2. IF INCLUDE_INDEX=1: create index CONCURRENTLY OUTSIDE any txn
//      (CONCURRENTLY cannot run inside BEGIN/COMMIT). Skips if it exists.
//   3. Apply function migration in a transaction (BEGIN / SQL / COMMIT).
//   4. Post-verify (still in txn): call the exact rpcs that failed in
//      Stage 2 probe (deep-offset listings + full-count buildings + geo)
//      and prove they now complete without timeout.
//   5. Throw-not-die on failure -> ROLLBACK -> clean exit.
//
// USAGE:
//   node scripts/apply-sitemap-rpc-timeout-fix.js                  (functions only, minimal fix)
//   INCLUDE_INDEX=1 node scripts/apply-sitemap-rpc-timeout-fix.js  (recommended: functions + index)

require('dotenv').config({ path: '.env.local' })
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const MIG_PATH = path.resolve(
  __dirname, '..', 'supabase', 'migrations',
  '20260701_w_marketing_sitemap_rpc_timeout_fix.sql'
)
const SNAPSHOT_PATH = path.resolve(
  __dirname, '..', 'recon', 'sitemap-rpc-timeout-fix-presnapshot.txt'
)
const INDEX_NAME = 'idx_mls_listings_status_id'
const INDEX_DDL = `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${INDEX_NAME}
                     ON public.mls_listings (standard_status, id)`

const INCLUDE_INDEX = process.env.INCLUDE_INDEX === '1'

function die(msg) { console.error('ABORT:', msg); process.exit(1) }
function pass(msg) { console.log('  PASS:', msg) }

;(async () => {
  console.log('=== W-MARKETING A-UNIT-1b TIMEOUT FIX — apply runner ===')
  console.log('  Mode: ' + (INCLUDE_INDEX ? 'FUNCTIONS + INDEX' : 'FUNCTIONS ONLY (set INCLUDE_INDEX=1 to also create the index)'))
  console.log()

  if (!fs.existsSync(MIG_PATH)) die('migration file not found: ' + MIG_PATH)
  let sql = fs.readFileSync(MIG_PATH, 'utf8')
  if (sql.charCodeAt(0) === 0xFEFF) sql = sql.slice(1)
  console.log('  migration file: ' + MIG_PATH + ' (' + sql.length + ' bytes)')

  const connStr = process.env.DATABASE_URL
  if (!connStr) die('DATABASE_URL not set in .env.local')

  const c = new Client({ connectionString: connStr })
  c.on('error', e => console.error('pg client error:', e.message))
  await c.connect()

  try {
    // ─── PRE-SNAPSHOT ────────────────────────────────────────────────────
    console.log('\n--- PRE-SNAPSHOT: capture current function defs ---')
    const priorFns = await c.query(
      `SELECT p.proname                                                            AS name,
              pg_catalog.pg_get_function_identity_arguments(p.oid)                 AS args,
              pg_catalog.pg_get_functiondef(p.oid)                                 AS def
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('get_sitemap_listings',
                            'get_sitemap_buildings',
                            'get_sitemap_geo_slugs')
        ORDER BY p.proname`
    )
    console.log('  found ' + priorFns.rows.length + ' prior definition(s):')
    for (const r of priorFns.rows) console.log('    - ' + r.name + '(' + r.args + ')')

    // Check if the target index already exists
    const priorIdx = await c.query(
      `SELECT indexdef FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'mls_listings' AND indexname = $1`,
      [INDEX_NAME]
    )
    const indexExists = priorIdx.rows.length > 0
    console.log('  index ' + INDEX_NAME + ' exists? ' + (indexExists ? 'YES' : 'no'))

    // Write rollback snapshot
    const reconDir = path.dirname(SNAPSHOT_PATH)
    if (!fs.existsSync(reconDir)) fs.mkdirSync(reconDir, { recursive: true })
    const snap = [
      'W-MARKETING A-UNIT-1b TIMEOUT FIX — pre-apply snapshot',
      'snapshot timestamp: ' + new Date().toISOString(),
      '',
      'index ' + INDEX_NAME + ' pre-state: ' + (indexExists ? 'EXISTS' : 'DOES NOT EXIST'),
      '',
      'prior function definitions (' + priorFns.rows.length + '):',
      ...priorFns.rows.map(r => '\n---- ' + r.name + '(' + r.args + ') ----\n' + r.def + '\n'),
    ].join('\n')
    fs.writeFileSync(SNAPSHOT_PATH, snap, 'utf8')
    console.log('  snapshot written: ' + SNAPSHOT_PATH)

    // ─── PHASE A: INDEX (outside txn — CONCURRENTLY requires autocommit) ─
    if (INCLUDE_INDEX) {
      if (indexExists) {
        console.log('\n--- PHASE A: skip index (already exists) ---')
      } else {
        console.log('\n--- PHASE A: CREATE INDEX CONCURRENTLY (outside txn; may take 30-90s on 1.36M rows) ---')
        // Disable timeout for this session — CONCURRENTLY on 1.36M rows
        // exceeds 8s easily. NOT wrapped in BEGIN/COMMIT.
        await c.query('SET statement_timeout = 0')
        const t0 = Date.now()
        try {
          await c.query(INDEX_DDL)
          console.log('  PASS: index created in ' + (Date.now() - t0) + 'ms')
        } catch (err) {
          // If CREATE INDEX CONCURRENTLY fails mid-way it leaves an INVALID
          // index. Detect and report.
          const chk = await c.query(
            `SELECT indexrelid::regclass AS name, indisvalid AS valid
               FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
              WHERE c.relname = $1`,
            [INDEX_NAME]
          )
          const invalid = chk.rows.length > 0 && chk.rows[0].valid === false
          die('CREATE INDEX CONCURRENTLY failed: ' + err.message +
              (invalid ? '  INVALID index left behind — drop manually: DROP INDEX CONCURRENTLY IF EXISTS ' + INDEX_NAME : ''))
        }
      }
    } else {
      console.log('\n--- PHASE A: skipped (INCLUDE_INDEX not set) ---')
    }

    // ─── PHASE B: FUNCTIONS in transaction ───────────────────────────────
    console.log('\n--- PHASE B: BEGIN transaction, apply function migration ---')
    await c.query('BEGIN')
    try {
      await c.query('SET LOCAL statement_timeout = 0')  // safe: this session's txn
      console.log('  executing migration SQL...')
      await c.query(sql)
      console.log('  SQL applied (still in-transaction, not yet committed)')

      // ─── POST-VERIFY: prove the timeout fix actually holds ─────────────
      console.log('\n--- POST-VERIFY: prove timeout is gone through the SQL path ---')

      // NOTE: this session's SET LOCAL statement_timeout=0 masks the fix
      // being INSIDE the function. Reset to a low bound and rely on the
      // function's own SET clause to override.
      await c.query('SET LOCAL statement_timeout = \'30s\'')
      pass('session statement_timeout reset to 30s — function must self-override')

      // 1. get_sitemap_listings at DEEP offset (previously timed out at 8s)
      const t1 = Date.now()
      const probeL = await c.query('SELECT count(*)::int AS n FROM public.get_sitemap_listings($1, $2)', [5000, 90000])
      const nL = probeL.rows[0].n
      const msL = Date.now() - t1
      // At offset 90000, only 86140 - 90000 = -3860 rows exist (offset past end) → 0 rows.
      // But the query still completed without timeout. Try a valid deep offset:
      pass(`get_sitemap_listings(5000, 90000) returned ${nL} rows in ${msL}ms (was timing out at 8s)`)

      const t1b = Date.now()
      const probeL2 = await c.query('SELECT count(*)::int AS n FROM public.get_sitemap_listings($1, $2)', [5000, 50000])
      const nL2 = probeL2.rows[0].n
      const msL2 = Date.now() - t1b
      if (nL2 < 1) throw new Error('get_sitemap_listings(5000, 50000) returned 0 rows — expected up to 5000')
      pass(`get_sitemap_listings(5000, 50000) returned ${nL2} rows in ${msL2}ms`)

      // 2. get_sitemap_buildings full count (was timing out at 8s)
      const t2 = Date.now()
      const probeB = await c.query('SELECT count(*)::int AS n FROM public.get_sitemap_buildings()')
      const nB = probeB.rows[0].n
      const msB = Date.now() - t2
      if (nB < 1) throw new Error(`get_sitemap_buildings returned ${nB} rows (expected >=1)`)
      pass(`get_sitemap_buildings() returned ${nB} rows in ${msB}ms`)

      // 3. get_sitemap_geo_slugs full count (should always be fast)
      const t3 = Date.now()
      const probeG = await c.query('SELECT count(*)::int AS n FROM public.get_sitemap_geo_slugs()')
      const nG = probeG.rows[0].n
      const msG = Date.now() - t3
      if (nG < 1) throw new Error(`get_sitemap_geo_slugs returned ${nG} rows (expected >=1)`)
      pass(`get_sitemap_geo_slugs() returned ${nG} rows in ${msG}ms`)

      // 4. Verify SET statement_timeout=0 is in each function's proconfig
      const cfgCheck = await c.query(
        `SELECT p.proname, p.proconfig
           FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND p.proname IN ('get_sitemap_listings','get_sitemap_buildings','get_sitemap_geo_slugs')
          ORDER BY p.proname`
      )
      for (const r of cfgCheck.rows) {
        const cfg = (r.proconfig || []).join(',')
        if (!/statement_timeout=0/.test(cfg)) {
          throw new Error(`${r.proname} missing statement_timeout=0 in proconfig: ${cfg}`)
        }
        pass(`${r.proname} proconfig contains statement_timeout=0`)
      }

      // 5. Verify GRANT EXECUTE to service_role is still intact
      const aclCheck = await c.query(
        `SELECT p.proname,
                COALESCE(pg_catalog.array_to_string(p.proacl, ','), '') AS acl
           FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND p.proname IN ('get_sitemap_listings','get_sitemap_buildings','get_sitemap_geo_slugs')
          ORDER BY p.proname`
      )
      for (const r of aclCheck.rows) {
        if (!r.acl.includes('service_role=X')) {
          throw new Error(`${r.proname} missing EXECUTE grant to service_role (acl=${r.acl})`)
        }
        pass(`${r.proname} grants EXECUTE to service_role`)
      }

      // All post-verify passed → commit
      console.log('\n--- COMMIT ---')
      await c.query('COMMIT')
      pass('transaction committed')

    } catch (err) {
      console.error('  ERROR — rolling back:', err.message)
      await c.query('ROLLBACK')
      die('apply failed inside transaction; DB unchanged (except index if INCLUDE_INDEX was applied — that persists)')
    }

    console.log('\n=== DONE — migration applied and verified ===')

  } finally {
    await c.end()
  }
})().catch(e => {
  console.error('FATAL:', e.message)
  process.exit(1)
})
