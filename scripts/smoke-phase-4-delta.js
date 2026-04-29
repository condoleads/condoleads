// scripts/smoke-phase-4-delta.js
// Compares /session call counts BEFORE vs AFTER Phase 4 mount.
// Run AFTER Phase 4 edit is applied. Script temporarily reverts the layout file,
// captures baseline, restores the edit, captures post-edit, diffs.

const { chromium } = require('@playwright/test')
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://localhost:3000'
const LAYOUT_PATH = 'app/layout.tsx'

const tenantRoutes = ['/']
const inertRoutes = ['/admin', '/admin-homes', '/login']

async function countSessionCalls(browser, urlPath) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const calls = []
  const errors = []
  page.on('request', req => {
    if (req.url().includes('/api/walliam/charlie/session')) calls.push(req.url())
  })
  page.on('pageerror', e => errors.push(e.message))
  try {
    await page.goto(`${BASE_URL}${urlPath}`, { waitUntil: 'networkidle', timeout: 15000 })
    await page.waitForTimeout(2000)
  } catch (e) {
    errors.push(`nav: ${e.message}`)
  }
  await context.close()
  return { count: calls.length, errors }
}

async function snapshot(browser, label) {
  console.log(`\n── snapshot: ${label} ──`)
  const out = {}
  for (const r of [...tenantRoutes, ...inertRoutes]) {
    const result = await countSessionCalls(browser, r)
    out[r] = result.count
    console.log(`  ${r}: ${result.count} session call(s)${result.errors.length ? '  ERRORS: ' + result.errors.join('; ') : ''}`)
  }
  return out
}

async function main() {
  // Confirm we're on the post-Phase-4 commit (file should contain CreditSessionProvider)
  const layoutContent = fs.readFileSync(LAYOUT_PATH, 'utf8')
  if (!layoutContent.includes('CreditSessionProvider')) {
    console.error('ERROR: app/layout.tsx does not contain CreditSessionProvider — Phase 4 not applied')
    process.exit(2)
  }

  const browser = await chromium.launch()
  try {
    // Snapshot AFTER (current state)
    const after = await snapshot(browser, 'AFTER Phase 4 (current state)')

    // Temporarily revert layout.tsx via git stash of just that file
    console.log('\n── temporarily reverting app/layout.tsx for baseline ──')
    execSync(`git stash push -- ${LAYOUT_PATH}`, { stdio: 'inherit' })

    // Wait for Next.js to recompile
    await new Promise(r => setTimeout(r, 4000))

    const before = await snapshot(browser, 'BEFORE Phase 4 (baseline)')

    // Restore
    console.log('\n── restoring app/layout.tsx ──')
    execSync(`git stash pop`, { stdio: 'inherit' })
    await new Promise(r => setTimeout(r, 4000))

    // Print delta
    console.log('\n──────── DELTA ────────')
    let allOk = true
    for (const r of tenantRoutes) {
      const delta = after[r] - before[r]
      const ok = delta === 1
      console.log(`  ${r}: ${before[r]} -> ${after[r]} (delta ${delta >= 0 ? '+' : ''}${delta}) — expected +1 — ${ok ? 'OK' : 'FAIL'}`)
      if (!ok) allOk = false
    }
    for (const r of inertRoutes) {
      const ok = after[r] === before[r] && after[r] >= 0
      console.log(`  ${r}: ${before[r]} -> ${after[r]} — expected unchanged — ${ok ? 'OK' : 'FAIL'}`)
      if (!ok) allOk = false
    }
    console.log(`\n──────── ${allOk ? 'ALL PASS' : 'FAIL'} ────────`)
    process.exit(allOk ? 0 : 1)
  } finally {
    await browser.close()
    // Best effort: ensure the layout is restored even if something crashed mid-run
    try {
      const stashList = execSync('git stash list').toString()
      if (stashList.includes(LAYOUT_PATH)) {
        console.log('\n── safety: popping stash to restore layout ──')
        execSync('git stash pop', { stdio: 'inherit' })
      }
    } catch {}
  }
}

main().catch(err => {
  console.error('Smoke runner crashed:', err)
  process.exit(2)
})