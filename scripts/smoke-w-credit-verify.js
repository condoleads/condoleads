/**
 * scripts/smoke-w-credit-verify.js
 *
 * Phase C smoke for W-CREDIT-VERIFY (Apr 30, 2026).
 * 8 scenarios. Delta-based assertions. Re-runnable. No mock data.
 *
 * Run:    node scripts\smoke-w-credit-verify.js
 * Mode:   local dev (per V4). Requires `npm run dev` running on APP_BASE_URL.
 *
 * Required .env.local entries:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SMOKE_TEST_EMAIL             dedicated smoke/test user (NOT your real admin)
 *   SMOKE_TEST_PASSWORD          password for SMOKE_TEST_EMAIL
 *
 * Optional .env.local entries (sensible defaults applied):
 *   APP_BASE_URL                 default: http://localhost:3000
 *   WALLIAM_TENANT_ID            default: b16e1039-38ed-43d7-bbc5-dd02bb651bc9
 *
 * Exits non-zero if any scenario FAILs.
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

// ─── Env (validated in preflight) ──────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000'
const SMOKE_TEST_EMAIL = process.env.SMOKE_TEST_EMAIL
const SMOKE_TEST_PASSWORD = process.env.SMOKE_TEST_PASSWORD
const WALLIAM_TENANT_ID = process.env.WALLIAM_TENANT_ID || 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'

// ─── Reporters ─────────────────────────────────────────────────────────────

const results = []
function record(name, status, detail) {
  results.push({ name, status, detail })
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⏭ '
  console.log(`  ${icon} ${status} — ${name}${detail ? ` :: ${detail}` : ''}`)
}
const pass = (name, detail) => record(name, 'PASS', detail)
const fail = (name, detail) => record(name, 'FAIL', detail)
const defer = (name, detail) => record(name, 'DEFER', detail)

// ─── Clients ───────────────────────────────────────────────────────────────

let sbAdmin, sbAnon

function buildClients() {
  sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  sbAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// ─── Auth helpers ──────────────────────────────────────────────────────────

async function signIn() {
  const { data, error } = await sbAnon.auth.signInWithPassword({
    email: SMOKE_TEST_EMAIL,
    password: SMOKE_TEST_PASSWORD,
  })
  if (error || !data.session) throw new Error(`Sign in failed: ${error?.message || 'no session'}`)
  return data.session
}

function buildAuthCookie(session) {
  const projectRef = SUPABASE_URL.match(/https:\/\/(.+?)\.supabase\.co/)?.[1]
  if (!projectRef) throw new Error('Cannot derive Supabase project ref from URL')
  const cookieName = `sb-${projectRef}-auth-token`
  const cookieValue = JSON.stringify([session.access_token, session.refresh_token])
  return `${cookieName}=${encodeURIComponent(cookieValue)}`
}

// ─── Fetch helpers ─────────────────────────────────────────────────────────

async function fetchCharlie({ session, body, extraHeaders = {}, expectStream = true }) {
  const headers = {
    'Content-Type': 'application/json',
    'x-tenant-id': WALLIAM_TENANT_ID,
    ...extraHeaders,
  }
  if (session) headers['Cookie'] = buildAuthCookie(session)

  const res = await fetch(`${APP_BASE_URL}/api/charlie`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!expectStream || !res.ok) return { status: res.status, body: await res.text().catch(() => '') }

  // Drain the SSE stream with proper line buffering across chunk boundaries.
  // SSE chunks can split mid-line — must buffer until a complete line (\n or \r\n) arrives.
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let assistantText = ''
  let doneSeen = false
  let gateSeen = false
  let errorMessage = null
  let buffer = ''
  const eventsSeen = []
  let parseErrors = 0

  function processLine(line) {
    if (!line.startsWith('data: ')) return
    const json = line.slice(6).trim()
    if (!json) return
    try {
      const ev = JSON.parse(json)
      eventsSeen.push(ev.type)
      if (ev.type === 'text') assistantText += ev.content || ''
      if (ev.type === 'done') doneSeen = true
      if (ev.type === 'gate') gateSeen = true
      if (ev.type === 'error') errorMessage = ev.message || '<no message>'
    } catch {
      parseErrors++
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      buffer += decoder.decode()
      for (const line of buffer.split(/\r?\n/)) processLine(line)
      break
    }
    buffer += decoder.decode(value, { stream: true })
    let lineEnd
    while ((lineEnd = buffer.search(/\r?\n/)) !== -1) {
      const newlineLen = (buffer[lineEnd] === '\r' && buffer[lineEnd + 1] === '\n') ? 2 : 1
      const line = buffer.slice(0, lineEnd)
      buffer = buffer.slice(lineEnd + newlineLen)
      processLine(line)
    }
  }

  return { status: res.status, assistantText, doneSeen, gateSeen, errorMessage, eventsSeen, parseErrors }
}

async function getOrCreateSession(session) {
  const cookie = buildAuthCookie(session)
  const res = await fetch(`${APP_BASE_URL}/api/walliam/charlie/session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-id': WALLIAM_TENANT_ID,
      'Cookie': cookie,
    },
    body: JSON.stringify({ userId: session.user.id, read_only: false }),
  })
  if (!res.ok) throw new Error(`Session route failed: ${res.status} ${await res.text()}`)
  const data = await res.json()

  // Reset counters on the smoke session so the test runs from a clean slate.
  if (data.sessionId) {
    const { error } = await sbAdmin.from('chat_sessions')
      .update({
        message_count: 0,
        buyer_plans_used: 0,
        seller_plans_used: 0,
        estimator_count: 0,
        manual_approvals_count: 0,
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', data.sessionId)
    if (error) console.warn(`  ⚠ smoke fixture reset failed: ${error.message}`)
  }

  return data
}

// ─── DB query helpers ──────────────────────────────────────────────────────

async function countMessages({ userId, sessionId } = {}) {
  let q = sbAdmin.from('chat_messages_v2').select('id', { count: 'exact', head: true })
    .eq('tenant_id', WALLIAM_TENANT_ID)
  if (userId) q = q.eq('user_id', userId)
  if (sessionId) q = q.eq('session_id', sessionId)
  const { count, error } = await q
  if (error) throw new Error(`countMessages: ${error.message}`)
  return count ?? 0
}

async function getSessionRow(sessionId) {
  const { data, error } = await sbAdmin.from('chat_sessions').select('*').eq('id', sessionId).single()
  if (error) throw new Error(`getSessionRow: ${error.message}`)
  return data
}

// ─── Preflight ─────────────────────────────────────────────────────────────

async function preflight() {
  console.log('── Preflight ─────────────────────────────────')

  const missing = []
  if (!SUPABASE_URL) missing.push('NEXT_PUBLIC_SUPABASE_URL')
  if (!SUPABASE_ANON_KEY) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (!SMOKE_TEST_EMAIL) missing.push('SMOKE_TEST_EMAIL')
  if (!SMOKE_TEST_PASSWORD) missing.push('SMOKE_TEST_PASSWORD')
  if (missing.length) {
    console.error('  ❌ Missing env in .env.local:')
    missing.forEach(m => console.error(`     - ${m}`))
    process.exit(1)
  }
  console.log('  ✅ env vars present')

  buildClients()

  try {
    const ping = await fetch(`${APP_BASE_URL}/`, { method: 'HEAD' })
    if (!ping.ok && ping.status !== 405) throw new Error(`status ${ping.status}`)
    console.log(`  ✅ dev server reachable @ ${APP_BASE_URL}`)
  } catch (err) {
    console.error(`  ❌ dev server not reachable @ ${APP_BASE_URL} — start with: npm run dev`)
    process.exit(1)
  }

  const { data: users, error: ueErr } = await sbAdmin.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (ueErr) { console.error(`  ❌ listUsers failed: ${ueErr.message}`); process.exit(1) }
  const user = users.users.find(u => u.email === SMOKE_TEST_EMAIL)
  if (!user) { console.error(`  ❌ Test user not found: ${SMOKE_TEST_EMAIL}`); process.exit(1) }
  console.log(`  ✅ test user exists: ${SMOKE_TEST_EMAIL} (${user.id})`)

  const { data: tenant, error: tErr } = await sbAdmin.from('tenants').select('id, domain, name, anthropic_api_key').eq('id', WALLIAM_TENANT_ID).single()
  if (tErr || !tenant) { console.error(`  ❌ Tenant not found: ${WALLIAM_TENANT_ID}`); process.exit(1) }
  console.log(`  ✅ tenant exists: ${tenant.name} / ${tenant.domain}`)

  // NEW: Diagnostic — show whether tenant has an anthropic_api_key (without revealing the value)
  const hasKey = !!tenant.anthropic_api_key
  const keyLen = tenant.anthropic_api_key?.length || 0
  const keyFp = hasKey && keyLen >= 10
    ? `${tenant.anthropic_api_key.substring(0, 7)}...${tenant.anthropic_api_key.substring(keyLen - 4)}`
    : '(none)'
  console.log(`  ${hasKey ? '✅' : '⚠'} tenant.anthropic_api_key: ${hasKey ? `present, fingerprint=${keyFp}, length=${keyLen}` : 'MISSING — fallback to env ANTHROPIC_API_KEY'}`)
  if (!hasKey) {
    const envKey = process.env.ANTHROPIC_API_KEY
    const envLen = envKey?.length || 0
    const envFp = envKey && envLen >= 10
      ? `${envKey.substring(0, 7)}...${envKey.substring(envLen - 4)}`
      : '(none)'
    console.log(`  ${envKey ? '✅' : '❌'} env.ANTHROPIC_API_KEY: ${envKey ? `present, fingerprint=${envFp}, length=${envLen}` : 'MISSING'}`)
  }

  console.log()
  return user.id
}

// ─── Scenarios ─────────────────────────────────────────────────────────────

async function scenario_C1_loggedInSend(session) {
  console.log('── C1: Logged-in user sends Charlie message ──')
  try {
    const sessionResp = await getOrCreateSession(session)
    if (!sessionResp.sessionId) return fail('C1', 'no sessionId returned from /session')

    const before = await countMessages({ sessionId: sessionResp.sessionId })

    const result = await fetchCharlie({
      session,
      body: {
        messages: [{ role: 'user', content: 'C1 smoke: what is the capital of Canada?' }],
        sessionId: sessionResp.sessionId,
        userId: session.user.id,
        geoContext: null,
      },
    })

    if (result.status !== 200) return fail('C1', `unexpected status ${result.status}`)
    if (result.errorMessage) return fail('C1', `server emitted error event: "${result.errorMessage}"`)
    if (result.gateSeen) return fail('C1', `unexpected gate event — events: [${result.eventsSeen.join(',')}]. Counter may not have been reset.`)
    if (!result.doneSeen) return fail('C1', `stream ended without "done" event — events seen: [${result.eventsSeen.join(',')}], parseErrors=${result.parseErrors}`)

    await new Promise(r => setTimeout(r, 1500))
    const after = await countMessages({ sessionId: sessionResp.sessionId })
    const delta = after - before

    if (delta < 2) return fail('C1', `expected ≥2 new messages (user+assistant), got ${delta}`)

    const { data: latest } = await sbAdmin.from('chat_messages_v2')
      .select('tenant_id, user_id, session_id, role')
      .eq('session_id', sessionResp.sessionId)
      .order('created_at', { ascending: false }).limit(1).single()
    if (!latest) return fail('C1', 'could not read latest message row')
    if (latest.tenant_id !== WALLIAM_TENANT_ID) return fail('C1', `tenant_id mismatch: ${latest.tenant_id}`)
    if (latest.user_id !== session.user.id) return fail('C1', `user_id mismatch: ${latest.user_id}`)
    if (latest.session_id !== sessionResp.sessionId) return fail('C1', `session_id mismatch`)

    pass('C1', `Δ=${delta} rows, last role=${latest.role}, all FK columns populated`)
  } catch (err) {
    fail('C1', `exception: ${err.message}`)
  }
}

async function scenario_C2_anonRejected() {
  console.log('── C2: Anonymous POST to /api/charlie rejected ──')
  try {
    const before = await countMessages({})
    const res = await fetchCharlie({
      session: null,
      body: {
        messages: [{ role: 'user', content: 'C2 smoke: should be rejected' }],
        sessionId: null,
        userId: null,
        geoContext: null,
      },
      expectStream: false,
    })
    await new Promise(r => setTimeout(r, 800))
    const after = await countMessages({})
    const delta = after - before

    if (![401, 403].includes(res.status)) return fail('C2', `expected 401/403, got ${res.status}`)
    if (delta !== 0) return fail('C2', `chat_messages_v2 grew by ${delta} rows — bleed!`)
    pass('C2', `status=${res.status}, no DB write`)
  } catch (err) {
    fail('C2', `exception: ${err.message}`)
  }
}

async function scenario_C3_creditDeduction(session) {
  console.log('── C3: Send N messages where N = tenant.ai_free_messages ──')
  try {
    const sessionResp = await getOrCreateSession(session)
    if (!sessionResp.sessionId) return fail('C3', 'no sessionId returned')

    // Self-adapting: read tenant config to determine free-message allowance.
    // Without this, the smoke trips chat_limit gate when N > tenant.ai_free_messages.
    const { data: tenantCfg, error: cfgErr } = await sbAdmin.from('tenants')
      .select('ai_free_messages, ai_hard_cap')
      .eq('id', WALLIAM_TENANT_ID).single()
    if (cfgErr || !tenantCfg) return fail('C3', `could not read tenant config: ${cfgErr?.message}`)
    const N = tenantCfg.ai_free_messages ?? 3
    if (N < 1) return fail('C3', `tenant.ai_free_messages = ${N} — cannot test`)

    const beforeRow = await getSessionRow(sessionResp.sessionId)
    const beforeCount = beforeRow.message_count || 0
    const beforeMsgs = await countMessages({ sessionId: sessionResp.sessionId })

    for (let i = 0; i < N; i++) {
      const r = await fetchCharlie({
        session,
        body: {
          messages: [{ role: 'user', content: `C3 smoke message ${i + 1} of ${N}` }],
          sessionId: sessionResp.sessionId,
          userId: session.user.id,
          geoContext: null,
        },
      })
      if (r.errorMessage) return fail('C3', `message ${i+1}: server error="${r.errorMessage}"`)
      if (r.status !== 200 || !r.doneSeen || r.gateSeen) return fail('C3', `message ${i+1}: status=${r.status} done=${r.doneSeen} gate=${r.gateSeen} events=[${(r.eventsSeen||[]).join(',')}]`)
      await new Promise(r => setTimeout(r, 400))
    }

    await new Promise(r => setTimeout(r, 1500))
    const afterRow = await getSessionRow(sessionResp.sessionId)
    const afterCount = afterRow.message_count || 0
    const afterMsgs = await countMessages({ sessionId: sessionResp.sessionId })

    const counterDelta = afterCount - beforeCount
    const msgDelta = afterMsgs - beforeMsgs

    if (counterDelta !== N) return fail('C3', `message_count Δ expected ${N}, got ${counterDelta} (tenant.ai_free_messages=${N})`)
    if (msgDelta < N * 2) return fail('C3', `chat_messages_v2 Δ expected ≥${N*2}, got ${msgDelta}`)

    pass('C3', `N=${N} (from tenant config), counter Δ=${counterDelta}, rows Δ=${msgDelta}`)
  } catch (err) {
    fail('C3', `exception: ${err.message}`)
  }
}

async function scenario_C4_concurrencyRace(session) {
  console.log('── C4: Two concurrent sends, no lost/duplicated rows ──')
  try {
    const sessionResp = await getOrCreateSession(session)
    if (!sessionResp.sessionId) return fail('C4', 'no sessionId returned')

    const beforeRow = await getSessionRow(sessionResp.sessionId)
    const beforeCount = beforeRow.message_count || 0
    const beforeMsgs = await countMessages({ sessionId: sessionResp.sessionId })

    const send = (n) => fetchCharlie({
      session,
      body: {
        messages: [{ role: 'user', content: `C4 race message ${n}` }],
        sessionId: sessionResp.sessionId,
        userId: session.user.id,
        geoContext: null,
      },
    })

    const [r1, r2] = await Promise.all([send('A'), send('B')])
    if (r1.errorMessage || r2.errorMessage) {
      return fail('C4', `server errors: A="${r1.errorMessage || 'none'}" B="${r2.errorMessage || 'none'}"`)
    }
    if (r1.status !== 200 || r2.status !== 200) return fail('C4', `statuses ${r1.status}/${r2.status}`)
    if (!r1.doneSeen || !r2.doneSeen || r1.gateSeen || r2.gateSeen) {
      return fail('C4', `done events: ${r1.doneSeen}/${r2.doneSeen} gates: ${r1.gateSeen}/${r2.gateSeen} — events A=[${(r1.eventsSeen||[]).join(',')}] B=[${(r2.eventsSeen||[]).join(',')}]`)
    }

    await new Promise(r => setTimeout(r, 2000))
    const afterRow = await getSessionRow(sessionResp.sessionId)
    const counterDelta = (afterRow.message_count || 0) - beforeCount
    const msgDelta = (await countMessages({ sessionId: sessionResp.sessionId })) - beforeMsgs

    if (counterDelta < 2) return fail('C4', `LOST INCREMENT — counter Δ=${counterDelta} (race condition F5 confirmed)`)
    if (msgDelta < 4) return fail('C4', `chat_messages_v2 Δ=${msgDelta} (expected ≥4)`)

    pass('C4', `counter Δ=${counterDelta}, rows Δ=${msgDelta}`)
  } catch (err) {
    fail('C4', `exception: ${err.message}`)
  }
}

async function scenario_C5_crossTenant() {
  console.log('── C5: Cross-tenant isolation ──')
  defer('C5', 'no tenant-2 exists — verifies on W-MULTITENANT smoke when second tenant onboards')
}

async function scenario_C6_botUserAgent() {
  console.log('── C6: Bot user-agent rejected ──')
  try {
    const before = await countMessages({})
    const res = await fetchCharlie({
      session: null,
      body: {
        messages: [{ role: 'user', content: 'C6 smoke: bot fingerprint' }],
        sessionId: null,
        userId: null,
        geoContext: null,
      },
      extraHeaders: { 'User-Agent': 'curl/8.0.1' },
      expectStream: false,
    })
    await new Promise(r => setTimeout(r, 800))
    const after = await countMessages({})
    const delta = after - before

    if (![401, 403].includes(res.status)) return fail('C6', `expected 401/403, got ${res.status}`)
    if (delta !== 0) return fail('C6', `bleed: chat_messages_v2 grew by ${delta} rows`)
    pass('C6', `status=${res.status}, no DB write`)
  } catch (err) {
    fail('C6', `exception: ${err.message}`)
  }
}

async function scenario_C7_lowCreditEmail(session, userId) {
  console.log('── C7: Low-credit threshold flag ──')
  try {
    const { data: tu, error } = await sbAdmin.from('tenant_users')
      .select('low_credit_email_sent')
      .eq('user_id', userId)
      .eq('tenant_id', WALLIAM_TENANT_ID)
      .maybeSingle()

    if (error) return fail('C7', `tenant_users read failed: ${error.message}`)
    if (!tu) return defer('C7', 'no tenant_users row — needs registration smoke first')

    const flagDisplay = tu.low_credit_email_sent === null ? 'null'
      : typeof tu.low_credit_email_sent === 'object' ? JSON.stringify(tu.low_credit_email_sent)
      : String(tu.low_credit_email_sent)
    pass('C7', `flag readable, current value = ${flagDisplay} (not exercised end-to-end here)`)
  } catch (err) {
    fail('C7', `exception: ${err.message}`)
  }
}

async function scenario_C8_uniqueIndexEnforced(userId) {
  console.log('── C8: Phase 8 unique index enforced ──')
  try {
    const { data: existing } = await sbAdmin.from('chat_sessions')
      .select('id, source')
      .eq('user_id', userId)
      .eq('tenant_id', WALLIAM_TENANT_ID)
      .in('status', ['active', 'vip'])
      .limit(1).single()

    if (!existing) return defer('C8', 'no active walliam session to test against — re-run after C1')

    const { error: insErr } = await sbAdmin.from('chat_sessions').insert({
      user_id: userId,
      tenant_id: WALLIAM_TENANT_ID,
      source: existing.source,
      session_token: 'C8-smoke-duplicate-attempt',
      status: 'active',
      message_count: 0,
      buyer_plans_used: 0,
      seller_plans_used: 0,
    })

    if (!insErr) {
      await sbAdmin.from('chat_sessions').delete().eq('session_token', 'C8-smoke-duplicate-attempt')
      return fail('C8', 'duplicate INSERT succeeded — unique index NOT enforced')
    }
    if (insErr.code !== '23505') return fail('C8', `unexpected error code ${insErr.code}: ${insErr.message}`)

    pass('C8', `23505 unique violation raised as expected`)
  } catch (err) {
    fail('C8', `exception: ${err.message}`)
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== W-CREDIT-VERIFY Phase C smoke ===')
  console.log(`Date: ${new Date().toISOString()}`)
  console.log(`Mode: local dev / baseline run\n`)

  const userId = await preflight()

  console.log('── Sign in ───────────────────────────────────')
  const session = await signIn()
  console.log(`  ✅ signed in as ${SMOKE_TEST_EMAIL}\n`)

  await scenario_C1_loggedInSend(session)
  await scenario_C2_anonRejected()
  await scenario_C3_creditDeduction(session)
  await scenario_C4_concurrencyRace(session)
  await scenario_C5_crossTenant()
  await scenario_C6_botUserAgent()
  await scenario_C7_lowCreditEmail(session, userId)
  await scenario_C8_uniqueIndexEnforced(userId)

  console.log('\n=== Summary ===')
  const counts = { PASS: 0, FAIL: 0, DEFER: 0 }
  for (const r of results) counts[r.status]++
  console.log(`  PASS:  ${counts.PASS}/8`)
  console.log(`  FAIL:  ${counts.FAIL}/8`)
  console.log(`  DEFER: ${counts.DEFER}/8`)

  if (counts.FAIL > 0) {
    console.log('\n  Failed scenarios:')
    for (const r of results.filter(r => r.status === 'FAIL')) {
      console.log(`    - ${r.name}: ${r.detail}`)
    }
    process.exit(1)
  }
  process.exit(0)
}

main().catch(err => {
  console.error('\n💥 Unhandled error:', err.message)
  console.error(err.stack)
  process.exit(2)
})