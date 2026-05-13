const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const SENTINEL_TENANT = '00000000-0000-0000-0000-00000000000a'
const SENTINEL_AGENT = '00000000-0000-0000-0000-00000000a001'

async function setupTenant() {
  await supabase.from('agents').delete().eq('tenant_id', SENTINEL_TENANT)
  await supabase.from('tenants').delete().eq('id', SENTINEL_TENANT)
  const r = await supabase.from('tenants').insert({
    id: SENTINEL_TENANT,
    name: 'R4.2 Smoke',
    domain: 'r42smoke.test',
    admin_email: 'r42@sentinel.test',
    source_key: 'r42-sentinel',
  })
  if (r.error) throw new Error('Tenant setup: ' + r.error.message)
}

async function tryAgentInsert(payload) {
  await supabase.from('agents').delete().eq('id', SENTINEL_AGENT)
  const r = await supabase.from('agents').insert(payload)
  return r.error ? r.error.message : 'OK'
}

async function main() {
  await setupTenant()

  let attempt = {
    id: SENTINEL_AGENT,
    tenant_id: SENTINEL_TENANT,
    user_id: null,
    email: 'r42-ta@sentinel.test',
    full_name: 'R42 TA',
    role: 'tenant_admin',
    site_type: 'comprehensive',
    subdomain: 'r42-ta',
  }

  for (let i = 0; i < 15; i++) {
    const result = await tryAgentInsert(attempt)
    console.log(`Attempt ${i+1}: ${result}`)
    if (result === 'OK') break
    const m = result.match(/null value in column "([^"]+)"/)
    if (!m) {
      console.log('Non-null-column error; stopping.')
      break
    }
    const col = m[1]
    if (col.endsWith('_email')) attempt[col] = `r42-${col}@sentinel.test`
    else if (col.endsWith('_at')) attempt[col] = new Date().toISOString()
    else if (col === 'is_active' || col.includes('enabled') || col.includes('approve')) attempt[col] = (col === 'is_active')
    else if (col.endsWith('_id')) attempt[col] = '00000000-0000-0000-0000-000000000000'
    else if (col.endsWith('_url')) attempt[col] = 'https://example.test/null'
    else if (col.endsWith('_count') || col.includes('limit') || col.includes('cap') || col.includes('attempt') || col.includes('messages') || col.includes('threshold')) attempt[col] = 0
    else if (col === 'subdomain') attempt[col] = 'r42-' + Math.random().toString(36).slice(2,8)
    else attempt[col] = `r42-${col}`
  }

  console.log('')
  console.log('Final agent payload columns supplied:', Object.keys(attempt).sort().join(', '))

  // Cleanup
  await supabase.from('agents').delete().eq('id', SENTINEL_AGENT)
  await supabase.from('tenants').delete().eq('id', SENTINEL_TENANT)
  console.log('Cleanup done.')
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })