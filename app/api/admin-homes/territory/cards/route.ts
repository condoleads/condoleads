// app/api/admin-homes/territory/cards/route.ts
// W-COCKPIT P-B-2 Commit 2a -- upsert with async reroll.
//
// Wraps the upsert in `SET LOCAL app.skip_apa_reroll = 'on'` so the apa
// triggers enqueue into territory_reroll_queue instead of running the
// 19-second reroll inline. Returns instantly. The cockpit polls
// /api/admin-homes/territory/reroll-worker to drain the queue.

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

  const { scope, area_id, municipality_id, community_id, neighbourhood_id, agent_id,
          condo_access, homes_access, buildings_access, buildings_mode } = body || {}

  if (!['area', 'municipality', 'community', 'neighbourhood'].includes(scope)) {
    return NextResponse.json({ error: 'invalid scope' }, { status: 400 })
  }
  if (!agent_id || !UUID_RE.test(agent_id)) {
    return NextResponse.json({ error: 'invalid agent_id' }, { status: 400 })
  }
  const geoMap: Record<string, string | null> = {
    area: area_id || null,
    municipality: municipality_id || null,
    community: community_id || null,
    neighbourhood: neighbourhood_id || null,
  }
  const geoForScope = geoMap[scope]
  if (!geoForScope || !UUID_RE.test(geoForScope)) {
    return NextResponse.json({ error: scope + '_id required and must be uuid' }, { status: 400 })
  }
  for (const [k, v] of Object.entries(geoMap)) {
    if (k !== scope && v) return NextResponse.json({ error: 'only ' + scope + '_id allowed for scope=' + scope }, { status: 400 })
  }

  const s = svc()
  const { data: agent } = await s.from('agents').select('id, tenant_id, is_active').eq('id', agent_id).maybeSingle()
  if (!agent || agent.tenant_id !== tenantId || !agent.is_active) {
    return NextResponse.json({ error: 'agent not in tenant or inactive' }, { status: 400 })
  }

  // C2a: direct pg connection to SET LOCAL the GUC + do the upsert in one tx.
  // Supabase JS client cannot SET LOCAL across statements; need raw pg.
  const connStr = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING
  if (!connStr) return NextResponse.json({ error: 'no db env' }, { status: 500 })

  const c = new Client({ connectionString: connStr })
  await c.connect()
  let result: { action: string; card_id: string; queued: boolean } | null = null
  try {
    await c.query('BEGIN')
    await c.query("SET LOCAL app.skip_apa_reroll = 'on'")
    // Check existing card at this slot.
    const existing = await c.query(
      'SELECT id FROM agent_property_access WHERE tenant_id=$1 AND scope=$2 AND ' +
        (scope === 'area' ? 'area_id' : scope === 'municipality' ? 'municipality_id' : scope === 'community' ? 'community_id' : 'neighbourhood_id') +
        '=$3 AND is_active=true LIMIT 1',
      [tenantId, scope, geoForScope]
    )
    const cca = condo_access !== false
    const hca = homes_access !== false
    const bca = buildings_access !== false
    const bmd = buildings_mode || 'all'
    let cardId: string
    let action: string
    if (existing.rowCount && existing.rowCount > 0) {
      const upd = await c.query(
        'UPDATE agent_property_access SET agent_id=$1, condo_access=$2, homes_access=$3, buildings_access=$4, buildings_mode=$5, updated_at=now() WHERE id=$6 RETURNING id',
        [agent_id, cca, hca, bca, bmd, existing.rows[0].id]
      )
      cardId = upd.rows[0].id; action = 'updated'
    } else {
      const ins = await c.query(
        `INSERT INTO agent_property_access (agent_id, tenant_id, scope, is_active, is_primary,
          condo_access, homes_access, buildings_access, buildings_mode,
          area_id, municipality_id, community_id, neighbourhood_id)
         VALUES ($1,$2,$3,true,true,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id`,
        [agent_id, tenantId, scope, cca, hca, bca, bmd,
         scope === 'area' ? geoForScope : null,
         scope === 'municipality' ? geoForScope : null,
         scope === 'community' ? geoForScope : null,
         scope === 'neighbourhood' ? geoForScope : null]
      )
      cardId = ins.rows[0].id; action = 'created'
    }
    // Verify the queue row got inserted by the trigger.
    const q = await c.query(
      `SELECT id FROM territory_reroll_queue WHERE tenant_id=$1 AND scope=$2 AND scope_id=$3 AND status='pending'`,
      [tenantId, scope, geoForScope]
    )
    await c.query('COMMIT')
    result = { action, card_id: cardId, queued: q.rowCount! > 0 }
  } catch (e: any) {
    await c.query('ROLLBACK').catch(() => {})
    await c.end()
    return NextResponse.json({ error: e.message || 'tx failed' }, { status: 500 })
  }
  await c.end()
  return NextResponse.json({ ok: true, ...result })
}