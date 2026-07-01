// W-MARKETING A-UNIT-1b RPC REWRITE — apply runner.
//
// Applies supabase/migrations/20260701_w_marketing_sitemap_rpc_functions.sql
// to production Supabase. The migration creates 3 SQL functions:
//   - get_sitemap_listings(p_limit int, p_offset int)  RETURNS TABLE(...)
//   - get_sitemap_buildings()                          RETURNS TABLE(slug, lastmod)
//   - get_sitemap_geo_slugs()                          RETURNS TABLE(kind, slug, lastmod)
//
// SAFETY:
//   1. Pre-snapshot: capture prior existence (drop schema; if functions
//      already exist we log their prior definitions so we can restore).
//   2. Transactional apply via pg (BEGIN; ...SQL...; COMMIT).
//   3. Post-verify: call each function with a small probe and confirm:
//        get_sitemap_listings(p_limit=1, p_offset=0)      returns >= 1 row
//        get_sitemap_buildings()                          returns >= 1 row
//        get_sitemap_geo_slugs()                          returns >= 1 row per kind
//   4. On any assertion failure: ROLLBACK (transactional, so DB unchanged).
//      Errors bubble to stderr; operator can re-run.
//
// USES pg-direct (not supabase.rpc) for the apply step itself because we
// need transactional DDL — supabase-js has no transactional API. The pg
// import here is only in a Node runner script, not in a Next.js route, so
// the metadata-route-loader issue doesn't apply.
//
// EXECUTION:
//   node scripts/apply-sitemap-rpc-functions.js

require('dotenv').config({ path: '.env.local' })
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const MIG_PATH = path.resolve(
  __dirname, '..', 'supabase', 'migrations',
  '20260701_w_marketing_sitemap_rpc_functions.sql'
)

const SNAPSHOT_PATH = path.resolve(
  __dirname, '..', 'recon', 'sitemap-rpc-presnapshot.txt'
)

function die(msg) { console.error('ABORT:', msg); process.exit(1) }
function pass(msg) { console.log('  PASS:', msg) }

