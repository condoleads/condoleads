#!/usr/bin/env node
/**
 * smoke-t3c.js — W-LEADS-EMAIL T3c comprehensive smoke harness.
 *
 * Covers the 4 newly-wired routes from T3c + 1 verify-skip tier:
 *   Tier 5: POST /api/charlie/appointment                              (audit)
 *   Tier 6: POST /api/charlie/lead (INSERT + UPDATE paths)             (audit; UPDATE verifies F2.P2 leadId-fix)
 *   Tier 7: POST /api/walliam/estimator/vip-questionnaire              (audit on pre-existing lead)
 *   Tier 8: POST /api/walliam/estimator/vip-request                    (audit)
 *   Tier 9: GET  /api/walliam/estimator/vip-approve                    (verify-skip — confirm vip-approve runs and does NOT audit)
 *
 * Pre-existing leads (Tier 7 only) are created via direct INSERT to simulate
 * what the vip-request route would have done first.
 *
 * Tier 9 asserts that lead_email_recipients_log contains ZERO rows with
 * template_key='walliam_estimator_vip_approve_user' — the intentional skip
 * documented in v9 entry. If a future T3d-followup wires vip-approve audit,
 * this tier's expectation flips.
 *
 * Standalone — doesn't require smoke-t3b.js to run first. T3b should be run
 * separately as the regression check.
 *
 * Prerequisites:
 *   - `npm run dev` running on localhost:3000 (DEV_TENANT_DOMAIN=walliam.ca)
 *   - T3b smoke green (dev test endpoint provisioned, etc — not strictly
 *     required for T3c but indicates the base is healthy)
 *
 * Usage: node scripts/smoke-t3c.js
 *
 * Exit codes:
 *   0 = all tiers green
 *   1 = pre-flight failed (server down / env missing)
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
const AGENT_ID = process.env.SMOKE_AGENT_ID || 'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe'
const RUN_ID = `t3c${Date.now()}`
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
  console.error('FAIL: @supabase/supabase-js not available')
  process.exit(1)
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

async function fxInsertLead({ tenantId, userId, agentId, contactName, contactEmail, source }) {
  const { data, error } = await supabase.from('leads').insert({
    tenant_id: tenantId,
    user_id: userId || null,
    agent_id: agentId || null,
    contact_name: contactName,
    contact_email: contactEmail,
    source,
    status: 'new',
    quality: 'hot',
    assignment_source: agentId ? 'geo' : 'admin',
  }).select('id').single()
  if (error) throw new Error('insertLead: ' + error.message)
  return data
}

async function fxCreateVipRequest({ sessionId, agentId, tenantId, email, fullName, phone }) {
  const future = new Date()
  future.setDate(future.getDate() + 7)
  const { data, error } = await supabase.from('vip_requests').insert({
    session_id: sessionId,
    agent_id: agentId,
    tenant_id: tenantId,
    phone: phone || '+1-555-0700',
    full_name: fullName,
    email,
    request_source: 'walliam_estimator',
    request_type: 'estimator',
    status: 'pending',
    expires_at: future.toISOString(),
  }).select('id, approval_token').single()
  if (error) throw new Error('createVipRequest: ' + error.message)
  return data
}

async function fxCleanup(fixtures) {
  if (fixtures.vipRequestId) {
    try { await supabase.from('vip_requests').delete().eq('id', fixtures.vipRequestId) } catch (e) {}
  }
  if (fixtures.sessionId) {
    try { await supabase.from('vip_requests').delete().eq('session_id', fixtures.sessionId) } catch (e) {}
    try { await supabase.from('chat_sessions').delete().eq('id', fixtures.sessionId) } catch (e) {}
  }
  if (fixtures.authUserId) {
    try { await supabase.from('user_profiles').delete().eq('id', fixtures.authUserId) } catch (e) {}
    try { await supabase.auth.admin.deleteUser(fixtures.authUserId) } catch (e) {}
  }
  // pre-leads NOT deleted (FK CASCADE to audit rows + trg_lerl_no_delete blocks)
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
    .select('id, recipient_email, recipient_layer, direction, subject, template_key, resend_message_id, status, sent_at, created_at')
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
    if (r.template_key !== expectedTemplateKey) errors.push('template_key on ' + r.id + ': got ' + r.template_key)
    if (!['to', 'cc', 'bcc'].includes(r.direction)) errors.push('direction on ' + r.id + ': got ' + r.direction)
    if (r.status !== 'sent') errors.push('status on ' + r.id + ': got ' + r.status)
    if (!r.recipient_email) errors.push('recipient_email empty on ' + r.id)
    if (!r.recipient_layer) errors.push('recipient_layer empty on ' + r.id)
  }
  if (errors.length) throw new Error('per-row failures:\n  ' + errors.join('\n  '))
  const layers = {}
  for (const r of rows) layers[r.recipient_layer] = (layers[r.recipient_layer] || 0) + 1
  const withMsgId = rows.filter(r => r.resend_message_id).length
  return { count: rows.length, layers, withMsgId }
}

// ============================================================================
// Tier 5 — charlie/appointment
// ============================================================================

async function tier5_charlieAppointment() {
  console.log('')
  console.log('=== Tier 5: POST /api/charlie/appointment ===')
  const fixtures = { authUserId: null, sessionId: null }
  const email = `${RUN_ID}-tier5@t3c-smoke.local`
  const name = `T3c Smoke Tier5 ${RUN_ID}`

  try {
    fixtures.authUserId = await fxCreateAuthUser({ email, fullName: name })
    await fxUpsertUserProfile({ userId: fixtures.authUserId, fullName: name, phone: '+1-555-0500' })
    fixtures.sessionId = await fxCreateChatSession({ userId: fixtures.authUserId, agentId: AGENT_ID, tenantId: TENANT_ID })
    console.log('  fixtures: auth=' + fixtures.authUserId + ' session=' + fixtures.sessionId)

    const apptDate = new Date()
    apptDate.setDate(apptDate.getDate() + 30)
    const apptDateStr = apptDate.toISOString().slice(0, 10)

    const res = await fetch(`${BASE}/api/charlie/appointment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-tenant-id': TENANT_ID },
      body: JSON.stringify({
        name, email, phone: '+1-555-0500',
        intent: 'buyer',
        appointment_date: apptDateStr,
        appointment_time: '14:00',
        appointment_properties: [{ listingKey: 'TEST-T5', address: 'Test Address Whitby' }],
        sessionId: fixtures.sessionId,
        userId: fixtures.authUserId,
        geo_name: 'Whitby',
      }),
    })
    console.log('  HTTP : ' + res.status)
    if (!res.ok) throw new Error('appointment POST: ' + res.status + '\n' + (await res.text()).slice(0, 300))

    await new Promise(r => setTimeout(r, 1500))

    const leads = await findLeadByEmail(email)
    if (leads.length === 0) throw new Error('no lead row for ' + email)
    const lead = leads[0]
    console.log('  ✓ lead row (id=' + lead.id + ')')

    const rows = await findAuditRows(lead.id)
    const a = assertAuditRows(rows, 'charlie_appointment_chain')
    console.log('  ✓ ' + a.count + ' audit rows; layers=' + JSON.stringify(a.layers))
    if (a.withMsgId === a.count) console.log('  ✓ all rows have resend_message_id')

    return { tier: 5, leadId: lead.id, auditRows: a.count, layers: a.layers }
  } finally {
    await fxCleanup(fixtures)
  }
}

// ============================================================================
// Tier 6 — charlie/lead (INSERT path + UPDATE path = F2.P2 leadId-fix verification)
// ============================================================================

async function tier6_charlieLead() {
  console.log('')
  console.log('=== Tier 6: POST /api/charlie/lead (INSERT + UPDATE paths) ===')
  const fixtures = { authUserId: null, sessionId: null }
  const email = `${RUN_ID}-tier6@t3c-smoke.local`
  const name = `T3c Smoke Tier6 ${RUN_ID}`

  try {
    fixtures.authUserId = await fxCreateAuthUser({ email, fullName: name })
    await fxUpsertUserProfile({ userId: fixtures.authUserId, fullName: name, phone: '+1-555-0600' })
    fixtures.sessionId = await fxCreateChatSession({ userId: fixtures.authUserId, agentId: AGENT_ID, tenantId: TENANT_ID })
    console.log('  fixtures: auth=' + fixtures.authUserId + ' session=' + fixtures.sessionId)

    const payload = {
      name, phone: '+1-555-0600',
      intent: 'buyer',
      buyerProfile: { geoName: 'Whitby', budgetMin: 800000, budgetMax: 1200000 },
      listings: [],
      analytics: {},
      sessionId: fixtures.sessionId,
      userId: fixtures.authUserId,
    }
    const headers = { 'Content-Type': 'application/json', 'x-tenant-id': TENANT_ID }

    // --- Pass 1: INSERT branch (no pre-existing walliam_charlie lead for this user) ---
    const res1 = await fetch(`${BASE}/api/charlie/lead`, { method: 'POST', headers, body: JSON.stringify(payload) })
    console.log('  HTTP (INSERT pass): ' + res1.status)
    if (!res1.ok) throw new Error('lead POST pass-1: ' + res1.status + '\n' + (await res1.text()).slice(0, 300))
    await new Promise(r => setTimeout(r, 1500))

    const leads1 = await findLeadByEmail(email)
    if (leads1.length === 0) throw new Error('no lead after INSERT pass')
    if (leads1.length > 1) throw new Error('expected 1 lead after INSERT, got ' + leads1.length)
    const lead = leads1[0]
    const rows1 = await findAuditRows(lead.id)
    const a1 = assertAuditRows(rows1, 'charlie_lead_enrichment_chain')
    console.log('  ✓ INSERT pass: lead=' + lead.id + ', ' + a1.count + ' audit rows')

    // --- Pass 2: UPDATE branch (same user+source+intent → existingLead found → UPDATE path → F2.P2 fix triggers audit) ---
    const res2 = await fetch(`${BASE}/api/charlie/lead`, { method: 'POST', headers, body: JSON.stringify(payload) })
    console.log('  HTTP (UPDATE pass): ' + res2.status)
    if (!res2.ok) throw new Error('lead POST pass-2: ' + res2.status + '\n' + (await res2.text()).slice(0, 300))
    await new Promise(r => setTimeout(r, 1500))

    const leads2 = await findLeadByEmail(email)
    if (leads2.length !== 1) throw new Error('expected 1 lead after UPDATE, got ' + leads2.length)
    if (leads2[0].id !== lead.id) throw new Error('UPDATE created new lead (' + leads2[0].id + ') instead of updating existing (' + lead.id + ')')

    const rows2 = await findAuditRows(lead.id)
    if (rows2.length <= rows1.length) {
      throw new Error('UPDATE path produced no new audit rows (' + rows1.length + ' before, ' + rows2.length + ' after) — F2.P2 leadId-fix may have failed')
    }
    const newRowsCount = rows2.length - rows1.length
    console.log('  ✓ UPDATE pass: same lead=' + lead.id + ', +' + newRowsCount + ' new audit rows (F2.P2 leadId-fix VERIFIED)')

    return { tier: 6, leadId: lead.id, auditRows: rows2.length, insertRows: a1.count, updateRows: newRowsCount, layers: a1.layers }
  } finally {
    await fxCleanup(fixtures)
  }
}

// ============================================================================
// Tier 7 — walliam/estimator/vip-questionnaire (audit on pre-existing lead)
// ============================================================================

async function tier7_walliamEstimatorVipQuestionnaire() {
  console.log('')
  console.log('=== Tier 7: POST /api/walliam/estimator/vip-questionnaire ===')
  const fixtures = { authUserId: null, sessionId: null, vipRequestId: null }
  const email = `${RUN_ID}-tier7@t3c-smoke.local`
  const name = `T3c Smoke Tier7 ${RUN_ID}`

  try {
    fixtures.authUserId = await fxCreateAuthUser({ email, fullName: name })
    await fxUpsertUserProfile({ userId: fixtures.authUserId, fullName: name, phone: '+1-555-0700' })
    fixtures.sessionId = await fxCreateChatSession({ userId: fixtures.authUserId, agentId: AGENT_ID, tenantId: TENANT_ID })

    // Pre-create walliam_estimator% lead (simulates what vip-request would have done)
    const preLead = await fxInsertLead({
      tenantId: TENANT_ID,
      userId: fixtures.authUserId,
      agentId: AGENT_ID,
      contactName: name,
      contactEmail: email,
      source: 'walliam_estimator_vip_request',
    })
    console.log('  fixture: pre-existing lead ' + preLead.id)

    // Create vip_requests
    const vipReq = await fxCreateVipRequest({
      sessionId: fixtures.sessionId,
      agentId: AGENT_ID,
      tenantId: TENANT_ID,
      email,
      fullName: name,
      phone: '+1-555-0700',
    })
    fixtures.vipRequestId = vipReq.id
    console.log('  fixture: vip_request ' + vipReq.id)

    const res = await fetch(`${BASE}/api/walliam/estimator/vip-questionnaire`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: vipReq.id,
        fullName: name,
        email,
        budgetRange: '800000-1200000',
        timeline: 'soon',
        buyerType: 'buyer',
        requirements: 'T3c smoke harness — ignore',
      }),
    })
    console.log('  HTTP : ' + res.status)
    if (!res.ok) throw new Error('vip-questionnaire POST: ' + res.status + '\n' + (await res.text()).slice(0, 300))

    await new Promise(r => setTimeout(r, 1500))

    const rows = await findAuditRows(preLead.id)
    const a = assertAuditRows(rows, 'walliam_estimator_vip_questionnaire_chain')
    console.log('  ✓ ' + a.count + ' audit rows on pre-existing lead ' + preLead.id + '; layers=' + JSON.stringify(a.layers))
    if (a.withMsgId === a.count) console.log('  ✓ all rows have resend_message_id')

    return { tier: 7, leadId: preLead.id, auditRows: a.count, layers: a.layers }
  } finally {
    await fxCleanup(fixtures)
  }
}

// ============================================================================
// Tier 8 — walliam/estimator/vip-request
// ============================================================================

async function tier8_walliamEstimatorVipRequest() {
  console.log('')
  console.log('=== Tier 8: POST /api/walliam/estimator/vip-request ===')
  const fixtures = { authUserId: null, sessionId: null }
  const email = `${RUN_ID}-tier8@t3c-smoke.local`
  const name = `T3c Smoke Tier8 ${RUN_ID}`

  try {
    fixtures.authUserId = await fxCreateAuthUser({ email, fullName: name })
    await fxUpsertUserProfile({ userId: fixtures.authUserId, fullName: name, phone: '+1-555-0800' })
    fixtures.sessionId = await fxCreateChatSession({ userId: fixtures.authUserId, agentId: AGENT_ID, tenantId: TENANT_ID })
    console.log('  fixtures: auth=' + fixtures.authUserId + ' session=' + fixtures.sessionId)

    const res = await fetch(`${BASE}/api/walliam/estimator/vip-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: fixtures.sessionId,
        phone: '+1-555-0800',
        pageUrl: 'http://localhost:3000/test',
        buildingName: 'T3c Smoke Building',
      }),
    })
    console.log('  HTTP : ' + res.status)
    if (!res.ok) throw new Error('estimator/vip-request POST: ' + res.status + '\n' + (await res.text()).slice(0, 300))

    await new Promise(r => setTimeout(r, 1500))

    const leads = await findLeadByEmail(email)
    if (leads.length === 0) throw new Error('no lead row for ' + email)
    const lead = leads[0]
    console.log('  ✓ lead row (id=' + lead.id + ', source=' + lead.source + ')')

    const rows = await findAuditRows(lead.id)
    const a = assertAuditRows(rows, 'walliam_estimator_vip_request_chain')
    console.log('  ✓ ' + a.count + ' audit rows; layers=' + JSON.stringify(a.layers))
    if (a.withMsgId === a.count) console.log('  ✓ all rows have resend_message_id')

    return { tier: 8, leadId: lead.id, auditRows: a.count, layers: a.layers }
  } finally {
    await fxCleanup(fixtures)
  }
}

// ============================================================================
// Tier 9 — walliam/estimator/vip-approve (verify-skip: route works AND no audit fires)
// ============================================================================

async function tier9_walliamEstimatorVipApproveSkip() {
  console.log('')
  console.log('=== Tier 9: GET /api/walliam/estimator/vip-approve (verify-skip) ===')
  const fixtures = { authUserId: null, sessionId: null, vipRequestId: null }
  const email = `${RUN_ID}-tier9@t3c-smoke.local`
  const name = `T3c Smoke Tier9 ${RUN_ID}`

  try {
    fixtures.authUserId = await fxCreateAuthUser({ email, fullName: name })
    await fxUpsertUserProfile({ userId: fixtures.authUserId, fullName: name, phone: '+1-555-0900' })
    fixtures.sessionId = await fxCreateChatSession({ userId: fixtures.authUserId, agentId: AGENT_ID, tenantId: TENANT_ID })

    const vipReq = await fxCreateVipRequest({
      sessionId: fixtures.sessionId,
      agentId: AGENT_ID,
      tenantId: TENANT_ID,
      email,
      fullName: name,
      phone: '+1-555-0900',
    })
    fixtures.vipRequestId = vipReq.id
    const token = vipReq.approval_token
    console.log('  fixture: vip_request ' + vipReq.id + ' token=' + String(token).slice(0, 8) + '...')

    const url = `${BASE}/api/walliam/estimator/vip-approve?token=${encodeURIComponent(token)}&action=approve`
    const res = await fetch(url, { method: 'GET' })
    console.log('  HTTP : ' + res.status)
    if (!res.ok) throw new Error('vip-approve GET: ' + res.status + '\n' + (await res.text()).slice(0, 300))

    await new Promise(r => setTimeout(r, 1500))

    // Assert vip_request status changed (proves route ran end-to-end)
    const { data: updatedReq, error } = await supabase
      .from('vip_requests')
      .select('status, responded_at')
      .eq('id', vipReq.id)
      .single()
    if (error) throw new Error('vip_requests verify: ' + error.message)
    if (updatedReq.status === 'pending') {
      throw new Error('vip-approve did not update vip_request status (still pending)')
    }
    console.log('  ✓ vip_request.status: pending → ' + updatedReq.status)

    // Assert NO audit row exists with vip-approve's templateKey ANYWHERE in the DB
    // (the intentional T3c skip — if this ever fires, vip-approve was wired and this tier needs updating)
    const { count, error: countErr } = await supabase
      .from('lead_email_recipients_log')
      .select('id', { count: 'exact', head: true })
      .eq('template_key', 'walliam_estimator_vip_approve_user')
    if (countErr) throw new Error('audit count query: ' + countErr.message)
    if (count !== 0) {
      throw new Error('Found ' + count + ' rows with template_key=walliam_estimator_vip_approve_user — vip-approve should NOT be audited per T3c-skip decision')
    }
    console.log('  ✓ verify-skip: 0 rows with template_key=walliam_estimator_vip_approve_user (intentional gap)')

    return { tier: 9, status: 'verify-skip-confirmed', vipStatus: updatedReq.status }
  } finally {
    await fxCleanup(fixtures)
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('T3c comprehensive smoke harness')
  console.log('  run_id   : ' + RUN_ID)
  console.log('  base_url : ' + BASE)
  console.log('  tenant   : ' + TENANT_ID)
  console.log('  agent    : ' + AGENT_ID)
  console.log('')

  await pingServer()
  console.log('  ✓ dev server reachable')

  const results = []
  let failed = false

  for (const fn of [
    tier5_charlieAppointment,
    tier6_charlieLead,
    tier7_walliamEstimatorVipQuestionnaire,
    tier8_walliamEstimatorVipRequest,
    tier9_walliamEstimatorVipApproveSkip,
  ]) {
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
    if (r.error) {
      console.log('  ✗ tier ' + r.tier + ': ' + r.error.split('\n')[0])
    } else if (r.status === 'verify-skip-confirmed') {
      console.log('  ✓ tier ' + r.tier + ': verify-skip (vip_status=' + r.vipStatus + ', 0 audit rows for vip-approve template)')
    } else if (r.insertRows !== undefined) {
      console.log('  ✓ tier ' + r.tier + ': INSERT=' + r.insertRows + ' rows, UPDATE=+' + r.updateRows + ' rows; F2.P2 fix verified')
    } else {
      console.log('  ✓ tier ' + r.tier + ': ' + r.auditRows + ' rows; ' + Object.entries(r.layers).map(([k, v]) => k + '=' + v).join(', '))
    }
  }

  if (failed) {
    console.log('')
    console.log('T3c SMOKE FAILED — do NOT close T3c until all tiers pass.')
    process.exit(2)
  }
  console.log('')
  console.log('ALL T3c TIERS GREEN — T3c is comprehensive-smoke-verified.')
  console.log('Next: tracker v8 → v9 close patch, then amend or fresh commit.')
}

main().catch(e => {
  console.error('UNCAUGHT:', e)
  process.exit(2)
})