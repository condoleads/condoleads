// W-MARKETING A-UNIT-1b DEV-URL FIX — apply runner.
//
// CREATE OR REPLACE public.get_sitemap_geo_slugs() removing the
// developments UNION ALL branch. Community, municipality, treb_area,
// neighbourhood branches unchanged.
//
// Same runner pattern as apply-sitemap-rpc-timeout-fix.js:
//   1. Pre-snapshot current function def
//   2. Apply in transaction
//   3. Post-verify (throw-not-die):
//      - total count = 2536 (was 2543 — 7 developments removed)
//      - kind='development' returns 0 rows
//      - other kind counts unchanged: community=1948, municipality=506,
//        treb_area=73, neighbourhood=9
//   4. On failure: ROLLBACK, exit 1

require('dotenv').config({ path: '.env.local' })
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const MIG_PATH = path.resolve(
  __dirname, '..', 'supabase', 'migrations',
  '20260701_w_marketing_sitemap_remove_developments.sql'
)
const SNAPSHOT_PATH = path.resolve(
  __dirname, '..', 'recon', 'sitemap-remove-developments-presnapshot.txt'
)

// Expected counts per kind AFTER removing developments.
const EXPECTED = {
  community:     1948,
  municipality:  506,
  treb_area:     73,
  neighbourhood: 9,
}
const EXPECTED_TOTAL = 2536  // 1948 + 506 + 73 + 9

function die(msg) { console.error('ABORT:', msg); process.exit(1) }
function pass(msg) { console.log('  PASS:', msg) }

;(async () => {
  console.log('=== W-MARKETING A-UNIT-1b DEV-URL FIX — apply runner ===\n')

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
    console.log('\n--- PRE-SNAPSHOT: capture current function def ---')
    const prior = await c.query(
      `SELECT pg_catalog.pg_get_functiondef(p.oid) AS def
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'get_sitemap_geo_slugs'`
    )
    if (prior.rows.length === 0) die('get_sitemap_geo_slugs does not exist — nothing to replace')
    console.log('  captured prior definition (' + prior.rows[0].def.length + ' bytes)')

    // Snapshot BEFORE counts (for comparison)
    const beforeCounts = await c.query(
      `SELECT kind, count(*)::int AS n FROM public.get_sitemap_geo_slugs() GROUP BY kind ORDER BY kind`
    )
    console.log('  BEFORE counts by kind:')
    for (const r of beforeCounts.rows) console.log('    ' + r.kind.padEnd(14) + ' n=' + r.n)
    const beforeTotal = beforeCounts.rows.reduce((a, r) => a + r.n, 0)
    console.log('  BEFORE total: ' + beforeTotal)

    const reconDir = path.dirname(SNAPSHOT_PATH)
    if (!fs.existsSync(reconDir)) fs.mkdirSync(reconDir, { recursive: true })
    const snap = [
      'W-MARKETING A-UNIT-1b DEV-URL FIX — pre-apply snapshot',
      'snapshot timestamp: ' + new Date().toISOString(),
      '',
      'BEFORE counts by kind:',
      ...beforeCounts.rows.map(r => '  ' + r.kind + ' = ' + r.n),
      '',
      'BEFORE total: ' + beforeTotal,
      '',
      '---- prior get_sitemap_geo_slugs definition ----',
      prior.rows[0].def,
    ].join('\n')
    fs.writeFileSync(SNAPSHOT_PATH, snap, 'utf8')
    console.log('  snapshot written: ' + SNAPSHOT_PATH)

    // ─── APPLY in transaction ────────────────────────────────────────────
    console.log('\n--- APPLY: BEGIN transaction ---')
    await c.query('BEGIN')

    try {
      console.log('  executing migration SQL...')
      await c.query(sql)
      console.log('  SQL applied (still in-transaction, not yet committed)')

      // ─── POST-VERIFY ───────────────────────────────────────────────────
      console.log('\n--- POST-VERIFY: counts per kind must match expectation ---')

      const afterCounts = await c.query(
        `SELECT kind, count(*)::int AS n FROM public.get_sitemap_geo_slugs() GROUP BY kind ORDER BY kind`
      )
      const byKind = {}
      for (const r of afterCounts.rows) byKind[r.kind] = r.n
      const afterTotal = afterCounts.rows.reduce((a, r) => a + r.n, 0)

      console.log('  AFTER counts by kind:')
      for (const r of afterCounts.rows) console.log('    ' + r.kind.padEnd(14) + ' n=' + r.n)
      console.log('  AFTER total: ' + afterTotal)

      // Assertion 1: development kind must not appear
      if (byKind.development !== undefined) {
        throw new Error(`development kind still present with ${byKind.development} rows — migration did not take`)
      }
      pass('kind=development NOT present in result (7 URLs removed)')

      // Assertion 2: each expected kind matches exactly
      for (const [kind, expected] of Object.entries(EXPECTED)) {
        const actual = byKind[kind]
        if (actual !== expected) {
          throw new Error(`kind=${kind} expected ${expected}, got ${actual}`)
        }
        pass(`kind=${kind.padEnd(14)} n=${actual} (matches expected ${expected})`)
      }

      // Assertion 3: total = 2536
      if (afterTotal !== EXPECTED_TOTAL) {
        throw new Error(`total expected ${EXPECTED_TOTAL}, got ${afterTotal}`)
      }
      pass(`total=${afterTotal} (matches expected ${EXPECTED_TOTAL})`)

      // Assertion 4: proconfig preserved (statement_timeout=0 still present)
      const cfgCheck = await c.query(
        `SELECT p.proconfig
           FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'get_sitemap_geo_slugs'`
      )
      const cfg = (cfgCheck.rows[0].proconfig || []).join(',')
      if (!/statement_timeout=0/.test(cfg)) {
        throw new Error('get_sitemap_geo_slugs missing statement_timeout=0 in proconfig: ' + cfg)
      }
      pass('proconfig retains statement_timeout=0')

      // Assertion 5: GRANT EXECUTE preserved
      const aclCheck = await c.query(
        `SELECT COALESCE(pg_catalog.array_to_string(p.proacl, ','), '') AS acl
           FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'get_sitemap_geo_slugs'`
      )
      if (!aclCheck.rows[0].acl.includes('service_role=X')) {
        throw new Error('get_sitemap_geo_slugs lost EXECUTE grant to service_role')
      }
      pass('EXECUTE grant to service_role preserved')

      // All checks passed → commit
      console.log('\n--- COMMIT ---')
      await c.query('COMMIT')
      pass('transaction committed')

    } catch (err) {
      console.error('  ERROR — rolling back:', err.message)
      await c.query('ROLLBACK')
      die('apply failed inside transaction; DB unchanged')
    }

    console.log('\n=== DONE — developments removed from geo sitemap ===')

  } finally {
    await c.end()
  }
})().catch(e => {
  console.error('FATAL:', e.message)
  process.exit(1)
})
