// scripts/r-w-territory-master-p5-1-recon.js
// W-TERRITORY-MASTER P5.1 recon. Read-only.
// Verifies pre-state before emitting the address-trigram-search migration + endpoint + UI patch.
//
// Checks:
//   1. pg_trgm extension installed?
//   2. Existing indexes on mls_listings.unparsed_address
//   3. Sample 5 real addresses (format audit)
//   4. Row counts in scope (available_in_vow = true)
//   5. PinsView current MLS input shape (file content, CRLF detection)
//
// Run: node scripts/r-w-territory-master-p5-1-recon.js > p5-1-recon.txt

const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

function loadDotEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) {
    console.error('ERROR: .env.local not found')
    process.exit(1)
  }
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

async function main() {
  const client = new Client({ connectionString: conn })
  await client.connect()
  try {
    console.log('=== 1. pg_trgm extension status ===')
    const r1 = await client.query(`
      SELECT extname, extversion, n.nspname AS schema
      FROM pg_extension e
      LEFT JOIN pg_namespace n ON n.oid = e.extnamespace
      WHERE extname IN ('pg_trgm', 'btree_gin', 'btree_gist')
      ORDER BY extname;
    `)
    if (r1.rows.length === 0) {
      console.log('  pg_trgm: NOT INSTALLED — migration must CREATE EXTENSION pg_trgm.')
    } else {
      console.table(r1.rows)
    }

    console.log('')
    console.log('=== 2. Existing indexes on mls_listings ===')
    const r2 = await client.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'mls_listings'
        AND (
          indexdef ILIKE '%unparsed_address%'
          OR indexdef ILIKE '%listing_key%'
          OR indexdef ILIKE '%gin%'
          OR indexdef ILIKE '%trgm%'
        )
      ORDER BY indexname;
    `)
    if (r2.rows.length === 0) {
      console.log('  No address/key/trigram indexes found.')
    } else {
      for (const r of r2.rows) {
        console.log(`  ${r.indexname}`)
        console.log(`    ${r.indexdef}`)
      }
    }

    console.log('')
    console.log('=== 3. Row counts in scope ===')
    const r3 = await client.query(`
      SELECT
        count(*) AS total,
        count(*) FILTER (WHERE available_in_vow = true) AS vow_visible,
        count(*) FILTER (WHERE available_in_vow = true AND unparsed_address IS NOT NULL) AS vow_with_address
      FROM mls_listings;
    `)
    console.table(r3.rows)

    console.log('')
    console.log('=== 4. Sample 5 real addresses (format audit) ===')
    const r4 = await client.query(`
      SELECT listing_key, unparsed_address, property_type, list_price
      FROM mls_listings
      WHERE available_in_vow = true AND unparsed_address IS NOT NULL
      ORDER BY random()
      LIMIT 5;
    `)
    console.table(r4.rows)

    console.log('')
    console.log('=== 5. EXPLAIN ANALYZE: planned cost of a naive ILIKE search (baseline) ===')
    // Use a small, common token to ensure results.
    const r5 = await client.query(`
      EXPLAIN ANALYZE
      SELECT listing_key, unparsed_address
      FROM mls_listings
      WHERE available_in_vow = true
        AND unparsed_address ILIKE '%king%'
      LIMIT 20;
    `)
    for (const row of r5.rows) console.log('  ' + row['QUERY PLAN'])

    console.log('')
    console.log('=== 6. PinsView current MLS input shape ===')
    const pv = path.join(process.cwd(), 'components', 'admin-homes', 'cockpit', 'territory', 'PinsView.tsx')
    if (!fs.existsSync(pv)) {
      console.log('  PinsView.tsx NOT FOUND.')
    } else {
      const content = fs.readFileSync(pv, 'utf8')
      const usesCRLF = content.includes('\r\n')
      console.log(`  Line endings: ${usesCRLF ? 'CRLF' : 'LF'}`)
      const lines = content.split('\n')
      // Find the MLS input block
      const mlsLineIdx = lines.findIndex(l => l.includes('placeholder="e.g. C5678901"'))
      if (mlsLineIdx === -1) {
        console.log('  MLS input anchor not found by placeholder. Showing first occurrence of pinMlsInput:')
        const i = lines.findIndex(l => l.includes('pinMlsInput'))
        if (i >= 0) {
          for (let j = Math.max(0, i - 2); j < Math.min(lines.length, i + 10); j++) {
            console.log(`    ${String(j + 1).padStart(3)}: ${JSON.stringify(lines[j])}`)
          }
        }
      } else {
        console.log(`  MLS input block at line ${mlsLineIdx + 1}:`)
        for (let j = Math.max(0, mlsLineIdx - 4); j < Math.min(lines.length, mlsLineIdx + 6); j++) {
          console.log(`    ${String(j + 1).padStart(3)}: ${JSON.stringify(lines[j])}`)
        }
      }
    }

    console.log('')
    console.log('=== 7. Existing /listings/lookup route (P5 baseline) ===')
    const lookup = path.join(process.cwd(), 'app', 'api', 'admin-homes', 'listings', 'lookup', 'route.ts')
    if (fs.existsSync(lookup)) {
      const c = fs.readFileSync(lookup, 'utf8')
      console.log(`  exists, ${c.length} bytes, ${c.split('\n').length} lines`)
    } else {
      console.log('  MISSING — unexpected.')
    }

    console.log('')
    console.log('=== RECON COMPLETE ===')
  } catch (err) {
    console.error('RECON ERROR:', err.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()