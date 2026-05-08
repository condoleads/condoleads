// app/api/admin-homes/territory/audit-log/route.ts
// T4a-2: GET recent territory_assignment_changes for a tenant, decorated with agent names.
// Per-tenant scoping. Filters: change_type, agent_id. Limit 1..500 (default 50).

import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { createServiceClient } from '@/lib/admin-homes/service-client'

export async function GET(request: NextRequest) {
  const user = await resolveAdminHomesUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const requestedTenantId = url.searchParams.get('tenant_id')
  const limitRaw = url.searchParams.get('limit')
  const limit = Math.max(1, Math.min(500, parseInt(limitRaw || '50', 10) || 50))
  const filterChangeType = url.searchParams.get('change_type')
  const filterAgentId = url.searchParams.get('agent_id')

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

  let q = supabase
    .from('territory_assignment_changes')
    .select('id, tenant_id, agent_id, scope, scope_id, change_type, before_state, after_state, changed_by, changed_at, notes')
    .eq('tenant_id', tenantId)
    .order('changed_at', { ascending: false })
    .limit(limit)
  if (filterChangeType) q = q.eq('change_type', filterChangeType)
  if (filterAgentId) q = q.eq('agent_id', filterAgentId)

  const { data: rows, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const agentIds = Array.from(new Set((rows || []).map(r => r.agent_id).filter(Boolean))) as string[]
  let agentMap = new Map<string, any>()
  if (agentIds.length) {
    const { data: agents } = await supabase.from('agents').select('id, name').in('id', agentIds)
    agentMap = new Map<string, any>((agents || []).map((a: any) => [a.id, a]))
  }

  const decorated = (rows || []).map(r => ({
    id: r.id,
    agent_id: r.agent_id,
    agent_name: r.agent_id ? (agentMap.get(r.agent_id)?.name ?? null) : null,
    scope: r.scope,
    scope_id: r.scope_id,
    change_type: r.change_type,
    before_state: r.before_state,
    after_state: r.after_state,
    changed_by: r.changed_by,
    changed_at: r.changed_at,
    notes: r.notes,
  }))

  const { data: ctRows } = await supabase
    .from('territory_assignment_changes')
    .select('change_type')
    .eq('tenant_id', tenantId)
  const distinctChangeTypes = Array.from(new Set((ctRows || []).map((r: any) => r.change_type))).sort()

  return NextResponse.json({
    tenant_id: tenantId,
    rows: decorated,
    distinct_change_types: distinctChangeTypes,
    total_returned: decorated.length,
    limit,
  })
}
