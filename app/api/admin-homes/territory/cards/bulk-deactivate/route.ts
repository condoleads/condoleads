// app/api/admin-homes/territory/cards/bulk-deactivate/route.ts
// W-TERRITORY-OPS T1-3 -- bulk deactivate apa cards.
//
// POST { card_ids: uuid[] }
//   Soft-deletes (is_active = false) every card_id provided.
//   All cards must belong to the tenant; otherwise the entire batch fails.
//
// SET LOCAL app.skip_apa_reroll = 'on' so triggers enqueue async reroll.
// Returns: { ok, deactivated_count, queued_count }

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
  const { card_ids } = body || {}

  if (!Array.isArray(card_ids) || card_ids.length === 0) {
    return NextResponse.json({ error: 'card_ids must be non-empty array' }, { status: 400 })
  }
  for (const id of card_ids) {
    if (typeof id !== 'string' || !UUID_RE.test(id)) {
      return NextResponse.json({ error: 'invalid card_ids entry' }, { status: 400 })
    }
  }

  // Verify every card belongs to the tenant + is currently active.
  const s = svc()
  const { data: rows } = await s.from('agent_property_access')
    .select('id, tenant_id, is_active')
    .in('id', card_ids)
  if (!rows || rows.length !== card_ids.length) {
    return NextResponse.json({ error: 'one or more cards not found' }, { status: 404 })
  }
  if (rows.some((r: any) => r.tenant_id !== tenantId)) {
    return NextResponse.json({ error: 'card does not belong to tenant' }, { status: 403 })
  }
  const alreadyInactive = rows.filter((r: any) => !r.is_active).length
  if (alreadyInactive === rows.length) {
    return NextResponse.json({ error: 'all cards already inactive' }, { status: 409 })
  }

  const connStr = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING
  if (!connStr) return NextResponse.json({ error: 'no db env' }, { status: 500 })

  const c = new Client({ connectionString: connStr })
  await c.connect()
  let result: { deactivated_count: number; queued_count: number } | null = null
  try {
    await c.query('BEGIN')
    await c.query("SET LOCAL app.skip_apa_reroll = 'on'")
    const u = await c.query(
      `UPDATE agent_property_access SET is_active = false, updated_at = now()
        WHERE id = ANY($1::uuid[]) AND tenant_id = $2 AND is_active = true`,
      [card_ids, tenantId]
    )
    const deactivated = u.rowCount ?? 0

    const q = await c.query(
      `SELECT COUNT(*)::int AS n FROM territory_reroll_queue
        WHERE tenant_id = $1 AND status = 'pending'`,
      [tenantId]
    )
    const queued = q.rows[0]?.n ?? 0

    await c.query('COMMIT')
    result = { deactivated_count: deactivated, queued_count: queued }
  } catch (e: any) {
    await c.query('ROLLBACK').catch(() => {})
    await c.end()
    return NextResponse.json({ error: e.message || 'tx failed' }, { status: 500 })
  }
  await c.end()
  return NextResponse.json({ ok: true, ...result })
}
