import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { buildingIds, agentId, action } = await request.json()

    if (!buildingIds || !Array.isArray(buildingIds) || buildingIds.length === 0) {
      return NextResponse.json({ success: false, error: 'Building IDs required' }, { status: 400 })
    }

    if (!agentId) {
      return NextResponse.json({ success: false, error: 'Agent ID required' }, { status: 400 })
    }

    if (action === 'assign') {
      const { data: existing } = await supabase
        .from('building_agents')
        .select('building_id')
        .eq('agent_id', agentId)
        .in('building_id', buildingIds)

      const existingBuildingIds = new Set(existing?.map(e => e.building_id) || [])
      const newBuildingIds = buildingIds.filter(id => !existingBuildingIds.has(id))

      if (newBuildingIds.length > 0) {
        const records = newBuildingIds.map(buildingId => ({
          building_id: buildingId,
          agent_id: agentId
        }))

        const { error } = await supabase.from('building_agents').insert(records)
        if (error) throw error
      }

      return NextResponse.json({ success: true, assigned: newBuildingIds.length, skipped: existingBuildingIds.size })

    } else if (action === 'unassign') {
      const { error } = await supabase
        .from('building_agents')
        .delete()
        .eq('agent_id', agentId)
        .in('building_id', buildingIds)

      if (error) throw error
      return NextResponse.json({ success: true, unassigned: buildingIds.length })
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 })

  } catch (error: any) {
    console.error('Bulk assign error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
