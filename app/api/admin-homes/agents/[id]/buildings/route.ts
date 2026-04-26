// app/api/admin-homes/agents/[id]/buildings/route.ts
// Building assignments for WALLiam agents
// Uses agent_geo_buildings (NOT agent_buildings — System 1 table)
// Phase 3.4+: auth + tenant + role checks via shared api-auth helper.

import { NextRequest, NextResponse } from 'next/server'
import { requireAgentAccess } from '@/lib/admin-homes/api-auth'

// GET: fetch current building assignments for agent
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAgentAccess(params.id)
  if ('error' in auth) return auth.error

  const { data, error } = await auth.supabase
    .from('agent_geo_buildings')
    .select('building_id, buildings(id, building_name, canonical_address)')
    .eq('agent_id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ assignments: data || [] })
}

// POST: save building assignments
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAgentAccess(params.id, { requireWrite: true })
  if ('error' in auth) return auth.error

  const { buildingIds, assignedBy } = await request.json()

  // Delete existing assignments for this agent
  const { error: deleteError } = await auth.supabase
    .from('agent_geo_buildings')
    .delete()
    .eq('agent_id', params.id)
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  if (!buildingIds || buildingIds.length === 0) {
    return NextResponse.json({ success: true, count: 0 })
  }

  const rows = buildingIds.map((buildingId: string) => ({
    agent_id: params.id,
    building_id: buildingId,
    assigned_by: assignedBy || null,
  }))

  const { error: insertError } = await auth.supabase
    .from('agent_geo_buildings')
    .insert(rows)
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  return NextResponse.json({ success: true, count: rows.length })
}