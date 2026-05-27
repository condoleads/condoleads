// scripts/p5-2c-followup-3-recon-mv.js
// W-TERRITORY-MASTER P5.2c-followup-3 recon (MV bodies).
// Verify what mv_municipality_counts, mv_community_counts, and
// area_listing_counts_mv are actually counting. Are they VOW-filtered?
// Total-listings? Active-only? This determines whether geo-rollup can
// drop-in replace its correlated subquery with the MV.

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
    console.log('=== 1. mv_municipality_counts definition ===\n')
    const r1 = await client.query(`
      SELECT pg_get_viewdef(c.oid, true) AS body
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'mv_municipality_counts' AND c.relkind = 'm';
    `)
    if (r1.rows.length > 0) console.log(r1.rows[0].body)
    else console.log('  NOT FOUND')
    console.log('')

    console.log('=== 2. mv_community_counts definition ===\n')
    const r2 = await client.query(`
      SELECT pg_get_viewdef(c.oid, true) AS body
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'mv_community_counts' AND c.relkind = 'm';
    `)
    if (r2.rows.length > 0) console.log(r2.rows[0].body)
    else console.log('  NOT FOUND')
    console.log('')

    console.log('=== 3. area_listing_counts_mv definition ===\n')
    const r3 = await client.query(`
      SELECT pg_get_viewdef(c.oid, true) AS body
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'area_listing_counts_mv' AND c.relkind = 'm';
    `)
    if (r3.rows.length > 0) console.log(r3.rows[0].body)
    else console.log('  NOT FOUND')
    console.log('')

    console.log('=== 4. Compare slow-query result vs MV result for ONE area ===\n')
    // Use a fast area for comparison (Toronto -- we know it from followup-1)
    const r4a = await client.query(`
      SELECT id, name FROM treb_areas WHERE name = 'Toronto' LIMIT 1;
    `)
    if (r4a.rows.length === 0) {
      console.log('  no Toronto area found, skipping')
    } else {
      const areaId = r4a.rows[0].id
      console.log('  testing against area:', r4a.rows[0].name, '(' + areaId + ')')

      // Time the slow query (per-area correlated subquery)
      const t0 = Date.now()
      try {
        await client.query(`SET LOCAL statement_timeout = '30s';`)
        const r4b = await client.query(`
          SELECT COUNT(*)::int AS n FROM mls_listings WHERE area_id = $1 AND available_in_vow = true;
        `, [areaId])
        const elapsed = Date.now() - t0
        console.log('  SLOW (per-area COUNT with VOW filter): n=' + r4b.rows[0].n + ', elapsed=' + elapsed + 'ms')
      } catch (e) {
        console.log('  slow query failed:', e.message)
      }

      const t1 = Date.now()
      try {
        const r4c = await client.query(`
          SELECT SUM(cnt)::bigint AS total FROM area_listing_counts_mv WHERE area_id = $1;
        `, [areaId])
        const elapsed = Date.now() - t1
        console.log('  FAST (area_listing_counts_mv aggregate): n=' + r4c.rows[0].total + ', elapsed=' + elapsed + 'ms')
      } catch (e) {
        console.log('  MV query failed:', e.message)
      }

      const t2 = Date.now()
      try {
        const r4d = await client.query(`
          SELECT property_type, cnt FROM area_listing_counts_mv WHERE area_id = $1 ORDER BY cnt DESC;
        `, [areaId])
        const elapsed = Date.now() - t2
        console.log('  area_listing_counts_mv per-property-type breakdown for Toronto (elapsed=' + elapsed + 'ms):')
        console.table(r4d.rows)
      } catch (e) {
        console.log('  MV detail query failed:', e.message)
      }
    }
    console.log('')

    console.log('=== 5. mls_listings filter columns relevant to count semantics ===\n')
    const r5 = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'mls_listings'
        AND column_name IN ('available_in_vow', 'available_in_idx', 'available_in_dla',
                            'standard_status', 'transaction_type', 'property_type');
    `)
    console.table(r5.rows)
    console.log('')

    console.log('=== 6. Compare: total mls_listings vs total in MVs ===\n')
    const r6a = await client.query(`SELECT COUNT(*)::bigint AS n FROM mls_listings;`)
    const r6b = await client.query(`SELECT SUM(cnt)::bigint AS n FROM area_listing_counts_mv;`)
    const r6c = await client.query(`SELECT SUM(listing_count)::bigint AS n FROM mv_municipality_counts;`)
    const r6d = await client.query(`SELECT SUM(listing_count)::bigint AS n FROM mv_community_counts;`)
    console.log('  mls_listings total rows:                ', r6a.rows[0].n)
    console.log('  SUM(area_listing_counts_mv.cnt):        ', r6b.rows[0].n)
    console.log('  SUM(mv_municipality_counts.listing_count):', r6c.rows[0].n)
    console.log('  SUM(mv_community_counts.listing_count):   ', r6d.rows[0].n)
    console.log('')
    console.log('  If MV total matches mls_listings: no filter applied (counts all rows)')
    console.log('  If MV total < mls_listings: some filter applied (e.g., VOW, active, etc.)')

    console.log('')
    console.log('=== 7. Check refresh history if available ===\n')
    const r7 = await client.query(`
      SELECT schemaname, matviewname, hasindexes,
             pg_size_pretty(pg_total_relation_size(schemaname || '.' || matviewname)) AS size
      FROM pg_matviews
      WHERE schemaname = 'public'
      ORDER BY matviewname;
    `)
    console.table(r7.rows)

    console.log('')
    console.log('=== RECON MV COMPLETE ===')
  } catch (err) {
    console.error('ERROR:', err.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()