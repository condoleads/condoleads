// app/api/admin-homes/listings/lookup/route.ts
// W-TERRITORY-MASTER P5: Lookup an mls_listings row by listing_key (MLS number).
//
// GET /api/admin-homes/listings/lookup?mls=X11930580
// Returns: { data: { id, listing_key, unparsed_address, property_type, ... } | null }
//
// Tenant scoping note: mls_listings has no tenant_id (it's MLS-derived data
// shared across all tenants). We still require an authenticated admin-homes
// user to access this endpoint, but we do NOT filter by tenant_id on the
// listings query itself. We DO require available_in_vow = true (the
// platform-wide visibility flag for VOW agents).

import { NextRequest, NextResponse } from 'next/server'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import { createServiceClient } from '@/lib/admin-homes/service-client'

export async function GET(request: NextRequest) {
  const user = await resolveAdminHomesUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const mls = (url.searchParams.get('mls') || '').trim()
  if (!mls) {
    return NextResponse.json({ error: 'mls parameter required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('mls_listings')
    .select(
      'id, listing_key, unparsed_address, property_type, list_price, standard_status, available_in_vow'
    )
    .eq('listing_key', mls)
    .eq('available_in_vow', true)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ data: null }, { status: 404 })
  }

  return NextResponse.json({ data })
}