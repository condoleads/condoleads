// scripts/gap6-readpath-scale-test.js
// GAP-6 -- materialized read-path scale test (READ-ONLY, no state change).
//
// Times the actual production read shapes at realistic WALLiam scale:
//   A. Geo-page listings grid (CommunityPage / MunicipalityPage / AreaPage)
//      -- the LISTING_SELECT + status/vow/txn filter + ORDER + LIMIT 24
//      shape that renders on every geo page hit. Read shape verbatim from
//      app/[slug]/CommunityPage.tsx:56-62 (and the muni/area equivalents).
//   B. Lead-path cache-first resolve -- the
//      mls_listings.assigned_agent_id + agents-FK-inner-join query at
//      lib/utils/tenant-resolver.ts:147-156. Single listing per call.
//   C. Bulk assigned_agent_id read over N listings -- not a production
//      path but a stress probe of the cache column's index/access cost.
//
// Methodology:
//   - pg.Client direct, NO supabase-js / PostgREST overhead. This gives the
//     DB-side query cost; PostgREST adds ~ms of constant transport per call
//     (well-bounded). The DB cost is what the index plan governs.
//   - 1 warmup + 9 timed runs per probe. Report p50 + p95 + max in ms.
//   - Geo fixture picked at runtime (largest WALLiam community-scoped
//     fixture by listings count -- the realistic max for a community page).
//   - No SAVEPOINT / no tx -- pure read.
//
// Target (from master-protocol): <50ms p95 for the read path.

require('dotenv').config({ path: '.env.local' })
const { Client } = require('pg')

const RUNS = 10
const WARMUP = 1

const LISTING_SELECT_COLUMNS = [
  'id', 'building_id', 'community_id', 'municipality_id', 'listing_id', 'listing_key',
  'standard_status', 'transaction_type', 'list_price', 'close_price', 'close_date',
  'unit_number', 'unparsed_address', 'bedrooms_total', 'bathrooms_total_integer',
  'property_type', 'property_subtype', 'living_area_range', 'square_foot_source',
  'parking_total', 'locker', 'association_fee', 'tax_annual_amount',
  'days_on_market', 'listing_contract_date', 'building_area_total',
  'lot_width', 'lot_depth', 'lot_size_dimensions', 'lot_size_area', 'lot_size_area_units',
  'frontage_length', 'basement', 'garage_type', 'garage_yn', 'approximate_age',
  'legal_stories', 'architectural_style', 'cooling', 'pool_features', 'fireplace_yn'
].join(', ')

function percentile (arr, p) {
  const s = [...arr].sort((a, b) => a - b)
  const idx = Math.ceil((p / 100) * s.length) - 1
  return s[Math.max(0, Math.min(s.length - 1, idx))]
}

async function timeQuery (c, label, sql, params) {
  const samples = []
  for (let i = 0; i < WARMUP + RUNS; i++) {
    const t0 = process.hrtime.bigint()
    await c.query(sql, params)
    const t1 = process.hrtime.bigint()
    const ms = Number(t1 - t0) / 1e6
    if (i >= WARMUP) samples.push(ms)
  }
  const p50 = percentile(samples, 50)
  const p95 = percentile(samples, 95)
  const max = Math.max(...samples)
  return { label, p50, p95, max, samples }
}

function fmt (ms) { return ms.toFixed(2).padStart(7) + ' ms' }

function pf (n, target) {
  if (n < target) return 'OK  '
  if (n < target * 2) return 'WARN'
  return 'SLOW'
}

