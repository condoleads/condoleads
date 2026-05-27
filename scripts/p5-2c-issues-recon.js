// scripts/p5-2c-issues-recon.js
// Recon for three browser-smoke-discovered issues:
//   Issue 1: Pin form search not firing / Pin button stays disabled
//   Issue 2: Geography view "canceling statement due to statement timeout"
//   Issue 3: BuildingsView mode toggle should be removed (tree + search unified)

const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

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

async function main() {
  console.log('=== ISSUE 1: PinsView search + submit flow ===\n')

  const pvPath = 'components/admin-homes/cockpit/territory/PinsView.tsx'
  const pv = fs.readFileSync(pvPath, 'utf8')

  // Find the relevant state variables, search effect, submit handler, and button render.
  const markers = [
    'resolvedListingId',
    'searchDebounced',
    'fetch(`/api/admin-homes/listings/search',
    'fetch(`/api/admin-homes/listings/lookup',
    'onClick={submitPin',
    'onClick={submit',
    'disabled={',
  ]

  for (const m of markers) {
    const idx = pv.indexOf(m)
    if (idx !== -1) {
      const lineNo = pv.substring(0, idx).split(/\r?\n/).length
      console.log('  marker "' + m + '" at line', lineNo)
    } else {
      console.log('  marker "' + m + '" NOT FOUND')
    }
  }

  console.log('')
  console.log('  --- PinsView lines around submitPin / Pin button ---')
  const lines = pv.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    if (/disabled|resolvedListingId|Pin button|submitPin/.test(lines[i])) {
      console.log('  ' + String(i + 1).padStart(4, ' ') + ': ' + lines[i].slice(0, 130))
    }
  }
  console.log('')

  console.log('  --- show 30 lines starting at first "Pin button" or "submitPin" reference ---')
  for (let i = 0; i < lines.length; i++) {
    if (/submitPin|Pin button|onClick={submit/.test(lines[i])) {
      const start = Math.max(0, i - 2)
      const end = Math.min(lines.length, i + 30)
      for (let j = start; j < end; j++) {
        console.log('  ' + String(j + 1).padStart(4, ' ') + ': ' + lines[j].slice(0, 130))
      }
      break
    }
  }
  console.log('')

  console.log('=== ISSUE 2: Geography view query + statement_timeout ===\n')

  console.log('  --- looking for Geography-view related routes ---')
  const candidates = [
    'app/api/admin-homes/territory/geo-rollup/route.ts',
    'app/api/admin-homes/territory/geo-search/route.ts',
    'components/admin-homes/cockpit/territory/GeographyView.tsx',
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      const buf = fs.readFileSync(c)
      console.log('  FOUND:', c, '(' + buf.length + ' bytes)')
    }
  }
  console.log('')

  console.log('  --- GeographyView fetch URLs ---')
  const gvPath = 'components/admin-homes/cockpit/territory/GeographyView.tsx'
  if (fs.existsSync(gvPath)) {
    const gv = fs.readFileSync(gvPath, 'utf8').split(/\r?\n/)
    for (let i = 0; i < gv.length; i++) {
      if (/fetch\(|\/api\//.test(gv[i])) {
        console.log('  ' + String(i + 1).padStart(4, ' ') + ': ' + gv[i].trim().slice(0, 150))
      }
    }
  }
  console.log('')

  console.log('  --- geo-rollup route.ts (first 80 lines) ---')
  const grPath = 'app/api/admin-homes/territory/geo-rollup/route.ts'
  if (fs.existsSync(grPath)) {
    const gr = fs.readFileSync(grPath, 'utf8').split(/\r?\n/)
    for (let i = 0; i < Math.min(80, gr.length); i++) {
      console.log('  ' + String(i + 1).padStart(4, ' ') + ': ' + gr[i].slice(0, 140))
    }
  }
  console.log('')

  // DB-side: check session statement_timeout and any heavy queries
  if (conn) {
    const client = new Client({ connectionString: conn })
    await client.connect()
    try {
      console.log('  --- DB statement_timeout settings ---')
      const r1 = await client.query(`SHOW statement_timeout;`)
      console.log('  session statement_timeout:', r1.rows[0].statement_timeout)

      const r2 = await client.query(`
        SELECT name, setting, unit, source
        FROM pg_settings
        WHERE name IN ('statement_timeout', 'idle_in_transaction_session_timeout', 'lock_timeout');
      `)
      console.table(r2.rows)

      // Test the most expensive likely Geography query: per-area listing counts
      console.log('')
      console.log('  --- timing test: SELECT area_id, COUNT(*) FROM mls_listings GROUP BY area_id ---')
      const t0 = Date.now()
      try {
        await client.query(`SET LOCAL statement_timeout = '30s';`)
        const r3 = await client.query(`
          SELECT area_id, COUNT(*)::int AS n
          FROM mls_listings
          WHERE area_id IS NOT NULL
          GROUP BY area_id
          ORDER BY n DESC
          LIMIT 5;
        `)
        const elapsed = Date.now() - t0
        console.log('  elapsed:', elapsed, 'ms')
        console.table(r3.rows)
      } catch (e) {
        console.log('  query failed:', e.message)
      }

      // Check if get_municipality_listing_counts and get_community_listing_counts RPCs exist
      console.log('')
      console.log('  --- RPCs used by /geo-tree ---')
      const r4 = await client.query(`
        SELECT proname, pronargs
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND proname IN ('get_municipality_listing_counts', 'get_community_listing_counts');
      `)
      console.table(r4.rows)

      // Run them with a timeout to see if they're the bottleneck
      console.log('')
      console.log('  --- timing get_municipality_listing_counts ---')
      const tm = Date.now()
      try {
        await client.query(`SET LOCAL statement_timeout = '30s';`)
        const r5 = await client.query(`SELECT * FROM get_municipality_listing_counts() LIMIT 5;`)
        console.log('  elapsed:', Date.now() - tm, 'ms, rows:', r5.rows.length)
      } catch (e) {
        console.log('  failed:', e.message)
      }

      console.log('')
      console.log('  --- timing get_community_listing_counts ---')
      const tc = Date.now()
      try {
        await client.query(`SET LOCAL statement_timeout = '30s';`)
        const r6 = await client.query(`SELECT * FROM get_community_listing_counts() LIMIT 5;`)
        console.log('  elapsed:', Date.now() - tc, 'ms, rows:', r6.rows.length)
      } catch (e) {
        console.log('  failed:', e.message)
      }

    } finally {
      await client.end()
    }
  }
  console.log('')

  console.log('=== ISSUE 3: BuildingsView mode toggle ===\n')

  const bv = fs.readFileSync('components/admin-homes/cockpit/territory/BuildingsView.tsx', 'utf8')
  const bvLines = bv.split(/\r?\n/)

  console.log('  --- lines that reference mode === "tree" or mode === "search" ---')
  for (let i = 0; i < bvLines.length; i++) {
    if (/mode === '|setMode\(|Mode = '/.test(bvLines[i])) {
      console.log('  ' + String(i + 1).padStart(4, ' ') + ': ' + bvLines[i].slice(0, 130))
    }
  }
  console.log('')

  console.log('  --- lines that reference loadBuildings / fetchBuildings ---')
  for (let i = 0; i < bvLines.length; i++) {
    if (/loadBuildings|fetchBuildings|scope = communityId/.test(bvLines[i])) {
      console.log('  ' + String(i + 1).padStart(4, ' ') + ': ' + bvLines[i].slice(0, 130))
    }
  }
  console.log('')

  console.log('=== RECON COMPLETE ===')
}

main().catch(err => { console.error(err); process.exit(1) })