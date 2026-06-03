// scripts/smoke-w-geo-count-fix-3-txn-pool.js
// W-GEO-COUNT-FIX-3 (final) verification:
//   1. Numerical: countDirect via TXN pool returns identical numbers to
//      direct session-pool COUNT(*) ground truth for Toronto-area, Markham,
//      a neighbourhood, a community.
//   2. Concurrency: 20+ parallel mixed-page-shape requests via TXN pool --
//      zero EMAXCONNSESSION, zero connection-wait timeouts, all real counts.
//
// This script inlines a tiny copy of countDirect that targets port-6543
// (txn pooler), to validate the production path without spinning up Next.

require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const RAW_URL =
  process.env.DATABASE_URL ||
  process.env.SUPABASE_DB_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_URL_NON_POOLING

if (!RAW_URL) { console.error('no DATABASE_URL'); process.exit(1) }
const TXN_URL = RAW_URL.replace(':5432/', ':6543/')
if (TXN_URL === RAW_URL) { console.error('base URL not port 5432; cannot derive txn URL'); process.exit(1) }

const txnPool = new Pool({
  connectionString: TXN_URL,
  max: 30,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
  statement_timeout: 30000,
})
txnPool.on('error', e => console.error('[txn-pool err]', e.message))

// Ground-truth pool: session, for cross-check.
const sessPool = new Pool({
  connectionString: RAW_URL,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
})
sessPool.on('error', e => console.error('[sess-pool err]', e.message))

const ACTIVE = ['Active', 'Active Under Contract', 'Pending']
const HOME = ['Detached', 'Semi-Detached', 'Att/Row/Townhouse', 'Link', 'Duplex', 'Triplex', 'Fourplex', 'Multiplex']
const CONDO = ['Condo Apartment', 'Condo Townhouse', 'Co-op Apartment', 'Common Element Condo', 'Leasehold Condo', 'Detached Condo', 'Co-Ownership Apartment']

// Mirror of countDirect (txn-pool variant).
async function countDirect (pool, filter) {
  const where = ['available_in_vow = $1', 'transaction_type = $2']
  const params = [filter.available_in_vow, filter.transaction_type]
  let idx = 3
  if (filter.standard_status !== undefined) {
    where.push(`standard_status = $${idx++}`); params.push(filter.standard_status)
  } else {
    where.push(`standard_status = ANY($${idx++}::text[])`); params.push(filter.standard_status_in)
  }
  switch (filter.geo.kind) {
    case 'area_id': where.push(`area_id = $${idx++}`); params.push(filter.geo.value); break
    case 'municipality_id': where.push(`municipality_id = $${idx++}`); params.push(filter.geo.value); break
    case 'community_id': where.push(`community_id = $${idx++}`); params.push(filter.geo.value); break
    case 'municipality_ids': where.push(`municipality_id = ANY($${idx++}::uuid[])`); params.push(filter.geo.values); break
  }
  if (filter.property_subtype_in && filter.property_subtype_in.length > 0) {
    where.push(`property_subtype = ANY($${idx++}::text[])`); params.push(filter.property_subtype_in)
  }
  const sql = `SELECT count(*)::int AS n FROM mls_listings WHERE ${where.join(' AND ')}`
  const r = await pool.query(sql, params)
  return r.rows[0].n
}

