// app/api/admin-homes/agents/[id]/listings/route.ts
// Single listing assignments for WALLiam agents (Priority 1 — KING)
// Uses agent_listing_assignments table
// Phase 3.4+: auth + tenant + role checks via shared api-auth helper.

import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { createServiceClient } from '@/lib/admin-homes/service-client'
import { can, type DbRole } from '@/lib/admin-homes/permissions'

// GET: fetch current listing assignments for agent
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
    .from('agent_listing_assignments')
    .select('listing_id, mls_listings(id, listing_key, unparsed_address, list_price, standard_status)')
    .eq('agent_id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ assignments: data || [] })
}

// POST: add a single listing assignment
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

  const { listingId, assignedBy } = await request.json()
  if (!listingId) return NextResponse.json({ error: 'listingId required' }, { status: 400 })

  // Upsert — listing can only have one agent (UNIQUE constraint)
  const { error } = await supabase
    .from('agent_listing_assignments')
    .upsert({
      agent_id: params.id,
      listing_id: listingId,
      assigned_by: assignedBy || null,
    }, { onConflict: 'listing_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// DELETE: remove a listing assignment
export async function DELETE(
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

  const { listingId } = await request.json()
  const { error } = await supabase
    .from('agent_listing_assignments')
    .delete()
    .eq('agent_id', params.id)
    .eq('listing_id', listingId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}