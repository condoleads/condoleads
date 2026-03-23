// app/api/admin-homes/agents/[id]/buildings/route.ts
// Building assignments for WALLiam agents
// Uses agent_geo_buildings (NOT agent_buildings — System 1 table)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET: fetch current building assignments for agent
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServiceClient()
  const agentId = params.id

  const { data, error } = await supabase
    .from('agent_geo_buildings')
    .select('building_id, buildings(id, building_name, canonical_address)')
    .eq('agent_id', agentId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ assignments: data || [] })
}

// POST: save building assignments
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServiceClient()
  const agentId = params.id
  const { buildingIds, assignedBy } = await request.json()

  // Delete existing assignments for this agent
  const { error: deleteError } = await supabase
    .from('agent_geo_buildings')
    .delete()
    .eq('agent_id', agentId)

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  if (!buildingIds || buildingIds.length === 0) {
    return NextResponse.json({ success: true, count: 0 })
  }

  const rows = buildingIds.map((buildingId: string) => ({
    agent_id: agentId,
    building_id: buildingId,
    assigned_by: assignedBy || null,
  }))

  const { error: insertError } = await supabase
    .from('agent_geo_buildings')
    .insert(rows)

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  return NextResponse.json({ success: true, count: rows.length })
}