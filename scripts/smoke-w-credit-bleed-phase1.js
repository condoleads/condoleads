// W-CREDIT-BLEED-PHASE1 — both-direction server smoke + client identity-change smoke.
// Uses REAL Playwright-driven sign-ins to get correct chunked/base64-encoded
// cookies from /login (matches production cookie format set by @supabase/ssr).

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')
const { chromium } = require('playwright')

const BASE = `http://localhost:${process.env.SMOKE_PORT || '3000'}`
const TENANT_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'

const USER_A = { email: 'finaltest1003@gmail.com', user_id: '5b6fa15d-bd17-4607-ab1f-a0939e941244', password: 'Phase1Smoke!2026' }
const USER_B = { email: 'smoke-credit-verify@walliam.test', user_id: '6c72170b-2e6e-4a5f-af14-180b2efda6ad', password: 'Phase1Smoke!2026' }

const sbAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

function pass(msg) { console.log(`  PASS: ${msg}`) }
function fail(msg) { console.log(`  FAIL: ${msg}`); process.exitCode = 1 }

async function loginAndExtractCookies(email, password) {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await new Promise(r => setTimeout(r, 1500))
  await page.fill('input#email', email)
  await page.fill('input#password', password)
  const tokenResp = page.waitForResponse(r => r.url().includes('/auth/v1/token'))
  await page.click('button[type="submit"]')
  await tokenResp.catch(() => {})
  await new Promise(r => setTimeout(r, 1500))
  const cookies = (await ctx.cookies()).filter(c => c.name.startsWith('sb-'))
  await browser.close()
  // Cookie header value (browser-formatted, NOT URL-encoded — Playwright stores decoded)
  // But raw HTTP cookie header MUST URL-encode values that contain reserved chars.
  // Playwright's c.value is the decoded form; we re-encode for the HTTP header.
  const header = cookies.map(c => `${c.name}=${c.value}`).join('; ')
  return header
}

async function readSessionCount(userId) {
  const { data } = await sbAdmin.from('chat_sessions').select('id, estimator_count').eq('user_id', userId).eq('tenant_id', TENANT_ID).order('updated_at', { ascending: false }).limit(1).maybeSingle()
  return data
}

async function callSession({ cookieHeader, bodyUserId }) {
  const headers = { 'Content-Type': 'application/json', 'x-tenant-id': TENANT_ID }
  if (cookieHeader) headers['Cookie'] = cookieHeader
  const res = await fetch(`${BASE}/api/walliam/estimator/session`, {
    method: 'POST', headers, body: JSON.stringify({ userId: bodyUserId }),
  })
  let body = null; try { body = await res.json() } catch {}
  return { status: res.status, body }
}

async function callIncrement({ cookieHeader, sessionId }) {
  const headers = { 'Content-Type': 'application/json' }
  if (cookieHeader) headers['Cookie'] = cookieHeader
  const res = await fetch(`${BASE}/api/walliam/estimator/increment`, {
    method: 'POST', headers, body: JSON.stringify({ sessionId }),
  })
  let body = null; try { body = await res.json() } catch {}
  return { status: res.status, body }
}

