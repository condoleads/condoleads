// app/api/admin-homes/territory/pins/bulk/route.ts
// W-TERRITORY-MASTER P5: Bulk-pin many listings to one agent.
//
// POST /api/admin-homes/territory/pins/bulk
// Body: { tenant_id?, agent_id, listing_ids: uuid[], pin_reason?, assigned_by }
// Returns: { created: [...], skipped: [{ listing_id, reason }] }
//
// Partial-success semantics: successful inserts are kept, skipped ones reported.
// Each INSERT fires the trigger (audit + reroll per listing).

import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { createServiceClient } from '@/lib/admin-homes/service-client'

const MAX_PIN_REASON_CHARS = 500
const MAX_BULK_LISTINGS = 500

export async function POST(request: NextRequest) {
  const user = await resolveAdminHomesUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { tenant_id: bodyTenantId, agent_id, listing_ids, pin_reason, assigned_by } = body || {}

  if (!agent_id || !assigned_by) {
    return NextResponse.json({ error: 'agent_id and assigned_by are required' }, { status: 400 })
  }
  if (!Array.isArray(listing_ids) || listing_ids.length === 0) {
    return NextResponse.json({ error: 'listing_ids must be a non-empty array' }, { status: 400 })
  }
  if (listing_ids.length > MAX_BULK_LISTINGS) {
    return NextResponse.json(
      { error: `listing_ids exceeds max of ${MAX_BULK_LISTINGS}` },
      { status: 400 }
    )
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

  // Validate target agent + assigner agents (both must be in this tenant).
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

  // Dedupe listing_ids preserving order.
  const seen = new Set<string>()
  const uniqueListingIds: string[] = []
  for (const id of listing_ids) {
    if (typeof id !== 'string') continue
    if (seen.has(id)) continue
    seen.add(id)
    uniqueListingIds.push(id)
  }

  // Pre-check: which listing_ids actually exist?
  const { data: existingListings, error: listErr } = await supabase
    .from('mls_listings')
    .select('id')
    .in('id', uniqueListingIds)
  if (listErr) {
    return NextResponse.json({ error: listErr.message }, { status: 500 })
  }
  const validListingIds = new Set((existingListings || []).map(l => l.id))

  // Per-row insert. The partial unique catches "already pinned" without
  // aborting the batch — we capture the 23505 per row.
  const created: any[] = []
  const skipped: { listing_id: string; reason: string }[] = []

  for (const listingId of uniqueListingIds) {
    if (!validListingIds.has(listingId)) {
      skipped.push({ listing_id: listingId, reason: 'listing_not_found' })
      continue
    }

    const { data: inserted, error: insErr } = await supabase
      .from('agent_listing_assignments')
      .insert({
        agent_id,
        listing_id: listingId,
        assigned_by,
        pin_reason: pin_reason || null
      })
      .select('id, agent_id, listing_id, created_at, pin_reason')
      .single()

    if (insErr) {
      if ((insErr as any).code === '23505') {
        skipped.push({ listing_id: listingId, reason: 'already_pinned' })
      } else {
        skipped.push({ listing_id: listingId, reason: `error: ${insErr.message}` })
      }
      continue
    }
    created.push(inserted)
  }

  return NextResponse.json({
    data: {
      created,
      skipped,
      total_requested: uniqueListingIds.length,
      total_created: created.length,
      total_skipped: skipped.length
    }
  })
}