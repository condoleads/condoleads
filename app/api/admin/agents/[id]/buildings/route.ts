import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getCurrentUser, isAdmin } from '@/lib/auth/helpers'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adminStatus = await isAdmin(user.id)
  
  if (!adminStatus) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { buildingIds } = await request.json()
  const agentId = params.id

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  // Delete existing assignments from BOTH tables
  await supabase
    .from('building_agents')
    .delete()
    .eq('agent_id', agentId)

  await supabase
    .from('agent_buildings')
    .delete()
    .eq('agent_id', agentId)

  // Insert new assignments to BOTH tables
  if (buildingIds.length > 0) {
    // Insert to building_agents (new table)
    const buildingAgentsData = buildingIds.map(function(buildingId) {
      return {
        agent_id: agentId,
        building_id: buildingId
      }
    })

    const { error: error1 } = await supabase
      .from('building_agents')
      .insert(buildingAgentsData)

    if (error1) {
      console.error('Error inserting to building_agents:', error1)
      return NextResponse.json({ error: error1.message }, { status: 500 })
    }

    // Insert to agent_buildings (home page table)
    const agentBuildingsData = buildingIds.map(function(buildingId) {
      return {
        agent_id: agentId,
        building_id: buildingId,
        is_featured: false
      }
    })

    const { error: error2 } = await supabase
      .from('agent_buildings')
      .insert(agentBuildingsData)

    if (error2) {
      console.error('Error inserting to agent_buildings:', error2)
      return NextResponse.json({ error: error2.message }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true, count: buildingIds.length })
}