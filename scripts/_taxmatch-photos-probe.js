// Read-only probe — does Whitby Closed/SOLD media actually exist?
// If YES → QUERY FIX (mirror geo-listings media join in tax-band-sold-query).
// If NO  → HONEST NO-MEDIA (PropTx doesn't carry sold thumbnails for this muni).
const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })

const WHITBY_MUNI = '70103aef-1b32-4939-9ff8-264e859a5587'

;(async () => {
  const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL })
  const c = await pool.connect()
  try {
    await c.query('BEGIN READ ONLY')

    // 1. Sample 10 Closed/SOLD Whitby Residential Freehold listings, with their close_date
    //    + see if ANY have media rows (variant_type = 'thumbnail').
    console.log('=== RECON A — 10 recent Closed Whitby Residential Freehold listings ===')
    const sold = await c.query(`
      SELECT id, listing_key, unparsed_address, close_price, close_date
        FROM mls_listings
       WHERE municipality_id = $1
         AND property_type = 'Residential Freehold'
         AND transaction_type = 'For Sale'
         AND standard_status = 'Closed'
         AND close_price IS NOT NULL
       ORDER BY close_date DESC NULLS LAST
       LIMIT 10`,
      [WHITBY_MUNI])
    console.log(`  found ${sold.rowCount} Closed Whitby listings`)
    for (const r of sold.rows) {
      console.log(`    id=${r.id}  key=${r.listing_key}  close_date=${r.close_date?.toISOString?.()?.slice(0,10) ?? '?'}  addr="${(r.unparsed_address||'').slice(0,40)}"`)
    }

    if (sold.rowCount === 0) { await c.query('ROLLBACK'); return }

    const ids = sold.rows.map(r => r.id)

    // 2. Look up media rows for those 10 listings.
    console.log('\n=== RECON B — media rows for those 10 listings (any variant) ===')
    const media = await c.query(`
      SELECT listing_id, COUNT(*) AS n, COUNT(*) FILTER (WHERE variant_type='thumbnail') AS thumbnails
        FROM media
       WHERE listing_id = ANY($1::uuid[])
       GROUP BY listing_id`,
      [ids])
    console.log(`  media rows for ${media.rowCount} of ${ids.length} listings:`)
    const haveMedia = new Set()
    for (const r of media.rows) {
      console.log(`    listing_id=${r.listing_id}  total_media=${r.n}  thumbnails=${r.thumbnails}`)
      if (Number(r.thumbnails) > 0) haveMedia.add(r.listing_id)
    }
    console.log(`  → ${haveMedia.size} of ${ids.length} Closed Whitby listings carry at least one thumbnail`)

    // 3. Sample 1-2 actual media URLs to prove they're real
    console.log('\n=== RECON C — sample media URLs for proof ===')
    const sampleUrl = await c.query(`
      SELECT listing_id, media_url, variant_type, order_number
        FROM media
       WHERE listing_id = ANY($1::uuid[])
         AND variant_type = 'thumbnail'
       ORDER BY listing_id, order_number
       LIMIT 5`,
      [ids])
    for (const r of sampleUrl.rows) {
      console.log(`    listing_id=${r.listing_id}  variant=${r.variant_type}  order=${r.order_number}  url=${(r.media_url||'').slice(0, 100)}`)
    }

    // 4. Compare with For-Sale (Active) Whitby listings — coverage check
    console.log('\n=== RECON D — coverage on For-Sale (Active) Whitby Residential Freehold ===')
    const active = await c.query(`
      SELECT id FROM mls_listings
       WHERE municipality_id = $1
         AND property_type = 'Residential Freehold'
         AND transaction_type = 'For Sale'
         AND standard_status = 'Active'
       LIMIT 10`,
      [WHITBY_MUNI])
    if (active.rowCount > 0) {
      const activeIds = active.rows.map(r => r.id)
      const aMedia = await c.query(`
        SELECT listing_id FROM media
         WHERE listing_id = ANY($1::uuid[]) AND variant_type='thumbnail' GROUP BY listing_id`,
        [activeIds])
      console.log(`  → ${aMedia.rowCount} of ${activeIds.length} Active Whitby listings carry a thumbnail`)
    } else {
      console.log('  (no Active Whitby listings to compare)')
    }

    // 5. Macro coverage — what % of all Closed Whitby Residential Freehold have media at all
    console.log('\n=== RECON E — macro coverage across all Closed Whitby ===')
    const macro = await c.query(`
      SELECT
        COUNT(DISTINCT l.id) AS total_closed,
        COUNT(DISTINCT m.listing_id) AS with_thumb
        FROM mls_listings l
        LEFT JOIN media m ON m.listing_id = l.id AND m.variant_type = 'thumbnail'
       WHERE l.municipality_id = $1
         AND l.property_type = 'Residential Freehold'
         AND l.transaction_type = 'For Sale'
         AND l.standard_status = 'Closed'`,
      [WHITBY_MUNI])
    const total = macro.rows[0].total_closed
    const withT = macro.rows[0].with_thumb
    const pct = total > 0 ? (withT / total * 100).toFixed(1) : '0'
    console.log(`  Closed Whitby Res-Freehold: ${withT} of ${total} carry thumbnail (${pct}%)`)

    await c.query('ROLLBACK')
  } finally { c.release(); await pool.end() }
})().catch(e => { console.error(e); process.exit(1) })
