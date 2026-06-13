// scripts/smoke-charlie-email-fixture.js
//
// C-CHARLIE-FOLLOWUP B(i) (2026-06-13) — fixture-driven plan-email smoke.
// Closes the gap the 49/49 static C-ENHANCE-2-RENDER test missed: the prior
// test verified the render code was wired right by regex; this one actually
// INVOKES buildRichPlanEmail with a real seller fixture and asserts the
// returned HTML carries tier chips + tax-match + the baseline sections.
//
// Pipeline:
//   1. SAVEPOINT-isolated pg read of the verified-real post-3d9ac08 seller
//      lead 63b48f13-8a03-46be-b4ce-91007da0794a → captures the live
//      plan_data.sellerEstimate shape into scripts-output/c-followup-
//      fixture.json (if not already captured by _c-followup-read-fixture.js).
//   2. POST that fixture to the test-only probe endpoint
//      /api/charlie/test-render-plan-email-probe which imports the SAME exported
//      buildRichPlanEmail the production POST handler uses.
//   3. ASSERT each baseline + new section in the returned HTML, with named
//      PASS/FAIL per assertion.
//
// Requires:
//   - dev server reachable at DEV_BASE_URL (default http://localhost:3000,
//     fall back to :3001) — start with `npm run dev` if not running.
//   - DEV_TENANT_DOMAIN=walliam.ca in .env.local (already configured per
//     CLAUDE.md).

require('dotenv').config({ path: '.env.local' })
const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

const LEAD_ID = '63b48f13-8a03-46be-b4ce-91007da0794a'
const FIXTURE_PATH = path.resolve(__dirname, '..', 'scripts-output', 'c-followup-fixture.json')
const REPORT_PATH = path.resolve(__dirname, '..', 'scripts-output', 'smoke-charlie-email-fixture.txt')

function dbCfg() {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.DIRECT_URL
  if (!url) throw new Error('DATABASE_URL not in env')
  return { connectionString: url, ssl: { rejectUnauthorized: false } }
}

async function readFixtureLive() {
  const c = new Client(dbCfg())
  await c.connect()
  let pd, meta
  try {
    await c.query('BEGIN')
    await c.query('SET LOCAL statement_timeout = 0')
    const r = await c.query(`
      SELECT plan_data, source, intent, geo_name, contact_name, created_at
      FROM leads WHERE id = $1`, [LEAD_ID])
    if (!r.rows[0]) throw new Error('lead 63b48f13... not found — has it been deleted?')
    pd = r.rows[0].plan_data
    meta = {
      source: r.rows[0].source,
      intent: r.rows[0].intent,
      geo_name: r.rows[0].geo_name,
      contact_name: r.rows[0].contact_name,
      created_at: r.rows[0].created_at.toISOString(),
    }
    await c.query('ROLLBACK')
  } finally {
    await c.end()
  }
  return { pd, meta }
}

async function getServerBase() {
  const candidates = [process.env.DEV_BASE_URL, 'http://localhost:3000', 'http://localhost:3001'].filter(Boolean)
  for (const b of candidates) {
    try {
      const r = await fetch(b, { method: 'HEAD' })
      if (r.status < 500) return b
    } catch {}
  }
  return null
}

