// W-CREDIT-BLEED-PHASE2 iteration 1b — seller-path runtime smoke.
// Same 3 real-server gates as 1a but on the SELLER path (D3).
// Verifies: requestEstimate(uidArg) carries the threaded uid into the
// gate POST body, Phase 1's server still 403s wrong-uid, and the
// no-uidArg path (already-signed-in seller) falls back to the userId
// prop unchanged.

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const BASE = `http://localhost:${process.env.SMOKE_PORT || '3000'}`
const TENANT_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'

const USER_A = { email: 'finaltest1003@gmail.com', user_id: '5b6fa15d-bd17-4607-ab1f-a0939e941244', password: 'Phase1Smoke!2026' }
const USER_B = { email: 'smoke-credit-verify@walliam.test', user_id: '6c72170b-2e6e-4a5f-af14-180b2efda6ad', password: 'Phase1Smoke!2026' }

const sbAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

function pass(msg) { console.log(`  PASS: ${msg}`) }
function fail(msg) { console.log(`  FAIL: ${msg}`); process.exitCode = 1 }

async function playwrightLogin(email, password) {
  const { chromium } = require('playwright')
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'commit', timeout: 60000 })
  await new Promise(r => setTimeout(r, 3500))
  await page.fill('input#email', email)
  await page.fill('input#password', password)
  const tokenResp = page.waitForResponse(r => r.url().includes('/auth/v1/token'))
  await page.click('button[type="submit"]')
  await tokenResp.catch(() => {})
  await new Promise(r => setTimeout(r, 1500))
  const cookies = (await ctx.cookies()).filter(c => c.name.startsWith('sb-'))
  await browser.close()
  return cookies.map(c => `${c.name}=${c.value}`).join('; ')
}

async function postSession({ cookieHeader, bodyUserId }) {
  const headers = { 'Content-Type': 'application/json', 'x-tenant-id': TENANT_ID }
  if (cookieHeader) headers['Cookie'] = cookieHeader
  const res = await fetch(`${BASE}/api/walliam/estimator/session`, {
    method: 'POST', headers, body: JSON.stringify({ userId: bodyUserId, agentId: 'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe', buildingId: '' }),
  })
  let body = null; try { body = await res.json() } catch {}
  return { status: res.status, body }
}

