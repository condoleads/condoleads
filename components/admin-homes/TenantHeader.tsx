// components/admin-homes/TenantHeader.tsx
// W-LEADS-WORKBENCH W5a (2026-05-14)
//
// Sticky tenant workspace header on every /admin-homes/* page above the
// main content. The W5a rewrite replaces the 'Switcher coming in 3.7'
// placeholder with the active TenantSwitcher dropdown.
//
// SWITCHER VISIBILITY
//   platform_admin / platform_assistant (isPlatformAdmin = true)
//     -> dropdown with Universal + all active tenants
//   tenant_manager (rows in tenant_manager_assignments)
//     -> dropdown with their assigned tenants only; no Universal option
//   all other roles
//     -> no switcher rendered

import Link from 'next/link'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import type { AdminHomesUser } from '@/lib/admin-homes/auth'
import TenantSwitcher, { TenantOption } from './TenantSwitcher'

// F-COCKPIT-HEADER-URL-SCOPE-MISMATCH: extract tenant UUID from cockpit URL
// (/admin-homes/tenants/<uuid>) so header reflects URL-driven scope when a
// platform admin browses into a specific tenant without setting the cookie.
const COCKPIT_PATH_RE = /^\/admin-homes\/tenants\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i

function tenantIdFromPathname(pathname: string | null): string | null {
  if (!pathname) return null
  const m = pathname.match(COCKPIT_PATH_RE)
  return m ? m[1] : null
}

// Authorization gate for URL-derived tenant ID. Platform admins can view any
// tenant; tenant_managers can only view tenants in their assignment list.
async function userMayViewTenantId(
  user: AdminHomesUser,
  tenantId: string,
): Promise<boolean> {
  if (user.isPlatformAdmin) return true
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return false
  const { data: row } = await supabase
    .from('tenant_manager_assignments')
    .select('tenant_id')
    .eq('user_id', authUser.id)
    .eq('tenant_id', tenantId)
    .is('revoked_at', null)
    .maybeSingle()
  return !!row
}

interface TenantHeaderProps {
  user: AdminHomesUser
}

interface TenantRow {
  id: string
  name: string
  brand_name: string | null
  domain: string
  logo_url: string | null
  lifecycle_status: 'active' | 'suspended' | 'terminated'
  termination_grace_until: string | null
}

const STATUS_STYLES: Record<TenantRow['lifecycle_status'], { label: string; className: string }> = {
  active:     { label: 'Active',     className: 'bg-green-100 text-green-800 border-green-200' },
  suspended:  { label: 'Suspended',  className: 'bg-amber-100 text-amber-800 border-amber-200' },
  terminated: { label: 'Terminated', className: 'bg-red-100 text-red-800 border-red-200' },
}

async function fetchTenant(tenantId: string): Promise<TenantRow | null> {
  const supabase = createClient()
  const { data } = await supabase
    .from('tenants')
    .select('id, name, brand_name, domain, logo_url, lifecycle_status, termination_grace_until')
    .eq('id', tenantId)
    .maybeSingle()
  return (data as TenantRow | null) ?? null
}

// W5a: Fetch the list of tenants the user is allowed to switch into.
//   platform_admin / platform_assistant -> all active tenants + universal
//   tenant_manager (rows in tenant_manager_assignments) -> assigned tenants
//   everyone else -> empty (no switcher rendered)
async function fetchSwitcherTenants(
  user: AdminHomesUser,
): Promise<{ tenants: TenantOption[]; allowUniversal: boolean }> {
  const supabase = createClient()

  if (user.isPlatformAdmin) {
    const { data } = await supabase
      .from('tenants')
      .select('id, name, brand_name, domain')
      .eq('is_active', true)
      .order('name')
    return {
      tenants: (data as TenantOption[]) || [],
      allowUniversal: true,
    }
  }

  // Non-platform: check tenant_manager_assignments for this auth user.
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()
  if (!authUser) return { tenants: [], allowUniversal: false }

  const { data: assignments } = await supabase
    .from('tenant_manager_assignments')
    .select('tenants(id, name, brand_name, domain, is_active)')
    .eq('user_id', authUser.id)
    .is('revoked_at', null)

  const tenants: TenantOption[] = []
  for (const row of (assignments as any[]) || []) {
    const t = row?.tenants
    if (t && t.is_active !== false) {
      tenants.push({
        id: t.id,
        name: t.name,
        brand_name: t.brand_name,
        domain: t.domain,
      })
    }
  }
  return { tenants, allowUniversal: false }
}

