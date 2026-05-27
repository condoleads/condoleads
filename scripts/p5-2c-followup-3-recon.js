// scripts/p5-2c-followup-3-recon.js
// W-TERRITORY-MASTER P5.2c-followup-3 recon.
//
// Goal: understand why /territory/geo-rollup times out at area level, and
// design a fix that mirrors the proven fast RPC pattern.
//
// Recon questions:
//   A) Does get_area_listing_counts() exist? What's its body?
//   B) How are get_municipality_listing_counts and get_community_listing_counts
//      implemented? Are they backed by materialized views or aggregated tables?
//   C) What's geo-rollup/route.ts actually doing for area-level queries
//      (lines 81-end -- we've seen 1-80 already)?
//   D) Are there any pre-aggregated tables we should know about?
//   E) Multi-tenant: is the slow query tenant-aware? If so, that complicates
//      the RPC-only solution.

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

async function main() {
  const client = new Client({ connectionString: conn })
  await client.connect()
  try {
    console.log('=== A1: does get_area_listing_counts exist? ===\n')
    const a1 = await client.query(`
      SELECT proname, pronargs, pg_get_function_arguments(p.oid) AS args,
             pg_get_function_result(p.oid) AS result
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND proname IN (
          'get_area_listing_counts',
          'get_municipality_listing_counts',
          'get_community_listing_counts',
          'get_neighbourhood_listing_counts'
        )
      ORDER BY proname;
    `)
    console.table(a1.rows)
    console.log('')

    console.log('=== A2: full body of get_municipality_listing_counts (the fast pattern to mirror) ===\n')
    const a2 = await client.query(`
      SELECT pg_get_functiondef(p.oid) AS body
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND proname = 'get_municipality_listing_counts';
    `)
    if (a2.rows.length > 0) {
      console.log(a2.rows[0].body)
    } else {
      console.log('  NOT FOUND')
    }
    console.log('')

    console.log('=== A3: full body of get_community_listing_counts ===\n')
    const a3 = await client.query(`
      SELECT pg_get_functiondef(p.oid) AS body
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND proname = 'get_community_listing_counts';
    `)
    if (a3.rows.length > 0) {
      console.log(a3.rows[0].body)
    } else {
      console.log('  NOT FOUND')
    }
    console.log('')

    console.log('=== A4: full body of get_area_listing_counts if it exists ===\n')
    const a4 = await client.query(`
      SELECT pg_get_functiondef(p.oid) AS body
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND proname = 'get_area_listing_counts';
    `)
    if (a4.rows.length > 0) {
      console.log(a4.rows[0].body)
    } else {
      console.log('  NOT FOUND -- need to create it.')
    }
    console.log('')

    console.log('=== B1: materialized views or pre-aggregated tables related to mls_listings ===\n')
    const b1 = await client.query(`
      SELECT schemaname, matviewname, ispopulated
      FROM pg_matviews
      WHERE schemaname = 'public'
      ORDER BY matviewname;
    `)
    console.table(b1.rows)
    console.log('')

    console.log('=== B2: tables matching listing_count, listing_counts, geo_counts patterns ===\n')
    const b2 = await client.query(`
      SELECT table_name, table_type
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND (table_name ILIKE '%listing_count%'
          OR table_name ILIKE '%geo_count%'
          OR table_name ILIKE '%area_count%'
          OR table_name ILIKE '%muni_count%'
          OR table_name ILIKE '%aggregated%')
      ORDER BY table_name;
    `)
    console.table(b2.rows)
    console.log('')

    console.log('=== B3: indexes on mls_listings.area_id (would influence a direct aggregation) ===\n')
    const b3 = await client.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'mls_listings'
        AND (indexdef ILIKE '%area_id%' OR indexdef ILIKE '%municipality_id%' OR indexdef ILIKE '%community_id%');
    `)
    console.table(b3.rows)
    console.log('')

    console.log('=== B4: row counts and EXPLAIN of the simple aggregations ===\n')
    try {
      await client.query(`SET LOCAL statement_timeout = '30s';`)
      const b4a = await client.query(`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE area_id IS NOT NULL)::int AS with_area
        FROM mls_listings;
      `)
      console.log('  mls_listings totals:', b4a.rows[0])
    } catch (e) {
      console.log('  totals query failed:', e.message)
    }
    console.log('')

    try {
      await client.query(`SET LOCAL statement_timeout = '30s';`)
      const b4b = await client.query(`
        EXPLAIN (FORMAT JSON, BUFFERS, ANALYZE TRUE)
        SELECT area_id, COUNT(*) AS n FROM mls_listings WHERE area_id IS NOT NULL GROUP BY area_id;
      `)
      console.log('  EXPLAIN ANALYZE of GROUP BY area_id:')
      console.log(JSON.stringify(b4b.rows[0]['QUERY PLAN'], null, 2).slice(0, 4000))
    } catch (e) {
      console.log('  EXPLAIN ANALYZE failed:', e.message)
    }
    console.log('')

    console.log('=== B5: same EXPLAIN for the fast muni query (for comparison) ===\n')
    try {
      await client.query(`SET LOCAL statement_timeout = '30s';`)
      const b5 = await client.query(`
        EXPLAIN (FORMAT JSON, BUFFERS, ANALYZE TRUE)
        SELECT * FROM get_municipality_listing_counts();
      `)
      console.log('  EXPLAIN ANALYZE of get_municipality_listing_counts():')
      console.log(JSON.stringify(b5.rows[0]['QUERY PLAN'], null, 2).slice(0, 4000))
    } catch (e) {
      console.log('  EXPLAIN failed:', e.message)
    }
    console.log('')

    console.log('=== C: geo-rollup/route.ts full contents (we have lines 1-80; show all) ===\n')
    const grPath = 'app/api/admin-homes/territory/geo-rollup/route.ts'
    if (fs.existsSync(grPath)) {
      const gr = fs.readFileSync(grPath, 'utf8')
      const lines = gr.split(/\r?\n/)
      console.log('  total lines:', lines.length)
      console.log('  total bytes:', Buffer.byteLength(gr, 'utf8'))
      for (let i = 0; i < lines.length; i++) {
        console.log('  ' + String(i + 1).padStart(4, ' ') + ': ' + lines[i])
      }
    } else {
      console.log('  NOT FOUND at', grPath)
    }
    console.log('')

    console.log('=== D: GeographyView.tsx -- the consumer (first 60 lines + render entrypoint) ===\n')
    const gvPath = 'components/admin-homes/cockpit/territory/GeographyView.tsx'
    if (fs.existsSync(gvPath)) {
      const gv = fs.readFileSync(gvPath, 'utf8').split(/\r?\n/)
      console.log('  total lines:', gv.length)
      for (let i = 0; i < Math.min(60, gv.length); i++) {
        console.log('  ' + String(i + 1).padStart(4, ' ') + ': ' + gv[i])
      }
    }
    console.log('')

    console.log('=== E: search for any tenant_id filtering inside geo-rollup ===\n')
    const gr = fs.existsSync(grPath) ? fs.readFileSync(grPath, 'utf8') : ''
    const gvFull = fs.existsSync(gvPath) ? fs.readFileSync(gvPath, 'utf8') : ''
    const grTenantMentions = (gr.match(/tenant_id/g) || []).length
    const gvTenantMentions = (gvFull.match(/tenant_id/g) || []).length
    console.log('  tenant_id mentions in geo-rollup route:', grTenantMentions)
    console.log('  tenant_id mentions in GeographyView:   ', gvTenantMentions)

    console.log('')
    console.log('=== RECON COMPLETE ===')
  } catch (err) {
    console.error('ERROR:', err.message)
    console.error(err.stack)
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()