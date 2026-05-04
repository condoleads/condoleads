// lib/admin-homes/auth.ts
//
// R3.2.1 — extended to populate ActorPermissionContext at auth time so that
// can() (lib/admin-homes/permissions.ts) can run as a pure synchronous
// function with no DB hits at decision time.
//
// All existing fields on AdminHomesUser preserved verbatim. The 7 existing
// callers continue to work unchanged. Only addition: `permissions` field.

import { createServerClient } from '@/lib/supabase/server'
import { getAdminTenantContext } from '@/lib/admin-homes/tenant-context'
import type {
  ActorPermissionContext,
  DbRole,
  DelegatorRef,
  PlatformTier,
} from '@/lib/admin-homes/permissions'

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
  // R3.2.1: pre-fetched permission context for can() decisions.
  // See lib/admin-homes/permissions.ts.
  permissions: ActorPermissionContext
}

type SupabaseClient = Awaited<ReturnType<typeof createServerClient>>

function isValidDbRole(s: string | null | undefined): s is DbRole {
  return (
    s === 'agent' ||
    s === 'manager' ||
    s === 'area_manager' ||
    s === 'tenant_admin' ||
    s === 'admin'
  )
}

function isValidPlatformTier(s: string | null | undefined): s is PlatformTier {
  return s === 'admin' || s === 'manager'
}

// ─────────────────────────────────────────────────────────────────────────────
// R3.2.1: subtree-aware managed-agent ID computation.
//
//   agent / tenant_admin / admin  → []
//     (can() does not consult managedAgentIds for these tiers; tenant_admin
//      grants OK without scope check, agent uses direct ownership)
//   manager                       → direct children only
//   area_manager                  → direct children + grandchildren (depth 2)
//
// Always tenant-scoped when tenantId is provided (Rule Zero #1: multitenant).
// ─────────────────────────────────────────────────────────────────────────────
async function computeManagedAgentIds(
  supabase: SupabaseClient,
  agentId: string,
  roleDb: DbRole,
  tenantId: string | null
): Promise<string[]> {
  if (roleDb === 'agent') return []
  if (roleDb === 'tenant_admin' || roleDb === 'admin') return []

  let q = supabase.from('agents').select('id').eq('parent_id', agentId)
  if (tenantId) q = q.eq('tenant_id', tenantId)
  const { data: direct } = await q
  const directIds = (direct || []).map((a: { id: string }) => a.id)

  if (roleDb === 'manager') return directIds

  // area_manager: also fetch grandchildren.
  if (directIds.length === 0) return []
  let q2 = supabase.from('agents').select('id').in('parent_id', directIds)
  if (tenantId) q2 = q2.eq('tenant_id', tenantId)
  const { data: grand } = await q2
  return [...directIds, ...(grand || []).map((a: { id: string }) => a.id)]
}

// ─────────────────────────────────────────────────────────────────────────────
// R3.2.1: fetch active delegations where this agent is the delegate.
// For each delegator, also computes their managedAgentIds via the same
// subtree logic so can() can evaluate manager-scope checks via overlay.
// ─────────────────────────────────────────────────────────────────────────────
async function fetchActiveDelegators(
  supabase: SupabaseClient,
  agentId: string
): Promise<DelegatorRef[]> {
  const { data: rows, error } = await supabase
    .from('agent_delegations')
    .select('delegator_id, delegator:agents!delegator_id(id, role, tenant_id)')
    .eq('delegate_id', agentId)
    .is('revoked_at', null)

  if (error || !rows || rows.length === 0) return []

  const result: DelegatorRef[] = []
  for (const row of rows) {
    // Supabase embed types are loose without generated schema types.
    // Cast deliberately; defensive guards below cover the runtime shape.
    const d = (row as { delegator: { id?: string; role?: string; tenant_id?: string } | null }).delegator
    if (!d || !d.id || !d.tenant_id || !isValidDbRole(d.role)) continue
    const roleDb: DbRole = d.role
    const managedIds = await computeManagedAgentIds(supabase, d.id, roleDb, d.tenant_id)
    result.push({
      delegatorId: d.id,
      delegatorRoleDb: roleDb,
      delegatorTenantId: d.tenant_id,
      delegatorManagedAgentIds: managedIds,
    })
  }
  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// resolveAdminHomesUser — entry point.
// ─────────────────────────────────────────────────────────────────────────────
export async function resolveAdminHomesUser(): Promise<AdminHomesUser | null> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // R3.2.1: also fetch tier (was: just is_active).
  const { data: platformAdminRow } = await supabase
    .from('platform_admins')
    .select('id, is_active, tier')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  const isPlatformAdmin = !!platformAdminRow
  const platformTier: PlatformTier | null = isValidPlatformTier(platformAdminRow?.tier)
    ? platformAdminRow.tier
    : null

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

  // ───── Synthetic admin path: PA with no agents row in effective tenant. ─────
  if (!agent) {
    if (effectiveTenantId && !isPlatformAdmin) return null

    const permissions: ActorPermissionContext = {
      agentId: null,
      tenantId: effectiveTenantId,
      roleDb: null,
      platformTier,
      managedAgentIds: [],
      activeDelegators: [],
    }

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
      permissions,
    }
  }

  // ───── Real agent path: build full permission context. ──────────────────────
  const roleDb: DbRole | null = isValidDbRole(agent.role) ? agent.role : null
  const permsManagedIds: string[] = roleDb
    ? await computeManagedAgentIds(supabase, agent.id, roleDb, effectiveTenantId)
    : []
  const activeDelegators = await fetchActiveDelegators(supabase, agent.id)

  const permissions: ActorPermissionContext = {
    agentId: agent.id,
    tenantId: effectiveTenantId,
    roleDb,
    platformTier,
    managedAgentIds: permsManagedIds,
    activeDelegators,
  }

  const position = normalizePosition(agent.role, agent.role === 'admin' || agent.role === 'tenant_admin')

  // Legacy 3-tier role bucketing (preserved for existing callers).
  if (agent.role === 'admin' || agent.role === 'tenant_admin') {
    const { data: managedAgents } = await supabase
      .from('agents')
      .select('id')
      .eq('parent_id', agent.id)

    const managedIds = (managedAgents || []).map((a: { id: string }) => a.id)

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
      permissions,
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
  const managedIds = (managedAgents || []).map((a: { id: string }) => a.id)

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
      permissions,
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
    permissions,
  }
}
