// scripts/verify-c-enhance-data.js
//
// C-ENHANCE-1-DATA verification (CODE-VERIFIED, NOT live walliam.ca).
//
// Strategy:
//   - Charlie's SellerEstimateRunner now calls estimateCondoSale (S2) +
//     estimateHomeSale (S2). Both populate result.data.{tiers, bestGeoTier,
//     taxMatch} when the data + specs allow. The probe route
//     /api/test-estimator-sections invokes EXACTLY those same actions for
//     a real listing — so verifying through it is equivalent to verifying
//     Charlie's data path at runtime (the actions are tenant-aware via
//     getCurrentTenantId() in their own request context).
//
//   - PG queries (BEGIN ... ROLLBACK) discover real subjects in WALLiam-
//     served geography:
//       (a) a condo subject WITH tax_annual_amount > 0 (tax-match firing)
//       (b) a home  subject WITH tax_annual_amount > 0
//       (c) a condo subject WITHOUT tax (graceful no-op verification)
//
//   - Curl the probe for each subject; assert shape.
//
//   - NO mutation. NO emails. NO state change. dev server must be running
//     on http://localhost:3000 with DEV_TENANT_DOMAIN=walliam.ca set in
//     .env.local (already configured per CLAUDE.md / verified).

require('dotenv').config({ path: '.env.local' })
const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

const BASE = process.env.DEV_BASE_URL || 'http://localhost:3000'
const PROBE = `${BASE}/api/test-estimator-sections`

function dbCfg() {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.DIRECT_URL
  if (!url) throw new Error('DATABASE_URL / SUPABASE_DB_URL / DIRECT_URL not in env')
  return { connectionString: url, ssl: { rejectUnauthorized: false } }
}

async function checkDevServer() {
  try {
    const r = await fetch(BASE, { method: 'HEAD' })
    return r.status < 500
  } catch (e) {
    return false
  }
}

async function postProbe(listingId, type, pathKind = 'page') {
  const res = await fetch(PROBE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ listingId, type, path: pathKind }),
  })
  const j = await res.json()
  if (!res.ok) throw new Error(`probe ${type}/${listingId}: ${j.error || res.statusText}`)
  return j
}

async function findCondoWithTax(c) {
  // Sold condo with building_id + same-building sold pool > 1 + tax data.
  const q = `
    SELECT id, listing_key, building_id, community_id, municipality_id,
           bedrooms_total, bathrooms_total_integer, living_area_range,
           tax_annual_amount, tax_year, close_price, close_date, unparsed_address
    FROM mls_listings
    WHERE property_type = 'Residential Condo & Other'
      AND transaction_type = 'For Sale'
      AND standard_status = 'Closed'
      AND building_id IS NOT NULL
      AND community_id IS NOT NULL
      AND municipality_id IS NOT NULL
      AND tax_annual_amount IS NOT NULL AND tax_annual_amount > 0
      AND tax_year IS NOT NULL
      AND close_date IS NOT NULL
      AND close_date > NOW() - INTERVAL '365 days'
      AND building_id IN (
        SELECT building_id FROM mls_listings
        WHERE property_type = 'Residential Condo & Other'
          AND transaction_type = 'For Sale'
          AND standard_status = 'Closed'
          AND close_date > NOW() - INTERVAL '365 days'
        GROUP BY building_id HAVING COUNT(*) >= 3
      )
    ORDER BY close_date DESC
    LIMIT 1
  `
  const r = await c.query(q)
  return r.rows[0] || null
}

async function findCondoWithoutTax(c) {
  const q = `
    SELECT id, listing_key, building_id, bedrooms_total, bathrooms_total_integer,
           living_area_range, tax_annual_amount, close_date
    FROM mls_listings
    WHERE property_type = 'Residential Condo & Other'
      AND transaction_type = 'For Sale'
      AND standard_status = 'Closed'
      AND building_id IS NOT NULL
      AND (tax_annual_amount IS NULL OR tax_annual_amount = 0)
      AND close_date > NOW() - INTERVAL '365 days'
    ORDER BY close_date DESC
    LIMIT 1
  `
  const r = await c.query(q)
  return r.rows[0] || null
}

