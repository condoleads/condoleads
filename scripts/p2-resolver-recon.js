// scripts/p2-resolver-recon.js
//
// Read-only recon for W-TERRITORY-MASTER P2.
// Dumps current resolver bodies + signatures so we can see exactly what's
// shipping in prod before proposing a strip.
//
// Run from project root:
//   node scripts/p2-resolver-recon.js

const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

function loadDotEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return {}
  const raw = fs.readFileSync(envPath, 'utf8')
  const out = {}
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[k] = v
  }
  return out
}

async function main() {
  const envFile = loadDotEnvLocal()
  const cs = process.env.DATABASE_URL || process.env.POSTGRES_URL ||
             envFile.DATABASE_URL || envFile.POSTGRES_URL
  if (!cs) {
    console.error('FAIL: no connection string')
    process.exit(1)
  }
  const client = new Client({ connectionString: cs })
  await client.connect()

  try {
    console.log('=== P2 RECON: resolver functions ===')
    console.log('')

    // 1. List all resolver-shaped functions
    console.log('--- 1. All public functions matching resolve* ---')
    const fnList = await client.query(
      `SELECT
         p.proname AS function_name,
         pg_get_function_identity_arguments(p.oid) AS args,
         pg_get_function_result(p.oid) AS returns
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname LIKE 'resolve%'
       ORDER BY p.proname`
    )
    console.table(fnList.rows)
    console.log('')

    // 2. Dump each resolver function body
    for (const fn of fnList.rows) {
      console.log(`--- 2. BODY: ${fn.function_name}(${fn.args}) ---`)
      const body = await client.query(
        `SELECT pg_get_functiondef(p.oid) AS def
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname = $1
           AND pg_get_function_identity_arguments(p.oid) = $2`,
        [fn.function_name, fn.args]
      )
      console.log(body.rows[0]?.def || '(empty)')
      console.log('')
    }

    // 3. agent_property_access columns (confirms condo/homes/buildings flags shape)
    console.log('--- 3. agent_property_access columns ---')
    const apaCols = await client.query(
      `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'agent_property_access'
        ORDER BY ordinal_position`
    )
    console.table(apaCols.rows)
    console.log('')

    // 4. agent_property_access scope CHECK constraint
    console.log('--- 4. agent_property_access CHECK constraints ---')
    const apaChecks = await client.query(
      `SELECT conname, pg_get_constraintdef(c.oid) AS definition
         FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public'
          AND t.relname = 'agent_property_access'
          AND c.contype = 'c'`
    )
    console.table(apaChecks.rows)
    console.log('')

    // 5. agent_listing_assignments columns (P5 scope check)
    console.log('--- 5. agent_listing_assignments columns ---')
    const alaCols = await client.query(
      `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'agent_listing_assignments'
        ORDER BY ordinal_position`
    )
    console.table(alaCols.rows)
    console.log('')

    // 6. mls_listings — confirm columns the resolver uses to derive type
    console.log('--- 6. mls_listings type-derivation columns ---')
    const mlCols = await client.query(
      `SELECT column_name, data_type
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'mls_listings'
          AND column_name IN ('building_id', 'property_type', 'transaction_type', 'property_subtype')
        ORDER BY column_name`
    )
    console.table(mlCols.rows)
    console.log('')

    // 7. neighbourhoods + municipality_neighbourhoods shape (P7 prep)
    console.log('--- 7. neighbourhoods count + sample rows ---')
    const nbhCount = await client.query(`SELECT COUNT(*)::int AS n FROM neighbourhoods`)
    console.log('Total neighbourhoods:', nbhCount.rows[0].n)
    const nbhSample = await client.query(`SELECT * FROM neighbourhoods LIMIT 5`)
    console.table(nbhSample.rows)
    console.log('')

    console.log('--- 8. municipality_neighbourhoods shape ---')
    const mnCount = await client.query(`SELECT COUNT(*)::int AS n FROM municipality_neighbourhoods`)
    console.log('Total junction rows:', mnCount.rows[0].n)
    const mnSample = await client.query(`SELECT * FROM municipality_neighbourhoods LIMIT 5`)
    console.table(mnSample.rows)
    console.log('')

    console.log('=== RECON COMPLETE ===')
  } finally {
    await client.end()
  }
}

main().catch(err => { console.error('FATAL:', err); process.exit(1) })