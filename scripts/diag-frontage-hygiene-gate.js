// STEP 0 hygiene gate for frontage activation. Read-only.
// (a) lot_size_units distribution on 2y-closed HOME_SUBTYPES rows
// (b) lot_width <= 0 and > 200 per subtype (the guard counts)
// (c) Acres rows in HOME_SUBTYPES — must be ~zero or we widen the normalizer
require('dotenv').config({ path: '.env.local' })
const { Client } = require('pg')

const HOME_SUBTYPES = ['Detached','Semi-Detached ','Att/Row/Townhouse','Link','Duplex','Triplex']

;(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL.replace(':5432',':6543') })
  await c.connect()

  console.log('=== (a) lot_size_units distribution (2y closed HOME_SUBTYPES) ===\n')
  const r1 = await c.query(`
    SELECT COALESCE(lot_size_units, '(null)') AS unit, COUNT(*)::int n
    FROM mls_listings
    WHERE property_type = 'Residential Freehold'
      AND transaction_type = 'For Sale'
      AND standard_status = 'Closed'
      AND close_date >= NOW() - INTERVAL '2 years'
      AND property_subtype = ANY($1)
    GROUP BY 1 ORDER BY n DESC
  `, [HOME_SUBTYPES])
  let total = 0
  for (const r of r1.rows) { console.log(`  ${r.unit.padEnd(12)} n=${String(r.n).padStart(8)}`); total += r.n }
  console.log(`  ${'TOTAL'.padEnd(12)} n=${String(total).padStart(8)}`)
  console.log('')

  console.log('=== (b) lot_width <= 0 and > 200 per HOME_SUBTYPE (guard counts) ===\n')
  console.log(`  | subtype                | rows         | lw<=0   | lw>200  | lw>1000 |`)
  console.log(`  |------------------------|--------------|---------|---------|---------|`)
  for (const subtype of HOME_SUBTYPES) {
    const r = await c.query(`
      SELECT COUNT(*)::int total,
             SUM((lot_width <= 0)::int)::int neg,
             SUM((lot_width > 200)::int)::int gt200,
             SUM((lot_width > 1000)::int)::int gt1000
      FROM mls_listings
      WHERE property_type='Residential Freehold' AND transaction_type='For Sale'
        AND standard_status='Closed' AND close_date >= NOW() - INTERVAL '2 years'
        AND property_subtype = $1
    `, [subtype])
    const row = r.rows[0]
    console.log(`  | ${(`'${subtype}'`).padEnd(22)} | ${String(row.total).padStart(12)} | ${String(row.neg).padStart(7)} | ${String(row.gt200).padStart(7)} | ${String(row.gt1000).padStart(7)} |`)
  }
  console.log('')

  console.log('=== (c) Acres-in-home check (the new-regime gate) ===\n')
  const r3 = await c.query(`
    SELECT property_subtype, COUNT(*)::int n
    FROM mls_listings
    WHERE property_type='Residential Freehold' AND transaction_type='For Sale'
      AND standard_status='Closed' AND close_date >= NOW() - INTERVAL '2 years'
      AND property_subtype = ANY($1)
      AND lot_size_units = 'Acres'
    GROUP BY property_subtype ORDER BY n DESC
  `, [HOME_SUBTYPES])
  let acresTotal = 0
  if (r3.rows.length === 0) {
    console.log('  ZERO Acres rows in HOME_SUBTYPES — confirms recon. Feet+Metres+null is the full regime.')
  } else {
    for (const r of r3.rows) { console.log(`  ${r.property_subtype.padEnd(22)} n=${r.n} (Acres)`); acresTotal += r.n }
    console.log(`  TOTAL Acres in HOME_SUBTYPES: ${acresTotal}`)
    if (acresTotal > 100) {
      console.log('  ⚠ ACRES IN HOMES NON-TRIVIAL — third regime, decision needed before coding')
    }
  }
  console.log('')

  console.log('=== (d) Metres-row spot sample (verify the value shape) ===\n')
  const r4 = await c.query(`
    SELECT property_subtype, lot_width, lot_size_units, unparsed_address, close_price
    FROM mls_listings
    WHERE property_type='Residential Freehold' AND transaction_type='For Sale'
      AND standard_status='Closed' AND close_date >= NOW() - INTERVAL '2 years'
      AND property_subtype = ANY($1)
      AND lot_size_units = 'Metres'
      AND lot_width > 0
    ORDER BY close_date DESC LIMIT 5
  `, [HOME_SUBTYPES])
  for (const r of r4.rows) {
    const ft = (Number(r.lot_width) * 3.28084).toFixed(1)
    console.log(`  ${r.property_subtype.padEnd(20)} lw=${r.lot_width}m → ${ft}ft  @$${Number(r.close_price).toLocaleString()}  ${(r.unparsed_address||'').split(',')[0]}`)
  }

  await c.end()
})().catch(e => { console.error(e); process.exit(1) })