async function findHomeWithTax(c) {
  const q = `
    SELECT id, listing_key, property_subtype, community_id, municipality_id,
           bedrooms_total, bathrooms_total_integer, living_area_range,
           tax_annual_amount, tax_year, close_price, unparsed_address
    FROM mls_listings
    WHERE property_type = 'Residential Freehold'
      AND transaction_type = 'For Sale'
      AND standard_status = 'Closed'
      AND community_id IS NOT NULL
      AND municipality_id IS NOT NULL
      AND tax_annual_amount IS NOT NULL AND tax_annual_amount > 0
      AND tax_year IS NOT NULL
      AND close_date > NOW() - INTERVAL '365 days'
      AND property_subtype IN ('Detached', 'Semi-Detached', 'Att/Row/Townhouse', 'Link')
    ORDER BY close_date DESC
    LIMIT 1
  `
  const r = await c.query(q)
  return r.rows[0] || null
}

function assertTiers(label, est, requireAll = true) {
  const issues = []
  if (!est) { issues.push(`${label}: NO estimate returned`); return issues }
  if (!est.tiers) { issues.push(`${label}: tiers UNDEFINED`); return issues }
  for (const slot of ['platinum', 'gold', 'silver', 'bronze']) {
    if (est.tiers[slot] == null && requireAll) {
      issues.push(`${label}: tiers.${slot} is null (this can be valid when the slot has no comps — soft fail)`)
    }
  }
  if (!est.bestGeoTier) issues.push(`${label}: bestGeoTier UNDEFINED`)
  return issues
}

function assertTaxMatch(label, est, requirePopulated) {
  const issues = []
  if (!est) return [`${label}: NO estimate`]
  if (requirePopulated) {
    if (!est.taxMatch) issues.push(`${label}: taxMatch UNDEFINED (expected populated with tax provided)`)
    else if (!est.taxMatch.comparablesCount || est.taxMatch.comparablesCount === 0)
      issues.push(`${label}: taxMatch.comparablesCount = 0 (expected > 0)`)
  } else {
    if (est.taxMatch) issues.push(`${label}: taxMatch POPULATED (expected undefined when no tax)`)
  }
  return issues
}

