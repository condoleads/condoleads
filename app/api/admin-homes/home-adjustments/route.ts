// app/api/admin-homes/home-adjustments/route.ts
//
// v10 step 3 Phase 1: System 2 admin CRUD for the home_adjustments table.
// Mirrors the shape of app/api/admin/adjustments/route.ts (the System 1 condo
// adjustments admin) BUT with three corrections that fix the condo system's
// multi-tenant Rule Zero violation:
//
//   1. Uses createServiceClient via @/lib/admin-homes/service-client (the
//      same client every other admin-homes route uses) — required because the
//      cross-tenant guard pattern (resolveAdminHomesUser + .eq('tenant_id'))
//      is the established System 2 enforcement model.
//   2. Every query is .eq('tenant_id', user.tenantId) — application-side
//      tenant scoping (defense in depth: DB-side RLS on the table also
//      enforces auth.uid()-derived tenant_id matching).
//   3. Cross-tenant guard: POST/PUT/DELETE require body.tenant_id (when
//      provided) to match the actor's tenant_id; only platform_admin can
//      mutate cross-tenant — mirrors the pattern at app/api/admin-homes/agents/route.ts.
//
// Default-empty NO-OP: when the table has zero rows for a tenant, the matcher
// resolver falls through to DEFAULT_ADJUSTMENTS. The admin can populate rows
// one at a time; each populated value takes effect on the next estimator call.
//
// System 1 isolation: this file is /api/admin-homes/* — System 2. The legacy
// /api/admin/adjustments stays untouched (System 1 sacred per CLAUDE.md).

import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { createServiceClient } from '@/lib/admin-homes/service-client'

// Manual override columns. Mirror lib/estimator/home-adjustment-math.js:
// DEFAULT_ADJUSTMENTS price keys (lowercased + snake_case to match SQL).
// Recency bands intentionally excluded — score-only, not price-applied.
const MANUAL_COLUMNS = [
  'lot_frontage_per_foot_pct',
  'lot_frontage_max_pct',
  'lot_depth_per_10ft',
  'lot_depth_max',
  'basement_finished',
  'basement_sep_entrance',
  'basement_walkout_bonus',
  'garage_detached_single',
  'garage_attached_single',
  'garage_builtin',
  'garage_attached_double',
  'pool_inground',
  'bathroom_full',
  'bathroom_half',
  'parking_per_space',  // lease-side
] as const

// GET /api/admin-homes/home-adjustments
// Lists all home_adjustment rows for the actor's tenant + dropdown options
// (areas/munis/communities). Platform admin without a selected tenant sees
// empty list (mirrors the agents route pattern — they can use the
// platform_tenant_override cookie to scope to a specific tenant).
export async function GET() {
  const user = await resolveAdminHomesUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()

  if (!user.tenantId) {
    // Platform admin without selected tenant — empty list (consistent with
    // agents route). They must select a tenant via the override cookie.
    return NextResponse.json({
      adjustments: [],
      options: { areas: [], municipalities: [], communities: [] },
      tenantId: null,
    })
  }

  // List the tenant's adjustment rows with FK joins for display.
  const { data: rows, error } = await supabase
    .from('home_adjustments')
    .select(`
      *,
      treb_areas (id, name),
      municipalities (id, name, code),
      communities (id, name)
    `)
    .eq('tenant_id', user.tenantId)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Format with scope_level + scope_name for the UI.
  const formatted = (rows || []).map((row: any) => ({
    ...row,
    scope_level: row.community_id ? 'Community'
      : row.municipality_id ? 'Municipality'
      : row.area_id ? 'Area'
      : 'Generic',
    scope_name: row.communities?.name
      || row.municipalities?.name
      || row.treb_areas?.name
      || 'Tenant default',
  }))

  // Dropdown options for the add-row form. Tenant admins see the standard
  // geo trees (these tables are NOT tenant-scoped — geography is shared).
  const [{ data: areas }, { data: municipalities }, { data: communities }] = await Promise.all([
    supabase.from('treb_areas').select('id, name').order('name'),
    supabase.from('municipalities').select('id, name, code').order('code'),
    supabase.from('communities').select('id, name').order('name'),
  ])

  return NextResponse.json({
    adjustments: formatted,
    options: {
      areas: areas || [],
      municipalities: municipalities || [],
      communities: communities || [],
    },
    tenantId: user.tenantId,
  })
}

