// scripts/verify-test-results.js
// WALLiam Comprehensive Test Verification Script
// Run after manual tests to verify DB state
// Usage: node scripts/verify-test-results.js
// Usage: node scripts/verify-test-results.js --user T03
// Usage: node scripts/verify-test-results.js --area credits

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const TENANT_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
const AGENT_ID  = 'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe'

let passed = 0
let failed = 0
let skipped = 0

function pass(test, msg) { console.log(`  ✅ ${test} — ${msg}`); passed++ }
function fail(test, msg) { console.log(`  ❌ ${test} — ${msg}`); failed++ }
function skip(test, msg) { console.log(`  ⏭️  ${test} — ${msg}`); skipped++ }
function section(name) { console.log(`\n${'─'.repeat(60)}\n  ${name}\n${'─'.repeat(60)}`) }

async function getUserData(email) {
  const { data: { users } } = await supabase.auth.admin.listUsers()
  const authUser = users.find(u => u.email === email)
  if (!authUser) return null

  const { data: profile } = await supabase.from('user_profiles').select('*').eq('id', authUser.id).single()
  const { data: session } = await supabase.from('chat_sessions').select('*').eq('user_id', authUser.id).eq('tenant_id', TENANT_ID).order('updated_at', { ascending: false }).limit(1).single()
  const { data: override } = await supabase.from('user_credit_overrides').select('*').eq('user_id', authUser.id).eq('tenant_id', TENANT_ID).maybeSingle()
  const { data: vipRequests } = await supabase.from('vip_requests').select('*').eq('session_id', session?.id || '').order('created_at', { ascending: false })
  const { data: leads } = await supabase.from('leads').select('*').eq('user_id', authUser.id).order('created_at', { ascending: false })

  return { authUser, profile, session, override, vipRequests: vipRequests || [], leads: leads || [] }
}

async function getTenantConfig() {
  const { data } = await supabase.from('tenants').select('*').eq('id', TENANT_ID).single()
  return data
}

// ── Area 1: Seed Data Integrity ──────────────────────────────
async function verifySeedData() {
  section('Area 1 — Seed Data Integrity')

  const users = [
    { code: 'T01', email: 't01-fresh@walliam.test', expectedMsg: 0, expectedPlans: 0, expectedEst: 0, expectedOverride: null },
    { code: 'T02', email: 't02-low-chat@walliam.test', expectedMsg: 1, expectedPlans: 0, expectedEst: 0, expectedOverride: { ai_chat_limit: 2 } },
    { code: 'T03', email: 't03-no-chat@walliam.test', expectedMsg: 2, expectedPlans: 0, expectedEst: 0, expectedOverride: { ai_chat_limit: 2 } },
    { code: 'T04', email: 't04-no-plans@walliam.test', expectedMsg: 0, expectedPlans: 2, expectedEst: 0, expectedOverride: { buyer_plan_limit: 2 } },
    { code: 'T05', email: 't05-no-est@walliam.test', expectedMsg: 0, expectedPlans: 0, expectedEst: 2, expectedOverride: { estimator_limit: 2 } },
    { code: 'T06', email: 't06-all-empty@walliam.test', expectedMsg: 2, expectedPlans: 2, expectedEst: 2, expectedOverride: { ai_chat_limit: 2 } },
    { code: 'T07', email: 't07-custom@walliam.test', expectedMsg: 0, expectedPlans: 0, expectedEst: 0, expectedOverride: { ai_chat_limit: 5 } },
    { code: 'T08', email: 't08-pending@walliam.test', expectedMsg: 2, expectedPlans: 0, expectedEst: 0, expectedVipStatus: 'pending' },
    { code: 'T09', email: 't09-approved@walliam.test', expectedMsg: 2, expectedPlans: 0, expectedEst: 0, expectedVipStatus: 'approved' },
    { code: 'T10', email: 't10-vip@walliam.test', expectedMsg: 1, expectedPlans: 1, expectedEst: 0, expectedSessionStatus: 'vip' },
  ]

  for (const u of users) {
    const data = await getUserData(u.email)
    if (!data) { fail(`SD-${u.code}`, 'User not found in DB'); continue }

    const s = data.session
    if (!s) { fail(`SD-${u.code}`, 'No session found'); continue }

    // Check message count
    if (s.message_count === u.expectedMsg) pass(`SD-${u.code}-chat`, `message_count=${s.message_count}`)
    else fail(`SD-${u.code}-chat`, `message_count=${s.message_count} (expected ${u.expectedMsg})`)

    // Check plans
    const totalPlans = (s.buyer_plans_used || 0) + (s.seller_plans_used || 0)
    if (totalPlans === u.expectedPlans) pass(`SD-${u.code}-plans`, `total_plans=${totalPlans}`)
    else fail(`SD-${u.code}-plans`, `total_plans=${totalPlans} (expected ${u.expectedPlans})`)

    // Check estimator
    if (s.estimator_count === u.expectedEst) pass(`SD-${u.code}-est`, `estimator_count=${s.estimator_count}`)
    else fail(`SD-${u.code}-est`, `estimator_count=${s.estimator_count} (expected ${u.expectedEst})`)

    // Check override
    if (u.expectedOverride) {
      if (!data.override) { fail(`SD-${u.code}-override`, 'No override found'); continue }
      const key = Object.keys(u.expectedOverride)[0]
      if (data.override[key] === u.expectedOverride[key]) pass(`SD-${u.code}-override`, `${key}=${data.override[key]}`)
      else fail(`SD-${u.code}-override`, `${key}=${data.override[key]} (expected ${u.expectedOverride[key]})`)
    }

    // Check vip request status
    if (u.expectedVipStatus) {
      const vip = data.vipRequests[0]
      if (vip?.status === u.expectedVipStatus) pass(`SD-${u.code}-vip`, `vip_request.status=${vip.status}`)
      else fail(`SD-${u.code}-vip`, `vip_request.status=${vip?.status} (expected ${u.expectedVipStatus})`)
    }

    // Check session status
    if (u.expectedSessionStatus) {
      if (s.status === u.expectedSessionStatus) pass(`SD-${u.code}-status`, `session.status=${s.status}`)
      else fail(`SD-${u.code}-status`, `session.status=${s.status} (expected ${u.expectedSessionStatus})`)
    }
  }
}

