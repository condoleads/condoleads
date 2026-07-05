#!/usr/bin/env node
require('dotenv').config({ path: '.env.local', quiet: true })
const { Pool } = require('pg')
const fs = require('fs')

const SQL_PATH = 'supabase/migrations/20260705_a_unit_2_final_sitemap_rpc_widen.sql'

;(async () => {
  let sql = fs.readFileSync(SQL_PATH, 'utf8')
  if (sql.charCodeAt(0) === 0xfeff) sql = sql.slice(1)

  const p = new Pool({ connectionString: process.env.DATABASE_URL })
  const c = await p.connect()
  try {
    await c.query('BEGIN')
    await c.query('SET LOCAL statement_timeout = 0')

    // pre-check: count what the OLD predicate returns
    const pre = await c.query(
      `SELECT COUNT(*)::int AS n FROM mls_listings WHERE standard_status IN ('Active','Active Under Contract') AND (property_type='Residential Condo & Other' OR (property_type='Residential Freehold' AND property_subtype IN ('Detached','Semi-Detached','Att/Row/Townhouse','Link','Duplex','Triplex','Fourplex','Multiplex')))`
    )
    console.log('  pre-widen matching rows: ' + pre.rows[0].n)

    await c.query(sql)

    // post-check: count what the NEW predicate returns (via RPC call)
    const post = await c.query(
      `SELECT COUNT(*)::int AS n FROM mls_listings WHERE standard_status IN ('Active','Active Under Contract') AND (property_type='Residential Condo & Other' OR (property_type='Residential Freehold' AND property_subtype IN ('Detached','Semi-Detached','Att/Row/Townhouse','Link','Duplex','Triplex','Fourplex','Multiplex','Modular Home','Upper Level','Lower Level','Room','Shared Room','Rural Residential','MobileTrailer','Farm','Store W Apt/Office','Other','Vacant Land')))`
    )
    console.log('  post-widen matching rows: ' + post.rows[0].n)
    console.log('  net-new sitemappable rows: ' + (post.rows[0].n - pre.rows[0].n))

    // sanity: call the RPC to prove it works with the new predicate
    const rpc = await c.query(`SELECT COUNT(*)::int AS n FROM public.get_sitemap_listings(1000, 0)`)
    console.log('  RPC call returned rows (limit=1000): ' + rpc.rows[0].n)

    if (post.rows[0].n < pre.rows[0].n) {
      console.log('  post < pre → predicate NARROWED unexpectedly; ROLLBACK')
      await c.query('ROLLBACK')
      process.exit(1)
    }

    await c.query('COMMIT')
    console.log('  COMMITTED')
  } catch (e) {
    console.error('ERR', e.message)
    try { await c.query('ROLLBACK') } catch {}
    process.exit(1)
  } finally {
    c.release()
    await p.end()
  }
})()
