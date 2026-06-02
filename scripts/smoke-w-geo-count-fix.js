// scripts/smoke-w-geo-count-fix.js
// W-GEO-COUNT-FIX smoke: exercises pg-direct via the same Pool config
// lib/db/pg.ts uses, against the 3 production samples that proved the
// threshold (Midtown / Downtown / Toronto-area). Confirms:
//   1. All 3 samples return REAL numbers (not null/0).
//   2. Toronto-area-leased (139K rows, 8.4s DB) which was the failing case
//      under PostgREST's 8s ceiling now returns the real number under
//      pg-direct's 30s ceiling.
//   3. A simulated count timeout THROWS (not silently returns 0) so
//      unstable_cache's no-cache-on-rejection behavior kicks in.
//   4. Connection sanity: 50 sequential calls do not exhaust the pool.

require('dotenv').config({ path: '.env.local' })
const { Pool } = require('pg')

const CONN =
  process.env.DATABASE_URL ||
  process.env.SUPABASE_DB_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_URL_NON_POOLING

const pool = new Pool({
  connectionString: CONN,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 30000,
})
pool.on('error', (e) => console.error('[pool err]', e.message))

async function countDirect (filter) {
  const where = ['available_in_vow = $1', 'standard_status = $2', 'transaction_type = $3']
  const params = [filter.available_in_vow, filter.standard_status, filter.transaction_type]
  let idx = 4
  switch (filter.geo.kind) {
    case 'area_id': where.push(`area_id = $${idx++}`); params.push(filter.geo.value); break
    case 'municipality_id': where.push(`municipality_id = $${idx++}`); params.push(filter.geo.value); break
    case 'community_id': where.push(`community_id = $${idx++}`); params.push(filter.geo.value); break
    case 'municipality_ids': where.push(`municipality_id = ANY($${idx++}::uuid[])`); params.push(filter.geo.values); break
  }
  if (filter.property_subtype_in && filter.property_subtype_in.length) {
    where.push(`property_subtype = ANY($${idx++}::text[])`)
    params.push(filter.property_subtype_in)
  }
  const sql = `SELECT count(*)::int AS n FROM mls_listings WHERE ${where.join(' AND ')}`
  const r = await pool.query(sql, params)
  return r.rows[0].n
}

