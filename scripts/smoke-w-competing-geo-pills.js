// W-COMPETING-GEO-PILLS — cross-surface equality smoke.
//
// Verifies the (just-applied) tier-stamp build:
//   1. /api/charlie/competing-listings returns rows with sourceTier
//      stamped at the matcher source (SF home cascade, condo branch).
//   2. Tier is uniform per response — cascade returns one geo level.
//   3. Cross-surface equality: the same sourceTier value is the source
//      the in-chat tile, email chip, and lead TileRow all render from.
//   4. Honest-empty competing → no orphan tier badge anywhere.
//   5. No-regression: ea56db5 wiring intact; tax-match badge unchanged.
//
// Real-data via the dev server. Subjects are real mls_listings rows.

require('dotenv').config({ path: '.env.local' })
const fs = require('fs')
const { Client } = require('pg')

const DEV_PORT = process.env.SMOKE_PORT || '3000'
const ENDPOINT = `http://localhost:${DEV_PORT}/api/charlie/competing-listings`

async function pgClient() {
  const c = new Client({ connectionString: process.env.DATABASE_URL.replace(':5432', ':6543') })
  await c.connect()
  return c
}

async function postCompeting(body) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}

let pass = 0, fail = 0
const PASS = (m) => { console.log('  PASS:', m); pass++ }
const FAIL = (m) => { console.log('  FAIL:', m); fail++ }

