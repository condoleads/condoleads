import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function PUT(request: NextRequest) {
  try {
    const { buildingId, building_name, slug, parking_value_sale, parking_value_lease, locker_value_sale, locker_value_lease } = await request.json()

    if (!buildingId) {
      return NextResponse.json({ error: 'Building ID required' }, { status: 400 })
    }

    const updateData: any = {}
    if (building_name !== undefined) updateData.building_name = building_name
    if (slug !== undefined) updateData.slug = slug
    if (parking_value_sale !== undefined) updateData.parking_value_sale = parking_value_sale
    if (parking_value_lease !== undefined) updateData.parking_value_lease = parking_value_lease
    if (locker_value_sale !== undefined) updateData.locker_value_sale = locker_value_sale
    if (locker_value_lease !== undefined) updateData.locker_value_lease = locker_value_lease

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    // Check if slug already exists (if changing slug)
    if (slug) {
      const { data: existing } = await supabase
        .from('buildings')
        .select('id')
        .eq('slug', slug)
        .neq('id', buildingId)
        .single()

      if (existing) {
        return NextResponse.json({ error: 'Slug already exists' }, { status: 400 })
      }
    }

    const { data, error } = await supabase
      .from('buildings')
      .update(updateData)
      .eq('id', buildingId)
      .select()
      .single()

    if (error) {
      console.error('Update building error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log('✅ Building updated:', data)
    return NextResponse.json({ success: true, building: data })

  } catch (error) {
    console.error('Update building error:', error)
    return NextResponse.json({ error: 'Failed to update building' }, { status: 500 })
  }
}

// Assign/Unassign agent to building
export async function POST(request: NextRequest) {
  try {
    const { buildingId, agentId, action } = await request.json()

    if (!buildingId || !agentId || !action) {
      return NextResponse.json({ error: 'buildingId, agentId, and action required' }, { status: 400 })
    }

    if (action === 'assign') {
      // Insert to both tables
      const { error: error1 } = await supabase
        .from('agent_buildings')
        .insert({ agent_id: agentId, building_id: buildingId })

      const { error: error2 } = await supabase
        .from('agent_buildings')
        .insert({ agent_id: agentId, building_id: buildingId, is_featured: false })

      if (error1 || error2) {
        console.error('Assign error:', error1 || error2)
        return NextResponse.json({ error: (error1 || error2)?.message }, { status: 500 })
      }

      return NextResponse.json({ success: true, action: 'assigned' })

    } else if (action === 'unassign') {
      // Delete from both tables
      await supabase
        .from('agent_buildings')
        .delete()
        .eq('agent_id', agentId)
        .eq('building_id', buildingId)

      await supabase
        .from('agent_buildings')
        .delete()
        .eq('agent_id', agentId)
        .eq('building_id', buildingId)

      return NextResponse.json({ success: true, action: 'unassigned' })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  } catch (error) {
    console.error('Agent assignment error:', error)
    return NextResponse.json({ error: 'Failed to update assignment' }, { status: 500 })
  }
}