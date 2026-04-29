// scripts/probe-phase-4-final.js
const { chromium } = require('@playwright/test')

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:3000'

async function probe(page, urlPath) {
  const sessionPosts = []
  const tenantConfigGets = []
  page.on('request', req => {
    const url = req.url()
    const method = req.method()
    if (url.includes('/api/walliam/charlie/session') && method === 'POST') {
      sessionPosts.push(url)
    } else if (url.includes('/api/walliam/tenant-config') && method === 'GET') {
      tenantConfigGets.push(url)
    }
  })
  await page.goto(`${BASE_URL}${urlPath}`, { waitUntil: 'load', timeout: 20000 })
  await page.waitForTimeout(3000)
  return {
    path: urlPath,
    finalUrl: page.url(),
    sessionPosts: sessionPosts.length,
    tenantConfigGets: tenantConfigGets.length,
  }
}

;(async () => {
  const browser = await chromium.launch()
  const routes = ['/', '/admin', '/admin-homes', '/login']

  console.log('Probe: anonymous user (no Supabase session)')
  console.log('='.repeat(60))

  for (const r of routes) {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    const result = await probe(page, r)
    await ctx.close()

    console.log(`\n${r}  →  ${result.finalUrl}`)
    console.log(`  POST /api/walliam/charlie/session       : ${result.sessionPosts}`)
    console.log(`  GET  /api/walliam/tenant-config         : ${result.tenantConfigGets}`)
  }

  console.log('\n' + '='.repeat(60))
  console.log('Phase 4 success criteria:')
  console.log('  / route: tenantConfigGets >= 3 means provider IS firing for anonymous')
  console.log('           (existing VIPAIAccess desktop+mobile = 2, provider = 1)')
  console.log('  /admin, /admin-homes, /login: both counters = 0 means inert-route guard works')

  await browser.close()
})()