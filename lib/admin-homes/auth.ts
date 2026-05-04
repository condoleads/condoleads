// lib/admin-homes/auth.ts
import { createServerClient } from '@/lib/supabase/server'
import { getAdminTenantContext } from '@/lib/admin-homes/tenant-context'

export type AdminHomesRole = 'admin' | 'manager' | 'agent'

export type AdminHomesPosition =
  | 'tenant_admin'
  | 'assistant'
  | 'support'
  | 'area_manager'
  | 'manager'
  | 'managed'
  | 'agent'

const ALL_POSITIONS: AdminHomesPosition[] = [
  'tenant_admin', 'assistant', 'support',
  'area_manager', 'manager', 'managed', 'agent',
]

function normalizePosition(raw: string | null | undefined, isAdminCapability: boolean): AdminHomesPosition {
  // Phase 3.3 W1 fix: is_admin = true must win.
  // Previously a raw role string of 'agent' or 'managed' would short-circuit
  // the admin capability check and lock real admins out of admin-only views
  // (e.g., King Shah of WALLiam: role='agent', is_admin=true).
  const validRaw = raw && (ALL_POSITIONS as string[]).includes(raw) ? (raw as AdminHomesPosition) : null
  if (validRaw && validRaw !== 'agent' && validRaw !== 'managed') return validRaw
  if (isAdminCapability) return 'tenant_admin'
  if (validRaw) return validRaw
  if (raw === 'admin') return 'tenant_admin'
  return 'agent'
}

export interface AdminHomesUser {
  role: AdminHomesRole
  position: AdminHomesPosition
  name: string
  email: string
  agentId: string | null
  managedAgentIds: string[]
  tenantId: string | null
  isPlatformAdmin: boolean
  homeTenantId: string | null
}

export async function resolveAdminHomesUser(): Promise<AdminHomesUser | null> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: platformAdminRow } = await supabase
    .from('platform_admins')
    .select('id, is_active')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  const isPlatformAdmin = !!platformAdminRow

  const { data: anyAgent } = await supabase
    .from('agents')
    .select('id, full_name, parent_id, tenant_id, role')
    .eq('user_id', user.id)
    .order('tenant_id', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  const homeTenantId = anyAgent?.tenant_id || null

  const context = await getAdminTenantContext(homeTenantId, isPlatformAdmin)
  const effectiveTenantId = context.currentTenantId

  let agentQuery = supabase
    .from('agents')
    .select('id, full_name, parent_id, tenant_id, role')
    .eq('user_id', user.id)

  if (effectiveTenantId) {
    agentQuery = agentQuery.eq('tenant_id', effectiveTenantId)
  }

  const { data: agent } = await agentQuery.maybeSingle()

  if (!agent) {
    if (effectiveTenantId && !isPlatformAdmin) return null
    return {
      role: 'admin',
      position: 'tenant_admin',
      name: user.email?.split('@')[0] || 'Admin',
      email: user.email || '',
      agentId: null,
      managedAgentIds: [],
      tenantId: effectiveTenantId,
      isPlatformAdmin,
      homeTenantId,
    }
  }

  const position = normalizePosition(agent.role, agent.role === 'admin' || agent.role === 'tenant_admin')

  if (agent.role === 'admin' || agent.role === 'tenant_admin') {
    const { data: managedAgents } = await supabase
      .from('agents')
      .select('id')
      .eq('parent_id', agent.id)

    const managedIds = (managedAgents || []).map((a: any) => a.id)

    return {
      role: 'admin',
      position,
      name: agent.full_name || user.email || '',
      email: user.email || '',
      agentId: agent.id,
      managedAgentIds: managedIds,
      tenantId: effectiveTenantId,
      isPlatformAdmin,
      homeTenantId,
    }
  }

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
      position,
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
    position,
    name: agent.full_name || user.email || '',
    email: user.email || '',
    agentId: agent.id,
    managedAgentIds: [],
    tenantId: effectiveTenantId,
    isPlatformAdmin,
    homeTenantId,
  }
}