#!/usr/bin/env node
/**
 * recon-w-leads-email-t2a-geo-tables.js
 *
 * T2a pre-migration probe — verify geo FK target tables exist with id uuid PK.
 * Required for the leads.area_id / municipality_id / community_id / neighbourhood_id
 * ALTER TABLE migration in T2a.
 *
 * Outputs to: recon/W-LEADS-EMAIL-T2A-PRE-geo-tables.txt
 *
 * Required env: DATABASE_URL
 */

const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

const OUTPUT_PATH = path.resolve('recon', 'W-LEADS-EMAIL-T2A-PRE-geo-tables.txt')

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL env var not set.')
    console.error('Source from .env.local first, e.g.:')
    console.error('  $line = (Get-Content ".env.local" | Select-String "^DATABASE_URL\\s*=" | Select-Object -First 1).Line')
    console.error('  $env:DATABASE_URL = ($line -split "=", 2)[1].Trim().Trim(\'"\').Trim("\'")')
    process.exit(1)
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  const lines = []
  const log = (s) => { lines.push(s); console.log(s) }

  log('========================================================================')
  log('T2A PRE-MIGRATION PROBE — geo FK target tables')
  log('Generated: ' + new Date().toISOString())
  log('========================================================================')

  // ─── Step 1: pattern-match every public.* table that looks geo-shaped ───
  log('')
  log('-- STEP 1: candidate geo tables in public schema --')
  const candidatesRes = await client.query(`
    SELECT table_name
      FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_type = 'BASE TABLE'
       AND (
         table_name ILIKE '%area%' OR
         table_name ILIKE '%municipal%' OR
         table_name ILIKE '%communit%' OR
         table_name ILIKE '%neighb%'
       )
     ORDER BY table_name
  `)
  if (candidatesRes.rows.length === 0) {
    log('  (no candidate geo tables found — UNEXPECTED)')
  } else {
    for (const r of candidatesRes.rows) log(`  ${r.table_name}`)
  }

  // ─── Step 2: for each candidate, dump id column shape + PK + row count ───
  log('')
  log('-- STEP 2: id column shape + PK + row count per candidate --')
  for (const r of candidatesRes.rows) {
    const t = r.table_name
    log('')
    log(`TABLE: ${t}`)

    // id column type
    const idRes = await client.query(
      `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
          AND column_name = 'id'`,
      [t]
    )
    if (idRes.rows.length === 0) {
      log(`  id column: MISSING`)
    } else {
      const c = idRes.rows[0]
      log(`  id column: ${c.data_type}, nullable=${c.is_nullable}, default=${c.column_default || '(none)'}`)
    }

    // primary key
    const pkRes = await client.query(
      `SELECT con.conname, pg_get_constraintdef(con.oid) AS def
         FROM pg_constraint con
         JOIN pg_class cl ON cl.oid = con.conrelid
         JOIN pg_namespace ns ON ns.oid = cl.relnamespace
        WHERE ns.nspname = 'public' AND cl.relname = $1 AND con.contype = 'p'`,
      [t]
    )
    if (pkRes.rows.length === 0) {
      log(`  primary key: MISSING`)
    } else {
      log(`  primary key: ${pkRes.rows[0].def}`)
    }

    // row count (estimate)
    const countRes = await client.query(
      `SELECT reltuples::bigint AS estimate
         FROM pg_class WHERE oid = ('public.' || $1)::regclass`,
      [t]
    )
    log(`  row count (estimate): ~${countRes.rows[0].estimate}`)

    // First 3 rows of (id, name) if name column exists — sanity check on data shape
    const nameColRes = await client.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
          AND column_name IN ('name', 'slug', 'title')
        ORDER BY CASE column_name WHEN 'name' THEN 1 WHEN 'slug' THEN 2 ELSE 3 END
        LIMIT 1`,
      [t]
    )
    if (nameColRes.rows.length > 0) {
      const nameCol = nameColRes.rows[0].column_name
      const sampleRes = await client.query(
        `SELECT id, ${nameCol} FROM public."${t}" ORDER BY ${nameCol} LIMIT 3`
      )
      log(`  sample (id, ${nameCol}):`)
      for (const s of sampleRes.rows) log(`    ${s.id} | ${s[nameCol]}`)
    }
  }

  // ─── Step 3: pick_routing_agent body — confirms which table each scope joins ───
  log('')
  log('========================================================================')
  log('STEP 3: pick_routing_agent function body (confirms table → scope mapping)')
  log('========================================================================')
  const fnRes = await client.query(
    `SELECT pg_get_functiondef(p.oid) AS body
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'pick_routing_agent'`
  )
  if (fnRes.rows.length === 0) {
    log('  (function not found — UNEXPECTED)')
  } else {
    log(fnRes.rows[0].body)
  }

  // ─── Step 4: existing FK references — confirm any leads-adjacent tables already FK these ───
  log('')
  log('========================================================================')
  log('STEP 4: existing FK references TO each candidate (where else are they used)')
  log('========================================================================')
  for (const r of candidatesRes.rows) {
    const t = r.table_name
    const fkRefRes = await client.query(
      `SELECT cl.relname AS referencing_table, con.conname, pg_get_constraintdef(con.oid) AS def
         FROM pg_constraint con
         JOIN pg_class cl ON cl.oid = con.conrelid
         JOIN pg_namespace ns ON ns.oid = cl.relnamespace
         JOIN pg_class fcl ON fcl.oid = con.confrelid
         JOIN pg_namespace fns ON fns.oid = fcl.relnamespace
        WHERE ns.nspname = 'public' AND fns.nspname = 'public'
          AND fcl.relname = $1 AND con.contype = 'f'
        ORDER BY cl.relname, con.conname`,
      [t]
    )
    if (fkRefRes.rows.length === 0) {
      log(`  ${t}: (no incoming FK references)`)
    } else {
      log(`  ${t}: referenced by ${fkRefRes.rows.length} FK(s)`)
      for (const fk of fkRefRes.rows) {
        log(`    ${fk.referencing_table}.${fk.conname}: ${fk.def}`)
      }
    }
  }

  await client.end()

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true })
  fs.writeFileSync(OUTPUT_PATH, lines.join('\n'), 'utf8')
  console.log('')
  console.log(`Probe T2a-pre written to: ${OUTPUT_PATH}  (${fs.statSync(OUTPUT_PATH).size} bytes)`)
}

main().catch((err) => {
  console.error('Probe failed:', err)
  process.exit(1)
})