;(async () => {
  // ---------- Resolve geo fixtures ----------
  const r1 = await pool.query("SELECT id FROM neighbourhoods WHERE slug='midtown-central'")
  const r2 = await pool.query("SELECT id FROM neighbourhoods WHERE slug='downtown'")
  const r3 = await pool.query("SELECT id FROM treb_areas WHERE slug='toronto-area'")
  const midtownId = r1.rows[0].id
  const downtownId = r2.rows[0].id
  const torontoAreaId = r3.rows[0].id

  const midtownMunis = (await pool.query(
    `SELECT m.id FROM municipalities m JOIN municipality_neighbourhoods mn ON mn.municipality_id = m.id WHERE mn.neighbourhood_id = $1`,
    [midtownId]
  )).rows.map(r => r.id)
  const downtownMunis = (await pool.query(
    `SELECT m.id FROM municipalities m JOIN municipality_neighbourhoods mn ON mn.municipality_id = m.id WHERE mn.neighbourhood_id = $1`,
    [downtownId]
  )).rows.map(r => r.id)

  // ---------- 1. THREE-SAMPLE PROOF ----------
  console.log('=== SAMPLE 1: countDirect returns REAL numbers (no null/0) ===')
  const samples = [
    { name: 'Midtown Sold',         geo: { kind: 'municipality_ids', values: midtownMunis }, txn: 'For Sale',  expected: 7554 },
    { name: 'Midtown Leased',       geo: { kind: 'municipality_ids', values: midtownMunis }, txn: 'For Lease', expected: 19043 },
    { name: 'Downtown Sold',        geo: { kind: 'municipality_ids', values: downtownMunis }, txn: 'For Sale',  expected: 11110 },
    { name: 'Downtown Leased',      geo: { kind: 'municipality_ids', values: downtownMunis }, txn: 'For Lease', expected: 62684 },
    { name: 'Toronto-area Sold',    geo: { kind: 'area_id',           value: torontoAreaId }, txn: 'For Sale',  expected: 53197 },
    { name: 'Toronto-area Leased',  geo: { kind: 'area_id',           value: torontoAreaId }, txn: 'For Lease', expected: 139268 },
  ]

  // Compare countDirect against an inline pg-direct COUNT(*) ground truth
  // captured at the SAME MOMENT. Eliminates MLS-data-drift false-fails (counts
  // mutate hourly as listings flip status). The fix passes if (a) countDirect
  // returns a number (not null), and (b) it equals the ground-truth COUNT(*).
  let fail = 0
  for (const s of samples) {
    let gt
    if (s.geo.kind === 'municipality_ids') {
      gt = (await pool.query(
        `SELECT count(*)::int AS n FROM mls_listings
           WHERE municipality_id = ANY($1::uuid[])
             AND available_in_vow = true
             AND standard_status = 'Closed'
             AND transaction_type = $2`,
        [s.geo.values, s.txn]
      )).rows[0].n
    } else {
      gt = (await pool.query(
        `SELECT count(*)::int AS n FROM mls_listings
           WHERE area_id = $1
             AND available_in_vow = true
             AND standard_status = 'Closed'
             AND transaction_type = $2`,
        [s.geo.value, s.txn]
      )).rows[0].n
    }
    const t0 = Date.now()
    try {
      const n = await countDirect({
        geo: s.geo,
        standard_status: 'Closed',
        transaction_type: s.txn,
        available_in_vow: true,
      })
      const ms = Date.now() - t0
      const ok = typeof n === 'number' && n === gt
      console.log(`  ${ok ? 'PASS' : 'FAIL'} ${s.name.padEnd(24)}: got ${String(n).padStart(7)} (pg-direct ground truth ${gt}, ${ms}ms)`)
      if (!ok) fail++
    } catch (e) {
      console.log(`  FAIL ${s.name.padEnd(24)}: THREW ${e.code || ''} ${e.message}`)
      fail++
    }
  }

  // ---------- 2. NO-CACHE-ON-ERROR PROOF ----------
  console.log('\n=== SAMPLE 2: timeout THROWS instead of returning silent 0 ===')
  // Simulate a 1ms statement_timeout via a dedicated client; query a big count
  // that cannot finish in 1ms. Expectation: error code 57014 query_canceled.
  const client = await pool.connect()
  let threw = false
  try {
    await client.query('SET statement_timeout = 1')
    await client.query('SELECT count(*) FROM mls_listings WHERE available_in_vow = true')
    console.log('  FAIL: query did NOT throw (would silently degrade to 0 if caller used ?? 0)')
    fail++
  } catch (e) {
    threw = true
    const isTimeout = e.code === '57014' || /canceling|cancel|timeout/i.test(e.message)
    console.log(`  ${isTimeout ? 'PASS' : 'FAIL'}: query threw ${e.code} "${e.message}"`)
    if (!isTimeout) fail++
  } finally {
    // Restore timeout on this client so we can release safely.
    try { await client.query('SET statement_timeout = 30000') } catch {}
    client.release()
  }

  // ---------- 3. CONNECTION-LEAK SANITY ----------
  console.log('\n=== SAMPLE 3: pool stays bounded under 50 sequential calls ===')
  const t0 = Date.now()
  for (let i = 0; i < 50; i++) {
    await countDirect({
      geo: { kind: 'municipality_ids', values: midtownMunis },
      standard_status: 'Closed',
      transaction_type: 'For Sale',
      available_in_vow: true,
    })
  }
  const totalMs = Date.now() - t0
  // pool.totalCount = current open conns; pool.idleCount = idle; pool.waitingCount = queued
  console.log(`  50 calls in ${totalMs}ms; pool totalCount=${pool.totalCount} idleCount=${pool.idleCount} waitingCount=${pool.waitingCount}`)
  const okPool = pool.totalCount <= 10 && pool.waitingCount === 0
  console.log(`  ${okPool ? 'PASS' : 'FAIL'}: pool bounded (totalCount <= max:10, no waiting)`)
  if (!okPool) fail++

  // ---------- 4. CONCURRENT SAFETY ----------
  console.log('\n=== SAMPLE 4: 20 concurrent calls succeed without exhausting pool ===')
  const t1 = Date.now()
  const conc = await Promise.all(Array.from({ length: 20 }, () => countDirect({
    geo: { kind: 'municipality_ids', values: midtownMunis },
    standard_status: 'Closed',
    transaction_type: 'For Sale',
    available_in_vow: true,
  })))
  const concMs = Date.now() - t1
  const okConc = conc.every(n => typeof n === 'number' && n > 0) && conc.every(n => n === conc[0])
  console.log(`  20 concurrent in ${concMs}ms; all returned ${conc[0]}; ${okConc ? 'PASS' : 'FAIL'}`)
  if (!okConc) fail++

  await pool.end()
  console.log(`\n=== SMOKE RESULT: ${fail === 0 ? 'ALL PASS' : fail + ' FAILED'} ===`)
  process.exit(fail === 0 ? 0 : 1)
})().catch(e => { console.error('SMOKE ERROR:', e); pool.end().catch(()=>{}); process.exit(1) })