// POST /api/admin-homes/home-adjustments
// Create a new row for a scope. Body: { type, scope_level, scope_id,
// <overrides...> }. scope_level ∈ {generic, area, municipality, community};
// scope_id is the FK (null for generic).
export async function POST(request: NextRequest) {
  const user = await resolveAdminHomesUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Cross-tenant guard: only the actor's tenant unless platform_admin.
  // Body tenant_id is OPTIONAL — defaults to actor's tenant. If specified
  // and differs from actor's tenant, requires platform_admin.
  const body = await request.json()
  const targetTenantId: string | null = body?.tenant_id ?? user.tenantId
  if (!targetTenantId) {
    return NextResponse.json({ error: 'tenant_id required' }, { status: 400 })
  }
  if (targetTenantId !== user.tenantId && !user.isPlatformAdmin) {
    return NextResponse.json(
      { error: 'cross-tenant write requires platform_admin' },
      { status: 403 },
    )
  }

  const type = body?.type
  if (type !== 'sale' && type !== 'lease') {
    return NextResponse.json({ error: 'type must be sale or lease' }, { status: 400 })
  }

  const scopeLevel = body?.scope_level
  const scopeId: string | null = body?.scope_id ?? null
  if (!['generic', 'area', 'municipality', 'community'].includes(scopeLevel)) {
    return NextResponse.json({ error: 'scope_level invalid' }, { status: 400 })
  }
  if (scopeLevel !== 'generic' && !scopeId) {
    return NextResponse.json({ error: 'scope_id required for non-generic scope' }, { status: 400 })
  }

  // Build the insert payload. Only manual columns from the allow-list are
  // accepted; everything else from the body is silently ignored (no
  // unsafe-spread). null/undefined values stay null (don't overwrite DEFAULT).
  const insertData: Record<string, any> = {
    tenant_id: targetTenantId,
    type,
    // updated_by intentionally null — AdminHomesUser doesn't expose the
    // supabase auth.uid() directly; adding it is a follow-up touching the
    // shared auth shape. Audit who-edited via created_at / updated_at + email
    // resolution at display time for now.
  }
  if (scopeLevel === 'area') insertData.area_id = scopeId
  else if (scopeLevel === 'municipality') insertData.municipality_id = scopeId
  else if (scopeLevel === 'community') insertData.community_id = scopeId
  // generic: leave all FKs null

  for (const col of MANUAL_COLUMNS) {
    const v = body?.[col]
    if (v !== undefined && v !== null && v !== '') {
      const n = Number(v)
      if (!Number.isFinite(n)) {
        return NextResponse.json({ error: `${col} must be numeric` }, { status: 400 })
      }
      insertData[col] = n
    }
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('home_adjustments')
    .insert(insertData)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true, adjustment: data })
}

// PUT /api/admin-homes/home-adjustments
// Update an existing row by id. Body: { id, <overrides...> }. Scope FKs +
// tenant_id are NOT settable via update (immutable per row identity).
export async function PUT(request: NextRequest) {
  const user = await resolveAdminHomesUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const id = body?.id
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Cross-tenant guard: verify the row belongs to the actor's tenant.
  const { data: row, error: lookupErr } = await supabase
    .from('home_adjustments')
    .select('tenant_id')
    .eq('id', id)
    .single()
  if (lookupErr || !row) {
    return NextResponse.json({ error: 'row not found' }, { status: 404 })
  }
  if (row.tenant_id !== user.tenantId && !user.isPlatformAdmin) {
    return NextResponse.json(
      { error: 'cross-tenant update requires platform_admin' },
      { status: 403 },
    )
  }

  // Build update payload. Null/undefined explicitly RESETS that column to
  // null (= falls back to DEFAULT_ADJUSTMENTS at resolve time). This is the
  // reset-to-default behavior.
  const updateData: Record<string, any> = {
    // updated_by intentionally null — AdminHomesUser doesn't expose the
    // supabase auth.uid() directly; adding it is a follow-up touching the
    // shared auth shape. Audit who-edited via created_at / updated_at + email
    // resolution at display time for now.
  }
  for (const col of MANUAL_COLUMNS) {
    if (col in body) {
      const v = body[col]
      if (v === null || v === '') {
        updateData[col] = null
      } else {
        const n = Number(v)
        if (!Number.isFinite(n)) {
          return NextResponse.json({ error: `${col} must be numeric` }, { status: 400 })
        }
        updateData[col] = n
      }
    }
  }

  const { data, error } = await supabase
    .from('home_adjustments')
    .update(updateData)
    .eq('id', id)
    .eq('tenant_id', user.tenantId)  // defense-in-depth: even if id is forged, scope still narrows
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true, adjustment: data })
}

// DELETE /api/admin-homes/home-adjustments?id=<uuid>
// Delete a row. Mirrors the condo pattern: tenant-generic row is undeletable
// (operator can null all columns to effectively reset, but the generic row
// itself stays as a touchpoint for the audit log + future overrides).
export async function DELETE(request: NextRequest) {
  const user = await resolveAdminHomesUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data: row, error: lookupErr } = await supabase
    .from('home_adjustments')
    .select('tenant_id, area_id, municipality_id, community_id')
    .eq('id', id)
    .single()
  if (lookupErr || !row) {
    return NextResponse.json({ error: 'row not found' }, { status: 404 })
  }
  if (row.tenant_id !== user.tenantId && !user.isPlatformAdmin) {
    return NextResponse.json(
      { error: 'cross-tenant delete requires platform_admin' },
      { status: 403 },
    )
  }
  if (!row.area_id && !row.municipality_id && !row.community_id) {
    return NextResponse.json(
      { error: 'cannot delete tenant-generic row; update it to reset' },
      { status: 400 },
    )
  }

  const { error } = await supabase
    .from('home_adjustments')
    .delete()
    .eq('id', id)
    .eq('tenant_id', user.tenantId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
