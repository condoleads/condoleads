'use server'

import { createClient } from '@/lib/supabase/server'

export async function getAgentBuildings(agentId: string) {
  const supabase = createClient()
  
  const { data: buildings, error } = await supabase
    .from('buildings')
    .select(`
      id,
      building_name,
      canonical_address,
      street_number,
      street_name,
      city_district,
      postal_code,
      total_units,
      total_floors,
      year_built,
      latitude,
      longitude
    `)
    .order('building_name')
  
  if (error) {
    console.error('Error fetching buildings:', error)
    return { success: false, buildings: [], error: error.message }
  }

  // Get lead counts for each building
  const buildingsWithCounts = await Promise.all(
    (buildings || []).map(async (building) => {
      const { data: leads } = await supabase
        .from('leads')
        .select('id, status, quality')
        .eq('building_id', building.id)
        .eq('agent_id', agentId)
      
      const leadCount = leads?.length || 0
      const newLeads = leads?.filter(l => l.status === 'new').length || 0
      const hotLeads = leads?.filter(l => l.quality === 'hot').length || 0
      
      return {
        ...building,
        lead_count: leadCount,
        new_leads: newLeads,
        hot_leads: hotLeads,
        leads: leads || []
      }
    })
  )

  return { success: true, buildings: buildingsWithCounts }
}

export async function getBuildingDetails(buildingId: string, agentId: string) {
  const supabase = createClient()
  
  const { data: building, error } = await supabase
    .from('buildings')
    .select(`
      *,
      leads!inner(
        id,
        contact_name,
        contact_email,
        contact_phone,
        status,
        quality,
        created_at
      )
    `)
    .eq('id', buildingId)
    .eq('leads.agent_id', agentId)
    .single()
  
  if (error) {
    return { success: false, building: null, error: error.message }
  }
  
  return { success: true, building }
}
