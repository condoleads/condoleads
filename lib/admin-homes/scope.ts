// lib/admin-homes/scope.ts
//
// W-LEADS-WORKBENCH W2.5 (2026-05-13).
//
// Role-aware query predicate helpers for admin-homes surfaces.
//
// Extracts the inline scoping pattern from app/admin-homes/leads/page.tsx
// (L70-78 tenant gate + L62-67 role gate) into a single canonical helper so
// the W4 workbench page and future consumers share the same logic.
//
// MULTITENANT CONTRACT (Rule Zero #1):
//   Every helper enforces tenant_id scoping when !isCrossTenantView.
//   No caller should bypass. seeAll = platform_admin + no tenant_id + no host.
//
// PURE FUNCTION CONTRACT:
//   No I/O. No DB hits. No async. No throws.
//   Consumes pre-fetched AdminHomesUser from resolveAdminHomesUser.
//
// 7-ROLE SURFACE (locked W1-VERIFIED Probe 1 + W2-SHIPPED):
//   platform_admin     -> platform_admins.tier='admin' (cardinality 1)
//   platform_assistant -> platform_admins.tier='manager' (legacy DB name)
//   tenant_admin       -> agents.role='tenant_admin' OR 'admin' (legacy)
//   tenant_manager     -> tenant_manager_assignments junction (W2-B shipped)
//   area_manager       -> agents.role='area_manager'
//   manager            -> agents.role='manager'
//   agent              -> agents.role='agent'

import type { AdminHomesUser } from '@/lib/admin-homes/auth'

// ---------------------------------------------------------------------------
// Role + tier constants (7-role surface documentation)
// ---------------------------------------------------------------------------

export const TENANT_ROLES = ['agent', 'manager', 'area_manager', 'tenant_admin', 'admin'] as const
export type TenantRole = typeof TENANT_ROLES[number]

export const PLATFORM_TIERS = ['admin', 'manager'] as const
export type PlatformTierName = typeof PLATFORM_TIERS[number]

// Full 7-role surface for documentation. Actual storage is split across
// platform_admins.tier (2 values), agents.role CHECK (5 values), and
// tenant_manager_assignments junction (1 implicit role).
export const PRINCIPAL_TIERS = [
  'platform_admin',
  'platform_assistant',
  'tenant_manager',
  'tenant_admin',
  'area_manager',
  'manager',
  'agent',
] as const
export type PrincipalTier = typeof PRINCIPAL_TIERS[number]

// ---------------------------------------------------------------------------
// Scope predicates
// ---------------------------------------------------------------------------

/**
 * Cross-tenant view: a platform admin without a selected tenant AND without
 * a host-resolved tenant sees data across all tenants. Otherwise scoped.
 */
export function isCrossTenantView(
  user: AdminHomesUser,
  hostTenantId: string | null
): boolean {
  return user.isPlatformAdmin === true && !user.tenantId && !hostTenantId
}

/**
 * Returns the tenant_id the user is currently scoped to, or null on
 * cross-tenant view. Precedence: user.tenantId > hostTenantId.
 */
export function getScopedTenantId(
  user: AdminHomesUser,
  hostTenantId: string | null
): string | null {
  if (isCrossTenantView(user, hostTenantId)) return null
  return user.tenantId ?? hostTenantId
}

// ---------------------------------------------------------------------------
// Supabase query builders (generic over T to preserve type chaining)
// ---------------------------------------------------------------------------

interface ScopableQuery<T> {
  eq: (col: string, val: any) => T
  in: (col: string, vals: any[]) => T
}

/**
 * Apply tenant + role scoping to a leads query.
 *
 *   Cross-tenant view  -> no filter (platform admin sees all)
 *   Otherwise          -> .eq('tenant_id', scopedTenantId), then role gate:
 *                           manager -> .in('agent_id', [own + managedAgentIds])
 *                           agent   -> .eq('agent_id', own)
 *                           admin   -> no further filter (all leads in tenant)
 *
 * W-HOUSE-ACCOUNT UNIT 8B: an optional houseAccountAgentId param bypasses
 * the role gate when the current user IS the holder of the tenant's
 * default_agent_id. Rationale: the house account is an OVERSIGHT role that
 * sees every lead routed to its tenant (including those routed to managers
 * or agents below them). Today's house accounts are tenant_admins, who
 * already bypass the role gate via role-fallthrough; this generalizes the
 * rule so a future tenant that sets the house account to a manager or
 * agent still gets tenant-wide visibility. Keyed on default_agent_id, not
 * on role — caller pre-computes by reading tenant.default_agent_id and
 * comparing to user.agentId.
 *
 * Backward-compatible: houseAccountAgentId defaults to null (current
 * behavior preserved for all existing callers).
 */
export function scopeLeadsQuery<T extends ScopableQuery<T>>(
  query: T,
  user: AdminHomesUser,
  hostTenantId: string | null,
  houseAccountAgentId: string | null = null,
): T {
  const seeAll = isCrossTenantView(user, hostTenantId)
  const scopedTenantId = getScopedTenantId(user, hostTenantId)

  if (!seeAll && scopedTenantId) {
    query = query.eq('tenant_id', scopedTenantId)
  }

  // W-HOUSE-ACCOUNT UNIT 8B: house-account oversight override. If the
  // logged-in user IS the holder of this tenant's default_agent_id, skip
  // the agent/manager role gate so they see every tenant lead. The tenant
  // scope filter above stays in force — multi-tenant boundary intact.
  const isHouseAccount =
    houseAccountAgentId !== null &&
    user.agentId !== null &&
    user.agentId === houseAccountAgentId
  if (isHouseAccount) {
    return query
  }

  if (user.role === 'manager' && user.agentId) {
    query = query.in('agent_id', [user.agentId, ...user.managedAgentIds])
  } else if (user.role === 'agent' && user.agentId) {
    query = query.eq('agent_id', user.agentId)
  }

  return query
}

/**
 * Apply tenant + role scoping to an agents query (keyed by agents.id instead
 * of leads.agent_id). Same predicates, different column.
 */
export function scopeAgentsByRole<T extends ScopableQuery<T>>(
  query: T,
  user: AdminHomesUser,
  hostTenantId: string | null
): T {
  const seeAll = isCrossTenantView(user, hostTenantId)
  const scopedTenantId = getScopedTenantId(user, hostTenantId)

  if (!seeAll && scopedTenantId) {
    query = query.eq('tenant_id', scopedTenantId)
  }

  if (user.role === 'manager' && user.agentId) {
    query = query.in('id', [user.agentId, ...user.managedAgentIds])
  } else if (user.role === 'agent' && user.agentId) {
    query = query.eq('id', user.agentId)
  }

  return query
}