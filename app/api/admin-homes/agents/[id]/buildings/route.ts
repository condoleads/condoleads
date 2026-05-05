// app/api/admin-homes/agents/[id]/buildings/route.ts
// Building assignments for WALLiam agents
// Uses agent_geo_buildings (NOT agent_buildings — System 1 table)
// Phase 3.4+: auth + tenant + role checks via shared api-auth helper.

import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { createServiceClient } from '@/lib/admin-homes/service-client'
import { can, type DbRole } from '@/lib/admin-homes/permissions'

// GET: fetch current building assignments for agent
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await resolveAdminHomesUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createServiceClient()
  const { data: target } = await supabase
    .from('agents')
    .select('id, tenant_id, parent_id, site_type, role')
    .eq('id', params.id)
    .maybeSingle()
  if (!target || target.site_type !== 'comprehensive') {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }
  const decision = can(user.permissions, 'agent.read', {
    kind: 'agent',
    agentId: target.id,
    tenantId: target.tenant_id,
    parentId: target.parent_id,
    roleDb: (target.role || 'agent') as DbRole,
  })
  if (!decision.ok) return NextResponse.json({ error: decision.reason }, { status: decision.status })

  const { data, error } = await supabase
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
  const user = await resolveAdminHomesUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createServiceClient()
  const { data: target } = await supabase
    .from('agents')
    .select('id, tenant_id, parent_id, site_type, role')
    .eq('id', params.id)
    .maybeSingle()
  if (!target || target.site_type !== 'comprehensive') {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }
  const decision = can(user.permissions, 'agent.write', {
    kind: 'agent',
    agentId: target.id,
    tenantId: target.tenant_id,
    parentId: target.parent_id,
    roleDb: (target.role || 'agent') as DbRole,
  })
  if (!decision.ok) return NextResponse.json({ error: decision.reason }, { status: decision.status })

  const { buildingIds, assignedBy } = await request.json()

  // Delete existing assignments for this agent
  const { error: deleteError } = await supabase
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

  const { error: insertError } = await supabase
    .from('agent_geo_buildings')
    .insert(rows)
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  return NextResponse.json({ success: true, count: rows.length })
}