// scripts/charlie-fix-step1-capture.js
// W-CHARLIE-FIX STEP 1 — root-cause tax=5000 vs tax=7500.
// Drives the live walliam.ca seller flow twice with identical address +
// subtype + beds/baths/livingArea, varying ONLY propertyTax. Captures the
// full /api/charlie/seller-estimate response JSON for each run side by
// side so we can see exactly what the matcher returns at each tax value.

const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const BASE = 'https://www.walliam.ca'
const OUT_DIR = path.resolve(__dirname, '..', 'recon')
const REPORT = path.join(OUT_DIR, 'CHARLIE-FIX-STEP1.txt')
fs.mkdirSync(OUT_DIR, { recursive: true })
fs.writeFileSync(REPORT, '')
const log = (m) => { console.log(m); fs.appendFileSync(REPORT, m + '\n') }

const INPUTS_COMMON = {
  streetNumber: '606', streetName: 'Aspen rd', city: 'Pickering',
  propertySubtype: 'Detached', bedrooms: '3', bathrooms: '3',
  livingAreaRange: '1500-2000',
  timeline: '3-6 months', goal: 'Top dollar',
}

async function runOnce(propertyTax) {
  log('\n' + '═'.repeat(76))
  log(`RUN: propertyTax=${propertyTax}`)
  log('═'.repeat(76))

  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 2000 } })
  const page = await ctx.newPage()

  let estimatePayload = null
  page.on('response', async (res) => {
    if (/\/api\/charlie\/seller-estimate$/.test(res.url())) {
      try { estimatePayload = await res.json() } catch {}
    }
  })

  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(1500)
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('charlie:open', { detail: { form: 'seller' } })))
  await page.waitForTimeout(1500)

  // Step 1: defaults are sale + home; just click Next
  await page.waitForSelector('text=Are you selling or leasing?', { timeout: 6000 })
  await page.getByRole('button', { name: /Next/i }).first().click()
  await page.waitForTimeout(700)

  // Step 2: fill
  await page.locator('input[placeholder="No."]').first().fill(INPUTS_COMMON.streetNumber)
  await page.locator('input[placeholder="Street Name"]').first().fill(INPUTS_COMMON.streetName)
  // CitySearch
  const cityInput = page.locator('input[placeholder*="Toronto, Pickering"]').first()
  await cityInput.fill(INPUTS_COMMON.city)
  try { await page.waitForResponse(r => /\/api\/charlie\/municipalities/.test(r.url()), { timeout: 5000 }) } catch {}
  await page.waitForTimeout(400)
  const opt = page.locator('div[style*="position: absolute"] div').filter({ hasText: /^Pickering$/ }).first()
  if (await opt.count() > 0) {
    const box = await opt.boundingBox()
    await page.mouse.move(box.x + box.width/2, box.y + box.height/2)
    await page.mouse.down(); await page.mouse.up()
  }
  await page.waitForTimeout(500)
  // chip clicks
  await page.locator('button', { hasText: 'Detached' }).first().click()
  // bedrooms / bathrooms via label-scoped chip
  for (const [label, val] of [['Bedrooms', INPUTS_COMMON.bedrooms], ['Bathrooms', INPUTS_COMMON.bathrooms]]) {
    const lbl = page.locator(`text=${label}`).first()
    await lbl.scrollIntoViewIfNeeded()
    const btn = lbl.locator('xpath=ancestor::div[1]/following-sibling::div[1]//button').filter({ hasText: new RegExp(`^${val}$`) }).first()
    await btn.click()
  }
  // livingAreaRange combo
  const livCombo = page.locator('text=Select or type range').first()
  await livCombo.scrollIntoViewIfNeeded()
  await livCombo.click()
  await page.waitForTimeout(400)
  await page.locator('div').filter({ hasText: /^\s*1500-2000\s*$/ }).first().click({ timeout: 3000 })
  // propertyTax
  await page.locator('input[placeholder="e.g. 4500"]').first().fill(String(propertyTax))
  // timeline + goal default; submit
  const submitBtn = page.locator('button').filter({ hasText: /Get My Sale Estimate/ }).first()
  await submitBtn.click({ force: true })
  log(`form submitted with propertyTax=${propertyTax}`)

  // Wait for /api/charlie/seller-estimate response
  const t0 = Date.now()
  while (!estimatePayload && (Date.now() - t0) < 60000) {
    await page.waitForTimeout(500)
  }
  if (!estimatePayload) {
    log(`FAIL: no /api/charlie/seller-estimate response within 60s`)
    await browser.close()
    return null
  }

  // Wait for SellerEstimateRunner to mount the panel — its server-action
  // matcher takes 5-45s. The /api/charlie/seller-estimate above only resolves
  // address + marketAnalytics; the actual matcher runs after via estimate-
  // home-sale server action and produces taxMatch.
  for (let i = 0; i < 90; i++) {
    const ok = await page.locator('text=Property Estimate').count() > 0
    if (ok) { log(`Property Estimate appeared after ${i}s of wait`); break }
    await page.waitForTimeout(1000)
  }
  await page.waitForTimeout(3000)

  // Probe via locators (XPath-based; sees text regardless of visibility).
  // The register modal overlays the panel; innerText may skip text behind
  // a modal due to CSS. Use locator.count() for honest presence checks.
  const taxMatchedLocator = await page.locator('text=/Tax-Matched.*found/').first().textContent().catch(() => null)
  const hasPropertyEstimate = (await page.locator('text=Property Estimate').count()) > 0
  const hasCompetingForSale = (await page.locator('text=Competing For Sale').count()) > 0
  const hasTaxMatchedAny = (await page.locator('text=Tax-Matched').count()) > 0
  const hasConfidenceByArea = (await page.locator('text=Confidence by Area').count()) > 0
  const renderProbe = {
    taxMatchHeading: taxMatchedLocator,
    hasTaxMatchedAny,
    hasPropertyEstimate,
    hasCompetingForSale,
    hasConfidenceByArea,
  }
  log(`render probe: ${JSON.stringify(renderProbe)}`)

  await browser.close()
  return { propertyTax, sellerEstimatePayload: estimatePayload, renderProbe }
}