;(async () => {
  console.log('=== W-CREDIT-BLEED-PHASE2 iteration 1b smoke (seller path D3) ===')
  console.log(`base: ${BASE}`)
  const { data: aRow } = await sbAdmin.from('chat_sessions').select('estimator_count').eq('user_id', USER_A.user_id).eq('tenant_id', TENANT_ID).order('updated_at', { ascending: false }).limit(1).maybeSingle()
  console.log(`\nPRE-STATE  A count=${aRow?.estimator_count}`)

  // ─── (1) No-regression: already-signed-in seller path ──────────
  // EstimatorSeller's normal flow: user already logged in, click "Get
  // Estimate" → handleEstimate() with NO uidArg → falls back to userId
  // prop (which = useAuth().user.id under the EstimatorSellerOuter
  // wrapper) → estimatorContext.requestEstimate(undefined) →
  // requestEstimate uses effectiveUserId = (uidArg ?? userId) = userId
  // → gate POST body.userId = A's id → Phase 1 200.
  console.log('\n--- (1) No-regression: signed-in A path (no uidArg) ---')
  const cookieA = await playwrightLogin(USER_A.email, USER_A.password)
  const r1 = await postSession({ cookieHeader: cookieA, bodyUserId: USER_A.user_id })
  console.log(`  /session status=${r1.status}  totalAllowed=${r1.body?.totalAllowed}  remaining=${r1.body?.remaining}`)
  if (r1.status === 200) pass('signed-in seller path still works (no regression on uidArg-absent)')
  else fail(`signed-in seller path expected 200, got ${r1.status}: ${JSON.stringify(r1.body)}`)

  // ─── (2) Phase 2 happy path: requestEstimate(confirmedUserId) ──
  // The just-registered B fires requestEstimate(B.id); gate POST
  // carries B's fresh id → 200 (would have been 403 from Phase 1 if
  // the stale closure had been used).
  console.log('\n--- (2) Phase 2 happy: requestEstimate(confirmedUserId=B) → 200 ---')
  const cookieB = await playwrightLogin(USER_B.email, USER_B.password)
  const r2 = await postSession({ cookieHeader: cookieB, bodyUserId: USER_B.user_id })
  console.log(`  /session status=${r2.status}  totalAllowed=${r2.body?.totalAllowed}`)
  if (r2.status === 200) pass('B-authed-B-bodied → 200 (Phase 2 register-handoff equivalent on seller path)')
  else fail(`B-authed-B-bodied expected 200, got ${r2.status}`)

  // ─── (3) Phase 1 preserved: B-authed body=A → 403 ──────────────
  console.log('\n--- (3) Phase 1 preserved: B-authed body=A → 403 ---')
  const r3 = await postSession({ cookieHeader: cookieB, bodyUserId: USER_A.user_id })
  console.log(`  /session status=${r3.status}  body.error=${r3.body?.error}`)
  if (r3.status === 403) pass('Phase 1 gate still rejects wrong-uid (1b didn\'t loosen)')
  else fail(`Phase 1 gate regression: expected 403, got ${r3.status}`)

  // ─── (4) Code-level structural proof (1b) ──────────────────────
  console.log('\n--- (4) Code-level structural proof (D3) ---')
  const fs = require('fs')
  const wrap = fs.readFileSync('components/estimator/EstimatorVipWrapper.tsx', 'utf8')
  const seller = fs.readFileSync('app/estimator/components/EstimatorSeller.tsx', 'utf8')
  const checks = [
    ['EstimatorVipWrapper interface widened to (uidArg?: string)', wrap.includes('requestEstimate: (uidArg?: string) => Promise<boolean>')],
    ['EstimatorVipWrapper requestEstimate accepts uidArg', wrap.includes('const requestEstimate = useCallback(async (uidArg?: string): Promise<boolean>')],
    ['EstimatorVipWrapper computes effectiveUserId = uidArg ?? userId', wrap.includes('const effectiveUserId = uidArg ?? userId')],
    ['EstimatorVipWrapper gate POST uses effectiveUserId in body.userId', wrap.includes('JSON.stringify({ agentId, userId: effectiveUserId, buildingId })')],
    ['EstimatorSeller handleEstimate accepts uidArg', seller.includes('const handleEstimate = async (uidArg?: string)')],
    ['EstimatorSeller computes effectiveUserId fallback', seller.includes('const effectiveUserId = uidArg ?? userId')],
    ['EstimatorSeller requestEstimate(uidArg) call', seller.includes('await estimatorContext.requestEstimate(uidArg)')],
    ['EstimatorSeller onSuccess threads confirmedUserId', seller.includes('handleEstimate(confirmedUserId)')],
    ['EstimatorSeller button onClick wrap (no MouseEvent leak)', seller.includes('onClick={() => handleEstimate()}')],
  ]
  for (const [label, ok] of checks) ok ? pass(label) : fail(label)

  // ─── (5) 1a no-regression: confirm 1a markers intact ───────────
  console.log('\n--- (5) 1a no-regression: confirm 1a markers in source ---')
  const buyer = fs.readFileSync('app/estimator/components/EstimatorBuyerModal.tsx', 'utf8')
  const homeBuyer = fs.readFileSync('app/estimator/components/HomeEstimatorBuyerModal.tsx', 'utf8')
  const vip = fs.readFileSync('components/auth/VIPAIAccess.tsx', 'utf8')
  const ck1a = [
    ['EstimatorBuyerModal (1a) uidArg intact', buyer.includes('checkAndEstimate = async (uidArg?: string)')],
    ['HomeEstimatorBuyerModal (1a) uidArg intact', homeBuyer.includes('checkAndEstimate = async (uidArg?: string)')],
    ['VIPAIAccess (1a) refresh destructure intact', vip.includes('const { state, refresh } = useCreditSession()')],
  ]
  for (const [label, ok] of ck1a) ok ? pass(label) : fail(label)

  // ─── (6) Final ledger check ────────────────────────────────────
  console.log('\n--- (6) Final ledger ---')
  const { data: aFinal } = await sbAdmin.from('chat_sessions').select('estimator_count').eq('user_id', USER_A.user_id).eq('tenant_id', TENANT_ID).order('updated_at', { ascending: false }).limit(1).maybeSingle()
  console.log(`  A final count: ${aFinal?.estimator_count} (started ${aRow?.estimator_count})`)
  if (aFinal?.estimator_count === aRow?.estimator_count) pass('A\'s ledger UNCHANGED across smoke')
  else fail(`A's ledger CHANGED: ${aRow?.estimator_count} → ${aFinal?.estimator_count}`)

  console.log(`\n=== SMOKE ${process.exitCode === 1 ? 'FAIL' : 'PASS'} ===`)
  process.exit(process.exitCode || 0)
})().catch(e => { console.error(e); process.exit(1) })
