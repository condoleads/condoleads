// Read-only SAVEPOINT probe — diagnose For-Sale missing on lead a9b1dbf2.
const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })

const WALLIAM = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
const LEAD_ID = 'a9b1dbf2-5dba-4ecd-9c4b-6b5bcf55bb73'

;(async () => {
  const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL })
  const c = await pool.connect()
  try {
    await c.query('BEGIN READ ONLY')

    console.log('=== Lead a9b1dbf2 — plan_data shape ===')
    const r = await c.query(`
      SELECT id, intent, contact_email, geo_name, plan_data
        FROM leads
       WHERE id = $1 AND tenant_id = $2`,
      [LEAD_ID, WALLIAM])
    if (r.rowCount === 0) {
      console.log('  (lead not found — check ID + tenant)')
      const r2 = await c.query(`SELECT id, intent, contact_email, created_at FROM leads WHERE id = $1`, [LEAD_ID])
      if (r2.rowCount === 0) console.log('  (lead truly does not exist anywhere)')
      else console.log('  (lead exists on a different tenant: ' + JSON.stringify(r2.rows[0]) + ')')
    } else {
      const row = r.rows[0]
      const pd = row.plan_data || {}
      console.log(`  id=${row.id}  intent=${row.intent}  email=${row.contact_email}  geo=${row.geo_name}`)
      console.log(`  plan_data top-level keys: [${Object.keys(pd).join(', ')}]`)
      console.log(`  plan_data.planType:        ${JSON.stringify(pd.planType)}`)
      console.log(`  plan_data.plan keys:       [${pd.plan ? Object.keys(pd.plan).join(', ') : '(no plan)'}]`)
      const top = pd.topListings || []
      console.log(`  plan_data.topListings:     Array, length=${top.length}`)
      const comps = pd.comparables || (Array.isArray(pd.comparables) ? pd.comparables : null)
      console.log(`  plan_data.comparables:     ${Array.isArray(comps) ? 'Array, length=' + comps.length : JSON.stringify(comps)}`)
      console.log(`  plan_data.buyerTaxMatch:   ${pd.buyerTaxMatch ? `object, isEmpty=${pd.buyerTaxMatch.isEmpty}, samples=${(pd.buyerTaxMatch.samples||[]).length}` : '(null)'}`)
      console.log(`  plan_data.analytics keys:  [${pd.analytics ? Object.keys(pd.analytics).join(', ') : '(no analytics)'}]`)
      if (pd.analytics) {
        console.log(`    avg_concession_pct:      ${pd.analytics.avg_concession_pct}`)
        console.log(`    sale_to_list_ratio:      ${pd.analytics.sale_to_list_ratio}`)
        console.log(`    median_psf:              ${pd.analytics.median_psf}`)
      }

      // Show topListings shape (first 3 entries)
      if (top.length > 0) {
        console.log(`\n  topListings[0..2] sample:`)
        for (const l of top.slice(0, 3)) {
          console.log(`    listing_key=${l.listing_key}  addr="${l.unparsed_address || l.address || '?'}"  list_price=${l.list_price}  tax=${l.tax_annual_amount}  _slug=${l._slug || '(none)'}`)
        }
      }

      // buyerTaxMatch detail
      if (pd.buyerTaxMatch) {
        const btm = pd.buyerTaxMatch
        console.log(`\n  buyerTaxMatch detail:`)
        console.log(`    isEmpty:        ${btm.isEmpty}`)
        console.log(`    reason:         ${JSON.stringify(btm.reason)}`)
        console.log(`    bandCenter:     ${btm.bandCenter}`)
        console.log(`    taxBand:        ${JSON.stringify(btm.taxBand)}`)
        console.log(`    taxYearWindow:  ${JSON.stringify(btm.taxYearWindow)}`)
        console.log(`    withTaxCount:   ${btm.withTaxCount} of ${btm.totalCount}`)
        console.log(`    samples:        ${(btm.samples||[]).length}`)
      }
    }

    // RECON 3 — independently replicate the tax-band SOLD query against
    // the DB using the buyer's actual geo + derived band parameters.
    console.log('\n=== RECON 3 — tax-band SOLD query reality check ===')
    if (r.rowCount > 0 && r.rows[0].plan_data) {
      const pd = r.rows[0].plan_data
      const top = pd.topListings || []
      const buyerBand = pd.buyerTaxMatch?.taxBand
      const buyerYears = pd.buyerTaxMatch?.taxYearWindow
      const muni = pd.plan?.geoId || null
      const subtypes = [...new Set(top.map(l => l.property_subtype).filter(Boolean))]

      console.log(`  geo: plan.geoName=${pd.plan?.geoName} | plan.geoId(muni)=${muni}`)
      console.log(`  subtypes inferred from topListings: ${JSON.stringify(subtypes)}`)
      console.log(`  band from persisted buyerTaxMatch:  ${JSON.stringify(buyerBand)}`)
      console.log(`  taxYearWindow from persisted btm:   ${JSON.stringify(buyerYears)}`)

      // Resolve Whitby muni id explicitly (don't rely on possibly-stale geoId)
      const muniRes = await c.query(`SELECT id, name FROM municipalities WHERE name = 'Whitby' LIMIT 1`)
      const whitbyMuni = muniRes.rows[0]
      console.log(`  Whitby muni from DB:              ${whitbyMuni?.id} (${whitbyMuni?.name})`)

      // Re-derive band from topListings tax data so we know what the
      // live derivation would actually use (independent of persisted btm).
      const withTax = top.map(l => Number(l.tax_annual_amount)).filter(n => Number.isFinite(n) && n > 500)
      if (withTax.length >= 3) {
        const sortedT = [...withTax].sort((a,b)=>a-b)
        const med = sortedT.length % 2 ? sortedT[Math.floor(sortedT.length/2)] : (sortedT[sortedT.length/2 - 1] + sortedT[sortedT.length/2]) / 2
        const TAX_BAND_PCT = 0.20
        const taxLow = med * (1 - TAX_BAND_PCT)
        const taxHigh = med * (1 + TAX_BAND_PCT)
        const now = new Date()
        const yearLo = now.getUTCFullYear() - 1
        const yearHi = now.getUTCFullYear()
        const twoYearsAgo = new Date(); twoYearsAgo.setUTCFullYear(twoYearsAgo.getUTCFullYear() - 2)

        console.log(`\n  Re-derived band (from topListings.tax_annual_amount, n=${withTax.length} with tax):`)
        console.log(`    median tax: ${med}`)
        console.log(`    band [${taxLow.toFixed(2)} .. ${taxHigh.toFixed(2)}]`)
        console.log(`    tax_year window: [${yearLo} .. ${yearHi}]`)
        console.log(`    close_date floor: ${twoYearsAgo.toISOString().slice(0,10)}`)

        if (whitbyMuni?.id && subtypes.length > 0) {
          const q = await c.query(`
            SELECT COUNT(*) AS n
              FROM mls_listings
             WHERE municipality_id = $1
               AND property_subtype = ANY($2::text[])
               AND transaction_type = 'For Sale'
               AND standard_status = 'Closed'
               AND close_price IS NOT NULL
               AND close_price > 100000
               AND close_date >= $3
               AND tax_annual_amount >= $4
               AND tax_annual_amount <= $5
               AND tax_year >= $6
               AND tax_year <= $7`,
            [whitbyMuni.id, subtypes, twoYearsAgo.toISOString(), taxLow, taxHigh, yearLo, yearHi])
          console.log(`\n  REPLICATED QUERY (muni-pool, exact seller-style params):`)
          console.log(`    rows: ${q.rows[0].n}`)

          // Diagnose dimensions one at a time to isolate the gate
          const dims = await c.query(`
            SELECT
              COUNT(*) FILTER (WHERE TRUE) AS base,
              COUNT(*) FILTER (WHERE municipality_id = $1) AS by_muni,
              COUNT(*) FILTER (WHERE municipality_id = $1 AND property_subtype = ANY($2::text[])) AS by_muni_subtype,
              COUNT(*) FILTER (WHERE municipality_id = $1 AND property_subtype = ANY($2::text[]) AND transaction_type = 'For Sale' AND standard_status = 'Closed') AS by_muni_subtype_closed,
              COUNT(*) FILTER (WHERE municipality_id = $1 AND property_subtype = ANY($2::text[]) AND transaction_type = 'For Sale' AND standard_status = 'Closed' AND close_date >= $3) AS by_muni_subtype_closed_recent,
              COUNT(*) FILTER (WHERE municipality_id = $1 AND property_subtype = ANY($2::text[]) AND transaction_type = 'For Sale' AND standard_status = 'Closed' AND close_date >= $3 AND tax_annual_amount BETWEEN $4 AND $5) AS by_band,
              COUNT(*) FILTER (WHERE municipality_id = $1 AND property_subtype = ANY($2::text[]) AND transaction_type = 'For Sale' AND standard_status = 'Closed' AND close_date >= $3 AND tax_annual_amount BETWEEN $4 AND $5 AND tax_year BETWEEN $6 AND $7) AS final
              FROM mls_listings`,
            [whitbyMuni.id, subtypes, twoYearsAgo.toISOString(), taxLow, taxHigh, yearLo, yearHi])
          console.log(`\n  Dimension breakdown:`)
          for (const [k, v] of Object.entries(dims.rows[0])) console.log(`    ${k}: ${v}`)
        }
      } else {
        console.log(`  (re-derivation skipped — only ${withTax.length} listings carry tax, MIN_WITH_TAX=3)`)
      }
    }

    await c.query('ROLLBACK')
  } finally { c.release(); await pool.end() }
})().catch(e => { console.error(e); process.exit(1) })
