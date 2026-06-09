// STEP 0 hygiene gate for street activation. F-MLS-SUBTYPE-TRAILING-SPACE-SEMI
// defect class check on street_name and street_number columns.
// Read-only.
require('dotenv').config({ path: '.env.local' })
const { Client } = require('pg')
;(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL.replace(':5432',':6543') })
  await c.connect()
  const r = await c.query(`
    SELECT
      COUNT(*) FILTER (WHERE street_name <> btrim(street_name))     AS name_ws,
      COUNT(*) FILTER (WHERE street_number <> btrim(street_number)) AS num_ws,
      COUNT(*)                                                       AS total
    FROM mls_listings
    WHERE standard_status = 'Closed'
      AND close_date >= (CURRENT_DATE - INTERVAL '2 years')
  `)
  const row = r.rows[0]
  console.log(`Closed 2y rows total:   ${row.total}`)
  console.log(`street_name with ws:    ${row.name_ws}`)
  console.log(`street_number with ws:  ${row.num_ws}`)
  console.log('')
  console.log(BigInt(row.name_ws) === 0n && BigInt(row.num_ws) === 0n
    ? 'VERDICT: BOTH zero — street columns clean, no defensive btrim beyond normal extract needed.'
    : 'VERDICT: NON-ZERO — normalizer MUST btrim both sides.')
  await c.end()
})().catch(e => { console.error(e); process.exit(1) })
