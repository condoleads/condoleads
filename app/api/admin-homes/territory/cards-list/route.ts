// app/api/admin-homes/territory/cards-list/route.ts
// W-TERRITORY-OPS T1-4 -- GET endpoint that returns paginated card list.
//
// Query params:
//   tenant_id          uuid     (platform admin only; tenant manager uses own tenant)
//   agent_id           uuid     (optional filter)
//   scope              text     (optional: area|municipality|community|neighbourhood)
//   include_inactive   bool     (default false: active cards only)
//   q                  text     (optional substring across agent + geo name)
//   limit              int      (default 50, clamped 1..200)
//   offset             int      (default 0)
//
// Returns: { cards: [...], total_count, has_more }
//
// Each card row joins to agents + the appropriate geo table (per scope) and
// includes the last audit event from territory_assignment_changes via DISTINCT ON.
//
// Multi-tenant safe: tenant_id is resolved per request (header / platform-admin
// override / tenant manager scope) and applied as the WHERE filter on every query.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { Client } from 'pg'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

  const url = new URL(req.url)
  const agentIdParam = url.searchParams.get('agent_id')
  const scopeParam = url.searchParams.get('scope')
  const includeInactiveParam = url.searchParams.get('include_inactive')
  const qParam = url.searchParams.get('q')
  const limitRaw = url.searchParams.get('limit')
  const offsetRaw = url.searchParams.get('offset')

  if (agentIdParam && !UUID_RE.test(agentIdParam)) {
    return NextResponse.json({ error: 'bad agent_id' }, { status: 400 })
  }
  const ALLOWED_SCOPES = ['area', 'municipality', 'community', 'neighbourhood']
  if (scopeParam && !ALLOWED_SCOPES.includes(scopeParam)) {
    return NextResponse.json({ error: 'bad scope' }, { status: 400 })
  }
  const includeInactive = includeInactiveParam === 'true'
  const limit = Math.max(1, Math.min(200, parseInt(limitRaw || '50', 10) || 50))
  const offset = Math.max(0, parseInt(offsetRaw || '0', 10) || 0)
  const q = qParam ? qParam.trim() : null

  const connStr = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING
  if (!connStr) return NextResponse.json({ error: 'no db env' }, { status: 500 })

  const c = new Client({ connectionString: connStr })
  await c.connect()

  try {
    // Single query: base CTE with apa + agents + geo JOIN, filter CTE, last_event lookup, final SELECT.
    const sql = `
      WITH base AS (
        SELECT
          apa.id,
          apa.agent_id,
          apa.scope,
          CASE apa.scope
            WHEN 'area'          THEN apa.area_id
            WHEN 'municipality'  THEN apa.municipality_id
            WHEN 'community'     THEN apa.community_id
            WHEN 'neighbourhood' THEN apa.neighbourhood_id
          END AS scope_id,
          apa.is_primary,
          apa.is_active,
          apa.condo_access,
          apa.homes_access,
          apa.buildings_access,
          apa.buildings_mode,
          apa.created_at,
          apa.updated_at,
          a.full_name           AS agent_name,
          a.is_selling          AS agent_is_selling,
          a.is_active           AS agent_is_active,
          COALESCE(ar.name, mu.name, co.name, nb.name) AS geo_name
        FROM agent_property_access apa
        JOIN agents a ON a.id = apa.agent_id
        LEFT JOIN treb_areas          ar ON apa.scope = 'area'          AND ar.id = apa.area_id
        LEFT JOIN municipalities      mu ON apa.scope = 'municipality'  AND mu.id = apa.municipality_id
        LEFT JOIN communities         co ON apa.scope = 'community'     AND co.id = apa.community_id
        LEFT JOIN neighbourhoods      nb ON apa.scope = 'neighbourhood' AND nb.id = apa.neighbourhood_id
        WHERE apa.tenant_id = $1
          AND ($2::uuid IS NULL OR apa.agent_id = $2::uuid)
          AND ($3::text IS NULL OR apa.scope = $3::text)
          AND ($4::boolean = true OR apa.is_active = true)
      ),
      filtered AS (
        SELECT * FROM base
        WHERE ($5::text IS NULL OR agent_name ILIKE '%' || $5::text || '%' OR geo_name ILIKE '%' || $5::text || '%')
      ),
      last_event AS (
        SELECT DISTINCT ON (tenant_id, agent_id, scope, scope_id)
          tenant_id, agent_id, scope, scope_id,
          change_type, changed_at, changed_by
        FROM territory_assignment_changes
        WHERE tenant_id = $1
        ORDER BY tenant_id, agent_id, scope, scope_id, changed_at DESC
      ),
      total AS ( SELECT COUNT(*)::int AS n FROM filtered )
      SELECT
        f.id, f.agent_id, f.scope, f.scope_id,
        f.is_primary, f.is_active,
        f.condo_access, f.homes_access, f.buildings_access, f.buildings_mode,
        f.created_at, f.updated_at,
        f.agent_name, f.agent_is_selling, f.agent_is_active,
        f.geo_name,
        le.change_type     AS last_event_type,
        le.changed_at      AS last_event_at,
        cb.full_name       AS last_event_by_name,
        (SELECT n FROM total) AS total_count
      FROM filtered f
      LEFT JOIN last_event le
        ON le.tenant_id = $1
       AND le.agent_id = f.agent_id
       AND le.scope    = f.scope
       AND le.scope_id = f.scope_id
      LEFT JOIN agents cb ON cb.id = le.changed_by
      ORDER BY f.scope, f.geo_name, f.agent_name
      LIMIT $6 OFFSET $7
    `
    const params = [tenantId, agentIdParam, scopeParam, includeInactive, q, limit, offset]
    const r = await c.query(sql, params)

    const total = r.rows.length > 0 ? (r.rows[0].total_count as number) : 0
    const cards = r.rows.map(row => ({
      id: row.id,
      agent_id: row.agent_id,
      agent_name: row.agent_name,
      agent_is_selling: row.agent_is_selling,
      agent_is_active: row.agent_is_active,
      scope: row.scope,
      scope_id: row.scope_id,
      geo_name: row.geo_name,
      is_primary: row.is_primary,
      is_active: row.is_active,
      condo_access: row.condo_access,
      homes_access: row.homes_access,
      buildings_access: row.buildings_access,
      buildings_mode: row.buildings_mode,
      created_at: row.created_at,
      updated_at: row.updated_at,
      last_event: row.last_event_type ? {
        change_type: row.last_event_type,
        changed_at: row.last_event_at,
        changed_by_name: row.last_event_by_name,
      } : null,
    }))

    await c.end()
    return NextResponse.json({
      cards,
      total_count: total,
      has_more: offset + cards.length < total,
    })
  } catch (e: any) {
    await c.end().catch(() => {})
    return NextResponse.json({ error: e.message || 'query failed' }, { status: 500 })
  }
}