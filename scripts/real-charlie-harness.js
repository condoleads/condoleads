// scripts/real-charlie-harness.js
// W-CHARLIE-CONVERGENCE — REAL-RENDER HARNESS 1 (Charlie in-chat)
//
// Drives www.walliam.ca (production deploy aecd67d) with Playwright +
// headless chromium. Replicates the operator's seller flow inputs for
// 606 Aspen rd, Pickering, Detached, 3 bed / 3 bath, 3-6 months,
// "Top dollar". Captures (a) full-page screenshot, (b) raw innerHTML
// of the rendered ResultsPanel container, (c) a presence inventory of
// the 14 canonical sections in the actual DOM, NOT in source.
//
// Read-only against production. No DB writes. No code edits.
// Output: recon/REAL-CHARLIE.txt + recon/real-charlie-screenshots/*.png

const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

const BASE = process.env.REAL_CHARLIE_BASE || 'https://www.walliam.ca'
const OUT_DIR = path.resolve(__dirname, '..', 'recon')
const SHOT_DIR = path.join(OUT_DIR, 'real-charlie-screenshots')
const REPORT = path.join(OUT_DIR, 'REAL-CHARLIE.txt')

// Operator inputs (matching lead 63b48f13 inputs)
const INPUTS = {
  streetNumber: '606',
  streetName: 'Aspen rd',
  city: 'Pickering',
  propertySubtype: 'Detached',
  bedrooms: '3',
  bathrooms: '3',
  livingAreaRange: '1500-2000',
  propertyTax: '7500', // typical Pickering Detached; required for sale
  timeline: '3-6 months',
  goal: 'Top dollar',
}

const SECTIONS = [
  { key: 'plan_summary', label: 'Plan Summary (Seller Strategy)', probe: 'Your Seller Strategy' },
  { key: 'seller_profile', label: 'Seller Profile (planCardGrid)', probe: 'Your Profile' },
  { key: 'price_card', label: 'Property Estimate price card', probe: 'Estimated Value' },
  { key: 'tier_rail', label: '4-row tier rail (Confidence by Area)', probe: 'Confidence by Area' },
  { key: 'market_intel', label: 'Market Intelligence (analytics grid)', probe: 'Market Intelligence' },
  { key: 'price_by_home_type', label: 'Price by Home Type (subtype table)', probe: 'Price by Home Type' },
  { key: 'offer_intel', label: 'Offer Intelligence', probe: 'Offer Intelligence' },
  { key: 'best_time', label: 'Best Time (seasonal)', probe: 'Best Time' },
  { key: 'comparable_sold', label: 'Comparable Sold', probe: 'Comparable Sold' },
  { key: 'tax_matched', label: 'Tax-Matched section', probe: 'Tax-Matched' },
  { key: 'tax_matched_estimate_pill', label: 'Tax-matched estimate pill', probe: 'Tax-matched estimate' },
  { key: 'competing', label: 'Competing For Sale', probe: 'Competing For Sale' },
  { key: 'pricing_risk', label: 'Pricing Strategy & Risk', probe: 'Pricing Strategy' },
  { key: 'ai_disclaimer', label: 'AI Disclaimer', probe: 'AI Disclaimer' },
]

