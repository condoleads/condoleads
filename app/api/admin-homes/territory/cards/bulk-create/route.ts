// app/api/admin-homes/territory/cards/bulk-create/route.ts
// W-TERRITORY-OPS T1-5 -- bulk create apa cards (carve-up workflow).
//
// POST { tenant_id?, agent_id, cards: [{ scope, scope_id, is_primary?,
//                                        condo_access?, homes_access?,
//                                        buildings_access? }] }
//
// One transaction inserts every card. Pre-flight validates that:
//   - agent_id belongs to the tenant (cross-tenant rejected)
//   - every (scope, scope_id) refers to a row that exists in the right geo
//     table (treb_areas | municipalities | communities | neighbourhoods)
//   - no duplicate (scope, scope_id) inside the request payload
//
// SET LOCAL app.skip_apa_reroll = 'on' so the AFTER INSERT trigger enqueues
// async rerolls into territory_reroll_queue instead of running synchronously.
// handle_apa_insert writes assignment_granted audit rows automatically.
//
// Returns: { ok, created_count, queued_count }

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { Client } from 'pg'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const SCOPES = ['area', 'municipality', 'community', 'neighbourhood'] as const
type Scope = typeof SCOPES[number]
function isScope(v: any): v is Scope { return typeof v === "string" && (SCOPES as readonly string[]).includes(v) }

const GEO_TABLE_BY_SCOPE: Record<Scope, string> = {
  area: 'treb_areas',
  municipality: 'municipalities',
  community: 'communities',
  neighbourhood: 'neighbourhoods',
}

const APA_FK_BY_SCOPE: Record<Scope, string> = {
  area: 'area_id',
  municipality: 'municipality_id',
  community: 'community_id',
  neighbourhood: 'neighbourhood_id',
}

function svc() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function resolveTenantId(req: NextRequest, bodyTenantId?: string | null): Promise<{ tenantId: string | null; error?: { status: number; msg: string } }> {
  const user = await resolveAdminHomesUser()
  if (!user) return { tenantId: null, error: { status: 401, msg: 'unauthorized' } }
  const override = bodyTenantId || req.nextUrl.searchParams.get('tenant_id')
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

interface CardInput {
  scope: Scope
  scope_id: string
  is_primary?: boolean
  condo_access?: boolean
  homes_access?: boolean
  buildings_access?: boolean
}

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }

  const { tenantId, error } = await resolveTenantId(req, body?.tenant_id || null)
  if (error) return NextResponse.json({ error: error.msg }, { status: error.status })
  if (!tenantId) return NextResponse.json({ error: 'no tenant scope' }, { status: 400 })

  const agentId = body?.agent_id
  if (typeof agentId !== 'string' || !UUID_RE.test(agentId)) {
    return NextResponse.json({ error: 'agent_id must be uuid' }, { status: 400 })
  }

  const cards: CardInput[] = Array.isArray(body?.cards) ? body.cards : []
  if (cards.length === 0) {
    return NextResponse.json({ error: 'cards must be non-empty array' }, { status: 400 })
  }
  if (cards.length > 200) {
    return NextResponse.json({ error: 'cards capped at 200 per request' }, { status: 400 })
  }

  // Per-row validation + dedup check.
  const seen = new Set<string>()
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i]
    if (!c || typeof c !== "object") {
      return NextResponse.json({ error: 'cards[' + i + '] must be object' }, { status: 400 })
    }
    if (!isScope(c.scope)) {
      return NextResponse.json({ error: 'cards[' + i + '].scope invalid' }, { status: 400 })
    }
    if (typeof c.scope_id !== 'string' || !UUID_RE.test(c.scope_id)) {
      return NextResponse.json({ error: 'cards[' + i + '].scope_id must be uuid' }, { status: 400 })
    }
    const key = c.scope + '|' + c.scope_id
    if (seen.has(key)) {
      return NextResponse.json({ error: 'duplicate (scope,scope_id) at index ' + i }, { status: 400 })
    }
    seen.add(key)
  }

  // Verify agent belongs to tenant.
  const s = svc()
  const { data: agentRow } = await s.from('agents').select('id, tenant_id, is_active').eq('id', agentId).maybeSingle()
  if (!agentRow) {
    return NextResponse.json({ error: 'agent not found' }, { status: 404 })
  }
  if (agentRow.tenant_id !== tenantId) {
    return NextResponse.json({ error: 'agent does not belong to tenant' }, { status: 403 })
  }

  // Verify every scope_id exists in its geo table. Done per-scope in batch.
  const byScope: Record<Scope, string[]> = { area: [], municipality: [], community: [], neighbourhood: [] }
  for (const c of cards) byScope[c.scope].push(c.scope_id)
  for (const scope of SCOPES) {
    const ids = byScope[scope]
    if (ids.length === 0) continue
    const tbl = GEO_TABLE_BY_SCOPE[scope]
    const { data: rows, error: gErr } = await s.from(tbl).select('id').in('id', ids)
    if (gErr) {
      return NextResponse.json({ error: 'geo lookup failed: ' + gErr.message }, { status: 500 })
    }
    const found = new Set((rows || []).map((r: any) => r.id))
    const missing = ids.filter(id => !found.has(id))
    if (missing.length > 0) {
      return NextResponse.json({ error: scope + ' scope_ids not found: ' + missing.join(',') }, { status: 404 })
    }
  }

  // Insert in one transaction with SET LOCAL app.skip_apa_reroll = on.
  const connStr = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING
  if (!connStr) return NextResponse.json({ error: 'no db env' }, { status: 500 })

  const c = new Client({ connectionString: connStr })
  await c.connect()
  let result: { created_count: number; queued_count: number } | null = null
  try {
    await c.query('BEGIN')
    await c.query("SET LOCAL app.skip_apa_reroll = 'on'")
    let created = 0
    for (const card of cards) {
      const fk = APA_FK_BY_SCOPE[card.scope]
      const insertSql =
        'INSERT INTO agent_property_access (' +
        '  tenant_id, agent_id, scope, ' + fk + ', ' +
        '  is_primary, is_active, condo_access, homes_access, buildings_access, buildings_mode' +
        ') VALUES (' +
        '  $1::uuid, $2::uuid, $3::text, $4::uuid, ' +
        '  $5::boolean, true, $6::boolean, $7::boolean, $8::boolean, \'all\'' +
        ') RETURNING id'
      const params = [
        tenantId,
        agentId,
        card.scope,
        card.scope_id,
        card.is_primary === true,
        card.condo_access !== false,
        card.homes_access !== false,
        card.buildings_access !== false,
      ]
      const ins = await c.query(insertSql, params)
      if ((ins.rowCount ?? 0) === 1) created += 1
    }

    const q = await c.query(
      'SELECT COUNT(*)::int AS n FROM territory_reroll_queue WHERE tenant_id = $1 AND status = \'pending\'',
      [tenantId]
    )
    const queued = q.rows[0]?.n ?? 0

    await c.query('COMMIT')
    result = { created_count: created, queued_count: queued }
  } catch (e: any) {
    await c.query('ROLLBACK').catch(() => {})
    await c.end()
    return NextResponse.json({ error: e.message || 'tx failed' }, { status: 500 })
  }
  await c.end()
  return NextResponse.json({ ok: true, ...result })
}
