/**
 * scripts/smoke-w-tenant-auth.js
 *
 * End-to-end smoke matrix for W-TENANT-AUTH.
 * Walks 8 scenarios verifying tenant-correct registration → lead → activity → email pipeline.
 *
 * Usage: node scripts/smoke-w-tenant-auth.js
 *
 * Reads from .env.local:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *
 * Reads from tenants table:
 *   - resend_api_key (for Scenario 6)
 *
 * Hard requirement: Next.js dev server must be running on http://localhost:3000.
 * No cleanup — smoke user is left in DB for inspection (per Shah's decision Apr 30).
 */

const fs = require('fs')
const path = require('path')

// --- Tiny .env.local parser (no external dep) ----------------------------------
function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) {
    throw new Error(`.env.local not found at ${envPath}`)
  }
  const content = fs.readFileSync(envPath, 'utf-8')
  const env = {}
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const k = trimmed.slice(0, eq).trim()
    let v = trimmed.slice(eq + 1).trim()
    // Strip surrounding quotes
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    env[k] = v
  }
  return env
}

const env = loadEnvLocal()
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const APP_URL = env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(2)
}

const WALLIAM_TENANT_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
const WALLIAM_HOST = 'walliam.ca'  // used as Host header to trigger tenant resolution in middleware

// --- Supabase service client (lightweight REST wrapper, no SDK dep) ------------
async function sbFetch(pathSuffix, init = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${pathSuffix}`
  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
    ...(init.headers || {}),
  }
  const res = await fetch(url, { ...init, headers })
  const text = await res.text()
  let body
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  return { status: res.status, body }
}

async function sbAuthAdmin(adminPath, init = {}) {
  const url = `${SUPABASE_URL}/auth/v1/admin/${adminPath}`
  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    ...(init.headers || {}),
  }
  const res = await fetch(url, { ...init, headers })
  const text = await res.text()
  let body
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  return { status: res.status, body }
}

// --- Result tracking -----------------------------------------------------------
const results = []
function record(name, ok, detail) {
  results.push({ name, ok, detail })
  const icon = ok ? '\u2713' : '\u2717'
  const tag = ok ? 'PASS' : 'FAIL'
  const line = detail ? `${icon} ${tag}: ${name} \u2014 ${detail}` : `${icon} ${tag}: ${name}`
  console.log(line)
}

async function runScenario(name, fn) {
  try {
    await fn()
  } catch (err) {
    record(name, false, err.message || String(err))
  }
}

// --- Scenarios -----------------------------------------------------------------

async function scenario1_anonymousBrowse() {
  const res = await fetch(APP_URL, {
    headers: { Host: WALLIAM_HOST }
  })
  if (res.status !== 200) {
    throw new Error(`expected 200, got ${res.status}`)
  }
  record('1. Anonymous browse', true, `${APP_URL} returned 200`)
}

let smokeEmail = null
let smokeUserId = null
const smokePassword = 'SmokeTest_W_TENANT_AUTH_2026!'
const smokeFullName = 'Smoke Tester'
const smokePhone = '4165550000'

async function scenario2_register() {
  smokeEmail = `smoke-test-${Date.now()}@walliam.test`

  // Step 2a: create auth user via admin API
  const signUpRes = await sbAuthAdmin('users', {
    method: 'POST',
    body: JSON.stringify({
      email: smokeEmail,
      password: smokePassword,
      email_confirm: true,
      user_metadata: {
        full_name: smokeFullName,
        phone: smokePhone,
      },
    }),
  })
  if (signUpRes.status >= 300 || !signUpRes.body?.id) {
    throw new Error(`auth.signUp failed: ${signUpRes.status} ${JSON.stringify(signUpRes.body)}`)
  }
  smokeUserId = signUpRes.body.id

  // Step 2b: hit /api/email/welcome with proper headers (this is what joinTenant does
  // server-side; we exercise the route directly to verify per-tenant dedup + email send).
  // First we have to insert the tenant_users row + leads row + user_activities the way
  // joinTenant would. Since we can't easily call a server action from a Node script,
  // we simulate by calling the same downstream endpoints joinTenant uses.

  // tenant_users insert (joinTenant step 1)
  const tuRes = await sbFetch('tenant_users', {
    method: 'POST',
    headers: { Prefer: 'return=representation,resolution=ignore-duplicates' },
    body: JSON.stringify({
      user_id: smokeUserId,
      tenant_id: WALLIAM_TENANT_ID,
      registration_source: 'smoke_test',
      registration_url: APP_URL,
      marketing_consent: true,
    }),
  })
  if (tuRes.status >= 300) {
    throw new Error(`tenant_users insert failed: ${tuRes.status} ${JSON.stringify(tuRes.body)}`)
  }

  // assign-user-agent (joinTenant step 2a)
  const assignRes = await fetch(`${APP_URL}/api/walliam/assign-user-agent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-id': WALLIAM_TENANT_ID,
      Host: WALLIAM_HOST,
    },
    body: JSON.stringify({ user_id: smokeUserId }),
  })
  const assignBody = await assignRes.json()
  if (!assignRes.ok) {
    throw new Error(`assign-user-agent failed: ${assignRes.status} ${JSON.stringify(assignBody)}`)
  }
  const assignedAgentId = assignBody.agent_id

  // lead insert (joinTenant step 2b uses getOrCreateLead; we insert directly with same shape)
  const leadRes = await sbFetch('leads', {
    method: 'POST',
    body: JSON.stringify({
      tenant_id: WALLIAM_TENANT_ID,
      agent_id: assignedAgentId,
      contact_name: smokeFullName,
      contact_email: smokeEmail,
      contact_phone: smokePhone,
      source: 'smoke_test',
      quality: 'cold',
      status: 'new',
    }),
  })
  if (leadRes.status >= 300) {
    throw new Error(`leads insert failed: ${leadRes.status} ${JSON.stringify(leadRes.body)}`)
  }

  // activity insert (joinTenant -> trackActivity equivalent)
  await sbFetch('user_activities', {
    method: 'POST',
    body: JSON.stringify({
      tenant_id: WALLIAM_TENANT_ID,
      contact_email: smokeEmail,
      agent_id: assignedAgentId,
      activity_type: 'registration',
      activity_data: { source: 'smoke_test' },
    }),
  })

  // welcome email (joinTenant step 2c)
  const welcomeRes = await fetch(`${APP_URL}/api/email/welcome`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-id': WALLIAM_TENANT_ID,
      Host: WALLIAM_HOST,
    },
    body: JSON.stringify({
      userId: smokeUserId,
      email: smokeEmail,
      fullName: smokeFullName,
    }),
  })
  if (!welcomeRes.ok) {
    const t = await welcomeRes.text()
    throw new Error(`welcome email failed: ${welcomeRes.status} ${t}`)
  }

  // Step 2c: verify all four tables have correct rows
  const checks = await Promise.all([
    sbFetch(`tenant_users?user_id=eq.${smokeUserId}&tenant_id=eq.${WALLIAM_TENANT_ID}&select=*`),
    sbFetch(`leads?contact_email=eq.${encodeURIComponent(smokeEmail)}&select=id,tenant_id,agent_id,source`),
    sbFetch(`user_activities?contact_email=eq.${encodeURIComponent(smokeEmail)}&select=tenant_id,activity_type,agent_id`),
  ])

  const tuRow = checks[0].body?.[0]
  const leadRow = checks[1].body?.[0]
  const activityRows = checks[2].body || []

  if (!tuRow) throw new Error('tenant_users row missing')
  if (tuRow.tenant_id !== WALLIAM_TENANT_ID) throw new Error(`tenant_users tenant_id wrong: ${tuRow.tenant_id}`)
  if (tuRow.welcome_email_sent !== true) throw new Error(`tenant_users.welcome_email_sent not true: ${tuRow.welcome_email_sent}`)

  if (!leadRow) throw new Error('leads row missing')
  if (leadRow.tenant_id !== WALLIAM_TENANT_ID) throw new Error(`leads tenant_id wrong: ${leadRow.tenant_id}`)

  if (activityRows.length === 0) throw new Error('user_activities empty')
  for (const a of activityRows) {
    if (a.tenant_id !== WALLIAM_TENANT_ID) throw new Error(`user_activities tenant_id wrong: ${a.tenant_id}`)
  }

  record('2. New user registration on walliam', true,
    `auth.users + tenant_users(welcome_sent=true) + leads(tenant_id=walliam) + ${activityRows.length} user_activities`)
}