;(async () => {
  // === Phase 1: numerical equivalence (txn pool == session ground truth) ===
  console.log('=== Phase 1: numerical equivalence (txn vs session) ===')
  const torArea = (await sessPool.query("SELECT id FROM treb_areas WHERE slug='toronto-area'")).rows[0].id
  const markham = (await sessPool.query("SELECT id FROM municipalities WHERE slug='markham'")).rows[0].id
  const midtown = (await sessPool.query("SELECT id FROM neighbourhoods WHERE slug='midtown-central'")).rows[0].id
  const midtownMunis = (await sessPool.query("SELECT m.id FROM municipalities m JOIN municipality_neighbourhoods mn ON mn.municipality_id=m.id WHERE mn.neighbourhood_id=$1", [midtown])).rows.map(r => r.id)
  const blueGrass = (await sessPool.query("SELECT id FROM communities WHERE slug='blue-grass-meadows'")).rows[0].id

  const equivalenceCases = [
    { lbl: 'Toronto-area sold (Closed/For Sale)',   geo: { kind: 'area_id', value: torArea }, standard_status: 'Closed', transaction_type: 'For Sale', available_in_vow: true },
    { lbl: 'Toronto-area leased (Closed/For Lease)', geo: { kind: 'area_id', value: torArea }, standard_status: 'Closed', transaction_type: 'For Lease', available_in_vow: true },
    { lbl: 'Toronto-area Active forSale',            geo: { kind: 'area_id', value: torArea }, standard_status_in: ACTIVE, transaction_type: 'For Sale', available_in_vow: true },
    { lbl: 'Toronto-area Active forLease',           geo: { kind: 'area_id', value: torArea }, standard_status_in: ACTIVE, transaction_type: 'For Lease', available_in_vow: true },
    { lbl: 'Toronto-area homeSold',                  geo: { kind: 'area_id', value: torArea }, standard_status: 'Closed', transaction_type: 'For Sale', available_in_vow: true, property_subtype_in: HOME },
    { lbl: 'Toronto-area condoLeased',               geo: { kind: 'area_id', value: torArea }, standard_status: 'Closed', transaction_type: 'For Lease', available_in_vow: true, property_subtype_in: CONDO },
    { lbl: 'Markham sold',                           geo: { kind: 'municipality_id', value: markham }, standard_status: 'Closed', transaction_type: 'For Sale', available_in_vow: true },
    { lbl: 'Markham Active forSale',                 geo: { kind: 'municipality_id', value: markham }, standard_status_in: ACTIVE, transaction_type: 'For Sale', available_in_vow: true },
    { lbl: 'Midtown-central sold (via municipality_ids)', geo: { kind: 'municipality_ids', values: midtownMunis }, standard_status: 'Closed', transaction_type: 'For Sale', available_in_vow: true },
    { lbl: 'Blue-Grass-Meadows leased',              geo: { kind: 'community_id', value: blueGrass }, standard_status: 'Closed', transaction_type: 'For Lease', available_in_vow: true },
  ]

  let fail = 0
  for (const c of equivalenceCases) {
    const viaTxn = await countDirect(txnPool, c)
    const viaSess = await countDirect(sessPool, c)
    const ok = viaTxn === viaSess
    if (!ok) fail++
    console.log('  ' + (ok ? 'PASS' : 'FAIL') + ' ' + c.lbl.padEnd(50) + ' txn=' + String(viaTxn).padStart(7) + ' sess=' + String(viaSess).padStart(7))
  }

  // === Phase 2: simulate one full AreaPage render via TXN pool ===
  console.log('')
  console.log('=== Phase 2: AreaPage (12 concurrent counts) via TXN pool ===')
  const areaRenderBuckets = [
    { geo: { kind: 'area_id', value: torArea }, standard_status_in: ACTIVE, transaction_type: 'For Sale', available_in_vow: true, lbl: 'forSaleActive' },
    { geo: { kind: 'area_id', value: torArea }, standard_status_in: ACTIVE, transaction_type: 'For Lease', available_in_vow: true, lbl: 'forLeaseActive' },
    { geo: { kind: 'area_id', value: torArea }, standard_status: 'Closed', transaction_type: 'For Sale', available_in_vow: true, lbl: 'sold' },
    { geo: { kind: 'area_id', value: torArea }, standard_status: 'Closed', transaction_type: 'For Lease', available_in_vow: true, lbl: 'leased' },
    { geo: { kind: 'area_id', value: torArea }, standard_status_in: ACTIVE, transaction_type: 'For Sale', available_in_vow: true, property_subtype_in: HOME, lbl: 'homeFsA' },
    { geo: { kind: 'area_id', value: torArea }, standard_status_in: ACTIVE, transaction_type: 'For Lease', available_in_vow: true, property_subtype_in: HOME, lbl: 'homeFlA' },
    { geo: { kind: 'area_id', value: torArea }, standard_status: 'Closed', transaction_type: 'For Sale', available_in_vow: true, property_subtype_in: HOME, lbl: 'homeSold' },
    { geo: { kind: 'area_id', value: torArea }, standard_status: 'Closed', transaction_type: 'For Lease', available_in_vow: true, property_subtype_in: HOME, lbl: 'homeLeased' },
    { geo: { kind: 'area_id', value: torArea }, standard_status_in: ACTIVE, transaction_type: 'For Sale', available_in_vow: true, property_subtype_in: CONDO, lbl: 'condoFsA' },
    { geo: { kind: 'area_id', value: torArea }, standard_status_in: ACTIVE, transaction_type: 'For Lease', available_in_vow: true, property_subtype_in: CONDO, lbl: 'condoFlA' },
    { geo: { kind: 'area_id', value: torArea }, standard_status: 'Closed', transaction_type: 'For Sale', available_in_vow: true, property_subtype_in: CONDO, lbl: 'condoSold' },
    { geo: { kind: 'area_id', value: torArea }, standard_status: 'Closed', transaction_type: 'For Lease', available_in_vow: true, property_subtype_in: CONDO, lbl: 'condoLeased' },
  ]
  const t0 = Date.now()
  let twelveOK = 0, twelveErr = 0
  await Promise.all(areaRenderBuckets.map(async b => {
    try { await countDirect(txnPool, b); twelveOK++ } catch (e) { twelveErr++; console.log('  ' + b.lbl + ' err:', e.code, e.message) }
  }))
  console.log('  12 concurrent: ok=' + twelveOK + ' err=' + twelveErr + ' wall=' + (Date.now() - t0) + 'ms')

  // === Phase 3: HEAVY concurrency -- 60 concurrent counts across mixed pages ===
  console.log('')
  console.log('=== Phase 3: 60 concurrent count queries via TXN pool (heavy burst) ===')
  // Simulate 5x of each page-type's worst-case query set fired simultaneously:
  //   5 AreaPage worth (12 counts each) = 60 concurrent counts.
  // If session pool was used, would EMAXCONNSESSION at 15. TXN pool ceiling
  // is 200; with our local max:30 we expect queueing but no errors.
  const heavy = []
  for (let i = 0; i < 5; i++) {
    for (const b of areaRenderBuckets) heavy.push(countDirect(txnPool, b))
  }
  const tHeavy = Date.now()
  let hOK = 0, hErr = 0
  let firstErr = null
  await Promise.all(heavy.map(async p => {
    try { await p; hOK++ } catch (e) { hErr++; if (!firstErr) firstErr = (e.code || '') + ': ' + e.message }
  }))
  console.log('  60 concurrent: ok=' + hOK + ' err=' + hErr + ' wall=' + (Date.now() - tHeavy) + 'ms')
  if (firstErr) console.log('  first err:', firstErr)
  console.log('  pool state: totalCount=' + txnPool.totalCount + ' idleCount=' + txnPool.idleCount + ' waitingCount=' + txnPool.waitingCount)

  // === Phase 4: REALISTIC concurrent burst -- 4 different page renders ===
  // Production case: multiple Vercel instances rendering DIFFERENT geo pages
  // concurrently (each unstable_cache key = one render). No same-geo overlap.
  console.log('')
  console.log('=== Phase 4: 4 concurrent DIFFERENT-page renders via TXN pool ===')
  const areaBucketSet = (geoVal) => [
    { geo: { kind: 'area_id', value: geoVal }, standard_status_in: ACTIVE, transaction_type: 'For Sale', available_in_vow: true },
    { geo: { kind: 'area_id', value: geoVal }, standard_status_in: ACTIVE, transaction_type: 'For Lease', available_in_vow: true },
    { geo: { kind: 'area_id', value: geoVal }, standard_status: 'Closed', transaction_type: 'For Sale', available_in_vow: true },
    { geo: { kind: 'area_id', value: geoVal }, standard_status: 'Closed', transaction_type: 'For Lease', available_in_vow: true },
    { geo: { kind: 'area_id', value: geoVal }, standard_status_in: ACTIVE, transaction_type: 'For Sale', available_in_vow: true, property_subtype_in: HOME },
    { geo: { kind: 'area_id', value: geoVal }, standard_status_in: ACTIVE, transaction_type: 'For Lease', available_in_vow: true, property_subtype_in: HOME },
    { geo: { kind: 'area_id', value: geoVal }, standard_status: 'Closed', transaction_type: 'For Sale', available_in_vow: true, property_subtype_in: HOME },
    { geo: { kind: 'area_id', value: geoVal }, standard_status: 'Closed', transaction_type: 'For Lease', available_in_vow: true, property_subtype_in: HOME },
    { geo: { kind: 'area_id', value: geoVal }, standard_status_in: ACTIVE, transaction_type: 'For Sale', available_in_vow: true, property_subtype_in: CONDO },
    { geo: { kind: 'area_id', value: geoVal }, standard_status_in: ACTIVE, transaction_type: 'For Lease', available_in_vow: true, property_subtype_in: CONDO },
    { geo: { kind: 'area_id', value: geoVal }, standard_status: 'Closed', transaction_type: 'For Sale', available_in_vow: true, property_subtype_in: CONDO },
    { geo: { kind: 'area_id', value: geoVal }, standard_status: 'Closed', transaction_type: 'For Lease', available_in_vow: true, property_subtype_in: CONDO },
  ]
  const muniBucketSet = (mid) => [
    { geo: { kind: 'municipality_id', value: mid }, standard_status_in: ACTIVE, transaction_type: 'For Sale', available_in_vow: true },
    { geo: { kind: 'municipality_id', value: mid }, standard_status_in: ACTIVE, transaction_type: 'For Lease', available_in_vow: true },
    { geo: { kind: 'municipality_id', value: mid }, standard_status: 'Closed', transaction_type: 'For Sale', available_in_vow: true },
    { geo: { kind: 'municipality_id', value: mid }, standard_status: 'Closed', transaction_type: 'For Lease', available_in_vow: true },
  ]
  const commBucketSet = (cid) => [
    { geo: { kind: 'community_id', value: cid }, standard_status_in: ACTIVE, transaction_type: 'For Sale', available_in_vow: true },
    { geo: { kind: 'community_id', value: cid }, standard_status_in: ACTIVE, transaction_type: 'For Lease', available_in_vow: true },
    { geo: { kind: 'community_id', value: cid }, standard_status: 'Closed', transaction_type: 'For Sale', available_in_vow: true },
    { geo: { kind: 'community_id', value: cid }, standard_status: 'Closed', transaction_type: 'For Lease', available_in_vow: true },
  ]
  const mississauga = (await sessPool.query("SELECT id FROM municipalities WHERE slug='mississauga'")).rows[0].id
  const realistic = [
    ...areaBucketSet(torArea),          // /toronto -- 12 counts
    ...muniBucketSet(markham),          // /markham -- 4
    ...muniBucketSet(mississauga),      // /mississauga -- 4
    ...commBucketSet(blueGrass),        // /blue-grass-meadows -- 4
  ]
  // 12 + 4 + 4 + 4 = 24 concurrent queries across DIFFERENT geos
  const t4 = Date.now()
  let rOK = 0, rErr = 0
  let r4FirstErr = null
  await Promise.all(realistic.map(async b => {
    try { await countDirect(txnPool, b); rOK++ } catch (e) { rErr++; if (!r4FirstErr) r4FirstErr = (e.code || '') + ': ' + e.message }
  }))
  console.log('  24 concurrent (mixed pages, 4 distinct geos): ok=' + rOK + ' err=' + rErr + ' wall=' + (Date.now() - t4) + 'ms')
  if (r4FirstErr) console.log('  first err:', r4FirstErr)
  console.log('  pool state: totalCount=' + txnPool.totalCount + ' idleCount=' + txnPool.idleCount + ' waitingCount=' + txnPool.waitingCount)

  await txnPool.end()
  await sessPool.end()
  const failures = fail + twelveErr + hErr + rErr
  console.log('')
  console.log('=== TXN-POOL SMOKE: ' + (failures === 0 ? 'ALL PASS' : failures + ' failures') + ' ===')
  process.exit(failures === 0 ? 0 : 1)
})().catch(e => { console.error('SMOKE ERROR:', e); txnPool.end().catch(()=>{}); sessPool.end().catch(()=>{}); process.exit(1) })
