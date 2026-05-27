#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * One-shot READ-ONLY probe for `resolve_geo_primary` signature + body.
 *
 * Why a script file (not `node -e`): PowerShell's escape rules mangle the
 * embedded SQL when the query references `p.oid` etc. -- PS interprets the dot
 * as a property access and bails. File form has no quoting pain.
 *
 * Invocation:
 *   node scripts/probe-resolve-geo-primary.js
 *
 * Output: signature + return type + full function body to stdout.
 * No writes anywhere.
 */

const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

// Load .env.local the same way the other r-w-territory-master-*.js scripts do.
const ENV_PATH = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(ENV_PATH)) {
  const raw = fs.readFileSync(ENV_PATH, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/i)
    if (!m) continue
    const k = m[1]
    let v = m[2]
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (process.env[k] === undefined) process.env[k] = v
  }
}

const CONN_STR = process.env.DATABASE_URL || process.env.POSTGRES_URL
if (!CONN_STR) {
  console.error('FATAL: DATABASE_URL or POSTGRES_URL not set')
  process.exit(1)
}

async function main() {
  const c = new Client({ connectionString: CONN_STR })
  await c.connect()
  try {
    const sql = `
      SELECT
        p.oid::int                          AS oid,
        pg_get_function_arguments(p.oid)    AS args,
        pg_get_function_result(p.oid)       AS returns,
        pg_get_functiondef(p.oid)           AS body,
        length(pg_get_functiondef(p.oid))   AS body_len
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'resolve_geo_primary'
    `
    const r = await c.query(sql)
    if (r.rows.length === 0) {
      console.log('resolve_geo_primary: NOT FOUND in public schema')
      return
    }
    for (const row of r.rows) {
      console.log('===== resolve_geo_primary =====')
      console.log('oid:        ' + row.oid)
      console.log('args:       ' + row.args)
      console.log('returns:    ' + row.returns)
      console.log('body_len:   ' + row.body_len)
      console.log('---BODY---')
      console.log(row.body)
      console.log('---END BODY---')
    }
  } finally {
    await c.end()
  }
}

main().catch((err) => {
  console.error('PROBE FAILED:', err)
  process.exit(1)
})