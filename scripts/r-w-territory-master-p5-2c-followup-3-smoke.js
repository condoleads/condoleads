// scripts/r-w-territory-master-p5-2c-followup-3-smoke.js
// W-TERRITORY-MASTER P5.2c-followup-3 smoke.
// Read-only. Verifies the patched geo-rollup queries run fast and return
// correct counts against the canonical MVs.

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
const TENANT_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'

let checks = 0
let passed = 0

function check(name, ok, detail) {
  checks++
  if (ok) {
    passed++
    console.log('  PASS [' + checks + ']: ' + name)
    if (detail) console.log('         ' + detail)
  } else {
    console.log('  FAIL [' + checks + ']: ' + name)
    if (detail) console.log('         ' + detail)
    throw new Error('Smoke check failed: ' + name)
  }
}

// Reconstruct the exact SQL the patched route would emit, level-by-level,
// without parent_id (the heavy path that was timing out).
function buildSql(level) {
  const TABLE_BY_LEVEL = {
    area: 'treb_areas',
    municipality: 'municipalities',
    community: 'communities',
    neighbourhood: 'neighbourhoods',
  }
  const APA_SCOPE_COL = {
    area: 'area_id',
    municipality: 'municipality_id',
    community: 'community_id',
    neighbourhood: 'neighbourhood_id',
  }
  const PARENT_FK_BY_LEVEL = {
    area: null,
    municipality: 'area_id',
    community: 'municipality_id',
    neighbourhood: 'area_id',
  }

  const geoTable = TABLE_BY_LEVEL[level]
  const apaScopeCol = APA_SCOPE_COL[level]
  const parentFk = PARENT_FK_BY_LEVEL[level]

  const childLevel = level === 'area' ? 'municipality' : level === 'municipality' ? 'community' : null
  let childCountExpr = "0::int"
  if (childLevel) {
    const childTable = TABLE_BY_LEVEL[childLevel]
    const childParentFk = PARENT_FK_BY_LEVEL[childLevel]
    childCountExpr = "(SELECT COUNT(*)::int FROM " + childTable + " ch WHERE ch." + childParentFk + " = g.id)"
  }

  // The new patched listingCountExpr:
  let listingCountExpr = "0::int"
  if (level === 'area') {
    listingCountExpr = "COALESCE((SELECT SUM(cnt)::int FROM area_listing_counts_mv WHERE area_id = g.id), 0)"
  } else if (level === 'municipality') {
    listingCountExpr = "COALESCE((SELECT listing_count::int FROM mv_municipality_counts WHERE municipality_id = g.id), 0)"
  } else if (level === 'community') {
    listingCountExpr = "COALESCE((SELECT listing_count::int FROM mv_community_counts WHERE community_id = g.id), 0)"
  }

  let buildingCountExpr = "0::int"
  if (level === 'community') {
    buildingCountExpr = "(SELECT COUNT(*)::int FROM buildings b WHERE b.community_id = g.id)"
  }

  const parentSelectExpr = parentFk ? "g." + parentFk : "NULL::uuid"

  return 'SELECT g.id, g.name, g.slug, ' + parentSelectExpr + ' AS parent_id, ' +
    '(SELECT EXISTS(SELECT 1 FROM agent_property_access apa WHERE apa.tenant_id = $1::uuid AND apa.scope = $2::text AND apa.' + apaScopeCol + ' = g.id AND apa.is_active = true)) AS has_own_card, ' +
    listingCountExpr + ' AS listing_count, ' +
    buildingCountExpr + ' AS building_count, ' +
    childCountExpr + ' AS child_count ' +
    'FROM ' + geoTable + ' g WHERE 1=1 ORDER BY g.name'
}

