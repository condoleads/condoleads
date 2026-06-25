// app/api/admin-homes/territory/agents-summary/route.ts
// W-TERRITORY-OPS T1-3 -- GET endpoint that returns per-agent territory rollup.
//
// Pass-through to territory_agents_summary(p_tenant_id) RPC (10-column rowset).
// Auth + tenant resolution copied from cards/cleanup/route.ts pattern.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { Client } from 'pg'

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
  const { data, error: rpcErr } = await s.rpc('territory_agents_summary', { p_tenant_id: tenantId })
  if (rpcErr) return NextResponse.json({ error: rpcErr.message || 'rpc failed' }, { status: 500 })

  // P-DASHBOARD GAP-E: enrich each agent row with mls_listings_footprint --
  // the actual cache row count pointing at this agent. The existing
  // assigned_card_count is APA cards (e.g. King Shah = 11 cards), but the
  // operational reality is the footprint (King Shah = 441,066 listings).
  // Surfacing footprint prevents blindly deactivating an agent and
  // triggering a 441k-row reflow via the Event 4 queue.
  //
  // pg-direct as postgres: mls_listings has full service_role grants too
  // but we use pg-direct here so the GROUP BY scan over 1.3M rows gets
  // postgres's 2-min ceiling instead of authenticator's 8s. Per-call cost
  // is sub-second on an indexed assigned_agent_id but we don't want a
  // future column shape change to cause flaky 8s timeouts.
  const agents = (data as Array<{ agent_id: string }> | null) || []
  const agentIds = agents.map(a => a.agent_id).filter(Boolean)
  const footprints = new Map<string, number>()
  if (agentIds.length > 0) {
    const connStr = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING
    if (connStr) {
      const c = new Client({ connectionString: connStr })
      c.on('error', (e) => console.error('agents-summary footprint client error:', e.message))
      try {
        await c.connect()
        const r = await c.query(
          `SELECT assigned_agent_id, COUNT(*)::int AS n
             FROM mls_listings
            WHERE assigned_agent_id = ANY($1::uuid[])
            GROUP BY assigned_agent_id`,
          [agentIds]
        )
        for (const row of r.rows) {
          if (row.assigned_agent_id) footprints.set(row.assigned_agent_id, row.n)
        }
      } catch (e: any) {
        console.error('agents-summary footprint query failed:', e?.message)
        // Soft-fail: return agents WITHOUT footprints rather than 500.
        // The UI degrades to showing 0 footprint, which is observable.
      } finally {
        await c.end().catch(() => {})
      }
    }
  }

  // W-HOUSE-ACCOUNT UNIT 9: filter out agents flagged as oversight_opt_out
  // in their notification_preferences. Opted-out agents are NOT shown in
  // assignable-agents UI (CardsView filter dropdown + reassign destination,
  // GeographyView CarveUpModal "assign to agent" picker). Keyed on the
  // existing jsonb column — no schema change. Read-only filter; agents
  // remain in the DB and can be un-opted-out by tenant_admin.
  //
  // W-TENANT-ASSISTANT UNIT 11 FIX (reverts the UNIT 11 license filter):
  // license_number is NOT a card-eligibility gate. Every role is a licensed
  // trade by the operator's design; the system does not model
  // licensed-vs-not. The previous UNIT 11 unlicensedAssistantIds filter
  // was incorrect and has been removed — assistants appear in territory
  // dropdowns like any other role.
  let optOutIds = new Set<string>()
  if (agentIds.length > 0) {
    const { data: prefs } = await s
      .from('agents')
      .select('id, notification_preferences')
      .in('id', agentIds)
    for (const row of (prefs || []) as Array<{ id: string; notification_preferences: Record<string, any> | null }>) {
      if (row.notification_preferences && (row.notification_preferences as any).oversight_opt_out === true) {
        optOutIds.add(row.id)
      }
    }
  }

  const enriched = agents
    .filter(a => !optOutIds.has(a.agent_id))
    .map(a => ({ ...a, mls_listings_footprint: footprints.get(a.agent_id) || 0 }))
  return NextResponse.json({ agents: enriched }, { status: 200 })
}