// ── Area 2: Tenant Config ────────────────────────────────────
async function verifyTenantConfig() {
  section('Area 2 — Tenant Configuration')
  const t = await getTenantConfig()
  if (!t) { fail('TC-00', 'Tenant not found'); return }

  // Verify all required fields exist
  const fields = [
    ['ai_free_messages', 'number'],
    ['ai_manual_approve_limit', 'number'],
    ['ai_hard_cap', 'number'],
    ['plan_free_attempts', 'number'],
    ['plan_manual_approve_limit', 'number'],
    ['plan_hard_cap', 'number'],
    ['estimator_free_attempts', 'number'],
    ['estimator_manual_approve_attempts', 'number'],
    ['estimator_hard_cap', 'number'],
    ['vip_auto_approve', 'boolean'],
    ['default_agent_id', 'string'],
  ]

  for (const [field, type] of fields) {
    if (t[field] !== null && t[field] !== undefined) pass(`TC-${field}`, `${field}=${t[field]}`)
    else fail(`TC-${field}`, `${field} is null/undefined`)
  }

  // Verify default_agent_id points to King Shah
  if (t.default_agent_id === AGENT_ID) pass('TC-default-agent', `default_agent_id = King Shah`)
  else fail('TC-default-agent', `default_agent_id=${t.default_agent_id} (expected King Shah)`)

  // Verify vip_auto_approve is false for testing
  if (t.vip_auto_approve === false) pass('TC-auto-approve', 'vip_auto_approve=false (correct for testing)')
  else fail('TC-auto-approve', `vip_auto_approve=${t.vip_auto_approve} — should be false during testing`)
}

// ── Area 3: Credit Gates (after manual testing) ──────────────
async function verifyCreditGates() {
  section('Area 3 — Credit Gates (run after manual gate tests)')

  // T03 — chat gate should have fired, check if vip_request was created
  const t03 = await getUserData('t03-no-chat@walliam.test')
  if (t03?.vipRequests?.length > 0) {
    const vip = t03.vipRequests[0]
    if (vip.request_type === 'chat') pass('AC-05', `T03 chat vip_request created with request_type=chat`)
    else fail('AC-05', `T03 vip_request.request_type=${vip.request_type} (expected 'chat')`)
  } else {
    skip('AC-05', 'T03 — no vip_request yet — run chat gate test first')
  }

  // T04 — plan gate
  const t04 = await getUserData('t04-no-plans@walliam.test')
  if (t04?.vipRequests?.length > 0) {
    const vip = t04.vipRequests[0]
    if (vip.request_type === 'plan') pass('AP-05', `T04 plan vip_request created with request_type=plan`)
    else fail('AP-05', `T04 vip_request.request_type=${vip.request_type} (expected 'plan')`)
  } else {
    skip('AP-05', 'T04 — no vip_request yet — run plan gate test first')
  }

  // T05 — estimator gate
  const t05 = await getUserData('t05-no-est@walliam.test')
  if (t05?.vipRequests?.length > 0) {
    const vip = t05.vipRequests[0]
    if (vip.request_type === 'estimator') pass('ES-06', `T05 estimator vip_request created with request_type=estimator`)
    else fail('ES-06', `T05 vip_request.request_type=${vip.request_type} (expected 'estimator')`)
  } else {
    skip('ES-06', 'T05 — no vip_request yet — run estimator gate test first')
  }
}

