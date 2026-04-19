// app/api/walliam/assign-user-agent/route.ts
// Assigns an agent to a user on registration
// Called when user registers — assigns based on page context at time of registration
// Once assigned, relationship is permanent unless Admin manually changes
// System 2 only — never touches System 1 tables

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  try {
    const tenantId = req.headers.get('x-tenant-id') || null
    const {
      user_id,
      listing_id,
      building_id,
      community_id,
      municipality_id,
      area_id,
    } = await req.json()

    if (!user_id) {
      return NextResponse.json({ success: false, error: 'user_id required' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Check if user already has an assigned agent — never overwrite
    const { data: existing } = await supabase
      .from('user_profiles')
      .select('assigned_agent_id')
      .eq('id', user_id)
      .select()
      .single()

    if (existing?.assigned_agent_id) {
      return NextResponse.json({
        success: true,
        agent_id: existing.assigned_agent_id,
        source: 'existing_relationship',
        message: 'User already has assigned agent',
      })
    }

    // Resolve agent using priority chain
    const { data: agentId, error: rpcError } = await supabase.rpc('resolve_agent_for_context', {
      p_listing_id: listing_id || null,
      p_building_id: building_id || null,
      p_community_id: community_id || null,
      p_municipality_id: municipality_id || null,
      p_area_id: area_id || null,
      p_user_id: null, // don't use user relationship — user has none yet
      p_tenant_id: tenantId,
    })

    if (rpcError) {
      console.error('[assign-user-agent] RPC error:', rpcError)
      return NextResponse.json({ success: false, error: rpcError.message }, { status: 500 })
    }

    const resolvedAgentId = agentId as string | null

    if (!resolvedAgentId) {
      // No agent found — leave unassigned (leads go to admin)
      return NextResponse.json({
        success: true,
        agent_id: null,
        source: 'walliam_default',
        message: 'No agent assigned — leads will go to admin',
      })
    }

    // Determine assignment source
    let source = 'geo_assignment'
    if (listing_id) {
      const { data: la } = await supabase
        .from('agent_listing_assignments')
        .select('id').eq('listing_id', listing_id).single()
      if (la) source = 'manual_property'
    } else if (building_id) {
      const { data: ba } = await supabase
        .from('agent_geo_buildings')
        .select('id').eq('building_id', building_id).single()
      if (ba) source = 'manual_building'
    }

    // Assign agent to user permanently
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({
        assigned_agent_id: resolvedAgentId,
        agent_assigned_at: new Date().toISOString(),
        agent_assignment_source: source,
      })
      .eq('id', user_id)

    if (updateError) {
      console.error('[assign-user-agent] update error:', updateError)
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 })
    }

    console.log('[assign-user-agent] assigned:', { user_id, agent_id: resolvedAgentId, source })

    return NextResponse.json({
      success: true,
      agent_id: resolvedAgentId,
      source,
    })

  } catch (err: any) {
    console.error('[assign-user-agent] error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}