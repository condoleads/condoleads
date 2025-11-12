import { redirect } from 'next/navigation'
import { getCurrentUser, isAdmin } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import AgentBuildingsClient from '@/components/admin/AgentBuildingsClient'

export default async function AgentDetailPage({ params }: { params: { id: string } }) {
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

  // Get all buildings with assignment info
  const { data: allBuildings } = await supabase
    .from('buildings')
    .select('id, building_name, canonical_address, total_units')
    .order('building_name')

  // Get ALL building assignments (for all agents) to show who has what
  const { data: allAssignments } = await supabase
    .from('building_agents')
    .select(`
      building_id,
      agent_id,
      agents (
        id,
        full_name
      )
    `)

  // Get current agent's assigned buildings
  const { data: currentAgentAssignments } = await supabase
    .from('building_agents')
    .select('building_id, buildings(id, building_name, canonical_address, total_units)')
    .eq('agent_id', params.id)

  const assignedBuildings = ((currentAgentAssignments || []).map(function(a: any) { return a.buildings }).filter(function(b) { return b !== null }) as any)

  // Add assignment info to each building
  const buildingsWithAssignments = (allBuildings || []).map(function(building) {
    const assignments = (allAssignments || []).filter(function(a) {
      return a.building_id === building.id
    })
    
    const otherAgents = assignments
      .filter(function(a) { return a.agent_id !== params.id })
      .map(function(a: any) { return a.agents.full_name })
    
    return {
      ...building,
      assignedToOthers: otherAgents,
      assignmentCount: assignments.length
    }
  })

  return (
    <AgentBuildingsClient 
      agent={agent} 
      allBuildings={buildingsWithAssignments}
      assignedBuildings={assignedBuildings}
    />
  )
}