;(async () => {
  console.log('=== W-COMPETING-GEO-PILLS — smoke (dev server :' + DEV_PORT + ') ===\n')

  const pg = await pgClient()

  // ─────────────────────────────────────────────────────────────────
  // PICK A REAL SF HOME SUBJECT — Detached in Mississauga with both
  // community + muni populated. We want a subject the matcher's
  // community cascade actually returns for, so the smoke can assert
  // tier ∈ {gold, silver}.
  // ─────────────────────────────────────────────────────────────────
  const sfHome = (await pg.query(`
    SELECT listing_key, unparsed_address, community_id, municipality_id,
           bedrooms_total, bathrooms_total_integer, living_area_range,
           architectural_style, approximate_age, property_subtype
      FROM mls_listings
     WHERE property_type = 'Residential Freehold'
       AND property_subtype = 'Detached'
       AND community_id IS NOT NULL
       AND municipality_id IS NOT NULL
       AND bedrooms_total = 4
       AND bathrooms_total_integer = 3
       AND living_area_range IS NOT NULL
       AND standard_status = 'Active'
       AND available_in_vow = true
     LIMIT 1
  `)).rows[0]
  if (!sfHome) { FAIL('no SF home subject available'); process.exit(1) }
  console.log(`SF home subject: ${sfHome.listing_key} (${sfHome.unparsed_address})`)
  console.log(`  community_id=${sfHome.community_id.slice(0, 8)} muni_id=${sfHome.municipality_id.slice(0, 8)}\n`)

  // ─────────────────────────────────────────────────────────────────
  // PART 1 — call the endpoint; assert tier stamped + uniform
  // ─────────────────────────────────────────────────────────────────
  console.log('--- PART 1: SF home endpoint returns sourceTier ---')
  const sfResp = await postCompeting({
    path: 'home',
    communityId: sfHome.community_id,
    municipalityId: sfHome.municipality_id,
    bedrooms: sfHome.bedrooms_total,
    bathrooms: sfHome.bathrooms_total_integer,
    livingAreaRange: sfHome.living_area_range,
    propertySubtype: sfHome.property_subtype,
    architecturalStyle: (sfHome.architectural_style || [])[0] || null,
    approximateAge: sfHome.approximate_age,
  })
  console.log(`  status=${sfResp.status}  success=${sfResp.body?.success}  listings=${sfResp.body?.listings?.length ?? 0}`)
  const sfListings = sfResp.body?.listings || []
  if (sfListings.length === 0) {
    console.log('  (SF home pool empty — pick a denser subject; honest-empty path still tested in PART 4)')
  } else {
    const tiers = new Set(sfListings.map(l => l.sourceTier))
    const allHave = sfListings.every(l => !!l.sourceTier)
    if (allHave) PASS('every returned SF row has sourceTier stamped')
    else FAIL(`${sfListings.filter(l => !l.sourceTier).length}/${sfListings.length} rows missing sourceTier`)

    const validSF = sfListings.every(l => l.sourceTier === 'gold' || l.sourceTier === 'silver')
    if (validSF) PASS(`SF tier values ∈ {gold, silver} (no platinum/bronze — SF cascade has no street/area branch)`)
    else FAIL(`SF tier values include unexpected: ${[...tiers].join(',')}`)

    if (tiers.size === 1) PASS(`uniform per response — single tier "${[...tiers][0]}"`)
    else FAIL(`non-uniform tiers across one response: ${[...tiers].join(',')}`)

    console.log(`  sample row: ${sfListings[0].listing_key}  list_price=${sfListings[0].list_price}  sourceTier=${sfListings[0].sourceTier}`)
  }

  // ─────────────────────────────────────────────────────────────────
  // PART 2 — condo branch: always 'gold'
  // ─────────────────────────────────────────────────────────────────
  console.log('\n--- PART 2: condo endpoint returns sourceTier="gold" ---')
  const condo = (await pg.query(`
    SELECT listing_key, unparsed_address, community_id, bedrooms_total,
           bathrooms_total_integer, living_area_range
      FROM mls_listings
     WHERE property_type = 'Residential Condo & Other'
       AND community_id IS NOT NULL
       AND bedrooms_total IS NOT NULL
       AND standard_status = 'Active'
       AND available_in_vow = true
     LIMIT 1
  `)).rows[0]
  if (!condo) {
    console.log('  (no condo subject available — skipping)')
  } else {
    console.log(`  condo subject: ${condo.listing_key} (${condo.unparsed_address})`)
    const condoResp = await postCompeting({
      path: 'condo',
      communityId: condo.community_id,
      bedrooms: condo.bedrooms_total,
      bathrooms: condo.bathrooms_total_integer,
      livingAreaRange: condo.living_area_range,
    })
    console.log(`  status=${condoResp.status}  listings=${condoResp.body?.listings?.length ?? 0}`)
    const condoListings = condoResp.body?.listings || []
    if (condoListings.length > 0) {
      const allGold = condoListings.every(l => l.sourceTier === 'gold')
      if (allGold) PASS(`every condo row has sourceTier="gold" (single-level community query)`)
      else FAIL(`condo tier ≠ gold on some rows: ${[...new Set(condoListings.map(l => l.sourceTier))].join(',')}`)
    } else {
      console.log('  (condo pool empty — community may not have actives; not a failure)')
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // PART 3 — cross-surface: all 3 surfaces read tile.sourceTier from
  //          the same source. Source-level proof: the tier is stamped
  //          ONCE in the matcher / route, flows through ONE tile shape,
  //          three distinct renderers all read THAT field.
  // ─────────────────────────────────────────────────────────────────
  console.log('\n--- PART 3: cross-surface — single source of truth ---')

  const matcherSrc = fs.readFileSync('lib/estimator/home-comparable-matcher-sales.ts', 'utf8')
  const routeSrc   = fs.readFileSync('app/api/charlie/competing-listings/route.ts', 'utf8')
  const buyerSrc   = fs.readFileSync('app/estimator/components/HomeEstimatorResults.tsx', 'utf8')
  const emailSrc   = fs.readFileSync('lib/email/working-doc-render.ts', 'utf8')
  const leadSrc    = fs.readFileSync('components/dashboard/WorkingDocView.tsx', 'utf8')

  // SOURCE: stamps at the matcher's cascade return sites
  const sfGoldStamp   = matcherSrc.includes("sourceTier: 'gold'") && matcherSrc.match(/sourceTier:\s*'gold'/g).length >= 2
  const sfSilverStamp = matcherSrc.includes("sourceTier: 'silver'")
  const plexBronze    = matcherSrc.includes("sourceTier: 'bronze'")
  if (sfGoldStamp && sfSilverStamp && plexBronze)
    PASS('matcher: gold, silver, bronze stamps present at cascade return sites')
  else
    FAIL(`matcher stamp coverage: gold=${sfGoldStamp} silver=${sfSilverStamp} bronze=${plexBronze}`)

  if (routeSrc.includes("sourceTier: 'gold'")) PASS("condo route: sourceTier='gold' stamp present")
  else FAIL('condo route: missing gold stamp')

  // TYPE: sourceTier on CompetingListing
  if (buyerSrc.match(/sourceTier\?:\s*'platinum'\s*\|\s*'gold'/))
    PASS('CompetingListing type: sourceTier field added')
  else FAIL('CompetingListing type: sourceTier field missing')

  // SURFACE 1a — in-chat HOME: HOME_LABEL_MAP-driven badge on competing tile
  if (buyerSrc.includes('{cl.sourceTier && (() => {') &&
      buyerSrc.includes('HOME_LABEL_MAP[tierKey]') &&
      // make sure it's the COMPETING block (search after "Competing For Sale (")
      buyerSrc.indexOf('Competing For Sale (') < buyerSrc.indexOf('{cl.sourceTier && (() => {'))
    PASS('in-chat (home): tier badge reads cl.sourceTier + uses HOME_LABEL_MAP, placed in the competing block')
  else
    FAIL('in-chat tier badge missing or in wrong block')

  // SURFACE 1b — in-chat CONDO: CONDO_LABEL_MAP-driven badge on competing tile
  const condoSrc = fs.readFileSync('app/estimator/components/EstimatorResults.tsx', 'utf8')
  if (condoSrc.includes('{cl.sourceTier && (() => {') &&
      condoSrc.includes('CONDO_LABEL_MAP[tierKey]') &&
      // ensure badge sits inside the Competing block (after the section header,
      // before the bedrooms/bathrooms spans)
      condoSrc.indexOf('Competing For Sale (') < condoSrc.indexOf('{cl.sourceTier && (() => {'))
    PASS('in-chat (condo): tier badge reads cl.sourceTier + uses CONDO_LABEL_MAP, placed in the competing block')
  else
    FAIL('in-chat (condo) tier badge missing or in wrong block')

  // SURFACE 1b-IIFE — condo IIFE threads sourceTier into workingDoc.competing
  if (condoSrc.includes('sourceTier: c.sourceTier ?? null') &&
      condoSrc.includes('bestGeoTier: (competingSrc[0] as any)?.sourceTier ?? null'))
    PASS('condo IIFE threads sourceTier + bestGeoTier into workingDoc.competing.tiles')
  else
    FAIL('condo IIFE missing sourceTier/bestGeoTier thread')

  // SURFACE 2 — email: chip gate flipped + tileFromCompeting carries sourceTier
  if (emailSrc.includes("sourceTier: c?.sourceTier ?? null"))
    PASS('email: tileFromCompeting carries sourceTier into workingDoc.competing.tiles')
  else FAIL('email: tileFromCompeting missing sourceTier')

  if (emailSrc.match(/\/\* showChip \*\/\s*true,\s*\n\s*\)\s*\n\s*if \(!sold && !tax && !competing\)/s))
    PASS('email: competing section showChip flipped to TRUE')
  else FAIL('email: showChip not flipped for competing section')

  // SURFACE 3 — lead: TileRow already reads tile.sourceTier
  if (leadSrc.includes('const tier = tile.sourceTier ? tierLabel(tile.sourceTier) : null') &&
      leadSrc.includes('{tier &&'))
    PASS('lead: WorkingDocView.TileRow reads tile.sourceTier (already wired; no edit needed)')
  else FAIL('lead: WorkingDocView TileRow tier-render block missing')

  // The in-chat IIFE in HomeEstimatorResults stamps sourceTier on
  // workingDoc.competing.tiles → that's the same path the email + lead
  // consume. Cross-surface equality is by construction.
  if (buyerSrc.includes('// W-COMPETING-GEO-PILLS') && buyerSrc.includes('sourceTier: c.sourceTier ?? null'))
    PASS('cross-surface: tile-builder threads sourceTier from row → workingDoc.competing.tiles → email/lead')
  else FAIL('tile-builder doesn\'t thread sourceTier into workingDoc.competing.tiles')

  // ─────────────────────────────────────────────────────────────────
  // PART 4 — honest-empty (zero comps): tile-builder yields null
  //          section → email + lead omit the section entirely.
  // ─────────────────────────────────────────────────────────────────
  console.log('\n--- PART 4: honest-empty competing → no orphan badge ---')
  // The tile-builder in HomeEstimatorResults guards on `competingSrc.length > 0`;
  // the email tileFromCompeting flow checks `input.competingListings.length > 0`.
  // Both yield section=null when empty → renderers gate on `if (!section)`
  // and return ''. We verify the gates are intact:
  if (buyerSrc.match(/competing:\s*Array\.isArray\(competingSrc\)\s*&&\s*competingSrc\.length\s*>\s*0/))
    PASS('in-chat builder: empty competingSrc → null section (no orphan)')
  else FAIL('in-chat builder: empty-section gate missing')

  if (emailSrc.match(/Array\.isArray\(input\.competingListings\)\s*&&\s*input\.competingListings\.length\s*>\s*0/))
    PASS('email builder: empty competingListings → null section (no orphan)')
  else FAIL('email builder: empty-section gate missing')

  if (emailSrc.includes('if (!section || !section.tiles || section.tiles.length === 0) return \'\''))
    PASS('email renderSection: null/empty section → returns empty string (no orphan badge)')
  else FAIL('email renderSection: empty-section gate missing')

  // ─────────────────────────────────────────────────────────────────
  // PART 5 — no-regression sanity
  // ─────────────────────────────────────────────────────────────────
  console.log('\n--- PART 5: no-regression sanity ---')
  if (buyerSrc.includes('resolvedCompeting')) PASS('ea56db5 (resolvedCompeting prop) intact')
  else FAIL('resolvedCompeting prop missing — regression')

  if (buyerSrc.includes("tierKey === 'platinum' ? 'bg-emerald-600 text-white'"))
    PASS('tax-match tile badge color logic unchanged')
  else FAIL('tax-match tile badge regression')

  // SOLD-comp stamp helper (anonymous closure `stamp` at ~L1405) untouched.
  // The forbidden scope rule: leave the SOLD-comp tier stamping; only
  // REUSE its tier strings via shared mapping.
  if (matcherSrc.includes("(arr || []).map(c => ({ ...c, sourceTier: tier }))"))
    PASS('SOLD-comp stamp helper untouched (FORBIDDEN scope respected)')
  else FAIL('SOLD-comp stamp helper regression')

  await pg.end()

  console.log(`\n=== SMOKE ${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} pass / ${fail} fail ===`)
  process.exit(fail === 0 ? 0 : 1)
})().catch(e => { console.error('SMOKE THREW:', e); process.exit(1) })
