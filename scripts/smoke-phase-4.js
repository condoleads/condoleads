// scripts/smoke-phase-4.js
const { chromium } = require('@playwright/test')

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:3000'

const routes = [
  { path: '/', label: 'tenant homepage', expectSessionCalls: 7 },
  { path: '/admin', label: 'admin login', expectSessionCalls: 0 },
  { path: '/admin-homes', label: 'admin-homes', expectSessionCalls: 0 },
  { path: '/login', label: 'login', expectSessionCalls: 0 },
  { path: '/dashboard', label: 'dashboard', expectSessionCalls: 0 },
]

async function smokeRoute(browser, route) {
  const context = await browser.newContext()
  const page = await context.newPage()

  const sessionCalls = []
  const consoleErrors = []
  const pageErrors = []

  page.on('request', req => {
    const url = req.url()
    if (url.includes('/api/walliam/charlie/session')) {
      sessionCalls.push({ method: req.method(), url })
    }
  })

  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })

  page.on('pageerror', err => {
    pageErrors.push(err.message)
  })

  let httpStatus = null
  try {
    const response = await page.goto(`${BASE_URL}${route.path}`, {
      waitUntil: 'networkidle',
      timeout: 15000,
    })
    httpStatus = response ? response.status() : null
  } catch (err) {
    return {
      route: route.label,
      path: route.path,
      ok: false,
      reason: `navigation failed: ${err.message}`,
      sessionCalls: sessionCalls.length,
      consoleErrors,
      pageErrors,
    }
  }

  // Give client-side effects a moment to fire after networkidle
  await page.waitForTimeout(2000)

  await context.close()

  const expected = route.expectSessionCalls
  const actual = sessionCalls.length
  const sessionOk = actual === expected

  return {
    route: route.label,
    path: route.path,
    ok: sessionOk && consoleErrors.length === 0 && pageErrors.length === 0,
    httpStatus,
    sessionCalls: actual,
    expectedSessionCalls: expected,
    sessionOk,
    consoleErrors,
    pageErrors,
  }
}

async function main() {
  const browser = await chromium.launch()
  const results = []
  for (const route of routes) {
    process.stdout.write(`Testing ${route.label} (${route.path})... `)
    const r = await smokeRoute(browser, route)
    results.push(r)
    console.log(r.ok ? 'PASS' : 'FAIL')
  }
  await browser.close()

  console.log('\n──────── DETAILS ────────')
  for (const r of results) {
    console.log(`\n[${r.ok ? 'PASS' : 'FAIL'}] ${r.route} (${r.path})`)
    console.log(`  HTTP: ${r.httpStatus}`)
    console.log(`  Session calls: ${r.sessionCalls} (expected ${r.expectedSessionCalls}) — ${r.sessionOk ? 'OK' : 'WRONG'}`)
    if (r.consoleErrors.length) {
      console.log(`  Console errors:`)
      r.consoleErrors.forEach(e => console.log(`    - ${e}`))
    }
    if (r.pageErrors.length) {
      console.log(`  Page errors:`)
      r.pageErrors.forEach(e => console.log(`    - ${e}`))
    }
  }

  const failed = results.filter(r => !r.ok).length
  console.log(`\n──────── SUMMARY: ${failed === 0 ? 'ALL PASS' : `${failed} FAILED`} ────────`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(err => {
  console.error('Smoke runner crashed:', err)
  process.exit(2)
})