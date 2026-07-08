#!/usr/bin/env node
// C-UNIT-1 (2026-07-08): set aily.ca's google_analytics_id.
// walliam stays NULL (no GA property yet). NEVER writes any other tenant.
// Transactional: pre-check, UPDATE, post-verify inside one BEGIN. ROLLBACK
// on any mismatch. Operator-approved production write.

require('dotenv').config({ path: '.env.local', quiet: true })
const { Pool } = require('pg')

const TARGET_DOMAIN = 'aily.ca'
const TARGET_ID = 'G-64C2P7MG1D'

;(async () => {
  const p = new Pool({ connectionString: process.env.DATABASE_URL })
  const c = await p.connect()
  try {
    await c.query('BEGIN')
    await c.query('SET LOCAL statement_timeout = 0')

    // Pre-check
    const pre = await c.query(
      "SELECT domain, google_analytics_id FROM tenants WHERE domain = $1",
      [TARGET_DOMAIN]
    )
    if (pre.rows.length !== 1) {
      console.log('  pre-check FAIL: no unique row for ' + TARGET_DOMAIN + '; ROLLBACK')
      await c.query('ROLLBACK')
      process.exit(1)
    }
    console.log('  pre-check: ' + TARGET_DOMAIN + ' google_analytics_id = ' + (pre.rows[0].google_analytics_id || 'NULL'))

    // UPDATE
    const upd = await c.query(
      "UPDATE tenants SET google_analytics_id = $1 WHERE domain = $2",
      [TARGET_ID, TARGET_DOMAIN]
    )
    console.log('  UPDATE rows: ' + upd.rowCount + ' (expect 1)')
    if (upd.rowCount !== 1) {
      console.log('  UPDATE FAILED; ROLLBACK')
      await c.query('ROLLBACK')
      process.exit(1)
    }

    // Post-verify (aily) inside TX
    const post = await c.query(
      "SELECT domain, google_analytics_id FROM tenants WHERE domain = $1",
      [TARGET_DOMAIN]
    )
    if (post.rows[0].google_analytics_id !== TARGET_ID) {
      console.log('  post-verify FAILED; ROLLBACK')
      await c.query('ROLLBACK')
      process.exit(1)
    }
    console.log('  post-verify (in TX): ' + TARGET_DOMAIN + ' google_analytics_id = ' + post.rows[0].google_analytics_id)

    // Post-verify (walliam) — MUST still be NULL (no cross-tenant write)
    const wall = await c.query(
      "SELECT domain, google_analytics_id FROM tenants WHERE domain = 'walliam.ca'"
    )
    if (wall.rows[0] && wall.rows[0].google_analytics_id !== null) {
      console.log('  CROSS-TENANT WRITE DETECTED (walliam should be NULL); ROLLBACK')
      await c.query('ROLLBACK')
      process.exit(1)
    }
    console.log('  post-verify walliam: NULL (untouched, correct)')

    await c.query('COMMIT')
    console.log('  COMMITTED')
  } catch (e) {
    console.error('  ERR', e.message)
    try { await c.query('ROLLBACK') } catch {}
    process.exit(1)
  } finally {
    c.release()
    await p.end()
  }
})()
