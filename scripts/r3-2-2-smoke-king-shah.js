const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const KING_SHAH_AGENT_ID = 'fafcd5b1-09c0-4b4f-a5bf-8a43b08db2fe'
const WALLIAM_TENANT_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'

async function computeManagedAgentIds(agentId, roleDb, tenantId) {
  if (roleDb === 'agent') return []
  if (roleDb === 'tenant_admin' || roleDb === 'admin') return []

  let q = supabase.from('agents').select('id').eq('parent_id', agentId)
  if (tenantId) q = q.eq('tenant_id', tenantId)
  const { data: direct } = await q
  const directIds = (direct || []).map(a => a.id)

  if (roleDb === 'manager') return directIds

  if (directIds.length === 0) return []
  let q2 = supabase.from('agents').select('id').in('parent_id', directIds)
  if (tenantId) q2 = q2.eq('tenant_id', tenantId)
  const { data: grand } = await q2
  return [...directIds, ...(grand || []).map(a => a.id)]
}

async function fetchActiveDelegators(agentId) {
  const { data: rows, error } = await supabase
    .from('agent_delegations')
    .select('delegator_id, delegator:agents!delegator_id(id, role, tenant_id)')
    .eq('delegate_id', agentId)
    .is('revoked_at', null)

  if (error) {
    console.log('  ERROR fetching delegations:', error.message)
    return []
  }
  if (!rows || rows.length === 0) return []

  const result = []
  for (const row of rows) {
    const d = row.delegator
    if (!d || !d.id || !d.tenant_id) continue
    const managedIds = await computeManagedAgentIds(d.id, d.role, d.tenant_id)
    result.push({
      delegatorId: d.id,
      delegatorRoleDb: d.role,
      delegatorTenantId: d.tenant_id,
      delegatorManagedAgentIds: managedIds,
    })
  }
  return result
}

async function main() {
  console.log('R3.2.2 smoke -- King Shah ActorPermissionContext')
  console.log('================================================')

  const { data: agent, error: e1 } = await supabase
    .from('agents')
    .select('id, user_id, tenant_id, role, parent_id, full_name')
    .eq('id', KING_SHAH_AGENT_ID)
    .single()

  if (e1 || !agent) {
    console.log('ERROR: could not fetch King Shah agent record:', e1 && e1.message)
    process.exit(1)
  }

  console.log('Agent record:')
  console.log(JSON.stringify(agent, null, 2))

  const { data: pa } = await supabase
    .from('platform_admins')
    .select('tier, is_active')
    .eq('user_id', agent.user_id)
    .eq('is_active', true)
    .maybeSingle()

  const platformTier = pa && (pa.tier === 'admin' || pa.tier === 'manager') ? pa.tier : null
  console.log('Platform tier:', platformTier)

  const managedAgentIds = await computeManagedAgentIds(agent.id, agent.role, agent.tenant_id)
  console.log('Managed agent IDs:', JSON.stringify(managedAgentIds))

  const activeDelegators = await fetchActiveDelegators(agent.id)
  console.log('Active delegators:', JSON.stringify(activeDelegators, null, 2))

  const context = {
    agentId: agent.id,
    tenantId: agent.tenant_id,
    roleDb: agent.role,
    platformTier,
    managedAgentIds,
    activeDelegators,
  }

  console.log('')
  console.log('Full ActorPermissionContext:')
  console.log(JSON.stringify(context, null, 2))

  const checks = [
    { name: 'agentId is King Shah ID', pass: context.agentId === KING_SHAH_AGENT_ID },
    { name: 'tenantId is walliam', pass: context.tenantId === WALLIAM_TENANT_ID },
    { name: 'roleDb is tenant_admin', pass: context.roleDb === 'tenant_admin' },
    { name: 'platformTier is null (not in platform_admins)', pass: context.platformTier === null },
    { name: 'managedAgentIds is empty (tenant_admin tier short-circuit)', pass: Array.isArray(context.managedAgentIds) && context.managedAgentIds.length === 0 },
    { name: 'activeDelegators is empty (no delegations in production yet)', pass: Array.isArray(context.activeDelegators) && context.activeDelegators.length === 0 },
  ]

  console.log('')
  console.log('--- Verification ---')
  let allPass = true
  for (const c of checks) {
    console.log('  ' + (c.pass ? 'PASS' : 'FAIL') + ': ' + c.name)
    if (!c.pass) allPass = false
  }

  if (allPass) {
    console.log('')
    console.log('ALL CHECKS PASS -- R3.2.1 logic verified against production data')
    process.exit(0)
  } else {
    console.log('')
    console.log('FAILURES detected -- review output above')
    process.exit(1)
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })