import { config } from 'dotenv'
config({ path: '.env.local' })
config({ path: '.env' })

// scripts/smoke-recipients-helper.ts
// Smoke for H3.3 recipients helper + R7 delegation overlay.
// Run: npx tsx scripts/smoke-recipients-helper.ts
//
// Cases against WALLiam tenant:
//   1. Leaf agent (Neo Smith) — walker climbs to King Shah, no delegations.
//   2. null agentId — Admin Platform promoted to TO.
//   3. King Shah as agent — tenant_admin himself.
//   4. R7: King Shah delegates to WALLiam brand. Resolve for Neo Smith leaf —
//      expects WALLiam brand email in BCC and resolved.tenant_admin_delegates.
//   5. R7: revoke delegation, re-resolve — expects WALLiam brand NOT in BCC.
//
// Always teardown the test delegation row in finally.

import { createClient } from '@supabase/supabase-js'
import { getLeadEmailRecipients } from '../lib/admin-homes/lead-email-recipients'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const WALLIAM_TENANT_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'
const KING_SHAH_ID = 'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe'
const WALLIAM_BRAND_ID = 'cf002201-9b11-4c0f-a1b3-65ed702c9976'

async function main() {
  console.log('=== H3.3 + R7 Recipients Helper Smoke ===\n')

  // Find a leaf agent (Neo Smith — child of King Shah)
  const { data: leaves } = await supabase
    .from('agents')
    .select('id, full_name')
    .eq('tenant_id', WALLIAM_TENANT_ID)
    .eq('parent_id', KING_SHAH_ID)
    .neq('id', WALLIAM_BRAND_ID)
    .limit(1)
  const leafAgentId = (leaves?.[0]?.id as string) || null
  const leafAgentName = leaves?.[0]?.full_name || '(none found)'
  console.log(`Leaf agent: ${leafAgentName} (${leafAgentId || 'NOT FOUND'})\n`)

  // Lookup expected delegate email for assertions
  const { data: brandRow } = await supabase
    .from('agents')
    .select('email, notification_email')
    .eq('id', WALLIAM_BRAND_ID)
    .single()
  const expectedDelegateEmail = (brandRow as any)?.notification_email || (brandRow as any)?.email || null
  console.log(`Expected delegate email (WALLiam brand): ${expectedDelegateEmail || '(NULL — assertions will skip)'}\n`)

  // === Case 1
  if (leafAgentId) {
    console.log('--- Case 1: leaf agent (no delegations) ---')
    const result = await getLeadEmailRecipients(WALLIAM_TENANT_ID, leafAgentId, supabase)
    console.log('TO:', result.to)
    console.log('CC:', result.cc)
    console.log('BCC:', result.bcc)
    const allDelegateFieldsEmpty =
      result.resolved.agent_delegates.length === 0 &&
      result.resolved.manager_delegates.length === 0 &&
      result.resolved.area_manager_delegates.length === 0 &&
      result.resolved.tenant_admin_delegates.length === 0
    console.log(allDelegateFieldsEmpty ? '  [PASS] no delegate fields populated' : '  [FAIL] unexpected delegates')
    console.log()
  }

  // === Case 2
  console.log('--- Case 2: null agentId (Admin Platform promoted to TO) ---')
  const result2 = await getLeadEmailRecipients(WALLIAM_TENANT_ID, null, supabase)
  console.log('TO:', result2.to)
  console.log('BCC:', result2.bcc)
  console.log()

  // === Case 3
  console.log('--- Case 3: King Shah as agent ---')
  const result3 = await getLeadEmailRecipients(WALLIAM_TENANT_ID, KING_SHAH_ID, supabase)
  console.log('TO:', result3.to)
  console.log('CC:', result3.cc)
  console.log('BCC:', result3.bcc)
  console.log()

  // === R7 setup
  console.log('--- R7 setup: insert delegation King Shah -> WALLiam brand ---')
  const { data: insertedRow, error: insertErr } = await supabase
    .from('agent_delegations')
    .insert({
      delegator_id: KING_SHAH_ID,
      delegate_id: WALLIAM_BRAND_ID,
      tenant_id: WALLIAM_TENANT_ID,
      granted_by: KING_SHAH_ID,
    })
    .select('id')
    .single()
  if (insertErr || !insertedRow) {
    console.error('R7 setup FAILED:', insertErr?.message || 'no row')
    return
  }
  const testDelegationId = (insertedRow as any).id as string
  console.log(`  Delegation inserted: ${testDelegationId}\n`)

  try {
    // === Case 4
    if (leafAgentId) {
      console.log('--- Case 4 (R7): leaf agent + active delegation on tenant_admin ---')
      const result4 = await getLeadEmailRecipients(WALLIAM_TENANT_ID, leafAgentId, supabase)
      console.log('BCC:', result4.bcc)
      console.log('resolved.tenant_admin_delegates:', result4.resolved.tenant_admin_delegates)
      if (expectedDelegateEmail) {
        const inBcc = result4.bcc.includes(expectedDelegateEmail)
        const inResolved = result4.resolved.tenant_admin_delegates.includes(expectedDelegateEmail)
        console.log(`  [${inBcc ? 'PASS' : 'FAIL'}] delegate in BCC`)
        console.log(`  [${inResolved ? 'PASS' : 'FAIL'}] delegate in resolved.tenant_admin_delegates`)
      } else {
        console.log('  [SKIP] expectedDelegateEmail is null')
      }
      console.log()
    }

    // === Case 5
    console.log('--- Case 5 (R7): revoke delegation -> delegate NOT in BCC ---')
    const { error: revokeErr } = await supabase
      .from('agent_delegations')
      .update({ revoked_at: new Date().toISOString(), revoked_by: KING_SHAH_ID })
      .eq('id', testDelegationId)
    if (revokeErr) {
      console.error('  revoke FAIL:', revokeErr.message)
    } else if (leafAgentId) {
      const result5 = await getLeadEmailRecipients(WALLIAM_TENANT_ID, leafAgentId, supabase)
      console.log('BCC:', result5.bcc)
      console.log('resolved.tenant_admin_delegates:', result5.resolved.tenant_admin_delegates)
      if (expectedDelegateEmail) {
        const absent = !result5.bcc.includes(expectedDelegateEmail)
        const resolvedEmpty = result5.resolved.tenant_admin_delegates.length === 0
        console.log(`  [${absent ? 'PASS' : 'FAIL'}] delegate removed from BCC after revoke`)
        console.log(`  [${resolvedEmpty ? 'PASS' : 'FAIL'}] resolved.tenant_admin_delegates empty`)
      } else {
        console.log('  [SKIP] expectedDelegateEmail is null')
      }
      console.log()
    }
  } finally {
    console.log('--- Teardown: delete test delegation ---')
    const { error: delErr } = await supabase
      .from('agent_delegations')
      .delete()
      .eq('id', testDelegationId)
    if (delErr) console.error('  teardown FAIL:', delErr.message)
    else console.log('  Test delegation row deleted.')
  }

  console.log('\n=== Done ===')
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})