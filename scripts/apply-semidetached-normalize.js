// SEMI-DETACHED-404 FIX — normalize trailing-whitespace subtype.
// Transactional: pre-check, apply, post-verify inside a single txn.
// ROLLBACK on any mismatch. COMMIT only if the post-verify predicate
// (property_subtype = btrim(property_subtype) on ALL rows) is true.
//
// Pre-snapshot: docs/snapshots/semidetached_pre_normalize_20260705_065115.txt
// Pre-migration count of malformed rows: 69,955 (all statuses) / 3,878 Active.
// Only distinct malformed value: "Semi-Detached " (14 bytes, trailing 0x20).
//
// Rollback (not practical — data cannot be un-trimmed without re-syncing
// from PropTx source. See snapshot file for the theoretical UPDATE that
// would restore whitespace, plus note that this is not a rollback path.

require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

;(async () => {
  const pool = new Pool({
    connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL,
    statement_timeout: 300000, // 5 min — normalization is a set-based UPDATE
  })
  const c = await pool.connect()
  let committed = false
  try {
    await c.query('BEGIN')
    // Per CLAUDE.md: large set-based UPDATEs over the MLS table (~1.3M
    // rows) exceed the 60s PostgREST authenticator statement_timeout.
    // 69,955 rows is a smaller scan but the WHERE-side expression
    // (property_subtype <> btrim(property_subtype)) forces a full-table
    // scan without an index that matches the predicate. Disable timeout
    // for this transaction only.
    await c.query('SET LOCAL statement_timeout = 0')

    // ─── Pre-state check ───────────────────────────────────────────
    console.log('=== PRE-STATE ===')
    const preAll = await c.query(`
      SELECT COUNT(*) AS n FROM mls_listings
      WHERE property_subtype IS NOT NULL
        AND property_subtype <> btrim(property_subtype)
    `)
    const preActive = await c.query(`
      SELECT COUNT(*) AS n FROM mls_listings
      WHERE standard_status = 'Active'
        AND property_subtype IS NOT NULL
        AND property_subtype <> btrim(property_subtype)
    `)
    console.log('  malformed rows (all statuses): ' + preAll.rows[0].n)
    console.log('  malformed rows (Active):       ' + preActive.rows[0].n)
    if (parseInt(preAll.rows[0].n, 10) === 0) {
      console.log('  Nothing to normalize. Aborting (no-op).')
      await c.query('ROLLBACK')
      return
    }
    const expectedNormalized = parseInt(preAll.rows[0].n, 10)

    // ─── Apply normalization ───────────────────────────────────────
    console.log('')
    console.log('=== APPLY ===')
    const upd = await c.query(`
      UPDATE public.mls_listings
         SET property_subtype = btrim(property_subtype)
       WHERE property_subtype IS NOT NULL
         AND property_subtype <> btrim(property_subtype)
    `)
    console.log('  UPDATE rows affected: ' + upd.rowCount)
    if (upd.rowCount !== expectedNormalized) {
      throw new Error('UPDATE rowCount ' + upd.rowCount + ' != expected ' + expectedNormalized)
    }

    // ─── Post-verify (SEPARATE query — mirrors Supabase editor semantics) ─
    console.log('')
    console.log('=== POST-VERIFY ===')
    const postAll = await c.query(`
      SELECT COUNT(*) AS n FROM mls_listings
      WHERE property_subtype IS NOT NULL
        AND property_subtype <> btrim(property_subtype)
    `)
    console.log('  post malformed rows (all statuses): ' + postAll.rows[0].n)
    if (parseInt(postAll.rows[0].n, 10) !== 0) {
      throw new Error('post-verify: still have malformed rows: ' + postAll.rows[0].n)
    }

    // Confirm the previously-stranded Semi-Detached rows are now match-able:
    const postSemiActive = await c.query(`
      SELECT COUNT(*) AS n FROM mls_listings
      WHERE property_subtype = 'Semi-Detached'
        AND standard_status = 'Active'
    `)
    console.log('  post Active Semi-Detached (exact match): ' + postSemiActive.rows[0].n)
    if (parseInt(postSemiActive.rows[0].n, 10) < parseInt(preActive.rows[0].n, 10)) {
      throw new Error('post: Active Semi-Detached count regressed: ' + postSemiActive.rows[0].n +
                      ' < ' + preActive.rows[0].n)
    }

    // Also verify sample listing_keys from snapshot now have clean subtype:
    const samples = ['W13412844', 'X12450779', 'X13111972']
    const sampleRes = await c.query(
      `SELECT listing_key, property_subtype FROM mls_listings WHERE listing_key = ANY($1)`,
      [samples],
    )
    console.log('  sample listing_keys post-normalize:')
    for (const r of sampleRes.rows) {
      console.log('    listing_key=' + r.listing_key + '  property_subtype=' + JSON.stringify(r.property_subtype))
      if (r.property_subtype !== 'Semi-Detached') {
        throw new Error('sample listing_key ' + r.listing_key + ' still malformed: ' +
                        JSON.stringify(r.property_subtype))
      }
    }

    await c.query('COMMIT')
    committed = true
    console.log('')
    console.log('=== COMMIT ===')
    console.log('  normalization complete. ' + upd.rowCount + ' rows normalized.')
  } catch (e) {
    console.error('')
    console.error('=== ROLLBACK — ' + e.message)
    try { await c.query('ROLLBACK') } catch {}
    process.exit(1)
  } finally {
    if (!committed) { try { await c.query('ROLLBACK') } catch {} }
    c.release()
    await pool.end()
  }
})().catch(e => { console.error('FATAL: ' + e.message); process.exit(1) })
