// W-CREDIT-BLEED-PHASE2 iteration 1a — runtime smoke.
// Verifies: post-register checkAndEstimate uses confirmedUserId (NOT stale
// closure) → Phase 1's server gate returns 200 (not 403). Plus: no-regression
// on the already-signed-in path (uidArg absent → user?.id used → 200).

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
    method: 'POST', headers, body: JSON.stringify({ userId: bodyUserId }),
  })
  let body = null; try { body = await res.json() } catch {}
  return { status: res.status, body }
}

;(async () => {
  console.log('=== W-CREDIT-BLEED-PHASE2 iteration 1a smoke ===')
  console.log(`base: ${BASE}`)
  // Snapshot A's count
  const { data: aRow } = await sbAdmin.from('chat_sessions').select('estimator_count').eq('user_id', USER_A.user_id).eq('tenant_id', TENANT_ID).order('updated_at', { ascending: false }).limit(1).maybeSingle()
  console.log(`\nPRE-STATE  A(${USER_A.email}) count=${aRow?.estimator_count}`)

  // ─── (1) No-regression: signed-in A POSTs with A's id → 200 ────
  console.log('\n--- (1) No-regression: A-authed body=A (same as Phase 1 happy) ---')
  const cookieA = await playwrightLogin(USER_A.email, USER_A.password)
  console.log(`  A cookie chunks: ${(cookieA.match(/sb-[^;]+/g) || []).length}`)
  const r1 = await postSession({ cookieHeader: cookieA, bodyUserId: USER_A.user_id })
  console.log(`  /session status=${r1.status}  totalAllowed=${r1.body?.totalAllowed}  remaining=${r1.body?.remaining}`)
  if (r1.status === 200 && r1.body.allowed) pass('A→A still works (no regression on signed-in happy path)')
  else fail(`A→A expected 200/allowed, got ${r1.status}: ${JSON.stringify(r1.body)}`)

  // ─── (2) The Phase 2 invariant: register-then-immediate-estimate ─
  // The fix routes confirmedUserId from RegisterModal.onSuccess →
  // checkAndEstimate(uidArg) → gate POST body.userId.
  // We can't drive the register-then-checkAndEstimate handoff via fetch
  // alone (that's a React lifecycle), but we CAN verify the equivalent
  // invariant: a fresh user's cookie + fresh user's body.userId → 200.
  // This is the state Phase 2 produces by passing confirmedUserId, vs
  // Phase 1's 403 when the body carries a stale (prior) user's id.
  console.log('\n--- (2) Fresh-user equivalent: B-authed body=B → 200 (Phase 2 happy) ---')
  const cookieB = await playwrightLogin(USER_B.email, USER_B.password)
  const r2 = await postSession({ cookieHeader: cookieB, bodyUserId: USER_B.user_id })
  console.log(`  /session status=${r2.status}  totalAllowed=${r2.body?.totalAllowed}`)
  if (r2.status === 200) pass('B-authed-B-bodied → 200 (the Phase 2 register-handoff produces this shape)')
  else fail(`B-authed-B-bodied expected 200, got ${r2.status}`)

  // ─── (3) Phase 1 invariant preserved: B-authed body=A → 403 ─────
  // Confirms Phase 2 didn't loosen the server gate.
  console.log('\n--- (3) Phase-1 preserved: B-authed body=A → 403 (the wrong-uid case) ---')
  const r3 = await postSession({ cookieHeader: cookieB, bodyUserId: USER_A.user_id })
  console.log(`  /session status=${r3.status}  body.error=${r3.body?.error}`)
  if (r3.status === 403) pass('Phase 1 gate still rejects wrong-uid (Phase 2 didn\'t loosen)')
  else fail(`Phase 1 gate regression: expected 403, got ${r3.status}`)

  // ─── (4) Code-level proof: read the patched files and assert
  //     `uidArg` and `uid` appear in checkAndEstimate
  console.log('\n--- (4) Code-level structural proof ---')
  const fs = require('fs')
  const buyer = fs.readFileSync('app/estimator/components/EstimatorBuyerModal.tsx', 'utf8')
  const homeBuyer = fs.readFileSync('app/estimator/components/HomeEstimatorBuyerModal.tsx', 'utf8')
  const vip = fs.readFileSync('components/auth/VIPAIAccess.tsx', 'utf8')

  const checks = [
    ['EstimatorBuyerModal checkAndEstimate accepts uidArg', buyer.includes('checkAndEstimate = async (uidArg?: string)')],
    ['EstimatorBuyerModal POSTs uid (not user.id) in sessionBody', buyer.includes('{ userId: uid }') && buyer.includes('{ agentId, userId: uid, buildingId }')],
    ['EstimatorBuyerModal onSuccess threads confirmedUserId', buyer.includes('checkAndEstimate(confirmedUserId)')],
    ['EstimatorBuyerModal fires creditsCtx.refresh', buyer.includes('creditsCtx.refresh(undefined, confirmedUserId)')],
    ['HomeEstimatorBuyerModal checkAndEstimate accepts uidArg', homeBuyer.includes('checkAndEstimate = async (uidArg?: string)')],
    ['HomeEstimatorBuyerModal POSTs uid (not user.id) in sessionBody', homeBuyer.includes('{ userId: uid }') && homeBuyer.includes('{ agentId, userId: uid, buildingId:')],
    ['HomeEstimatorBuyerModal onSuccess threads confirmedUserId', homeBuyer.includes('checkAndEstimate(confirmedUserId)')],
    ['HomeEstimatorBuyerModal fires creditsCtx.refresh', homeBuyer.includes('creditsCtx.refresh(undefined, confirmedUserId)')],
    ['VIPAIAccess destructures refresh', vip.includes('const { state, refresh } = useCreditSession()')],
    ['VIPAIAccess nav-variant onSuccess fires refresh', vip.match(/refresh\(undefined, confirmedUserId\)\.catch/g)?.length >= 1],
    ['VIPAIAccess full-variant onSuccess fires refresh', vip.match(/refresh\(undefined, confirmedUserId\)\.catch/g)?.length === 2],
  ]
  for (const [label, ok] of checks) {
    if (ok) pass(label)
    else fail(label)
  }

  // ─── (5) Final ledger check ────────────────────────────────────
  console.log('\n--- (5) Final ledger ---')
  const { data: aFinal } = await sbAdmin.from('chat_sessions').select('estimator_count').eq('user_id', USER_A.user_id).eq('tenant_id', TENANT_ID).order('updated_at', { ascending: false }).limit(1).maybeSingle()
  console.log(`  A final count: ${aFinal?.estimator_count} (started ${aRow?.estimator_count})`)
  if (aFinal?.estimator_count === aRow?.estimator_count) pass('A\'s ledger UNCHANGED across smoke (no contamination)')
  else fail(`A's ledger CHANGED: ${aRow?.estimator_count} → ${aFinal?.estimator_count}`)

  console.log(`\n=== SMOKE ${process.exitCode === 1 ? 'FAIL' : 'PASS'} ===`)
  process.exit(process.exitCode || 0)
})().catch(e => { console.error(e); process.exit(1) })
