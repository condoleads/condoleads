import { redirect } from 'next/navigation'
import { getCurrentUser, isAdmin } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import AgentBuildingsClient from '@/components/admin/AgentBuildingsClient'

export default async function AgentDetailPage({ params }) {
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/login')
  }

  const adminStatus = await isAdmin(user.id)
  
  if (!adminStatus) {
    redirect('/dashboard')
  }

  const supabase = createClient()

  // Get agent details
  const { data: agent } = await supabase
    .from('agents')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!agent) {
    redirect('/admin/agents')
  }

  // Get all buildings
  const { data: allBuildings } = await supabase
    .from('buildings')
    .select('id, building_name, canonical_address, total_units')
    .order('building_name')

  // Get agent's assigned buildings
  const { data: assignments } = await supabase
    .from('building_agents')
    .select('building_id, buildings(id, building_name, canonical_address, total_units)')
    .eq('agent_id', params.id)

  const assignedBuildings = (assignments || []).map(function(a) { 
    return a.buildings 
  }).filter(function(b) { return b !== null })

  return (
    <AgentBuildingsClient 
      agent={agent} 
      allBuildings={allBuildings || []}
      assignedBuildings={assignedBuildings}
    />
  )
}