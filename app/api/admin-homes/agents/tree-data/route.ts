// app/api/admin-homes/agents/tree-data/route.ts
// Phase 3.3b — tree-data feed for the org chart
// Returns { nodes, edges } scoped to the caller's tenant.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { can } from '@/lib/admin-homes/permissions'

export const dynamic = 'force-dynamic'

interface AgentRow {
  id: string
  full_name: string | null
  role: string | null
  is_admin: boolean | null
  is_selling: boolean | null
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
  parent_id: string | null
  profile_photo_url: string | null
  lead_count_30d: number
}

interface TreeEdge {
  id: string
  source: string
  target: string
  type: 'parent'
}

export async function GET() {
  const user = await resolveAdminHomesUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!user.tenantId) {
    return NextResponse.json({ nodes: [], edges: [] })
  }

  const decision = can(user.permissions, 'agent.read', {
    kind: 'agent',
    agentId: '00000000-0000-0000-0000-000000000000',
    tenantId: user.tenantId,
    parentId: null,
    roleDb: 'agent',
  })
  if (!decision.ok) {
    return NextResponse.json({ error: decision.reason }, { status: decision.status })
  }

  const supabase = createClient()

  const { data: agents, error: agentsErr } = await supabase
    .from('agents')
    .select('id, full_name, role, is_admin, is_selling, parent_id, tenant_id, profile_photo_url')
    .eq('tenant_id', user.tenantId)
    .order('full_name', { ascending: true })

  if (agentsErr) {
    return NextResponse.json({ error: agentsErr.message }, { status: 500 })
  }

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
    is_admin: a.is_admin === true,
    is_selling: a.is_selling === true,
    parent_id: a.parent_id,
    profile_photo_url: a.profile_photo_url,
    lead_count_30d: leadCounts.get(a.id) || 0,
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

  return NextResponse.json({ nodes, edges })
}