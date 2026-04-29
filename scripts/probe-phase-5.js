// scripts/probe-phase-5.js
// Captures session-call fingerprints on routes affected by Phase 5 (AuthStatus migration).
// Run BEFORE Phase 5 edit to establish baseline.
// Run AFTER Phase 5 edit and compare.
//
// Pass route override via env: BUILDING_SLUG=-1309---3079-trafalgar-road-oakville

const { chromium } = require('@playwright/test')

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:3000'
const BUILDING_SLUG = process.env.BUILDING_SLUG || '-1309---3079-trafalgar-road-oakville'

const routes = [
  { path: '/', label: 'homepage (VIPAIAccess only — no AuthStatus)', expect: 'tenant' },
  { path: `/${BUILDING_SLUG}`, label: 'building page (AuthStatus via StickyNav)', expect: 'tenant' },
  { path: '/admin', label: 'admin (inert)', expect: 'inert' },
  { path: '/login', label: 'login (inert)', expect: 'inert' },
]

async function probe(browser, route) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()

  const sessionPosts = []
  const sessionGets = []
  const tenantConfigGets = []
  const consoleErrors = []
  const pageErrors = []

  page.on('request', req => {
    const url = req.url()
    const m = req.method()
    if (url.includes('/api/walliam/charlie/session')) {
      if (m === 'POST') sessionPosts.push(url)
      else if (m === 'GET') sessionGets.push(url)
    } else if (url.includes('/api/walliam/tenant-config') && m === 'GET') {
      tenantConfigGets.push(url)
    }
  })
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', err => {
    pageErrors.push(err.message)
  })

  let httpStatus = null
  let finalUrl = null
  let navError = null

  try {
    const response = await page.goto(`${BASE_URL}${route.path}`, {
      waitUntil: 'load',
      timeout: 25000,
    })
    httpStatus = response ? response.status() : null
    finalUrl = page.url()
    await page.waitForTimeout(3000)
  } catch (err) {
    navError = err.message
    finalUrl = page.url()
  }

  await ctx.close()

  return {
    label: route.label,
    path: route.path,
    expect: route.expect,
    httpStatus,
    finalUrl,
    navError,
    sessionPostCount: sessionPosts.length,
    sessionGetCount: sessionGets.length,
    tenantConfigGetCount: tenantConfigGets.length,
    consoleErrorCount: consoleErrors.length,
    pageErrorCount: pageErrors.length,
    consoleErrors: consoleErrors.slice(0, 5),
    pageErrors,
  }
}

;(async () => {
  const browser = await chromium.launch()
  console.log(`Probe target: ${BASE_URL}`)
  console.log(`Building slug: ${BUILDING_SLUG}`)
  console.log('='.repeat(70))

  const results = []
  for (const route of routes) {
    process.stdout.write(`Probing ${route.path}... `)
    const r = await probe(browser, route)
    results.push(r)
    console.log(r.navError ? `NAV ERROR: ${r.navError}` : `HTTP ${r.httpStatus}`)
  }

  await browser.close()

  console.log('\n' + '='.repeat(70))
  console.log('METRICS')
  console.log('='.repeat(70))
  for (const r of results) {
    console.log(`\n${r.label}`)
    console.log(`  Path        : ${r.path}`)
    console.log(`  Final URL   : ${r.finalUrl}`)
    console.log(`  HTTP        : ${r.httpStatus ?? 'no response'}`)
    console.log(`  POST /session       : ${r.sessionPostCount}`)
    console.log(`  GET  /session       : ${r.sessionGetCount}`)
    console.log(`  GET  /tenant-config : ${r.tenantConfigGetCount}`)
    console.log(`  Console errors      : ${r.consoleErrorCount}`)
    console.log(`  Page errors         : ${r.pageErrorCount}`)
    if (r.consoleErrors.length) {
      r.consoleErrors.forEach(e => console.log(`    ! ${e}`))
    }
    if (r.pageErrors.length) {
      r.pageErrors.forEach(e => console.log(`    !! ${e}`))
    }
  }

  console.log('\n' + '='.repeat(70))
  console.log('FOR COMPARISON: copy these numbers into the tracker')
  console.log('='.repeat(70))
  for (const r of results) {
    console.log(`${r.path.padEnd(50)} POST=${r.sessionPostCount}  GET=${r.tenantConfigGetCount}`)
  }
})()