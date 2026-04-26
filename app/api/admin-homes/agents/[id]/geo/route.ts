// app/api/admin-homes/agents/[id]/geo/route.ts
// Geo territory assignment for WALLiam agents
// Uses agent_property_access table — System 1 never touched
// Phase 3.4+: auth + tenant + role checks via shared api-auth helper.

import { NextRequest, NextResponse } from 'next/server'
import { requireAgentAccess } from '@/lib/admin-homes/api-auth'

// GET: fetch current geo assignments for agent
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAgentAccess(params.id)
  if ('error' in auth) return auth.error

  const { data, error } = await auth.supabase
    .from('agent_property_access')
    .select('*')
    .eq('agent_id', params.id)
    .eq('is_active', true)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ assignments: data || [] })
}

// POST: save geo assignments (replaces all existing for this agent)
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAgentAccess(params.id, { requireWrite: true })
  if ('error' in auth) return auth.error

  const { assignments } = await request.json()
  // assignments = array of:
  // { scope: 'area'|'municipality'|'community'|'neighbourhood',
  //   area_id, municipality_id, community_id, neighbourhood_id,
  //   condo_access, homes_access, buildings_access, buildings_mode }

  // Delete existing assignments for this agent
  const { error: deleteError } = await auth.supabase
    .from('agent_property_access')
    .delete()
    .eq('agent_id', params.id)
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  if (!assignments || assignments.length === 0) {
    return NextResponse.json({ success: true, count: 0 })
  }

  // Tenant id from the auth.target (already loaded by helper) — no extra DB read needed
  const tenantId = auth.target.tenant_id

  const rows = assignments.map((a: any) => ({
    agent_id: params.id,
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
    tenant_id: tenantId,
  }))

  const { error: insertError } = await auth.supabase
    .from('agent_property_access')
    .insert(rows)
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  return NextResponse.json({ success: true, count: rows.length })
}