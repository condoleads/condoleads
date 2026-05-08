// app/api/admin-homes/territory/coverage/route.ts
// T4a-2: GET active APA rows for a tenant, decorated with agent + geo names.
// Per-tenant scoping. Platform admin can override via ?tenant_id=...

import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { createServiceClient } from '@/lib/admin-homes/service-client'

export async function GET(request: NextRequest) {
  const user = await resolveAdminHomesUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const requestedTenantId = url.searchParams.get('tenant_id')

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

  const { data: apaRows, error: apaErr } = await supabase
    .from('agent_property_access')
    .select('id, agent_id, scope, area_id, municipality_id, community_id, neighbourhood_id, is_primary, condo_access, homes_access, buildings_access, buildings_mode, created_at, updated_at')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
  if (apaErr) return NextResponse.json({ error: apaErr.message }, { status: 500 })

  const rows = apaRows || []

  const agentIds = Array.from(new Set(rows.map(r => r.agent_id).filter(Boolean))) as string[]
  const areaIds = Array.from(new Set(rows.filter(r => r.scope === 'area').map(r => r.area_id).filter(Boolean))) as string[]
  const muniIds = Array.from(new Set(rows.filter(r => r.scope === 'municipality').map(r => r.municipality_id).filter(Boolean))) as string[]
  const commIds = Array.from(new Set(rows.filter(r => r.scope === 'community').map(r => r.community_id).filter(Boolean))) as string[]
  const nbrIds = Array.from(new Set(rows.filter(r => r.scope === 'neighbourhood').map(r => r.neighbourhood_id).filter(Boolean))) as string[]

  const [agentsRes, areasRes, munisRes, commsRes, nbrsRes] = await Promise.all([
    agentIds.length ? supabase.from('agents').select('id, name').in('id', agentIds) : Promise.resolve({ data: [] as any[], error: null }),
    areaIds.length  ? supabase.from('treb_areas').select('id, name').in('id', areaIds) : Promise.resolve({ data: [] as any[], error: null }),
    muniIds.length  ? supabase.from('municipalities').select('id, name').in('id', muniIds) : Promise.resolve({ data: [] as any[], error: null }),
    commIds.length  ? supabase.from('communities').select('id, name, municipality_id').in('id', commIds) : Promise.resolve({ data: [] as any[], error: null }),
    nbrIds.length   ? supabase.from('neighbourhoods').select('id, name, community_id').in('id', nbrIds) : Promise.resolve({ data: [] as any[], error: null }),
  ])

  const agentMap = new Map<string, any>((agentsRes.data || []).map((a: any) => [a.id, a]))
  const areaMap  = new Map<string, any>((areasRes.data  || []).map((a: any) => [a.id, a]))
  const muniMap  = new Map<string, any>((munisRes.data  || []).map((m: any) => [m.id, m]))
  const commMap  = new Map<string, any>((commsRes.data  || []).map((c: any) => [c.id, c]))
  const nbrMap   = new Map<string, any>((nbrsRes.data   || []).map((n: any) => [n.id, n]))

  const decorated = rows.map(r => {
    const agent = r.agent_id ? agentMap.get(r.agent_id) : null
    let geoName: string | null = null
    let geoId: string | null = null
    if (r.scope === 'area' && r.area_id) {
      geoId = r.area_id
      geoName = areaMap.get(r.area_id)?.name ?? null
    } else if (r.scope === 'municipality' && r.municipality_id) {
      geoId = r.municipality_id
      geoName = muniMap.get(r.municipality_id)?.name ?? null
    } else if (r.scope === 'community' && r.community_id) {
      geoId = r.community_id
      geoName = commMap.get(r.community_id)?.name ?? null
    } else if (r.scope === 'neighbourhood' && r.neighbourhood_id) {
      geoId = r.neighbourhood_id
      geoName = nbrMap.get(r.neighbourhood_id)?.name ?? null
    }
    return {
      id: r.id,
      agent_id: r.agent_id,
      agent_name: agent?.name ?? null,
      scope: r.scope,
      geo_id: geoId,
      geo_name: geoName,
      is_primary: r.is_primary,
      condo_access: r.condo_access,
      homes_access: r.homes_access,
      buildings_access: r.buildings_access,
      buildings_mode: r.buildings_mode,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }
  })

  const stats = {
    total: decorated.length,
    by_scope: {
      area: decorated.filter(r => r.scope === 'area').length,
      municipality: decorated.filter(r => r.scope === 'municipality').length,
      community: decorated.filter(r => r.scope === 'community').length,
      neighbourhood: decorated.filter(r => r.scope === 'neighbourhood').length,
    },
    primary_count: decorated.filter(r => r.is_primary).length,
    distinct_agents: new Set(decorated.map(r => r.agent_id).filter(Boolean)).size,
  }

  return NextResponse.json({ tenant_id: tenantId, rows: decorated, stats })
}
