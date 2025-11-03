import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getCurrentUser, isAdmin } from '@/lib/auth/helpers'

export async function POST(request, { params }) {
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

  // Delete all existing assignments for this agent
  await supabase
    .from('building_agents')
    .delete()
    .eq('agent_id', agentId)

  // Insert new assignments
  if (buildingIds.length > 0) {
    const assignments = buildingIds.map(function(buildingId) {
      return {
        agent_id: agentId,
        building_id: buildingId,
        assigned_by: user.id
      }
    })

    const { error } = await supabase
      .from('building_agents')
      .insert(assignments)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true, count: buildingIds.length })
}