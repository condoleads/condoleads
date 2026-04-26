// app/admin-homes/agents/page.tsx
// Phase 3.4 — tenant-scoped agent list + tenant-aware title

import { createClient } from '@/lib/supabase/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { redirect } from 'next/navigation'
import AgentsManagementClient from '@/components/admin-homes/AgentsManagementClient'

export const metadata = { title: 'Agents – Admin' }
export const dynamic = 'force-dynamic'

export default async function AdminHomesAgentsPage() {
  const user = await resolveAdminHomesUser()
  if (!user) redirect('/login?redirect=/admin-homes/agents')

  const supabase = createClient()

  // Tenant scoping
  const seeAll = user.isPlatformAdmin === true && !user.tenantId
  const scopedTenantId = user.tenantId

  let agentsQuery = supabase
    .from('agents')
    .select('*')
    .eq('site_type', 'comprehensive')
    .order('created_at', { ascending: false })

  if (!seeAll) {
    if (!scopedTenantId) {
      // Authenticated but no tenant context — return empty
      return <AgentsManagementClient agents={[]} tenants={[]} tenantName={null} />
    }
    agentsQuery = agentsQuery.eq('tenant_id', scopedTenantId)
  }

  let tenantsQuery = supabase
    .from('tenants')
    .select('id, name, domain')
    .order('name')

  if (!seeAll && scopedTenantId) {
    tenantsQuery = tenantsQuery.eq('id', scopedTenantId)
  }

  const [{ data: agents }, { data: tenants }] = await Promise.all([
    agentsQuery,
    tenantsQuery,
  ])

  const tenantName =
    scopedTenantId
      ? (tenants || []).find(t => t.id === scopedTenantId)?.name ?? null
      : null

  const agentsWithStats = await Promise.all(
    (agents || []).map(async (agent) => {
      const [{ data: leads }, { data: geoAssignments }, { data: buildingAssignments }] = await Promise.all([
        supabase.from('leads').select('id, status, quality').eq('agent_id', agent.id).like('source', 'walliam_%'),
        supabase.from('agent_property_access').select('id').eq('agent_id', agent.id).eq('is_active', true),
        supabase.from('agent_geo_buildings').select('id').eq('agent_id', agent.id),
      ])
      return {
        ...agent,
        total_leads: leads?.length || 0,
        new_leads: leads?.filter(l => l.status === 'new').length || 0,
        hot_leads: leads?.filter(l => l.quality === 'hot').length || 0,
        geo_territories: geoAssignments?.length || 0,
        assigned_buildings: buildingAssignments?.length || 0,
      }
    })
  )

  return <AgentsManagementClient agents={agentsWithStats} tenants={tenants || []} tenantName={tenantName} />
}