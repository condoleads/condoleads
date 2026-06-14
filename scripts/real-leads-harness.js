// scripts/real-leads-harness.js
// W-CHARLIE-CONVERGENCE — REAL-RENDER HARNESS 2 (Lead detail page)
//
// Drives the live walliam.ca lead detail page for lead 63b48f13.
// Operator's URL: walliam.ca/admin-homes/leads/63b48f13-8a03-46be-b4ce-91007da0794a
// This route requires admin auth (resolveAdminHomesUser + can('lead.read')).
// The harness has no credentials and is read-only against prod — it will be
// redirected to /login. The diagnosis comes from (a) the auth-blocked
// behavior captured, (b) source analysis of which route renders what.
//
// Also probes /dashboard/leads/[id]/ — the OTHER lead detail route (the one
// CV-1 actually modified).
//
// Output: recon/REAL-LEADS.txt + recon/real-leads-screenshots/*.png

const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const BASE = process.env.REAL_LEADS_BASE || 'https://www.walliam.ca'
const LEAD_ID = '63b48f13-8a03-46be-b4ce-91007da0794a'
const OUT_DIR = path.resolve(__dirname, '..', 'recon')
const SHOT_DIR = path.join(OUT_DIR, 'real-leads-screenshots')
const REPORT = path.join(OUT_DIR, 'REAL-LEADS.txt')

const SECTIONS = [
  { key: 'plan_summary', label: 'Plan Summary (Seller Strategy text)', probe: 'Seller Strategy' },
  { key: 'seller_profile', label: 'Seller Profile', probe: 'Seller Profile' },
  { key: 'price_card', label: 'Property Estimate price card', probe: 'Estimated value' },
  { key: 'tier_rail', label: '4-row tier rail (Confidence by Area)', probe: 'Confidence by Area' },
  { key: 'market_intel', label: 'Market Intelligence', probe: 'Market Intelligence' },
  { key: 'price_by_home_type', label: 'Price by Home Type', probe: 'Price by Home Type' },
  { key: 'offer_intel', label: 'Offer Intelligence', probe: 'Offer Intelligence' },
  { key: 'best_time', label: 'Best Time', probe: 'Best Time' },
  { key: 'comparable_sold', label: 'Comparable Sold / Comparable Sales', probe: 'Comparable' },
  { key: 'tax_matched', label: 'Tax-Matched', probe: 'Tax-Matched' },
  { key: 'competing', label: 'Competing For Sale', probe: 'Competing' },
  { key: 'pricing_risk', label: 'Pricing Strategy & Risk', probe: 'Pricing Strategy' },
  { key: 'ai_disclaimer', label: 'AI Disclaimer', probe: 'AI Disclaimer' },
  { key: 'brand_chrome', label: 'Brand chrome / agent contact', probe: 'WALLiam' },
]

const log = (m) => { console.log(m); fs.appendFileSync(REPORT, m + '\n') }
const hr = () => log('─'.repeat(76))

