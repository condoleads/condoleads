// app/api/admin-homes/territory/buildings/[id]/deactivate/route.ts
// W-TERRITORY-MASTER P5.2: soft-delete a building card.
//
// POST /api/admin-homes/territory/buildings/[id]/deactivate
// Body: { deactivated_by, reason? }
// Effect: UPDATE is_active=false, deactivated_at=now(), deactivated_by, assigned_reason.
// Trigger writes 'building_unassigned' audit row + reroll for every listing in the building.

import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { createServiceClient } from '@/lib/admin-homes/service-client'

const MAX_REASON = 500

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await resolveAdminHomesUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cardId = params.id
  if (!cardId) {
    return NextResponse.json({ error: 'card id required' }, { status: 400 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { deactivated_by, reason } = body || {}
  if (!deactivated_by) {
    return NextResponse.json({ error: 'deactivated_by required' }, { status: 400 })
  }
  if (reason !== undefined && reason !== null) {
    if (typeof reason !== 'string') {
      return NextResponse.json({ error: 'reason must be a string' }, { status: 400 })
    }
    if (reason.length > MAX_REASON) {
      return NextResponse.json({ error: `reason exceeds ${MAX_REASON} chars` }, { status: 400 })
    }
  }

  const supabase = createServiceClient()

  const { data: card, error: cardErr } = await supabase
    .from('agent_geo_buildings')
    .select('id, agent_id, building_id, is_active, assigned_reason')
    .eq('id', cardId)
    .single()
  if (cardErr || !card) {
    return NextResponse.json({ error: 'Card not found' }, { status: 404 })
  }
  if (!card.is_active) {
    return NextResponse.json(
      { error: 'Card is already inactive', code: 'ALREADY_INACTIVE' },
      { status: 409 }
    )
  }

  const { data: agent, error: agentErr } = await supabase
    .from('agents')
    .select('id, tenant_id')
    .eq('id', card.agent_id)
    .single()
  if (agentErr || !agent) {
    return NextResponse.json({ error: 'Card agent missing' }, { status: 500 })
  }
  if (!user.isPlatformAdmin && agent.tenant_id !== user.tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: deactivator, error: deactErr } = await supabase
    .from('agents')
    .select('id, tenant_id')
    .eq('id', deactivated_by)
    .single()
  if (deactErr || !deactivator) {
    return NextResponse.json({ error: 'deactivated_by agent not found' }, { status: 404 })
  }
  if (deactivator.tenant_id !== agent.tenant_id) {
    return NextResponse.json({ error: 'deactivated_by in different tenant' }, { status: 403 })
  }

  const updateRow: any = {
    is_active: false,
    deactivated_at: new Date().toISOString(),
    deactivated_by
  }
  if (reason) {
    const existing = card.assigned_reason || ''
    const combined = existing
      ? `${existing} | Deactivated: ${reason}`
      : `Deactivated: ${reason}`
    updateRow.assigned_reason = combined.slice(0, MAX_REASON)
  }

  const { data: updated, error: updateErr } = await supabase
    .from('agent_geo_buildings')
    .update(updateRow)
    .eq('id', cardId)
    .eq('is_active', true)
    .select('id, agent_id, building_id, is_active, deactivated_at, deactivated_by, assigned_reason')
    .single()

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }
  if (!updated) {
    return NextResponse.json(
      { error: 'Card was deactivated by a concurrent request', code: 'RACE_LOST' },
      { status: 409 }
    )
  }

  return NextResponse.json({ data: updated })
}