export default async function TenantHeader({ user }: TenantHeaderProps) {
  const isPlatformAdmin = user.isPlatformAdmin

  // F-COCKPIT-HEADER-URL-SCOPE-MISMATCH: prefer URL-derived tenant ID on
  // /admin-homes/tenants/[id] pages, gated by authorization. Falls back to
  // existing user.tenantId (cookie > x-tenant-id > home tenant > null) when
  // not on a cockpit page or when authorization fails.
  const pathname = headers().get('x-pathname')
  const urlTenantId = tenantIdFromPathname(pathname)
  const urlTenantAllowed = urlTenantId
    ? await userMayViewTenantId(user, urlTenantId)
    : false
  const tenantId = (urlTenantId && urlTenantAllowed) ? urlTenantId : user.tenantId

  // Fetch switcher options (empty -> no switcher rendered).
  const { tenants: switcherTenants, allowUniversal } = await fetchSwitcherTenants(user)
  const canSwitch = allowUniversal || switcherTenants.length > 0

  // Platform Admin landing on /admin-homes with no tenant context (Universal)
  if (!tenantId) {
    if (!isPlatformAdmin) return null // tenant agent without tenant_id is a data error, fail silent
    return (
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-amber-100 flex items-center justify-center text-amber-700 text-xs font-bold">PA</div>
          <div>
            <div className="text-sm font-semibold text-gray-900">No tenant selected</div>
            <div className="text-xs text-gray-500">Platform Admin {'\u2014'} Universal view (all tenants)</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {canSwitch && (
            <TenantSwitcher
              tenants={switcherTenants}
              currentTenantId={null}
              allowUniversal={allowUniversal}
            />
          )}
          <Link
            href="/platform"
            className="text-xs px-3 py-1.5 rounded-md bg-amber-600 text-white hover:bg-amber-700 transition"
          >
            Go to /platform {'\u2192'}
          </Link>
        </div>
      </header>
    )
  }

  const tenant = await fetchTenant(tenantId)
  if (!tenant) {
    return (
      <header className="sticky top-0 z-30 bg-white border-b border-red-200 px-6 py-3">
        <div className="text-sm text-red-700">Tenant not found ({tenantId})</div>
      </header>
    )
  }

  const status = STATUS_STYLES[tenant.lifecycle_status]
  const displayName = tenant.brand_name || tenant.name

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3 min-w-0">
        {tenant.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={tenant.logo_url} alt={displayName + ' logo'} className="w-8 h-8 rounded object-contain bg-gray-50" />
        ) : (
          <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center text-gray-600 text-xs font-bold">
            {displayName.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900 truncate">{displayName}</div>
          <div className="text-xs text-gray-500 truncate">{tenant.domain}</div>
        </div>
        <span className={'ml-3 text-xs font-medium px-2 py-0.5 rounded-full border ' + status.className}>
          {status.label}
        </span>
        {tenant.lifecycle_status === 'terminated' && tenant.termination_grace_until && (
          <span className="ml-2 text-xs text-red-700">
            Grace until {new Date(tenant.termination_grace_until).toLocaleDateString()}
          </span>
        )}
      </div>

      {/* W5a: active tenant switcher (replaces 3.7 placeholder slot) */}
      <div className="flex items-center gap-2">
        {canSwitch && (
          <TenantSwitcher
            tenants={switcherTenants}
            currentTenantId={tenantId}
            allowUniversal={allowUniversal}
          />
        )}
      </div>
    </header>
  )
}