async function postProbe(base, fixture) {
  const res = await fetch(`${base}/api/charlie/test-render-plan-email-probe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fixture),
  })
  const j = await res.json()
  if (!res.ok || !j.ok) throw new Error('probe error: ' + (j.error || res.statusText))
  return j.html
}

const out = []
function log(line) { out.push(line); console.log(line) }

async function main() {
  log('=== C-CHARLIE-FOLLOWUP B(i) SMOKE ===')
  log('fixture lead: ' + LEAD_ID)

  // 1. Load fixture
  let fixture
  if (fs.existsSync(FIXTURE_PATH)) {
    fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'))
    log('loaded cached fixture: ' + FIXTURE_PATH + '  (' + fs.statSync(FIXTURE_PATH).size + ' bytes)')
  } else {
    log('cache miss, reading live (SAVEPOINT-isolated)...')
    const { pd, meta } = await readFixtureLive()
    if (!pd?.sellerEstimate) throw new Error('lead has no plan_data.sellerEstimate — fixture impossible')
    fixture = {
      _meta: { sourceLeadId: LEAD_ID, sourceLeadCreatedAt: meta.created_at, sourceMeta: meta },
      sellerEstimate: pd.sellerEstimate,
      planType: 'seller',
      plan: pd.plan || { goal: 'Top dollar', timeline: '3-6 months' },
      analytics: pd.analytics || null,
      listings: [],
      comparables: [],
      vipCreditUsed: false,
      vipCreditPlansUsed: 0,
      vipCreditTotal: 1,
      blocks: [],
    }
    fs.mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true })
    fs.writeFileSync(FIXTURE_PATH, JSON.stringify(fixture, null, 2))
    log('wrote fixture cache: ' + FIXTURE_PATH)
  }

  const se = fixture.sellerEstimate
  log('')
  log('fixture sellerEstimate shape:')
  log('  path                   = ' + se.path)
  log('  intent                 = ' + se.intent)
  log('  subjectAddress         = ' + se.subjectAddress)
  log('  comparables.length     = ' + (se.comparables || []).length)
  log('  competingListings.len  = ' + (se.competingListings || []).length)
  log('  estimate.bestGeoTier   = ' + se.estimate?.bestGeoTier)
  log('  estimate.taxMatch.count= ' + se.estimate?.taxMatch?.count)
  log('  estimate.taxMatch.cmps = ' + (se.estimate?.taxMatch?.comparables || []).length)
  log('  estimate.tiers slots   = ' + (se.estimate?.tiers ? Object.keys(se.estimate.tiers).join(',') : '(none)'))

  // 2. POST to probe
  const base = await getServerBase()
  if (!base) {
    log('')
    log('ERROR: no dev server reachable on :3000 or :3001. Start with `npm run dev`.')
    process.exit(2)
  }
  log('')
  log('dev server: ' + base)
  const html = await postProbe(base, fixture)
  log('returned HTML length = ' + html.length + ' bytes')

  // 3. Assertions
  const expectedTierColors = ['#10b981', '#f59e0b', '#64748b', '#c2410c']
  const fixtureBest = se.estimate?.bestGeoTier
  const fixtureBestColor = { platinum: '#10b981', gold: '#f59e0b', silver: '#64748b', bronze: '#c2410c' }[fixtureBest] || null

  const checks = []
  function check(name, ok, detail) { checks.push([name, !!ok, detail || '']) }

  // ── NEW C-ENHANCE-2-RENDER additions ──────────────────────────────
  check('tier chip <div> present (anchor tier color in HTML)',
    fixtureBestColor && html.includes('background:' + fixtureBestColor),
    'expected hex=' + fixtureBestColor)
  check('tier chip emoji marker present (◆ or ●)',
    html.includes('◆') || html.includes('●'))
  check('Tax-Matched (N) heading present',
    /Tax-Matched\s*\(\d+\)/.test(html),
    'taxComps.length=' + (se.estimate?.taxMatch?.comparables || []).length)
  check('Tax-matched estimate inline pill present',
    /Tax-matched estimate/.test(html))

  // ── BASELINE preservation (Charlie sections that existed pre-3d9ac08) ─
  check('Comparable Sold section header present',
    /Comparable Sold\s*\(\d+\)/.test(html),
    'sellerComps=' + (se.comparables || []).length)
  check('Competing For Sale section header present',
    /Competing For Sale\s*\(\d+\)/.test(html),
    'competing=' + (se.competingListings || []).length)
  check('Plan card "Your Seller Strategy" label present',
    /Your Seller Strategy/.test(html))
  check('AI Disclaimer block present',
    /AI Disclaimer/.test(html))
  check('Plan-card Profile section present',
    /Your Profile/.test(html))
  check('Plan-card Market Snapshot section present',
    /Market Snapshot/.test(html))
  check('Open WALLiam CTA present',
    /Open WALLiam|Open\s*\$\{brandName\}|>\s*Open\s/.test(html))

  // ── Pricing-by-type table — only present when analytics has subtype_breakdown ─
  const analyticsHasSubtype = !!(fixture.analytics && fixture.analytics.subtype_breakdown && Object.keys(fixture.analytics.subtype_breakdown).length > 0)
  if (analyticsHasSubtype) {
    check('Price by Home Type table present (analytics.subtype_breakdown shipped)',
      /Price by Home Type/.test(html))
  } else {
    log('  NOTE: fixture has no analytics.subtype_breakdown — Price-by-Home-Type assertion skipped (consistent with the production behavior of the test lead)')
  }

  // ── Anti-regression: NO duplicate sections ─────────────────────────
  function countOccurrences(re) {
    let m, n = 0
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
    while ((m = g.exec(html)) !== null) n++
    return n
  }
  const compSoldCount = countOccurrences(/Comparable Sold\s*\(/g)
  check('Single "Comparable Sold" section (no dedup regression)',
    compSoldCount === 1,
    'occurrences=' + compSoldCount)
  const competingCount = countOccurrences(/Competing For Sale\s*\(/g)
  check('Single "Competing For Sale" section (no dedup regression)',
    competingCount === 1,
    'occurrences=' + competingCount)

  // ── No estimator-voice strings ────────────────────────────────────
  check('Zero "Geographic Confidence Spread" string',
    !/Geographic Confidence Spread/.test(html))
  check('Zero "Tax-Matched Comparables" string (estimator wording)',
    !/Tax-Matched Comparables/.test(html))
  check('Zero "Estimator working document" string',
    !/Estimator working document/.test(html))
  check('Zero "working document" string anywhere',
    !/working document/i.test(html))

  // ── tax-match comp links go to walliam.ca/property hrefs ───────────
  check('At least one walliam.ca href in HTML',
    /href="https:\/\/walliam\.ca\//.test(html))
  check('Zero condoleads.ca href leak',
    !/https:\/\/(www\.)?condoleads\.ca/.test(html))

  // Print + report
  log('')
  log('=== ASSERTIONS ===')
  let allPass = true
  for (const [name, ok, detail] of checks) {
    log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? ' [' + detail + ']' : ''))
    if (!ok) allPass = false
  }
  log('')
  log('OVERALL: ' + (allPass ? 'PASS' : 'FAIL'))

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true })
  fs.writeFileSync(REPORT_PATH, out.join('\n') + '\n')
  log('report written: ' + REPORT_PATH)

  process.exit(allPass ? 0 : 1)
}

main().catch(e => {
  console.error('FATAL', e)
  out.push('FATAL ' + (e?.message || String(e)))
  try { fs.writeFileSync(REPORT_PATH, out.join('\n') + '\n') } catch {}
  process.exit(2)
})
