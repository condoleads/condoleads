// app/admin-homes/territory/page.tsx
// W-TERRITORY-VIEW UNIT 30: promote /admin-homes/territory from redirect
// to a real page mounting the existing cockpit TerritoryTab. NO new
// territory components — pure mount.
//
// W-TERRITORY-VIEW UNIT 32 (2026-06-27): for platform_admin without a
// scoped tenant (no host, no selected tenant), render an IN-PAGE tenant
// picker rather than bouncing to /admin-homes/tenants. Picker reads the
// `?tenant_id=<uuid>` URL param to render that tenant's territory on the
// same route (no redirect). Tenant-scoped users keep UNIT 30 behavior
// (direct render of their own tenant).
//
// Operator landing: GeographyView (the "who owns which scope" picture).
//
// Routing:
//   - Unauthenticated -> /login.
//   - Tenant-scoped viewer (host- or session-resolved) -> renders
//     TerritoryTab for the scoped tenant directly.
//   - Platform_admin without scope + ?tenant_id present -> validates the
//     param + renders TerritoryTab for that tenant on the same page.
//   - Platform_admin without scope, no ?tenant_id -> renders an in-page
//     picker listing tenants (allow-list columns only; never SELECT *).

import { createClient } from '@/lib/supabase/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { getCurrentTenantId } from '@/lib/tenant/getCurrentTenantId'
import { isCrossTenantView, getScopedTenantId } from '@/lib/admin-homes/scope'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import TerritoryTab from '@/components/admin-homes/cockpit/tabs/TerritoryTab'

export const metadata = { title: 'Territory – Admin' }
export const dynamic = 'force-dynamic'

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface PageProps {
  searchParams?: { tenant_id?: string }
}

export default async function AdminHomesTerritoryPage({ searchParams }: PageProps) {
  const user = await resolveAdminHomesUser()
  if (!user) redirect('/login?redirect=/admin-homes/territory')

  const hostTenantId = await getCurrentTenantId()
  const seeAll = isCrossTenantView(user, hostTenantId)
  let scopedTenantId = getScopedTenantId(user, hostTenantId)

  // W-TERRITORY-VIEW UNIT 32: platform_admin can choose a tenant via the
  // ?tenant_id query param while operating in universal view. Validate the
  // UUID shape + only honor it for platform_admin (tenant-scoped users
  // already have their scope; the param is ignored for them so they can't
  // jump to a different tenant via URL).
  const tenantParam = searchParams?.tenant_id?.trim()
  const supabase = createClient()
  if (seeAll && user.isPlatformAdmin && tenantParam && UUID_RX.test(tenantParam)) {
    const { data: tenantCheck } = await supabase
      .from('tenants')
      .select('id')
      .eq('id', tenantParam)
      .maybeSingle()
    if (tenantCheck) scopedTenantId = tenantParam
  }

  // ─── platform_admin, no scope, no picker selection: render the picker ───
  if (!scopedTenantId) {
    if (!user.isPlatformAdmin) {
      // Defensive: non-platform-admin with no scope should not have reached
      // here (their session resolution would have scoped them). Bounce to
      // dashboard rather than expose the cross-tenant picker.
      redirect('/admin-homes')
    }
    const { data: tenantsRaw } = await supabase
      .from('tenants')
      .select('id, name, domain, brand_name')
      .order('name')
    const tenants = (tenantsRaw || []) as Array<{ id: string; name: string | null; domain: string | null; brand_name: string | null }>

    return (
      <div className="p-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Territory</h1>
          <p className="text-gray-600">
            Pick a tenant to view its territory map: who owns which scope (assigned vs inherited from the house account).
          </p>
        </div>
        <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
          {tenants.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">No tenants found.</div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {tenants.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/admin-homes/territory?tenant_id=${t.id}`}
                    className="flex items-center justify-between px-5 py-4 hover:bg-gray-50"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">{t.brand_name || t.name || t.id}</p>
                      <p className="text-xs text-gray-500">{t.domain || '—'}</p>
                    </div>
                    <span className="text-xs text-green-700 font-medium">View territory →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    )
  }

  // ─── Tenant-scoped (or platform_admin with selected tenant): render territory ───
  // Multi-tenant: narrow allow-list (CLAUDE.md: NEVER SELECT * on tenants).
  // tenantName is the only field consumed by TerritoryTab.
  const { data: tenantRow } = await supabase
    .from('tenants')
    .select('id, name')
    .eq('id', scopedTenantId)
    .maybeSingle()
  const tenantName = (tenantRow as { name: string | null } | null)?.name || 'Tenant'

  // Show a "switch tenant" link when platform_admin is browsing via picker
  // selection, so they can return without retyping URLs.
  const showPickerSwitch = seeAll && user.isPlatformAdmin

  return (
    <div className="p-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{tenantName} Territory</h1>
          <p className="text-gray-600">
            Who owns which scope. Geography is the overview (assigned vs inherited from house account); Agents, Cards, Buildings, Pins, Health, Detail give the deeper cuts.
          </p>
        </div>
        {showPickerSwitch && (
          <Link
            href="/admin-homes/territory"
            className="shrink-0 inline-flex items-center gap-2 px-3 py-2 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
          >
            Switch tenant
          </Link>
        )}
      </div>
      <TerritoryTab
        tenantId={scopedTenantId}
        tenantName={tenantName}
        actingAgentId={user.agentId}
        defaultView="geography"
      />
    </div>
  )
}
