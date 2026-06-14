// scripts/charlie-finetune-fix-verify.js
// W-CHARLIE-FINETUNE-FIX — real-rendered-output verify (NOT source-grep).
// renderToStaticMarkup against REAL leads (SAVEPOINT-isolated DB read).
// Asserts:
//   ITEM 1 — every email comp/tax/competing href is the descriptive
//            walliam.ca slug (NOT bare-MLS); zero bare-MLS hrefs.
//   ITEM 2 — lead-page CompRow tiles carry <a href> with the descriptive
//            slug across sold/tax/competing.
//   ITEM 3 — Tax-Match Confidence rail PRESENT (lead + email) for the
//            Silver-anchored 63b48f13, ABSENT (no fake tiers) for the
//            0-tax-comp 1b2a5b50.
//   REGRESSION — geo tier rail unchanged; existing surface byte-counts
//            stable; no condoleads.ca leak; no undefined/NaN/$0.

require('tsx/cjs')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { Pool } = require('pg')
require('dotenv').config({ path: '.env.local' })
const fs = require('fs')
const path = require('path')

const OUT = path.resolve(__dirname, '..', 'recon', 'W-CHARLIE-FINETUNE-FIX-VERIFY.txt')
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, '')
const log = (m) => { console.log(m); fs.appendFileSync(OUT, m + '\n') }
const hr = () => log('─'.repeat(76))

const { buildRichPlanEmail } = require('../lib/email/charlie-plan-email-html.ts')
const { buildPropertySlug } = require('../lib/utils/property-slug.ts')

let totalFail = 0
function expect(label, cond, evidence) {
  if (!cond) totalFail++
  log(`${cond ? 'PASS' : 'FAIL'}  ${label}${evidence ? '  → ' + evidence : ''}`)
}

function renderEmail(lead) {
  const pd = lead.plan_data || {}
  return buildRichPlanEmail({
    userName: lead.contact_name || 'there',
    userEmail: lead.contact_email || 'test@test.com',
    planType: pd.planType,
    plan: pd.plan,
    analytics: pd.analytics,
    listings: [], agent: null,
    geoName: pd.plan?.geoName || null,
    comparables: [],
    sellerEstimate: pd.sellerEstimate || null,
    vipCreditUsed: false, vipCreditPlansUsed: 0, vipCreditTotal: 1,
    blocks: [],
    brandName: 'WALLiam', domain: 'walliam.ca',
    baseUrl: 'https://www.walliam.ca', sourceUrl: null,
  })
}

