// app/admin-homes/territory/page.tsx
// W-TERRITORY-VIEW UNIT 30: promote the legacy /admin-homes/territory URL
// from a redirect-only shim to a real page that mounts the existing
// cockpit TerritoryTab — making the 7 production territory views
// (Agents / Cards / Geography / Pins / Buildings / Health / Detail)
// directly reachable from the sidebar without first navigating through
// the cockpit. NO new territory components — pure mount.
//
// Operator landing: GeographyView (the "who owns which scope" picture).
// Cockpit callers still get 'agents' as the default (backward-compat
// preserved by the optional defaultView prop on TerritoryTab).
//
// Routing:
//   - Unauthenticated -> /login.
//   - Cross-tenant universal view (platform_admin with no tenant scope)
//     -> /admin-homes/tenants (pick a tenant; mirrors the prior redirect
//     and the agents page's empty-scope handling).
//   - Tenant-scoped viewer (incl. platform_admin with host or selected
//     tenant) -> renders TerritoryTab for the scoped tenant.

import { createClient } from '@/lib/supabase/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { getCurrentTenantId } from '@/lib/tenant/getCurrentTenantId'
import { isCrossTenantView, getScopedTenantId } from '@/lib/admin-homes/scope'
import { redirect } from 'next/navigation'
import TerritoryTab from '@/components/admin-homes/cockpit/tabs/TerritoryTab'

export const metadata = { title: 'Territory – Admin' }
export const dynamic = 'force-dynamic'

export default async function AdminHomesTerritoryPage() {
  const user = await resolveAdminHomesUser()
  if (!user) redirect('/login?redirect=/admin-homes/territory')

  const hostTenantId = await getCurrentTenantId()
  const seeAll = isCrossTenantView(user, hostTenantId)
  const scopedTenantId = getScopedTenantId(user, hostTenantId)

  // Universal view (platform_admin with no host + no selected tenant):
  // territory is per-tenant; bounce to the tenants list so the operator
  // can pick one. Mirrors the prior redirect-only behavior + the agents
  // page's no-scope handling.
  if (seeAll || !scopedTenantId) {
    redirect('/admin-homes/tenants')
  }

  // Multi-tenant: narrow allow-list (CLAUDE.md: NEVER SELECT * on tenants).
  // tenantName is the only field consumed by TerritoryTab / its sub-views.
  const supabase = createClient()
  const { data: tenantRow } = await supabase
    .from('tenants')
    .select('id, name')
    .eq('id', scopedTenantId)
    .maybeSingle()
  const tenantName = (tenantRow as { name: string | null } | null)?.name || 'Tenant'

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">{tenantName} Territory</h1>
        <p className="text-gray-600">
          Who owns which scope. Geography is the overview (assigned vs inherited from house account); Agents, Cards, Buildings, Pins, Health, Detail give the deeper cuts.
        </p>
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
