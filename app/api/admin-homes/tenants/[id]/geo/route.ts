// app/api/admin-homes/tenants/[id]/geo/route.ts
// Tenant territory restriction management
// Empty = full access. Rows = restricted to these territories only.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('tenant_property_access')
    .select('*')
    .eq('tenant_id', params.id)
    .eq('is_active', true)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ restrictions: data || [] })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServiceClient()
  const { restrictions } = await req.json()

  // Replace all restrictions for this tenant
  await supabase.from('tenant_property_access').delete().eq('tenant_id', params.id)

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

  const { error } = await supabase.from('tenant_property_access').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, count: rows.length })
}