async function main() {
  // Dev server check
  if (!(await checkDevServer())) {
    console.error(`\n  ERROR: dev server not reachable at ${BASE}.`)
    console.error('  Start it first:')
    console.error('     npm run dev')
    console.error('  Then re-run this script. Ensure DEV_TENANT_DOMAIN=walliam.ca in .env.local.\n')
    process.exit(2)
  }

  const c = new Client(dbCfg())
  await c.connect()
  let subjectCondoTax, subjectCondoNoTax, subjectHome
  try {
    await c.query('BEGIN')
    // Large set-based scans across mls_listings (1.28M rows) exceed the
    // default 60s pool timeout (CLAUDE.md "SQL too large for Studio"). Disable
    // for this session — read-only inside BEGIN, no mutation possible.
    await c.query('SET LOCAL statement_timeout = 0')
    subjectCondoTax   = await findCondoWithTax(c)
    subjectCondoNoTax = await findCondoWithoutTax(c)
    subjectHome       = await findHomeWithTax(c)
    await c.query('ROLLBACK')
  } finally {
    await c.end()
  }

  if (!subjectCondoTax)    { console.error('No condo-with-tax subject found'); process.exit(1) }
  if (!subjectCondoNoTax)  { console.warn('No condo-without-tax subject found (skipping no-tax case)') }
  if (!subjectHome)        { console.error('No home-with-tax subject found'); process.exit(1) }

  console.log('=== C-ENHANCE-1-DATA VERIFY ===')
  console.log(`probe = ${PROBE}`)
  console.log('')

  // ── Case 1: CONDO + tax ──
  console.log(`CASE 1: condo WITH tax_annual_amount=${subjectCondoTax.tax_annual_amount} tax_year=${subjectCondoTax.tax_year}`)
  console.log(`  subject id=${subjectCondoTax.id}  listing_key=${subjectCondoTax.listing_key}`)
  console.log(`  building_id=${subjectCondoTax.building_id}  community_id=${subjectCondoTax.community_id}`)
  const r1 = await postProbe(subjectCondoTax.id, 'condo', 'page')
  const est1 = r1.estimate
  console.log(`  bestGeoTier=${est1?.bestGeoTier}  matchTier=${est1?.matchTier}  confidence=${est1?.confidence}`)
  console.log(`  tiers.platinum=${JSON.stringify(est1?.tiers?.platinum)}`)
  console.log(`  tiers.gold=${JSON.stringify(est1?.tiers?.gold)}`)
  console.log(`  tiers.silver=${JSON.stringify(est1?.tiers?.silver)}`)
  console.log(`  tiers.bronze=${JSON.stringify(est1?.tiers?.bronze)}`)
  console.log(`  taxMatch.count=${est1?.taxMatch?.count}  taxMatch.comparablesCount=${est1?.taxMatch?.comparablesCount}  taxMatch.bestGeoTier=${est1?.taxMatch?.bestGeoTier}`)
  const issues1 = [
    ...assertTiers('condo+tax', est1, false),
    ...assertTaxMatch('condo+tax', est1, true),
  ]
  console.log('')

  // ── Case 2: HOME + tax ──
  console.log(`CASE 2: home WITH tax_annual_amount=${subjectHome.tax_annual_amount} tax_year=${subjectHome.tax_year}`)
  console.log(`  subject id=${subjectHome.id}  listing_key=${subjectHome.listing_key}  subtype=${subjectHome.property_subtype}`)
  console.log(`  community_id=${subjectHome.community_id}  municipality_id=${subjectHome.municipality_id}`)
  const r2 = await postProbe(subjectHome.id, 'home', 'page')
  const est2 = r2.estimate
  console.log(`  bestGeoTier=${est2?.bestGeoTier}  matchTier=${est2?.matchTier}  confidence=${est2?.confidence}`)
  console.log(`  tiers.platinum=${JSON.stringify(est2?.tiers?.platinum)}`)
  console.log(`  tiers.gold=${JSON.stringify(est2?.tiers?.gold)}`)
  console.log(`  tiers.silver=${JSON.stringify(est2?.tiers?.silver)}`)
  console.log(`  tiers.bronze=${JSON.stringify(est2?.tiers?.bronze)}`)
  console.log(`  taxMatch.count=${est2?.taxMatch?.count}  taxMatch.comparablesCount=${est2?.taxMatch?.comparablesCount}  taxMatch.bestGeoTier=${est2?.taxMatch?.bestGeoTier}`)
  const issues2 = [
    ...assertTiers('home+tax', est2, false),
    ...assertTaxMatch('home+tax', est2, true),
  ]
  console.log('')

  // ── Case 3: CONDO without tax (graceful) ──
  let issues3 = []
  if (subjectCondoNoTax) {
    console.log(`CASE 3: condo WITHOUT tax_annual_amount (graceful path)`)
    console.log(`  subject id=${subjectCondoNoTax.id}  listing_key=${subjectCondoNoTax.listing_key}`)
    const r3 = await postProbe(subjectCondoNoTax.id, 'condo', 'page')
    const est3 = r3.estimate
    console.log(`  bestGeoTier=${est3?.bestGeoTier}  matchTier=${est3?.matchTier}  confidence=${est3?.confidence}`)
    console.log(`  tiers.platinum=${JSON.stringify(est3?.tiers?.platinum)}`)
    console.log(`  taxMatch=${est3?.taxMatch == null ? 'null/undefined (expected — no tax)' : JSON.stringify(est3?.taxMatch).slice(0, 80) + '...'}`)
    console.log(`  estimatedPrice=${est3?.estimatedPrice}  comparablesCount=${est3?.comparablesCount}`)
    issues3 = [
      ...assertTiers('condo-no-tax', est3, false),
      ...assertTaxMatch('condo-no-tax', est3, false),
    ]
    console.log('')
  }

  // ── Verdict ──
  console.log('=== ASSERTIONS ===')
  const allIssues = [...issues1, ...issues2, ...issues3]
  if (allIssues.length === 0) console.log('  (all clean)')
  else for (const i of allIssues) console.log('  WARN  ' + i)

  const fatal = allIssues.filter(i =>
    i.includes('UNDEFINED') ||
    i.includes('NO estimate') ||
    i.includes('expected populated') ||
    i.includes('comparablesCount = 0') ||
    i.includes('expected undefined when no tax'))
  console.log('')
  console.log('FATAL issues: ' + (fatal.length === 0 ? '(none)' : fatal.length))

  if (fatal.length > 0) process.exit(1)
  process.exit(0)
}

main().catch(e => { console.error('FATAL', e); process.exit(2) })
