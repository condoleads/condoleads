// app/admin-homes/users/page.tsx
import { createClient } from '@supabase/supabase-js'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import UsersClient from './UsersClient'
import { getCurrentTenantId } from '@/lib/tenant/getCurrentTenantId'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export const metadata = { title: 'Users - Admin' }


export default async function AdminHomesUsersPage() {
  const supabase = createServiceClient()
  const hostTenantId = await getCurrentTenantId()
  const adminUser = await resolveAdminHomesUser()
  if (!adminUser) return null

  // Phase 3.4+: tenant scoping
  // Tenant Admin / staff: scope by their tenantId
  // Platform Admin without selected tenant: see all (across all tenants)
  // Platform Admin with host-resolved tenant: scope to that
  const seeAll = adminUser.isPlatformAdmin === true && !adminUser.tenantId && !hostTenantId
  const scopedTenantId = adminUser.tenantId ?? hostTenantId
  const tenantId = scopedTenantId // alias used by downstream queries (preserved for back-compat)

  // user_profiles has no tenant_id column. Scope via assigned_agent_id IN (agents of this tenant).
  // Pre-fetch the agent IDs in the current tenant so we can use them as an IN filter.
  let tenantAgentIds: string[] = []
  if (!seeAll) {
    if (!scopedTenantId) {
      return (
        <UsersClient
          users={[]}
          usageMap={{}}
          overrideMap={{}}
          tenant={null}
          agentMap={{}}
          adminUser={adminUser}
          tenantId={null}
        />
      )
    }
    const { data: tenantAgents } = await supabase
      .from('agents')
      .select('id')
      .eq('tenant_id', scopedTenantId)
    tenantAgentIds = (tenantAgents || []).map((a: any) => a.id)
  }

  // Scope users by tenant + role
  let usersQuery = supabase
    .from('user_profiles')
    .select('id, full_name, phone, created_at, last_active_at, assigned_agent_id, looking_to')
    .order('created_at', { ascending: false })
    .limit(10000)

  if (!seeAll) {
    if (adminUser.role === 'manager' && adminUser.agentId) {
      // Manager: own + managed agents (already a subset of tenant)
      const agentIds = [adminUser.agentId, ...adminUser.managedAgentIds]
      usersQuery = usersQuery.in('assigned_agent_id', agentIds)
    } else if (adminUser.role === 'agent' && adminUser.agentId) {
      usersQuery = usersQuery.eq('assigned_agent_id', adminUser.agentId)
    } else {
      // Tenant Admin / Assistant / Support: every user assigned to a tenant agent
      if (tenantAgentIds.length === 0) {
        // Tenant has no agents → no users
        return (
          <UsersClient
            users={[]}
            usageMap={{}}
            overrideMap={{}}
            tenant={null}
            agentMap={{}}
            adminUser={adminUser}
            tenantId={scopedTenantId}
          />
        )
      }
      usersQuery = usersQuery.in('assigned_agent_id', tenantAgentIds)
    }
  }

  const { data: users } = await usersQuery

  const userIds = (users || []).map((u: any) => u.id)

  // Fetch aggregated usage from chat_sessions per user
  let sessions: any[] = []
  if (userIds.length > 0) {
    let sQuery = supabase
      .from('chat_sessions')
      .select('user_id, message_count, buyer_plans_used, seller_plans_used, estimator_count, updated_at')
      .in('user_id', userIds)
      .order('updated_at', { ascending: false })
      .limit(10000)
    if (!seeAll && tenantId) sQuery = sQuery.eq('tenant_id', tenantId)
    const { data } = await sQuery
    sessions = data || []
  }

  // Use most recent session per user only
  const usageMap: Record<string, {
    chat: number; plans: number; estimator: number
  }> = {}
  const seenUsers = new Set<string>()
  for (const s of sessions || []) {
    if (!s.user_id) continue
    if (seenUsers.has(s.user_id)) continue
    seenUsers.add(s.user_id)
    usageMap[s.user_id] = {
      chat:      s.message_count || 0,
      plans:     (s.buyer_plans_used || 0) + (s.seller_plans_used || 0),
      estimator: s.estimator_count || 0,
    }
  }

  // Fetch existing overrides for these users
  let overrides: any[] = []
  if (userIds.length > 0) {
    let oQuery = supabase
      .from('user_credit_overrides')
      .select('user_id, ai_chat_limit, buyer_plan_limit, seller_plan_limit, estimator_limit, note, granted_at, granted_by_tier, granted_by_agent_id')
      .in('user_id', userIds)
    if (!seeAll && tenantId) oQuery = oQuery.eq('tenant_id', tenantId)
    const { data } = await oQuery
    overrides = data || []
  }

  const overrideMap: Record<string, any> = {}
  for (const o of overrides || []) {
    overrideMap[o.user_id] = o
  }

  // Fetch tenant config for limit display (null for Platform Admin viewing across tenants)
  let tenant: any = null
  if (tenantId) {
    const { data } = await supabase
      .from('tenants')
      .select('ai_free_messages, ai_auto_approve_limit, ai_manual_approve_limit, ai_hard_cap, plan_free_attempts, plan_auto_approve_limit, plan_manual_approve_limit, plan_hard_cap, seller_plan_free_attempts, seller_plan_auto_approve_limit, seller_plan_manual_approve_limit, seller_plan_hard_cap, estimator_free_attempts, estimator_auto_approve_attempts, estimator_manual_approve_attempts, estimator_hard_cap')
      .eq('id', tenantId)
      .maybeSingle()
    tenant = data
  }

  // Fetch agents for display names
  let agentsQuery = supabase
    .from('agents')
    .select('id, full_name')
  if (!seeAll && tenantId) agentsQuery = agentsQuery.eq('tenant_id', tenantId)
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
      tenantId={tenantId}
    />
  )
}