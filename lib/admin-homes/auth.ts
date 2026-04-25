// lib/admin-homes/auth.ts
import { createServerClient } from '@/lib/supabase/server'
import { getAdminTenantContext } from '@/lib/admin-homes/tenant-context'

export type AdminHomesRole = 'admin' | 'manager' | 'agent'

export interface AdminHomesUser {
  role: AdminHomesRole
  name: string
  email: string
  agentId: string | null
  managedAgentIds: string[]
  tenantId: string | null         // effective tenant (= currentTenantId from context)
  // 3.1 — new fields:
  isPlatformAdmin: boolean        // user is in platform_admins
  homeTenantId: string | null     // user's own tenant (before any override)
}

export async function resolveAdminHomesUser(): Promise<AdminHomesUser | null> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Is this user a platform admin? (Allows tenant override via cookie.)
  const { data: platformAdminRow } = await supabase
    .from('platform_admins')
    .select('id, is_active')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  const isPlatformAdmin = !!platformAdminRow

  // Find the user's agent record. Without tenant context (legacy condoleads.ca / localhost),
  // the agent's own tenant_id becomes their home tenant.
  // With tenant context, the agent must belong to that tenant.
  // Note: we resolve homeTenantId BEFORE applying any override, so we know
  // where the user "lives" independent of where they're currently operating.

  // First fetch — get any agent row for this user (to determine homeTenantId).
  const { data: anyAgent } = await supabase
    .from('agents')
    .select('id, full_name, parent_id, tenant_id, is_admin')
    .eq('user_id', user.id)
    .order('tenant_id', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  const homeTenantId = anyAgent?.tenant_id || null

  // Resolve effective tenant context (override -> header -> home -> none).
  const context = await getAdminTenantContext(homeTenantId, isPlatformAdmin)
  const effectiveTenantId = context.currentTenantId

  // Find the agent record scoped to the EFFECTIVE tenant (which may be an override).
  let agentQuery = supabase
    .from('agents')
    .select('id, full_name, parent_id, tenant_id, is_admin')
    .eq('user_id', user.id)

  if (effectiveTenantId) {
    agentQuery = agentQuery.eq('tenant_id', effectiveTenantId)
  }

  const { data: agent } = await agentQuery.maybeSingle()

  // No agent row found in the effective tenant.
  if (!agent) {
    // On a tenant domain (effectiveTenantId set, no override): user has no membership.
    // BUT: platform admins overriding into a tenant they don't belong to are still allowed
    // — they enter as admin via platform privilege, not as a member of the tenant.
    if (effectiveTenantId && !isPlatformAdmin) return null

    // Without tenant context, OR platform admin overriding: fallback admin user.
    return {
      role: 'admin',
      name: user.email?.split('@')[0] || 'Admin',
      email: user.email || '',
      agentId: null,
      managedAgentIds: [],
      tenantId: effectiveTenantId,
      isPlatformAdmin,
      homeTenantId,
    }
  }

  // Explicit admin flag wins over managed-children inference.
  if (agent.is_admin === true) {
    const { data: managedAgents } = await supabase
      .from('agents')
      .select('id')
      .eq('parent_id', agent.id)

    const managedIds = (managedAgents || []).map((a: any) => a.id)

    return {
      role: 'admin',
      name: agent.full_name || user.email || '',
      email: user.email || '',
      agentId: agent.id,
      managedAgentIds: managedIds,
      tenantId: effectiveTenantId,
      isPlatformAdmin,
      homeTenantId,
    }
  }

  // Non-admin: classify by managed children within the effective tenant.
  let managedQuery = supabase
    .from('agents')
    .select('id')
    .eq('parent_id', agent.id)

  if (effectiveTenantId) {
    managedQuery = managedQuery.eq('tenant_id', effectiveTenantId)
  }

  const { data: managedAgents } = await managedQuery
  const managedIds = (managedAgents || []).map((a: any) => a.id)

  if (managedIds.length > 0) {
    return {
      role: 'manager',
      name: agent.full_name || user.email || '',
      email: user.email || '',
      agentId: agent.id,
      managedAgentIds: managedIds,
      tenantId: effectiveTenantId,
      isPlatformAdmin,
      homeTenantId,
    }
  }

  return {
    role: 'agent',
    name: agent.full_name || user.email || '',
    email: user.email || '',
    agentId: agent.id,
    managedAgentIds: [],
    tenantId: effectiveTenantId,
    isPlatformAdmin,
    homeTenantId,
  }
}
