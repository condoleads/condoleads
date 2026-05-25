// app/api/admin-homes/territory/health/route.ts
// W-TERRITORY-OPS T1-2 -- GET endpoint that returns resolver_health_check payload.
//
// Returns the 10-key jsonb shape locked in T0-1:
//   tenant_id, selling_agent_count, active_agent_count, tenant_default,
//   total_active_cards, phantom_cards, stale_agent_cards, orphan_buildings,
//   disaster_state, health_grade
//
// Multi-tenant safe: tenant_id derived from authed user OR ?tenant_id= override
// gated on isPlatformAdmin OR tenant_manager_assignments membership.
//
// Auth pattern copied verbatim from cards/cleanup/route.ts (shipped 2026-05-24).
// No new permission keys invented; same scope-via-tenant-membership model.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function resolveTenantId(req: NextRequest): Promise<{ tenantId: string | null; error?: { status: number; msg: string } }> {
  const user = await resolveAdminHomesUser()
  if (!user) return { tenantId: null, error: { status: 401, msg: 'unauthorized' } }
  const override = req.nextUrl.searchParams.get('tenant_id')
  if (override) {
    if (!UUID_RE.test(override)) return { tenantId: null, error: { status: 400, msg: 'bad tenant_id' } }
    if (user.isPlatformAdmin) return { tenantId: override }
    const supabase = createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return { tenantId: null, error: { status: 401, msg: 'unauthorized' } }
    const { data: a } = await supabase.from('tenant_manager_assignments')
      .select('tenant_id').eq('user_id', authUser.id).eq('tenant_id', override)
      .is('revoked_at', null).maybeSingle()
    if (!a) return { tenantId: null, error: { status: 403, msg: 'forbidden' } }
    return { tenantId: override }
  }
  return { tenantId: user.tenantId }
}

export async function GET(req: NextRequest) {
  const { tenantId, error } = await resolveTenantId(req)
  if (error) return NextResponse.json({ error: error.msg }, { status: error.status })
  if (!tenantId) return NextResponse.json({ error: 'no tenant scope' }, { status: 400 })

  const s = svc()
  const { data, error: rpcErr } = await s.rpc('resolver_health_check', { p_tenant_id: tenantId })
  if (rpcErr) {
    return NextResponse.json({ error: rpcErr.message || 'rpc failed' }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'rpc returned no data' }, { status: 500 })
  }

  return NextResponse.json(data, { status: 200 })
}
