// app/api/admin-homes/agents/[id]/geo/route.ts
// Geo territory assignment for WALLiam agents.
// T4a-3: F-APA-DELETE-INSERT-CHURN comprehensive fix -- POST now does
// server-side diff. Identity key: (scope, area_id, municipality_id,
// community_id, neighbourhood_id). Inactive rows are preserved (no longer
// nuked on save). Auto-reassign for primary claims preserved (T4a-1).
// System 1 never touched.

import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { createServiceClient } from '@/lib/admin-homes/service-client'
import { can, type DbRole } from '@/lib/admin-homes/permissions'
import { computeApaDiff, type ApaRow } from '@/lib/admin-homes/apa-diff'

// GET: fetch current geo assignments for agent
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await resolveAdminHomesUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createServiceClient()
  const { data: target } = await supabase
    .from('agents')
    .select('id, tenant_id, parent_id, site_type, role')
    .eq('id', params.id)
    .maybeSingle()
  if (!target || target.site_type !== 'comprehensive') {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }
  const decision = can(user.permissions, 'agent.read', {
    kind: 'agent',
    agentId: target.id,
    tenantId: target.tenant_id,
    parentId: target.parent_id,
    roleDb: (target.role || 'agent') as DbRole,
  })
  if (!decision.ok) return NextResponse.json({ error: decision.reason }, { status: decision.status })

  const { data, error } = await supabase
    .from('agent_property_access')
    .select('*')
    .eq('agent_id', params.id)
    .eq('is_active', true)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ assignments: data || [] })
}

// POST: server-side diff save (T4a-3 -- replaces DELETE-all + INSERT-all)
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await resolveAdminHomesUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createServiceClient()
  const { data: target } = await supabase
    .from('agents')
    .select('id, tenant_id, parent_id, site_type, role')
    .eq('id', params.id)
    .maybeSingle()
  if (!target || target.site_type !== 'comprehensive') {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }
  const decision = can(user.permissions, 'agent.write', {
    kind: 'agent',
    agentId: target.id,
    tenantId: target.tenant_id,
    parentId: target.parent_id,
    roleDb: (target.role || 'agent') as DbRole,
  })
  if (!decision.ok) return NextResponse.json({ error: decision.reason }, { status: decision.status })

  const body = await request.json()
  const assignments = (body && body.assignments) || []
  const tenantId = target.tenant_id

  const incoming: ApaRow[] = assignments.map((a: any) => ({
    agent_id: params.id,
    tenant_id: tenantId,
    scope: a.scope,
    area_id: a.area_id || null,
    municipality_id: a.municipality_id || null,
    community_id: a.community_id || null,
    neighbourhood_id: a.neighbourhood_id || null,
    is_primary: a.is_primary === true,
    is_active: true,
    condo_access: a.condo_access ?? true,
    homes_access: a.homes_access ?? true,
    buildings_access: a.buildings_access ?? true,
    buildings_mode: a.buildings_mode || 'all',
  }))

  // Fetch existing active rows (baseline)
  const { data: existingRaw, error: fetchError } = await supabase
    .from('agent_property_access')
    .select('id, agent_id, tenant_id, scope, area_id, municipality_id, community_id, neighbourhood_id, is_primary, is_active, condo_access, homes_access, buildings_access, buildings_mode')
    .eq('agent_id', params.id)
    .eq('is_active', true)
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  const existing: ApaRow[] = (existingRaw || []) as ApaRow[]

  // Compute diff
  const diff = computeApaDiff(existing, incoming)

  // Auto-reassign for primary claims (T4a-1 behavior preserved): for any
  // row newly claiming primary, unset OTHER agents' is_primary at same
  // (scope, scope_id) within tenant. Avoids partial-unique-index conflict.
  // Produces clean primary_unset audit rows via handle_apa_update (v13 fix).
  for (const row of diff.primaryClaims) {
    let scopeCol: string | null = null
    let scopeVal: string | null = null
    if (row.scope === 'area') { scopeCol = 'area_id'; scopeVal = row.area_id }
    else if (row.scope === 'municipality') { scopeCol = 'municipality_id'; scopeVal = row.municipality_id }
    else if (row.scope === 'community') { scopeCol = 'community_id'; scopeVal = row.community_id }
    else if (row.scope === 'neighbourhood') { scopeCol = 'neighbourhood_id'; scopeVal = row.neighbourhood_id }
    if (!scopeCol || !scopeVal) continue
    const { error: reassignError } = await supabase
      .from('agent_property_access')
      .update({ is_primary: false })
      .eq('scope', row.scope)
      .eq(scopeCol, scopeVal)
      .eq('is_active', true)
      .eq('is_primary', true)
      .eq('tenant_id', tenantId)
      .neq('agent_id', params.id)
    if (reassignError) {
      return NextResponse.json({ error: 'auto-reassign failed: ' + reassignError.message }, { status: 500 })
    }
  }

  // Apply DELETEs (rows in existing but not incoming)
  if (diff.toDelete.length > 0) {
    const ids = diff.toDelete.map(r => r.id!).filter(Boolean) as string[]
    if (ids.length > 0) {
      const { error: delError } = await supabase
        .from('agent_property_access')
        .delete()
        .in('id', ids)
      if (delError) return NextResponse.json({ error: delError.message }, { status: 500 })
    }
  }

  // Apply UPDATEs (rows whose mutable fields changed)
  for (const pair of diff.toUpdate) {
    const ex = pair.existing
    const inc = pair.incoming
    const { error: updError } = await supabase
      .from('agent_property_access')
      .update({
        is_primary: inc.is_primary,
        condo_access: inc.condo_access,
        homes_access: inc.homes_access,
        buildings_access: inc.buildings_access,
        buildings_mode: inc.buildings_mode,
      })
      .eq('id', ex.id!)
    if (updError) return NextResponse.json({ error: updError.message }, { status: 500 })
  }

  // Apply INSERTs (new rows). Strip id on the way in.
  if (diff.toInsert.length > 0) {
    const insertPayload = diff.toInsert.map(r => {
      const { id: _id, ...rest } = r as any
      return rest
    })
    const { error: insError } = await supabase
      .from('agent_property_access')
      .insert(insertPayload)
    if (insError) return NextResponse.json({ error: insError.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    count: incoming.length,
    diff: {
      deleted: diff.toDelete.length,
      inserted: diff.toInsert.length,
      updated: diff.toUpdate.length,
      unchanged: diff.unchanged,
    },
  })
}
