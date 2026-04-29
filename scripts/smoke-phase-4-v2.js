// scripts/smoke-phase-4-v2.js
const { chromium } = require('@playwright/test')

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:3000'

const routes = [
  { path: '/', label: 'tenant homepage', expect: 'tenant', expectMinSessionCalls: 1 },
  { path: '/admin', label: 'admin (or redirect)', expect: 'inert', expectMaxSessionCalls: 0 },
  { path: '/admin-homes', label: 'admin-homes', expect: 'inert', expectMaxSessionCalls: 0 },
  { path: '/login', label: 'login', expect: 'inert', expectMaxSessionCalls: 0 },
  { path: '/dashboard', label: 'dashboard (skipif404)', expect: 'inert', expectMaxSessionCalls: 0, skipIf404: true },
]

async function smokeRoute(browser, route) {
  const context = await browser.newContext()
  const page = await context.newPage()

  const sessionCalls = []
  const consoleErrors = []
  const pageErrors = []
  let finalUrl = null
  let httpStatus = null
  let navError = null

  page.on('request', req => {
    if (req.url().includes('/api/walliam/charlie/session')) {
      sessionCalls.push({ method: req.method(), url: req.url() })
    }
  })
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', err => {
    pageErrors.push(err.message)
  })

  try {
    const response = await page.goto(`${BASE_URL}${route.path}`, {
      waitUntil: 'load',
      timeout: 20000,
    })
    httpStatus = response ? response.status() : null
    finalUrl = page.url()
    // Wait for client-side effects to fire after load
    await page.waitForTimeout(3000)
  } catch (err) {
    navError = err.message
    finalUrl = page.url()
  }

  await context.close()

  // Decide pass/fail based on route expectations
  let ok = true
  let reasons = []

  if (navError) {
    ok = false
    reasons.push(`navigation error: ${navError}`)
  }

  if (route.skipIf404 && httpStatus === 404) {
    return {
      route: route.label,
      path: route.path,
      finalUrl,
      httpStatus,
      sessionCalls: sessionCalls.length,
      ok: true,
      skipped: true,
      reasons: ['skipped — route returns 404, feature not present'],
    }
  }

  if (httpStatus === null && !navError) {
    ok = false
    reasons.push('no HTTP response')
  } else if (httpStatus !== null && httpStatus >= 500) {
    ok = false
    reasons.push(`server error: HTTP ${httpStatus}`)
  }

  if (route.expect === 'tenant') {
    if (sessionCalls.length < (route.expectMinSessionCalls ?? 1)) {
      ok = false
      reasons.push(`expected at least ${route.expectMinSessionCalls} session call(s), got ${sessionCalls.length}`)
    }
  } else if (route.expect === 'inert') {
    if (sessionCalls.length > (route.expectMaxSessionCalls ?? 0)) {
      ok = false
      reasons.push(`expected at most ${route.expectMaxSessionCalls} session call(s), got ${sessionCalls.length}`)
    }
  }

  if (pageErrors.length > 0) {
    ok = false
    reasons.push(`${pageErrors.length} uncaught page error(s)`)
  }

  return {
    route: route.label,
    path: route.path,
    finalUrl,
    httpStatus,
    sessionCalls: sessionCalls.length,
    sessionDetails: sessionCalls,
    consoleErrors,
    pageErrors,
    ok,
    reasons,
  }
}

async function main() {
  const browser = await chromium.launch()
  const results = []
  for (const route of routes) {
    process.stdout.write(`Testing ${route.label} (${route.path})... `)
    const r = await smokeRoute(browser, route)
    results.push(r)
    console.log(r.skipped ? 'SKIP' : (r.ok ? 'PASS' : 'FAIL'))
  }
  await browser.close()

  console.log('\n──────── DETAILS ────────')
  for (const r of results) {
    const tag = r.skipped ? 'SKIP' : (r.ok ? 'PASS' : 'FAIL')
    console.log(`\n[${tag}] ${r.route} (${r.path})`)
    console.log(`  Final URL: ${r.finalUrl}`)
    console.log(`  HTTP: ${r.httpStatus ?? 'no response'}`)
    console.log(`  Session calls: ${r.sessionCalls}`)
    if (r.reasons && r.reasons.length) {
      r.reasons.forEach(reason => console.log(`  -> ${reason}`))
    }
    if (r.consoleErrors && r.consoleErrors.length) {
      console.log(`  Console errors (${r.consoleErrors.length}):`)
      r.consoleErrors.slice(0, 5).forEach(e => console.log(`    - ${e}`))
      if (r.consoleErrors.length > 5) console.log(`    ... ${r.consoleErrors.length - 5} more`)
    }
    if (r.pageErrors && r.pageErrors.length) {
      console.log(`  Page errors (${r.pageErrors.length}):`)
      r.pageErrors.forEach(e => console.log(`    - ${e}`))
    }
  }

  const failed = results.filter(r => !r.ok && !r.skipped).length
  const skipped = results.filter(r => r.skipped).length
  const passed = results.length - failed - skipped
  console.log(`\n──────── SUMMARY: ${passed} passed, ${failed} failed, ${skipped} skipped ────────`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(err => {
  console.error('Smoke runner crashed:', err)
  process.exit(2)
})