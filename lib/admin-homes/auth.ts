// lib/admin-homes/auth.ts
import { createServerClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant/getCurrentTenantId'

export type AdminHomesRole = 'admin' | 'manager' | 'agent'

export interface AdminHomesUser {
  role: AdminHomesRole
  name: string
  email: string
  agentId: string | null
  managedAgentIds: string[]
  tenantId: string | null
}

export async function resolveAdminHomesUser(): Promise<AdminHomesUser | null> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Tenant context comes from middleware via x-tenant-id header.
  // Present on tenant domains (walliam.ca etc.); absent on condoleads.ca, localhost.
  const tenantId = await getCurrentTenantId()

  // Find the user's agent record.
  // - With tenant context: scope to that tenant (multi-tenant safety).
  // - Without tenant context (legacy condoleads.ca / localhost):
  //   find their agent row in any tenant — the row's own tenant_id becomes scope.
  let agentQuery = supabase
    .from('agents')
    .select('id, full_name, parent_id, tenant_id, is_admin')
    .eq('user_id', user.id)

  if (tenantId) {
    agentQuery = agentQuery.eq('tenant_id', tenantId)
  }

  const { data: agent } = await agentQuery.maybeSingle()

  // No agent row found.
  // - On a tenant domain: user has no membership in this tenant -> deny.
  // - Without tenant context: user has no agent record anywhere -> fallback admin
  //   (preserves legacy behaviour for condoleads.ca/admin-homes founders).
  if (!agent) {
    if (tenantId) return null
    return {
      role: 'admin',
      name: user.email?.split('@')[0] || 'Admin',
      email: user.email || '',
      agentId: null,
      managedAgentIds: [],
      tenantId: null,
    }
  }

  const effectiveTenantId = agent.tenant_id

  // Explicit admin flag wins over managed-children inference.
  if (agent.is_admin === true) {
    // Find any managed agents (admin can also be a manager of a team).
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
    }
  }

  // Non-admin: classify by managed children within the same tenant.
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
    }
  }

  return {
    role: 'agent',
    name: agent.full_name || user.email || '',
    email: user.email || '',
    agentId: agent.id,
    managedAgentIds: [],
    tenantId: effectiveTenantId,
  }
}