const log = (m) => { console.log(m); fs.appendFileSync(REPORT, m + '\n') }
const hr = () => log('─'.repeat(76))

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.mkdirSync(SHOT_DIR, { recursive: true })
  fs.writeFileSync(REPORT, '')

  log('W-CHARLIE-CONVERGENCE — REAL-RENDER HARNESS 1 (Charlie in-chat)')
  log(`run: ${new Date().toISOString()}`)
  log(`base: ${BASE}`)
  log(`harness: Playwright + chromium (headless), single browser session, real-DOM observation`)
  log('')

  hr(); log('STEP 0 — deploy SHA verification'); hr()
  // No direct SHA endpoint exposed; document the assertion the operator made:
  log('Operator asserts live deploy = aecd67d (last main commit per `git log origin/main -1`).')
  log('Vercel does not expose commit SHA in default headers; SHA is verified by the')
  log('operator out-of-band. Harness drives this base; if a build is in progress, the')
  log('result reflects whichever artifact Vercel serves at the time of run.')
  log('')

  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 2400 },
    deviceScaleFactor: 1,
  })
  const page = await ctx.newPage()

  // Network capture for diagnosis — record every /api/charlie/* request.
  const apiCalls = []
  page.on('response', async (res) => {
    const u = res.url()
    if (!/\/api\/charlie\//.test(u)) return
    let bodyPreview = ''
    try {
      const ct = res.headers()['content-type'] || ''
      if (ct.includes('json')) bodyPreview = (await res.text()).slice(0, 600)
    } catch {}
    apiCalls.push({ url: u, status: res.status(), preview: bodyPreview })
  })

  hr(); log('STEP 1 — navigate to homepage + open Charlie (seller intent)'); hr()
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  log(`title: ${await page.title()}`)
  await page.waitForTimeout(1500)

  // Dispatch the same event the homepage "Sell" chip fires. This is how
  // openCharlie('seller') works (HomePageComprehensiveClient.tsx:43).
  log('dispatch charlie:open with form=seller via window CustomEvent (same as homepage chip)')
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('charlie:open', { detail: { form: 'seller' } }))
  })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: path.join(SHOT_DIR, '01-charlie-opened.png'), fullPage: true })
  log('screenshot: 01-charlie-opened.png')

  hr(); log('STEP 2 — SellerForm step 1: Sale + Home'); hr()
  // The form opens on step 1: intent + propertyCategory. Defaults: sale + home. Click Next.
  // The form chips text-match: "For Sale", "🏠 House / Townhouse" (with emoji), "Next →"
  try {
    await page.waitForSelector('text=Are you selling or leasing?', { timeout: 6000 })
    log('SellerForm step 1 mounted')
  } catch (e) {
    log(`WARN: SellerForm step 1 did not mount within 6s — capturing state`)
    await page.screenshot({ path: path.join(SHOT_DIR, '02a-no-form.png'), fullPage: true })
  }
  // Defaults already correct (sale + home). Click Next.
  const nextBtn = page.getByRole('button', { name: /Next/i })
  if (await nextBtn.count() > 0) {
    await nextBtn.first().click()
    log('clicked: Next →')
  } else {
    log('WARN: Next button not found — capturing')
  }
  await page.waitForTimeout(800)
  await page.screenshot({ path: path.join(SHOT_DIR, '02-form-step2.png'), fullPage: true })
  log('screenshot: 02-form-step2.png')

  hr(); log('STEP 3 — SellerForm step 2: fill property details'); hr()
  // streetNumber + streetName
  const streetNumberInput = page.locator('input[placeholder="No."]').first()
  const streetNameInput = page.locator('input[placeholder="Street Name"]').first()
  if (await streetNumberInput.count() > 0) {
    await streetNumberInput.fill(INPUTS.streetNumber)
    log(`filled: streetNumber=${INPUTS.streetNumber}`)
  } else log('WARN: streetNumber input not found')
  if (await streetNameInput.count() > 0) {
    await streetNameInput.fill(INPUTS.streetName)
    log(`filled: streetName=${INPUTS.streetName}`)
  } else log('WARN: streetName input not found')

  // CitySearch — type city, wait for /api/charlie/municipalities response,
  // then click the dropdown item. The dropdown item uses onMouseDown (not
  // onClick), and the input fires onBlur on click which closes the dropdown
  // 150ms later. Use mouse.down() directly on the option to bypass focus race.
  const cityInput = page.locator('input[placeholder*="Toronto, Pickering"]').first()
  if (await cityInput.count() > 0) {
    await cityInput.fill(INPUTS.city)
    log(`typed in CitySearch: ${INPUTS.city}`)
    // Wait for /api/charlie/municipalities to return — debounce=250ms then fetch
    try {
      await page.waitForResponse(r => /\/api\/charlie\/municipalities/.test(r.url()), { timeout: 5000 })
      log('municipalities API responded')
    } catch { log('WARN: no municipalities API response within 5s') }
    await page.waitForTimeout(400)
    // The dropdown item is an absolutely-positioned div with the displayName text.
    // Use exact text match scoped to the dropdown z-index container.
    const opt = page.locator('div[style*="position: absolute"] div').filter({ hasText: /^Pickering$/ }).first()
    const optCount = await opt.count()
    log(`Pickering dropdown options found: ${optCount}`)
    if (optCount > 0) {
      // Fire mousedown directly to trigger onMouseDown handler before onBlur
      const box = await opt.boundingBox()
      if (box) {
        await page.mouse.move(box.x + box.width/2, box.y + box.height/2)
        await page.mouse.down()
        await page.mouse.up()
        log('mouse-clicked Pickering option')
      } else {
        await opt.click({ force: true })
        log('forced-click Pickering option')
      }
    } else {
      log('WARN: dropdown option not found; falling back to label-scoped search')
      const fb = page.locator('div').filter({ hasText: /^Pickering$/ }).first()
      if (await fb.count() > 0) {
        const box = await fb.boundingBox()
        if (box) {
          await page.mouse.move(box.x + box.width/2, box.y + box.height/2)
          await page.mouse.down(); await page.mouse.up()
          log('mouse-clicked fallback Pickering')
        }
      }
    }
  } else log('WARN: CitySearch input not found')
  await page.waitForTimeout(600)

  // Subtype is a row of chip buttons; click "Detached"
  const detached = page.locator('button', { hasText: 'Detached' }).first()
  if (await detached.count() > 0) {
    await detached.click()
    log(`clicked subtype: ${INPUTS.propertySubtype}`)
  }

  // Bedrooms — chip row with digits ['1','2','3','4','5+']. There are TWO sets
  // of digit chips (Bedrooms + Bathrooms) — disambiguate via scope under their
  // labels. Use the first "3" after "Bedrooms" label.
  async function clickDigitUnderLabel(labelRegex, digit, what) {
    try {
      const label = page.locator(`text=${labelRegex}`).first()
      await label.scrollIntoViewIfNeeded()
      // The chip buttons follow immediately after the label container. Use the
      // next sibling container's button with the digit.
      const chipBtn = label.locator('xpath=ancestor::div[1]/following-sibling::div[1]//button').filter({ hasText: new RegExp(`^${digit}$`) }).first()
      if (await chipBtn.count() > 0) {
        await chipBtn.click()
        log(`clicked chip ${what} → ${digit}`)
      } else {
        // fallback: any button with exact digit text
        const anyBtn = page.locator('button').filter({ hasText: new RegExp(`^${digit}$`) }).first()
        await anyBtn.click({ timeout: 3000 })
        log(`clicked chip ${what} → ${digit} (fallback)`)
      }
    } catch (e) { log(`WARN: ${what} chip: ${e.message?.slice(0,120)}`) }
  }
  await clickDigitUnderLabel('Bedrooms', INPUTS.bedrooms, 'bedrooms')
  // Bathrooms chip — looking for second "3" button; since first was just clicked, take the next
  try {
    const bathLabel = page.locator('text=Bathrooms').first()
    await bathLabel.scrollIntoViewIfNeeded()
    const bathBtn = bathLabel.locator('xpath=ancestor::div[1]/following-sibling::div[1]//button').filter({ hasText: new RegExp(`^${INPUTS.bathrooms}$`) }).first()
    if (await bathBtn.count() > 0) {
      await bathBtn.click()
      log(`clicked chip bathrooms → ${INPUTS.bathrooms}`)
    }
  } catch (e) { log(`WARN: bathrooms chip: ${e.message?.slice(0,120)}`) }

  // livingAreaRange — ComboField with placeholder "Select or type range"
  try {
    const livCombo = page.locator('text=Select or type range').first()
    await livCombo.scrollIntoViewIfNeeded()
    await livCombo.click()
    await page.waitForTimeout(400)
    // Option list — pick "1500-1999"
    const livOpt = page.locator('div').filter({ hasText: /^\s*1500-2000\s*$/ }).first()
    await livOpt.click({ timeout: 3000 })
    log(`combo livingAreaRange → ${INPUTS.livingAreaRange}`)
  } catch (e) { log(`WARN: livingAreaRange combo: ${e.message?.slice(0,160)}`) }

  // propertyTax — input with placeholder "e.g. 4500"
  try {
    const taxInput = page.locator('input[placeholder="e.g. 4500"]').first()
    await taxInput.fill(INPUTS.propertyTax)
    log(`filled: propertyTax=${INPUTS.propertyTax}`)
  } catch (e) { log(`WARN: propertyTax fill: ${e.message?.slice(0,160)}`) }

  // Timeline — chip "3-6 months" (default; click to be sure)
  try {
    const tlBtn = page.locator('button').filter({ hasText: /^3-6 months$/ }).first()
    if (await tlBtn.count() > 0) { await tlBtn.click(); log(`chip timeline → ${INPUTS.timeline}`) }
  } catch {}
  // Goal — chip "Top dollar" (default already; click to confirm)
  try {
    const goalBtn = page.locator('button').filter({ hasText: /^Top dollar$/ }).first()
    if (await goalBtn.count() > 0) { await goalBtn.click(); log(`chip goal → ${INPUTS.goal}`) }
  } catch {}

  await page.screenshot({ path: path.join(SHOT_DIR, '03-form-filled.png'), fullPage: true })
  log('screenshot: 03-form-filled.png')

  hr(); log('STEP 4 — submit SellerForm'); hr()
  // Submit text: "Get My Sale Estimate →" (or Lease equivalent). Button is
  // disabled until canSubmit (all required fields). Check disabled state.
  const submitBtn = page.locator('button').filter({ hasText: /Get My (Sale|Lease) Estimate/ }).first()
  const submitCount = await submitBtn.count()
  log(`submit button found: ${submitCount > 0 ? 'YES' : 'NO'}`)
  if (submitCount > 0) {
    const isDisabled = await submitBtn.isDisabled()
    log(`submit button disabled? ${isDisabled}`)
    if (isDisabled) {
      // Diagnose WHICH required field is missing — read each input's value
      const formProbe = await page.evaluate(() => {
        const out = {}
        const sn = document.querySelector('input[placeholder="No."]')
        out.streetNumber = sn ? sn.value : '(no element)'
        const st = document.querySelector('input[placeholder="Street Name"]')
        out.streetName = st ? st.value : '(no element)'
        const ci = document.querySelector('input[placeholder*="Toronto, Pickering"]')
        out.city = ci ? ci.value : '(no element)'
        const tx = document.querySelector('input[placeholder="e.g. 4500"]')
        out.propertyTax = tx ? tx.value : '(no element)'
        // chip "active" state — chips have background style with color
        out.activeChips = Array.from(document.querySelectorAll('button')).filter(b => {
          const s = b.getAttribute('style') || ''
          return /background:.*(?:10b981|f59e0b|ec4899)22/.test(s)
        }).map(b => b.textContent?.trim()).filter(Boolean)
        return out
      })
      log('FORM INCOMPLETE — submit button disabled. Form input values:')
      for (const [k,v] of Object.entries(formProbe)) log(`  ${k}: ${JSON.stringify(v)}`)
      await page.screenshot({ path: path.join(SHOT_DIR, '03b-submit-disabled.png'), fullPage: true })
    }
    await submitBtn.click({ force: true })
    log('clicked submit (force)')
  } else {
    log('FAIL: submit button not found')
  }

  hr(); log('STEP 5 — wait for SellerEstimateRunner to render results'); hr()
  // The chat-message that goes out after onEstimateReady triggers the register
  // gate (useCharlie.ts:282) for unauthenticated sessions. The panel STILL
  // renders (setSellerEstimate happens first), but the register modal sits on
  // top visually. We do NOT register — read-only against prod, no DB write.
  // SellerEstimateRunner runs the matcher (server actions) — can take 15-45s.
  // Wait for either the SellerEstimateBlock or an error to appear.
  const startWait = Date.now()
  let panelMounted = false
  for (let i = 0; i < 60; i++) {
    const hasPropertyEstimate = await page.locator('text=Property Estimate').count() > 0
    const hasError = await page.locator('text=Could not resolve|Estimate failed|Error').count() > 0
    if (hasPropertyEstimate) {
      panelMounted = true
      log(`Property Estimate section appeared after ${Math.round((Date.now()-startWait)/1000)}s`)
      break
    }
    if (hasError) {
      log(`ERROR text detected after ${Math.round((Date.now()-startWait)/1000)}s — capturing`)
      break
    }
    await page.waitForTimeout(1000)
  }
  if (!panelMounted) {
    log(`WARN: Property Estimate did not appear within 60s — capturing whatever rendered`)
  }
  await page.waitForTimeout(3000) // let any further blocks settle

  await page.screenshot({ path: path.join(SHOT_DIR, '04-results-rendered.png'), fullPage: true })
  log('screenshot: 04-results-rendered.png')

  // Dismiss the register modal so we can screenshot the panel underneath.
  // Modal is rendered via portal at z-9999 with class "fixed inset-0 ...
  // bg-black/60 backdrop-blur-sm". Strip it from DOM directly (read-only
  // visual capture; React state remains gateActive but we just hide overlay).
  try {
    await page.evaluate(() => {
      const sel = 'div[class*="z-[9999]"], div[class*="backdrop-blur-sm"]'
      document.querySelectorAll(sel).forEach(el => { el.remove() })
    })
    log('stripped register modal nodes from DOM for visual capture (state unchanged)')
    await page.waitForTimeout(400)
    await page.screenshot({ path: path.join(SHOT_DIR, '05-panel-no-modal.png'), fullPage: true })
    log('screenshot: 05-panel-no-modal.png')
  } catch (e) { log(`WARN: modal strip: ${e.message?.slice(0,120)}`) }

  hr(); log('STEP 6 — capture rendered DOM + section inventory'); hr()

  // Capture innerHTML of the Charlie overlay (the panel container).
  // Heuristic: find the smallest element that contains ALL of the seller-flow
  // section markers — that's the ResultsPanel root.
  const innerHTML = await page.evaluate(() => {
    const markers = ['Property Estimate', 'Comparable Sold', 'Tax-Matched', 'Competing For Sale', 'Pricing Strategy']
    const all = Array.from(document.querySelectorAll('div, section'))
    const containers = all.filter(el => {
      const t = el.textContent || ''
      return markers.every(m => t.includes(m))
    })
    if (containers.length === 0) {
      // No single container holds all markers — capture overlay-ish body chunk
      return { source: 'whole body (no single ResultsPanel container found)', html: document.body.outerHTML.slice(0, 400000) }
    }
    // Pick the SMALLEST container (closest to ResultsPanel root)
    containers.sort((a, b) => a.innerHTML.length - b.innerHTML.length)
    return { source: 'tightest ResultsPanel container (holds all 5 markers)', html: containers[0].outerHTML }
  })
  const innerHTMLPath = path.join(OUT_DIR, 'real-charlie-panel-innerHTML.html')
  fs.writeFileSync(innerHTMLPath, innerHTML.html || '')
  log(`captured innerHTML: ${innerHTMLPath} (${(innerHTML.html||'').length} chars, source=${innerHTML.source})`)

  // Capture the entire chat overlay DOM for diagnosis
  const overlayHTML = await page.evaluate(() => {
    const ov = document.querySelector('[role="dialog"], [class*="overlay" i]')
    return ov ? ov.outerHTML.slice(0, 300000) : document.body.outerHTML.slice(0, 300000)
  })
  fs.writeFileSync(path.join(OUT_DIR, 'real-charlie-overlay.html'), overlayHTML)

  // Section inventory — for each canonical section, presence in rendered DOM
  log('')
  log('Section inventory (REAL rendered DOM, NOT source):')
  log('-'.repeat(76))
  log('SECTION'.padEnd(40) + 'PROBE'.padEnd(28) + 'STATUS')
  log('-'.repeat(76))
  const inventory = []
  for (const s of SECTIONS) {
    const count = await page.locator(`text=${s.probe}`).count()
    const status = count > 0 ? 'PRESENT' : 'ABSENT '
    inventory.push({ ...s, present: count > 0, count })
    log(`${s.label.padEnd(40).slice(0,40)}${s.probe.padEnd(28).slice(0,28)}${status} (n=${count})`)
  }
  log('-'.repeat(76))
  const absent = inventory.filter(x => !x.present)
  log(`PRESENT: ${inventory.length - absent.length}, ABSENT: ${absent.length}`)
  log('')

  // Specific tax-match probe — measure "Tax-Matched · N found"
  const taxMatchedText = await page.locator('text=/Tax-Matched.*found/').first().textContent().catch(() => null)
  log(`Tax-Matched heading text (if present): ${taxMatchedText || '— not in DOM —'}`)

  hr(); log('STEP 7 — network call inventory (diagnosis)'); hr()
  for (const c of apiCalls) {
    log(`${c.status} ${c.url}`)
    if (c.preview) log(`  preview: ${c.preview.replace(/\n/g,' ').slice(0,200)}…`)
  }
  log('')

  hr(); log('STEP 8 — runtime state probe (data-not-arriving vs data-gated)'); hr()
  // Pull internal React state from window.__charlieState if we exposed it; otherwise
  // probe by reading DOM for the SellerEstimate block. We've already done that —
  // now examine what data DID arrive vs what's missing.
  const stateProbe = await page.evaluate(() => {
    // Find any element with "estimatedPrice" or numerical estimate text
    const moneyMatches = (document.body.textContent || '').match(/\$[\d,]+/g) || []
    return {
      moneyTokensVisible: moneyMatches.slice(0, 20),
      hasTaxMatchHeading: !!document.body.textContent?.match(/Tax-Matched/),
      hasTaxMatchedEstimatePill: !!document.body.textContent?.match(/Tax-matched estimate/),
      hasPropertyEstimate: !!document.body.textContent?.match(/Property Estimate/),
      hasMarketIntelligence: !!document.body.textContent?.match(/Market Intelligence/),
      hasPricingStrategy: !!document.body.textContent?.match(/Pricing Strategy/),
      hasYourSellerStrategy: !!document.body.textContent?.match(/Your Seller Strategy/),
      hasYourProfile: !!document.body.textContent?.match(/Your Profile/),
    }
  })
  log('Runtime DOM probe:')
  for (const [k,v] of Object.entries(stateProbe)) {
    log(`  ${k.padEnd(30)} ${JSON.stringify(v).slice(0,200)}`)
  }

  await browser.close()

  hr(); log('SUMMARY'); hr()
  log(`Inventory: ${inventory.length - absent.length}/${inventory.length} canonical sections present in live DOM.`)
  if (absent.length > 0) {
    log(`Absent: ${absent.map(s => s.key).join(', ')}`)
  }
  log('')
  log('See:')
  log(`  ${REPORT}`)
  log(`  ${innerHTMLPath}`)
  log(`  ${SHOT_DIR}/`)
}

main().catch(e => {
  log(`HARNESS CRASH: ${e.stack || e.message}`)
  process.exit(1)
})