;(async () => {
  log('W-CHARLIE-FINETUNE-FIX — real-rendered-output verify')
  log(`run: ${new Date().toISOString()}`)
  log('handle: react-dom/server.renderToStaticMarkup + tsx/cjs + live builder')
  log('')

  // Pull both leads + a condo seller probe
  const pool = new Pool({ connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL })
  const c = await pool.connect()
  let lead63, lead1b, condoLead
  try {
    await c.query('BEGIN'); await c.query('SAVEPOINT s1'); await c.query("SET LOCAL statement_timeout = 0")
    const r1 = await c.query(`SELECT id, contact_name, contact_email, intent, geo_name, source, source_url, created_at, plan_data, agent_id FROM leads WHERE id = '63b48f13-8a03-46be-b4ce-91007da0794a'`)
    lead63 = r1.rows[0]
    const r2 = await c.query(`SELECT id, contact_name, contact_email, intent, geo_name, source, source_url, created_at, plan_data, agent_id FROM leads WHERE id::text LIKE '1b2a5b50%' LIMIT 1`)
    lead1b = r2.rows[0]
    // Find a CONDO seller lead with sellerEstimate (for condo verification)
    const r3 = await c.query(`SELECT id, contact_name, contact_email, intent, plan_data, created_at FROM leads WHERE intent='seller' AND plan_data->'sellerEstimate'->>'path'='condo' AND plan_data->'sellerEstimate'->'estimate' IS NOT NULL ORDER BY created_at DESC LIMIT 1`)
    condoLead = r3.rows[0] || null
    await c.query('ROLLBACK')
  } finally { c.release(); await pool.end() }

  // Coerce dates → ISO strings (production server-component serialization)
  for (const l of [lead63, lead1b, condoLead].filter(Boolean)) {
    if (l.created_at instanceof Date) l.created_at = l.created_at.toISOString()
  }

  log(`real lead 1: ${lead63.id} (${lead63.contact_name}, intent=${lead63.intent})`)
  log(`real lead 2: ${lead1b.id} (${lead1b.contact_name}, intent=${lead1b.intent})`)
  log(`condo lead:  ${condoLead ? condoLead.id + ' (' + condoLead.contact_name + ')' : '(NONE FOUND — condo path UNVERIFIED)'}`)
  log('')

  // ── PART A — ITEM 1 (email href format on 63b48f13) ─────────────────
  hr(); log('PART A — ITEM 1: email href format (63b48f13, 10 tax + 5 comps + 2 competing)'); hr()
  const email63 = renderEmail(lead63)
  fs.writeFileSync(path.resolve(__dirname, '..', 'recon', 'finetune-fix-email-63b48f13.html'), email63)
  log(`rendered: ${email63.length} chars`)

  const allHrefs = [...email63.matchAll(/href="([^"]+)"/g)].map(m => m[1])
  const propertyHrefs = allHrefs.filter(h => /walliam\.ca\/[a-z0-9-]+/.test(h))
  const bareMlsHrefs = allHrefs.filter(h => /walliam\.ca\/[a-z][0-9]{6,}(?:\/|$)/.test(h) && !/[a-z]+-[a-z]+-[a-z][0-9]{6,}/.test(h))
  const descriptiveHrefs = allHrefs.filter(h => /walliam\.ca\/[a-z0-9]+-[a-z0-9-]+-[a-z][0-9]{6,}/.test(h))
  log(`total href count: ${allHrefs.length}`)
  log(`property-page hrefs: ${propertyHrefs.length}`)
  log(`descriptive-slug hrefs: ${descriptiveHrefs.length}`)
  log(`bare-MLS hrefs (the 404 pattern): ${bareMlsHrefs.length}`)
  expect('ITEM 1 — zero bare-MLS hrefs in email', bareMlsHrefs.length === 0, bareMlsHrefs.length > 0 ? 'leak: ' + bareMlsHrefs.slice(0,3).join(', ') : 'all property hrefs use descriptive slug')

  // Spot-check first comp slug equals helper output for the real comp
  const firstComp = lead63.plan_data.sellerEstimate.comparables[0]
  const expectedSlug = buildPropertySlug({
    listingKey: firstComp.listingKey,
    unparsedAddress: firstComp.unparsedAddress,
    propertySubtype: firstComp.propertySubtype,
    unitNumber: firstComp.unitNumber,
  })
  const expectedHref = `https://www.walliam.ca/${expectedSlug}`
  expect(`ITEM 1 — first comp href matches helper-built slug`, propertyHrefs.includes(expectedHref), `expected=${expectedHref}`)
  // Bare-MLS sanity: walliam.ca/{lowercaseMls} must NOT appear
  const bareMlsExact = `https://www.walliam.ca/${firstComp.listingKey.toLowerCase()}`
  expect(`ITEM 1 — first comp NOT bare-MLS (no ${bareMlsExact})`, !propertyHrefs.includes(bareMlsExact))

  // ── PART B — ITEM 2 + 3c (lead-page CompRow clickable + tax rail) ───
  hr(); log('PART B — ITEM 2 + 3c: lead page (63b48f13) via renderToStaticMarkup'); hr()
  const PlanTab = require('../components/admin-homes/lead-workbench/PlanRenderer.tsx').default
  const leadPageHtml = renderToStaticMarkup(React.createElement(PlanTab, {
    anchorLead: lead63,
    leadFamily: [lead63],
  }))
  fs.writeFileSync(path.resolve(__dirname, '..', 'recon', 'finetune-fix-leadpage-63b48f13.html'), leadPageHtml)
  log(`rendered: ${leadPageHtml.length} chars`)

  // CompRow clickability — every CompRow tile must be wrapped in <a href>.
  // CompRow tiles have a distinctive className. Count <a> with that class.
  const aHrefsLeadPage = [...leadPageHtml.matchAll(/<a [^>]*href="([^"]+)"[^>]*>/g)].map(m => m[1])
  const propertyAHrefs = aHrefsLeadPage.filter(h => /^\/[a-z0-9-]+-[a-z][0-9]{6,}$/.test(h))
  log(`<a> tag count: ${aHrefsLeadPage.length}`)
  log(`property-slug <a> hrefs: ${propertyAHrefs.length}`)
  log(`sample slug hrefs: ${propertyAHrefs.slice(0, 4).join(', ')}`)
  // 63b48f13 has 5 sold comps + 10 tax comps + 2 competing = up to 17 tiles
  expect('ITEM 2 — lead-page tiles wrapped in <a href> (>= 5 property slugs)', propertyAHrefs.length >= 5, `found ${propertyAHrefs.length}`)
  // Verify slug format matches helper
  const expectedLeadSlug = '/' + buildPropertySlug({
    listingKey: firstComp.listingKey,
    unparsedAddress: firstComp.unparsedAddress,
    path: 'home',
  })
  expect(`ITEM 2 — first comp href = ${expectedLeadSlug}`, propertyAHrefs.includes(expectedLeadSlug))

  // Tax-Match Confidence rail PRESENT
  const taxRailHits = (leadPageHtml.match(/Tax-Match Confidence/g) || []).length
  expect('ITEM 3c — Tax-Match Confidence rail PRESENT on lead page', taxRailHits >= 1, `count=${taxRailHits}`)
  // Anchor cell must show Silver as anchor (63b48f13 bestGeoTier = silver)
  // We expect at least one "Silver" + "Anchor" pair in close proximity
  const silverAnchorPair = /● Silver[\s\S]{0,400}Anchor|Anchor[\s\S]{0,400}● Silver/.test(leadPageHtml)
  expect('ITEM 3c — Silver tier is anchor on lead page', silverAnchorPair)
  // P/G/B should show "no data" (since they're null in taxMatch.tiers)
  const noDataHits = (leadPageHtml.match(/no data/g) || []).length
  // Geo rail can also show no-data; just verify >= 3 total (3 tax + possibly some geo)
  expect('ITEM 3c — "no data" entries for empty tax tiers (>= 3)', noDataHits >= 3, `count=${noDataHits}`)
  // Geo "Confidence by Area" rail still present (no regression)
  expect('REGRESSION — geo "Confidence by Area" rail still present', /Confidence by Area/.test(leadPageHtml))

  // ── PART C — ITEM 3d (email tax rail on 63b48f13) ───────────────────
  hr(); log('PART C — ITEM 3d: email Tax-Match Confidence rail (63b48f13)'); hr()
  const emailTaxRailHits = (email63.match(/Tax-Match Confidence/g) || []).length
  expect('ITEM 3d — Tax-Match Confidence rail PRESENT in email', emailTaxRailHits >= 1, `count=${emailTaxRailHits}`)
  expect('ITEM 3d — Silver anchor in email tax rail',
    /● Silver[\s\S]{0,300}Anchor|Anchor[\s\S]{0,300}● Silver/.test(email63))
  // Geo rail still present (no regression)
  expect('REGRESSION — email geo "Confidence by Area" still present', /Confidence by Area/.test(email63))

  // ── PART D — 1b2a5b50: NO fake tax rail (empty cascade) ─────────────
  hr(); log('PART D — 1b2a5b50 (0 tax-comps): NO fake tax rail; empty-state still shows'); hr()
  const email1b = renderEmail(lead1b)
  fs.writeFileSync(path.resolve(__dirname, '..', 'recon', 'finetune-fix-email-1b2a5b50.html'), email1b)
  log(`rendered email 1b: ${email1b.length} chars`)
  const taxRail1b = (email1b.match(/Tax-Match Confidence/g) || []).length
  expect('1b2a5b50 — email tax rail ABSENT (no fake tiers when taxMatch empty)', taxRail1b === 0, `count=${taxRail1b}`)
  expect('1b2a5b50 — empty-state pill STILL renders', /No tax-matched comparables for this property/.test(email1b))

  // Also lead page for 1b2a5b50
  const leadPage1b = renderToStaticMarkup(React.createElement(PlanTab, { anchorLead: lead1b, leadFamily: [lead1b] }))
  fs.writeFileSync(path.resolve(__dirname, '..', 'recon', 'finetune-fix-leadpage-1b2a5b50.html'), leadPage1b)
  const taxRailLead1b = (leadPage1b.match(/Tax-Match Confidence/g) || []).length
  expect('1b2a5b50 — lead-page tax rail ABSENT (no fake tiers)', taxRailLead1b === 0, `count=${taxRailLead1b}`)

  // ── PART E — regression: no condoleads.ca leak; no undefined/NaN/$0 ─
  hr(); log('PART E — regression: no condoleads.ca leak; no undefined/NaN/$0; populated path checks'); hr()
  for (const [tag, html] of [['email-63', email63], ['email-1b', email1b], ['lead-63', leadPageHtml], ['lead-1b', leadPage1b]]) {
    const condoLeak = (html.match(/condoleads\.ca/g) || []).length
    // "~$0" is the lead page's PRE-EXISTING "approximately zero" display
    // for Pricing Risk's concession dollar amount when concession % is
    // small enough to round to 0 (CharlieLeadEstimate.tsx:616, untouched
    // by this fix — CV-1 vintage). Exclude it from the bad-value sniff.
    const undef = (html.match(/undefined|NaN|(?<!~)\$0(?!\d)/g) || []).length
    expect(`${tag} — no condoleads.ca leak`, condoLeak === 0, condoLeak > 0 ? `count=${condoLeak}` : '')
    expect(`${tag} — no undefined/NaN/$0 (excluding ~$0 approximation marker)`, undef === 0, undef > 0 ? `count=${undef}` : '')
  }

  // populated-section preservation on 63b48f13 (Tax-Matched header + tiles + pill)
  expect('63b48f13 email — Tax-Matched (10) header preserved', /Tax-Matched \(10\)/.test(email63))
  expect('63b48f13 email — Tax-matched estimate pill preserved', /Tax-matched estimate/.test(email63))
  expect('63b48f13 email — Comparable Sold (5) preserved', /Comparable Sold \(5\)/.test(email63))
  expect('63b48f13 email — Competing For Sale preserved', /Competing For Sale/.test(email63))

  // ── PART F — Charlie ComparableCard/ActiveListingCard byte-identical (slug) ─
  hr(); log('PART F — Charlie tile slug helper byte-identical proof (regression)'); hr()
  // Re-run the slug parity proof; should be 16/16 PASS (already proven; re-asserted here)
  const before = require('child_process').execSync('node scripts/_slug-byte-test.js', { env: { ...process.env, TSX_TSCONFIG_PATH: './scripts/tsconfig.tsx-harness.json' }, encoding: 'utf8' })
  const passLine = before.split('\n').find(l => l.includes('BYTE-IDENTICAL PASS'))
  expect('Shared slug helper byte-identical across 16 fixtures', !!passLine, passLine || 'no PASS line')

  // ── PART G — condo path verification (flag if unverifiable) ─────────
  hr(); log('PART G — condo path (CONDO_LABEL_MAP, Platinum="Same Building")'); hr()
  if (!condoLead) {
    log('  no real condo Charlie seller lead with persisted sellerEstimate → CONDO PATH UNVERIFIED (flagged)')
  } else {
    const condoEmail = renderEmail(condoLead)
    fs.writeFileSync(path.resolve(__dirname, '..', 'recon', 'finetune-fix-email-condo.html'), condoEmail)
    log(`condo lead ${condoLead.id} rendered: ${condoEmail.length} chars`)
    // Condo path: helper picks condo branch; first comp slug should have -unit-{...}- segment
    const condoFirstComp = condoLead.plan_data.sellerEstimate.comparables?.[0]
    if (condoFirstComp) {
      const condoSlug = buildPropertySlug({
        listingKey: condoFirstComp.listingKey,
        unparsedAddress: condoFirstComp.unparsedAddress,
        propertySubtype: condoFirstComp.propertySubtype,
        unitNumber: condoFirstComp.unitNumber,
      })
      expect('condo — first comp slug includes "-unit-"', /-unit-/.test(condoSlug || ''), `slug=${condoSlug}`)
      const condoHref = `https://www.walliam.ca/${condoSlug}`
      expect('condo — email contains the descriptive condo href', condoEmail.includes(condoHref), `href=${condoHref}`)
    } else {
      log('  condo lead has no comparables — partial verification only')
    }
    // Tax rail: if taxMatch.tiers present, condo rail should render with CONDO_LABEL_MAP
    const condoTaxRail = (condoEmail.match(/Tax-Match Confidence/g) || []).length
    log(`  condo email tax rail count: ${condoTaxRail}`)
    if (condoTaxRail > 0) {
      // Condo Platinum sub = "Same Building" (vs home "Same street")
      expect('condo — tax rail uses CONDO_LABEL_MAP (Platinum="Same Building")',
        /Same Building/.test(condoEmail))
    } else {
      log('  condo lead has no taxMatch.tiers → tax rail correctly absent (no fake)')
    }
  }

  hr(); log('FINAL'); hr()
  log(`${totalFail === 0 ? 'PASS' : 'FAIL'}  ${totalFail} assertion failure(s) total`)
  log('')
  log('Files:')
  log(`  ${OUT}`)
  log('  recon/finetune-fix-email-63b48f13.html')
  log('  recon/finetune-fix-email-1b2a5b50.html')
  log('  recon/finetune-fix-leadpage-63b48f13.html')
  log('  recon/finetune-fix-leadpage-1b2a5b50.html')
  if (condoLead) log('  recon/finetune-fix-email-condo.html')
})().catch(e => { log('CRASH: ' + e.stack); process.exit(1) })
