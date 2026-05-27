// app/api/admin-homes/territory/buildings/assign/route.ts
// W-TERRITORY-MASTER P5.2: bulk-assign buildings to an agent.
//
// POST /api/admin-homes/territory/buildings/assign
// Body: { tenant_id?, agent_id, building_ids: uuid[], assigned_by, reason? }
// Returns: { data: { created: [], skipped: [{ building_id, reason }] } }
//
// Partial-success semantics matching P5 bulk pins:
//   - Each INSERT runs independently inside a small transaction per row.
//   - 23505 (already-active card on this building) -> skipped['already_assigned'].
//   - missing building -> skipped['building_not_found'].
//   - other errors -> skipped['error: <message>'].
//
// Trigger fires per insert: writes 'building_assigned' audit + reroll.

import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { createServiceClient } from '@/lib/admin-homes/service-client'

const MAX_BULK = 1000
const MAX_REASON = 500

export async function POST(request: NextRequest) {
  const user = await resolveAdminHomesUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { tenant_id: bodyTenantId, agent_id, building_ids, reason, assigned_by } = body || {}

  if (!agent_id || !assigned_by) {
    return NextResponse.json({ error: 'agent_id and assigned_by required' }, { status: 400 })
  }
  if (!Array.isArray(building_ids) || building_ids.length === 0) {
    return NextResponse.json({ error: 'building_ids must be a non-empty array' }, { status: 400 })
  }
  if (building_ids.length > MAX_BULK) {
    return NextResponse.json({ error: `building_ids exceeds max of ${MAX_BULK}` }, { status: 400 })
  }
  if (reason !== undefined && reason !== null) {
    if (typeof reason !== 'string') {
      return NextResponse.json({ error: 'reason must be a string' }, { status: 400 })
    }
    if (reason.length > MAX_REASON) {
      return NextResponse.json({ error: `reason exceeds ${MAX_REASON} chars` }, { status: 400 })
    }
  }

  let tenantId: string | null = null
  if (user.isPlatformAdmin) {
    tenantId = bodyTenantId || user.tenantId
  } else {
    tenantId = user.tenantId
  }
  if (!tenantId) {
    return NextResponse.json({ error: 'No tenant scope' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Validate target agent + assigner agents.
  const { data: agent, error: agentErr } = await supabase
    .from('agents')
    .select('id, tenant_id')
    .eq('id', agent_id)
    .single()
  if (agentErr || !agent) {
    return NextResponse.json({ error: 'Target agent not found' }, { status: 404 })
  }
  if (agent.tenant_id !== tenantId) {
    return NextResponse.json({ error: 'Target agent not in this tenant' }, { status: 403 })
  }

  const { data: assigner, error: assignerErr } = await supabase
    .from('agents')
    .select('id, tenant_id')
    .eq('id', assigned_by)
    .single()
  if (assignerErr || !assigner) {
    return NextResponse.json({ error: 'assigned_by agent not found' }, { status: 404 })
  }
  if (assigner.tenant_id !== tenantId) {
    return NextResponse.json({ error: 'assigned_by agent not in this tenant' }, { status: 403 })
  }

  // Dedupe input.
  const seen = new Set<string>()
  const uniqueBuildingIds: string[] = []
  for (const id of building_ids) {
    if (typeof id !== 'string' || seen.has(id)) continue
    seen.add(id)
    uniqueBuildingIds.push(id)
  }

  // Pre-check: which buildings exist?
  const { data: existingBuildings, error: bErr } = await supabase
    .from('buildings')
    .select('id')
    .in('id', uniqueBuildingIds)
  if (bErr) {
    return NextResponse.json({ error: bErr.message }, { status: 500 })
  }
  const validBuildingIds = new Set((existingBuildings || []).map(b => b.id))

  // Per-row insert. The trigger writes audit + reroll on each row.
  const created: any[] = []
  const skipped: { building_id: string; reason: string }[] = []

  for (const bId of uniqueBuildingIds) {
    if (!validBuildingIds.has(bId)) {
      skipped.push({ building_id: bId, reason: 'building_not_found' })
      continue
    }

    const { data: inserted, error: insErr } = await supabase
      .from('agent_geo_buildings')
      .insert({
        agent_id,
        building_id: bId,
        assigned_by,
        assigned_reason: reason || null
      })
      .select('id, agent_id, building_id, created_at, assigned_reason')
      .single()

    if (insErr) {
      if ((insErr as any).code === '23505') {
        skipped.push({ building_id: bId, reason: 'already_assigned' })
      } else {
        skipped.push({ building_id: bId, reason: `error: ${insErr.message}` })
      }
      continue
    }
    created.push(inserted)
  }

  return NextResponse.json({
    data: {
      created,
      skipped,
      total_requested: uniqueBuildingIds.length,
      total_created: created.length,
      total_skipped: skipped.length
    }
  })
}