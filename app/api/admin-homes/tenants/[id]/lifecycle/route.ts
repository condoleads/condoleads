// app/api/admin-homes/tenants/[id]/lifecycle/route.ts
// Phase 3.3 — tenant lifecycle state machine
// POST { action: 'suspend' | 'reactivate' | 'terminate', reason?: string }
// Auth: platform admin OR tenant_admin of the same tenant.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { can } from '@/lib/admin-homes/permissions'

type LifecycleAction = 'suspend' | 'reactivate' | 'terminate'

const GRACE_DAYS = 90

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const tenantId = params.id
  const user = await resolveAdminHomesUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Authorization via can() - tenant.write requires tier 4 (tenant_admin) or platform tier.
  const decision = can(user.permissions, 'tenant.write', { kind: 'tenant', tenantId })
  if (!decision.ok) return NextResponse.json({ error: decision.reason }, { status: decision.status })

  const body = await req.json().catch(() => null) as { action?: LifecycleAction; reason?: string } | null
  if (!body || !body.action) {
    return NextResponse.json({ error: 'Missing action' }, { status: 400 })
  }
  const { action, reason } = body
  if (!['suspend', 'reactivate', 'terminate'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }
  if ((action === 'suspend' || action === 'terminate') && !reason?.trim()) {
    return NextResponse.json({ error: 'Reason required for suspend/terminate' }, { status: 400 })
  }

  const supabase = await createServerClient()

  const { data: current, error: fetchErr } = await supabase
    .from('tenants')
    .select('id, lifecycle_status')
    .eq('id', tenantId)
    .maybeSingle()

  if (fetchErr || !current) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  }

  const now = new Date().toISOString()
  const update: Record<string, unknown> = {}

  if (action === 'suspend') {
    if (current.lifecycle_status === 'terminated') {
      return NextResponse.json({ error: 'Cannot suspend a terminated tenant' }, { status: 400 })
    }
    update.lifecycle_status = 'suspended'
    update.suspended_at = now
    update.suspended_reason = reason!.trim()
    update.is_active = false
  } else if (action === 'reactivate') {
    if (current.lifecycle_status === 'terminated') {
      return NextResponse.json({ error: 'Cannot reactivate a terminated tenant' }, { status: 400 })
    }
    update.lifecycle_status = 'active'
    update.suspended_at = null
    update.suspended_reason = null
    update.is_active = true
  } else if (action === 'terminate') {
    const grace = new Date()
    grace.setDate(grace.getDate() + GRACE_DAYS)
    update.lifecycle_status = 'terminated'
    update.terminated_at = now
    update.termination_grace_until = grace.toISOString()
    update.suspended_reason = reason!.trim()
    update.is_active = false
  }

  const { error: updateErr } = await supabase
    .from('tenants')
    .update(update)
    .eq('id', tenantId)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    action,
    tenant_id: tenantId,
    lifecycle_status: update.lifecycle_status,
    grace_until: update.termination_grace_until ?? null,
  })
}