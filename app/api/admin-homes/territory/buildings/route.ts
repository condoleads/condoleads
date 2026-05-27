// app/api/admin-homes/territory/buildings/route.ts
// W-TERRITORY-MASTER P5.2: list buildings, optionally scoped to a geo or by search.
//
// GET /api/admin-homes/territory/buildings?scope=community&scope_id=...&q=...&limit=200&offset=0
//
// Modes:
//   - scope = 'area' | 'municipality' | 'community' | 'neighbourhood' (any one)
//   - q = address / building_name substring (trigram-friendly)
//   - Either scope OR q (or both) -- bare call without filters returns nothing
//     to avoid accidental 3,383-row pulls.
//
// Each building row includes its current active card (if any), so the UI
// can render "assigned to X" vs "unassigned" in one query.

import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { createServiceClient } from '@/lib/admin-homes/service-client'

const MAX_LIMIT = 1000
const DEFAULT_LIMIT = 200

export async function GET(request: NextRequest) {
  const user = await resolveAdminHomesUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const scope = url.searchParams.get('scope')
  const scopeId = url.searchParams.get('scope_id')
  const q = (url.searchParams.get('q') || '').trim()
  const requestedTenantId = url.searchParams.get('tenant_id')
  const limitRaw = url.searchParams.get('limit')
  const offsetRaw = url.searchParams.get('offset')
  const limit = Math.max(1, Math.min(MAX_LIMIT, parseInt(limitRaw || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT))
  const offset = Math.max(0, parseInt(offsetRaw || '0', 10) || 0)

  let tenantId: string | null = null
  if (user.isPlatformAdmin) {
    tenantId = requestedTenantId || user.tenantId
  } else {
    tenantId = user.tenantId
  }
  if (!tenantId) {
    return NextResponse.json({ error: 'No tenant scope' }, { status: 400 })
  }

  if (!scope && !q) {
    return NextResponse.json({
      data: [],
      error: 'Provide scope+scope_id, or q (search query), or both.'
    }, { status: 400 })
  }

  const validScopes = ['area', 'municipality', 'community', 'neighbourhood']
  if (scope && !validScopes.includes(scope)) {
    return NextResponse.json({ error: `Invalid scope '${scope}'` }, { status: 400 })
  }
  if (scope && !scopeId) {
    return NextResponse.json({ error: 'scope_id required when scope is provided' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Build the buildings query. We use the supabase query builder for the base.
  let baseQ = supabase
    .from('buildings')
    .select('id, slug, building_name, canonical_address, street_number, street_name, city_district, postal_code, total_units, year_built, community_id')
    .order('canonical_address', { ascending: true })
    .range(offset, offset + limit - 1)

  // Apply scope filter via community_id resolution.
  // Buildings link to community_id directly; for muni/area/neighbourhood,
  // we need to walk the geo hierarchy to find the community set.
  if (scope === 'community' && scopeId) {
    baseQ = baseQ.eq('community_id', scopeId)
  } else if (scope === 'municipality' && scopeId) {
    const { data: communities } = await supabase
      .from('communities')
      .select('id')
      .eq('municipality_id', scopeId)
    const communityIds = (communities || []).map(c => c.id)
    if (communityIds.length === 0) {
      return NextResponse.json({ data: [], total_estimate: 0 })
    }
    baseQ = baseQ.in('community_id', communityIds)
  } else if (scope === 'area' && scopeId) {
    const { data: munis } = await supabase
      .from('municipalities')
      .select('id')
      .eq('area_id', scopeId)
    const muniIds = (munis || []).map(m => m.id)
    if (muniIds.length === 0) {
      return NextResponse.json({ data: [], total_estimate: 0 })
    }
    const { data: communities } = await supabase
      .from('communities')
      .select('id')
      .in('municipality_id', muniIds)
    const communityIds = (communities || []).map(c => c.id)
    if (communityIds.length === 0) {
      return NextResponse.json({ data: [], total_estimate: 0 })
    }
    baseQ = baseQ.in('community_id', communityIds)
  } else if (scope === 'neighbourhood' && scopeId) {
    // Neighbourhoods link to communities via municipality_neighbourhoods or similar.
    // Defer this path until P7 reconciles neighbourhood data model.
    return NextResponse.json({
      error: 'Neighbourhood scope deferred to P7',
      data: []
    }, { status: 501 })
  }

  // Apply search filter (trigram on canonical_address + building_name).
  // We OR them by issuing two queries and merging -- supabase-js doesn't
  // support OR across columns cleanly. Simple approach: do canonical_address
  // primarily; if q matches building_name only, the operator can search differently.
  if (q && q.length >= 3) {
    const ilike = `%${q}%`
    baseQ = baseQ.or(`canonical_address.ilike.${ilike},building_name.ilike.${ilike}`)
  }

  const { data: buildings, error } = await baseQ
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = buildings || []
  if (rows.length === 0) {
    return NextResponse.json({ data: [] })
  }

  // Decorate with current active card (if any) for each building.
  const buildingIds = rows.map(b => b.id)
  const { data: cards } = await supabase
    .from('agent_geo_buildings')
    .select('id, building_id, agent_id, assigned_by, created_at, is_active, assigned_reason')
    .in('building_id', buildingIds)
    .eq('is_active', true)

  const cardMap = new Map<string, any>((cards || []).map(c => [c.building_id, c]))

  // Get agent names for the cards.
  const cardAgentIds = Array.from(new Set((cards || []).map(c => c.agent_id)))
  const { data: agents } = cardAgentIds.length
    ? await supabase.from('agents').select('id, full_name, tenant_id').in('id', cardAgentIds)
    : { data: [] }
  const agentMap = new Map<string, any>((agents || []).map(a => [a.id, a]))

  // Tenant filter on the cards: only show cards belonging to this tenant's agents.
  // Buildings themselves are platform-shared (no tenant_id).
  const decorated = rows.map(b => {
    const card = cardMap.get(b.id)
    const cardAgent = card ? agentMap.get(card.agent_id) : null
    const cardBelongsToTenant = cardAgent && cardAgent.tenant_id === tenantId
    return {
      id: b.id,
      slug: b.slug,
      building_name: b.building_name,
      canonical_address: b.canonical_address,
      street_number: b.street_number,
      street_name: b.street_name,
      city_district: b.city_district,
      postal_code: b.postal_code,
      total_units: b.total_units,
      year_built: b.year_built,
      community_id: b.community_id,
      // Card info -- only surface if it's our tenant's card.
      card: cardBelongsToTenant ? {
        id: card.id,
        agent_id: card.agent_id,
        agent_name: cardAgent.full_name,
        assigned_by: card.assigned_by,
        created_at: card.created_at,
        assigned_reason: card.assigned_reason,
      } : null
    }
  })

  return NextResponse.json({ data: decorated, scope, scope_id: scopeId, query: q || null })
}