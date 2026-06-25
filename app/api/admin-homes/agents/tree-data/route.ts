// app/api/admin-homes/agents/tree-data/route.ts
// Phase 3.3b — tree-data feed for the org chart
// Returns { nodes, edges } scoped to the caller's tenant.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { can } from '@/lib/admin-homes/permissions'
import { deriveIsAdmin } from '@/lib/admin-homes/role-helpers'

export const dynamic = 'force-dynamic'

interface AgentRow {
  id: string
  full_name: string | null
  role: string | null
  is_selling: boolean | null
  is_active: boolean | null
  parent_id: string | null
  tenant_id: string | null
  profile_photo_url: string | null
}

interface TreeNode {
  id: string
  name: string
  role: string
  is_admin: boolean
  is_selling: boolean
  is_active: boolean
  parent_id: string | null
  profile_photo_url: string | null
  lead_count_30d: number
  // W-HOUSE-ACCOUNT UNIT 2: true on the agent currently set as the tenant's
  // default_agent_id. Driven by the per-tenant tenants.default_agent_id read
  // below, NOT by any field on agents itself.
  is_house_account: boolean
}

interface TreeEdge {
  id: string
  source: string
  target: string
  type: 'parent'
}

export async function GET(request: NextRequest) {
  const user = await resolveAdminHomesUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // W-COCKPIT P-B-1: platform admin in cockpit context has user.tenantId=null;
  // accept ?tenant_id= override (same pattern as territory/coverage/audit-log/matrix).
  // Tenant-scoped users (standalone /admin-homes/agents/tree route) pick up tenant
  // from session as before -- query param ignored when present alongside user.tenantId.
  const url = new URL(request.url)
  const requestedTenantId = url.searchParams.get('tenant_id')
  let tenantId: string | null = null
  if (user.isPlatformAdmin) {
    tenantId = requestedTenantId || user.tenantId
  } else {
    tenantId = user.tenantId
  }
  if (!tenantId) {
    return NextResponse.json({ nodes: [], edges: [] })
  }

  const decision = can(user.permissions, 'agent.read', {
    kind: 'agent',
    agentId: '00000000-0000-0000-0000-000000000000',
    tenantId,
    parentId: null,
    roleDb: 'agent',
  })
  if (!decision.ok) {
    return NextResponse.json({ error: decision.reason }, { status: decision.status })
  }

  const supabase = createClient()

  // W-HOUSE-ACCOUNT UNIT 3: filter inactive agents from the org chart. Matches
  // the list view's is_active=true filter — keeps retired roots (e.g. the
  // deactivated Aily seed) out of the visible tree without DELETEing them
  // (historical leads / APA references preserved).
  const { data: agents, error: agentsErr } = await supabase
    .from('agents')
    .select('id, full_name, role, is_selling, is_active, parent_id, tenant_id, profile_photo_url')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('full_name', { ascending: true })

  if (agentsErr) {
    return NextResponse.json({ error: agentsErr.message }, { status: 500 })
  }

  // W-HOUSE-ACCOUNT UNIT 2: read this tenant's default_agent_id. Single explicit
  // column (per CLAUDE.md: NEVER SELECT * on tenants — holds api keys). Used to
  // stamp is_house_account on each matching node + returned at top level so the
  // chart can render the marker even when the holding agent is filtered out.
  // tenant_id PK lookup is implicitly tenant-scoped (it IS the tenant).
  const { data: tenantRow, error: tenantErr } = await supabase
    .from('tenants')
    .select('id, default_agent_id')
    .eq('id', tenantId)
    .maybeSingle()

  if (tenantErr) {
    return NextResponse.json({ error: tenantErr.message }, { status: 500 })
  }
  const tenantDefaultAgentId: string | null = tenantRow?.default_agent_id ?? null

  const rows = (agents || []) as AgentRow[]
  const agentIds = rows.map(a => a.id)

  // 30-day lead counts per agent — single grouped query
  const since = new Date()
  since.setDate(since.getDate() - 30)

  const leadCounts = new Map<string, number>()
  if (agentIds.length > 0) {
    const { data: leads } = await supabase
      .from('leads')
      .select('agent_id')
      .in('agent_id', agentIds)
      .gte('created_at', since.toISOString())

    for (const lead of (leads || []) as { agent_id: string | null }[]) {
      if (!lead.agent_id) continue
      leadCounts.set(lead.agent_id, (leadCounts.get(lead.agent_id) || 0) + 1)
    }
  }

  const nodes: TreeNode[] = rows.map(a => ({
    id: a.id,
    name: a.full_name || '(unnamed)',
    role: a.role || 'agent',
    is_admin: deriveIsAdmin(a.role),
    is_selling: a.is_selling === true,
    is_active: a.is_active === true,
    parent_id: a.parent_id,
    profile_photo_url: a.profile_photo_url,
    lead_count_30d: leadCounts.get(a.id) || 0,
    is_house_account: tenantDefaultAgentId !== null && a.id === tenantDefaultAgentId,
  }))

  const edges: TreeEdge[] = []
  for (const a of rows) {
    if (a.parent_id && rows.some(r => r.id === a.parent_id)) {
      edges.push({
        id: `e-${a.parent_id}-${a.id}`,
        source: a.parent_id,
        target: a.id,
        type: 'parent',
      })
    }
  }

  // W-HOUSE-ACCOUNT UNIT 2: tenant block at top level so the chart knows the
  // current house-account holder (and the tenant id to PATCH against) even if
  // that agent is filtered out of the visible node set.
  return NextResponse.json({
    nodes,
    edges,
    tenant: { id: tenantId, default_agent_id: tenantDefaultAgentId },
  })
}