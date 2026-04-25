// scripts/make-test-staff-loginable.js
// Phase 3.3b prep — provision auth users for the 6 unlinked test staff agents.
// Idempotent: re-run safe.
// Run:    node scripts/make-test-staff-loginable.js
// Clean:  node scripts/make-test-staff-loginable.js --clean

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const TEST_PASSWORD = 'TestWalliam2026!'

// Only the 6 unlinked test staff (Test Managed already has an auth user)
const STAFF = [
  { email: 'test-tenant-admin@test-3-2.local', full_name: 'Test Tenant Admin' },
  { email: 'test-assistant@test-3-2.local',    full_name: 'Test Assistant' },
  { email: 'test-support@test-3-2.local',      full_name: 'Test Support' },
  { email: 'test-area-manager@test-3-2.local', full_name: 'Test Area Manager' },
  { email: 'test-manager@test-3-2.local',      full_name: 'Test Manager' },
  { email: 'test-agent@test-3-2.local',        full_name: 'Test Agent' },
]

async function findAuthUserByEmail(email) {
  // listUsers paginates; for our scale (a few dozen) one page is fine.
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 })
  if (error) throw new Error(`listUsers: ${error.message}`)
  return data.users.find(u => u.email === email) || null
}

async function findAgentByName(full_name) {
  const { data, error } = await supabase
    .from('agents')
    .select('id, full_name, user_id, tenant_id')
    .eq('full_name', full_name)
    .eq('tenant_id', '00000000-0000-0000-0000-000000000003')
    .maybeSingle()
  if (error) throw new Error(`agents lookup: ${error.message}`)
  return data
}

async function provision() {
  console.log('\nProvisioning test staff auth users...\n')
  for (const s of STAFF) {
    process.stdout.write(`  ${s.full_name.padEnd(20)} `)

    const agent = await findAgentByName(s.full_name)
    if (!agent) { console.log('SKIP (agent not found)'); continue }

    let authUser = await findAuthUserByEmail(s.email)

    if (!authUser) {
      const { data, error } = await supabase.auth.admin.createUser({
        email: s.email,
        password: TEST_PASSWORD,
        email_confirm: true,
      })
      if (error) { console.log(`FAIL — ${error.message}`); continue }
      authUser = data.user
    }

    if (agent.user_id !== authUser.id) {
      const { error } = await supabase
        .from('agents')
        .update({ user_id: authUser.id })
        .eq('id', agent.id)
      if (error) { console.log(`FAIL link — ${error.message}`); continue }
    }

    console.log(`OK  user_id=${authUser.id}`)
  }
  console.log(`\nPassword for all: ${TEST_PASSWORD}\n`)
}

async function clean() {
  console.log('\nRemoving test staff auth users...\n')
  for (const s of STAFF) {
    process.stdout.write(`  ${s.full_name.padEnd(20)} `)
    const authUser = await findAuthUserByEmail(s.email)
    if (!authUser) { console.log('skip (no auth user)'); continue }

    const agent = await findAgentByName(s.full_name)
    if (agent && agent.user_id === authUser.id) {
      await supabase.from('agents').update({ user_id: null }).eq('id', agent.id)
    }

    const { error } = await supabase.auth.admin.deleteUser(authUser.id)
    if (error) { console.log(`FAIL — ${error.message}`); continue }
    console.log('removed')
  }
  console.log('\nDone.\n')
}

const isClean = process.argv.includes('--clean')
;(isClean ? clean() : provision()).catch(e => { console.error(e); process.exit(1) })