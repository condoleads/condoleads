// app/api/admin-homes/agents/[id]/listings/route.ts
// Single listing assignments for WALLiam agents (Priority 1 — KING)
// Uses agent_listing_assignments table

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET: fetch current listing assignments for agent
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServiceClient()
  const agentId = params.id

  const { data, error } = await supabase
    .from('agent_listing_assignments')
    .select('listing_id, mls_listings(id, listing_key, unparsed_address, list_price, standard_status)')
    .eq('agent_id', agentId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ assignments: data || [] })
}

// POST: add a single listing assignment
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServiceClient()
  const agentId = params.id
  const { listingId, assignedBy } = await request.json()

  if (!listingId) return NextResponse.json({ error: 'listingId required' }, { status: 400 })

  // Upsert — listing can only have one agent (UNIQUE constraint)
  const { error } = await supabase
    .from('agent_listing_assignments')
    .upsert({
      agent_id: agentId,
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
  const supabase = createServiceClient()
  const agentId = params.id
  const { listingId } = await request.json()

  const { error } = await supabase
    .from('agent_listing_assignments')
    .delete()
    .eq('agent_id', agentId)
    .eq('listing_id', listingId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}