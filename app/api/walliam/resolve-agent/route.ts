// app/api/walliam/resolve-agent/route.ts
// Resolves which agent to show/assign for any page context
// Uses priority chain: listing > building > community > municipality > area > user > null
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
      listing_id,
      building_id,
      community_id,
      municipality_id,
      area_id,
      user_id,
    } = await req.json()

    const supabase = createServiceClient()

    // Call the DB resolution function
    const { data, error } = await supabase.rpc('resolve_agent_for_context', {
      p_listing_id: listing_id || null,
      p_building_id: building_id || null,
      p_neighbourhood_id: null,
      p_community_id: community_id || null,
      p_municipality_id: municipality_id || null,
      p_area_id: area_id || null,
      p_user_id: user_id || null,
      p_tenant_id: tenantId,
    })

    if (error) {
      console.error('[resolve-agent] RPC error:', error)
      return NextResponse.json({ success: false, agent: null, error: error.message })
    }

    const agentId = data as string | null

    if (!agentId) {
      // No agent assigned — return WALLiam default
      return NextResponse.json({ success: true, agent: null, source: 'walliam_default' })
    }

    // Fetch agent details for display
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select(`
        id,
        full_name,
        email,
        cell_phone,
        title,
        brokerage_name,
        profile_photo_url,
        site_title,
        site_tagline,
        parent_id
      `)
      .eq('id', agentId)
      .eq('is_active', true)
      .single()

    if (agentError || !agent) {
      console.error('[resolve-agent] agent fetch error:', agentError)
      return NextResponse.json({ success: true, agent: null, source: 'walliam_default' })
    }

    // Determine assignment source for analytics
    let source = 'walliam_default'
    if (listing_id) {
      const { data: la } = await supabase
        .from('agent_listing_assignments')
        .select('id')
        .eq('listing_id', listing_id)
        .single()
      if (la) source = 'listing_assignment'
    }
    if (source === 'walliam_default' && building_id) {
      const { data: ba } = await supabase
        .from('agent_geo_buildings')
        .select('id')
        .eq('building_id', building_id)
        .single()
      if (ba) source = 'building_assignment'
    }
    if (source === 'walliam_default' && (community_id || municipality_id || area_id)) {
      source = 'geo_assignment'
    }
    if (source === 'walliam_default' && user_id) {
      source = 'user_relationship'
    }

    return NextResponse.json({ success: true, agent, source })

  } catch (err: any) {
    console.error('[resolve-agent] error:', err)
    return NextResponse.json({ success: false, agent: null, error: err.message }, { status: 500 })
  }
}