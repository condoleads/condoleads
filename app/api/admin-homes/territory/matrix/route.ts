// app/api/admin-homes/territory/matrix/route.ts
//
// T4c-2 Phase B -- GET territory matrix data for the caller's authority subtree.
//
// Pre-fetches all inputs for buildTerritoryMatrix and returns the matrix payload.
//
// MULTITENANT (Rule Zero #1)
//   - Every query filters by tenant_id.
//   - Platform admin can override target tenant via ?tenant_id=.
//   - Per-row can() decisions are computed against pre-fetched agent records;
//     non-comprehensive agents (System 1) are excluded by site_type filter.
//
// AUTH PATTERN
//   Mirrors coverage/route.ts: resolveAdminHomesUser -> tenant scoping ->
//   service client read. Per-agent can() gating mirrors bulk-assign/route.ts.
//
// Query params:
//   - scope:        'area' | 'municipality' | 'community' | 'neighbourhood'
//                   (default 'community')
//   - tenant_id:    optional; platform admin only override
//   - include_self: 'true' | 'false' (default 'true') -- whether the caller's
//                   own agent row appears as a matrix row
//
// Response:
//   200 { tenant_id, scope, matrix: TerritoryMatrix }
//   400 { error } -- bad scope or missing tenant scope
//   401 { error: 'Unauthorized' }
//   500 { error } -- DB error surfaced
//
// COLUMN POPULATION POLICY (v1)
//   Columns = "tenant footprint" at the chosen scope: geos where at least one
//   tenant agent currently has an APA row at that exact scope. This keeps the
//   matrix from rendering hundreds of unused columns. Tradeoff: managers can't
//   add a brand-new geo from the matrix UI in v1; they seed it via the per-agent
//   geo page first. A ?geo_ids= filter override is a future extension if the UX
//   needs it.

import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { createServiceClient } from '@/lib/admin-homes/service-client'
import { can, type DbRole } from '@/lib/admin-homes/permissions'
import {
  buildTerritoryMatrix,
  type MatrixScope,
  type TerritoryMatrix,
} from '@/lib/admin-homes/territory-matrix'
import type { ApaRow } from '@/lib/admin-homes/apa-diff'

const VALID_SCOPES: ReadonlyArray<MatrixScope> = ['area', 'municipality', 'community', 'neighbourhood']

interface AgentRecord {
  id: string
  name: string
  role: DbRole | null
  parent_id: string | null
  tenant_id: string
  site_type: string
}

function emptyMatrix(scope: MatrixScope): TerritoryMatrix {
  return { scope, rows: [], columns: [], cells: {}, preservedRowsByAgent: {} }
}

