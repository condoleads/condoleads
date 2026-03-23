// app/admin-homes/agents/page.tsx
import { createClient } from '@/lib/supabase/server'
import AgentsManagementClient from '@/components/admin-homes/AgentsManagementClient'

export const metadata = { title: 'WALLiam Agents — Admin' }

export default async function AdminHomesAgentsPage() {
  const supabase = createClient()

  // WALLiam agents only
  const { data: agents } = await supabase
    .from('agents')
    .select('*')
    .eq('site_type', 'comprehensive')
    .order('created_at', { ascending: false })

  // Enrich with stats
  const agentsWithStats = await Promise.all(
    (agents || []).map(async (agent) => {
      const { data: leads } = await supabase
        .from('leads')
        .select('id, status, quality')
        .eq('agent_id', agent.id)
        .like('source', 'walliam_%')

      const { data: geoAssignments } = await supabase
        .from('agent_property_access')
        .select('id')
        .eq('agent_id', agent.id)
        .eq('is_active', true)

      const { data: buildingAssignments } = await supabase
        .from('agent_geo_buildings')
        .select('id')
        .eq('agent_id', agent.id)

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

  return <AgentsManagementClient agents={agentsWithStats} />
}