async function main() {
  log('W-CHARLIE-FIX STEP 1 — root-cause tax=5000 vs tax=7500')
  log(`run: ${new Date().toISOString()}`)
  log(`base: ${BASE}`)
  log('')
  log('GOAL: capture /api/charlie/seller-estimate response payload at')
  log('      tax=5000 and tax=7500 for 606 Aspen rd Pickering Detached')
  log('      3bd/3bth, livingArea 1500-2000. Side-by-side payload diff to')
  log('      identify whether the matcher returns empty taxMatch at 5000')
  log('      (matcher-band cause) or populated taxMatch at 5000 that the')
  log('      UI drops (threading cause).')
  log('')

  const r5000 = await runOnce(5000)
  const r7500 = await runOnce(7500)

  fs.writeFileSync(path.join(OUT_DIR, 'charlie-fix-payload-5000.json'), JSON.stringify(r5000, null, 2))
  fs.writeFileSync(path.join(OUT_DIR, 'charlie-fix-payload-7500.json'), JSON.stringify(r7500, null, 2))

  log('\n' + '═'.repeat(76))
  log('SIDE-BY-SIDE DIFF — /api/charlie/seller-estimate payloads')
  log('═'.repeat(76))

  // What we care about: the marketAnalytics fields + the resolved community,
  // and CRUCIALLY whether the matcher (called separately client-side via
  // server actions) produces a taxMatch. The /api/charlie/seller-estimate
  // endpoint does NOT contain the matcher's taxMatch — it resolves address
  // and packages marketAnalytics. The matcher's taxMatch only shows in the
  // RENDERED DOM (we probed it via the render check).
  for (const [tag, r] of [['5000', r5000], ['7500', r7500]]) {
    log(`\n--- propertyTax=${tag} ---`)
    if (!r) { log('  (no payload captured)'); continue }
    const p = r.sellerEstimatePayload || {}
    log(`  resolver.success:        ${p.success}`)
    log(`  resolver.path:           ${p.path}`)
    log(`  resolver.municipalityId: ${p.municipalityId}`)
    log(`  resolver.municipality:   ${p.municipalityName}`)
    log(`  resolver.communityId:    ${p.communityId}`)
    log(`  marketAnalytics fields:  ${p.marketAnalytics ? Object.keys(p.marketAnalytics).slice(0,15).join(', ') : '(none)'}`)
    log(`  render: Tax-Matched heading in DOM: ${r.renderProbe.taxMatchHeading || '(ABSENT)'}`)
    log(`  render: Property Estimate present:   ${r.renderProbe.hasPropertyEstimate}`)
    log(`  render: Competing For Sale present:  ${r.renderProbe.hasCompetingForSale}`)
  }

  log('\n' + '═'.repeat(76))
  log('VERDICT')
  log('═'.repeat(76))
  const tax5000Heading = r5000?.renderProbe?.taxMatchHeading
  const tax7500Heading = r7500?.renderProbe?.taxMatchHeading
  log(`  tax=5000 Tax-Matched in DOM: ${tax5000Heading || 'ABSENT'}`)
  log(`  tax=7500 Tax-Matched in DOM: ${tax7500Heading || 'ABSENT'}`)
  if (!tax5000Heading && tax7500Heading) {
    log('  → tax=5000 produces NO tax-match comps in the rendered DOM')
    log('  → tax=7500 produces tax-match comps')
    log('  → The DIFFERENCE is the matcher\'s tax-band cascade. See')
    log('    home-comparable-matcher-sales.ts:1214-1352')
    log('    Band = ±20% (TAX_BAND_PCT, L323-331); at tax=5000 band is')
    log('    $4000-$6000; thresholds Gold/Silver >= 3 after funnel.')
    log('    Verdict: matcher-side. Returns undefined (L1352) when no tier')
    log('    meets threshold. UI silently hides (SellerEstimateBlock:108).')
  } else if (tax5000Heading && tax7500Heading) {
    log('  → BOTH render Tax-Matched. The operator\'s observation could not')
    log('    be reproduced — possible transient or different inputs.')
  } else {
    log('  → unexpected pattern; review the payload JSON files.')
  }

  log('\nfiles written:')
  log(`  ${REPORT}`)
  log(`  ${path.join(OUT_DIR, 'charlie-fix-payload-5000.json')}`)
  log(`  ${path.join(OUT_DIR, 'charlie-fix-payload-7500.json')}`)
}

main().catch(e => { log('CRASH: ' + e.stack); process.exit(1) })
