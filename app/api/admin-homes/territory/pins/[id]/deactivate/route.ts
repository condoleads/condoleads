// app/api/admin-homes/territory/pins/[id]/deactivate/route.ts
// W-TERRITORY-MASTER P5: Soft-delete a single-listing pin.
//
// POST /api/admin-homes/territory/pins/[id]/deactivate
// Body: { deactivated_by, reason? }
// Effect: UPDATE is_active=false, deactivated_at=now(), deactivated_by, pin_reason.
// Trigger writes 'pin_removed' audit row + reroll.

import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { createServiceClient } from '@/lib/admin-homes/service-client'

const MAX_PIN_REASON_CHARS = 500

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await resolveAdminHomesUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const pinId = params.id
  if (!pinId) {
    return NextResponse.json({ error: 'Pin id required' }, { status: 400 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { deactivated_by, reason } = body || {}
  if (!deactivated_by) {
    return NextResponse.json({ error: 'deactivated_by is required' }, { status: 400 })
  }
  if (reason !== undefined && reason !== null) {
    if (typeof reason !== 'string') {
      return NextResponse.json({ error: 'reason must be a string' }, { status: 400 })
    }
    if (reason.length > MAX_PIN_REASON_CHARS) {
      return NextResponse.json(
        { error: `reason exceeds ${MAX_PIN_REASON_CHARS} chars` },
        { status: 400 }
      )
    }
  }

  const supabase = createServiceClient()

  // Fetch the pin + its agent's tenant for tenant-scope validation.
  const { data: pin, error: pinErr } = await supabase
    .from('agent_listing_assignments')
    .select('id, agent_id, listing_id, is_active, pin_reason')
    .eq('id', pinId)
    .single()
  if (pinErr || !pin) {
    return NextResponse.json({ error: 'Pin not found' }, { status: 404 })
  }

  if (!pin.is_active) {
    return NextResponse.json(
      { error: 'Pin is already inactive', code: 'ALREADY_INACTIVE' },
      { status: 409 }
    )
  }

  // Tenant scope: pin's agent must belong to user's tenant (or platform admin).
  const { data: agent, error: agentErr } = await supabase
    .from('agents')
    .select('id, tenant_id')
    .eq('id', pin.agent_id)
    .single()
  if (agentErr || !agent) {
    return NextResponse.json({ error: 'Pin agent missing' }, { status: 500 })
  }
  if (!user.isPlatformAdmin && agent.tenant_id !== user.tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Validate deactivated_by is an agent in the same tenant.
  const { data: deactivator, error: deactErr } = await supabase
    .from('agents')
    .select('id, tenant_id')
    .eq('id', deactivated_by)
    .single()
  if (deactErr || !deactivator) {
    return NextResponse.json({ error: 'deactivated_by agent not found' }, { status: 404 })
  }
  if (deactivator.tenant_id !== agent.tenant_id) {
    return NextResponse.json({ error: 'deactivated_by agent is in a different tenant' }, { status: 403 })
  }

  // Update. Compose pin_reason: if a new reason was provided, append it;
  // otherwise preserve the existing reason. This keeps the original "why pinned"
  // visible in audit even after deactivation, alongside the "why deactivated."
  const updateRow: any = {
    is_active: false,
    deactivated_at: new Date().toISOString(),
    deactivated_by
  }
  if (reason) {
    const existing = pin.pin_reason || ''
    const combined = existing
      ? `${existing} | Deactivated: ${reason}`
      : `Deactivated: ${reason}`
    updateRow.pin_reason = combined.slice(0, MAX_PIN_REASON_CHARS)
  }

  const { data: updated, error: updateErr } = await supabase
    .from('agent_listing_assignments')
    .update(updateRow)
    .eq('id', pinId)
    .eq('is_active', true) // race guard
    .select('id, agent_id, listing_id, is_active, deactivated_at, deactivated_by, pin_reason')
    .single()

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }
  if (!updated) {
    return NextResponse.json(
      { error: 'Pin was deactivated by a concurrent request', code: 'RACE_LOST' },
      { status: 409 }
    )
  }

  return NextResponse.json({ data: updated })
}