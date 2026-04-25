// lib/admin-homes/tenant-context.ts
// Single source of truth for "which tenant is this admin operating in right now."
//
// Resolution order:
//   1. platform_tenant_override cookie (only if user is in platform_admins)
//   2. x-tenant-id header (set by middleware on tenant domains)
//   3. user's home tenant (their agent.tenant_id)
//   4. null
//
// 3.1 — Cookie is not set anywhere yet. The switcher (3.7) sets it.
// This util just makes the rest of the system aware of it when it appears.

import { headers, cookies } from 'next/headers'

export const PLATFORM_TENANT_OVERRIDE_COOKIE = 'platform_tenant_override'

export type TenantOverrideSource =
  | 'platform_override'
  | 'host_header'
  | 'home_tenant'
  | 'none'

export interface TenantContext {
  currentTenantId: string | null
  source: TenantOverrideSource
  isOverride: boolean
}

/**
 * Resolve the effective tenant for an admin-homes request.
 *
 * @param homeTenantId - the user's own tenant_id (from their agent record)
 * @param isPlatformAdmin - whether the user is in platform_admins (gates override)
 */
export async function getAdminTenantContext(
  homeTenantId: string | null,
  isPlatformAdmin: boolean
): Promise<TenantContext> {
  // 1. Platform admin override cookie wins, but only if user is actually a platform admin.
  if (isPlatformAdmin) {
    const cookieStore = await cookies()
    const override = cookieStore.get(PLATFORM_TENANT_OVERRIDE_COOKIE)?.value
    if (override) {
      return {
        currentTenantId: override,
        source: 'platform_override',
        isOverride: true,
      }
    }
  }

  // 2. Host-derived header set by middleware (walliam.ca etc.)
  const h = await headers()
  const headerTenantId = h.get('x-tenant-id')
  if (headerTenantId) {
    return {
      currentTenantId: headerTenantId,
      source: 'host_header',
      isOverride: false,
    }
  }

  // 3. Fall back to the user's own tenant.
  if (homeTenantId) {
    return {
      currentTenantId: homeTenantId,
      source: 'home_tenant',
      isOverride: false,
    }
  }

  // 4. No tenant context at all (legacy condoleads.ca standalone agents, e.g. Shah).
  return {
    currentTenantId: null,
    source: 'none',
    isOverride: false,
  }
}
