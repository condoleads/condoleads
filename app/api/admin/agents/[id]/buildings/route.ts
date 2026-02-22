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
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Delete existing assignments
  await supabase
    .from('agent_buildings')
    .delete()
    .eq('agent_id', agentId)

  // Insert new assignments
  if (buildingIds.length > 0) {
    const assignmentData = buildingIds.map(function(buildingId: string) {
      return {
        agent_id: agentId,
        building_id: buildingId,
        is_featured: false
      }
    })

    const { error } = await supabase
      .from('agent_buildings')
      .insert(assignmentData)

    if (error) {
      console.error('Error inserting to agent_buildings:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true, count: buildingIds.length })
}