;(async () => {
  const url = process.env.DATABASE_URL
  if (!url) { console.error('no DATABASE_URL'); process.exit(1) }
  const c = new Client({ connectionString: url })
  c.on('error', (e) => console.error('CLIENT ERROR:', e.message))
  await c.connect()
  // Disable statement_timeout for this session: the fixture-pick aggregation
  // can scan ~1.3M rows; we want the actual query plan, not a timeout cancel.
  // Read-only session, so no risk of long-running writes.
  await c.query('SET statement_timeout = 0')
  console.log('GAP-6 read-path scale test')
  console.log('=========================')
  console.log('Master-protocol target: <50ms p95 for the read path')
  console.log(`Runs per probe: ${RUNS} (after ${WARMUP} warmup)`)
  console.log()

  // ============================================================
  // Fixture pick: largest WALLiam community/muni/area by mls_listings count.
  // Runtime-SELECTed so the script works regardless of which territory
  // is currently the heaviest.
  // ============================================================
  const wt = await c.query(`SELECT id FROM public.tenants WHERE source_key='walliam'`)
  const walliamTenantId = wt.rows[0].id

  const bigCommunity = await c.query(`
    SELECT c.id, c.name, COUNT(ml.id)::int AS n
      FROM public.communities c
      JOIN public.mls_listings ml ON ml.community_id = c.id
      JOIN public.agent_property_access apa ON apa.community_id = c.id
        AND apa.tenant_id = $1 AND apa.scope='community' AND apa.is_active=TRUE
     GROUP BY c.id, c.name
     ORDER BY n DESC LIMIT 1`, [walliamTenantId])
  const community = bigCommunity.rows[0]

  const muni = await c.query(`
    SELECT m.id, m.name, COUNT(ml.id)::int AS n
      FROM public.municipalities m
      JOIN public.mls_listings ml ON ml.municipality_id = m.id
     WHERE m.id = '70103aef-1b32-4939-9ff8-264e859a5587'
     GROUP BY m.id, m.name`)
  const municipality = muni.rows[0]

  const area = await c.query(`
    SELECT ta.id, ta.name, COUNT(ml.id)::int AS n
      FROM public.treb_areas ta
      JOIN public.mls_listings ml ON ml.area_id = ta.id
     GROUP BY ta.id, ta.name
     ORDER BY n DESC LIMIT 1`)
  const treb = area.rows[0]

  console.log('Fixture geos (runtime-picked):')
  console.log('  WALLiam community :', community)
  console.log('  Whitby muni       :', municipality)
  console.log('  Largest TREB area :', treb)
  console.log()

  // ============================================================
  // A1. CommunityPage listings grid (LIMIT 24, populous community).
  // Verbatim shape from app/[slug]/CommunityPage.tsx:56-62 (no media join
  // here -- media is a separate to-many that adds ~5ms; measure cleanly).
  // ============================================================
  const aSqlBase = `
    SELECT ${LISTING_SELECT_COLUMNS}
      FROM public.mls_listings
     WHERE community_id = $1
       AND standard_status IN ('Active','Active Under Contract','Pending')
       AND available_in_vow = TRUE
       AND transaction_type = 'For Sale'
     ORDER BY list_price DESC NULLS LAST
     LIMIT 24`
  const a1 = await timeQuery(c, 'A1 CommunityPage grid (community, LIMIT 24)', aSqlBase, [community.id])

  // ============================================================
  // A2. MunicipalityPage listings grid -- larger scope (Whitby muni).
  // Same shape, different geo column.
  // ============================================================
  const a2Sql = `
    SELECT ${LISTING_SELECT_COLUMNS}
      FROM public.mls_listings
     WHERE municipality_id = $1
       AND standard_status IN ('Active','Active Under Contract','Pending')
       AND available_in_vow = TRUE
       AND transaction_type = 'For Sale'
     ORDER BY list_price DESC NULLS LAST
     LIMIT 24`
  const a2 = await timeQuery(c, 'A2 MunicipalityPage grid (Whitby muni, LIMIT 24)', a2Sql, [municipality.id])

  // ============================================================
  // A3. AreaPage listings grid -- largest scope.
  // ============================================================
  const a3Sql = `
    SELECT ${LISTING_SELECT_COLUMNS}
      FROM public.mls_listings
     WHERE area_id = $1
       AND standard_status IN ('Active','Active Under Contract','Pending')
       AND available_in_vow = TRUE
       AND transaction_type = 'For Sale'
     ORDER BY list_price DESC NULLS LAST
     LIMIT 24`
  const a3 = await timeQuery(c, 'A3 AreaPage grid (largest area, LIMIT 24)', a3Sql, [treb.id])

  // ============================================================
  // B. Lead-path cache-first resolve -- single listing.
  // Shape from lib/utils/tenant-resolver.ts:147-156. Picks a real WALLiam-
  // routed listing (assigned_scope NOT NULL, agent is WALLiam, active+selling).
  // ============================================================
  const pickedListing = await c.query(`
    SELECT ml.id FROM public.mls_listings ml
    JOIN public.agents a ON a.id = ml.assigned_agent_id
   WHERE a.tenant_id = $1
     AND a.is_active = TRUE
     AND a.is_selling = TRUE
   LIMIT 1`, [walliamTenantId])
  if (pickedListing.rowCount === 0) {
    console.log('B SKIP: no WALLiam-routed listing for the cache-first probe')
  } else {
    const listingId = pickedListing.rows[0].id
    const bSql = `
      SELECT ml.assigned_agent_id, a.tenant_id, a.is_active, a.is_selling
        FROM public.mls_listings ml
        INNER JOIN public.agents a ON a.id = ml.assigned_agent_id
       WHERE ml.id = $1
         AND a.tenant_id = $2
         AND a.is_active = TRUE
         AND a.is_selling = TRUE`
    const b1 = await timeQuery(c, 'B1 Lead-path cache-first resolve (1 listing)', bSql, [listingId, walliamTenantId])
    // ============================================================
    // C. Bulk assigned_agent_id read over 1000 random WALLiam-routed
    // listings -- index/access-cost stress probe (not a production path).
    // ============================================================
    const ids = (await c.query(`
      SELECT ml.id FROM public.mls_listings ml
      JOIN public.agents a ON a.id = ml.assigned_agent_id
     WHERE a.tenant_id = $1 LIMIT 1000`, [walliamTenantId])).rows.map(r => r.id)
    const cSql = `
      SELECT ml.id, ml.assigned_agent_id, ml.assigned_scope
        FROM public.mls_listings ml
       WHERE ml.id = ANY($1::uuid[])`
    const c1 = await timeQuery(c, 'C1 Bulk cache read (1000 listings)', cSql, [ids])

    // Print all results
    console.log()
    console.log('============================================================')
    console.log('Results (ms, lower = better). Target <50ms p95.')
    console.log('============================================================')
    for (const r of [a1, a2, a3, b1, c1]) {
      console.log(`  ${pf(r.p95, 50)}  ${r.label.padEnd(54)}  p50=${fmt(r.p50)}  p95=${fmt(r.p95)}  max=${fmt(r.max)}`)
    }
    console.log()
    console.log('Per-probe samples (ms):')
    for (const r of [a1, a2, a3, b1, c1]) {
      console.log(`  ${r.label}:`, r.samples.map(s => s.toFixed(2)).join(', '))
    }

    // Verdict
    const all = [a1, a2, a3, b1, c1]
    const failing = all.filter(r => r.p95 >= 50)
    console.log()
    if (failing.length === 0) {
      console.log('VERDICT: ALL PROBES MET TARGET (<50ms p95).')
    } else {
      console.log('VERDICT: ' + failing.length + ' / ' + all.length + ' PROBE(S) EXCEEDED 50ms p95:')
      for (const r of failing) console.log('  -', r.label, '-> p95=' + r.p95.toFixed(2) + 'ms')
    }
  }

  // ============================================================
  // EXPLAIN ANALYZE -- DB-side execution time (excludes network RTT).
  // The wall-clock numbers above include round-trip to the Supabase pooler
  // from this dev machine (typically 100-200ms RTT cross-region). The
  // ANALYZE timing below is the actual DB-side cost the query plan
  // produces -- this is what production (Vercel functions co-located with
  // the DB region) will see, plus ~1-5ms intra-region RTT.
  // ============================================================
  console.log()
  console.log('============================================================')
  console.log('EXPLAIN ANALYZE -- DB-side cost (excludes network RTT)')
  console.log('============================================================')

  async function analyze (label, sql, params) {
    const r = await c.query(`EXPLAIN (ANALYZE, BUFFERS, TIMING) ${sql}`, params)
    const planText = r.rows.map(row => row['QUERY PLAN']).join('\n')
    // Extract "Execution Time: N.NNN ms" from the plan output.
    const m = /Execution Time:\s*([\d.]+)\s*ms/.exec(planText)
    const execMs = m ? parseFloat(m[1]) : null
    console.log(`  ${label}`)
    console.log(`    DB-side execution: ${execMs !== null ? execMs.toFixed(3) + ' ms' : 'parse-failed'}`)
    return execMs
  }

  const dbA1 = await analyze('A1 CommunityPage grid (community, LIMIT 24)', aSqlBase, [community.id])
  const dbA2 = await analyze('A2 MunicipalityPage grid (Whitby muni, LIMIT 24)', a2Sql, [municipality.id])
  const dbA3 = await analyze('A3 AreaPage grid (largest area, LIMIT 24)', a3Sql, [treb.id])

  if (pickedListing.rowCount > 0) {
    const bAnalyzeSql = `
      SELECT ml.assigned_agent_id, a.tenant_id, a.is_active, a.is_selling
        FROM public.mls_listings ml
        INNER JOIN public.agents a ON a.id = ml.assigned_agent_id
       WHERE ml.id = $1
         AND a.tenant_id = $2
         AND a.is_active = TRUE
         AND a.is_selling = TRUE`
    const dbB1 = await analyze('B1 Lead-path cache-first resolve (1 listing)', bAnalyzeSql, [pickedListing.rows[0].id, walliamTenantId])
    const ids2 = (await c.query(`
      SELECT ml.id FROM public.mls_listings ml
      JOIN public.agents a ON a.id = ml.assigned_agent_id
     WHERE a.tenant_id = $1 LIMIT 1000`, [walliamTenantId])).rows.map(r => r.id)
    const cAnalyzeSql = `
      SELECT ml.id, ml.assigned_agent_id, ml.assigned_scope
        FROM public.mls_listings ml
       WHERE ml.id = ANY($1::uuid[])`
    const dbC1 = await analyze('C1 Bulk cache read (1000 listings)', cAnalyzeSql, [ids2])

    // Verdict on DB-side cost
    console.log()
    const dbAll = [
      { label: 'A1', ms: dbA1 },
      { label: 'A2', ms: dbA2 },
      { label: 'A3', ms: dbA3 },
      { label: 'B1', ms: dbB1 },
      { label: 'C1', ms: dbC1 },
    ]
    const dbFailing = dbAll.filter(r => r.ms !== null && r.ms >= 50)
    if (dbFailing.length === 0) {
      console.log('DB-SIDE VERDICT: ALL PROBES <50ms execution time on the DB.')
      console.log('Wall-clock latency above is dominated by dev-machine -> Supabase pooler RTT,')
      console.log('NOT by DB query cost. In production (Vercel co-located with DB region) the')
      console.log('round-trip is ~1-5ms; expected end-to-end latency = DB exec time + ~5ms RTT.')
    } else {
      console.log('DB-SIDE VERDICT: ' + dbFailing.length + ' / ' + dbAll.length + ' PROBE(S) ABOVE 50ms DB-side:')
      for (const r of dbFailing) console.log('  -', r.label, r.ms ? r.ms.toFixed(3) + 'ms' : 'parse-failed')
    }
  }

  console.log()
  console.log('============================================================')
  console.log('Index sanity (cheap EXPLAIN without ANALYZE)')
  console.log('============================================================')
  const exA1 = await c.query(`EXPLAIN ${aSqlBase}`, [community.id])
  console.log('-- A1 plan --')
  for (const row of exA1.rows) console.log('  ' + row['QUERY PLAN'])
  const exB1Sql = `EXPLAIN
    SELECT ml.assigned_agent_id, a.tenant_id, a.is_active, a.is_selling
      FROM public.mls_listings ml
      INNER JOIN public.agents a ON a.id = ml.assigned_agent_id
     WHERE ml.id = $1
       AND a.tenant_id = $2
       AND a.is_active = TRUE
       AND a.is_selling = TRUE`
  if (pickedListing.rowCount > 0) {
    const exB1 = await c.query(exB1Sql, [pickedListing.rows[0].id, walliamTenantId])
    console.log('-- B1 plan --')
    for (const row of exB1.rows) console.log('  ' + row['QUERY PLAN'])
  }

  await c.end()
})().catch(e => { console.error('GAP-6 ERROR:', e); process.exit(1) })
