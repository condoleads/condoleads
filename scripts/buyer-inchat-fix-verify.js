// scripts/buyer-inchat-fix-verify.js
// W-CHARLIE-BUYER-INCHAT-FIX VERIFY — REAL DOM via Playwright (NOT import-only).
//
// Mounts /test-comparable-tile-probe in headless Chromium and reads
// the live DOM. Asserts:
//   1. BUYER snake_case fixture renders populated tile (address, price,
//      beds, bath visible) — the bug fix.
//   2. SELLER camelCase fixture renders populated tile — no-regression.
//   3. HOLLOW fixture (no fields) renders '—' fallbacks — legitimate
//      empty path still works.
// Plus DB+source diff checks for the empty-block gate (Step 2):
//   4. useCharlie push site refuses empty arrays.
//   5. ResultsPanel render gate suppresses zero-length blocks.
// Plus byte-unchanged proofs for email + lead-page:
//   6. lib/email/charlie-plan-email-html.ts unchanged this commit.
//   7. components/admin-homes/lead-workbench/PlanRenderer.tsx unchanged.
//   8. app/api/charlie/plan-email/route.ts unchanged.
//
// Output: recon/buyer-inchat-fix-verify.txt + screenshots.

const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const BASE = process.env.LOCAL_BASE || 'http://localhost:3004'
const OUT_DIR = path.resolve(__dirname, '..', 'recon')
const SHOT_DIR = path.join(OUT_DIR, 'buyer-inchat-fix-screenshots')
const REPORT = path.join(OUT_DIR, 'buyer-inchat-fix-verify.txt')
fs.mkdirSync(OUT_DIR, { recursive: true })
fs.mkdirSync(SHOT_DIR, { recursive: true })
fs.writeFileSync(REPORT, '')
const log = (m) => { console.log(m); fs.appendFileSync(REPORT, m + '\n') }
const hr = () => log('─'.repeat(76))

let fail = 0
function expect(label, cond, evidence) {
  if (!cond) fail++
  log(`${cond ? 'PASS' : 'FAIL'}  ${label}${evidence ? '\n        → ' + evidence : ''}`)
}

