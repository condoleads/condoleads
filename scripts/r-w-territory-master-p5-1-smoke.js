// scripts/r-w-territory-master-p5-1-smoke.js
// W-TERRITORY-MASTER P5.1 smoke. Validates the search endpoint behavior
// via direct DB queries (mirrors what the endpoint does) + an HTTP probe
// against the running dev server if one is available.
//
// DB-only checks always run. HTTP checks skipped if dev server is not up.

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

const checks = []
function rec(name, pass, detail) {
  checks.push({ name, pass, detail: detail || '' })
  console.log(`${pass ? '✅' : '❌'} ${name}${detail ? '  -- ' + String(detail).slice(0, 200) : ''}`)
}

async function main() {
  const client = new Client({ connectionString: conn })
  await client.connect()

  try {
    // ----------------------------------------------------------------
    // CHECK 1: trigram index is being used for ILIKE on unparsed_address
    // ----------------------------------------------------------------
    const r1 = await client.query(`
      EXPLAIN (FORMAT JSON)
      SELECT id, listing_key, unparsed_address
      FROM mls_listings
      WHERE unparsed_address ILIKE '%king%'
        AND available_in_vow = true
      LIMIT 20;
    `)
    const planJson = JSON.stringify(r1.rows[0]['QUERY PLAN'])
    rec('1. ILIKE plan uses idx_mls_listings_unparsed_address_trgm (Bitmap Index Scan)',
      planJson.includes('idx_mls_listings_unparsed_address_trgm'),
      `plan kind: ${planJson.includes('Bitmap Index Scan') ? 'Bitmap Index Scan' : 'other'}`)

    // ----------------------------------------------------------------
    // CHECK 2: fuzzy search "richmond" returns multiple matches in <500ms
    // ----------------------------------------------------------------
    const t2 = Date.now()
    const r2 = await client.query(`
      SELECT id, listing_key, unparsed_address
      FROM mls_listings
      WHERE unparsed_address ILIKE '%richmond%'
        AND available_in_vow = true
      LIMIT 20;
    `)
    const ms2 = Date.now() - t2
    rec('2. Fuzzy "richmond" search returns ≥1 row in <500ms',
      r2.rows.length >= 1 && ms2 < 500,
      `rows=${r2.rows.length} ms=${ms2}`)

    // ----------------------------------------------------------------
    // CHECK 3: exact listing_key match returns exactly one row
    // ----------------------------------------------------------------
    // Use a real listing_key from recon: X11930580
    const r3 = await client.query(`
      SELECT id, listing_key
      FROM mls_listings
      WHERE listing_key = 'X11930580'
        AND available_in_vow = true;
    `)
    rec('3. Exact listing_key X11930580 returns one row',
      r3.rows.length === 1,
      `rows=${r3.rows.length}`)

    // ----------------------------------------------------------------
    // CHECK 4: address search by partial street name returns plausible matches
    // ----------------------------------------------------------------
    const r4 = await client.query(`
      SELECT listing_key, unparsed_address
      FROM mls_listings
      WHERE unparsed_address ILIKE '%sheppard%'
        AND available_in_vow = true
      LIMIT 5;
    `)
    rec('4. Fuzzy "sheppard" returns matches',
      r4.rows.length >= 1,
      `top: ${r4.rows[0]?.unparsed_address?.slice(0, 60) || 'none'}`)

    // ----------------------------------------------------------------
    // CHECK 5: 3-char minimum boundary — searches for "abc" still bounded
    // ----------------------------------------------------------------
    const t5 = Date.now()
    const r5 = await client.query(`
      SELECT count(*)::int AS n
      FROM (
        SELECT id FROM mls_listings
        WHERE unparsed_address ILIKE '%abc%' AND available_in_vow = true
        LIMIT 50
      ) s;
    `)
    const ms5 = Date.now() - t5
    rec('5. Short 3-char search bounded by LIMIT, completes <1000ms',
      ms5 < 1000,
      `n=${r5.rows[0].n} ms=${ms5}`)

    // ----------------------------------------------------------------
    // CHECK 6: case insensitivity — UPPERCASE input matches lowercase data
    // ----------------------------------------------------------------
    const r6a = await client.query(`SELECT id FROM mls_listings WHERE unparsed_address ILIKE '%TORONTO%' AND available_in_vow = true LIMIT 1;`)
    const r6b = await client.query(`SELECT id FROM mls_listings WHERE unparsed_address ILIKE '%toronto%' AND available_in_vow = true LIMIT 1;`)
    rec('6. ILIKE is case-insensitive (uppercase + lowercase yield same kind of result)',
      r6a.rows.length === 1 && r6b.rows.length === 1)

    // ----------------------------------------------------------------
    // CHECK 7: route file exists at expected path
    // ----------------------------------------------------------------
    const routePath = path.join(process.cwd(), 'app', 'api', 'admin-homes', 'listings', 'search', 'route.ts')
    rec('7. /api/admin-homes/listings/search/route.ts exists',
      fs.existsSync(routePath))

    // ----------------------------------------------------------------
    // CHECK 8: PinsView has the P5.1 search comment marker
    // ----------------------------------------------------------------
    const pv = path.join(process.cwd(), 'components', 'admin-homes', 'cockpit', 'territory', 'PinsView.tsx')
    if (fs.existsSync(pv)) {
      const content = fs.readFileSync(pv, 'utf8')
      rec('8. PinsView contains P5.1 search combobox marker',
        content.includes('// P5.1: search combobox'),
        content.includes('// P5.1: search combobox') ? 'present' : 'missing')
    } else {
      rec('8. PinsView contains P5.1 search combobox marker', false, 'PinsView.tsx not found')
    }

    // ----------------------------------------------------------------
    // CHECK 9: HTTP probe against dev server (optional — skipped if not up)
    // ----------------------------------------------------------------
    let httpResult = 'skipped'
    try {
      const fetch = global.fetch || ((...a) => Promise.reject(new Error('no fetch')))
      const resp = await fetch('http://localhost:3000/api/admin-homes/listings/search?q=king&limit=5', {
        method: 'GET'
      })
      // We expect 401 (unauthorized) because the smoke runner isn't logged in.
      // A 401 means the endpoint exists and is enforcing auth — that's a PASS.
      if (resp.status === 401) {
        httpResult = '401 (auth enforced as expected)'
        rec('9. HTTP probe to /search returns 401 (auth enforced)', true, httpResult)
      } else if (resp.status === 200) {
        httpResult = '200 (unexpected — auth bypassed?)'
        rec('9. HTTP probe to /search returns 401 (auth enforced)', false, httpResult)
      } else {
        httpResult = `${resp.status} (unexpected)`
        rec('9. HTTP probe to /search returns 401 (auth enforced)', false, httpResult)
      }
    } catch (e) {
      console.log(`ℹ️  9. HTTP probe skipped (dev server not up): ${e.message}`)
    }

    // Summary
    console.log('')
    const passed = checks.filter(c => c.pass).length
    const failed = checks.filter(c => !c.pass).length
    console.log(`=== SUMMARY: ${passed}/${checks.length} PASS, ${failed} FAIL ===`)
    if (failed > 0) {
      process.exit(1)
    }
  } catch (err) {
    console.error('SMOKE ERROR:', err.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()