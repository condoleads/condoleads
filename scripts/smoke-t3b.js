#!/usr/bin/env node
/**
 * smoke-t3b.js — W-LEADS-EMAIL T3b comprehensive smoke harness.
 *
 * Covers all 4 audit-wired entry points end-to-end:
 *   Tier 1: POST /api/walliam/contact                     (no fixtures)
 *   Tier 2: POST /api/walliam/charlie/vip-request         (auth user + profile + session)
 *   Tier 3: POST /api/charlie/plan-email                  (auth user + profile + session)
 *   Tier 4: POST /api/t3b-smoke-leads-helper              (dev endpoint, auto-created)
 *
 * Per Rule Zero (comprehensive): no tier is deferred. The dev test endpoint
 * is auto-provisioned at app/api/t3b-smoke-leads-helper/route.ts on first run.
 * Gated behind NODE_ENV !== 'production' so it fails closed if accidentally
 * shipped.
 *
 * Notes on naming: do NOT use underscore-prefixed folders like _test or
 * _internal — Next.js treats those as private folders and excludes them from
 * routing. The endpoint lives under a regular path with a clear test-only name.
 *
 * Prerequisites:
 *   - `npm run dev` running on localhost:3000 (DEV_TENANT_DOMAIN=walliam.ca)
 *   - .env.local present with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   node scripts/smoke-t3b.js
 *
 * Exit codes:
 *   0 = all 4 tiers green
 *   1 = pre-flight failed (server down / env missing / endpoint never compiled)
 *   2 = tier assertion failed
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

// ============================================================================
// Env loading
// ============================================================================

function loadEnv() {
  const envPath = path.resolve('.env.local')
  if (!fs.existsSync(envPath)) {
    console.error('FAIL: .env.local not found at ' + envPath)
    process.exit(1)
  }
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    let val = line.slice(idx + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnv()

// ============================================================================
// Config
// ============================================================================

const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3000'
const TENANT_ID = process.env.SMOKE_TENANT_ID || 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
const AGENT_ID = process.env.SMOKE_AGENT_ID || 'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe'  // King Shah
const RUN_ID = `t3b${Date.now()}`
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('FAIL: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing')
  process.exit(1)
}

let supabase
try {
  const { createClient } = require('@supabase/supabase-js')
  supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
} catch (e) {
  console.error('FAIL: @supabase/supabase-js not available — run `npm install` in project root')
  process.exit(1)
}

// ============================================================================
// Dev test endpoint provisioning (Tier 4)
// ============================================================================

const TEST_ENDPOINT_PATH = 'app/api/t3b-smoke-leads-helper/route.ts'
const TEST_ENDPOINT_URL = `${BASE}/api/t3b-smoke-leads-helper`
const TEST_ENDPOINT_CONTENT = [
  "// app/api/t3b-smoke-leads-helper/route.ts",
  "// W-LEADS-EMAIL T3b Tier-4 smoke endpoint — invokes getOrCreateLead directly.",
  "//",
  "// DEV-ONLY. Returns 403 in production via NODE_ENV gate. This bypasses the",
  "// server-action machinery in scripts/smoke-t3b.js while still exercising the",
  "// exact code path (getOrCreateLead -> createLead -> sendTenantEmail ->",
  "// logEmailRecipients) that the production server actions submitLeadFromForm",
  "// and joinTenant trigger from UI forms.",
  "//",
  "// File auto-provisioned by scripts/smoke-t3b.js. Do not commit unless the",
  "// smoke harness ships to CI; production deploys must keep the NODE_ENV gate.",
  "",
  "import { NextRequest, NextResponse } from 'next/server'",
  "import { getOrCreateLead } from '@/lib/actions/leads'",
  "",
  "export async function POST(req: NextRequest) {",
  "  if (process.env.NODE_ENV === 'production') {",
  "    return NextResponse.json({ error: 'not allowed in production' }, { status: 403 })",
  "  }",
  "",
  "  const body = await req.json()",
  "  if (!body.tenantId || !body.contactName || !body.contactEmail) {",
  "    return NextResponse.json(",
  "      { error: 'tenantId, contactName, contactEmail required' },",
  "      { status: 400 }",
  "    )",
  "  }",
  "",
  "  const result = await getOrCreateLead({",
  "    tenantId: body.tenantId,",
  "    agentId: body.agentId,",
  "    buildingId: body.buildingId,",
  "    contactName: body.contactName,",
  "    contactEmail: body.contactEmail,",
  "    contactPhone: body.contactPhone,",
  "    message: body.message,",
  "    source: body.source,",
  "    sourceUrl: body.sourceUrl,",
  "    listingId: body.listingId,",
  "    communityId: body.communityId,",
  "    municipalityId: body.municipalityId,",
  "    areaId: body.areaId,",
  "    userId: body.userId,",
  "    estimatedValueMin: body.estimatedValueMin,",
  "    estimatedValueMax: body.estimatedValueMax,",
  "    propertyDetails: body.propertyDetails,",
  "    forceNew: body.forceNew,",
  "  })",
  "  return NextResponse.json(result)",
  "}",
  "",
].join('\n')

async function ensureTestEndpoint() {
  let newlyCreated = false
  if (!fs.existsSync(TEST_ENDPOINT_PATH)) {
    fs.mkdirSync(path.dirname(TEST_ENDPOINT_PATH), { recursive: true })
    fs.writeFileSync(TEST_ENDPOINT_PATH, TEST_ENDPOINT_CONTENT)
    newlyCreated = true
  }

  // Poll Next.js until the route is registered. Send POST with empty body —
  // a registered route replies 400 (missing required fields, per the validator);
  // an unregistered route replies 404. Anything non-404 proves the route is live.
  const maxAttempts = 45
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(TEST_ENDPOINT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      if (res.status !== 404) {
        return { newlyCreated, attempts: i + 1 }
      }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 1000))
  }
  throw new Error(
    'test endpoint never registered after ' + maxAttempts + 's at ' + TEST_ENDPOINT_URL +
    '\n  Next.js may need a hard restart. Stop dev (Ctrl+C) and restart:' +
    '\n    $env:DEV_TENANT_DOMAIN="walliam.ca"; npm run dev 2>&1 | Tee-Object -FilePath dev-server.log' +
    '\n  Then re-run this smoke.'
  )
}

// ============================================================================
// Pre-flight
// ============================================================================

async function pingServer() {
  try {
    const res = await fetch(BASE)
    if (res.status >= 500) throw new Error('server returned ' + res.status)
  } catch (e) {
    console.error('FAIL: dev server not reachable at ' + BASE)
    console.error('  Start: $env:DEV_TENANT_DOMAIN="walliam.ca"; npm run dev')
    process.exit(1)
  }
}

// ============================================================================
// Fixture helpers
// ============================================================================

async function fxCreateAuthUser({ email, fullName }) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    password: 'smoke-' + crypto.randomUUID(),
    user_metadata: { full_name: fullName },
  })
  if (error) throw new Error('createAuthUser: ' + error.message)
  return data.user.id
}

async function fxUpsertUserProfile({ userId, fullName, phone }) {
  // Supabase typically auto-creates a user_profiles row via the on_auth_user_created
  // trigger when auth.users gets a new row. UPSERT handles both cases (trigger
  // present and pre-populated; or trigger absent and we need to insert).
  const { error } = await supabase.from('user_profiles').upsert({
    id: userId,
    full_name: fullName,
    phone: phone || null,
    marketing_consent: false,
    sms_consent: false,
  }, { onConflict: 'id' })
  if (error) throw new Error('upsertUserProfile: ' + error.message)
}

async function fxCreateChatSession({ userId, agentId, tenantId, source = 'walliam' }) {
  const sessionId = crypto.randomUUID()
  const sessionToken = 'smoke-' + crypto.randomUUID()
  const { error } = await supabase.from('chat_sessions').insert({
    id: sessionId,
    agent_id: agentId,
    user_id: userId,
    tenant_id: tenantId,
    source,
    session_token: sessionToken,
    status: 'active',
  })
  if (error) throw new Error('createChatSession: ' + error.message)
  return sessionId
}

async function fxCleanup(fixtures) {
  if (fixtures.sessionId) {
    try { await supabase.from('vip_requests').delete().eq('session_id', fixtures.sessionId) } catch (e) {}
    try { await supabase.from('chat_sessions').delete().eq('id', fixtures.sessionId) } catch (e) {}
  }
  if (fixtures.authUserId) {
    try { await supabase.from('user_profiles').delete().eq('id', fixtures.authUserId) } catch (e) {}
    try { await supabase.auth.admin.deleteUser(fixtures.authUserId) } catch (e) {}
  }
}

// ============================================================================
// Verification helpers
// ============================================================================

async function findLeadByEmail(email) {
  const { data, error } = await supabase
    .from('leads')
    .select('id, contact_email, tenant_id, agent_id, source')
    .eq('contact_email', email)
    .eq('tenant_id', TENANT_ID)
  if (error) throw new Error('findLeadByEmail: ' + error.message)
  return data || []
}

async function findAuditRows(leadId) {
  const { data, error } = await supabase
    .from('lead_email_recipients_log')
    .select('id, recipient_email, recipient_layer, direction, subject, template_key, resend_message_id, status, sent_at')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true })
  if (error) throw new Error('findAuditRows: ' + error.message)
  return data || []
}

function assertAuditRows(rows, expectedTemplateKey) {
  if (!rows || rows.length === 0) {
    throw new Error('no audit rows — helper did not fire OR threw silently')
  }
  const errors = []
  for (const r of rows) {
    if (r.template_key !== expectedTemplateKey) {
      errors.push('template_key mismatch on row ' + r.id + ': got ' + r.template_key)
    }
    if (!['to', 'cc', 'bcc'].includes(r.direction)) {
      errors.push('direction not in (to,cc,bcc) on row ' + r.id + ': got ' + r.direction)
    }
    if (r.status !== 'sent') {
      errors.push('status != sent on row ' + r.id + ': got ' + r.status)
    }
    if (!r.recipient_email) errors.push('recipient_email empty on row ' + r.id)
    if (!r.recipient_layer) errors.push('recipient_layer empty on row ' + r.id)
  }
  if (errors.length) {
    throw new Error('per-row assertion failures:\n  ' + errors.join('\n  '))
  }
  const layers = {}
  for (const r of rows) layers[r.recipient_layer] = (layers[r.recipient_layer] || 0) + 1
  const withMsgId = rows.filter(r => r.resend_message_id).length
  return { count: rows.length, layers, withMsgId }
}

// ============================================================================
// Tier 1 — walliam/contact
// ============================================================================

async function tier1_walliamContact() {
  console.log('')
  console.log('=== Tier 1: POST /api/walliam/contact ===')
  const email = `${RUN_ID}-tier1@t3b-smoke.local`

  const res = await fetch(`${BASE}/api/walliam/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `T3b Smoke Tier1 ${RUN_ID}`,
      email,
      phone: '+1-555-0100',
      message: 'T3b smoke harness — ignore',
      source: 't3b_smoke_tier1',
      tenant_id: TENANT_ID,
    }),
  })
  console.log('  HTTP : ' + res.status)
  if (!res.ok) throw new Error('contact POST failed: ' + res.status + '\n' + (await res.text()).slice(0, 300))

  await new Promise(r => setTimeout(r, 1500))

  const leads = await findLeadByEmail(email)
  if (leads.length === 0) throw new Error('no leads row for ' + email)
  const lead = leads[0]
  console.log('  ✓ lead row (id=' + lead.id + ')')

  const rows = await findAuditRows(lead.id)
  const a = assertAuditRows(rows, 'walliam_contact_lead_capture')
  console.log('  ✓ ' + a.count + ' audit rows; layers=' + JSON.stringify(a.layers))
  if (a.withMsgId === a.count) console.log('  ✓ all rows have resend_message_id')
  else console.log('  ⚠ ' + (a.count - a.withMsgId) + '/' + a.count + ' rows missing resend_message_id')

  return { tier: 1, leadId: lead.id, auditRows: a.count, layers: a.layers }
}

// ============================================================================
// Tier 2 — walliam/charlie/vip-request
// ============================================================================

async function tier2_walliamCharlieVipRequest() {
  console.log('')
  console.log('=== Tier 2: POST /api/walliam/charlie/vip-request ===')
  const fixtures = { authUserId: null, sessionId: null }
  const email = `${RUN_ID}-tier2@t3b-smoke.local`

  try {
    fixtures.authUserId = await fxCreateAuthUser({ email, fullName: `T3b Smoke Tier2 ${RUN_ID}` })
    console.log('  fixture: auth.user ' + fixtures.authUserId)
    await fxUpsertUserProfile({ userId: fixtures.authUserId, fullName: `T3b Smoke Tier2 ${RUN_ID}`, phone: '+1-555-0200' })
    console.log('  fixture: user_profile (upsert)')
    fixtures.sessionId = await fxCreateChatSession({ userId: fixtures.authUserId, agentId: AGENT_ID, tenantId: TENANT_ID })
    console.log('  fixture: chat_session ' + fixtures.sessionId)

    const res = await fetch(`${BASE}/api/walliam/charlie/vip-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-tenant-id': TENANT_ID },
      body: JSON.stringify({ sessionId: fixtures.sessionId, planType: 'buyer' }),
    })
    console.log('  HTTP : ' + res.status)
    if (!res.ok) throw new Error('vip-request POST failed: ' + res.status + '\n' + (await res.text()).slice(0, 300))

    await new Promise(r => setTimeout(r, 1500))

    const leads = await findLeadByEmail(email)
    if (leads.length === 0) throw new Error('no leads row for ' + email)
    const lead = leads[0]
    console.log('  ✓ lead row (id=' + lead.id + ')')

    const rows = await findAuditRows(lead.id)
    const a = assertAuditRows(rows, 'walliam_charlie_vip_request_lead')
    console.log('  ✓ ' + a.count + ' audit rows; layers=' + JSON.stringify(a.layers))
    if (a.withMsgId === a.count) console.log('  ✓ all rows have resend_message_id')

    return { tier: 2, leadId: lead.id, auditRows: a.count, layers: a.layers }
  } finally {
    await fxCleanup(fixtures)
  }
}

// ============================================================================
// Tier 3 — charlie/plan-email
// ============================================================================

async function tier3_charliePlanEmail() {
  console.log('')
  console.log('=== Tier 3: POST /api/charlie/plan-email ===')
  const fixtures = { authUserId: null, sessionId: null }
  const email = `${RUN_ID}-tier3@t3b-smoke.local`

  try {
    fixtures.authUserId = await fxCreateAuthUser({ email, fullName: `T3b Smoke Tier3 ${RUN_ID}` })
    console.log('  fixture: auth.user ' + fixtures.authUserId)
    await fxUpsertUserProfile({ userId: fixtures.authUserId, fullName: `T3b Smoke Tier3 ${RUN_ID}`, phone: '+1-555-0300' })
    console.log('  fixture: user_profile (upsert)')
    fixtures.sessionId = await fxCreateChatSession({ userId: fixtures.authUserId, agentId: AGENT_ID, tenantId: TENANT_ID })
    console.log('  fixture: chat_session ' + fixtures.sessionId)

    const res = await fetch(`${BASE}/api/charlie/plan-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-tenant-id': TENANT_ID },
      body: JSON.stringify({
        sessionId: fixtures.sessionId,
        userId: fixtures.authUserId,
        planType: 'buyer',
        plan: { budgetMax: 1000000, geoName: 'Whitby' },
        analytics: {},
        listings: [],
        geoContext: { geoName: 'Whitby' },
        comparables: [],
        sellerEstimate: null,
        vipCreditUsed: false,
        vipCreditPlansUsed: 0,
        vipCreditTotal: 1,
        blocks: [],
      }),
    })
    console.log('  HTTP : ' + res.status)
    if (!res.ok) throw new Error('plan-email POST failed: ' + res.status + '\n' + (await res.text()).slice(0, 300))

    await new Promise(r => setTimeout(r, 1500))

    const leads = await findLeadByEmail(email)
    if (leads.length === 0) throw new Error('no leads row for ' + email)
    const lead = leads[0]
    console.log('  ✓ lead row (id=' + lead.id + ')')

    const rows = await findAuditRows(lead.id)
    const a = assertAuditRows(rows, 'charlie_plan_email_chain')
    console.log('  ✓ ' + a.count + ' audit rows; layers=' + JSON.stringify(a.layers))
    if (a.withMsgId === a.count) console.log('  ✓ all rows have resend_message_id')

    return { tier: 3, leadId: lead.id, auditRows: a.count, layers: a.layers }
  } finally {
    await fxCleanup(fixtures)
  }
}

// ============================================================================
// Tier 4 — lib/actions/leads.ts via dev test endpoint
// ============================================================================

async function tier4_libActionsLeads() {
  console.log('')
  console.log('=== Tier 4: POST /api/t3b-smoke-leads-helper (lib/actions/leads via dev endpoint) ===')
  const email = `${RUN_ID}-tier4@t3b-smoke.local`

  const res = await fetch(TEST_ENDPOINT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantId: TENANT_ID,
      contactName: `T3b Smoke Tier4 ${RUN_ID}`,
      contactEmail: email,
      contactPhone: '+1-555-0400',
      message: 'T3b smoke harness — Tier 4',
      source: 't3b_smoke_tier4',
      forceNew: true,
    }),
  })
  console.log('  HTTP : ' + res.status)
  if (!res.ok) {
    const body = await res.text()
    throw new Error('test endpoint POST failed: ' + res.status + '\n' + body.slice(0, 300))
  }
  const result = await res.json()
  if (!result.success) {
    throw new Error('getOrCreateLead returned failure: ' + JSON.stringify(result))
  }

  await new Promise(r => setTimeout(r, 1500))

  const leads = await findLeadByEmail(email)
  if (leads.length === 0) throw new Error('no leads row for ' + email)
  const lead = leads[0]
  console.log('  ✓ lead row (id=' + lead.id + ')')

  const rows = await findAuditRows(lead.id)
  const a = assertAuditRows(rows, 'leads_helper_new_lead_notification')
  console.log('  ✓ ' + a.count + ' audit rows; layers=' + JSON.stringify(a.layers))
  if (a.withMsgId === a.count) console.log('  ✓ all rows have resend_message_id')

  return { tier: 4, leadId: lead.id, auditRows: a.count, layers: a.layers }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('T3b comprehensive smoke harness')
  console.log('  run_id   : ' + RUN_ID)
  console.log('  base_url : ' + BASE)
  console.log('  tenant   : ' + TENANT_ID)
  console.log('  agent    : ' + AGENT_ID)
  console.log('')

  await pingServer()
  console.log('  ✓ dev server reachable')

  const { newlyCreated, attempts } = await ensureTestEndpoint()
  if (newlyCreated) console.log('  ✓ provisioned dev test endpoint: ' + TEST_ENDPOINT_PATH)
  console.log('  ✓ dev test endpoint registered (took ' + attempts + 's to compile)')

  const results = []
  let failed = false

  for (const fn of [tier1_walliamContact, tier2_walliamCharlieVipRequest, tier3_charliePlanEmail, tier4_libActionsLeads]) {
    try {
      results.push(await fn())
    } catch (e) {
      console.error('  ✗ ' + fn.name + ' FAILED')
      console.error('    ' + (e.message || e).split('\n').join('\n    '))
      results.push({ tier: fn.name, error: e.message || String(e) })
      failed = true
    }
  }

  console.log('')
  console.log('=== Summary ===')
  for (const r of results) {
    if (r.error) console.log('  ✗ tier ' + r.tier + ': ' + r.error.split('\n')[0])
    else console.log('  ✓ tier ' + r.tier + ': ' + r.auditRows + ' rows; ' + Object.entries(r.layers).map(([k, v]) => k + '=' + v).join(', '))
  }

  if (failed) {
    console.log('')
    console.log('SMOKE FAILED — do NOT commit T3b until all 4 tiers pass.')
    process.exit(2)
  }
  console.log('')
  console.log('ALL TIERS GREEN — T3b is comprehensive-smoke-verified.')
  console.log('Next: tracker v7 → v8 with full T3b story, then amend commit a406d6d.')
}

main().catch(e => {
  console.error('UNCAUGHT:', e)
  process.exit(2)
})