// ── Area 4: Email Approval (after manual approval) ───────────
async function verifyEmailApprovals() {
  section('Area 4 — Email Approvals (run after approving requests)')

  // T08 — was pending, check if approved and credits updated
  const t08 = await getUserData('t08-pending@walliam.test')
  if (t08?.vipRequests?.[0]?.status === 'approved') {
    pass('EM-T08-approved', 'T08 vip_request status=approved')
    if (t08.override?.ai_chat_limit > 2) pass('EM-T08-credits', `T08 ai_chat_limit=${t08.override.ai_chat_limit} (increased after approval)`)
    else fail('EM-T08-credits', `T08 ai_chat_limit=${t08.override?.ai_chat_limit} — credits not updated after approval`)
  } else {
    skip('EM-T08', 'T08 — still pending — approve the email request first')
  }
}

// ── Area 5: Lead System ──────────────────────────────────────
async function verifyLeads() {
  section('Area 5 — Lead System (run after plan/estimator requests)')

  const testEmails = [
    { code: 'T01', email: 't01-fresh@walliam.test', source: 'walliam_charlie' },
    { code: 'T05', email: 't05-no-est@walliam.test', source: 'walliam_estimator_vip_request' },
  ]

  for (const u of testEmails) {
    const data = await getUserData(u.email)
    const lead = data?.leads?.[0]
    if (lead) {
      pass(`LD-${u.code}-exists`, `Lead found: source=${lead.source}`)
      if (lead.agent_id === AGENT_ID) pass(`LD-${u.code}-agent`, 'agent_id = King Shah')
      else fail(`LD-${u.code}-agent`, `agent_id=${lead.agent_id} (expected King Shah)`)
      if (lead.quality === 'hot') pass(`LD-${u.code}-quality`, 'quality=hot')
      else fail(`LD-${u.code}-quality`, `quality=${lead.quality} (expected hot)`)
    } else {
      skip(`LD-${u.code}`, `No lead yet — run plan/estimator for ${u.code} first`)
    }
  }
}

// ── Area 6: Session Continuity ───────────────────────────────
async function verifySessionContinuity() {
  section('Area 6 — Session Continuity')

  for (const email of ['t01-fresh@walliam.test', 't07-custom@walliam.test']) {
    const data = await getUserData(email)
    const { data: allSessions } = await supabase
      .from('chat_sessions')
      .select('id, created_at, message_count')
      .eq('user_id', data?.authUser?.id)
      .eq('tenant_id', TENANT_ID)
      .order('created_at', { ascending: false })

    if (allSessions?.length === 1) pass(`SC-${email}`, '1 session — no duplicate sessions created')
    else if (allSessions?.length > 1) fail(`SC-${email}`, `${allSessions.length} sessions found — duplicate sessions being created`)
    else skip(`SC-${email}`, 'No sessions found — login first')
  }
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2)
  const userFilter = args.find(a => a.startsWith('--user'))?.split('=')[1]
  const areaFilter = args.find(a => a.startsWith('--area'))?.split('=')[1]

  console.log('\n🔍 WALLiam Test Verification\n')
  console.log(`  Tenant: ${TENANT_ID}`)
  console.log(`  Agent:  King Shah (${AGENT_ID})`)

  await verifySeedData()
  await verifyTenantConfig()
  await verifyCreditGates()
  await verifyEmailApprovals()
  await verifyLeads()
  await verifySessionContinuity()

  console.log(`\n${'═'.repeat(60)}`)
  console.log(`  Results: ✅ ${passed} passed  ❌ ${failed} failed  ⏭️  ${skipped} skipped`)
  console.log(`${'═'.repeat(60)}\n`)

  if (failed > 0) process.exit(1)
}

main().catch(console.error)