// app/admin-homes/agents/[id]/page.tsx
import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import GeoAssignmentSection from '@/components/admin-homes/GeoAssignmentSection'
import BuildingAssignmentSection from '@/components/admin-homes/BuildingAssignmentSection'
import ListingAssignmentSection from '@/components/admin-homes/ListingAssignmentSection'
import DelegationsSection from '@/components/admin-homes/DelegationsSection'
import Link from 'next/link'

export default async function AgentDetailPage({ params }: { params: { id: string } }) {
  // Phase 3.4+: auth + cross-tenant access guard
  const user = await resolveAdminHomesUser()
  if (!user) redirect(`/login?redirect=/admin-homes/agents/${params.id}`)

  const supabase = createClient()
  const { data: agent } = await supabase
    .from('agents')
    .select('*')
    .eq('id', params.id)
    .eq('site_type', 'comprehensive')
    .single()
  if (!agent) notFound()

  // Tenant-check: non-platform-admins can only view agents in their own tenant.
  // Platform Admin can view any agent.
  if (!user.isPlatformAdmin) {
    if (!user.tenantId || agent.tenant_id !== user.tenantId) {
      redirect('/admin-homes/agents')
    }
  }

  // Geo data for assignment UI
  const [
    { data: areas },
    { data: municipalities },
    { data: communities },
    { data: neighbourhoods },
    { data: currentGeo },
    { data: allBuildings },
    { data: currentBuildings },
  ] = await Promise.all([
    supabase.from('treb_areas').select('id, name, slug').order('name'),
    supabase.from('municipalities').select('id, name, slug, area_id').order('name'),
    supabase.from('communities').select('id, name, slug, municipality_id').order('name'),
    supabase.from('neighbourhoods').select('id, name, slug, area_id').order('name'),
    supabase.from('agent_property_access').select('*').eq('agent_id', params.id).eq('is_active', true),
    supabase.from('buildings').select('id, building_name, canonical_address, community_id').order('building_name'),
    supabase.from('agent_geo_buildings').select('building_id').eq('agent_id', params.id),
  ])

  // Fetch manager data if this agent is managed by someone
  let managerName: string | null = null
  let inheritedAssignments: any[] = []

  if (agent.parent_id) {
    const [{ data: manager }, { data: managerGeo }] = await Promise.all([
      supabase.from('agents').select('full_name').eq('id', agent.parent_id).single(),
      supabase.from('agent_property_access').select('*').eq('agent_id', agent.parent_id).eq('is_active', true),
    ])
    managerName = manager?.full_name || null
    inheritedAssignments = managerGeo || []
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <Link href="/admin-homes/agents" className="text-sm text-green-600 hover:text-green-700 mb-4 inline-block">
          ← Back to Agents
        </Link>
        <div className="flex items-center gap-4">
          {agent.profile_photo_url ? (
            <img src={agent.profile_photo_url} alt={agent.full_name} className="w-16 h-16 rounded-full object-cover" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-green-700 flex items-center justify-center text-white text-2xl font-bold">
              {agent.full_name?.charAt(0)}
            </div>
          )}
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{agent.full_name}</h1>
            <p className="text-gray-500">{agent.email} · {agent.title || 'Agent'}</p>
            <p className="text-sm text-gray-400">{agent.brokerage_name}</p>
            {managerName && (
              <p className="text-sm text-blue-600 mt-1">↑ Managed by {managerName}</p>
            )}
          </div>
        </div>
      </div>

      {/* Assignment sections */}
      <div className="space-y-8">
        <GeoAssignmentSection
          agentId={params.id}
          areas={areas || []}
          municipalities={municipalities || []}
          communities={communities || []}
          neighbourhoods={neighbourhoods || []}
          currentAssignments={currentGeo || []}
          inheritedAssignments={inheritedAssignments}
          inheritedFrom={managerName}
        />
        <BuildingAssignmentSection
          agentId={params.id}
          allBuildings={allBuildings || []}
          assignedBuildingIds={(currentBuildings || []).map(b => b.building_id)}
        />
        <ListingAssignmentSection
          agentId={params.id}
        />
        <DelegationsSection
          agentId={params.id}
        />
      </div>
    </div>
  )
}