;(async () => {
  log('W-CHARLIE-BUYER-INCHAT-FIX VERIFY — ' + new Date().toISOString())
  log('local base: ' + BASE)
  hr()

  // Dev server health — fail loudly if not serving (do NOT silently
  // substitute import-only verify; that's the previous chunk's mistake).
  try {
    const r = await fetch(`${BASE}/api/walliam/tenant-config`, {
      headers: { 'x-tenant-id': 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9' },
    })
    if (r.status !== 200) throw new Error(`tenant-config returned ${r.status}`)
    log(`dev server API probe: 200 (tenant-config served).`)
  } catch (e) {
    log('FATAL  dev server NOT serving API routes — restart it before re-running this verify.')
    log('       error: ' + e.message)
    process.exit(2)
  }

  // Launch Playwright + open the probe page
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 1600 } })
  const page = await ctx.newPage()
  // Surface RUNTIME errors during render (would flag a crash in the
  // dual-shape edit). Ignore network failures from fixture img URLs
  // (example.invalid doesn't resolve — that's the fixture, not the
  // component code).
  const consoleErrors = []
  page.on('console', msg => {
    if (msg.type() !== 'error') return
    const t = msg.text()
    if (/ERR_NAME_NOT_RESOLVED|net::|Failed to load resource/i.test(t)) return
    consoleErrors.push(t)
  })
  page.on('pageerror', err => consoleErrors.push('pageerror: ' + (err.stack || err.message || String(err))))

  await page.goto(`${BASE}/test-comparable-tile-probe`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForSelector('[data-testid="seller-section"]', { timeout: 30000 })

  // Screenshot the full probe page
  const shotAll = path.join(SHOT_DIR, '1-all-fixtures.png')
  await page.screenshot({ path: shotAll, fullPage: true })
  log(`screenshot: ${shotAll}`)

  // Extract VISIBLE TEXT (not raw HTML) per section. innerText strips
  // React's text-node split markers (`<!-- -->` between `{4}` and
  // `' bed'`) — what the user actually sees, no SSR-internal noise.
  async function sectionText(selector) {
    return await page.locator(selector).innerText()
  }
  async function sectionDom(selector) {
    return await page.locator(selector).innerHTML()
  }
  const sellerText = await sectionText('[data-testid="seller-section"]')
  const buyerText  = await sectionText('[data-testid="buyer-section"]')
  const hollowText = await sectionText('[data-testid="hollow-section"]')
  const sellerHtml = await sectionDom('[data-testid="seller-section"]')
  const buyerHtml  = await sectionDom('[data-testid="buyer-section"]')
  const hollowHtml = await sectionDom('[data-testid="hollow-section"]')

  hr()
  log('SECTION 1 — BUYER snake_case fixture (THE FIX)')
  // Per BUYER_FIXTURE in app/test-comparable-tile-probe/page.tsx:
  //   address '101 Buyer Snake St', close_price 705000, beds 4, bath 3, dom 22
  expect('B1: buyer tile renders address "101 Buyer Snake St" (NOT —)',
    buyerText.includes('101 Buyer Snake St'),
    'innerText: ' + JSON.stringify(buyerText.slice(0, 200)))
  expect('B2: buyer tile renders price "$705,000" (NOT —)',
    buyerText.includes('$705,000'))
  expect('B3: buyer tile renders "4 bed" (visible text)',
    buyerText.includes('4 bed'))
  expect('B4: buyer tile renders "3 bath" (visible text)',
    buyerText.includes('3 bath'))
  expect('B5: buyer tile renders "22d DOM" (visible text)',
    buyerText.includes('22d DOM'))
  expect('B6: buyer tile photo present (img with media_url from snake_case media[0])',
    /buyer-photo\.jpg/.test(buyerHtml))
  expect('B7: buyer tile does NOT render placeholder house emoji (real photo wins)',
    !/🏠/.test(buyerText))

  hr()
  log('SECTION 2 — SELLER camelCase fixture (NO-REGRESSION)')
  expect('S1: seller tile renders address "888 Seller Cam St"',
    sellerText.includes('888 Seller Cam St'))
  expect('S2: seller tile renders price "$870,000"',
    sellerText.includes('$870,000'))
  expect('S3: seller tile renders "3 bed" (visible text)',
    sellerText.includes('3 bed'))
  expect('S4: seller tile renders "2 bath" (visible text)',
    sellerText.includes('2 bath'))
  expect('S5: seller tile renders "18d DOM" (visible text)',
    sellerText.includes('18d DOM'))
  expect('S6: seller tile photo present (camelCase mediaUrl)',
    /seller-photo\.jpg/.test(sellerHtml))

  hr()
  log('SECTION 3 — HOLLOW fixture (legitimate-empty path)')
  expect('H1: hollow tile renders address fallback "—"',
    /—/.test(hollowHtml),
    'em-dash present')
  expect('H2: hollow tile does NOT render any concrete address',
    !/Buyer Snake|Seller Cam/.test(hollowHtml),
    'no cross-contamination from other fixtures')

  hr()
  log('SECTION 4 — runtime errors during render')
  expect('R1: no console.error / pageerror during probe page render',
    consoleErrors.length === 0,
    consoleErrors.length === 0 ? 'clean' : 'errors: ' + consoleErrors.join(' | '))

  await browser.close()

  hr()
  log('SECTION 5 — Empty-block gate (source asserts on the two gates)')
  const useCharlie = fs.readFileSync(path.resolve(__dirname, '..', 'app/charlie/hooks/useCharlie.ts'), 'utf8')
  const resultsPanel = fs.readFileSync(path.resolve(__dirname, '..', 'app/charlie/components/ResultsPanel.tsx'), 'utf8')
  expect('G1: useCharlie push site requires data.listings.length > 0',
    /tool === 'get_comparables' && Array\.isArray\(data\.listings\) && data\.listings\.length > 0/.test(useCharlie))
  expect('G2: ResultsPanel comparables-render gate suppresses zero-length',
    /block\.type === 'comparables'[\s\S]+?block\.listings\.length === 0\) return null/.test(resultsPanel))

  hr()
  log('SECTION 6 — Byte-unchanged proofs (email + lead-page must NOT have moved this commit)')
  function gitUnchangedFromHead(filePath) {
    try {
      execSync(`git diff --quiet HEAD -- "${filePath}"`, { stdio: 'pipe' })
      return true
    } catch (e) {
      return false
    }
  }
  expect('U1: lib/email/charlie-plan-email-html.ts unchanged this commit',
    gitUnchangedFromHead('lib/email/charlie-plan-email-html.ts'))
  expect('U2: components/admin-homes/lead-workbench/PlanRenderer.tsx unchanged this commit',
    gitUnchangedFromHead('components/admin-homes/lead-workbench/PlanRenderer.tsx'))
  expect('U3: app/api/charlie/plan-email/route.ts unchanged this commit',
    gitUnchangedFromHead('app/api/charlie/plan-email/route.ts'))

  hr()
  log(`SUMMARY: ${fail === 0 ? 'ALL PASS' : fail + ' FAIL'}`)
  log(`screenshots: ${SHOT_DIR}/1-all-fixtures.png`)
  process.exit(fail === 0 ? 0 : 1)
})().catch(e => { log('UNHANDLED: ' + (e?.stack || e)); process.exit(2) })
