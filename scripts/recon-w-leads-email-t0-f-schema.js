#!/usr/bin/env node
/**
 * recon-w-leads-email-t0-f-schema.js
 *
 * T0-F SQL probe — read-only schema dump for the W-LEADS-EMAIL recon.
 *
 * Outputs to: recon/W-LEADS-EMAIL-T0-F-leads-schema.txt
 *
 * Required env: DATABASE_URL (Postgres connection string)
 *
 * Probes per table: columns, CHECK constraints, FKs, UNIQUE/PK,
 * indexes, triggers, row-count estimate. Plus the
 * resolve_agent_for_context RPC body. Read-only throughout.
 */

const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const TABLES = [
  'leads',
  'vip_requests',
  'lead_email_log',
  'lead_ownership_changes',
  'tenant_users',
  'user_credit_overrides',
  'platform_admins',
  'platform_manager_tenants',
  'tenants',
]

const OUTPUT_PATH = path.resolve('recon', 'W-LEADS-EMAIL-T0-F-leads-schema.txt')

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL env var not set.')
    console.error('Set it in PowerShell before running, e.g.:')
    console.error('  $env:DATABASE_URL = "postgres://postgres.<ref>:<pwd>@<host>:5432/postgres"')
    console.error('  node scripts/recon-w-leads-email-t0-f-schema.js')
    process.exit(1)
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  const lines = []
  const log = (s) => { lines.push(s); console.log(s) }

  log('========================================================================')
  log('T0-F SCHEMA PROBE — W-LEADS-EMAIL')
  log('Generated: ' + new Date().toISOString())
  log('========================================================================')

  for (const table of TABLES) {
    log('')
    log('========================================================================')
    log(`TABLE: ${table}`)
    log('========================================================================')

    const existsRes = await client.query(
      `SELECT to_regclass('public.' || $1) AS exists`,
      [table]
    )
    if (!existsRes.rows[0].exists) {
      log('  (does not exist in public schema)')
      continue
    }

    log('')
    log('-- COLUMNS --')
    const colsRes = await client.query(
      `SELECT column_name, data_type, is_nullable, column_default,
              character_maximum_length
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position`,
      [table]
    )
    for (const r of colsRes.rows) {
      const typeLabel = r.character_maximum_length
        ? `${r.data_type}(${r.character_maximum_length})`
        : r.data_type
      const nullable = r.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'
      const dflt = r.column_default ? `  DEFAULT ${r.column_default}` : ''
      log(`  ${r.column_name.padEnd(40)} ${typeLabel.padEnd(30)} ${nullable}${dflt}`)
    }

    log('')
    log('-- CHECK CONSTRAINTS --')
    const checksRes = await client.query(
      `SELECT con.conname, pg_get_constraintdef(con.oid) AS def
         FROM pg_constraint con
         JOIN pg_class cl ON cl.oid = con.conrelid
         JOIN pg_namespace ns ON ns.oid = cl.relnamespace
        WHERE ns.nspname = 'public' AND cl.relname = $1 AND con.contype = 'c'
        ORDER BY con.conname`,
      [table]
    )
    if (checksRes.rows.length === 0) log('  (none)')
    for (const r of checksRes.rows) log(`  ${r.conname}: ${r.def}`)

    log('')
    log('-- FOREIGN KEYS --')
    const fksRes = await client.query(
      `SELECT con.conname, pg_get_constraintdef(con.oid) AS def
         FROM pg_constraint con
         JOIN pg_class cl ON cl.oid = con.conrelid
         JOIN pg_namespace ns ON ns.oid = cl.relnamespace
        WHERE ns.nspname = 'public' AND cl.relname = $1 AND con.contype = 'f'
        ORDER BY con.conname`,
      [table]
    )
    if (fksRes.rows.length === 0) log('  (none)')
    for (const r of fksRes.rows) log(`  ${r.conname}: ${r.def}`)

    log('')
    log('-- UNIQUE / PRIMARY KEY --')
    const uniqueRes = await client.query(
      `SELECT con.conname, con.contype, pg_get_constraintdef(con.oid) AS def
         FROM pg_constraint con
         JOIN pg_class cl ON cl.oid = con.conrelid
         JOIN pg_namespace ns ON ns.oid = cl.relnamespace
        WHERE ns.nspname = 'public' AND cl.relname = $1 AND con.contype IN ('u','p')
        ORDER BY con.contype, con.conname`,
      [table]
    )
    if (uniqueRes.rows.length === 0) log('  (none)')
    for (const r of uniqueRes.rows) log(`  ${r.contype === 'p' ? '[PK]' : '[UQ]'} ${r.conname}: ${r.def}`)

    log('')
    log('-- INDEXES --')
    const indexesRes = await client.query(
      `SELECT indexname, indexdef
         FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = $1
        ORDER BY indexname`,
      [table]
    )
    if (indexesRes.rows.length === 0) log('  (none)')
    for (const r of indexesRes.rows) log(`  ${r.indexname}: ${r.indexdef}`)

    log('')
    log('-- TRIGGERS --')
    const triggersRes = await client.query(
      `SELECT tgname, pg_get_triggerdef(t.oid) AS def
         FROM pg_trigger t
         JOIN pg_class cl ON cl.oid = t.tgrelid
         JOIN pg_namespace ns ON ns.oid = cl.relnamespace
        WHERE ns.nspname = 'public' AND cl.relname = $1 AND NOT t.tgisinternal
        ORDER BY tgname`,
      [table]
    )
    if (triggersRes.rows.length === 0) log('  (none)')
    for (const r of triggersRes.rows) log(`  ${r.tgname}: ${r.def}`)

    const countRes = await client.query(
      `SELECT reltuples::bigint AS estimate
         FROM pg_class WHERE oid = ('public.' || $1)::regclass`,
      [table]
    )
    log('')
    log('-- ROW COUNT (estimate from pg_class.reltuples) --')
    log(`  ~${countRes.rows[0].estimate} rows`)
  }

  log('')
  log('========================================================================')
  log('FUNCTION: resolve_agent_for_context (RPC body)')
  log('========================================================================')
  const fnRes = await client.query(
    `SELECT n.nspname AS schema, p.proname AS name,
            pg_get_function_identity_arguments(p.oid) AS args,
            pg_get_function_result(p.oid) AS returns,
            pg_get_functiondef(p.oid) AS body
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.proname = 'resolve_agent_for_context'
      ORDER BY n.nspname, p.oid`
  )
  if (fnRes.rows.length === 0) {
    log('  (function not found)')
  } else {
    for (const r of fnRes.rows) {
      log('')
      log(`-- ${r.schema}.${r.name}(${r.args}) RETURNS ${r.returns} --`)
      log(r.body)
    }
  }

  log('')
  log('========================================================================')
  log('SUMMARY: column counts')
  log('========================================================================')
  for (const table of TABLES) {
    const cnt = await client.query(
      `SELECT COUNT(*) AS n FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1`,
      [table]
    )
    log(`  ${table.padEnd(35)} ${cnt.rows[0].n} columns`)
  }

  await client.end()

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true })
  fs.writeFileSync(OUTPUT_PATH, lines.join('\n'), 'utf8')
  console.log('')
  console.log(`Probe T0-F written to: ${OUTPUT_PATH}  (${fs.statSync(OUTPUT_PATH).size} bytes)`)
}

main().catch((err) => {
  console.error('Probe failed:', err)
  process.exit(1)
})