// Find a SF home subject whose community has ZERO actives in the
// subject's bedroom/style class but whose muni has actives — that
// forces the muni-fallback branch and stamps SILVER.
require('dotenv').config({ path: '.env.local' })
const { Client } = require('pg')

const DEV_PORT = process.env.SMOKE_PORT || '3199'
const ENDPOINT = `http://localhost:${DEV_PORT}/api/charlie/competing-listings`

;(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL.replace(':5432', ':6543') })
  await c.connect()

  // Pick communities with EXACTLY ONE active Detached (the subject itself
  // most likely). When the cascade .eq community → filters subject out via
  // funnel → 0 → fallback to muni.
  const cand = await c.query(`
    WITH sparse_comms AS (
      SELECT community_id, COUNT(*) AS active_count
        FROM mls_listings
       WHERE property_type = 'Residential Freehold'
         AND property_subtype = 'Detached'
         AND standard_status = 'Active'
         AND available_in_vow = true
         AND community_id IS NOT NULL
         AND municipality_id IS NOT NULL
       GROUP BY community_id
      HAVING COUNT(*) = 1
    )
    SELECT m.listing_key, m.unparsed_address, m.community_id, m.municipality_id,
           m.bedrooms_total, m.bathrooms_total_integer, m.living_area_range,
           m.architectural_style, m.approximate_age, m.property_subtype
      FROM mls_listings m
      JOIN sparse_comms sc ON sc.community_id = m.community_id
     WHERE m.property_type = 'Residential Freehold'
       AND m.property_subtype = 'Detached'
       AND m.standard_status = 'Active'
       AND m.available_in_vow = true
       AND m.bedrooms_total IS NOT NULL
       AND m.living_area_range IS NOT NULL
     LIMIT 100
  `)
  console.log(`Probing ${cand.rows.length} sparse-community candidates for SILVER…`)

  let foundSilver = null
  for (const s of cand.rows) {
    const res = await fetch(ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: 'home',
        communityId: s.community_id,
        municipalityId: s.municipality_id,
        bedrooms: s.bedrooms_total,
        bathrooms: s.bathrooms_total_integer,
        livingAreaRange: s.living_area_range,
        propertySubtype: s.property_subtype,
        architecturalStyle: (s.architectural_style || [])[0] || null,
        approximateAge: s.approximate_age,
      }),
    })
    const body = await res.json()
    const listings = body?.listings || []
    if (listings.length > 0 && listings[0].sourceTier === 'silver') {
      foundSilver = { s, listings }
      break
    }
  }

  if (foundSilver) {
    console.log(`\n✓ FOUND SILVER: ${foundSilver.s.listing_key} (${foundSilver.s.unparsed_address})`)
    console.log(`  → ${foundSilver.listings.length} listings`)
    const tiers = new Set(foundSilver.listings.map(l => l.sourceTier))
    const allSilver = foundSilver.listings.every(l => l.sourceTier === 'silver')
    console.log(`  → tier values: ${[...tiers].join(',')}  uniform=${tiers.size === 1}  allSilver=${allSilver}`)
    console.log(`  → sample: ${foundSilver.listings[0].listing_key} list_price=${foundSilver.listings[0].list_price}`)
    process.exit(0)
  } else {
    console.log('  (no silver path triggered in sparse-community sweep)')
    process.exit(2)
  }
})()