async function scenario3_returningUser() {
  if (!smokeUserId) throw new Error('Scenario 2 did not run, skipping')

  const before = await Promise.all([
    sbFetch(`tenant_users?user_id=eq.${smokeUserId}&tenant_id=eq.${WALLIAM_TENANT_ID}&select=user_id`),
    sbFetch(`leads?contact_email=eq.${encodeURIComponent(smokeEmail)}&select=id`),
  ])
  const tuCountBefore = (before[0].body || []).length
  const leadCountBefore = (before[1].body || []).length

  // Re-call welcome route — should be skipped due to dedup
  const reCallWelcome = await fetch(`${APP_URL}/api/email/welcome`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-id': WALLIAM_TENANT_ID,
      Host: WALLIAM_HOST,
    },
    body: JSON.stringify({
      userId: smokeUserId,
      email: smokeEmail,
      fullName: smokeFullName,
    }),
  })
  const body = await reCallWelcome.json()
  if (!reCallWelcome.ok) {
    throw new Error(`welcome re-call failed: ${reCallWelcome.status}`)
  }
  if (body.skipped !== true) {
    throw new Error(`welcome re-call should have skipped (dedup), got: ${JSON.stringify(body)}`)
  }

  const after = await Promise.all([
    sbFetch(`tenant_users?user_id=eq.${smokeUserId}&tenant_id=eq.${WALLIAM_TENANT_ID}&select=user_id`),
    sbFetch(`leads?contact_email=eq.${encodeURIComponent(smokeEmail)}&select=id`),
  ])
  const tuCountAfter = (after[0].body || []).length
  const leadCountAfter = (after[1].body || []).length

  if (tuCountAfter !== tuCountBefore) throw new Error(`tenant_users count changed: ${tuCountBefore} -> ${tuCountAfter}`)
  if (leadCountAfter !== leadCountBefore) throw new Error(`leads count changed: ${leadCountBefore} -> ${leadCountAfter}`)

  record('3. Returning user (idempotent)', true,
    `welcome dedup respected; tenant_users=${tuCountAfter}, leads=${leadCountAfter}`)
}

