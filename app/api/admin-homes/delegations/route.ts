// app/api/admin-homes/delegations/route.ts
// W-ROLES-DELEGATION/R5 — Delegation CRUD API (collection endpoints).
// System 2 only — WALLiam admin-homes.
//
// GET   /api/admin-homes/delegations?agent_id=<uuid>[&include_revoked=true]
//        — list delegations where the agent is delegator OR delegate, scoped
//          to the agent's tenant. Authenticated tenant residents only.
// POST  /api/admin-homes/delegations
//        body: { delegator_id, delegate_id, notes? }
//        — calls grantDelegation() wrapper; permission gate + RPC live there.
//
// Pattern matches app/api/admin-homes/agents/route.ts post-P0-5
// (W-ADMIN-AUTH-LOCKDOWN). Wrappers in role-transitions.ts own all
// can('delegation.{grant,revoke}', ...) checks and SECURITY DEFINER RPCs.

import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { createServiceClient } from '@/lib/admin-homes/service-client'
import { grantDelegation } from '@/lib/admin-homes/role-transitions'

// ── GET ──────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const user = await resolveAdminHomesUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const agentId = url.searchParams.get('agent_id')
  const includeRevoked = url.searchParams.get('include_revoked') === 'true'

  if (!agentId) {
    return NextResponse.json(
      { error: 'agent_id query param is required' },
      { status: 400 },
    )
  }

  const supabase = createServiceClient()

  // Look up the agent's tenant for scope check.
  const { data: agentRow, error: agentErr } = await supabase
    .from('agents')
    .select('id, tenant_id')
    .eq('id', agentId)
    .maybeSingle()

  if (agentErr) {
    return NextResponse.json({ error: agentErr.message }, { status: 500 })
  }
  if (!agentRow) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  // Tenant scoping: agent must be in the user's tenant unless platform admin
  // is operating without a selected tenant (legacy 'see all' behavior, matches
  // app/api/admin-homes/agents/route.ts pattern).
  const isPlatformAdminAcrossTenants =
    user.isPlatformAdmin && !user.tenantId
  if (!isPlatformAdminAcrossTenants) {
    if (!user.tenantId || agentRow.tenant_id !== user.tenantId) {
      return NextResponse.json(
        { error: 'Forbidden — cross-tenant read' },
        { status: 403 },
      )
    }
  }

  let query = supabase
    .from('agent_delegations')
    .select(
      'id, delegator_id, delegate_id, tenant_id, granted_at, granted_by, revoked_at, revoked_by, notes',
    )
    .eq('tenant_id', agentRow.tenant_id)
    .or(`delegator_id.eq.${agentId},delegate_id.eq.${agentId}`)
    .order('granted_at', { ascending: false })

  if (!includeRevoked) {
    query = query.is('revoked_at', null)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ delegations: data ?? [] })
}

// ── POST ─────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const user = await resolveAdminHomesUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { delegator_id?: string; delegate_id?: string; notes?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { delegator_id, delegate_id, notes } = body
  if (!delegator_id || !delegate_id) {
    return NextResponse.json(
      { error: 'delegator_id and delegate_id are required' },
      { status: 400 },
    )
  }

  const result = await grantDelegation(user, delegator_id, delegate_id, notes)
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason, code: result.invariant ?? null },
      { status: result.status },
    )
  }
  return NextResponse.json({ delegation: result.payload }, { status: 201 })
}
