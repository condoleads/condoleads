// app/api/admin-homes/territory/geo-rollup/route.ts
// W-TERRITORY-OPS T1-5 -- GET endpoint that returns per-level geo rollup rows.
//
// Query params:
//   tenant_id          uuid     (platform admin only; tenant manager uses own tenant)
//   level              text     (area | municipality | community | neighbourhood)
//                                Default: area.
//   parent_id          uuid     (optional; when level > area, restricts to children
//                                of this parent. Per-level parent FK:
//                                  municipality.area_id, community.municipality_id,
//                                  neighbourhood.area_id (verified S1-Nbhd 2026-05-18).)
//
// Returns: { rows: [...] }. Each row:
//   id, name, slug, level, parent_id, has_own_card,
//   listing_count, building_count, child_count,
//   primary_card_holder_agent_id?, primary_card_holder_name?,
//   inherited_from_level?, inherited_from_id?
//
// Multi-tenant safe: tenant_id resolved per request and applied to every query.
// Verified RPC signature (pre-flight 2026-05-26): resolve_geo_primary(
//   p_scope text, p_scope_id uuid, p_tenant_id uuid) RETURNS uuid.
// Verified geo table names: treb_areas, municipalities, communities, neighbourhoods.
// Verified: mls_listings has no neighbourhood_id (listing_count = 0 at that level).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { Client } from 'pg'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const LEVELS = ['area', 'municipality', 'community', 'neighbourhood'] as const
type Level = typeof LEVELS[number]
function isLevel(v: string): v is Level { return (LEVELS as readonly string[]).includes(v) }

const TABLE_BY_LEVEL: Record<Level, string> = {
  area: 'treb_areas',
  municipality: 'municipalities',
  community: 'communities',
  neighbourhood: 'neighbourhoods',
}

const APA_SCOPE_COL: Record<Level, string> = {
  area: 'area_id',
  municipality: 'municipality_id',
  community: 'community_id',
  neighbourhood: 'neighbourhood_id',
}

// mls_listings has area_id, municipality_id, community_id; NO neighbourhood_id.
const MLS_COL_BY_LEVEL: Record<Level, string | null> = {
  area: 'area_id',
  municipality: 'municipality_id',
  community: 'community_id',
  neighbourhood: null,
}

const PARENT_FK_BY_LEVEL: Record<Level, string | null> = {
  area: null,
  municipality: 'area_id',
  community: 'municipality_id',
  neighbourhood: 'area_id',
}

