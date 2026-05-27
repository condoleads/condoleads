// scripts/probe-resolver-signature.js
// W-TERRITORY-MASTER P5.2b - probe resolve_agent_for_context real signature.
// Read-only.

const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

function loadDotEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local')
  const raw = fs.readFileSync(envPath, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (!m) continue
    const k = m[1]
    let v = m[2]
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (!process.env[k]) process.env[k] = v
  }
}

loadDotEnvLocal()

const conn = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL
if (!conn) {
  console.error('FATAL: SUPABASE_DB_URL or DATABASE_URL not set in .env.local')
  process.exit(1)
}

async function main() {
  const client = new Client({ connectionString: conn })
  await client.connect()
  try {
    console.log('=== 1. All overloads of resolve_agent_for_context ===')
    const r1 = await client.query(`
      SELECT
        p.oid,
        p.proname,
        pg_get_function_arguments(p.oid) AS args,
        pg_get_function_result(p.oid) AS result,
        p.pronargs AS arg_count
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'resolve_agent_for_context'
      ORDER BY p.pronargs;
    `)
    if (r1.rows.length === 0) {
      console.log('  NOT FOUND in public schema.')
      return
    }
    for (const row of r1.rows) {
      console.log('  ---')
      console.log('  oid:        ', row.oid)
      console.log('  arg_count:  ', row.arg_count)
      console.log('  args:       ', row.args)
      console.log('  result:     ', row.result)
    }
    console.log('')

    console.log('=== 2. Full body of resolve_agent_for_context (each overload) ===')
    for (const row of r1.rows) {
      const r2 = await client.query(`SELECT pg_get_functiondef($1::oid) AS body;`, [row.oid])
      console.log('  --- oid', row.oid, '---')
      console.log(r2.rows[0].body)
      console.log('')
    }

    console.log('=== 3. Full body of reresolve_listing ===')
    const r3 = await client.query(`
      SELECT p.oid, pg_get_function_arguments(p.oid) AS args, pg_get_functiondef(p.oid) AS body
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'reresolve_listing';
    `)
    if (r3.rows.length === 0) {
      console.log('  NOT FOUND.')
    } else {
      for (const row of r3.rows) {
        console.log('  --- oid', row.oid, 'args:', row.args, '---')
        console.log(row.body)
        console.log('')
      }
    }

    console.log('=== 4. Full body of reresolve_building (if exists) ===')
    const r4 = await client.query(`
      SELECT p.oid, pg_get_function_arguments(p.oid) AS args, pg_get_functiondef(p.oid) AS body
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'reresolve_building';
    `)
    if (r4.rows.length === 0) {
      console.log('  NOT FOUND.')
    } else {
      for (const row of r4.rows) {
        console.log('  --- oid', row.oid, 'args:', row.args, '---')
        console.log(row.body)
        console.log('')
      }
    }

    console.log('=== 5. All callers of resolve_agent_for_context (function bodies that reference it) ===')
    const r5 = await client.query(`
      SELECT p.proname, pg_get_function_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname <> 'resolve_agent_for_context'
        AND pg_get_functiondef(p.oid) ILIKE '%resolve_agent_for_context%'
      ORDER BY p.proname;
    `)
    console.table(r5.rows)
    console.log('')

    console.log('=== PROBE COMPLETE ===')
  } catch (err) {
    console.error('ERROR:', err.message)
    console.error(err.stack)
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()