async function main() {
  const client = new Client({ connectionString: conn })
  await client.connect()
  try {
    console.log('=== Pre-flight: verify patch on disk ===\n')
    const route = fs.readFileSync('app/api/admin-homes/territory/geo-rollup/route.ts', 'utf8')
    check('route has area MV reference',
      route.includes('FROM area_listing_counts_mv WHERE area_id = g.id'))
    check('route has muni MV reference',
      route.includes('FROM mv_municipality_counts WHERE municipality_id = g.id'))
    check('route has community MV reference',
      route.includes('FROM mv_community_counts WHERE community_id = g.id'))
    check('route no longer has VOW correlated subquery',
      !route.includes('AND ml.available_in_vow = true)'))

    console.log('')
    console.log('=== Test 1: AREA level -- should complete in <2s ===\n')
    const t1 = Date.now()
    const r1 = await client.query(buildSql('area'), [TENANT_ID, 'area'])
    const elapsed1 = Date.now() - t1
    check('area-level returns rows', r1.rows.length > 0, 'rows=' + r1.rows.length)
    check('area-level completes in <2000ms', elapsed1 < 2000, 'elapsed=' + elapsed1 + 'ms')

    // Spot-check Toronto count matches the MV directly
    const torontoRow = r1.rows.find(r => r.name === 'Toronto')
    if (torontoRow) {
      const r1b = await client.query(`
        SELECT COALESCE(SUM(cnt)::int, 0) AS n FROM area_listing_counts_mv WHERE area_id = $1;
      `, [torontoRow.id])
      check('Toronto count from route matches MV direct query',
        torontoRow.listing_count === r1b.rows[0].n,
        'route=' + torontoRow.listing_count + ', mv=' + r1b.rows[0].n)
    }

    console.log('')
    console.log('=== Test 2: MUNICIPALITY level (no parent) -- should complete in <3s ===\n')
    const t2 = Date.now()
    const r2 = await client.query(buildSql('municipality'), [TENANT_ID, 'municipality'])
    const elapsed2 = Date.now() - t2
    check('muni-level returns rows', r2.rows.length > 0, 'rows=' + r2.rows.length)
    check('muni-level completes in <3000ms', elapsed2 < 3000, 'elapsed=' + elapsed2 + 'ms')

    // Spot-check: pick a muni that exists in mv, verify route count matches MV
    const muniWithCount = r2.rows.find(r => r.listing_count > 0)
    if (muniWithCount) {
      const r2b = await client.query(`
        SELECT COALESCE(listing_count::int, 0) AS n FROM mv_municipality_counts WHERE municipality_id = $1;
      `, [muniWithCount.id])
      check('muni count from route matches MV direct query',
        muniWithCount.listing_count === r2b.rows[0].n,
        'route=' + muniWithCount.listing_count + ', mv=' + r2b.rows[0].n + ', muni=' + muniWithCount.name)
    }

    console.log('')
    console.log('=== Test 3: COMMUNITY level (no parent) -- should complete in <5s ===\n')
    // Community level has 1948 rows globally; child_count + building_count
    // subqueries add weight. Allow 5s budget.
    const t3 = Date.now()
    const r3 = await client.query(buildSql('community'), [TENANT_ID, 'community'])
    const elapsed3 = Date.now() - t3
    check('community-level returns rows', r3.rows.length > 0, 'rows=' + r3.rows.length)
    check('community-level completes in <5000ms', elapsed3 < 5000, 'elapsed=' + elapsed3 + 'ms')

    const commWithCount = r3.rows.find(r => r.listing_count > 0)
    if (commWithCount) {
      const r3b = await client.query(`
        SELECT COALESCE(listing_count::int, 0) AS n FROM mv_community_counts WHERE community_id = $1;
      `, [commWithCount.id])
      check('community count from route matches MV direct query',
        commWithCount.listing_count === r3b.rows[0].n,
        'route=' + commWithCount.listing_count + ', mv=' + r3b.rows[0].n)
    }

    console.log('')
    console.log('=== Test 4: NEIGHBOURHOOD level -- should still return 0 listing_count ===\n')
    const t4 = Date.now()
    const r4 = await client.query(buildSql('neighbourhood'), [TENANT_ID, 'neighbourhood'])
    const elapsed4 = Date.now() - t4
    check('neighbourhood-level completes in <2000ms', elapsed4 < 2000, 'elapsed=' + elapsed4 + 'ms')
    if (r4.rows.length > 0) {
      const allZero = r4.rows.every(r => r.listing_count === 0)
      check('all neighbourhood rows have listing_count=0', allZero,
        'first row: ' + JSON.stringify(r4.rows[0]).slice(0, 200))
    } else {
      console.log('  SKIP: no neighbourhood rows in DB')
    }

    console.log('')
    console.log('=== Test 5: EXPLAIN ANALYZE the new area query -- must NOT scan mls_listings ===\n')
    const r5 = await client.query(`
      EXPLAIN (FORMAT TEXT)
      SELECT g.id, g.name,
        COALESCE((SELECT SUM(cnt)::int FROM area_listing_counts_mv WHERE area_id = g.id), 0) AS listing_count
      FROM treb_areas g
      ORDER BY g.name;
    `)
    const plan = r5.rows.map(r => r['QUERY PLAN']).join('\n')
    check('plan references area_listing_counts_mv', plan.includes('area_listing_counts_mv'))
    check('plan does NOT scan mls_listings', !plan.includes('mls_listings'),
      'mls_listings should be untouched (was the slow path)')

    console.log('')
    console.log('=== Test 6: Cross-reference -- the count change from v1 to v2 is the expected MV semantic shift ===\n')
    // For comparison: the OLD VOW-based count for Toronto from recon was 367,680.
    // The NEW MV-based count should be ~329,225 (per recon Test 4).
    if (torontoRow) {
      const isReasonable = torontoRow.listing_count > 100000 && torontoRow.listing_count < 500000
      check('Toronto count is in expected range (~329k from MV; was 367k VOW)',
        isReasonable, 'route=' + torontoRow.listing_count)
    }

    console.log('')
    console.log('=== SMOKE COMPLETE: ' + passed + '/' + checks + ' PASS ===')
    console.log('')
    console.log('Summary of timings:')
    console.log('  area level:          ' + elapsed1 + 'ms (was >120,000ms, timeout)')
    console.log('  municipality level:  ' + elapsed2 + 'ms')
    console.log('  community level:     ' + elapsed3 + 'ms')
    console.log('  neighbourhood level: ' + elapsed4 + 'ms')
  } catch (err) {
    console.error('SMOKE FAILED:', err.message)
    console.error('  ' + passed + '/' + checks + ' checks passed before failure')
    process.exit(1)
  } finally {
    await client.end()
  }
}

main()