const PARENT_LEVEL_BY_LEVEL: Record<Level, Level | null> = {
  area: null,
  municipality: 'area',
  community: 'municipality',
  neighbourhood: 'area',
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

  const url = new URL(req.url)
  const levelParam = (url.searchParams.get('level') || 'area').trim()
  if (!isLevel(levelParam)) {
    return NextResponse.json({ error: 'bad level' }, { status: 400 })
  }
  const level: Level = levelParam
  const parentIdParam = url.searchParams.get('parent_id')
  if (parentIdParam && !UUID_RE.test(parentIdParam)) {
    return NextResponse.json({ error: 'bad parent_id' }, { status: 400 })
  }
  const parentFk = PARENT_FK_BY_LEVEL[level]
  if (parentIdParam && !parentFk) {
    return NextResponse.json({ error: 'parent_id not applicable at area level' }, { status: 400 })
  }

  const connStr = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING
  if (!connStr) return NextResponse.json({ error: 'no db env' }, { status: 500 })

  const geoTable = TABLE_BY_LEVEL[level]
  const apaScopeCol = APA_SCOPE_COL[level]
  const mlsCol = MLS_COL_BY_LEVEL[level]

  // Compute the SQL fragments for child_count and listing_count BEFORE the
  // backtick template, so the SQL string itself contains no JS expressions.
  const childLevel: Level | null = level === 'area' ? 'municipality' : level === 'municipality' ? 'community' : null
  let childCountExpr = "0::int"
  if (childLevel) {
    const childTable = TABLE_BY_LEVEL[childLevel]
    const childParentFk = PARENT_FK_BY_LEVEL[childLevel]
    if (childParentFk) {
      childCountExpr = "(SELECT COUNT(*)::int FROM " + childTable + " ch WHERE ch." + childParentFk + " = g.id)"
    }
  }

  // P5.2c-followup-3: replace slow correlated COUNT(*) with MV-backed lookup.
  // Semantic change from VOW-filter to 2-year filter (matches the rest of the
  // system; the MVs are the canonical "recent listing count" source -- see
  // mv_municipality_counts / mv_community_counts / area_listing_counts_mv).
  let listingCountExpr = "0::int"
  if (level === 'area') {
    listingCountExpr = "COALESCE((SELECT SUM(cnt)::int FROM area_listing_counts_mv WHERE area_id = g.id), 0)"
  } else if (level === 'municipality') {
    listingCountExpr = "COALESCE((SELECT listing_count::int FROM mv_municipality_counts WHERE municipality_id = g.id), 0)"
  } else if (level === 'community') {
    listingCountExpr = "COALESCE((SELECT listing_count::int FROM mv_community_counts WHERE community_id = g.id), 0)"
  }
  // neighbourhood: mls_listings has no neighbourhood_id; listing_count stays 0.

  // buildings table has only community_id (verified probe 2026-05-26).
  // building_count is meaningful at community level only; 0 elsewhere.
  let buildingCountExpr = "0::int"
  if (level === 'community') {
    buildingCountExpr = "(SELECT COUNT(*)::int FROM buildings b WHERE b.community_id = g.id)"
  }

  const parentSelectExpr = parentFk ? "g." + parentFk : "NULL::uuid"
  const parentFilterExpr = (parentFk && parentIdParam) ? "g." + parentFk + " = $3::uuid" : "1=1"

  const geoSql =
    'SELECT ' + '\n' +
    '  g.id, ' + '\n' +
    '  g.name, ' + '\n' +
    '  g.slug, ' + '\n' +
    '  ' + parentSelectExpr + ' AS parent_id, ' + '\n' +
    '  (SELECT EXISTS( ' + '\n' +
    '     SELECT 1 FROM agent_property_access apa ' + '\n' +
    '      WHERE apa.tenant_id = $1::uuid ' + '\n' +
    '        AND apa.scope = $2::text ' + '\n' +
    '        AND apa.' + apaScopeCol + ' = g.id ' + '\n' +
    '        AND apa.is_active = true ' + '\n' +
    '  )) AS has_own_card, ' + '\n' +
    '  ' + listingCountExpr + ' AS listing_count, ' + '\n' +
    '  ' + buildingCountExpr + ' AS building_count, ' + '\n' +
    '  ' + childCountExpr + ' AS child_count ' + '\n' +
    'FROM ' + geoTable + ' g ' + '\n' +
    'WHERE ' + parentFilterExpr + ' ' + '\n' +
    'ORDER BY g.name'

  const c = new Client({ connectionString: connStr })
  await c.connect()
  try {
    const geoParams: any[] = [tenantId, level]
    if (parentFk && parentIdParam) geoParams.push(parentIdParam)
    const geoRes = await c.query(geoSql, geoParams)

    const rows: any[] = []
    for (const r of geoRes.rows) {
      const holderRes = await c.query(
        'SELECT resolve_geo_primary($1::text, $2::uuid, $3::uuid) AS holder_id',
        [level, r.id, tenantId]
      )
      const holderId: string | null = holderRes.rows[0]?.holder_id || null

      let holderName: string | null = null
      if (holderId) {
        const aRes = await c.query(
          'SELECT full_name FROM agents WHERE id = $1::uuid LIMIT 1',
          [holderId]
        )
        holderName = aRes.rows[0]?.full_name || null
      }

      let inheritedFromLevel: Level | null = null
      let inheritedFromId: string | null = null
      if (holderId && !r.has_own_card) {
        let cursorLevel: Level | null = PARENT_LEVEL_BY_LEVEL[level]
        let cursorId: string | null = r.parent_id
        while (cursorLevel && cursorId) {
          const cursorApaCol = APA_SCOPE_COL[cursorLevel]
          const hasSql =
            'SELECT EXISTS( ' +
            'SELECT 1 FROM agent_property_access apa ' +
            ' WHERE apa.tenant_id = $1::uuid ' +
            '   AND apa.scope = $2::text ' +
            '   AND apa.' + cursorApaCol + ' = $3::uuid ' +
            '   AND apa.agent_id = $4::uuid ' +
            '   AND apa.is_active = true ' +
            ') AS hit'
          const hasRes = await c.query(hasSql, [tenantId, cursorLevel, cursorId, holderId])
          if (hasRes.rows[0]?.hit === true) {
            inheritedFromLevel = cursorLevel
            inheritedFromId = cursorId
            break
          }
          const nextParentLevel: Level | null = PARENT_LEVEL_BY_LEVEL[cursorLevel]
          const nextParentFk = PARENT_FK_BY_LEVEL[cursorLevel]
          if (!nextParentLevel || !nextParentFk) {
            cursorLevel = null
            cursorId = null
            break
          }
          const cursorTable = TABLE_BY_LEVEL[cursorLevel]
          const parentLookup = await c.query(
            'SELECT ' + nextParentFk + ' AS pid FROM ' + cursorTable + ' WHERE id = $1::uuid LIMIT 1',
            [cursorId]
          )
          cursorLevel = nextParentLevel
          cursorId = parentLookup.rows[0]?.pid || null
        }
      }

      rows.push({
        id: r.id,
        name: r.name,
        slug: r.slug,
        level,
        parent_id: r.parent_id,
        listing_count: r.listing_count,
        building_count: r.building_count,
        child_count: r.child_count,
        has_own_card: r.has_own_card,
        primary_card_holder_agent_id: holderId,
        primary_card_holder_name: holderName,
        inherited_from_level: inheritedFromLevel,
        inherited_from_id: inheritedFromId,
      })
    }

    await c.end()
    return NextResponse.json({ rows })
  } catch (e: any) {
    await c.end().catch(() => {})
    return NextResponse.json({ error: e.message || 'query failed' }, { status: 500 })
  }
}
