// app/api/admin-homes/territory/cards/bulk-reassign/route.ts
// W-TERRITORY-OPS T1-3 -- bulk reassign apa cards from one agent to another.
//
// POST { from_agent_id, to_agent_id, card_ids? }
//   card_ids omitted -> reassign ALL active apa cards held by from_agent
//   card_ids provided -> reassign only those cards (must be subset of from_agent's holdings)
//
// SET LOCAL app.skip_apa_reroll = 'on' so the apa_update trigger enqueues
// into territory_reroll_queue instead of running the 19-second reroll
// inline. Operator sees sub-second response.
//
// Multi-tenant safe: every apa row verified to belong to tenant; both agents
// verified to belong to tenant. No cross-tenant moves.
//
// Returns: { ok, moved_count, queued_count }

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

export async function POST(req: NextRequest) {
  const { tenantId, error } = await resolveTenantId(req)
  if (error) return NextResponse.json({ error: error.msg }, { status: error.status })
  if (!tenantId) return NextResponse.json({ error: 'no tenant scope' }, { status: 400 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }
  const { from_agent_id, to_agent_id, card_ids } = body || {}

  if (!from_agent_id || !UUID_RE.test(from_agent_id)) {
    return NextResponse.json({ error: 'invalid from_agent_id' }, { status: 400 })
  }
  if (!to_agent_id || !UUID_RE.test(to_agent_id)) {
    return NextResponse.json({ error: 'invalid to_agent_id' }, { status: 400 })
  }
  if (from_agent_id === to_agent_id) {
    return NextResponse.json({ error: 'from and to are the same agent' }, { status: 400 })
  }
  if (card_ids !== undefined) {
    if (!Array.isArray(card_ids)) return NextResponse.json({ error: 'card_ids must be array if present' }, { status: 400 })
    for (const id of card_ids) {
      if (typeof id !== 'string' || !UUID_RE.test(id)) {
        return NextResponse.json({ error: 'invalid card_ids entry' }, { status: 400 })
      }
    }
  }

  // Verify both agents belong to the tenant.
  const s = svc()
  const { data: agents } = await s.from('agents')
    .select('id, tenant_id, is_active')
    .in('id', [from_agent_id, to_agent_id])
  if (!agents || agents.length !== 2) {
    return NextResponse.json({ error: 'one or both agents not found' }, { status: 404 })
  }
  if (agents.some((a: any) => a.tenant_id !== tenantId)) {
    return NextResponse.json({ error: 'agent does not belong to tenant' }, { status: 403 })
  }
  const toAgent = agents.find((a: any) => a.id === to_agent_id)
  if (!toAgent?.is_active) {
    return NextResponse.json({ error: 'to_agent is not active' }, { status: 409 })
  }

  const connStr = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING
  if (!connStr) return NextResponse.json({ error: 'no db env' }, { status: 500 })

  const c = new Client({ connectionString: connStr })
  await c.connect()
  let result: { moved_count: number; queued_count: number } | null = null
  try {
    await c.query('BEGIN')
    await c.query("SET LOCAL app.skip_apa_reroll = 'on'")
    const params: any[] = [to_agent_id, from_agent_id, tenantId]
    let sql = `UPDATE agent_property_access SET agent_id = $1, updated_at = now()
                WHERE agent_id = $2 AND tenant_id = $3 AND is_active = true`
    if (card_ids && card_ids.length > 0) {
      sql += ` AND id = ANY($4::uuid[])`
      params.push(card_ids)
    }
    const u = await c.query(sql, params)
    const moved = u.rowCount ?? 0

    // Count queued reroll jobs spawned by this tx.
    const q = await c.query(
      `SELECT COUNT(*)::int AS n FROM territory_reroll_queue
        WHERE tenant_id = $1 AND status = 'pending'`,
      [tenantId]
    )
    const queued = q.rows[0]?.n ?? 0

    await c.query('COMMIT')
    result = { moved_count: moved, queued_count: queued }
  } catch (e: any) {
    await c.query('ROLLBACK').catch(() => {})
    await c.end()
    return NextResponse.json({ error: e.message || 'tx failed' }, { status: 500 })
  }
  await c.end()
  return NextResponse.json({ ok: true, ...result })
}
