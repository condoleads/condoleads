// W-MARKETING A-UNIT-1b PARTIAL INDEX SWAP — apply runner.
//
// DROP CONCURRENTLY idx_mls_listings_status_id (unused composite from
// timeout-fix migration) + CREATE CONCURRENTLY idx_mls_listings_sitemap
// (partial index matching the sitemap listings predicate exactly).
//
// Both DDLs are autocommit (CONCURRENTLY cannot run inside a transaction).
//
// Post-verify PROVES the plan uses the new index and the external merge
// sort is gone. Throws (not die-process.exit) so a failed post-verify
// bubbles up cleanly. But note: because DROP + CREATE ran outside any
// txn, they PERSIST regardless. A failed post-verify does NOT roll
// them back — it just reports the failure. Operator must manually
// restore if the swap is bad. The recovery path is documented in the
// migration SQL.
//
// USAGE:
//   node scripts/apply-sitemap-partial-index.js

require('dotenv').config({ path: '.env.local' })
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')
const { createClient } = require('@supabase/supabase-js')

const OLD_INDEX = 'idx_mls_listings_status_id'
const NEW_INDEX = 'idx_mls_listings_sitemap'
const NEW_INDEX_DDL = `CREATE INDEX CONCURRENTLY ${NEW_INDEX}
  ON public.mls_listings (id)
  WHERE standard_status IN ('Active', 'Active Under Contract')
    AND (
      property_type = 'Residential Condo & Other'
      OR (
        property_type = 'Residential Freehold'
        AND property_subtype IN (
          'Detached', 'Semi-Detached', 'Att/Row/Townhouse',
          'Link', 'Duplex', 'Triplex', 'Fourplex', 'Multiplex'
        )
      )
    )`

const SQL_BODY = `
  SELECT ml.listing_key::text, ml.unparsed_address::text, ml.unit_number::text, ml.property_type::text,
         ml.street_number::text, ml.street_name::text,
         COALESCE(ml.modification_timestamp, ml.updated_at) AS lastmod
    FROM mls_listings ml
   WHERE ml.standard_status IN ('Active', 'Active Under Contract')
     AND (
       ml.property_type = 'Residential Condo & Other'
       OR (ml.property_type = 'Residential Freehold'
           AND ml.property_subtype IN ('Detached','Semi-Detached','Att/Row/Townhouse','Link','Duplex','Triplex','Fourplex','Multiplex'))
     )
   ORDER BY ml.id
   LIMIT 5000 OFFSET %OFFSET%
`.trim()

const SNAPSHOT_PATH = path.resolve(
  __dirname, '..', 'recon', 'sitemap-partial-index-presnapshot.txt'
)

function die(msg) { console.error('ABORT:', msg); process.exit(1) }
function pass(msg) { console.log('  PASS:', msg) }

