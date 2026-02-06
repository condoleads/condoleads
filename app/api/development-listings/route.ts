import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const developmentId = searchParams.get('developmentId')
  const type = searchParams.get('type') // 'sold' or 'leased'

  if (!developmentId || !type) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const supabase = createClient()

  // Get building IDs for this development
  const { data: buildings } = await supabase
    .from('buildings')
    .select('id, slug')
    .eq('development_id', developmentId)

  if (!buildings || buildings.length === 0) {
    return NextResponse.json({ listings: [] })
  }

  const buildingIds = buildings.map(b => b.id)
  const buildingSlugMap = new Map(buildings.map(b => [b.id, b.slug]))

  // Determine filter
  const transactionType = type === 'sold' ? 'For Sale' : 'For Lease'

  const { data: listings } = await supabase
    .from('mls_listings')
    .select('id, building_id, listing_id, listing_key, standard_status, transaction_type, list_price, close_price, unit_number, unparsed_address, bedrooms_total, bathrooms_total_integer, property_type, living_area_range, square_foot_source, parking_total, locker, association_fee, tax_annual_amount, days_on_market, listing_contract_date, media (id, media_url, variant_type, order_number, preferred_photo_yn)')
    .in('building_id', buildingIds)
    .eq('transaction_type', transactionType)
    .eq('standard_status', 'Closed')
    .order('list_price', { ascending: false })

  // Add building_slug and filter media to thumbnails
  const processed = (listings || []).map(listing => ({
    ...listing,
    building_slug: buildingSlugMap.get(listing.building_id) || '',
    media: (listing.media?.filter((m: any) => m.variant_type === 'thumbnail') || [])
      .sort((a: any, b: any) => (a.order_number || 999) - (b.order_number || 999))
      .slice(0, 1)
  }))

  return NextResponse.json({ listings: processed })
}