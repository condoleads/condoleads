// app/admin-homes/users/page.tsx
import { createClient } from '@supabase/supabase-js'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import UsersClient from './UsersClient'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export const metadata = { title: 'WALLiam Users - Admin' }

const TENANT_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'

export default async function AdminHomesUsersPage() {
  const supabase = createServiceClient()
  const adminUser = await resolveAdminHomesUser()
  if (!adminUser) return null

  // Scope users by role
  let usersQuery = supabase
    .from('user_profiles')
    .select('id, full_name, phone, created_at, last_active_at, assigned_agent_id, looking_to')
    .order('created_at', { ascending: false })
    .limit(10000)

  if (adminUser.role === 'manager' && adminUser.agentId) {
    const agentIds = [adminUser.agentId, ...adminUser.managedAgentIds]
    usersQuery = usersQuery.in('assigned_agent_id', agentIds)
  } else if (adminUser.role === 'agent' && adminUser.agentId) {
    usersQuery = usersQuery.eq('assigned_agent_id', adminUser.agentId)
  }

  const { data: users } = await usersQuery

  const userIds = (users || []).map((u: any) => u.id)

  // Fetch aggregated usage from chat_sessions per user
  const { data: sessions } = userIds.length > 0
    ? await supabase
        .from('chat_sessions')
        .select('user_id, message_count, buyer_plans_used, seller_plans_used, estimator_count')
        .eq('tenant_id', TENANT_ID)
        .in('user_id', userIds)
        .limit(10000)
    : { data: [] }

  // Aggregate usage per user (sum across all sessions)
  const usageMap: Record<string, {
    chat: number; buyer: number; seller: number; estimator: number
  }> = {}
  for (const s of sessions || []) {
    if (!s.user_id) continue
    if (!usageMap[s.user_id]) usageMap[s.user_id] = { chat: 0, buyer: 0, seller: 0, estimator: 0 }
    usageMap[s.user_id].chat      += s.message_count || 0
    usageMap[s.user_id].buyer     += s.buyer_plans_used || 0
    usageMap[s.user_id].seller    += s.seller_plans_used || 0
    usageMap[s.user_id].estimator += s.estimator_count || 0
  }

  // Fetch existing overrides for these users
  const { data: overrides } = userIds.length > 0
    ? await supabase
        .from('user_credit_overrides')
        .select('user_id, ai_chat_limit, buyer_plan_limit, seller_plan_limit, estimator_limit, note, granted_at, granted_by_tier, granted_by_agent_id')
        .eq('tenant_id', TENANT_ID)
        .in('user_id', userIds)
    : { data: [] }

  const overrideMap: Record<string, any> = {}
  for (const o of overrides || []) {
    overrideMap[o.user_id] = o
  }

  // Fetch tenant config for limit display
  const { data: tenant } = await supabase
    .from('tenants')
    .select('ai_free_messages, ai_auto_approve_limit, ai_manual_approve_limit, ai_hard_cap, plan_free_attempts, plan_auto_approve_limit, plan_manual_approve_limit, plan_hard_cap, seller_plan_free_attempts, seller_plan_auto_approve_limit, seller_plan_manual_approve_limit, seller_plan_hard_cap, estimator_free_attempts, estimator_auto_approve_attempts, estimator_manual_approve_attempts, estimator_hard_cap')
    .eq('id', TENANT_ID)
    .single()

  // Fetch agents for display names
  let agentsQuery = supabase
    .from('agents')
    .select('id, full_name')
    .eq('tenant_id', TENANT_ID)
  if (adminUser.role === 'manager' && adminUser.agentId) {
    agentsQuery = agentsQuery.in('id', [adminUser.agentId, ...adminUser.managedAgentIds])
  } else if (adminUser.role === 'agent' && adminUser.agentId) {
    agentsQuery = agentsQuery.eq('id', adminUser.agentId)
  }
  const { data: agents } = await agentsQuery
  const agentMap: Record<string, string> = {}
  for (const a of agents || []) agentMap[a.id] = a.full_name || 'Unknown'

  return (
    <UsersClient
      users={users || []}
      usageMap={usageMap}
      overrideMap={overrideMap}
      tenant={tenant}
      agentMap={agentMap}
      adminUser={adminUser}
      tenantId={TENANT_ID}
    />
  )
}