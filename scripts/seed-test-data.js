// scripts/seed-test-data.js
// WALLiam Comprehensive Test Data Seed Script
// Creates 10 test users with specific credit states for comprehensive testing
// Run: node scripts/seed-test-data.js
// Clean up: node scripts/seed-test-data.js --clean

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const TENANT_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
const AGENT_ID  = 'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe' // King Shah
const TEST_PASSWORD = 'TestWalliam2026!'

const TEST_USERS = [
  {
    code: 'T01',
    email: 't01-fresh@walliam.test',
    name: 'T01 Fresh User',
    phone: '4160000101',
    description: 'Fresh user — tenant defaults, 0 used',
    session: { message_count: 0, buyer_plans_used: 0, seller_plans_used: 0, estimator_count: 0, status: 'active' },
    override: null,
  },
  {
    code: 'T02',
    email: 't02-low-chat@walliam.test',
    name: 'T02 Low Chat',
    phone: '4160000102',
    description: '1 chat remaining — triggers low credit warning email',
    session: { message_count: 1, buyer_plans_used: 0, seller_plans_used: 0, estimator_count: 0, status: 'active' },
    override: { ai_chat_limit: 2, buyer_plan_limit: 2, estimator_limit: 2 },
  },
  {
    code: 'T03',
    email: 't03-no-chat@walliam.test',
    name: 'T03 No Chat',
    phone: '4160000103',
    description: '0 chats remaining — chat gate fires',
    session: { message_count: 2, buyer_plans_used: 0, seller_plans_used: 0, estimator_count: 0, status: 'active' },
    override: { ai_chat_limit: 2, buyer_plan_limit: 2, estimator_limit: 2 },
  },
  {
    code: 'T04',
    email: 't04-no-plans@walliam.test',
    name: 'T04 No Plans',
    phone: '4160000104',
    description: '0 plans remaining — plan gate fires',
    session: { message_count: 0, buyer_plans_used: 1, seller_plans_used: 1, estimator_count: 0, status: 'active' },
    override: { ai_chat_limit: 2, buyer_plan_limit: 2, estimator_limit: 2 },
  },
  {
    code: 'T05',
    email: 't05-no-est@walliam.test',
    name: 'T05 No Estimator',
    phone: '4160000105',
    description: '0 estimator remaining — estimator gate fires',
    session: { message_count: 0, buyer_plans_used: 0, seller_plans_used: 0, estimator_count: 2, status: 'active' },
    override: { ai_chat_limit: 2, buyer_plan_limit: 2, estimator_limit: 2 },
  },
  {
    code: 'T06',
    email: 't06-all-empty@walliam.test',
    name: 'T06 All Empty',
    phone: '4160000106',
    description: '0/0/0 — all gates fire',
    session: { message_count: 2, buyer_plans_used: 1, seller_plans_used: 1, estimator_count: 2, status: 'active' },
    override: { ai_chat_limit: 2, buyer_plan_limit: 2, estimator_limit: 2 },
  },
  {
    code: 'T07',
    email: 't07-custom@walliam.test',
    name: 'T07 Custom Override',
    phone: '4160000107',
    description: 'Custom override 5/5/5 — tests override display',
    session: { message_count: 0, buyer_plans_used: 0, seller_plans_used: 0, estimator_count: 0, status: 'active' },
    override: { ai_chat_limit: 5, buyer_plan_limit: 5, estimator_limit: 5 },
  },
  {
    code: 'T08',
    email: 't08-pending@walliam.test',
    name: 'T08 Pending Request',
    phone: '4160000108',
    description: 'Pending vip_request — tests polling',
    session: { message_count: 2, buyer_plans_used: 0, seller_plans_used: 0, estimator_count: 0, status: 'active' },
    override: { ai_chat_limit: 2, buyer_plan_limit: 2, estimator_limit: 2 },
    vipRequest: { status: 'pending', request_type: 'chat' },
  },
  {
    code: 'T09',
    email: 't09-approved@walliam.test',
    name: 'T09 Approved',
    phone: '4160000109',
    description: 'Approved vip_request — tests post-approval state',
    session: { message_count: 2, buyer_plans_used: 0, seller_plans_used: 0, estimator_count: 0, status: 'vip' },
    override: { ai_chat_limit: 5, buyer_plan_limit: 2, estimator_limit: 2 },
    vipRequest: { status: 'approved', request_type: 'chat' },
  },
  {
    code: 'T10',
    email: 't10-vip@walliam.test',
    name: 'T10 VIP Session',
    phone: '4160000110',
    description: 'VIP session with manual approvals — tests VIP credit stack',
    session: { message_count: 1, buyer_plans_used: 1, seller_plans_used: 0, estimator_count: 0, status: 'vip', manual_approvals_count: 1 },
    override: null,
  },
]

async function cleanTestUsers() {
  console.log('\n🧹 Cleaning test users...')
  for (const u of TEST_USERS) {
    // Find auth user
    const { data: { users } } = await supabase.auth.admin.listUsers()
    const authUser = users.find(x => x.email === u.email)
    if (authUser) {
      // Delete override
      await supabase.from('user_credit_overrides').delete().eq('user_id', authUser.id)
      // Delete vip_requests via chat_sessions
      const { data: sessions } = await supabase.from('chat_sessions').select('id').eq('user_id', authUser.id)
      if (sessions?.length) {
        for (const s of sessions) {
          await supabase.from('vip_requests').delete().eq('session_id', s.id)
        }
      }
      // Delete sessions
      await supabase.from('chat_sessions').delete().eq('user_id', authUser.id)
      // Delete profile
      await supabase.from('user_profiles').delete().eq('id', authUser.id)
      // Delete auth user
      await supabase.auth.admin.deleteUser(authUser.id)
      console.log(`  ✅ Deleted ${u.code} (${u.email})`)
    } else {
      console.log(`  ⏭️  ${u.code} not found — skipping`)
    }
  }
  console.log('\n✅ Cleanup complete')
}

async function seedTestUsers() {
  console.log('\n🌱 Seeding test users...\n')
  const results = []

  for (const u of TEST_USERS) {
    process.stdout.write(`  Creating ${u.code} — ${u.description}...`)
    try {
      // 1 — Create auth user
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: u.email,
        password: TEST_PASSWORD,
        email_confirm: true,
      })
      if (authError) throw new Error(`Auth: ${authError.message}`)
      const userId = authData.user.id

      // 2 — Create user_profile
      const { error: profileError } = await supabase.from('user_profiles').upsert({
        id: userId,
        full_name: u.name,
        phone: u.phone,
        registration_source: 'seed_script',
        welcome_email_sent: true,
        low_credit_email_sent: { chat: false, estimate: false, plan: false },
      })
      if (profileError) throw new Error(`Profile: ${profileError.message}`)

      // 3 — Create chat_session
      const { data: sessionData, error: sessionError } = await supabase.from('chat_sessions').insert({
        agent_id: AGENT_ID,
        user_id: userId,
        tenant_id: TENANT_ID,
        source: 'walliam',
        session_token: crypto.randomUUID(),
        status: u.session.status,
        message_count: u.session.message_count,
        buyer_plans_used: u.session.buyer_plans_used,
        seller_plans_used: u.session.seller_plans_used,
        estimator_count: u.session.estimator_count,
        total_ai_usage: u.session.message_count,
        manual_approvals_count: u.session.manual_approvals_count || 0,
        last_activity_at: new Date().toISOString(),
      }).select().single()
      if (sessionError) throw new Error(`Session: ${sessionError.message}`)

      // 4 — Create user_credit_override if needed
      if (u.override) {
        const { error: overrideError } = await supabase.from('user_credit_overrides').insert({
          user_id: userId,
          tenant_id: TENANT_ID,
          granted_by_agent_id: AGENT_ID,
          granted_by_tier: 'admin',
          note: `Seed script — ${u.code}`,
          ai_chat_limit: u.override.ai_chat_limit,
          buyer_plan_limit: u.override.buyer_plan_limit,
          estimator_limit: u.override.estimator_limit,
          granted_at: new Date().toISOString(),
        })
        if (overrideError) throw new Error(`Override: ${overrideError.message}`)
      }

      // 5 — Create vip_request if needed
      if (u.vipRequest) {
        const token = crypto.randomUUID()
        const { error: vipError } = await supabase.from('vip_requests').insert({
          session_id: sessionData.id,
          agent_id: AGENT_ID,
          phone: u.phone,
          full_name: u.name,
          email: u.email,
          request_source: 'walliam_charlie',
          request_type: u.vipRequest.request_type,
          status: u.vipRequest.status,
          approval_token: token,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          messages_granted: u.vipRequest.status === 'approved' ? 3 : 0,
          responded_at: u.vipRequest.status === 'approved' ? new Date().toISOString() : null,
        })
        if (vipError) throw new Error(`VIP Request: ${vipError.message}`)
      }

      console.log(' ✅')
      results.push({ code: u.code, email: u.email, userId, status: 'created' })

    } catch (err) {
      console.log(` ❌ ${err.message}`)
      results.push({ code: u.code, email: u.email, status: 'failed', error: err.message })
    }
  }

  console.log('\n📋 Summary:')
  console.log('─'.repeat(60))
  results.forEach(r => {
    if (r.status === 'created') {
      console.log(`  ✅ ${r.code} — ${r.email}`)
    } else {
      console.log(`  ❌ ${r.code} — ${r.error}`)
    }
  })
  console.log('─'.repeat(60))
  console.log(`\n  Password for all users: ${TEST_PASSWORD}`)
  console.log('  Login at: walliam.ca\n')
}

// Main
const args = process.argv.slice(2)
if (args.includes('--clean')) {
  cleanTestUsers().catch(console.error)
} else {
  seedTestUsers().catch(console.error)
}