// app/api/admin-homes/territory/pins/route.ts
// W-TERRITORY-MASTER P5: List + create single-listing pins.
//
// GET  /api/admin-homes/territory/pins?tenant_id=...&agent_id=...&is_active=true&limit=50
//      Lists pins for a tenant, decorated with agent and listing info.
//
// POST /api/admin-homes/territory/pins
//      Body: { tenant_id, agent_id, listing_id, pin_reason?, assigned_by }
//      Creates an active pin. Trigger writes audit + reroll.

import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { createServiceClient } from '@/lib/admin-homes/service-client'

const MAX_PIN_REASON_CHARS = 500

export async function GET(request: NextRequest) {
  const user = await resolveAdminHomesUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const requestedTenantId = url.searchParams.get('tenant_id')
  const agentIdFilter = url.searchParams.get('agent_id')
  const isActiveParam = url.searchParams.get('is_active')
  const limitRaw = url.searchParams.get('limit')
  const limit = Math.max(1, Math.min(500, parseInt(limitRaw || '50', 10) || 50))

  let tenantId: string | null = null
  if (user.isPlatformAdmin) {
    tenantId = requestedTenantId || user.tenantId
  } else {
    tenantId = user.tenantId
  }
  if (!tenantId) {
    return NextResponse.json({ error: 'No tenant scope. Pass ?tenant_id=...' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Build the pins query. We scope by tenant via the joined agent's tenant_id.
  // Pin → agent (must share tenant) → listing.
  let pinsQ = supabase
    .from('agent_listing_assignments')
    .select(
      'id, agent_id, listing_id, assigned_by, created_at, is_active, deactivated_at, deactivated_by, pin_reason'
    )
    .order('created_at', { ascending: false })
    .limit(limit)

  if (isActiveParam !== null) {
    if (isActiveParam === 'true') pinsQ = pinsQ.eq('is_active', true)
    else if (isActiveParam === 'false') pinsQ = pinsQ.eq('is_active', false)
    // any other value → no filter, return both
  } else {
    // default: only active
    pinsQ = pinsQ.eq('is_active', true)
  }

  if (agentIdFilter) pinsQ = pinsQ.eq('agent_id', agentIdFilter)

  const { data: pinsRaw, error: pinsErr } = await pinsQ
  if (pinsErr) {
    return NextResponse.json({ error: pinsErr.message }, { status: 500 })
  }

  const pins = pinsRaw || []
  if (pins.length === 0) {
    return NextResponse.json({ data: [] })
  }

  // Decorate: resolve agent tenant scope + agent names + listing info.
  const agentIds = Array.from(
    new Set([
      ...pins.map(p => p.agent_id),
      ...pins.map(p => p.assigned_by).filter(Boolean) as string[],
      ...pins.map(p => p.deactivated_by).filter(Boolean) as string[]
    ])
  )

  const { data: agents } = await supabase
    .from('agents')
    .select('id, full_name, tenant_id, is_active, is_selling')
    .in('id', agentIds)

  const agentMap = new Map<string, any>((agents || []).map(a => [a.id, a]))

  // Tenant filter: only return pins whose primary agent belongs to this tenant.
  const tenantScopedPins = pins.filter(p => {
    const agent = agentMap.get(p.agent_id)
    return agent && agent.tenant_id === tenantId
  })

  const listingIds = Array.from(new Set(tenantScopedPins.map(p => p.listing_id)))
  const { data: listings } = await supabase
    .from('mls_listings')
    .select('id, listing_key, unparsed_address, property_type, list_price, standard_status')
    .in('id', listingIds)

  const listingMap = new Map<string, any>((listings || []).map(l => [l.id, l]))

  const decorated = tenantScopedPins.map(p => {
    const agent = agentMap.get(p.agent_id)
    const assignedBy = p.assigned_by ? agentMap.get(p.assigned_by) : null
    const deactivatedBy = p.deactivated_by ? agentMap.get(p.deactivated_by) : null
    const listing = listingMap.get(p.listing_id)
    return {
      id: p.id,
      agent_id: p.agent_id,
      agent_name: agent?.full_name ?? null,
      listing_id: p.listing_id,
      listing_mls_number: listing?.listing_key ?? null,
      listing_address: listing?.unparsed_address ?? null,
      listing_property_type: listing?.property_type ?? null,
      listing_list_price: listing?.list_price ?? null,
      listing_status: listing?.standard_status ?? null,
      is_active: p.is_active,
      pin_reason: p.pin_reason,
      created_at: p.created_at,
      assigned_by: p.assigned_by,
      assigned_by_name: assignedBy?.full_name ?? null,
      deactivated_at: p.deactivated_at,
      deactivated_by: p.deactivated_by,
      deactivated_by_name: deactivatedBy?.full_name ?? null
    }
  })

  return NextResponse.json({ data: decorated })
}

export async function POST(request: NextRequest) {
  const user = await resolveAdminHomesUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { tenant_id: bodyTenantId, agent_id, listing_id, pin_reason, assigned_by } = body || {}

  if (!agent_id || !listing_id) {
    return NextResponse.json({ error: 'agent_id and listing_id are required' }, { status: 400 })
  }
  if (!assigned_by) {
    return NextResponse.json({ error: 'assigned_by is required' }, { status: 400 })
  }
  if (pin_reason !== undefined && pin_reason !== null) {
    if (typeof pin_reason !== 'string') {
      return NextResponse.json({ error: 'pin_reason must be a string' }, { status: 400 })
    }
    if (pin_reason.length > MAX_PIN_REASON_CHARS) {
      return NextResponse.json(
        { error: `pin_reason exceeds ${MAX_PIN_REASON_CHARS} chars` },
        { status: 400 }
      )
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

  // Validate: agent belongs to this tenant.
  const { data: agent, error: agentErr } = await supabase
    .from('agents')
    .select('id, tenant_id, is_active, is_selling')
    .eq('id', agent_id)
    .single()
  if (agentErr || !agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }
  if (agent.tenant_id !== tenantId) {
    return NextResponse.json({ error: 'Agent does not belong to this tenant' }, { status: 403 })
  }

  // Validate: listing exists.
  const { data: listing, error: listingErr } = await supabase
    .from('mls_listings')
    .select('id')
    .eq('id', listing_id)
    .single()
  if (listingErr || !listing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
  }

  // Validate: assigned_by is a real agent (the API is called by the operator,
  // who supplies their own agent_id as assigned_by).
  const { data: assigner, error: assignerErr } = await supabase
    .from('agents')
    .select('id, tenant_id')
    .eq('id', assigned_by)
    .single()
  if (assignerErr || !assigner) {
    return NextResponse.json({ error: 'assigned_by agent not found' }, { status: 404 })
  }
  if (assigner.tenant_id !== tenantId) {
    return NextResponse.json({ error: 'assigned_by agent is not in this tenant' }, { status: 403 })
  }

  // Insert. Trigger writes audit + reroll.
  const { data: inserted, error: insertErr } = await supabase
    .from('agent_listing_assignments')
    .insert({
      agent_id,
      listing_id,
      assigned_by,
      pin_reason: pin_reason || null
    })
    .select('id, agent_id, listing_id, assigned_by, created_at, is_active, pin_reason')
    .single()

  if (insertErr) {
    // Postgres 23505 = unique_violation (partial unique uq_ala_listing_active)
    if ((insertErr as any).code === '23505') {
      return NextResponse.json(
        { error: 'Listing already has an active pin', code: 'ALREADY_PINNED' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  return NextResponse.json({ data: inserted }, { status: 201 })
}