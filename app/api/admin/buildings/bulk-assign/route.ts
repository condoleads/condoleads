import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Correct table: agent_buildings (has is_featured, used by homepage)
const TABLE_NAME = 'agent_buildings'
const BATCH_SIZE = 50

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
      // Step 1: Find existing assignments in batches
      const existingBuildingIds = new Set<string>()
      for (let i = 0; i < buildingIds.length; i += BATCH_SIZE) {
        const chunk = buildingIds.slice(i, i + BATCH_SIZE)
        const { data: existing, error } = await supabase
          .from(TABLE_NAME)
          .select('building_id')
          .eq('agent_id', agentId)
          .in('building_id', chunk)

        if (error) {
          console.error(`Error checking existing batch ${i}:`, error)
          throw error
        }
        existing?.forEach(e => existingBuildingIds.add(e.building_id))
      }

      // Step 2: Filter to only new assignments
      const newBuildingIds = buildingIds.filter(id => !existingBuildingIds.has(id))

      // Step 3: Insert new assignments in batches
      let totalAssigned = 0
      for (let i = 0; i < newBuildingIds.length; i += BATCH_SIZE) {
        const chunk = newBuildingIds.slice(i, i + BATCH_SIZE)
        const records = chunk.map(buildingId => ({
          building_id: buildingId,
          agent_id: agentId,
          is_featured: false
        }))

        const { error } = await supabase.from(TABLE_NAME).insert(records)
        if (error) {
          console.error(`Error inserting batch ${i}:`, error)
          throw error
        }
        totalAssigned += chunk.length
      }

      return NextResponse.json({
        success: true,
        assigned: totalAssigned,
        skipped: existingBuildingIds.size,
        total: buildingIds.length
      })

    } else if (action === 'unassign') {
      // Delete in batches
      let totalUnassigned = 0
      for (let i = 0; i < buildingIds.length; i += BATCH_SIZE) {
        const chunk = buildingIds.slice(i, i + BATCH_SIZE)
        const { error } = await supabase
          .from(TABLE_NAME)
          .delete()
          .eq('agent_id', agentId)
          .in('building_id', chunk)

        if (error) {
          console.error(`Error deleting batch ${i}:`, error)
          throw error
        }
        totalUnassigned += chunk.length
      }

      return NextResponse.json({ success: true, unassigned: totalUnassigned })
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 })

  } catch (error: any) {
    console.error('Bulk assign error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}