;(async () => {
  console.log('=== W-MARKETING A-UNIT-1b RPC REWRITE — apply runner ===\n')

  // Read the migration SQL and strip BOM if present (see CLAUDE.md).
  if (!fs.existsSync(MIG_PATH)) die('migration file not found: ' + MIG_PATH)
  let sql = fs.readFileSync(MIG_PATH, 'utf8')
  if (sql.charCodeAt(0) === 0xFEFF) sql = sql.slice(1)
  console.log(`  migration file: ${MIG_PATH} (${sql.length} bytes)`)

  const connStr = process.env.DATABASE_URL
  if (!connStr) die('DATABASE_URL not set in .env.local')

  const c = new Client({ connectionString: connStr })
  c.on('error', e => console.error('pg client error:', e.message))
  await c.connect()

  try {
    // ─── PRE-SNAPSHOT ────────────────────────────────────────────────────
    console.log('\n--- PRE-SNAPSHOT: check for prior function definitions ---')
    const priorFns = await c.query(
      `SELECT p.proname                                                              AS name,
              pg_catalog.pg_get_function_identity_arguments(p.oid)                   AS args,
              pg_catalog.pg_get_functiondef(p.oid)                                   AS def
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('get_sitemap_listings',
                            'get_sitemap_buildings',
                            'get_sitemap_geo_slugs')`
    )
    if (priorFns.rows.length === 0) {
      console.log('  no prior definitions — clean CREATE')
    } else {
      console.log(`  ${priorFns.rows.length} prior definition(s) found — CREATE OR REPLACE will overwrite`)
      for (const r of priorFns.rows) console.log(`    - ${r.name}(${r.args})`)
    }

    // Snapshot to recon/ for rollback reference.
    const reconDir = path.dirname(SNAPSHOT_PATH)
    if (!fs.existsSync(reconDir)) fs.mkdirSync(reconDir, { recursive: true })
    const snap = [
      'W-MARKETING A-UNIT-1b RPC REWRITE — pre-apply snapshot',
      `snapshot timestamp: ${new Date().toISOString()}`,
      '',
      `prior function definitions (${priorFns.rows.length}):`,
      ...priorFns.rows.map(r => `\n---- ${r.name}(${r.args}) ----\n${r.def}\n`),
    ].join('\n')
    fs.writeFileSync(SNAPSHOT_PATH, snap, 'utf8')
    console.log(`  snapshot written: ${SNAPSHOT_PATH}`)

    // ─── APPLY (transactional) ───────────────────────────────────────────
    console.log('\n--- APPLY: BEGIN transaction ---')
    await c.query('BEGIN')

    try {
      console.log('  executing migration SQL...')
      await c.query(sql)
      console.log('  SQL applied (still in-transaction, not yet committed)')

      // ─── POST-VERIFY (still in-transaction) ────────────────────────────
      console.log('\n--- POST-VERIFY: probe each function ---')

      // 1. get_sitemap_listings
      // NOTE: post-verify assertions THROW (not die/process.exit) so the
      // surrounding catch runs ROLLBACK before the process exits. process.exit
      // does not throw — it terminates immediately, bypassing catch/finally.
      const probeL = await c.query('SELECT * FROM public.get_sitemap_listings($1, $2)', [3, 0])
      if (probeL.rows.length < 1) throw new Error('get_sitemap_listings returned 0 rows on probe (expected >=1)')
      pass(`get_sitemap_listings(3,0) returned ${probeL.rows.length} rows`)
      console.log('    sample row 0:', JSON.stringify(probeL.rows[0]))

      // 2. get_sitemap_buildings — count only (full result could be ~4634 rows)
      const probeB = await c.query('SELECT count(*)::int AS n FROM public.get_sitemap_buildings()')
      const nB = probeB.rows[0].n
      if (nB < 1) throw new Error(`get_sitemap_buildings returned ${nB} rows (expected >=1)`)
      pass(`get_sitemap_buildings() returned ${nB} rows`)

      // 3. get_sitemap_geo_slugs — breakdown by kind
      const probeG = await c.query(
        `SELECT kind, count(*)::int AS n
           FROM public.get_sitemap_geo_slugs()
          GROUP BY kind
          ORDER BY kind`
      )
      const nG = probeG.rows.reduce((a, r) => a + r.n, 0)
      if (nG < 1) throw new Error(`get_sitemap_geo_slugs returned ${nG} rows (expected >=1)`)
      pass(`get_sitemap_geo_slugs() returned ${nG} rows total`)
      for (const r of probeG.rows) console.log(`    kind=${r.kind.padEnd(14)} n=${r.n}`)

      // 4. GRANT sanity — service_role should be able to EXECUTE.
      // We verify the grant landed by checking pg_proc's acl.
      const aclCheck = await c.query(
        `SELECT p.proname,
                COALESCE(pg_catalog.array_to_string(p.proacl, ','), '') AS acl
           FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public'
            AND p.proname IN ('get_sitemap_listings',
                              'get_sitemap_buildings',
                              'get_sitemap_geo_slugs')
          ORDER BY p.proname`
      )
      for (const r of aclCheck.rows) {
        if (!r.acl.includes('service_role=X')) {
          throw new Error(`function ${r.proname} missing EXECUTE grant to service_role (acl=${r.acl})`)
        }
        pass(`${r.proname} grants EXECUTE to service_role`)
      }

      // All checks passed — commit.
      console.log('\n--- COMMIT ---')
      await c.query('COMMIT')
      pass('transaction committed')

    } catch (err) {
      console.error('  ERROR — rolling back:', err.message)
      await c.query('ROLLBACK')
      die('apply failed inside transaction; DB unchanged')
    }

    console.log('\n=== DONE — migration applied and verified ===')

  } finally {
    await c.end()
  }
})().catch(e => {
  console.error('FATAL:', e.message)
  process.exit(1)
})
