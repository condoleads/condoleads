// app/api/admin-homes/tenants/[id]/geo/route.ts
// Tenant territory restriction management
// Empty = full access. Rows = restricted to these territories only.
// Platform-admin only — tenant boundaries are a platform operation.
// Phase 3.4+: auth + role checks via shared api-auth helper.

import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/admin-homes/api-auth'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requirePlatformAdmin()
  if ('error' in auth) return auth.error

  const { data, error } = await auth.supabase
    .from('tenant_property_access')
    .select('*')
    .eq('tenant_id', params.id)
    .eq('is_active', true)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ restrictions: data || [] })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requirePlatformAdmin()
  if ('error' in auth) return auth.error

  const { restrictions } = await req.json()

  // Replace all restrictions for this tenant
  await auth.supabase.from('tenant_property_access').delete().eq('tenant_id', params.id)

  if (!restrictions || restrictions.length === 0) {
    return NextResponse.json({ success: true, count: 0 })
  }

  const rows = restrictions.map((r: any) => ({
    tenant_id: params.id,
    scope: r.scope,
    area_id: r.area_id || null,
    municipality_id: r.municipality_id || null,
    community_id: r.community_id || null,
    neighbourhood_id: r.neighbourhood_id || null,
    condo_access: r.condo_access ?? true,
    homes_access: r.homes_access ?? true,
    buildings_access: r.buildings_access ?? true,
    is_active: true,
  }))

  const { error } = await auth.supabase.from('tenant_property_access').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, count: rows.length })
}