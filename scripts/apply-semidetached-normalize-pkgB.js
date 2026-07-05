#!/usr/bin/env node
require('dotenv').config({ path: '.env.local', quiet: true })
const { Pool } = require('pg')

;(async () => {
  const p = new Pool({ connectionString: process.env.DATABASE_URL })
  const c = await p.connect()
  try {
    await c.query('BEGIN')
    await c.query('SET LOCAL statement_timeout = 0')

    const pre = await c.query(
      `SELECT COUNT(*)::int AS n FROM mls_listings WHERE property_subtype IS NOT NULL AND property_subtype <> btrim(property_subtype)`
    )
    console.log('  pre-check malformed: ' + pre.rows[0].n)
    if (pre.rows[0].n === 0) {
      console.log('  nothing to normalize; ROLLBACK')
      await c.query('ROLLBACK')
      return
    }

    const upd = await c.query(
      `UPDATE mls_listings SET property_subtype = btrim(property_subtype) WHERE property_subtype IS NOT NULL AND property_subtype <> btrim(property_subtype)`
    )
    console.log('  UPDATE rows: ' + upd.rowCount)

    const post = await c.query(
      `SELECT COUNT(*)::int AS n FROM mls_listings WHERE property_subtype IS NOT NULL AND property_subtype <> btrim(property_subtype)`
    )
    console.log('  post-verify malformed: ' + post.rows[0].n)
    if (post.rows[0].n !== 0) {
      console.log('  post-verify FAILED; ROLLBACK')
      await c.query('ROLLBACK')
      process.exit(1)
    }

    const samp = await c.query(
      `SELECT listing_key, property_subtype, char_length(property_subtype) AS len FROM mls_listings WHERE listing_key IN ('W13505048','E13235036')`
    )
    console.log('  sample re-check: ' + JSON.stringify(samp.rows))

    await c.query('COMMIT')
    console.log('  COMMITTED')
  } catch (e) {
    console.error('ERR', e.message)
    await c.query('ROLLBACK')
    process.exit(1)
  } finally {
    c.release()
    await p.end()
  }
})()