async function probeRoute(page, urlPath, tag) {
  hr(); log(`PROBE: ${urlPath}`); hr()
  const url = BASE + urlPath
  log(`navigating to: ${url}`)
  let status = 'unknown'
  page.once('response', (r) => {
    if (r.url() === url) status = r.status()
  })
  let finalUrl = url
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
    status = resp ? resp.status() : status
    finalUrl = page.url()
  } catch (e) {
    log(`navigation error: ${e.message?.slice(0,160)}`)
  }
  await page.waitForTimeout(2000)
  log(`first response status: ${status}`)
  log(`final URL (after redirects): ${finalUrl}`)
  log(`title: ${await page.title()}`)

  await page.screenshot({ path: path.join(SHOT_DIR, `${tag}-final.png`), fullPage: true })
  log(`screenshot: ${tag}-final.png`)

  // body capture
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 2500))
  const bodyTextSnip = bodyText.replace(/\s+/g, ' ').slice(0, 600)
  log(`body innerText preview: "${bodyTextSnip}"`)

  // section inventory in real DOM
  log('')
  log('Section inventory (live DOM):')
  log('-'.repeat(76))
  log('SECTION'.padEnd(40) + 'PROBE'.padEnd(22) + 'STATUS')
  log('-'.repeat(76))
  const inv = []
  for (const s of SECTIONS) {
    const count = await page.locator(`text=${s.probe}`).count()
    const status = count > 0 ? 'PRESENT' : 'ABSENT '
    inv.push({ ...s, present: count > 0, count })
    log(`${s.label.padEnd(40).slice(0,40)}${s.probe.padEnd(22).slice(0,22)}${status} (n=${count})`)
  }
  log('-'.repeat(76))
  const present = inv.filter(x => x.present).length
  log(`PRESENT: ${present}, ABSENT: ${inv.length - present}`)

  // CharlieLeadEstimate mounted?
  const charlieMount = await page.evaluate(() => {
    // CharlieLeadEstimate root has data attributes? Let's look for the
    // "Property Estimate" header (its first rendered chunk) inside any
    // element that also has Confidence by Area + Comparable Sold.
    const all = document.body.innerHTML
    return {
      hasPropertyEstimate: /Estimated value/.test(all),
      hasConfidenceByArea: /Confidence by Area/.test(all),
      hasComparableSold: /Comparable Sold/.test(all),
      hasTaxMatched: /Tax-Matched/.test(all),
      hasCompeting: /Competing For Sale/.test(all),
      hasSellerStrategy: /Seller Strategy/.test(all),
      hasPricingRisk: /Pricing Strategy/.test(all),
    }
  })
  log('')
  log('CharlieLeadEstimate-mount probe (canonical-set markers in body):')
  for (const [k, v] of Object.entries(charlieMount)) log(`  ${k.padEnd(28)} ${v}`)
  const allMarkers = Object.values(charlieMount).every(Boolean)
  log(`Verdict: CharlieLeadEstimate mounted? ${allMarkers ? 'YES (all 7 markers present)' : 'NO (missing one or more canonical markers)'}`)

  return { url, finalUrl, status, present, total: inv.length, charlieMount, allMarkers }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.mkdirSync(SHOT_DIR, { recursive: true })
  fs.writeFileSync(REPORT, '')

  log('W-CHARLIE-CONVERGENCE — REAL-RENDER HARNESS 2 (Lead detail page)')
  log(`run: ${new Date().toISOString()}`)
  log(`base: ${BASE}`)
  log(`lead: ${LEAD_ID}`)
  log(`harness: Playwright + chromium (headless), real-DOM observation`)
  log('')
  log('NOTE: The operator-cited URL /admin-homes/leads/<id>/ requires admin')
  log('auth (resolveAdminHomesUser + can("lead.read")). This harness has no')
  log('credentials. It will capture the unauth-redirect state honestly.')
  log('Diagnosis combines: (1) what the unauth probe reveals about routing,')
  log('(2) source analysis of which route renders what, citing files/lines.')
  log('')

  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 2400 },
    deviceScaleFactor: 1,
  })
  const page = await ctx.newPage()

  hr(); log('STEP 0 — sanity probe: are the two routes distinct?'); hr()
  log('Routing claim (from source):')
  log('  /admin-homes/leads/[id]/page.tsx  → LeadWorkbenchClient (admin workbench)')
  log('     → tabs: overview / plan / estimator / estimator_q / credits /')
  log('             activity / emails / vip / notes')
  log('     → Plan tab uses PlanTab = components/admin-homes/lead-workbench/PlanRenderer.tsx')
  log('     → PlanRenderer renders FROM plan_data JSONB only:')
  log('         "F-W4B-PLAN-DATA-RENDER-SUBSET: comparables, blocks,')
  log('          sellerEstimate, vipCreditUsed, summary are API-time-only')
  log('          (not in plan_data) -- unrenderable." (PlanRenderer.tsx:14)')
  log('     → CV-1 did NOT touch this file. Last commit: 60a08c6 "W4b: Plan')
  log('       tab renderer at email-template richness" (well before CV-1).')
  log('')
  log('  /dashboard/leads/[id]/page.tsx    → LeadDetailClient (dashboard view)')
  log('     → LeadDetailClient imports CharlieLeadEstimate (CV-1 rewrite)')
  log('     → CharlieLeadEstimate (CV-1, commit 6935f87) adds all 14')
  log('       canonical sections fed by buildSellerEstimateView')
  log('')
  log('These are TWO DIFFERENT pages. CV-1 modified the dashboard route.')
  log('The operator-cited URL is the admin-homes route.')
  log('')

  // Probe 1: the admin-homes URL the operator cited
  const r1 = await probeRoute(page, `/admin-homes/leads/${LEAD_ID}`, '01-admin-homes')

  // Probe 2: the dashboard route CV-1 actually modified
  const r2 = await probeRoute(page, `/dashboard/leads/${LEAD_ID}`, '02-dashboard')

  // Probe 3: admin-homes index — to verify auth wall behavior
  const r3 = await probeRoute(page, `/admin-homes`, '03-admin-homes-index')

  await browser.close()

  hr(); log('SUMMARY'); hr()
  log(`/admin-homes/leads/${LEAD_ID}:  ${r1.present}/${r1.total} sections present  (final=${r1.finalUrl})`)
  log(`/dashboard/leads/${LEAD_ID}:    ${r2.present}/${r2.total} sections present  (final=${r2.finalUrl})`)
  log(`/admin-homes (index):           status=${r3.status}  final=${r3.finalUrl}`)
}

main().catch(e => {
  log(`HARNESS CRASH: ${e.stack || e.message}`)
  process.exit(1)
})
