// app/api/admin-homes/leads/feed/route.ts
// W-TERRITORY-MASTER P4: lead feed with hierarchy awareness.
//
// Returns three buckets of leads for a given agent:
//   - owned    : leads where lead.agent_id = agent_id
//   - descendants : leads owned by any agent in this agent's parent_id subtree
//   - unowned  : leads where lead.agent_id IS NULL (claimable)
//
// Tenant-scoped via the agent's tenant_id. Cross-tenant leak impossible:
// the WHERE clause requires lead.tenant_id = agent.tenant_id at every layer.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const tenantId = searchParams.get('tenant_id')
    const agentId = searchParams.get('agent_id')
    const bucket = searchParams.get('bucket') || 'all'
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500)

    if (!tenantId) {
      return NextResponse.json({ error: 'tenant_id required' }, { status: 400 })
    }
    if (!agentId) {
      return NextResponse.json({ error: 'agent_id required' }, { status: 400 })
    }
    if (!['all', 'mine', 'descendants', 'unowned'].includes(bucket)) {
      return NextResponse.json({ error: 'invalid bucket' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Verify the requesting agent belongs to the tenant
    const { data: agentRow } = await supabase
      .from('agents')
      .select('id, tenant_id')
      .eq('id', agentId)
      .single()
    if (!agentRow || agentRow.tenant_id !== tenantId) {
      return NextResponse.json({ error: 'agent not in tenant' }, { status: 403 })
    }

    // Resolve descendant agent IDs (recursive walk via parent_id)
    const descendantIds: string[] = []
    if (bucket === 'all' || bucket === 'descendants') {
      const { data: descendants } = await supabase.rpc('get_agent_descendants', {
        p_agent_id: agentId,
      })
      if (Array.isArray(descendants)) {
        for (const row of descendants) {
          if (row && typeof row === 'object' && 'id' in row && row.id !== agentId) {
            descendantIds.push(row.id as string)
          }
        }
      }
    }

    // Build the three queries
    const baseSelect = `
      id, contact_name, contact_email, contact_phone, source, geo_name,
      intent, status, status_axis, stage, urgency, message,
      created_at, agent_id, listing_id, building_id,
      area_id, municipality_id, community_id, neighbourhood_id,
      claimed_at, claimed_by_agent_id,
      agents:agents!leads_agent_id_fkey(id, full_name, email),
      listing:mls_listings!leads_listing_id_fkey(id, unparsed_address),
      building:buildings!leads_building_id_fkey(id, building_name, slug)
    `

    const result: {
      mine: any[]
      descendants: any[]
      unowned: any[]
      counts: { mine: number; descendants: number; unowned: number }
    } = {
      mine: [],
      descendants: [],
      unowned: [],
      counts: { mine: 0, descendants: 0, unowned: 0 },
    }

    // Bucket 1: mine
    if (bucket === 'all' || bucket === 'mine') {
      const { data, count } = await supabase
        .from('leads')
        .select(baseSelect, { count: 'exact' })
        .eq('tenant_id', tenantId)
        .eq('agent_id', agentId)
        .order('created_at', { ascending: false })
        .limit(limit)
      result.mine = data || []
      result.counts.mine = count || 0
    }

    // Bucket 2: descendants
    if ((bucket === 'all' || bucket === 'descendants') && descendantIds.length > 0) {
      const { data, count } = await supabase
        .from('leads')
        .select(baseSelect, { count: 'exact' })
        .eq('tenant_id', tenantId)
        .in('agent_id', descendantIds)
        .order('created_at', { ascending: false })
        .limit(limit)
      result.descendants = data || []
      result.counts.descendants = count || 0
    }

    // Bucket 3: unowned
    if (bucket === 'all' || bucket === 'unowned') {
      const { data, count } = await supabase
        .from('leads')
        .select(baseSelect, { count: 'exact' })
        .eq('tenant_id', tenantId)
        .is('agent_id', null)
        .order('created_at', { ascending: false })
        .limit(limit)
      result.unowned = data || []
      result.counts.unowned = count || 0
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[leads/feed] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}