export async function GET(request: NextRequest) {
  // ---- 1. Auth ----
  const user = await resolveAdminHomesUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ---- 2. Validate query params ----
  const url = new URL(request.url)
  const requestedTenantId = url.searchParams.get('tenant_id')
  const rawScope = url.searchParams.get('scope') || 'community'
  const includeSelf = (url.searchParams.get('include_self') ?? 'true') !== 'false'

  if (!(VALID_SCOPES as ReadonlyArray<string>).includes(rawScope)) {
    return NextResponse.json(
      { error: 'Invalid scope. Must be one of: area, municipality, community, neighbourhood' },
      { status: 400 }
    )
  }
  const scope = rawScope as MatrixScope

  // ---- 3. Resolve tenant scope ----
  let tenantId: string | null = null
  if (user.isPlatformAdmin) {
    tenantId = requestedTenantId || user.tenantId
  } else {
    tenantId = user.tenantId
  }
  if (!tenantId) {
    return NextResponse.json({ error: 'No tenant scope. Pass ?tenant_id=...' }, { status: 400 })
  }

  // ---- 4. Determine row source ----
  // Tenant admin / platform tier => all comprehensive agents in tenant.
  // Manager / area_manager / agent => caller's authority subtree (+ self if requested).
  const roleDb = user.permissions.roleDb
  const isAdminTier =
    roleDb === 'tenant_admin' ||
    roleDb === 'admin' ||
    user.permissions.platformTier !== null

  const authorityIds = new Set<string>(user.permissions.managedAgentIds)
  if (includeSelf && user.permissions.agentId) {
    authorityIds.add(user.permissions.agentId)
  }

  // Non-admin caller with no authority + no self => empty matrix.
  if (!isAdminTier && authorityIds.size === 0) {
    return NextResponse.json({ tenant_id: tenantId, scope, matrix: emptyMatrix(scope) })
  }

  const supabase = createServiceClient()

  // ---- 5. Fetch agents (tenant-scoped, comprehensive only) ----
  let agentsQ = supabase
    .from('agents')
    .select('id, name, role, parent_id, tenant_id, site_type')
    .eq('tenant_id', tenantId)
    .eq('site_type', 'comprehensive')

  if (!isAdminTier) {
    agentsQ = agentsQ.in('id', Array.from(authorityIds))
  }

  const { data: agentsData, error: agentsErr } = await agentsQ
  if (agentsErr) return NextResponse.json({ error: agentsErr.message }, { status: 500 })

  const agents: AgentRecord[] = (agentsData || []) as AgentRecord[]
  if (agents.length === 0) {
    return NextResponse.json({ tenant_id: tenantId, scope, matrix: emptyMatrix(scope) })
  }

  const agentIds = agents.map(a => a.id)

  // ---- 6. Compute per-agent can('agent.write') decisions ----
  const writeDecisions: Record<string, boolean> = {}
  for (const a of agents) {
    const decision = can(user.permissions, 'agent.write', {
      kind: 'agent',
      agentId: a.id,
      tenantId: a.tenant_id,
      parentId: a.parent_id,
      roleDb: (a.role || 'agent') as DbRole,
    })
    writeDecisions[a.id] = decision.ok
  }

  // ---- 7. Fetch APA rows for all in-scope agents (across ALL APA scopes) ----
  // We need other-scope rows too -- builder splits them into preservedRowsByAgent.
  const { data: apaData, error: apaErr } = await supabase
    .from('agent_property_access')
    .select('id, agent_id, tenant_id, scope, area_id, municipality_id, community_id, neighbourhood_id, is_primary, is_active, condo_access, homes_access, buildings_access, buildings_mode')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .in('agent_id', agentIds)
  if (apaErr) return NextResponse.json({ error: apaErr.message }, { status: 500 })

  const apaRows: ApaRow[] = (apaData || []) as ApaRow[]
  const apaRowsByAgent: Record<string, ApaRow[]> = {}
  for (const r of apaRows) {
    const arr = apaRowsByAgent[r.agent_id] || []
    arr.push(r)
    apaRowsByAgent[r.agent_id] = arr
  }
  for (const id of agentIds) if (!apaRowsByAgent[id]) apaRowsByAgent[id] = []

  // ---- 8. Compute tenant footprint at chosen scope ----
  const footprintGeoIds = new Set<string>()
  for (const r of apaRows) {
    if (r.scope !== scope) continue
    const geoId =
      scope === 'area' ? r.area_id :
      scope === 'municipality' ? r.municipality_id :
      scope === 'community' ? r.community_id :
      scope === 'neighbourhood' ? r.neighbourhood_id : null
    if (geoId) footprintGeoIds.add(geoId)
  }
  const footprintIds = Array.from(footprintGeoIds)

  // ---- 9. Fetch geo entities at scope (with parent grouping data) ----
  type GeoCol = { id: string; name: string; parent_id: string | null; parent_name: string | null }
  let geos: GeoCol[] = []

  if (footprintIds.length > 0) {
    if (scope === 'area') {
      const { data, error } = await supabase
        .from('treb_areas')
        .select('id, name')
        .in('id', footprintIds)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      geos = (data || []).map((g: any) => ({
        id: g.id, name: g.name, parent_id: null, parent_name: null,
      }))
    } else if (scope === 'municipality') {
      const { data, error } = await supabase
        .from('municipalities')
        .select('id, name')
        .in('id', footprintIds)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      geos = (data || []).map((g: any) => ({
        id: g.id, name: g.name, parent_id: null, parent_name: null,
      }))
    } else if (scope === 'community') {
      const { data, error } = await supabase
        .from('communities')
        .select('id, name, municipality_id')
        .in('id', footprintIds)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      const muniIds = Array.from(
        new Set((data || []).map((g: any) => g.municipality_id).filter(Boolean) as string[])
      )
      let muniMap = new Map<string, string>()
      if (muniIds.length > 0) {
        const { data: muniData } = await supabase
          .from('municipalities')
          .select('id, name')
          .in('id', muniIds)
        muniMap = new Map((muniData || []).map((m: any) => [m.id, m.name]))
      }
      geos = (data || []).map((g: any) => ({
        id: g.id,
        name: g.name,
        parent_id: g.municipality_id ?? null,
        parent_name: g.municipality_id ? (muniMap.get(g.municipality_id) ?? null) : null,
      }))
    } else if (scope === 'neighbourhood') {
      const { data, error } = await supabase
        .from('neighbourhoods')
        .select('id, name, community_id')
        .in('id', footprintIds)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      const commIds = Array.from(
        new Set((data || []).map((g: any) => g.community_id).filter(Boolean) as string[])
      )
      let commMap = new Map<string, string>()
      if (commIds.length > 0) {
        const { data: commData } = await supabase
          .from('communities')
          .select('id, name')
          .in('id', commIds)
        commMap = new Map((commData || []).map((c: any) => [c.id, c.name]))
      }
      geos = (data || []).map((g: any) => ({
        id: g.id,
        name: g.name,
        parent_id: g.community_id ?? null,
        parent_name: g.community_id ? (commMap.get(g.community_id) ?? null) : null,
      }))
    }
  }

  // Sort: parent_name asc, then name asc -- groups columns visually by parent
  geos.sort((a, b) => {
    const pa = a.parent_name || ''
    const pb = b.parent_name || ''
    if (pa !== pb) return pa.localeCompare(pb)
    return a.name.localeCompare(b.name)
  })

  // ---- 10. Build matrix via pure builder ----
  const matrix: TerritoryMatrix = buildTerritoryMatrix({
    scope,
    authorizedAgentIds: agentIds,
    callerAgentId: user.permissions.agentId,
    agents: agents.map(a => ({
      id: a.id,
      name: a.name,
      role: a.role,
      parent_id: a.parent_id,
    })),
    geos,
    apaRowsByAgent,
    writeDecisions,
  })

  return NextResponse.json({ tenant_id: tenantId, scope, matrix })
}