const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function main() {
  // Probe 1: agent_role_changes columns (read row if exists, else infer from insert error)
  console.log('=== agent_role_changes ===')
  const { data: arc, error: e1 } = await supabase
    .from('agent_role_changes')
    .select('*')
    .limit(1)
  if (e1) {
    console.log('Error:', e1.message)
  } else if (arc.length === 0) {
    // Empty table — try insert with minimal payload to see what's required
    const { error: ins } = await supabase
      .from('agent_role_changes')
      .insert({ id: '00000000-0000-0000-0000-000000000099' })
    console.log('Forced insert error (expected, reveals required cols):', ins?.message)
  } else {
    console.log('Sample row columns:', Object.keys(arc[0]).sort().join(', '))
    console.log('Sample row:', JSON.stringify(arc[0], null, 2))
  }

  // Probe 2: agent_delegations columns
  console.log('')
  console.log('=== agent_delegations ===')
  const { data: ad, error: e2 } = await supabase
    .from('agent_delegations')
    .select('*')
    .limit(1)
  if (e2) {
    console.log('Error:', e2.message)
  } else if (ad.length === 0) {
    const { error: ins } = await supabase
      .from('agent_delegations')
      .insert({ id: '00000000-0000-0000-0000-000000000098' })
    console.log('Forced insert error:', ins?.message)
  } else {
    console.log('Sample row columns:', Object.keys(ad[0]).sort().join(', '))
    console.log('Sample row:', JSON.stringify(ad[0], null, 2))
  }

  // Probe 3: read R2.2 + R2.3 migration files to get definitive CHECK constraint text
  console.log('')
  console.log('=== Migration files ===')
  const fs = require('fs')
  const m22 = fs.readFileSync('supabase/migrations/20260504_r2_2_agent_delegations.sql', 'utf8')
  const m23 = fs.readFileSync('supabase/migrations/20260504_r2_3_agent_role_changes.sql', 'utf8')

  console.log('--- R2.2 (agent_delegations) full SQL ---')
  console.log(m22)
  console.log('')
  console.log('--- R2.3 (agent_role_changes) full SQL ---')
  console.log(m23)
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })