// app/api/admin-homes/agents/[id]/geo/route.ts
// Geo territory assignment for WALLiam agents
// Uses agent_property_access table — System 1 never touched

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET: fetch current geo assignments for agent
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServiceClient()
  const agentId = params.id

  const { data, error } = await supabase
    .from('agent_property_access')
    .select('*')
    .eq('agent_id', agentId)
    .eq('is_active', true)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ assignments: data || [] })
}

// POST: save geo assignments (replaces all existing for this agent)
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServiceClient()
  const agentId = params.id

  const { assignments } = await request.json()
  // assignments = array of:
  // { scope: 'area'|'municipality'|'community'|'neighbourhood',
  //   area_id, municipality_id, community_id, neighbourhood_id,
  //   condo_access, homes_access, buildings_access, buildings_mode }

  // Delete existing assignments for this agent (WALLiam only — source='walliam')
  const { error: deleteError } = await supabase
    .from('agent_property_access')
    .delete()
    .eq('agent_id', agentId)

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  if (!assignments || assignments.length === 0) {
    return NextResponse.json({ success: true, count: 0 })
  }

  const rows = assignments.map((a: any) => ({
    agent_id: agentId,
    scope: a.scope,
    area_id: a.area_id || null,
    municipality_id: a.municipality_id || null,
    community_id: a.community_id || null,
    neighbourhood_id: a.neighbourhood_id || null,
    condo_access: a.condo_access ?? true,
    homes_access: a.homes_access ?? true,
    buildings_access: a.buildings_access ?? true,
    buildings_mode: a.buildings_mode || 'all',
    is_active: true,
  }))

  const { error: insertError } = await supabase
    .from('agent_property_access')
    .insert(rows)

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  return NextResponse.json({ success: true, count: rows.length })
}