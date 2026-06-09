// STEP 0 follow-up: what does lot_width look like on Acres-flagged HOME rows?
// (Linear feet? Linear metres? Acreage area as a number? The interpretation
// decides whether the third regime is "convert", "skip", or "treat as feet".)
require('dotenv').config({ path: '.env.local' })
const { Client } = require('pg')

const HOME_SUBTYPES = ['Detached','Semi-Detached ','Att/Row/Townhouse','Link','Duplex','Triplex']

;(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL.replace(':5432',':6543') })
  await c.connect()

  console.log('=== Acres-cohort lot_width distribution per HOME_SUBTYPE ===\n')
  console.log(`  | subtype          | n_acres | min   | p10   | p50   | p90    | max     |`)
  console.log(`  |------------------|---------|-------|-------|-------|--------|---------|`)
  for (const subtype of HOME_SUBTYPES) {
    const r = await c.query(`
      SELECT COUNT(*)::int n,
             MIN(lot_width)::numeric(10,2) min,
             percentile_cont(0.10) WITHIN GROUP (ORDER BY lot_width)::numeric(10,2) p10,
             percentile_cont(0.50) WITHIN GROUP (ORDER BY lot_width)::numeric(10,2) p50,
             percentile_cont(0.90) WITHIN GROUP (ORDER BY lot_width)::numeric(10,2) p90,
             MAX(lot_width)::numeric(10,2) max
      FROM mls_listings
      WHERE property_type='Residential Freehold' AND transaction_type='For Sale'
        AND standard_status='Closed' AND close_date >= NOW() - INTERVAL '2 years'
        AND property_subtype = $1
        AND lot_size_units = 'Acres'
        AND lot_width IS NOT NULL
    `, [subtype])
    const row = r.rows[0]
    if (row.n === 0) { console.log(`  | ${subtype.padEnd(16)} | ${String(row.n).padStart(7)} |  -    |  -    |  -    |  -     |  -      |`); continue }
    console.log(`  | ${subtype.padEnd(16)} | ${String(row.n).padStart(7)} | ${String(row.min).padStart(5)} | ${String(row.p10).padStart(5)} | ${String(row.p50).padStart(5)} | ${String(row.p90).padStart(6)} | ${String(row.max).padStart(7)} |`)
  }
  console.log('')

  console.log('=== Acres-cohort: 8 sample rows ===\n')
  const samp = await c.query(`
    SELECT property_subtype, lot_width, lot_depth, lot_size_area, lot_size_units,
           lot_size_dimensions, lot_size_range_acres, unparsed_address, close_price
    FROM mls_listings
    WHERE property_type='Residential Freehold' AND transaction_type='For Sale'
      AND standard_status='Closed' AND close_date >= NOW() - INTERVAL '2 years'
      AND property_subtype = ANY($1)
      AND lot_size_units = 'Acres'
      AND lot_width IS NOT NULL
    ORDER BY close_date DESC LIMIT 8
  `, [HOME_SUBTYPES])
  for (const r of samp.rows) {
    console.log(`  ${r.property_subtype.padEnd(20)} lw=${String(r.lot_width).padStart(7)}  ld=${String(r.lot_depth ?? 'null').padStart(7)}  area=${String(r.lot_size_area ?? 'null').padStart(8)}  range=${(r.lot_size_range_acres||'-').padStart(8)}  dims="${r.lot_size_dimensions ?? ''}"  @$${Number(r.close_price).toLocaleString()}  ${(r.unparsed_address||'').split(',')[0]}`)
  }
  console.log('')

  console.log('=== Acres-cohort interpretation candidates ===\n')
  console.log(`  If lot_width is FEET (matcher today): a 50 "Acres-flagged" lot_width = 50 ft frontage — looks like a normal urban lot.`)
  console.log(`  If lot_width is METRES: 50 → 164 ft.`)
  console.log(`  If lot_width is ACRES (area encoded as linear): a 50-acre lot has ~1,476 ft side if square → matcher would treat 50 as 50 ft (~50x undercount).`)
  console.log(`  The samples above + comparing lw to lot_size_area / lot_size_range_acres reveal which.`)

  await c.end()
})().catch(e => { console.error(e); process.exit(1) })