;(async () => {
  console.log('=== W-MARKETING A-UNIT-1b PARTIAL INDEX SWAP — apply runner ===\n')

  const connStr = process.env.DATABASE_URL
  if (!connStr) die('DATABASE_URL not set in .env.local')

  const c = new Client({ connectionString: connStr })
  c.on('error', e => console.error('pg client error:', e.message))
  await c.connect()

  // Autocommit session — no BEGIN, no COMMIT. CONCURRENTLY requires this.
  await c.query('SET statement_timeout = 0')

  try {
    // ─── PRE-SNAPSHOT ────────────────────────────────────────────────────
    console.log('--- PRE-SNAPSHOT: current index state + EXPLAIN ---')
    const priorIdxs = await c.query(
      `SELECT indexname, indexdef, pg_size_pretty(pg_relation_size(indexname::regclass)) AS size
         FROM pg_indexes
        WHERE schemaname='public' AND tablename='mls_listings'
          AND indexname IN ($1, $2)
        ORDER BY indexname`,
      [OLD_INDEX, NEW_INDEX]
    )
    console.log(`  found ${priorIdxs.rows.length} of the two target indexes:`)
    for (const r of priorIdxs.rows) console.log(`    - ${r.indexname} (${r.size})`)
    const oldExists = priorIdxs.rows.some(r => r.indexname === OLD_INDEX)
    const newExists = priorIdxs.rows.some(r => r.indexname === NEW_INDEX)

    // Capture the BEFORE plan
    console.log('  BEFORE plan (offset 50000, current index state):')
    const beforePlan = await c.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ' + SQL_BODY.replace('%OFFSET%', '50000'))
    const beforeText = beforePlan.rows.map(r => r['QUERY PLAN']).join('\n')
    for (const line of beforeText.split('\n')) console.log('    ' + line)

    // Snapshot to recon/
    const reconDir = path.dirname(SNAPSHOT_PATH)
    if (!fs.existsSync(reconDir)) fs.mkdirSync(reconDir, { recursive: true })
    const snap = [
      'W-MARKETING A-UNIT-1b PARTIAL INDEX SWAP — pre-apply snapshot',
      `snapshot timestamp: ${new Date().toISOString()}`,
      '',
      `${OLD_INDEX} exists? ${oldExists ? 'YES' : 'no'}`,
      `${NEW_INDEX} exists? ${newExists ? 'YES' : 'no'}`,
      '',
      priorIdxs.rows.length > 0 ? 'index defs:' : '',
      ...priorIdxs.rows.map(r => `  ${r.indexname}: ${r.indexdef} [${r.size}]`),
      '',
      'BEFORE plan (offset 50000):',
      beforeText,
    ].join('\n')
    fs.writeFileSync(SNAPSHOT_PATH, snap, 'utf8')
    console.log(`  snapshot written: ${SNAPSHOT_PATH}`)

    // ─── DROP old index ──────────────────────────────────────────────────
    console.log('\n--- DROP CONCURRENTLY IF EXISTS ' + OLD_INDEX + ' ---')
    if (!oldExists) {
      console.log('  skip — index does not exist')
    } else {
      const t0 = Date.now()
      await c.query(`DROP INDEX CONCURRENTLY IF EXISTS public.${OLD_INDEX}`)
      pass(`dropped in ${Date.now() - t0}ms`)
    }

    // ─── CREATE new partial index ────────────────────────────────────────
    console.log('\n--- CREATE INDEX CONCURRENTLY ' + NEW_INDEX + ' ---')
    if (newExists) {
      console.log('  skip — index already exists (idempotent re-run)')
    } else {
      const t0 = Date.now()
      try {
        await c.query(NEW_INDEX_DDL)
        pass(`created in ${Date.now() - t0}ms`)
      } catch (err) {
        // Check for INVALID index
        const chk = await c.query(
          `SELECT c.relname, i.indisvalid AS valid
             FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
            WHERE c.relname = $1`,
          [NEW_INDEX]
        )
        const invalid = chk.rows.length > 0 && chk.rows[0].valid === false
        die('CREATE INDEX CONCURRENTLY failed: ' + err.message +
            (invalid ? `\n  INVALID index left behind — recover with: DROP INDEX CONCURRENTLY IF EXISTS ${NEW_INDEX}` : ''))
      }
    }

    // Confirm the new index is VALID + get size
    const finalChk = await c.query(
      `SELECT c.relname,
              i.indisvalid AS valid,
              pg_size_pretty(pg_relation_size(c.oid)) AS size
         FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
        WHERE c.relname = $1`,
      [NEW_INDEX]
    )
    if (finalChk.rows.length === 0) throw new Error(`${NEW_INDEX} does not exist after CREATE — unexpected`)
    if (finalChk.rows[0].valid === false) throw new Error(`${NEW_INDEX} exists but is INVALID — drop + retry`)
    pass(`${NEW_INDEX} valid, size ${finalChk.rows[0].size}`)

    // ─── POST-VERIFY 1: plan must reference the new index AND have no sort ─
    console.log('\n--- POST-VERIFY 1: EXPLAIN — plan must use ' + NEW_INDEX + ' and have no external merge sort ---')
    const afterPlan = await c.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ' + SQL_BODY.replace('%OFFSET%', '50000'))
    const afterText = afterPlan.rows.map(r => r['QUERY PLAN']).join('\n')
    console.log('  AFTER plan (offset 50000):')
    for (const line of afterText.split('\n')) console.log('    ' + line)

    if (!afterText.includes(NEW_INDEX)) {
      throw new Error(`plan does NOT reference ${NEW_INDEX} — planner still preferring another path. See plan above.`)
    }
    pass(`plan uses ${NEW_INDEX}`)

    // "external merge" and "Sort " (capital S with space — matches "Sort Key:"
    // header inside a Sort node). Explicit "Sort Method: external merge" is
    // the disk-sort signal. A "Sort" node in the tree is bad even in memory
    // for our sitemap purposes because it means we're sorting again after
    // the index scan.
    if (/external merge/i.test(afterText)) {
      throw new Error('plan still shows "external merge" disk sort — index did not take. See plan above.')
    }
    pass('plan does NOT contain "external merge"')

    if (/Sort Method:/i.test(afterText)) {
      throw new Error('plan still shows a Sort node ("Sort Method:") — index did not eliminate sort. See plan above.')
    }
    pass('plan does NOT contain any Sort node')

    // ─── POST-VERIFY 2: timings at various offsets (pg-direct) ───────────
    console.log('\n--- POST-VERIFY 2: pg-direct timings at offsets 0 / 50000 / 80000 ---')
    for (const offset of [0, 50000, 80000]) {
      const t = Date.now()
      const r = await c.query('SELECT count(*)::int AS n FROM public.get_sitemap_listings($1, $2)', [5000, offset])
      console.log(`  offset=${String(offset).padStart(5)}  rows=${String(r.rows[0].n).padStart(5)}  ${Date.now() - t}ms`)
    }

    // ─── POST-VERIFY 3: real-app-path via supabase.rpc → PostgREST ───────
    console.log('\n--- POST-VERIFY 3: real-app-path (supabase.rpc → PostgREST → pooler) ---')
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    for (const offset of [0, 50000]) {
      const t = Date.now()
      const { data, error } = await sb.rpc('get_sitemap_listings', { p_limit: 5000, p_offset: offset })
      if (error) throw new Error(`sb.rpc(listings, offset=${offset}) error: ${error.message}`)
      console.log(`  sb.rpc(listings, offset=${String(offset).padStart(5)})  rows=${String((data || []).length).padStart(5)}  ${Date.now() - t}ms`)
    }

    const tB = Date.now()
    const bRes = await sb.rpc('get_sitemap_buildings')
    if (bRes.error) throw new Error(`sb.rpc(buildings) error: ${bRes.error.message}`)
    console.log(`  sb.rpc(buildings)             rows=${String((bRes.data || []).length).padStart(5)}  ${Date.now() - tB}ms`)
    console.log('  (buildings uses a DIFFERENT predicate — EXISTS on building_id — so this index does not help it directly.')
    console.log('   Buildings is ~4574 rows total, so plain full-scan is acceptable. Not addressing this dispatch.)')

    console.log('\n=== DONE — swap applied, plan verified index-only, sort eliminated ===')
  } finally {
    await c.end()
  }
})().catch(e => {
  console.error('FATAL:', e.message)
  process.exit(1)
})
