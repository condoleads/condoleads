import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const LISTING_SELECT = 'id, building_id, community_id, municipality_id, listing_id, listing_key, standard_status, transaction_type, list_price, close_price, close_date, unit_number, unparsed_address, bedrooms_total, bathrooms_total_integer, property_type, property_subtype, living_area_range, square_foot_source, parking_total, locker, association_fee, tax_annual_amount, days_on_market, listing_contract_date, building_area_total, lot_width, lot_depth, lot_size_dimensions, lot_size_area, lot_size_area_units, frontage_length, basement, garage_type, garage_yn, approximate_age, legal_stories, architectural_style, cooling, pool_features, fireplace_yn, media (id, media_url, variant_type, order_number, preferred_photo_yn)'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const geoType = searchParams.get('geoType')
  const geoId = searchParams.get('geoId')
  const tab = searchParams.get('tab') // 'for-sale' | 'for-lease' | 'sold' | 'leased'
  const page = parseInt(searchParams.get('page') || '1')
  const pageSize = parseInt(searchParams.get('pageSize') || '24')

  if (!geoType || !geoId || !tab) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const columnMap: Record<string, string> = {
    community: 'community_id',
    municipality: 'municipality_id',
    area: 'area_id',
  }
  const column = columnMap[geoType]
  if (!column) {
    return NextResponse.json({ error: 'Invalid geoType' }, { status: 400 })
  }

  const supabase = createClient()

  // Determine filters based on tab
  const isActive = tab === 'for-sale' || tab === 'for-lease'
  const transactionType = (tab === 'for-sale' || tab === 'sold') ? 'For Sale' : 'For Lease'
  const status = isActive ? 'Active' : 'Closed'
  const accessField = isActive ? 'available_in_idx' : 'available_in_vow'

  const offset = (page - 1) * pageSize

  const { data: listings, count } = await supabase
    .from('mls_listings')
    .select(LISTING_SELECT, { count: 'exact' })
    .eq(column, geoId)
    .eq('transaction_type', transactionType)
    .eq('standard_status', status)
    .eq(accessField, true)
    .order(isActive ? 'list_price' : 'close_date', { ascending: false })
    .range(offset, offset + pageSize - 1)

  const processed = (listings || []).map(listing => ({
    ...listing,
    media: (listing.media?.filter((m: any) => m.variant_type === 'thumbnail') || [])
      .sort((a: any, b: any) => (a.order_number || 999) - (b.order_number || 999))
      .slice(0, 1)
  }))

  return NextResponse.json({ listings: processed, total: count || 0 })
}