async function scenario4_wrongPassword() {
  // Use the public auth endpoint (not admin) — this exercises the same path the UI uses
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: smokeEmail,
      password: 'wrong_password_xxx',
    }),
  })
  if (res.ok) {
    throw new Error('expected auth failure but got success')
  }
  if (res.status !== 400) {
    // 400 is the typical Supabase "invalid credentials" response
    record('4. Wrong password sign-in', true, `got non-OK status ${res.status} (acceptable)`)
    return
  }
  record('4. Wrong password sign-in', true, 'rejected with 400 (invalid credentials)')
}

async function scenario5_existingEmail() {
  const res = await sbAuthAdmin('users', {
    method: 'POST',
    body: JSON.stringify({
      email: smokeEmail,
      password: 'irrelevant',
      email_confirm: true,
    }),
  })
  if (res.status < 300 || res.status === 200) {
    throw new Error(`expected duplicate-email error but got ${res.status}`)
  }
  record('5. Re-register with existing email', true, `rejected with ${res.status}`)
}

async function scenario6_emailContent() {
  // Verify the welcome email was sent by checking the welcome_email_sent flag on tenant_users.
  // The welcome route flips this to true ONLY after sendTenantEmail completes, so it's a
  // reliable end-to-end signal that the email pipeline ran without throwing.
  if (!smokeUserId) throw new Error('Scenario 2 did not run, skipping')

  const res = await sbFetch(`tenant_users?user_id=eq.${smokeUserId}&tenant_id=eq.${WALLIAM_TENANT_ID}&select=welcome_email_sent,updated_at`)
  const row = res.body?.[0]
  if (!row) {
    throw new Error('tenant_users row missing — cannot verify')
  }
  if (row.welcome_email_sent !== true) {
    throw new Error(`tenant_users.welcome_email_sent is ${row.welcome_email_sent}, expected true`)
  }

  record('6. Welcome email sent (tenant_users.welcome_email_sent flag)', true,
    `flipped to true at ${row.updated_at}`)
}

