// app/api/admin-homes/agents/[id]/listings/route.ts
// Single listing assignments for WALLiam agents (Priority 1 — KING)
// Uses agent_listing_assignments table
// Phase 3.4+: auth + tenant + role checks via shared api-auth helper.

import { NextRequest, NextResponse } from 'next/server'
import { requireAgentAccess } from '@/lib/admin-homes/api-auth'

// GET: fetch current listing assignments for agent
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAgentAccess(params.id)
  if ('error' in auth) return auth.error

  const { data, error } = await auth.supabase
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
  const auth = await requireAgentAccess(params.id, { requireWrite: true })
  if ('error' in auth) return auth.error

  const { listingId, assignedBy } = await request.json()
  if (!listingId) return NextResponse.json({ error: 'listingId required' }, { status: 400 })

  // Upsert — listing can only have one agent (UNIQUE constraint)
  const { error } = await auth.supabase
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
  const auth = await requireAgentAccess(params.id, { requireWrite: true })
  if ('error' in auth) return auth.error

  const { listingId } = await request.json()
  const { error } = await auth.supabase
    .from('agent_listing_assignments')
    .delete()
    .eq('agent_id', params.id)
    .eq('listing_id', listingId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}