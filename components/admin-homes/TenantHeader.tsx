// components/admin-homes/TenantHeader.tsx
// Phase 3.3 — sticky tenant workspace header
// Renders on every /admin-homes/* page above the main content.
// Slot for tenant switcher (3.7) reserved but inactive in 3.3.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

interface TenantHeaderProps {
  tenantId: string | null
  isPlatformAdmin: boolean
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

export default async function TenantHeader({ tenantId, isPlatformAdmin }: TenantHeaderProps) {
  // Platform Admin landing on /admin-homes with no tenant context selected
  if (!tenantId) {
    if (!isPlatformAdmin) return null // tenant agent without tenant_id is a data error, fail silent
    return (
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-amber-100 flex items-center justify-center text-amber-700 text-xs font-bold">PA</div>
          <div>
            <div className="text-sm font-semibold text-gray-900">No tenant selected</div>
            <div className="text-xs text-gray-500">Platform Admin — choose a tenant to enter its workspace</div>
          </div>
        </div>
        <Link
          href="/platform"
          className="text-xs px-3 py-1.5 rounded-md bg-amber-600 text-white hover:bg-amber-700 transition"
        >
          Go to /platform →
        </Link>
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
          <img src={tenant.logo_url} alt={`${displayName} logo`} className="w-8 h-8 rounded object-contain bg-gray-50" />
        ) : (
          <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center text-gray-600 text-xs font-bold">
            {displayName.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900 truncate">{displayName}</div>
          <div className="text-xs text-gray-500 truncate">{tenant.domain}</div>
        </div>
        <span className={`ml-3 text-xs font-medium px-2 py-0.5 rounded-full border ${status.className}`}>
          {status.label}
        </span>
        {tenant.lifecycle_status === 'terminated' && tenant.termination_grace_until && (
          <span className="ml-2 text-xs text-red-700">
            Grace until {new Date(tenant.termination_grace_until).toLocaleDateString()}
          </span>
        )}
      </div>

      {/* Tenant switcher slot — reserved for 3.7, inactive in 3.3 */}
      <div className="flex items-center gap-2">
        {isPlatformAdmin && (
          <span className="text-xs text-gray-400 italic">Switcher coming in 3.7</span>
        )}
      </div>
    </header>
  )
}