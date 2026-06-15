// Read-only feasibility probe for W-CHARLIE-BUYER-CHUNK2 STEP 0:
//   - tax_annual_amount density across recent matched buyer listings
//   - sold-comp queryability with buyer criteria (geo + price + propertyCat)
const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })

const WALLIAM = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'

async function probe(c, label, fn) {
  console.log(`\n=== ${label} ===`)
  await c.query('SAVEPOINT sp')
  try { await fn(); await c.query('RELEASE SAVEPOINT sp') }
  catch (e) { await c.query('ROLLBACK TO SAVEPOINT sp').catch(()=>{}); console.log('ERR: ' + e.message) }
}

;(async () => {
  const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL })
  const c = await pool.connect()
  try {
    await c.query('BEGIN READ ONLY')

    // 1. Lead 6d479d84 — buyer plan, FULL-shape topListings. Tax density.
    await probe(c, '1. Lead 6d479d84 — tax_annual_amount across 5 matched listings', async () => {
      const r = await c.query(`
        SELECT plan_data->'topListings' AS tl
          FROM leads
         WHERE id::text LIKE '6d479d84%'`)
      if (r.rowCount === 0) { console.log('  (no lead)'); return }
      const tl = r.rows[0].tl || []
      console.log(`  topListings count: ${tl.length}`)
      let withTax = 0
      for (const l of tl) {
        const tax = l.tax_annual_amount ?? l.taxAnnualAmount ?? null
        console.log(`    ${(l.listing_key || l.listingKey || '?').slice(0,12)}…  tax=${tax}  beds=${l.bedrooms_total}  list_price=${l.list_price}  city=${(l.unparsed_address||'').split(',')[1]?.trim()}`)
        if (tax != null && Number(tax) > 0) withTax++
      }
      console.log(`  with-non-null-tax: ${withTax}/${tl.length}`)
    })

    // 2. Across the recent 8 buyer leads with topListings, what % have tax?
    await probe(c, '2. Recent buyer leads — tax density rolling across topListings', async () => {
      const r = await c.query(`
        SELECT id, contact_email, created_at, plan_data->'topListings' AS tl
          FROM leads
         WHERE tenant_id = '${WALLIAM}'
           AND intent = 'buyer'
           AND lead_origin_route LIKE '%charlie%'
           AND jsonb_array_length(COALESCE(plan_data->'topListings', '[]'::jsonb)) > 0
         ORDER BY created_at DESC
         LIMIT 10`)
      let totalListings = 0, withTax = 0, leadsWithAnyTax = 0
      for (const row of r.rows) {
        const tl = row.tl || []
        let leadTax = 0
        for (const l of tl) {
          totalListings++
          const tax = l.tax_annual_amount ?? l.taxAnnualAmount ?? null
          if (tax != null && Number(tax) > 0) { withTax++; leadTax++ }
        }
        if (leadTax > 0) leadsWithAnyTax++
        console.log(`  ${row.created_at.toISOString().slice(0,10)} ${row.id.slice(0,8)}… listings=${tl.length} with-tax=${leadTax}`)
      }
      console.log(`  TOTAL: ${withTax}/${totalListings} listings have tax (${totalListings ? Math.round(100*withTax/totalListings) : 0}%)`)
      console.log(`  LEADS-WITH-ANY-TAX: ${leadsWithAnyTax}/${r.rowCount} (${r.rowCount ? Math.round(100*leadsWithAnyTax/r.rowCount) : 0}%)`)
    })

    // 3. Whole-table density: across all mls_listings active+sold in last 90d,
    //    what % carry tax_annual_amount? Tests source data, not just lead-snapshot.
    await probe(c, '3. mls_listings — tax density on the live source', async () => {
      const r = await c.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE tax_annual_amount IS NOT NULL AND tax_annual_amount > 0) AS with_tax,
          property_type
          FROM mls_listings
         WHERE standard_status IN ('Active','Active Under Contract','Pending','Closed')
           AND (close_date IS NULL OR close_date >= now() - interval '90 days')
           AND list_price IS NOT NULL
         GROUP BY property_type
         ORDER BY total DESC`)
      for (const row of r.rows) {
        const pct = row.total > 0 ? Math.round(100 * Number(row.with_tax) / Number(row.total)) : 0
        console.log(`  property_type=${row.property_type}  total=${row.total}  with_tax=${row.with_tax}  (${pct}%)`)
      }
    })

    // 4. Sold-comp queryability: can a buyer-criteria query (geo+price+cat)
    //    return real sold comps? Use real Whitby muni + a typical buyer band.
    await probe(c, '4. Sold-comp feasibility — buyer criteria (Whitby, homes, $700K-$900K, last 180d)', async () => {
      const r = await c.query(`
        SELECT id, listing_key, unparsed_address, close_price, close_date, tax_annual_amount, bedrooms_total
          FROM mls_listings
         WHERE municipality_id = '70103aef-1b32-4939-9ff8-264e859a5587'  -- Whitby
           AND standard_status = 'Closed'
           AND transaction_type = 'For Sale'
           AND property_type = 'Residential Freehold'
           AND close_price BETWEEN 700000 AND 900000
           AND close_date >= now() - interval '180 days'
         ORDER BY close_date DESC
         LIMIT 8`)
      console.log(`  rows returned: ${r.rowCount}`)
      let withTax = 0
      for (const row of r.rows) {
        if (row.tax_annual_amount != null && Number(row.tax_annual_amount) > 0) withTax++
        console.log(`    ${row.close_date} ${row.listing_key} $${row.close_price} tax=${row.tax_annual_amount ?? '(null)'} beds=${row.bedrooms_total}`)
      }
      console.log(`  with-tax: ${withTax}/${r.rowCount}`)
    })

    // 5. Same as #4 but condos (typical buyer)
    await probe(c, '5. Sold-comp feasibility — buyer criteria (Toronto-C01, condo, $500K-$700K, last 180d)', async () => {
      const r = await c.query(`
        SELECT id, listing_key, unparsed_address, close_price, close_date, tax_annual_amount, bedrooms_total
          FROM mls_listings
         WHERE community_id IN (SELECT id FROM communities WHERE municipality_id IN (SELECT id FROM municipalities WHERE name = 'Toronto') LIMIT 5)
           AND standard_status = 'Closed'
           AND transaction_type = 'For Sale'
           AND property_type = 'Residential Condo & Other'
           AND close_price BETWEEN 500000 AND 700000
           AND close_date >= now() - interval '180 days'
         ORDER BY close_date DESC
         LIMIT 8`)
      console.log(`  rows returned: ${r.rowCount}`)
      let withTax = 0
      for (const row of r.rows) {
        if (row.tax_annual_amount != null && Number(row.tax_annual_amount) > 0) withTax++
        console.log(`    ${row.close_date} ${row.listing_key} $${row.close_price} tax=${row.tax_annual_amount ?? '(null)'} beds=${row.bedrooms_total}`)
      }
      console.log(`  with-tax: ${withTax}/${r.rowCount}`)
    })

    await c.query('ROLLBACK')
  } finally { c.release(); await pool.end() }
})().catch(e => { console.error(e); process.exit(1) })
