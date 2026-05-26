// app/api/admin-homes/territory/geo-search/route.ts
// W-TERRITORY-OPS T1-6 -- global search backend for TerritorySearchBar.
//
// GET /api/admin-homes/territory/geo-search?tenant_id=X&q=Y&limit=Z
//   tenant_id  uuid     (platform admin only; tenant manager uses own tenant)
//   q          text     (search query, min 2 chars; shorter -> empty results)
//   limit      int      (1..50, default 20)
//
// Returns: { results: [...] } where each row:
//   { kind: 'agent' | 'area' | 'municipality' | 'community' | 'neighbourhood',
//     id, name, slug?, parent_name?, is_selling?, is_active? }
//
// Strategy: single UNION ALL across agents + 4 geo tables. Agents filtered
// by tenant_id. Geo tables are tenant-agnostic (shared TREB hierarchy) so
// returned regardless of tenant; operator can carve from any geo.
//
// Auth: resolveAdminHomesUser + tenant_manager_assignments membership.
// Verified geo table names: treb_areas, municipalities, communities, neighbourhoods.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
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
  const qRaw = (url.searchParams.get('q') || '').trim()
  const limitRaw = url.searchParams.get('limit')
  const limit = Math.max(1, Math.min(50, parseInt(limitRaw || '20', 10) || 20))

  // Short queries return empty results (no error) to avoid hammering the DB
  // on each keystroke.
  if (qRaw.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const connStr = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING
  if (!connStr) return NextResponse.json({ error: 'no db env' }, { status: 500 })

  const c = new Client({ connectionString: connStr })
  await c.connect()
  try {
    // Five UNION-ALL branches. Each branch is bounded by LIMIT $3 so a single
    // hot category cannot starve others. The outer ORDER BY produces a stable
    // mixed-kind ranking; the outer LIMIT $3 caps total results to <= 5 * limit
    // worst case (acceptable for a UI suggest box).
    const sql =
      "SELECT kind, id, name, slug, parent_name, is_selling, is_active FROM ( " +
      "  (SELECT 'agent'::text AS kind, a.id, a.full_name AS name, NULL::text AS slug, " +
      "          NULL::text AS parent_name, a.is_selling, a.is_active " +
      "     FROM agents a " +
      "    WHERE a.tenant_id = $1::uuid " +
      "      AND a.full_name ILIKE '%' || $2 || '%' " +
      "    ORDER BY a.full_name LIMIT $3) " +
      "  UNION ALL " +
      "  (SELECT 'area'::text AS kind, ar.id, ar.name, ar.slug, " +
      "          NULL::text AS parent_name, NULL::boolean AS is_selling, NULL::boolean AS is_active " +
      "     FROM treb_areas ar " +
      "    WHERE ar.name ILIKE '%' || $2 || '%' " +
      "    ORDER BY ar.name LIMIT $3) " +
      "  UNION ALL " +
      "  (SELECT 'municipality'::text AS kind, m.id, m.name, m.slug, " +
      "          ar2.name AS parent_name, NULL::boolean AS is_selling, NULL::boolean AS is_active " +
      "     FROM municipalities m " +
      "     LEFT JOIN treb_areas ar2 ON ar2.id = m.area_id " +
      "    WHERE m.name ILIKE '%' || $2 || '%' " +
      "    ORDER BY m.name LIMIT $3) " +
      "  UNION ALL " +
      "  (SELECT 'community'::text AS kind, co.id, co.name, co.slug, " +
      "          m2.name AS parent_name, NULL::boolean AS is_selling, NULL::boolean AS is_active " +
      "     FROM communities co " +
      "     LEFT JOIN municipalities m2 ON m2.id = co.municipality_id " +
      "    WHERE co.name ILIKE '%' || $2 || '%' " +
      "    ORDER BY co.name LIMIT $3) " +
      "  UNION ALL " +
      "  (SELECT 'neighbourhood'::text AS kind, nb.id, nb.name, nb.slug, " +
      "          ar3.name AS parent_name, NULL::boolean AS is_selling, NULL::boolean AS is_active " +
      "     FROM neighbourhoods nb " +
      "     LEFT JOIN treb_areas ar3 ON ar3.id = nb.area_id " +
      "    WHERE nb.name ILIKE '%' || $2 || '%' " +
      "    ORDER BY nb.name LIMIT $3) " +
      ") u ORDER BY kind, name LIMIT $3"
    const r = await c.query(sql, [tenantId, qRaw, limit])
    await c.end()
    return NextResponse.json({ results: r.rows })
  } catch (e: any) {
    await c.end().catch(() => {})
    return NextResponse.json({ error: e.message || 'query failed' }, { status: 500 })
  }
}