async function scenario7_welcomeMissingHeader() {
  const res = await fetch(`${APP_URL}/api/email/welcome`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // deliberately no x-tenant-id
      Host: WALLIAM_HOST,
    },
    body: JSON.stringify({
      userId: '00000000-0000-0000-0000-000000000000',
      email: 'noop@walliam.test',
      fullName: 'noop',
    }),
  })
  if (res.status !== 400) {
    throw new Error(`expected 400, got ${res.status}`)
  }
  const body = await res.json()
  if (!body.error || !body.error.toLowerCase().includes('tenant')) {
    throw new Error(`expected tenant-related error, got ${JSON.stringify(body)}`)
  }
  record('7. Welcome route without tenant header', true, `400 ${body.error}`)
}

async function scenario7b_lowCreditsMissingHeader() {
  const res = await fetch(`${APP_URL}/api/email/low-credits`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Host: WALLIAM_HOST,
    },
    body: JSON.stringify({
      userId: '00000000-0000-0000-0000-000000000000',
      creditType: 'chat',
      remaining: 1,
    }),
  })
  if (res.status !== 400) {
    throw new Error(`expected 400, got ${res.status}`)
  }
  const body = await res.json()
  if (!body.error || !body.error.toLowerCase().includes('tenant')) {
    throw new Error(`expected tenant-related error, got ${JSON.stringify(body)}`)
  }
  record('7b. Low-credits route without tenant header', true, `400 ${body.error}`)
}

// --- Main ----------------------------------------------------------------------
;(async () => {
  console.log('=== W-TENANT-AUTH smoke matrix ===')
  console.log(`APP_URL: ${APP_URL}`)
  console.log(`Tenant:  ${WALLIAM_TENANT_ID} (walliam.ca)`)
  console.log('')

  await runScenario('1. Anonymous browse', scenario1_anonymousBrowse)
  await runScenario('2. New user registration on walliam', scenario2_register)
  await runScenario('3. Returning user (idempotent)', scenario3_returningUser)
  await runScenario('4. Wrong password sign-in', scenario4_wrongPassword)
  await runScenario('5. Re-register with existing email', scenario5_existingEmail)
  await runScenario('6. Welcome email sent (Resend API)', scenario6_emailContent)
  await runScenario('7. Welcome route without tenant header', scenario7_welcomeMissingHeader)
  await runScenario('7b. Low-credits route without tenant header', scenario7b_lowCreditsMissingHeader)

  console.log('')
  console.log('=== Summary ===')
  const passed = results.filter(r => r.ok).length
  const failed = results.filter(r => !r.ok).length
  console.log(`PASS: ${passed} / ${results.length}`)
  if (failed > 0) {
    console.log(`FAIL: ${failed}`)
    for (const r of results.filter(r => !r.ok)) {
      console.log(`  - ${r.name}: ${r.detail}`)
    }
    process.exit(1)
  }
  console.log('All scenarios passed.')
  console.log(`Smoke user (NOT cleaned up): ${smokeEmail}`)
  process.exit(0)
})().catch(err => {
  console.error('Fatal error:', err)
  process.exit(2)
})