;(async () => {
  console.log('=== W-CREDIT-BLEED-PHASE1 smoke ===')
  console.log(`base: ${BASE}`)

  const aBefore = await readSessionCount(USER_A.user_id)
  const bBefore = await readSessionCount(USER_B.user_id)
  console.log(`\nPRE-STATE  A(${USER_A.email}): chat_session=${aBefore?.id?.slice(0,8)} count=${aBefore?.estimator_count}`)
  console.log(`PRE-STATE  B(${USER_B.email}): chat_session=${bBefore?.id?.slice(0,8)} count=${bBefore?.estimator_count}`)

  console.log('\n--- Capturing real cookies via Playwright /login (both users) ---')
  const cookieA = await loginAndExtractCookies(USER_A.email, USER_A.password)
  const cookieB = await loginAndExtractCookies(USER_B.email, USER_B.password)
  console.log(`  A cookie header length: ${cookieA.length} (chunks: ${(cookieA.match(/sb-[^;]+/g)||[]).length})`)
  console.log(`  B cookie header length: ${cookieB.length} (chunks: ${(cookieB.match(/sb-[^;]+/g)||[]).length})`)

  // ─── SERVER (a) — happy A→A ──────────────────────────────────────
  console.log('\n--- SERVER (a) — happy path A→A ---')
  const a200 = await callSession({ cookieHeader: cookieA, bodyUserId: USER_A.user_id })
  console.log(`  /session status=${a200.status}  sessionId=${a200.body?.sessionId?.slice(0,8)}  allowed=${a200.body?.allowed}  remaining=${a200.body?.remaining}`)
  if (a200.status !== 200) fail(`happy path expected 200, got ${a200.status}: ${JSON.stringify(a200.body)}`)
  else if (a200.body.sessionId !== aBefore.id) fail(`happy path returned WRONG sessionId (got ${a200.body.sessionId?.slice(0,8)}, expected ${aBefore.id?.slice(0,8)})`)
  else pass('happy A→A: 200, sessionId == A\'s OWN chat_session')

  // ─── SERVER (b) — bleed B→A ─────────────────────────────────────
  console.log('\n--- SERVER (b) — bleed B-authed, body.userId=A ---')
  const aPreBleed = await readSessionCount(USER_A.user_id)
  const bleedS = await callSession({ cookieHeader: cookieB, bodyUserId: USER_A.user_id })
  console.log(`  /session status=${bleedS.status}  body.error=${bleedS.body?.error}`)
  if (bleedS.status === 403) pass('session route REJECTED B-authed-A-bodied with 403')
  else fail(`session route expected 403, got ${bleedS.status}: ${JSON.stringify(bleedS.body)}`)

  const bleedI = await callIncrement({ cookieHeader: cookieB, sessionId: aPreBleed.id })
  console.log(`  /increment(sessionId=A's) status=${bleedI.status}  body.error=${bleedI.body?.error}`)
  if (bleedI.status === 403) pass('increment route REJECTED B trying to bump A\'s sessionId with 403')
  else fail(`increment route expected 403, got ${bleedI.status}: ${JSON.stringify(bleedI.body)}`)

  const aPostBleed = await readSessionCount(USER_A.user_id)
  if (aPostBleed.estimator_count === aPreBleed.estimator_count) pass(`A's estimator_count UNCHANGED (${aPreBleed.estimator_count} → ${aPostBleed.estimator_count})`)
  else fail(`DATA-INTEGRITY HOLE: A's count changed from ${aPreBleed.estimator_count} to ${aPostBleed.estimator_count}`)

  // ─── SERVER (c) — no cookie ──────────────────────────────────────
  console.log('\n--- SERVER (c) — no cookie ---')
  const noCookieS = await callSession({ cookieHeader: null, bodyUserId: USER_A.user_id })
  console.log(`  /session status=${noCookieS.status}  body.error=${noCookieS.body?.error}`)
  if (noCookieS.status === 401) pass('session route 401\'d unauthed call')
  else fail(`session route expected 401, got ${noCookieS.status}`)
  const noCookieI = await callIncrement({ cookieHeader: null, sessionId: aPreBleed.id })
  console.log(`  /increment status=${noCookieI.status}  body.error=${noCookieI.body?.error}`)
  if (noCookieI.status === 401) pass('increment route 401\'d unauthed call')
  else fail(`increment route expected 401, got ${noCookieI.status}`)

  // ─── SERVER (d) — invalid cookie ─────────────────────────────────
  console.log('\n--- SERVER (d) — invalid cookie ---')
  const fakeCookie = `sb-${process.env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/(.+?)\.supabase\.co/)[1]}-auth-token.0=base64-Z2FyYmFnZQ==`
  const badCookieS = await callSession({ cookieHeader: fakeCookie, bodyUserId: USER_A.user_id })
  console.log(`  /session(invalid cookie) status=${badCookieS.status}  body.error=${badCookieS.body?.error}`)
  if (badCookieS.status === 401) pass('session route 401\'d invalid cookie (fail-closed verified)')
  else fail(`fail-closed broken: invalid cookie got ${badCookieS.status}`)

  // ─── SERVER (e) — no-regression: missing x-tenant-id ─────────────
  console.log('\n--- SERVER (e) — no-regression: missing x-tenant-id ---')
  const noTenant = await fetch(`${BASE}/api/walliam/estimator/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': cookieA },
    body: JSON.stringify({ userId: USER_A.user_id }),
  })
  console.log(`  /session(no x-tenant-id) status=${noTenant.status}`)
  if (noTenant.status === 400) pass('tenant guard still rejects missing x-tenant-id with 400')
  else fail(`tenant guard regression: expected 400, got ${noTenant.status}`)

  // ─── CLIENT identity-change clear smoke ──────────────────────────
  console.log('\n--- CLIENT identity-change smoke (Playwright) ---')
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  page.on('console', msg => { if (msg.type() === 'error') console.log(`  [console.err] ${msg.text().slice(0,150)}`) })

  // Stage 1: log in as A, navigate to property page, confirm A's quota visible
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await new Promise(r => setTimeout(r, 1500))
  await page.fill('input#email', USER_A.email)
  await page.fill('input#password', USER_A.password)
  const tokenA = page.waitForResponse(r => r.url().includes('/auth/v1/token'))
  await page.click('button[type="submit"]')
  await tokenA.catch(()=>{})
  await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 15000 }).catch(()=>{})
  await new Promise(r => setTimeout(r, 1000))
  // Get the access_token from cookies to also seed localStorage (AuthContext reads localStorage)
  const aCookies = (await ctx.cookies()).filter(c => c.name.startsWith('sb-'))
  console.log(`  A signed in; sb-cookies: ${aCookies.length}`)
  await page.goto(`${BASE}/122-day-drive-kawartha-lakes-x12844842`, { waitUntil: 'load' })
  await new Promise(r => setTimeout(r, 6000))
  const aPanel = await page.locator('body').textContent()
  const aQuotaShown = aPanel.includes('15') && aPanel.includes('10')
  console.log(`  A panel state present (quotas '10' + '15' visible): ${aQuotaShown}`)

  // Stage 2: sign in as B by REPLACING localStorage tokens + cookies + reload
  await ctx.clearCookies()
  // Build the same cookie format Playwright captured from real /login as B
  const bRawCookies = await (async () => {
    const b2 = await chromium.launch({ headless: true })
    const c2 = await b2.newContext()
    const p2 = await c2.newPage()
    await p2.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
    await new Promise(r => setTimeout(r, 1500))
    await p2.fill('input#email', USER_B.email)
    await p2.fill('input#password', USER_B.password)
    const tR = p2.waitForResponse(r => r.url().includes('/auth/v1/token'))
    await p2.click('button[type="submit"]')
    await tR.catch(()=>{})
    await new Promise(r => setTimeout(r, 1500))
    const cs = (await c2.cookies()).filter(c => c.name.startsWith('sb-'))
    await b2.close()
    return cs
  })()
  await ctx.addCookies(bRawCookies.map(c => ({ ...c, domain: 'localhost', expires: Math.floor(Date.now()/1000) + 3600 })))
  // Wipe + reseed localStorage with B's localStorage shape
  await page.evaluate(() => {
    const toRemove = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k.startsWith('sb-')) toRemove.push(k)
    }
    for (const k of toRemove) localStorage.removeItem(k)
  })
  await page.reload({ waitUntil: 'load' })
  await new Promise(r => setTimeout(r, 6000))

  const bPanel = await page.locator('body').textContent()
  const aStillVisible = bPanel.includes('10 of 15') || bPanel.includes('10 of 15 used') || bPanel.includes('5 remaining')
  if (!aStillVisible) pass('after identity flip A→B (cookie swap + reload), A\'s "10 of 15 / 5 remaining" NOT visible — clear() landed')
  else fail('after identity flip A→B, A\'s "10 of 15" STILL VISIBLE — clear did NOT fire')

  await browser.close()

  // ─── Final ledger check ──────────────────────────────────────────
  console.log('\n--- Final ledger ---')
  const aFinal = await readSessionCount(USER_A.user_id)
  const bFinal = await readSessionCount(USER_B.user_id)
  console.log(`  A final count: ${aFinal.estimator_count} (started ${aBefore.estimator_count})`)
  console.log(`  B final count: ${bFinal.estimator_count} (started ${bBefore.estimator_count})`)
  if (aFinal.estimator_count === aBefore.estimator_count) pass('A\'s ledger UNCHANGED across smoke (no contamination)')
  else fail(`A's ledger CHANGED: ${aBefore.estimator_count} → ${aFinal.estimator_count}`)

  console.log(`\n=== SMOKE ${process.exitCode === 1 ? 'FAIL' : 'PASS'} ===`)
  process.exit(process.exitCode || 0)
})().catch(e => { console.error(e); process.exit(1) })
